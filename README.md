# Insert Coin 🕹️

A weekend project: three pixel-art arcade classics starring Clawd, the tiny crab on the Claude Code welcome screen. No install, five-minute breaks for devs.

**Live site:** https://insertcoin.run
**Terminal launcher:** `npx insert-coin-arcade`
**Claude Code slash command:** `/play` (copy `claude-commands/play.md` to `~/.claude/commands/`)

Independent fan project. All original code, MIT licensed. Not affiliated with or endorsed by Anthropic.

## The games

| Name | Genre | How |
|---|---|---|
| **Dino** | Endless runner | jump cacti, duck pteros |
| **Munch** | Maze chase | eat dots, dodge bugs, power pellet flips the script |
| **Snake** | Classic snake | grow, don't bite yourself |

All three support keyboard, mouse, and touch. Cross-platform, no download.

Daily challenge: same seed for everyone each day; the share card includes your rank against today's top-10 leaderboard.

## Local development

```bash
npm install      # installs Vite as dev dependency
npm run dev      # http://localhost:8001 with hot reload + no-cache headers
```

Edit any HTML / CSS / JS file and the browser refreshes automatically. Production deploys (Vercel) serve the raw files directly — no build step.

## Architecture

- **Frontend**: vanilla HTML5 Canvas + plain JS modules (no framework). Each game is one `game.js` IIFE that owns its loop and renderer.
- **Shared cross-game module**: `assets/clawd-stats.js` exposes `window.ClawdStats` for stats tracking, skin/hat overrides, shield handling, leaderboard submission, and dev tooling.
- **Backend**: Cloudflare Worker at `leaderboards/worker.js` backed by KV. Stores top-10 per game (all-time + per-day). Free tier handles indie traffic comfortably.
- **CLI**: `cli/index.js` is a Node script with no dependencies. Spawns the OS default browser at the live URL. Published as `insert-coin-arcade` on npm.
- **Hosting**: Vercel for the static site, Cloudflare Workers for the leaderboard API, npm for the CLI, GitHub for the repo.

## Repo layout

```
/                      landing page (index.html)
games/runner/          Dino
games/chomp/           Munch
games/snake/           Snake
assets/clawd-stats.js  shared stats / cosmetics module
cli/                   the npm CLI launcher
leaderboards/          Cloudflare Worker + wrangler config
claude-commands/       /play slash command for Claude Code
docs/                  project strategy notes (CLAUDE.md, PLAN.md)
```

## Roadmap

- **v1 (now)**: 3 games, classic Clawd terracotta, leaderboards, daily challenge, share cards
- **Drop 1**: skin pack — Blue / Pink / Sage Clawd
- **Drop 2**: rare skin pack — Gold / Cream / Onyx Clawd
- **Drop 3**: hat pack — Crown (SHIFT to activate shield) + Wizard Hat (godmode + sparkles)
- **Drop 4**: original 4th game (no clone)

## Contributing

It's a side project. Issues and PRs welcome but I ship on weekends. If you find a bug, open an issue. If you want a new game, propose it and we'll talk.

## Disclaimer

Independent fan project. Clawd is rendered as transformative pixel art in tribute to the Claude Code welcome screen. Not affiliated with or endorsed by Anthropic. MIT licensed — fork freely.
