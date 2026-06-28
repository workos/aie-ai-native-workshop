// native/src/cli.test.ts
import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './cli.ts';
import type { CoachReport, Signals } from './types.ts';

const fakeScan = (): Signals => ({ hooks: { lintTest: true } }) as Signals; // -> total 22

describe('run', () => {
  test('scan returns score + recommendations from injected signals', () => {
    const result = run(['scan'], { scanFn: fakeScan }) as CoachReport;
    expect(result.total).toBe(22);
    expect(Array.isArray(result.recommendations)).toBeTruthy();
    expect(!result.recommendations.some((r) => r.pillar === 'verification')).toBeTruthy();
  });

  test('card writes a self-contained HTML file', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'aie-card-')), 'card.html');
    const returned = run(['card', out], { scanFn: fakeScan });
    expect(returned).toBe(out);
    expect(existsSync(out)).toBeTruthy();
    expect(readFileSync(out, 'utf8')).toMatch(/22%/);
  });
});

// --- append to native/src/cli.test.ts ---
import { buildObservation } from './evidence.ts';

describe('run with evidence', () => {
  const fakeScanWeakVerify = (): Signals => ({ claudeMd: true }) as Signals; // verification weak (0)
  const fakeObserve = () => [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0, sample: 'npm test' })!];

  test('scan merges observations: a rec becomes observed-waste (count-only), score unchanged', () => {
    const result = run(['scan'], { scanFn: fakeScanWeakVerify, observeFn: fakeObserve }) as CoachReport;
    const baseline = run(['scan'], { scanFn: fakeScanWeakVerify, observeFn: () => [] }) as CoachReport;
    // evidence does not move the number
    expect(result.total).toBe(baseline.total);
    const v = result.recommendations.find((r) => r.pillar === 'verification');
    expect(v!.basis).toBe('observed-waste');
    expect(v!.hoursPerWeek).toBe(null); // count-only: no fabricated hours
    expect(v!.evidence).not.toMatch(/h\/wk/);
    expect(Array.isArray(result.observations)).toBeTruthy();
  });

  test('a throwing observeFn does not crash scan (degrades to gap-only)', () => {
    const result = run(['scan'], {
      scanFn: fakeScanWeakVerify,
      observeFn: () => { throw new Error('corpus exploded'); },
    }) as CoachReport;
    expect(Array.isArray(result.recommendations)).toBeTruthy();
    expect(result.observations).toEqual([]);
    expect(result.recommendations.find((r) => r.pillar === 'verification')!.basis).toBe('capability-gap');
  });
});
