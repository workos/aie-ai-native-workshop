// native/src/pillars.ts
// The five pillars of an AI-native setup, in display order. `weight` sums to 1
// across pillars so the weighted total lands cleanly on 0..100.
import type { Pillar } from './types.ts';

export const PILLARS: readonly Pillar[] = [
  { id: 'verification', label: 'Verify', weight: 0.22 },
  { id: 'automation', label: 'Automate', weight: 0.22 },
  { id: 'context', label: 'Context', weight: 0.2 },
  { id: 'orchestration', label: 'Orchestrate', weight: 0.18 },
  { id: 'delegation', label: 'Delegate', weight: 0.18 },
];
