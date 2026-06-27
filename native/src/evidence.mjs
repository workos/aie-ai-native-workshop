// native/src/evidence.mjs
// The behavioral (evidence) layer. Reads the LOCAL transcript corpus and turns it
// into OBSERVED COUNTS, then uses those counts to JUSTIFY recommendations — it
// NEVER feeds score.mjs. Every path/field here is verified on disk; anything we
// cannot see degrades to 0/empty and is surfaced in the plan's "Needs dry-run"
// section, never guessed. All functions are total: bad input yields 0/empty,
// never a throw (JSONL fields vary by CLI version, so every field is optional).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// --- pure line classifiers --------------------------------------------------

// A real user turn = a typed string prompt, not meta, not a tool_result wrapper,
// not a slash/local-command echo. (Verified: array-content user lines are tool
// results; isMeta marks injected context.)
export function isRealUserTurn(line) {
  if (!line || line.type !== 'user' || line.isMeta === true) return false;
  const content = line.message?.content;
  if (typeof content !== 'string') return false;
  return !/^\s*<(local-command|command-name|command-message)/.test(content);
}

// Commands that mean "I'm verifying by hand" — the work a hook should be doing.
const TEST_LINT = /\b(tsc|typecheck|type-check|eslint|prettier|jest|vitest|pytest|rspec|mocha|ava|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint)|node\s+--check|go\s+test|cargo\s+test)\b/;

function* toolUses(lines, name) {
  for (const line of lines ?? []) {
    if (line?.type !== 'assistant') continue;
    const blocks = line.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type === 'tool_use' && b.name === name) yield b;
    }
  }
}

// Count by-hand test/lint runs: assistant Bash tool_use whose command matches a
// known runner. Each invocation counts (repeats are the signal — a hook would
// have removed them). Total: skips non-assistant / non-array / non-Bash silently.
export function countManualTestRuns(lines) {
  let n = 0;
  for (const b of toolUses(lines, 'Bash')) {
    const cmd = b.input?.command;
    if (typeof cmd === 'string' && TEST_LINT.test(cmd)) n += 1;
  }
  return n;
}

// Count re-pasted contexts: a contentHash that appears under >= 2 DISTINCT
// sessionIds in history.jsonl. (The literal text isn't stored; the hash is the
// dedup key. Same hash in one session is not cross-session re-use.)
export function countRepastedContexts(historyLines) {
  const sessionsByHash = new Map();
  for (const row of historyLines ?? []) {
    const sid = row?.sessionId;
    const pasted = row?.pastedContents;
    if (!sid || !pasted || typeof pasted !== 'object') continue;
    for (const v of Object.values(pasted)) {
      const h = v?.contentHash;
      if (typeof h !== 'string') continue;
      if (!sessionsByHash.has(h)) sessionsByHash.set(h, new Set());
      sessionsByHash.get(h).add(sid);
    }
  }
  let repasted = 0;
  for (const sids of sessionsByHash.values()) if (sids.size >= 2) repasted += 1;
  return repasted;
}

// --- append to native/src/evidence.mjs ---

// Count delegation (Task tool_use) vs real user turns. High real-turn count with
// near-zero Task calls = babysitting; Task calls = real handoffs. (subagent
// transcripts are SEPARATE session files on this CLI, not inline isSidechain
// lines, so we count Task calls in the parent — not sidechain markers.)
export function summarizeDelegation(lines) {
  let taskCalls = 0;
  for (const _ of toolUses(lines, 'Task')) taskCalls += 1;
  let realUserTurns = 0;
  for (const line of lines ?? []) if (isRealUserTurn(line)) realUserTurns += 1;
  return { taskCalls, realUserTurns };
}

// Minutes PER EVENT used to translate an observed COUNT into time. These are
// ESTIMATES (a deliberate calibration surface), NOT measured per-event durations
// — that is why every observation is flagged `estimated:true` and rendered "est.".
// The COUNT is measured; only this multiplier is assumed.
export const PER_EVENT_MINUTES = Object.freeze({
  'manual-test-runs': 4,   // a by-hand lint/test cycle the user waited on
  'repasted-context': 3,   // re-finding + re-pasting the same context blob
});

