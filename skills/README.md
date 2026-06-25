# Skills

The skills that power *The AI-Native Engineer* workshop. Each is a folder with a
`SKILL.md` (frontmatter `name` + `description`, then instructions) plus any
supporting scripts. Trusting the repo loads them; Nick Nisi's `ideation` skill
installs as a plugin (see [`../.claude/settings.json`](../.claude/settings.json)).

| Skill | What it does | When it fires |
|-------|--------------|---------------|
| [`setup-handy`](setup-handy/) | Installs **Handy** (free, local, push-to-talk voice dictation) and proves it works in under 5 minutes. The on-ramp to voice coding. | "set up Handy" / "set up voice coding" / start of workshop |
| [`coach-checkin`](coach-checkin/) | The opt-in, anonymous workflow interview — run once walking in, once at the close. Feeds the [live room board](../board/). **Volunteered answers only; nothing is scanned off the machine.** | "check in" / "workshop check-in" / "share my workflow" |
| `ideation` *(plugin)* | Nick Nisi's interview-to-95%-confidence skill — clarity before tokens burn. Auto-installs from [`nicknisi/ideation`](https://github.com/nicknisi/ideation). | "ideate" / before a big build |

## Structure

```text
skills/<name>/
  SKILL.md            # required: frontmatter (name, description) + instructions
  scripts/            # optional supporting scripts (e.g. coach-checkin/scripts/submit.mjs)
```

## The coach, long-term

`coach-checkin` is the skill-based version of the workshop coach — runnable today
with nothing but Node and the repo. The roadmap is to graduate it into a small
**MCP server** (`mcp-coach/`) that lives in the participant's Claude session as an
interactive guide: it congratulates, advances them step to step, and runs the same
opt-in interview through the question tool. Same privacy rule, richer experience.
See [`../mcp-coach/README.md`](../mcp-coach/README.md).
