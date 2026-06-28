// native/src/recommend.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from './recommend.mjs';

describe('recommend', () => {
  test('omits a pillar that is already strong', () => {
    const recs = recommend({ hooks: { lintTest: true } }); // verification = 1
    assert.ok(!recs.some((r) => r.pillar === 'verification'));
  });

  test('weakest pillar comes first', () => {
    // context is partial (0.4), others 0 -> a 0-scoring pillar must lead
    const recs = recommend({ claudeMd: true });
    assert.notEqual(recs[0].pillar, 'context');
  });

  test('all pillars strong -> no recommendations', () => {
    const strong = {
      hooks: { lintTest: true }, claudeMd: true, skills: 4, mcpServers: 2,
      worktrees: 2, scheduledJobs: 2, reusableDelegationPattern: true,
    };
    assert.deepEqual(recommend(strong), []);
  });

  test('every recommendation carries a basis and an action', () => {
    const recs = recommend({});
    assert.ok(recs.length > 0);
    assert.ok(recs.every((r) => r.basis === 'capability-gap' && typeof r.action === 'string'));
  });
});

// --- append to native/src/recommend.test.mjs ---
import { buildObservation } from './evidence.mjs';

describe('recommend with evidence', () => {
  test('a count-only thrash observation upgrades the verification rec (no hours)', () => {
    const observations = [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0, sample: 'npm test' })];
    const recs = recommend({ claudeMd: true }, { observations }); // verification is weak (0)
    const v = recs.find((r) => r.pillar === 'verification');
    assert.equal(v.basis, 'observed-waste');
    assert.equal(v.hoursPerWeek, null);
    assert.doesNotMatch(v.evidence, /h\/wk/);
  });

  test('a hours-quantified re-paste observation upgrades the context rec with hours', () => {
    const observations = [buildObservation('repasted-context', 30, { windowDays: 30, now: 0 })];
    const recs = recommend({}, { observations }); // context is weak (0)
    const c = recs.find((r) => r.pillar === 'context');
    assert.equal(c.basis, 'observed-waste');
    assert.ok(c.hoursPerWeek > 0);
    assert.match(c.evidence, /h\/wk/);
  });

  test('strong pillars are still omitted even if an observation exists for them', () => {
    const observations = [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0 })];
    const recs = recommend({ hooks: { lintTest: true } }, { observations }); // verification strong -> dropped
    assert.ok(!recs.some((r) => r.pillar === 'verification'));
  });

  test('no observations -> identical to the gap-only output', () => {
    const signals = { claudeMd: true };
    assert.deepEqual(recommend(signals), recommend(signals, { observations: [] }));
  });
});
