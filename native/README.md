# The coach — an MCP server (`aie-coach`)

The workshop coach is a **local MCP server** that runs inside the attendee's Claude
Code session. It's not a chatbot or a cloud service — it's a stdio MCP server Claude
calls as tools. Nick Nisi's Bun + TypeScript engine.

## Where it lives & how it boots

| | |
|---|---|
| **Code** | [`native/src/coach/`](src/coach/) — `server.ts` (the MCP tool surface), `engine.ts` (scan→score→gate logic), `state.ts` (the marker), `blocks.ts` (the four-block map) + tests. Scoring in [`../native/src/scan.ts`](src/scan.ts) · [`score.ts`](src/score.ts) · [`pillars.ts`](src/pillars.ts). |
| **Boots via** | `bun native/src/cli.ts --mcp` |
| **Registered as** | `aie-coach` in [`../.mcp.json`](../.mcp.json) — loaded when you trust the repo and approve it once (or `/mcp`). Needs **Bun** on PATH. |
| **Wraps** | the check-in scripts in [`../skills/coach-checkin/scripts/submit.ts`](../skills/coach-checkin/) (same consent gate, marker, outbox). |

## What it does — the tools

It exposes **7 active tools**. The two navigation tools are **dormant** on purpose
(the coach is *ambient* — it interviews and scores you; it does **not** drive you
block to block).

| Tool | What it does | Input |
|------|--------------|-------|
| `coach_checkin` | Returns the ordered check-in questions for your current phase (pre/post). | — |
| `coach_submit_checkin` | Submits your confirmed check-in answers to the board. Consent-gated — never sends without `confirmed:true`. | `{ role?, answers, confirmed }` |
| `coach_scan` | Scans your **local** AI-native setup and returns the report: signals, per-pillar scores, total, recommendations, observed waste. First call stores your **opening baseline**. | — |
| `coach_next` | Returns the single next thing to act on: the weakest pillar below the bar, its action, its sub-score. | — |
| `coach_gate` | Re-scans and decides whether a pillar is *actually* present on disk. Advances only if the fresh scan sees it — **can't be faked by a flag.** | `{ pillar }` |
| `coach_card` | Renders the self-contained **before/after AI-Native card** (HTML) from your opening scan + a fresh scan. | `{ name? }` |
| `coach_submit_score` | Opt-in: POSTs your **before→after AI-Native score** to the board. Consent-gated; sends the score the coach computed, never raw signals. | `{ confirmed, name? }` |

**Dormant (built + tested, not exposed):** `coach_status`, `coach_checkpoint` — block
navigation. Off by design; the coach rides along, it doesn't run the workshop for you.

## The AI-Native score

`coach_scan` reads five pillars from your local Claude setup and weights them to a
0–100 total ([`pillars.ts`](src/pillars.ts)):

| Pillar | Weight | Signal (on disk) |
|--------|:--:|---|
| **Verify** | 0.22 | lint/typecheck/test **hooks** in your settings |
| **Automate** | 0.22 | scheduled jobs *(recommend-only — Claude schedules leave no local marker, so this stays 0; the scheduling payoff shows on the board's hours/automations)* |
| **Context** | 0.20 | a `CLAUDE.md`, your **skills**, your MCP servers |
| **Orchestrate** | 0.18 | git **worktrees** |
| **Delegate** | 0.18 | a reusable **Task / subagent** pattern |

## In the workshop

1. **Opening (Block 1):** `coach_submit_checkin` (pre) mints your anonymous id, then `coach_scan` records your starting score.
2. **Closing:** `coach_submit_checkin` (post), then `coach_submit_score` sends your **before→after** to the [board](../board/).

Attendees never call these by name — the [`coach-checkin`](../.claude/skills/coach-checkin/)
skill does, when you say *"run my workshop check-in."*

## Privacy

The scan runs **locally**. Only the **derived score numbers** and the **answers you
confirm** leave your machine — never your files, `git log`, or transcripts. Everything
is consent-gated (`confirmed:true`) with a local outbox fallback if the board is down.
