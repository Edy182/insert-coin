# insert-coin-arcade

Launch the [Insert Coin](https://insert-coin-sigma-sand.vercel.app) browser arcade from your terminal.

Three pixel games starring Clawd, a friendly pixel-art crab:

- **Dino** — endless runner
- **Munch** — maze chase
- **Snake** — classic snake

```bash
npx insert-coin-arcade
```

Use ↑/↓ to navigate, Enter to launch the selected game in your default browser. Press `r`, `c`, or `s` to jump straight to a game.

## Install globally

```bash
npm install -g insert-coin-arcade
insert-coin
```

## Pointing at a different URL

By default the launcher opens `https://insert-coin-sigma-sand.vercel.app`. Override that with:

```bash
insert-coin --local                 # uses http://localhost:8001
insert-coin --url=https://my.site   # any URL
INSERT_COIN_URL=... insert-coin     # env var works too
```

## Why a CLI for a browser arcade

The games live on the web so the CLI is a launcher, not a runtime. The goal is one-command access from a Claude Code session — type `npx insert-coin-arcade`, pick a game, take a five-minute break.

## Disclaimer

Independent fan project. Not affiliated with or endorsed by Anthropic. Clawd is a friendly pixel-art crab drawn for this project. MIT licensed.
