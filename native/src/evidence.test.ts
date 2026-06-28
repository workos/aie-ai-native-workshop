// native/src/evidence.test.ts
import { describe, test, expect } from 'bun:test';
import { isRealUserTurn, detectThrashLoops, displayCommand, countRepastedContexts } from './evidence.ts';

// A tiny assistant line carrying one Bash tool_use.
const bash = (uuid: string, command: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: uuid, name: 'Bash', input: { command } }] },
});

describe('isRealUserTurn', () => {
  test('a typed user string is a real turn', () => {
    expect(isRealUserTurn({ type: 'user', message: { content: 'run the tests' } })).toBe(true);
  });
  test('meta lines are not real turns', () => {
    expect(isRealUserTurn({ type: 'user', isMeta: true, message: { content: 'x' } })).toBe(false);
  });
  test('array-content (tool_result wrapper) is not a real turn', () => {
    expect(isRealUserTurn({ type: 'user', message: { content: [{ type: 'tool_result' }] } })).toBe(false);
  });
  test('local-command wrappers are not real turns', () => {
    expect(isRealUserTurn({ type: 'user', message: { content: '<local-command-stdout>hi</local-command-stdout>' } })).toBe(false);
  });
  test('assistant lines are not user turns', () => {
    expect(isRealUserTurn({ type: 'assistant', message: { content: 'hi' } })).toBe(false);
  });
});

describe('detectThrashLoops', () => {
  test('the same test/lint command run 3+ times in a session is a thrash loop', () => {
    const lines = [
      bash('a', 'npm test'),
      bash('b', 'npm test'),
      bash('c', 'npm test'),
      bash('d', 'git status'), // not a test/lint command -> ignored
    ];
    const loops = detectThrashLoops(lines);
    expect(loops.length).toBe(1);
    expect(loops[0].command).toBe('npm test');
    expect(loops[0].runs).toBe(3);
  });
  test('fewer than 3 runs is NOT a thrash loop (a single legit run never counts)', () => {
    expect(detectThrashLoops([bash('a', 'npm test'), bash('b', 'npm test')])).toEqual([]);
  });
  test('whitespace variants of the same command are counted together', () => {
    const loops = detectThrashLoops([bash('a', 'npm   test'), bash('b', 'npm test'), bash('c', ' npm test ')]);
    expect(loops.length).toBe(1);
    expect(loops[0].runs).toBe(3);
  });
  test('two distinct commands that each thrash yield two entries', () => {
    const lines = [
      bash('1', 'npm test'), bash('2', 'npm test'), bash('3', 'npm test'),
      bash('4', 'pytest -q'), bash('5', 'pytest -q'), bash('6', 'pytest -q'),
    ];
    expect(detectThrashLoops(lines).length).toBe(2);
  });
  test('non-test commands never thrash; empty / malformed -> [], never throws', () => {
    expect(
      detectThrashLoops([bash('a', 'git status'), bash('b', 'git status'), bash('c', 'git status')]),
    ).toEqual([]);
    expect(detectThrashLoops([])).toEqual([]);
    expect(detectThrashLoops([{}, { type: 'assistant' }, { type: 'assistant', message: {} }])).toEqual([]);
  });
});

describe('displayCommand', () => {
  test('strips shell plumbing to the meaningful head', () => {
    expect(displayCommand('npx tsc --noEmit 2>&1 | head -30; echo "EXIT: ${PIPESTATUS[0]}"')).toBe('npx tsc --noEmit');
    expect(displayCommand('npm test && npm run lint')).toBe('npm test');
    expect(displayCommand('cargo test --workspace 2>/dev/null')).toBe('cargo test --workspace');
  });
  test('leaves a clean command untouched', () => {
    expect(displayCommand('npm test')).toBe('npm test');
  });
  test('caps very long commands and is total on bad input', () => {
    const long = 'pytest ' + 'x'.repeat(100);
    expect(displayCommand(long).length <= 60).toBeTruthy();
    expect(displayCommand(undefined)).toBe('');
  });
});

describe('countRepastedContexts', () => {
  test('same contentHash across two distinct sessions counts once', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's2', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's3', pastedContents: { 1: { contentHash: 'OTHER', id: 1, type: 'text' } } },
    ];
    expect(countRepastedContexts(rows)).toBe(1);
  });
  test('same hash twice in the SAME session does not count (not cross-session)', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
    ];
    expect(countRepastedContexts(rows)).toBe(0);
  });
  test('rows without pastes / malformed -> 0, never throws', () => {
    expect(countRepastedContexts([{ sessionId: 's1' }, {}, { pastedContents: null }])).toBe(0);
  });
});

// --- append to native/src/evidence.test.ts ---
import { summarizeDelegation, buildObservation, applyEvidence, PER_EVENT_MINUTES } from './evidence.ts';
import type { Recommendation } from './types.ts';

const task = (subagent: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Task', input: { description: 'd', prompt: 'p', subagent_type: subagent } }] },
});

