# Scheduled report

`report.ts` runs fully offline: it prints a short digest and appends **one line to `log.txt` every run** — so a recurring job is easy to *watch*. The schedule itself lives in Claude Code, not this repo. Two real ways to run it on a timer:

1. **Dry-run it once** (see the output shape):

   ```
   bun playground/scheduled/report.ts
   ```

2. **Loop it locally — fast, for the demo.** Re-runs on a timer in this session:

   ```
   /loop 2m bun playground/scheduled/report.ts
   ```

   Watch `log.txt` gain a line every couple of minutes (`run #1`, `run #2`, …). Press **`Esc`** to stop the loop.

3. **Or schedule it for real — persistent, runs even when you're offline:**

   ```
   /schedule every weekday at 9am, run bun playground/scheduled/report.ts and summarize the digest
   ```

   Cloud routines run from a fresh clone on a ≥1-hour cadence — perfect for real work, too slow to watch live (that's what step 2 is for).

4. **See what's scheduled:**

   ```
   /schedule list
   ```

5. **Tear it down before moving on:** for the local loop, press `Esc` (or `CronDelete <id>`); for a cloud routine, ask Claude to cancel it or manage it at `claude.ai/code/routines`.

> `/loop` = re-run on a timer (local, this session). `/schedule` = a persistent routine on Anthropic's cloud. Different tools, same idea: work that runs without you.
