// native/src/evidence.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isRealUserTurn, countManualTestRuns, countRepastedContexts } from './evidence.mjs';

// A tiny assistant line carrying one Bash tool_use.
const bash = (uuid, command) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: uuid, name: 'Bash', input: { command } }] },
});
// A tool_result line for a Bash command (the shape verified on disk: {commandName, success}).
const bashResult = (commandName, success) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result' }] },
  toolUseResult: { commandName, success },
});

describe('isRealUserTurn', () => {
  test('a typed user string is a real turn', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: 'run the tests' } }), true);
  });
  test('meta lines are not real turns', () => {
    assert.equal(isRealUserTurn({ type: 'user', isMeta: true, message: { content: 'x' } }), false);
  });
  test('array-content (tool_result wrapper) is not a real turn', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: [{ type: 'tool_result' }] } }), false);
  });
  test('local-command wrappers are not real turns', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: '<local-command-stdout>hi</local-command-stdout>' } }), false);
  });
  test('assistant lines are not user turns', () => {
    assert.equal(isRealUserTurn({ type: 'assistant', message: { content: 'hi' } }), false);
  });
});

describe('countManualTestRuns', () => {
  test('counts each by-hand test/lint Bash invocation', () => {
    const lines = [
      bash('a', 'npx tsc --noEmit'),
      bashResult('npx tsc --noEmit', false),
      bash('b', 'npm test'),
      bashResult('npm test', false),
      bash('c', 'git status'),       // not a test/lint command -> ignored
      bashResult('git status', true),
    ];
    assert.equal(countManualTestRuns(lines), 2);
  });
  test('matches a range of runners (pytest, vitest, eslint, cargo test, go test)', () => {
    const cmds = ['pytest -q', 'npx vitest run', 'eslint .', 'cargo test', 'go test ./...'];
    assert.equal(countManualTestRuns(cmds.map((c, i) => bash(String(i), c))), 5);
  });
  test('empty / malformed input -> 0, never throws', () => {
    assert.equal(countManualTestRuns([]), 0);
    assert.equal(countManualTestRuns([{}, { type: 'assistant' }, { type: 'assistant', message: {} }]), 0);
  });
});

describe('countRepastedContexts', () => {
  test('same contentHash across two distinct sessions counts once', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's2', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's3', pastedContents: { 1: { contentHash: 'OTHER', id: 1, type: 'text' } } },
    ];
    assert.equal(countRepastedContexts(rows), 1);
  });
  test('same hash twice in the SAME session does not count (not cross-session)', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
    ];
    assert.equal(countRepastedContexts(rows), 0);
  });
  test('rows without pastes / malformed -> 0, never throws', () => {
    assert.equal(countRepastedContexts([{ sessionId: 's1' }, {}, { pastedContents: null }]), 0);
  });
});

// --- append to native/src/evidence.test.mjs ---
import { summarizeDelegation, buildObservation, applyEvidence, PER_EVENT_MINUTES } from './evidence.mjs';

const task = (subagent) => ({
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
    assert.equal(r.taskCalls, 1);
    assert.equal(r.realUserTurns, 2);
  });
  test('empty -> zeros, never throws', () => {
    assert.deepEqual(summarizeDelegation([]), { taskCalls: 0, realUserTurns: 0 });
  });
});

describe('buildObservation', () => {
  test('zero count -> null (no observation invented)', () => {
    assert.equal(buildObservation('manual-test-runs', 0, { windowDays: 30, now: 0 }), null);
  });
  test('derives hoursPerWeek from the real count and is flagged estimated', () => {
    // 12 manual runs in 30 days, 4 min each -> 12*4/60 = 0.8h over ~4.286 wk -> 0.186 h/wk
    const o = buildObservation('manual-test-runs', 12, { windowDays: 30, now: 0 });
    assert.equal(o.kind, 'manual-test-runs');
    assert.equal(o.count, 12);
    assert.equal(o.windowDays, 30);
    assert.equal(o.pillar, 'verification');
    assert.equal(o.estimated, true);
    assert.equal(o.perEventMinutes, PER_EVENT_MINUTES['manual-test-runs']);
    // buildObservation rounds hoursPerWeek to 2dp (round2), so compare against the
    // rounded value — not the raw quotient (which would differ in the 3rd dp).
    const expected = Math.round(((12 * PER_EVENT_MINUTES['manual-test-runs']) / 60 / (30 / 7)) * 100) / 100;
    assert.equal(o.hoursPerWeek, expected);
    assert.match(o.detail, /12/); // the measured count appears in the human detail
  });
});

