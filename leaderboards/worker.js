// Clawd Bytes leaderboards — Cloudflare Worker backed by KV.
// Endpoints:
//   POST /api/score     { game, name, score, daily, dateISO }    -> store score
//   GET  /api/top?game=runner[&daily=2026-05-22]                  -> top 10
// CORS open to the public site origin.

const ALLOWED_GAMES = new Set(['runner', 'chomp', 'snake']);
const ALLOWED_ORIGINS = new Set([
  'https://insert-coin-sigma-sand.vercel.app',
  'http://localhost:8001',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);
const TOP_N = 10;

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://insert-coin-sigma-sand.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, init, origin) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin), (init && init.headers) || {});
  return new Response(JSON.stringify(body), Object.assign({}, init, { headers }));
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'anon';
  const trimmed = raw.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 16).trim();
  return trimmed || 'anon';
}

function listKey(game, dateISO) {
  return dateISO ? `top:${game}:daily:${dateISO}` : `top:${game}:all`;
}

async function getTop(env, key) {
  const raw = await env.LEADERBOARDS.get(key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_) { return []; }
}

async function putTop(env, key, list, dateISO) {
  const value = JSON.stringify(list);
  // Daily lists expire after 14 days; all-time lists don't expire.
  if (dateISO) {
    await env.LEADERBOARDS.put(key, value, { expirationTtl: 60 * 60 * 24 * 14 });
  } else {
    await env.LEADERBOARDS.put(key, value);
  }
}

async function handleScore(request, env, origin) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'invalid json' }, { status: 400 }, origin); }

  const { game, name, score, daily, dateISO } = body || {};
  if (!ALLOWED_GAMES.has(game)) return json({ error: 'unknown game' }, { status: 400 }, origin);
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 1_000_000) {
    return json({ error: 'invalid score' }, { status: 400 }, origin);
  }
  const cleanName = sanitizeName(name);
  const cleanDate = (daily && typeof dateISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateISO)) ? dateISO : null;

  const key = listKey(game, cleanDate);
  const list = await getTop(env, key);
  list.push({ name: cleanName, score: Math.floor(numericScore), at: Date.now() });
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, TOP_N);
  await putTop(env, key, trimmed, cleanDate);

  const rank = trimmed.findIndex((e) => e.name === cleanName && e.score === Math.floor(numericScore) && e.at === list.find((x) => x.name === cleanName && x.score === Math.floor(numericScore))?.at);
  return json({ ok: true, rank: rank >= 0 ? rank + 1 : null, list: trimmed }, { status: 200 }, origin);
}

async function handleTop(url, env, origin) {
  const game = url.searchParams.get('game');
  const daily = url.searchParams.get('daily');
  if (!ALLOWED_GAMES.has(game)) return json({ error: 'unknown game' }, { status: 400 }, origin);
  const cleanDate = (daily && /^\d{4}-\d{2}-\d{2}$/.test(daily)) ? daily : null;
  const key = listKey(game, cleanDate);
  const list = await getTop(env, key);
  return json({ ok: true, list }, { status: 200 }, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === '/api/score' && request.method === 'POST') return handleScore(request, env, origin);
    if (url.pathname === '/api/top'   && request.method === 'GET')  return handleTop(url, env, origin);
    return json({ error: 'not found' }, { status: 404 }, origin);
  },
};
