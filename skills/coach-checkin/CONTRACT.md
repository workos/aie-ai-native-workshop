# Coach Check-in — Worker Contract

The wire contract between the `coach-checkin` skill (client) and the `aie-board`
Worker (server). The **binding structural definition** is
[`scripts/feedback-contract.schema.json`](scripts/feedback-contract.schema.json);
this document adds the parts a schema can't carry (endpoint, auth, headers,
question keys, server behavior). The Worker is the source of truth for all of it.

## Endpoint

```text
POST https://aie-board.workos-internal.workers.dev/api/response
```

Live board: `https://aie-board.workos-internal.workers.dev/`

The client reads `WORKER_URL` from its environment, falling back to the
`DEFAULT_WORKER_URL` constant in `scripts/submit.ts`. **Set both `WORKER_URL`
and `WORKER_TOKEN` once the board is deployed** (the placeholders ship unset).

## Headers

| Header          | Value                                  | Notes                                                              |
| --------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `Authorization` | `Bearer <SUBMIT_TOKEN>`                | Shared workshop token. Override via `WORKER_TOKEN`.               |
| `Content-Type`  | `application/json`                     |                                                                   |
| `User-Agent`    | `aie-coach/1.0`                        | **Required** — Cloudflare 403s missing/default bot UAs.           |

## Request body

Conforms to `feedback-contract.schema.json`. Example (pre phase):

```json
{
  "participantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "phase": "pre",
  "role": "Backend / Go",
  "answers": [
    { "questionKey": "time_sink", "answer": "Re-running the same test suite all day." },
    { "questionKey": "friction", "answer": "Hand-writing migration + rollback glue every time." },
    { "questionKey": "goal", "answer": "Make code review happen without me babysitting it." }
  ]
}
```

### Fields

| Field           | Type   | Notes                                                                          |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `participantId` | string | Anonymous UUID v4, generated once on the pre run, reused on post.              |
| `phase`         | string | `"pre"` or `"post"`.                                                           |
| `role`          | string | Free-text role/stack. Sent on **pre** only; the backend classifies it.         |
| `answers`       | array  | One `{ questionKey, answer }` object per question for the phase.               |

### Question keys (exact strings)

- `phase: "pre"` → `time_sink`, `friction`, `goal`
- `phase: "post"` → `built`, `next`

### Function buckets

`role` is sent as the raw role/stack; the **backend** classifies it into one of:
`backend`, `frontend`, `fullstack`, `infra`, `ml`, `lead`. The client does not bucket.

## Identity and linking

`participantId` is generated once (pre) and reused on post, so a participant's
pre and post responses share an id — that's what draws the toil→leverage movement
on the board. No name, email, repo, or transcript is ever sent — volunteered
answers only.

## Server behavior

- One `POST` per phase (all that phase's answers in the `answers` array).
- Returns `{ "ok": true, "participantId": "..." }` on success.
- The client treats any non-2xx (or a network failure) as "not stored" and saves
  the payload to a local outbox (`.aie-coach-outbox/`) for later re-send, so a
  success response must mean the response was durably recorded.
