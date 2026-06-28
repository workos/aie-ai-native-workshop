// Smoke harness for the stdio JSON-RPC MCP server. Drives the server's *real*
// stdio — no mocks: spawn `bun server.ts`, write newline-delimited JSON-RPC
// requests to its stdin, collect the framed JSON lines it writes to stdout, and
// assert the parsed responses. This proves the framing path end-to-end:
// `initialize` -> `tools/list` -> `tools/call`, plus the transport edge cases
// (split/coalesced messages, malformed lines, notifications) that are the most
// common bugs in a hand-rolled line protocol.

import { test, describe, expect } from "bun:test";
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A parsed JSON-RPC line off the server's framed stdout. `JSON.parse` is `any`,
// so annotating the parsed shape here is what gives the .map/.find callbacks a
// real parameter type instead of an implicit any.
interface RpcLine {
  jsonrpc?: string;
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string };
}

// A tool descriptor as surfaced by tools/list (the subset the smoke tests read).
interface ListedTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    additionalProperties: boolean;
    required?: string[];
    properties?: Record<string, any>;
  };
}

// A surfaced check-in question (coach_checkin result item).
interface CheckinQuestion {
  questionKey: string;
  prompt: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// The coach now boots through the unified CLI entry: `bun native/src/cli.ts --mcp`
// dispatches to startServer() (the way `sessions --mcp` works). Repo root is three
// levels up from native/src/coach — the server asserts it was launched from here,
// so spawn with this cwd to keep stderr clean.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const CLI = join(REPO_ROOT, 'native', 'src', 'cli.ts');

// Spawn the server, write `requests` (array of objects -> compact JSON lines),
// close stdin, and resolve once the child exits with { lines, stderr, code }.
// `lines` is stdout split on newlines (blank trailing entry dropped). Closing
// stdin is what ends the server's read loop, so every harness call terminates.
function run(requests: any[], { cwd = REPO_ROOT, env }: { cwd?: string; env?: Record<string, string> } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [CLI, '--mcp'], {
      cwd,
      // Merge any overrides (e.g. WORKER_URL) onto the inherited env so the
      // check-in tools delegate to submit.ts against a local stub, not the
      // real board.
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout!.setEncoding('utf8');
    child.stderr!.setEncoding('utf8');
    child.stdout!.on('data', (c) => {
      out += c;
    });
    child.stderr!.on('data', (c) => {
      err += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = out.split('\n').filter((l) => l !== '');
      resolve({ lines, stderr: err, code });
    });

    for (const req of requests) {
      // A pre-framed raw string (for the malformed-line case) is written as-is;
      // everything else is serialized to one compact line.
      child.stdin!.write(typeof req === 'string' ? req : JSON.stringify(req) + '\n');
    }
    child.stdin!.end();
  });
}

const init = (id = 1, params = {}) => ({ jsonrpc: '2.0', id, method: 'initialize', params });

