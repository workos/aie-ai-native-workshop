// A tiny "scheduled report" you can watch run on a timer.
// Run it once by hand, then put it on a loop (`/loop 2m bun playground/scheduled/report.ts`)
// or a real schedule (`/schedule ...`) and watch log.txt grow, one line per run.
// It always succeeds — the point is to SEE a recurring job fire, not to fix anything.
import { appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, 'data');
const logPath = join(here, 'log.txt');

// Summarize the little markdown "notes" in ./data — done vs. still-open checkboxes.
const notes = readdirSync(dataDir, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.md'))
  .map((e) => join(dataDir, e.name))
  .sort();

let done = 0;
const open: string[] = [];
for (const file of notes) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^- \[x\]/i.test(line)) done += 1;
    else if (/^- \[ \]/.test(line)) open.push(line.replace(/^- \[ \]\s*/, ''));
  }
}

// Run number = how many report lines are already in the log (header lines don't count).
const priorRuns = existsSync(logPath)
  ? readFileSync(logPath, 'utf8').split('\n').filter((l) => /^\d{4}-/.test(l)).length
  : 0;
const run = priorRuns + 1;
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

// What someone watching the loop/schedule actually sees each time it fires:
console.log(`🗓  Workshop digest · ${now}  (run #${run})`);
console.log(`   ${notes.length} notes · ${done} done · ${open.length} open`);
if (open.length) console.log(`   next up: ${open[0]}`);
console.log(`   ✓ logged to playground/scheduled/log.txt`);

// One clean, readable line per run — this is the file you watch grow.
appendFileSync(logPath, `${now} · run #${run} · ${done} done / ${open.length} open\n`);
