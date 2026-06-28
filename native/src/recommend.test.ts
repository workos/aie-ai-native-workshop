// native/src/recommend.test.ts
import { describe, test, expect } from "bun:test";
import { recommend } from './recommend.ts';

describe('recommend', () => {
  test('omits a pillar that is already strong', () => {
    const recs = recommend({ hooks: { lintTest: true } }); // verification = 1
    expect(!recs.some((r) => r.pillar === 'verification')).toBeTruthy();
  });

  test('weakest pillar comes first', () => {
    // context is partial (0.4), others 0 -> a 0-scoring pillar must lead
    const recs = recommend({ claudeMd: true });
    expect(recs[0].pillar).not.toBe('context');
  });

  test('all pillars strong -> no recommendations', () => {
    const strong = {
      hooks: { lintTest: true }, claudeMd: true, skills: 4, mcpServers: 2,
      worktrees: 2, scheduledJobs: 2, reusableDelegationPattern: true,
    };
    expect(recommend(strong)).toEqual([]);
  });

  test('every recommendation carries a basis and an action', () => {
    const recs = recommend({});
    expect(recs.length > 0).toBeTruthy();
    expect(recs.every((r) => r.basis === 'capability-gap' && typeof r.action === 'string')).toBeTruthy();
  });
});

// --- append to native/src/recommend.test.ts ---
import { buildObservation } from './evidence.ts';

describe('recommend with evidence', () => {
  test('a count-only thrash observation upgrades the verification rec (no hours)', () => {
    const observations = [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0, sample: 'npm test' })!];
    const recs = recommend({ claudeMd: true }, { observations }); // verification is weak (0)
    const v = recs.find((r) => r.pillar === 'verification');
    expect(v!.basis).toBe('observed-waste');
    expect(v!.hoursPerWeek).toBe(null);
    expect(v!.evidence).not.toMatch(/h\/wk/);
  });

  test('a hours-quantified re-paste observation upgrades the context rec with hours', () => {
    const observations = [buildObservation('repasted-context', 30, { windowDays: 30, now: 0 })!];
    const recs = recommend({}, { observations }); // context is weak (0)
    const c = recs.find((r) => r.pillar === 'context');
    expect(c!.basis).toBe('observed-waste');
    expect(c!.hoursPerWeek! > 0).toBeTruthy();
    expect(c!.evidence).toMatch(/h\/wk/);
  });

  test('strong pillars are still omitted even if an observation exists for them', () => {
    const observations = [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0 })!];
    const recs = recommend({ hooks: { lintTest: true } }, { observations }); // verification strong -> dropped
    expect(!recs.some((r) => r.pillar === 'verification')).toBeTruthy();
  });

  test('no observations -> identical to the gap-only output', () => {
    const signals = { claudeMd: true };
    expect(recommend(signals)).toEqual(recommend(signals, { observations: [] }));
  });
});
