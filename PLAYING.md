# DEAD AIR — How to play

A first-person psychological horror game set in Relay Station 14, an isolated emergency radio
relay station, on the night of 26→27 October 1999. It is built from the design in `README.md`
and the technical plan in `PLAN.md`.

It runs entirely in the browser: Canvas 2D raycaster, Web Audio synthesis, and plain JavaScript.
It uses no three.js, no WebGL, no build step and no asset files.

## Running it

* **Simplest:** open `index.html` in a desktop browser (Chrome, Edge or Firefox). It works
  straight from the file system.
* **Or serve the folder:** `python3 -m http.server` in this directory, then open
  <http://localhost:8000/>.
* Headphones are strongly recommended; almost everything important is heard before it is seen.
* The fonts load from Google Fonts when online and fall back to local monospace faces offline.

## Controls

| Action | Keys |
|---|---|
| Look | Mouse (click the view to capture the pointer); arrow keys ←/→ also turn |
| Move | `W A S D` / `↑ ↓` |
| Run (noisy) / crouch (quiet) | `Shift` / `C` |
| Interact | `E` or left click |
| Flashlight (once you have it) | `F` |
| Wristwatch (time and date) | `T` |
| Journal (objectives, log, notes, tapes, items) | `Tab` |
| Floor plan (the station's 1978 drawing) / toggle minimap | `M` / `Shift+M` |
| Pause / settings | `Esc` |
| Leave a hiding spot | `E` or `Space` |

**At the radio desk:**

| Action | Keys |
|---|---|
| Fine tune ±0.01 MHz | mouse wheel, or `←`/`→` |
| Coarse tune ±0.10 MHz | `Shift`+wheel, or `↑`/`↓` |
| Tune ±1.00 MHz | `PgUp`/`PgDn` |
| Other tuning | drag the big dial, or click a frequency in the notebook |
| Rotate the directional antenna | `A`/`D`, or drag the bearing knob |
| Talk | hold `Space`, or click the microphone, then pick a line |
| Log the latest transmission | `L` |
| Log book | `Tab` |
| Stand up | `Esc` |

**Close-ups** (breaker panel, shift report, county map, tape shelf, keypads, terminal) work with
the mouse or keyboard alone: arrows/Tab to move, `Enter`/`Space` to choose, number keys where shown,
`Esc` or `E` to put things down.

## Settings

The settings screen is available from the title screen or the `Esc` pause menu.

| Setting | What it does |
|---|---|
| Volume | Overall volume |
| Mouse sensitivity, invert Y, field of view | Look controls |
| Sound captions | Captions for sounds as well as speech |
| Voices | **Natural** (default): a synthesized human voice through period radio, phone and cassette models. **Classic**: the original babble synth. **System speech**: your browser's own voices read the actual words, with radio static underneath. |
| Film grain, head bob | Visual effects |
| Minimap | Show or hide the corner minimap |

`dev/voices.html` is a listening page. It plays every test line in each voice style and channel
side by side, with a blind mode.

## Tips (light on spoilers)

* You are covering a night shift. The job comes first: the objectives, the radio procedures
  binder on the desk and Hollis's notebook tell you what to do.
* A voice buried in static needs two things: the right **frequency** and the right antenna
  **bearing**. Watch the spectrum display and the signal needle.
* **148.32 is reserved. If you hear anything on it, just log it. Don't respond.**
* Seated at the desk, the duty slip on the left wall lists what still needs doing.
* The minimap is drawn from the station's 1978 blueprint. If it and the building ever disagree,
  trust the building.
* Save at the tape backup terminal in the equipment room. The station also archives itself at
  key moments.
* There is more than one way for the night to end. Some endings are harder to find than others.

## Debug / testing

Open `index.html?debug` for an overlay with FPS, clock, act, beat and flags. The debug keys are:

| Key | Action |
|---|---|
| `F9` | Beat menu: jump anywhere in the story |
| `F10` | Noclip |
| `Shift+F10` | Teleport map |
| `F8` | Advance the clock +10 minutes |
| `F7` | Give all items |
| `F6` | Instability +3 |
| `F4` | Hide the overlay |
| `F3` | Spawn or despawn the entity |

`index.html?debug&jump=act3` starts a new night already at a given beat. The beat ids are listed
in the `F9` menu and in `DA.director.beats`.

## Project layout

| Path | Contents |
|---|---|
| `README.md` | The original design |
| `PLAN.md` | The game plan and module contracts |
| `js/core.js` | Foundation: event bus, state, clock, input, modes, archives, main loop |
| `js/textures.js`, `js/raycaster.js` | Procedural textures and the renderer |
| `js/audio.js` | Synthesized sound: ambience, radio, voices, effects |
| `js/maps.js`, `js/world.js` | The station, basement, array, relay chamber and roof; movement and interaction |
| `js/radio.js` | The radio desk and transmission engine |
| `js/ui.js` | HUD, subtitles, objectives, documents, journal, menus |
| `js/minimap.js` | Corner minimap and the full floor plan (the 1978 blueprint, and your pencil sketch where no drawing exists) |
| `js/devices.js` | CCTV, phone, county map, forms, mirror, photo, keypads, terminal, instruments |
| `js/scenes.js` | Drives, cutscenes, the montage, death, endings, credits |
| `js/entity.js` | The thing between possible realities |
| `js/director.js` | The story: every beat, the secret path and the endings |
| `js/content.js` | Every word the game speaks or shows |
| `js/debug.js` | Debug overlay and test helpers |
| `dev/*.html` | Per-module test harnesses |
