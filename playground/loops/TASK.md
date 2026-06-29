# Slugify Goal

`slugify.ts` is buggy — `bun playground/loops/check.ts` fails on the first broken case. Hand it to Claude as a goal and let it iterate until every check passes:

```
/goal bun playground/loops/check.ts passes
```

`/goal` runs turn after turn — it reads the failing case, fixes `slugify.ts`, re-runs the check, and keeps going until all 6 checks are green, then stops on its own. (`Ctrl+C` or `/goal clear` to abandon.)

## Then loop it

Once it's green, watch it on a timer with the real `/loop` command:

```
/loop 1m bun playground/loops/watch.ts
```

`watch.ts` re-runs the same checks but **never errors** (always exits 0) and prints one clean status line per tick — so you see it hold at `✅ all 6 green` every minute. `Esc` to stop.

> `/goal` = keep working **until a condition is met**, then stop. `/loop` = **re-run on a timer**. Same exercise, two commands. (Don't point `/loop` at `check.ts` — that exits 1 when red, so a failing check would just repeat. `watch.ts` is the loop-safe version.)
