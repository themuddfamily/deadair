/* DEAD AIR — world.js
 * DA.world (maps at runtime, player, doors, lights/power, props, NPCs, mutations, weather,
 * queries), DA.interact (interactables) and the first-person mode 'explore'.
 * Contract: PLAN.md §6.4 (+ §5, §7). Level data: js/maps.js (DA.maps.defs).
 *
 * ------------------------------------------------------------------ RUNTIME MAP (§6.4)
 *  {id, w, h, wall, wallN, wallE, wallS, wallW, floor, ceil (Uint16Array texture ids; 0 = none /
 *   sky / void), solid (Uint8Array), room (Uint8Array → rooms[]; rooms[0] = ''), light
 *   (Float32Array 0..~1.5, animated), door (Int16Array → doors[], -1 none), doors, emissive,
 *   alt, tint, variant, windowFigure, props}
 *  Notes: wall[i] is the cell's base texture; wallN/E/S/W[i] are the fully resolved face
 *  textures (room paint, exterior concrete, window/decal composites). A wall cell is any cell
 *  with wall[i] > 0. Pits: solid=1, wall=0, floor=0 (void). Door cells: wall=0, solid=0.
 *  ADDED fields: name, w/h, outdoor (Uint8Array 1 = open sky/outside), pit, creak, reserved,
 *   chars (effective ASCII rows), rooms, decor (static sprites), interact (all interactables),
 *   points (degrees), triggers, lights (runtime), portals, altFace (Map idx*4+side → texId;
 *   side 0=n 1=e 2=s 3=w — `alt` holds the same face keys, see below), altCell (Map idx →
 *   texId), winLight (Float32Array daylight reach through windows), def.
 *  alt / altFace: `alt` holds cell keys (cellIndex → texId); face-specific overrides (every entry in
 *   maps.js) go to `altFace` (idx*4+side → texId, collision-free — DA.render reads both). When a
 *   map has only face overrides, `alt` carries one no-op cell key so DA.render consults altFace.
 *  Map extras copied from the definition when present: wallHeight, sky (false = dark void above
 *   ceil-0 cells instead of storm sky), fog, pitchMax (look up/down limit on this map; the array
 *   lets you look down into the shaft).
 *  Emissive (wave 3): cellEmis (Float32Array w*h; -1 = use the map-wide `emissive`; ceiling-panel
 *   cells carry their own light's live level, so a dead/flickering tube shows a dead/flickering
 *   panel — breaker C kills the corridor panels), emisTex (Map texId → 0..1: wall devices on their
 *   own supply, from def.emissiveCircuits — the receiver on circuit 'radio', the CCTV bank on 'ups',
 *   the antenna consoles on 'array'). Door records carry `slats` ('louver'|'gap'|null): DA.render
 *   draws the room behind through the gaps (supply cupboard, toilet stall).
 *  Texture names in map data may list fallbacks 'a||b' (first whose base DA.textures has).
 *  Legend floor cells with solid:true block movement but render as floor (the woods' tree margins).
 *  Daylight: indoor cells get daylight through windows (winLight, 6 cells) and from roof holes
 *   (indoor cells with no ceiling); the abandoned station (2049) is washed with grey daylight —
 *   reach 9 cells, through open doorways, plus an indoor base (applyDaylight).
 *
 * ------------------------------------------------------------------ DA.world (§6.4)
 *  map, mapId, maps, player {x, y, angle, pitch, running, crouching, hidden, flashlight, noise,
 *   bob}; camera() → {x, y, angle, pitch, fov, bob, z, map}; update(dt).
 *  load(mapId, point|{x,y,angle}, {fade}) → Promise; teleport(x, y, angleDeg?, mapId?) (or
 *   teleport(pointName)) — seamless: a player walking in 'explore' keeps their stride, turned with
 *   the new heading (the woods → the cupboard aisle); otherwise they land still.
 *  point(name) → {map, x, y, angle (RADIANS), deg}; room(); roomAt(x, y, mapId).
 *  door(id), openDoor(id, instant), closeDoor(id, instant), lockDoor(id, bool), isOpen(id).
 *  addProp(p), prop(id), moveProp(id, x, y, mapId?), setPropTex(id, tex), showProp(id, bool),
 *   removeProp(id), pointProp(id, pointName).
 *  addNpc({id, map, x, y, tex, angle}), walkNpc(id, point|[points], speed=1.3) → Promise,
 *   removeNpc(id), npc(id).
 *  setPower(circuit, on), power(circuit); setDaylight(v), setBlend(v), setWeather({rain, thunder}).
 *  applyMutation(name), revertMutation(name), hasMutation(name).
 *  lineOfSight(ax, ay, bx, by, mapId), path(ax, ay, bx, by, mapId) → [{x,y}]|null,
 *   radioAudibility(), history(secAgo), cameras(), flickerNear(x, y, secs).
 *
 * ------------------------------------------------------------------ ADDITIONS
 *  DA.world: texName(id), focusAt(x, y, angleDeg, mapId), canStand(x, y, mapId), sprites(mapId),
 *   lightning(strength), cellAt(x, y, mapId) → {x, y, i, wall, solid, room, door, outdoor},
 *   isOutdoor(), focus() (current interactable or null), setBreaker(id, on), breakers (getter),
 *   powerRaw(), setGeneratorSound('on'|'stutter'|null), setProp(id, patch) (z, scale, frame,
 *   flip, alpha, angle), propsOn(mapId), stopNpc(id), npcs(), exitHide(), isHidden(),
 *   setFlashlight(on), setCrouch(on), freeze(on) (scripted: no player movement/interaction),
 *   lookAt(x, y, secs, opts?) (turns the view smoothly toward a point; opts.from = {x,y}|point
 *   name → face along the direction from that reference to (x, y) — e.g. from pt_radio_chair to
 *   pt_fig_4 = "behind the chair" even when standing on the spot; opts.pitch), turnTo(angleDeg,
 *   secs, pitch?) (absolute heading), facing(x, y) → angle diff (rad), distTo(x, y), inRoom(name),
 *   compile(mapId) (rebuild), debugInfo().
 *   canSee(x, y, {maxDist=14, margin=6°, mapId}) → bool: point in front, inside the view and in
 *   line of sight (a manifestation happening "where you can see it" / "unseen").
 *   inBuilding() → bool: on the station map under a roof (the ceiling speaker's reach; false
 *   outside, in the woods, and on every other map).
 *   doorsLeftOpen(by='player', mapId='station') → ids of doors standing open whose last mover was
 *   `by` ('player' | 'npc:<id>' | 'script' | 'key'); doorInfo(id) → {id, open, locked, by, map}.
 *   lightAs(mapId, power?) → Float32Array(w*h): the map's light field as it would be with `power`
 *   (default main + corridor on), steady — for DA.render.renderView opts.light (montage).
 *   Props may carry `emissive` (0..1, passed to the renderer: glow independent of station power).
 *   camera().z = eye height in wall units (0.5 standing, 0.32 crouched, ~0.2–0.3 hidden);
 *   camera().bob = head-bob offset added to z by the renderer (0 when headBob is off).
 *  DA.interact: onId(id, fn) / onKind(kind, fn) → unsubscribe fn (explicit tables; prefer these).
 *   on(key, fn) (legacy: key = id or kind). fire() runs onId(id) → on(id) → onKind(kind) →
 *   on(kind) and stops at the first handler returning true: an id handler ALWAYS runs before every
 *   kind handler, even when an id equals a kind ('generator', 'car'). The world's own kinds (door,
 *   stairs, ladder, hide, item, flashlight, note, doc, look) are onKind.
 *   off(key, fn), find(id) → {it, map}, prompt(id), enabled(id), focus(),
 *   list(mapId). setPrompt(id, null) restores the default prompt; setPrompt(id, '') keeps the
 *   interactable usable with no prompt text.
 *   fire(target, opts): opts is passed to handlers as their 2nd argument (the door kind uses
 *   {lock:true} for hold-to-lock). Handlers receive the interactable object itself.
 *  Door interaction: from inside a lockableInside door (radio_door) HOLD E to lock/unlock.
 *  Kind `note` also emits 'note:found' {id, source} (same event devices.js uses for vent notes).
 *  Events added: 'portal' {map, to}, 'npc:arrive' {id, point}, 'breaker:set' {id, on},
 *   'world:ready' {mapId} (after rebuild on game:new/load), 'door:locked' carries
 *   {id, attempt:true} when someone tries a locked door and {id, attempt:false} when locked.
 *   'room:enter' {room, prev, map}; 'trigger:enter'/'trigger:exit' {id, map} (several zones may
 *   share an id; a zone with `dir` (degrees) only fires when entered heading that way — moving,
 *   or facing when still — and then exits normally);
 *   'map:change' {from, to, point}; 'hide:enter'/'hide:exit' {id}; 'power:change'
 *   {circuit, on, power}; 'mutation' {name, on}; 'lightning' {strength, delay}.
 *  Circuits: main corridor emergency outdoor array generator radio (the receiver's own supply:
 *   off while DA.state.radio.power === false) ups (CCTV) (+ any other name, e.g. 'relay', which
 *   counts as on unless set false).
 *  game:quit resets the ambience to a quiet neutral (no drone/generator/hum/thunder under the title).
 *  path(ax, ay, bx, by, mapId, opts) (FIX-D): routes around solid props, decor and trees, keeping a
 *   walker (radius ~0.18) clear of them — a cell whose centre a prop covers is crossed at a free spot
 *   inside it, or not at all; string-pulled legs never clip a prop. A leg that starts/ends inside a
 *   prop's reach may leave/approach it (walking away from the chair; a goal on the chair itself).
 *   When no prop-free route exists, the plain grid route is returned (as before). opts.locked
 *   (cross locked doors), opts.props === false (ignore props: the old grid-only route).
 *   NPCs are not obstacles (they move).
 *  State: DA.state.world = {map, x, y, angle (rad), pitch, crouch, flashlight, hidden, hideFrom,
 *   doors {id: {open, locked, by}}, props {id: record}, npcs {id: record}, power, breakers,
 *   mutations, opened, levers, daylight, blend, weather {rain, thunder, baseRain}, prompts,
 *   disabled, genSound}.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;

  /* ============================================================== constants */
  const SIDES = ['n', 'e', 's', 'w'];
  const SIDE_IDX = { n: 0, e: 1, s: 2, w: 3 };
  const DIR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const DEG = Math.PI / 180;
  const RADIUS = 0.22;             // player collision radius
  const SPEED = { walk: 2.1, run: 3.4, crouch: 1.0 };
  const EYE = { stand: 0.5, crouch: 0.32 };
  const REACH = 1.6;               // interaction reach
  const AMB_IN = 0.05, AMB_OUT = 0.16; // the renderer's fog eats a lot of an unlit night
  const TURN_RATE = 2.3;           // arrow-key turning, rad/s
  const PITCH_MAX = 0.4;
  const HISTORY_LEN = 300;
  const AUDIBLE_CELLS = 6;         // radio speaker fades over this many cells of walking distance
  const CAM_LABELS = {
    cam_1: 'CAM 1 — FRONT ENTRANCE', cam_2: 'CAM 2 — HALLWAY', cam_3: 'CAM 3 — GENERATOR', cam_4: 'CAM 4 — RADIO ROOM',
  };
  const ROOM_REVERB = {
    radio: 'small', office: 'small', kitchen: 'small', equipment: 'small', storage: 'small', workshop: 'small',
    records: 'small', stairs: 'small', bathroom: 'bathroom', hall: 'hall', lobby: 'hall', newhall: 'hall', hall_ext: 'hall',
    lot: 'outside', road: 'outside', forest: 'outside', woods: 'outside', roof: 'outside',
    b_stairs: 'basement', b_hall: 'basement', generator: 'basement', vent: 'basement', control: 'small', array: 'array', relay: 'hall',
  };
  const FOOT_SURFACE = {
    floor_lino: 'lino', floor_tile: 'tile', floor_carpet: 'carpet', floor_concrete: 'concrete', floor_grate: 'metal',
    ground_gravel: 'gravel', ground_mud: 'mud', ground_asphalt: 'concrete', roof_tar: 'concrete', hatch: 'metal',
  };

  /* ================================================================ helpers */
  const S = () => DA.state.world;
  const audio = (fn, ...a) => {
    const A = DA.audio;
    if (!A || typeof A[fn] !== 'function') return null;
    try { return A[fn](...a); } catch (e) { console.error('[world] audio.' + fn, e); return null; }
  };
  const ui = (fn, ...a) => {
    const I = DA.ui;
    if (!I || typeof I[fn] !== 'function') return null;
    try { return I[fn](...a); } catch (e) { console.error('[world] ui.' + fn, e); return null; }
  };
  const render = (fn, ...a) => {
    const R = DA.render;
    if (!R || typeof R[fn] !== 'function') return null;
    try { return R[fn](...a); } catch (e) { console.error('[world] render.' + fn, e); return null; }
  };
  const content = () => DA.content || {};
  const pretty = (id) => String(id).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const itemName = (id) => {
    const it = content().items && content().items[id];
    return String((it && (it.name || it.label)) || pretty(id)).toUpperCase();
  };

  /* ------------------------------------------------------- texture ids */
  // Real ids come from DA.textures. Without it (dev harness) a stub hands out stable ids so the
  // compiled maps are still complete and the debug view can name every face.
  const stubNames = [''];
  const stubIds = new Map();
  const tidCache = new Map();
  /** 'a||b||c' → the first alternative whose base texture exists in DA.textures (last one otherwise). */
  function pickAlt(name) {
    const parts = String(name).split('||');
    const T = DA.textures;
    if (!T || typeof T.has !== 'function') return parts[0];
    for (const n of parts) { try { if (T.has(n.split('+')[0])) return n; } catch (e) { /* ignore */ } }
    return parts[parts.length - 1];
  }
  function tid(name) {
    if (!name) return 0;
    if (typeof name === 'number') return name;
    let v = tidCache.get(name);
    if (v !== undefined) return v;
    if (name.indexOf('||') >= 0) { v = tid(pickAlt(name)); tidCache.set(name, v); return v; }
    const T = DA.textures;
    if (T && typeof T.id === 'function') {
      try { v = T.id(name) | 0; } catch (e) { v = 0; }
    } else {
      v = stubIds.get(name);
      if (v === undefined) { v = stubNames.length; stubNames.push(name); stubIds.set(name, v); }
    }
    tidCache.set(name, v);
    return v;
  }
  function texName(id) {
    if (!id) return '';
    const T = DA.textures;
    if (T && typeof T.name === 'function') { try { return T.name(id) || ''; } catch (e) { return ''; } }
    return stubNames[id] || '';
  }
  /** Is a single texture name "backed" (transparent surround that needs a base wall behind it)? */
  function isBacked(name) {
    const T = DA.textures;
    if (name && name.indexOf('||') >= 0) name = pickAlt(name);
    if (!T || typeof T.get !== 'function' || !name || name.indexOf('+') >= 0) return false;
    try {
      const rec = T.get(name);
      return !!(rec && rec.flags && rec.flags.backed && !rec.flags.alpha);
    } catch (e) { return false; }
  }

  /* ================================================================ compile */
  /** Active mutation names that a map definition knows about, in definition order. */
  function activeMutations(def) {
    const on = (S() && S().mutations) || {};
    return Object.keys(def.mutations || {}).filter((k) => on[k]);
  }

  /**
   * Compile a map definition (+ active mutations) into the typed-array runtime map.
   * Door open/lock state, prop overrides and power are applied afterwards from DA.state.world.
   */
  function compile(def) {
    const H = def.grid.length, W = def.grid[0].length, N = W * H;
    const chars = def.grid.map((r) => r.split(''));
    const faces = (def.faces || []).slice();
    const doorDefs = (def.doors || []).map((d) => Object.assign({}, d));
    const lightDefs = (def.lights || []).slice();
    const propDefs = (def.props || []).slice();
    const interDefs = (def.interact || []).slice();
    const triggers = (def.triggers || []).slice();
    const points = Object.assign({}, def.points || {});
    const portals = [];
    const muts = activeMutations(def);
    for (const name of muts) {
      const mu = def.mutations[name];
      for (const c of mu.set || []) if (chars[c.y] && c.x >= 0 && c.x < W) chars[c.y][c.x] = c.ch;
      for (const f of mu.faces || []) faces.push(f);
      for (const d of mu.doors || []) {
        const k = doorDefs.findIndex((o) => o.id === d.id);
        if (k >= 0) doorDefs[k] = Object.assign({}, d); else doorDefs.push(Object.assign({}, d));
      }
      for (const l of mu.lights || []) lightDefs.push(l);
      for (const p of mu.props || []) propDefs.push(Object.assign({ fromMutation: name }, p));
      for (const it of mu.interact || []) interDefs.push(it);
      for (const t of mu.triggers || []) triggers.push(t);
      for (const pt of mu.portals || []) portals.push(Object.assign({ mutation: name }, pt));
      Object.assign(points, mu.points || {});
    }
    const legend = def.legend;
    const m = {
      id: def.id, name: def.name || def.id, w: W, h: H,
      wall: new Uint16Array(N), wallN: new Uint16Array(N), wallE: new Uint16Array(N), wallS: new Uint16Array(N), wallW: new Uint16Array(N),
      floor: new Uint16Array(N), ceil: new Uint16Array(N), solid: new Uint8Array(N), room: new Uint8Array(N),
      light: new Float32Array(N), door: new Int16Array(N).fill(-1), doors: [],
      emissive: 1, alt: null, altFace: null, altCell: new Map(), tint: [1, 1, 1], variant: 'normal', windowFigure: null,
      props: [], decor: [], interact: [], points, triggers, portals, lights: [],
      outdoor: new Uint8Array(N), pit: new Uint8Array(N), creak: new Uint8Array(N), reserved: new Uint8Array(N),
      ambient: new Float32Array(N), winLight: new Float32Array(N),
      rooms: [''], chars: null, def, mutations: muts,
      // runtime indexes (not part of the contract)
      faceIndex: new Map(), cellIndex: new Map(), floorInteract: [], doorById: {}, legendAt: new Array(N),
    };
    for (const k of ['wallHeight', 'sky', 'fog', 'pitchMax']) if (def[k] !== undefined) m[k] = def[k];
    const roomIdx = (name) => {
      if (!name) return 0;
      let k = m.rooms.indexOf(name);
      if (k < 0) { k = m.rooms.length; m.rooms.push(name); }
      return k;
    };
    const doorAt = new Map();
    for (const d of doorDefs) doorAt.set(d.y * W + d.x, d);

    // ---- pass 1: cells
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, ch = chars[y][x];
        let lg = legend[ch];
        if (!lg) { console.warn('[world] ' + def.id + ': no legend for "' + ch + '" at', x, y); lg = { wall: 'missing', solid: true }; }
        m.legendAt[i] = lg;
        if (lg.reserved) m.reserved[i] = 1;
        if (lg.door) {
          if (!doorAt.has(i)) {   // a door char without a door definition: plain floor
            console.warn('[world] ' + def.id + ': door cell without a door at', x, y);
            m.legendAt[i] = { floor: 'floor_lino', ceil: 'ceil_tile', room: '' };
          }
          continue; // resolved in pass 2
        }
        if (lg.wall) {
          m.wall[i] = tid(lg.wall);
          m.solid[i] = 1;
          continue;
        }
        m.floor[i] = lg.floor ? tid(lg.floor) : 0;
        m.ceil[i] = lg.ceil ? tid(lg.ceil) : 0;
        m.room[i] = roomIdx(lg.room);
        m.outdoor[i] = lg.outdoor != null ? (lg.outdoor ? 1 : 0) : lg.ceil == null ? 1 : 0;
        if (lg.pit) { m.pit[i] = 1; m.solid[i] = 1; m.floor[i] = 0; }
        if (lg.solid && !lg.pit) m.solid[i] = 1;
        if (lg.creak) m.creak[i] = 1;
        m.ambient[i] = lg.light != null ? lg.light : m.outdoor[i] ? AMB_OUT : AMB_IN;
      }
    }
    // ---- pass 2: door cells inherit floor/ceil/room from their inside neighbour
    const isWallCell = (x, y) => x < 0 || y < 0 || x >= W || y >= H || m.wall[y * W + x] > 0;
    for (const d of doorDefs) {
      const i = d.y * W + d.x;
      if (!m.legendAt[i] || !m.legendAt[i].door) { console.warn('[world] door ' + d.id + ' not on a door cell'); }
      const nb = d.axis === 'v' ? [[d.x - 1, d.y], [d.x + 1, d.y]] : [[d.x, d.y - 1], [d.x, d.y + 1]];
      let src = null;
      if (d.inside) {
        const [dx, dy] = DIR[d.inside];
        if (!isWallCell(d.x + dx, d.y + dy)) src = [d.x + dx, d.y + dy];
      }
      if (!src) src = nb.find(([x, y]) => !isWallCell(x, y) && !m.outdoor[y * W + x] && m.rooms[m.room[y * W + x]] !== 'hall') || nb.find(([x, y]) => !isWallCell(x, y));
      m.wall[i] = 0;
      m.solid[i] = 0;
      if (src) {
        const j = src[1] * W + src[0], lg = m.legendAt[j];
        m.floor[i] = m.floor[j]; m.ceil[i] = m.ceil[j]; m.room[i] = m.room[j]; m.outdoor[i] = m.outdoor[j]; m.ambient[i] = m.ambient[j];
        m.legendAt[i] = Object.assign({}, lg, { door: true });
      } else {
        m.floor[i] = tid('floor_lino'); m.ceil[i] = tid('ceil_tile'); m.ambient[i] = AMB_IN;
      }
      const rd = {
        id: d.id, x: d.x, y: d.y, axis: d.axis === 'v' ? 'v' : 'h', tex: tid(d.tex || 'door_wood'), texName: d.tex || 'door_wood',
        open: d.open ? 1 : 0, target: d.open ? 1 : 0, locked: !!d.locked, key: d.key || null, lockableInside: !!d.lockableInside,
        inside: d.inside || null, static: !!d.static, heavy: !!d.heavy || /blast|steel/.test(d.tex || ''), map: def.id, holdClose: false,
        slats: d.slats ? (d.slats === 'gap' ? 'gap' : 'louver') : null,
      };
      m.door[i] = m.doors.length;
      m.doors.push(rd);
      m.doorById[rd.id] = rd;
    }
    // ---- pass 3: resolved wall faces
    const sideArr = [m.wallN, m.wallE, m.wallS, m.wallW];
    const baseName = new Map(); // i*4+s → resolved base texture name (before overlay)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!m.wall[i]) continue;
        const lg = m.legendAt[i];
        for (let s = 0; s < 4; s++) {
          const [dx, dy] = DIR[SIDES[s]];
          const nx = x + dx, ny = y + dy;
          let base = lg.wall && lg.wall.indexOf('||') >= 0 ? pickAlt(lg.wall) : lg.wall;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) {
            const j = ny * W + nx;
            if (!m.wall[j]) {
              const nl = m.legendAt[j] || {};
              if (m.outdoor[j] && lg.outside && !m.pit[j]) base = lg.outside;
              else if (lg.inner && nl.walls) base = nl.walls;
            }
          }
          baseName.set(i * 4 + s, base);
          sideArr[s][i] = tid(lg.overlay ? base + '+' + lg.overlay : base);
        }
      }
    }
    // door recesses: the wall faces either side of a door slab read as a steel jamb
    for (const d of doorDefs) {
      const sides = d.axis === 'v' ? [[d.x, d.y - 1, 2], [d.x, d.y + 1, 0]] : [[d.x - 1, d.y, 1], [d.x + 1, d.y, 3]];
      for (const [x, y, sd] of sides) {
        if (x < 0 || y < 0 || x >= W || y >= H || !m.wall[y * W + x]) continue;
        const lg = m.legendAt[y * W + x];
        if (lg && (lg.inner || lg.wall === 'wall_paint')) sideArr[sd][y * W + x] = tid('door_jamb');
      }
    }
    for (const f of faces) {
      if (f.x < 0 || f.y < 0 || f.x >= W || f.y >= H) continue;
      const i = f.y * W + f.x, s = SIDE_IDX[f.side];
      if (!m.wall[i] || s === undefined) continue;
      let name = f.tex && f.tex.indexOf('||') >= 0 ? pickAlt(f.tex) : f.tex;
      if (isBacked(name)) name = (baseName.get(i * 4 + s) || m.legendAt[i].wall) + '+' + name;
      sideArr[s][i] = tid(name);
      baseName.set(i * 4 + s, name.split('+')[0]);
    }
    // ---- alt (abandoned variant) overrides: cell keys in `alt`, face keys (idx*4+side) in `altFace`
    m.alt = new Map();
    m.altFace = new Map();
    for (const a of def.alt || []) {
      if (a.x < 0 || a.y < 0 || a.x >= W || a.y >= H) continue;
      const i = a.y * W + a.x;
      if (a.side && SIDE_IDX[a.side] !== undefined) m.altFace.set(i * 4 + SIDE_IDX[a.side], tid(a.tex));
      else { m.altCell.set(i, tid(a.tex)); m.alt.set(i, tid(a.tex)); }
    }
    if (!m.alt.size && m.altFace.size) {
      // DA.render only consults altFace when alt is non-empty: add a no-op cell key (a wall keeps its own texture)
      for (let i = 0; i < N; i++) if (m.wall[i]) { m.alt.set(i, m.wall[i]); break; }
    }
    // ---- decor scatter (trees) + props
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, lg = m.legendAt[i];
        if (!lg || !lg.decor || m.wall[i] || m.door[i] >= 0) continue;
        const dc = lg.decor, rnd = U.mulberry32(U.hash(def.id + ':' + x + ',' + y));
        if (rnd() >= (dc.chance == null ? 0.5 : dc.chance)) continue;
        const tex = dc.alt && rnd() < (dc.altChance || 0) ? dc.alt : dc.tex;
        const j = dc.jitter == null ? 0.3 : dc.jitter;
        m.decor.push({ x: x + 0.5 + (rnd() - 0.5) * 2 * j, y: y + 0.5 + (rnd() - 0.5) * 2 * j, tex, scale: dc.scale != null ? dc.scale * (0.85 + rnd() * 0.3) : undefined,
          flip: rnd() < 0.5, frame: (rnd() * 3) | 0, solid: dc.solid !== false, radius: dc.radius || 0.25, decor: true });
      }
    }
    for (const p of propDefs) {
      if (p.id) m.props.push(Object.assign({ map: def.id }, p));
      else m.decor.push(Object.assign({ decor: true }, p));
    }
    // ---- lights (+ ceiling fixtures)
    for (const l of lightDefs) {
      const lx = Math.floor(l.x), ly = Math.floor(l.y);
      const rl = {
        id: l.id, x: l.x, y: l.y, radius: l.radius || 4, intensity: l.intensity == null ? 0.8 : l.intensity, circuit: l.circuit || 'main',
        flicker: l.flicker || 0, cell: ly * W + lx, contrib: null, level: 0, target: 0, dip: 0, dipT: 0, stutter: 0, force: 0, forceUntil: 0,
        fixture: l.fixture != null ? !!l.fixture : (l.circuit || 'main') !== 'emergency',
      };
      if (lx >= 0 && ly >= 0 && lx < W && ly < H && rl.fixture && m.ceil[rl.cell] && !m.outdoor[rl.cell]) { m.ceil[rl.cell] = tid('ceil_light'); rl.panel = true; }
      m.lights.push(rl);
    }
    // per-cell emissive for the ceiling panels: each panel glows with its own light (breaker C kills
    // the corridor panels, a flickering tube flickers its panel). -1 = use the map-wide m.emissive.
    m.cellEmis = new Float32Array(N).fill(-1);
    for (const l of m.lights) if (l.panel) m.cellEmis[l.cell] = 0;
    // wall devices whose screens/lamps run on their own supply (def.emissiveCircuits: base texture
    // name → circuit): texId → circuit, resolved over every face texture actually used on this map
    m.emisFaceCirc = new Map();
    const ec = def.emissiveCircuits;
    if (ec) {
      const seen = new Set();
      for (const arr of sideArr) for (let i = 0; i < N; i++) {
        const t = arr[i];
        if (!t || seen.has(t)) continue;
        seen.add(t);
        const parts = texName(t).split('+');
        for (const nm of parts) if (ec[nm]) { m.emisFaceCirc.set(t, ec[nm]); break; }
      }
    }
    m.emisTex = new Map();
    // ---- interactables
    const addIt = (src) => {
      const it = Object.assign({ map: def.id }, src);
      m.interact.push(it);
      const cx = Math.floor(it.x), cy = Math.floor(it.y);
      if (it.side) {
        const cells = [[cx, cy, it.side]].concat((it.cells || []).map((c) => [c[0], c[1], c[2] || it.side]));
        for (const [x, y, sd] of cells) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (m.door[i] >= 0) { if (!m.cellIndex.has(i)) m.cellIndex.set(i, []); m.cellIndex.get(i).push(it); continue; }
          const k = i * 4 + SIDE_IDX[sd];
          if (!m.faceIndex.has(k)) m.faceIndex.set(k, []);
          m.faceIndex.get(k).push(it);
        }
      } else if (it.door || (m.door[cy * W + cx] >= 0 && it.radius == null)) {
        const i = cy * W + cx;
        if (!m.cellIndex.has(i)) m.cellIndex.set(i, []);
        m.cellIndex.get(i).push(it);
      } else {
        m.floorInteract.push(it);
      }
      return it;
    };
    for (const d of m.doors) if (!d.static) addIt({ id: d.id, kind: 'door', x: d.x, y: d.y, door: d.id, prompt: null });
    for (const it of interDefs) addIt(it);
    m.chars = chars.map((r) => r.join(''));
    computeWinLight(m);
    return m;
  }

  /**
   * How far daylight reaches from windows (and from roof holes: indoor cells with no ceiling) into
   * each indoor cell (0..1). `opts` (the abandoned day): {reach (cells, default 6), doors: true → it
   * also passes through open doorways}.
   */
  function computeWinLight(m, opts) {
    opts = opts || {};
    const reach = opts.reach || 6;
    const W = m.w, H = m.h, q = [], dist = new Float32Array(W * H).fill(99);
    const wname = (id) => texName(id);
    if (m.sky !== false) for (let i = 0; i < W * H; i++) {   // (the array's open void is no sky)
      if (!m.wall[i] && !m.outdoor[i] && !m.ceil[i] && !m.pit[i] && m.floor[i]) { dist[i] = 0; q.push(i); } // a hole in the roof
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!m.wall[i]) continue;
      const faces = [m.wallN[i], m.wallE[i], m.wallS[i], m.wallW[i]];
      for (let s = 0; s < 4; s++) {
        if (!/window/.test(wname(faces[s]) || (m.legendAt[i].overlay || ''))) continue;
        const [dx, dy] = DIR[SIDES[s]], j = (y + dy) * W + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || m.wall[j] || m.outdoor[j]) continue;
        if (dist[j] > 0) { dist[j] = 0; q.push(j); }
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const s of SIDES) {
        const nx = x + DIR[s][0], ny = y + DIR[s][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (m.solid[j] || m.outdoor[j] || dist[j] <= dist[i] + 1) continue;
        if (m.door[j] >= 0 && !(opts.doors && m.doors[m.door[j]].open >= 0.5)) continue;
        dist[j] = dist[i] + 1;
        if (dist[j] < reach) q.push(j);
      }
    }
    for (let i = 0; i < W * H; i++) m.winLight[i] = dist[i] >= reach ? 0 : 1 - dist[i] / reach;
  }

  /* ================================================================ runtime */
  const W = (DA.world = DA.world || {});
  W.maps = {};
  W.map = null;
  W.mapId = null;
  const P = (W.player = { x: 0, y: 0, angle: 0, pitch: 0, running: false, crouching: false, hidden: false, flashlight: false, noise: 0, bob: 0 });
  const rt = {
    ready: false, focus: null, promptShown: undefined, lastRoom: null, triggers: new Set(), history: [], histT: 0,
    lightningT: 25, vx: 0, vy: 0, eye: EYE.stand, bobPhase: 0, bobAmp: 0, strideAcc: 0, hideAnim: null, travelling: false, frozen: false,
    lookAt: null, eHeld: false, eT: 0, eTarget: null, eDone: false, ambT: 0, lastAmb: '', ambDirty: true, otherLightT: 0,
    npc: {}, rainVar: 1, flash: 0, portalInside: false, solidDirty: true, audField: null, audDirty: true, time: 0, trigFired: new Set(),
    chairJ: { x: 0, y: 0, flip: false },
  };
  const props = new Map(); // id → live prop record (all maps)

  function defaultState() {
    return {
      map: 'station', x: 0, y: 0, angle: 0, pitch: 0, crouch: false, flashlight: false, hidden: null, hideFrom: null,
      doors: {}, props: {}, npcs: {},
      power: { main: true, corridor: true, emergency: 'auto', outdoor: true, array: true, generator: true },
      breakers: { A: true, B: true, C: true, D: true, E: true, F: true },
      mutations: {}, opened: {}, levers: {}, daylight: 0, blend: 0,
      weather: { rain: 0.85, thunder: 0.35, baseRain: 0.85 }, prompts: {}, disabled: {}, genSound: null,
    };
  }
  /** Fill any missing keys (older archives, or a module that created state.world early). */
  function normaliseState() {
    if (!DA.state.world || typeof DA.state.world !== 'object') DA.state.world = {};
    const s = DA.state.world, d = defaultState();
    for (const k in d) {
      if (s[k] === undefined || s[k] === null && typeof d[k] === 'object' && d[k] !== null) s[k] = d[k];
      else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && typeof s[k] === 'object') {
        for (const kk in d[k]) if (s[k][kk] === undefined) s[k][kk] = d[k][kk];
      }
    }
    return s;
  }

  /* ------------------------------------------------------------ rebuild */
  /** Compile every map from its definition + active mutations, then re-apply saved state. */
  /**
   * The radio rack faces follow the receiver's power switch ('radio' circuit): every face whose
   * texture (often a composite like 'wall_paint+radio_console') names the lit rack is swapped for
   * the same composite with 'radio_console_off', and back.
   */
  const radioSwap = new Map(); // `${id}:${on}` → id
  function radioFaceId(id, on) {
    const k = id + ':' + on;
    if (radioSwap.has(k)) return radioSwap.get(k);
    let out = id;
    const name = DA.textures.name ? DA.textures.name(id) : '';
    if (name && name.indexOf('radio_console') >= 0) {
      const base = name.replace(/radio_console_off/g, 'radio_console');
      const want = on ? base : base.replace(/radio_console/g, 'radio_console_off');
      if (want !== name) out = DA.textures.id(want) || id;
    }
    radioSwap.set(k, out);
    return out;
  }
  function applyRadioFaces(m) {
    if (!m || !DA.textures || typeof DA.textures.id !== 'function' || !(DA.textures.has && DA.textures.has('radio_console_off'))) return;
    const on = !(S().power && S().power.radio === false);
    for (const arr of [m.wall, m.wallN, m.wallE, m.wallS, m.wallW]) {
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) if (arr[i]) arr[i] = radioFaceId(arr[i], on);
    }
  }
  W.applyRadioFaces = () => { for (const id in W.maps) applyRadioFaces(W.maps[id]); };
  function rebuildAll() {
    tidCache.clear();
    for (const id of Object.keys((DA.maps && DA.maps.defs) || {})) W.maps[id] = compile(DA.maps.defs[id]);
    for (const id in W.maps) { finishMap(W.maps[id]); applyRadioFaces(W.maps[id]); }
    rebuildProps();
    rebuildNpcs();
    setCurrentMap(S().map in W.maps ? S().map : 'station');
  }
  /** Rebuild one map in place (mutation applied / reverted). Door + prop state carries over. */
  function recompileMap(id) {
    if (!DA.maps || !DA.maps.defs[id]) return;
    const old = W.maps[id];
    W.maps[id] = compile(DA.maps.defs[id]);
    finishMap(W.maps[id]);
    applyRadioFaces(W.maps[id]);
    if (old) for (const d of W.maps[id].doors) {
      const od = old.doorById[d.id];
      if (od) { d.open = od.open; d.target = od.target; d.locked = od.locked; if (od.by) d.by = od.by; }
    }
    rebuildProps();
    // Old routes may cross geometry changed by the mutation. Retain their goals and replan.
    for (const npcId in rt.npc) if (S().npcs[npcId] && S().npcs[npcId].map === id) {
      rt.npc[npcId].path = null; rt.npc[npcId].wait = 0;
    }
    if (W.mapId === id) {
      W.map = W.maps[id];
      if (P.hidden) {
        const f = findInteractable(S().hidden), spot = rt.hideSpot;
        const pos = f && f.it.pos;
        // Authored hiding poses intentionally overlap standing collision geometry. Preserve
        // them only while the same enabled shelter and pose still exist on this map.
        if (f && f.map === W.mapId && f.it.kind === 'hide' && isEnabled(f.it) && spot && pos &&
            pos.x === spot.x && pos.y === spot.y) spot.it = f.it;
        else quietUnhide();
      }
      if (!P.hidden) ensureFree();
    }
  }
  function finishMap(m) {
    applyDoorState(m);
    applyVariant(m);
    // 2049: fifty years of broken glass — daylight carries further in, and through open doorways
    if (m.variant === 'abandoned') computeWinLight(m, { reach: 9, doors: true });
    topology(m);
    m.baseAmbient = Float32Array.from(m.ambient);
    applyDaylight(m);
    updateLights(m, 0);
  }
  function applyDoorState(m) {
    const ds = S().doors || {};
    for (const d of m.doors) {
      const st = ds[d.id];
      if (!st) continue;
      d.open = d.target = st.open ? 1 : 0;
      if (st.locked != null) d.locked = !!st.locked;
      if (st.by) d.by = st.by;
    }
  }
  function saveDoor(d) {
    const o = { open: d.target ? 1 : 0, locked: !!d.locked };
    if (d.by) o.by = d.by;
    S().doors[d.id] = o;
  }
  function applyVariant(m) {
    const ab = !!S().mutations.abandoned && m.id === 'station';
    m.variant = ab ? 'abandoned' : 'normal';
  }
  function setCurrentMap(id) {
    W.mapId = id;
    W.map = W.maps[id];
    S().map = id;
    rt.solidDirty = true;
    rt.audDirty = true;
    rt.ambDirty = true;
    rt.triggers.clear();
    rt.trigFired.clear();
    rt.lastRoom = null;
  }

  /* ============================================================== lighting */
  /** Recompute every light's flood-fill contribution list (after door/topology changes). */
  function topology(m) {
    for (const l of m.lights) l.contrib = flood(m, l);
    m.topoDirty = false;
    if (m.id === 'station') rt.audDirty = true;
  }
  const floodStamp = { arr: null, n: 0 };
  /**
   * Breadth-first flood from the light's cell through open cells (walls stop it; a closed door
   * cell is lit but light does not pass through it). Weight falls off with straight distance.
   * Walls touching lit cells take the brightest neighbouring value so wall faces are lit.
   */
  function flood(m, l) {
    const W_ = m.w, H_ = m.h, N = W_ * H_;
    if (!floodStamp.arr || floodStamp.arr.length < N) floodStamp.arr = new Uint32Array(N);
    const stamp = ++floodStamp.n, mark = floodStamp.arr;
    const out = [], wallBest = new Map();
    let start = l.cell;
    const lx0 = Math.floor(l.x), ly0 = Math.floor(l.y);
    if (lx0 < 0 || ly0 < 0 || lx0 >= W_ || ly0 >= H_) return out;
    if (m.wall[start]) { // fixture on a wall cell: start from the nearest open neighbour
      let best = -1, bd = 9;
      for (const s of SIDES) {
        const nx = lx0 + DIR[s][0], ny = ly0 + DIR[s][1];
        if (nx < 0 || ny < 0 || nx >= W_ || ny >= H_) continue;
        const j = ny * W_ + nx;
        if (m.wall[j]) continue;
        const d = U.dist(l.x, l.y, nx + 0.5, ny + 0.5);
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) return out;
      start = best;
    }
    const q = [start];
    mark[start] = stamp;
    const r = l.radius;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W_, y = (i / W_) | 0;
      const d = U.dist(l.x, l.y, x + 0.5, y + 0.5);
      const w = l.intensity * Math.pow(Math.max(0, 1 - d / r), 1.25);
      if (w > 0.004) out.push(i, w);
      const di = m.door[i];
      if (di >= 0 && i !== start && m.doors[di].open < 0.12) continue; // closed door: lit, not passed
      for (let s = 0; s < 4; s++) {
        const nx = x + DIR[SIDES[s]][0], ny = y + DIR[SIDES[s]][1];
        if (nx < 0 || ny < 0 || nx >= W_ || ny >= H_) continue;
        const j = ny * W_ + nx;
        if (m.wall[j]) {
          const prev = wallBest.get(j) || 0;
          if (w > prev) wallBest.set(j, w);
          continue;
        }
        if (mark[j] === stamp) continue;
        if (U.dist(l.x, l.y, nx + 0.5, ny + 0.5) > r + 0.75) continue;
        mark[j] = stamp;
        q.push(j);
      }
    }
    for (const [j, w] of wallBest) out.push(j, w);
    return Float32Array.from(out);
  }
  /** Is a circuit live? `pw` = a power map to test instead of the real one (W.lightAs). */
  function circuitOn(c, pw) {
    const p = pw || S().power;
    switch (c) {
      case 'main': return !!p.main;
      case 'corridor': return !!p.main && !!p.corridor;
      case 'emergency': return p.emergency === 'auto' || p.emergency == null ? !p.main : !!p.emergency;
      // the receiver's own supply follows its POWER switch (DA.radio), unless a script cuts 'radio'
      case 'radio': return p.radio !== false && !(DA.state && DA.state.radio && DA.state.radio.power === false);
      default: return p[c] !== false;
    }
  }
  function applyDaylight(m) {
    const v = U.clamp(+S().daylight || 0, 0, 1);
    const b = m.baseAmbient || m.ambient;
    // the abandoned station (2049) is washed with grey daylight indoors: no power, but you can see
    const ab = m.variant === 'abandoned';
    const inBase = ab ? 0.24 : 0.07, inWin = ab ? 0.5 : 0.42;
    for (let i = 0; i < m.ambient.length; i++) {
      if (m.wall[i]) { m.ambient[i] = 0; continue; }
      m.ambient[i] = m.outdoor[i] ? b[i] + v * 0.78 : b[i] + v * (inBase + inWin * m.winLight[i]);
    }
    m.daylight = v;
  }
  /** Animate one map's lights: power, fluorescent start-up stutter, flicker, lightning. */
  function updateLights(m, dt) {
    const now = rt.time;
    for (const l of m.lights) {
      const on = circuitOn(l.circuit);
      if (on && !l.target) l.stutter = l.circuit === 'emergency' ? 0 : dt > 0 ? U.rand(0.25, 0.8) : 0;
      l.target = on ? 1 : 0;
      if (!on) l.level = 0;
      else if (l.stutter > 0) { l.stutter -= dt; l.level = Math.random() < 0.3 ? U.rand(0.55, 1) : 0.04; }
      else l.level = 1;
      let f = l.flicker;
      if (l.forceUntil > now) f = Math.max(f, l.force);
      let factor = 1;
      if (f > 0 && l.level > 0) {
        if (l.dipT > 0) l.dipT -= dt;
        else if (Math.random() < f * dt * 4.5) { l.dipT = U.rand(0.04, 0.2); l.dip = U.clamp(U.rand(0.25, 0.9) * (0.45 + f), 0, 0.97); }
        factor = l.dipT > 0 ? 1 - l.dip : 1 - f * 0.05 * (0.5 + 0.5 * Math.sin(now * 47 + l.x * 3.1));
      }
      l.cur = l.level * factor;
    }
    const L = m.light, A = m.ambient, N = L.length;
    const fl = rt.flash > 0 && (m.id === 'station' || m.id === 'roof') ? rt.flash : 0;
    if (fl > 0) {
      for (let i = 0; i < N; i++) L[i] = A[i] + (m.outdoor[i] ? 0 : m.winLight[i] * fl * 0.35);
    } else L.set(A);
    for (const l of m.lights) {
      if (!l.cur || !l.contrib) continue;
      const c = l.contrib, k = l.cur;
      for (let j = 0; j < c.length; j += 2) L[c[j]] += c[j + 1] * k;
    }
    for (let i = 0; i < N; i++) if (L[i] > 1.5) L[i] = 1.5;
    // global look: emissive panels, red emergency tint while main is off
    const ab = m.variant === 'abandoned';
    const mainOn = !!S().power.main;
    if (m.id === 'relay') m.emissive = 1;
    else if (m.id === 'array') m.emissive = S().power.array !== false ? 1 : 0.15;
    else m.emissive = ab ? 0.1 : mainOn ? 1 : 0.15;
    // ceiling panels follow their own light (dead tube = dead panel; 2049: every tube long dead)
    if (m.cellEmis) {
      for (const l of m.lights) if (l.panel) m.cellEmis[l.cell] = 0;
      if (!ab) for (const l of m.lights) if (l.panel && l.cur > m.cellEmis[l.cell]) m.cellEmis[l.cell] = l.cur;
    }
    // devices on their own supply (radio/CCTV on the UPS, antenna consoles on the array feed)
    if (m.emisFaceCirc && m.emisFaceCirc.size) {
      for (const [t, c] of m.emisFaceCirc) m.emisTex.set(t, ab ? 0.05 : circuitOn(c) ? 1 : 0.12);
    }
    let tint = [1, 1, 1];
    if (!mainOn && !ab && (m.id === 'station' || m.id === 'basement')) {
      const outside = m === W.map && isOutdoor();
      tint = outside ? [1, 0.82, 0.8] : [1, 0.42, 0.37];
    }
    const k = dt > 0 ? Math.min(1, dt * 3) : 1;
    for (let c = 0; c < 3; c++) m.tint[c] += (tint[c] - m.tint[c]) * k;
  }

  /* ================================================================= power */
  W.setPower = (circuit, on) => {
    const p = S().power;
    const v = circuit === 'emergency' && on === 'auto' ? 'auto' : !!on;
    const old = p[circuit];
    p[circuit] = v;
    if (circuit === 'corridor' && v === true) S().breakers.C = true;
    rt.ambDirty = true;
    if (old !== v) DA.bus.emit('power:change', { circuit, on: v, power: Object.assign({}, p) });
    updateAmbience(true);
  };
  W.power = (circuit) => (circuit === 'emergency' ? circuitOn('emergency') : !!S().power[circuit] && S().power[circuit] !== false);
  W.powerRaw = () => Object.assign({}, S().power);
  Object.defineProperty(W, 'breakers', { get: () => S().breakers, enumerable: true });
  W.setBreaker = (id, on) => {
    S().breakers[id] = !!on;
    if (id === 'C') W.setPower('corridor', !!on);
    DA.bus.emit('breaker:set', { id, on: !!on });
  };
  W.setGeneratorSound = (mode) => { S().genSound = mode || null; updateAmbience(true); };
  W.setDaylight = (v) => {
    S().daylight = U.clamp(+v || 0, 0, 1);
    for (const id in W.maps) applyDaylight(W.maps[id]);
    updateAmbience(true);
  };
  W.setBlend = (v) => { S().blend = U.clamp(+v || 0, 0, 1); };
  W.setWeather = (o) => {
    const w = S().weather;
    if (o && o.rain != null) { w.baseRain = U.clamp(+o.rain, 0, 1); w.rain = U.clamp(w.baseRain * rt.rainVar, 0, 1); }
    if (o && o.thunder != null) w.thunder = U.clamp(+o.thunder, 0, 1);
    updateAmbience(true);
  };
  /**
   * The map's light field as it WOULD be with `power` (default: main + corridor on, i.e. a normal lit
   * night), steady (no flicker, no lightning) → Float32Array (w*h) for DA.render.renderView opts.light
   * (the multiverse montage renders other timelines with their lights on).
   */
  W.lightAs = (mapId, power) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return null;
    const pw = Object.assign({}, S().power, power || { main: true, corridor: true, emergency: 'auto' });
    const L = Float32Array.from(m.ambient);
    for (const l of m.lights) {
      if (!l.contrib || !circuitOn(l.circuit, pw)) continue;
      const c = l.contrib;
      for (let j = 0; j < c.length; j += 2) L[c[j]] += c[j + 1];
    }
    for (let i = 0; i < L.length; i++) if (L[i] > 1.5) L[i] = 1.5;
    return L;
  };
  /** Make lights near (x, y) stutter hard for `secs` (the entity passing, a surge). */
  W.flickerNear = (x, y, secs, mapId) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return 0;
    let n = 0;
    for (const l of m.lights) {
      if (U.dist(l.x, l.y, x, y) > 6.5) continue;
      l.force = 0.9;
      l.forceUntil = rt.time + (secs || 1.5);
      n++;
    }
    if (n && (m.id === W.mapId)) audio('play', 'flicker', { x, y, vol: 0.7 });
    return n;
  };

  /* ============================================================ cell queries */
  const idxOf = (m, x, y) => {
    const cx = Math.floor(x), cy = Math.floor(y);
    return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h ? -1 : cy * m.w + cx;
  };
  W.cellAt = (x, y, mapId) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return null;
    const i = idxOf(m, x, y);
    if (i < 0) return null;
    return { x: Math.floor(x), y: Math.floor(y), i, wall: texName(m.wall[i]), solid: !!m.solid[i], pit: !!m.pit[i], room: m.rooms[m.room[i]] || null,
      door: m.door[i] >= 0 ? m.doors[m.door[i]].id : null, outdoor: !!m.outdoor[i], light: m.light[i], floor: texName(m.floor[i]) };
  };
  W.roomAt = (x, y, mapId) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return null;
    const i = idxOf(m, x, y);
    return i < 0 ? null : m.rooms[m.room[i]] || null;
  };
  W.room = () => (W.map ? W.roomAt(P.x, P.y) : null);
  W.inRoom = (name) => W.room() === name;
  function isOutdoor() {
    const m = W.map;
    if (!m) return false;
    const i = idxOf(m, P.x, P.y);
    return i >= 0 && !!m.outdoor[i] && m.ceil[i] === 0;
  }
  W.isOutdoor = isOutdoor;

  /* ============================================================== collision */
  const SLAB = 0.08;
  const rectsTmp = [];
  /** Axis-aligned blockers overlapping [x0,x1]×[y0,y1]: solid cells, pits, closed door slabs. */
  function blockRects(m, x0, y0, x1, y1, out) {
    out.length = 0;
    const cx0 = Math.floor(x0), cy0 = Math.floor(y0), cx1 = Math.floor(x1), cy1 = Math.floor(y1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) { out.push([cx, cy, cx + 1, cy + 1]); continue; }
        const i = cy * m.w + cx;
        if (m.solid[i]) { out.push([cx, cy, cx + 1, cy + 1]); continue; }
        const di = m.door[i];
        if (di >= 0 && m.doors[di].open < 0.8) {
          if (m.doors[di].axis === 'h') out.push([cx, cy + 0.5 - SLAB, cx + 1, cy + 0.5 + SLAB]);
          else out.push([cx + 0.5 - SLAB, cy, cx + 0.5 + SLAB, cy + 1]);
        }
      }
    }
    return out;
  }
  /** Move a circle (as an AABB against the grid) one axis at a time: classic wall sliding. */
  function slide(m, p, dx, dy, r) {
    const E = 1e-4;
    if (dx) {
      const rs = blockRects(m, Math.min(p.x, p.x + dx) - r - 0.01, p.y - r, Math.max(p.x, p.x + dx) + r + 0.01, p.y + r, rectsTmp);
      let nx = p.x + dx;
      for (const b of rs) {
        if (b[3] <= p.y - r + E || b[1] >= p.y + r - E) continue;
        if (dx > 0 && b[0] >= p.x + r - E) nx = Math.max(p.x, Math.min(nx, b[0] - r - E));
        else if (dx < 0 && b[2] <= p.x - r + E) nx = Math.min(p.x, Math.max(nx, b[2] + r + E));
      }
      p.x = nx;
    }
    if (dy) {
      const rs = blockRects(m, p.x - r, Math.min(p.y, p.y + dy) - r - 0.01, p.x + r, Math.max(p.y, p.y + dy) + r + 0.01, rectsTmp);
      let ny = p.y + dy;
      for (const b of rs) {
        if (b[2] <= p.x - r + E || b[0] >= p.x + r - E) continue;
        if (dy > 0 && b[1] >= p.y + r - E) ny = Math.max(p.y, Math.min(ny, b[1] - r - E));
        else if (dy < 0 && b[3] <= p.y - r + E) ny = Math.min(p.y, Math.max(ny, b[3] + r + E));
      }
      p.y = ny;
    }
  }
  /** Push out of any blocker we ended up inside (after a prop push or a door closing on us). */
  function resolveOverlap(m, p, r) {
    for (let it = 0; it < 3; it++) {
      const rs = blockRects(m, p.x - r, p.y - r, p.x + r, p.y + r, rectsTmp);
      let moved = false;
      for (const b of rs) {
        const ox = Math.min(p.x + r, b[2]) - Math.max(p.x - r, b[0]);
        const oy = Math.min(p.y + r, b[3]) - Math.max(p.y - r, b[1]);
        if (ox <= 1e-5 || oy <= 1e-5) continue;
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        if (ox < oy) p.x += p.x < cx ? -ox : ox;
        else p.y += p.y < cy ? -oy : oy;
        moved = true;
      }
      if (!moved) break;
    }
  }
  /** Solid round things near a point: props, decor (trees), NPCs. */
  function rebuildSolids(m) {
    const g = new Map();
    const add = (o) => {
      const i = idxOf(m, o.x, o.y);
      if (i < 0) return;
      if (!g.has(i)) g.set(i, []);
      g.get(i).push(o);
    };
    for (const d of m.decor) if (d.solid) add({ x: d.x, y: d.y, r: d.radius || 0.25 });
    for (const p of props.values()) if (p.map === m.id && p.solid && !p.hidden && !p.removed) add({ x: p.x + (p.jx || 0), y: p.y + (p.jy || 0), r: p.radius || 0.25, id: p.id });
    m.solidGrid = g;
  }
  /**
   * The map's solid-circle grid, rebuilt when props changed. Per map: rt.solidDirty bumps a
   * generation so a query on another map (a path on the basement while you stand upstairs) never
   * leaves the current map's grid stale.
   */
  function ensureSolids(m) {
    if (rt.solidDirty) { rt.solidGen = (rt.solidGen || 0) + 1; rt.solidDirty = false; }
    if (!m.solidGrid || m.solidGen !== rt.solidGen) { rebuildSolids(m); m.solidGen = rt.solidGen; }
    return m.solidGrid;
  }
  function pushCircles(m, p, r) {
    ensureSolids(m);
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const list = [];
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const g = m.solidGrid.get(y * m.w + x);
      if (g) for (const o of g) list.push(o);
    }
    const ns = S().npcs;
    for (const id in ns) { const n = ns[id]; if (n.map === m.id && !n.hidden) list.push({ x: n.x, y: n.y, r: 0.2 }); }
    for (const o of list) {
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), min = r + o.r;
      if (d >= min) continue;
      if (d < 1e-4) { p.x -= Math.cos(P.angle) * (min - d); p.y -= Math.sin(P.angle) * (min - d); continue; }
      p.x += (dx / d) * (min - d);
      p.y += (dy / d) * (min - d);
    }
  }
  /** Can a circle of radius r stand at (x, y)? (walls, pits, closed doors, solid props) */
  function freeAt(m, x, y, r) {
    const rs = blockRects(m, x - r, y - r, x + r, y + r, []);
    for (const b of rs) if (Math.min(x + r, b[2]) - Math.max(x - r, b[0]) > 1e-4 && Math.min(y + r, b[3]) - Math.max(y - r, b[1]) > 1e-4) return false;
    return true;
  }
  /** If the player is stuck inside geometry (a mutation reverted around them), move to the nearest free cell. */
  function ensureFree() {
    const m = W.map;
    if (!m || freeAt(m, P.x, P.y, RADIUS)) return;
    const sx = Math.floor(P.x), sy = Math.floor(P.y);
    for (let r = 0; r < 12; r++) {
      for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
        if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r) continue;
        if (freeAt(m, x + 0.5, y + 0.5, RADIUS)) { P.x = x + 0.5; P.y = y + 0.5; return; }
      }
    }
  }

  /* ================================================================ player */
  function inputActive() {
    return !!(DA.modes && DA.modes.is && DA.modes.is('explore')) && !rt.travelling && !rt.frozen && !DA.paused;
  }
  function updatePlayer(dt) {
    const m = W.map;
    if (!m) return;
    const I = DA.input || {};
    const active = inputActive();
    const mouse = I.consumeMouse ? I.consumeMouse() : { dx: 0, dy: 0 };
    const down = (c) => !!(I.down && I.down(c));
    // ---- look
    if (active && !rt.hideAnim) {
      const sens = 0.0022 * (+DA.settings.sensitivity || 1);
      P.angle += mouse.dx * sens;
      P.pitch -= mouse.dy * sens * 0.85 * (DA.settings.invertY ? -1 : 1);
      if (down('ArrowLeft')) P.angle -= TURN_RATE * dt;
      if (down('ArrowRight')) P.angle += TURN_RATE * dt;
    }
    if (rt.lookAt) {
      const la = rt.lookAt;
      // a fixed heading (turnTo / lookAt from a reference point) or the direction to a point
      const want = la.angle != null ? la.angle : Math.hypot(la.x - P.x, la.y - P.y) > 0.05 ? Math.atan2(la.y - P.y, la.x - P.x) : P.angle;
      const k = Math.min(1, dt * 4);
      P.angle += U.wrapAngle(want - P.angle) * k;
      P.pitch += ((la.pitch || 0) - P.pitch) * k;
      la.t -= dt;
      if (la.t <= 0) rt.lookAt = null;
    }
    if (P.hidden && rt.hideSpot) {
      const base = rt.hideSpot.angle, d = U.wrapAngle(P.angle - base), lim = 75 * DEG;
      if (Math.abs(d) > lim) P.angle = base + Math.sign(d) * lim;
    }
    P.angle = U.wrapAngle(P.angle);
    const pmax = (m && m.pitchMax) || PITCH_MAX;
    P.pitch = U.clamp(P.pitch, -pmax, pmax);
    // ---- hide transition
    if (rt.hideAnim) { stepHideAnim(dt); syncState(); return; }
    // ---- move
    let fx = 0, sx = 0;
    if (active && !P.hidden) {
      if (down('KeyW') || down('ArrowUp')) fx += 1;
      if (down('KeyS') || down('ArrowDown')) fx -= 1;
      if (down('KeyA')) sx -= 1;
      if (down('KeyD')) sx += 1;
    }
    const len = Math.hypot(fx, sx);
    if (len > 1) { fx /= len; sx /= len; }
    const wantRun = active && (down('ShiftLeft') || down('ShiftRight')) && len > 0 && !P.crouching;
    const speed = P.crouching ? SPEED.crouch : wantRun ? SPEED.run : SPEED.walk;
    const ca = Math.cos(P.angle), sa = Math.sin(P.angle);
    const tvx = (ca * fx - sa * sx) * speed, tvy = (sa * fx + ca * sx) * speed;
    const k = 1 - Math.exp(-dt * (len > 0 ? 10 : 13));
    rt.vx += (tvx - rt.vx) * k;
    rt.vy += (tvy - rt.vy) * k;
    if (Math.abs(rt.vx) < 1e-3 && !len) rt.vx = 0;
    if (Math.abs(rt.vy) < 1e-3 && !len) rt.vy = 0;
    const ox = P.x, oy = P.y;
    if (rt.vx || rt.vy) slide(m, P, rt.vx * dt, rt.vy * dt, RADIUS);
    pushCircles(m, P, RADIUS);
    resolveOverlap(m, P, RADIUS);
    const moved = Math.hypot(P.x - ox, P.y - oy);
    if (dt > 0) { // lose speed we could not use (walking into a wall does not "charge up")
      const ax = (P.x - ox) / dt, ay = (P.y - oy) / dt;
      if (Math.abs(ax) < Math.abs(rt.vx)) rt.vx = ax;
      if (Math.abs(ay) < Math.abs(rt.vy)) rt.vy = ay;
    }
    const spd = dt > 0 ? moved / dt : 0;
    P.running = wantRun && spd > 2.6;
    // ---- footsteps, head bob, noise
    const stride = P.running ? 0.95 : P.crouching ? 0.62 : 0.78;
    if (moved > 1e-4) {
      rt.strideAcc += moved;
      rt.bobPhase += (moved / stride) * Math.PI;
      if (rt.strideAcc >= stride) { rt.strideAcc -= stride; footstep(m); }
    } else rt.strideAcc = Math.min(rt.strideAcc, stride * 0.6);
    const ampT = DA.settings.headBob === false ? 0 : (P.running ? 0.028 : P.crouching ? 0.012 : 0.018) * U.clamp(spd / SPEED.walk, 0, 1.2);
    rt.bobAmp += (ampT - rt.bobAmp) * Math.min(1, dt * 8);
    P.bob = Math.sin(rt.bobPhase * 2) * rt.bobAmp;
    const noiseT = spd < 0.2 ? 0 : P.running ? 0.8 : P.crouching ? 0.1 : 0.35;
    P.noise += (noiseT - P.noise) * Math.min(1, dt * (noiseT > P.noise ? 8 : 2.5));
    const eyeT = P.hidden && rt.hideSpot ? rt.hideSpot.eye : P.crouching ? EYE.crouch : EYE.stand;
    rt.eye += (eyeT - rt.eye) * Math.min(1, dt * 9);
    // ---- portals (layout drift)
    checkPortals(m);
    syncState();
  }
  function footstep(m) {
    const i = idxOf(m, P.x, P.y);
    const surface = FOOT_SURFACE[texName(i >= 0 ? m.floor[i] : 0)] || 'concrete';
    const vol = P.running ? 1 : P.crouching ? 0.32 : 0.62;
    audio('play', 'footstep', { surface, vol, rate: U.rand(0.94, 1.06) });
    if (i >= 0 && m.creak[i]) {
      const fresh = rt.lastCreak !== i;
      rt.lastCreak = i;
      if (Math.random() < (fresh ? 0.85 : 0.35) * (P.crouching ? 0.45 : 1)) {
        audio('play', 'creak', { vol: P.crouching ? 0.35 : 0.75, x: P.x, y: P.y, rate: U.rand(0.9, 1.1) });
        P.noise = Math.max(P.noise, P.crouching ? 0.25 : 0.6);
      }
    } else rt.lastCreak = -1;
  }
  function syncState() {
    const s = S();
    s.x = P.x; s.y = P.y; s.angle = P.angle; s.pitch = P.pitch; s.map = W.mapId;
    s.crouch = !!P.crouching;
  }
  /** Camera for the renderer: z = eye height (crouch/hide lower it); bob = head-bob offset added on top. */
  W.camera = () => ({
    x: P.x, y: P.y, angle: P.angle, pitch: P.pitch, fov: +DA.settings.fov || 66,
    bob: P.bob, z: rt.eye, map: W.mapId,
  });
  W.setCrouch = (on) => { P.crouching = !!on; S().crouch = P.crouching; };
  W.setFlashlight = (on) => {
    P.flashlight = !!on && DA.hasItem('flashlight');
    S().flashlight = P.flashlight;
  };
  W.freeze = (on) => { rt.frozen = !!on; if (on) { rt.vx = rt.vy = 0; } };
  /**
   * Turn the view smoothly toward (x, y) over `secs`. opts.from = {x, y} | point name: face along the
   * direction from that reference to (x, y) instead of from the player (the operator stood up from
   * the chair: "turn around" faces the spot behind the chair even when you stand right on it).
   * opts.pitch: pitch to settle at (default level).
   */
  W.lookAt = (x, y, secs, opts) => {
    opts = opts || {};
    let from = opts.from;
    if (typeof from === 'string') from = W.point(from);
    const la = { x: +x, y: +y, t: secs || 1, pitch: +opts.pitch || 0 };
    if (from && isFinite(from.x) && Math.hypot(la.x - from.x, la.y - from.y) > 1e-3) la.angle = Math.atan2(la.y - from.y, la.x - from.x);
    rt.lookAt = la;
  };
  /** Turn smoothly to an absolute heading (degrees; 0 east, 90 south) over `secs`. */
  W.turnTo = (angleDeg, secs, pitch) => { rt.lookAt = { x: P.x, y: P.y, angle: (+angleDeg || 0) * DEG, t: secs || 1, pitch: +pitch || 0 }; };
  W.facing = (x, y) => U.wrapAngle(Math.atan2(y - P.y, x - P.x) - P.angle);
  W.distTo = (x, y) => Math.hypot(x - P.x, y - P.y);
  /**
   * Could the player see world point (x, y) right now? In front within the horizontal view (fov,
   * default the camera's, trimmed by `margin` degrees), closer than maxDist (default 14) and with a
   * clear line of sight (walls, closed doors). opts: {maxDist, margin, mapId}.
   */
  W.canSee = (x, y, opts) => {
    opts = opts || {};
    const mapId = opts.mapId || W.mapId;
    if (mapId !== W.mapId || !W.map) return false;
    const d = Math.hypot(x - P.x, y - P.y);
    if (d > (opts.maxDist || 14)) return false;
    if (d > 0.3) {
      const half = ((+DA.settings.fov || 66) / 2 - (opts.margin == null ? 6 : opts.margin)) * DEG;
      if (Math.abs(U.wrapAngle(Math.atan2(y - P.y, x - P.x) - P.angle)) > half) return false;
    }
    return W.lineOfSight(P.x, P.y, x, y, mapId);
  };
  /** Is the player inside the station building (ground floor, under a roof)? The ceiling speaker's reach. */
  W.inBuilding = () => {
    const m = W.map;
    if (!m || m.id !== 'station') return false;
    const i = idxOf(m, P.x, P.y);
    return i >= 0 && !m.outdoor[i] && !m.wall[i] && m.ceil[i] > 0;
  };

  /* ============================================================== portals */
  function checkPortals(m) {
    if (!m.portals.length) { rt.portalInside = false; return; }
    let inside = false;
    for (const pt of m.portals) {
      if (P.x < pt.x0 || P.x > pt.x1 || P.y < pt.y0 || P.y > pt.y1) continue;
      inside = true;
      if (rt.portalInside) continue;
      if (pt.dir != null) {
        const dx = Math.cos(pt.dir * DEG), dy = Math.sin(pt.dir * DEG);
        if (rt.vx * dx + rt.vy * dy < 0.05) continue;
      }
      const to = W.point(pt.to);
      if (!to) continue;
      const rot = pt.dir != null ? to.angle - pt.dir * DEG : 0;
      const cx = (pt.x0 + pt.x1) / 2, cy = (pt.y0 + pt.y1) / 2, ox = P.x - cx, oy = P.y - cy;
      const c = Math.cos(rot), s = Math.sin(rot);
      let rx = ox * c - oy * s, ry = ox * s + oy * c;
      rx = U.clamp(rx, -0.25, 0.25); ry = U.clamp(ry, -0.1, 0.1);
      if (pt.open) W.openDoor(pt.open, true);
      if (to.map !== W.mapId) setCurrentMap(to.map);
      P.x = to.x + rx; P.y = to.y + ry;
      P.angle = U.wrapAngle(P.angle + rot);
      const vx = rt.vx * c - rt.vy * s, vy = rt.vx * s + rt.vy * c;
      rt.vx = vx; rt.vy = vy;
      ensureFree();
      rt.portalInside = true;
      DA.bus.emit('portal', { map: m.id, to: pt.to, mutation: pt.mutation });
      return;
    }
    rt.portalInside = inside;
  }

  /* ======================================================= rooms, triggers */
  function updateRoomAndTriggers() {
    const m = W.map;
    if (!m) return;
    const room = W.room();
    if (room !== rt.lastRoom) {
      const prev = rt.lastRoom;
      rt.lastRoom = room;
      rt.ambDirty = true;
      if (room) DA.bus.emit('room:enter', { room, prev, map: m.id });
    }
    for (let k = 0; k < m.triggers.length; k++) {
      const t = m.triggers[k];
      const inside = P.x >= t.x0 && P.x < t.x1 + 1 && P.y >= t.y0 && P.y < t.y1 + 1;
      // keyed per zone: several zones may share one id (the woods have a woods_deep near each end)
      const key = m.id + ':' + t.id + '#' + k;
      if (inside && !rt.triggers.has(key)) {
        rt.triggers.add(key);
        // t.dir (degrees): only fires when you enter heading that way (moving, else facing)
        if (t.dir == null || headingOk(t.dir)) { rt.trigFired.add(key); DA.bus.emit('trigger:enter', { id: t.id, map: m.id }); }
      } else if (!inside && rt.triggers.has(key)) {
        rt.triggers.delete(key);
        if (rt.trigFired.delete(key)) DA.bus.emit('trigger:exit', { id: t.id, map: m.id });
      }
    }
  }
  function headingOk(dirDeg) {
    const sp = Math.hypot(rt.vx, rt.vy);
    const a = sp > 0.3 ? Math.atan2(rt.vy, rt.vx) : P.angle;
    return Math.cos(U.wrapAngle(a - dirDeg * DEG)) > 0.35;
  }

  /* ============================================================== ambience */
  function rainLevel() {
    const w = S().weather, m = W.map;
    if (!m) return 0;
    const base = U.clamp(w.rain == null ? 0.85 : w.rain, 0, 1);
    if (m.id === 'station') return base * (isOutdoor() ? 1 : 0.42);
    if (m.id === 'roof') return base;
    if (m.id === 'basement') return base * 0.08;
    return 0;
  }
  function updateAmbience(force) {
    const m = W.map;
    if (!m) return;
    const def = m.def || {};
    const room = W.room();
    const outdoor = isOutdoor();
    const p = S().power;
    const params = Object.assign({ rain: 0, wind: 0, thunder: 0, drone: 0 }, def.ambience || {}, (def.roomAmbience || {})[room] || {});
    params.rain = rainLevel();
    params.indoor = !outdoor;
    const ra = (def.roomAmbience || {})[room];
    params.room = (ra && ra.room) || ROOM_REVERB[room] || (def.ambience && def.ambience.room) || 'small';
    const powered = !!p.main && m.variant !== 'abandoned';
    params.hum = (m.id === 'station' || m.id === 'basement') && powered ? (outdoor ? 0.15 : room === 'equipment' ? 1 : 0.75) : m.id === 'relay' ? 0.4 : 0;
    params.generator = p.generator ? S().genSound || 'on' : 'off';
    if (m.id === 'basement') {
      const g = m.points.pt_gen;
      params.genDist = g ? U.clamp(1 - Math.hypot(P.x - g.x, P.y - g.y) / 16, 0.2, 1) : 0.5; // floor 0.2: anywhere downstairs is louder than upstairs (0.14)
    } else params.genDist = m.id === 'station' ? (outdoor ? 0.05 : 0.14) : 0;
    params.wind = outdoor ? Math.max(params.wind || 0, m.id === 'roof' ? 1 : 0.6) : (params.wind || 0) * 0.35;
    params.thunder = (S().weather.thunder || 0) * (m.id === 'station' || m.id === 'roof' ? 1 : 0.15);
    params.daylight = (+S().daylight || 0) > 0.5;
    const key = JSON.stringify(params);
    if (!force && key === rt.lastAmb) return;
    rt.lastAmb = key;
    audio('ambience', params);
  }

  /* ================================================================== doors */
  function findDoor(id) {
    if (W.map && W.map.doorById[id]) return W.map.doorById[id];
    for (const k in W.maps) if (W.maps[k].doorById[id]) return W.maps[k].doorById[id];
    return null;
  }
  const doorPos = (d) => ({ x: d.x + 0.5, y: d.y + 0.5 });
  function playerInside(d) {
    if (!d.inside || d.map !== W.mapId) return false;
    const cx = d.x + 0.5, cy = d.y + 0.5;
    switch (d.inside) {
      case 'n': return P.y < cy;
      case 's': return P.y > cy;
      case 'e': return P.x > cx;
      default: return P.x < cx;
    }
  }
  function doorSound(d, name, vol) {
    if (d.map !== W.mapId) return;
    audio('play', name, Object.assign(doorPos(d), { vol: vol == null ? 0.9 : vol }));
  }
  function openDoorRec(d, instant, by) {
    if (!d) return false;
    if (d.locked) { d.locked = false; DA.bus.emit('door:unlock', { id: d.id, map: d.map, by: by || 'script' }); }
    if (d.target === 1 && !instant) return true;
    d.target = 1;
    d.by = by || 'script';
    if (instant) { d.open = 1; markTopo(d.map); }
    else doorSound(d, d.heavy ? 'door_heavy' : /wood|records/.test(d.texName) && Math.random() < 0.3 ? 'door_creak' : 'door_open');
    saveDoor(d);
    rt.audDirty = true;
    DA.bus.emit('door:open', { id: d.id, map: d.map, by: by || 'script' });
    return true;
  }
  function closeDoorRec(d, instant, by) {
    if (!d) return false;
    if (d.target === 0 && !instant) return true;
    d.target = 0;
    d.by = by || 'script';
    if (instant) { d.open = 0; markTopo(d.map); }
    saveDoor(d);
    rt.audDirty = true;
    DA.bus.emit('door:close', { id: d.id, map: d.map, by: by || 'script' });
    return true;
  }
  function setLock(d, locked, by) {
    if (!d) return;
    if (locked && d.target) closeDoorRec(d, false, by);
    if (!!d.locked === !!locked) return;
    d.locked = !!locked;
    saveDoor(d);
    doorSound(d, 'door_unlock', 0.7);
    if (locked) DA.bus.emit('door:locked', { id: d.id, map: d.map, attempt: false, by: by || 'script' });
    else DA.bus.emit('door:unlock', { id: d.id, map: d.map, by: by || 'script' });
  }
  function markTopo(mapId) { const m = W.maps[mapId]; if (m) m.topoDirty = true; rt.audDirty = true; }
  /** Is anyone standing in the swing of a door (a closing door waits for them)? */
  function actorInDoor(m, d) {
    const near = (x, y) => (d.axis === 'h'
      ? Math.abs(y - (d.y + 0.5)) < 0.32 && x > d.x - 0.15 && x < d.x + 1.15
      : Math.abs(x - (d.x + 0.5)) < 0.32 && y > d.y - 0.15 && y < d.y + 1.15);
    if (m.id === W.mapId && near(P.x, P.y)) return true;
    const ns = S().npcs;
    for (const id in ns) if (ns[id].map === m.id && !ns[id].hidden && near(ns[id].x, ns[id].y)) return true;
    return false;
  }
  function updateDoors(m, dt) {
    for (const d of m.doors) {
      if (d.open === d.target) continue;
      if (d.target < d.open && actorInDoor(m, d)) continue;
      const step = dt / (d.heavy ? 0.9 : 0.5);
      const prev = d.open;
      d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      if ((prev < 0.12) !== (d.open < 0.12)) markTopo(m.id);
      if ((prev < 0.5) !== (d.open < 0.5) || d.open === d.target) rt.audDirty = true;
      if (d.open === 0 && prev > 0) doorSound(d, d.heavy ? 'door_heavy' : 'door_close', d.heavy ? 0.7 : 0.85);
    }
    if (m.topoDirty) topology(m);
  }
  function useDoor(d, opts) {
    if (!d || d.static) return;
    const inside = playerInside(d);
    if (opts && opts.lock) {
      if (d.lockableInside && inside && d.open < 0.05) setLock(d, !d.locked, 'player');
      return;
    }
    if (d.locked) {
      if (d.key && DA.hasItem(d.key)) { setLock(d, false, 'key'); openDoorRec(d, false, 'player'); return; }
      if (d.lockableInside && inside) { setLock(d, false, 'player'); openDoorRec(d, false, 'player'); return; }
      doorSound(d, 'door_locked', 0.8);
      DA.bus.emit('door:locked', { id: d.id, map: d.map, attempt: true, by: 'player' });
      ui('hint', 'Locked.', 1.4);
      return;
    }
    if (d.target) closeDoorRec(d, false, 'player');
    else openDoorRec(d, false, 'player');
  }
  function doorPrompt(d) {
    const inside = playerInside(d);
    if (d.locked) {
      if (d.key && DA.hasItem(d.key)) return 'Unlock the door';
      if (d.lockableInside && inside) return 'Unlock the door';
      return 'Locked';
    }
    if (d.target) return 'Close the door';
    if (d.lockableInside && inside) return 'Open the door   (hold E to lock)';
    return 'Open the door';
  }
  W.door = (id) => findDoor(id);
  W.openDoor = (id, instant) => openDoorRec(findDoor(id), !!instant);
  W.closeDoor = (id, instant) => closeDoorRec(findDoor(id), !!instant);
  W.lockDoor = (id, on) => setLock(findDoor(id), on !== false);
  W.isOpen = (id) => { const d = findDoor(id); return !!(d && d.target === 1); };
  /** Doors (ids) standing open whose last opener was `by` ('player' default; 'npc:hollis', 'script'…) on mapId (station). */
  W.doorsLeftOpen = (by, mapId) => {
    const m = W.maps[mapId || 'station'];
    if (!m) return [];
    const who = by || 'player';
    return m.doors.filter((d) => !d.static && d.target === 1 && d.by === who).map((d) => d.id);
  };
  /** Who last moved a door and how it stands → {id, open, locked, by} | null. */
  W.doorInfo = (id) => { const d = findDoor(id); return d ? { id: d.id, open: d.target === 1, locked: !!d.locked, by: d.by || null, map: d.map } : null; };

  /* ================================================== interaction: focus ray */
  /** DDA along the view: first wall face, or door slab, within maxD. Pits are looked over. */
  function focusRay(m, ox, oy, dx, dy, maxD) {
    let cx = Math.floor(ox), cy = Math.floor(oy);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx > 0 ? (cx + 1 - ox) * tdx : dx < 0 ? (ox - cx) * tdx : Infinity;
    let tmy = dy > 0 ? (cy + 1 - oy) * tdy : dy < 0 ? (oy - cy) * tdy : Infinity;
    let t = 0;
    for (let n = 0; n < 24; n++) {
      if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return { type: 'none', dist: maxD };
      const i = cy * m.w + cx;
      const di = m.door[i];
      if (di >= 0) {
        const d = m.doors[di], tExit = Math.min(tmx, tmy);
        let ts = -1, ok = false;
        if (d.axis === 'h' && dy !== 0) { ts = (cy + 0.5 - oy) / dy; const hx = ox + dx * ts; ok = hx >= cx - 1e-6 && hx <= cx + 1 + 1e-6; }
        else if (d.axis === 'v' && dx !== 0) { ts = (cx + 0.5 - ox) / dx; const hy = oy + dy * ts; ok = hy >= cy - 1e-6 && hy <= cy + 1 + 1e-6; }
        if (ok && ts >= Math.max(0, t - 1e-6) && ts <= tExit + 1e-6 && ts <= maxD) return { type: 'door', i, door: d, dist: ts };
      }
      let side;
      if (tmx < tmy) { t = tmx; tmx += tdx; cx += stepX; side = stepX > 0 ? 'w' : 'e'; }
      else { t = tmy; tmy += tdy; cy += stepY; side = stepY > 0 ? 'n' : 's'; }
      if (t > maxD) return { type: 'none', dist: maxD };
      if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return { type: 'none', dist: maxD };
      const j = cy * m.w + cx;
      if (m.wall[j]) return { type: 'face', i: j, side, dist: t };
    }
    return { type: 'none', dist: maxD };
  }
  const isEnabled = (it) => !S().disabled[it.id] && it.enabled !== false || S().disabled[it.id] === false;
  function firstEnabled(list) {
    if (!list) return null;
    for (const it of list) if (isEnabled(it)) return it;
    return null;
  }
  /** What the player is looking at: face/door interactable along the view ray, or a floor/prop one in a narrow cone. */
  function computeFocus(m, x, y, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const hit = focusRay(m, x, y, dx, dy, REACH);
    let best = null, bestD = Infinity;
    if (hit.type === 'face') { best = firstEnabled(m.faceIndex.get(hit.i * 4 + SIDE_IDX[hit.side])); bestD = hit.dist; }
    else if (hit.type === 'door') { best = firstEnabled(m.cellIndex.get(hit.i)); bestD = hit.dist; }
    const wallD = hit.type === 'none' ? Infinity : hit.dist;
    let fb = null, fs = Infinity, fd = Infinity;
    for (const it of m.floorInteract) {
      if (!isEnabled(it)) continue;
      const r = it.radius == null ? 0.4 : it.radius;
      const ex = it.x - x, ey = it.y - y, d = Math.hypot(ex, ey);
      if (d - r > REACH) continue;
      if (d - r > wallD + 0.05) continue;
      const ang = Math.abs(U.wrapAngle(Math.atan2(ey, ex) - angle));
      const allow = d <= r ? Math.PI * 0.45 : Math.atan2(r, d) + 0.1;
      if (ang > allow) continue;
      if (d > r && !W.lineOfSight(x, y, it.x, it.y, m.id)) continue;
      const score = ang / allow + d * 0.15;
      if (score < fs) { fs = score; fb = it; fd = Math.max(0, d - r); }
    }
    if (fb && (!best || fd < bestD)) best = fb;
    return best;
  }
  function promptText(it) {
    if (!it) return null;
    const ov = S().prompts[it.id];
    if (typeof ov === 'string') return ov;
    if (P.hidden && rt.hideSpot && rt.hideSpot.it === it) return 'Come out';
    if (it.kind === 'door') { const d = findDoor(it.door || it.id); return d ? doorPrompt(d) : 'Door'; }
    return it.prompt || pretty(it.id);
  }
  function updateFocus() {
    const m = W.map;
    let it = null;
    if (m && inputActive()) it = P.hidden ? rt.hideSpot && rt.hideSpot.it : rt.hideAnim ? null : computeFocus(m, P.x, P.y, P.angle);
    rt.focus = it;
    const t = promptText(it);
    const str = t ? 'E  ' + t : null;
    if (str !== rt.promptShown) { rt.promptShown = str; ui('prompt', str); }
  }
  W.focus = () => rt.focus;
  /** What would be in focus standing at (x, y) looking at angleDeg on mapId (debug / tests / director). */
  W.focusAt = (x, y, angleDeg, mapId) => {
    const m = W.maps[mapId || W.mapId];
    return m ? computeFocus(m, x, y, angleDeg * DEG) : null;
  };
  /** Could the player stand at (x, y)? (grid, closed doors and solid props/trees) */
  W.canStand = (x, y, mapId, r) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return false;
    r = r || RADIUS;
    if (!freeAt(m, x, y, r)) return false;
    ensureSolids(m);
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const g = xx >= 0 && yy >= 0 && xx < m.w && yy < m.h ? m.solidGrid.get(yy * m.w + xx) : null;
      if (g) for (const o of g) if (Math.hypot(x - o.x, y - o.y) < r + o.r) return false;
    }
    return true;
  };

  /* ============================================================ DA.interact */
  // Handler tables. Ids and kinds live in SEPARATE tables so an id handler always runs before every
  // kind handler, even when an id equals a kind (the backup `generator`, the `car`).
  //   byId   — onId(id, fn)            (explicit)
  //   byKind — onKind(kind, fn)        (explicit)
  //   legacy — on(key, fn)             (key may be an id or a kind; see fire() for the order)
  const byId = new Map(), byKind = new Map(), legacy = new Map();
  const addTo = (tbl, key, fn) => {
    if (typeof fn !== 'function' || key == null) return;
    if (!tbl.has(key)) tbl.set(key, []);
    tbl.get(key).push(fn);
  };
  const removeFrom = (tbl, key, fn) => {
    const a = tbl.get(key);
    if (!a) return false;
    const i = a.indexOf(fn);
    if (i < 0) return false;
    a.splice(i, 1);
    return true;
  };
  function findInteractable(id) {
    const scan = (m) => m && m.interact.find((it) => it.id === id);
    let it = scan(W.map);
    if (it) return { it, map: W.mapId };
    for (const k in W.maps) if ((it = scan(W.maps[k]))) return { it, map: k };
    return null;
  }
  const IX = (DA.interact = {
    /**
     * Legacy registration: key = interactable id or kind. Prefer onId / onKind, which are unambiguous.
     * Fire order: onId(id) → on(id) → onKind(kind) → on(kind); the first handler returning true consumes.
     */
    on(key, fn) { addTo(legacy, key, fn); return () => IX.off(key, fn); },
    /** Handler for one interactable id. Runs before every kind handler. */
    onId(id, fn) { addTo(byId, id, fn); return () => removeFrom(byId, id, fn); },
    /** Handler for every interactable of a kind (runs after all id handlers). */
    onKind(kind, fn) { addTo(byKind, kind, fn); return () => removeFrom(byKind, kind, fn); },
    off(key, fn) {
      if (removeFrom(legacy, key, fn)) return;
      if (removeFrom(byId, key, fn)) return;
      removeFrom(byKind, key, fn);
    },
    /** Fire an interactable (id string or object). Returns true when a handler consumed it. */
    fire(target, opts) {
      let it = target;
      if (typeof target === 'string') { const f = findInteractable(target); it = f ? f.it : { id: target, kind: target }; }
      else if (target && target.id && !target.kind) { const f = findInteractable(target.id); it = f ? f.it : target; }
      if (!it) return false;
      if (!isEnabled(it)) return false;
      DA.bus.emit('interact', { id: it.id, kind: it.kind, target: it });
      const run = (tbl, key) => {
        for (const fn of (tbl.get(key) || []).slice()) {
          try { if (fn(it, opts) === true) return true; } catch (e) { console.error('[interact ' + key + ']', e); }
        }
        return false;
      };
      if (it.id != null && (run(byId, it.id) || run(legacy, it.id))) return true;
      if (it.kind != null && run(byKind, it.kind)) return true;
      if (it.kind != null && it.kind !== it.id && run(legacy, it.kind)) return true;
      return false;
    },
    /** Override the prompt text (null → back to the default; '' → usable but no text). */
    setPrompt(id, text) {
      if (text == null) delete S().prompts[id];
      else S().prompts[id] = String(text);
      rt.promptShown = undefined;
    },
    setEnabled(id, on) {
      if (on === false) S().disabled[id] = true;
      else if (on === true) {
        const f = findInteractable(id);
        if (f && f.it.enabled === false) S().disabled[id] = false;
        else delete S().disabled[id];
      }
      rt.promptShown = undefined;
    },
    enabled(id) { const f = findInteractable(id); return f ? isEnabled(f.it) : !S().disabled[id]; },
    prompt(id) { const f = findInteractable(id); return f ? promptText(f.it) : null; },
    focus: () => rt.focus,
    find: (id) => findInteractable(id),
    list(mapId) { const m = W.maps[mapId || W.mapId]; return m ? m.interact.slice() : []; },
  });

  /* ======================================================== world-owned kinds */
  function registerKinds() {
    IX.onKind('door', (it, opts) => { useDoor(findDoor(it.door || it.id), opts); return true; });
    IX.onKind('stairs', (it) => { travel(it); return true; });
    IX.onKind('ladder', (it) => { travel(it); return true; });
    IX.onKind('hide', (it) => { if (P.hidden) exitHide(); else enterHide(it); return true; });
    IX.onKind('item', (it) => {
      if (!it.item) return true;
      DA.giveItem(it.item);
      ui('toast', itemName(it.item));
      audio('play', 'paper', { vol: 0.4 });
      if (it.prop) W.showProp(it.prop, false);
      if (it.once !== false) IX.setEnabled(it.id, false);
      return true;
    });
    IX.onKind('flashlight', (it) => {
      const item = it.item || 'flashlight';
      DA.giveItem(item);
      ui('toast', itemName(item));
      ui('hint', 'F — flashlight', 4);
      audio('play', 'switch', { vol: 0.35 });
      IX.setEnabled(it.id, false);
      return true;
    });
    IX.onKind('note', (it) => {
      const id = it.note, n = content().notes && content().notes[id];
      if (!id) return true;
      if (!Array.isArray(DA.state.notes)) DA.state.notes = [];
      const fresh = !DA.state.notes.includes(id);
      if (fresh) DA.state.notes.push(id);
      audio('play', 'paper', { vol: 0.6 });
      if (fresh) ui('toast', 'NOTE FOUND');
      ui('doc', { id, title: (n && n.title) || 'NOTE', body: (n && (n.text || n.body)) || '', style: 'paper' });
      DA.bus.emit('note:found', { id, source: it.id });
      return true;
    });
    IX.onKind('doc', (it) => {
      if (!it.doc) return true;
      if (!Array.isArray(DA.state.docs)) DA.state.docs = [];
      if (!DA.state.docs.includes(it.doc)) DA.state.docs.push(it.doc);
      audio('play', 'paper', { vol: 0.5 });
      ui('doc', it.doc);
      return true;
    });
    IX.onKind('look', (it) => {
      const looks = content().looks || {};
      const text = it.text || looks[it.id] || null;
      if (text) ui('think', DA.fmt(text));
      return true;
    });
  }

  /* ================================================================ hiding */
  function enterHide(it) {
    const pos = it.pos || { x: P.x, y: P.y, angle: P.angle / DEG };
    rt.hideSpot = { it, x: pos.x, y: pos.y, angle: (pos.angle == null ? P.angle / DEG : pos.angle) * DEG, eye: pos.eye || (/desk/.test(it.id) ? 0.19 : 0.3) };
    S().hideFrom = { x: P.x, y: P.y, angle: P.angle, crouch: !!P.crouching };
    rt.hideAnim = { t: 0, dur: 0.45, enter: true, fx: P.x, fy: P.y, fa: P.angle, fe: rt.eye, tx: rt.hideSpot.x, ty: rt.hideSpot.y, ta: rt.hideSpot.angle, te: rt.hideSpot.eye };
    P.hidden = true;
    S().hidden = it.id;
    rt.vx = rt.vy = 0;
    hideSound(it.id, true);
    DA.bus.emit('hide:enter', { id: it.id });
  }
  function exitHide() {
    if (!P.hidden || (rt.hideAnim && !rt.hideAnim.enter)) return;
    const f = S().hideFrom || { x: P.x, y: P.y, angle: P.angle };
    rt.hideAnim = { t: 0, dur: 0.4, enter: false, fx: P.x, fy: P.y, fa: P.angle, fe: rt.eye, tx: f.x, ty: f.y, ta: P.angle, te: f.crouch ? EYE.crouch : EYE.stand };
    hideSound(S().hidden, false);
  }
  function hideSound(id, enter) {
    if (/stall|cupboard/.test(id || '')) audio('play', 'door_creak', { vol: 0.35, x: P.x, y: P.y });
    else if (/desk/.test(id || '')) audio('play', 'chair_scrape', { vol: enter ? 0.25 : 0.3, x: P.x, y: P.y });
    else audio('play', 'footstep', { surface: 'concrete', vol: 0.3 });
  }
  function stepHideAnim(dt) {
    const a = rt.hideAnim;
    a.t += dt;
    const k = U.smoothstep(0, 1, a.t / a.dur);
    P.x = U.lerp(a.fx, a.tx, k);
    P.y = U.lerp(a.fy, a.ty, k);
    P.angle = a.fa + U.wrapAngle(a.ta - a.fa) * k;
    rt.eye = U.lerp(a.fe, a.te, k);
    P.bob = 0;
    if (a.t < a.dur) return;
    rt.hideAnim = null;
    if (!a.enter) {
      const id = S().hidden;
      P.hidden = false;
      S().hidden = null;
      S().hideFrom = null;
      rt.hideSpot = null;
      ensureFree();
      DA.bus.emit('hide:exit', { id });
    }
  }
  /** Leave a hiding place immediately (map change, script). */
  function quietUnhide() {
    if (!P.hidden) return;
    const id = S().hidden, f = S().hideFrom;
    if (f) { P.x = f.x; P.y = f.y; }
    P.hidden = false;
    S().hidden = null;
    S().hideFrom = null;
    rt.hideSpot = null;
    rt.hideAnim = null;
    rt.eye = EYE.stand;
    DA.bus.emit('hide:exit', { id });
  }
  W.exitHide = () => exitHide();
  W.isHidden = () => !!P.hidden;

  /* ============================================================ travelling */
  function travel(it) {
    if (rt.travelling || !it.to) return;
    W.load(it.to, it.point, { fade: true, via: it.kind, from: it.id });
  }
  function placeAt(mapId, point) {
    const m = W.maps[mapId];
    let pt = null;
    if (typeof point === 'string') {
      const p = (m && m.points[point]) || null;
      if (p) pt = { x: p.x, y: p.y, angle: (p.angle || 0) * DEG };
      else { const g = W.point(point); if (g) pt = { x: g.x, y: g.y, angle: g.angle }; }
    } else if (point && isFinite(point.x)) pt = { x: +point.x, y: +point.y, angle: point.angle == null ? P.angle : point.angle * DEG };
    if (!pt) { console.warn('[world] unknown point', point); return false; }
    P.x = pt.x; P.y = pt.y; P.angle = U.wrapAngle(pt.angle); P.pitch = 0;
    return true;
  }
  function switchMap(mapId, point) {
    const from = W.mapId;
    if (P.hidden) quietUnhide();
    if (mapId !== W.mapId) setCurrentMap(mapId);
    placeAt(mapId, point);
    rt.vx = rt.vy = 0;
    ensureFree();
    updateLights(W.map, 0);
    syncState();
    rt.ambDirty = true;
    updateAmbience(true);
    if (from !== mapId) DA.bus.emit('map:change', { from, to: mapId, point: typeof point === 'string' ? point : null });
  }
  /** Stairs / ladders / scripted moves: quick fade, sound, new map at the point. */
  W.load = (mapId, point, opts) => {
    opts = opts || {};
    if (!W.maps[mapId]) { console.warn('[world] unknown map', mapId); return Promise.resolve(false); }
    const fade = opts.fade !== false && !!(DA.ui && DA.ui.fade) && DA.running;
    if (!fade) { switchMap(mapId, point); return Promise.resolve(true); }
    rt.travelling = true;
    const via = opts.via;
    if (via === 'ladder') audio('play', /hatch/.test(opts.from || '') ? 'hatch' : 'ladder', { vol: 0.8 });
    else if (via === 'stairs') {
      const surface = /relay/.test(opts.from || '') ? 'concrete' : 'concrete';
      for (let k = 0; k < 4; k++) DA.timers.after(k * 0.17, () => audio('play', 'footstep', { surface, vol: 0.55, rate: U.rand(0.95, 1.05) }), 'world_travel');
    }
    return new Promise((res) => {
      ui('fade', 1, 0.35);
      DA.timers.after(0.37, () => {
        switchMap(mapId, point);
        ui('fade', 0, 0.5);
        DA.timers.after(0.25, () => { rt.travelling = false; res(true); }, 'world_travel');
      }, 'world_travel');
    });
  };
  /** Seamless move (no fade): woods → supply cupboard, portals, scripted repositioning. */
  W.teleport = (x, y, angleDeg, mapId) => {
    // seamless: the player keeps walking — their speed carries over, turned with the new heading
    // (the woods → the cupboard aisle); a standing player stays still
    const a0 = P.angle, walking = inputActive(), vx = rt.vx, vy = rt.vy;
    if (typeof x === 'string') {
      const p = W.point(x);
      if (!p) return false;
      switchMap(p.map, x);
    } else switchMap(mapId || W.mapId, { x, y, angle: angleDeg == null ? null : angleDeg });
    if (walking && (vx || vy) && !P.hidden) {
      const r = U.wrapAngle(P.angle - a0), c = Math.cos(r), sn = Math.sin(r);
      rt.vx = vx * c - vy * sn; rt.vy = vx * sn + vy * c;
    }
    return true;
  };
  /** Named point → {map, x, y, angle (radians), deg}. Searches compiled maps (incl. mutation points). */
  W.point = (name) => {
    const hit = (id, p) => { const o = { map: id, x: p.x, y: p.y, angle: (p.angle || 0) * DEG, deg: p.angle || 0 }; if (p.z != null) o.z = p.z; return o; };
    if (W.map && W.map.points[name]) return hit(W.mapId, W.map.points[name]);
    for (const id in W.maps) if (W.maps[id].points[name]) return hit(id, W.maps[id].points[name]);
    const d = DA.maps && DA.maps.findPoint && DA.maps.findPoint(name);
    return d ? hit(d.map, d) : null;
  };

  /* ================================================================ weather */
  function updateWeather(dt) {
    rt.flash = Math.max(0, rt.flash - dt * 2.4);
    rt.lightningT -= dt;
    if (rt.lightningT > 0) return;
    const th = U.clamp(S().weather.thunder == null ? 0.35 : S().weather.thunder, 0, 1);
    rt.lightningT = U.lerp(60, 15, th) * U.rand(0.35, 1) + 15 * (1 - th) * 0.2;
    rt.lightningT = U.clamp(rt.lightningT, 15, 60);
    if (th > 0.02 && (+S().daylight || 0) < 0.6) strike(th);
  }
  function strike(th) {
    const m = W.map;
    if (!m) return;
    const out = isOutdoor();
    let s = 0;
    if (m.id === 'station' || m.id === 'roof') {
      if (out) s = U.rand(0.75, 1);
      else {
        const i = idxOf(m, P.x, P.y);
        s = U.rand(0.25, 0.4) + (i >= 0 ? m.winLight[i] * 0.3 : 0);
      }
    }
    const delay = U.rand(0.5, 4);
    if (s > 0) { render('lightning', s); rt.flash = s * 0.9; }
    const vol = m.id === 'basement' ? 0.28 : m.id === 'array' || m.id === 'relay' ? 0 : out ? 1 : 0.72;
    if (vol > 0) audio('play', 'thunder', { delay, vol: vol * U.lerp(1, 0.55, delay / 4) * (0.6 + 0.4 * (th || 0.4)) });
    DA.bus.emit('lightning', { strength: s, delay, map: m.id });
  }
  W.lightning = (strength) => strike(strength == null ? 0.6 : strength);

  /* ================================================================ history */
  function recordHistory() {
    const doors = {};
    for (const id in W.maps) for (const d of W.maps[id].doors) if (!d.static) doors[d.id] = d.target;
    rt.history.push({ t: DA.simTime, player: { x: P.x, y: P.y, angle: P.angle, map: W.mapId, hidden: !!P.hidden }, doors });
    if (rt.history.length > HISTORY_LEN) rt.history.shift();
  }
  /** Where things were `secAgo` seconds ago (1 Hz samples, 5 minutes). */
  W.history = (secAgo) => {
    const h = rt.history;
    if (!h.length) { recordHistory(); }
    const target = DA.simTime - (+secAgo || 0);
    let best = h[0];
    for (let i = h.length - 1; i >= 0; i--) { if (h[i].t <= target) { best = h[i]; break; } }
    return best;
  };

  /* ======================================================= radio audibility */
  /** Walking distance from the radio room through the building; a closed door costs extra. */
  function buildAudField() {
    const m = W.maps.station;
    if (!m) return null;
    const N = m.w * m.h, dist = new Float32Array(N).fill(Infinity);
    const radio = m.rooms.indexOf('radio');
    const buckets = [[]];
    for (let i = 0; i < N; i++) if (m.room[i] === radio && !m.solid[i] && m.door[i] < 0) { dist[i] = 0; buckets[0].push(i); }
    for (let d = 0; d < buckets.length && d <= AUDIBLE_CELLS + 4; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (let k = 0; k < b.length; k++) {
        const i = b[k];
        if (dist[i] < d) continue;
        const x = i % m.w, y = (i / m.w) | 0;
        for (const s of SIDES) {
          const nx = x + DIR[s][0], ny = y + DIR[s][1];
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const j = ny * m.w + nx;
          if (m.solid[j]) continue;
          let c = 1;
          if (m.door[j] >= 0 && m.doors[m.door[j]].open < 0.5) c += 3;
          const nd = d + c;
          if (nd < dist[j]) { dist[j] = nd; (buckets[nd] || (buckets[nd] = [])).push(j); }
        }
      }
    }
    return dist;
  }
  W.radioAudibility = () => {
    if (W.mapId !== 'station' || !W.map) return 0;
    if (rt.audDirty || !rt.audField) { rt.audField = buildAudField(); rt.audDirty = false; }
    const i = idxOf(W.map, P.x, P.y);
    if (i < 0 || !rt.audField) return 0;
    const d = rt.audField[i];
    return isFinite(d) ? 1 - U.smoothstep(0, AUDIBLE_CELLS, d) : 0;
  };

  /* ===================================================== line of sight / path */
  /** True when nothing solid (walls, closed door slabs) lies between the two points. Pits don't block. */
  W.lineOfSight = (ax, ay, bx, by, mapId) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return false;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    let cx = Math.floor(ax), cy = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx > 0 ? (cx + 1 - ax) * tdx : dx < 0 ? (ax - cx) * tdx : Infinity;
    let tmy = dy > 0 ? (cy + 1 - ay) * tdy : dy < 0 ? (ay - cy) * tdy : Infinity;
    let t = 0;
    for (let n = 0; n < 512; n++) {
      if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
      const i = cy * m.w + cx;
      if (m.wall[i] && n > 0) return false;
      const di = m.door[i];
      const tExit = Math.min(tmx, tmy, 1);
      if (di >= 0 && m.doors[di].open < 0.5) {
        const d = m.doors[di];
        const ts = d.axis === 'h' ? (dy !== 0 ? (cy + 0.5 - ay) / dy : -1) : (dx !== 0 ? (cx + 0.5 - ax) / dx : -1);
        if (ts >= t - 1e-9 && ts <= tExit + 1e-9 && ts >= 0 && ts <= 1) return false;
      }
      if (cx === tx && cy === ty) return true;
      if (tmx < tmy) { t = tmx; tmx += tdx; cx += stepX; } else { t = tmy; tmy += tdy; cy += stepY; }
      if (t > 1) return true;
    }
    return true;
  };
  /** Minimal binary heap keyed on f. */
  function heap() {
    const a = [], f = [];
    return {
      size: () => a.length,
      push(v, k) {
        a.push(v); f.push(k);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (f[p] <= f[i]) break;
          [a[p], a[i]] = [a[i], a[p]]; [f[p], f[i]] = [f[i], f[p]];
          i = p;
        }
      },
      pop() {
        const top = a[0], lv = a.pop(), lf = f.pop();
        if (a.length) {
          a[0] = lv; f[0] = lf;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let s = i;
            if (l < a.length && f[l] < f[s]) s = l;
            if (r < a.length && f[r] < f[s]) s = r;
            if (s === i) break;
            [a[s], a[i]] = [a[i], a[s]]; [f[s], f[i]] = [f[i], f[s]];
            i = s;
          }
        }
        return top;
      },
    };
  }
  /** Straight segment walkable for a body of radius r (walls/pits only — doors are opened on the way). */
  function segClear(m, ax, ay, bx, by, r) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / 0.12));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
      for (const [ox, oy] of [[-r, -r], [r, -r], [r, r], [-r, r]]) {
        const i = idxOf(m, x + ox, y + oy);
        if (i < 0 || m.solid[i]) return false;
      }
    }
    return true;
  }
  const PATH_BODY = 0.18;          // clearance a path keeps from solid props / trees (walker radius)
  // candidate standing spots inside a cell whose centre a solid prop covers, nearest the centre first
  const ANCHOR_OFFS = (() => {
    const o = [];
    for (let y = -0.3; y <= 0.3001; y += 0.1) for (let x = -0.3; x <= 0.3001; x += 0.1) if (Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6) o.push([+x.toFixed(2), +y.toFixed(2)]);
    return o.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  })();
  /**
   * Segment (ax, ay) → (bx, by) keeps a body of radius `r` clear of every circle in `cs`. A circle the
   * segment starts or ends inside only has to be left / approached, not crossed (a walker hugging the
   * chair can walk away from it; a goal on a prop — the chair itself — can be reached).
   */
  function circlesClearSeg(cs, ax, ay, bx, by, r) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (const o of cs) {
      const t = L2 > 1e-9 ? U.clamp(((o.x - ax) * dx + (o.y - ay) * dy) / L2, 0, 1) : 0;
      const d = Math.hypot(ax + dx * t - o.x, ay + dy * t - o.y);
      const need = Math.min(o.r + r, Math.hypot(ax - o.x, ay - o.y) - 1e-3, Math.hypot(bx - o.x, by - o.y) - 1e-3);
      if (d < need) return false;
    }
    return true;
  }
  /**
   * A* over the grid (8-way, no corner cutting; doors crossed along their axis). Closed unlocked
   * doors are passable (walkers open them); locked doors are not unless opts.locked.
   * Solid props, decor and trees are avoided: a cell whose centre a prop covers is crossed at a free
   * spot inside it (or not at all), and every leg keeps PATH_BODY clear of them. When the only route
   * runs through a prop (nothing else connects), the plain grid route is returned instead.
   * opts.props === false → ignore props (grid only, the pre-fix-d behaviour).
   * → [{x, y}, …] ending exactly at (bx, by), or null.
   */
  W.path = (ax, ay, bx, by, mapId, opts) => {
    const m = W.maps[mapId || W.mapId];
    if (!m) return null;
    const Wd = m.w, N = Wd * m.h;
    const s = idxOf(m, ax, ay), g = idxOf(m, bx, by);
    if (s < 0 || g < 0) return null;
    const pass = (i) => {
      if (m.solid[i]) return false;
      const di = m.door[i];
      if (di >= 0) { const d = m.doors[di]; if (d.static || (d.locked && !(opts && opts.locked))) return false; }
      return true;
    };
    if (!pass(g)) return null;
    if (s === g) return [{ x: bx, y: by }];
    const grid = opts && opts.props === false ? null : ensureSolids(m);
    // circles (props/trees) that can reach into cell i (3×3 neighbourhood; radii ≤ ~0.8)
    const nearC = new Map();
    const near = (i) => {
      let l = nearC.get(i);
      if (l) return l;
      l = [];
      if (grid && grid.size) {
        const x = i % Wd, y = (i / Wd) | 0;
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= Wd || yy >= m.h) continue;
          const c = grid.get(yy * Wd + xx);
          if (c) for (const o of c) l.push(o);
        }
      }
      nearC.set(i, l);
      return l;
    };
    const search = (useProps) => {
      // where a walker stands in each cell: the centre, or the free spot nearest it; null = no room
      const anchors = new Map();
      const anchor = (i) => {
        if (i === s) return { x: ax, y: ay };
        if (i === g) return { x: bx, y: by };
        let a = anchors.get(i);
        if (a !== undefined) return a;
        const cx = (i % Wd) + 0.5, cy = ((i / Wd) | 0) + 0.5;
        a = { x: cx, y: cy };
        const cs = useProps ? near(i) : null;
        if (cs && cs.length && !circlesClearSeg(cs, cx, cy, cx, cy, PATH_BODY)) {
          a = null;
          for (const [ox, oy] of ANCHOR_OFFS) {
            if (circlesClearSeg(cs, cx + ox, cy + oy, cx + ox, cy + oy, PATH_BODY)) { a = { x: cx + ox, y: cy + oy }; break; }
          }
        }
        anchors.set(i, a);
        return a;
      };
      const legOk = (i, j) => {
        if (!useProps) return true;
        const ci = near(i), cj = near(j);
        if (!ci.length && !cj.length) return true;
        const a = anchor(i), b = anchor(j);
        return circlesClearSeg(ci, a.x, a.y, b.x, b.y, PATH_BODY) && (cj === ci || circlesClearSeg(cj, a.x, a.y, b.x, b.y, PATH_BODY));
      };
      const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const gx = g % Wd, gy = (g / Wd) | 0;
      const hfn = (i) => { const x = i % Wd, y = (i / Wd) | 0, dx = Math.abs(x - gx), dy = Math.abs(y - gy); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
      const open = heap();
      gs[s] = 0;
      open.push(s, hfn(s));
      const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
      let found = false, guard = 0;
      while (open.size() && guard++ < N * 4) {
        const i = open.pop();
        if (closed[i]) continue;
        if (i === g) { found = true; break; }
        closed[i] = 1;
        const x = i % Wd, y = (i / Wd) | 0;
        const inDoor = m.door[i] >= 0 ? m.doors[m.door[i]].axis : null;
        for (const [dx, dy, c] of D8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= Wd || ny >= m.h) continue;
          const j = ny * Wd + nx;
          if (closed[j] || !pass(j)) continue;
          const toDoor = m.door[j] >= 0 ? m.doors[m.door[j]].axis : null;
          if (dx && dy) {
            if (inDoor || toDoor) continue;
            const a = y * Wd + nx, b = ny * Wd + x;
            if (!pass(a) || !pass(b) || m.door[a] >= 0 || m.door[b] >= 0) continue;
          }
          if ((inDoor === 'h' || toDoor === 'h') && dx) continue;
          if ((inDoor === 'v' || toDoor === 'v') && dy) continue;
          if (useProps && (!anchor(j) || !legOk(i, j))) continue;
          const ng = gs[i] + c;
          if (ng < gs[j]) { gs[j] = ng; came[j] = i; open.push(j, ng + hfn(j)); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let i = g; i !== -1 && i !== s; i = came[i]) cells.push(i);
      cells.reverse();
      // must-keep cells: door cells and their approach cells (so walkers go through doorways squarely)
      const keep = [];
      for (let k = 0; k < cells.length; k++) {
        if (m.door[cells[k]] >= 0) { keep.push(k); if (k > 0) keep.push(k - 1); if (k + 1 < cells.length) keep.push(k + 1); }
      }
      const pts = cells.map((i) => { const a = useProps ? anchor(i) : null; return a ? { x: a.x, y: a.y } : { x: (i % Wd) + 0.5, y: ((i / Wd) | 0) + 0.5 }; });
      pts[pts.length - 1] = { x: bx, y: by };
      // props along a straight leg: every solid circle within a cell of the leg's bounding box
      const segProps = (x0, y0, x1, y1) => {
        if (!useProps || !grid || !grid.size) return true;
        const cs = [];
        const minX = Math.max(0, Math.floor(Math.min(x0, x1)) - 1), maxX = Math.min(Wd - 1, Math.floor(Math.max(x0, x1)) + 1);
        const minY = Math.max(0, Math.floor(Math.min(y0, y1)) - 1), maxY = Math.min(m.h - 1, Math.floor(Math.max(y0, y1)) + 1);
        for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) { const c = grid.get(yy * Wd + xx); if (c) for (const o of c) cs.push(o); }
        return !cs.length || circlesClearSeg(cs, x0, y0, x1, y1, PATH_BODY);
      };
      // string-pulling
      const out = [];
      let cur = { x: ax, y: ay }, k = 0;
      while (k < pts.length) {
        let far = k;
        for (let j = k; j < pts.length; j++) {
          if (j > k && keep.some((q) => q >= k && q < j)) break;
          if (j === k || (segClear(m, cur.x, cur.y, pts[j].x, pts[j].y, 0.16) && segProps(cur.x, cur.y, pts[j].x, pts[j].y))) far = j; else break;
        }
        out.push(pts[far]);
        cur = pts[far];
        k = far + 1;
      }
      return out;
    };
    return (grid && grid.size ? search(true) : null) || search(false);
  };

  /* ================================================================ cameras */
  /** CCTV cameras from the cam_* points (angle in radians; z (mount height), pitch, fov added). */
  W.cameras = () => ['cam_1', 'cam_2', 'cam_3', 'cam_4'].map((id) => {
    const p = W.point(id);
    if (!p) return null;
    // mounted up by the ceiling, tilted down; the radio-room camera has a wide corner lens
    return { id, label: CAM_LABELS[id], map: p.map, x: p.x, y: p.y, angle: p.angle, deg: p.deg, z: id === 'cam_1' ? 0.85 : 0.8,
      pitch: id === 'cam_1' ? -0.18 : id === 'cam_4' ? -0.3 : -0.24, fov: id === 'cam_4' ? 100 : id === 'cam_3' ? 60 : 80 }; // cam_3: longer lens so the generator fills the frame
  }).filter(Boolean);

  /* ================================================================== props */
  const PROP_FIELDS = ['id', 'map', 'x', 'y', 'tex', 'scale', 'z', 'solid', 'radius', 'hidden', 'removed', 'frame', 'flip', 'alpha', 'added', 'angle', 'fullbright', 'emissive'];
  let propSeq = 0;
  function rebuildProps() {
    props.clear();
    const ov = S().props || {};
    for (const id in W.maps) {
      for (const p of W.maps[id].props) {
        const rec = Object.assign({}, p);
        if (ov[p.id]) Object.assign(rec, ov[p.id]);
        props.set(p.id, rec);
      }
    }
    for (const id in ov) if (!props.has(id) && ov[id].added) props.set(id, Object.assign({}, ov[id]));
    // load variance (never acknowledged): the chair is never quite where it was
    const ch = props.get('chair');
    if (ch) { ch.jx = rt.chairJ.x; ch.jy = rt.chairJ.y; ch.jflip = rt.chairJ.flip; }
    const lv = S().levers || {};
    for (const id in lv) { const p = props.get(id); if (p && !(ov[id] && ov[id].tex)) p.tex = lv[id] ? 'spr_lever_down' : 'spr_lever'; }
    rt.solidDirty = true;
  }
  function persistProp(rec) {
    const o = {};
    for (const k of PROP_FIELDS) if (rec[k] !== undefined) o[k] = rec[k];
    S().props[rec.id] = o;
    rt.solidDirty = true;
  }
  W.addProp = (p) => {
    const id = p.id || 'prop_' + ++propSeq + '_' + ((Math.random() * 1e6) | 0);
    const rec = Object.assign({ map: W.mapId || 'station', solid: false }, p, { id, added: true, removed: false });
    if (typeof p.at === 'string') {
      const pt = W.point(p.at);
      if (pt) { rec.x = pt.x; rec.y = pt.y; rec.map = pt.map; if (pt.z != null && p.z == null) rec.z = pt.z; }
      delete rec.at;
    }
    props.set(id, rec);
    persistProp(rec);
    return rec;
  };
  W.prop = (id) => props.get(id) || null;
  W.propsOn = (mapId) => [...props.values()].filter((p) => p.map === (mapId || W.mapId) && !p.removed);
  const withProp = (id, fn) => {
    const r = props.get(id);
    if (!r) return false;
    fn(r);
    persistProp(r);
    return true;
  };
  W.moveProp = (id, x, y, mapId) => withProp(id, (r) => { r.x = +x; r.y = +y; if (mapId) r.map = mapId; });
  W.setPropTex = (id, tex) => withProp(id, (r) => { r.tex = tex; });
  W.showProp = (id, on) => withProp(id, (r) => { r.hidden = on === false; if (on !== false) r.removed = false; });
  W.removeProp = (id) => withProp(id, (r) => { r.removed = true; });
  /** Move a prop to a named point; a point's optional `z` (surface height, e.g. pt_mug_kitchen) is applied too. */
  W.pointProp = (id, name) => {
    const p = W.point(name);
    if (!p) return false;
    const r = W.moveProp(id, p.x, p.y, p.map);
    if (p.z != null) W.setProp(id, { z: p.z });
    return r;
  };
  W.setProp = (id, patch) => withProp(id, (r) => { for (const k in patch || {}) if (PROP_FIELDS.includes(k) && k !== 'id') r[k] = patch[k]; });

  /* =================================================================== NPCs */
  function rebuildNpcs() { rt.npc = {}; }
  W.addNpc = (o) => {
    if (!o || !o.id) return null;
    let x = o.x, y = o.y, map = o.map || W.mapId || 'station', angle = o.angle || 0;
    const at = o.at || o.point;
    if (at) { const p = W.point(at); if (p) { x = p.x; y = p.y; map = p.map; angle = o.angle != null ? o.angle : p.deg; } }
    const rec = { id: o.id, map, x: +x, y: +y, tex: o.tex || 'spr_' + o.id, angle, frame: 4, hidden: false };
    if (o.scale != null) rec.scale = o.scale;
    S().npcs[o.id] = rec;
    return rec;
  };
  W.npc = (id) => S().npcs[id] || null;
  W.npcs = () => Object.values(S().npcs);
  W.stopNpc = (id) => {
    const w = rt.npc[id];
    delete rt.npc[id];
    const n = S().npcs[id];
    if (n) n.frame = 4;
    if (w && w.resolve) w.resolve(false);
  };
  W.removeNpc = (id) => { W.stopNpc(id); delete S().npcs[id]; };
  /** Walk an NPC through one or more named points (pathfinding, doors, frames, footsteps). */
  W.walkNpc = (id, targets, speed) => new Promise((res) => {
    const n = S().npcs[id];
    if (!n) { res(false); return; }
    const prev = rt.npc[id];
    if (prev && prev.resolve) prev.resolve(false);
    rt.npc[id] = { queue: [].concat(targets), path: null, pi: 0, speed: speed || 1.3, resolve: res, step: 0, anim: 0, target: null, wait: 0 };
  });
  function updateNpcs(dt) {
    for (const id of Object.keys(rt.npc)) {
      const w = rt.npc[id], n = S().npcs[id];
      if (!n) { delete rt.npc[id]; continue; }
      if (!w.path) {
        if (w.wait > 0) { w.wait = Math.max(0, w.wait - dt); continue; }
        if (!w.target && !w.queue.length) { delete rt.npc[id]; n.frame = 4; w.resolve(true); continue; }
        const t = w.target || w.queue.shift();
        const p = w.target || (typeof t === 'string' ? W.point(t) : t && isFinite(t.x) ? { map: t.map || n.map, x: t.x, y: t.y, angle: (t.angle || 0) * DEG, deg: t.angle || 0 } : null);
        if (!p) { console.warn('[world] walkNpc: unknown point', t); continue; }
        if (!w.target) w.targetName = typeof t === 'string' ? t : null;
        w.target = p;
        if (p.map !== n.map) { n.map = p.map; n.x = p.x; n.y = p.y; w.path = []; }
        else w.path = W.path(n.x, n.y, p.x, p.y, n.map);
        // A locked door can temporarily make a story route unreachable. Keep its target,
        // wait in place, and retry so unlocking the door resumes the same walk promise.
        if (!w.path) { n.frame = 4; n.moving = false; w.wait = 0.5; continue; }
        w.pi = 0;
      }
      const m = W.maps[n.map];
      const wp = w.path[w.pi];
      if (!wp || !m) {
        n.angle = w.target ? w.target.deg : n.angle;
        n.frame = 4;
        n.moving = false;
        DA.bus.emit('npc:arrive', { id, point: w.targetName });
        w.path = null; w.target = null;
        continue;
      }
      // doors: open the next door on the route, wait for it to swing
      let wait = false;
      for (let k = w.pi; k < Math.min(w.path.length, w.pi + 3); k++) {
        const q = w.path[k], i = idxOf(m, q.x, q.y);
        if (i < 0 || m.door[i] < 0) continue;
        const d = m.doors[m.door[i]];
        const dd = Math.hypot(q.x - n.x, q.y - n.y);
        if (dd < 1.7 && d.target === 0 && !d.locked && !d.static) openDoorRec(d, false, 'npc:' + id);
        if (dd < 0.75 && d.open < 0.8) wait = true;
        break;
      }
      const ci = idxOf(m, n.x, n.y);
      if (ci >= 0 && m.door[ci] >= 0 && m.doors[m.door[ci]].open < 0.8 && m.doors[m.door[ci]].target === 1) wait = true;
      if (wait) { n.frame = 4; n.moving = false; continue; }
      const dx = wp.x - n.x, dy = wp.y - n.y, d = Math.hypot(dx, dy), stepLen = w.speed * dt;
      const distance = Math.min(d, stepLen), samples = Math.max(1, Math.ceil(distance / 0.1));
      let blocked = false;
      for (let k = 1; k <= samples; k++) {
        const f = d > 1e-4 ? distance * k / samples / d : 1;
        const i = idxOf(m, n.x + dx * f, n.y + dy * f);
        if (i < 0 || m.solid[i] || (m.door[i] >= 0 && m.doors[m.door[i]].open < 0.8)) { blocked = true; break; }
      }
      if (blocked) { w.path = null; w.wait = 0.5; n.frame = 4; n.moving = false; continue; }
      if (d <= stepLen || d < 1e-4) { n.x = wp.x; n.y = wp.y; w.pi++; }
      else { n.x += (dx / d) * stepLen; n.y += (dy / d) * stepLen; n.angle = Math.atan2(dy, dx) / DEG; }
      n.moving = true;
      w.anim += stepLen;
      n.frame = Math.floor(w.anim / 0.3) % 4;
      w.step += stepLen;
      if (w.step >= 0.72) {
        w.step = 0;
        if (n.map === W.mapId) {
          const fi = idxOf(m, n.x, n.y);
          audio('play', 'footstep_other', { x: n.x, y: n.y, surface: FOOT_SURFACE[texName(fi >= 0 ? m.floor[fi] : 0)] || 'concrete', vol: 0.8 });
        }
      }
    }
  }

  /* ======================================================== sprite provider */
  function spr(o) { for (const k in o) if (o[k] === undefined) delete o[k]; return o; }
  function spriteProvider(mapId, opts) {
    const out = [];
    const m = W.maps[mapId];
    if (!m) return out;
    for (const d of m.decor) out.push(spr({ x: d.x, y: d.y, tex: d.tex, scale: d.scale, z: d.z, frame: d.frame || 0, flip: !!d.flip }));
    for (const p of props.values()) {
      if (p.map !== mapId || p.hidden || p.removed || !p.tex) continue;
      out.push(spr({ x: p.x + (p.jx || 0), y: p.y + (p.jy || 0), tex: p.tex, scale: p.scale, z: p.z, frame: p.frame || 0,
        flip: !!p.flip !== !!p.jflip, alpha: p.alpha, fullbright: p.fullbright, emissive: p.emissive, id: p.id }));
    }
    const viewer = (opts && (opts.cam || opts.camera)) || (mapId === W.mapId ? P : null);
    for (const id in S().npcs) {
      const n = S().npcs[id];
      if (n.map !== mapId || n.hidden) continue;
      let frame = n.frame == null ? 4 : n.frame;
      if (viewer && n.angle != null) {
        const hx = Math.cos(n.angle * DEG), hy = Math.sin(n.angle * DEG), vx = n.x - viewer.x, vy = n.y - viewer.y, vl = Math.hypot(vx, vy) || 1;
        if ((hx * vx + hy * vy) / vl > 0.3) frame = frame >= 4 ? 9 : frame + 5; // walking away: back view
      }
      out.push(spr({ x: n.x, y: n.y, tex: n.tex, scale: n.scale, frame, id: n.id, npc: true }));
    }
    return out;
  }
  W.sprites = (mapId, opts) => spriteProvider(mapId || W.mapId, opts);

  /* ============================================================== mutations */
  function setMutation(name, on) {
    const muts = S().mutations;
    if (!!muts[name] === on) return false;
    if (on) muts[name] = true; else delete muts[name];
    const defs = (DA.maps && DA.maps.defs) || {};
    const ids = Object.keys(defs).filter((id) => defs[id].mutations && defs[id].mutations[name]);
    if (name === 'abandoned') {
      if (!ids.includes('station')) ids.push('station');
      abandonedState(on);
    }
    for (const id of ids) recompileMap(id);
    if (name === 'abandoned') W.setDaylight(on ? 1 : 0);
    rt.ambDirty = true;
    DA.bus.emit('mutation', { name, on });
    return true;
  }
  /** 2049: rusted car, Hollis long gone, the storm long over. */
  function abandonedState(on) {
    const pc = S().props.player_car || {};
    S().props.player_car = Object.assign(pc, { id: 'player_car', tex: on ? 'spr_car_rusted' : 'spr_car' });
    if (on) S().props.hollis_car = Object.assign(S().props.hollis_car || {}, { id: 'hollis_car', removed: true });
    // nobody is coming to relieve anyone in 2049: the day operator's car stays out of the lot
    if (on) S().props.replacement_car = Object.assign(S().props.replacement_car || {}, { id: 'replacement_car', hidden: true });
    const w = S().weather;
    if (on) { w.preAbandoned = { baseRain: w.baseRain, thunder: w.thunder }; w.baseRain = 0.05; w.rain = 0.05; w.thunder = 0; }
    else if (w.preAbandoned) { w.baseRain = w.preAbandoned.baseRain; w.thunder = w.preAbandoned.thunder; w.rain = U.clamp(w.baseRain * rt.rainVar, 0, 1); delete w.preAbandoned; }
  }
  W.applyMutation = (name) => setMutation(name, true);
  W.revertMutation = (name) => setMutation(name, false);
  W.hasMutation = (name) => !!(S() && S().mutations && S().mutations[name]);

  /* ============================================================ explore mode */
  function toggleFlashlight() {
    if (!DA.hasItem('flashlight')) return;
    S().flashlight = !S().flashlight;
    P.flashlight = !!S().flashlight;
    audio('play', 'switch', { vol: 0.45 });
  }
  function pressUse() {
    if (rt.hideAnim || rt.travelling) return;
    updateFocus();
    const it = rt.focus;
    if (!it) return;
    if (it.kind === 'door') {
      const d = findDoor(it.door || it.id);
      if (d && d.lockableInside && !d.locked && d.open < 0.05 && playerInside(d)) {
        // tap = open, hold = lock (resolved in update / key release)
        rt.eHeld = true; rt.eTarget = it; rt.eT = 0; rt.eDone = false;
        return;
      }
    }
    IX.fire(it);
  }
  const exploreMode = {
    lock: true,
    enter() { rt.promptShown = undefined; },
    exit() { ui('prompt', null); rt.promptShown = null; rt.eHeld = false; rt.eTarget = null; },
    cover(on) {
      if (on) { ui('prompt', null); rt.promptShown = null; rt.eHeld = false; rt.eTarget = null; }
      else rt.promptShown = undefined;
    },
    update(dt, isTop) {
      if (!isTop || !DA.running) return;
      if (rt.eHeld && rt.eTarget && !rt.eDone) {
        rt.eT += dt;
        if (rt.eT >= 0.45) { rt.eDone = true; IX.fire(rt.eTarget, { lock: true }); }
      }
      updateFocus();
    },
    onKey(e, down) {
      if (!DA.running) return false;
      const c = e.code;
      if (!down) {
        if (c === 'KeyE') {
          const t = rt.eTarget, done = rt.eDone;
          rt.eHeld = false; rt.eTarget = null; rt.eDone = false;
          if (t && !done) IX.fire(t);
          return true;
        }
        return false;
      }
      if (e.repeat && /^(KeyE|KeyF|KeyC|KeyT|Tab|Escape)$/.test(c)) return true;
      switch (c) {
        case 'KeyE': pressUse(); return true;
        case 'Space': if (P.hidden) { exitHide(); return true; } return false;
        case 'KeyF': toggleFlashlight(); return true;
        case 'KeyC': if (!P.hidden) W.setCrouch(!P.crouching); return true;
        case 'KeyT': ui('toggleWatch'); return true;
        case 'Tab': ui('journal'); return true;
        case 'Escape': if (DA.modes.defs.pause && !DA.modes.has('pause')) DA.modes.push('pause'); return true;
        default: return false;
      }
    },
    onMouseDown(e) {
      if (!DA.running || e.button !== 0 || !(DA.input && DA.input.locked)) return false;
      if (rt.hideAnim || rt.travelling) return true;
      updateFocus();
      if (rt.focus) IX.fire(rt.focus);
      return true;
    },
  };

  /* ================================================================ system */
  function worldUpdate(dt) {
    if (!rt.ready || !W.map) return;
    rt.time += dt;
    updatePlayer(dt);
    for (const id in W.maps) updateDoors(W.maps[id], dt);
    updateNpcs(dt);
    updateLights(W.map, dt);
    rt.otherLightT -= dt;
    if (rt.otherLightT <= 0) { // other maps (CCTV views) at 4 Hz
      rt.otherLightT = 0.25;
      for (const id in W.maps) if (id !== W.mapId) updateLights(W.maps[id], 0.25);
    }
    updateRoomAndTriggers();
    updateWeather(dt);
    rt.histT -= dt;
    if (rt.histT <= 0) { rt.histT += 1; recordHistory(); }
    rt.ambT -= dt;
    if (rt.ambDirty || rt.ambT <= 0) { rt.ambT = 0.5; rt.ambDirty = false; updateAmbience(false); }
    P.flashlight = !!S().flashlight && DA.hasItem('flashlight');
    audio('listener', P.x, P.y, P.angle, W.mapId);
  }
  W.update = worldUpdate;
  W.compile = (id) => (id ? recompileMap(id) : rebuildAll());
  W.texName = texName;
  W.debugInfo = () => ({
    map: W.mapId, x: +P.x.toFixed(2), y: +P.y.toFixed(2), deg: Math.round(P.angle / DEG), room: W.room(), focus: rt.focus && rt.focus.id,
    hidden: S().hidden, power: W.powerRaw(), mutations: Object.keys(S().mutations), audibility: +W.radioAudibility().toFixed(2),
  });

  /* ============================================================= lifecycle */
  function resetRuntime() {
    for (const id in rt.npc) { const w = rt.npc[id]; if (w && w.resolve) try { w.resolve(false); } catch (e) { /* ignore */ } }
    Object.assign(rt, {
      focus: null, promptShown: undefined, lastRoom: null, history: [], histT: 0, lightningT: U.rand(12, 35), vx: 0, vy: 0,
      eye: EYE.stand, bobPhase: 0, bobAmp: 0, strideAcc: 0, hideAnim: null, hideSpot: null, travelling: false, frozen: false,
      lookAt: null, eHeld: false, eTarget: null, eDone: false, lastAmb: '', ambDirty: true, npc: {}, flash: 0, portalInside: false,
      solidDirty: true, audDirty: true, audField: null, lastCreak: -1,
    });
    rt.triggers.clear();
    rt.trigFired.clear();
    Object.assign(P, { hidden: false, running: false, crouching: false, noise: 0, bob: 0, pitch: 0 });
  }
  function restorePlayer() {
    const s = S();
    P.x = +s.x || 0; P.y = +s.y || 0; P.angle = +s.angle || 0; P.pitch = +s.pitch || 0;
    P.crouching = !!s.crouch;
    rt.eye = P.crouching ? EYE.crouch : EYE.stand;
    P.flashlight = !!s.flashlight && DA.hasItem('flashlight');
    if (s.hidden) {
      const f = findInteractable(s.hidden);
      if (f && f.it.kind === 'hide') {
        const pos = f.it.pos || { x: P.x, y: P.y, angle: P.angle / DEG };
        rt.hideSpot = { it: f.it, x: pos.x, y: pos.y, angle: (pos.angle || 0) * DEG, eye: pos.eye || (/desk/.test(f.it.id) ? 0.19 : 0.3) };
        P.hidden = true; P.x = pos.x; P.y = pos.y; rt.eye = rt.hideSpot.eye;
      } else { s.hidden = null; s.hideFrom = null; }
    }
    if (!P.hidden) ensureFree();
  }
  function onNew() {
    DA.state.world = defaultState();
    resetRuntime();
    rt.rainVar = 1;
    rt.chairJ = { x: 0, y: 0, flip: false };
    rebuildAll();
    const a = W.point('pt_arrive') || { map: 'station', x: 30, y: 30, angle: -Math.PI / 2 };
    setCurrentMap(a.map);
    P.x = a.x; P.y = a.y; P.angle = a.angle; P.pitch = 0;
    ensureFree();
    syncState();
    rt.ready = true;
    updateLights(W.map, 0);
    updateAmbience(true);
    DA.bus.emit('world:ready', { mapId: W.mapId, fresh: true });
  }
  function onLoad() {
    normaliseState();
    resetRuntime();
    // load variance (never acknowledged): rain a little heavier or lighter, the chair not quite where it was
    rt.rainVar = 1 + (DA.variant('rain') - 0.5) * 0.3;
    const w = S().weather;
    if (w.baseRain == null) w.baseRain = w.rain == null ? 0.85 : w.rain;
    w.rain = U.clamp(w.baseRain * rt.rainVar, 0, 1);
    const cv = DA.variant('chair');
    rt.chairJ = { x: (cv - 0.5) * 0.2, y: (DA.variant('chair:y') - 0.5) * 0.12, flip: cv > 0.8 };
    rebuildAll();
    restorePlayer();
    syncState();
    rt.ready = true;
    updateLights(W.map, 0);
    updateAmbience(true);
    DA.bus.emit('world:ready', { mapId: W.mapId, fresh: false });
  }
  DA.bus.on('boot', () => {
    DA.modes.register('explore', exploreMode);
    registerKinds();
    if (DA.render && typeof DA.render.addSpriteProvider === 'function') {
      try { DA.render.addSpriteProvider(spriteProvider); } catch (e) { console.error('[world] addSpriteProvider', e); }
    }
    DA.addSystem('world', { update: worldUpdate, order: 10 });
  });
  DA.bus.on('game:new', onNew);
  DA.bus.on('game:load', onLoad);
  // the rack's amber readouts (emissiveCircuits radio_console → 'radio') die with the receiver switch
  DA.bus.on('radio:power', (e) => { if (DA.running && S().power) { W.setPower('radio', !!(e && e.on)); W.applyRadioFaces(); } });
  DA.bus.on('game:ready', () => {
    const rs = DA.state.radio;
    if (S().power) { const want = !(rs && rs.power === false); if (W.power('radio') !== want) W.setPower('radio', want); W.applyRadioFaces(); }
  });
  DA.bus.on('game:ready', () => {
    if (rt.ready) { if (!!DA.flag('photo_four') !== !!S().mutations.photo_four) setMutation('photo_four', !!DA.flag('photo_four')); return; }
    normaliseState();
    rebuildAll();
    restorePlayer();
    rt.ready = true;
  });
  DA.bus.on('game:quit', () => {
    rt.ready = false; rt.promptShown = null; ui('prompt', null);
    // the world stops owning the soundscape: no array drone / generator / hum left under the title
    audio('ambience', { rain: 0.6, indoor: true, wind: 0.3, thunder: 0, hum: 0, drone: 0, heartbeat: 0, generator: 'off', genDist: 0, birds: false, daylight: false, room: 'small' });
  });
  DA.bus.on('runtime:reset', () => { rt.travelling = false; rt.npc = {}; });
  DA.bus.on('archive:collect', () => { if (rt.ready) syncState(); });
  // keep world-owned state in step with devices (they write DA.state.world too)
  DA.bus.on('lever', (e) => {
    if (!e || !e.id || !rt.ready) return;
    S().levers[e.id] = !!e.on;
    const p = props.get(e.id);
    if (p) { p.tex = e.on ? 'spr_lever_down' : 'spr_lever'; persistProp(p); }
  });
  DA.bus.on('vent:open', (e) => { if (e && e.id && rt.ready) S().opened[e.id] = true; });
  // PLAN §4 A2.1: the radio sets mug_on_desk when you sit down with the mug → the world prop appears
  // beside the receiver (pt_mug_radio). Later moves (mug_moved → kitchen) are the director's.
  DA.bus.on('flag', (e) => {
    if (!e || !rt.ready) return;
    if (e.key === 'mug_on_desk' && e.value && props.get('mug')) {
      W.pointProp('mug', 'pt_mug_radio');
      W.showProp('mug', true);
    }
    // the staff photo on the kitchen wall follows photo_four (same picture DA.devices.photo shows)
    if (e.key === 'photo_four') setMutation('photo_four', !!e.value);
  });
  DA.bus.on('breaker:reset', (e) => {
    if (!e || !e.id || !rt.ready) return;
    S().breakers[e.id] = true;
    if (e.id === 'C' && !S().power.corridor) W.setPower('corridor', true);
  });
})();
