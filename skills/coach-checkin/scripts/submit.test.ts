import { test, describe, expect } from 'bun:test';
import { mkdtempSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import {
  detect,
  submit,
  buildPayload,
  validateAgainstSchema,
  loadSchema,
  QUESTION_KEYS,
  QUESTION_PROMPTS,
  ROLE_PROMPT,
} from './submit.ts';

const UNREACHABLE = 'http://127.0.0.1:1'; // refuses immediately, no hanging timeout
const PRE_ANSWERS = {
  time_sink: 'writing boilerplate tests',
  friction: 'context switching between docs and code',
  goal: 'ship an agent loop',
};
const POST_ANSWERS = { built: 'a service scaffolder', next: 'wire it into CI' };

// Run `fn` with cwd set to a fresh temp dir so marker/outbox writes never touch
// the repo. Restores cwd afterwards. bun:test runs tests in this file
// sequentially, so the process-global chdir is safe.
function inTempDir(fn: () => unknown): Promise<void> {
  const orig = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'coach-'));
  process.chdir(dir);
  return Promise.resolve()
    .then(fn)
    .finally(() => process.chdir(orig)) as Promise<void>;
}

test('writes marker', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE; // marker is written before the POST
    const result = await submit({
      role: 'Backend / Go',
      answers: PRE_ANSWERS,
      confirmed: true,
    });

    expect(result.phase).toBe('pre');
    expect(result.participantId).toBeTruthy(); // a uuid is generated
    expect(existsSync('.aie-coach-state.json')).toBeTruthy(); // marker file exists

    const marker = JSON.parse(readFileSync('.aie-coach-state.json', 'utf8'));
    expect(marker.participantId).toBe(result.participantId);
    expect(marker.role).toBe('Backend / Go');
    expect(marker.preSubmittedAt).toBeTruthy();
  }));

test('merge: pre submit preserves pre-existing progress fields', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE; // marker is written before the POST
    // Fabricate a checkpoint-only marker (attendee hit some checkpoints before
    // ever running the opening check-in). Phase 3 must not depend on Phase 4 to
    // produce these, so they're seeded by hand.
    writeFileSync(
      '.aie-coach-state.json',
      JSON.stringify({ currentBlock: 3, blocksDone: [1, 2] }, null, 2),
    );

    const result = await submit({
      role: 'Backend / Go',
      answers: PRE_ANSWERS,
      confirmed: true,
    });

    const marker = JSON.parse(readFileSync('.aie-coach-state.json', 'utf8'));
    // identity was written
    expect(marker.participantId).toBe(result.participantId);
    expect(marker.role).toBe('Backend / Go');
    expect(marker.preSubmittedAt).toBeTruthy();
    // progress fields survived the read-merge-write
    expect(marker.currentBlock).toBe(3); // currentBlock not clobbered
    expect(marker.blocksDone).toEqual([1, 2]); // blocksDone not clobbered
  }));

test('reuses uuid', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE;
    const pre = await submit({ role: 'PM', answers: PRE_ANSWERS, confirmed: true });

    const det = detect();
    expect(det.phase).toBe('post'); // second run is detected as post
    // Narrow off the discriminant so the post-only identity fields are in view.
    if (det.phase !== 'post') throw new Error('expected the post phase after a pre submit');
    expect(det.participantId).toBe(pre.participantId); // detect reuses the pre uuid
    expect(det.role).toBe('PM'); // detect reuses the role

    const post = await submit({
      // role intentionally omitted — must come from the marker
      answers: POST_ANSWERS,
      confirmed: true,
    });
    expect(post.phase).toBe('post');
    expect(post.participantId).toBe(pre.participantId); // post payload reuses the pre uuid
  }));

test('outbox', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE;
    const result = await submit({
      role: 'Director of Sales',
      answers: PRE_ANSWERS,
      confirmed: true,
    });

    expect(result.sent).toBe(false);
    // The unreachable board forces the outbox fallback; narrow to that shape so
    // the outbox field is in view (a sent result would have failed the assert above).
    if (result.sent) throw new Error('expected the outbox fallback, got a sent result');
    expect(result.outbox).toBeTruthy(); // an outbox path is returned

    const files = readdirSync('.aie-coach-outbox');
    expect(files.length).toBe(1);
    const saved = JSON.parse(readFileSync(join('.aie-coach-outbox', files[0]), 'utf8'));
    expect(saved.phase).toBe('pre');
    expect(saved.role).toBe('Director of Sales');
    expect(saved.participantId).toBe(result.participantId);
    expect(saved.answers.map((a: { questionKey: string }) => a.questionKey)).toEqual([
      'time_sink',
      'friction',
      'goal',
    ]);
  }));

test('schema', () => {
  const schema = loadSchema();

  const goodPre = buildPayload({
    phase: 'pre',
    participantId: 'abc',
    role: 'Engineer',
    answers: PRE_ANSWERS,
  });
  expect(validateAgainstSchema(goodPre, schema)).toEqual([]); // valid pre payload passes

  const goodPost = buildPayload({
    phase: 'post',
    participantId: 'abc',
    role: 'Engineer',
    answers: POST_ANSWERS,
  });
  expect(validateAgainstSchema(goodPost, schema)).toEqual([]); // valid post payload passes

  // bad phase enum is rejected
  const badPhase = { participantId: 'abc', phase: 'middle', role: 'x', answers: [] };
  expect(validateAgainstSchema(badPhase, schema).length >= 1).toBeTruthy(); // bad phase enum rejected

  // missing required top-level key is rejected
  const missing = { participantId: 'abc', phase: 'pre', answers: [] }; // no role
  expect(validateAgainstSchema(missing, schema).length >= 1).toBeTruthy(); // missing role rejected

  // malformed answers item (extra key + wrong type) is rejected
  const badItem = {
    participantId: 'abc',
    phase: 'pre',
    role: 'x',
    answers: [{ questionKey: 'time_sink', answer: 5, sneaky: 'z' }],
  };
  expect(validateAgainstSchema(badItem, schema).length >= 2).toBeTruthy(); // malformed answer item rejected
});

