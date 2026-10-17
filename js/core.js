/* DEAD AIR — core.js
 * Foundation shared by every module: namespace, utilities, event bus, persistent
 * state, game clock, pausable timers + script runner, input, mode stack, systems,
 * settings/meta/archives, and the main loop. Everything attaches to window.DA.
 * Contracts for every other module live in PLAN.md (§6).
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  DA.VERSION = '1.0.0';
  DA.debugMode = /[?&]debug\b/.test(location.search);

  /* ================================================================ util */
  const U = (DA.util = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, v) => {
    const t = U.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hash = (str) => {
    let h = 2166136261 >>> 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  /** Wrap radians into (-PI, PI]. */
  U.wrapAngle = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  /** Smallest absolute difference between two bearings in degrees, 0..180. */
  U.angleDiffDeg = (a, b) => {
    const d = (((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
  };
  U.pad = (n, w = 2) => String(Math.floor(Math.abs(n))).padStart(w, '0');
  /** Temporal offset display string. sec may be negative; null/NaN → dashes. */
  U.fmtOffset = (sec) => {
    if (sec == null || !isFinite(sec)) return '--:--:--';
    const sign = sec < 0 ? '-' : '+';
    let a = Math.round(Math.abs(sec));
    // up to a day and a half reads as a clock (+24:00:00 for the 02:13 call); beyond, in days
    if (a < 36 * 3600) {
      const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
      return `${sign}${U.pad(h)}:${U.pad(m)}:${U.pad(s)}`;
    }
    if (a < 365 * 86400) {
      const d = Math.floor(a / 86400);
      a %= 86400;
      const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
      return `${sign}${d}D ${U.pad(h)}:${U.pad(m)}:${U.pad(s)}`;
    }
    const y = Math.floor(a / (365 * 86400));
    a %= 365 * 86400;
    const d = Math.floor(a / 86400), h = Math.floor((a % 86400) / 3600);
    return `${sign}${y}Y ${U.pad(d, 3)}D ${U.pad(h)}H`;
  };
  /** Seconds a spoken line stays up / takes to "say" (shared by radio, ui, audio). */
  U.lineDur = (text) => {
    const str = String(text || '').trim();
    const words = str.split(/\s+/).filter(Boolean).length;
    // rough syllable count (vowel groups per word, at least one) so long words don't gabble;
    // never shorter than the original word-based timing, so no existing cue gets squeezed
    let syl = 0;
    for (const w of str.toLowerCase().split(/[^a-z0-9']+/)) {
      if (!w) continue;
      if (/^\d+$/.test(w)) { syl += w.length; continue; } // digits are read one by one
      const g = w.replace(/e$/, '').match(/[aeiouy]+/g);
      syl += Math.max(1, g ? g.length : 1);
    }
    return Math.max(1.4, 0.6 + words * 0.32, 0.45 + syl * 0.19 + words * 0.05);
  };
  /**
   * Degrade text by signal clarity (1 = clean, 0 = pure static). Stable per (text, seed) so
   * garbling does not shimmer every frame; pass a changing seed for a live "crackle".
   */
  U.garble = (text, clarity, seed = 0) => {
    text = String(text || '');
    if (clarity >= 0.97) return text;
    const rnd = U.mulberry32((U.hash(text) ^ (seed * 2654435761)) >>> 0);
    const lose = U.clamp(1 - clarity, 0, 1);
    let out = '';
    for (const ch of text) {
      if (ch === ' ') { out += rnd() < lose * 0.25 ? ' ' : ' '; continue; }
      const r = rnd();
      if (r < lose * 0.55) out += '·';          // dropped syllable
      else if (r < lose * 0.8) out += '▒';      // crackle block
      else out += ch;
    }
    return out;
  };
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Tiny DOM helper: U.el('div', {class:'x', text:'hi', onclick: fn, style:{...}}, child, ...) */
  U.el = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else e.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return e;
  };

  /* ================================================================= bus */
  const listeners = new Map();
  DA.bus = {
    /** Subscribe. opts.session → auto-removed on DA.resetRuntime(). Returns unsubscribe fn. */
    on(name, fn, opts) {
      let arr = listeners.get(name);
      if (!arr) listeners.set(name, (arr = []));
      arr.push({ fn, session: !!(opts && opts.session), once: !!(opts && opts.once) });
      return () => DA.bus.off(name, fn);
    },
    once(name, fn, opts) {
      return DA.bus.on(name, fn, Object.assign({}, opts, { once: true }));
    },
    off(name, fn) {
      const arr = listeners.get(name);
      if (!arr) return;
      const i = arr.findIndex((r) => r.fn === fn);
      if (i >= 0) arr.splice(i, 1);
    },
    emit(name, data) {
      const arr = listeners.get(name);
      if (!arr || !arr.length) return;
      for (const rec of arr.slice()) {
        if (rec.once) DA.bus.off(name, rec.fn);
        try {
          rec.fn(data, name);
        } catch (e) {
          console.error('[bus:' + name + ']', e);
        }
      }
    },
    clearSession() {
      for (const [k, arr] of listeners) listeners.set(k, arr.filter((r) => !r.session));
    },
  };

  /* =============================================================== state */
  /** Game time = minutes since 00:00 UTC, 26 OCT 1999 (float). */
  DA.START_UTC = Date.UTC(1999, 9, 26, 0, 0, 0);
  DA.newState = () => ({
    v: 1,
    started: false,
    night: Date.now().toString(36) + '-' + ((Math.random() * 1e9) | 0).toString(36), // this night's id; archives remember it
    playerName: 'OPERATOR',
    act: 0,
    flags: {},
    vars: { interference: 0, instability: 0, saved: 0, txCount: 0, logged: 0 },
    clock: { min: 23 * 60 + 31, rate: 0.2, frozen: false },
    sunrise: 24 * 60 + 6 * 60 + 42, // 06:42 on 27 OCT 1999
    inventory: [],
    objectives: [], // [{id, text, done, glitch}]
    notes: [],
    tapes: [],
    docs: [],
    seed: (Math.random() * 2147483647) | 0,
    // module-owned sub-states (plain JSON only):
    world: {},
    radio: {},
    entity: {},
    cctv: {},
    director: {},
    ui: {},
    stats: { playSec: 0, loads: 0, archives: 0 },
  });
  DA.state = DA.newState();
  DA.running = false; // true once a game (new or loaded) is in progress

  DA.flag = (k) => DA.state.flags[k];
  DA.setFlag = (k, v = true) => {
    const old = DA.state.flags[k];
    DA.state.flags[k] = v;
    if (old !== v) DA.bus.emit('flag', { key: k, value: v, old });
  };
  DA.v = (k) => DA.state.vars[k] || 0;
  DA.addVar = (k, n = 1) => {
    DA.state.vars[k] = (DA.state.vars[k] || 0) + n;
    DA.bus.emit('var', { key: k, value: DA.state.vars[k] });
    return DA.state.vars[k];
  };
  DA.hasItem = (id) => DA.state.inventory.includes(id);
  DA.giveItem = (id) => {
    if (!DA.hasItem(id)) {
      DA.state.inventory.push(id);
      DA.bus.emit('item:add', { id });
    }
  };
  DA.takeItem = (id) => {
    const i = DA.state.inventory.indexOf(id);
    if (i >= 0) {
      DA.state.inventory.splice(i, 1);
      DA.bus.emit('item:remove', { id });
    }
  };
  /** Effects object used by content: {set:{flag:val}, add:{var:n}, emit:'evt'|['a',{name,data}], interfere:true|'reason'} */
  DA.applyFx = (fx) => {
    if (!fx) return;
    if (fx.set) for (const k in fx.set) DA.setFlag(k, fx.set[k]);
    if (fx.add) for (const k in fx.add) DA.addVar(k, fx.add[k]);
    if (fx.interfere) DA.interfere(typeof fx.interfere === 'string' ? fx.interfere : 'fx');
    if (fx.emit) [].concat(fx.emit).forEach((e) => (typeof e === 'string' ? DA.bus.emit(e) : DA.bus.emit(e.name, e.data)));
  };
  /**
   * The single entry point for "the player acted on a future transmission".
   * Everything that breaks the secret ending goes through here.
   */
  DA.interfere = (reason, amount = 1) => {
    const n = DA.addVar('interference', 1);
    DA.addVar('instability', amount);
    if (!DA.flag('first_interference')) DA.setFlag('first_interference', reason || 'unknown');
    DA.bus.emit('interference', { reason, count: n });
  };
  /** Secret-ending eligibility (README "Secret ending"). */
  DA.isPure = () => DA.v('interference') === 0 && !DA.flag('records_opened') && !DA.flag('followed_future');
  /** Stable pseudo-random 0..1 per key for this load (archive loads reseed → tiny differences). */
  DA.variant = (key) => U.mulberry32((DA.state.seed ^ U.hash(key)) >>> 0)();
  /** Text templating: {NAME} {NAME_UP} {TIME} {DATE} {STAMP} + any key of extra. */
  DA.fmt = (text, extra) => {
    if (text == null) return '';
    return String(text).replace(/\{([A-Z0-9_+-]+)\}/g, (m, key) => {
      if (extra && key in extra) return extra[key];
      switch (key) {
        case 'NAME': return DA.state.playerName;
        case 'NAME_UP': return String(DA.state.playerName).toUpperCase();
        case 'TIME': return DA.clock.hhmm();
        case 'DATE': return DA.clock.date();
        case 'STAMP': return DA.clock.stamp();
        default: return m;
      }
    });
  };

  /* =============================================================== clock */
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const scheduled = []; // {min, fn, id}
  const holds = {};
  let lastWholeMinute = -1;
  DA.clock = {
    MON,
    get min() { return DA.state.clock.min; },
    set min(v) { DA.state.clock.min = v; },
    /** game minutes per real second */
    get rate() { return DA.state.clock.rate; },
    set rate(v) { DA.state.clock.rate = v; },
    get frozen() { return !!DA.state.clock.frozen; },
    set frozen(v) { DA.state.clock.frozen = !!v; },
    /** The clock will not advance past `min` while this hold exists (runtime only). */
    hold(id, min) { holds[id] = min; },
    release(id) { delete holds[id]; },
    ceiling() {
      let c = Infinity;
      for (const k in holds) c = Math.min(c, holds[k]);
      return c;
    },
    /** Run fn once when the clock reaches `min` (runtime only — re-register after load). */
    at(min, fn, id) {
      scheduled.push({ min, fn, id });
    },
    cancel(id) {
      for (let i = scheduled.length - 1; i >= 0; i--) if (scheduled[i].id === id) scheduled.splice(i, 1);
    },
    /** Minutes value for a calendar moment: toMin(27, 2, 13) → 02:13 on 27 OCT 1999. */
    toMin(day, h, m = 0) { return (day - 26) * 1440 + h * 60 + m; },
    parts(min = DA.clock.min) {
      const d = new Date(DA.START_UTC + Math.floor(min * 60) * 1000);
      return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), mon: MON[d.getUTCMonth()], d: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() };
    },
    hhmm(min = DA.clock.min) {
      const p = DA.clock.parts(min);
      return `${U.pad(p.h)}:${U.pad(p.m)}`;
    },
    hhmmss(min = DA.clock.min) {
      const p = DA.clock.parts(min);
      return `${U.pad(p.h)}:${U.pad(p.m)}:${U.pad(p.s)}`;
    },
    /** '27 OCT 1999' */
    date(min = DA.clock.min) {
      const p = DA.clock.parts(min);
      return `${U.pad(p.d)} ${p.mon} ${p.y}`;
    },
    /** '28 OCT 1999 – 02:13' (README log format) */
    stamp(min = DA.clock.min) {
      return `${DA.clock.date(min)} – ${DA.clock.hhmm(min)}`;
    },
    update(dt) {
      const c = DA.state.clock;
      if (!c.frozen) {
        let next = c.min + dt * c.rate;
        const ceil = DA.clock.ceiling();
        if (next > ceil) next = Math.max(c.min, ceil);
        c.min = next;
      }
      if (scheduled.length) {
        for (let i = scheduled.length - 1; i >= 0; i--) {
          const s = scheduled[i];
          if (s.min <= c.min) {
            scheduled.splice(i, 1);
            try { s.fn(); } catch (e) { console.error('[clock.at]', e); }
          }
        }
      }
      const whole = Math.floor(c.min);
      if (whole !== lastWholeMinute) {
        lastWholeMinute = whole;
        DA.bus.emit('clock:minute', whole);
      }
    },
    clearRuntime() {
      scheduled.length = 0;
      for (const k in holds) delete holds[k];
      lastWholeMinute = -1;
    },
  };

  /* ============================================== timers / waits / scripts */
  let timerId = 0;
  const timers = [];
  DA.timers = {
    /** Real-time (pausable) timers. They are wiped on DA.resetRuntime(). */
    after(sec, fn, tag) {
      const t = { id: ++timerId, t: sec, fn, tag, every: 0 };
      timers.push(t);
      return t.id;
    },
    every(sec, fn, tag) {
      const t = { id: ++timerId, t: sec, fn, tag, every: Math.max(0.01, sec) };
      timers.push(t);
      return t.id;
    },
    cancel(id) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    cancelTag(tag) {
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].tag === tag) timers.splice(i, 1);
    },
    update(dt) {
      if (!timers.length) return;
      for (const t of timers.slice()) {
        const idx = timers.indexOf(t);
        if (idx < 0) continue;
        t.t -= dt;
        if (t.t <= 0) {
          if (t.every) t.t += t.every;
          else timers.splice(idx, 1);
          try { t.fn(); } catch (e) { console.error('[timer]', e); }
        }
      }
    },
    clear() { timers.length = 0; },
    get count() { return timers.length; },
  };
  const waiters = [];
  DA.wait = (sec) => new Promise((res) => DA.timers.after(sec, () => res(true)));
  /** Resolves true when pred() is truthy (polled every simulated frame), false on timeout. */
  DA.waitFor = (pred, timeout) =>
    new Promise((res) => {
      let ok = false;
      try { ok = !!pred(); } catch (e) { console.error(e); }
      if (ok) return res(true);
      waiters.push({ pred, res, t: 0, timeout: timeout || 0 });
    });
  function updateWaiters(dt) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (!w) continue;
      w.t += dt;
      let ok = false;
      try { ok = !!w.pred(); } catch (e) { console.error('[waitFor]', e); }
      if (ok) { waiters.splice(waiters.indexOf(w), 1); w.res(true); }
      else if (w.timeout && w.t >= w.timeout) { waiters.splice(waiters.indexOf(w), 1); w.res(false); }
    }
  }
  /** Resolves with event data (or true if data is undefined) — null on timeout. */
  DA.waitEvent = (name, filter, timeout) =>
    new Promise((res) => {
      let tid = null;
      const off = DA.bus.on(
        name,
        (d) => {
          if (filter && !filter(d)) return;
          off();
          if (tid) DA.timers.cancel(tid);
          res(d === undefined ? true : d);
        },
        { session: true }
      );
      if (timeout) tid = DA.timers.after(timeout, () => { off(); res(null); });
    });

  class Cancelled extends Error {}
  DA.Cancelled = Cancelled;
  /**
   * Run an async story script that dies quietly if the session resets (death / load / new game).
   *   DA.script(async (s) => { await s.wait(2); await s.until(() => DA.flag('x')); const c = await s.do(DA.ui.choice(...)); }, 'name')
   */
  DA.script = (fn, name) => {
    const session = DA.session;
    const chk = (v) => {
      if (DA.session !== session) throw new Cancelled();
      return v;
    };
    const ctx = {
      session,
      name,
      alive: () => DA.session === session,
      check: () => chk(),
      wait: (sec) => DA.wait(sec).then(chk),
      until: (pred, timeout) => DA.waitFor(pred, timeout).then(chk),
      event: (evt, filter, timeout) => DA.waitEvent(evt, filter, timeout).then(chk),
      do: (p) => Promise.resolve(p).then(chk),
    };
    return Promise.resolve()
      .then(() => fn(ctx))
      .catch((e) => {
        if (!(e instanceof Cancelled)) console.error('[script ' + (name || '?') + ']', e);
      });
  };

  DA.session = 0;
  /** Wipes all runtime scheduling: timers, waiters, clock.at/holds, session bus listeners. */
  DA.resetRuntime = () => {
    DA.session++;
    DA.timers.clear();
    waiters.length = 0;
    DA.clock.clearRuntime();
    DA.bus.clearSession();
    DA.bus.emit('runtime:reset', { session: DA.session });
  };

  /* =============================================================== input */
  const I = (DA.input = {
    keys: {},
    hit: {},
    mouse: { dx: 0, dy: 0, x: 0, y: 0, down: false },
    locked: false,
    lockTarget: null,
  });
  I.down = (code) => !!I.keys[code];
  I.pressed = (code) => !!I.hit[code];
  /** Largest look delta applied in one frame — only a runaway guard (raw high-DPI flicks are big). */
  const MAX_FRAME_DELTA = 3000;
  I.consumeMouse = () => {
    const r = {
      dx: U.clamp(I.mouse.dx, -MAX_FRAME_DELTA, MAX_FRAME_DELTA),
      dy: U.clamp(I.mouse.dy, -MAX_FRAME_DELTA, MAX_FRAME_DELTA),
    };
    I.mouse.dx = I.mouse.dy = 0;
    return r;
  };
  /*
   * Mouse-look sanitising. Under pointer lock Chrome (notably on Windows, and more with OS
   * acceleration) occasionally reports a single bogus movementX/Y of hundreds of pixels, and the
   * first events after a lock is granted can carry the jump to the lock position. Either one
   * whips the view round 180° in a frame. So: ask for raw (unaccelerated) movement where
   * supported, ignore the first moments after locking, and treat an event that is far larger
   * than recent motion as *suspect*: hold it for one event and keep it only if the next event
   * carries on in the same direction (a real flick). A lone spike — followed by nothing, by
   * small motion, or by a reversal — is dropped.
   */
  const LOOK = { speed: 0, last: 0, gapAvg: 16, ignoreUntil: 0, rawOK: true, pend: null };
  const SPIKE_MIN = 120;   // counts in one event before it can be suspect at all
  const SPIKE_RATIO = 8;   // …and more than this multiple of what the recent pace would carry
  const SPEED_HALF_MS = 300; // recent speed halves every 300 ms of stillness (a still mouse re-arms)
  function takeLook(dx, dy) {
    I.mouse.dx += dx;
    I.mouse.dy += dy;
  }
  /*
   * Suspicion is judged on SPEED, not raw size: Chrome coalesces mousemove to one event per
   * frame, so at 15 fps (or after a main-thread hitch) a genuine turn arrives as big events far
   * apart. An event is suspect only if it is bigger than SPIKE_MIN and SPIKE_RATIO × what the
   * recent pace (peak-held, decaying with time) would carry over this event's gap. A suspect
   * event is held and kept only if the next event, arriving within an adaptive window, carries on
   * in the same direction; a lone spike — followed by nothing, small motion or a reversal — is
   * dropped.
   */
  function feedLook(dx, dy) {
    const now = performance.now();
    if (now < LOOK.ignoreUntil) return;
    const elapsed = LOOK.last ? Math.max(1, now - LOOK.last) : 1000;
    LOOK.last = now;
    LOOK.speed *= Math.pow(0.5, elapsed / SPEED_HALF_MS);
    // after real stillness the first event spans about one frame, not the whole pause; a short
    // gap (a main-thread hitch) legitimately carries the motion of the whole gap
    const gap = elapsed > 250 ? 16 : elapsed;
    LOOK.gapAvg = LOOK.gapAvg * 0.8 + Math.min(elapsed, 120) * 0.2;
    const held = LOOK.pend;
    if (held) {
      LOOK.pend = null;
      const onX = Math.abs(held.dx) >= Math.abs(held.dy);
      const hv = onX ? held.dx : held.dy, v = onX ? dx : dy;
      const continues = Math.sign(v) === Math.sign(hv) && Math.abs(v) >= Math.abs(hv) * 0.15;
      // mousemove is coalesced per animation frame: allow a couple of frames even at low fps
      const followMs = Math.max(120, (DA.dt || 0) * 2500, LOOK.gapAvg * 1.6);
      if (continues && now - held.t < followMs) {
        takeLook(held.dx, held.dy);
        LOOK.speed = Math.max(LOOK.speed, held.mag / held.gap);
      }
    }
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    if (mag > Math.max(SPIKE_MIN, LOOK.speed * gap * SPIKE_RATIO)) {
      LOOK.pend = { dx, dy, t: now, mag, gap };
      return;
    }
    takeLook(dx, dy);
    LOOK.speed = Math.max(LOOK.speed, mag / gap); // peak-hold: a flick's rising edge raises the bar at once
  }
  I.requestLock = () => {
    const el = I.lockTarget || document.body;
    if (document.pointerLockElement === el || !el.requestPointerLock) return;
    const plain = () => {
      try {
        const p = el.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* needs a user gesture; UI shows a hint instead */ }
    };
    if (!LOOK.rawOK) return plain();
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch((err) => {
          // Raw input unsupported on this platform → remember and fall back to a normal lock.
          if (err && err.name === 'NotSupportedError') { LOOK.rawOK = false; plain(); }
        });
      }
    } catch (e) {
      LOOK.rawOK = false;
      plain();
    }
  };
  I.exitLock = () => {
    if (document.pointerLockElement) {
      I.intentionalUnlock = true;
      document.exitPointerLock();
    }
  };
  I.endFrame = () => { I.hit = {}; };
  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
  function modeCall(fnName, ...args) {
    const t = DA.modes.top();
    if (t && t.def[fnName]) {
      try { return t.def[fnName](...args); } catch (e) { console.error('[mode ' + t.name + '.' + fnName + ']', e); }
    }
    return false;
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (modeCall('onKey', e, true)) { e.preventDefault(); return; }
    if (!I.keys[e.code]) I.hit[e.code] = true;
    I.keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    I.keys[e.code] = false;
    if (isTyping(e)) return;
    modeCall('onKey', e, false);
  });
  window.addEventListener('mousemove', (e) => {
    I.mouse.x = e.clientX;
    I.mouse.y = e.clientY;
    if (I.locked) {
      feedLook(e.movementX || 0, e.movementY || 0);
    } else if (I.mouse.down && I.dragLook) {
      I.mouse.dx += e.movementX || 0;
      I.mouse.dy += e.movementY || 0;
    }
    modeCall('onMouseMove', e);
  });
  window.addEventListener('mousedown', (e) => {
    I.mouse.down = true;
    const t = DA.modes.top();
    if (modeCall('onMouseDown', e)) return;
    if (t && t.def.lock && !I.locked && DA.running && !DA.paused) I.requestLock();
    I.dragLook = !!(t && t.def.lock && !I.locked);
  });
  window.addEventListener('mouseup', (e) => {
    I.mouse.down = false;
    I.dragLook = false;
    modeCall('onMouseUp', e);
  });
  window.addEventListener('wheel', (e) => { modeCall('onWheel', e); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const was = I.locked;
    I.locked = !!document.pointerLockElement;
    if (I.locked && !was) {
      // the first events after a lock can carry the jump to the lock point
      LOOK.ignoreUntil = performance.now() + 120;
      LOOK.speed = 0;
      LOOK.last = 0;
      LOOK.pend = null;
      I.mouse.dx = I.mouse.dy = 0;
    }
    DA.bus.emit('input:lock', { locked: I.locked });
    if (was && !I.locked && !I.intentionalUnlock) {
      const t = DA.modes.top();
      if (t && t.def.lock && DA.running) DA.bus.emit('input:lost-lock');
    }
    I.intentionalUnlock = false;
    // A lock requested for 'explore' can be granted after a cursor mode (map, desk, doc…) was
    // pushed on top; release it so clicks reach that mode.
    if (I.locked) {
      const t = DA.modes.top();
      if (!t || !t.def.lock) I.exitLock();
    }
  });
  window.addEventListener('blur', () => {
    I.keys = {};
    I.mouse.down = false;
    DA.bus.emit('input:blur');
  });

  /* =============================================================== modes */
  const M = (DA.modes = { defs: {}, stack: [] });
  /**
   * def: { enter(arg), exit(), update(dt, isTop), render(isTop), onKey(e, down)→bool,
   *        onMouseDown(e)→bool, onMouseUp(e), onMouseMove(e), onWheel(e),
   *        lock:bool (wants pointer lock / mouselook), opaque:bool (hides world render),
   *        blocksWorld:bool (pauses simulation while on top), cover(bool) (called when another mode covers/uncovers it) }
   */
  M.register = (name, def) => { M.defs[name] = def; };
  M.top = () => M.stack[M.stack.length - 1] || null;
  M.is = (name) => { const t = M.top(); return !!t && t.name === name; };
  M.has = (name) => M.stack.some((s) => s.name === name);
  M.push = (name, arg) => {
    const def = M.defs[name];
    if (!def) { console.error('[modes] unknown mode', name); return null; }
    const prev = M.top();
    if (prev && prev.def.cover) try { prev.def.cover(true); } catch (e) { console.error(e); }
    const entry = { name, def, arg };
    M.stack.push(entry);
    if (def.enter) try { def.enter(arg); } catch (e) { console.error('[mode ' + name + '.enter]', e); }
    syncCursor();
    DA.bus.emit('mode:enter', { name, arg });
    return entry;
  };
  /** Pop the top mode; with a name, remove that mode wherever it is in the stack. */
  M.pop = (name) => {
    let idx = M.stack.length - 1;
    if (name) idx = M.stack.map((s) => s.name).lastIndexOf(name);
    if (idx < 0) return null;
    const wasTop = idx === M.stack.length - 1;
    const [entry] = M.stack.splice(idx, 1);
    if (entry.def.exit) try { entry.def.exit(); } catch (e) { console.error('[mode ' + entry.name + '.exit]', e); }
    const t = M.top();
    if (wasTop && t && t.def.cover) try { t.def.cover(false); } catch (e) { console.error(e); }
    syncCursor();
    DA.bus.emit('mode:exit', { name: entry.name });
    return entry;
  };
  M.replace = (name, arg) => { M.pop(); return M.push(name, arg); };
  M.clear = () => { while (M.stack.length) M.pop(); };
  function syncCursor() {
    const t = M.top();
    const wantLock = !!(t && t.def.lock);
    document.body.classList.toggle('mouselook', wantLock);
    document.body.dataset.mode = t ? t.name : '';
    document.body.dataset.opaque = M.stack.some((e) => e.def.opaque) ? '1' : '';
    if (wantLock) I.requestLock();
    else I.exitLock();
  }
  M.syncCursor = syncCursor;

  /* ================================================ settings / meta / store */
  DA.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  DA.settings = Object.assign(
    { volume: 0.8, sensitivity: 1, invertY: false, tts: false, subtitles: true, grain: true, fov: 66, headBob: true, quality: 1 },
    DA.store.get('deadair.settings', {})
  );
  DA.saveSettings = () => {
    DA.store.set('deadair.settings', DA.settings);
    DA.bus.emit('settings', DA.settings);
  };
  /** Cross-run memory: deaths are canon, endings are remembered. */
  DA.meta = Object.assign({ deaths: [], endings: {}, timelines: 0, runs: 0 }, DA.store.get('deadair.meta', {}));
  DA.saveMeta = () => DA.store.set('deadair.meta', DA.meta);
  DA.recordDeath = (info) => {
    const rec = Object.assign(
      { name: DA.state.playerName, stamp: DA.clock.stamp(), act: DA.state.act, at: Date.now() },
      info || {}
    );
    DA.meta.deaths.push(rec);
    if (DA.meta.deaths.length > 40) DA.meta.deaths.shift();
    DA.saveMeta();
    return rec;
  };
  DA.recordEnding = (id) => {
    DA.meta.endings[id] = (DA.meta.endings[id] || 0) + 1;
    DA.saveMeta();
  };

  /* ============================================================ archives */
  DA.archive = {
    KEY: 'deadair.archive.',
    SLOTS: 6, // slot 0 is the automatic checkpoint
    read(slot) { return DA.store.get(this.KEY + slot, null); },
    has(slot) { return !!this.read(slot); },
    list() {
      const out = [];
      for (let i = 0; i < this.SLOTS; i++) {
        const a = this.read(i);
        if (a && a.meta) out.push(Object.assign({ slot: i }, a.meta));
      }
      return out;
    },
    save(slot, label) {
      DA.bus.emit('archive:collect', { slot });
      DA.meta.timelines = (DA.meta.timelines || 0) + 1;
      DA.state.stats.archives++;
      const snap = {
        meta: {
          label: label || (slot === 0 ? 'AUTOMATIC' : 'MANUAL'),
          stamp: DA.clock.stamp(),
          act: DA.state.act,
          name: DA.state.playerName,
          savedAt: Date.now(),
          timeline: DA.meta.timelines,
          night: DA.state.night || '',
        },
        state: U.clone(DA.state),
      };
      const ok = DA.store.set(this.KEY + slot, snap);
      DA.saveMeta();
      DA.bus.emit('archive:saved', Object.assign({ slot, ok }, snap.meta));
      return ok;
    },
    auto(label) { return this.save(0, label || 'AUTOMATIC'); },
    /** Newest archive; with `night`, only archives made during that night (game). */
    latest(night) {
      let best = null;
      for (const a of this.list()) {
        if (night && a.night !== night) continue;
        if (!best || a.savedAt > best.savedAt) best = a;
      }
      return best;
    },
    load(slot) {
      const a = this.read(slot);
      if (!a || !a.state) return false;
      DA.startFromState(a.state, { slot });
      return true;
    },
    /**
     * Load the newest archive. While a night is running (death → LOAD ARCHIVE) only archives of
     * THIS night count, so dying never drops the player into another timeline or another run.
     */
    loadLatest() {
      const night = DA.running && DA.state && DA.state.night;
      const l = night ? this.latest(night) : this.latest();
      if (l) return this.load(l.slot);
      DA.bus.emit('archive:none');
      return false;
    },
    wipe() { for (let i = 0; i < this.SLOTS; i++) DA.store.del(this.KEY + i); },
  };

  /** Start a brand-new night. Emits game:new then game:ready. */
  DA.newGame = (name) => {
    DA.resetRuntime();
    DA.modes.clear();
    DA.state = DA.newState();
    DA.state.playerName = (name || 'OPERATOR').trim() || 'OPERATOR';
    DA.state.started = true;
    DA.state.night = Date.now().toString(36) + '-' + ((Math.random() * 1e9) | 0).toString(36);
    DA.meta.runs = (DA.meta.runs || 0) + 1;
    DA.saveMeta();
    DA.running = true;
    DA.setPaused(false);
    DA.bus.emit('game:new', {});
    DA.bus.emit('game:ready', { fresh: true });
  };
  /** Resume from an archived state. A fresh variant seed makes tiny unacknowledged differences. */
  DA.startFromState = (st, opts) => {
    DA.resetRuntime();
    DA.modes.clear();
    DA.state = Object.assign(DA.newState(), U.clone(st));
    DA.state.seed = (Math.random() * 2147483647) | 0;
    DA.state.stats.loads = (DA.state.stats.loads || 0) + 1;
    DA.running = true;
    DA.setPaused(false);
    DA.bus.emit('game:load', opts || {});
    DA.bus.emit('game:ready', Object.assign({ fresh: false }, opts || {}));
  };
  /** Back to the title screen. */
  DA.quitToTitle = () => {
    DA.resetRuntime();
    DA.modes.clear();
    DA.running = false;
    DA.setPaused(false);
    DA.bus.emit('game:quit');
    DA.modes.push('title');
  };

  /* ======================================================== systems/loop */
  DA.systems = [];
  /** sys: {update(dt), order?} — updated every simulated frame while a game is running and not blocked. */
  DA.addSystem = (name, sys) => {
    sys.name = name;
    sys.order = sys.order || 0;
    DA.systems.push(sys);
    DA.systems.sort((a, b) => a.order - b.order);
    return sys;
  };
  DA.paused = false;
  DA.setPaused = (p) => {
    p = !!p;
    if (DA.paused === p) return;
    DA.paused = p;
    DA.bus.emit(p ? 'pause' : 'resume');
  };
  DA.time = 0; // real seconds since boot (not paused)
  DA.simTime = 0; // simulated seconds (pauses with the world)
  DA.dt = 0;
  DA.fps = 0;
  const errSeen = new Set();
  function reportOnce(tag, e) {
    const k = tag + ':' + (e && e.message);
    if (errSeen.has(k)) return;
    errSeen.add(k);
    console.error('[' + tag + ']', e);
  }
  let last = 0;
  let fpsAcc = 0, fpsN = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    DA.dt = dt;
    DA.time += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { DA.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    DA.step(dt);
    DA.input.endFrame();
  }
  /** One simulation + render step (exposed so tests can drive the game deterministically). */
  DA.step = (dt) => {
    const top = M.top();
    const blocked = DA.paused || !DA.running || !!(top && top.def.blocksWorld);
    if (!blocked) {
      DA.simTime += dt;
      DA.state.stats.playSec += dt;
      DA.timers.update(dt);
      updateWaiters(dt);
      DA.clock.update(dt);
      for (const s of DA.systems) {
        if (s.update) try { s.update(dt); } catch (e) { reportOnce('system ' + s.name, e); }
      }
      DA.bus.emit('tick', dt);
    }
    const n = M.stack.length;
    for (let i = 0; i < n; i++) {
      const e = M.stack[i];
      if (!e) continue;
      const isTop = i === M.stack.length - 1;
      if (e.def.update && (isTop || !blocked)) try { e.def.update(dt, isTop); } catch (err) { reportOnce('mode ' + e.name + '.update', err); }
    }
    let firstVisible = 0;
    for (let i = M.stack.length - 1; i >= 0; i--) if (M.stack[i].def.opaque) { firstVisible = i; break; }
    const worldVisible = DA.running && !M.stack.some((e) => e.def.opaque);
    if (worldVisible && DA.render && DA.render.frame) {
      try { DA.render.frame(dt); } catch (e) { reportOnce('render.frame', e); }
    }
    for (let i = firstVisible; i < M.stack.length; i++) {
      const e = M.stack[i];
      if (e.def.render) try { e.def.render(i === M.stack.length - 1); } catch (err) { reportOnce('mode ' + e.name + '.render', err); }
    }
    DA.bus.emit('frame', dt);
  };

  DA.booted = false;
  /** Called once by main.js after every module script has loaded. */
  DA.boot = () => {
    if (DA.booted) return;
    DA.booted = true;
    I.lockTarget = document.getElementById('game') || document.body;
    DA.bus.emit('boot');
    requestAnimationFrame(frame);
    DA.bus.emit('booted');
  };
})();
