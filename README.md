<div align="center">

# 🎙️ The AI-Native Engineer

### Stop typing. Start operating.

<p>
  <img alt="Event" src="https://img.shields.io/badge/AI_Engineer-San_Francisco-111827?style=for-the-badge" />
  <img alt="Format" src="https://img.shields.io/badge/hands--on-~1_hour-16C391?style=for-the-badge" />
  <img alt="You'll need" src="https://img.shields.io/badge/bring-a_laptop_%2B_Claude_Code-D97757?style=for-the-badge&logo=anthropic&logoColor=white" />
</p>

**Welcome!** 👋 In the next hour you'll go from *typing code* to *operating a fleet of agents* —
by voice, on a schedule, with guardrails you trust. You'll build on this repo, and you'll
leave with it **running by itself**.

<sub>Your guides: <strong>Zack Proser</strong> · <strong>Nick Nisi</strong></sub>

<br/>

### 🔗 Live links

**📊 Live board → https://aie-board.workos-internal.workers.dev**
&nbsp;·&nbsp;
**🖥️ Slides → https://aie-deck.workos-internal.workers.dev**

</div>

---

> 🚧 **In preparation.** This is the attendee guide for the live workshop. The hands-on
> [`exercises/`](exercises/) app (the repo you'll fix bugs in and work checklist issues on)
> is still being finalized — the steps below describe the flow you'll follow on the day.
> Everything else (voice setup, the check-ins, the live board) is ready now.

---

## ✨ What you'll actually do today

Four moves, each building on the last — all on this one repo:

| | Move | The moment it clicks |
|:--:|------|----------------------|
| 🎙️ | **Voice coding** | Hands off the keyboard — talk at 180 wpm and drive *several* agents at once. |
| 🔁 | **Loops & goals** | Hand off a multi-step job and walk away. "Done" becomes a checklist, not a hope. |
| 🛡️ | **Verification gates** | Wrap your agents in hooks + reviews so you *trust* what they ship. |
| ⏰ | **Scheduled tasks** | Put the work on a timer. It runs every Monday — while you sleep. |

And the whole time, a **live board** on the projector shows the room its own data — where the
toil is, what to automate, and how many hours/week we're all about to reclaim. 📈

---

## 🧰 Before you start (2 minutes)

You'll need just three things:

1. **A laptop** (macOS or Windows) 💻
2. **[Claude Code](https://claude.com/claude-code)** installed and signed in
3. **[Node.js](https://nodejs.org)** (v18+) — check with `node --version`

Then, **open this repo in Claude Code and trust it.** That one step auto-loads the workshop
skills and the `ideation` plugin — no manual setup. ✅

> 💬 Throughout this guide, text in quotes like *"set up Handy"* is something you literally
> **say or type to Claude**. Go ahead — talk to it.

---

## 🚀 Your journey, step by step

### 🎙️ Block 1 — Voice coding

**Step 1 · Get your voice working.** Say to Claude:

> *"Set up Handy for me."*

[Handy](https://handy.computer) is **free, local, and private** (nothing leaves your machine).
Claude walks you through install, a quick model download, mic permission, and your push-to-talk
hotkey — **under 5 minutes.** Stuck on permissions? That's almost always macOS *Accessibility* —
ask Claude. ⏱️

**Step 2 · Say hello to the room.** Run your opening check-in:

> *"Run my workshop check-in."*

It asks a few quick questions — your role, your biggest time-sink, what you'd love to automate —
and (only with your OK) posts them **anonymously** to the live board. Watch the room's toil light
up on the projector. 🔦

**Step 3 · Fix a bug — by voice.** Pick a seeded bug in [`exercises/`](exercises/) and fix it
without touching the keyboard. Feel how fast *intent → change* is when you just talk.

**Step 4 · The wow — many agents at once.** 🤯 Open three terminal tabs and, by voice, start
three things together:

- 🛠️ Tab A: a bigger refactor
- 🐛 Tab B: a second fix
- ✍️ Tab C: something that isn't even code (draft a short post about the fix)

Keep talking — kick off the next one while the last is still working. **Your voice just removed
the bottleneck.**

→ *More depth: [`curriculum/01-voice-coding.md`](curriculum/01-voice-coding.md)*

---

### 🔁 Block 2 — Loops & goals

**Step 5 · "Done" is a checklist, not a vibe.** Open an issue in [`exercises/`](exercises/) —
its description is a list of checkboxes. Tell Claude:

> *"Work this issue. It's not done until every todo is checked off."*

Watch it decompose the work and hold *itself* to the list. 📋

**Step 6 · Let it run with `/loop`.** Some work is recurring or unknown-size. Try:

> *"`/loop` until the test suite is green."*

Quick rule of thumb:
- 🎯 **Goal / checklist** → one bounded job with known steps.
- ♾️ **Loop** → keep going until a condition is met.

They compose — and with **git worktrees**, you can run several agents in parallel without them
colliding.

→ *More depth: [`curriculum/02-loops-and-goals.md`](curriculum/02-loops-and-goals.md)*

---

### 🛡️ Block 3 — Verification gates

**Step 7 · The cheapest gate — a hook.** Ask Claude:

> *"Add a hook that runs lint + typecheck + the tests on every change, and fix anything it flags."*

Now the agent **can't** hand you code that doesn't build. The gate fails it; it fixes itself. 🟢

**Step 8 · The adversarial gate — a second opinion.** On anything risky, fan out to the Codex CLI
for an independent review and fix what it finds:

> *"Fan this diff out to Codex for an adversarial review, then fix everything it found."*

Two models disagreeing and reconciling catches what one model alone talks itself past.

> 🧭 **The operator's definition of done:** the *gates* pass — not "the model sounds confident."

→ *More depth: [`curriculum/03-verification-gates.md`](curriculum/03-verification-gates.md)*

---

### ⏰ Block 4 — Scheduled tasks

**Step 9 · Put it on a timer.** Take the work you just did — fixed, gated, written up — and
schedule it:

> *"Schedule this every Monday morning: pull the latest, fix the top lint issues, run the gates,
> and draft a short post about what changed."*

The loop you ran by hand now **runs itself.** That schedule is yours to keep. 🗓️

**Step 10 · Close the loop.** Run your closing check-in:

> *"Run my closing check-in."*

It asks what you wired up and what you'll automate next. Watch the board's dots **migrate from
toil to leverage** — and the big number land: *the engineering-hours/week this room just
reclaimed.* 🎉

→ *More depth: [`curriculum/04-scheduled-tasks.md`](curriculum/04-scheduled-tasks.md)*

---

## 🎁 What you leave with

- ✅ **Voice coding** set up and working on your machine.
- ✅ A repo with **hooks and gates** wired in.
- ✅ A **scheduled task** running in your own environment — not a demo, the real thing.
- ✅ The full operator stack, assembled once, end to end: **voice → loops & goals → gates → schedules.**
- ✅ A number on the board for what that's worth to you, every week.

---

## 🔒 Your privacy

The check-in only ever sends **what you type and confirm** — your role and your answers, with a
random anonymous id. **Nothing is scanned off your machine** — no repos, no `git log`, no
transcripts. Ever. You can skip it entirely and still do every exercise.

---

## 🗺️ Where to look

| If you want… | Go to |
|--------------|-------|
| Deeper notes on each block | [`curriculum/`](curriculum/) |
| The skills you're using | [`skills/`](skills/) — [`setup-handy`](skills/setup-handy/), [`coach-checkin`](skills/coach-checkin/) |
| The live board's code | [`board/`](board/) |
| The exercises | [`exercises/`](exercises/) |
| To run this workshop yourself | [`docs/facilitator.md`](docs/facilitator.md) |

---

<div align="center">
<sub>Now stop reading and go talk to your computer. 🎙️🔥</sub>
</div>
