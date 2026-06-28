// Unit tests for the four-block guidance data and the `nextBlock` helper. This
// is pure logic (no fs, no cwd), so it runs straight in the bun:test runner —
// the fast inner loop for the navigation data.

import { describe, test, expect } from "bun:test";

import { BLOCKS, nextBlock } from './blocks.ts';
import type { Block } from '../types.ts';

describe('nextBlock', () => {
  test('advances 1 -> 2 -> 3 -> 4', () => {
    expect(nextBlock(1)?.n).toBe(2);
    expect(nextBlock(2)?.n).toBe(3);
    expect(nextBlock(3)?.n).toBe(4);
  });

  test('returns null past block 4 (finished)', () => {
    expect(nextBlock(4)).toBe(null);
  });

  test('returns null past the end of the table', () => {
    expect(nextBlock(5)).toBe(null);
    expect(nextBlock(99)).toBe(null);
  });

  test('returns the full next-block entry, not just the number', () => {
    const next = nextBlock(1);
    expect(next?.title).toBe('Loops & goals');
    expect(next?.goal && next?.firstAction && next?.doneWhen).toBeTruthy();
  });
});

describe('BLOCKS data', () => {
  test('has exactly four blocks numbered 1..4 in order', () => {
    expect(BLOCKS.length).toBe(4);
    expect(BLOCKS.map((b) => b.n)).toEqual([1, 2, 3, 4]);
  });

  test('every entry has a non-empty title/goal/firstAction/doneWhen', () => {
    for (const b of BLOCKS) {
      for (const field of ['title', 'goal', 'firstAction', 'doneWhen'] as (keyof Block)[]) {
        expect(typeof b[field]).toBe('string');
        expect(String(b[field]).trim().length > 0).toBeTruthy();
      }
    }
  });

  test("Block 1's doneWhen references the opening check-in (the design-review correction)", () => {
    expect(BLOCKS[0]?.doneWhen).toMatch(/check-in/i);
  });
});
