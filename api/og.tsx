import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Brand palette
const ORANGE = '#d97757';
const DARK   = '#141413';
const NAVY   = '#0b1426';
const CREAM  = '#faf9f5';
const GRAY   = '#888';
const EYE    = '#1A0808';

// Clawd standing — same 12×9 pixel grid the games render. O = body, B = eye.
const _ = null;
const O = ORANGE;
const B = EYE;
const CLAWD_GRID: (string | null)[][] = [
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

const GAME_LABELS: Record<string, string> = {
  runner: 'DINO',
  chomp:  'MAC-PAN',
  snake:  'SNAKE',
};

// Game-specific accent emoji-equivalent rendered as text
const GAME_ACCENT: Record<string, string> = {
  runner: '🌵',
  chomp:  '👻',
  snake:  '🍎',
};

export default function handler(req: Request) {
  const url = new URL(req.url);
  const game  = (url.searchParams.get('g')  || 'runner').toLowerCase();
  const score = url.searchParams.get('s')  || '0';
  const rank  = url.searchParams.get('r')  || '';
  const total = url.searchParams.get('n')  || '';
  const date  = url.searchParams.get('dt') || '';

  const gameLabel = GAME_LABELS[game] ?? 'GAME';
  const accent    = GAME_ACCENT[game] ?? '';

  // Render Clawd as a 12×9 grid of <div> pixels — Satori SVG <rect> support
  // is partial, divs are reliable. P = pixel size in OG-image units.
  const P = 28;
  const clawdW = 12 * P;
  const clawdH = 9 * P;

  const clawdPixels: React.ReactNode[] = [];
  CLAWD_GRID.forEach((row, r) => {
    row.forEach((col, c) => {
      if (col) {
        clawdPixels.push(
          <div
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: c * P,
              top:  r * P,
              width:  P,
              height: P,
              background: col,
            }}
          />,
        );
      }
    });
  });

  const rankLine = rank
    ? `rank #${rank}${total ? ` / ${total}` : ''} ${date ? 'today' : 'all-time'}`
    : (date ? `daily challenge` : 'all-time');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: NAVY,
          display: 'flex',
          flexDirection: 'column',
          padding: '70px 80px',
          color: CREAM,
          fontFamily: 'monospace',
        }}
      >
        {/* Brand bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 38, letterSpacing: 8, color: ORANGE }}>
            INSERT&nbsp;COIN&nbsp;&nbsp;🕹️
          </div>
          <div style={{ fontSize: 28, color: GRAY }}>{date || 'all-time'}</div>
        </div>

        {/* Main row: Clawd + score */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 70,
          }}
        >
          {/* Clawd sprite — absolute-positioned pixel grid */}
          <div
            style={{
              position: 'relative',
              width: clawdW,
              height: clawdH,
              marginRight: 80,
              display: 'flex',
            }}
          >
            {clawdPixels}
          </div>

          {/* Score block */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 38, color: ORANGE, letterSpacing: 4 }}>
              {gameLabel}&nbsp;&nbsp;{accent}
            </div>
            <div style={{ fontSize: 180, lineHeight: 1, color: CREAM, marginTop: 8 }}>
              {score}
            </div>
            <div style={{ fontSize: 32, color: ORANGE, marginTop: 18, letterSpacing: 2 }}>
              {rankLine}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 22,
            color: GRAY,
          }}
        >
          <div>play.insert-coin.vercel.app</div>
          <div>independent fan project · not affiliated with Anthropic</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, immutable, max-age=86400, s-maxage=86400',
      },
    },
  );
}
