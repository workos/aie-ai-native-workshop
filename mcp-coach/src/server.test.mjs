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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, 'server.mjs');
// Repo root is two levels up from mcp-coach/src — the server asserts it was
// launched from here, so spawn with this cwd to keep stderr clean.
const REPO_ROOT = join(__dirname, '..', '..');

// Spawn the server, write `requests` (array of objects -> compact JSON lines),
// close stdin, and resolve once the child exits with { lines, stderr, code }.
// `lines` is stdout split on newlines (blank trailing entry dropped). Closing
// stdin is what ends the server's read loop, so every harness call terminates.
function run(requests, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
  test('returns an array (empty at phase 1)', async () => {
    const { lines } = await run([{ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }]);
    const msg = JSON.parse(lines[0]);
    assert.equal(msg.id, 3);
    assert.ok(Array.isArray(msg.result.tools), 'result.tools is an array');
    assert.deepEqual(msg.result.tools, [], 'no tools registered yet at phase 1');
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
