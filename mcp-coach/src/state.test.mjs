import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readState, writeProgress, recordCheckpoint } from './state.mjs';

const MARKER = '.aie-coach-state.json';

// Run `fn` with cwd set to a fresh temp dir so marker writes never touch the
// repo. Mirrors submit.test.mjs's helper. node:test runs tests in this file
// sequentially, so the process-global chdir is safe.
function inTempDir(fn) {
  const orig = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'coach-state-'));
  process.chdir(dir);
  return Promise.resolve()
    .then(fn)
    .finally(() => process.chdir(orig));
}

// Fabricate a marker on disk in the current cwd. Phase 3 must NOT depend on
// coach_checkpoint (Phase 4) to produce progress, so progress is seeded by hand.
function seedMarker(obj) {
  writeFileSync(join(process.cwd(), MARKER), JSON.stringify(obj, null, 2));
}

function readMarkerFile() {
  return JSON.parse(readFileSync(join(process.cwd(), MARKER), 'utf8'));
}

describe('merge', () => {
  test('writeProgress preserves identity fields', () =>
    inTempDir(() => {
      seedMarker({ participantId: 'x', role: 'Backend / Go', preSubmittedAt: 'ISO' });

      const next = writeProgress({ currentBlock: 2, blocksDone: [1] });

      // identity survived the progress write
      assert.equal(next.participantId, 'x');
      assert.equal(next.role, 'Backend / Go');
      assert.equal(next.preSubmittedAt, 'ISO');
      // progress was written
      assert.equal(next.currentBlock, 2);
      assert.deepEqual(next.blocksDone, [1]);
      assert.ok(next.updatedAt, 'updatedAt is stamped');

      // and it persisted to disk
      const onDisk = readMarkerFile();
      assert.equal(onDisk.participantId, 'x');
      assert.equal(onDisk.currentBlock, 2);
    }));

  test('recordCheckpoint(2) keeps identity AND advances progress', () =>
    inTempDir(() => {
      seedMarker({ participantId: 'x', role: 'Go', currentBlock: 2, blocksDone: [1] });

      const next = recordCheckpoint(2);

      assert.deepEqual(next.blocksDone, [1, 2]);
      assert.equal(next.currentBlock, 3);
      // identity still present
      assert.equal(next.participantId, 'x');
      assert.equal(next.role, 'Go');
    }));

  test('recordCheckpoint(4) sets currentBlock to null (finished)', () =>
    inTempDir(() => {
      seedMarker({ participantId: 'x', role: 'Go', currentBlock: 4, blocksDone: [1, 2, 3] });

      const next = recordCheckpoint(4);

      assert.deepEqual(next.blocksDone, [1, 2, 3, 4]);
      assert.equal(next.currentBlock, null, 'block 4 finished -> currentBlock null');
    }));

  test('recordCheckpoint(1) on empty marker starts from {}', () =>
    inTempDir(() => {
      // no marker on disk at all
      const next = recordCheckpoint(1);

      assert.deepEqual(next.blocksDone, [1]);
      assert.equal(next.currentBlock, 2);
    }));

  test('recordCheckpoint is idempotent and keeps blocksDone sorted', () =>
    inTempDir(() => {
      recordCheckpoint(2);
      const next = recordCheckpoint(2); // re-record same block

      assert.deepEqual(next.blocksDone, [2], 'no duplicate entry');
      assert.equal(next.currentBlock, 3);

      // out-of-order recording still yields a sorted list
      recordCheckpoint(1);
      const sorted = recordCheckpoint(3);
      assert.deepEqual(sorted.blocksDone, [1, 2, 3]);
    }));

  test('readState returns {} when the marker is missing', () =>
    inTempDir(() => {
      assert.deepEqual(readState(), {}, 'missing marker -> empty object, no throw');
    }));

  test('readState returns {} when the marker is unparseable', () =>
    inTempDir(() => {
      writeFileSync(join(process.cwd(), MARKER), '{ not json');
      assert.deepEqual(readState(), {}, 'unparseable marker -> empty object, no throw');
    }));
});
