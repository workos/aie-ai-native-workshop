// native/src/evidence.ts
// The behavioral (evidence) layer. Reads the LOCAL transcript corpus and turns it
// into OBSERVED COUNTS, then uses those counts to JUSTIFY recommendations — it
// NEVER feeds score.ts. Two honesty rules govern the counts:
//   1. Only the human's own time is ever translated to hours (re-pasting context).
//      Agent behavior (it re-running tests) is COUNT-ONLY — no hours are claimed,
//      because there is no defensible human-hours number for work the agent did.
//   2. A signal is hook-GATED off when the matching machinery already exists, so
//      we never manufacture a gap to pad the pitch (anti-sandbagging).
// Every path/field here is verified on disk; anything we cannot see degrades to
// 0/empty (surfaced as "no observation"), never guessed. All functions are total:
// bad input yields 0/empty, never a throw (JSONL fields vary by CLI version).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  Observation,
  ObservationKind,
  PillarId,
  Recommendation,
  CollectOptions,
} from './types.ts';

// JSONL line shapes vary by CLI version, so transcript/history rows are modeled
// loosely (optional, unknown) and narrowed at each use site.
interface ToolUseBlock {
  type?: string;
  name?: string;
  input?: { command?: unknown };
}

export interface TranscriptLine {
  type?: string;
  isMeta?: boolean;
  message?: { content?: unknown };
}

interface PastedContent {
  contentHash?: unknown;
}

interface HistoryRow {
  sessionId?: unknown;
  timestamp?: unknown;
  pastedContents?: unknown;
}

interface ThrashLoop {
  command: string;
  runs: number;
}

// --- pure line classifiers --------------------------------------------------

// A real user turn = a typed string prompt, not meta, not a tool_result wrapper,
// not a slash/local-command echo. (Verified: array-content user lines are tool
// results; isMeta marks injected context.)
export function isRealUserTurn(line: TranscriptLine | null | undefined): boolean {
  if (!line || line.type !== 'user' || line.isMeta === true) return false;
  const content = line.message?.content;
  if (typeof content !== 'string') return false;
  return !/^\s*<(local-command|command-name|command-message)/.test(content);
}

// Commands that mean "verifying via the test/lint runner" — the work a hook does.
const TEST_LINT = /\b(tsc|typecheck|type-check|eslint|prettier|jest|vitest|pytest|rspec|mocha|ava|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint)|node\s+--check|go\s+test|cargo\s+test)\b/;

function* toolUses(
  lines: readonly TranscriptLine[] | null | undefined,
  name: string,
): Generator<ToolUseBlock> {
  for (const line of lines ?? []) {
    if (line?.type !== 'assistant') continue;
    const blocks = line.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks as ToolUseBlock[]) {
      if (b?.type === 'tool_use' && b.name === name) yield b;
    }
  }
}