// Which pillar each observation justifies (the seam into recommend()).
const OBSERVATION_PILLAR = Object.freeze({
  'manual-test-runs': 'verification',
  'repasted-context': 'context',
});

const round2 = (n) => Math.round(n * 100) / 100;

// Build one observation from a measured count. Returns null at count 0 so we
// never manufacture waste. `now` is accepted for symmetry with windowed callers
// and to keep this deterministic under test (unused in the math itself).
export function buildObservation(kind, count, { windowDays = 30 } = {}) {
  if (!count || count <= 0) return null;
  const perEventMinutes = PER_EVENT_MINUTES[kind];
  const pillar = OBSERVATION_PILLAR[kind];
  if (perEventMinutes == null || pillar == null) return null;
  const weeks = windowDays / 7;
  const hoursPerWeek = round2((count * perEventMinutes) / 60 / weeks);
  const detail =
    kind === 'manual-test-runs'
      ? `ran tests/lint by hand ${count}x in the last ${windowDays}d`
      : `re-pasted the same context across sessions ${count}x in the last ${windowDays}d`;
  return { kind, count, windowDays, perEventMinutes, hoursPerWeek, estimated: true, pillar, detail };
}

// Upgrade recs IN PLACE-style (returns a new array): a rec whose pillar matches
// an observation becomes basis:'observed-waste' with the observed hours + a human
// `evidence` string. Observations with no matching rec are dropped — evidence
// JUSTIFIES gap-based recs, it does not create new ones. If several observations
// hit one pillar, the largest (by hoursPerWeek) wins.
export function applyEvidence(recs, observations) {
  const best = new Map(); // pillar -> observation
  for (const o of observations ?? []) {
    if (!o) continue;
    const cur = best.get(o.pillar);
    if (!cur || o.hoursPerWeek > cur.hoursPerWeek) best.set(o.pillar, o);
  }
  return (recs ?? []).map((rec) => {
    const o = best.get(rec.pillar);
    if (!o) return rec;
    const est = o.estimated ? ' (est.)' : '';
    return {
      ...rec,
      basis: 'observed-waste',
      hoursPerWeek: o.hoursPerWeek,
      evidence: `${o.detail} — ~${o.hoursPerWeek}h/wk${est}`,
    };
  });
}

// --- corpus IO -------------------------------------------------------------

const DAY_MS = 86_400_000;

// Recursively list *.jsonl under a dir. Total: unreadable dirs are skipped.
function listJsonl(dir) {
  let out = [];
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
function parseJsonl(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const objs = [];
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

function withinWindow(path, now, windowDays) {
  try {
    return now - statSync(path).mtimeMs <= windowDays * DAY_MS;
  } catch {
    return false;
  }
}

// Walk the LOCAL corpus and return observations for the kinds with non-zero
// counts. mtime is a cheap pre-filter so we don't parse ancient sessions. Every
// layer is total: a bad file/line/dir yields fewer observations, never a throw.
export function collectObservations({ home = homedir(), now = Date.now(), windowDays = 30 } = {}) {
  const claude = join(home, '.claude');

  // (1) transcripts -> manual test/lint loops
  let manualTestRuns = 0;
  for (const file of listJsonl(join(claude, 'projects'))) {
    if (!withinWindow(file, now, windowDays)) continue;
    manualTestRuns += countManualTestRuns(parseJsonl(file));
  }

  // (2) history.jsonl -> re-pasted context across sessions, WINDOWED by each row's
  // timestamp so the count's period matches buildObservation's divisor (otherwise an
  // all-time count over a 30d denominator inflates hoursPerWeek). Rows without a
  // numeric timestamp are dropped — conservative: never overstate.
  const historyRows = parseJsonl(join(claude, 'history.jsonl')).filter(
    (r) => typeof r?.timestamp === 'number' && now - r.timestamp <= windowDays * DAY_MS,
  );
  const repasted = countRepastedContexts(historyRows);

  const observations = [
    buildObservation('manual-test-runs', manualTestRuns, { windowDays, now }),
    buildObservation('repasted-context', repasted, { windowDays, now }),
  ];
  return observations.filter(Boolean);
}
