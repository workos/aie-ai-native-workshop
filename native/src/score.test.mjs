// native/src/score.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { subScores, score } from './score.mjs';

describe('subScores', () => {
  test('empty signals -> all zero', () => {
    const s = subScores({});
    assert.equal(s.verification, 0);
    assert.equal(s.automation, 0);
    assert.equal(s.context, 0);
    assert.equal(s.orchestration, 0);
    assert.equal(s.delegation, 0);
  });

  test('lint/test hook -> verification 1', () => {
    assert.equal(subScores({ hooks: { lintTest: true } }).verification, 1);
  });

  test('context combines claudeMd + skills + mcp to a full 1', () => {
    assert.equal(subScores({ claudeMd: true, skills: 4, mcpServers: 2 }).context, 1);
  });
});

describe('score', () => {
  test('empty -> 0', () => {
    assert.equal(score({}).total, 0);
  });

  test('only a lint/test hook -> 22 (verification weight)', () => {
    assert.equal(score({ hooks: { lintTest: true } }).total, 22);
  });

  test('total is always a 0..100 integer', () => {
    const t = score({ hooks: { lintTest: true }, claudeMd: true, skills: 4, mcpServers: 2, worktrees: 2 }).total;
    assert.ok(Number.isInteger(t) && t >= 0 && t <= 100);
  });
});
