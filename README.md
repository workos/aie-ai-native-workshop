<div align="center">

<a href="https://aie-deck.workos-internal.workers.dev"><img src="docs/images/readme-hero.png" alt="The AI-Native Engineer — Stop typing. Start operating." width="100%" /></a>

<p>
  <img alt="Hands-on · ~1 hour" src="https://img.shields.io/badge/hands--on-~1_hour-16C391?style=for-the-badge&labelColor=0d1117" />
  <img alt="Bring · laptop + Claude Code" src="https://img.shields.io/badge/bring-laptop_%2B_Claude_Code-D97757?style=for-the-badge&labelColor=0d1117&logo=anthropic&logoColor=white" />
  <img alt="Guides · Zack Proser & Nick Nisi" src="https://img.shields.io/badge/guides-Zack_Proser_%26_Nick_Nisi-30363D?style=for-the-badge&labelColor=0d1117" />
</p>

</div>

> ⚠️ **In preparation.** The [`exercises/`](exercises/) app is being finalized — the journey below is the flow you'll run on the day. Voice setup, the check-ins, and the live board are ready now.

---

## ▸ Live links

| | Resource | Open it |
|:--:|---|---|
| `▸` | **Slides** — follow along on your phone | <https://aie-deck.workos-internal.workers.dev> |
| `▸` | **Live board** — the room, in real time | <https://aie-board.workos-internal.workers.dev> |
| `▸` | **Glossary** — ask it anything | <https://aie-glossary.workos-internal.workers.dev> |

---

## `// WHAT YOU'LL DO TODAY`

### Four moves, one repo. <sup>Each builds on the last.</sup>

| | Move | The moment it clicks |
|:--:|---|---|
| `01` | **Voice coding** | Drive several agents at once. |
| `02` | **Loops & goals** | Hand off a job and walk away. |
| `03` | **Verification gates** | Trust what your agents ship. |
| `04` | **Scheduled tasks** | It runs while you sleep. |

And the whole time, a **live board** shows the room its own data — where the toil is, what to automate, and the engineering-hours a week we're about to reclaim.

---

## `// SETUP — ~5 MIN`

> ⚡ **Fast path:** open this repo in Claude Code → **trust it** → say *"set me up for the workshop."*
> Claude installs whatever's missing and checks each item.

| Tool | Why you need it |
|---|---|
| **[Claude Code](https://claude.com/claude-code)** | runs everything |
| **[Bun](https://bun.sh)** | the check-in tool + skills · blocks 1 & 4 |
| **[Codex CLI](https://github.com/openai/codex)** | the adversarial-review gate · block 3 |
| **[Handy](https://handy.computer)** | voice coding, free + local · block 1 |
| **Git** | worktrees for parallel agents · block 2 |

<details>
<summary>Prefer to install by hand?</summary>

```bash
# Bun — the check-in tool runs on it
curl -fsSL https://bun.sh/install | bash

# Codex CLI — the Block 3 adversarial-review gate
npm i -g @openai/codex && codex login

# Handy (voice) — just ask Claude in the repo:  "set up Handy for me"
# Git — check you have it:  git --version
```

Then **trust this repo in Claude Code** — that auto-loads the workshop skills and the `ideation` plugin.

</details>

---

## `// YOUR JOURNEY`

> 💬 Text in quotes like *"set up Handy"* is something you literally **say to Claude.** Go ahead — talk to it.

### `BLOCK 01` · Voice coding

- `01 ·` **Get your voice working.** Say *"Set up Handy for me."* — local, private, under 5 minutes.
- `02 ·` **Say hello to the room.** Say *"Run my workshop check-in."* — anonymous, opt-in → the live board.
- `03 ·` **Fix a bug by voice.** A seeded bug in [`exercises/`](exercises/), no keyboard.
- `04 ·` **The wow.** Three terminals, three agents, all driven by your voice.

→ [`curriculum/01-voice-coding.md`](curriculum/01-voice-coding.md)

### `BLOCK 02` · Loops & goals

- `05 ·` **"Done" is a checklist, not a vibe.** Say *"Work this issue. It's not done until every todo is checked."*
- `06 ·` **Let it run.** Say *"/loop until the test suite is green."* — with git **worktrees**, run several agents in parallel.

→ [`curriculum/02-loops-and-goals.md`](curriculum/02-loops-and-goals.md)

### `BLOCK 03` · Verification gates

- `07 ·` **The cheapest gate — a hook.** Say *"Add a hook that runs lint + typecheck + the tests on every change."*
- `08 ·` **The adversarial gate.** Say *"Fan this diff out to Codex for a review, then fix everything it found."*

→ [`curriculum/03-verification-gates.md`](curriculum/03-verification-gates.md)

### `BLOCK 04` · Scheduled tasks

- `09 ·` **Put it on a timer.** Say *"Schedule this every Monday morning…"* — the loop you ran by hand now runs itself.
- `10 ·` **Close the loop.** Say *"Run my closing check-in."* — and the big number lands: the hours/week this room just reclaimed.

→ [`curriculum/04-scheduled-tasks.md`](curriculum/04-scheduled-tasks.md)

---

## `// WHAT YOU LEAVE WITH`

- [x] Voice coding working on your machine.
- [x] A repo with **hooks and gates** wired in.
- [x] A **scheduled task** running in your own environment — not a demo, the real thing.
- [x] The full operator stack: **voice → loops & goals → gates → schedules.**
- [x] A number on the board for what that's worth to you, every week.

---

## `// PRIVACY`

The check-in only ever sends **what you type and confirm** — your role and your answers, with a random anonymous id. **Nothing is scanned off your machine** — no repos, no `git log`, no transcripts. Skip it entirely and still do every exercise.

---

<div align="center">

<sub>`●` Now stop reading and go talk to your computer. 🎙️</sub>

<sub>Running this workshop? → [`docs/facilitator.md`](docs/facilitator.md) · Deeper notes → [`curriculum/`](curriculum/) · Code → [`board/`](board/) · [`glossary/`](glossary/) · [`skills/`](skills/)</sub>

</div>
