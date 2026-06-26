// Progress side of the shared marker (`.aie-coach-state.json`, repo root).
//
// The marker is shared between the coach-checkin skill and this server. Identity
// fields (participantId, role, preSubmittedAt) are owned by submit.mjs; progress
// fields (currentBlock, blocksDone, updatedAt) are owned here. The contract: both
// sides always read-merge-write, so neither clobbers the other's fields. detect()
// keys only off participantId, so these progress fields stay invisible to it and
// the skill/server remain interchangeable.

import { readMarker } from '../../skills/coach-checkin/scripts/submit.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '.aie-coach-state.json';
const markerPath = () => join(process.cwd(), MARKER);

// {} when the marker is missing or unparseable (readMarker returns null on both).
export function readState() {
  return readMarker() ?? {};
}

// Merge progress fields in WITHOUT touching identity fields. Read-merge-write so
// a concurrent identity write from submit.mjs is preserved (last-write-wins per
// field across processes is acceptable for a single attendee on one machine).
export function writeProgress(progress) {
  const existing = readMarker() ?? {};
  const next = { ...existing, ...progress, updatedAt: new Date().toISOString() };
  writeFileSync(markerPath(), JSON.stringify(next, null, 2));
  return next;
}

// "done with block N" -> add N to blocksDone, advance currentBlock. Idempotent:
// re-recording a block doesn't duplicate it (Set), and blocksDone stays sorted
// for stable assertions. currentBlock = null at block 4 signals "finished"
// (Phase 4's coach_checkpoint maps this to done:true).
export function recordCheckpoint(block) {
  const { blocksDone = [] } = readState();
  const merged = [...new Set([...blocksDone, block])].sort((a, b) => a - b);
  const currentBlock = block < 4 ? block + 1 : null;
  return writeProgress({ currentBlock, blocksDone: merged });
}
