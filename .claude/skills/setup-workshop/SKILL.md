---
name: setup-workshop
description: One-shot setup for Lifestyles of the AI-Native workshop. Installs and verifies the dev tools an attendee needs — Bun (the check-in tool), the Codex CLI (Block 3 adversarial review), and git — then confirms the repo is wired up and hands off to the opening check-in. (Voice/Handy is NOT installed here — it's the first hands-on moment of Block 1.) Triggers on "set me up for the workshop", "get me set up", "workshop setup", "set up the workshop", or starting the workshop.
---

# Set up the workshop

The fast path. This gets an attendee from a freshly-cloned repo to **ready for Block 1** in about five minutes: every tool installed, every tool verified, nothing left to discover mid-exercise. Work top to bottom; **check before installing**, install only what's missing, and **verify each item** before moving on. Report a clean checklist at the end.

> The attendee should already be running Claude Code **inside this repo** (trusting it auto-loads the workshop skills, the `ideation` plugin, and the `aie-coach` MCP server). If they're not in the repo, stop and tell them to open it and trust it first — that's step 0. Expect first-run prompts: the **trust dialog**, the **`aie-coach` MCP approval** ("Use this and all future MCP servers in this project"), and per-tool-call approvals. To run hands-off, they can relaunch with **`claude --dangerously-skip-permissions`** (fine — they trust this repo).

## Procedure

1. **Detect the platform.** Run `uname -s` (Darwin = macOS; otherwise treat as Windows/Linux). Pick the matching install commands below.

2. **Bun** — the check-in tool and skills run on it (Blocks 1 & 4).
   - Check: `bun --version`. If it prints a version, skip the install.
   - Install (macOS/Linux): `curl -fsSL https://bun.sh/install | bash`
   - Install (Windows PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"`
   - After installing, Bun is on `~/.bun/bin`; if `bun --version` still isn't found in this shell, tell the attendee to open a new terminal (or `export PATH="$HOME/.bun/bin:$PATH"`).

3. **Codex CLI** — the adversarial-review gate in Block 3.
   - Check: `codex --version`. If present, skip.
   - Install: `npm i -g @openai/codex` (needs Node/npm — check `node --version` first; if missing, point them to <https://nodejs.org>).
   - **Auth is interactive — do not run it for them.** Tell the attendee to run `codex login` themselves once (it opens a browser / prompts for an OpenAI sign-in). Note it can wait until Block 3.

4. **Voice (Handy) — not in setup.** Don't install Handy here. Getting voice working is the **first hands-on moment of Block 1** (the attendee says *"Set up Handy for me"* then, which runs the [`setup-handy`](../setup-handy/) skill). Mention it in the hand-off so they know it's coming; do not run it now.

5. **Git** — worktrees for parallel agents in Block 2.
   - Check: `git --version`. Almost always present. If missing: macOS `xcode-select --install`; Windows <https://git-scm.com>.

6. **Confirm the repo wiring — and the coach MCP.** Trusting the repo loads the `.claude/skills/` skills and the `ideation` plugin. The **`aie-coach` MCP server** (defined in `.mcp.json`) needs a **one-time approval**: on first trust Claude Code prompts to enable it — approve it, or run `/mcp` and enable `aie-coach`. It launches with `bun`, so **if you just installed Bun in this session, restart Claude Code** (or reopen the repo) so the server can start; then approve it. Without the coach MCP loaded, the AI-Native score in the check-in won't work (the plain check-in still does, via `bun skills/coach-checkin/scripts/submit.ts`). Report the coach as `[✓]` only if its tools are actually available this session; otherwise `[!]` with "approve via /mcp (restart if you just installed Bun)".

7. **Always end with the uniform status report** — print this exact block, **every run, success or failure**, so it's instantly clear what's ready and what isn't. One row per item, fixed-width name column, a status glyph, and a detail (version on success; the **reason** on failure). Then a summary line.

   Status glyphs (use exactly these):
   - `[✓]` — verified working (show the version / confirmation)
   - `[✗]` — failed (show **what failed and why**, plus the one-line fix)
   - `[!]` — needs a manual step you can't do for them (e.g. `codex login`, granting macOS Accessibility) — show the exact command/action
   - `[-]` — skipped (say why, e.g. "already installed")

   ```
   ══════════════════════════════════════════════════════════
    Lifestyles of the AI-Native · workshop setup
   ══════════════════════════════════════════════════════════
    [✓] Bun         1.3.14
    [✓] Codex CLI   0.x installed
    [!] Codex login required → run:  codex login   (before Block 3)
    [✓] Git         2.43.0
    [✓] Repo        trusted · skills + ideation + aie-coach MCP loaded
   ──────────────────────────────────────────────────────────
    READY: 3/4   ·   NEEDS YOU: Codex login   ·   FAILED: none
   ══════════════════════════════════════════════════════════
    Next: Block 1 sets up your voice — "Set up Handy for me".
   ══════════════════════════════════════════════════════════
   ```

   Rules for the report:
   - Include **every** item (Bun, Codex CLI, Git, Repo wiring) on its own row, in this order — never omit one because it failed. (Handy is not a setup item — it's a Block 1 step; only name it in the closing "Next" line.)
   - On any `[✗]`, the detail must say **why** (the actual error, trimmed) and the fix. Never report `[✓]` for something you didn't successfully verify.
   - The summary line always shows the `READY: n/total` count, plus `NEEDS YOU:` and `FAILED:` lists (write `none` when empty).

8. **Hand off to Block 1.** After the report, if Bun is `[✓]`, close with: *"You're set — say \"run my workshop check-in\" to log your starting point (and your AI-Native score) on the live board. First thing in Block 1 we'll get your voice working — \"Set up Handy for me\"."* If anything blocking failed, say which one to fix first and that the rest can wait.

## Notes

- **Install only what's missing.** Always check the version first; don't reinstall a present tool.
- **Don't run interactive logins** (`codex login`) on the attendee's behalf — surface the one command and let them do it.
- If any single tool fails, keep going with the rest and report it clearly at the end rather than aborting — a half-set-up attendee can still start Block 1 (which begins by getting voice/Handy working and otherwise needs only Bun).
- Nothing here sends anything off the machine. Tool installs are public packages; the check-in (step 8) is separately opt-in.
