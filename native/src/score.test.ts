// native/src/score.test.ts
import { describe, test, expect } from 'bun:test';
import { subScores, score } from './score.ts';

describe('subScores', () => {
  test('empty signals -> all zero', () => {
    const s = subScores({});
    expect(s.verification).toBe(0);
    expect(s.automation).toBe(0);
    expect(s.context).toBe(0);
    expect(s.orchestration).toBe(0);
    expect(s.delegation).toBe(0);
  });

  test('any hook -> verification 1', () => {
    expect(subScores({ hooks: { any: true } }).verification).toBe(1);
  });

  test('context combines claudeMd + skills + mcp to a full 1', () => {
    expect(subScores({ claudeMd: true, skills: 4, mcpServers: 2 }).context).toBe(1);
  });
});

describe('score', () => {
  test('empty -> 0', () => {
    expect(score({}).total).toBe(0);
  });

  test('only a hook -> 22 (verification weight)', () => {
    expect(score({ hooks: { any: true } }).total).toBe(22);
  });

  test('total is always a 0..100 integer', () => {
    const t = score({ hooks: { any: true }, claudeMd: true, skills: 4, mcpServers: 2, worktrees: 2 }).total;
    expect(Number.isInteger(t) && t >= 0 && t <= 100).toBe(true);
  });
});
