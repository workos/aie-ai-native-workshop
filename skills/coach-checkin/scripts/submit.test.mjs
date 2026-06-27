import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
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
} from './submit.mjs';

const UNREACHABLE = 'http://127.0.0.1:1'; // refuses immediately, no hanging timeout
const PRE_ANSWERS = {
  time_sink: 'writing boilerplate tests',
  friction: 'context switching between docs and code',
  goal: 'ship an agent loop',
};
const POST_ANSWERS = { built: 'a service scaffolder', next: 'wire it into CI' };

// Run `fn` with cwd set to a fresh temp dir so marker/outbox writes never touch
// the repo. Restores cwd afterwards. node:test runs tests in this file
// sequentially, so the process-global chdir is safe.
function inTempDir(fn) {
  const orig = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'coach-'));
  process.chdir(dir);
  return Promise.resolve()
    .then(fn)
    .finally(() => process.chdir(orig));
}

test('writes marker', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE; // marker is written before the POST
    const result = await submit({
      role: 'Backend / Go',
      answers: PRE_ANSWERS,
      confirmed: true,
    });

    assert.equal(result.phase, 'pre');
    assert.ok(result.participantId, 'a uuid is generated');
    assert.ok(existsSync('.aie-coach-state.json'), 'marker file exists');

    const marker = JSON.parse(readFileSync('.aie-coach-state.json', 'utf8'));
    assert.equal(marker.participantId, result.participantId);
    assert.equal(marker.role, 'Backend / Go');
    assert.ok(marker.preSubmittedAt);
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
    assert.equal(marker.participantId, result.participantId);
    assert.equal(marker.role, 'Backend / Go');
    assert.ok(marker.preSubmittedAt);
    // progress fields survived the read-merge-write
    assert.equal(marker.currentBlock, 3, 'currentBlock not clobbered');
    assert.deepEqual(marker.blocksDone, [1, 2], 'blocksDone not clobbered');
  }));

test('reuses uuid', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE;
    const pre = await submit({ role: 'PM', answers: PRE_ANSWERS, confirmed: true });

    const det = detect();
    assert.equal(det.phase, 'post', 'second run is detected as post');
    assert.equal(det.participantId, pre.participantId, 'detect reuses the pre uuid');
    assert.equal(det.role, 'PM', 'detect reuses the role');

    const post = await submit({
      // role intentionally omitted — must come from the marker
      answers: POST_ANSWERS,
      confirmed: true,
    });
    assert.equal(post.phase, 'post');
    assert.equal(post.participantId, pre.participantId, 'post payload reuses the pre uuid');
  }));

test('outbox', () =>
  inTempDir(async () => {
    process.env.WORKER_URL = UNREACHABLE;
    const result = await submit({
      role: 'Director of Sales',
      answers: PRE_ANSWERS,
      confirmed: true,
    });

    assert.equal(result.sent, false);
    assert.ok(result.outbox, 'an outbox path is returned');

    const files = readdirSync('.aie-coach-outbox');
    assert.equal(files.length, 1);
    const saved = JSON.parse(readFileSync(join('.aie-coach-outbox', files[0]), 'utf8'));
    assert.equal(saved.phase, 'pre');
    assert.equal(saved.role, 'Director of Sales');
    assert.equal(saved.participantId, result.participantId);
    assert.deepEqual(
      saved.answers.map((a) => a.questionKey),
      ['time_sink', 'friction', 'goal'],
    );
  }));

test('schema', () => {
  const schema = loadSchema();

  const goodPre = buildPayload({
    phase: 'pre',
    participantId: 'abc',
    role: 'Engineer',
    answers: PRE_ANSWERS,
  });
  assert.deepEqual(validateAgainstSchema(goodPre, schema), [], 'valid pre payload passes');

  const goodPost = buildPayload({
    phase: 'post',
    participantId: 'abc',
    role: 'Engineer',
    answers: POST_ANSWERS,
  });
  assert.deepEqual(validateAgainstSchema(goodPost, schema), [], 'valid post payload passes');

  // bad phase enum is rejected
  const badPhase = { participantId: 'abc', phase: 'middle', role: 'x', answers: [] };
  assert.ok(validateAgainstSchema(badPhase, schema).length >= 1, 'bad phase enum rejected');

  // missing required top-level key is rejected
  const missing = { participantId: 'abc', phase: 'pre', answers: [] }; // no role
  assert.ok(validateAgainstSchema(missing, schema).length >= 1, 'missing role rejected');

  // malformed answers item (extra key + wrong type) is rejected
  const badItem = {
    participantId: 'abc',
    phase: 'pre',
    role: 'x',
    answers: [{ questionKey: 'time_sink', answer: 5, sneaky: 'z' }],
  };
  assert.ok(validateAgainstSchema(badItem, schema).length >= 2, 'malformed answer item rejected');
});

