/* DEAD AIR — director.js
 * DA.director — the story (PLAN.md §4; README.md is the creative authority). Every beat of the
 * night: the drive in, Hollis's tour, the job (ACT 1), 02:13, the pure path and the secret ending,
 * THE LONG NIGHT (ACT 2), INTERFERENCE (ACT 3), THE ARRAY (ACT 4), COLLAPSE (ACT 5), the three
 * endings, deaths. Objectives, clock rates/holds, sunrise, checkpoints, transmissions, room feeds,
 * manifestations, layout drift and every scripted appearance of DA.entity live here.
 *
 * ── ARCHITECTURE ───────────────────────────────────────────────────────────────────────────────
 *  • Persistent: DA.state.director = {act, beat, done:{stepId:true|value}, counters:{driveLoops,
 *    filler}, t:{bridgeAt, bridgeEvent, fireAt, wxDue, refill, atMin}, lastClosed, lastOpened,
    doorManifest, doorKind ('open'|'shut'), pastDoor, recap} (plain JSON),
 *    DA.state.act, and the story flags in DA.state.flags. Nothing else.
 *  • One controller per act (runAct1 … runAct5, runPure, runSecret), each a DA.script (wrapped:
 *    it refuses to start if a reset happened before it ran, and every await also stops once the
 *    player is dying). A controller walks its steps top to bottom; every step is guarded by
 *    done[stepId], so re-entering an act after a load (or DA.director.jump) skips what already
 *    happened and resumes at the first unfinished step. Acts chain inside the same script.
 *  • Background behaviours ("watchers": manifestations, rewards, layout drift, collapse, the
 *    act-1 clock, the array stalker) are predicates run 4×/s by the director system (order 50);
 *    session bus listeners are (re)installed on every game:ready. DA.interact id handlers (car,
 *    generator, control_door, array_hatch, relay_door, control_console, relay_console, wall_map,
 *    desk_calendar, radio_window, signin_sheet; kind console) are registered once on 'boot' with
 *    DA.interact.onId / onKind (an id handler always runs before every kind handler, so the backup
 *    `generator` — id == kind — reaches the director before the devices' kind handler).
 *  • no_archive: counted busy(true/false) while scripted sequences run (the tour, 02:13, the
 *    dark, the drift hallway call, +00:03:14, the chase, the escape, the endings, and any
 *    director transmission once it is actually being received); cleared on every game:ready.
 *  • Checkpoints (slot 0): ARRIVAL, THE LONG NIGHT, INTERFERENCE, THE ARRAY, COLLAPSE, before each
 *    ending (DESTROY THE ANTENNA, KEEP THE CHANNEL OPEN, OPEN THE CHANNEL, SUNRISE) and three extra
 *    in ACT 3 so a death costs minutes, not the act: GENERATOR (in the light, before the switch —
 *    taken at the switch itself if the player is quicker than the trickery), INTERLOCK (after
 *    surviving it) and +00:03:14 (before the room feed that dares you to leave); in ACT 5 THE
 *    THREE VOICES (after the voices), GENERATOR RESTARTED and LIMITERS. A night that has already
 *    ended (dying) is never archived.
 *  • Transmissions: content tx are passed to DA.radio.transmit as copies whose nominal `stamp` is
 *    dropped when they carry offsetSec (radio then stamps origin = reception + offsetSec, so the
 *    OFFSET never drifts); tx_woman keeps her fixed 28 OCT 02:13 stamp. When the operator sits at
 *    the desk (or is within earshot of it) while a director transmission hails, the receiver
 *    scans to it — exactly, or to a carrier 0.03 MHz off that the player must isolate (the woman:
 *    148.28). tx_future_you_17 is forced onto log #17: optional ACT 2 traffic is skipped once the
 *    log passes #14, rewards only air while they cannot take #17–#19, and the log is topped up with
 *    routine receptions (addEntry, fillers' senders) before #17; radio fills {N19} from the
 *    number. Lines that must be heard anywhere (tx_new_hallway, tx_dispatch_nothing, the rewards,
 *    the 2049 radio check, rf_hide, rf_leaving, rf_why, rf_keep_*, rf_past_*) are mirrored as DA.ui
 *    'radio' subtitles tagged [SPEAKER] (the ceiling speaker) whenever the player is inside the
 *    station (DA.world.inBuilding: never on other maps, outdoors or in the woods) and out of earshot
 *    of the desk; a feed that ends or is stopped takes its remaining ceiling lines with it.
 *  • One voice at a time (decision 3): every story event waits for a free receiver (none of our
 *    transmissions on the air and !DA.radio.isBusy() — nothing hailing, playing or suspended, no
 *    tape, the operator not talking on the mic — no reward waiting or ~7 s after one, no room feed,
 *    no archive tape — a tape still playing after ~70 s is stopped) and for the operator (seated, or
 *    within earshot; while they are away the radio room beeps every ~55 s and a thought calls them
 *    back; story calls go out after ~40 s anyway and hail until tuned). Rewards (and County's
 *    replies) wait for a free receiver and for you (≤75 s), then play on the ceiling speaker if you
 *    are elsewhere. While a warning whose window is open (the bridge until it happens, the fire
 *    until sent) is queued on the frequency the dial is on, the next beat holds its autoScan (up to
 *    60 s per warning) so the operator can send it (warnHold). The power switch never ends a story
 *    transmission: DA.radio suspends it and it hails again under the same number once the set is
 *    back on — only the girl's "[Turn off the receiver.]" (action power_off) ends hers.
 *  • Mic notes: while the woman's Kestrel Road is not yet found on the wall map, the empty mic panel
 *    on 155.34 says '[find the location on the wall map first]' (DA.radio.setMicNote; content
 *    micNotes.kestrel); cleared once the report is queued, set again by stepWoman after a load.
 *  • ACT 1's "Check the weather instruments on the roof." is completed only by weather:read {source:
 *    'mast'} (the office display gives a thought instead); the ordinary night's hourly readings take
 *    either. "There's nobody there." (CCTV) needs cctv:close {figureViewed}. The director never cuts
 *    the CCTV (it runs on the UPS).
 *  • The clock (decision 7, "the long night"): the lot and Hollis's tour crawl (0.04 game-min/s,
 *    creeping to a stop at 00:15 — a player who keeps him waiting does not eat the night); ACT 1 0.2
 *    game-min/s, creeping (never frozen; the more chores left, the longer the approach) toward
 *    02:12:50 until the chores are done, then ~25 s of calm before 02:13; the reveal 0.1; ACT 2 0.14;
 *    ACT 3 0.15; ACT 4–5 0.12; the pure path 0.35. While a room feed counts down the clock runs in
 *    real time (the OFFSET and the station clock agree). At a few beats the clock hurries (never
 *    slows, never faster than 0.25 game-min/s) toward a floor — #17 03:45, #19 04:05, Calm's
 *    generator 05:00, the drift 05:45, the +00:03:14 06:20, Old You 06:44 — so it passes 04:00,
 *    05:00, 06:00 and 06:42 during ACT 2–3 whatever the player's speed; at 06:42, in the dark:
 *    "Six forty-two. It should be getting light." (held while a call is on the air; more than two
 *    game minutes late it is "Past six forty-two. It should be light by now."; never after the
 *    secret ending's dawn went back out). The untuned 02:13 call fades after ~150 s of nobody
 *    trying — seated or not; trying = the operator's own hand on the dial within ±0.15 MHz of 148.32
 *    in the last 30 s.
 *  • Lethal contexts (fix-d decision 1): every scripted appearance in the dark, the chase and the
 *    destroy escape spawns it with DA.entity danger on, and every scripted walk there is
 *    moveTo {lethal: true} — an unhidden player in its path is seen (≤ 6 u) and rushed, or caught on
 *    contact; it never walks through you. A walk in the dark that saw you voids the radio's
 *    prediction (rf_hide stops) and it comes for you (pursue, then seek). The stairs are not a free
 *    escape: after following you to another floor it still searches your room, then hunts the open.
 *    Once an ending has started or ended (endGame 'ending:start', the maintain dawn, the 2049
 *    wake-up, the amplify) every entity activity stops (stopEntity: stalk off, stop/despawn {all},
 *    danger off, no window) and the array stalker never spawns again (endingLocked). In 2049 the
 *    consoles, the generator and the array hatch answer like a station dead for fifty years.
 *  • Tense beats hush ambient radio traffic (DA.radio.quiet, counted — decision 6): the dark (and
 *    the self-scan held still), the −00:00:04 feed, +00:03:14 and what follows, the keep-the-
 *    channel hold, the destroy escape, 2049. resume() lifts it.
 *  • The receiver's own cues: a story call hailing just off the dial (scan 'near', ACT 2+) with the
 *    operator seated gets a thought + the fine-tune hint after ~30 s and is found exactly after
 *    ~60 s; the set left switched off gets a thought + "Switch the receiver back on." after ~25 s
 *    and comes back on by itself after ~60 s (ACT 2+, not the ordinary night).
 *  • Thoughts: thinkNow()/thinkOnce() queue behind any director thought in flight (rt.thinking);
 *    act cards wait for one to end; the saved-cost thought waits for the log/date reveal and the
 *    card. Cues are only what the operator can perceive: "Minus four." needs the desk's LCD (seated
 *    through the −00:00:04 feed), the window knock is captioned only near the radio room's window,
 *    the relief's knock only inside / near the front, the new-hallway knock only inside.
 *  • The entity's strength (decision 8): power() = DA.entity.power() (1 + 0.12·saved +
 *    0.03·instability, ≤1.8) scales the speeds and search times the director passes, how soon it
 *    comes in the dark, and its ghosts (entity.intensity; never opts.power — no double scaling); a
 *    confirmed save makes the building answer (lights stutter, a door bangs; once, a thought) and
 *    Injured You explains it; the first time you see it after 'entity:power' reached level 1 (k ≥
 *    1.15): "It's faster than it should be."
 *
 * ── API (PLAN §6.9 + additions) ────────────────────────────────────────────────────────────────
 *   DA.director.beat                  current beat id (= DA.state.director.beat); bus 'beat' {id}
 *   DA.director.beats                 ordered [{id, label, act}] — every DA.director.jump target:
 *       prologue arrival tour tasks woman pure act2 future17 girl19 act3 cctv phone selves
 *       generator hide drift nasty old1 act4 twist act5 destroy maintain open secret
 *   DA.director.jump(beatId) → bool   (starts a new game first if none runs) rebuild a fresh night
 *                                     as if every earlier beat had happened (flags, items, act,
 *                                     clock, world props/doors/power/mutations, radio log +
 *                                     recordings + notebook, objectives), place the player, emit
 *                                     game:load/game:ready and start that beat's controller.
 *                                     Takes a checkpoint 'JUMP — <BEAT>' (so a death reloads there).
 *   DA.director.status() → {act, beat, objectives:[open ids], pure, interference, clock, sunrise,
 *                            ending, busy, airing:[txIds]}
 *   DA.director.act                   getter (DA.state.act)
 *   DA.director.done(stepId) / steps() debug: controller step state
 *   DA.director.die(cause)            end the attempt now (death scene → LOAD ARCHIVE)
 *   DA.director.power() → k           how strong it is tonight (= DA.entity.power() when present)
 *   DA.director.endingLocked() → bool an ending sequence is running / has run (no other may start)
 *   Events: 'beat' {id}, 'ending:start' {id}, 'director:step' {id}, 'director:strike' {n, why}
 *           (keep-the-channel ending: the lock was lost / the door was open / the chair).
 *   Optional calls into others (null-safe, ignored when absent): DA.radio.jolt(amount) (the desk
 *   jolts when the chair moves / the jar falls), DA.radio.tapePlaying() (else _rt.tapePlay),
 *   DA.radio.isBusy() (the receiver is not free), DA.radio.setMicNote(text|null, {freq}),
 *   DA.radio.outgoingHere() (warnHold), DA.radio.quiet(on), DA.ui.countdown(secs, {label, get,
 *   urgent}) / countdown(null), DA.entity.danger(on) + moveTo opts {lethal, watch} + spawn opts
 *   {danger} + stop/despawn({all}) (without danger() the director watches its scripted walks itself).
 *
 * ── FLAGS written (PLAN §7.10 + ours) ──────────────────────────────────────────────────────────
 *   PLAN: tour_done hollis_gone task_{coffee,radio_check,weather,trucker,breaker,police,calendar,
 *   paperwork} woman_responded woman_logged act2 offset_unit outside_unstable mug_on_desk (with
 *   radio) mug_moved photo_four mirror_stage records_unlocked records_opened followed_future
 *   girl_choice cctv_on cctv_offsets figure_done phone_done generator_off interlock_released
 *   key_found log_haunted (1|2) sunrise_unknown no_archive archives_are_timelines you_realtime
 *   collapse relay_unlocked ending.  Ours: report_read (only in ACT 4+), nasty_done
 *   ('stay'|'leave'), bridge_warned, fire_warned, signed_out ('hh:mm', the secret ending's register).
 *   Step ids worth knowing (DA.director.done): a3_time / at_time_followed / at_time_over (Calm's
 *   precise-time instruction), d_past (the −00:00:04 feed), handover, s_broken (the dawn went back
 *   out), ending_chosen, cp_generator / cp_gen5 / cp_limiters (checkpoints taken), relief_seated
 *   (the relief took the chair), hint_desk:<key> (desk hints shown).
 *
 * ── DEVIATIONS / NOTES ─────────────────────────────────────────────────────────────────────────
 *   • Generator: the station runs on the backup set, so switching it off (ACT 3) also cuts circuit
 *     'main' (the emergency lamps come on); restarting it (ACT 5 destroy, the maintain dawn)
 *     restores 'main'. Before Calm's instruction the director will not let the player stop it, and
 *     not without the workshop flashlight ("I'll want a light first." + objective) — Calm says to
 *     take it first. Off in ACT 3 before the dark is over: "It won't turn over. Not now."
 *   • The objective trickery (Investigate → DO NOT INVESTIGATE → You already investigated it.) runs
 *     on the way to the switch and stops the moment it is off; LISTEN. comes after the switch, alone.
 *   • The dark (decision 4): after the switch, the red lamps, LISTEN., three knocks upstairs; it
 *     comes in only once you are back on the ground floor (rf_hide +12 s: it is in the hall, the
 *     radio-room door handle at +21 s to the second — its walk is timed from the front door;
 *     CAM1 sees it coming up the drive), or after 45/power s it comes down the stairs to you. It
 *     follows you between floors (DA.entity's hunts and searches cross maps by themselves; only a
 *     hunt that ends 'map' makes the director bring it out of the stair exit on your floor). The
 *     radio room is the nearest lockable room.
 *   • The array (ACT 4) is the midpoint: the control door's bolt and the array hatch hold until
 *     Old You has sent you down (decision 5).
 *   • The generator's changed rhythm (PLAN lists it after the dark) plays before the generator is
 *     switched off — after the dark it is silent.
 *   • Short lines of the director's own where content has none: Hollis's nudges ("You coming?",
 *     "This way."), confirm prompts (generator, car, consoles, relay AMPLIFY), console/relay
 *     thoughts before ACT 5, the interlock thought, "Procedures say leave it running.", the pure-
 *     path reveal thoughts for stamps that are not 28 OCT ("That hasn't happened yet." only while
 *     the stamp is still ahead of the clock), sfx captions for knocks / footsteps overhead / the
 *     window / birds, and the destroy-escape countdown (DA.ui.countdown 'CAR', red LCD, driven by
 *     the director's deadline; the old second hints only without it).
 *   • Hollis's note (doc_hollis_note) opens the first time the player sits at the desk after he
 *     leaves, followed by the desk control hints (content.hints: tune, antenna, mic, log, stand) —
 *     each marked once shown ('hint_desk:<key>'); standing up interrupts them (a showing desk hint
 *     is cleared) and the rest resume at the next sit.
 *   • The pure path's events are scheduled on the clock: duties post on the hour whatever is on
 *     the air; calls run on their own (temptations hail 150 s, routine traffic ~45 s); the dawn at
 *     06:42 never waits for a call nobody tuned in; a grey edge on the sky from 06:15. Answering
 *     one, sending a warning, opening the records room or following a future self starts ACT 2 at
 *     once (a generic reveal: County finds nothing / the log stamp is wrong → the date → the OFFSET
 *     unit) — except the fire warning, whose reveal is County's "How'd you know about that?"
 *     (tx_fire_confirm, a save — it waits for the deputy's 15 game minutes after the send). After
 *     06:42 future warnings leave the mic; breaking purity anyway (the records room) takes the dawn
 *     back out and the long night starts (brokenDawn: no sunrise thoughts on top of it; "She was
 *     right here." if the relief had come). The ordinary night's last stretch: the sheriff going
 *     off nights (06:22, tx_pure_police_3), "Nearly morning." (06:33). The relief's car (the map's
 *     hidden replacement_car) is shown on the road and drives in — engine, headlight sweep, idle,
 *     the door — and stays parked. She knocks, lets herself in ("The door was open." only if it
 *     was) and comes looking for a night operator who stays at the desk. After the handover she
 *     takes the chair once you have stepped off it (never through you); the desk is hers (sitting
 *     again: "It's her radio now."); a lingering operator gets "Go home. I've got it." after ~60 s.
 *   • Hollis waits for the player within earshot at every stop (nudges, then walks back to fetch
 *     them); the 148.32 speech and its choice happen face to face in the radio room.
 *   • The drift (decision 6) keeps a seated player busy: the log rewrite noticed at the desk, a door
 *     shutting far down a hall that has grown ("Check the far end of the corridor."), the office
 *     phone ringing behind a door that now opens somewhere else, an unreliable then negative OFFSET
 *     (+10 s, +6 min, −3 s, then −00:00:04: the radio-room door already moved, unheard — only once
 *     the phone has stopped ringing), knocking from the new hallway ("Find the knocking." replaces
 *     the corridor duty). "I didn't hear that door." only while that door is still as the feed left
 *     it and the player has not touched it. The new hallway's warning fires on entering it from
 *     either end (triggers newhall_inside / newhall_inside_b / newhall_end, or room:enter newhall).
 *   • ACT 2's door: a door you shut stands open — or, if you never shut one, one you left open
 *     (DA.world.doorsLeftOpen('player')) is shut — always where you cannot see it (DA.world.canSee)
 *     and never within 3 u; noticing it (in view within 6.5 u) gives the thought.
 *   • The woods (a loop trail south of the road): at the dump (woods_mid) "I should be able to see
 *     the lot lights from here." once outside is unstable (else a plain thought); while it still
 *     holds together, in at one end and out at the other: "It just goes round in a loop." In ACT 2+
 *     once the drive has looped, walking north near either end (woods_deep) comes out in the supply
 *     cupboard with the clock ten game-minutes on (README "Ten minutes later").
 *   • Endings (decision 13): once one has started (endingLocked) the others refuse (consoles think
 *     "Not now.", the mic's KEEP THE CHANNEL OPEN is ignored); Open clears every outgoing message
 *     in 2049. DESTROY: 55 s to the car, the hunter loose in ~3.5 s and following you up the stairs,
 *     an [alarm] caption and the red 'CAR 0:55' countdown (DA.ui.countdown) all the way. KEEP THE
 *     CHANNEL OPEN: the carrier wanders ±0.085 MHz (wider than the lock), 5 s without the lock is a
 *     strike, four room-feed cues (three at the door, one for the lock), every strike captioned —
 *     an idle operator loses. Deaths record the last real lines (historyRaw minus the flood's
 *     fragments and system text).
 *   • ACT 5 collapse: DA.world.setBlend rises from 0.1 to 0.5 over ~6 minutes (0.85 during the
 *     escape), DA.radio.jam follows it (quiet while a voice speaks), occasional DA.render.glitch.
 *     The 2049 wake-up and the maintain dawn zero DA.v('instability') (the collapse is over).
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;
  const D = (DA.director = DA.director || {});

  /* ================================================================ constants */
  const tm = (day, h, m) => (day - 26) * 1440 + h * 60 + (m || 0);
  const ARRIVE = tm(26, 23, 40);
  const MIDNIGHT = tm(27, 0, 0);
  const BREAKER_AT = tm(27, 0, 20);
  const HOLD_AT = tm(27, 2, 12) + 50 / 60; // the act-1 backstop (the clock creeps toward it, it never visibly stops)
  const WOMAN_AT = tm(27, 2, 13);
  const SUNRISE = tm(27, 6, 42);
  const PREDAWN = tm(27, 6, 15);
  /** Game minutes per real second. night2/3/4 = ACT 2 / ACT 3 / ACT 4–5 (the long night: the clock passes
   *  04:00, 05:00, 06:00 and 06:42 during ACT 2–3); real = while a room feed counts down (OFFSET = clock). */
  const RATE = { act1: 0.2, tour: 0.04, fast: 1.2, idle: 1.5, woman: 0.05, pure: 0.35, night2: 0.14, night3: 0.15, night4: 0.12, real: 1 / 60, creep: 1 / 300 };
  /** Hollis's tour (and the lot before it) crawls toward this and never passes it (a dawdler does not eat the night). */
  const TOUR_CAP = tm(27, 0, 15);
  RATE.night = RATE.night2;
  RATE.reveal = 0.1; // 02:13 → the log reveal
  const STATION_DOORS = ['office_door', 'kitchen_door', 'equip_door', 'storage_door', 'bath_door', 'workshop_door', 'stairs_door'];
  const HOLLIS_NUDGE = ['You coming?', 'This way.', "I haven't got all night."];
  const DESK_PT = { x: 17.0, y: 9.3, map: 'station' };
  /** Where something that follows you up or down the stairs comes out: [its map][your map]. */
  const STAIR_EXIT = {
    station: { basement: 'pt_b_arrive' },
    basement: { station: 'pt_stairs_return', array: 'pt_array_arrive' },
    array: { basement: 'pt_control_return' },
  };

  /* ================================================================ helpers */
  const C = () => DA.content || {};
  const errSeen = new Set();
  function report(tag, e) {
    const k = tag + ':' + (e && e.message);
    if (errSeen.has(k)) return;
    errSeen.add(k);
    console.error('[director:' + tag + ']', e);
  }
  function call(obj, fn, ...args) {
    if (!obj || typeof obj[fn] !== 'function') return undefined;
    try { return obj[fn](...args); } catch (e) { report(fn, e); return undefined; }
  }
  const world = (fn, ...a) => call(DA.world, fn, ...a);
  const radio = (fn, ...a) => call(DA.radio, fn, ...a);
  const ui = (fn, ...a) => call(DA.ui, fn, ...a);
  const ent = (fn, ...a) => call(DA.entity, fn, ...a);
  const render = (fn, ...a) => call(DA.render, fn, ...a);
  const audio = (fn, ...a) => call(DA.audio, fn, ...a);
  const devs = (dev, fn, ...a) => call(DA.devices && DA.devices[dev], fn, ...a);
  /** Promise-returning cross-module call (never rejects; resolves `dflt` when unavailable). */
  const P_ = (v, dflt) => (v && typeof v.then === 'function' ? v.catch((e) => { report('promise', e); return dflt; }) : Promise.resolve(v === undefined ? dflt : v));

  const player = () => (DA.world && DA.world.player) || { x: 0, y: 0, angle: 0, hidden: false };
  const mapId = () => (DA.world && DA.world.mapId) || null;
  const room = () => world('room') || null;
  const pt = (name) => world('point', name) || null;
  const outdoors = () => !!world('isOutdoor');
  const atDesk = () => !!(DA.radio && DA.radio.atDesk && DA.radio.atDesk());
  const radioNext = () => (DA.state.radio && DA.state.radio.nextNum) || 1;
  const hidden = () => !!player().hidden;
  function distTo(where) {
    const p = typeof where === 'string' ? pt(where) : where;
    if (!p) return Infinity;
    if (p.map && p.map !== mapId()) return Infinity;
    return Math.hypot(p.x - player().x, p.y - player().y);
  }
  function npcDist(id) {
    const n = world('npc', id);
    if (!n || n.map !== mapId()) return Infinity;
    return Math.hypot(n.x - player().x, n.y - player().y);
  }
  function faceNpc(id) {
    const n = world('npc', id);
    if (!n || n.map !== mapId()) return;
    n.angle = (Math.atan2(player().y - n.y, player().x - n.x) * 180) / Math.PI;
  }
  function sfx(name, opts) { return audio('play', name, opts || {}); }
  function sfxAt(name, where, opts) {
    const p = typeof where === 'string' ? pt(where) : where;
    const o = Object.assign({}, opts || {});
    if (p) { o.x = p.x; o.y = p.y; o.map = p.map || 'station'; }
    return sfx(name, o);
  }
  const stinger = (k) => audio('stinger', k);
  const caption = (text, dur) => ui('subtitle', text, { kind: 'sfx', dur: dur || 2.6 });
  function doorOpenAmount(id) {
    const d = world('door', id);
    return d ? d.open : 0;
  }
  const doorLocked = (id) => { const d = world('door', id); return !!(d && d.locked); };
  const lockedInRadio = () => mapId() === 'station' && room() === 'radio' && doorLocked('radio_door');
  const inStationInterior = () => mapId() === 'station' && !outdoors() && !!room();
  function randIn(range) { return Array.isArray(range) ? U.rand(range[0], range[1]) : +range || 0; }
  /** Within earshot of the desk speaker (or seated at it). */
  const nearRadio = () => atDesk() || (mapId() === 'station' && (+world('radioAudibility') || 0) > 0.3);
  const tapePlaying = () => {
    const R = DA.radio;
    if (!R) return false;
    if (typeof R.tapePlaying === 'function') return !!call(R, 'tapePlaying');
    return !!(R._rt && R._rt.tapePlay);
  };
  const feedLive = () => radio('feedCountdown') != null;
  /** The top mode is the world or the desk (not a scene, document, choice or device close-up). */
  const plainView = () => { const t = DA.modes && DA.modes.top(); return !t || t.name === 'explore' || t.name === 'radio'; };
  /**
   * How strong it has become (README: "The more people you save, the stronger it becomes"):
   * DA.entity.power() (1 + 0.12 per confirmed save + 0.03 per point of instability, ≤ 1.8; 1 without
   * the entity module). The director scales the speeds and search times it hands the entity by it
   * itself (never also opts.power — the entity scales its own perception), and how soon it comes
   * in the dark.
   */
  function power() {
    const k = +call(DA.entity, 'power');
    return isFinite(k) && k > 0 ? k : 1;
  }
  /** The entity module follows you up and down the stairs by itself (hunt / search) when it can. */
  const entFollows = () => !!(DA.entity && typeof DA.entity.transit === 'function');

  /* ================================================================ state */
  function S() {
    let d = DA.state.director;
    if (!d || typeof d !== 'object') d = DA.state.director = {};
    if (!d.done || typeof d.done !== 'object') d.done = {};
    if (!d.counters || typeof d.counters !== 'object') d.counters = {};
    if (!d.t || typeof d.t !== 'object') d.t = {};
    if (d.beat === undefined) d.beat = null;
    if (d.act === undefined) d.act = DA.state.act || 0;
    return d;
  }
  const done = (id) => !!S().done[id];
  function mark(id, v) {
    S().done[id] = v === undefined ? true : v;
    DA.bus.emit('director:step', { id });
  }
  function setAct(n) { DA.state.act = n; S().act = n; }
  function setBeat(id) {
    const d = S();
    if (d.beat === id && D.beat === id) return;
    d.beat = id;
    D.beat = id;
    DA.bus.emit('beat', { id });
  }
  const count = (k, n) => { const c = S().counters; c[k] = (c[k] || 0) + (n == null ? 1 : n); return c[k]; };

  /* ================================================================ runtime */
  const rt = {
    busy: 0, dying: false, airing: new Map(), ceiling: new Set(), ceilFeeds: new Set(),
    watchers: [], acc: 0, logOpen: false, logTimer: null, escaping: false, escapeDone: false,
    canLeave: false, leaving: null, figSeen: 0, sequences: new Set(), girlName: false, collapseT: 0, hideCtl: null, alarm: null,
    stalking: false, stalkPaused: false, maintaining: false, opening: false, responded2049: false, carLine: null, deathShown: false,
    rewardEnd: -99, feedRate: null, figCam: null, figViewed: false, stalkSeen: null, sitT: 0, woods: null,
    warnHeld: {}, // outgoing id → {spent, last}: how long a queued warning has held the next beat (warnHold)
    thinking: 0, quiet: 0, powerOffT: 0, powerCued: false, deskHintUntil: -1, pastTouched: false,
  };
  function resetRt() {
    rt.thinking = 0;
    rt.carding = false;
    rt.sunriseThT = -99;
    rt.quiet = 0;
    rt.powerOffT = 0;
    rt.powerCued = false;
    rt.deskHintUntil = -1;
    rt.pastTouched = false;
    rt.tasksDoneAt = null;
    rt.warnHeld = {};
    rt.pace = null;
    rt.rewardEnd = -99;
    rt.feedRate = null;
    rt.figCam = null;
    rt.figViewed = false;
    rt.stalkSeen = null;
    rt.sitT = 0;
    rt.woods = null;
    rt.busy = 0;
    rt.dying = false;
    rt.deathShown = false;
    rt.airing.clear();
    rt.ceiling.clear();
    rt.ceilFeeds.clear();
    rt.watchers = [];
    rt.acc = 0;
    rt.logOpen = false;
    rt.logTimer = null;
    rt.escaping = false;
    rt.escapeDone = false;
    rt.canLeave = false;
    rt.leaving = null;
    rt.alarm = null;
    rt.stalking = false;
    rt.stalkPaused = false;
    rt.maintaining = false;
    rt.opening = false;
    rt.responded2049 = false;
    rt.carLine = null;
    rt.figSeen = 0;
    rt.sequences.clear();
    rt.girlName = false;
    rt.collapseT = 0;
    rt.hideCtl = null;
  }
  /** no_archive while any scripted sequence runs. */
  function busy(on) {
    rt.busy = Math.max(0, rt.busy + (on ? 1 : -1));
    const want = rt.busy > 0;
    if (!!DA.flag('no_archive') !== want) DA.setFlag('no_archive', want);
  }
  /** Automatic checkpoint (slot 0). Never blocked by our own no_archive. */
  function checkpoint(label) {
    if (rt.dying || !DA.running) return; // never archive a night that has already ended
    const f = DA.state.flags;
    const was = f.no_archive;
    f.no_archive = false;
    ent('window', false);
    try { DA.archive.auto(label); } catch (e) { report('checkpoint', e); }
    f.no_archive = was;
  }
  /** Background predicate run 4×/s; return true to retire it. */
  function watch(id, fn) {
    rt.watchers = rt.watchers.filter((w) => w.id !== id);
    rt.watchers.push({ id, fn });
  }

  /**
   * DA.script with an extra guard: once the player is dying every await throws Cancelled, so no
   * story step runs under the death scene.
   */
  function run(name, fn) {
    return DA.script(async (s) => {
      // queued before a reset (new game → jump in one go): never start in the wrong night
      if (!s.alive()) return undefined;
      const chk = (v) => { if (rt.dying) throw new DA.Cancelled(); return v; };
      const x = Object.assign({}, s, {
        wait: (t) => s.wait(t).then(chk),
        until: (p, t) => s.until(p, t).then(chk),
        event: (e, f, t) => s.event(e, f, t).then(chk),
        do: (p) => s.do(p).then(chk),
        check: () => { s.check(); chk(); },
      });
      return fn(x);
    }, name);
  }
  /** Fire-and-forget sequence that can only run once at a time per name. */
  function once(name, fn) {
    if (rt.sequences.has(name)) return;
    rt.sequences.add(name);
    const sess = DA.session;
    run(name, fn).then(() => { if (DA.session === sess) rt.sequences.delete(name); });
  }

  /* ================================================================ words */
  function altText(l, key) {
    if (l.alt && (DA.state.stats.loads || 0) > 0 && DA.variant('line:' + key) < 0.25) return l.alt;
    return l.t;
  }
  /** Speak one line (speech subtitle + voice). opts.npc → positional voice at that NPC. */
  function sayLine(s, spk, text, opts) {
    const o = Object.assign({}, opts || {});
    if (o.npc) {
      const n = world('npc', o.npc);
      if (n && n.map === mapId()) { o.x = n.x; o.y = n.y; }
      delete o.npc;
    }
    return s.do(P_(ui('say', spk, DA.fmt(text), o), true));
  }
  /** A content dialogue block, line by line. */
  async function dlg(s, id, opts) {
    const lines = (C().dialogue || {})[id] || [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const o = {};
      if (opts && opts.npc && l.s === opts.npc) o.npc = opts.npc;
      if (l.s === 'phone') o.kind = 'phone';
      await sayLine(s, l.s, altText(l, id + ':' + i), o);
      await s.wait(l.gap != null ? l.gap : 0.3);
    }
  }
  /** Inner monologue from content.dialogue.thoughts_* (never voiced). rt.thinking counts the ones in flight. */
  async function thought(s, id) {
    const lines = (C().dialogue || {})[id];
    if (!lines) return;
    rt.thinking++;
    try {
      for (const l of lines) {
        await s.do(P_(ui('think', DA.fmt(l.t)), true));
        await s.wait(0.25);
      }
    } finally { rt.thinking = Math.max(0, rt.thinking - 1); }
  }
  /** A thought of its own: it waits (≤ 8 s) for any other director thought to finish first — one at a time. */
  function thinkNow(id) { run('think:' + id, async (s) => { await s.until(() => rt.thinking === 0, 8); await thought(s, id); }); }
  /**
   * DA.radio.quiet (decision 6): ambient traffic hushed while a tense beat runs — counted, so nested
   * beats never lift it early; resume() lifts it (a load restarts whatever beat re-applies it).
   */
  function radioQuiet(on) {
    rt.quiet = Math.max(0, rt.quiet + (on ? 1 : -1));
    radio('quiet', rt.quiet > 0);
  }
  function thinkOnce(id) { if (done('th:' + id)) return; mark('th:' + id); thinkNow(id); }
  const thinkText = (text) => ui('think', DA.fmt(text));
  /** A control hint from content.hints, once per night (never drawn over the journal it points at). */
  function hintOnce(key, delay) {
    if (done('hint:' + key)) return;
    const h = (C().hints || {})[key];
    if (!h) return;
    mark('hint:' + key);
    const sess = DA.session;
    DA.timers.after(delay || 0, () => {
      if (DA.session !== sess) return;
      if (key === 'journal' && DA.modes && DA.modes.has('journal')) return;
      ui('hint', h, 4.5);
    }, 'dir_hint');
  }

  /* ================================================================ objectives */
  const objList = () => (Array.isArray(DA.state.objectives) ? DA.state.objectives : []);
  const objExists = (id) => objList().some((o) => o.id === id);
  const objOpen = (id) => objList().some((o) => o.id === id && !o.done);
  function obj(id, opts) { if (!objOpen(id)) ui('objective', id, undefined, opts || {}); }
  function objDone(id) { if (objOpen(id)) ui('objectiveDone', id); }
  function objRemove(id) { if (objExists(id)) ui('objectiveRemove', id); }

  /* ================================================================ modes */
  function ensureExplore() {
    if (!DA.modes || !DA.modes.defs.explore) return;
    if (!DA.modes.has('explore')) {
      // explore is the base of the stack; anything already up (a scene) stays above it
      if (!DA.modes.stack.length) DA.modes.push('explore');
      else DA.modes.stack.unshift({ name: 'explore', def: DA.modes.defs.explore, arg: undefined });
    }
  }
  /** An act card lands on its own: after a thought in flight (≤ 7 s) — never on top of one. */
  async function card(s, key, dur) {
    const c = (C().cards || {})[key] || {};
    await s.until(() => rt.thinking === 0, 7);
    rt.carding = true;
    try { return await s.do(P_(ui('card', c.title || key.toUpperCase(), c.sub || '', dur || 5.5), true)); } finally { rt.carding = false; }
  }

  /* ================================================================ transmissions */
  /** A copy of a content transmission ready for DA.radio.transmit (stamp rebased to reception). */
  function txDef(id, over) {
    const base = (C().tx || {})[id];
    if (!base) return null;
    const t = Object.assign({}, base, over || {});
    t.id = id;
    if (!t.keepStamp && t.offsetSec != null && t.stamp && t.stampText == null) delete t.stamp;
    delete t.keepStamp;
    return t;
  }
  const anyAiring = () => rt.airing.size > 0;
  /**
   * Put a director transmission on the air. Returns radio's result promise.
   * o: scan 'exact'|'near'|null (what the receiver does once the player sits), busy (no_archive
   * while it lasts), ceiling (mirror lines as [SPEAKER] subtitles when out of earshot), keepStamp,
   * over {tx field overrides} + any DA.radio.transmit option (hailTimeout, vars, num, noLock,
   * bearing, drift, loop, loopGap, freq, strength, silent, node).
   */
  function air(id, o) {
    o = o || {};
    const tx = txDef(id, Object.assign({}, o.over || {}, o.keepStamp ? { keepStamp: true } : {}));
    if (!tx || !DA.radio || !DA.radio.transmit) return Promise.resolve({ txId: id, missing: true, choices: {}, path: [] });
    const topts = {};
    for (const k of ['hailTimeout', 'vars', 'num', 'noLock', 'bearing', 'drift', 'loop', 'loopGap', 'freq', 'strength', 'silent', 'node', 'width', 'force']) {
      if (o[k] !== undefined) topts[k] = o[k];
    }
    const sess = DA.session;
    if (o.ceiling) rt.ceiling.add(id);
    const rec = { scan: o.scan || null, freq: topts.freq != null ? topts.freq : tx.freq, scanned: false, near: o.nearOffset, busy: false };
    rt.airing.set(id, rec);
    // the archive terminal is busy once the call is actually being received (not while it only hails)
    const offRx = o.busy ? DA.bus.on('radio:received', (e) => { if (e && e.txId === id && !rec.busy && DA.session === sess) { rec.busy = true; busy(true); } }, { session: true }) : null;
    let p;
    try { p = DA.radio.transmit(tx, topts); } catch (e) { report('transmit', e); p = Promise.resolve({ txId: id, error: true, choices: {}, path: [] }); }
    DA.timers.after(0.8, () => tryScan(id));
    return P_(p, { txId: id, choices: {}, path: [] }).then((res) => {
      if (DA.session === sess) {
        if (offRx) offRx();
        rt.airing.delete(id);
        if (rec.busy) busy(false);
        if (o.ceiling) DA.timers.after(2, () => rt.ceiling.delete(id));
      }
      return res || { txId: id, choices: {}, path: [] };
    });
  }
  /** The receiver finds a hailing director transmission once the operator is at the desk. */
  function tryScan(id) {
    const a = rt.airing.get(id);
    if (!a || a.scanned || !a.scan || !DA.radio || !DA.radio.power) return;
    // seated, or near enough to hear the speaker: the dial moves by itself
    if (!atDesk() && !(mapId() === 'station' && (+world('radioAudibility') || 0) > 0.3)) return;
    if (!radio('isActive', id)) return;
    if (radio('isLocked', id)) { a.scanned = true; return; }
    // never drag the dial off another call that is being received (it gets its turn afterwards)
    for (const oid of rt.airing.keys()) if (oid !== id && radio('isLocked', oid)) return;
    // …nor off a warning the operator could be sending right now (it keeps hailing meanwhile)
    if (warnHold()) return;
    a.scanned = true;
    let f = +a.freq;
    if (a.scan === 'near') {
      const off = a.near != null ? a.near : (DA.variant('scan:' + id) < 0.5 ? -0.03 : 0.03);
      f = Math.round((f + off) * 100) / 100;
    }
    radio('autoScan', f);
  }
  /**
   * Wait until the operator is at the desk (or in the radio room when `room` is set), the receiver is
   * free and no open warning is queued on the dial (the next beat's autoScan would drag it away).
   */
  function waitDesk(s, opts) {
    opts = opts || {};
    return s.until(() => (atDesk() || (opts.room && room() === 'radio' && mapId() === 'station')) && (opts.allowAiring || (channelFree() && !warnHold())), opts.timeout);
  }
  const rewardPending = () => rt.sequences.has('reward_bridge') || rt.sequences.has('reward_fire');
  /**
   * The receiver itself is busy (DA.radio.isBusy): a transmission hailing, playing or suspended by
   * the power switch, a tape on the deck, or the operator talking on the mic.
   */
  const radioBusy = () => !!radio('isBusy');
  /**
   * The receiver is free for the next story event: none of our transmissions on the air and nothing
   * else keeping the receiver busy (radioBusy), no reward waiting for its turn (and a few quiet
   * seconds after one, so the thank-you lands), no room feed counting down and no archive tape
   * playing on the deck.
   */
  const channelFree = () => !anyAiring() && !radioBusy() && !rewardPending() && DA.simTime - rt.rewardEnd > 7 && !feedLive() && !tapePlaying();
  /**
   * Wait for a free receiver (and for the operator to have had the chance to send an open warning
   * queued on the dial: warnHold). A tape that keeps the deck busy for more than `maxTape` s is
   * stopped (the deck clicks off).
   */
  function awaitChannel(s, maxTape) {
    const t0 = DA.simTime;
    return s.until(() => {
      if (tapePlaying() && DA.simTime - t0 > (maxTape || 70) && !anyAiring()) radio('stopTape');
      return channelFree() && !warnHold();
    });
  }
  /** A queued warning that can still matter (decision 3): the bridge until the minute it happens, the fire until it is sent. */
  function warnOpen(id) {
    if (id === 'out_warn_bridge' || id === 'out_warn_bridge_dispatch') return !DA.flag('bridge_warned') && !done('bridge_expired');
    if (id === 'out_warn_fire') return !DA.flag('fire_warned');
    return false;
  }
  /** How long (real s) one warning may hold the next beat back. */
  const WARN_HOLD = 60;
  /**
   * A warning is queued on the frequency the dial is on, its window is open and the operator is at
   * (or within earshot of) the desk: the next beat holds (no autoScan to 014.00 after the bridge
   * call, no new call scanned in) so they can key the mic and send it — for WARN_HOLD s of holding
   * per warning, then the night moves on (the warning stays on the mic, listed under the other
   * frequencies once the dial has moved). Away from the desk nothing is held: nothing scans the dial
   * until the operator is back, and then the hold applies.
   */
  function warnHold() {
    if (!DA.radio || !DA.radio.power || !nearRadio()) return false;
    const here = radio('outgoingHere') || [];
    const o = here.find((x) => x && warnOpen(x.id));
    if (!o) return false;
    const h = rt.warnHeld[o.id] || (rt.warnHeld[o.id] = { spent: 0, last: DA.simTime });
    const dt = DA.simTime - h.last;
    if (dt > 0 && dt < 0.6) h.spent += dt; // (only time actually spent holding counts)
    h.last = DA.simTime;
    return h.spent < WARN_HOLD;
  }
  /**
   * Wait for the operator to be where the next beat needs them: seated (o.desk) or within earshot of
   * the desk speaker. While they are away the receiver calls them back — three beeps in the radio
   * room every ~55 s and, once, a thought. Resolves true when they are there, false after o.max s.
   */
  async function awaitOperator(s, o) {
    o = o || {};
    const here = () => (o.desk ? atDesk() : nearRadio());
    let t = 0, next = o.nudge != null ? o.nudge : 40;
    while (!here()) {
      if (o.max != null && t >= o.max) return false;
      await s.wait(0.5);
      t += 0.5;
      if (t >= next && !here()) { deskAlert(); next = t + 55; }
    }
    return true;
  }
  /** The receiver's alert tone from the radio room: "get back to the radio". */
  function deskAlert() {
    if (!plainView()) return;
    for (let i = 0; i < 3; i++) DA.timers.after(i * 0.3, () => sfxAt('beep', DESK_PT, { vol: 1 }), 'dir_alert');
    if (mapId() === 'station' && (+world('radioAudibility') || 0) > 0.04) caption('[the receiver beeps in the radio room]', 2.6);
    thinkOnce('thoughts_back_to_radio');
  }
  /**
   * A story transmission that must be received (#17–#19, the future selves, ACT 5). The power switch
   * no longer ends it: DA.radio suspends it (hailing or mid-script) and, once the receiver is back
   * on, it hails again, relocks under the same log number and replays the node it was in (decision
   * 10). The one answer that does end it is an option whose action is 'power_off' (the girl's
   * "[Turn off the receiver.]"): received, numbered, choice 'power_off'.
   */
  const airStory = (s, id, o) => s.do(air(id, o));
  /** Pacing gap between beats (real seconds). */
  const gap = (s, range) => s.wait(randIn(range));
  /** Routine receptions the player did not hear (the receiver logs them by itself) up to `last`. */
  function topUpLog(last) {
    const fillers = ['tx_filler_1', 'tx_filler_2', 'tx_filler_3', 'tx_filler_4', 'tx_filler_5', 'tx_filler_6', 'tx_pure_cb_1', 'tx_pure_police_2'];
    let k = S().counters.filler || 0;
    let guard = 0;
    // received times rise with the entry numbers: spread between the last reception and now
    const log = radio('entries') || [];
    const prev = log.length ? log[log.length - 1] : null;
    const from = prev && prev.min != null ? Math.min(prev.min, DA.clock.min) : DA.clock.min - 8;
    const n = Math.max(0, last + 1 - radioNext());
    let i = 0;
    while (radioNext() <= last && guard++ < 40) {
      const id = fillers[k % fillers.length];
      k++;
      i++;
      fakeEntry(id, { logged: false, status: 'RECEIVED', min: U.lerp(from, DA.clock.min, i / (n + 1)) });
    }
    S().counters.filler = k;
  }
  /** A log entry for a transmission that happened off-screen (jump setups, top-ups). */
  function fakeEntry(txId, o) {
    o = o || {};
    const tx = (C().tx || {})[txId] || {};
    const fv = (t) => DA.fmt(t, o.vars || undefined); // o.vars: the template values real play would have had
    const now = o.min != null ? o.min : DA.clock.min;
    let stamp = DA.clock.stamp(now), offsetSec = 0, originMin = now;
    const st = C().stampFor ? C().stampFor(Object.assign({}, tx, tx.offsetSec != null && !o.keepStamp ? { stamp: undefined } : {}), now) : null;
    if (o.keepStamp && tx.stamp) { originMin = DA.clock.toMin(tx.stamp.day, tx.stamp.h, tx.stamp.m); stamp = DA.clock.stamp(originMin); offsetSec = tx.offsetSec != null ? tx.offsetSec : Math.round((originMin - now) * 60); }
    else if (st) { stamp = DA.fmt(st.text); offsetSec = st.offsetSec; originMin = st.min; }
    const e = {
      txId, freq: tx.freq != null ? tx.freq : null, sender: fv(tx.sender || 'UNIDENTIFIED'), summary: fv(String(tx.summary || '').replace('{N19}', 'nineteen')),
      stamp, received: DA.clock.stamp(now), offset: null, status: o.status || 'LOGGED', logged: o.logged !== false,
      glitch: false, min: now, originMin, offsetSec: offsetSec != null ? Math.round(offsetSec) : null, offsetText: tx.offsetText ? DA.fmt(tx.offsetText) : null,
      responded: !!o.responded, auto: !!o.auto,
    };
    if (o.num != null) e.num = o.num;
    if (DA.state.radio && DA.state.radio.offsetUnit) e.offset = e.offsetText || U.fmtOffset(e.offsetSec);
    return radio('addEntry', Object.assign(e, o.patch || {}));
  }
  /** Under the station's roof (the ceiling speaker's reach): never outside, in the woods or on another map. */
  const inBuilding = () => (DA.world && typeof DA.world.inBuilding === 'function' ? !!world('inBuilding') : inStationInterior());
  /** Outside no longer holds together (ACT 2+ once the drive has looped): the woods lead back inside. */
  const woodsUnstable = () => !!DA.flag('outside_unstable') && (DA.state.act | 0) >= 2 && !rt.escaping && !DA.flag('ending');
  /**
   * The trail's two ends (woods_path by the building, woods_out on the road): in at one, past the
   * dump (woods_mid), out at the other — while outside still holds together, it simply loops.
   */
  function woodsEnd(end) {
    const w = rt.woods;
    if (!w || !w.mid || w.from === end) { rt.woods = { from: end, mid: false }; return; }
    rt.woods = null;
    if (!woodsUnstable()) thinkOnce('thoughts_woods_out');
  }
  /**
   * Time you cannot account for (the woods → the supply cupboard: "Ten minutes later"): the clock
   * jumps ahead `mins` — never past a clock hold, never while a room feed's countdown ties it to
   * real time, never once an ending has started.
   */
  function lostTime(mins) {
    if (DA.clock.frozen || feedLive() || DA.flag('ending')) return;
    const to = Math.min(DA.clock.min + mins, DA.clock.ceiling());
    if (to > DA.clock.min) DA.clock.min = to;
  }
  /** The station's ceiling speaker carries the desk radio to you: inside the building, out of earshot of the desk. */
  const ceilingHears = () => !atDesk() && inStationInterior() && inBuilding() && (+world('radioAudibility') || 0) <= 0.12;
  /** Mirror a room feed's steps as [SPEAKER] subtitles while the desk speaker is out of earshot. */
  function ceilingFeed(feedId) {
    const f = (C().roomfeed || {})[feedId];
    if (!f) return;
    const sess = DA.session;
    for (const st of f.steps) {
      DA.timers.after(+st.at || 0, () => {
        if (DA.session !== sess || rt.dying || !rt.ceilFeeds.has(feedId) || !ceilingHears()) return;
        if (st.cap) ui('subtitle', st.cap, { kind: 'radio', tag: '[SPEAKER]', name: '', clarity: 1, dur: 2.8 });
        if (st.sfx) sfx(st.sfx, { radio: true, vol: 0.35 });
        if (st.t) {
          ui('subtitle', DA.fmt(st.t), { kind: 'radio', speaker: st.s || 'you', tag: '[SPEAKER]', clarity: 1 });
          audio('voice', DA.fmt(st.t), st.s || 'you', { radio: true, clarity: 0.8, vol: 0.55 });
        }
      }, 'dir_ceiling:' + feedId);
    }
  }
  /** Stop a room feed on the desk and on the ceiling speaker (the rest of its steps never play). */
  function stopFeed(feedId) {
    radio('stopFeed', feedId);
    if (feedId == null) {
      for (const id of Array.from(rt.ceilFeeds)) DA.timers.cancelTag('dir_ceiling:' + id);
      rt.ceilFeeds.clear();
    } else {
      DA.timers.cancelTag('dir_ceiling:' + feedId);
      rt.ceilFeeds.delete(feedId);
    }
  }
  /** Start a forced room feed, mirrored on the ceiling speaker. */
  function playFeed(feedId, opts) {
    // (radio ends a running copy of this feed first — its roomfeed:end cancels the old ceiling echo)
    const p = P_(radio('roomFeed', feedId, Object.assign({ force: true }, opts || {})), null);
    rt.ceilFeeds.add(feedId);
    clockTick(); // the station clock turns real-time with the countdown, not a frame later
    ceilingFeed(feedId);
    return p;
  }

  /* ================================================================ death */
  function die(cause) {
    if (rt.dying || !DA.running) return;
    rt.dying = true;
    showDeath(cause);
  }
  /** Caught: every story await stops now; the death scene follows a beat later. */
  function caught() {
    if (rt.dying || !DA.running) return;
    rt.dying = true;
    const sess = DA.session;
    DA.timers.after(0.85, () => { if (DA.session === sess) showDeath('caught'); }, 'dir_death');
  }
  const dead = () => { if (rt.dying || ent('caught')) throw new DA.Cancelled(); };
  /**
   * What was really being said when you died (the last 3 lines): never the collapse flood's canned
   * fragments or an earlier death's lines (they are already canon), never system text or hints.
   */
  function deathLines() {
    if (!DA.ui || typeof DA.ui.historyRaw !== 'function') return (ui('history', 3) || []).slice();
    const norm = (t) => String(t || '').trim().toLowerCase();
    const canned = new Set();
    for (const f of C().fragments || []) canned.add(norm(f && (f.t || f)));
    // the flood replays earlier deaths' lines: only while it runs are they someone else's words
    if (DA.flag('collapse')) for (const d of (DA.meta && DA.meta.deaths) || []) for (const l of d.lines || []) canned.add(norm(typeof l === 'string' ? l : l && (l.text || l.t)));
    const dc = C().death || {};
    if (dc.call) canned.add(norm(dc.call));
    const raw = ui('historyRaw', 24) || [];
    return raw.filter((h) => h && h.text && h.kind !== 'system' && !canned.has(norm(h.text))).slice(-3).map((h) => h.text);
  }
  function showDeath(cause) {
    if (rt.deathShown) return;
    rt.deathShown = true;
    const info = { room: room(), map: mapId(), lines: deathLines(), cause: cause || 'caught', beat: S().beat };
    ent('stop');
    ent('window', false);
    stopFeed();
    if (rt.alarm) { try { rt.alarm.stop(0.2); } catch (e) { /* ignore */ } rt.alarm = null; }
    DA.setFlag('no_archive', true);
    ent('despawn');
    if (DA.scenes && DA.scenes.death) {
      P_(DA.scenes.death(info));
    } else {
      DA.recordDeath(info);
      if (!DA.archive.loadLatest()) DA.quitToTitle();
    }
  }
  D.die = (cause) => die(cause);

  /* ================================================================ ACT 0 + ACT 1 */
  async function runAct1(s) {
    s.check();
    if (!done('drive')) {
      setAct(0);
      setBeat('prologue');
      DA.clock.rate = RATE.act1;
      const dc = (C().drive || {}).arrive || {};
      const caps = (dc.captions || []).map((t, i) => ({ at: 2 + i * 6, text: t, dur: 6.5 }));
      if (DA.scenes && DA.scenes.drive) await s.do(P_(DA.scenes.drive({ kind: 'arrive', captions: caps.length ? caps : undefined, radioLine: dc.radio })));
      mark('drive');
    }
    ensureExplore();
    if (!done('arrived')) {
      setAct(0);
      setBeat('arrival');
      DA.clock.min = Math.max(DA.clock.min, ARRIVE);
      DA.clock.rate = RATE.tour;
      world('teleport', 'pt_arrive');
      ensureHollis('pt_hollis_start');
      obj('obj_go_inside');
      ui('fade', 1, 0);
      ui('fade', 0, 2.2);
      mark('arrived');
      checkpoint('ARRIVAL');
    }
    tourClock();
    await stepGreet(s);
    await stepTour(s);
    await stepTasks(s);
    await stepWoman(s);
    if (DA.flag('woman_responded') || done('pure_reveal')) return runAct2(s);
    return runPure(s);
  }

  /**
   * Decision 2: from the lot to Hollis's goodbye the clock crawls (RATE.tour ≈ 0.04 game-min/s) and
   * creeps to a stop at TOUR_CAP — however long the player keeps him waiting, ACT 1 starts ≈ 00:00.
   */
  function tourClock() {
    watch('tour_clock', () => {
      if (done('tour') || (DA.state.act | 0) > 1) return true;
      const m = DA.clock.min;
      DA.clock.rate = m < TOUR_CAP - 6 ? RATE.tour : Math.max(0, Math.min(RATE.tour, (TOUR_CAP - m) / 150));
      return false;
    });
  }
  function ensureHollis(at) {
    if (!world('npc', 'hollis')) world('addNpc', { id: 'hollis', at, tex: 'spr_hollis' });
  }

  async function stepGreet(s) {
    s.check();
    if (done('greet')) return;
    setAct(0);
    setBeat('arrival');
    ensureHollis('pt_hollis_start');
    DA.clock.rate = RATE.tour;
    await s.until(() => npcDist('hollis') < 3.3 || room() === 'lobby');
    faceNpc('hollis');
    await dlg(s, 'hollis_greet', { npc: 'hollis' });
    mark('greet');
  }

  /** Walk an NPC through points; resolves when it arrives (or the session ends). */
  function walk(s, id, pts, speed) {
    return s.do(P_(world('walkNpc', id, pts, speed || 1.3), false));
  }
  /**
   * Wait for the player to catch up with a guide (within earshot: `near` units, default 2.5) before
   * the stop's lines are spoken. Nudges at 11 s and 27 s, then every 30 s; after 40 s the guide walks
   * back to fetch the player (once per stop) and returns to the stop. Never gives up: nothing is
   * said to an empty room.
   */
  async function waitFollow(s, id, lines, opts) {
    opts = opts || {};
    const near = opts.near || 2.5;
    let t = 0, nudges = 0, fetched = false;
    const stop = (() => { const n = world('npc', id); return n ? { x: n.x, y: n.y, map: n.map } : null; })();
    while (npcDist(id) > near) {
      if (await s.until(() => npcDist(id) <= near, 1)) break;
      t += 1;
      const n = world('npc', id);
      const heard = n && n.map === mapId() && npcDist(id) < 9;
      if (lines && lines.length && heard && (t === 11 || t === 27 || (t > 27 && (t - 27) % 30 === 0))) {
        faceNpc(id);
        await sayLine(s, id, lines[nudges % lines.length], { npc: id });
        nudges++;
      }
      if (!fetched && t >= 40 && n && n.map === mapId() && !opts.noFetch) {
        fetched = true;
        const P = player();
        const back = world('path', n.x, n.y, P.x, P.y, n.map);
        if (back && back.length) {
          const q = back.length > 1 ? back[back.length - 2] : { x: P.x, y: P.y };
          await walk(s, id, [{ x: q.x, y: q.y, map: n.map }], 1.5);
          if (npcDist(id) < 4) { faceNpc(id); await sayLine(s, id, lines && lines.length ? lines[1 % lines.length] : 'This way.', { npc: id }); }
          if (stop) await walk(s, id, [stop], 1.3);
        }
      }
    }
  }

  async function stepTour(s) {
    s.check();
    if (done('tour')) return;
    setAct(1);
    setBeat('tour');
    busy(true);
    DA.clock.rate = RATE.tour;
    tourClock();
    ensureHollis('pt_hollis_start');
    obj('obj_follow_hollis');
    const stops = ((C().tour || {}).hollis || []).slice();
    await walk(s, 'hollis', ['pt_front_inside']);
    for (const [ptName, dlgId] of stops) {
      await walk(s, 'hollis', [ptName]);
      await waitFollow(s, 'hollis', HOLLIS_NUDGE);
      faceNpc('hollis');
      await dlg(s, dlgId, { npc: 'hollis' });
      await s.wait(0.5);
    }
    // the desk: 148.32 — said to your face, in the radio room
    await s.wait(0.7);
    await waitFollow(s, 'hollis', HOLLIS_NUDGE, { near: 3.2 });
    faceNpc('hollis');
    await dlg(s, 'hollis_148', { npc: 'hollis' });
    await s.wait(0.4);
    await waitFollow(s, 'hollis', HOLLIS_NUDGE, { near: 4 });
    const opts = ((C().choices || {}).hollis_148 || [{ id: 'why', text: 'Why?' }, { id: 'ok', text: 'Okay.' }]);
    const c = await s.do(P_(ui('choice', opts, {}), 'ok'));
    const picked = opts.find((o) => o.id === c) || opts[1] || opts[0];
    await sayLine(s, 'you', picked.text || picked.t);
    await s.wait(0.6);
    await dlg(s, c === 'why' ? 'hollis_why' : 'hollis_ok', { npc: 'hollis' });
    await s.wait(1.1);
    await dlg(s, 'hollis_bye', { npc: 'hollis' });
    objDone('obj_follow_hollis');
    await hollisLeaves(s);
    DA.setFlag('tour_done', true);
    DA.setFlag('hollis_gone', true);
    mark('tour');
    busy(false);
    await s.wait(1.5);
    await thought(s, 'thoughts_hollis_gone');
    hintOnce('watch', 1);
    hintOnce('journal', 6.5);
  }

  async function hollisLeaves(s) {
    const walking = walk(s, 'hollis', ['pt_front_inside', 'pt_front_outside', 'pt_hollis_exit', 'pt_hollis_car'], 1.4);
    const sess = DA.session;
    // shut the front door behind him
    run('hollis_door', async (x) => {
      await x.until(() => { const n = world('npc', 'hollis'); return !n || n.y > 25.2; }, 60);
      await x.wait(0.8);
      if (DA.session === sess && world('isOpen', 'front_door')) world('closeDoor', 'front_door');
    });
    await walking;
    const car = world('prop', 'hollis_car');
    const at = car ? { x: car.x, y: car.y, map: 'station' } : pt('pt_hollis_car');
    world('removeNpc', 'hollis');
    sfxAt('car_door', at, { vol: 0.9 });
    await s.wait(1.8);
    sfxAt('car_start', at, { vol: 1 });
    await s.wait(2.6);
    // headlights sweep the radio room window
    if (mapId() === 'station' && (room() === 'radio' || room() === 'lobby' || outdoors())) render('flash', 'rgba(255,236,196,0.16)', 1.3);
    sfxAt('car_away', at, { vol: 1 });
    world('setPropTex', 'hollis_car', 'spr_car2_lit');
    await driveProp(s, 'hollis_car', [drivePt('pt_drive_lot', 25.6, 33.4), drivePt('pt_drive_mouth', 25.5, 40.6), drivePt('pt_drive_road', 58.5, 40.5)], 7);
    world('removeProp', 'hollis_car');
  }
  /** Slide a car prop along a path (the lot → the road) over `secs`. */
  /** A driveway point (maps.js pt_drive_*) as [x, y], with a fallback. */
  function drivePt(name, fx, fy) {
    const q = pt(name);
    return q ? [q.x, q.y] : [fx, fy];
  }
  async function driveProp(s, id, path, secs, arriving) {
    const p = world('prop', id);
    if (!p) return;
    const pts = [[p.x, p.y]].concat(path);
    const steps = Math.max(1, Math.round(secs / 0.1));
    let len = 0;
    const segs = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); len += d; }
    for (let k = 1; k <= steps; k++) {
      const q = k / steps;
      let dd = len * (arriving ? 1 - (1 - q) * (1 - q) : q * q); // pulling away: slow, then gone; arriving: the reverse
      let i = 0;
      while (i < segs.length - 1 && dd > segs[i]) { dd -= segs[i]; i++; }
      const t = segs[i] ? Math.min(1, dd / segs[i]) : 1;
      world('moveProp', id, U.lerp(pts[i][0], pts[i + 1][0], t), U.lerp(pts[i][1], pts[i + 1][1], t), 'station');
      await s.wait(0.1);
    }
  }

  /* ---------------------------------------------------------------- the job */
  const TASKS = [
    { id: 'coffee', obj: 'obj_coffee' },
    { id: 'radio_check', obj: 'obj_radio_check' },
    { id: 'weather', obj: 'obj_weather' },
    { id: 'trucker', obj: 'obj_trucker' },
    { id: 'breaker', obj: 'obj_breaker' },
    { id: 'police', obj: 'obj_police' },
    { id: 'calendar', obj: 'obj_calendar' },
    { id: 'paperwork', obj: 'obj_paperwork' },
  ];
  const tdone = (id) => !!DA.flag('task_' + id);
  function completeTask(id) {
    if (tdone(id)) return;
    DA.setFlag('task_' + id, true);
    const t = TASKS.find((x) => x.id === id);
    if (t && objExists(t.obj)) objDone(t.obj);
  }
  function showTask(id) {
    const t = TASKS.find((x) => x.id === id);
    if (!t || objExists(t.obj)) return;
    obj(t.obj);
    if (tdone(id)) objDone(t.obj);
  }
  const PAPER_PREREQ = ['coffee', 'radio_check', 'weather', 'trucker', 'breaker', 'police'];

  async function stepTasks(s) {
    s.check();
    if (done('tasks')) return;
    setAct(1);
    setBeat('tasks');
    DA.clock.hold('act1', HOLD_AT);
    if (DA.clock.rate > RATE.act1 + 0.01 || DA.clock.rate < RATE.act1 - 0.01) DA.clock.rate = RATE.act1;
    const t0 = DA.simTime;
    showTask('radio_check');
    showTask('coffee');
    if (!tdone('radio_check') && !radioHasOutgoing('out_radio_check') && !done('radio_check_sent')) radio('addOutgoing', 'out_radio_check');
    watch('act1', () => {
      if (done('tasks')) return true;
      const el = DA.simTime - t0, m = DA.clock.min;
      if (!objExists('obj_trucker') && (el > 42 || tdone('radio_check'))) showTask('trucker');
      if (!objExists('obj_weather') && el > 75) showTask('weather');
      if (!objExists('obj_police') && (tdone('trucker') || el > 160)) showTask('police');
      if (!objExists('obj_calendar') && m >= MIDNIGHT) showTask('calendar');
      if (!done('breaker_tripped') && m >= BREAKER_AT && el > 50 && !anyAiring()) tripBreaker();
      if (!objExists('obj_paperwork') && PAPER_PREREQ.every(tdone)) showTask('paperwork');
      // the trucker and the sheriff call while their objectives are up
      if (objExists('obj_trucker') && !tdone('trucker') && !done('trucker_heard') && !rt.airing.has('tx_trucker_flat') && el > 44) truckerCall();
      if (objExists('obj_police') && !tdone('police') && !done('police_heard') && !rt.airing.has('tx_police_chatter')) policeCall();
      // nothing to do but wait for the next thing on the clock? let the clock run
      const open = TASKS.some((t) => objOpen(t.obj));
      const timed = (!done('breaker_tripped') && m < BREAKER_AT) || (!objExists('obj_calendar') && m < MIDNIGHT);
      let r = !open && timed && el > 25 && !anyAiring() ? RATE.idle : RATE.act1;
      // near 02:12 the clock creeps instead of stopping dead at a hold — the more chores still to
      // do, the longer its approach (a slow player does not watch 02:12 sit for many minutes)
      const left = TASKS.filter((t) => !tdone(t.id)).length;
      if (HOLD_AT - m < 40) r = Math.min(r, Math.max(RATE.creep, (HOLD_AT - m) / (150 + 45 * left)));
      DA.clock.rate = r;
      return false;
    });
    await s.until(() => TASKS.every((t) => tdone(t.id)));
    rt.tasksDoneAt = DA.simTime;
    mark('tasks');
    DA.clock.release('act1');
  }
  function radioHasOutgoing(id) { return !!(DA.state.radio && (DA.state.radio.outgoing || []).some((o) => o.id === id)); }

  function truckerCall() {
    once('trucker', async (s) => {
      const res = await s.do(air('tx_trucker_flat', { scan: null }));
      if (res && res.num == null) return; // stopped (reset): try again next time
      mark('trucker_heard');
      // answered him: that duty is done ("Radio County Dispatch." carries the relay)
      if (res && (res.responded || (res.choices && res.choices.start === 'respond'))) objDone('obj_trucker');
      if (!tdone('trucker') && !radioHasOutgoing('out_dispatch_flat')) radio('addOutgoing', 'out_dispatch_flat');
      await s.wait(1.2);
      if (!tdone('trucker')) obj('obj_call_dispatch');
    });
  }
  function policeCall() {
    once('police', async (s) => {
      const res = await s.do(air('tx_police_chatter', { scan: null }));
      if (res && res.num == null) return;
      mark('police_heard');
      await s.wait(1.5);
      const e = radio('find', 'tx_police_chatter');
      if (e && !e.logged) ui('hint', (C().hints || {}).log || 'L logs the current transmission.', 5);
    });
  }
  function tripBreaker() {
    mark('breaker_tripped');
    const P = player();
    world('flickerNear', 22.5, 15.5, 0.9, 'station');
    world('flickerNear', 32.5, 15.5, 0.9, 'station');
    DA.timers.after(0.7, () => {
      world('setBreaker', 'C', false);
      sfxAt('breaker_trip', { x: 19.7, y: 18.5, map: 'station' }, { vol: 0.9 });
      if (mapId() === 'station' && Math.hypot(P.x - 30, P.y - 15.5) < 20) sfx('power_down', { vol: 0.25 });
      if (objExists('obj_breaker')) ui('objective', 'obj_breaker');
      else showTask('breaker');
    }, 'dir_breaker');
  }

  /* ---------------------------------------------------------------- 02:13 */
  async function stepWoman(s) {
    s.check();
    if (done('woman')) return;
    DA.clock.release('act1');
    if (DA.clock.min < WOMAN_AT) {
      // a calm stretch after the last chore (≈25 real seconds at least), then 02:13 — never the
      // instant the report is filed
      const t0 = rt.tasksDoneAt != null ? rt.tasksDoneAt : DA.simTime - 26; // (a load / jump: no extra wait)
      while (DA.clock.min < WOMAN_AT) {
        const left = Math.max(1, 26 - (DA.simTime - t0));
        DA.clock.rate = U.clamp((WOMAN_AT - DA.clock.min) / left, 1 / 600, RATE.fast);
        await s.wait(0.25);
      }
    }
    setAct(1);
    setBeat('woman');
    busy(true);
    if (!done('woman_call')) {
      DA.clock.rate = RATE.woman;
      const res = await womanCall(s);
      if (res && (res.responded || res.choices && res.choices.start === 'respond')) DA.setFlag('woman_responded', true);
      else DA.setFlag('woman_logged', true);
      mark('woman_call');
    }
    if (!DA.flag('woman_responded')) {
      objRemove('obj_isolate');
      DA.clock.rate = RATE.pure;
      mark('woman');
      busy(false);
      return;
    }
    DA.clock.rate = RATE.reveal;
    // Kestrel Road on the wall map → County (until it is found, the mic on 155.34 says so)
    if (!done('kestrel_found')) {
      obj('obj_find_kestrel');
      kestrelMicNote(true);
      await s.until(() => done('kestrel_found'));
    }
    kestrelMicNote(false);
    if (!done('kestrel_reported')) {
      obj('obj_call_dispatch');
      if (!radioHasOutgoing('out_report_kestrel')) radio('addOutgoing', 'out_report_kestrel');
      await s.until(() => done('kestrel_reported'));
    }
    if (!done('kestrel_ack')) {
      await s.wait(1.2);
      await s.do(air('tx_dispatch_kestrel_ack', { noLock: true }));
      objDone('obj_call_dispatch');
      mark('kestrel_ack');
    }
    if (!done('dispatch_nothing')) {
      // stand by for County (a unit is driving up Kestrel Road)
      obj('obj_standby');
      await s.wait(U.rand(95, 115));
      await awaitOperator(s, { max: 60, nudge: 30 });
      await s.until(() => !anyAiring() && !radioBusy(), 30);
      await s.do(air('tx_dispatch_nothing', { noLock: true, ceiling: true }));
      objDone('obj_standby');
      mark('dispatch_nothing');
      await s.wait(1.2);
      await thought(s, 'thoughts_nothing_there');
    }
    await revealLog(s, radio('find', 'tx_woman'));
    mark('woman');
    busy(false);
  }

  /**
   * The Kestrel report is pending but not queued yet (the woman gave the road; it is not found on
   * the wall map): the empty mic panel on County's frequency says what is missing. Cleared once the
   * report is queued (map:located). DA.radio clears it on every runtime:reset; stepWoman sets it
   * again after a load.
   */
  function kestrelMicNote(on) {
    if (on && (done('kestrel_found') || done('kestrel_reported'))) on = false;
    radio('setMicNote', on ? (C().micNotes || {}).kestrel || '[find the location on the wall map first]' : null, on ? { freq: 155.34 } : undefined);
  }
  function womanCall(s) {
    obj('obj_isolate');
    const sess = DA.session;
    const p = air('tx_woman', { keepStamp: true, scan: null, ceiling: true });
    // the scanner stops by itself at 148.28, on a faint carrier; the rest is up to the operator
    const stopAtCarrier = () => {
      if (DA.session !== sess || !radio('isActive', 'tx_woman') || radio('isLocked', 'tx_woman')) return true;
      if (!atDesk() || !(DA.radio && DA.radio.power)) return false;
      if (Math.abs((DA.radio.freq || 0) - 148.32) > 0.045) radio('autoScan', 148.28);
      return true;
    };
    if (!stopAtCarrier()) {
      const off = DA.bus.on('radio:sit', () => { if (stopAtCarrier()) off(); }, { session: true });
    }
    // her first "anybody there" reaches the rest of the building faintly
    DA.timers.after(1.2, () => {
      if (DA.session !== sess || !ceilingHears()) return;
      const h = (((C().tx || {}).tx_woman || {}).hail || [])[0];
      if (h) ui('subtitle', h.t, { kind: 'radio', speaker: h.s, tag: '[SPEAKER]', clarity: 0.45 });
    }, 'dir_woman');
    const offLock = DA.bus.on('radio:lock', (e) => { if (e && e.txId === 'tx_woman') { objDone('obj_isolate'); offLock(); } }, { session: true });
    // nobody tunes her in: she fades after ~150 s of nobody trying (330 s at the very most) — seated
    // or not. Trying = the operator's own hand on the dial within ±0.15 MHz of 148.32 in the last
    // 30 s (the receiver parking itself on her carrier is not trying).
    let away = 0, total = 0, lastTry = -99;
    const offTry = DA.bus.on('radio:tuned', (e) => {
      if (e && e.manual && Math.abs((+e.freq || 0) - 148.32) <= 0.15) lastTry = DA.simTime;
    }, { session: true });
    const fade = DA.timers.every(1, () => {
      if (DA.session !== sess || !radio('isActive', 'tx_woman') || radio('isLocked', 'tx_woman')) { DA.timers.cancel(fade); offTry(); return; }
      total += 1;
      const trying = DA.simTime - lastTry <= 30 && !!(DA.radio && DA.radio.power);
      if (!trying) away += 1;
      if (away >= 150 || total >= 330) { DA.timers.cancel(fade); offTry(); radio('stop', 'tx_woman'); }
    }, 'dir_woman');
    return s.do(p);
  }

  /**
   * "Check the transmission log" → the stamp is wrong → "Check the date" → the calendar → stinger →
   * the OFFSET unit comes alive. entry: the reception whose stamp gives it away.
   */
  async function revealLog(s, entry) {
    s.check();
    if (!done('reveal_log')) {
      obj('obj_check_log');
      if (!rt.logOpen) {
        logHint(1.5);
        const sess = DA.session;
        // still not open a while later: say it again
        DA.timers.after(40, () => { if (DA.session === sess && objOpen('obj_check_log') && !rt.logOpen) logHint(0); }, 'dir_hint');
        await s.event('journal:log-open');
      }
      await s.wait(1.6);
      objDone('obj_check_log');
      await revealThought(s, entry);
      mark('reveal_log');
    }
    const dateOff = entry && entry.stamp && DA.devices && DA.devices.calendar && String(entry.stamp).slice(0, 11) !== String(DA.devices.calendar.date()).slice(0, 11);
    if (!done('reveal_date') && (dateOff || !entry)) {
      obj('obj_check_date');
      // the desk calendar, the wristwatch (T) or the station clock on the receiver all show the date
      await s.until(() => {
        if (done('date_checked')) return true;
        const seated = atDesk() && !DA.modes.has('journal') && plainView();
        if (!seated) rt.sitT = 0;
        else if (!rt.sitT) rt.sitT = DA.simTime;
        else if (DA.simTime - rt.sitT > 1.6) dateChecked();
        return done('date_checked');
      });
      objDone('obj_check_date');
      mark('reveal_date');
      await s.wait(1.2);
    } else if (!done('reveal_date')) {
      stinger('low');
      mark('reveal_date');
    }
    await s.wait(0.8);
    DA.setFlag('offset_unit', true);
    radio('setOffsetUnit', true);
  }
  /** Point at the transmission log: at the desk, the LOG BOOK / TAB; elsewhere the journal. */
  function logHint(delay) {
    const sess = DA.session;
    DA.timers.after(delay || 0, () => {
      if (DA.session !== sess || (DA.modes && DA.modes.has('journal'))) return;
      const H = C().hints || {};
      ui('hint', atDesk() ? H.logbook_desk || 'TAB, or the LOG BOOK on the desk: the transmission log.' : H.logbook || 'TAB opens the journal. The LOG tab.', 5);
    }, 'dir_hint');
  }
  /** "Check the date." — satisfied by the calendar, the watch or the receiver's station clock. */
  function dateChecked() {
    if (done('date_checked') || !objOpen('obj_check_date')) return;
    mark('date_checked');
    const sess = DA.session;
    DA.timers.after(1.4, () => {
      if (DA.session !== sess) return;
      stinger('low');
      thinkNow('thoughts_check_date');
    }, 'dir_cal');
  }
  async function revealThought(s, e) {
    const st = e && String(e.stamp || '');
    if (!e || /^28 OCT 1999/.test(st)) return thought(s, 'thoughts_log_stamp');
    if (/1961/.test(st)) return s.do(P_(ui('think', 'Nineteen sixty-one?'), true));
    if (e.originMin != null && e.min != null && e.originMin > e.min + 0.5) {
      await s.do(P_(ui('think', DA.fmt(st.replace(/^.*– /, '')) + '?'), true));
      // only while it really hasn't: a stamp the clock has since passed came in before it happened
      if (e.originMin > DA.clock.min + 0.5) return s.do(P_(ui('think', "That hasn't happened yet."), true));
      return s.do(P_(ui('think', lineOf('thoughts_stamp_passed', 'It came in before it happened.')), true));
    }
    return thought(s, 'thoughts_log_stamp');
  }

  /* ================================================================ PURE PATH */
  // Nothing happens, as long as nobody listens. Hourly readings, routine traffic to log, a
  // second breaker trip, a coffee refill — and three temptations on 148.32 that must only be logged.
  // temptation: true = on 148.32 (hails 150 s); routine traffic hails ~45 s. Every event keeps its
  // time on the clock: a call nobody tunes never pushes the next duty back.
  const PURE = [
    { id: 'p_monitor', at: tm(27, 2, 19), fn: () => { obj('obj_monitor'); obj('obj_log_traffic'); } },
    { id: 'p_cb1', at: tm(27, 2, 38), tx: 'tx_pure_cb_1' },
    { id: 'p_wx3', at: tm(27, 3, 0), wx: true },
    { id: 'p_child', at: tm(27, 3, 10), tx: 'tx_child_fire', temptation: true },
    { id: 'p_breaker', at: tm(27, 3, 34), breaker: true },
    { id: 'p_wx4', at: tm(27, 4, 0), wx: true },
    { id: 'p_faint', at: tm(27, 4, 5), tx: 'tx_future_you_faint', temptation: true },
    { id: 'p_police2', at: tm(27, 4, 28), tx: 'tx_pure_police_2' },
    { id: 'p_coffee', at: tm(27, 4, 46), coffee: true },
    { id: 'p_wx5', at: tm(27, 5, 0), wx: true },
    { id: 'p_girl', at: tm(27, 5, 20), tx: 'tx_girl_19', scan: 'exact', temptation: true },
    { id: 'p_cb2', at: tm(27, 5, 40), tx: 'tx_pure_cb_2' },
    { id: 'p_wx6', at: tm(27, 6, 0), wx: true },
    // the last stretch before the dawn: the sheriff going off nights, then the operator's own sense of it
    { id: 'p_police3', at: tm(27, 6, 22), tx: 'tx_pure_police_3' },
    { id: 'p_predawn', at: tm(27, 6, 33), fn: () => { if (nearRadio() || inStationInterior()) thinkOnce('thoughts_predawn'); } },
  ];
  async function runPure(s) {
    s.check();
    setAct(1);
    setBeat('pure');
    DA.clock.rate = RATE.pure;
    if (!done('pure_reveal')) {
      watch('predawn', () => {
        // a grey edge on the sky from 06:15 (the only night that ends on time)
        if ((DA.state.act | 0) >= 2 || !DA.isPure()) {
          // the night broke before it ended: no grey edge on the sky after all
          if ((+(DA.state.world || {}).daylight || 0) > 0 && (+(DA.state.world || {}).daylight || 0) < 0.2) world('setDaylight', 0);
          return true;
        }
        const m = DA.clock.min;
        if (m < PREDAWN) return false;
        if (m >= SUNRISE) return true;
        const want = 0.14 * U.smoothstep(PREDAWN, SUNRISE, m);
        if (Math.abs((+(DA.state.world || {}).daylight || 0) - want) > 0.01) world('setDaylight', want);
        return false;
      });
      for (const ev of PURE) {
        if (done(ev.id)) continue;
        await s.until(() => DA.clock.min >= ev.at || !DA.isPure() || DA.clock.min >= SUNRISE);
        if (!DA.isPure() || DA.clock.min >= SUNRISE) break;
        pureEvent(ev);
        if (!DA.isPure()) break;
      }
      if (DA.isPure()) {
        await s.until(() => DA.clock.min >= SUNRISE || !DA.isPure());
        if (DA.isPure()) {
          // a call already being answered plays out first
          await s.until(() => !anyAiring() || !DA.isPure() || !Array.from(rt.airing.keys()).some((id) => radio('isLocked', id)), 90);
          if (DA.isPure()) return runSecret(s);
        }
      }
      await pureReveal(s);
    }
    return runAct2(s);
  }
  /** One scheduled event of the ordinary night. Duties post on the hour; calls run on their own. */
  function pureEvent(ev) {
    if (ev.fn) ev.fn();
    if (ev.wx) {
      S().t.wxDue = ev.at;
      if (objExists('obj_weather_hourly')) ui('objective', 'obj_weather_hourly');
      else obj('obj_weather_hourly');
    }
    if (ev.breaker) {
      DA.setFlag('task_breaker', false);
      mark('breaker_tripped', false);
      tripBreaker();
    }
    if (ev.coffee) {
      S().t.refill = true;
      if (objExists('obj_coffee')) ui('objective', 'obj_coffee');
      else obj('obj_coffee');
    }
    if (!ev.tx) { mark(ev.id); return; }
    once('pure:' + ev.id, async (s) => {
      // queue briefly behind a call that is already on the air, then go out anyway
      await s.until(() => !anyAiring() || DA.clock.min >= SUNRISE, ev.temptation ? 40 : 20);
      if (DA.clock.min >= SUNRISE || !DA.isPure()) { mark(ev.id); return; }
      let over = false;
      air(ev.tx, { scan: ev.scan || 'near', hailTimeout: ev.temptation ? 150 : 45, busy: true }).then(() => { over = true; });
      // the dawn does not wait for a call nobody tuned in; a response still plays out
      await s.until(() => over || (DA.clock.min >= SUNRISE && DA.isPure() && !radio('isLocked', ev.tx)));
      if (!over) radio('stop', ev.tx);
      mark(ev.id);
    });
  }
  function revealEntry(reason) {
    const m = /^(?:respond|outgoing):(.*)$/.exec(reason || '');
    let id = m ? m[1] : null;
    if (id === 'out_warn_fire') id = 'tx_child_fire';
    if (id && radio('find', id)) return radio('find', id);
    const log = radio('entries') || [];
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.originMin != null && e.min != null && Math.abs(e.originMin - e.min) > 1) return e;
    }
    return radio('find', 'tx_woman') || null;
  }
  async function pureReveal(s) {
    s.check();
    if (done('pure_reveal')) return;
    busy(true);
    await s.until(() => !anyAiring() && !radioBusy(), 120);
    const reason = String(DA.flag('first_interference') || '');
    if (reason === 'outgoing:out_warn_fire' && !done('fire_confirm')) {
      // the warning worked: County found the scorched heater tonight — "How'd you know?" (then the stamp).
      // A deputy has to drive out there first: fireAt (send + 15 game-min) is written by the send
      // listener, possibly after this runs — wait for it, or derive it from now.
      const t = S().t;
      await s.until(() => t.fireAt != null, 20);
      if (t.fireAt == null) t.fireAt = DA.clock.min + 15;
      await s.until(() => DA.clock.min >= t.fireAt, 150);
      await awaitOperator(s, { max: 60, nudge: 30 });
      await s.until(() => !anyAiring() && !radioBusy() && !feedLive(), 60);
      await s.do(air('tx_fire_confirm', { noLock: true, ceiling: true, busy: true }));
      if (!done('fire_confirm')) confirmSave('fire_confirm', 'tx_child_fire');
      await s.wait(1.2);
    } else if (/^outgoing:/.test(reason) && !done('generic_nothing')) {
      await s.wait(U.rand(35, 50));
      await awaitOperator(s, { max: 60, nudge: 30 });
      await s.until(() => !anyAiring() && !radioBusy(), 30);
      await s.do(air('tx_generic_nothing', { noLock: true, ceiling: true }));
      mark('generic_nothing');
      await s.wait(1.2);
    }
    await revealLog(s, revealEntry(reason));
    mark('pure_reveal');
    busy(false);
  }
  /** A warning came true the other way: somebody out there is alive. It costs something in here. */
  function confirmSave(step, txId) {
    if (done(step)) return;
    mark(step);
    if (step === 'bridge_thanks') { radio('removeOutgoing', 'out_warn_bridge'); radio('removeOutgoing', 'out_warn_bridge_dispatch'); }
    DA.addVar('saved', 1);
    radio('editEntry', txId, { status: (C().log || {}).resolved || 'RESOLVED' });
    rt.rewardEnd = DA.simTime;
    const sess = DA.session;
    // …and the building answers: every light stutters, a door bangs somewhere
    DA.timers.after(3.2, () => {
      if (DA.session !== sess || rt.dying || mapId() !== 'station') return;
      for (const [x, y] of [[17.5, 11], [22.5, 15.5], [32.5, 15.5], [33.5, 10.8], [27.5, 11], [32.5, 19.5], [42.5, 19.5]]) world('flickerNear', x, y, 1.6, 'station');
      sfxAt('door_close', { x: 42.5, y: 17.2, map: 'station' }, { vol: 0.9 });
      // (it waits its turn: never on top of another thought or the log/date reveal that may follow)
      if (!done('th:thoughts_saved_cost')) {
        mark('th:thoughts_saved_cost');
        DA.timers.after(1.6, () => {
          if (DA.session !== sess) return;
          run('saved_cost', async (x) => {
            await x.until(() => rt.thinking === 0 && !rt.carding && !(DA.state.act === 2 && !done('a2_start')) && !objOpen('obj_check_log') && !objOpen('obj_check_date') && !(DA.modes && (DA.modes.has('journal') || DA.modes.has('doc'))), 90);
            await x.wait(0.8);
            await thought(x, 'thoughts_saved_cost');
          });
        }, 'dir_saved');
      }
    }, 'dir_saved');
  }

  /* ================================================================ SECRET ENDING */
  async function runSecret(s) {
    s.check();
    setBeat('secret');
    if (!done('s_start')) {
      mark('s_start');
      checkpoint('SUNRISE');
    }
    busy(true);
    // the shift's routine is done; anything answered from here on still counts
    for (const id of ['obj_monitor', 'obj_log_traffic']) if (objExists(id)) objDone(id);
    for (const id of ['obj_weather_hourly', 'obj_coffee', 'obj_breaker']) objRemove(id);
    for (const o of ((DA.state.radio && DA.state.radio.outgoing) || []).slice()) if (o.future) radio('removeOutgoing', o.id);
    for (const id of Array.from(rt.airing.keys())) if ((((C().tx || {})[id]) || {}).future) radio('stop', id);
    DA.state.sunrise = SUNRISE;
    DA.setFlag('sunrise_unknown', false);
    DA.clock.rate = RATE.pure;
    dawn(0.72, 26);
    const broken = () => !DA.isPure();
    await s.until(broken, 5);
    if (!broken()) await thought(s, 'thoughts_dawn');
    await s.until(broken, 5);
    if (!broken()) await replacementArrives(s);
    if (!broken()) {
      obj('obj_handover');
      await reliefFindsYou(s, broken);
    }
    if (!broken()) {
      faceNpc('replacement');
      await dlg(s, handoverDialogue(), { npc: 'replacement' });
      objDone('obj_handover');
      mark('handover');
      // she takes the chair (once you have stepped away from it — never through you); you sign
      // out (Hollis: "They check.") and go home. The desk is hers now.
      reliefTakesChair();
      await s.wait(1);
      obj('obj_leave');
      if (!DA.flag('signed_out')) obj('obj_signout');
      rt.canLeave = 'secret';
      // a night operator who lingers gets one nudge
      const t0 = DA.simTime;
      await s.until(() => rt.leaving === 'secret' || broken() || (DA.simTime - t0 > 60 && inStationInterior()));
      if (rt.leaving !== 'secret' && !broken()) {
        await reliefSays(s, 'replacement_go_home', "Go home. I've got it.");
        await s.until(() => rt.leaving === 'secret' || broken());
      }
    }
    if (broken() && rt.leaving !== 'secret') return brokenDawn(s);
    objDone('obj_leave');
    S().recap = recapKey();
    await endGame(s, 'secret');
  }
  /** Purity broke after sunrise: the dawn goes back out. The night is not over. */
  async function brokenDawn(s) {
    rt.canLeave = false;
    busy(false);
    for (const id of ['obj_handover', 'obj_leave', 'obj_signout', 'obj_monitor', 'obj_log_traffic']) objRemove(id);
    mark('s_broken');
    stinger('low');
    render('glitch', 0.6, 0.9);
    world('setWeather', { rain: 0.85, thunder: 0.5 });
    const from = +((DA.state.world || {}).daylight) || 0;
    rt.dawnGen = (rt.dawnGen || 0) + 1; // stop the sunrise ramp
    run('undawn', async (x) => { for (let i = 1; i <= 16; i++) { world('setDaylight', U.lerp(from, 0, i / 16)); await x.wait(0.4); } });
    const hadRelief = !!world('npc', 'replacement');
    world('removeNpc', 'replacement');
    world('removeProp', 'replacement_car');
    DA.state.sunrise = DA.clock.min + 35;
    // the dawn going back out is the moment: no "Six forty-two." / "The day man should be here." on top of it
    mark('th:thoughts_sunrise');
    mark('th:thoughts_relief_late');
    await s.wait(3);
    await thought(s, 'thoughts_dawn_fail');
    if (hadRelief) { await s.wait(0.6); await thought(s, 'thoughts_relief_gone'); }
    await pureReveal(s);
    return runAct2(s);
  }
  /** What the researchers say about the shift (content endings.post_secret reads it). */
  function recapKey() {
    const duties = ['task_coffee', 'task_weather', 'task_breaker', 'task_paperwork'].every((f) => DA.flag(f)) && !objOpen('obj_weather_hourly');
    const log = radio('entries') || [];
    const reserved = log.filter((e) => e.freq != null && Math.abs(e.freq - 148.32) < 0.03);
    const logged = reserved.length > 0 && reserved.every((e) => e.logged);
    return duties && logged ? 'full' : duties ? 'unlogged' : logged ? 'duties' : 'idle';
  }
  /** The handover lines fit the night: 'Nothing I answered.' only if something came in on 148.32. */
  function handoverDialogue() {
    const log = radio('entries') || [];
    const heard = log.some((e) => e.freq != null && Math.abs(e.freq - 148.32) < 0.03);
    const D2 = C().dialogue || {};
    return !heard && D2.secret_handover_quiet ? 'secret_handover_quiet' : 'secret_handover';
  }
  /** The collapse is over: no more instability glitching, no jam. */
  function calm() {
    const inst = DA.v('instability');
    if (inst) DA.addVar('instability', -inst);
    radio('jam', 0);
  }
  /** Slowly bring the daylight up (dawn), the storm down. */
  function dawn(target, secs) {
    const from = +((DA.state.world || {}).daylight) || 0;
    const gen = (rt.dawnGen = (rt.dawnGen || 0) + 1);
    world('setWeather', { rain: 0.28, thunder: 0 });
    run('dawn', async (s) => {
      const n = Math.max(1, Math.round(secs / 0.5));
      for (let i = 1; i <= n; i++) {
        if (rt.dawnGen !== gen) return; // a newer ramp (or the dawn going back out) took over
        world('setDaylight', U.lerp(from, target, U.smoothstep(0, 1, i / n)));
        await s.wait(0.5);
      }
    });
  }
  /**
   * The relief pulls into the lot and walks to the door (secret + maintain endings): her car (the
   * map's hidden replacement_car, else a new prop) is shown out on the road, drives in with its
   * engine and headlights (a sweep through the radio-room window / the lobby glass / across the
   * lot), idles, stops; the door; then she gets out beside it. It stays parked there.
   */
  const REPLACEMENT_ROAD = [58.5, 40.5];
  async function replacementArrives(s) {
    if (world('npc', 'replacement')) return;
    const car = pt('pt_replacement_car') || { x: 37.3, y: 29.6, map: 'station' };
    const [rx, ry] = drivePt('pt_drive_road', REPLACEMENT_ROAD[0], REPLACEMENT_ROAD[1]);
    const mouth = drivePt('pt_drive_mouth', 25.5, 40.6), lot = drivePt('pt_drive_lot', 25.6, 33.4);
    if (!world('prop', 'replacement_car')) world('addProp', { id: 'replacement_car', x: rx, y: ry, map: 'station', tex: 'spr_car2', flip: true, solid: true, radius: 0.8 });
    else world('moveProp', 'replacement_car', rx, ry, 'station');
    world('setPropTex', 'replacement_car', 'spr_car2_lit');
    world('showProp', 'replacement_car', true);
    const eng = audio('loop', 'car_drive', { x: rx, y: ry, map: 'station', vol: 0.85, speed: 0.35 });
    const follow = DA.timers.every(0.1, () => { const p = world('prop', 'replacement_car'); if (p && eng && eng.setPos) try { eng.setPos(p.x, p.y, 'station'); } catch (e) { /* ignore */ } });
    const sweep = (a, d) => { if (mapId() === 'station' && (room() === 'radio' || room() === 'lobby' || outdoors())) render('flash', 'rgba(255,236,196,' + a + ')', d); };
    let swept = false;
    const turnIn = DA.timers.every(0.1, () => {
      const p = world('prop', 'replacement_car');
      if (!swept && p && Math.hypot(p.x - lot[0], p.y - lot[1]) < 2.2) { swept = true; sweep(0.18, 1.4); }
    });
    await driveProp(s, 'replacement_car', [mouth, lot, [car.x, car.y]], 9, true);
    DA.timers.cancel(follow);
    DA.timers.cancel(turnIn);
    if (!swept) sweep(0.14, 1.2);
    if (eng && eng.stop) try { eng.stop(1.2); } catch (e) { /* ignore */ }
    const idle = audio('loop', 'car_idle', { x: car.x, y: car.y, map: 'station', vol: 0.6 });
    await s.wait(1.6);
    if (idle && idle.stop) try { idle.stop(0.6); } catch (e) { /* ignore */ }
    world('setPropTex', 'replacement_car', 'spr_car2'); // engine off, lights off
    await s.wait(0.7);
    sfxAt('car_door', car, { vol: 0.9 });
    if (mapId() === 'station' && (outdoors() || room() === 'lobby')) caption('[a car door, out in the lot]', 2.4);
    await s.wait(0.9);
    world('addNpc', { id: 'replacement', map: 'station', x: car.x - 1.2, y: car.y - 0.7, tex: 'spr_replacement', angle: 250 });
    await walk(s, 'replacement', ['pt_replacement_arrive'], 1.2);
  }
  /** One line from the relief: spoken if you are near (or she is in view), else it carries through the building. */
  async function reliefSays(s, key, fallback) {
    const l = ((C().dialogue || {})[key] || [])[0];
    const txt = (l && l.t) || fallback;
    const n = world('npc', 'replacement');
    if (atDesk() || (n && n.map === mapId() && npcDist('replacement') < 14)) { faceNpc('replacement'); await sayLine(s, 'replacement', txt, { npc: 'replacement' }); }
    else if (inStationInterior()) ui('subtitle', DA.fmt(txt), { kind: 'speech', speaker: 'replacement', dur: 2.8 });
  }
  /**
   * After the handover the relief takes the chair — only once the night operator has stepped a
   * little way off it (she waits beside you, never walking through you), then faces the desk.
   */
  function reliefTakesChair() {
    once('relief_chair', async (x) => {
      const chair = pt('pt_radio_chair');
      if (!chair) return;
      await x.until(() => !world('npc', 'replacement') || (distTo(chair) > 1.6 && distTo('pt_desk_stand') > 1.2), 90);
      const n = world('npc', 'replacement');
      if (!n || n.map !== 'station') return;
      await walk(x, 'replacement', [{ x: chair.x, y: chair.y, map: 'station' }], 1.1);
      const n2 = world('npc', 'replacement');
      if (n2) n2.angle = 270;
      mark('relief_seated');
    });
  }
  /**
   * The relief does not wait in the rain for someone who never comes to the door: she knocks, lets
   * herself in, calls out, and comes looking — to the radio room, then to wherever you are. Resolves
   * when she is face to face with you (a seated operator stands up to meet her). `abort` () → bool.
   */
  async function reliefFindsYou(s, abort) {
    abort = abort || (() => false);
    const id = 'replacement';
    const near = () => npcDist(id) < 2.6 || abort();
    const D2 = C().dialogue || {};
    const call = async (key, fallback) => {
      const l = (D2[key] || [])[0];
      const n = world('npc', id);
      const txt = (l && l.t) || fallback;
      if (atDesk() || (n && n.map === mapId() && npcDist(id) < 14)) await sayLine(s, id, txt, { npc: id });
      else if (inStationInterior()) ui('subtitle', DA.fmt(txt), { kind: 'speech', speaker: id, dur: 2.8 }); // her voice carries through the building
    };
    if (await s.until(near, 3)) return;
    sfxAt('knock3', { x: 32.5, y: 23.7, map: 'station' }, { vol: 1 });
    if (mapId() === 'station' && (inStationInterior() || distTo({ x: 32.5, y: 24, map: 'station' }) < 16)) caption('[knocking at the front door]', 3);
    if (await s.until(near, 12)) return;
    // she lets herself in ("The door was open." only if it was)
    const wasOpen = !!world('isOpen', 'front_door');
    await walk(s, id, ['pt_front_inside'], 1.25);
    if (near()) return;
    await call(wasOpen ? 'replacement_hello' : 'replacement_hello_shut', wasOpen ? 'Hello? Night operator? The door was open.' : 'Hello? Night operator? I let myself in.');
    if (await s.until(near, 6)) return;
    // the radio room is where the night operator lives
    let arrived = false;
    P_(world('walkNpc', id, ['pt_tour_lobby', 'pt_entity_radio_door', 'pt_tour_radio'], 1.2), false).then(() => { arrived = true; });
    await s.until(() => near() || arrived || (atDesk() && room() === 'radio' && npcDist(id) < 4.2), 45);
    if (abort()) return;
    if (atDesk() && npcDist(id) < 5) { radio('stand'); await s.wait(0.4); const n = world('npc', id); if (n) world('lookAt', n.x, n.y, 0.6); }
    // then wherever you are: she keeps looking (and calling) until she finds you
    for (let k = 0; !near(); k++) {
      const n = world('npc', id), P = player();
      if (n && n.map === mapId()) {
        const path = world('path', n.x, n.y, P.x, P.y, n.map);
        const q = path && path.length > 1 ? path[path.length - 2] : { x: P.x, y: P.y };
        world('walkNpc', id, [{ x: q.x, y: q.y, map: n.map }], 1.3);
      }
      if (k % 4 === 1) await call('replacement_hello_2', 'Hello? Anybody here?');
      if (await s.until(near, 6)) break;
    }
    if (atDesk()) { radio('stand'); await s.wait(0.4); }
    world('stopNpc', id);
  }
  /** Every entity activity ends (an ending has started / ended): no stalk, hunt, glimpse or window. */
  function stopEntity() {
    if (rt.stalking) { rt.stalking = false; rt.stalkPaused = false; ent('stalk', false); }
    ent('stop', { all: true });
    ent('danger', false);
    ent('despawn', { all: true });
    ent('window', false);
  }
  async function endGame(s, id) {
    DA.setFlag('ending', id);
    DA.bus.emit('ending:start', { id });
    stopEntity();
    radio('jam', 0);
    if (DA.scenes && DA.scenes.ending) await s.do(P_(DA.scenes.ending(id), 'done'));
  }

  /* ================================================================ ACT 2 — THE LONG NIGHT */
  async function runAct2(s) {
    s.check();
    setAct(2);
    if (!done('a2_start')) {
      setBeat('act2');
      DA.setFlag('act2', true);
      DA.setFlag('offset_unit', true);
      radio('setOffsetUnit', true);
      for (const id of ['obj_log_traffic', 'obj_weather_hourly', 'obj_coffee', 'obj_isolate']) objRemove(id);
      await s.wait(1.8);
      await card(s, 'act2');
      mark('a2_start');
      checkpoint('THE LONG NIGHT');
    }
    setNightRate(RATE.night2);
    radio('setScanning', true);
    obj('obj_monitor');
    act2Watchers();
    if (!done('a2_17')) setBeat('act2');
    await airStep(s, 'a2_truck', 'tx_truck_breakdown', { optional: true, gap: [14, 20] });
    await feedStep(s, 'a2_chair', 'rf_chair');
    await airStep(s, 'a2_bridge', 'tx_bridge', { optional: true });
    await feedStep(s, 'a2_glass', 'rf_glass');
    await airStep(s, 'a2_pursuit', 'tx_pursuit', { optional: true });
    await airStep(s, 'a2_child', 'tx_child_fire', { optional: true, skipIf: () => !!radio('find', 'tx_child_fire') });
    await breathStep(s);
    await airStep(s, 'a2_amb', 'tx_ambulance', { optional: true });
    if (!done('a2_unstable')) { DA.setFlag('outside_unstable', true); mark('a2_unstable'); }
    await airStep(s, 'a2_three', 'tx_three_years', { optional: true });
    // a reward already on its way lands before #17
    await s.until(() => !rewardPending(), 150);
    if (!done('a2_17')) {
      setBeat('future17');
      await gap(s, [15, 22]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      paceTo(tm(27, 3, 45), 50);
      topUpLog(16);
      const num = radioNext() === 17 ? 17 : undefined;
      await airStory(s, 'tx_future_you_17', { scan: 'near', busy: true, num });
      mark('a2_17');
      objRemove('obj_warn_bridge');
    }
    if (!done('a2_tape')) {
      // the payoff: your own voice on the station's cassette. It plays only to an operator at (or
      // within earshot of) the desk with the set on — away or switched off, it waits (the receiver
      // calls you back); "That's my voice." only after it was actually heard.
      setBeat('future17');
      busy(true);
      await s.wait(2.4);
      let played = false;
      if (((DA.state.radio && DA.state.radio.recordings) || []).length) {
        for (let tries = 0; tries < 5 && !played; tries++) {
          await awaitOperator(s, { nudge: 25 });
          await s.until(() => !!(DA.radio && DA.radio.power), 75);
          if (!(DA.radio && DA.radio.power) || !nearRadio()) continue;
          played = !!(await s.do(P_(radio('playSelf', 0), false)));
          await s.wait(0.8);
        }
      }
      if (played) radio('editEntry', 'tx_future_you_17', { sender: (C().log || {}).operator || 'STATION 14 (OPERATOR)' });
      mark('a2_tape');
      busy(false);
      if (played) await thought(s, 'thoughts_voice');
    }
    if (!done('a2_photo')) { DA.setFlag('photo_four', true); mark('a2_photo'); }
    if (!done('a2_18')) {
      setBeat('girl19');
      await gap(s, [16, 24]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_18', { scan: 'exact', bearing: null, busy: true });
      mark('a2_18');
    }
    if (!done('a2_19')) {
      setBeat('girl19');
      busy(true);
      await s.wait(2.2);
      await awaitChannel(s);
      await awaitOperator(s, { max: 30 });
      // the receiver starts scanning by itself: 148.32. If she already called tonight (the ordinary
      // night, before it broke), this is her second call — never the same words twice.
      const again = !!radio('find', 'tx_girl_19') && !!(C().tx || {}).tx_girl_19_again;
      const res = await airStory(s, again ? 'tx_girl_19_again' : 'tx_girl_19', { scan: 'exact', busy: true });
      DA.setFlag('girl_choice', (res && res.choice) || (res && res.timedOut ? 'silence' : 'none'));
      DA.setFlag('sunrise_unknown', true);
      mark('a2_19');
      paceTo(tm(27, 4, 5), 60);
      busy(false);
      if (rt.girlName) { await s.wait(1.5); await thought(s, 'thoughts_girl'); }
    }
    if (!done('a2_records')) {
      const t0 = DA.simTime;
      await s.until(() => (DA.simTime - t0 > 60 && (atDesk() || (room() === 'radio' && mapId() === 'station'))) || DA.simTime - t0 > 150);
      mark('a2_records');
    }
    return runAct3(s);
  }

  async function airStep(s, id, txId, o) {
    s.check();
    if (done(id)) return null;
    o = o || {};
    if (o.skipIf && o.skipIf()) { mark(id); return null; }
    if (o.optional && radioNext() > 14) { mark(id); return null; }
    await gap(s, o.gap || [12, 20]);
    // never on top of another voice: a reward (and its quiet after), a feed, a tape
    await awaitChannel(s);
    await awaitOperator(s, { max: o.wait || 50 });
    await awaitChannel(s);
    if (o.optional && radioNext() > 14) { mark(id); return null; }
    const res = await s.do(air(txId, { scan: o.scan || 'near', hailTimeout: o.hailTimeout || 110, busy: true }));
    mark(id);
    return res;
  }
  async function feedStep(s, id, feedId) {
    s.check();
    if (done(id)) return;
    await gap(s, [10, 16]);
    await awaitChannel(s);
    await awaitOperator(s, { desk: true });
    await waitDesk(s);
    busy(true);
    await s.do(P_(radio('autoScan', 14.0), false));
    const fp = P_(radio('roomFeed', feedId), null);
    clockTick();
    await s.do(fp);
    await s.wait(1);
    busy(false);
    mark(id);
    if (!done('note_room')) { radio('addNote', (C().notebook || {}).room || { freq: 14, label: '014.00 — ???', hand: 'you' }); mark('note_room'); }
  }
  async function breathStep(s) {
    s.check();
    if (done('a2_breath')) return;
    await gap(s, [12, 18]);
    await awaitChannel(s);
    await awaitOperator(s, { desk: true });
    await waitDesk(s);
    busy(true);
    // the receiver holds still on 000.00 while you listen (no self-sweep off the breathing)
    const scanning = !!(DA.state.radio && DA.state.radio.scanning);
    radio('setScanning', false);
    await s.do(P_(radio('autoScan', 0.0), false));
    const mine = await s.event('radio:breathing', (e) => !!(e && e.mine), 40);
    if (mine) await s.wait(4);
    if (scanning) radio('setScanning', true);
    busy(false);
    radio('addNote', (C().notebook || {}).breath || { freq: 0, label: '000.00', hand: 'you' });
    mark('a2_breath');
    if (mine) await thought(s, 'thoughts_breath');
  }
  /** The chair in the radio room moves (rf_chair, +7 s). Seated in it, you feel it. */
  function chairMove() {
    if (done('chair_moved')) return;
    mark('chair_moved');
    const c = world('prop', 'chair');
    if (!c) return;
    sfxAt('chair_scrape', { x: c.x, y: c.y, map: c.map || 'station' }, { vol: 1 });
    world('setProp', 'chair', { frame: 1, flip: !c.flip });
    world('moveProp', 'chair', c.x + 0.16, c.y + 0.12);
    if (atDesk()) {
      sfx('chair_scrape', { vol: 0.9 });
      sfx('creak', { vol: 0.5 });
      radio('jolt', 1);
      caption('[the chair shifts under you]', 2.6);
    } else if (mapId() === 'station' && room() === 'radio') caption('[the chair scrapes across the floor]', 2.6);
  }
  /** Something falls from the radio-room shelf (rf_glass, +7 s). */
  function jarFall() {
    if (done('jar_fallen')) return;
    mark('jar_fallen');
    const j = world('prop', 'jar');
    if (!j) return;
    sfxAt('glass_break', { x: j.x, y: j.y, map: j.map || 'station' }, { vol: 1 });
    world('setProp', 'jar', { z: 0, scale: 0.11 });
    world('setPropTex', 'jar', 'spr_debris');
    world('moveProp', 'jar', j.x + 0.28, j.y + 0.42);
    if (atDesk()) { radio('jolt', 0.5); caption('[glass shatters on the floor behind you]', 2.6); }
    else if (mapId() === 'station' && room() === 'radio') caption('[the jar falls from the shelf and shatters]', 2.6);
  }

  function rewardWindow() {
    if ((DA.state.act | 0) < 2 || anyAiring() || radioBusy() || feedLive() || rt.busy > 0) return false;
    return (!done('a2_17') && radioNext() <= 16) || done('a2_19');
  }
  function act2Watchers() {
    // the mug is in the kitchen
    watch('mug', () => {
      if (DA.flag('mug_moved')) return true;
      if (!done('a2_chair') || !DA.flag('mug_on_desk')) return false;
      if (mapId() === 'station' && ['radio', 'kitchen'].includes(room())) return false;
      DA.setFlag('mug_moved', true);
      DA.setFlag('mug_on_desk', false);
      world('pointProp', 'mug', 'pt_mug_kitchen');
      world('setProp', 'mug', { z: 0.33 });
      world('showProp', 'mug', true);
      return true;
    });
    watch('mug_seen', () => {
      if (done('mug_seen')) return true;
      if (!DA.flag('mug_moved') || mapId() !== 'station' || room() !== 'kitchen') return false;
      const m = world('prop', 'mug');
      if (!m || Math.hypot(m.x - player().x, m.y - player().y) > 4.2) return false;
      mark('mug_seen');
      thinkNow('thoughts_mug');
      return true;
    });
    // a door you shut is open — or, if you never shut one, a door you left open is shut
    watch('door', () => {
      if (done('door_seen')) return true;
      const id = S().doorManifest;
      const P = player();
      const hasSee = !!(DA.world && typeof DA.world.canSee === 'function');
      /** In the view, in line of sight, within `max` units (DA.world.canSee: FOV + LOS). */
      const sees = (dx, dy, max) => mapId() === 'station' && (hasSee
        ? !!world('canSee', dx, dy, { maxDist: max, mapId: 'station' })
        : Math.hypot(dx - P.x, dy - P.y) <= max && Math.abs(+world('facing', dx, dy) || 0) < 0.9 && !!world('lineOfSight', P.x, P.y, dx, dy, 'station'));
      // it moves where you are not looking, and never right at your back
      const unseen = (dx, dy) => mapId() !== 'station' || (!sees(dx, dy, 14) && Math.hypot(dx - P.x, dy - P.y) > 3);
      /** Your side of the door leaf (a shut door hides its own centre from line of sight). */
      const face = (d) => {
        const cx = d.x + 0.5, cy = d.y + 0.5;
        return d.axis === 'v' ? { x: cx + (P.x >= cx ? 0.3 : -0.3), y: cy } : { x: cx, y: cy + (P.y >= cy ? 0.3 : -0.3) };
      };
      if (!id) {
        if (!done('a2_bridge')) return false;
        let cand = S().lastClosed;
        let d = cand && world('door', cand);
        if (d && !world('isOpen', cand) && !d.locked) {
          const f = face(d);
          if (!unseen(f.x, f.y)) return false;
          world('openDoor', cand, true);
          S().doorManifest = cand;
          S().doorKind = 'open';
          return false;
        }
        if (!done('a2_glass')) return false;
        // never shut one: shut one you left open (the last you opened, then any other you left
        // open — DA.world.doorsLeftOpen — and only if you left none, any open one)
        const left = (world('doorsLeftOpen', 'player', 'station') || []).filter((x) => STATION_DOORS.includes(x));
        const pool = [S().lastOpened].concat(left, left.length ? [] : STATION_DOORS).filter((x, i, a) => x && a.indexOf(x) === i);
        for (cand of pool) {
          d = world('door', cand);
          if (!d || d.locked || !world('isOpen', cand)) continue;
          const f = face(d);
          if (!unseen(f.x, f.y)) continue;
          world('closeDoor', cand, true);
          S().doorManifest = cand;
          S().doorKind = 'shut';
          return false;
        }
        return false;
      }
      const d = world('door', id);
      if (!d) return true;
      const shut = S().doorKind === 'shut';
      if (world('isOpen', id) === shut) { mark('door_seen'); return true; } // put back unseen
      const f = face(d);
      if (sees(f.x, f.y, 6.5)) {
        mark('door_seen');
        thinkNow(shut ? 'thoughts_door_closed' : 'thoughts_door_open');
        return true;
      }
      return false;
    });
    // the bridge and the fire: somebody out there says thank you
    watch('rewards', () => {
      const m = DA.clock.min, t = S().t;
      if (DA.flag('bridge_warned') && !done('bridge_thanks') && t.bridgeAt != null && m >= t.bridgeAt && rewardWindow()) {
        once('reward_bridge', (s) => rewardSeq(s, 'tx_bridge_thanks', 'bridge_thanks', 'tx_bridge'));
      }
      if (DA.flag('fire_warned') && !done('fire_confirm') && t.fireAt != null && m >= t.fireAt && rewardWindow()) {
        once('reward_fire', (s) => rewardSeq(s, 'tx_fire_confirm', 'fire_confirm', 'tx_child_fire'));
      }
      // the bridge warning only matters until the minute it would have happened
      if (t.bridgeEvent != null && m > t.bridgeEvent && !DA.flag('bridge_warned') && !done('bridge_expired')) {
        mark('bridge_expired');
        objRemove('obj_warn_bridge');
        radio('removeOutgoing', 'out_warn_bridge');
        radio('removeOutgoing', 'out_warn_bridge_dispatch');
      }
      return done('bridge_thanks') && done('fire_confirm');
    });
    // it should be getting light by now (06:42, still pitch black), and the day man should be here
    // (held while a call is on the air: said more than ~2 game minutes late, it says so — never
    // "Six forty-two." with the clock at 06:49; after the dawn went back out, never at all)
    watch('sunrise_th', () => {
      const m = DA.clock.min;
      if (done('s_broken')) return true;
      const dark = (+((DA.state.world || {}).daylight) || 0) < 0.25;
      const calmNow = plainView() && !anyAiring() && !feedLive() && !DA.flag('ending') && (DA.state.act | 0) >= 2 && rt.thinking === 0;
      if (m >= SUNRISE && dark && !done('th:thoughts_sunrise') && calmNow) {
        if (m > SUNRISE + 2) { mark('th:thoughts_sunrise'); thinkOnce('thoughts_sunrise_late'); }
        else thinkOnce('thoughts_sunrise');
        rt.sunriseThT = DA.simTime;
        return false;
      }
      if (m >= tm(27, 7, 5) && dark && done('th:thoughts_sunrise') && DA.simTime - (rt.sunriseThT || -99) > 20 && !done('th:thoughts_relief_late') && calmNow && inStationInterior()) thinkOnce('thoughts_relief_late');
      return done('th:thoughts_relief_late') || m > tm(27, 12, 0);
    });
  }
  /**
   * A warning came true: the confirmation waits for a free channel and for you (within earshot,
   * ~75 s at most — then the ceiling speaker carries it through the building), plays alone, and
   * the next story transmission keeps a few seconds of quiet after it.
   */
  async function rewardSeq(s, txId, step, origTx) {
    // somewhere it can be heard: the desk (or within earshot of it), or — after ~75 s — anywhere
    // under the station's roof (the ceiling speaker). Outside (the lot, the car, the woods) it keeps
    // waiting: a thank-you nobody hears never quietly turns the log to RESOLVED.
    await awaitOperator(s, { max: 75, nudge: 35 });
    const audible = () => nearRadio() || (inStationInterior() && inBuilding());
    // (never between #17 and #19: those log numbers are spoken for)
    const numOk = () => (DA.state.act | 0) >= 3 || (!done('a2_17') && radioNext() <= 16) || done('a2_19');
    await s.until(() => audible() && numOk() && !anyAiring() && !radioBusy() && !feedLive());
    if (done(step)) return;
    await s.do(air(txId, { noLock: true, busy: true, ceiling: true }));
    confirmSave(step, origTx);
  }

  /* ================================================================ ACT 3 — INTERFERENCE */
  async function runAct3(s) {
    s.check();
    setAct(3);
    // the warnings' moment has passed: their duties leave the list (the fire warning stays on the
    // mic — a late save is still possible)
    if (!DA.flag('fire_warned')) objRemove('obj_warn_fire');
    if (!DA.flag('bridge_warned')) objRemove('obj_warn_bridge');
    if (!done('a3_start')) {
      setBeat('act3');
      await s.wait(1.2);
      await card(s, 'act3');
      DA.setFlag('cctv_on', true);
      DA.setFlag('mirror_stage', 1);
      devs('cctv', 'setFigureStage', 1);
      mark('a3_start');
      checkpoint('INTERFERENCE');
    }
    setNightRate(RATE.night3);
    radio('setScanning', true);
    const inTheDark = done('a3_calm_gen') && !done('a3_hide');
    if (!done('a3_old1') && !inTheDark) obj('obj_monitor');
    act2Watchers();
    act3Watchers();
    if (!done('a3_cctv')) { setBeat('cctv'); await cctvBeat(s); mark('a3_cctv'); }
    if (!done('a3_phone')) { setBeat('phone'); await phoneBeat(s); mark('a3_phone'); }
    if (!done('a3_calm_vent')) {
      setBeat('selves');
      await gap(s, [16, 24]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_calm_vent', { scan: 'exact', busy: true });
      mark('a3_calm_vent');
      if (!DA.flag('key_found')) obj('obj_vent');
    }
    if (!done('a3_panic')) {
      setBeat('selves');
      await s.wait(1.6);
      await airStory(s, 'tx_panic_dont', { scan: 'exact', busy: true });
      mark('a3_panic');
    }
    if (!done('a3_time')) {
      // Calm You, precisely: "At 04:47, …" — a time five minutes ahead, and the clock to watch
      setBeat('selves');
      await s.until(() => DA.flag('key_found'), 160);
      await gap(s, [8, 14]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      S().t.atMin = null;
      // fixed at reception: ~11 game minutes ahead, so ~8 remain (≈ a real minute of watching the
      // clock) once he has finished speaking. The key still in the duct: his opener says so.
      const atVar = () => { const t = S().t; if (t.atMin == null) t.atMin = Math.ceil(DA.clock.min) + 11; return DA.clock.hhmm(t.atMin); };
      const node = !DA.flag('key_found') && ((C().tx || {}).tx_calm_time || {}).script && C().tx.tx_calm_time.script.start_nokey ? 'start_nokey' : undefined;
      await airStory(s, 'tx_calm_time', { scan: 'exact', busy: true, vars: { AT_TIME: atVar }, node });
      mark('a3_time');
      if (S().t.atMin == null) S().t.atMin = Math.ceil(DA.clock.min) + 5;
      if (S().t.atMin - DA.clock.min < 3) S().t.atMin = Math.ceil(DA.clock.min) + 4; // (a very long answer)
      timedInstruction();
    }
    if (!done('a3_injured')) {
      setBeat('selves');
      await s.until(() => DA.flag('key_found') && (done('at_time_over') || !done('a3_time')), 200);
      await gap(s, [8, 14]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      // every life saved tonight is another way in (README: the more you save, the stronger it is)
      await airStory(s, 'tx_injured', { scan: 'near', busy: true, node: DA.v('saved') > 0 ? 'start_saved' : 'start' });
      mark('a3_injured');
    }
    if (!done('a3_stutter')) {
      setBeat('selves');
      await gap(s, [10, 16]);
      await s.until(() => inStationInterior() || mapId() === 'basement', 90);
      world('setGeneratorSound', 'stutter');
      mark('a3_stutter');
      await s.wait(4.5);
      await thought(s, 'thoughts_generator');
    }
    if (!done('a3_calm_gen')) {
      setBeat('selves');
      await gap(s, [14, 20]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_calm_generator', { scan: 'exact', busy: true });
      mark('a3_calm_gen');
      paceTo(tm(27, 5, 0), 60);
      objRemove('obj_monitor'); // from here the objectives are the station's, not yours
      obj('obj_generator');
      if (!DA.hasItem('flashlight')) obj('obj_flashlight');
    }
    if (!done('a3_trick')) {
      setBeat('generator');
      await trickery(s);
      mark('a3_trick');
      if (!done('cp_generator') && !DA.flag('generator_off')) { mark('cp_generator'); checkpoint('GENERATOR'); }
    }
    if (!done('a3_hide')) {
      setBeat('generator');
      objRemove('obj_monitor');
      if (!DA.flag('generator_off') && !objExists('obj_generator_already') && !objExists('obj_generator_dont')) obj('obj_generator');
      if (!DA.flag('generator_off') && !DA.hasItem('flashlight')) obj('obj_flashlight');
      await s.until(() => DA.flag('generator_off'));
      setBeat('hide');
      await hideSequence(s);
      mark('a3_hide');
      DA.setFlag('interlock_released', true);
      checkpoint('INTERLOCK');
    }
    if (!done('a3_old1')) obj('obj_monitor');
    if (!done('a3_drift')) { setBeat('drift'); paceTo(tm(27, 5, 45), 120); await drift(s); mark('a3_drift'); }
    if (!done('a3_nasty')) {
      setBeat('nasty');
      if (!done('cp_nasty')) { mark('cp_nasty'); checkpoint('+00:03:14'); }
      paceTo(tm(27, 6, 20), 55);
      await nasty(s);
      mark('a3_nasty');
    }
    if (!done('a3_old1')) {
      setBeat('old1');
      paceTo(tm(27, 6, 44), 60);
      await gap(s, [16, 22]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_old_you_1', { scan: 'near', busy: true });
      mark('a3_old1');
    }
    objRemove('obj_monitor');
    if (!DA.hasItem('key_antenna')) obj('obj_vent');
    if (!objExists('obj_array')) obj('obj_control');
    await s.until(() => mapId() === 'array');
    return runAct4(s);
  }

  /**
   * "At 04:47, turn the antenna to two-seven-zero." During that game minute the rotator on 270°
   * (±15°) counts as following him (followed_future): the carrier snaps clean and he says "Good."
   */
  function timedInstruction() {
    const t = S().t;
    if (t.atMin == null || done('at_time_over')) return;
    const at = DA.clock.hhmm(t.atMin);
    if (!objOpen('obj_at_time')) ui('objective', 'obj_at_time', DA.fmt(((C().objectives || {}).obj_at_time) || 'At {AT_TIME}: antenna to 270°.', { AT_TIME: at }));
    watch('at_time', () => {
      const m = DA.clock.min;
      if (m < t.atMin) return false;
      const R = DA.radio;
      const ok = !!(R && R.power && R.bearing != null && U.angleDiffDeg(+R.bearing, 270) <= 15);
      if (ok && !done('at_time_followed')) {
        mark('at_time_followed');
        DA.setFlag('followed_future', true);
        objDone('obj_at_time');
        if (nearRadio()) {
          sfx('static_burst', { vol: 0.35 });
          const good = ((C().dialogue || {}).calm_good || [])[0];
          const line = (good && good.t) || 'Good.';
          ui('subtitle', line, { kind: 'radio', speaker: 'you_calm', clarity: 1 });
          audio('voice', line, 'you_calm', { radio: true, clarity: 0.95, vol: 0.7 });
        }
        run('time_right', async (x) => { await x.wait(2.2); await thought(x, 'thoughts_time_right'); });
      }
      if (done('at_time_followed') || m >= t.atMin + 1) {
        if (!done('at_time_followed')) {
          objRemove('obj_at_time');
          if (nearRadio()) { sfx('static_burst', { vol: 0.3 }); caption('[a burst of static, then nothing]', 2.4); }
        }
        mark('at_time_over');
        return true;
      }
      return false;
    });
  }

  /**
   * The first time you see it after it has grown noticeably stronger (decision 8): 'entity:power'
   * level ≥ 1 marks it due (installListeners); a night rebuilt already that strong (a jump, an old
   * save) reads the level from DA.entity.powerInfo().
   */
  const strongerDue = () => done('stronger_due') || ((call(DA.entity, 'powerInfo') || {}).level | 0) >= 1;
  function strongerWatcher() {
    watch('stronger', () => {
      if (done('th:thoughts_stronger')) return true;
      if (!strongerDue() || !ent('active') || !ent('visible')) return false;
      mark('th:thoughts_stronger');
      run('stronger', async (x) => { await x.wait(2.5); await thought(x, 'thoughts_stronger'); });
      return true;
    });
  }
  function act3Watchers() {
    strongerWatcher();
    if (done('a3_time') && !done('at_time_over')) timedInstruction();
    // the office doorway goes back to being an office once you have been through it
    watch('office_revert', () => {
      if (!world('hasMutation', 'office_door_elsewhere')) return done('d_office_seen');
      if (!done('d_office_seen')) return false;
      if (mapId() === 'station' && ['hall', 'office', 'storage'].includes(room())) return false;
      world('revertMutation', 'office_door_elsewhere');
      return true;
    });
  }

  /* ---------------------------------------------------------------- CCTV */
  async function cctvBeat(s) {
    s.check();
    if (DA.flag('figure_done')) return;
    // the monitors come alive
    await s.until(() => mapId() === 'station' && room() === 'radio', 120);
    if (!done('cctv_nudge')) {
      mark('cctv_nudge');
      sfxAt('static_burst', { x: 19.5, y: 8.9, map: 'station' }, { vol: 0.45 });
      sfxAt('switch', { x: 19.5, y: 8.9, map: 'station' }, { vol: 0.3 });
    }
    const t0 = DA.simTime;
    await s.until(() => DA.flag('figure_done') || (!figSeen() && DA.simTime - t0 > 160) || DA.simTime - t0 > 420);
  }
  /** Highest figure stage the operator has actually seen (persisted by the CCTV device). */
  const figSeen = () => Math.max(rt.figSeen, (DA.state.cctv && DA.state.cctv.figureSeen) | 0);
  function onCctvClose(e) {
    if (DA.flag('figure_done') || !DA.flag('cctv_on')) return;
    const st = (DA.state.cctv && DA.state.cctv.figureStage) | 0;
    if (st >= 4 && figSeen() >= 4) { turnAround(); return; }
    // "There's nobody there." — only if you actually looked at the camera the figure was on
    // (cctv:close {figureViewed}: it was on MONITOR A during this look; else our own cctv:open/view tracking)
    const viewed = e && typeof e.figureViewed === 'boolean' ? e.figureViewed : rt.figViewed;
    if (figSeen() === 1 && viewed && !done('fig_empty')) {
      mark('fig_empty');
      once('fig_empty', async (s) => {
        await s.wait(1.6);
        // back on the monitors already (the figure may be closer there): not now — the next close
        if (DA.modes && DA.modes.has('cctv')) { delete S().done.fig_empty; return; }
        await thought(s, 'thoughts_cctv_empty');
      });
    }
  }
  function turnAround() {
    DA.setFlag('figure_done', true);
    once('turn_around', async (s) => {
      if (DA.modes.has('radio')) radio('stand');
      await s.wait(0.3);
      // behind the chair (pt_fig_4, seen from the chair): away from the desk, even standing on the spot
      const f = pt('pt_fig_4');
      if (f && mapId() === 'station') world('lookAt', f.x, f.y, 0.8, { from: 'pt_radio_chair' });
      await s.wait(1.4);
      await thought(s, 'thoughts_turn_around');
      devs('cctv', 'setFigureStage', 0);
      DA.setFlag('cctv_offsets', true);
    });
  }

  /* ---------------------------------------------------------------- the phone */
  async function phoneBeat(s) {
    s.check();
    if (DA.flag('phone_done')) return;
    await gap(s, [18, 26]);
    for (let attempt = 0; attempt < 4 && !devs('phone', 'isUp'); attempt++) {
      await s.until(() => inStationInterior() && room() !== 'office' && !anyAiring() && !tapePlaying() && rt.busy === 0);
      devs('phone', 'ring');
      const ans = await s.event('phone:answer', null, 45);
      if (ans) break;
      devs('phone', 'stopRing');
      await s.wait(40);
    }
    if (!devs('phone', 'isUp')) { DA.setFlag('phone_done', 'unanswered'); return; }
    await phoneCall(s);
  }
  async function phoneCall(s) {
    busy(true);
    devs('phone', 'hold', true);
    await s.wait(1.4);
    sfx('breath_other', { phone: true, vol: 0.55 });
    caption('[breathing]', 2.8);
    await s.wait(3);
    const opts = ((C().choices || {}).phone || [{ id: 'hello', text: 'Hello?' }, { id: 'silent', text: '[Say nothing.]' }]).slice();
    // everything you say comes back one second later
    for (let k = 0; k < 2; k++) {
      const c = await s.do(P_(ui('choice', opts, { timeout: 24, timeoutId: 'silent' }), 'silent'));
      const o = opts.find((x) => x.id === c);
      if (o && c !== 'silent') {
        const mine = P_(ui('say', 'you', o.text), true);
        await s.wait(1.0);
        const back = P_(ui('say', 'phone', o.text, { kind: 'phone', phone: true }), true);
        await s.do(Promise.all([mine, back]));
        await s.wait(1.4);
      } else {
        sfx('breath_other', { phone: true, vol: 0.6 });
        caption('[breathing]', 2.8);
        await s.wait(3.6);
      }
    }
    // then, before you say anything
    let picked = null;
    const pending = P_(ui('choice', opts, { timeout: 30, timeoutId: 'silent' }), 'silent').then((v) => { picked = v; return v; });
    await s.until(() => picked != null, 1.8);
    if (picked == null) ui('closeChoice', 'silent');
    await s.do(pending);
    await dlg(s, 'phone_dont_turn');
    await s.wait(2);
    devs('phone', 'hold', false);
    devs('phone', 'hangup');
    DA.setFlag('phone_done', true);
    busy(false);
    // a presence behind you
    await s.wait(0.5);
    const res = await s.do(P_(ent('flicker', 'behind', 0.8, { whenSeen: true, timeout: 7, stinger: 'high' }), { seen: false }));
    if (res && res.seen) render('shake', 0.25, 0.3);
    else sfxAt('breath_other', { x: player().x - Math.cos(player().angle) * 1.2, y: player().y - Math.sin(player().angle) * 1.2, map: mapId() }, { vol: 0.35 });
  }

  /* ---------------------------------------------------------------- the generator */
  /**
   * UI trickery on the way to the switch: Investigate backup generator. → (the basement) DO NOT
   * INVESTIGATE BACKUP GENERATOR. → (the generator room) You already investigated it. It stops the
   * moment the generator is off (LISTEN. comes after the switch, alone).
   */
  async function trickery(s) {
    s.check();
    if (DA.flag('generator_off')) return;
    // the README trick plays once per night: after a reload (GENERATOR checkpoint) it's just the job
    if (done('gen_trick')) {
      objRemove('obj_generator_dont');
      objRemove('obj_generator_already');
      if (!objExists('obj_generator')) obj('obj_generator');
      return;
    }
    if (!objExists('obj_generator_dont') && !objExists('obj_generator_already')) obj('obj_generator');
    if (!objExists('obj_generator_already')) {
      await s.until(() => mapId() === 'basement' || DA.flag('generator_off'));
      if (DA.flag('generator_off')) return;
      await s.wait(3);
      if (DA.flag('generator_off')) return;
      objRemove('obj_generator');
      obj('obj_generator_dont', { glitch: true });
      stinger('glitch');
      render('glitch', 0.35, 0.3);
      await s.until(() => (mapId() === 'basement' && room() === 'generator') || DA.flag('generator_off'), 60);
      if (DA.flag('generator_off')) return;
      await s.wait(2.5);
      if (DA.flag('generator_off')) return;
      objRemove('obj_generator_dont');
      obj('obj_generator_already', { glitch: true });
      mark('gen_trick');
    }
  }
  /** knock. knock. knock. — somewhere inside the station, away from you (upstairs, from the basement). */
  function knockSomewhere() {
    if (mapId() === 'station') {
      const spots = [pt('pt_front_inside'), { x: 17.5, y: 19.5, map: 'station' }, { x: 42.5, y: 19.5, map: 'station' }, { x: 40.5, y: 11.5, map: 'station' }].filter(Boolean);
      spots.sort((a, b) => distTo(b) - distTo(a));
      sfxAt('knock3', spots[0], { vol: 1 });
      caption('[knock. knock. knock.]', 3.2);
    } else {
      sfx('knock3', { vol: 0.55, muffle: 0.7 });
      caption('[knock. knock. knock. — upstairs]', 3.2);
    }
  }
  function generatorOff() {
    if (DA.flag('generator_off')) return;
    DA.setFlag('generator_off', true);
    world('setPower', 'generator', false);
    world('setGeneratorSound', null);
    sfxAt('generator_stop', 'pt_gen', { vol: 1 });
    DA.bus.emit('generator:toggle', { on: false });
    for (const id of ['obj_generator', 'obj_generator_dont', 'obj_generator_already', 'obj_flashlight', 'obj_monitor']) objRemove(id);
    DA.timers.after(0.9, () => {
      world('setPower', 'main', false);
      sfx('power_down', { vol: 0.5 });
    }, 'dir_gen');
  }
  function generatorOn() {
    DA.setFlag('generator_off', false);
    world('setPower', 'generator', true);
    world('setGeneratorSound', 'stutter');
    sfxAt('generator_start', 'pt_gen', { vol: 1 });
    DA.bus.emit('generator:toggle', { on: true });
    DA.timers.after(1.6, () => {
      world('setPower', 'main', true);
      sfx('power_up', { vol: 0.4 });
    }, 'dir_gen');
    if ((DA.state.act | 0) >= 5) {
      setBeat('destroy');
      if (!done('cp_gen5')) { mark('cp_gen5'); DA.timers.after(2, () => checkpoint('GENERATOR RESTARTED'), 'dir_gen'); }
    }
  }

  /* ---------------------------------------------------------------- the dark */
  /** Where it comes out if it follows you from its map onto yours (null: it can't follow there). */
  const followExit = (from, to) => ((STAIR_EXIT[from] || {})[to]) || null;
  function stairSteps(point) {
    for (let k = 0; k < 5; k++) DA.timers.after(k * 0.42, () => sfxAt('footstep_other', point, { surface: 'concrete', vol: 0.85 }), 'dir_follow');
  }
  /**
   * The fallback when the entity module could not follow you to your floor by itself (a hunt that
   * ended 'map'): it comes out of the stair exit on your floor `delay` s later, footsteps first.
   * → false when no stairs lead from its floor to yours.
   */
  async function followByExit(s, delay) {
    const pos = ent('position');
    if (!pos || pos.map === mapId()) return true;
    if (!followExit(pos.map, mapId())) return false;
    await s.wait(delay || 3.5);
    dead();
    const p2 = ent('position');
    if (!p2 || p2.map === mapId()) return true;
    const exit = followExit(p2.map, mapId());
    if (!exit) return false;
    stairSteps(exit);
    spawnLethal(exit);
    return true;
  }
  /**
   * Hunt the player for `o.secs`. The entity follows them up and down the stairs itself (DA.entity
   * hunts across maps); only when it cannot does the director bring it out of the stair exit on
   * their floor (followByExit). Resolves {caught, reason}.
   */
  async function pursue(s, o) {
    const end = DA.simTime + (o.secs || 14);
    let r = { caught: false, reason: 'duration' };
    for (let hop = 0; hop < 4 && DA.simTime < end; hop++) {
      dead();
      if (!ent('active')) break;
      const pos = ent('position');
      if (pos && pos.map !== mapId() && (hop > 0 || !entFollows())) {
        if (!(await followByExit(s, o.delay))) { r = { caught: false, reason: 'map' }; break; }
        dead();
        if (DA.simTime >= end || !ent('active')) break;
      }
      r = await s.do(P_(ent('hunt', { speed: o.speed || 2.2, duration: Math.max(1, end - DA.simTime), closedBlocks: o.closedBlocks }), { caught: false, reason: 'stopped' }));
      dead();
      if (!r || r.caught || r.reason !== 'map') break;
    }
    return r || { caught: false };
  }
  /**
   * Look for the player wherever they are: on another floor it comes after them (pursue); on
   * theirs it searches their room (the search follows them if they slip away by the stairs within
   * its hearing) and, if it misses and they are standing in the open, hunts. A locked radio room
   * it can only rattle.
   */
  async function seek(s, k) {
    for (let round = 0; round < 3; round++) {
      dead();
      const pos = ent('position');
      if (!pos) return;
      if (pos.map !== mapId()) {
        // the stairs are not a free escape: the time it spent getting to your floor is not taken
        // off its search — once it is on your floor it searches your room, then hunts the open
        await pursue(s, { speed: 2.2 * k, secs: 18 * k, closedBlocks: ['radio_door'] });
        dead();
        continue;
      }
      if (lockedInRadio()) {
        const mv = await s.do(P_(ent('moveTo', 'pt_radio_chair', 1.4 * k, { lethal: true }), { arrived: false }));
        dead();
        if (mv && mv.blocked) { await s.wait(2.5); sfxAt('breath_other', 'pt_entity_radio_door', { vol: 0.55 }); await s.wait(3.5); }
        return;
      }
      const P = player();
      const where = room() ? room() : { x: P.x, y: P.y, r: 3.5 };
      const found = await s.do(P_(ent('search', where, 11 * k, { speed: 0.95 * k }), false));
      dead();
      if (found) return;
      const p2 = ent('position');
      if (p2 && p2.map !== mapId()) continue; // you slipped away to another floor unheard: it comes after you
      if (!hidden() && !lockedInRadio()) {
        await pursue(s, { speed: 2.2 * k, secs: 14 * k, closedBlocks: ['radio_door'] });
        dead();
      }
      return;
    }
  }
  /**
   * The dark (README "Future delay mechanic", "UI trickery"; decision 4). After the switch: the red
   * lamps, LISTEN., three knocks from upstairs. It does not come in until you are back on the ground
   * floor — then the radio predicts it, +12 s: footsteps in the hall, closer, and the radio-room
   * door handle at its stated second (the entity's walk is timed from its spawn to arrive then).
   * Stay in the basement 45 s (less, the stronger it is) and it comes down to you instead.
   */
  async function hideSequence(s) {
    s.check();
    busy(true);
    // only the radio's predictions: ambient traffic hushed, the dial holds still (decision 6)
    radioQuiet(true);
    const scanning = !!(DA.state.radio && DA.state.radio.scanning);
    radio('setScanning', false);
    try { await darkSeq(s); } finally {
      radioQuiet(false);
      if (scanning && DA.running) radio('setScanning', true);
      ent('danger', false);
    }
  }
  async function darkSeq(s) {
    const k = power();
    for (const id of ['obj_generator', 'obj_generator_dont', 'obj_generator_already', 'obj_listen', 'obj_monitor', 'obj_flashlight']) objRemove(id);
    await s.wait(1.8 / k);
    run('dark', (x) => thought(x, 'thoughts_dark'));
    if (DA.hasItem('flashlight') && !player().flashlight) ui('hint', (C().hints || {}).flashlight || 'F for the flashlight.', 4);
    await s.wait(1.6 / k);
    obj('obj_listen', { glitch: true }); // alone: no waypoint, nothing else
    await s.wait(1.6);
    knockSomewhere();
    await s.wait(2.4);
    const below = mapId() !== 'station';
    await thought(s, below ? 'thoughts_knock_up' : 'thoughts_knock');
    objRemove('obj_listen');
    obj('obj_hide');
    hintOnce('hide', 1.5);
    hintOnce('crouch', 6);
    const upstairs = () => inStationInterior();
    const t0 = DA.simTime;
    await s.until(() => upstairs() || DA.simTime - t0 > 45 / k);
    if (!DA.entity || !DA.entity.spawn) {
      // no entity module: the rules still hold
      await s.wait(12);
      if (!hidden() && !lockedInRadio()) { die('found'); dead(); }
    } else if (upstairs()) await darkStation(s, k);
    else await darkBelow(s, k);
    // it leaves the way it came (still lethal: walk into it and it has you)
    dead();
    const pos = DA.entity && DA.entity.position ? DA.entity.position() : null;
    if (pos && ent('active')) {
      const out = pos.map === 'station' ? 'pt_front_inside' : pos.map === 'basement' ? 'pt_b_arrive' : null;
      if (out) await s.do(P_(ent('moveTo', out, 1.35 * k, { lethal: true, watch: 3 }), null));
      dead();
    }
    ent('despawn');
    if (world('isOpen', 'front_door')) world('closeDoor', 'front_door');
    stopFeed('rf_hide');
    objDone('obj_hide');
    await s.wait(2.5);
    busy(false);
  }
  /** Spawn it for a lethal beat (the dark): contact with an unhidden player is a catch (DA.entity.danger). */
  function spawnLethal(where) {
    ent('spawn', where, 'idle', { danger: true });
    ent('danger', true);
    ent('intensity', power());
  }
  /** A lethal walk (moveTo {lethal}) that saw you and went for you — the script's prediction is void. */
  const spotted = (r) => !!(r && (r.seen || r.rushed));
  /**
   * Fallback for an entity module without lethal walks: the director watches the scripted walk and
   * ends it when it has you (unhidden, not locked in) in sight within 6 u or brushes past you.
   */
  const lethalNative = () => !!(DA.entity && typeof DA.entity.danger === 'function');
  async function watchWalk(s, p) {
    if (lethalNative()) return s.do(p);
    let res = null;
    p.then((r) => { res = r || { arrived: false }; });
    const exposed = () => {
      if (hidden() || lockedInRadio() || !ent('active')) return false;
      const d = +ent('distance');
      return d < 1.1 || (d <= 6 && !!ent('sees'));
    };
    await s.until(() => !!res || exposed());
    if (res) return res;
    ent('stop');
    await s.do(p);
    return { arrived: false, seen: true };
  }
  /** It saw you on its way in: the prediction is broken (the feed cuts out) and it comes for you. */
  async function darkSpotted(s, k) {
    stopFeed('rf_hide');
    sfx('static_burst', { vol: 0.35, radio: true });
    dead();
    if (!ent('active')) return;
    if (!hidden() && !lockedInRadio() && ent('position') && ent('position').map === mapId()) {
      await pursue(s, { speed: 2.2 * k, secs: 14 * k, closedBlocks: ['radio_door'] });
      dead();
    }
    await seek(s, k);
  }
  /** On the ground floor: rf_hide, and the prediction comes true to the second. */
  async function darkStation(s, k) {
    const f0 = DA.simTime;
    const at = (sec) => s.until(() => DA.simTime - f0 >= sec);
    playFeed('rf_hide');
    await s.wait(0.9);
    run('twelve', (x) => thought(x, 'thoughts_hide'));
    // up the drive to the front door first (CAM1, eight seconds ahead, sees it coming). Every leg is
    // lethal: stand in its way unhidden and it sees you and comes for you — it never walks through you.
    await at(1.2);
    spawnLethal('pt_entity_outside');
    const toDoor = P_(ent('moveTo', 'pt_front_outside', 1.35, { lethal: true }), { arrived: false });
    await at(8.2);
    const r0 = await watchWalk(s, toDoor);
    dead();
    if (spotted(r0)) return darkSpotted(s, k);
    // in through the front door; timed to be in the hall at +12 and at the radio-room door at +21
    const E = DA.entity.position ? DA.entity.position() : null;
    const dst = pt('pt_entity_radio_door');
    let len = 0;
    const path = E && dst ? world('path', E.x, E.y, dst.x, dst.y, 'station') : null;
    if (path && path.length) { let px = E.x, py = E.y; for (const q of path) { len += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; } }
    const left = Math.max(5, 20.6 - (DA.simTime - f0) - 1.0); // ~1 s for the front door to swing
    const speed = len > 0 ? U.clamp(len / left, 1.2, 3.4) : 2.2;
    const mv = await watchWalk(s, P_(ent('moveTo', 'pt_entity_radio_door', speed, { lethal: true }), { arrived: false }));
    dead();
    if (spotted(mv)) return darkSpotted(s, k);
    // the handle, at its stated second
    await at(21);
    dead();
    if (lockedInRadio() || doorLocked('radio_door')) {
      await s.do(P_(ent('moveTo', 'pt_radio_chair', 1.4 * k, { lethal: true }), { arrived: false })); // it rattles the handle
      dead();
      if (lockedInRadio()) {
        await s.wait(2.5);
        sfxAt('breath_other', 'pt_entity_radio_door', { vol: 0.55 });
        await s.wait(3.5);
        return;
      }
    } else if (mv && mv.arrived !== false) {
      sfxAt('door_handle', { x: 19.5, y: 14.6, map: 'station' }, { vol: 0.9 });
    }
    // the radio room first (it opens the door), then wherever you are
    if (mapId() === 'station' && room() === 'radio') {
      const found = await s.do(P_(ent('search', 'radio', 11 * k, { speed: 0.95 * k }), false));
      dead();
      if (found) return;
      if (!hidden() && !lockedInRadio()) await pursue(s, { speed: 2.2 * k, secs: 14 * k, closedBlocks: ['radio_door'] });
      return;
    }
    const look = await watchWalk(s, P_(ent('moveTo', { x: 18.6, y: 12.2, map: 'station' }, 1.3 * k, { lethal: true }), { arrived: false })); // it looks in
    dead();
    if (spotted(look)) return darkSpotted(s, k);
    await seek(s, k);
  }
  /** Still below after ~45 s: it comes down the stairs to you. */
  async function darkBelow(s, k) {
    const m = mapId();
    const exit = followExit('station', m);
    if (!exit) { spawnLethal('behind'); await seek(s, k); return; }
    sfx('footsteps_upstairs', { vol: 0.85 });
    caption('[footsteps, overhead]', 3);
    await s.wait(3.2);
    sfxAt('door_open', exit, { vol: 0.9 });
    stairSteps(exit);
    await s.wait(2.2);
    dead();
    spawnLethal(exit);
    await seek(s, k);
  }

  /* ---------------------------------------------------------------- the station drifts */
  /** The reception the log should not remember (the woman, else the first future stamp). */
  function hauntedEntry() {
    const w = radio('find', 'tx_woman');
    if (w) return w;
    const log = radio('entries') || [];
    return log.find((e) => e.offsetSec && e.offsetSec > 0 && e.txId !== 'tx41') || null;
  }
  function hauntLog(stage) {
    const e = hauntedEntry();
    const L = C().log || {};
    if (e) radio('editEntry', e.num, { summary: stage >= 2 ? L.remember || 'YOU SHOULD NOT REMEMBER THIS' : L.noTransmission || 'NO TRANSMISSION', glitch: true });
    DA.setFlag('log_haunted', stage);
  }
  // the building only changes where nobody is looking (seated at the desk, nothing else is visible)
  const hallEndFar = () => atDesk() || mapId() !== 'station' || (room() !== 'hall' && distTo({ x: 42.5, y: 15.5, map: 'station' }) > 8);
  const officeFar = () => atDesk() || mapId() !== 'station' || (!['hall', 'office', 'storage'].includes(room()) && distTo({ x: 28.5, y: 14.5, map: 'station' }) > 5);
  const newHallFar = () => atDesk() || mapId() !== 'station' || (!['hall', 'radio'].includes(room()) && distTo({ x: 24.5, y: 14.5, map: 'station' }) > 6);
  /**
   * The station drifts (decision 6: experienced, never ~60 s of nothing). Every change that happens
   * out of sight is followed by a reason to go and look: the log rewrite is noticed at the desk, a
   * door shuts at the far end of a hall that is suddenly longer ("Check the corridor."), the office
   * phone rings behind a door that now opens somewhere else, the OFFSET turns unreliable and then
   * negative (−00:00:04: something already happened), and knocking comes from a hallway that was
   * never there.
   */
  async function drift(s) {
    s.check();
    if ((+DA.flag('mirror_stage') || 0) < 2) DA.setFlag('mirror_stage', 2); // the reflection lags from here on
    if (!done('d_log1')) {
      await gap(s, [6, 10]);
      await s.until(() => !rt.logOpen, 60);
      hauntLog(1);
      mark('d_log1');
      logChangedCue();
    }
    if (!done('d_upstairs')) {
      await gap(s, [14, 20]);
      // one-floor station: only where there really is no upstairs (never in the basement)
      const ok = await s.until(() => inStationInterior() && channelFree() && plainView(), 90);
      if (ok) {
        sfx('footsteps_upstairs', { vol: 0.9 });
        caption('[footsteps, overhead]', 3.6);
        await s.wait(4);
        await thought(s, 'thoughts_upstairs');
      }
      mark('d_upstairs');
    }
    if (!done('d_hall_long')) {
      await gap(s, [8, 12]);
      await s.until(hallEndFar, 120);
      world('applyMutation', 'hall_long');
      mark('d_hall_long');
      await s.wait(1.5);
      // a door, far down the hall — farther than the hall goes
      sfxAt('door_close', { x: 45.4, y: 15.5, map: 'station' }, { vol: 1 });
      if (mapId() === 'station') caption('[a door closes, far down the hall]', 3);
      if (inStationInterior()) run('hall_sound', async (x) => { await x.wait(1.5); await thought(x, 'thoughts_hall_sound'); });
      obj('obj_check_hall');
    }
    if (!done('d_office')) {
      await gap(s, [10, 16]);
      await s.until(officeFar, 120);
      world('applyMutation', 'office_door_elsewhere');
      mark('d_office');
      await s.wait(2);
      officePhone();
    }
    if (!done('d_past')) {
      await pastFeed(s);
      mark('d_past');
    }
    if (!done('d_log2')) {
      await gap(s, [10, 16]);
      await s.until(() => !rt.logOpen, 60);
      hauntLog(2);
      mark('d_log2');
      logChangedCue();
    }
    if (!done('d_newhall')) {
      await gap(s, [10, 14]);
      await s.until(newHallFar, 120);
      world('applyMutation', 'new_hallway');
      mark('d_newhall');
      await s.wait(1.5);
      newhallKnock(true);
    }
    if (!done('d_newhall_seen')) {
      const t0 = DA.simTime;
      let knocked = t0;
      await s.until(() => {
        if (done('d_newhall_seen')) return true;
        if (DA.simTime - knocked > 40 && plainView()) { knocked = DA.simTime; newhallKnock(false); }
        return DA.simTime - t0 > 100;
      });
      if (done('d_newhall_seen')) await s.until(() => !rt.sequences.has('newhall'), 30);
      objRemove('obj_check_newhall');
    }
    objRemove('obj_check_hall');
  }
  /** The log was rewritten: at the desk you catch it happening (and #41 waits for whoever reads it). */
  function logChangedCue() {
    if (atDesk() || (mapId() === 'station' && room() === 'radio')) {
      sfx('radio_click', { vol: 0.6 });
      sfx('static_burst', { vol: 0.2, radio: true });
      thinkNow('thoughts_log_changed');
      logHint(2.4);
    }
  }
  /** The office phone rings — and the office door now opens into the supply room. */
  function officePhone() {
    if (!DA.flag('phone_done')) return; // the call beat owns the phone until it is done
    if (devs('phone', 'isUp') || devs('phone', 'isRinging')) return;
    devs('phone', 'ring');
    const sess = DA.session;
    const t0 = DA.simTime;
    watch('office_phone', () => {
      if (DA.session !== sess) return true;
      if (!devs('phone', 'isRinging')) return true;
      if (done('d_office_seen') || DA.simTime - t0 > 48 || !world('hasMutation', 'office_door_elsewhere')) {
        devs('phone', 'stopRing');
        return true;
      }
      return false;
    });
  }
  /** Knocking from the new hallway's door. */
  function newhallKnock(first) {
    sfxAt('knock3', { x: 24.5, y: 14.3, map: 'station' }, { vol: 1 });
    if (mapId() === 'station' && inStationInterior()) caption('[knocking, somewhere in the hall]', 3);
    if (first && inStationInterior()) run('newhall_knock', async (x) => { await x.wait(2.5); await thought(x, 'thoughts_newhall_knock'); });
    // one corridor duty at a time: the knocking replaces "the far end of the corridor"
    if (!objOpen('obj_check_newhall') && !done('d_newhall_seen')) { objRemove('obj_check_hall'); obj('obj_check_newhall'); }
  }
  /**
   * README "Later the offset starts becoming unreliable. +10 seconds. +6 minutes. −3 seconds. Then:
   * OFFSET −00:00:04. You're receiving something that already happened." The radio-room door has
   * already swung (unseen, unheard); the feed plays it four seconds late.
   */
  async function pastFeed(s) {
    await gap(s, [8, 12]);
    await awaitChannel(s);
    // one reason at a time (decision 6): it lands in near silence, never over the ringing office phone
    await s.until(() => !devs('phone', 'isRinging'), 60);
    await awaitOperator(s, { desk: true, max: 50 });
    await s.until(() => !devs('phone', 'isRinging'), 30);
    // not while you are looking straight at that door
    await s.until(() => atDesk() || mapId() !== 'station' || !world('lineOfSight', player().x, player().y, 19.5, 14.5, 'station') || Math.abs(+world('facing', 19.5, 14.5) || 0) > 1.2, 30);
    busy(true);
    radioQuiet(true);
    let heard = false;
    try {
      if (atDesk()) await s.do(P_(radio('autoScan', 14.0), false));
      for (const t of ['+00:00:10', '+00:06:00', '-00:00:03']) {
        radio('offsetOverride', t);
        if (atDesk()) sfx('static_burst', { vol: 0.18, radio: true });
        await s.wait(1.5);
      }
      const open = doorOpenAmount('radio_door') > 0.5;
      const feed = open ? 'rf_past_close' : 'rf_past_open';
      if (!doorLocked('radio_door')) world(open ? 'closeDoor' : 'openDoor', 'radio_door', true);
      S().pastDoor = open ? 'closed' : 'opened';
      rt.pastTouched = false;
      radio('offsetOverride', '-00:00:04');
      // (the −00:00:04 is on the desk's LCD: only a seated operator reads it)
      const fp = playFeed(feed);
      if (atDesk()) heard = true;
      await s.wait(1.6);
      if (atDesk()) heard = true;
      await s.wait(1.6);
      if (atDesk()) heard = true;
      radio('offsetOverride', null);
      await s.do(P_(fp, null));
    } finally { radioQuiet(false); }
    busy(false);
    // "Minus four." only if the OFFSET was actually seen
    if (heard) await thought(s, 'thoughts_offset_past');
    // …and when you turn round, the door is as the radio said — as long as it still is (a door
    // you opened or shut yourself since is not the one you didn't hear)
    const sess = DA.session;
    watch('past_door', () => {
      if (DA.session !== sess || done('th:thoughts_door_unheard') || rt.pastTouched) return true;
      const amt = doorOpenAmount('radio_door');
      if (S().pastDoor === 'opened' ? amt < 0.5 : amt > 0.1) return true; // it changed since
      if (atDesk() || mapId() !== 'station') return false;
      const f = world('facing', 19.5, 14.5);
      if (distTo({ x: 19.5, y: 14.5, map: 'station' }) < 6 && typeof f === 'number' && Math.abs(f) < 0.8 && world('lineOfSight', player().x, player().y, 19.5, 14.5, 'station')) {
        thinkOnce('thoughts_door_unheard');
        return true;
      }
      return false;
    });
  }
  function newHallway() {
    if (done('d_newhall_seen') || !world('hasMutation', 'new_hallway')) return;
    mark('d_newhall_seen');
    objDone('obj_check_newhall');
    once('newhall', async (s) => {
      await s.wait(0.8);
      await s.do(air('tx_new_hallway', { noLock: true, ceiling: true, busy: true }));
      await s.wait(0.6);
      await thought(s, 'thoughts_hallway');
    });
  }

  /* ---------------------------------------------------------------- +00:03:14 */
  async function nasty(s) {
    s.check();
    await gap(s, [16, 24]);
    await awaitChannel(s);
    await awaitOperator(s, { desk: true });
    await waitDesk(s);
    busy(true);
    radioQuiet(true);
    try {
      await s.do(P_(radio('autoScan', 14.0), false));
      let zero = false;
      const offZ = DA.bus.on('roomfeed:zero', (e) => { if (e && e.feed === 'rf_leaving') zero = true; }, { session: true });
      playFeed('rf_leaving');
      const went = () => mapId() === 'station' && outdoors();
      // only a player who is actually staying thinks it: still in the chair (standing up — the
      // natural moment to head for the door — cancels it)
      let stood = false;
      const offStand = DA.bus.on('radio:stand', () => { stood = true; }, { session: true });
      run('not_leaving', async (x) => {
        await x.wait(36);
        offStand();
        if (!went() && !zero && !stood && atDesk()) await thought(x, 'thoughts_leave');
      });
      await s.until(() => zero || went());
      offZ();
      if (!zero) {
        DA.setFlag('nasty_done', 'leave');
        await chase(s);
      } else {
        DA.setFlag('nasty_done', 'stay');
        await whyDidntYouLeave(s);
      }
    } finally { radioQuiet(false); }
    busy(false);
  }
  async function whyDidntYouLeave(s) {
    await s.wait(3.5); // nothing happens
    stopFeed('rf_leaving');
    playFeed('rf_why');
    await s.event('roomfeed:event', (e) => !!e && e.feed === 'rf_why' && e.event === 'why_3', 60);
    await s.wait(1.2);
    P_(ent('window', true));
    // (heard only near the radio room's window — never in the basement or across the building)
    if (mapId() === 'station' && (room() === 'radio' || atDesk() || distTo({ x: 14.7, y: 11, map: 'station' }) < 9)) caption('[knocking on the window]', 3);
    await s.wait(10);
    P_(ent('window', false));
    await s.wait(1.5);
  }
  async function chase(s) {
    stopFeed('rf_leaving'); // the rest of the recording (and its ceiling-speaker echo) never plays
    await s.wait(2.2);
    spawnLethal('pt_entity_outside');
    await s.wait(0.7);
    stinger('high');
    const oh = (((C().roomfeed || {}).rf_leaving || {}).steps || []).find((x) => x.event === 'leave_ohgod');
    ui('say', 'you', (oh && oh.t) || 'Oh God.');
    let res = null;
    const k = power();
    run('chase_hunt', async (x) => { res = await pursue(x, { speed: 2.45 * k, secs: 75, closedBlocks: ['radio_door'] }); });
    const safe = () => mapId() === 'station' && room() === 'radio' && doorOpenAmount('radio_door') < 0.08;
    await s.until(() => res || safe() || !DA.entity);
    dead();
    if (safe()) {
      ent('stop');
      await s.wait(0.9);
      sfxAt('impact', { x: 19.5, y: 14.9, map: 'station' }, { vol: 1 });
      render('shake', 0.45, 0.4);
      await s.wait(0.5);
    }
    ent('despawn');
    await s.wait(1.5);
  }

  /* ================================================================ ACT 4 — THE ARRAY */
  async function runAct4(s) {
    s.check();
    setAct(4);
    if (!done('a4_start')) {
      setBeat('act4');
      objDone('obj_control');
      objDone('obj_array');
      if (DA.hasItem('key_antenna')) objRemove('obj_vent');
      for (const m of ['office_door_elsewhere', 'new_hallway']) if (world('hasMutation', m)) world('revertMutation', m);
      DA.setFlag('mirror_stage', 3);
      await s.wait(0.8);
      await card(s, 'act4');
      mark('a4_start');
      checkpoint('THE ARRAY');
      await s.wait(0.8);
      await thought(s, 'thoughts_array');
      obj('obj_report');
      hintOnce('crouch', 2); // (the stalker homes in on noise)
    }
    setNightRate(RATE.night4);
    act2Watchers();
    arrayWatchers();
    if (!done('a4_report')) {
      setBeat('act4');
      if (!objExists('obj_report')) obj('obj_report');
      await s.until(() => DA.flag('report_read'));
      objDone('obj_report');
      mark('a4_report');
    }
    if (!done('a4_death')) {
      setBeat('twist');
      obj('obj_monitor');
      const d = lastDeath();
      if (d) {
        await gap(s, [10, 16]);
        await awaitChannel(s);
        await awaitOperator(s, { max: 40 });
        await awaitChannel(s);
        await airStory(s, 'tx_your_death', { scan: 'exact', busy: true, vars: deathVars(d) });
      }
      mark('a4_death');
    }
    if (!done('a4_twist')) {
      setBeat('twist');
      obj('obj_monitor');
      await gap(s, [12, 18]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_old_you_twist', { scan: 'near', busy: true });
      DA.setFlag('archives_are_timelines', true);
      mark('a4_twist');
      await s.wait(1.2);
      await thought(s, 'thoughts_timeline');
    }
    return runAct5(s);
  }
  function lastDeath() {
    const d = (DA.meta && DA.meta.deaths) || [];
    return d.length ? d[d.length - 1] : null;
  }
  /** Where you died, as it reads after "I'm in the …" (DA.maps.roomPhrase: 'array', 'generator room', 'road'). */
  function deathVars(d) {
    const M = DA.maps;
    const phrase = d.room && M && typeof M.roomPhrase === 'function' ? M.roomPhrase(d.room) : String(d.room || '').replace(/_/g, ' ');
    const roomName = String(phrase || 'radio room').toLowerCase().replace(/^the\s+/, '');
    const last = d.lines && d.lines.length ? String(d.lines[d.lines.length - 1]) : 'static';
    // the log keeps the machine stamp; a voice on the radio says the time ("six thirty-five")
    const hm = /(\d{1,2}):(\d{2})\s*$/.exec(String(d.stamp || '')) || /(\d{1,2}):(\d{2})/.exec(String(d.stamp || ''));
    const spoken = hm && C().spokenTime ? C().spokenTime(+hm[1], +hm[2]) : null;
    return { DEATH_ROOM: roomName, DEATH_STAMP: d.stamp || DA.clock.stamp(), DEATH_TIME: spoken || (hm ? hm[1] + ':' + hm[2] : DA.clock.hhmm()), DEATH_LINE: last.replace(/^\[|\]$/g, '').slice(0, 80) };
  }
  /** Down there it is physical: it stalks you whenever you are in the array (ACT 4–5). */
  function arrayWatchers() {
    strongerWatcher();
    const speed = () => ((DA.state.act | 0) >= 5 ? 1.25 : 1.0) * power();
    watch('array_stalk', () => {
      // (never once an ending has started or ended — the maintain dawn, 2049: the array is dead)
      const inArray = mapId() === 'array' && (DA.state.act | 0) >= 4 && !rt.escaping && !DA.flag('ending') && !endingLocked();
      // reading the report (or any overlay over the view) is not "looking away": it waits
      const top = DA.modes && DA.modes.top();
      const covered = !!(top && top.name !== 'explore');
      if (inArray && !rt.stalking) {
        rt.stalking = true;
        rt.stalkPaused = covered;
        ent('spawn', 'pt_entity_array', 'idle');
        ent('intensity', power());
        rt.stalkSeen = null;
        if (!covered) P_(ent('stalk', true, { speed: speed() }));
      } else if (!inArray && rt.stalking) {
        rt.stalking = false;
        rt.stalkPaused = false;
        ent('stalk', false);
        ent('despawn');
      } else if (inArray && rt.stalking && ent('active')) {
        if (covered && !rt.stalkPaused) { rt.stalkPaused = true; ent('stalk', false); }
        else if (!covered && rt.stalkPaused) { rt.stalkPaused = false; P_(ent('stalk', true, { speed: speed() })); }
        // teach the array's rule by seeing it: you look away, you look back, it is closer
        if (!done('th:thoughts_array_look') && !covered) {
          const vis = !!ent('visible'), d = +ent('distance');
          const st = rt.stalkSeen || (rt.stalkSeen = { seen: false, away: 0, d: Infinity });
          if (vis) {
            if (st.seen && st.away > 1.2 && d < st.d - 0.8) run('array_look', (x) => { mark('th:thoughts_array_look'); return thought(x, 'thoughts_array_look'); });
            st.seen = true; st.away = 0; st.d = d;
          } else if (st.seen) st.away += 0.25;
        }
      }
      return false;
    });
  }

  /* ================================================================ ACT 5 — COLLAPSE */
  async function runAct5(s) {
    s.check();
    setAct(5);
    if (!done('a5_start')) {
      setBeat('act5');
      DA.setFlag('collapse', true);
      DA.setFlag('you_realtime', true);
      await s.wait(1.4);
      await card(s, 'act5');
      mark('a5_start');
      checkpoint('COLLAPSE');
    }
    const over = done('m_done') || done('o_woke') || DA.flag('ending');
    if (!over) { DA.setFlag('collapse', true); DA.setFlag('you_realtime', true); }
    setNightRate(RATE.night4);
    radio('setScanning', false);
    act2Watchers();
    arrayWatchers();
    collapseWatcher();
    if (!done('a5_you_now')) {
      setBeat('act5');
      obj('obj_monitor');
      await gap(s, [8, 14]);
      await awaitChannel(s);
      await awaitOperator(s, { max: 40 });
      await awaitChannel(s);
      await airStory(s, 'tx_you_now', { scan: 'exact', busy: true });
      mark('a5_you_now');
    }
    for (const [id, tx] of [['a5_panic', 'tx_panic_destroy'], ['a5_old', 'tx_old_maintain'], ['a5_calm', 'tx_calm_open']]) {
      if (done(id)) continue;
      setBeat('act5');
      await s.wait(U.rand(2.5, 4.5));
      await awaitChannel(s);
      await awaitOperator(s, { max: 30 });
      await awaitChannel(s);
      await airStory(s, tx, { scan: 'exact', busy: true });
      mark(id);
    }
    if (!done('a5_paths')) {
      objRemove('obj_monitor');
      obj('obj_destroy', { glitch: true });
      obj('obj_maintain', { glitch: true });
      obj('obj_open', { glitch: true });
      mark('a5_paths');
      // a death on the way to an ending costs minutes, not the four voices again
      checkpoint('THE THREE VOICES');
    }
    if (!over && !endingLocked() && !radioHasOutgoing('out_keep_channel_open')) radio('addOutgoing', 'out_keep_channel_open');
    if (limitersPulled() >= 3 && objOpen('obj_limiters')) { objDone('obj_limiters'); obj('obj_overload'); }
  }
  function collapseWatcher() {
    let lastJam = -1, glitchT = U.rand(12, 25);
    watch('collapse', () => {
      if (!DA.flag('collapse')) { if (lastJam > 0) { lastJam = 0; radio('jam', 0); } return false; }
      const w = DA.state.world || {};
      let b = Math.max(0.1, +w.blend || 0);
      b = Math.min(rt.escaping ? 0.85 : 0.5, b + (rt.escaping ? 0.0035 : 0.25 / 900));
      world('setBlend', b);
      const jam = rt.maintaining ? 0.15 : rt.escaping ? 0.9 : anyAiring() ? 0.12 : U.clamp(0.3 + b * 0.7, 0, 0.75);
      const q = Math.round(jam * 20) / 20;
      if (q !== lastJam) { lastJam = q; radio('jam', q); }
      glitchT -= 0.25;
      if (glitchT <= 0) {
        glitchT = U.rand(14, 30);
        if (mapId() !== 'relay' && !atDesk()) render('glitch', U.rand(0.15, 0.35), U.rand(0.15, 0.4));
      }
      return false;
    });
  }

  /* ---------------------------------------------------------------- DESTROY THE ANTENNA */
  const LIMITERS = ['limiter_1', 'limiter_2', 'limiter_3'];
  function limitersPulled() {
    const lv = (DA.state.world && DA.state.world.levers) || {};
    return LIMITERS.filter((id) => !!lv[id]).length;
  }
  /** An ending is under way (or over): no other ending may start. */
  function endingLocked() {
    return !!(rt.opening || rt.maintaining || rt.escaping || DA.flag('ending') || done('o_woke') || done('m_done') || done('ending_chosen'));
  }
  /** 2049: the station has been dead for fifty years — its machines answer like it. */
  const abandoned = () => !!world('hasMutation', 'abandoned');
  function onControlConsole() {
    if (rt.escaping) return true;
    if (abandoned()) { thinkText(lineOf('thoughts_2049_console', 'Dead. Nothing down here has run in years.')); return true; }
    if ((DA.state.act | 0) < 5) { thinkText('Every needle on the board sits at zero, waiting.'); return true; }
    if (endingLocked()) { thinkText(lineOf('thoughts_console_done', "Not now. It's already started.")); return true; }
    once('console', async (s) => {
      if (!world('power', 'main')) { await s.do(P_(ui('think', 'Dead. Nothing down here runs without the generator.'), true)); return; }
      setBeat('destroy');
      const n = limitersPulled();
      if (n < 3) {
        await s.do(P_(ui('choice', [{ id: 'back', text: 'Step away.' }], { prompt: 'ANTENNA CONTROL — LIMITERS ENGAGED: ' + (3 - n) + ' OF 3' }), 'back'));
        obj('obj_limiters');
        return;
      }
      const c = await s.do(P_(ui('choice', [{ id: 'overload', text: 'ENGAGE OVERLOAD' }, { id: 'back', text: 'Step away.' }], { prompt: 'ANTENNA CONTROL — LIMITERS OFF' }), 'back'));
      if (c === 'overload' && !endingLocked()) run('destroy', destroyEscape);
    });
    return true;
  }
  const ESCAPE_SECS = 55;
  async function destroyEscape(s) {
    s.check();
    if (rt.escaping) return;
    setBeat('destroy');
    checkpoint('DESTROY THE ANTENNA');
    mark('ending_chosen');
    busy(true);
    rt.escaping = true;
    objDone('obj_overload');
    objDone('obj_destroy');
    objRemove('obj_maintain');
    objRemove('obj_open');
    obj('obj_escape');
    radio('removeOutgoing', 'out_keep_channel_open');
    rt.alarm = audio('loop', 'alarm', { vol: 0.55 }) || null;
    sfx('collapse_rumble', { vol: 1 });
    render('shake', 0.6, 1.4);
    stinger('low');
    caption('[alarm]', 3);
    radioQuiet(true);
    const deadline = DA.simTime + ESCAPE_SECS;
    // decision 5: a red LCD countdown at the top centre (DA.ui.countdown), driven by our own deadline;
    // without it, the old countdown hints
    const cd = DA.ui && typeof DA.ui.countdown === 'function'
      ? ui('countdown', ESCAPE_SECS, { label: 'CAR', get: () => deadline - DA.simTime, urgent: 10 })
      : null;
    if (!cd) ui('hint', String(ESCAPE_SECS), 2.4);
    // it hunts you all the way out — up the stairs, through the building, into the lot
    run('escape_hunter', async (x) => {
      await x.wait(3.5);
      if (!rt.escaping || rt.escapeDone) return;
      const where = mapId() === 'basement' ? 'pt_entity_b' : mapId() === 'array' ? 'pt_entity_array' : 'pt_entity_hall';
      spawnLethal(where);
      await pursue(x, { speed: 2.3 * power(), secs: ESCAPE_SECS + 20, delay: 3 });
    });
    let lastMark = 999;
    try {
      while (!rt.escapeDone) {
        const left = Math.ceil(deadline - DA.simTime);
        if (left <= 0) break;
        if (left !== lastMark && (left % 10 === 0 || left <= 10)) {
          lastMark = left;
          if (!cd) ui('hint', String(left), left <= 10 ? 1.1 : 2.4);
          if (left % 10 === 0 || left <= 5) {
            sfx('collapse_rumble', { vol: 0.5 + 0.5 * (1 - left / ESCAPE_SECS) });
            render('shake', 0.2 + 0.4 * (1 - left / ESCAPE_SECS), 0.8);
          }
        }
        await s.wait(0.25);
      }
    } finally {
      // made it to the car (or died): the LCD goes away
      if (cd && typeof cd.cancel === 'function' && (rt.escapeDone || rt.dying)) cd.cancel();
      radioQuiet(false);
    }
    if (!rt.escapeDone) { die('collapse'); dead(); }
  }
  async function escapeDrive(s) {
    if (rt.alarm) { try { rt.alarm.stop(1.5); } catch (e) { /* ignore */ } rt.alarm = null; }
    ui('countdown', null);
    ent('stop');
    ent('despawn', { all: true });
    objDone('obj_escape');
    sfxAt('car_door', pt('pt_car'), { vol: 0.9 });
    await s.wait(0.5);
    sfx('car_start', { vol: 0.9 });
    if (DA.scenes && DA.scenes.drive) await s.do(P_(DA.scenes.drive({ kind: 'escape', block: true }), 'done'));
    await endGame(s, 'destroy');
  }

  /* ---------------------------------------------------------------- KEEP THE CHANNEL OPEN */
  /**
   * KEEP THE CHANNEL OPEN: hold a carrier that wanders further than the lock window (you have to
   * follow it) while room-feed cues warn of the door — lose the lock for 5 s, or leave the door
   * open when it is outside, and it comes closer; three strikes and it is in the room.
   */
  async function maintainSeq(s) {
    s.check();
    if (rt.maintaining) return;
    rt.maintaining = true;
    setBeat('maintain');
    checkpoint('KEEP THE CHANNEL OPEN');
    mark('ending_chosen');
    busy(true);
    objDone('obj_maintain');
    objRemove('obj_destroy');
    objRemove('obj_open');
    obj('obj_hold_signal');
    radio('jam', 0.15);
    radioQuiet(true);
    const hold = air('tx_keep_channel', { scan: 'exact', drift: { amp: 0.085, period: 30 }, loop: true, bearing: null });
    let held = 0, lostT = 0, strikes = 0, t = 0, ci = 0;
    const cues = [
      { at: 26, id: 'rf_keep_2', need: 'door' },
      { at: 58, id: 'rf_keep_1', need: 'door' },
      { at: 92, id: 'rf_keep_4', need: 'door' },
      { at: 122, id: 'rf_keep_3', need: 'lock' },
    ];
    const STRIKE_CAPS = ['[something stops outside the door]', '[the handle turns; the door holds]', '[it is in the room]'];
    const strike = (why) => {
      strikes++;
      const door = { x: 19.5, y: 14.8, map: 'station' };
      if (strikes === 1) { sfxAt('footstep_other', door, { vol: 0.9 }); world('flickerNear', 19.5, 13, 1.2, 'station'); }
      else if (strikes === 2) { sfxAt('door_locked', door, { vol: 1 }); sfxAt('breath_other', door, { vol: 0.6 }); world('flickerNear', 18, 11, 2, 'station'); }
      caption(why === 'lost' && strikes < 3 ? '[the carrier slips — ' + STRIKE_CAPS[strikes - 1].slice(1) : STRIKE_CAPS[Math.min(2, strikes - 1)], 2.8);
      DA.bus.emit('director:strike', { n: strikes, why });
    };
    const offEv = DA.bus.on('roomfeed:event', (e) => {
      if (!e || !/^rf_keep_/.test(e.feed || '')) return;
      const cue = cues.find((c) => c.id === e.feed);
      if (!cue) return;
      const locked = atDesk() && radio('isLocked', 'tx_keep_channel');
      if (cue.need === 'door' && doorOpenAmount('radio_door') > 0.1) strike('door');
      else if (cue.need === 'lock' && !locked) strike('lock');
    }, { session: true });
    while (held < 150) {
      await s.wait(0.25);
      t += 0.25;
      const locked = atDesk() && radio('isLocked', 'tx_keep_channel');
      if (locked) { held += 0.25; lostT = 0; } else { lostT += 0.25; if (lostT >= 5) { lostT = 0; strike('lost'); } }
      if (ci < cues.length && t >= cues[ci].at) { playFeed(cues[ci].id); ci++; }
      if (strikes >= 3) {
        offEv();
        radioQuiet(false);
        P_(ent('flicker', 'behind', 0.6, { stinger: 'high' }));
        await s.wait(0.5);
        die('lost_channel');
        dead();
      }
    }
    offEv();
    mark('m_done');
    radioQuiet(false);
    stopEntity();
    radio('stop', 'tx_keep_channel');
    await s.do(P_(hold, null));
    objDone('obj_hold_signal');
    // dawn
    DA.setFlag('collapse', false);
    DA.setFlag('you_realtime', false);
    radio('jam', 0);
    DA.setFlag('sunrise_unknown', false);
    DA.state.sunrise = DA.clock.min;
    calm();
    // the day crew's power: the set runs again, the red lamps go out
    if (!world('power', 'generator')) { world('setPower', 'generator', true); sfxAt('generator_start', 'pt_gen', { vol: 0.6 }); }
    world('setGeneratorSound', null);
    DA.timers.after(2.5, () => world('setPower', 'main', true), 'dir_dawn');
    run('unblend', async (x) => { for (let b = +DA.state.world.blend || 0; b > 0; b -= 0.02) { world('setBlend', Math.max(0, b)); await x.wait(0.2); } world('setBlend', 0); });
    dawn(0.75, 22);
    await s.wait(4);
    await thought(s, 'thoughts_dawn');
    await s.wait(4);
    await replacementArrives(s);
    obj('obj_handover');
    await reliefFindsYou(s);
    faceNpc('replacement');
    await speakAs(s, 'replacement_arrive', 'replacement');
    for (const [ptn, did] of ((C().tour || {}).replacement || [])) {
      await walk(s, 'replacement', [ptn], 1.2);
      await waitFollow(s, 'replacement', null);
      faceNpc('replacement');
      await speakAs(s, did, 'replacement');
      await s.wait(0.5);
    }
    await s.wait(0.8);
    await speakAs(s, 'replacement_148', 'replacement');
    await s.wait(1.4);
    await speakAs(s, 'replacement_why', 'replacement');
    await s.wait(2);
    objDone('obj_handover');
    await endGame(s, 'maintain');
  }
  /** Dialogue where the player's lines are the only thing the player can choose to say. */
  async function speakAs(s, id, npc) {
    const lines = (C().dialogue || {})[id] || [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const text = DA.fmt(altText(l, id + ':' + i));
      if (l.s === 'you') {
        await s.do(P_(ui('choice', [{ id: 'say', text }], {}), 'say'));
        await sayLine(s, 'you', text);
      } else await sayLine(s, l.s, text, { npc: l.s === npc ? npc : undefined });
      await s.wait(l.gap != null ? l.gap : 0.35);
    }
  }

  /* ---------------------------------------------------------------- OPEN THE CHANNEL */
  function onRelayDoor() {
    mark('relay_door_seen');
    if (DA.flag('relay_unlocked')) { enterRelay(); return true; }
    if (done('blueprint_read')) thinkOnce('thoughts_steel_door');
    const sess = DA.session;
    P_(devs('keypad', 'open', { id: 'relay_door', code: '0213', title: 'RELAY CHAMBER' }), false).then((ok) => {
      if (!ok || DA.session !== sess || !DA.running) return;
      DA.setFlag('relay_unlocked', true);
      DA.timers.after(0.9, enterRelay, 'dir_relay');
    });
    return true;
  }
  function enterRelay() {
    sfxAt('door_heavy', { x: 45.5, y: 8.9, map: 'station' }, { vol: 0.9 });
    world('load', 'relay', 'pt_relay_arrive', { fade: true, via: 'stairs', from: 'relay_door' });
    if ((DA.state.act | 0) >= 5) { obj('obj_relay'); DA.timers.after(1, () => objDone('obj_relay'), 'dir_relay'); }
  }
  function onRelayConsole() {
    if (abandoned()) { thinkText(lineOf('thoughts_2049_console', 'Dead. Nothing down here has run in years.')); return true; }
    if ((DA.state.act | 0) < 5) { thinkText('Every needle in here leans the same way. Down.'); return true; }
    if (endingLocked()) { thinkText(lineOf('thoughts_console_done', "Not now. It's already started.")); return true; }
    once('amplify', async (s) => {
      obj('obj_amplify');
      const c = await s.do(P_(ui('choice', [{ id: 'amplify', text: 'AMPLIFY' }, { id: 'back', text: 'Not yet.' }], { prompt: 'RELAY CONSOLE' }), 'back'));
      if (c === 'amplify' && !endingLocked()) run('open', openSeq);
    });
    return true;
  }
  async function openSeq(s) {
    s.check();
    if (rt.opening) return;
    rt.opening = true;
    setBeat('open');
    checkpoint('OPEN THE CHANNEL');
    mark('ending_chosen');
    // nothing else can be said into 2049 but the answer to your own radio check
    for (const o of ((DA.state.radio && DA.state.radio.outgoing) || []).slice()) radio('removeOutgoing', o.id);
    busy(true);
    objDone('obj_amplify');
    objDone('obj_open');
    objRemove('obj_destroy');
    objRemove('obj_maintain');
    sfx('power_up', { vol: 0.8 });
    sfx('static_burst', { vol: 1 });
    render('glitch', 0.8, 0.9);
    render('shake', 0.4, 1.2);
    radio('jam', 1);
    stopEntity();
    await s.wait(1.6);
    stopEntity();
    if (DA.scenes && DA.scenes.multiverse) await s.do(P_(DA.scenes.multiverse(15), 'done'));
    // silence — then daylight, decades later
    ui('fade', 1, 0);
    radio('jam', 0);
    stopFeed();
    radio('stop');
    for (const o of ((DA.state.radio && DA.state.radio.outgoing) || []).slice()) radio('removeOutgoing', o.id);
    DA.setFlag('collapse', false);
    DA.setFlag('you_realtime', false);
    DA.setFlag('sunrise_unknown', false);
    world('setBlend', 0);
    calm();
    ui('objectivesClear');
    world('setPower', 'main', false);
    world('setPower', 'emergency', false);
    world('setGeneratorSound', null);
    world('applyMutation', 'abandoned');
    // in the chair, turned toward the daylight in the west window
    const chair = pt('pt_radio_chair');
    if (chair) world('load', 'station', { x: chair.x, y: chair.y + 0.15, angle: 172 }, { fade: false });
    else world('load', 'station', 'pt_radio_chair', { fade: false });
    render('glitch', 0, 0); // the amplify burst must not survive the silence
    DA.clock.min = (Date.UTC(2049, 9, 27, 9, 14) - DA.START_UTC) / 60000;
    DA.state.sunrise = DA.clock.min - 150;
    DA.clock.rate = 0.05;
    mark('o_woke');
    stopEntity(); // 2049: the collapse is over — nothing of it is left down there
    radioQuiet(true); // …and nothing on the air but what answers you
    const lines = ((C().endings || {}).open || {}).lines || ['Silence.', 'Daylight.'];
    await s.wait(1.5);
    if (lines[0]) ui('subtitle', lines[0], { kind: 'system', dur: 3.2 });
    await s.wait(3);
    ui('fade', 0, 5);
    if (lines[1]) ui('subtitle', lines[1], { kind: 'system', dur: 3.5 });
    await s.wait(5.5);
    if (lines[2]) ui('subtitle', lines[2], { kind: 'system', dur: 5 });
    rt.carLine = lines[3] || null;
    // the newspaper
    await s.until(() => done('newspaper_read'), 120);
    await s.wait(1.2);
    await thought(s, 'thoughts_newspaper');
    await s.wait(4);
    // the radio crackles: your own voice, from the start of the night (the terminal stays dead)
    const text = firstCheckText();
    const respond = ((C().endings || {}).open || {}).respond || 'Station Fourteen. Loud and clear.';
    const over = {
      hail: [{ s: 'you_recorded', t: text }], hailGap: 6,
      script: {
        start: [{ s: 'you_recorded', t: text }, { choose: [{ id: 'respond', t: respond, next: 'done', interfere: false }], timeout: 30, onTimeout: 'again' }],
        again: [{ wait: 5 }, { goto: 'start' }],
        done: [{ end: true }],
      },
    };
    if (!radioHasOutgoing('out_respond_2049')) radio('addOutgoing', 'out_respond_2049');
    air('tx_radio_check_2049', { over, scan: 'exact', bearing: null, ceiling: true });
    await s.until(() => rt.responded2049);
    await s.wait(2.6);
    radio('stop', 'tx_radio_check_2049');
    await endGame(s, 'open');
  }
  function firstCheckText() {
    const recs = (DA.state.radio && DA.state.radio.recordings) || [];
    const r = recs.find((x) => x.txId === 'out_radio_check') || recs[0];
    const o = (C().outgoing || {}).out_radio_check;
    return (r && r.text) || (o && (o.text || o)) || 'Station Fourteen, radio check.';
  }

  /* ================================================================ interactions */
  function onCar() {
    if (rt.escaping) {
      if (!rt.escapeDone) { rt.escapeDone = true; run('escape_drive', escapeDrive); }
      return true;
    }
    if (rt.canLeave === 'secret') { rt.leaving = 'secret'; rt.canLeave = false; return true; }
    if (world('hasMutation', 'abandoned')) {
      once('rust', async (s) => { await thought(s, 'thoughts_car_rusted'); if (rt.carLine) { ui('subtitle', rt.carLine, { kind: 'system', dur: 4 }); rt.carLine = null; } });
      return true;
    }
    if ((DA.state.act | 0) >= 2 && DA.flag('outside_unstable') && rt.busy === 0 && !DA.flag('ending')) { once('drive_loop', driveLoop); return true; }
    if (DA.flag('tour_done')) { thinkNow('thoughts_shift_not_over'); return true; }
    const t = (C().looks || {}).player_car;
    if (t) thinkText(t);
    return true;
  }
  async function driveLoop(s) {
    const c = await s.do(P_(ui('choice', [{ id: 'drive', text: 'Drive away.' }, { id: 'stay', text: 'Stay.' }], {}), 'stay'));
    if (c !== 'drive') return;
    busy(true);
    sfxAt('car_door', pt('pt_car'), { vol: 0.9 });
    await s.wait(0.6);
    sfx('car_start', { vol: 0.8 });
    const n = count('driveLoops');
    if (DA.scenes && DA.scenes.drive) await s.do(P_(DA.scenes.drive({ kind: 'loop', loop: n, block: true }), 'done'));
    ui('fade', 1, 0);
    world('teleport', 'pt_arrive');
    await s.wait(0.4);
    ui('fade', 0, 2.2);
    busy(false);
    await s.wait(1.6);
    if (n === 1) await thought(s, 'thoughts_drive_loop');
  }
  function onGenerator() {
    const on = !!world('power', 'generator');
    const act = DA.state.act | 0;
    if (abandoned()) { thinkText(lineOf('thoughts_2049_generator', 'Seized solid. Nobody has run it in years.')); return true; }
    if (!on) {
      if (endingLocked()) { thinkText('Leave it.'); return true; }
      if (act >= 4 || done('a3_hide')) {
        once('gen_on', async (s) => {
          const c = await s.do(P_(ui('choice', [{ id: 'on', text: 'Start it.' }, { id: 'leave', text: 'Leave it.' }], { prompt: 'BACKUP GENERATOR' }), 'leave'));
          if (c === 'on') generatorOn();
        });
      } else thinkText(lineOf('thoughts_gen_dead', "It won't turn over. Not now."));
      return true;
    }
    if (act === 3 && done('a3_calm_gen') && !DA.flag('generator_off')) {
      // Calm said it: the flashlight first
      if (!DA.hasItem('flashlight')) {
        thinkText(lineOf('thoughts_need_light', "I'll want a light first."));
        obj('obj_flashlight');
        return true;
      }
      once('gen_off', async (s) => {
        const c = await s.do(P_(ui('choice', [{ id: 'off', text: 'Switch it off.' }, { id: 'leave', text: 'Leave it running.' }], { prompt: 'BACKUP GENERATOR' }), 'leave'));
        if (c !== 'off' || DA.flag('generator_off')) return;
        // the retry point is the lit station, with the flashlight in hand; the objective trick
        // has been seen by now, so a reload shows the plain duty instead of replaying it
        mark('gen_trick');
        if (!done('cp_generator')) { mark('cp_generator'); checkpoint('GENERATOR'); }
        generatorOff();
      });
      return true;
    }
    thinkText('Procedures say leave it running.');
    return true;
  }
  const lineOf = (id, fallback) => { const l = ((C().dialogue || {})[id] || [])[0]; return (l && l.t) || fallback; };
  function onControlDoor() {
    const d = world('door', 'control_door');
    if (!d || !d.locked || !DA.hasItem('key_antenna')) return false; // open/close as usual, or "Locked."
    if (world('power', 'generator')) {
      sfxAt('door_locked', { x: 14.5, y: 14.5, map: 'basement' }, { vol: 0.8 });
      thinkText("The interlock won't release. Not while the generator's running.");
      return true;
    }
    // the array is the midpoint revelation: the bolt holds until Old You has sent you down
    if (!done('a3_old1') && (DA.state.act | 0) < 4) {
      sfxAt('door_locked', { x: 14.5, y: 14.5, map: 'basement' }, { vol: 0.8 });
      thinkText(lineOf('thoughts_control_wait', "The key turns. The bolt doesn't. Something's still holding it."));
      return true;
    }
    return false; // key + generator off: the door's own handler unlocks it
  }
  /** The hatch down to the array (a door opened in an older night must not let ACT 3 in early). */
  function onArrayHatch() {
    if (abandoned() || done('o_woke')) { thinkText(lineOf('thoughts_2049_hatch', 'The hatch is rusted shut.')); return true; }
    if ((DA.state.act | 0) >= 4 || done('a3_old1')) return false;
    thinkText(lineOf('thoughts_hatch_wait', "The hatch won't lift. Not yet."));
    return true;
  }
  /** After something has knocked on it, the radio-room window is not just rain any more. */
  function onRadioWindow() {
    if (!DA.flag('nasty_done') && (DA.state.act | 0) < 4) return false;
    thinkNow('thoughts_window');
    return true;
  }
  /** After the handover the desk is hers: the night operator does not sit back down. */
  function onRadioDesk() {
    if (!done('handover') || DA.flag('ending') || !world('npc', 'replacement') || rt.canLeave !== 'secret') return false;
    thinkText(lineOf('thoughts_her_radio', "It's her radio now."));
    return true;
  }
  function onWallMap() {
    if (!objOpen('obj_find_kestrel')) return false;
    P_(devs('map', 'open', { find: 'kestrel_mm14' }), null);
    return true;
  }
  function onDeskCalendar() {
    if (!objOpen('obj_check_date')) return false;
    const sess = DA.session;
    P_(devs('calendar', 'open'), null).then(() => { if (DA.session === sess) mark('date_checked'); });
    DA.timers.after(1.4, () => {
      if (DA.session !== sess) return;
      stinger('low');
      thinkNow('thoughts_check_date');
    }, 'dir_cal');
    return true;
  }
  let interactDone = false;
  /**
   * The director's interactables, by id (DA.interact.onId: an id handler always runs before every
   * kind handler, so the backup `generator` — id == kind — reaches the director before devices').
   */
  function registerInteract() {
    if (interactDone || !DA.interact || typeof DA.interact.onId !== 'function') return;
    interactDone = true;
    const IX = DA.interact;
    const wrap = (key, fn) => (it, o) => {
      if (!DA.running) return false;
      try { return fn(it, o) === true; } catch (e) { report('interact:' + key, e); return false; }
    };
    const on = (id, fn) => IX.onId(id, wrap(id, fn));
    const onKind = (kind, fn) => IX.onKind(kind, wrap(kind, fn));
    on('car', onCar);
    on('generator', onGenerator);
    on('control_door', onControlDoor);
    on('array_hatch', onArrayHatch);
    on('signin_sheet', onSigninSheet);
    on('relay_door', onRelayDoor);
    on('control_console', onControlConsole);
    on('relay_console', onRelayConsole);
    on('wall_map', onWallMap);
    on('radio_desk', onRadioDesk);
    on('desk_calendar', onDeskCalendar);
    on('radio_window', onRadioWindow);
    onKind('console', () => true);
  }

  /* ================================================================ listeners */
  function firstSit() {
    if (DA.flag('tour_done') && !done('hollis_note')) {
      mark('hollis_note');
      once('hollis_note', async (s) => {
        await s.wait(0.7);
        await s.do(P_(ui('doc', 'doc_hollis_note'), true));
        hintsOnce();
      });
      return;
    }
    hintsOnce();
  }
  /**
   * The desk control hints, one after another while seated. Standing up interrupts them; the rest
   * resume the next time the player sits (each is marked once shown: 'hint_desk:<key>').
   */
  const DESK_HINTS = ['tune', 'antenna', 'mic', 'log', 'stand'];
  function hintsOnce() {
    if (done('hints')) return;
    const H = C().hints || {};
    once('hints', async (s) => {
      await s.wait(0.8);
      for (const key of DESK_HINTS) {
        if (done('hint_desk:' + key) || !H[key]) continue;
        if (!atDesk()) return;
        mark('hint_desk:' + key);
        ui('hint', H[key], 4.2);
        rt.deskHintUntil = DA.simTime + 4.2;
        await s.wait(4.9);
      }
      mark('hints');
    });
  }
  /**
   * The girl's "[Turn off the receiver.]" — the one answer the power switch ends (her transmission,
   * received and numbered, choice 'power_off'). Anything else on the air is only suspended by
   * DA.radio and hails again under the same number once the set is back on. The building answers:
   * every light stutters, the generator falters, something hits the window; after ~12 s the receiver
   * comes back on by itself (unless the operator already switched it on). On the ordinary night
   * nothing answers — the set just comes back on (it always does).
   */
  function powerOffEffects() {
    once('power_off', async (s) => {
      busy(true);
      const t0 = DA.simTime;
      const answered = !((DA.state.act | 0) < 2 && DA.isPure());
      const prevGen = (DA.state.world && DA.state.world.genSound) || null;
      if (answered) {
        const lamps = [[17.5, 11], [20, 11], [17.5, 15.5], [22.5, 15.5], [27.5, 15.5], [32.5, 15.5], [37.5, 15.5], [33.5, 10.8], [27.5, 11], [38.9, 11], [32.5, 19.5], [22.5, 19.5], [42.5, 19.5]];
        for (const [x, y] of lamps) world('flickerNear', x, y, 5, 'station');
        world('setGeneratorSound', 'stutter');
        for (let k = 0; k < 4; k++) {
          await s.wait(U.rand(1.1, 2.4));
          sfxAt('bird_strike', { x: 14.7, y: U.rand(9.6, 12.4), map: 'station' }, { vol: 0.95 });
          if (k === 1) caption('[something hits the window]', 2.4);
        }
      }
      await s.wait(Math.max(0.5, 12 - (DA.simTime - t0)));
      if (DA.radio && !DA.radio.power) {
        radio('setPower', true);
        sfx('static_burst', { vol: answered ? 0.5 : 0.3 });
      }
      if (answered) world('setGeneratorSound', prevGen);
      busy(false);
    });
  }
  /** After the bridge / the child: it hasn't happened yet — somebody could warn them (decision 3). */
  function warnCue(which) {
    if (done('warncue:' + which)) return;
    mark('warncue:' + which);
    const sess = DA.session;
    DA.timers.after(2.2, () => {
      if (DA.session !== sess || DA.flag(which === 'bridge' ? 'bridge_warned' : 'fire_warned')) return;
      if (which === 'bridge' && done('bridge_expired')) return;
      run('warncue', (x) => thought(x, which === 'bridge' ? 'thoughts_warn_bridge' : 'thoughts_warn_fire'));
      obj(which === 'bridge' ? 'obj_warn_bridge' : 'obj_warn_fire');
    }, 'dir_warn');
  }
  /** The lobby register after the handover: your line gets its OUT time (Hollis: "They check."). */
  function onSigninSheet() {
    if (!done('handover')) return false;
    const d = Object.assign({}, (C().docs || {}).doc_signin || {});
    if (!d.body) return false;
    if (!DA.flag('signed_out')) {
      DA.setFlag('signed_out', DA.clock.hhmm());
      sfx('pen', { vol: 0.6 });
      objDone('obj_signout');
    }
    d.id = 'doc_signin';
    d.body = String(d.body).replace(/(\{NAME_UP\}[^\n]*?OUT )_+/, '$1' + String(DA.flag('signed_out')));
    P_(ui('doc', d), true);
    return true;
  }
  function injectTx41() {
    if (done('tx41')) return;
    mark('tx41');
    const t = Object.assign({}, (C().log || {}).tx41 || { num: 41, sender: 'STATION 14', stamp: 'NULL', summary: 'I CAN HEAR YOU READING THIS.' });
    radio('addEntry', { num: t.num || 41, txId: 'tx41', freq: null, sender: t.sender, summary: t.summary, stamp: t.stamp || 'NULL', received: 'NULL', offset: '--:--:--', offsetText: '--:--:--', status: 'NULL', logged: false, glitch: true });
    sfx('static_burst', { vol: 0.25 });
  }

  function installListeners() {
    const on = (ev, fn) => DA.bus.on(ev, (e) => {
      if (!DA.running) return;
      try { fn(e || {}); } catch (err) { report('on:' + ev, err); }
    }, { session: true });

    // every new interference pushes the dawn back
    on('interference', () => { if (DA.flag('act2') || (DA.state.act | 0) >= 2) DA.state.sunrise = (+DA.state.sunrise || SUNRISE) + 35; });
    // the ceiling speaker + the girl's use of your name
    on('radio:line', (e) => {
      if (/^tx_girl_19/.test(e.txId || '') && DA.state.playerName && String(e.t || '').indexOf(DA.state.playerName) >= 0) rt.girlName = true;
      if (!rt.ceiling.has(e.txId) || !ceilingHears()) return;
      ui('subtitle', e.t, { kind: 'radio', speaker: e.s, tag: '[SPEAKER]', clarity: 1 });
      audio('voice', e.t, e.s, { radio: true, clarity: 0.8, vol: 0.5 });
    });
    // it has grown a step stronger: the next time you see it, you notice (strongerWatcher)
    on('entity:power', (e) => { if ((+e.level || 0) >= 1 && !done('stronger_due')) mark('stronger_due'); });
    // a feed that ends (completed, or stopped: another feed, the receiver) takes its ceiling echo with it
    on('roomfeed:end', (e) => {
      if (!e.feed || !rt.ceilFeeds.has(e.feed)) return;
      DA.timers.cancelTag('dir_ceiling:' + e.feed);
      rt.ceilFeeds.delete(e.feed);
    });
    on('roomfeed:event', (e) => {
      if (e.event === 'chair_move') chairMove();
      else if (e.event === 'jar_fall') jarFall();
    });
    on('radio:sit', () => { for (const id of Array.from(rt.airing.keys())) tryScan(id); firstSit(); });
    // a desk hint does not linger over the room once you stand (the arrow keys don't tune there)
    on('radio:stand', () => { if (DA.simTime < rt.deskHintUntil) { rt.deskHintUntil = -1; ui('hint', null); } });
    on('radio:action', (e) => { if (e.action === 'power_off') powerOffEffects(); });
    // "Check the date." — the wristwatch shows it too
    on('watch', (e) => { if (e.on !== false) dateChecked(); });
    // the warnings nobody tells you that you could send (decision 3): a thought, an optional objective
    on('radio:received', (e) => { if (e.txId === 'tx_bridge' && S().t.bridgeEvent == null) S().t.bridgeEvent = DA.clock.min + 20; });
    on('radio:ended', (e) => {
      if ((DA.state.act | 0) < 2 || !(e.result && e.result.num != null)) return;
      if (e.txId === 'tx_bridge' && !DA.flag('bridge_warned') && radioHasOutgoing('out_warn_bridge')) warnCue('bridge');
      else if (e.txId === 'tx_child_fire' && !DA.flag('fire_warned') && radioHasOutgoing('out_warn_fire')) warnCue('fire');
    });
    on('radio:tuned', (e) => {
      if (e.manual && Math.abs((+e.freq || 0) - 148.32) < 0.001 && !done('th:thoughts_first_148') && atDesk() && !anyAiring()) {
        const sess = DA.session;
        DA.timers.after(0.9, () => { if (DA.session === sess && DA.radio && Math.abs(DA.radio.freq - 148.32) < 0.001) thinkOnce('thoughts_first_148'); }, 'dir_148');
      }
    });
    on('flag', (e) => {
      if (e.key === 'mug_on_desk') {
        // (once the mug has walked to the kitchen it stays there; a fresh cup lives on the desk UI)
        if (DA.flag('mug_moved')) return;
        if (e.value) { world('pointProp', 'mug', 'pt_mug_radio'); world('showProp', 'mug', true); }
        else world('showProp', 'mug', false);
      }
    });

    // --- the job
    on('coffee:made', () => {
      completeTask('coffee');
      if (S().t.refill) {
        S().t.refill = false;
        objDone('obj_coffee');
        if (DA.flag('mug_on_desk')) DA.setFlag('mug_on_desk', false);
      }
      thinkOnce('thoughts_coffee');
    });
    on('radio:sent', (e) => {
      const id = e.id;
      if (id === 'out_radio_check' && !done('radio_check_sent')) {
        mark('radio_check_sent');
        once('radio_check', async (s) => {
          await s.wait(1.4);
          await s.do(air('tx_radio_check_reply', { noLock: true }));
          completeTask('radio_check');
        });
      } else if (id === 'out_dispatch_flat' && !tdone('trucker')) {
        once('dispatch_flat', async (s) => {
          await s.wait(1.4);
          await s.do(air('tx_dispatch_flat_ack', { noLock: true }));
          objDone('obj_call_dispatch');
          completeTask('trucker');
        });
      } else if (id === 'out_report_kestrel') {
        mark('kestrel_reported');
      } else if ((id === 'out_warn_bridge' || id === 'out_warn_bridge_dispatch') && !DA.flag('bridge_warned')) {
        DA.setFlag('bridge_warned', true);
        S().t.bridgeAt = DA.clock.min + 20;
        objDone('obj_warn_bridge');
        // one warning is enough: its sibling on the other channel leaves the mic
        radio('removeOutgoing', id === 'out_warn_bridge' ? 'out_warn_bridge_dispatch' : 'out_warn_bridge');
      } else if (id === 'out_warn_fire' && !DA.flag('fire_warned')) {
        DA.setFlag('fire_warned', true);
        S().t.fireAt = DA.clock.min + 15;
        objDone('obj_warn_fire');
      } else if (id === 'out_keep_channel_open' && (DA.state.act | 0) >= 5 && !endingLocked()) {
        run('maintain', maintainSeq);
      } else if (id === 'out_respond_2049') {
        rt.responded2049 = true;
      }
    });
    on('radio:choice', (e) => {
      if (e.txId === 'tx_radio_check_2049' && e.optionId === 'respond') rt.responded2049 = true;
      // answering the trucker ticks "Answer the trucker" at once (County's relay is its own duty)
      if (e.txId === 'tx_trucker_flat' && e.optionId === 'respond') objDone('obj_trucker');
    });
    on('weather:read', (e) => {
      const roof = e.source === 'mast';
      // ACT 1's "Check the weather instruments on the roof." is the roof trip: only the mast counts
      // (the office's remote display is fine for the hourly readings of the ordinary night)
      if (roof) completeTask('weather');
      else if (objOpen('obj_weather') && !tdone('weather')) { const sess = DA.session; DA.timers.after(1.2, () => { if (DA.session === sess) thinkOnce('thoughts_weather_panel'); }, 'dir_roof'); }
      const due = S().t.wxDue;
      if (due != null && (e.min == null || e.min >= due - 0.5)) objDone('obj_weather_hourly');
      if (roof) { const sess = DA.session; DA.timers.after(1.6, () => { if (DA.session === sess) thinkOnce('thoughts_roof'); }, 'dir_roof'); }
    });
    // the office's remote display (linked to the mast) is a reading too, on the hour
    on('weather:view', (e) => {
      const due = S().t.wxDue;
      if (e.source === 'panel' && due != null && DA.clock.min >= due - 0.5) objDone('obj_weather_hourly');
    });
    on('breaker:reset', (e) => {
      if (e.id !== 'C' || !done('breaker_tripped')) return;
      completeTask('breaker');
      if (objOpen('obj_breaker')) objDone('obj_breaker');
      thinkOnce('thoughts_breaker');
    });
    on('radio:logged', (e) => { if (e.txId === 'tx_police_chatter') completeTask('police'); });
    on('calendar:flipped', () => { completeTask('calendar'); thinkOnce('thoughts_calendar'); });
    on('paperwork:done', (e) => { if (e.complete !== false) completeTask('paperwork'); });

    // --- 02:13 and the rewards
    on('woman:location', () => { mark('kestrel_given'); obj('obj_find_kestrel'); kestrelMicNote(true); });
    on('map:located', (e) => {
      if ((e.find === 'kestrel_mm14' || e.id === 'kestrel_mm14') && !done('kestrel_found')) {
        mark('kestrel_found');
        objDone('obj_find_kestrel');
        obj('obj_call_dispatch');
        if (!radioHasOutgoing('out_report_kestrel') && !done('kestrel_reported')) radio('addOutgoing', 'out_report_kestrel');
        kestrelMicNote(false);
      }
    });
    on('bridge:details', () => {
      if (DA.flag('bridge_warned')) return;
      if (!radioHasOutgoing('out_warn_bridge')) radio('addOutgoing', 'out_warn_bridge');
      if (!radioHasOutgoing('out_warn_bridge_dispatch')) radio('addOutgoing', 'out_warn_bridge_dispatch');
    });
    on('child:address', () => { if (!DA.flag('fire_warned') && !radioHasOutgoing('out_warn_fire')) radio('addOutgoing', 'out_warn_fire'); });

    // --- the building
    on('door:close', (e) => { if (e.by === 'player' && STATION_DOORS.includes(e.id)) S().lastClosed = e.id; });
    // the radio-room door the −00:00:04 feed moved: once you touch it, it is no longer the one you didn't hear
    on('door:open', (e) => { if (e.id === 'radio_door' && e.by === 'player') rt.pastTouched = true; });
    on('door:close', (e) => { if (e.id === 'radio_door' && e.by === 'player') rt.pastTouched = true; });
    on('door:open', (e) => { if (e.by === 'player' && STATION_DOORS.includes(e.id)) S().lastOpened = e.id; });
    on('door:unlock', (e) => { if (e.id === 'records_door') DA.setFlag('records_unlocked', true); });
    on('door:open', (e) => { if (e.id === 'records_door' && !DA.flag('records_opened')) DA.setFlag('records_opened', true); });
    on('keypad:ok', (e) => { if (e.id === 'key_cabinet') { const sess = DA.session; DA.timers.after(1.2, () => { if (DA.session === sess) thinkOnce('thoughts_records_key'); }, 'dir_kp'); } });
    on('keypad:bad', (e) => { if (e.id === 'key_cabinet') { const sess = DA.session; DA.timers.after(0.9, () => { if (DA.session === sess) thinkOnce('thoughts_keypad_year'); }, 'dir_kp'); } });
    on('item:add', (e) => { if ((e.id || e.item) === 'flashlight') objDone('obj_flashlight'); });
    // a phone nobody scripted: the line is open, and nobody is on it
    on('phone:answer', () => { if (DA.flag('phone_done')) { const sess = DA.session; DA.timers.after(1.4, () => { if (DA.session === sess && devs('phone', 'isUp')) caption('[an open line. Rain, somewhere on it.]', 3.2); }, 'dir_phone'); } });
    on('tape:found', (e) => { if (e.id === 'tape_name') thinkOnce('thoughts_tape_name'); });
    on('photo:view', (e) => {
      if (!e.four) { mark('photo_seen3'); return; }
      if (done('th:photo_four')) return;
      mark('th:photo_four');
      once('photo', async (s) => {
        await s.wait(1.8);
        if (done('photo_seen3')) await thought(s, 'thoughts_photo');
        await thought(s, 'thoughts_photo_four');
      });
    });
    on('mirror:open', (e) => {
      const st = +e.stage || +DA.flag('mirror_stage') || 0;
      // stage 2: the reflection lags; stage 3: it does not move at all, someone in the door behind
      const id = st >= 3 ? 'thoughts_mirror3' : st >= 2 ? 'thoughts_mirror' : null;
      if (!id || done('th:' + id)) return;
      once('mirror', async (s) => { await s.wait(3.2); thinkOnce(id); });
    });
    on('vent:open', (e) => {
      if (e.id !== 'vent_basement') return;
      DA.setFlag('key_found', true);
      if (done('a3_calm_vent')) DA.setFlag('followed_future', true);
      objDone('obj_vent');
      if (done('a3_calm_vent')) once('key', async (s) => { await s.until(() => !DA.modes.has('doc'), 40); await s.wait(0.6); await thought(s, 'thoughts_key'); });
    });
    on('doc:close', (e) => {
      if (e.id === 'doc_report' && (DA.state.act | 0) >= 4) DA.setFlag('report_read', true);
      else if (e.id === 'doc_newspaper_2049') mark('newspaper_read');
      else if (e.id === 'doc_blueprint') { mark('blueprint_read'); if (done('relay_door_seen')) thinkOnce('thoughts_blueprint'); }
    });
    on('cctv:figure', (e) => { rt.figSeen = Math.max(rt.figSeen, +e.stage || 0); rt.figCam = e.cam != null ? String(e.cam) : rt.figCam; });
    on('cctv:open', (e) => { rt.figViewed = rt.figCam != null && e.cam != null && String(e.cam) === rt.figCam; });
    on('cctv:view', (e) => { if (rt.figCam != null && e.cam != null && String(e.cam) === rt.figCam) rt.figViewed = true; });
    on('cctv:close', onCctvClose);
    on('journal:log-open', () => {
      rt.logOpen = true;
      if (done('d_log1') && !done('tx41')) {
        const sess = DA.session;
        if (rt.logTimer) DA.timers.cancel(rt.logTimer);
        rt.logTimer = DA.timers.after(4, () => { if (DA.session === sess && rt.logOpen) injectTx41(); }, 'dir_tx41');
      }
    });
    on('journal:log-close', () => {
      rt.logOpen = false;
      if (rt.logTimer) { DA.timers.cancel(rt.logTimer); rt.logTimer = null; }
    });
    on('trigger:enter', (e) => {
      if (e.id === 'woods_mid') {
        if (rt.woods) rt.woods.mid = true;
        thinkOnce(woodsUnstable() ? 'thoughts_woods' : 'thoughts_woods_pure');
      } else if (e.id === 'woods_path' || e.id === 'woods_out') woodsEnd(e.id === 'woods_path' ? 'west' : 'east');
      else if (e.id === 'woods_deep') {
        // (fires only walking north, near either end of the trail) — README: "You walk into the
        // woods. Ten minutes later you emerge through the station's supply cupboard."
        if (!woodsUnstable()) return;
        sfx('branches', { vol: 0.9 });
        world('teleport', 'pt_storage_arrive');
        rt.woods = null;
        lostTime(10);
        const first = !done('woods_cupboard');
        mark('woods_cupboard');
        if (first) run('cupboard', async (s) => { await s.wait(1.1); await thought(s, 'thoughts_cupboard'); });
      } else if (e.id === 'hall_end' && world('hasMutation', 'hall_long')) { objDone('obj_check_hall'); thinkOnce('thoughts_hall_long'); }
      else if (e.id === 'newhall_inside' || e.id === 'newhall_inside_b' || e.id === 'newhall_end') newHallway();
      else if (e.id === 'array_center') thinkOnce('thoughts_antenna_down');
    });
    on('portal', (e) => {
      if (e.to === 'pt_office_elsewhere') { mark('d_office_seen'); thinkOnce('thoughts_office_door'); }
    });
    on('room:enter', (e) => {
      if (e.room === 'lobby' && objOpen('obj_go_inside')) objDone('obj_go_inside');
      if (e.room === 'hall_ext' && objOpen('obj_check_hall')) { objDone('obj_check_hall'); thinkOnce('thoughts_hall_long'); }
      if (e.room === 'control' && objOpen('obj_control')) { objDone('obj_control'); obj('obj_array'); }
      // the new hallway, entered from either end (the hall door or the radio room's new door)
      if (e.room === 'newhall' && mapId() === 'station') newHallway();
    });
    on('lever', (e) => {
      if (!LIMITERS.includes(e.id) || (DA.state.act | 0) < 5 || endingLocked()) return;
      if (limitersPulled() >= 3) {
        objDone('obj_limiters');
        obj('obj_overload');
        if (!done('cp_limiters') && !endingLocked()) { mark('cp_limiters'); const sess = DA.session; DA.timers.after(0.6, () => { if (DA.session === sess) checkpoint('LIMITERS'); }, 'dir_cp'); }
      }
      else {
        obj('obj_limiters');
        objRemove('obj_overload');
      }
    });
  }

  /* ================================================================ system */
  /**
   * The long night keeps its hours whatever the player's speed: at a few beats the clock hurries
   * (never slows) so that it has reached `floorMin` within `secs` real seconds (decision 7: it passes
   * 04:00, 05:00, 06:00 and 06:42 during ACT 2–3).
   */
  /** An act's base clock rate (a running pace or room feed hands the clock back to it when it ends). */
  function setNightRate(r) {
    if (rt.pace) rt.pace.base = r;
    if (rt.feedRate != null) rt.feedRate = r;
    else DA.clock.rate = r;
  }
  const PACE_MAX = 0.25;
  function paceTo(floorMin, secs) {
    if (DA.clock.min >= floorMin) return;
    const base = rt.pace ? rt.pace.base : DA.clock.rate === RATE.real && rt.feedRate != null ? rt.feedRate : DA.clock.rate;
    rt.pace = { floor: floorMin, until: DA.simTime + (secs || 60), base };
  }
  /**
   * While a room feed counts down the clock runs in real time, so the station clock on the desk and
   * the OFFSET agree ("approximately three minutes from now … three minutes pass").
   */
  function clockTick() {
    const live = feedLive() && (DA.state.act | 0) >= 2;
    const cur = DA.clock.rate;
    const pc = rt.pace;
    if (pc && !live && rt.feedRate == null) {
      if (DA.simTime >= pc.until || DA.clock.min >= pc.floor) { DA.clock.rate = pc.base; rt.pace = null; }
      // (≤ PACE_MAX: a hurry reads as a busy night on the HH:MM clock, never as a fast-forward)
      else DA.clock.rate = Math.max(pc.base, U.clamp((pc.floor - DA.clock.min) / Math.max(1, pc.until - DA.simTime), 0, PACE_MAX));
    }
    if (live) {
      if (Math.abs(cur - RATE.real) > 1e-9) { rt.feedRate = cur; DA.clock.rate = RATE.real; }
    } else if (rt.feedRate != null) {
      if (Math.abs(cur - RATE.real) < 1e-9) DA.clock.rate = rt.feedRate;
      rt.feedRate = null;
    }
  }
  /**
   * The receiver's own cues (decision 7), for the whole night:
   *  • a director story call hailing just off the dial (scan 'near', ACT 2+) with the operator
   *    seated: after ~30 s a thought + the fine-tune hint, after ~60 s the receiver finds it exactly;
   *  • the set left switched off: after ~25 s a thought and "Switch the receiver back on."; after
   *    ~60 s (ACT 2+, not the ordinary night) it comes back on by itself with a burst of static.
   */
  function receiverWatchers() {
    watch('near_nudge', () => {
      if ((DA.state.act | 0) < 2 || !atDesk() || !DA.radio || !DA.radio.power) return false;
      for (const [id, a] of rt.airing) {
        if (!a.scanned || a.scan !== 'near' || a.fine) continue;
        if (!radio('isActive', id) || radio('isLocked', id)) continue;
        if (Math.abs((+DA.radio.freq || 0) - (+a.freq || 0)) > 0.08) continue; // tuned somewhere else
        a.nearT = (a.nearT || 0) + 0.25;
        if (a.nearT >= 30 && !a.nudged) {
          a.nudged = true;
          thinkOnce('thoughts_fine_tune');
          ui('hint', (C().hints || {}).fine || '← → to fine-tune. Watch the meter.', 4.5);
        }
        if (a.nearT >= 60) { a.fine = true; radio('autoScan', +a.freq); }
      }
      return false;
    });
    watch('power_cue', () => {
      const R = DA.radio;
      if (!R || !DA.flag('tour_done') || DA.flag('ending') || abandoned() || (DA.state.act | 0) < 1) return false;
      if (R.power) {
        if (rt.powerOffT > 0 || rt.powerCued) { rt.powerOffT = 0; rt.powerCued = false; if (objOpen('obj_power_on')) objDone('obj_power_on'); }
        return false;
      }
      if (rt.sequences.has('power_off')) return false; // the girl's answer brings it back itself
      rt.powerOffT += 0.25;
      if (rt.powerOffT >= 25 && !rt.powerCued) {
        rt.powerCued = true;
        thinkOnce('thoughts_receiver_off');
        obj('obj_power_on');
      }
      if (rt.powerOffT >= 60 && (DA.state.act | 0) >= 2 && !DA.isPure()) {
        radio('setPower', true);
        sfx('static_burst', { vol: 0.4 });
        if (nearRadio()) caption('[the receiver clicks back on by itself]', 2.6);
      }
      return false;
    });
  }
  function update(dt) {
    if (!DA.running) return;
    clockTick();
    rt.acc += dt;
    if (rt.acc < 0.25) return;
    rt.acc = 0;
    for (const id of Array.from(rt.airing.keys())) if (!rt.airing.get(id).scanned) tryScan(id);
    for (const w of rt.watchers.slice()) {
      let r = false;
      try { r = w.fn(); } catch (e) { report('watch:' + w.id, e); r = true; }
      if (r) rt.watchers = rt.watchers.filter((x) => x !== w);
    }
  }

  /* ================================================================ beats + jump */
  const BEATS = [
    ['prologue', 0, 'Prologue — the drive to Relay Station 14'],
    ['arrival', 0, 'Arrival — Hollis under the entrance light'],
    ['tour', 1, "ACT 1 — Hollis's tour"],
    ['tasks', 1, 'ACT 1 — the job'],
    ['woman', 1, '02:13 — the woman on 148.32'],
    ['pure', 1, 'Pure path — an ordinary night'],
    ['act2', 2, 'ACT 2 — The Long Night'],
    ['future17', 2, 'Transmission 17'],
    ['girl19', 2, 'Transmissions 18 and 19'],
    ['act3', 3, 'ACT 3 — Interference'],
    ['cctv', 3, 'CCTV — the figure'],
    ['phone', 3, 'The phone'],
    ['selves', 3, 'Future selves'],
    ['generator', 3, 'The generator'],
    ['hide', 3, 'The dark — hide'],
    ['drift', 3, 'The station drifts'],
    ['nasty', 3, '+00:03:14'],
    ['old1', 3, 'Old You — "Go down."'],
    ['act4', 4, 'ACT 4 — The Array'],
    ['twist', 4, 'The twist'],
    ['act5', 5, 'ACT 5 — Collapse'],
    ['destroy', 5, 'Ending — Destroy the antenna'],
    ['maintain', 5, 'Ending — Keep the channel open'],
    ['open', 5, 'Ending — Open the channel'],
    ['secret', 1, 'Secret ending — zero interaction'],
  ].map(([id, act, label]) => ({ id, act, label }));
  const MAIN = ['prologue', 'arrival', 'tour', 'tasks', 'woman', 'act2', 'future17', 'girl19', 'act3', 'cctv', 'phone', 'selves', 'generator', 'hide', 'drift', 'nasty', 'old1', 'act4', 'twist', 'act5'];
  function chainFor(id) {
    const i = MAIN.indexOf(id);
    if (i >= 0) return MAIN.slice(0, i);
    const upTo = (b) => MAIN.slice(0, MAIN.indexOf(b));
    if (id === 'pure') return upTo('woman').concat(['woman_pure']);
    if (id === 'secret') return upTo('woman').concat(['woman_pure', 'pure']);
    if (id === 'destroy' || id === 'maintain' || id === 'open') return MAIN.concat(['paths']);
    return null;
  }
  function addObj(id, isDone, glitch) {
    if (!Array.isArray(DA.state.objectives)) DA.state.objectives = [];
    const text = ((C().objectives || {})[id]) || id;
    const o = DA.state.objectives.find((x) => x.id === id);
    if (o) { o.done = !!isDone; o.glitch = !!glitch; return; }
    DA.state.objectives.push({ id, text: typeof text === 'string' ? text : text.text, done: !!isDone, glitch: !!glitch });
  }
  function dropObj(id) { if (Array.isArray(DA.state.objectives)) DA.state.objectives = DA.state.objectives.filter((o) => o.id !== id); }
  function record(text, txId, freq, min) {
    const r = DA.state.radio;
    if (!r) return;
    if (!Array.isArray(r.recordings)) r.recordings = [];
    r.recordings.push({ text: DA.fmt(text), stamp: DA.clock.stamp(min != null ? min : DA.clock.min), freq, txId });
  }
  const outText = (id) => { const o = (C().outgoing || {})[id]; return o ? (o.text || o) : ''; };
  const optText = (txId, node, optId) => {
    const t = (C().tx || {})[txId];
    const steps = (t && t.script && t.script[node]) || [];
    for (const st of steps) if (st.choose) { const o = st.choose.find((x) => x.id === optId); if (o) return o.t; }
    return '';
  };
  const SETUP = {
    prologue() { setAct(0); mark('drive'); },
    arrival() {
      mark('arrived');
      mark('greet');
      DA.clock.min = ARRIVE + 1.5;
      DA.clock.rate = RATE.tour;
      world('addNpc', { id: 'hollis', at: 'pt_hollis_start', tex: 'spr_hollis' });
      addObj('obj_go_inside', false);
    },
    tour() {
      setAct(1);
      mark('tour');
      DA.setFlag('tour_done', true);
      DA.setFlag('hollis_gone', true);
      world('removeNpc', 'hollis');
      world('removeProp', 'hollis_car');
      addObj('obj_go_inside', true);
      addObj('obj_follow_hollis', true);
      DA.clock.min = tm(26, 23, 55);
    },
    tasks() {
      for (const t of TASKS) { DA.setFlag('task_' + t.id, true); addObj(t.obj, true); }
      for (const k of ['tasks', 'breaker_tripped', 'trucker_heard', 'police_heard', 'radio_check_sent', 'hints', 'hollis_note', 'th:thoughts_coffee', 'th:thoughts_calendar', 'th:thoughts_breaker', 'th:thoughts_roof']) mark(k);
      record(outText('out_radio_check'), 'out_radio_check', 155.34, tm(26, 23, 58));
      record(optText('tx_trucker_flat', 'start', 'respond'), 'tx_trucker_flat', 27.18, tm(27, 0, 6));
      record(outText('out_dispatch_flat'), 'out_dispatch_flat', 155.34, tm(27, 0, 8));
      fakeEntry('tx_radio_check_reply', { min: tm(26, 23, 58) });
      fakeEntry('tx_trucker_flat', { min: tm(27, 0, 5), responded: true });
      fakeEntry('tx_dispatch_flat_ack', { min: tm(27, 0, 9) });
      fakeEntry('tx_police_chatter', { min: tm(27, 0, 33) });
      DA.addVar('logged', 4);
      DA.setFlag('weather_read', { time: '00:15', min: tm(27, 0, 15) });
      DA.setFlag('calendar_date', '27 OCT 1999');
      DA.setFlag('mug_on_desk', true);
      world('pointProp', 'mug', 'pt_mug_radio');
      world('showProp', 'mug', true);
      addObj('obj_call_dispatch', true);
      DA.clock.min = tm(27, 2, 12) + 0.6;
      DA.clock.rate = RATE.fast;
    },
    woman() {
      for (const k of ['woman_call', 'kestrel_given', 'kestrel_found', 'kestrel_reported', 'kestrel_ack', 'dispatch_nothing', 'reveal_log', 'reveal_date', 'date_checked', 'woman']) mark(k);
      DA.setFlag('woman_responded', true);
      fakeEntry('tx_woman', { keepStamp: true, min: WOMAN_AT + 0.3, responded: true });
      record(optText('tx_woman', 'start', 'respond'), 'tx_woman', 148.32, WOMAN_AT + 0.6);
      record(outText('out_report_kestrel'), 'out_report_kestrel', 155.34, WOMAN_AT + 2);
      fakeEntry('tx_dispatch_kestrel_ack', { min: tm(27, 2, 16) });
      fakeEntry('tx_dispatch_nothing', { min: tm(27, 2, 21) });
      DA.interfere('respond:tx_woman');
      DA.interfere('outgoing:out_report_kestrel');
      DA.setFlag('offset_unit', true);
      radio('setOffsetUnit', true);
      for (const id of ['obj_isolate', 'obj_find_kestrel', 'obj_call_dispatch', 'obj_check_log', 'obj_check_date']) addObj(id, true);
      DA.clock.min = tm(27, 2, 24);
      DA.clock.rate = RATE.night2;
    },
    woman_pure() {
      mark('woman_call');
      mark('woman');
      DA.setFlag('woman_logged', true);
      fakeEntry('tx_woman', { keepStamp: true, min: WOMAN_AT + 0.3 });
      addObj('obj_isolate', true);
      DA.clock.min = tm(27, 2, 18);
      DA.clock.rate = RATE.pure;
    },
    pure() {
      for (const ev of PURE) mark(ev.id);
      const at = { tx_pure_cb_1: tm(27, 2, 40), tx_child_fire: tm(27, 3, 12), tx_future_you_faint: tm(27, 4, 6), tx_pure_police_2: tm(27, 4, 30), tx_girl_19: tm(27, 5, 21), tx_pure_cb_2: tm(27, 5, 41) };
      for (const id in at) fakeEntry(id, { min: at[id] });
      fakeEntry('tx_pure_police_3', { min: tm(27, 6, 23) });
      mark('th:thoughts_predawn');
      addObj('obj_monitor', false);
      addObj('obj_log_traffic', false);
      addObj('obj_weather_hourly', true);
      S().t.wxDue = tm(27, 6, 0);
      DA.clock.min = tm(27, 6, 40);
      DA.clock.rate = RATE.pure;
    },
    act2() {
      setAct(2);
      DA.setFlag('act2', true);
      for (const k of ['a2_start', 'a2_truck', 'a2_chair', 'a2_bridge', 'a2_glass', 'a2_pursuit', 'a2_child', 'a2_breath', 'a2_amb', 'a2_unstable', 'a2_three', 'note_room', 'chair_moved', 'jar_fallen', 'mug_seen']) mark(k);
      const at = { tx_truck_breakdown: tm(27, 2, 35), tx_bridge: tm(27, 2, 44), tx_pursuit: tm(27, 2, 52), tx_child_fire: tm(27, 3, 1), tx_ambulance: tm(27, 3, 12), tx_three_years: tm(27, 3, 24) };
      for (const id in at) fakeEntry(id, { min: at[id] });
      radio('addNote', (C().notebook || {}).room);
      radio('addNote', (C().notebook || {}).breath);
      const c = world('prop', 'chair');
      if (c) { world('setProp', 'chair', { frame: 1, flip: !c.flip }); world('moveProp', 'chair', c.x + 0.16, c.y + 0.12); }
      const j = world('prop', 'jar');
      if (j) { world('setProp', 'jar', { z: 0, scale: 0.11 }); world('setPropTex', 'jar', 'spr_debris'); world('moveProp', 'jar', j.x + 0.28, j.y + 0.42); }
      DA.setFlag('outside_unstable', true);
      DA.setFlag('mug_moved', true);
      DA.setFlag('mug_on_desk', false);
      world('pointProp', 'mug', 'pt_mug_kitchen');
      world('setProp', 'mug', { z: 0.33 });
      world('showProp', 'mug', true);
      radio('setScanning', true);
      addObj('obj_monitor', false);
      DA.clock.min = tm(27, 3, 30);
      // the long night: a jumped ACT 2+ has had its dawn pushed back like a real one (one save's worth)
      DA.state.sunrise = Math.max(+DA.state.sunrise || SUNRISE, SUNRISE + 35);
    },
    future17() {
      topUpLog(16);
      fakeEntry('tx_future_you_17', { num: 17, patch: { sender: (C().log || {}).operator || 'STATION 14 (OPERATOR)' } });
      for (const k of ['a2_17', 'a2_tape', 'a2_photo']) mark(k);
      DA.setFlag('photo_four', true);
      DA.clock.min = tm(27, 3, 52);
    },
    girl19() {
      fakeEntry('tx_18', { min: tm(27, 4, 2) });
      fakeEntry('tx_girl_19', { min: tm(27, 4, 4) });
      DA.setFlag('girl_choice', 'ignore');
      DA.setFlag('sunrise_unknown', true);
      for (const k of ['a2_18', 'a2_19', 'a2_records']) mark(k);
      DA.clock.min = tm(27, 4, 8);
    },
    act3() {
      setAct(3);
      mark('a3_start');
      DA.setFlag('cctv_on', true);
      DA.setFlag('mirror_stage', 1);
      DA.state.cctv = Object.assign(DA.state.cctv || {}, { figureStage: 1, figureSeen: 0 });
      DA.clock.min = tm(27, 4, 12);
    },
    cctv() {
      mark('a3_cctv');
      DA.setFlag('figure_done', true);
      DA.setFlag('cctv_offsets', true);
      DA.state.cctv = Object.assign(DA.state.cctv || {}, { figureStage: 0, figureSeen: 0 });
      DA.clock.min = tm(27, 4, 22);
    },
    phone() { mark('a3_phone'); DA.setFlag('phone_done', true); DA.clock.min = tm(27, 4, 32); },
    selves() {
      const at = { tx_calm_vent: tm(27, 4, 36), tx_panic_dont: tm(27, 4, 37), tx_calm_time: tm(27, 4, 48), tx_injured: tm(27, 4, 58), tx_calm_generator: tm(27, 5, 8) };
      S().t.atMin = tm(27, 4, 59);
      for (const id in at) fakeEntry(id, { min: at[id], vars: id === 'tx_calm_time' ? { AT_TIME: DA.clock.hhmm(S().t.atMin) } : undefined });
      DA.giveItem('key_antenna');
      DA.giveItem('flashlight'); // Calm: "Take the flashlight from the workshop bench first."
      if (DA.state.world) { DA.state.world.disabled = DA.state.world.disabled || {}; DA.state.world.disabled.workbench = true; }
      if (DA.state.world) { DA.state.world.opened = DA.state.world.opened || {}; DA.state.world.opened.vent_basement = true; }
      if (!Array.isArray(DA.state.notes)) DA.state.notes = [];
      if (!DA.state.notes.includes('note_10')) DA.state.notes.push('note_10');
      DA.setFlag('key_found', true);
      DA.setFlag('followed_future', true);
      for (const k of ['a3_calm_vent', 'a3_panic', 'a3_time', 'at_time_over', 'a3_injured', 'a3_stutter', 'a3_calm_gen', 'th:thoughts_key']) mark(k);
      world('setGeneratorSound', 'stutter');
      addObj('obj_vent', true);
      dropObj('obj_monitor');
      addObj('obj_generator', false);
      DA.clock.min = tm(27, 5, 10);
    },
    generator() {
      mark('a3_trick');
      mark('cp_generator');
      dropObj('obj_generator');
      dropObj('obj_monitor');
      DA.setFlag('generator_off', true);
      world('setPower', 'generator', false);
      world('setPower', 'main', false);
      world('setGeneratorSound', null);
      DA.clock.min = tm(27, 5, 20);
    },
    hide() {
      mark('a3_hide');
      DA.setFlag('interlock_released', true);
      addObj('obj_hide', true);
      addObj('obj_monitor', false);
      DA.clock.min = tm(27, 5, 28);
    },
    drift() {
      for (const k of ['d_log1', 'd_upstairs', 'd_hall_long', 'd_office', 'd_office_seen', 'd_past', 'd_log2', 'd_newhall', 'd_newhall_seen', 'tx41', 'a3_drift', 'th:thoughts_hall_long']) mark(k);
      hauntLog(2);
      DA.setFlag('mirror_stage', 2);
      world('applyMutation', 'hall_long');
      injectTx41();
      fakeEntry('tx_new_hallway', { min: tm(27, 6, 0) });
      DA.clock.min = tm(27, 6, 5);
    },
    nasty() { mark('a3_nasty'); DA.setFlag('nasty_done', 'stay'); DA.clock.min = tm(27, 6, 22); },
    old1() {
      fakeEntry('tx_old_you_1', { min: tm(27, 6, 30) });
      mark('a3_old1');
      dropObj('obj_monitor');
      addObj('obj_control', false);
      DA.clock.min = tm(27, 6, 32);
    },
    act4() {
      setAct(4);
      for (const k of ['a4_start', 'a4_report']) mark(k);
      DA.setFlag('report_read', true);
      DA.setFlag('mirror_stage', 3);
      world('lockDoor', 'control_door', false);
      addObj('obj_control', true);
      addObj('obj_array', true);
      addObj('obj_report', true);
      DA.clock.min = tm(27, 6, 45);
    },
    twist() {
      for (const k of ['a4_death', 'a4_twist', 'th:thoughts_sunrise']) mark(k);
      DA.setFlag('archives_are_timelines', true);
      fakeEntry('tx_old_you_twist', { min: tm(27, 6, 56) });
      DA.clock.min = tm(27, 6, 58);
    },
    act5() {
      setAct(5);
      for (const k of ['a5_start', 'a5_you_now', 'a5_panic', 'a5_old', 'a5_calm']) mark(k);
      DA.setFlag('collapse', true);
      DA.setFlag('you_realtime', true);
      world('setBlend', 0.15);
      const at = { tx_you_now: tm(27, 7, 2), tx_panic_destroy: tm(27, 7, 4), tx_old_maintain: tm(27, 7, 6), tx_calm_open: tm(27, 7, 8) };
      for (const id in at) fakeEntry(id, { min: at[id] });
      DA.clock.min = tm(27, 7, 10);
    },
    paths() {
      mark('a5_paths');
      dropObj('obj_monitor');
      addObj('obj_destroy', false, true);
      addObj('obj_maintain', false, true);
      addObj('obj_open', false, true);
    },
  };
  const PLACE = {
    tour: { map: 'station', x: 32.4, y: 26.9, deg: 270 },
    tasks: 'pt_tour_radio', woman: 'pt_desk_stand', pure: 'pt_desk_stand', secret: 'pt_desk_stand', act2: 'pt_desk_stand',
    future17: 'pt_desk_stand', girl19: 'pt_desk_stand', act3: 'pt_desk_stand', cctv: 'pt_desk_stand', phone: 'pt_desk_stand',
    selves: 'pt_desk_stand', generator: 'pt_gen', hide: 'pt_gen', drift: 'pt_desk_stand', nasty: 'pt_desk_stand',
    old1: 'pt_desk_stand', act4: 'pt_array_arrive', twist: 'pt_desk_stand', act5: 'pt_desk_stand',
    destroy: 'pt_control', maintain: 'pt_desk_stand', open: 'pt_relay_return',
  };
  function placeAt(p) {
    if (typeof p === 'string') {
      const q = pt(p) || (DA.maps && DA.maps.findPoint && DA.maps.findPoint(p));
      if (q) world('load', q.map, p, { fade: false });
    } else if (p) world('load', p.map || 'station', { x: p.x, y: p.y, angle: p.deg }, { fade: false });
  }

  D.beats = BEATS.map((b) => Object.assign({}, b));
  /** Rebuild the night as if every beat before `beatId` happened, then start that beat. */
  D.jump = (beatId) => {
    const chain = chainFor(beatId);
    if (!chain) { console.warn('[director] unknown beat', beatId); return false; }
    const name = (DA.state && DA.state.started && DA.state.playerName) || (DA.state && DA.state.playerName) || 'OPERATOR';
    if (!DA.running) DA.newGame(name);
    DA.resetRuntime();
    DA.modes.clear();
    DA.state = DA.newState();
    DA.state.playerName = name;
    DA.state.started = true;
    DA.running = true;
    DA.setPaused(false);
    DA.bus.emit('game:new', { jump: beatId });
    for (const b of chain) {
      try { if (SETUP[b]) SETUP[b](); } catch (e) { report('jump:' + b, e); }
    }
    try { if (PLACE[beatId]) placeAt(PLACE[beatId]); } catch (e) { report('jump:place', e); }
    S().beat = beatId;
    DA.resetRuntime();
    DA.modes.clear();
    DA.bus.emit('game:load', { jump: beatId });
    DA.bus.emit('game:ready', { fresh: false, jump: beatId });
    return true;
  };
  D.status = () => ({
    act: DA.state.act | 0,
    beat: S().beat,
    objectives: objList().filter((o) => !o.done).map((o) => o.id),
    pure: DA.isPure(),
    interference: DA.v('interference'),
    clock: DA.clock.stamp(),
    sunrise: DA.flag('sunrise_unknown') ? '--:--' : DA.clock.hhmm(DA.state.sunrise),
    ending: DA.flag('ending') || null,
    busy: rt.busy,
    airing: Array.from(rt.airing.keys()),
  });
  D.done = (id) => done(id);
  D.power = () => power();
  D.endingLocked = () => endingLocked();
  D.steps = () => Object.assign({}, S().done);
  Object.defineProperty(D, 'act', { get: () => DA.state.act | 0, enumerable: true });
  D.beat = null;

  /* ================================================================ lifecycle */
  function resume(ev) {
    resetRt();
    S();
    D.beat = S().beat;
    if (D.beat) DA.bus.emit('beat', { id: D.beat, resumed: true });
    installListeners();
    if (DA.flag('no_archive')) DA.setFlag('no_archive', false);
    ent('despawn');
    if (DA.state.entity && DA.state.entity.window && DA.state.entity.window.on) P_(ent('window', false));
    if (DA.flag('ending')) return;
    if (!ev.fresh) ensureExplore();
    if (ev.jump) checkpoint('JUMP — ' + String(ev.jump).toUpperCase());
    if (DA.flag('mug_on_desk') && !DA.flag('mug_moved')) { world('pointProp', 'mug', 'pt_mug_radio'); world('showProp', 'mug', true); }
    // a quiet beat re-applies DA.radio.quiet when it runs again; nothing else keeps it
    radio('quiet', false);
    // back at the GENERATOR checkpoint (it may have been taken mid-trickery): the duty reads plainly
    if (S().beat === 'generator' && !DA.flag('generator_off') && (objExists('obj_generator_dont') || objExists('obj_generator_already'))) {
      objRemove('obj_generator_dont');
      objRemove('obj_generator_already');
      obj('obj_generator');
      if (!DA.hasItem('flashlight')) obj('obj_flashlight');
    }
    receiverWatchers();
    const act = DA.state.act | 0;
    const ctl = act <= 1 ? runAct1 : act === 2 ? runAct2 : act === 3 ? runAct3 : act === 4 ? runAct4 : runAct5;
    run('act' + act, ctl);
  }
  DA.bus.on('boot', () => {
    DA.addSystem('director', { order: 50, update });
    registerInteract();
  });
  DA.bus.on('booted', registerInteract);
  DA.bus.on('game:ready', (e) => { try { resume(e || {}); } catch (err) { report('resume', err); } });
  DA.bus.on('runtime:reset', () => resetRt());
  DA.bus.on('game:quit', () => { resetRt(); D.beat = null; });
  DA.bus.on('entity:caught', () => caught());
})();
