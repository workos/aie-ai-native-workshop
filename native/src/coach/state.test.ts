import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readState, writeProgress, recordCheckpoint } from './state.ts';

const MARKER = '.aie-coach-state.json';

// Run `fn` with cwd set to a fresh temp dir so marker writes never touch the
// repo. Mirrors submit.test.ts's helper. bun:test runs tests in this file
// sequentially, so the process-global chdir is safe.
function inTempDir(fn: () => unknown): Promise<void> {
  const orig = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'coach-state-'));
  process.chdir(dir);
  return Promise.resolve()
    .then(fn)
    .then(() => undefined)
    .finally(() => process.chdir(orig));
}

// Fabricate a marker on disk in the current cwd. Phase 3 must NOT depend on
// coach_checkpoint (Phase 4) to produce progress, so progress is seeded by hand.
function seedMarker(obj: unknown): void {
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
      expect(next.participantId).toBe('x');
      expect(next.role).toBe('Backend / Go');
      expect(next.preSubmittedAt).toBe('ISO');
      // progress was written
      expect(next.currentBlock).toBe(2);
      expect(next.blocksDone).toEqual([1]);
      expect(next.updatedAt).toBeTruthy(); // updatedAt is stamped

      // and it persisted to disk
      const onDisk = readMarkerFile();
      expect(onDisk.participantId).toBe('x');
      expect(onDisk.currentBlock).toBe(2);
    }));

  test('recordCheckpoint(2) keeps identity AND advances progress', () =>
    inTempDir(() => {
      seedMarker({ participantId: 'x', role: 'Go', currentBlock: 2, blocksDone: [1] });

      const next = recordCheckpoint(2);

      expect(next.blocksDone).toEqual([1, 2]);
      expect(next.currentBlock).toBe(3);
      // identity still present
      expect(next.participantId).toBe('x');
      expect(next.role).toBe('Go');
    }));

  test('recordCheckpoint(4) sets currentBlock to null (finished)', () =>
    inTempDir(() => {
      seedMarker({ participantId: 'x', role: 'Go', currentBlock: 4, blocksDone: [1, 2, 3] });

      const next = recordCheckpoint(4);

      expect(next.blocksDone).toEqual([1, 2, 3, 4]);
      expect(next.currentBlock).toBe(null); // block 4 finished -> currentBlock null
    }));

  test('recordCheckpoint(1) on empty marker starts from {}', () =>
    inTempDir(() => {
      // no marker on disk at all
      const next = recordCheckpoint(1);

      expect(next.blocksDone).toEqual([1]);
      expect(next.currentBlock).toBe(2);
    }));

  test('recordCheckpoint is idempotent and keeps blocksDone sorted', () =>
    inTempDir(() => {
      recordCheckpoint(2);
      const next = recordCheckpoint(2); // re-record same block

      expect(next.blocksDone).toEqual([2]); // no duplicate entry
      expect(next.currentBlock).toBe(3);

      // out-of-order recording still yields a sorted list
      recordCheckpoint(1);
      const sorted = recordCheckpoint(3);
      expect(sorted.blocksDone).toEqual([1, 2, 3]);
    }));

  test('readState returns {} when the marker is missing', () =>
    inTempDir(() => {
      expect(readState()).toEqual({}); // missing marker -> empty object, no throw
    }));

  test('readState returns {} when the marker is unparseable', () =>
    inTempDir(() => {
      writeFileSync(join(process.cwd(), MARKER), '{ not json');
      expect(readState()).toEqual({}); // unparseable marker -> empty object, no throw
    }));
});
