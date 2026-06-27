// native/src/scan.mjs
// Scan the local environment for AI-native machinery and return raw FACTS only —
// no scoring (that is score.mjs). `home`/`cwd` are injectable so tests point at
// fixtures. Absence is a valid fact: a missing/unreadable path yields false/0,
// never a throw. This plan covers config-derived signals; Plan 2 adds
// scheduledJobs and reusableDelegationPattern from cross-machine + JSONL sources.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// True if any hook command looks like it lints/typechecks/tests.
export function detectHooks(settings) {
  const groups = settings?.hooks ?? {};
  const any = Object.keys(groups).length > 0;
  const blob = JSON.stringify(groups).toLowerCase();
  const lintTest = /\b(lint|tsc|typecheck|type-check|test|vitest|jest|pytest)\b/.test(blob);
  return { any, lintTest };
}

function countDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

function countWorktrees(cwd) {
  try {
    const out = execFileSync('git', ['worktree', 'list'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0; // not a git repo, or git absent
  }
}

export function scan({ home = homedir(), cwd = process.cwd() } = {}) {
  const claudeDir = join(home, '.claude');
  const settings = readJSON(join(claudeDir, 'settings.json')) ?? {};
  const mcpFromSettings = Object.keys(settings.mcpServers ?? {}).length;
  const mcpFromFile = Object.keys(readJSON(join(claudeDir, '.mcp.json'))?.mcpServers ?? {}).length;
  return {
    hooks: detectHooks(settings),
    skills: countDirs(join(claudeDir, 'skills')),
    mcpServers: Math.max(mcpFromSettings, mcpFromFile),
    claudeMd: existsSync(join(cwd, 'CLAUDE.md')) || existsSync(join(claudeDir, 'CLAUDE.md')),
    worktrees: countWorktrees(cwd),
  };
}
