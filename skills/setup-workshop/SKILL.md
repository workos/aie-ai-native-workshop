---
name: setup-workshop
description: One-shot setup for The AI-Native Engineer workshop. Installs and verifies everything an attendee needs for the full hour — Bun (the check-in tool), the Codex CLI (Block 3 adversarial review), Handy (Block 1 voice), and git — then confirms the repo is wired up and hands off to the opening check-in. Triggers on "set me up for the workshop", "get me set up", "workshop setup", "set up the workshop", or starting the workshop.
---

# Set up the workshop

The fast path. This gets an attendee from a freshly-cloned repo to **ready for Block 1** in about five minutes: every tool installed, every tool verified, nothing left to discover mid-exercise. Work top to bottom; **check before installing**, install only what's missing, and **verify each item** before moving on. Report a clean checklist at the end.

> The attendee should already be running Claude Code **inside this repo** (trusting it auto-loads the workshop skills, the `ideation` plugin, and the `aie-coach` MCP server). If they're not in the repo, stop and tell them to open it and trust it first — that's step 0.

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

4. **Handy** — free, local voice dictation for Block 1.
   - Run the **[`setup-handy`](../setup-handy/)** flow: install, download a local model, grant mic + Accessibility permission, set a push-to-talk hotkey, and confirm a live dictation test. (Don't duplicate it here — follow that skill.)

5. **Git** — worktrees for parallel agents in Block 2.
   - Check: `git --version`. Almost always present. If missing: macOS `xcode-select --install`; Windows <https://git-scm.com>.

6. **Confirm the repo wiring.** The attendee is in the repo and has trusted it, so the workshop skills, the `ideation` plugin, and the `aie-coach` MCP coach are loaded. A quick sanity check: the `setup-handy` and `coach-checkin` skills should be available, and `bun ${CLAUDE_PROJECT_DIR}/native/src/cli.ts --version` should run. If the coach MCP isn't loaded, tell them to re-trust the repo or restart Claude Code.

7. **Report a checklist** — one line per item, with the verified version or status:

   ```
   ✓ Bun         1.x
   ✓ Codex CLI   installed  (run `codex login` before Block 3)
   ✓ Handy       installed + hotkey set
   ✓ Git         2.x
   ✓ Repo        trusted — skills + ideation + aie-coach MCP loaded
   ```

8. **Hand off to Block 1.** Close with: *"You're set. Kick off the workshop with — say: \"run my workshop check-in\" — to log your starting point (and your AI-Native score) on the live board."*

## Notes

- **Install only what's missing.** Always check the version first; don't reinstall a present tool.
- **Don't run interactive logins** (`codex login`) on the attendee's behalf — surface the one command and let them do it.
- If any single tool fails, keep going with the rest and report it clearly at the end rather than aborting — a half-set-up attendee can still start Block 1 (which only needs Bun + Handy).
- Nothing here sends anything off the machine. Tool installs are public packages; the check-in (step 8) is separately opt-in.
