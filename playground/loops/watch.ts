// Watch mode for the slugify exercise — made to be LOOPED on a timer:
//   /loop 30s bun playground/loops/watch.ts
// It re-runs the same checks as check.ts but NEVER fails (always exits 0) and
// prints one clean status line per tick. Loop it and watch the count hold at
// ✅ (or climb as a fix lands). Contrast with the goal command:
//   /goal  …/check.ts passes  → fixes until done, then stops
//   /loop  …/watch.ts         → just re-runs on a timer (Esc to stop)
import { slugify } from './slugify.ts';

const cases: Array<[string, string]> = [
  ['Hello World', 'hello-world'],
  ['R&D Roadmap', 'r-and-d-roadmap'],
  ['Café déjà vu', 'cafe-deja-vu'],
  ['Node.js Tips', 'node-js-tips'],
  ['---Launch Window---', 'launch-window'],
  ['Ship   now / review later', 'ship-now-review-later'],
];

let green = 0;
for (const [input, expected] of cases) {
  if (slugify(input) === expected) green += 1;
}

const time = new Date().toISOString().slice(11, 19);
const status = green === cases.length ? `✅ all ${cases.length} checks green` : `${green}/${cases.length} checks green — keep fixing`;
console.log(`🔁 slugify watch · ${time} · ${status}`);
// Always exit 0: this is a timer poll, not a gate.
