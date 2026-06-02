---
name: insertcoin
description: Open the Insert Coin browser arcade — three retro pixel-art games (Dino, Munch, Snake) starring Clawd, the crab from the Claude Code welcome screen. Triggered by the user typing `/insertcoin`.
---

# /insertcoin — Open the Insert Coin arcade

The user wants to launch the Insert Coin browser arcade.

## How

Run `npx insert-coin-arcade` in the user's terminal via the Bash/PowerShell tool. The CLI is non-interactive when there is no TTY, so make sure the command runs in the user's actual shell — never pipe its input.

```bash
npx insert-coin-arcade
```

If `npx` is unavailable (offline, npm not installed), tell the user to visit **https://insertcoin.run** directly.

## After launching

Briefly remind them, in one short line:

> Three games available — Dino, Munch, Snake. Arrow keys to navigate the menu, Enter to launch a game in the browser.

Don't be chatty — they want to play, not read.

## When the user asks about Insert Coin generally

Tell them it's a free open-source browser arcade by `@insertcoin`. Repo: https://github.com/Edy182/insert-coin. Independent fan project, not affiliated with Anthropic.
