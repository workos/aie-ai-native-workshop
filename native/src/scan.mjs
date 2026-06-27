// native/src/scan.mjs
// Scan the local environment for AI-native machinery and return raw FACTS only —
// no scoring (that is score.mjs). `home`/`cwd` are injectable so tests point at
// fixtures. Absence is a valid fact: a missing/unreadable path yields false/0,
// never a throw. This plan covers config-derived signals; Plan 2 adds
// scheduledJobs and reusableDelegationPattern from cross-machine + JSONL sources.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { summarizeDelegation } from './evidence.mjs';

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

// Count backgrounded daemon SESSIONS under ~/.claude/jobs/<short>/state.json.
// NOTE: these are NOT scheduled/recurring jobs — there is no recurrence field on
// disk anywhere under ~/.claude (verified). This is a behavioral fact used to
// JUSTIFY the Automate recommendation; it must never be read as `scheduledJobs`
// by the scorer. template:"bg" + backend:"daemon" identifies a background spawn.
export function countBackgroundJobs(home) {
  const jobsDir = join(home, '.claude', 'jobs');
  let entries;
  try {
    entries = readdirSync(jobsDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue; // skips pins.json and stray files
    const state = readJSON(join(jobsDir, e.name, 'state.json'));
    if (state && state.template === 'bg' && state.backend === 'daemon') n += 1;
  }
  return n;
}

const DAY_MS = 86_400_000;

function listSessionFiles(projectsDir) {
  let out = [];
  let slugs;
  try {
    slugs = readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const slug of slugs) {
    if (!slug.isDirectory()) continue;
    const dir = join(projectsDir, slug.name);
    let files;
    try {
      files = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.isFile() && f.name.endsWith('.jsonl')) out.push(join(dir, f.name));
    }
  }
  return out;
}

// "Did they build a reusable delegation habit?" = Task tool_use calls appearing
// in >= 2 DISTINCT sessions within the window. One Task call is a one-off, not a
// pattern. Per-session file == per-session transcript on this CLI (subagent runs
// are separate session files, not inline isSidechain lines), so distinct files
// with >=1 Task call == distinct delegating sessions. Total: never throws.
export function detectDelegation(home, { now = Date.now(), windowDays = 90 } = {}) {
  const files = listSessionFiles(join(home, '.claude', 'projects'));
  let delegationSessions = 0;
  let taskCalls = 0;
  for (const file of files) {
    let mtime;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtime > windowDays * DAY_MS) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        lines.push(JSON.parse(t));
      } catch {
        /* skip bad line */
      }
    }
    const { taskCalls: calls } = summarizeDelegation(lines);
    if (calls > 0) {
      delegationSessions += 1;
      taskCalls += calls;
    }
  }
  return { reusableDelegationPattern: delegationSessions >= 2, delegationSessions, taskCalls };
}

export function scan({ home = homedir(), cwd = process.cwd() } = {}) {
  const claudeDir = join(home, '.claude');
  const settings = readJSON(join(claudeDir, 'settings.json')) ?? {};
  const mcpFromSettings = Object.keys(settings.mcpServers ?? {}).length;
  const mcpFromFile = Object.keys(readJSON(join(claudeDir, '.mcp.json'))?.mcpServers ?? {}).length;
  const deleg = detectDelegation(home);
  return {
    hooks: detectHooks(settings),
    skills: countDirs(join(claudeDir, 'skills')),
    mcpServers: Math.max(mcpFromSettings, mcpFromFile),
    claudeMd: existsSync(join(cwd, 'CLAUDE.md')) || existsSync(join(claudeDir, 'CLAUDE.md')),
    worktrees: countWorktrees(cwd),
    // Hard signals for scoring. scheduledJobs is 0 from disk on purpose: there is
    // no on-disk recurrence marker anywhere under ~/.claude, so we do NOT pretend
    // background sessions are schedules (see behavior.backgroundJobs instead).
    scheduledJobs: 0,
    reusableDelegationPattern: deleg.reusableDelegationPattern,
    // Non-scoring behavioral facts (justify recommendations only — never scored).
    behavior: {
      backgroundJobs: countBackgroundJobs(home),
      delegationSessions: deleg.delegationSessions,
      taskCalls: deleg.taskCalls,
    },
  };
}