describe('handshake', () => {
  test('initialize returns a framed result echoing the id', async () => {
    const { lines } = await run([init(1, { protocolVersion: '2025-06-18' })]);
    expect(lines.length).toBe(1);

    const msg = JSON.parse(lines[0]);
    expect(msg.jsonrpc).toBe('2.0');
    expect(msg.id).toBe(1);
    expect(msg.result).toBeTruthy();
    expect(msg.result.protocolVersion).toBe('2025-06-18');
    expect(msg.result.capabilities.tools).toBeTruthy();
    expect(msg.result.serverInfo.name).toBe('aie-coach');
    expect(msg.result.serverInfo.version).toBeTruthy();
  });

  test('initialize pins a fallback protocolVersion when the client omits it', async () => {
    const { lines } = await run([init(7, {})]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(7);
    expect(typeof msg.result.protocolVersion).toBe('string');
    expect(msg.result.protocolVersion.length > 0).toBe(true);
  });

  test('a notification (no id) produces no response line', async () => {
    const { lines } = await run([
      init(1),
      { jsonrpc: '2.0', method: 'notifications/initialized' }, // notification: no id
    ]);
    // Only the initialize reply — the notification is silent.
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).id).toBe(1);
  });

  test('two messages in one stdin write produce two correlated responses', async () => {
    // Both messages are delivered in a single write (coalesced on one chunk),
    // separated only by the newline framing.
    const raw =
      JSON.stringify(init(1)) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
    const { lines } = await run([raw]);

    expect(lines.length).toBe(2);
    const ids = lines.map((l: string) => JSON.parse(l).id).sort();
    expect(ids).toEqual([1, 2]);
  });

  test('a non-JSON line yields a framed -32700 parse error and the loop survives', async () => {
    const { lines } = await run([
      'this is not json\n', // malformed line
      init(2), // a valid message after the bad one
    ]);

    // The parse error response (id null) plus the later valid initialize reply.
    expect(lines.length).toBe(2);
    const parsed = lines.map((l: string) => JSON.parse(l) as RpcLine);
    const parseErr = parsed.find((m: RpcLine) => m.error && m.error.code === -32700);
    expect(parseErr).toBeTruthy();
    expect(parseErr!.id).toBe(null);
    expect(
      parsed.find((m: RpcLine) => m.id === 2 && m.result),
    ).toBeTruthy();
  });

  test('stdout carries only JSON; diagnostics go to stderr', async () => {
    const { lines } = await run([init(1)]);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('tools/list', () => {
  test('returns a correlated array result', async () => {
    // Framing contract only — the exact tool set is asserted by `tools/list mvp`.
    const { lines } = await run([{ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(3);
    expect(Array.isArray(msg.result.tools)).toBeTruthy();
  });
});

describe('tools/call', () => {
  test('an unknown tool name yields a framed -32602 error', async () => {
    const { lines } = await run([
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } },
    ]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(4);
    expect(msg.error).toBeTruthy();
    expect(msg.error.code).toBe(-32602);
    expect(msg.error.message).toMatch(/nope/);
  });
});

describe('dispatch', () => {
  test('an unknown method yields a framed -32601 error', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 5, method: 'does/not/exist', params: {} }]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(5);
    expect(msg.error.code).toBe(-32601);
  });
});

describe('startup', () => {
  test('warns to stderr (not stdout) when launched outside the repo root', async () => {
    const { lines, stderr } = await run([init(1)], { cwd: __dirname }); // native/src/coach is not the root
    expect(stderr).toMatch(/WARNING/);
    // The warning must not leak into the protocol channel.
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).result).toBeTruthy();
  });
});

// --- Phase 2: board-layer check-in tools ---------------------------------

// Build a tools/call request for `name` with `args`.
const call = (id: number, name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

// Find the response with `id` in the framed stdout lines and parse the tool
// result out of its content[0].text (the server JSON-stringifies tool results).
function toolResult(lines: string[], id: number) {
  const msg = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
  expect(msg).toBeTruthy();
  expect(msg.result).toBeTruthy();
  return { parsed: JSON.parse(msg.result.content[0].text), isError: msg.result.isError === true };
}

// A fresh temp dir to use as the server's cwd so marker/outbox writes are
// isolated from the repo. Returns the path.
function freshCwd() {
  return mkdtempSync(join(tmpdir(), 'coach-srv-'));
}

describe('tools/list mvp', () => {
  test('exposes the two board-layer tools with valid schemas', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(10);

    const names = (msg.result.tools as ListedTool[]).map((t) => t.name);
    // The two board-layer tools must be present with valid schemas. (The exact
    // four-tool set is asserted by `tools/list full` once Phase 4 lands the
    // navigation tools.)
    expect(names.includes('coach_checkin')).toBeTruthy();
    expect(names.includes('coach_submit_checkin')).toBeTruthy();

    for (const t of msg.result.tools as ListedTool[]) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length > 0).toBeTruthy();
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.additionalProperties).toBe(false);
    }

    const submitTool = (msg.result.tools as ListedTool[]).find((t) => t.name === 'coach_submit_checkin')!;
    expect(submitTool.inputSchema.required).toEqual(['answers', 'confirmed']);
  });
});

// --- Phase 4: navigation-layer guidance tools ----------------------------

describe('tools/list full', () => {
  test('exposes all nine tools after the engine layer lands', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    expect(msg.id).toBe(11);

    const names = (msg.result.tools as ListedTool[]).map((t) => t.name).sort();
    expect(names).toEqual(
      ['coach_card', 'coach_checkin', 'coach_checkpoint', 'coach_gate', 'coach_next', 'coach_scan', 'coach_status', 'coach_submit_checkin', 'coach_submit_score'],
    );

    // The two navigation tools carry valid object schemas too.
    const status = (msg.result.tools as ListedTool[]).find((t) => t.name === 'coach_status')!;
    const checkpoint = (msg.result.tools as ListedTool[]).find((t) => t.name === 'coach_checkpoint')!;
    expect(status.inputSchema.type).toBe('object');
    expect(status.inputSchema.additionalProperties).toBe(false);
    expect(checkpoint.inputSchema.required).toEqual(['block']);
    expect(checkpoint.inputSchema.properties!.block.minimum).toBe(1);
    expect(checkpoint.inputSchema.properties!.block.maximum).toBe(4);
  });
});

