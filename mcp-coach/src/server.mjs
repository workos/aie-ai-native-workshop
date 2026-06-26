// Zero-dependency stdio MCP server for the workshop coach. This is the protocol
// spine: it speaks newline-delimited JSON-RPC 2.0 over stdin/stdout and dispatches
// each message to a handler. Later phases register real tools into `tools`; this
// phase ships the registry empty and proves the full framing path
// (`initialize` -> `tools/list` -> `tools/call`) with a smoke test.
//
// Transport rules (the things that must never drift):
//   - stdin arrives in arbitrary chunks: buffer until a `\n`, parse each complete
//     line as one JSON-RPC message, keep any trailing partial in the buffer.
//   - Notifications (a message with no `id`) get NO response, ever.
//   - stdout is the protocol channel: it must carry only compact JSON lines.
//     Every diagnostic goes to stderr.
//
// Pattern followed: skills/coach-checkin/scripts/submit.mjs — named exports, sync
// fs, the `import.meta.url` run-guard, loud-on-defect / graceful-on-operational
// error handling.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROTOCOL_VERSION = '2025-06-18'; // pinned fallback when the client omits one
const SERVER_INFO = { name: 'aie-coach', version: '1.0.0' };

// JSON-RPC error codes used by this server.
const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// A protocol-level error a handler can throw to map to a specific JSON-RPC code.
// Tool-handler *exceptions* are NOT RpcErrors — they become an isError result
// (see handleToolsCall); RpcError is for invalid-params / bad-request shapes.
export class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
  }
}

// Tool registry — populated by later phases. name -> { schema, handler }.
// `schema` is the tool descriptor returned by tools/list; `handler(args)` runs
// the tool and returns a JSON-serializable result (or throws to signal failure).
export const tools = new Map();

// --- framing -------------------------------------------------------------

export function frame(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

export function frameError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// --- method handlers -----------------------------------------------------

function handleInitialize(params) {
  return {
    // Echo the client's protocolVersion for max compatibility; pin otherwise.
    protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
  };
}

function handleToolsList() {
  return { tools: [...tools.values()].map((t) => t.schema) };
}

async function handleToolsCall(params) {
  const entry = tools.get(params?.name);
  // Unknown tool is a protocol-level invalid-params error, distinct from a tool
  // that runs and fails (which is a readable isError result below).
  if (!entry) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${params?.name}`);
  try {
    const result = await entry.handler(params?.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    // Tool-level failure is a result the model can read and recover from, not a
    // transport error that would desync the client.
    return { content: [{ type: 'text', text: String(err?.message ?? err) }], isError: true };
  }
}

// Dispatch table. A handler returns a `result` object (sent framed) or throws an
// RpcError. The notification entry returns undefined and writes nothing.
const METHODS = {
  initialize: handleInitialize,
  'notifications/initialized': () => undefined, // notification: no reply
  'tools/list': handleToolsList,
  'tools/call': handleToolsCall,
};

// --- dispatch ------------------------------------------------------------

// Handle one already-parsed message. Returns the framed response string, or null
// when nothing should be written (notifications). Throwing is not expected here —
// handler errors are caught and framed.
async function dispatch(msg) {
  const { id, method } = msg;
  // A message with no `id` is a notification: run any side effect, write nothing.
  const isNotification = id === undefined || id === null;

  const handler = METHODS[method];
  if (!handler) {
    if (isNotification) return null; // an unknown notification is simply ignored
    return frameError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
  }

  try {
    const result = await handler(msg.params);
    if (isNotification) return null; // never reply to a notification
    return frame(id, result);
  } catch (err) {
    if (isNotification) return null;
    if (err instanceof RpcError) return frameError(id, err.code, err.message);
    return frameError(id, INTERNAL_ERROR, String(err?.message ?? err));
  }
}

// Process one raw stdin line. Empty/whitespace-only lines are skipped (they are
// framing artifacts, not messages). A non-JSON line is a parse error framed with
// a null id, since the request id is unknowable. Writes responses via `write`.
async function handleLine(line, write) {
  if (line.trim() === '') return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write(frameError(null, PARSE_ERROR, 'Parse error'));
    return;
  }
  const response = await dispatch(msg);
  if (response !== null) write(response);
}

// Wire stdin -> line framing -> dispatch -> stdout. Buffers until each `\n`,
// retaining a trailing partial line across chunks. `write` appends the newline
// framing so callers pass bare JSON strings.
export function startServer({ input = process.stdin, output = process.stdout } = {}) {
  const write = (line) => output.write(line + '\n');
  let buffer = '';
  // Serialize line handling so out-of-order async dispatch can't interleave
  // writes or process a later line before an earlier one resolves.
  let chain = Promise.resolve();

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      chain = chain.then(() => handleLine(line, write));
    }
  });
  input.on('end', () => {
    // Flush any trailing line that arrived without a closing newline.
    if (buffer.length > 0) {
      const line = buffer;
      buffer = '';
      chain = chain.then(() => handleLine(line, write));
    }
  });

  return write;
}

// On startup, verify the process was launched from the repo root. submit.mjs (which
// later phases delegate to) resolves the marker/outbox against process.cwd(), so a
// wrong cwd would silently write shared state to the wrong place. Warn loudly to
// stderr — a dead server is worse than a warning, so do NOT exit.
export function assertCwd() {
  const anchor = join(process.cwd(), 'skills', 'coach-checkin', 'scripts', 'submit.mjs');
  if (!existsSync(anchor)) {
    process.stderr.write(
      `[aie-coach] WARNING: cwd ${process.cwd()} does not look like the repo root; ` +
        `marker/outbox will be written here and may not match the coach-checkin skill.\n`,
    );
  }
}

// Run only when invoked directly, not when imported by tests.
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  assertCwd();
  startServer();
}
