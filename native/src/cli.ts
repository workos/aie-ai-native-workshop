// native/src/cli.ts
// Entry point. Wires scan -> score/recommend/card into commands, plus the coach:
//   scan          print the JSON report (signals + score + recommendations)
//   card [out]    write the before card to `out` (default ai-native-card.html)
//   --mcp | mcp   boot the stdio MCP coach server (the way `sessions --mcp` works)
// `scanFn` is injectable so tests don't touch the real machine. Run-guard at the
// bottom gates direct execution.
import { writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scan } from './scan.ts';
import { score } from './score.ts';
import { recommend } from './recommend.ts';
import { renderCard } from './card.ts';
import { collectObservations } from './evidence.ts';
import { startServer, assertCwd } from './coach/server.ts';
import type {
  CoachReport,
  CollectOptions,
  Observation,
  Signals,
} from './types.ts';

interface RunDeps {
  scanFn?: () => Signals;
  observeFn?: (options?: CollectOptions) => Observation[];
}

export function run(
  argv: string[] = process.argv.slice(2),
  { scanFn = scan, observeFn = collectObservations }: RunDeps = {},
): CoachReport | string | null {
  const cmd = argv[0] ?? 'scan';

  // `--mcp` (or `mcp`) boots the stdio MCP coach server instead of running a
  // one-shot scan/card. Return immediately — no scan runs, and stdout is handed
  // to the JSON-RPC channel. assertCwd() warns (to stderr) if launched outside
  // the repo root so the shared marker/outbox land in the right place.
  if (argv.includes('--mcp') || cmd === 'mcp') {
    assertCwd();
    startServer();
    return null;
  }

  const signals = scanFn();

  if (cmd === 'scan') {
    // Evidence is best-effort: a missing/huge/hostile corpus must never crash the
    // scan or move the score. On any failure we fall back to gap-only recs.
    // Hook-gate the evidence: a verify hook makes the thrash signal 0 (anti-sandbag),
    // matching the coach engine. The corpus is read with the real homedir default.
    let observations: Observation[] = [];
    try {
      observations = observeFn({ hasVerifyHook: signals?.hooks?.lintTest === true }) ?? [];
    } catch {
      observations = [];
    }
    const result: CoachReport = {
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
