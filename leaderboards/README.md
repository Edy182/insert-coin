# Clawd Bytes leaderboards (Cloudflare Worker)

A tiny Cloudflare Worker backed by KV that stores the top 10 scores per game, plus a separate top 10 per day for daily-challenge runs.

## Endpoints

```
POST /api/score
  body: { "game": "runner|chomp|snake", "name": "ed", "score": 1234, "daily": true, "dateISO": "2026-05-22" }
  -> { ok: true, rank: 3, list: [...] }

GET /api/top?game=runner            -> top 10 all-time
GET /api/top?game=runner&daily=2026-05-22  -> top 10 for that day
```

## Deploy (you do this once)

You need a Cloudflare account and `wrangler` installed (`npm i -g wrangler`).

```bash
cd leaderboards
wrangler login
wrangler kv:namespace create LEADERBOARDS
# Copy the id from the output into wrangler.toml (replace REPLACE_ME_...)
wrangler deploy
```

`wrangler deploy` prints the Worker URL — copy it.

## Wire up the client

Add this snippet to the top of `index.html` (before the game scripts), once you have a Worker URL:

```html
<script>
  window.CLAWD_LB_URL = 'https://clawd-bytes-leaderboards.YOUR-SUBDOMAIN.workers.dev';
</script>
```

When `CLAWD_LB_URL` is set, the games will POST scores on game-over and you can read the top with a small fetch.

If `CLAWD_LB_URL` is unset, score submission silently no-ops — local high scores keep working.

## Cost

Cloudflare Workers free tier is 100k requests/day. KV free tier is 100k reads + 1k writes per day. Indie arcade traffic will not come close.

## Anti-cheat (current state)

There is none. The Worker validates `score <= 1,000,000` and sanitizes names, but a determined cheater can `curl` whatever they want. That's fine for now — when the arcade is big enough to attract abuse, gate writes with a HMAC token issued on game start.

## Disclaimer

Independent fan project. Not affiliated with or endorsed by Anthropic. MIT licensed.
