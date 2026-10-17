/* DEAD AIR — debug.js
 * DA.debug: developer overlay, cheat keys and the helpers QA scripts drive the game with
 * (PLAN.md §6.9, §8). The overlay and keys exist only with ?debug in the URL (DA.debugMode); the
 * test helpers and autostart() always exist.
 *
 * ---------------------------------------------------------------- URL
 *   ?debug                 overlay (top-right) + keys below.
 *   &jump=<beat>           autostart(): DA.newGame(name || 'TESTER') then DA.director.jump(beat);
 *                          main.js skips the title. Works without a user gesture (audio stays
 *                          silent until the first click/key — DA.audio.autoInit).
 *   &autoplay              autostart(): DA.newGame(name || 'TESTER') from the beginning.
 *   &name=<name>           player name for the above.
 *   (jump/autoplay are honoured with or without ?debug.)
 *
 * ---------------------------------------------------------------- KEYS (debug mode)
 *   F4 overlay on/off · F6 instability +3 · Shift+F6 saved +1 (entity power) · F7 all items
 *   F8 clock +10 game minutes (stops at an active DA.clock.hold; Shift+F8 ignores holds)
 *   F9 beat menu (DA.director.beats → DA.director.jump) · F10 noclip (walk through walls)
 *   Shift+F10 map: click a cell to teleport there (Shift+click: spawn the entity there)
 *   F3 entity: spawn it 3 u ahead (idle) / despawn · Shift+F3: make it hunt you
 *
 * ---------------------------------------------------------------- HELPERS (always present)
 *   NOTE: fast / waitFor / step are async — `await` them (page.evaluate awaits a returned promise).
 *   fast(seconds, dt=1/30, {noRender=true, until}) → Promise<simulated seconds>
 *        runs DA.step(dt) repeatedly with DA.render.frame temporarily a no-op; between steps it
 *        yields a few microtask turns so DA.script awaits advance on time. `until` = predicate
 *        that stops it early.
 *   fastSync(seconds, dt, opts) → simulated seconds    the same without yielding (no awaits run).
 *   waitFor(pred, maxSeconds=30, dt=1/30, opts) → Promise<{ok, seconds}>   fast-steps until
 *        pred() is truthy (pred may also be a JS expression string).
 *   step(n=1, dt=1/30) → Promise  n steps, rendering normally.
 *   teleport(pointName | {x, y, map?, angle?}, angleDeg?) → {map, x, y, deg} | false
 *   fire(interactId, opts) → bool     DA.interact.find + DA.interact.fire (false: unknown/disabled)
 *   tune(freq, bearing?) → {freq, bearing}   DA.radio.tune + DA.radio.setBearing(…, {instant})
 *   pick(optionId) · send(outId)          DA.radio.pick / DA.radio.send
 *   state() → compact JSON-safe summary {act, beat, director, flags, vars, pure, inventory, tapes,
 *        objectives, clock, map, room, pos, hidden, modes, radio {freq, bearing, power, log},
 *        entity, subtitles}
 *   screenshotReady() → Promise<true>    restores rendering, renders the current view now and waits
 *        two animation frames (so a screenshot shows the present state after fast()).
 *   autostart() → bool                   (main.js) see URL above. The jump itself runs one macrotask
 *        after DA.newGame (see autostart()); `DA.debug.ready` resolves once it has happened.
 *   Extras: give(...items), flag(k, v?), v(k, n?), beats() → [{id, label, act}], jump(id, name?) →
 *        Promise<bool> (starts a game first when none runs, then jumps a macrotask later),
 *        noclip(on?), overlay(on?), menu(), map(), skip(minutes, ignoreHolds), giveAll(),
 *        entity() → DA.entity.debugInfo() (incl. danger: DA.entity.danger(), lethal: the current
 *        walk is lethal), power() → DA.entity.powerInfo().
 *   walk(target, opts) → Promise<{ok, reason, seconds, dist, map, x, y}>   autopilot: drives the
 *        player with REAL movement input (KeyW held, Shift when opts.run, crouch toggled by
 *        opts.crouch) along DA.world.path to a point name | {x, y} on the current map, opening
 *        closed unlocked doors ahead, fast-stepping like waitFor. opts: {run, crouch, near=0.4,
 *        max=60 sim s, until (pred|string), doors=true, look: 'path' (face the way, default) |
 *        'keep' (strafe/back-pedal keeping the current view), render=false}. reason: 'arrived' |
 *        'until' | 'map' (the map changed: stairs) | 'mode' (a non-explore mode came on top) |
 *        'stuck' | 'nopath' | 'max'. Keys are released afterwards. Held up by a solid prop the
 *        path runs through (the storage aisle box), it sidesteps — strafes right / left, a little
 *        longer each time (up to 4 tries) while pressing on — then re-paths; 'stuck' only after that.
 *   look(pointName | {x, y} | deg, pitchDeg?) → {deg, pitch}   face a point / an angle.
 *   turn(deg, degPerSec=90, {until, render}) → Promise<{seconds, deg}>   rotate the view at a
 *        steady rate while the game runs (slow cautious turns, glimpse tests).
 *   record(names?) → true   start recording DA.bus events (all but per-frame noise, or only the
 *        given names; restarts the list). events(clear?) → [{t (simTime), clk, ev, d}].
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;
  const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const DEG = Math.PI / 180;

  /* ================================================================ helpers */
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  const toPred = (pred) => (typeof pred === 'function' ? pred : new Function('return (' + String(pred) + ');'));
  const microYield = async () => { for (let k = 0; k < 6; k++) await 0; };

  function withNoRender(noRender, fn) {
    const R = DA.render;
    const orig = R && R.frame;
    if (noRender && R) R.frame = function () {};
    try { return fn(); } finally { if (noRender && R) R.frame = orig; }
  }
  /** Fast-forward the simulation (see header). */
  async function fast(seconds, dt, opts) {
    dt = +dt > 0 ? +dt : 1 / 30;
    opts = opts || {};
    const noRender = opts.noRender !== false;
    const until = opts.until ? toPred(opts.until) : null;
    const n = Math.max(0, Math.round((+seconds || 0) / dt));
    const R = DA.render;
    const orig = R && R.frame;
    let t = 0;
    try {
      for (let i = 0; i < n; i++) {
        if (noRender && R) R.frame = function () {};
        DA.step(dt);
        t += dt;
        if (noRender && R) R.frame = orig;
        await microYield();
        if (until && safe(until, false)) break;
      }
    } finally { if (noRender && R) R.frame = orig; }
    return +t.toFixed(4);
  }
  function fastSync(seconds, dt, opts) {
    dt = +dt > 0 ? +dt : 1 / 30;
    opts = opts || {};
    const until = opts.until ? toPred(opts.until) : null;
    const n = Math.max(0, Math.round((+seconds || 0) / dt));
    let t = 0;
    withNoRender(opts.noRender !== false, () => {
      for (let i = 0; i < n; i++) { DA.step(dt); t += dt; if (until && safe(until, false)) break; }
    });
    return +t.toFixed(4);
  }
  async function waitFor(pred, maxSeconds, dt, opts) {
    const p = toPred(pred);
    dt = +dt > 0 ? +dt : 1 / 30;
    const max = maxSeconds == null ? 30 : +maxSeconds;
    opts = opts || {};
    const noRender = opts.noRender !== false;
    const R = DA.render;
    const orig = R && R.frame;
    let t = 0;
    try {
      if (safe(p, false)) return { ok: true, seconds: 0 };
      while (t < max) {
        if (noRender && R) R.frame = function () {};
        DA.step(dt);
        t += dt;
        if (noRender && R) R.frame = orig;
        await microYield();
        if (safe(p, false)) return { ok: true, seconds: +t.toFixed(3) };
      }
    } finally { if (noRender && R) R.frame = orig; }
    return { ok: false, seconds: +t.toFixed(3) };
  }
  async function step(n, dt) {
    n = n == null ? 1 : n | 0;
    dt = +dt > 0 ? +dt : 1 / 30;
    for (let i = 0; i < n; i++) { DA.step(dt); await microYield(); }
    return n;
  }
  function teleport(pt, angleDeg) {
    const w = DA.world;
    if (!w) return false;
    if (typeof pt === 'string') {
      const p = w.point(pt);
      if (!p) { console.warn('[debug] teleport: unknown point', pt); return false; }
      w.teleport(pt);
      if (angleDeg != null) w.player.angle = +angleDeg * DEG;
    } else if (pt && isFinite(pt.x) && isFinite(pt.y)) {
      w.teleport(+pt.x, +pt.y, pt.angle != null ? +pt.angle : angleDeg != null ? +angleDeg : null, pt.map || w.mapId);
    } else return false;
    const P = w.player;
    return { map: w.mapId, x: +P.x.toFixed(2), y: +P.y.toFixed(2), deg: Math.round(P.angle / DEG) };
  }
  function fire(id, opts) {
    const I = DA.interact;
    if (!I) return false;
    const f = I.find ? I.find(id) : null;
    if (!f) console.warn('[debug] fire: no interactable', id);
    return !!I.fire(f ? f.it : id, opts);
  }
  function tune(freq, bearing) {
    const R = DA.radio;
    if (!R) return null;
    if (freq != null && R.tune) R.tune(+freq);
    if (bearing != null && R.setBearing) R.setBearing(+bearing, { instant: true });
    return { freq: R.freq, bearing: R.bearing };
  }
  const pick = (id) => (DA.radio && DA.radio.pick ? DA.radio.pick(id) : false);
  const send = (id) => (DA.radio && DA.radio.send ? DA.radio.send(id) : false);
  function directorStatus() {
    const D = DA.director;
    if (!D || typeof D.status !== 'function') return null;
    return safe(() => D.status(), null);
  }
  function state() {
    const st = DA.state || {};
    const w = DA.world, P = w && w.player;
    const flags = {};
    for (const k in st.flags || {}) { const v = st.flags[k]; if (v !== false && v != null) flags[k] = v; }
    const ds = directorStatus();
    const log = safe(() => (DA.radio && DA.radio.entries ? DA.radio.entries() : (st.radio && st.radio.log) || []), []) || [];
    const clockHold = safe(() => DA.clock.ceiling(), Infinity);
    return JSON.parse(JSON.stringify({
      running: !!DA.running,
      act: st.act,
      beat: ds && typeof ds === 'object' ? ds.beat != null ? ds.beat : ds.id : ds,
      director: ds,
      flags,
      vars: Object.assign({}, st.vars || {}),
      pure: safe(() => DA.isPure(), null),
      inventory: (st.inventory || []).slice(),
      tapes: (st.tapes || []).slice(),
      objectives: (st.objectives || []).map((o) => ({ id: o.id, text: o.text, done: !!o.done })),
      clock: { stamp: safe(() => DA.clock.stamp(), ''), time: safe(() => DA.clock.hhmmss(), ''), min: +(+((st.clock && st.clock.min) || 0)).toFixed(3),
        rate: st.clock && st.clock.rate, frozen: !!(st.clock && st.clock.frozen), hold: isFinite(clockHold) ? clockHold : null },
      sunrise: st.sunrise,
      map: w && w.mapId,
      room: safe(() => w.room(), null),
      pos: P ? { x: +P.x.toFixed(2), y: +P.y.toFixed(2), deg: Math.round(P.angle / DEG) } : null,
      hidden: P ? !!P.hidden : false,
      focus: safe(() => { const f = w.focus(); return f ? f.id : null; }, null),
      modes: DA.modes ? DA.modes.stack.map((e) => e.name) : [],
      radio: DA.radio ? {
        freq: DA.radio.freq, bearing: DA.radio.bearing, power: DA.radio.power,
        pending: safe(() => { const p = DA.radio.pending(); return p ? { txId: p.txId, node: p.node, options: (p.options || []).map((o) => o.id) } : null; }, null),
        log: log.slice(-6).map((e) => ({ num: e.num, txId: e.txId, freq: e.freq, sender: e.sender, status: e.status, logged: !!e.logged })),
      } : null,
      entity: DA.entity && DA.entity.debugInfo ? safe(() => DA.entity.debugInfo(), null) : null,
      subtitles: safe(() => DA.ui.history(3), []),
    }));
  }
  function screenshotReady() {
    const R = DA.render;
    if (R && R.frame && DA.running && DA.modes && !DA.modes.stack.some((e) => e.def && e.def.opaque)) {
      try { R.frame(1 / 60); } catch (e) { console.error('[debug] screenshotReady', e); }
    }
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
  }
  /* ---------------------------------------------------------------- player autopilot */
  const resolveTarget = (t) => {
    const w = DA.world;
    if (typeof t === 'string') { const p = w.point(t); return p ? { x: p.x, y: p.y, map: p.map } : null; }
    return t && isFinite(t.x) && isFinite(t.y) ? { x: +t.x, y: +t.y, map: t.map || w.mapId } : null;
  };
  const releaseKeys = () => { const K = DA.input.keys; K.KeyW = false; K.ShiftLeft = false; };
  /**
   * Walk the player to a point with real movement input (KeyW / Shift held, steering along
   * DA.world.path, opening closed unlocked doors ahead) while fast-stepping like waitFor.
   * → Promise<{ok, reason, seconds, dist, map, x, y}>. See header.
   */
  async function walk(target, opts) {
    opts = opts || {};
    const w = DA.world, P = w && w.player;
    const tgt = resolveTarget(target);
    if (!P || !tgt) return { ok: false, reason: 'nopath' };
    if (tgt.map !== w.mapId) return { ok: false, reason: 'map' };
    const dt = +opts.dt > 0 ? +opts.dt : 1 / 30, max = opts.max != null ? +opts.max : 60, near = opts.near || 0.4;
    const until = opts.until ? toPred(opts.until) : null;
    const map0 = w.mapId;
    const mk = () => w.path(P.x, P.y, tgt.x, tgt.y, map0, { locked: true });
    let path = mk();
    if (!path) return { ok: false, reason: 'nopath' };
    if (opts.crouch != null && w.setCrouch) w.setCrouch(!!opts.crouch);
    const R = DA.render, orig = R && R.frame, noRender = !opts.render;
    let t = 0, dist = 0, still = 0, stuckN = 0, i = 0, lx = P.x, ly = P.y, reason = 'max', doorT = 0;
    // stuck on a solid prop the path runs through (a box in the storage aisle): sidestep — strafe
    // left / right (alternating, a little longer each time, 4 tries) while still pressing on, then re-path
    let side = 0, sideT = 0, sideN = 0;
    const done = (r) => { reason = r; };
    try {
      while (t < max) {
        if (w.mapId !== map0) { done('map'); break; }
        const top = DA.modes.top();
        if (!top || top.name !== 'explore') { done('mode'); break; }
        if (Math.hypot(tgt.x - P.x, tgt.y - P.y) < near) { done('arrived'); break; }
        if (until && safe(until, false)) { done('until'); break; }
        while (i < path.length - 1 && Math.hypot(path[i].x - P.x, path[i].y - P.y) < 0.45) i++;
        const wp = i >= path.length - 1 ? tgt : path[i];
        // open doors on the next legs
        doorT -= dt;
        if (opts.doors !== false && doorT <= 0) {
          doorT = 0.4;
          for (let k = i; k < Math.min(path.length, i + 3); k++) {
            const c = w.cellAt ? w.cellAt(path[k].x, path[k].y) : null;
            if (c && c.door && !w.isOpen(c.door)) { const d = w.door(c.door); if (d && !d.locked) w.openDoor(c.door); }
          }
        }
        const want = Math.atan2(wp.y - P.y, wp.x - P.x);
        const K = DA.input.keys;
        if (opts.look === 'keep') {
          // strafe: keep facing, press the keys that move toward the waypoint
          const rel = U.wrapAngle(want - P.angle);
          K.KeyW = Math.cos(rel) > 0.38; K.KeyS = Math.cos(rel) < -0.38; K.KeyD = Math.sin(rel) > 0.38; K.KeyA = Math.sin(rel) < -0.38;
        } else { P.angle = want; K.KeyW = true; }
        if (sideT > 0) {
          sideT -= dt;
          if (opts.look === 'keep') { const rel = U.wrapAngle(want - P.angle + side * Math.PI / 2); K.KeyD = Math.sin(rel) > 0.38; K.KeyA = Math.sin(rel) < -0.38; }
          else { K.KeyD = side > 0; K.KeyA = side < 0; }
          if (sideT <= 0) { K.KeyA = false; K.KeyD = false; const np = mk(); if (np) { path = np; i = 0; } }
        } else if (opts.look !== 'keep') { K.KeyA = false; K.KeyD = false; }
        K.ShiftLeft = !!opts.run;
        if (noRender && R) R.frame = function () {};
        DA.step(dt);
        if (noRender && R) R.frame = orig;
        await microYield();
        t += dt;
        const mv = Math.hypot(P.x - lx, P.y - ly);
        dist += mv;
        // "still" = hardly any progress (sliding against a round prop creeps sideways)
        still = mv < 0.004 * dt * 30 ? still + dt : 0;
        lx = P.x; ly = P.y;
        if (still > 0.5 && sideT <= 0 && sideN < 4) {
          sideN++;
          side = sideN % 2 ? 1 : -1;
          sideT = 0.25 + 0.12 * sideN;
          still = 0;
        } else if (still > 1.2) { const np = mk(); if (np) { path = np; i = 0; } still = 0; if (++stuckN > 6) { done('stuck'); break; } }
      }
    } finally {
      if (noRender && R) R.frame = orig;
      const K = DA.input.keys;
      releaseKeys(); K.KeyS = false; K.KeyA = false; K.KeyD = false;
    }
    return { ok: reason === 'arrived' || reason === 'until', reason, seconds: +t.toFixed(2), dist: +dist.toFixed(2), map: w.mapId, x: +P.x.toFixed(2), y: +P.y.toFixed(2) };
  }
  /** Face a point (name | {x, y}) or an absolute angle in degrees; optional pitch in degrees. */
  function look(target, pitchDeg) {
    const w = DA.world, P = w && w.player;
    if (!P) return null;
    if (typeof target === 'number') P.angle = U.wrapAngle(target * DEG);
    else { const t = resolveTarget(target); if (t) P.angle = Math.atan2(t.y - P.y, t.x - P.x); }
    if (pitchDeg != null) P.pitch = +pitchDeg * DEG;
    return { deg: Math.round(P.angle / DEG), pitch: Math.round((P.pitch || 0) / DEG) };
  }
  /**
   * Turn the view by `deg` (+ = clockwise on the map, i.e. toward +angle) at `degPerSec`,
   * stepping the simulation → Promise<{seconds, deg}>. opts.until stops early.
   */
  async function turn(deg, degPerSec, opts) {
    opts = opts || {};
    const P = DA.world && DA.world.player;
    if (!P) return null;
    const dt = 1 / 30, rate = Math.abs(+degPerSec || 90) * DEG, total = Math.abs(+deg || 0) * DEG, sgn = +deg < 0 ? -1 : 1;
    const until = opts.until ? toPred(opts.until) : null;
    const R = DA.render, orig = R && R.frame, noRender = !opts.render;
    let done = 0, t = 0;
    try {
      while (done < total - 1e-6) {
        const d = Math.min(rate * dt, total - done);
        P.angle = U.wrapAngle(P.angle + sgn * d);
        done += d;
        if (noRender && R) R.frame = function () {};
        DA.step(dt);
        if (noRender && R) R.frame = orig;
        await microYield();
        t += dt;
        if (until && safe(until, false)) break;
      }
    } finally { if (noRender && R) R.frame = orig; }
    return { seconds: +t.toFixed(2), deg: Math.round(P.angle / DEG) };
  }

  /* ---------------------------------------------------------------- event recorder */
  const REC = { on: false, list: [], only: null, skip: new Set(['tick', 'frame', 'clock:minute', 'var', 'input:lock', 'settings']) };
  let recWrapped = false;
  /**
   * Start (or restart) recording bus events: record(names?) — names: array of event names
   * (default: everything except per-frame noise). events(clear=false) → [{t, clk, ev, d}].
   */
  function record(names) {
    REC.list = [];
    REC.only = names && names.length ? new Set([].concat(names)) : null;
    REC.on = true;
    if (!recWrapped) {
      recWrapped = true;
      const orig = DA.bus.emit.bind(DA.bus);
      DA.bus.emit = function (ev, d) {
        if (REC.on && (REC.only ? REC.only.has(ev) : !REC.skip.has(ev))) {
          let dd;
          try { dd = d === undefined ? null : JSON.parse(JSON.stringify(d)); } catch (e) { dd = String(d); }
          REC.list.push({ t: +(+DA.simTime || 0).toFixed(2), clk: safe(() => DA.clock.hhmmss(), ''), ev, d: dd });
          if (REC.list.length > 5000) REC.list.shift();
        }
        return orig(ev, d);
      };
    }
    return true;
  }
  function events(clear) {
    const out = REC.list.slice();
    if (clear) REC.list = [];
    return out;
  }

  function give(...ids) { for (const id of ids.flat()) DA.giveItem(id); return (DA.state.inventory || []).slice(); }
  function giveAll() {
    give('flashlight', 'key_records', 'key_antenna', 'mug');
    const tapes = Object.keys((DA.content && DA.content.tapes) || {});
    if (!Array.isArray(DA.state.tapes)) DA.state.tapes = [];
    for (const t of tapes) if (!DA.state.tapes.includes(t)) DA.state.tapes.push(t);
    toast('ALL ITEMS');
    return { inventory: DA.state.inventory.slice(), tapes: DA.state.tapes.slice() };
  }
  function skip(minutes, ignoreHolds) {
    const C = DA.clock;
    if (!C) return null;
    let t = C.min + (minutes == null ? 10 : +minutes);
    const ceil = C.ceiling ? C.ceiling() : Infinity;
    if (!ignoreHolds && t > ceil) t = Math.max(C.min, ceil);
    C.min = t;
    toast('CLOCK ' + C.hhmm() + (!ignoreHolds && t >= ceil && isFinite(ceil) ? ' (held)' : ''));
    return C.hhmm();
  }
  function beats() {
    const D = DA.director;
    if (!D) return [];
    let b = D.beats;
    if (typeof b === 'function') b = safe(() => b.call(D), []);
    if (!b) return [];
    const out = [];
    const add = (id, o) => {
      if (id == null) return;
      const lab = o && typeof o === 'object' ? o.label || o.title || o.name || o.desc || '' : typeof o === 'string' && o !== id ? o : '';
      const act = o && typeof o === 'object' && o.act != null ? o.act : null;
      out.push({ id: String(id), label: String(lab), act });
    };
    if (Array.isArray(b)) for (const x of b) typeof x === 'string' ? add(x) : x && add(x.id || x.name, x);
    else if (typeof b === 'object') for (const k in b) add(k, b[k]);
    return out;
  }
  function callJump(id) {
    const D = DA.director;
    if (!D || typeof D.jump !== 'function') { console.warn('[debug] no DA.director.jump'); return false; }
    try {
      const r = D.jump(id);
      if (r && typeof r.catch === 'function') r.catch((e) => console.error('[debug] jump', e));
      return r !== false;
    } catch (e) { console.error('[debug] jump', id, e); return false; }
  }
  /**
   * Jump to a beat → Promise<bool>. With no game running it starts one first and jumps one
   * macrotask later: the fresh game's controller has then started and is parked on a
   * session-checked await, so the jump's reset really retires it (a controller whose body only
   * starts after the jump would run on through the jump's already-done steps).
   */
  function jump(id, name) {
    if (DA.running) return Promise.resolve(callJump(id));
    try { DA.newGame(name || qs.get('name') || 'TESTER'); } catch (e) { console.error('[debug] jump: newGame', e); }
    return new Promise((res) => setTimeout(() => res(callJump(id)), 0));
  }
  /** main.js: ?jump=<beat> / ?autoplay → start a game straight away (skip the title). */
  let readyResolve = null;
  const ready = new Promise((res) => { readyResolve = res; });
  function autostart() {
    const beat = qs.get('jump');
    const auto = qs.has('autoplay');
    if (!beat && !auto) return false;
    const name = qs.get('name') || 'TESTER';
    if (!beat || !(DA.director && typeof DA.director.jump === 'function')) {
      if (beat) console.warn('[debug] autostart: DA.director.jump missing — started a new game instead of', beat);
      try { DA.newGame(name); } catch (e) { console.error('[debug] autostart', e); }
      readyResolve(!beat);
      return true;
    }
    jump(beat, name).then(readyResolve, () => readyResolve(false));
    return true;
  }
  function toast(text) {
    if (DA.ui && DA.ui.toast) safe(() => DA.ui.toast(text, 1.6));
    else console.log('[debug]', text);
  }

  /* ================================================================ overlay */
  const ui = { ov: null, on: true, lastT: 0, menu: null, map: null };
  function buildOverlay() {
    if (ui.ov || !document.body) return;
    const el = document.createElement('div');
    el.id = 'da-debug';
    Object.assign(el.style, {
      position: 'fixed', top: '4px', right: '4px', zIndex: 9999, pointerEvents: 'none', whiteSpace: 'pre',
      font: '10.5px/1.3 "IBM Plex Mono", ui-monospace, monospace', color: '#b8f5b0', background: 'rgba(0,0,0,0.62)',
      padding: '4px 6px', border: '1px solid rgba(160,255,150,0.18)', maxWidth: '46vw', overflow: 'hidden',
    });
    document.body.appendChild(el);
    ui.ov = el;
  }
  const f2 = (v) => (isFinite(v) ? (+v).toFixed(2) : '-');
  function overlayText() {
    const w = DA.world, P = w && w.player, R = DA.render, st = DA.state || {};
    const lines = [];
    const rs = R && R.stats ? R.stats : {};
    lines.push(`FPS ${DA.fps || 0}  render ${f2(rs.ms)}ms avg ${f2(rs.avg)}  spr ${rs.sprites || 0}${nc.on ? '  NOCLIP' : ''}`);
    if (w && P && DA.running) {
      const room = safe(() => w.room(), null);
      lines.push(`MAP ${w.mapId}  ROOM ${room || '-'}  ${f2(P.x)},${f2(P.y)}  ${Math.round(((P.angle / DEG) % 360 + 360) % 360)}°${P.hidden ? '  HIDDEN' : ''}${P.crouching ? '  CROUCH' : ''}`);
    }
    const C = DA.clock;
    if (C && DA.running) {
      const ceil = safe(() => C.ceiling(), Infinity);
      lines.push(`CLK ${C.hhmmss()} ${C.date()}  x${f2(C.rate)}${C.frozen ? ' FROZEN' : ''}${isFinite(ceil) ? '  hold ' + C.hhmm(ceil) : ''}`);
    }
    const ds = directorStatus();
    if (ds != null) {
      if (typeof ds === 'object') {
        const bits = [];
        for (const k of ['act', 'beat', 'phase', 'step', 'path', 'ending']) if (ds[k] != null && ds[k] !== '') bits.push(k.toUpperCase() + ' ' + ds[k]);
        lines.push(bits.length ? bits.join('  ') : JSON.stringify(ds).slice(0, 90));
      } else lines.push('BEAT ' + String(ds));
    } else lines.push(`ACT ${st.act != null ? st.act : '-'}  (no director)`);
    if (DA.running) lines.push(`INT ${DA.v('interference')}  INST ${DA.v('instability')}  SAVED ${DA.v('saved')}  POWER ${safe(() => DA.entity.power().toFixed(2), '-')}  TX ${DA.v('txCount')}  PURE ${safe(() => (DA.isPure() ? 'yes' : 'no'), '?')}`);
    lines.push('MODES ' + (DA.modes ? DA.modes.stack.map((e) => e.name).join(' > ') || '-' : '-'));
    const E = DA.entity && DA.entity.debugInfo ? safe(() => DA.entity.debugInfo(), null) : null;
    if (E && (E.active || E.window > 0 || E.glimpses)) {
      lines.push(`ENT ${E.active ? E.mode + ' @' + E.map + ' ' + f2(E.x) + ',' + f2(E.y) + (E.dist != null ? ' d' + f2(E.dist) : '') + (E.visible ? ' SEEN' : '') + (E.caught ? ' CAUGHT' : '') + (E.transit ? ' [' + E.transit + ']' : '') + (E.lethal ? ' LETHAL' : E.danger ? ' DANGER' : '') : 'off'}${E.window > 0 ? '  window ' + f2(E.window) : ''}${E.glimpses ? '  glimpse' : ''}`);
    } else lines.push('ENT off');
    const f = w && w.focus ? safe(() => w.focus(), null) : null;
    lines.push('FOCUS ' + (f ? f.id + ' (' + f.kind + ')' : '-'));
    if (DA.radio && DA.running) lines.push(`RADIO ${(+DA.radio.freq).toFixed(2)}  ${DA.radio.bearing}°${DA.radio.power ? '' : ' OFF'}`);
    return lines.join('\n');
  }
  function updateOverlay() {
    if (!ui.ov) return;
    ui.ov.style.display = ui.on ? '' : 'none';
    if (!ui.on) return;
    const now = performance.now();
    if (now - ui.lastT < 220) return;
    ui.lastT = now;
    ui.ov.textContent = safe(overlayText, 'debug overlay error');
  }

  /* ================================================================ noclip */
  const nc = { on: false, x: 0, y: 0, map: null, lx: 0, ly: 0 };
  function noclip(on) {
    const w = DA.world;
    if (!w || !w.player) return false;
    const P = w.player;
    on = on == null ? !nc.on : !!on;
    if (on === nc.on) return nc.on;
    nc.on = on;
    if (on) { nc.x = nc.lx = P.x; nc.y = nc.ly = P.y; nc.map = w.mapId; }
    else safe(() => w.teleport(P.x, P.y, P.angle / DEG, w.mapId)); // world pushes us out of any wall
    toast(on ? 'NOCLIP ON' : 'NOCLIP OFF');
    return nc.on;
  }
  function updateNoclip(dt) {
    if (!nc.on) return;
    const w = DA.world, I = DA.input;
    if (!w || !w.player || !w.map) return;
    const P = w.player;
    // the world moved us a long way itself (portal, stairs): follow it
    if (w.mapId !== nc.map || Math.hypot(P.x - nc.lx, P.y - nc.ly) > 1.0) { nc.x = P.x; nc.y = P.y; nc.map = w.mapId; }
    if (DA.modes.is('explore') && !DA.paused && !P.hidden) {
      let fx = 0, sx = 0;
      if (I.down('KeyW') || I.down('ArrowUp')) fx += 1;
      if (I.down('KeyS') || I.down('ArrowDown')) fx -= 1;
      if (I.down('KeyA')) sx -= 1;
      if (I.down('KeyD')) sx += 1;
      const len = Math.hypot(fx, sx) || 1;
      const sp = (I.down('ShiftLeft') || I.down('ShiftRight') ? 9 : 4.5) * dt;
      const ca = Math.cos(P.angle), sa = Math.sin(P.angle);
      nc.x += ((ca * fx - sa * sx) / len) * sp;
      nc.y += ((sa * fx + ca * sx) / len) * sp;
    }
    nc.x = U.clamp(nc.x, 0.3, w.map.w - 0.3);
    nc.y = U.clamp(nc.y, 0.3, w.map.h - 0.3);
    P.x = nc.lx = nc.x;
    P.y = nc.ly = nc.y;
    if (DA.state.world) { DA.state.world.x = P.x; DA.state.world.y = P.y; }
  }

  /* ================================================================ beat menu */
  const panelStyle = {
    position: 'fixed', zIndex: 10000, left: '50%', top: '8%', transform: 'translateX(-50%)', minWidth: '320px', maxHeight: '80vh', overflow: 'auto',
    background: 'rgba(6,10,8,0.94)', color: '#c8f7c0', font: '12px/1.45 "IBM Plex Mono", ui-monospace, monospace', padding: '10px 12px',
    border: '1px solid rgba(160,255,150,0.3)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  };
  const menuMode = {
    lock: false, blocksWorld: true,
    enter() { openMenu(); },
    exit() { if (ui.menu) { ui.menu.el.remove(); ui.menu = null; } },
    onKey(e, down) {
      if (!down || !ui.menu) return true;
      const M = ui.menu;
      if (e.code === 'Escape' || e.code === 'F9') { DA.modes.pop('debug_beats'); return true; }
      if (e.code === 'ArrowDown') M.sel = Math.min(M.items.length - 1, M.sel + 1);
      else if (e.code === 'ArrowUp') M.sel = Math.max(0, M.sel - 1);
      else if (e.code === 'Enter' || e.code === 'Space') { choose(M.items[M.sel]); return true; }
      else if (/^Digit\d$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (M.items[i]) choose(M.items[i]); return true; }
      paintMenu();
      return true;
    },
  };
  function openMenu() {
    const el = document.createElement('div');
    Object.assign(el.style, panelStyle);
    document.body.appendChild(el);
    const items = beats();
    ui.menu = { el, items, sel: 0 };
    paintMenu();
  }
  function paintMenu() {
    const M = ui.menu;
    if (!M) return;
    M.el.innerHTML = '';
    const h = document.createElement('div');
    h.textContent = M.items.length ? 'JUMP TO BEAT  (↑↓ Enter · 1–9 · Esc)' : 'No beats: DA.director.beats is missing.';
    h.style.cssText = 'color:#8fd98a;margin-bottom:6px;letter-spacing:.06em';
    M.el.appendChild(h);
    M.items.forEach((b, i) => {
      const r = document.createElement('div');
      r.textContent = (i < 9 ? i + 1 + '. ' : '   ') + b.id + (b.label ? ' — ' + b.label : '') + (b.act != null ? '  [act ' + b.act + ']' : '');
      r.style.cssText = 'cursor:pointer;padding:1px 4px;' + (i === M.sel ? 'background:rgba(160,255,150,0.18);color:#fff' : '');
      r.addEventListener('mouseenter', () => { M.sel = i; paintMenu(); });
      r.addEventListener('mousedown', (e) => { e.stopPropagation(); choose(b); });
      M.el.appendChild(r);
      if (i === M.sel) try { r.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    });
  }
  function choose(b) {
    if (!b) return;
    DA.modes.pop('debug_beats');
    jump(b.id);
    toast('JUMP ' + b.id);
  }
  function menu() {
    if (!DA.modes || !DA.modes.defs.debug_beats) return false;
    if (DA.modes.has('debug_beats')) DA.modes.pop('debug_beats');
    else DA.modes.push('debug_beats');
    return true;
  }

  /* ================================================================ map (click to teleport) */
  const mapMode = {
    lock: false, blocksWorld: true,
    enter() { openMap(); },
    exit() { if (ui.map) { ui.map.el.remove(); ui.map = null; } },
    onKey(e, down) { if (down && (e.code === 'Escape' || e.code === 'F10')) DA.modes.pop('debug_map'); return true; },
  };
  function openMap() {
    const w = DA.world, m = w && w.map;
    const el = document.createElement('div');
    Object.assign(el.style, panelStyle, { top: '4%', padding: '6px' });
    document.body.appendChild(el);
    ui.map = { el };
    if (!m) { el.textContent = 'No map.'; return; }
    const cell = Math.max(5, Math.min(14, Math.floor(Math.min((window.innerWidth * 0.9) / m.w, (window.innerHeight * 0.82) / m.h))));
    const cv = document.createElement('canvas');
    cv.width = m.w * cell; cv.height = m.h * cell;
    cv.style.cursor = 'crosshair';
    cv.style.display = 'block';
    const cap = document.createElement('div');
    cap.textContent = `${m.id} — click: teleport · shift+click: spawn the entity · Esc`;
    cap.style.cssText = 'margin-bottom:4px;color:#8fd98a';
    el.appendChild(cap);
    el.appendChild(cv);
    const g = cv.getContext('2d');
    const roomCol = (r) => { const h = U.hash(String(r)); return `hsl(${h % 360},22%,${22 + (h >> 9) % 10}%)`; };
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      let c = '#000';
      if (m.pit && m.pit[i]) c = '#050507';
      else if (m.solid[i]) c = m.reserved && m.reserved[i] ? '#3a2a2a' : '#6b6b70';
      else if (m.door[i] >= 0) { const d = m.doors[m.door[i]]; c = d.locked ? '#c33' : d.target ? '#d9a441' : '#9b6a1e'; }
      else if (m.outdoor && m.outdoor[i]) c = '#1f2a1c';
      else c = roomCol(m.rooms[m.room[i]]);
      g.fillStyle = c;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
    g.font = Math.max(8, cell - 2) + 'px monospace';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const k in m.points || {}) { const p = m.points[k]; g.fillRect(p.x * cell - 1, p.y * cell - 1, 2, 2); if (cell >= 9) g.fillText(k.replace(/^pt_/, ''), p.x * cell + 2, p.y * cell - 2); }
    const P = w.player;
    g.fillStyle = '#6f6';
    g.beginPath(); g.arc(P.x * cell, P.y * cell, cell * 0.45, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6f6';
    g.beginPath(); g.moveTo(P.x * cell, P.y * cell); g.lineTo((P.x + Math.cos(P.angle) * 1.4) * cell, (P.y + Math.sin(P.angle) * 1.4) * cell); g.stroke();
    const E = DA.entity && DA.entity.position ? DA.entity.position() : null;
    if (E && E.map === m.id) { g.fillStyle = '#f44'; g.beginPath(); g.arc(E.x * cell, E.y * cell, cell * 0.45, 0, Math.PI * 2); g.fill(); }
    cv.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * m.w, y = ((e.clientY - r.top) / r.height) * m.h;
      DA.modes.pop('debug_map');
      if (e.shiftKey && DA.entity) { DA.entity.spawn({ x, y, map: m.id }); toast('ENTITY'); }
      else { teleport({ x, y, map: m.id }); if (nc.on) { nc.x = w.player.x; nc.y = w.player.y; nc.lx = nc.x; nc.ly = nc.y; } }
    });
  }
  function mapView() {
    if (!DA.modes || !DA.modes.defs.debug_map || !DA.running) return false;
    if (DA.modes.has('debug_map')) DA.modes.pop('debug_map');
    else DA.modes.push('debug_map');
    return true;
  }

  /* ================================================================ keys */
  function onKey(e) {
    if (!DA.debugMode) return;
    const c = e.code;
    if (!/^F(3|4|6|7|8|9|10)$/.test(c)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    switch (c) {
      case 'F4': ui.on = !ui.on; ui.lastT = 0; updateOverlay(); break;
      case 'F6':
        if (!DA.running) break;
        if (e.shiftKey) { DA.addVar('saved', 1); toast('SAVED ' + DA.v('saved') + '  POWER ' + (DA.entity && DA.entity.power ? DA.entity.power() : '?')); }
        else { DA.addVar('instability', 3); toast('INSTABILITY ' + DA.v('instability')); }
        break;
      case 'F7': if (DA.running) giveAll(); break;
      case 'F8': if (DA.running) skip(10, e.shiftKey); break;
      case 'F9': menu(); break;
      case 'F10': if (e.shiftKey) mapView(); else if (DA.running) noclip(); break;
      case 'F3':
        if (!DA.running || !DA.entity) break;
        if (e.shiftKey) { if (!DA.entity.active()) DA.entity.spawn('ahead'); DA.entity.hunt(); toast('ENTITY HUNT'); }
        else if (DA.entity.active()) { DA.entity.despawn(); toast('ENTITY OFF'); }
        else { DA.entity.spawn('ahead'); toast('ENTITY'); }
        break;
      default: break;
    }
  }

  /* ================================================================ lifecycle */
  DA.bus.on('boot', () => {
    if (!DA.debugMode) return;
    DA.modes.register('debug_beats', menuMode);
    DA.modes.register('debug_map', mapMode);
    DA.addSystem('debug_noclip', { update: updateNoclip, order: 11 });
    buildOverlay();
    window.addEventListener('keydown', onKey, true);
    DA.bus.on('frame', updateOverlay);
  });
  DA.bus.on('runtime:reset', () => { if (nc.on) { nc.on = false; } });

  DA.debug = {
    fast, fastSync, waitFor, step, teleport, fire, tune, pick, send, state, screenshotReady, autostart,
    /** Resolves (true/false) once autostart() has finished its jump (immediately for ?autoplay). */
    ready,
    give, giveAll, skip, beats, jump, noclip, menu, map: mapView,
    walk, look, turn, record, events,
    /** DA.entity.powerInfo() (how strong it is tonight). */
    power: () => (DA.entity && DA.entity.powerInfo ? DA.entity.powerInfo() : null),
    flag(k, v) { if (v !== undefined) DA.setFlag(k, v); return DA.flag(k); },
    v(k, n) { if (n != null) DA.addVar(k, n); return DA.v(k); },
    overlay(on) { ui.on = on == null ? !ui.on : !!on; ui.lastT = 0; updateOverlay(); return ui.on; },
    entity: () => (DA.entity && DA.entity.debugInfo ? DA.entity.debugInfo() : null),
    get noclipOn() { return nc.on; },
  };
})();
