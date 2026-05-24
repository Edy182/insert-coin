// OG image for share URLs. Edge runtime (required by @vercel/og).
// No JSX — we build the element tree as plain objects so the file
// doesn't need React, TS, or a JSX transform to compile.

import { ImageResponse } from '@vercel/og';

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

// 12×9 standing Clawd grid (same as the in-game sprite)
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
const GAME_ACCENT = { runner: '🌵', chomp: '👻', snake: '🍎' };

// React-element-shaped object helper. ImageResponse / Satori accept any
// React-like tree — { type, props: { children, style, ... } } works fine
// without ever importing React.
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

export default function handler(req) {
  const url = new URL(req.url);
  const game  = (url.searchParams.get('g')  || 'runner').toLowerCase();
  const score = url.searchParams.get('s')  || '0';
  const rank  = url.searchParams.get('r')  || '';
  const total = url.searchParams.get('n')  || '';
  const date  = url.searchParams.get('dt') || '';

  const gameLabel = GAME_LABELS[game] || 'GAME';
  const accent    = GAME_ACCENT[game] || '';

  // Build Clawd as a stack of absolute-positioned divs (one per filled pixel)
  const P = 28; // px per logical pixel on the OG canvas
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

  const rankLine = rank
    ? `rank #${rank}${total ? ` / ${total}` : ''} ${date ? 'today' : 'all-time'}`
    : (date ? 'daily challenge' : 'all-time');

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
    // Brand bar
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { fontSize: 38, letterSpacing: 8, color: ORANGE } }, `INSERT COIN  🕹️`),
      h('div', { style: { fontSize: 28, color: GRAY } }, date || 'all-time'),
    ),
    // Main row: Clawd + score
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 70,
        },
      },
      // Clawd
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
      // Score block
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { fontSize: 38, color: ORANGE, letterSpacing: 4 } }, `${gameLabel}  ${accent}`),
        h('div', { style: { fontSize: 180, lineHeight: 1, color: CREAM, marginTop: 8 } }, score),
        h('div', { style: { fontSize: 32, color: ORANGE, marginTop: 18, letterSpacing: 2 } }, rankLine),
      ),
    ),
    // Footer
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
