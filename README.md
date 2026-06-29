<div align="center">

<a href="https://aie-deck.workos-internal.workers.dev"><img src="docs/images/readme-hero.png" alt="Lifestyles of the AI-Native — voice-coding, agent skills, hooks, scheduled tasks. Level up your AI-Native score, 19 → 82." width="100%" /></a>

<p>
  <img alt="Hands-on · ~1 hour" src="https://img.shields.io/badge/hands--on-~1_hour-16C391?style=for-the-badge&labelColor=0d1117" />
  <img alt="Bring · laptop + Claude Code" src="https://img.shields.io/badge/bring-laptop_%2B_Claude_Code-D97757?style=for-the-badge&labelColor=0d1117&logo=anthropic&logoColor=white" />
  <img alt="Guides · Zack Proser & Nick Nisi" src="https://img.shields.io/badge/guides-Zack_Proser_%26_Nick_Nisi-30363D?style=for-the-badge&labelColor=0d1117" />
</p>

### ▸ Open these now

**[🖥&#65039; Slides](https://aie-deck.workos-internal.workers.dev)** &nbsp;·&nbsp; **[📊 Live board](https://aie-board.workos-internal.workers.dev)** &nbsp;·&nbsp; **[📖 Glossary — ask it anything](https://aie-glossary.workos-internal.workers.dev)**

</div>

---

<img src="docs/images/sec-what-you-do.png" alt="What you'll do today — four moves, one repo: voice coding, loops & goals, verification gates, scheduled tasks. Each builds on the last." width="100%" />

<p align="center"><sub>Your check-ins light up the <b><a href="https://aie-board.workos-internal.workers.dev">live board</a></b> — where the room's toil is, the hooks &amp; scheduled tasks worth building, and the engineering-hours a week we're about to reclaim.</sub></p>

---

<img src="docs/images/sec-setup.png" alt="Setup, ~5 min — fast path: open the repo in Claude Code, trust it, say 'set me up for the workshop'. Tools: Claude Code, Bun, Codex CLI, Handy, Git." width="100%" />

<p align="center">
  <b>Get each tool →</b>
  <a href="https://claude.com/claude-code">Claude Code</a> &nbsp;·&nbsp;
  <a href="https://bun.sh">Bun</a> &nbsp;·&nbsp;
  <a href="https://github.com/openai/codex">Codex CLI</a> &nbsp;·&nbsp;
  <a href="https://handy.computer">Handy</a>
  &nbsp; — or just say <b><em>"set me up for the workshop"</em></b> and Claude installs what's missing.
</p>

<details>
<summary><b>Prefer to install by hand?</b></summary>

```bash
# Bun — the check-in tool + skills run on it (blocks 1 & 4)
curl -fsSL https://bun.sh/install | bash

# Codex CLI — the Block 3 adversarial-review gate
npm i -g @openai/codex && codex login

# Handy (voice) — just ask Claude in the repo:  "set up Handy for me"
# Git — check you have it:  git --version
```

Then **trust this repo in Claude Code** — that auto-loads the workshop skills, the `ideation` plugin, and the coach.

</details>

> 🔐 **First-run prompts (expect these once).** When you start Claude Code here you'll: **(1)** accept the **workspace trust** dialog (so the repo's skills/permissions load), **(2)** approve the **`aie-coach` MCP server** — choose *"Use this and all future MCP servers in this project"* — and **(3)** approve tool calls as they come. Want to skip the clicking? You trust this repo, so just launch with **`claude --dangerously-skip-permissions`** and it runs hands-off. *(If you just installed Bun, quit and re-run `claude` once so the coach can launch.)*

---

<img src="docs/images/sec-journey.png" alt="Your journey — Block 01 Voice coding, Block 02 Loops & goals, Block 03 Verification gates, Block 04 Scheduled tasks, each with the exact prompts to say to Claude." width="100%" />

<p align="center">
  <b>Deeper notes →</b>
  <a href="curriculum/01-voice-coding.md">Block 1 · Voice</a> &nbsp;·&nbsp;
  <a href="curriculum/02-loops-and-goals.md">Block 2 · Loops &amp; goals</a> &nbsp;·&nbsp;
  <a href="curriculum/03-verification-gates.md">Block 3 · Gates</a> &nbsp;·&nbsp;
  <a href="curriculum/04-scheduled-tasks.md">Block 4 · Schedules</a>
</p>

> 🛠️ **The hands-on runs on a repo you bring** — a side project or work repo (no good one handy? clone any small project you like). The patterns apply to any stack; today's repo is just the launchpad.

---

## 🤖 Meet your coach — the room is the content

An **opt-in** coach rides along in your terminal. It runs a short [**check-in**](skills/coach-checkin/) and reads your **AI-Native score** — once walking in, once at the close — so the [**live board**](https://aie-board.workos-internal.workers.dev) shows your *before → after* alongside the whole room's. It's for fun, and it quietly powers the data viz.

> 🔒 **Privacy.** The score comes from a **local** scan of your *own* Claude setup (hooks? a `CLAUDE.md`? worktrees? scheduled jobs?). Only the score **numbers** and the answers you **confirm** ever leave your machine — never your files, `git log`, or transcripts. Skip it entirely and still do every block.

---

<img src="docs/images/sec-leave-with.png" alt="What you leave with — voice coding working, a repo with hooks and gates, a scheduled task running, the full stack, and a number on the board." width="100%" />

---

<div align="center">

<sub><code>●</code>&nbsp; Now stop reading and go talk to your computer. &nbsp;🎙&#65039;</sub>

<sub>
  <a href="https://aie-deck.workos-internal.workers.dev">Slides</a> ·
  <a href="https://aie-board.workos-internal.workers.dev">Board</a> ·
  <a href="https://aie-glossary.workos-internal.workers.dev">Glossary</a> &nbsp;|&nbsp;
  <a href="curriculum/">Curriculum</a> ·
  <a href="skills/">Skills</a> ·
  <a href="board/">Board code</a> ·
  <a href="glossary/">Glossary code</a> &nbsp;|&nbsp;
  Running this workshop? → <a href="docs/facilitator.md">Facilitator guide</a>
</sub>

</div>
