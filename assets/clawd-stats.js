// Shared cross-game stats + cosmetic hat unlocks for Clawd Bytes.
// Loaded by the landing page and every game's index.html before game.js.
(function () {
  'use strict';

  const STATS_KEY = 'clawd-stats';
  const DEFAULTS = { totalGames: 0, dailiesDone: 0 };
  const DEFAULT_COLOR = '#FF8A00';

  // Body recolors. Highest-unlocked tier auto-applies. The shape of Clawd stays
  // identical — only the body color changes.
  const SKINS = [
    { id: 'classic', name: 'CLASSIC', color: DEFAULT_COLOR, requires: () => true,                 unlockHint: 'default' },
    { id: 'cyan',    name: 'CYAN',    color: '#4ED8E5',     requires: (s) => s.totalGames >= 3,   unlockHint: '3 games' },
    { id: 'pink',    name: 'PINK',    color: '#FFB6E1',     requires: (s) => s.totalGames >= 8,   unlockHint: '8 games' },
    { id: 'lime',    name: 'LIME',    color: '#3FCB7A',     requires: (s) => s.totalGames >= 15,  unlockHint: '15 games' },
  ];

  // Hat overlays. Crown is the only one — auto-applies once unlocked.
  const HATS = [
    {
      id: 'crown',
      name: 'CROWN',
      requires: (s) => s.totalGames >= 25,
      unlockHint: '25 games',
      pixels: [
        [1, 0, 1, 0, 1, 0, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 0],
      ],
      colors: { 1: '#FFCD3C' },
    },
  ];

  function read() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return Object.assign({}, DEFAULTS, parsed);
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function write(s) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (_) {}
  }
  function increment(key, by) {
    const s = read();
    s[key] = (s[key] || 0) + (by || 1);
    write(s);
    return s;
  }
  function isUnlocked(list, id) {
    const stats = read();
    const item = list.find((x) => x.id === id);
    return !!item && item.requires(stats);
  }
  // Returns the highest-tier unlocked skin (later items in SKINS are rarer).
  function getActiveSkin() {
    const stats = read();
    let active = SKINS[0];
    for (const skin of SKINS) if (skin.requires(stats)) active = skin;
    return active;
  }
  function getActiveSkinColor() { return getActiveSkin().color; }
  // Returns the active hat (or null if none unlocked).
  function getActiveHat() {
    const stats = read();
    for (let i = HATS.length - 1; i >= 0; i--) if (HATS[i].requires(stats)) return HATS[i];
    return null;
  }

  // Draws the active hat above a sprite.
  // (cx, topY) is the top-center of the sprite; pixelSize scales the hat.
  function drawHat(ctx, cx, topY, pixelSize) {
    const hat = getActiveHat();
    if (!hat || !hat.pixels) return;
    const rows = hat.pixels.length;
    const cols = hat.pixels[0].length;
    const leftX = Math.round(cx - (cols * pixelSize) / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = hat.pixels[r][c];
        if (!v) continue;
        const color = hat.colors[v];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(leftX + c * pixelSize, Math.round(topY) - (rows - r) * pixelSize, pixelSize, pixelSize);
      }
    }
  }

  // Convenience: bump totalGames once per page load + bump dailiesDone once per daily page load.
  function trackSessionStart(opts) {
    const gameId = opts && opts.gameId;
    if (!gameId) return;
    const sessionKey = 'clawd-session-' + gameId;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    increment('totalGames');
    if (opts.dailyMode) {
      const dailyKey = 'clawd-daily-counted-' + gameId + '-' + (opts.dateISO || new Date().toISOString().slice(0, 10));
      if (!localStorage.getItem(dailyKey)) {
        localStorage.setItem(dailyKey, '1');
        increment('dailiesDone');
      }
    }
  }

  // Optional cloud leaderboard submission. No-ops unless window.CLAWD_LB_URL is set.
  function submitScore(opts) {
    if (!opts || !window.CLAWD_LB_URL || typeof fetch !== 'function') return;
    const name = (function () { try { return localStorage.getItem('clawd-player-name') || ''; } catch (_) { return ''; } })();
    try {
      fetch(window.CLAWD_LB_URL.replace(/\/$/, '') + '/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: opts.game,
          name: name,
          score: opts.score,
          daily: !!opts.dailyMode,
          dateISO: opts.dateISO || new Date().toISOString().slice(0, 10),
        }),
      }).catch(function () {});
    } catch (_) {}
  }

  window.ClawdStats = {
    read: read,
    increment: increment,
    getActiveSkin: getActiveSkin,
    getActiveSkinColor: getActiveSkinColor,
    getActiveHat: getActiveHat,
    drawHat: drawHat,
    trackSessionStart: trackSessionStart,
    submitScore: submitScore,
    SKINS: SKINS,
    HATS: HATS,
    DEFAULT_COLOR: DEFAULT_COLOR,
  };
})();
