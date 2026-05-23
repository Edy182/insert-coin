# Claude Code slash command

Drop `play.md` into your Claude Code commands directory and type `/play` from any Claude Code session to open the Insert Coin arcade.

## Install (per-user)

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force $HOME/.claude/commands | Out-Null
Copy-Item play.md $HOME/.claude/commands/play.md
```

```bash
# macOS / Linux
mkdir -p ~/.claude/commands
cp play.md ~/.claude/commands/play.md
```

## Install (per-project)

If you'd rather scope the command to a single repo, copy the file to `.claude/commands/play.md` inside that repo.

## Requirements

- `npx insert-coin-arcade` must resolve. Once the package is published you get this for free; until then either `npm link` from this repo's `cli/` folder or `npm install -g <path-to-cli>`.

## Disclaimer

Independent fan project. Not affiliated with or endorsed by Anthropic. MIT licensed.