describe('coach_status', () => {
  test('fresh marker (pre): no participantId, currentBlock null, nextAction is the opening check-in', async () => {
    const cwd = freshCwd(); // no marker -> detect() returns { phase:'pre' }
    const { lines } = await run([call(1, 'coach_status')], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    expect(isError).toBe(false);
    expect(parsed.phase).toBe('pre');
    expect(parsed.participantId).toBe(undefined);
    expect(parsed.currentBlock).toBe(null);
    expect(parsed.blocksDone).toEqual([]);
    expect(parsed.nextAction).toMatch(/opening check-in/i);
  });

  test('after two checkpoints: blocksDone [1,2] and a sensible block-3 nextAction', async () => {
    const cwd = freshCwd();
    // Seed a participantId so status is past the opening-check-in branch and the
    // first-action hint (not the opening check-in) is exercised.
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'Backend / Go', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run(
      [call(1, 'coach_checkpoint', { block: 1 }), call(2, 'coach_checkpoint', { block: 2 }), call(3, 'coach_status')],
      { cwd },
    );
    const { parsed } = toolResult(lines, 3);

    expect(parsed.phase).toBe('post');
    expect(parsed.blocksDone).toEqual([1, 2]);
    expect(parsed.currentBlock).toBe(3);
    expect(parsed.nextAction).toMatch(/Block 3/);
    expect(parsed.nextAction).toMatch(/lint\/typecheck\/test hook/);
  });
});

describe('coach_checkpoint', () => {
  test('block 1 with no participantId: congrats, advances to block 2, AND a soft nudge', async () => {
    const cwd = freshCwd(); // no marker -> pre -> no participantId
    const { lines } = await run([call(1, 'coach_checkpoint', { block: 1 })], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    expect(isError).toBe(false);
    expect(parsed.congrats).toMatch(/Block 1/);
    expect(parsed.done).toBe(false);
    expect(parsed.nextBlock.n).toBe(2);
    expect(parsed.nextBlock.goal && parsed.nextBlock.firstAction && parsed.nextBlock.doneWhen).toBeTruthy();
    expect(parsed.nudge).toBeTruthy();
    expect(parsed.nudge).toMatch(/opening check-in/i);
  });

  test('block 1 WITH a participantId: no nudge', async () => {
    const cwd = freshCwd();
    // Fabricate a pre marker so detect() reports post (has participantId).
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'PM', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run([call(2, 'coach_checkpoint', { block: 1 })], { cwd });
    const { parsed } = toolResult(lines, 2);

    expect(parsed.nextBlock.n).toBe(2);
    expect(parsed.nudge).toBe(undefined);
  });

  test('block 4: done true, no nextBlock, a closing-check-in prompt', async () => {
    const cwd = freshCwd();
    const { lines } = await run([call(3, 'coach_checkpoint', { block: 4 })], { cwd });
    const { parsed } = toolResult(lines, 3);

    expect(parsed.done).toBe(true);
    expect(parsed.nextBlock).toBe(undefined);
    expect(parsed.closing).toBeTruthy();
    expect(parsed.closing).toMatch(/closing check-in/i);
  });

  test('the recorded block survives into coach_status (shared marker)', async () => {
    const cwd = freshCwd();
    const { lines } = await run([call(1, 'coach_checkpoint', { block: 1 }), call(2, 'coach_status')], { cwd });
    const { parsed } = toolResult(lines, 2);
    expect(parsed.blocksDone).toEqual([1]);
    expect(parsed.currentBlock).toBe(2);
  });
});

describe('coach_checkin', () => {
  test('pre phase: needsRole and the three opening questions with prompts', async () => {
    const cwd = freshCwd(); // no marker -> pre
    const { lines } = await run([call(1, 'coach_checkin')], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    expect(isError).toBe(false);
    expect(parsed.phase).toBe('pre');
    expect(parsed.needsRole).toBe(true);
    expect(parsed.rolePrompt && parsed.rolePrompt.length > 0).toBeTruthy();

    expect(
      (parsed.questions as CheckinQuestion[]).map((q) => q.questionKey),
    ).toEqual(['time_sink', 'friction', 'goal']);
    for (const q of parsed.questions as CheckinQuestion[]) {
      expect(q.prompt && q.prompt.length > 0).toBeTruthy();
    }
  });

  test('post phase (marker has participantId): no role, the two closing questions', async () => {
    const cwd = freshCwd();
    // Fabricate a pre marker so detect() reports post.
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'Backend / Go', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run([call(2, 'coach_checkin')], { cwd });
    const { parsed } = toolResult(lines, 2);

    expect(parsed.phase).toBe('post');
    expect(parsed.needsRole).toBe(false);
    expect(parsed.rolePrompt).toBe(undefined);
    expect(
      (parsed.questions as CheckinQuestion[]).map((q) => q.questionKey),
    ).toEqual(['built', 'next']);
  });
});

describe('consent', () => {
  test('confirmed:false writes no marker, no outbox, makes no POST', async () => {
    const cwd = freshCwd();
    let hit = false;
    const server = createServer((req, res) => {
      hit = true;
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const { lines } = await run([call(3, 'coach_submit_checkin', { role: 'PM', answers: { time_sink: 'a', friction: 'b', goal: 'c' }, confirmed: false })], {
        cwd,
        env: { WORKER_URL: url },
      });
      const { parsed } = toolResult(lines, 3);

      expect(parsed.sent).toBe(false);
      expect(parsed.reason).toBe('unconfirmed');
      expect(hit).toBe(false);
      expect(existsSync(join(cwd, '.aie-coach-state.json'))).toBe(false);
      expect(existsSync(join(cwd, '.aie-coach-outbox'))).toBe(false);
    } finally {
      server.close();
    }
  });
});

describe('malformed', () => {
  test('confirmed:true with bad answers returns invalid_answers and the server stays alive', async () => {
    const cwd = freshCwd();
    // Missing the required keys for the pre phase -> submit() throws before the
    // consent guard. The handler must catch it and return a structured error,
    // and the read loop must survive to answer the follow-up tools/list.
    const { lines } = await run(
      [
        call(4, 'coach_submit_checkin', { role: 'Eng', answers: { not_a_key: 'x' }, confirmed: true }),
        { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }, // proves the process is still alive
      ],
      { cwd, env: { WORKER_URL: 'http://127.0.0.1:1' } },
    );

    const { parsed, isError } = toolResult(lines, 4);
    expect(isError).toBe(false);
    expect(parsed.error).toBe('invalid_answers');
    expect(parsed.detail && parsed.detail.length > 0).toBeTruthy();
    // A missing key throws in buildAnswers (no schemaErrors); a schema-shape
    // violation throws from validateAgainstSchema (schemaErrors array). The
    // handler surfaces whichever the real cause was, defaulting to null.
    expect(
      parsed.schemaErrors === null || Array.isArray(parsed.schemaErrors),
    ).toBeTruthy();
    expect('schemaErrors' in parsed).toBeTruthy();

    // The follow-up request was answered -> the malformed payload did not crash
    // the server.
    const after = lines.map((l: string) => JSON.parse(l) as RpcLine).find((m: RpcLine) => m.id === 5);
    expect(after && after.result).toBeTruthy();

    // Nothing leaked to disk on the error path.
    expect(existsSync(join(cwd, '.aie-coach-state.json'))).toBe(false);
    expect(existsSync(join(cwd, '.aie-coach-outbox'))).toBe(false);
  });
});

describe('outbox', () => {
  test('confirmed:true with valid answers against an unreachable board falls back to the outbox', async () => {
    const cwd = freshCwd();
    const { lines } = await run(
      [call(6, 'coach_submit_checkin', { role: 'Backend / Go', answers: { time_sink: 'a', friction: 'b', goal: 'c' }, confirmed: true })],
      { cwd, env: { WORKER_URL: 'http://127.0.0.1:1' } }, // refuses immediately
    );
    const { parsed } = toolResult(lines, 6);

    expect(parsed.sent).toBe(false);
    expect(parsed.outbox).toBeTruthy();
    expect(parsed.phase).toBe('pre');

    // The marker is written before the POST, and exactly one outbox file lands.
    expect(existsSync(join(cwd, '.aie-coach-state.json'))).toBeTruthy();
    const files = readdirSync(join(cwd, '.aie-coach-outbox'));
    expect(files.length).toBe(1);
  });
});

// The in-process tests below import the tool registry directly and drive the
// handlers without spawning a child. bun:test has no "already declared" hazard
// across describe blocks, so the imports are consolidated at the top of the file.
import { beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from 'node:fs';
import { tools } from './server.ts';

// Call a tool exactly as the server would: look it up in the registry, run the
// handler with the given args, and return the parsed result (handlers return
// JSON-serializable objects; here we read them directly).
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const entry = tools.get(name);
  expect(entry).toBeTruthy();
  return entry!.handler(args);
}

describe('engine-backed coach tools', () => {
  let prevCwd: string;
  let dir: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    // A throwaway repo-root-like dir so the marker (.aie-coach-state.json,
    // resolved via process.cwd()) and the coach-checkin anchor both resolve here.
    dir = mkdtempSync(join(tmpdir(), 'aie-coach-engine-'));
    mkdirSync(join(dir, 'skills', 'coach-checkin', 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'coach-checkin', 'scripts', 'submit.ts'), '');
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('all four engine tools are registered and listed', () => {
    for (const name of ['coach_scan', 'coach_next', 'coach_gate', 'coach_card']) {
      const entry: any = tools.get(name);
      expect(entry).toBeTruthy();
      expect(entry.schema.name).toBe(name);
      expect(entry.schema.inputSchema.additionalProperties).toBe(false);
    }
    // The four pre-existing tools must still be present (not broken/overwritten).
    for (const name of ['coach_checkin', 'coach_submit_checkin', 'coach_status', 'coach_checkpoint']) {
      expect(tools.get(name)).toBeTruthy();
    }
  });

  test('coach_scan returns the report and records the opening baseline', async () => {
    const r = await callTool('coach_scan');
    expect(typeof r.total === 'number').toBeTruthy();
    expect(r.pillars && typeof r.pillars.verification === 'number').toBeTruthy();
    expect(Array.isArray(r.recommendations)).toBeTruthy();
    expect(Array.isArray(r.observations)).toBeTruthy();
    expect(r.firstScan).toBe(true); // first scan in a fresh marker
    // A second scan no longer claims firstScan (baseline already stored).
    const r2 = await callTool('coach_scan');
    expect(r2.firstScan).toBe(false);
  });

  test('coach_next returns a single next step or a done sentinel', async () => {
    const step = await callTool('coach_next');
    // On a fresh machine there is almost always at least one gap; tolerate both.
    if (step.done) {
      expect(step.done).toBe(true);
    } else {
      expect(typeof step.pillar === 'string').toBeTruthy();
      expect(typeof step.action === 'string').toBeTruthy();
      expect(typeof step.subScore === 'number').toBeTruthy();
    }
  });

  test('coach_gate rejects an out-of-enum pillar via the input schema', () => {
    // The handler trusts the schema; enum membership is the contract we assert.
    const props: any = tools.get('coach_gate')!.schema.inputSchema.properties;
    expect([...props.pillar.enum].sort()).toEqual([
      'automation', 'context', 'delegation', 'orchestration', 'verification',
    ]);
  });

  test('coach_gate advances only when the scan sees the pillar', async () => {
    // verification is present on most dev machines via a lint/test hook; assert on
    // the SHAPE + the invariant rather than a machine-specific truth value.
    const r = await callTool('coach_gate', { pillar: 'verification' });
    expect(r.pillar).toBe('verification');
    expect(r.threshold).toBe(0.8);
    expect(typeof r.passed === 'boolean').toBeTruthy();
    expect(r.advanced).toBe(r.passed); // advanced iff passed — the core invariant
    if (r.passed) expect(r.pillarsPassed.includes('verification')).toBeTruthy();
    else expect(typeof r.hint === 'string').toBeTruthy();
  });

  test('coach_card renders a self-contained before/after card', async () => {
    await callTool('coach_scan'); // establish the opening baseline first
    const r = await callTool('coach_card', { name: 'Tester' });
    expect(r.html).toMatch(/<!doctype html>/i);
    expect(!/\bsrc=|\bhref=/.test(r.html)).toBeTruthy(); // offline-safe
    expect(r.html).toMatch(/Tester/);
    expect(typeof r.scoreBefore === 'number').toBeTruthy();
    expect(typeof r.scoreAfter === 'number').toBeTruthy();
    expect(r.delta).toBe(r.scoreAfter - r.scoreBefore);
  });
});

// --- coach_submit_score (Plan 4) -------------------------------------------
describe('coach_submit_score', () => {
  test('is registered with a confirmed flag in its input schema', () => {
    const t: any = tools.get('coach_submit_score');
    expect(t).toBeTruthy();
    expect(t.schema.inputSchema.properties.confirmed.type).toBe('boolean');
  });

  test('never reports sent:true on an unconfirmed call (gate or no-baseline refusal)', async () => {
    const res: any = await tools.get('coach_submit_score')!.handler({ confirmed: false });
    expect(res.sent).not.toBe(true); // either {sent:false,reason:'unconfirmed'} or a no_baseline/no_checkin refusal
  });
});
