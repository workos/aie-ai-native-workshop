# Slugify Goal

`slugify.ts` is buggy — `bun playground/loops/check.ts` fails on the first broken case. Hand it to Claude as a goal and let it iterate until every check passes:

```
/goal bun playground/loops/check.ts passes
```

`/goal` runs turn after turn — it reads the failing case, fixes `slugify.ts`, re-runs the check, and keeps going until all 6 checks are green, then stops on its own. (`Ctrl+C` or `/goal clear` to abandon.)

> Use `/goal` here, **not** `/loop`. `/goal` = keep working until a condition is met. `/loop` just re-runs a command on a timer — point it at a failing check and it'll just fail on repeat. (You'll use `/loop` for real recurring work in the scheduled-tasks block.)
