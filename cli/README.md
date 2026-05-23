# clawd-bytes

Launch the [Clawd Bytes](https://clawdbytes.com) browser arcade from your terminal.

Three pixel games starring Clawd, the Claude Code crab mascot:

- **DinoClawd** — endless runner
- **Clawdman** — maze chase
- **Clawd Snake** — classic snake

```bash
npx clawd-bytes
```

Use ↑/↓ to navigate, Enter to launch the selected game in your default browser. Press `r`, `c`, or `s` to jump straight to a game.

## Install globally

```bash
npm install -g clawd-bytes
clawd-bytes
```

## Pointing at a different URL

By default the launcher opens `https://clawdbytes.com`. Override that with:

```bash
clawd-bytes --local                 # uses http://localhost:8001
clawd-bytes --url=https://my.site   # any URL
CLAWD_BYTES_URL=... clawd-bytes     # env var works too
```

## Why a CLI for a browser arcade

The games live on the web so the CLI is a launcher, not a runtime. The goal is one-command access from a Claude Code session — type `npx clawd-bytes`, pick a game, take a five-minute break.

Native terminal versions of these games are on the roadmap (Node + Ink, action genre — complementary to `claude-arcade` which covers puzzle/strategy).

## Disclaimer

Independent fan project. Not affiliated with or endorsed by Anthropic. All original code, MIT licensed.
