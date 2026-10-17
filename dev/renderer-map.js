/* DEAD AIR — dev/renderer-map.js
 * Hand-made test map for the renderer harness, plus a tiny compiler into the runtime map format
 * of PLAN §6.4 (the real one lives in js/world.js). Exercises: several wall textures + decals,
 * per-face overrides, sliding doors (half open), windows, an outdoor yard with trees/sky/rain,
 * a void pit with a grating catwalk, lights of varying intensity + one flickering, emissive
 * consoles, sprites incl. ghosts and an NPC.
 */
(function () {
  'use strict';
  const DA = window.DA;

  //            0         1         2         3         4
  //            01234567890123456789012345678901234567890123
  const GRID = [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 0
    'TooooooooooooooooooooooooooorrrrrrrrrrrrrroT', // 1
    'ToooooooooooooooooooooooooooRRRRRRRRRRRRRRoT', // 2
    'To###########w######W#######oooooooooooooooT', // 3
    'To#.......#cccccc#kkkkk#eee#xxxxxxxxxxxxxxoT', // 4
    'ToW.......#cccccc#kkkkk#eee#PPPPPPgPPPPPPXoT', // 5
    'To#...L...#ccCccc#kkKkk#eEe#PPPPPPgPPPPPPXoT', // 6
    'ToW.......#cccccc#kkkkk#eee#PPPPPPgPPPPPPXoT', // 7
    'To#.......#cccccc#kkkkk#eee#PPPPPPgPPPPPPXoT', // 8
    'To####-######-######-####-##PPPPPPgPPPPPPXoT', // 9
    'To#..L.....L.....L.....L...|gggggggggggggXoT', // 10
    'To###-#######...######-##-##PPPPPPgPPPPPPXoT', // 11
    'To#bbbbb#........#eeeee#...#PPPPPPgPPPPPPXoT', // 12
    'To#bbbbb#........#eeeee#...#PPPPPPgPPPPPPXoT', // 13
    'To#bbBbb#...L....#eeEee#...#PPPPPPgPPPPPPXoT', // 14
    'To#bbbbb#........#eeeee#...#PPPPPPgPPPPPPXoT', // 15
    'To#bbbbb#........#eeeee#...#xxxxxxxxxxxxxxoT', // 16
    'To#bbbbb#........#eeeee#...#ooooooooooooooaT', // 17
    'To#########w#-#w############ooooooooooooooaT', // 18
    'ToooooooooooooooooooooooooooooooooooooooooaT', // 19
    'ToooooooooooooooooooooooooooooooooooooooooaT', // 20
    'ToooooooooooooooooooooooooooooooooooooooooaT', // 21
    'TooooooooooooooooooooooooooooooFFFFFoFFFFFaT', // 22
    'ToooooooooooooooooooooooooooooooooooooooooaT', // 23
    'ToooooooooooooooooooooooommmmmoooooooooooaaT', // 24
    'ToooooooooooooooooooooooommmmmmooooooooooaaT', // 25
    'TaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaT', // 26
    'TaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaT', // 27
    'TaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaT', // 28
    'TmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmT', // 29
    'TmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmT', // 30
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 31
  ];
  // wall: base texture; face: interior face texture for walls next to this floor; out: outdoor
  const LEG = {
    T: { wall: 'trees', floor: 'ground_mud', ceil: 0, out: true },
    F: { wall: 'fence', floor: 'ground_gravel', ceil: 0, out: true },
    o: { floor: 'ground_gravel', ceil: 0, out: true },
    a: { floor: 'ground_asphalt', ceil: 0, out: true },
    m: { floor: 'ground_mud', ceil: 0, out: true },
    r: { floor: 'roof_tar', ceil: 0, out: true },
    R: { wall: 'parapet', floor: 'roof_tar', ceil: 0, out: true },
    '#': { wall: 'wall_paint', floor: 'floor_lino', ceil: 'ceil_tile', building: true },
    W: { wall: 'window', floor: 'floor_lino', ceil: 'ceil_tile', building: true },
    w: { wall: 'window_small', floor: 'floor_lino', ceil: 'ceil_tile', building: true },
    '.': { floor: 'floor_lino', ceil: 'ceil_tile', face: 'wall_paint' },
    L: { floor: 'floor_lino', ceil: 'ceil_light', face: 'wall_paint' },
    c: { floor: 'floor_carpet', ceil: 'ceil_tile', face: 'wall_panel' },
    C: { floor: 'floor_carpet', ceil: 'ceil_light', face: 'wall_panel' },
    k: { floor: 'floor_tile', ceil: 'ceil_tile', face: 'wall_kitchen' },
    K: { floor: 'floor_tile', ceil: 'ceil_light', face: 'wall_kitchen' },
    b: { floor: 'floor_tile', ceil: 'ceil_tile', face: 'wall_tile' },
    B: { floor: 'floor_tile', ceil: 'ceil_light', face: 'wall_tile' },
    e: { floor: 'floor_concrete', ceil: 'ceil_concrete', face: 'wall_paint' },
    E: { floor: 'floor_concrete', ceil: 'ceil_light', face: 'wall_paint' },
    '-': { floor: 'floor_lino', ceil: 'ceil_tile', door: 'h' },
    '|': { floor: 'floor_concrete', ceil: 'ceil_concrete', door: 'v' },
    x: { wall: 'cables', floor: 'floor_concrete', ceil: 'ceil_rock' },
    X: { wall: 'wall_rock', floor: 'floor_concrete', ceil: 'ceil_rock' },
    P: { floor: 0, ceil: 'ceil_rock', pit: true, face: 'wall_brick' },
    g: { floor: 'floor_grate', ceil: 'ceil_rock', face: 'wall_brick' },
  };
  const DOORS = {
    '6,9': { id: 'radio_door', tex: 'door_wood', open: 0.5 },
    '13,9': { id: 'office_door', tex: 'door_wood', open: 0 },
    '20,9': { id: 'kitchen_door', tex: 'door_wood', open: 1 },
    '25,9': { id: 'equip_door', tex: 'door_metal', open: 0.3 },
    '5,11': { id: 'bath_door', tex: 'door_wood', open: 0.8 },
    '22,11': { id: 'workshop_door', tex: 'door_metal', open: 0 },
    '25,11': { id: 'records_door', tex: 'door_records', open: 0 },
    '13,18': { id: 'front_door', tex: 'door_front', open: 0 },
    '27,10': { id: 'array_door', tex: 'door_blast', open: 0.65 },
  };
  const FACES = [
    [4, 3, 's', 'map_wall'], [5, 3, 's', 'radio_console'], [6, 3, 's', 'cctv_bank'], [8, 3, 's', 'wall_paint+dec_calendar'],
    [10, 5, 'w', 'wall_paint+dec_clock'], [10, 7, 'w', 'wall_paint+dec_photo'], [7, 9, 's', 'wall_paint+dec_sign_radio'],
    [12, 3, 's', 'filing_cabinet'], [14, 3, 's', 'corkboard'], [15, 3, 's', 'bookcase'], [10, 5, 'e', 'bookcase'],
    [17, 6, 'w', 'wall_panel+dec_blueprint'], [10, 7, 'e', 'wall_panel+dec_keycabinet'], [17, 4, 'w', 'wall_panel+dec_weather_panel'],
    [19, 3, 's', 'kitchen_counter'], [21, 3, 's', 'fridge'], [23, 6, 'w', 'wall_kitchen+dec_phone'],
    [24, 3, 's', 'rack_server'], [25, 3, 's', 'rack_server'], [26, 3, 's', 'terminal_tape'], [27, 5, 'w', 'door_steel'],
    [27, 7, 'w', 'wall_paint+dec_stencil_relay'], [23, 5, 'e', 'rack_server'], [23, 7, 'e', 'rack_server'],
    [2, 10, 'e', 'wall_paint+dec_sign_exit'], [10, 11, 'n', 'wall_paint+dec_notice'], [16, 9, 's', 'wall_paint+dec_water_stain'],
    [22, 9, 's', 'wall_paint+dec_crack'], [18, 11, 'n', 'wall_paint+dec_switch'], [9, 9, 's', 'wall_paint+dec_vent'],
    [17, 13, 'w', 'wall_paint+dec_plaque'], [8, 15, 'e', 'wall_paint+dec_notice'], [9, 11, 's', 'wall_paint+dec_keypad'],
    [4, 18, 'n', 'mirror_wall'], [6, 18, 'n', 'stall'], [2, 15, 'e', 'vent_wall'],
    [18, 18, 'n', 'workbench'], [20, 18, 'n', 'breaker_panel'], [22, 18, 'n', 'ladder_wall'], [23, 15, 'w', 'shelf_supplies'], [17, 15, 'e', 'pipes'],
    [24, 18, 'n', 'shelf_tapes'], [25, 18, 'n', 'shelf_tapes'], [26, 18, 'n', 'shelf_tapes'], [27, 14, 'w', 'filing_cabinet'],
    [41, 10, 'w', 'antenna_console'], [31, 16, 'n', 'generator'], [33, 16, 'n', 'fuel_tank'], [36, 16, 'n', 'reels'], [38, 16, 'n', 'pipes'],
    [30, 4, 's', 'door_blast'], [33, 4, 's', 'hatch'], [36, 4, 's', 'stairs_down'], [39, 4, 's', 'vent_wall'],
    [9, 18, 's', 'sign_station'], [17, 18, 's', 'concrete_ext+dec_graffiti_code'],
  ];
  const LIGHTS = [
    { x: 6, y: 6, i: 1.0, r: 5.5 }, { x: 13, y: 6, i: 0.85, r: 5 }, { x: 20, y: 6, i: 1.0, r: 5 }, { x: 25, y: 6, i: 0.65, r: 4 },
    { x: 5, y: 10, i: 1.0, r: 5 }, { x: 11, y: 10, i: 1.0, r: 5 }, { x: 17, y: 10, i: 1.0, r: 5, flicker: true }, { x: 23, y: 10, i: 0.8, r: 5 },
    { x: 12, y: 14, i: 1.0, r: 6 }, { x: 5, y: 14, i: 0.8, r: 4 }, { x: 20, y: 14, i: 0.9, r: 5 }, { x: 25, y: 14, i: 0.3, r: 4 },
    { x: 31, y: 10, i: 0.9, r: 5, pit: true }, { x: 37, y: 10, i: 0.9, r: 5, pit: true }, { x: 34, y: 6, i: 0.3, r: 3, pit: true }, { x: 34, y: 14, i: 0.35, r: 3, pit: true },
    { x: 18, y: 21, i: 1.1, r: 7.5, out: true }, { x: 13, y: 19, i: 0.7, r: 3.5, out: true },
  ];

  /** Compile GRID into the runtime map format (PLAN §6.4). */
  function compile() {
    const T = DA.textures;
    const h = GRID.length, w = GRID[0].length, n = w * h;
    const m = {
      id: 'test', w, h,
      wall: new Uint16Array(n), wallN: new Uint16Array(n), wallE: new Uint16Array(n), wallS: new Uint16Array(n), wallW: new Uint16Array(n),
      floor: new Uint16Array(n), ceil: new Uint16Array(n), solid: new Uint8Array(n), room: new Uint8Array(n),
      light: new Float32Array(n), door: new Int16Array(n).fill(-1), doors: [], emissive: 1, alt: new Map(),
      tint: [1, 1, 1], variant: 'normal', windowFigure: null, props: [],
    };
    const ch = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 'T' : GRID[y][x]);
    for (let y = 0; y < h; y++) {
      if (GRID[y].length !== w) throw new Error('row ' + y + ' has length ' + GRID[y].length);
      for (let x = 0; x < w; x++) {
        const c = GRID[y][x], L = LEG[c], i = y * w + x;
        if (!L) throw new Error('bad char ' + c + ' at ' + x + ',' + y);
        m.wall[i] = L.wall ? T.id(L.wall) : 0;
        m.floor[i] = L.floor ? T.id(L.floor) : 0;
        m.ceil[i] = L.ceil ? T.id(L.ceil) : 0;
        m.solid[i] = L.wall || L.pit ? 1 : 0;
        if (L.door) {
          const d = DOORS[x + ',' + y] || { id: 'door_' + x + '_' + y, tex: 'door_wood', open: 0 };
          m.door[i] = m.doors.length;
          m.doors.push({ id: d.id, x, y, axis: L.door, tex: T.id(d.tex), open: d.open, target: d.open, locked: false });
        }
      }
    }
    // faces: building walls take the adjacent room's surface; outdoor sides get exterior concrete
    const dirs = [['n', 0, -1, m.wallN], ['e', 1, 0, m.wallE], ['s', 0, 1, m.wallS], ['w', -1, 0, m.wallW]];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const L = LEG[GRID[y][x]];
        if (!L.building || GRID[y][x] !== '#') continue;
        for (const [, dx, dy, arr] of dirs) {
          const N = LEG[ch(x + dx, y + dy)];
          if (N.wall) continue;
          const t = N.out ? 'concrete_ext' : N.face;
          if (t && t !== L.wall) arr[y * w + x] = T.id(t);
        }
      }
    // walls bordering the pit room get brick on that side
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (GRID[y][x] === '#')
          for (const [, dx, dy, arr] of dirs) { const c2 = ch(x + dx, y + dy); if (c2 === 'P' || c2 === 'g') arr[y * w + x] = T.id('wall_brick'); }
    const SIDE = { n: m.wallN, e: m.wallE, s: m.wallS, w: m.wallW };
    for (const [x, y, s, t] of FACES) SIDE[s][y * w + x] = T.id(t);
    // abandoned alt: the relay code sprayed in the radio room (face key idx*4+side)
    m.alt.set((3 * w + 7) * 4 + 2, T.id('wall_paint+dec_graffiti_code'));
    // lights: precomputed per-light contribution with line of sight (doors let light through)
    const solidWall = (x, y) => { const c = ch(x, y); return !!LEG[c].wall; };
    const los = (ax, ay, bx, by) => {
      const d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d * 4);
      for (let k = 1; k < steps; k++) {
        const t = k / steps, x = Math.floor(ax + (bx - ax) * t), y = Math.floor(ay + (by - ay) * t);
        if (x === Math.floor(bx) && y === Math.floor(by)) continue;
        if (solidWall(x, y)) return false;
      }
      return true;
    };
    m.lightDefs = LIGHTS.map((l) => {
      const contrib = new Float32Array(n);
      const cx = l.x + 0.5, cy = l.y + 0.5;
      for (let y = Math.max(0, Math.floor(l.y - l.r)); y <= Math.min(h - 1, Math.ceil(l.y + l.r)); y++)
        for (let x = Math.max(0, Math.floor(l.x - l.r)); x <= Math.min(w - 1, Math.ceil(l.x + l.r)); x++) {
          if (solidWall(x, y)) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > l.r || !los(cx, cy, x + 0.5, y + 0.5)) continue;
          contrib[y * w + x] = l.i * Math.pow(1 - d / l.r, 1.4);
        }
      return Object.assign({ contrib, level: 1 }, l);
    });
    m.ambient = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = GRID[(i / w) | 0][i % w], L = LEG[c];
      m.ambient[i] = L.out ? 0.24 : L.pit || c === 'g' ? 0.03 : 0.05;
    }
    return m;
  }

  /** Recompute map.light from the light defs (flicker animates one corridor lamp). */
  function updateLights(m, t, power) {
    const n = m.w * m.h, light = m.light;
    for (let i = 0; i < n; i++) light[i] = m.ambient[i];
    for (const l of m.lightDefs) {
      let lv = l.out || l.pit ? 1 : power ? 1 : 0;
      if (l.flicker && lv) {
        const s = Math.sin(t * 13.7) + Math.sin(t * 29.3 + 1) + Math.sin(t * 5.1 + 2);
        lv = s > 1.6 ? 0.15 : s > 1.2 ? 0.6 : 1;
        if ((t % 7) < 0.25) lv = 0.1;
      }
      l.level = lv;
      if (!lv) continue;
      const c = l.contrib;
      for (let i = 0; i < n; i++) if (c[i]) light[i] += c[i] * lv;
    }
  }

  /** Props/sprites of the test map. */
  function sprites(t, o) {
    const S = [];
    let walkX = 4 + ((Math.sin(t * 0.25) + 1) / 2) * 20;
    let dir = Math.cos(t * 0.25);
    if (o && o.hollisX != null) { walkX = o.hollisX; dir = -1; }
    S.push({ x: walkX, y: 10.5, tex: 'spr_hollis', frame: Math.floor(t * 6) % 4 + ((o && o.hollisBack) || dir > 0 ? 5 : 0), scale: 1 });
    S.push({ x: 6.3, y: 5.0, tex: 'spr_chair', frame: 1 });
    S.push({ x: 5.4, y: 4.2, tex: 'spr_mug', z: 0.31 });
    S.push({ x: 20.5, y: 6.5, tex: 'spr_table' });
    S.push({ x: 21.4, y: 15.7, tex: 'spr_boxes' });
    S.push({ x: 6.6, y: 16.6, tex: 'spr_bucket' });
    S.push({ x: 12.4, y: 16.2, tex: 'spr_newspaper' });
    S.push({ x: 15.3, y: 13.4, tex: 'spr_figure', frame: 4, alpha: 0.85 });
    S.push({ x: 25.5, y: 12.8, tex: 'spr_tape', z: 0 });
    // pit room
    S.push({ x: 31.5, y: 10.5, tex: 'spr_light_fixture' });
    S.push({ x: 37.5, y: 10.5, tex: 'spr_light_fixture' });
    S.push({ x: 37.5, y: 6.5, tex: 'spr_downward_antenna', scale: 7, z: -5.5 });
    S.push({ x: 34.5, y: 9.6, tex: 'spr_lectern' });
    S.push({ x: 39.6, y: 10.4, tex: 'spr_barrel' });
    S.push({ x: 40.4, y: 11.3, tex: 'spr_lever' });
    S.push({ x: 40.4, y: 9.6, tex: 'spr_lever_down' });
    S.push({ x: 29.2, y: 10.6, tex: 'spr_cable_coil' });
    const ef = Math.floor(t * 1.3) % 4;
    S.push({
      x: 34.5, y: 13.2, tex: 'spr_entity', frame: ef,
      ghosts: [{ x: 34.2, y: 12.2, alpha: 0.45, frame: (ef + 1) % 4 }, { x: 34.9, y: 14.3, alpha: 0.3, frame: (ef + 2) % 4 }],
    });
    // outdoors
    S.push({ x: 18.5, y: 21.5, tex: 'spr_lamp_post' });
    S.push({ x: 10.5, y: 23.3, tex: 'spr_car' });
    S.push({ x: 24.5, y: 23.4, tex: 'spr_car2' });
    S.push({ x: 37.5, y: 27.6, tex: 'spr_car_rusted' });
    S.push({ x: 30.5, y: 25.6, tex: 'spr_sign' });
    S.push({ x: 15.2, y: 24.6, tex: 'spr_replacement', frame: 4 });
    S.push({ x: 26.5, y: 20.5, tex: 'spr_cable_coil' });
    S.push({ x: 31.5, y: 20.2, tex: 'spr_debris' });
    S.push({ x: 5.5, y: 1.6, tex: 'spr_mast' });
    S.push({ x: 38.5, y: 1.5, tex: 'spr_tower' });
    S.push({ x: 40.5, y: 19.6, tex: 'spr_tree_dead' });
    for (let k = 0; k < 15; k++) S.push({ x: 2 + k * 2.8 + (k % 3) * 0.4, y: 30.2 + (k % 2) * 0.5, tex: 'spr_tree', frame: k % 3, flip: !!(k & 1) });
    for (let k = 0; k < 9; k++) S.push({ x: 1.4 + (k % 2) * 0.3, y: 3 + k * 3.1, tex: 'spr_tree', frame: (k + 1) % 3, scale: 4 + (k % 3) * 0.5 });
    S.push({ x: 42.5, y: 29.4, tex: 'spr_barrel' });
    return S;
  }

  window.DEV_MAP = { compile, updateLights, sprites, GRID, LEG };
})();
