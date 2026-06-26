// Deterministic mechanics for the coach-checkin skill: marker state, payload
// assembly, schema validation, the opt-in consent guard, POST + one retry, and
// the local outbox fallback. The SKILL.md agent runs the conversation; this
// script owns everything that must not drift.
//
// Privacy: only volunteered answers are ever sent. Nothing is scanned off the
// machine — the agent gathers answers in conversation and passes them in.
//
//   node submit.mjs detect
//     -> stdout JSON: { phase: "pre" } | { phase: "post", participantId, role }
//
//   node submit.mjs submit         (reads JSON on stdin)
//     stdin:  { role?, answers: { <questionKey>: <answer> }, confirmed }
//     stdout: { sent, phase, participantId, outbox? } | { sent: false, reason: "unconfirmed" }

import { randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH = join(__dirname, 'feedback-contract.schema.json');
const MARKER = '.aie-coach-state.json';
const OUTBOX_DIR = '.aie-coach-outbox';

// Live board on the WorkOS Internal Cloudflare account. WORKER_URL / WORKER_TOKEN
// env vars override (the facilitator may rotate the token between dry-run and the
// real session). NOTE: this hostname is currently behind Cloudflare Access SSO —
// add a public-bypass Access app before the workshop so attendee POSTs get through.
const DEFAULT_WORKER_URL = 'https://aie-board.workos-internal.workers.dev/api/response';
const DEFAULT_WORKER_TOKEN = 'aie-5dd089340329c20856985a43';
// Cloudflare 403s missing/default bot UAs — always send an explicit one.
const USER_AGENT = 'aie-coach/1.0';
const POST_TIMEOUT_MS = 4000;

// The exact question keys the backend expects, in order, per phase.
export const QUESTION_KEYS = {
  pre: ['time_sink', 'friction', 'goal'],
  post: ['built', 'next'],
};

// Canonical prompt wording, transcribed verbatim from SKILL.md (the agent prose
// mirrors these by eye). The MCP server imports these so its surfaced questions
// can never silently drift from the skill. The parity test in submit.test.mjs
// guards that every QUESTION_KEYS entry has a non-empty prompt here.
export const QUESTION_PROMPTS = {
  time_sink: 'What dev task eats the most of your week?',
  friction: "What's the most repetitive thing you still do by hand?",
  goal: 'What would you most love to automate or speed up today?',
  built: 'What did you wire up today — a hook, a skill, a scheduled task?',
  next: 'What are you going to automate next?',
};
export const ROLE_PROMPT = "What's your role and main stack?";

const workerUrl = () => process.env.WORKER_URL || DEFAULT_WORKER_URL;
const authToken = () => process.env.WORKER_TOKEN || DEFAULT_WORKER_TOKEN;
const markerPath = () => join(process.cwd(), MARKER);
const outboxDir = () => join(process.cwd(), OUTBOX_DIR);

export function readMarker() {
  const p = markerPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    // Unparseable marker: treat as no marker. Better a fresh pre than a crash.
    return null;
  }
}

export function detect() {
  const m = readMarker();
  if (m && m.participantId) {
    return { phase: 'post', participantId: m.participantId, role: m.role };
  }
  return { phase: 'pre' };
}

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

// Turn the agent's { questionKey: answer } object into the contract's ordered
// answers array, enforcing exactly the keys this phase expects.
export function buildAnswers(phase, answers) {
  const keys = QUESTION_KEYS[phase];
  if (!keys) throw new Error(`unknown phase: ${phase}`);
  return keys.map((questionKey) => {
    const answer = answers?.[questionKey];
    if (typeof answer !== 'string' || answer.trim() === '') {
      throw new Error(`missing or empty answer for "${questionKey}" (phase ${phase})`);
    }
    return { questionKey, answer };
  });
}

export function buildPayload({ phase, participantId, role, answers }) {
  return {
    participantId,
    phase,
    role,
    answers: buildAnswers(phase, answers),
  };
}

function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

