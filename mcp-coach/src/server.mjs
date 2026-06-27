// Zero-dependency stdio MCP server for the workshop coach. This is the protocol
// spine: it speaks newline-delimited JSON-RPC 2.0 over stdin/stdout and dispatches
// each message to a handler. Later phases register real tools into `tools`; this
// phase ships the registry empty and proves the full framing path
// (`initialize` -> `tools/list` -> `tools/call`) with a smoke test.
//
// Transport rules (the things that must never drift):
//   - stdin arrives in arbitrary chunks: buffer until a `\n`, parse each complete
//     line as one JSON-RPC message, keep any trailing partial in the buffer.
//   - Notifications (a message with no `id`) get NO response, ever.
//   - stdout is the protocol channel: it must carry only compact JSON lines.
//     Every diagnostic goes to stderr.
//
// Pattern followed: skills/coach-checkin/scripts/submit.mjs — named exports, sync
// fs, the `import.meta.url` run-guard, loud-on-defect / graceful-on-operational
// error handling.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Board-layer delegation target. The check-in tools are thin adapters over this
// already-tested skill script — no board logic (validation, consent guard,
// retry, outbox, marker) is reimplemented here.
import {
  detect,
  submit,
  submitScore,
  QUESTION_KEYS,
  QUESTION_PROMPTS,
  ROLE_PROMPT,
} from '../../skills/coach-checkin/scripts/submit.mjs';

// Navigation-layer collaborators (Phase 4). `state.mjs` owns the progress side of
// the shared marker (read + checkpoint transitions); `blocks.mjs` is the
// four-block guidance data + the `nextBlock` advance helper.
import { readState, recordCheckpoint, writeProgress } from './state.mjs';
import { BLOCKS, nextBlock } from './blocks.mjs';

// Engine-layer collaborators (Plan 3). The adapter composes the native engine
// (scan -> score -> recommend) and owns the scan-backed gate; renderCard turns
// raw signals into the shareable HTML card. These import the LIBRARY functions —
// never native/src/cli.mjs's run(), which writes to stdout and would corrupt the
// protocol stream.
import { coachScan, nextStep, gateResult, GATE_THRESHOLD } from './engine.mjs';
import { renderCard } from '../../native/src/card.mjs';
import { score } from '../../native/src/score.mjs';

const PROTOCOL_VERSION = '2025-06-18'; // pinned fallback when the client omits one
const SERVER_INFO = { name: 'aie-coach', version: '1.0.0' };

// JSON-RPC error codes used by this server.
const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// A protocol-level error a handler can throw to map to a specific JSON-RPC code.
// Tool-handler *exceptions* are NOT RpcErrors — they become an isError result
// (see handleToolsCall); RpcError is for invalid-params / bad-request shapes.
export class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
  }
}

// Tool registry — populated by later phases. name -> { schema, handler }.
// `schema` is the tool descriptor returned by tools/list; `handler(args)` runs
// the tool and returns a JSON-serializable result (or throws to signal failure).
export const tools = new Map();

// --- board-layer tools (Phase 2) -----------------------------------------
// Two thin adapters over submit.mjs. `coach_checkin` reads the marker via
// detect() and returns the ordered questions; `coach_submit_checkin` delegates
// straight to submit() and surfaces its result (or a structured validation
// error) verbatim. The consent guard, retry, outbox, and marker write all live
// in submit.mjs and are untouched here.

// coach_checkin: return the phase and its ordered questions. Reads state only;
// never sends anything.
tools.set('coach_checkin', {
  schema: {
    name: 'coach_checkin',
    description: "Return the ordered check-in questions for the attendee's current phase (pre/post).",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  handler: () => {
    const d = detect(); // { phase:'pre' } | { phase:'post', participantId, role }
    const keys = QUESTION_KEYS[d.phase]; // pre: [time_sink,friction,goal]; post: [built,next]
    return {
      phase: d.phase,
      // pre needs the role asked; post reuses the marker's role (per detect()).
      needsRole: d.phase === 'pre',
      rolePrompt: d.phase === 'pre' ? ROLE_PROMPT : undefined,
      questions: keys.map((k) => ({ questionKey: k, prompt: QUESTION_PROMPTS[k] })),
    };
  },
});

// coach_submit_checkin: submit confirmed answers via submit(). submit() validates
// BEFORE the consent guard, so malformed answers throw regardless of `confirmed`.
// Catch that here and return a structured error Claude can re-collect from — do
// not let it become a transport crash. The consent guard itself is untouched:
// `confirmed !== true` returns { sent:false, reason:'unconfirmed' } from submit().
tools.set('coach_submit_checkin', {
  schema: {
    name: 'coach_submit_checkin',
    description: 'Submit confirmed check-in answers. Honors the consent guard; never sends without confirmed===true.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        answers: { type: 'object' }, // { <questionKey>: <answer> }
        confirmed: { type: 'boolean' },
      },
      required: ['answers', 'confirmed'],
      additionalProperties: false,
    },
  },
  handler: async ({ role, answers, confirmed }) => {
    try {
      return await submit({ role, answers, confirmed });
      //  -> { sent:true, phase, participantId }
      //  -> { sent:false, phase, participantId, outbox }
      //  -> { sent:false, reason:'unconfirmed' }
    } catch (err) {
      return {
        error: 'invalid_answers',
        detail: String(err?.message ?? err),
        schemaErrors: err?.schemaErrors ?? null,
      };
    }
  },
});

