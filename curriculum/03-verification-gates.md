# Block 3 — Verification gates (make it trustworthy)

**~12 min.** A loop or goal is only as good as what it has to *pass* before it claims success. This is where operators separate from tinkerers: you wrap the agent in gates it can't skip.

## The arc

1. **The cheapest gate: a hook that always runs.** Add a hook that lints, type-checks, and compiles on every edit (or pre-commit). The agent can no longer hand you code that doesn't build — the gate fails it and it fixes itself. Have them ask:
   > "Add a hook that runs lint + typecheck + the tests on every change, and fix anything it flags."

   They watch a green/red gate appear in the loop and change the agent's behavior instantly.

2. **The adversarial gate: fan out to Codex.** For any change that's complex or sensitive enough, the agent should — by its own decision point — fan out to the **Codex CLI** for an independent, adversarial review, then fix everything that review surfaces.

   ```bash
   # default model is gpt-5.5 (NOT gpt-5.5-codex) when invoking the codex CLI
   codex exec "Adversarially review this diff. List concrete bugs, security issues, and missed edge cases."
   ```

   Two models disagreeing and reconciling catches what one model alone rationalizes past.

3. **Require the gate on the next problem.** Re-run a Block 2 issue, but this time the rule is: *this skill / this hook must be used.* They feel the difference between "the agent said it's done" and "the gates say it's done."

## What they leave with

- A repo with a real lint/typecheck/test hook wired into the agent loop.
- The adversarial-review reflex: spawn a second opinion on risky changes and act on it.
- The operator's definition of done: **gates pass**, not "the model sounds confident."

## Facilitator notes

- Keep gates basic and fast — a hook that takes 30s kills the loop's momentum.
- This is the highest-leverage block for the room's most experienced engineers; let them push it.
- Tie back to the board: every gate they add is hours/week they stop spending on manual review.
