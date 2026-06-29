---
name: setup-handy
description: Install and configure Handy, the free, local, open-source push-to-talk voice dictation app, so the user can voice-code in any terminal. Use when someone wants to set up voice input / dictation / "talk to Claude", asks to "set up Handy" or "set up voice coding", or is starting the Lifestyles of the AI-Native workshop. Detects macOS vs. Windows and walks through install, model download, permissions, and a hotkey test.
---

# Set up Handy (voice coding)

[Handy](https://handy.computer) is a **free, open-source, fully-local** push-to-talk dictation app. Transcription runs on-device (Whisper / Parakeet) — nothing leaves the machine, and there's no subscription. That makes it the right pick for a room of developers: no card, no cloud, works offline on conference Wi-Fi. This skill gets the user dictating in **under five minutes**, then proves it works.

> Voice coding is the on-ramp for the whole workshop: hands off the keyboard, talk at 184+ wpm, and drive several agents at once. Handy is just the dictation layer — Claude Code is what listens.

## Procedure

1. **Detect the platform.** Run `uname -s` (Darwin = macOS, otherwise check for Windows). Pick the matching install path below.

2. **Install Handy.**

   - **macOS** (Homebrew preferred):
     ```bash
     brew install --cask handy
     ```
     If Homebrew isn't present, point them to the signed `.dmg` at <https://handy.computer> and ask them to drag Handy to Applications.

   - **Windows:** download the installer from <https://handy.computer> and run it. (Confirm with the user once it's installed.)

3. **First launch + model download.** Open Handy. On first run it downloads a local speech model — recommend **Whisper Small** (fast, accurate enough for code) or **Parakeet** if offered. Wait for the download to finish before testing.

4. **Grant permissions (macOS).** Handy needs **Microphone** and **Accessibility** permission to type into other apps:
   - System Settings → Privacy & Security → **Microphone** → enable Handy.
   - System Settings → Privacy & Security → **Accessibility** → enable Handy.
   Tell the user exactly where to click; this is the most common place setup stalls.

5. **Set the push-to-talk hotkey.** In Handy's settings, confirm or set a comfortable push-to-talk key (hold to talk, release to transcribe). A modifier like **right-Option** or **F5** works well. Tell them the chosen key.

6. **Prove it works.** Ask the user to focus this terminal, hold the hotkey, and say a test sentence such as *"Claude, list the files in this directory."* Confirm the dictated text appears in the prompt. If nothing types: re-check Accessibility permission (step 4) — that's the culprit ~90% of the time.

7. **Report.** Tell the user Handy is live, name their hotkey, and hand off: *"You're voice-coding now — hold {hotkey}, talk, release. Try driving me hands-free."*

## Notes

- **Don't** recommend a paid tool here. Handy is deliberately the choice because it's free and local — no hard sell mid-workshop.
- If `brew install --cask handy` fails (cask not found in their tap), fall back to the `.dmg` from <https://handy.computer> rather than fighting Homebrew.
- Everything is local: reassure privacy-conscious users that audio never leaves their machine.
