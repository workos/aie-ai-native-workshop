// native/src/pillars.test.ts
import { describe, test, expect } from 'bun:test';
import { PILLARS } from './pillars.ts';

describe('PILLARS', () => {
  test('weights sum to 1 (so the weighted total lands on 0..100)', () => {
    const sum = PILLARS.reduce((s, p) => s + p.weight, 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
  });
  test('five pillars with unique ids', () => {
    expect(PILLARS.length).toBe(5);
    expect(new Set(PILLARS.map((p) => p.id)).size).toBe(5);
  });
});