// --- navigation-layer tools (Phase 4) ------------------------------------
// The "where am I / what's next" layer. `coach_status` composes identity+phase
// (detect) with progress (readState) into a read-only answer; `coach_checkpoint`
// records a block done, advances, and returns the next block's guidance. Both
// reuse the shared marker via state.mjs — no progress logic is reimplemented.

// Pick the single most useful next action for the attendee. Priority order:
//   1. No participantId (detect() returns it only in `post`, i.e. they haven't
//      done the opening check-in yet) -> point at the opening check-in.
//   2. All four blocks done -> point at the closing check-in.
//   3. Otherwise -> the current block's first action (default to Block 1).
// Advisory only: `blocksDone` is the authoritative progress record; this is a hint.
export function nextActionFor(d, currentBlock, blocksDone) {
  if (!d.participantId) return 'Run your opening check-in';
  const allDone = [1, 2, 3, 4].every((n) => blocksDone.includes(n));
  if (allDone) return 'Run your closing check-in';
  const block = currentBlock ?? 1;
  return `Block ${block}: ${BLOCKS[block - 1].firstAction}`;
}

// coach_status: read-only "where am I". Composes phase/identity with progress.
tools.set('coach_status', {
  schema: {
    name: 'coach_status',
    description: 'Return where the attendee is: phase, current block, blocks done, and the next action.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  handler: () => {
    const d = detect(); // { phase:'pre' } | { phase:'post', participantId, role }
    const { currentBlock = null, blocksDone = [] } = readState();
    return {
      phase: d.phase,
      participantId: d.participantId,
      role: d.role,
      currentBlock,
      blocksDone,
      nextAction: nextActionFor(d, currentBlock, blocksDone),
    };
  },
});

// coach_checkpoint: "done with this block." Records it, advances, congratulates,
// and returns the next block's guidance. `block` is constrained 1-4 by the input
// schema, so out-of-range never reaches the handler. Block-1 carries a SOFT nudge
// (not a hard gate): the checkpoint always records and advances, but if the
// attendee hasn't done the opening check-in (detect() phase is 'pre', no
// participantId) it adds an advisory `nudge` so Claude can prompt them — this is
// the one behavioral nuance from the design review (Block-1 done gates on the
// opening check-in, the board money shot) reconciled with "checkpoints must be
// skippable."
tools.set('coach_checkpoint', {
  schema: {
    name: 'coach_checkpoint',
    description: "Mark a block done; advance and return the next block's goal + first action.",
    inputSchema: {
      type: 'object',
      properties: { block: { type: 'integer', minimum: 1, maximum: 4 } },
      required: ['block'],
      additionalProperties: false,
    },
  },
  handler: ({ block }) => {
    recordCheckpoint(block);
    const done = block === 4;
    const next = nextBlock(block);
    const res = {
      congrats: `Nice — Block ${block} (${BLOCKS[block - 1].title}) done.`,
      done,
      nextBlock: next
        ? { n: next.n, title: next.title, goal: next.goal, firstAction: next.firstAction, doneWhen: next.doneWhen }
        : undefined,
    };
    // Block-1 gates on the opening check-in (soft): nudge if not checked in.
    if (block === 1 && detect().phase === 'pre') {
      res.nudge = 'Before moving on, run your opening check-in so your workflow lands on the board.';
    }
    if (done) res.closing = 'Last one — run your closing check-in to put a number on the board.';
    return res;
  },
});

// --- engine-layer tools (Plan 3) -----------------------------------------
// The guided-coach surface over the deterministic engine. coach_scan runs the
// full scan->score->recommend report; coach_next hands back the single next step;
// coach_gate RE-SCANS and advances only if the pillar's machinery is now actually
// on disk (no flag can fake it); coach_card renders the before/after card from the
// stored opening scan + a fresh scan. Advancement + the opening baseline persist
// through the shared marker via state.mjs (read-merge-write; identity/progress
// fields are untouched).

