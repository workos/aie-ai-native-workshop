// native/src/types.ts
// Shared domain types — the contract the whole engine and coach speak. These
// encode the not-conflated boundary in the type system: the scorer consumes
// Signals (hard facts on disk) only; the evidence layer produces Observation[]
// that JUSTIFY a Recommendation but can NEVER reach the score.

export type PillarId =
  | 'verification'
  | 'automation'
  | 'context'
  | 'orchestration'
  | 'delegation';

export interface Pillar {
  id: PillarId;
  label: string;
  weight: number;
  // Whether this pillar can be machine-verified from disk and thus gated.
  // automation is false: Claude-native schedules leave no on-disk marker, so the
  // gate would always fail — it is recommend-only advice, never a gated step.
  gateable: boolean;
}

// --- scan signals (hard facts on disk) -------------------------------------

export interface Hooks {
  any: boolean;
}

// Non-scoring behavioral facts: they JUSTIFY recommendations, never the score.
export interface BehaviorFacts {
  backgroundJobs: number;
  delegationSessions: number;
  taskCalls: number;
}

export interface Signals {
  hooks: Hooks;
  skills: number;
  mcpServers: number;
  claudeMd: boolean;
  worktrees: number;
  // Hard signal for scoring. 0 from disk today on purpose: there is no honest
  // on-disk recurrence marker, so we never pretend background sessions are schedules.
  scheduledJobs: number;
  reusableDelegationPattern: boolean;
  behavior: BehaviorFacts;
}

// The scorer is deliberately tolerant of missing fields (callers and tests pass
// partial signals); a deep-partial models that without weakening canonical Signals.
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type ScoreInput = DeepPartial<Signals>;

// --- scoring ---------------------------------------------------------------

export type SubScores = Record<PillarId, number>;

export interface Score {
  pillars: SubScores;
  total: number;
}

// --- evidence (behavioral layer) -------------------------------------------

export type ObservationKind = 'thrash-loop' | 'repasted-context';

export interface Observation {
  kind: ObservationKind;
  count: number;
  windowDays: number;
  perEventMinutes: number | null; // null => count-only (no hours claimed)
  hoursPerWeek: number | null; // null => count-only
  estimated: boolean;
  pillar: PillarId;
  detail: string;
}

export interface CollectOptions {
  home?: string;
  now?: number;
  windowDays?: number;
  hasVerifyHook?: boolean;
}

// --- recommendations -------------------------------------------------------

export type RecommendationBasis = 'capability-gap' | 'observed-waste';

export interface Recommendation {
  pillar: PillarId;
  action: string;
  basis: RecommendationBasis;
  hoursPerWeek?: number | null;
  evidence?: string;
  // Mirrors the pillar's gateability so callers can tell advice (automation)
  // from a gated step without re-deriving it.
  gateable?: boolean;
}

export interface RecommendOptions {
  threshold?: number;
  observations?: Observation[];
}

// --- coach -----------------------------------------------------------------

export interface CoachReport extends Score {
  signals: Signals;
  recommendations: Recommendation[];
  observations: Observation[];
}

export interface NextStep {
  pillar: PillarId;
  action: string;
  basis: RecommendationBasis;
  subScore: number;
}

export interface GateResult {
  pillar: PillarId;
  subScore: number;
  threshold: number;
  passed: boolean;
  // Whether the pillar is machine-verifiable from disk. A non-gateable pillar
  // (automation) is forced passed:false + recommendOnly:true with a message.
  gateable: boolean;
  recommendOnly?: boolean;
  message?: string;
}

export interface Block {
  n: number;
  title: string;
  goal: string;
  firstAction: string;
  doneWhen: string;
}
