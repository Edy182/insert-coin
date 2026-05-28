// Insert Coin — shared background music player.
//
// One implementation, three games. Handles:
//   - Shuffle queue with no per-cycle repeats and no boundary repeats.
//   - Fade-in on start (800ms ease) and fade-out on stop (400ms ease).
//   - 1.5s equal-power crossfade between consecutive tracks (no dead air).
//   - Mute state shared across all games + landing via localStorage
//     (key: clawd-music-muted). Mute on Dino, open Snake → still muted.
//   - Pause when the tab is hidden, resume when it becomes visible.
//   - Error / autoplay-block recovery: skip to next track without stalling.
//
// Usage:
//   const music = ClawdMusic.init({
//     tracks: ['../../assets/sounds/foo-1.mp3', '../../assets/sounds/foo-2.mp3'],
//     volume: 0.35,
//   });
//   music.start();           // fade-in + crossfade rotation begins
//   music.stop();            // fade-out + stop
//   music.toggle();          // toggle mute, persisted across pages
//   music.isMuted();         // current mute state

(function () {
  'use strict';

  const MUTE_KEY    = 'clawd-music-muted';
  // No fade-in: arcade music kicks in punchy from frame 1, like the originals.
  // Fade-out on mute / stop softens the harsh cut. Crossfade between tracks
  // hides the seams without affecting the start-of-game feel.
  const FADE_OUT_MS = 400;
  const CROSSFADE_MS = 1500;
  const CROSSFADE_S  = CROSSFADE_MS / 1000;

  function readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
  }
  function writeMuted(v) {
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (_) {}
  }

  // Smooth quadratic ease-in-out from `from` to `to` over `ms` milliseconds.
  function fade(audio, from, to, ms, done) {
    audio.volume = Math.max(0, Math.min(1, from));
    if (ms <= 0) { audio.volume = to; if (done) done(); return; }
    const t0 = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * e));
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    }
    requestAnimationFrame(step);
  }

  function init(opts) {
    const tracks = opts.tracks;
    const target = opts.volume != null ? opts.volume : 0.35;
    if (!tracks || tracks.length === 0) return noopPlayer();

    let bgm = null, nextBgm = null, lastIdx = -1, queue = [];
    let muted = readMuted();
    let watcher = null;

    function refill() {
      queue = tracks.map((_, i) => i);
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      // Avoid boundary repeat (e.g. shuffle ended on track 2, next shuffle
      // starts on track 2) by swapping the first two when needed.
      if (queue.length > 1 && queue[0] === lastIdx) {
        [queue[0], queue[1]] = [queue[1], queue[0]];
      }
    }
    function consumeNext() {
      if (queue.length === 0) refill();
      lastIdx = queue.shift();
      return lastIdx;
    }

    // Pre-shuffle so the first pick is random across page loads, and
    // pre-buffer the first track so playback starts without a fetch gap.
    refill();
    let preloaded = new Audio(tracks[queue[0]]);
    preloaded.preload = 'auto';
    preloaded.load();

    function makeAudio(src) {
      const a = new Audio(src);
      a.preload = 'auto';
      return a;
    }

    function attachFallback(audio) {
      // If a track ends or errors before the crossfade watcher triggers,
      // jump straight to the next one with no audible gap.
      audio.onended = () => { if (bgm === audio) bgm = null; if (!muted) playNext(); };
      audio.onerror = () => { if (bgm === audio) bgm = null; if (!muted) playNext(); };
    }

    function attachWatcher() {
      stopWatcher();
      watcher = setInterval(() => {
        if (!bgm || nextBgm) return;
        if (!isFinite(bgm.duration) || bgm.duration <= 0) return;
        const remaining = bgm.duration - bgm.currentTime;
        if (remaining > 0 && remaining <= CROSSFADE_S) startCrossfade();
      }, 200);
    }
    function stopWatcher() {
      if (watcher) { clearInterval(watcher); watcher = null; }
    }

    function startCrossfade() {
      const old = bgm;
      old.onended = null;
      old.onerror = null;
      const audio = makeAudio(tracks[consumeNext()]);
      audio.volume = 0;
      nextBgm = audio;
      const p = audio.play();
      const begin = () => {
        fade(audio, 0, target, CROSSFADE_MS);
        fade(old, old.volume, 0, CROSSFADE_MS, () => {
          old.pause(); old.src = '';
          bgm = nextBgm;
          nextBgm = null;
          attachFallback(bgm);
          attachWatcher();
        });
      };
      if (p && p.then) p.then(begin).catch(() => { nextBgm = null; attachFallback(old); });
      else begin();
    }

    function playNext() {
      if (muted) return;
      let audio;
      if (preloaded) {
        audio = preloaded;
        preloaded = null;
        consumeNext();
      } else {
        audio = makeAudio(tracks[consumeNext()]);
      }
      bgm = audio;
      bgm.volume = target;
      const p = bgm.play();
      const onPlay = () => {
        attachFallback(bgm);
        attachWatcher();
      };
      if (p && p.then) {
        p.then(onPlay).catch(() => {
          // Autoplay blocked or transient error. Drop bgm so a later start()
          // call (e.g. from a user gesture) can try again.
          bgm = null;
        });
      } else {
        onPlay();
      }
    }

    function start() {
      if (muted || bgm) return;
      playNext();
    }

    function stop() {
      stopWatcher();
      if (nextBgm) { nextBgm.pause(); nextBgm.src = ''; nextBgm = null; }
      if (bgm) {
        const b = bgm;
        bgm = null;
        b.onended = null;
        b.onerror = null;
        fade(b, b.volume, 0, FADE_OUT_MS, () => b.pause());
      }
    }

    function setMutedState(v) {
      muted = !!v;
      writeMuted(muted);
      if (muted) stop();
    }
    function toggle() {
      setMutedState(!muted);
      return muted;
    }

    // Pause when tab hidden, resume when visible. We track the "was playing"
    // state explicitly so the resume actually fires — the previous version
    // checked .paused which can flip in subtle ways during a tab switch.
    let resumeBgm = false;
    let resumeNext = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        resumeBgm  = !!(bgm && !bgm.paused);
        resumeNext = !!(nextBgm && !nextBgm.paused);
        if (bgm)     bgm.pause();
        if (nextBgm) nextBgm.pause();
      } else {
        if (muted) return;
        if (bgm && resumeBgm)         bgm.play().catch(() => {});
        if (nextBgm && resumeNext)    nextBgm.play().catch(() => {});
        resumeBgm = resumeNext = false;
      }
    });

    return {
      start,
      stop,
      toggle,
      isMuted: () => muted,
      setMuted: setMutedState,
    };
  }

  function noopPlayer() {
    return { start() {}, stop() {}, toggle() { return false; }, isMuted: () => false, setMuted() {} };
  }

  window.ClawdMusic = { init, MUTE_KEY };
})();
