# Board — live room visualization

The realtime "wow" service for *The AI-Native Engineer*. The [`coach-checkin`](../skills/coach-checkin/)
skill posts each attendee's opt-in answers here; the projector board aggregates the
room live and reveals the marquee number — **total engineering-hours/week the room
is about to reclaim.**

**Architecture:** Cloudflare Worker + D1 + (optional) AI Gateway. Two-tier AI —

- **Tier 1 (Haiku 4.5):** per-submission enrichment — role → function bucket, a punchy
  one-liner per answer, a workflow category, a 0–100 **leverage score** (manual toil →
  automated), and a concrete **hook/scheduled-task recommendation** with an hours/week
  estimate. Runs in `waitUntil` so the POST returns instantly.
- **Tier 2 (Opus 4.8):** room synthesis — emergent themes per question, a "the room is X"
  headline, and the rolled-up top automations the room should build. Regenerated **lazily
  on a throttle** (≤ 1 call / `SYNTH_MIN_INTERVAL_MS`, only when the board is polled AND new
  responses exist). No background loop — cost is bounded by construction.

The board **polls** `GET /api/board` every 2.5s and animates; the projector feels
realtime while Opus refreshes underneath. Frame rate ≠ model cadence.

> Deploys to the **WorkOS Internal** Cloudflare account. You're logged in via
> `wrangler login` (OAuth, `zack@workos.com`) — no `CLOUDFLARE_API_TOKEN` needed.
> Confirm with `npx wrangler whoami` → should show **WorkOS Internal**.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/response` | `Bearer SUBMIT_TOKEN` | `{participantId, phase:"pre"\|"post", role?, answers:[{questionKey, answer}]}` |
| GET | `/api/board` | none (CORS) | rich viz feed: `people`, `themes`, `automations`, `aggregate{…,hoursReclaimed}`, `headline` |
| GET | `/api/summary?phase=pre\|post` | none (CORS) | counts by bucket + latest one-liners + cached synthesis |
| POST | `/api/admin/seed` | `Bearer ADMIN_TOKEN` | fill a canned room for projector checks (zero AI spend) |
| POST | `/api/admin/clear` | `Bearer ADMIN_TOKEN` | wipe everything (reset between dry-run and real run) |
| GET | `/api/health` | none | `{ok, ai}` |

Pre question keys: `time_sink`, `friction`, `goal`. Post: `built`, `next`.
Function buckets: `backend`, `frontend`, `fullstack`, `infra`, `ml`, `lead`.

## First-time setup

```bash
cd board
npm install

# 1. Create the D1 database, then paste the returned database_id into wrangler.jsonc
npm run db:create                      # = npx wrangler d1 create aie-board

# 2. Apply the schema
npm run migrate:remote                 # = npx wrangler d1 migrations apply aie-board --remote

# 3. Secrets (OAuth login already handles account auth)
echo -n "<submit-token>"   | npx wrangler secret put SUBMIT_TOKEN
echo -n "<admin-token>"    | npx wrangler secret put ADMIN_TOKEN
echo -n "<anthropic-key>"  | npx wrangler secret put ANTHROPIC_API_KEY
# Optional — AI Gateway (caching/observability). Create a gateway in the CF dashboard,
# then point Anthropic calls through it:
echo -n "https://gateway.ai.cloudflare.com/v1/<acct>/<gateway>/anthropic" \
  | npx wrangler secret put AI_GATEWAY_URL

# 4. Build the frontend (board.html/js + admin + d3 → public/) and deploy
npm run deploy
```

Then set the skill's endpoint for the room:

```bash
export WORKER_URL="https://aie-board.workos-internal.workers.dev/api/response"
export WORKER_TOKEN="<submit-token>"
```

AI degrades gracefully: with no `ANTHROPIC_API_KEY`, raw answers are still stored and
the board shows trimmed raw text (no buckets/scores/automations) — the pipeline is
testable before the key is added.

## Local dev

```bash
npm run migrate:local
npm run dev                  # builds public/ then wrangler dev
# open the printed localhost URL; append ?sim to force the built-in simulator
```

## Projector check (zero AI spend)

```bash
BASE=https://aie-board.workos-internal.workers.dev
# Seed a full canned room, confirm it renders on the projector, then clear before doors open.
curl -s -X POST $BASE/api/admin/seed  -H "Authorization: Bearer <admin-token>" | jq
open "$BASE/"                         # the board
open "$BASE/admin.html"               # seed/clear buttons (token saved in localStorage)
curl -s -X POST $BASE/api/admin/clear -H "Authorization: Bearer <admin-token>" | jq
```

## Smoke test (one live submission)

```bash
BASE=https://aie-board.workos-internal.workers.dev
curl -s -X POST $BASE/api/response -H "Authorization: Bearer <submit-token>" \
  -H 'Content-Type: application/json' -H 'User-Agent: aie-coach/1.0' \
  -d '{"participantId":"demo-1","phase":"pre","role":"Backend / Go",
       "answers":[{"questionKey":"time_sink","answer":"Re-running the same test suite all day"},
                  {"questionKey":"friction","answer":"Hand-writing migration glue every time"},
                  {"questionKey":"goal","answer":"Make code review happen without me"}]}'
curl -s "$BASE/api/board" | jq
```

## Files

| Path | What |
|---|---|
| `src/index.ts` | the Worker — all `/api/*` handlers, the two-tier AI pipeline, seed/clear |
| `migrations/0001_init.sql` | D1 schema (participants · responses · synthesis) |
| `board.html` / `board.js` | the D3 projector board (beeswarm migration, dumbbells, automations, marquee) |
| `admin.html` | seed/clear buttons (Bearer token in `localStorage`) |
| `vendor/d3.min.js` | vendored D3 (no CDN; offline-safe) |
| `wrangler.jsonc` | account, D1 binding, vars, models |

`npm run build` copies `board.html → public/index.html` (+ `board.js`, `admin.html`, `d3.min.js`);
`public/` is git-ignored and regenerated on every build/deploy.
