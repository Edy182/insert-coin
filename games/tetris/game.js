(() => {
  'use strict';

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
  const COLS = 10;
  const ROWS = 20;
  const TILE = 24;
  const FIELD_X = 16;
  const FIELD_Y = 16;
  const SIDE_X  = FIELD_X + COLS * TILE + 24;

  // Seven tetrominoes — geometric configurations of 4 connected squares.
  // Colors map to the existing Clawd arcade palette.
  const PIECES = [
    { color: '#4ED8E5', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] }, // I
    { color: '#FF8A1F', shape: [[1,1],[1,1]] },                              // O
    { color: '#F5EFE0', shape: [[0,1,0],[1,1,1],[0,0,0]] },                  // T
    { color: '#3FCB7A', shape: [[0,1,1],[1,1,0],[0,0,0]] },                  // S
    { color: '#E5564B', shape: [[1,1,0],[0,1,1],[0,0,0]] },                  // Z
    { color: '#FFB6E1', shape: [[1,0,0],[1,1,1],[0,0,0]] },                  // J
    { color: '#FFB851', shape: [[0,0,1],[1,1,1],[0,0,0]] },                  // L
  ];

  // Frames-per-row at each level. Decays as the player levels up.
  const FALL_SPEEDS = [48, 40, 33, 27, 22, 18, 14, 11, 8, 6, 5, 4, 3, 3, 2, 2, 1];

  // === State ===
  let board;
  let piece, nextPiece;
  let bag;
  let fallTimer;
  let score, level, lines, gameOver, win;
  let lockFlash;
  let clearedRows;
  let frameCount = 0;
  let soundOn = true;
  let highScore = parseInt(localStorage.getItem('clawd-tetris-high') || '0', 10);

  // === Reset ===
  function reset() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    refillBag();
    nextPiece = pullFromBag();
    spawnPiece();
    fallTimer = 0;
    score = 0;
    level = 0;
    lines = 0;
    gameOver = false;
    win = false;
    lockFlash = 0;
    clearedRows = [];
    scoreEl.textContent = '00000';
    highScoreEl.textContent = String(highScore).padStart(5, '0');
    restartBtn.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  // 7-bag: shuffle all 7 indices, draw in order, refill when empty
  function refillBag() {
    const idx = [0,1,2,3,4,5,6];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    bag = idx;
  }

  function pullFromBag() {
    if (bag.length === 0) refillBag();
    const p = PIECES[bag.shift()];
    return { shape: p.shape.map(row => row.slice()), color: p.color, x: 0, y: 0 };
  }

  function spawnPiece() {
    piece = nextPiece;
    nextPiece = pullFromBag();
    piece.x = Math.floor((COLS - piece.shape[0].length) / 2);
    piece.y = 0;
    if (collides(piece, 0, 0)) {
      gameOver = true;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('clawd-tetris-high', String(highScore));
      }
      playSound('death');
      restartBtn.classList.remove('hidden');
    }
  }

  function collides(p, dx, dy, shape) {
    const s = shape || p.shape;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const nx = p.x + c + dx;
        const ny = p.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  // === Controls ===
  function moveHoriz(dx) {
    if (gameOver || lockFlash > 0) return;
    if (!collides(piece, dx, 0)) {
      piece.x += dx;
      playSound('move');
    }
  }

  function moveDown() {
    if (collides(piece, 0, 1)) return false;
    piece.y += 1;
    return true;
  }

  function softDrop() {
    if (gameOver || lockFlash > 0) return;
    if (moveDown()) {
      score += 1;
      fallTimer = 0;
    } else {
      playSound('lock');
      lockPiece();
    }
  }

  function hardDrop() {
    if (gameOver || lockFlash > 0) return;
    let drop = 0;
    while (moveDown()) drop++;
    score += drop * 2;
    playSound('drop');
    lockPiece();
  }

  function rotate() {
    if (gameOver || lockFlash > 0) return;
    const s = piece.shape;
    const n = s.length;
    const ns = [];
    for (let i = 0; i < n; i++) {
      ns.push([]);
      for (let j = 0; j < n; j++) {
        ns[i].push(s[n - 1 - j][i]);
      }
    }
    if (!collides(piece, 0, 0, ns)) {
      piece.shape = ns;
      playSound('rotate');
      return;
    }
    // Basic wall kicks: try shifting left/right/up
    for (const [dx, dy] of [[-1,0],[1,0],[-2,0],[2,0],[0,-1]]) {
      if (!collides(piece, dx, dy, ns)) {
        piece.x += dx;
        piece.y += dy;
        piece.shape = ns;
        playSound('rotate');
        return;
      }
    }
  }

  function lockPiece() {
    const s = piece.shape;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (s[r][c]) {
          const ny = piece.y + r;
          const nx = piece.x + c;
          if (ny >= 0 && ny < ROWS) board[ny][nx] = piece.color;
        }
      }
    }
    clearedRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(cell => cell)) clearedRows.push(r);
    }
    if (clearedRows.length > 0) {
      lockFlash = 30; // ~0.5s white flash before removal
    } else {
      spawnPiece();
    }
  }

  function finishLineClear() {
    for (const r of clearedRows) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
    }
    const n = clearedRows.length;
    const lineScores = [0, 100, 300, 500, 800];
    score += lineScores[n] * (level + 1);
    lines += n;
    const newLevel = Math.floor(lines / 10);
    if (newLevel > level) {
      level = newLevel;
      playSound('levelup');
    }
    if (n === 4) playSound('tetris');
    else if (n > 0) playSound('clear' + n);
    clearedRows = [];
    lockFlash = 0;
    spawnPiece();
  }

  // === Update ===
  function update() {
    if (gameOver) return;
    if (lockFlash > 0) {
      lockFlash--;
      if (lockFlash === 0) finishLineClear();
      return;
    }
    fallTimer++;
    const interval = FALL_SPEEDS[Math.min(level, FALL_SPEEDS.length - 1)];
    if (fallTimer >= interval) {
      fallTimer = 0;
      if (!moveDown()) {
        playSound('lock');
        lockPiece();
      }
    }
  }

  // === Draw ===
  function draw() {
    // Canvas background
    ctx.fillStyle = '#0B1426';
    ctx.fillRect(0, 0, W, H);

    // Subtle terminal scanlines across the whole canvas
    ctx.fillStyle = 'rgba(255, 138, 31, 0.025)';
    for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1);

    // Title bar — Claude Code prompt with blinking cursor
    ctx.textAlign = 'left';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#7E8C99';
    ctx.fillText('▸', 8, 14);
    ctx.fillStyle = '#FF8A1F';
    ctx.fillText('clawd', 22, 14);
    ctx.fillStyle = '#7E8C99';
    ctx.fillText(':', 70, 14);
    ctx.fillStyle = '#F5EFE0';
    ctx.fillText('tetris', 78, 14);
    if (Math.floor(frameCount / 30) % 2 === 0) {
      ctx.fillStyle = '#FF8A1F';
      ctx.fillRect(140, 6, 6, 10);
    }

    // Field background (no grid, no border — corner accents below replace it)
    ctx.fillStyle = '#0F1F3D';
    ctx.fillRect(FIELD_X, FIELD_Y, COLS * TILE, ROWS * TILE);

    // Locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          const flashing = lockFlash > 0 && clearedRows.includes(r);
          drawBlock(FIELD_X + c * TILE, FIELD_Y + r * TILE, flashing ? '#FFFFFF' : board[r][c]);
        }
      }
    }

    // Ghost piece (where current piece would land)
    if (!gameOver && lockFlash === 0) {
      let drop = 0;
      while (!collides(piece, 0, drop + 1)) drop++;
      drawPiece(piece, drop, 0.25);
      // Current piece
      drawPiece(piece, 0, 1);
    }

    // Terminal-window corner accents instead of a full border
    drawCorner(FIELD_X, FIELD_Y, 1, 1);
    drawCorner(FIELD_X + COLS * TILE, FIELD_Y, -1, 1);
    drawCorner(FIELD_X, FIELD_Y + ROWS * TILE, 1, -1);
    drawCorner(FIELD_X + COLS * TILE, FIELD_Y + ROWS * TILE, -1, -1);

    // Side panel
    drawSidePanel();

    // Game over overlay — styled as a Claude Code error trace
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.92)';
      ctx.fillRect(0, 0, W, H);

      // Panel with orange border, like a Claude Code error box
      const panelW = 340, panelH = 160;
      const px = (W - panelW) / 2;
      const py = (H - panelH) / 2;
      ctx.fillStyle = '#0B1426';
      ctx.fillRect(px, py, panelW, panelH);
      ctx.strokeStyle = '#E5564B';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

      let ty = py + 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#E5564B';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText('✗ Error: StackOverflow', px + 16, ty);
      ty += 22;
      ctx.fillStyle = '#7E8C99';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`  at line ${ROWS}`, px + 16, ty);
      ty += 26;
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`  score: ${String(score).padStart(5, '0')}`, px + 16, ty);
      ty += 18;
      ctx.fillText(`  lines: ${String(lines).padStart(3, '0')}`, px + 16, ty);
      ty += 26;
      ctx.fillStyle = '#FF8A1F';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText('▸ press SPACE /retry', px + 16, ty);
      ctx.textAlign = 'center';
    }
  }

  function drawPiece(p, dropOffset, alpha) {
    const s = p.shape;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (s[r][c]) {
          const y = p.y + r + dropOffset;
          const x = p.x + c;
          if (y >= 0) {
            ctx.globalAlpha = alpha;
            drawBlock(FIELD_X + x * TILE, FIELD_Y + y * TILE, p.color);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  }

  // Terminal-window corner accent: short orange L at a corner of the playfield.
  // (sx, sy) ∈ {±1} controls which direction the arms point.
  function drawCorner(x, y, sx, sy) {
    ctx.fillStyle = '#FF8A1F';
    const len = 12;
    const w = 2;
    ctx.fillRect(x + (sx < 0 ? -len : 0), y + (sy < 0 ? -w : 0), len, w);
    ctx.fillRect(x + (sx < 0 ? -w : 0), y + (sy < 0 ? -len : 0), w, len);
  }

  function drawBlock(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, TILE, TILE);
    // Highlight (top + left) and shadow (bottom + right) for depth
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillRect(x, y, 2, TILE);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x + TILE - 2, y, 2, TILE);
    ctx.fillRect(x, y + TILE - 2, TILE, 2);
  }

  // Tiny Clawd peeking from a corner — same Runner sprite at small scale
  function drawTinyClawd(cx, cy) {
    const P = 1, O = '#FF8A00', B = '#1A0808', _ = null;
    const sprite = [
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
    const x0 = cx - 6, y0 = cy - 4;
    sprite.forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x0 + c*P, y0 + r*P, P, P); }
    }));
  }

  function drawSidePanel() {
    const x = SIDE_X;
    let y = FIELD_Y;
    const panelW = W - SIDE_X - 16;

    // ▸ NEXT label — Claude Code prompt style
    ctx.fillStyle = '#FF8A1F';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('▸ NEXT', x, y + 8);
    y += 18;

    // Bordered preview box
    ctx.fillStyle = '#0F1F3D';
    ctx.fillRect(x, y, panelW, 96);
    ctx.strokeStyle = '#FF8A1F';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, 95);

    const previewTile = 18;
    const ns = nextPiece.shape;
    const ox = x + (panelW - ns[0].length * previewTile) / 2;
    const oy = y + (96 - ns.length * previewTile) / 2;
    for (let r = 0; r < ns.length; r++) {
      for (let c = 0; c < ns[r].length; c++) {
        if (ns[r][c]) {
          drawSmallBlock(ox + c * previewTile, oy + r * previewTile, previewTile, nextPiece.color);
        }
      }
    }
    y += 116;

    // ▸ LEVEL
    ctx.fillStyle = '#FF8A1F';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('▸ LEVEL', x, y);
    y += 18;
    ctx.fillStyle = '#F5EFE0';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(String(level).padStart(2, '0'), x, y);
    y += 28;

    // ▸ LINES
    ctx.fillStyle = '#FF8A1F';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('▸ LINES', x, y);
    y += 18;
    ctx.fillStyle = '#F5EFE0';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(String(lines).padStart(3, '0'), x, y);

    // Mini Clawd watching from the bottom of the side panel
    drawTinyClawd(x + panelW / 2, H - FIELD_Y - 12);

    // Live HUD score update
    scoreEl.textContent = String(score).padStart(5, '0');
  }

  function drawSmallBlock(x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(x, y, size, 2);
    ctx.fillRect(x, y, 2, size);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + size - 2, y, 2, size);
    ctx.fillRect(x, y + size - 2, size, 2);
  }

  function loop() {
    update();
    draw();
    frameCount++;
    if (!gameOver) requestAnimationFrame(loop);
  }

  // === Audio (Web Audio API; my own chiptune choices) ===
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep({ freq = 440, freq2 = null, type = 'square', duration = 0.1, volume = 0.12, delay = 0 }) {
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
    switch (kind) {
      case 'move':    beep({ freq: 240, duration: 0.04, volume: 0.06 }); break;
      case 'rotate':  beep({ freq: 440, duration: 0.05, volume: 0.08 }); break;
      case 'drop':    beep({ freq: 130, freq2: 60, type: 'sawtooth', duration: 0.15, volume: 0.12 }); break;
      case 'lock':    beep({ freq: 160, type: 'sawtooth', duration: 0.06, volume: 0.07 }); break;
      case 'clear1':
        beep({ freq: 440, duration: 0.08, volume: 0.13 });
        beep({ freq: 660, duration: 0.08, volume: 0.13, delay: 0.08 });
        break;
      case 'clear2':
        beep({ freq: 440, duration: 0.08, volume: 0.13 });
        beep({ freq: 660, duration: 0.08, volume: 0.13, delay: 0.08 });
        beep({ freq: 880, duration: 0.1,  volume: 0.13, delay: 0.16 });
        break;
      case 'clear3':
        beep({ freq: 440, duration: 0.08, volume: 0.14 });
        beep({ freq: 660, duration: 0.08, volume: 0.14, delay: 0.08 });
        beep({ freq: 880, duration: 0.08, volume: 0.14, delay: 0.16 });
        beep({ freq: 1100,duration: 0.12, volume: 0.14, delay: 0.24 });
        break;
      case 'tetris':
        beep({ freq: 440,  duration: 0.1, volume: 0.18 });
        beep({ freq: 660,  duration: 0.1, volume: 0.18, delay: 0.1 });
        beep({ freq: 880,  duration: 0.1, volume: 0.18, delay: 0.2 });
        beep({ freq: 1320, duration: 0.22,volume: 0.18, delay: 0.3 });
        break;
      case 'levelup':
        beep({ freq: 660, duration: 0.1, volume: 0.15 });
        beep({ freq: 990, duration: 0.1, volume: 0.15, delay: 0.1 });
        beep({ freq: 1320,duration: 0.15,volume: 0.15, delay: 0.2 });
        break;
      case 'death':
        beep({ freq: 440, freq2: 110, type: 'sawtooth', duration: 0.25, volume: 0.2 });
        beep({ freq: 220, freq2: 55,  type: 'sawtooth', duration: 0.25, volume: 0.15, delay: 0.2 });
        break;
    }
  }

  // === Input ===
  document.addEventListener('keydown', e => {
    if (gameOver && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      reset();
      return;
    }
    if      (e.code === 'ArrowLeft'  || e.code === 'KeyA') { moveHoriz(-1); e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { moveHoriz( 1); e.preventDefault(); }
    else if (e.code === 'ArrowUp'    || e.code === 'KeyW') { rotate();      e.preventDefault(); }
    else if (e.code === 'ArrowDown'  || e.code === 'KeyS') { softDrop();    e.preventDefault(); }
    else if (e.code === 'Space')                          { hardDrop();    e.preventDefault(); }
  });

  restartBtn.addEventListener('click', reset);
  muteBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    muteBtn.textContent = soundOn ? '🔊 SOUND' : '🔇 MUTED';
  });

  // === Boot ===
  reset();
})();
