// native/src/card.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCard } from './card.mjs';

describe('renderCard', () => {
  test('opening card shows the before score and no delta badge', () => {
    const html = renderCard({ before: { hooks: { lintTest: true } }, name: 'Nick' });
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /22%/);
    assert.match(html, /Nick/);
    assert.ok(!/class="delta"/.test(html));
  });

  test('closing card shows the after score and a +delta badge', () => {
    const html = renderCard({
      before: {},
      after: { hooks: { lintTest: true }, claudeMd: true, skills: 4, mcpServers: 2 },
    });
    assert.match(html, /class="delta"/);
    assert.match(html, /\+42/); // 0 -> 42 (verification 22 + context 20)
  });

  test('is self-contained: no external src/href', () => {
    const html = renderCard({ before: {} });
    assert.ok(!/\bsrc=|\bhref=/.test(html));
  });
});
