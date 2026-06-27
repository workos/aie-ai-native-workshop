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
