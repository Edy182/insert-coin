// Shared cross-game stats + cosmetic hat unlocks for Clawd Bytes.
// Loaded by the landing page and every game's index.html before game.js.
(function () {
  'use strict';

  const STATS_KEY = 'clawd-stats';
  const HAT_KEY = 'clawd-active-hat';
  const DEFAULTS = { totalGames: 0, dailiesDone: 0 };

  const HATS = [
    {
      id: 'none',
      name: 'NO HAT',
      requires: () => true,
      unlockHint: 'default',
      pixels: null,
    },
    {
      id: 'cap',
      name: 'CAP',
      requires: (s) => s.totalGames >= 3,
      unlockHint: 'play 3 games',
      pixels: [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [2, 2, 2, 2, 2, 2, 2, 0],
      ],
      colors: { 1: '#3FCB7A', 2: '#F5EFE0' },
    },
    {
      id: 'crown',
      name: 'CROWN',
      requires: (s) => s.dailiesDone >= 1,
      unlockHint: 'finish 1 daily run',
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
  function isUnlocked(id) {
    const hat = HATS.find((h) => h.id === id);
    return !!hat && hat.requires(read());
  }
  function getActiveHat() {
    const id = (function () { try { return localStorage.getItem(HAT_KEY); } catch (_) { return null; } })() || 'none';
    return isUnlocked(id) ? id : 'none';
  }
  function setActiveHat(id) {
    try { localStorage.setItem(HAT_KEY, id); } catch (_) {}
  }

  // Draws the active hat above a sprite.
  // (cx, topY) is the top-center of the sprite; pixelSize scales the hat.
  function drawHat(ctx, cx, topY, pixelSize) {
    const hat = HATS.find((h) => h.id === getActiveHat());
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
    isUnlocked: isUnlocked,
    getActiveHat: getActiveHat,
    setActiveHat: setActiveHat,
    drawHat: drawHat,
    trackSessionStart: trackSessionStart,
    submitScore: submitScore,
    HATS: HATS,
  };
})();