// coach_scan: full report. The first scan with no stored baseline records the
// opening signals + score so the closing card has a real before. Subsequent scans
// leave the baseline alone (firstScan:false).
tools.set('coach_scan', {
  schema: {
    name: 'coach_scan',
    description: 'Scan the local AI-native setup and return the report: signals, per-pillar scores, total, recommendations, and observed waste.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  handler: () => {
    const report = coachScan(); // { signals, pillars, total, recommendations, observations }
    const { openingSignals } = readState();
    let firstScan = false;
    if (!openingSignals) {
      // Persist the opening baseline once. Extra marker fields are invisible to
      // detect() (it keys only off participantId), so this never disturbs the
      // check-in identity or block progress.
      writeProgress({ openingSignals: report.signals, scoreBefore: report.total });
      firstScan = true;
    }
    return { ...report, firstScan };
  },
});

// coach_next: the single next step for the weakest sub-threshold pillar. Returns a
// done sentinel when every pillar already clears the bar ("you're good here").
tools.set('coach_next', {
  schema: {
    name: 'coach_next',
    description: 'Return the single next step to act on now: the weakest pillar below the bar, its action, and its current sub-score.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  handler: () => {
    const step = nextStep();
    if (step === null) {
      return { done: true, message: "Every pillar clears the bar — you're AI-native. Run coach_card." };
    }
    return step; // { pillar, action, basis, subScore }
  },
});

// coach_gate: the scan-backed gate. RE-SCANS via the engine and advances ONLY if
// the pillar's fresh sub-score crossed the threshold. `pillar` is constrained to
// the five ids by the schema enum, so a bad id never reaches the handler. On pass,
// the pillar is recorded into pillarsPassed (Set-dedup) on the shared marker.
tools.set('coach_gate', {
  schema: {
    name: 'coach_gate',
    description: 'Re-scan and decide whether a pillar is now actually present. Advances ONLY if the fresh scan sees it — it cannot be faked by a flag.',
    inputSchema: {
      type: 'object',
      properties: {
        pillar: {
          type: 'string',
          enum: ['verification', 'automation', 'context', 'orchestration', 'delegation'],
        },
      },
      required: ['pillar'],
      additionalProperties: false,
    },
  },
  handler: ({ pillar }) => {
    const gate = gateResult(pillar); // { pillar, subScore, threshold, passed } — re-scans
    if (!gate.passed) {
      return {
        ...gate,
        advanced: false,
        hint: `Not there yet — a fresh scan still scores ${pillar} at ${gate.subScore} (need >= ${GATE_THRESHOLD}). Install the machinery, then gate again.`,
      };
    }
    // Record the pass on the shared marker (Set-dedup, stable order).
    const { pillarsPassed = [] } = readState();
    const merged = [...new Set([...pillarsPassed, pillar])].sort();
    writeProgress({ pillarsPassed: merged });
    return { ...gate, advanced: true, pillarsPassed: merged };
  },
});

// coach_card: render the before/after card. `before` is the stored opening scan
// (falling back to a fresh scan if coach_scan was never run); `after` is a fresh
// scan now. renderCard takes RAW signals and scores them internally.
tools.set('coach_card', {
  schema: {
    name: 'coach_card',
    description: 'Render the self-contained before/after AI-Native card (HTML) from the stored opening scan and a fresh scan.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    },
  },
  handler: ({ name = 'You' } = {}) => {
    const after = coachScan().signals;            // fresh scan now
    const { openingSignals } = readState();
    const before = openingSignals ?? after;       // no baseline -> delta is 0
    const html = renderCard({ before, after, name });
    return {
      html,
      scoreBefore: score(before).total,
      scoreAfter: score(after).total,
      delta: score(after).total - score(before).total,
    };
  },
});

// coach_submit_score: opt-in, consent-gated send of the attendee's AI-Native
// before->after to the board. Sources before from the stored opening baseline
// (openingSignals) and after from a FRESH scan now — never raw signals. Refuses
// (structured, not a throw) when there is no real opening baseline, so a
// never-scanned attendee can't post a phantom 0->0. Identity (participantId)
// comes from the marker via detect(); the score rides submitScore()'s consent
// gate + retry + outbox unchanged.
tools.set('coach_submit_score', {
  schema: {
    name: 'coach_submit_score',
    description:
      "Opt-in: POST the attendee's AI-Native before->after score to the board. " +
      'Consent-gated (never sends without confirmed===true); sources the score from the coach, never a live scan of raw signals.',
    inputSchema: {
      type: 'object',
      properties: { confirmed: { type: 'boolean' }, name: { type: 'string' } },
      required: ['confirmed'],
      additionalProperties: false,
    },
  },
  handler: async ({ confirmed }) => {
    // Gate FIRST: on an unconfirmed call do NO local work at all — not even a
    // local scan runs before consent. submitScore re-checks the same gate, so
    // this is defense-in-depth, not the only guard.
    if (confirmed !== true) return { sent: false, reason: 'unconfirmed' };
    const d = detect(); // identity comes from the marker, never from args
    if (!d.participantId) {
      return { sent: false, reason: 'no_checkin', message: 'Run your opening check-in first so you have an identity on the board.' };
    }
    const { openingSignals, pillarsPassed = [] } = readState();
    if (!openingSignals) {
      return { sent: false, reason: 'no_baseline', message: 'No opening scan on record — run coach_scan at the start so there is a real before.' };
    }
    const before = score(openingSignals).total;     // stored baseline
    const after = score(coachScan().signals).total; // fresh scan now
    return submitScore({ participantId: d.participantId, before, after, pillarsPassed, confirmed });
    //  -> { sent:true, participantId } | { sent:false, reason:'unconfirmed' } | { sent:false, participantId, outbox }
  },
});

