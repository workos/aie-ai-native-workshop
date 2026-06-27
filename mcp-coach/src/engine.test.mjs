// mcp-coach/src/engine.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_THRESHOLD, PILLAR_IDS, coachScan, nextStep, gateResult } from './engine.mjs';

// Signals where ONLY verification is present (lint/test hook). Everything else 0.
const weakSignals = () => ({ hooks: { any: true, lintTest: true } });
// Signals where every pillar clears the bar -> no recommendations, gate passes.
const strongSignals = () => ({
  hooks: { any: true, lintTest: true },
  claudeMd: true, skills: 4, mcpServers: 2,
  worktrees: 2, scheduledJobs: 2, reusableDelegationPattern: true,
});
const noObs = () => [];

describe('GATE_THRESHOLD / PILLAR_IDS', () => {
  test('threshold matches the recommend() cutoff (single-sourced)', () => {
    assert.equal(GATE_THRESHOLD, 0.8);
  });
  test('PILLAR_IDS lists the five engine pillars', () => {
    assert.deepEqual([...PILLAR_IDS].sort(), [
      'automation', 'context', 'delegation', 'orchestration', 'verification',
    ]);
  });
});

describe('coachScan', () => {
  test('returns the full report shape from an injected scan', () => {
    const r = coachScan({ scanFn: weakSignals, observeFn: noObs });
    assert.deepEqual(r.signals, weakSignals());
    assert.equal(r.total, 22); // verification weight only
    assert.ok(Array.isArray(r.recommendations));
    assert.ok(Array.isArray(r.observations));
    assert.ok(typeof r.pillars.verification === 'number');
  });

  test('a throwing observeFn degrades to [] observations, never throws', () => {
    const boom = () => { throw new Error('hostile corpus'); };
    const r = coachScan({ scanFn: weakSignals, observeFn: boom });
    assert.deepEqual(r.observations, []);
    assert.equal(r.total, 22); // evidence never moves the score
  });
});

describe('nextStep', () => {
  test('returns the weakest sub-0.8 pillar with its sub-score', () => {
    const step = nextStep({ scanFn: weakSignals, observeFn: noObs });
    assert.notEqual(step, null);
    assert.notEqual(step.pillar, 'verification'); // already strong -> skipped
    assert.equal(step.subScore, 0);               // weakest pillars sit at 0
    assert.ok(typeof step.action === 'string' && step.action.length > 0);
    assert.ok(step.basis === 'capability-gap' || step.basis === 'observed-waste');
  });

  test('null when every pillar already clears the bar', () => {
    assert.equal(nextStep({ scanFn: strongSignals, observeFn: noObs }), null);
  });
});

describe('gateResult', () => {
  test('passes only when the fresh scan shows the pillar present', () => {
    // The scan SEES verification -> gate passes.
    const r = gateResult('verification', { scanFn: weakSignals });
    assert.equal(r.pillar, 'verification');
    assert.equal(r.threshold, GATE_THRESHOLD);
    assert.equal(r.passed, true);
    assert.ok(r.subScore >= GATE_THRESHOLD);
  });

  test('fails when the scan does NOT see the pillar (cannot be faked)', () => {
    // automation is absent in weakSignals -> gate must refuse to advance.
    const r = gateResult('automation', { scanFn: weakSignals });
    assert.equal(r.passed, false);
    assert.ok(r.subScore < GATE_THRESHOLD);
  });

  test('re-scans every call: a now-present pillar flips from fail to pass', () => {
    let installed = false;
    const scanFn = () => installed
      ? { scheduledJobs: 2 }          // after "installing" the recurring job
      : { hooks: { lintTest: true } }; // before
    assert.equal(gateResult('automation', { scanFn }).passed, false);
    installed = true; // the attendee actually set it up; disk changed
    assert.equal(gateResult('automation', { scanFn }).passed, true);
  });

  test('unknown pillar throws (surfaced as a readable tool error upstream)', () => {
    assert.throws(() => gateResult('teleportation', { scanFn: weakSignals }), /unknown pillar/i);
  });
});
