(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const godMode = params.has('god');
  let dailyMode = params.has('daily');

  // === Canvas ===
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // crisp pixel-art rendering for sprite drawImage
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl     = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const restartBtn  = document.getElementById('restart');
  const shareBtn    = document.getElementById('share');
  const dailyBtn    = document.getElementById('daily');
  const muteBtn     = document.getElementById('mute');

  // Daily share card
  const todayISO = new Date().toISOString().slice(0, 10);
  function scoreTier(s) {
    if (s >= 5000) return 5;
    if (s >= 2500) return 4;
    if (s >= 1000) return 3;
    if (s >= 400)  return 2;
    if (s >= 100)  return 1;
    return 0;
  }
  function shareCard() {
    const tier = scoreTier(score);
    const squares = '🟧'.repeat(tier) + '⬛'.repeat(5 - tier);
    return `🦀 Clawd Man — ${todayISO}\n${score} pts ${squares}\nclawdbytes.com`;
  }

  // === Constants ===
  const TILE  = 24;
  const COLS  = 19;
  const ROWS  = 21;
  const SPEED = 3;
  const GHOST_SPEED = 2.0;
  const LIVES_START = 5;

  // Mode timing — chase/scatter rhythm gives the player breathing room.
  const CHASE_FRAMES      = 1000; // ~17s of chase
  const SCATTER_FRAMES    = 420;  // 7s of scatter (longer breather)
  const FRIGHTENED_FRAMES = 540;  // 9s of "ghosts flee" after a power pellet
  const FRIGHTENED_FLASH  = 120;  // last 2s flash white as warning

  // Ghost spawn config: col, row, color, releaseAt frames, personality, scatter corner.
  // Personalities: 'direct' chases player, 'ambush' targets 4 tiles ahead,
  // 'random' adds variance, 'scared' chases when far but flees when close.
  const GHOST_SPAWNS = [
    { col:  9, row:  9, color: '#E5564B', releaseAt:   0, personality: 'direct', corner: { c: 17, r:  1 }, name: 'NullPointer' },       // red
    { col:  8, row: 10, color: '#FFB6E1', releaseAt: 240, personality: 'ambush', corner: { c:  1, r:  1 }, name: 'OffByOne' },          // pink
    { col:  9, row: 10, color: '#4ED8E5', releaseAt: 480, personality: 'random', corner: { c: 17, r: 19 }, name: 'RaceCondition' },     // cyan
    { col: 10, row: 10, color: '#FFB851', releaseAt: 720, personality: 'scared', corner: { c:  1, r: 19 }, name: 'TimeoutException' }, // amber
  ];

  // === Maze layout (original design) ===
  // W = wall, . = dot, o = power pellet, _ = empty path, S = player spawn
  const MAZE_STRINGS = [
    'WWWWWWWWWWWWWWWWWWW',
    'Wo.......W.......oW',
    'W.WW.WWW.W.WWW.WW.W',
    'W.WW.WWW.W.WWW.WW.W',
    'W.................W',
    'W.WW.W.WWWWW.W.WW.W',
    'W....W...W...W....W',
    'WWWW.WWW.W.WWW.WWWW',
    '___W.W.......W.W___',
    'WWWW.W.WW_WW.W.WWWW',
    '_______W___W_______',
    'WWWW.W.WWWWW.W.WWWW',
    '___W.W.......W.W___',
    'WWWW.W.WWWWW.W.WWWW',
    'W........S........W',
    'W.WW.WWW.W.WWW.WW.W',
    'Wo.W...........W.oW',
    'WW.W.W.WWWWW.W.W.WW',
    'W....W...W...W....W',
    'W.WWWWWW.W.WWWWWW.W',
    'WWWWWWWWWWWWWWWWWWW',
  ];

  // Cell codes after parsing
  const CELL_WALL   = 0;
  const CELL_PATH   = 1;
  const CELL_DOT    = 2;
  const CELL_PELLET = 3;

  let grid;
  let spawnCol, spawnRow;
  let totalDots;

  function parseMaze() {
    grid = [];
    totalDots = 0;
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const ch = MAZE_STRINGS[r][c];
        switch (ch) {
          case 'W': row.push(CELL_WALL); break;
          case '.': row.push(CELL_DOT); totalDots++; break;
          case 'o': row.push(CELL_PELLET); totalDots++; break;
          case '_': row.push(CELL_PATH); break;
          case 'S':
            row.push(CELL_PATH);
            spawnCol = c;
            spawnRow = r;
            break;
          default:
            row.push(CELL_PATH);
        }
      }
      grid.push(row);
    }
  }

  // === State ===
  let player;
  let ghosts;
  let score, gameOver, win;
  let dotsRemaining;
  let frameCount;
  let gameStarted;
  let gameTime;
  let lives;
  let ghostMode;     // 'chase' | 'scatter'
  let modeTimer;     // frames in current mode
  let respawnTimer;  // when > 0, ghosts frozen and Clawd is invulnerable
  let lastCaughtBy;  // name of the ghost that caught Clawd (used in overlays)
  let catchFlash;    // frames remaining for the red-flash catch feedback
  let frightenedTimer; // > 0 means ghosts are fleeing after a power pellet
  let ghostsEatenInRound; // 1-4, scoring multiplier within a single frightened round
  let eatFreezeTimer; // brief freeze of all gameplay after eating a ghost (drama)
  let scorePopups; // floating "+200" labels that fade out
  let soundOn = true;
  let highScore = parseInt(localStorage.getItem('clawd-chomp-high') || '0', 10);
  const ONBOARDED_KEY = 'clawd-onboarded-chomp';
  let isFirstPlay = !localStorage.getItem(ONBOARDED_KEY);

  // Place Clawd + ghosts at their spawn positions. Used at game start and after each death.
  // On respawn, preserves each ghost's `released` flag so already-active ghosts stay active.
  function placeEntities() {
    player = {
      x: spawnCol * TILE + TILE / 2,
      y: spawnRow * TILE + TILE / 2,
      dir:     { dx: 0, dy: 0 },
      nextDir: { dx: 0, dy: 0 },
      mouth:   0,
    };
    const wasReleased = ghosts ? ghosts.map(g => g.released) : null;
    ghosts = GHOST_SPAWNS.map((s, i) => ({
      x: s.col * TILE + TILE / 2,
      y: s.row * TILE + TILE / 2,
      dir: { dx: 0, dy: -1 },
      color: s.color,
      releaseAt: s.releaseAt,
      personality: s.personality,
      corner: s.corner,
      name: s.name,
      spawnCol: s.col,
      spawnRow: s.row,
      released: wasReleased ? wasReleased[i] : false,
      eaten: false,
    }));
  }

  function reset() {
    parseMaze();
    ghosts = null; // ensure placeEntities starts with fresh "not released" state
    placeEntities();
    score = 0;
    dotsRemaining = totalDots;
    gameOver = false;
    win = false;
    frameCount = 0;
    gameStarted = false;
    gameTime = 0;
    lives = LIVES_START;
    ghostMode = 'chase';
    modeTimer = 0;
    respawnTimer = 0;
    lastCaughtBy = null;
    catchFlash = 0;
    frightenedTimer = 0;
    ghostsEatenInRound = 0;
    eatFreezeTimer = 0;
    scorePopups = [];
    restartBtn.classList.add('hidden');
    shareBtn.classList.add('hidden');
    scoreEl.textContent = '00000';
    highScoreEl.textContent = String(highScore).padStart(5, '0');
    requestAnimationFrame(loop);
  }

  // === Helpers ===
  function isTunnelRow(r) {
    if (r < 0 || r >= ROWS) return false;
    return grid[r][0] === CELL_PATH || grid[r][COLS - 1] === CELL_PATH;
  }
  function isWallTile(c, r) {
    if (r < 0 || r >= ROWS) return true;
    // Out-of-bounds cols only count as path on tunnel rows; everywhere else
    // they're walls so Clawd / ghosts can't escape into negative tile space.
    if (c < 0 || c >= COLS) return !isTunnelRow(r);
    return grid[r][c] === CELL_WALL;
  }

  function canMoveFrom(c, r, dx, dy) {
    return !isWallTile(c + dx, r + dy);
  }

  // === Ghost AI ===

  // Per-ghost target tile, depends on mode and personality.
  function ghostTarget(g) {
    const pC = Math.floor(player.x / TILE);
    const pR = Math.floor(player.y / TILE);

    // Eaten ghost: head back to its spawn cell.
    if (g.eaten) return { c: g.spawnCol, r: g.spawnRow };

    // Frightened: flee to the opposite corner of the maze from the player.
    if (frightenedTimer > 0) {
      return { c: (COLS - 1) - pC, r: (ROWS - 1) - pR };
    }

    if (ghostMode === 'scatter') return g.corner;

    switch (g.personality) {
      case 'direct':
        return { c: pC, r: pR };
      case 'ambush':
        return {
          c: pC + player.dir.dx * 4,
          r: pR + player.dir.dy * 4,
        };
      case 'random':
        // 30% of the time pick a random tile to inject variance; otherwise chase
        if (Math.random() < 0.3) {
          return { c: Math.floor(Math.random() * COLS), r: Math.floor(Math.random() * ROWS) };
        }
        return { c: pC, r: pR };
      case 'scared': {
        // Far from Clawd → chase; near → bail to own corner
        const gC = Math.floor(g.x / TILE);
        const gR = Math.floor(g.y / TILE);
        const dist = Math.abs(gC - pC) + Math.abs(gR - pR);
        return dist > 8 ? { c: pC, r: pR } : g.corner;
      }
      default:
        return { c: pC, r: pR };
    }
  }

  function chooseGhostDir(g) {
    const c = Math.floor(g.x / TILE);
    const r = Math.floor(g.y / TILE);
    const target = ghostTarget(g);

    const candidates = [
      { dx:  0, dy: -1 },
      { dx: -1, dy:  0 },
      { dx:  0, dy:  1 },
      { dx:  1, dy:  0 },
    ];

    let options = candidates.filter(d => {
      if (g.dir.dx === -d.dx && g.dir.dy === -d.dy && (g.dir.dx !== 0 || g.dir.dy !== 0)) return false;
      return !isWallTile(c + d.dx, r + d.dy);
    });

    if (options.length === 0) {
      options = candidates.filter(d => !isWallTile(c + d.dx, r + d.dy));
    }
    if (options.length === 0) return g.dir;

    let best = options[0];
    let bestDist = Infinity;
    for (const d of options) {
      const dist = Math.abs((c + d.dx) - target.c) + Math.abs((r + d.dy) - target.r);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  function updateGhost(g) {
    // Eaten ghost waiting at its spawn cell — count down regenTimer, no movement
    if (g.eaten && g.regenTimer > 0) {
      g.regenTimer--;
      if (g.regenTimer <= 0) {
        g.eaten = false;
      }
      return;
    }

    // Variable speed: frightened = slower, eaten = faster (rush back to house)
    const speed = g.eaten ? GHOST_SPEED * 1.5
                 : frightenedTimer > 0 ? GHOST_SPEED * 0.6
                 : GHOST_SPEED;

    const c = Math.floor(g.x / TILE);
    const r = Math.floor(g.y / TILE);
    const cx = c * TILE + TILE / 2;
    const cy = r * TILE + TILE / 2;
    const atCenter = Math.abs(g.x - cx) < speed && Math.abs(g.y - cy) < speed;

    if (atCenter) {
      g.dir = chooseGhostDir(g);
      g.x = cx;
      g.y = cy;
      // Eaten eyes arrived back at spawn → start the 1.5s regen wait
      if (g.eaten && c === g.spawnCol && r === g.spawnRow) {
        g.regenTimer = 90;
        return;
      }
    }

    g.x += g.dir.dx * speed;
    g.y += g.dir.dy * speed;

    // Tunnel wrap
    const halfTile = TILE / 2;
    if (g.x < -halfTile)              g.x = COLS * TILE + halfTile;
    if (g.x > COLS * TILE + halfTile) g.x = -halfTile;
  }

  // Returns the ghost that caught Clawd this frame, or null.
  function ghostCaughtPlayer() {
    const pc = Math.floor(player.x / TILE);
    const pr = Math.floor(player.y / TILE);
    for (const g of ghosts) {
      const gc = Math.floor(g.x / TILE);
      const gr = Math.floor(g.y / TILE);
      if (pc === gc && pr === gr) return g;
    }
    return null;
  }

  // === Update ===
  function update() {
    if (gameOver) return;

    // Score popups float up + fade — animate even during the eat-freeze
    for (let i = scorePopups.length - 1; i >= 0; i--) {
      scorePopups[i].frames--;
      scorePopups[i].y -= 0.5;
      if (scorePopups[i].frames <= 0) scorePopups.splice(i, 1);
    }

    // Dramatic freeze after eating a ghost — pauses everything else for ~0.4s
    if (eatFreezeTimer > 0) {
      eatFreezeTimer--;
      return;
    }

    const c = Math.floor(player.x / TILE);
    const r = Math.floor(player.y / TILE);
    const centerX = c * TILE + TILE / 2;
    const centerY = r * TILE + TILE / 2;
    const atCenter = Math.abs(player.x - centerX) < SPEED &&
                     Math.abs(player.y - centerY) < SPEED;

    const nd = player.nextDir;
    const d  = player.dir;

    // Instant reverse — Pac-Man feel
    if ((nd.dx === -d.dx && d.dx !== 0) || (nd.dy === -d.dy && d.dy !== 0)) {
      player.dir = { dx: nd.dx, dy: nd.dy };
    }

    // At intersection, try queued direction
    if (atCenter && (nd.dx !== 0 || nd.dy !== 0)) {
      if (canMoveFrom(c, r, nd.dx, nd.dy)) {
        player.dir = { dx: nd.dx, dy: nd.dy };
        player.x = centerX;
        player.y = centerY;
      }
    }

    // Move, unless blocked
    if (player.dir.dx !== 0 || player.dir.dy !== 0) {
      if (atCenter && !canMoveFrom(c, r, player.dir.dx, player.dir.dy)) {
        player.dir = { dx: 0, dy: 0 };
        player.x = centerX;
        player.y = centerY;
      } else {
        player.x += player.dir.dx * SPEED;
        player.y += player.dir.dy * SPEED;
        player.mouth = (player.mouth + 1) % 20;
      }
    }

    // Tunnel wrap
    const halfTile = TILE / 2;
    if (player.x < -halfTile)         player.x = COLS * TILE + halfTile;
    if (player.x > COLS * TILE + halfTile) player.x = -halfTile;

    // Eat
    const ec = Math.floor(player.x / TILE);
    const er = Math.floor(player.y / TILE);
    if (ec >= 0 && ec < COLS && er >= 0 && er < ROWS) {
      const cell = grid[er][ec];
      const mult = (window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1;
      if (cell === CELL_DOT) {
        grid[er][ec] = CELL_PATH;
        score += 10 * mult;
        dotsRemaining--;
        playSound('dot');
      } else if (cell === CELL_PELLET) {
        grid[er][ec] = CELL_PATH;
        score += 50 * mult;
        dotsRemaining--;
        playSound('pellet');
        // Frightened mode: ghosts flee, reverse direction, become edible.
        frightenedTimer = FRIGHTENED_FRAMES;
        ghostsEatenInRound = 0;
        for (const g of ghosts) {
          if (!g.eaten) g.dir = { dx: -g.dir.dx, dy: -g.dir.dy };
        }
      }
    }

    scoreEl.textContent = String(score).padStart(5, '0');

    if (catchFlash > 0) catchFlash--;
    if (frightenedTimer > 0) frightenedTimer--;
    if (frightenedTimer === 0) ghostsEatenInRound = 0;

    // After first input the world ticks.
    if (gameStarted) {
      gameTime++;

      // Respawn invulnerability winds down before ghosts re-enable.
      if (respawnTimer > 0) {
        respawnTimer--;
      } else {
        // Mode rhythm: chase ↔ scatter. Reverse ghost directions on flip — classic feel.
        modeTimer++;
        if (ghostMode === 'chase' && modeTimer >= CHASE_FRAMES) {
          ghostMode = 'scatter';
          modeTimer = 0;
          for (const g of ghosts) g.dir = { dx: -g.dir.dx, dy: -g.dir.dy };
        } else if (ghostMode === 'scatter' && modeTimer >= SCATTER_FRAMES) {
          ghostMode = 'chase';
          modeTimer = 0;
          for (const g of ghosts) g.dir = { dx: -g.dir.dx, dy: -g.dir.dy };
        }

        for (const g of ghosts) {
          // Promote to released once the stagger timer fires; the flag survives respawns.
          if (!g.released && gameTime >= g.releaseAt) g.released = true;
          if (g.released) updateGhost(g);
        }
      }
    }

    if (respawnTimer === 0) {
      const catcher = ghostCaughtPlayer();
      if (catcher) {
        if (frightenedTimer > 0 && !catcher.eaten) {
          ghostsEatenInRound = Math.min(ghostsEatenInRound + 1, 4);
          const pts = 200 * Math.pow(2, ghostsEatenInRound - 1);
          score += pts;
          catcher.eaten = true;
          catcher.regenTimer = 0; // armed when eyes reach spawn
          catcher.dir = { dx: -catcher.dir.dx, dy: -catcher.dir.dy };
          // Dramatic freeze + floating score popup
          eatFreezeTimer = 24;
          scorePopups.push({ x: catcher.x, y: catcher.y - 4, text: '+' + pts, frames: 60 });
          playSound('eatGhost');
        } else if (!catcher.eaten) {
          const wizardOn = window.ClawdStats && window.ClawdStats.isGodModeActive();
          if (godMode || wizardOn) {
            // Wizard hat / ?god param: ghosts can't catch Clawd. Walk through them.
          } else {
            loseLife(catcher);
            return;
          }
        }
      }
    }

    if (dotsRemaining === 0) {
      win = true;
      playSound('win');
      endGame();
    }
  }

  function endGame() {
    gameOver = true;
    stopMusic();
    const beatHigh = score > highScore;
    if (beatHigh) {
      highScore = score;
      localStorage.setItem('clawd-chomp-high', String(highScore));
      highScoreEl.textContent = String(highScore).padStart(5, '0');
    }
    if (win) burstConfetti();
    if (window.ClawdStats) window.ClawdStats.submitScore({ game: 'chomp', score: score, dailyMode: dailyMode, dateISO: todayISO });
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

  // Caught by a ghost — burn a life, respawn if any left.
  function loseLife(catcher) {
    lastCaughtBy = catcher ? catcher.name : null;
    catchFlash = 60; // 1s of red flash
    playSound('catch');
    lives--;
    if (lives <= 0) {
      win = false;
      endGame();
      return;
    }
    placeEntities();
    respawnTimer = 180; // 3s overlay so the player can read what caught them
    gameTime = 0;
    ghostMode = 'chase';
    modeTimer = 0;
  }

  // === Draw ===
  function draw() {
    // Background — Claude navy (matches Runner night mode)
    ctx.fillStyle = '#0B1426';
    ctx.fillRect(0, 0, W, H);

    // Maze
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        const px = c * TILE;
        const py = r * TILE;
        if (cell === CELL_WALL) {
          drawWall(px, py, c, r);
        } else if (cell === CELL_DOT) {
          ctx.fillStyle = '#F5EFE0';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === CELL_PELLET) {
          const pulse = (Math.sin(frameCount * 0.15) + 1) * 0.5;
          ctx.fillStyle = '#FF8A1F';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 4 + pulse * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Ghosts (drawn under Clawd so Clawd reads on top on overlap)
    for (const g of ghosts) drawGhost(g);

    // Clawd — blinks during respawn invulnerability
    if (respawnTimer === 0 || Math.floor(respawnTimer / 8) % 2 === 0) {
      drawClawd(player.x, player.y);
    }

    // Score popups float upward and fade
    for (const p of scorePopups) {
      const alpha = Math.min(1, p.frames / 60);
      ctx.fillStyle = `rgba(255, 138, 31, ${alpha})`;
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }

    // Lives — small Clawd faces along the bottom-left
    for (let i = 0; i < lives - 1; i++) {
      drawMiniClawd(14 + i * 20, H - 14);
    }

    // Ready overlay — shown until first input
    if (!gameStarted && !gameOver) {
      ctx.fillStyle = '#FF8A1F';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', W / 2, H / 2 + 50);
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '12px "VT323", monospace';
      ctx.fillText('Press ARROW to start', W / 2, H / 2 + 72);
      if (isFirstPlay) {
        ctx.fillStyle = '#FF8A1F';
        ctx.font = '12px "VT323", monospace';
        ctx.fillText('Eat dots  ·  dodge bugs  ·  power pellets fight back', W / 2, H / 2 + 94);
      }
    }

    // Mid-game catch feedback: red flash + panel with "Caught by X" while respawning
    if (catchFlash > 0) {
      const alpha = (catchFlash / 60) * 0.7;
      ctx.fillStyle = `rgba(229, 86, 75, ${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (respawnTimer > 0 && lastCaughtBy && !gameOver) {
      // Dark panel behind text so it stands out over the maze
      const panelH = 88;
      ctx.fillStyle = 'rgba(11, 20, 38, 0.92)';
      ctx.fillRect(0, H / 2 - panelH / 2, W, panelH);
      ctx.strokeStyle = '#E5564B';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, H / 2 - panelH / 2, W, panelH);

      ctx.fillStyle = '#E5564B';
      ctx.font = '22px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CAUGHT!', W / 2, H / 2 - 8);
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText(`by ${lastCaughtBy}`, W / 2, H / 2 + 20);
    }

    // Game-over / win overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FF8A1F';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(win ? 'MAZE CLEAR!' : 'STACK OVERFLOW', W / 2, H / 2 - 18);
      if (!win && lastCaughtBy) {
        ctx.fillStyle = '#E5564B';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(`Caught by ${lastCaughtBy}`, W / 2, H / 2 + 6);
      }
      ctx.fillStyle = '#F5EFE0';
      ctx.font = '14px "VT323", monospace';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 30);
      ctx.fillText('Press SPACE to retry', W / 2, H / 2 + 50);
    }
  }

  // Walls — muted Claude navy-blue, slightly inset so corridors read clearly
  function drawWall(px, py, c, r) {
    ctx.fillStyle = '#3A5A7A';
    const inset = 2;
    ctx.fillRect(px + inset, py + inset, TILE - inset * 2, TILE - inset * 2);
  }

  // Pre-render Clawd sprite once into an offscreen canvas, then blit it scaled.
  // Lets us scale by any factor and stay crisp (imageSmoothingEnabled=false).
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

  // Render Clawd at 1.25× by default. While powered-up (frightened mode active)
  // scale up to 1.8× so the power-pellet effect is visually obvious.
  function drawClawd(cx, cy) {
    const src = getClawdSprite();
    const scale = frightenedTimer > 0 ? 1.8 : 1.25;
    const w = src.width * scale;
    const h = src.height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    if (window.ClawdStats) {
      window.ClawdStats.drawHat(ctx, cx, cy - h / 2, frightenedTimer > 0 ? 4 : 3);
      window.ClawdStats.drawSparkles(ctx, cx, cy, w / 2 + 4);
    }
  }

  // Tiny Clawd icon for the lives indicator.
  function drawMiniClawd(cx, cy) {
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#FF8A00';
    const B = '#1A0808';
    ctx.fillStyle = O;
    ctx.fillRect(cx - 6, cy - 4, 12, 8);
    ctx.fillStyle = B;
    ctx.fillRect(cx - 3, cy - 2, 1, 1);
    ctx.fillRect(cx + 2, cy - 2, 1, 1);
  }

  // Ghost — 12×12 grid at P=2 = 24×24 px. Rounded top, eyes, wavy feet.
  // Renders blue (with end-of-timer flash) when frightened, or eyes-only when eaten.
  function drawGhost(g) {
    const P = 2;
    const x = g.x - 12, y = g.y - 12;

    if (g.eaten) {
      // Two simple white dots — eyes traveling back to the house
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(g.x - 6, g.y - 2, 3, 4);
      ctx.fillRect(g.x + 3, g.y - 2, 3, 4);
      return;
    }

    // Body color: frightened blue, flashing white in the last ~2s of the timer.
    let G, Wh, B;
    if (frightenedTimer > 0) {
      const flashing = frightenedTimer < FRIGHTENED_FLASH && Math.floor(frightenedTimer / 8) % 2 === 0;
      G  = flashing ? '#F5EFE0' : '#2A4FB8';
      Wh = flashing ? '#2A4FB8' : '#F5EFE0';
      B  = flashing ? '#2A4FB8' : '#E5564B';
    } else {
      G  = g.color;
      Wh = '#FFFFFF';
      B  = '#0A1F3D';
    }
    const _ = null;
    [
      [ _,_,_,G,G,G,G,G,G,_,_,_ ],
      [ _,_,G,G,G,G,G,G,G,G,_,_ ],
      [ _,G,G,G,G,G,G,G,G,G,G,_ ],
      [ G,G,G,G,G,G,G,G,G,G,G,G ],
      [ G,G,Wh,Wh,G,G,G,G,Wh,Wh,G,G ],
      [ G,G,Wh,B,G,G,G,G,Wh,B,G,G ],
      [ G,G,Wh,Wh,G,G,G,G,Wh,Wh,G,G ],
      [ G,G,G,G,G,G,G,G,G,G,G,G ],
      [ G,G,G,G,G,G,G,G,G,G,G,G ],
      [ G,G,G,G,G,G,G,G,G,G,G,G ],
      [ G,G,G,G,G,G,G,G,G,G,G,G ],
      [ G,G,_,G,G,_,G,G,_,G,G,_ ],
    ].forEach((row, r) => row.forEach((col, c) => {
      if (col) { ctx.fillStyle = col; ctx.fillRect(x + c*P, y + r*P, P, P); }
    }));
  }

  function loop() {
    update();
    if (confetti.length > 0) updateConfetti();
    draw();
    if (confetti.length > 0) drawConfetti();
    frameCount++;
    if (!gameOver || confetti.length > 0) requestAnimationFrame(loop);
  }

  // === Audio (chiptune beeps via Web Audio API; original frequencies) ===
  let audioCtx = null;
  let dotToggle = 0; // alternates dot pitch for a chomping rhythm

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
    if (kind === 'dot') {
      // Alternating two-tone bite for the chomping rhythm
      dotToggle = 1 - dotToggle;
      beep({ freq: dotToggle ? 540 : 720, type: 'square', duration: 0.05, volume: 0.08 });
    } else if (kind === 'pellet') {
      beep({ freq: 220, freq2: 660, type: 'square', duration: 0.18, volume: 0.15 });
    } else if (kind === 'catch') {
      beep({ freq: 660, freq2: 110, type: 'sawtooth', duration: 0.3, volume: 0.2 });
      beep({ freq: 330, freq2: 55,  type: 'sawtooth', duration: 0.3, volume: 0.15, delay: 0.25 });
    } else if (kind === 'win') {
      beep({ freq: 440, duration: 0.12, volume: 0.18 });
      beep({ freq: 660, duration: 0.12, volume: 0.18, delay: 0.13 });
      beep({ freq: 880, duration: 0.24, volume: 0.18, delay: 0.26 });
    } else if (kind === 'eatGhost') {
      beep({ freq: 880, freq2: 1760, type: 'square', duration: 0.18, volume: 0.18 });
      beep({ freq: 1320, freq2: 660, type: 'square', duration: 0.12, volume: 0.14, delay: 0.18 });
    }
  }

  // === Input ===
  document.addEventListener('keydown', e => {
    if (gameOver && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      reset();
      return;
    }
    let dx = 0, dy = 0;
    if      (e.code === 'ArrowUp'    || e.code === 'KeyW') dy = -1;
    else if (e.code === 'ArrowDown'  || e.code === 'KeyS') dy =  1;
    else if (e.code === 'ArrowLeft'  || e.code === 'KeyA') dx = -1;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') dx =  1;
    else return;
    e.preventDefault();
    if (player) {
      player.nextDir = { dx, dy };
      if (!gameStarted) { gameStarted = true; startMusic(); if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; } if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'chomp', dailyMode: dailyMode, dateISO: todayISO }); }
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
    const ddx = e.changedTouches[0].clientX - touchStartX;
    const ddy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(ddx) < 20 && Math.abs(ddy) < 20) return;
    const queued = Math.abs(ddx) > Math.abs(ddy)
      ? { dx: ddx > 0 ? 1 : -1, dy: 0 }
      : { dx: 0, dy: ddy > 0 ? 1 : -1 };
    if (player) {
      player.nextDir = queued;
      if (!gameStarted) { gameStarted = true; startMusic(); if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; } if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'chomp', dailyMode: dailyMode, dateISO: todayISO }); }
    }
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
  reset();
})();