// --- framing -------------------------------------------------------------

export function frame(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

export function frameError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// --- method handlers -----------------------------------------------------

function handleInitialize(params) {
  return {
    // Echo the client's protocolVersion for max compatibility; pin otherwise.
    protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  };
}

function handleToolsList() {
  return { tools: [...tools.values()].map((t) => t.schema) };
}

async function handleToolsCall(params) {
  const entry = tools.get(params?.name);
  // Unknown tool is a protocol-level invalid-params error, distinct from a tool
  // that runs and fails (which is a readable isError result below).
  if (!entry) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${params?.name}`);
  try {
    const result = await entry.handler(params?.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    // Tool-level failure is a result the model can read and recover from, not a
    // transport error that would desync the client.
    return { content: [{ type: 'text', text: String(err?.message ?? err) }], isError: true };
  }
}

// Dispatch table. A handler returns a `result` object (sent framed) or throws an
// RpcError. The notification entry returns undefined and writes nothing.
const METHODS = {
  initialize: handleInitialize,
  'notifications/initialized': () => undefined, // notification: no reply
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
};

// --- dispatch ------------------------------------------------------------

// Handle one already-parsed message. Returns the framed response string, or null
// when nothing should be written (notifications). Throwing is not expected here —
// handler errors are caught and framed.
async function dispatch(msg) {
  const { id, method } = msg;
  // A message with no `id` is a notification: run any side effect, write nothing.
  const isNotification = id === undefined || id === null;

  const handler = METHODS[method];
  if (!handler) {
    if (isNotification) return null; // an unknown notification is simply ignored
    return frameError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }

  try {
    const result = await handler(msg.params);
    if (isNotification) return null; // never reply to a notification
    return frame(id, result);
  } catch (err) {
    if (isNotification) return null;
    if (err instanceof RpcError) return frameError(id, err.code, err.message);
    return frameError(id, INTERNAL_ERROR, String(err?.message ?? err));
  }
}

// Process one raw stdin line. Empty/whitespace-only lines are skipped (they are
// framing artifacts, not messages). A non-JSON line is a parse error framed with
// a null id, since the request id is unknowable. Writes responses via `write`.
async function handleLine(line, write) {
  if (line.trim() === '') return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write(frameError(null, PARSE_ERROR, 'Parse error'));
    return;
  }
  const response = await dispatch(msg);
  if (response !== null) write(response);
}

// Wire stdin -> line framing -> dispatch -> stdout. Buffers until each `\n`,
// retaining a trailing partial line across chunks. `write` appends the newline
// framing so callers pass bare JSON strings.
export function startServer({ input = process.stdin, output = process.stdout } = {}) {
  const write = (line) => output.write(line + '\n');
  let buffer = '';
  // Serialize line handling so out-of-order async dispatch can't interleave
  // writes or process a later line before an earlier one resolves.
  let chain = Promise.resolve();

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      chain = chain.then(() => handleLine(line, write));
    }
  });
  input.on('end', () => {
    // Flush any trailing line that arrived without a closing newline.
    if (buffer.length > 0) {
      const line = buffer;
      buffer = '';
      chain = chain.then(() => handleLine(line, write));
    }
  });

  return write;
}

// On startup, verify the process was launched from the repo root. submit.mjs (which
// later phases delegate to) resolves the marker/outbox against process.cwd(), so a
// wrong cwd would silently write shared state to the wrong place. Warn loudly to
// stderr — a dead server is worse than a warning, so do NOT exit.
export function assertCwd() {
  const anchor = join(process.cwd(), 'skills', 'coach-checkin', 'scripts', 'submit.mjs');
  if (!existsSync(anchor)) {
    process.stderr.write(
      `[aie-coach] WARNING: cwd ${process.cwd()} does not look like the repo root; ` +
        `marker/outbox will be written here and may not match the coach-checkin skill.\n`,
    );
  }
}

// Run only when invoked directly, not when imported by tests.
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  assertCwd();
  startServer();
}
