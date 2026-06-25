# Run of show — The AI-Native Engineer (AIE SF)

A ~1-hour interactive workshop. **Not a talk** — every block is hands-on, one
presenter drives the exact same repo end-to-end (clean recording), and the room's
own data drives the [live board](../board/). Times are offsets from kickoff and are
a target, not a script.

| Offset | Block | What happens | Drives |
|--------|-------|--------------|--------|
| 0:00 | **Open** | The pitch in one breath: stop typing, start operating. Trust the repo. | — |
| 0:05 | **Block 1 — Voice coding** | [`setup-handy`](../curriculum/01-voice-coding.md) (5 min cap) → fix a bug by voice → **opening check-in** → one voice / many agents across tabs. | Board lights up with the room's toil |
| 0:25 | **Block 2 — Loops & goals** | [Goals as checklists + `/loop`](../curriculum/02-loops-and-goals.md); when to use which; parallel agents on worktrees. | — |
| 0:40 | **Block 3 — Verification gates** | [Lint/typecheck/test hook + adversarial Codex review](../curriculum/03-verification-gates.md); require the gate on the next problem. | — |
| 0:52 | **Block 4 — Scheduled tasks** | [Schedule the work they built](../curriculum/04-scheduled-tasks.md) → see it fire / get pinged → **closing check-in**. | Board migrates toil → leverage; hours-reclaimed reveal |
| 1:00 | **Close** | The board's before→after is the finale. Hand off the repo + the scheduled task they keep. | — |

## The two board moments

1. **Opening check-in (Block 1).** Everyone's toil and time-sinks appear, clustered by function. The room sees itself: *we are all drowning in the same five things.*
2. **Closing check-in (Block 4).** Dots migrate from "manual toil" to "automated," and the marquee number — **total engineering-hours/week reclaimed** — counts up. This is the recording's money shot.

## Roles

- **Presenter** drives the canonical repo journey the whole time (for the clean video).
- **Floater** (if staffed) unsticks the room and, in Block 1, narrates the "look at my fleet" moment — managing several agents' state at once.
- Solo-presenter fallback: skip the floater fleet demo; the presenter does a 3-tab version themselves.

## Pre-flight (day-of)

- Board deployed and reachable; `WORKER_URL` / `WORKER_TOKEN` set for the room (see [`../board/README.md`](../board/README.md)).
- `POST /api/admin/seed` once to confirm the projector renders, then `POST /api/admin/clear` before doors open.
- Exercise repo ([`../exercises/`](../exercises/)) checked out with seeded issues.
- Handy install path confirmed on at least one macOS and one Windows machine.
