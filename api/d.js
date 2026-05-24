// /d (rewritten to /api/d). Returns minimal HTML with Open Graph + Twitter
// meta tags so the link unfurls in social apps with a Clawd preview
// (fetched from /api/og). Humans get meta-refreshed into the game's
// daily mode.

export const config = { runtime: 'edge' };

const GAME_NAMES = { runner: 'Dino', chomp: 'Mac-Pan', snake: 'Snake' };

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function handler(req) {
  const url = new URL(req.url);
  const game  = (url.searchParams.get('g')  || 'runner').toLowerCase();
  const score = url.searchParams.get('s')  || '0';
  const rank  = url.searchParams.get('r')  || '';
  const total = url.searchParams.get('n')  || '';
  const date  = url.searchParams.get('dt') || '';

  const gameName = GAME_NAMES[game] || 'Game';
  const isDaily  = !!date;

  const ogUrl = new URL(`https://${url.host}/api/og`);
  ogUrl.search = url.search;

  const title = `${score} pts on Insert Coin ${gameName}${isDaily ? ' daily' : ''}`;
  const rankPart = rank
    ? ` · rank #${rank}${total ? `/${total}` : ''}${isDaily ? ' today' : ' all-time'}`
    : '';
  const desc = `${isDaily ? `Daily ${date}` : 'All-time score'}${rankPart} — can you beat it? Independent fan arcade.`;
  const playUrl = `https://${url.host}/games/${game}/${isDaily ? '?daily' : ''}`;
  const canonical = url.toString();

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
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="Insert Coin">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogUrl.toString())}">
<link rel="canonical" href="${esc(canonical)}">
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
