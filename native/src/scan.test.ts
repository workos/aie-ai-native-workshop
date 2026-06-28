// native/src/scan.test.ts
import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, detectHooks } from './scan.ts';

// Build a throwaway ~/.claude under a temp HOME; `setup` receives the .claude dir.
function fakeHome(setup: (claude: string) => void): string {
  const home = mkdtempSync(join(tmpdir(), 'aie-home-'));
  const claude = join(home, '.claude');
  mkdirSync(claude, { recursive: true });
  setup(claude);
  return home;
}

describe('detectHooks', () => {
  test('flags lint/test commands anywhere in hooks', () => {
    const r = detectHooks({ hooks: { PostToolUse: [{ hooks: [{ command: 'npm run lint && npm test' }] }] } });
    expect(r.any).toBe(true);
    expect(r.lintTest).toBe(true);
  });

  test('hooks present but no lint/test -> any true, lintTest false', () => {
    const r = detectHooks({ hooks: { Stop: [{ hooks: [{ command: 'echo done' }] }] } });
    expect(r.any).toBe(true);
    expect(r.lintTest).toBe(false);
  });

  test('no hooks -> all false', () => {
    const r = detectHooks({});
    expect(r.any).toBe(false);
    expect(r.lintTest).toBe(false);
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
    expect(s.hooks.lintTest).toBe(true);
    expect(s.skills).toBe(2);
    expect(s.mcpServers).toBe(2);
    expect(s.claudeMd).toBe(false);
    expect(s.worktrees).toBe(0); // temp cwd is not a git repo
  });

  test('empty home -> zeroed signals, never throws', () => {
    const home = fakeHome(() => {});
    const cwd = mkdtempSync(join(tmpdir(), 'aie-cwd-'));
    const s = scan({ home, cwd });
    expect(s.hooks.any).toBe(false);
    expect(s.skills).toBe(0);
    expect(s.mcpServers).toBe(0);
  });
});

// --- append to native/src/scan.test.ts ---
import { countBackgroundJobs, detectDelegation } from './scan.ts';

function jobsHome(setup: (claude: string) => void): string {
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
    expect(countBackgroundJobs(home)).toBe(2);
  });
  test('no jobs dir -> 0, never throws', () => {
    expect(countBackgroundJobs(mkdtempSync(join(tmpdir(), 'aie-nojobs-')))).toBe(0);
  });
});

describe('detectDelegation', () => {
  const taskLine = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Task', input: { description: 'd', prompt: 'p', subagent_type: 'Explore' } }] } };
  function corpusHome(perSession: Record<string, unknown[]>): string {
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
    expect(r.reusableDelegationPattern).toBe(true);
    expect(r.delegationSessions).toBe(2);
    expect(r.taskCalls).toBe(2);
  });
  test('a single Task call in one session is NOT a pattern', () => {
    const home = corpusHome({ 's1.jsonl': [taskLine] });
    const r = detectDelegation(home, { now: Date.now(), windowDays: 365 });
    expect(r.reusableDelegationPattern).toBe(false);
    expect(r.delegationSessions).toBe(1);
  });
  test('no corpus -> false/0, never throws', () => {
    const r = detectDelegation(mkdtempSync(join(tmpdir(), 'aie-nodeleg-')), { now: Date.now() });
    expect(r.reusableDelegationPattern).toBe(false);
    expect(r.taskCalls).toBe(0);
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
    expect(s.scheduledJobs).toBe(0);                 // honest: no on-disk recurrence
    expect(s.behavior.backgroundJobs).toBe(1);       // the real fact we DO have
    expect(typeof s.reusableDelegationPattern).toBe('boolean');
  });
});
