// native/src/evidence.mjs
// The behavioral (evidence) layer. Reads the LOCAL transcript corpus and turns it
// into OBSERVED COUNTS, then uses those counts to JUSTIFY recommendations — it
// NEVER feeds score.mjs. Every path/field here is verified on disk; anything we
// cannot see degrades to 0/empty and is surfaced in the plan's "Needs dry-run"
// section, never guessed. All functions are total: bad input yields 0/empty,
// never a throw (JSONL fields vary by CLI version, so every field is optional).

// --- pure line classifiers --------------------------------------------------

// A real user turn = a typed string prompt, not meta, not a tool_result wrapper,
// not a slash/local-command echo. (Verified: array-content user lines are tool
// results; isMeta marks injected context.)
export function isRealUserTurn(line) {
  if (!line || line.type !== 'user' || line.isMeta === true) return false;
  const content = line.message?.content;
  if (typeof content !== 'string') return false;
  return !/^\s*<(local-command|command-name|command-message)/.test(content);
}

// Commands that mean "I'm verifying by hand" — the work a hook should be doing.
const TEST_LINT = /\b(tsc|typecheck|type-check|eslint|prettier|jest|vitest|pytest|rspec|mocha|ava|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint)|node\s+--check|go\s+test|cargo\s+test)\b/;

function* toolUses(lines, name) {
  for (const line of lines ?? []) {
    if (line?.type !== 'assistant') continue;
    const blocks = line.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b?.type === 'tool_use' && b.name === name) yield b;
    }
  }
}

// Count by-hand test/lint runs: assistant Bash tool_use whose command matches a
// known runner. Each invocation counts (repeats are the signal — a hook would
// have removed them). Total: skips non-assistant / non-array / non-Bash silently.
export function countManualTestRuns(lines) {
  let n = 0;
  for (const b of toolUses(lines, 'Bash')) {
    const cmd = b.input?.command;
    if (typeof cmd === 'string' && TEST_LINT.test(cmd)) n += 1;
  }
  return n;
}

// Count re-pasted contexts: a contentHash that appears under >= 2 DISTINCT
// sessionIds in history.jsonl. (The literal text isn't stored; the hash is the
// dedup key. Same hash in one session is not cross-session re-use.)
export function countRepastedContexts(historyLines) {
  const sessionsByHash = new Map();
  for (const row of historyLines ?? []) {
    const sid = row?.sessionId;
    const pasted = row?.pastedContents;
    if (!sid || !pasted || typeof pasted !== 'object') continue;
    for (const v of Object.values(pasted)) {
      const h = v?.contentHash;
      if (typeof h !== 'string') continue;
      if (!sessionsByHash.has(h)) sessionsByHash.set(h, new Set());
      sessionsByHash.get(h).add(sid);
    }
  }
  let repasted = 0;
  for (const sids of sessionsByHash.values()) if (sids.size >= 2) repasted += 1;
  return repasted;
}
