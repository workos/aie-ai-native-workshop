// native/src/coach/engine.test.ts
import { describe, test, expect } from 'bun:test';
import { GATE_THRESHOLD, PILLAR_IDS, coachScan, nextStep, gateResult } from './engine.ts';
import type { ScoreInput, Signals } from '../types.ts';

// Signals where ONLY verification is present (lint/test hook). Everything else 0.
const weakSignals = (): Signals => ({ hooks: { any: true, lintTest: true } }) as Signals;
// Signals where every pillar clears the bar -> no recommendations, gate passes.
const strongSignals = (): Signals => ({
  hooks: { any: true, lintTest: true },
  claudeMd: true, skills: 4, mcpServers: 2,
  worktrees: 2, scheduledJobs: 2, reusableDelegationPattern: true,
}) as Signals;
const noObs = () => [];

describe('GATE_THRESHOLD / PILLAR_IDS', () => {
  test('threshold matches the recommend() cutoff (single-sourced)', () => {
    expect(GATE_THRESHOLD).toBe(0.8);
  });
  test('PILLAR_IDS lists the five engine pillars', () => {
    expect([...PILLAR_IDS].sort()).toEqual([
      'automation', 'context', 'delegation', 'orchestration', 'verification',
    ]);
  });
});

describe('coachScan', () => {
  test('returns the full report shape from an injected scan', () => {
    const r = coachScan({ scanFn: weakSignals, observeFn: noObs });
    expect(r.signals).toEqual(weakSignals());
    expect(r.total).toBe(22); // verification weight only
    expect(Array.isArray(r.recommendations)).toBeTruthy();
    expect(Array.isArray(r.observations)).toBeTruthy();
    expect(typeof r.pillars.verification === 'number').toBeTruthy();
  });

  test('a throwing observeFn degrades to [] observations, never throws', () => {
    const boom = () => { throw new Error('hostile corpus'); };
    const r = coachScan({ scanFn: weakSignals, observeFn: boom });
    expect(r.observations).toEqual([]);
    expect(r.total).toBe(22); // evidence never moves the score
  });
});

describe('nextStep', () => {
  test('returns the weakest sub-0.8 pillar with its sub-score', () => {
    const step = nextStep({ scanFn: weakSignals, observeFn: noObs });
    expect(step).not.toBe(null);
    expect(step!.pillar).not.toBe('verification'); // already strong -> skipped
    expect(step!.subScore).toBe(0);                 // weakest pillars sit at 0
    expect(typeof step!.action === 'string' && step!.action.length > 0).toBeTruthy();
    expect(step!.basis === 'capability-gap' || step!.basis === 'observed-waste').toBeTruthy();
  });

  test('null when every pillar already clears the bar', () => {
    expect(nextStep({ scanFn: strongSignals, observeFn: noObs })).toBe(null);
  });

  test('never returns the automation pillar (recommend-only, not a gated step)', () => {
    // automation is the weakest here (everything but verification is 0), but it is
    // not gateable -> nextStep must skip it and pick a gateable pillar instead.
    const step = nextStep({ scanFn: weakSignals, observeFn: noObs });
    expect(step).not.toBe(null);
    expect(step!.pillar).not.toBe('automation');
  });
});

describe('gateResult', () => {
  test('passes only when the fresh scan shows the pillar present', () => {
    // The scan SEES verification -> gate passes.
    const r = gateResult('verification', { scanFn: weakSignals });
    expect(r.pillar).toBe('verification');
    expect(r.threshold).toBe(GATE_THRESHOLD);
    expect(r.passed).toBe(true);
    expect(r.subScore >= GATE_THRESHOLD).toBeTruthy();
  });

  test('fails when the scan does NOT see the pillar (cannot be faked)', () => {
    // orchestration is absent in weakSignals -> gate must refuse to advance.
    const r = gateResult('orchestration', { scanFn: weakSignals });
    expect(r.passed).toBe(false);
    expect(r.subScore < GATE_THRESHOLD).toBeTruthy();
  });

  test('automation is non-gateable: passed:false even when scheduled jobs appear', () => {
    // automation can never be machine-verified from disk, so a scan that "sees"
    // scheduled jobs still does NOT pass — it is recommend-only.
    const r = gateResult('automation', { scanFn: () => ({ scheduledJobs: 2 }) });
    expect(r.gateable).toBe(false);
    expect(r.passed).toBe(false);
  });

  test('re-scans every call: a now-present pillar flips from fail to pass', () => {
    let installed = false;
    const scanFn = (): ScoreInput => (installed
      ? { worktrees: 2 }              // after "installing" parallel worktrees
      : { hooks: { lintTest: true } }); // before
    expect(gateResult('orchestration', { scanFn }).passed).toBe(false);
    installed = true; // the attendee actually set it up; disk changed
    expect(gateResult('orchestration', { scanFn }).passed).toBe(true);
  });

  test('unknown pillar throws (surfaced as a readable tool error upstream)', () => {
    expect(() => gateResult('teleportation', { scanFn: weakSignals })).toThrow(/unknown pillar/i);
  });
});

// native/src/coach/engine.test.ts  (append)
import { beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tools } from './server.ts';
import { readState, writeProgress } from './state.ts';

describe('gate persistence (marker round-trip)', () => {
  let prevCwd: string;
  let dir: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'aie-coach-gate-'));
    mkdirSync(join(dir, 'skills', 'coach-checkin', 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'coach-checkin', 'scripts', 'submit.ts'), '');
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('a passing gate records the pillar; re-passing is idempotent', async () => {
    const gate = tools.get('coach_gate')!;
    const first = (await gate.handler({ pillar: 'verification' })) as { passed: boolean };
    if (!first.passed) return; // machine without a lint/test hook: nothing to assert
    expect(readState().pillarsPassed).toEqual(['verification']);
    const second = (await gate.handler({ pillar: 'verification' })) as { pillarsPassed: unknown };
    expect(second.pillarsPassed).toEqual(['verification']); // no duplicate
  });

  test('gate fields do not clobber identity or progress fields', async () => {
    // Seed identity (submit.ts's job) + progress (state.ts's job) on the marker.
    writeProgress({ participantId: 'p-123', role: 'backend', currentBlock: 2, blocksDone: [1] });
    const gate = tools.get('coach_gate')!;
    const r = (await gate.handler({ pillar: 'verification' })) as { passed: boolean };
    const state = readState();
    // Identity + progress survive the gate write regardless of pass/fail.
    expect(state.participantId).toBe('p-123');
    expect(state.role).toBe('backend');
    expect(state.currentBlock).toBe(2);
    expect(state.blocksDone).toEqual([1]);
    if (r.passed) expect(state.pillarsPassed).toEqual(['verification']);
  });

  test('coach_scan stores the opening baseline exactly once', async () => {
    const scanTool = tools.get('coach_scan')!;
    const a = (await scanTool.handler({})) as { total: number };
    const baseline = readState();
    expect(baseline.openingSignals).toBeTruthy();
    expect(baseline.scoreBefore).toBe(a.total);
    // A later scan must NOT overwrite the stored opening baseline.
    await scanTool.handler({});
    expect(readState().openingSignals).toEqual(baseline.openingSignals);
    expect(readState().scoreBefore).toBe(baseline.scoreBefore);
  });
});
