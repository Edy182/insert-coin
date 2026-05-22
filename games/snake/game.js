(() => {
  'use strict';

  const godMode = new URLSearchParams(location.search).has('god');

  // === Canvas ===
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl     = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const restartBtn  = document.getElementById('restart');
  const muteBtn     = document.getElementById('mute');

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
  let soundOn = true;
  let highScore = parseInt(localStorage.getItem('clawd-snake-high') || '0', 10);

  // === Clawd head sprite (pre-rendered for crisp scaling) ===
  let clawdSprite = null;
  function getClawdSprite() {
    if (clawdSprite) return clawdSprite;
    const P = 2, O = '#FF8A00', B = '#1A0808', _ = null;
    clawdSprite = document.createElement('canvas');
    clawdSprite.width  = 12 * P;
    clawdSprite.height = 9  * P;
    const sctx = clawdSprite.getContext('2d');
    [
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,B,O,O,O,O,O,B,O,_ ],
      [ _,O,O,B,O,O,O,O,O,B,O,_ ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ _,_,O,_,O,_,_,_,O,_,O,_ ],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { sctx.fillStyle = col; sctx.fillRect(c*P, r*P, P, P); }
    }));
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
    spawnFood();
    restartBtn.classList.add('hidden');
    scoreEl.textContent = '00000';
    highScoreEl.textContent = String(highScore).padStart(5, '0');
    requestAnimationFrame(loop);
  }

  function spawnFood() {
    let c, r, tries = 0;
    do {
      c = Math.floor(Math.random() * COLS);
      r = Math.floor(Math.random() * ROWS);
      tries++;
      if (tries > 500) break;
    } while (snake.some(s => s.c === c && s.r === r));
    food = { c, r };
  }

  // === Update ===
  function update() {
    if (gameOver) return;
    frame++;
    if (frame % Math.floor(tickFrames) !== 0) return;

    // Apply queued direction unless it's an instant reverse of a multi-segment snake
    const reverse = nextDir.dc === -dir.dc && nextDir.dr === -dir.dr;
    if (snake.length === 1 || !reverse) dir = nextDir;

    const head = snake[0];
    const newHead = { c: head.c + dir.dc, r: head.r + dir.dr };

    // Wall collision (or wrap in god mode)
    if (newHead.c < 0 || newHead.c >= COLS || newHead.r < 0 || newHead.r >= ROWS) {
      if (!godMode) { endGame(); return; }
      newHead.c = (newHead.c + COLS) % COLS;
      newHead.r = (newHead.r + ROWS) % ROWS;
    }

    // Self collision (any body cell, including last segment unless we're about to grow)
    const willGrow = newHead.c === food.c && newHead.r === food.r;
    const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
    if (bodyToCheck.some(s => s.c === newHead.c && s.r === newHead.r)) {
      if (!godMode) { endGame(); return; }
    }

    snake.unshift(newHead);
    if (willGrow) {
      score += 10;
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
    playSound(win ? 'win' : 'death');
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('clawd-snake-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    restartBtn.classList.remove('hidden');
  }

  // === Draw ===
  function draw() {
    // Background
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

    // Body segments (tail first so head ends up on top of overlaps)
    for (let i = snake.length - 1; i > 0; i--) {
      drawBody(snake[i].c, snake[i].r);
    }

    // Head: Clawd
    drawClawdHead(snake[0].c, snake[0].r);

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

  // Green "commit" with a tiny check mark — Clawd grows by eating code commits.
  function drawFood(c, r) {
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    ctx.fillStyle = '#3FCB7A';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    // Pixel check mark in dark navy on top
    ctx.fillStyle = '#0B1426';
    ctx.fillRect(cx - 4, cy + 0, 2, 2);
    ctx.fillRect(cx - 2, cy + 2, 2, 2);
    ctx.fillRect(cx + 0, cy + 0, 2, 2);
    ctx.fillRect(cx + 2, cy - 2, 2, 2);
    ctx.fillRect(cx + 4, cy - 4, 2, 2);
  }

  // Body segment — orange rounded block with a small dark stripe and eyes,
  // so each segment reads as a mini-Clawd following the head.
  function drawBody(c, r) {
    const x = c * TILE + 2;
    const y = r * TILE + 2;
    const size = TILE - 4;
    ctx.fillStyle = '#FF8A00';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#C26500';
    ctx.fillRect(x + 2, y + 2, size - 4, 2);
    ctx.fillRect(x + 2, y + size - 4, size - 4, 2);
    // Two tiny eyes
    ctx.fillStyle = '#1A0808';
    ctx.fillRect(x + 6,  y + 9, 2, 2);
    ctx.fillRect(x + 12, y + 9, 2, 2);
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
  }

  function loop() {
    update();
    draw();
    if (!gameOver) requestAnimationFrame(loop);
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
    if      (e.code === 'ArrowUp'    || e.code === 'KeyW') { nextDir = { dc:  0, dr: -1 }; e.preventDefault(); }
    else if (e.code === 'ArrowDown'  || e.code === 'KeyS') { nextDir = { dc:  0, dr:  1 }; e.preventDefault(); }
    else if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { nextDir = { dc: -1, dr:  0 }; e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { nextDir = { dc:  1, dr:  0 }; e.preventDefault(); }
  });

  restartBtn.addEventListener('click', reset);
  muteBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 MUTED';
  });

  // === Boot ===
  reset();
})();
