---
name: coach-checkin
description: Run the opt-in AI-Native Engineer workshop check-in. Use at the start of the workshop and again at the close. Auto-detects opening vs closing, runs the short interview, records your AI-Native score from a LOCAL scan at the open, and at the close posts your answers and your before→after score (anonymously) to the live room board. Triggers on "check in", "coach check-in", "workshop check-in", "run my workshop check-in", "closing check-in", or "share my workflow".
---

# Coach Check-in

A short, **opt-in** check-in for *The AI-Native Engineer* workshop. You run it twice — once walking in, once at the close. Each run does two things: a quick **interview** (what's eating your week → what you built) and an **AI-Native score** read from your local setup. Together they feed the live room board: where the room's toil is, which hooks and scheduled tasks to build, the engineering-hours/week the room reclaims, and the room's **before→after AI-Native score**.

**Privacy is the whole point.** The score is computed by a **local** scan of your Claude setup (do you have hooks? a CLAUDE.md? worktrees? scheduled jobs?) that **never leaves your machine** — only the derived score *numbers* and the answers you explicitly confirm are sent. No file contents, no `git log`, no transcripts are ever transmitted. Responses are anonymous: a random participant id plus your role/stack — no name, no email.

## How it works

The skill auto-detects which check-in to run using a marker file (`.aie-coach-state.json`) in the repo root: no marker means this is the **opening** (`pre`) check-in; an existing marker means the **closing** (`post`) check-in. The same anonymous participant id is reused across both runs so the board can connect your before and after. All file state, payload assembly, and network I/O live in `scripts/submit.ts` — do not write the marker, build the JSON, or POST by hand.

**Run every command from the workshop repo root** (so the marker is written there, where detection looks for it).

## Procedure

1. **Detect the phase.** Run:

   ```bash
   bun skills/coach-checkin/scripts/submit.ts detect
   ```

   Read the `phase` field from its JSON output (`"pre"` or `"post"`).

2. **Run the matching interview** (fixed prompts; ask **one** brief follow-up only if an answer is empty or evasive):

   - **If `phase` is `pre`:**
     1. Ask their **role / stack** as free text (e.g. "What's your role and main stack?"). This is the `role` field — send it verbatim; the board classifies it.
     2. Ask: "What dev task eats the most of your week?" → `time_sink`.
     3. Ask: "What's the most repetitive thing you still do by hand?" → `friction`.
     4. Ask: "What would you most love to automate or speed up today?" → `goal`.
   - **If `phase` is `post`:** (the role is already known — do **not** ask again)
     1. Ask: "What did you wire up today — a hook, a skill, a scheduled task?" → `built`.
     2. Ask: "What are you going to automate next?" → `next`.

3. **Show an editable summary.** Display the role (pre only) and each answer back to the participant, then ask with `AskUserQuestion`: **Send**, **Edit**, or **Cancel**.
   - **Edit:** revise the named answer and re-show the summary.
   - **Cancel:** stop. Nothing is written or sent.

4. **Send on confirmation.** Pipe the collected data as JSON to the submit command. The `answers` object is keyed by the exact question keys above. Include `role` only for the pre run.

   ```bash
   echo '{"role":"Backend / Go","answers":{"time_sink":"...","friction":"...","goal":"..."},"confirmed":true}' \
     | bun skills/coach-checkin/scripts/submit.ts submit
   ```

   For the post run, omit `role` (it comes from the marker):

   ```bash
   echo '{"answers":{"built":"...","next":"..."},"confirmed":true}' \
     | bun skills/coach-checkin/scripts/submit.ts submit
   ```

5. **Record / send the AI-Native score** using the `aie-coach` MCP tools (loaded when the repo is trusted). The score is read from a local scan — see the privacy note above.
   - **Opening (`pre`):** after the answers are sent, call the **`coach_scan`** tool (no args). This records the opening baseline. Tell the participant their starting score out of 100 and the weakest pillar, framed as an invitation: *"That's your starting line — pick one of these to actually try today."*
   - **Closing (`post`):** after the answers are sent, confirm consent (the same Send confirmation covers it) and call **`coach_submit_score`** with `{ "confirmed": true }`. This sends the **before→after** to the board. Report the delta: *"You went from X → Y — that's now on the board."*
     - If it returns `{"sent":false,"reason":"no_baseline"}`, the opening scan never ran — call `coach_scan` once, then retry `coach_submit_score`.

6. **Report the result** plainly from the command's JSON output:
   - `{"sent":true,...}` → "Sent — thanks, your pulse is on the board."
   - `{"sent":false,"outbox":"..."}` → "Saved locally (the board was unreachable) — a facilitator can flush it later." Your pre/post state is still recorded.

## Notes

- All commands run from the workshop repo root; the marker (`.aie-coach-state.json`) and any outbox files land there.
- The board URL and auth token are baked into `scripts/submit.ts`; set the `WORKER_URL` / `WORKER_TOKEN` environment variables to override them (the facilitator sets these once the board is deployed).
- The scripts live in the repo's `skills/coach-checkin/` (this `SKILL.md` lives in `.claude/skills/` so Claude Code auto-loads it; commands run from the repo root, so the `bun skills/coach-checkin/...` paths resolve). The payload contract is in `skills/coach-checkin/scripts/feedback-contract.schema.json`, described in [`CONTRACT.md`](../../../skills/coach-checkin/CONTRACT.md).
- Never **send** anything the participant didn't confirm. The AI-Native score is read by a **local** scan (`coach_scan`) of their Claude setup, but only the derived score numbers leave the machine — never file contents, `git log`, or transcripts. Interview answers are volunteered-only.
