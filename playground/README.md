# Playground Exercises

Small, offline-safe exercises for practicing agentic workflows with Bun. These are plain scripts, not `bun test` files, so the repo test suite does not auto-discover them.

| Exercise | Practice | Say to Claude | Verify |
| --- | --- | --- | --- |
| [`loops/`](loops/) | Autonomous loop | "Run `bun playground/loops/check.ts` in a loop, fixing `playground/loops/slugify.ts` until it passes." | `bun playground/loops/check.ts` |
| [`goals/`](goals/) | Goal + checklist | "Work through `playground/goals/TASK.md` until `bun playground/goals/check.ts` shows 5/5." | `bun playground/goals/check.ts` |
| [`scheduled/`](scheduled/) | Scheduled task | "Schedule `bun playground/scheduled/report.ts` to run every 2 minutes. Name it workshop-report." | `bun playground/scheduled/report.ts` |

The scheduled exercise writes to [`scheduled/log.txt`](scheduled/log.txt), so repeated runs are easy to see.
