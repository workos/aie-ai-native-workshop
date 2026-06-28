// native/src/card.test.ts
import { describe, test, expect } from 'bun:test';
import { renderCard } from './card.ts';

describe('renderCard', () => {
  test('opening card shows the before score and no delta badge', () => {
    const html = renderCard({ before: { hooks: { lintTest: true } }, name: 'Nick' });
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/22%/);
    expect(html).toMatch(/Nick/);
    expect(!/class="delta"/.test(html)).toBeTruthy();
  });

  test('closing card shows the after score and a +delta badge', () => {
    const html = renderCard({
      before: {},
      after: { hooks: { lintTest: true }, claudeMd: true, skills: 4, mcpServers: 2 },
    });
    expect(html).toMatch(/class="delta"/);
    expect(html).toMatch(/\+42/); // 0 -> 42 (verification 22 + context 20)
  });

  test('is self-contained: no external src/href', () => {
    const html = renderCard({ before: {} });
    expect(!/\bsrc=|\bhref=/.test(html)).toBeTruthy();
  });
});
