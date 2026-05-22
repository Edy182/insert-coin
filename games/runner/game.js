(() => {
  'use strict';

  const godMode = new URLSearchParams(location.search).has('god');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl    = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const restartBtn  = document.getElementById('restart');
  const muteBtn     = document.getElementById('mute');

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

  // === Game state ===
  let player, obstacles, clouds, groundOffset;
  let score, scoreFrame, gameOver, gameSpeed, lastSpawn;
  let nightMode, nightTimer, stars, lastNightScore;
  let frameCount;

  function reset() {
    player = { x: 80, y: GROUND_Y - 27, w: 36, h: 27, vy: 0, grounded: true, ducking: false };
    obstacles   = [];
    clouds      = [];
    groundOffset = 0;
    for (let i = 0; i < 4; i++) {
      clouds.push({ x: (i + 1) * (W / 4), y: 15 + Math.random() * 55 });
    }
    score          = 0;
    scoreFrame     = 0;
    frameCount     = 0;
    gameSpeed      = INITIAL_SPEED;
    gameOver       = false;
    lastSpawn      = 0;
    nightMode      = false;
    nightTimer     = 0;
    lastNightScore = -1;
    stars          = [];
    restartBtn.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function jump() {
    if (gameOver) return reset();
    if (player.grounded) {
      player.vy = JUMP_VELOCITY;
      player.grounded = false;
      player.ducking  = false;
      playSound('jump');
    }
  }

  function duck(on) {
    if (gameOver) return;
    player.ducking = on;
    if (on && !player.grounded) {
      player.vy = Math.max(player.vy, 5); // fast-fall
    }
  }

  // === Obstacle spawning ===
  function spawnObstacle() {
    const r = Math.random();
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
      y = pteroHeights[Math.floor(Math.random() * pteroHeights.length)];
    }

    obstacles.push({ x: W, y, w, h, type });
  }

  // === Update ===
  function update() {
    if (gameOver) return;

    // Duck state drives player height
    player.h = player.ducking ? 12 : 27;

    // Physics
    player.vy += GRAVITY;
    player.y  += player.vy;
    if (player.y >= GROUND_Y - player.h) {
      player.y       = GROUND_Y - player.h;
      player.vy      = 0;
      player.grounded = true;
    }

    // Clouds parallax
    for (let i = clouds.length - 1; i >= 0; i--) {
      clouds[i].x -= gameSpeed * 0.2;
      if (clouds[i].x < -80) clouds.splice(i, 1);
    }
    if (Math.random() < 0.004) clouds.push({ x: W + 20, y: 15 + Math.random() * 55 });

    groundOffset = (groundOffset + gameSpeed) % 60;

    // Spawn obstacles
    lastSpawn++;
    const spawnGap = Math.max(SPAWN_MIN_GAP - Math.floor(score / 100), 30);
    if (lastSpawn > spawnGap && Math.random() < 0.04) {
      spawnObstacle();
      lastSpawn = 0;
    }

    // Move + cull obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= gameSpeed;
      if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
    }

    // Collision
    if (!godMode) {
      for (const obs of obstacles) {
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
    }

    frameCount++;

    // Score increments every 3 frames (~20 pts/sec at 60fps, matching Chrome dino pace)
    if (++scoreFrame % 3 === 0) score++;
    scoreEl.textContent = String(score).padStart(5, '0');

    // Speed up every 300 pts
    if (score > 0 && score % 300 === 0 && scoreFrame % 3 === 0) {
      gameSpeed += 0.3;
      playSound('milestone');
    }

    // Night mode every 700 pts — lasts NIGHT_DURATION frames
    const nightMilestone = Math.floor(score / 700) * 700;
    if (nightMilestone > 0 && nightMilestone !== lastNightScore) {
      lastNightScore = nightMilestone;
      nightMode  = true;
      nightTimer = NIGHT_DURATION;
      stars = Array.from({ length: 45 }, () => ({
        x: Math.random() * W,
        y: 6 + Math.random() * (GROUND_Y - 50),
        s: Math.random() < 0.25 ? 3 : 2,
      }));
    }
    if (nightMode && --nightTimer <= 0) nightMode = false;
  }

  // === End game ===
  function endGame() {
    gameOver = true;
    playSound('death');
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('clawd-runner-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    restartBtn.classList.remove('hidden');
  }

  // === Draw ===
  function draw() {
    const bg  = nightMode ? '#0B1426' : '#F5EFE0';
    const gnd = nightMode ? '#3A5A7A' : '#8E9DAA';
    const cld = nightMode ? '#1C3A5A' : '#EAE3D0';

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Stars + moon
    if (nightMode) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of stars) ctx.fillRect(s.x, s.y, s.s, s.s);
      drawMoon(W - 80, 14);
    }

    // Clouds
    for (const c of clouds) drawCloud(c.x, c.y, cld);

    // Ground — base line + irregular raised sections + multi-rect stones on top
    ctx.fillStyle = gnd;
    ctx.fillRect(0, GROUND_Y, W, 2);
    for (let x = -groundOffset; x < W; x += 80) {
      // Line irregularities: 1-px raised stretches make the surface look uneven
      ctx.fillRect(x + 16, GROUND_Y - 1, 7, 1);
      ctx.fillRect(x + 38, GROUND_Y - 1, 5, 1);
      ctx.fillRect(x + 56, GROUND_Y - 1, 8, 1);

      // Stone 1 — medium blob (5×3)
      ctx.fillRect(x + 5,  GROUND_Y - 3, 3, 1);
      ctx.fillRect(x + 4,  GROUND_Y - 2, 5, 1);
      ctx.fillRect(x + 4,  GROUND_Y - 1, 4, 1);

      // Stone 2 — small (3×2)
      ctx.fillRect(x + 27, GROUND_Y - 2, 2, 1);
      ctx.fillRect(x + 26, GROUND_Y - 1, 3, 1);

      // Stone 3 — larger asymmetric (6×3)
      ctx.fillRect(x + 49, GROUND_Y - 3, 4, 1);
      ctx.fillRect(x + 48, GROUND_Y - 2, 6, 1);
      ctx.fillRect(x + 49, GROUND_Y - 1, 5, 1);

      // Stone 4 — tiny (2×2)
      ctx.fillRect(x + 70, GROUND_Y - 2, 2, 1);
      ctx.fillRect(x + 70, GROUND_Y - 1, 3, 1);
    }

    // Player
    if (player.ducking) drawClawdDuck(player.x, player.y);
    else                drawClawd(player.x, player.y);

    // Obstacles
    for (const obs of obstacles) drawObstacle(obs);

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.85)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = '#FF8A1F';
      ctx.font         = '24px "Press Start 2P", monospace';
      ctx.textAlign    = 'center';
      ctx.fillText('STACK OVERFLOW', W / 2, H / 2 - 10);
      ctx.fillStyle = '#F5EFE0';
      ctx.font      = '14px "VT323", monospace';
      ctx.fillText(`Final score: ${score}`, W / 2, H / 2 + 20);
      ctx.fillText('Press SPACE or tap to retry', W / 2, H / 2 + 40);
    }
  }

  // Clawd standing — 12×9 grid at P=3 = 36×27px
  function drawClawd(x, y) {
    const P = 3, O = '#FF8A00', B = '#1A0808', _ = null;
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
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Clawd ducking — 12×4 grid at P=3 = 36×12px
  function drawClawdDuck(x, y) {
    const P = 3, O = '#FF8A00', B = '#1A0808', _ = null;
    [
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
      [ O,O,O,B,O,O,O,O,O,B,O,O ],
      [ O,O,O,O,O,O,O,O,O,O,O,O ],
      [ _,O,O,O,O,O,O,O,O,O,O,_ ],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  // Moon crescent — 5×5 at P=4 = 20×20px
  function drawMoon(x, y) {
    const P = 4, C = '#FFF5AA', _ = null;
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

  // Small cactus — 10×18 at P=2 = 20×36px. 3-tone shaded with horizontal ridges.
  function drawCactusSm(x, y) {
    const P = 2;
    const L = nightMode ? '#8FDF94' : '#6DBF72'; // light highlight
    const M = nightMode ? '#6DBF72' : '#4A7C4E'; // mid body
    const D = nightMode ? '#4A7C4E' : '#2D5530'; // dark shadow / ridge
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

  // Large cactus — 12×25 at P=2 = 24×50px. 3-tone shaded with horizontal ridges.
  function drawCactusLg(x, y) {
    const P = 2;
    const L = nightMode ? '#8FDF94' : '#6DBF72';
    const M = nightMode ? '#6DBF72' : '#4A7C4E';
    const D = nightMode ? '#4A7C4E' : '#2D5530';
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

  // Pterodactyl — 22×13 grid at P=2 = 44×26px
  function drawPtero(x, y) {
    const P = 2;
    const C = nightMode ? '#8B9FBE' : '#5C6374';
    const D = nightMode ? '#3A3D47' : '#2A2D35';
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
    draw();
    if (!gameOver) requestAnimationFrame(loop);
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
    osc.start(t);
    osc.stop(t + duration + 0.01);
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
    }
  }

  // === Input ===
  let touchStartY = 0;

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown') { e.preventDefault(); duck(true); }
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
  canvas.addEventListener('mousedown', () => jump());

  restartBtn.addEventListener('click', reset);
  muteBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 MUTED';
  });

  // === Boot ===
  loadSprites();
})();
