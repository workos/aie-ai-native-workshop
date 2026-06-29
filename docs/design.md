# Design notes

Why this workshop is built the way it is. The constraints came out of two prior
workshops (GHX London + Denver) and one hard-won lesson: **interactive beats
talking-at-people, every time.**

## Principles

1. **Make them do it, don't show them.** If we talk for 80 minutes they get bored;
   if we have them run off-the-shelf tools they learn nothing new. The value is the
   *glue* — how voice, loops, gates, and schedules fit together the way operators
   actually use them. That glue is the curriculum.

2. **One coherent journey.** Voice coding → loops & goals → verification gates →
   scheduled tasks, building on a single repo, ending with the *same* artifact they
   built now running on a schedule. One presenter drives the canonical path so the
   recording is a clean, re-watchable reproduction.

3. **Built from this room — you choose what's shared.** The [board](../board/) shows the room its own data —
   where the toil is, what to automate, hours/week reclaimed. People feel seen, and
   the before→after is the emotional payload. (This is the same insight that made the
   GHX glossary/RAG work: surface what people *volunteer*, beautifully.)

4. **Privacy is non-negotiable.** Anything that *leaves* the machine is volunteered-only —
   the coach sends only what a person typed and confirmed. **No machine scanning** — we
   never read repos, `git log`, or transcripts and ship them to our server; we *encourage*
   volunteering through good questions, we never fetch. Reading your *own* usage with a
   tool that **never transmits** is a different thing — that's the
   [`loop-analyzer`](../skills/loop-analyzer/), whose output stays local. The line is about
   data leaving the machine, not what a local tool may read. A hard line, not a guideline.

5. **Conference-proof.** Local-first where possible: Handy runs on-device; the board
   keeps the last good frame when Wi-Fi flaps; the interview skill writes to an outbox
   if the board is unreachable. Nothing critical depends on a perfect network.

## The board, specifically

The board is adapted from the GHX live-survey service (Cloudflare Worker + D1 +
two-tier AI: Haiku per-submission enrichment, Opus room synthesis, lazily throttled
to bound cost). Repurposed axis: **toil → leverage** (0 = all manual, 100 = automated).
New marquee: **engineering-hours/week reclaimed**, summed from the AI's per-answer
estimates. New panel: the **top hooks and scheduled tasks** the room should build.
See [`../board/README.md`](../board/README.md).

## Open questions / roadmap

- **MCP coach.** Graduate `coach-checkin` into a live in-session MCP coach
  (`native/src/coach/`, booted via `bun native/src/cli.ts --mcp`) that guides
  step-to-step and runs the interview through the question tool. *Decided:*
  the coach (transmits → volunteered-only) and the
  [`loop-analyzer`](../skills/loop-analyzer/) (reads local data → never transmits) are
  **two separate artifacts**, two data rules — see [`../skills/README.md`](../skills/README.md).
- **The fun artifact.** Decide the compelling, slightly-playful thing the repo builds
  (the meme-generator energy from workshop #1) so the journey has joy, not just utility.
- **Post-workshop RAG.** A small endpoint that answers "how do I do X from the workshop"
  afterward (see [`../post-workshop/`](../post-workshop/)).