describe('summarizeDelegation', () => {
  test('counts Task calls and real user turns separately', () => {
    const lines = [
      { type: 'user', message: { content: 'do a thing' } },
      task('Explore'),
      { type: 'user', message: { content: 'and another' } },
      { type: 'user', isMeta: true, message: { content: 'meta noise' } }, // not real
    ];
    const r = summarizeDelegation(lines);
    expect(r.taskCalls).toBe(1);
    expect(r.realUserTurns).toBe(2);
  });
  test('empty -> zeros, never throws', () => {
    expect(summarizeDelegation([])).toEqual({ taskCalls: 0, realUserTurns: 0 });
  });
});

describe('buildObservation', () => {
  test('zero count -> null (no observation invented)', () => {
    expect(buildObservation('thrash-loop', 0, { windowDays: 30, now: 0 })).toBe(null);
    expect(buildObservation('repasted-context', 0, { windowDays: 30, now: 0 })).toBe(null);
  });
  test('repasted-context derives hoursPerWeek from the real count and is flagged estimated', () => {
    // 12 re-pastes in 30 days, 3 min each -> 12*3/60 = 0.6h over ~4.286 wk -> 0.14 h/wk
    const o = buildObservation('repasted-context', 12, { windowDays: 30, now: 0 })!;
    expect(o.kind).toBe('repasted-context');
    expect(o.count).toBe(12);
    expect(o.windowDays).toBe(30);
    expect(o.pillar).toBe('context');
    expect(o.estimated).toBe(true);
    expect(o.perEventMinutes).toBe(PER_EVENT_MINUTES['repasted-context']!);
    // buildObservation rounds hoursPerWeek to 2dp (round2), so compare against the
    // rounded value — not the raw quotient (which would differ in the 3rd dp).
    const expected = Math.round(((12 * PER_EVENT_MINUTES['repasted-context']!) / 60 / (30 / 7)) * 100) / 100;
    expect(o.hoursPerWeek).toBe(expected);
    expect(o.detail).toMatch(/12/); // the measured count appears in the human detail
  });
  test('thrash-loop is COUNT-ONLY: a measured count, NO fabricated hours', () => {
    const o = buildObservation('thrash-loop', 4, { windowDays: 30, now: 0, sample: 'npm test' })!;
    expect(o.kind).toBe('thrash-loop');
    expect(o.count).toBe(4);
    expect(o.pillar).toBe('verification');
    expect(o.hoursPerWeek).toBe(null); // the calibration fix: no hours where none is defensible
    expect(o.perEventMinutes).toBe(null);
    expect(o.estimated).toBe(false);
    expect(o.detail).toMatch(/4 sessions/);
    expect(o.detail).toMatch(/npm test/); // the example command appears in the detail
  });
  test('thrash-loop without a sample still renders a clean singular detail', () => {
    const o = buildObservation('thrash-loop', 1, { windowDays: 30, now: 0 })!;
    expect(o.count).toBe(1);
    expect(o.detail).toMatch(/1 session\b/); // singular, no trailing "s"
  });
});

describe('applyEvidence', () => {
  const recs: Recommendation[] = [
    { pillar: 'verification', action: 'add a test hook', basis: 'capability-gap' },
    { pillar: 'context', action: 'add CLAUDE.md', basis: 'capability-gap' },
  ];
  test('a count-only thrash observation upgrades verification with NO hours', () => {
    const obs = [buildObservation('thrash-loop', 5, { windowDays: 30, now: 0, sample: 'bun test' })];
    const out = applyEvidence(recs, obs);
    const v = out.find((r) => r.pillar === 'verification')!;
    expect(v.basis).toBe('observed-waste');
    expect(v.hoursPerWeek).toBe(null);
    expect(typeof v.evidence).toBe('string');
    expect(v.evidence).not.toMatch(/h\/wk/); // the fix: never claims hours for agent work
    expect(v.evidence).toMatch(/bun test/);
    // non-matching rec is untouched
    expect(out.find((r) => r.pillar === 'context')!.basis).toBe('capability-gap');
  });
  test('a hours-quantified re-paste observation upgrades context WITH hours', () => {
    const obs = [buildObservation('repasted-context', 20, { windowDays: 30, now: 0 })];
    const out = applyEvidence(recs, obs);
    const c = out.find((r) => r.pillar === 'context')!;
    expect(c.basis).toBe('observed-waste');
    expect(c.hoursPerWeek! > 0).toBeTruthy();
    expect(c.evidence).toMatch(/h\/wk/);
    expect(out.find((r) => r.pillar === 'verification')!.basis).toBe('capability-gap');
  });
  test('an observation with no matching rec is dropped (never fabricates a rec)', () => {
    const obs = [buildObservation('thrash-loop', 5, { windowDays: 30, now: 0 })];
    const out = applyEvidence([{ pillar: 'context', action: 'x', basis: 'capability-gap' }], obs);
    expect(out.length).toBe(1);
    expect(out[0].pillar).toBe('context');
    expect(out[0].basis).toBe('capability-gap');
  });
  test('no observations -> recs returned unchanged', () => {
    expect(applyEvidence(recs, [])).toEqual(recs);
  });
});

