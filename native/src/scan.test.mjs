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
