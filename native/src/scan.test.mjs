// native/src/scan.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, detectHooks } from './scan.mjs';

// Build a throwaway ~/.claude under a temp HOME; `setup` receives the .claude dir.
function fakeHome(setup) {
  const home = mkdtempSync(join(tmpdir(), 'aie-home-'));
  const claude = join(home, '.claude');
  mkdirSync(claude, { recursive: true });
  setup(claude);
  return home;
}

describe('detectHooks', () => {
  test('flags lint/test commands anywhere in hooks', () => {
    const r = detectHooks({ hooks: { PostToolUse: [{ hooks: [{ command: 'npm run lint && npm test' }] }] } });
    assert.equal(r.any, true);
    assert.equal(r.lintTest, true);
  });

  test('hooks present but no lint/test -> any true, lintTest false', () => {
    const r = detectHooks({ hooks: { Stop: [{ hooks: [{ command: 'echo done' }] }] } });
    assert.equal(r.any, true);
    assert.equal(r.lintTest, false);
  });

  test('no hooks -> all false', () => {
    const r = detectHooks({});
    assert.equal(r.any, false);
    assert.equal(r.lintTest, false);
  });
});

describe('scan', () => {
  test('reads hooks, skills, and mcp from a fake home', () => {
    const home = fakeHome((claude) => {
      writeFileSync(join(claude, 'settings.json'), JSON.stringify({
        hooks: { PostToolUse: [{ hooks: [{ command: 'pytest' }] }] },
        mcpServers: { sessions: {}, granola: {} },
      }));
      mkdirSync(join(claude, 'skills', 'alpha'), { recursive: true });
      mkdirSync(join(claude, 'skills', 'beta'), { recursive: true });
    });
    const cwd = mkdtempSync(join(tmpdir(), 'aie-cwd-'));
    const s = scan({ home, cwd });
    assert.equal(s.hooks.lintTest, true);
    assert.equal(s.skills, 2);
    assert.equal(s.mcpServers, 2);
    assert.equal(s.claudeMd, false);
    assert.equal(s.worktrees, 0); // temp cwd is not a git repo
  });

  test('empty home -> zeroed signals, never throws', () => {
    const home = fakeHome(() => {});
    const cwd = mkdtempSync(join(tmpdir(), 'aie-cwd-'));
    const s = scan({ home, cwd });
    assert.equal(s.hooks.any, false);
    assert.equal(s.skills, 0);
    assert.equal(s.mcpServers, 0);
  });
});

// --- append to native/src/scan.test.mjs ---
import { countBackgroundJobs, detectDelegation } from './scan.mjs';

function jobsHome(setup) {
  const home = mkdtempSync(join(tmpdir(), 'aie-jobs-'));
  const claude = join(home, '.claude');
  mkdirSync(claude, { recursive: true });
  setup(claude);
  return home;
}

describe('countBackgroundJobs', () => {
  test('counts jobs/<short>/state.json with template:bg + backend:daemon', () => {
    const home = jobsHome((claude) => {
      const a = join(claude, 'jobs', '2774fdfa');
      const b = join(claude, 'jobs', 'c9d7acd4');
      mkdirSync(a, { recursive: true });
      mkdirSync(b, { recursive: true });
      writeFileSync(join(a, 'state.json'), JSON.stringify({ template: 'bg', backend: 'daemon', state: 'done' }));
      writeFileSync(join(b, 'state.json'), JSON.stringify({ template: 'bg', backend: 'daemon', state: 'failed' }));
      writeFileSync(join(claude, 'jobs', 'pins.json'), '[]'); // not a job dir
    });
    assert.equal(countBackgroundJobs(home), 2);
  });
  test('no jobs dir -> 0, never throws', () => {
    assert.equal(countBackgroundJobs(mkdtempSync(join(tmpdir(), 'aie-nojobs-'))), 0);
  });
});

describe('detectDelegation', () => {
  const taskLine = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Task', input: { description: 'd', prompt: 'p', subagent_type: 'Explore' } }] } };
  function corpusHome(perSession) {
    const home = mkdtempSync(join(tmpdir(), 'aie-deleg-'));
    const proj = join(home, '.claude', 'projects', 'slug-a');
    mkdirSync(proj, { recursive: true });
    for (const [name, objs] of Object.entries(perSession)) {
      writeFileSync(join(proj, name), objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
    }
    return home;
  }
  test('Task calls in >=2 distinct sessions -> reusable pattern true', () => {
    const home = corpusHome({ 's1.jsonl': [taskLine], 's2.jsonl': [taskLine] });
    const r = detectDelegation(home, { now: Date.now(), windowDays: 365 });
    assert.equal(r.reusableDelegationPattern, true);
    assert.equal(r.delegationSessions, 2);
    assert.equal(r.taskCalls, 2);
  });
  test('a single Task call in one session is NOT a pattern', () => {
    const home = corpusHome({ 's1.jsonl': [taskLine] });
    const r = detectDelegation(home, { now: Date.now(), windowDays: 365 });
    assert.equal(r.reusableDelegationPattern, false);
    assert.equal(r.delegationSessions, 1);
  });
  test('no corpus -> false/0, never throws', () => {
    const r = detectDelegation(mkdtempSync(join(tmpdir(), 'aie-nodeleg-')), { now: Date.now() });
    assert.equal(r.reusableDelegationPattern, false);
    assert.equal(r.taskCalls, 0);
  });
});

describe('scan (evidence-layer additions)', () => {
  test('scheduledJobs is always 0 from disk; behavior carries backgroundJobs', () => {
    const home = jobsHome((claude) => {
      const a = join(claude, 'jobs', 'x');
      mkdirSync(a, { recursive: true });
      writeFileSync(join(a, 'state.json'), JSON.stringify({ template: 'bg', backend: 'daemon' }));
    });
    const cwd = mkdtempSync(join(tmpdir(), 'aie-cwd-'));
    const s = scan({ home, cwd });
    assert.equal(s.scheduledJobs, 0);                 // honest: no on-disk recurrence
    assert.equal(s.behavior.backgroundJobs, 1);       // the real fact we DO have
    assert.equal(typeof s.reusableDelegationPattern, 'boolean');
  });
});
