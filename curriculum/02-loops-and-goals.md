# Block 2 — Loops & goals (let it run)

**~15 min.** Now that they can drive by voice, teach the two ways to hand an agent a *multi-step* job and walk away: a **goal** with a checklist, and a **loop** that self-paces.

## The arc

1. **Goals: "done" is a checklist, not a vibe.** The [`../exercises/`](../exercises/) repo ships issues whose description is a list of subtasks with checkboxes — *you are not done until every box is checked.* Point an agent at one:
   > "Work this issue. It's not done until every todo is checked off."

   They watch the agent decompose, work each subtask, and hold itself to the list. The lesson: encode "done" explicitly and the agent stops declaring victory early.

2. **Loops: self-paced, recurring work.** Introduce `/loop` — run a prompt or slash command on an interval, or let the model self-pace until a condition is met. Use it for "keep going until the suite is green" or "process this work-list one item at a time."

3. **When to use which.** A quick, opinionated rule of thumb:
   - **Goal / checklist** → a single bounded job with known steps. The checklist *is* the spec.
   - **Loop** → unknown-size or recurring work; you want it to keep going without re-prompting.
   - They compose: a loop whose body is "advance the goal's checklist by one item."

4. **Scale it.** Combine with Block 1: drive several goal-driven agents across tabs by voice, each on its own git worktree so they never collide. This is the operator move — many agents, isolated, ripping in parallel.

## What they leave with

- A finished issue where *they* defined "done" and the agent respected it.
- A working mental model of goal vs. loop, and the worktree pattern for parallel agents.

## Facilitator notes

- Keep the issues genuinely small — people are at the level they're at; a finished small thing beats a half-done big thing.
- This block sets up Block 3: loops and goals are only as good as their **verification gates**.
