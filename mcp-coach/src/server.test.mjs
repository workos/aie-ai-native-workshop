// Smoke harness for the stdio JSON-RPC MCP server. Drives the server's *real*
// stdio — no mocks: spawn `node server.mjs`, write newline-delimited JSON-RPC
// requests to its stdin, collect the framed JSON lines it writes to stdout, and
// assert the parsed responses. This proves the framing path end-to-end:
// `initialize` -> `tools/list` -> `tools/call`, plus the transport edge cases
// (split/coalesced messages, malformed lines, notifications) that are the most
// common bugs in a hand-rolled line protocol.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, 'server.mjs');
// Repo root is two levels up from mcp-coach/src — the server asserts it was
// launched from here, so spawn with this cwd to keep stderr clean.
const REPO_ROOT = join(__dirname, '..', '..');

// Spawn the server, write `requests` (array of objects -> compact JSON lines),
// close stdin, and resolve once the child exits with { lines, stderr, code }.
// `lines` is stdout split on newlines (blank trailing entry dropped). Closing
// stdin is what ends the server's read loop, so every harness call terminates.
function run(requests, { cwd = REPO_ROOT, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], {
      cwd,
      // Merge any overrides (e.g. WORKER_URL) onto the inherited env so the
      // check-in tools delegate to submit.mjs against a local stub, not the
      // real board.
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      out += c;
    });
    child.stderr.on('data', (c) => {
      err += c;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = out.split('\n').filter((l) => l !== '');
      resolve({ lines, stderr: err, code });
    });

    for (const req of requests) {
      // A pre-framed raw string (for the malformed-line case) is written as-is;
      // everything else is serialized to one compact line.
      child.stdin.write(typeof req === 'string' ? req : JSON.stringify(req) + '\n');
    }
    child.stdin.end();
  });
}

const init = (id = 1, params = {}) => ({ jsonrpc: '2.0', id, method: 'initialize', params });

describe('handshake', () => {
  test('initialize returns a framed result echoing the id', async () => {
    const { lines } = await run([init(1, { protocolVersion: '2025-06-18' })]);
    assert.equal(lines.length, 1, 'exactly one response line');

    const msg = JSON.parse(lines[0]);
    assert.equal(msg.jsonrpc, '2.0');
    assert.equal(msg.id, 1, 'response id matches the request id');
    assert.ok(msg.result, 'has a result, not an error');
    assert.equal(msg.result.protocolVersion, '2025-06-18', 'echoes the client protocolVersion');
    assert.ok(msg.result.capabilities.tools, 'advertises the tools capability');
    assert.equal(msg.result.serverInfo.name, 'aie-coach');
    assert.ok(msg.result.serverInfo.version, 'reports a version');
  });

  test('initialize pins a fallback protocolVersion when the client omits it', async () => {
    const { lines } = await run([init(7, {})]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 7);
    assert.equal(typeof msg.result.protocolVersion, 'string');
    assert.ok(msg.result.protocolVersion.length > 0, 'pins a non-empty version');
  });

  test('a notification (no id) produces no response line', async () => {
    const { lines } = await run([
      init(1),
      { jsonrpc: '2.0', method: 'notifications/initialized' }, // notification: no id
    ]);
    // Only the initialize reply — the notification is silent.
    assert.equal(lines.length, 1, 'notification yields no extra line');
    assert.equal(JSON.parse(lines[0]).id, 1);
  });

  test('two messages in one stdin write produce two correlated responses', async () => {
    // Both messages are delivered in a single write (coalesced on one chunk),
    // separated only by the newline framing.
    const raw =
      JSON.stringify(init(1)) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
    const { lines } = await run([raw]);

    assert.equal(lines.length, 2, 'both messages answered');
    const ids = lines.map((l) => JSON.parse(l).id).sort();
    assert.deepEqual(ids, [1, 2], 'responses correlate to both request ids');
  });

  test('a non-JSON line yields a framed -32700 parse error and the loop survives', async () => {
    const { lines } = await run([
      'this is not json\n', // malformed line
      init(2), // a valid message after the bad one
    ]);

    // The parse error response (id null) plus the later valid initialize reply.
    assert.equal(lines.length, 2, 'parse error did not kill the read loop');
    const parsed = lines.map((l) => JSON.parse(l));
    const parseErr = parsed.find((m) => m.error && m.error.code === -32700);
    assert.ok(parseErr, 'a -32700 parse error was framed');
    assert.equal(parseErr.id, null, 'parse error uses a null id (request id unknowable)');
    assert.ok(
      parsed.find((m) => m.id === 2 && m.result),
      'the valid message after the bad line was still served',
    );
  });

  test('stdout carries only JSON; diagnostics go to stderr', async () => {
    const { lines } = await run([init(1)]);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `stdout line is valid JSON: ${line}`);
    }
  });
});

