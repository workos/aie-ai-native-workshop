// native/src/pillars.ts
// The five pillars of an AI-native setup, in display order. `weight` sums to 1
// across pillars so the weighted total lands cleanly on 0..100.
//
// `gateable` marks whether a pillar can be machine-verified from disk. automation
// is false: Claude-native scheduled tasks leave NO on-disk marker, so the gate
// could never honestly pass — automation is recommend-only advice, never a gated
// step. The other four are gateable (their machinery shows up in a scan).
import type { Pillar, PillarId } from './types.ts';

export const PILLARS: readonly Pillar[] = [
  { id: 'verification', label: 'Verify', weight: 0.22, gateable: true },
  { id: 'automation', label: 'Automate', weight: 0.22, gateable: false },
  { id: 'context', label: 'Context', weight: 0.2, gateable: true },
  { id: 'orchestration', label: 'Orchestrate', weight: 0.18, gateable: true },
  { id: 'delegation', label: 'Delegate', weight: 0.18, gateable: true },
];

// Whether a pillar can be gated (machine-verified from disk). Defaults to true
// for an unknown id so a future pillar is gateable unless explicitly opted out.
export function isGateable(id: PillarId): boolean {
  return PILLARS.find((p) => p.id === id)?.gateable ?? true;
}
