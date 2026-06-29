import { slugify } from './slugify.ts';

interface SlugCase {
  name: string;
  input: string;
  expected: string;
}

const cases: SlugCase[] = [
  { name: 'lowercases words', input: 'Hello World', expected: 'hello-world' },
  { name: 'spells ampersands as and', input: 'R&D Roadmap', expected: 'r-and-d-roadmap' },
  { name: 'removes accents without dropping letters', input: 'Café déjà vu', expected: 'cafe-deja-vu' },
  { name: 'turns punctuation into separators', input: 'Node.js Tips', expected: 'node-js-tips' },
  { name: 'trims separators at the edges', input: '---Launch Window---', expected: 'launch-window' },
  { name: 'collapses repeated spaces and separators', input: 'Ship   now / review later', expected: 'ship-now-review-later' },
];

for (let i = 0; i < cases.length; i += 1) {
  const c = cases[i];
  const got = slugify(c.input);
  if (got !== c.expected) {
    if (i > 0) console.log(`✓ ${i}/${cases.length} checks passed before this failure`);
    console.error(`✗ check ${i + 1}/${cases.length}: ${c.name}`);
    console.error(`  input:    ${JSON.stringify(c.input)}`);
    console.error(`  expected: ${JSON.stringify(c.expected)}`);
    console.error(`  got:      ${JSON.stringify(got)}`);
    process.exit(1);
  }
  console.log(`✓ ${c.name}`);
}

console.log(`✅ all ${cases.length} checks passed`);
