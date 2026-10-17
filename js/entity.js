/* DEAD AIR — entity.js
 * DA.entity: the thing that lives between possible realities (README "The entity", "How it
 * manifests", "The creature finally becoming physical"; PLAN.md §6.9).
 *
 * It is never drawn as one creature in one place. Its true position moves continuously, but what
 * you see is 2–4 *possible* positions at once — sampled from where it just was, where its path is
 * about to take it, a hand laid on the nearest wall, a step to one side — each with its own pose
 * (spr_entity frames 0–3) and its own flickering dithered alpha, re-sampled 8–12 times a second.
 * "One frame its arm is down. Next frame its hand is on the wall. Next frame it's three metres
 * closer." Up close a face sometimes surfaces (spr_entity_face). Around it the lights stutter,
 * the drone rises, footsteps land at the wrong rhythm and — within three units — it breathes
 * exactly when you do.
 *
 * ---------------------------------------------------------------- API (PLAN §6.9 + task brief)
 *   spawn(pointNameOr{x,y,map}, mode='idle', opts)   place it (resets the once-per-spawn catch);
 *                                   mode 'idle'|'stalk'|'hunt'|'search' starts that behaviour.
 *                                   Returns true, or false for an unknown point. opts.danger:
 *                                   set danger() (see below) for this manifestation.
 *   despawn(opts)                   remove it; restores drone/heartbeat; stops any behaviour (its
 *                                   promise resolves at once with its stopped result — see stop());
 *                                   clears danger(). opts.all: also cancel pending glimpses
 *                                   (resolve {seen:false, cancelled:true}) and take the window
 *                                   figure away at once (for endings: nothing of it lingers).
 *   active() → bool                 spawned?
 *   visible() → bool                is any part of it (true position, a ghost, the face) on the
 *                                   player's screen now: same map, no opaque mode covering the
 *                                   world, inside the camera FOV, clear DA.world.lineOfSight.
 *   position() → {map, x, y, angle} | null
 *   moveTo(point|{x,y}, speed=1.1, opts) → Promise<{arrived, blocked?, door?, unreachable?,
 *                                   stopped?}>   A* via DA.world.path, opens closed unlocked doors
 *                                   (DA.world.openDoor → door_open). A LOCKED door stops it: it
 *                                   rattles the handle (door_handle, then door_locked twice,
 *                                   'entity:blocked' {door, map, x, y}) and the promise resolves
 *                                   {arrived:false, blocked:true, door} once the rattle is over.
 *                                   A point on ANOTHER map: it walks to the stairs / ladder /
 *                                   hatch that leads there (routing through maps if needed), is
 *                                   out of sight for a moment ("through" — you hear it on the
 *                                   stairs at the far end), comes out at that way's arrival point
 *                                   and walks on (see ACROSS MAPS). opts.teleport: the old way —
 *                                   it is simply there (also the fallback when no way exists).
 *                                   moveTo speeds are never scaled by power() (scripted timing).
 *                                   LETHAL WALKS (opts.lethal: true, or danger() on — opts.lethal
 *                                   false opts out): contact with the player = caught (within
 *                                   0.55 u + power, not through a wall / shut door, the player not
 *                                   hidden — or hidden where it saw them hide): it never walks
 *                                   through an exposed player, and a walk sent to where you stand
 *                                   does not stop short. It also WATCHES: an unhidden player in its
 *                                   line of sight within opts.watch units (default 6; false = off)
 *                                   ends the walk — opts.onSeen 'rush' (default): it goes for them
 *                                   like a search that found them ('entity:found' {how:'sight'},
 *                                   stinger, rush → caught; {arrived:false, seen:true, rushed:true}
 *                                   if a lock got between you) · 'stop': resolves {arrived:false,
 *                                   seen:true, x, y, dist} at once for the caller to pursue().
 *                                   Caught mid-walk → {arrived:false, caught:true}.
 *   search(roomIdOr{x,y,r?,map?}, secs=8, opts) → Promise<found:boolean>
 *                                   wanders the room's cells (lingering beside hiding places).
 *                                   Finds the player if (a) not hidden, in LOS and ≤ 5 cells;
 *                                   (b) hidden but it SAW them hide (it had LOS to them within 2 s
 *                                   before 'hide:enter'); (c) player noise ≥ 0.6 within 3 cells.
 *                                   A find only counts when it can actually reach them — noise
 *                                   behind a LOCKED door makes it rattle that door instead.
 *                                   On a find: 'entity:found' {how}, a stinger, it rushes and
 *                                   catches ('entity:caught' once). Resolves true after the rush
 *                                   (caught, or the player got a locked door between you), false
 *                                   when the time runs out. DA.entity.caught() tells which.
 *                                   The area may be on another map (a room name only that map
 *                                   has, or {x, y, r, map}): it goes there by the stairs first.
 *                                   opts.follow ('heard' default | 'always' | false): if you
 *                                   leave its floor it follows (ACROSS MAPS) when it saw you in
 *                                   the last 4 s, or the way you took is within ~16 u of it
 *                                   (it heard the stairs), always mid-rush; then it searches
 *                                   where you went (your room, if it can tell) with the time it
 *                                   had left (+2 s). Hearing/sight grow with power().
 *   hunt({speed=2.4, duration=Infinity, giveUpDist, closedBlocks, follow=true, budget='floor'}) → Promise<{caught, escaped,
 *                                   reason: 'caught'|'distance'|'duration'|'map'|'stopped', stopped?}>
 *                                   chases along paths toward the player (sight ≤ 16 u, or their
 *                                   last heard position: noise n is heard within n×12 u), respects
 *                                   locked doors (rattles them and waits), catches within 0.55 u
 *                                   unless the player is hidden and it did not see them hide.
 *                                   No catch (hunt, rush, stalk) ever goes through a wall or a
 *                                   door slab that is still shut (canReach).
 *                                   escaped = the player survived (distance > giveUpDist, left the
 *                                   map, or the duration ran out). Taking the stairs is NOT an
 *                                   escape: it follows you through the same stairs / ladder
 *                                   (ACROSS MAPS) and hunts on. The duration is a budget of time
 *                                   ON YOUR FLOOR: walking to the stairs after you and the stairs
 *                                   themselves do not use it up, so running down a floor does not
 *                                   simply outlast it (budget 'total': the old way, it runs always).
 *                                   reason 'map' only with follow:false or when it cannot reach
 *                                   the way you went (a lock between). Stronger (power()): it
 *                                   hears further (×1+0.8(k−1)), finds your trail again sooner
 *                                   (8/k s), reaches a little further (+0.2(k−1), ≤0.15 u).
 *   stalk(on, {speed=1.2}) → Promise<{caught, stopped}>   the array / final act. While any part
 *                                   of it is visible() it does not move (its ghosts keep
 *                                   flickering). Unobserved, it advances along its path in bursts
 *                                   of 0.5–1.5 u (1–3 m) — it is closer every time you look back —
 *                                   and a far-behind stalker skips forward out of sight. Catches at
 *                                   0.7 u, only ever unobserved: walk up to it while watching and it
 *                                   comes apart and re-forms somewhere behind you. Unobserved it
 *                                   homes in on SOUND: its bursts come ~1.45× as often/far while
 *                                   you run (noise 0.8), ~0.6–0.7× while you stand still or crouch
 *                                   ("C to crouch. Running is loud." is true in the array).
 *   window(on) → Promise            the face at the radio room window: sets the station runtime
 *                                   map's windowFigure {x, y, amount} on the radio_window glass
 *                                   (fallback: any window cell in room 'radio'), fades amount in
 *                                   (~1.6 s) / out (~0.9 s); window_knock ×3 the first time it is
 *                                   shown; from outside a dark figure stands at the glass.
 *                                   Independent of spawn().
 *   predict(sec) → Sprite[]         where it will be in `sec` s along its current path (idle: where
 *                                   it stands), ready for renderView (tex, frame, alpha, ghosts,
 *                                   map, emissive: its glow) — [] when not spawned. Used by
 *                                   CCTV CAM1 (+8 s). On the stairs: [] while it is out of sight,
 *                                   or the far end's arrival point (map = that map) if it will
 *                                   have come out within `sec`.
 *   flicker(pointOr{x,y,map}|'behind'|'ahead', secs=0.4, opts) → Promise<{seen}>
 *                                   a brief glimpse that does not spawn it. opts.whenSeen: wait
 *                                   (invisible to the player, since it is off screen) until it is
 *                                   on screen, then show it for secs ('entity:glimpse' {seen}).
 *                                   'behind' keeps itself behind the player until they start to
 *                                   turn ("Don't turn around."). opts.timeout (default 30 s with
 *                                   whenSeen), opts.stinger (a stinger kind to play when seen).
 *                                   whenSeen triggers only once its MAIN part is well inside the
 *                                   view (within 0.78 of the half FOV, in LOS) — a slow careful
 *                                   turn (30–45°/s) sees it too — and the timeout does not run
 *                                   while you are turning toward it.
 *
 * ---------------------------------------------------------------- ADDITIONS
 *   stop(opts) → bool               end the current behaviour (→ idle) at once: its promise
 *                                   resolves with its stopped result (move {arrived:false,
 *                                   stopped:true} · hunt {caught:false, escaped:false,
 *                                   reason:'stopped', stopped:true} · stalk {caught:false,
 *                                   stopped:true} · search false); its rattle / rush / transit end
 *                                   with it and 'entity:stop' {kind, why} fires (why 'stop' |
 *                                   'despawn' | 'spawn' | 'replaced' — also when spawn() or a new
 *                                   behaviour cuts one short). opts.all: also cancel pending
 *                                   glimpses / the window figure (as despawn({all})). true if a
 *                                   behaviour was running.
 *   danger(on?) → bool              THE LETHAL-CONTEXT SWITCH (the dark, hunts, stalk, chase,
 *                                   keep-channel): while on, every moveTo is lethal (see LETHAL
 *                                   WALKS) unless it passes lethal:false, and even standing idle it
 *                                   catches an unhidden player who walks into it. Hunt / search /
 *                                   rush catch by their own rules; the stalker's (only ever
 *                                   unobserved) is kept. Persisted in DA.state.entity.danger;
 *                                   cleared by despawn() (spawn(…, {danger:true}) sets it). Event
 *                                   'entity:danger' {on} on change.
 *   mode() → 'idle'|'move'|'search'|'hunt'|'stalk'|'caught'   (also DA.state.entity.mode)
 *   caught() → bool                 did it catch the player since this spawn?
 *   distance() → units to the player (Infinity on another map / not spawned)
 *   sees() → bool                   has it got the (unhidden) player in line of sight right now?
 *   teleport(pointOr{x,y,map})      move it silently (no events), keeps its behaviour.
 *   face(x, y)                      turn it (only matters for footstep/ghost bias).
 *   intensity(v?) → number          0..2 manifestation strength multiplier (ghost count/spread,
 *                                   swaps, face). Persisted. Default 1. Instability adds on top;
 *                                   an intensity ≥ 1 is raised to power() (stronger: more ghosts).
 *   power() → k (1..1.8)            HOW STRONG IT IS TONIGHT (decision 8, README "the more people
 *                                   you save, the stronger it becomes"): k = 1 + 0.12·saved +
 *                                   0.03·instability (DA.v), clamped — the same formula the
 *                                   director uses. Pure path: 1. Use it to time the dark earlier
 *                                   (e.g. wait 45/k s; powerInfo().darkLead = suggested seconds
 *                                   early) and to scale speeds / search times you pass in.
 *                                   Inside entity.js power() always drives perception (hearing,
 *                                   search sight +4(k−1) cells, trail reacquire 8/k s, catch reach,
 *                                   rush speed, ghosts). Behaviour ARGUMENTS (hunt/stalk speed,
 *                                   search secs/speed) are taken as given unless opts.power: true
 *                                   (scale here: speed ×(1+0.6(k−1)) capped below a running
 *                                   player, search secs ×k) or a number (that k).
 *   powerInfo() → {k, level, saved, instability, speedK, searchK, hearK, seeAdd, reacquire,
 *                  catchAdd, ghosts, darkLead}
 *                                   'entity:power' {k, level, prev} fires each time k grows a
 *                                   step (level = floor((k−1)/0.15)) — level 1 is the first time
 *                                   it is noticeably stronger (the director's thought).
 *   transit() → null | {from, to, via, id, phase: 'walk'|'through', why, eta}   on its way through
 *                                   a stairs / ladder (see ACROSS MAPS).
 *   links() → [{id, via, from, to, sx, sy, ax, ay, point, back?}]   every way between maps (both
 *                                   directions); route(fromMap, toMap) → the first link to take.
 *   ghosts() → current sampled parts [{x, y, frame, flip, alpha, kind}] (tests/debug)
 *   debugInfo() → compact summary for the debug overlay.
 *   moveTo opts: {closedBlocks: true|[doorIds]} — treat those doors as locked while closed (e.g.
 *     "reach the radio room and shut the door to survive": hunt({closedBlocks:['radio_door']})).
 *   search opts: {speed (default 0.95)}; room may be {x, y, r} (cells within r of the point).
 *   Point keywords accepted wherever a point is: a point name, {x, y, map?}, 'behind', 'ahead'
 *     (1.4 u behind / 3 u ahead of the player, pulled in so it stays in line of sight).
 *   ACROSS MAPS: the ways between maps are the interactables with `to` + `point` (stairs_down/up,
 *     roof_ladder/hatch, array_hatch/ladder, relay_exit — and its reverse through the relay door).
 *     When a hunt (always) or a search ('heard') loses you to another floor it walks to the way
 *     you took (DA.world 'map:change' {from, to, point} + where you stood), goes through — out of
 *     sight 1.3–2.3 s ÷ √power (visible() false, no presence) while footsteps come down the far
 *     end's stairs (or the ladder / hatch sounds) — and comes out at that way's arrival point on
 *     your map (pt_b_arrive, pt_stairs_return, …), then carries on. If you come back before it
 *     reaches the way it simply turns back; if you come back while it is on the stairs it comes
 *     back out at the top. Up to 4 hops per behaviour. A locked door between it and the way →
 *     the hunt ends 'map' / the search stays. Events: 'entity:follow' {phase: 'start' | 'through'
 *     | 'arrive' | 'cancel', from, to, via, id, why, x?, y?}. State: DA.state.entity.transit
 *     (survives save/load).
 *   Rendering: spr_entity carries a baked pale RIM (textures.js entityRim: a dithered halo just
 *     outside the silhouette and a lighter band inside) and a pale face smear, both emissive.
 *     Every entity sprite (main part, ghosts — they inherit it — faces, glimpses, predictions,
 *     CCTV, the window figure) carries the renderer's per-sprite `emissive: CFG.glow` (0.9): the
 *     rim and the faces glow at that level whatever the station power (the map-wide emissive is
 *     0.15 in the dark), attenuated by fog, while the near-black body takes world light and the
 *     flashlight like anything else — dark and soft in a lit hall, black on black in the dark,
 *     outlined by its rim. In the dark (m.sky false, main power off → map.emissive < 0.5, or cell
 *     light < 0.3) a pale face (spr_entity_face: only its pale skin is emissive) now and then
 *     surfaces where a part's head should be: frame 0 many faces, 1 her (once the woman / girl /
 *     child was heard), 2 Hollis, 3 you (more often from ACT 3/4). Only the caught face (the
 *     last thing you see) is fullbright.
 *   Events: entity:spawn {map,x,y,mode} · entity:despawn · entity:caught {map,x,y,room,mode,how}
 *     (how: 'hunt' | 'rush' | 'sight' | 'noise' | 'saw_hide' | 'stalk' | 'contact')
 *     · entity:stop {kind, why} (a behaviour was cut short) · entity:danger {on}
 *     (once per spawn; the entity freezes) · entity:blocked {door,map,x,y} · entity:found {how}
 *     · entity:mode {mode, prev} · entity:arrive {x,y} · entity:window {on} · entity:glimpse
 *     {seen, x, y} · entity:follow {phase, from, to, via, id} · entity:power {k, level, prev}.
 *   Rendering: sprite provider (the main sprite carries `ghosts`; spr_entity_face is a separate
 *     sprite). On CCTV (renderView) after 'cctv_offsets': a feed that supplies its own entity
 *     sprite (CAM1's +8 s prediction) gets no present-time entity; any other live feed (CAM2,
 *     −2 min) shows where it stood two minutes ago.
 *   Presence (only while spawned, and restored on despawn/reset): DA.world.flickerNear around it,
 *     positional footstep_other at an irregular stride (sometimes a doubled step, sometimes a
 *     missing one), a phase-locked breath_other loop within 3 u, ambience drone by distance and a
 *     heartbeat when a hunting/searching/stalking entity is within ~7 u (merged over whatever
 *     world/director set — never lowered), static_burst from the desk speaker and a
 *     DA.audio.radioStatic bump (applied on 'tick', after the radio's own level) when it is near
 *     the radio desk.
 *   State: DA.state.entity = {v, active, map, x, y, angle, mode, speed, spawns, caught, target,
 *     search, hunt, stalk, window {on, amount, x, y, outX, outY, knocked}, sawHide, intensity,
 *     powerLevel, transit, hops, danger}. target carries a walk's lethal / watch / onSeen, hunt its
 *     budget — both resume after a load.
 *     Plain JSON. On 'game:load' the entity is rebuilt where it stood and hunt/stalk/search/move
 *     resume from state (their promises belonged to scripts that died with the old session).
 *     A saved 'caught' becomes idle.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ tuning */
  const CFG = {
    catchHunt: 0.55, catchStalk: 0.7, reachHidden: 1.05,
    seeSearch: 5, seeHunt: 16, seeHide: 12, sawHideWindow: 2,
    hearNoise: 0.6, hearDist: 3, huntHearK: 12, huntHearMin: 0.3,
    rushSpeed: 3.5, stride: 0.86, breathDist: 3,
    // a LETHAL scripted walk (moveTo opts.lethal / danger()) notices an unhidden player it has in
    // line of sight within this many units and goes for them (opts.watch overrides)
    watchLethal: 6,
    ghostSpread: 1.5, // ~3 m
    // sprite `emissive` of every body part (main, ghosts, glimpses, predictions, the window
    // figure): its pale rim and face smear glow at this level whatever the station power (the
    // map-wide emissive is 0.15 in the dark); the body itself takes world light / the flashlight
    glow: 0.9,
  };
  const THREAT = { search: 1, hunt: 1, stalk: 1 };
  const FOOT_SURFACE = {
    floor_lino: 'lino', floor_tile: 'tile', floor_concrete: 'concrete', floor_carpet: 'carpet', floor_grate: 'metal',
    ground_gravel: 'gravel', ground_mud: 'mud', ground_asphalt: 'concrete', roof_tar: 'concrete', hatch: 'metal',
  };

  /* ------------------------------------------------------------------ state */
  function defaults() {
    return {
      v: 1, active: false, map: 'station', x: 0, y: 0, angle: 0, mode: 'idle', speed: 1.1, spawns: 0, caught: false,
      target: null, search: null, hunt: null, stalk: null,
      window: { on: false, amount: 0, x: null, y: null, outX: null, outY: null, knocked: false },
      sawHide: null, intensity: 1, powerLevel: 0, transit: null, hops: 0, danger: false,
    };
  }
  function S() {
    let s = DA.state && DA.state.entity;
    if (!s || typeof s !== 'object') { s = defaults(); if (DA.state) DA.state.entity = s; return s; }
    if (s.v !== 1) {
      const d = defaults();
      for (const k in d) if (s[k] === undefined) s[k] = d[k];
      if (!s.window || typeof s.window !== 'object') s.window = d.window;
      s.v = 1;
    }
    return s;
  }

  /* ------------------------------------------------------------------ runtime */
  const rt = {
    time: 0, beh: null, path: null, pi: 0, blockedDoor: null, rattle: null,
    hist: [], histT: 0, longHist: [], longT: 0,
    main: { x: 0, y: 0, frame: 0, flip: false, alpha: 1 }, ghosts: [], face: null, ghostT: 0,
    moveAmt: 0, stepAcc: 0, movingT: 0, lastX: 0, lastY: 0,
    flickT: 1, staticT: 1, staticBump: 0,
    breath: null, amb: { lastDrone: null, baseDrone: 0, lastHb: null, baseHb: 0, touched: false },
    glimpses: [], lastSeenT: -99, seesNow: false,
    vis: { key: -1, v: false }, frameN: 0,
    caughtT: 0, deskPos: null, winT: 0, winPromise: null,
    lastExit: null, plPos: null,
  };
  const audio = (fn, ...a) => {
    const A = DA.audio;
    if (!A || typeof A[fn] !== 'function') return null;
    try { return A[fn](...a); } catch (e) { return null; }
  };
  const W = () => DA.world || null;
  const P = () => (DA.world && DA.world.player) || null;
  const mapById = (id) => { const w = W(); return w && w.maps ? w.maps[id] || null : null; };
  const emap = () => mapById(S().map);
  const idxOf = (m, x, y) => {
    const cx = Math.floor(x), cy = Math.floor(y);
    return !m || cx < 0 || cy < 0 || cx >= m.w || cy >= m.h ? -1 : cy * m.w + cx;
  };
  const doorAt = (m, i) => (i >= 0 && m.door[i] >= 0 ? m.doors[m.door[i]] : null);
  /** Can the entity stand in this cell (walls, pits and static stall/cupboard fronts block)? */
  function passable(m, i) {
    if (i < 0 || m.solid[i]) return false;
    const d = doorAt(m, i);
    return !(d && d.static);
  }
  const los = (ax, ay, bx, by, mapId) => {
    const w = W();
    try { return !!(w && w.lineOfSight && w.lineOfSight(ax, ay, bx, by, mapId)); } catch (e) { return false; }
  };
  const sameMap = () => { const w = W(); return !!w && w.mapId === S().map; };
  function playerDist() {
    const s = S(), p = P();
    if (!s.active || !p || !sameMap() || inTransit()) return Infinity;
    return Math.hypot(p.x - s.x, p.y - s.y);
  }
  function roomOf(x, y, mapId) { const w = W(); try { return w && w.roomAt ? w.roomAt(x, y, mapId) : null; } catch (e) { return null; } }
  function setMode(mode) {
    const s = S();
    if (s.mode === mode) return;
    const prev = s.mode;
    s.mode = mode;
    DA.bus.emit('entity:mode', { mode, prev });
  }
  function intensityNow() {
    const s = S();
    // stronger → more possible positions at once (the director may also set intensity(power()))
    const i0 = s.intensity == null ? 1 : +s.intensity;
    const base = U.clamp(i0 >= 1 ? Math.max(i0, power()) : i0, 0, 2);
    const inst = U.clamp((DA.v ? DA.v('instability') : 0) / 18, 0, 0.5);
    const modeK = { idle: 0.55, move: 0.7, search: 0.8, hunt: 1, stalk: 1.1, caught: 1.2 }[s.mode] || 0.7;
    return U.clamp(base * modeK + inst, 0, 2);
  }

  /* ------------------------------------------------------------------ power */
  /**
   * How strong it is tonight (README: every branch you create gives it another route closer —
   * "the more people you save, the stronger it becomes"). k = 1 + 0.12·saved + 0.03·instability,
   * clamped 1..1.8 (the director's own formula). The pure path stays at 1.
   */
  function power() {
    const saved = Math.max(0, +(DA.v ? DA.v('saved') : 0) || 0);
    const inst = Math.max(0, +(DA.v ? DA.v('instability') : 0) || 0);
    return +U.clamp(1 + 0.12 * saved + 0.03 * inst, 1, 1.8).toFixed(3);
  }
  const POWER_STEP = 0.15;
  const powerLevel = (k) => Math.floor((k - 1) / POWER_STEP + 1e-6);
  /**
   * The factor for a behaviour's ARGUMENTS (speed, search seconds). The director scales those
   * itself (speed × power()), so by default they are taken as given: opts.power true → scale by
   * power() here, a number → by that. Perception (hearing, sight, catch reach, how fast it finds
   * your trail again) always grows with power() — callers cannot pass that in.
   */
  const powerOf = (opts) => (opts && opts.power === true ? power() : opts && typeof opts.power === 'number' && opts.power > 0 ? +opts.power : 1);
  /** Speed under power k: stronger is faster, but a running player (3.4 u/s) always gains. */
  const powSpeed = (v, k, cap) => Math.min(cap || 3.15, v * (1 + (k - 1) * 0.6));
  function powerInfo() {
    const k = power();
    return { k, level: powerLevel(k), saved: DA.v ? DA.v('saved') : 0, instability: DA.v ? DA.v('instability') : 0,
      speedK: +(1 + (k - 1) * 0.6).toFixed(3), searchK: k, hearK: +(1 + (k - 1) * 0.8).toFixed(3), seeAdd: +((k - 1) * 4).toFixed(2),
      reacquire: +(8 / k).toFixed(2),
      catchAdd: +Math.min(0.15, (k - 1) * 0.2).toFixed(3), ghosts: +intensityNow().toFixed(2), darkLead: +darkLead(k).toFixed(1) };
  }
  /** Seconds the dark should come early at power k (for the director: 0 at k 1, ~60 s at k 1.45). */
  const catchAdd = (k) => Math.min(0.15, ((k || 1) - 1) * 0.2);
  const darkLead = (k) => U.clamp((k - 1) * 135, 0, 90);
  /** 'entity:power' {k, level, prev} whenever it grows a step (the director voices the first). */
  function checkPower() {
    const s = S(), k = power(), lv = powerLevel(k);
    const prev = s.powerLevel | 0;
    if (lv > prev) { s.powerLevel = lv; DA.bus.emit('entity:power', { k, level: lv, prev }); }
    else if (lv < prev) s.powerLevel = lv; // the collapse is over (instability zeroed): quietly lower
  }

  /* ------------------------------------------------------------------ points */
  /** Resolve a point spec to {map, x, y, angle}. 'behind'/'ahead' are relative to the player. */
  function resolvePoint(pt) {
    const w = W();
    if (pt == null) return null;
    if (typeof pt === 'string') {
      if (pt === 'behind' || pt === 'ahead') return relPoint(pt === 'behind' ? Math.PI : 0, pt === 'behind' ? 1.4 : 3);
      const p = w && w.point ? w.point(pt) : null;
      return p ? { map: p.map, x: p.x, y: p.y, angle: p.angle || 0 } : null;
    }
    if (typeof pt === 'object' && isFinite(pt.x) && isFinite(pt.y)) {
      return { map: pt.map || (w && w.mapId) || S().map || 'station', x: +pt.x, y: +pt.y, angle: pt.angle != null ? (+pt.angle * Math.PI) / 180 : 0 };
    }
    return null;
  }
  /** A spot `dist` units from the player at `rel` radians off their facing, pulled in until it
   *  is standable and in line of sight. */
  function relPoint(rel, dist) {
    const w = W(), p = P();
    if (!w || !p || !w.map) return null;
    const m = w.map, a = p.angle + rel;
    for (let d = dist; d >= 0.5; d -= 0.15) {
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (passable(m, idxOf(m, x, y)) && los(p.x, p.y, x, y, w.mapId)) return { map: w.mapId, x, y, angle: a + Math.PI };
    }
    return { map: w.mapId, x: p.x + Math.cos(a) * 0.6, y: p.y + Math.sin(a) * 0.6, angle: a + Math.PI };
  }
  /** Nearest standable cell centre to (x, y) (the point itself when standable). */
  function nearestStand(m, x, y, maxR = 2) {
    if (!m) return null;
    if (passable(m, idxOf(m, x, y))) return { x, y };
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = null, bd = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
        if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== r) continue;
        const i = idxOf(m, xx + 0.5, yy + 0.5);
        if (!passable(m, i)) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d < bd) { bd = d; best = { x: xx + 0.5, y: yy + 0.5 }; }
      }
      if (best) return best;
    }
    return null;
  }

  /* ------------------------------------------------------------------ flood (reachability) */
  /** 4-way step distances from (x, y) over standable cells; doors pass unless locked (or closed
   *  and listed in `blocks`). → Int16Array (-1 = unreachable). */
  function flood(m, x, y, blocks, maxD = 400) {
    const N = m.w * m.h, dist = new Int16Array(N).fill(-1);
    const s = idxOf(m, x, y);
    if (s < 0) return dist;
    const q = [s];
    dist[s] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], d = dist[i];
      if (d >= maxD) continue;
      const cx = i % m.w, cy = (i / m.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx;
        if (dist[j] >= 0 || !passable(m, j)) continue;
        const dr = doorAt(m, j);
        if (dr && isBlockingDoor(dr, blocks)) continue;
        dist[j] = d + 1;
        q.push(j);
      }
    }
    return dist;
  }
  function blockSet(blocks) {
    if (!blocks) return null;
    if (blocks === true) return true;
    return new Set([].concat(blocks));
  }
  function isBlockingDoor(d, blocks) {
    if (!d) return false;
    if (d.locked) return true;
    if (!blocks) return false;
    const closed = d.target === 0 && d.open < 0.5;
    return closed && (blocks === true || (blocks.has && blocks.has(d.id)));
  }
  /**
   * Can it lay a hand on the player from where it stands? Never through a wall or a shut door: a
   * wall cell (player in the open) or a door slab still shut (open < 0.5 — a locked one, one
   * `blocks` treats as locked, or one it has not opened yet) between the two points stops the
   * catch. The stall / cupboard fronts (static) do not: it saw you hide behind them.
   */
  function canReach(px, py, hidden) {
    const s = S(), m = emap();
    if (!m) return true;
    const dx = px - s.x, dy = py - s.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.08));
    const first = idxOf(m, s.x, s.y), lastI = idxOf(m, px, py);
    let prev = -2;
    for (let k = 0; k <= n; k++) {
      const i = idxOf(m, s.x + (dx * k) / n, s.y + (dy * k) / n);
      if (i === prev) continue;
      prev = i;
      if (i < 0) return false;
      if (!hidden && i !== first && i !== lastI && m.wall && m.wall[i]) return false;
      const d = doorAt(m, i);
      if (d && !d.static && d.open < 0.5) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ paths */
  /**
   * Plan a path from the entity to (tx, ty). → {pts, door (the blocking door record, if the only
   * route runs through a locked one), goal} | null.
   */
  function plan(tx, ty, blocks) {
    const s = S(), m = emap(), w = W();
    if (!m || !w || !w.path) return null;
    const goal = nearestStand(m, tx, ty, 2);
    if (!goal) return null;
    let pts = null;
    try { pts = w.path(s.x, s.y, goal.x, goal.y, s.map); } catch (e) { pts = null; }
    if (pts && blocks) {
      // a free path might still cross a door the caller wants treated as locked while shut
      const bd = firstBlocking(m, pts, blocks);
      if (bd) return { pts, door: bd, goal };
    }
    if (pts) return { pts, door: null, goal };
    try { pts = w.path(s.x, s.y, goal.x, goal.y, s.map, { locked: true }); } catch (e) { pts = null; }
    if (!pts) return null;
    return { pts, door: firstBlocking(m, pts, blocks || null) || firstLocked(m, pts), goal };
  }
  function firstLocked(m, pts) {
    for (const q of pts) { const d = doorAt(m, idxOf(m, q.x, q.y)); if (d && d.locked) return d; }
    return null;
  }
  function firstBlocking(m, pts, blocks) {
    // walk the segments too: string-pulled paths keep door cells, but be safe
    let px = S().x, py = S().y;
    for (const q of pts) {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - px, q.y - py) / 0.25));
      for (let k = 1; k <= n; k++) {
        const d = doorAt(m, idxOf(m, px + ((q.x - px) * k) / n, py + ((q.y - py) * k) / n));
        if (d && isBlockingDoor(d, blocks)) return d;
      }
      px = q.x; py = q.y;
    }
    return null;
  }
  function setPath(p) {
    rt.path = p ? p.pts.slice() : null;
    rt.pi = 0;
    rt.pathDoor = p ? p.door : null;
  }
  /** Point `d` units ahead along the current path (or the current position). */
  function alongPath(d) {
    const s = S();
    let x = s.x, y = s.y;
    if (!rt.path) return { x, y };
    for (let k = rt.pi; k < rt.path.length && d > 0; k++) {
      const q = rt.path[k], l = Math.hypot(q.x - x, q.y - y);
      if (l >= d) return { x: x + ((q.x - x) * d) / l, y: y + ((q.y - y) * d) / l };
      d -= l; x = q.x; y = q.y;
    }
    return { x, y };
  }
  function pathLength() {
    const s = S();
    if (!rt.path) return 0;
    let x = s.x, y = s.y, L = 0;
    for (let k = rt.pi; k < rt.path.length; k++) { L += Math.hypot(rt.path[k].x - x, rt.path[k].y - y); x = rt.path[k].x; y = rt.path[k].y; }
    return L;
  }
  /** Irregular gait: it lurches rather than walks. k = how irregular (0 = steady). */
  function gait(k) {
    const t = rt.time;
    const v = 0.5 + 0.5 * Math.sin(t * 3.1 + Math.sin(t * 1.27) * 1.9);
    return 1 + (v * 1.6 - 0.8) * k;
  }
  /**
   * Follow rt.path one step. → 'moving' | 'arrived' | 'blocked' | 'wait'. Opens closed unlocked
   * doors ahead (the world plays door_open); stops short of a blocking door (rt.blockedDoor).
   */
  function follow(dt, speed, blocks, irregular) {
    const s = S(), m = emap(), w = W();
    if (!rt.path || !m) return 'arrived';
    if (rt.pi >= rt.path.length) return 'arrived';
    // doors on the next few legs
    let px = s.x, py = s.y;
    for (let k = rt.pi; k < Math.min(rt.path.length, rt.pi + 3); k++) {
      const q = rt.path[k];
      let hit = null;
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - px, q.y - py) / 0.25));
      for (let j = 1; j <= n && !hit; j++) {
        const d = doorAt(m, idxOf(m, px + ((q.x - px) * j) / n, py + ((q.y - py) * j) / n));
        if (d && !d.static) hit = d;
      }
      px = q.x; py = q.y;
      if (!hit) continue;
      const dd = Math.hypot(hit.x + 0.5 - s.x, hit.y + 0.5 - s.y);
      const inside = idxOf(m, s.x, s.y) === hit.y * m.w + hit.x;
      if (!inside && isBlockingDoor(hit, blocks)) {
        if (dd < 1.08) { rt.blockedDoor = hit; return 'blocked'; }
        break;
      }
      if (dd < 1.8 && hit.target === 0 && w && w.openDoor) w.openDoor(hit.id);
      if (!inside && dd < 0.85 && hit.open < 0.75) return 'wait';
      break;
    }
    let step = speed * dt * (irregular ? gait(irregular) : 1);
    while (step > 0 && rt.pi < rt.path.length) {
      const q = rt.path[rt.pi];
      const dx = q.x - s.x, dy = q.y - s.y, d = Math.hypot(dx, dy);
      if (d <= step || d < 1e-4) { s.x = q.x; s.y = q.y; step -= d; rt.pi++; rt.moveAmt += d; }
      else { s.x += (dx / d) * step; s.y += (dy / d) * step; s.angle = Math.atan2(dy, dx); rt.moveAmt += step; step = 0; }
    }
    return rt.pi >= rt.path.length ? 'arrived' : 'moving';
  }

  /* ------------------------------------------------------------------ across maps */
  const SIDE_D = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const TRANSIT = { maxHops: 4, hearStairs: 16, sawWindow: 4, delay: [1.3, 2.3] };
  /** Where you stand to use an interactable (a wall face: in front of it; a floor hatch: on it). */
  function standOf(m, it) {
    if (!m || !it) return null;
    let x = +it.x, y = +it.y;
    if (it.side) {
      const d = SIDE_D[it.side] || [0, 1];
      x = Math.floor(it.x) + 0.5 + d[0] * 0.8;
      y = Math.floor(it.y) + 0.5 + d[1] * 0.8;
    }
    return nearestStand(m, x, y, 2);
  }
  /**
   * Every way between two maps — stairs, ladders, hatches (interactables with `to` + `point`) —
   * plus the way back through a one-sided opening (the keypad door into the relay has only
   * relay_exit as an interactable). → [{id, via, from, to, sx, sy (stand on `from`), ax, ay
   * (arrival on `to`), point}]
   */
  function links() {
    const w = W(), out = [];
    if (!w || !w.maps || !DA.interact || !DA.interact.list) return out;
    for (const id in w.maps) {
      const m = w.maps[id];
      let list = [];
      try { list = DA.interact.list(id) || []; } catch (e) { list = []; }
      for (const it of list) {
        if (!it || !it.to || it.to === id || !w.maps[it.to] || !it.point) continue;
        const dm = w.maps[it.to];
        const pt = dm.points && dm.points[it.point];
        const st = standOf(m, it);
        if (!pt || !st) continue;
        const ar = nearestStand(dm, pt.x, pt.y, 2) || pt;
        out.push({ id: it.id, via: it.kind || 'stairs', from: id, to: it.to, sx: st.x, sy: st.y, ax: ar.x, ay: ar.y, point: it.point });
      }
    }
    for (const l of out.slice()) {
      if (out.some((o) => o.from === l.to && o.to === l.from)) continue;
      out.push({ id: l.id + ':back', via: l.via, from: l.to, to: l.from, sx: l.ax, sy: l.ay, ax: l.sx, ay: l.sy, point: null, back: true });
    }
    return out;
  }
  /** First link on the way from map `a` to map `b` (BFS over maps), preferring the one nearest
   *  (x, y) / named `point` when several lead straight there. */
  function route(a, b, x, y, point) {
    if (!a || !b || a === b) return null;
    const L = links();
    const direct = L.filter((l) => l.from === a && l.to === b);
    if (direct.length) {
      const named = point ? direct.filter((l) => l.point === point) : [];
      const pool = named.length ? named : direct;
      if (x == null) return pool[0];
      return pool.slice().sort((p, q) => Math.hypot(p.sx - x, p.sy - y) - Math.hypot(q.sx - x, q.sy - y))[0];
    }
    const prev = new Map([[a, null]]), q = [a];
    while (q.length) {
      const m = q.shift();
      if (m === b) break;
      for (const l of L) if (l.from === m && !prev.has(l.to)) { prev.set(l.to, l); q.push(l.to); }
    }
    if (!prev.has(b)) return null;
    let l = prev.get(b);
    while (l && l.from !== a) l = prev.get(l.from);
    return l || null;
  }
  const inTransit = () => { const t = S().transit; return !!(t && t.phase === 'through'); };
  /**
   * Start following through `link`: walk to it, go through (out of sight for a moment — you hear
   * it on the stairs), come out at the far end. → true (started) / false (can't reach it).
   */
  function beginTransit(link, b, why) {
    const s = S();
    if (!link) return false;
    const hops = (s.hops | 0) + 1;
    if (hops > TRANSIT.maxHops) return false;
    const k = power();
    s.transit = { id: link.id, via: link.via, from: link.from, to: link.to, sx: link.sx, sy: link.sy, ax: link.ax, ay: link.ay,
      phase: 'walk', t: 0, delay: U.rand(TRANSIT.delay[0], TRANSIT.delay[1]) / Math.sqrt(k), why: why || 'follow', steps: 0 };
    s.hops = hops;
    b && (b.transitPlanned = false);
    rt.repathT = 0;
    DA.bus.emit('entity:follow', { phase: 'start', from: link.from, to: link.to, via: link.via, id: link.id, why: s.transit.why });
    return true;
  }
  function transitSpeed(b) {
    if (!b) return 1.4;
    if (b.kind === 'search') return Math.max(1.6, b.speed * 1.6);
    if (b.kind === 'move') return Math.max(1.1, b.speed || 1.1);
    return b.speed || 2;
  }
  /** Seconds until it comes out at the far end (for predict / CCTV). */
  function transitETA() {
    const s = S(), T = s.transit, b = rt.beh;
    if (!T) return 0;
    if (T.phase === 'through') return Math.max(0, T.delay - T.t);
    return pathLength() / transitSpeed(b) + T.delay;
  }
  /**
   * Run the current transit. → 'walk' | 'through' | 'arrived' | 'cancel' | 'fail'. On 'arrived'
   * it stands at the far end (or, if you came back meanwhile, back out where it went in).
   */
  function updateTransit(dt, b) {
    const s = S(), T = s.transit, w = W();
    T.t += dt;
    if (T.phase === 'walk') {
      // you came back before it reached the way through: it carries on here
      if (w && w.mapId === T.from && s.map === T.from && T.why !== 'move') { s.transit = null; setPath(null); rt.repathT = 0; DA.bus.emit('entity:follow', { phase: 'cancel', from: T.from, to: T.to }); return 'cancel'; }
      if (!b.transitPlanned) {
        b.transitPlanned = true;
        const pl = plan(T.sx, T.sy, b.blocks || null);
        if (!pl || pl.door) { s.transit = null; setPath(null); return 'fail'; }
        setPath(pl);
      }
      const st = rt.path ? follow(dt, transitSpeed(b), b.blocks || null, 0.2) : 'arrived';
      if (st === 'blocked') { s.transit = null; setPath(null); return 'fail'; }
      if (st === 'arrived' || Math.hypot(s.x - T.sx, s.y - T.sy) < 0.35) {
        T.phase = 'through';
        T.t = 0;
        setPath(null);
        rt.ghosts.length = 0;
        rt.face = null;
        stopBreath();
        DA.bus.emit('entity:follow', { phase: 'through', from: T.from, to: T.to, via: T.via, id: T.id });
      }
      return T.phase;
    }
    // through: you hear it coming (stairs: footsteps; a ladder / hatch: the rungs, the lid)
    const lead = T.delay - T.t;
    if (T.via === 'stairs') {
      while (T.steps < 5 && lead <= 1.9 - T.steps * 0.38) {
        T.steps++;
        audio('play', 'footstep_other', { x: T.ax, y: T.ay, map: T.to, surface: 'concrete', vol: 0.55 + T.steps * 0.1, rate: U.rand(0.82, 0.95), weight: 1.3 });
      }
    } else if (T.steps === 0 && lead <= 0.9) {
      T.steps = 1;
      audio('play', /hatch/.test(T.id) ? 'hatch' : 'ladder', { x: T.ax, y: T.ay, map: T.to, vol: 0.8, rate: 0.9 });
    }
    if (T.t < T.delay) return 'through';
    // come out wherever you are: the far end, or back where it went in if you turned round
    const back = w && w.mapId === T.from;
    const map = back ? T.from : T.to;
    const m = mapById(map);
    const q = (m && nearestStand(m, back ? T.sx : T.ax, back ? T.sy : T.ay, 2)) || { x: back ? T.sx : T.ax, y: back ? T.sy : T.ay };
    s.map = map; s.x = q.x; s.y = q.y;
    s.transit = null;
    rt.lastX = s.x; rt.lastY = s.y;
    rt.hist.length = 0;
    setPath(null);
    rt.repathT = 0;
    rt.vis.key = -1;
    resample(true);
    if (w && w.flickerNear) w.flickerNear(s.x, s.y, 1.2, map);
    DA.bus.emit('entity:follow', { phase: 'arrive', from: T.from, to: map, via: T.via, id: T.id, x: s.x, y: s.y });
    return 'arrived';
  }
  /**
   * The player is on another map than the entity. Should it follow, and through which link?
   * mode: true / 'always' — follow; 'heard' — only if it saw you just before you went or the
   * way you took is within earshot; false — never.
   */
  function exitToFollow(mode) {
    const s = S(), w = W();
    if (!w || mode === false || !s.active) return null;
    const e = rt.lastExit;
    if (mode === 'heard') {
      const saw = rt.time - rt.lastSeenT <= TRANSIT.sawWindow;
      const near = e && e.from === s.map && e.x != null && Math.hypot(e.x - s.x, e.y - s.y) <= TRANSIT.hearStairs * (1 + (power() - 1) * 0.8);
      if (!saw && !near) return null;
    }
    if (e && e.from === s.map && e.to === w.mapId) return route(s.map, w.mapId, e.x != null ? e.x : s.x, e.y != null ? e.y : s.y, e.point);
    return route(s.map, w.mapId, s.x, s.y);
  }

  /* ------------------------------------------------------------------ behaviours */
  function endBehaviour(result) {
    const b = rt.beh;
    rt.beh = null;
    rt.rattle = null;
    const s = S();
    s.target = null; s.search = null; s.hunt = null; s.stalk = null;
    s.transit = null; s.hops = 0;
    if (s.mode !== 'caught') setMode('idle');
    if (b && b.resolve) { try { b.resolve(result === undefined ? b.stopResult : result); } catch (e) { /* ignore */ } }
  }
  /**
   * Cut the current behaviour short (stop() / despawn() / spawn() / stalk(false) / a new behaviour):
   * its promise resolves at once with its stopped result (move {arrived:false, stopped:true}, hunt
   * {caught:false, escaped:false, reason:'stopped', stopped:true}, stalk {caught:false,
   * stopped:true}, search false), any rattle / rush / transit it had going ends with it, and
   * 'entity:stop' {kind, why} tells listeners it was cut (why: 'stop' | 'despawn' | 'spawn' |
   * 'replaced'). Nothing it started keeps running afterwards.
   */
  function cutBehaviour(why) {
    const b = rt.beh;
    if (!b) return false;
    endBehaviour(b.stopResult);
    setPath(null);
    DA.bus.emit('entity:stop', { kind: b.kind, why: why || 'stop' });
    return true;
  }
  function startBehaviour(b) {
    if (rt.beh) cutBehaviour('replaced');
    S().transit = null;
    S().hops = 0;
    rt.beh = b;
    rt.rattle = null;
    setPath(null);
    rt.repathT = 0;
    setMode(b.kind);
  }
  /** Rattle a locked door: handle, then the lock, twice. Calls then() when the rattle is over. */
  function startRattle(door, then) {
    const s = S();
    rt.rattle = { door, t: 0, then, stage: 0 };
    DA.bus.emit('entity:blocked', { door: door.id, map: s.map, x: s.x, y: s.y });
  }
  function updateRattle(dt) {
    const R = rt.rattle, s = S();
    R.t += dt;
    const pos = { x: R.door.x + 0.5, y: R.door.y + 0.5, map: s.map };
    const cues = [[0, 'door_handle', 0.95], [1.05, 'door_locked', 0.85], [1.75, 'door_locked', 1.0]];
    while (R.stage < cues.length && R.t >= cues[R.stage][0]) {
      const c = cues[R.stage++];
      audio('play', c[1], { x: pos.x, y: pos.y, map: pos.map, vol: c[2], rate: U.rand(0.92, 1.04) });
    }
    if (R.t >= 2.6) {
      const then = R.then;
      rt.rattle = null;
      if (then) then();
    }
  }

  /* ---- contact (lethal contexts) */
  /**
   * Is it touching the player, and may that kill? Same map, not on the stairs, within catch reach
   * (0.55 u + power), nothing solid between (canReach) and the player not hidden — or hidden where
   * it saw them hide. → true when it caught them (doCatch(how) has run).
   */
  function contactCatch(how) {
    const s = S(), p = P();
    if (!s.active || s.caught || !p || !sameMap() || inTransit()) return false;
    const hid = !!p.hidden;
    if (hid && !s.sawHide) return false;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const reach = (hid ? CFG.reachHidden : CFG.catchHunt) + catchAdd(power());
    if (d > reach || !canReach(p.x, p.y, hid)) return false;
    doCatch(how || 'contact');
    return true;
  }
  /** danger(on?) → bool: the lethal-context switch (see header). Cleared by despawn(). */
  function danger(on) {
    const s = S();
    if (on != null) {
      const v = !!on;
      if (!!s.danger !== v) { s.danger = v; DA.bus.emit('entity:danger', { on: v }); }
    }
    return !!s.danger;
  }

  /* ---- moveTo */
  function moveTo(pt, speed, opts) {
    const s = S();
    if (!s.active) return Promise.resolve({ arrived: false, stopped: true, inactive: true });
    const p = resolvePoint(pt);
    if (!p) { console.warn('[entity] moveTo: unknown point', pt); return Promise.resolve({ arrived: false, unreachable: true }); }
    opts = opts || {};
    return new Promise((resolve) => {
      const direct = !!(opts.teleport || opts.via === false);
      // lethal: opts.lethal, else whatever danger() says. A lethal walk kills on contact and (unless
      // opts.watch === false) goes for an unhidden player it sees within `watch` units
      const lethal = opts.lethal != null ? !!opts.lethal : !!s.danger;
      const watch = !lethal || opts.watch === false ? 0 : typeof opts.watch === 'number' && opts.watch > 0 ? +opts.watch : CFG.watchLethal;
      const onSeen = opts.onSeen === 'stop' ? 'stop' : 'rush';
      startBehaviour({ kind: 'move', resolve, stopResult: { arrived: false, stopped: true }, speed: +speed || 1.1, blocks: blockSet(opts.closedBlocks), tx: p.x, ty: p.y, map: p.map, planned: false, direct,
        lethal, watch, onSeen, rush: false, rushT: 0 });
      s.speed = rt.beh.speed;
      s.target = { x: p.x, y: p.y, map: p.map, closedBlocks: opts.closedBlocks ? opts.closedBlocks : null, direct, lethal, watch, onSeen };
    });
  }
  /**
   * A lethal walk that has the (unhidden) player in sight within its watch distance stops being a
   * walk: onSeen 'rush' (default) — it goes for them like a search that found them (stinger,
   * 'entity:found' {how:'sight'}, rush → catch; resolves {arrived:false, seen:true, rushed:true}
   * if a lock got between you); onSeen 'stop' — it stops and resolves {arrived:false, seen:true,
   * x, y, dist} for the caller to decide (e.g. the director's pursue()). → true if it took over.
   */
  function moveSpotted(b) {
    const s = S(), p = P();
    if (!(b.watch > 0) || b.rush || !rt.seesNow || !p || p.hidden) return false;
    const d = playerDist();
    if (!(d <= b.watch)) return false;
    if (b.onSeen === 'stop') {
      setPath(null);
      s.transit = null;
      endBehaviour({ arrived: false, seen: true, x: +p.x.toFixed(2), y: +p.y.toFixed(2), dist: +d.toFixed(2) });
      return true;
    }
    const r = reachPlayer(null);
    if (!r.ok) return false;
    s.transit = null;
    beginRush(b, 'sight', r.plan);
    return true;
  }
  function updateMove(dt, b) {
    const s = S();
    if (b.lethal && !b.rush && !inTransit() && moveSpotted(b)) return;
    if (b.rush) return updateRush(dt, b, () => endBehaviour({ arrived: false, seen: true, rushed: true }), CFG.rushSpeed * (1 + (power() - 1) * 0.4));
    if (s.transit) {
      const r = updateTransit(dt, b);
      if (r === 'arrived' || r === 'cancel') b.planned = false;
      if (r !== 'fail') return;
      b.direct = true; // could not reach the way through: fall back to simply being there
    }
    if (b.map && b.map !== s.map) {
      // another map: it takes the stairs / ladder like you would (out of sight for a moment,
      // you hear it) — opts.teleport: it simply is there now
      const link = b.direct ? null : route(s.map, b.map, s.x, s.y);
      if (link && beginTransit(link, b, 'move')) return;
      const m = mapById(b.map);
      const q = (m && nearestStand(m, b.tx, b.ty, 2)) || { x: b.tx, y: b.ty };
      s.map = b.map; s.x = q.x; s.y = q.y;
      rt.lastX = s.x; rt.lastY = s.y; rt.hist.length = 0;
      DA.bus.emit('entity:arrive', { x: s.x, y: s.y });
      return endBehaviour({ arrived: true });
    }
    if (!b.planned) {
      b.planned = true;
      const p = plan(b.tx, b.ty, b.blocks);
      if (!p) return endBehaviour({ arrived: false, blocked: true, unreachable: true });
      setPath(p);
      // a walk never ends inside you: sent to where you are, it stops just short and stands there
      const pl = P();
      b.stopNear = !!(pl && sameMap() && Math.hypot(p.goal.x - pl.x, p.goal.y - pl.y) < 0.8);
    }
    // a lethal walk that ends at you does not stop short of you (contact kills — see update())
    if (b.stopNear && b.lethal) { const pl = P(); if (pl && (!pl.hidden || s.sawHide)) b.stopNear = false; }
    if (b.stopNear && playerDist() <= 0.85) {
      setPath(null);
      DA.bus.emit('entity:arrive', { x: s.x, y: s.y, short: true });
      return endBehaviour({ arrived: true, short: true });
    }
    const st = follow(dt, b.speed, b.blocks, 0.45);
    if (st === 'arrived') {
      DA.bus.emit('entity:arrive', { x: s.x, y: s.y });
      return endBehaviour({ arrived: true });
    }
    if (st === 'blocked') {
      const door = rt.blockedDoor;
      startRattle(door, () => endBehaviour({ arrived: false, blocked: true, door: door.id }));
    }
  }

  /* ---- search */
  function areaCells(m, where) {
    const out = [];
    if (!m) return out;
    if (typeof where === 'string') {
      const ri = m.rooms ? m.rooms.indexOf(where) : -1;
      if (ri > 0) for (let i = 0; i < m.w * m.h; i++) if (m.room[i] === ri && passable(m, i) && m.door[i] < 0) out.push(i);
      return out;
    }
    const cx = where.x, cy = where.y, r = where.r || 2.6;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const i = idxOf(m, x + 0.5, y + 0.5);
      if (!passable(m, i) || m.door[i] >= 0) continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      if (!los(cx, cy, x + 0.5, y + 0.5, m.id)) continue;
      out.push(i);
    }
    return out;
  }
  /** Standable approach points beside the hiding places in an area. */
  function hideSpots(m, cellSet) {
    const out = [];
    const list = DA.interact && DA.interact.list ? DA.interact.list(m.id) : [];
    for (const it of list) {
      if (it.kind !== 'hide' || !it.pos) continue;
      // stand in front of the hiding place (where the hidden player is looking), facing it
      const a = ((it.pos.angle || 0) * Math.PI) / 180;
      let near = null;
      for (let r = 1.0; r >= 0.55 && !near; r -= 0.15) {
        const x = it.pos.x + Math.cos(a) * r, y = it.pos.y + Math.sin(a) * r;
        if (passable(m, idxOf(m, x, y)) && los(it.pos.x, it.pos.y, x, y, m.id)) near = { x, y };
      }
      if (!near) near = nearestStand(m, it.pos.x + Math.cos(a) * 0.9, it.pos.y + Math.sin(a) * 0.9, 1);
      if (!near) continue;
      const i = idxOf(m, near.x, near.y);
      if (cellSet && !cellSet.has(i)) {
        // the hide position itself may be a stall/cupboard cell outside the room's floor list
        let ok = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cellSet.has(idxOf(m, near.x + dx, near.y + dy))) ok = true;
        if (!ok) continue;
      }
      out.push({ x: near.x, y: near.y, hide: it.id, lookX: it.pos.x, lookY: it.pos.y });
    }
    return out;
  }
  function search(where, secs, opts) {
    const s = S();
    if (!s.active) return Promise.resolve(false);
    if (where == null) where = roomOf(s.x, s.y, s.map) || { x: s.x, y: s.y };
    if (typeof where === 'object' && !isFinite(where.x)) where = { x: s.x, y: s.y };
    const k = powerOf(opts);
    const dur = (secs == null ? 8 : +secs) * k;
    const follow = opts && opts.follow != null ? opts.follow : 'heard';
    const map = searchMapOf(where);
    return new Promise((resolve) => {
      startBehaviour({ kind: 'search', resolve, stopResult: false, where, map, remaining: dur, speed: ((opts && opts.speed) || 0.95) * (1 + (k - 1) * 0.5),
        phase: 'listen', pauseT: U.rand(0.9, 1.6), visited: new Set(), rush: false, rushT: 0, detT: 0, rattleCD: 0, power: k, follow });
      s.search = { where: whereState(where), map, remaining: dur, speed: rt.beh.speed, power: k, follow };
    });
  }
  const whereState = (where) => (typeof where === 'string' ? where : { x: where.x, y: where.y, r: where.r || 2.6 });
  /** Which map a search area is on: {map} given, else the map that has that room (the entity's
   *  own first, then yours), else where it stands. */
  function searchMapOf(where) {
    const s = S(), w = W();
    if (where && typeof where === 'object' && where.map && mapById(where.map)) return where.map;
    if (typeof where === 'string' && w && w.maps) {
      const has = (m) => !!(m && m.rooms && m.rooms.indexOf(where) > 0);
      if (has(mapById(s.map))) return s.map;
      if (has(w.map)) return w.mapId;
      for (const id in w.maps) if (has(w.maps[id])) return id;
    }
    return s.map;
  }
  /** It came out on your floor after following you: look where you went (if it can tell), else
   *  around where it came out. */
  function retargetSearch(b) {
    const s = S(), p = P();
    let where = null;
    if (p && sameMap() && !p.hidden && Math.hypot(p.x - s.x, p.y - s.y) < 14) where = roomOf(p.x, p.y, s.map) || { x: p.x, y: p.y, r: 4 };
    if (!where) where = { x: s.x, y: s.y, r: 4.5 };
    b.where = where;
    b.map = s.map;
    b.visited = new Set();
    b.phase = 'listen';
    b.pauseT = U.rand(0.35, 0.8);
    b.remaining += 2;
    b.unreachable = false;
    b.door = null;
    if (s.search) { s.search.where = whereState(where); s.search.map = s.map; }
  }
  function pickSearchSpot(b) {
    const s = S(), m = emap();
    const cells = areaCells(m, b.where);
    if (!cells.length) return null;
    const cellSet = new Set(cells);
    const reach = flood(m, s.x, s.y, null);
    const ok = cells.filter((i) => reach[i] >= 0);
    b.unreachable = !ok.length;
    if (!ok.length) return null;
    const spots = hideSpots(m, cellSet).filter((h) => reach[idxOf(m, h.x, h.y)] >= 0 && !b.visited.has('h' + h.hide));
    if (spots.length && Math.random() < 0.45) {
      const h = U.choice(spots);
      b.visited.add('h' + h.hide);
      return h;
    }
    // never wander onto a hidden player (it would be standing inside them)
    const p = P();
    const hid = p && p.hidden && sameMap() ? p : null;
    const free = hid ? ok.filter((i) => Math.hypot((i % m.w) + 0.5 - hid.x, ((i / m.w) | 0) + 0.5 - hid.y) > 0.95) : ok;
    let pool = free.filter((i) => !b.visited.has(i) && Math.hypot((i % m.w) + 0.5 - s.x, ((i / m.w) | 0) + 0.5 - s.y) > 1.4);
    if (!pool.length) { for (const k of [...b.visited]) if (typeof k === 'number') b.visited.delete(k); pool = free.length ? free : ok; }
    const i = U.choice(pool);
    b.visited.add(i);
    return { x: (i % m.w) + 0.5 + U.rand(-0.25, 0.25), y: ((i / m.w) | 0) + 0.5 + U.rand(-0.25, 0.25) };
  }
  /** How would it know you are there? → 'sight' | 'saw_hide' | 'noise' | null. */
  function detect(seeDist, k) {
    const s = S(), p = P();
    if (!p || !sameMap() || inTransit()) return null;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (p.hidden) {
      if (s.sawHide) return 'saw_hide';
      return null;
    }
    if (d <= seeDist && rt.seesNow) return 'sight';
    if ((p.noise || 0) >= CFG.hearNoise - 0.02 && d <= CFG.hearDist * (1 + ((k || 1) - 1) * 0.8)) return 'noise';
    return null;
  }
  /** Is the player reachable without passing a locked door? → {ok, door}. */
  function reachPlayer(blocks) {
    const p = P(), m = emap();
    if (!p || !m) return { ok: false };
    const pl = plan(p.x, p.y, blocks);
    if (!pl) return { ok: false };
    if (pl.door) return { ok: false, door: pl.door, plan: pl };
    return { ok: true, plan: pl };
  }
  function updateSearch(dt, b) {
    const s = S(), p = P();
    if (s.search) s.search.remaining = b.remaining;
    if (rt.rattle) return;
    // --- across maps: on its way to the area, or after you through the stairs
    if (s.transit) {
      const r = updateTransit(dt, b);
      if (r === 'arrived' && s.transit == null) { if (b.map === s.map && !b.following) return; b.following = false; retargetSearch(b); }
      else if (r === 'fail') { b.following = false; if (b.map !== s.map) return endBehaviour(false); }
      else if (r === 'cancel') b.following = false;
      return;
    }
    if (b.map && b.map !== s.map) {
      // the area is on another map: go there first (stairs / ladder)
      const link = route(s.map, b.map, s.x, s.y);
      if (link && beginTransit(link, b, 'move')) return;
      b.map = s.map;
      b.where = { x: s.x, y: s.y, r: 4 };
    }
    if (p && !sameMap() && b.follow !== false) {
      // you left its floor: did it see / hear you go? (mid-rush it always did)
      const link = exitToFollow(b.rush ? 'always' : b.follow);
      if (link && beginTransit(link, b, 'search')) { b.rush = false; b.following = true; return; }
    }
    const pk = power();
    if (b.rush) return updateRush(dt, b, () => endBehaviour(true), CFG.rushSpeed * (1 + (pk - 1) * 0.4));
    b.remaining -= dt;
    b.rattleCD -= dt;
    // --- detection (a few times a second)
    b.detT -= dt;
    if (b.detT <= 0) {
      b.detT = 0.15;
      const how = detect(CFG.seeSearch + (pk - 1) * 4, pk);
      if (how) {
        const r = reachPlayer(null);
        if (r.ok) return beginRush(b, how, r.plan);
        if (r.door && b.rattleCD <= 0) {
          // it heard you; the lock holds
          b.rattleCD = U.rand(4, 6.5);
          const door = r.door;
          const pl = r.plan;
          setPath(pl);
          b.phase = 'todoor';
          b.door = door;
        }
      }
    }
    if (b.remaining <= 0) return endBehaviour(false);
    // --- wander
    if (b.phase === 'listen' || b.phase === 'pause') {
      b.pauseT -= dt;
      if (b.pauseT > 0) return;
      const spot = pickSearchSpot(b);
      if (!spot) {
        // the whole area is behind a lock: go and try the door
        const where = typeof b.where === 'string' ? centreOf(emap(), b.where) : b.where;
        const pl = where ? plan(where.x, where.y, null) : null;
        if (pl && pl.door) { setPath(pl); b.phase = 'todoor'; b.door = pl.door; return; }
        b.phase = 'pause'; b.pauseT = U.rand(1.5, 3); return;
      }
      const pl = plan(spot.x, spot.y, null);
      if (!pl || pl.door) { b.phase = 'pause'; b.pauseT = 0.5; return; }
      setPath(pl);
      b.phase = 'walk';
      b.spot = spot;
      return;
    }
    if (b.phase === 'walk' || b.phase === 'todoor') {
      const st = follow(dt, b.phase === 'todoor' ? b.speed * 1.2 : b.speed, null, 0.55);
      if (st === 'blocked') {
        const door = rt.blockedDoor;
        b.rattleCD = U.rand(4, 6.5);
        startRattle(door, () => { b.phase = 'pause'; b.pauseT = U.rand(1.2, 2.6); setPath(null); });
        return;
      }
      if (st === 'arrived') {
        if (b.phase === 'todoor' && b.door) {
          // arrived beside a door that was unlocked meanwhile? carry on searching
          b.door = null;
        }
        if (b.spot && b.spot.lookX != null) s.angle = Math.atan2(b.spot.lookY - s.y, b.spot.lookX - s.x);
        b.phase = 'pause';
        b.pauseT = b.spot && b.spot.hide ? U.rand(2.2, 3.6) : U.rand(0.9, 2.2);
        setPath(null);
      }
    }
  }
  function centreOf(m, room) {
    const cells = areaCells(m, room);
    if (!cells.length) return null;
    let sx = 0, sy = 0;
    for (const i of cells) { sx += (i % m.w) + 0.5; sy += ((i / m.w) | 0) + 0.5; }
    return nearestStand(m, sx / cells.length, sy / cells.length, 3);
  }
  function beginRush(b, how, pl) {
    b.rush = true;
    b.rushT = 0;
    b.how = how;
    setPath(pl);
    rt.repathT = 0.3;
    DA.bus.emit('entity:found', { how, map: S().map });
    audio('stinger', 'high');
    const s = S();
    const w = W();
    if (w && w.flickerNear) w.flickerNear(s.x, s.y, 2.5, s.map);
    rt.flickT = 0.8;
  }
  /** Rush toward the player and catch them (shared by search's find). */
  function updateRush(dt, b, onEnd, speed) {
    const s = S(), p = P();
    b.rushT += dt;
    if (!p || !sameMap()) return onEnd();
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const reach = (p.hidden ? CFG.reachHidden : CFG.catchHunt) + catchAdd(power());
    if (d <= reach && (!p.hidden || s.sawHide || b.how === 'saw_hide') && canReach(p.x, p.y, p.hidden)) { doCatch(b.how || 'rush'); return; }
    rt.repathT -= dt;
    if (rt.repathT <= 0 || !rt.path) {
      rt.repathT = 0.3;
      const pl = plan(p.x, p.y, null);
      if (pl) setPath(pl);
    }
    const st = follow(dt, speed, null, 0.12);
    if (st === 'blocked' || b.rushT > 9) {
      // the player got a lock between us
      const door = rt.blockedDoor;
      if (st === 'blocked' && door) { startRattle(door, onEnd); return; }
      return onEnd();
    }
    if (st === 'arrived') { rt.path = null; }
  }

  /* ---- hunt */
  function hunt(opts) {
    const s = S();
    opts = opts || {};
    if (!s.active) return Promise.resolve({ caught: false, escaped: true, reason: 'inactive' });
    const k = powerOf(opts);
    return new Promise((resolve) => {
      startBehaviour({ kind: 'hunt', resolve, stopResult: { caught: false, escaped: false, reason: 'stopped', stopped: true },
        speed: powSpeed(+opts.speed || 2.4, k), duration: opts.duration == null ? Infinity : +opts.duration, elapsed: 0,
        giveUpDist: opts.giveUpDist != null ? +opts.giveUpDist : null, blocks: blockSet(opts.closedBlocks), closedBlocks: opts.closedBlocks || null,
        last: null, idleT: 0, wander: null, rattleCD: 0, lostT: 0, power: k, follow: opts.follow !== false, budget: opts.budget === 'total' ? 'total' : 'floor' });
      // it is hunting you: it knows where you are when it starts
      const p = P();
      if (p && sameMap() && !(p.hidden && !s.sawHide)) rt.beh.last = { x: p.x, y: p.y };
      persistHunt();
    });
  }
  function persistHunt() {
    const b = rt.beh;
    if (!b || b.kind !== 'hunt') return;
    S().hunt = { speed: b.speed, remaining: isFinite(b.duration) ? Math.max(0, b.duration - b.elapsed) : null, giveUpDist: b.giveUpDist,
      closedBlocks: b.closedBlocks, last: b.last, power: b.power, follow: b.follow, budget: b.budget };
  }
  function updateHunt(dt, b) {
    const s = S(), p = P();
    // the budget only runs while it is on your floor: walking to the stairs after you and the
    // stairs themselves do not use it up (opts.budget 'total': the old way, it always runs)
    if (b.budget === 'total' || (!s.transit && p && sameMap())) b.elapsed += dt;
    b.rattleCD -= dt;
    if (b.elapsed >= b.duration) return endBehaviour({ caught: false, escaped: true, reason: 'duration' });
    if (rt.rattle) return;
    // --- across maps: you took the stairs; it takes them after you
    if (s.transit) {
      const r = updateTransit(dt, b);
      if (r === 'fail') return endBehaviour({ caught: false, escaped: true, reason: 'map' });
      if (r === 'arrived' && p && sameMap()) {
        // it comes out knowing which way you went (unless you are hidden by now)
        b.last = p.hidden && !s.sawHide ? null : { x: p.x, y: p.y };
        b.wander = b.last ? null : { x: s.x, y: s.y };
        b.lostT = 0;
        rt.repathT = 0;
      }
      persistHunt();
      return;
    }
    if (!p || !sameMap()) {
      const link = b.follow ? exitToFollow('always') : null;
      if (link && beginTransit(link, b, 'hunt')) { persistHunt(); return; }
      return endBehaviour({ caught: false, escaped: true, reason: 'map' });
    }
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (b.giveUpDist != null && d > b.giveUpDist) return endBehaviour({ caught: false, escaped: true, reason: 'distance' });
    // --- perception (stronger: it hears further, and loses your trail for less long)
    const pk = power();
    const hearK = 1 + (pk - 1) * 0.8;
    const knows = p.hidden ? !!s.sawHide : (rt.seesNow && d <= CFG.seeHunt) || ((p.noise || 0) >= CFG.huntHearMin && d <= (p.noise || 0) * CFG.huntHearK * hearK);
    b.lostT = knows ? 0 : b.lostT + dt;
    // it does not lose you for long: unless you are hidden (unseen), it finds your trail again
    const reacquire = !knows && !p.hidden && b.lostT > 8 / pk;
    if (knows || reacquire) {
      const moved = !b.last || Math.hypot(b.last.x - p.x, b.last.y - p.y) > 0.6;
      b.last = { x: p.x, y: p.y };
      b.wander = null;
      if (reacquire) b.lostT = 0;
      if (moved) rt.repathT = Math.min(rt.repathT, 0.05);
    }
    // --- catch
    const reach = (p.hidden ? CFG.reachHidden : CFG.catchHunt) + catchAdd(pk);
    if (d <= reach && (!p.hidden || s.sawHide) && canReach(p.x, p.y, p.hidden)) { doCatch(p.hidden ? 'saw_hide' : 'hunt'); return; }
    // --- move
    const goal = b.wander || b.last;
    if (!goal) { b.idleT += dt; return; }
    rt.repathT -= dt;
    if (rt.repathT <= 0 || !rt.path) {
      rt.repathT = 0.35;
      const pl = plan(goal.x, goal.y, b.blocks);
      if (pl) setPath(pl); else setPath(null);
    }
    const st = rt.path ? follow(dt, b.speed, b.blocks, 0.18) : 'arrived';
    if (st === 'blocked') {
      const door = rt.blockedDoor;
      if (b.rattleCD <= 0) {
        b.rattleCD = U.rand(3.5, 6);
        startRattle(door, () => { rt.repathT = 0; });
      } else { setPath(null); }
      return;
    }
    if (st === 'arrived') {
      setPath(null);
      // reached where it last knew you were: cast about
      const m = emap();
      const reach2 = flood(m, s.x, s.y, b.blocks, 6);
      const opts2 = [];
      for (let i = 0; i < reach2.length; i++) if (reach2[i] >= 2 && reach2[i] <= 5 && m.door[i] < 0) opts2.push(i);
      if (opts2.length) {
        const i = U.choice(opts2);
        b.wander = { x: (i % m.w) + 0.5, y: ((i / m.w) | 0) + 0.5 };
        rt.repathT = 0;
      }
    }
    persistHunt();
  }

  /* ---- stalk */
  function stalk(on, opts) {
    const s = S();
    if (on === false) {
      if (rt.beh && rt.beh.kind === 'stalk') cutBehaviour('stop');
      s.stalk = null;
      return Promise.resolve({ caught: false, stopped: true });
    }
    if (!s.active) return Promise.resolve({ caught: false, stopped: true, inactive: true });
    const k = powerOf(opts);
    const speed = powSpeed((opts && +opts.speed) || 1.2, k, 2.4);
    return new Promise((resolve) => {
      startBehaviour({ kind: 'stalk', resolve, stopResult: { caught: false, stopped: true }, speed, unseenT: 0, seenT: 0, burst: 0,
        nextBurst: U.rand(0.35, 0.8), repathT: 0, power: k });
      s.stalk = { speed, power: k };
    });
  }
  /** Unobserved, it homes in on sound: running (0.8) makes it come ~1.4× as fast, standing still
   *  or crouching ~0.6–0.7× ("C to crouch. Running is loud."). */
  const stalkNoiseK = (p) => U.clamp(0.6 + (p.noise || 0) * 1.05, 0.6, 1.45);
  function updateStalk(dt, b) {
    const s = S(), p = P(), w = W();
    if (!p || !sameMap()) { b.unseenT = 0; return; }
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const seen = visible();
    const nk = stalkNoiseK(p);
    const catchR = CFG.catchStalk + catchAdd(power());
    if (seen) {
      b.seenT += dt;
      b.unseenT = 0;
      b.burst = 0;
      b.nextBurst = U.rand(0.3, 0.75) / (U.clamp(b.speed / 1.2, 0.4, 2.5) * nk);
      // you walked up to it while watching: let that land, then it comes apart and re-forms
      // somewhere behind you (it only ever closes the last metre unobserved)
      if (d < 0.75 || (d < 1.15 && b.seenT > 0.9)) relocateBehind(6.5, 10);
      return;
    }
    b.seenT = 0;
    b.unseenT += dt;
    if (d <= catchR && canReach(p.x, p.y, p.hidden)) { doCatch('stalk'); return; }
    rt.repathT -= dt;
    if (rt.repathT <= 0 || !rt.path) {
      rt.repathT = 0.5;
      const pl = plan(p.x, p.y, null);
      setPath(pl && !pl.door ? pl : null);
    }
    // far behind and nobody watching: skip forward out of sight
    if (b.unseenT > 2.2 && rt.path) {
      const L = pathLength();
      if (L > 15) {
        const q = alongPath(L - U.rand(8.5, 10.5));
        if (!pointOnScreen(q.x, q.y, 0.35)) { s.x = q.x; s.y = q.y; rt.lastX = s.x; rt.lastY = s.y; rt.hist.length = 0; rt.repathT = 0; b.unseenT = 0.5; return; }
      }
    }
    if (b.burst > 0) {
      const before = rt.moveAmt;
      const st = follow(dt, 4.6, null, 0);
      b.burst -= rt.moveAmt - before;
      if (st !== 'moving') b.burst = 0;
      if (Math.hypot(p.x - s.x, p.y - s.y) <= catchR && canReach(p.x, p.y, p.hidden)) doCatch('stalk');
      return;
    }
    if (b.unseenT >= b.nextBurst) {
      b.burst = U.rand(0.5, 1.5) * U.clamp(b.speed / 1.2, 0.5, 2) * U.clamp(nk, 0.75, 1.3);
      b.nextBurst = b.unseenT + U.rand(0.9, 1.6) / (U.clamp(b.speed / 1.2, 0.4, 2.5) * nk);
    }
  }
  /** Dissolve and re-form out of sight, between minD and maxD walking steps from the player. */
  function relocateBehind(minD, maxD) {
    const s = S(), p = P(), m = emap();
    if (!p || !m) return false;
    const dist = flood(m, p.x, p.y, null, Math.ceil(maxD) + 1);
    const cand = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < minD || dist[i] > maxD || m.door[i] >= 0) continue;
      const x = (i % m.w) + 0.5, y = ((i / m.w) | 0) + 0.5;
      if (pointOnScreen(x, y, 0.6)) continue;
      const behind = Math.abs(U.wrapAngle(Math.atan2(y - p.y, x - p.x) - p.angle));
      cand.push({ x, y, k: behind + Math.random() * 0.6 });
    }
    if (!cand.length) return false;
    cand.sort((a, b) => b.k - a.k);
    const c = cand[Math.floor(Math.random() * Math.min(4, cand.length))];
    audio('play', 'static_burst', { x: s.x, y: s.y, map: s.map, vol: 0.35 });
    const w = W();
    if (w && w.flickerNear) w.flickerNear(s.x, s.y, 0.8, s.map);
    s.x = c.x; s.y = c.y;
    rt.lastX = s.x; rt.lastY = s.y;
    rt.hist.length = 0;
    setPath(null);
    rt.repathT = 0;
    resample(true);
    return true;
  }

  /* ------------------------------------------------------------------ catch */
  function doCatch(how) {
    const s = S();
    if (s.caught || !s.active) return;
    const prevMode = s.mode;
    s.caught = true;
    const b = rt.beh;
    rt.beh = null;
    rt.rattle = null;
    setPath(null);
    s.target = null; s.search = null; s.hunt = null; s.stalk = null;
    setMode('caught');
    rt.caughtT = 0;
    rt.caughtFace = faceFrame();
    const p = P();
    if (p) {
      // it is simply there, in front of you
      const a = Math.atan2(s.y - p.y, s.x - p.x);
      s.x = p.x + Math.cos(a) * 0.5; s.y = p.y + Math.sin(a) * 0.5;
    }
    resample(true);
    if (DA.render) {
      try { DA.render.glitch(0.9, 0.9); DA.render.shake(0.55, 0.35); } catch (e) { /* ignore */ }
    }
    audio('stinger', 'glitch');
    DA.bus.emit('entity:caught', { map: s.map, x: s.x, y: s.y, room: roomOf(s.x, s.y, s.map), mode: prevMode, how });
    if (b && b.resolve) {
      const res = b.kind === 'search' ? true : b.kind === 'hunt' ? { caught: true, escaped: false, reason: 'caught' } : b.kind === 'stalk' ? { caught: true } : { arrived: false, caught: true };
      try { b.resolve(res); } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------------ spawn */
  function spawn(pt, mode, opts) {
    const p = resolvePoint(pt);
    if (!p) { console.warn('[entity] spawn: unknown point', pt); return false; }
    cutBehaviour('spawn');
    const s = S();
    if (opts && opts.danger != null) danger(opts.danger);
    const m = mapById(p.map);
    const st = m ? nearestStand(m, p.x, p.y, 3) || p : p;
    Object.assign(s, { active: true, map: p.map, x: st.x, y: st.y, angle: p.angle || 0, caught: false, sawHide: null, target: null, search: null, hunt: null, stalk: null, transit: null, hops: 0 });
    s.spawns = (s.spawns || 0) + 1;
    setMode('idle');
    rt.hist.length = 0;
    rt.longHist.length = 0;
    rt.stepAcc = 0;
    rt.lastX = s.x; rt.lastY = s.y;
    rt.flickT = U.rand(0.2, 0.8);
    rt.lastSeenT = -99;
    resample(true);
    DA.bus.emit('entity:spawn', { map: s.map, x: s.x, y: s.y, mode: mode || 'idle' });
    if (mode === 'stalk') stalk(true);
    else if (mode === 'hunt') hunt();
    else if (mode === 'search') search(null);
    else if (mode === 'move') { /* nothing to do: moveTo() is called separately */ }
    return true;
  }
  function despawn(opts) {
    const s = S();
    const was = s.active;
    cutBehaviour('despawn');
    rt.rattle = null;
    s.active = false;
    s.mode = 'idle';
    s.sawHide = null;
    danger(false);
    s.transit = null; s.hops = 0;
    s.target = null; s.search = null; s.hunt = null; s.stalk = null;
    setPath(null);
    if (opts && opts.all) cancelExtras();
    rt.ghosts.length = 0;
    rt.face = null;
    stopBreath();
    restoreAmbience();
    rt.staticBump = 0;
    if (was) DA.bus.emit('entity:despawn', {});
  }

  /* ------------------------------------------------------------------ window */
  /** The radio-room window glass: {map, x, y (wall cell centre), inX, inY, outX, outY}. */
  function windowSpot() {
    const w = W();
    const m = mapById('station');
    const pick = [];
    const f = DA.interact && DA.interact.find ? DA.interact.find('radio_window') : null;
    const addFace = (x, y, side) => {
      const d = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[side || 'e'];
      pick.push({ map: 'station', x: x + 0.5, y: y + 0.5, inX: x + 0.5 + d[0] * 0.56, inY: y + 0.5 + d[1] * 0.56, outX: x + 0.5 - d[0] * 0.95, outY: y + 0.5 - d[1] * 0.95 });
    };
    if (f && f.it) {
      addFace(f.it.x, f.it.y, f.it.side);
      for (const c of f.it.cells || []) addFace(c[0], c[1], c[2] || f.it.side);
    } else if (m && w && w.texName && DA.textures) {
      // any window face that looks into the radio room
      const ri = m.rooms.indexOf('radio');
      const faces = [m.wallN, m.wallE, m.wallS, m.wallW], dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], names = ['n', 'e', 's', 'w'];
      for (let i = 0; i < m.w * m.h && ri > 0; i++) {
        if (!m.wall[i]) continue;
        for (let k = 0; k < 4; k++) {
          const tn = w.texName(faces[k][i]) || '';
          if (!/window/.test(tn)) continue;
          const x = i % m.w, y = (i / m.w) | 0, nx = x + dirs[k][0], ny = y + dirs[k][1];
          if (m.room[ny * m.w + nx] === ri) addFace(x, y, names[k]);
        }
      }
    }
    // the radio_window interactable's own cell: the pane nearest the desk
    return pick.length ? pick[0] : null;
  }
  function windowFn(on) {
    const s = S(), ws = s.window;
    on = on !== false;
    if (on) {
      if (!ws.on || ws.x == null) {
        const spot = windowSpot();
        if (!spot) { console.warn('[entity] window: no radio-room window found'); return Promise.resolve(false); }
        Object.assign(ws, { x: spot.x, y: spot.y, inX: spot.inX, inY: spot.inY, outX: spot.outX, outY: spot.outY });
      }
      ws.on = true;
      if (!ws.knocked) {
        ws.knocked = true;
        audio('play', 'window_knock', { x: ws.inX, y: ws.inY, map: 'station', count: 3, vol: 1 });
        const w = W();
        if (w && w.flickerNear) w.flickerNear(ws.inX, ws.inY, 1.2, 'station');
      }
    } else ws.on = false;
    DA.bus.emit('entity:window', { on });
    if (rt.winPromise) rt.winPromise.resolve(false);
    return new Promise((resolve) => { rt.winPromise = { resolve, target: on ? 1 : 0 }; });
  }
  function updateWindow(dt) {
    const ws = S().window;
    const target = ws.on ? 1 : 0;
    if (ws.amount !== target) {
      const rate = ws.on ? dt / 1.6 : dt / 0.9;
      ws.amount = target > ws.amount ? Math.min(target, ws.amount + rate) : Math.max(target, ws.amount - rate);
    }
    if (rt.winPromise && Math.abs(ws.amount - rt.winPromise.target) < 1e-3) { const r = rt.winPromise; rt.winPromise = null; r.resolve(true); }
    const m = mapById('station');
    if (!m) return;
    if (ws.amount > 0.001 && ws.x != null) {
      rt.winT += dt;
      // it breathes against the glass; now and then it is not quite there
      let a = ws.amount * (0.9 + 0.1 * Math.sin(rt.winT * 1.9));
      if (Math.random() < dt * 0.6) a *= 0.35;
      m.windowFigure = { x: ws.x, y: ws.y, amount: U.clamp(a, 0, 1) };
    } else if (m.windowFigure) m.windowFigure = null;
  }

  /** Everything else that is still pending goes too: glimpses waiting to be seen or showing
   *  resolve {seen:false} and vanish; the window figure is gone at once (its promise resolves). */
  function cancelExtras() {
    const gl = rt.glimpses.splice(0);
    for (const g of gl) { try { g.resolve({ seen: false, cancelled: true }); } catch (e) { /* ignore */ } }
    const ws = S().window;
    if (ws.on || ws.amount > 0) { ws.on = false; ws.amount = 0; DA.bus.emit('entity:window', { on: false }); }
    const m = mapById('station');
    if (m && m.windowFigure) m.windowFigure = null;
    if (rt.winPromise) { const r = rt.winPromise; rt.winPromise = null; try { r.resolve(true); } catch (e) { /* ignore */ } }
  }

  /* ------------------------------------------------------------------ glimpses (flicker) */
  function flicker(pt, secs, opts) {
    opts = opts || {};
    const behind = pt === 'behind';
    const p = resolvePoint(pt);
    if (!p) { console.warn('[entity] flicker: unknown point', pt); return Promise.resolve({ seen: false }); }
    const pl = P();
    return new Promise((resolve) => {
      const g = { map: p.map, x: p.x, y: p.y, secs: secs == null ? 0.4 : +secs, t: 0, shown: !opts.whenSeen, seen: false,
        whenSeen: !!opts.whenSeen, timeout: opts.timeout != null ? +opts.timeout : opts.whenSeen ? 30 : Infinity, waited: 0,
        follow: behind && !!opts.whenSeen, a0: pl ? pl.angle : 0, stinger: opts.stinger || null, resolve,
        parts: [], sampleT: 0 };
      rt.glimpses.push(g);
      sampleGlimpse(g);
      if (g.shown) glimpseShown(g);
    });
  }
  function glimpseShown(g) {
    const w = W();
    if (w && w.flickerNear) w.flickerNear(g.x, g.y, Math.max(0.5, g.secs + 0.3), g.map);
    if (g.stinger) audio('stinger', g.stinger);
  }
  function sampleGlimpse(g) {
    g.sampleT = 1 / U.rand(8, 12);
    g.parts = [{ x: g.x, y: g.y, frame: U.randInt(0, 3), flip: Math.random() < 0.5, alpha: U.rand(0.7, 1) }];
    const m = mapById(g.map);
    const n = U.randInt(1, 3);
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 4; t++) {
        const a = Math.random() * TAU, r = U.rand(0.25, 0.9);
        const x = g.x + Math.cos(a) * r, y = g.y + Math.sin(a) * r;
        if (m && !passable(m, idxOf(m, x, y))) continue;
        g.parts.push({ x, y, frame: U.randInt(0, 3), flip: Math.random() < 0.5, alpha: U.rand(0.2, 0.55) });
        break;
      }
    }
  }
  function updateGlimpses(dt) {
    for (let i = rt.glimpses.length - 1; i >= 0; i--) {
      const g = rt.glimpses[i];
      g.sampleT -= dt;
      if (g.sampleT <= 0) sampleGlimpse(g);
      if (!g.shown) {
        const p = P();
        if (g.follow && p) {
          // stay behind the player until they start to turn (or walk off)
          if (g.px == null) { g.px = p.x; g.py = p.y; }
          if (Math.abs(U.wrapAngle(p.angle - g.a0)) < 0.22 && Math.hypot(p.x - g.px, p.y - g.py) < 1.2) {
            const q = relPoint(Math.PI, 1.4);
            if (q) { g.x = q.x; g.y = q.y; g.map = q.map; }
          } else g.follow = false;
        }
        // the clock only runs while you are not turning toward it (a slow, careful turn counts)
        const off = p ? Math.abs(U.wrapAngle(Math.atan2(g.y - p.y, g.x - p.x) - p.angle)) : 0;
        const turning = g.prevOff != null && off < g.prevOff - dt * 0.15;
        g.prevOff = off;
        if (!turning) g.waited += dt;
        // shown only once it is really in front of you: its main part well inside the view, not
        // a stray possible position at the edge
        const main = g.parts[0];
        const on = W() && W().mapId === g.map && inView(main.x, main.y, 0.78);
        if (on) { g.shown = true; g.seen = true; glimpseShown(g); DA.bus.emit('entity:glimpse', { seen: true, x: g.x, y: g.y }); }
        else if (g.waited >= g.timeout) { rt.glimpses.splice(i, 1); g.resolve({ seen: false }); }
        continue;
      }
      g.t += dt;
      if (!g.seen && g.parts.some((q) => (W() && W().mapId === g.map) && pointOnScreen(q.x, q.y, 0.25))) g.seen = true;
      if (g.t >= g.secs) { rt.glimpses.splice(i, 1); g.resolve({ seen: g.seen }); }
    }
  }

  /* ------------------------------------------------------------------ faces */
  /**
   * Which face surfaces (spr_entity_face frame): 0 many faces smeared together; 1 her (heard the
   * woman / the girl / the child on the radio); 2 Hollis; 3 you (more often the deeper the night).
   */
  let facePool = null, facePoolT = -99;
  function faceFrame() {
    if (!facePool || rt.time - facePoolT > 5) {
      facePoolT = rt.time;
      const pool = [0, 0, 0];
      let heard = false;
      try {
        const L = DA.radio && DA.radio.entries ? DA.radio.entries() : [];
        heard = (L || []).some((e) => /^tx_(woman|girl|child)/.test(String(e && e.txId)));
      } catch (e) { heard = false; }
      const act = (DA.state && DA.state.act) | 0;
      if (heard) pool.push(1, 1);
      if (act >= 1) pool.push(2);
      if (act >= 3 || (DA.flag && DA.flag('photo_four'))) pool.push(3, 3);
      if (act >= 4) pool.push(3, 3, 3);
      facePool = pool;
    }
    return U.choice(facePool);
  }

  /* ------------------------------------------------------------------ ghosts */
  const pickFrame = (avoid) => { let f = U.randInt(0, 3); if (f === avoid) f = (f + U.randInt(1, 3)) % 4; return f; };
  function histAt(age) {
    const h = rt.hist;
    if (!h.length) return null;
    const t = rt.time - age;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i];
    return h[0];
  }
  /** One possible position near the true one. */
  function sampleGhost(kind, spreadK) {
    const s = S(), m = emap();
    const spread = CFG.ghostSpread * spreadK;
    const within = (x, y) => Math.hypot(x - s.x, y - s.y) <= spread;
    if (kind === 'hist') {
      const q = histAt(U.rand(0.2, 2.6));
      if (q && Math.hypot(q.x - s.x, q.y - s.y) > 0.18 && within(q.x, q.y)) return { x: q.x, y: q.y, kind };
      kind = 'offset';
    }
    if (kind === 'ahead') {
      if (rt.path) {
        const q = alongPath(U.rand(0.3, spread));
        if (Math.hypot(q.x - s.x, q.y - s.y) > 0.18) return { x: q.x, y: q.y, kind };
      }
      kind = 'offset';
    }
    if (kind === 'wall' && m) {
      // a hand laid on the nearest wall
      let best = null;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        for (let r = 0.3; r <= 1.2; r += 0.1) {
          const i = idxOf(m, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
          if (i < 0) break;
          if (m.wall[i]) { if (!best || r < best.r) best = { a, r }; break; }
          if (m.solid[i]) break;
        }
      }
      if (best && best.r > 0.34) {
        const r = best.r - 0.26;
        const x = s.x + Math.cos(best.a) * r, y = s.y + Math.sin(best.a) * r;
        if (los(s.x, s.y, x, y, s.map)) return { x, y, kind, frame: Math.random() < 0.6 ? 1 : 2 };
      }
      kind = 'offset';
    }
    // a step to one side (it stands in more than one place)
    for (let t = 0; t < 5; t++) {
      const a = Math.random() * TAU, r = U.rand(0.3, Math.min(1.25, spread));
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
      if (!m) return { x, y, kind: 'offset' };
      const i = idxOf(m, x, y);
      const onVoid = i >= 0 && m.pit[i] && !m.wall[i];
      if (!passable(m, i) && !(onVoid && s.mode === 'stalk' && Math.random() < 0.3)) continue;
      if (!los(s.x, s.y, x, y, s.map) && !onVoid) continue;
      return { x, y, kind: onVoid ? 'void' : 'offset' };
    }
    return null;
  }
  /** Re-sample what you see (8–12 Hz): its pose, 2–4 possible positions, sometimes a face. */
  function resample(force) {
    const s = S();
    rt.ghostT = 1 / U.rand(8, 12);
    if (!s.active) { rt.ghosts.length = 0; rt.face = null; return; }
    const I = intensityNow();
    const moving = rt.movingT > 0;
    const main = rt.main;
    if (force || Math.random() < 0.38) main.frame = pickFrame(main.frame);
    if (Math.random() < 0.18) main.flip = !main.flip;
    main.alpha = Math.random() < 0.82 ? 1 : U.rand(0.62, 0.92);
    main.darkFace = Math.random() < 0.38;
    main.faceFrame = main.darkFace ? faceFrame() : 0;
    main.x = s.x; main.y = s.y;
    const spreadK = U.clamp(0.55 + I * 0.45, 0.4, 1.25);
    let n = 2 + (Math.random() < 0.55 * I ? 1 : 0) + (Math.random() < 0.3 * I ? 1 : 0);
    if (Math.random() < 0.07) n--;
    if (s.mode === 'caught') n = 4;
    rt.ghosts.length = 0;
    const pl = P();
    const dTrue = pl ? Math.hypot(pl.x - s.x, pl.y - s.y) : 99;
    for (let k = 0; k < n; k++) {
      const r = Math.random();
      const kind = moving ? (r < 0.34 ? 'hist' : r < 0.68 ? 'ahead' : r < 0.9 ? 'offset' : 'wall')
        : s.mode === 'stalk' ? (r < 0.4 ? 'ahead' : r < 0.6 ? 'hist' : r < 0.85 ? 'offset' : 'wall')
          : (r < 0.2 ? 'hist' : r < 0.72 ? 'offset' : 'wall');
      const g = sampleGhost(kind, spreadK);
      if (!g) continue;
      // possible positions never pass through you
      if (pl && sameMap() && Math.hypot(g.x - pl.x, g.y - pl.y) < Math.min(0.9, dTrue * 0.8)) continue;
      g.frame = g.frame != null ? g.frame : pickFrame(k === 0 ? main.frame : -1);
      g.flip = Math.random() < 0.5;
      g.alpha = U.rand(0.24, 0.62) * (g.kind === 'void' ? 0.7 : 1);
      g.darkFace = Math.random() < 0.22;
      g.faceFrame = g.darkFace ? faceFrame() : 0;
      rt.ghosts.push(g);
    }
    // sometimes the one that is "really" there is one of the others
    if (rt.ghosts.length && Math.random() < 0.12 * I) {
      const g = rt.ghosts[0];
      const tx = main.x, ty = main.y;
      main.x = g.x; main.y = g.y;
      g.x = tx; g.y = ty;
    }
    // up close, a face surfaces
    rt.face = null;
    const d = playerDist();
    if (s.mode !== 'caught' && d < 2.6 && Math.random() < 0.17 * I) {
      const src = Math.random() < 0.5 || !rt.ghosts.length ? main : rt.ghosts[0];
      // where its face should be — only now there is one
      const scale = U.rand(0.2, 0.25);
      rt.face = { x: src.x, y: src.y, alpha: 1, scale, z: 0.9 - scale / 2, frame: faceFrame() };
    }
  }

  /* ------------------------------------------------------------------ visibility */
  function camInfo() {
    const w = W();
    if (!w || !w.camera) return null;
    try { return w.camera(); } catch (e) { return null; }
  }
  function worldCovered() {
    const st = DA.modes && DA.modes.stack;
    return !!(st && st.some((e) => e.def && e.def.opaque));
  }
  /** Is a (sprite at) world point on the player's screen right now (FOV + line of sight)? */
  function pointOnScreen(x, y, halfW) {
    const w = W(), cam = camInfo();
    if (!w || !cam || !DA.running || worldCovered()) return false;
    const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy);
    if (d > 40 || d < 0.1) return false;
    const fov = ((cam.fov || (DA.settings && DA.settings.fov) || 66) * Math.PI) / 180;
    const off = Math.abs(U.wrapAngle(Math.atan2(dy, dx) - cam.angle));
    if (off > fov / 2 + Math.atan2(halfW == null ? 0.22 : halfW, d)) return false;
    // forward depth must be positive (the renderer culls tz < 0.06)
    if (Math.cos(off) * d < 0.06) return false;
    return los(cam.x, cam.y, x, y, w.mapId);
  }
  /** Is (x, y) within `frac` of the half field of view (and in line of sight)? Stricter than
   *  pointOnScreen: for "they really saw it". */
  function inView(x, y, frac) {
    const w = W(), cam = camInfo();
    if (!w || !cam || !DA.running || worldCovered()) return false;
    const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy);
    if (d > 40 || d < 0.1) return false;
    const fov = ((cam.fov || (DA.settings && DA.settings.fov) || 66) * Math.PI) / 180;
    const off = Math.abs(U.wrapAngle(Math.atan2(dy, dx) - cam.angle));
    if (off > (fov / 2) * (frac == null ? 1 : frac)) return false;
    return los(cam.x, cam.y, x, y, w.mapId);
  }
  function parts() {
    const s = S(), out = [{ x: s.x, y: s.y }];
    if (rt.main) out.push({ x: rt.main.x, y: rt.main.y });
    for (const g of rt.ghosts) out.push(g);
    if (rt.face) out.push(rt.face);
    return out;
  }
  function visible() {
    const s = S();
    if (!s.active || !DA.running || inTransit()) return false;
    const w = W();
    if (!w || w.mapId !== s.map) return false;
    const key = rt.frameN;
    if (rt.vis.key === key) return rt.vis.v;
    const v = parts().some((q) => pointOnScreen(q.x, q.y, 0.22));
    rt.vis.key = key;
    rt.vis.v = v;
    return v;
  }

  /* ------------------------------------------------------------------ presence */
  function ensureBreath(x, y, map, vol) {
    if (!DA.audio || !DA.audio.loop) return;
    if (!rt.breath) {
      rt.breath = audio('loop', 'breath_other', { x, y, map, vol: 0, mirror: true, fadeIn: 0.6 });
      if (!rt.breath) return;
    }
    try { rt.breath.setPos(x, y, map); rt.breath.setVol(vol); } catch (e) { /* ignore */ }
  }
  function stopBreath() {
    if (rt.breath) { try { rt.breath.stop(0.8); } catch (e) { /* ignore */ } rt.breath = null; }
  }
  /** Merge our drone/heartbeat over whatever the world/director last set (never lower them). */
  function applyAmbience(drone, hb) {
    const A = DA.audio;
    if (!A || !A.ambience) return;
    let cur = null;
    try { cur = A.ambience(); } catch (e) { cur = null; }
    if (!cur) return;
    const a = rt.amb;
    const cd = +cur.drone || 0, ch = +cur.heartbeat || 0;
    if (a.lastDrone == null || Math.abs(cd - a.lastDrone) > 1e-3) a.baseDrone = cd;
    if (a.lastHb == null || Math.abs(ch - a.lastHb) > 1e-3) a.baseHb = ch;
    const wd = Math.max(a.baseDrone, drone), wh = Math.max(a.baseHb, hb);
    if (Math.abs(wd - cd) > 0.008 || Math.abs(wh - ch) > 0.008) {
      audio('ambience', { drone: +wd.toFixed(3), heartbeat: +wh.toFixed(3) });
      a.lastDrone = +wd.toFixed(3);
      a.lastHb = +wh.toFixed(3);
    } else { a.lastDrone = cd; a.lastHb = ch; }
    a.touched = true;
  }
  function restoreAmbience() {
    const a = rt.amb;
    if (!a.touched) return;
    const A = DA.audio;
    let cur = null;
    try { cur = A && A.ambience ? A.ambience() : null; } catch (e) { cur = null; }
    const patch = {};
    if (cur && a.lastDrone != null && Math.abs((+cur.drone || 0) - a.lastDrone) < 1e-3) patch.drone = a.baseDrone || 0;
    if (cur && a.lastHb != null && Math.abs((+cur.heartbeat || 0) - a.lastHb) < 1e-3) patch.heartbeat = a.baseHb || 0;
    if (Object.keys(patch).length) audio('ambience', patch);
    Object.assign(a, { lastDrone: null, lastHb: null, baseDrone: 0, baseHb: 0, touched: false });
  }
  function deskPos() {
    if (rt.deskPos) return rt.deskPos;
    const f = DA.interact && DA.interact.find ? DA.interact.find('radio_desk') : null;
    if (f && f.it) {
      const d = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[f.it.side || 's'] || [0, 1];
      rt.deskPos = { map: f.map, x: f.it.x + 0.5 + d[0] * 0.6 + (f.it.cells && f.it.cells.length ? 0.5 : 0), y: f.it.y + 0.5 + d[1] * 0.6 };
    } else {
      const w = W(), p = w && w.point ? w.point('pt_desk_stand') : null;
      rt.deskPos = p ? { map: p.map, x: p.x, y: p.y - 0.8 } : { map: 'station', x: 17, y: 9.6 };
    }
    return rt.deskPos;
  }
  function footstep(s) {
    const m = emap(), w = W();
    const i = idxOf(m, s.x, s.y);
    const floor = m && i >= 0 && w && w.texName ? w.texName(m.floor[i]) : '';
    const surface = FOOT_SURFACE[floor] || 'concrete';
    const hard = s.mode === 'hunt' || (rt.beh && rt.beh.rush);
    const opts = { x: s.x, y: s.y, map: s.map, surface, vol: hard ? 1 : 0.82, rate: U.rand(0.8, 0.97), weight: 1.3 };
    audio('play', 'footstep_other', opts);
    if (Math.random() < 0.14) audio('play', 'footstep_other', Object.assign({}, opts, { delay: U.rand(0.1, 0.16), vol: opts.vol * 0.7 }));
  }
  function presence(dt) {
    const s = S(), w = W();
    const d = playerDist();
    const through = inTransit();
    const same = s.active && sameMap() && !through;
    // --- footsteps at an irregular stride
    const moved = Math.hypot(s.x - rt.lastX, s.y - rt.lastY);
    rt.lastX = s.x; rt.lastY = s.y;
    if (s.active && moved > 1e-4 && moved < 2) {
      rt.movingT = 0.35;
      rt.stepAcc += moved;
      if (rt.stepAcc >= CFG.stride) {
        rt.stepAcc -= CFG.stride * U.rand(0.8, 1.15);
        if (Math.random() > 0.08) footstep(s);
      }
    } else rt.movingT -= dt;
    // --- lights stutter around it
    rt.flickT -= dt;
    if (s.active && !through && rt.flickT <= 0 && s.mode !== 'caught') {
      const threat = THREAT[s.mode] ? 1 : 0;
      rt.flickT = rt.movingT > 0 ? U.rand(1.1, 2.3) - threat * 0.4 : U.rand(2.8, 6);
      if (w && w.flickerNear) w.flickerNear(s.x, s.y, U.rand(0.8, 1.7), s.map);
    }
    // --- breathing, drone, heartbeat
    if (same && d < CFG.breathDist + 0.5 && s.mode !== 'caught') ensureBreath(s.x, s.y, s.map, U.clamp((CFG.breathDist + 0.3 - d) / 2.3, 0, 1) * 0.95);
    else stopBreath();
    let drone = 0, hb = 0;
    if (s.active) {
      drone = same ? 0.16 + 0.64 * (1 - U.smoothstep(1.2, 14, d)) : through ? 0.22 : 0.1;
      if (same && (THREAT[s.mode] || s.mode === 'caught')) hb = 0.85 * (1 - U.smoothstep(1.5, 7, d));
    }
    const ws = s.window;
    if (ws.amount > 0.01 && w && w.mapId === 'station') {
      const p = P();
      const wd = p && ws.inX != null ? Math.hypot(p.x - ws.inX, p.y - ws.inY) : 99;
      drone = Math.max(drone, ws.amount * (0.3 + 0.35 * (1 - U.smoothstep(1, 8, wd))));
    }
    if (s.active || ws.amount > 0.01 || rt.amb.touched) {
      if (!s.active && ws.amount <= 0.01) restoreAmbience();
      else applyAmbience(drone, hb);
    }
    // --- the desk speaker coughs static when it is near the receiver
    rt.staticBump = 0;
    if (s.active && !through && s.map === 'station') {
      const dp = deskPos();
      const dd = Math.hypot(s.x - dp.x, s.y - dp.y);
      if (dd < 5.5) {
        const prox = 1 - U.smoothstep(1, 5.5, dd);
        rt.staticBump = prox * 0.75;
        rt.staticT -= dt;
        if (rt.staticT <= 0) {
          rt.staticT = U.rand(0.7, 2.6) * (1.2 - prox * 0.7);
          if (!DA.radio || DA.radio.power !== false) audio('play', 'static_burst', { x: dp.x, y: dp.y, map: dp.map, radio: true, vol: 0.25 + 0.55 * prox });
        }
      }
    }
  }
  function applyStaticBump() {
    if (!(rt.staticBump > 0.02) || !DA.running) return;
    const A = DA.audio, R = DA.radio;
    if (!A || !A.radioStatic || (R && R.power === false)) return;
    const at = R && R.atDesk ? R.atDesk() : false;
    const w = W();
    const aud = at ? 1 : w && w.radioAudibility ? w.radioAudibility() : 0;
    // roughly what the radio itself asked for this frame, so we only ever add to it
    const b = R && R.best ? R.best() : null;
    const base = ((1 - (b ? b.clarity || 0 : 0)) * 0.8 + 0.1) * aud;
    const lvl = Math.max(base, rt.staticBump * (0.55 + 0.45 * Math.random()) * aud);
    const vol = DA.state.radio && DA.state.radio.volume != null ? DA.state.radio.volume : 0.8;
    audio('radioStatic', U.clamp(lvl, 0, 1), { vol, tone: Math.random() * 0.3 });
  }

  /* ------------------------------------------------------------------ system */
  function update(dt) {
    if (!DA.running) return;
    rt.time += dt;
    rt.frameN++;
    const s = S(), p = P();
    // --- does it have you in sight? (for hunts, and for "it saw you hide")
    rt.seesNow = false;
    if (s.active && p && sameMap() && !p.hidden && !inTransit()) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d <= CFG.seeHunt && los(s.x, s.y, p.x, p.y, s.map)) {
        rt.seesNow = true;
        if (d <= CFG.seeHide) rt.lastSeenT = rt.time;
      }
    }
    // --- behaviour
    if (s.active) {
      if (rt.rattle) updateRattle(dt);
      const b = rt.beh;
      if (b && s.mode !== 'caught') {
        if (b.kind === 'move' && !rt.rattle) updateMove(dt, b);
        else if (b.kind === 'search') updateSearch(dt, b);
        else if (b.kind === 'hunt') updateHunt(dt, b);
        else if (b.kind === 'stalk' && !rt.rattle) updateStalk(dt, b);
      }
      // lethal contact: a lethal walk — or, while danger() is on, the entity standing idle — that
      // touches an unhidden player catches them (hunt / search / rush catch by their own rules;
      // the stalker's rule — only ever unobserved — is kept)
      if (s.active && s.mode !== 'caught' && !s.caught) {
        const b2 = rt.beh;
        if (b2 ? b2.kind === 'move' && b2.lethal : !!s.danger) contactCatch(b2 && b2.rush ? 'rush' : 'contact');
      }
      if (s.mode === 'caught') rt.caughtT += dt;
      // history for the ghosts (10 Hz, 4 s) and the CCTV past (1 Hz, 150 s)
      rt.histT -= dt;
      if (rt.histT <= 0) {
        rt.histT = 0.1;
        rt.hist.push({ t: rt.time, x: s.x, y: s.y });
        if (rt.hist.length > 42) rt.hist.shift();
      }
      rt.ghostT -= dt;
      if (rt.ghostT <= 0) resample(false);
    }
    rt.longT -= dt;
    if (rt.longT <= 0) {
      rt.longT = 1;
      rt.longHist.push({ t: rt.time, active: !!s.active, map: s.map, x: s.x, y: s.y });
      if (rt.longHist.length > 160) rt.longHist.shift();
    }
    presence(dt);
    updateWindow(dt);
    if (rt.glimpses.length) updateGlimpses(dt);
    // where you were a moment ago (a map change places you on the new map before it is announced)
    const w = W();
    if (p && w) { if (!rt.plPos) rt.plPos = {}; rt.plPos.map = w.mapId; rt.plPos.x = p.x; rt.plPos.y = p.y; }
  }

  /* ------------------------------------------------------------------ sprites */
  const jitterA = (a, k) => a * (1 - k + k * Math.random());
  /** A body part sprite (its ghosts inherit its fields). `emissive: CFG.glow` so its rim still
   *  shows where the building's emissives are dimmed (main power off) or there is no light — its
   *  own glow, not the building's; the body texels take world light and stay dark. Used for the
   *  present entity, CCTV/predict sprites, glimpses and the window figure (views included). */
  function bodySprite(x, y, frame, flip, alpha, ghosts, extra) {
    return Object.assign({ x, y, tex: 'spr_entity', frame, flip, alpha, ghosts, id: 'entity', emissive: CFG.glow }, extra || {});
  }
  /** In the dark its body is black on black; what shows is its pale rim (emissive, baked into
   *  spr_entity) and, now and then, a pale face hung where a head should be (headFace). Dark =
   *  over the void, the building's power off (map.emissive < 0.5) or cell light < 0.3. */
  function darkHere(x, y) {
    const m = emap();
    if (!m) return false;
    if (m.sky === false) return true; // over the void there is nothing to see a black shape against
    if (m.emissive != null && m.emissive < 0.5) return true; // main power off
    const i = idxOf(m, x, y);
    const L = i >= 0 && m.light ? m.light[i] * (m.tint ? Math.max(m.tint[0], m.tint[1], m.tint[2]) : 1) : 1;
    return L < 0.3;
  }
  /** A pale face hung at head height over a body part, nudged toward the viewer so it draws on top.
   *  Its pale skin glows (spr_entity_face is emissive there); hair / brim / collar stay dark. */
  function headFace(out, x, y, alpha, scale, frame) {
    const cam = camInfo();
    let fx = x, fy = y;
    if (cam) { const d = Math.hypot(cam.x - x, cam.y - y) || 1; fx += ((cam.x - x) / d) * 0.03; fy += ((cam.y - y) / d) * 0.03; }
    out.push({ x: fx, y: fy, tex: 'spr_entity_face', frame: frame | 0, scale, z: 0.9 - scale / 2, alpha, emissive: CFG.glow, id: 'entity_face' });
  }
  function presentSprites(out, view) {
    const s = S(), m = rt.main;
    const ghosts = rt.ghosts.map((g) => ({ x: g.x, y: g.y, frame: g.frame, flip: g.flip, alpha: jitterA(g.alpha, 0.5) }));
    const dark = darkHere(m.x, m.y);
    // the body is lit like anything else (world light, the flashlight): near black, and in the
    // dark black on black; its pale rim and face smear glow by themselves (sprite emissive
    // CFG.glow, whatever the station power — the same on a CCTV feed)
    out.push(bodySprite(m.x, m.y, m.frame, m.flip, m.alpha >= 1 ? 1 : jitterA(m.alpha, 0.2), ghosts, null));
    if (dark && !view && s.mode !== 'caught') {
      // black on black: now and then a pale face surfaces where a head should be (an accent —
      // the rim is what shows the shape)
      if (m.darkFace) headFace(out, m.x, m.y, jitterA(0.85, 0.3), 0.2, m.faceFrame);
      for (const g of rt.ghosts) if (g.darkFace) headFace(out, g.x, g.y, jitterA(Math.min(1, g.alpha * 1.3), 0.45), 0.18, g.faceFrame);
    }
    if (rt.face && !view) {
      const f = rt.face;
      const cam = camInfo();
      let fx = f.x, fy = f.y;
      if (cam) { const dd = Math.hypot(cam.x - f.x, cam.y - f.y) || 1; fx += ((cam.x - f.x) / dd) * 0.05; fy += ((cam.y - f.y) / dd) * 0.05; }
      out.push({ x: fx, y: fy, tex: 'spr_entity_face', frame: f.frame | 0, scale: f.scale, z: f.z, alpha: jitterA(f.alpha, 0.2), emissive: CFG.glow, id: 'entity_face' });
    }
    if (s.mode === 'caught' && rt.caughtT < 1.2 && !view) {
      const cam = camInfo();
      if (cam) {
        const d = 0.62;
        out.push({ x: cam.x + Math.cos(cam.angle) * d, y: cam.y + Math.sin(cam.angle) * d, tex: 'spr_entity_face', frame: rt.caughtFace | 0, scale: 0.46,
          z: (cam.z || 0.5) - 0.24, alpha: 1, fullbright: true, id: 'entity_face' });
      }
    }
  }
  function provider(mapId, o) {
    const out = [];
    const s = S();
    const view = !!(o && o.view);
    // the figure at the window, seen from outside
    const ws = s.window;
    if (mapId === 'station' && ws.amount > 0.25 && ws.outX != null) {
      out.push(bodySprite(ws.outX, ws.outY, 2, Math.random() < 0.5, ws.amount * U.rand(0.75, 1), [
        { x: ws.outX + U.rand(-0.35, 0.35), y: ws.outY + U.rand(-0.3, 0.3), frame: U.randInt(0, 3), alpha: ws.amount * 0.35 },
      ]));
    }
    if (s.active && s.map === mapId && !inTransit()) {
      if (view && DA.flag && DA.flag('cctv_offsets')) {
        const supplied = o.sprites && o.sprites.some((sp) => sp && typeof sp.tex === 'string' && sp.tex.indexOf('spr_entity') === 0);
        if (!supplied) {
          // a live feed with an offset: where it stood two minutes ago
          const t = rt.time - 120;
          let q = null;
          for (let i = rt.longHist.length - 1; i >= 0; i--) if (rt.longHist[i].t <= t) { q = rt.longHist[i]; break; }
          if (q && q.active && q.map === mapId) out.push(bodySprite(q.x, q.y, U.randInt(0, 3), Math.random() < 0.5, 0.9, [
            { x: q.x + U.rand(-0.6, 0.6), y: q.y + U.rand(-0.6, 0.6), frame: U.randInt(0, 3), alpha: 0.4 },
          ]));
        }
      } else presentSprites(out, view);
    }
    for (const g of rt.glimpses) {
      if (!g.shown || g.map !== mapId || view) continue;
      const main = g.parts[0];
      out.push(bodySprite(main.x, main.y, main.frame, main.flip, jitterA(main.alpha, 0.3),
        g.parts.slice(1).map((q) => ({ x: q.x, y: q.y, frame: q.frame, flip: q.flip, alpha: jitterA(q.alpha, 0.5) }))));
    }
    return out;
  }

  /* ------------------------------------------------------------------ predict */
  function predict(sec) {
    const s = S();
    if (!s.active) return [];
    sec = Math.max(0, +sec || 0);
    let q = { x: s.x, y: s.y };
    const b = rt.beh;
    let ahead = 0;
    const T = s.transit;
    if (T) {
      // on the stairs: by then it will have come out at the far end (or still be out of sight)
      const eta = transitETA();
      if (sec >= eta) {
        const m2 = mapById(T.to);
        const g = [];
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * TAU, r = U.rand(0.3, 0.9), gx = T.ax + Math.cos(a) * r, gy = T.ay + Math.sin(a) * r;
          if (!m2 || passable(m2, idxOf(m2, gx, gy))) g.push({ x: gx, y: gy, frame: U.randInt(0, 3), flip: Math.random() < 0.5, alpha: U.rand(0.25, 0.5) });
        }
        return [Object.assign(bodySprite(T.ax, T.ay, U.randInt(0, 3), Math.random() < 0.5, 0.95, g), { map: T.to })];
      }
      if (T.phase === 'through') return [];
    }
    if (b && rt.path && s.mode !== 'caught') {
      const sp = T ? transitSpeed(b) : b.kind === 'stalk' ? b.speed : b.rush ? CFG.rushSpeed : b.speed || 1.1;
      ahead = sp * sec;
      q = alongPath(ahead);
    }
    const ghosts = [];
    const m = emap();
    for (let k = 0; k < 2; k++) {
      let x, y;
      if (ahead > 0) { const g = alongPath(Math.max(0, ahead + (k ? 1 : -1) * U.rand(0.4, 1.2))); x = g.x; y = g.y; }
      if (x == null || Math.hypot(x - q.x, y - q.y) < 0.2) {
        for (let t = 0; t < 6; t++) {
          const a = Math.random() * TAU, r = U.rand(0.3, 1.1);
          const cx = q.x + Math.cos(a) * r, cy = q.y + Math.sin(a) * r;
          if (m && !passable(m, idxOf(m, cx, cy))) continue;
          x = cx; y = cy;
          break;
        }
      }
      if (x == null) continue;
      ghosts.push({ x, y, frame: U.randInt(0, 3), flip: Math.random() < 0.5, alpha: U.rand(0.25, 0.55) });
    }
    return [Object.assign(bodySprite(q.x, q.y, U.randInt(0, 3), Math.random() < 0.5, 0.95, ghosts), { map: s.map })];
  }

  /* ------------------------------------------------------------------ restore / reset */
  function resumeFromState() {
    const s = S();
    rt.beh = null;
    setPath(null);
    // a loaded game never starts "caught" (a despawned entity keeps caught:true until the next
    // spawn, and scripts treat caught() as "the player is dying")
    if (!s.active) { s.caught = false; s.transit = null; return; }
    rt.lastX = s.x; rt.lastY = s.y;
    rt.main.x = s.x; rt.main.y = s.y;
    if (s.mode === 'caught') { s.mode = 'idle'; s.caught = false; }
    const noop = null;
    if (s.mode === 'move' && s.target) {
      rt.beh = { kind: 'move', resolve: noop, stopResult: { arrived: false, stopped: true }, speed: s.speed || 1.1, blocks: blockSet(s.target.closedBlocks), tx: s.target.x, ty: s.target.y, map: s.target.map, planned: false, direct: !!s.target.direct,
        lethal: !!s.target.lethal, watch: +s.target.watch || 0, onSeen: s.target.onSeen === 'stop' ? 'stop' : 'rush', rush: false, rushT: 0 };
    } else if (s.mode === 'search' && s.search) {
      const q = s.search;
      rt.beh = { kind: 'search', resolve: noop, stopResult: false, where: q.where, map: q.map || s.map, remaining: +q.remaining || 4, speed: q.speed || 0.95,
        phase: 'listen', pauseT: 0.8, visited: new Set(), rush: false, rushT: 0, detT: 0.5, rattleCD: 0, power: q.power || 1,
        follow: q.follow != null ? q.follow : 'heard', following: !!(s.transit && s.transit.why === 'search') };
    } else if (s.mode === 'hunt' && s.hunt) {
      const h = s.hunt;
      rt.beh = { kind: 'hunt', resolve: noop, stopResult: { caught: false, escaped: false, reason: 'stopped', stopped: true }, speed: h.speed || 2.4,
        duration: h.remaining == null ? Infinity : +h.remaining, elapsed: 0, giveUpDist: h.giveUpDist, blocks: blockSet(h.closedBlocks),
        closedBlocks: h.closedBlocks || null, last: h.last || null, idleT: 0, wander: null, rattleCD: 1, lostT: 6,
        power: h.power || 1, follow: h.follow !== false, budget: h.budget === 'total' ? 'total' : 'floor' };
    } else if (s.mode === 'stalk' && s.stalk) {
      rt.beh = { kind: 'stalk', resolve: noop, stopResult: { caught: false, stopped: true }, speed: s.stalk.speed || 1.2, unseenT: 0, seenT: 0, burst: 0, nextBurst: 1, repathT: 0,
        power: s.stalk.power || 1 };
    } else s.mode = 'idle';
    if (!rt.beh || rt.beh.kind === 'stalk') s.transit = null;
    resample(true);
  }
  function resetRuntime() {
    for (const g of rt.glimpses) { try { g.resolve({ seen: false }); } catch (e) { /* ignore */ } }
    if (rt.beh && rt.beh.resolve) { try { rt.beh.resolve(rt.beh.stopResult); } catch (e) { /* ignore */ } }
    if (rt.winPromise) { try { rt.winPromise.resolve(false); } catch (e) { /* ignore */ } }
    stopBreath();
    restoreAmbience();
    Object.assign(rt, {
      beh: null, path: null, pi: 0, blockedDoor: null, rattle: null, hist: [], histT: 0, longHist: [], longT: 0,
      ghosts: [], face: null, ghostT: 0, moveAmt: 0, stepAcc: 0, movingT: 0, flickT: 1, staticT: 1, staticBump: 0,
      glimpses: [], lastSeenT: -99, seesNow: false, caughtT: 0, deskPos: null, winT: 0, winPromise: null,
      lastExit: null, plPos: null,
    });
    rt.vis = { key: -1, v: false };
    const w = W();
    if (w && w.maps) for (const id in w.maps) if (w.maps[id] && w.maps[id].windowFigure) w.maps[id].windowFigure = null;
  }

  /* ------------------------------------------------------------------ public API */
  DA.entity = {
    spawn, despawn, moveTo, search, hunt, stalk, predict, flicker, visible,
    window: windowFn,
    active: () => !!S().active,
    position() { const s = S(); return s.active ? { map: s.map, x: s.x, y: s.y, angle: s.angle } : null; },
    stop(opts) { const cut = cutBehaviour('stop'); rt.rattle = null; if (opts && opts.all) cancelExtras(); return cut; },
    danger,
    mode: () => S().mode,
    caught: () => !!S().caught,
    distance: () => playerDist(),
    sees: () => !!rt.seesNow,
    teleport(pt) {
      const p = resolvePoint(pt), s = S();
      if (!p) return false;
      s.map = p.map; s.x = p.x; s.y = p.y;
      rt.lastX = s.x; rt.lastY = s.y;
      rt.hist.length = 0;
      setPath(null);
      if (rt.beh && rt.beh.kind === 'move') rt.beh.planned = false;
      resample(true);
      return true;
    },
    face(x, y) { const s = S(); s.angle = Math.atan2(y - s.y, x - s.x); },
    intensity(v) { const s = S(); if (v != null && isFinite(v)) s.intensity = U.clamp(+v, 0, 2); return s.intensity; },
    power,
    powerInfo,
    transit() {
      const T = S().transit;
      return T ? { from: T.from, to: T.to, via: T.via, id: T.id, phase: T.phase, why: T.why, eta: +transitETA().toFixed(2) } : null;
    },
    links: () => links().map((l) => Object.assign({}, l)),
    route: (a, b) => { const l = route(a, b); return l ? Object.assign({}, l) : null; },
    ghosts: () => [{ x: rt.main.x, y: rt.main.y, frame: rt.main.frame, flip: rt.main.flip, alpha: rt.main.alpha, kind: 'main' }].concat(rt.ghosts.map((g) => Object.assign({}, g))),
    debugInfo() {
      const s = S();
      return { active: !!s.active, mode: s.mode, map: s.map, x: +(+s.x).toFixed(2), y: +(+s.y).toFixed(2), caught: !!s.caught,
        visible: visible(), dist: isFinite(playerDist()) ? +playerDist().toFixed(2) : null, ghosts: rt.ghosts.length,
        window: +(s.window.amount || 0).toFixed(2), sawHide: s.sawHide || null, glimpses: rt.glimpses.length,
        power: power(), transit: s.transit ? s.transit.phase + ' ' + s.transit.from + '>' + s.transit.to : null, danger: !!s.danger,
        lethal: !!(rt.beh && rt.beh.kind === 'move' && rt.beh.lethal) };
    },
    CFG,
    /** Debug / tests only. */
    _rt: rt,
    _provider: provider,
  };

  /* ------------------------------------------------------------------ lifecycle */
  DA.bus.on('boot', () => {
    DA.addSystem('entity', { update, order: 20 });
    if (DA.render && DA.render.addSpriteProvider) {
      try { DA.render.addSpriteProvider(provider); } catch (e) { console.error('[entity] addSpriteProvider', e); }
    }
  });
  DA.bus.on('runtime:reset', resetRuntime);
  DA.bus.on('game:new', () => { DA.state.entity = defaults(); resetRuntime(); });
  DA.bus.on('game:load', () => { S(); resumeFromState(); });
  DA.bus.on('game:quit', () => { resetRuntime(); });
  DA.bus.on('tick', applyStaticBump);
  // "it saw you hide": it had you in sight within the last two seconds
  DA.bus.on('hide:enter', (e) => {
    const s = S();
    if (!s.active || !sameMap()) return;
    if (rt.time - rt.lastSeenT <= CFG.sawHideWindow) s.sawHide = (e && e.id) || true;
  });
  DA.bus.on('hide:exit', () => { S().sawHide = null; });
  DA.bus.on('map:change', (e) => {
    rt.vis.key = -1;
    // remember which way you went (stairs / ladder), for a hunt or search that follows you
    if (e && e.from && e.to && e.from !== e.to) {
      const q = rt.plPos && rt.plPos.map === e.from ? rt.plPos : null;
      rt.lastExit = { from: e.from, to: e.to, point: e.point || null, x: q ? q.x : null, y: q ? q.y : null, t: rt.time };
    }
  });
  // saving people / instability make it stronger: announce each step up
  DA.bus.on('var', (e) => { if (e && (e.key === 'saved' || e.key === 'instability') && DA.running) checkPower(); });
})();
