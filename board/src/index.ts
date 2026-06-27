/**
 * aie-board — live room board for "The AI-Native Engineer" workshop (AIE SF).
 *
 * The realtime "wow" service. The coach check-in skill interviews each attendee
 * (opt-in, volunteered data only — nothing is ever scanned off their machine) and
 * POSTs their answers here. The projector board aggregates the room live: where the
 * toil is, which hooks and scheduled tasks the room should build, and — the marquee
 * number — the total engineering-hours/week the room is about to reclaim.
 *
 * Pipeline:
 *   POST /api/response   → write raw rows instantly (nothing lost), return 200 fast,
 *                          then enrich async with Haiku (role→bucket, one-liners,
 *                          a 0-100 leverage score, and a concrete hook/schedule
 *                          recommendation with an hours/week estimate).
 *   GET  /api/summary    → counts + latest one-liners + cached Opus synthesis.
 *   GET  /api/board      → the rich viz feed (pre→post migration + automations).
 *   POST /api/admin/clear → wipe everything (reset between dry-run and the real run).
 *   POST /api/admin/seed  → fill a canned room for projector checks, zero AI spend.
 *
 * Cost guard: the Opus synthesis is gated to at most one call per SYNTH_MIN_INTERVAL_MS,
 * only when the board is being polled AND new responses exist since the last synthesis.
 * No background loop — bounded by construction.
 */

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SUBMIT_TOKEN: string;
  ADMIN_TOKEN: string;
  ANTHROPIC_API_KEY?: string;
  AI_GATEWAY_URL?: string;
  CF_AIG_TOKEN?: string; // cf-aig-authorization — set when the AI Gateway is "authenticated" / BYOK (key stored in the gateway)
  ALLOWED_ORIGIN: string;
  SYNTH_MIN_INTERVAL_MS: string;
  ENRICH_MODEL: string;
  SYNTH_MODEL: string;
}

// Developer-function buckets — 6 high-contrast groups (projector-friendly).
// Slugs are CSS/JSON-safe; labels are for display.
const BUCKETS = ["backend", "frontend", "fullstack", "infra", "ml", "lead"] as const;
type Bucket = (typeof BUCKETS)[number];
const BUCKET_LABELS: Record<Bucket, string> = {
  backend: "Backend",
  frontend: "Frontend",
  fullstack: "Full-stack",
  infra: "Infra / Platform",
  ml: "ML / Data",
  lead: "Lead / Architect",
};

const PHASES = ["pre", "post"] as const;
type Phase = (typeof PHASES)[number];

const LATEST_LIMIT = 24; // how many recent one-liner cards the board shows

// ── HTTP plumbing ───────────────────────────────────────────────────────────

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function now(): number {
  return Date.now();
}

// AI is on with either a direct Anthropic key, or an authenticated/BYOK AI Gateway
// (key stored in the gateway, called with cf-aig-authorization).
function aiEnabled(env: Env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || (env.AI_GATEWAY_URL && env.CF_AIG_TOKEN));
}

// ── Worker entrypoint ─────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    // Everything that isn't an /api/* call is the static board frontend.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(req);
    }
    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, ai: aiEnabled(env) }, env);
      }
      if (url.pathname === "/api/response" && req.method === "POST") {
        return await handleResponse(req, env, ctx);
      }
      if (url.pathname === "/api/summary" && req.method === "GET") {
        return await handleSummary(req, env, ctx);
      }
      if (url.pathname === "/api/board" && req.method === "GET") {
        return await handleBoard(req, env, ctx);
      }
      if (url.pathname === "/api/admin/clear" && req.method === "POST") {
        return await handleClear(req, env);
      }
      if (url.pathname === "/api/admin/seed" && req.method === "POST") {
        return await handleSeed(req, env);
      }
      return json({ error: "not_found" }, env, 404);
    } catch (err) {
      console.error("unhandled", err);
      return json({ error: "internal", message: String(err) }, env, 500);
    }
  },
};

