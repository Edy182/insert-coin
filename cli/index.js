#!/usr/bin/env node
'use strict';

// Insert Coin launcher — minimal ASCII menu that opens the browser arcade.
// Independent fan project. Not affiliated with or endorsed by Anthropic.

const readline = require('readline');
const { spawn } = require('child_process');

// Site URL resolution order: --url=X flag > --local flag > $CLAWD_BYTES_URL >
// production default. While the public domain isn't live yet you can run
//   clawd-bytes --local           (uses http://localhost:8001)
//   clawd-bytes --url=https://x   (any URL)
//   CLAWD_BYTES_URL=... clawd-bytes
const args = process.argv.slice(2);
function argValue(prefix) {
  const a = args.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : null;
}
const SITE =
  argValue('--url=') ||
  (args.includes('--local') ? 'http://localhost:8001' : null) ||
  process.env.INSERT_COIN_URL ||
  process.env.CLAWD_BYTES_URL ||
  'https://insert-coin-arcade.vercel.app';
const GAMES = [
  { key: 'r', label: 'DINOCLAWD',  path: '/games/runner/',  blurb: 'endless runner · dodge cacti and pteros' },
  { key: 'c', label: 'CLAWDMAN',   path: '/games/chomp/',   blurb: 'maze chase · eat the bugs back' },
  { key: 's', label: 'CLAWD SNAKE', path: '/games/snake/',  blurb: 'snake · don\'t bite yourself' },
];

const O = (s) => `\x1b[38;5;208m${s}\x1b[0m`; // orange
const G = (s) => `\x1b[90m${s}\x1b[0m`;       // dim gray
const C = (s) => `\x1b[36m${s}\x1b[0m`;       // cyan
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

function banner() {
  return [
    '',
    O('  ┌──────────────────────────────────┐'),
    O('  │       I N S E R T   C O I N      │'),
    O('  └──────────────────────────────────┘'),
    G('       retro games for the AI dev community'),
    '',
  ].join('\n');
}

function render(selected) {
  console.clear();
  console.log(banner());
  GAMES.forEach((g, i) => {
    const cursor = i === selected ? O('▸ ') : '  ';
    const title = i === selected ? BOLD(O(g.label)) : g.label;
    console.log(`${cursor}${title}`);
    console.log(`    ${G(g.blurb)}`);
  });
  console.log('');
  console.log(G('  ↑/↓ navigate · enter to launch · q to quit'));
  console.log('');
  console.log(G('  ' + SITE));
  console.log(G('  independent fan project · not affiliated with anthropic'));
}

function openUrl(url) {
  const platform = process.platform;
  let cmd, args;
  if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '""', url];
  } else if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (_) {
    return false;
  }
}

function launch(game) {
  const url = SITE + game.path;
  console.clear();
  console.log(banner());
  console.log(O(`  launching ${game.label}...`));
  console.log(G(`  ${url}`));
  const ok = openUrl(url);
  if (!ok) {
    console.log('');
    console.log(C(`  couldn't open the browser automatically.`));
    console.log(C(`  paste this into your browser:`));
    console.log('');
    console.log('  ' + url);
  }
  console.log('');
  process.exit(0);
}

function main() {
  if (!process.stdin.isTTY) {
    console.log(banner());
    console.log('  Run this in an interactive terminal, or visit ' + SITE);
    process.exit(0);
  }

  let selected = 0;
  render(selected);

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('keypress', (str, key) => {
    if (!key) return;
    if (key.ctrl && key.name === 'c') { process.exit(0); }
    if (key.name === 'q' || key.name === 'escape') { process.exit(0); }
    if (key.name === 'up')   { selected = (selected - 1 + GAMES.length) % GAMES.length; render(selected); return; }
    if (key.name === 'down') { selected = (selected + 1) % GAMES.length; render(selected); return; }
    if (key.name === 'return') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      launch(GAMES[selected]);
      return;
    }
    // Hotkeys: r / c / s jump straight to a game.
    const hot = GAMES.find((g) => g.key === (str || '').toLowerCase());
    if (hot) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      launch(hot);
    }
  });
}

main();
