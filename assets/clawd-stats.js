// Shared cross-game stats + cosmetic hat unlocks for Clawd Bytes.
// Loaded by the landing page and every game's index.html before game.js.
(function () {
  'use strict';

  const STATS_KEY = 'clawd-stats';
  const DEFAULTS = { totalGames: 0, dailiesDone: 0 };
  const DEFAULT_COLOR = '#FF8A00';

  // Body recolors. Highest-unlocked tier auto-applies. The shape of Clawd stays
  // identical — only the body color changes.
  const DARK_EYE  = '#1A0808';
  const LIGHT_EYE = '#F5EFE0';
  const SKINS = [
    { id: 'classic', name: 'CLASSIC', color: DEFAULT_COLOR, eyeColor: DARK_EYE,  requires: () => true,                 unlockHint: 'default' },
    { id: 'cyan',    name: 'CYAN',    color: '#4ED8E5',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 2,   unlockHint: '2 games' },
    { id: 'pink',    name: 'PINK',    color: '#FF5BA7',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 3,   unlockHint: '3 games' },
    { id: 'lime',    name: 'LIME',    color: '#34D399',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 5,   unlockHint: '5 games' },
    { id: 'red',     name: 'RED',     color: '#E5564B',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 7,   unlockHint: '7 games' },
    { id: 'gold',    name: 'GOLD',    color: '#FFCD3C',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 11,  unlockHint: '11 · rare' },
    { id: 'white',   name: 'WHITE',   color: '#F5F5F5',     eyeColor: DARK_EYE,  requires: (s) => s.totalGames >= 14,  unlockHint: '14 · rare' },
    { id: 'black',   name: 'BLACK',   color: '#3C3D5A',     eyeColor: LIGHT_EYE, requires: (s) => s.totalGames >= 22,  unlockHint: '22 · rare' },
  ];

  // Hat overlays. Highest-tier unlocked auto-applies.
  const HATS = [
    {
      id: 'crown',
      name: 'CROWN',
      requires: (s) => s.totalGames >= 9,
      unlockHint: '9 games',
      pixels: [
        [1, 0, 1, 0, 1],
        [1, 1, 1, 1, 1],
        [1, 3, 1, 3, 1],
      ],
      colors: { 1: '#FFCD3C', 3: '#E5564B' },
    },
    {
      id: 'wizard',
      name: 'WIZARD HAT',
      requires: (s) => s.totalGames >= 17,
      unlockHint: '17 games',
      sparkles: true,
      godMode: true,
      pixels: [
        [0, 0, 0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 1, 1, 1, 0],
        [0, 0, 0, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 0, 0, 0],
        [0, 0, 1, 4, 1, 1, 0, 0],
        [0, 1, 4, 3, 4, 1, 1, 0],
        [1, 1, 1, 4, 1, 1, 1, 1],
        [2, 2, 5, 5, 5, 2, 2, 2],
        [2, 2, 2, 2, 2, 2, 2, 2],
      ],
      colors: { 1: '#7C5DD3', 2: '#1F0F4A', 3: '#FFD93D', 4: '#FFE066', 5: '#FFCD3C' },
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
  // URL preview: ?skin=black and/or ?hat=wizard override what's drawn for the
  // current page only, without touching localStorage. Lets you see cosmetics
  // before earning them.
  function urlParam(name) {
    if (typeof window === 'undefined' || !window.location) return null;
    try { return new URLSearchParams(window.location.search).get(name); } catch (_) { return null; }
  }
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function lsSet(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) {}
  }
  // Returns the highest-tier unlocked skin (later items in SKINS are rarer).
  // Resolution order: URL preview > dev override > auto-unlocked.
  function getActiveSkin() {
    const preview = urlParam('skin');
    if (preview) {
      const match = SKINS.find((s) => s.id === preview);
      if (match) return match;
    }
    const dev = lsGet('clawd-dev-skin');
    if (dev) {
      const match = SKINS.find((s) => s.id === dev);
      if (match) return match;
    }
    const stats = read();
    let active = SKINS[0];
    for (const skin of SKINS) if (skin.requires(stats)) active = skin;
    return active;
  }
  function getActiveSkinColor() { return getActiveSkin().color; }
  function getActiveEyeColor()  { return getActiveSkin().eyeColor || DARK_EYE; }
  function isGodModeActive() {
    const hat = getActiveHat();
    return !!(hat && hat.godMode);
  }
  // Score multiplier for whatever cosmetic is active. Wizard = 2x; default = 1x.
  function getScoreMultiplier() {
    return isGodModeActive() ? 2 : 1;
  }
  // Dev API — persists overrides in localStorage so devs can iterate without
  // grinding unlocks.
  function devSetSkin(id) {
    if (id == null) lsSet('clawd-dev-skin', null);
    else lsSet('clawd-dev-skin', String(id));
  }
  function devSetHat(id) {
    if (id == null) lsSet('clawd-dev-hat', null);
    else lsSet('clawd-dev-hat', String(id));
  }
  function devSetGames(n) {
    const s = read();
    s.totalGames = Math.max(0, Math.floor(Number(n) || 0));
    write(s);
    return s;
  }
  function devClear() {
    lsSet('clawd-dev-skin', null);
    lsSet('clawd-dev-hat', null);
  }
  function devOverrides() {
    return { skin: lsGet('clawd-dev-skin'), hat: lsGet('clawd-dev-hat') };
  }
  // Returns the active hat (or null if none unlocked / explicitly cleared).
  // Resolution order: URL preview > dev override > auto-unlocked.
  function getActiveHat() {
    const preview = urlParam('hat');
    if (preview === '' || preview === 'none') return null;
    if (preview) {
      const match = HATS.find((h) => h.id === preview);
      if (match) return match;
    }
    const dev = lsGet('clawd-dev-hat');
    if (dev === 'none') return null;
    if (dev) {
      const match = HATS.find((h) => h.id === dev);
      if (match) return match;
    }
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

  // Returns the ids the user has already seen toasts for.
  const SEEN_KEY = 'clawd-seen-unlocks';
  function seenIds() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (_) { return []; }
  }
  function markSeen(ids) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch (_) {}
  }

  // Returns newly-unlocked skins/hats that haven't been celebrated yet.
  function findNewUnlocks() {
    const stats = read();
    const seen = new Set(seenIds());
    const out = [];
    SKINS.forEach((s) => { if (s.id !== 'classic' && s.requires(stats) && !seen.has(s.id)) out.push({ kind: 'skin', id: s.id, name: s.name, color: s.color }); });
    HATS.forEach((h) => { if (h.requires(stats) && !seen.has(h.id)) out.push({ kind: 'hat', id: h.id, name: h.name, color: h.colors && h.colors[1] }); });
    return out;
  }

  function injectToastStyle() {
    if (document.getElementById('clawd-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'clawd-toast-style';
    style.textContent =
      '.clawd-toast { position: fixed; top: 1.4rem; left: 50%; transform: translateX(-50%);' +
      ' background: #FF8A1F; color: #0B1426; font-family: "Press Start 2P", monospace;' +
      ' font-size: 0.7rem; padding: 0.85rem 1.2rem; border-radius: 6px; z-index: 9999;' +
      ' box-shadow: 0 6px 24px rgba(0,0,0,.55); display: flex; align-items: center; gap: 0.7rem;' +
      ' animation: clawd-toast-in .35s ease-out, clawd-toast-out .35s ease-in 3.4s forwards; }' +
      '.clawd-toast .swatch { width: 16px; height: 16px; border-radius: 3px; background: var(--c, #fff); }' +
      '@keyframes clawd-toast-in { from { opacity: 0; transform: translate(-50%, -22px); } to { opacity: 1; transform: translate(-50%, 0); } }' +
      '@keyframes clawd-toast-out { to { opacity: 0; transform: translate(-50%, -22px); } }';
    document.head.appendChild(style);
  }

  function showToast(item) {
    if (typeof document === 'undefined') return;
    injectToastStyle();
    const el = document.createElement('div');
    el.className = 'clawd-toast';
    if (item.color) el.style.setProperty('--c', item.color);
    const sw = document.createElement('span');
    sw.className = 'swatch';
    el.appendChild(sw);
    const txt = document.createElement('span');
    txt.textContent = (item.kind === 'hat' ? 'UNLOCKED CROWN' : 'NEW CLAWD: ' + item.name);
    el.appendChild(txt);
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
  }

  // Bumps totalGames every time the player starts a new game (each play counts,
  // not each page load). Fires a toast for any skin/hat the user just unlocked.
  // Each new tier is acknowledged once, ever.
  function trackSessionStart(opts) {
    const gameId = opts && opts.gameId;
    if (!gameId) return;
    increment('totalGames');
    if (opts.dailyMode) {
      const dailyKey = 'clawd-daily-counted-' + gameId + '-' + (opts.dateISO || new Date().toISOString().slice(0, 10));
      if (!localStorage.getItem(dailyKey)) {
        localStorage.setItem(dailyKey, '1');
        increment('dailiesDone');
      }
    }
    const fresh = findNewUnlocks();
    if (fresh.length === 0) return;
    fresh.forEach(function (item, idx) { setTimeout(function () { showToast(item); }, idx * 700); });
    const seen = new Set(seenIds());
    fresh.forEach(function (item) { seen.add(item.id); });
    markSeen(Array.from(seen));
  }

  // Wizard-hat sparkles. Games call this once per frame near Clawd's center; the
  // function no-ops unless the wizard hat is the active tier.
  function drawSparkles(ctx, cx, cy, radius) {
    const active = getActiveHat();
    if (!active || !active.sparkles) return;
    const t = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 90;
    const colors = ['#FFE066', '#F5F5F5', '#A78BFA'];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + t * 0.06;
      const r = radius + 4 + Math.sin(t * 0.12 + i * 1.3) * 3;
      const x = Math.round(cx + Math.cos(angle) * r);
      const y = Math.round(cy + Math.sin(angle) * r);
      const phase = (t * 0.5 + i * 1.7) % 6;
      if (phase > 3) continue;
      const alpha = (1 - phase / 3).toFixed(2);
      const color = colors[i % colors.length];
      const rgb = color === '#FFE066' ? '255, 224, 102'
                : color === '#F5F5F5' ? '245, 245, 245'
                : '167, 139, 250';
      ctx.fillStyle = 'rgba(' + rgb + ', ' + alpha + ')';
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillRect(x - 1, y, 3, 1);
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

  // Debug helper: force a toast to appear regardless of unlock state. Run
  // `ClawdStats.previewToast('cyan')` or `previewToast('wizard')` from the
  // browser console to verify the toast renders.
  function previewToast(id) {
    const skin = SKINS.find((s) => s.id === id);
    if (skin) { showToast({ kind: 'skin', id: id, name: skin.name, color: skin.color }); return true; }
    const hat = HATS.find((h) => h.id === id);
    if (hat)  { showToast({ kind: 'hat',  id: id, name: hat.name,  color: hat.colors && hat.colors[1] }); return true; }
    return false;
  }

  window.ClawdStats = {
    read: read,
    increment: increment,
    getActiveSkin: getActiveSkin,
    getActiveSkinColor: getActiveSkinColor,
    getActiveEyeColor: getActiveEyeColor,
    getActiveHat: getActiveHat,
    isGodModeActive: isGodModeActive,
    getScoreMultiplier: getScoreMultiplier,
    drawHat: drawHat,
    drawSparkles: drawSparkles,
    trackSessionStart: trackSessionStart,
    submitScore: submitScore,
    previewToast: previewToast,
    findNewUnlocks: findNewUnlocks,
    devSetSkin: devSetSkin,
    devSetHat: devSetHat,
    devSetGames: devSetGames,
    devClear: devClear,
    devOverrides: devOverrides,
    SKINS: SKINS,
    HATS: HATS,
    DEFAULT_COLOR: DEFAULT_COLOR,
  };
})();
