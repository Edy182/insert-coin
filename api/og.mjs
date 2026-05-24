// Combined OG endpoint. Returns either:
//   - HTML with Open Graph + Twitter meta tags (when ?fmt=html)
//   - PNG rendered by @vercel/og  (default)
//
// Combined into a single Edge function because Vercel's bundler was
// pulling @vercel/og into a shared module graph between two separate
// /api/*.mjs files and rejecting one of them. One function = one bundle
// = no cross-function reference issue.

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';
export const config = { runtime: 'edge' };

// Brand palette
const ORANGE = '#d97757';
const NAVY   = '#0b1426';
const CREAM  = '#faf9f5';
const GRAY   = '#888';
const EYE    = '#1A0808';

const O = ORANGE;
const B = EYE;
const _ = null;

// 12×9 standing Clawd grid
const CLAWD_GRID = [
  [ _,O,O,O,O,O,O,O,O,O,O,_ ],
  [ _,O,O,O,O,O,O,O,O,O,O,_ ],
  [ _,O,O,B,O,O,O,O,O,B,O,_ ],
  [ _,O,O,B,O,O,O,O,O,B,O,_ ],
  [ O,O,O,O,O,O,O,O,O,O,O,O ],
  [ O,O,O,O,O,O,O,O,O,O,O,O ],
  [ _,O,O,O,O,O,O,O,O,O,O,_ ],
  [ _,O,O,O,O,O,O,O,O,O,O,_ ],
  [ _,_,O,_,O,_,_,_,O,_,O,_ ],
];

const GAME_LABELS = { runner: 'DINO', chomp: 'MAC-PAN', snake: 'SNAKE' };
const GAME_NAMES  = { runner: 'Dino', chomp: 'Mac-Pan', snake: 'Snake' };
const GAME_ACCENT = { runner: '🌵',   chomp: '👻',      snake: '🍎' };

function h(type, props, ...children) {
  const flat = [];
  for (const c of children) {
    if (Array.isArray(c)) flat.push(...c); else if (c != null && c !== false) flat.push(c);
  }
  return {
    type,
    props: { ...(props || {}), children: flat.length <= 1 ? (flat[0] ?? null) : flat },
    key: (props && props.key) || null,
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function handler(req) {
  const url   = new URL(req.url);
  const fmt   = url.searchParams.get('fmt');
  const game  = (url.searchParams.get('g')  || 'runner').toLowerCase();
  const score = url.searchParams.get('s')  || '0';
  const rank  = url.searchParams.get('r')  || '';
  const total = url.searchParams.get('n')  || '';
  const date  = url.searchParams.get('dt') || '';

  if (fmt === 'html') return renderHtml(req, url, { game, score, rank, total, date });
  return renderPng({ game, score, rank, total, date });
}

function renderHtml(req, url, p) {
  const host = req.headers.get('host') || url.host;
  // OG image: same endpoint but no fmt param so the default (PNG) is returned
  const ogUrl = new URL(`https://${host}/api/og`);
  url.searchParams.forEach((v, k) => { if (k !== 'fmt') ogUrl.searchParams.set(k, v); });
  // Canonical share URL (what the user actually pasted): /d?...
  const canonical = new URL(`https://${host}/d`);
  url.searchParams.forEach((v, k) => { if (k !== 'fmt') canonical.searchParams.set(k, v); });

  const gameName = GAME_NAMES[p.game] || 'Game';
  const isDaily  = !!p.date;
  const title    = `${p.score} pts on Insert Coin ${gameName}${isDaily ? ' daily' : ''}`;
  const rankPart = p.rank
    ? ` · rank #${p.rank}${p.total ? `/${p.total}` : ''}${isDaily ? ' today' : ' all-time'}`
    : '';
  const desc     = `${isDaily ? `Daily ${p.date}` : 'All-time score'}${rankPart} — can you beat it? Independent fan arcade.`;
  const playUrl  = `https://${host}/games/${p.game}/${isDaily ? '?daily' : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — Insert Coin</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(ogUrl.toString())}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(canonical.toString())}">
<meta property="og:site_name" content="Insert Coin">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogUrl.toString())}">
<link rel="canonical" href="${esc(canonical.toString())}">
<meta http-equiv="refresh" content="0; url=${esc(playUrl)}">
<style>
  body{font-family:monospace;background:#0b1426;color:#faf9f5;
       display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;text-align:center;padding:24px;}
  a{color:#d97757;}
</style>
</head>
<body>
<div>
  <h1 style="color:#d97757;letter-spacing:6px;">INSERT COIN</h1>
  <p>${esc(title)}${esc(rankPart)}</p>
  <p><a href="${esc(playUrl)}">▶ Play ${esc(gameName)}${isDaily ? ' daily' : ''}</a></p>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

function renderPng(p) {
  const gameLabel = GAME_LABELS[p.game] || 'GAME';
  const accent    = GAME_ACCENT[p.game] || '';

  const P = 28;
  const clawdW = 12 * P;
  const clawdH = 9 * P;

  const clawdPixels = [];
  for (let r = 0; r < CLAWD_GRID.length; r++) {
    for (let c = 0; c < CLAWD_GRID[r].length; c++) {
      const cell = CLAWD_GRID[r][c];
      if (!cell) continue;
      clawdPixels.push(
        h('div', {
          style: {
            position: 'absolute',
            left:   c * P,
            top:    r * P,
            width:  P,
            height: P,
            background: cell,
          },
        }),
      );
    }
  }

  const rankLine = p.rank
    ? `rank #${p.rank}${p.total ? ` / ${p.total}` : ''} ${p.date ? 'today' : 'all-time'}`
    : (p.date ? 'daily challenge' : 'all-time');

  const tree = h(
    'div',
    {
      style: {
        width:  '100%',
        height: '100%',
        background: NAVY,
        display: 'flex',
        flexDirection: 'column',
        padding: '70px 80px',
        color: CREAM,
        fontFamily: 'monospace',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { fontSize: 38, letterSpacing: 8, color: ORANGE } }, `INSERT COIN  🕹️`),
      h('div', { style: { fontSize: 28, color: GRAY } }, p.date || 'all-time'),
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: 70 } },
      h(
        'div',
        {
          style: {
            position: 'relative',
            width: clawdW,
            height: clawdH,
            marginRight: 80,
            display: 'flex',
          },
        },
        clawdPixels,
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 38, color: ORANGE, letterSpacing: 4 } }, `${gameLabel}  ${accent}`),
        h('div', { style: { fontSize: 180, lineHeight: 1, color: CREAM, marginTop: 8 } }, p.score),
        h('div', { style: { fontSize: 32, color: ORANGE, marginTop: 18, letterSpacing: 2 } }, rankLine),
      ),
    ),
    h(
      'div',
      {
        style: {
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 22,
          color: GRAY,
        },
      },
      h('div', null, 'play.insert-coin.vercel.app'),
      h('div', null, 'independent fan project · not affiliated with Anthropic'),
    ),
  );

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, immutable, max-age=86400, s-maxage=86400',
    },
  });
}
