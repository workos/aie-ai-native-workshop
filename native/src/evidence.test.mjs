// native/src/evidence.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isRealUserTurn, countManualTestRuns, countRepastedContexts } from './evidence.mjs';

// A tiny assistant line carrying one Bash tool_use.
const bash = (uuid, command) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: uuid, name: 'Bash', input: { command } }] },
});
// A tool_result line for a Bash command (the shape verified on disk: {commandName, success}).
const bashResult = (commandName, success) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result' }] },
  toolUseResult: { commandName, success },
});

describe('isRealUserTurn', () => {
  test('a typed user string is a real turn', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: 'run the tests' } }), true);
  });
  test('meta lines are not real turns', () => {
    assert.equal(isRealUserTurn({ type: 'user', isMeta: true, message: { content: 'x' } }), false);
  });
  test('array-content (tool_result wrapper) is not a real turn', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: [{ type: 'tool_result' }] } }), false);
  });
  test('local-command wrappers are not real turns', () => {
    assert.equal(isRealUserTurn({ type: 'user', message: { content: '<local-command-stdout>hi</local-command-stdout>' } }), false);
  });
  test('assistant lines are not user turns', () => {
    assert.equal(isRealUserTurn({ type: 'assistant', message: { content: 'hi' } }), false);
  });
});

describe('countManualTestRuns', () => {
  test('counts each by-hand test/lint Bash invocation', () => {
    const lines = [
      bash('a', 'npx tsc --noEmit'),
      bashResult('npx tsc --noEmit', false),
      bash('b', 'npm test'),
      bashResult('npm test', false),
      bash('c', 'git status'),       // not a test/lint command -> ignored
      bashResult('git status', true),
    ];
    assert.equal(countManualTestRuns(lines), 2);
  });
  test('matches a range of runners (pytest, vitest, eslint, cargo test, go test)', () => {
    const cmds = ['pytest -q', 'npx vitest run', 'eslint .', 'cargo test', 'go test ./...'];
    assert.equal(countManualTestRuns(cmds.map((c, i) => bash(String(i), c))), 5);
  });
  test('empty / malformed input -> 0, never throws', () => {
    assert.equal(countManualTestRuns([]), 0);
    assert.equal(countManualTestRuns([{}, { type: 'assistant' }, { type: 'assistant', message: {} }]), 0);
  });
});

describe('countRepastedContexts', () => {
  test('same contentHash across two distinct sessions counts once', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's2', pastedContents: { 1: { contentHash: 'H', id: 1, type: 'text' } } },
      { sessionId: 's3', pastedContents: { 1: { contentHash: 'OTHER', id: 1, type: 'text' } } },
    ];
    assert.equal(countRepastedContexts(rows), 1);
  });
  test('same hash twice in the SAME session does not count (not cross-session)', () => {
    const rows = [
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
      { sessionId: 's1', pastedContents: { 1: { contentHash: 'H' } } },
    ];
    assert.equal(countRepastedContexts(rows), 0);
  });
  test('rows without pastes / malformed -> 0, never throws', () => {
    assert.equal(countRepastedContexts([{ sessionId: 's1' }, {}, { pastedContents: null }]), 0);
  });
});
