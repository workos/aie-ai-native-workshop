# Block 1 — Voice coding (hands off the keyboard)

**~20 min · the on-ramp.** Everyone gets off the keyboard and drives Claude by voice, then learns the real unlock: one voice, many agents.

## The arc

1. **Set up Handy (5 min, capped).** Each attendee points Claude at the repo:
   > "Set up Handy for me."

   That fires the [`setup-handy`](../.claude/skills/setup-handy/) skill — install, model download, mic + accessibility permissions, hotkey, and a live dictation test. Handy is **free and fully local** (no card, no cloud, works on conference Wi-Fi). Hard cap: 5 minutes. Anyone still stuck pairs with a neighbor and keeps moving.

2. **First voice loop.** With Handy live, fix a real bug in a repo you bring (or this one) entirely by voice. Goal: feel how fast intent → change is when you talk at 184+ wpm instead of typing.

3. **Run the opening check-in.** While the room settles, each person runs:
   > "Run my workshop check-in."

   The [`coach-checkin`](../skills/coach-checkin/) skill interviews them (role, biggest time sink, worst manual friction, what they want to automate) and posts it — **anonymously, volunteered answers only** — to the [live board](../board/). The room watches its own toil light up on the projector.

4. **The wow: one voice, many agents.** Open three terminal tabs. By voice, start three things at once:
   - Tab A: a larger refactor in the exercise repo.
   - Tab B: a second, independent fix.
   - Tab C: something that isn't code at all (draft a short post about the fix).

   Keep talking — kick off the next agent while the last one works. The point lands physically: your voice is the bottleneck remover, and you can manufacture work in parallel.

## What they leave with

- Handy installed and working.
- The instinct that voice + multiple agents compresses a morning's work into minutes.
- Their workflow on the board — the setup for Blocks 2–4, where we automate the toil they just named.

## Facilitator notes

- One presenter drives the *exact same repo* the whole time so the recording is a clean, single journey.
- Don't evangelize a paid dictation tool. Handy by design.
- If Accessibility permission trips someone up, that's the #1 cause — fix it fast and move on.
