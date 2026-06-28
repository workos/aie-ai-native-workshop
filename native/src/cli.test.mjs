// native/src/cli.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './cli.mjs';

const fakeScan = () => ({ hooks: { lintTest: true } }); // -> total 22

describe('run', () => {
  test('scan returns score + recommendations from injected signals', () => {
    const result = run(['scan'], { scanFn: fakeScan });
    assert.equal(result.total, 22);
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(!result.recommendations.some((r) => r.pillar === 'verification'));
  });

  test('card writes a self-contained HTML file', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'aie-card-')), 'card.html');
    const returned = run(['card', out], { scanFn: fakeScan });
    assert.equal(returned, out);
    assert.ok(existsSync(out));
    assert.match(readFileSync(out, 'utf8'), /22%/);
  });
});

// --- append to native/src/cli.test.mjs ---
import { buildObservation } from './evidence.mjs';

describe('run with evidence', () => {
  const fakeScanWeakVerify = () => ({ claudeMd: true }); // verification weak (0)
  const fakeObserve = () => [buildObservation('thrash-loop', 4, { windowDays: 30, now: 0, sample: 'npm test' })];

  test('scan merges observations: a rec becomes observed-waste (count-only), score unchanged', () => {
    const result = run(['scan'], { scanFn: fakeScanWeakVerify, observeFn: fakeObserve });
    const baseline = run(['scan'], { scanFn: fakeScanWeakVerify, observeFn: () => [] });
    // evidence does not move the number
    assert.equal(result.total, baseline.total);
    const v = result.recommendations.find((r) => r.pillar === 'verification');
    assert.equal(v.basis, 'observed-waste');
    assert.equal(v.hoursPerWeek, null); // count-only: no fabricated hours
    assert.doesNotMatch(v.evidence, /h\/wk/);
    assert.ok(Array.isArray(result.observations));
  });

  test('a throwing observeFn does not crash scan (degrades to gap-only)', () => {
    const result = run(['scan'], {
      scanFn: fakeScanWeakVerify,
      observeFn: () => { throw new Error('corpus exploded'); },
    });
    assert.ok(Array.isArray(result.recommendations));
    assert.deepEqual(result.observations, []);
    assert.equal(result.recommendations.find((r) => r.pillar === 'verification').basis, 'capability-gap');
  });
});
