// native/src/recommend.mjs
// Turn the weakest pillars into concrete install actions. A pillar already at or
// above `threshold` is dropped — the tool must be willing to say "you're good
// here" rather than manufacture needs to pad the score. `basis` records WHY the
// rec exists; here it is a capability gap. Plan 2 re-bases the highest-value recs
// on observed waste (real hours/week from JSONL).
import { subScores } from './score.mjs';

const ACTIONS = {
  verification: 'Add a hook that runs lint + typecheck + tests on every change',
  automation: 'Schedule one recurring job (e.g. weekly cleanup + summary)',
  context: 'Add a CLAUDE.md and package one repeated explanation as a skill',
  orchestration: 'Set up git worktrees so you can run agents in parallel',
  delegation: "Adopt a goal/checklist skill so \"done\" is a list, not a vibe",
};

export function recommend(signals, { threshold = 0.8 } = {}) {
  const subs = subScores(signals);
  return Object.entries(subs)
    .filter(([, value]) => value < threshold)
    .sort((a, b) => a[1] - b[1])
    .map(([pillar]) => ({ pillar, action: ACTIONS[pillar], basis: 'capability-gap' }));
}
