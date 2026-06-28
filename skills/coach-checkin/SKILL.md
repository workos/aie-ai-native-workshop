---
name: coach-checkin
description: Run the opt-in AI-Native Engineer workshop check-in interview. Use at the start of the workshop and again at the close to share an anonymous pulse on your workflow. Auto-detects whether this is the opening or closing check-in, then posts your answers (anonymously) to the live room board. Triggers on "check in", "coach check-in", "workshop check-in", "start/closing interview", or "share my workflow".
---

# Coach Check-in

A short, **opt-in** workflow interview for *The AI-Native Engineer* workshop. You run it twice — once walking in, once at the close — and your answers feed the live room board: where the room's toil is, which hooks and scheduled tasks to build, and the total engineering-hours/week the room is about to reclaim.

**Privacy is the whole point.** Nothing is ever scanned off your machine. Only the answers you type and explicitly confirm are sent. Responses are anonymous: a random participant id plus your role/stack (used only to group by function) — no name, no email, no repo, no transcripts.

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

5. **Report the result** plainly from the command's JSON output:
   - `{"sent":true,...}` → "Sent — thanks, your pulse is on the board."
   - `{"sent":false,"outbox":"..."}` → "Saved locally (the board was unreachable) — a facilitator can flush it later." Your pre/post state is still recorded.

## Notes

- All commands run from the workshop repo root; the marker (`.aie-coach-state.json`) and any outbox files land there.
- The board URL and auth token are baked into `scripts/submit.ts`; set the `WORKER_URL` / `WORKER_TOKEN` environment variables to override them (the facilitator sets these once the board is deployed).
- The payload contract is defined in `scripts/feedback-contract.schema.json` and described in [`CONTRACT.md`](CONTRACT.md).
- Never collect or send anything the participant didn't type and confirm. No file scans, no `git log`, no transcript reads — volunteered answers only.