describe('tools/list', () => {
  test('returns a correlated array result', async () => {
    // Framing contract only — the exact tool set is asserted by `tools/list mvp`.
    const { lines } = await run([{ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 3);
    assert.ok(Array.isArray(msg.result.tools), 'result.tools is an array');
  });
});

describe('tools/call', () => {
  test('an unknown tool name yields a framed -32602 error', async () => {
    const { lines } = await run([
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } },
    ]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 4);
    assert.ok(msg.error, 'returns an error, not a result');
    assert.equal(msg.error.code, -32602, 'unknown tool is invalid-params');
    assert.match(msg.error.message, /nope/, 'error names the offending tool');
  });
});

describe('dispatch', () => {
  test('an unknown method yields a framed -32601 error', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 5, method: 'does/not/exist', params: {} }]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 5);
    assert.equal(msg.error.code, -32601, 'unknown method is method-not-found');
  });
});

describe('startup', () => {
  test('warns to stderr (not stdout) when launched outside the repo root', async () => {
    const { lines, stderr } = await run([init(1)], { cwd: __dirname }); // mcp-coach/src is not the root
    assert.match(stderr, /WARNING/, 'a loud cwd warning is written to stderr');
    // The warning must not leak into the protocol channel.
    assert.equal(lines.length, 1, 'stdout still carries only the protocol reply');
    assert.ok(JSON.parse(lines[0]).result, 'the server still answers despite the wrong cwd');
  });
});

// --- Phase 2: board-layer check-in tools ---------------------------------

// Build a tools/call request for `name` with `args`.
const call = (id, name, args = {}) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

// Find the response with `id` in the framed stdout lines and parse the tool
// result out of its content[0].text (the server JSON-stringifies tool results).
function toolResult(lines, id) {
  const msg = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
  assert.ok(msg, `a response for id ${id} was returned`);
  assert.ok(msg.result, `id ${id} is a result, not an error: ${JSON.stringify(msg.error)}`);
  return { parsed: JSON.parse(msg.result.content[0].text), isError: msg.result.isError === true };
}

// A fresh temp dir to use as the server's cwd so marker/outbox writes are
// isolated from the repo. Returns the path.
function freshCwd() {
  return mkdtempSync(join(tmpdir(), 'coach-srv-'));
}

describe('tools/list mvp', () => {
  test('exposes the two board-layer tools with valid schemas', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 10);

    const names = msg.result.tools.map((t) => t.name);
    // The two board-layer tools must be present with valid schemas. (The exact
    // four-tool set is asserted by `tools/list full` once Phase 4 lands the
    // navigation tools.)
    assert.ok(names.includes('coach_checkin'), 'coach_checkin is registered');
    assert.ok(names.includes('coach_submit_checkin'), 'coach_submit_checkin is registered');

    for (const t of msg.result.tools) {
      assert.equal(typeof t.description, 'string');
      assert.ok(t.description.length > 0, `${t.name} has a description`);
      assert.equal(t.inputSchema.type, 'object', `${t.name} inputSchema is an object`);
      assert.equal(t.inputSchema.additionalProperties, false, `${t.name} disallows extra props`);
    }

    const submitTool = msg.result.tools.find((t) => t.name === 'coach_submit_checkin');
    assert.deepEqual(submitTool.inputSchema.required, ['answers', 'confirmed'], 'submit requires answers+confirmed');
  });
});

// --- Phase 4: navigation-layer guidance tools ----------------------------

describe('tools/list full', () => {
  test('exposes exactly the four tools after the navigation layer lands', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 11);

    const names = msg.result.tools.map((t) => t.name).sort();
    assert.deepEqual(
      names,
      ['coach_checkin', 'coach_checkpoint', 'coach_status', 'coach_submit_checkin'],
      'exactly the four tools (two board-layer + two navigation)',
    );

    // The two navigation tools carry valid object schemas too.
    const status = msg.result.tools.find((t) => t.name === 'coach_status');
    const checkpoint = msg.result.tools.find((t) => t.name === 'coach_checkpoint');
    assert.equal(status.inputSchema.type, 'object', 'coach_status inputSchema is an object');
    assert.equal(status.inputSchema.additionalProperties, false, 'coach_status disallows extra props');
    assert.deepEqual(checkpoint.inputSchema.required, ['block'], 'coach_checkpoint requires a block');
    assert.equal(checkpoint.inputSchema.properties.block.minimum, 1, 'block is constrained >= 1');
    assert.equal(checkpoint.inputSchema.properties.block.maximum, 4, 'block is constrained <= 4');
  });
});