test('no send without confirmation', () =>
  inTempDir(async () => {
    let hit = false;
    const server = createServer((req, res) => {
      hit = true;
      res.end('ok');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    process.env.WORKER_URL = `http://127.0.0.1:${server.address().port}`;

    try {
      const result = await submit({
        role: 'PM',
        answers: PRE_ANSWERS,
        confirmed: false,
      });

      assert.equal(result.sent, false);
      assert.equal(result.reason, 'unconfirmed');
      assert.equal(hit, false, 'no POST was made');
      assert.equal(existsSync('.aie-coach-state.json'), false, 'no marker written');
      assert.equal(existsSync('.aie-coach-outbox'), false, 'no outbox written');
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
    assert.equal(typeof prompt, 'string', `prompt for "${k}" is a string`);
    assert.ok(prompt.trim().length > 0, `prompt for "${k}" is non-empty`);
  }
  // No orphan prompts: every prompt key maps to a known question key.
  for (const k of Object.keys(QUESTION_PROMPTS)) {
    assert.ok(keys.includes(k), `prompt key "${k}" maps to a known question key`);
  }
  // The pre run also surfaces a role prompt.
  assert.equal(typeof ROLE_PROMPT, 'string');
  assert.ok(ROLE_PROMPT.trim().length > 0, 'ROLE_PROMPT is non-empty');
});

// --- AI-Native score payload (Plan 4) ---------------------------------------
import { buildScorePayload } from './submit.mjs';

describe('buildScorePayload', () => {
  test('builds the additive aiNativeScore block and computes delta', () => {
    const p = buildScorePayload({ participantId: 'abc', before: 31, after: 68 });
    assert.equal(p.participantId, 'abc');
    assert.equal(p.aiNativeScore.before, 31);
    assert.equal(p.aiNativeScore.after, 68);
    assert.equal(p.aiNativeScore.delta, 37);
    assert.ok(!('pillarsPassed' in p.aiNativeScore)); // omitted when not given
  });

  test('includes pillarsPassed only when a non-empty string array', () => {
    const withPillars = buildScorePayload({
      participantId: 'abc', before: 0, after: 40, pillarsPassed: ['verification', 'context'],
    });
    assert.deepEqual(withPillars.aiNativeScore.pillarsPassed, ['verification', 'context']);
    const emptyPillars = buildScorePayload({ participantId: 'abc', before: 0, after: 40, pillarsPassed: [] });
    assert.ok(!('pillarsPassed' in emptyPillars.aiNativeScore));
  });

  test('coerces to integers (the board stores INTEGER columns)', () => {
    const p = buildScorePayload({ participantId: 'abc', before: 30.6, after: 67.4 });
    assert.equal(p.aiNativeScore.before, 31);
    assert.equal(p.aiNativeScore.after, 67);
    assert.equal(p.aiNativeScore.delta, 36);
  });

  test('throws on a missing participantId (loud, never silently sent)', () => {
    assert.throws(() => buildScorePayload({ before: 10, after: 20 }), /participantId/);
  });

  test('throws when a score is not a finite number (no phantom baseline)', () => {
    assert.throws(() => buildScorePayload({ participantId: 'abc', before: null, after: 20 }), /score/);
    assert.throws(() => buildScorePayload({ participantId: 'abc', before: 10, after: NaN }), /score/);
  });
});

// --- submitScore consent gate (Plan 4) -------------------------------------
import { submitScore } from './submit.mjs';

describe('submitScore consent gate', () => {
  test('does not send when unconfirmed', async () => {
    const res = await submitScore({ participantId: 'abc', before: 10, after: 50, confirmed: false });
    assert.deepEqual(res, { sent: false, reason: 'unconfirmed' });
  });

  test('a missing confirmed is treated as not-confirmed (strict === true)', async () => {
    const res = await submitScore({ participantId: 'abc', before: 10, after: 50 });
    assert.equal(res.sent, false);
    assert.equal(res.reason, 'unconfirmed');
  });

  test('validation runs before the gate: a bad payload throws even when unconfirmed', async () => {
    await assert.rejects(
      () => submitScore({ before: 10, after: 50, confirmed: false }), // no participantId
      /participantId/,
    );
  });
});
