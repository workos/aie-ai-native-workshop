import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
const logPath = join(__dirname, 'log.txt');

const files = readdirSync(dataDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => join(dataDir, entry.name))
  .sort();

let lines = 0;
let openItems = 0;
let doneItems = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const fileLines = text.split(/\r?\n/).filter((line) => line.length > 0);
  lines += fileLines.length;
  openItems += fileLines.filter((line) => /^- \[ \]/.test(line)).length;
  doneItems += fileLines.filter((line) => /^- \[x\]/i.test(line)).length;
}

const summary = `${new Date().toISOString()} | files=${files.length} lines=${lines} open=${openItems} done=${doneItems}`;

console.log(summary);
appendFileSync(logPath, `${summary}\n`);
