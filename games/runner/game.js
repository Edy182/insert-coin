(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const godMode = params.has('god');
  let dailyMode = params.has('daily');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // crisp pixel-art rendering for sprite drawImage
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl    = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const restartBtn  = document.getElementById('restart');
  const shareBtn    = document.getElementById('share');
  const dailyBtn    = document.getElementById('daily');
  const muteBtn     = document.getElementById('mute');

  // Daily seed (mulberry32, public domain)
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
    if (s >= 3000) return 5;
    if (s >= 1500) return 4;
    if (s >= 800)  return 3;
    if (s >= 300)  return 2;
    if (s >= 100)  return 1;
    return 0;
  }
  function shareCard() {
    const tier = scoreTier(score);
    const squares = '🟧'.repeat(tier) + '⬛'.repeat(5 - tier);
    const rank = leaderboardResult && leaderboardResult.rank;
    const rankLine = rank ? `\nrank #${rank} ${dailyMode ? 'today' : 'all-time'}` : '';
    return `🦀 Dino — ${todayISO}\n${score} pts ${squares}${rankLine}\nInsert Coin`;
  }

  // === Constants ===
  const GROUND_Y       = H - 40;
  const GRAVITY        = 0.6;
  const JUMP_VELOCITY  = -12;
  const INITIAL_SPEED  = 5;
  const SPAWN_MIN_GAP  = 80;
  const NIGHT_DURATION = 700;

  // === Persistent state ===
  let highScore = parseInt(localStorage.getItem('clawd-runner-high') || '0', 10);
  highScoreEl.textContent = String(highScore).padStart(5, '0');
  let soundOn = true;
  const ONBOARDED_KEY = 'clawd-onboarded-runner';
  let isFirstPlay = !localStorage.getItem(ONBOARDED_KEY);

  // === Game state ===
  let player, obstacles, clouds, groundOffset;
  let score, scoreFrame, gameOver, gameSpeed, lastSpawn;
  let shieldFlash = 0;
  let obstaclesDodged = 0;
  let comboPopup = null; // { text, frames }
  let comboFlash = 0;    // frames of cream border pulse on combo trigger
  let leaderboardResult = null; // { rank, list } from Worker after submit
  let nightMode, nightTimer, stars, lastNightScore;
  let frameCount;
  let gameStarted;

  function reset() {
    player = { x: 80, y: GROUND_Y - 36, w: 48, h: 36, vy: 0, grounded: true, ducking: false };
    obstacles   = [];
    clouds      = [];
    groundOffset = 0;
    for (let i = 0; i < 4; i++) {
      clouds.push({ x: (i + 1) * (W / 4), y: 15 + rand() * 55 });
    }
    score          = 0;
    scoreFrame     = 0;
    frameCount     = 0;
    gameSpeed      = INITIAL_SPEED;
    gameOver       = false;
    lastSpawn      = 0;
    shieldFlash    = 0;
    obstaclesDodged = 0;
    comboPopup     = null;
    comboFlash     = 0;
    leaderboardResult = null;
    if (window.ClawdStats) window.ClawdStats.resetShield();
    nightMode      = false;
    nightTimer     = 0;
    lastNightScore = -1;
    stars          = [];
    gameStarted    = false;
    if (dailyMode) reseedFromToday();
    restartBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function jump() {
    if (gameOver) return reset();
    if (!gameStarted) {
      gameStarted = true;
      startMusic();
      if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; }
      if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'runner', dailyMode: dailyMode, dateISO: todayISO });
    }
    if (player.grounded) {
      player.vy = JUMP_VELOCITY;
      player.grounded = false;
      player.ducking  = false;
      playSound('jump');
    }
  }

  function duck(on) {
    if (gameOver) return;
    if (on && !gameStarted) gameStarted = true;
    player.ducking = on;
    if (on && !player.grounded) {
      player.vy = Math.max(player.vy, 5); // fast-fall
    }
  }

  // === Obstacle spawning ===
  function spawnObstacle() {
    const r = rand();
    let type;
    if      (r < 0.20) type = 'ptero';
    else if (r < 0.37) type = 'cactus_s';
    else if (r < 0.51) type = 'cactus_l';
    else if (r < 0.64) type = 'cactus_d';
    else if (r < 0.77) type = 'cactus_2s';
    else if (r < 0.89) type = 'cactus_2l';
    else                type = 'cactus_3s';

    const sizes = {
      cactus_s:  { w: 20, h: 36 },
      cactus_l:  { w: 24, h: 50 },
      cactus_d:  { w: 44, h: 36 },
      cactus_2s: { w: 44, h: 36 },
      cactus_2l: { w: 52, h: 50 },
      cactus_3s: { w: 68, h: 36 },
      ptero:     { w: 44, h: 26 },
    };
    const { w, h } = sizes[type];

    // Ptero: 3 heights
    //  low  → must jump over
    //  mid  → must duck under
    //  high → walk under freely
    let y = GROUND_Y - h;
    if (type === 'ptero') {
      const pteroHeights = [GROUND_Y - 28, GROUND_Y - 65, GROUND_Y - 105];
      y = pteroHeights[Math.floor(rand() * pteroHeights.length)];
    }

    obstacles.push({ x: W, y, w, h, type });
  }

  // === Update ===
  function update() {
    if (gameOver) return;

    // Duck state drives player height
    player.h = player.ducking ? 16 : 36;

    // Physics
    player.vy += GRAVITY;
    player.y  += player.vy;
    if (player.y >= GROUND_Y - player.h) {
      player.y       = GROUND_Y - player.h;
      player.vy      = 0;
      player.grounded = true;
    }

    // Until the player jumps/ducks for the first time, the world is frozen
    if (!gameStarted) return;

    // Clouds parallax
    for (let i = clouds.length - 1; i >= 0; i--) {
      clouds[i].x -= gameSpeed * 0.2;
      if (clouds[i].x < -80) clouds.splice(i, 1);
    }
    if (rand() < 0.004) clouds.push({ x: W + 20, y: 15 + rand() * 55 });

    groundOffset = (groundOffset + gameSpeed) % 60;

    // Spawn obstacles
    lastSpawn++;
    const spawnGap = Math.max(SPAWN_MIN_GAP - Math.floor(score / 100), 30);
    if (lastSpawn > spawnGap && rand() < 0.04) {
      spawnObstacle();
      lastSpawn = 0;
    }

    // Move + cull obstacles. Each one that scrolls off-screen counts as
    // "dodged" — every 10 dodges fires a STREAK +50 bonus.
    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= gameSpeed;
      if (obstacles[i].x + obstacles[i].w < 0) {
        obstacles.splice(i, 1);
        obstaclesDodged++;
        if (obstaclesDodged % 10 === 0) {
          const mult = (window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1;
          score += 50 * mult;
          comboPopup = { text: 'STREAK +' + (50 * mult), frames: 60 };
          comboFlash = 25;
          playSound('combo');
        }
      }
    }

    // Collision — wizard / ?god / active crown shield bypass.
    const wizardOn = window.ClawdStats && window.ClawdStats.isGodModeActive();
    const shieldOn = window.ClawdStats && window.ClawdStats.isShieldActive();
    if (!godMode && !wizardOn && !shieldOn) {
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        if (
          player.x             < obs.x + obs.w &&
          player.x + player.w  > obs.x &&
          player.y             < obs.y + obs.h &&
          player.y + player.h  > obs.y
        ) {
          endGame();
          return;
        }
      }
    } else if (shieldOn) {
      // Vaporize obstacles you touch while shielded — feels powerful.
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        if (
          player.x             < obs.x + obs.w &&
          player.x + player.w  > obs.x &&
          player.y             < obs.y + obs.h &&
          player.y + player.h  > obs.y
        ) {
          obstacles.splice(i, 1);
        }
      }
    }
    if (window.ClawdStats) window.ClawdStats.tickShield();

    frameCount++;

    // Score increments every 3 frames (~20 pts/sec at 60fps, matching Chrome dino pace)
    if (++scoreFrame % 3 === 0) {
      score += (window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1;
    }
    scoreEl.textContent = String(score).padStart(5, '0');

    // Speed up every 300 pts
    if (score > 0 && score % 300 === 0 && scoreFrame % 3 === 0) {
      gameSpeed += 0.3;
      playSound('milestone');
    }
    // Endless runners need celebration moments. Every 1000 pts = confetti burst.
    if (score > 0 && score % 1000 === 0 && scoreFrame % 3 === 0) {
      burstConfetti();
      comboPopup = { text: `${score} PTS!`, frames: 75 };
      comboFlash = 30;
      playSound('combo');
    }

    // Night mode every 700 pts — lasts NIGHT_DURATION frames
    const nightMilestone = Math.floor(score / 700) * 700;
    if (nightMilestone > 0 && nightMilestone !== lastNightScore) {
      lastNightScore = nightMilestone;
      nightMode  = true;
      nightTimer = NIGHT_DURATION;
      stars = Array.from({ length: 45 }, () => ({
        x: rand() * W,
        y: 6 + rand() * (GROUND_Y - 50),
        s: rand() < 0.25 ? 3 : 2,
      }));
    }
    if (nightMode && --nightTimer <= 0) nightMode = false;
  }

  // === End game ===
  function endGame() {
    gameOver = true;
    stopMusic();
    playSound('death');
    const beatHigh = score > highScore;
    if (beatHigh) {
      highScore = score;
      localStorage.setItem('clawd-runner-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    if (window.ClawdStats) window.ClawdStats.submitScore(
      { game: 'runner', score: score, dailyMode: dailyMode, dateISO: todayISO },
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
    // Claude-Radio-style monochrome environment: dark canvas, cream silhouettes
    // for the world, ONLY Clawd carries color. Day/night still flips the bg.
    const bg  = nightMode ? '#141413' : '#e0ddd0';
    const gnd = nightMode ? '#b0aea5' : '#54524a';
    const cld = nightMode ? '#5c5a52' : '#a8a59a';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Stars + moon
    if (nightMode) {
      ctx.fillStyle = '#faf9f5';
      for (const s of stars) ctx.fillRect(s.x, s.y, s.s, s.s);
      drawMoon(W - 80, 14);
    }

    // Clouds
    for (const c of clouds) drawCloud(c.x, c.y, cld);

    ctx.fillStyle = gnd;
    ctx.fillRect(0, GROUND_Y, W, 2);

    // Player
    if (player.ducking) drawClawdDuck(player.x, player.y);
    else                drawClawd(player.x, player.y);

    // Obstacles
    for (const obs of obstacles) drawObstacle(obs);

    // Crown shield activated — brief cream flash, then HUD bar.
    if (shieldFlash > 0) {
      shieldFlash--;
      ctx.fillStyle = `rgba(250, 249, 245, ${(shieldFlash / 30) * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Combo border pulse (cream rim flash)
    if (comboFlash > 0) {
      comboFlash--;
      const a = (comboFlash / 30) * 0.55;
      ctx.strokeStyle = `rgba(250, 249, 245, ${a})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.lineWidth = 1;
    }
    if (comboPopup) {
      comboPopup.frames--;
      if (comboPopup.frames <= 0) {
        comboPopup = null;
      } else {
        const alpha = Math.min(1, comboPopup.frames / 30);
        ctx.fillStyle = `rgba(250, 249, 245, ${alpha})`;
        ctx.font = 'bold 18px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        const lift = (60 - comboPopup.frames) * 0.5;
        ctx.fillText(comboPopup.text, W / 2, 90 - lift);
      }
    }
    if (window.ClawdStats && window.ClawdStats.hasShield()) {
      const x = W - 70, y = 14, w = 60, h = 6;
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

    // Ready overlay — wait for the first jump/duck
    if (!gameStarted && !gameOver) {
      ctx.fillStyle    = '#faf9f5';
      ctx.font         = '20px "Press Start 2P", monospace';
      ctx.textAlign    = 'center';
      ctx.fillText('READY!', W / 2, H / 2 - 6);
      ctx.fillStyle = '#535353';
      ctx.font      = '14px "VT323", monospace';
      ctx.fillText('Press SPACE or tap to start', W / 2, H / 2 + 18);
      if (isFirstPlay) {
        ctx.fillStyle = '#faf9f5';
        ctx.font = '12px "VT323", monospace';
        ctx.fillText('↑/SPACE jump  ·  ↓ duck', W / 2, H / 2 + 40);
      }
    }

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = '#faf9f5';
      ctx.font         = '24px "Press Start 2P", monospace';
      ctx.textAlign    = 'center';
      ctx.fillText('STACK OVERFLOW', W / 2, H / 2 - 10);
      ctx.fillStyle = '#faf9f5';
      ctx.font      = '14px "VT323", monospace';
      ctx.fillText(`Final score: ${score}`, W / 2, H / 2 + 20);
      let retryY = H / 2 + 50;
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
      ctx.fillText('Press SPACE or tap to retry', W / 2, retryY);
    }
  }

  // Clawd standing — 12×9 grid at P=4 = 48×36px (bumped from P=3 for more
  // visual presence). On gameOver, the dead variant draws chevron ">" "<"
  // marks instead of pupils (knocked-out look matching the toy reference).
  function drawClawd(x, y) {
    const P = 4;
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const B = (window.ClawdStats && window.ClawdStats.getActiveEyeColor()) || '#141413';
    const outline = window.ClawdStats && window.ClawdStats.getActiveOutlineColor();
    const _ = null;
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
    if (outline) {
      ctx.fillStyle = outline;
      const offs = [[-1,0],[1,0],[0,-1],[0,1]];
      grid.forEach((row, r) => row.forEach((col, c) => {
        if (col) for (const [dx, dy] of offs) ctx.fillRect(x + c*P + dx, y + r*P + dy, P, P);
      }));
    }
    grid.forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
    // Knocked-out eyes: two chevrons ">" and "<" pointing inward toward
    // each other (matching the reference toy art — they're NOT crossed Xs).
    if (gameOver) {
      ctx.strokeStyle = B;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const eyeY = y + 2 * P + P;
      const r = 5;
      const leftCx  = x + 3 * P + P / 2;
      const rightCx = x + 9 * P + P / 2;
      // Left ">" — tip points right (toward center)
      ctx.beginPath();
      ctx.moveTo(leftCx - r, eyeY - r);
      ctx.lineTo(leftCx + r, eyeY);
      ctx.lineTo(leftCx - r, eyeY + r);
      ctx.stroke();
      // Right "<" — tip points left (toward center)
      ctx.beginPath();
      ctx.moveTo(rightCx + r, eyeY - r);
      ctx.lineTo(rightCx - r, eyeY);
      ctx.lineTo(rightCx + r, eyeY + r);
      ctx.stroke();
    }
    if (window.ClawdStats) {
      window.ClawdStats.drawHat(ctx, x + 6 * P, y, P);
      window.ClawdStats.drawSparkles(ctx, x + 6 * P, y + 4 * P, 20);
    }
  }

  // Clawd ducking — 12×4 grid at P=4 = 48×16px (matches standing scale)
  function drawClawdDuck(x, y) {
    const P = 4;
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const B = (window.ClawdStats && window.ClawdStats.getActiveEyeColor()) || '#141413';
    const outline = window.ClawdStats && window.ClawdStats.getActiveOutlineColor();
    const _ = null;
    const grid = [
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ O,O,O,B,O,O,O,O,O,B,O,O ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
    ];
    if (outline) {
      ctx.fillStyle = outline;
      const offs = [[-1,0],[1,0],[0,-1],[0,1]];
      grid.forEach((row, r) => row.forEach((col, c) => {
        if (col) for (const [dx, dy] of offs) ctx.fillRect(x + c*P + dx, y + r*P + dy, P, P);
      }));
    }
    grid.forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Moon crescent — 5×5 at P=4 = 20×20px. Cream against dark sky.
  function drawMoon(x, y) {
    const P = 4, C = '#faf9f5', _ = null;
    [
      [ _,C,C,C,_ ],
      [ C,C,C,_,_ ],
      [ C,C,C,_,_ ],
      [ C,C,C,_,_ ],
      [ _,C,C,C,_ ],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Cloud — 3-bump shape ~55×15px
  function drawCloud(x, y, color) {
    ctx.fillStyle = color;
    const s = 5;
    [ [2,0],[3,0],[4,0],[5,0],[6,0],
      [1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],
    ].forEach(([c, r]) => ctx.fillRect(x + c*s, y + r*s, s, s));
  }

  // === Sprite loading ===
  // Cached tinted canvases: { day: HTMLCanvasElement, night: HTMLCanvasElement }
  const cactusSm  = { day: null, night: null };
  const cactusSmB = { day: null, night: null }; // variant B (left-arm-first)
  const cactusLg  = { day: null, night: null };

  let spritesReady = false;

  function tintSprite(img, sx, sy, sw, sh, color) {
    const tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = color;
    tc.fillRect(0, 0, sw, sh);
    return tmp;
  }

  function loadSprites() {
    let loaded = 0;
    const done = () => { if (++loaded === 2) { spritesReady = true; reset(); } };

    const sm = new Image();
    sm.onload = () => {
      cactusSm.day   = tintSprite(sm, 0,      0, 34, 70, '#4A7C4E');
      cactusSm.night = tintSprite(sm, 0,      0, 34, 70, '#6DBF72');
      cactusSmB.day   = tintSprite(sm, 4*34,  0, 34, 70, '#4A7C4E');
      cactusSmB.night = tintSprite(sm, 4*34,  0, 34, 70, '#6DBF72');
      done();
    };
    sm.onerror = done; // fall back to pixel art if missing
    sm.src = 'sprites/cactus_small.png';

    const lg = new Image();
    lg.onload = () => {
      cactusLg.day   = tintSprite(lg, 0, 0, 50, 100, '#4A7C4E');
      cactusLg.night = tintSprite(lg, 0, 0, 50, 100, '#6DBF72');
      done();
    };
    lg.onerror = done;
    lg.src = 'sprites/cactus_large.png';
  }

  // dw/dh = display size (scales from the cached tinted canvas)
  function blit(sheet, x, y, dw, dh) {
    const src = nightMode ? sheet.night : sheet.day;
    if (!src) return;
    ctx.drawImage(src, 0, 0, src.width, src.height, x, y, dw, dh);
  }

  const SW = 20, SH = 36;
  const LW = 24, LH = 50;

  // Small cactus — 10×18 at P=2 = 20×36px. Cream silhouette, 3-tone for depth.
  function drawCactusSm(x, y) {
    const P = 2;
    const L = nightMode ? '#e8e6dc' : '#3a3835'; // highlight
    const M = nightMode ? '#b0aea5' : '#5c5a52'; // mid body
    const D = nightMode ? '#5c5a52' : '#1a1a17'; // shadow / ridge
    const _ = null;
    [
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [L,M,_,L,M,M,M,_,L,M],
      [D,D,_,D,D,D,D,_,D,D],
      [L,M,_,L,M,M,M,_,L,M],
      [M,M,M,M,M,M,M,M,M,M],
      [M,M,M,M,M,M,M,M,M,M],
      [_,_,_,D,D,D,D,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,D,D,D,D,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
      [_,_,_,D,D,D,D,_,_,_],
      [_,_,_,L,M,M,M,_,_,_],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Large cactus — 12×25 at P=2 = 24×50px. Cream silhouette, 3-tone for depth.
  function drawCactusLg(x, y) {
    const P = 2;
    const L = nightMode ? '#e8e6dc' : '#3a3835';
    const M = nightMode ? '#b0aea5' : '#5c5a52';
    const D = nightMode ? '#5c5a52' : '#1a1a17';
    const _ = null;
    [
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [L,M,_,_,L,M,M,M,_,_,L,M],
      [D,D,_,_,D,D,D,D,_,_,D,D],
      [L,M,_,_,L,M,M,M,_,_,L,M],
      [L,M,_,_,L,M,M,M,_,_,L,M],
      [M,M,M,M,M,M,M,M,M,M,M,M],
      [M,M,M,M,M,M,M,M,M,M,M,M],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,D,D,D,D,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,D,D,D,D,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
      [_,_,_,_,D,D,D,D,_,_,_,_],
      [_,_,_,_,L,M,M,M,_,_,_,_],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Pterodactyl — 22×13 grid at P=2 = 44×26px. Cream silhouette.
  function drawPtero(x, y) {
    const P = 2;
    const C = nightMode ? '#b0aea5' : '#5c5a52';
    const D = nightMode ? '#5c5a52' : '#1a1a17';
    const _ = null;
    const wingFrame = Math.floor(frameCount / 18) % 2;
    const frames = [
      // Frame 0 — wings UP
      [
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,_,_,_,_,_,_,_],
        [C,C,C,C,C,C,C,C,C,C,C,C,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,D,C,C,C,C,C,C,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,C,C,_,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,C,_,_,_,_,_,_,_,_,_,_,_,_],
      ],
      // Frame 1 — wings DOWN
      [
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        [C,C,C,C,C,C,C,C,C,C,C,C,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,D,C,C,C,C,C,C,C,C,C,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,C,C,C,C,C,C,C,C,C,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,C,C,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,C,C,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C,C,C,C],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,C,C],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      ],
    ];
    frames[wingFrame].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Obstacles
  function drawObstacle(obs) {
    const { x, y, type } = obs;

    if (type === 'cactus_s') {
      drawCactusSm(x, y);

    } else if (type === 'cactus_l') {
      drawCactusLg(x, y);

    } else if (type === 'cactus_d' || type === 'cactus_2s') {
      drawCactusSm(x,        y);
      drawCactusSm(x+SW+4,   y);

    } else if (type === 'cactus_2l') {
      drawCactusLg(x,        y);
      drawCactusLg(x+LW+4,   y);

    } else if (type === 'cactus_3s') {
      drawCactusSm(x,            y);
      drawCactusSm(x+SW+4,       y);
      drawCactusSm(x+2*(SW+4),   y);

    } else {
      drawPtero(x, y);
    }
  }

  function loop() {
    update();
    if (confetti.length > 0) updateConfetti();
    draw();
    if (confetti.length > 0) drawConfetti();
    if (!gameOver || confetti.length > 0) requestAnimationFrame(loop);
  }

  // === Audio ===
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep({ freq = 440, freq2 = null, type = 'square', duration = 0.12, volume = 0.18, delay = 0 }) {
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

  // Runner music — upbeat pentatonic loop
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
    if (kind === 'jump') {
      beep({ freq: 220, freq2: 440, type: 'square', duration: 0.1, volume: 0.15 });
    } else if (kind === 'death') {
      beep({ freq: 440, freq2: 110, type: 'sawtooth', duration: 0.25, volume: 0.2 });
      beep({ freq: 220, freq2: 55,  type: 'sawtooth', duration: 0.25, volume: 0.15, delay: 0.2 });
    } else if (kind === 'milestone') {
      beep({ freq: 660, duration: 0.08, volume: 0.15 });
      beep({ freq: 880, duration: 0.08, volume: 0.15, delay: 0.1 });
    } else if (kind === 'combo') {
      // Ascending 3-note sparkle for streaks.
      beep({ freq: 784,  type: 'triangle', duration: 0.08, volume: 0.12 });
      beep({ freq: 988,  type: 'triangle', duration: 0.08, volume: 0.12, delay: 0.06 });
      beep({ freq: 1175, type: 'triangle', duration: 0.16, volume: 0.14, delay: 0.12 });
    }
  }

  // === Input ===
  let touchStartY = 0;

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown') { e.preventDefault(); duck(true); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      if (window.ClawdStats && window.ClawdStats.tryActivateShield()) {
        shieldFlash = 20;
        playSound('milestone');
      }
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'ArrowDown') duck(false);
  });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    touchStartY = e.touches[0].clientY;
    jump();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches[0].clientY - touchStartY > 20) duck(true);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    duck(false);
  }, { passive: false });
  // Left click = jump; right click held = duck.
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) jump();
    else if (e.button === 2) { e.preventDefault(); duck(true); }
  });
  canvas.addEventListener('mouseup', e => {
    if (e.button === 2) duck(false);
  });
  canvas.addEventListener('mouseleave', () => duck(false));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

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
    } catch (e) {}
  });
  if (dailyBtn) {
    dailyBtn.addEventListener('click', () => {
      dailyMode = !dailyMode;
      dailyBtn.textContent = dailyMode ? '📅 DAILY: ON' : '📅 DAILY';
      reset();
    });
    if (dailyMode) dailyBtn.textContent = '📅 DAILY: ON';
  }

  // === Boot ===
  loadSprites();
})();
