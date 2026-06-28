# loop-analyzer *(planned — Nick)*

A personal, **fully-local** skill an attendee builds during the workshop to understand
their *own* loop: it reads how they actually work with their agents — their last ~30
days of Claude Code transcripts, and optionally their own repos — and opines on where
their time leaks and which hooks and scheduled tasks would buy the most of it back.

> **Status: planned — spec only.** This README is the spec so the skill can be built
> cleanly. When it exists it becomes a runnable `SKILL.md` here (same shape as
> [`../setup-handy/SKILL.md`](../setup-handy/SKILL.md) and
> [`../coach-checkin/SKILL.md`](../coach-checkin/SKILL.md)). It is a README for now on
> purpose: trusting the repo auto-loads every `SKILL.md`, and a half-built skill
> shouldn't fire mid-workshop.

## Why it's separate from the coach

The [`coach-checkin`](../coach-checkin/) skill and the MCP coach in
[`native/src/coach/`](../../native/src/coach/) **transmit** — they post to the live room board and the
projector. So they are **volunteered-only**: nothing is ever scanned off the machine;
only what the participant typed and confirmed is sent.

This skill is the other half of the original idea, filed correctly — the
personalization that *reads your transcripts*. It is safe precisely because it
**never transmits.**

> **The invariant:** the privacy rule governs **data leaving the machine**, not what a
> local tool may read. The coach transmits → volunteered-only. The loop-analyzer reads
> local data → it stays local, full stop.

Two artifacts, two data rules — and they never blur:

| | Reads local data? | Transmits? | Data rule |
|---|---|---|---|
| **Coach** (`coach-checkin` / `native/src/coach`) | No | Yes (board) | Volunteered + confirmed only |
| **loop-analyzer** (this) | Yes (transcripts, repos) | **No** | Stays on the machine |

## What it does

- **Reads the attendee's own agent history**, locally:
  - Claude Code session transcripts (`~/.claude/projects/**/*.jsonl`) — last ~30 days.
  - Optionally their own Git repos / `git log` on disk.
  - Stretch: Codex (and other agents) so it covers ~90% of the room, not just Claude users.
- **Finds where their loop leaks time** — prompts they repeat, the same context
  re-explained every session, manual steps that recur, work that always lands at the
  same time of week.
- **Recommends concrete machinery** — the specific hooks and scheduled tasks that would
  pay off most, each with a rough hours/week estimate — so the Block 3/4 exercises
  target *their* real toil, not a generic example.
- **Outputs a personal report** the attendee keeps: a short ranked list of "build these
  hooks / schedule these tasks," grounded in their own usage.

## Hard rule: it never leaves the machine

- **No network.** The analyzer reads local files and writes a local report. It does not
  POST anywhere — not to the board, not to any server, not to us.
- **One-directional gate.** If an attendee *chooses* to contribute a finding to the room
  (e.g. "my top missing hook"), that crossing goes back through the coach's
  volunteered/confirmed gate — they share a **conclusion they picked**, never the raw
  scan. The analyzer itself never initiates a send.
- This mirrors [`coach-checkin`](../coach-checkin/)'s rule from the opposite side and
  keeps [`../../docs/design.md`](../../docs/design.md)'s non-negotiable line intact.

## Shape (proposed)

- A skill (`SKILL.md` + `scripts/`) an attendee runs on their own machine — ideally one
  they assemble *during* the workshop, since building it is itself the lesson.
- A read-only transcript parser over `~/.claude/projects/**/*.jsonl` that buckets
  activity (what they ask for most, what they repeat) without sending anything.
- A local markdown report ranking suggested hooks / scheduled tasks by estimated
  hours/week reclaimed.

## When it fires (proposed triggers)

"analyze my loop" / "where am I wasting time with my agents" / "what hooks should I
build" / "what should I schedule" — run after voice coding is set up, as the bridge
into the hooks (Block 3) and scheduled-tasks (Block 4) exercises.