// ── POST /api/response ─────────────────────────────────────────────────────────

interface IncomingAnswer {
  questionKey: string;
  answer: string;
}
interface IncomingAiNativeScore {
  before?: number;
  after?: number;
  delta?: number;
  pillarsPassed?: string[];
}
interface IncomingBody {
  participantId?: string;
  phase?: string;
  role?: string;
  answers?: IncomingAnswer[];
  aiNativeScore?: IncomingAiNativeScore;
}

async function handleResponse(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (bearer(req) !== env.SUBMIT_TOKEN) return json({ error: "unauthorized" }, env, 401);

  const body = (await req.json().catch(() => null)) as IncomingBody | null;
  if (!body) return json({ error: "bad_json" }, env, 400);

  const answers = (body.answers || []).filter(
    (a) => a && typeof a.questionKey === "string" && typeof a.answer === "string" && a.answer.trim(),
  );
  // Sanitize the opt-in score up front so we know whether this is a score post.
  const aiNativeScore = sanitizeAiNativeScore(body.aiNativeScore);
  // A post must carry SOMETHING: answers, or a volunteered score. (Score posts
  // legitimately have no answers.)
  if (!answers.length && !aiNativeScore) return json({ error: "no_answers" }, env, 400);

  // Phase is only meaningful for an answers post. A score-only post carries no
  // phase, so the bad_phase guard applies only when answers are present (the
  // existing answers path is unchanged: it still requires a valid phase).
  const phase = body.phase as Phase;
  if (answers.length && !PHASES.includes(phase)) return json({ error: "bad_phase" }, env, 400);

  const participantId = (body.participantId || crypto.randomUUID()).slice(0, 64);
  const role = body.role?.slice(0, 240) ?? null;
  const ts = now();

  // Upsert participant (preserve an existing bucket; refresh role if provided).
  await env.DB.prepare(
    `INSERT INTO participants (id, role_raw, bucket, created_at)
     VALUES (?1, ?2, NULL, ?3)
     ON CONFLICT(id) DO UPDATE SET role_raw = COALESCE(?2, participants.role_raw)`,
  )
    .bind(participantId, role, ts)
    .run();

  // Persist the opt-in AI-Native score when present — but only with a real
  // before->after pair (sanitizeAiNativeScore already guaranteed both; this
  // mirrors the coach-side "no phantom baseline" rule). DISTINCT from
  // responses.score (the AI-derived per-answer leverage).
  if (aiNativeScore) {
    await env.DB.prepare(
      `UPDATE participants
          SET ai_native_before = ?2, ai_native_after = ?3, ai_native_delta = ?4,
              pillars_passed = ?5, scored_at = ?6
        WHERE id = ?1`,
    )
      .bind(
        participantId,
        aiNativeScore.before,
        aiNativeScore.after,
        aiNativeScore.delta,
        aiNativeScore.pillarsPassed ? JSON.stringify(aiNativeScore.pillarsPassed) : null,
        ts,
      )
      .run();
  }

  // Insert raw rows immediately so nothing is ever lost if AI is slow/down.
  // A score-only post has no answers — skip the responses write + enrichment.
  if (answers.length) {
    const inserts = answers.map((a) =>
      env.DB.prepare(
        `INSERT INTO responses
          (id, participant_id, phase, question_key, answer_raw, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(crypto.randomUUID(), participantId, phase, a.questionKey.slice(0, 64), a.answer.slice(0, 2000), ts),
    );
    await env.DB.batch(inserts);

    // Enrich out-of-band — the POST returns now.
    ctx.waitUntil(enrich(env, participantId, role, phase, answers, ts));
  }

  return json({ ok: true, participantId }, env);
}

// Validate + clamp the opt-in AI-Native score. Returns null unless BOTH before and
// after are finite (no phantom baseline). delta is recomputed server-side.
function sanitizeAiNativeScore(s: IncomingBody["aiNativeScore"]): {
  before: number; after: number; delta: number; pillarsPassed: string[] | null;
} | null {
  if (!s || typeof s !== "object") return null;
  const clamp = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  const before = clamp(s.before);
  const after = clamp(s.after);
  if (before == null || after == null) return null;
  const pillars = Array.isArray(s.pillarsPassed)
    ? s.pillarsPassed.filter((p) => typeof p === "string" && p).slice(0, 5)
    : null;
  return { before, after, delta: after - before, pillarsPassed: pillars?.length ? pillars : null };
}

// ── Tier 1: Haiku per-submission enrichment ───────────────────────────────────

async function enrich(
  env: Env,
  participantId: string,
  role: string | null,
  phase: Phase,
  answers: IncomingAnswer[],
  ts: number,
): Promise<void> {
  if (!aiEnabled(env)) return; // graceful: raw rows already stored

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      bucket: { type: "string", enum: [...BUCKETS] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionKey: { type: "string" },
            summary: { type: "string" }, // punchy one-liner for the projector
            category: { type: "string" }, // short workflow-area tag
            score: { type: "integer" }, // 0=all manual toil … 100=fully automated
            suggestionType: { type: "string", enum: ["hook", "schedule", "none"] },
            suggestionTitle: { type: "string" }, // the concrete automation to build
            estHours: { type: "number" }, // est hours/week the suggestion reclaims
          },
          required: ["questionKey", "summary", "category", "score", "suggestionType", "suggestionTitle", "estHours"],
        },
      },
    },
    required: ["bucket", "items"],
  };

  const payload = {
    role: role || "(not given)",
    phase,
    answers: answers.map((a) => ({ questionKey: a.questionKey, answer: a.answer })),
  };

  const system =
    "You normalize developer-workflow interview answers for a live, projector-displayed room board " +
    "at an AI-native engineering workshop. " +
    "Classify the attendee into exactly one function bucket from their role/stack: " +
    "'backend' (server, APIs, services, databases); 'frontend' (web/UI, mobile, design-eng); " +
    "'fullstack' (both ends); 'infra' (devops, platform, SRE, build/release, security); " +
    "'ml' (ML/AI, data engineering, data science); 'lead' (EM, staff/principal, architect, founder). " +
    "If ambiguous, infer from the answers. " +
    "For EACH answer: write a vivid one-liner (max ~10 words, their voice, no preamble); " +
    "a 1-2 word workflow category tag (e.g. tests, reviews, deploys, docs, boilerplate, debugging, triage); " +
    "a 'score' 0-100 measuring how AUTOMATED that part of their workflow currently is " +
    "(0-30 = all manual toil, 40-60 = some scripts/aliases, 70-100 = real agents/hooks/schedules already running); " +
    "and a concrete automation recommendation they could build today in Claude Code: " +
    "suggestionType 'hook' (fires on an event — every edit, pre-commit, on stop) or " +
    "'schedule' (runs on a cron — nightly, every Monday) or 'none' if the answer isn't actionable; " +
    "suggestionTitle = a specific, buildable title (e.g. 'lint + typecheck hook on every edit', " +
    "'nightly dependency-bump + test scheduled task'); and estHours = a realistic hours/week reclaimed (0 if none). " +
    "Score the WORKFLOW, not how positive the words sound. Keep questionKey identical to the input.";

  const out = await callClaude<{
    bucket: Bucket;
    items: {
      questionKey: string;
      summary: string;
      category: string;
      score: number;
      suggestionType: "hook" | "schedule" | "none";
      suggestionTitle: string;
      estHours: number;
    }[];
  }>(env, {
    model: env.ENRICH_MODEL,
    maxTokens: 900,
    system,
    user: JSON.stringify(payload),
    schema,
  });
  if (!out) return;

  const stmts: D1PreparedStatement[] = [];
  if (out.bucket && BUCKETS.includes(out.bucket)) {
    stmts.push(env.DB.prepare(`UPDATE participants SET bucket = ?1 WHERE id = ?2`).bind(out.bucket, participantId));
  }
  for (const item of out.items || []) {
    const s = typeof item.score === "number" ? Math.max(0, Math.min(100, Math.round(item.score))) : null;
    const type = item.suggestionType === "hook" || item.suggestionType === "schedule" ? item.suggestionType : null;
    const hours = type && typeof item.estHours === "number" ? Math.max(0, Math.min(80, item.estHours)) : null;
    stmts.push(
      env.DB.prepare(
        `UPDATE responses
            SET answer_summary = ?1, category = ?2, score = ?3,
                suggestion_type = ?4, suggestion_title = ?5, est_hours = ?6, enriched_at = ?7
          WHERE participant_id = ?8 AND phase = ?9 AND question_key = ?10 AND created_at = ?11`,
      ).bind(
        item.summary?.slice(0, 240) ?? null,
        item.category?.slice(0, 64) ?? null,
        s,
        type,
        type ? item.suggestionTitle?.slice(0, 200) ?? null : null,
        hours,
        now(),
        participantId,
        phase,
        item.questionKey.slice(0, 64),
        ts,
      ),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ── GET /api/summary ───────────────────────────────────────────────────────────

async function handleSummary(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const phase = (url.searchParams.get("phase") as Phase) || "post";
  if (!PHASES.includes(phase)) return json({ error: "bad_phase" }, env, 400);

  // Counts by bucket (participants who have at least one response in this phase).
  const bucketRows = await env.DB.prepare(
    `SELECT COALESCE(p.bucket, 'unsorted') AS bucket, COUNT(DISTINCT p.id) AS n
       FROM participants p
       JOIN responses r ON r.participant_id = p.id AND r.phase = ?1
      GROUP BY COALESCE(p.bucket, 'unsorted')`,
  )
    .bind(phase)
    .all<{ bucket: string; n: number }>();

  const byBucket: Record<string, number> = {};
  let participants = 0;
  for (const row of bucketRows.results ?? []) {
    byBucket[row.bucket] = row.n;
    participants += row.n;
  }

  // Latest one-liner cards (fall back to a trimmed raw answer until enriched).
  const latest = await env.DB.prepare(
    `SELECT r.question_key AS questionKey,
            COALESCE(r.answer_summary, substr(r.answer_raw, 1, 120)) AS text,
            r.category AS category,
            r.suggestion_type AS suggestionType,
            r.suggestion_title AS suggestionTitle,
            r.est_hours AS estHours,
            COALESCE(p.bucket, 'unsorted') AS bucket,
            r.created_at AS createdAt,
            (r.answer_summary IS NOT NULL) AS enriched
       FROM responses r
       JOIN participants p ON p.id = r.participant_id
      WHERE r.phase = ?1
      ORDER BY r.created_at DESC
      LIMIT ?2`,
  )
    .bind(phase, LATEST_LIMIT)
    .all();

  const synthRow = await env.DB.prepare(`SELECT generated_at, payload_json FROM synthesis WHERE phase = ?1`)
    .bind(phase)
    .first<{ generated_at: number; payload_json: string }>();

  // Lazily refresh the Opus synthesis (throttled + gated) without blocking the response.
  ctx.waitUntil(maybeSynthesize(env, phase));

  return json(
    {
      phase,
      participants,
      byBucket,
      bucketLabels: BUCKET_LABELS,
      latest: latest.results ?? [],
      synthesis: synthRow ? { generatedAt: synthRow.generated_at, ...JSON.parse(synthRow.payload_json) } : null,
      serverTime: now(),
    },
    env,
  );
}

// ── Tier 2: Opus room synthesis (throttled, lazy) ──────────────────────────────

async function maybeSynthesize(env: Env, phase: Phase): Promise<void> {
  if (!aiEnabled(env)) return;

  const minInterval = parseInt(env.SYNTH_MIN_INTERVAL_MS || "12000", 10);
  const existing = await env.DB.prepare(`SELECT generated_at FROM synthesis WHERE phase = ?1`)
    .bind(phase)
    .first<{ generated_at: number }>();
  const last = existing?.generated_at ?? 0;
  if (now() - last < minInterval) return; // hard cost floor — at most one call / interval

  const fresh = await env.DB.prepare(`SELECT COUNT(*) AS n FROM responses WHERE phase = ?1 AND created_at > ?2`)
    .bind(phase, last)
    .first<{ n: number }>();
  if (!fresh || fresh.n === 0) return; // nothing new → don't spend

  const rows = await env.DB.prepare(
    `SELECT r.question_key AS questionKey,
            COALESCE(r.answer_summary, r.answer_raw) AS text,
            r.category AS category,
            r.suggestion_type AS suggestionType,
            r.suggestion_title AS suggestionTitle,
            r.est_hours AS estHours,
            COALESCE(p.bucket, 'unsorted') AS bucket
       FROM responses r
       JOIN participants p ON p.id = r.participant_id
      WHERE r.phase = ?1
      ORDER BY r.created_at ASC`,
  )
    .bind(phase)
    .all<{
      questionKey: string;
      text: string;
      category: string | null;
      suggestionType: string | null;
      suggestionTitle: string | null;
      estHours: number | null;
      bucket: string;
    }>();

  const answers = rows.results ?? [];
  if (!answers.length) return;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" }, // one short "the room is X" line
      themes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionKey: { type: "string" },
            label: { type: "string" },
            count: { type: "integer" },
            sampleQuote: { type: "string" },
          },
          required: ["questionKey", "label", "count", "sampleQuote"],
        },
      },
      automations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["hook", "schedule"] },
            title: { type: "string" },
            count: { type: "integer" }, // how many people this helps
            hoursPerWeek: { type: "number" }, // total hours/week reclaimed across the room
          },
          required: ["type", "title", "count", "hoursPerWeek"],
        },
      },
    },
    required: ["headline", "themes", "automations"],
  };

  const system =
    "You synthesize live developer-workflow feedback into a single beautiful summary shown on a projector " +
    "at an AI-native engineering workshop. Be sharp, specific, and quotable — this is the closing 'wow'. " +
    "PRE questions: 'time_sink' (the task that eats their week), 'friction' (most repetitive manual thing), " +
    "'goal' (what they most want to automate). " +
    "POST questions: 'built' (what they wired up today), 'next' (what they'll automate next). " +
    "Cluster answers into a few emergent themes per question with a count and one real sample quote; " +
    "keep each theme label to 2-4 words. " +
    "From the per-answer suggestions, roll up the highest-leverage automations the ROOM should build — " +
    "merge near-duplicates, sum their hoursPerWeek and count the people each helps; favor hooks and scheduled " +
    "tasks that recur. Return the top 4-6 automations sorted by total hoursPerWeek. " +
    "Write a SHORT headline — at most 8 words — capturing the room (e.g. 'The room is drowning in code review'). " +
    "Keep every string punchy and presentation-ready.";

  const out = await callClaude<unknown>(env, {
    model: env.SYNTH_MODEL,
    maxTokens: 1800,
    effort: "low", // fast + cheap for live regen; structured output keeps it tight
    system,
    user: JSON.stringify({ phase, answers }),
    schema,
  });
  if (!out) return;

  await env.DB.prepare(
    `INSERT INTO synthesis (phase, generated_at, payload_json) VALUES (?1, ?2, ?3)
     ON CONFLICT(phase) DO UPDATE SET generated_at = ?2, payload_json = ?3`,
  )
    .bind(phase, now(), JSON.stringify(out))
    .run();
}

// ── GET /api/board — rich viz feed (toil→leverage migration + automations) ─────

// Emits the board's documented contract:
//   { headline, aggregate{pre,post,delta,voices,hoursReclaimed},
//     people[{id,fn,pre,post,preQ,postQ}],
//     themes[{id,question,label,count,quote}],
//     automations[{type,title,count,hours}] }
const Q_OF: Record<string, string> = {
  time_sink: "timesink",
  friction: "friction",
  goal: "goal",
  built: "built",
  next: "next",
};

async function handleBoard(_req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // All scored answers, with verbatim text — so we can average the leverage score and
  // surface the most-toil (pre) / most-automated (post) line per person.
  const rows = await env.DB.prepare(
    `SELECT r.participant_id AS id, COALESCE(p.bucket,'unsorted') AS bucket,
            r.phase AS phase, r.score AS s, r.answer_raw AS raw
       FROM responses r
       JOIN participants p ON p.id = r.participant_id
      WHERE r.score IS NOT NULL`,
  ).all<{ id: string; bucket: string; phase: string; s: number; raw: string }>();

  type Agg = { bucket: string; pre: number[]; post: number[]; preQ: string; preS: number; postQ: string; postS: number };
  const agg: Record<string, Agg> = {};
  for (const r of rows.results ?? []) {
    const a = (agg[r.id] = agg[r.id] || { bucket: r.bucket, pre: [], post: [], preQ: "", preS: Infinity, postQ: "", postS: -Infinity });
    a.bucket = r.bucket;
    if (r.phase === "pre") {
      a.pre.push(r.s);
      if (r.s <= a.preS) { a.preS = r.s; a.preQ = r.raw; } // most-toil line
    } else if (r.phase === "post") {
      a.post.push(r.s);
      if (r.s >= a.postS) { a.postS = r.s; a.postQ = r.raw; } // most-automated line
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

  const people = Object.entries(agg).map(([id, a]) => {
    const pre = mean(a.pre), post = mean(a.post);
    return {
      id,
      fn: a.bucket === "unsorted" ? "backend" : a.bucket,
      pre: pre == null ? 0 : Math.round(pre),
      post: post == null ? 0 : Math.round(post),
      preQ: a.preQ,
      postQ: a.postQ,
    };
  });

  const preMeans: number[] = [], postMeans: number[] = [];
  for (const a of Object.values(agg)) {
    const pm = mean(a.pre), qm = mean(a.post);
    if (pm != null) preMeans.push(pm);
    if (qm != null) postMeans.push(qm);
  }
  const avgPre = mean(preMeans), avgPost = mean(postMeans);

  // Marquee number: total est hours/week reclaimed across enriched answers.
  const hoursRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(est_hours), 0) AS total FROM responses WHERE est_hours IS NOT NULL`,
  ).first<{ total: number }>();
  const hoursReclaimed = Math.round(hoursRow?.total ?? 0);

  const synthRow = await env.DB.prepare(`SELECT payload_json FROM synthesis WHERE phase = 'post'`).first<{ payload_json: string }>();
  const synth = synthRow
    ? (JSON.parse(synthRow.payload_json) as {
        headline?: string;
        themes?: { questionKey: string; label: string; count: number; sampleQuote: string }[];
        automations?: { type: string; title: string; count: number; hoursPerWeek: number }[];
      })
    : null;
  const themes = (synth?.themes ?? []).map((t, i) => ({
    id: `t${i}`,
    question: Q_OF[t.questionKey] || t.questionKey,
    label: t.label,
    count: t.count,
    quote: t.sampleQuote,
  }));
  const automations = (synth?.automations ?? []).map((a, i) => ({
    id: `a${i}`,
    type: a.type,
    title: a.title,
    count: a.count,
    hours: Math.round(a.hoursPerWeek),
  }));

  ctx.waitUntil(maybeSynthesize(env, "post"));

  return json(
    {
      headline: synth?.headline ?? null,
      aggregate: {
        pre: avgPre == null ? 0 : Math.round(avgPre),
        post: avgPost == null ? 0 : Math.round(avgPost),
        delta: avgPre != null && avgPost != null ? Math.round(avgPost - avgPre) : 0,
        voices: people.length,
        hoursReclaimed,
      },
      people,
      themes,
      automations,
      serverTime: now(),
    },
    env,
  );
}

// ── POST /api/admin/clear ──────────────────────────────────────────────────────

async function handleClear(req: Request, env: Env): Promise<Response> {
  if (bearer(req) !== env.ADMIN_TOKEN) return json({ error: "unauthorized" }, env, 401);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM responses`),
    env.DB.prepare(`DELETE FROM participants`),
    env.DB.prepare(`DELETE FROM synthesis`),
  ]);
  return json({ ok: true, cleared: true }, env);
}

// ── POST /api/admin/seed — fill the room instantly, zero AI calls ──────────────
// A canned, deterministic room for dry-runs and projector checks. Inserts pre-scored
// rows + a pre-written synthesis in one batch, so /api/board is fully populated with
// no Anthropic spend. The real workshop uses live POSTs from the coach check-in skill.
const SEED_DIST: [Bucket, number][] = [
  ["backend", 6],
  ["frontend", 4],
  ["fullstack", 5],
  ["infra", 4],
  ["ml", 3],
  ["lead", 4],
];
// [pre toil line, post automated line, est hours/week reclaimed]
const SEED_LINES: Record<Bucket, [string, string, number][]> = {
  backend: [
    ["I hand-run the same test suite all day.", "A hook runs tests on every edit now.", 4],
    ["Every PR review is a manual slog.", "Codex fans out an adversarial review for me.", 3],
    ["I keep regenerating boilerplate by hand.", "A skill scaffolds the service for me.", 5],
  ],
  frontend: [
    ["I eyeball accessibility on every component.", "A hook lints a11y on save.", 3],
    ["Storybook stories rot constantly.", "A scheduled task regenerates them nightly.", 2],
    ["I copy-paste the same component shell.", "A skill stamps it out in seconds.", 4],
  ],
  fullstack: [
    ["Context-switching kills my whole afternoon.", "I drive three agents at once by voice now.", 6],
    ["I write the same migration glue every time.", "A skill writes the migration + rollback.", 4],
  ],
  infra: [
    ["Dependency bumps pile up for weeks.", "A Monday scheduled task bumps + tests them.", 5],
    ["I babysit every deploy by hand.", "A hook gates deploys on a green check.", 4],
    ["Incident write-ups eat my Fridays.", "A skill drafts the postmortem from logs.", 3],
  ],
  ml: [
    ["I re-run eval notebooks manually.", "A nightly scheduled task runs the evals.", 5],
    ["Data validation is all by hand.", "A hook validates schemas on every commit.", 4],
  ],
  lead: [
    ["Standup prep eats an hour every morning.", "A scheduled task drafts my standup.", 4],
    ["I review every PR title and label by hand.", "A hook auto-labels and checks PRs.", 3],
    ["Weekly status reports drain me.", "A Monday scheduled task assembles it.", 5],
  ],
};
const SEED_SYNTH = {
  headline: "The room is drowning in toil",
  themes: [
    { questionKey: "time_sink", label: "Manual test runs", count: 7, sampleQuote: "I hand-run the same test suite all day." },
    { questionKey: "time_sink", label: "PR review slog", count: 6, sampleQuote: "Every PR review is a manual slog." },
    { questionKey: "friction", label: "Boilerplate by hand", count: 6, sampleQuote: "I keep regenerating the same boilerplate." },
    { questionKey: "friction", label: "Dependency bumps", count: 4, sampleQuote: "Dependency bumps pile up for weeks." },
    { questionKey: "goal", label: "Automate reviews", count: 8, sampleQuote: "I want reviews to happen without me." },
    { questionKey: "goal", label: "Reclaim mornings", count: 5, sampleQuote: "Standup + status prep eats my mornings." },
  ],
  automations: [
    { type: "hook", title: "lint + typecheck + tests on every edit", count: 14, hoursPerWeek: 48 },
    { type: "hook", title: "adversarial codex review on risky changes", count: 11, hoursPerWeek: 33 },
    { type: "schedule", title: "Monday dependency-bump + test run", count: 9, hoursPerWeek: 27 },
    { type: "schedule", title: "nightly eval / story / report regen", count: 8, hoursPerWeek: 24 },
    { type: "hook", title: "green-check gate before deploy", count: 6, hoursPerWeek: 18 },
  ],
};

async function handleSeed(req: Request, env: Env): Promise<Response> {
  if (bearer(req) !== env.ADMIN_TOKEN) return json({ error: "unauthorized" }, env, 401);
  const ts = now();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM responses`),
    env.DB.prepare(`DELETE FROM participants`),
    env.DB.prepare(`DELETE FROM synthesis`),
  ];
  let idx = 0;
  for (const [bucket, count] of SEED_DIST) {
    for (let i = 0; i < count; i++) {
      const pid = `sim-${bucket}-${i}`;
      const [preLine, postLine, hours] = SEED_LINES[bucket][i % SEED_LINES[bucket].length];
      const preS = 8 + ((idx * 7) % 24); // 8..31 (mostly manual toil)
      const postS = 72 + ((idx * 5) % 22); // 72..93 (automated)
      idx++;
      stmts.push(env.DB.prepare(`INSERT INTO participants (id, role_raw, bucket, created_at) VALUES (?1,?2,?3,?4)`).bind(pid, bucket, bucket, ts));
      stmts.push(
        env.DB.prepare(
          `INSERT INTO responses (id, participant_id, phase, question_key, answer_raw, score, est_hours, enriched_at, created_at)
           VALUES (?1,?2,'pre','time_sink',?3,?4,NULL,?5,?5)`,
        ).bind(crypto.randomUUID(), pid, preLine, preS, ts),
      );
      stmts.push(
        env.DB.prepare(
          `INSERT INTO responses (id, participant_id, phase, question_key, answer_raw, score, est_hours, suggestion_type, suggestion_title, enriched_at, created_at)
           VALUES (?1,?2,'post','built',?3,?4,?5,'hook',?6,?7,?7)`,
        ).bind(crypto.randomUUID(), pid, postLine, postS, hours, postLine, ts),
      );
    }
  }
  stmts.push(env.DB.prepare(`INSERT INTO synthesis (phase, generated_at, payload_json) VALUES ('post',?1,?2)`).bind(ts, JSON.stringify(SEED_SYNTH)));
  await env.DB.batch(stmts);
  return json({ ok: true, seeded: idx }, env);
}

// ── Anthropic call helper (via AI Gateway when configured) ─────────────────────

interface ClaudeOpts {
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  schema: unknown;
  effort?: "low" | "medium" | "high";
}

async function callClaude<T>(env: Env, opts: ClaudeOpts): Promise<T | null> {
  const base = env.AI_GATEWAY_URL?.replace(/\/$/, "") || "https://api.anthropic.com";
  const endpoint = `${base}/v1/messages`;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  };
  if (opts.effort) body.output_config = { ...(body.output_config as object), effort: opts.effort };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  // Direct key (if present) — works both direct and through the gateway.
  if (env.ANTHROPIC_API_KEY) headers["x-api-key"] = env.ANTHROPIC_API_KEY;
  // Authenticated / BYOK AI Gateway: CF injects the stored provider key, so no
  // x-api-key is needed — we just authenticate to the gateway itself.
  if (env.AI_GATEWAY_URL && env.CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000); // never hang waitUntil
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("claude_http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text;
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("claude_err", String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
