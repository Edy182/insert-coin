# Insert Coin 🕹️

A collection of retro browser games starring Clawd, a friendly pixel-art crab — built for the Claude Code community and AI dev culture. Independent fan project, not affiliated with Anthropic.

## What this is

Not just one game — an **arcade ecosystem**. The strategy is to ship a single playable game first (Clawd Runner), then add more games every 4-6 weeks to build a defensible catalog. Single brand, multiple games, growing community.

## Why an arcade, not just one game

A standalone game is replicable in 2 days. An arcade ecosystem with community, leaderboards, lore, and 4-5 games is not. The moat is the collection plus the community around it, not the code of any single game.

## Games — launch order (browser then terminal, staggered)

| Order | Game | Genre | Browser ship | Terminal ship |
|---|---|---|---|---|
| 1 | **Clawd Runner** | Endless runner (Chrome dino-style) | 🟡 Weekend 1 | Month 2 |
| 2 | **Clawd Chomp** | Pac-Man clone | ⚪ Month 2 | Month 3 |
| 3 | **Clawd Snake** | Snake clone | ⚪ Month 3 | Month 4 |
| 4 | **Clawd Tetris** | Tetris clone | ⚪ Month 4 | Month 5 |
| 5+ | TBD (Breakout, Asteroids, Frogger…) | various | ⚪ Month 5+ | Month 6+ |

## Distribution — hybrid strategy

Each game ships in TWO platforms (browser first, terminal version 4-6 weeks later):

**Browser (clawdbytes.com)** — primary launch surface
- Mobile + desktop, no install required
- Viral-friendly (shareable URL, embeddable iframe, video clips)
- PWA-ready (installable to mobile home screen)
- Target: general public + AI dev community

**Terminal (`npm install -g clawd-bytes-cli`)** — deep distribution
- For Claude Code users — play without leaving the terminal
- Lives alongside `claude-arcade` (which has puzzle games like Wordle/Chess) — our category is **action/reflex** so we're complementary, not competing
- Claude Code plugin `/arcade` discovers it natively
- Target: hardcore dev audience

Same characters, same lore, both platforms. The COMBINED catalog is harder to replicate than either alone — that's the moat.

## Current status

- [ ] Domain registered (`clawdbytes.com` or alternative)
- [ ] Private GitHub repo created
- [ ] Branding decisions locked (name, palette, sprite reference)
- [ ] Clawd sprite designed (8-bit retro orange, original variant — see `docs/branding.md`)
- [ ] Landing page skeleton (`index.html`)
- [ ] **Clawd Runner** playable MVP
- [ ] Sound effects integrated
- [ ] Score persistence (localStorage)
- [ ] Sharable URL with score parameter
- [ ] Discord server created
- [ ] Public launch: repo public + landing page live + HN/Reddit/X posts
- [ ] Claude Code `/arcade` plugin shipped
- [ ] First 100 unique players

## Vision

Become the **Cool Math Games of the AI dev community** — a destination people return to for new games, with a recognizable brand (Clawd + friends), a community (Discord with leaderboards), and a steady release cadence. Within 6 months: 4 games shipped, 5K+ active community, optional sponsors from dev tools brands.

## Why this might work

- Claude Code has 160K+ monthly devs through its plugin marketplace — built-in audience
- Clawd is a beloved mascot Anthropic created but they haven't built any games around
- Browser HTML5 is mature; weekend-scope feasible
- Multi-game ecosystem is defensible (one game can be cloned; an arcade brand cannot)
- Anthropic culture is pro-community: history of amplifying good fan projects, not crushing them

## Risks

- Anthropic builds their own arcade officially — mitigated by being first-mover with community
- One game falls flat — that's why we have a catalog, not a single product
- Time sink without traction — kill criteria in `PLAN.md` to avoid sunk cost spiral

See `CLAUDE.md` for project instructions, `PLAN.md` for execution roadmap, `docs/legal-strategy.md` for the defensive moves.
