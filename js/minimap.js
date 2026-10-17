/* DEAD AIR — minimap.js
 * DA.minimap — the station's official floor plan (drawn 1978, rev. 4) carried in the corner of
 * the eye, the full sheet on M, and the operator's own pencil sketch of everything the drawing
 * leaves out.
 *
 * ---------------------------------------------------------------- WHAT IT DOES
 *  • CORNER MINIMAP (#mm-mini in #hud, bottom-right, 22u circle): a fragment of the blueprint,
 *    rotating with the player (player-up; an 'N' tick rides the rim), ~9 cells to the rim. Walls,
 *    doors (open/shut as you last SAW them — see below), windows, stairs / ladders / hatches, fixed equipment,
 *    upright small-caps room labels, the player's white arrowhead, the amber objective diamond
 *    (clamped to the rim with an arrow when out of range; on another map it points at the way
 *    there — 'STAIR ↓', 'HATCH ↓'…). Shown only while 'explore' is the top mode and a game runs
 *    (CSS on body[data-mode]); hidden on the title, under title cards (body.ui-card-on) and fades
 *    (no redraws then either). While main power is off (the dark; not the daylit 2049 station)
 *    it dims to 40% under a red emergency cast (.mm-dark; the ink inside the rim is multiplied
 *    red where red emergency lamps light the map — station, sub-level — and just darkened on maps
 *    without them, e.g. the array; the objective diamond keeps its amber). It all but goes out (.mm-hush, 16%) while the
 *    duty is LISTEN. and while the entity is hunting / stalking / searching — or, in the dark,
 *    walking — within 10 u (off again past 12 u, held 2.5 s).
 *    DA.settings.minimap (default on); Shift+M toggles it (the Shift state is taken from the M
 *    keydown event, so a quick chord never opens the plan instead); a MINIMAP row is injected into
 *    the settings screen on 'settings:open' (ui.js is not edited; ui's selection index is kept in
 *    step through its own hover handler). Clicking its OFF sets off, ON sets on, the rest of the
 *    row flips it; ← / A = OFF, → / D = ON, Enter / Space flips.
 *  • FULL PLAN (M while exploring): mode 'plan' — free cursor, NOT opaque, NOT blocksWorld: the
 *    world keeps running while you stand there reading a map in the dark. North-up sheet with a
 *    title block, revisions, key, YOU ARE HERE + facing arrow (clamped with an arrow when you are
 *    off the sheet), the objective (+ its text) and your pencil sketch. The station set has two
 *    sheets, by design: GROUND FLOOR (building + lot, larger scale) while you and the objective are
 *    in that frame, else the SITE PLAN (the whole drawn site: lot, drive, county road, the woods
 *    edge). SUB-LEVEL and ROOF are one sheet each; the array / relay maps get squared paper stamped
 *    NO DRAWING ON FILE. The sheet (126u × 78u) hangs from the top of the stage so the subtitle
 *    band stays clear. The side column's CURRENT OBJECTIVE block always keeps room for three lines
 *    + VIA + YOU: on small sheets the revision table drops its oldest rows (then goes), and longer
 *    objective text is clamped with '…' — it never overprints the revisions. M / Esc / E / Tab or
 *    a click folds it away; ~10 s after folding, the full-size sheet canvases are released.
 *  • DOORS AS LAST SEEN: the map never shows a door's live state, only how you last saw it (in line
 *    of sight and in view, or within arm's reach). The director's "a door you shut is open" beat
 *    and the entity's walks through the building do not reach the map until you look.
 *  • THE PLAN IS THE 1978 DRAWING, NOT THE BUILDING. Ink comes from DA.maps.defs (original grid +
 *    legend): reserved blocks are drawn as solid wall, the relay steel door is plain wall, mutations
 *    are ignored — when the corridor grows or a hallway appears, the drawing does not change and
 *    your arrow walks through drawn walls. Where there is no drawing on file (the array, the relay
 *    map, the woods, mutated regions) the sheet shows PENCIL: floor cells you have actually seen
 *    (≤5 cells, line of sight, every 0.25 s), graphite, hand-jittered. Persisted per map as a
 *    base64 bitset in DA.state.minimap.seen[mapId].
 *  • Horror: rising DA.v('instability') makes the sheet flicker/offset for a frame now and then;
 *    in the ACT 5 collapse (flag collapse or DA.state.world.blend > 0.05) the drawing jitters,
 *    labels scramble or swap, and your arrow is in two or three places at once; in the 2049 wake-up
 *    (mutation / map variant 'abandoned') the sheet is yellowed and water-stained. The entity and
 *    NPCs are never drawn (an objective NPC is only a diamond); the relay chamber is never inked.
 *
 * ---------------------------------------------------------------- API (DA.minimap)
 *   setTarget(objId, target)   extend / override the objective → marker table (for the director).
 *        target: interactable id ('radio_desk') | {npc:'hollis', fallback:<target>} |
 *        {point:'pt_name'} | {x, y, map} | {nearest:[interactable ids], skip:(id) => bool} |
 *        fn(objective) → any of these | null (explicitly: no marker for this objective).
 *        setTarget(objId) with no second argument removes the override again.
 *        Rules: the newest open objective decides (the order they were set, saved with the game).
 *        obj_listen / obj_hide (the dark) silence the marker outright while newest; glitch:true
 *        objectives and the other silenced lines (obj_check_log obj_generator_dont
 *        obj_generator_already) are skipped — the next newest open objective counts, e.g.
 *        obj_flashlight → the workbench under 'DO NOT INVESTIGATE BACKUP GENERATOR.' (the plan's
 *        CURRENT OBJECTIVE shows that one too). An id mapped to null, or an unknown id, is still
 *        the current objective but has no marker ('NO MARK ON THIS SHEET').
 *        Built in beyond the design table (mundane duties the director added later; override or
 *        silence them with setTarget(id, null)): obj_standby obj_warn_bridge obj_warn_fire
 *        obj_at_time → radio_desk, obj_flashlight → workbench, obj_signout → signin_sheet.
 *        Layout-drift duties (obj_check_hall, obj_check_newhall) deliberately have no marker.
 *   open() / close() / isOpen()          the full plan (mode 'plan'; open() only from 'explore';
 *                                        when it refuses, DA.minimap.refused says why)
 *   toggle(on?) → bool                   DA.settings.minimap (saved); emits 'minimap:toggle' {on}
 *   target() → {obj, x, y, map, label, via} | null      the marker as currently resolved
 *   seen(mapId?) → cells seen on that map · seenAt(x, y, mapId?) → bool
 *   redraw() → ms                        force a corner redraw now (tests / screenshots)
 *   invalidate()                         drop every cached layer (rebuilt lazily)
 *   info() → {on, visible, map, planOpen, seen, target, palette, redraws, avgMs, maxMs, lastMs,
 *             dark, red, hushed, hush: 'listen'|'entity'|null, opacity (computed, mid-transition too)}
 * Events: 'minimap:toggle' {on} · 'plan:open' {map} · 'plan:close'
 * State:  DA.state.minimap = {v: 1, seen: {mapId: base64 bitset (row-major cells, LSB first; maps
 *         with nothing seen are omitted)}, doors: {mapId: {doorId: 0|1}} (as last seen),
 *         seq: {objId: n}, seqN} (plain JSON; seen / doors are written on 'archive:collect', seq as
 *         objectives are set)
 * Setting: DA.settings.minimap (set to true at boot when absent; on unless === false)
 *   _debug / _drawOnly() / _drawPlanOnly()   tests only
 * Reads (null-guarded): DA.world.power('main'), DA.entity.active/mode/distance, DA.state.objectives.
 * Load order: after ui.js (index.html puts it right before director.js). Never calls other modules
 * at load time; everything is null-guarded and read-only toward them (the only writes are
 * DA.state.minimap, DA.settings.minimap via DA.saveSettings, its own DOM, mode 'plan', system
 * 'minimap' (order 75) and one row it adds to ui.js's settings list).
 * Ink geometry: walls are drawn thin on the wall-cell centre lines (poché + outline), so every
 * room reads half a cell larger than its floor; only the wall "skin" next to a space is inked
 * (deep rock stays paper), reserved blocks and small enclosed masses are solid and hatched.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const MM = (DA.minimap = DA.minimap || {});

  /* ================================================================ constants */
  const TAU = Math.PI * 2;
  const VIEW_R = 9;                 // cells from the centre to the rim
  const REDRAW_EVERY = 1 / 20;      // ≤ 20 Hz
  const SEEN_R = 5, SEEN_EVERY = 0.25;
  const DEPTH = { roof: 1, station: 0, relay: 0, basement: -1, array: -2 };
  const NO_DRAWING = { array: true, relay: true };
  /** map → {neighbour map: interactable that leads there} */
  const LINKS = {
    station: { basement: 'stairs_down', roof: 'roof_ladder', relay: 'relay_door' },
    basement: { station: 'stairs_up', array: 'array_hatch' },
    array: { basement: 'array_ladder' },
    roof: { station: 'roof_hatch' },
    relay: { station: 'relay_exit' },
  };
  const LINK_LABEL = {
    stairs_down: 'STAIR ↓', stairs_up: 'STAIR ↑', array_hatch: 'HATCH ↓', array_ladder: 'LADDER ↑',
    roof_ladder: 'LADDER ↑', roof_hatch: 'HATCH ↓', relay_door: 'STEEL DOOR', relay_exit: 'EXIT',
  };
  /**
   * Objectives that never carry the marker. DARK ones (the dark: LISTEN. / Hide.) end the search —
   * no waypoint at all while they are the newest duty. The rest (the log reveal, the generator
   * trickery lines) are skipped like glitch objectives: the next newest open duty keeps its marker
   * (e.g. 'Take the flashlight…' → the workbench under 'DO NOT INVESTIGATE BACKUP GENERATOR.').
   */
  const SILENT = new Set(['obj_check_log', 'obj_hide', 'obj_generator_dont', 'obj_generator_already', 'obj_listen']);
  const SILENT_DARK = new Set(['obj_hide', 'obj_listen']);
  const LIMITERS = ['limiter_1', 'limiter_2', 'limiter_3'];
  const TARGETS = {
    obj_power_on: 'radio_desk', // 'Switch the receiver back on.'
    obj_go_inside: 'front_door',
    obj_follow_hollis: { npc: 'hollis' },
    obj_coffee: 'coffee_machine',
    obj_radio_check: 'radio_desk', obj_trucker: 'radio_desk', obj_police: 'radio_desk', obj_isolate: 'radio_desk',
    obj_call_dispatch: 'radio_desk', obj_monitor: 'radio_desk', obj_log_traffic: 'radio_desk', obj_maintain: 'radio_desk',
    obj_hold_signal: 'radio_desk',
    obj_weather: 'weather_mast', obj_weather_hourly: 'weather_mast',
    obj_breaker: 'breaker_panel',
    obj_calendar: 'desk_calendar', obj_check_date: 'desk_calendar',
    obj_paperwork: 'office_desk',
    obj_find_kestrel: 'wall_map',
    obj_vent: 'vent_basement',
    obj_generator: 'generator',
    obj_control: 'control_door',
    obj_array: 'array_hatch',
    obj_report: 'report',
    obj_destroy: 'control_console', obj_overload: 'control_console',
    obj_limiters: { nearest: LIMITERS, skip: (id) => { const w = DA.state && DA.state.world; return !!(w && w.levers && w.levers[id]); } },
    obj_escape: 'car', obj_leave: 'car',
    obj_open: 'relay_door', obj_relay: 'relay_door',
    obj_amplify: 'relay_console',
    obj_handover: { npc: 'replacement', fallback: 'front_door' },
    // later additions to the director (mundane tasks only; layout-drift beats stay unmarked)
    obj_standby: 'radio_desk', obj_warn_bridge: 'radio_desk', obj_warn_fire: 'radio_desk', obj_at_time: 'radio_desk',
    obj_flashlight: 'workbench', obj_signout: 'signin_sheet',
  };
  const overrides = Object.create(null);

  /* drawing classes (from the ORIGINAL grid) */
  const C_NONE = 0, C_IN = 1, C_OUT = 2, C_WALL = 3, C_WIN = 4, C_DOOR = 5, C_FIX = 6, C_TREE = 7, C_FENCE = 8, C_THIN = 9, C_PIT = 10;
  const X_GROUND = 1, X_GRAVEL = 2, X_DRIVE = 3, X_ROAD = 4, X_PORCH = 5, X_DECK = 6;
  const FIXTURES = {
    rack_server: 'rack', shelf_supplies: 'shelf', shelf_tapes: 'shelf', generator: 'gen', fuel_tank: 'tank', pipes: 'pipes',
    antenna_console: 'console', radio_console: 'console', concrete_ext: 'housing', reels: 'shelf',
  };
  /** wall faces drawn as fixed equipment / joinery along the wall (depth in cells) */
  const FURN = {
    radio_console: 0.46, cctv_bank: 0.4, kitchen_counter: 0.42, workbench: 0.44, filing_cabinet: 0.34, bookcase: 0.3,
    antenna_console: 0.44, terminal_tape: 0.38, fridge: 0.44, shelf_supplies: 0.34, breaker_panel: 0.16,
  };
  /** 1978 drawing vocabulary */
  const ROOM_LABELS = {
    radio: 'RADIO ROOM', office: 'OFFICE', kitchen: 'MESS', equipment: 'EQUIPMENT', storage: 'STORES', bathroom: 'W.C.',
    workshop: 'WORKSHOP', records: 'RECORDS', stairs: 'STAIR', lobby: 'LOBBY', hall: 'CORRIDOR',
    b_stairs: 'STAIR', b_hall: 'CORRIDOR', generator: 'GENERATOR', vent: 'BOILER RM.', control: 'ANTENNA CONTROL', roof: 'ROOF',
  };
  /** outdoor places, for the plan's 'YOU:' line */
  const PLACE_NAMES = { lot: 'PARKING', road: 'COUNTY ROUTE 9', forest: 'THE WOODS', woods: 'THE WOODS', outside: 'SITE', roof: 'ROOF' };
  const ROOM_NO = {
    lobby: '100', radio: '101', office: '102', kitchen: '103', equipment: '104', storage: '105', stairs: '106', bathroom: '107',
    workshop: '108', records: '109', hall: 'C-1', b_stairs: '106', b_hall: 'C-2', generator: 'B-01', vent: 'B-02', control: 'B-03',
  };
  /** label anchor overrides (cell units) where a centroid would sit on fixtures */
  const LABEL_AT = {
    station: { equipment: [41.9, 13.5], storage: [42.5, 17.55], stairs: [36.95, 17.55] },
    basement: { control: [14.5, 16.3], b_stairs: [23.1, 5.6] },
  };
  const EXTRA_LABELS = {
    station: [
      { text: 'PARKING', ext: X_GRAVEL, dy: 1.2 }, { text: 'COUNTY ROUTE 9', ext: X_ROAD },
      { text: 'MAST', x: 39.5, y: 2.95, small: true }, { text: 'WOODS', x: 4.8, y: 24.5, small: true, faint: true },
      { text: 'WOODS', x: 55.2, y: 29.5, small: true, faint: true }, { text: 'WOODS', x: 22, y: 3.1, small: true, faint: true },
    ],
    roof: [{ text: 'ROOF', x: 6.9, y: 5.1, room: 'roof' }, { text: 'WX MAST', x: 10.5, y: 2.35, small: true }, { text: 'TOWER', x: 11.4, y: 8.1, small: true }],
  };
  const SHEETS = {
    station: { title: 'GROUND FLOOR', sheet: '2 OF 4', dwg: 'RS14-A-101', short: 'GROUND FL.', scale: '1/8" = 1\'-0"' },
    'station:site': { title: 'SITE PLAN', sheet: '1 OF 4', dwg: 'RS14-A-100', short: 'GROUND FL.', scale: '1" = 20\'-0"' },
    basement: { title: 'SUB-LEVEL', sheet: '3 OF 4', dwg: 'RS14-A-102', short: 'SUB-LEVEL', scale: '1/8" = 1\'-0"' },
    roof: { title: 'ROOF', sheet: '4 OF 4', dwg: 'RS14-A-103', short: 'ROOF', scale: '1/8" = 1\'-0"' },
  };
  const PENCIL_NOTE = { array: 'UNDER ANTENNA CONTROL', relay: 'NOT ON THE DRAWINGS', 'station:woods': 'THE WOODS PAST THE ROAD' };
  const REVISIONS = [['4', '11/91', 'EQUIP. RM. RACKS'], ['3', '06/83', 'RECORDS RM.'], ['2', '02/79', 'AS BUILT'], ['1', '09/78', 'ISSUED FOR CONSTR.']];

  /* palettes: blue = the cyanotype; aged = the same sheet in 2049; graph = squared paper + graphite */
  const PALS = {
    blue: {
      name: 'blue', graph: false, g0: 'rgba(22, 62, 108, 0.9)', g1: 'rgba(9, 30, 62, 0.93)', sheet0: '#17457c', sheet1: '#0c2c57',
      line: 'rgba(222, 243, 255, 0.95)', soft: 'rgba(205, 233, 252, 0.62)', faint: 'rgba(196, 228, 252, 0.3)',
      poche: 'rgba(170, 214, 245, 0.36)', hatch: 'rgba(214, 238, 255, 0.4)', fill: 'rgba(190, 228, 255, 0.05)',
      grid: 'rgba(176, 216, 248, 0.085)', gridMajor: 'rgba(176, 216, 248, 0.16)',
      text: 'rgba(232, 246, 255, 0.97)', dim: 'rgba(200, 228, 250, 0.66)', halo: 'rgba(12, 38, 72, 0.92)',
      pencil: 'rgba(236, 226, 200, 0.92)', pencilSoft: 'rgba(230, 220, 196, 0.26)', you: '#ffffff', youEdge: 'rgba(3, 14, 32, 0.95)',
      obj: '#ffb347', objText: '#ffb347', objEdge: 'rgba(48, 22, 0, 0.9)', rim: 'rgba(206, 236, 255, 0.8)', rimDark: 'rgba(3, 12, 26, 0.9)',
      stamp: 'rgba(255, 128, 104, 0.62)', speck: [230, 245, 255], speckDark: [0, 10, 30], crease: 'rgba(230, 245, 255, 0.07)',
    },
    aged: { // the same cyanotype seventy years on: the paper yellowed to ochre, the ink faded to a brown-cyan
      name: 'aged', graph: false, g0: 'rgba(132, 114, 70, 0.9)', g1: 'rgba(84, 70, 40, 0.93)', sheet0: '#8c7b4c', sheet1: '#5c4f2e',
      line: 'rgba(226, 232, 214, 0.86)', soft: 'rgba(214, 222, 200, 0.52)', faint: 'rgba(210, 216, 192, 0.26)',
      poche: 'rgba(200, 210, 190, 0.22)', hatch: 'rgba(220, 226, 206, 0.3)', fill: 'rgba(236, 226, 190, 0.04)',
      grid: 'rgba(222, 214, 176, 0.07)', gridMajor: 'rgba(222, 214, 176, 0.12)',
      text: 'rgba(240, 236, 216, 0.94)', dim: 'rgba(228, 222, 196, 0.64)', halo: 'rgba(82, 68, 38, 0.9)',
      pencil: 'rgba(40, 32, 20, 0.72)', pencilSoft: 'rgba(40, 32, 20, 0.2)', you: '#fffaf0', youEdge: 'rgba(34, 24, 10, 0.95)',
      obj: '#ffb347', objText: '#ffc46a', objEdge: 'rgba(48, 22, 0, 0.9)', rim: 'rgba(236, 226, 190, 0.75)', rimDark: 'rgba(36, 28, 14, 0.9)',
      stamp: 'rgba(150, 50, 30, 0.6)', speck: [255, 240, 200], speckDark: [70, 44, 12], crease: 'rgba(255, 240, 200, 0.07)', aged: true,
    },
    graph: {
      name: 'graph', graph: true, g0: 'rgba(150, 146, 128, 0.92)', g1: 'rgba(104, 100, 86, 0.94)', sheet0: '#b3ad97', sheet1: '#8f8a76',
      line: 'rgba(40, 40, 38, 0.9)', soft: 'rgba(40, 40, 38, 0.5)', faint: 'rgba(40, 40, 38, 0.25)',
      poche: 'rgba(40, 40, 38, 0.2)', hatch: 'rgba(40, 40, 38, 0.3)', fill: 'rgba(0, 0, 0, 0.02)',
      grid: 'rgba(52, 104, 98, 0.2)', gridMajor: 'rgba(52, 104, 98, 0.36)',
      text: 'rgba(30, 30, 28, 0.92)', dim: 'rgba(30, 30, 28, 0.72)', halo: 'rgba(170, 164, 144, 0.9)',
      pencil: 'rgba(30, 30, 29, 0.82)', pencilSoft: 'rgba(30, 30, 29, 0.2)', you: '#fbfaf5', youEdge: 'rgba(20, 20, 18, 0.95)',
      // objText: amber lettering dark enough to read on the squared paper (~5:1); obj stays the diamond fill
      obj: '#c86a0c', objText: 'rgb(110, 45, 0)', objEdge: 'rgba(40, 18, 0, 0.95)', rim: 'rgba(52, 52, 48, 0.85)', rimDark: 'rgba(20, 20, 18, 0.9)', youText: 'rgba(24, 24, 22, 0.95)',
      stamp: 'rgba(150, 36, 28, 0.68)', speck: [255, 255, 245], speckDark: [40, 36, 26], crease: 'rgba(40, 36, 26, 0.08)',
    },
  };
  const FONT_UI = '"IBM Plex Mono", "Courier New", monospace';
  const FONT_TYPE = '"Special Elite", "DA Type Fallback", "Courier New", monospace';
  const DASH_ROAD = [0.45, 0.35], DASH_ARC = [0.08, 0.07], DASH_NONE = [], DASH_HATCH = [0.1, 0.08];

  /* ================================================================ helpers */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const errSeen = new Set();
  function report(tag, e) {
    const k = tag + ':' + (e && e.message);
    if (errSeen.has(k)) return;
    errSeen.add(k);
    console.error('[minimap:' + tag + ']', e);
  }
  /** deterministic 0..1 from two ints (no allocation) */
  function hr(a, b) {
    let t = (Math.imul(a | 0, 374761393) + Math.imul((b | 0) + 1, 668265263)) | 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    t ^= t >>> 16;
    return (t >>> 0) / 4294967296;
  }
  const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const DX4 = [0, 1, 0, -1], DY4 = [-1, 0, 1, 0];
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const settingOn = () => !(DA.settings && DA.settings.minimap === false);
  const world = () => DA.world || null;
  const curMap = () => { const w = DA.world; return (w && w.map) || null; };
  const curMapId = () => { const w = DA.world; return (w && w.mapId) || null; };
  const player = () => { const w = DA.world; return (w && w.player) || null; };
  const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const hasLS = (() => { try { return 'letterSpacing' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();
  function spacing(ctx, px) { if (hasLS) { ctx.letterSpacing = px > 0 ? px.toFixed(2) + 'px' : '0px'; ctx.__mmLS = null; } }
  /** letter spacing without reading it back (the getter allocates a string every call) */
  function setLS(ctx, str) { if (hasLS && ctx.__mmLS !== str) { ctx.letterSpacing = str; ctx.__mmLS = str; } }
  function isAbandoned() {
    const w = DA.world;
    if (!w) return false;
    try { if (w.hasMutation && w.hasMutation('abandoned')) return true; } catch (e) { /* ignore */ }
    return !!(w.map && w.map.variant === 'abandoned');
  }
  function collapseLevel() {
    const w = DA.state && DA.state.world;
    const b = w ? +w.blend || 0 : 0;
    if (DA.flag && DA.flag('collapse')) return Math.max(0.35, clamp(b * 1.6, 0, 1));
    return b > 0.05 ? clamp(b * 1.6, 0.2, 1) : 0;
  }
  const instability = () => (DA.v ? +DA.v('instability') || 0 : 0);

  /* ============================================================ map analysis */
  const analyses = Object.create(null);
  function analysis(id) {
    if (!id) return null;
    if (id in analyses) return analyses[id];
    let A = null;
    try { A = analyse(id); } catch (e) { report('analyse', e); A = null; }
    analyses[id] = A;
    return A;
  }
  /** Everything the drawing needs, from the ORIGINAL definition (mutations ignored). */
  function analyse(id) {
    const defs = DA.maps && DA.maps.defs;
    const def = defs && defs[id];
    if (!def || !Array.isArray(def.grid) || !def.grid.length) return null;
    const h = def.grid.length, w = def.grid[0].length, N = w * h;
    const legend = def.legend || {};
    const cls = new Uint8Array(N), ext = new Uint8Array(N), winSmall = new Uint8Array(N), doorAxis = new Uint8Array(N), reserved = new Uint8Array(N);
    const fix = new Array(N).fill(null), roomAt = new Array(N).fill('');
    for (let y = 0; y < h; y++) {
      const row = String(def.grid[y] || '');
      for (let x = 0; x < w; x++) {
        const i = y * w + x, lg = legend[row[x]] || { wall: 'missing', solid: true };
        if (lg.reserved) reserved[i] = 1;
        let c = C_NONE;
        if (lg.door) c = C_DOOR;
        else if (lg.pit) c = C_PIT;
        else if (lg.wall) {
          const wt = String(lg.wall);
          if (wt === 'trees') c = C_TREE;
          else if (wt === 'fence') c = C_FENCE;
          else if (lg.overlay && /window/.test(lg.overlay)) { c = C_WIN; if (/small/.test(lg.overlay)) winSmall[i] = 1; }
          else if (wt === 'stall') c = C_THIN;
          else if (FIXTURES[wt]) { c = C_FIX; fix[i] = FIXTURES[wt]; }
          else c = C_WALL;
        } else {
          const room = lg.room || '';
          const outdoor = lg.outdoor != null ? !!lg.outdoor : lg.ceil == null;
          roomAt[i] = room;
          if (room === 'forest' || room === 'woods') c = C_NONE;
          else if (outdoor) {
            c = C_OUT;
            const fl = lg.floor || '';
            ext[i] = room === 'road' ? X_ROAD : fl === 'ground_asphalt' ? X_DRIVE : fl === 'ground_gravel' ? X_GRAVEL
              : fl === 'floor_concrete' ? X_PORCH : (fl === 'roof_tar' || fl === 'hatch') ? X_DECK : X_GROUND;
          } else c = C_IN;
        }
        cls[i] = c;
      }
    }
    const A = { id, name: def.name || id, w, h, cls, ext, winSmall, doorAxis, fix, roomAt, reserved, drawn: !NO_DRAWING[id] };
    A.skin = wallSkin(A);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cls[y * w + x]);
    const floorish = (c) => c === C_IN || c === C_OUT;
    // ---- doors
    A.doors = [];
    for (const d of def.doors || []) {
      if (!d || d.x < 0 || d.y < 0 || d.x >= w || d.y >= h) continue;
      const i = d.y * w + d.x;
      if (cls[i] !== C_DOOR) continue;
      doorAxis[i] = d.axis === 'v' ? 2 : 1;
      const g = doorGeom(d, (x, y) => at(x, y), (x, y) => roomAt[y * w + x] || '');
      g.open0 = d.open ? 1 : 0;   // as the drawing has it (what the map shows until you have seen the door)
      A.doors.push(g);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cls[i] !== C_DOOR || doorAxis[i]) continue;
      const wl = (c) => c === C_WALL || c === C_WIN || c === C_THIN;
      doorAxis[i] = wl(at(x - 1, y)) || wl(at(x + 1, y)) ? 1 : 2;
    }
    // ---- stairs / ladders / hatches (from interactables of kind stairs|ladder)
    A.syms = [];
    for (const it of def.interact || []) {
      if (!it || (it.kind !== 'stairs' && it.kind !== 'ladder')) continue;
      const down = DEPTH[it.to] != null && DEPTH[id] != null ? DEPTH[it.to] < DEPTH[id] : false;
      if (it.side && DIRS[it.side]) A.syms.push({ kind: it.kind === 'stairs' ? 'stair' : 'ladder', x: Math.floor(it.x), y: Math.floor(it.y), dx: DIRS[it.side][0], dy: DIRS[it.side][1], down, id: it.id });
      else A.syms.push({ kind: 'hatch', x: +it.x, y: +it.y, down, id: it.id });
    }
    // ---- joinery along walls
    A.furn = [];
    for (const f of def.faces || []) {
      if (!f || f.x < 0 || f.y < 0 || f.x >= w || f.y >= h || !DIRS[f.side]) continue;
      const base = String(f.tex || '').split('+')[0];
      const depth = FURN[base];
      if (!depth) continue;
      const c = cls[f.y * w + f.x];
      if (c !== C_WALL && c !== C_WIN) continue;
      const [dx, dy] = DIRS[f.side];
      if (!floorish(at(f.x + dx, f.y + dy))) continue;
      A.furn.push({ x: f.x, y: f.y, dx, dy, depth, kind: base });
    }
    // ---- fixtures: connected same-kind cells → rectangles
    A.fixtures = [];
    const done = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (cls[i] !== C_FIX || done[i]) continue;
      const kind = fix[i];
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      const stack = [i];
      done[i] = 1;
      while (stack.length) {
        const j = stack.pop(), x = j % w, y = (j / w) | 0;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX4[k], ny = y + DY4[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!done[n] && cls[n] === C_FIX && fix[n] === kind) { done[n] = 1; stack.push(n); }
        }
      }
      A.fixtures.push({ kind, x0, y0, x1: x1 + 1, y1: y1 + 1 });
    }
    // ---- site symbols from props
    A.siteSyms = [];
    for (const p of def.props || []) {
      if (!p || !p.id) continue;
      const kind = p.id === 'mast' || p.id === 'roof_mast' ? 'mast' : p.id === 'tower' ? 'tower' : p.id === 'lamp_post' ? 'lamp' : p.id === 'station_sign' ? 'sign' : null;
      if (kind) A.siteSyms.push({ kind, x: +p.x, y: +p.y });
    }
    // ---- labels
    A.labels = [];
    const acc = Object.create(null);
    for (let i = 0; i < N; i++) {
      if (cls[i] !== C_IN || !roomAt[i]) continue;
      const r = roomAt[i];
      const a = acc[r] || (acc[r] = { sx: 0, sy: 0, n: 0, cells: [] });
      a.sx += (i % w) + 0.5; a.sy += ((i / w) | 0) + 0.5; a.n++; a.cells.push(i);
    }
    const lat = LABEL_AT[id] || {};
    for (const r in acc) {
      const text = ROOM_LABELS[r];
      if (!text) continue;
      const a = acc[r];
      let x = a.sx / a.n, y = a.sy / a.n;
      if (lat[r]) { x = lat[r][0]; y = lat[r][1]; }
      else {
        let best = -1, bd = Infinity;
        for (const j of a.cells) { const dx = (j % w) + 0.5 - x, dy = ((j / w) | 0) + 0.5 - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = j; } }
        if (best >= 0 && bd > 0.3) { x = (best % w) + 0.5; y = ((best / w) | 0) + 0.5; }
      }
      A.labels.push(mkLabel(text, x, y, { room: r, no: ROOM_NO[r] }));
    }
    for (const e of EXTRA_LABELS[id] || []) {
      let x = e.x, y = e.y;
      if (e.ext) {
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < N; i++) if (cls[i] === C_OUT && ext[i] === e.ext) { sx += (i % w) + 0.5; sy += ((i / w) | 0) + 0.5; n++; }
        if (!n) continue;
        x = sx / n; y = sy / n + (e.dy || 0);
      }
      A.labels.push(mkLabel(e.text, x, y, { small: !!e.small, faint: !!e.faint, outdoor: true, room: e.room || '' }));
    }
    // ---- bounds of everything walkable in the drawing (+ the woods), padded
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cls[y * w + x];
      if (c === C_IN || c === C_OUT || c === C_DOOR || (c === C_NONE && roomAt[y * w + x])) {
        if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y;
      }
    }
    if (bx1 < 0) { bx0 = 0; by0 = 0; bx1 = w - 1; by1 = h - 1; }
    A.bounds = { x0: Math.max(0, bx0 - 1), y0: Math.max(0, by0 - 1), x1: Math.min(w, bx1 + 2), y1: Math.min(h, by1 + 2) };
    // the drawn site (what the 1978 sheet covers) and the woods beyond it (pencil / squared paper)
    let sx0 = w, sy0 = h, sx1 = -1, sy1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cls[y * w + x];
      if (c === C_IN || c === C_OUT || c === C_DOOR) { if (x < sx0) sx0 = x; if (y < sy0) sy0 = y; if (x > sx1) sx1 = x; if (y > sy1) sy1 = y; }
    }
    if (sx1 < 0) A.site = A.bounds;
    else {
      // widen to the woods alongside the drawn rows (the trail that leaves the NW corner)
      for (let y = sy0; y <= sy1; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] === C_NONE && roomAt[i] && legendWalk(legend, def.grid[y][x])) { if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; }
      }
      A.site = { x0: Math.max(0, sx0 - 1), y0: Math.max(0, sy0 - 1), x1: Math.min(w, sx1 + 2), y1: Math.min(h, sy1 + 2) };
    }
    let wx0 = w, wy0 = h, wx1 = -1, wy1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x >= A.site.x0 && x < A.site.x1 && y >= A.site.y0 && y < A.site.y1) continue;
      if (cls[y * w + x] !== C_NONE || !legendWalk(legend, def.grid[y][x])) continue;
      if (x < wx0) wx0 = x; if (y < wy0) wy0 = y; if (x > wx1) wx1 = x; if (y > wy1) wy1 = y;
    }
    A.woods = wx1 < 0 || !A.drawn ? null : { x0: Math.max(0, wx0 - 1), y0: Math.max(0, Math.min(wy0, A.site.y1) - 1), x1: Math.min(w, wx1 + 2), y1: Math.min(h, wy1 + 2) };
    return A;
  }
  /**
   * Which wall cells the drawing inks: the skin next to any space (8-neighbour), reserved blocks
   * (drawn solid), and small enclosed masses (a stair shaft). Deep rock / earth stays blank paper.
   */
  function wallSkin(A) {
    const { w, h, cls, reserved } = A, N = w * h, skin = new Uint8Array(N);
    const wallc = (c) => c === C_WALL || c === C_THIN;
    const solidc = (c) => c === C_WALL || c === C_THIN || c === C_WIN || c === C_TREE || c === C_FENCE;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!wallc(cls[i])) continue;
      if (reserved[i]) { skin[i] = 1; continue; }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!solidc(cls[ny * w + nx])) near = true;
      }
      if (near) skin[i] = 1;
    }
    // small enclosed masses are solid construction, not earth
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || skin[i] || !wallc(cls[i])) continue;
      const comp = [i], stack = [i];
      seen[i] = 1;
      let border = false;
      while (stack.length && comp.length < 40) {
        const j = stack.pop(), x = j % w, y = (j / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX4[k], ny = y + DY4[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!seen[n] && !skin[n] && wallc(cls[n])) { seen[n] = 1; comp.push(n); stack.push(n); }
        }
      }
      if (!border && !stack.length && comp.length <= 12) for (const j of comp) skin[j] = 1;
    }
    return skin;
  }
  function legendWalk(legend, ch) { const lg = legend[ch]; return !!lg && !lg.wall && !lg.pit && !lg.solid && !lg.door; }
  /** is the player on this drawn map but off its sheet (the deep woods)? */
  function offSite(A) {
    const P = player();
    if (!A || !A.woods || !P || curMapId() !== A.id) return false;
    const S = A.site;
    return P.x < S.x0 || P.x >= S.x1 || P.y < S.y0 || P.y >= S.y1;
  }
  function mkLabel(text, x, y, o) {
    const split = !(o && o.outdoor) && text.length > 11 && text.indexOf(' ') > 0;
    const lines = split ? [text.slice(0, text.indexOf(' ')), text.slice(text.indexOf(' ') + 1)] : [text];
    return Object.assign({ text, lines, x, y, scr: null, scrLines: null }, o || {});
  }
  /** Door symbol geometry: hinge on one jamb, leaf 0.5 cells, swings into the 'inside'. */
  function doorGeom(d, clsAt, roomOf) {
    const axis = d.axis === 'v' ? 'v' : 'h';
    let inside = d.inside;
    if (!inside || (axis === 'h' && inside !== 'n' && inside !== 's') || (axis === 'v' && inside !== 'e' && inside !== 'w')) {
      const cand = axis === 'h' ? ['s', 'n'] : ['w', 'e'];
      const ok = (sd) => { const [dx, dy] = DIRS[sd], c = clsAt(d.x + dx, d.y + dy); return c === C_IN || c === C_OUT || c === C_NONE; };
      inside = cand.find((sd) => ok(sd) && roomOf(d.x + DIRS[sd][0], d.y + DIRS[sd][1]) !== 'hall') || cand.find(ok) || cand[1];
    }
    let hx, hy, a0, a1;
    if (axis === 'h') { hx = d.x + 0.25; hy = d.y + 0.5; a0 = 0; a1 = inside === 'n' ? -Math.PI / 2 : Math.PI / 2; }
    else { hx = d.x + 0.5; hy = d.y + 0.25; a0 = Math.PI / 2; a1 = inside === 'w' ? Math.PI : 0; }
    return { id: d.id, x: d.x, y: d.y, axis, hx, hy, a0, a1, len: 0.5, stat: !!d.static, pencil: false, open0: 0 };
  }

  /* ============================================================ ink (the 1978 drawing) */
  /** Wall geometry as rectangles in cell units: thin walls on the wall-cell centre lines. */
  function wallRects(A, t, thinT) {
    const { w, h, cls, doorAxis, winSmall, skin } = A;
    const R = [], Q = [];
    const cAt = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      const c = cls[y * w + x];
      return (c === C_WALL || c === C_THIN) && !skin[y * w + x] ? -1 : c;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = cls[i];
      if (c === C_WIN && winSmall[i]) {
        const horiz = isWallish(cAt(x - 1, y)) || isWallish(cAt(x + 1, y));
        const hh = t / 2;
        if (horiz) R.push(x, y + 0.5 - hh, 0.25, t, x + 0.75, y + 0.5 - hh, 0.25, t);
        else R.push(x + 0.5 - hh, y, t, 0.25, x + 0.5 - hh, y + 0.75, t, 0.25);
        continue;
      }
      if ((c !== C_WALL && c !== C_THIN) || !skin[i]) continue;
      const tt = c === C_THIN ? thinT : t, hh = tt / 2, cx = x + 0.5, cy = y + 0.5;
      R.push(cx - hh, cy - hh, tt, tt);
      for (let k = 0; k < 4; k++) {
        const dx = DX4[k], dy = DY4[k], nc = cAt(x + dx, y + dy);
        let len = 0;
        if (nc === C_WALL || nc === C_WIN || nc === C_THIN) len = 0.5;
        else if (nc === C_DOOR) {
          const ax = doorAxis[(y + dy) * w + x + dx];
          if ((ax === 1 && dy === 0) || (ax === 2 && dx === 0)) len = 0.75;
        }
        if (!len) continue;
        if (dx) R.push(dx > 0 ? cx : cx - len, cy - hh, len, tt);
        else R.push(cx - hh, dy > 0 ? cy : cy - len, tt, len);
      }
    }
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (cls[i] === C_WALL && cls[i + 1] === C_WALL && cls[i + w] === C_WALL && cls[i + w + 1] === C_WALL && skin[i] && skin[i + 1] && skin[i + w] && skin[i + w + 1]) Q.push(x + 0.5, y + 0.5, 1, 1);
    }
    return { R, Q };
  }
  function isWallish(c) { return c === C_WALL || c === C_WIN || c === C_THIN || c === C_DOOR; }
  function rectPath(c, arr, grow) {
    for (let k = 0; k < arr.length; k += 4) c.rect(arr[k] - grow, arr[k + 1] - grow, arr[k + 2] + grow * 2, arr[k + 3] + grow * 2);
  }

  /**
   * Render the drawing (transparent) for a whole map at s px per cell. plan=true adds the fine
   * detail that only reads at sheet scale (door swings, gravel stipple, stair treads text-free).
   */
  function renderInk(A, s, pal, plan) {
    if (!A || !A.drawn) return null;
    const cv = mkCanvas(A.w * s, A.h * s), c = cv.getContext('2d');
    const px = 1 / s;
    const lw = Math.max(px * (plan ? 1.1 : 1), plan ? 0.055 : 0.07);   // main line
    const lt = Math.max(px * 0.8, plan ? 0.032 : 0.045);                // thin line
    const t = plan ? 0.24 : 0.3, thinT = t * 0.5;
    const { w, h, cls, ext } = A;
    const cAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cls[y * w + x]);
    const eAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cls[y * w + x] === C_OUT ? ext[y * w + x] : 0);
    c.scale(s, s);
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    // ---- 1. building interior: a whisper of tone so inside reads against outside
    c.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cls[y * w + x] === C_IN) c.rect(x - 0.5, y - 0.5, 2, 2);
    c.fillStyle = pal.fill;
    c.fill();
    // ---- 2. site: road, drive, gravel lot, porch, tree line, fence
    c.strokeStyle = pal.soft;
    c.lineWidth = lt;
    c.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = eAt(x, y);
      if (e !== X_ROAD && e !== X_DRIVE && e !== X_PORCH) continue;
      for (let k = 0; k < 4; k++) {
        const dx = DX4[k], dy = DY4[k], n = cAt(x + dx, y + dy), ne = eAt(x + dx, y + dy);
        if (n === -1 || n === C_TREE) continue;
        if (e === X_PORCH ? ne === X_PORCH || isWallish(n) : ne === X_ROAD || ne === X_DRIVE || ne === X_GRAVEL || ne === X_PORCH) continue;
        edgeTo(c, x, y, k);
      }
    }
    c.stroke();
    // road centre line (dashed) between two road rows
    c.beginPath();
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) if (eAt(x, y) === X_ROAD && eAt(x, y + 1) === X_ROAD) { c.moveTo(x, y + 1); c.lineTo(x + 1, y + 1); }
    c.setLineDash(DASH_ROAD);
    c.strokeStyle = pal.faint;
    c.stroke();
    c.setLineDash(DASH_NONE);
    // gravel: dashed boundary + stipple
    c.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (eAt(x, y) !== X_GRAVEL) continue;
      for (let k = 0; k < 4; k++) {
        const n = cAt(x + DX4[k], y + DY4[k]), ne = eAt(x + DX4[k], y + DY4[k]);
        if (ne === X_GRAVEL || ne === X_DRIVE || ne === X_ROAD || ne === X_PORCH || isWallish(n)) continue;
        edgeTo(c, x, y, k);
      }
    }
    c.setLineDash(DASH_HATCH);
    c.strokeStyle = pal.faint;
    c.stroke();
    c.setLineDash(DASH_NONE);
    c.fillStyle = pal.faint;
    const dot = Math.max(px * 1.1, 0.05);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (eAt(x, y) !== X_GRAVEL) continue;
      const i = y * w + x, n = plan ? 4 : 2;
      for (let k = 0; k < n; k++) c.fillRect(x + 0.1 + hr(i, k * 2) * 0.8, y + 0.1 + hr(i, k * 2 + 1) * 0.8, dot, dot);
    }
    // tree line: scallops along cleared ground that meets the woods
    c.beginPath();
    const sr = 0.25;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cls[y * w + x] !== C_OUT) continue;
      for (let k = 0; k < 4; k++) {
        const n = cAt(x + DX4[k], y + DY4[k]);
        if (n !== C_NONE && n !== C_TREE) continue;
        const dx = DX4[k], dy = DY4[k];
        const base = Math.atan2(dy, dx);
        // the edge between this cell and the woods, two bumps bulging into the trees
        const ex = x + 0.5 + dx * 0.5, ey = y + 0.5 + dy * 0.5;
        const tx = -dy, ty = dx;
        for (let b = -1; b <= 1; b += 2) {
          const mx = ex + tx * 0.25 * b, my = ey + ty * 0.25 * b;
          c.moveTo(mx + Math.cos(base - Math.PI / 2) * sr, my + Math.sin(base - Math.PI / 2) * sr);
          c.arc(mx, my, sr, base - Math.PI / 2, base + Math.PI / 2);
        }
      }
    }
    c.strokeStyle = pal.soft;
    c.lineWidth = lt;
    c.stroke();
    // fence
    c.beginPath();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cls[y * w + x] !== C_FENCE) continue;
      const cx = x + 0.5, cy = y + 0.5;
      let any = false;
      for (let k = 0; k < 4; k++) if (cAt(x + DX4[k], y + DY4[k]) === C_FENCE) { any = true; c.moveTo(cx, cy); c.lineTo(cx + DX4[k] * 0.5, cy + DY4[k] * 0.5); }
      if (!any) { c.moveTo(cx - 0.3, cy); c.lineTo(cx + 0.3, cy); }
      const xs = 0.09;
      c.moveTo(cx - xs, cy - xs); c.lineTo(cx + xs, cy + xs); c.moveTo(cx + xs, cy - xs); c.lineTo(cx - xs, cy + xs);
    }
    c.strokeStyle = pal.soft;
    c.stroke();
    // ---- 3. fixed equipment + joinery (under the walls)
    c.beginPath();
    for (const f of A.fixtures) fixturePath(c, f);
    for (const f of A.furn) furnPath(c, f, t);
    c.strokeStyle = pal.soft;
    c.lineWidth = lt;
    c.stroke();
    // ---- 4. walls: outline (grown union) → cut → poché
    const { R, Q } = wallRects(A, t, thinT);
    c.beginPath();
    rectPath(c, R, lw);
    rectPath(c, Q, lw);
    c.fillStyle = pal.line;
    c.fill();
    c.beginPath();
    rectPath(c, R, 0);
    rectPath(c, Q, 0);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = pal.poche;
    c.fill();
    if (Q.length) { // solid masses (reserved construction, shafts): 45° hatch
      c.save();
      c.beginPath();
      rectPath(c, Q, 0);
      c.clip();
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let k = 0; k < Q.length; k += 4) { bx0 = Math.min(bx0, Q[k]); by0 = Math.min(by0, Q[k + 1]); bx1 = Math.max(bx1, Q[k] + Q[k + 2]); by1 = Math.max(by1, Q[k + 1] + Q[k + 3]); }
      const step = Math.max(px * 4.5, 0.2);
      c.beginPath();
      for (let d = bx0 + by0 - (by1 - by0); d < bx1 + by1; d += step) { c.moveTo(d - by0, by0); c.lineTo(d - by1, by1); }
      c.strokeStyle = pal.hatch;
      c.lineWidth = lt;
      c.stroke();
      c.restore();
    }
    // ---- 5. windows: the break in the wall — frame lines + glass
    c.beginPath();
    const glass = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cls[i] !== C_WIN) continue;
      const horiz = isWallish(cAt(x - 1, y)) || isWallish(cAt(x + 1, y));
      const a = A.winSmall[i] ? 0.25 : 0, hh = t / 2;
      if (horiz) {
        c.moveTo(x + a, y + 0.5 - hh); c.lineTo(x + 1 - a, y + 0.5 - hh);
        c.moveTo(x + a, y + 0.5 + hh); c.lineTo(x + 1 - a, y + 0.5 + hh);
        glass.push(x + a, y + 0.5, x + 1 - a, y + 0.5);
      } else {
        c.moveTo(x + 0.5 - hh, y + a); c.lineTo(x + 0.5 - hh, y + 1 - a);
        c.moveTo(x + 0.5 + hh, y + a); c.lineTo(x + 0.5 + hh, y + 1 - a);
        glass.push(x + 0.5, y + a, x + 0.5, y + 1 - a);
      }
    }
    c.strokeStyle = pal.soft;
    c.lineWidth = lt;
    c.stroke();
    c.beginPath();
    for (let k = 0; k < glass.length; k += 4) { c.moveTo(glass[k], glass[k + 1]); c.lineTo(glass[k + 2], glass[k + 3]); }
    c.strokeStyle = pal.line;
    c.lineWidth = lt;
    c.stroke();
    // ---- 6. door swings (sheet only; the leaves are live)
    if (plan) {
      c.beginPath();
      for (const d of A.doors) {
        const sx = d.hx + Math.cos(d.a0) * d.len, sy = d.hy + Math.sin(d.a0) * d.len;
        c.moveTo(sx, sy);
        c.arc(d.hx, d.hy, d.len, d.a0, d.a1, d.a1 < d.a0);
      }
      c.setLineDash(DASH_ARC);
      c.strokeStyle = pal.faint;
      c.lineWidth = lt;
      c.stroke();
      c.setLineDash(DASH_NONE);
    }
    // ---- 7. stairs, ladders, hatches, site symbols
    c.beginPath();
    for (const sy of A.syms) symPath(c, sy, t, plan);
    for (const st of A.siteSyms) sitePath(c, st);
    c.strokeStyle = pal.line;
    c.lineWidth = lt;
    c.stroke();
    // stair arrows (solid heads)
    c.fillStyle = pal.line;
    for (const sy of A.syms) if (sy.kind === 'stair') stairArrowHead(c, sy, t);
    // ---- 8. 2049: the sheet has been rained on
    if (pal.aged) stains(c, A, s);
    return cv;
  }
  function edgeTo(c, x, y, k) {
    // the side k (0 n, 1 e, 2 s, 3 w) of cell (x, y)
    if (k === 0) { c.moveTo(x, y); c.lineTo(x + 1, y); }
    else if (k === 1) { c.moveTo(x + 1, y); c.lineTo(x + 1, y + 1); }
    else if (k === 2) { c.moveTo(x, y + 1); c.lineTo(x + 1, y + 1); }
    else { c.moveTo(x, y); c.lineTo(x, y + 1); }
  }
  function fixturePath(c, f) {
    const ins = 0.12, x0 = f.x0 + ins, y0 = f.y0 + ins, x1 = f.x1 - ins, y1 = f.y1 - ins, W_ = x1 - x0, H_ = y1 - y0;
    if (f.kind === 'tank') {
      const r = Math.min(W_, H_) / 2;
      if (W_ >= H_) { c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.arc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2); c.lineTo(x0 + r, y1); c.arc(x0 + r, y0 + r, r, Math.PI / 2, Math.PI * 1.5); }
      else { c.moveTo(x1, y0 + r); c.lineTo(x1, y1 - r); c.arc(x0 + r, y1 - r, r, 0, Math.PI); c.lineTo(x0, y0 + r); c.arc(x0 + r, y0 + r, r, Math.PI, TAU); }
      return;
    }
    c.rect(x0, y0, W_, H_);
    const long = W_ >= H_;
    if (f.kind === 'rack') {
      // one boxed X per cabinet
      const n = Math.max(1, Math.round(long ? f.x1 - f.x0 : f.y1 - f.y0));
      for (let k = 0; k < n; k++) {
        const a0 = k / n, a1 = (k + 1) / n;
        const ax = long ? x0 + W_ * a0 : x0, ay = long ? y0 : y0 + H_ * a0, bx = long ? x0 + W_ * a1 : x1, by = long ? y1 : y0 + H_ * a1;
        if (k) { if (long) { c.moveTo(ax, y0); c.lineTo(ax, y1); } else { c.moveTo(x0, ay); c.lineTo(x1, ay); } }
        c.moveTo(ax, ay); c.lineTo(bx, by);
      }
    } else if (f.kind === 'shelf') {
      if (long) { c.moveTo(x0, (y0 + y1) / 2); c.lineTo(x1, (y0 + y1) / 2); } else { c.moveTo((x0 + x1) / 2, y0); c.lineTo((x0 + x1) / 2, y1); }
    } else if (f.kind === 'console') {
      if (long) { c.moveTo(x0, y0 + H_ * 0.38); c.lineTo(x1, y0 + H_ * 0.38); } else { c.moveTo(x0 + W_ * 0.38, y0); c.lineTo(x0 + W_ * 0.38, y1); }
    } else if (f.kind === 'gen') {
      const r = Math.min(W_, H_) * 0.32, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, TAU);
      c.moveTo(x0, y0); c.lineTo(x1, y1);
    } else if (f.kind === 'pipes') {
      if (long) { c.moveTo(x0, y0 + H_ / 3); c.lineTo(x1, y0 + H_ / 3); c.moveTo(x0, y0 + 2 * H_ / 3); c.lineTo(x1, y0 + 2 * H_ / 3); }
      else { c.moveTo(x0 + W_ / 3, y0); c.lineTo(x0 + W_ / 3, y1); c.moveTo(x0 + 2 * W_ / 3, y0); c.lineTo(x0 + 2 * W_ / 3, y1); }
    } else if (f.kind === 'housing') {
      c.moveTo(x0, y0); c.lineTo(x1, y1); c.moveTo(x1, y0); c.lineTo(x0, y1);
    }
  }
  function furnPath(c, f, t) {
    // a counter / bench against the drawn wall face of cell (x, y), facing (dx, dy)
    const hh = t / 2, d = f.depth;
    if (f.dy) {
      const fy = f.y + 0.5 + f.dy * hh, y0 = f.dy > 0 ? fy : fy - d;
      c.rect(f.x + 0.04, y0, 0.92, d);
      if (f.kind === 'radio_console' || f.kind === 'antenna_console') { c.moveTo(f.x + 0.04, y0 + d * (f.dy > 0 ? 0.55 : 0.45)); c.lineTo(f.x + 0.96, y0 + d * (f.dy > 0 ? 0.55 : 0.45)); }
    } else {
      const fx = f.x + 0.5 + f.dx * hh, x0 = f.dx > 0 ? fx : fx - d;
      c.rect(x0, f.y + 0.04, d, 0.92);
      if (f.kind === 'radio_console' || f.kind === 'antenna_console') { c.moveTo(x0 + d * (f.dx > 0 ? 0.55 : 0.45), f.y + 0.04); c.lineTo(x0 + d * (f.dx > 0 ? 0.55 : 0.45), f.y + 0.96); }
    }
  }
  /** stair flight / ladder / hatch symbol (no text — labels are drawn on the sheet). */
  function symPath(c, s, t, plan) {
    if (s.kind === 'hatch') {
      const r = 0.38;
      c.rect(s.x - r, s.y - r, r * 2, r * 2);
      c.moveTo(s.x - r, s.y - r); c.lineTo(s.x + r, s.y + r); c.moveTo(s.x + r, s.y - r); c.lineTo(s.x - r, s.y + r);
      return;
    }
    const hh = t / 2, ox = s.dx, oy = s.dy;           // (ox, oy): away from the wall, into the room
    const fx = s.x + 0.5 + s.dx * hh, fy = s.y + 0.5 + s.dy * hh;   // on the drawn face
    if (s.kind === 'ladder') {
      const d = 0.3, tx = -oy, ty = ox;              // along the wall
      const a0x = fx + tx * 0.3, a0y = fy + ty * 0.3, a1x = fx - tx * 0.3, a1y = fy - ty * 0.3;
      c.moveTo(a0x, a0y); c.lineTo(a0x + ox * d, a0y + oy * d);
      c.moveTo(a1x, a1y); c.lineTo(a1x + ox * d, a1y + oy * d);
      for (let k = 1; k <= 3; k++) { const f = (k / 4) * 0.6 - 0.3; c.moveTo(fx + tx * f, fy + ty * f); c.lineTo(fx + tx * f + ox * d, fy + ty * f + oy * d); }
      if (plan) { // hatch overhead: dashed square drawn as short strokes
        const r = 0.42, cx = fx + ox * 0.45, cy = fy + oy * 0.45;
        for (let k = 0; k < 4; k++) {
          const ax = cx + (k === 1 || k === 2 ? r : -r), ay = cy + (k >= 2 ? r : -r), bx = cx + (k === 0 || k === 1 ? r : -r), by = cy + (k === 0 || k === 3 ? -r : r);
          for (let q = 0; q < 4; q++) { const a = q / 4, b = a + 0.14; c.moveTo(ax + (bx - ax) * a, ay + (by - ay) * a); c.lineTo(ax + (bx - ax) * b, ay + (by - ay) * b); }
        }
      }
      return;
    }
    // stair flight: 0.9 wide, 2.2 long, treads every ~0.27, a break line, arrow toward the wall
    const L = 2.2, W_ = 0.44, tx = -oy, ty = ox;
    const p0x = fx + tx * W_, p0y = fy + ty * W_, p1x = fx - tx * W_, p1y = fy - ty * W_;
    c.moveTo(p0x, p0y); c.lineTo(p0x + ox * L, p0y + oy * L); c.lineTo(p1x + ox * L, p1y + oy * L); c.lineTo(p1x, p1y);
    for (let k = 1; k * 0.275 < L; k++) { const d = k * 0.275; c.moveTo(p0x + ox * d, p0y + oy * d); c.lineTo(p1x + ox * d, p1y + oy * d); }
    // break line
    c.moveTo(p0x + ox * (L * 0.62), p0y + oy * (L * 0.62)); c.lineTo(p1x + ox * (L * 0.38), p1y + oy * (L * 0.38));
    // arrow shaft
    c.moveTo(fx + ox * (L - 0.15), fy + oy * (L - 0.15)); c.lineTo(fx + ox * 0.32, fy + oy * 0.32);
  }
  function stairArrowHead(c, s, t) {
    const hh = t / 2, ox = s.dx, oy = s.dy, tx = -oy, ty = ox;
    const fx = s.x + 0.5 + s.dx * hh, fy = s.y + 0.5 + s.dy * hh;
    const tipx = fx + ox * 0.18, tipy = fy + oy * 0.18, bx = fx + ox * 0.46, by = fy + oy * 0.46;
    c.beginPath();
    c.moveTo(tipx, tipy); c.lineTo(bx + tx * 0.13, by + ty * 0.13); c.lineTo(bx - tx * 0.13, by - ty * 0.13); c.closePath();
    c.fill();
  }
  function sitePath(c, s) {
    if (s.kind === 'mast') { const r = 0.26; c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); c.moveTo(s.x - r * 1.5, s.y); c.lineTo(s.x + r * 1.5, s.y); c.moveTo(s.x, s.y - r * 1.5); c.lineTo(s.x, s.y + r * 1.5); }
    else if (s.kind === 'tower') { const r = 0.45; c.rect(s.x - r, s.y - r, r * 2, r * 2); c.moveTo(s.x - r, s.y + r); c.lineTo(s.x, s.y - r); c.lineTo(s.x + r, s.y + r); }
    else if (s.kind === 'lamp') { const r = 0.13; c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); c.moveTo(s.x + r * 2.2, s.y); c.arc(s.x, s.y, r * 2.2, 0, TAU); }
    else if (s.kind === 'sign') { c.moveTo(s.x - 0.4, s.y); c.lineTo(s.x + 0.4, s.y); c.moveTo(s.x - 0.3, s.y); c.lineTo(s.x - 0.3, s.y + 0.18); c.moveTo(s.x + 0.3, s.y); c.lineTo(s.x + 0.3, s.y + 0.18); }
  }
  /** water stains + foxing for the 2049 sheet (map coordinates, so they move with the drawing) */
  function stains(c, A, s) {
    const n = 7;
    for (let k = 0; k < n; k++) {
      const x = A.bounds.x0 + hr(k, 91) * (A.bounds.x1 - A.bounds.x0), y = A.bounds.y0 + hr(k, 92) * (A.bounds.y1 - A.bounds.y0);
      const r = 2 + hr(k, 93) * 5;
      const g = c.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(120, 92, 40, 0.10)');
      g.addColorStop(0.82, 'rgba(120, 92, 40, 0.16)');
      g.addColorStop(0.93, 'rgba(96, 64, 22, 0.34)');
      g.addColorStop(1, 'rgba(96, 64, 22, 0)');
      c.fillStyle = g;
      c.beginPath();
      // an irregular blob: a circle with a wobbly edge
      for (let a = 0; a <= 24; a++) {
        const ang = (a / 24) * TAU, rr = r * (0.86 + hr(k * 31 + a, 94) * 0.2);
        const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
        if (a) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.fill();
    }
    c.fillStyle = 'rgba(110, 72, 24, 0.35)';
    for (let k = 0; k < 90; k++) {
      const x = A.bounds.x0 + hr(k, 95) * (A.bounds.x1 - A.bounds.x0), y = A.bounds.y0 + hr(k, 96) * (A.bounds.y1 - A.bounds.y0);
      const r = (0.03 + hr(k, 97) * 0.08);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  }

  /* ============================================================ paper */
  const paperTiles = Object.create(null);
  function paperPattern(ctx, pal) {
    let tile = paperTiles[pal.name];
    if (!tile) {
      tile = mkCanvas(160, 160);
      const c = tile.getContext('2d');
      const img = c.createImageData(160, 160), d = img.data;
      for (let i = 0; i < 160 * 160; i++) {
        const r = hr(i, pal.name.length * 7);
        let a = 0, col = pal.speck;
        if (r < 0.06) { a = 10 + hr(i, 3) * 26; }
        else if (r > 0.965) { a = 14 + hr(i, 4) * 30; col = pal.speckDark; }
        d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = a;
      }
      c.putImageData(img, 0, 0);
      // fibres
      c.strokeStyle = 'rgba(' + pal.speck.join(',') + ', 0.05)';
      c.lineWidth = 1;
      for (let k = 0; k < 18; k++) {
        const x = hr(k, 11) * 160, y = hr(k, 12) * 160, a = hr(k, 13) * TAU, l = 6 + hr(k, 14) * 18;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
      paperTiles[pal.name] = tile;
    }
    return ctx.createPattern(tile, 'repeat');
  }

  /* ============================================================ seen cells (pencil memory) */
  const seenMaps = Object.create(null);     // mapId → Uint8Array
  const seenVer = Object.create(null);      // mapId → counter
  /** cells newly seen on seenLogMap since the corner layers were built; each cached layer keeps its read position */
  const seenLog = [];
  let seenLogMap = null;
  function mState() {
    if (!DA.state) return { seen: {} };
    let s = DA.state.minimap;
    if (!s || typeof s !== 'object') s = DA.state.minimap = { v: 1, seen: {} };
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    return s;
  }
  function seenFor(id, m) {
    if (!id || !m) return null;
    let S = seenMaps[id];
    if (S && S.length === m.w * m.h) return S;
    S = decode(mState().seen[id], m.w * m.h) || new Uint8Array(m.w * m.h);
    seenMaps[id] = S;
    seenVer[id] = (seenVer[id] || 0) + 1;
    return S;
  }
  function encode(S) {
    const bytes = new Uint8Array((S.length + 7) >> 3);
    for (let i = 0; i < S.length; i++) if (S[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let k = 0; k < bytes.length; k += 4096) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 4096));
    return btoa(s);
  }
  function decode(b64, n) {
    if (typeof b64 !== 'string' || !b64) return null;
    try {
      const s = atob(b64);
      if (s.length !== ((n + 7) >> 3)) return null;
      const S = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (s.charCodeAt(i >> 3) & (1 << (i & 7))) S[i] = 1;
      return S;
    } catch (e) { return null; }
  }
  function collect() {
    const st = mState();
    for (const id in seenMaps) {
      const S = seenMaps[id];
      if (S.indexOf(1) < 0) continue;   // nothing seen there (only queried): no entry
      try { st.seen[id] = encode(S); } catch (e) { report('encode', e); }
    }
    const doors = st.doors && typeof st.doors === 'object' ? st.doors : (st.doors = {});
    for (const id in doorMem) {
      const M = doorMem[id], o = {};
      let any = false;
      for (const k in M) { o[k] = M[k] >= 0.5 ? 1 : 0; any = true; }
      if (any) doors[id] = o;
    }
    st.v = 1;
  }
  /** floor you can stand on: not a wall, not a pit, not a dense-tree cell (floor + solid) */
  const walkable = (m, i) => m.solid[i] === 0;
  /** what blocks sight for the sketch: walls, dense trees, shut doors (pits do not) */
  function blocksSight(m, i) {
    if (m.wall[i]) return true;
    if (m.solid[i] && !(m.pit && m.pit[i])) return true;
    const di = m.door[i];
    return di >= 0 && m.doors[di] && m.doors[di].open < 0.5;
  }
  /**
   * grid DDA from (ax, ay) to cell (tx, ty) — aimed at its centre, or at (px, py) inside it when
   * given (a door's face); the start and target cells never block
   */
  function sightTo(m, ax, ay, tx, ty, px, py) {
    const bx = px === undefined ? tx + 0.5 : px, by = py === undefined ? ty + 0.5 : py, dx = bx - ax, dy = by - ay;
    let cx = Math.floor(ax), cy = Math.floor(ay);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx > 0 ? (cx + 1 - ax) * tdx : dx < 0 ? (ax - cx) * tdx : Infinity;
    let tmy = dy > 0 ? (cy + 1 - ay) * tdy : dy < 0 ? (ay - cy) * tdy : Infinity;
    for (let n = 0; n < 64; n++) {
      if (cx === tx && cy === ty) return true;
      if (n > 0 && blocksSight(m, cy * m.w + cx)) return false;
      if (tmx < tmy) { cx += stepX; tmx += tdx; } else { cy += stepY; tmy += tdy; }
      if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
    }
    return false;
  }
  /** mark floor cells within SEEN_R in line of sight as seen (4 Hz, cheap) */
  function markSeen() {
    const W = world(), m = curMap(), P = player(), id = curMapId();
    if (!W || !m || !P || !id || !m.wall || !m.solid) return;
    const S = seenFor(id, m);
    if (!S) return;
    if (seenLogMap !== id) { seenLog.length = 0; seenLogMap = id; }
    const px = P.x, py = P.y, w = m.w, h = m.h, R2 = SEEN_R * SEEN_R;
    const x0 = Math.max(0, Math.floor(px - SEEN_R)), x1 = Math.min(w - 1, Math.floor(px + SEEN_R));
    const y0 = Math.max(0, Math.floor(py - SEEN_R)), y1 = Math.min(h - 1, Math.floor(py + SEEN_R));
    const pcx = Math.floor(px), pcy = Math.floor(py);
    let added = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (S[i] || !walkable(m, i)) continue;
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        if (dx * dx + dy * dy > R2) continue;
        if (!(x === pcx && y === pcy) && !sightTo(m, px, py, x, y)) continue;
        S[i] = 1;
        seenLog.push(i);
        added++;
      }
    }
    if (added) seenVer[id] = (seenVer[id] || 0) + 1;
    if (m.doors) markDoors(m, id, P);
  }

  /* ============================================================ doors, as you last saw them */
  /*
   * The map never shows a door's live state: it shows it as you last saw it. The director's
   * "a door you shut is open" beat only flips doors you cannot see, and the entity opens doors on
   * its way through the building; neither may reach the map before you look. A door counts as seen
   * when it is in line of sight and either within arm's reach (DOOR_NEAR — you would hear it, feel
   * the draught) or inside the view cone out to DOOR_FAR. Checked at 4 Hz with markSeen; while a
   * door stays in view the map follows it live (so your own doors swing smoothly).
   * Persisted as DA.state.minimap.doors = {mapId: {doorId: 0|1}}.
   */
  const DOOR_NEAR = 2.5, DOOR_FAR = 14;
  const doorMem = Object.create(null);         // mapId → {doorId: 0..1}
  let doorVis = new Uint8Array(48), doorVisM = null;   // runtime map → door index in view (4 Hz)
  function doorMemFor(id) {
    let M = doorMem[id];
    if (M) return M;
    M = doorMem[id] = Object.create(null);
    const st = mState().doors, src = st && typeof st === 'object' ? st[id] : null;
    if (src && typeof src === 'object') for (const k in src) { const v = src[k]; if (v === 0 || v === 1) M[k] = v; }
    return M;
  }
  function markDoors(m, id, P) {
    const n = m.doors.length;
    if (doorVisM !== m || doorVis.length < n) {
      if (doorVis.length < n) doorVis = new Uint8Array(n + 16);
      doorVis.fill(0);
      doorVisM = m;
    }
    const M = doorMemFor(id);
    const half = (((+(DA.settings && DA.settings.fov) || 66) / 2 + 8) * Math.PI) / 180;
    for (let k = 0; k < n; k++) {
      const d = m.doors[k];
      let vis = false;
      if (d) {
        const dx = d.x + 0.5 - P.x, dy = d.y + 0.5 - P.y, dist = Math.hypot(dx, dy);
        if (dist <= DOOR_FAR) {
          let inView = dist <= DOOR_NEAR;
          if (!inView) {
            let da = Math.atan2(dy, dx) - P.angle;
            da -= Math.round(da / TAU) * TAU;
            inView = Math.abs(da) <= half;
          }
          if (inView) {
            // aim at the face turned toward you: the cell centre sits inside the wall line, and an
            // oblique ray to it clips the neighbouring wall cell although the door is plainly visible
            let fx = d.x + 0.5, fy = d.y + 0.5;
            if (d.axis === 'v') fx += P.x < fx ? -0.45 : 0.45; else fy += P.y < fy ? -0.45 : 0.45;
            vis = sightTo(m, P.x, P.y, d.x, d.y, fx, fy);
          }
        }
        if (vis) M[d.id] = clamp(+d.open || 0, 0, 1);
      }
      doorVis[k] = vis ? 1 : 0;
    }
  }
  /** how far open to draw door k of runtime map m: live while in view, else as last seen, else as drawn */
  function doorShown(A, m, k, d, M) {
    if (doorVisM === m && doorVis[k]) { const o = clamp(+d.open || 0, 0, 1); M[d.id] = o; return o; }
    const v = M[d.id];
    if (v !== undefined) return v;
    const g = A && A.doorById ? A.doorById[d.id] : null;
    return g ? g.open0 : 0;
  }

  /* ============================================================ pencil (your sketch) */
  function pencilEligible(A, m, i) {
    if (!walkable(m, i)) return false;
    if (!A || !A.drawn || i >= A.cls.length) return true;
    const c = A.cls[i];
    return !(c === C_IN || c === C_OUT || c === C_DOOR);
  }
  const decorIdx = new WeakMap();
  function decorByCell(m) {
    let ix = decorIdx.get(m);
    if (ix) return ix;
    ix = new Map();
    for (const d of m.decor || []) {
      if (!d || !/tree/.test(String(d.tex || ''))) continue;
      const i = Math.floor(d.y) * m.w + Math.floor(d.x);
      if (!ix.has(i)) ix.set(i, []);
      ix.get(i).push(d);
    }
    decorIdx.set(m, ix);
    return ix;
  }
  function pencilLine(c, x0, y0, x1, y1, seed) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const o0 = 0.02 + hr(seed, 1) * 0.1, o1 = 0.02 + hr(seed, 2) * 0.1;
    const j0 = (hr(seed, 3) - 0.5) * 0.08, j1 = (hr(seed, 4) - 0.5) * 0.08, jm = (hr(seed, 5) - 0.5) * 0.1;
    c.moveTo(x0 - ux * o0 + nx * j0, y0 - uy * o0 + ny * j0);
    c.quadraticCurveTo((x0 + x1) / 2 + nx * jm, (y0 + y1) / 2 + ny * jm, x1 + ux * o1 + nx * j1, y1 + uy * o1 + ny * j1);
  }
  /** draw pencil strokes onto c (s px per cell): all=true → cells is a seen bitset; else a list of indices from `from` */
  function drawPencil(c, A, m, s, pal, cells, all, from) {
    if (!m || !m.wall) return;
    const w = m.w, h = m.h, px = 1 / s;
    const trees = decorByCell(m);
    c.save();
    c.scale(s, s);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const edges = new Path2D(), shade = new Path2D();
    const step = s >= 11 ? 3 : 2;
    const each = (i) => {
      if (!pencilEligible(A, m, i)) return;
      const x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX4[k], ny = y + DY4[k];
        const out = nx < 0 || ny < 0 || nx >= w || ny >= h;
        if (!out && walkable(m, ny * w + nx)) continue;
        const seed = i * 4 + k;
        if (k === 0) pencilLine(edges, x, y, x + 1, y, seed);
        else if (k === 1) pencilLine(edges, x + 1, y, x + 1, y + 1, seed);
        else if (k === 2) pencilLine(edges, x, y + 1, x + 1, y + 1, seed);
        else pencilLine(edges, x, y, x, y + 1, seed);
        if (hr(seed, 9) < 0.35) pencilLine(edges, k === 1 ? x + 1 : x, k === 2 ? y + 1 : y, k === 3 ? x : x + 1, k === 0 ? y : y + 1, seed + 77); // a second pass
      }
      // loose hatch shading
      for (let q = 1; q <= step; q++) {
        const d = (q / (step + 1)) * 2 + (hr(i, q + 20) - 0.5) * 0.18;
        const a = d <= 1 ? [x, y + d, x + d, y] : [x + d - 1, y + 1, x + 1, y + d - 1];
        const shrink = 0.1 + hr(i, q + 30) * 0.12;
        const ax = a[0] + (a[2] - a[0]) * shrink, ay = a[1] + (a[3] - a[1]) * shrink;
        const bx = a[2] - (a[2] - a[0]) * shrink, by = a[3] - (a[3] - a[1]) * shrink;
        shade.moveTo(ax, ay); shade.lineTo(bx, by);
      }
      const tl = trees.get(i);
      if (tl) for (const t of tl) {
        const r = 0.16 + hr(i, 41) * 0.1;
        shade.moveTo(t.x + r, t.y);
        shade.arc(t.x, t.y, r, 0, TAU * 0.92);
        edges.moveTo(t.x + r * 0.4, t.y);
        edges.arc(t.x, t.y, r * 0.4, 0, TAU);
      }
    };
    if (all) { for (let i = 0; i < cells.length; i++) if (cells[i]) each(i); }
    else for (let k = from || 0; k < cells.length; k++) each(cells[k]);
    c.strokeStyle = pal.pencilSoft;
    c.lineWidth = Math.max(px * 0.9, 0.035);
    c.stroke(shade);
    c.strokeStyle = pal.pencil;
    c.lineWidth = Math.max(px * 1.15, 0.065);
    c.stroke(edges);
    c.restore();
  }

  /* ============================================================ objective marker */
  const tgt = { valid: false, obj: null, text: '', x: 0, y: 0, map: null, label: '', via: null, npc: null, final: null, hush: false };
  const HUSH = 'obj_listen';
  /**
   * "Most recent" = the order objectives were (re)set (DA.state.minimap.seq, saved with the game),
   * then list order for ids set before the minimap existed / without a number.
   */
  const orderBuf = [];
  const NO_SEQ = {};
  let seqNow = NO_SEQ, listNow = null;
  const bySeq = (a, b) => ((+seqNow[listNow[b].id] || 0) - (+seqNow[listNow[a].id] || 0)) || (b - a);
  let hushNow = false;
  function currentObjective() {
    hushNow = false;
    const list = DA.state && DA.state.objectives;
    if (!Array.isArray(list)) return null;
    const st = DA.state.minimap;
    seqNow = st && st.seq && typeof st.seq === 'object' ? st.seq : NO_SEQ;
    listNow = list;
    orderBuf.length = 0;
    for (let k = 0; k < list.length; k++) if (list[k] && !list[k].done) orderBuf.push(k);
    orderBuf.sort(bySeq);
    listNow = null;
    for (let q = 0; q < orderBuf.length; q++) {
      const o = list[orderBuf[q]];
      if (SILENT_DARK.has(o.id)) { hushNow = o.id === HUSH; return null; }
      if (o.glitch || SILENT.has(o.id)) continue;
      return o;
    }
    return null;
  }
  function interactPos(id) {
    const IX = DA.interact;
    let f = null;
    try { f = IX && IX.find ? IX.find(id) : null; } catch (e) { f = null; }
    if (!f || !f.it) return null;
    const it = f.it;
    if (it.side && DIRS[it.side]) {
      const cells = [[Math.floor(it.x), Math.floor(it.y), it.side]].concat((it.cells || []).map((c) => [c[0], c[1], c[2] || it.side]));
      let sx = 0, sy = 0, n = 0;
      for (const [x, y, sd] of cells) {
        if (sd !== it.side || !DIRS[sd]) continue;
        sx += x + 0.5 + DIRS[sd][0] * 0.62; sy += y + 0.5 + DIRS[sd][1] * 0.62; n++;
      }
      if (!n) return null;
      return { map: f.map, x: sx / n, y: sy / n };
    }
    if (!isFinite(+it.x) || !isFinite(+it.y)) return null;
    // doors (and other cell-indexed interactables) name a cell, not a point
    if (it.radius == null && Number.isInteger(+it.x) && Number.isInteger(+it.y)) return { map: f.map, x: +it.x + 0.5, y: +it.y + 0.5 };
    return { map: f.map, x: +it.x, y: +it.y };
  }
  function resolveSpec(spec, o, depth) {
    if (spec == null || depth > 4) return null;
    if (typeof spec === 'function') { let r = null; try { r = spec(o); } catch (e) { report('target fn', e); } return resolveSpec(r, o, depth + 1); }
    if (typeof spec === 'string') return interactPos(spec);
    if (typeof spec !== 'object') return null;
    if (spec.npc) {
      const W = world();
      const n = W && W.npc ? W.npc(spec.npc) : null;
      if (n && !n.hidden && isFinite(n.x)) return { map: n.map, x: n.x, y: n.y, npc: spec.npc };
      return spec.fallback != null ? resolveSpec(spec.fallback, o, depth + 1) : null;
    }
    if (spec.point) {
      const W = world();
      const p = W && W.point ? W.point(spec.point) : null;
      return p ? { map: p.map, x: p.x, y: p.y } : null;
    }
    if (Array.isArray(spec.nearest)) {
      const P = player(), here = curMapId();
      let best = null, bd = Infinity, first = null;
      for (const id of spec.nearest) {
        if (spec.skip && spec.skip(id)) continue;
        const p = interactPos(id);
        if (!p) continue;
        if (!first) first = p;
        if (p.map === here && P) { const d = Math.hypot(p.x - P.x, p.y - P.y); if (d < bd) { bd = d; best = p; } }
      }
      return best || first;
    }
    if (isFinite(spec.x) && isFinite(spec.y)) return { map: spec.map || curMapId(), x: +spec.x, y: +spec.y };
    return null;
  }
  /** first interactable on `from` that leads toward `to` (BFS over LINKS) */
  function route(from, to) {
    if (!from || !to || from === to) return null;
    const prev = Object.create(null);
    const q = [from];
    prev[from] = null;
    while (q.length) {
      const m = q.shift();
      const L = LINKS[m] || {};
      for (const n in L) {
        if (n in prev) continue;
        prev[n] = m;
        if (n === to) {
          let cur = n;
          while (prev[cur] !== from) cur = prev[cur];
          return LINKS[from][cur] || null;
        }
        q.push(n);
      }
    }
    return null;
  }
  function resolveTarget() {
    tgt.valid = false; tgt.npc = null; tgt.via = null; tgt.label = ''; tgt.final = null;
    const o = currentObjective();
    if (tgt.hush !== hushNow) { tgt.hush = hushNow; setMiniClass(); }
    tgt.obj = o ? o.id : null;
    tgt.text = o ? String(o.text || '') : '';
    if (!o) return;
    const spec = o.id in overrides ? overrides[o.id] : TARGETS[o.id];
    if (spec === undefined || spec === null) return;
    const p = resolveSpec(spec, o, 0);
    if (!p || !p.map) return;
    const here = curMapId();
    tgt.final = p.map;
    if (p.map === here) {
      tgt.valid = true; tgt.x = p.x; tgt.y = p.y; tgt.map = here; tgt.npc = p.npc || null;
      return;
    }
    const hop = route(here, p.map);
    if (!hop) return;
    const q = interactPos(hop);
    if (!q || q.map !== here) return;
    tgt.valid = true; tgt.x = q.x; tgt.y = q.y; tgt.map = here; tgt.via = hop; tgt.label = LINK_LABEL[hop] || '';
  }
  function liveTarget() {
    if (!tgt.valid) return false;
    if (tgt.npc) {
      const W = world();
      const n = W && W.npc ? W.npc(tgt.npc) : null;
      if (!n || n.hidden || n.map !== curMapId()) { tgt.valid = false; return false; }
      tgt.x = n.x; tgt.y = n.y;
    }
    return tgt.map === curMapId();
  }

  /* ============================================================ corner minimap */
  const mini = {
    root: null, cv: null, ctx: null, size: 0, R: 0, ppc: 0, dirtySize: true, visible: false, acc: 0, lastReal: 0,
    // corner layers per palette for the current map (crossing into the woods and back swaps canvases, no rebuild)
    lset: { map: null, m: null, ppc: 0, by: Object.create(null) },
    ground: null, groundPal: null, groundSize: 0, pattern: null, patternPal: '', fonts: null,
    stats: { n: 0, total: 0, max: 0, last: 0 }, boxes: new Float32Array(32 * 4),
    fx: { flickT: 0, fjx: 0, fjy: 0, fjr: 0, ghostT: 0, ghosts: new Float32Array(9), scrT: 0, scrOn: 0, scrPick: -1, scrSwap: -1 },
  };
  function paletteName(mapId) {
    const A = analysis(mapId);
    if (!A || !A.drawn || offSite(A)) return 'graph';
    return isAbandoned() ? 'aged' : 'blue';
  }
  /**
   * Layout size in CSS px — computed style, not getBoundingClientRect(): the plan sheet sits in a
   * rotated, animating wrapper whose transformed box would resample the whole sheet unevenly.
   */
  const lsz = { w: 0, h: 0 };
  function layoutSize(elm) {
    let w = 0, h = 0;
    try { const cs = getComputedStyle(elm); w = parseFloat(cs.width) || 0; h = parseFloat(cs.height) || 0; } catch (e) { /* detached */ }
    lsz.w = w || elm.clientWidth || 0;
    lsz.h = h || elm.clientHeight || 0;
    return lsz;
  }
  function measureMini() {
    if (!mini.cv) return false;
    const r = layoutSize(mini.root);
    const css = Math.min(r.w, r.h);
    if (css < 8) { mini.size = 0; return false; }
    const d = dpr(), D = Math.round(css * d);
    if (D !== mini.size || mini.cvDpr !== d) {
      mini.size = D;
      mini.cvDpr = d;
      mini.cv.width = D;
      mini.cv.height = D;
      // the canvas shows its backing store 1:1 (a fraction of a px off the 22u box at most)
      mini.cv.style.width = mini.cv.style.height = (D / d).toFixed(3) + 'px';
      mini.R = D / 2 - Math.max(2, D * 0.035);
      mini.ppc = mini.R / VIEW_R;
      mini.groundSize = 0;
      mini.lset.map = null;
      const fs = Math.max(7.5 * dpr(), D * 0.058);
      mini.fonts = {
        fs, label: '600 ' + fs.toFixed(1) + 'px ' + FONT_UI, small: '500 ' + (fs * 0.84).toFixed(1) + 'px ' + FONT_UI,
        tag: '600 ' + (fs * 0.78).toFixed(1) + 'px ' + FONT_UI, n: '700 ' + (fs * 1.02).toFixed(1) + 'px ' + FONT_UI,
        obj: '700 ' + (fs * 0.92).toFixed(1) + 'px ' + FONT_UI, ls: fs * 0.1,
        lsS: (fs * 0.1).toFixed(2) + 'px', ls14S: (fs * 0.14).toFixed(2) + 'px',
      };
    }
    mini.dirtySize = false;
    return true;
  }
  function ensureMiniLayers(id, m, palName) {
    const LS = mini.lset, ppc = mini.ppc;
    const pal = PALS[palName];
    if (LS.map !== id || LS.ppc !== ppc || LS.m !== m) {
      for (const k in LS.by) delete LS.by[k];
      LS.map = id; LS.ppc = ppc; LS.m = m;
      seenLog.length = 0;
      seenLogMap = id;
    }
    let L = LS.by[palName];
    if (!L) {
      L = LS.by[palName] = { ink: null, pencil: null, pctx: null, pal, pos: 0, pdirty: true };
      try { L.ink = pal.graph ? null : renderInk(analysis(id), ppc, pal, false); } catch (e) { report('ink', e); L.ink = null; }
    }
    if (L.pdirty && m) {
      L.pdirty = false;
      if (!L.pencil) { L.pencil = mkCanvas(m.w * ppc, m.h * ppc); L.pctx = L.pencil.getContext('2d'); }
      else L.pctx.clearRect(0, 0, L.pencil.width, L.pencil.height);
      L.pos = seenLogMap === id ? seenLog.length : 0;
      try { drawPencil(L.pctx, analysis(id), m, ppc, pal, seenFor(id, m), true); } catch (e) { report('pencil', e); }
    } else if (L.pctx && m && seenLogMap === id && L.pos < seenLog.length) {
      try { drawPencil(L.pctx, analysis(id), m, ppc, pal, seenLog, false, L.pos); } catch (e) { report('pencil+', e); }
      L.pos = seenLog.length;
    }
    if (mini.patternPal !== palName) { mini.pattern = paperPattern(mini.ctx, pal); mini.patternPal = palName; }
    if (mini.groundPal !== pal || mini.groundSize !== mini.size) {
      const D = mini.size, g = mini.ctx.createRadialGradient(D / 2, D / 2, mini.R * 0.1, D / 2, D / 2, mini.R);
      g.addColorStop(0, pal.g0);
      g.addColorStop(1, pal.g1);
      mini.ground = g;
      mini.groundPal = pal;
      mini.groundSize = mini.size;
    }
    return L;
  }
  /** Rebuild the pencil layers after a mutation changed what is walkable. */
  function dropPencil(id) {
    if (mini.lset.map === id) for (const k in mini.lset.by) mini.lset.by[k].pdirty = true;
    if (plan.cache && plan.cache.map === id) plan.cache.pver = -1;
  }
  /** on screen right now: explore on top, a game running, not under a title card or a full fade */
  function miniShouldShow() {
    if (!(booted && DA.running && settingOn() && curMap() && DA.modes && DA.modes.is('explore'))) return false;
    if (document.body.classList.contains('ui-card-on')) return false;
    const U = DA.ui;
    return !(U && U.fadeLevel && U.fadeLevel() > 0.98);
  }
  function setMiniClass() {
    if (!mini.root) return;
    const off = !(booted && DA.running && settingOn() && curMap());
    if (off !== mini.root.classList.contains('mm-off')) mini.root.classList.toggle('mm-off', off);
    // LISTEN. — "No waypoint. Nothing else.": the corner map all but goes out while that is the duty,
    // and while it is hunting / stalking you close by
    const hush = !!tgt.hush || mood.near;
    if (hush !== mini.root.classList.contains('mm-hush')) mini.root.classList.toggle('mm-hush', hush);
    // main power off: dimmed, under the red emergency lamps (the red itself is drawn — drawMini)
    const dark = mood.dark;
    if (dark !== mini.root.classList.contains('mm-dark')) mini.root.classList.toggle('mm-dark', dark);
  }
  /*
   * The dark and the hunt (decision 3). mood.dark: main power is off (not the daylit 2049 station,
   * which has no power either). mood.near: the entity is hunting / stalking / searching (or, in the
   * dark, walking) within NEAR_ON units — held NEAR_HOLD s after it stops being true so the corner
   * does not blink while it circles you at the edge of the range.
   */
  const HUNT_MODES = { hunt: 1, stalk: 1, search: 1, caught: 1 };
  const NEAR_ON = 10, NEAR_OFF = 12, NEAR_HOLD = 2.5;
  const mood = { dark: false, red: false, near: false, nearT: 0, dist: Infinity, mode: '' };
  /** emergency-red corner: multiply (the cyanotype under red light: white ink → red, blue paper → dark) + a slight red lift */
  const DARK_INK = { mul: 'rgb(255, 72, 54)', mulPaper: 'rgb(130, 34, 26)', lift: 'rgb(40, 3, 1)', grey: 'rgb(150, 150, 150)', greyPaper: 'rgb(92, 90, 84)', rim: 'rgba(255, 104, 84, 0.8)', rimDark: 'rgba(22, 3, 1, 0.9)', text: 'rgba(255, 138, 116, 0.95)', halo: 'rgba(26, 4, 2, 0.92)' };
  function isDark() {
    const W = DA.world;
    if (!W || typeof W.power !== 'function' || !curMap()) return false;
    let on = true;
    try { on = !!W.power('main'); } catch (e) { on = true; }
    return !on && !isAbandoned();
  }
  /** the red cast only where red emergency lamps light the map (station, sub-level); elsewhere (the array, the roof) just dim */
  const emMaps = new WeakMap();
  function isRed() {
    const m = curMap(), W = DA.world;
    if (!m || !W) return false;
    let has = emMaps.get(m);
    if (has === undefined) { has = Array.isArray(m.lights) && m.lights.some((l) => l && l.circuit === 'emergency'); emMaps.set(m, has); }
    if (!has) return false;
    try { return !!W.power('emergency'); } catch (e) { return false; }
  }
  function entityNear(dt, dark) {
    const E = DA.entity;
    let hot = false;
    mood.dist = Infinity; mood.mode = '';
    try {
      if (E && typeof E.active === 'function' && E.active() && typeof E.mode === 'function' && typeof E.distance === 'function') {
        const md = String(E.mode() || '');
        mood.mode = md;
        if (HUNT_MODES[md] || (md === 'move' && dark)) {
          const d = +E.distance();
          mood.dist = d;
          hot = d <= (mood.near ? NEAR_OFF : NEAR_ON);
        }
      }
    } catch (e) { hot = false; }
    if (hot) mood.nearT = NEAR_HOLD;
    else mood.nearT = Math.max(0, mood.nearT - (dt || 0));
    return hot || mood.nearT > 0;
  }
  function updateMood(dt) {
    const dark = isDark(), near = entityNear(dt, dark);
    mood.red = dark && isRed();
    if (dark !== mood.dark || near !== mood.near) { mood.dark = dark; mood.near = near; setMiniClass(); }
  }
  function updateEffects(dt) {
    const F = mini.fx;
    const col = collapseLevel(), inst = instability();
    // instability: an occasional one-frame offset / skew
    F.fjx = F.fjy = F.fjr = 0;
    const p = clamp((inst - 3) / 25, 0, 0.3) * 0.06 + col * 0.05;
    if (Math.random() < p) {
      F.flickT = 1;
      F.fjx = (Math.random() - 0.5) * (4 + col * 8) * dpr();
      F.fjy = (Math.random() - 0.5) * (4 + col * 8) * dpr();
      F.fjr = (Math.random() - 0.5) * (0.05 + col * 0.12);
    } else F.flickT = 0;
    if (col > 0) {
      // constant low jitter of the drawing
      F.fjx += (Math.random() - 0.5) * col * 2.2 * dpr();
      F.fjy += (Math.random() - 0.5) * col * 2.2 * dpr();
      // ghosts of yourself: 1–2 extra positions, re-rolled every ~0.15–0.5 s
      F.ghostT -= dt;
      if (F.ghostT <= 0) {
        F.ghostT = 0.15 + Math.random() * 0.35;
        const n = Math.random() < 0.12 + col * 0.45 ? (Math.random() < 0.45 * col ? 2 : 1) : 0;
        for (let k = 0; k < 3; k++) {
          const on = k < n;
          F.ghosts[k * 3] = on ? (Math.random() - 0.5) * (1.2 + col * 2.4) : 0;
          F.ghosts[k * 3 + 1] = on ? (Math.random() - 0.5) * (1.2 + col * 2.4) : 0;
          F.ghosts[k * 3 + 2] = on ? (Math.random() - 0.5) * 2.4 : 99;
        }
      }
      // labels: now and then one scrambles or swaps with another room's
      F.scrT -= dt;
      if (F.scrT <= 0) {
        if (F.scrOn) { F.scrOn = 0; F.scrT = 1 + Math.random() * (3.5 - col * 2); }
        else { F.scrOn = 1; F.scrT = 0.25 + Math.random() * 0.5; F.scrPick = (Math.random() * 1e6) | 0; F.scrSwap = Math.random() < 0.5 ? ((Math.random() * 1e6) | 0) : -1; }
      }
    } else { F.ghosts.fill(0); for (let k = 0; k < 3; k++) F.ghosts[k * 3 + 2] = 99; F.scrOn = 0; }
  }
  const SCR_CH = 'ABCDEFGHIKLMNOPRSTUVW0123456789.-/#';
  function scrambled(L) {
    if (!L.scr) {
      let s = '';
      for (let k = 0; k < L.text.length; k++) {
        const ch = L.text[k];
        s += ch === ' ' || hr(k, L.text.length + 7) < 0.45 ? ch : SCR_CH[(hr(k, L.text.length) * SCR_CH.length) | 0];
      }
      L.scr = s;
      L.scrLines = mkLabel(s, 0, 0).lines;
    }
    return L.scrLines;
  }
  function labelLines(A, k) {
    const F = mini.fx, L = A.labels[k];
    if (F.scrOn && A.labels.length) {
      const n = A.labels.length;
      if (F.scrPick % n === k) return F.scrSwap >= 0 ? A.labels[(k + 1 + (F.scrSwap % (n - 1 || 1))) % n].lines : scrambled(L);
    }
    return L.lines;
  }
  function drawArrow(c, x, y, ang, a, fill, edge, lw, alpha) {
    // local: tip (0,-a), wings (±0.62a, 0.72a), notch (0, 0.34a); rotated by ang (0 = up)
    const ca = Math.cos(ang) * a, sa = Math.sin(ang) * a;
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(x + sa, y - ca);
    c.lineTo(x + 0.62 * ca - 0.72 * sa, y + 0.62 * sa + 0.72 * ca);
    c.lineTo(x - 0.34 * sa, y + 0.34 * ca);
    c.lineTo(x - 0.62 * ca - 0.72 * sa, y - 0.62 * sa + 0.72 * ca);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = lw;
    c.strokeStyle = edge;
    c.stroke();
    c.globalAlpha = 1;
  }
  function drawDiamond(c, x, y, r, pal, lw, pulse) {
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + r * 0.78, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.78, y); c.closePath();
    c.fillStyle = pal.obj;
    c.globalAlpha = 0.78 + pulse * 0.22;
    c.fill();
    c.globalAlpha = 1;
    c.lineWidth = lw;
    c.strokeStyle = pal.objEdge;
    c.stroke();
  }
  const pencilDoorGeo = new WeakMap(); // runtime door record → symbol geometry (never written onto the record)
  /** Door leaves (as last seen — see doorShown), in map space scaled by s. pencil doors only where seen. */
  function doorLeaves(c, A, m, s, pal, cx0, cy0, rad, S) {
    if (!m || !m.doors) return;
    c.lineCap = 'round';
    const lwInk = Math.max(1.4 * dpr(), s * 0.09), lwP = Math.max(1 * dpr(), s * 0.06);
    const geo = A ? A.doorById || (A.doorById = Object.fromEntries(A.doors.map((d) => [d.id, d]))) : null;
    const M = doorMemFor(m.id);
    for (let k = 0; k < m.doors.length; k++) {
      const d = m.doors[k];
      if (!d) continue;
      if (rad > 0 && (Math.abs(d.x + 0.5 - cx0) > rad || Math.abs(d.y + 0.5 - cy0) > rad)) continue;
      let g = geo && geo[d.id];
      let pencilDoor = false;
      if (!g || !A || !A.drawn || pal.graph) {   // off the drawing: only doors you have seen, in pencil
        if (!S || !S[d.y * m.w + d.x]) continue;
        g = pencilDoorGeo.get(d);
        if (!g) { g = doorGeom(d, (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? -1 : m.wall[y * m.w + x] ? C_WALL : C_IN), () => ''); pencilDoorGeo.set(d, g); }
        pencilDoor = true;
      }
      const o = doorShown(A, m, k, d, M);
      const a = g.a0 + (g.a1 - g.a0) * o;
      if (o > 0.04) { // the swing, from shut to where the leaf is now
        c.beginPath();
        c.moveTo((g.hx + Math.cos(g.a0) * g.len) * s, (g.hy + Math.sin(g.a0) * g.len) * s);
        c.arc(g.hx * s, g.hy * s, g.len * s, g.a0, a, g.a1 < g.a0);
        c.strokeStyle = pencilDoor ? pal.pencilSoft : pal.faint;
        c.lineWidth = Math.max(1, lwP * 0.6);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(g.hx * s, g.hy * s);
      c.lineTo((g.hx + Math.cos(a) * g.len) * s, (g.hy + Math.sin(a) * g.len) * s);
      c.strokeStyle = pencilDoor ? pal.pencil : pal.text;
      c.lineWidth = pencilDoor ? lwP : lwInk;
      c.stroke();
    }
    c.lineCap = 'butt';
  }
  function drawMini() {
    if (!mini.ctx) return 0;
    if (mini.dirtySize && !measureMini()) return 0;
    if (!mini.size) return 0;
    const t0 = performance.now();
    const W = world(), m = curMap(), P = player(), id = curMapId();
    if (!W || !m || !P || !id) return 0;
    const palName = paletteName(id), pal = PALS[palName];
    const L = ensureMiniLayers(id, m, palName);
    const A = analysis(id);
    const c = mini.ctx, D = mini.size, cx = D / 2, cy = D / 2, R = mini.R, ppc = mini.ppc, F = mini.fx, dp = dpr();
    const rot = -Math.PI / 2 - P.angle + F.fjr;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.setLineDash(DASH_NONE);
    setLS(c, '0px');
    c.clearRect(0, 0, D, D);
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.clip();
    c.fillStyle = mini.ground;
    c.fillRect(0, 0, D, D);
    // ---- map space (rotating)
    c.save();
    c.translate(cx + F.fjx, cy + F.fjy);
    c.rotate(rot);
    c.translate(-P.x * ppc, -P.y * ppc);
    const vr = R * 1.45;
    c.fillStyle = mini.pattern;
    c.fillRect(P.x * ppc - vr, P.y * ppc - vr, vr * 2, vr * 2);
    // grid: 2-cell module, stronger every 10
    const g0x = Math.floor((P.x - VIEW_R * 1.5) / 2) * 2, g1x = P.x + VIEW_R * 1.5;
    const g0y = Math.floor((P.y - VIEW_R * 1.5) / 2) * 2, g1y = P.y + VIEW_R * 1.5;
    c.beginPath();
    for (let gx = g0x; gx <= g1x; gx += 2) { if (gx % 10 === 0) continue; c.moveTo(gx * ppc, g0y * ppc); c.lineTo(gx * ppc, g1y * ppc); }
    for (let gy = g0y; gy <= g1y; gy += 2) { if (gy % 10 === 0) continue; c.moveTo(g0x * ppc, gy * ppc); c.lineTo(g1x * ppc, gy * ppc); }
    c.strokeStyle = pal.grid;
    c.lineWidth = Math.max(1, dp * 0.8);
    c.stroke();
    c.beginPath();
    for (let gx = Math.ceil(g0x / 10) * 10; gx <= g1x; gx += 10) { c.moveTo(gx * ppc, g0y * ppc); c.lineTo(gx * ppc, g1y * ppc); }
    for (let gy = Math.ceil(g0y / 10) * 10; gy <= g1y; gy += 10) { c.moveTo(g0x * ppc, gy * ppc); c.lineTo(g1x * ppc, gy * ppc); }
    c.strokeStyle = pal.gridMajor;
    c.stroke();
    c.imageSmoothingEnabled = true;
    if (L.ink) c.drawImage(L.ink, 0, 0);
    if (L.pencil) c.drawImage(L.pencil, 0, 0);
    doorLeaves(c, A, m, ppc, pal, P.x, P.y, VIEW_R + 1.5, seenMaps[id]);
    c.restore();
    // ---- screen space (upright). The objective is placed first: room labels keep clear of it, the
    // sheet tag fades where it would sit under it, and a marker bearing (nearly) north is pulled in
    // below the N badge. It is drawn last, over the rim.
    const fnt = mini.fonts;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const a = Math.max(5 * dp, D * 0.046);
    const north = -Math.PI / 2 + rot, br = fnt.fs * 0.78;   // N badge: centred on the rim at `north`
    const t = DA.time || 0, pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    const hasT = liveTarget();
    let osx = 0, osy = 0, orim = false, oux = 0, ouy = 0, olx = 0, oly = 0;
    const orr = Math.max(4 * dp, ppc * 0.5);
    const bx = mini.boxes;
    let nb = 1;
    bx[0] = cx - a * 1.1; bx[1] = cy - a * 1.2; bx[2] = cx + a * 1.1; bx[3] = cy + a * 1.1;
    if (hasT) {
      const dx = (tgt.x - P.x) * ppc, dy = (tgt.y - P.y) * ppc;
      osx = cx + dx * cr - dy * sr; osy = cy + dx * sr + dy * cr;
      const ddx = osx - cx, ddy = osy - cy, dist = Math.hypot(ddx, ddy);
      let lim = R - 9 * dp;
      if (dist > 1e-3) {
        oux = ddx / dist; ouy = ddy / dist;
        let dn = Math.atan2(ouy, oux) - north;
        dn -= Math.round(dn / TAU) * TAU;
        const sep = Math.abs(dn) * R, near = br + orr, far = near + br + orr * 1.5;
        const k = clamp((far - sep) / (far - near), 0, 1);
        if (k > 0) lim -= k * (br + orr * 1.5);
      }
      if (dist > lim) { orim = true; osx = cx + oux * lim; osy = cy + ouy * lim; }
      const ex = orim ? oux * orr * 2.3 : 0, ey = orim ? ouy * orr * 2.3 : 0;   // the rim arrow's reach
      bx[4] = Math.min(osx - orr * 1.3, osx + ex - orr * 0.7); bx[5] = Math.min(osy - orr * 1.3, osy + ey - orr * 0.7);
      bx[6] = Math.max(osx + orr * 1.3, osx + ex + orr * 0.7); bx[7] = Math.max(osy + orr * 1.3, osy + ey + orr * 0.7);
      nb = 2;
      if (tgt.label) {
        oly = osy + (osy > cy ? -orr - fnt.fs * 0.9 : orr + fnt.fs * 0.9);
        olx = clamp(osx, cx - R * 0.6, cx + R * 0.6);
        const hw = tgt.label.length * fnt.fs * 0.36 + 2 * dp;
        bx[8] = olx - hw; bx[9] = oly - fnt.fs * 0.6; bx[10] = olx + hw; bx[11] = oly + fnt.fs * 0.6;
        nb = 3;
      }
    }
    // sheet tag along the bottom of the circle (fades out where the objective sits on it)
    c.font = fnt.tag;
    setLS(c, fnt.ls14S);
    const tagText = pal.graph ? 'NO DRAWING' : SHEETS[id] ? SHEETS[id].short : '';
    if (tagText) {
      if (mini.tagFont !== fnt.tag || mini.tagText !== tagText) { mini.tagFont = fnt.tag; mini.tagText = tagText; mini.tagHW = c.measureText(tagText).width / 2 + 2 * dp; }
      const tagY = pal.graph ? cy + R - fnt.fs * 1.82 : cy + R - fnt.fs * 1.25, tagHH = pal.graph ? fnt.fs * 1.15 : fnt.fs * 0.6;
      let tagA = 1;
      for (let q = 1; q < nb; q++) {
        const o = q * 4;
        const gx = Math.max(bx[o] - (cx + mini.tagHW), cx - mini.tagHW - bx[o + 2]);
        const gy = Math.max(bx[o + 1] - (tagY + tagHH), tagY - tagHH - bx[o + 3]);
        tagA = Math.min(tagA, clamp(Math.max(gx, gy) / (fnt.fs * 0.8), 0, 1));
      }
      if (tagA > 0.01) {
        if (pal.graph) {
          c.fillStyle = pal.stamp;
          c.globalAlpha = tagA;
          c.fillText('NO DRAWING', cx, cy + R - fnt.fs * 2.35);
          c.fillText('ON FILE', cx, cy + R - fnt.fs * 1.3);
        } else {
          c.fillStyle = pal.dim;
          c.globalAlpha = 0.55 * tagA;
          c.fillText(tagText, cx, tagY);
        }
        c.globalAlpha = 1;
      }
    }
    if (A && A.drawn && !pal.graph && A.labels.length) {
      const here = W.room ? W.room() : null;
      setLS(c, fnt.lsS);
      const lh = fnt.fs * 1.05, lim = (R - fnt.fs * 1.3) * (R - fnt.fs * 1.3);
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < A.labels.length; k++) {
          const Lb = A.labels[k];
          const cur = !!Lb.room && Lb.room === here;
          if ((pass === 0) !== cur) continue;
          const dx = (Lb.x - P.x) * ppc, dy = (Lb.y - P.y) * ppc;
          const sx = cx + F.fjx + dx * cr - dy * sr;
          let sy = cy + F.fjy + dx * sr + dy * cr;
          const ddx = sx - cx, ddy = sy - cy;
          if (ddx * ddx + ddy * ddy > lim) continue;
          const lines = labelLines(A, k);
          const font = Lb.small ? fnt.small : fnt.label;
          c.font = font;
          if (Lb.mwKey !== font) { let mw = 0; for (const ln of Lb.lines) mw = Math.max(mw, c.measureText(ln).width); Lb.mw = mw; Lb.mwKey = font; }
          const hw = Lb.mw / 2 + 2 * dp, hh = (lines.length * lh) / 2;
          { // the whole label must sit inside the circle
            const fx = Math.abs(sx - cx) + hw, fy = Math.abs(sy - cy) + hh;
            if (fx * fx + fy * fy > (R - 2 * dp) * (R - 2 * dp) && !cur) continue;
          }
          // the room you are in keeps its label, nudged clear of your arrow
          if (cur && sx + hw > bx[0] && sx - hw < bx[2] && sy + hh > bx[1] && sy - hh < bx[3]) sy = bx[3] + hh + 1 * dp;
          let hit = false;
          for (let q = cur ? 1 : 0; q < nb && !hit; q++) {
            const o = q * 4;
            if (sx + hw > bx[o] && sx - hw < bx[o + 2] && sy + hh > bx[o + 1] && sy - hh < bx[o + 3]) hit = true;
          }
          if (hit || nb >= 31) continue;
          const o = nb * 4;
          bx[o] = sx - hw; bx[o + 1] = sy - hh; bx[o + 2] = sx + hw; bx[o + 3] = sy + hh;
          nb++;
          const y0 = sy - ((lines.length - 1) * lh) / 2;
          c.lineWidth = fnt.fs * 0.34;
          c.strokeStyle = pal.halo;
          c.fillStyle = Lb.faint ? pal.dim : cur ? pal.text : pal.dim;
          c.globalAlpha = Lb.faint ? 0.75 : 1;
          for (let q = 0; q < lines.length; q++) { c.strokeText(lines[q], sx, y0 + q * lh); c.fillText(lines[q], sx, y0 + q * lh); }
          c.globalAlpha = 1;
        }
      }
    }
    setLS(c, '0px');
    // ---- you (and, in the collapse, the other places you also are)
    // a faint view wedge
    c.beginPath();
    c.moveTo(cx, cy);
    const fov = ((+((DA.settings && DA.settings.fov) || 66)) * Math.PI) / 180;
    c.arc(cx, cy, ppc * 3.2, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2);
    c.closePath();
    c.fillStyle = pal.graph ? 'rgba(20, 20, 18, 0.08)' : 'rgba(255, 255, 255, 0.07)';
    c.fill();
    for (let k = 0; k < 3; k++) {
      const gr = F.ghosts[k * 3 + 2];
      if (gr > 50) continue;
      const gx = F.ghosts[k * 3] * ppc, gy = F.ghosts[k * 3 + 1] * ppc;
      drawArrow(c, cx + gx * cr - gy * sr, cy + gx * sr + gy * cr, gr, a, pal.you, pal.youEdge, Math.max(1, dp), 0.55);
    }
    drawArrow(c, cx, cy, 0, a, pal.you, pal.youEdge, Math.max(1, dp), 1);
    const dark = mood.dark && mood.red;
    if (dark) {   // main power off: everything inside the rim seen under the red emergency lamps
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = pal.graph ? DARK_INK.mulPaper : DARK_INK.mul;   // light squared paper: darker, or it glows
      c.fillRect(0, 0, D, D);
      c.globalCompositeOperation = 'screen';
      c.fillStyle = DARK_INK.lift;
      c.fillRect(0, 0, D, D);
      c.globalCompositeOperation = 'source-over';
    } else if (mood.dark) {   // no red lamps here (the array, the roof): just darker
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = pal.graph ? DARK_INK.greyPaper : DARK_INK.grey;
      c.fillRect(0, 0, D, D);
      c.globalCompositeOperation = 'source-over';
    }
    c.restore(); // clip
    // ---- rim + compass ticks
    const rimC = dark ? DARK_INK.rim : pal.rim, rimDarkC = dark ? DARK_INK.rimDark : pal.rimDark;
    c.lineWidth = Math.max(1.5, dp * 2.2);
    c.strokeStyle = rimDarkC;
    c.beginPath(); c.arc(cx, cy, R + dp * 0.9, 0, TAU); c.stroke();
    c.lineWidth = Math.max(1, dp * 1.1);
    c.strokeStyle = rimC;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.beginPath(); c.arc(cx, cy, R - dp * 3.2, 0, TAU);
    c.lineWidth = Math.max(0.6, dp * 0.6);
    c.globalAlpha = 0.45;
    c.stroke();
    c.globalAlpha = 1;
    c.beginPath();
    for (let k = 0; k < 4; k++) {
      const an = north + (k * Math.PI) / 2, len = k === 0 ? 7 * dp : 3.5 * dp;
      c.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R);
      c.lineTo(cx + Math.cos(an) * (R - len), cy + Math.sin(an) * (R - len));
    }
    c.lineWidth = Math.max(1, dp * 1.3);
    c.strokeStyle = rimC;
    c.stroke();
    // N badge sitting on the rim
    const nx = cx + Math.cos(north) * R, ny = cy + Math.sin(north) * R;
    c.beginPath(); c.arc(nx, ny, br, 0, TAU);
    c.fillStyle = rimDarkC; c.fill();
    c.lineWidth = Math.max(1, dp); c.strokeStyle = rimC; c.stroke();
    c.font = fnt.n;
    c.fillStyle = dark ? DARK_INK.text : pal.graph ? '#e9e5d8' : pal.text;
    c.fillText('N', nx, ny + fnt.fs * 0.05);
    // ---- the objective, over the rim (a marker bearing north sits just inside the badge)
    if (hasT) {
      const lw = Math.max(1, dp * 0.9);
      if (orim) edgeArrow(c, osx, osy, oux, ouy, orr * 0.9, pal.obj, pal.objEdge, lw);
      drawDiamond(c, osx, osy, orr, pal, lw, pulse);
      if (tgt.label) {
        c.font = fnt.obj;
        setLS(c, fnt.lsS);
        c.lineWidth = fnt.fs * 0.34;
        c.strokeStyle = dark ? DARK_INK.halo : pal.halo;
        c.strokeText(tgt.label, olx, oly);
        c.fillStyle = pal.objText;
        c.fillText(tgt.label, olx, oly);
        setLS(c, '0px');
      }
    }
    const ms = performance.now() - t0;
    const st = mini.stats;
    st.n++; st.total += ms; st.last = ms; if (ms > st.max) st.max = ms;
    return ms;
  }
  const PLAN_KEEP_MS = 10000;
  function onFrame(dt) {
    if (!booted) return;
    // a folded plan keeps its sheet for a quick re-open, then lets the full-size canvases go
    if (plan.cache && !plan.open && plan.closedAt && performance.now() - plan.closedAt > PLAN_KEEP_MS) { plan.cache = null; plan.closedAt = 0; }
    const show = miniShouldShow();
    if (show !== mini.visible) { mini.visible = show; setMiniClass(); if (show) mini.acc = REDRAW_EVERY; }
    if (!show) return;
    mini.acc += dt || 0;
    if (mini.acc < REDRAW_EVERY) return;
    const now = performance.now();
    if (now - mini.lastReal < 22) return; // fast-forwarded tests: don't burn redraws
    mini.lastReal = now;
    updateEffects(mini.acc);
    mini.acc = 0;
    try { drawMini(); } catch (e) { report('draw', e); }
  }

  /* ============================================================ the full plan (mode 'plan') */
  const plan = { root: null, cv: null, ctx: null, hint: null, open: false, acc: 0, cache: null, objKey: '', objLines: null, dirtySize: true, closedAt: 0 };
  /** The station set has two sheets: the GROUND FLOOR (building + lot, larger scale) and the SITE PLAN. */
  const FLOOR_FRAME = { station: { x0: 11, y0: 5, x1: 50, y1: 34 } };
  function sheetVariant(id, A) {
    if (!A || !A.drawn) return { key: 'main', bounds: A ? A.bounds : null, sheet: SHEETS[id] };
    if (offSite(A)) return { key: 'woods', bounds: A.woods, sheet: null };
    const F = FLOOR_FRAME[id];
    if (!F) return { key: 'main', bounds: A.site, sheet: SHEETS[id] };
    const P = player();
    const inF = (x, y) => x >= F.x0 + 0.6 && x <= F.x1 - 0.6 && y >= F.y0 + 0.6 && y <= F.y1 - 0.6;
    let ok = !!P && inF(P.x, P.y);
    if (ok && tgt.valid && tgt.map === id && !inF(tgt.x, tgt.y)) ok = false;
    return ok ? { key: 'floor', bounds: F, sheet: SHEETS[id] } : { key: 'site', bounds: A.site, sheet: SHEETS[id + ':site'] || SHEETS[id] };
  }
  function fitFont(c, text, weight, size, maxW, family) {
    let f = size;
    for (let k = 0; k < 12; k++) {
      c.font = weight + ' ' + f.toFixed(1) + 'px ' + (family || FONT_UI);
      if (c.measureText(text).width <= maxW) break;
      f *= 0.92;
    }
    return f;
  }
  /** Build the static sheet (paper, frame, drawing, key, title block) for map `id`. */
  function buildSheet(id, W_, H_, V) {
    const m = curMap();
    const A = analysis(id);
    const palName = paletteName(id), pal = PALS[palName];
    const cv = mkCanvas(W_, H_), c = cv.getContext('2d');
    const dp = dpr();
    // ---- paper
    const g = c.createLinearGradient(0, 0, W_, H_);
    g.addColorStop(0, pal.sheet0);
    g.addColorStop(1, pal.sheet1);
    c.fillStyle = g;
    c.fillRect(0, 0, W_, H_);
    c.fillStyle = paperPattern(c, pal);
    c.fillRect(0, 0, W_, H_);
    const vg = c.createRadialGradient(W_ / 2, H_ / 2, H_ * 0.3, W_ / 2, H_ / 2, H_ * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, pal.graph ? 'rgba(40, 30, 10, 0.28)' : 'rgba(0, 8, 24, 0.4)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W_, H_);
    // ---- layout
    const m0 = H_ * 0.03, fi = H_ * 0.016;
    const ix0 = m0 + fi, iy0 = m0 + fi, ix1 = W_ - m0 - fi, iy1 = H_ - m0 - fi;
    const colW = Math.round(W_ * 0.215), colX = ix1 - colW;
    const pad = H_ * 0.03;
    const area = { x0: ix0 + pad, y0: iy0 + pad, x1: colX - pad, y1: iy1 - pad * 1.7 };
    const bounds = (V && V.bounds) || (m ? { x0: 0, y0: 0, x1: m.w, y1: m.h } : { x0: 0, y0: 0, x1: 10, y1: 10 });
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    const s = Math.max(2, Math.min((area.x1 - area.x0) / bw, (area.y1 - area.y0) / bh, H_ * 0.05));
    const ox = Math.round(area.x0 + ((area.x1 - area.x0) - bw * s) / 2 - bounds.x0 * s);
    const oy = Math.round(area.y0 + ((area.y1 - area.y0) - bh * s) / 2 - bounds.y0 * s);
    const draw = { x0: Math.max(area.x0, ox + bounds.x0 * s), y0: Math.max(area.y0, oy + bounds.y0 * s), x1: Math.min(area.x1, ox + bounds.x1 * s), y1: Math.min(area.y1, oy + bounds.y1 * s) };
    if (pal.graph) {
      c.beginPath();
      for (let x = ((ox % s) + s) % s; x < W_; x += s) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, H_); }
      for (let y = ((oy % s) + s) % s; y < H_; y += s) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(W_, Math.round(y) + 0.5); }
      c.strokeStyle = pal.grid; c.lineWidth = 1; c.stroke();
      c.beginPath();
      const s5 = s * 5, bx = ((ox % s5) + s5) % s5, by = ((oy % s5) + s5) % s5;
      for (let x = bx; x < W_; x += s5) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, H_); }
      for (let y = by; y < H_; y += s5) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(W_, Math.round(y) + 0.5); }
      c.strokeStyle = pal.gridMajor; c.stroke();
    }
    // folds: the sheet has lived folded in a pocket
    c.fillStyle = pal.crease;
    c.fillRect(Math.round(W_ / 2) - 1, 0, 2, H_);
    c.fillRect(0, Math.round(H_ / 2) - 1, W_, 2);
    c.fillStyle = pal.graph ? 'rgba(255,255,255,0.08)' : 'rgba(0, 10, 30, 0.12)';
    c.fillRect(Math.round(W_ / 2) + 1, 0, 1, H_);
    c.fillRect(0, Math.round(H_ / 2) + 1, W_, 1);
    // ---- frame
    const ink = pal.graph ? pal.soft : pal.line;
    c.strokeStyle = ink;
    c.lineWidth = Math.max(1, dp);
    c.strokeRect(Math.round(m0) + 0.5, Math.round(m0) + 0.5, Math.round(W_ - m0 * 2), Math.round(H_ - m0 * 2));
    c.lineWidth = Math.max(2, dp * 2.2);
    c.strokeRect(Math.round(ix0), Math.round(iy0), Math.round(ix1 - ix0), Math.round(iy1 - iy0));
    c.lineWidth = Math.max(1, dp * 1.2);
    c.beginPath(); c.moveTo(Math.round(colX) + 0.5, iy0); c.lineTo(Math.round(colX) + 0.5, iy1); c.stroke();
    // zone marks along the frame
    const fz = Math.max(7 * dp, H_ * 0.015);
    c.font = '500 ' + fz.toFixed(1) + 'px ' + FONT_UI;
    c.fillStyle = pal.dim;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 6; k++) {
      const zx = ix0 + ((ix1 - ix0) * (k + 0.5)) / 6;
      c.fillText(String(k + 1), zx, (m0 + iy0) / 2 + 0.5);
      c.fillText(String(k + 1), zx, (iy1 + H_ - m0) / 2 + 0.5);
    }
    for (let k = 0; k < 4; k++) {
      const zy = iy0 + ((iy1 - iy0) * (k + 0.5)) / 4;
      c.fillText('ABCD'[k], (m0 + ix0) / 2, zy);
      c.fillText('ABCD'[k], (ix1 + W_ - m0) / 2, zy);
    }
    // ---- the drawing
    let inkLayer = null;
    try { inkLayer = pal.graph ? null : renderInk(A, s, pal, true); } catch (e) { report('plan ink', e); }
    if (inkLayer) {
      c.save();
      c.beginPath(); c.rect(draw.x0, draw.y0, draw.x1 - draw.x0, draw.y1 - draw.y0); c.clip();
      c.drawImage(inkLayer, ox, oy);
      c.restore();
    }
    const fs = clamp(s * 0.5, 8 * dp, 14 * dp);
    const fonts = {
      fs, label: '600 ' + fs.toFixed(1) + 'px ' + FONT_UI, small: '500 ' + (fs * 0.8).toFixed(1) + 'px ' + FONT_UI,
      no: '400 ' + (fs * 0.7).toFixed(1) + 'px ' + FONT_UI, you: '700 ' + (fs * 0.86).toFixed(1) + 'px ' + FONT_UI,
      obj: '700 ' + (fs * 0.86).toFixed(1) + 'px ' + FONT_UI, ls: fs * 0.12,
    };
    if (A && A.drawn && !pal.graph) {
      // stair / ladder / hatch notes
      c.save();
      c.beginPath(); c.rect(draw.x0, draw.y0, draw.x1 - draw.x0, draw.y1 - draw.y0); c.clip();
      c.font = fonts.small;
      c.fillStyle = pal.text;
      c.textBaseline = 'middle';
      spacing(c, fonts.ls);
      for (const sy of A.syms) {
        let tx, ty, text;
        if (sy.kind === 'hatch') { tx = (sy.x + 0.6) * s + ox; ty = sy.y * s + oy; text = 'HATCH'; c.textAlign = 'left'; }
        else if (sy.kind === 'stair') { tx = (sy.x + 0.5 + sy.dx * 2.75) * s + ox; ty = (sy.y + 0.5 + sy.dy * 2.75) * s + oy; text = sy.down ? 'DN' : 'UP'; c.textAlign = 'center'; }
        else { tx = (sy.x + 0.5 + sy.dx * 1.15) * s + ox; ty = (sy.y + 0.5 + sy.dy * 1.15) * s + oy + fs * 1.3; text = sy.down ? 'LADDER DN' : 'LADDER UP'; c.textAlign = 'center'; }
        c.fillText(text, tx, ty);
      }
      spacing(c, 0);
      if (id === 'station' && V && V.key === 'floor') {
        // where the drawing is cut: the drive runs on to the county road
        c.textAlign = 'center';
        c.fillStyle = pal.dim;
        c.font = fonts.small;
        spacing(c, fonts.ls);
        const dx = ox + 25.5 * s, dy = Math.min(draw.y1 - fs * 0.9, oy + 33.4 * s);
        c.fillText('TO CO. RTE 9 ↓', dx, dy);
        spacing(c, 0);
      }
      c.restore();
    }
    // ---- scale bar (bottom-left, under the drawing) + north arrow (top-right of the drawing)
    const sby = iy1 - pad * 0.95, sbx = area.x0, segCells = 10 / 6.56;
    c.lineWidth = Math.max(1, dp);
    c.strokeStyle = ink;
    for (let k = 0; k < 3; k++) {
      const x = sbx + k * segCells * s;
      c.strokeRect(x, sby - fs * 0.22, segCells * s, fs * 0.44);
      if (k % 2 === 0) { c.fillStyle = ink; c.fillRect(x, sby - fs * 0.22, segCells * s, fs * 0.44); }
    }
    c.font = fonts.no;
    c.fillStyle = pal.dim;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k <= 3; k++) c.fillText(String(k * 10), sbx + k * segCells * s, sby + fs * 0.85);
    c.textAlign = 'left';
    c.fillText('FT', sbx + 3 * segCells * s + fs * 0.9, sby + fs * 0.85);
    c.font = '600 ' + (fs * 0.78).toFixed(1) + 'px ' + FONT_UI;
    spacing(c, fs * 0.12);
    const vTitle = V && V.sheet ? V.sheet.title : pal.graph ? 'FIELD SKETCH' : '';
    c.fillStyle = pal.text;
    c.fillText(pal.graph || /PLAN$/.test(vTitle) ? vTitle : vTitle + ' PLAN', sbx + 3 * segCells * s + fs * 3.2, sby);
    spacing(c, 0);
    const nr = Math.max(fs * 1.2, H_ * 0.03), ncx = area.x1 - nr * 1.2, ncy = area.y0 + nr * 1.6;
    c.beginPath(); c.arc(ncx, ncy, nr, 0, TAU); c.strokeStyle = ink; c.lineWidth = Math.max(1, dp); c.stroke();
    c.beginPath(); c.moveTo(ncx, ncy - nr * 0.92); c.lineTo(ncx + nr * 0.34, ncy + nr * 0.5); c.lineTo(ncx, ncy + nr * 0.25); c.closePath(); c.fillStyle = ink; c.fill();
    c.beginPath(); c.moveTo(ncx, ncy - nr * 0.92); c.lineTo(ncx - nr * 0.34, ncy + nr * 0.5); c.lineTo(ncx, ncy + nr * 0.25); c.closePath(); c.stroke();
    c.font = fonts.label; c.textAlign = 'center'; c.fillStyle = ink;
    c.fillText('N', ncx, ncy - nr - fs * 0.7);
    // ---- right column
    const cx0 = colX + H_ * 0.02, cx1 = ix1 - H_ * 0.02, cw = cx1 - cx0;
    const tf = Math.max(7.5 * dp, H_ * 0.0172);
    const T = (w8, k) => w8 + ' ' + (tf * k).toFixed(1) + 'px ' + FONT_UI;
    let y = iy0 + tf * 1.6;
    /*
     * The CURRENT OBJECTIVE block (drawn live, between the key and the revisions) wants room for its
     * header, three lines of text, the VIA / NO MARK line and YOU: — OBJ_NEED × tf. The lettering has
     * a floor of 7.5 px and the sheet does not, so on small sheets the column gives way in this
     * order: the revision table drops its oldest rows (then goes), the key rows close up, the two
     * least useful key entries go (OBJ_MIN), and finally drawPlan clamps the objective text.
     */
    const tbH = pal.graph ? tf * 7.6 : tf * 12.4;
    const tbY = iy1 - H_ * 0.02 - tbH;
    const OBJ_NEED = 7.7, OBJ_MIN = 5.3;
    const keyAll = pal.graph ? 3 : 7;
    const roomWith = (rh, n) => tbY - tf - (y + tf * 2 + n * rh + tf); // objective room with no revision table
    let rowH = tf * 1.72, keyMinor = true;
    if (roomWith(rowH, keyAll) < OBJ_NEED * tf) rowH = clamp((tbY - tf - OBJ_NEED * tf - y - tf * 3) / keyAll, tf * 1.45, tf * 1.72);
    if (!pal.graph && roomWith(rowH, keyAll) < OBJ_MIN * tf) keyMinor = false;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = pal.text;
    c.font = T(700, 1.05);
    spacing(c, tf * 0.18);
    c.fillText(pal.graph ? 'KEY (PENCIL)' : 'KEY', cx0, y + tf);
    spacing(c, 0);
    y += tf * 2;
    const sym = tf * 1.5;
    const keyItem = (label, drawSym) => {
      c.save(); c.translate(cx0 + sym / 2, y + rowH / 2 - tf * 0.28); drawSym(c); c.restore();
      c.font = T(500, 0.84); c.fillStyle = pal.dim; spacing(c, tf * 0.05);
      fitFont(c, label, 500, tf * 0.84, cw - sym * 1.5);
      c.fillText(label, cx0 + sym * 1.45, y + rowH / 2); spacing(c, 0);
      y += rowH;
    };
    keyItem('YOU ARE HERE', (k) => drawArrow(k, 0, 0, Math.PI / 4, sym * 0.42, pal.you, pal.youEdge, Math.max(1, dp), 1));
    keyItem('OBJECTIVE', (k) => drawDiamond(k, 0, 0, sym * 0.36, pal, Math.max(1, dp), 1));
    if (!pal.graph) {
      keyItem('DOOR (OPEN / SHUT)', (k) => { k.strokeStyle = pal.text; k.lineWidth = Math.max(1, dp * 1.5); k.beginPath(); k.moveTo(-sym * 0.4, sym * 0.3); k.lineTo(-sym * 0.4, -sym * 0.3); k.stroke(); k.setLineDash([2 * dp, 2 * dp]); k.strokeStyle = pal.soft; k.lineWidth = Math.max(1, dp * 0.8); k.beginPath(); k.arc(-sym * 0.4, sym * 0.3, sym * 0.6, -Math.PI / 2, 0); k.stroke(); k.setLineDash(DASH_NONE); });
      if (keyMinor) keyItem('WINDOW', (k) => { k.strokeStyle = pal.soft; k.lineWidth = Math.max(1, dp * 0.8); k.strokeRect(-sym * 0.45, -sym * 0.12, sym * 0.9, sym * 0.24); k.strokeStyle = pal.line; k.beginPath(); k.moveTo(-sym * 0.45, 0); k.lineTo(sym * 0.45, 0); k.stroke(); });
      keyItem('STAIR / LADDER', (k) => { k.strokeStyle = pal.line; k.lineWidth = Math.max(1, dp * 0.8); k.strokeRect(-sym * 0.25, -sym * 0.45, sym * 0.5, sym * 0.9); k.beginPath(); for (let q = 1; q < 5; q++) { k.moveTo(-sym * 0.25, -sym * 0.45 + q * sym * 0.18); k.lineTo(sym * 0.25, -sym * 0.45 + q * sym * 0.18); } k.stroke(); });
      if (keyMinor) keyItem('SOLID CONSTRUCTION', (k) => { k.strokeStyle = pal.line; k.lineWidth = Math.max(1, dp); k.fillStyle = pal.poche; k.fillRect(-sym * 0.4, -sym * 0.3, sym * 0.8, sym * 0.6); k.strokeRect(-sym * 0.4, -sym * 0.3, sym * 0.8, sym * 0.6); k.save(); k.beginPath(); k.rect(-sym * 0.4, -sym * 0.3, sym * 0.8, sym * 0.6); k.clip(); k.beginPath(); for (let q = -4; q < 5; q++) { k.moveTo(q * sym * 0.16 - sym * 0.4, sym * 0.3); k.lineTo(q * sym * 0.16 + sym * 0.2, -sym * 0.3); } k.strokeStyle = pal.hatch; k.stroke(); k.restore(); });
    }
    keyItem(pal.graph ? 'WHAT I HAVE SEEN' : 'FIELD SKETCH (PENCIL)', (k) => { k.strokeStyle = pal.pencil; k.lineWidth = Math.max(1, dp * 1.1); k.lineCap = 'round'; k.beginPath(); k.moveTo(-sym * 0.45, sym * 0.2); k.quadraticCurveTo(0, sym * 0.05, sym * 0.45, sym * 0.25); k.moveTo(-sym * 0.4, -sym * 0.2); k.quadraticCurveTo(0, -sym * 0.28, sym * 0.42, -sym * 0.16); k.stroke(); });
    y += tf * 0.5;
    c.strokeStyle = ink; c.lineWidth = Math.max(1, dp * 0.8);
    c.beginPath(); c.moveTo(cx0, y); c.lineTo(cx1, y); c.stroke();
    const objBox = { x: cx0, y: y + tf * 0.5, w: cw };
    // ---- title block (bottom of the column) + revisions
    c.lineWidth = Math.max(1, dp * 1.2);
    c.strokeRect(cx0, tbY, cw, tbH);
    const sh = V && V.sheet;
    const revTop = (n) => (n > 0 ? tbY - tf * (1.7 + n * 1.15 + 0.55 + 0.5) : tbY - tf);
    let revRows = 0;
    if (!pal.graph && sh) {
      revRows = REVISIONS.length;
      while (revRows > 0 && revTop(revRows) - objBox.y < OBJ_NEED * tf) revRows--;
    }
    if (!pal.graph && sh) {
      if (revRows > 0) {
        let ry = tbY - tf * (1.7 + revRows * 1.15);
        c.font = T(700, 0.7); c.fillStyle = pal.dim; spacing(c, tf * 0.08);
        c.fillText('REV', cx0 + tf * 0.2, ry); c.fillText('DATE', cx0 + tf * 2.3, ry); c.fillText('DESCRIPTION', cx0 + tf * 5.8, ry);
        c.beginPath(); c.moveTo(cx0, ry + tf * 0.4); c.lineTo(cx1, ry + tf * 0.4); c.stroke();
        c.font = T(400, 0.7);
        for (let q = 0; q < revRows; q++) { const [rv, dt, ds] = REVISIONS[q]; ry += tf * 1.15; c.fillText(rv, cx0 + tf * 0.45, ry); c.fillText(dt, cx0 + tf * 2.3, ry); c.fillText(ds, cx0 + tf * 5.8, ry); }
      }
      spacing(c, 0);
      let ty = tbY + tf * 1.5;
      const tx = cx0 + tf * 0.6, tw = cw - tf * 1.2;
      c.fillStyle = pal.dim; spacing(c, tf * 0.14);
      fitFont(c, 'EMERGENCY RELAY NETWORK', 500, tf * 0.72, tw);
      c.fillText('EMERGENCY RELAY NETWORK', tx, ty);
      ty += tf * 2.1;
      c.fillStyle = pal.text; spacing(c, tf * 0.1);
      fitFont(c, 'RELAY STATION 14', 700, tf * 1.42, tw);
      c.fillText('RELAY STATION 14', tx, ty);
      ty += tf * 1.7;
      fitFont(c, sh.title, 600, tf * 1.12, tw);
      c.fillText(sh.title, tx, ty);
      ty += tf * 1.5;
      c.fillStyle = pal.dim;
      fitFont(c, 'DRAWN 1978, REV. 4', 500, tf * 0.9, tw);
      c.fillText('DRAWN 1978, REV. 4', tx, ty);
      spacing(c, 0);
      ty += tf * 0.95;
      c.beginPath(); c.moveTo(cx0, ty); c.lineTo(cx1, ty); c.moveTo(cx0 + cw / 2, ty); c.lineTo(cx0 + cw / 2, tbY + tbH); c.stroke();
      const cell = (label, val, x, yy) => { c.font = T(500, 0.6); c.fillStyle = pal.dim; spacing(c, tf * 0.12); c.fillText(label, x, yy); c.fillStyle = pal.text; fitFont(c, val, 600, tf * 0.84, cw / 2 - tf * 0.8); c.fillText(val, x, yy + tf * 1.05); spacing(c, 0); };
      cell('SCALE', sh.scale || '1/16" = 1\'-0"', cx0 + tf * 0.45, ty + tf * 1.1);
      cell('SHEET', sh.sheet, cx0 + cw / 2 + tf * 0.45, ty + tf * 1.1);
      c.beginPath(); c.moveTo(cx0, ty + tf * 2.75); c.lineTo(cx1, ty + tf * 2.75); c.stroke();
      cell('DRAWN', 'R.M.', cx0 + tf * 0.45, ty + tf * 3.8);
      cell('DWG. NO.', sh.dwg, cx0 + cw / 2 + tf * 0.45, ty + tf * 3.8);
    } else {
      // no drawing on file: a hand-lettered note where the title block should be
      const note = 'SKETCH — ' + (PENCIL_NOTE[id + ':' + (V ? V.key : '')] || PENCIL_NOTE[id] || 'NO DRAWING');
      const hs = fitFont(c, note, 400, tf * 1.02, cw - tf * 1.4, FONT_TYPE);
      handText(c, note, cx0 + tf * 0.6, tbY + tf * 2.3, hs, pal.pencil, 3);
      handText(c, 'BY ' + String((DA.state && DA.state.playerName) || 'OPERATOR').toUpperCase().slice(0, 16), cx0 + tf * 0.6, tbY + tf * 4.3, tf * 0.92, pal.pencil, 5);
      handText(c, (DA.clock && DA.clock.date ? DA.clock.date() : '27 OCT 1999'), cx0 + tf * 0.6, tbY + tf * 6.2, tf * 0.92, pal.pencil, 7);
    }
    objBox.h = revTop(revRows) - objBox.y;
    objBox.rev = revRows;
    // ---- NO DRAWING ON FILE
    if (pal.graph) stamp(c, (area.x0 + area.x1) / 2, area.y0 + (area.y1 - area.y0) * 0.08, Math.max(12 * dp, H_ * 0.036), pal);
    // ---- 2049: yellowing + stains over the whole sheet
    if (pal.aged) {
      const yg = c.createLinearGradient(0, 0, W_, H_);
      yg.addColorStop(0, 'rgba(190, 160, 60, 0.10)'); yg.addColorStop(1, 'rgba(120, 90, 20, 0.2)');
      c.fillStyle = yg; c.fillRect(0, 0, W_, H_);
      for (let k = 0; k < 5; k++) {
        const x = hr(k, 201) * W_, yy = hr(k, 202) * H_, r = H_ * (0.08 + hr(k, 203) * 0.18);
        const sg = c.createRadialGradient(x, yy, r * 0.2, x, yy, r);
        sg.addColorStop(0, 'rgba(130, 100, 40, 0.08)'); sg.addColorStop(0.85, 'rgba(130, 100, 40, 0.14)'); sg.addColorStop(0.95, 'rgba(100, 66, 20, 0.34)'); sg.addColorStop(1, 'rgba(100, 66, 20, 0)');
        c.fillStyle = sg;
        c.beginPath();
        for (let q = 0; q <= 30; q++) { const an = (q / 30) * TAU, rr = r * (0.84 + hr(k * 40 + q, 204) * 0.22); if (q) c.lineTo(x + Math.cos(an) * rr, yy + Math.sin(an) * rr); else c.moveTo(x + Math.cos(an) * rr, yy + Math.sin(an) * rr); }
        c.fill();
      }
    }
    return { cv, map: id, pal, palName, A, s, ox, oy, area: draw, fonts, objBox, tf, pencil: null, pctx: null, pver: -1, W: W_, H: H_, variant: V ? V.key : 'main' };
  }
  /** a line of pencil lettering: typewriter face, per-letter wobble */
  function handText(c, text, x, y, size, col, seed) {
    c.save();
    c.fillStyle = col;
    c.font = '400 ' + size.toFixed(1) + 'px ' + FONT_TYPE;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    let cx = x;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      c.save();
      c.translate(cx, y + (hr(seed * 97 + k, 1) - 0.5) * size * 0.14);
      c.rotate((hr(seed * 97 + k, 2) - 0.5) * 0.12 - 0.03);
      c.globalAlpha = 0.72 + hr(seed * 97 + k, 3) * 0.28;
      c.fillText(ch, 0, 0);
      c.restore();
      cx += c.measureText(ch).width * 0.98;
    }
    c.restore();
  }
  function stamp(c, x, y, size, pal) {
    c.save();
    c.translate(x, y);
    c.rotate(-0.09);
    c.font = '700 ' + size.toFixed(1) + 'px ' + FONT_UI;
    spacing(c, size * 0.14);
    const text = 'NO DRAWING ON FILE';
    const tw = c.measureText(text).width, bw = tw + size * 1.4, bh = size * 1.9;
    c.strokeStyle = pal.stamp;
    c.fillStyle = pal.stamp;
    c.lineWidth = size * 0.1;
    c.strokeRect(-bw / 2, -bh / 2, bw, bh);
    c.lineWidth = size * 0.04;
    c.strokeRect(-bw / 2 + size * 0.2, -bh / 2 + size * 0.2, bw - size * 0.4, bh - size * 0.4);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, size * 0.06);
    spacing(c, 0);
    // ink voids
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 140; k++) { c.globalAlpha = 0.3 + hr(k, 301) * 0.5; c.fillRect(-bw / 2 + hr(k, 302) * bw, -bh / 2 + hr(k, 303) * bh, size * 0.05 + hr(k, 304) * size * 0.08, size * 0.04); }
    c.restore();
  }
  /** size the sheet's backing store from its CSS layout size (stable through the unfold animation) */
  function measurePlan() {
    if (!plan.cv) return false;
    plan.cv.style.width = plan.cv.style.height = '';   // back to the stylesheet's 126u × 78u
    const r = layoutSize(plan.cv);
    if (r.w < 20 || r.h < 20) return false;
    const d = dpr(), W_ = Math.round(r.w * d), H_ = Math.round(r.h * d);
    if (plan.cv.width !== W_ || plan.cv.height !== H_) { plan.cv.width = W_; plan.cv.height = H_; plan.cache = null; }
    plan.cv.style.width = (W_ / d).toFixed(3) + 'px';
    plan.cv.style.height = (H_ / d).toFixed(3) + 'px';
    plan.dirtySize = false;
    return true;
  }
  function planCache() {
    const id = curMapId(), m = curMap();
    if (!id || !m || !plan.cv) return null;
    const palName = paletteName(id);
    const V = sheetVariant(id, analysis(id));
    const date = DA.clock && DA.clock.date ? DA.clock.date() : '';
    const C = plan.cache;
    if (!C || C.map !== id || C.palName !== palName || C.variant !== V.key || C.W !== plan.cv.width || C.H !== plan.cv.height || (C.pal.graph && C.date !== date)) {
      try { plan.cache = buildSheet(id, plan.cv.width, plan.cv.height, V); plan.cache.date = date; } catch (e) { report('sheet', e); plan.cache = null; return null; }
    }
    const P = plan.cache;
    const ver = seenVer[id] || 0;
    if (P.pver !== ver || !P.pencil) {
      if (!P.pencil) { P.pencil = mkCanvas(m.w * P.s, m.h * P.s); P.pctx = P.pencil.getContext('2d'); }
      P.pctx.clearRect(0, 0, P.pencil.width, P.pencil.height);
      const S = seenFor(id, m);
      try { drawPencil(P.pctx, P.A, m, P.s, P.pal, S, true); } catch (e) { report('plan pencil', e); }
      P.pver = ver;
    }
    return P;
  }
  function wrapLines(c, text, maxW, max) {
    const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (line && c.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out.slice(0, max || 4);
  }
  /** keep the first n lines; the last one kept ends in '…' when text was cut (current font) */
  function clampLines(c, lines, n, maxW) {
    if (lines.length <= n) return lines;
    const out = lines.slice(0, n);
    let last = out[n - 1];
    while (c.measureText(last + '…').width > maxW) {   // whole words first, characters only for one long word
      const cut = last.lastIndexOf(' ');
      if (cut > 0) last = last.slice(0, cut); else if (last.length > 1) last = last.slice(0, -1); else break;
    }
    out[n - 1] = last.replace(/[\s,.;:—(-]+$/, '') + '…';
    return out;
  }
  /**
   * The plan's CURRENT OBJECTIVE block inside ob (x, y, w, h — the room above the revisions): the
   * text lines, then one slot for VIA … / NO MARK ON THIS SHEET, then YOU: yg below that. Tightens the
   * spacing, then drops lines ('…'), then YOU: / the note, so nothing is drawn past ob.y + ob.h.
   * (current font = the objective's)
   */
  function objLayout(c, text, ob, tf) {
    const maxW = ob.w - tf * 1.4;
    const all = text ? wrapLines(c, text, maxW, 4) : ['—'];
    const fits = (n, lh, yg) => tf * 2.35 + n * lh + yg <= ob.h + 0.01;
    let lh = tf * 1.2, yg = tf * 1.7;
    if (!fits(all.length, lh, yg)) { lh = tf * 1.08; yg = tf * 1.35; }
    let n = all.length;
    while (n > 1 && !fits(n, lh, yg)) n--;
    const you = fits(n, lh, yg);
    const note = you || tf * 2.35 + n * lh <= ob.h + 0.01;
    return { lines: clampLines(c, all, n, maxW), lh, yg, you, note };
  }
  /** clamp (x, y) into the rect r (inset by m); returns 1 when it had to move */
  const clampPt = { x: 0, y: 0, out: 0, ax: 0, ay: 0 };
  function clampInto(x, y, r, m) {
    const cx = clamp(x, r.x0 + m, r.x1 - m), cy = clamp(y, r.y0 + m, r.y1 - m);
    clampPt.out = cx !== x || cy !== y ? 1 : 0;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    clampPt.x = cx; clampPt.y = cy; clampPt.ax = dx / d; clampPt.ay = dy / d;
    return clampPt.out;
  }
  function edgeArrow(c, x, y, ux, uy, r, fill, edge, lw) {
    const nx = -uy, ny = ux, tx = x + ux * r * 1.5, ty = y + uy * r * 1.5;
    c.beginPath();
    c.moveTo(tx + ux * r, ty + uy * r); c.lineTo(tx + nx * r * 0.65, ty + ny * r * 0.65); c.lineTo(tx - nx * r * 0.65, ty - ny * r * 0.65); c.closePath();
    c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = edge; c.stroke();
  }
  function drawPlan() {
    if (!plan.ctx || !plan.open) return;
    if (plan.dirtySize && !measurePlan()) return;
    const P = planCache();
    if (!P) return;
    const c = plan.ctx, W_ = plan.cv.width, H_ = plan.cv.height, pal = P.pal, A = P.A, dp = dpr();
    const Pl = player(), m = curMap(), W = world();
    if (!Pl || !m) return;
    updateEffects(plan.acc || REDRAW_EVERY);
    const F = mini.fx, col = collapseLevel();
    const jx = F.fjx * 1.4, jy = F.fjy * 1.4;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W_, H_);
    c.drawImage(P.cv, 0, 0);
    const ar = P.area, ox = P.ox + jx, oy = P.oy + jy, s = P.s;
    if (col > 0 || F.flickT) {
      // the drawing shivers: a displaced ghost of the ink
      c.save();
      c.beginPath(); c.rect(ar.x0, ar.y0, ar.x1 - ar.x0, ar.y1 - ar.y0); c.clip();
      c.globalAlpha = 0.22 + col * 0.25;
      c.drawImage(P.cv, ar.x0, ar.y0, ar.x1 - ar.x0, ar.y1 - ar.y0, ar.x0 + jx * 2, ar.y0 + jy * 2, ar.x1 - ar.x0, ar.y1 - ar.y0);
      c.restore();
    }
    c.save();
    c.beginPath(); c.rect(ar.x0, ar.y0, ar.x1 - ar.x0, ar.y1 - ar.y0); c.clip();
    if (P.pencil) c.drawImage(P.pencil, ox, oy);
    // live door leaves
    c.save();
    c.translate(ox, oy);
    doorLeaves(c, A, m, s, pal, 0, 0, 0, seenMaps[curMapId()]);
    c.restore();
    // labels (live, so the collapse can scramble them)
    const f = P.fonts;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    if (A && A.drawn && !pal.graph) {
      for (let k = 0; k < A.labels.length; k++) {
        const Lb = A.labels[k];
        const lines = labelLines(A, k);
        const x = ox + Lb.x * s, y = oy + Lb.y * s;
        c.font = Lb.small ? f.small : f.label;
        spacing(c, f.ls);
        const lh = f.fs * 1.1, y0 = y - ((lines.length - 1) * lh) / 2 - (Lb.no ? f.fs * 0.3 : 0);
        c.lineWidth = f.fs * 0.3;
        c.strokeStyle = pal.halo;
        c.fillStyle = Lb.faint ? pal.dim : pal.text;
        for (let q = 0; q < lines.length; q++) { c.strokeText(lines[q], x, y0 + q * lh); c.fillText(lines[q], x, y0 + q * lh); }
        if (Lb.no) {
          c.font = f.no;
          spacing(c, f.ls * 0.5);
          c.fillStyle = pal.dim;
          c.fillText(Lb.no, x, y0 + lines.length * lh - f.fs * 0.1);
        }
      }
      spacing(c, 0);
    }
    c.restore();
    // objective
    const pulse = 0.5 + 0.5 * Math.sin((DA.time || 0) * 4.2);
    const hasT = liveTarget();
    if (hasT) {
      const r = Math.max(5 * dp, s * 0.46);
      let tx = ox + tgt.x * s, ty = oy + tgt.y * s;
      const out = clampInto(tx, ty, ar, r * 2.4);
      tx = clampPt.x; ty = clampPt.y;
      if (out) edgeArrow(c, tx, ty, clampPt.ax, clampPt.ay, r, pal.obj, pal.objEdge, Math.max(1, dp));
      else { c.beginPath(); c.arc(tx, ty, r * (1.5 + pulse * 0.5), 0, TAU); c.strokeStyle = pal.obj; c.globalAlpha = 0.35 * (1 - pulse * 0.5); c.lineWidth = Math.max(1, dp); c.stroke(); c.globalAlpha = 1; }
      drawDiamond(c, tx, ty, r, pal, Math.max(1, dp), pulse);
      if (tgt.label) {
        c.font = f.obj; spacing(c, f.ls);
        const leftSide = tx > ar.x1 - f.fs * 8;
        c.textAlign = leftSide ? 'right' : 'left';
        c.lineWidth = f.fs * 0.3; c.strokeStyle = pal.halo; c.fillStyle = pal.objText;
        const lx = tx + (leftSide ? -1 : 1) * r * 1.5;
        c.strokeText(tgt.label, lx, ty); c.fillText(tgt.label, lx, ty);
        spacing(c, 0);
      }
    }
    // you are here (+ the other places you are, in the collapse)
    const a = Math.max(6 * dp, s * 0.6);
    let yx = ox + Pl.x * s, yy = oy + Pl.y * s;
    const yOut = clampInto(yx, yy, ar, a * 2);
    const yax = clampPt.ax, yay = clampPt.ay;
    yx = clampPt.x; yy = clampPt.y;
    const ang = Pl.angle + Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const gr = F.ghosts[k * 3 + 2];
      if (gr > 50) continue;
      drawArrow(c, yx + F.ghosts[k * 3] * s * 1.6, yy + F.ghosts[k * 3 + 1] * s * 1.6, ang + gr, a, pal.you, pal.youEdge, Math.max(1, dp), 0.55);
    }
    if (yOut) edgeArrow(c, yx, yy, yax, yay, a * 0.8, pal.you, pal.youEdge, Math.max(1, dp));
    c.beginPath(); c.arc(yx, yy, a * 1.45, 0, TAU); c.strokeStyle = pal.you; c.lineWidth = Math.max(1, dp); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
    drawArrow(c, yx, yy, ang, a, pal.you, pal.youEdge, Math.max(1, dp), 1);
    {
      const label = yOut ? 'YOU ARE OFF THIS SHEET' : 'YOU ARE HERE';
      c.font = f.you; spacing(c, f.ls);
      const side = calloutSide(c, P, label, yx, yy, a, ox, oy, s, ar);
      const right = side === 0 || side === 1, up = side === 0 || side === 2;
      const lx = yx + (right ? 1 : -1) * a * 3.2, ly = yy + (up ? -1 : 1) * a * 2.6;
      c.beginPath(); c.moveTo(yx + (right ? 1 : -1) * a * 1.5, yy + (up ? -1 : 1) * a * 1.1); c.lineTo(lx, ly);
      c.lineTo(lx + (right ? 1 : -1) * a * 0.8, ly);
      c.strokeStyle = pal.youText || pal.you; c.lineWidth = Math.max(1, dp); c.stroke();
      c.font = f.you; spacing(c, f.ls);
      c.textAlign = right ? 'left' : 'right';
      c.lineWidth = f.fs * 0.32; c.strokeStyle = pal.halo; c.fillStyle = pal.youText || pal.you;
      const tx = lx + (right ? 1 : -1) * a * 1.0;
      c.strokeText(label, tx, ly); c.fillText(label, tx, ly);
      spacing(c, 0);
    }
    // objective panel (live)
    const ob = P.objBox, tf = P.tf;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = '700 ' + (tf * 0.76).toFixed(1) + 'px ' + FONT_UI;
    spacing(c, tf * 0.14);
    c.fillStyle = pal.dim;
    c.fillText('CURRENT OBJECTIVE', ob.x, ob.y + tf * 0.9);
    spacing(c, 0);
    const text = tgt.obj ? (tgt.text || tgt.obj) : '';
    const key = text + '|' + ob.w + '|' + ob.h;
    c.font = '600 ' + (tf * 0.92).toFixed(1) + 'px ' + FONT_UI;
    if (plan.objKey !== key) { plan.objKey = key; plan.objLay = objLayout(c, text, ob, tf); plan.objLines = plan.objLay.lines; }
    const OL = plan.objLay;
    let ly = ob.y + tf * 2.35;
    if (text && hasT) drawDiamond(c, ob.x + tf * 0.42, ly - tf * 0.32, tf * 0.38, pal, Math.max(1, dp), 1);
    c.fillStyle = text ? pal.objText : pal.dim;
    for (const line of OL.lines) { c.fillText(line, ob.x + tf * 1.2, ly); ly += OL.lh; }
    c.font = '500 ' + (tf * 0.7).toFixed(1) + 'px ' + FONT_UI;
    c.fillStyle = pal.dim;
    spacing(c, tf * 0.08);
    if (OL.note) {
      if (text && !hasT) c.fillText('NO MARK ON THIS SHEET', ob.x + tf * 1.2, ly);
      else if (hasT && tgt.via) { c.fillStyle = pal.objText; c.fillText('VIA ' + tgt.label, ob.x + tf * 1.2, ly); c.fillStyle = pal.dim; }
    }
    if (OL.you && W && W.room) c.fillText('YOU: ' + whereName(W.room(), A), ob.x, ly + OL.yg);
    spacing(c, 0);
    // instability flicker: a frame where the sheet dims
    if (F.flickT) { c.fillStyle = 'rgba(0, 0, 0, 0.18)'; c.fillRect(0, 0, W_, H_); }
  }
  /**
   * Where the YOU ARE HERE callout goes: 0 right-up, 1 right-down, 2 left-up, 3 left-down — the
   * first placement that stays on the drawing and clear of the room labels and the objective.
   * Label boxes are measured once per sheet (ignoring the collapse jitter).
   */
  function calloutSide(c, P, label, yx, yy, a, ox, oy, s, ar) {
    const f = P.fonts, A = P.A;
    if (!P.lboxes) {
      const L = A && A.drawn && !P.pal.graph ? A.labels : [];
      P.lboxes = new Float32Array(L.length * 4);
      const lh = f.fs * 1.1;
      for (let k = 0; k < L.length; k++) {
        const Lb = L[k];
        c.font = Lb.small ? f.small : f.label;
        let mw = 0;
        for (const ln of Lb.lines) mw = Math.max(mw, c.measureText(ln).width);
        const hh = (Lb.lines.length * lh) / 2 + (Lb.no ? f.fs * 0.5 : 0);
        P.lboxes[k * 4] = P.ox + Lb.x * s - mw / 2; P.lboxes[k * 4 + 1] = P.oy + Lb.y * s - hh;
        P.lboxes[k * 4 + 2] = P.ox + Lb.x * s + mw / 2; P.lboxes[k * 4 + 3] = P.oy + Lb.y * s + hh;
      }
      c.font = f.you;
    }
    if (P.youKey !== label) { P.youKey = label; P.youW = c.measureText(label).width; }
    const tw = P.youW, th = f.fs * 0.7, B = P.lboxes;
    const tr = Math.max(4, a * 0.4);
    let best = 0, bestScore = Infinity;
    for (let side = 0; side < 4; side++) {
      const right = side === 0 || side === 1, up = side === 0 || side === 2;
      const ly = yy + (up ? -1 : 1) * a * 2.6, x0 = right ? yx + a * 1.5 : yx - a * 5.0 - tw, x1 = right ? yx + a * 5.0 + tw : yx - a * 1.5;
      let score = side * 0.01;   // ties keep the usual order
      if (x0 < ar.x0 || x1 > ar.x1 || ly - th < ar.y0 || ly + th > ar.y1) score += 50;
      for (let k = 0; k < B.length; k += 4) {
        const ix = Math.min(x1, B[k + 2]) - Math.max(x0, B[k]), iy = Math.min(ly + th, B[k + 3]) - Math.max(ly - th, B[k + 1]);
        if (ix > 0 && iy > 0) score += 1 + (ix * iy) / (tw * th);
      }
      if (tgt.valid && tgt.map === curMapId()) {
        const qx = ox + tgt.x * s, qy = oy + tgt.y * s;
        if (qx > x0 - tr && qx < x1 + tr && qy > ly - th - tr && qy < ly + th + tr) score += 3;
      }
      if (score < bestScore) { bestScore = score; best = side; }
    }
    return best;
  }
  /** the plan's 'YOU:' line: the drawing's name for where you stand */
  function whereName(here, A) {
    if (!A || !A.drawn) return '—';
    if (pencilHere()) return offSite(A) ? 'THE WOODS' : 'NOT ON THIS DRAWING';
    return (here && (ROOM_LABELS[here] || PLACE_NAMES[here])) || '—';
  }
  /** is the player standing somewhere the drawing does not show as floor? */
  function pencilHere() {
    const A = analysis(curMapId()), m = curMap(), P = player();
    if (!A || !m || !P) return true;
    const i = Math.floor(P.y) * m.w + Math.floor(P.x);
    return i < 0 || i >= A.cls.length || !(A.cls[i] === C_IN || A.cls[i] === C_OUT || A.cls[i] === C_DOOR);
  }
  function openPlan() {
    const no = (why) => { MM.refused = why; return false; };
    if (!booted || !DA.modes || !DA.modes.defs.plan) return no('not booted');
    if (!DA.running || DA.paused || !DA.modes.is('explore') || !curMap()) return no('not exploring');
    if (DA.ui && DA.ui.fadeLevel && DA.ui.fadeLevel() > 0.5) return no('fade');
    if (document.body.classList.contains('ui-card-on')) return no('title card');
    MM.refused = null;
    DA.modes.push('plan');
    return true;
  }
  function closePlan() {
    if (DA.modes && DA.modes.has('plan')) DA.modes.pop('plan');
  }
  const planMode = {
    lock: false,
    opaque: false,
    blocksWorld: false,
    enter() {
      plan.open = true;
      plan.root.classList.remove('mm-hidden');
      if (plan.root.parentNode) plan.root.parentNode.appendChild(plan.root);
      plan.acc = REDRAW_EVERY;
      plan.objKey = '';
      plan.dirtySize = true;
      plan.closedAt = 0;
      resolveTarget();
      try { const a = DA.audio; if (a && a.play) a.play('paper', { vol: 0.55 }); } catch (e) { /* ignore */ }
      try { drawPlan(); } catch (e) { report('plan draw', e); }
      DA.bus.emit('plan:open', { map: curMapId() });
    },
    exit() {
      plan.open = false;
      plan.closedAt = performance.now();   // the sheet canvases are let go ~10 s later (onFrame)
      plan.root.classList.add('mm-hidden');
      try { const a = DA.audio; if (a && a.play) a.play('paper', { vol: 0.4, rate: 1.15 }); } catch (e) { /* ignore */ }
      DA.bus.emit('plan:close');
    },
    update(dt, isTop) {
      if (!plan.open) return;
      plan.acc += dt || 0;
      if (plan.acc < REDRAW_EVERY) return;
      try { drawPlan(); } catch (e) { report('plan draw', e); }
      plan.acc = 0;
    },
    onKey(e, down) {
      if (/^F\d{1,2}$/.test(e.code) || e.ctrlKey || e.metaKey || e.altKey) return false;
      const c = e.code;
      if (c === 'KeyM' || c === 'Escape' || c === 'KeyE' || c === 'Tab') {
        if (down && !e.repeat) closePlan();
        return true;
      }
      return false;
    },
    onMouseDown() { closePlan(); return true; },
  };

  /* ============================================================ settings row (injected) */
  const setRow = { el: null, sel: false, fromAbove: true, bound: false };
  function paintSetRow() {
    if (!setRow.el) return;
    const sw = setRow.el.querySelector('.ui-s-sw');
    if (sw) sw.classList.toggle('is-on', settingOn());
    else { const v = setRow.el.querySelector('.mm-s-v'); if (v) v.textContent = settingOn() ? 'ON' : 'OFF'; }
  }
  function injectSettingsRow() {
    const scr = document.getElementById('ui-settings');
    if (!scr) return;
    const list = scr.querySelector('.ui-s-list') || scr.querySelector('.ui-s-panel');
    if (!list) return;
    if (!setRow.el || !list.contains(setRow.el)) {
      const rows = Array.from(list.querySelectorAll('.ui-s-row')).filter((r) => r !== setRow.el);
      const tmpl = rows.filter((r) => r.querySelector('.ui-s-sw')).pop();
      let row;
      if (tmpl) {
        row = tmpl.cloneNode(true); // same structure/classes; no listeners come with it
        row.classList.remove('sel');
        const lab = row.querySelector('.ui-s-lab');
        if (lab) {
          lab.textContent = '';
          lab.appendChild(DA.util.el('span', { text: 'MINIMAP' }));
          lab.appendChild(DA.util.el('small', { text: 'M unfolds the full plan. Shift+M toggles this.' }));
        }
        const val = row.querySelector('.ui-s-val');
        if (val) val.textContent = '';
      } else {
        row = DA.util.el('div', { class: 'ui-s-row', role: 'button' },
          DA.util.el('span', { class: 'ui-s-lab' }, DA.util.el('span', { text: 'MINIMAP' }), DA.util.el('small', { text: 'M unfolds the full plan; Shift+M toggles this.' })),
          DA.util.el('span', { class: 'ui-s-sw' }, DA.util.el('span', { class: 'off', text: 'OFF' }), DA.util.el('span', { class: 'on', text: 'ON' })),
          DA.util.el('span', { class: 'ui-s-val' }));
      }
      row.classList.add('mm-s-row');
      row.setAttribute('data-setting', 'minimap');
      // OFF sets off, ON sets on (never a blind toggle); a click anywhere else on the row flips it
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = e.target && e.target.closest ? e.target : null;
        const want = t && t.closest('.ui-s-sw .on') ? true : t && t.closest('.ui-s-sw .off') ? false : !settingOn();
        setFromRow(want);
        selectRow(true);
      });
      row.addEventListener('mouseenter', () => selectRow(true));
      const last = rows[rows.length - 1];
      if (last && last.parentNode === list) last.after(row); else list.appendChild(row);
      setRow.el = row;
      if (!setRow.bound) {
        setRow.bound = true;
        scr.addEventListener('mouseover', (e) => { if (setRow.sel && setRow.el && !setRow.el.contains(e.target) && e.target.closest && e.target.closest('.ui-s-row, .ui-mi')) deselectRow(false); });
      }
    }
    setRow.sel = false;
    setRow.el.classList.remove('sel');
    paintSetRow();
  }
  function uiSelected() {
    const scr = document.getElementById('ui-settings');
    return scr ? Array.from(scr.querySelectorAll('.ui-s-row.sel, .ui-mi.sel')).filter((e) => e !== setRow.el) : [];
  }
  /*
   * ui.js keeps a private selection index for the settings list; the injected row lives between
   * its last row and BACK. The keyboard path below is relative to that index, so whenever the row
   * is picked with the mouse, ui's index is first moved to the row just above ours through ui's
   * own hover handler (a mouseenter on that row: the same thing a real pointer would do). Then
   * ↓ from our row = ui's "next" (BACK) and ↑ = restore the row above — wherever the mouse was.
   */
  function selectRow(fromMouse) {
    if (!setRow.el) return;
    let prev = uiSelected();
    if (!setRow.sel) {
      const above = setRow.el.previousElementSibling;
      if (fromMouse && above && prev.indexOf(above) < 0) {
        try { above.dispatchEvent(new MouseEvent('mouseenter')); } catch (e) { /* ignore */ }
        prev = uiSelected();
      }
      if (above && prev.indexOf(above) >= 0) { setRow.fromAbove = true; setRow.prevEl = above; }
      else if (prev.some((e) => e.classList.contains('ui-s-back'))) { setRow.fromAbove = false; setRow.prevEl = prev.find((e) => e.classList.contains('ui-s-back')); }
      else { setRow.fromAbove = !prev.some((e) => e.classList.contains('ui-mi')); setRow.prevEl = prev[0] || null; }
    }
    for (const e of prev) e.classList.remove('sel');
    setRow.sel = true;
    setRow.el.classList.add('sel');
  }
  function deselectRow(restore) {
    if (!setRow.el) return;
    setRow.sel = false;
    setRow.el.classList.remove('sel');
    if (restore && setRow.prevEl) setRow.prevEl.classList.add('sel');
  }
  /** keyboard: slot the MINIMAP row between the last setting and BACK (capture phase, before ui) */
  function settingsKeys(e) {
    if (!DA.modes || !DA.modes.is('settings') || !setRow.el || !document.contains(setRow.el)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const above = setRow.el.previousElementSibling;
    const back = document.querySelector('#ui-settings .ui-s-back');
    if (!setRow.sel) {
      if ((c === 'ArrowDown' || c === 'KeyS') && above && above.classList.contains('sel')) { selectRow(false); setRow.fromAbove = true; setRow.prevEl = above; stop(); }
      else if ((c === 'ArrowUp' || c === 'KeyW') && back && back.classList.contains('sel')) { selectRow(false); setRow.fromAbove = false; setRow.prevEl = back; stop(); }
      return;
    }
    if (c === 'ArrowDown' || c === 'KeyS') {
      if (setRow.fromAbove) deselectRow(false); // ui moves last row → BACK
      else { deselectRow(true); stop(); }
    } else if (c === 'ArrowUp' || c === 'KeyW') {
      if (setRow.fromAbove) { deselectRow(true); stop(); }
      else deselectRow(false);                   // ui moves BACK → last row
    } else if (c === 'ArrowLeft' || c === 'KeyA') { if (!e.repeat) setFromRow(false); stop(); }    // ← OFF
    else if (c === 'ArrowRight' || c === 'KeyD') { if (!e.repeat) setFromRow(true); stop(); }      // → ON
    else if (c === 'Enter' || c === 'Space') { if (!e.repeat) setFromRow(!settingOn()); stop(); }
  }
  /** the settings row sets the value (and clicks like ui's switches when it changes) */
  function setFromRow(on) {
    if (on === settingOn()) { paintSetRow(); return; }
    MM.toggle(on);
    try { const a = DA.audio; if (a && a.play) a.play('switch', { vol: 0.3 }); } catch (e) { /* ignore */ }
  }

  /* ============================================================ system: keys + bookkeeping */
  let seenT = 0, tgtT = 0, lastKeyTime = -1;
  /**
   * Shift+M: the modifier is read from the M keydown event itself (latched here, capture phase), not
   * polled at frame time — a quick chord whose Shift is already up by the next frame still toggles.
   */
  const mKey = { shift: false, at: 0, set: false };
  function latchM(e) {
    if (!e || e.code !== 'KeyM' || e.repeat) return;
    let sh = !!e.shiftKey;
    try { if (!sh && e.getModifierState) sh = !!e.getModifierState('Shift'); } catch (err) { /* ignore */ }
    mKey.shift = sh; mKey.at = performance.now(); mKey.set = true;
  }
  function sysUpdate(dt) {
    if (!booted || !DA.running) return;
    const I = DA.input;
    if (I && DA.modes && DA.modes.is('explore') && I.pressed && I.pressed('KeyM') && lastKeyTime !== DA.time) {
      lastKeyTime = DA.time;
      const latched = mKey.set && performance.now() - mKey.at < 2000;
      const shift = latched ? mKey.shift : !!(I.down && (I.down('ShiftLeft') || I.down('ShiftRight')));
      mKey.set = false;
      if (shift) {
        const on = MM.toggle();
        try { if (DA.ui && DA.ui.toast) DA.ui.toast(on ? 'MINIMAP ON' : 'MINIMAP OFF', 1.6); } catch (e) { /* ignore */ }
      } else openPlan();
    }
    seenT -= dt;
    if (seenT <= 0) { seenT = SEEN_EVERY; try { markSeen(); } catch (e) { report('seen', e); } }
    tgtT -= dt;
    if (tgtT <= 0) { tgtT = 0.25; try { resolveTarget(); } catch (e) { report('target', e); } }
    try { updateMood(dt); } catch (e) { report('mood', e); }
  }

  /* ============================================================ lifecycle */
  let booted = false;
  function buildDom() {
    const hud = document.getElementById('hud');
    const screens = document.getElementById('screens');
    if (!hud || !screens) return false;
    const el = DA.util.el;
    mini.root = el('div', { id: 'mm-mini', class: 'mm-mini mm-off', 'aria-hidden': 'true' });
    mini.cv = el('canvas', { class: 'mm-cv' });
    mini.root.appendChild(mini.cv);
    hud.appendChild(mini.root);
    mini.ctx = mini.cv.getContext('2d');
    plan.root = el('div', { id: 'mm-plan', class: 'mm-plan mm-hidden' });
    plan.cv = el('canvas', { class: 'mm-sheet' });
    plan.hint = el('div', { class: 'mm-plan-hint', text: 'M · ESC — FOLD THE PLAN' });
    plan.root.append(el('div', { class: 'mm-sheet-wrap' }, plan.cv), plan.hint);
    screens.appendChild(plan.root);
    plan.ctx = plan.cv.getContext('2d');
    return true;
  }
  function resetRuntime(fromState) {
    for (const k in seenMaps) delete seenMaps[k];
    for (const k in doorMem) delete doorMem[k];
    for (const k in seenVer) seenVer[k] = (seenVer[k] || 0) + 1;
    doorVisM = null;
    seenLog.length = 0;
    seenLogMap = null;
    mini.lset.map = null;
    if (plan.cache) plan.cache.pver = -1;
    tgt.valid = false; tgt.obj = null; tgt.hush = false;
    mood.near = false; mood.nearT = 0; mood.dark = false;
    seenT = 0; tgtT = 0;
    if (fromState) mState();
  }
  function rebuild() {
    mini.lset.map = null;
    mini.dirtySize = true;
    plan.cache = null;
    plan.dirtySize = true;
    seenLog.length = 0;
    seenLogMap = curMapId();
    seenT = 0;
    try { resolveTarget(); } catch (e) { report('target', e); }
    setMiniClass();
  }
  DA.bus.on('boot', () => {
    try {
      if (!buildDom()) return;
      DA.modes.register('plan', planMode);
      DA.addSystem('minimap', { update: sysUpdate, order: 75 });
      booted = true;
      if (DA.settings && DA.settings.minimap == null) DA.settings.minimap = true;   // default on (not saved until changed)
      window.addEventListener('resize', () => { mini.dirtySize = true; plan.dirtySize = true; });
      window.addEventListener('keydown', settingsKeys, true);
      window.addEventListener('keydown', latchM, true);
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { plan.cache = null; });
    } catch (e) { report('boot', e); }
  });
  DA.bus.on('resize', () => { mini.dirtySize = true; plan.dirtySize = true; });
  DA.bus.on('game:new', () => { resetRuntime(true); });
  DA.bus.on('game:load', () => { resetRuntime(true); });
  DA.bus.on('game:ready', () => { rebuild(); });
  DA.bus.on('map:change', () => { rebuild(); });
  DA.bus.on('world:ready', () => { rebuild(); });
  // what is walkable changed (the drawing never does): redraw the pencil from the seen cells
  DA.bus.on('mutation', () => { const id = curMapId(); if (id) dropPencil(id); });
  DA.bus.on('objective:set', (e) => {
    if (e && e.id && DA.state) {   // "most recent" survives save / load: DA.state.minimap.seq = {objId: n}
      const st = mState();
      if (!st.seq || typeof st.seq !== 'object') st.seq = {};
      st.seqN = Math.max(+st.seqN || 0, ...Object.values(st.seq).map((v) => +v || 0)) + 1;
      st.seq[e.id] = st.seqN;
    }
    tgtT = 0;
  });
  DA.bus.on('objective:done', () => { tgtT = 0; });
  DA.bus.on('objective:remove', () => { tgtT = 0; });
  DA.bus.on('archive:collect', () => { try { collect(); } catch (e) { report('collect', e); } });
  DA.bus.on('game:quit', () => { resetRuntime(false); mini.visible = false; setMiniClass(); });
  DA.bus.on('runtime:reset', () => { seenLog.length = 0; });
  DA.bus.on('settings', () => { setMiniClass(); paintSetRow(); });
  DA.bus.on('settings:open', () => { try { injectSettingsRow(); } catch (e) { report('settings row', e); } });
  DA.bus.on('frame', onFrame);

  /* ============================================================ API */
  MM.setTarget = function (objId, target) {
    if (!objId) return;
    if (arguments.length < 2) delete overrides[objId];
    else overrides[objId] = target === undefined ? null : target;
    tgtT = 0;
    try { resolveTarget(); } catch (e) { report('target', e); }
  };
  MM.open = () => openPlan();
  MM.close = () => closePlan();
  MM.isOpen = () => !!plan.open;
  MM.toggle = (on) => {
    const v = on == null ? !settingOn() : !!on;
    if (!DA.settings) return v;
    DA.settings.minimap = v;
    if (DA.saveSettings) DA.saveSettings(); else DA.bus.emit('settings', DA.settings);
    setMiniClass();
    paintSetRow();
    DA.bus.emit('minimap:toggle', { on: v });
    return v;
  };
  MM.target = () => {
    try { resolveTarget(); } catch (e) { report('target', e); }
    if (!liveTarget()) return null;
    return { obj: tgt.obj, x: +tgt.x.toFixed(2), y: +tgt.y.toFixed(2), map: tgt.map, label: tgt.label, via: tgt.via, final: tgt.final };
  };
  MM.seen = (mapId) => {
    const id = mapId || curMapId();
    const m = DA.world && DA.world.maps ? DA.world.maps[id] : null;
    const S = m ? seenFor(id, m) : seenMaps[id];
    if (!S) return 0;
    let n = 0;
    for (let i = 0; i < S.length; i++) n += S[i];
    return n;
  };
  MM.seenAt = (x, y, mapId) => {
    const id = mapId || curMapId();
    const m = DA.world && DA.world.maps ? DA.world.maps[id] : null;
    const S = m ? seenFor(id, m) : null;
    if (!S || x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    return !!S[Math.floor(y) * m.w + Math.floor(x)];
  };
  MM.redraw = () => {
    mini.dirtySize = true;
    try { resolveTarget(); } catch (e) { report('target', e); }
    let ms = 0;
    try { ms = drawMini(); } catch (e) { report('draw', e); }
    if (plan.open) try { drawPlan(); } catch (e) { report('plan draw', e); }
    return ms;
  };
  MM.invalidate = () => {
    for (const k in analyses) delete analyses[k];
    mini.lset.map = null;
    mini.dirtySize = true;
    plan.cache = null;
    plan.dirtySize = true;
  };
  MM.info = () => {
    const st = mini.stats;
    return {
      on: settingOn(), visible: mini.visible && miniShouldShow(), map: curMapId(), planOpen: !!plan.open, seen: MM.seen(),
      target: MM.target(), objective: tgt.obj, palette: curMapId() ? paletteName(curMapId()) : null,
      redraws: st.n, avgMs: st.n ? +(st.total / st.n).toFixed(3) : 0, maxMs: +st.max.toFixed(3), lastMs: +st.last.toFixed(3),
      size: mini.size, ppc: +mini.ppc.toFixed(2),
      dark: !!mood.dark, red: !!(mood.dark && mood.red), hushed: !!(tgt.hush || mood.near), hush: tgt.hush ? 'listen' : mood.near ? 'entity' : null,
      opacity: mini.root ? +(+getComputedStyle(mini.root).opacity).toFixed(3) : 0,
    };
  };
  MM._debug = { analysis, mini, plan, tgt, seenMaps, doorMem, PALS, collapseLevel, updateEffects, markSeen, mood, updateMood };
  MM._drawOnly = () => drawMini();      // tests: one corner redraw, nothing else
  MM._drawPlanOnly = () => drawPlan();       // tests: one plan redraw
})();
