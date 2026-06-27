// native/src/cli.mjs
// Entry point. Wires scan -> score/recommend/card into two commands:
//   scan          print the JSON report (signals + score + recommendations)
//   card [out]    write the before card to `out` (default ai-native-card.html)
// `scanFn` is injectable so tests don't touch the real machine. Run-guard at the
// bottom mirrors mcp-coach/src/server.mjs.
import { writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scan } from './scan.mjs';
import { score } from './score.mjs';
import { recommend } from './recommend.mjs';
import { renderCard } from './card.mjs';
import { collectObservations } from './evidence.mjs';

export function run(argv = process.argv.slice(2), { scanFn = scan, observeFn = collectObservations } = {}) {
  const cmd = argv[0] ?? 'scan';
  const signals = scanFn();

  if (cmd === 'scan') {
    // Evidence is best-effort: a missing/huge/hostile corpus must never crash the
    // scan or move the score. On any failure we fall back to gap-only recs.
    let observations = [];
    try {
      observations = observeFn() ?? [];
    } catch {
      observations = [];
    }
    const result = {
      signals,
      ...score(signals),
      recommendations: recommend(signals, { observations }),
      observations,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }

  if (cmd === 'card') {
    const out = argv[1] ?? 'ai-native-card.html';
    writeFileSync(out, renderCard({ before: signals }));
    process.stdout.write(`wrote ${out}\n`);
    return out;
  }

  process.stderr.write(`unknown command: ${cmd}\n`);
  process.exitCode = 1;
  return null;
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) run();
