// native/src/score.ts
// The rubric: raw signals (facts on disk) -> a 0..1 sub-score per pillar, then a
// weighted 0..100 total. Pure and deterministic — the same signals must always
// produce the same number. The constants here are the calibration surface: tune
// them in a dry-run so a typical room lands ~30 before / ~70 after.
import { PILLARS } from './pillars.ts';
import type { ScoreInput, SubScores, Score } from './types.ts';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function subScores(signals: ScoreInput): SubScores {
  const s = signals ?? {};
  const scheduled = s.scheduledJobs ?? 0;
  const worktrees = s.worktrees ?? 0;
  return {
    verification: s.hooks?.lintTest ? 1 : (s.hooks?.any ? 0.4 : 0),
    automation: scheduled >= 2 ? 1 : (scheduled === 1 ? 0.6 : 0),
    context: clamp01(
      (s.claudeMd ? 0.4 : 0) +
      (Math.min(s.skills ?? 0, 4) / 4) * 0.4 +
      (Math.min(s.mcpServers ?? 0, 2) / 2) * 0.2,
    ),
    orchestration: worktrees >= 2 ? 1 : (worktrees === 1 ? 0.6 : 0),
    delegation: s.reusableDelegationPattern ? 1 : 0,
  };
}

export function score(signals: ScoreInput): Score {
  const pillars = subScores(signals);
  const total = PILLARS.reduce((sum, p) => sum + pillars[p.id] * p.weight, 0);
  return { pillars, total: Math.round(total * 100) };
}
