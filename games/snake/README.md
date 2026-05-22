# Clawd Snake — Month 3

Target ship: ~10-12 weeks after Clawd Runner launches.

## Concept

Snake but Clawd grows by eating "code commits" (green dots). Each commit makes him longer. Avoid:
- Hitting walls
- Biting your own tail
- **Merge conflicts** (red Xs that appear randomly and stay until eaten — eating them costs 3 segments)

## Power-ups / events

- **Bug fix** (rare blue dot) → worth 3x commits, no length penalty
- **Refactor** (purple dot) → cuts your tail in half (sometimes you want this for tight spaces)
- **Hot fix** (orange flash) → temporary invincibility for 3 seconds

## Tech

Tile-based grid. Vanilla Canvas. Increasing speed as Clawd grows.

## Stretch goal: Multiplayer

Snake.io-style multiplayer with WebSockets. Multiple Clawds in one arena, last one alive wins. Could be the breakout feature that makes the arcade truly unique.

## To do (when we start month 3)

- [ ] Sprite design: Clawd head + body segments
- [ ] Grid system
- [ ] Snake movement + growth
- [ ] Self-collision detection
- [ ] Merge conflict spawning
- [ ] Power-ups
- [ ] Score + high score
- [ ] Optional: multiplayer mode (stretch)
- [ ] Add to landing page when shipped
