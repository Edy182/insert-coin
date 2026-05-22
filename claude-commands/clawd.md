---
description: Open the Clawd Bytes browser arcade in a new tab
allowed-tools: Bash(npx clawd-bytes), Bash(node:*)
---

The user wants to take a break and play a Clawd Bytes game.

Run `npx clawd-bytes` to launch the arcade menu in their terminal. The CLI is non-interactive when there is no TTY, so make sure the command runs in the user's actual shell — never pipe its input. If `npx clawd-bytes` is not available (network offline or package not installed), tell the user to try `npm install -g clawd-bytes` or visit https://clawdbytes.com directly.

After launching, briefly remind them: three games available (DinoClawd, Clawdman, Clawd Snake), arrow keys to navigate, Enter to launch in the browser.