// --- append to native/src/evidence.test.ts ---
import { collectObservations } from './evidence.ts';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build a throwaway ~/.claude/projects corpus. `files` maps relative jsonl paths
// (under projects/) to an array of objects; each object is written as one line.
function fakeCorpus({ projects = {}, history = [] }: { projects?: Record<string, unknown[]>; history?: unknown[] } = {}): string {
  const home = mkdtempSync(join(tmpdir(), 'aie-corpus-'));
  const claude = join(home, '.claude');
  const proj = join(claude, 'projects');
  mkdirSync(proj, { recursive: true });
  for (const [rel, objs] of Object.entries(projects)) {
    const full = join(proj, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  if (history.length) {
    writeFileSync(join(claude, 'history.jsonl'), history.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  return home;
}

const bashLine = (cmd: string) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });
// A session that thrashed: the same test command run 3 times.
const thrashSession = (cmd = 'npm test') => [bashLine(cmd), bashLine(cmd), bashLine(cmd)];

describe('collectObservations', () => {
  test('a thrash loop in the corpus produces a count-only verification observation', () => {
    const home = fakeCorpus({ projects: { 'slug-a/s1.jsonl': thrashSession('npm test') } });
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    const o = obs.find((x) => x.kind === 'thrash-loop')!;
    expect(o).toBeTruthy();
    expect(o.count).toBe(1); // one session thrashed
    expect(o.pillar).toBe('verification');
    expect(o.hoursPerWeek).toBe(null); // count-only
    expect(o.detail).toMatch(/npm test/);
  });

  test('fewer than 3 same-command runs is NOT a thrash loop', () => {
    const home = fakeCorpus({ projects: { 'slug-a/s1.jsonl': [bashLine('npm test'), bashLine('npm test')] } });
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    expect(obs.find((x) => x.kind === 'thrash-loop')).toBe(undefined);
  });

  test('hasVerifyHook gates the thrash signal to 0 (anti-sandbagging)', () => {
    const home = fakeCorpus({ projects: { 'slug-a/s1.jsonl': thrashSession('npm test') } });
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30, hasVerifyHook: true });
    expect(obs.find((x) => x.kind === 'thrash-loop')).toBe(undefined);
  });

  test('produces a repasted-context observation from history.jsonl (within window)', () => {
    const now = Date.now();
    const home = fakeCorpus({
      history: [
        { sessionId: 's1', timestamp: now - 1000, pastedContents: { 1: { contentHash: 'H' } } },
        { sessionId: 's2', timestamp: now - 2000, pastedContents: { 1: { contentHash: 'H' } } },
      ],
    });
    const obs = collectObservations({ home, now, windowDays: 30 });
    const o = obs.find((x) => x.kind === 'repasted-context')!;
    expect(o).toBeTruthy();
    expect(o.count).toBe(1);
    expect(o.pillar).toBe('context');
    expect(o.hoursPerWeek! > 0).toBeTruthy();
  });

  test('re-pastes older than the window are excluded (count period == divisor period)', () => {
    const now = Date.now();
    const old = now - 60 * 86_400_000; // 60 days ago, outside a 30d window
    const home = fakeCorpus({
      history: [
        { sessionId: 's1', timestamp: old, pastedContents: { 1: { contentHash: 'H' } } },
        { sessionId: 's2', timestamp: old, pastedContents: { 1: { contentHash: 'H' } } },
      ],
    });
    const obs = collectObservations({ home, now, windowDays: 30 });
    expect(obs.find((x) => x.kind === 'repasted-context')).toBe(undefined);
  });

  test('files older than the window are skipped (by mtime)', () => {
    const home = fakeCorpus({ projects: { 'slug-a/old.jsonl': thrashSession('npm test') } });
    const old = join(home, '.claude', 'projects', 'slug-a', 'old.jsonl');
    const ancient = new Date('2000-01-01T00:00:00Z');
    utimesSync(old, ancient, ancient);
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    expect(obs.find((x) => x.kind === 'thrash-loop')).toBe(undefined);
  });

  test('missing corpus -> [] (never throws)', () => {
    const home = mkdtempSync(join(tmpdir(), 'aie-empty-'));
    expect(collectObservations({ home, now: Date.now() })).toEqual([]);
  });

  test('a malformed line does not abort the file', () => {
    const home = mkdtempSync(join(tmpdir(), 'aie-bad-'));
    const proj = join(home, '.claude', 'projects', 'slug-a');
    mkdirSync(proj, { recursive: true });
    const three = thrashSession('npm test').map((o) => JSON.stringify(o)).join('\n');
    writeFileSync(join(proj, 's1.jsonl'), 'not json\n' + three + '\n');
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    expect(obs.find((x) => x.kind === 'thrash-loop')!.count).toBe(1);
  });
});
