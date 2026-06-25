# mcp-coach *(planned — Nick)*

The workshop coach as a small **MCP server** that lives inside each attendee's Claude
session. It's the richer evolution of the [`coach-checkin`](../skills/coach-checkin/)
skill: instead of a script they invoke, it's an interactive guide that travels with
them through the whole workshop.

> **Status: not built yet.** The runnable coach today is the `coach-checkin` skill.
> This directory is the spec for the MCP version so it can be picked up cleanly.

## What it does

- **Guides step-to-step.** Knows the four blocks (voice → loops & goals → verification
  gates → scheduled tasks); congratulates on completion and advances to the next step.
- **Runs the check-in through the question tool.** Same opt-in interview, same two phases
  (opening / closing), same anonymous participant id — but conversational, in-session.
- **Posts to the same board.** Identical wire contract as the skill
  ([`../skills/coach-checkin/CONTRACT.md`](../skills/coach-checkin/CONTRACT.md)) →
  `POST /api/response` on the [board](../board/). One backend, two clients.

## Hard rule: volunteered data only

The coach **never scans the machine.** No reading repos, `git log`, file trees, or
Claude transcripts and shipping them anywhere. It asks good questions and sends only
what the participant typed and confirmed. This is the design's non-negotiable line
(see [`../docs/design.md`](../docs/design.md)).

## Shape (proposed)

- A stdio MCP server (Bun or Node) exposing tools like `coach_next_step`,
  `coach_run_checkin`, `coach_status`.
- Installs via the repo's [`../.claude/settings.json`](../.claude/settings.json) once built
  (add an `mcpServers` entry pointing here).
- Reuses `coach-checkin`'s marker/outbox + schema so offline behavior is identical.

## Companion: button-based installer *(also Nick)*

A one-command Bun CLI that sets the attendee up end-to-end (Handy → skills → coach →
green checks) so the first five minutes are frictionless on any machine.