describe('coach_status', () => {
  test('fresh marker (pre): no participantId, currentBlock null, nextAction is the opening check-in', async () => {
    const cwd = freshCwd(); // no marker -> detect() returns { phase:'pre' }
    const { lines } = await run([call(1, 'coach_status')], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    assert.equal(isError, false, 'not an error result');
    assert.equal(parsed.phase, 'pre');
    assert.equal(parsed.participantId, undefined, 'pre has no participantId');
    assert.equal(parsed.currentBlock, null, 'no progress yet -> currentBlock null');
    assert.deepEqual(parsed.blocksDone, [], 'no blocks done yet');
    assert.match(parsed.nextAction, /opening check-in/i, 'fresh attendee is pointed at the opening check-in');
  });

  test('after two checkpoints: blocksDone [1,2] and a sensible block-3 nextAction', async () => {
    const cwd = freshCwd();
    // Seed a participantId so status is past the opening-check-in branch and the
    // first-action hint (not the opening check-in) is exercised.
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'Backend / Go', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run(
      [call(1, 'coach_checkpoint', { block: 1 }), call(2, 'coach_checkpoint', { block: 2 }), call(3, 'coach_status')],
      { cwd },
    );
    const { parsed } = toolResult(lines, 3);

    assert.equal(parsed.phase, 'post', 'a seeded participantId reads as post');
    assert.deepEqual(parsed.blocksDone, [1, 2], 'both checkpoints recorded');
    assert.equal(parsed.currentBlock, 3, 'advanced to block 3');
    assert.match(parsed.nextAction, /Block 3/, 'nextAction names the current block');
    assert.match(parsed.nextAction, /lint\/typecheck\/test hook/, "nextAction is block 3's first action");
  });
});

describe('coach_checkpoint', () => {
  test('block 1 with no participantId: congrats, advances to block 2, AND a soft nudge', async () => {
    const cwd = freshCwd(); // no marker -> pre -> no participantId
    const { lines } = await run([call(1, 'coach_checkpoint', { block: 1 })], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    assert.equal(isError, false, 'not an error result');
    assert.match(parsed.congrats, /Block 1/, 'congratulates on block 1');
    assert.equal(parsed.done, false, 'block 1 is not the last');
    assert.equal(parsed.nextBlock.n, 2, 'advances to block 2');
    assert.ok(parsed.nextBlock.goal && parsed.nextBlock.firstAction && parsed.nextBlock.doneWhen, 'next-block guidance is present');
    assert.ok(parsed.nudge, 'a soft nudge is present when there is no opening check-in');
    assert.match(parsed.nudge, /opening check-in/i, 'the nudge points at the opening check-in');
  });

  test('block 1 WITH a participantId: no nudge', async () => {
    const cwd = freshCwd();
    // Fabricate a pre marker so detect() reports post (has participantId).
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'PM', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run([call(2, 'coach_checkpoint', { block: 1 })], { cwd });
    const { parsed } = toolResult(lines, 2);

    assert.equal(parsed.nextBlock.n, 2, 'still advances to block 2');
    assert.equal(parsed.nudge, undefined, 'no nudge once the opening check-in is done');
  });

  test('block 4: done true, no nextBlock, a closing-check-in prompt', async () => {
    const cwd = freshCwd();
    const { lines } = await run([call(3, 'coach_checkpoint', { block: 4 })], { cwd });
    const { parsed } = toolResult(lines, 3);

    assert.equal(parsed.done, true, 'block 4 is the last');
    assert.equal(parsed.nextBlock, undefined, 'no next block after 4');
    assert.ok(parsed.closing, 'a closing prompt is present');
    assert.match(parsed.closing, /closing check-in/i, 'points at the closing check-in');
  });

  test('the recorded block survives into coach_status (shared marker)', async () => {
    const cwd = freshCwd();
    const { lines } = await run([call(1, 'coach_checkpoint', { block: 1 }), call(2, 'coach_status')], { cwd });
    const { parsed } = toolResult(lines, 2);
    assert.deepEqual(parsed.blocksDone, [1], 'the checkpoint persisted to the shared marker');
    assert.equal(parsed.currentBlock, 2, 'status reflects the advance');
  });
});

describe('coach_checkin', () => {
  test('pre phase: needsRole and the three opening questions with prompts', async () => {
    const cwd = freshCwd(); // no marker -> pre
    const { lines } = await run([call(1, 'coach_checkin')], { cwd });
    const { parsed, isError } = toolResult(lines, 1);

    assert.equal(isError, false, 'not an error result');
    assert.equal(parsed.phase, 'pre');
    assert.equal(parsed.needsRole, true, 'pre asks for the role');
    assert.ok(parsed.rolePrompt && parsed.rolePrompt.length > 0, 'a role prompt is provided');

    assert.deepEqual(
      parsed.questions.map((q) => q.questionKey),
      ['time_sink', 'friction', 'goal'],
      'the three opening questions in order',
    );
    for (const q of parsed.questions) {
      assert.ok(q.prompt && q.prompt.length > 0, `${q.questionKey} has a non-empty prompt`);
    }
  });

  test('post phase (marker has participantId): no role, the two closing questions', async () => {
    const cwd = freshCwd();
    // Fabricate a pre marker so detect() reports post.
    writeFileSync(
      join(cwd, '.aie-coach-state.json'),
      JSON.stringify({ participantId: 'fixed-id', role: 'Backend / Go', preSubmittedAt: new Date().toISOString() }),
    );
    const { lines } = await run([call(2, 'coach_checkin')], { cwd });
    const { parsed } = toolResult(lines, 2);

    assert.equal(parsed.phase, 'post');
    assert.equal(parsed.needsRole, false, 'post reuses the marker role');
    assert.equal(parsed.rolePrompt, undefined, 'no role prompt in post');
    assert.deepEqual(
      parsed.questions.map((q) => q.questionKey),
      ['built', 'next'],
      'the two closing questions in order',
    );
  });
});

describe('consent', () => {
  test('confirmed:false writes no marker, no outbox, makes no POST', async () => {
    const cwd = freshCwd();
    let hit = false;
    const server = createServer((req, res) => {
      hit = true;
      res.end('ok');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;

    try {
      const { lines } = await run([call(3, 'coach_submit_checkin', { role: 'PM', answers: { time_sink: 'a', friction: 'b', goal: 'c' }, confirmed: false })], {
        cwd,
        env: { WORKER_URL: url },
      });
      const { parsed } = toolResult(lines, 3);

      assert.equal(parsed.sent, false);
      assert.equal(parsed.reason, 'unconfirmed', 'the consent guard returns unconfirmed');
      assert.equal(hit, false, 'no POST was made');
      assert.equal(existsSync(join(cwd, '.aie-coach-state.json')), false, 'no marker written');
      assert.equal(existsSync(join(cwd, '.aie-coach-outbox')), false, 'no outbox written');
    } finally {
      server.close();
    }
  });
});

describe('malformed', () => {
  test('confirmed:true with bad answers returns invalid_answers and the server stays alive', async () => {
    const cwd = freshCwd();
    // Missing the required keys for the pre phase -> submit() throws before the
    // consent guard. The handler must catch it and return a structured error,
    // and the read loop must survive to answer the follow-up tools/list.
    const { lines } = await run(
      [
        call(4, 'coach_submit_checkin', { role: 'Eng', answers: { not_a_key: 'x' }, confirmed: true }),
        { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }, // proves the process is still alive
      ],
      { cwd, env: { WORKER_URL: 'http://127.0.0.1:1' } },
    );

    const { parsed, isError } = toolResult(lines, 4);
    assert.equal(isError, false, 'a caught validation error is a normal result, not a transport error');
    assert.equal(parsed.error, 'invalid_answers', 'structured invalid_answers error');
    assert.ok(parsed.detail && parsed.detail.length > 0, 'includes a human-readable detail');
    // A missing key throws in buildAnswers (no schemaErrors); a schema-shape
    // violation throws from validateAgainstSchema (schemaErrors array). The
    // handler surfaces whichever the real cause was, defaulting to null.
    assert.ok(
      parsed.schemaErrors === null || Array.isArray(parsed.schemaErrors),
      'schemaErrors is an array or null',
    );
    assert.ok('schemaErrors' in parsed, 'the handler always includes a schemaErrors field');

    // The follow-up request was answered -> the malformed payload did not crash
    // the server.
    const after = lines.map((l) => JSON.parse(l)).find((m) => m.id === 5);
    assert.ok(after && after.result, 'the server answered a request after the malformed one');

    // Nothing leaked to disk on the error path.
    assert.equal(existsSync(join(cwd, '.aie-coach-state.json')), false, 'no marker on the error path');
    assert.equal(existsSync(join(cwd, '.aie-coach-outbox')), false, 'no outbox on the error path');
  });
});

describe('outbox', () => {
  test('confirmed:true with valid answers against an unreachable board falls back to the outbox', async () => {
    const cwd = freshCwd();
    const { lines } = await run(
      [call(6, 'coach_submit_checkin', { role: 'Backend / Go', answers: { time_sink: 'a', friction: 'b', goal: 'c' }, confirmed: true })],
      { cwd, env: { WORKER_URL: 'http://127.0.0.1:1' } }, // refuses immediately
    );
    const { parsed } = toolResult(lines, 6);

    assert.equal(parsed.sent, false);
    assert.ok(parsed.outbox, 'an outbox path is returned');
    assert.equal(parsed.phase, 'pre');

    // The marker is written before the POST, and exactly one outbox file lands.
    assert.ok(existsSync(join(cwd, '.aie-coach-state.json')), 'marker written before the POST');
    const files = readdirSync(join(cwd, '.aie-coach-outbox'));
    assert.equal(files.length, 1, 'exactly one outbox file');
  });
});