test('no send without confirmation', () =>
  inTempDir(async () => {
    let hit = false;
    const server = createServer((req, res) => {
      hit = true;
      res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    process.env.WORKER_URL = `http://127.0.0.1:${port}`;

    try {
      const result = await submit({
        role: 'PM',
        answers: PRE_ANSWERS,
        confirmed: false,
      });

      expect(result.sent).toBe(false);
      expect((result as { reason?: string }).reason).toBe('unconfirmed');
      expect(hit).toBe(false); // no POST was made
      expect(existsSync('.aie-coach-state.json')).toBe(false); // no marker written
      expect(existsSync('.aie-coach-outbox')).toBe(false); // no outbox written
    } finally {
      server.close();
    }
  }));

test('prompts: every question key has a non-empty prompt', () => {
  // The MCP server reads QUESTION_PROMPTS instead of re-stating the prose, so a
  // future key addition must not ship a prompt-less question. This guards
  // coverage (wording is mirrored against SKILL.md by eye).
  const keys = QUESTION_KEYS.pre.concat(QUESTION_KEYS.post);
  for (const k of keys) {
    const prompt = QUESTION_PROMPTS[k];
    expect(typeof prompt).toBe('string'); // prompt for "k" is a string
    expect(prompt.trim().length > 0).toBeTruthy(); // prompt for "k" is non-empty
  }
  // No orphan prompts: every prompt key maps to a known question key.
  for (const k of Object.keys(QUESTION_PROMPTS)) {
    expect(keys.includes(k)).toBeTruthy(); // prompt key "k" maps to a known question key
  }
  // The pre run also surfaces a role prompt.
  expect(typeof ROLE_PROMPT).toBe('string');
  expect(ROLE_PROMPT.trim().length > 0).toBeTruthy(); // ROLE_PROMPT is non-empty
});

// --- AI-Native score payload (Plan 4) ---------------------------------------
import { buildScorePayload } from './submit.ts';

describe('buildScorePayload', () => {
  test('builds the additive aiNativeScore block and computes delta', () => {
    const p = buildScorePayload({ participantId: 'abc', before: 31, after: 68 });
    expect(p.participantId).toBe('abc');
    expect(p.aiNativeScore.before).toBe(31);
    expect(p.aiNativeScore.after).toBe(68);
    expect(p.aiNativeScore.delta).toBe(37);
    expect(!('pillarsPassed' in p.aiNativeScore)).toBeTruthy(); // omitted when not given
  });

  test('includes pillarsPassed only when a non-empty string array', () => {
    const withPillars = buildScorePayload({
      participantId: 'abc', before: 0, after: 40, pillarsPassed: ['verification', 'context'],
    });
    expect(withPillars.aiNativeScore.pillarsPassed).toEqual(['verification', 'context']);
    const emptyPillars = buildScorePayload({ participantId: 'abc', before: 0, after: 40, pillarsPassed: [] });
    expect(!('pillarsPassed' in emptyPillars.aiNativeScore)).toBeTruthy();
  });

  test('coerces to integers (the board stores INTEGER columns)', () => {
    const p = buildScorePayload({ participantId: 'abc', before: 30.6, after: 67.4 });
    expect(p.aiNativeScore.before).toBe(31);
    expect(p.aiNativeScore.after).toBe(67);
    expect(p.aiNativeScore.delta).toBe(36);
  });

  test('throws on a missing participantId (loud, never silently sent)', () => {
    expect(() => buildScorePayload({ before: 10, after: 20 })).toThrow(/participantId/);
  });

  test('throws when a score is not a finite number (no phantom baseline)', () => {
    expect(() => buildScorePayload({ participantId: 'abc', before: null, after: 20 })).toThrow(/score/);
    expect(() => buildScorePayload({ participantId: 'abc', before: 10, after: NaN })).toThrow(/score/);
  });
});

// --- submitScore consent gate (Plan 4) -------------------------------------
import { submitScore } from './submit.ts';

describe('submitScore consent gate', () => {
  test('does not send when unconfirmed', async () => {
    const res = await submitScore({ participantId: 'abc', before: 10, after: 50, confirmed: false });
    expect(res).toEqual({ sent: false, reason: 'unconfirmed' });
  });

  test('a missing confirmed is treated as not-confirmed (strict === true)', async () => {
    const res = await submitScore({ participantId: 'abc', before: 10, after: 50 });
    expect(res.sent).toBe(false);
    expect((res as { reason?: string }).reason).toBe('unconfirmed');
  });

  test('validation runs before the gate: a bad payload throws even when unconfirmed', async () => {
    await expect(
      submitScore({ before: 10, after: 50, confirmed: false }), // no participantId
    ).rejects.toThrow(/participantId/);
  });
});
