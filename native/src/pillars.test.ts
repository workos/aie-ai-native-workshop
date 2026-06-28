// native/src/pillars.test.ts
import { describe, test, expect } from 'bun:test';
import { PILLARS, isGateable } from './pillars.ts';

describe('PILLARS', () => {
  test('weights sum to 1 (so the weighted total lands on 0..100)', () => {
    const sum = PILLARS.reduce((s, p) => s + p.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
  });
  test('five pillars with unique ids', () => {
    expect(PILLARS.length).toBe(5);
    expect(new Set(PILLARS.map((p) => p.id)).size).toBe(5);
  });
  test('automation is the only non-gateable pillar', () => {
    const byId = new Map(PILLARS.map((p) => [p.id, p.gateable]));
    expect(byId.get('automation')).toBe(false);
    for (const id of ['verification', 'context', 'orchestration', 'delegation'] as const) {
      expect(byId.get(id)).toBe(true);
    }
  });
});

describe('isGateable', () => {
  test('automation is recommend-only (false); the rest are gateable (true)', () => {
    expect(isGateable('automation')).toBe(false);
    expect(isGateable('verification')).toBe(true);
  });
});
