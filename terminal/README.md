# Terminal versions of Clawd Bytes games

Each browser game in `../games/` has a terminal counterpart here. Distributed as a single npm package: **`clawd-bytes-cli`**.

```bash
npm install -g clawd-bytes-cli
clawd-runner     # plays terminal Runner
clawd-chomp      # plays terminal Pac-Man (when shipped)
clawd-snake      # plays terminal Snake (when shipped)
clawd-tetris     # plays terminal Tetris (when shipped)
```

## Tech stack

**Recommended:** Node.js + Ink (React for CLI). Same JS knowledge as browser version.

**Why Ink:**
- React-style components for terminal — gentle learning curve if you know JS
- Mature ecosystem (used by Gatsby CLI, GitHub CLI, others)
- Easy to test
- Renders to ANSI escape codes, works in any modern terminal

**Alternatives if Node + Ink is painful:**
- Python + Textual (more polished but new language)
- Go + Bubble Tea (fastest but steepest learning curve)

## Folder structure (when filled in)

```
terminal/
├── package.json              ← npm package: clawd-bytes-cli
├── bin/
│   ├── clawd-runner          ← CLI entry point
│   ├── clawd-chomp
│   ├── clawd-snake
│   └── clawd-tetris
├── src/
│   ├── shared/               ← reusable game loop, score persistence, sprite helpers
│   ├── runner/
│   ├── chomp/
│   ├── snake/
│   └── tetris/
├── runner-cli/               ← MVP first
│   └── README.md
└── chomp-cli/                ← month 3
    └── README.md
```

## Build order (per PLAN.md)

| Month | Terminal game to build | Status |
|---|---|---|
| 2 | Runner (terminal version of `games/runner/`) | ⚪ planned |
| 3 | Chomp / Pac-Man (terminal version of `games/chomp/`) | ⚪ planned |
| 4 | Snake (terminal version of `games/snake/`) | ⚪ planned |
| 5 | Tetris (terminal version of `games/tetris/`) | ⚪ planned |

Each terminal version ships ~4-6 weeks AFTER its browser counterpart. Browser-first because faster to ship and reach broader audience; terminal version is the "deep distribution" follow-up for dev-cultural cred and Claude Code marketplace integration.

## Distribution via Claude Code plugin marketplace

When all terminal versions are live:

- Plugin name: `clawd-bytes`
- Adds command `/arcade` to Claude Code
- `/arcade` opens a menu listing available games
- User picks → terminal game launches inline (or `clawd-runner` runs in subshell)
- 160K+ Claude Code devs/month exposed via marketplace

Reference for plugin development: `code.claude.com/docs/en/discover-plugins`

## Shared game logic with browser versions

Both browser and terminal versions of the same game should share core logic where possible. The game loop, physics, scoring, level progression — these are platform-agnostic. Only the rendering layer differs.

### Suggested code organization

```
games/runner/
├── game.js                   ← browser-specific rendering + input
└── shared/
    └── game-logic.js         ← physics, scoring, obstacle spawning (shared)

terminal/src/runner/
├── render.tsx                ← Ink components for terminal rendering
└── (imports game-logic.js from games/runner/shared/)
```

This avoids duplicating logic and ensures consistent gameplay across platforms.

## Performance considerations

Terminal games have a few constraints browser doesn't:

- **Refresh rate:** target 30 FPS (terminal refresh costs more than Canvas)
- **Input lag:** raw mode + keypress detection (Ink handles this)
- **Rendering size:** typical terminal is 80x24 chars — design game sprites to fit
- **Color:** 256-color ANSI codes (or 16M with truecolor terminals)
- **Sound:** limited — use terminal bell + system beep, or skip entirely

## What we publish to npm

Single package `clawd-bytes-cli` with multiple binaries. Users get all games with one install.

## When in doubt

Start simple. The first terminal game (Runner) should be MVP — basic Clawd sprite (ASCII art), obstacles, jump, score. Polish on iteration. Don't try to match browser visual quality — terminal has its own retro charm.
