# Exercises

The repo attendees actually build on. It's the single, coherent codebase the
presenter drives end-to-end so the recording is one clean journey.

> **Status: stub.** The exercise app is forked/adapted from an existing WorkOS bot
> codebase (faster than greenfield). This README is the spec for what it needs to contain.

## What the exercise app must provide

The app should be **local-first** (no creds, no cloud, no conference-Wi-Fi dependency
to *run* it) and a little bit fun — the meme-generator energy of workshop #1, not a
dry to-do list. It exists to give each block something real to do:

| Block | What the repo needs |
|-------|---------------------|
| [1 — Voice coding](../curriculum/01-voice-coding.md) | A seeded, obvious bug to fix by voice; enough surface area to run a refactor + a second fix + a non-code task across three tabs. |
| [2 — Loops & goals](../curriculum/02-loops-and-goals.md) | Issues whose body is a **checklist of subtasks** ("not done until every box is checked"); a work-list a `/loop` can chew through. |
| [3 — Verification gates](../curriculum/03-verification-gates.md) | A lint/typecheck/test setup a hook can run; a change risky enough to justify an adversarial Codex review. |
| [4 — Scheduled tasks](../curriculum/04-scheduled-tasks.md) | A natural recurring job — the *same* work from Blocks 1–3, schedulable (e.g. "fix top lint + draft a post, every Monday"). |

## Issue format (Block 2)

Each seeded issue should read like:

```markdown
## Fix the flaky <thing>

You are NOT done until every box is checked:
- [ ] Reproduce the failure
- [ ] Write a failing test
- [ ] Fix the root cause
- [ ] All gates green (lint, typecheck, tests)
- [ ] Short note in CHANGELOG
```

That checklist *is* the spec the agent holds itself to.

## TODO

- [ ] Pick the fork source and strip it to a clean, fun, local-only app.
- [ ] Seed 3–5 checklist issues sized small (finished-small beats half-done-big).
- [ ] Wire a fast lint/typecheck/test command the Block 3 hook can call.
- [ ] Confirm the Block 4 scheduled task closes the loop opened in Block 1.
