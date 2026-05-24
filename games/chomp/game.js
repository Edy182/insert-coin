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
    const rank = leaderboardResult && leaderboardResult.rank;
    const rankLine = rank ? `\nrank #${rank} ${dailyMode ? 'today' : 'all-time'}` : '';
    return `🦀 Mac-Pan — ${todayISO}\n${score} pts ${squares}${rankLine}\nInsert Coin`;
  }

  // === Constants ===
  const TILE  = 24;
  const COLS  = 19;
  const ROWS  = 21;
  const SPEED = 3;
  const GHOST_SPEED = 1.75;  // was 2.0 — gives player a comfortable speed margin (3 vs 1.75)
  const LIVES_START = 8;

  // Mode timing — chase/scatter rhythm gives the player breathing room.
  // Tuned for winnability: shorter chase bursts, longer scatter breathers,
  // much longer frightened windows to chain power pellets and rest.
  const CHASE_FRAMES      = 720;   // 12s chase (was 15s)
  const SCATTER_FRAMES    = 720;   // 12s scatter (was 9s)
  const FRIGHTENED_FRAMES = 1080;  // 18s frightened (was 13s)
  const FRIGHTENED_FLASH  = 120;   // last 2s flash white as warning

  // Ghost spawn config: col, row, color, releaseAt frames, personality, scatter corner.
  // Personalities: 'direct' chases player, 'ambush' targets 4 tiles ahead,
  // 'random' adds variance, 'scared' chases when far but flees when close.
  // Releases staggered wider — 4th ghost arrives at 18s instead of 12s,
  // giving the early-game more breathing room before all 4 are loose.
  const GHOST_SPAWNS = [
    { col:  9, row:  9, color: '#c1574b', releaseAt:    0, personality: 'direct', corner: { c: 17, r:  1 }, name: 'NullPointer' },       // red
    { col:  8, row: 10, color: '#e8a4b8', releaseAt:  360, personality: 'ambush', corner: { c:  1, r:  1 }, name: 'OffByOne' },          // pink
    { col:  9, row: 10, color: '#6a9bcc', releaseAt:  720, personality: 'random', corner: { c: 17, r: 19 }, name: 'RaceCondition' },     // cyan
    { col: 10, row: 10, color: '#d4a85f', releaseAt: 1080, personality: 'scared', corner: { c:  1, r: 19 }, name: 'TimeoutException' }, // amber
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
  let shieldFlash;      // frames of cream flash after activating the shield
  let comboFlash;       // cream border pulse frames after a PERFECT CHAIN
  let leaderboardResult; // { rank, list } from Worker after submit
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
    shieldFlash = 0;
    comboFlash = 0;
    leaderboardResult = null;
    if (window.ClawdStats) window.ClawdStats.resetShield();
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
    if (shieldFlash > 0) shieldFlash--;
    if (window.ClawdStats) window.ClawdStats.tickShield();
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
          // Perfect chain: all 4 ghosts in one frightened window = big bonus.
          if (ghostsEatenInRound === 4) {
            const mult = (window.ClawdStats && window.ClawdStats.getScoreMultiplier()) || 1;
            score += 500 * mult;
            scorePopups.push({ x: W / 2, y: H / 2 - 40, text: 'PERFECT CHAIN +' + (500 * mult), frames: 90 });
            comboFlash = 35;
            playSound('combo');
          }
        } else if (!catcher.eaten) {
          const wizardOn = window.ClawdStats && window.ClawdStats.isGodModeActive();
          const shieldOn = window.ClawdStats && window.ClawdStats.isShieldActive();
          if (godMode || wizardOn || shieldOn) {
            // Wizard hat / ?god / active crown shield: ghosts can't catch Clawd.
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
    if (window.ClawdStats) window.ClawdStats.submitScore(
      { game: 'chomp', score: score, dailyMode: dailyMode, dateISO: todayISO },
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
    ctx.fillStyle = '#141413';
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
          ctx.fillStyle = '#faf9f5';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === CELL_PELLET) {
          // Pulsing cream pellet — drives the eye without competing with Clawd.
          const pulse = (Math.sin(frameCount * 0.15) + 1) * 0.5;
          ctx.fillStyle = '#faf9f5';
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

    // Combo border pulse — fires on PERFECT CHAIN
    if (comboFlash > 0) {
      comboFlash--;
      const a = (comboFlash / 35) * 0.55;
      ctx.strokeStyle = `rgba(250, 249, 245, ${a})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.lineWidth = 1;
    }

    // Score popups float upward and fade
    for (const p of scorePopups) {
      const alpha = Math.min(1, p.frames / 60);
      ctx.fillStyle = `rgba(250, 249, 245, ${alpha})`;
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }

    // Lives — small Clawd faces along the bottom-left
    for (let i = 0; i < lives - 1; i++) {
      drawMiniClawd(14 + i * 20, H - 14);
    }

    // Crown shield HUD — small bar bottom-right when the player has it.
    if (window.ClawdStats && window.ClawdStats.hasShield()) {
      const x = W - 60, y = H - 18, w = 50, h = 6;
      ctx.fillStyle = 'rgba(176, 174, 165, 0.25)';
      ctx.fillRect(x, y, w, h);
      const active = window.ClawdStats.isShieldActive();
      const frac = active ? window.ClawdStats.shieldActiveFrac() : window.ClawdStats.shieldReadyFrac();
      ctx.fillStyle = active ? '#faf9f5' : (frac >= 1 ? '#e8e6dc' : '#8a8880');
      ctx.fillRect(x, y, w * frac, h);
      ctx.fillStyle = '#b0aea5';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(active ? 'SHIELD' : (frac >= 1 ? 'SHIFT' : ''), x + w, y - 2);
    }

    // Ready overlay — shown until first input
    if (!gameStarted && !gameOver) {
      ctx.fillStyle = '#faf9f5';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', W / 2, H / 2 + 50);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '12px "VT323", monospace';
      ctx.fillText('Press ARROW to start', W / 2, H / 2 + 72);
      if (isFirstPlay) {
        ctx.fillStyle = '#faf9f5';
        ctx.font = '12px "VT323", monospace';
        ctx.fillText('Eat dots  ·  dodge bugs  ·  power pellets fight back', W / 2, H / 2 + 94);
      }
    }

    // Crown shield absorbed a ghost hit: brief cream pulse so it's obvious.
    if (shieldFlash > 0) {
      const alpha = (shieldFlash / 30) * 0.45;
      ctx.fillStyle = `rgba(250, 249, 245, ${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Mid-game catch feedback: red flash + panel with "Caught by X" while respawning
    if (catchFlash > 0) {
      const alpha = (catchFlash / 60) * 0.55;
      ctx.fillStyle = `rgba(250, 249, 245, ${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (respawnTimer > 0 && lastCaughtBy && !gameOver) {
      // Dark panel behind text so it stands out over the maze
      const panelH = 88;
      ctx.fillStyle = 'rgba(11, 20, 38, 0.92)';
      ctx.fillRect(0, H / 2 - panelH / 2, W, panelH);
      ctx.strokeStyle = '#faf9f5';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, H / 2 - panelH / 2, W, panelH);

      ctx.fillStyle = '#faf9f5';
      ctx.font = '22px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CAUGHT!', W / 2, H / 2 - 8);
      ctx.fillStyle = '#b0aea5';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText(`by ${lastCaughtBy}`, W / 2, H / 2 + 20);
    }

    // Game-over / win overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(11, 20, 38, 0.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#faf9f5';
      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(win ? 'MAZE CLEAR!' : 'STACK OVERFLOW', W / 2, H / 2 - 18);
      if (!win && lastCaughtBy) {
        ctx.fillStyle = '#b0aea5';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(`Caught by ${lastCaughtBy}`, W / 2, H / 2 + 6);
      }
      ctx.fillStyle = '#faf9f5';
      ctx.font = '14px "VT323", monospace';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 30);
      let retryY = H / 2 + 65;
      if (leaderboardResult && leaderboardResult.rank) {
        const rankLabel = `★ RANK #${leaderboardResult.rank} ${dailyMode ? 'TODAY' : 'ALL-TIME'} ★`;
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        const metrics = ctx.measureText(rankLabel);
        const pillW = metrics.width + 24, pillH = 26;
        ctx.fillStyle = 'rgba(250, 249, 245, 0.10)';
        ctx.fillRect(W / 2 - pillW / 2, retryY - 18, pillW, pillH);
        ctx.fillStyle = '#faf9f5';
        ctx.fillText(rankLabel, W / 2, retryY);
        ctx.font = '14px "VT323", monospace';
        ctx.fillStyle = '#faf9f5';
        retryY += 30;
      }
      ctx.fillText('Press SPACE to retry', W / 2, retryY);
    }
  }

  // Walls — filled dark warm gray. Solid enough to give the maze weight and
  // containment (classic Pac-Man feel), dim enough that Clawd stays the
  // colored focal point against pure black canvas.
  function drawWall(px, py, c, r) {
    ctx.fillStyle = '#3a3835';
    const inset = 2;
    ctx.fillRect(px + inset, py + inset, TILE - inset * 2, TILE - inset * 2);
  }

  // Pre-render Clawd sprite once into an offscreen canvas, then blit it scaled.
  // Lets us scale by any factor and stay crisp (imageSmoothingEnabled=false).
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

  // Render Clawd at 1.25× by default. While powered-up (frightened mode active)
  // scale up to 1.8× so the power-pellet effect is visually obvious.
  // Sprite rotates/flips to match movement direction; chomp wedge always opens
  // along the +x axis of the rotated context, so right/left/up/down all chomp
  // correctly. Wedge is built from 1-px vertical rects (no AA fringe).
  function drawClawd(cx, cy) {
    const src = getClawdSprite();
    const scale = frightenedTimer > 0 ? 1.8 : 1.25;
    const w = src.width * scale;
    const h = src.height * scale;
    ctx.imageSmoothingEnabled = false;

    const dir = player.dir;
    let rotation = 0;
    let flipH = false;
    if (dir.dx < 0)       flipH = true;            // Moving left
    else if (dir.dy > 0)  rotation = Math.PI / 2;  // Moving down
    else if (dir.dy < 0)  rotation = -Math.PI / 2; // Moving up

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (rotation) ctx.rotate(rotation);
    if (flipH)    ctx.scale(-1, 1);
    ctx.drawImage(src, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();

    // Chomp wedge in pure screen-space integer pixels (no rotation matrix =
    // no subpixel fringe). Each direction has its own branch with fillRect
    // calls that are always pixel-aligned.
    if (gameStarted && (dir.dx !== 0 || dir.dy !== 0)) {
      const openAmount = Math.max(0, Math.sin((player.mouth / 20) * Math.PI));
      const half = h / 2;
      const maxOpen = Math.round(half * 0.85);
      const open = Math.round(openAmount * maxOpen);
      const depth = Math.round(half + 1);
      if (open >= 1) {
        const ax = Math.round(cx);
        const ay = Math.round(cy);
        ctx.fillStyle = '#141413';
        if (dir.dx > 0) {
          for (let i = 0; i < depth; i++) {
            const sh = Math.round(open * (i + 1) / depth);
            if (sh >= 1) ctx.fillRect(ax + i, ay - sh, 1, sh * 2);
          }
        } else if (dir.dx < 0) {
          for (let i = 0; i < depth; i++) {
            const sh = Math.round(open * (i + 1) / depth);
            if (sh >= 1) ctx.fillRect(ax - i - 1, ay - sh, 1, sh * 2);
          }
        } else if (dir.dy > 0) {
          for (let i = 0; i < depth; i++) {
            const sh = Math.round(open * (i + 1) / depth);
            if (sh >= 1) ctx.fillRect(ax - sh, ay + i, sh * 2, 1);
          }
        } else {
          for (let i = 0; i < depth; i++) {
            const sh = Math.round(open * (i + 1) / depth);
            if (sh >= 1) ctx.fillRect(ax - sh, ay - i - 1, sh * 2, 1);
          }
        }
      }
    }

    if (window.ClawdStats) {
      window.ClawdStats.drawHat(ctx, cx, cy - h / 2, frightenedTimer > 0 ? 4 : 3);
      window.ClawdStats.drawSparkles(ctx, cx, cy, w / 2 + 4);
    }
  }

  // Tiny Clawd icon for the lives indicator.
  function drawMiniClawd(cx, cy) {
    const O = (window.ClawdStats && window.ClawdStats.getActiveSkinColor()) || '#d97757';
    const B = '#141413';
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
      G  = flashing ? '#faf9f5' : '#2A4FB8';
      Wh = flashing ? '#2A4FB8' : '#faf9f5';
      B  = flashing ? '#2A4FB8' : '#c1574b';
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

  // Mac-Pan music — classic-arcade SQUARE wave for the harsh chase texture.
  // Single oscillator per tick (no bass doubling) to keep audio load light;
  // E-minor descending phrase still reads as chase tension vs Dino's triangle.
  const MUSIC_NOTES = [659, 587, 523, 494, 440, 494, 523, 587];
  let musicIdx = 0, musicTimer = null;
  function startMusic() {
    if (musicTimer || !soundOn) return;
    getAudioCtx();
    musicTimer = setInterval(() => {
      if (!soundOn) return;
      beep({ freq: MUSIC_NOTES[musicIdx], type: 'square', duration: 0.1, volume: 0.03 });
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
    } else if (kind === 'combo') {
      // Big sparkle for PERFECT CHAIN (4 ghosts in one frightened window).
      beep({ freq: 784,  type: 'triangle', duration: 0.09, volume: 0.13 });
      beep({ freq: 988,  type: 'triangle', duration: 0.09, volume: 0.13, delay: 0.07 });
      beep({ freq: 1175, type: 'triangle', duration: 0.09, volume: 0.13, delay: 0.14 });
      beep({ freq: 1568, type: 'triangle', duration: 0.22, volume: 0.16, delay: 0.21 });
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
        playSound('pellet');
      }
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

  // Mouse: click starts the game, then movement continuously steers Clawd
  // toward the cursor (dominant axis wins, with a small dead zone).
  function mouseDirection(e) {
    if (!player) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (W / rect.width);
    const cy = (e.clientY - rect.top)  * (H / rect.height);
    const ddx = cx - player.x;
    const ddy = cy - player.y;
    if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return null;
    return Math.abs(ddx) > Math.abs(ddy)
      ? { dx: ddx > 0 ? 1 : -1, dy: 0 }
      : { dx: 0, dy: ddy > 0 ? 1 : -1 };
  }
  canvas.addEventListener('click', e => {
    if (gameOver) { reset(); return; }
    const queued = mouseDirection(e);
    if (queued) player.nextDir = queued;
    if (!gameStarted) {
      gameStarted = true; startMusic();
      if (isFirstPlay) { localStorage.setItem(ONBOARDED_KEY, '1'); isFirstPlay = false; }
      if (window.ClawdStats) window.ClawdStats.trackSessionStart({ gameId: 'chomp', dailyMode: dailyMode, dateISO: todayISO });
    }
  });
  canvas.addEventListener('mousemove', e => {
    if (!gameStarted || gameOver) return;
    const queued = mouseDirection(e);
    if (queued) player.nextDir = queued;
  });

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
