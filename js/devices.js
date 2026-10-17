/* DEAD AIR — devices.js
 * DA.devices: the close-up equipment of Relay Station 14 (CCTV bank, landline, county map,
 * shift report, bathroom mirror, staff photo, keypads, tape backup terminal, weather readouts,
 * desk calendar, breaker panel, records shelves) plus the small "doing the job" interactions
 * (coffee, generator, vents, levers). Every device is a mode layered into #screens; its DOM is
 * built on 'boot' and its runtime is rebuilt from DA.state on 'game:new' / 'game:load' /
 * 'game:ready'. Nothing here touches another module at script-load time, and every
 * cross-module call is null-guarded so the file runs alone in dev/devices.html.
 *
 * ── API (PLAN.md §6.7) ─────────────────────────────────────────────────────────────────────
 *   mode        API                                                    presentation
 *   cctv        DA.devices.cctv.open() → Promise (resolves on close)    opaque console
 *   phone       DA.devices.phone.ring() stopRing() isRinging() hangup() overlay, world visible
 *   maplocate   DA.devices.map.open({find}) → Promise<locId|null>      opaque wall map
 *   paperwork   DA.devices.paperwork.open() → Promise<{complete}>      opaque desk
 *   mirror      DA.devices.mirror.open() → Promise                     opaque
 *   photo       DA.devices.photo.open() → Promise                      overlay
 *   keypad      DA.devices.keypad.open({id, code, title}) → Promise<bool>
 *   terminal    DA.devices.terminal.open() → Promise                   opaque CRT
 *   weather     DA.devices.weather.open({source:'mast'|'panel'}) → Promise
 *   calendar    DA.devices.calendar.open() → Promise
 *   breaker     DA.devices.breaker.open() → Promise                    overlay (kind 'breaker')
 *   tapes       DA.devices.tapes.open({tapes}) → Promise               overlay (kind 'tapes')
 *   Interact kinds: cctv phone map paperwork mirror photo keypad terminal weather calendar
 *   coffee breaker generator tapes vent lever.
 *   Events: cctv:open cctv:close cctv:view cctv:figure phone:ring phone:answer phone:hangup
 *   map:located paperwork:done keypad:ok keypad:bad weather:read calendar:flipped coffee:made
 *   breaker:reset generator:toggle tape:found vent:open lever mirror:open photo:view.
 *
 * ── Persistent state ────────────────────────────────────────────────────────────────────────
 *   DA.state.cctv = { on (false → NO SIGNAL), figureStage 0..4, figureSeen, view (0..3), opens,
 *                     keypads: {interactId: true}, paper: {done, sel: {fieldId: option}, remarks,
 *                     signed, mast: {rows, truth, time}, when: {date, time, logged}, filedAt,
 *                     accurate} | null }
 *   flags weather_read {wind, pressure, rain, temp, time, min} and calendar_date;
 *   DA.state.world.breakers {A..F} / opened {ventId} / levers {id}; DA.state.tapes; DA.state.notes.
 *
 * ── ADDITIONS beyond PLAN.md (backwards compatible) ─────────────────────────────────────────
 *   DA.devices.open(name, arg) / close(name, result) / isOpen(name) / names() — generic access.
 *   DA.devices.cctv.close(), .isOpen(), .select(index), .setOn(bool),
 *     .setFigureStage(n) — the director starts (1) / resets (0) the figure sequence.
 *   DA.devices.maplocate — alias of DA.devices.map. map.open() also takes {note} (a pencilled
 *     sticky note on the sheet). With {find}, clicking another marked place pops "<name> — not
 *     it." and keeps the map open; a marker whose `road` is the find target counts as the road.
 *     Reads content maploc kinds road/place/marker/bridge plus 'water' (creeks; valleys are
 *     carved along them) and 'border' (county line), `label` (short map text) and `road`.
 *   DA.devices.phone.answer(), .isUp(), .hold(bool) — while held the player cannot hang up.
 *   DA.devices.weather.values() → {windMph, windDir, pressureIn, rainRate, tempF, sunrise, wind,
 *     pressure, rain, temp} (display strings + numbers).
 *   DA.devices.calendar.date() → the date the desk calendar shows.
 *   DA.devices.coffee.brew(target), .isBrewing().
 *   Events: 'device:open' {name}, 'device:close' {name}, 'note:found' {id, source},
 *     'weather:view' {source} (every readout, including the office panel).
 *   Event payload extras: cctv:open {cam, figureStage}; cctv:view {cam, index}; cctv:figure
 *     {stage, cam}; map:located {id, find}; keypad:ok {id, code}; keypad:bad {id, entered};
 *     paperwork:done {complete, accurate, answers, remarks}; weather:read {source, wind, pressure,
 *     rain, temp, windMph, windDir, pressureIn, rainRate, time, min} (= flag weather_read);
 *     calendar:flipped {date}; phone:hangup {byPlayer}; vent:open {id, note, notes, item};
 *     tape:found {id, label}; coffee:made {id}; mirror:open {stage}.
 *   Interactable data read: keypad {code, door, item, title}; vent {note, notes[], item, doc};
 *     weather {source}; tapes {tapes[]}; map {find}.
 *   Content read (all optional, with fallbacks): content.maplocs, docs.doc_shift_form {title,
 *     body, fields, signLabel, remarks?}, tapes {label, year, desc}, items {name}, notes (via
 *     DA.ui.doc(noteId)), terminal {title, titleTimelines, archiving, busy (status word), empty}, dialogue
 *     thoughts_phone / thoughts_coffee_enough / thoughts_vent_empty / thoughts_vent_dust /
 *     thoughts_keypad_done (fallback lines are built in).
 *   CCTV rendering: cameras sit at cam.z 0.84 with pitch -0.16 (a ceiling mount) unless the world
 *     gives z/pitch; lightScale 1.45 (auto-gain). spr_operator is a seated sprite, so the
 *     present-time "you" appears only when seated at the desk; on CAM2 (−2 min) a past self away
 *     from the desk is drawn as spr_figure walking your route.
 *   Stacking: a device root re-appends itself to #screens when opened and drops beneath any mode
 *     pushed over it (class dv-covered), so e.g. the ui 'choice' shows above the phone.
 *   Prewarm: the county map sheet and mirror layers are built during idle time after 'booted'.
 *
 * ── WAVE-3 ADDITIONS (backwards compatible) ─────────────────────────────────────────────────
 *   CCTV (decision 11): runs on the UPS — dead only when DA.state.cctv.on === false or the world
 *     circuit 'ups' is set false; main power off only raises the cameras' gain and noise. The
 *     abandoned futures (CAM3 +19Y, CAM4 +??Y) are lit by their own light (DA.world.lightAs with
 *     everything off + daylight through the windows / a low-light wash), never tonight's power.
 *     CAM1 (+8 s): DA.entity.predict(8) sprites on the camera's map; with the entity out, small
 *     TRUE futures scheduled while the CCTV is open — a silent lightning flash on the tape and 8 s
 *     later DA.world.lightning(), or the front door blowing open (world door 'front_door' by
 *     'script', ACT 3–4, at most twice a night; the camera shows it 8 s early). DA.devices.cctv.
 *     futures() lists them. Keyboard zoom (Z, +, wheel off the monitor) on a camera with
 *     CAM_INFO.aim swings onto that decal (CAM4 → the 0213 on the west wall). When the figure
 *     sequence shows a new stage, the switcher's motion alarm puts that camera on MONITOR A (LED +
 *     MOTION) and emits cctv:view {cam, index, alarm:true} if it was already there.
 *     cctv:close carries {cam, figureStage, figureViewed} (the figure's camera was on MONITOR A).
 *   Keyboard (decision 14): breaker ↑↓ / Enter (1–6, A–D, F); paperwork ↑↓ / Tab between lines,
 *     ←→ options, Enter/Space circle/tick/sign, S sign, F file; wall map arrows move a pencil
 *     (Shift faster), Enter/Space marks — DA.devices.map.cursor() / .at(locId) (sheet px);
 *     tapes arrows walk the cases, Tab jumps between non-log cases, Enter takes; terminal restore
 *     list numbered like the slots (A = the automatic checkpoint). Device lists select on hover only
 *     after a real pointer move since the device opened.
 *   Keypad: after two wrong codes on an id with a label (key_cabinet: 'CODE = YEAR COMMISSIONED';
 *     interactable data or open({label}) override) a strip of tape shows it; fails persist in
 *     DA.state.cctv.kpFails; keypad:bad carries {fails}.
 *   Mirror: with main power off the reflected room is the blacked-out bathroom (dead tube, the red
 *     emergency lamp over the door), and so is the tiled wall around it.
 *   Weather: the office's Remote Weather Display (linked to MAST 1) is a reading too: after 0.9 s it
 *     emits weather:read {source:'panel', …} and sets flag weather_read (+ source) exactly like the
 *     roof mast ({source:'mast'}); its 'weather:view' also carries the reading. Listeners that
 *     want the roof trip only check source === 'mast' (the director's roof thought does).
 *   Tapes: long spine labels are set smaller (and the longest wrap) so they read in full.
 *   Photo: the print sits high so its typed caption stays clear of the subtitles.
 *
 * ── FIX-D (behaviour; the API is unchanged) ─────────────────────────────────────────────────
 *   Phone: '[phone ringing]' is captioned only within earshot (decision 7) — on the phone's map and
 *     loud enough where the player stands (distance falloff, ×0.55 through walls/doors, as audio.js
 *     attenuates the ring): every 4 s near the phone, every 12 s from afar (the radio desk), never
 *     in the basement, the lot or the array; the first caption comes the moment it becomes audible.
 *   Tape terminal: the OVERWRITE? and RESTORE? confirmations open with NO selected (decision 4); a
 *     reflexive Enter / Space goes back to the list, Y (or selecting YES) confirms.
 *   Paperwork: its small labels, section notes, org line and fine print have an 8 px floor.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;
  const D = (DA.devices = DA.devices || {});
  const TAU = Math.PI * 2;

  /* =========================================================== bridges */
  const errSeen = new Set();
  function warnOnce(tag, e) {
    const k = tag + ':' + (e && e.message);
    if (errSeen.has(k)) return;
    errSeen.add(k);
    console.error('[devices:' + tag + ']', e);
  }
  /** Run a cross-module call; a failure is reported once and never breaks the device. */
  function safe(fn, dflt) {
    try { return fn(); } catch (e) { warnOnce('call', e); return dflt; }
  }
  function sfx(name, opts) {
    if (!DA.audio || !DA.audio.play) return null;
    return safe(() => DA.audio.play(name, opts || {}) || null, null);
  }
  function sfxLoop(name, opts) {
    if (!DA.audio || !DA.audio.loop) return null;
    return safe(() => DA.audio.loop(name, opts || {}) || null, null);
  }
  function stopSnd(h, fade) {
    if (h && h.stop) safe(() => h.stop(fade));
  }
  /** Sound options placed at an interactable's position (non-positional if unknown). */
  function atIt(id, extra) {
    const p = interactPos(id);
    return Object.assign(p ? { x: p.x, y: p.y, map: p.map } : {}, extra || {});
  }
  const ui = {
    think(text) { return DA.ui && DA.ui.think ? safe(() => DA.ui.think(DA.fmt(text)), Promise.resolve()) : Promise.resolve(); },
    toast(text, dur) { if (DA.ui && DA.ui.toast) safe(() => DA.ui.toast(text, dur)); },
    hint(text, dur) { if (DA.ui && DA.ui.hint) safe(() => DA.ui.hint(text, dur)); },
    subtitle(text, opts) { return DA.ui && DA.ui.subtitle ? safe(() => DA.ui.subtitle(text, opts), null) : null; },
    doc(d) { return DA.ui && DA.ui.doc ? safe(() => DA.ui.doc(d), Promise.resolve()) : Promise.resolve(); },
  };
  /** A line from DA.content.dialogue[key] (string | [string] | [{t}]) or the given fallback. */
  function line(key, fallback) {
    const c = DA.content && DA.content.dialogue && DA.content.dialogue[key];
    let t = null;
    if (typeof c === 'string') t = c;
    else if (Array.isArray(c) && c.length) t = typeof c[0] === 'string' ? c[0] : c[0] && c[0].t;
    return DA.fmt(t || fallback);
  }
  const ITEM_NAMES = { mug: 'MUG OF COFFEE', flashlight: 'FLASHLIGHT', key_records: 'RECORDS ROOM KEY', key_antenna: 'ANTENNA CONTROL KEY' };
  function itemName(id) {
    const it = DA.content && DA.content.items && DA.content.items[id];
    const n = (typeof it === 'string' ? it : it && (it.name || it.label)) || ITEM_NAMES[id] || String(id).replace(/_/g, ' ');
    return DA.fmt(n).toUpperCase();
  }
  function point(name) {
    if (!DA.world || !DA.world.point) return null;
    const p = safe(() => DA.world.point(name), null);
    return p && isFinite(p.x) && isFinite(p.y) ? p : null;
  }
  function currentMapId() {
    const w = DA.world;
    return (w && (w.mapId || (w.map && w.map.id))) || 'station';
  }

  /* ============================================================= state */
  /** DA.state.cctv — the devices module's persistent sub-object (plain JSON). */
  function S() {
    let s = DA.state.cctv;
    if (!s || typeof s !== 'object') s = DA.state.cctv = {};
    if (s.on === undefined) s.on = true;
    if (typeof s.figureStage !== 'number') s.figureStage = 0;
    if (typeof s.figureSeen !== 'number') s.figureSeen = 0;
    if (typeof s.view !== 'number') s.view = 0;
    if (typeof s.opens !== 'number') s.opens = 0;
    if (!s.keypads || typeof s.keypads !== 'object') s.keypads = {};
    if (s.paper === undefined) s.paper = null;
    return s;
  }
  /** A sub-object of DA.state.world (breakers / opened / levers), created on demand. */
  function wsub(key) {
    if (!DA.state.world || typeof DA.state.world !== 'object') DA.state.world = {};
    const w = DA.state.world;
    if (!w[key] || typeof w[key] !== 'object') w[key] = {};
    return w[key];
  }

  /* ====================================================== interactables */
  /** Find an interactable definition by id across compiled + defined maps → {it, map} | null. */
  function findInteractable(id) {
    const scan = (list, map) => {
      if (!Array.isArray(list)) return null;
      for (const it of list) if (it && it.id === id) return { it, map };
      return null;
    };
    const w = DA.world;
    let r = null;
    if (w && w.map) r = scan(w.map.interact, currentMapId());
    if (!r && w && w.maps) for (const k in w.maps) if ((r = scan(w.maps[k] && w.maps[k].interact, k))) break;
    const defs = DA.maps && DA.maps.defs;
    if (!r && defs) for (const k in defs) if ((r = scan(defs[k] && defs[k].interact, k))) break;
    return r;
  }
  /** World position of an interactable (face interactables sit just off their wall face). */
  function interactPos(id) {
    const f = findInteractable(id);
    if (!f) return null;
    let x = +f.it.x, y = +f.it.y;
    if (!isFinite(x) || !isFinite(y)) return null;
    const side = f.it.side;
    if (side) {
      x = Math.floor(x) + 0.5;
      y = Math.floor(y) + 0.5;
      const o = 0.55;
      if (side === 'n') y -= o;
      else if (side === 's') y += o;
      else if (side === 'e') x += o;
      else if (side === 'w') x -= o;
    }
    return { x, y, map: f.map };
  }
  /** Normalise whatever DA.interact hands a kind handler into the interactable object. */
  function tgt(a) {
    if (typeof a === 'string') { const f = findInteractable(a); return f ? f.it : { id: a }; }
    if (!a || typeof a !== 'object') return {};
    if (a.target && typeof a.target === 'object') {
      return Object.assign({}, a.target, a.id ? { id: a.id } : null, a.kind ? { kind: a.kind } : null);
    }
    return a;
  }
  /** Kind data may live on the interactable itself or under .data. */
  function val(t, k) {
    if (t && t[k] !== undefined) return t[k];
    if (t && t.data && t.data[k] !== undefined) return t.data[k];
    return undefined;
  }

  /* ========================================================== framework */
  /*
   * A device = {name, spec, root}. spec fields:
   *   opaque, dim (dark vignette backdrop), closable (default true: Esc/E close),
   *   cancel (value/fn resolved when closed without a result), build(root), enter(arg), exit(),
   *   update(dt, isTop), render(isTop), key(e, down) → bool, mouseDown/Up/Move(e), wheel(e),
   *   canClose() → bool, clickOutside (click on the bare backdrop closes).
   * Devices are plain modes, so other modules may also DA.modes.push(name) them directly
   * (the radio desk pushes 'cctv'); all device logic therefore lives in enter()/exit().
   */
  const devs = {};
  function device(name, spec) {
    const dev = { name, spec, root: null, isOpen: false, arg: null, t: 0, resolve: null, promise: null, result: null };
    devs[name] = dev;
    return dev;
  }
  function cancelOf(dev) {
    const c = typeof dev.spec.cancel === 'function' ? dev.spec.cancel() : dev.spec.cancel;
    return c === undefined ? null : c;
  }
  function settle(dev) {
    const r = dev.resolve;
    dev.resolve = null;
    dev.promise = null;
    if (r) r(dev.result);
  }
  /** Open a device (push its mode); resolves with its result when it closes. */
  function openDev(name, arg) {
    const dev = devs[name];
    if (!dev) return Promise.resolve(null);
    if (!DA.modes || !DA.modes.defs[name] || !dev.root) {
      console.warn('[devices] ' + name + ' opened before boot');
      return Promise.resolve(cancelOf(dev));
    }
    if (dev.isOpen) return dev.promise || Promise.resolve(cancelOf(dev));
    dev.result = cancelOf(dev);
    dev.promise = new Promise((res) => (dev.resolve = res));
    const p = dev.promise;
    DA.modes.push(name, arg || {});
    if (!dev.isOpen) settle(dev);
    return p;
  }
  /** Close a device (wherever it is in the mode stack), optionally setting its result. */
  function closeDev(name, result) {
    const dev = devs[name];
    if (!dev) return;
    if (result !== undefined) dev.result = result;
    if (DA.modes && DA.modes.has(name)) DA.modes.pop(name);
    else settle(dev);
  }
  function isKeyClose(e) { return e.code === 'Escape' || e.code === 'KeyE'; }
  /*
   * Hover-to-select only after the pointer really moves since the device opened: a list redrawn
   * (or opened) under a resting cursor must not steal the keyboard selection.
   */
  const PTR = { x: NaN, y: NaN, ax: NaN, ay: NaN, need: false };
  window.addEventListener('mousemove', (e) => {
    PTR.x = e.clientX;
    PTR.y = e.clientY;
    if (PTR.need && (isNaN(PTR.ax) || Math.abs(e.clientX - PTR.ax) + Math.abs(e.clientY - PTR.ay) > 2)) PTR.need = false;
  }, true);
  function armHover() { PTR.need = true; PTR.ax = PTR.x; PTR.ay = PTR.y; }
  function dvHover(elm, fn) {
    const h = (e) => { if (!PTR.need) fn(e); };
    elm.addEventListener('mouseenter', h);
    elm.addEventListener('mousemove', h);
  }

  function buildDevices() {
    const screens = document.getElementById('screens');
    if (!screens) { console.error('[devices] #screens missing'); return; }
    for (const name in devs) {
      const dev = devs[name], sp = dev.spec;
      if (dev.root && dev.root.parentNode) continue;
      const root = U.el('div', { class: 'dv-screen dv-' + name + (sp.dim ? ' dv-dim' : '') + ' hidden', 'data-device': name });
      if (sp.clickOutside) {
        root.addEventListener('click', (e) => { if (e.target === root && dev.isOpen && (!sp.canClose || sp.canClose(e))) closeDev(name); });
      }
      // device buttons never keep keyboard focus (Space/Enter belong to the mode's own keys)
      root.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
      dev.root = root;
      screens.appendChild(root);
      try { sp.build && sp.build(root); } catch (e) { console.error('[devices] build ' + name, e); }
    }
  }
  function registerModes() {
    for (const name in devs) {
      const dev = devs[name], sp = dev.spec;
      DA.modes.register(name, {
        opaque: !!sp.opaque,
        lock: false,
        enter(arg) {
          dev.arg = arg || {};
          dev.t = 0;
          dev.isOpen = true;
          if (!dev.resolve) dev.result = cancelOf(dev);
          armHover();
          if (dev.root) {
            // newest screen on top of whatever other module's screen is showing (radio desk…)
            if (dev.root.parentNode && dev.root.parentNode.lastChild !== dev.root) dev.root.parentNode.appendChild(dev.root);
            dev.root.classList.remove('hidden', 'dv-covered');
          }
          try { sp.enter && sp.enter(dev.arg); } catch (e) { console.error('[devices] enter ' + name, e); }
          DA.bus.emit('device:open', { name });
        },
        exit() {
          dev.isOpen = false;
          try { sp.exit && sp.exit(); } catch (e) { console.error('[devices] exit ' + name, e); }
          if (dev.root) { dev.root.classList.add('hidden'); dev.root.classList.remove('dv-covered'); }
          DA.bus.emit('device:close', { name });
          settle(dev);
        },
        update(dt, isTop) {
          dev.t += dt;
          if (sp.update) sp.update(dt, isTop);
        },
        render(isTop) {
          if (sp.render) sp.render(isTop);
        },
        onKey(e, down) {
          if (sp.key && sp.key(e, down)) return true;
          if (down && isKeyClose(e) && sp.closable !== false) {
            if (!e.repeat && (!sp.canClose || sp.canClose(e))) closeDev(name);
            return true;
          }
          return false;
        },
        onMouseDown(e) { return sp.mouseDown ? !!sp.mouseDown(e) : false; },
        onMouseUp(e) { if (sp.mouseUp) sp.mouseUp(e); },
        onMouseMove(e) { if (sp.mouseMove) sp.mouseMove(e); },
        onWheel(e) { if (sp.wheel) sp.wheel(e); },
        cover(c) {
          // a mode pushed over a device (a choice over the phone…) must draw above it
          if (dev.root) dev.root.classList.toggle('dv-covered', !!c);
          if (sp.cover) sp.cover(c);
        },
      });
    }
  }
  /** Small engraved "E / ESC" reminder in a device's corner. */
  function closeHint(text) {
    return U.el('div', { class: 'dv-close' }, text || 'E / ESC  BACK');
  }
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  /** Mouse position normalised to an element: {x, y} in 0..1 plus inside flag. */
  function relPos(e, el) {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width), y = (e.clientY - r.top) / Math.max(1, r.height);
    return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
  }
  /** Film/CRT grain tile shared by several canvases. */
  let grainTiles = null;
  function grain(n) {
    if (!grainTiles) {
      grainTiles = [];
      for (let k = 0; k < 4; k++) {
        const c = mkCanvas(192, 144), x = c.getContext('2d'), img = x.createImageData(192, 144), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        grainTiles.push(c);
      }
    }
    return grainTiles[(n == null ? (Math.random() * 4) | 0 : n) % 4];
  }
  /** Overlay moving grain on a canvas (alpha = strength, scale = grain size in px). */
  function drawGrain(ctx, w, h, alpha, mode, scale) {
    const sc = scale || 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = mode || 'overlay';
    const pat = ctx.createPattern(grain(), 'repeat');
    ctx.translate(-Math.random() * 190, -Math.random() * 140);
    ctx.scale(sc, sc);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, (w + 200) / sc, (h + 150) / sc);
    ctx.restore();
  }

  /* ================================================================ CCTV */
  /*
   * A 1990s quad switcher: four small CRTs + one large monitor showing the selected camera.
   * Each feed is rendered by DA.render.renderView into a tiny offscreen canvas once per second
   * (staggered, like a real multiplexer), then composited every frame with live snow, a rolling
   * hum bar, scanlines, the on-screen date/time and a vignette. Before `cctv_offsets` every
   * camera shows the present; afterwards each shows its own temporal offset (PLAN §4 ACT 3).
   */
  const CAM_IDS = ['cam_1', 'cam_2', 'cam_3', 'cam_4'];
  const CAM_INFO = {
    cam_1: { n: 1, label: 'FRONT ENTRANCE', off: 8 / 60, offText: '+00:00:08' },
    cam_2: { n: 2, label: 'HALLWAY', off: -2, offText: '-00:02:00' },
    cam_3: { n: 3, label: 'GENERATOR', years: 19, offText: '+19Y', variant: 'abandoned', lightScale: 2.1, ir: 0.8 },
    // aim: where the keyboard zoom (Z / +) points by default — the 0213 sprayed on the west wall
    cam_4: { n: 4, label: 'RADIO ROOM', offText: '+??Y', variant: 'abandoned', daylight: 0.85, lightScale: 2.6, dust: true, glitchDate: true, aim: 'graffiti_code' },
  };
  const FIG_CAM = { 1: 'cam_2', 2: 'cam_2', 3: 'cam_4', 4: 'cam_4' };
  const RT_S = [160, 120], RT_B = [400, 300]; // renderView targets (4:3 CRTs)
  const DP_S = [320, 240], DP_B = [640, 480]; // display canvases
  const GLITCH_DATES = ['27 OCT 2049', '27 OCT 2049', '27 OCT 2049', '27 OCT 20?9', '?? OCT 2049', '00 --- 0000', '27 OCT 1999'];
  const cc = { feeds: [], sel: 0, t: 0, els: null, fx: null, switchT: 0, labelTick: -1, zoom: { k: 1, da: 0, dp: 0 } };
  const ZOOMS = [1, 2, 3.2];

  function ccFx() {
    if (cc.fx) return cc.fx;
    const snow = [];
    for (let k = 0; k < 5; k++) {
      const c = mkCanvas(160, 120), x = c.getContext('2d'), img = x.createImageData(160, 120), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      snow.push(c);
    }
    const scan = mkCanvas(4, 3), sx = scan.getContext('2d');
    sx.fillStyle = 'rgba(0,0,0,0.42)';
    sx.fillRect(0, 2, 4, 1);
    // scanlines + vignette, pre-combined per monitor size
    const vig = (w, h) => {
      const c = mkCanvas(w, h), x = c.getContext('2d');
      x.fillStyle = x.createPattern(scan, 'repeat');
      x.fillRect(0, 0, w, h);
      const g = x.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0.8)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      return c;
    };
    cc.fx = { snow, scan, vigS: vig(DP_S[0], DP_S[1]), vigB: vig(DP_B[0], DP_B[1]) };
    return cc.fx;
  }

  /** The four cameras from DA.world.cameras() (cam_1..cam_4), with safe fallbacks. */
  function ccCams() {
    const list = (DA.world && DA.world.cameras && safe(() => DA.world.cameras(), null)) || [];
    const byId = {}, spare = [];
    for (const c of list) {
      if (!c) continue;
      if (CAM_INFO[c.id]) byId[c.id] = c;
      else spare.push(c);
    }
    return CAM_IDS.map((id) => {
      const c = byId[id] || spare.shift();
      if (c) return Object.assign({}, c, { id });
      return { id, label: CAM_INFO[id].label, map: id === 'cam_3' ? 'basement' : 'station', x: NaN, y: NaN, angle: 0 };
    });
  }
  /**
   * CCTV has power and the system is switched on. Decision 11: the cameras and the switcher run
   * on the station UPS (world circuit 'ups', live unless something sets it false), so they stay
   * up after the generator goes off and through ACT 5. Main power only changes the picture
   * (ccBlackout: the cameras' low-light gain, more noise).
   */
  function ccSignal() {
    if (S().on === false) return false;
    const w = DA.world;
    if (w && w.powerRaw) {
      const p = safe(() => w.powerRaw(), null);
      if (p && p.ups === false) return false;
    }
    return true;
  }
  /** Main power is off: the station is on emergency red and the cameras crank their gain. */
  function ccBlackout() {
    const w = DA.world;
    return !!(w && w.power && safe(() => w.power('main'), true) === false);
  }
  /** The on-screen caption: 'CAM 2  27 OCT 1999  03:14:07' (= now + camera offset). */
  function ccStamp(f, offsets) {
    const n = f.info.n, min = DA.clock.min;
    let date, time;
    if (!offsets) {
      date = DA.clock.date(min);
      time = DA.clock.hhmmss(min);
    } else if (f.info.years) {
      const p = DA.clock.parts(min);
      date = `${U.pad(p.d)} ${p.mon} ${p.y + f.info.years}`;
      time = DA.clock.hhmmss(min);
    } else if (f.info.glitchDate) {
      const r = Math.random();
      date = GLITCH_DATES[(Math.random() * GLITCH_DATES.length) | 0];
      time = r < 0.18 ? '--:--:--' : r < 0.3 ? `${U.pad(Math.random() * 99)}:${U.pad(Math.random() * 99)}:${U.pad(Math.random() * 99)}` : DA.clock.hhmmss(min + 433);
    } else {
      date = DA.clock.date(min + f.info.off);
      time = DA.clock.hhmmss(min + f.info.off);
    }
    return `CAM ${n}  ${date}  ${time}`;
  }
  /** 'FRONT ENTRANCE' — the world's labels may already carry a 'CAM 1 — ' prefix. */
  function camName(f) {
    return String(f.cam.label || f.info.label).toUpperCase().replace(/^CAM\s*\d+\s*[—–-]*\s*/, '') || f.info.label;
  }
  function ccOffText(f) {
    if (f.info.glitchDate) return ['+??Y', '+50Y', '+??Y', 'NULL', '+49Y'][(Math.random() * 5) | 0];
    return f.info.offText;
  }
  /** World angles are radians; tolerate degrees from a definition that slipped through. */
  function rad(a) {
    a = +a || 0;
    return Math.abs(a) > TAU + 0.01 ? (a * Math.PI) / 180 : a;
  }
  /**
   * Where "you" are right now, as the cameras see it. spr_operator is a man seated in the desk
   * chair seen from behind, so the present-time you only appears when seated at the radio desk.
   */
  function ccOperator() {
    const c = point('pt_radio_chair');
    const w = DA.world;
    const atDesk = DA.modes && DA.modes.has && DA.modes.has('radio');
    const near = c && w && w.player && currentMapId() === (c.map || 'station') && U.dist(w.player.x, w.player.y, c.x, c.y) < 1.6;
    return c && (atDesk || near) ? { x: c.x, y: c.y, map: c.map || 'station' } : null;
  }
  /** Idle/walk frame of a 10-frame person sprite (0-3 toward, 4 idle, 5-8 away, 9 idle back). */
  function personFrame(px, py, facing, cam, moving) {
    const fx = Math.cos(rad(facing)), fy = Math.sin(rad(facing));
    const away = fx * (px - cam.x) + fy * (py - cam.y) > 0; // facing the same way the camera looks
    const step = Math.floor(cc.t * 2) % 4;
    return away ? (moving ? 5 + step : 9) : moving ? step : 4;
  }
  /** Extra sprites for one feed: you, your past self, the prediction, the figure, debris. */
  function ccSprites(f, offsets) {
    const s = S(), id = f.cam.id, map = f.cam.map, out = [];
    const add = (p, tex, extra) => {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
      if (p.map && map && p.map !== map) return;
      out.push(Object.assign({ x: p.x, y: p.y, tex }, extra || {}));
    };
    const abandoned = offsets && !!f.info.variant;
    const chair = point('pt_radio_chair');
    if (!abandoned) {
      if (offsets && id === 'cam_2') {
        // two minutes ago: you. Seated if you were at the desk, otherwise a dark shape walking
        // exactly where you walked (the figure on the monitor was always you).
        const h = DA.world && DA.world.history ? safe(() => DA.world.history(120), null) : null;
        const h2 = DA.world && DA.world.history ? safe(() => DA.world.history(119), null) : null;
        const p = h && h.player;
        if (p && isFinite(p.x)) {
          if (chair && U.dist(p.x, p.y, chair.x, chair.y) < 1.6) add({ x: chair.x, y: chair.y, map: chair.map }, 'spr_operator');
          else {
            const q = h2 && h2.player;
            const moving = !!q && U.dist(p.x, p.y, q.x, q.y) > 0.05;
            add({ x: p.x, y: p.y, map: p.map }, 'spr_figure', { frame: personFrame(p.x, p.y, p.angle, f.cam, moving), alpha: 0.92 });
          }
        }
      } else {
        let op = ccOperator();
        if (id === 'cam_4' && s.figureStage >= 3 && chair) op = { x: chair.x, y: chair.y, map: chair.map };
        if (op) add(op, 'spr_operator');
      }
    }
    if (offsets && id === 'cam_1' && DA.entity && DA.entity.predict) {
      const pr = safe(() => DA.entity.predict(8), null);
      for (const e of Array.isArray(pr) ? pr : pr ? [pr] : []) {
        if (!e || !isFinite(e.x)) continue;
        add({ x: e.x, y: e.y, map: e.map }, e.tex || 'spr_entity', {
          scale: e.scale, alpha: e.alpha != null ? e.alpha : 1, ghosts: e.ghosts, frame: e.frame || 0,
        });
      }
    }
    const st = s.figureStage;
    if (st >= 1 && st <= 4 && FIG_CAM[st] === id) {
      const p = point('pt_fig_' + st);
      if (p) add(p, 'spr_figure', { frame: personFrame(p.x, p.y, p.angle, f.cam, false) });
    }
    if (abandoned) {
      // nobody has sat here for a long time
      const anchor = id === 'cam_4' ? chair : point('pt_gen');
      if (anchor) {
        const r = U.mulberry32(U.hash(id + 'debris'));
        if (id === 'cam_4') add({ x: anchor.x + 0.35, y: anchor.y + 0.45, map: anchor.map }, 'spr_chair', { flip: true, frame: 1 });
        for (let i = 0; i < 4; i++) add({ x: anchor.x + (r() - 0.5) * 2.6, y: anchor.y + (r() - 0.5) * 2.6, map: anchor.map }, 'spr_debris');
      }
    }
    return out;
  }
  /**
   * The light of a camera's FUTURE (the abandoned variants): not tonight's lamps or tonight's
   * power, but the dead building — its ambient plus grey daylight through the windows (CAM4, the
   * radio room in 2049) or, below ground with no windows, the flat wash of a camera's low-light
   * gain (CAM3, the generator room in 2018). Cached per map for a few seconds.
   */
  const ccLightCache = {};
  function ccFutureLight(f) {
    const w = DA.world, mapId = f.cam.map;
    if (!w || !w.lightAs || !w.maps || !w.maps[mapId]) return null;
    const key = mapId + '/' + (f.info.daylight ? 'day' : 'ir');
    const c = ccLightCache[key];
    if (c && cc.t - c.t < 6 && c.L.length === w.maps[mapId].w * w.maps[mapId].h) return c.L;
    const dead = { main: false, corridor: false, emergency: false, outdoor: false, array: false, generator: false, radio: false, ups: false };
    const L = safe(() => w.lightAs(mapId, dead), null);
    if (!L) return null;
    const m = w.maps[mapId], win = m.winLight;
    for (let i = 0; i < L.length; i++) {
      if (m.wall && m.wall[i]) continue;
      L[i] = f.info.daylight ? L[i] + 0.24 + (win ? win[i] * 0.55 : 0) : L[i] + (f.info.ir || 0.5);
      if (L[i] > 1.3) L[i] = 1.3;
    }
    ccLightCache[key] = { t: cc.t, L };
    return L;
  }
  function ccOpts(f, offsets) {
    const abandoned = offsets && !!f.info.variant;
    const dark = !abandoned && ccBlackout();
    const o = {
      mapId: f.cam.map,
      monochrome: true,
      // the cameras' auto-gain lifts the dark corners; on the UPS in a blacked-out station it is
      // cranked right up (grainier, but you can still see the hall under the red lamps)
      lightScale: abandoned ? f.info.lightScale || 2 : dark ? 1.8 : 1.45,
      noise: U.clamp(0.12 + DA.v('instability') * 0.02 + (dark ? 0.12 : 0), 0, 0.5),
      variant: abandoned ? f.info.variant : 'normal',
      daylight: abandoned && f.info.daylight ? f.info.daylight : 0,
      sprites: ccSprites(f, offsets),
      providers: !abandoned,
    };
    if (dark) o.minLight = 0.04;
    if (abandoned) {
      const L = ccFutureLight(f);
      if (L) o.light = L;
    }
    return o;
  }
  /** Re-render one feed (its stepped "frame") into its offscreen target. */
  function ccRender(f, big) {
    const offsets = !!DA.flag('cctv_offsets');
    f.signal = ccSignal();
    f.stamp = ccStamp(f, offsets);
    f.osdDirty = true;
    if (!f.signal) return;
    const target = big ? f.srcBig : f.src;
    const opts = ccOpts(f, offsets);
    const cam = f.cam;
    // mounted up by the ceiling, tilted down: the CCTV look
    const camObj = { x: cam.x, y: cam.y, angle: rad(cam.angle), pitch: cam.pitch != null ? cam.pitch : -0.16, z: cam.z != null ? cam.z : 0.84, fov: cam.fov || 82 };
    if (big && cc.zoom.k > 1) {
      camObj.fov /= cc.zoom.k;
      camObj.angle += cc.zoom.da;
      camObj.pitch = U.clamp(camObj.pitch + cc.zoom.dp, -0.6, 0.6);
    }
    let ok = false;
    // CAM1 shows the front door as it will be in 8 s (a foretold gust), then puts it back
    let fut = null, doorRec = null, doorWas = 0;
    if (offsets && f.cam.id === 'cam_1') {
      const now = DA.simTime || 0, shown = now + (f.info.off || 0) * 60;
      fut = ftAt(shown);
      if (FT.ev.some((e) => e.kind === 'door' && !e.cancelled && shown >= e.at && now <= e.at + e.hold + 1.5)) {
        doorRec = DA.world && DA.world.door ? safe(() => DA.world.door(FT_DOOR), null) : null;
        if (doorRec) { doorWas = doorRec.open; doorRec.open = fut.door; }
      }
    }
    if (DA.render && DA.render.renderView && isFinite(cam.x) && isFinite(cam.y)) {
      try {
        DA.render.renderView(target, camObj, opts);
        ok = true;
      } catch (e) { warnOnce('renderView', e); }
    }
    if (doorRec) doorRec.open = doorWas;
    if (!ok) placeholderView(target, f.cam.id, camObj, opts);
    if (fut && fut.flash > 0) {
      // lightning 8 s early: the lot and the sky go white on the tape, and there is no thunder
      const lx = target.getContext('2d');
      lx.save();
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.globalCompositeOperation = 'lighter';
      const g = lx.createLinearGradient(0, 0, 0, target.height);
      g.addColorStop(0, `rgba(235,240,255,${(0.55 * fut.flash).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(220,228,240,${(0.3 * fut.flash).toFixed(3)})`);
      g.addColorStop(1, `rgba(200,205,215,${(0.16 * fut.flash).toFixed(3)})`);
      lx.fillStyle = g;
      lx.fillRect(0, 0, target.width, target.height);
      lx.restore();
    }
    if (offsets && f.info.dust) ccDust(target);
    // cool phosphor tint, baked into the stepped frame
    const tx = target.getContext('2d');
    tx.save();
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.globalCompositeOperation = 'multiply';
    tx.fillStyle = '#cbd8d3';
    tx.fillRect(0, 0, target.width, target.height);
    tx.restore();
    f.osdDirty = true;
    const hasFig = opts.sprites.some((sp) => sp.tex === 'spr_figure');
    if (hasFig && !f.hadFig) f.glitch = Math.max(f.glitch, 0.45);
    f.hadFig = hasFig;
    if (big) f.bigFresh = true;
  }
  /** Daylight dust drifting through the abandoned radio room (drawn into the stepped frame). */
  function ccDust(canvas) {
    const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const r = U.mulberry32((Math.floor(cc.t) * 7919) >>> 0);
    x.save();
    x.globalCompositeOperation = 'lighter';
    const g = x.createLinearGradient(0, 0, w * 0.6, h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(w * 0.02, 0); x.lineTo(w * 0.22, 0); x.lineTo(w * 0.62, h); x.lineTo(w * 0.3, h);
    x.fill();
    for (let i = 0; i < 46; i++) {
      const px = r() * w, py = r() * h, s = 0.4 + r() * 1.1;
      x.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.35})`;
      x.fillRect(px, py, s, s);
    }
    x.restore();
  }
  function ccSnow(ctx, W, H) {
    const s = ccFx().snow[(Math.random() * 5) | 0];
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, -Math.random() * W * 0.4, -Math.random() * H * 0.4, W * 1.45, H * 1.45);
    ctx.imageSmoothingEnabled = true;
  }
  function osdText(ctx, text, x, y, align) {
    ctx.textAlign = align || 'left';
    ctx.lineWidth = Math.max(2, ctx.canvas.height / 110);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#e9f0ea';
    ctx.fillText(text, x, y);
  }
  /** Composite one monitor for this frame. */
  /** The on-screen display (caption + camera name), redrawn only when the stepped frame changes. */
  function ccOSD(f, W, H, isBig) {
    const key = isBig ? 'osdB' : 'osdS';
    let c = f[key];
    if (!c || c.width !== W) c = f[key] = mkCanvas(W, H);
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.font = `${Math.round(H * (isBig ? 0.056 : 0.075))}px VT323, 'DejaVu Sans Mono', monospace`;
    x.textBaseline = 'alphabetic';
    osdText(x, f.stamp, W * 0.045, H * 0.93);
    if (isBig) osdText(x, camName(f) + (cc.zoom.k > 1 ? `   ZOOM ${cc.zoom.k === 2 ? '2' : '3'}×` : ''), W * 0.045, H * 0.1);
    return c;
  }
  /** Composite one monitor for this frame: stepped picture, live snow, hum bar, overlays. */
  function ccDraw(ctx, W, H, f, src, over, isBig) {
    const inst = DA.v('instability');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const switching = isBig && cc.switchT > 0;
    if (!f.signal || switching) {
      ctx.fillStyle = '#050605';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = switching ? 0.9 : 0.75;
      ccSnow(ctx, W, H);
      ctx.globalAlpha = 1;
      if (!f.signal) {
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(W * 0.26, H * 0.42, W * 0.48, H * 0.16);
        ctx.font = `${Math.round(H * 0.1)}px VT323, 'DejaVu Sans Mono', monospace`;
        ctx.textBaseline = 'middle';
        if (Math.floor(cc.t * 1.6) % 2 === 0) osdText(ctx, 'NO SIGNAL', W / 2, H * 0.505, 'center');
      }
    } else {
      ctx.imageSmoothingEnabled = true;
      const jx = f.glitch > 0 ? (Math.random() - 0.5) * W * 0.05 : 0;
      if (jx) { ctx.fillStyle = '#050605'; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(src, jx, 0, W, H);
      // live snow over the stepped picture
      ctx.globalAlpha = U.clamp(0.06 + inst * 0.012 + (f.glitch > 0 ? 0.3 : 0), 0, 0.55);
      ccSnow(ctx, W, H);
      ctx.globalAlpha = 1;
      // horizontal tearing — bands are re-sampled from the stepped source frame; copying the
      // display canvas onto itself forces a full snapshot (measured 40–400 ms per tear)
      if (f.glitch > 0 || Math.random() < 0.006 + inst * 0.002) {
        const n = 1 + ((Math.random() * 3) | 0);
        const sy = src.height / H;
        for (let i = 0; i < n; i++) {
          const y = Math.random() * H, bh = H * (0.02 + Math.random() * 0.07), dx = (Math.random() - 0.5) * W * 0.12;
          ctx.drawImage(src, 0, y * sy, src.width, Math.max(1, bh * sy), dx + jx, y, W, bh);
        }
      }
    }
    // rolling hum bar (mains / frame-rate beat)
    const by = (((cc.t * 0.11 + f.phase * 0.37) % 1.25) - 0.15) * H, bh = H * 0.11;
    const g = ctx.createLinearGradient(0, by - bh, 0, by + bh);
    g.addColorStop(0, 'rgba(230,240,235,0)');
    g.addColorStop(0.5, 'rgba(230,240,235,0.075)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(230,240,235,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, by - bh, W, bh * 2);
    if (f.signal && !switching) {
      const k = isBig ? 'osdB' : 'osdS';
      if (f.osdDirty || !f[k]) ccOSD(f, W, H, isBig);
      ctx.drawImage(f[k], 0, 0);
      if (Math.floor(cc.t * 1.2) % 2 === 0) {
        ctx.fillStyle = '#e9f0ea';
        ctx.beginPath();
        ctx.arc(W * 0.93, H * 0.075, H * 0.016, 0, TAU);
        ctx.fill();
      }
    }
    ctx.drawImage(over, 0, 0, W, H);
  }
  function ccLabels() {
    if (!cc.els) return;
    const offsets = !!DA.flag('cctv_offsets');
    cc.feeds.forEach((f, i) => {
      const m = cc.els.mons[i];
      m.name.textContent = `${f.info.n}  ${camName(f)}`;
      m.off.textContent = offsets ? ccOffText(f) : '';
      m.root.classList.toggle('dv-sel', i === cc.sel);
      cc.els.btns[i].classList.toggle('dv-sel', i === cc.sel);
    });
    const f = cc.feeds[cc.sel];
    if (f) {
      cc.els.bigName.textContent = `CAM ${f.info.n} — ${camName(f)}`;
      cc.els.bigOff.textContent = offsets ? 'OFFSET ' + ccOffText(f) : '';
    }
    cc.els.root.classList.toggle('dv-cc-dead', !ccSignal());
  }
  function ccSelect(i, quiet) {
    i = U.clamp(i | 0, 0, 3);
    if (i !== cc.sel) {
      cc.zoom = { k: 1, da: 0, dp: 0 };
      if (cc.els) cc.els.zoomOut.textContent = '1×';
    }
    const old = cc.feeds[cc.sel];
    if (old) old.bigFresh = false;
    cc.sel = i;
    S().view = i;
    const f = cc.feeds[i];
    if (f) ccRender(f, true);
    cc.switchT = quiet ? 0 : 0.18;
    ccLabels();
    if (!quiet) {
      sfx('switch', { vol: 0.5 });
      DA.bus.emit('cctv:view', { cam: f ? f.cam.id : CAM_IDS[i], index: i });
    }
  }
  /**
   * Channel zoom on the selected camera (the switcher's 2×/3× mode). With a point (-1..1 in the
   * big monitor) the camera also pans/tilts toward it, so a detail can be read.
   */
  /**
   * A camera's point of interest for the keyboard zoom (CAM_INFO.aim): the face of the wall decal
   * whose texture name contains the aim key (maps.js `alt` overrides of the camera's map), the one
   * in front of the lens. → {x, y, z} (z: height of the sprayed code on the wall) or null.
   */
  function ccAimPoint(f) {
    const key = f.info.aim;
    if (!key || !isFinite(f.cam.x)) return null;
    if (f.aimPt !== undefined) return f.aimPt;
    const def = DA.maps && DA.maps.defs && DA.maps.defs[f.cam.map];
    const list = def && Array.isArray(def.alt) ? def.alt : [];
    const ca = rad(f.cam.angle), half = (((f.cam.fov || 82) / 2 + 8) * Math.PI) / 180;
    let best = null, bd = Infinity;
    for (const a of list) {
      if (!a || !String(a.tex || '').includes(key)) continue;
      let x = +a.x + 0.5, y = +a.y + 0.5;
      if (a.side === 'e') x = +a.x + 1.02; else if (a.side === 'w') x = +a.x - 0.02;
      else if (a.side === 's') y = +a.y + 1.02; else if (a.side === 'n') y = +a.y - 0.02;
      const d = Math.hypot(x - f.cam.x, y - f.cam.y);
      let da = Math.atan2(y - f.cam.y, x - f.cam.x) - ca;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > half || d > 30 || d >= bd) continue;
      best = { x, y, z: 0.69 };
      bd = d;
    }
    f.aimPt = best;
    return best;
  }
  function ccZoom(dir, u, v) {
    const f = cc.feeds[cc.sel];
    if (!f) return;
    const idx = ZOOMS.indexOf(cc.zoom.k);
    const next = dir === 'cycle' ? (idx + 1) % ZOOMS.length : U.clamp(idx + dir, 0, ZOOMS.length - 1);
    if (next === idx) return;
    const k = ZOOMS[next];
    const aim = u == null && next > idx ? ccAimPoint(f) : null;
    if (k === 1) cc.zoom = { k: 1, da: 0, dp: 0 };
    else if (aim) {
      // keyboard zoom on a camera with a point of interest: swing the lens onto it (CAM4 → 0213)
      const base = f.cam.pitch != null ? f.cam.pitch : -0.16, z = f.cam.z != null ? f.cam.z : 0.84;
      const d = Math.hypot(aim.x - f.cam.x, aim.y - f.cam.y);
      let da = Math.atan2(aim.y - f.cam.y, aim.x - f.cam.x) - rad(f.cam.angle);
      cc.zoom.da = Math.atan2(Math.sin(da), Math.cos(da));
      cc.zoom.dp = U.clamp(Math.atan2(aim.z - z, d) - base, -0.6, 0.6);
      cc.zoom.k = k;
    } else {
      const fov = (((f.cam.fov || 82) / cc.zoom.k) * Math.PI) / 180;
      if (u != null && next > idx) {
        // centre the clicked point: horizontal by angle, vertical through the renderer's
        // y-shear (horizon = h/2 + tan(pitch)·proj; 4:3 → h/2 = 0.75·w/2)
        const half = Math.tan(fov / 2), base = f.cam.pitch != null ? f.cam.pitch : -0.16;
        cc.zoom.da += Math.atan(u * half);
        cc.zoom.dp = Math.atan(Math.tan(base + cc.zoom.dp) - v * 0.75 * half) - base;
      }
      cc.zoom.k = k;
    }
    sfx('switch', { vol: 0.35, rate: 1.5 });
    cc.switchT = 0.12;
    ccRender(f, true);
    if (cc.zoom.k > 1) ccRender(f, false);
    f.osdDirty = true;
    cc.els.zoomOut.textContent = cc.zoom.k === 1 ? '1×' : cc.zoom.k === 2 ? '2×' : '3×';
  }
  function ccBigPoint(e) {
    const p = relPos(e, cc.els.bigCanvas);
    return p.inside ? { u: p.x * 2 - 1, v: p.y * 2 - 1 } : null;
  }
  function ccBuild(root) {
    const mons = [], btns = [];
    const quad = U.el('div', { class: 'dv-cc-quad' });
    for (let i = 0; i < 4; i++) {
      const canvas = U.el('canvas', { width: DP_S[0], height: DP_S[1] });
      const name = U.el('span', { class: 'dv-cc-name' }), off = U.el('span', { class: 'dv-cc-off' });
      const mon = U.el('div', { class: 'dv-cc-mon', onclick: () => ccSelect(i) },
        U.el('div', { class: 'dv-cc-glass' }, canvas, U.el('div', { class: 'dv-cc-sheen' })),
        U.el('div', { class: 'dv-cc-plate' }, U.el('span', { class: 'dv-cc-led' }), name, off));
      quad.appendChild(mon);
      mons.push({ root: mon, canvas, name, off, ctx: canvas.getContext('2d') });
      btns.push(U.el('button', { class: 'dv-cc-btn', onclick: () => ccSelect(i) }, U.el('span', { class: 'dv-cc-btnled' }), String(i + 1)));
    }
    const bigCanvas = U.el('canvas', { width: DP_B[0], height: DP_B[1] });
    const bigName = U.el('span', { class: 'dv-cc-bigname' }), bigOff = U.el('span', { class: 'dv-cc-bigoff' });
    const main = U.el('div', { class: 'dv-cc-main' },
      U.el('div', { class: 'dv-cc-bigmon' },
        U.el('div', { class: 'dv-cc-glass' }, bigCanvas, U.el('div', { class: 'dv-cc-sheen' })),
        U.el('div', { class: 'dv-cc-mainhead' }, U.el('span', { class: 'dv-cc-led dv-on' }), U.el('span', { class: 'dv-cc-tag' }, 'MONITOR A'), bigName, bigOff)));
    const zoomOut = U.el('span', { class: 'dv-cc-zoomval' }, '1×');
    const panel = U.el('div', { class: 'dv-cc-panel' },
      U.el('div', { class: 'dv-cc-brand' }, U.el('b', null, 'VIDEOTRAC'), ' QS-4 QUAD SWITCHER'),
      U.el('div', { class: 'dv-cc-btns' }, btns),
      U.el('div', { class: 'dv-cc-zoom' },
        U.el('span', { class: 'dv-cc-zoomlbl' }, 'ZOOM'),
        U.el('button', { class: 'dv-cc-btn dv-cc-small', onclick: () => ccZoom(-1) }, '−'),
        zoomOut,
        U.el('button', { class: 'dv-cc-btn dv-cc-small', onclick: () => ccZoom(1) }, '+')),
      U.el('div', { class: 'dv-cc-help' }, '1–4 SELECT  ·  Z / WHEEL ZOOM  ·  E / ESC BACK'));
    const top = U.el('div', { class: 'dv-cc-top' },
      U.el('span', null, 'RELAY STATION 14  ·  SURVEILLANCE'),
      U.el('span', { class: 'dv-cc-rec' }, U.el('i'), 'TIME-LAPSE  1 FPS'));
    root.appendChild(U.el('div', { class: 'dv-cc-console' }, top, quad, main, panel));
    const bigCtx = bigCanvas.getContext('2d');
    cc.els = { root, mons, btns, bigCanvas, bigCtx, bigName, bigOff, zoomOut };
    bigCanvas.addEventListener('click', (e) => {
      const p = ccBigPoint(e);
      if (!p) return;
      if (cc.zoom.k === ZOOMS[ZOOMS.length - 1]) ccZoom(-9);
      else ccZoom(1, p.u, p.v);
    });
  }
  function ccBuildFeeds() {
    const cams = ccCams();
    cc.feeds = cams.map((cam, i) => {
      const m = cc.els.mons[i];
      const old = cc.feeds[i];
      return {
        index: i, cam, info: CAM_INFO[cam.id],
        src: (old && old.src) || mkCanvas(RT_S[0], RT_S[1]),
        srcBig: (old && old.srcBig) || mkCanvas(RT_B[0], RT_B[1]),
        ctx: m.ctx,
        phase: [0, 0.27, 0.51, 0.76][i], tick: null, glitch: 0, signal: true, stamp: '', bigFresh: false, hadFig: false,
      };
    });
  }
  /* ---- CAM1 (+8 s) foretells. With the entity out, CAM1 draws DA.entity.predict(8); without it,
   * small true futures: a flash of lightning over the lot with no thunder (8 s later the real
   * strike, DA.world.lightning), or the front door blowing open in the storm (8 s later it does,
   * DA.world.openDoor/closeDoor, by 'script'). Scheduled while the CCTV is open; the real half
   * runs on DA.timers, so it comes true even if you look away. */
  const FT = { ev: [], next: 0, doors: 0 };
  const FT_DOOR = 'front_door';
  function ftReset() { FT.ev = []; FT.next = 0; FT.doors = 0; }
  function ftEntityOut() { return !!(DA.entity && DA.entity.active && safe(() => DA.entity.active(), false)); }
  function ftDoorOk() {
    const w = DA.world;
    const d = w && w.door ? safe(() => w.door(FT_DOOR), null) : null;
    if (!d || d.locked || d.target !== 0 || d.open > 0.05) return false;
    const P = w.player, dp = interactPos(FT_DOOR) || { x: d.x + 0.5, y: d.y + 0.5, map: 'station' };
    if (currentMapId() === 'station' && P && U.dist(P.x, P.y, (d.x | 0) + 0.5, (d.y | 0) + 0.5) < 4.5) return false;
    return !!dp;
  }
  function ftStormy() {
    const wt = DA.state.world && DA.state.world.weather;
    return !wt || (+wt.thunder || 0) > 0.05 || (+wt.rain || 0) > 0.35;
  }
  function ftPlan() {
    const now = DA.simTime || 0;
    if (!DA.flag('cctv_offsets') || ftEntityOut() || now < FT.next || FT.ev.some((e) => !e.over)) return;
    const act = DA.state.act | 0;
    const door = FT.doors < 2 && act >= 3 && act <= 4 && ftDoorOk() && (!ftStormy() || Math.random() < 0.4);
    if (!door && !ftStormy()) { FT.next = now + 20; return; }
    const at = now + 8 + U.rand(0.6, 2.4); // CAM1 shows it in 0.6–2.4 s; it happens 8 s after that
    const e = door ? { kind: 'door', at, hold: U.rand(4.5, 6.5) } : { kind: 'lightning', at, strength: U.rand(0.75, 1) };
    FT.ev.push(e);
    FT.next = at + U.rand(22, 40);
    if (door) FT.doors++;
    const sess = DA.session;
    DA.timers.after(at - now, () => {
      if (DA.session !== sess) return;
      if (e.kind === 'lightning') {
        if (DA.world && DA.world.lightning) safe(() => DA.world.lightning(e.strength));
        e.over = true;
        return;
      }
      // the future can still change: nobody opens a door the entity or the player is standing at
      if (ftEntityOut() || !ftDoorOk()) { e.cancelled = true; e.over = true; return; }
      safe(() => DA.world.openDoor(FT_DOOR));
      sfx('wind_gust', atIt(FT_DOOR, { vol: 0.9 }));
      DA.timers.after(e.hold, () => {
        if (DA.session !== sess) return;
        const d = safe(() => DA.world.door(FT_DOOR), null);
        if (d && d.by === 'script' && d.target === 1) safe(() => DA.world.closeDoor(FT_DOOR));
        sfx('door_close', atIt(FT_DOOR, { vol: 1.1 }));
        e.over = true;
      }, 'dv_foretell');
    }, 'dv_foretell');
  }
  /** What CAM1 shows of the planned futures at `shown` (= now + 8 s): {door: open amount, flash}. */
  function ftAt(shown) {
    let door = 0, flash = 0;
    for (const e of FT.ev) {
      if (e.cancelled) continue;
      const t = shown - e.at;
      if (e.kind === 'lightning' && t >= 0 && t < 1.1) flash = Math.max(flash, e.strength * (t < 0.25 ? 1 : 1 - (t - 0.25) / 0.85));
      if (e.kind === 'door' && t >= 0 && t < e.hold + 1) door = Math.max(door, t < 0.9 ? t / 0.9 : t > e.hold ? 1 - (t - e.hold) : 1);
    }
    return { door: U.clamp(door, 0, 1) * 0.9, flash: U.clamp(flash, 0, 1) };
  }
  /** Force a fresh CAM1 frame when one of its futures starts or changes (1 fps would miss it). */
  function ftTick() {
    const f = cc.feeds[0];
    if (!f || !DA.flag('cctv_offsets')) return;
    const now = DA.simTime || 0;
    for (const e of FT.ev) {
      if (e.cancelled) continue;
      const marks = e.kind === 'door' ? [0, 0.45, 0.9, e.hold, e.hold + 0.5, e.hold + 1] : [0, 0.5];
      e.mk = e.mk || 0;
      while (e.mk < marks.length && now + 8 >= e.at + marks[e.mk]) {
        e.mk++;
        f.tick = null;
        if (e.mk === 1) f.glitch = Math.max(f.glitch, 0.25);
      }
    }
    FT.ev = FT.ev.filter((e) => !(e.over && now > e.at + (e.hold || 0) + 3));
  }

  /** The multiplexer's motion alarm: a camera picked something up (LED + MOTION for 3.5 s). */
  function ccAlarm(i) {
    cc.alarm = { i, t: 3.5 };
    cc.els.mons.forEach((m, k) => m.root.classList.toggle('dv-alarm', k === i));
    cc.els.btns.forEach((b, k) => b.classList.toggle('dv-alarm', k === i));
    sfx('beep', { vol: 0.25, rate: 1.4 });
  }
  function ccAlarmClear() {
    cc.alarm = null;
    if (!cc.els) return;
    cc.els.mons.forEach((m) => m.root.classList.remove('dv-alarm'));
    cc.els.btns.forEach((b) => b.classList.remove('dv-alarm'));
  }

  function ccEnter() {
    const s = S();
    s.opens++;
    // each time you look away and back, it is closer (PLAN §4 ACT 3)
    if (s.figureStage > 0 && s.figureStage < 4 && s.figureSeen >= s.figureStage) s.figureStage++;
    cc.t = 0;
    cc.zoom = { k: 1, da: 0, dp: 0 };
    if (cc.els) cc.els.zoomOut.textContent = '1×';
    cc.figViewed = false;
    ccAlarmClear();
    for (const k in ccLightCache) delete ccLightCache[k]; // cc.t restarts: rebuild the futures' light
    const now = DA.simTime || 0;
    FT.next = Math.max(FT.next, now + 1.5);
    ccBuildFeeds();
    cc.sel = U.clamp(s.view | 0, 0, 3);
    cc.feeds.forEach((f) => {
      f.tick = Math.floor(cc.t + f.phase);
      ccRender(f, f.index === cc.sel);
    });
    cc.switchT = 0;
    cc.labelTick = -1;
    ccLabels();
    sfx('switch', { vol: 0.6 });
    sfx('static_burst', { vol: 0.15 });
    DA.bus.emit('cctv:open', { cam: CAM_IDS[cc.sel], figureStage: s.figureStage });
  }
  function ccUpdate(dt) {
    cc.t += dt;
    if (cc.switchT > 0) cc.switchT -= dt;
    const s = S();
    if (s.figureStage > 0 && s.figureStage <= 4 && s.figureSeen !== s.figureStage) {
      s.figureSeen = s.figureStage;
      for (const f of cc.feeds) f.tick = null; // show it now
      const camId = FIG_CAM[s.figureStage];
      DA.bus.emit('cctv:figure', { stage: s.figureStage, cam: camId });
      // motion alarm: the camera that picked it up is switched to MONITOR A (a figure in a
      // 160-px thumbnail is too easy to miss)
      const i = CAM_IDS.indexOf(camId);
      if (i >= 0) {
        ccAlarm(i);
        if (i !== cc.sel) ccSelect(i);
        else DA.bus.emit('cctv:view', { cam: camId, index: i, alarm: true });
      }
    }
    if (s.figureStage > 0 && s.figureStage <= 4 && CAM_IDS[cc.sel] === FIG_CAM[s.figureStage] && cc.switchT <= 0) cc.figViewed = true;
    if (cc.alarm && (cc.alarm.t -= dt) <= 0) ccAlarmClear();
    ftPlan();
    ftTick();
    for (const f of cc.feeds) {
      if (f.glitch > 0) f.glitch -= dt;
      const k = Math.floor(cc.t + f.phase);
      if (k !== f.tick) {
        f.tick = k;
        ccRender(f, f.index === cc.sel);
        if (f.index === cc.sel && cc.zoom.k > 1) ccRender(f, false);
      }
    }
    const lt = Math.floor(cc.t);
    if (lt !== cc.labelTick) {
      cc.labelTick = lt;
      ccLabels();
    }
  }
  function ccDrawAll() {
    if (!cc.els) return;
    const fx = ccFx();
    for (const f of cc.feeds) {
      const src = f.index === cc.sel && f.bigFresh && cc.zoom.k === 1 ? f.srcBig : f.src;
      ccDraw(f.ctx, DP_S[0], DP_S[1], f, src, fx.vigS, false);
    }
    const f = cc.feeds[cc.sel];
    if (f) ccDraw(cc.els.bigCtx, DP_B[0], DP_B[1], f, f.bigFresh ? f.srcBig : f.src, fx.vigB, true);
    for (const q of cc.feeds) q.osdDirty = false;
  }

  device('cctv', {
    opaque: true,
    build: ccBuild,
    enter: ccEnter,
    exit() {
      sfx('switch', { vol: 0.4 });
      ccAlarmClear();
      const s = S();
      // figureViewed: the figure's camera was on MONITOR A at some point during this look
      DA.bus.emit('cctv:close', { cam: CAM_IDS[cc.sel], figureStage: s.figureStage, figureViewed: !!cc.figViewed });
    },
    update: ccUpdate,
    render: ccDrawAll,
    key(e, down) {
      if (!down) return false;
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) { ccSelect(+m[1] - 1); return true; }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { ccSelect((cc.sel + 1) % 4); return true; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { ccSelect((cc.sel + 3) % 4); return true; }
      if (e.code === 'KeyZ' && !e.repeat) { ccZoom('cycle'); return true; }
      if ((e.code === 'Equal' || e.code === 'NumpadAdd') && !e.repeat) { ccZoom(1); return true; }
      if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && !e.repeat) { ccZoom(-1); return true; }
      return false;
    },
    wheel(e) {
      const now = performance.now();
      if (now - (cc.wheelT || 0) < 180) return; // one notch per zoom step
      cc.wheelT = now;
      const p = ccBigPoint(e);
      if (e.deltaY < 0) ccZoom(1, p ? p.u : null, p ? p.v : null);
      else if (e.deltaY > 0) ccZoom(-1);
    },
  });
  D.cctv = {
    open: () => openDev('cctv'),
    close: () => closeDev('cctv'),
    isOpen: () => devs.cctv.isOpen,
    select: (i) => { if (devs.cctv.isOpen) ccSelect(i); else S().view = U.clamp(i | 0, 0, 3); },
    /** Zoom the selected channel: dir ±1 or 'cycle'; optional aim point u, v in -1..1. */
    zoom: (dir, u, v) => { if (devs.cctv.isOpen) ccZoom(dir, u, v); },
    /** Director: start/advance/reset the figure sequence (0 = none, 1..4). */
    setFigureStage(n) {
      const s = S();
      s.figureStage = U.clamp(n | 0, 0, 4);
      if (s.figureStage === 0) s.figureSeen = 0;
    },
    setOn(on) { S().on = !!on; },
    /** CAM1's planned futures (tests / dev tools): [{kind, at (simTime it happens), hold?, over?}]. */
    futures: () => FT.ev.map((e) => Object.assign({}, e)),
  };

  /* ----------------------------------------------- placeholder renderer */
  /**
   * Without DA.render: a crude one-point-perspective room in greys with the requested sprites
   * projected as silhouettes, so the CCTV (and its figure sequence) still reads.
   */
  function placeholderView(canvas, key, cam, opts) {
    const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const rnd = U.mulberry32(U.hash(key));
    const ab = opts.variant === 'abandoned', day = opts.daylight || 0;
    const lum = (v, a) => {
      const c = Math.round(U.clamp(v * (ab ? 0.72 : 1) + day * 70, 0, 255));
      return a == null ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
    };
    const poly = (pts, fill) => {
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.closePath();
      x.fillStyle = fill;
      x.fill();
    };
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    const vx = w * (0.4 + rnd() * 0.2), vy = h * 0.45;
    const bw = w * (0.2 + rnd() * 0.14), bh = h * 0.34;
    const bx0 = vx - bw / 2, bx1 = vx + bw / 2, by0 = vy - bh * 0.55, by1 = vy + bh * 0.45;
    poly([[0, 0], [w, 0], [bx1, by0], [bx0, by0]], lum(34));
    poly([[0, h], [w, h], [bx1, by1], [bx0, by1]], lum(72));
    poly([[0, 0], [bx0, by0], [bx0, by1], [0, h]], lum(56));
    poly([[w, 0], [bx1, by0], [bx1, by1], [w, h]], lum(46));
    x.fillStyle = lum(64);
    x.fillRect(bx0, by0, bw, by1 - by0);
    const dw = bw * 0.26, dx = bx0 + bw * (0.12 + rnd() * 0.55);
    x.fillStyle = lum(26);
    x.fillRect(dx, by1 - bh * 0.64, dw, bh * 0.64);
    // floor seams converging on the vanishing point
    x.strokeStyle = lum(52, 0.8);
    x.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      x.beginPath();
      x.moveTo(vx + (i * bw) / 10, by1);
      x.lineTo(w / 2 + (i * w) / 4, h);
      x.stroke();
    }
    // ceiling fixture
    x.fillStyle = lum(day > 0.3 ? 90 : 210, 0.9);
    x.fillRect(vx - bw * 0.3, by0 - h * 0.1, bw * 0.6, h * 0.025);
    if (ab) {
      for (let i = 0; i < 14; i++) {
        x.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.2})`;
        x.beginPath();
        x.ellipse(rnd() * w, rnd() * h * 0.7, 3 + rnd() * 14, 2 + rnd() * 9, 0, 0, TAU);
        x.fill();
      }
    }
    if (day > 0) {
      const g = x.createLinearGradient(0, 0, w * 0.5, h);
      g.addColorStop(0, `rgba(255,255,255,${0.25 * day})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    // sprites
    if (isFinite(cam.x) && isFinite(cam.y)) {
      const fovR = ((cam.fov || 80) * Math.PI) / 180, focal = w / 2 / Math.tan(fovR / 2);
      const ca = Math.cos(cam.angle || 0), sa = Math.sin(cam.angle || 0);
      const list = (opts.sprites || []).map((s) => {
        const dx = s.x - cam.x, dy = s.y - cam.y;
        return { s, fwd: dx * ca + dy * sa, rt: -dx * sa + dy * ca };
      }).filter((o) => o.fwd > 0.25).sort((a, b) => b.fwd - a.fwd);
      for (const o of list) {
        const sx = w / 2 + (o.rt / o.fwd) * focal;
        const floorY = h / 2 + (0.5 * focal) / o.fwd;
        const hgt = ((o.s.scale || 1) * focal) / o.fwd;
        silhouette(x, sx, floorY, hgt, o.s.tex, o.s.alpha == null ? 1 : o.s.alpha);
      }
    }
    x.restore();
  }
  function silhouette(x, cx, footY, hgt, tex, alpha) {
    x.save();
    x.globalAlpha = alpha;
    const person = /operator|figure|entity|hollis|replacement/.test(String(tex));
    if (!person) {
      x.fillStyle = 'rgba(20,20,20,0.85)';
      x.fillRect(cx - hgt * 0.4, footY - hgt, hgt * 0.8, hgt);
      x.restore();
      return;
    }
    const fig = /figure|entity/.test(String(tex));
    x.fillStyle = fig ? '#050505' : '#1b1b1b';
    if (fig) x.filter = 'blur(0.6px)';
    const hw = hgt * (fig ? 0.17 : 0.2), hr = hgt * 0.085;
    x.beginPath();
    x.moveTo(cx - hw, footY);
    x.lineTo(cx - hw * 1.05, footY - hgt * 0.72);
    x.quadraticCurveTo(cx - hw, footY - hgt * 0.84, cx - hw * 0.35, footY - hgt * 0.84);
    x.lineTo(cx + hw * 0.35, footY - hgt * 0.84);
    x.quadraticCurveTo(cx + hw, footY - hgt * 0.84, cx + hw * 1.05, footY - hgt * 0.72);
    x.lineTo(cx + hw, footY);
    x.closePath();
    x.fill();
    x.beginPath();
    x.ellipse(cx, footY - hgt + hr, hr * 0.85, hr, 0, 0, TAU);
    x.fill();
    if (!fig) {
      x.fillStyle = 'rgba(160,160,160,0.35)';
      x.beginPath();
      x.ellipse(cx, footY - hgt + hr * 0.9, hr * 0.6, hr * 0.7, 0, 0, TAU);
      x.fill();
    }
    x.restore();
  }

  /* =============================================================== PHONE */
  /*
   * The office landline. It almost never rings. While ringing: a positional loop at the phone
   * plus a periodic [phone ringing] caption. Answering pushes the non-opaque 'phone' overlay
   * (handset close-up, LINE 1 lamp) and emits phone:answer; the director then scripts the call
   * with DA.ui.say / DA.ui.choice (a 'choice' mode above us is left alone).
   */
  const ph = { ringing: false, loop: null, held: false, session: -1, quiet: false, capT: 99 };
  /*
   * [phone ringing] only within earshot (decisions 7/23): on the phone's own map, and loud enough
   * where the player stands — distance falloff with walls/doors in between, the way audio.js
   * attenuates the ring (1 / (1 + 0.08 d²), ×0.55 occluded). Near the phone the caption repeats
   * every 4 s; further off (the radio desk, the far end of the building) only every 12 s, so a
   * distant ring never floods the subtitle band. Nothing in the basement, outside the lot or in the
   * array. Without a world (dev page) it always captions.
   */
  const PHONE_EARSHOT = 0.03, PHONE_NEAR = 0.12;
  function phoneAudibility() {
    const W = DA.world;
    const P = W && W.player;
    const p = interactPos('phone');
    if (!W || !P || !p) return 1;
    if (currentMapId() !== p.map) return 0;
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    let g = 1 / (1 + 0.08 * d * d);
    if (d > 0.8 && typeof W.lineOfSight === 'function' && !safe(() => W.lineOfSight(P.x, P.y, p.x, p.y, p.map), true)) g *= 0.55;
    return g;
  }
  /** Called once per second while ringing (and once at the first ring). */
  function phoneRingCaption() {
    if (!ph.ringing) return;
    const g = phoneAudibility();
    ph.capT += 1;
    if (g < PHONE_EARSHOT) { ph.capT = 99; return; } // out of earshot: caption the moment it is heard
    if (ph.capT >= (g >= PHONE_NEAR ? 4 : 12)) {
      ph.capT = 0;
      ui.subtitle('[phone ringing]', { kind: 'sfx', dur: 2.6 });
    }
  }
  device('phone', {
    opaque: false,
    build(root) {
      root.appendChild(U.el('div', { class: 'dv-ph-shade' }));
      root.appendChild(U.el('div', { class: 'dv-ph-base' },
        U.el('div', { class: 'dv-ph-lamps' },
          U.el('span', { class: 'dv-ph-lamp dv-on' }), U.el('span', { class: 'dv-ph-lbl' }, 'LINE 1'),
          U.el('span', { class: 'dv-ph-lamp' }), U.el('span', { class: 'dv-ph-lbl' }, 'LINE 2'),
          U.el('span', { class: 'dv-ph-lamp dv-hold' }), U.el('span', { class: 'dv-ph-lbl' }, 'HOLD'))));
      root.appendChild(U.el('div', { class: 'dv-ph-handset', html: PHONE_SVG }));
      root.appendChild(U.el('div', { class: 'dv-ph-hint' }, 'ON THE LINE  ·  E / ESC  HANG UP'));
    },
    enter() {
      ph.session = DA.session;
      ph.quiet = false;
      devs.phone.root.classList.toggle('dv-held', ph.held);
    },
    exit() {
      // exit also runs when a load/new game clears the stack: stay silent then
      if (ph.quiet || DA.session !== ph.session) return;
      sfx('phone_hangup');
      DA.bus.emit('phone:hangup', { byPlayer: !!ph.byPlayer });
      ph.byPlayer = false;
    },
    canClose() {
      if (ph.held) return false;
      ph.byPlayer = true;
      return true;
    },
  });
  D.phone = {
    ring() {
      if (ph.ringing || DA.modes.has('phone')) return;
      ph.ringing = true;
      ph.loop = sfxLoop('phone_ring', atIt('phone'));
      ph.capT = 99;
      phoneRingCaption();
      DA.timers.every(1, phoneRingCaption, 'dv_phone_ring');
      DA.bus.emit('phone:ring', {});
    },
    stopRing() {
      if (!ph.ringing) return;
      ph.ringing = false;
      stopSnd(ph.loop, 0.04);
      ph.loop = null;
      DA.timers.cancelTag('dv_phone_ring');
    },
    isRinging: () => ph.ringing,
    isUp: () => !!(DA.modes && DA.modes.has('phone')),
    /** Pick up (what interacting with a ringing phone does). */
    answer() {
      if (DA.modes.has('phone')) return;
      D.phone.stopRing();
      sfx('phone_pickup', atIt('phone'));
      openDev('phone');
      DA.bus.emit('phone:answer', {});
    },
    hangup() {
      D.phone.stopRing();
      if (DA.modes.has('phone')) closeDev('phone');
    },
    /** While held the player cannot hang up (the director keeps the line open). */
    hold(b) {
      ph.held = !!b;
      if (devs.phone.root) devs.phone.root.classList.toggle('dv-held', ph.held);
    },
  };
  const PHONE_SVG = `<svg viewBox="0 0 300 520" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="dvPhG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0b0c0c"/><stop offset=".35" stop-color="#2a2c2b"/>
      <stop offset=".55" stop-color="#1c1e1d"/><stop offset="1" stop-color="#070808"/></linearGradient>
    <radialGradient id="dvPhR" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#3b3e3c"/><stop offset="1" stop-color="#0d0e0e"/></radialGradient>
  </defs>
  <path d="M150 505 C 120 470, 185 450, 150 420 C 115 392, 185 372, 152 344" fill="none" stroke="#121312" stroke-width="12" stroke-linecap="round"/>
  <path d="M150 505 C 120 470, 185 450, 150 420 C 115 392, 185 372, 152 344" fill="none" stroke="#2c2e2d" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>
  <path d="M92 40 C 70 44, 58 70, 62 104 L 72 160 C 80 200, 100 220, 112 250 L 128 300 C 136 330, 150 346, 176 346
           C 212 346, 236 322, 238 290 L 240 250 C 238 228, 222 214, 204 210 C 190 206, 178 196, 170 176
           L 150 118 C 142 94, 150 76, 164 66 C 176 58, 176 40, 160 34 C 140 28, 112 34, 92 40 Z" fill="url(#dvPhG)"/>
  <ellipse cx="118" cy="66" rx="58" ry="40" fill="url(#dvPhR)" transform="rotate(-14 118 66)"/>
  <ellipse cx="206" cy="282" rx="52" ry="46" fill="url(#dvPhR)"/>
  <g fill="#050505" opacity=".85">
    <circle cx="112" cy="62" r="3"/><circle cx="124" cy="58" r="3"/><circle cx="104" cy="72" r="3"/><circle cx="118" cy="72" r="3"/><circle cx="130" cy="68" r="3"/><circle cx="112" cy="82" r="3"/><circle cx="124" cy="80" r="3"/>
    <circle cx="206" cy="282" r="3"/><circle cx="194" cy="276" r="3"/><circle cx="218" cy="276" r="3"/><circle cx="198" cy="292" r="3"/><circle cx="214" cy="292" r="3"/><circle cx="206" cy="268" r="3"/><circle cx="206" cy="296" r="3"/>
  </g>
  <path d="M96 48 C 84 60, 80 86, 88 112" fill="none" stroke="#5b5f5c" stroke-width="3" opacity=".35" stroke-linecap="round"/>
  <path d="M118 160 C 130 200, 146 250, 160 300" fill="none" stroke="#6a6f6c" stroke-width="4" opacity=".22" stroke-linecap="round"/>
</svg>`;

  /* ============================================================== KEYPAD */
  /*
   * Brushed-steel access keypad: 0-9, CLR, ENT and a 4-digit red seven-segment LED.
   * keypad.open({id, code, title, label}) → Promise<bool>. Wrong codes flash 'Err' and clear; the
   * second wrong code reveals the label taped inside the door (KEYPAD_LABELS / label).
   */
  const SEG = (() => {
    const hz = (cx, cy) => `${cx - 13},${cy} ${cx - 10},${cy - 3.2} ${cx + 10},${cy - 3.2} ${cx + 13},${cy} ${cx + 10},${cy + 3.2} ${cx - 10},${cy + 3.2}`;
    const vt = (cx, cy) => `${cx},${cy - 14} ${cx + 3.2},${cy - 11} ${cx + 3.2},${cy + 11} ${cx},${cy + 14} ${cx - 3.2},${cy + 11} ${cx - 3.2},${cy - 11}`;
    return { a: hz(22, 6), b: vt(37, 21.5), c: vt(37, 54.5), d: hz(22, 70), e: vt(7, 54.5), f: vt(7, 21.5), g: hz(22, 38) };
  })();
  const SEG_CHARS = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    '-': 'g', _: 'd', E: 'afged', r: 'eg', o: 'cdeg', O: 'abcdef', P: 'abefg', n: 'ceg', ' ': '',
  };
  function segDigit() {
    const polys = Object.keys(SEG).map((k) => `<polygon data-s="${k}" points="${SEG[k]}"/>`).join('');
    return U.el('span', { class: 'dv-kp-dig', html: `<svg viewBox="-2 -2 48 80">${polys}</svg>` });
  }
  const kp = { els: null, entered: '', len: 4, code: '', id: null, lockT: 0, state: '', flashT: 0, label: '' };
  /*
   * The label someone taped inside the cabinet door, for whoever forgets. It shows once you have
   * got the code wrong twice (DA.state.cctv.kpFails[id], persisted); interactable data `label`
   * (or keypad.open({label})) overrides these.
   */
  const KEYPAD_LABELS = { key_cabinet: 'CODE = YEAR COMMISSIONED' };
  function kpFails(id) {
    const s = S();
    if (!s.kpFails || typeof s.kpFails !== 'object') s.kpFails = {};
    return id ? s.kpFails[id] | 0 : 0;
  }
  function kpTape(show, animate) {
    const t = kp.els.tape;
    t.textContent = kp.label || '';
    t.classList.toggle('hidden', !show || !kp.label);
    t.classList.toggle('dv-kp-tape-in', !!(show && animate));
  }
  function kpShow(text, dimRest) {
    const digs = kp.els.digs;
    for (let i = 0; i < digs.length; i++) {
      const ch = text[i] != null ? text[i] : dimRest ? '_' : ' ';
      const on = SEG_CHARS[ch] != null ? SEG_CHARS[ch] : '';
      digs[i].classList.toggle('dv-ghost', dimRest && text[i] == null);
      for (const p of digs[i].querySelectorAll('polygon')) p.classList.toggle('dv-lit', on.includes(p.dataset.s));
    }
  }
  function kpPress(k) {
    if (kp.lockT > 0) return;
    const btn = kp.els.keys[k];
    if (btn) {
      btn.classList.add('dv-down');
      setTimeout(() => btn.classList.remove('dv-down'), 110);
    }
    sfx('keypad', { vol: 0.7 });
    if (k === 'CLR') { kp.entered = ''; kpShow('', true); return; }
    if (k === 'ENT') { kpSubmit(); return; }
    if (kp.entered.length >= kp.len) return;
    kp.entered += k;
    kpShow(kp.entered, true);
  }
  function kpSubmit() {
    const id = kp.id;
    if (kp.entered === kp.code && kp.code) {
      kp.state = 'ok';
      kp.lockT = 0.9;
      kpShow('OPEn'.slice(0, kp.len).padEnd(kp.len, ' '));
      kp.els.root.classList.add('dv-kp-ok');
      sfx('keypad_ok');
      // A successful unlock remains successful even if another mode dismisses it.
      devs.keypad.result = true;
      if (id) S().keypads[id] = true;
      DA.bus.emit('keypad:ok', { id, code: kp.code });
    } else {
      kp.state = 'bad';
      kp.lockT = 1.1;
      kp.flashT = 0;
      kp.els.root.classList.add('dv-kp-bad');
      sfx('keypad_bad');
      const n = id ? (S().kpFails = Object.assign({}, S().kpFails || {}, { [id]: kpFails(id) + 1 }))[id] : 0;
      DA.bus.emit('keypad:bad', { id, entered: kp.entered, fails: n });
      kp.entered = '';
      // second wrong code: you notice the strip of tape inside the door
      if (n >= 2 && kp.label && kp.els.tape.classList.contains('hidden')) DA.timers.after(0.9, () => { if (devs.keypad.isOpen && kp.id === id) { kpTape(true, true); sfx('paper', { vol: 0.35, rate: 1.4 }); } }, 'dv_kp');
    }
  }
  device('keypad', {
    dim: true,
    clickOutside: true,
    cancel: false,
    build(root) {
      const digs = [];
      const led = U.el('div', { class: 'dv-kp-led' });
      for (let i = 0; i < 4; i++) { const d = segDigit(); digs.push(d); led.appendChild(d); }
      const keys = {};
      const grid = U.el('div', { class: 'dv-kp-keys' });
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'].forEach((k) => {
        const b = U.el('button', { class: 'dv-kp-key' + (k.length > 1 ? ' dv-kp-fn' : ''), onclick: () => kpPress(k) },
          U.el('span', null, k));
        keys[k] = b;
        grid.appendChild(b);
      });
      const title = U.el('div', { class: 'dv-kp-title' });
      const plate = U.el('div', { class: 'dv-kp-plate' },
        U.el('i', { class: 'dv-kp-screw dv-tl' }), U.el('i', { class: 'dv-kp-screw dv-tr' }),
        U.el('i', { class: 'dv-kp-screw dv-bl' }), U.el('i', { class: 'dv-kp-screw dv-br' }),
        title,
        U.el('div', { class: 'dv-kp-window' }, led,
          U.el('div', { class: 'dv-kp-lamps' }, U.el('span', { class: 'dv-kp-lamp dv-kp-r' }), U.el('span', { class: 'dv-kp-lamp dv-kp-g' }))),
        grid,
        U.el('div', { class: 'dv-kp-brand' }, 'SECURELINE  ·  MODEL 400'));
      const tape = U.el('div', { class: 'dv-kp-tape hidden' });
      plate.appendChild(tape);
      root.appendChild(plate);
      root.appendChild(closeHint('0–9  ·  ENTER  ·  ⌫  ·  E / ESC  BACK'));
      kp.els = { root, plate, title, led, digs, keys, tape };
    },
    enter(arg) {
      let code = arg.code != null ? String(arg.code) : '';
      if (/^\d+$/.test(code) && code.length < 4) code = code.padStart(4, '0');
      kp.code = code;
      kp.len = U.clamp(code.length || 4, 1, 4);
      kp.id = arg.id || null;
      kp.entered = '';
      kp.lockT = 0;
      kp.state = '';
      kp.label = DA.fmt(String(arg.label || (kp.id && KEYPAD_LABELS[kp.id]) || '')).toUpperCase();
      kpTape(kpFails(kp.id) >= 2, false);
      kp.els.title.textContent = String(arg.title || 'ACCESS CONTROL').toUpperCase();
      kp.els.root.classList.remove('dv-kp-ok', 'dv-kp-bad');
      kp.els.digs.forEach((d, i) => d.classList.toggle('hidden', i >= kp.len));
      kpShow('', true);
    },
    update(dt) {
      if (kp.lockT <= 0) return;
      kp.lockT -= dt;
      if (kp.state === 'bad') {
        kp.flashT += dt;
        const on = Math.floor(kp.flashT * 6) % 2 === 0;
        kpShow(on ? 'Err '.slice(0, kp.len) : '', false);
      }
      if (kp.lockT <= 0) {
        const st = kp.state;
        kp.state = '';
        kp.els.root.classList.remove('dv-kp-bad');
        if (st === 'ok') closeDev('keypad', true);
        else kpShow('', true);
      }
    },
    key(e, down) {
      if (!down) return false;
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (m) { kpPress(m[1]); return true; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { kpPress('ENT'); return true; }
      if (e.code === 'Backspace') {
        if (kp.lockT <= 0 && kp.entered) { kp.entered = kp.entered.slice(0, -1); kpShow(kp.entered, true); sfx('keypad', { vol: 0.5 }); }
        return true;
      }
      if (e.code === 'Delete' || e.code === 'KeyC') { kpPress('CLR'); return true; }
      return false;
    },
    canClose: () => kp.state !== 'ok',
  });
  D.keypad = { open: (opts) => openDev('keypad', opts || {}) };

  /* ============================================================ TERMINAL */
  /*
   * TAPE BACKUP TERMINAL — the save/load system, in green phosphor. Later it admits what the
   * archives are ('STATION 14 — TIMELINE STORE') and lists timelines nobody can load.
   */
  const TM_W = 62;
  const tm = { screen: 'menu', sel: 0, items: [], els: null, prog: 0, dur: 0, job: null, msg: '', msgT: 0, reveal: 99, blink: 0, pick: null, stamp: '' };
  function tmTimeline() { return !!DA.flag('archives_are_timelines'); }
  /** Terminal wording from DA.content.terminal (writer-owned) with fallbacks. */
  function tmText(key, fallback) {
    const t = DA.content && DA.content.terminal && DA.content.terminal[key];
    return DA.fmt(typeof t === 'string' && t ? t : fallback);
  }
  function tmBusy() { return !!DA.flag('no_archive'); }
  function tmNextLabel() { return 'TIMELINE ' + U.pad((DA.meta.timelines || 0) + 1, 4); }
  function tmArchives() {
    const list = safe(() => DA.archive.list(), []) || [];
    return list.slice().sort((a, b) => a.slot - b.slot);
  }
  function tmGo(screen, extra) {
    tm.screen = screen;
    // destructive confirmations (OVERWRITE? / RESTORE?) start on NO: the Enter / Space that picked
    // the slot a moment ago must never destroy a slot or the current progress (decision 4)
    tm.sel = screen === 'overwrite' || screen === 'confirm' ? 1 : 0;
    tm.reveal = 0;
    Object.assign(tm, extra || {});
    tmDraw();
  }
  function tmItemDisabled(it) {
    return !!(it && (it.disabled || (tmBusy() && ['archive', 'restore', 'slot', 'load', 'yes'].includes(it.act))));
  }
  function tmAbortBusy() {
    stopSnd(tm.snd, 0.1);
    tm.snd = null;
    tmGo('done', { msg: 'TAPE DRIVE BUSY — TRY AGAIN LATER', msg2: tm.job === 'save' ? 'ARCHIVE NOT WRITTEN.' : 'ARCHIVE NOT RESTORED.' });
  }
  /** Build the screen as lines: {t, cls, item, right}. */
  function tmLines() {
    const L = [], items = [];
    const push = (t, cls, extra) => L.push(Object.assign({ t, cls: cls || '' }, extra));
    const item = (t, act, extra) => {
      const it = Object.assign({ t, act }, extra);
      items.push(it);
      push(t, 'item', { item: items.length - 1 });
    };
    const busy = tmBusy(), tl = tmTimeline();
    push('STATION 14 — ' + (tl ? tmText('titleTimelines', 'TIMELINE STORE') : tmText('title', 'TAPE BACKUP TERMINAL')), 'hd', { right: `${DA.clock.date()}  ${DA.clock.hhmm()}` });
    push(`DRIVE 0  QIC-80 STREAMER   STATUS: ${busy ? tmText('busy', 'BUSY') : tm.screen === 'progress' ? (tm.job === 'save' ? 'WRITING' : 'READING') : 'READY'}`, 'dim');
    push('─'.repeat(TM_W), 'rule');
    push('');
    switch (tm.screen) {
      case 'menu':
        item(tl ? 'ARCHIVE CURRENT TIMELINE' : 'ARCHIVE CURRENT STATE', 'archive', { disabled: busy, key: '1' });
        item(tl ? 'RESTORE TIMELINE' : 'RESTORE ARCHIVE', 'restore', { disabled: busy, key: '2' });
        item('EXIT', 'exit', { key: '3' });
        push('');
        if (busy) push('TAPE DRIVE BUSY', 'warn blink');
        else if (tm.msg) push(tm.msg, 'warn');
        else push(`${tmArchives().length} ARCHIVE${tmArchives().length === 1 ? '' : 'S'} ON TAPE.  NEXT: ${tmNextLabel()}`, 'dim');
        break;
      case 'slots': {
        push('SELECT ARCHIVE SLOT', 'sub');
        push('');
        const byslot = {};
        for (const a of tmArchives()) byslot[a.slot] = a;
        for (let s = 1; s <= 5; s++) {
          const a = byslot[s];
          item(a ? `SLOT ${s}   ${a.label.padEnd(16)} ${a.stamp}` : `SLOT ${s}   ${tmText('empty', '— EMPTY —')}`, 'slot', { slot: s, meta: a || null, key: String(s) });
        }
        item('BACK', 'back', { key: '0' });
        break;
      }
      case 'overwrite':
        push(`SLOT ${tm.pick.slot} HOLDS ${tm.pick.meta.label}  (${tm.pick.meta.stamp}).`, 'sub');
        push('OVERWRITE?');
        push('');
        item('YES', 'yes', { key: 'Y' });
        item('NO', 'no', { key: 'N' });
        break;
      case 'progress': {
        const p = U.clamp(tm.prog / tm.dur, 0, 1);
        const dots = '.'.repeat(1 + (Math.floor(tm.prog * 3) % 4));
        push((tm.job === 'save' ? (tl ? 'ARCHIVING CURRENT TIMELINE' : tmText('archiving', 'ARCHIVING CURRENT STATE')) : 'RESTORING ARCHIVE') + dots, 'sub');
        push('');
        const n = 36, k = Math.floor(p * n);
        push(`[${'█'.repeat(k)}${'░'.repeat(n - k)}] ${String(Math.floor(p * 100)).padStart(3)}%`);
        push(`BLOCK ${U.pad(Math.floor(p * 4096), 6)} / 004096   ${tm.job === 'save' ? 'WRITE' : 'READ'} VERIFY`, 'dim');
        break;
      }
      case 'done':
        push(tm.msg, 'sub');
        push(tm.msg2 || '');
        push('');
        push('PRESS ANY KEY', 'dim blink');
        break;
      case 'restore': {
        push(tl ? 'SELECT TIMELINE TO RESTORE' : 'SELECT ARCHIVE TO RESTORE', 'sub');
        push('');
        const list = tmArchives();
        if (!list.length && !tl) push('NO ARCHIVES ON TAPE.', 'dim');
        for (const a of list) {
          const t = tl
            ? `${a.label} — ${a.stamp} — OPERATOR ${String(a.name || DA.state.playerName).toUpperCase()}`
            : `${a.slot === 0 ? 'AUTO  ' : 'SLOT ' + a.slot} ${a.label.padEnd(16)} ${a.stamp}`;
          // number keys like the slot list (the automatic checkpoint is A — 0 is BACK)
          item(t.slice(0, TM_W - 3), 'load', { slot: a.slot, meta: a, key: a.slot === 0 ? 'A' : String(a.slot) });
        }
        if (tl) {
          item('TIMELINE 0000 — 26 OCT 1954 — OPERATOR MARSH', 'deny');
          item(DA.fmt('TIMELINE ???? — NULL — OPERATOR {NAME_UP}').slice(0, TM_W), 'deny');
        }
        item('BACK', 'back', { key: '0' });
        break;
      }
      case 'confirm':
        push(`RESTORE ${tm.pick.meta.label}  (${tm.pick.meta.stamp})?`, 'sub');
        push(tmTimeline() ? 'THE CURRENT TIMELINE WILL BE LEFT RUNNING.' : 'UNARCHIVED PROGRESS WILL BE LOST.', 'dim');
        push('');
        item('YES', 'yes', { key: 'Y' });
        item('NO', 'no', { key: 'N' });
        break;
      case 'denied':
        push('');
        push('ACCESS DENIED', 'big warn blink');
        push('');
        push('PRESS ANY KEY', 'dim');
        break;
    }
    tm.items = items;
    if (tm.sel >= items.length) tm.sel = Math.max(0, items.length - 1);
    return L;
  }
  function tmDraw() {
    if (!tm.els) return;
    const L = tmLines();
    const box = tm.els.text;
    box.textContent = '';
    const shown = tm.screen === 'progress' || tm.screen === 'done' ? L.length : Math.min(L.length, tm.reveal);
    for (let i = 0; i < shown; i++) {
      const l = L[i];
      const div = U.el('div', { class: 'dv-tm-line ' + l.cls.split(' ').filter(Boolean).map((c) => 'dv-tm-' + c).join(' ') });
      if (l.item != null) {
        const it = tm.items[l.item];
        const sel = l.item === tm.sel;
        div.classList.toggle('dv-tm-sel', sel);
        div.classList.toggle('dv-tm-off', tmItemDisabled(it));
        div.textContent = (sel ? ' > ' : '   ') + (it.key ? it.key + '  ' : '') + l.t;
        dvHover(div, () => { if (tm.sel !== l.item) { tm.sel = l.item; tmDraw(); } });
        div.addEventListener('click', () => { tm.sel = l.item; tmActivate(); });
      } else {
        div.textContent = l.t;
        if (l.right) div.appendChild(U.el('span', { class: 'dv-tm-right' }, l.right));
      }
      box.appendChild(div);
    }
    if (shown >= L.length && tm.screen !== 'progress') box.appendChild(U.el('div', { class: 'dv-tm-line' }, U.el('span', { class: 'dv-tm-cursor' })));
  }
  function tmStart(job, slot) {
    tm.job = job;
    if (tmBusy()) { tmAbortBusy(); return; }
    tm.slot = slot;
    tm.prog = 0;
    tm.dur = job === 'save' ? 3.4 : 2.2;
    tm.stall = job === 'save' ? 0.35 + Math.random() * 0.3 : 0.5;
    sfx('tape_insert', atIt('tape_terminal'));
    tm.snd = sfx('tape_play', atIt('tape_terminal', { vol: 0.8, dur: tm.dur }));
    tmGo('progress');
  }
  function tmFinish() {
    if (tmBusy()) { tmAbortBusy(); return; }
    stopSnd(tm.snd, 0.1);
    tm.snd = null;
    sfx('tape_stop', atIt('tape_terminal'));
    if (tm.job === 'save') {
      const label = tmNextLabel();
      const ok = safe(() => DA.archive.save(tm.slot, label), false);
      sfx('beep', { vol: 0.5 });
      tmGo('done', ok
        ? { msg: tmTimeline() ? `${label} STORED.` : 'ARCHIVE COMPLETE.', msg2: `${label} WRITTEN TO SLOT ${tm.slot}.` }
        : { msg: 'TAPE WRITE ERROR.', msg2: 'ARCHIVE NOT WRITTEN.' });
    } else {
      const ok = safe(() => DA.archive.load(tm.slot), false);
      // on success the whole runtime resets and this mode is cleared away
      if (!ok) tmGo('done', { msg: 'TAPE READ ERROR.', msg2: 'ARCHIVE COULD NOT BE RESTORED.' });
    }
  }
  function tmActivate() {
    const it = tm.items[tm.sel];
    if (!it) return;
    if (tmItemDisabled(it)) {
      sfx('beep', { vol: 0.4, rate: 0.6 });
      tm.msg = 'TAPE DRIVE BUSY — TRY AGAIN LATER';
      tmDraw();
      return;
    }
    sfx('beep', { vol: 0.35 });
    switch (it.act) {
      case 'archive': tmGo('slots'); break;
      case 'restore': tmGo('restore'); break;
      case 'exit': closeDev('terminal'); break;
      case 'back': tmGo('menu'); break;
      case 'slot':
        if (it.meta) tmGo('overwrite', { pick: it });
        else tmStart('save', it.slot);
        break;
      case 'load': tmGo('confirm', { pick: it }); break;
      case 'deny':
        sfx('beep', { vol: 0.5, rate: 0.5 });
        tmGo('denied');
        break;
      case 'yes':
        if (tm.screen === 'overwrite') tmStart('save', tm.pick.slot);
        else tmStart('load', tm.pick.slot);
        break;
      case 'no': tmGo(tm.screen === 'overwrite' ? 'slots' : 'restore'); break;
    }
  }
  device('terminal', {
    opaque: true,
    build(root) {
      const text = U.el('div', { class: 'dv-tm-text' });
      root.appendChild(U.el('div', { class: 'dv-tm-case' },
        U.el('div', { class: 'dv-tm-bezel' },
          U.el('div', { class: 'dv-tm-screen' }, text, U.el('div', { class: 'dv-tm-scan' }), U.el('div', { class: 'dv-tm-glare' }))),
        U.el('div', { class: 'dv-tm-foot' },
          U.el('span', { class: 'dv-tm-badge' }, 'TBU-9  TAPE BACKUP UNIT'),
          U.el('span', { class: 'dv-tm-pwr' }, U.el('i'), 'POWER'))));
      root.appendChild(closeHint('↑ ↓  ENTER  ·  ESC BACK'));
      tm.els = { root, text };
    },
    enter() {
      tm.msg = '';
      tm.blink = 0;
      sfx('beep', { vol: 0.3 });
      tmGo('menu');
    },
    update(dt) {
      tm.blink += dt;
      if (tm.busy !== tmBusy()) { tm.busy = tmBusy(); tmDraw(); }
      if (tm.screen === 'progress') {
        if (tmBusy()) { tmAbortBusy(); return; }
        // real drives stall now and then
        if (tm.stall > 0 && tm.prog > tm.dur * 0.42) tm.stall -= dt;
        else tm.prog += dt;
        if (tm.prog >= tm.dur) tmFinish();
        else tmDraw();
        return;
      }
      if (tm.reveal < 40) {
        tm.reveal += dt * 90;
        tmDraw();
      }
      if (tm.msg && tm.screen === 'menu') {
        tm.msgT = (tm.msgT || 0) + dt;
        if (tm.msgT > 2.5) { tm.msg = ''; tm.msgT = 0; tmDraw(); }
      }
    },
    key(e, down) {
      if (!down) return false;
      if (tm.screen === 'progress') return true;
      if (tm.screen === 'done' || tm.screen === 'denied') {
        if (e.repeat) return true;
        tmGo(tm.screen === 'denied' ? 'restore' : 'menu');
        return true;
      }
      const n = tm.items.length;
      if (e.code === 'ArrowDown') { tm.sel = (tm.sel + 1) % n; sfx('beep', { vol: 0.15, rate: 1.6 }); tmDraw(); return true; }
      if (e.code === 'ArrowUp') { tm.sel = (tm.sel + n - 1) % n; sfx('beep', { vol: 0.15, rate: 1.6 }); tmDraw(); return true; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { if (!e.repeat) tmActivate(); return true; }
      const ch = e.key && e.key.length === 1 ? e.key.toUpperCase() : '';
      const hit = tm.items.findIndex((it) => it.key && it.key === ch);
      if (hit >= 0) { tm.sel = hit; tmActivate(); return true; }
      if (e.code === 'Escape' && !e.repeat) {
        if (tm.screen === 'menu') closeDev('terminal');
        else if (tm.screen === 'overwrite') tmGo('slots');
        else if (tm.screen === 'confirm') tmGo('restore');
        else tmGo('menu');
        return true;
      }
      if (e.code === 'KeyE' && !e.repeat) {
        if (tm.screen === 'menu') closeDev('terminal');
        return true;
      }
      return false;
    },
  });
  D.terminal = { open: () => openDev('terminal') };

  /* ================================================================= MAP */
  /*
   * The county topographic sheet on the radio-room wall. Terrain, contours, rivers, woodland,
   * a lake and the paper itself are procedural (fixed seed: it is one physical map); roads,
   * places, markers and bridges come from DA.content.maplocs (0..1 map space). The player
   * clicks to pencil a circle; map.open() resolves with the nearest marked location.
   */
  const MP = { W: 1600, H: 1000, X0: 64, Y0: 58, MW: 1472, MH: 806 };
  const MAP_RADIUS = 30; // click tolerance in sheet pixels
  const FALLBACK_LOCS = [
    { id: 'route_9', name: 'COUNTY ROUTE 9', kind: 'road', pts: [[0, 0.83], [0.12, 0.8], [0.24, 0.7], [0.33, 0.62], [0.45, 0.57], [0.6, 0.53], [0.72, 0.44], [0.86, 0.38], [1, 0.33]] },
    { id: 'station_road', name: 'STATION ROAD', kind: 'road', pts: [[0.45, 0.57], [0.44, 0.5], [0.42, 0.44], [0.405, 0.385]] },
    { id: 'kestrel_road', name: 'KESTREL ROAD', kind: 'road', pts: [[0.6, 0.53], [0.62, 0.6], [0.66, 0.67], [0.72, 0.72], [0.76, 0.8], [0.83, 0.87], [0.9, 1]] },
    { id: 'quarry_road', name: 'QUARRY ROAD', kind: 'road', pts: [[0.66, 0.67], [0.6, 0.73], [0.53, 0.78], [0.49, 0.81]] },
    { id: 'ridge_road', name: 'RIDGE FIRE ROAD', kind: 'road', pts: [[0.405, 0.385], [0.36, 0.3], [0.3, 0.2], [0.22, 0.12], [0.12, 0.06]] },
    { id: 'old_mill_lane', name: 'OLD MILL LANE', kind: 'road', pts: [[0.12, 0.8], [0.14, 0.9], [0.2, 1]] },
    { id: 'relay_station_14', name: 'RELAY STATION 14', kind: 'place', pts: [[0.403, 0.378]] },
    { id: 'merrow', name: 'MERROW', kind: 'place', pts: [[0.1, 0.78]] },
    { id: 'quarry', name: 'GRAVEL QUARRY (DISUSED)', kind: 'place', pts: [[0.475, 0.83]] },
    { id: 'mm14', name: 'MM 14', kind: 'marker', pts: [[0.742, 0.765]] },
    { id: 'mm12', name: 'MM 12', kind: 'marker', pts: [[0.64, 0.637]] },
    { id: 'harlan_bridge', name: 'HARLAN CREEK BRIDGE', kind: 'bridge', pts: [[0.8, 0.405]] },
  ];
  const mp = { base: null, src: null, locs: null, marks: [], els: null, find: null, pop: 0, done: false, resolveT: -1, pick: null,
    cur: { x: 0, y: 0, on: false }, held: {} };

  function mapLocs() {
    let src = DA.content && DA.content.maplocs;
    let list = [];
    if (Array.isArray(src)) list = src;
    else if (src && typeof src === 'object') list = Object.keys(src).map((k) => Object.assign({ id: k }, src[k]));
    list = list.filter((l) => l && l.id && Array.isArray(l.pts) && l.pts.length);
    return list.length ? list : FALLBACK_LOCS;
  }
  const mpx = (p) => [MP.X0 + p[0] * MP.MW, MP.Y0 + p[1] * MP.MH];
  function valueNoise(seed) {
    const r = U.mulberry32(seed);
    const perm = new Uint16Array(512), vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) { vals[i] = r(); perm[i] = i; }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
    const L = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = L(xi, yi), b = L(xi + 1, yi), c = L(xi, yi + 1), d = L(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }
  function segDist(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1);
    return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
  }
  function polyDist(px, py, pts) {
    if (pts.length === 1) return Math.hypot(px - pts[0][0], py - pts[0][1]);
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, py, pts[i - 1], pts[i]));
    return d;
  }
  /** Wandering line from a to b whose sideways wander fades out at both ends. */
  function meander(a, b, amp, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const steps = Math.max(8, Math.round(len / 8));
    const p1 = r() * 10, p2 = r() * 10, f1 = 1.5 + r() * 2, f2 = 4 + r() * 4;
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, env = Math.sin(Math.PI * t);
      const off = env * amp * (Math.sin(t * f1 * Math.PI + p1) * 0.7 + Math.sin(t * f2 * Math.PI + p2) * 0.3);
      out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
    }
    return out;
  }
  function clipToSheet(p) {
    return [U.clamp(p[0], MP.X0 - 10, MP.X0 + MP.MW + 10), U.clamp(p[1], MP.Y0 - 10, MP.Y0 + MP.MH + 10)];
  }
  /**
   * Rivers. Content 'water' polylines when the writer drew them; otherwise a procedural creek
   * routed through the first bridge, crossing its road at right angles.
   */
  function mapRivers(locs, r) {
    const water = locs.filter((l) => l.kind === 'water' && l.pts.length > 1);
    if (water.length) {
      return water.map((l) => {
        // resample so the valley carving and the drawn line stay smooth
        const pts = [];
        const src = l.pts.map(mpx);
        for (let i = 1; i < src.length; i++) {
          const a = src[i - 1], b = src[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
          for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([U.lerp(a[0], b[0], k / n), U.lerp(a[1], b[1], k / n)]);
        }
        // a little meander (content polylines are coarse); ends stay put
        const rr = U.mulberry32(U.hash(l.id)), ph1 = rr() * 10, ph2 = rr() * 10;
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
          const t = i / (pts.length - 1), off = Math.sin(Math.PI * t) * (Math.sin(i * 0.35 + ph1) * 4.5 + Math.sin(i * 0.9 + ph2) * 2);
          pts[i] = [pts[i][0] - (dy / len) * off, pts[i][1] + (dx / len) * off];
        }
        return { pts, w: /river|creek/i.test(l.name || '') ? 3 : 1.6, name: l.label || l.name || null, loc: l };
      });
    }
    const roads = locs.filter((l) => l.kind === 'road').map((l) => l.pts.map(mpx));
    const bridges = locs.filter((l) => l.kind === 'bridge').map((l) => mpx(l.pts[0]));
    let b = bridges[0] || mpx([0.8, 0.405]);
    // direction of the road under the bridge
    let dir = [1, 0], best = Infinity;
    for (const rd of roads) {
      for (let i = 1; i < rd.length; i++) {
        const d = segDist(b[0], b[1], rd[i - 1], rd[i]);
        if (d < best) {
          best = d;
          const vx = rd[i][0] - rd[i - 1][0], vy = rd[i][1] - rd[i - 1][1], l = Math.hypot(vx, vy) || 1;
          dir = [vx / l, vy / l];
        }
      }
    }
    let perp = [-dir[1], dir[0]];
    if (perp[1] < 0) perp = [-perp[0], -perp[1]]; // flows "south"
    const far = (s) => clipToSheet([b[0] + perp[0] * s + dir[0] * s * 0.35, b[1] + perp[1] * s + dir[1] * s * 0.35]);
    const up = clipToSheet([b[0] - perp[0] * 900 + dir[0] * 160, b[1] - perp[1] * 900 + dir[1] * 160]);
    const upMid = [b[0] - perp[0] * 130 + dir[0] * 40, b[1] - perp[1] * 130 + dir[1] * 40];
    const dnMid = [b[0] + perp[0] * 150 - dir[0] * 60, b[1] + perp[1] * 150 - dir[1] * 60];
    const down = far(900);
    const main = [].concat(meander(up, upMid, 46, r), meander(upMid, b, 18, r).slice(1), meander(b, dnMid, 22, r).slice(1), meander(dnMid, down, 60, r).slice(1));
    const rivers = [{ pts: main, w: 3.2, name: null }];
    // name the creek after a bridge ("HARLAN CREEK BRIDGE" → "HARLAN CREEK")
    const bl = locs.find((l) => l.kind === 'bridge' && /creek|river|brook/i.test(l.name || ''));
    rivers[0].name = bl ? String(bl.name).toUpperCase().replace(/\s*BRIDGE\s*$/, '') : 'HARLAN CREEK';
    for (let k = 0; k < 3; k++) {
      const j = main[Math.floor(main.length * (0.15 + k * 0.28 + r() * 0.08))];
      const src = clipToSheet([j[0] + (r() - 0.5) * 700, MP.Y0 + r() * MP.MH * 0.35]);
      rivers.push({ pts: meander(src, j, 24 + r() * 20, r), w: 1.4, name: null });
    }
    return rivers;
  }
  function mapBuild() {
    const locs = mapLocs();
    const c = mkCanvas(MP.W, MP.H), x = c.getContext('2d');
    const r = U.mulberry32(0x14c0dd);
    const nH = valueNoise(1401), nF = valueNoise(7331), nP = valueNoise(99);
    const rivers = mapRivers(locs, r);
    const roadsPx = locs.filter((l) => l.kind === 'road').map((l) => l.pts.map(mpx));
    const places = locs.filter((l) => l.kind === 'place').map((l) => mpx(l.pts[0]));

    // ---- paper
    x.fillStyle = '#e7dcc0';
    x.fillRect(0, 0, MP.W, MP.H);
    // ---- river valleys: rivers rasterised thick + blurred on a small canvas (fast "distance")
    const GW = 196, GH = 108, cw = MP.MW / (GW - 1), ch = MP.MH / (GH - 1);
    const vc = mkCanvas(GW, GH), vx = vc.getContext('2d');
    vx.fillStyle = '#000';
    vx.fillRect(0, 0, GW, GH);
    vx.filter = 'blur(2px)';
    vx.globalCompositeOperation = 'lighter';
    vx.lineCap = vx.lineJoin = 'round';
    vx.setTransform(1 / cw, 0, 0, 1 / ch, -MP.X0 / cw, -MP.Y0 / ch);
    // stacked strokes = a soft valley profile, deepest at the water
    for (const wCells of [22, 15, 10, 6, 3]) {
      vx.strokeStyle = 'rgba(51,51,51,1)';
      vx.lineWidth = wCells * cw;
      for (const rv of rivers) {
        vx.beginPath();
        rv.pts.forEach((p, i) => (i ? vx.lineTo(p[0], p[1]) : vx.moveTo(p[0], p[1])));
        vx.stroke();
      }
    }
    const valley = vx.getImageData(0, 0, GW, GH).data;
    // ---- heightfield on the grid
    const H = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const u = i / GW, v = j / GH;
        let h = fbm(nH, u * 5.2, v * 3.1, 5) * 0.85 + (1 - v) * 0.22 + (1 - u) * 0.1 + fbm(nH, u * 1.3 + 7, v * 1.1 + 3, 2) * 0.25;
        h -= 0.24 * Math.min(1, valley[(j * GW + i) * 4] / 255);
        H[j * GW + i] = h;
      }
    }
    // ---- woodland tint (clearings are paper-white, as on a survey sheet), half-res then smoothed up
    const FW = 98, FH = 54;
    const fc = mkCanvas(FW, FH), fx = fc.getContext('2d'), fimg = fx.createImageData(FW, FH);
    for (let j = 0; j < FH; j++) {
      for (let i = 0; i < FW; i++) {
        const px = MP.X0 + (i / (FW - 1)) * MP.MW, py = MP.Y0 + (j / (FH - 1)) * MP.MH;
        let f = fbm(nF, (i / FW) * 7, (j / FH) * 4.2, 4);
        for (const p of places) f -= 0.35 * Math.exp(-((px - p[0]) ** 2 + (py - p[1]) ** 2) / (55 * 55));
        const a = U.smoothstep(0.36, 0.42, f);
        const o = (j * FW + i) * 4;
        fimg.data[o] = 196; fimg.data[o + 1] = 216; fimg.data[o + 2] = 168; fimg.data[o + 3] = Math.round(a * 200);
      }
    }
    fx.putImageData(fimg, 0, 0);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(fc, MP.X0, MP.Y0, MP.MW, MP.MH);
    // ---- contours (marching squares), every fifth an index contour
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < H.length; k++) { if (H[k] < lo) lo = H[k]; if (H[k] > hi) hi = H[k]; }
    const LEVELS = 22, step = (hi - lo) / LEVELS;
    const labelled = [];
    for (let li = 1; li < LEVELS; li++) {
      const lv = lo + li * step, index = li % 5 === 0;
      x.beginPath();
      let segN = 0, keep = null;
      for (let j = 0; j < GH - 1; j++) {
        for (let i = 0; i < GW - 1; i++) {
          const a = H[j * GW + i], b = H[j * GW + i + 1], cc2 = H[(j + 1) * GW + i + 1], d = H[(j + 1) * GW + i];
          const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc2 > lv ? 2 : 0) | (d > lv ? 1 : 0);
          if (code === 0 || code === 15) continue;
          const X = MP.X0 + i * cw, Y = MP.Y0 + j * ch;
          const top = [X + cw * ((lv - a) / (b - a)), Y], right = [X + cw, Y + ch * ((lv - b) / (cc2 - b))];
          const bot = [X + cw * ((lv - d) / (cc2 - d)), Y + ch], left = [X, Y + ch * ((lv - a) / (d - a))];
          const segs = {
            1: [[left, bot]], 2: [[bot, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bot, right]],
            6: [[top, bot]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bot]], 10: [[top, right], [left, bot]],
            11: [[top, right]], 12: [[left, right]], 13: [[bot, right]], 14: [[left, bot]],
          }[code];
          for (const s of segs) {
            x.moveTo(s[0][0], s[0][1]);
            x.lineTo(s[1][0], s[1][1]);
            segN++;
            if (index && !keep && segN > 40 && r() < 0.02) keep = s;
          }
        }
      }
      x.strokeStyle = index ? 'rgba(150,98,56,0.8)' : 'rgba(168,118,74,0.55)';
      x.lineWidth = index ? 1.7 : 0.85;
      x.stroke();
      if (index && keep) labelled.push({ s: keep, elev: 1400 + li * 40 });
    }
    x.font = "bold 11px 'Liberation Sans', Arial, sans-serif";
    for (const l of labelled) {
      const [a, b] = l.s;
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      x.save();
      x.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      x.rotate(ang);
      x.fillStyle = '#e7dcc0';
      x.fillRect(-15, -6, 30, 12);
      x.fillStyle = 'rgba(140,90,50,0.9)';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(l.elev), 0, 0.5);
      x.restore();
    }
    // ---- water: lake + rivers
    let lake = null;
    for (let tries = 0; tries < 60 && !lake; tries++) {
      const p = [MP.X0 + MP.MW * (0.12 + r() * 0.76), MP.Y0 + MP.MH * (0.12 + r() * 0.35)];
      const far = roadsPx.every((rd) => polyDist(p[0], p[1], rd) > 110) && places.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 190) &&
        rivers.every((rv) => polyDist(p[0], p[1], rv.pts) > 70);
      if (far) lake = p;
    }
    if (lake) {
      x.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * TAU, rr = 34 + 20 * nP(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5);
        const px = lake[0] + Math.cos(a) * rr * 1.5, py = lake[1] + Math.sin(a) * rr;
        k ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath();
      x.fillStyle = '#a9cbd8';
      x.fill();
      x.strokeStyle = '#3f7fa0';
      x.lineWidth = 1.4;
      x.stroke();
      waterLabel(x, 'MARROW LAKE', lake[0], lake[1] + 2, 0, 13);
    }
    x.lineJoin = x.lineCap = 'round';
    for (const rv of rivers) {
      x.beginPath();
      rv.pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.strokeStyle = '#3f7fa0';
      x.lineWidth = rv.w;
      x.stroke();
    }
    rivers.forEach((rv, i) => {
      if (!rv.name) return;
      const m = rv.pts, mi = Math.floor(m.length * (0.3 + 0.12 * (i % 3))), a0 = m[mi], a1 = m[Math.min(m.length - 1, mi + 5)];
      waterLabel(x, rv.name, (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), 14);
    });
    // county line (dash-dot boundary with a faint band)
    for (const l of locs.filter((q) => q.kind === 'border' && q.pts.length > 1)) {
      const pts = l.pts.map(mpx);
      x.save();
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.strokeStyle = 'rgba(120,90,130,0.18)';
      x.lineWidth = 9;
      x.stroke();
      x.setLineDash([16, 5, 3, 5]);
      x.strokeStyle = 'rgba(60,45,70,0.8)';
      x.lineWidth = 1.8;
      x.stroke();
      x.restore();
      const a = pts[Math.floor(pts.length / 2) - 1] || pts[0], b = pts[Math.floor(pts.length / 2)] || pts[1];
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      x.save();
      x.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      x.rotate(ang);
      mapLabel(x, String(l.label || l.name).toUpperCase().split('').join(String.fromCharCode(8202)), 0, 14, "bold 11px 'Liberation Sans', Arial, sans-serif", '#4a3a55', 'center');
      x.restore();
    }
    // ---- UTM-ish grid with letters/numbers
    const cols = 10, rows = 6;
    x.strokeStyle = 'rgba(70,110,150,0.35)';
    x.lineWidth = 1;
    x.font = "bold 16px 'Liberation Sans', Arial, sans-serif";
    x.fillStyle = '#3d5d7a';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let i = 0; i <= cols; i++) {
      const X = MP.X0 + (i * MP.MW) / cols;
      x.beginPath(); x.moveTo(X, MP.Y0); x.lineTo(X, MP.Y0 + MP.MH); x.stroke();
      if (i < cols) {
        const L = String.fromCharCode(65 + i), cx = X + MP.MW / cols / 2;
        x.fillText(L, cx, MP.Y0 - 20);
        x.fillText(L, cx, MP.Y0 + MP.MH + 20);
      }
    }
    for (let j = 0; j <= rows; j++) {
      const Y = MP.Y0 + (j * MP.MH) / rows;
      x.beginPath(); x.moveTo(MP.X0, Y); x.lineTo(MP.X0 + MP.MW, Y); x.stroke();
      if (j < rows) {
        const cy = Y + MP.MH / rows / 2;
        x.fillText(String(j + 1), MP.X0 - 24, cy);
        x.fillText(String(j + 1), MP.X0 + MP.MW + 24, cy);
      }
    }
    // ---- roads (minor first, then major on top)
    const major = (l) => /route|highway|hwy|state|\bcr\b|us\s?\d|\brt\b/i.test((l.name || '') + ' ' + (l.label || ''));
    const trail = (l) => /fire road|trail|track|logging/i.test(l.name || '');
    const roads = locs.filter((l) => l.kind === 'road');
    const strokePoly = (pts, w, col, dash) => {
      x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.setLineDash(dash || []);
      x.strokeStyle = col;
      x.lineWidth = w;
      x.stroke();
      x.setLineDash([]);
    };
    for (const pass of [0, 1, 2]) {
      for (const l of roads) {
        const pts = l.pts.map(mpx), mj = major(l), tr = trail(l);
        if (tr) { if (pass === 0) strokePoly(pts, 1.6, '#2b241c', [7, 5]); continue; }
        if (!mj && pass === 0) { strokePoly(pts, 5, '#2b241c'); strokePoly(pts, 2.4, '#f3ecd8'); }
        if (mj && pass === 1) { strokePoly(pts, 7.5, '#2b241c'); strokePoly(pts, 4.2, '#c9492f'); }
      }
    }
    // ---- bridges
    for (const l of locs.filter((q) => q.kind === 'bridge')) {
      const p = mpx(locCenter(l));
      let ang = 0, best = Infinity;
      for (const rd of roads) {
        const pts = rd.pts.map(mpx);
        for (let i = 1; i < pts.length; i++) {
          const d = segDist(p[0], p[1], pts[i - 1], pts[i]);
          if (d < best) { best = d; ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]); }
        }
      }
      x.save();
      x.translate(p[0], p[1]);
      x.rotate(ang);
      x.strokeStyle = '#1d1812';
      x.lineWidth = 1.8;
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(-13, s * 9 + s * 3); x.lineTo(-9, s * 7); x.lineTo(9, s * 7); x.lineTo(13, s * 9 + s * 3);
        x.stroke();
      }
      x.restore();
      mapLabel(x, String(l.label || l.name), p[0] + 16, p[1] + 24, "italic 12px 'Liberation Serif', Georgia, serif", '#1f2f3c', 'left');
    }
    // ---- road names along their longest straight
    for (const l of roads) {
      const pts = l.pts.map(mpx);
      if (pts.length < 2) continue;
      let bi = 1, bl = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d > bl) { bl = d; bi = i; }
      }
      const a = pts[bi - 1], b = pts[bi];
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      x.save();
      x.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      x.rotate(ang);
      mapLabel(x, String(l.label || l.name), 0, -13, major(l) ? "bold 13px 'Liberation Sans Narrow', 'Liberation Sans', Arial, sans-serif" : "bold 12px 'Liberation Sans Narrow', 'Liberation Sans', Arial, sans-serif", '#231d16', 'center');
      x.restore();
    }
    // ---- places & markers
    let stationDrawn = false, stationAt = null;
    for (const l of locs) {
      if (l.kind !== 'place' && l.kind !== 'marker') continue;
      const p = mpx(l.pts[0]), name = String(l.label || l.name || l.id);
      if (l.kind === 'place' && /relay|station 14|stn 14/i.test((l.name || '') + ' ' + name)) { drawStation(x, p, 'RELAY STATION 14'); stationDrawn = true; stationAt = p; continue; }
      if (l.kind === 'place' && /quarry|pit|mine/i.test(name)) {
        x.save();
        x.translate(p[0], p[1]);
        x.strokeStyle = '#1d1812';
        x.lineWidth = 2.2;
        for (const s of [-1, 1]) {
          x.beginPath(); x.moveTo(-8 * s, -8); x.lineTo(8 * s, 8); x.stroke();
          x.beginPath(); x.moveTo(-8 * s - 4, -8 + 4 * s); x.lineTo(-8 * s + 4, -8 - 4 * s); x.stroke();
        }
        x.restore();
        mapLabel(x, name, p[0] + 14, p[1] + 4, "italic 12px 'Liberation Serif', Georgia, serif", '#231d16', 'left');
        continue;
      }
      if (l.kind === 'place') {
        const rr = U.mulberry32(U.hash(l.id));
        x.fillStyle = '#1d1812';
        for (let k = 0; k < 14; k++) {
          const a = rr() * TAU, d = rr() * 26;
          x.fillRect(p[0] + Math.cos(a) * d - 2.5, p[1] + Math.sin(a) * d * 0.7 - 2.5, 5, 5);
        }
        mapLabel(x, name.toUpperCase(), p[0], p[1] - 30, "bold 17px 'Liberation Sans', Arial, sans-serif", '#1d1812', 'center');
        continue;
      }
      // marker (mile markers are green on the county sheet)
      const green = /mile|mm\b|mm\s*\d|marker/i.test(name + ' ' + (l.name || '')) && !/turnoff|turn-off|junction/i.test(l.name || '');
      x.fillStyle = green ? '#2f7a3c' : '#1d1812';
      x.strokeStyle = '#f3ecd8';
      x.lineWidth = 1.5;
      x.fillRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
      x.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9);
      mapLabel(x, name, p[0] + 10, p[1] + 4, "bold 12px 'Liberation Sans', Arial, sans-serif", green ? '#2a6a34' : '#1d1812', 'left');
    }
    if (!stationDrawn) { stationAt = mpx([0.403, 0.378]); drawStation(x, stationAt, 'RELAY STATION 14'); }
    // ---- title block, legend, scale, north arrow
    mapTitle(x);
    // ---- paper wear: folds, fibres, edge browning, one old coffee ring
    x.save();
    x.globalCompositeOperation = 'multiply';
    for (const fxp of [0.25, 0.5, 0.75]) {
      const X = MP.W * fxp;
      const g = x.createLinearGradient(X - 6, 0, X + 6, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(150,130,100,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(X - 6, 0, 12, MP.H);
    }
    const gy = x.createLinearGradient(0, MP.H / 2 - 6, 0, MP.H / 2 + 6);
    gy.addColorStop(0, 'rgba(255,255,255,0)'); gy.addColorStop(0.5, 'rgba(150,130,100,0.35)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gy;
    x.fillRect(0, MP.H / 2 - 6, MP.W, 12);
    const eg = x.createRadialGradient(MP.W / 2, MP.H / 2, MP.H * 0.45, MP.W / 2, MP.H / 2, MP.W * 0.62);
    eg.addColorStop(0, 'rgba(255,255,255,0)');
    eg.addColorStop(1, 'rgba(160,120,70,0.45)');
    x.fillStyle = eg;
    x.fillRect(0, 0, MP.W, MP.H);
    x.strokeStyle = 'rgba(120,80,40,0.28)';
    x.lineWidth = 5;
    x.beginPath(); x.arc(MP.W * 0.9, MP.H * 0.2, 44, 0.3, TAU - 0.5); x.stroke();
    x.lineWidth = 1.5;
    x.beginPath(); x.arc(MP.W * 0.9 + 2, MP.H * 0.2 + 1, 40, 0, TAU); x.stroke();
    x.restore();
    drawGrain(x, MP.W, MP.H, 0.07, 'overlay', 1); // paper fibre
    // a previous operator's pencil: an arrow and "us"
    const st = stationAt;
    x.save();
    x.strokeStyle = 'rgba(70,70,80,0.45)';
    x.fillStyle = 'rgba(70,70,80,0.5)';
    x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(st[0] + 60, st[1] - 70); x.quadraticCurveTo(st[0] + 34, st[1] - 60, st[0] + 14, st[1] - 16); x.stroke();
    x.font = "italic 15px 'Special Elite', 'Liberation Mono', monospace";
    x.fillText('us', st[0] + 64, st[1] - 72);
    x.restore();
    return c;
  }
  function mapLabel(x, text, px, py, font, color, align) {
    x.save();
    x.font = font;
    x.textAlign = align || 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(236,227,202,0.92)';
    x.lineWidth = 4;
    x.strokeText(text, px, py);
    x.fillStyle = color;
    x.fillText(text, px, py);
    x.restore();
  }
  function waterLabel(x, text, px, py, ang, size) {
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    x.save();
    x.translate(px, py);
    x.rotate(ang);
    mapLabel(x, text.split('').join(String.fromCharCode(8202)), 0, -12, `italic ${size}px 'Liberation Serif', Georgia, serif`, '#2f6b8a', 'center');
    x.restore();
  }
  function drawStation(x, p, name) {
    x.save();
    x.translate(p[0], p[1]);
    x.fillStyle = '#9b1f16';
    x.strokeStyle = '#9b1f16';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -20); x.lineTo(-8, 6); x.lineTo(8, 6); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(0, -20); x.lineTo(0, 6); x.moveTo(-4, -6); x.lineTo(4, -6); x.stroke();
    x.beginPath(); x.arc(0, -22, 3, 0, TAU); x.fill();
    for (const rr of [9, 15]) {
      x.beginPath(); x.arc(0, -22, rr, -0.9, -0.2); x.stroke();
      x.beginPath(); x.arc(0, -22, rr, Math.PI + 0.2, Math.PI + 0.9); x.stroke();
    }
    x.fillRect(-6, 8, 12, 7);
    x.restore();
    mapLabel(x, name, p[0] + 18, p[1] + 14, "bold 15px 'Liberation Sans', Arial, sans-serif", '#8a1b13', 'left');
  }
  function mapTitle(x) {
    const y0 = MP.Y0 + MP.MH + 44;
    x.save();
    x.fillStyle = '#231d16';
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.font = "bold 20px 'Liberation Sans', Arial, sans-serif";
    x.fillText('COUNTY EMERGENCY SERVICES  —  RELAY STATION 14 SERVICE AREA', MP.X0, y0 + 20);
    x.font = "13px 'Liberation Sans', Arial, sans-serif";
    x.fillText('TOPOGRAPHIC SHEET 14   ·   SCALE 1:62 500   ·   CONTOUR INTERVAL 40 FEET   ·   SURVEYED 1971, ROADS REVISED 1994', MP.X0, y0 + 42);
    x.fillStyle = '#9b1f16';
    x.fillText('RESTRICTED — FOR STATION USE ONLY', MP.X0, y0 + 62);
    // legend
    const lx = MP.X0 + 900, ly = y0 + 6;
    const lrow = (i, draw, label) => {
      const yy = ly + i * 18;
      x.save(); x.translate(lx, yy); draw(); x.restore();
      x.fillStyle = '#231d16';
      x.font = "11px 'Liberation Sans', Arial, sans-serif";
      x.fillText(label, lx + 44, yy + 4);
    };
    const ln = (w, col, dash) => () => { x.setLineDash(dash || []); x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(0, 0); x.lineTo(34, 0); x.stroke(); x.setLineDash([]); };
    lrow(0, () => { ln(7.5, '#2b241c')(); ln(4.2, '#c9492f')(); }, 'PRIMARY ROAD');
    lrow(1, () => { ln(5, '#2b241c')(); ln(2.4, '#f3ecd8')(); }, 'LIGHT-DUTY ROAD');
    lrow(2, ln(1.6, '#2b241c', [7, 5]), 'FIRE ROAD / TRAIL');
    lrow(3, ln(2.6, '#3f7fa0'), 'STREAM');
    const lx2 = lx + 190;
    const lrow2 = (i, draw, label) => {
      const yy = ly + i * 18;
      x.save(); x.translate(lx2, yy); draw(); x.restore();
      x.fillStyle = '#231d16';
      x.font = "11px 'Liberation Sans', Arial, sans-serif";
      x.fillText(label, lx2 + 22, yy + 4);
    };
    lrow2(0, () => { x.fillStyle = '#2f7a3c'; x.fillRect(-4, -4, 9, 9); }, 'MILE MARKER');
    lrow2(1, () => { x.strokeStyle = '#1d1812'; x.lineWidth = 2; x.beginPath(); x.moveTo(-5, -5); x.lineTo(5, 5); x.moveTo(5, -5); x.lineTo(-5, 5); x.stroke(); }, 'QUARRY');
    lrow2(2, () => { x.strokeStyle = '#9b1f16'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -7); x.lineTo(-4, 5); x.lineTo(4, 5); x.closePath(); x.stroke(); }, 'RADIO RELAY');
    lrow2(3, () => { x.fillStyle = '#c4d8a8'; x.fillRect(-5, -5, 11, 10); }, 'WOODLAND');
    // scale bar
    const sx = MP.X0 + MP.MW - 250, sy = y0 + 20;
    x.fillStyle = '#231d16';
    for (let i = 0; i < 4; i++) {
      x.fillStyle = i % 2 ? '#f3ecd8' : '#231d16';
      x.fillRect(sx + i * 50, sy, 50, 7);
    }
    x.strokeStyle = '#231d16';
    x.lineWidth = 1;
    x.strokeRect(sx, sy, 200, 7);
    x.fillStyle = '#231d16';
    x.font = "11px 'Liberation Sans', Arial, sans-serif";
    x.textAlign = 'center';
    ['0', '1', '2', '3', '4 MILES'].forEach((t, i) => x.fillText(t, sx + i * 50 + (i === 4 ? 12 : 0), sy + 22));
    // north arrow
    const nx = MP.X0 + MP.MW - 20, ny = y0 + 30;
    x.beginPath(); x.moveTo(nx, ny - 30); x.lineTo(nx - 8, ny + 6); x.lineTo(nx, ny); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(nx, ny - 30); x.lineTo(nx + 8, ny + 6); x.lineTo(nx, ny); x.closePath(); x.stroke();
    x.font = "bold 12px 'Liberation Sans', Arial, sans-serif";
    x.fillText('N', nx, ny - 36);
    x.restore();
  }
  function locCenter(l) {
    if (l.pts.length === 1 || l.kind !== 'bridge') return l.pts[0];
    const a = l.pts[0], b = l.pts[l.pts.length - 1];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  /**
   * Nearest marked location to a sheet-pixel point. Points (places, markers, bridges) beat
   * lines (roads, creeks); the county line is not a location. With `find`, the target wins when
   * it is in reach, and a marker standing on the target road counts as the road.
   */
  function mapNearest(px, py, find) {
    let best = null, bd = Infinity;
    for (const l of mp.locs) {
      if (l.kind === 'border') continue;
      const line = l.kind === 'road' || l.kind === 'water';
      let d = line ? polyDist(px, py, l.pts.map(mpx)) : polyDist(px, py, [mpx(locCenter(l))]);
      if (!line) d *= 0.6;
      if (find && l.id === find && d < MAP_RADIUS * 1.35) d = -1;
      if (d < bd) { bd = d; best = l; }
    }
    if (!best || bd > MAP_RADIUS) return null;
    if (find && best.id !== find && best.road === find) return mp.locs.find((l) => l.id === find) || best;
    return best;
  }
  /** A hand-drawn pencil ellipse, revealed progressively. */
  function pencilMark(px, py, ok) {
    const r = U.mulberry32((px * 131 + py * 7) | 0);
    const rx = 24 + r() * 8, ry = rx * (0.72 + r() * 0.15), rot = (r() - 0.5) * 0.6, a0 = r() * TAU;
    const pts = [];
    const turns = 1.12 + r() * 0.1;
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, a = a0 + t * turns * TAU, wob = 1 + (r() - 0.5) * 0.06 + t * 0.06;
      const ex = Math.cos(a) * rx * wob, ey = Math.sin(a) * ry * wob;
      pts.push([px + ex * Math.cos(rot) - ey * Math.sin(rot), py + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    return { pts, t: 0, ok, fade: ok ? 0 : 1.6 };
  }
  function mapDrawMarks() {
    const x = mp.els.ov.getContext('2d');
    x.clearRect(0, 0, MP.W, MP.H);
    x.lineCap = x.lineJoin = 'round';
    if (mp.cur.on && !mp.done) {
      // the keyboard's pencil: a soft graphite crosshair with a gap at the point
      const cx = mp.cur.x, cy = mp.cur.y, r = 26, g = 7;
      x.strokeStyle = 'rgba(40,40,52,0.85)';
      x.lineWidth = 2.2;
      x.beginPath();
      x.moveTo(cx - r, cy); x.lineTo(cx - g, cy); x.moveTo(cx + g, cy); x.lineTo(cx + r, cy);
      x.moveTo(cx, cy - r); x.lineTo(cx, cy - g); x.moveTo(cx, cy + g); x.lineTo(cx, cy + r);
      x.stroke();
      x.strokeStyle = 'rgba(40,40,52,0.45)';
      x.lineWidth = 1.4;
      x.beginPath(); x.arc(cx, cy, 15, 0, TAU); x.stroke();
    }
    for (const m of mp.marks) {
      const n = Math.max(2, Math.floor(m.pts.length * U.clamp(m.t / 0.35, 0, 1)));
      const alpha = m.ok ? 0.85 : U.clamp(m.fade / 0.8, 0, 1) * 0.8;
      x.strokeStyle = `rgba(52,52,62,${alpha})`;
      x.lineWidth = 2.6;
      x.beginPath();
      for (let i = 0; i < n; i++) (i ? x.lineTo(m.pts[i][0], m.pts[i][1]) : x.moveTo(m.pts[i][0], m.pts[i][1]));
      x.stroke();
      x.strokeStyle = `rgba(52,52,62,${alpha * 0.35})`;
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i < n; i++) (i ? x.lineTo(m.pts[i][0] + 1.5, m.pts[i][1] + 1) : x.moveTo(m.pts[i][0] + 1.5, m.pts[i][1] + 1));
      x.stroke();
    }
  }
  function mapPop(text, px, py) {
    const el = mp.els.pop;
    el.textContent = text;
    el.style.left = (px / MP.W) * 100 + '%';
    el.style.top = (py / MP.H) * 100 + '%';
    el.classList.remove('hidden');
    el.style.opacity = '0';
    mp.pop = 2.2;
  }
  function mapClick(e) {
    if (mp.done || !devs.maplocate.isOpen) return;
    const rp = relPos(e, mp.els.ov);
    if (!rp.inside) return;
    mapMarkAt(rp.x * MP.W, rp.y * MP.H);
  }
  /** Keyboard (decision 14): arrows move the pencil (Shift: faster), Enter / Space marks there. */
  function clearMapKeys() { mp.held = {}; if (mp.cur) mp.cur.v = 0; }
  window.addEventListener('blur', clearMapKeys);
  function mapKeyMove(dt) {
    const h = mp.held, dx = (h.r ? 1 : 0) - (h.l ? 1 : 0), dy = (h.d ? 1 : 0) - (h.u ? 1 : 0);
    if (!dx && !dy) { mp.cur.v = 0; return false; }
    mp.cur.v = Math.min(1, (mp.cur.v || 0) + dt * 2.2); // ease in: fine placement, then it travels
    const sp = (h.fast ? 900 : 380) * (0.25 + 0.75 * mp.cur.v) * dt;
    const k = dx && dy ? Math.SQRT1_2 : 1;
    mp.cur.x = U.clamp(mp.cur.x + dx * sp * k, MP.X0 + 4, MP.X0 + MP.MW - 4);
    mp.cur.y = U.clamp(mp.cur.y + dy * sp * k, MP.Y0 + 4, MP.Y0 + MP.MH - 4);
    return true;
  }
  function mapMarkAt(px, py) {
    if (mp.done || !devs.maplocate.isOpen) return;
    if (px < MP.X0 || px > MP.X0 + MP.MW || py < MP.Y0 || py > MP.Y0 + MP.MH) return;
    const loc = mapNearest(px, py, mp.find);
    sfx('pen', { vol: 0.8 });
    const ok = !!loc && (!mp.find || loc.id === mp.find);
    const mark = pencilMark(px, py, ok);
    mp.marks.push(mark);
    if (!loc) { mapPop('Nothing marked here.', px, py); return; }
    if (!ok) { mapPop(`${loc.name || loc.label || loc.id} — not it.`, px, py); return; }
    mp.done = true;
    mp.pick = loc.id;
    mp.resolveT = 0.95;
  }
  device('maplocate', {
    opaque: true,
    cover(covered) { if (covered) clearMapKeys(); },
    exit: clearMapKeys,
    build(root) {
      const cv = U.el('canvas', { class: 'dv-map-cv', width: MP.W, height: MP.H });
      const ov = U.el('canvas', { class: 'dv-map-ov', width: MP.W, height: MP.H });
      ov.addEventListener('click', mapClick);
      const note = U.el('div', { class: 'dv-map-note hidden' });
      const pop = U.el('div', { class: 'dv-map-pop hidden' });
      root.appendChild(U.el('div', { class: 'dv-map-sheet' }, cv, ov,
        U.el('i', { class: 'dv-map-pin dv-tl' }), U.el('i', { class: 'dv-map-pin dv-tr' }),
        U.el('i', { class: 'dv-map-pin dv-bl' }), U.el('i', { class: 'dv-map-pin dv-br' }), note, pop));
      root.appendChild(closeHint('CLICK TO MARK  ·  ARROWS + ENTER  ·  E / ESC  BACK'));
      mp.els = { root, cv, ov, note, pop };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { mp.base = null; });
    },
    enter(arg) {
      // the sheet is drawn once per content source (and again after web fonts arrive)
      const src = (DA.content && DA.content.maplocs) || FALLBACK_LOCS;
      if (!mp.base || mp.src !== src) {
        mp.src = src;
        mp.locs = mapLocs();
        mp.base = mapBuild();
      }
      mp.els.cv.getContext('2d').drawImage(mp.base, 0, 0);
      mp.find = arg.find || null;
      mp.marks = [];
      mp.done = false;
      mp.pick = null;
      mp.resolveT = -1;
      mp.pop = 0;
      mp.els.pop.classList.add('hidden');
      // the keyboard pencil starts on the station (you are here)
      const home = (mp.locs || []).find((l) => l.kind === 'place' && /station/.test(l.id));
      const hp = home ? mpx(locCenter(home)) : [MP.X0 + MP.MW / 2, MP.Y0 + MP.MH / 2];
      mp.cur = { x: hp[0], y: hp[1], on: false, v: 0 };
      mp.held = {};
      const note = arg.note ? DA.fmt(arg.note) : '';
      mp.els.note.textContent = note;
      mp.els.note.classList.toggle('hidden', !note);
      mapDrawMarks();
      sfx('paper', { vol: 0.5 });
    },
    key(e, down) {
      const c = e.code;
      const dir = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' }[c];
      if (dir) {
        mp.held[dir] = down;
        mp.held.fast = e.shiftKey;
        if (down && !mp.cur.on) { mp.cur.on = true; mapDrawMarks(); }
        return true;
      }
      if (!down) return false;
      if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space') && !e.repeat) {
        if (!mp.cur.on) { mp.cur.on = true; mapDrawMarks(); return true; }
        mapMarkAt(mp.cur.x, mp.cur.y);
        mapDrawMarks();
        return true;
      }
      return false;
    },
    update(dt) {
      let dirty = false;
      if (mp.cur.on && mapKeyMove(dt)) dirty = true;
      for (let i = mp.marks.length - 1; i >= 0; i--) {
        const m = mp.marks[i];
        if (m.t < 0.4) { m.t += dt; dirty = true; }
        if (!m.ok && m.t >= 0.35) {
          m.fade -= dt;
          dirty = true;
          if (m.fade <= 0) mp.marks.splice(i, 1);
        }
      }
      if (dirty) mapDrawMarks();
      if (mp.pop > 0) {
        mp.pop -= dt;
        mp.els.pop.style.opacity = String(Math.min(1, (2.2 - mp.pop) / 0.15, mp.pop / 0.5));
        if (mp.pop <= 0) mp.els.pop.classList.add('hidden');
      }
      if (mp.resolveT > 0) {
        mp.resolveT -= dt;
        if (mp.resolveT <= 0) {
          const id = mp.pick;
          DA.bus.emit('map:located', { id, find: mp.find });
          closeDev('maplocate', id);
        }
      }
    },
    canClose: () => !mp.done,
  });
  D.map = {
    open: (opts) => openDev('maplocate', opts || {}),
    /** The keyboard pencil in sheet pixels {x, y, on} (+ where a place is: at(locId) → {x, y}). */
    cursor: () => Object.assign({}, mp.cur),
    at: (id) => { const l = (mp.locs || []).find((q) => q.id === id); if (!l) return null; const p = mpx(locCenter(l)); return { x: p[0], y: p[1] }; },
  };
  D.maplocate = D.map;

  /* =========================================================== PAPERWORK */
  /*
   * The night shift report on the office desk. Fields come from DA.content.docs.doc_shift_form
   * ({title, body, fields [{id, label, kind:'text'|'select', options, value, answer, readonly}],
   * signLabel}) with built-in defaults. Read-only fields type themselves in; select fields are
   * pencilled (circle one); the traffic count is filled from DA.v('logged'); the last mast
   * reading comes from flag weather_read; remarks are tick-box presets; clicking the signature
   * line signs it. FILE REPORT → paperwork:done and {complete: true, accurate, answers, remarks}.
   */
  const PW_REMARKS = [
    'Nothing unusual to report.',
    'Corridor breaker (C) tripped — reset.',
    'Assisted motorist via CB / dispatch.',
    'Weather deteriorating.',
    'Equipment fault — see log.',
    'Traffic on reserved frequency — logged only.',
  ];
  const PW_DEFAULT_FIELDS = [
    { id: 'operator', label: 'Operator', kind: 'text', value: '{NAME}', readonly: true },
    { id: 'date', label: 'Date', kind: 'text', value: '{DATE}', readonly: true },
    { id: 'wind', label: 'Wind', kind: 'select', options: ['Calm', 'Light', 'Moderate', 'Strong / gusting'] },
    { id: 'traffic', label: 'Transmissions logged', kind: 'select', options: ['None', '1–2', '3–5', '6 or more'] },
    { id: 'remarks', label: 'Remarks', kind: 'text' },
  ];
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  const pw = { els: null, sel: {}, remarks: [], signed: false, filing: 0, readOnly: false, model: null, result: null };
  function pwDoc() {
    const d = DA.content && DA.content.docs && DA.content.docs.doc_shift_form;
    return d && typeof d === 'object' ? d : {};
  }
  function seededShuffle(arr, r) {
    for (let i = arr.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  const stripMarks = (t) => DA.fmt(String(t)).replace(/\*\*|__|^#+\s*/g, '').trim();
  /** Mast reading choices: the true reading (if taken) among plausible alternatives. */
  function pwMastOptions() {
    const wr = DA.flag('weather_read');
    const truth = wr && typeof wr === 'object' && wr.pressure ? wr : null;
    const r = U.mulberry32(U.hash('pw' + JSON.stringify(truth || 0)));
    const pin = truth && isFinite(truth.pressureIn) ? truth.pressureIn : 29.64;
    const rain = truth && isFinite(truth.rainRate) ? truth.rainRate : 0.42;
    const P = (v, t) => `${v.toFixed(2)} ${t}`;
    const R = (v) => `${v.toFixed(2)} in/h`;
    const rows = {
      mast_pressure: [truth ? truth.pressure.replace(' inHg', '') : P(pin, 'FALLING'), P(pin + 0.21, 'STEADY'), P(pin - 0.34, 'FALLING'), P(pin + 0.43, 'RISING')],
      mast_rain: [truth ? truth.rain.toLowerCase() : R(rain), R(rain + 0.3), R(Math.max(0.02, rain - 0.3)), 'nil'],
    };
    const t = truth ? { mast_pressure: rows.mast_pressure[0], mast_rain: rows.mast_rain[0] } : {};
    for (const k in rows) seededShuffle(rows[k], r);
    return { rows, truth: t, time: truth ? truth.time : null };
  }
  /** Which option of a 4-bucket traffic select matches n logged transmissions. */
  function trafficBucket(options, n) {
    if (!options || options.length < 2) return null;
    if (options.length === 4) return options[n <= 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3];
    return options[Math.min(options.length - 1, n)];
  }
  function windBucket(options, mph) {
    if (!options || options.length !== 4 || !isFinite(mph)) return null;
    return options[mph < 4 ? 0 : mph < 13 ? 1 : mph < 25 ? 2 : 3];
  }
  /** Build the form model from content (or defaults) + the current game. */
  function pwModel(saved) {
    const doc = pwDoc();
    const paras = String(doc.body || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
    const head = paras.find((t) => /^#\s/.test(t));
    const sub = paras.find((t) => /^\*\*/.test(t));
    const small = paras.length > 1 ? paras[paras.length - 1] : '';
    const logged = saved && saved.when ? saved.when.logged : DA.v('logged');
    const wr = DA.flag('weather_read');
    const m = {
      title: stripMarks(head || doc.title || 'NIGHT SHIFT REPORT').toUpperCase(),
      sub: sub ? stripMarks(sub) : 'RELAY STATION 14  ·  FORM NS-2',
      small: small && small !== head && small !== sub && small.length < 160 ? stripMarks(small) : 'Complete before relief. Print clearly.',
      signLabel: DA.fmt(doc.signLabel || 'Operator signature'),
      top: [], rows: [], mast: null, remarks: [],
    };
    const fields = Array.isArray(doc.fields) && doc.fields.length ? doc.fields : PW_DEFAULT_FIELDS;
    let placeholder = '';
    for (const f of fields) {
      const label = DA.fmt(f.label || f.id);
      if (f.kind === 'select' && Array.isArray(f.options)) {
        const options = f.options.map((o) => DA.fmt(o));
        const row = { id: f.id, label, options, truth: f.answer != null ? DA.fmt(f.answer) : null };
        if (/traffic|transmission/i.test(f.id + ' ' + label)) { row.auto = trafficBucket(options, logged); row.truth = row.auto; row.note = String(logged); }
        if (/wind/i.test(f.id) && wr && isFinite(wr.windMph)) row.truth = windBucket(options, wr.windMph) || row.truth;
        m.rows.push(row);
      } else if (f.readonly || f.value != null) {
        m.top.push({ id: f.id, label, value: DA.fmt(f.value != null ? f.value : '') });
      } else if (f.kind === 'text') {
        placeholder = f.placeholder || '';
      }
    }
    if (!m.top.some((f) => f.id === 'time')) {
      const i = m.top.findIndex((f) => f.id === 'date');
      m.top.splice(i >= 0 ? i + 1 : m.top.length, 0, { id: 'time', label: 'Time', value: saved && saved.when ? saved.when.time : DA.clock.hhmm() });
    }
    if (saved && saved.when) for (const f of m.top) if (f.id === 'date') f.value = saved.when.date;
    if (!m.rows.some((r) => r.auto != null || r.note)) m.logged = logged;
    const mo = saved && saved.mast ? saved.mast : pwMastOptions();
    m.mast = mo;
    m.rows.push({ id: 'mast_pressure', label: 'Barometer (inHg)', options: mo.rows.mast_pressure, truth: mo.truth.mast_pressure || null, mast: true });
    m.rows.push({ id: 'mast_rain', label: 'Rain rate', options: mo.rows.mast_rain, truth: mo.truth.mast_rain || null, mast: true });
    const fromPlaceholder = String(placeholder).split(/(?<=\.)\s+/).map((t) => t.trim()).filter(Boolean);
    m.remarks = Array.isArray(doc.remarks) && doc.remarks.length ? doc.remarks.map((t) => DA.fmt(t)) : fromPlaceholder.concat(PW_REMARKS).slice(0, 6);
    return m;
  }
  /** Hand-drawn pencil ellipse path in a 100×40 box. */
  function pencilEllipsePath(seed) {
    const r = U.mulberry32(seed);
    const a0 = r() * TAU, turns = 1.1 + r() * 0.1;
    let d = '';
    for (let k = 0; k <= 36; k++) {
      const t = k / 36, a = a0 + t * turns * TAU, w = 1 + (r() - 0.5) * 0.05 + t * 0.05;
      const x = 50 + Math.cos(a) * 48 * w, y = 20 + Math.sin(a) * 17 * w;
      d += (k ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }
  /** A signature-like scribble for the player's name → {d, w}. */
  function signaturePath(name) {
    const r = U.mulberry32(U.hash(String(name) + '/sig'));
    let x = 10;
    const y = 40;
    let d = `M${x} ${y + 4} C ${x + 2} ${y - 30}, ${x + 26} ${y - 36}, ${x + 18} ${y - 2} S ${x + 4} ${y + 6}, ${x + 22} ${y}`;
    x += 22;
    const n = U.clamp(String(name).replace(/\s+/g, '').length, 4, 11);
    for (let i = 0; i < n; i++) {
      const h = (i === 0 ? 18 : 6) + r() * 14, w = 9 + r() * 9;
      d += ` C ${(x + w * 0.15).toFixed(1)} ${(y - h).toFixed(1)}, ${(x + w * 0.7).toFixed(1)} ${(y - h).toFixed(1)}, ${(x + w * 0.55).toFixed(1)} ${y}`;
      if (r() < 0.3) d += ` C ${(x + w * 0.45).toFixed(1)} ${y + 16}, ${(x + w * 0.95).toFixed(1)} ${y + 12}, ${(x + w).toFixed(1)} ${y - 3}`;
      x += w;
    }
    d += ` C ${x + 18} ${y - 8}, ${x + 12} ${y + 12}, ${(x * 0.55).toFixed(1)} ${y + 12} S ${(x * 0.15).toFixed(1)} ${y + 18}, ${(x * 0.35).toFixed(1)} ${y + 9}`;
    return { d, w: x + 26 };
  }
  function svgEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  /** Pencil a circle round an option (restored marks are drawn without the stroke animation). */
  function pwCircle(span, seed, restored) {
    const svg = svgEl('svg', { class: 'dv-pw-circ' + (restored ? ' dv-pw-done' : ''), viewBox: '0 0 100 40', preserveAspectRatio: 'none' });
    svg.appendChild(svgEl('path', { d: pencilEllipsePath(seed), pathLength: '1', 'vector-effect': 'non-scaling-stroke' }));
    span.appendChild(svg);
  }
  function pwComplete() {
    return !!pw.model && pw.model.rows.every((r) => r.auto != null || pw.sel[r.id]) && pw.signed;
  }
  function pwRefresh() {
    pw.els.file.disabled = !pwComplete() || pw.readOnly;
    pw.els.file.classList.toggle('hidden', pw.readOnly);
  }
  /** Circle one option of a row (mouse click or keyboard). */
  function pwPick(row, opt, sp, box) {
    if (pw.readOnly || pw.filing || row.auto != null) return;
    box.querySelectorAll('.dv-pw-circ').forEach((c) => c.remove());
    pw.sel[row.id] = opt;
    pwCircle(sp, U.hash(row.id + opt + Math.random()));
    sfx('pen', { vol: 0.6 });
    pwRefresh();
  }
  function pwRow(row) {
    const el = U.el('div', { class: 'dv-pw-opts' + (row.auto != null ? ' dv-pw-auto' : '') }, U.el('span', { class: 'dv-pw-lbl' }, row.label));
    const box = U.el('div', { class: 'dv-pw-choices' });
    const spans = [];
    for (const opt of row.options) {
      const sp = U.el('span', { class: 'dv-pw-opt' }, opt);
      const chosen = row.auto != null ? row.auto === opt : pw.sel[row.id] === opt;
      if (chosen) pwCircle(sp, U.hash(row.id + opt), true);
      if (row.auto == null) sp.addEventListener('click', () => pwPick(row, opt, sp, box));
      box.appendChild(sp);
      spans.push(sp);
    }
    if (row.note) box.appendChild(U.el('span', { class: 'dv-pw-fill dv-pw-note' }, row.note));
    el.appendChild(box);
    // keyboard: a focusable line whose ← → moves along the options, Enter / Space circles one
    if (row.auto == null) {
      const cur = Math.max(0, row.options.indexOf(pw.sel[row.id]));
      pw.focus.push({ kind: 'row', el, row, box, spans, oi: cur, act: (f) => pwPick(row, row.options[f.oi], spans[f.oi], box) });
    }
    return el;
  }
  /* ---- keyboard (decision 14): ↑ ↓ / Tab move between lines, ← → between options, Enter / Space
   *      circle, tick or sign, S signs, F files. The pencil outline shows only once keys are used. */
  function pwPaintFocus() {
    pw.focus.forEach((f, i) => {
      const on = pw.kb && i === pw.fi;
      f.el.classList.toggle('dv-kb', on);
      if (f.spans) f.spans.forEach((sp, k) => sp.classList.toggle('dv-kb-opt', on && k === f.oi));
    });
    const f = pw.kb && pw.focus[pw.fi];
    if (f && f.el.scrollIntoView) f.el.scrollIntoView({ block: 'nearest' });
  }
  function pwMove(d) {
    const n = pw.focus.length;
    if (!n) return;
    pw.fi = pw.kb ? (pw.fi + d + n) % n : pw.fi;
    pw.kb = true;
    pwPaintFocus();
  }
  function pwBuildForm() {
    const e = pw.els, s = S();
    const saved = s.paper || {};
    const done = !!saved.done;
    pw.readOnly = done;
    pw.model = pwModel(done ? saved : null);
    pw.sel = Object.assign({}, saved.sel || {});
    pw.remarks = Array.isArray(saved.remarks) ? saved.remarks.slice() : [];
    pw.signed = !!saved.signed;
    pw.filing = 0;
    pw.focus = [];
    pw.fi = 0;
    pw.kb = false;
    pw.when = done && saved.when ? saved.when : { date: DA.clock.date(), time: DA.clock.hhmm(), logged: DA.v('logged') };
    const m = pw.model;
    e.paper.textContent = '';
    const fill = (t) => U.el('span', { class: 'dv-pw-fill' }, t);
    e.paper.appendChild(U.el('div', { class: 'dv-pw-head' },
      U.el('div', { class: 'dv-pw-org' }, m.sub),
      U.el('div', { class: 'dv-pw-title' }, m.title)));
    e.paper.appendChild(U.el('div', { class: 'dv-pw-row3' },
      m.top.map((f) => U.el('div', { class: 'dv-pw-field' + (f.id === 'operator' ? ' dv-pw-wide' : '') }, U.el('span', { class: 'dv-pw-lbl' }, f.label), fill(f.value)))));
    const shift = m.rows.filter((r) => !r.mast), mast = m.rows.filter((r) => r.mast);
    let n = 1;
    if (shift.length) {
      e.paper.appendChild(U.el('div', { class: 'dv-pw-sec' }, `${n++}.  SHIFT CHECKLIST `, U.el('small', null, '(circle one)')));
      for (const r of shift) e.paper.appendChild(pwRow(r));
    }
    if (m.logged != null) e.paper.appendChild(U.el('div', { class: 'dv-pw-sec' }, `${n++}.  TRANSMISSIONS LOGGED `, fill(String(m.logged))));
    e.paper.appendChild(U.el('div', { class: 'dv-pw-sec' }, `${n++}.  LAST MAST READING `,
      m.mast.time ? fill(m.mast.time) : U.el('small', null, '(not taken — check the mast)'), U.el('small', null, ' (circle one)')));
    for (const r of mast) e.paper.appendChild(pwRow(r));
    e.paper.appendChild(U.el('div', { class: 'dv-pw-sec' }, `${n++}.  REMARKS `, U.el('small', null, '(tick all that apply)')));
    const checks = U.el('div', { class: 'dv-pw-checks' });
    for (const t of m.remarks) {
      const box = U.el('span', { class: 'dv-pw-box' });
      const row = U.el('div', { class: 'dv-pw-check' }, box, U.el('span', null, t));
      const tick = (restored) => {
        const svg = svgEl('svg', { class: 'dv-pw-tick' + (restored ? ' dv-pw-done' : ''), viewBox: '0 0 24 24' });
        svg.appendChild(svgEl('path', { d: 'M3 13 C 6 15, 8 18, 9 21 C 12 13, 16 7, 23 2', pathLength: '1' }));
        box.appendChild(svg);
      };
      if (pw.remarks.includes(t)) tick(true);
      const toggle = () => {
        if (pw.readOnly || pw.filing) return;
        const i = pw.remarks.indexOf(t);
        if (i >= 0) { pw.remarks.splice(i, 1); box.textContent = ''; }
        else { pw.remarks.push(t); tick(); sfx('pen', { vol: 0.5 }); }
        pwRefresh();
      };
      row.addEventListener('click', toggle);
      pw.focus.push({ kind: 'check', el: row, act: toggle });
      checks.appendChild(row);
    }
    e.paper.appendChild(checks);
    e.paper.appendChild(U.el('div', { class: 'dv-pw-small' }, m.small));
    const sig = signaturePath(DA.state.playerName);
    const sigSvg = svgEl('svg', { class: 'dv-pw-sig' + (pw.signed ? ' dv-pw-done' : ''), viewBox: `0 0 ${Math.round(sig.w)} 64`, preserveAspectRatio: 'xMinYMid meet' });
    const sigBox = U.el('div', { class: 'dv-pw-sigbox' + (pw.signed ? ' dv-signed' : '') }, sigSvg, U.el('span', { class: 'dv-pw-sighint' }, 'click or S to sign'));
    if (pw.signed) sigSvg.appendChild(svgEl('path', { d: sig.d, pathLength: '1' }));
    const sign = () => {
      if (pw.readOnly || pw.signed || pw.filing) return;
      pw.signed = true;
      sigSvg.classList.remove('dv-pw-done');
      sigBox.classList.add('dv-signed');
      sigSvg.appendChild(svgEl('path', { d: sig.d, pathLength: '1' }));
      sfx('pen');
      pwRefresh();
    };
    sigBox.addEventListener('click', sign);
    pw.sign = sign;
    pw.focus.push({ kind: 'sign', el: sigBox, act: sign });
    e.file = U.el('button', { class: 'dv-pw-file', onclick: pwFile }, 'FILE REPORT');
    pw.focus.push({ kind: 'file', el: e.file, act: pwFile });
    e.paper.appendChild(U.el('div', { class: 'dv-pw-signrow' }, U.el('span', { class: 'dv-pw-lbl' }, m.signLabel), sigBox, e.file));
    e.stamp = U.el('div', { class: 'dv-pw-stamp' + (done ? ' dv-on' : '') }, 'FILED', U.el('small', null, done ? saved.filedAt || '' : ''));
    e.paper.appendChild(e.stamp);
    pwRefresh();
  }
  function pwSave(extra) {
    const s = S();
    s.paper = Object.assign({}, s.paper || {}, {
      sel: Object.assign({}, pw.sel), remarks: pw.remarks.slice(), signed: pw.signed,
      mast: pw.model ? pw.model.mast : null, when: pw.when,
    }, extra || {});
  }
  function pwFile() {
    if (!pwComplete() || pw.readOnly || pw.filing) return;
    const answers = {};
    let accurate = true;
    for (const r of pw.model.rows) {
      const v = r.auto != null ? r.auto : pw.sel[r.id];
      answers[r.id] = v;
      if (r.truth != null && v !== r.truth) accurate = false;
      if (r.mast && r.truth == null) accurate = false; // no reading was taken
    }
    const filedAt = DA.clock.hhmm();
    pwSave({ done: true, filedAt, accurate });
    pw.readOnly = true;
    pw.filing = 1.1;
    pw.els.stamp.lastChild.textContent = filedAt;
    pw.els.stamp.classList.add('dv-on', 'dv-thump');
    pwRefresh();
    sfx('paper');
    DA.timers.after(0.25, () => sfx('switch', { vol: 0.5, rate: 0.6 }), 'dv_pw');
    const res = { complete: true, accurate, answers, remarks: pw.remarks.slice() };
    pw.result = res;
    DA.bus.emit('paperwork:done', res);
  }
  device('paperwork', {
    opaque: true,
    cancel: () => ({ complete: false }),
    build(root) {
      const paper = U.el('div', { class: 'dv-pw-paper' });
      root.appendChild(U.el('div', { class: 'dv-pw-desk' },
        U.el('div', { class: 'dv-pw-carbon' }), paper,
        U.el('div', { class: 'dv-pw-pencil' })));
      root.appendChild(closeHint('CLICK OR ↑ ↓ ← →  ENTER\nS  SIGN  ·  F  FILE\nE / ESC  BACK'));
      pw.els = { root, paper };
    },
    key(e, down) {
      if (!down || pw.readOnly || pw.filing) return false;
      const c = e.code;
      if (c === 'ArrowDown' || (c === 'Tab' && !e.shiftKey)) { pwMove(1); return true; }
      if (c === 'ArrowUp' || (c === 'Tab' && e.shiftKey)) { pwMove(-1); return true; }
      const f = pw.focus[pw.fi];
      if ((c === 'ArrowLeft' || c === 'ArrowRight') && f && f.kind === 'row' && pw.kb) {
        f.oi = (f.oi + (c === 'ArrowRight' ? 1 : -1) + f.spans.length) % f.spans.length;
        pwPaintFocus();
        return true;
      }
      if (c === 'ArrowLeft' || c === 'ArrowRight') { pwMove(0); return true; }
      if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space') && !e.repeat) {
        if (!pw.kb) { pwMove(0); return true; }
        if (f) f.act(f);
        if (f && f.kind === 'row') pwMove(1); // circled: on to the next line
        return true;
      }
      if (c === 'KeyS' && !e.repeat) { if (pw.sign) pw.sign(); pw.kb = true; pw.fi = pw.focus.findIndex((x) => x.kind === 'sign'); pwPaintFocus(); return true; }
      if (c === 'KeyF' && !e.repeat) { pwFile(); return true; }
      return false;
    },
    enter() {
      pw.result = null;
      pwBuildForm();
      sfx('paper', { vol: 0.6 });
    },
    exit() {
      if (!pw.readOnly) pwSave();
    },
    update(dt) {
      if (pw.filing > 0) {
        pw.filing -= dt;
        if (pw.filing <= 0) closeDev('paperwork', pw.result || { complete: true });
      }
    },
    canClose: () => !(pw.filing > 0),
  });
  D.paperwork = { open: () => openDev('paperwork') };

  /* ============================================================ CALENDAR */
  const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const cal = { els: null, tearing: 0 };
  function calShown() { return DA.flag('calendar_date') || '26 OCT 1999'; }
  /** '26 OCT 1999' → UTC ms (null if unparseable). */
  function calParse(str) {
    const m = /^\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s*$/i.exec(String(str));
    if (!m) return null;
    const mo = DA.clock.MON.indexOf(m[2].toUpperCase());
    if (mo < 0) return null;
    return Date.UTC(+m[3], mo, +m[1]);
  }
  function calFmt(ms) {
    const d = new Date(ms);
    return `${U.pad(d.getUTCDate())} ${DA.clock.MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  function calPage(str) {
    const ms = calParse(str);
    if (ms == null) {
      return U.el('div', { class: 'dv-cal-page' }, U.el('div', { class: 'dv-cal-month' }, '—'), U.el('div', { class: 'dv-cal-day' }, '??'), U.el('div', { class: 'dv-cal-wd' }, String(str)));
    }
    const d = new Date(ms), y = d.getUTCFullYear();
    const doy = Math.round((ms - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const left = Math.round((Date.UTC(y, 11, 31) - ms) / 86400000);
    const week = Math.ceil((doy + new Date(Date.UTC(y, 0, 1)).getUTCDay()) / 7);
    const wd = d.getUTCDay();
    // the whole month in miniature, today boxed
    const mo = d.getUTCMonth(), first = new Date(Date.UTC(y, mo, 1)).getUTCDay(), days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const mini = U.el('div', { class: 'dv-cal-mini' }, 'SMTWTFS'.split('').map((c, i) => U.el('b', { class: i === 0 ? 'dv-red' : null }, c)));
    for (let i = 0; i < first; i++) mini.appendChild(U.el('span'));
    for (let dd = 1; dd <= days; dd++) {
      const cls = [(first + dd - 1) % 7 === 0 ? 'dv-red' : '', dd === d.getUTCDate() ? 'dv-today' : ''].join(' ').trim();
      mini.appendChild(U.el('span', { class: cls || null }, String(dd)));
    }
    return U.el('div', { class: 'dv-cal-page' + (wd === 0 ? ' dv-sun' : '') },
      U.el('div', { class: 'dv-cal-month' }, U.el('span', null, MONTHS[d.getUTCMonth()]), U.el('span', null, String(y))),
      U.el('div', { class: 'dv-cal-day' }, String(d.getUTCDate())),
      U.el('div', { class: 'dv-cal-wd' }, WEEKDAYS[wd]),
      mini,
      U.el('div', { class: 'dv-cal-foot' }, U.el('span', null, `WEEK ${week}`), U.el('span', null, `DAY ${doy} · ${left} TO GO`)));
  }
  function calCanTear() {
    const shown = calParse(calShown());
    if (shown == null || DA.clock.min < 1440) return false;
    const p = DA.clock.parts();
    return shown < Date.UTC(p.y, p.mo, p.d);
  }
  function calRender() {
    const e = cal.els, str = calShown();
    e.pad.querySelectorAll('.dv-cal-page').forEach((p) => p.remove());
    const ms = calParse(str);
    const next = ms != null ? calPage(calFmt(ms + 86400000)) : null;
    if (next) { next.classList.add('dv-cal-under'); e.pad.appendChild(next); }
    const page = calPage(str);
    page.addEventListener('click', calTear);
    e.pad.appendChild(page);
    e.page = page;
    const can = calCanTear();
    e.tear.classList.toggle('hidden', !can);
    e.pad.classList.toggle('dv-can', can);
    e.stub.classList.toggle('hidden', !DA.flag('calendar_date'));
  }
  function calTear() {
    if (cal.tearing > 0 || !calCanTear()) return;
    const ms = calParse(calShown());
    const next = calFmt(ms + 86400000);
    cal.tearing = 0.75;
    cal.els.page.classList.add('dv-cal-tearing');
    cal.els.tear.classList.add('hidden');
    sfx('paper');
    DA.setFlag('calendar_date', next);
    DA.bus.emit('calendar:flipped', { date: next });
  }
  device('calendar', {
    dim: true,
    clickOutside: true,
    build(root) {
      const pad = U.el('div', { class: 'dv-cal-pad' }, U.el('div', { class: 'dv-cal-back' }));
      const stub = U.el('div', { class: 'dv-cal-stub hidden' });
      const tear = U.el('button', { class: 'da-btn dv-cal-tearbtn hidden', onclick: calTear }, 'Tear off the page');
      root.appendChild(U.el('div', { class: 'dv-cal-wrap' },
        U.el('div', { class: 'dv-cal-stand' }), pad, U.el('div', { class: 'dv-cal-bind' }, U.el('i'), U.el('i')), stub));
      root.appendChild(tear);
      root.appendChild(closeHint());
      cal.els = { root, pad, tear, stub, page: null };
    },
    enter() {
      cal.tearing = 0;
      calRender();
    },
    update(dt) {
      if (cal.tearing > 0) {
        cal.tearing -= dt;
        if (cal.tearing <= 0) calRender();
      }
    },
    key(e, down) {
      if (down && !e.repeat && (e.code === 'Space' || e.code === 'Enter') && calCanTear()) { calTear(); return true; }
      return false;
    },
  });
  D.calendar = { open: () => openDev('calendar'), date: calShown };

  /* ============================================================= BREAKER */
  const BREAKERS = [['A', 'MAIN LIGHTING'], ['B', 'RADIO ROOM'], ['C', 'CORRIDOR'], ['D', 'KITCHEN'], ['E', 'EQUIPMENT'], ['F', 'EXTERIOR']];
  const brk = { els: null, busy: {}, sel: 0, kb: false };
  /** Keyboard selection (decision 14): ↑↓ / W S move, Enter / Space throws it, 1–6 pick A–F. */
  function brkSelect(i, kb) {
    brk.sel = (i + BREAKERS.length) % BREAKERS.length;
    if (kb) brk.kb = true;
    for (let k = 0; k < BREAKERS.length; k++) brk.els.rows[BREAKERS[k][0]].root.classList.toggle('dv-kb', brk.kb && k === brk.sel);
  }
  function brkState(id) {
    const b = DA.state.world && DA.state.world.breakers;
    return !(b && b[id] === false);
  }
  function brkRender() {
    for (const [id] of BREAKERS) {
      const row = brk.els.rows[id];
      if (brk.busy[id]) continue;
      const on = brkState(id);
      row.handle.className = 'dv-brk-handle ' + (on ? 'dv-on' : 'dv-trip');
      row.root.classList.toggle('dv-tripped', !on);
    }
  }
  function brkClick(id) {
    const row = brk.els.rows[id];
    if (brk.busy[id]) return;
    if (brkState(id)) {
      row.handle.classList.remove('dv-wiggle');
      void row.handle.offsetWidth;
      row.handle.classList.add('dv-wiggle');
      sfx('switch', { vol: 0.25 });
      return;
    }
    // a tripped breaker must be pushed fully OFF before it will latch ON
    brk.busy[id] = true;
    row.handle.className = 'dv-brk-handle dv-off';
    sfx('switch', atIt('breaker_panel', { vol: 0.8 }));
    DA.timers.after(0.38, () => {
      row.handle.className = 'dv-brk-handle dv-on';
      row.root.classList.remove('dv-tripped');
      sfx('breaker_reset', atIt('breaker_panel'));
      wsub('breakers')[id] = true;
      if (id === 'C' && DA.world && DA.world.setPower) safe(() => DA.world.setPower('corridor', true));
      delete brk.busy[id];
      DA.bus.emit('breaker:reset', { id });
    }, 'dv_breaker');
  }
  device('breaker', {
    dim: true,
    clickOutside: true,
    build(root) {
      const rows = {};
      const panel = U.el('div', { class: 'dv-brk-panel' },
        U.el('div', { class: 'dv-brk-mainbrk' }, U.el('span', null, 'MAIN'), U.el('b', null, '100'), U.el('div', { class: 'dv-brk-handle dv-on dv-brk-fixed' })));
      for (const [id, label] of BREAKERS) {
        const handle = U.el('div', { class: 'dv-brk-handle dv-on' });
        const r = U.el('div', { class: 'dv-brk-row', onclick: () => brkClick(id) },
          U.el('span', { class: 'dv-brk-tag' }, id),
          U.el('div', { class: 'dv-brk-unit' }, U.el('span', { class: 'dv-brk-amp' }, '20'), U.el('div', { class: 'dv-brk-slot' }, handle),
            U.el('span', { class: 'dv-brk-onoff' }, U.el('i', null, 'ON'), U.el('i', null, 'OFF'))),
          U.el('span', { class: 'dv-brk-label' }, label));
        rows[id] = { root: r, handle };
        panel.appendChild(r);
      }
      const card = U.el('div', { class: 'dv-brk-card' },
        U.el('div', { class: 'dv-brk-cardh' }, 'CIRCUIT DIRECTORY'),
        BREAKERS.map(([id, label]) => U.el('div', { class: 'dv-brk-cardr' }, U.el('b', null, id), U.el('span', null, label.toLowerCase()))),
        U.el('div', { class: 'dv-brk-note' }, 'C trips when it rains hard.', U.el('br'), 'Push it all the way OFF then ON. — H.'));
      root.appendChild(U.el('div', { class: 'dv-brk-box' },
        U.el('div', { class: 'dv-brk-door' }, card, U.el('div', { class: 'dv-brk-warn' }, '⚠ 120/240 V')),
        U.el('div', { class: 'dv-brk-body' }, U.el('div', { class: 'dv-brk-plate' }, 'PANEL W-1  ·  WORKSHOP'), panel)));
      root.appendChild(closeHint('CLICK A BREAKER  ·  ↑ ↓  ENTER  ·  E / ESC  BACK'));
      brk.els = { root, rows };
    },
    enter() {
      brk.busy = {};
      brkRender();
      // the keyboard cursor starts on the tripped breaker (usually C)
      const tripped = BREAKERS.findIndex(([id]) => !brkState(id));
      brk.kb = false;
      brkSelect(tripped >= 0 ? tripped : 0, false);
      sfx('door_open', atIt('breaker_panel', { vol: 0.3, rate: 1.6 }));
    },
    key(e, down) {
      if (!down) return false;
      const c = e.code;
      if (c === 'ArrowDown' || c === 'KeyS') { brkSelect(brk.sel + 1, true); return true; }
      if (c === 'ArrowUp' || c === 'KeyW') { brkSelect(brk.sel - 1, true); return true; }
      if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space') && !e.repeat) { brkSelect(brk.sel, true); brkClick(BREAKERS[brk.sel][0]); return true; }
      const m = /^(?:Digit|Numpad)([1-6])$/.exec(c) || /^Key([ABCDF])$/.exec(c);
      if (m && !e.repeat) {
        const i = /\d/.test(m[1]) ? +m[1] - 1 : BREAKERS.findIndex(([id]) => id === m[1]);
        brkSelect(i, true);
        brkClick(BREAKERS[i][0]);
        return true;
      }
      return false;
    },
    update(dt) {
      // follow trips that happen while the panel is open
      brk.acc = (brk.acc || 0) + dt;
      if (brk.acc > 0.4) { brk.acc = 0; brkRender(); }
    },
  });
  D.breaker = { open: () => openDev('breaker') };

  /* =============================================================== TAPES */
  /*
   * The records room shelves: decades of cassette cases stacked flat, spines out. Most are
   * routine station logs; the ones that should not exist can be taken.
   */
  const RECORD_TAPES = ['tape_1954', 'tape_1932', 'tape_1901', 'tape_1887', 'tape_first_contact', 'tape_do_not_duplicate', 'tape_name'];
  const TAPE_FALLBACK = {
    tape_1954: { label: 'PROJ. LONGWAVE — REEL 3', year: 1954 },
    tape_1932: { label: 'SURVEY — HOLLOW CREEK', year: 1932 },
    tape_1901: { label: 'SIGNAL — UNATTRIBUTED', year: 1901 },
    tape_1887: { label: 'NO LABEL', year: 1887 },
    tape_first_contact: { label: 'FIRST CONTACT', year: null },
    tape_do_not_duplicate: { label: 'DO NOT DUPLICATE', year: null },
    tape_name: { label: '{NAME_UP}', year: 1961 },
    tape_op_loop: { label: 'TO WHOEVER IS NEXT', year: 1987 },
    tape_op_survive: { label: 'TO WHOEVER IS NEXT (2)', year: 1991 },
  };
  const tp = { els: null, list: [], hover: null, grid: [], at: null, kb: false };
  /* ---- keyboard (decision 14): arrows walk the cases (↑ ↓ up and down a stack, then to the
   *      next shelf; ← → along the shelf), Enter / Space takes a tape, Tab jumps between the
   *      cases that are not station logs. */
  function tpLive(el) { return el && !el.classList.contains('dv-tp-taken'); }
  function tpFocus(at) {
    if (tp.at) { const o = tp.grid[tp.at[0]][tp.at[1]][tp.at[2]]; if (o) o.el.classList.remove('dv-kb'); }
    tp.at = at;
    tp.kb = true;
    const c = at && tp.grid[at[0]][at[1]][at[2]];
    if (!c) return;
    c.el.classList.add('dv-kb');
    tpCaption(c.cap);
  }
  function tpStep(ds, dk, di) {
    const G = tp.grid;
    if (!G.length) return;
    if (!tp.at) { tpFocus([0, 0, 0]); return; }
    let [sh, k, i] = tp.at;
    const stackLen = (a, b) => (G[a] && G[a][b] ? G[a][b].length : 0);
    if (dk) { k = U.clamp(k + dk, 0, G[sh].length - 1); i = Math.min(i, stackLen(sh, k) - 1); }
    if (di) {
      i += di;
      if (i >= stackLen(sh, k)) { if (sh > 0) { sh--; i = 0; } else i = stackLen(sh, k) - 1; }
      else if (i < 0) { if (sh < G.length - 1) { sh++; i = stackLen(sh, k) - 1; } else i = 0; }
    }
    if (ds) sh = U.clamp(sh + ds, 0, G.length - 1);
    i = U.clamp(i, 0, Math.max(0, stackLen(sh, k) - 1));
    // taken cases have gone from the stack: slide to the nearest one still there
    const col = G[sh][k];
    if (col && !tpLive(col[i] && col[i].el)) {
      const j = col.findIndex((c, n) => n >= i && tpLive(c.el));
      i = j >= 0 ? j : Math.max(0, col.map((c) => tpLive(c.el)).lastIndexOf(true));
    }
    tpFocus([sh, k, i]);
  }
  function tpNextSpecial(d) {
    const flat = [];
    tp.grid.forEach((row, a) => row.forEach((col, b) => col.forEach((c, n) => { if (c.id && tpLive(c.el)) flat.push([a, b, n]); })));
    if (!flat.length) return;
    const cur = tp.at ? flat.findIndex((p) => p[0] === tp.at[0] && p[1] === tp.at[1] && p[2] === tp.at[2]) : -1;
    tpFocus(flat[(cur + d + flat.length) % flat.length] || flat[0]);
  }
  function tapeInfo(id) {
    const c = DA.content && DA.content.tapes && DA.content.tapes[id];
    const f = TAPE_FALLBACK[id] || { label: id.replace(/^tape_/, '').replace(/_/g, ' ').toUpperCase(), year: null };
    const label = DA.fmt((c && c.label) || f.label).toUpperCase();
    const year = c && c.year != null ? c.year : f.year;
    const desc = c && c.desc ? DA.fmt(c.desc) : `Cassette. Typed label: ${label}${year ? ', ' + year : ''}.`;
    const tag = year != null && !label.includes(String(year)) ? String(year) : '';
    return { id, label, year, desc, tag };
  }
  function tpCaption(text) { tp.els.cap.textContent = text || ''; }
  /** A typed spine label; a long one is set smaller (and may wrap to two lines) so it reads in full. */
  function tpLabel(info) {
    const n = info.label.length + (info.tag ? info.tag.length + 2 : 0);
    return U.el('span', { class: 'dv-tp-lbl' + (n > 30 ? ' dv-tp-xlong' : n > 21 ? ' dv-tp-long' : '') }, info.label);
  }
  function tpTake(id, el) {
    if (!Array.isArray(DA.state.tapes)) DA.state.tapes = [];
    if (DA.state.tapes.includes(id)) return;
    const info = tapeInfo(id);
    DA.state.tapes.push(id);
    el.classList.add('dv-tp-taken');
    sfx('paper', { vol: 0.7, rate: 1.3 });
    ui.toast('TAPE: ' + info.label);
    DA.bus.emit('tape:found', { id, label: info.label });
    tpCaption(tp.list.every((t) => DA.state.tapes.includes(t)) ? 'Nothing else here but station logs.' : '');
  }
  function tpBuild(ids) {
    const shelves = tp.els.shelves;
    shelves.textContent = '';
    const r = U.mulberry32(U.hash('records/' + ids.join(',')));
    const taken = Array.isArray(DA.state.tapes) ? DA.state.tapes : [];
    const nShelves = 3, nStacks = 5;
    const slots = [];
    for (let s = 0; s < nShelves; s++) for (let k = 0; k < nStacks; k++) slots.push([s, k]);
    seededShuffle(slots, r);
    const special = {};
    ids.forEach((id, i) => {
      const sl = slots[i % slots.length];
      const key = sl[0] + ':' + sl[1];
      (special[key] = special[key] || []).push(id);
    });
    const colors = ['#e8e0c8', '#dcd6c0', '#efe6cc', '#d6d2bf', '#e6dcbf', '#cfd6c9'];
    tp.grid = [];
    tp.at = null;
    for (let s = 0; s < nShelves; s++) {
      const shelf = U.el('div', { class: 'dv-tp-shelf' });
      const gRow = [];
      tp.grid.push(gRow);
      for (let k = 0; k < nStacks; k++) {
        const stack = U.el('div', { class: 'dv-tp-stack' });
        const gCol = [];
        gRow.push(gCol);
        const n = 4 + ((r() * 4) | 0);
        const mine = special[s + ':' + k] || [];
        const at = mine.map(() => (r() * n) | 0);
        for (let c = 0; c < n; c++) {
          const idx = at.indexOf(c);
          if (idx >= 0) {
            const id = mine[idx];
            const info = tapeInfo(id);
            const el = U.el('div', { class: 'dv-tp-case dv-tp-special' + (taken.includes(id) ? ' dv-tp-taken' : ''), style: { '--dv-lbl': ['#dccb9c', '#d8c393', '#e0d0a4'][(r() * 3) | 0], transform: `translateX(${((r() - 0.5) * 1.6).toFixed(2)}%)` } },
              tpLabel(info), U.el('span', { class: 'dv-tp-yr' }, info.tag));
            el.addEventListener('mouseenter', () => tpCaption(info.desc));
            el.addEventListener('mouseleave', () => tpCaption(''));
            el.addEventListener('click', () => tpTake(id, el));
            stack.appendChild(el);
            gCol.push({ el, id, cap: info.desc });
            mine.splice(idx, 1);
            at.splice(idx, 1);
            continue;
          }
          const yr = 1978 + ((r() * 22) | 0);
          const kinds = [`LOG ${yr} / ${U.pad(1 + ((r() * 12) | 0))}`, `TRAFFIC  ${yr}`, `LOG ${yr} / ${U.pad(1 + ((r() * 12) | 0))}`, `CAL. TONE  1 kHz`, `MAINT.  ${yr}`, `LOG ${yr} / ${U.pad(1 + ((r() * 12) | 0))}`, 'BLANK'];
          const el = U.el('div', { class: 'dv-tp-case', style: { '--dv-lbl': colors[(r() * colors.length) | 0], transform: `translateX(${((r() - 0.5) * 3).toFixed(2)}%)` } },
            U.el('span', { class: 'dv-tp-lbl' }, kinds[(r() * kinds.length) | 0]));
          el.addEventListener('mouseenter', () => tpCaption('Station traffic logs. Routine.'));
          el.addEventListener('mouseleave', () => tpCaption(''));
          stack.appendChild(el);
          gCol.push({ el, id: null, cap: 'Station traffic logs. Routine.' });
        }
        // anything left over (more tapes than cases) goes on top
        for (const id of mine) {
          const info = tapeInfo(id);
          const el = U.el('div', { class: 'dv-tp-case dv-tp-special' + (taken.includes(id) ? ' dv-tp-taken' : '') }, tpLabel(info), U.el('span', { class: 'dv-tp-yr' }, info.tag));
          el.addEventListener('mouseenter', () => tpCaption(info.desc));
          el.addEventListener('click', () => tpTake(id, el));
          stack.appendChild(el);
          gCol.push({ el, id, cap: info.desc });
        }
        shelf.appendChild(stack);
      }
      shelves.appendChild(shelf);
    }
  }
  device('tapes', {
    dim: true,
    build(root) {
      const shelves = U.el('div', { class: 'dv-tp-shelves' });
      const cap = U.el('div', { class: 'dv-tp-cap' });
      root.appendChild(U.el('div', { class: 'dv-tp-unit' },
        U.el('div', { class: 'dv-tp-plate' }, 'RECORDS  ·  AUDIO ARCHIVE  ·  1978 —'), shelves));
      root.appendChild(cap);
      root.appendChild(closeHint('CLICK TO TAKE  ·  ARROWS · TAB  ENTER  ·  E / ESC  BACK'));
      tp.els = { root, shelves, cap };
    },
    enter(arg) {
      const ids = Array.isArray(arg.tapes) && arg.tapes.length ? arg.tapes.slice() : RECORD_TAPES.slice();
      tp.list = ids;
      tp.kb = false;
      tpBuild(ids);
      tpCaption('');
      sfx('paper', { vol: 0.3, rate: 0.7 });
    },
    key(e, down) {
      if (!down) return false;
      const c = e.code;
      if (c === 'ArrowUp') { tpStep(0, 0, 1); return true; }
      if (c === 'ArrowDown') { tpStep(0, 0, -1); return true; }
      if (c === 'ArrowLeft') { tpStep(0, -1, 0); return true; }
      if (c === 'ArrowRight') { tpStep(0, 1, 0); return true; }
      if (c === 'Tab') { tpNextSpecial(e.shiftKey ? -1 : 1); return true; }
      if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Space') && !e.repeat) {
        const at = tp.at, it = at && tp.grid[at[0]][at[1]][at[2]];
        if (!it) { tpNextSpecial(1); return true; }
        if (it.id && tpLive(it.el)) { tpTake(it.id, it.el); it.el.classList.remove('dv-kb'); }
        else sfx('paper', { vol: 0.2, rate: 1.6 });
        return true;
      }
      return false;
    },
  });
  D.tapes = { open: (opts) => openDev('tapes', opts || {}) };

  /* ============================================================= WEATHER */
  /*
   * Roof mast instrument box (three analogue dials + LCD strip, rain on the glass) and the
   * office's wall repeater (one LCD). Values drift slowly with the clock and world weather;
   * gusts flutter in real time. Reading the mast sets flag weather_read and emits weather:read.
   */
  const WX = { W: 1280, H: 760 };
  const wx = { els: null, src: 'mast', readDone: false, t: 0, drops: [], shift0: null, base: null, over: null, pbase: null, lcd: null, plcd: null };
  function wxValues() {
    const min = DA.clock.min, w = (DA.state.world && DA.state.world.weather) || {};
    const rain = isFinite(w.rain) ? w.rain : 0.85, thunder = isFinite(w.thunder) ? w.thunder : 0.3;
    const hrs = Math.max(0, (min - (23 * 60 + 31)) / 60);
    const n = (f, k) => Math.sin(min * f + k) * 0.6 + Math.sin(min * f * 2.7 + k * 3.1) * 0.4;
    const windMph = U.clamp(14 + rain * 15 + thunder * 6 + n(0.07, 1) * 4, 0, 78);
    const windDir = (((228 + n(0.02, 2) * 22) % 360) + 360) % 360;
    const pressureIn = 29.78 - hrs * 0.034 - rain * 0.06 + n(0.03, 3) * 0.006;
    const rainRate = Math.max(0, 0.04 + rain * 0.52 + n(0.09, 4) * 0.06);
    const tempF = 49 - hrs * 0.7 - rain * 2 + n(0.05, 5) * 0.6;
    const sunrise = DA.flag('sunrise_unknown') ? '--:--' : DA.clock.hhmm(DA.state.sunrise);
    return {
      windMph, windDir, pressureIn, rainRate, tempF, sunrise,
      wind: `${Math.round(windMph)} MPH ${compass(windDir)}`,
      pressure: `${pressureIn.toFixed(2)} inHg FALLING`,
      rain: `${rainRate.toFixed(2)} IN/H`,
      temp: `${Math.round(tempF)}°F`,
    };
  }
  function gaugeFace(x, cx, cy, R) {
    const bz = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    bz.addColorStop(0, '#8d918c'); bz.addColorStop(0.5, '#2c2f2d'); bz.addColorStop(1, '#6f736e');
    x.fillStyle = bz;
    x.beginPath(); x.arc(cx, cy, R + 16, 0, TAU); x.fill();
    x.fillStyle = '#141615';
    x.beginPath(); x.arc(cx, cy, R + 5, 0, TAU); x.fill();
    const f = x.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    f.addColorStop(0, '#f1ecdf'); f.addColorStop(1, '#c9c0a9');
    x.fillStyle = f;
    x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  }
  function gaugeGlass(x, cx, cy, R) {
    const g = x.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  }
  /** A needle with a cheap offset shadow (canvas shadowBlur is far too slow per frame). */
  function needle(x, cx, cy, ang, len, col) {
    const tail = len * 0.18;
    const shape = () => { x.beginPath(); x.moveTo(-tail, -4); x.lineTo(len, -1.2); x.lineTo(len, 1.2); x.lineTo(-tail, 4); x.closePath(); x.fill(); };
    x.save();
    x.translate(cx + 3, cy + 4);
    x.rotate(ang);
    x.fillStyle = 'rgba(0,0,0,0.22)';
    shape();
    x.restore();
    x.save();
    x.translate(cx, cy);
    x.rotate(ang);
    x.fillStyle = col;
    shape();
    x.restore();
    x.fillStyle = '#222';
    x.beginPath(); x.arc(cx, cy, 9, 0, TAU); x.fill();
    x.fillStyle = '#777';
    x.beginPath(); x.arc(cx - 2, cy - 2, 3, 0, TAU); x.fill();
  }
  const WX_R = 150, WX_CY = 318;
  const sweepAng = (lo, hi) => (v) => Math.PI * 0.75 + U.clamp((v - lo) / (hi - lo), 0, 1) * Math.PI * 1.5;
  /** Dial face with a 270° sweep (static part). */
  function sweepDial(x, cx, cy, R, lo, hi, major, minor, fmt, title, unit) {
    const ang = sweepAng(lo, hi);
    gaugeFace(x, cx, cy, R);
    x.strokeStyle = '#1b1a17';
    x.fillStyle = '#1b1a17';
    x.font = "bold 22px 'Liberation Sans', Arial, sans-serif";
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (let v = lo; v <= hi + 1e-6; v += minor) {
      const a = ang(v), isMaj = Math.abs((v - lo) / major - Math.round((v - lo) / major)) < 1e-6;
      x.lineWidth = isMaj ? 3 : 1.4;
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
      x.lineTo(cx + Math.cos(a) * (R - (isMaj ? 24 : 14)), cy + Math.sin(a) * (R - (isMaj ? 24 : 14)));
      x.stroke();
      if (isMaj && fmt) x.fillText(fmt(v), cx + Math.cos(a) * (R - 46), cy + Math.sin(a) * (R - 46));
    }
    x.font = "bold 17px 'Liberation Sans', Arial, sans-serif";
    x.fillText(title, cx, cy + R * 0.42);
    x.font = "14px 'Liberation Sans', Arial, sans-serif";
    x.fillText(unit, cx, cy + R * 0.58);
    return ang;
  }
  /** Everything on the mast box that does not move: built once per open (fonts may arrive late). */
  function wxMastBase() {
    const W = WX.W, H = WX.H, R = WX_R, cy = WX_CY;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#343835'); bg.addColorStop(1, '#1d201e');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,0.03)';
    x.beginPath();
    for (let i = 0; i < W; i += 3) { x.moveTo(i, 0); x.lineTo(i + 4, H); }
    x.stroke();
    x.fillStyle = '#121413';
    x.fillRect(40, 40, W - 80, H - 80);
    const inner = x.createLinearGradient(0, 40, 0, H - 40);
    inner.addColorStop(0, '#2c302d'); inner.addColorStop(1, '#232624');
    x.fillStyle = inner;
    x.fillRect(52, 52, W - 104, H - 104);
    for (const [bx, by] of [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]]) {
      x.fillStyle = '#5c605c'; x.beginPath(); x.arc(bx, by, 9, 0, TAU); x.fill();
      x.strokeStyle = '#2a2c2a'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx - 6, by - 2); x.lineTo(bx + 6, by + 2); x.stroke();
    }
    x.fillStyle = 'rgba(225,225,210,0.75)';
    x.font = "bold 24px 'Liberation Mono', 'DejaVu Sans Mono', monospace";
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillText('MET SENSOR PACKAGE — MAST 1', 110, 112);
    x.textAlign = 'right';
    x.font = "16px 'Liberation Mono', monospace";
    x.fillText('RELAY STATION 14', W - 110, 112);
    sweepDial(x, 250, cy, R, 0, 80, 10, 5, (q) => String(q), 'WIND', 'MPH');
    gaugeFace(x, 640, cy, R);
    x.fillStyle = '#1b1a17'; x.strokeStyle = '#1b1a17';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 10) {
      const a = ((d - 90) * Math.PI) / 180, maj = d % 90 === 0, mid = d % 30 === 0;
      x.lineWidth = maj ? 3 : 1.3;
      x.beginPath();
      x.moveTo(640 + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
      x.lineTo(640 + Math.cos(a) * (R - (maj ? 24 : mid ? 18 : 12)), cy + Math.sin(a) * (R - (maj ? 24 : mid ? 18 : 12)));
      x.stroke();
      if (maj) { x.font = "bold 28px 'Liberation Sans', Arial, sans-serif"; x.fillText('NESW'[d / 90], 640 + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48)); }
    }
    x.font = "bold 17px 'Liberation Sans', Arial, sans-serif";
    x.fillText('WIND DIR', 640, cy + R * 0.42);
    const ang = sweepDial(x, 1030, cy, R, 28.5, 31, 0.5, 0.1, (q) => q.toFixed(1), 'BAROMETER', 'inHg');
    x.font = "italic bold 13px 'Liberation Serif', Georgia, serif";
    x.fillStyle = '#6b2a1c';
    [['STORMY', 28.75], ['RAIN', 29.25], ['CHANGE', 29.75], ['FAIR', 30.25], ['DRY', 30.75]].forEach(([w, p]) => {
      const a = ang(p);
      x.save(); x.translate(1030 + Math.cos(a) * (R * 0.38), cy + Math.sin(a) * (R * 0.38)); x.rotate(a + Math.PI / 2); x.fillText(w, 0, 0); x.restore();
    });
    // the brass set-hand, left where the pressure stood when the shift began
    x.save(); x.translate(1030, cy); x.rotate(ang(wx.shift0 != null ? wx.shift0 : 29.78)); x.fillStyle = '#b08a3a'; x.fillRect(0, -1.5, R - 18, 3); x.restore();
    // LCD strip with its labels and ghost segments
    const lx = 150, ly = 534, lw = W - 300, lh = 132;
    x.fillStyle = '#0c0d0c';
    x.fillRect(lx - 12, ly - 12, lw + 24, lh + 24);
    const lcd = x.createLinearGradient(0, ly, 0, ly + lh);
    lcd.addColorStop(0, '#a9b98f'); lcd.addColorStop(1, '#8c9c74');
    x.fillStyle = lcd;
    x.fillRect(lx, ly, lw, lh);
    ['RAIN RATE  IN/H', 'TEMP  °F', 'SUNRISE'].forEach((lab, i) => {
      const cx = lx + (lw / 3) * i + 30;
      x.fillStyle = 'rgba(30,38,26,0.8)';
      x.textAlign = 'left';
      x.textBaseline = 'alphabetic';
      x.font = "bold 15px 'Liberation Sans', Arial, sans-serif";
      x.fillText(lab, cx, ly + 26);
      x.font = "78px VT323, 'DejaVu Sans Mono', monospace";
      x.fillStyle = 'rgba(30,38,26,0.1)';
      x.fillText(i === 2 ? '88:88' : i === 1 ? '888' : '8.88', cx, ly + 98);
      if (i) { x.fillStyle = 'rgba(30,38,26,0.35)'; x.fillRect(lx + (lw / 3) * i, ly + 14, 2, lh - 28); }
    });
    wx.lcd = { lx, ly, lw };
    return c;
  }
  /** Glass glints, beaded rain and the lamp's fall-off: drawn over the moving parts. */
  function wxMastOver() {
    const W = WX.W, H = WX.H, R = WX_R, cy = WX_CY;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    for (const gx of [250, 640, 1030]) gaugeGlass(x, gx, cy, R);
    const r = U.mulberry32(77);
    for (let i = 0; i < 140; i++) {
      const bx = r() * W, by = r() * H, br = 1.5 + r() * 5;
      x.fillStyle = 'rgba(200,215,210,0.10)';
      x.beginPath(); x.ellipse(bx, by, br, br * 1.2, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)';
      x.beginPath(); x.arc(bx - br * 0.3, by - br * 0.4, br * 0.28, 0, TAU); x.fill();
    }
    const lamp = x.createRadialGradient(W * 0.42, H * 0.18, 60, W * 0.5, H * 0.45, W * 0.75);
    lamp.addColorStop(0, 'rgba(0,0,0,0)'); lamp.addColorStop(1, 'rgba(0,0,0,0.62)');
    x.fillStyle = lamp;
    x.fillRect(0, 0, W, H);
    return c;
  }
  function wxMast(x, v, t) {
    if (!wx.base) { wx.base = wxMastBase(); wx.over = wxMastOver(); }
    const R = WX_R, cy = WX_CY;
    x.drawImage(wx.base, 0, 0);
    const gust = Math.sin(t * 2.3) * 1.6 + Math.sin(t * 5.1 + 1) * 1.1 + Math.sin(t * 0.7) * 2.2;
    needle(x, 250, cy, sweepAng(0, 80)(v.windMph + gust), R - 26, '#161616');
    // the vane: red head points where the wind comes from
    const dirA = ((v.windDir + Math.sin(t * 1.7) * 4 + Math.sin(t * 3.9) * 2 - 90) * Math.PI) / 180;
    for (const sh of [1, 0]) {
      x.save();
      x.translate(640 + sh * 3, cy + sh * 4);
      x.rotate(dirA);
      x.fillStyle = sh ? 'rgba(0,0,0,0.22)' : '#8b1c14';
      x.beginPath(); x.moveTo(R - 30, 0); x.lineTo(R - 62, -11); x.lineTo(R - 62, 11); x.closePath(); x.fill();
      x.fillStyle = sh ? 'rgba(0,0,0,0.22)' : '#161616';
      x.fillRect(-R * 0.55, -2.5, R * 0.55 + (R - 62), 5);
      x.beginPath(); x.moveTo(-R * 0.55, 0); x.lineTo(-R * 0.62, -12); x.lineTo(-R * 0.42, 0); x.lineTo(-R * 0.62, 12); x.closePath(); x.fill();
      x.restore();
    }
    x.fillStyle = '#222'; x.beginPath(); x.arc(640, cy, 9, 0, TAU); x.fill();
    needle(x, 1030, cy, sweepAng(28.5, 31)(v.pressureIn), R - 22, '#161616');
    const L = wx.lcd;
    x.font = "78px VT323, 'DejaVu Sans Mono', monospace";
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#1c241a';
    [v.rainRate.toFixed(2), String(Math.round(v.tempF)), v.sunrise].forEach((val, i) => x.fillText(val, L.lx + (L.lw / 3) * i + 30, L.ly + 98));
    x.drawImage(wx.over, 0, 0);
    wxRain(x, WX.W, WX.H, t);
  }
  /** Rivulets running down the glass. */
  function wxRain(x, W, H, t) {
    if (wx.drops.length < 7 && Math.random() < 0.05) wx.drops.push({ x: Math.random() * W, y: -20, v: 80 + Math.random() * 160, trail: [] });
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(210,225,220,0.18)';
    x.fillStyle = 'rgba(230,240,235,0.35)';
    for (let i = wx.drops.length - 1; i >= 0; i--) {
      const d = wx.drops[i];
      d.y += d.v * (DA.dt || 1 / 60) * (0.6 + 0.8 * Math.abs(Math.sin(t * 3 + i)));
      d.x += Math.sin(d.y * 0.03 + i) * 0.4;
      d.trail.push([d.x, d.y]);
      if (d.trail.length > 30) d.trail.shift();
      x.beginPath();
      d.trail.forEach((p, k) => (k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
      x.stroke();
      x.beginPath(); x.ellipse(d.x, d.y, 4, 5.5, 0, 0, TAU); x.fill();
      if (d.y > H + 20) wx.drops.splice(i, 1);
    }
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  const WXP = { pw: 820, ph: 640 };
  function wxPanelBase() {
    const W = WX.W, H = WX.H, pw2 = WXP.pw, ph2 = WXP.ph, px0 = (W - pw2) / 2, py0 = (H - ph2) / 2;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#34372f';
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(x, px0 + 10, py0 + 18, pw2, ph2, 26); x.fill();
    const body = x.createLinearGradient(0, py0, 0, py0 + ph2);
    body.addColorStop(0, '#d8d0b8'); body.addColorStop(1, '#bdb49b');
    x.fillStyle = body;
    roundRect(x, px0, py0, pw2, ph2, 26); x.fill();
    x.fillStyle = '#3b382f';
    x.font = "bold 22px 'Liberation Sans', Arial, sans-serif";
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText('REMOTE WEATHER DISPLAY', px0 + 44, py0 + 58);
    x.font = "15px 'Liberation Sans', Arial, sans-serif";
    x.textAlign = 'right';
    x.fillText('LINK  MAST 1', px0 + pw2 - 70, py0 + 56);
    const lx = px0 + 44, ly = py0 + 86, lw = pw2 - 88, lh = 430;
    x.fillStyle = '#26241e';
    roundRect(x, lx - 10, ly - 10, lw + 20, lh + 20, 10); x.fill();
    const lcd = x.createLinearGradient(0, ly, 0, ly + lh);
    lcd.addColorStop(0, '#b3c29a'); lcd.addColorStop(1, '#94a37e');
    x.fillStyle = lcd;
    x.fillRect(lx, ly, lw, lh);
    [['WIND', 'MPH'], ['BARO', 'inHg'], ['RAIN', 'IN/H'], ['TEMP', '°F'], ['SUNRISE', '']].forEach(([lab, unit], i) => {
      const yy = ly + 70 + i * 80;
      x.textAlign = 'left';
      x.font = "bold 20px 'Liberation Sans', Arial, sans-serif";
      x.fillStyle = 'rgba(30,38,26,0.75)';
      x.fillText(lab, lx + 30, yy - 12);
      x.fillText(unit, lx + 560, yy - 12);
      x.font = "76px VT323, 'DejaVu Sans Mono', monospace";
      x.fillStyle = 'rgba(30,38,26,0.09)';
      x.fillText('88888', lx + 250, yy);
    });
    ['MODE', 'HI/LO', 'LAMP', 'SET'].forEach((b, i) => {
      const bx = px0 + 90 + i * 170, by = py0 + ph2 - 76;
      x.fillStyle = '#8f8772';
      roundRect(x, bx, by, 130, 40, 8); x.fill();
      x.fillStyle = '#e8e2d0';
      roundRect(x, bx, by - 4, 130, 40, 8); x.fill();
      x.fillStyle = '#4a463b';
      x.font = "bold 15px 'Liberation Sans', Arial, sans-serif";
      x.textAlign = 'center';
      x.fillText(b, bx + 65, by + 21);
    });
    const room = x.createRadialGradient(W / 2, H * 0.4, 200, W / 2, H / 2, W * 0.7);
    room.addColorStop(0, 'rgba(0,0,0,0)'); room.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = room;
    x.fillRect(0, 0, W, H);
    wx.plcd = { lx, ly, px0, py0 };
    return c;
  }
  function wxPanel(x, v, t) {
    if (!wx.pbase) wx.pbase = wxPanelBase();
    const P = wx.plcd;
    x.drawImage(wx.pbase, 0, 0);
    x.fillStyle = Math.floor(t * 1.4) % 2 ? '#3dff6a' : '#1f5a2c';
    x.beginPath(); x.arc(P.px0 + WXP.pw - 50, P.py0 + 51, 7, 0, TAU); x.fill();
    const vals = [
      `${String(Math.round(v.windMph + Math.sin(t * 2.3) * 1.2)).padStart(2)} ${compass(v.windDir).padEnd(3)}`,
      `${v.pressureIn.toFixed(2)}↓`, v.rainRate.toFixed(2), String(Math.round(v.tempF)).padStart(3), v.sunrise,
    ];
    x.font = "76px VT323, 'DejaVu Sans Mono', monospace";
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#1c241a';
    vals.forEach((val, i) => x.fillText(val, P.lx + 250, P.ly + 70 + i * 80));
  }
  /** The reading as the paperwork / director want it (= flag weather_read). */
  function wxRecord() {
    const v = wxValues();
    return {
      wind: v.wind, pressure: v.pressure, rain: v.rain, temp: v.temp,
      windMph: Math.round(v.windMph), windDir: Math.round(v.windDir), pressureIn: +v.pressureIn.toFixed(2), rainRate: +v.rainRate.toFixed(2),
      time: DA.clock.hhmm(), min: Math.floor(DA.clock.min),
    };
  }
  device('weather', {
    dim: true,
    clickOutside: true,
    build(root) {
      const cv = U.el('canvas', { class: 'dv-wx-cv', width: WX.W, height: WX.H });
      root.appendChild(cv);
      root.appendChild(closeHint());
      wx.els = { root, cv, ctx: cv.getContext('2d') };
    },
    enter(arg) {
      wx.src = arg.source === 'panel' ? 'panel' : 'mast';
      wx.readDone = false;
      wx.t = 0;
      wx.drops = [];
      wx.base = wx.over = wx.pbase = null; // rebuilt so late web fonts and the set-hand are current
      wx.els.root.classList.toggle('dv-wx-panel', wx.src === 'panel');
      if (wx.shift0 == null) wx.shift0 = 29.78;
      sfx(wx.src === 'mast' ? 'hatch' : 'switch', { vol: 0.35 });
      // the office's remote display is linked to MAST 1: its view carries the same reading
      DA.bus.emit('weather:view', wx.src === 'panel' ? Object.assign({ source: 'panel' }, wxRecord()) : { source: wx.src });
    },
    update(dt) {
      wx.t += dt;
      // a reading is taken once the dials have been looked at for a moment — at the mast, or on the
      // office's remote display (it reads MAST 1: the same numbers; weather:read says which)
      if (!wx.readDone && wx.t > 0.9) {
        wx.readDone = true;
        const rec = wxRecord();
        DA.setFlag('weather_read', Object.assign({ source: wx.src }, rec));
        DA.bus.emit('weather:read', Object.assign({ source: wx.src }, rec));
      }
    },
    render() {
      const x = wx.els.ctx, v = wxValues();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      if (wx.src === 'panel') wxPanel(x, v, wx.t);
      else wxMast(x, v, wx.t);
    },
  });
  D.weather = { open: (opts) => openDev('weather', opts || {}), values: wxValues };

  /* ============================================================== MIRROR */
  /*
   * The bathroom mirror. A dim green fluorescent room (in a blackout: the dead tube and the red
   * emergency lamp over the door) reflected behind a head-and-shoulders
   * silhouette that follows the mouse — with a lag set by flag mirror_stage: 0 none,
   * 1 ~0.25 s, 2 ~0.8 s + a head tilt you did not make, 3 it stops following and someone stands
   * in the doorway behind it. Subtle on purpose. Drawn in 1280×720 logical units into a
   * 640×360 canvas shown pixelated, so it sits with the 480×270 world view.
   */
  const MR = { W: 1280, H: 720, X: 250, Y: 36, MW: 780, MH: 560, PX: 70, PY: 44, SCALE: 0.5 };
  const MR_LAG = [0, 0.25, 0.8];
  const mr = { els: null, wall: null, room: null, grime: null, refl: null, hist: [], mx: 0, my: 0, t: 0, stage: 0, flick: 0, nextFlick: 3, tiltT: -1, tiltDir: 1, nextTilt: 4, door: null };
  function mrStage() { return U.clamp(+DA.flag('mirror_stage') || 0, 0, 3); }
  function mrBuildAssets() {
    const r = U.mulberry32(314);
    // --- the real wall around the mirror (tiles lit from the front)
    const S = MR.SCALE; // every layer is stored at display resolution, drawn in 1280×720 units
    const wall = mkCanvas(MR.W * S, MR.H * S), w = wall.getContext('2d');
    w.scale(S, S);
    const wg = w.createLinearGradient(0, 0, 0, MR.H);
    wg.addColorStop(0, '#56675a'); wg.addColorStop(1, '#34413a');
    w.fillStyle = wg;
    w.fillRect(0, 0, MR.W, MR.H);
    for (let i = 0; i < 60; i++) { w.fillStyle = `rgba(0,0,0,${r() * 0.1})`; w.fillRect(((r() * 23) | 0) * 58, ((r() * 13) | 0) * 58, 58, 58); }
    w.strokeStyle = 'rgba(18,26,20,0.6)';
    w.lineWidth = 3;
    for (let yy = 0; yy <= MR.H; yy += 58) { w.beginPath(); w.moveTo(0, yy); w.lineTo(MR.W, yy); w.stroke(); }
    for (let xx = 0; xx <= MR.W; xx += 58) { w.beginPath(); w.moveTo(xx, 0); w.lineTo(xx, MR.H); w.stroke(); }
    // sink: porcelain rim, a chrome tap, in the gloom below the mirror
    const sg = w.createLinearGradient(0, MR.Y + MR.MH + 30, 0, MR.H);
    sg.addColorStop(0, '#9aa39a'); sg.addColorStop(0.35, '#6c746c'); sg.addColorStop(1, '#2c322d');
    w.fillStyle = sg;
    w.beginPath();
    w.moveTo(MR.X - 70, MR.H); w.lineTo(MR.X - 30, MR.Y + MR.MH + 44); w.quadraticCurveTo(MR.W / 2, MR.Y + MR.MH + 30, MR.X + MR.MW + 30, MR.Y + MR.MH + 44); w.lineTo(MR.X + MR.MW + 70, MR.H);
    w.closePath(); w.fill();
    w.fillStyle = 'rgba(210,225,212,0.35)';
    w.fillRect(MR.X - 20, MR.Y + MR.MH + 42, MR.MW + 40, 3);
    const tx = MR.W / 2, ty = MR.Y + MR.MH + 34;
    const ch = w.createLinearGradient(0, ty, 0, ty + 60);
    ch.addColorStop(0, '#c9d3cb'); ch.addColorStop(0.5, '#6f7872'); ch.addColorStop(1, '#2b312d');
    w.fillStyle = ch;
    w.beginPath(); w.ellipse(tx, ty + 8, 30, 9, 0, 0, TAU); w.fill();
    w.fillRect(tx - 10, ty - 6, 20, 16);
    w.beginPath(); w.moveTo(tx - 9, ty - 4); w.lineTo(tx + 9, ty - 4); w.lineTo(tx + 8, ty + 44); w.lineTo(tx - 8, ty + 44); w.closePath(); w.fill();
    w.fillStyle = '#141816';
    w.beginPath(); w.ellipse(tx, ty + 44, 8, 3, 0, 0, TAU); w.fill();
    for (const sx of [-1, 1]) {
      w.fillStyle = ch;
      w.beginPath(); w.ellipse(tx + sx * 70, ty + 10, 16, 6, 0, 0, TAU); w.fill();
      w.fillRect(tx + sx * 70 - 4, ty - 8, 8, 18);
      w.fillRect(tx + sx * 70 - 14, ty - 10, 28, 6);
    }
    // steel frame
    w.fillStyle = '#161a17';
    w.fillRect(MR.X - 20, MR.Y - 20, MR.MW + 40, MR.MH + 40);
    const fg = w.createLinearGradient(MR.X - 16, 0, MR.X + MR.MW + 16, 0);
    fg.addColorStop(0, '#6f7771'); fg.addColorStop(0.5, '#a9b1ab'); fg.addColorStop(1, '#5a615c');
    w.fillStyle = fg;
    w.fillRect(MR.X - 15, MR.Y - 15, MR.MW + 30, MR.MH + 30);
    w.fillStyle = '#0c0e0d';
    w.fillRect(MR.X - 3, MR.Y - 3, MR.MW + 6, MR.MH + 6);
    mr.wall = wall;
    // --- the reflected room (oversized for parallax); dark = main power off: the tube is dead
    //     and only the red emergency lamp over the door lights it
    const RW = MR.MW + MR.PX * 2, RH = MR.MH + MR.PY * 2;
    const buildRoom = (dark) => {
      const room = mkCanvas(RW * S, RH * S), x = room.getContext('2d');
      x.scale(S, S);
      const vx = RW * 0.52, vy = RH * 0.46, bw = RW * 0.42, bh = RH * 0.5;
      const bx0 = vx - bw / 2, by0 = vy - bh * 0.52, bx1 = vx + bw / 2, by1 = vy + bh * 0.48;
      const poly = (pts, fill) => { x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fillStyle = fill; x.fill(); };
      poly([[0, 0], [RW, 0], [bx1, by0], [bx0, by0]], '#253029');
      poly([[0, RH], [RW, RH], [bx1, by1], [bx0, by1]], '#1a201c');
      poly([[0, 0], [bx0, by0], [bx0, by1], [0, RH]], '#324038');
      poly([[RW, 0], [bx1, by0], [bx1, by1], [RW, RH]], '#2b3730');
      x.fillStyle = '#3b4a40';
      x.fillRect(bx0, by0, bw, by1 - by0);
      x.strokeStyle = 'rgba(10,16,12,0.5)';
      x.lineWidth = 1.6;
      for (let k = 1; k < 9; k++) {
        const yy = by0 + ((by1 - by0) * k) / 9, t = k / 9;
        x.beginPath(); x.moveTo(bx0, yy); x.lineTo(bx1, yy); x.stroke();
        x.beginPath(); x.moveTo(0, t * RH); x.lineTo(bx0, by0 + (by1 - by0) * t); x.stroke();
        x.beginPath(); x.moveTo(RW, t * RH); x.lineTo(bx1, by0 + (by1 - by0) * t); x.stroke();
      }
      for (let k = 1; k < 8; k++) { const xx = bx0 + (bw * k) / 8; x.beginPath(); x.moveTo(xx, by0); x.lineTo(xx, by1); x.stroke(); }
      // stall partitions down the left wall, one door ajar onto black
      const sp = (a, b, col) => poly([[a[0], a[1]], [b[0], b[1]], [b[0], b[2]], [a[0], a[2]]], col);
      sp([RW * 0.02, RH * 0.1, RH * 0.95], [bx0 - RW * 0.06, by0 + bh * 0.05, by1 - bh * 0.02], '#22332a');
      sp([bx0 - RW * 0.06, by0 + bh * 0.05, by1 - bh * 0.02], [bx0 + 4, by0 + bh * 0.1, by1 - bh * 0.05], '#1d2c23');
      x.fillStyle = '#050706';
      x.beginPath();
      x.moveTo(RW * 0.13, RH * 0.2); x.lineTo(RW * 0.2, by0 + bh * 0.08); x.lineTo(RW * 0.2, by1 - bh * 0.04); x.lineTo(RW * 0.13, RH * 0.85);
      x.closePath(); x.fill();
      // the doorway out, open onto the dim hall
      const dx0 = bx1 - bw * 0.34, dw = bw * 0.23, dy0 = by0 + bh * 0.2;
      x.fillStyle = '#1d251f';
      x.fillRect(dx0 - 6, dy0 - 6, dw + 12, by1 - dy0 + 6);
      const hall = x.createLinearGradient(0, dy0, 0, by1);
      hall.addColorStop(0, '#0b0f0c'); hall.addColorStop(1, '#101511');
      x.fillStyle = hall;
      x.fillRect(dx0, dy0, dw, by1 - dy0);
      x.fillStyle = '#2d3830';
      x.beginPath(); x.moveTo(dx0 + dw, dy0); x.lineTo(dx0 + dw + 26, dy0 - 10); x.lineTo(dx0 + dw + 26, by1 + 8); x.lineTo(dx0 + dw, by1); x.closePath(); x.fill();
      mr.door = { x: dx0 + dw / 2, top: dy0, floor: by1, w: dw };
      // vent grille high on the back wall
      x.fillStyle = '#18201b';
      x.fillRect(bx0 + bw * 0.1, by0 + bh * 0.1, bw * 0.16, bh * 0.08);
      x.strokeStyle = 'rgba(120,135,125,0.35)';
      for (let k = 1; k < 5; k++) { const yy = by0 + bh * 0.1 + (bh * 0.08 * k) / 5; x.beginPath(); x.moveTo(bx0 + bw * 0.1, yy); x.lineTo(bx0 + bw * 0.26, yy); x.stroke(); }
      // the fluorescent tube behind you, and its green bloom — or, blacked out, a dead grey tube and
      // the emergency lamp's red wash from above the doorway
      x.fillStyle = dark ? '#3a3d3b' : '#e2f3de';
      x.beginPath(); x.moveTo(vx - bw * 0.36, RH * 0.1); x.lineTo(vx + bw * 0.36, RH * 0.1); x.lineTo(vx + bw * 0.28, RH * 0.14); x.lineTo(vx - bw * 0.28, RH * 0.14); x.closePath(); x.fill();
      if (!dark) {
        const bloom = x.createRadialGradient(vx, RH * 0.12, 10, vx, RH * 0.2, RW * 0.55);
        bloom.addColorStop(0, 'rgba(200,255,205,0.32)'); bloom.addColorStop(0.4, 'rgba(120,190,130,0.1)'); bloom.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = bloom;
        x.fillRect(0, 0, RW, RH);
      } else {
        // the whole room drops to a dim ember, then the lamp box and its pool of red
        x.fillStyle = 'rgba(0,0,0,0.55)';
        x.fillRect(0, 0, RW, RH);
        const lx = dx0 + dw / 2, ly = dy0 - 26;
        const red = x.createRadialGradient(lx, ly, 6, lx, ly + 40, RW * 0.5);
        red.addColorStop(0, 'rgba(255,70,50,0.55)'); red.addColorStop(0.3, 'rgba(190,40,30,0.22)'); red.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalCompositeOperation = 'lighter';
        x.fillStyle = red;
        x.fillRect(0, 0, RW, RH);
        x.globalCompositeOperation = 'source-over';
        x.fillStyle = '#2a1512';
        x.fillRect(lx - 22, ly - 9, 44, 16);
        x.fillStyle = '#ff5a40';
        x.fillRect(lx - 17, ly - 5, 34, 7);
      }
      return { room, x };
    };
    const lit = buildRoom(false), darkR = buildRoom(true);
    const room = lit.room, x = lit.x;
    mr.room = room;
    mr.roomDark = darkR.room;
    // --- mirror wear: desilvering creeping in from the edges, a few spots, dried streaks
    const gr = mkCanvas(MR.MW * S, MR.MH * S), g = gr.getContext('2d');
    g.scale(S, S);
    for (let i = 0; i < 320; i++) {
      const side = (r() * 4) | 0, depth = Math.pow(r(), 2.2);
      let px = r() * MR.MW, py = r() * MR.MH;
      if (side === 0) px = depth * 60; else if (side === 1) px = MR.MW - depth * 60; else if (side === 2) py = depth * 45; else py = MR.MH - depth * 55;
      g.fillStyle = `rgba(${r() < 0.6 ? '8,10,8' : '58,56,44'},${(0.15 + r() * 0.45) * (1 - depth * 0.6)})`;
      g.beginPath(); g.ellipse(px, py, 1 + r() * 7, 1 + r() * 5, r() * 3, 0, TAU); g.fill();
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(200,210,195,${0.05 + r() * 0.08})`; g.beginPath(); g.arc(r() * MR.MW, r() * MR.MH, 0.8 + r() * 1.6, 0, TAU); g.fill(); }
    for (let i = 0; i < 6; i++) {
      const sx = r() * MR.MW;
      const lg = g.createLinearGradient(0, MR.MH * 0.3, 0, MR.MH);
      lg.addColorStop(0, 'rgba(200,210,200,0)'); lg.addColorStop(1, 'rgba(200,210,200,0.05)');
      g.fillStyle = lg;
      g.fillRect(sx, MR.MH * 0.3, 3 + r() * 6, MR.MH * 0.7);
    }
    // mirrors are darker and greener than the room: bake it in once (the blackout copy: red)
    const tintRoom = (c, col) => {
      const g2 = c.getContext('2d');
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.globalCompositeOperation = 'multiply';
      g2.fillStyle = col;
      g2.fillRect(0, 0, c.width, c.height);
      g2.globalCompositeOperation = 'source-over';
    };
    tintRoom(room, '#9db7a2');
    tintRoom(mr.roomDark, '#d88f84');
    mr.grime = gr;
    mr.refl = mkCanvas(MR.MW * S, MR.MH * S);
    // stage 3: the same room with someone standing in the doorway (baked once; blur is costly)
    const withFig = (src) => {
      const rf3 = mkCanvas(RW * S, RH * S), f3 = rf3.getContext('2d');
      f3.drawImage(src, 0, 0);
      f3.scale(S, S);
      mrFigure(f3, 0, 0);
      return rf3;
    };
    mr.roomFig = withFig(room);
    mr.roomFigDark = withFig(mr.roomDark);
    // the real tiles around the mirror, lit only by the red lamp
    const wd = mkCanvas(wall.width, wall.height), wdx = wd.getContext('2d');
    wdx.drawImage(wall, 0, 0);
    wdx.globalCompositeOperation = 'multiply';
    wdx.fillStyle = '#6a2f2a';
    wdx.fillRect(0, 0, wd.width, wd.height);
    wdx.globalCompositeOperation = 'source-over';
    mr.wallDark = wd;
    const vig = mkCanvas(MR.W * S, MR.H * S), vx2 = vig.getContext('2d');
    vx2.scale(S, S);
    const vg = vx2.createRadialGradient(MR.W / 2, MR.H * 0.42, MR.H * 0.25, MR.W / 2, MR.H / 2, MR.W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,4,2,0.72)');
    vx2.fillStyle = vg;
    vx2.fillRect(0, 0, MR.W, MR.H);
    mr.vig = vig;
    // --- the crack: an impact in the top-right corner (Hollis: "Don't bother putting in a ticket")
    const ix = MR.MW - 70, iy = 60;
    mr.crack = { ix, iy, lines: [], shards: [] };
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 0.45 + (k / 8) * Math.PI * 0.75 + (r() - 0.5) * 0.15;
      const pts = [[ix, iy]];
      let cx2 = ix, cy2 = iy;
      const len = 60 + r() * 200;
      for (let q = 0; q < 6; q++) { cx2 += Math.cos(a + (r() - 0.5) * 0.4) * (len / 6); cy2 += Math.sin(a + (r() - 0.5) * 0.4) * (len / 6); pts.push([cx2, cy2]); }
      mr.crack.lines.push(pts);
    }
    for (let k = 0; k < 4; k++) mr.crack.shards.push({ a: mr.crack.lines[k * 2], b: mr.crack.lines[k * 2 + 1], dx: (r() - 0.5) * 7, dy: (r() - 0.5) * 5 });
  }
  /** Head-and-shoulders silhouette, backlit by the ceiling tube behind you. */
  /** Main power off: the bathroom is lit by its red emergency lamp only (so is the reflection). */
  function mrDark() {
    const w = DA.world;
    return !!(w && w.power && safe(() => w.power('main'), true) === false);
  }
  function mrPerson(x, cx, cy, tilt, dark) {
    const hr = MR.MH * 0.12;
    // colours are pre-tinted (mirror green; in the blackout the rim light is the red lamp's)
    const body = dark ? '#0a0605' : '#090c0a', rimC = dark ? 'rgba(190,70,55,0.26)' : 'rgba(118,160,124,0.24)';
    x.save();
    x.translate(cx, cy);
    // shoulders and a jacket collar
    x.fillStyle = body;
    x.beginPath();
    x.moveTo(-hr * 2.85, MR.MH);
    x.lineTo(-hr * 2.78, hr * 3.2);
    x.bezierCurveTo(-hr * 2.72, hr * 2.6, -hr * 2.45, hr * 2.25, -hr * 1.95, hr * 2.05);
    x.bezierCurveTo(-hr * 1.35, hr * 1.85, -hr * 0.75, hr * 1.55, -hr * 0.52, hr * 1.15);
    x.lineTo(-hr * 0.42, hr * 0.62);
    x.lineTo(hr * 0.42, hr * 0.62);
    x.lineTo(hr * 0.52, hr * 1.15);
    x.bezierCurveTo(hr * 0.75, hr * 1.55, hr * 1.35, hr * 1.85, hr * 1.95, hr * 2.05);
    x.bezierCurveTo(hr * 2.45, hr * 2.25, hr * 2.72, hr * 2.6, hr * 2.78, hr * 3.2);
    x.lineTo(hr * 2.85, MR.MH);
    x.closePath();
    x.fill();
    x.strokeStyle = rimC;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-hr * 2.7, hr * 2.7); x.bezierCurveTo(-hr * 2.5, hr * 2.25, -hr * 2.1, hr * 2.08, -hr * 1.4, hr * 1.82);
    x.moveTo(hr * 2.7, hr * 2.7); x.bezierCurveTo(hr * 2.5, hr * 2.25, hr * 2.1, hr * 2.08, hr * 1.4, hr * 1.82);
    x.stroke();
    x.strokeStyle = 'rgba(0,0,0,0.9)';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(-hr * 0.85, hr * 1.62); x.lineTo(0, hr * 2.4); x.lineTo(hr * 0.85, hr * 1.62); x.stroke();
    // head (tilts about the neck)
    x.translate(0, hr * 0.95);
    x.rotate(tilt);
    x.translate(0, -hr * 0.95);
    x.fillStyle = body;
    x.beginPath();
    x.moveTo(0, -hr * 1.08);
    x.bezierCurveTo(hr * 0.62, -hr * 1.08, hr * 0.86, -hr * 0.6, hr * 0.82, -hr * 0.05);
    x.bezierCurveTo(hr * 0.8, hr * 0.45, hr * 0.55, hr * 0.85, hr * 0.18, hr * 0.98);
    x.lineTo(-hr * 0.18, hr * 0.98);
    x.bezierCurveTo(-hr * 0.55, hr * 0.85, -hr * 0.8, hr * 0.45, -hr * 0.82, -hr * 0.05);
    x.bezierCurveTo(-hr * 0.86, -hr * 0.6, -hr * 0.62, -hr * 1.08, 0, -hr * 1.08);
    x.fill();
    x.beginPath(); x.ellipse(-hr * 0.84, hr * 0.02, hr * 0.12, hr * 0.22, 0.1, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(hr * 0.84, hr * 0.02, hr * 0.12, hr * 0.22, -0.1, 0, TAU); x.fill();
    // hair catching the light
    x.strokeStyle = dark ? 'rgba(200,80,62,0.26)' : 'rgba(122,166,128,0.28)';
    x.lineWidth = 3.5;
    x.beginPath();
    x.moveTo(-hr * 0.8, -hr * 0.45);
    x.bezierCurveTo(-hr * 0.7, -hr * 0.95, -hr * 0.3, -hr * 1.1, hr * 0.05, -hr * 1.09);
    x.bezierCurveTo(hr * 0.45, -hr * 1.08, hr * 0.75, -hr * 0.85, hr * 0.8, -hr * 0.45);
    x.stroke();
    x.restore();
  }
  /** Someone in the doorway behind you. Only in the reflection. */
  function mrFigure(x, ox, oy) {
    const d = mr.door, h = (d.floor - d.top) * 0.9, cx = d.x + ox + d.w * 0.06, foot = d.floor + oy;
    const hr = h * 0.07;
    x.save();
    x.filter = 'blur(1.4px)';
    x.fillStyle = 'rgba(1,2,1,0.9)';
    x.beginPath();
    x.moveTo(cx - hr * 1.15, foot);
    x.lineTo(cx - hr * 1.95, foot - h * 0.5);
    x.lineTo(cx - hr * 1.95, foot - h * 0.74);
    x.bezierCurveTo(cx - hr * 1.9, foot - h * 0.8, cx - hr * 1.3, foot - h * 0.81, cx - hr * 0.5, foot - h * 0.855);
    x.lineTo(cx + hr * 0.5, foot - h * 0.855);
    x.bezierCurveTo(cx + hr * 1.3, foot - h * 0.81, cx + hr * 1.9, foot - h * 0.8, cx + hr * 1.95, foot - h * 0.74);
    x.lineTo(cx + hr * 1.95, foot - h * 0.5);
    x.lineTo(cx + hr * 1.15, foot);
    x.closePath();
    x.fill();
    x.beginPath(); x.ellipse(cx + hr * 0.15, foot - h + hr * 1.1, hr * 0.78, hr * 1.02, -0.14, 0, TAU); x.fill();
    x.restore();
  }
  /** Mouse history sample `lag` seconds ago. */
  function mrSample(lag) {
    const h = mr.hist, t = mr.t - lag;
    if (!h.length) return { x: 0, y: 0 };
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        const a = h[i], b = h[i + 1] || a, k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
        return { x: U.lerp(a.x, b.x, k), y: U.lerp(a.y, b.y, k) };
      }
    }
    return h[h.length - 1];
  }
  function mrDraw() {
    const c = mr.els.ctx, rf = mr.refl.getContext('2d'), st = mr.stage, S = MR.SCALE;
    const dark = mr.dark;
    // the room's parallax follows your real head; the reflection may not
    const ox = -MR.PX - mr.mx * MR.PX * 0.8, oy = -MR.PY - mr.my * MR.PY * 0.6;
    rf.setTransform(1, 0, 0, 1, 0, 0);
    rf.globalAlpha = 1;
    rf.globalCompositeOperation = 'source-over';
    rf.drawImage(st === 3 ? (dark ? mr.roomFigDark : mr.roomFig) : dark ? mr.roomDark : mr.room, ox * S, oy * S);
    rf.setTransform(S, 0, 0, S, 0, 0);
    let px, py, tilt;
    if (st === 3) {
      px = 0; py = 0.1; tilt = 0.04; // it has stopped. It does not breathe.
    } else {
      const lag = MR_LAG[st], p = mrSample(lag), q = mrSample(lag + 0.15);
      px = p.x + Math.sin(mr.t * 0.9) * 0.015;
      py = p.y + Math.sin(mr.t * 1.7) * 0.006;
      tilt = U.clamp(-(p.x - q.x) * 0.35, -0.12, 0.12);
      if (st === 2 && mr.tiltT >= 0) tilt += Math.sin(U.clamp(mr.tiltT / 1.9, 0, 1) * Math.PI) * 0.17 * mr.tiltDir;
    }
    mrPerson(rf, MR.MW * 0.5 + px * MR.MW * 0.17, MR.MH * 0.5 + py * MR.MH * 0.06, tilt, dark);
    if (mr.flick > 0) { rf.fillStyle = `rgba(0,0,0,${0.35 + Math.random() * 0.4})`; rf.fillRect(0, 0, MR.MW, MR.MH); }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = true;
    c.drawImage(dark ? mr.wallDark : mr.wall, 0, 0);
    c.setTransform(S, 0, 0, S, 0, 0);
    c.drawImage(mr.refl, MR.X, MR.Y, MR.MW, MR.MH);
    // shards of the cracked corner reflect slightly out of line
    const ck = mr.crack;
    for (const sh of ck.shards) {
      c.save();
      c.beginPath();
      c.moveTo(MR.X + ck.ix, MR.Y + ck.iy);
      sh.a.forEach((p) => c.lineTo(MR.X + p[0], MR.Y + p[1]));
      sh.b.slice().reverse().forEach((p) => c.lineTo(MR.X + p[0], MR.Y + p[1]));
      c.closePath();
      c.clip();
      c.drawImage(mr.refl, MR.X + sh.dx, MR.Y + sh.dy, MR.MW, MR.MH);
      c.fillStyle = dark ? 'rgba(230,150,135,0.03)' : 'rgba(200,230,205,0.04)';
      c.fillRect(MR.X, MR.Y, MR.MW, MR.MH);
      c.restore();
    }
    c.drawImage(mr.grime, MR.X, MR.Y, MR.MW, MR.MH);
    c.save();
    c.beginPath();
    c.rect(MR.X, MR.Y, MR.MW, MR.MH);
    c.clip();
    c.lineCap = 'round';
    for (const pts of ck.lines) {
      c.strokeStyle = dark ? 'rgba(235,160,145,0.22)' : 'rgba(210,235,215,0.35)';
      c.lineWidth = 2;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(MR.X + p[0], MR.Y + p[1]) : c.moveTo(MR.X + p[0], MR.Y + p[1])));
      c.stroke();
    }
    c.fillStyle = dark ? 'rgba(240,170,150,0.35)' : 'rgba(220,245,225,0.5)';
    c.beginPath(); c.arc(MR.X + ck.ix, MR.Y + ck.iy, 5, 0, TAU); c.fill();
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(mr.vig, 0, 0);
    if (mr.flick > 0) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); }
    drawGrain(c, c.canvas.width, c.canvas.height, 0.1, 'overlay', 1);
  }
  device('mirror', {
    opaque: true,
    build(root) {
      const cv = U.el('canvas', { class: 'dv-mr-cv', width: MR.W * MR.SCALE, height: MR.H * MR.SCALE });
      root.appendChild(cv);
      root.appendChild(closeHint());
      mr.els = { root, cv, ctx: cv.getContext('2d') };
    },
    enter() {
      if (!mr.room) mrBuildAssets();
      mr.stage = mrStage();
      mr.dark = mrDark();
      mr.t = 0;
      mr.hist = [{ t: 0, x: mr.mx, y: mr.my }];
      mr.tiltT = -1;
      mr.nextTilt = 2.5 + Math.random() * 3;
      mr.nextFlick = 2 + Math.random() * 4;
      DA.bus.emit('mirror:open', { stage: mr.stage });
    },
    update(dt) {
      mr.t += dt;
      mr.stage = mrStage();
      mr.dark = mrDark();
      mr.hist.push({ t: mr.t, x: mr.mx, y: mr.my });
      while (mr.hist.length > 2 && mr.hist[1].t < mr.t - 2) mr.hist.shift();
      if (mr.flick > 0) mr.flick -= dt;
      mr.nextFlick -= dt;
      if (mr.nextFlick <= 0) {
        // the tube stutters (the emergency lamp does not)
        mr.flick = mr.dark ? 0 : 0.05 + Math.random() * 0.12;
        mr.nextFlick = 3 + Math.random() * 6;
        if (!mr.dark && Math.random() < 0.5) sfx('flicker', { vol: 0.25 });
      }
      if (mr.stage === 2) {
        if (mr.tiltT >= 0) { mr.tiltT += dt; if (mr.tiltT > 1.9) mr.tiltT = -1; }
        else if ((mr.nextTilt -= dt) <= 0) { mr.tiltT = 0; mr.tiltDir = Math.random() < 0.5 ? -1 : 1; mr.nextTilt = 5 + Math.random() * 5; }
      }
    },
    render() { mrDraw(); },
    mouseMove(e) {
      const p = relPos(e, mr.els.cv);
      mr.mx = U.clamp(p.x * 2 - 1, -1, 1);
      mr.my = U.clamp(p.y * 2 - 1, -1, 1);
    },
  });
  D.mirror = { open: () => openDev('mirror') };

  /* =============================================================== PHOTO */
  /*
   * The staff photo in the kitchen: a faded June 1986 colour print, three people in front of
   * the station. With flag photo_four there is a fourth at the edge, out of focus, in a jacket
   * that looks like yours. DA.variant('photo') shifts poses a little on each archive load.
   */
  const PH = { W: 1200, H: 900, IX: 40, IY: 40, IW: 1120, IH: 736 };
  const pht = { els: null, key: null };
  const JACKET = { body: '#2c3a35', collar: '#9c7a4c' };
  /**
   * One person in the 1986 print. look: {skin, hair, hairStyle 'short'|'thin'|'big', shirt,
   * sleeve?, short (sleeves), pants, skirt, tie, collar, plaid, belt, glasses, mustache,
   * faceless, broad}. pose: {arms 'down'|'folded'|'behind'|'pocket', left?, right?, tilt, lean}.
   */
  function photoPerson(x, cx, footY, h, look, pose) {
    const hr = h * 0.064, headY = footY - h + hr;
    const shY = footY - h * 0.81, shW = h * (look.broad || 0.128);
    const waistY = footY - h * 0.53, hipY = footY - h * 0.47, hipW = h * 0.098;
    const armW = h * 0.048;
    x.save();
    x.translate(cx, footY);
    x.rotate(pose.lean || 0);
    x.translate(-cx, -footY);
    x.lineJoin = x.lineCap = 'round';
    const shade = (x0, x1, a) => {
      const g = x.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, `rgba(255,240,220,${a * 0.6})`);
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(20,10,20,${a})`);
      return g;
    };
    // legs
    const ankle = footY - h * 0.03;
    if (look.skirt) {
      x.fillStyle = look.skin;
      for (const s2 of [-1, 1]) { x.beginPath(); x.moveTo(cx + s2 * hipW * 0.55 - h * 0.022, footY - h * 0.24); x.lineTo(cx + s2 * hipW * 0.5 + h * 0.022, footY - h * 0.24); x.lineTo(cx + s2 * hipW * 0.46 + h * 0.016, ankle); x.lineTo(cx + s2 * hipW * 0.46 - h * 0.016, ankle); x.closePath(); x.fill(); }
      x.fillStyle = look.pants;
      x.beginPath(); x.moveTo(cx - hipW, waistY); x.lineTo(cx + hipW, waistY); x.lineTo(cx + hipW * 1.3, footY - h * 0.22); x.lineTo(cx - hipW * 1.3, footY - h * 0.22); x.closePath(); x.fill();
      x.fillStyle = shade(cx - hipW * 1.3, cx + hipW * 1.3, 0.35); x.fill();
    } else {
      x.fillStyle = look.pants;
      for (const s2 of [-1, 1]) {
        x.beginPath();
        x.moveTo(cx + s2 * 2, hipY - h * 0.02);
        x.lineTo(cx + s2 * hipW * 1.02, hipY - h * 0.02);
        x.lineTo(cx + s2 * hipW * 0.98, ankle);
        x.lineTo(cx + s2 * hipW * 0.28, ankle);
        x.closePath();
        x.fill();
      }
      x.beginPath(); x.rect(cx - hipW * 1.02, hipY - h * 0.02, hipW * 2.04, h * 0.28); x.fillStyle = shade(cx - hipW, cx + hipW, 0.35); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(cx, hipY + h * 0.02); x.lineTo(cx, ankle); x.stroke();
    }
    x.fillStyle = '#1b1714';
    for (const s2 of [-1, 1]) { x.beginPath(); x.ellipse(cx + s2 * hipW * 0.7, footY - h * 0.012, h * 0.045, h * 0.016, s2 * 0.15, 0, TAU); x.fill(); }
    // an arm: shoulder → elbow → wrist, sleeve colour, bare forearm for short sleeves
    const limb = (pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); };
    const arm = (side, mode) => {
      const sh = [cx + side * shW * 0.86, shY + h * 0.03];
      let el, wr;
      if (mode === 'pocket') { el = [cx + side * shW * 1.12, shY + h * 0.19]; wr = [cx + side * hipW * 0.95, hipY + h * 0.01]; }
      else if (mode === 'behind') { el = [cx + side * shW * 1.02, shY + h * 0.18]; wr = [cx + side * shW * 0.7, hipY - h * 0.02]; }
      else if (mode === 'folded') { el = [cx + side * shW * 1.05, shY + h * 0.2]; wr = [cx - side * shW * 0.55, shY + h * 0.16]; }
      else { el = [cx + side * shW * 1.06, shY + h * 0.2]; wr = [cx + side * shW * 1.04, shY + h * 0.36]; }
      const sleeve = look.sleeve || look.shirt;
      limb([sh, el], armW, sleeve);
      limb([el, wr], armW * 0.88, look.short ? look.skin : sleeve);
      if (look.short) limb([el, [U.lerp(el[0], sh[0], 0.12), U.lerp(el[1], sh[1], 0.12)]], armW * 1.02, sleeve);
      if (mode === 'down' || mode === 'folded') { x.fillStyle = look.skin; x.beginPath(); x.ellipse(wr[0], wr[1] + h * 0.012, armW * 0.5, armW * 0.62, 0, 0, TAU); x.fill(); }
    };
    const L = pose.left || pose.arms, R = pose.right || pose.arms;
    if (L === 'behind') arm(-1, L);
    if (R === 'behind') arm(1, R);
    // torso
    x.fillStyle = look.shirt;
    x.beginPath();
    x.moveTo(cx - shW, shY + h * 0.035);
    x.quadraticCurveTo(cx - shW * 0.98, shY - h * 0.012, cx - shW * 0.55, shY - h * 0.016);
    x.lineTo(cx + shW * 0.55, shY - h * 0.016);
    x.quadraticCurveTo(cx + shW * 0.98, shY - h * 0.012, cx + shW, shY + h * 0.035);
    x.lineTo(cx + hipW * 1.02, waistY);
    x.lineTo(cx + hipW * 1.04, hipY);
    x.lineTo(cx - hipW * 1.04, hipY);
    x.lineTo(cx - hipW * 1.02, waistY);
    x.closePath();
    x.fill();
    if (look.plaid) {
      x.save(); x.clip();
      x.strokeStyle = 'rgba(30,10,10,0.3)'; x.lineWidth = 3;
      for (let k = -10; k < 10; k++) { x.beginPath(); x.moveTo(cx + k * 11, shY - 20); x.lineTo(cx + k * 11, hipY + 10); x.stroke(); }
      for (let k = 0; k < 20; k++) { x.beginPath(); x.moveTo(cx - shW * 1.2, shY + k * 11); x.lineTo(cx + shW * 1.2, shY + k * 11); x.stroke(); }
      x.restore();
    }
    x.fillStyle = shade(cx - shW, cx + shW, 0.4);
    x.fill();
    if (look.collar) {
      x.fillStyle = look.collar;
      x.beginPath(); x.moveTo(cx - shW * 0.62, shY - h * 0.02); x.lineTo(cx, shY + h * 0.08); x.lineTo(cx + shW * 0.62, shY - h * 0.02); x.lineTo(cx + shW * 0.34, shY - h * 0.032); x.lineTo(cx, shY + h * 0.035); x.lineTo(cx - shW * 0.34, shY - h * 0.032); x.closePath(); x.fill();
    }
    if (look.tie) {
      x.fillStyle = look.tie;
      x.beginPath(); x.moveTo(cx - h * 0.01, shY - h * 0.005); x.lineTo(cx + h * 0.01, shY - h * 0.005); x.lineTo(cx + h * 0.015, shY + h * 0.2); x.lineTo(cx, shY + h * 0.225); x.lineTo(cx - h * 0.015, shY + h * 0.2); x.closePath(); x.fill();
    }
    if (look.belt) { x.fillStyle = '#2a2018'; x.fillRect(cx - hipW * 1.03, hipY - h * 0.03, hipW * 2.06, h * 0.018); x.fillStyle = '#9a8a5a'; x.fillRect(cx - h * 0.008, hipY - h * 0.03, h * 0.016, h * 0.018); }
    if (L !== 'behind') arm(-1, L);
    if (R !== 'behind') arm(1, R);
    // neck + head
    x.fillStyle = look.skin;
    x.fillRect(cx - hr * 0.4, headY + hr * 0.5, hr * 0.8, hr * 0.9);
    x.fillStyle = 'rgba(60,30,20,0.25)';
    x.fillRect(cx - hr * 0.4, headY + hr * 0.9, hr * 0.8, hr * 0.3);
    x.save();
    x.translate(cx, headY);
    x.rotate(pose.tilt || 0);
    x.fillStyle = look.skin;
    x.beginPath(); x.ellipse(0, 0, hr * 0.8, hr, 0, 0, TAU); x.fill();
    x.beginPath(); x.ellipse(-hr * 0.8, hr * 0.05, hr * 0.13, hr * 0.22, 0, 0, TAU); x.ellipse(hr * 0.8, hr * 0.05, hr * 0.13, hr * 0.22, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(90,40,30,0.25)';
    x.beginPath(); x.ellipse(hr * 0.32, hr * 0.12, hr * 0.48, hr * 0.84, 0, 0, TAU); x.fill();
    x.fillStyle = look.hair;
    x.beginPath();
    if (look.hairStyle === 'big') {
      x.ellipse(0, -hr * 0.2, hr * 1.25, hr * 1.08, 0, Math.PI * 0.92, Math.PI * 2.08);
      x.lineTo(hr * 1.15, hr * 0.85); x.quadraticCurveTo(hr * 0.9, hr * 0.95, hr * 0.72, hr * 0.3); x.lineTo(hr * 0.55, -hr * 0.45);
      x.quadraticCurveTo(0, -hr * 0.62, -hr * 0.55, -hr * 0.45); x.lineTo(-hr * 0.72, hr * 0.3); x.quadraticCurveTo(-hr * 0.9, hr * 0.95, -hr * 1.15, hr * 0.85);
    } else if (look.hairStyle === 'thin') {
      x.ellipse(0, -hr * 0.3, hr * 0.84, hr * 0.74, 0, Math.PI * 1.02, Math.PI * 1.98);
      x.quadraticCurveTo(hr * 0.4, -hr * 0.72, 0, -hr * 0.66); x.quadraticCurveTo(-hr * 0.4, -hr * 0.72, -hr * 0.84, -hr * 0.3);
    } else {
      x.ellipse(0, -hr * 0.12, hr * 0.85, hr * 0.92, 0, Math.PI * 1.0, Math.PI * 2.0);
      x.lineTo(hr * 0.84, hr * 0.1); x.quadraticCurveTo(hr * 0.72, -hr * 0.42, hr * 0.2, -hr * 0.5);
      x.quadraticCurveTo(-hr * 0.5, -hr * 0.62, -hr * 0.78, -hr * 0.3); x.lineTo(-hr * 0.84, hr * 0.1);
    }
    x.fill();
    if (!look.faceless) {
      x.fillStyle = 'rgba(40,24,18,0.85)';
      x.beginPath(); x.ellipse(-hr * 0.3, hr * 0.02, hr * 0.1, hr * 0.06, 0, 0, TAU); x.ellipse(hr * 0.3, hr * 0.02, hr * 0.1, hr * 0.06, 0, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(60,35,25,0.55)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(-hr * 0.45, -hr * 0.16); x.lineTo(-hr * 0.15, -hr * 0.18); x.moveTo(hr * 0.15, -hr * 0.18); x.lineTo(hr * 0.45, -hr * 0.16); x.stroke();
      x.fillStyle = 'rgba(90,50,35,0.35)';
      x.beginPath(); x.moveTo(0, hr * 0.05); x.lineTo(hr * 0.1, hr * 0.32); x.lineTo(-hr * 0.04, hr * 0.34); x.closePath(); x.fill();
      if (look.mustache) { x.fillStyle = look.hair; x.beginPath(); x.ellipse(0, hr * 0.47, hr * 0.32, hr * 0.08, 0, 0, TAU); x.fill(); }
      x.strokeStyle = 'rgba(120,50,40,0.6)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(-hr * 0.22, hr * 0.6); x.quadraticCurveTo(0, hr * 0.66, hr * 0.22, hr * 0.6); x.stroke();
      if (look.glasses) {
        x.strokeStyle = 'rgba(40,34,30,0.8)';
        x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(-hr * 0.3, hr * 0.03, hr * 0.2, hr * 0.13, 0, 0, TAU); x.ellipse(hr * 0.3, hr * 0.03, hr * 0.2, hr * 0.13, 0, 0, TAU); x.stroke();
        x.beginPath(); x.moveTo(-hr * 0.1, hr * 0.02); x.lineTo(hr * 0.1, hr * 0.02); x.stroke();
      }
    }
    x.restore();
    x.restore();
  }
  function photoScene(x, W, H, four) {
    const r = U.mulberry32(1986);
    const v = DA.variant('photo');
    const sky = x.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#8fb0c8'); sky.addColorStop(1, '#dde3da');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.32)';
    for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(r() * W, r() * H * 0.22, 80 + r() * 140, 16 + r() * 16, 0, 0, TAU); x.fill(); }
    // distant ridge, then two rows of firs (the far row hazier)
    x.fillStyle = '#869aa0';
    x.beginPath(); x.moveTo(0, H * 0.4);
    for (let i = 0; i <= 14; i++) x.lineTo((i / 14) * W, H * (0.26 + r() * 0.08));
    x.lineTo(W, H * 0.5); x.lineTo(0, H * 0.5); x.closePath(); x.fill();
    const fir = (tx, base, th, col) => {
      x.fillStyle = col;
      x.beginPath();
      const tiers = 5, w0 = th * 0.3;
      x.moveTo(tx, base - th);
      for (let k = 1; k <= tiers; k++) { const yy = base - th + (th * k) / tiers, ww = (w0 * k) / tiers; x.lineTo(tx + ww, yy); x.lineTo(tx + ww * 0.6, yy - th * 0.04); }
      for (let k = tiers; k >= 1; k--) { const yy = base - th + (th * k) / tiers, ww = (w0 * k) / tiers; x.lineTo(tx - ww * 0.6, yy - th * 0.04); x.lineTo(tx - ww, yy); }
      x.closePath(); x.fill();
    };
    x.fillStyle = '#3f5046';
    x.fillRect(0, H * 0.4, W, H * 0.12);
    for (let i = 0; i < 70; i++) fir((i / 70) * W + r() * 14, H * 0.47, H * (0.14 + r() * 0.1), r() < 0.5 ? '#4b5e52' : '#55695b');
    x.fillStyle = '#2e3d2c';
    x.fillRect(0, H * 0.47, W, H * 0.06);
    for (let i = 0; i < 46; i++) fir((i / 46) * W + r() * 20, H * 0.52, H * (0.18 + r() * 0.16), r() < 0.5 ? '#2c3b2a' : '#344632');
    // lattice tower behind the roof
    const tx0 = W * 0.8;
    x.strokeStyle = '#6c6f6c';
    x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(tx0 - 28, H * 0.45); x.lineTo(tx0 - 4, H * 0.02); x.moveTo(tx0 + 28, H * 0.45); x.lineTo(tx0 + 4, H * 0.02); x.stroke();
    x.lineWidth = 1.2;
    for (let k = 0; k < 18; k++) {
      const y0 = H * 0.45 - k * H * 0.024, y1 = y0 - H * 0.024, w0 = 28 - k * 1.3, w1 = 28 - (k + 1) * 1.3;
      x.beginPath(); x.moveTo(tx0 - w0, y0); x.lineTo(tx0 + w1, y1); x.moveTo(tx0 + w0, y0); x.lineTo(tx0 - w1, y1); x.stroke();
    }
    x.fillStyle = '#c23a2a';
    x.beginPath(); x.arc(tx0, H * 0.02, 4, 0, TAU); x.fill();
    // the station, 1986: fresh paint
    const bx0 = W * 0.04, bx1 = W * 0.96, by0 = H * 0.34, by1 = H * 0.66;
    x.fillStyle = '#c3bba9';
    x.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    x.strokeStyle = 'rgba(90,80,65,0.16)';
    x.lineWidth = 1;
    for (let yy = by0 + 14; yy < by1; yy += 14) { x.beginPath(); x.moveTo(bx0, yy); x.lineTo(bx1, yy); x.stroke(); }
    x.fillStyle = '#6b665c';
    x.fillRect(bx0 - 10, by0 - 16, bx1 - bx0 + 20, 18);
    x.fillStyle = '#595449';
    x.fillRect(bx1 - 40, by0, 8, by1 - by0);
    const sh = x.createLinearGradient(0, by0, 0, by0 + 40);
    sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh;
    x.fillRect(bx0, by0, bx1 - bx0, 40);
    const win = (wx0, ww) => {
      x.fillStyle = '#39444a'; x.fillRect(wx0, by0 + 46, ww, 66);
      x.fillStyle = 'rgba(200,215,225,0.35)'; x.beginPath(); x.moveTo(wx0, by0 + 46); x.lineTo(wx0 + ww * 0.5, by0 + 46); x.lineTo(wx0, by0 + 94); x.closePath(); x.fill();
      x.strokeStyle = '#d9d4c6'; x.lineWidth = 4; x.strokeRect(wx0, by0 + 46, ww, 66);
    };
    win(W * 0.08, 120); win(W * 0.22, 120); win(W * 0.7, 120);
    x.fillStyle = '#35503f';
    x.fillRect(W * 0.47, by0 + 36, 76, by1 - by0 - 36);
    x.fillStyle = '#b8a36a';
    x.fillRect(W * 0.47 + 62, by0 + 110, 7, 12);
    x.fillStyle = '#e8e2c8';
    x.beginPath(); x.ellipse(W * 0.47 + 38, by0 + 22, 14, 7, 0, 0, TAU); x.fill();
    x.fillStyle = '#f2efe6';
    x.fillRect(W * 0.395, by0 + 4, 228, 24);
    x.fillStyle = '#1d1d1d';
    x.font = "bold 18px 'Liberation Sans', Arial, sans-serif";
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('RELAY STATION 14', W * 0.395 + 114, by0 + 17);
    // gravel
    x.fillStyle = '#958c7b';
    x.fillRect(0, by1, W, H - by1);
    for (const col of ['rgba(55,50,44,0.4)', 'rgba(205,198,182,0.35)', 'rgba(90,84,74,0.5)']) {
      x.fillStyle = col;
      x.beginPath();
      for (let i = 0; i < 1800; i++) {
        const yy = by1 + Math.pow(r(), 0.8) * (H - by1), sz = 1 + ((yy - by1) / (H - by1)) * 2.5;
        x.rect(r() * W, yy, sz, sz * 0.7);
      }
      x.fill();
    }
    const gs = x.createLinearGradient(0, by1, 0, by1 + 34);
    gs.addColorStop(0, 'rgba(0,0,0,0.3)'); gs.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gs; x.fillRect(0, by1, W, 34);
    // three staff, standing close to the camera
    const foot = H * 0.965, hh = H * 0.6, jit = (k) => (DA.variant('photo' + k) - 0.5) * 16;
    const shadow = (cx, w) => { x.fillStyle = 'rgba(40,30,20,0.28)'; x.beginPath(); x.ellipse(cx + w * 0.4, foot, w, 12, 0, 0, TAU); x.fill(); };
    const people = [
      { cx: W * 0.28 + jit(1), s: 1, look: { skin: '#d7a98a', hair: '#a19c93', hairStyle: 'thin', shirt: '#ebe7dc', short: true, tie: '#6d2b22', pants: '#3e3c38', belt: true, glasses: true, broad: 0.136 },
        pose: { arms: v < 0.5 ? 'folded' : 'down', tilt: 0.02 } },
      { cx: W * 0.5 + jit(2), s: 0.93, look: { skin: '#e2b597', hair: '#5a3a24', hairStyle: 'big', shirt: '#7394b6', pants: '#57493d', skirt: true, broad: 0.114 },
        pose: { arms: 'down', left: v > 0.7 ? 'behind' : 'down', tilt: (v - 0.5) * 0.14 } },
      { cx: W * 0.7 + jit(3), s: 1.02, look: { skin: '#c9967a', hair: '#2f2419', shirt: '#8d3b2c', plaid: true, pants: '#4b5a78', mustache: true, belt: true },
        pose: { arms: 'down', right: v < 0.3 ? 'down' : 'pocket', tilt: -0.03, lean: (v - 0.5) * 0.02 } },
    ];
    for (const p of people) shadow(p.cx, hh * 0.16);
    for (const p of people) photoPerson(x, p.cx, foot, hh * p.s, p.look, p.pose);
    if (four) {
      // at the edge, nearer the lens, out of focus: your jacket (drawn small, enlarged = defocus)
      const k = 0.14, fc = mkCanvas(Math.ceil(W * k), Math.ceil(H * k)), fx = fc.getContext('2d');
      fx.scale(k, k);
      photoPerson(fx, W * 0.975, H * 1.12, H * 0.8, { skin: '#c7a28e', hair: '#241d18', shirt: JACKET.body, sleeve: JACKET.body, collar: JACKET.collar, pants: '#232220', faceless: true, broad: 0.13 }, { arms: 'down', tilt: -0.07 });
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(fc, 0, 0, W, H);
    }
  }
  function photoRender(four) {
    const c = pht.els.cv.getContext('2d');
    const img = mkCanvas(PH.IW, PH.IH), ix = img.getContext('2d');
    photoScene(ix, PH.IW, PH.IH, four);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // the print's border, yellowed
    const bg = c.createLinearGradient(0, 0, PH.W, PH.H);
    bg.addColorStop(0, '#efe8d6'); bg.addColorStop(1, '#e2d7bd');
    c.fillStyle = bg;
    c.fillRect(0, 0, PH.W, PH.H);
    // the lens and the print soften everything a little (a cheap blur: down, then up)
    const soft = mkCanvas(Math.round(PH.IW * 0.62), Math.round(PH.IH * 0.62));
    const sx = soft.getContext('2d');
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(img, 0, 0, soft.width, soft.height);
    c.save();
    c.filter = 'saturate(0.72) contrast(0.86) brightness(1.05) sepia(0.2)';
    c.imageSmoothingQuality = 'high';
    c.drawImage(soft, PH.IX, PH.IY, PH.IW, PH.IH);
    c.restore();
    c.save();
    c.beginPath(); c.rect(PH.IX, PH.IY, PH.IW, PH.IH); c.clip();
    // 80s colour print: magenta-orange cast, lifted blacks, a light leak, vignette
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = 'rgba(255,150,110,0.35)';
    c.fillRect(PH.IX, PH.IY, PH.IW, PH.IH);
    c.globalCompositeOperation = 'lighten';
    c.fillStyle = 'rgba(58,44,52,1)';
    c.fillRect(PH.IX, PH.IY, PH.IW, PH.IH);
    c.globalCompositeOperation = 'screen';
    const leak = c.createRadialGradient(PH.IX, PH.IY + PH.IH * 0.3, 10, PH.IX, PH.IY + PH.IH * 0.3, PH.IW * 0.35);
    leak.addColorStop(0, 'rgba(255,120,40,0.35)'); leak.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = leak;
    c.fillRect(PH.IX, PH.IY, PH.IW, PH.IH);
    c.globalCompositeOperation = 'multiply';
    const vg = c.createRadialGradient(PH.IX + PH.IW / 2, PH.IY + PH.IH / 2, PH.IH * 0.35, PH.IX + PH.IW / 2, PH.IY + PH.IH / 2, PH.IW * 0.68);
    vg.addColorStop(0, 'rgba(255,255,255,1)'); vg.addColorStop(1, 'rgba(120,95,90,1)');
    c.fillStyle = vg;
    c.fillRect(PH.IX, PH.IY, PH.IW, PH.IH);
    c.restore();
    c.save();
    c.beginPath(); c.rect(PH.IX, PH.IY, PH.IW, PH.IH); c.clip();
    drawGrain(c, PH.W, PH.H, 0.22, 'overlay', 1);
    // dust and one hairline scratch
    const r = U.mulberry32(61486);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,250,${0.2 + r() * 0.5})`; c.fillRect(PH.IX + r() * PH.IW, PH.IY + r() * PH.IH, 1 + r() * 2, 1 + r() * 2); }
    c.strokeStyle = 'rgba(255,255,245,0.25)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(PH.IX + PH.IW * 0.62, PH.IY); c.bezierCurveTo(PH.IX + PH.IW * 0.6, PH.IY + 200, PH.IX + PH.IW * 0.66, PH.IY + 420, PH.IX + PH.IW * 0.63, PH.IY + PH.IH); c.stroke();
    // camera date imprint
    c.font = "38px VT323, 'DejaVu Sans Mono', monospace";
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.shadowColor = 'rgba(255,110,30,0.9)';
    c.shadowBlur = 8;
    c.fillStyle = 'rgba(255,150,60,0.85)';
    c.fillText("'86  6  14", PH.IX + PH.IW - 30, PH.IY + PH.IH - 24);
    c.restore();
    // crease across the top-right corner
    c.save();
    c.strokeStyle = 'rgba(255,255,250,0.55)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(PH.W - 260, 0); c.quadraticCurveTo(PH.W - 120, 110, PH.W, 190); c.stroke();
    c.strokeStyle = 'rgba(60,40,20,0.2)';
    c.beginPath(); c.moveTo(PH.W - 256, 3); c.quadraticCurveTo(PH.W - 118, 114, PH.W, 194); c.stroke();
    c.restore();
    // caption, typed on the border
    c.save();
    c.translate(PH.W / 2, PH.IY + PH.IH + 72);
    c.rotate(-0.006);
    c.font = "34px 'Special Elite', 'Liberation Mono', monospace";
    c.fillStyle = 'rgba(38,40,60,0.85)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('RELAY STATION 14 — STAFF — JUNE 1986', 0, 0);
    c.restore();
    drawGrain(c, PH.W, PH.H, 0.05, 'multiply', 2);
  }
  device('photo', {
    dim: true,
    clickOutside: true,
    build(root) {
      const cv = U.el('canvas', { class: 'dv-ph-cv', width: PH.W, height: PH.H });
      root.appendChild(U.el('div', { class: 'dv-ph-print' }, cv, U.el('i', { class: 'dv-ph-tack' })));
      root.appendChild(closeHint());
      pht.els = { root, cv };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { pht.key = null; });
    },
    enter() {
      const four = !!DA.flag('photo_four');
      const key = four + ':' + DA.state.seed;
      if (pht.key !== key) { photoRender(four); pht.key = key; }
      DA.bus.emit('photo:view', { four });
    },
  });
  D.photo = { open: () => openDev('photo') };

  /* ======================================================= SMALL THINGS */
  /* coffee — five seconds of gurgling, then a mug */
  const cof = { brewing: false };
  function coffeeBrew(t) {
    t = t || {};
    if (DA.hasItem('mug')) { ui.think(line('thoughts_coffee_enough', 'One cup is enough.')); return; }
    if (cof.brewing) { ui.hint('BREWING…', 1.2); return; }
    cof.brewing = true;
    const id = t.id || 'coffee_machine';
    const snd = sfx('coffee_brew', atIt(id));
    const N = 5;
    let k = 0;
    const show = () => ui.hint('BREWING  ' + '●'.repeat(k) + '○'.repeat(N - k), 1.3);
    show();
    DA.timers.every(1, () => {
      k++;
      if (k < N) { show(); return; }
      DA.timers.cancelTag('dv_coffee');
      cof.brewing = false;
      stopSnd(snd, 0.3);
      sfx('mug_set', atIt(id));
      DA.giveItem('mug');
      ui.toast(itemName('mug'));
      DA.bus.emit('coffee:made', { id });
    }, 'dv_coffee');
  }
  D.coffee = { brew: coffeeBrew, isBrewing: () => cof.brewing };

  /* generator — the backup set in the basement */
  function generatorToggle(t) {
    const w = DA.world;
    const on = w && w.power ? !!safe(() => w.power('generator'), false) : false;
    const next = !on;
    if (w && w.setPower) safe(() => w.setPower('generator', next));
    sfx(next ? 'generator_start' : 'generator_stop', atIt((t && t.id) || 'generator'));
    DA.bus.emit('generator:toggle', { on: next });
  }

  /* vents — unscrew the grille; previous operators left things inside */
  const ventBusy = {};
  function collectNote(noteId, source) {
    if (!Array.isArray(DA.state.notes)) DA.state.notes = [];
    if (!DA.state.notes.includes(noteId)) DA.state.notes.push(noteId);
    DA.bus.emit('note:found', { id: noteId, source });
  }
  /** Show notes one after another (DA.ui.doc(id) falls back to DA.content.notes[id]). */
  async function showNotes(ids) {
    const session = DA.session;
    for (const id of ids) {
      if (DA.session !== session) return;
      const n = DA.content && DA.content.notes && DA.content.notes[id];
      await (n || !DA.content ? ui.doc(id) : ui.doc({ id, title: 'NOTE', style: 'paper', body: id }));
    }
  }
  function ventOpen(t) {
    const id = t.id;
    if (!id) return;
    const opened = wsub('opened');
    if (opened[id]) { ui.think(line('thoughts_vent_empty', 'Empty.')); return; }
    if (ventBusy[id]) return;
    ventBusy[id] = true;
    sfx('vent_open', atIt(id));
    ui.hint('UNSCREWING THE GRILLE…', 1.5);
    DA.timers.after(1.5, () => {
      delete ventBusy[id];
      opened[id] = true;
      const item = val(t, 'item'), doc = val(t, 'doc');
      // the interactable's note/notes plus every content note filed under this vent (notes.*.where)
      const cNotes = (DA.content && DA.content.notes) || {};
      const filed = Object.keys(cNotes).filter((n) => cNotes[n] && cNotes[n].where === id);
      const notes = [].concat(val(t, 'note') || [], val(t, 'notes') || [], filed).filter((n, i, arr) => n && arr.indexOf(n) === i);
      if (item) { DA.giveItem(item); ui.toast(itemName(item)); }
      notes.forEach((n) => collectNote(n, id));
      if (notes.length) showNotes(notes);
      else if (doc) ui.doc(doc);
      if (!item && !notes.length && !doc) ui.think(line('thoughts_vent_dust', 'Nothing in there but dust.'));
      DA.bus.emit('vent:open', { id, note: notes[0] || null, notes, item: item || null });
    }, 'dv_vent');
  }

  /* levers — the array limiters */
  function leverToggle(t) {
    const id = t.id;
    if (!id) return;
    const lv = wsub('levers');
    const on = !lv[id];
    lv[id] = on;
    sfx('lever', atIt(id));
    const w = DA.world;
    if (w && w.setPropTex && w.prop && safe(() => w.prop(id), null)) safe(() => w.setPropTex(id, on ? 'spr_lever_down' : 'spr_lever'));
    DA.bus.emit('lever', { id, on });
  }
  function syncLevers() {
    const lv = DA.state.world && DA.state.world.levers, w = DA.world;
    if (!lv || !w || !w.setPropTex || !w.prop) return;
    for (const id in lv) if (safe(() => w.prop(id), null)) safe(() => w.setPropTex(id, lv[id] ? 'spr_lever_down' : 'spr_lever'));
  }

  /* keypad kind — interactable {code, door?, item?, title?} */
  const KEYPAD_TITLES = { key_cabinet: 'KEY CABINET', relay_door: 'RELAY CHAMBER' };
  function keypadKind(t) {
    const id = t.id, s = S(), session = DA.session;
    const door = val(t, 'door'), item = val(t, 'item');
    if (s.keypads[id]) {
      if (door && DA.world) {
        safe(() => { DA.world.lockDoor && DA.world.lockDoor(door, false); DA.world.openDoor && DA.world.openDoor(door); });
        return;
      }
      if (item) {
        // Recover an unlock archived during its short success animation.
        if (!DA.hasItem(item)) { DA.giveItem(item); ui.toast(itemName(item)); }
        else ui.think(line('thoughts_keypad_done', "It's open. Nothing else in there."));
        return;
      }
    }
    D.keypad.open({ id, code: val(t, 'code'), title: val(t, 'title') || KEYPAD_TITLES[id], label: val(t, 'label') }).then((ok) => {
      if (!ok || DA.session !== session) return;
      if (door && DA.world) safe(() => { DA.world.lockDoor && DA.world.lockDoor(door, false); DA.world.openDoor && DA.world.openDoor(door); });
      if (item && !DA.hasItem(item)) { DA.giveItem(item); ui.toast(itemName(item)); }
    });
  }

  /* ========================================================= KIND TABLE */
  const KINDS = {
    cctv: () => D.cctv.open(),
    phone: () => {
      if (ph.ringing) { D.phone.answer(); return; }
      sfx('dial_tone', atIt('phone', { vol: 0.6 }));
      ui.think(line('thoughts_phone', 'No one to call at this hour.'));
    },
    map: (t) => D.map.open({ find: val(t, 'find') || null }),
    paperwork: () => D.paperwork.open(),
    mirror: () => D.mirror.open(),
    photo: () => D.photo.open(),
    keypad: keypadKind,
    terminal: () => D.terminal.open(),
    weather: (t) => D.weather.open({ source: val(t, 'source') || (/panel|office/.test(String(t.id)) ? 'panel' : 'mast') }),
    calendar: () => D.calendar.open(),
    coffee: coffeeBrew,
    breaker: () => D.breaker.open(),
    generator: generatorToggle,
    tapes: (t) => D.tapes.open({ tapes: val(t, 'tapes') }),
    vent: ventOpen,
    lever: leverToggle,
  };
  let kindsRegistered = false;
  function registerKinds() {
    if (kindsRegistered || !DA.interact || !DA.interact.on) return;
    kindsRegistered = true;
    for (const k in KINDS) {
      DA.interact.on(k, (target) => {
        try { KINDS[k](tgt(target)); } catch (e) { console.error('[devices] kind ' + k, e); }
        return true;
      });
    }
  }

  /* ========================================================== LIFECYCLE */
  /** Throw away runtime (ringing, brewing, animations) and re-read DA.state. */
  function rebuild() {
    ph.ringing = false;
    stopSnd(ph.loop, 0.05);
    ph.loop = null;
    ph.held = false;
    cof.brewing = false;
    for (const k in ventBusy) delete ventBusy[k];
    brk.busy = {};
    wx.shift0 = null;
    pht.key = null;
    ftReset();
    for (const k in ccLightCache) delete ccLightCache[k];
    S();
  }
  DA.bus.on('boot', () => {
    buildDevices();
    registerModes();
    registerKinds();
  });
  DA.bus.on('booted', () => {
    registerKinds();
    prewarm();
  });
  /**
   * Build the expensive, static canvases (the county map sheet, the mirror's layers) while the
   * title screen is up, once web fonts have arrived, so opening them in play never hitches.
   */
  function prewarm() {
    const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 250));
    const go = () => {
      idle(() => {
        if (!mp.base && mp.els) {
          try {
            mp.src = (DA.content && DA.content.maplocs) || FALLBACK_LOCS;
            mp.locs = mapLocs();
            mp.base = mapBuild();
          } catch (e) { warnOnce('prewarm map', e); }
        }
        idle(() => { if (!mr.room && mr.els) safe(mrBuildAssets); });
      });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(go, 300));
    else setTimeout(go, 1000);
  }
  DA.bus.on('runtime:reset', () => {
    ph.ringing = false;
    stopSnd(ph.loop, 0.05);
    ph.loop = null;
    cof.brewing = false;
    for (const k in ventBusy) delete ventBusy[k];
    brk.busy = {};
  });
  DA.bus.on('game:new', rebuild);
  DA.bus.on('game:load', rebuild);
  DA.bus.on('game:ready', () => {
    S();
    registerKinds();
    syncLevers();
  });

  /* ======================================================== GENERIC API */
  D.open = (name, arg) => openDev(name, arg);
  D.close = (name, result) => closeDev(name, result);
  D.isOpen = (name) => !!(devs[name] && devs[name].isOpen);
  D.names = () => Object.keys(devs);
})();
