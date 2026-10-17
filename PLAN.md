# DEAD AIR — Game Plan & Technical Contract

Browser implementation of the design in `README.md`. First-person psychological horror in an
isolated emergency radio relay station, the night of **26→27 OCT 1999**.

> **You can hear the future, but listening to it changes what happens.**

This document is both the **design plan** and the **binding contract** between modules. Every
module is written against the APIs, IDs and event names below. If you need something that is
not here, add it to your own module in a backwards-compatible way and document it at the top of
your file — never rename or remove anything listed here.

---

## 1. Pillars

1. **The radio is the game.** A physical desk of analogue equipment (dial, meter, spectrum,
   offset display, antenna, cassette, notebook, mic). Tuning is a skill the player learns.
2. **Tell, don't show.** Transmissions describe horrors before (or instead of) showing them.
   The creature is almost never seen clearly.
3. **Every look makes it more real.** A single variable — *interference* — drives escalation.
   Saving people helps the entity. Zero interaction leads to the secret ending.
4. **Know the building.** One small station, learned intimately, then made subtly wrong
   (moved mug, fourth person in the photo, delayed reflection, a hallway that wasn't there).
5. **Sound first.** Rain, hum, generator, static. Players learn the normal soundscape so
   deviations register instantly.
6. **No reliable narrator.** Future selves contradict each other and can all be right.

## 2. Technology

* **No three.js, no WebGL, no build step, no external assets.** Plain JavaScript (classic
  `<script>` tags, so `index.html` also runs from `file://`), Canvas 2D, DOM overlays, Web Audio.
* **Renderer:** a Wolfenstein-style DDA **raycaster** at 480×270 internal resolution, scaled up
  with pixelated filtering: textured walls with per-face overrides, sliding thin doors, textured
  floor/ceiling casting, per-cell lighting with circuits + flicker, flashlight cone, dithered-alpha
  billboard sprites with a z-buffer, sky + rain outdoors, animated rain windows, distance
  darkness, film grain/vignette/glitch post effects, an "abandoned" texture variant and a per-column
  "blend" collapse effect. `renderView()` renders any camera into any canvas (CCTV, montage).
* **Textures & sprites:** generated procedurally at boot into `Uint32Array` pixel buffers.
* **Audio:** 100% synthesized with Web Audio (noise buffers, oscillators, filters, envelopes,
  convolution-free cheap reverb via feedback delays). Radio voices are *formant "babble"*
  following the syllable rhythm of the subtitle, band-limited and mixed with static; optional
  Web Speech API voices (settings toggle, default off). Subtitles always carry the words.
* **Persistence:** `localStorage` — archives (saves), settings, and cross-run *meta* (deaths
  are canon; endings remembered).
* **Namespace:** everything hangs off `window.DA`. `js/core.js` is the foundation (read it).

### 2.1 Files & ownership

| File | Owner | Contents |
|---|---|---|
| `index.html`, `css/base.css`, `js/core.js`, `js/main.js` | architect | shell, foundation, boot |
| `js/textures.js`, `js/raycaster.js` | renderer | `DA.textures`, `DA.render` |
| `js/audio.js` | audio | `DA.audio` |
| `js/maps.js`, `js/world.js` | world | `DA.maps`, `DA.world`, `DA.interact`, mode `explore` |
| `js/radio.js`, `css/radio.css` | radio | `DA.radio`, mode `radio`, kind `radio` |
| `js/ui.js`, `css/ui.css` | ui | `DA.ui`, modes `title name pause journal doc choice` |
| `js/devices.js`, `js/scenes.js`, `css/devices.css`, `css/scenes.css` | devices | `DA.devices`, `DA.scenes`, device modes, scene modes |
| `js/content.js` | writer | `DA.content` — every line of text in the game |
| `js/entity.js`, `js/director.js`, `js/debug.js` | director | `DA.entity`, `DA.director`, `DA.debug` |
| `js/minimap.js`, `css/minimap.css` | minimap | `DA.minimap`, mode `plan` — corner minimap + full plan drawn from the ORIGINAL 1978 map defs (mutations and the relay chamber never appear; the player's pencil sketch covers undrawn areas) |

Script load order (see `index.html`): core → content → textures → raycaster → audio → maps →
world → radio → ui → devices → scenes → entity → director → debug → main.
**Never call another module at script-load time** — only inside `boot`/`game:*` handlers,
mode callbacks, systems, or user actions. Always null-guard optional cross-module calls
(`DA.audio && DA.audio.play(...)`) so a module can be tested alone.

### 2.2 Core recap (`js/core.js` — authoritative, read it)

* `DA.util` — `clamp lerp smoothstep rand randInt choice mulberry32 hash dist wrapAngle
  angleDiffDeg pad fmtOffset lineDur garble clone esc el`.
* `DA.bus.on(name, fn, {session})` / `once` / `off` / `emit`. `session:true` listeners die on
  `DA.resetRuntime()` (death/load/new game).
* `DA.state` — **all persistent game state, plain JSON**. Modules own sub-objects:
  `state.world`, `state.radio`, `state.entity`, `state.cctv`, `state.director`, `state.ui`.
  A module must be able to rebuild its runtime entirely from `DA.state` on `game:ready`.
* Flags/vars: `DA.flag(k)`, `DA.setFlag(k, v)`, `DA.v(k)`, `DA.addVar(k, n)`; items:
  `DA.hasItem/giveItem/takeItem`; `DA.applyFx(fx)`; **`DA.interfere(reason)`** (the only way
  interference increases); `DA.isPure()`; `DA.variant(key)` (stable 0..1 per archive load);
  `DA.fmt(text)` templating `{NAME} {NAME_UP} {TIME} {DATE} {STAMP}`.
* `DA.clock` — game time in minutes since 00:00 26 OCT 1999. `min`, `rate` (game-min per real
  second), `frozen`, `hold(id,min)`, `release(id)`, `at(min, fn, id)`, `toMin(day,h,m)`,
  `hhmm() hhmmss() date() stamp() parts()`.
* `DA.timers.after/every/cancel/cancelTag`, `DA.wait(s)`, `DA.waitFor(pred, timeout)`,
  `DA.waitEvent(name, filter, timeout)`, **`DA.script(async s => {...}, name)`** — story scripts
  whose awaits (`s.wait s.until s.event s.do`) abort silently after a reset.
* `DA.input` — `down(code) pressed(code) consumeMouse() requestLock() exitLock() locked`.
* `DA.modes` — `register(name, def) push pop replace clear top is has`. Def fields:
  `enter exit update(dt,isTop) render(isTop) onKey(e,down)→bool onMouseDown onMouseUp
  onMouseMove onWheel lock opaque blocksWorld cover(bool)`.
* `DA.addSystem(name, {update(dt), order})` — updated every simulated frame while running.
  Suggested orders: world 10, entity 20, radio 30, devices 40, director 50, audio 60, ui 70.
* `DA.archive.save(slot,label) auto(label) list() load(slot) loadLatest() latest()`;
  `DA.newGame(name)`, `DA.startFromState(state)`, `DA.quitToTitle()`;
  `DA.settings`/`DA.saveSettings()`; `DA.meta` (deaths, endings)/`DA.recordDeath(info)`/
  `DA.recordEnding(id)`.
* `document.body.dataset.mode` = top mode name, `dataset.opaque` = '1' when an opaque mode is
  in the stack (for CSS). Layers: `#screens` z20 (modal screens), `#hud` z30 (HUD/subtitles),
  UI fade overlay z40.
* Lifecycle events: `boot` (build DOM, textures, register modes) → `booted`; `game:new` /
  `game:load` (rebuild runtime from state) → `game:ready` (director starts scripts);
  `game:quit`; `runtime:reset`; `pause`/`resume`; `resize`.
* Main loop: when running & not blocked → timers, waiters, clock, systems, `tick`; then each
  mode's `update`; then `DA.render.frame(dt)` if no opaque mode; then mode `render`s; `frame`.
  `DA.step(dt)` is exposed for deterministic tests.

---

## 3. Player experience

**Controls.** Mouse look (pointer lock; drag-to-look fallback), `WASD`/arrows move, `Shift`
run (noisy), `C` crouch (quiet, slow), `E` or left-click interact, `F` flashlight (once found),
`T` wristwatch (time + date), `Tab` journal (objectives / log / notes / tapes / items), `Esc`
pause. At the radio desk: mouse on the equipment, wheel/arrow keys to tune, `A`/`D` antenna,
hold `Space` for mic, `L` log, `Esc` stand up.

**HUD** is minimal: crosshair dot, interaction prompt, 1–4 objectives top-left (can glitch),
subtitles bottom-center, optional wristwatch bottom-left.

**Length:** ~45–60 minutes for the main path; ~15 minutes of quiet for the secret ending.

---

## 4. Story & beats (the director implements this; the writer writes every line)

Time: arrival 23:40 on **26 OCT 1999**. Midnight turns the desk calendar to **27 OCT**. The
woman calls at **02:13 on 27 OCT** and her transmission is stamped **28 OCT 1999 – 02:13**.
Normal sunrise **06:42**.

### ACT 0 — PROLOGUE
* **P1 Title** → *Begin Shift* → **name entry** ("sign the shift register" — the player's real
  name; it is used by the girl on transmission 19 and on the tape labelled with their name).
* **P2 Drive** (`DA.scenes.drive({kind:'arrive'})`): rain, wipers, car radio weather bulletin,
  captions `26 OCT 1999 — 23:31 — COUNTY ROUTE 9`, sign `RELAY STATION 14`. ~40 s.
* **P3 Arrival** at `pt_arrive` in the lot. Hollis (previous operator, NPC `hollis`) waits under
  the entrance light. Objective *Go inside*. Autosave checkpoint "ARRIVAL".

### ACT 1 — RELIEF (23:40 → 02:13) — the job, i.e. the tutorial
* **A1 Tour.** Hollis walks stop to stop (`DA.world.walkNpc`), the player follows; at each stop
  he says 1–2 lines (`content.dialogue.hollis_*`): lobby → basement stairs ("generator's
  downstairs") → equipment rack → kitchen → bathroom → maintenance workshop (breakers, roof
  ladder, weather instruments) → radio room (emergency transmitter; backup antenna control).
  He passes the records room ("Records. Locked. Don't have the key, don't want it."). He never
  mentions the steel door behind the racks. At the desk: **"Frequency 148.32 is reserved. If you
  hear anything on it, just log it. Don't respond."** Choice *Why?* / *Okay.* → "Old military
  frequency or something." He leaves: walks out, car door, engine, headlights sweep the radio
  room window. Objectives appear. Clock rate 0.2; hold at 02:12 until tasks are done; when all
  tasks are done the rate rises to 1.2 so 02:13 comes soon.
* **A2 Tasks** (any order; each an objective):
  1. `obj_coffee` *Make coffee* — kitchen machine → item `mug` → placed by the radio when you
     next sit at the desk (flag `mug_on_desk`, prop `mug` at `pt_mug_radio`).
  2. `obj_radio_check` *Perform a radio check* — tune County Dispatch **155.34**, transmit
     outgoing `out_radio_check` ("County, Station Fourteen, radio check.") → `tx_radio_check_reply`.
     This line is recorded on the cassette and returns in the *Open the channel* ending.
  3. `obj_weather` *Check the weather instruments* — roof via workshop ladder, mast readout.
  4. `obj_trucker` *Answer the trucker on CB 19* — `tx_trucker_flat` on **027.18** (bearing E).
     He needs help → outgoing `out_dispatch_flat` on 155.34 → `tx_dispatch_flat_ack`. Present-time
     traffic: responding is the job, **not** interference. LOG it.
  5. `obj_breaker` *Reset the tripped breaker* — around 00:20 the corridor lights die
     (`breaker_trip`); workshop panel breaker **C** restores circuit `corridor`.
  6. `obj_police` *Monitor the sheriff's channel* — **155.47**, `tx_police_chatter`; LOG it.
  7. `obj_calendar` *Turn the desk calendar* (appears after 00:00) → `27 OCT 1999`.
  8. `obj_paperwork` *Fill out the shift report* (appears after 1–6) — office desk form.
* **A3 02:13.** Receiver alarm; scanner stops at 148.28 on a faint carrier. Faint "anybody
  there" from the radio room speaker. Objective *Isolate the signal*. `tx_woman` (148.32,
  bearing 300°/NW): hit a deer, rolled into a ditch, trapped. Choice:
  * **[Respond]** (interference) → she gives *Kestrel Road, past the quarry turnoff, green mile
    marker 14*. Objective *Find Kestrel Road on the wall map* (`DA.devices.map.open`) → objective
    *Radio County Dispatch* → outgoing `out_report_kestrel` → `tx_dispatch_kestrel_ack`. The
    woman fades ("Is it still raining where you are?"). ~2–3 real minutes later
    `tx_dispatch_nothing`: **"There's nothing there."** Objective *Check the transmission log*
    (journal LOG tab) → her entry: stamp **28 OCT 1999 – 02:13** → objective *Check the date* →
    desk calendar **27 OCT 1999**. Stinger. The OFFSET display flickers on reading `+24:00:00`.
    → ACT 2.
  * **[Log it. Don't respond.]** → she pleads on a loop, fades. Nothing happens. Pure path.
* **Pure path (secret ending).** While `DA.isPure()`, the night stays ordinary: clock rate
  0.35; hourly weather checks (03:00 04:00 05:00 06:00), a second breaker trip, routine CB and
  sheriff traffic to log, a coffee refill. A few *temptations* arrive on 148.32 and must only be
  logged: `tx_child_fire` (~03:10), a faint cut-off `tx_future_you_faint` (~04:05),
  `tx_girl_19` (~05:20). Any response/interference → ACT 2 immediately (with a generic reveal:
  dispatch finds nothing / the log stamp is in the future). If the player reaches **06:42** still
  pure → **SECRET ENDING**.

### ACT 2 — THE LONG NIGHT (first interference → transmission 19)
* Title card **THE LONG NIGHT**. Autosave. `DA.state.sunrise` is pushed back +35 min on every
  new interference; after transmission 19 `sunrise_unknown` → readouts show `--:--`. The clock
  runs (rate 0.1) — 05:00, 06:00, 07:00 — still pitch black.
* Flag `offset_unit` → the radio shows `OFFSET` for every source. The receiver starts sweeping
  by itself between story transmissions.
* Future transmissions (varied offsets; the director queues them, the player tunes/logs):
  `tx_truck_breakdown` (+00:41:00), `tx_ambulance` (+2 days), `tx_pursuit` (+00:12:00),
  `tx_child_fire` (+1 day; warnable via `out_warn_fire` → later `tx_fire_confirm`),
  `tx_three_years` (+3 years, dated OCT 2002), and the reward:
  **`tx_bridge`** (+00:20:00, Harlan Creek bridge, a jackknifed truck into a minivan). Warn on
  CB 19 (`out_warn_bridge`) and/or dispatch (`out_warn_bridge_dispatch`) → ~20 game minutes later
  **`tx_bridge_thanks`**: "Whoever put out that warning... thank you." `saved`+1, the log entry
  becomes `RESOLVED`. (Every warning = interference = instability.)
* **Room feed 014.00** discovered: the receiver drifts to 014.00 (`roomfeed rf_chair`,
  offset +7 s: *[chair scraping]* → 7 s later the radio-room chair scrapes and turns);
  `rf_glass` (*[glass breaking]* → a jar falls from the radio-room shelf). Notebook gains
  `014.00 — ???`.
* **000.00** — silence, then breathing that matches the player's (breathing rate follows the
  player's movement). Notebook `000.00`.
* Outside becomes unstable (flag `outside_unstable`): driving away loops back (`drive` kind
  `loop`, then contradictory signs), and the woods path emerges in the **supply cupboard**
  (seamless teleport, trigger `woods_deep` → `pt_storage_arrive`).
* Manifestations: the mug is found in the kitchen (`pt_mug_kitchen`); a door the player closed
  is open; staff photo shows **four** people (`photo_four`).
* **Transmission 17** `tx_future_you_17`: a familiar voice — "Station Fourteen, listen
  carefully. Do not answer transmission {N19}. And whatever happens, don't unlock the records
  room." The director adds filler transmissions so this one is usually #17 (template `{N19}` =
  its number + 2). Then the cassette deck clicks and plays **your own recorded voice** (the
  first thing you said on air) — same voice. Log sender of #17 becomes `STATION 14 (OPERATOR)`.
* **#18** `tx_18` (weather bulletin that trails off). **#19** `tx_girl_19`: the receiver scans to
  148.32 by itself. "Hello?" / "My dad told me somebody would be listening." / "{NAME}?" / "He said
  you're supposed to open the records room." Choices: *Open it* / *Ignore her* / *Question her*
  / *Turn off the receiver* / *Respond*. No immediate consequence. (Turning off the receiver:
  lights flicker, generator stutters, birds strike the windows, the receiver turns itself back
  on after ~12 s.)
* **Records room** (optional, `records_door`, key from the office key cabinet — code **1978**,
  the year on the lobby plaque). Opening it sets `records_opened` (breaks pure). Tapes:
  `tape_1954 tape_1932 tape_1901 tape_1887 tape_first_contact tape_do_not_duplicate tape_name`
  (labelled with the player's name, recorded 1961), plus personnel file doc.

### ACT 3 — INTERFERENCE (other voices)
* Autosave. **CCTV** comes alive (`cctv_on`). The figure sequence: hallway cam shows someone
  outside the radio room; each time the player looks away and back it is closer — doorway,
  mid-room, **directly behind your chair** on the radio-room cam. Turning around: nothing.
  Afterwards the offsets are revealed (`cctv_offsets`): CAM1 FRONT ENTRANCE `+00:00:08`, CAM2
  HALLWAY `-00:02:00`, CAM3 GENERATOR `+19Y`, CAM4 RADIO ROOM — the station after abandonment
  (code **0213** sprayed beside the steel door — the relay chamber keypad code).
* **Phone.** It rings. Breathing. Everything you say repeats one second later. Then, before
  you speak: **"Don't turn around."** A presence behind you; turning shows a flicker of the entity.
* **Future selves** (speaker ids): `you_calm`, `you_panic`, `you_injured`, `you_old`, `you_now`.
  * `tx_calm_vent` (+02:11:00): "Open the basement ventilation duct." Immediately
    `tx_panic_dont` (+00:40:00): "Don't listen to him. He isn't you anymore." Vent contains
    `key_antenna` + a note. (Calm was right.) Following a future self sets `followed_future`.
  * `tx_injured` (+00:15:00, coughing): "It's inside the station... don't let the lights go out."
  * `tx_calm_generator`: "Turn off the backup generator. The interlock on antenna control won't
    release while it's running." Objective trickery: *Investigate backup generator.* →
    **DO NOT INVESTIGATE BACKUP GENERATOR.** → **You already investigated it.** → **LISTEN.**
    + three knocks.
  * Generator off → all station lights die (emergency red only; flashlight from the workshop)
    → knock knock knock → **something enters**. Room feed `rf_hide` (+00:00:12: footsteps... the
    door handle turning). Twelve seconds to hide (under the desk, supply cupboard, bathroom stall)
    or lock the radio room door. The entity (first physical presence) searches and leaves; being
    found = death. Interlock releases.
* Other operators: vent notes across the station (`note_*`), "DON'T TRUST THE VERSION OF YOU WHO
  KNOWS TOO MUCH" repeated; operator tapes `tape_op_loop`, `tape_op_survive`.
* **Log changes**: the woman's entry → `NO TRANSMISSION`, later `YOU SHOULD NOT REMEMBER THIS`;
  while the player reads the log, **#41 — STATION 14 — NULL — I CAN HEAR YOU READING THIS.**
* Bathroom mirror reflection lags (`mirror_stage` 1→3). Footsteps upstairs (one-floor station).
  Generator rhythm changes (`rrrr—rr—rrrr`).
* Layout drift: `hall_long` (the corridor is longer), `office_door_elsewhere` (the office door
  opens into the supply room), then `new_hallway`. Inside it: `tx_new_hallway` "Do not go into
  the new hallway." — the player is already standing in it.
* **The nasty sequence** (player at the desk): `rf_leaving` offset **+00:03:14** — your voice:
  "Okay. I'm leaving the station." footsteps, door, silence, "Oh God.", running, impact on the
  front door, screaming. OFFSET counts down. If the player stays: at zero nothing happens → then
  `rf_why` (+00:00:20): "Why didn't you leave?" (10 s) "It knows you heard the first one." (5 s)
  "Don't look at the window." → **knocking on the radio room window** (the face, if they look).
  If they do leave: the recording comes true — chase back inside; reach the radio room and shut
  the door to survive.
* `tx_old_you_1` (+41Y, an old voice): knows about the photo ("the fourth one is you"), sends
  the player below: "Go down. See what's under us."

### ACT 4 — THE ARRAY (midpoint revelation)
* Antenna control (basement, `control_door`: needs `key_antenna` **and** generator off).
  Consoles, a hatch → the **array**: impossibly large, cable walls into darkness, catwalks over
  a void, and at the centre an antenna pointing **down**. The entity is physical here:
  several positions at once, limbs inconsistent, flickering closer when unobserved.
* `doc_report` — the final research report (Project LONGWAVE): signals arriving before they
  were sent; possible futures; "KEEP THE CHANNEL OPEN"; termination; turning it off caused
  disappearances and animal deaths; the antenna only amplified something beneath the site that
  was **broadcasting long before humanity invented radio**.
* `tx_old_you_twist`: every operator is chosen; each was heard on recordings made before they
  were born; the organization listens to the tapes and makes sure those people arrive. Archives
  are timelines (`archives_are_timelines`: the terminal now says TIMELINE STORE).
* **Death is canon** from here on (it was already possible in ACT 3).

### ACT 5 — COLLAPSE (final act)
* Autosave. Rooms overlap (renderer `blend` rising), the spectrum floods (`DA.radio.jam`),
  your voice on every frequency — including fragments of the player's own previous deaths
  (`DA.meta.deaths`). `you_now` speaks with **no offset**: every line the player transmits is
  heard from the speaker at the same moment (`you_realtime`).
* Three voices argue: `tx_panic_destroy`, `tx_old_maintain`, `tx_calm_open`. Glitched
  objectives list the three paths:
  * **DESTROY THE ANTENNA** — antenna control console: restore the generator, pull limiters
    `limiter_1..3` in the array (entity stalks), engage overload. Alarm; 90 s to reach the car.
    Drive (kind `escape`). **Months later**, daylight drive, the car radio: **"You only destroyed
    yours."** Cut to black.
  * **KEEP THE CHANNEL OPEN** (maintain the loop) — radio desk, transmit
    `out_keep_channel_open`. Survive to sunrise by keeping the drifting carrier locked while room
    feed cues warn of the door; lose the lock too long and it comes closer (3 strikes = death).
    Dawn. The replacement operator arrives; the player gives the tour (same lines as Hollis) and
    at the desk can only say: "Frequency 148.32 is reserved. If you hear anything on it, just log
    it. Don't respond." … "Old military frequency or something." — *That's exactly what the
    previous operator told you. Maybe he wasn't being dismissive. Maybe he was desperately trying
    to stop you.*
  * **OPEN THE CHANNEL** — relay chamber (code 0213) → console → AMPLIFY → montage of dozens of
    radio rooms (`DA.scenes.multiverse`) → silence → wake in daylight in the abandoned station
    (mutation `abandoned`). Rusted car. Newspaper: **27 OCTOBER 2049**. The radio crackles —
    your own voice from the start of the night: "Station Fourteen, radio check." Sit down. The
    only option: respond.
* **SECRET** — pure at 06:42: dawn light, the replacement arrives, hand over the shift, leave
  (drive kind `dawn`), credits, then a recording: "Subject demonstrated zero interaction." /
  "So that's it?" / "Yes." / … / "Without observation, there was no event."

### Death
`entity:caught` → `DA.recordDeath({room, map, lines})` (last 3 subtitles) → `DA.scenes.death`:
radio static; "Station Fourteen? Is anybody there?" (in the player's voice) → a new operator
answers "This is Station Fourteen. Go ahead." → **LOAD ARCHIVE** (latest archive). Deaths
persist in `DA.meta.deaths` and are replayed as transmissions later (ACT 5 flood; also a
one-off `tx_your_death` in ACT 4 if any death exists).

### Saving
Tape backup terminal in the equipment room: *ARCHIVING CURRENT STATE*. Automatic checkpoint
archives (slot 0) at: arrival, act 2, act 3, act 4, act 5, and before each ending sequence.
Manual slots 1–5. The terminal is busy (`no_archive`) during scripted sequences. On every load a
new variant seed produces unacknowledged differences (chair offset, rain intensity, photo pose,
an alternate wording of one line).

---

## 5. Station layout (world owner designs exact grids; topology below is binding)

Cell = 1 unit (~2 m). Player radius 0.22, eye height 0.5 of wall. Angles in *radians* inside
the world, *degrees* in map definitions/points. Angle 0 = +x (east), +π/2 = +y (south).

### `station` — ground floor **and** exterior (one map so the front door is seamless)
Approx. 60×46. Building footprint roughly 28×19 in the middle-north; everything else outdoors
(`ceil: null` = sky, rain).
* **Exterior:** gravel parking lot south of the building with the player's car (`car`, prop
  `player_car` `spr_car`) and Hollis's car (prop `hollis_car` `spr_car2`, removed when he
  leaves); lamp post (outdoor light); station sign; an antenna mast behind the building; road
  along the south edge; forest (tree sprites + `trees` edge walls). A narrow **woods path** leads
  NW into the trees; its far end is trigger `woods_deep`. Radio room windows are visible from
  outside (`pt_window_out` stands in front of them).
* **Front door** `front_door` (south wall) → **lobby** (`signin_sheet`, `lobby_plaque`
  "COMMISSIONED 1978") → **hall**: a long E–W corridor (lights on circuit `corridor`).
* **North of hall (W→E):** **radio room** (NW corner; two west windows; door `radio_door`
  lockable from inside; north wall = radio console `radio_desk`; CCTV bank `cctv` beside it;
  wall map `wall_map`; desk calendar `desk_calendar`; hiding spot `hide_desk`; chair prop
  `chair` at `pt_radio_chair`; shelf with a jar `jar` prop), **office** (`office_desk` paperwork,
  `key_cabinet` keypad 1978 → `key_records`, `blueprint`, `weather_panel`, `phone`, window,
  `vent_office`), **kitchen/break room** (`coffee_machine`, `fridge`, `staff_photo`, table prop,
  window, `pt_mug_kitchen`, `vent_kitchen`), **equipment room** (rows of `rack_server` walls with
  a one-cell squeeze behind the last row to the steel **`relay_door`** — keypad 0213 →
  map `relay`; `tape_terminal`).
* **South of hall:** **lobby**, **storage** (supply cupboard; shelves; `hide_cupboard`;
  `pt_storage_arrive`), **bathroom** (`mirror`, stall `hide_stall`, `vent_bath`), **workshop**
  (`workbench` with the flashlight, `breaker_panel`, `roof_ladder` → `roof`, `vent_workshop`),
  **records room** (`records_door` locked by `key_records`; `records_shelves`,
  `records_cabinet` personnel file), **stairwell** (`stairs_door`, `stairs_down` → `basement`).
* **Reserved interior blocks** (solid until a mutation): the hall's east extension
  (`hall_long` adds ~6 cells of corridor), and the **new hallway** (`new_hallway`: a doorway
  `newhall_door` appears in the hall wall; a narrow bending corridor ~12 cells, dim flickering
  light, trigger `newhall_inside` just past the door and `newhall_end` at the far end, which
  exits through `newhall_exit` into the radio room). `office_door_elsewhere` is a *portal*:
  stepping through the office doorway from the hall lands you inside storage.
* Camera points `cam_1` (outside, facing front door), `cam_2` (hall, looking at radio door),
  `cam_4` (radio room corner, sees desk + chair + door + the steel-door code is NOT here: see
  below). `cam_3` is on `basement` (generator room).
  *Note:* the code 0213 is sprayed on the radio room wall in the abandoned variant
  (`alt` override using `wall_paint+dec_graffiti_code`), visible on CAM4.

### `basement`
~30×24. Stair landing (`stairs_up` → station), pipe corridor, **generator room** (`generator`,
`fuel_tank`, `cam_3`), `vent_basement` (duct: `key_antenna` + note), `vent_b1`, boiler nook
`hide_boiler`, **antenna control** behind blast door `control_door` (consoles
`control_console`, hatch `array_hatch` → `array`).

### `array`
~64×64 of catwalks (`floor_grate`) over a void (`pit` cells: no wall, void floor, solid),
bounded by `cables`/`wall_rock`. Arrival ladder `array_ladder` → basement. Long sightlines
with fog. Centre platform: `downward_antenna` (huge prop, hangs into the pit), lectern with
`report`. Three far catwalk ends: `limiter_1..3`. Dim `array` circuit lamps.

### `relay`
~16×16 impossible room: walls of tape reels and stacked receivers, `relay_console` centre,
`relay_exit` back to the equipment room.

### `roof`
~14×12 outdoor, parapet walls, `weather_mast`, antenna tower prop, `roof_hatch` → workshop.

---

## 6. Module contracts

### 6.1 `DA.textures` (textures.js)
* `build()` on `boot` (< ~1.5 s). 64×64 walls/floors; sprites any size (≤128).
* `id(name) → int` (≥1; 0 = none). Unknown → warn once, return the `missing` texture id.
* `get(id, variant='normal') → {w, h, px: Uint32Array (ImageData little-endian ABGR),
  frames?: Uint32Array[], flags}`; `name(id)`.
* Composite names `'base+decal'` (+ more decals) are generated on demand (decal alpha>0
  overwrites base).
* Variant `'abandoned'` auto-derived for every texture (grime, water stains, peeling, cracks,
  darker; sprites dustier), bespoke where noted.
* `flags`: `window` (renderer animates rain/lightning/figure), `emissive` (self-lit parts),
  `alpha`, `anim` (frames).
* Names: see §7.5.

### 6.2 `DA.render` (raycaster.js)
* `W=480, H=270`; `init()` on `boot` (grabs `#view`).
* `frame(dt)` — renders `DA.world.camera()` in `DA.world.map` + sprites from providers, then
  post effects, to `#view`.
* `renderView(canvas, cam, opts)` — any camera into any canvas at its size. `cam = {x, y,
  angle (rad), pitch (-0.4..0.4), fov (deg)}`; `opts = {mapId, variant:'normal'|'abandoned'|
  'blend', blend, daylight (0..1), monochrome, noise (0..1), lightScale, flashlight, sprites
  (extra), providers (default true)}`.
* `addSpriteProvider(fn(mapId, opts) → Sprite[])`.
  Sprite: `{x, y, tex (name|id), scale=1 (height in wall units), z=0 (lift), alpha=1,
  frame=0, flip=false, fullbright=false, variant?, ghosts?: [{x, y, alpha, frame}]}`.
  Alpha is ordered-dithered.
* Effects: `shake(amount, secs)`, `flash(color, secs)`, `lightning(strength)`, `glitch(amount,
  secs)`, `setFade(opacity, color)`, `fx` params `{grain, vignette, chroma, tint}`; instability
  glitches scale automatically with `DA.v('instability')` (subtle below 4, strong at 10+).
* Reads world map fields (§6.4): walls/faces/doors/floor/ceil/light/tint, `variant`,
  `DA.state.world.blend` (per-column abandoned mix + ghost duplicate slices),
  `DA.state.world.daylight` (0..1), `map.windowFigure {x, y, amount}`.
* Doors: thin slab at the cell centre along `axis` (`'h'` = slab runs east–west, you pass
  north/south; `'v'` = slab runs north–south), `open` 0..1 slides it into the jamb; door-cell
  sides use `door_jamb`.
* `ceil` id 0 → sky (storm clouds, lightning, dawn/day tint by daylight). `floor` id 0 → void.
* Flashlight cone when `DA.world.player.flashlight`. Head bob from the camera.

### 6.3 `DA.audio` (audio.js)
* `init()` — create the AudioContext on first user gesture (title click); idempotent; all
  other calls are no-ops before init. `setVolume(v)`; follows `pause`/`resume`, `settings`.
* `play(name, opts) → handle{stop()}` — one-shots. `opts: {vol=1, x, y (world pos → pan +
  distance attenuation vs listener), pan, rate, delay, radio (band-limit like a speaker),
  surface (for footsteps)}`.
* `loop(name, opts) → handle{stop(fade), setVol(v), setPos(x,y)}`.
* `listener(x, y, angle, mapId)` — world calls every frame.
* `ambience(params)` — merges: `{rain 0..1, indoor bool, hum 0..1, generator 'off'|'on'|
  'stutter', genDist 0..1, wind 0..1, thunder 0..1 (rate), drone 0..1, birds bool, daylight bool,
  heartbeat 0..1, room: 'small'|'hall'|'basement'|'array'|'outside'|'bathroom' (reverb)}`.
* `radioStatic(level 0..1, opts {tone, vol})` — the desk receiver hiss (continuous; world/radio
  set level each frame, 0 = silent).
* `voice(text, speakerId, opts) → {dur, stop()}` — formant babble following the text's
  syllables using `DA.content.speakers[id].voice` params; `opts {radio: true (band-pass +
  static bed), clarity 0..1, vol, x, y, phone}`. If `DA.settings.tts` also speak via
  `speechSynthesis` (pitch/rate from the speaker). `dur` equals `DA.util.lineDur(text)`.
* `breath(rate)` — player breathing loop level (for 000.00 mirroring: `playerBreath()` returns
  current phase so the radio can match).
* `duck(amount, secs)`, `silence(secs)` (hard cut everything — the "then everything becomes
  silent" moment), `stinger(kind)` = `play('stinger_'+kind)`.
* Sound names: §7.6.

### 6.4 `DA.maps` + `DA.world` + `DA.interact` (maps.js, world.js)
**Map definitions** (`DA.maps.defs[id]`): `{id, grid: string[], legend: {ch: {wall, floor,
ceil (null = sky), room, solid, light, pit}}, faces: [{x, y, side:'n'|'e'|'s'|'w', tex}],
doors: [{id, x, y, axis, tex, locked, key, lockableInside}], props: [{id, x, y, tex, scale, z,
solid, radius, hidden}], interact: [{id, kind, x, y, side?, radius?, prompt, ...kindData}],
points: {name: {x, y, angle}}, triggers: [{id, x0, y0, x1, y1}], lights: [{id, x, y, radius,
intensity, circuit, flicker}], alt: [{x, y, side?, tex}], mutations: {name: {set: [{x, y, ch}],
faces:[...], doors:[...], portals: [{x0,y0,x1,y1, to:'point'}], interact:[...]}}, ambience,
outdoor}`. Face interactables use cell `(x, y)` + `side` (the face of that wall cell facing
`side`); floor interactables use `radius`.

**Runtime map** (compiled, read by the renderer): `{id, w, h, wall, wallN, wallE, wallS, wallW,
floor, ceil (Uint16Array; 0 = none/sky/void), solid (Uint8Array), room (Uint8Array → rooms[]),
light (Float32Array, recomputed on power change + animated flicker), door (Int16Array → doors[],
-1 none), doors: [{id, x, y, axis, tex(id), open, target, locked, key, lockableInside}],
emissive (0..1: how bright `emissive` texture pixels glow — 1 with main power, ~0.15 without), alt
(Map cellIndex → texId; face-specific key `idx*4+side` optional), tint [r,g,b], variant,
windowFigure, props}`.

**`DA.world`**
* `map`, `mapId`, `maps` (compiled), `player {x, y, angle, pitch, running, crouching,
  hidden, flashlight, noise (0..1), bob}`; state mirrored in `DA.state.world`.
* `camera() → {x, y, angle, pitch, fov, bob}`; `update(dt)` (system order 10).
* `load(mapId, pointName|{x,y,angle}, {fade})`, `teleport(x, y, angleDeg?, mapId?)` (seamless),
  `point(name) → {map, x, y, angle}`, `room() / roomAt(x, y, mapId)`.
* Doors: `door(id)`, `openDoor(id, instant)`, `closeDoor(id, instant)`, `lockDoor(id, bool)`,
  `isOpen(id)`. Default door interaction handles keys/locks/lockable-inside.
* Props: `addProp(p)`, `prop(id)`, `moveProp(id, x, y, mapId?)`, `setPropTex(id, tex)`,
  `showProp(id, bool)`, `removeProp(id)`, `pointProp(id, pointName)`.
* NPCs: `addNpc({id, map, x, y, tex, angle})`, `walkNpc(id, pointName|[names], speed=1.3) →
  Promise` (pathfinding, walk frames, footsteps), `removeNpc(id)`, `npc(id)`.
* Power: `setPower(circuit, on)`, `power(circuit)`. Circuits: `main` (all interior ceiling
  lights, hum), `corridor` (hall lights, needs main), `emergency` (red lamps, automatically on
  while main is off), `outdoor`, `array`, `generator` (backup generator running). When main is
  off the global tint goes red-dark and ambience hum stops. `breakers {A..F}` state for the
  panel (C ↔ corridor).
* `setDaylight(v)`, `setBlend(v)` (collapse), `setWeather({rain, thunder})`, lightning timer
  (calls `DA.render.lightning` + delayed `thunder`).
* Mutations: `applyMutation(name)`, `revertMutation(name)`, `hasMutation(name)` —
  `hall_long office_door_elsewhere new_hallway abandoned` (+ any the map defines).
* Queries: `lineOfSight(ax, ay, bx, by, mapId)`, `path(ax, ay, bx, by, mapId) → [{x,y}]|null`,
  `radioAudibility() → 0..1`, `history(secAgo) → {player:{x,y,angle,map}, doors}` (1 Hz ring,
  5 min), `cameras() → [{id, label, map, x, y, angle}]`, `flickerNear(x, y, secs)`.
* Hiding: kind `hide` → player hidden (camera lowered, movement locked, `E` to leave) →
  `hide:enter`/`hide:exit`.
* Explore mode `explore` (`lock:true`): movement, `E`/click interact, `F` flashlight (needs item
  `flashlight`), `T` → `DA.ui.toggleWatch()`, `Tab` → `DA.ui.journal()`, `Esc` →
  `DA.modes.push('pause')`. Shows interaction prompt via `DA.ui.prompt(text|null)`.
* Footsteps by floor texture; creaky floorboard cells in the hall (`creak`).
* Registers a sprite provider (props + NPCs on the current map).

**`DA.interact`**
* `on(key, fn)` — key = interactable **id** or **kind**; id handlers run first, then kind
  handlers; a handler returning `true` consumes. `fire(target)`; `setPrompt(id, text|null)`;
  `setEnabled(id, bool)`; every interaction emits bus `interact {id, kind, target}`.
* Kinds handled by world: `door stairs ladder hide item flashlight note doc look`.
  (`stairs`/`ladder` have `{to: mapId, point}`; `item` has `{item}`; `note` has `{note}`;
  `doc` has `{doc}`; `look` has `{text}` → thought subtitle.)
* Kinds handled by radio: `radio`. By devices: `cctv phone map paperwork mirror photo keypad
  terminal weather calendar coffee breaker generator tapes vent lever`. By director:
  `car console` and any id it wants to intercept.

### 6.5 `DA.radio` (radio.js)
State `DA.state.radio = {freq, bearing, power, volume, offsetUnit, log: [], nextNum,
notebook: [{freq, label, hand}], recordings: [{text, stamp, freq, txId}], tape, scanning}`.
LogEntry `{num, txId, freq, sender, summary, stamp, received, offset, status, logged, glitch}`.

* **Signal model.** `clarity = strength × fFreq × fBearing × power`.
  `fFreq = clamp(1 − |Δf| / width, 0, 1)^0.7` (width default 0.05 MHz; dial resolution 0.01).
  `fBearing = 1` if omni (`bearing == null`) else ≈1 within ±20°, ≈0.5 at ±60°, ≈0.15 beyond
  100°. **Lock** = clarity ≥ 0.7 held for 1 s.
* `transmit(txOrId, opts) → Promise<result>` — adds a live source; hails loop (garbled) until
  lock; on lock assigns the next number (`DA.addVar('txCount')`), writes a LogEntry
  (`radio:received`), plays the script (voice + subtitles garbled by live clarity);
  `choose` steps show mic options when the player is at the desk, otherwise wait (optional
  `waitLines`) until `timeout` (default 45 s) → `onTimeout`. Spoken options are recorded
  (`recordings`), emit `radio:mic`, and **if `tx.future` and the option is not `silent` and not
  `interfere:false` → `DA.interfere('respond:'+txId)`**. Also applies `fx`, `action`
  (`power_off`), emits `radio:choice {txId, node, optionId}`. Ends with `radio:ended`.
  Result `{txId, num, choices: {optionIds…}, responded, completed, timedOut}`.
  `opts`: `{force: true}` (auto-scan to it with the alert tone), `{noLock: true}` (plays
  regardless of tuning — strong local traffic like dispatch replies), `{num}`.
* `outgoing` — `addOutgoing({id, freq, text, once, fx, future})` / `removeOutgoing(id)`;
  shown on the mic when tuned within ±0.02; sending records, emits `radio:sent {id}` and
  `radio:mic`; `future:true` outgoing (warnings about future events) → `DA.interfere`.
* `roomFeed(idOrObj) → Promise` — 014.00 feed: heard only while tuned to 014.00 unless
  `force`; OFFSET counts down; each step's caption/sfx plays through the radio at `at`, and
  `roomfeed:event {feed, event, step}` fires at `at + offset` (the thing actually happening).
* `autoScan(freq)`, `setPower(on)`, `setOffsetUnit(on)`, `offsetOverride(text|null)`,
  `addEntry(entry)`, `editEntry(numOrTxId, patch)` (emits `radio:log-changed`), `entries()`,
  `find(txId)`, `addNote(freq, label)`, `insertTape(tapeId)`, `playSelf()`, `jam(level)`,
  `clarityOf(txId)`, `isActive(txId)`, `stop(txId)`, `atDesk()`.
* Special frequencies: `000.00` breathing (after `offset_unit`), `014.00` room feed,
  `162.55` weather loop (`tx_weather_loop`), others per §7.4.
* The desk UI shows a **CCTV** button while `cctv_on`: it pushes mode `cctv` on top of `radio`
  (closing CCTV pops back to the desk).
* Desk UI (mode `radio`, opaque, free cursor): big tuning dial, frequency LCD, analog signal
  needle, spectrum/waterfall (±0.5 MHz), OFFSET LCD (dark until `offsetUnit`), antenna bearing
  knob with compass labels, cassette deck (label, PLAY/STOP/EJECT, REC lamp), frequency notebook
  (click to tune), MIC (hold Space/click → options), LOG, LOG BOOK (→ journal log tab), power
  switch, clock/date, received-audio subtitle strip, mug if `mug_on_desk`, STAND UP.
  Controls: wheel ±0.01 (Shift ±0.10), ←/→ ±0.01, ↑/↓ ±0.10, PgUp/PgDn ±1.00, A/D antenna ±5°.
* Away from the desk the speaker is audible by `DA.world.radioAudibility()`; lines then show
  as `kind:'radio'` subtitles and static is attenuated.

### 6.6 `DA.ui` (ui.js)
* `subtitle(text, {speaker, name, kind:'speech'|'radio'|'phone'|'sfx'|'thought'|'system',
  dur, clarity}) → id`, `clearSubtitles()`, `history(n)` (last n subtitle strings, for deaths).
* `say(speakerId, text, opts) → Promise` (speech subtitle + `DA.audio.voice`; resolves after
  its duration), `think(text) → Promise`.
* `prompt(text|null)`, `crosshair(bool)`, `hint(text, dur)`, `toast(text, dur)`,
  `card(title, sub, dur) → Promise`, `fade(to, secs, color) → Promise`,
  `showWatch(secs)`, `toggleWatch()`.
* Objectives: `objective(id, text, {glitch})`, `objectiveDone(id)`, `objectiveRemove(id)`,
  `objectivesClear()` (state in `DA.state.objectives`).
* `doc(docIdOrObj) → Promise` — mode `doc`; styles `paper typed form blueprint newspaper
  plaque screen`; light markup (`# heading`, `**bold**`, `> quote`, blank-line paragraphs),
  `DA.fmt` templating.
* `choice(options [{id, text}], {prompt, timeout, timeoutId}) → Promise<id|null>` — mode
  `choice` (number keys / click).
* `journal(tab)` — mode `journal`: OBJECTIVES / LOG / NOTES / TAPES / ITEMS. LOG re-renders
  live on `radio:log-changed`; emits `journal:log-open`, `journal:log-close`.
* Modes: `title` (static, rain; BEGIN SHIFT / LOAD ARCHIVE / SETTINGS; first click →
  `DA.audio.init()`), `name` (shift register → `DA.newGame(name)`), `pause` (blocksWorld;
  RESUME / SETTINGS / QUIT; opened on `input:lost-lock`), `journal`, `doc`, `choice`.
  "CLICK TO LOOK AROUND" hint while explore is on top without pointer lock.

### 6.7 `DA.devices` + `DA.scenes` (devices.js, scenes.js)
* `cctv.open()` — mode `cctv` (opaque). 4 feeds from `DA.world.cameras()` rendered at ~1 fps
  via `renderView` (monochrome, noise, timestamp overlay = now + camera offset). Before
  `cctv_offsets`: normal labels. After: labels with offsets; CAM1 +8 s shows
  `DA.entity.predict(8)`; CAM2 −2 min shows a figure (`spr_operator`) at `DA.world.history(120)`;
  CAM3 +19Y abandoned; CAM4 abandoned (+ daylight dust) with the code. `DA.state.cctv.
  figureStage` 1–4 places `spr_figure` at `pt_fig_1..4` (1–2 on CAM2, 3–4 on CAM4; CAM4 also
  shows `spr_operator` seated at `pt_radio_chair` while you watch). Re-opening advances the stage
  (`cctv:figure {stage}`). Keys 1–4, Esc. Events `cctv:open`, `cctv:close`, `cctv:view {cam}`.
* `phone.ring()`, `phone.stopRing()`, `phone.isRinging()`, `phone.hangup()`; answering
  pushes overlay mode `phone`, emits `phone:answer`; director scripts the call with
  `DA.ui.say/choice` while `phone` is active; `phone:hangup`.
* `map.open({find}) → Promise<locId|null>` — county map (procedural contours, roads from
  `DA.content.maplocs`); `map:located {id}`.
* `paperwork.open() → Promise<{complete}>` (`paperwork:done`), `mirror.open()` (reflection lag
  from `DA.flag('mirror_stage')` 0–3), `photo.open()` (4th person if `photo_four`),
  `keypad.open({id, code, title}) → Promise<bool>` (`keypad:ok`/`keypad:bad`), `terminal.open()`
  (save/load; busy if `no_archive`; TIMELINE STORE if `archives_are_timelines`),
  `weather.open({source:'mast'|'panel'})` (sunrise from `DA.state.sunrise` or `--:--` if
  `sunrise_unknown`; mast sets `weather_read`, emits `weather:read`), `calendar.open()` (flip →
  flag `calendar_date`, `calendar:flipped`).
* Kind handlers: `coffee` (5 s brew → `mug`, `coffee:made`), `breaker` (panel overlay; reset →
  `breaker:reset {id}`), `generator` (toggle → `generator:toggle {on}`), `tapes` (pick tapes →
  `DA.state.tapes`, `tape:found {id}`), `vent` (unscrew → note/item, `vent:open {id}`), `lever`
  (`lever {id, on}`), `keypad` (interactable `{code, door?, item?}`).
* `DA.scenes.drive({kind:'arrive'|'loop'|'escape'|'dawn'|'months_later', loop, captions,
  radioLine}) → Promise` (mode `drive`, opaque, pseudo-3D night road in rain),
  `play(steps) → Promise` (mode `cutscene`), `multiverse(secs) → Promise`, `death(info) →
  Promise` (mode `death`; LOAD ARCHIVE → `DA.archive.loadLatest()` else title),
  `ending(id) → Promise` (final cinematic parts + credits; records the ending), `credits(opts)`.

### 6.8 `DA.content` (content.js) — data only
`speakers`, `tx`, `roomfeed`, `notes`, `tapes`, `docs`, `dialogue`, `maplocs`, `fragments`,
`endings`, `objectives`, `items`. Transmission schema:
```js
tx.tx_woman = {
  id: 'tx_woman', freq: 148.32, bearing: 300, width: 0.05, strength: 0.85,
  sender: 'UNIDENTIFIED — FEMALE', summary: 'Woman trapped in overturned car',
  stamp: { day: 28, h: 2, m: 13 },   // origin time → log stamp + OFFSET (or stampText:'NULL', offsetText:'…')
  future: true, alert: true,
  hail: [{ s: 'woman', t: 'Hello? Is anybody there?' }], hailGap: 5,
  waitLines: [{ s: 'woman', t: 'Please... are you still there?' }],
  script: {
    start: [ { s: 'woman', t: '…', sfx: 'rain_car' },
             { choose: [ { id: 'respond', t: 'This is Relay Station Fourteen. I hear you. Where are you?', next: 'where' },
                         { id: 'log', t: "[Log it. Don't respond.]", silent: true, next: 'plead' } ],
               timeout: 40, onTimeout: 'plead' } ],
    where: [ …, { end: true } ],
    plead: [ …, { end: true } ],
  },
};
```
Step forms: `{s, t, d?, sfx?, cap?, gap?, alt?}` line (`alt` = alternate wording for variant
loads), `{sfx, cap, d}`, `{wait: s}`, `{choose: [...], timeout, onTimeout, prompt}`,
`{goto: 'node'}`, `{fx: {...}}`, `{emit: 'evt'}`, `{end: true, fx?}`. Option fields: `id, t,
next, silent, interfere, fx, action`. Room feed: `{id, offset: sec, force?, steps: [{at, cap,
sfx, event, s?, t?}]}`. Speakers: `{name, color, voice: {pitch, rate, formant, breathy,
gender:'f'|'m'|'c'|'n', age, rasp}}`. Notes `{title, text, where}`; tapes `{label, year,
desc, lines: [steps]}`; docs `{title, style, body}`; dialogue `{id: [ {s, t, d?} ]}`; maplocs
`{id, name, kind:'road'|'place'|'marker'|'bridge', pts: [[x,y],…] (0..1 map space)}`.

### 6.9 `DA.entity`, `DA.director`, `DA.debug` (entity.js, director.js, debug.js)
* `DA.entity`: `spawn(point, mode)`, `despawn()`, `moveTo(point|{x,y}, speed) → Promise`,
  `hunt(opts)`, `search(room, secs) → Promise<found>`, `window(on)`, `predict(sec)`,
  `visible()`, state in `DA.state.entity`. Multi-position rendering via sprite `ghosts`
  (2–4 flickering positions from path history/prediction; frames change between ghosts).
  Emits `entity:caught`. Causes `flickerNear` and static bursts nearby.
* `DA.director`: owns every beat in §4, objectives, clock holds/rates, checkpoints, flags, the
  pure path, deaths, endings; intercepts ids (`car`, `generator`, `control_door`,
  `control_console`, `relay_console`, `newspaper`…). `DA.director.jump(beatId)` sets up state
  for any beat (for testing).
* `DA.debug` (`?debug`): FPS/beat/flags overlay, F9 beat menu, F10 noclip, `?debug&jump=act3`
  autostart (`DA.debug.autostart()` returns true when it started a game).

---

## 7. ID registry

### 7.1 Rooms
`lot road forest woods lobby hall radio office kitchen equipment storage bathroom workshop
records stairs newhall hall_ext` · basement: `b_stairs b_hall generator control vent` ·
`roof` · `array` · `relay`.

### 7.2 Points
Station: `pt_arrive pt_hollis_start pt_tour_lobby pt_tour_stairs pt_tour_equipment
pt_tour_kitchen pt_tour_bath pt_tour_workshop pt_tour_records pt_tour_radio pt_hollis_exit
pt_hollis_car pt_car pt_radio_chair pt_desk_stand pt_mug_radio pt_mug_kitchen pt_fig_1
pt_fig_2 pt_fig_3 pt_fig_4 pt_entity_outside pt_entity_hall pt_entity_radio_door
pt_window_out pt_storage_arrive pt_newhall_start pt_newhall_end pt_replacement_arrive
pt_relay_return pt_roof_return pt_stairs_return pt_front_inside pt_front_outside pt_lot_far
cam_1 cam_2 cam_4` · basement: `pt_b_arrive pt_gen pt_vent pt_control pt_control_return
pt_entity_b cam_3` · array: `pt_array_arrive pt_array_center pt_limiter_1 pt_limiter_2
pt_limiter_3 pt_entity_array` · relay: `pt_relay_arrive` · roof: `pt_roof_arrive`.

### 7.3 Interactables (id → kind)
Station: `front_door radio_door office_door kitchen_door equip_door storage_door bath_door
workshop_door records_door stairs_door newhall_door newhall_exit`(door) · `radio_desk`(radio)
· `cctv`(cctv) · `wall_map`(map) · `desk_calendar`(calendar) · `hide_desk hide_cupboard
hide_stall`(hide) · `radio_window`(look) · `office_desk`(paperwork) · `key_cabinet`(keypad
1978 → item `key_records`) · `blueprint`(doc `doc_blueprint`) · `weather_panel`(weather) ·
`phone`(phone) · `corkboard`(doc `doc_corkboard`) · `coffee_machine`(coffee) ·
`fridge`(look) · `staff_photo`(photo) · `tape_terminal`(terminal) · `racks`(look) ·
`relay_door`(keypad 0213 → director loads `relay`) · `mirror`(mirror) · `sink`(look) ·
`workbench`(flashlight) · `breaker_panel`(breaker) · `roof_ladder`(ladder → roof) ·
`records_shelves`(tapes) · `records_cabinet`(doc `doc_personnel`) · `stairs_down`(stairs →
basement) · `signin_sheet`(doc `doc_signin`) · `lobby_plaque`(doc `doc_plaque`) ·
`procedures`(doc `doc_procedures`, radio room binder) · `car`(car) · `newspaper`(doc
`doc_newspaper_2049`, hidden until the Open ending) · vents (vent): `vent_office vent_kitchen
vent_bath vent_workshop vent_hall vent_storage`.
Basement: `stairs_up`(stairs) · `generator`(generator) · `fuel_tank`(look) ·
`vent_basement vent_b1`(vent) · `hide_boiler`(hide) · `control_door`(door, locked) ·
`control_console`(console) · `array_hatch`(ladder → array).
Array: `array_ladder`(ladder → basement) · `report`(doc `doc_report`) · `limiter_1
limiter_2 limiter_3`(lever) · `antenna_look`(look).
Relay: `relay_console`(console) · `relay_exit`(stairs → station `pt_relay_return`).
Roof: `roof_hatch`(ladder → station `pt_roof_return`) · `weather_mast`(weather).
Props: `chair jar mug player_car hollis_car table lamp_post station_sign mast tower
downward_antenna lectern replacement_car`.
NPCs: `hollis`, `replacement`.

### 7.4 Frequencies (MHz)
`027.18` CB channel 19 (bearing E 90°) · `121.50` aviation guard · `148.32` **RESERVED**
(log only) · `155.34` County Dispatch / EMS (omni, strong) · `155.47` Sheriff (S 180°) ·
`162.55` NOAA weather (N 0°) · `014.00` room feed (omni, only exists after `offset_unit`) ·
`000.00` breathing. Dial range 000.00–199.99.

### 7.5 Textures (names)
Walls: `missing concrete_ext wall_paint wall_panel wall_tile wall_kitchen wall_brick
wall_rock window window_small door_wood door_metal door_front door_steel door_records
door_blast door_jamb rack_server radio_console cctv_bank shelf_supplies shelf_tapes
breaker_panel generator kitchen_counter fridge filing_cabinet bookcase corkboard map_wall
mirror_wall stall workbench ladder_wall stairs_down vent_wall pipes antenna_console
terminal_tape fuel_tank cables trees fence parapet sign_station reels hatch`.
Floors/ceilings: `floor_lino floor_tile floor_concrete floor_carpet floor_grate
ground_gravel ground_mud ground_asphalt roof_tar ceil_tile ceil_light ceil_concrete ceil_rock`.
Decals (for `base+decal`): `dec_calendar dec_photo dec_clock dec_notice dec_blueprint dec_vent
dec_plaque dec_sign_radio dec_sign_exit dec_graffiti_code dec_keycabinet dec_phone dec_switch
dec_keypad dec_weather_panel dec_stencil_relay dec_water_stain dec_crack`.
Sprites: `spr_hollis spr_replacement spr_entity spr_entity_face spr_figure spr_operator
spr_mug spr_chair spr_table spr_jar spr_boxes spr_bucket spr_car spr_car2 spr_car_rusted
spr_tree spr_tree_dead spr_tower spr_mast spr_lamp_post spr_sign spr_cable_coil
spr_downward_antenna spr_lever spr_lever_down spr_lectern spr_newspaper spr_tape spr_debris
spr_light_fixture spr_barrel`.

### 7.6 Sounds
`footstep` (surface: `lino concrete gravel metal mud tile carpet`) `footstep_other creak
door_open door_close door_locked door_unlock door_creak door_heavy knock knock3 window_knock
chair_scrape glass_break shelf_fall phone_ring phone_pickup phone_hangup dial_tone
breaker_trip breaker_reset switch flicker coffee_brew mug_set thunder static_burst radio_click
tuning tape_insert tape_play tape_stop tape_eject beep alarm scan impact scream_distant breath
breath_other heartbeat car_door car_start car_idle car_drive car_away engine_fail lever keypad
keypad_ok keypad_bad paper pen generator_start generator_stop power_down power_up drip
pipe_groan footsteps_upstairs bird_strike collapse_rumble whisper ringing branches vent_open
ladder hatch wind_gust stinger_low stinger_high stinger_glitch`.

### 7.7 Speakers
`woman dispatch trucker police weather child girl you you_calm you_panic you_injured you_old
you_now you_recorded hollis replacement researcher_a researcher_b operator_marsh
operator_okafor operator_vance first_contact keep_open new_operator pilot unknown`.

### 7.8 Items
`mug flashlight key_records key_antenna` + tapes `tape_1954 tape_1932 tape_1901 tape_1887
tape_first_contact tape_do_not_duplicate tape_name tape_op_loop tape_op_survive`.

### 7.9 Content ids the director uses
Transmissions: `tx_radio_check_reply tx_trucker_flat tx_dispatch_flat_ack tx_police_chatter
tx_weather_loop tx_woman tx_dispatch_kestrel_ack tx_dispatch_nothing tx_truck_breakdown
tx_ambulance tx_pursuit tx_child_fire tx_fire_confirm tx_three_years tx_bridge
tx_bridge_thanks tx_filler_1..tx_filler_6 tx_future_you_17 tx_18 tx_girl_19
tx_future_you_faint tx_calm_vent tx_panic_dont tx_injured tx_calm_generator tx_new_hallway
tx_old_you_1 tx_old_you_twist tx_your_death tx_panic_destroy tx_old_maintain tx_calm_open
tx_you_now tx_keep_channel tx_radio_check_2049 tx_pure_cb_1 tx_pure_cb_2 tx_pure_police_2
tx_generic_nothing` · outgoing texts in `content.outgoing`: `out_radio_check out_dispatch_flat
out_report_kestrel out_warn_fire out_warn_bridge out_warn_bridge_dispatch
out_keep_channel_open out_respond_2049` · room feeds `rf_chair rf_glass rf_hide rf_leaving
rf_why rf_keep_1 rf_keep_2 rf_keep_3` · dialogue `hollis_greet hollis_lobby hollis_stairs
hollis_equipment hollis_kitchen hollis_bath hollis_workshop hollis_records hollis_radio
hollis_148 hollis_why hollis_ok hollis_bye phone_echo phone_dont_turn replacement_arrive
replacement_tour_* replacement_148 replacement_why maintain_realize secret_handover thoughts_*`
· docs `doc_signin doc_plaque doc_procedures doc_blueprint doc_corkboard doc_personnel
doc_report doc_newspaper_2049 doc_shift_form doc_hollis_note` · notes `note_1..note_10` ·
tapes (§7.8) · endings `endings.destroy endings.maintain endings.open endings.secret
endings.credits endings.post_secret` · `fragments` (collapse voice fragments) · `death`
(death sequence lines).

### 7.10 Flags (director-owned; others may read)
`tour_done hollis_gone task_* woman_responded woman_logged act2 offset_unit outside_unstable
mug_on_desk mug_moved photo_four mirror_stage records_unlocked records_opened followed_future
girl_choice cctv_on cctv_offsets figure_done phone_done generator_off interlock_released
key_found log_haunted sunrise_unknown no_archive archives_are_timelines you_realtime collapse
relay_unlocked ending weather_read calendar_date first_interference`.

### 7.11 Events
`tick frame boot booted game:new game:load game:ready game:quit runtime:reset pause resume
resize flag var item:add item:remove interference mode:enter mode:exit input:lock
input:lost-lock input:blur archive:saved archive:collect clock:minute` · world:
`interact trigger:enter trigger:exit room:enter map:change door:open door:close door:locked
door:unlock hide:enter hide:exit power:change mutation lightning` · radio: `radio:tuned
radio:bearing radio:carrier radio:lock radio:lost radio:received radio:line radio:choice
radio:mic radio:sent radio:ended radio:logged radio:power radio:log-changed roomfeed:event
roomfeed:start roomfeed:end tape:play tape:end` · devices: `cctv:open cctv:close cctv:view
cctv:figure phone:ring phone:answer phone:hangup map:located paperwork:done keypad:ok
keypad:bad weather:read calendar:flipped coffee:made breaker:reset generator:toggle
tape:found vent:open lever mirror:open photo:view` · ui: `journal:log-open journal:log-close
choice:made doc:open doc:close` · entity: `entity:caught entity:spawn entity:despawn` ·
director: `beat ending:start`.

---

## 7.12 Post-plan additions (see each module's header for exact APIs)

* **Voices:** `DA.settings.voiceStyle` is `natural`, `classic` or `system`. The natural engine is a
  Klatt-style source-filter synthesizer rendered in a worker, played through device channels (AM/FM
  car radio, two-way, CB, phone, cassette). `DA.audio.systemVoicesAvailable()` and
  `DA.audio.resetAmbience()` are available. `DA.util.lineDur` counts syllables.
* **Minimap:** `js/minimap.js` provides `DA.minimap` and the plan mode `plan` (`M` opens the plan,
  `Shift+M` toggles the minimap). `DA.minimap.setTarget(objId, target)` sets an objective marker.
* **Radio:**
  * Desk: duty slip; `setMicNote`; `isBusy`; `quiet`; `jolt`; `tapePlaying`.
  * Power off suspends transmissions instead of killing them.
  * The sunrise line is read from `DA.content.sunriseLine()`.
  * Outgoing messages queued on other frequencies are listed.
* **Entity:**
  * `power()` / `powerInfo()` — strength grows with the people you save.
  * Cross-map follow.
  * `moveTo({lethal})` and `danger(on)`.
  * `stop` / `despawn({all})`.
* **World:**
  * Interaction handlers: `DA.interact.onId` / `onKind` (id handlers run before kind handlers).
  * Lighting: `lightAs(mapId)` gives a map's steady light field; circuit `ups` powers the CCTV;
    circuit `radio` (the receiver switch) swaps the rack faces to `radio_console_off`.
  * Queries: `inBuilding`, `canSee`, `doorsLeftOpen`.
  * Room names: `DA.maps.roomPhrase`.
* **Core:**
  * `DA.state.night` is set by every new state, and `DA.archive.latest(night)` finds that night's
    newest archive, so death reloads stay in the same night.
  * Mouse look uses raw input with a speed-based spike filter.
  * `fmtOffset` shows days from 36 h.

## 8. Testing

Headless Chrome via `playwright-core` (installed in the session scratchpad) with
`executablePath: '/usr/bin/google-chrome'`. Each module ships a dev harness under
`dev/` (e.g. `dev/renderer.html`) that loads `js/core.js` + the module and exercises it.
Integration tests boot `index.html?debug&jump=<beat>` and assert: no console errors, expected
modes/flags, screenshots look right. Every ending must be reachable via debug jumps and via
simulated play of its final steps.
