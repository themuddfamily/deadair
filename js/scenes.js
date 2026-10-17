/* DEAD AIR — scenes.js
 * DA.scenes: every full-screen cinematic in the game (PLAN §6.7, second half).
 *   drive(opts)        mode 'drive'      pseudo-3D night road in the rain (arrive/loop/escape/dawn/months_later)
 *   play(steps, opts)  mode 'cutscene'   generic step runner (cards, captions, voices, fades, images)
 *   multiverse(secs)   mode 'multiverse' the Open-the-channel montage of dozens of radio rooms
 *   death(info)        mode 'death'      radio static → "Station Fourteen?" → LOAD ARCHIVE
 *   ending(id)         mode 'ending'     final cinematic tails + credits (+ post-credits) → title
 *   credits(opts)      mode 'credits'    slow scroll
 *
 * Every scene draws a 480×270 pixel-art canvas (scaled like #view) with DOM text on top, sized
 * with var(--u). Scene time advances only inside the mode's update(dt), so DA.step(dt) drives
 * scenes deterministically and pausing (a mode pushed on top) freezes them. All cross-module
 * calls are null-guarded; the module works alone (see dev/scenes.html).
 *
 * ADDITIONS beyond PLAN.md (backwards compatible):
 *   DA.scenes.current()          → name of the active scene mode or null
 *   DA.scenes.skip()             → skip the active skippable scene (same as Esc)
 *   DA.scenes.scene()            → the active Scene instance (dev tools / tests: .t, .road, .grid …)
 *   DA.scenes.postCredits(lines) → the researchers' tape (secret ending); ending('secret') uses it
 *   DA.scenes.Road               → the pseudo-3D road renderer class (new Road(canvas, cfg))
 *   DA.scenes.staticFx(canvas)   → animated static renderer {level, bar, update(dt), draw()}
 *   modes 'multiverse', 'ending' (black base layer under an ending's tail), 'credits'
 *   Every promise resolves (never rejects): 'done' | 'skipped' | 'aborted' (mode removed from
 *   outside, e.g. DA.modes.clear()); death → 'load' | 'title'.
 *   drive opts: {kind, loop, captions:[{at, text, dur?, style?:'line'}], radioLine (string |
 *     string[] | {s,t} | [{s,t}]), radioSpeaker, skippable, time ('HH:MM' on the car radio for
 *     months_later), block (also pause the world while driving; default false so DA.clock runs
 *     and the car radio shows DA.clock time)}. Esc without skippable pushes 'pause' if running.
 *   play opts: {transparent, skippable, block, fadeIn (true = start black | secs = fade in),
 *     textOver (text above the fade layer: a fade dims the image, never the words)}
 *   play steps (extra): {clear: true|secs} · {static: level} · {ambience: {…}} · {silence: secs}
 *     · {stinger: kind} · text steps: {keep: true} (stays until {clear}), {label} · voice
 *     steps: {style: 'type'|'center' (in-scene transcript instead of a subtitle), label, keep,
 *     nowait, gap, clarity, vol, phone, maxLines (rolling transcript, default 4)} · images also
 *     'tape' (reel counter) and 'road' (alias of 'dawn') · {image, level} for 'static'.
 *   ending(id) reads DA.content.endings[id]: destroy {card, lines (captions on the drive), radio,
 *     radioSpeaker}, maintain {realize, lines}, secret {captions}, post_secret [{s,t}|{sfx,cap,d}],
 *     credits {lines|text} (blank lines split sections), [id].title / .sub in the credits.
 *   events: 'scene:start' {mode, kind}, 'scene:end' {mode, kind, result}
 *   WAVE 3: months_later is a winter drive (ENV 'winter': flat grey overcast, bare trees, snow-dusted
 *     pines, old snow along the verges — 'FEBRUARY 2000'); Road cfg {winter}. The loop drive's guide
 *     signs come from DA.content.drive.loop.signs (pairs per loop; drive opts.signs overrides). The
 *     multiverse montage lights each cell by its own timeline (DA.world.lightAs: lit / day /
 *     abandoned / a few emergency-red cells) instead of tonight's dead power. The maintain tail dims
 *     the dawn under the lines and draws them above the fade (play opts.textOver); centre-style
 *     text has a dark backing band. Credits hide the secret ending's slot until it has been found.
 *   FIX-D: during a drive the subtitle band (DA.ui's .ui-bottom and the scene's fallback strip) sits
 *     above the dashboard (scenes.css), never over the car stereo's LCD or the gauges.
 *   Optional audio used when present: DA.audio.has('wipers') + sound 'wipers', 'rain_car',
 *   car_drive handle.set({speed}), DA.audio.ambience() snapshot (restored after a drive), and
 *   DA.audio.sfxBus|master + ctx for the car-radio music and a synthesized wiper fallback.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;

  const W = 480, H = 270;
  const TAU = Math.PI * 2;
  const clamp = U.clamp, lerp = U.lerp, smooth = U.smoothstep;

  /* ============================================================ helpers */

  /** Safe audio facade: every call is a no-op when DA.audio (or the call) is missing. */
  const A = {
    ok(fn) { return !!(DA.audio && typeof DA.audio[fn] === 'function'); },
    has(name) {
      if (!DA.audio) return false;
      if (typeof DA.audio.has === 'function') { try { return !!DA.audio.has(name); } catch (e) { return false; } }
      return true;
    },
    play(name, o) {
      if (!A.ok('play')) return null;
      try { return DA.audio.play(name, o || {}) || null; } catch (e) { console.warn('[scenes] audio.play', name, e); return null; }
    },
    loop(name, o) {
      if (!A.ok('loop')) return null;
      try { return DA.audio.loop(name, o || {}) || null; } catch (e) { console.warn('[scenes] audio.loop', name, e); return null; }
    },
    ambience(p) { if (A.ok('ambience')) try { DA.audio.ambience(p); } catch (e) { console.warn(e); } },
    static(level, o) { if (A.ok('radioStatic')) try { DA.audio.radioStatic(level, o); } catch (e) { console.warn(e); } },
    silence(s) { if (A.ok('silence')) try { DA.audio.silence(s); } catch (e) { console.warn(e); } },
    stinger(k) { if (A.ok('stinger')) try { DA.audio.stinger(k); } catch (e) { console.warn(e); } },
    /** Always returns {dur, stop()} so callers can time lines without audio. */
    voice(text, spk, o) {
      let h = null;
      if (A.ok('voice')) try { h = DA.audio.voice(text, spk, o || {}); } catch (e) { console.warn('[scenes] voice', e); }
      const dur = h && isFinite(h.dur) ? h.dur : U.lineDur(text);
      return { dur, stop() { try { h && h.stop && h.stop(); } catch (e) { /* ignore */ } } };
    },
    stop(h, fade) { try { h && h.stop && h.stop(fade); } catch (e) { /* ignore */ } },
    set(h, params) { try { h && h.set && h.set(params); } catch (e) { /* ignore */ } },
    /** Current ambience params (audio.js returns a copy when called without arguments). */
    ambienceGet() { try { return A.ok('ambience') ? DA.audio.ambience() || null : null; } catch (e) { return null; } },
    vol(h, v) { try { h && h.setVol && h.setVol(v); } catch (e) { /* ignore */ } },
    /** Raw WebAudio context + destination if the audio module exposes them (optional). */
    raw() {
      const a = DA.audio;
      const ctx = a && (a.ctx || a.context);
      if (!ctx || typeof ctx.createOscillator !== 'function' || ctx.state === 'closed') return null;
      const dest = a.sfxBus || a.master || a.out || a.output || ctx.destination;
      return { ctx, dest };
    },
  };

  /** Subtitles through DA.ui when present; otherwise a fallback strip inside the active scene. */
  function subtitle(text, o) {
    if (DA.ui && typeof DA.ui.subtitle === 'function') {
      try { return DA.ui.subtitle(text, o || {}); } catch (e) { console.warn(e); }
    }
    const sc = topScene();
    if (sc) sc.fallbackSub(text, o || {});
    return null;
  }
  function clearSubtitles() {
    if (DA.ui && typeof DA.ui.clearSubtitles === 'function') try { DA.ui.clearSubtitles(); } catch (e) { /* ignore */ }
    const sc = topScene();
    if (sc && sc.subEl) sc.subEl.textContent = '';
  }
  function speakerName(id) {
    const sp = DA.content && DA.content.speakers && DA.content.speakers[id];
    return (sp && sp.name) || String(id || '').replace(/_/g, ' ').toUpperCase();
  }
  /** Normalise a content line (string | {s,t,d} | {speaker,text}) into {s, t, d}. */
  function lineOf(x, defSpeaker) {
    if (x == null) return null;
    if (typeof x === 'string') return { s: defSpeaker, t: x };
    const t = x.t != null ? x.t : x.text;
    if (t == null) return null;
    return { s: x.s || x.speaker || defSpeaker, t: String(t), d: x.d, gap: x.gap, label: x.label };
  }
  function linesOf(arr, defSpeaker) {
    if (arr == null) return [];
    if (!Array.isArray(arr)) {
      if (typeof arr === 'object' && Array.isArray(arr.lines)) arr = arr.lines;
      else arr = [arr];
    }
    return arr.map((l) => lineOf(l, defSpeaker)).filter(Boolean);
  }
  function content(path) {
    let o = DA.content;
    for (const k of path.split('.')) { if (o == null) return undefined; o = o[k]; }
    return o;
  }
  const fmt = (t) => (DA.fmt ? DA.fmt(t) : String(t));

  /* ========================================================== pixel fonts */
  // 5×7 (signs, newspaper) — each glyph = 7 rows of 5 bits (bit 4 = leftmost column).
  const F57 = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    '-': [0, 0, 0, 31, 0, 0, 0], '—': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
    ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0], '/': [1, 1, 2, 4, 8, 16, 16],
    "'": [4, 4, 8, 0, 0, 0, 0], '<': [0, 4, 8, 31, 8, 4, 0], '>': [0, 4, 2, 31, 2, 4, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
  };
  // 3×5 (LCDs, mile markers) — 5 rows of 3 bits.
  const F35 = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
    F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
    K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
    P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
    Z: [7, 1, 2, 4, 7],
    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1],
    5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
    ':': [0, 2, 0, 2, 0], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0], '/': [1, 1, 2, 4, 4], ' ': [0, 0, 0, 0, 0],
  };
  /** Text width in pixels for a font (glyph width + 1 spacing). */
  function textW(str, big) { return str.length * (big ? 6 : 4) - 1; }
  /**
   * Draw bitmap text into any RGBA buffer {w, h, px (Uint8ClampedArray)} (+ optional mat array).
   * scale = integer pixel scale.
   */
  function drawText(buf, str, x, y, rgb, big, scale, mat, matVal) {
    const font = big ? F57 : F35, gw = big ? 5 : 3, gh = big ? 7 : 5;
    scale = scale || 1;
    str = String(str).toUpperCase();
    let cx = x;
    for (const ch of str) {
      const g = font[ch] || font[' '];
      for (let r = 0; r < gh; r++) {
        const bits = g[r];
        for (let c = 0; c < gw; c++) {
          if (!(bits & (1 << (gw - 1 - c)))) continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            const px = cx + c * scale + sx, py = y + r * scale + sy;
            if (px < 0 || py < 0 || px >= buf.w || py >= buf.h) continue;
            const i = py * buf.w + px;
            buf.px[i * 4] = rgb[0]; buf.px[i * 4 + 1] = rgb[1]; buf.px[i * 4 + 2] = rgb[2]; buf.px[i * 4 + 3] = 255;
            if (mat) mat[i] = matVal;
          }
        }
      }
      cx += (gw + 1) * scale;
    }
  }

  /* ======================================================= noise tables */
  const NOISE = new Uint8Array(65536);   // white noise 256×256
  const VNOISE = new Uint8Array(65536);  // smooth value noise 256×256 (wraps)
  (function buildNoise() {
    const rnd = U.mulberry32(1999);
    for (let i = 0; i < 65536; i++) NOISE[i] = (rnd() * 256) | 0;
    // 3 octaves of bilinear value noise, tiling at 256
    const oct = (cell) => {
      const n = 256 / cell, g = new Float32Array(n * n);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      return (x, y) => {
        const gx = x / cell, gy = y / cell;
        const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = g[(y0 % n) * n + (x0 % n)], b = g[(y0 % n) * n + ((x0 + 1) % n)];
        const c = g[((y0 + 1) % n) * n + (x0 % n)], d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
      };
    };
    const o1 = oct(64), o2 = oct(32), o3 = oct(16), o4 = oct(8);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = o1(x, y) * 0.45 + o2(x, y) * 0.28 + o3(x, y) * 0.17 + o4(x, y) * 0.1;
      VNOISE[y * 256 + x] = clamp((v - 0.5) * 1.6 + 0.5, 0, 1) * 255;
    }
  })();
  const vn = (x, y) => VNOISE[((y & 255) << 8) | (x & 255)];
  const wn = (x, y) => NOISE[((y & 255) << 8) | (x & 255)];
  const hash01 = (i, salt) => {
    let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
    h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  /* =================================================== scene lifecycle */
  class Cancelled extends Error {}
  const live = {};        // mode name → stack of Scene instances (mirrors DA.modes order)
  let endingDepth = 0;    // >0 while an ending runs: every scene pauses the world

  function topScene() {
    const t = DA.modes && DA.modes.top();
    if (!t) return null;
    const arr = live[t.name];
    return arr && arr.length ? arr[arr.length - 1] : null;
  }

  /**
   * Scene promises reject with Cancelled when the scene dies. Fire-and-forget uses (a fade we do
   * not await) must not surface as unhandled rejections, so each is pre-marked handled; code that
   * awaits it still receives the rejection and unwinds.
   */
  const quiet = (p) => { p.catch(() => {}); return p; };

  /**
   * One running scene: owns its DOM, its private clock (advanced by the mode's update) and the
   * promises its script awaits. kill() rejects pending waits so the script unwinds silently.
   */
  class Scene {
    constructor(mode, opts) {
      this.mode = mode;
      this.opts = opts || {};
      this.kind = this.opts.kind || mode;
      this.t = 0;
      this.dead = false;
      this.finished = false;
      this.result = null;
      this.waits = [];
      this.preds = [];
      this.tweens = [];
      this.binds = [];      // [{el, o}] — el.style.opacity follows o.v every frame
      this.caps = [];
      this.handles = [];
      this.fadeV = 1;       // opacity of the scene's fade layer (if any)
      this.fadeEl = null;
      this.opaque = !this.opts.transparent;
      this.block = !!this.opts.block;
      this.el = U.el('div', { class: 'sc-scene sc-' + mode + (this.opaque ? '' : ' sc-transparent') });
      this.onUpdate = null;
      this.onRender = null;
      this.onKey = null;
      this.subEl = null;
    }
    /** Resolve after `sec` seconds of scene time. */
    wait(sec) {
      if (this.dead) return quiet(Promise.reject(new Cancelled()));
      return quiet(new Promise((res, rej) => this.waits.push({ at: this.t + Math.max(0, sec || 0), res, rej })));
    }
    /** Resolve when pred() is truthy (polled each scene frame); false after timeout seconds. */
    until(pred, timeout) {
      if (this.dead) return quiet(Promise.reject(new Cancelled()));
      return quiet(new Promise((res, rej) => this.preds.push({ pred, res, rej, end: timeout ? this.t + timeout : Infinity })));
    }
    /** Await any promise, then throw Cancelled if the scene died meanwhile. */
    do(p) {
      return Promise.resolve(p).then((v) => {
        if (this.dead) throw new Cancelled();
        return v;
      });
    }
    check() { if (this.dead) throw new Cancelled(); }
    /** Run fn at scene time t (ignored if the scene dies first). */
    at(t, fn) {
      this.wait(Math.max(0, t - this.t)).then(() => { if (!this.dead) try { fn(); } catch (e) { console.error('[scenes] at', e); } }, () => {});
    }
    /** Animate obj[key] to `to` over secs of scene time; resolves when done. */
    tween(obj, key, to, secs) {
      if (this.dead) return quiet(Promise.reject(new Cancelled()));
      for (const tw of this.tweens.filter((w) => w.obj === obj && w.key === key)) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.res(false); }
      return quiet(new Promise((res, rej) => this.tweens.push({ obj, key, from: obj[key], to, dur: Math.max(1e-4, secs || 0), t: 0, res, rej })));
    }
    /** Fade a DOM element's opacity on the scene clock. */
    opacity(el, to, secs) {
      let b = this.binds.find((x) => x.el === el);
      if (!b) { b = { el, o: { v: parseFloat(el.style.opacity || '0') || 0 } }; this.binds.push(b); }
      return this.tween(b.o, 'v', to, secs);
    }
    /** Fade the scene's black layer: 1 = black, 0 = clear. */
    fadeTo(to, secs) { return this.tween(this, 'fadeV', to, secs); }
    /** Timed caption in container `box` (DOM), faded in/out by scene time. */
    caption(box, text, dur, cls) {
      const el = U.el('div', { class: 'sc-cap' + (cls ? ' ' + cls : ''), text: fmt(text) });
      el.style.opacity = '0';
      box.appendChild(el);
      this.caps.push({ el, t0: this.t, dur: dur || 4.5 });
      return el;
    }
    tick(dt) {
      this.t += dt;
      if (this.tweens.length) {
        for (const tw of this.tweens.slice()) {
          tw.t += dt;
          const k = clamp(tw.t / tw.dur, 0, 1);
          tw.obj[tw.key] = lerp(tw.from, tw.to, k);
          if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.res(true); }
        }
      }
      if (this.fadeEl) this.fadeEl.style.opacity = String(clamp(this.fadeV, 0, 1));
      if (this.binds.length) {
        for (const b of this.binds.slice()) {
          if (!b.el.isConnected) { this.binds.splice(this.binds.indexOf(b), 1); continue; }
          b.el.style.opacity = String(clamp(b.o.v, 0, 1));
        }
      }
      if (this.caps.length) {
        for (const c of this.caps.slice()) {
          const a = this.t - c.t0;
          const o = Math.min(smooth(0, 0.9, a), 1 - smooth(c.dur - 0.9, c.dur, a));
          c.el.style.opacity = String(o);
          if (a >= c.dur) { c.el.remove(); this.caps.splice(this.caps.indexOf(c), 1); }
        }
      }
      if (this.waits.length) {
        const due = this.waits.filter((w) => w.at <= this.t + 1e-9);
        if (due.length) {
          this.waits = this.waits.filter((w) => w.at > this.t + 1e-9);
          due.sort((a, b) => a.at - b.at).forEach((w) => w.res(true));
        }
      }
      if (this.preds.length) {
        for (const p of this.preds.slice()) {
          let ok = false;
          try { ok = !!p.pred(); } catch (e) { console.error('[scenes] until', e); }
          if (ok || this.t >= p.end) {
            this.preds.splice(this.preds.indexOf(p), 1);
            p.res(ok);
          }
        }
      }
    }
    track(h) { if (h) this.handles.push(h); return h; }
    kill() {
      if (this.dead) return;
      this.dead = true;
      const err = new Cancelled();
      this.waits.splice(0).forEach((w) => w.rej(err));
      this.preds.splice(0).forEach((p) => p.rej(err));
      this.tweens.splice(0).forEach((w) => w.rej(err));
      this.handles.splice(0).forEach((h) => A.stop(h, 0.3));
      if (this.onKill) try { this.onKill(); } catch (e) { console.error(e); }
    }
    fallbackSub(text, o) {
      if (!this.subEl) {
        this.subEl = U.el('div', { class: 'sc-sub' });
        this.el.appendChild(this.subEl);
      }
      const who = o.speaker ? speakerName(o.speaker) + ': ' : '';
      this.subEl.textContent = (o.kind === 'radio' ? '[RADIO] ' : '') + who + text;
      clearTimeout(this.subTimer);
      this.subTimer = setTimeout(() => { if (this.subEl) this.subEl.textContent = ''; }, (o.dur || U.lineDur(text)) * 1000 + 400);
    }
  }

  function mountPoint() {
    return document.getElementById('screens') || document.getElementById('stage') || document.body;
  }

  /** Mode definition shared by every scene mode; per-instance behaviour lives on the Scene. */
  function makeMode(name, extra) {
    const cur = () => { const a = live[name]; return a && a.length ? a[a.length - 1] : null; };
    return Object.assign({
      lock: false,
      get opaque() { const s = cur(); return s ? s.opaque : true; },
      get blocksWorld() { const s = cur(); return endingDepth > 0 || (s ? s.block : false); },
      enter(sc) {
        if (!(sc instanceof Scene)) { // pushed without a scene (e.g. by hand) → inert black layer
          sc = new Scene(name, {});
          sc.orphan = true;
        }
        (live[name] = live[name] || []).push(sc);
        mountPoint().appendChild(sc.el);
        DA.bus.emit('scene:start', { mode: name, kind: sc.kind });
      },
      exit() {
        const arr = live[name];
        const sc = arr && arr.pop();
        if (!sc) return;
        if (sc.el.parentNode) sc.el.parentNode.removeChild(sc.el);
        sc.kill();
        finish(sc, sc.result != null ? sc.result : 'aborted', true);
      },
      update(dt, isTop) {
        const sc = cur();
        if (!sc || sc.dead) return;
        sc.tick(dt);
        if (sc.onUpdate) sc.onUpdate(dt, isTop);
      },
      render(isTop) {
        const sc = cur();
        if (sc && !sc.dead && sc.onRender) sc.onRender(isTop);
      },
      onKey(e, down) {
        const sc = cur();
        if (!sc || sc.dead) return false;
        if (sc.onKey) return !!sc.onKey(e, down);
        return false;
      },
    }, extra || {});
  }

  /** Resolve a scene's promise exactly once and take its mode off the stack if still there. */
  function finish(sc, result, fromExit) {
    if (sc.finished) return;
    sc.finished = true;
    if (!fromExit) {
      const arr = live[sc.mode];
      if (arr && arr[arr.length - 1] === sc && DA.modes.has(sc.mode)) DA.modes.pop(sc.mode);
      else sc.kill();
    }
    DA.bus.emit('scene:end', { mode: sc.mode, kind: sc.kind, result });
    if (sc.resolve) sc.resolve(result);
  }

  /**
   * Push `mode` with a new Scene, run `script(sc)`; the returned promise resolves with the
   * script's return value (or sc.result / 'aborted' when the mode is popped from outside).
   */
  function runScene(mode, opts, build, script) {
    const sc = new Scene(mode, opts);
    return new Promise((resolve) => {
      sc.resolve = resolve;
      try { if (build) build(sc); } catch (e) { console.error('[scenes] build ' + mode, e); }
      if (!DA.modes.defs[mode]) { console.error('[scenes] mode not registered', mode); resolve('aborted'); return; }
      DA.modes.push(mode, sc);
      Promise.resolve()
        .then(() => script(sc))
        .then(
          (r) => finish(sc, r !== undefined ? r : sc.result != null ? sc.result : 'done'),
          (err) => {
            if (!(err instanceof Cancelled)) console.error('[scenes] ' + mode, err);
            finish(sc, sc.result != null ? sc.result : 'aborted');
          }
        );
    });
  }

  /** Canvas helper: a 480×270 pixel canvas that fills the scene. */
  function sceneCanvas(sc, cls) {
    const c = U.el('canvas', { class: 'sc-canvas' + (cls ? ' ' + cls : ''), width: W, height: H });
    sc.el.appendChild(c);
    return c;
  }
  /** A full-scene fade layer whose opacity the scene sets per frame. */
  function fadeLayer(sc, color, start) {
    const f = U.el('div', { class: 'sc-fade', style: { background: color || '#000', opacity: String(start == null ? 1 : start) } });
    sc.el.appendChild(f);
    sc.fadeEl = f;
    sc.fadeV = start == null ? 1 : start;
    return f;
  }

  // Shared namespace, filled in by the later sections of this file.
  const S = (DA.scenes = DA.scenes || {});


  /* ================================================================
   * ROAD RENDERER — part 1: environments, sprites, cockpit
   * A software pseudo-3D road (OutRun-style segment projection) rasterised per scanline into
   * a 480×270 RGBA buffer, with procedural roadside sprites, rain, windshield, wipers and a
   * cockpit. Units are metres; the camera is the driver's eye.
   * ================================================================ */

  /** Weather/light presets. Colours are [r,g,b]; everything interpolates (lerpEnv). */
  const ENV = {
    night: {
      skyTop: [7, 9, 14], skyHor: [25, 30, 39], cloud: [40, 46, 58], cloudAmt: 0.8,
      fog: [19, 23, 30], fogNear: 12, fogFar: 220,
      ridgeFar: [16, 19, 25], ridgeNear: [12, 14, 19], treeline: [9, 11, 14],
      ambient: 0.06, interior: 0.3, headlights: 1, rain: 1, wet: 1, lightning: 1,
      glow: [0, 0, 0], glowAmt: 0, haze: 1, autumn: 0, dry: 0, gauges: 1,
    },
    predawn: {
      skyTop: [22, 28, 42], skyHor: [72, 74, 86], cloud: [52, 56, 68], cloudAmt: 0.7,
      fog: [44, 48, 58], fogNear: 20, fogFar: 300,
      ridgeFar: [36, 40, 52], ridgeNear: [24, 28, 36], treeline: [16, 19, 24],
      ambient: 0.3, interior: 0.35, headlights: 0.8, rain: 0.35, wet: 1, lightning: 0,
      glow: [120, 84, 70], glowAmt: 0.35, haze: 0.5, autumn: 0, dry: 0, gauges: 0.7,
    },
    dawn: {
      skyTop: [66, 82, 110], skyHor: [168, 166, 170], cloud: [138, 142, 156], cloudAmt: 0.5,
      fog: [132, 138, 148], fogNear: 30, fogFar: 400,
      ridgeFar: [112, 120, 138], ridgeNear: [88, 96, 112], treeline: [58, 66, 72],
      ambient: 0.82, interior: 0.7, headlights: 0.22, rain: 0.2, wet: 0.8, lightning: 0,
      glow: [230, 178, 140], glowAmt: 0.5, haze: 0.1, autumn: 0, dry: 0, gauges: 0.3,
    },
    day: {
      skyTop: [92, 134, 186], skyHor: [196, 208, 216], cloud: [232, 234, 236], cloudAmt: 0.45,
      fog: [176, 188, 198], fogNear: 60, fogFar: 700,
      ridgeFar: [132, 146, 164], ridgeNear: [104, 118, 132], treeline: [74, 70, 58],
      ambient: 1.0, interior: 1.0, headlights: 0, rain: 0, wet: 0, lightning: 0,
      glow: [255, 236, 200], glowAmt: 0.25, haze: 0, autumn: 1, dry: 1, gauges: 0,
    },
    /* late February under a flat grey overcast: bare trees, old snow along the verges (months_later) */
    winter: {
      skyTop: [112, 118, 126], skyHor: [172, 174, 176], cloud: [150, 153, 158], cloudAmt: 0.85,
      fog: [158, 162, 166], fogNear: 34, fogFar: 460,
      ridgeFar: [118, 122, 128], ridgeNear: [92, 96, 102], treeline: [58, 62, 64],
      ambient: 0.8, interior: 0.82, headlights: 0, rain: 0, wet: 0.25, lightning: 0,
      glow: [0, 0, 0], glowAmt: 0, haze: 0.08, autumn: 0, dry: 0.75, gauges: 0, winter: 1,
    },
  };
  function lerpEnv(a, b, t) {
    const o = {};
    for (const k in a) {
      const va = a[k], vb = b[k];
      if (Array.isArray(va)) o[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t), lerp(va[2], vb[2], t)];
      else if (typeof va === 'number') o[k] = lerp(va, vb, t);
      else o[k] = t < 0.5 ? va : vb;
    }
    return o;
  }

  /* ---- pixel sprite buffers: {w, h, px RGBA, mat} — mat 0 diffuse, 1 retro-reflective, 2 emissive,
   *      3 weakly retro-reflective (coloured sign sheeting behind bright legend) */
  function newPix(w, h) { return { w, h, px: new Uint8ClampedArray(w * h * 4), mat: new Uint8Array(w * h) }; }
  function pset(p, x, y, c, m) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
    const i = y * p.w + x;
    p.px[i * 4] = c[0]; p.px[i * 4 + 1] = c[1]; p.px[i * 4 + 2] = c[2]; p.px[i * 4 + 3] = 255;
    p.mat[i] = m || 0;
  }
  function prect(p, x0, y0, w, h, c, m) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pset(p, x, y, c, m); }
  const shade = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];

  /**
   * Pine silhouette: overlapping drooping tiers drawn top→bottom, each with a lit upper surface
   * and a shadowed underside, ragged tips, a spire and a short trunk.
   */
  function makePine(seed, w, h, snow) {
    const rnd = U.mulberry32(seed), p = newPix(w, h);
    const cx = w / 2 + (rnd() - 0.5) * 1.5;
    const trunkH = Math.max(3, Math.round(h * 0.08));
    const top = 1 + Math.round(rnd() * 2), bot = h - trunkH;
    const tiers = 6 + ((rnd() * 3) | 0), maxHW = w / 2 - 1;
    const lite = [54, 76, 58], base = [31, 48, 37], dark = [15, 25, 19];
    for (let x = Math.round(cx - 1); x <= Math.round(cx); x++) for (let y = bot - 4; y < h; y++) pset(p, x, y, [46, 36, 30]);
    for (let y = 0; y < top + 3; y++) pset(p, cx, y, dark);
    const span = (bot - top) / tiers;
    for (let k = 0; k < tiers; k++) {
      const t0 = top + k * span, th = span * 1.45;
      const wFull = maxHW * (0.28 + 0.72 * Math.pow((k + 1) / tiers, 0.9)) * (0.9 + rnd() * 0.2);
      const lean = (rnd() - 0.5) * 1.4;
      for (let y = Math.floor(t0); y < Math.min(bot, t0 + th); y++) {
        const v = (y - t0) / th;
        const hw = wFull * (0.3 + 0.7 * Math.pow(v, 0.75));
        const hl = hw + (rnd() - 0.5) * 1.6, hr = hw + (rnd() - 0.5) * 1.6;
        for (let x = Math.floor(cx - hl + lean * v); x <= Math.ceil(cx + hr + lean * v); x++) {
          const edge = Math.min(x - (cx - hl + lean * v), cx + hr + lean * v - x);
          if (v > 0.72 && edge < 2.2 && rnd() < 0.5) continue; // drooping ragged tips
          if (edge < 0.8 && rnd() < 0.35) continue;
          const side = (x - cx) / (hw + 0.01);
          let c = v < 0.3 ? (side < 0.15 ? lite : base) : v > 0.78 ? dark : base;
          if (rnd() < 0.04) c = c === lite ? base : lite;
          // old snow lodged on the upper face of each tier
          if (snow && v < 0.34 && rnd() < 0.55 - v) c = [188, 192, 196];
          pset(p, x, y, shade(c, 0.93 + rnd() * 0.1));
        }
      }
    }
    return p;
  }
  /** Deciduous late-autumn tree: clustered leaf blobs over a visible trunk. */
  function makeAutumn(seed, w, h, bare) {
    const rnd = U.mulberry32(seed), p = newPix(w, h);
    const cx = w / 2, trunkTop = h * (bare ? 0.2 : 0.45);
    const bark = [62, 52, 44];
    const branch = (x, y, ang, len, th) => {
      for (let i = 0; i < len; i++) {
        x += Math.cos(ang); y += Math.sin(ang);
        for (let k = 0; k < th; k++) pset(p, x + k, y, bark);
        ang += (rnd() - 0.5) * 0.25;
      }
      if (len > 5 && th > 0) {
        branch(x, y, ang - 0.5 - rnd() * 0.3, len * 0.62, Math.max(1, th - 1));
        branch(x, y, ang + 0.5 + rnd() * 0.3, len * 0.62, Math.max(1, th - 1));
      }
    };
    for (let y = trunkTop; y < h; y++) for (let x = -1; x <= 1; x++) pset(p, cx + x, y, bark);
    branch(cx, trunkTop + 2, -Math.PI / 2 - 0.4, h * 0.22, 2);
    branch(cx, trunkTop + 2, -Math.PI / 2 + 0.4, h * 0.22, 2);
    if (bare) return p;
    const pal = [[176, 90, 36], [150, 62, 30], [196, 146, 58], [118, 76, 42], [168, 112, 44]];
    const blobs = 26 + ((rnd() * 10) | 0);
    for (let b = 0; b < blobs; b++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const bx = cx + Math.cos(a) * r * w * 0.4, by = h * 0.34 + Math.sin(a) * r * h * 0.26;
      const br = 2 + rnd() * (w * 0.13), col = pal[(rnd() * pal.length) | 0];
      for (let y = -br; y <= br; y++) for (let x = -br; x <= br; x++) {
        if (x * x + y * y > br * br || rnd() < 0.22) continue;
        pset(p, bx + x, by + y, shade(col, (y < 0 ? 1.1 : 0.82) * (0.85 + rnd() * 0.25)));
      }
    }
    return p;
  }
  /** Green guide sign on two posts. lines: [{text, scale}] (scale 2 = legible from further away). */
  function makeGuideSign(lines, w, h) {
    w = w || 208; h = h || 104;
    const p = newPix(w, h), panelH = Math.round(h * 0.66);
    const post = [70, 72, 74];
    for (const px of [Math.round(w * 0.2), Math.round(w * 0.78)]) prect(p, px, panelH, 4, h - panelH, post);
    const green = [20, 98, 58], white = [236, 238, 228];
    prect(p, 0, 0, w, panelH, green, 3);
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, panelH - 1], [w - 1, panelH - 1]]) p.px[(y * w + x) * 4 + 3] = 0;
    for (let x = 3; x < w - 3; x++) { pset(p, x, 3, white, 1); pset(p, x, panelH - 4, white, 1); }
    for (let y = 3; y < panelH - 3; y++) { pset(p, 3, y, white, 1); pset(p, w - 4, y, white, 1); }
    const total = lines.reduce((s, l) => s + (l.scale || 2) * 7, 0) + (lines.length - 1) * 7;
    let y = Math.round((panelH - total) / 2);
    for (const l of lines) {
      const sc = l.scale || 2, tw = textW(l.text, true) * sc;
      drawText(p, l.text, Math.round((w - tw) / 2), y, white, true, sc, p.mat, 1);
      y += 7 * sc + 7;
    }
    return p;
  }
  /** Blue pentagon county route marker ("COUNTY" / number) on a post. */
  function makeCountyShield(num) {
    const w = 30, h = 72, p = newPix(w, h);
    prect(p, 14, 30, 2, h - 30, [70, 72, 74]);
    const yellow = [232, 190, 50], blue = [26, 52, 132];
    for (let y = 0; y < 32; y++) {
      const inset = y < 4 ? 4 - y : y > 20 ? Math.round((y - 20) * 1.1) : 0;
      for (let x = inset; x < w - inset; x++) {
        const border = x - inset < 2 || w - inset - x <= 2 || y < 2 || y > 29;
        pset(p, x, y, border ? yellow : blue, border ? 1 : 3);
      }
    }
    drawText(p, 'COUNTY', 4, 5, yellow, false, 1, p.mat, 1);
    const s = String(num), tw = textW(s, true) * 2;
    drawText(p, s, Math.round((w - tw) / 2), 12, yellow, true, 2, p.mat, 1);
    return p;
  }
  /** Small green reflective mile marker with stacked digits. */
  function makeMileMarker(num) {
    const s = String(num), w = 9, plateH = 4 + s.length * 6, h = plateH + 22, p = newPix(w, h);
    prect(p, 4, plateH, 1, h - plateH, [80, 82, 84]);
    prect(p, 0, 0, w, plateH, [20, 100, 58], 3);
    for (let i = 0; i < s.length; i++) drawText(p, s[i], 3, 2 + i * 6, [240, 240, 232], false, 1, p.mat, 1);
    return p;
  }
  function makeDelineator() {
    const p = newPix(3, 22);
    prect(p, 0, 0, 3, 22, [168, 168, 160]);
    prect(p, 0, 2, 3, 4, [255, 168, 40], 1);
    return p;
  }
  function makeRailPost() { const p = newPix(3, 10); prect(p, 0, 0, 3, 10, [66, 62, 56]); return p; }
  /** The station, seen from the road: a low concrete block with fluorescent windows. */
  function makeStation() {
    const w = 128, h = 40, p = newPix(w, h);
    const conc = [74, 76, 74], seam = [58, 60, 58], roof = [38, 40, 40];
    prect(p, 0, 6, w, h - 6, conc);
    prect(p, 0, 4, w, 3, roof);
    prect(p, 96, 0, 14, 4, [52, 54, 54]);                 // rooftop plant
    for (let x = 0; x < w; x += 16) prect(p, x, 7, 1, h - 7, seam);
    const lit = [196, 226, 208], blind = [132, 158, 144];
    const wins = [8, 24, 40, 76, 92, 108];
    wins.forEach((x, i) => {
      const on = i !== 2;
      for (let y = 15; y < 24; y++) for (let k = 0; k < 11; k++) {
        const c = on ? (y % 3 === 0 ? blind : lit) : [22, 26, 28];
        pset(p, x + k, y, c, on ? 2 : 0);
      }
      prect(p, x - 1, 24, 13, 1, [96, 98, 96]);
    });
    prect(p, 57, 22, 12, 18, [30, 30, 32]);               // door
    prect(p, 60, 25, 6, 5, [150, 170, 160], 2);           // door glass (lit lobby)
    prect(p, 60, 18, 6, 2, [255, 206, 140], 2);           // entrance lamp
    prect(p, 72, 27, 3, 2, [180, 180, 170]);              // plate
    return p;
  }
  /** Lattice mast (beacon drawn separately as a light). */
  function makeMast() {
    const w = 12, h = 128, p = newPix(w, h), c = [46, 48, 52];
    for (let y = 0; y < h; y++) {
      const v = y / h, half = 1 + v * 4.5;
      pset(p, w / 2 - half, y, c); pset(p, w / 2 + half, y, c);
      const ph = (y % 10) / 10;
      pset(p, w / 2 - half + ph * half * 2, y, c);
      if (y % 10 === 0) for (let x = -half; x <= half; x++) pset(p, w / 2 + x, y, c);
    }
    return p;
  }
  function makeLampPost() {
    const w = 14, h = 70, p = newPix(w, h), c = [58, 60, 62];
    prect(p, 10, 4, 2, h - 4, c);
    prect(p, 2, 3, 10, 1, c);
    prect(p, 1, 4, 5, 2, [255, 190, 110], 2);
    return p;
  }

  /** Lazily built sprite atlas (shared by all Road instances). */
  let SPR = null;
  function sprites() {
    if (SPR) return SPR;
    SPR = {
      pines: [makePine(11, 40, 104), makePine(23, 34, 92), makePine(37, 46, 116), makePine(41, 30, 84), makePine(53, 38, 110)],
      autumn: [makeAutumn(5, 44, 76), makeAutumn(9, 50, 84), makeAutumn(13, 40, 70), makeAutumn(17, 46, 80, true)],
      bare: [makeAutumn(5, 44, 76, true), makeAutumn(9, 50, 84, true), makeAutumn(13, 40, 70, true), makeAutumn(21, 38, 72, true)],
      snowPines: [makePine(11, 40, 104, true), makePine(23, 34, 92, true), makePine(37, 46, 116, true), makePine(53, 38, 110, true)],
      delineator: makeDelineator(),
      railPost: makeRailPost(),
      station: makeStation(),
      mast: makeMast(),
      lamp: makeLampPost(),
      signs: {},
      markers: {},
      shields: {},
    };
    return SPR;
  }
  function signSprite(key, lines) {
    const s = sprites();
    return s.signs[key] || (s.signs[key] = makeGuideSign(lines));
  }
  function markerSprite(n) { const s = sprites(); return s.markers[n] || (s.markers[n] = makeMileMarker(n)); }
  function shieldSprite(n) { const s = sprites(); return s.shields[n] || (s.shields[n] = makeCountyShield(n)); }

  /* ---- cockpit: crisp pixel shapes rasterised into a mat/albedo layer ---- */
  // mat codes: 0 glass (see-through), 1 body, 2 gauge glow, 3 radio LCD, 4 mirror glass
  let COCK = null;
  function cockpit() {
    if (COCK) return COCK;
    const mat = new Uint8Array(W * H), rgb = new Uint8ClampedArray(W * H * 3);
    const put = (x, y, c, m) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      mat[i] = m == null ? 1 : m;
      rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
    };
    const poly = (pts, c, m) => {
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
        const yc = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) put(x, y, typeof c === 'function' ? c(x, y) : c, m);
      }
    };
    const rect = (x0, y0, x1, y1, c, m) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, typeof c === 'function' ? c(x, y) : c, m); };
    const disc = (cx, cy, r, c, m) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) put(cx + x, cy + y, typeof c === 'function' ? c(x, y) : c, m); };
    const body = [40, 40, 46], bodyDark = [28, 28, 33], trim = [62, 62, 70];

    // roof / headliner and the windshield's upper trim
    poly([[0, 0], [480, 0], [480, 17], [410, 9], [240, 6], [70, 9], [0, 17]], (x, y) => (y >= 5 && (y === 5 || y === 16) ? trim : [50, 49, 54]));
    // A-pillars
    poly([[0, 0], [56, 0], [16, 232], [0, 244]], (x, y) => (x >= 56 - (y / 232) * 40 - 1.5 ? trim : bodyDark));
    poly([[480, 0], [424, 0], [464, 232], [480, 244]], (x, y) => (x <= 424 + (y / 232) * 40 + 1.5 ? trim : bodyDark));
    // dashboard with the instrument binnacle hump
    const dash = [[0, 246], [18, 232], [60, 220], [90, 214], [98, 206], [116, 200], [196, 200], [214, 206], [222, 214],
      [300, 216], [420, 214], [462, 226], [480, 238], [480, 270], [0, 270]];
    poly(dash, body);
    for (let x = 0; x < W; x++) { // 1px highlight along the dash's top edge
      for (let y = 190; y < H; y++) if (mat[y * W + x] === 1) { if (y > 196) put(x, y, trim); break; }
    }
    // defroster slot + right vent
    rect(234, 219, 400, 220, [22, 22, 26]);
    rect(398, 224, 446, 234, (x, y) => (y % 2 ? [18, 18, 22] : [52, 52, 58]));
    // centre console and car radio
    rect(284, 230, 370, 270, bodyDark);
    rect(290, 234, 364, 257, [30, 30, 35]);
    rect(290, 234, 364, 235, [58, 58, 66]);
    rect(299, 238, 347, 251, [0, 0, 0], 3);               // LCD
    disc(294, 245, 2, [58, 58, 64]);
    disc(356, 244, 4, (x, y) => (y < 0 ? [70, 70, 78] : [40, 40, 46]));
    for (let k = 0; k < 5; k++) rect(301 + k * 9, 253, 308 + k * 9, 255, [48, 48, 54]);
    rect(292, 260, 362, 262, [22, 22, 26]);
    // gauges (behind the wheel): faces, rings, glowing ticks
    const gauges = [[132, 231], [182, 231]];
    for (const [gx, gy] of gauges) {
      disc(gx, gy, 13, [52, 52, 58]);
      disc(gx, gy, 11, [10, 11, 12]);
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5;
        for (let r = 8; r <= 10; r++) put(Math.round(gx + Math.cos(a) * r), Math.round(gy + Math.sin(a) * r), [120, 200, 150], 2);
      }
    }
    // steering wheel rim (ellipse ring) — lit on its upper edge
    const wcx = 152, wcy = 314, rx = 110, ry = 120, th = 8;
    for (let y = 190; y < H; y++) for (let x = 36; x < 270; x++) {
      const o = ((x - wcx) / rx) ** 2 + ((y - wcy) / ry) ** 2;
      const n = ((x - wcx) / (rx - th)) ** 2 + ((y - wcy) / (ry - th)) ** 2;
      if (o <= 1 && n > 1) {
        const edge = ((x - wcx) / (rx - 2)) ** 2 + ((y - wcy) / (ry - 2)) ** 2;
        put(x, y, edge > 1 ? [66, 66, 74] : n < 1.08 ? [16, 16, 19] : [30, 30, 35]);
      }
    }
    // rear-view mirror
    rect(238, 0, 242, 6, [34, 34, 38]);
    rect(194, 5, 286, 26, [22, 22, 26]);
    for (const [x, y] of [[194, 5], [285, 5], [194, 25], [285, 25]]) mat[y * W + x] = 0;
    rect(197, 8, 283, 23, [0, 0, 0], 4);
    rect(196, 6, 284, 7, [58, 58, 64]);

    const lists = [[], [], [], [], [], []];
    const isTrim = (i) => rgb[i * 3] >= 58 && rgb[i * 3] === rgb[i * 3 + 1];
    for (let i = 0; i < W * H; i++) lists[mat[i] === 1 && isTrim(i) ? 5 : mat[i]].push(i);
    COCK = { mat, rgb, body: Int32Array.from(lists[1]), trim: Int32Array.from(lists[5]), glow: Int32Array.from(lists[2]), lcd: { x0: 299, y0: 238, x1: 347, y1: 251 },
      mirror: { x0: 197, y0: 8, x1: 283, y1: 23 }, gauges, wheel: { cx: wcx, cy: wcy } };
    return COCK;
  }

  /* ================================================================
   * ROAD RENDERER — part 2: the Road class (model + update)
   * ================================================================ */
  const SEG = 4;      // metres per road segment
  const RH = 3.5;     // road half-width (two lanes + edge paint)
  const FOC = 300;    // focal length (px)
  const HOR = 112;    // horizon row
  const BEAM = new Float32Array(129); // exp(-q) for q = i/8, headlight lateral falloff
  for (let i = 0; i <= 128; i++) BEAM[i] = Math.exp(-i / 8);
  /** Low-beam intensity by depth: cut by the hood, peaks 8–18 m, long soft tail. */
  const hlProfile = (z) => (z < 2.5 ? 0 : smooth(2.5, 7, z) * 1.55 * Math.exp(-Math.max(0, z - 10) / 26));
  /** Retro-reflective return (signs, paint, reflectors) reaches much further than the pool of light. */
  const retroProfile = (z) => (z < 2 ? 0 : smooth(2, 6, z) * Math.min(2.4, 70 / z));

  class Road {
    /**
     * cfg: {env: 'night'|'predawn'|'dawn'|'day', exterior (no car interior), seed, speed,
     *       camH, camX, autumn, draw (segments), lightningAt}
     */
    constructor(canvas, cfg) {
      cfg = this.cfg = cfg || {};
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.img = this.ctx.createImageData(W, H);
      this.d = this.img.data;
      this.d32 = new Uint32Array(this.d.buffer);
      this.copy = new Uint8ClampedArray(W * H * 4);
      this.exterior = !!cfg.exterior;
      this.seed = cfg.seed || 7;
      this.rnd = U.mulberry32(this.seed * 7919 + 13);
      this.N = cfg.draw || 190;
      this.pos = cfg.pos || 0;
      this.speed = cfg.speed || 0;
      this.target = this.speed;
      this.accel = 3.5; this.decel = 6;
      this.camX = cfg.camX != null ? cfg.camX : 1.7;
      this.camH = cfg.camH || 1.15;
      this.env = Object.assign({}, ENV[cfg.env || 'night']);
      this.envA = null; this.envB = null; this.envT = 0; this.envDur = 0;
      this.autumn = cfg.autumn != null ? !!cfg.autumn : this.env.autumn > 0.5;
      this.winter = cfg.winter != null ? !!cfg.winter : (this.env.winter || 0) > 0.5;
      if (this.winter) this.autumn = false;
      this.t = 0;
      this.flash = 0; this.strike = null; this.bolt = null;
      this.nextLightning = cfg.lightningAt != null ? cfg.lightningAt : 4 + this.rnd() * 4;
      this.shakeAmt = 0; this.shakeX = 0; this.shakeY = 0; this.bob = 0;
      this.bgX = 0;
      this.objs = [];
      this.zones = [];
      this.cache = new Map();
      this.rain = [];
      this.drops = [];
      this.dropAcc = 0;
      this.wiper = { mode: cfg.wipers || 'fast', ph: 1, a: 0, prev: 0, dwell: 0, stroke: 0 };
      this.radio = { band: 'AM', freq: '1340', time: null, flicker: 0, on: true };
      this.mirrorGlow = 0;
      this.lcdBoost = 0;
      this.black = false;
      this.onWiper = null;
      this.onThunder = null;
      this.lights = [];     // point lights (world) collected per frame from objects
      this.glows = [];
      this.rowX = new Float32Array(H); this.rowR = new Float32Array(H); this.rowZ = new Float32Array(H);
      this.P = { x: new Float32Array(this.N + 2), dx: new Float32Array(this.N + 2), clip: new Int16Array(this.N + 2) };
      // background profiles (wrap at 1024 px)
      const r1 = U.mulberry32(this.seed + 101);
      const prof = (base, amp, fr, jag) => {
        const a = new Float32Array(1024), ph = [r1() * TAU, r1() * TAU, r1() * TAU];
        for (let i = 0; i < 1024; i++) {
          const x = (i / 1024) * TAU;
          a[i] = base + amp * (0.5 * Math.sin(x * fr + ph[0]) + 0.3 * Math.sin(x * fr * 2.3 + ph[1]) + 0.2 * Math.sin(x * fr * 5.1 + ph[2]));
          if (jag) a[i] += (r1() - 0.5) * jag;
        }
        return a;
      };
      this.ridgeFar = prof(26, 16, 3, 0.8);
      this.ridgeNear = prof(12, 9, 5, 1.2);
      this.treeline = new Float32Array(1024);
      for (let i = 0; i < 1024;) { // jagged pine tips
        const w = 3 + ((r1() * 5) | 0), hgt = 3 + r1() * 7;
        for (let k = 0; k < w && i < 1024; k++, i++) this.treeline[i] = 2 + hgt * (1 - Math.abs(k - w / 2) / (w / 2)) + r1();
      }
      this.post = postLayers();
      sprites();
      if (!this.exterior) cockpit();
    }

    /* ---- track shape (deterministic per segment index) ---- */
    curve(i) {
      const s = this.seed * 1.37;
      return 0.0068 * Math.sin(i * 0.0113 + s) + 0.0042 * Math.sin(i * 0.0291 + s * 2.1) + 0.0014 * Math.sin(i * 0.071 + s * 0.3);
    }
    elev(i) {
      const s = this.seed * 0.71;
      return 7 * Math.sin(i * 0.0098 + s) + 2.6 * Math.sin(i * 0.027 + s * 2.3) + 0.6 * Math.sin(i * 0.083 + 1);
    }
    elevAt(m) { const f = m / SEG, i = Math.floor(f); return lerp(this.elev(i), this.elev(i + 1), f - i); }
    railOn(i) { return vn((i >> 3) * 29, this.seed * 13) > 118; }

    /* ---- environment ---- */
    setEnv(env) { this.env = Object.assign({}, typeof env === 'string' ? ENV[env] : env); this.envB = null; }
    /** Blend to another environment (name, object, or name + overrides) over secs. */
    blendEnv(to, secs, over) {
      const target = Object.assign({}, typeof to === 'string' ? ENV[to] : to, over || {});
      this.envA = Object.assign({}, this.env); this.envB = target; this.envT = 0; this.envDur = Math.max(0.01, secs || 0.01);
    }
    /** Modify the current (and target) environment in place, e.g. {rain: 0.4}. */
    tweak(over) { Object.assign(this.env, over); if (this.envB) Object.assign(this.envB, over); }

    /* ---- objects ---- */
    /** Place a special object `ahead` metres in front of the car. Returns it. */
    spawn(o, ahead) { o.at = this.pos + ahead; this.objs.push(o); return o; }
    /** A roadside sign `ahead` metres away, with the trees in front of it cleared. */
    spawnSign(spr, ahead, off, w) {
      const at = this.pos + ahead, side = Math.sign(off) || 1;
      this.clearZone(at - 60, at + 6, side, 2, Math.abs(off) + 6, 0);
      return this.spawn({ off, spr, w: w || 6 }, ahead);
    }
    /** Suppress roadside trees in [from,to] metres on one side (keep = fraction kept). */
    clearZone(from, to, side, minOff, maxOff, keep) { this.zones.push({ from, to, side, minOff: minOff || 0, maxOff: maxOff || 999, keep: keep || 0 }); this.cache.clear(); }
    /** The station group — building, mast with beacon, a sodium lamp at the drive. */
    spawnStation(ahead, side, off) {
      side = side || 1;
      off = off || 34;
      const at = this.pos + ahead, s = sprites();
      this.clearZone(at - 70, at + 40, side, off - 16, 90, 0.08);
      this.clearZone(at - 60, at + 25, side, 4.2, off - 16, 0.14);
      const b = { at, off: side * off, spr: s.station, w: 26, kind: 'station', glows: [{ dx: -6, dy: 3.4, r: 5, c: [150, 210, 180], k: 0.16 }, { dx: 6, dy: 3.4, r: 5, c: [150, 210, 180], k: 0.16 }, { dx: 0.6, dy: 3.9, r: 2.2, c: [255, 196, 130], k: 0.35 }] };
      const m = { at: at + 14, off: side * (off + 6), spr: s.mast, w: 3.4, kind: 'mast', beacons: [{ dy: 36, c: [255, 36, 24], period: 1.7, r: 3.2 }, { dy: 18, c: [255, 36, 24], period: 1.7, r: 1.8, phase: 0.85 }] };
      const l = { at: at - 22, off: side * 4.8, spr: s.lamp, w: 1.4, kind: 'lamp', flip: side < 0,
        light: { dx: -1.2 * side, r: 15, c: [255, 150, 60], k: 1.25 }, glows: [{ dx: -0.9 * side, dy: 7.1, r: 3.4, c: [255, 170, 80], k: 0.9 }], reflect: [255, 150, 70] };
      this.objs.push(b, m, l);
      return { building: b, mast: m, lamp: l, at };
    }
    /** Procedural roadside objects of segment i (cached). */
    segObjs(i) {
      let arr = this.cache.get(i);
      if (arr) return arr;
      arr = [];
      const s = sprites(), seed = this.seed, m0 = i * SEG;
      const kept = (off, frac) => {
        for (const z of this.zones) {
          const m = m0 + frac * SEG, a = Math.abs(off);
          if (m >= z.from && m <= z.to && Math.sign(off) === z.side && a >= z.minOff && a <= z.maxOff)
            return hash01(i * 7 + (off | 0), seed + 991) < z.keep;
        }
        return true;
      };
      const tree = (off, frac, hMin, hMax, k) => {
        if (!kept(off, frac)) return;
        const r = hash01(i * 13 + k, seed + 31);
        let spr, hgt;
        if (this.autumn && hash01(i * 17 + k, seed + 5) < 0.62) {
          spr = s.autumn[(r * s.autumn.length) | 0]; hgt = lerp(hMin * 0.7, hMax * 0.75, hash01(i, k + 77));
        } else if (this.winter && hash01(i * 17 + k, seed + 5) < 0.55) {
          spr = s.bare[(r * s.bare.length) | 0]; hgt = lerp(hMin * 0.7, hMax * 0.8, hash01(i, k + 77));
        } else if (this.winter) {
          spr = s.snowPines[(r * s.snowPines.length) | 0]; hgt = lerp(hMin, hMax, hash01(i, k + 55));
        } else {
          spr = s.pines[(r * s.pines.length) | 0]; hgt = lerp(hMin, hMax, hash01(i, k + 55));
        }
        arr.push({ frac, off, spr, w: (hgt * spr.w) / spr.h, h: hgt, flip: hash01(i, k + 3) < 0.5, tree: true });
      };
      for (const side of [-1, 1]) {
        const sd = side > 0 ? 1 : 0;
        // first row hugging the verge, then the forest behind it
        if (hash01(i * 4 + sd, seed) < 0.62) tree(side * (RH + 3.2 + hash01(i, 11 + sd) * 3.2), hash01(i, 21 + sd), 9, 17, 1 + sd);
        for (let k = 0; k < 2; k++) if (hash01(i * 9 + k * 2 + sd, seed + 3) < 0.7) tree(side * (RH + 7 + hash01(i, 31 + k + sd * 4) * 16), hash01(i, 41 + k + sd * 4), 9, 19, 10 + k * 2 + sd);
        if (hash01(i * 5 + sd, seed + 9) < 0.5) tree(side * (RH + 24 + hash01(i, 61 + sd) * 22), hash01(i, 71 + sd), 13, 22, 30 + sd);
      }
      if (this.railOn(i)) arr.push({ frac: 0, off: RH + 1.0, spr: s.railPost, w: 0.16, h: 0.72, rail: true });
      else if (i % 6 === 0) arr.push({ frac: 0.2, off: RH + 1.1, spr: s.delineator, w: 0.12, h: 1.0 });
      if (i % 7 === 3) arr.push({ frac: 0.5, off: -(RH + 1.1), spr: s.delineator, w: 0.12, h: 1.0 });
      if (i % 6 === 0) arr.push({ frac: 0.5, off: 0, catseye: true });
      arr.sort((a, b) => b.frac - a.frac);
      this.cache.set(i, arr);
      return arr;
    }

    /* ---- simulation ---- */
    triggerLightning(strength) {
      const r = this.rnd;
      const k = strength == null ? 0.7 + r() * 0.3 : strength;
      this.strike = { t: 0, k, seq: [[0, 1], [0.05, 0.2], [0.1, 0.9], [0.17, 0.35], [0.24, 0.7], [0.4, 0.1], [0.7, 0]] };
      if (r() < 0.65) { // a visible bolt somewhere over the ridges
        const pts = [];
        let x = 60 + r() * (W - 120), y = 0;
        while (y < HOR - 18) { pts.push([x, y]); x += (r() - 0.5) * 16; y += 4 + r() * 8; }
        pts.push([x, HOR - 16]);
        this.bolt = pts;
      } else this.bolt = null;
      const delay = 0.8 + r() * 2.2;
      if (this.onThunder) this.onThunder(delay, k);
    }
    shake(amount, secs) { this.shakeAmt = Math.max(this.shakeAmt, amount); this.shakeT = Math.max(this.shakeT || 0, secs || 0.6); }

    update(dt) {
      this.t += dt;
      // environment blend
      if (this.envB) {
        this.envT += dt;
        const k = smooth(0, 1, this.envT / this.envDur);
        this.env = lerpEnv(this.envA, this.envB, k);
        if (k >= 1) this.envB = null;
      }
      const e = this.env;
      // speed & position
      const dv = this.target - this.speed;
      this.speed += clamp(dv, -this.decel * dt, this.accel * dt);
      if (this.speed < 0) this.speed = 0;
      this.pos += this.speed * dt;
      const base = Math.floor(this.pos / SEG);
      this.bgX += this.curve(base) * this.speed * dt * 38;
      // drop cached segments behind us
      if (this.cache.size > this.N * 2 + 40) for (const k of this.cache.keys()) if (k < base - 2) this.cache.delete(k);
      // lightning
      if (e.lightning > 0.5 && this.t >= this.nextLightning) {
        this.triggerLightning();
        this.nextLightning = this.t + 7 + this.rnd() * 11;
      }
      this.flash = 0;
      if (this.strike) {
        const s = this.strike;
        s.t += dt;
        const q = s.seq;
        if (s.t >= q[q.length - 1][0]) { this.strike = null; this.bolt = null; }
        else for (let j = 0; j + 1 < q.length; j++) if (s.t >= q[j][0] && s.t < q[j + 1][0]) {
          this.flash = lerp(q[j][1], q[j + 1][1], (s.t - q[j][0]) / (q[j + 1][0] - q[j][0])) * s.k;
          break;
        }
        if (s.t > 0.12) this.bolt = this.bolt && s.t < 0.3 ? this.bolt : null;
      }
      // shake / road bob
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const a = this.shakeAmt * clamp(this.shakeT / 0.5, 0, 1);
        this.shakeX = (this.rnd() - 0.5) * 2 * a; this.shakeY = (this.rnd() - 0.5) * 2 * a;
        if (this.shakeT <= 0) { this.shakeAmt = 0; this.shakeX = this.shakeY = 0; }
      }
      const sp = Math.min(1, this.speed / 16);
      this.bob = Math.sin(this.t * 9.3) * 0.35 * sp + (vn((this.pos * 3) | 0, 17) - 128) / 128 * 0.8 * sp;
      this.camX = (this.cfg.camX != null ? this.cfg.camX : 1.7) + Math.sin(this.t * 0.31) * 0.12;
      if (this.radio.flicker > 0) this.radio.flicker -= dt;
      this.updateRain(dt);
      if (!this.exterior) { this.updateWipers(dt); this.updateDrops(dt); }
    }

    updateRain(dt) {
      const e = this.env, want = Math.round(420 * e.rain);
      const vpx = W / 2, vpy = HOR - 6;
      while (this.rain.length < want) this.rain.push(this.newRain(true));
      if (this.rain.length > want) this.rain.length = want;
      const rad = 0.18 + this.speed * 0.05;
      for (const p of this.rain) {
        p.vx = (p.x - vpx) * rad * (0.35 + p.d) - 26 * p.d;
        p.vy = 150 + 430 * p.d + (p.y - vpy) * rad * (0.35 + p.d);
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > H + 10 || p.x < -20 || p.x > W + 20) Object.assign(p, this.newRain(false));
      }
    }
    newRain(anywhere) {
      const r = this.rnd;
      return { x: r() * W, y: anywhere ? r() * H : -10 - r() * 60, d: Math.pow(r(), 1.6), vx: 0, vy: 0 };
    }
    /** Wiper cycle: up-stroke, down-stroke, dwell at rest. mode 'fast'|'slow'|'int'|'off'. */
    updateWipers(dt) {
      const w = this.wiper;
      w.prev = w.a;
      const stroke = 0.55;
      const dwell = { fast: 0.12, slow: 0.9, int: 3.4, off: Infinity }[w.mode] || 0.12;
      if (w.ph >= 1) { // resting
        w.dwell += dt;
        if (w.dwell >= dwell && w.mode !== 'off') { w.ph = 0; w.dwell = 0; if (this.onWiper) this.onWiper('up'); }
        w.a = 0;
        return;
      }
      const before = w.ph;
      w.ph += dt / (stroke * 2);
      if (before < 0.5 && w.ph >= 0.5 && this.onWiper) this.onWiper('down');
      const u = w.ph < 0.5 ? w.ph * 2 : 2 - w.ph * 2;
      w.a = clamp(0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1)), 0, 1);
      if (w.ph >= 1) { w.a = 0; w.ph = 1; }
    }
    wiperGeom() {
      return [
        { px: 116, py: 226, len: 172, a0: -0.07, a1: 2.02 },
        { px: 292, py: 226, len: 158, a0: -0.07, a1: 2.2 },
      ];
    }
    updateDrops(dt) {
      const e = this.env, r = this.rnd;
      this.dropAcc += e.rain * 75 * dt;
      while (this.dropAcc >= 1) {
        this.dropAcc -= 1;
        const rr = 0.9 + Math.pow(r(), 2) * 2.3;
        this.drops.push({ x: 20 + r() * (W - 40), y: 10 + r() * 205, r: rr, y0: 0, vy: 0, run: rr > 1.7 && r() < 0.35, life: 0 });
        this.drops[this.drops.length - 1].y0 = this.drops[this.drops.length - 1].y;
      }
      if (this.drops.length > 220) this.drops.splice(0, this.drops.length - 220);
      const up = this.speed * 2.3;
      for (const dp of this.drops) {
        dp.life += dt;
        if (dp.run) {
          dp.vy = clamp(dp.vy + (34 - up) * dt, -90, 70);
          dp.y += dp.vy * dt;
          dp.x += (dp.x - W / 2) * 0.004 * this.speed * dt;
        }
      }
      // the blades clear whatever they sweep over
      const w = this.wiper;
      if (w.a !== w.prev) {
        const lo = Math.min(w.a, w.prev), hi = Math.max(w.a, w.prev);
        for (const g of this.wiperGeom()) {
          const aLo = lerp(g.a0, g.a1, lo) - 0.03, aHi = lerp(g.a0, g.a1, hi) + 0.03;
          for (const dp of this.drops) {
            if (dp.dead) continue;
            const dx = dp.x - g.px, dy = g.py - dp.y, dist = Math.hypot(dx, dy);
            if (dist > g.len || dist < g.len * 0.28) continue;
            const ang = Math.atan2(dy, dx);
            if (ang >= aLo && ang <= aHi) dp.dead = true;
          }
        }
      }
      this.drops = this.drops.filter((dp) => !dp.dead && dp.life < 14 && dp.y > 4 && dp.y < 236);
    }

    /* ================================================================ render */
    render() {
      const d = this.d;
      if (!this._alpha) { for (let i = 3; i < d.length; i += 4) d[i] = 255; this._alpha = true; }
      if (this.black) {
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0;
        this.ctx.putImageData(this.img, 0, 0);
        return;
      }
      const cx = W / 2 + this.shakeX, hor = HOR + this.shakeY + this.bob;
      this.collectLights();
      this.glows.length = 0;
      const clip = this.drawGround(cx, hor);
      this.drawSky(cx, hor, clip);
      this.drawSprites(cx, hor);
      this.drawRain(cx, hor, clip);
      this.drawHaze();
      this.drawGlows();
      if (!this.exterior) {
        this.copy.set(d);
        this.drawDrops();
        this.drawWipers();
        this.drawCockpit();
      }
      this.ctx.putImageData(this.img, 0, 0);
      this.composite();
    }

    collectLights() {
      this.lights.length = 0;
      this.lampLit = 0;
      for (const o of this.objs) {
        if (!o.light) continue;
        const z = o.at - this.pos;
        if (z < -30 || z > this.N * SEG) continue;
        const l = o.light;
        this.lights.push({ z: o.at, x: o.off + (l.dx || 0), r2: l.r * l.r, c: l.c, k: l.k });
        if (z > -8 && z < 26) this.lampLit = Math.max(this.lampLit, l.k * 0.5 * (1 - Math.abs(z - 4) / 26));
      }
    }

    /** Project segments near→far and rasterise the ground per scanline. Returns the top clip row. */
    drawGround(cx, hor) {
      const P = this.P, pos = this.pos, base = Math.floor(pos / SEG), frac = pos / SEG - base;
      const camY = this.elevAt(pos) + this.camH;
      let x = 0, dx = -this.curve(base) * frac;
      let clip = H;
      for (let n = 0; n < this.N; n++) {
        const si = base + n;
        const z1 = si * SEG - pos, z2 = z1 + SEG;
        const xa = x, xb = x + dx;
        P.x[n] = xa; P.dx[n] = dx; P.clip[n] = clip;
        x += dx; dx += this.curve(si);
        if (z2 <= 0.7) continue;
        let zz1 = z1, x1 = xa, e1 = this.elev(si);
        const e2 = this.elev(si + 1);
        if (z1 < 0.7) { const k = (0.7 - z1) / SEG; zz1 = 0.7; x1 = lerp(xa, xb, k); e1 = lerp(e1, e2, k); }
        const s1 = FOC / zz1, s2 = FOC / z2;
        const X1 = cx + (x1 - this.camX) * s1, Y1 = hor + (camY - e1) * s1, R1 = RH * s1;
        const X2 = cx + (xb - this.camX) * s2, Y2 = hor + (camY - e2) * s2, R2 = RH * s2;
        if (Y2 >= clip || Y2 >= Y1) continue;
        const yTop = Math.max(0, Math.ceil(Y2)), yBot = Math.min(clip - 1, Math.floor(Y1), this.exterior ? H : 246);
        const i1 = 1 / zz1, i2 = 1 / z2;
        for (let y = yBot; y >= yTop; y--) {
          const t = (Y1 - y) / (Y1 - Y2);
          this.row(y, lerp(X1, X2, t), lerp(R1, R2, t), 1 / lerp(i1, i2, t), cx);
        }
        clip = Math.min(clip, yTop);
        if (clip <= 0) break;
      }
      return clip;
    }

    /** One ground scanline: asphalt, paint, puddles, shoulders, forest floor; lit and fogged. */
    row(y, X, R, z, cx) {
      const d32 = this.d32, e = this.env, fl = this.flash;
      this.rowX[y] = X; this.rowR[y] = R; this.rowZ[y] = z;
      const inv = RH / R, wz = this.pos + z;
      let f = clamp((z - e.fogNear) / (e.fogFar - e.fogNear), 0, 1);
      f = f * (2 - f);
      const nf = 1 - f;
      const fogR = (e.fog[0] + fl * 40) * f, fogG = (e.fog[1] + fl * 44) * f, fogB = (e.fog[2] + fl * 52) * f;
      const amb = e.ambient + fl * 0.34;
      const hz = e.headlights * hlProfile(z), rz = e.headlights * retroProfile(z);
      const hwInv = 1 / (1 + 0.36 * z);
      const wet = e.wet, dry = e.dry, autumn = this.autumn, winter = this.winter;
      const sheen = wet * (0.1 + smooth(6, 150, z) * 0.6);
      const skR = e.skyHor[0] + fl * 70, skG = e.skyHor[1] + fl * 76, skB = e.skyHor[2] + fl * 94;
      const aR = lerp(30, 96, dry), aG = lerp(31, 94, dry), aB = lerp(36, 92, dry);
      const tz = (((wz * 7) | 0) & 255) << 8, tzP = (((wz * 1.1) | 0) & 255) << 8, tzG = (((wz * 3) | 0) & 255) << 8, tzF = ((((wz * 3) | 0) + 50) & 255) << 8;
      const dash = (Math.floor(wz / 3) & 3) === 0;
      const passing = VNOISE[(91 << 8) | (((wz / 60) | 0) & 255)] > 150;
      const Ls = this.lights, nL = Ls.length;
      const yel = autumn ? 176 : 196, yelG = 152 - dry * 10, yelB = 44 + dry * 20;
      const RHe = RH - 0.34, RHi = RH - 0.2, RHs = RH + 0.9, RHv = RH + 4.2;
      let pi = y * W;
      for (let px = 0; px < W; px++, pi++) {
        const u = (px + 0.5 - X) * inv;
        const au = u < 0 ? -u : u;
        const q = (px + 0.5 - cx) * inv * hwInv, qi = (q * q * 8) | 0;
        const L = amb + (qi < 128 ? hz * BEAM[qi] : 0);
        let r, g, b, retro = 0, spec = sheen;
        if (au < RH) {
          const n = NOISE[tz | (((u * 12) | 0) & 255)] - 128;
          r = aR + n * 0.07; g = aG + n * 0.07; b = aB + n * 0.07;
          const pd = VNOISE[tzP | ((((u + 8) * 3.2) | 0) & 255)];
          if (pd > 140) { const k = ((pd - 140) / 115) * wet; spec += k * 0.9; const m = 1 - 0.45 * k; r *= m; g *= m; b *= m; }
          if (au > 0.07 && au < 0.19 && (u < 0 || !passing || dash)) { r = yel; g = yelG; b = yelB; retro = 1; }
          else if (au > RHe && au < RHi) { r = 204; g = 204; b = 194; retro = 1; }
        } else if (au < RHs) {
          const n = (NOISE[(tz + 1792) & 65535 | (((u * 9) | 0) & 255)] - 128) * 0.2;
          r = 60 + n + dry * 40; g = 56 + n + dry * 36; b = 50 + n + dry * 30; spec *= 0.35;
        } else if (au < RHv) {
          const n = VNOISE[tzG | (((u * 6) | 0) & 255)] - 128;
          if (winter) {
            // the plough's ridge of old snow along the verge, grey-white, gritty, melting to mud
            const sn = VNOISE[tzG | ((((u + 3) * 2.2) | 0) & 255)];
            if (sn > 96) { const k = 150 + n * 0.25; r = k; g = k + 3; b = k + 7; } else { r = 88 + n * 0.2; g = 82 + n * 0.18; b = 72 + n * 0.15; }
          } else if (autumn) { r = 112 + n * 0.3; g = 92 + n * 0.25; b = 54 + n * 0.15; } else { r = 26 + n * 0.08; g = 36 + n * 0.1; b = 22 + n * 0.06; }
          spec *= 0.12;
        } else {
          const n = VNOISE[tzF | (((u * 2.5) | 0) & 255)] - 128;
          if (winter) {
            // snow lying on under the trees, patchy where the ground shows through
            const sn = VNOISE[tzF | ((((u + 9) * 1.6) | 0) & 255)];
            if (sn > 110) { const k = 132 + n * 0.3; r = k; g = k + 4; b = k + 9; } else { r = 70 + n * 0.25; g = 64 + n * 0.2; b = 56 + n * 0.15; }
          } else if (autumn) { r = 96 + n * 0.35; g = 62 + n * 0.25; b = 36 + n * 0.12; } else { r = 20 + n * 0.06; g = 22 + n * 0.06; b = 16 + n * 0.05; }
          spec = 0;
        }
        let Lr = L, Lg = L, Lb = L;
        for (let k = 0; k < nL; k++) {
          const l = Ls[k], dz = wz - l.z, dxl = u - l.x, d2 = dz * dz + dxl * dxl;
          if (d2 < l.r2) { const w = 1 - d2 / l.r2, kk = (w * w * l.k) / 255; Lr += kk * l.c[0]; Lg += kk * l.c[1]; Lb += kk * l.c[2]; }
        }
        if (retro) { const rb = qi < 512 ? rz * BEAM[qi >> 2] : 0; Lr += rb; Lg += rb; Lb += rb; }
        r = (r * Lr + spec * skR) * nf + fogR; g = (g * Lg + spec * skG) * nf + fogG; b = (b * Lb + spec * skB) * nf + fogB;
        d32[pi] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      }
    }

    /** Sky, clouds, lightning, ridges and the far treeline — rows above the ground clip. */
    drawSky(cx, hor, clip) {
      const d = this.d, d32 = this.d32, e = this.env, fl = this.flash, bg = this.bgX, t = this.t;
      const yEnd = Math.min(H, clip);
      const sT = e.skyTop, sH = e.skyHor, cl = e.cloud, ca = e.cloudAmt, gl = e.glow, ga = e.glowAmt;
      const fR = e.fog[0] + fl * 40, fG = e.fog[1] + fl * 44, fB = e.fog[2] + fl * 52;
      const tl = e.treeline;
      for (let y = 0; y < yEnd; y++) {
        let o = y * W * 4;
        if (y >= hor) {
          const k = clamp((y - hor) / 26, 0, 1) * 0.7;
          const r = lerp(fR, tl[0], k), g = lerp(fG, tl[1], k), b = lerp(fB, tl[2], k);
          const px = 0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255);
          this.d32.fill(px, y * W, y * W + W);
          continue;
        }
        const v = clamp(y / hor, 0, 1), gg = Math.pow(v, 1.6);
        const gb = ga * Math.exp(-Math.pow((hor - y) / 24, 2));
        const br = lerp(sT[0], sH[0], gg) + gl[0] * gb, bgc = lerp(sT[1], sH[1], gg) + gl[1] * gb, bb = lerp(sT[2], sH[2], gg) + gl[2] * gb;
        const cyv = ((2600 / (y + 26)) + t * 0.8) | 0, cs = 70 / (y + 26);
        const bx = bg * 0.18 + t * 1.6;
        for (let x = 0; x < W; x++, o += 4) {
          const c = vn(((x - cx) * cs + bx) | 0, cyv);
          const cd = clamp((c - 92) / 110, 0, 1) * ca * (0.55 + 0.45 * (1 - v));
          let r = br + (cl[0] - br) * cd, g = bgc + (cl[1] - bgc) * cd, b = bb + (cl[2] - bb) * cd;
          if (fl > 0) { const k = fl * (0.42 + cd * 1.1) * (0.55 + 0.45 * v); r += 175 * k; g += 186 * k; b += 222 * k; }
          d32[o >> 2] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
        }
      }
      if (this.bolt && fl > 0.25) {
        const pts = this.bolt;
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
          for (let k = 0; k <= n; k++) {
            const x = Math.round(lerp(x0, x1, k / n)), y = Math.round(lerp(y0, y1, k / n));
            for (let ox = -1; ox <= 1; ox++) {
              if (x + ox < 0 || x + ox >= W || y >= yEnd) continue;
              const q = (y * W + x + ox) * 4, a = ox === 0 ? 255 : 90;
              d[q] += a * 0.9; d[q + 1] += a * 0.92; d[q + 2] += a;
            }
          }
        }
      }
      // mountain ridges and the far treeline stay dark: silhouettes when lightning lights the sky
      const rf = lerpC(e.ridgeFar, e.fog, 0.15), rn = e.ridgeNear;
      for (let x = 0; x < W; x++) {
        this.colFill(x, hor - this.ridgeFar[((x + bg * 0.3) | 0) & 1023], hor + 1, rf, yEnd, fl * 0.1);
        this.colFill(x, hor - this.ridgeNear[((x + bg * 0.55) | 0) & 1023], hor + 1, rn, yEnd, fl * 0.06);
        this.colFill(x, hor - this.treeline[((x + bg * 0.85) | 0) & 1023], hor + 2, tl, yEnd, 0);
      }
    }
    colFill(x, y0, y1, c, yEnd, lift) {
      const d = this.d, a = Math.max(0, Math.round(y0)), b = Math.min(yEnd, Math.round(y1));
      const r = c[0] + lift * 120, g = c[1] + lift * 130, bl = c[2] + lift * 160;
      for (let y = a; y < b; y++) { const o = (y * W + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = bl; }
    }

    /**
     * Roadside + special objects, drawn NEAR → FAR into a coverage mask so hidden pixels cost
     * almost nothing (the forest is thousands of overlapping trees). Each object is clipped by
     * the terrain in front of its segment.
     */
    drawSprites(cx, hor) {
      const e = this.env, P = this.P, base = Math.floor(this.pos / SEG);
      const camY = this.elevAt(this.pos) + this.camH;
      if (!this.cov) this.cov = new Uint8Array(W * H);
      this.cov.fill(0);
      const buckets = (this._buckets = this._buckets || []);
      buckets.length = 0;
      for (const o of this.objs) {
        const n = Math.floor(o.at / SEG) - base;
        if (n >= 0 && n < this.N) (buckets[n] = buckets[n] || []).push(o);
      }
      const maxN = Math.min(this.N - 1, Math.ceil((e.fogFar * 1.05) / SEG) + 2);
      const list = (this._list = this._list || []);
      for (let n = 0; n < this.N; n++) {
        const si = base + n, clipY = P.clip[n];
        if (clipY <= 0) continue;
        list.length = 0;
        if (n <= maxN) for (const o of this.segObjs(si)) list.push(o);
        const sp = buckets[n];
        if (sp) for (const o of sp) { o.frac = o.at / SEG - Math.floor(o.at / SEG); list.push(o); }
        if (sp) list.sort((a, b) => a.frac - b.frac);
        for (let k = 0; k < list.length; k++) this.drawObj(list[k], n, si, list[k].frac, cx, hor, camY, clipY);
        if (n <= maxN && this.railOn(si) && this.railOn(si + 1)) this.drawRail(n, si, cx, hor, camY, clipY);
      }
    }
    /** Lighting for an object: ambient part, headlight part (split so tall things fall off), retro, point lights. */
    lightAt(sx, s, z, mAt, off, tree) {
      const e = this.env, lx = (sx - (W / 2 + this.shakeX)) / s;
      const q = lx / (1 + 0.36 * z), qi = (q * q * 8) | 0;
      const beam = qi < 128 ? BEAM[qi] : 0;
      const lt = this._lt || (this._lt = {});
      lt.L = e.ambient + this.flash * 0.45;
      lt.H = e.headlights * hlProfile(z) * beam * (tree ? 0.7 : 1);
      lt.retro = e.headlights * retroProfile(z) * (qi < 512 ? BEAM[qi >> 2] : 0);
      lt.Lr = lt.Lg = lt.Lb = 0;
      for (const l of this.lights) {
        const dz = mAt - l.z, dxl = off - l.x, d2 = dz * dz + dxl * dxl;
        if (d2 < l.r2 * 1.6) { const w = 1 - d2 / (l.r2 * 1.6), kk = w * w * l.k * 0.8; lt.Lr += (kk * l.c[0]) / 255; lt.Lg += (kk * l.c[1]) / 255; lt.Lb += (kk * l.c[2]) / 255; }
      }
      return lt;
    }
    drawObj(o, n, si, frac, cx, hor, camY, clipY) {
      const z = (si + frac) * SEG - this.pos;
      if (z < 0.9) return;
      const e = this.env, s = FOC / z;
      const xs = this.P.x[n] + this.P.dx[n] * frac;
      const el = lerp(this.elev(si), this.elev(si + 1), frac);
      const sx = cx + (xs + o.off - this.camX) * s;
      const sy = hor + (camY - el - (o.lift || 0)) * s;
      let f = clamp((z - e.fogNear) / (e.fogFar - e.fogNear), 0, 1);
      f = f * (2 - f);
      const mAt = (si + frac) * SEG;
      if (o.catseye) {
        const lt = this.lightAt(sx, s, z, mAt, 0, false);
        const b = (lt.retro * 150 + (lt.L + lt.H) * 30) * (1 - f * 0.7);
        const x = sx | 0, y = sy | 0;
        if (b < 5 || y >= clipY || y < 0 || x < 0 || x >= W || this.cov[y * W + x]) return;
        const d = this.d, q = (y * W + x) * 4;
        d[q] += b; d[q + 1] += b * 0.72; d[q + 2] += b * 0.3;
        if (z < 16 && x + 1 < W) { d[q + 4] += b * 0.6; d[q + 5] += b * 0.43; d[q + 6] += b * 0.18; }
        return;
      }
      const hgt = o.h || (o.w * o.spr.h) / o.spr.w;
      const wpx = o.w * s, hpx = hgt * s;
      const onScreen = sx + wpx / 2 >= 0 && sx - wpx / 2 < W;
      if (o.reflect && e.wet > 0.2 && onScreen) this.reflection(sx + (o.light ? o.light.dx : 0) * s, sy, hpx, s, o.reflect, e.wet * (1 - f), clipY);
      if (onScreen && (wpx >= 0.6 || !o.tree)) {
        const lt = this.lightAt(sx, s, z, mAt, o.off, o.tree);
        this.blit(o.spr, sx, sy, wpx, hpx, clipY, lt, f, o.flip, o.tree ? s : 0);
      }
      const fade = 1 - f * 0.6;
      if (o.glows) for (const g of o.glows) this.glows.push({ x: sx + g.dx * s, y: sy - g.dy * s, r: Math.min(70, Math.max(2, g.r * s)), c: g.c, k: g.k * fade });
      if (o.beacons) for (const b of o.beacons) {
        if ((this.t / b.period + (b.phase || 0)) % 1 >= 0.42) continue;
        const bx = sx, by = sy - b.dy * s;
        this.glows.push({ x: bx, y: by, r: Math.min(20, Math.max(2.5, b.r * s * 1.5)), c: b.c, k: 0.6 });
        this.dot(bx, by, [255, 120, 100]);
      }
    }
    dot(x, y, c) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const q = (y * W + x) * 4, d = this.d;
      d[q] = Math.max(d[q], c[0]); d[q + 1] = Math.max(d[q + 1], c[1]); d[q + 2] = Math.max(d[q + 2], c[2]);
    }
    /** Shimmering light column on wet asphalt below a light (only where nothing nearer covers it). */
    reflection(x, y0, len, s, c, k, clipY) {
      const d = this.d, cov = this.cov, w = Math.max(1, s * 0.35), n = Math.min(H - 1, clipY - 1, Math.round(y0 + len * 1.1));
      for (let y = Math.max(0, Math.round(y0)); y <= n; y++) {
        const v = (y - y0) / (len * 1.1), a = k * (1 - v) * (0.55 + 0.45 * (wn(y * 3, (this.t * 30) | 0) / 255)) * 0.7;
        const jx = Math.round(x + (wn(y, (this.t * 24) | 0) / 255 - 0.5) * w * 2.5);
        for (let xx = Math.round(jx - w); xx <= Math.round(jx + w); xx++) {
          if (xx < 0 || xx >= W || cov[y * W + xx]) continue;
          const q = (y * W + xx) * 4;
          d[q] += c[0] * a; d[q + 1] += c[1] * a; d[q + 2] += c[2] * a;
        }
      }
    }
    /** Guard-rail beam between this segment's post and the next one (galvanised W-beam). */
    drawRail(n, si, cx, hor, camY, clipY) {
      const P = this.P, e = this.env, d = this.d, cov = this.cov;
      const zA0 = si * SEG - this.pos, zB = zA0 + SEG;
      if (zB < 1.2) return;
      const zA = Math.max(zA0, 1.2), fa = (zA - zA0) / SEG;
      const off = RH + 0.92;
      const xA = P.x[n] + P.dx[n] * fa, xB = P.x[n] + P.dx[n];
      const eA = lerp(this.elev(si), this.elev(si + 1), fa), eB = this.elev(si + 1);
      const sA = FOC / zA, sB = FOC / zB;
      const XA = cx + (xA + off - this.camX) * sA, XB = cx + (xB + off - this.camX) * sB;
      const tA = hor + (camY - eA - 0.74) * sA, bA = hor + (camY - eA - 0.44) * sA;
      const tB = hor + (camY - eB - 0.74) * sB, bB = hor + (camY - eB - 0.44) * sB;
      const x0 = Math.max(0, Math.ceil(Math.min(XA, XB))), x1 = Math.min(W - 1, Math.floor(Math.max(XA, XB)));
      const fr = e.fog;
      for (let x = x0; x <= x1; x++) {
        const t = XB === XA ? 0 : (x - XA) / (XB - XA);
        const z = 1 / lerp(1 / zA, 1 / zB, t), s = FOC / z;
        const top = lerp(tA, tB, t), bot = lerp(bA, bB, t);
        let f = clamp((z - e.fogNear) / (e.fogFar - e.fogNear), 0, 1); f = f * (2 - f);
        const lt = this.lightAt(x, s, z, si * SEG + t * SEG, off, false);
        const Lk = lt.L + lt.H * 0.8 + lt.retro * 0.08;
        for (let y = Math.max(0, Math.ceil(top)); y <= Math.min(clipY - 1, Math.floor(bot)); y++) {
          const pi = y * W + x;
          if (cov[pi]) continue;
          cov[pi] = 1;
          const v = (y - top) / Math.max(0.5, bot - top);
          const base = v < 0.28 ? 84 : v < 0.62 ? 40 : 64;
          const q = pi * 4;
          const r = base * (Lk + lt.Lr), g = base * (Lk + lt.Lg), b = (base + 5) * (Lk + lt.Lb);
          d[q] = r * (1 - f) + fr[0] * f; d[q + 1] = g * (1 - f) + fr[1] * f; d[q + 2] = b * (1 - f) + fr[2] * f;
        }
      }
      if ((si & 1) === 0 && XA >= 0 && XA < W) { // amber reflector on the beam
        const lt = this.lightAt(XA, sA, zA, si * SEG, off, false), b = lt.retro * 150;
        const yy = Math.round((tA + bA) / 2), xx = Math.round(XA);
        if (b > 6 && yy < clipY && yy >= 0 && xx < W && !cov[yy * W + xx]) { const q = (yy * W + xx) * 4; d[q] += b; d[q + 1] += b * 0.7; d[q + 2] += b * 0.25; }
      }
    }
    /**
     * Nearest-neighbour sprite blit: material-aware lighting (diffuse / retro-reflective /
     * emissive) and fog; skips pixels already covered by nearer objects. With ppm > 0 the
     * headlight part fades with height above the ground (tree bases lit, crowns dark).
     */
    blit(spr, sx, sy, wpx, hpx, clipY, lt, f, flip, ppm) {
      const x0 = sx - wpx / 2, y0 = sy - hpx;
      const ix0 = Math.max(0, Math.ceil(x0 - 0.5)), ix1 = Math.min(W - 1, Math.floor(x0 + wpx - 0.5));
      const iy0 = Math.max(0, Math.ceil(y0 - 0.5)), iy1 = Math.min(clipY - 1, H - 1, Math.floor(sy - 0.5));
      if (ix0 > ix1 || iy0 > iy1) return;
      const d32 = this.d32, cov = this.cov, e = this.env, sp = spr.px, sm = spr.mat, sw = spr.w, sh = spr.h;
      const du = sw / wpx, dv = sh / hpx;
      const fr = e.fog[0], fg = e.fog[1], fb = e.fog[2], nf = 1 - f, fe = f * 0.45, nfe = 1 - fe;
      const efr = fr * fe, efg = fg * fe, efb = fb * fe;
      const RT = lt.retro;
      for (let y = iy0; y <= iy1; y++) {
        const v = ((y + 0.5 - y0) * dv) | 0;
        if (v < 0 || v >= sh) continue;
        let hk = 1;
        if (ppm > 0) { const above = (sy - y) / ppm; hk = above < 1.2 ? 1 : Math.max(0, 1 - (above - 1.2) / 2.6); }
        const L = lt.L + lt.H * hk, LR = (L + lt.Lr) * nf, LG = (L + lt.Lg) * nf, LB = (L + lt.Lb) * nf, RTn = RT * nf;
        const ffr = fr * f, ffg = fg * f, ffb = fb * f;
        const rowOff = v * sw;
        let pi = y * W + ix0;
        for (let x = ix0; x <= ix1; x++, pi++) {
          if (cov[pi]) continue;
          let u = ((x + 0.5 - x0) * du) | 0;
          if (u >= sw) u = sw - 1;
          if (flip) u = sw - 1 - u;
          const si = rowOff + u, s4 = si * 4;
          if (sp[s4 + 3] < 128) continue;
          cov[pi] = 1;
          const m = sm[si];
          let r, g, b;
          if (m === 2) { r = sp[s4] * nfe + efr; g = sp[s4 + 1] * nfe + efg; b = sp[s4 + 2] * nfe + efb; }
          else if (m === 1) { r = sp[s4] * (LR + RTn) + ffr; g = sp[s4 + 1] * (LG + RTn) + ffg; b = sp[s4 + 2] * (LB + RTn) + ffb; }
          else if (m === 3) { const k = RTn * 0.28; r = sp[s4] * (LR + k) + ffr; g = sp[s4 + 1] * (LG + k) + ffg; b = sp[s4 + 2] * (LB + k) + ffb; }
          else { r = sp[s4] * LR + ffr; g = sp[s4 + 1] * LG + ffg; b = sp[s4 + 2] * LB + ffb; }
          d32[pi] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
        }
      }
    }

    /** Rain streaks (radiating from the vanishing point as we drive) and splashes on the asphalt. */
    drawRain(cx, hor, clip) {
      const d = this.d, e = this.env, fl = this.flash, hl = e.headlights;
      const base = (0.3 + e.ambient * 2.2) * (e.rain > 0 ? 1 : 0);
      for (const p of this.rain) {
        const zp = 2 + (1 - p.d) * 26;
        const q = ((p.x - cx) * zp) / FOC / (1 + 0.36 * zp), qi = (q * q * 8) | 0;
        const yG = hor + (this.camH * FOC) / zp, yT = hor - (1.4 * FOC) / zp;
        const vert = p.y > yT && p.y < yG + 6 ? 1 : 0.18;
        const beam = (qi < 128 ? BEAM[qi] : 0) * hlProfile(zp) * hl * vert;
        const bright = (10 + 26 * p.d) * base + beam * 95 + fl * 80;
        if (bright < 3) continue;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = clamp(sp * 0.017, 1.5, 12), ux = p.vx / sp, uy = p.vy / sp;
        for (let k = 0; k < len; k++) {
          const x = (p.x - ux * k) | 0, y = (p.y - uy * k) | 0;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const o = (y * W + x) * 4, a = bright * (1 - k / len);
          d[o] += a * 0.78; d[o + 1] += a * 0.84; d[o + 2] += a;
        }
      }
      // splashes on the road surface, brightest in the headlight pool
      const n = Math.round(e.rain * 70 * e.wet);
      const r = this.rnd, y0 = Math.max(clip + 1, Math.ceil(hor + 3)), y1 = 214;
      for (let i = 0; i < n && y1 > y0; i++) {
        const y = y0 + ((r() * (y1 - y0)) | 0), z = this.rowZ[y];
        if (!(z > 0)) continue;
        const u = (r() * 2 - 1) * RH, x = Math.round(this.rowX[y] + (u * this.rowR[y]) / RH);
        if (x < 1 || x >= W - 1) continue;
        const q = (((x - cx) / this.rowR[y]) * RH) / (1 + 0.36 * z), qi = (q * q * 8) | 0;
        const b = 8 + (qi < 128 ? BEAM[qi] : 0) * hlProfile(z) * hl * 70 + e.ambient * 30;
        const o = (y * W + x) * 4;
        d[o] += b; d[o + 1] += b; d[o + 2] += b * 1.1;
        if (z < 14 && y > 0) { const o2 = ((y - 1) * W + x) * 4; for (const q of [o2 - 4, o2 + 4]) { d[q] += b * 0.5; d[q + 1] += b * 0.5; d[q + 2] += b * 0.55; } }
      }
    }
    /** Headlight scatter in the rain: stored here, applied in post() (saves a full pass). */
    drawHaze() {
      const e = this.env;
      this.hazeK = e.haze * e.headlights * (0.35 + e.rain * 0.65);
    }
    drawGlows() {
      const d = this.d;
      for (const g of this.glows) {
        const r = g.r, r2 = r * r;
        const x0 = Math.max(0, Math.floor(g.x - r)), x1 = Math.min(W - 1, Math.ceil(g.x + r));
        const y0 = Math.max(0, Math.floor(g.y - r)), y1 = Math.min(H - 1, Math.ceil(g.y + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dd = ((x - g.x) ** 2 + (y - g.y) ** 2) / r2;
          if (dd >= 1) continue;
          const k = g.k * (1 - dd) * (1 - dd) * (dd < 0.04 ? 1.6 : 1), o = (y * W + x) * 4;
          d[o] += g.c[0] * k; d[o + 1] += g.c[1] * k; d[o + 2] += g.c[2] * k;
        }
      }
    }

    /* ---- windshield, wipers, cockpit ---- */
    drawDrops() {
      const src = this.copy, d = this.d, e = this.env;
      const hi = 44 + 110 * e.ambient + this.flash * 140 + this.lampLit * 80 + this.hazeK * 18;
      for (const dp of this.drops) {
        const r = dp.r, cx = dp.x, cy = dp.y;
        if (dp.run && Math.abs(dp.y - dp.y0) > 2) { // the wet trail a running drop leaves
          const ya = Math.round(Math.min(dp.y0, dp.y)), yb = Math.round(Math.max(dp.y0, dp.y)), x = Math.round(cx);
          for (let y = ya; y <= yb; y++) {
            if (y < 0 || y >= H || x < 0 || x >= W) continue;
            const o = (y * W + x) * 4, s = (y * W + Math.min(W - 1, x + 1)) * 4;
            d[o] = src[s] * 0.9 + 7; d[o + 1] = src[s + 1] * 0.9 + 7; d[o + 2] = src[s + 2] * 0.9 + 9;
          }
        }
        const R = Math.ceil(r);
        for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
          const dd = (ox * ox + oy * oy) / (r * r);
          if (dd > 1) continue;
          const x = (cx + ox) | 0, y = (cy + oy) | 0;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const sx = clamp((cx - ox * 2.6) | 0, 0, W - 1), sy = clamp((cy - oy * 2.6 - r * 5) | 0, 0, H - 1);
          const s = (sy * W + sx) * 4, o = (y * W + x) * 4, k = dd > 0.5 ? 0.5 : 1.05;
          d[o] = src[s] * k + 4; d[o + 1] = src[s + 1] * k + 4; d[o + 2] = src[s + 2] * k + 6;
        }
        const hx = (cx - r * 0.4) | 0, hy = (cy - r * 0.45) | 0;
        if (hx >= 0 && hy >= 0 && hx < W && hy < H) {
          const o = (hy * W + hx) * 4, lum = (src[o] + src[o + 1] + src[o + 2]) / 3;
          const k = hi * clamp(0.15 + lum / 45, 0.15, 1.2);
          d[o] += k; d[o + 1] += k; d[o + 2] += k * 1.05;
        }
      }
    }
    drawWipers() {
      const e = this.env, il = e.interior + this.flash * 0.7 + this.lampLit;
      const w = this.wiper.a;
      for (const g of this.wiperGeom()) {
        const a = lerp(g.a0, g.a1, w), ux = Math.cos(a), uy = -Math.sin(a);
        const px = g.px, py = g.py;
        this.thick(px, py, px + ux * g.len * 0.34, py + uy * g.len * 0.34, 2.2, [14 * il * 3, 14 * il * 3, 16 * il * 3]);
        const bx0 = px + ux * g.len * 0.27, by0 = py + uy * g.len * 0.27, bx1 = px + ux * g.len, by1 = py + uy * g.len;
        this.thick(bx0, by0, bx1, by1, 2.6, [8, 8, 10]);
        const nx = -uy, ny = ux; // leading-edge highlight
        const hl = Math.min(120, 26 + 60 * il);
        this.thick(bx0 + nx * 1.6, by0 - Math.abs(ny) * 1.6, bx1 + nx * 1.6, by1 - Math.abs(ny) * 1.6, 0.8, [hl, hl, hl * 1.08]);
      }
    }
    thick(x0, y0, x1, y1, w, c) {
      const d = this.d, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5), h = w / 2;
      for (let i = 0; i <= n; i++) {
        const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
        for (let yy = Math.round(y - h); yy <= Math.round(y + h - 0.01); yy++) for (let xx = Math.round(x - h); xx <= Math.round(x + h - 0.01); xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const o = (yy * W + xx) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
        }
      }
    }
    drawCockpit() {
      const C = cockpit(), d = this.d, e = this.env;
      const il = e.interior + this.flash * 0.9 + this.lampLit * 0.9;
      const lr = il + this.lampLit * 0.5, lb = il - this.lampLit * 0.25;
      const body = C.body, rgb = C.rgb;
      for (let k = 0; k < body.length; k++) {
        const i = body[k], o = i * 4, j = i * 3;
        d[o] = rgb[j] * lr; d[o + 1] = rgb[j + 1] * il; d[o + 2] = rgb[j + 2] * lb;
      }
      const it = Math.max(il, 0.4);
      for (let k = 0; k < C.trim.length; k++) {
        const i = C.trim[k], o = i * 4, j = i * 3;
        d[o] = rgb[j] * it; d[o + 1] = rgb[j + 1] * it; d[o + 2] = rgb[j + 2] * it * 1.04;
      }
      const gk = e.gauges * 0.85 + il * 0.45;
      for (const i of C.glow) { const o = i * 4, j = i * 3; d[o] = rgb[j] * gk; d[o + 1] = rgb[j + 1] * gk; d[o + 2] = rgb[j + 2] * gk; }
      // needles: speedometer (left) and tachometer (right)
      const [g1, g2] = C.gauges, nk = Math.min(1, e.gauges * 0.9 + il * 0.6);
      const sa = Math.PI * 0.75 + clamp(this.speed / 50, 0, 1) * Math.PI * 1.5;
      const rpm = clamp(0.16 + (this.speed / 36) * 0.5 + (this.target > this.speed + 0.5 ? 0.12 : 0) + Math.sin(this.t * 31) * 0.004, 0, 1);
      const ta = Math.PI * 0.75 + rpm * Math.PI * 1.5;
      this.thick(g1[0], g1[1], g1[0] + Math.cos(sa) * 9, g1[1] + Math.sin(sa) * 9, 1, [255 * nk, 110 * nk, 46 * nk]);
      this.thick(g2[0], g2[1], g2[0] + Math.cos(ta) * 9, g2[1] + Math.sin(ta) * 9, 1, [255 * nk, 110 * nk, 46 * nk]);
      this.drawLCD(il);
      this.drawMirror();
    }
    drawLCD(il) {
      const C = cockpit(), L = C.lcd, d = this.d, e = this.env, R = this.radio;
      const night = 1 - clamp(e.interior, 0, 1);
      const on = R.on;
      const bg = on ? [lerp(124, 40, night) + this.lcdBoost * 20, lerp(132, 21, night), lerp(104, 6, night)] : [10 * il + 4, 10 * il + 4, 10 * il + 5];
      for (let y = L.y0; y < L.y1; y++) for (let x = L.x0; x < L.x1; x++) { const o = (y * W + x) * 4; d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; }
      if (!on) return;
      const fb = { w: W, h: H, px: d };
      const col = night > 0.45 ? [lerp(120, 255, night), lerp(70, 176, night), lerp(24, 72, night)] : [34, 38, 30];
      let l1 = R.band + ' ' + R.freq, l2 = R.time != null ? R.time : DA.clock ? DA.clock.hhmm() : '23:31';
      if (R.flicker > 0) {
        const r = this.rnd, g = '0123456789-';
        l1 = l1.replace(/[0-9A-Z]/g, (ch) => (r() < 0.5 ? g[(r() * g.length) | 0] : ch));
        if (r() < 0.3) l2 = '--:--';
      }
      drawText(fb, l1, L.x0 + 3, L.y0 + 1, col, false, 1);
      drawText(fb, l2, L.x1 - 3 - textW(l2, false), L.y0 + 7, col, false, 1);
      if (night > 0.3) this.glowAt(323, 244, 26, [255, 150, 50], 0.1 * night);
    }
    glowAt(x, y, r, c, k) { this.glows.length = 0; this.glows.push({ x, y, r, c, k }); this.drawGlows(); this.glows.length = 0; }
    drawMirror() {
      const M = cockpit().mirror, d = this.d, e = this.env, fl = this.flash;
      const mw = M.x1 - M.x0, mh = M.y1 - M.y0, glow = this.mirrorGlow;
      const pulse = glow > 0 ? (0.72 + 0.28 * Math.sin(this.t * 6.1)) * (0.8 + 0.2 * Math.sin(this.t * 17.3)) : 0;
      const hz = 0.52, dim = 0.82;
      for (let y = M.y0; y < M.y1; y++) {
        const v = (y - M.y0 + 0.5) / mh;
        for (let x = M.x0; x < M.x1; x++) {
          const u = (x - M.x0 + 0.5) / mw;
          const tl = (this.treeline[((x * 3 - this.bgX * 0.6) | 0) & 1023] / 12) * 0.34 + 0.06;
          let r, g, b;
          if (v < hz - tl) {
            const k = v / hz;
            r = lerp(e.skyTop[0], e.skyHor[0], k) + fl * 120; g = lerp(e.skyTop[1], e.skyHor[1], k) + fl * 128; b = lerp(e.skyTop[2], e.skyHor[2], k) + fl * 150;
          } else if (v < hz) { r = e.treeline[0]; g = e.treeline[1]; b = e.treeline[2]; }
          else {
            const half = (v - hz) * 1.3;
            if (Math.abs(u - 0.5) < half) { r = e.fog[0] * 0.8 + 6; g = e.fog[1] * 0.8 + 6; b = e.fog[2] * 0.8 + 8; if (Math.abs(u - 0.5) < 0.012 + half * 0.03) { r += 30 * (1 - e.dry * 0.3); g += 24; b += 6; } }
            else { r = e.treeline[0] * 0.8; g = e.treeline[1] * 0.8; b = e.treeline[2] * 0.8; }
          }
          if (glow > 0) {
            const gx = (u - 0.47) / 0.3, gy = (v - hz) / 0.24;
            const k = glow * pulse * Math.exp(-(gx * gx + gy * gy));
            const k2 = v < hz ? glow * pulse * 0.4 * Math.exp(-gx * gx * 0.4) * (v / hz) : 0;
            r += 255 * k + 150 * k2; g += 50 * k + 30 * k2; b += 22 * k + 16 * k2;
          }
          if (e.rain > 0.3 && wn(x * 7, y * 5 + ((this.t * 3) | 0)) > 250) { r += 20; g += 20; b += 24; }
          const o = (y * W + x) * 4;
          d[o] = r * dim; d[o + 1] = g * dim; d[o + 2] = b * dim;
        }
      }
    }
    /** Headlight haze (additive), vignette (multiply) and film grain (overlay), composited natively. */
    composite() {
      const g = this.ctx, P = this.post;
      g.save();
      const hk = this.exterior ? 0 : this.hazeK || 0;
      if (hk > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, hk); g.drawImage(P.haze, 0, 0); }
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1; g.drawImage(P.vig, 0, 0);
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.16;
      const ox = ((this.t * 977) | 0) % 256, oy = ((this.t * 613) | 0) % 128;
      g.drawImage(P.grain, ox, oy, W, H, 0, 0, W, H);
      g.restore();
    }
  }
  const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  /** Pre-rendered post layers: headlight haze (for 'lighter'), vignette ('multiply'), grain ('overlay'). */
  let POST = null;
  function postLayers() {
    if (POST) return POST;
    const mk = (w, h, fn) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d'), im = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = fn(x, y); im.data[i] = v[0]; im.data[i + 1] = v[1]; im.data[i + 2] = v[2]; im.data[i + 3] = 255; }
      g.putImageData(im, 0, 0);
      return c;
    };
    POST = {
      haze: mk(W, H, (x, y) => {
        const dx = (x - W / 2) / (120 + Math.max(0, y - HOR) * 1.1), dy = (y - (HOR + 22)) / 44;
        const h = Math.exp(-(dx * dx + dy * dy)) * smooth(HOR - 50, HOR + 10, y);
        return [30 * h, 32 * h, 35 * h];
      }),
      vig: mk(W, H, (x, y) => {
        const vx = (x - W / 2) / (W / 2), vy = (y - H / 2) / (H / 2);
        const k = clamp(1.08 - (vx * vx * 0.45 + vy * vy * 0.55) * 0.75, 0.35, 1) * 255;
        return [k, k, k];
      }),
      grain: mk(W + 256, H + 128, (x, y) => { const n = NOISE[((y * 811 + x * 7) ^ (x >> 3)) & 65535]; return [n, n, n]; }),
    };
    return POST;
  }
  S.Road = Road;

  /* ================================================================
   * Small optional synth voices (only when DA.audio exposes its AudioContext):
   * the wiper blade thunk and the car radio's soft music. Silent otherwise.
   * ================================================================ */
  const synth = {
    noise: null,
    buf(ctx) {
      if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      return (this.noise = b);
    },
    /** Rubber blade reversing on wet glass: a soft squeak + thump. */
    wiper(vol) {
      const r = A.raw();
      if (!r) return;
      try {
        const { ctx, dest } = r, t = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = this.buf(ctx);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        src.connect(bp); bp.connect(g); g.connect(dest);
        src.start(t); src.stop(t + 0.32);
      } catch (e) { /* audio graph unavailable */ }
    },
    /** Quiet, band-limited chords from a car speaker. Returns {stop(fade), warble()}. */
    music(vol) {
      const r = A.raw();
      if (!r) return null;
      try {
        const { ctx, dest } = r, t0 = ctx.currentTime;
        const out = ctx.createGain(); out.gain.value = 0;
        out.gain.linearRampToValueAtTime(0.05 * (vol || 1), t0 + 2);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        out.connect(hp); hp.connect(lp); lp.connect(dest);
        const chords = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392]];
        const oscs = [];
        for (let c = 0; c < 12; c++) {
          const ch = chords[c % 4], ts = t0 + c * 2.6;
          ch.forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = f / (i === 0 ? 2 : 1);
            g.gain.setValueAtTime(0.0001, ts); g.gain.linearRampToValueAtTime(0.22, ts + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, ts + 2.9);
            o.connect(g); g.connect(out); o.start(ts); o.stop(ts + 3);
            oscs.push(o);
          });
        }
        return {
          stop(fade) { try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, (fade || 0.05) / 3); oscs.forEach((o) => o.stop(ctx.currentTime + (fade || 0.05) + 0.1)); } catch (e) { /* ignore */ } },
          warble() { try { oscs.forEach((o) => { o.detune.setValueAtTime(0, ctx.currentTime); o.detune.linearRampToValueAtTime(-260, ctx.currentTime + 0.8); }); lp.frequency.setTargetAtTime(700, ctx.currentTime, 0.2); } catch (e) { /* ignore */ } },
        };
      } catch (e) { return null; }
    },
  };

  /* ================================================================
   * DRIVE — mode 'drive'
   * ================================================================ */
  const DRIVE = {
    arrive: { env: 'night', speed: 17, wipers: 'fast', dur: 40 },
    loop: { env: 'night', speed: 20, wipers: 'fast', dur: 60 },
    escape: { env: 'night', speed: 31, wipers: 'fast', dur: 30 },
    dawn: { env: 'dawn', speed: 15, wipers: 'int', dur: 28 },
    months_later: { env: 'winter', speed: 21, wipers: 'off', dur: 40 },
  };
  const DEFAULT_BULLETIN = [
    '...National Weather Service has extended the flash flood warning for the county until six a.m.',
    'Motorists on mountain routes should expect standing water and falling rock.',
    'If you do not have to travel tonight... stay home. Stay in.',
  ];

  /** Captions may be strings or {at, text, dur, style}; strings / missing `at` are spaced out in order. */
  function normCaptions(caps, kind) {
    if (caps == null) return null;
    const arr = [].concat(caps).filter((c) => c != null && c !== '');
    let at = kind === 'months_later' ? 2.2 : 2;
    return arr.map((c) => {
      const o = typeof c === 'string' ? { text: c } : Object.assign({}, c);
      if (o.text == null && o.t != null) o.text = o.t;
      if (o.at == null) o.at = at;
      o.text = fmt(o.text);
      at = o.at + (o.dur || 4.6) + 0.9;
      return o;
    });
  }
  function drive(opts) {
    opts = Object.assign({}, opts || {});
    const kind = DRIVE[opts.kind] ? opts.kind : 'arrive';
    opts.kind = kind;
    const cfg = DRIVE[kind];
    // Defaults from DA.content.drive[kind] ({captions:[string], radio, radioSpeaker, sign, signs});
    // `radio` is accepted as an alias of radioLine so callers can pass the content object straight in.
    const cd = content('drive.' + kind) || {};
    if (opts.radioLine == null) opts.radioLine = opts.radio != null ? opts.radio : cd.radio;
    if (opts.radioSpeaker == null && cd.radioSpeaker) opts.radioSpeaker = cd.radioSpeaker;
    if (opts.sign == null && cd.sign) opts.sign = cd.sign;
    if (opts.signs == null && Array.isArray(cd.signs)) opts.signs = cd.signs;
    opts.captions = normCaptions(opts.captions != null ? opts.captions : cd.captions, kind);
    let road = null;
    return runScene('drive', opts, (sc) => {
      const canvas = sceneCanvas(sc);
      road = sc.road = new Road(canvas, {
        env: cfg.env, speed: cfg.speed, wipers: cfg.wipers, winter: kind === 'months_later',
        seed: kind === 'loop' ? 14 : kind === 'months_later' ? 9 : kind === 'escape' ? 23 : 7,
      });
      sc.capBox = U.el('div', { class: 'sc-caps' });
      sc.hint = U.el('div', { class: 'sc-hint' });
      sc.el.append(sc.capBox, sc.hint);
      fadeLayer(sc, '#000', 1);
      sc.cruise = cfg.speed;
      sc.stopAt = null;
      sc.engineT = 0;
      road.onThunder = (delay, k) => A.play('thunder', { vol: 0.45 + 0.5 * k, delay });
      road.onWiper = (phase) => {
        if (A.has('wipers') && DA.audio && typeof DA.audio.has === 'function') { if (phase === 'up') A.play('wipers', { vol: 0.32 }); }
        else synth.wiper(0.8);
      };
      sc.prevAmbience = A.ambienceGet();
      sc.onUpdate = (dt) => {
        const fast = DA.input && (DA.input.down('KeyW') || DA.input.down('ArrowUp'));
        if (sc.targetFn) road.target = sc.targetFn();
        else if (sc.stopAt != null) road.target = clamp((sc.stopAt - road.pos) * 0.42, 0, sc.cruise);
        else if (kind === 'loop') road.target = fast ? 34 : sc.cruise;
        else road.target = sc.cruise;
        road.update(dt);
        sc.engineT -= dt;
        if (sc.engineT <= 0) { // throttle audio parameter updates
          sc.engineT = 0.15;
          const ev = sc.engineVol == null ? 1 : sc.engineVol;
          A.vol(sc.engine, (0.45 + 0.4 * clamp(road.speed / 34, 0, 1)) * ev);
          A.set(sc.engine, { speed: clamp(road.speed / 36, 0, 1) });
          A.vol(sc.rainRoof, road.env.rain * 0.55 * ev);
          A.ambience({ rain: road.env.rain * 0.9, wind: 0.25 + road.env.rain * 0.2, indoor: true, room: 'small', thunder: 0 });
        }
        if (sc.carStatic != null) A.static(sc.carStatic, { vol: 0.5 });
      };
      sc.onRender = () => road.render();
      sc.onKey = (e, down) => {
        if (e.code === 'Escape' && down) {
          if (opts.skippable && sc.t > 0.5) { skipScene(sc); return true; }
          if (DA.running && DA.modes.defs.pause && !DA.modes.has('pause')) { DA.modes.push('pause'); return true; }
          return true;
        }
        return false;
      };
      sc.onKill = () => {
        A.static(0);
        if (sc.music) sc.music.stop(0.3);
        if (sc.prevAmbience && endingDepth === 0) A.ambience(sc.prevAmbience);
      };
    }, async (sc) => {
      sc.engine = sc.track(A.loop('car_drive', { vol: 0.5, speed: clamp(cfg.speed / 36, 0, 1) }));
      if (road.env.rain > 0.05) sc.rainRoof = sc.track(A.loop('rain_car', { vol: road.env.rain * 0.55 }));
      A.ambience({ rain: road.env.rain * 0.9, indoor: true, room: 'small', hum: 0, generator: 'off', drone: 0, heartbeat: 0, thunder: 0,
        wind: 0.3, birds: kind === 'dawn', daylight: kind === 'dawn' || kind === 'months_later' });
      const caps = opts.captions || defaultCaptions(kind);
      for (const c of caps) sc.at(c.at || 0, () => sc.caption(sc.capBox, c.text, c.dur || 4.6, c.style === 'line' ? 'sc-cap-line' : ''));
      sc.capsEnd = caps.reduce((m, c) => Math.max(m, (c.at || 0) + (c.dur || 4.6)), 0);
      await SCRIPTS[kind](sc, road, opts, cfg);
      return 'done';
    });
  }
  function defaultCaptions(kind) {
    if (kind === 'arrive') {
      const t = DA.clock ? DA.clock.date() + ' — ' + DA.clock.hhmm() : '26 OCT 1999 — 23:31';
      return [{ at: 2, text: t }, { at: 7.5, text: 'COUNTY ROUTE 9' }];
    }
    if (kind === 'months_later') return [{ at: 2.2, text: 'COUNTY ROUTE 9' }];
    return [];
  }
  /** Esc on a skippable scene: quick fade, stop voices, resolve 'skipped'. */
  function skipScene(sc) {
    if (sc.skipping) return;
    sc.skipping = true;
    sc.result = 'skipped';
    clearSubtitles();
    (sc.voices || []).forEach((v) => v.stop());
    const done = () => finish(sc, 'skipped');
    if (sc.fadeEl) sc.fadeTo(1, 0.6).then(done, done);
    else done();
  }
  /** Car radio line(s): voiced through DA.audio + radio subtitles, sequential. */
  async function carRadio(sc, lines, speaker, o) {
    sc.voices = sc.voices || [];
    for (const l of lines) {
      if (sc.dead || sc.skipping) return;
      const v = A.voice(l.t, l.s || speaker, Object.assign({ radio: true, clarity: 0.8, vol: 0.6 }, o || {}));
      sc.voices.push(v);
      subtitle(l.t, { speaker: l.s || speaker, kind: 'radio', dur: v.dur + 0.3, clarity: o && o.subClarity != null ? o.subClarity : 1 });
      await sc.wait(v.dur + (l.gap != null ? l.gap : 0.5));
    }
  }
  function radioLines(x, speaker) {
    if (Array.isArray(x)) return linesOf(x, speaker);
    if (x && typeof x === 'object') return linesOf([x], speaker);
    if (typeof x === 'string') return [{ s: speaker, t: x }];
    return [];
  }

  const SCRIPTS = {
    /** P2: the drive in. Captions, bulletin, sign, beacon over the trees, lit windows, fade. */
    async arrive(sc, road, opts) {
      road.radio = { band: 'AM', freq: '1340', time: null, flicker: 0, on: true };
      road.nextLightning = 14;
      sc.at(4.8, () => road.triggerLightning(1));
      sc.carStatic = 0.05;
      sc.fadeTo(0, 3.2);
      road.spawn({ off: 5.4, spr: shieldSprite(9), w: 0.9 }, 150);
      sc.at(12, () => road.spawn({ off: 5.2, spr: markerSprite(12), w: 0.34 }, 150));
      const bulletin = radioLines(opts.radioLine, 'weather');
      sc.at(9, () => {
        A.play('radio_click', { vol: 0.3 });
        carRadio(sc, bulletin.length ? bulletin : DEFAULT_BULLETIN.map((t) => ({ s: 'weather', t })), 'weather').catch(() => {});
      });
      let st = null, signAt = null;
      sc.at(14, () => {
        st = road.spawnStation(330, 1, 26);
        signAt = st.at - 150;
        road.spawnSign(signSprite('arrive', [{ text: String(opts.sign || 'RELAY STATION 14').toUpperCase() }, { text: 'NEXT RIGHT >' }]), signAt - road.pos, 6.8);
      });
      road.decel = 2.6;
      sc.targetFn = () => {
        if (!st) return 17;
        let v = 17;
        const toSign = signAt - road.pos;
        if (toSign < 95) v = 9.5;                                   // ease off to read the sign
        return Math.min(v, Math.max(0, (st.at - 78 - road.pos) * 0.36)); // stop with the station framed
      };
      await sc.wait(35.5);
      sc.engineVol = 0.4;
      await sc.fadeTo(1, 3.8);
      sc.carStatic = 0;
      A.static(0);
      await sc.wait(0.6);
    },

    /**
     * Trying to leave: the road brings you back. Hold W to drive faster. The guide signs come from
     * DA.content.drive.loop.signs (pairs: where you think you are going, then where you are) —
     * 'PINE HOLLOW 6' and, a minute later, 'RELAY STATION 14 — 1 MI'; later loops use the next pair.
     */
    async loop(sc, road, opts) {
      const n = opts.loop || 1, odd = n >= 2;
      const signs = (Array.isArray(opts.signs) && opts.signs.length ? opts.signs : ['PINE HOLLOW 6', 'RELAY STATION 14 — 1 MI']).map((t) => fmt(String(t)).toUpperCase());
      const pair = [signs[((n - 1) * 2) % signs.length], signs[((n - 1) * 2 + 1) % signs.length]];
      const signLines = (t) => String(t).split(/\s+[—–-]\s+/).filter(Boolean).slice(0, 2).map((x) => ({ text: x.slice(0, 17) }));
      road.radio = { band: 'AM', freq: '1340', time: null, flicker: 0, on: true };
      road.nextLightning = 6;
      sc.carStatic = 0.14;
      sc.hint.textContent = 'HOLD W \u2014 DRIVE FASTER';
      sc.at(1, () => sc.opacity(sc.hint, 0.7, 0.8));
      sc.at(6, () => sc.opacity(sc.hint, 0, 1.2));
      sc.fadeTo(0, 1.6);
      const start = road.pos, dist = () => road.pos - start;
      const events = [
        // the way out: a sign for the town beyond the station…
        [20, () => road.spawnSign(signSprite('loop_a' + n, signLines(pair[0])), 150, 6.8)],
        [90, () => road.spawn({ off: 5.2, spr: markerSprite(odd ? 13 : 12), w: 0.34 }, 150)],
        // …and the next one says you are almost back where you started
        [150, () => road.spawnSign(signSprite('loop_b' + n, signLines(pair[1])), 150, odd ? -6.8 : 6.8)],
        [230, () => road.spawn({ off: 5.2, spr: markerSprite(13), w: 0.34 }, 150)],
        [260, () => { sc.st = road.spawnStation(380, odd ? -1 : 1, 26); }],
      ];
      if (!odd) events.push([380, () => road.spawnSign(signSprite('arrive', [{ text: 'RELAY STATION 14' }, { text: 'NEXT RIGHT >' }]), sc.st.at - 120 - road.pos, 6.6)]);
      else {
        // the same mile marker again, signs that disagree, and the radio finds the reserved channel
        events.push([250, () => road.spawnSign(signSprite('zero_l', [{ text: 'RELAY STATION 14' }, { text: '< 0 MI' }]), 170, 6.6)]);
        events.push([330, () => road.spawnSign(signSprite('zero_r', [{ text: 'RELAY STATION 14' }, { text: '0 MI >' }]), 170, -6.8)]);
        events.push([400, () => road.spawn({ off: 5.2, spr: markerSprite(13), w: 0.34 }, 110)]);
        events.push([300, () => { road.radio.freq = '148.32'; road.radio.band = '  '; road.radio.flicker = 1.2; sc.carStatic = 0.3; }]);
      }
      events.sort((a, b) => a[0] - b[0]);
      let i = 0;
      const t0 = sc.t;
      while (true) {
        await sc.wait(0.05);
        while (i < events.length && dist() >= events[i][0]) events[i++][1]();
        if (sc.st && sc.stopAt == null && sc.st.at - road.pos < 190) sc.stopAt = sc.st.at - 80;
        if ((sc.stopAt != null && road.speed < 2.5) || sc.t - t0 > 58) break;
      }
      sc.engineVol = 0.4;
      await sc.fadeTo(1, 2.6);
      sc.carStatic = 0;
      await sc.wait(0.5);
    },

    /** Away from the collapsing station: red in the mirror, rumble, then the sky begins to lighten. */
    async escape(sc, road) {
      road.radio = { band: 'AM', freq: '----', time: null, flicker: 3, on: true };
      road.mirrorGlow = 1;
      road.nextLightning = 3;
      sc.cruise = 33;
      sc.carStatic = 0.2;
      sc.fadeTo(0, 0.8);
      sc.tween(road, 'mirrorGlow', 0.25, 26);
      A.play('alarm', { vol: 0.22 });
      const quake = (amt, secs, vol) => { road.shake(amt, secs); A.play('collapse_rumble', { vol }); };
      sc.at(0.4, () => quake(3.2, 1.4, 0.9));
      sc.at(4.2, () => quake(2.2, 1.0, 0.65));
      sc.at(9.6, () => quake(1.2, 0.8, 0.4));
      sc.at(12, () => { sc.carStatic = 0.06; });
      sc.at(13, () => road.blendEnv('predawn', 15));
      sc.at(21, () => { road.wiper.mode = 'slow'; });
      await sc.wait(27);
      sc.engineVol = 0.5;
      await sc.fadeTo(1, 2.8);
      sc.carStatic = 0;
      await sc.wait(0.4);
    },

    /** Calm grey-blue dawn; the rain eases, birds. */
    async dawn(sc, road, opts) {
      road.radio = { band: 'FM', freq: '88.1', time: null, flicker: 0, on: false };
      sc.fadeTo(0, 3);
      const morning = radioLines(opts && opts.radioLine, 'dj');
      if (morning.length) sc.at(9, () => { road.radio.on = true; A.play('radio_click', { vol: 0.3 }); carRadio(sc, morning, 'dj', { clarity: 0.9, vol: 0.5 }).catch(() => {}); });
      sc.at(2, () => road.blendEnv('dawn', 16, { rain: 0, wet: 0.55 }));
      sc.at(14, () => { road.wiper.mode = 'off'; });
      await sc.wait(25);
      sc.engineVol = 0.4;
      await sc.fadeTo(1, 3);
      await sc.wait(0.4);
    },

    /** Months later: daylight, a song on the radio, then a voice through the crackle. Hard cut. */
    async months_later(sc, road, opts) {
      road.radio = { band: 'FM', freq: '101.5', time: opts.time || '15:52', flicker: 0, on: true };
      sc.fadeTo(0, 1.6);
      sc.at(1, () => { sc.music = synth.music(1); if (!sc.music && DA.audio && DA.audio.music) try { sc.music = DA.audio.music('car_radio') || null; } catch (e) { /* optional */ } });
      await sc.wait(Math.max(14, (sc.capsEnd || 0) + 1.5));
      A.play('static_burst', { vol: 0.5, radio: true });
      if (sc.music && sc.music.warble) sc.music.warble();
      road.radio.flicker = 2.2;
      sc.carStatic = 0.3;
      await sc.wait(0.9);
      if (sc.music) { sc.music.stop(0.2); sc.music = null; }
      sc.carStatic = 0.12;
      await sc.wait(0.8);
      const lines = radioLines(opts.radioLine || 'You only destroyed yours.', opts.radioSpeaker || 'unknown');
      await carRadio(sc, lines, opts.radioSpeaker || 'unknown', { clarity: 0.7, vol: 0.8 });
      await sc.wait(0.9);
      // hard cut to black and silence
      road.black = true;
      sc.fadeV = 1;
      sc.carStatic = 0;
      A.static(0);
      A.stop(sc.engine, 0);
      A.stop(sc.rainRoof, 0);
      A.silence(2.5);
      clearSubtitles();
      sc.capBox.textContent = '';
      await sc.wait(1.4);
    },
  };

  /* ================================================================
   * STATIC — animated radio/TV static into any 480×270 canvas.
   * level 0..1 (0 = black), rolling bright band, torn rows, cold tint.
   * ================================================================ */
  function staticFx(canvas) {
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), d32 = new Uint32Array(img.data.buffer);
    const rnd = U.mulberry32(4242);
    return {
      level: 1, tint: [0.86, 0.9, 1], t: 0, bar: 0.5, speckle: 0,
      update(dt) { this.t += dt; },
      draw() {
        const lvl = clamp(this.level, 0, 1.4), tr = this.tint[0], tg = this.tint[1], tb = this.tint[2];
        const barY = ((this.t * 38) % (H + 80)) - 40;
        const off = (rnd() * 65536) | 0;
        for (let y = 0; y < H; y++) {
          const tear = rnd() < 0.035 * lvl ? ((rnd() * 40) | 0) : 0;
          const band = 0.62 + this.bar * 0.55 * Math.exp(-Math.pow((y - barY) / 16, 2));
          const rowDim = 0.82 + 0.18 * Math.sin(y * 0.9 + this.t * 40);
          const k = lvl * band * rowDim;
          let i = y * W;
          const base = (off + y * 331 + tear) & 65535;
          for (let x = 0; x < W; x++, i++) {
            let n = NOISE[(base + x * 7) & 65535] * k;
            if (n > 255) n = 255;
            d32[i] = 0xff000000 | ((n * tb) << 16) | ((n * tg) << 8) | (n * tr);
          }
        }
        ctx.putImageData(img, 0, 0);
      },
    };
  }
  S.staticFx = staticFx;

  /* ================================================================
   * CUTSCENE IMAGES — full-frame pixel pictures behind cutscene text.
   * Each factory returns {update(dt), draw(), dispose?()} drawing into sc.canvas.
   * ================================================================ */
  /** Blit a Pix buffer {w,h,px} scaled (nearest) into a canvas via an offscreen canvas. */
  function pixCanvas(p) {
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    const g = c.getContext('2d'), im = g.createImageData(p.w, p.h);
    im.data.set(p.px);
    g.putImageData(im, 0, 0);
    return c;
  }
  function paint(canvas, fn) {
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    fn(g);
  }
  /** Dust motes drifting through a beam of light (shared by the daylight pictures). */
  function dustLayer(n, box) {
    const rnd = U.mulberry32(77), motes = [];
    for (let i = 0; i < n; i++) motes.push({ x: box[0] + rnd() * box[2], y: box[1] + rnd() * box[3], v: 0.5 + rnd() * 2, ph: rnd() * TAU });
    return {
      update(dt) { for (const m of motes) { m.y += m.v * dt * 1.2; m.x += Math.sin(m.ph += dt * 0.7) * dt * 1.5; if (m.y > box[1] + box[3]) m.y = box[1]; } },
      draw(g, alpha) {
        g.fillStyle = 'rgba(255,240,210,' + (alpha || 0.5) + ')';
        for (const m of motes) g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
      },
    };
  }

  const IMAGES = {
    black(sc) { return { update() {}, draw() { paint(sc.canvas, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }); } }; },

    static(sc, st) { const fx = staticFx(sc.canvas); fx.level = st && st.level != null ? st.level : 0.62; return fx; },

    /** The road outside the station at dawn, standing still: exterior camera, lit windows paling. */
    dawn(sc) {
      const road = new Road(sc.canvas, { env: 'dawn', exterior: true, speed: 0.7, camH: 1.6, camX: 1.3, seed: 7, lightningAt: 1e9, wipers: 'off' });
      road.tweak({ rain: 0.05, haze: 0, ambient: 0.95, skyTop: [84, 98, 126], skyHor: [206, 190, 178], glow: [240, 184, 142], glowAmt: 0.9,
        fog: [156, 156, 164], fogNear: 18, fogFar: 300, cloud: [168, 164, 170], treeline: [70, 76, 80] });
      road.spawnStation(96, 1);
      return { road, update(dt) { road.update(dt); }, draw() { road.render(); } };
    },
    road(sc) { return IMAGES.dawn(sc); },

    /** The radio room in daylight, abandoned (real renderer when present, else painted). */
    abandoned(sc) {
      const real = realView({ variant: 'abandoned', daylight: 1, noise: 0.04 });
      if (real) {
        let acc = 1;
        return { update(dt) { acc += dt; }, draw() { if (acc >= 0.25) { acc = 0; if (!real.draw(sc.canvas)) this.fallback = this.fallback || paintedRoom(sc.canvas); } if (this.fallback) this.fallback.draw(); } };
      }
      return paintedRoom(sc.canvas);
    },

    newspaper(sc) {
      const pix = newspaperPix(), pc = pixCanvas(pix), dust = dustLayer(40, [260, 0, 200, 270]);
      let t = 0;
      return {
        update(dt) { t += dt; dust.update(dt); },
        draw() {
          paint(sc.canvas, (g) => {
            g.fillStyle = '#1b1712'; g.fillRect(0, 0, W, H);
            g.save(); g.translate(240, 142); g.rotate(-0.035); g.drawImage(pc, -pix.w / 2, -pix.h / 2); g.restore();
            const gr = g.createLinearGradient(300, 0, 140, 270);
            gr.addColorStop(0, 'rgba(255,236,190,0.16)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
            g.fillStyle = gr; g.fillRect(0, 0, W, H);
            dust.draw(g, 0.35 + 0.1 * Math.sin(t));
          });
        },
      };
    },

    multiverse(sc) {
      const grid = montageGrid(sc.canvas, { cols: 6, flicker: 0.4 });
      return { update(dt) { grid.update(dt); }, draw() { grid.draw(); } };
    },

    /** Black, a reel-to-reel counter and a play lamp: the researchers' tape. */
    tape(sc, st) {
      const start = st && st.counter != null ? st.counter : 214;
      let t = 0;
      const p = newPix(W, H), drum = newPix(12, 32);
      if (sc.textBox) sc.textBox.classList.add('sc-text-low');
      const grey = [196, 196, 186], bez = [26, 26, 28];
      return {
        update(dt) { t += dt; },
        dispose() { if (sc.textBox) sc.textBox.classList.remove('sc-text-low'); },
        draw() {
          p.px.fill(0);
          for (let i = 3; i < p.px.length; i += 4) p.px[i] = 255;
          const v = start + t * 0.9, whole = Math.floor(v), frac = v - whole;
          const digits = String(whole % 10000).padStart(4, '0');
          const x0 = 240 - 32 - 8, y0 = 30;
          prect(p, x0 - 6, y0 - 5, 4 * 16 + 8, 26, bez);
          for (let k = 0; k < 4; k++) {
            // each drum is drawn in its own buffer, then copied through a 12×16 window
            drum.px.fill(0);
            for (let i = 3; i < drum.px.length; i += 4) drum.px[i] = 255;
            const roll = k === 3 ? Math.round(frac * 16) : 0;
            drawText(drum, digits[k], 1, 1, grey, true, 2);
            drawText(drum, String((+digits[k] + 1) % 10), 1, 17, grey, true, 2);
            for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
              const si = ((y + roll) * 12 + x) * 4;
              const c = y < 2 || y > 13 ? 0.55 : 1; // drum curvature shading
              pset(p, x0 + k * 16 + x, y0 + y, [drum.px[si] * c, drum.px[si + 1] * c, drum.px[si + 2] * c]);
            }
          }
          const on = Math.sin(t * 3) > -0.2;
          prect(p, x0 + 4 * 16 + 8, y0 + 5, 4, 4, on ? [200, 40, 30] : [50, 12, 10]);
          drawText(p, 'PLAY', x0 + 4 * 16 + 15, y0 + 5, [110, 110, 104], false, 1);
          for (const [cx, cy, r, sp] of [[206, 86, 17, 1.1], [274, 86, 17, 0.8]]) {
            for (let a = 0; a < 3; a++) {
              const ang = t * sp + (a * TAU) / 3;
              for (let q = 4; q < r - 2; q++) prect(p, Math.round(cx + Math.cos(ang) * q), Math.round(cy + Math.sin(ang) * q), 1, 1, [44, 44, 46]);
            }
            for (let a = 0; a < 72; a++) { const ang = (a / 72) * TAU; prect(p, Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1, [36, 36, 38]); }
            prect(p, cx - 1, cy - 1, 3, 3, [60, 60, 62]);
          }
          const g = sc.canvas.getContext('2d'), im = g.createImageData(W, H);
          im.data.set(p.px);
          g.putImageData(im, 0, 0);
        },
      };
    },
  };

  /** A 1999 newspaper found in 2049: yellowed, legible masthead and date, the rest a blur of columns. */
  function newspaperPix() {
    const w = 300, h = 250, p = newPix(w, h), rnd = U.mulberry32(2049);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = vn(x * 2, y * 2) / 255, stain = vn(x + 90, y + 40) > 190 ? 0.9 : 1;
      const k = (0.86 + n * 0.14) * stain * (1 - 0.18 * smooth(0.7, 1, Math.hypot(x / w - 0.5, y / h - 0.5) * 1.4));
      pset(p, x, y, [214 * k, 202 * k, 170 * k]);
    }
    const ink = [44, 38, 32], soft = [120, 110, 92];
    const doc = content('docs.doc_newspaper_2049') || {};
    const bolds = String(doc.body || '').match(/\*\*([^*]+)\*\*/g) || [];
    const clean = (b) => b.replace(/\*\*/g, '').replace(/:$/, '').trim().toUpperCase();
    const dateLine = bolds.map(clean).find((b) => /2049/.test(b));
    const heads = bolds.map(clean).filter((b) => !/2049/.test(b) && b.length > 12 && b.length <= 46);
    const docs = { masthead: doc.masthead || doc.title, headline: doc.headline || heads.find((b) => /RELAY|STATION/.test(b)) || heads[0] };
    const mast = String(docs.masthead || 'THE COUNTY LEDGER').toUpperCase();
    drawText(p, mast, Math.round((w - textW(mast, true) * 2) / 2), 12, ink, true, 2);
    prect(p, 10, 30, w - 20, 1, ink); prect(p, 10, 44, w - 20, 1, ink);
    const date = dateLine || 'WEDNESDAY, OCTOBER 27, 2049';
    drawText(p, date, Math.round((w - textW(date, true)) / 2), 34, ink, true, 1);
    const head = String(docs.headline || '').toUpperCase().slice(0, 44);
    if (head) drawText(p, head, Math.round((w - textW(head, true)) / 2), 52, ink, true, 1);
    else for (let k = 0; k < 2; k++) prect(p, 30 + k * 20, 52 + k * 11, w - 60 - k * 40, 7, ink);
    // photograph: the station under the pines, printed coarse
    for (let y = 78; y < 156; y++) for (let x = 18; x < 138; x++) {
      const v = (y - 78) / 78, sky = 150 - v * 50, dot = ((x + y) & 1) ? 6 : -6;
      pset(p, x, y, [sky + dot, sky - 6 + dot, sky - 18 + dot]);
    }
    prect(p, 18, 138, 120, 18, [86, 82, 72]);
    prect(p, 52, 118, 60, 20, [72, 70, 64]); prect(p, 50, 116, 64, 3, [54, 52, 48]);
    for (let k = 0; k < 5; k++) prect(p, 56 + k * 11, 124, 6, 5, [118, 116, 104]);
    for (let y = 84; y < 118; y++) { pset(p, 104 + (y % 5 === 0 ? 1 : 0), y, [46, 44, 40]); pset(p, 106, y, [46, 44, 40]); }
    for (const [tx, th] of [[24, 46], [36, 38], [118, 50], [130, 40], [44, 30]]) {
      for (let y = 0; y < th; y++) { const hw = Math.round((y / th) * 7) + (y % 6 < 2 ? 1 : 0); prect(p, tx - hw, 140 - th + y, hw * 2 + 1, 1, [40, 42, 36]); }
    }
    prect(p, 18, 156, 120, 1, ink);
    for (let col = 0; col < 3; col++) {
      const cx = col === 0 ? 18 : 148 + (col - 1) * 74, top = col === 0 ? 164 : 78;
      for (let y = top; y < h - 12; y += 5) {
        const len = col === 0 ? 120 : 66;
        const cut = rnd() < 0.12 ? len * (0.3 + rnd() * 0.5) : len;
        for (let x = cx; x < cx + cut; x++) if (rnd() < 0.8) pset(p, x, y, (x + y) % 9 ? soft : ink);
      }
    }
    return p;
  }

  /** Painted fallback for the abandoned radio room: dust, a dead console, daylight through the window. */
  function paintedRoom(canvas) {
    const p = newPix(W, H), wx0 = 338, wx1 = 434, wy0 = 36, wy1 = 124;
    const lightAt = (x, y) => clamp(1.25 - Math.hypot(x - 386, (y - 110) * 1.3) / 330, 0.35, 1.25);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const L = lightAt(x, y);
      let c;
      if (y < 12) c = [58, 54, 48];
      else if (y < 172) {
        const st = smooth(170, 225, vn(x, y + 40)) * 0.55, peel = vn(x * 2 + 7, y * 2);
        c = [lerp(118, 84, st), lerp(110, 72, st), lerp(94, 54, st)];
        if (peel > 226) c = [146, 140, 124];
        if (y > 150) c = shade(c, 0.86);
        if (vn(x * 3, 9) > 190 && y > 12 && y < 60 + (vn(x, 3) >> 3)) c = shade(c, 0.8); // water runs
      } else {
        const board = ((y - 172) * (y - 172)) % 23 < 2;
        c = board ? [52, 46, 38] : [80, 70, 56];
        if (vn(x * 2, y * 3) > 222) c = [94, 86, 72];
      }
      pset(p, x, y, shade(c, L));
    }
    // window: blown-out daylight, frame, a cracked pane, a slat of fallen blind
    prect(p, wx0, wy0, wx1 - wx0, wy1 - wy0, [236, 240, 240]);
    prect(p, 384, wy0, 4, wy1 - wy0, [84, 78, 66]); prect(p, wx0, 78, wx1 - wx0, 4, [84, 78, 66]);
    prect(p, wx0 - 3, wy0 - 3, wx1 - wx0 + 6, 3, [70, 64, 54]); prect(p, wx0 - 3, wy1, wx1 - wx0 + 6, 5, [70, 64, 54]);
    for (let k = 0; k < 26; k++) pset(p, 350 + k, 44 + k * 1.2 + (k % 3), [120, 124, 126]);
    for (let k = 0; k < 60; k++) pset(p, 392 + k * 0.7, 88 + k * 0.5, [150, 144, 128]);
    // the console along the wall: dead receivers, meters, knobs, a skin of dust
    prect(p, 36, 116, 262, 62, [52, 48, 42]);
    prect(p, 36, 116, 262, 2, [104, 98, 86]);
    prect(p, 30, 176, 274, 8, [40, 36, 30]);
    for (let k = 0; k < 5; k++) {
      const x = 44 + k * 50;
      prect(p, x, 124, 44, 30, [70, 66, 58]);
      prect(p, x + 4, 128, 22, 10, [22, 22, 20]);
      prect(p, x + 5, 129, 8, 1, [60, 58, 50]);
      for (let q = 0; q < 3; q++) prect(p, x + 30 + (q % 2) * 6, 128 + q * 7, 4, 4, [34, 32, 28]);
      for (let q = 0; q < 4; q++) prect(p, x + 5 + q * 6, 144, 3, 3, [30, 28, 24]);
    }
    prect(p, 250, 96, 30, 20, [60, 56, 48]); prect(p, 254, 100, 22, 12, [26, 26, 24]); // a cassette deck on top
    // the chair, turned toward the window
    prect(p, 176, 150, 36, 8, [34, 30, 26]); prect(p, 180, 118, 28, 34, [40, 36, 30]); prect(p, 192, 158, 4, 26, [30, 28, 24]);
    prect(p, 176, 184, 36, 3, [30, 28, 24]);
    // papers on the floor
    for (const [x, y] of [[92, 214], [118, 226], [300, 232]]) prect(p, x, y, 14, 6, [172, 166, 150]);
    const base = pixCanvas(p), dust = dustLayer(80, [290, 20, 190, 240]);
    let t = 0;
    return {
      update(dt) { t += dt; dust.update(dt); },
      draw() {
        paint(canvas, (g) => {
          g.drawImage(base, 0, 0);
          g.fillStyle = 'rgba(255,246,222,' + (0.1 + 0.02 * Math.sin(t * 0.5)).toFixed(3) + ')';
          g.beginPath(); g.moveTo(wx0, wy0); g.lineTo(wx1, wy0); g.lineTo(330, 270); g.lineTo(150, 270); g.lineTo(wx0, wy1); g.closePath(); g.fill();
          dust.draw(g, 0.5 + 0.15 * Math.sin(t * 0.8));
        });
      },
    };
  }

  /**
   * A camera near the radio chair via the real renderer, if DA.render + DA.world are present.
   * Returns {draw(canvas, opts?) → bool} or null.
   */
  function realView(base) {
    if (!(DA.render && typeof DA.render.renderView === 'function' && DA.world && typeof DA.world.point === 'function')) return null;
    const cam = roomCamera(0, null);
    if (!cam || !(DA.world.maps && DA.world.maps[cam.map])) return null;
    return {
      cam,
      draw(canvas, extra, c) {
        try {
          const o = Object.assign({ mapId: cam.map }, base || {}, extra || {});
          DA.render.renderView(canvas, c || cam, o);
          return true;
        } catch (e) {
          if (!realView.warned) { realView.warned = true; console.warn('[scenes] renderView failed, using painted views', e); }
          return false;
        }
      },
    };
  }
  /** Degrees if the value looks like degrees (map points), else radians. */
  const toRad = (a) => (a == null ? -Math.PI / 2 : Math.abs(a) > TAU + 0.01 ? (a * Math.PI) / 180 : a);
  /** Heading of a world point in radians (world.point gives radians + deg; map defs use degrees). */
  const ptAngle = (p) => (p.deg != null ? (p.deg * Math.PI) / 180 : toRad(p.angle));
  /** Camera for the radio room: cam_4 if defined, else behind pt_radio_chair looking at the desk. */
  function roomCamera(jitter, rnd) {
    let p = null;
    try { p = DA.world.point('cam_4'); } catch (e) { p = null; }
    let chair = null;
    try { chair = DA.world.point('pt_radio_chair'); } catch (e) { chair = null; }
    rnd = rnd || Math.random;
    const j = jitter || 0;
    if (chair && (!p || rnd() < 0.72)) {
      const a = ptAngle(chair);
      return { map: chair.map || 'station', x: chair.x - Math.cos(a) * 0.9 + (rnd() - 0.5) * j, y: chair.y - Math.sin(a) * 0.9 + (rnd() - 0.5) * j,
        angle: a + (rnd() - 0.5) * j * 0.9, pitch: (rnd() - 0.5) * j * 0.3, fov: 66 + (rnd() - 0.5) * j * 20 };
    }
    if (!p) return null;
    return { map: p.map || 'station', x: p.x + (rnd() - 0.5) * j * 0.6, y: p.y + (rnd() - 0.5) * j * 0.6, angle: ptAngle(p) + (rnd() - 0.5) * j * 0.8,
      pitch: (rnd() - 0.5) * j * 0.3, fov: 70 + (rnd() - 0.5) * j * 16 };
  }

  /* ================================================================
   * MONTAGE GRID — dozens of radio rooms, each from a slightly different camera and timeline.
   * Uses DA.render.renderView when available, else painted placeholder rooms under static.
   * ================================================================ */
  const CELL_VARIANTS = ['normal', 'abandoned', 'blend', 'daylight', 'mono', 'mirror', 'figure', 'chair', 'normal', 'blend', 'abandoned', 'figure', 'emergency', 'daylight'];
  /**
   * Decision 9: the montage's rooms are other timelines, so they are lit by THEIR power, not by
   * tonight's (by ACT 5 the generator has been off for hours: the live light field is emergency red).
   * Light fields per timeline, from DA.world.lightAs: lit (main + corridor on), day (lit + grey
   * daylight through the windows), abandoned (no power, daylight) and emergency (a few cells stay in
   * the red, for contrast). Each comes with its own tint and emissive level. null → live world light.
   */
  function montageLights(mapId) {
    const w = DA.world;
    if (!w || typeof w.lightAs !== 'function' || !w.maps || !w.maps[mapId]) return null;
    try {
      const m = w.maps[mapId], win = m.winLight, N = m.w * m.h;
      const lit = w.lightAs(mapId, { main: true, corridor: true, emergency: 'auto', outdoor: true });
      const dead = w.lightAs(mapId, { main: false, corridor: false, emergency: false, outdoor: false, radio: false, ups: false });
      const emg = w.lightAs(mapId, { main: false, corridor: false, emergency: true, outdoor: false });
      if (!lit || lit.length !== N) return null;
      const day = Float32Array.from(lit), ab = Float32Array.from(dead || lit);
      for (let i = 0; i < N; i++) {
        if (m.wall && m.wall[i]) continue;
        const wl = win ? win[i] : 0;
        day[i] = Math.min(1.5, day[i] + 0.1 + wl * 0.6);
        ab[i] = Math.min(1.3, ab[i] + 0.26 + wl * 0.55);
      }
      return {
        lit: { light: lit, tint: [1, 1, 1], emissive: 1, lightScale: 1.35 },
        day: { light: day, tint: [1, 1, 1], emissive: 0.6, lightScale: 1.25 },
        abandoned: { light: ab, tint: [1, 1, 1], lightScale: 1.6 },
        emergency: { light: emg || lit, tint: [1, 0.42, 0.37], emissive: 0.15, lightScale: 1.5 },
      };
    } catch (e) { return null; }
  }
  let NOISE_TILE = null;
  function noiseTile() {
    if (NOISE_TILE) return NOISE_TILE;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 144;
    const g = c.getContext('2d'), im = g.createImageData(256, 144);
    for (let i = 0; i < 256 * 144; i++) { const n = NOISE[(i * 13) & 65535] * 0.75; im.data[i * 4] = n * 0.9; im.data[i * 4 + 1] = n * 0.93; im.data[i * 4 + 2] = n; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return (NOISE_TILE = c);
  }
  /** Painted miniature radio room (placeholder when the raycaster is absent). */
  function paintCell(canvas, v, rnd) {
    const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    g.imageSmoothingEnabled = false;
    const pal = {
      normal: ['#3b4a42', '#1d2420', '#0e1a2a', '#c8a050'], abandoned: ['#6a604e', '#3a342a', '#d8dde0', '#3a3228'],
      blend: ['#4d5048', '#2a2a24', '#6c7a88', '#a07a40'], daylight: ['#9aa39a', '#50564e', '#eef3f6', '#70603a'],
      mono: ['#5a5a5a', '#262626', '#9a9a9a', '#8a8a8a'], mirror: ['#3b4a42', '#1d2420', '#0e1a2a', '#c8a050'],
      figure: ['#34403a', '#1a201c', '#0b1522', '#c8a050'], chair: ['#3b4a42', '#1d2420', '#0e1a2a', '#c8a050'],
    }[v] || ['#3b4a42', '#1d2420', '#0e1a2a', '#c8a050'];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    g.fillStyle = pal[1]; g.fillRect(0, h * 0.64, w, h);
    g.fillStyle = pal[2]; g.fillRect(w * 0.7, h * 0.14, w * 0.2, h * 0.3);
    g.fillStyle = '#15130f'; g.fillRect(w * 0.08, h * 0.42, w * 0.56, h * 0.2);
    g.fillStyle = '#23211c'; g.fillRect(w * 0.1, h * 0.3, w * 0.5, h * 0.12);           // receivers stacked on the desk
    g.fillStyle = pal[3];
    for (let k = 0; k < 4; k++) g.fillRect(w * (0.12 + k * 0.13), h * 0.47, Math.max(1, w * 0.05), Math.max(1, h * 0.04));
    for (let k = 0; k < 3; k++) g.fillRect(w * (0.14 + k * 0.16), h * 0.34, Math.max(1, w * 0.07), Math.max(1, h * 0.03));
    const cx = v === 'chair' ? w * (0.62 + rnd() * 0.2) : w * 0.34;
    g.fillStyle = '#0c0b09'; g.fillRect(cx - w * 0.06, h * 0.52, w * 0.12, h * 0.22); g.fillRect(cx - w * 0.07, h * 0.7, w * 0.14, h * 0.04);
    if (v === 'figure') { g.fillStyle = '#050505'; const fx = w * (0.45 + rnd() * 0.3); g.fillRect(fx, h * 0.24, w * 0.06, h * 0.5); g.fillRect(fx + w * 0.005, h * 0.16, w * 0.05, h * 0.09); }
    g.globalAlpha = v === 'abandoned' || v === 'daylight' ? 0.12 : 0.22;
    g.drawImage(noiseTile(), (rnd() * (256 - w)) | 0, (rnd() * (144 - h)) | 0, w, h, 0, 0, w, h);
    g.globalAlpha = 1;
  }
  function montageGrid(canvas, o) {
    const g = canvas.getContext('2d');
    const real = realView(null);
    const rnd = U.mulberry32(1402);
    let realOk = !!real, chair = null;
    try { chair = DA.world && DA.world.point ? DA.world.point('pt_radio_chair') : null; } catch (e) { chair = null; }
    const grid = { cells: [], cols: 0, flicker: o.flicker || 0, black: false, t: 0 };
    const LT = real ? montageLights(real.cam.map) : null;
    /** Copy a timeline's lighting into renderView opts (no-op without DA.world.lightAs). */
    const lightUp = (opts, key) => {
      const l = LT && LT[key];
      if (!l) return;
      opts.light = l.light;
      opts.tint = l.tint;
      opts.lightScale = l.lightScale;
      if (l.emissive != null) opts.emissive = l.emissive;
    };
    grid.setCols = (n) => {
      if (n === grid.cols) return;
      grid.cols = n;
      const cw = Math.floor(W / n), ch = Math.floor(H / n), ox = (W - cw * n) >> 1, oy = (H - ch * n) >> 1;
      const old = grid.cells;
      grid.cells = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const prev = old[(r * n + c) % Math.max(1, old.length)];
        grid.cells.push({ x: ox + c * cw, y: oy + r * ch, w: cw, h: ch, canvas: null, rendered: false, prev: prev && prev.rendered ? prev.canvas : null,
          variant: n === 1 ? 'normal' : CELL_VARIANTS[(rnd() * CELL_VARIANTS.length) | 0], glitch: 0, dark: 0 });
      }
    };
    function renderCell(cell) {
      let cw = Math.max(8, cell.w - 1), chh = Math.max(5, cell.h - 1);
      if (!realOk && cw > 128) { chh = Math.round((chh * 128) / cw); cw = 128; } // painted cells stay chunky pixels
      if (!cell.canvas || cell.canvas.width !== cw) { cell.canvas = document.createElement('canvas'); cell.canvas.width = cw; cell.canvas.height = chh; }
      const v = cell.variant;
      if (realOk) {
        const cam = roomCamera(grid.cols === 1 ? 0.15 : 1, rnd) || real.cam;
        const opts = { variant: 'normal', noise: 0.05 + rnd() * 0.1 };
        lightUp(opts, 'lit');
        if (v === 'abandoned') { lightUp(opts, 'abandoned'); opts.variant = 'abandoned'; opts.daylight = 0.5 + rnd() * 0.5; }
        else if (v === 'blend') { opts.variant = 'blend'; opts.blend = 0.3 + rnd() * 0.6; }
        else if (v === 'daylight') { lightUp(opts, 'day'); opts.daylight = 1; }
        else if (v === 'emergency') lightUp(opts, 'emergency');
        else if (v === 'mono') { opts.monochrome = true; opts.noise = 0.35; }
        else if (v === 'figure' && chair) opts.sprites = [{ x: chair.x + (rnd() - 0.5) * 1.2, y: chair.y + (rnd() - 0.5) * 1.2, tex: rnd() < 0.5 ? 'spr_figure' : 'spr_operator', scale: 1 }];
        else if (v === 'chair' && chair) { opts.providers = false; opts.sprites = [{ x: chair.x + (rnd() - 0.5) * 1.6, y: chair.y + (rnd() - 0.5) * 1.6, tex: 'spr_chair', scale: 0.6 }]; }
        realOk = real.draw(cell.canvas, opts, cam);
      }
      if (!realOk) paintCell(cell.canvas, v, rnd);
      cell.rendered = true;
    }
    grid.update = (dt) => {
      grid.t += dt;
      const cells = grid.cells;
      if (!cells.length) return;
      let budget = grid.cols <= 2 ? 1 : Math.min(10, Math.ceil(cells.length / 12) + 2);
      for (const c of cells) if (!c.rendered && budget > 0) { renderCell(c); budget--; }
      while (budget-- > 0 && rnd() < 0.35 + grid.flicker * 0.5) {
        const c = cells[(rnd() * cells.length) | 0];
        if (rnd() < 0.3 && grid.cols > 1) c.variant = CELL_VARIANTS[(rnd() * CELL_VARIANTS.length) | 0];
        renderCell(c);
      }
      for (const c of cells) {
        if (c.glitch > 0) c.glitch -= dt;
        if (c.dark > 0) c.dark -= dt;
        if (rnd() < grid.flicker * dt * 0.8) c.glitch = 0.08 + rnd() * 0.2;
        if (rnd() < grid.flicker * dt * 0.35) c.dark = 0.05 + rnd() * 0.15;
      }
    };
    grid.draw = () => {
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      if (grid.black) return;
      const tile = noiseTile();
      for (const c of grid.cells) {
        if (c.dark > 0) continue;
        const src = c.rendered ? c.canvas : c.prev;
        const gx = c.glitch > 0 ? Math.round((rnd() - 0.5) * c.w * 0.3) : 0;
        if (!src) { g.drawImage(tile, (rnd() * 60) | 0, (rnd() * 30) | 0, 64, 36, c.x, c.y, c.w - 1, c.h - 1); continue; }
        if (c.variant === 'mirror') { g.save(); g.translate(c.x + c.w - 1 + gx, c.y); g.scale(-1, 1); g.drawImage(src, 0, 0, c.w - 1, c.h - 1); g.restore(); }
        else g.drawImage(src, c.x + gx, c.y, c.w - 1, c.h - 1);
        if (c.glitch > 0) { g.globalAlpha = 0.5; g.drawImage(tile, (rnd() * 60) | 0, (rnd() * 30) | 0, 64, 36, c.x, c.y, c.w - 1, c.h - 1); g.globalAlpha = 1; }
      }
    };
    grid.setCols(o.cols || 1);
    return grid;
  }

  /** Voice fragments for the montage: content.fragments, recorded deaths, then a fallback set. */
  function montageFragments() {
    const out = linesOf(content('fragments'), null).filter((l) => l.t);
    for (const d of (DA.meta && DA.meta.deaths) || []) for (const l of [].concat(d.lines || [])) { const x = lineOf(l, 'you'); if (x) out.push(x); }
    if (out.length < 6) {
      ['Station Fourteen, listen carefully.', 'Keep the channel open.', 'Is anybody there?', "Just log it. Don't respond.",
        'Is it still raining where you are?', "Why didn't you leave?", "He isn't you anymore.", "Don't turn around.",
        'Station Fourteen, radio check.', 'I can hear you reading this.', 'Go down. See what is under us.', 'There is nothing there.']
        .forEach((t) => out.push({ s: null, t }));
    }
    return out;
  }
  const MONTAGE_SPEAKERS = ['you', 'you_calm', 'you_panic', 'you_injured', 'you_old', 'you_now', 'woman', 'girl', 'hollis', 'dispatch', 'keep_open'];

  /** Open the channel: the grid grows from one radio room to a hundred, voices pile up, then silence. */
  function multiverse(secs) {
    secs = Math.max(4, secs || 14);
    return runScene('multiverse', { kind: 'multiverse', block: true }, (sc) => {
      sc.canvas = sceneCanvas(sc);
      sc.grid = montageGrid(sc.canvas, { cols: 1, flicker: 0 });
      fadeLayer(sc, '#000', 1);
      sc.onUpdate = (dt) => sc.grid.update(dt);
      sc.onRender = () => sc.grid.draw();
      sc.onKey = (e) => e.code === 'Escape';
      sc.onKill = () => A.static(0);
    }, async (sc) => {
      const steps = [1, 2, 3, 4, 6, 8, 10, 12], frags = montageFragments(), rnd = U.mulberry32(88);
      const voices = (sc.voices = []);
      sc.fadeTo(0, 0.6);
      const t0 = sc.t;
      let phase = -1, nextVoice = 0.8;
      while (sc.t - t0 < secs) {
        const p = (sc.t - t0) / secs;
        const ph = Math.min(steps.length - 1, Math.floor(Math.pow(p, 0.85) * steps.length));
        if (ph !== phase) {
          phase = ph;
          sc.grid.setCols(steps[ph]);
          sc.grid.flicker = ph / (steps.length - 1);
          A.play('static_burst', { vol: 0.2 + p * 0.5 });
        }
        A.static(0.1 + p * 0.85, { vol: 0.5 + 0.5 * p });
        if (sc.t - t0 >= nextVoice) {
          const f = frags[(rnd() * frags.length) | 0], spk = f.s || MONTAGE_SPEAKERS[(rnd() * MONTAGE_SPEAKERS.length) | 0];
          const clar = 0.25 + rnd() * 0.6;
          voices.push(A.voice(fmt(f.t), spk, { radio: true, clarity: clar, vol: 0.25 + p * 0.55 }));
          if (voices.length > 10) voices.shift().stop();
          if (rnd() < 0.35) subtitle(fmt(f.t), { speaker: spk, kind: 'radio', clarity: clar, dur: 1.6 });
          nextVoice += lerp(1.3, 0.14, p);
        }
        await sc.wait(0.05);
      }
      // everything becomes silent
      voices.forEach((v) => v.stop());
      A.static(0);
      A.silence(3);
      clearSubtitles();
      sc.grid.black = true;
      sc.fadeV = 1;
      await sc.wait(1.8);
      return 'done';
    });
  }

  /* ================================================================
   * CUTSCENE — mode 'cutscene': play(steps, opts)
   * ================================================================ */
  function play(steps, opts) {
    opts = Object.assign({}, opts || {});
    return runScene('cutscene', Object.assign({ kind: opts.kind || 'cutscene' }, opts), (sc) => {
      sc.canvas = sceneCanvas(sc, 'sc-img');
      // textOver: the words sit ABOVE the fade layer, so a fade can dim the picture under them
      sc.textBox = U.el('div', { class: 'sc-text' + (opts.textOver ? ' sc-text-over' : '') });
      sc.el.appendChild(sc.textBox);
      fadeLayer(sc, '#000', opts.fadeIn ? 1 : 0);
      sc.image = null;
      sc.voices = [];
      sc.onUpdate = (dt) => { if (sc.image && sc.image.update) sc.image.update(dt); };
      sc.onRender = () => {
        if (sc.image) sc.image.draw();
        else if (sc.imageDirty) { sc.canvas.getContext('2d').clearRect(0, 0, W, H); sc.imageDirty = false; }
      };
      sc.onKey = (e, down) => {
        if (e.code !== 'Escape') return false;
        if (down && opts.skippable && sc.t > 0.3) skipScene(sc);
        return true;
      };
      sc.onKill = () => { (sc.voices || []).forEach((v) => v.stop()); };
    }, async (sc) => {
      if (typeof opts.fadeIn === 'number') sc.fadeTo(0, opts.fadeIn);
      for (const st of steps || []) {
        sc.check();
        if (st) await runStep(sc, st);
      }
      return 'done';
    });
  }
  function setImage(sc, name, st) {
    if (sc.image && sc.image.dispose) sc.image.dispose();
    sc.image = null;
    sc.imageDirty = true;
    if (!name) return;
    const f = IMAGES[name];
    if (!f) { console.warn('[scenes] unknown image', name); return; }
    try { sc.image = f(sc, st); } catch (e) { console.error('[scenes] image ' + name, e); }
  }
  /** One cutscene step. Non-blocking parts first, then the blocking one (fade|voice|text|wait|fn). */
  async function runStep(sc, st) {
    if ('image' in st) setImage(sc, st.image, st);
    if (st.sfx) { const s = typeof st.sfx === 'string' ? { name: st.sfx } : st.sfx; A.play(s.name, s); }
    if (st.static != null) A.static(st.static);
    if (st.ambience) A.ambience(st.ambience);
    if (st.silence != null) A.silence(st.silence);
    if (st.stinger) A.stinger(st.stinger);
    if (st.clear) await clearText(sc, st.clear === true ? 0.6 : st.clear);
    if (st.fade) {
      const f = st.fade;
      if (f.color && sc.fadeEl) sc.fadeEl.style.background = f.color;
      await sc.fadeTo(f.to != null ? f.to : 1, f.secs != null ? f.secs : 1);
    }
    if (st.voice) await voiceStep(sc, st.voice, st);
    else if (st.text != null) await textStep(sc, st);
    if (st.wait != null) await sc.wait(st.wait);
    if (typeof st.fn === 'function') await sc.do(st.fn(sc));
  }
  const TEXT_FADE = { card: 1.2, caption: 0.8, center: 0.9, type: 0.3, small: 0.7 };
  function textEl(sc, style, label) {
    const el = U.el('div', { class: 'sc-t sc-t-' + style });
    if (label) el.appendChild(U.el('div', { class: 'sc-t-label', text: fmt(label) }));
    const body = U.el('div', { class: 'sc-t-body' });
    el.appendChild(body);
    el.style.opacity = '0';
    sc.textBox.appendChild(el);
    return { el, body };
  }
  /** Typewriter: characters appear on the scene clock; punctuation lingers. */
  async function typeInto(sc, body, text, cps) {
    // the untyped remainder stays in the layout (invisible) so centred lines do not drift
    const span = U.el('span'), cur = U.el('span', { class: 'sc-cursor', text: '\u2588' }), rest = U.el('span', { class: 'sc-type-rest', text });
    body.append(span, cur, rest);
    for (let i = 0; i < text.length; i++) {
      span.textContent = text.slice(0, i + 1);
      rest.textContent = text.slice(i + 1);
      const ch = text[i];
      await sc.wait(/[.,?!—]/.test(ch) ? 3.5 / cps : 1 / cps);
    }
    cur.classList.add('sc-cursor-idle');
    return cur;
  }
  async function textStep(sc, st) {
    const style = st.style || 'center', text = fmt(st.text);
    const fin = TEXT_FADE[style] || 0.8;
    const dur = st.dur != null ? st.dur : style === 'card' ? Math.max(4, U.lineDur(text) + 2) : U.lineDur(text) + 1.6;
    const { el, body } = textEl(sc, style, st.label);
    const t0 = sc.t;
    sc.opacity(el, 1, fin);
    if (style === 'type') await typeInto(sc, body, text, st.cps || 24);
    else body.textContent = text;
    if (st.keep) { await sc.wait(Math.max(0, dur - (sc.t - t0))); return; }
    await sc.wait(Math.max(0, dur - (sc.t - t0) - fin));
    await sc.opacity(el, 0, fin);
    el.remove();
  }
  async function voiceStep(sc, v, st) {
    const text = fmt(v.text != null ? v.text : v.t), spk = v.speaker || v.s || 'unknown';
    const h = A.voice(text, spk, { radio: !!v.radio, clarity: v.clarity != null ? v.clarity : 0.9, vol: v.vol, phone: v.phone });
    sc.voices.push(h);
    const style = v.style || st.style;
    const gap = v.gap != null ? v.gap : st.gap != null ? st.gap : 0.4;
    if (style) {
      const label = v.label !== undefined ? v.label : style === 'type' ? speakerName(spk) : null;
      const { el, body } = textEl(sc, style, label);
      const kept = Array.from(sc.textBox.children).filter((x) => x !== el && !x.dataset.leaving);
      for (const old of kept.slice(0, Math.max(0, kept.length - (v.maxLines || st.maxLines || 4) + 1))) {
        old.dataset.leaving = '1';
        sc.opacity(old, 0, 0.5).then(() => old.remove(), () => {});
      }
      sc.opacity(el, 1, TEXT_FADE[style] || 0.6);
      const t0 = sc.t;
      if (style === 'type') await typeInto(sc, body, text, Math.max(14, text.length / Math.max(0.6, h.dur * 0.85)));
      else body.textContent = text;
      if (!v.nowait && !st.nowait) await sc.wait(Math.max(0, h.dur - (sc.t - t0)) + gap);
      if (!v.keep && !st.keep) sc.opacity(el, 0, 0.8).then(() => el.remove(), () => {});
      return;
    }
    subtitle(text, { speaker: spk, kind: v.radio ? 'radio' : v.phone ? 'phone' : 'speech', dur: h.dur + 0.3, clarity: v.clarity });
    if (!v.nowait && !st.nowait) await sc.wait(h.dur + gap);
  }
  async function clearText(sc, secs) {
    const els = Array.from(sc.textBox.children);
    await Promise.all(els.map((el) => sc.opacity(el, 0, secs)));
    els.forEach((el) => el.remove());
  }

  /* ================================================================
   * DEATH — mode 'death': static → "Station Fourteen?" → a new operator answers → LOAD ARCHIVE
   * ================================================================ */
  const DEATH_DEFAULT = [
    { s: 'you', t: 'Station Fourteen? Is anybody there?' },
    { s: 'new_operator', t: 'This is Station Fourteen. Go ahead.' },
  ];
  function deathContent() {
    const c = content('death');
    let lines = [], archived = 'TRANSMISSION ARCHIVED', button = 'LOAD ARCHIVE';
    if (Array.isArray(c)) lines = linesOf(c, 'you');
    else if (c && typeof c === 'object') {
      if (Array.isArray(c.lines)) lines = linesOf(c.lines, 'you');
      else lines = [lineOf(c.call, c.callSpeaker || 'you'), lineOf(c.answer, c.answerSpeaker || 'new_operator')].filter(Boolean);
      if (c.archived) archived = String(c.archived);
      if (c.button || c.load) button = String(c.button || c.load);
    }
    if (lines.length < 2) lines = DEATH_DEFAULT;
    return { lines, archived, button };
  }
  function death(info) {
    let rec = null;
    // PLAN §4 "Death": the director calls DA.recordDeath({room, map, lines}) and then DA.scenes.death().
    // Reuse a record made in the last few seconds instead of writing the same death twice.
    const deaths = (DA.meta && DA.meta.deaths) || [];
    const last = deaths[deaths.length - 1];
    if (last && Date.now() - (last.at || 0) < 5000) {
      rec = last;
      if (info) for (const k in info) if (last[k] == null) last[k] = info[k];
    } else {
      try { rec = DA.recordDeath ? DA.recordDeath(info || {}) : null; } catch (e) { console.error('[scenes] recordDeath', e); }
    }
    const stamp = (rec && rec.stamp) || (DA.clock ? DA.clock.stamp() : '');
    const dc = deathContent();
    return runScene('death', { kind: 'death', block: true }, (sc) => {
      sc.canvas = sceneCanvas(sc);
      sc.fx = staticFx(sc.canvas);
      sc.fx.level = 1.2; sc.fx.bar = 1;
      sc.voices = [];
      const box = U.el('div', { class: 'sc-death-box' });
      sc.linesEl = U.el('div', { class: 'sc-death-lines' });
      sc.stampEl = U.el('div', { class: 'sc-death-stamp' });
      sc.entryEl = U.el('div', { class: 'sc-death-entry' });
      sc.btn = U.el('button', { class: 'da-btn sc-death-btn', type: 'button', text: dc.button });
      sc.btn.disabled = true;
      sc.btn.addEventListener('click', () => loadArchive(sc));
      for (const el of [sc.stampEl, sc.entryEl, sc.btn]) el.style.opacity = '0';
      box.append(sc.linesEl, sc.stampEl, sc.entryEl, sc.btn);
      sc.el.appendChild(box);
      fadeLayer(sc, '#000', 0);
      sc.onUpdate = (dt) => sc.fx.update(dt);
      sc.onRender = () => sc.fx.draw();
      sc.onKey = (e, down) => {
        if (down && sc.ready && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE' || e.code === 'NumpadEnter')) loadArchive(sc);
        return true; // the dead do not pause
      };
      sc.onKill = () => { A.static(0); sc.voices.forEach((v) => v.stop()); };
    }, async (sc) => {
      if (DA.input && DA.input.exitLock) DA.input.exitLock();
      clearSubtitles();
      A.ambience({ rain: 0, hum: 0, generator: 'off', wind: 0, thunder: 0, drone: 0, heartbeat: 0, birds: false });
      A.play('static_burst', { vol: 1 });
      A.static(0.95, { vol: 1 });
      await sc.wait(1.5);
      sc.tween(sc.fx, 'level', 0.2, 2.2);
      sc.tween(sc.fx, 'bar', 0.3, 2.2);
      A.static(0.4, { vol: 0.8 });
      await sc.wait(1.9);
      for (let i = 0; i < dc.lines.length; i++) {
        const l = dc.lines[i], text = fmt(l.t);
        const row = U.el('div', { class: 'sc-death-line' + (i === 0 ? ' sc-death-call' : '') });
        sc.linesEl.appendChild(row);
        const v = A.voice(text, l.s || (i === 0 ? 'you' : 'new_operator'), { radio: true, clarity: i === 0 ? 0.6 : 0.92, vol: 0.9 });
        sc.voices.push(v);
        const t0 = sc.t;
        await typeInto(sc, row, '“' + text + '”', Math.max(12, (text.length + 2) / Math.max(0.8, v.dur * 0.9)));
        await sc.wait(Math.max(0, v.dur - (sc.t - t0)) + (i === 0 ? 1.8 : 1.1));
        if (i === 0) { A.play('static_burst', { vol: 0.35, radio: true }); sc.fx.level = 0.45; sc.tween(sc.fx, 'level', 0.2, 0.8); }
      }
      A.static(0.18, { vol: 0.6 });
      sc.stampEl.textContent = dc.archived + ' — ' + stamp;
      const n = (DA.meta && DA.meta.deaths && DA.meta.deaths.length) || 1;
      sc.entryEl.textContent = 'ENTRY ' + U.pad(n, 4);
      await sc.opacity(sc.stampEl, 1, 1.3);
      sc.opacity(sc.entryEl, 0.55, 1.3);
      await sc.wait(0.7);
      sc.btn.disabled = false;
      sc.ready = true;
      await sc.opacity(sc.btn, 1, 0.9);
      try { sc.btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      await sc.until(() => sc.chosen);
      return sc.result;
    });
  }
  function loadArchive(sc) {
    if (sc.chosen || !sc.ready) return;
    sc.chosen = true;
    sc.btn.disabled = true;
    A.play('tape_insert', { vol: 0.7 });
    A.static(0);
    sc.result = 'load';
    let ok = false;
    try { ok = DA.archive && DA.archive.loadLatest ? DA.archive.loadLatest() : false; } catch (e) { console.error('[scenes] loadLatest', e); }
    if (!ok) {
      sc.result = 'title';
      if (DA.modes.defs.title && DA.quitToTitle) DA.quitToTitle();
      else finish(sc, 'title');
    }
  }

  /* ================================================================
   * ENDINGS — mode 'ending' (black base layer under the tail scenes), credits, post-credits
   * ================================================================ */
  const ENDING_IDS = ['destroy', 'maintain', 'open', 'secret'];
  const ENDING_TITLES = { destroy: 'YOU ONLY DESTROYED YOURS', maintain: 'THE REPLACEMENT', open: 'OPEN THE CHANNEL', secret: 'WITHOUT OBSERVATION' };
  const endingTitle = (id) => { const e = content('endings.' + id); return String((e && e.title) || ENDING_TITLES[id] || id).toUpperCase(); };
  const SILENT_WORLD = { rain: 0, hum: 0, generator: 'off', wind: 0, thunder: 0, drone: 0, heartbeat: 0, birds: false };

  const TAILS = {
    async destroy(sc) {
      const e = content('endings.destroy') || {};
      A.ambience(SILENT_WORLD);
      await sc.do(play([{ wait: 1.2 }, { text: e.card || 'SEVERAL MONTHS LATER', style: 'card', dur: 4.6 }, { wait: 0.9 }], { kind: 'destroy_card' }));
      let caps = e.captions;
      if (!caps && Array.isArray(e.lines) && e.lines.length) {
        caps = [{ at: 2, text: 'COUNTY ROUTE 9', dur: 4 }];
        e.lines.forEach((t, i) => caps.push({ at: 7 + i * 4.4, text: t, dur: 4.1, style: 'line' }));
      }
      await sc.do(drive({ kind: 'months_later', radioLine: e.radio || 'You only destroyed yours.', radioSpeaker: e.radioSpeaker || e.speaker, captions: caps, time: e.time }));
      await sc.wait(2.4);
    },
    async maintain(sc) {
      let lines = linesOf(content('endings.maintain.realize'), null);
      if (!lines.length) lines = linesOf(content('dialogue.maintain_realize'), null);
      if (!lines.length) lines = ["That's exactly what the previous operator told you.", "Maybe he wasn't being dismissive.", 'Maybe he was desperately trying to stop you.'].map((t) => ({ t }));
      A.ambience({ rain: 0.08, hum: 0, generator: 'off', wind: 0.1, thunder: 0, drone: 0, heartbeat: 0, birds: true, daylight: true });
      const total = lines.reduce((s, l) => s + U.lineDur(l.t) + 2.4, 0) + 3;
      // dawn light comes up, then dims under the lines (down to 55 % first, so the thesis line is
      // never grey type on grey road) and fades out slowly while they play
      const steps = [{ image: 'dawn' }, { fade: { to: 0, secs: 3 } }, { wait: 0.8 }, { fade: { to: 0.55, secs: 1.8 } },
        { fn: (c) => { c.fadeTo(0.9, total); } }];
      for (const l of lines) steps.push({ text: l.t, style: 'center', dur: U.lineDur(l.t) + 2.4 });
      // to black; the closing lines are typed on the black image with the fade layer lifted
      steps.push({ wait: 1.2 }, { fade: { to: 1, secs: 2.2 } }, { image: 'black' }, { fade: { to: 0, secs: 0.05 } }, { wait: 1.2 });
      for (const t of [].concat(content('endings.maintain.lines') || [])) steps.push({ text: t, style: 'center', dur: U.lineDur(t) + 2 });
      steps.push({ wait: 1 });
      await sc.do(play(steps, { kind: 'maintain', fadeIn: true, textOver: true }));
    },
    async open(sc) {
      await sc.do(play([
        { image: 'static', static: 0.2, fn: (c) => { c.image.level = 0.15; c.tween(c.image, 'level', 1.25, 4.6).catch(() => {}); } },
        { fn: async (c) => { for (let i = 0; i <= 46; i++) { A.static(0.15 + i * 0.019, { vol: 0.6 + i * 0.009 }); await c.wait(0.1); } } },
        { image: 'black', static: 0, silence: 3 },
        { wait: 2.8 },
      ], { kind: 'open_tail' }));
    },
    async secret(sc) {
      const e = content('endings.secret') || {};
      let caps = e.captions;
      if (!caps && Array.isArray(e.lines) && e.lines.length) {
        caps = normCaptions(content('drive.dawn.captions'), 'dawn') || [];
        e.lines.forEach((t, i) => caps.push({ at: 7 + i * 4.4, text: t, dur: 4.1, style: 'line' }));
      }
      await sc.do(drive({ kind: 'dawn', captions: caps }));
      await sc.wait(1.2);
    },
  };

  function ending(id) {
    id = ENDING_IDS.includes(id) ? id : String(id || 'destroy');
    try { if (DA.recordEnding) DA.recordEnding(id); } catch (e) { console.error('[scenes] recordEnding', e); }
    endingDepth++;
    let released = false;
    const release = () => { if (!released) { released = true; endingDepth--; } };
    return runScene('ending', { kind: id, block: true }, (sc) => {
      sc.onKey = (e) => e.code === 'Escape';
      sc.onKill = release;
    }, async (sc) => {
      if (DA.input && DA.input.exitLock) DA.input.exitLock();
      clearSubtitles();
      if (TAILS[id]) await TAILS[id](sc);
      await sc.do(credits({ ending: id }));
      if (id === 'secret') await sc.do(postCredits());
      return 'done';
    }).then((r) => {
      release();
      if (r !== 'aborted' && DA.quitToTitle) {
        if (DA.modes.defs.title) DA.quitToTitle();
        else { DA.resetRuntime(); DA.modes.clear(); DA.running = false; DA.bus.emit('game:quit'); }
      }
      return r;
    });
  }

  /** The researchers' tape after the secret ending's credits. */
  function postCredits(lines) {
    let raw = lines || content('endings.post_secret');
    if (raw && !Array.isArray(raw) && Array.isArray(raw.lines)) raw = raw.lines;
    if (!Array.isArray(raw) || !raw.length) {
      raw = [{ s: 'researcher_a', t: 'Subject demonstrated zero interaction.' }, { s: 'researcher_b', t: "So that's it?" },
        { s: 'researcher_a', t: 'Yes.' }, { wait: 2.4 }, { s: 'researcher_a', t: 'Without observation, there was no event.' }];
    }
    const hasSfx = raw.some((r) => r && r.sfx);
    const steps = [{ image: 'tape', static: 0.05 }];
    if (!hasSfx) steps.push({ sfx: 'tape_play' }, { wait: 1.8 });
    for (const r of raw) {
      if (!r) continue;
      const l = r.t != null || r.text != null ? lineOf(r, 'researcher_a') : null;
      if (l) {
        steps.push({ voice: { speaker: l.s, text: l.t, radio: true, clarity: 0.85, style: 'type', label: speakerName(l.s), keep: true, gap: l.gap != null ? l.gap : 0.9 } });
        continue;
      }
      const d = r.d != null ? r.d : r.wait != null ? r.wait : r.pause != null ? r.pause : 1;
      if (r.sfx) steps.push({ sfx: r.sfx, static: r.sfx === 'tape_stop' ? 0 : undefined });
      if (r.cap) steps.push({ text: r.cap, style: 'small', dur: Math.max(1.2, d), keep: false });
      else steps.push({ wait: d });
    }
    if (!hasSfx) steps.push({ wait: 2.4 }, { sfx: 'tape_stop', static: 0 });
    steps.push({ wait: 1.2 }, { clear: 0.4, image: 'black' }, { static: 0 }, { wait: 2.2 });
    return play(steps, { kind: 'post_secret', fadeIn: 1.4, block: true });
  }

  const DEFAULT_CREDITS = [
    { h: 'FROM THE DESIGN DOCUMENT', lines: ['DEAD AIR', 'a psychological horror game about an emergency radio relay station'] },
    { h: 'THE NIGHT SHIFT', lines: ['THE OPERATOR — {NAME}', 'HOLLIS — the previous operator', 'THE VOICE ON 148.32 — unidentified'] },
    { h: 'MADE FOR THE BROWSER', lines: ['every pixel, voice and raindrop generated at run time', 'no samples · no textures · no libraries'] },
    { h: 'RELAY STATION 14', lines: ['commissioned 1978'] },
    { h: '', lines: ['Thank you for listening.'] },
  ];
  /** Split plain credit lines into sections at blank lines (a leading 'DEAD AIR' is the title). */
  function sectionsFromLines(ls) {
    const out = [];
    let cur = null;
    ls.forEach((raw, i) => {
      const l = String(raw).trim();
      if (!l) { cur = null; return; }
      if (i < 2 && l.toUpperCase() === 'DEAD AIR') return;
      if (!cur) out.push((cur = { h: '', lines: [] }));
      cur.lines.push(l);
    });
    return out.length ? out : DEFAULT_CREDITS;
  }
  function creditSections() {
    let c = content('endings.credits');
    if (!c) return DEFAULT_CREDITS;
    if (!Array.isArray(c) && typeof c === 'object') {
      if (Array.isArray(c.lines)) return sectionsFromLines(c.lines);
      if (Array.isArray(c.sections)) c = c.sections;
      else if (typeof c.text === 'string') return sectionsFromLines(c.text.split('\n'));
    }
    if (typeof c === 'string') return c.split(/\n\s*\n/).map((b) => { const ls = b.split('\n').map((x) => x.trim()).filter(Boolean); return { h: ls[0] === ls[0].toUpperCase() && ls.length > 1 ? ls.shift() : '', lines: ls }; });
    if (Array.isArray(c)) {
      const out = [];
      for (const it of c) {
        if (typeof it === 'string') { if (!out.length || out[out.length - 1].h != null && out[out.length - 1].fixed) out.push({ h: '', lines: [] }); out[out.length - 1].lines.push(it); }
        else if (it && typeof it === 'object') out.push({ h: it.h || it.title || it.role || it.head || '', lines: [].concat(it.lines || it.names || it.text || it.name || []), fixed: true });
      }
      return out.length ? out : DEFAULT_CREDITS;
    }
    return DEFAULT_CREDITS;
  }
  /** Slow credits roll. opts: {ending}. Esc skips after 3 s. */
  function credits(opts) {
    opts = opts || {};
    return runScene('credits', { kind: 'credits', block: true }, (sc) => {
      sc.canvas = sceneCanvas(sc, 'sc-credits-bg');
      sc.fx = staticFx(sc.canvas);
      sc.fx.level = 0.07; sc.fx.bar = 0.2;
      sc.fxAcc = 0;
      const roll = (sc.roll = U.el('div', { class: 'sc-roll' }));
      roll.appendChild(U.el('div', { class: 'sc-roll-title', text: 'DEAD AIR' }));
      if (opts.ending) {
        const en = content('endings.' + opts.ending) || {};
        roll.appendChild(U.el('div', { class: 'sc-roll-label', text: String(en.sub || 'ENDING').toUpperCase() }));
        roll.appendChild(U.el('div', { class: 'sc-roll-ending', text: endingTitle(opts.ending) }));
      }
      for (const sec of creditSections()) {
        const b = U.el('div', { class: 'sc-roll-sec' });
        if (sec.h) b.appendChild(U.el('div', { class: 'sc-roll-h', text: fmt(sec.h) }));
        for (const l of sec.lines) b.appendChild(U.el('div', { class: 'sc-roll-line', text: fmt(l) }));
        roll.appendChild(b);
      }
      const found = U.el('div', { class: 'sc-roll-sec sc-roll-found' }, U.el('div', { class: 'sc-roll-h', text: 'ENDINGS FOUND' }));
      const got = (DA.meta && DA.meta.endings) || {};
      // the secret ending's slot stays hidden until it has been found (the title's pips do the same)
      const shown = ENDING_IDS.filter((id) => id !== 'secret' || !!got[id] || id === opts.ending);
      let count = 0;
      for (const id of shown) {
        const has = !!got[id] || id === opts.ending;
        if (has) count++;
        found.appendChild(U.el('div', { class: 'sc-roll-line' + (has ? '' : ' sc-roll-missing') + (id === opts.ending ? ' sc-roll-now' : ''), text: has ? endingTitle(id) : '— — — — —' }));
      }
      found.appendChild(U.el('div', { class: 'sc-roll-small', text: count + ' / ' + shown.length }));
      roll.appendChild(found);
      const deaths = (DA.meta && DA.meta.deaths && DA.meta.deaths.length) || 0, tl = (DA.meta && DA.meta.timelines) || 0;
      if (deaths || tl) {
        const st = U.el('div', { class: 'sc-roll-sec' });
        if (deaths) st.appendChild(U.el('div', { class: 'sc-roll-small', text: 'TRANSMISSIONS ARCHIVED — ' + deaths }));
        if (tl) st.appendChild(U.el('div', { class: 'sc-roll-small', text: 'TIMELINES STORED — ' + tl }));
        roll.appendChild(st);
      }
      sc.endEl = U.el('div', { class: 'sc-roll-end' }, U.el('div', { class: 'sc-roll-freq', text: '148.32' }), U.el('div', { class: 'sc-roll-small', text: 'RESERVED' }));
      roll.appendChild(sc.endEl);
      sc.hint = U.el('div', { class: 'sc-hint', text: 'ESC — SKIP' });
      sc.el.append(roll, sc.hint);
      fadeLayer(sc, '#000', 1);
      sc.y = 0;
      sc.speed = 0;
      sc.onUpdate = (dt) => {
        sc.fx.update(dt);
        sc.y += dt * sc.speed;
      };
      sc.onRender = () => {
        sc.fxAcc++;
        if (sc.fxAcc % 3 === 0) sc.fx.draw();
        const hPx = sc.el.clientHeight || 540;
        roll.style.transform = 'translateY(' + (hPx - sc.y).toFixed(1) + 'px)';
      };
      sc.onKey = (e, down) => {
        if (e.code !== 'Escape') return false;
        if (down && sc.t > 3) skipScene(sc);
        return true;
      };
    }, async (sc) => {
      sc.fadeTo(0, 1.6);
      sc.at(3, () => sc.opacity(sc.hint, 0.7, 0.8));
      sc.at(9, () => sc.opacity(sc.hint, 0, 1.2));
      const hPx = sc.el.clientHeight || 540;
      sc.speed = hPx / 13;                         // one screen every 13 s
      const stopAt = () => hPx / 2 + sc.endEl.offsetTop + sc.endEl.offsetHeight / 2;
      await sc.until(() => sc.y >= stopAt(), 240);
      sc.speed = 0;
      await sc.wait(3.5);
      await sc.fadeTo(1, 2);
      return 'done';
    });
  }

  /* ================================================================ public API + boot */
  function current() {
    const t = DA.modes && DA.modes.top();
    return t && live[t.name] && live[t.name].length ? t.name : null;
  }
  function skip() {
    const sc = topScene();
    if (sc && sc.opts && sc.opts.skippable) skipScene(sc);
  }
  Object.assign(S, { drive, play, multiverse, death, ending, credits, postCredits, current, skip, scene: topScene });

  DA.bus.on('boot', () => {
    for (const m of ['drive', 'cutscene', 'multiverse', 'death', 'ending', 'credits']) DA.modes.register(m, makeMode(m));
  });
})();
