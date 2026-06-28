// native/src/recommend.ts
// Turn the weakest pillars into concrete install actions. A pillar already at or
// above `threshold` is dropped — the tool must be willing to say "you're good
// here" rather than manufacture needs to pad the score. `basis` records WHY the
// rec exists; here it is a capability gap. Plan 2 re-bases the highest-value recs
// on observed waste (real hours/week from JSONL).
import { subScores } from './score.ts';
import { applyEvidence } from './evidence.ts';
import type {
  PillarId,
  Recommendation,
  RecommendOptions,
  ScoreInput,
} from './types.ts';

const ACTIONS: Record<PillarId, string> = {
  verification: 'Add a hook that runs lint + typecheck + tests on every change',
  automation: 'Schedule one recurring job (e.g. weekly cleanup + summary)',
  context: 'Add a CLAUDE.md and package one repeated explanation as a skill',
  orchestration: 'Set up git worktrees so you can run agents in parallel',
  delegation: "Adopt a goal/checklist skill so \"done\" is a list, not a vibe",
};

export function recommend(
  signals: ScoreInput,
  { threshold = 0.8, observations = [] }: RecommendOptions = {},
): Recommendation[] {
  const subs = subScores(signals);
  const gaps: Recommendation[] = Object.entries(subs)
    .filter(([, value]) => value < threshold)
    .sort((a, b) => a[1] - b[1])
    .map(([pillar]) => ({ pillar: pillar as PillarId, action: ACTIONS[pillar as PillarId], basis: 'capability-gap' }));
  // Evidence only re-bases/justifies the gap recs we already chose — it never adds
  // a rec for a strong pillar and never re-orders the score-derived priority.
  return applyEvidence(gaps, observations);
}
