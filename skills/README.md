# Skills

The skills that power *Lifestyles of the AI-Native* workshop. **Claude Code auto-loads
skills only from [`.claude/skills/`](../.claude/skills/)** on trust — so the loadable
`SKILL.md` files live there. This `skills/` directory holds their **supporting scripts**
(the `coach-checkin` scripts are imported by [`native/`](../native/)) and the planned
`loop-analyzer` spec. Nick Nisi's `ideation` skill installs as a plugin, and the
`aie-coach` MCP server is defined in [`../.mcp.json`](../.mcp.json) (see
[`../.claude/settings.json`](../.claude/settings.json)).

| Skill | What it does | When it fires |
|-------|--------------|---------------|
| [`setup-workshop`](../.claude/skills/setup-workshop/) | The fast path: installs + verifies **everything** an attendee needs (Bun, Codex CLI, Handy, git), confirms the repo is wired, and hands off to the opening check-in. | "set me up for the workshop" / "workshop setup" / start of workshop |
| [`setup-handy`](../.claude/skills/setup-handy/) | Installs **Handy** (free, local, push-to-talk voice dictation) and proves it works in under 5 minutes. The on-ramp to voice coding. | "set up Handy" / "set up voice coding" / start of workshop |
| [`coach-checkin`](../.claude/skills/coach-checkin/) | The opt-in, anonymous check-in + **AI-Native score** — run once walking in, once at the close. Feeds the [live room board](../board/). Scripts in [`coach-checkin/scripts/`](coach-checkin/). **Volunteered answers + a locally-computed score; raw machine data never leaves.** | "check in" / "workshop check-in" / "run my workshop check-in" |
| [`loop-analyzer`](loop-analyzer/) *(planned, spec only)* | The **personal** half of the coach: a fully-local skill an attendee builds to analyze their *own* agent usage and surface the hooks / scheduled tasks that'd buy back the most time. **Reads local data, never transmits.** | "analyze my loop" / "what hooks should I build" / before Blocks 3–4 |
| `ideation` *(plugin)* | Nick Nisi's interview-to-95%-confidence skill — clarity before tokens burn. Auto-installs from [`nicknisi/ideation`](https://github.com/nicknisi/ideation). | "ideate" / before a big build |

## Structure

```text
.claude/skills/<name>/SKILL.md   # the loadable skill — Claude Code auto-loads these on trust
skills/<name>/scripts/           # supporting scripts (kept here; coach-checkin's are imported by native/)
```

## Two artifacts, two data rules

The coach and the analyzer pull in opposite directions on purpose — and the seam
between them is the workshop's privacy story:

- **The coach** (`coach-checkin`, and the MCP coach in [`native/src/coach/`](../native/src/coach/))
  **transmits** — it posts to the live board — so it is **volunteered-only**: nothing
  scanned, only what was typed and confirmed.
- **The [`loop-analyzer`](loop-analyzer/)** **reads local data** (your own
  transcripts / repos) but **never transmits** — so it stays on your machine.

The rule is about *data leaving the machine*, not what a local tool may read. See
[`loop-analyzer/README.md`](loop-analyzer/README.md) for the full boundary.

## The coach, long-term

`coach-checkin` is the skill-based version of the workshop coach — runnable today
with nothing but Bun and the repo. It graduates into a small **MCP server**
(in [`native/src/coach/`](../native/src/coach/), booted via `bun native/src/cli.ts --mcp`)
that lives in the participant's Claude session as an interactive guide: it
congratulates, advances them step to step, and runs the same opt-in interview
through the question tool. Same privacy rule, richer experience. It's registered for
this repo in [`../.mcp.json`](../.mcp.json) as the `aie-coach` MCP server — approve it
once when Claude Code prompts on first trust (or run `/mcp`). It needs **Bun** on PATH,
so if you just installed Bun, restart Claude Code so it can launch.
