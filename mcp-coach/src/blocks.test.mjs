// Unit tests for the four-block guidance data and the `nextBlock` helper. This
// is pure logic (no fs, no cwd), so it runs straight in the node:test runner —
// the fast inner loop for the navigation data.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCKS, nextBlock } from './blocks.mjs';

describe('nextBlock', () => {
  test('advances 1 -> 2 -> 3 -> 4', () => {
    assert.equal(nextBlock(1)?.n, 2, 'block 1 advances to block 2');
    assert.equal(nextBlock(2)?.n, 3, 'block 2 advances to block 3');
    assert.equal(nextBlock(3)?.n, 4, 'block 3 advances to block 4');
  });

  test('returns null past block 4 (finished)', () => {
    assert.equal(nextBlock(4), null, 'no block after 4');
  });

  test('returns null past the end of the table', () => {
    assert.equal(nextBlock(5), null, 'no block after the last');
    assert.equal(nextBlock(99), null, 'no block far past the end');
  });

  test('returns the full next-block entry, not just the number', () => {
    const next = nextBlock(1);
    assert.equal(next.title, 'Loops & goals');
    assert.ok(next.goal && next.firstAction && next.doneWhen, 'carries goal/firstAction/doneWhen');
  });
});

describe('BLOCKS data', () => {
  test('has exactly four blocks numbered 1..4 in order', () => {
    assert.equal(BLOCKS.length, 4, 'four blocks');
    assert.deepEqual(
      BLOCKS.map((b) => b.n),
      [1, 2, 3, 4],
      'numbered 1..4 in order',
    );
  });

  test('every entry has a non-empty title/goal/firstAction/doneWhen', () => {
    for (const b of BLOCKS) {
      for (const field of ['title', 'goal', 'firstAction', 'doneWhen']) {
        assert.equal(typeof b[field], 'string', `block ${b.n} ${field} is a string`);
        assert.ok(b[field].trim().length > 0, `block ${b.n} ${field} is non-empty`);
      }
    }
  });

  test("Block 1's doneWhen references the opening check-in (the design-review correction)", () => {
    assert.match(
      BLOCKS[0].doneWhen,
      /check-in/i,
      'Block 1 is not done until the opening check-in has run',
    );
  });
});
