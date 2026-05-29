(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const godMode = params.has('god');
  let dailyMode = params.has('daily');

  // === Canvas ===
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl     = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const restartBtn  = document.getElementById('restart');
  const shareBtn    = document.getElementById('share');
  const dailyBtn    = document.getElementById('daily');
  const muteBtn     = document.getElementById('mute');

  // Daily seed → deterministic randomness (mulberry32, public domain)
  const todayISO = new Date().toISOString().slice(0, 10);
  let seedState = 0;
  function reseedFromToday() {
    seedState = 0;
    for (let i = 0; i < todayISO.length; i++) seedState = (seedState * 31 + todayISO.charCodeAt(i)) >>> 0;
  }
  reseedFromToday();
  function rand() {
    if (!dailyMode) return Math.random();
    seedState = (seedState + 0x6D2B79F5) | 0;
    let t = seedState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function scoreTier(s) {
    if (s >= 400) return 5;
    if (s >= 200) return 4;
    if (s >= 100) return 3;
    if (s >= 50)  return 2;
    if (s >= 10)  return 1;
    return 0;
  }
  const LAUNCH_DATE_ISO = '2026-05-24';
  function dailyNumber() {
    const launch = Date.parse(LAUNCH_DATE_ISO + 'T00:00:00Z');
    const today  = Date.parse(todayISO + 'T00:00:00Z');
    return Math.max(1, Math.floor((today - launch) / 86400000) + 1);
  }

  function shareCard() {
    const rank  = leaderboardResult && leaderboardResult.rank;
    const total = leaderboardResult && leaderboardResult.list && leaderboardResult.list.length;
    // Narrative track: snake length as 🟩 segments + 🍎 apples eaten + 💀 if dead.
    // Cap at 18 segments total so the card stays compact.
    const apples = Math.max(0, snake.length - 3); // initial length is 3
    const bodyShown = Math.min(snake.length, 12);
    const applesShown = Math.min(apples, 6);
    const trackStr = '🟩'.repeat(bodyShown) + '🍎'.repeat(applesShown) + (gameOver && !win ? '💀' : (win ? '🏆' : ''));
    const rankLine = rank ? ` · #${rank}${total ? `/${total}` : ''} ${dailyMode ? 'today' : 'all-time'}` : '';
    const PROD_HOST = 'insert-coin.vercel.app';
    const params = new URLSearchParams({ g: 'snake', s: String(score) });
    if (rank)       params.set('r',  String(rank));
    if (total)      params.set('n',  String(total));
    if (dailyMode)  params.set('dt', todayISO);
    const url = `https://${PROD_HOST}/d?${params.toString()}`;
    const dailyLabel = dailyMode ? `daily #${dailyNumber()}` : 'all-time';
    return `🕹️ INSERT COIN · Snake ${dailyLabel}\n${score} pts${rankLine}\n${trackStr}\n${url}`;
  }

  // === Constants ===
  const COLS = 21;
  const ROWS = 21;
  const TILE = 24;
  const TICK_START = 8;     // frames per move
  const TICK_MIN   = 3;     // fastest tick after many foods
  const TICK_DECAY = 0.2;   // tick frames removed per food

  // === State ===
  let snake;       // [{ c, r }, ...] head is index 0
  let dir;         // { dc, dr } current direction
  let nextDir;     // queued direction (applied at next tick)
  let food;        // { c, r }
  let score, gameOver, win;
  let frame, tickFrames;
  let gameStarted; // false until the first arrow key
  let shieldFlash;      // frames of cream flash after activating the shield
  let foodEaten;        // total food eaten — drives the streak bonus
  let comboPopup;       // { text, frames }
  let comboFlash;       // frames of cream border pulse when a streak fires
  let leaderboardResult; // { rank, list } from Worker after submit
  let highScore = parseInt(localStorage.getItem('clawd-snake-high') || '0', 10);
  const ONBOARDED_KEY = 'clawd-onboarded-snake';
  let isFirstPlay = !localStorage.getItem(ONBOARDED_KEY);

  // === Clawd head sprite (pre-rendered for crisp scaling) ===
  let clawdSprite = null;
  let clawdSpriteKey = null;
  function getClawdSprite() {
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const B = (window.ClawdStats && window.ClawdStats.getActiveEyeColor()) || '#141413';
    const outline = window.ClawdStats && window.ClawdStats.getActiveOutlineColor();
    const key = O + '|' + B + '|' + (outline || '');
    if (clawdSprite && clawdSpriteKey === key) return clawdSprite;
    const P = 2, _ = null;
    const pad = outline ? 1 : 0;
    clawdSprite = document.createElement('canvas');
    clawdSprite.width  = 12 * P + 2 * pad;
    clawdSprite.height = 9  * P + 2 * pad;
    const sctx = clawdSprite.getContext('2d');
    const grid = [
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
    if (outline) {
      sctx.fillStyle = outline;
      const offs = [[-1,0],[1,0],[0,-1],[0,1]];
      grid.forEach((row, r) => row.forEach((col, c) => {
        if (col) for (const [dx, dy] of offs) sctx.fillRect(c*P + pad + dx, r*P + pad + dy, P, P);
      }));
    }
    grid.forEach((row, r) => row.forEach((col, c) => {
      if (col) { sctx.fillStyle = col; sctx.fillRect(c*P + pad, r*P + pad, P, P); }
    }));
    clawdSpriteKey = key;
    return clawdSprite;
  }

  // === Reset ===
  function reset() {
    snake = [
      { c: 10, r: 10 },
      { c:  9, r: 10 },
      { c:  8, r: 10 },
    ];
    dir     = { dc: 1, dr: 0 };
    nextDir = { dc: 1, dr: 0 };
    score = 0;
    frame = 0;
    tickFrames = TICK_START;
    gameOver = false;
    win = false;
    gameStarted = false;
    shieldFlash = 0;
    foodEaten = 0;
    comboPopup = null;
    comboFlash = 0;
    leaderboardResult = null;
    if (window.ClawdStats) window.ClawdStats.resetShield();
    spawnFood();
    restartBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
    scoreEl.textContent = '00000';
    highScoreEl.textContent = String(highScore).padStart(5, '0');
    requestAnimationFrame(loop);
  }

  // Grayscale food with subtle shade variation — pure Claude-Radio aesthetic.
  // The colorful snake (Clawd) is the only colored thing on the board.
  const FOOD_COLORS = ['#faf9f5', '#e8e6dc', '#b0aea5'];

  function spawnFood() {
    let c, r, tries = 0;
    do {
      c = Math.floor(rand() * COLS);
      r = Math.floor(rand() * ROWS);
      tries++;
      if (tries > 500) break;
    } while (snake.some(s => s.c === c && s.r === r));
    const color = FOOD_COLORS[Math.floor(rand() * FOOD_COLORS.length)];
    food = { c, r, color };
  }

  // === Update ===
  function update() {
    if (gameOver) return;
    if (window.ClawdStats) window.ClawdStats.tickShield();
    if (!gameStarted) return; // wait for the first arrow key
    frame++;
    if (frame % Math.floor(tickFrames) !== 0) return;

    // Apply queued direction unless it's an instant reverse of a multi-segment snake
    const reverse = nextDir.dc === -dir.dc && nextDir.dr === -dir.dr;
    if (snake.length === 1 || !reverse) dir = nextDir;

    const head = snake[0];
    const newHead = { c: head.c + dir.dc, r: head.r + dir.dr };

    // Wall + self collision: wizard / ?god / active crown shield all bypass.
    const wizardOn = window.ClawdStats && window.ClawdStats.isGodModeActive();
    const shieldOn = window.ClawdStats && window.ClawdStats.isShieldActive();
    const invuln  = godMode || wizardOn || shieldOn;
    if (newHead.c < 0 || newHead.c >= COLS || newHead.r < 0 || newHead.r >= ROWS) {
      if (!invuln) { endGame(); return; }
      newHead.c = (newHead.c + COLS) % COLS;
      newHead.r = (newHead.r + ROWS) % ROWS;
    }

    // Self collision (any body cell, including last segment unless we're about to grow)
    const willGrow = newHead.c === food.c && newHead.r === food.r;
    const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
    if (bodyToCheck.some(s => s.c === newHead.c && s.r === newHead.r)) {
      if (!invuln) { endGame(); return; }
    }

    snake.unshift(newHead);
    if (willGrow) {
      const mult = (window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1;
      score += 10 * mult;
      foodEaten++;
      // Every 5 food = STREAK +50 bonus.
      if (foodEaten % 5 === 0) {
        score += 50 * mult;
        comboPopup = { text: 'STREAK +' + (50 * mult), frames: 60 };
        comboFlash = 25;
        playSound('combo');
      }
      tickFrames = Math.max(TICK_MIN, tickFrames - TICK_DECAY);
      playSound('eat');
      if (snake.length >= COLS * ROWS) {
        win = true;
        endGame();
        return;
      }
      spawnFood();
    } else {
      snake.pop();
    }

    scoreEl.textContent = String(score).padStart(5, '0');
  }

  function endGame() {
    gameOver = true;
    // Music keeps playing across death/win → retry (continuity over interruption).
    // Only the mute button stops it.
    playSound(win ? 'win' : 'death');
    const beatHigh = score > highScore;
    if (beatHigh) {
      highScore = score;
      localStorage.setItem('clawd-snake-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    if (win) burstConfetti();
    if (window.ClawdStats) window.ClawdStats.submitScore(
      { game: 'snake', score: score, dailyMode: dailyMode, dateISO: todayISO },
      function (data) { leaderboardResult = data; }
    );
    restartBtn.classList.remove('hidden');
    if (dailyMode) shareBtn.classList.remove('hidden');
  }

  // === Confetti (high-score celebration) ===
  const CONFETTI_COLORS = ['#d97757', '#faf9f5', '#e8e6dc', '#b0aea5', '#8a8880', '#c2c0b7'];
  let confetti = [];
  function burstConfetti() {
    for (let i = 0; i < 80; i++) {
      confetti.push({
        x: Math.random() * W,
        y: -10 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 4,
        vy: 1 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.25,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: 220,
      });
    }
  }
  function updateConfetti() {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.rot += p.vrot;
      p.life--;
      if (p.life <= 0 || p.y > H + 20) confetti.splice(i, 1);
    }
  }
  function drawConfetti() {
    for (const p of confetti) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
  }

  // === Draw ===
  function draw() {
    // Pure black canvas — Claude Radio aesthetic. No checker noise.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // Food
    drawFood(food.c, food.r);

    // Body segments (tail first so head ends up on top of overlaps).
    // Each segment is an orange dot that tapers smaller toward the tail tip.
    for (let i = snake.length - 1; i > 0; i--) {
      drawBody(snake[i].c, snake[i].r, i, snake.length);
    }

    // Head: Clawd
    drawClawdHead(snake[0].c, snake[0].r);

    // Crown shield activated — brief cream pulse so it reads.
    if (shieldFlash > 0) {
      shieldFlash--;
      ctx.fillStyle = `rgba(250, 249, 245, ${(shieldFlash / 30) * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Combo border pulse (cream rim flash, fades over 25 frames)
    if (comboFlash > 0) {
      comboFlash--;
      const a = (comboFlash / 25) * 0.55;
      ctx.strokeStyle = `rgba(250, 249, 245, ${a})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.lineWidth = 1;
    }

    // Combo popup (floats up, fades out)
    if (comboPopup) {
      comboPopup.frames--;
      if (comboPopup.frames <= 0) {
        comboPopup = null;
      } else {
        const alpha = Math.min(1, comboPopup.frames / 30);
        ctx.fillStyle = `rgba(250, 249, 245, ${alpha})`;
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        const lift = (60 - comboPopup.frames) * 0.5;
        ctx.fillText(comboPopup.text, W / 2, 100 - lift);
      }
    }

    // Crown shield HUD — small bar bottom-right when the player has it.
    if (window.ClawdStats && window.ClawdStats.hasShield()) {
      const x = W - 60, y = H - 18, w = 50, h = 6;
      ctx.fillStyle = 'rgba(176, 174, 165, 0.25)';
      ctx.fillRect(x, y, w, h);
      const active = window.ClawdStats.isShieldActive();
      const frac = active ? window.ClawdStats.shieldActiveFrac() : window.ClawdStats.shieldReadyFrac();
      ctx.fillStyle = active ? '#faf9f5' : (frac >= 1 ? '#d4a85f' : '#788c5d');
      ctx.fillRect(x, y, w * frac, h);
      ctx.fillStyle = '#b0aea5';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(active ? 'SHIELD' : (frac >= 1 ? 'SHIFT' : ''), x + w, y - 2);
    }

    // Ready overlay — wait for the first arrow key
    if (!gameStarted && !gameOver) {
      ctx.fillStyle = '#faf9f5';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', W / 2, H / 2 + 40);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '12px "VT323", monospace';
      ctx.fillText('Press ARROW to start', W / 2, H / 2 + 64);
      if (isFirstPlay) {
        ctx.fillStyle = '#faf9f5';
        ctx.font = '12px "VT323", monospace';
        ctx.fillText('Eat fruit  ·  don\'t bite yourself', W / 2, H / 2 + 86);
      }
    }

    // Game over / win overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(win ? 'BOARD CLEAR!' : 'STACK OVERFLOW', W / 2, H / 2 - 10);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '14px "VT323", monospace';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 20);
      let retryY = H / 2 + 55;
      if (leaderboardResult && leaderboardResult.rank) {
        const rankLabel = `★ RANK #${leaderboardResult.rank} ${dailyMode ? 'TODAY' : 'ALL-TIME'} ★`;
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        const metrics = ctx.measureText(rankLabel);
        const pillW = metrics.width + 24, pillH = 26;
        ctx.fillStyle = 'rgba(216, 168, 95, 0.18)';
        ctx.fillRect(W / 2 - pillW / 2, retryY - 18, pillW, pillH);
        ctx.fillStyle = '#d4a85f';
        ctx.fillText(rankLabel, W / 2, retryY);
        ctx.font = '14px "VT323", monospace';
        ctx.fillStyle = '#faf9f5';
        retryY += 30;
      }
      ctx.fillText('Press SPACE to retry', W / 2, retryY);
    }
  }

  // Food — solid colored ball, color picked at spawn time.
  function drawFood(c, r) {
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    ctx.fillStyle = food.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body segment — a centred square that tapers smaller toward the tail
  // (idx 1 = just behind the head, idx total-1 = tail tip). Shrinking also
  // widens the gap between blocks, so divisions stay clearly visible.
  function drawBody(c, r, idx, total) {
    const x = c * TILE;
    const y = r * TILE;
    ctx.fillStyle = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const t = total > 1 ? idx / total : 0;     // 0 near head → ~1 at tail
    const maxSize = TILE - 2;                   // 22px just behind the head
    const minSize = 7;                          // tail tip
    const size = maxSize - t * (maxSize - minSize);
    const off = (TILE - size) / 2;
    ctx.fillRect(x + off, y + off, size, size);
  }

  // Snake head — the real Clawd sprite (12×9 grid from the other games),
  // scaled at P=2 to ~24×18 and centred in the tile. Alive draws Clawd's
  // eyes; gameOver swaps them for ">" "<" knocked-out chevrons.
  function drawClawdHead(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const B = (window.ClawdStats && window.ClawdStats.getActiveEyeColor()) || '#141413';
    const _ = null;
    const P = 2;
    const oy = y + 3; // centre the 18px-tall sprite in the 24px tile
    const grid = gameOver ? [
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,_,O,_,O,_,_,_,O,_,O,_ ],
    ] : [
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
    for (let gy = 0; gy < grid.length; gy++) {
      for (let gx = 0; gx < grid[gy].length; gx++) {
        const col = grid[gy][gx];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x + gx * P, oy + gy * P, P, P); }
      }
    }
    if (gameOver) {
      drawXEyeMark(x + 3 * P + P / 2, oy + 2 * P + P, true);   // left ">"
      drawXEyeMark(x + 9 * P + P / 2, oy + 2 * P + P, false);  // right "<"
    }

    if (window.ClawdStats) {
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      window.ClawdStats.drawHat(ctx, cx, y, 3);
      window.ClawdStats.drawSparkles(ctx, cx, cy, TILE / 2 + 4);
    }
  }

  // Knocked-out chevron eye: ">" when pointsRight, "<" otherwise. Matches
  // the reference toy art — two angle brackets pointing inward, NOT crossed
  // Xs. Each eye is a single 3-point path with a shared center vertex.
  function drawXEyeMark(cx, cy, pointsRight) {
    ctx.strokeStyle = '#1A0808';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ax = Math.round(cx), ay = Math.round(cy);
    const r = 2;
    ctx.beginPath();
    if (pointsRight) {
      ctx.moveTo(ax - r, ay - r);
      ctx.lineTo(ax + r, ay);
      ctx.lineTo(ax - r, ay + r);
    } else {
      ctx.moveTo(ax + r, ay - r);
      ctx.lineTo(ax - r, ay);
      ctx.lineTo(ax + r, ay + r);
    }
    ctx.stroke();
  }

  // Fixed-timestep loop: run game logic at exactly 60Hz regardless of the
  // monitor's refresh rate. Without this, 144Hz monitors run the game 2.4×
  // too fast and 30Hz throttled tabs run it half-speed. Render still
  // happens at native refresh rate (smooth visuals, deterministic logic).
  const FIXED_DT = 1000 / 120;
  const MAX_STEPS_PER_FRAME = 5;
  let _lastFrameTime = null;
  let _timeAccum = 0;

  function loop(now) {
    if (typeof now !== 'number') now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (_lastFrameTime === null) {
      _lastFrameTime = now;
      if (!gameOver || confetti.length > 0) requestAnimationFrame(loop);
      return;
    }
    const frameMs = Math.min(now - _lastFrameTime, 250);
    _lastFrameTime = now;
    _timeAccum += frameMs;

    let steps = 0;
    while (_timeAccum >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      update();
      if (confetti.length > 0) updateConfetti();
      _timeAccum -= FIXED_DT;
      steps++;
    }
    if (_timeAccum >= FIXED_DT * MAX_STEPS_PER_FRAME) _timeAccum = 0;

    draw();
    if (confetti.length > 0) drawConfetti();
    if (!gameOver || confetti.length > 0) requestAnimationFrame(loop);
  }

  // === Audio (chiptune beeps, original frequencies) ===
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep({ freq = 440, freq2 = null, type = 'square', duration = 0.1, volume = 0.15, delay = 0 }) {
    const ac = getAudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    const t = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2 !== null) osc.frequency.linearRampToValueAtTime(freq2, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (_) {} };
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }
  // Snake music — pool of mellow SINE-wave melodies (mid register), one
  // picked at random and re-rolled each loop. Sine stays distinct from
  // Dino's triangle and Mac-Pan's square, calm and smooth (not buzzy).
  // Background music — shared ClawdMusic player (shuffle + crossfade +
  // fade-in/out + persistent mute + pause-on-hidden).
  const music = window.ClawdMusic.init({
    tracks: [
      // '../../assets/sounds/snake-bg-1.mp3',  // off — single-track per game v1
      // '../../assets/sounds/snake-bg-2.mp3',  // off
      '../../assets/sounds/snake-bg-3.mp3',
    ],
    volume: 0.3,
  });
  function startMusic() { music.start(); }
  function stopMusic()  { music.stop();  }

  // SFX always play — mute button only toggles music.
  function playSound(kind) {
    if (kind === 'eat') {
      beep({ freq: 660, freq2: 990, type: 'square', duration: 0.07, volume: 0.13 });
    } else if (kind === 'death') {
      beep({ freq: 440, freq2: 110, type: 'sawtooth', duration: 0.25, volume: 0.2 });
      beep({ freq: 220, freq2: 55,  type: 'sawtooth', duration: 0.25, volume: 0.15, delay: 0.2 });
    } else if (kind === 'win') {
      beep({ freq: 440, duration: 0.12, volume: 0.18 });
      beep({ freq: 660, duration: 0.12, volume: 0.18, delay: 0.13 });
      beep({ freq: 880, duration: 0.24, volume: 0.18, delay: 0.26 });
    } else if (kind === 'combo') {
      // Ascending 3-note sparkle for streak bonuses.
      beep({ freq: 784,  type: 'triangle', duration: 0.08, volume: 0.12 });
      beep({ freq: 988,  type: 'triangle', duration: 0.08, volume: 0.12, delay: 0.06 });
      beep({ freq: 1175, type: 'triangle', duration: 0.16, volume: 0.14, delay: 0.12 });
    }
  }

  // === Input ===
  document.addEventListener('keydown', e => {
    if (gameOver && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      reset();
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      if (window.ClawdStats && window.ClawdStats.tryActivateShield()) {
        shieldFlash = 20;
        playSound('eat');
      }
      return;
    }
    let queued = null;
    if      (e.code === 'ArrowUp'    || e.code === 'KeyW') queued = { dc:  0, dr: -1 };
    else if (e.code === 'ArrowDown'  || e.code === 'KeyS') queued = { dc:  0, dr:  1 };
    else if (e.code === 'ArrowLeft'  || e.code === 'KeyA') queued = { dc: -1, dr:  0 };
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') queued = { dc:  1, dr:  0 };
    if (queued) {
      nextDir = queued;
      if (!gameStarted) { gameStarted = true; dir = queued; startMusic(); if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; } if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'snake', dailyMode: dailyMode, dateISO: todayISO }); }
      e.preventDefault();
    }
  });

  // Mobile touch: swipe to set direction
  let touchStartX = 0, touchStartY = 0;
  canvas.addEventListener('touchstart', e => {
    if (gameOver) { reset(); return; }
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    if (e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    const queued = Math.abs(dx) > Math.abs(dy)
      ? { dc: dx > 0 ? 1 : -1, dr: 0 }
      : { dc: 0, dr: dy > 0 ? 1 : -1 };
    nextDir = queued;
    if (!gameStarted) { gameStarted = true; dir = queued; startMusic(); if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; } if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'snake', dailyMode: dailyMode, dateISO: todayISO }); }
    e.preventDefault();
  }, { passive: false });

  // Mouse: click starts the game, mousemove continuously steers the snake.
  function mouseDir(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (W / rect.width);
    const cy = (e.clientY - rect.top)  * (H / rect.height);
    const head = snake[0];
    const hx = head.c * TILE + TILE / 2;
    const hy = head.r * TILE + TILE / 2;
    const dx = cx - hx;
    const dy = cy - hy;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return null;
    return Math.abs(dx) > Math.abs(dy)
      ? { dc: dx > 0 ? 1 : -1, dr: 0 }
      : { dc: 0, dr: dy > 0 ? 1 : -1 };
  }
  canvas.addEventListener('click', e => {
    if (gameOver) { reset(); return; }
    const queued = mouseDir(e);
    if (!queued) return;
    nextDir = queued;
    if (!gameStarted) {
      gameStarted = true; dir = queued; startMusic();
      if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; }
      if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'snake', dailyMode: dailyMode, dateISO: todayISO });
    }
  });
  canvas.addEventListener('mousemove', e => {
    if (!gameStarted || gameOver) return;
    const queued = mouseDir(e);
    if (queued) nextDir = queued;
  });

  restartBtn.addEventListener('click', reset);
  function renderMuteBtn() { muteBtn.textContent = music.isMuted() ? '🔇 MUSIC' : '🔊 MUSIC'; }
  renderMuteBtn();
  muteBtn.addEventListener('click', () => {
    const nowMuted = music.toggle();
    renderMuteBtn();
    if (!nowMuted && gameStarted && !gameOver) startMusic();
  });
  shareBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareCard());
      shareBtn.textContent = '✓ COPIED!';
      setTimeout(() => { shareBtn.textContent = '📋 COPY SHARE'; }, 1500);
    } catch (e) { /* ignore */ }
  });
  if (dailyBtn) {
    dailyBtn.addEventListener('click', () => {
      dailyMode = !dailyMode;
      dailyBtn.textContent = dailyMode ? '📅 DAILY: ON' : '📅 DAILY';
      reseedFromToday();
      reset();
    });
    if (dailyMode) dailyBtn.textContent = '📅 DAILY: ON';
  }

  // === Boot ===
  reset();
})();
