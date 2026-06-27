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
