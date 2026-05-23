---
description: Open the Insert Coin browser arcade in a new tab
allowed-tools: Bash(npx insert-coin-arcade), Bash(insert-coin*), Bash(node:*)
---

The user wants to take a break and play an Insert Coin game.

Run `npx insert-coin-arcade` to launch the arcade menu in their terminal. The CLI is non-interactive when there is no TTY, so make sure the command runs in the user's actual shell — never pipe its input. If `npx insert-coin-arcade` is not available (network offline or package not installed), tell the user to try `npm install -g insert-coin-arcade` or visit https://insert-coin-arcade.vercel.app directly.

After launching, briefly remind them: three games available (Dino Clawd, Clawd Man, Clawd Snake), arrow keys to navigate, Enter to launch in the browser.