// Detect THRASH LOOPS: the SAME test/lint command run >= minRuns times within ONE
// session. The repetition — not the run — is the signal: a verify hook catches the
// failure at the edit instead of on the Nth manual re-run. We count the agent's
// Bash runs (it is the agent that re-runs), but ONLY the pathological repeat, never
// a single legitimate run, and we make NO hours claim from it. Returns one entry
// per thrashed command (usually zero or one). Total: bad input -> [].
export function detectThrashLoops(
  lines: readonly TranscriptLine[] | null | undefined,
  { minRuns = 3 }: { minRuns?: number } = {},
): ThrashLoop[] {
  const counts = new Map<string, number>(); // normalized command -> times run this session
  for (const b of toolUses(lines, 'Bash')) {
    const cmd = b.input?.command;
    if (typeof cmd !== 'string' || !TEST_LINT.test(cmd)) continue;
    const norm = cmd.trim().replace(/\s+/g, ' ');
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  const loops: ThrashLoop[] = [];
  for (const [command, runs] of counts) if (runs >= minRuns) loops.push({ command, runs });
  return loops;
}

// Trim a captured command to its meaningful HEAD for human display: drop shell
// plumbing (redirects, pipes, chained echos) and cap length. Presentation only —
// detectThrashLoops still dedups on the full normalized command, so two commands
// that merely share a head are never conflated; this just keeps the example clean.
export function displayCommand(cmd: unknown, { max = 60 }: { max?: number } = {}): string {
  if (typeof cmd !== 'string') return '';
  const head = cmd.trim().split(/\s+\d*[<>]|\s*[|;&]+\s*/)[0].trim() || cmd.trim();
  return head.length > max ? head.slice(0, max - 1) + '…' : head;
}

// Count re-pasted contexts: a contentHash that appears under >= 2 DISTINCT
// sessionIds in history.jsonl. (The literal text isn't stored; the hash is the
// dedup key. Same hash in one session is not cross-session re-use.)
export function countRepastedContexts(historyLines: readonly HistoryRow[] | null | undefined): number {
  const sessionsByHash = new Map<string, Set<unknown>>();
  for (const row of historyLines ?? []) {
    const sid = row?.sessionId;
    const pasted = row?.pastedContents;
    if (!sid || !pasted || typeof pasted !== 'object') continue;
    for (const v of Object.values(pasted as Record<string, PastedContent>)) {
      const h = v?.contentHash;
      if (typeof h !== 'string') continue;
      if (!sessionsByHash.has(h)) sessionsByHash.set(h, new Set());
      sessionsByHash.get(h)!.add(sid);
    }
  }
  let repasted = 0;
  for (const sids of sessionsByHash.values()) if (sids.size >= 2) repasted += 1;
  return repasted;
}

// --- append to native/src/evidence.ts ---

// Count delegation (Task tool_use) vs real user turns. High real-turn count with
// near-zero Task calls = babysitting; Task calls = real handoffs. (subagent
// transcripts are SEPARATE session files on this CLI, not inline isSidechain
// lines, so we count Task calls in the parent — not sidechain markers.)
export function summarizeDelegation(
  lines: readonly TranscriptLine[] | null | undefined,
): { taskCalls: number; realUserTurns: number } {
  let taskCalls = 0;
  for (const _ of toolUses(lines, 'Task')) taskCalls += 1;
  let realUserTurns = 0;
  for (const line of lines ?? []) if (isRealUserTurn(line)) realUserTurns += 1;
  return { taskCalls, realUserTurns };
}

// Minutes PER EVENT used to translate an observed COUNT into time — ONLY for kinds
// where the human genuinely spends that time (re-pasting context IS human time).
// These are ESTIMATES (a calibration surface), NOT measured per-event durations,
// which is why such observations are flagged `estimated:true` and rendered "est.".
// Kinds ABSENT here are COUNT-ONLY: we report the count and make NO hours claim
// (e.g. thrash loops — the agent does the re-running, so no honest human-hours number).
export const PER_EVENT_MINUTES: Readonly<Partial<Record<ObservationKind, number>>> = Object.freeze({
  'repasted-context': 3,   // re-finding + re-pasting the same context blob (human time)
});

// Which pillar each observation justifies (the seam into recommend()).
const OBSERVATION_PILLAR: Readonly<Record<ObservationKind, PillarId>> = Object.freeze({
  'thrash-loop': 'verification',
  'repasted-context': 'context',
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Build one observation from a measured count. Returns null at count 0 so we never
// manufacture waste. Two shapes, chosen by whether the kind has a PER_EVENT_MINUTES
// entry:
//   - hours-quantified: the waste is genuine human time -> an ESTIMATED hours/week
//     (estimated:true, rendered "est.").
//   - count-only (no entry, e.g. thrash loops): the COUNT is the whole claim;
//     hoursPerWeek is null and estimated is false. We deliberately make NO hours
//     claim where one would be indefensible.
// `now` is accepted for symmetry with windowed callers / determinism (unused in the
// math). `sample` is an optional example command for the count-only human detail.
export function buildObservation(
  kind: ObservationKind,
  count: number,
  { windowDays = 30, now = 0, sample = null }: { windowDays?: number; now?: number; sample?: string | null } = {},
): Observation | null {
  if (!count || count <= 0) return null;
  const pillar = OBSERVATION_PILLAR[kind];
  if (pillar == null) return null;
  const perEventMinutes = PER_EVENT_MINUTES[kind] ?? null;
  const plural = count === 1 ? '' : 's';

  if (perEventMinutes == null) {
    const detail =
      kind === 'thrash-loop'
        ? (sample
            ? `re-ran \`${sample}\` 3+ times chasing a failure across ${count} session${plural} — no verify hook caught it`
            : `re-ran the same test/lint command 3+ times across ${count} session${plural} — no verify hook caught it`)
        : `observed ${count}x in the last ${windowDays}d`;
    return { kind, count, windowDays, perEventMinutes: null, hoursPerWeek: null, estimated: false, pillar, detail };
  }

  const weeks = windowDays / 7;
  const hoursPerWeek = round2((count * perEventMinutes) / 60 / weeks);
  const detail = `re-pasted the same context across sessions ${count}x in the last ${windowDays}d`;
  return { kind, count, windowDays, perEventMinutes, hoursPerWeek, estimated: true, pillar, detail };
}

// Upgrade recs IN PLACE-style (returns a new array): a rec whose pillar matches an
// observation becomes basis:'observed-waste' with a human `evidence` string.
// Hours-quantified observations add an "~Xh/wk (est.)" tail; count-only ones (thrash)
// carry the count in the detail and assert NO hours. Observations with no matching
// rec are dropped — evidence JUSTIFIES gap recs, it never creates one. If several
// observations hit one pillar, prefer the hours-bearing one, then the larger count.
export function applyEvidence(
  recs: readonly Recommendation[] | null | undefined,
  observations: readonly (Observation | null | undefined)[] | null | undefined,
): Recommendation[] {
  const best = new Map<PillarId, Observation>(); // pillar -> observation
  for (const o of observations ?? []) {
    if (!o) continue;
    const cur = best.get(o.pillar);
    best.set(o.pillar, cur ? preferObservation(cur, o) : o);
  }
  return (recs ?? []).map((rec): Recommendation => {
    const o = best.get(rec.pillar);
    if (!o) return rec;
    const hasHours = typeof o.hoursPerWeek === 'number';
    const evidence = hasHours
      ? `${o.detail} — ~${o.hoursPerWeek}h/wk${o.estimated ? ' (est.)' : ''}`
      : o.detail;
    return { ...rec, basis: 'observed-waste', hoursPerWeek: hasHours ? o.hoursPerWeek : null, evidence };
  });
}

// Prefer the more compelling observation when two hit the same pillar: a real hours
// number beats a count-only one; otherwise the larger count wins.
function preferObservation(a: Observation, b: Observation): Observation {
  const ah = typeof a.hoursPerWeek === 'number' ? a.hoursPerWeek : -1;
  const bh = typeof b.hoursPerWeek === 'number' ? b.hoursPerWeek : -1;
  if (ah !== bh) return ah > bh ? a : b;
  return (b.count ?? 0) > (a.count ?? 0) ? b : a;
}

// --- corpus IO -------------------------------------------------------------

const DAY_MS = 86_400_000;

// See scan.ts: a multi-GB JSONL OOM-kills the process inside readFileSync. Skip any
// transcript above this cap; real coding sessions are far smaller.
const MAX_TRANSCRIPT_BYTES = 100 * 1024 * 1024;

// Recursively list *.jsonl under a dir. Total: unreadable dirs are skipped.
function listJsonl(dir: string): string[] {
  let out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listJsonl(full));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

// Parse a JSONL file into objects, skipping blank/garbage lines. Never throws.
function parseJsonl(path: string): unknown[] {
  let text;
  try {
    if (statSync(path).size > MAX_TRANSCRIPT_BYTES) return []; // would OOM readFileSync
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const objs: unknown[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      objs.push(JSON.parse(t));
    } catch {
      /* one bad line must not abort the file */
    }
  }
  return objs;
}

function withinWindow(path: string, now: number, windowDays: number): boolean {
  try {
    return now - statSync(path).mtimeMs <= windowDays * DAY_MS;
  } catch {
    return false;
  }
}

// Walk the LOCAL corpus and return observations for the kinds with non-zero counts.
// mtime is a cheap pre-filter so we don't parse ancient sessions. Every layer is
// total: a bad file/line/dir yields fewer observations, never a throw.
//
// `hasVerifyHook` HOOK-GATES the thrash signal: when a verify hook is already
// installed we emit nothing for it — you've automated that pillar, so we refuse to
// manufacture a nudge (anti-sandbagging). recommend()'s threshold-drop is the
// backstop (a hook makes verification strong, dropping the rec), but gating here
// keeps the raw observation honest too: the signal is genuinely 0.
export function collectObservations({ home = homedir(), now = Date.now(), windowDays = 30, hasVerifyHook = false }: CollectOptions = {}): Observation[] {
  const claude = join(home, '.claude');

  // (1) transcripts -> verify-hook THRASH loops (count-only, hook-gated). A session
  // counts once if it re-ran the same test/lint command 3+ times; we keep one example
  // command for the human detail. No hours are claimed (the agent does the re-running).
  let thrashSessions = 0;
  let sampleCmd: string | null = null;
  if (!hasVerifyHook) {
    for (const file of listJsonl(join(claude, 'projects'))) {
      if (!withinWindow(file, now, windowDays)) continue;
      const loops = detectThrashLoops(parseJsonl(file) as TranscriptLine[]);
      if (loops.length > 0) {
        thrashSessions += 1;
        if (!sampleCmd) sampleCmd = displayCommand(loops[0].command);
      }
    }
  }

  // (2) history.jsonl -> re-pasted context across sessions (hours-quantified human
  // time), WINDOWED by each row's timestamp so the count's period matches
  // buildObservation's divisor (an all-time count over a 30d denominator would
  // inflate hoursPerWeek). Rows without a numeric timestamp are dropped — never overstate.
  const historyRows = (parseJsonl(join(claude, 'history.jsonl')) as HistoryRow[]).filter(
    (r) => typeof r?.timestamp === 'number' && now - r.timestamp <= windowDays * DAY_MS,
  );
  const repasted = countRepastedContexts(historyRows);

  const observations = [
    buildObservation('thrash-loop', thrashSessions, { windowDays, now, sample: sampleCmd }),
    buildObservation('repasted-context', repasted, { windowDays, now }),
  ];
  return observations.filter(Boolean) as Observation[];
}
