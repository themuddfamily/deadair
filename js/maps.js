/* DEAD AIR — maps.js
 * Level data for every map: ASCII grids + legend + faces/doors/props/interactables/points/
 * triggers/lights/alt/mutations (PLAN.md §6.4, §5, §7.1–7.3, §7.5). Data only; compiled into
 * typed-array runtime maps by js/world.js (DA.world).
 *
 * ---------------------------------------------------------------- CONVENTIONS
 *  Cell = 1 unit (~2 m). x grows east, y grows south. Angles in DEGREES here (0 = east,
 *  90 = south, 180 = west, 270 = north). Point/prop/light coordinates are world units
 *  (cell (x, y) spans x..x+1, y..y+1, its centre is x+0.5, y+0.5).
 *  Face interactables/faces name a WALL cell (x, y) and the side of it they are painted on
 *  ('s' = the face you see when standing south of that wall cell, looking north).
 *
 * ---------------------------------------------------------------- LEGEND FIELDS
 *  PLAN: wall, floor, ceil (null = sky), room, solid, light (ambient override 0..1), pit.
 *  ADDITIONS (all optional):
 *   inner:   true → a face of this wall that looks into a floor cell takes that floor's `walls`
 *            texture (so one '#' char reads as tile in the bathroom, brick in the workshop…).
 *   outside: texture for faces of this wall that look onto an outdoor cell (ceil null).
 *   overlay: decal composited on every resolved face ('window' → 'wall_paint+window').
 *   walls:   (floor chars) texture used by `inner` walls facing into this cell.
 *   door:    true → door cell; floor/ceil/room are inherited from the "inside" neighbour.
 *   creak:   true → creaky floorboard (footstep plays 'creak').
 *   decor:   {tex, chance, alt, altChance, radius, solid, scale, jitter} → deterministic scatter
 *            of static sprites (trees) over cells of this char.
 *   reserved: true → solid block kept free for a mutation (debug view shows it hatched).
 *   outdoor: force outdoor/indoor (default: ceil === null).
 *
 * ---------------------------------------------------------------- OTHER ADDITIONS
 *  doors[].inside ('n'|'e'|'s'|'w'): which side counts as inside for lockableInside.
 *  doors[].static: never opens and has no door interactable (stall/cupboard fronts; a `hide`
 *    interactable at the same cell takes the focus instead).
 *  doors[].heavy: heavy door sounds.  doors[].open: starts open.
 *  interact[].cells: [[x, y], …] extra wall cells (same side) that also focus this face
 *    interactable (a console two cells wide).  interact[].pos: {x, y, angle} where a `hide`
 *    puts the player.  interact[].enabled:false → starts disabled.
 *  props without an `id` are static decor (never persisted).
 *  mutations[].lights / props / triggers / points, portals[].dir (entry heading, degrees).
 *  points not in PLAN: pt_office_elsewhere (portal target), pt_replacement_car.
 *  ambience: base DA.audio.ambience params for the map; roomAmbience: per-room overrides.
 *  wallHeight / sky / fog: passed through to the runtime map for DA.render (array: tall void).
 *  WAVE 3:
 *   pitchMax: look up/down limit on this map (array 0.7: you can look down into the shaft).
 *   emissiveCircuits: {baseTextureName: circuit} — wall devices whose screens/lamps stay lit on
 *     their own supply (station: radio_console → 'radio', cctv_bank → 'ups'; basement:
 *     antenna_console → 'array').
 *   doors[].slats: 'louver' | 'gap' — see-through door (the supply cupboard, the stall partitions).
 *   triggers[].dir: degrees — the zone only fires when entered heading that way (woods_deep).
 *     Several zones may share an id.
 *   Texture fields may name fallbacks: 'relay_console||reels' (first that DA.textures has).
 *   legend floor chars may be solid:true (walk-blocking floor with decor: the woods' tree margins).
 *   lights[].fixture:false → no ceiling panel. Emergency lamps are red wall lamps (no panel).
 *   Mutation `set` chars Z / Y (2049 only): hall / supply room cells open to the sky (roof holes).
 *  FIX-D (verification round):
 *   Station triggers: 'newhall_inside' covers BOTH ends of the new hallway (the hall door at 24,13
 *     and the radio-room door newhall_exit, cells 21..22,12); 'newhall_inside_b' is the radio-room
 *     end alone (a listener can tell which way the player came in). Both only matter while the
 *     new_hallway mutation is applied (the cells are walls otherwise).
 *   replacement_car / pt_replacement_car: the relief's car parks at (37.3, 29.6), the lot's east
 *     bay, 3.4 u from the lot lamp (cell light ≈0.6 at night; dawn daylight on top) — the same bay
 *     Hollis's car used (it is gone by then). The prop starts hidden; the director moves it to the
 *     road, shows it (showProp) and drives it in.
 *   Drive route points (cars arriving/leaving by the real driveway instead of through the trees):
 *     pt_drive_road (58.5, 40.5: the road's east end, out of sight), pt_drive_mouth (25.5, 40.6:
 *     where the driveway meets the road), pt_drive_lot (25.6, 33.4: top of the driveway, in the lot).
 *   Storage: the box that sealed the aisle to the supply cupboard (44.3,17.6) moved into the NE
 *     corner (45.62, 17.3): the cupboard aisle (x44) is clear for the player and DA.world.path.
 *   Array: the downward antenna hangs higher (z −2.6, scale 7): from every catwalk approach you see
 *     the dish above and the elements shortening downward into the shaft; the glowing tip hangs just
 *     below the centre ring (look down over the edge). Two work lamps hang on the shaft's rim
 *     (props antenna_lamp_s / antenna_lamp_n) with a steady light 'a_ant' on the antenna.
 *  DA.maps.roomPhrase(room) → how a room reads in speech after "the" ('array', 'parking lot').
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});

  /* =================================================================== legends */
  const TREE = { tex: 'spr_tree', chance: 0.55, alt: 'spr_tree_dead', altChance: 0.12, radius: 0.28, solid: true, jitter: 0.32 };
  const DENSE = { tex: 'spr_tree', chance: 0.6, alt: 'spr_tree_dead', altChance: 0.1, radius: 0.28, solid: true, jitter: 0.26 };

  /* ================================================================== STATION */
  /* Ground floor + exterior in one map (front door is seamless). Building footprint x14..46,
   * y8..23. Hall runs E–W along y15; rooms north (radio, [new hallway reserve], office,
   * kitchen, equipment) and south (records, workshop, bathroom, lobby, stairs, storage).
   * The lot, road and treeline are south; the mast compound is N.
   * THE WOODS (README 'The outside world'): the trail leaves the ground at the building's NW corner
   * (trigger woods_path), runs south along the property's west edge behind a wall of trees, crosses
   * under the road's dead west end into the deep woods (rows 43..65, below the road), winds east /
   * west / east past landmarks (a rusted car, a dump + the station's own road sign (woods_mid), a
   * street lamp burning where no road is) and turns north up a narrow corridor back toward the
   * road's east end (woods_out). ~246 cells of trail: about two minutes' walk. woods_deep (the
   * director's cue: → the supply cupboard) sits on north-heading stretches near both ends and only
   * fires when you walk NORTH through it (triggers[].dir), so you always arrive facing into the
   * cupboard's shelf aisle (pt_storage_arrive faces north) — the teleport keeps your stride. The
   * trail cells are 'v' (room woods), the solid tree margins 'y' (room forest). */
  const station = {
    id: 'station',
    name: 'Relay Station 14',
    grid: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 0
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 1
      'TTTTTTTTTTTTTTTfffffffffffTTTTTTffffFFFFFFFfffTTTTTTTfffTTTT', // 2
      'TTTTTTTTTTTuuuuuuuuuuuuuuuuuuuuuuuuuFuuuuuFuuuufffffufffTTTT', // 3
      'TTTTTTTTTTTuuuuuuuuuuuuuuuuuuuuuuuuuFuuuuuFuuuufffffufffTTTT', // 4
      'TTTTTTTTTTTuuuuuuuuuuuuuuuuuuuuuuuuuFuuuuuFuuuuuuuuuufffTTTT', // 5
      'TTTTyyyyuuuuuuuuuuuuuuuuuuuuuuuuuuuuFFFuFFFuuuuuuuuuufffTTTT', // 6
      'TTTTyvvvvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuufffffTT', // 7
      'TTTTyvyTuuuuuuEEEEEEEEEEEEEWEEEEEEWEEEEEEEEEEEEuuuuuufffffTT', // 8
      'TTTTyvyTuuuuuuErrrrrrXXXXXoooo#kkkkkk#qqRqRqRqEuuuuuufffffTT', // 9
      'TTTTyvyTuuuuuuWrrrrrrXXXXXoooo#kkkkkk#qqRqRqRqEuuuuuufffffTT', // 10
      'TTTTyvyTuuuuuuErrrrrrXXXXXoooo#kkkkkk#qqRqRqRqEuuuuuufffffTT', // 11
      'TTTTyvyTuuuuuuWrrrrrrXXXXXoooo#kkkkkk#qqRqRqRqEuuuuuufffffTT', // 12
      'TTTTyvyTuuuuuuErrrrrrXXXXXoooo#kkkkkk#qqqqqqqqEuuuuuufffffTT', // 13
      'TTyyyvyTuuuuuuE####D#XXXXX##D###D#####D#######EuuuuuufffffTT', // 14
      'TTyvvvyTuuuuuuW......,....,........,....XXXXXXEuuuuuufffffTT', // 15
      'TTyvyyyTuuuuuuE##D####D####D###lll##D##D######EuuuuuufffffTT', // 16
      'TTyvyTTTuuuuuuEcccc#mmmmm#bbb#lllll#xx#sssssssEuuuuuufffffTT', // 17
      'TTyvyTTTuuuuuuEchch#mmmmm#bbG#lllll#xx#ssHsHssEuuuuuufffTTTT', // 18
      'TTyvyTTTuuuuuuEchch#mmmmm#bbD#lllll#xx#ssHsHssEuuuuuufffTTTT', // 19
      'TTyvyTTTuuuuuuEchch#mmmmm#bbG#lllll#xx#ssHsHssEuuuuuufffTTTT', // 20
      'TTyvyyTTuuuuuuEchch#mmmmm#bbD#lllll####ssHsHssEuuuuuufffTTTT', // 21
      'TTyvvyTTuuuuuuEcccc#mmmmm#bbG#lllll####sssssHDEuuuuuufffTTTT', // 22
      'TTyyvyTTuuuuuuEEEEEEEEEEwEEwEEWEDEWEEEEEEEEEEEEuuuuuufffTTTT', // 23
      'TTTyvyTTuuuuuuuuuuuuuugggggggggpppggggggggguuuuuuuuuufffTTTT', // 24
      'TTTyvyTTuuuuuuuuuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 25
      'TTTyvyTTuuuuuuuuuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 26
      'TTTyvyyTuuuuuuuuuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 27
      'TTTyvvyTuuuuuuuuuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 28
      'TTTyyvyTuuuuuuuuuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 29
      'TTTTyvyTffffffffuuuuuuggggggggggggggggggggguuuuuuuuuufffffTT', // 30
      'TTTTyvyTffffffffuuuuuuggggggggggggggggggggguuuufffffffffffTT', // 31
      'TTyyyvyTffffffffuuuuuuggggggggggggggggggggguuuufffffffffTTTT', // 32
      'TTyvvvyTffffffffuuuuuuggggggggggggggggggggguuuufffffffffTTTT', // 33
      'TTyvyyyTffffffffffffffuuddduuuuuuuuuuuuuuuufffffffffffffTTTT', // 34
      'TTyvyTTTffffffffffffffuuddduuuuuuuuuuuuuuuufffffffffffffTTTT', // 35
      'TTyvyTTTffffffffffffffuuddduuuuuuuuuuuuuuuufffffffffffffTTTT', // 36
      'TTyvyTTTffffffffffffffffddduufffffffffffffffffffffffffffffTT', // 37
      'TTyvyTTTffffffffffffffffddduufffffffffffffffffffffffffffffTT', // 38
      'TTyvyTTTffffffffffffffffddduufffffffffffffffffffffffffffffTT', // 39
      'TTyvyyTTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaTT', // 40
      'TTyvvyTTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaTT', // 41
      'TTyyvyTTuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuvuuTT', // 42
      'TTTyvyTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTyvyTTT', // 43
      'TTTyvyTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTyvyTTT', // 44
      'TTTyvyTTTTTyyyyyyyyyyTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTyyvyTTT', // 45
      'TTTyvyyyyyyyvvvvvvvvyTyyyyyyTTTTyyyyyyyyyyTTTyyyyyyyTyvvyTTT', // 46  (rows 43..65: the deep woods south of the road — the trail)
      'TTTyvvvvvvvvvyyyyyyvyyyvvvvyyyyyyvvvvvvvvyTTTyvvvvvyTyvyyTTT', // 47
      'TTTyyyyyyyyyyyTTTTyvvvvvvvvvvvvvvvyyyyyyvyyyyyvyyyvyTyvyTTTT', // 48
      'TTTTTTTTTTTTTTTTTTyyyyyvvvvyyyyyyyyTTTTyvvvvvvvyTyvyTyvyyyTT', // 49
      'TTTTTTTTTTTTTTTTTTTTTTyyyyyyTTTTTTTTTTTyyyyyyyyyTyvyTyvvvyTT', // 50
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTyvyTyyyvyTT', // 51
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTyvyTTTyvyTT', // 52
      'TTTTTTTyyyyyyyyyTTTTTTTTTTTTTTTTTTTTTTTTTTTyyyyyyyvyTTTyvyTT', // 53
      'TTTTTTTyvvvvvvvyTTTTTyyyyyyyyyyyyyyyyyTTTTTyvvvvvvvyTTTyvyTT', // 54
      'TTTTTTTyvyvvvyvyyyyyyyvvvvvvvvvvvvvvvyyyyyyyvyyyyyyyTTTyvyTT', // 55
      'TTTTTTTyvyvvvyvvvvvvvvvyyvvvvyyyyyyyvvvvvvvvvyTTTTTTTTyyvyTT', // 56
      'TTTTTTTyvyvvvyyyyyyyyyyyyvvvvyTTTTTyyyyyyyyyyyTTTTTTTTyvvyTT', // 57
      'TTTTTTTyvyyyyyTTTTTTTTTTyyyyyyTTTTTTTTTTTTTTTTTTTTTTTTyvyyTT', // 58
      'TTTTTTTyvyTTTTTTTTTTTTTyyyyyyyyyyTTTTTTTTTTTTyyyyyyyyTyvyTTT', // 59
      'TTTTTTTyvyyyyyyyyyTTTTTyvvvvvvvvyTyyyyyyTTTTTyvvvvvvyTyvyTTT', // 60
      'TTTTTTTyvvvvvvvvvyyyyyyyvyyyyyyvyyyvvvvyyyyyyyvyyyyvyyyvyTTT', // 61
      'TTTTTTTyyyyyyyyyvvvvvvvvvyTTTTyvvvvvvvvvvvvvvvvyTTyvvvvvyTTT', // 62
      'TTTTTTTTTTTTTTTyyyyyyyyyyyTTTTyyyyyvvvvyyyyyyyyyTTyyyyyyyTTT', // 63
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 64
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // 65
    ],
    legend: {
      // --- walls
      T: { wall: 'trees', solid: true },
      F: { wall: 'fence', solid: true },
      E: { wall: 'wall_paint', inner: true, outside: 'concrete_ext', solid: true },
      '#': { wall: 'wall_paint', inner: true, solid: true },
      X: { wall: 'wall_paint', inner: true, solid: true, reserved: true },
      W: { wall: 'wall_paint', inner: true, outside: 'concrete_ext', overlay: 'window', solid: true },
      w: { wall: 'wall_paint', inner: true, outside: 'concrete_ext', overlay: 'window_small', solid: true },
      R: { wall: 'rack_server', solid: true },
      H: { wall: 'shelf_supplies', solid: true },
      h: { wall: 'shelf_tapes', solid: true },
      G: { wall: 'stall', solid: true },
      D: { door: true },
      // --- interior floors
      '.': { floor: 'floor_lino', ceil: 'ceil_tile', room: 'hall', walls: 'wall_paint' },
      ',': { floor: 'floor_lino', ceil: 'ceil_tile', room: 'hall', walls: 'wall_paint', creak: true },
      r: { floor: 'floor_carpet', ceil: 'ceil_tile', room: 'radio', walls: 'wall_paint' },
      o: { floor: 'floor_carpet', ceil: 'ceil_tile', room: 'office', walls: 'wall_paint' },
      k: { floor: 'floor_tile', ceil: 'ceil_tile', room: 'kitchen', walls: 'wall_kitchen' },
      q: { floor: 'floor_tile', ceil: 'ceil_tile', room: 'equipment', walls: 'wall_panel' },
      l: { floor: 'floor_tile', ceil: 'ceil_tile', room: 'lobby', walls: 'wall_paint' },
      s: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'storage', walls: 'wall_paint' },
      b: { floor: 'floor_tile', ceil: 'ceil_tile', room: 'bathroom', walls: 'wall_tile' },
      m: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'workshop', walls: 'wall_brick' },
      c: { floor: 'floor_lino', ceil: 'ceil_tile', room: 'records', walls: 'wall_panel' },
      x: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'stairs', walls: 'wall_paint' },
      n: { floor: 'floor_lino', ceil: 'ceil_tile', room: 'newhall', walls: 'wall_paint' },
      // 2049 only (abandoned mutation): the roof has fallen in — grey sky and daylight through the hole
      Z: { floor: 'floor_lino', ceil: null, outdoor: false, room: 'hall', walls: 'wall_paint' },
      Y: { floor: 'floor_concrete', ceil: null, outdoor: false, room: 'storage', walls: 'wall_paint' },
      e: { floor: 'floor_lino', ceil: 'ceil_tile', room: 'hall_ext', walls: 'wall_paint' },
      // --- exterior
      p: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'lot', outdoor: true },
      g: { floor: 'ground_gravel', ceil: null, room: 'lot' },
      u: { floor: 'ground_mud', ceil: null, room: 'lot' },
      d: { floor: 'ground_asphalt', ceil: null, room: 'lot' },
      a: { floor: 'ground_asphalt', ceil: null, room: 'road' },
      f: { floor: 'ground_mud', ceil: null, room: 'forest', decor: TREE },
      // the woods trail: a paler strip of trodden mud you can follow in the dark
      v: { floor: 'ground_gravel', ceil: null, room: 'woods', light: 0.55 },
      // dense trees crowding the trail (you cannot push through them: no shortcuts between legs)
      y: { floor: 'ground_mud', ceil: null, room: 'forest', solid: true, decor: DENSE, light: 0.24 },
    },
    ambience: { rain: 1, wind: 0.55, thunder: 0.4 },
    // screens and dials that stay lit on their own supply when the generator dies: the receiver
    // (circuit 'radio' = the receiver's power switch) and the CCTV bank (on the UPS)
    emissiveCircuits: { radio_console: 'radio', cctv_bank: 'ups' },
    roomAmbience: {
      hall: { room: 'hall' }, lobby: { room: 'hall' }, newhall: { room: 'hall', drone: 0.35 }, hall_ext: { room: 'hall', drone: 0.2 },
      bathroom: { room: 'bathroom' }, lot: { room: 'outside' }, road: { room: 'outside' }, forest: { room: 'outside' },
      woods: { room: 'outside', wind: 0.8 },
    },
    faces: [
      // ---- radio room (x15..20, y9..13): console along the north wall, windows west
      { x: 15, y: 8, side: 's', tex: 'bookcase' },               // shelf with the jar
      { x: 16, y: 8, side: 's', tex: 'radio_console' },
      { x: 17, y: 8, side: 's', tex: 'radio_console' },
      { x: 18, y: 8, side: 's', tex: 'radio_console' },          // knee-hole: hide_desk
      { x: 19, y: 8, side: 's', tex: 'cctv_bank' },
      { x: 20, y: 8, side: 's', tex: 'wall_paint+dec_calendar' },
      { x: 21, y: 9, side: 'w', tex: 'bookcase' },               // procedures binder
      { x: 21, y: 10, side: 'w', tex: 'map_wall' },
      { x: 21, y: 13, side: 'w', tex: 'wall_paint+dec_clock' },
      { x: 18, y: 14, side: 'n', tex: 'wall_paint+dec_switch' },
      { x: 18, y: 14, side: 's', tex: 'wall_paint+dec_sign_radio' },
      // ---- office (x26..29, y9..13)
      { x: 26, y: 8, side: 's', tex: 'filing_cabinet' },
      { x: 28, y: 8, side: 's', tex: 'bookcase' },
      { x: 29, y: 8, side: 's', tex: 'filing_cabinet' },
      { x: 25, y: 10, side: 'e', tex: 'wall_paint+dec_blueprint' },
      { x: 25, y: 12, side: 'e', tex: 'wall_paint+dec_vent' },
      { x: 30, y: 10, side: 'w', tex: 'wall_paint+dec_keycabinet' },
      { x: 30, y: 11, side: 'w', tex: 'wall_paint+dec_weather_panel' },
      { x: 30, y: 12, side: 'w', tex: 'wall_paint+dec_phone' },
      // ---- kitchen (x31..36, y9..13)
      { x: 31, y: 8, side: 's', tex: 'kitchen_counter' },
      { x: 32, y: 8, side: 's', tex: 'kitchen_counter' },
      { x: 33, y: 8, side: 's', tex: 'kitchen_counter' },         // coffee machine
      { x: 35, y: 8, side: 's', tex: 'kitchen_counter' },
      { x: 37, y: 9, side: 'w', tex: 'fridge' },
      { x: 37, y: 12, side: 'w', tex: 'wall_kitchen+dec_vent' },
      { x: 30, y: 9, side: 'e', tex: 'corkboard' },
      { x: 30, y: 11, side: 'e', tex: 'wall_kitchen+dec_photo' },
      { x: 30, y: 13, side: 'e', tex: 'wall_kitchen+dec_clock' },
      // ---- equipment room (x38..45, y9..13): racks x40/42/44, squeeze x45 to the steel door
      { x: 37, y: 10, side: 'e', tex: 'terminal_tape' },
      { x: 37, y: 12, side: 'e', tex: 'wall_panel+dec_notice' },
      { x: 45, y: 8, side: 's', tex: 'door_steel+dec_stencil_relay' },
      { x: 46, y: 10, side: 'w', tex: 'cables' },
      { x: 46, y: 11, side: 'w', tex: 'cables' },
      // ---- hall (y15)
      { x: 40, y: 15, side: 'w', tex: 'wall_paint+dec_notice' },  // end of the hall
      { x: 26, y: 14, side: 's', tex: 'wall_paint+dec_notice' },
      { x: 25, y: 16, side: 'n', tex: 'wall_paint+dec_vent' },
      // ---- lobby (x30..34, y17..22)
      { x: 29, y: 19, side: 'e', tex: 'wall_paint+dec_plaque' },
      { x: 35, y: 21, side: 'w', tex: 'wall_paint+dec_notice' },  // sign-in sheet
      { x: 31, y: 23, side: 'n', tex: 'wall_paint+dec_sign_exit' },
      { x: 33, y: 23, side: 'n', tex: 'wall_paint+dec_switch' },
      // ---- bathroom (x26..28, y17..22)
      { x: 25, y: 18, side: 'e', tex: 'mirror_wall' },
      { x: 25, y: 19, side: 'e', tex: 'mirror_wall' },
      { x: 25, y: 21, side: 'e', tex: 'wall_tile+dec_vent' },
      // ---- workshop (x20..24, y17..22)
      { x: 19, y: 18, side: 'e', tex: 'breaker_panel' },
      { x: 19, y: 20, side: 'e', tex: 'shelf_supplies' },
      { x: 25, y: 18, side: 'w', tex: 'wall_brick+dec_vent' },
      { x: 25, y: 20, side: 'w', tex: 'ladder_wall' },
      { x: 20, y: 23, side: 'n', tex: 'shelf_supplies' },
      { x: 21, y: 23, side: 'n', tex: 'workbench' },
      { x: 22, y: 23, side: 'n', tex: 'workbench' },
      // ---- records (x15..18, y17..22)
      { x: 15, y: 23, side: 'n', tex: 'filing_cabinet' },
      { x: 17, y: 23, side: 'n', tex: 'filing_cabinet' },
      { x: 19, y: 17, side: 'w', tex: 'filing_cabinet' },
      // ---- stairwell (x36..37, y17..20): the flight drops away south
      { x: 36, y: 21, side: 'n', tex: 'stairs_down' },
      { x: 37, y: 21, side: 'n', tex: 'wall_paint+dec_notice' },
      { x: 35, y: 18, side: 'e', tex: 'wall_paint+dec_sign_exit' },
      // ---- storage (x39..45, y17..22)
      { x: 46, y: 18, side: 'w', tex: 'wall_paint+dec_vent' },
      { x: 39, y: 23, side: 'n', tex: 'shelf_supplies' },
      { x: 40, y: 23, side: 'n', tex: 'shelf_supplies' },
      // ---- outside
      { x: 31, y: 23, side: 's', tex: 'sign_station' },
      { x: 33, y: 23, side: 's', tex: 'concrete_ext+dec_notice' },
    ],
    doors: [
      { id: 'front_door', x: 32, y: 23, axis: 'h', tex: 'door_front', inside: 'n' },
      { id: 'radio_door', x: 19, y: 14, axis: 'h', tex: 'door_wood', lockableInside: true, inside: 'n' },
      { id: 'office_door', x: 28, y: 14, axis: 'h', tex: 'door_wood', inside: 'n' },
      { id: 'kitchen_door', x: 32, y: 14, axis: 'h', tex: 'door_wood', inside: 'n' },
      { id: 'equip_door', x: 38, y: 14, axis: 'h', tex: 'door_metal', inside: 'n' },
      { id: 'records_door', x: 17, y: 16, axis: 'h', tex: 'door_records', locked: true, key: 'key_records', inside: 's' },
      { id: 'workshop_door', x: 22, y: 16, axis: 'h', tex: 'door_metal', inside: 's' },
      { id: 'bath_door', x: 27, y: 16, axis: 'h', tex: 'door_wood', inside: 's' },
      { id: 'stairs_door', x: 36, y: 16, axis: 'h', tex: 'door_metal', inside: 's' },
      { id: 'storage_door', x: 39, y: 16, axis: 'h', tex: 'door_wood', inside: 's' },
      // stall and cupboard fronts: fixed shut, you slip in behind them to hide
      // slats: see-through door (DA.render draws the room behind it through the gaps): the stall
      // partition is open at the floor and top, the cupboard door is louvred
      { id: 'stall_1', x: 28, y: 19, axis: 'v', tex: 'stall', static: true, locked: true, slats: 'gap' },
      { id: 'stall_2', x: 28, y: 21, axis: 'v', tex: 'stall', static: true, slats: 'gap' },
      { id: 'cupboard', x: 45, y: 22, axis: 'h', tex: 'door_wood', static: true, slats: 'louver' },
    ],
    props: [
      { id: 'chair', x: 17.0, y: 9.72, tex: 'spr_chair', solid: true, radius: 0.2 },
      { id: 'jar', x: 15.5, y: 9.1, tex: 'spr_jar', z: 0.42 },
      { id: 'mug', x: 16.3, y: 9.12, tex: 'spr_mug', z: 0.36, hidden: true },
      { id: 'office_desk', x: 27.5, y: 10.8, tex: 'spr_table', solid: true, radius: 0.42 },
      { id: 'office_chair', x: 27.45, y: 11.5, tex: 'spr_chair', frame: 1, solid: true, radius: 0.18 },
      { id: 'table', x: 34.0, y: 11.6, tex: 'spr_table', solid: true, radius: 0.45 },
      { id: 'lobby_table', x: 33.7, y: 18.0, tex: 'spr_table', solid: true, radius: 0.4 },
      { x: 30.35, y: 20.9, tex: 'spr_chair', frame: 1, solid: true, radius: 0.18 },
      { x: 30.35, y: 21.6, tex: 'spr_chair', frame: 1, solid: true, radius: 0.18 },
      { x: 33.3, y: 12.25, tex: 'spr_chair', solid: true, radius: 0.18 },
      { x: 34.8, y: 11.0, tex: 'spr_chair', flip: true, frame: 1, solid: true, radius: 0.18 },
      { id: 'player_car', x: 29.0, y: 29.6, tex: 'spr_car', solid: true, radius: 0.8 },
      { id: 'hollis_car', x: 37.3, y: 29.6, tex: 'spr_car2', solid: true, radius: 0.8 },
      // PLAN §7.3: the day man's car (hidden until the director shows it at dawn; pt_replacement_car)
      { id: 'replacement_car', x: 37.3, y: 29.6, tex: 'spr_car2', flip: true, solid: true, radius: 0.8, hidden: true },
      { id: 'lamp_post', x: 35.6, y: 26.6, tex: 'spr_lamp_post', solid: true, radius: 0.15 },
      { id: 'lamp_post_w', x: 26.6, y: 27.6, tex: 'spr_lamp_post', flip: true, solid: true, radius: 0.15 },
      { id: 'station_sign', x: 27.6, y: 38.7, tex: 'spr_sign', solid: true, radius: 0.3 },
      { id: 'mast', x: 39.5, y: 4.0, tex: 'spr_mast', solid: true, radius: 0.25 },
      // decor (no id → static, never persisted)
      { x: 23.6, y: 21.6, tex: 'spr_barrel', solid: true, radius: 0.22 },
      { x: 20.45, y: 21.5, tex: 'spr_boxes', solid: true, radius: 0.3 },
      { x: 40.0, y: 21.6, tex: 'spr_boxes', solid: true, radius: 0.3 },
      // NE corner of the supply room, clear of the x44 aisle to the cupboard (at 44.3,17.6 it sealed it)
      { x: 45.62, y: 17.3, tex: 'spr_boxes', solid: true, radius: 0.3 },
      { x: 39.6, y: 18.3, tex: 'spr_bucket' },
      { x: 39.2, y: 12.8, tex: 'spr_cable_coil' },
      { x: 45.5, y: 13.3, tex: 'spr_cable_coil' },
      { x: 18.5, y: 22.5, tex: 'spr_boxes', solid: true, radius: 0.28 },
      { x: 37.6, y: 4.6, tex: 'spr_barrel', solid: true, radius: 0.22 },
      { x: 12.2, y: 20.5, tex: 'spr_barrel', solid: true, radius: 0.22 },
      // the woods trail's landmarks (static)
      { x: 13.5, y: 45.4, tex: 'spr_tree_dead' },                                   // leg 1: a dead tree at the jog
      { x: 24.7, y: 47.35, tex: 'spr_car_rusted', solid: true, radius: 0.55 },      // leg 1: somebody's car, a long time ago
      { x: 26.3, y: 57.35, tex: 'spr_barrel', solid: true, radius: 0.22 },          // leg 2: the dump (woods_mid)
      { x: 26.9, y: 57.55, tex: 'spr_barrel', flip: true, solid: true, radius: 0.22 },
      { x: 27.8, y: 56.6, tex: 'spr_debris' }, { x: 25.3, y: 57.5, tex: 'spr_debris' }, { x: 28.4, y: 55.3, tex: 'spr_bucket' },
      { x: 11.0, y: 57.3, tex: 'spr_sign', solid: true, radius: 0.3 },              // leg 2: RELAY STATION 14, out here
      { x: 36.6, y: 63.4, tex: 'spr_lamp_post', solid: true, radius: 0.15 },        // leg 3: a street lamp, no street
      { x: 55.35, y: 52.6, tex: 'spr_boxes', solid: true, radius: 0.3 },            // the last corridor: supply boxes
      { x: 57.4, y: 55.3, tex: 'spr_boxes', flip: true, solid: true, radius: 0.3 },
    ],
    interact: [
      // radio room
      { id: 'radio_desk', kind: 'radio', x: 16, y: 8, side: 's', cells: [[17, 8]], prompt: 'Sit at the radio' },
      { id: 'hide_desk', kind: 'hide', x: 18, y: 8, side: 's', prompt: 'Hide under the desk', pos: { x: 18.5, y: 9.26, angle: 90 } },
      { id: 'cctv', kind: 'cctv', x: 19, y: 8, side: 's', prompt: 'Security monitors' },
      { id: 'desk_calendar', kind: 'calendar', x: 20, y: 8, side: 's', prompt: 'Desk calendar' },
      { id: 'procedures', kind: 'doc', x: 21, y: 9, side: 'w', doc: 'doc_procedures', prompt: 'Operating procedures' },
      { id: 'wall_map', kind: 'map', x: 21, y: 10, side: 'w', prompt: 'County map' },
      { id: 'radio_window', kind: 'look', x: 14, y: 10, side: 'e', cells: [[14, 12]], prompt: 'Look outside' },
      // office
      { id: 'office_desk', kind: 'paperwork', x: 27.5, y: 10.8, radius: 0.55, prompt: 'Shift report' },
      { id: 'key_cabinet', kind: 'keypad', x: 30, y: 10, side: 'w', code: '1978', item: 'key_records', title: 'KEY CABINET', prompt: 'Key cabinet' },
      { id: 'blueprint', kind: 'doc', x: 25, y: 10, side: 'e', doc: 'doc_blueprint', prompt: 'Station blueprint' },
      { id: 'weather_panel', kind: 'weather', x: 30, y: 11, side: 'w', source: 'panel', prompt: 'Weather panel' },
      { id: 'phone', kind: 'phone', x: 30, y: 12, side: 'w', prompt: 'Telephone' },
      { id: 'vent_office', kind: 'vent', x: 25, y: 12, side: 'e', note: 'note_1', notes: ['note_1', 'note_8'], prompt: 'Vent grille' },
      // kitchen
      { id: 'coffee_machine', kind: 'coffee', x: 33, y: 8, side: 's', prompt: 'Coffee machine' },
      { id: 'fridge', kind: 'look', x: 37, y: 9, side: 'w', prompt: 'Fridge' },
      { id: 'corkboard', kind: 'doc', x: 30, y: 9, side: 'e', doc: 'doc_corkboard', prompt: 'Corkboard' },
      { id: 'staff_photo', kind: 'photo', x: 30, y: 11, side: 'e', prompt: 'Staff photo' },
      { id: 'vent_kitchen', kind: 'vent', x: 37, y: 12, side: 'w', note: 'note_2', prompt: 'Vent grille' },
      // equipment
      { id: 'tape_terminal', kind: 'terminal', x: 37, y: 10, side: 'e', prompt: 'Tape backup terminal' },
      { id: 'racks', kind: 'look', x: 40, y: 11, side: 'w', cells: [[40, 12], [40, 10]], prompt: 'Equipment racks' },
      { id: 'relay_door', kind: 'keypad', x: 45, y: 8, side: 's', code: '0213', title: 'RELAY CHAMBER', prompt: 'Steel door' },
      // hall
      { id: 'vent_hall', kind: 'vent', x: 25, y: 16, side: 'n', note: 'note_3', notes: ['note_3', 'note_9'], prompt: 'Vent grille' },
      // lobby
      { id: 'signin_sheet', kind: 'doc', x: 35, y: 21, side: 'w', doc: 'doc_signin', prompt: 'Sign-in sheet' },
      { id: 'lobby_plaque', kind: 'doc', x: 29, y: 19, side: 'e', doc: 'doc_plaque', prompt: 'Plaque' },
      // bathroom
      { id: 'mirror', kind: 'mirror', x: 25, y: 18, side: 'e', prompt: 'Mirror' },
      { id: 'sink', kind: 'look', x: 25, y: 19, side: 'e', prompt: 'Sink' },
      // crouched on the seat: the gap under the partition (slats 'gap') is in view — feet would show
      { id: 'hide_stall', kind: 'hide', x: 28, y: 21, side: 'w', prompt: 'Hide in the stall', pos: { x: 28.8, y: 21.5, angle: 180, eye: 0.24 } },
      { id: 'vent_bath', kind: 'vent', x: 25, y: 21, side: 'e', note: 'note_4', prompt: 'Vent grille' },
      // workshop
      { id: 'workbench', kind: 'flashlight', x: 21, y: 23, side: 'n', cells: [[22, 23]], item: 'flashlight', prompt: 'Take the flashlight' },
      { id: 'breaker_panel', kind: 'breaker', x: 19, y: 18, side: 'e', prompt: 'Breaker panel' },
      { id: 'roof_ladder', kind: 'ladder', x: 25, y: 20, side: 'w', to: 'roof', point: 'pt_roof_arrive', prompt: 'Climb to the roof' },
      { id: 'vent_workshop', kind: 'vent', x: 25, y: 18, side: 'w', note: 'note_5', prompt: 'Vent grille' },
      // records
      { id: 'records_shelves', kind: 'tapes', x: 16, y: 19, side: 'e', cells: [[16, 18], [16, 20], [18, 19], [18, 20]], prompt: 'Tape archive',
        tapes: ['tape_1954', 'tape_1932', 'tape_1901', 'tape_1887', 'tape_first_contact', 'tape_do_not_duplicate', 'tape_name', 'tape_op_loop', 'tape_op_survive'] },
      { id: 'records_cabinet', kind: 'doc', x: 17, y: 23, side: 'n', doc: 'doc_personnel', prompt: 'Personnel files' },
      // stairs
      { id: 'stairs_down', kind: 'stairs', x: 36, y: 21, side: 'n', to: 'basement', point: 'pt_b_arrive', prompt: 'Go down to the basement' },
      // storage
      { id: 'hide_cupboard', kind: 'hide', x: 45, y: 22, side: 'n', prompt: 'Hide in the cupboard', pos: { x: 45.5, y: 22.8, angle: 270 } },
      { id: 'vent_storage', kind: 'vent', x: 46, y: 18, side: 'w', note: 'note_6', prompt: 'Vent grille' },
      // outside
      { id: 'car', kind: 'car', x: 29.0, y: 29.6, radius: 0.95, prompt: 'Your car' },
    ],
    points: {
      pt_arrive: { x: 30.3, y: 30.4, angle: 288 },
      pt_car: { x: 29.0, y: 29.6, angle: 270 },
      pt_hollis_start: { x: 32.3, y: 24.6, angle: 115 },
      pt_front_outside: { x: 32.5, y: 24.7, angle: 90 },
      pt_front_inside: { x: 32.5, y: 22.2, angle: 270 },
      pt_hollis_exit: { x: 32.6, y: 25.6, angle: 90 },
      pt_hollis_car: { x: 36.1, y: 28.5, angle: 20 },
      pt_replacement_car: { x: 37.3, y: 29.6, angle: 270 },
      // cars come and go by the driveway (x24..26): road east end → driveway mouth → top of the drive
      pt_drive_road: { x: 58.5, y: 40.5, angle: 180 },
      pt_drive_mouth: { x: 25.5, y: 40.6, angle: 270 },
      pt_drive_lot: { x: 25.6, y: 33.4, angle: 300 },
      pt_replacement_arrive: { x: 33.4, y: 26.8, angle: 270 },
      pt_lot_far: { x: 40.8, y: 32.6, angle: 225 },
      pt_window_out: { x: 12.4, y: 11.5, angle: 0 },
      pt_entity_outside: { x: 23.4, y: 31.5, angle: 330 },
      // tour: Hollis stands at each thing he talks about
      pt_tour_lobby: { x: 34.2, y: 20.4, angle: 20 },
      pt_tour_stairs: { x: 36.5, y: 15.5, angle: 90 },
      pt_tour_equipment: { x: 38.7, y: 11.6, angle: 300 },
      pt_tour_kitchen: { x: 33.5, y: 9.9, angle: 270 },
      pt_tour_bath: { x: 27.3, y: 17.4, angle: 150 },
      pt_tour_workshop: { x: 22.0, y: 19.6, angle: 195 },
      pt_tour_records: { x: 17.5, y: 15.5, angle: 90 },
      pt_tour_radio: { x: 19.3, y: 10.3, angle: 200 },
      // radio room
      pt_radio_chair: { x: 17.0, y: 9.72, angle: 270 },
      pt_desk_stand: { x: 17.0, y: 10.6, angle: 270 },
      pt_mug_radio: { x: 16.3, y: 9.12, angle: 270, z: 0.36 },          // z: surface height (DA.world.pointProp applies it)
      pt_mug_kitchen: { x: 33.98, y: 11.66, angle: 270, z: 0.31 },       // on the kitchen table, just in front of its centre
      // the figure on CCTV: in the hall by the radio door → on the threshold (half hidden by the
      // jamb on CAM 2) → mid-room → right behind the chair (CAM 4)
      pt_fig_1: { x: 18.3, y: 15.55, angle: 270 },
      pt_fig_2: { x: 19.5, y: 15.15, angle: 270 },       // in the doorway, in front of the jamb (CAM 2)
      pt_fig_3: { x: 17.9, y: 11.6, angle: 250 },
      // right behind the chair — and behind (south of) where you stand at the desk (pt_desk_stand), so
      // turning to look at it after the desk VIEW button faces away from the console
      pt_fig_4: { x: 17.05, y: 10.95, angle: 270 },
      pt_entity_hall: { x: 30.5, y: 15.5, angle: 180 },
      pt_entity_radio_door: { x: 19.5, y: 15.5, angle: 270 },
      pt_storage_arrive: { x: 42.5, y: 19.6, angle: 270 },
      pt_office_elsewhere: { x: 39.5, y: 16.62, angle: 90 },
      pt_newhall_start: { x: 24.5, y: 13.5, angle: 270 },
      pt_newhall_end: { x: 22.5, y: 11.6, angle: 90 },
      pt_relay_return: { x: 45.5, y: 9.62, angle: 90 },
      pt_roof_return: { x: 24.35, y: 20.5, angle: 180 },
      pt_stairs_return: { x: 36.5, y: 20.3, angle: 270 },
      // cameras
      cam_1: { x: 35.3, y: 26.15, angle: 222 },
      cam_2: { x: 24.3, y: 15.78, angle: 188 },
      cam_4: { x: 20.72, y: 9.28, angle: 142 },
    },
    triggers: [
      // the woods: two woods_deep zones, one near each end of the trail, each firing only when you
      // walk north through it (dir 270), whichever way round you took the loop
      { id: 'woods_deep', x0: 56, y0: 52, x1: 56, y1: 54, dir: 270 },
      { id: 'woods_deep', x0: 5, y0: 10, x1: 5, y1: 12, dir: 270 },
      { id: 'woods_path', x0: 5, y0: 6, x1: 8, y1: 8 },
      { id: 'woods_mid', x0: 25, y0: 55, x1: 28, y1: 57 },
      { id: 'woods_out', x0: 55, y0: 42, x1: 55, y1: 43 },
      { id: 'window_out', x0: 11, y0: 9, x1: 13, y1: 13 },
      { id: 'lot_edge', x0: 22, y0: 33, x1: 42, y1: 33 },
      { id: 'road', x0: 8, y0: 40, x1: 57, y1: 41 },
      { id: 'front_porch', x0: 31, y0: 24, x1: 33, y1: 24 },
      // the new hallway (mutation new_hallway): 'newhall_inside' fires on entering from EITHER end —
      // the hall door (24,14 → 24,13) or the radio room's new east door (newhall_exit 21,12 → 22,12);
      // 'newhall_inside_b' fires only on the radio-room end (same zone, its own id)
      { id: 'newhall_inside', x0: 24, y0: 13, x1: 24, y1: 13 },
      { id: 'newhall_inside', x0: 21, y0: 12, x1: 22, y1: 12 },
      { id: 'newhall_inside_b', x0: 21, y0: 12, x1: 22, y1: 12 },
      { id: 'newhall_end', x0: 22, y0: 11, x1: 22, y1: 12 },
      { id: 'hall_end', x0: 44, y0: 15, x1: 45, y1: 15 },
    ],
    lights: [
      // main (ceiling fluorescents)
      { id: 'radio_l1', x: 16.5, y: 11.0, radius: 5, intensity: 0.85, circuit: 'main' },
      { id: 'radio_l2', x: 19.3, y: 11.0, radius: 5, intensity: 0.85, circuit: 'main' },
      { id: 'office_l', x: 27.5, y: 11.0, radius: 4.5, intensity: 0.8, circuit: 'main' },
      { id: 'kitchen_l', x: 33.5, y: 10.8, radius: 5, intensity: 0.85, circuit: 'main' },
      { id: 'equip_l1', x: 38.9, y: 11.0, radius: 5, intensity: 0.7, circuit: 'main' },
      { id: 'equip_l2', x: 43.0, y: 13.4, radius: 4, intensity: 0.6, circuit: 'main' },
      { id: 'equip_l3', x: 45.5, y: 9.4, radius: 2.6, intensity: 0.32, circuit: 'main', flicker: 0.04 },
      { id: 'lobby_l', x: 32.5, y: 19.5, radius: 5, intensity: 0.8, circuit: 'main' },
      { id: 'records_l', x: 16.5, y: 19.5, radius: 4, intensity: 0.7, circuit: 'main' },
      { id: 'workshop_l', x: 22.5, y: 19.5, radius: 5, intensity: 0.8, circuit: 'main' },
      { id: 'bath_l', x: 26.9, y: 19.5, radius: 4, intensity: 0.75, circuit: 'main', flicker: 0.08 },
      { id: 'stairs_l', x: 36.9, y: 18.5, radius: 3, intensity: 0.6, circuit: 'main' },
      { id: 'storage_l', x: 42.5, y: 19.5, radius: 5, intensity: 0.65, circuit: 'main' },
      // corridor (needs main; breaker C)
      { id: 'hall_1', x: 17.5, y: 15.5, radius: 4, intensity: 0.8, circuit: 'corridor' },
      { id: 'hall_2', x: 22.5, y: 15.5, radius: 4, intensity: 0.8, circuit: 'corridor' },
      { id: 'hall_3', x: 27.5, y: 15.5, radius: 4, intensity: 0.8, circuit: 'corridor' },
      { id: 'hall_4', x: 32.5, y: 15.5, radius: 4, intensity: 0.8, circuit: 'corridor', flicker: 0.16 },
      { id: 'hall_5', x: 37.5, y: 15.5, radius: 4, intensity: 0.8, circuit: 'corridor' },
      // emergency (red wall lamps; automatic while main is off). The dark must stay scary but
      // navigable without the flashlight: halls, stairs and the radio room read best; every hiding
      // place (desk, stall, cupboard) and the steel door keep a dim pool of red.
      { id: 'em_radio', x: 20.2, y: 13.4, radius: 6.5, intensity: 0.8, circuit: 'emergency' },
      { id: 'em_hall_w', x: 24.5, y: 15.5, radius: 6, intensity: 0.66, circuit: 'emergency' },
      { id: 'em_hall_ww', x: 15.6, y: 15.5, radius: 5.5, intensity: 0.62, circuit: 'emergency' },
      { id: 'em_hall_e', x: 35.5, y: 15.5, radius: 6, intensity: 0.66, circuit: 'emergency' },
      { id: 'em_lobby', x: 30.4, y: 17.4, radius: 6, intensity: 0.55, circuit: 'emergency' },
      { id: 'em_office', x: 26.4, y: 13.4, radius: 5, intensity: 0.56, circuit: 'emergency' },
      { id: 'em_kitchen', x: 31.4, y: 13.4, radius: 5.5, intensity: 0.56, circuit: 'emergency' },
      { id: 'em_equip', x: 38.4, y: 13.4, radius: 5.5, intensity: 0.55, circuit: 'emergency' },
      { id: 'em_relay_door', x: 45.5, y: 9.4, radius: 4.5, intensity: 0.62, circuit: 'emergency' },   // the steel door aisle
      { id: 'em_workshop', x: 22.5, y: 18.2, radius: 6.5, intensity: 0.62, circuit: 'emergency' },
      { id: 'em_bath', x: 26.4, y: 17.4, radius: 4, intensity: 0.48, circuit: 'emergency' },
      { id: 'em_bath_stall', x: 26.6, y: 21.6, radius: 3.5, intensity: 0.42, circuit: 'emergency' },
      { id: 'em_records', x: 15.4, y: 17.4, radius: 4.5, intensity: 0.42, circuit: 'emergency' },
      { id: 'em_stairs', x: 37.0, y: 19.4, radius: 4.5, intensity: 0.66, circuit: 'emergency' },
      { id: 'em_storage', x: 42.0, y: 17.4, radius: 6, intensity: 0.55, circuit: 'emergency' },
      { id: 'em_storage_s', x: 44.5, y: 21.6, radius: 3.5, intensity: 0.42, circuit: 'emergency' },  // by the supply cupboard
      // the receiver runs on its own supply: its dials light the desk (in the dark, a pool of dim glow)
      { id: 'radio_glow', x: 17.5, y: 9.45, radius: 2.6, intensity: 0.3, circuit: 'radio', fixture: false },
      // outdoor
      { id: 'lot_lamp', x: 35.6, y: 26.6, radius: 7, intensity: 0.85, circuit: 'outdoor' },
      { id: 'lot_lamp_w', x: 26.6, y: 27.6, radius: 6, intensity: 0.72, circuit: 'outdoor' },       // over your car
      { id: 'woods_lamp', x: 36.6, y: 63.1, radius: 5, intensity: 0.7, circuit: 'outdoor', flicker: 0.22 }, // the lamp in the woods
      { id: 'entrance', x: 32.5, y: 24.4, radius: 4.5, intensity: 0.75, circuit: 'outdoor' },
      { id: 'compound', x: 39.5, y: 7.2, radius: 3.5, intensity: 0.4, circuit: 'outdoor', flicker: 0.1 },
    ],
    // abandoned-variant overrides (CAM4 and the Open ending): the relay code sprayed on the
    // radio room's west wall between the windows, plus decay elsewhere
    alt: [
      { x: 14, y: 11, side: 'e', tex: 'wall_paint+dec_graffiti_code' },
      { x: 14, y: 9, side: 'e', tex: 'wall_paint+dec_water_stain' },
      { x: 21, y: 11, side: 'w', tex: 'wall_paint+dec_crack' },
      { x: 17, y: 14, side: 'n', tex: 'wall_paint+dec_water_stain' },
      { x: 16, y: 14, side: 's', tex: 'wall_paint+dec_water_stain' },
      { x: 29, y: 16, side: 'n', tex: 'wall_paint+dec_crack' },
      { x: 29, y: 20, side: 'e', tex: 'wall_paint+dec_water_stain' },
      { x: 46, y: 9, side: 'w', tex: 'wall_panel+dec_graffiti_code' },
      { x: 30, y: 10, side: 'e', tex: 'wall_kitchen+dec_water_stain' },
    ],
    mutations: {
      // flag photo_four (the director sets it): the kitchen wall photo shows the fourth person too,
      // matching DA.devices.photo's close-up. DA.world applies/reverts this with the flag.
      photo_four: {
        faces: [{ x: 30, y: 11, side: 'e', tex: 'wall_kitchen+dec_photo_four' }],
      },
      // the corridor is longer: the reserved block east of the hall's end wall opens up
      hall_long: {
        set: [{ x: 40, y: 15, ch: 'e' }, { x: 41, y: 15, ch: 'e' }, { x: 42, y: 15, ch: 'e' }, { x: 43, y: 15, ch: 'e' }, { x: 44, y: 15, ch: 'e' }, { x: 45, y: 15, ch: 'e' }],
        faces: [{ x: 46, y: 15, side: 'w', tex: 'wall_paint+dec_notice' }],
        lights: [
          { id: 'hall_6', x: 42.5, y: 15.5, radius: 4, intensity: 0.75, circuit: 'corridor', flicker: 0.05 },
          // the extension has its own red lamp: it happens in the dark (ACT 3), and must be seen
          { id: 'em_hall_6', x: 43.5, y: 15.5, radius: 5, intensity: 0.62, circuit: 'emergency', flicker: 0.08 },
        ],
      },
      // the office doorway (entered from the hall) opens into the supply room
      office_door_elsewhere: {
        portals: [{ x0: 28.0, y0: 14.0, x1: 29.0, y1: 14.46, to: 'pt_office_elsewhere', dir: 270, open: 'storage_door' }],
      },
      // a narrow bending hallway that was never there: hall wall → up, over, down → radio room
      new_hallway: {
        set: [
          { x: 24, y: 14, ch: 'D' }, { x: 24, y: 13, ch: 'n' }, { x: 24, y: 12, ch: 'n' }, { x: 24, y: 11, ch: 'n' }, { x: 24, y: 10, ch: 'n' },
          { x: 24, y: 9, ch: 'n' }, { x: 23, y: 9, ch: 'n' }, { x: 22, y: 9, ch: 'n' }, { x: 22, y: 10, ch: 'n' }, { x: 22, y: 11, ch: 'n' },
          { x: 22, y: 12, ch: 'n' }, { x: 21, y: 12, ch: 'D' },
        ],
        doors: [
          { id: 'newhall_door', x: 24, y: 14, axis: 'h', tex: 'door_wood', inside: 'n' },
          { id: 'newhall_exit', x: 21, y: 12, axis: 'v', tex: 'door_wood', inside: 'e' },
        ],
        faces: [
          { x: 23, y: 11, side: 'e', tex: 'wall_paint+dec_water_stain' },
          { x: 25, y: 10, side: 'w', tex: 'wall_paint+dec_crack' },
          { x: 23, y: 12, side: 'w', tex: 'wall_paint+dec_water_stain' },
          { x: 22, y: 8, side: 's', tex: 'wall_paint+dec_crack' },
        ],
        lights: [
          { id: 'newhall_l1', x: 24.5, y: 11.0, radius: 3, intensity: 0.42, circuit: 'main', flicker: 0.7 },
          { id: 'newhall_l2', x: 22.5, y: 10.0, radius: 3, intensity: 0.3, circuit: 'main', flicker: 0.5 },
          // "dim flickering light" (PLAN) while the generator is off: red lamps that should not be here
          { id: 'em_newhall_1', x: 24.5, y: 12.4, radius: 4, intensity: 0.55, circuit: 'emergency', flicker: 0.6 },
          { id: 'em_newhall_2', x: 22.5, y: 9.6, radius: 3.5, intensity: 0.45, circuit: 'emergency', flicker: 0.55 },
        ],
      },
      // Open-the-channel ending: 2049, daylight, dust and a rusted car (world.js adds variant +
      // daylight + the car texture; these are the extra things lying about)
      abandoned: {
        // fifty years of weather: the hall and the supply room are open to the sky in places
        set: [{ x: 22, y: 15, ch: 'Z' }, { x: 23, y: 15, ch: 'Z' }, { x: 33, y: 15, ch: 'Z' }, { x: 42, y: 19, ch: 'Y' }, { x: 43, y: 19, ch: 'Y' }],
        props: [
          { id: 'newspaper', x: 19.2, y: 12.7, tex: 'spr_newspaper' },
          { x: 18.0, y: 12.4, tex: 'spr_debris' }, { x: 15.6, y: 12.9, tex: 'spr_debris' }, { x: 20.4, y: 10.2, tex: 'spr_bucket' },
          { x: 23.2, y: 15.4, tex: 'spr_debris' }, { x: 29.8, y: 15.6, tex: 'spr_debris' }, { x: 34.4, y: 22.4, tex: 'spr_boxes', solid: true, radius: 0.3 },
          { x: 31.2, y: 21.5, tex: 'spr_debris' }, { x: 33.6, y: 20.2, tex: 'spr_debris' }, { x: 34.4, y: 10.2, tex: 'spr_debris' },
          { x: 26.4, y: 9.45, tex: 'spr_boxes', solid: true, radius: 0.3 }, { x: 22.9, y: 18.4, tex: 'spr_debris' }, { x: 41.8, y: 10.4, tex: 'spr_debris' },
        ],
        interact: [{ id: 'newspaper', kind: 'doc', x: 19.2, y: 12.7, radius: 0.45, doc: 'doc_newspaper_2049', prompt: 'Newspaper' }],
      },
    },
  };

  /* ================================================================= BASEMENT */
  /* Under the stairwell: a landing, one long pipe corridor, the generator room (NW), the
   * vent/boiler room, and the antenna control room behind the blast door (S). */
  const basement = {
    id: 'basement',
    name: 'Basement',
    grid: [
      '##############################', // 0
      '##############################', // 1
      '##ggggggggFF##vvOOv###ss######', // 2
      '##ggggggggFF##vvOOv###ss######', // 3
      '##gggGGGgggg##vvOOv###ss######', // 4
      '##gggGGGgggg##vvvvv###ss######', // 5
      '##gggggggggg##vvvvv###.#######', // 6
      '##gggggggggg##vvvvv###.#######', // 7
      '##gggggggggg####v#####.#######', // 8
      '######gg########.#####.#######', // 9
      '###........................###', // 10
      '##############.###############', // 11
      '##############.###############', // 12
      '##############.###############', // 13
      '##############D###############', // 14
      '#########ccccccccccc##########', // 15
      '#########ccccccccccc##########', // 16
      '#########ccccccccccc##########', // 17
      '#########ccccchccccc##########', // 18
      '#########ccccccccccc##########', // 19
      '#########cKKcccccKKc##########', // 20
      '#########ccccccccccc##########', // 21
      '##############################', // 22
      '##############################', // 23
    ],
    legend: {
      '#': { wall: 'wall_brick', inner: true, solid: true },
      G: { wall: 'generator', solid: true },
      F: { wall: 'fuel_tank', solid: true },
      O: { wall: 'pipes', solid: true },
      K: { wall: 'antenna_console', solid: true },
      D: { door: true },
      s: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'b_stairs', walls: 'wall_brick' },
      '.': { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'b_hall', walls: 'pipes' },
      g: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'generator', walls: 'wall_brick' },
      v: { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'vent', walls: 'wall_brick' },
      c: { floor: 'floor_tile', ceil: 'ceil_concrete', room: 'control', walls: 'wall_panel' },
      h: { floor: 'hatch', ceil: 'ceil_concrete', room: 'control', walls: 'wall_panel' },
    },
    ambience: { rain: 0.08, wind: 0, thunder: 0.1, room: 'basement' },
    // the antenna consoles run on the array feed, not the station generator
    emissiveCircuits: { antenna_console: 'array' },
    roomAmbience: { control: { room: 'small', drone: 0.25 } },
    faces: [
      { x: 22, y: 1, side: 's', tex: 'stairs_down' },
      { x: 23, y: 1, side: 's', tex: 'wall_brick+dec_sign_exit' },
      { x: 14, y: 1, side: 's', tex: 'wall_brick+dec_duct' }, // Calm's grille: low, bottom-left screw stripped
      { x: 1, y: 6, side: 'e', tex: 'wall_brick+dec_vent' },
      { x: 1, y: 3, side: 'e', tex: 'breaker_panel' },
      { x: 12, y: 6, side: 'w', tex: 'wall_brick+dec_notice' },
      { x: 13, y: 4, side: 'e', tex: 'pipes' },
      { x: 13, y: 5, side: 'e', tex: 'pipes' },
      { x: 19, y: 6, side: 'w', tex: 'pipes' },
      { x: 13, y: 14, side: 's', tex: 'wall_panel+dec_stencil_relay' },
      { x: 15, y: 13, side: 'w', tex: 'wall_brick+dec_keypad' },
      { x: 10, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 11, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 12, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 13, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 14, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 15, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 16, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 17, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 18, y: 22, side: 'n', tex: 'antenna_console' },
      { x: 8, y: 16, side: 'e', tex: 'cables' },
      { x: 8, y: 17, side: 'e', tex: 'cables' },
      { x: 8, y: 18, side: 'e', tex: 'cables' },
      { x: 20, y: 16, side: 'w', tex: 'terminal_tape' },
      { x: 20, y: 18, side: 'w', tex: 'cables' },
      { x: 20, y: 19, side: 'w', tex: 'cables' },
    ],
    doors: [
      { id: 'control_door', x: 14, y: 14, axis: 'h', tex: 'door_blast', locked: true, key: 'key_antenna', heavy: true, inside: 's' },
    ],
    props: [
      { x: 3.0, y: 2.6, tex: 'spr_barrel', solid: true, radius: 0.22 },
      { x: 3.6, y: 2.5, tex: 'spr_barrel', solid: true, radius: 0.22 },
      { x: 25.6, y: 10.5, tex: 'spr_bucket' },
      { x: 9.6, y: 15.5, tex: 'spr_cable_coil' },
      { x: 19.3, y: 21.4, tex: 'spr_boxes', solid: true, radius: 0.3 },
      { x: 14.6, y: 6.8, tex: 'spr_boxes', solid: true, radius: 0.3 },
    ],
    interact: [
      { id: 'stairs_up', kind: 'stairs', x: 22, y: 1, side: 's', to: 'station', point: 'pt_stairs_return', prompt: 'Go upstairs' },
      { id: 'generator', kind: 'generator', x: 6, y: 5, side: 's', prompt: 'Backup generator',
        cells: [[5, 5], [7, 5], [5, 4, 'n'], [6, 4, 'n'], [7, 4, 'n'], [5, 4, 'w'], [5, 5, 'w'], [7, 4, 'e'], [7, 5, 'e']] },
      { id: 'fuel_tank', kind: 'look', x: 10, y: 3, side: 's', cells: [[11, 3], [10, 2, 'w'], [10, 3, 'w']], prompt: 'Fuel tank' },
      { id: 'vent_basement', kind: 'vent', x: 14, y: 1, side: 's', note: 'note_10', item: 'key_antenna', prompt: 'Ventilation duct' },
      { id: 'vent_b1', kind: 'vent', x: 1, y: 6, side: 'e', note: 'note_7', prompt: 'Vent grille' },
      { id: 'hide_boiler', kind: 'hide', x: 17, y: 3, side: 'e', cells: [[17, 2], [17, 4]], prompt: 'Hide behind the boiler', pos: { x: 18.5, y: 2.3, angle: 90 } },
      { id: 'control_console', kind: 'console', x: 14, y: 22, side: 'n', cells: [[13, 22], [15, 22]], prompt: 'Antenna control' },
      { id: 'array_hatch', kind: 'ladder', x: 14.5, y: 18.5, radius: 0.5, to: 'array', point: 'pt_array_arrive', prompt: 'Climb down the hatch' },
    ],
    points: {
      pt_b_arrive: { x: 22.5, y: 2.45, angle: 90 },
      pt_gen: { x: 6.5, y: 6.6, angle: 270 },
      pt_vent: { x: 14.5, y: 2.8, angle: 270 },
      pt_control: { x: 14.5, y: 15.6, angle: 90 },
      pt_control_return: { x: 14.5, y: 17.35, angle: 270 },
      pt_entity_b: { x: 4.5, y: 10.5, angle: 0 },
      cam_3: { x: 11.55, y: 8.55, angle: 215 },
    },
    triggers: [
      { id: 'b_corridor', x0: 3, y0: 10, x1: 26, y1: 10 },
      { id: 'b_control_door', x0: 14, y0: 12, x1: 14, y1: 13 },
    ],
    lights: [
      { id: 'b_stairs_l', x: 22.9, y: 3.5, radius: 3.5, intensity: 0.6, circuit: 'main' },
      { id: 'gen_l1', x: 4.5, y: 3.0, radius: 5, intensity: 0.7, circuit: 'main' },
      { id: 'gen_l2', x: 9.0, y: 6.5, radius: 5, intensity: 0.7, circuit: 'main' },
      { id: 'vent_l', x: 14.9, y: 4.6, radius: 4.5, intensity: 0.6, circuit: 'main', flicker: 0.1 },   // lights the duct alcove (vent_basement)
      { id: 'b_corr_1', x: 5.5, y: 10.5, radius: 4, intensity: 0.55, circuit: 'main' },
      { id: 'b_corr_2', x: 11.5, y: 10.5, radius: 4, intensity: 0.55, circuit: 'main' },
      { id: 'b_corr_3', x: 18.5, y: 10.5, radius: 4, intensity: 0.55, circuit: 'main' },
      { id: 'b_corr_4', x: 24.5, y: 10.5, radius: 4, intensity: 0.5, circuit: 'main', flicker: 0.12 },
      { id: 'b_corr_5', x: 22.5, y: 7.5, radius: 3, intensity: 0.5, circuit: 'main' },
      { id: 'b_corr_s', x: 14.5, y: 12.0, radius: 3, intensity: 0.5, circuit: 'main' },
      { id: 'ctl_l1', x: 12.0, y: 17.0, radius: 5, intensity: 0.6, circuit: 'main' },
      { id: 'ctl_l2', x: 17.0, y: 18.5, radius: 5, intensity: 0.55, circuit: 'main' },
      { id: 'em_b1', x: 8.5, y: 10.5, radius: 6, intensity: 0.6, circuit: 'emergency' },
      { id: 'em_b2', x: 20.5, y: 10.5, radius: 6, intensity: 0.6, circuit: 'emergency' },
      { id: 'em_gen', x: 2.6, y: 8.4, radius: 6, intensity: 0.55, circuit: 'emergency' },
      { id: 'em_gen2', x: 9.4, y: 6.4, radius: 6, intensity: 0.62, circuit: 'emergency' },   // lights the generator's face
      { id: 'em_vent', x: 18.4, y: 7.4, radius: 5, intensity: 0.5, circuit: 'emergency' },
      { id: 'em_boiler', x: 15.6, y: 2.6, radius: 3.5, intensity: 0.34, circuit: 'emergency', flicker: 0.05 },
      { id: 'em_bst', x: 22.5, y: 5.4, radius: 4.5, intensity: 0.62, circuit: 'emergency' },
      { id: 'em_ctl', x: 14.5, y: 15.4, radius: 6, intensity: 0.55, circuit: 'emergency' },
    ],
    alt: [],
    mutations: {},
  };

  /* ==================================================================== ARRAY */
  /* The underground antenna chamber: far larger than the building. Catwalks over a void,
   * cable walls into darkness, the antenna hanging DOWN into a shaft at the centre, three
   * limiter stations at the ends of the long arms. */
  const array = {
    id: 'array',
    name: 'The Array',
    grid: [
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 0
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 1
      'CCRRRR              RRRRRRRR          ooooo                   CC', // 2
      'CCRRRR              RRRRRRRR          ooooo                   CC', // 3
      'CC                                    ooooo                   CC', // 4
      'CC                                    ooooo                   CC', // 5
      'CC                                    ooooo                   CC', // 6
      'CC                                      =                     CC', // 7
      'CC                                      =                     CC', // 8
      'CC                                      =                     CC', // 9
      'CC                                      =                  RRRCC', // 10
      'CC                                      =                  RRRCC', // 11
      'CC                      =           C   =             C    RRRCC', // 12
      'CC                      =               =                  RRRCC', // 13
      'CC                      =               =                  RRRCC', // 14
      'CC                      =               =                     CC', // 15
      'CC        CC            =               =                     CC', // 16
      'CC        CC            =               =                     CC', // 17
      'CC                      =       =========                     CC', // 18
      'CC                      =       =                             CC', // 19
      'CCRR                    =       =           CC                CC', // 20
      'CCRR                    =       =           CC                CC', // 21
      'CCRR                    =========                             CC', // 22
      'CCRR                            =                             CC', // 23
      'CCRR                            =                             CC', // 24
      'CCRR                            =                        oooooCC', // 25
      'CCRR                  CC        =                        oooooCC', // 26
      'CC                    CC   ooooooooooo         ==========oooooCC', // 27
      'CC      C                  ooooooooooo         =         oooooCC', // 28
      'CC                         ooooooooooo         =         oooooCC', // 29
      'CC         =               ooo     ooo         =              CC', // 30
      'CC         =               ooo     ooo         =              CC', // 31
      'CC         =      =========ooo     ooo==========              CC', // 32
      'CC         =      =        ooo     ooo         =              CC', // 33
      'CC         =      =        ooo     ooo         =    C         CC', // 34
      'CC         ========        ooooooooooo         =              CC', // 35
      'CC                =        ooooooooooo         =              CC', // 36
      'CCooooo           =        ooooooooooo         =              CC', // 37
      'CCooooo           =             =              =              CC', // 38
      'CCooooo============             =              =              CC', // 39
      'CCooooo                         =       C      ======     RRRRCC', // 40
      'CCooooo                         =                         RRRRCC', // 41
      'CC                              =                         RRRRCC', // 42
      'CC                              =                         RRRRCC', // 43
      'CC                              =                         RRRRCC', // 44
      'CC                              =                             CC', // 45
      'CC            CC                ===========                   CC', // 46
      'CC            CC                =         =                   CC', // 47
      'CC                              =         =                   CC', // 48
      'CC                              =         =                   CC', // 49
      'CCRRR                     C     =         =     C             CC', // 50
      'CCRRR                           =                             CC', // 51
      'CCRRR                           =                             CC', // 52
      'CCRRR                           =                             CC', // 53
      'CCRRR                           =                             CC', // 54
      'CCRRR                           =                             CC', // 55
      'CCRRR               C           =                             CC', // 56
      'CC                              =                             CC', // 57
      'CC                            ooooo         RRRRRRR           CC', // 58
      'CC                            ooooo         RRRRRRR           CC', // 59
      'CC                            ooooo         RRRRRRR           CC', // 60
      'CC                            ooooo         RRRRRRR           CC', // 61
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 62
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 63
    ],
    // a cavern: cable walls three storeys high, no ceiling in sight (dark void above, not sky)
    wallHeight: 3,
    sky: false,
    // you can look down past the catwalk into the shaft (the antenna hangs into it)
    pitchMax: 0.7,
    // a faint dark haze instead of pure black: things standing on the catwalks (the entity's body)
    // separate from the void as silhouettes at 8–12 cells
    fog: { color: [9, 10, 13], density: 0.03, att: 0.009 },
    legend: {
      C: { wall: 'cables', solid: true },
      R: { wall: 'wall_rock', solid: true },
      ' ': { pit: true, solid: true, floor: null, ceil: null, outdoor: false, room: 'array' },
      '=': { floor: 'floor_grate', ceil: null, outdoor: false, room: 'array' },
      o: { floor: 'floor_grate', ceil: null, outdoor: false, room: 'array' },
    },
    ambience: { rain: 0, wind: 0.15, thunder: 0, drone: 0.6, room: 'array' },
    faces: [
      { x: 1, y: 39, side: 'e', tex: 'antenna_console' },
      { x: 40, y: 1, side: 's', tex: 'antenna_console' },
      { x: 62, y: 27, side: 'w', tex: 'antenna_console' },
      { x: 32, y: 62, side: 'n', tex: 'ladder_wall' },
      { x: 31, y: 62, side: 'n', tex: 'wall_rock' },
      { x: 33, y: 62, side: 'n', tex: 'wall_rock' },
    ],
    doors: [],
    props: [
      // hung from cables in the dark overhead: the dish opens high above the catwalks, the elements
      // shorten downward past the ring into the shaft and the glowing tip hangs just below the ring
      // (look down over the edge). From every approach you see the dish over a tapering arrow.
      { id: 'downward_antenna', x: 32.5, y: 32.5, tex: 'spr_downward_antenna', scale: 7, z: -2.6 },
      // two work lamps hung on the shaft's rim, aimed at the antenna (light a_ant)
      { id: 'antenna_lamp_s', x: 31.4, y: 34.9, tex: 'spr_light_fixture', scale: 1, z: 1.05 },
      { id: 'antenna_lamp_n', x: 33.6, y: 30.1, tex: 'spr_light_fixture', flip: true, scale: 1, z: 1.05 },
      { id: 'lectern', x: 30.6, y: 35.6, tex: 'spr_lectern', solid: true, radius: 0.22 },
      { id: 'limiter_1', x: 2.7, y: 39.5, tex: 'spr_lever', solid: true, radius: 0.18 },
      { id: 'limiter_2', x: 40.5, y: 2.7, tex: 'spr_lever', solid: true, radius: 0.18 },
      { id: 'limiter_3', x: 61.3, y: 27.5, tex: 'spr_lever', solid: true, radius: 0.18 },
      // hanging work lamps over the catwalks + clutter
      { x: 32.5, y: 44.5, tex: 'spr_light_fixture' }, { x: 32.5, y: 52.5, tex: 'spr_light_fixture' },
      { x: 32.5, y: 59.5, tex: 'spr_light_fixture' }, { x: 22.5, y: 32.5, tex: 'spr_light_fixture' },
      { x: 18.5, y: 38.5, tex: 'spr_light_fixture' }, { x: 10.5, y: 39.5, tex: 'spr_light_fixture' },
      { x: 32.5, y: 22.5, tex: 'spr_light_fixture' }, { x: 40.5, y: 12.5, tex: 'spr_light_fixture' },
      { x: 42.5, y: 32.5, tex: 'spr_light_fixture' }, { x: 52.5, y: 27.5, tex: 'spr_light_fixture' },
      { x: 30.8, y: 60.8, tex: 'spr_cable_coil' }, { x: 28.2, y: 36.4, tex: 'spr_cable_coil' },
      { x: 36.6, y: 28.0, tex: 'spr_barrel', solid: true, radius: 0.22 }, { x: 4.8, y: 37.6, tex: 'spr_cable_coil' },
      { x: 58.0, y: 25.6, tex: 'spr_barrel', solid: true, radius: 0.22 }, { x: 41.6, y: 5.5, tex: 'spr_cable_coil' },
    ],
    interact: [
      { id: 'array_ladder', kind: 'ladder', x: 32, y: 62, side: 'n', to: 'basement', point: 'pt_control_return', prompt: 'Climb back up' },
      { id: 'report', kind: 'doc', x: 30.6, y: 35.6, radius: 0.4, doc: 'doc_report', prompt: 'Research report' },
      { id: 'limiter_1', kind: 'lever', x: 2.7, y: 39.5, radius: 0.35, prompt: 'Limiter one' },
      { id: 'limiter_2', kind: 'lever', x: 40.5, y: 2.7, radius: 0.35, prompt: 'Limiter two' },
      { id: 'limiter_3', kind: 'lever', x: 61.3, y: 27.5, radius: 0.35, prompt: 'Limiter three' },
      { id: 'antenna_look', kind: 'look', x: 32.5, y: 32.5, radius: 2.2, prompt: 'The antenna' },
    ],
    points: {
      pt_array_arrive: { x: 32.5, y: 60.4, angle: 270 },
      pt_array_center: { x: 32.5, y: 36.5, angle: 270 },
      pt_limiter_1: { x: 4.3, y: 39.5, angle: 180 },
      pt_limiter_2: { x: 40.5, y: 4.3, angle: 270 },
      pt_limiter_3: { x: 59.7, y: 27.5, angle: 0 },
      pt_entity_array: { x: 32.5, y: 47.5, angle: 90 },
    },
    triggers: [
      { id: 'array_center', x0: 27, y0: 27, x1: 37, y1: 37 },
      { id: 'array_spine', x0: 32, y0: 38, x1: 32, y1: 57 },
    ],
    lights: [
      { id: 'a_land', x: 32.5, y: 59.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_sp1', x: 32.5, y: 52.5, radius: 5, intensity: 0.55, circuit: 'array' },
      { id: 'a_sp2', x: 32.5, y: 44.5, radius: 5, intensity: 0.55, circuit: 'array', flicker: 0.2 },
      { id: 'a_ctr', x: 32.5, y: 36.2, radius: 7, intensity: 0.7, circuit: 'array' },
      { id: 'a_shaft', x: 32.5, y: 32.5, radius: 4.5, intensity: 0.6, circuit: 'array', flicker: 0.12 },
      // the work lamps on the shaft's rim (antenna_lamp_s / _n): a steady pool on the antenna itself
      { id: 'a_ant', x: 32.5, y: 32.5, radius: 3.4, intensity: 0.5, circuit: 'array', fixture: false },
      { id: 'a_ctr2', x: 28.0, y: 28.0, radius: 4.5, intensity: 0.45, circuit: 'array' },
      { id: 'a_w1', x: 22.5, y: 32.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_w2', x: 18.5, y: 38.5, radius: 5, intensity: 0.5, circuit: 'array', flicker: 0.15 },
      { id: 'a_w3', x: 10.5, y: 39.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_l1', x: 4.0, y: 39.5, radius: 5, intensity: 0.62, circuit: 'array' },
      { id: 'a_n1', x: 32.5, y: 22.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_n2', x: 36.5, y: 18.5, radius: 4.5, intensity: 0.45, circuit: 'array', flicker: 0.25 },
      { id: 'a_n3', x: 40.5, y: 12.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_l2', x: 40.5, y: 4.0, radius: 5, intensity: 0.62, circuit: 'array' },
      { id: 'a_e1', x: 42.5, y: 32.5, radius: 5.5, intensity: 0.62, circuit: 'array' },
      { id: 'a_e2', x: 47.5, y: 29.5, radius: 4.5, intensity: 0.45, circuit: 'array' },
      { id: 'a_e3', x: 52.5, y: 27.5, radius: 5, intensity: 0.5, circuit: 'array', flicker: 0.2 },
      { id: 'a_l3', x: 59.0, y: 27.5, radius: 5, intensity: 0.62, circuit: 'array' },
    ],
    alt: [],
    mutations: {},
  };

  /* ==================================================================== RELAY */
  /* Behind the steel door that is not on the drawings: a room that cannot fit there. Walls of
   * tape reels, stacked receivers, the relay console at the centre. */
  const relay = {
    id: 'relay',
    name: 'Relay Chamber',
    wallHeight: 1.6, // taller than the building it cannot fit inside
    grid: [
      '################', // 0
      '#..............#', // 1
      '#.Q.Q......q.q.#', // 2
      '#.Q.Q......q.q.#', // 3
      '#.Q.Q......q.q.#', // 4
      '#.Q.Q......q.q.#', // 5
      '#..............#', // 6
      '#......KK......#', // 7
      '#......KK......#', // 8
      '#.q.q......Q.Q.#', // 9
      '#.q.q......Q.Q.#', // 10
      '#.q.q......Q.Q.#', // 11
      '#.q.q......Q.Q.#', // 12
      '#..............#', // 13
      '#..............#', // 14
      '################', // 15
    ],
    legend: {
      '#': { wall: 'reels', solid: true },
      Q: { wall: 'radio_console', solid: true },
      q: { wall: 'reels', solid: true },
      // the relay console: its own texture when DA.textures has one, else a wall of reels ('a||b' = first that exists)
      K: { wall: 'relay_console||reels', solid: true },
      '.': { floor: 'floor_concrete', ceil: 'ceil_concrete', room: 'relay', walls: 'reels' },
    },
    ambience: { rain: 0, wind: 0, thunder: 0, drone: 0.85, room: 'hall' },
    faces: [
      { x: 7, y: 15, side: 'n', tex: 'door_steel+dec_stencil_relay' },
      { x: 6, y: 15, side: 'n', tex: 'reels' },
      { x: 0, y: 7, side: 'e', tex: 'terminal_tape' },
      { x: 15, y: 8, side: 'w', tex: 'terminal_tape' },
    ],
    doors: [],
    props: [
      { x: 6.2, y: 13.6, tex: 'spr_tape' }, { x: 9.3, y: 12.1, tex: 'spr_tape' }, { x: 3.4, y: 7.6, tex: 'spr_tape' },
      { x: 12.5, y: 6.4, tex: 'spr_tape' }, { x: 10.2, y: 1.6, tex: 'spr_cable_coil' }, { x: 1.6, y: 13.4, tex: 'spr_cable_coil' },
      { x: 7.5, y: 4.5, tex: 'spr_light_fixture' }, { x: 7.5, y: 11.5, tex: 'spr_light_fixture' },
    ],
    interact: [
      { id: 'relay_console', kind: 'console', x: 7, y: 8, side: 's', prompt: 'Relay console',
        cells: [[8, 8], [7, 7, 'n'], [8, 7, 'n'], [7, 7, 'w'], [7, 8, 'w'], [8, 7, 'e'], [8, 8, 'e']] },
      { id: 'relay_exit', kind: 'stairs', x: 7, y: 15, side: 'n', to: 'station', point: 'pt_relay_return', prompt: 'Steel door' },
    ],
    points: {
      pt_relay_arrive: { x: 7.5, y: 14.35, angle: 270 },
    },
    triggers: [{ id: 'relay_center', x0: 5, y0: 6, x1: 10, y1: 9 }],
    lights: [
      { id: 'relay_l1', x: 7.5, y: 4.5, radius: 6, intensity: 0.5, circuit: 'relay', flicker: 0.25 },
      { id: 'relay_l2', x: 7.5, y: 11.5, radius: 6, intensity: 0.45, circuit: 'relay', flicker: 0.15 },
    ],
    alt: [],
    mutations: {},
  };

  /* ===================================================================== ROOF */
  const roof = {
    id: 'roof',
    name: 'Roof',
    grid: [
      '##############', // 0
      '#............#', // 1
      '#.BBB........#', // 2
      '#.BBB........#', // 3
      '#............#', // 4
      '#............#', // 5
      '#............#', // 6
      '#.......BB...#', // 7
      '#....h..BB...#', // 8
      '#............#', // 9
      '#............#', // 10
      '##############', // 11
    ],
    legend: {
      '#': { wall: 'parapet', solid: true },
      B: { wall: 'concrete_ext', solid: true },
      '.': { floor: 'roof_tar', ceil: null, room: 'roof' },
      h: { floor: 'hatch', ceil: null, room: 'roof' },
    },
    ambience: { rain: 1, wind: 1, thunder: 0.6, room: 'outside' },
    faces: [
      { x: 2, y: 3, side: 's', tex: 'concrete_ext+dec_vent' },
      { x: 4, y: 2, side: 'e', tex: 'concrete_ext+dec_stencil_relay' },
      { x: 8, y: 8, side: 's', tex: 'concrete_ext+dec_vent' },
    ],
    doors: [],
    props: [
      { id: 'roof_mast', x: 10.5, y: 3.5, tex: 'spr_mast', solid: true, radius: 0.2 },
      { id: 'tower', x: 11.6, y: 9.5, tex: 'spr_tower', solid: true, radius: 0.45 },
      { x: 2.6, y: 9.4, tex: 'spr_bucket' },
      { x: 6.8, y: 1.6, tex: 'spr_cable_coil' },
    ],
    interact: [
      { id: 'roof_hatch', kind: 'ladder', x: 5.5, y: 8.5, radius: 0.5, to: 'station', point: 'pt_roof_return', prompt: 'Climb down' },
      { id: 'weather_mast', kind: 'weather', x: 10.5, y: 3.5, radius: 0.45, source: 'mast', prompt: 'Weather instruments' },
    ],
    points: {
      pt_roof_arrive: { x: 5.5, y: 7.35, angle: 320 },   // up the ladder facing the weather mast (obj_weather)
    },
    triggers: [{ id: 'roof_edge', x0: 11, y0: 1, x1: 12, y1: 10 }],
    lights: [
      { id: 'roof_lamp', x: 5.5, y: 9.3, radius: 3.5, intensity: 0.55, circuit: 'outdoor' },
      { id: 'mast_lamp', x: 10.2, y: 4.1, radius: 2.8, intensity: 0.42, circuit: 'outdoor' },
      { id: 'tower_beacon', x: 11.6, y: 9.5, radius: 2.5, intensity: 0.3, circuit: 'outdoor', flicker: 0.4 },
    ],
    alt: [],
    mutations: {},
  };

  /* ================================================================== EXPORT */
  DA.maps = {
    defs: { station, basement, array, relay, roof },
    /** Map ids in a stable order. */
    ids() { return Object.keys(this.defs); },
    /** Which map defines a point → {map, x, y, angle(deg)} | null. */
    findPoint(name) {
      for (const id in this.defs) {
        const d = this.defs[id];
        if (d.points && d.points[name]) return Object.assign({ map: id }, d.points[name]);
        if (d.mutations) for (const m in d.mutations) {
          const mp = d.mutations[m].points;
          if (mp && mp[name]) return Object.assign({ map: id }, mp[name]);
        }
      }
      return null;
    },
    /**
     * Where you are, as a phrase that reads after "in the …" / "the …" in speech (lowercase, no
     * article): the death transmission's "I'm in the {DEATH_ROOM}" (roomNames are titles: 'The
     * array', 'County Route 9'). roomPhrase(room) → phrase (falls back to the lowercased title
     * without a leading article).
     */
    roomPhrases: {
      lot: 'parking lot', road: 'road', forest: 'woods', woods: 'woods', lobby: 'lobby', hall: 'hall', radio: 'radio room',
      office: 'office', kitchen: 'kitchen', equipment: 'equipment room', storage: 'supply room', bathroom: 'bathroom',
      workshop: 'workshop', records: 'records room', stairs: 'stairwell', newhall: 'hallway', hall_ext: 'hall',
      b_stairs: 'basement stairwell', b_hall: 'basement corridor', generator: 'generator room', control: 'antenna control room',
      vent: 'boiler room', roof: 'roof', array: 'array', relay: 'relay chamber',
    },
    roomPhrase(room) {
      if (!room) return '';
      if (this.roomPhrases[room]) return this.roomPhrases[room];
      return String(this.roomNames[room] || room).replace(/^the\s+/i, '').toLowerCase();
    },
    /** Human room names for journals / debug. */
    roomNames: {
      lot: 'Parking lot', road: 'County Route 9', forest: 'Woods', woods: 'Woods path', lobby: 'Lobby', hall: 'Hall',
      radio: 'Radio room', office: 'Office', kitchen: 'Kitchen', equipment: 'Equipment room', storage: 'Supply room',
      bathroom: 'Bathroom', workshop: 'Workshop', records: 'Records room', stairs: 'Stairwell', newhall: 'Hallway',
      hall_ext: 'Hall', b_stairs: 'Basement stairs', b_hall: 'Basement corridor', generator: 'Generator room',
      control: 'Antenna control', vent: 'Boiler room', roof: 'Roof', array: 'The array', relay: 'Relay chamber',
    },
  };
})();
