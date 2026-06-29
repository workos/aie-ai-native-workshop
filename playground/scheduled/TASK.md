# Scheduled Report

This is a guided exercise because the schedule lives in Claude Code, not in this repo. The script itself is fully runnable offline and appends one line to `playground/scheduled/log.txt` every time it runs.

1. Dry run it:
   `bun playground/scheduled/report.ts`
2. Ask Claude:
   "Schedule `bun playground/scheduled/report.ts` to run every 2 minutes. Name it workshop-report."
3. Watch the log grow:
   "Show me the last 5 lines of `playground/scheduled/log.txt`."
4. List schedules:
   "List my scheduled tasks."
5. Cancel it before moving on:
   "Cancel the scheduled task named workshop-report."

For a real workflow, use a daily or weekly cadence instead of the short demo interval.
