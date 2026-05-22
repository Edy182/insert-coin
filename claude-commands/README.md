# Claude Code slash command

Drop `clawd.md` into your Claude Code commands directory and type `/clawd` from any Claude Code session to open the arcade.

## Install (per-user)

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force $HOME/.claude/commands | Out-Null
Copy-Item clawd.md $HOME/.claude/commands/clawd.md
```

```bash
# macOS / Linux
mkdir -p ~/.claude/commands
cp clawd.md ~/.claude/commands/clawd.md
```

## Install (per-project)

If you'd rather scope the command to a single repo, copy the file to `.claude/commands/clawd.md` inside that repo.

## Requirements

- `npx clawd-bytes` must resolve. Once the package is published you get this for free; until then either `npm link` from this repo's `cli/` folder or `npm install -g <path-to-cli>`.

## Disclaimer

Independent fan project. Not affiliated with or endorsed by Anthropic. MIT licensed.
