# Facilitator guide

Everything the people *running* the workshop need. Attendees never read this —
their guide is the top-level [`README.md`](../README.md). This covers the deck, the
board, the run of show, and the day-of checklist.

## The assets

| Asset | Where | Notes |
|-------|-------|-------|
| Live board | https://aie-board.workos-internal.workers.dev | Cloudflare Worker + D1 + two-tier AI. Runbook: [`../board/README.md`](../board/README.md) |
| Board admin | `…/admin.html` | Paste the ADMIN token once (stored in `localStorage`); seed / clear buttons |
| Slide deck | https://aie-deck.workos-internal.workers.dev | Animated HTML; arrow keys / space to advance; `#14` deep-links. Runbook: [`../slides/README.md`](../slides/README.md) |
| Glossary + chat | https://aie-glossary.workos-internal.workers.dev | Cloudflare-native (Vite+React+Worker); chat on `claude-haiku-4-5`, needs `ANTHROPIC_API_KEY`. Code: [`../glossary/`](../glossary/) |
| Exercise repo | [`../exercises/`](../exercises/) | The repo attendees build on (fork target) |

> Both Workers live on the **WorkOS Internal** Cloudflare account and sit behind
> Cloudflare Access SSO by default. Each has a **bypass-everyone** Access app so
> attendees can reach them without a login; the board's `/api/*` routes are still
> gated by bearer tokens in the Worker itself.

## Run of show (~1 hour, hands-on)

Full detail in [`run-of-show.md`](run-of-show.md). The spine:

| Offset | Block | Board moment |
|--------|-------|--------------|
| 0:00 | Open — the pitch in one breath | — |
| 0:05 | **Voice coding** — Handy → fix-by-voice → **opening check-in** → many agents | Room's toil lights up |
| 0:25 | **Loops & goals** — checklists + `/loop`, parallel worktrees | — |
| 0:40 | **Verification gates** — lint/typecheck/test hook + adversarial Codex review | — |
| 0:52 | **Scheduled tasks** — schedule the work → **closing check-in** | Toil → leverage; hours-reclaimed reveal |
| 1:00 | Close — hand off the repo + the scheduled task | The before→after is the finale |

One presenter drives the **same** repo end-to-end so the recording is one clean
journey. A floater (if staffed) unsticks the room and narrates the "manage a fleet"
moment in Block 1. Solo fallback: the presenter does a 3-tab version themselves.

## Stand up the board

Full runbook (D1 create, migrations, secrets, deploy) is in
[`../board/README.md`](../board/README.md). Day-of, you mainly need:

```bash
# Point the check-in skill at the board for the room (the skill defaults work too):
export WORKER_URL="https://aie-board.workos-internal.workers.dev/api/response"
export WORKER_TOKEN="<submit-token>"

# Projector check with canned data (zero AI spend), then reset before doors open:
BASE=https://aie-board.workos-internal.workers.dev
curl -s -X POST $BASE/api/admin/seed  -H "Authorization: Bearer <admin-token>" | jq
curl -s -X POST $BASE/api/admin/clear -H "Authorization: Bearer <admin-token>" | jq
```

The board keyboard controls (for the projector): `←/→` or `Space` toggle phase,
`A` auto-rotates spotlights, `F`/`E` fill/empty the room for rehearsal (these pause
live polling so a preview isn't overwritten — reload for live).

## AI pipeline (optional but recommended)

The board stores raw answers and renders fine **without** AI. To light up the
Haiku/Opus enrichment (leverage scores, per-answer automations, room synthesis),
wire the AI Gateway BYOK on WorkOS Internal:

```bash
cd board
echo -n "https://gateway.ai.cloudflare.com/v1/7e7fcec4d315661895440b439328033d/<gateway>/anthropic" \
  | npx wrangler secret put AI_GATEWAY_URL
echo -n "<gateway-token>" | npx wrangler secret put CF_AIG_TOKEN   # if the gateway is authenticated/BYOK
npx wrangler deploy
# Confirm: curl -s $BASE/api/health  → {"ok":true,"ai":true}
```

(Alternatively set a direct `ANTHROPIC_API_KEY` secret instead of the gateway.)

## Day-of checklist

- [ ] Board reachable (not behind a login): `curl -s $BASE/api/health` → `{"ok":true,...}`.
- [ ] `/api/health` shows `"ai":true` if you want live enrichment (else it degrades gracefully).
- [ ] Seed → eyeball the projector → **clear** so the room starts empty.
- [ ] Deck loads on the projector; advance with arrow keys; QR codes point to repo + board.
- [ ] Exercise repo checked out with seeded checklist issues.
- [ ] Handy install path confirmed on one macOS **and** one Windows machine.
- [ ] `WORKER_URL` / `WORKER_TOKEN` exported (or the skill defaults are correct).

## After the workshop

See [`../post-workshop/follow-up.md`](../post-workshop/follow-up.md) — the follow-up
check-in, the workshop RAG endpoint, and keeping the repo runnable cold weeks later.
Reset the board between the dry-run and the real session with `POST /api/admin/clear`.
