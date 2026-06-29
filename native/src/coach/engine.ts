// native/src/coach/engine.ts
// Engine adapter for the MCP coach tools. This is the seam between the protocol
// server and the deterministic engine in native/src: it composes scan -> score ->
// recommend (mirroring native/src/cli.ts's `scan` command) but RETURNS plain
// objects instead of writing to stdout, because the server owns stdout as the
// JSON-RPC channel. It also owns the gate threshold and the gate decision so the
// handlers stay tiny and this logic is unit-testable with injected scans (no fs,
// no transport).
//
// Hard rule: the gate re-runs the REAL scan and reads a FRESH sub-score. There is
// no "mark done" flag anywhere in this module — a pillar passes only when the
// scan SEES its machinery on disk.
import { scan } from '../scan.ts';
import { subScores } from '../score.ts';
import { score } from '../score.ts';
import { recommend } from '../recommend.ts';
import { isGateable } from '../pillars.ts';
import { collectObservations } from '../evidence.ts';
import type {
  CoachReport,
  CollectOptions,
  GateResult,
  NextStep,
  Observation,
  PillarId,
  ScoreInput,
} from '../types.ts';

// The "present" bar. Single-sourced with recommend()'s default threshold so the
// gate and the recommendations can never disagree about what "good here" means.
export const GATE_THRESHOLD = 0.8;

// The five scoring pillars, used to validate a gate target before scanning.
export const PILLAR_IDS: PillarId[] = ['verification', 'automation', 'context', 'orchestration', 'delegation'];

// The scan is injectable so tests don't touch the real machine; it is deliberately
// tolerant of partial signals (tests pass slivers), so it yields ScoreInput.
type ScanFn = (options?: { home?: string; cwd?: string }) => ScoreInput;
type ObserveFn = (options?: CollectOptions) => Observation[];

interface EngineDeps {
  scanFn?: ScanFn;
  observeFn?: ObserveFn;
  home?: string;
  cwd?: string;
}

// coachScan returns the full report, but with whatever shape the injected scan
// produced (ScoreInput) rather than canonical Signals.
type CoachScanResult = Omit<CoachReport, 'signals'> & { signals: ScoreInput };

// Best-effort evidence: a missing/huge/hostile corpus must never throw or move
// the score. Mirrors native/src/cli.ts. `hasVerifyHook` gates the thrash signal
// off when a verify hook already exists (anti-sandbagging).
function observeSafely(
  observeFn: ObserveFn,
  { home, hasVerifyHook }: { home?: string; hasVerifyHook?: boolean } = {},
): Observation[] {
  try {
    const opts: CollectOptions = { hasVerifyHook };
    if (home !== undefined) opts.home = home;
    return observeFn(opts) ?? [];
  } catch {
    return [];
  }
}

// Full report: signals + score + (evidence-justified) recommendations + the raw
// observations. The exact composition native/src/cli.ts prints, but returned.
export function coachScan({ scanFn = scan, observeFn = collectObservations, home, cwd }: EngineDeps = {}): CoachScanResult {
  const signals = scanFn({ home, cwd });
  const observations = observeSafely(observeFn, { home, hasVerifyHook: signals?.hooks?.any === true });
  return {
    signals,
    ...score(signals),
    recommendations: recommend(signals, { threshold: GATE_THRESHOLD, observations }),
    observations,
  };
}

// The single next step: the weakest GATEABLE sub-threshold pillar (recommend()
// already sorts weakest-first and drops strong pillars), enriched with its
// current sub-score. Non-gateable pillars (automation) are skipped here — they
// are recommend-only advice, never the gated next step. null when every gateable
// pillar already clears the bar ("you're good here").
export function nextStep({ scanFn = scan, observeFn = collectObservations, home, cwd }: EngineDeps = {}): NextStep | null {
  const signals = scanFn({ home, cwd });
  const observations = observeSafely(observeFn, { home, hasVerifyHook: signals?.hooks?.any === true });
  const recs = recommend(signals, { threshold: GATE_THRESHOLD, observations });
  const top = recs.find((r) => isGateable(r.pillar));
  if (!top) return null;
  const subs = subScores(signals);
  return { pillar: top.pillar, action: top.action, basis: top.basis, subScore: subs[top.pillar] };
}

// The gate: RE-SCAN and decide. Throws on an unknown pillar (caught upstream and
// returned as a readable isError result). For a gateable pillar `passed` is purely
// a function of the fresh on-disk sub-score vs the threshold — there is no flag to
// fake it with. A non-gateable pillar (automation) is forced passed:false +
// recommendOnly:true: it can never be machine-verified from disk, so it is honest
// advice, not a gated step. The sub-score is still reported either way.
export function gateResult(pillar: string, { scanFn = scan, home, cwd }: EngineDeps = {}): GateResult {
  if (!PILLAR_IDS.includes(pillar as PillarId)) {
    throw new Error(`unknown pillar: ${pillar} (expected one of ${PILLAR_IDS.join(', ')})`);
  }
  const id = pillar as PillarId;
  const signals = scanFn({ home, cwd });
  const subScore = subScores(signals)[id];
  const gateable = isGateable(id);
  if (!gateable) {
    return { pillar: id, subScore, threshold: GATE_THRESHOLD, passed: false, gateable: false, recommendOnly: true };
  }
  return { pillar: id, subScore, threshold: GATE_THRESHOLD, passed: subScore >= GATE_THRESHOLD, gateable: true };
}
