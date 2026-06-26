// The four-block guidance data — the coach's navigation map. This is DATA, not
// code: each entry is sourced from `curriculum/01-04` + `docs/run-of-show.md`,
// and `nextBlock()` is the only logic here (block N -> the next block, or null
// past block 4).
//
// Curriculum is the source of truth. If the curriculum files change, THIS table
// is the thing to re-sync. Block 1's `doneWhen` is deliberately broader than
// "fixed a bug" — per `curriculum/01-voice-coding.md`, Block 1 isn't truly done
// until the attendee has run the opening check-in (the board money shot), not
// merely fixed a bug by voice. That was the design-review correction.

export const BLOCKS = [
  {
    n: 1,
    title: 'Voice coding',
    goal: 'Hands off the keyboard',
    firstAction: 'Set up Handy',
    doneWhen:
      "Opening check-in done + the 'one voice, many agents' moment (after dictating a command and fixing a bug by voice)",
  },
  {
    n: 2,
    title: 'Loops & goals',
    goal: 'Hand off multi-step work',
    firstAction: 'Work this issue until every box is checked',
    doneWhen: "A finished checklist issue where you defined 'done' (and/or a /loop run)",
  },
  {
    n: 3,
    title: 'Verification gates',
    goal: 'Trust what agents ship',
    firstAction: 'Add a lint/typecheck/test hook',
    doneWhen:
      'A hook gates a change + one adversarial (Codex) review; a prior issue re-run through the gate',
  },
  {
    n: 4,
    title: 'Scheduled tasks',
    goal: 'Put the work on a timer',
    firstAction: 'Schedule the work you just did',
    doneWhen: "A schedule exists and you've seen it fire (or get pinged) + closing check-in done",
  },
];

// block N -> the next block's entry, or null when N is the last block (4) or
// out of range. Pure: drives the coach_checkpoint advance and is the unit-tested
// seam for the block ordering.
export function nextBlock(n) {
  return BLOCKS.find((b) => b.n === n + 1) ?? null;
}
