// native/src/scan.ts
// Scan the local environment for AI-native machinery and return raw FACTS only —
// no scoring (that is score.ts). `home`/`cwd` are injectable so tests point at
// fixtures. Absence is a valid fact: a missing/unreadable path yields false/0,
// never a throw. This plan covers config-derived signals; Plan 2 adds
// scheduledJobs and reusableDelegationPattern from cross-machine + JSONL sources.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { summarizeDelegation } from './evidence.ts';
import type { TranscriptLine } from './evidence.ts';
import type { Hooks, Signals } from './types.ts';

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Verification credit is STRUCTURAL: do you have hooks wired at all? We do not
// grep hook command text for keywords — that only matches whatever words happen
// to be in one machine's config. "You have a gate" is the honest, robust signal;
// what the gate runs is up to you.
export function detectHooks(settings: { hooks?: Record<string, unknown> } | null | undefined): Hooks {
  const groups = settings?.hooks ?? {};
  return { any: Object.keys(groups).length > 0 };
}

function countDirs(path: string): number {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

function countWorktrees(cwd: string): number {
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
export function countBackgroundJobs(home: string): number {
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
    const state = readJSON(join(jobsDir, e.name, 'state.json')) as { template?: unknown; backend?: unknown } | null;
    if (state && state.template === 'bg' && state.backend === 'daemon') n += 1;
  }
  return n;
}

const DAY_MS = 86_400_000;

// Skip pathologically large transcripts: readFileSync slurps the whole file into a
// single string, and a multi-GB JSONL (e.g. a long-running observer session) blows
// past the JS engine's string/buffer limit and OOM-kills the process with no catchable
// error. Real coding transcripts are well under this; absence of a giant file's signal
// is a fine tradeoff against crashing the scan.
const MAX_TRANSCRIPT_BYTES = 100 * 1024 * 1024;

function listSessionFiles(projectsDir: string): string[] {
  let out: string[] = [];
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
export function detectDelegation(
  home: string,
  { now = Date.now(), windowDays = 90 }: { now?: number; windowDays?: number } = {},
): { reusableDelegationPattern: boolean; delegationSessions: number; taskCalls: number } {
  const files = listSessionFiles(join(home, '.claude', 'projects'));
  let delegationSessions = 0;
  let taskCalls = 0;
  for (const file of files) {
    let st;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    if (now - st.mtimeMs > windowDays * DAY_MS) continue;
    if (st.size > MAX_TRANSCRIPT_BYTES) continue; // would OOM readFileSync below
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines: TranscriptLine[] = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        lines.push(JSON.parse(t) as TranscriptLine);
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

export function scan({ home = homedir(), cwd = process.cwd() }: { home?: string; cwd?: string } = {}): Signals {
  const claudeDir = join(home, '.claude');
  const settings = (readJSON(join(claudeDir, 'settings.json')) ?? {}) as { hooks?: Record<string, unknown>; mcpServers?: Record<string, unknown> };
  const mcpFromSettings = Object.keys(settings.mcpServers ?? {}).length;
  const mcpFromFile = Object.keys((readJSON(join(claudeDir, '.mcp.json')) as { mcpServers?: Record<string, unknown> } | null)?.mcpServers ?? {}).length;
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
