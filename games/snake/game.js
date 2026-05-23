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
  function shareCard() {
    const tier = scoreTier(score);
    const squares = '🟧'.repeat(tier) + '⬛'.repeat(5 - tier);
    return `🦀 Clawd Snake — ${todayISO}\n${score} pts ${squares}\nclawdbytes.com`;
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
  let soundOn = true;
  let highScore = parseInt(localStorage.getItem('clawd-snake-high') || '0', 10);
  const ONBOARDED_KEY = 'clawd-onboarded-snake';
  let isFirstPlay = !localStorage.getItem(ONBOARDED_KEY);

  // === Clawd head sprite (pre-rendered for crisp scaling) ===
  let clawdSprite = null;
  let clawdSpriteKey = null;
  function getClawdSprite() {
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#FF8A00';
    const B = (window.ClawdStats && window.ClawdStats.getActiveEyeColor()) || '#1A0808';
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
    spawnFood();
    restartBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
    scoreEl.textContent = '00000';
    highScoreEl.textContent = String(highScore).padStart(5, '0');
    requestAnimationFrame(loop);
  }

  const FOOD_COLORS = ['#FF8A1F', '#F5EFE0', '#3FCB7A', '#FFB6E1', '#4ED8E5', '#FFCD3C'];

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
    if (!gameStarted) return; // wait for the first arrow key
    frame++;
    if (frame % Math.floor(tickFrames) !== 0) return;

    // Apply queued direction unless it's an instant reverse of a multi-segment snake
    const reverse = nextDir.dc === -dir.dc && nextDir.dr === -dir.dr;
    if (snake.length === 1 || !reverse) dir = nextDir;

    const head = snake[0];
    const newHead = { c: head.c + dir.dc, r: head.r + dir.dr };

    // Wall collision (or wrap in god mode)
    if (newHead.c < 0 || newHead.c >= COLS || newHead.r < 0 || newHead.r >= ROWS) {
      if (!godMode && !(window.ClawdStats && window.ClawdStats.isGodModeActive())) { endGame(); return; }
      newHead.c = (newHead.c + COLS) % COLS;
      newHead.r = (newHead.r + ROWS) % ROWS;
    }

    // Self collision (any body cell, including last segment unless we're about to grow)
    const willGrow = newHead.c === food.c && newHead.r === food.r;
    const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
    if (bodyToCheck.some(s => s.c === newHead.c && s.r === newHead.r)) {
      if (!godMode && !(window.ClawdStats && window.ClawdStats.isGodModeActive())) { endGame(); return; }
    }

    snake.unshift(newHead);
    if (willGrow) {
      score += 10 * ((window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1);
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
    stopMusic();
    playSound(win ? 'win' : 'death');
    const beatHigh = score > highScore;
    if (beatHigh) {
      highScore = score;
      localStorage.setItem('clawd-snake-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    if (beatHigh || win) burstConfetti();
    if (window.ClawdStats) window.ClawdStats.submitScore({ game: 'snake', score: score, dailyMode: dailyMode, dateISO: todayISO });
    restartBtn.classList.remove('hidden');
    if (dailyMode) shareBtn.classList.remove('hidden');
  }

  // === Confetti (high-score celebration) ===
  const CONFETTI_COLORS = ['#FF8A1F', '#F5EFE0', '#3FCB7A', '#FFB6E1', '#4ED8E5', '#FFCD3C'];
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
    ctx.fillStyle = '#0B1426';
    ctx.fillRect(0, 0, W, H);

    // Subtle checker grid so movement reads clearly
    ctx.fillStyle = '#0F1F3D';
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if ((c + r) % 2 === 0) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // Food
    drawFood(food.c, food.r);

    // Body segments (tail first so head ends up on top of overlaps).
    // Each segment is an orange dot that tapers smaller toward the tail tip.
    for (let i = snake.length - 1; i > 0; i--) {
      drawBody(snake[i].c, snake[i].r, i, snake.length);
    }

    // Head: Clawd
    drawClawdHead(snake[0].c, snake[0].r);

    // Ready overlay — wait for the first arrow key
    if (!gameStarted && !gameOver) {
      ctx.fillStyle = '#FF8A1F';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', W / 2, H / 2 + 40);
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '12px "VT323", monospace';
      ctx.fillText('Press ARROW to start', W / 2, H / 2 + 64);
      if (isFirstPlay) {
        ctx.fillStyle = '#FF8A1F';
        ctx.font = '12px "VT323", monospace';
        ctx.fillText('Eat fruit  ·  don\'t bite yourself', W / 2, H / 2 + 86);
      }
    }

    // Game over / win overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FF8A1F';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(win ? 'BOARD CLEAR!' : 'STACK OVERFLOW', W / 2, H / 2 - 10);
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '14px "VT323", monospace';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 20);
      ctx.fillText('Press SPACE to retry', W / 2, H / 2 + 40);
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

  // Body segment — plain orange dot that tapers smaller toward the tail tip.
  function drawBody(c, r, idx, total) {
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    // t = 0 right behind head, 1 at the tail tip
    const t = (total <= 1) ? 0 : (idx - 1) / (total - 1);
    const radius = 8 - t * 3.5; // 8px → 4.5px
    const outline = window.ClawdStats && window.ClawdStats.getActiveOutlineColor();
    if (outline) {
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#FF8A00';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clawd head — pre-rendered 12×9 sprite scaled 1.25× via drawImage with smoothing off.
  function drawClawdHead(c, r) {
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    const src = getClawdSprite();
    const scale = 1.25;
    const w = src.width * scale;
    const h = src.height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    if (window.ClawdStats) {
      window.ClawdStats.drawHat(ctx, cx, cy - h / 2, 3);
      window.ClawdStats.drawSparkles(ctx, cx, cy, w / 2 + 4);
    }
  }

  function loop() {
    update();
    if (confetti.length > 0) updateConfetti();
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
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }
  // Shared arcade music — Runner's upbeat pentatonic loop across all 3 games
  const MUSIC_NOTES = [523, 587, 659, 784, 880, 784, 659, 587];
  let musicIdx = 0, musicTimer = null;
  function startMusic() {
    if (musicTimer || !soundOn) return;
    getAudioCtx();
    musicTimer = setInterval(() => {
      if (!soundOn) return;
      beep({ freq: MUSIC_NOTES[musicIdx], type: 'triangle', duration: 0.12, volume: 0.035 });
      musicIdx = (musicIdx + 1) % MUSIC_NOTES.length;
    }, 200);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function playSound(kind) {
    if (!soundOn) return;
    if (kind === 'eat') {
      beep({ freq: 660, freq2: 990, type: 'square', duration: 0.07, volume: 0.13 });
    } else if (kind === 'death') {
      beep({ freq: 440, freq2: 110, type: 'sawtooth', duration: 0.25, volume: 0.2 });
      beep({ freq: 220, freq2: 55,  type: 'sawtooth', duration: 0.25, volume: 0.15, delay: 0.2 });
    } else if (kind === 'win') {
      beep({ freq: 440, duration: 0.12, volume: 0.18 });
      beep({ freq: 660, duration: 0.12, volume: 0.18, delay: 0.13 });
      beep({ freq: 880, duration: 0.24, volume: 0.18, delay: 0.26 });
    }
  }

  // === Input ===
  document.addEventListener('keydown', e => {
    if (gameOver && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      reset();
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

  restartBtn.addEventListener('click', reset);
  muteBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 MUTED';
    if (!soundOn) stopMusic();
    else if (gameStarted && !gameOver) startMusic();
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