describe('applyEvidence', () => {
  const recs = [
    { pillar: 'verification', action: 'add a test hook', basis: 'capability-gap' },
    { pillar: 'context', action: 'add CLAUDE.md', basis: 'capability-gap' },
  ];
  test('upgrades the matching rec to observed-waste with hours + evidence', () => {
    const obs = [buildObservation('manual-test-runs', 20, { windowDays: 30, now: 0 })];
    const out = applyEvidence(recs, obs);
    const v = out.find((r) => r.pillar === 'verification');
    assert.equal(v.basis, 'observed-waste');
    assert.ok(v.hoursPerWeek > 0);
    assert.equal(typeof v.evidence, 'string');
    // non-matching rec is untouched
    assert.equal(out.find((r) => r.pillar === 'context').basis, 'capability-gap');
  });
  test('an observation with no matching rec is dropped (never fabricates a rec)', () => {
    const obs = [buildObservation('manual-test-runs', 20, { windowDays: 30, now: 0 })];
    const out = applyEvidence([{ pillar: 'context', action: 'x', basis: 'capability-gap' }], obs);
    assert.equal(out.length, 1);
    assert.equal(out[0].pillar, 'context');
    assert.equal(out[0].basis, 'capability-gap');
  });
  test('no observations -> recs returned unchanged', () => {
    assert.deepEqual(applyEvidence(recs, []), recs);
  });
});

// --- append to native/src/evidence.test.mjs ---
import { collectObservations } from './evidence.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build a throwaway ~/.claude/projects corpus. `files` maps relative jsonl paths
// (under projects/) to an array of objects; each object is written as one line.
function fakeCorpus({ projects = {}, history = [] } = {}) {
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

const bashLine = (cmd) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });

describe('collectObservations', () => {
  test('produces a manual-test-runs observation from the corpus', () => {
    const home = fakeCorpus({
      projects: {
        'slug-a/s1.jsonl': [bashLine('npx tsc --noEmit'), bashLine('npm test'), bashLine('pytest')],
      },
    });
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    const o = obs.find((x) => x.kind === 'manual-test-runs');
    assert.ok(o, 'expected a manual-test-runs observation');
    assert.equal(o.count, 3);
    assert.equal(o.pillar, 'verification');
    assert.equal(o.estimated, true);
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
    const o = obs.find((x) => x.kind === 'repasted-context');
    assert.ok(o);
    assert.equal(o.count, 1);
    assert.equal(o.pillar, 'context');
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
    assert.equal(obs.find((x) => x.kind === 'repasted-context'), undefined);
  });

  test('files older than the window are skipped (by mtime)', () => {
    const home = fakeCorpus({ projects: { 'slug-a/old.jsonl': [bashLine('npm test'), bashLine('npm test')] } });
    const old = join(home, '.claude', 'projects', 'slug-a', 'old.jsonl');
    const ancient = new Date('2000-01-01T00:00:00Z');
    utimesSync(old, ancient, ancient);
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    assert.equal(obs.find((x) => x.kind === 'manual-test-runs'), undefined);
  });

  test('missing corpus -> [] (never throws)', () => {
    const home = mkdtempSync(join(tmpdir(), 'aie-empty-'));
    assert.deepEqual(collectObservations({ home, now: Date.now() }), []);
  });

  test('a malformed line does not abort the file', () => {
    const home = mkdtempSync(join(tmpdir(), 'aie-bad-'));
    const proj = join(home, '.claude', 'projects', 'slug-a');
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, 's1.jsonl'), 'not json\n' + JSON.stringify(bashLine('npm test')) + '\n');
    const obs = collectObservations({ home, now: Date.now(), windowDays: 30 });
    assert.equal(obs.find((x) => x.kind === 'manual-test-runs').count, 1);
  });
});