// Minimal JSON Schema validator covering exactly the keywords this contract
// uses: type, enum, const, required, properties, additionalProperties (false),
// items, allOf, and if/then. Returns an array of error strings (empty = valid).
export function validateAgainstSchema(value, schema, path = '$') {
  const errors = [];

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type) {
    const t = jsonType(value);
    const ok = schema.type === 'number' ? t === 'number' || t === 'integer' : t === schema.type;
    if (!ok) errors.push(`${path}: expected type ${schema.type}, got ${t}`);
  }

  const isObj = jsonType(value) === 'object';
  if (isObj && schema.required) {
    for (const key of schema.required) {
      if (!(key in value)) errors.push(`${path}.${key}: required property missing`);
    }
  }
  if (isObj && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in value) errors.push(...validateAgainstSchema(value[key], sub, `${path}.${key}`));
    }
  }
  if (isObj && schema.additionalProperties === false && schema.properties) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) errors.push(`${path}.${key}: additional property not allowed`);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((el, i) => errors.push(...validateAgainstSchema(el, schema.items, `${path}[${i}]`)));
  }
  if (schema.allOf) {
    for (const sub of schema.allOf) errors.push(...validateAgainstSchema(value, sub, path));
  }
  if (schema.if) {
    const matches = validateAgainstSchema(value, schema.if, path).length === 0;
    if (matches && schema.then) errors.push(...validateAgainstSchema(value, schema.then, path));
    if (!matches && schema.else) errors.push(...validateAgainstSchema(value, schema.else, path));
  }

  return errors;
}

async function postWithRetry(url, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken()}`,
    'User-Agent': USER_AGENT,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), POST_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return { ok: true, status: res.status };
      // Non-2xx: fall through to retry, then outbox.
    } catch {
      // Network error / timeout: fall through to retry, then outbox.
    }
  }
  return { ok: false };
}

function writeOutbox(payload) {
  const dir = outboxDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${payload.phase}-${payload.participantId}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

// input: { role?, answers: { <questionKey>: <answer> }, confirmed }
export async function submit(input) {
  const det = detect();
  const phase = det.phase;
  let participantId;
  let role;

  if (phase === 'pre') {
    if (!input.role || String(input.role).trim() === '') {
      throw new Error('role (job title) is required for the pre run');
    }
    participantId = randomUUID();
    role = String(input.role).trim();
  } else {
    participantId = det.participantId;
    role = det.role; // identity + role come from the marker, never stdin
  }

  const payload = buildPayload({ phase, participantId, role, answers: input.answers });

  const errors = validateAgainstSchema(payload, loadSchema());
  if (errors.length) {
    const err = new Error(`payload failed schema validation: ${errors.join('; ')}`);
    err.schemaErrors = errors;
    throw err; // loud — a code defect, never silently sent
  }

  // Consent guard: without explicit confirmation, nothing persists or leaves.
  if (input.confirmed !== true) {
    return { sent: false, reason: 'unconfirmed' };
  }

  // Write the marker before the POST so the next run is recognised as `post`
  // even when this submission falls back to the outbox.
  if (phase === 'pre') {
    writeFileSync(
      markerPath(),
      JSON.stringify({ participantId, role, preSubmittedAt: new Date().toISOString() }, null, 2),
    );
  }

  const res = await postWithRetry(workerUrl(), payload);
  if (res.ok) return { sent: true, phase, participantId };

  const outbox = writeOutbox(payload);
  return { sent: false, phase, participantId, outbox };
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'detect') {
    console.log(JSON.stringify(detect()));
    return;
  }
  if (cmd === 'submit') {
    const raw = await readStdin();
    const input = JSON.parse(raw || '{}');
    console.log(JSON.stringify(await submit(input)));
    return;
  }
  console.error(
    JSON.stringify({ status: 'error', message: `unknown command: ${cmd ?? '(none)'} (expected detect|submit)` }),
  );
  process.exit(2);
}

// Run main() only when invoked directly, not when imported by tests.
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: 'error', message: err.message, schemaErrors: err.schemaErrors }));
    process.exit(1);
  });
}
