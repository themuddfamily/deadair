/* DEAD AIR — content.js
 * Every word the game speaks or shows. Data only, plus a few tiny lookup helpers at the end.
 * Schema: PLAN.md §6.8. IDs: PLAN.md §7.7–7.9. Creative source: README.md.
 *
 * TEMPLATING — every player-facing string is a DA.fmt() template. Core keys: {NAME} {NAME_UP}
 * {TIME} {DATE} {STAMP}. Extra keys a consumer must supply via DA.fmt(text, extra):
 *   {N19}          tx_future_you_17 — the number of the transmission to avoid, in words ('nineteen').
 *   {DEATH_ROOM} {DEATH_STAMP} {DEATH_TIME} {DEATH_LINE}   tx_your_death — from a DA.meta.deaths record
 *                  ({DEATH_STAMP}: the log stamp text; {DEATH_TIME}: the time as spoken, 'six thirty-five').
 *
 * ADDITIONS beyond PLAN §6.8 (all optional for consumers; nothing listed in PLAN was renamed):
 *   tx.*.offsetSec   Intended temporal offset in seconds relative to the moment of reception
 *                    (negative = from the past). Near-time transmissions ALSO carry a nominal
 *                    `stamp {day,h,m}` computed for the planned beat time; far ones carry
 *                    `stampText` (+ `offsetText` where no number makes sense, e.g. 'NULL').
 *                    Use DA.content.stampFor(tx, DA.clock.min) to rebase when a transmission is
 *                    played away from its nominal slot.
 *   tx.*.stampNow    true → the origin is the moment of reception (tx_you_now: OFFSET +00:00:00).
 *   tx.*.loop / loopGap   The script is meant to be replayed while tuned (tx_weather_loop,
 *                    tx_keep_channel), with loopGap seconds between passes.
 *   tx.*.noLock      Hint: strong local traffic (dispatch replies) — play with opts {noLock:true}.
 *   tx.*.id / roomfeed.*.id / outgoing.*.id are filled from their keys at load.
 *   script step {emit:'…'} extra events: 'woman:location' (tx_woman gives Kestrel Road),
 *                    'child:address' (tx_child_fire), 'bridge:details' (tx_bridge).
 *   roomfeed rf_hide step 2 fires event 'hide_steps_near'; rf_leaving events leave_voice,
 *                    leave_steps, leave_door, leave_silence, leave_ohgod, leave_run, leave_impact,
 *                    leave_scream.
 *   speakers (extra ids): you_masked (your voice, labelled UNIDENTIFIED — #17 and the faint call
 *                    before the reveal), trucker_2, caller, interviewer, amateur, recordist, dj,
 *                    phone (the line that repeats you). Every speaker has `voice.synthetic` (bool).
 *   maplocs kinds 'water' (creeks) and 'border' (county line) besides road/place/marker/bridge;
 *                    markers carry `road` (the road id they stand on); `label` = short map label.
 *   notes.*.date / author;  tapes.*.stamp (receiver/archive stamp text);  items for every tape.
 *   docs.doc_blueprint.svg (same inline SVG that sits in its body, as its own paragraph);
 *   docs.doc_shift_form.fields [{id,label,kind:'text'|'select',options?,value?,answer?,readonly?}]
 *                    + signLabel — for DA.devices.paperwork.
 *   choices          Option lists for scripted non-radio choices (hollis_148, phone).
 *   looks            Thought text for `look` interactables (radio_window fridge racks sink
 *                    fuel_tank antenna_look) and a few props.
 *   notebook         Default frequency-notebook entries + later discoveries (room, breath).
 *   log              Strings for log rewrites (NO TRANSMISSION, #41 …).
 *   cards            Act title cards.   drive  Captions/signs/car-radio lines per drive kind.
 *   tour             {hollis, replacement}: ordered [pointName, dialogueId] pairs for the two tours.
 *   hints            Short control hints the director may show.   terminal  Tape terminal strings.
 *   endings.*.sub / card / lines (plain strings) / radioSpeaker;  endings.credits.lines + .text.
 *   death.callSpeaker / answerSpeaker / static / load.
 *   `alt` wordings also appear on a few dialogue lines (same meaning as on tx lines).
 *   Helpers: DA.content.speaker(id) · DA.content.stampFor(txOrId, nowMin) · DA.content.wordCount()
 *                    · DA.content.sunriseLine() → {t, cap?} (see below).
 *
 * WAVE-3 ADDITIONS (story fixes; all additive):
 *   register         THE shift register: {form, title, rule, cols, rows:[{date,in,out,relieving,
 *                    name,rem}], you:{date,in,relieving,name:'{NAME_UP}',rem}, older, loose}. The
 *                    lobby's doc_signin body is built from it (you → rows newest first → older pages →
 *                    the loose 2049 page); the name-entry screen should show rows + your line.
 *   tx_weather_loop  its sunrise step carries `sunrise: true`: a receiver may speak
 *                    DA.content.sunriseLine() instead (DA.state.sunrise, pushed back by every
 *                    interference; garbled once flag sunrise_unknown is set).
 *   tx_girl_19_again #19 when the girl already called earlier tonight (never the same words twice).
 *   tx_calm_time     Calm You's precise instruction ("At {AT_TIME}, turn the antenna to
 *                    two-seven-zero"); {AT_TIME} is a var the director supplies.
 *   tx_injured.script.start_saved / saved_choice   the director starts here when someone was saved.
 *   tx_woman         choice window 100 s.  tx_you_now.answer: no scripted echo (you_realtime is it).
 *   roomfeed rf_hide captions match what happens (+12 in the hall, +21 the radio-room handle);
 *                    rf_keep_4 (a fourth keep-the-channel cue); rf_past_close / rf_past_open
 *                    (offset −4: something that already happened).
 *   notes.note_wad   the duct packed with dozens of slips (vent_kitchen), one long page.
 *   dialogue         hollis_ok ends with "Old military frequency or something."; hollis_bye says
 *                    where the shift report is; replacement_tour_bath; replacement_hello(_2);
 *                    secret_handover_quiet; calm_good; thoughts_* for the new beats. The woods
 *                    loop: thoughts_woods (at the dump, once outside is unstable), thoughts_woods_pure
 *                    (the dump while it still holds), thoughts_woods_out (out at the other end).
 *   objectives       obj_standby obj_warn_bridge obj_warn_fire obj_at_time ({AT_TIME}) obj_flashlight
 *                    obj_check_hall obj_check_newhall obj_signout.
 *   endings.post_secret   a getter: post_secret_base with its recap line from post_secret_recap
 *                    [DA.state.director.recap] (full | unlogged | duties | idle).
 *   drive.dawn.captions use {TIME} (when you actually left).
 *   hints.logbook / logbook_desk.
 *
 * FIX-C2 ADDITIONS:
 *   outgoing.*.label a short gist for the mic panel's "queued on other frequencies" rows (every entry).
 *   micNotes         {kestrel}: the empty mic panel's note on 155.34 while the woman's location is not
 *                    yet found on the wall map (DA.radio.setMicNote, set by the director).
 *   thoughts_weather_panel   ACT 1: the office display read instead of the roof mast.
 *
 * FIX-D ADDITIONS (story polish; all additive):
 *   spokenTime(h, m) helper → 'six thirty-five' (tx_your_death speaks {DEATH_TIME}, the log keeps
 *                    {DEATH_STAMP}).
 *   tx_calm_time.script.start_nokey / instruct   the director starts at start_nokey while the key is
 *                    still in the duct (both go on to 'instruct'); tx_calm_generator no longer opens
 *                    with "You found the key. Good." (tx_calm_time does). tx_calm_vent's directions
 *                    match the basement (the boiler room off the stair corridor, left of the pipes).
 *   tx_pure_police_3 the ordinary night's 06:22 routine call (the sheriff going off nights).
 *   tx_old_you_1.waitLines "Take your time. I'll wait." (fits a call already locked).
 *   objectives       obj_check_hall 'Check the far end of the corridor.', obj_check_newhall 'Find the
 *                    knocking.' (one corridor duty each), obj_power_on.
 *   dialogue         replacement_hello_shut (she let herself in through a shut door),
 *                    replacement_go_home; thoughts_sunrise_late, thoughts_predawn, thoughts_mirror3,
 *                    thoughts_relief_gone, thoughts_her_radio, thoughts_fine_tune,
 *                    thoughts_receiver_off, thoughts_stamp_passed, thoughts_2049_console /
 *                    _generator / _hatch.
 *   hints.fine       the fine-tune nudge.   drive.arrive DJ: "Just gone half eleven." (never
 *                    contradicts the dashboard clock).
 *   docs.doc_hollis_note.hand = true (handwritten; DA.ui also treats every duct note as handwritten
 *                    unless it says hand: false).
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});

  /* ------------------------------------------------------------ constants */
  const MIN = 60, H = 3600, DAY = 86400, YR = 365 * DAY;
  /** Nominal origin time in the Oct-1999 week: day of month, hour, minute. */
  const at = (day, h, m) => ({ day, h, m });
  /** The standard "don't engage" option every temptation offers. */
  const logOpt = (next) => ({ id: 'log', t: "[Log it. Don't respond.]", silent: true, next });
  const cut = () => ({ sfx: 'static_burst', cap: '[the carrier drops]', d: 1.6 });

  /* ============================================================ speakers */
  // One base voice for every "you". Variants move it only a little so the player hears one man.
  const YOU_VOICE = { pitch: 1.0, rate: 1.0, formant: 1.0, breathy: 0.15, gender: 'm', age: 34, rasp: 0.06, synthetic: false };
  const youV = (o) => Object.assign({}, YOU_VOICE, o);
  const v = (pitch, rate, formant, breathy, gender, age, rasp, synthetic) =>
    ({ pitch, rate, formant, breathy, gender, age, rasp, synthetic: !!synthetic });

  const speakers = {
    // --- radio traffic
    woman:        { name: 'WOMAN',            color: '#d7b3c4', voice: v(1.85, 1.08, 1.15, 0.35, 'f', 31, 0.05) },
    dispatch:     { name: 'COUNTY DISPATCH',  color: '#8fb4da', voice: v(1.70, 1.00, 1.12, 0.10, 'f', 49, 0.18) },
    trucker:      { name: 'TRUCKER',          color: '#cbb27a', voice: v(0.88, 0.95, 0.95, 0.12, 'm', 52, 0.35) },
    trucker_2:    { name: 'CB',               color: '#b9a98a', voice: v(1.04, 1.10, 1.00, 0.10, 'm', 38, 0.20) },
    police:       { name: 'SHERIFF',          color: '#a3acdc', voice: v(0.95, 1.05, 0.98, 0.08, 'm', 41, 0.10) },
    weather:      { name: 'NOAA WEATHER',     color: '#a9c99f', voice: v(0.96, 0.88, 1.00, 0.00, 'n', 0, 0.00, true) },
    pilot:        { name: 'AIRCRAFT',         color: '#9dc3da', voice: v(1.00, 1.15, 1.00, 0.05, 'm', 45, 0.05) },
    caller:       { name: 'CALLER',           color: '#d6c0a8', voice: v(1.62, 0.92, 1.08, 0.30, 'f', 71, 0.30) },
    child:        { name: 'CHILD',            color: '#e3d38c', voice: v(2.50, 1.15, 1.30, 0.20, 'c', 8, 0.00) },
    girl:         { name: 'GIRL',             color: '#eac6a6', voice: v(2.70, 0.96, 1.35, 0.22, 'c', 7, 0.00) },
    // --- you
    you:          { name: 'YOU',              color: '#dcd6c6', voice: youV({}) },
    you_calm:     { name: 'YOU (CALM)',       color: '#a3c9cd', voice: youV({ pitch: 0.98, rate: 0.92, breathy: 0.10 }) },
    you_panic:    { name: 'YOU (PANICKED)',   color: '#e2a47f', voice: youV({ pitch: 1.07, rate: 1.26, breathy: 0.32, rasp: 0.08 }) },
    you_injured:  { name: 'YOU (INJURED)',    color: '#cf9090', voice: youV({ pitch: 0.97, rate: 0.86, breathy: 0.58, rasp: 0.24 }) },
    you_old:      { name: 'YOU (OLD)',        color: '#ccbb8e', voice: youV({ pitch: 0.85, rate: 0.78, formant: 0.97, breathy: 0.28, age: 75, rasp: 0.45 }) },
    you_now:      { name: 'YOU',              color: '#dcd6c6', voice: youV({}) },
    you_recorded: { name: 'YOU (RECORDED)',   color: '#bdb5a5', voice: youV({ breathy: 0.18, rasp: 0.08 }) },
    you_masked:   { name: 'UNIDENTIFIED',     color: '#b1b8b3', voice: youV({ pitch: 1.05, rate: 1.18, breathy: 0.30, rasp: 0.08 }) },
    phone:        { name: 'PHONE',            color: '#cfc8b8', voice: youV({ breathy: 0.25 }) },
    // --- people at the station
    hollis:       { name: 'HOLLIS',           color: '#c9a988', voice: v(0.91, 0.94, 0.97, 0.12, 'm', 56, 0.26) },
    replacement:  { name: 'RELIEF OPERATOR',  color: '#a6c9bc', voice: v(1.80, 1.05, 1.14, 0.15, 'f', 26, 0.02) },
    new_operator: { name: 'STATION FOURTEEN', color: '#bcc8b3', voice: v(1.76, 0.98, 1.12, 0.12, 'f', 30, 0.04) },
    // --- the archive
    researcher_a: { name: 'RESEARCHER 1',     color: '#b4bdcc', voice: v(1.00, 1.02, 1.00, 0.08, 'm', 38, 0.06) },
    researcher_b: { name: 'RESEARCHER 2',     color: '#cdc2ae', voice: v(1.74, 0.96, 1.10, 0.10, 'f', 42, 0.04) },
    first_contact:{ name: 'LONG CHANNEL',     color: '#a9a9c2', voice: v(1.00, 0.86, 1.00, 0.40, 'm', 38, 0.12) },
    interviewer:  { name: 'INTERVIEWER',      color: '#b8ad96', voice: v(0.94, 0.94, 0.98, 0.06, 'm', 44, 0.12) },
    amateur:      { name: 'SURVEYOR',         color: '#b6a684', voice: v(1.02, 1.00, 1.00, 0.10, 'm', 29, 0.14) },
    recordist:    { name: 'RECORDIST',        color: '#bba98c', voice: v(0.96, 0.90, 0.98, 0.10, 'm', 50, 0.20) },
    operator_marsh:  { name: 'E. MARSH',      color: '#baa98f', voice: v(0.89, 0.90, 0.96, 0.14, 'm', 60, 0.32) },
    operator_okafor: { name: 'D. OKAFOR',     color: '#c3abcb', voice: v(1.72, 0.95, 1.10, 0.18, 'f', 44, 0.08) },
    operator_vance:  { name: 'R. VANCE',      color: '#abbfcc', voice: v(1.03, 1.12, 1.00, 0.20, 'm', 29, 0.06) },
    // --- the other thing
    keep_open:    { name: '???',              color: '#e08a7c', voice: v(0.70, 0.62, 0.82, 0.45, 'n', 0, 0.60, true) },
    unknown:      { name: 'UNKNOWN',          color: '#a3a3a3', voice: v(0.95, 0.95, 0.95, 0.30, 'n', 0, 0.20) },
    dj:           { name: 'CAR RADIO',        color: '#c2b8a0', voice: v(0.93, 1.05, 0.98, 0.08, 'm', 47, 0.10) },
  };

  /* ======================================================= transmissions */
  const tx = {};

  /* ---------------------------------------------- ACT 1 — ordinary night */

  tx.tx_radio_check_reply = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: 'Radio check — loud and clear', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County. Loud and clear.', alt: 'Station Fourteen, County. Read you five by five.' },
        { s: 'dispatch', t: "You must be Hollis's relief. Welcome to the graveyard." },
        { s: 'dispatch', t: "Quiet so far. Let's keep it that way. County clear." },
        { end: true },
      ],
    },
  };

  tx.tx_trucker_flat = {
    freq: 27.18, bearing: 82, width: 0.05, strength: 0.8,
    sender: 'CB 19 — "COLDWATER"', summary: 'Trucker, blown tire, Route 9 MM 20', future: false,
    hail: [{ s: 'trucker', t: 'Breaker one-nine, anybody got their ears on?' }], hailGap: 7,
    waitLines: [
      { s: 'trucker', t: 'Anybody on one-nine? Coldwater, on the shoulder on 9.' },
      { s: 'trucker', t: 'Come on, somebody. Anybody that can raise county.' },
    ],
    script: {
      start: [
        { s: 'trucker', t: 'Breaker one-nine. This is Coldwater, northbound on 9.' },
        { s: 'trucker', t: "Blew a steer tire just shy of mile marker twenty. I'm on the shoulder with my four-ways going." },
        { s: 'trucker', t: 'No signal on the bag phone out here. Anybody that can raise county for me?' },
        { choose: [
            { id: 'respond', t: "Coldwater, Relay Station Fourteen. I copy. I'll call it in to County.", next: 'respond' },
            logOpt('log'),
          ], timeout: 60, onTimeout: 'log' },
      ],
      respond: [
        { s: 'trucker', t: "Station Fourteen, ten-four. Didn't know anybody was out there." },
        { s: 'trucker', t: "Tell 'em it's a Kenworth pulling a reefer, mile twenty northbound. I ain't going anywhere." },
        { s: 'trucker', t: 'Appreciate you. Coldwater standing by.' },
        { end: true },
      ],
      log: [
        { s: 'trucker', t: '...Nobody, huh.', gap: 1.5 },
        { s: 'trucker', t: 'Well. Coldwater standing by on one-nine, if anybody wakes up.' },
        { end: true },
      ],
    },
  };

  tx.tx_dispatch_flat_ack = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: 'Tow dispatched to Route 9 MM 20', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County. Copy. Tractor-trailer, Route 9 at the two-zero marker.' },
        { s: 'dispatch', t: "I'll get Hendricks Towing rolling out of Pine Hollow. Tell him forty-five minutes. Maybe an hour in this." },
        { s: 'dispatch', t: 'County clear.' },
        { end: true },
      ],
    },
  };

  tx.tx_police_chatter = {
    freq: 155.47, bearing: 180, width: 0.05, strength: 0.8,
    sender: 'SHERIFF UNIT 6 / COUNTY', summary: 'Routine — tree down on Route 9', future: false,
    hail: [{ s: 'police', t: 'County, Six.' }], hailGap: 6,
    script: {
      start: [
        { s: 'police', t: 'County, Six.' },
        { s: 'dispatch', t: 'Six, go ahead.' },
        { s: 'police', t: "I'm ten-eight out of Pine Hollow. Heading up 9 for that tree down by the Pass Road." },
        { s: 'dispatch', t: 'Copy. Public Works says no saw crew before daylight.' },
        { s: 'police', t: "Figures. I'll set flares and sit on it.", alt: "Figures. I'll put flares out and sit on it." },
        { s: 'dispatch', t: 'Ten-four. And Mercer called again about the cows.' },
        { s: 'police', t: 'Tell Mercer the cows are his problem till sunup.' },
        { s: 'dispatch', t: "...I'll tell him you're en route.", gap: 1 },
        { s: 'police', t: 'Ten-four. Six clear.' },
        { end: true },
      ],
    },
  };

  tx.tx_weather_loop = {
    freq: 162.55, bearing: 0, width: 0.05, strength: 0.75, loop: true, loopGap: 6,
    sender: 'NOAA WX — WXM-62', summary: 'Weather radio forecast loop', future: false,
    script: {
      start: [
        { s: 'weather', t: 'This is NOAA Weather Radio, W-X-M sixty-two, with the latest forecast for the county and surrounding high country.' },
        { s: 'weather', t: 'A flash flood watch remains in effect through Thursday morning.' },
        { s: 'weather', t: 'Tonight: rain, heavy at times. Lows near forty. Northwest winds fifteen to twenty-five, gusting to forty on the ridges.' },
        { s: 'weather', t: 'At the county airport: rain and fog. Temperature forty-one. Pressure twenty-nine point six two, and falling.' },
        { s: 'weather', t: 'Sunrise at 6:42 a.m. Sunset at 5:58 p.m.', sunrise: true },
        { s: 'weather', t: 'Wednesday: rain continuing. Highs near fifty.', alt: 'Wednesday: more rain. Highs near fifty.' },
        { end: true },
      ],
    },
  };

  /* ---------------------------------------------------------- 02:13 */

  tx.tx_woman = {
    freq: 148.32, bearing: 300, width: 0.05, strength: 0.85,
    sender: 'UNIDENTIFIED — FEMALE', summary: 'Woman trapped in overturned car',
    stamp: at(28, 2, 13), offsetSec: 24 * H,
    future: true, alert: true,
    hail: [{ s: 'woman', t: 'Hello? Is anybody there?' }], hailGap: 5,
    waitLines: [
      { s: 'woman', t: 'Please... are you still there?' },
      { s: 'woman', t: "I can see the light on the radio. I know it's on." },
      { s: 'woman', t: 'Hello?' },
    ],
    script: {
      start: [
        { s: 'woman', t: "Hello? Is anybody— I can't tell if this is working." },
        { s: 'woman', t: 'I hit a deer. I swerved and the car went off the road. It rolled.' },
        { s: 'woman', t: "I think I'm in a ditch. I'm upside down. The belt won't— I can't get the belt." },
        { s: 'woman', t: "It's my husband's radio. It's the only thing in here with lights." },
        { s: 'woman', t: "Please. If anybody's there.", gap: 1 },
        { choose: [
            { id: 'respond', t: 'This is Relay Station Fourteen. I hear you. Where are you?', next: 'where' },
            logOpt('plead'),
          ], timeout: 100, onTimeout: 'plead' },
      ],
      where: [
        { s: 'woman', t: 'Oh God. Oh, thank God. Okay.' },
        { s: 'woman', t: 'Kestrel Road. The old logging road, off Route 9.' },
        { s: 'woman', t: 'Past the quarry turnoff. A long way past.' },
        { s: 'woman', t: "There's a mile marker. A green one. Fourteen. I can see it in the headlights.", alt: "There's a green mile marker. Fourteen. It's right there in the headlights." },
        { emit: 'woman:location' },
        { wait: 2 },
        { s: 'woman', t: "I'm so cold. My legs are cold. I think there's water coming in." },
        { s: 'woman', t: 'The rain is so loud on the— on the bottom of the car.' },
        { wait: 2.5 },
        { s: 'woman', t: 'Can you hear it?' },
        { wait: 3 },
        { s: 'woman', t: 'Is it still raining where you are?', gap: 2 },
        { sfx: 'static_burst', cap: '[the signal fades]', d: 2 },
        { end: true },
      ],
      plead: [
        { s: 'woman', t: 'Hello?', gap: 2 },
        { s: 'woman', t: 'Please. Somebody.' },
        { s: 'woman', t: "I can hear the rain. I can hear it inside the car now." },
        { wait: 3 },
        { s: 'woman', t: "I'm so cold." },
        { wait: 4 },
        { s: 'woman', t: '...hello?' },
        { sfx: 'static_burst', cap: '[the signal fades]', d: 2 },
        { end: true },
      ],
    },
  };

  tx.tx_dispatch_kestrel_ack = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: 'Units dispatched — Kestrel Road MM 14', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County. Copy your relay.' },
        { s: 'dispatch', t: 'Single-vehicle rollover, Kestrel Road at the one-four marker. One female, trapped.' },
        { s: 'dispatch', t: 'Unit Six is closest. Pine Hollow Fire and Medic Two are rolling.' },
        { s: 'dispatch', t: "That's a long way up Kestrel in this. Tell her to hang on." },
        { s: 'dispatch', t: 'County clear.' },
        { end: true },
      ],
    },
  };

  tx.tx_dispatch_nothing = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: 'Kestrel Road MM 14 — nothing found', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County.' },
        { wait: 1.5 },
        { s: 'dispatch', t: 'Unit Six is on Kestrel Road at the one-four marker.' },
        { s: 'dispatch', t: "There's nothing there.", gap: 1.5 },
        { s: 'dispatch', t: 'No vehicle. No skid marks. No deer. He walked the ditch a quarter mile both ways.', alt: 'No car. No skid marks. No deer. He walked the ditch both ways, a quarter mile.' },
        { s: 'dispatch', t: 'You copy, Fourteen?' },
        { wait: 4 },
        { s: 'dispatch', t: '...County clear.' },
        { end: true },
      ],
    },
  };

  /* -------------------------------------------- ACT 2 — the long night */

  tx.tx_truck_breakdown = {
    freq: 27.18, bearing: 240, width: 0.05, strength: 0.6,
    sender: 'CB 19 — UNKNOWN DRIVER', summary: 'Truck dead across Pass Road',
    stamp: at(27, 3, 12), offsetSec: 41 * MIN, future: true,
    hail: [{ s: 'trucker_2', t: 'Breaker one-nine, anybody—' }], hailGap: 6,
    script: {
      start: [
        { s: 'trucker_2', t: "Breaker one-nine, anybody. I'm dead on the Pass Road, top of the grade." },
        { s: 'trucker_2', t: 'Whole rig just quit. No lights, no nothing. Batteries are flat.' },
        { s: 'trucker_2', t: "I'm across the westbound lane. Somebody's gonna come around that bend and—" },
        { choose: [
            { id: 'respond', t: 'Driver, Relay Station Fourteen. Get your triangles out. Now.', next: 'respond' },
            logOpt('log'),
          ], timeout: 35, onTimeout: 'log' },
      ],
      respond: [
        { s: 'trucker_2', t: "Who's that? ...Yeah. Yeah, I got triangles. Putting 'em out." },
        { s: 'trucker_2', t: 'Thanks, Fourteen.' },
        { end: true },
      ],
      log: [
        { s: 'trucker_2', t: 'Anybody?' },
        cut(),
        { end: true },
      ],
    },
  };

  tx.tx_ambulance = {
    freq: 27.06, bearing: 5, width: 0.05, strength: 0.55,
    sender: 'CB 9 — UNIDENTIFIED FEMALE', summary: 'Ambulance request, Sawmill Road',
    stamp: at(29, 2, 40), offsetSec: 2 * DAY, future: true,
    hail: [{ s: 'caller', t: 'Is this channel nine? Is this the emergency one?' }], hailGap: 7,
    script: {
      start: [
        { s: 'caller', t: 'Is this channel nine? Somebody told me channel nine.' },
        { s: 'caller', t: "My husband fell in the barn. He's breathing but he won't wake up." },
        { s: 'caller', t: "The phone's been out since the storm. We're on Sawmill Road, the last place before the gate." },
        { s: 'caller', t: 'Please. Somebody call us an ambulance.' },
        { choose: [
            { id: 'respond', t: "Ma'am, Relay Station Fourteen. I copy. Stay on the radio.", next: 'respond' },
            logOpt('log'),
          ], timeout: 35, onTimeout: 'log' },
      ],
      respond: [
        { s: 'caller', t: 'Oh, thank God. Thank—' },
        { sfx: 'static_burst', cap: '[static]', d: 1.5 },
        { end: true },
      ],
      log: [
        { s: 'caller', t: 'Is anybody on this?' },
        { wait: 3 },
        { s: 'caller', t: "I'm going back to him. I'll leave it on." },
        cut(),
        { end: true },
      ],
    },
  };

  tx.tx_pursuit = {
    freq: 155.47, bearing: 175, width: 0.05, strength: 0.75,
    sender: 'SHERIFF UNIT 6', summary: 'Pursuit, Route 9 northbound',
    stamp: at(27, 2, 59), offsetSec: 12 * MIN, future: true,
    hail: [{ s: 'police', t: 'County, Six, priority!' }], hailGap: 5,
    script: {
      start: [
        { s: 'police', t: "County, Six, I'm in pursuit!", cap: '[siren behind him]' },
        { s: 'dispatch', t: 'Six, go ahead.' },
        { s: 'police', t: 'Northbound 9 out of Pine Hollow. Dark pickup, no plates, no lights. Eighty-plus.' },
        { s: 'police', t: 'Passing the Tower Road turnoff.' },
        { s: 'police', t: "He's turning onto Kestrel— lost him. Lost him in the trees." },
        { s: 'dispatch', t: 'Copy, Six. Lost on Kestrel Road.' },
        { choose: [
            { id: 'respond', t: 'Six, this is Relay Station Fourteen—', next: 'respond' },
            logOpt('log'),
          ], timeout: 20, onTimeout: 'log' },
      ],
      respond: [
        { s: 'police', t: "Who's on this channel? Clear the channel!" },
        { end: true },
      ],
      log: [
        { s: 'police', t: "Six. I'm gonna sit at the turnoff a while." },
        { end: true },
      ],
    },
  };

  tx.tx_child_fire = {
    freq: 148.32, bearing: 170, width: 0.05, strength: 0.7,
    sender: 'UNIDENTIFIED — CHILD', summary: 'Child reports fire, 14 Alder Lane',
    stamp: at(28, 3, 10), offsetSec: 24 * H,
    future: true, alert: true,
    hail: [{ s: 'child', t: 'Hello? Is this the police?' }], hailGap: 5,
    waitLines: [
      { s: 'child', t: 'Is anybody there? Is this the police?' },
      { s: 'child', t: "It's getting in my eyes." },
    ],
    script: {
      start: [
        { s: 'child', t: "There's smoke in my room. It's coming in under the door." },
        { s: 'child', t: "My mom's asleep. She won't wake up. I yelled really loud." },
        { s: 'child', t: 'We live at fourteen Alder Lane. In Pine Hollow.' },
        { s: 'child', t: "I'm supposed to say it twice. Fourteen Alder Lane, Pine Hollow." },
        { emit: 'child:address' },
        { choose: [
            { id: 'respond', t: 'This is Relay Station Fourteen. I hear you. Stay low and get outside.', next: 'respond' },
            logOpt('log'),
          ], timeout: 35, onTimeout: 'log' },
      ],
      respond: [
        { s: 'child', t: "Okay. Okay. I'm getting low." },
        { s: 'child', t: "The door's really hot." },
        { sfx: 'static_burst', cap: '[static]', d: 1.6 },
        { end: true },
      ],
      log: [
        { s: 'child', t: '...Hello?' },
        { wait: 3 },
        { s: 'child', t: "I'm gonna go get my mom." },
        cut(),
        { end: true },
      ],
    },
  };

  tx.tx_fire_confirm = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: '14 Alder Lane — hazard found, no fire', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County.' },
        { s: 'dispatch', t: 'Deputy Ruiz swung by fourteen Alder Lane like you asked.' },
        { s: 'dispatch', t: "Space heater in the boy's room. Cord scorched black, right into the carpet. Could've gone any night." },
        { s: 'dispatch', t: "Family's fine. Mom says thank you." },
        { wait: 2 },
        { s: 'dispatch', t: "...How'd you know about that, Fourteen?" },
        { end: true },
      ],
    },
  };

  tx.tx_three_years = {
    freq: 155.47, bearing: null, width: 0.05, strength: 0.9,
    sender: 'SHERIFF UNIT 4', summary: 'Welfare check — Relay Station 14',
    stampText: '27 OCT 2002 – 04:10', offsetSec: 3 * YR + 1 * DAY + 1 * H, future: true,
    hail: [{ s: 'police', t: 'County, Four.' }], hailGap: 6,
    script: {
      start: [
        { s: 'police', t: "County, Four. I'm out at the old relay station on Tower Road for that welfare check." },
        { s: 'police', t: "Gate's open. There's a car in the lot. Leaves all over it. Been here a while." },
        { s: 'police', t: "Front door's unlocked. Lights are on in here. Radio's on." },
        { s: 'police', t: "Nobody here. There's a mug on the desk by the radio. Still full." },
        { s: 'police', t: "Sign-in sheet's got a name. Last entry is October of ninety-nine." },
        { choose: [
            { id: 'respond', t: 'This is Station Fourteen. Who is this?', next: 'respond' },
            logOpt('log'),
          ], timeout: 30, onTimeout: 'log' },
      ],
      respond: [
        { wait: 2 },
        { s: 'police', t: "...County, Four. There's somebody on this radio." },
        { s: 'police', t: "It's coming out of the speaker right in front of me." },
        cut(),
        { end: true },
      ],
      log: [
        { s: 'police', t: "Four, clear. I'll wait for the day crew outside." },
        { end: true },
      ],
    },
  };

  tx.tx_bridge = {
    freq: 27.18, bearing: 128, width: 0.05, strength: 0.7,
    sender: 'CB 19 — "COLDWATER"', summary: 'Jackknifed truck, Harlan Creek bridge',
    stamp: at(27, 3, 15), offsetSec: 20 * MIN, future: true, alert: true,
    hail: [{ s: 'trucker', t: 'Breaker— breaker one-nine—' }], hailGap: 4,
    script: {
      start: [
        { s: 'trucker', t: 'Breaker one-nine, emergency, emergency!' },
        { s: 'trucker', t: "I'm jackknifed on the Harlan Creek bridge. The deck's solid ice." },
        { sfx: 'impact', cap: '[metal, groaning]', d: 1.5 },
        { s: 'trucker', t: "There's a minivan under my trailer. Oh God. There's a minivan." },
        { s: 'trucker', t: 'I can see a car seat. Somebody get— somebody call—' },
        { emit: 'bridge:details' },
        { sfx: 'static_burst', cap: '[the carrier breaks up]', d: 1.5 },
        { choose: [
            { id: 'respond', t: 'Driver, this is Relay Station Fourteen. Where are you exactly?', next: 'respond' },
            logOpt('log'),
          ], timeout: 30, onTimeout: 'log' },
      ],
      respond: [
        { s: 'trucker', t: "Harlan Creek! Route 9, the bridge— I can't get the door open—" },
        cut(),
        { end: true },
      ],
      log: [
        { sfx: 'static_burst', cap: '[static]', d: 2 },
        { end: true },
      ],
    },
  };

  tx.tx_bridge_thanks = {
    freq: 27.18, bearing: 128, width: 0.05, strength: 0.85, noLock: true,
    sender: 'CB 19 — "COLDWATER"', summary: 'Harlan Creek bridge — no accident', future: false,
    script: {
      start: [
        { s: 'trucker', t: 'Station Fourteen, you still on this channel? This is Coldwater.' },
        { s: 'trucker', t: "I just came up on the Harlan Creek bridge. Somebody'd put the word out. I stopped at the top of the grade." },
        { s: 'trucker', t: "Deck's glare ice. You couldn't stand on it." },
        { s: 'trucker', t: 'Minivan came round the bend two minutes later. Family. I flagged them down.' },
        { wait: 1.5 },
        { s: 'trucker', t: 'Whoever put out that warning... thank you.' },
        { s: 'trucker', t: 'Coldwater clear.' },
        { end: true },
      ],
    },
  };

  /* ---- filler traffic (the director spends these so #17 lands on 17) */

  tx.tx_filler_1 = {
    freq: 162.55, bearing: 0, width: 0.05, strength: 0.75,
    sender: 'NOAA WX — WXM-62', summary: 'Flash flood watch extended', future: false,
    script: {
      start: [
        { s: 'weather', t: 'The National Weather Service has extended the flash flood watch for areas along Harlan Creek until noon Thursday.' },
        { s: 'weather', t: 'Residents in low-lying areas should be prepared to move to higher ground.' },
        { end: true },
      ],
    },
  };

  tx.tx_filler_2 = {
    freq: 27.18, bearing: 90, width: 0.05, strength: 0.7,
    sender: 'CB 19', summary: 'CB — road conditions over the pass',
    stamp: at(27, 2, 44), offsetSec: 4 * MIN, future: true,
    script: {
      start: [
        { s: 'trucker_2', t: "Breaker one-nine for a southbound. How's it looking over the pass?" },
        { s: 'trucker', t: "It's a river, driver. Keep it under fifty and you'll live.", alt: "It's a river up there. Keep it under fifty, driver." },
        { s: 'trucker_2', t: 'Ten-four. Mercy, this rain.' },
        { end: true },
      ],
    },
  };

  tx.tx_filler_3 = {
    freq: 121.5, bearing: null, width: 0.05, strength: 0.6,
    sender: 'AIRCRAFT — "NIGHTFREIGHT 212"', summary: 'Aviation guard — lost contact, resolved', future: false,
    script: {
      start: [
        { s: 'pilot', t: 'Any station, Nightfreight Two-Twelve on guard. Lost Center on one-two-seven point four in this stuff.' },
        { wait: 4 },
        { s: 'pilot', t: "...Disregard. Got 'em back. Two-Twelve." },
        { end: true },
      ],
    },
  };

  tx.tx_filler_4 = {
    freq: 155.47, bearing: 180, width: 0.05, strength: 0.8,
    sender: 'SHERIFF UNIT 6 / COUNTY', summary: 'Unit 6 clear of Route 9 tree', future: false,
    script: {
      start: [
        { s: 'police', t: "County, Six. I'm clear of the tree on 9. Flares are out, one lane's open." },
        { s: 'dispatch', t: 'Copy, Six. Show you ten-eight.' },
        { end: true },
      ],
    },
  };

  tx.tx_filler_5 = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.9,
    sender: 'COUNTY DISPATCH', summary: 'Pass Road closed — rock slide',
    stamp: at(27, 3, 2), offsetSec: 6 * MIN, future: true,
    script: {
      start: [
        { s: 'dispatch', t: 'County, all units. Pass Road is closed at the county line. Rock slide.' },
        { s: 'dispatch', t: "State's been notified. County clear." },
        { end: true },
      ],
    },
  };

  tx.tx_filler_6 = {
    freq: 27.18, bearing: 90, width: 0.05, strength: 0.7,
    sender: 'CB 19', summary: 'CB — radio check', future: false,
    script: {
      start: [
        { s: 'trucker_2', t: "Radio check, one-nine. How's this old box getting out?" },
        { s: 'trucker', t: "You're wall to wall and treetop tall, driver." },
        { s: 'trucker_2', t: "Ten-four. 'Preciate it." },
        { end: true },
      ],
    },
  };

  /* ---- #17, #18, #19 */

  tx.tx_future_you_17 = {
    freq: 148.32, bearing: null, width: 0.04, strength: 0.6,
    sender: 'UNIDENTIFIED — MALE', summary: 'Warning — transmission {N19}, records room',
    stamp: at(27, 4, 26), offsetSec: 1 * H + 6 * MIN, future: true, alert: true,
    hail: [{ s: 'you_masked', t: '—Fourteen— listen—' }], hailGap: 4,
    script: {
      start: [
        { s: 'you_masked', t: 'Station Fourteen, listen carefully.' },
        { wait: 1 },
        { s: 'you_masked', t: 'Do not answer transmission {N19}.' },
        { s: 'you_masked', t: "And whatever happens, don't unlock the records room." },
        { choose: [
            { id: 'respond', t: 'Who is this? Say again?', next: 'answer' },
            logOpt('close'),
          ], timeout: 20, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_masked', t: 'No time. Please. Just don\'t.' },
        cut(),
        { end: true },
      ],
      close: [
        cut(),
        { end: true },
      ],
    },
  };

  tx.tx_18 = {
    freq: 162.55, bearing: 0, width: 0.05, strength: 0.75,
    sender: 'NOAA WX — WXM-62', summary: 'Forecast (incomplete)', future: false,
    script: {
      start: [
        { s: 'weather', t: 'NOAA Weather Radio, W-X-M sixty-two. An updated forecast for the county and surrounding high country.' },
        { s: 'weather', t: 'Tonight: rain. Heavy at times. Lows near forty.' },
        { s: 'weather', t: 'Winds northwest, fifteen to twenty-five.' },
        { s: 'weather', t: 'Sunrise tomorrow at—' },
        { sfx: 'radio_click', cap: '[the voice stops; the carrier stays up]', d: 6 },
        { end: true },
      ],
    },
  };

  tx.tx_girl_19 = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'UNIDENTIFIED — CHILD', summary: 'Girl asks for the operator by name',
    stampText: '27 OCT 1961 – 03:19', offsetSec: -(38 * YR + 9 * DAY), future: true, alert: true,
    hail: [{ s: 'girl', t: 'Hello?' }], hailGap: 6,
    waitLines: [
      { s: 'girl', t: 'Hello?' },
      { s: 'girl', t: 'Are you still there?' },
    ],
    script: {
      start: [
        { wait: 2 },
        { s: 'girl', t: 'Hello?', gap: 2.5 },
        { s: 'girl', t: 'My dad told me somebody would be listening.' },
        { wait: 1.5 },
        { s: 'girl', t: '{NAME}?', gap: 2 },
        { s: 'girl', t: "He said you're supposed to open the records room." },
        { goto: 'choice' },
      ],
      choice: [
        { choose: [
            { id: 'open', t: "Okay. I'll open it.", next: 'open' },
            { id: 'ignore', t: '[Ignore her.]', silent: true, next: 'ignore' },
            { id: 'question', t: "Who's your dad?", next: 'question' },
            { id: 'power_off', t: '[Turn off the receiver.]', silent: true, action: 'power_off', next: 'power_off' },
            { id: 'respond', t: 'This is Relay Station Fourteen. Who is this?', next: 'respond' },
          ], timeout: 45, onTimeout: 'silence' },
      ],
      question: [
        { s: 'girl', t: "He works at the station. He's working right now." },
        { goto: 'again' },
      ],
      again: [
        { choose: [
            { id: 'open', t: "Okay. I'll open it.", next: 'open' },
            { id: 'ignore', t: '[Ignore her.]', silent: true, next: 'ignore' },
            { id: 'power_off', t: '[Turn off the receiver.]', silent: true, action: 'power_off', next: 'power_off' },
            { id: 'respond', t: 'This is Relay Station Fourteen. Who is this?', next: 'respond' },
          ], timeout: 45, onTimeout: 'silence' },
      ],
      open: [
        { s: 'girl', t: 'Okay.' },
        { s: 'girl', t: "He said you'd say that." },
        cut(),
        { end: true },
      ],
      ignore: [
        { wait: 4 },
        { s: 'girl', t: 'Hello?' },
        { wait: 5 },
        { s: 'girl', t: "...I'll wait." },
        cut(),
        { end: true },
      ],
      power_off: [
        { end: true },
      ],
      respond: [
        { s: 'girl', t: "You sound like the man on my dad's tapes." },
        { s: 'girl', t: 'Bye.' },
        cut(),
        { end: true },
      ],
      silence: [
        { s: 'girl', t: 'Hello?', gap: 3 },
        { s: 'girl', t: 'Okay.' },
        cut(),
        { end: true },
      ],
    },
  };

  // #19 when she already called earlier tonight (the ordinary night, before it broke): never the same
  // words twice. Same sender, same impossible stamp.
  tx.tx_girl_19_again = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'UNIDENTIFIED — CHILD', summary: 'The girl again — the records room',
    stampText: '27 OCT 1961 – 03:19', offsetSec: -(38 * YR + 9 * DAY), future: true, alert: true,
    hail: [{ s: 'girl', t: "It's me again." }], hailGap: 6,
    waitLines: [
      { s: 'girl', t: 'Hello? You were there before.' },
      { s: 'girl', t: "I know you're there." },
    ],
    script: {
      start: [
        { wait: 1.5 },
        { s: 'girl', t: "It's me again.", gap: 2 },
        { s: 'girl', t: "You didn't open it." },
        { s: 'girl', t: '{NAME}, my dad says it has to be tonight. He says you always wait too long.' },
        { s: 'girl', t: "He said I'd have to call you twice. I didn't believe him." },
        { goto: 'choice' },
      ],
      choice: [
        { choose: [
            { id: 'open', t: "Okay. I'll open it.", next: 'open' },
            { id: 'ignore', t: '[Ignore her.]', silent: true, next: 'ignore' },
            { id: 'question', t: 'Who is your dad?', next: 'question' },
            { id: 'power_off', t: '[Turn off the receiver.]', silent: true, action: 'power_off', next: 'power_off' },
            { id: 'respond', t: 'This is Relay Station Fourteen. Who is this?', next: 'respond' },
          ], timeout: 45, onTimeout: 'silence' },
      ],
      question: [
        { s: 'girl', t: "You know him. He sits where you're sitting." },
        { goto: 'again' },
      ],
      again: [
        { choose: [
            { id: 'open', t: "Okay. I'll open it.", next: 'open' },
            { id: 'ignore', t: '[Ignore her.]', silent: true, next: 'ignore' },
            { id: 'power_off', t: '[Turn off the receiver.]', silent: true, action: 'power_off', next: 'power_off' },
            { id: 'respond', t: 'This is Relay Station Fourteen. Who is this?', next: 'respond' },
          ], timeout: 45, onTimeout: 'silence' },
      ],
      open: [
        { s: 'girl', t: 'Promise?' },
        { s: 'girl', t: "He said you'd promise." },
        cut(),
        { end: true },
      ],
      ignore: [
        { wait: 4 },
        { s: 'girl', t: "That's what you did last time." },
        cut(),
        { end: true },
      ],
      power_off: [
        { end: true },
      ],
      respond: [
        { s: 'girl', t: "You asked me that before. You sound tired now." },
        { s: 'girl', t: 'Bye.' },
        cut(),
        { end: true },
      ],
      silence: [
        { s: 'girl', t: 'Okay. I can wait. I waited before.' },
        cut(),
        { end: true },
      ],
    },
  };

  /* ---- pure-path temptation */

  tx.tx_future_you_faint = {
    freq: 148.32, bearing: null, width: 0.03, strength: 0.45,
    sender: 'UNIDENTIFIED — MALE', summary: 'Faint male voice, cut off',
    stamp: at(27, 4, 57), offsetSec: 52 * MIN, future: true, alert: true,
    hail: [{ s: 'you_masked', t: '...Fourteen...' }], hailGap: 7,
    script: {
      start: [
        { s: 'you_masked', t: '...Station Fourteen... if you can hear this...' },
        { wait: 1.5 },
        { s: 'you_masked', t: "...don't—" },
        { sfx: 'static_burst', cap: '[the signal breaks up]', d: 2 },
        { choose: [
            { id: 'respond', t: 'Say again? Who is this?', next: 'answer' },
            logOpt('close'),
          ], timeout: 25, onTimeout: 'close' },
      ],
      answer: [
        { wait: 2 },
        { sfx: 'radio_click', cap: '[carrier only]', d: 4 },
        { end: true },
      ],
      close: [
        { end: true },
      ],
    },
  };

  /* ----------------------------------------- ACT 3 — the other voices */

  tx.tx_calm_vent = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14 (OPERATOR)', summary: 'Instruction — basement ventilation duct',
    stamp: at(27, 5, 56), offsetSec: 2 * H + 11 * MIN, future: true, alert: true,
    hail: [{ s: 'you_calm', t: 'Station Fourteen, come in.' }], hailGap: 6,
    waitLines: [{ s: 'you_calm', t: "Take your time. I'm not going anywhere." }],
    script: {
      start: [
        { s: 'you_calm', t: 'Station Fourteen. Take a breath. You know this voice.' },
        { s: 'you_calm', t: 'Open the basement ventilation duct.' },
        { s: 'you_calm', t: "The boiler room, off the corridor at the bottom of the stairs. The grille on the back wall, left of the pipes. Four screws. The bottom left one's stripped. Pull, don't turn." },
        { s: 'you_calm', t: "There's a key inside. You'll need it for the door at the end of the basement." },
        { choose: [
            { id: 'respond', t: 'Who is this? How do you know that?', next: 'answer' },
            logOpt('close'),
          ], timeout: 30, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_calm', t: "You know who this is. I've just done tonight more times than you have." },
        { end: true },
      ],
      close: [
        { s: 'you_calm', t: "The duct. We'll talk again." },
        { end: true },
      ],
    },
  };

  tx.tx_panic_dont = {
    freq: 148.34, bearing: null, width: 0.05, strength: 0.7,
    sender: 'STATION 14 (OPERATOR)', summary: 'Contradicts previous instruction',
    stamp: at(27, 4, 26), offsetSec: 40 * MIN, future: true, alert: true,
    hail: [{ s: 'you_panic', t: 'Fourteen— Fourteen, are you there—' }], hailGap: 3,
    script: {
      start: [
        { s: 'you_panic', t: "Don't." },
        { s: 'you_panic', t: "Don't listen to him. He isn't you anymore." },
        { s: 'you_panic', t: "He's been down there too long. He talks like it. You hear how calm he is?" },
        { choose: [
            { id: 'respond', t: 'What happened to you?', next: 'answer' },
            logOpt('close'),
          ], timeout: 25, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_panic', t: 'I did what he said. Every time. And it worked. Every time. That\'s how it gets you.' },
        { end: true },
      ],
      close: [
        { s: 'you_panic', t: 'Please. Just— please.' },
        { end: true },
      ],
    },
  };

  tx.tx_injured = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.6,
    sender: 'STATION 14 (OPERATOR)', summary: 'Injured — "inside the station"',
    stamp: at(27, 4, 15), offsetSec: 15 * MIN, future: true, alert: true,
    hail: [{ s: 'you_injured', t: 'Fourteen—', cap: '[coughing]' }], hailGap: 5,
    script: {
      start: [
        { s: 'you_injured', t: 'Fourteen. Can you— hear me.', cap: '[coughing]' },
        { s: 'you_injured', t: "It's inside the station." },
        { s: 'you_injured', t: 'It came in when the lights went. I thought I had time.' },
        { s: 'you_injured', t: "Don't let the lights go out.", cap: '[coughing, wet]' },
        { choose: [
            { id: 'respond', t: 'Where are you? Are you hurt?', next: 'answer' },
            logOpt('close'),
          ], timeout: 25, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_injured', t: "Under the desk. Same as you'd be." },
        { sfx: 'breath_other', cap: '[a long breath]', d: 2.5 },
        { s: 'you_injured', t: "It's sitting in the chair." },
        { end: true },
      ],
      close: [
        { s: 'you_injured', t: "...don't let them go out.", cap: '[coughing]' },
        { end: true },
      ],
      // the director starts here when someone was saved tonight (DA.v('saved') > 0)
      start_saved: [
        { s: 'you_injured', t: 'Fourteen. Can you— hear me.', cap: '[coughing]' },
        { s: 'you_injured', t: "It's inside the station." },
        { s: 'you_injured', t: "You saved them. I did too. Every one you save leaves a door open somewhere." },
        { s: 'you_injured', t: "It comes in through the doors. It's bigger every time.", cap: '[coughing, wet]' },
        { s: 'you_injured', t: "Don't let the lights go out." },
        { goto: 'saved_choice' },
      ],
      saved_choice: [
        { choose: [
            { id: 'respond', t: 'Where are you? Are you hurt?', next: 'answer' },
            logOpt('close'),
          ], timeout: 25, onTimeout: 'close' },
      ],
    },
  };

  tx.tx_calm_time = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14 (OPERATOR)', summary: 'Instruction — antenna to 270° at {AT_TIME}',
    stamp: at(27, 7, 1), offsetSec: 2 * H + 11 * MIN, future: true, alert: true,
    hail: [{ s: 'you_calm', t: 'Station Fourteen.' }], hailGap: 6,
    waitLines: [{ s: 'you_calm', t: 'Watch the clock. Not me.' }],
    script: {
      start: [
        { s: 'you_calm', t: 'You found the key. Good. You see? You can trust this.' },
        { goto: 'instruct' },
      ],
      // the director starts here while the key is still in the duct
      start_nokey: [
        { s: 'you_calm', t: "The key's still in the duct. That's all right. It'll keep." },
        { goto: 'instruct' },
      ],
      instruct: [
        { s: 'you_calm', t: 'Now. At {AT_TIME}, turn the antenna to two-seven-zero. Due west.' },
        { s: 'you_calm', t: "Not before. Not after. Leave it there till the minute's out." },
        { choose: [
            { id: 'respond', t: 'Why? What happens at {AT_TIME}?', next: 'answer' },
            logOpt('close'),
          ], timeout: 25, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_calm', t: "You'll hear it. Watch the clock." },
        { end: true },
      ],
      close: [
        { s: 'you_calm', t: '{AT_TIME}. Two-seven-zero.' },
        { end: true },
      ],
    },
  };

  tx.tx_calm_generator = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14 (OPERATOR)', summary: 'Instruction — backup generator',
    stamp: at(27, 6, 16), offsetSec: 2 * H + 11 * MIN, future: true, alert: true,
    hail: [{ s: 'you_calm', t: 'Station Fourteen.' }], hailGap: 6,
    script: {
      start: [
        { s: 'you_calm', t: 'Now the door. The one at the end of the basement.' },
        { s: 'you_calm', t: 'Turn off the backup generator.' },
        { s: 'you_calm', t: "The interlock on antenna control won't release while it's running." },
        { s: 'you_calm', t: "Take the flashlight from the workshop bench first. You'll want it." },
        { s: 'you_calm', t: "The lights will go. That's expected. The emergency lamps come on by themselves." },
        { choose: [
            { id: 'respond', t: 'What happens when the lights go out?', next: 'answer' },
            logOpt('close'),
          ], timeout: 30, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_calm', t: "It gets dark. That's all. You'll be fine." },
        { end: true },
      ],
      close: [
        { s: 'you_calm', t: 'The flashlight. The generator. Then the door.' },
        { end: true },
      ],
    },
  };

  tx.tx_new_hallway = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.75,
    sender: 'STATION 14 (OPERATOR)', summary: 'Warning — new hallway',
    stamp: at(27, 4, 19), offsetSec: -60, future: true,
    script: {
      start: [
        { s: 'you_panic', t: 'Do not go into the new hallway.' },
        { wait: 2.5 },
        { s: 'you_panic', t: "It doesn't come out where it goes in." },
        cut(),
        { end: true },
      ],
    },
  };

  tx.tx_old_you_1 = {
    freq: 148.32, bearing: null, width: 0.04, strength: 0.65,
    sender: 'STATION 14 (OPERATOR)', summary: 'Elderly male — "go down"',
    stampText: '27 OCT 2040 – 03:12', offsetSec: 41 * YR + 11 * DAY, future: true, alert: true,
    hail: [{ s: 'you_old', t: 'Station Fourteen...' }], hailGap: 8,
    waitLines: [{ s: 'you_old', t: "Take your time. I'll wait." }],
    script: {
      start: [
        { s: 'you_old', t: "There. That's better. You always did tune a little high.", alt: "There. That's better. You always did come in a little high." },
        { s: 'you_old', t: "Don't be frightened. I know how this sounds. I know exactly how it sounds." },
        { s: 'you_old', t: "The photograph in the kitchen. There are four of them now. You don't remember the fourth." },
        { s: 'you_old', t: 'Look closer. The fourth one is you.', gap: 2 },
        { s: 'you_old', t: "There's a room past the generator. Antenna control. That's where the real station is." },
        { s: 'you_old', t: "Go down. See what's under us." },
        { choose: [
            { id: 'respond', t: 'How do you know all this?', next: 'answer' },
            logOpt('close'),
          ], timeout: 35, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_old', t: 'Forty-one years in that chair. You learn where everything is.' },
        { end: true },
      ],
      close: [
        { s: 'you_old', t: "Go down. I'll be here. I'm always here." },
        { end: true },
      ],
    },
  };

  /* ------------------------------------------------- ACT 4 — the array */

  tx.tx_old_you_twist = {
    freq: 148.32, bearing: null, width: 0.04, strength: 0.7,
    sender: 'STATION 14 (OPERATOR)', summary: 'Elderly male — the operators are chosen',
    stampText: '27 OCT 2040 – 04:58', offsetSec: 41 * YR + 11 * DAY, future: true, alert: true,
    hail: [{ s: 'you_old', t: "It's me again." }], hailGap: 8,
    script: {
      start: [
        { s: 'you_old', t: "It's me again. You've been down there now. You've seen it." },
        { s: 'you_old', t: "So I'll tell you the rest, {NAME}. You were never randomly assigned this shift." },
        { s: 'you_old', t: 'Nobody is. Every operator this station ever had was chosen.' },
        { s: 'you_old', t: 'Every one of them turns up on a recording. Made before they were born.' },
        { s: 'you_old', t: "Your voice is on a reel from 1961. Long before there was a you to make it." },
        { s: 'you_old', t: "The station predicts who'll work here. The people who keep it don't choose anybody." },
        { s: 'you_old', t: 'They listen to the tapes. Then they make sure those people arrive.' },
        { s: 'you_old', t: 'The scholarship. The transfer. The phone call asking if you could cover tonight.' },
        { s: 'you_old', t: "Your whole life was a road to that chair. I'm sorry. I found out the same way.", gap: 2 },
        { s: 'you_old', t: 'One more thing. The tape terminal. Every archive is a whole night, still running.' },
        { s: 'you_old', t: "When you load one, you don't go back. You choose it. The rest go on without you." },
        { choose: [
            { id: 'respond', t: 'Then what am I supposed to do?', next: 'answer' },
            logOpt('close'),
          ], timeout: 35, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_old', t: "Whatever they didn't plan for. That's all any of us ever had." },
        { end: true },
      ],
      close: [
        { s: 'you_old', t: '...All right. You always did like to find things out yourself.' },
        { end: true },
      ],
    },
  };

  tx.tx_your_death = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.75,
    sender: 'STATION 14 (OPERATOR)', summary: 'Operator distress call (archived)',
    stampText: '{DEATH_STAMP}', offsetText: '--:--:--', future: true, alert: true,
    hail: [{ s: 'you', t: 'Station Fourteen? Is anybody there?' }], hailGap: 5,
    script: {
      start: [
        { sfx: 'static_burst', cap: '[static]', d: 1.5 },
        { s: 'you', t: 'Station Fourteen? Is anybody there?' },
        { s: 'you', t: "I'm in the {DEATH_ROOM}. It's in here with me." },
        { sfx: 'static_burst', cap: '[{DEATH_LINE}]', d: 3 },
        { s: 'you', t: "It's {DEATH_TIME}. If you're hearing this, I didn't—" },
        { sfx: 'static_burst', cap: '[the signal cuts out]', d: 2 },
        { end: true },
      ],
    },
  };

  /* ---------------------------------------------- ACT 5 — collapse */

  tx.tx_panic_destroy = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14 (OPERATOR)', summary: 'Instruction — destroy the array',
    stamp: at(27, 5, 30), offsetSec: 9 * MIN, future: true, alert: true,
    hail: [{ s: 'you_panic', t: 'Are you there? Are you—' }], hailGap: 3,
    script: {
      start: [
        { s: 'you_panic', t: 'Are you there? Are you— okay. Okay. Listen.' },
        { s: 'you_panic', t: 'Destroy it. Get the generator back on and go down to the array.' },
        { s: 'you_panic', t: 'Three limiters, out on the far catwalks. Pull all three, then overload it from the console.' },
        { s: 'you_panic', t: "You'll have about a minute and a half. Run. Don't stop for anything." },
        { s: 'you_panic', t: "Don't listen to the old man. He's been in that chair so long he thinks it's his." },
        { choose: [
            { id: 'respond', t: 'Did it work? When you did it?', next: 'answer' },
            logOpt('close'),
          ], timeout: 30, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_panic', t: 'It stopped. For me, it stopped.', gap: 2 },
        { s: 'you_panic', t: "That's all I know." },
        { end: true },
      ],
      close: [
        { s: 'you_panic', t: 'Please. Burn it.' },
        { end: true },
      ],
    },
  };

  tx.tx_old_maintain = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.75,
    sender: 'STATION 14 (OPERATOR)', summary: 'Elderly male — keep the channel open',
    stampText: '27 OCT 2040 – 06:40', offsetSec: 41 * YR + 11 * DAY, future: true, alert: true,
    hail: [{ s: 'you_old', t: 'Fourteen. Easy now.' }], hailGap: 8,
    script: {
      start: [
        { s: 'you_old', t: "Don't burn it. And don't open that door." },
        { s: 'you_old', t: "Somebody sits in that chair every night. That's all the station has ever needed." },
        { s: 'you_old', t: 'Key the mic on one-four-eight point three-two. Say it once. Keep the channel open.' },
        { s: 'you_old', t: 'Then hold the carrier till the sun comes up. It will come up. I promise.' },
        { s: 'you_old', t: "In the morning somebody will come. And you'll tell them what Hollis told you." },
        { choose: [
            { id: 'respond', t: 'And then what?', next: 'answer' },
            logOpt('close'),
          ], timeout: 35, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_old', t: "Then it's their night. And you drive home in the rain." },
        { end: true },
      ],
      close: [
        { s: 'you_old', t: 'Somebody has to. It might as well be someone who knows.' },
        { end: true },
      ],
    },
  };

  tx.tx_calm_open = {
    freq: 148.32, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14 (OPERATOR)', summary: 'Instruction — open the relay chamber',
    stamp: at(27, 7, 41), offsetSec: 2 * H + 11 * MIN, future: true, alert: true,
    hail: [{ s: 'you_calm', t: 'Station Fourteen. Listen to me, not them.' }], hailGap: 6,
    script: {
      start: [
        { s: 'you_calm', t: "Listen to me, not them. They're both right. It doesn't matter." },
        { s: 'you_calm', t: "Destroy it and it goes on everywhere else. Keep it and you sit in that chair until you're him." },
        { s: 'you_calm', t: "There's a third way. The steel door behind the racks. The relay chamber." },
        { s: 'you_calm', t: "Zero-two-one-three. You've seen it on the wall. On camera four." },
        { s: 'you_calm', t: 'Open the channel all the way. Every one of us, at once. Then it has nowhere left to stand.' },
        { choose: [
            { id: 'respond', t: 'What happens to me?', next: 'answer' },
            logOpt('close'),
          ], timeout: 30, onTimeout: 'close' },
      ],
      answer: [
        { s: 'you_calm', t: "You wake up in daylight. I've seen it." },
        { end: true },
      ],
      close: [
        { s: 'you_calm', t: "Zero-two-one-three. You'll remember." },
        { end: true },
      ],
    },
  };

  tx.tx_you_now = {
    freq: 148.32, bearing: null, width: 0.05, strength: 1.0,
    sender: 'STATION 14 (OPERATOR)', summary: 'Operator — no offset',
    stampNow: true, offsetSec: 0, offsetText: '+00:00:00', future: false, alert: true,
    hail: [{ s: 'you_now', t: 'Station Fourteen, this is Station Fourteen.' }], hailGap: 5,
    script: {
      start: [
        { s: 'you_now', t: 'Station Fourteen, this is Station Fourteen.' },
        { s: 'you_now', t: 'No offset. You see it. Zeroes, all the way across.' },
        { s: 'you_now', t: "I'm at the desk. The mug's cold. The chair pulls to the left." },
        { s: 'you_now', t: "I'm looking at the window. So are you." },
        { choose: [
            { id: 'respond', t: 'Who is this?', next: 'answer', interfere: false },
            logOpt('close'),
          ], timeout: 30, onTimeout: 'close' },
      ],
      answer: [
        // (your own words come back from the speaker at the same instant — you_realtime)
        { wait: 2.4 },
        { s: 'you_now', t: 'Yeah.' },
        { end: true },
      ],
      close: [
        { s: 'you_now', t: "You're not going to answer. I know. I didn't either." },
        { end: true },
      ],
    },
  };

  tx.tx_keep_channel = {
    freq: 148.32, bearing: null, width: 0.06, strength: 0.9, loop: true, loopGap: 4,
    sender: 'UNKNOWN', summary: 'Carrier — repeating voice',
    stampText: 'NULL', offsetText: '--:--:--', future: false,
    script: {
      start: [
        { s: 'keep_open', t: 'KEEP THE CHANNEL OPEN.' },
        { wait: 4 },
        { s: 'keep_open', t: 'KEEP THE CHANNEL OPEN.' },
        { wait: 4 },
        { s: 'keep_open', t: 'KEEP THE CHANNEL OPEN.' },
        { end: true },
      ],
    },
  };

  tx.tx_radio_check_2049 = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.8,
    sender: 'STATION 14', summary: 'Radio check',
    stampText: '27 OCT 1999 – 00:04', offsetSec: -(50 * YR + 13 * DAY), future: false, alert: true,
    hail: [{ s: 'you', t: 'Station Fourteen, radio check.' }], hailGap: 6,
    script: {
      start: [
        { s: 'you', t: 'Station Fourteen, radio check.' },
        { choose: [
            { id: 'respond', t: 'Station Fourteen. Loud and clear.', next: 'done', interfere: false },
          ], timeout: 30, onTimeout: 'again' },
      ],
      again: [
        { wait: 5 },
        { goto: 'start' },
      ],
      done: [
        { end: true },
      ],
    },
  };

  /* ---------------------------------------------- pure-path routine traffic */

  tx.tx_generic_nothing = {
    freq: 155.34, bearing: null, width: 0.05, strength: 0.95, noLock: true,
    sender: 'COUNTY DISPATCH', summary: 'Reported location — nothing found', future: false,
    script: {
      start: [
        { s: 'dispatch', t: 'Station Fourteen, County.' },
        { s: 'dispatch', t: 'Six went out to what you gave us.' },
        { s: 'dispatch', t: "Nothing. Nobody hurt, nothing wrong. Everybody out that way's asleep." },
        { s: 'dispatch', t: "You want to tell me where you're getting this, Fourteen?" },
        { wait: 4 },
        { s: 'dispatch', t: '...County clear.' },
        { end: true },
      ],
    },
  };

  tx.tx_pure_cb_1 = {
    freq: 27.18, bearing: 90, width: 0.05, strength: 0.7,
    sender: 'CB 19', summary: 'CB — traffic chatter', future: false,
    script: {
      start: [
        { s: 'trucker_2', t: 'Breaker one-nine. Anybody northbound got a twenty on a bear?' },
        { s: 'trucker', t: "Negative on the bear, driver. He's sitting on that tree down on 9." },
        { s: 'trucker_2', t: 'Ten-four. Keep the shiny side up.' },
        { end: true },
      ],
    },
  };

  tx.tx_pure_cb_2 = {
    freq: 27.18, bearing: 90, width: 0.05, strength: 0.75,
    sender: 'CB 19 — "COLDWATER"', summary: 'CB — Coldwater back on the road', future: false,
    script: {
      start: [
        { s: 'trucker', t: "Coldwater, back rolling. Wrecker out of Pine Hollow got me changed out." },
        { s: 'trucker', t: 'Somebody out there called it in for me. Thanks to whoever that was.' },
        { s: 'trucker', t: "Coldwater's gone." },
        { end: true },
      ],
    },
  };

  tx.tx_pure_police_2 = {
    freq: 155.47, bearing: 180, width: 0.05, strength: 0.8,
    sender: 'SHERIFF UNIT 6 / COUNTY', summary: 'Unit 6 sanding Harlan Creek bridge', future: false,
    script: {
      start: [
        { s: 'police', t: "County, Six. I'm out at the Harlan Creek bridge with the sand truck. Deck's getting slick." },
        { s: 'dispatch', t: 'Copy, Six. Take your time.' },
        { s: 'police', t: 'Ten-four. Six clear.' },
        { end: true },
      ],
    },
  };

  // the ordinary night's last stretch before the dawn: the sheriff going off nights
  tx.tx_pure_police_3 = {
    freq: 155.47, bearing: 180, width: 0.05, strength: 0.8,
    sender: 'SHERIFF UNIT 6 / COUNTY', summary: 'Unit 6 off nights', future: false,
    script: {
      start: [
        { s: 'police', t: "County, Six. Bridge is sanded. I'm heading in." },
        { s: 'dispatch', t: "Copy, Six. Day shift's on at seven." },
        { s: 'police', t: "Ten-four. Getting grey out east. Six clear." },
        { end: true },
      ],
    },
  };

  /* ============================================================ outgoing */
  // label: the short gist the mic panel shows for traffic queued on another frequency
  // ("027.18 · CB 19 — warn CB traffic about the bridge  TUNE ▸").
  const outgoing = {
    out_radio_check:          { freq: 155.34, once: true, label: 'radio check with County', text: 'County, Station Fourteen, radio check.' },
    out_dispatch_flat:        { freq: 155.34, once: true, label: "relay the trucker's blown tire to County", text: 'County, Station Fourteen. Relay from CB one-nine: northbound tractor-trailer, blown tire, Route 9 at mile marker two-zero. Requesting a tow.' },
    out_report_kestrel:       { freq: 155.34, once: true, future: true, label: 'report the rollover on Kestrel Road', text: 'County, Station Fourteen. Single-vehicle rollover, Kestrel Road past the quarry turnoff, green mile marker one-four. Female driver trapped.' },
    out_warn_fire:            { freq: 155.34, once: true, future: true, label: 'send County to 14 Alder Lane', text: 'County, Station Fourteen. Request a unit to fourteen Alder Lane, Pine Hollow. Possible fire hazard. Children in the house.' },
    out_warn_bridge:          { freq: 27.18,  once: true, future: true, label: 'warn CB traffic about the bridge', text: 'Breaker one-nine, Relay Station Fourteen. Harlan Creek bridge on Route 9 is iced. Stop at the top of the grade.' },
    out_warn_bridge_dispatch: { freq: 155.34, once: true, future: true, label: 'ask County for a unit at the bridge', text: 'County, Station Fourteen. Request a unit to the Harlan Creek bridge on Route 9. Deck is iced. Somebody is going to get hurt.' },
    out_keep_channel_open:    { freq: 148.32, once: true, label: 'keep the channel open', text: 'KEEP THE CHANNEL OPEN.' },
    out_respond_2049:         { freq: 155.34, once: true, label: 'answer the radio check', text: 'Station Fourteen. Loud and clear.' },
  };

  /* ============================================================ room feed */
  // Heard on 014.00. Each step plays through the radio at `at`; its event fires at `at + offset`.
  const roomfeed = {
    rf_chair: { offset: 7, steps: [
      { at: 0, cap: '[chair scraping]', sfx: 'chair_scrape', event: 'chair_move' },
    ] },
    rf_glass: { offset: 7, steps: [
      { at: 0, cap: '[glass breaking]', sfx: 'glass_break', event: 'jar_fall' },
    ] },
    // the dark: +12 it is inside (the front door, then footsteps in the hall), +16 closer, +21 the
    // radio-room door handle — the director times the entity's walk to arrive on these seconds
    rf_hide: { offset: 12, steps: [
      { at: 0, cap: '[the front door; footsteps in the hall]', sfx: 'footstep_other', event: 'hide_steps' },
      { at: 4, cap: '[footsteps, closer]', sfx: 'footstep_other', event: 'hide_steps_near' },
      { at: 9, cap: '[the radio room door handle, turning]', sfx: 'door_locked', event: 'hide_handle' },
    ] },
    rf_leaving: { offset: 194, steps: [
      { at: 0,  s: 'you', t: "Okay. I'm leaving the station.", event: 'leave_voice' },
      { at: 4,  cap: '[footsteps]', sfx: 'footstep_other', event: 'leave_steps' },
      { at: 9,  cap: '[a door opens]', sfx: 'door_open', event: 'leave_door' },
      { at: 12, cap: '[silence]', event: 'leave_silence' },
      { at: 21, s: 'you', t: 'Oh God.', cap: '[faint]', event: 'leave_ohgod' },
      { at: 24, cap: '[running]', sfx: 'footstep_other', event: 'leave_run' },
      { at: 28, cap: '[something hits the front door]', sfx: 'impact', event: 'leave_impact' },
      { at: 30, cap: '[screaming]', sfx: 'scream_distant', event: 'leave_scream' },
    ] },
    rf_why: { offset: 20, steps: [
      { at: 0,  s: 'you', t: "Why didn't you leave?", event: 'why_1' },
      { at: 10, s: 'you', t: 'It knows you heard the first one.', event: 'why_2' },
      { at: 15, s: 'you', t: "Don't look at the window.", event: 'why_3' },
    ] },
    rf_keep_1: { offset: 12, steps: [
      { at: 0, cap: '[the door handle, turning slowly]', sfx: 'door_locked', event: 'keep_door' },
    ] },
    rf_keep_2: { offset: 10, steps: [
      { at: 0, cap: '[footsteps in the hall, stopping outside]', sfx: 'footstep_other', event: 'keep_hall' },
    ] },
    rf_keep_3: { offset: 15, steps: [
      { at: 0, cap: '[breathing, right behind the chair]', sfx: 'breath_other', event: 'keep_breath' },
    ] },
    rf_keep_4: { offset: 11, steps: [
      { at: 0, cap: '[the handle again. Harder.]', sfx: 'door_locked', event: 'keep_door_2' },
    ] },
    // README "OFFSET: −00:00:04. You're receiving something that already happened. But you didn't
    // hear it happen." The director has already moved the door (unseen) when these play.
    rf_past_close: { offset: -4, steps: [
      { at: 0, cap: '[the radio room door, swinging shut]', sfx: 'door_close', event: 'past_door' },
    ] },
    rf_past_open: { offset: -4, steps: [
      { at: 0, cap: '[the radio room door, opening]', sfx: 'door_open', event: 'past_door' },
    ] },
  };

  /* =============================================================== notes */
  // Found folded inside the station's ventilation ducts. Several notes can share a vent.
  const DONT_TRUST = "DON'T TRUST THE VERSION OF YOU WHO KNOWS TOO MUCH.";
  const notes = {
    note_1: {
      title: 'Note — 14 NOV 79', date: '14 NOV 1979', author: 'E. Marsh', where: 'vent_office',
      text: "14 NOV 79 — Third week.\n\nChair was turned round to face the door when I came back from the head. I did not turn it.\n\nWriting things down now so I can check them against themselves.\n\nMUG — kitchen. OFFICE DOOR — shut. PHOTO — three of us.\n\nCheck again at 0300.  — E.M.",
    },
    note_2: {
      title: 'Note — 2 FEB 81', date: '2 FEB 1981', author: 'E. Marsh', where: 'vent_kitchen',
      text: "2 FEB 81\n\nHeard myself on 148 again. Older. He knew the date of my mother's funeral before the hospital rang.\n\nI did not answer him. I will not answer him.\n\n" + DONT_TRUST,
    },
    note_3: {
      title: 'Note — 19 AUG 83', date: '19 AUG 1983', author: 'E. Marsh', where: 'vent_hall',
      text: "19 AUG 83\n\nA man from Region came about the heating. He had my file under his arm. It says I resigned in November 79.\n\nI have not resigned. I am here. I signed the sheet tonight.\n\nGo and look at the sheet.",
    },
    note_4: {
      title: 'Note — to whoever opens this vent', date: 'JUN 1985', author: 'D. Okafor', where: 'vent_bath',
      text: "To whoever opens this vent next —\n\nD. Okafor, nights, since March 84.\n\nMarsh's notes are in every duct in this building. Most of them are nonsense. Read them anyway.\n\nI've started recording mine instead. The tapes are in Records, if you ever get in.\n\nDon't let it make you want to get in.",
    },
    note_5: {
      title: 'Note — 27 OCT 88', date: '27 OCT 1988', author: 'E. Marsh', where: 'vent_workshop',
      text: "27 OCT 88\n\nIt is always the 27th when it goes bad.\n\nClock says 0750. Black as pitch outside. Weather panel says sunrise --:--.\n\nCounted the lights in the hall. Eleven. There are nine fixtures. I checked the drawings.\n\n" + DONT_TRUST,
    },
    note_6: {
      title: 'Note — R.V. 3/91', date: 'MAR 1991', author: 'R. Vance', where: 'vent_storage',
      text: "R.V. — 3/91\n\nI'm the one who drives away. You'll hear about me.\n\nThe road bends back. Every road. I tried four.\n\nDon't take the woods either. The woods come out in this cupboard. I'm writing this in the cupboard.\n\nIf you find this I probably didn't make it. I don't know. I can't tell any more.",
    },
    note_7: {
      title: 'Note — OCT 94', date: 'OCT 1994', author: 'E. Marsh', where: 'vent_b1',
      text: "OCT 94\n\nFifteen years. Records say I left in 79.\n\nThe photo in the kitchen has four of us in it tonight. Yesterday three.\n\nI think the fourth is whoever comes next. I think he is already here.\n\n" + DONT_TRUST + "\n\nHE WAS HERE FIRST.",
    },
    note_8: {
      title: 'Note — 12 JAN 97', date: '12 JAN 1997', author: 'E. Marsh', where: 'vent_office',
      text: "12 JAN 97\n\nStopped the generator once, to see. I know. I know.\n\nLights went. Something came in. I got under the desk.\n\nIt sat in my chair, right above me. It didn't do anything. It listened to the radio.\n\nIt listens. Like we do.\n\n" + DONT_TRUST,
    },
    note_9: {
      title: 'Note — 9 NOV 63', date: '9 NOV 1963', author: 'unsigned', where: 'vent_hall',
      text: "9 NOV 63\n\nThey switched it off at 0300 for eleven minutes.\n\nThe birds came down all over the lot. Harlan's cattle in the low field. Two of the survey men gone out of a lit truck.\n\nWe switched it back on.\n\nSomebody has to sit with it now. Every night. Every night.",
    },
    // README: "hundreds of handwritten notes inside ventilation ducts. Most are paranoid nonsense."
    // One duct is packed solid with them: a wad of torn slips, read as one long page.
    note_wad: {
      title: 'Notes — a wad of folded slips', date: '1979 – 1994', author: 'E. Marsh', where: 'vent_kitchen',
      text: [
        'The duct is packed with them. Dozens. Torn from the log pad, folded small, some folded so many times the pencil has worn through.',
        '— lights in the hall: 9. 9. 9. 11. 9. 9. 10.',
        '— MUG KITCHEN. MUG KITCHEN. MUG RADIO. MUG KITCHEN.',
        "— " + DONT_TRUST,
        '— 0213 0213 0213 (crossed out) (crossed out again)',
        "— the chair is warm when I come back. I have been gone 4 min. It is warm.",
        '— do not write the date. it reads what you write.',
        '— 27th 27th 27th 27th 27th 27th 27th',
        "— he came in at 0300 and stood in the hall and I did not look and he went away",
        '— SUNRISE 0642. SUNRISE 0719. SUNRISE 0801. SUNRISE --:--',
        '— the stair has 14 steps. counted 15 going down. 14 coming up.',
        "— " + DONT_TRUST,
        '— the knocks are always three.',
        "— Region called. I did not call Region. The phone doesn't dial out.",
        '— count the people in the kitchen photograph. then count them again tomorrow.',
        "— my handwriting on this one. I didn't write this one.",
        '— the rain has not stopped since 1979',
        '— Hollis? who is Hollis. (later, different pen:) he has always been here',
        "— " + DONT_TRUST,
        '— the steel door behind the racks is not on the drawings. the drawings are not wrong.',
        "— it listens to the radio like we do. it likes the weather.",
        '— 148.32 148.32 148.32 do not do not do not',
        '— the woman in the car is always the same woman.',
        '— DON\'T TRUST THE VERSION OF YOU WHO KNOWS TOO MUCH (I KNOW TOO MUCH)',
        '— if the offset says minus it already happened. it happened while you watched.',
        '— the generator is not a generator',
        "— " + DONT_TRUST,
        '— E.M. E.M. E.M. still here',
      ].join('\n\n'),
    },
    note_10: {
      title: 'Note — in your handwriting', date: '27 OCT 1999', author: 'you', where: 'vent_basement',
      text: "27 OCT 99\n\nYou opened the duct because he told you to. He was right about the key.\n\nHe'll be right about the next thing too. That's how it works.\n\n" + DONT_TRUST,
    },
  };

  /* =============================================================== tapes */
  const tapes = {
    tape_1954: {
      label: 'LONGWAVE — RUN 7 — 1954', year: 1954, stamp: '12 MAR 1954 – 03:40',
      desc: 'Quarter-inch reel. Typed label: LONGWAVE / GRANITE PULSE / RUN 7. Someone has underlined 4.1 ms twice.',
      lines: [
        { sfx: 'tape_play', cap: '[tape hiss; a room of humming equipment]', d: 2 },
        { s: 'researcher_a', t: 'Longwave, run seven. Twelfth of March, fifty-four. Pulse out on my mark.' },
        { sfx: 'beep', cap: '[a sharp electronic tick]', d: 1 },
        { s: 'researcher_b', t: 'Got it. And... there. The receive trace is ahead of the send trace.' },
        { s: 'researcher_a', t: "Ahead? That's cable delay. You've got it backwards on the scope." },
        { s: 'researcher_b', t: 'I swapped the leads twice. It arrives before we send it. Four milliseconds.' },
        { cap: '[paper, a chair, somebody laughing once]', d: 2 },
        { s: 'researcher_a', t: 'Through four hundred feet of granite.' },
        { s: 'researcher_b', t: 'Do it again.' },
        { sfx: 'beep', cap: '[tick]', d: 1 },
        { s: 'researcher_b', t: 'Four point one. Every time.' },
        { s: 'researcher_a', t: 'Write it down. Write down the time. Somebody wake up the Colonel.' },
        { sfx: 'tape_stop', cap: '[click]', d: 1 },
      ],
    },
    tape_1932: {
      label: 'SURVEY CAMP 3 — 1932', year: 1932, stamp: '27 OCT 1932',
      desc: 'Transfer to tape from an aluminium home-recording disc. Card: "Kestrel Ridge survey. Private collection, Pine Hollow."',
      lines: [
        { cap: '[surface noise, a steady crackle]', d: 2 },
        { s: 'amateur', t: 'Test. Survey Camp Three, Kestrel Ridge. Twenty-seventh October, nineteen thirty-two.' },
        { s: 'amateur', t: 'Recording the interference for the Bureau, as asked. It comes up out of the ground here.' },
        { cap: '[a low tone, rising and falling]', d: 3 },
        { s: 'amateur', t: 'The needles swing all night. The men won\'t sleep in the tent with the set.' },
        { s: 'amateur', t: 'Last night there were words in it.' },
        { sfx: 'static_burst', cap: '[the tone breaks into static]', d: 1.5 },
        { s: 'keep_open', t: 'KEEP THE CHANNEL OPEN.' },
        { s: 'amateur', t: '...There. You heard that. Somebody tell me you heard that.' },
        { s: 'keep_open', t: 'KEEP THE CHANNEL OPEN.' },
        { s: 'amateur', t: 'This is a survey party. Identify yourself. Who is this?' },
        { cap: '[the recording ends mid-groove]', d: 2 },
      ],
    },
    tape_1901: {
      label: 'PINE HOLLOW BELL — 1901', year: 1901, stamp: '27 OCT 1901',
      desc: 'Transfer from a wax cylinder. The case is warped with damp. Pencil on the lid: "the new bell. rain."',
      lines: [
        { cap: '[cylinder hiss, loud and uneven]', d: 2 },
        { s: 'recordist', t: 'The new bell at Pine Hollow. October the twenty-seventh, nineteen hundred and one. It is raining.' },
        { sfx: 'ringing', cap: '[a church bell, far off]', d: 3 },
        { cap: '[rain]', d: 3 },
        { sfx: 'ringing', cap: '[the bell again]', d: 3 },
        { s: 'woman', t: 'Hello?... Is anybody there?' },
        { s: 'recordist', t: '...Who spoke? Is someone in the tower?' },
        { sfx: 'ringing', cap: '[the bell]', d: 2 },
        { s: 'woman', t: 'Is it still raining where you are?' },
        { cap: '[hiss; the cylinder runs out]', d: 2 },
      ],
    },
    tape_1887: {
      label: '1887', year: 1887, stamp: '27 OCT 1887 – 03:02',
      desc: 'No source listed. A receiver stamp is inked on the leader: 27 OCT 1887 – 03:02. Radio did not exist in 1887.',
      lines: [
        { cap: '[a long stretch of nothing]', d: 3 },
        { cap: '[rain]', d: 3 },
        { sfx: 'ringing', cap: '[a bell, once]', d: 2.5 },
        { cap: '[rain]', d: 3 },
        { sfx: 'creak', cap: '[a chair creaks, close to the microphone]', d: 1.5 },
        { s: 'you', t: 'Station Fourteen, radio check.' },
        { cap: '[rain]', d: 3 },
        { s: 'you', t: 'Station Fourteen, radio check.' },
        { cap: '[nothing answers]', d: 3 },
        { cap: '[the tape runs out]', d: 1.5 },
      ],
    },
    tape_first_contact: {
      label: 'FIRST CONTACT', year: 1957, stamp: '27 OCT 1957 – 02:13',
      desc: 'Reel in a steel can. Label typed and then struck through, with FIRST CONTACT written over it by hand.',
      lines: [
        { sfx: 'tape_play', cap: '[tape hiss; fans; a relay clicking]', d: 2 },
        { s: 'researcher_a', t: 'Array test four. Full power. Listening on the long channel.' },
        { sfx: 'static_burst', cap: '[static, rising]', d: 2 },
        { s: 'researcher_b', t: "There's a carrier. Bearing is... Walt, the bearing is straight down." },
        { s: 'first_contact', t: '—can you hear me? Array test four, can you hear me?' },
        { s: 'researcher_a', t: 'Who is on this channel? Identify yourself.' },
        { s: 'first_contact', t: "Walt, it's you. It's me. Listen. Write down what I say." },
        { cap: '[a long silence]', d: 3 },
        { s: 'researcher_b', t: "Walt. That's your voice." },
        { s: 'first_contact', t: "Don't build the second array." },
        { s: 'researcher_a', t: 'Turn it off. Turn the recorder off.' },
        { cap: '[the recorder keeps running]', d: 2 },
        { s: 'first_contact', t: "You're going to build it anyway. I did." },
        { sfx: 'tape_stop', cap: '[click]', d: 1 },
      ],
    },
    tape_do_not_duplicate: {
      label: 'DO NOT DUPLICATE', year: 1971, stamp: '27 OCT 1971',
      desc: 'Red reel. The label says only DO NOT DUPLICATE. The box is marked ARCHIVE COPY 1 OF 1.',
      lines: [
        { sfx: 'tape_play', cap: '[tape hiss]', d: 1.5 },
        { s: 'researcher_b', t: 'This recording is not to be duplicated. Archive copy only.' },
        { s: 'researcher_b', t: 'We believed the reel archive was a record of what the array received.' },
        { s: 'researcher_b', t: 'It is not a record. Each reel holds a complete state. A night, as it was.' },
        { s: 'researcher_a', t: 'A save point.' },
        { s: 'researcher_b', t: "A timeline. When we load one we don't go back to it. We choose it." },
        { s: 'researcher_b', t: 'The others keep going without us.' },
        { s: 'researcher_a', t: 'How many have we loaded?' },
        { s: 'researcher_b', t: 'Two hundred and eleven.' },
        { cap: '[a long pause]', d: 3 },
        { s: 'researcher_a', t: 'And the ones we left?' },
        { s: 'researcher_b', t: "They're still on the channel. That's who we hear." },
        { sfx: 'tape_stop', cap: '[click]', d: 1 },
      ],
    },
    tape_name: {
      label: '{NAME_UP}', year: 1961, stamp: '27 OCT 1961 – 02:40',
      desc: 'Reel, 1961. The label is your name, typed on a government typewriter. LONGWAVE session 9.',
      lines: [
        { sfx: 'tape_play', cap: '[tape hiss; a clock ticking in the room]', d: 2 },
        { s: 'interviewer', t: 'Session nine. Twenty-seventh October, nineteen sixty-one. Subject is on the long channel.' },
        { s: 'interviewer', t: 'Can you state your name?' },
        { s: 'you_recorded', t: '{NAME}.' },
        { s: 'interviewer', t: 'Where are you?' },
        { s: 'you_recorded', t: "Relay Station Fourteen. The radio room. It's raining." },
        { s: 'interviewer', t: "There is no Station Fourteen. What's the date where you are?" },
        { s: 'you_recorded', t: 'The twenty-seventh of October, 1999. Just after two.' },
        { s: 'interviewer', t: 'And what happens tonight?' },
        { s: 'you_recorded', t: "A woman calls. I answer her. After that, it's up to me." },
        { s: 'interviewer', t: 'Why are you telling us this?' },
        { s: 'you_recorded', t: 'Because you asked. And because your daughter is going to find this frequency.' },
        { cap: '[the interviewer says nothing for a long time]', d: 3 },
        { s: 'interviewer', t: "...Then we'll need you here. Eventually." },
      ],
    },
    tape_op_loop: {
      label: 'OKAFOR — FOR WHOEVER IS NEXT (1)', year: 1985, stamp: 'OCT 1985',
      desc: 'Cassette, C-60. Ballpoint on the card: "For whoever is next. Play this first."',
      lines: [
        { sfx: 'tape_play', cap: '[a cassette recorded close to the mouth; rain behind]', d: 2 },
        { s: 'operator_okafor', t: "This is Delia Okafor. Nights. If you found this, you're the new one." },
        { s: 'operator_okafor', t: "They told you 148.32 is reserved. Log it, don't respond. That's good advice. Take it." },
        { s: 'operator_okafor', t: "You won't. None of us did." },
        { cap: '[she laughs, not much]', d: 1.5 },
        { s: 'operator_okafor', t: "Here's the only thing I know for sure." },
        { s: 'operator_okafor', t: "If you start hearing your own voice, you're already part of the loop." },
        { s: 'operator_okafor', t: "It doesn't mean you're going to die. It means you're a channel now." },
        { cap: '[the fluorescent tube buzzing, very close]', d: 2 },
        { s: 'operator_okafor', t: 'Make coffee. Do the readings. Keep your hands busy. It helps.' },
        { sfx: 'tape_stop', cap: '[click]', d: 1 },
      ],
    },
    tape_op_survive: {
      label: 'OKAFOR — FOR WHOEVER IS NEXT (2)', year: 1986, stamp: '27 OCT 1986',
      desc: 'Cassette, C-60. Same handwriting, faster: "(2) — the 27th."',
      lines: [
        { sfx: 'tape_play', cap: '[cassette hiss]', d: 1.5 },
        { s: 'operator_okafor', t: "Okafor. Second tape. It's the twenty-seventh again. It's always the twenty-seventh." },
        { s: 'operator_okafor', t: "I've heard eleven of me now. Some of them are dead. They still call in." },
        { s: 'operator_okafor', t: "Most of them want to help. That's the problem." },
        { s: 'operator_okafor', t: "Eventually one of you figures out how to survive. That's the dangerous one." },
        { s: 'operator_okafor', t: "Because she'll tell you exactly what she did. And it'll work." },
        { sfx: 'knock', cap: '[a knock, somewhere in the building]', d: 2 },
        { s: 'operator_okafor', t: "...That's not the day man. It's three in the morning." },
        { sfx: 'chair_scrape', cap: '[her chair scrapes back]', d: 1.5 },
        { s: 'operator_okafor', t: 'Leave the tape running. Whatever—' },
        { cap: '[the tape runs on. Nobody comes back to the microphone.]', d: 5 },
      ],
    },
  };

  /* ================================================================ docs */
  const BLUEPRINT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none" stroke="currentColor" stroke-width="1" font-family="monospace" font-size="7" stroke-linecap="square" role="img" aria-label="Ground floor plan">' +
    // north arrow + north wall annotation
    '<path d="M24 30V12M20 17L24 12L28 17"/><text x="21" y="37" fill="currentColor" stroke="none">N</text>' +
    '<path d="M255 22V38M252 34L255 38L258 34"/>' +
    '<text x="300" y="18" text-anchor="end" fill="currentColor" stroke="none">EXT. WALL · 300 CONC. · GRADE BEYOND</text>' +
    // shell
    '<rect x="20" y="40" width="280" height="170" stroke-width="3"/>' +
    '<path d="M210 40H300" stroke-width="5"/>' +
    // hall + partitions
    '<path d="M20 115H300M20 135H300"/>' +
    '<path d="M90 40V115M150 40V115M210 40V115"/>' +
    '<path d="M70 135V210M130 135V210M170 135V210M220 135V210M260 135V210"/>' +
    // door openings (ticks) on the hall walls
    '<path d="M72 111V119M84 111V119M118 111V119M130 111V119M178 111V119M190 111V119M228 111V119M240 111V119"/>' +
    '<path d="M36 131V139M48 131V139M92 131V139M104 131V139M140 131V139M152 131V139M184 131V139M196 131V139M232 131V139M244 131V139M272 131V139M284 131V139"/>' +
    // front door + swing
    '<path d="M92 206V214M108 206V214M92 210A16 16 0 0 0 108 226"/>' +
    // radio room windows (west wall)
    '<rect x="17" y="52" width="6" height="16"/><rect x="17" y="84" width="6" height="16"/>' +
    // equipment racks
    '<rect x="222" y="50" width="66" height="6"/><rect x="222" y="66" width="66" height="6"/><rect x="222" y="82" width="66" height="6"/>' +
    // stairs
    '<path d="M265 145H295M265 153H295M265 161H295M265 169H295M265 177H295M265 185H295M265 193H295"/>' +
    // labels
    '<g fill="currentColor" stroke="none">' +
    '<text x="38" y="80">RADIO</text><text x="104" y="80">OFFICE</text><text x="161" y="80">KITCHEN</text>' +
    '<text x="232" y="104">EQUIPMENT</text><text x="150" y="128">HALL</text>' +
    '<text x="28" y="175">STOR.</text><text x="88" y="175">LOBBY</text><text x="140" y="175">W.C.</text>' +
    '<text x="176" y="175">WORKSHOP</text><text x="224" y="175">RECORDS</text><text x="268" y="204">DN</text>' +
    '<text x="20" y="232">RELAY STN 14 · GROUND FLOOR · DRAWN 1978, REV. 4 · SHEET A-1</text>' +
    '</g></svg>';

  /**
   * The shift register — ONE source for the lobby sign-in sheet (doc_signin) and the name-entry
   * screen (DA.content.register; ui.js). `rows` is the current page (oldest first), `you` is the
   * line the player signs, `older` are the pages clipped behind it (the lobby copy only), `loose`
   * the pencilled page that should not exist.
   */
  const REGISTER = {
    form: 'FORM RS-14/3',
    title: 'RELAY STATION 14 — SHIFT REGISTER',
    rule: 'Night watch. Sign in on arrival. Sign out on relief. PRINT NAME.',
    cols: ['DATE', 'SHIFT', 'RELIEVING', 'RELIEF OPERATOR (PRINT)', 'SIGNATURE', 'REMARKS'],
    rows: [
      { date: '20 OCT 1999', in: '23:30', out: '06:43', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '21 OCT 1999', in: '23:30', out: '06:42', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Breaker C twice' },
      { date: '22 OCT 1999', in: '23:30', out: '06:44', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '23 OCT 1999', in: '23:30', out: '06:42', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '24 OCT 1999', in: '23:30', out: '06:44', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Logged 148 x1' },
      { date: '25 OCT 1999', in: '23:30', out: '06:43', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: '' },
      { date: '26 OCT 1999', in: '16:00', out: '23:40', relieving: 'DAY CREW', name: 'T. HOLLIS', rem: 'Double. Relief late (cover).' },
    ],
    you: { date: '26 OCT 1999', in: '23:40', relieving: 'T. HOLLIS', name: '{NAME_UP}', rem: 'Cover' },
    older: [
      { date: '27 OCT 1994', in: '23:30', out: '--:--', name: 'E. MARSH' },
      { date: '31 SEP 1991', in: '23:30', out: '03:12', name: 'R. VANCE' },
      { date: '27 OCT 1986', in: '23:45', out: '______', name: 'D. OKAFOR' },
      { date: '30 FEB 1983', in: '23:30', out: '06:40', name: 'E. MARSH' },
      { date: '27 OCT 1979', in: '23:30', out: '06:42', name: 'E. MARSH' },
      { date: '27 OCT 1963', in: '23:00', out: '07:10', name: 'T. HOLLIS' },
    ],
    loose: [{ date: '27 OCT 2049', in: '06:43', out: '______', name: '{NAME_UP}' }],
  };
  const regLine = (r) => '**' + r.date + '** · IN ' + r.in + ' · ' + r.name + ' · OUT ' + (r.out || '______');
  function signinBody() {
    return [
      '# ' + REGISTER.title,
      REGISTER.rule,
      '**' + REGISTER.you.date + '** · IN ' + REGISTER.you.in + ' · ' + REGISTER.you.name + ' (relief, cover) · OUT ______',
    ].concat(REGISTER.rows.slice().reverse().map(regLine))
      .concat(['— older pages, clipped behind —'], REGISTER.older.map(regLine))
      .concat(['— a loose page, in pencil —'], REGISTER.loose.map(regLine))
      .join('\n\n');
  }

  const docs = {
    doc_plaque: {
      title: 'Lobby plaque', style: 'plaque',
      body: '# RELAY STATION 14 — COMMISSIONED 1978\n\nEMERGENCY COMMUNICATIONS RELAY NETWORK · REGION 4\n\nIn continuous operation since commissioning.',
    },

    doc_hollis_note: {
      title: 'Note on the desk', style: 'paper', hand: true,
      body: "Coffee filters in the cupboard. Breaker C trips when it rains. Don't sit in the dark. —H",
    },

    doc_signin: {
      title: 'Shift register', style: 'form',
      body: '', // built from REGISTER below (the same page the name screen shows)
    },

    doc_corkboard: {
      title: 'Corkboard', style: 'paper',
      body: [
        '# CORKBOARD — OFFICE',
        '**NIGHT ROTA — OCTOBER 1999**',
        'MON–SAT: T. HOLLIS · SUN: RELIEF (REGION TO ASSIGN)',
        '26 OCT: **{NAME_UP}** (cover) — added in a different pen',
        '**NOTICE:** Breaker C trips when it rains. Do NOT call the electrician again. He has been out four times. — Region',
        '**REMINDER:** Hourly weather readings are mandatory. Log them even if they are the same as last hour.',
        '**LOST CAT — "BISCUIT"** — Grey tabby, white paws, very friendly. Last seen Alder Lane, Pine Hollow. Please call 555-0147. REWARD. (A crayon drawing of a cat.)',
        'SAFETY: **214** DAYS WITHOUT A LOST-TIME INCIDENT — the number has been scratched out and rewritten many times.',
        'A yellow sticky note, three different hands, one under the other: "Who keeps moving the mugs?" — "Not me." — "Not me." — "Not me."',
      ].join('\n\n'),
    },

    doc_procedures: {
      title: 'Operating procedures (binder)', style: 'typed',
      body: [
        '# OPERATING PROCEDURES — NIGHT WATCH',
        '**RELAY STATION 14 · BINDER 1 · REV. 1998**',
        '**1. FREQUENCIES (MHz)**',
        '155.34 — County Dispatch / EMS. Omnidirectional. Radio check at the start of every shift.',
        '155.47 — Sheriff. South (Pine Hollow).',
        '027.18 — CB channel 19. Truck traffic on Route 9. East.',
        '027.06 — CB channel 9. Emergency. Monitor.',
        '162.55 — NOAA Weather Radio. North (mast).',
        '121.50 — Aviation guard. Monitor only.',
        '148.32 — RESERVED. See section 6.',
        '**2. TUNING**',
        'Turn the main dial (wheel, or ← →) in steps of 0.01. SHIFT with the wheel, or ↑ ↓, steps 0.10. PAGE UP / PAGE DOWN move a whole megahertz. Watch the signal meter; a clean signal holds the needle in the green. The spectrum shows carriers on either side of the dial.',
        '**3. ANTENNA**',
        'The directional antenna is on a rotor. Turn it (A / D) until the meter peaks. The bezel shows the heading. A weak or distant station will not clear until both frequency and heading are right.',
        '**4. LOGGING**',
        'The receiver stamps every transmission with its time of origin. Confirm each entry with LOG (L): sender and summary. Log everything, including routine traffic.',
        '**5. TRANSMITTING**',
        'Hold the MIC key (SPACE) to speak. Called station first, then yourself: "County, Station Fourteen." Keep it short. Release to listen.',
        '**6. RESERVED FREQUENCY**',
        '**NEVER TRANSMIT ON 148.32.**',
        'Traffic on 148.32 is to be logged only. Do not respond. Do not acknowledge. Do not attempt to locate the source. Do not relay its contents to any other agency.',
        '> Pencil, in the margin: it isn\'t military.',
        '**7. OFFSET UNIT**',
        'The OFFSET display is not in service at this station. If it lights, note the reading in the log and continue.',
        '**8. WEATHER**',
        'Hourly readings from the mast (roof, via the workshop ladder). Log them even when nothing has changed.',
        '**9. POWER**',
        'If the main supply fails, the backup generator starts by itself. Do not switch the generator off while the station is occupied.',
      ].join('\n\n'),
    },

    doc_blueprint: {
      title: 'Blueprint — ground floor', style: 'blueprint', svg: BLUEPRINT_SVG,
      body: [
        '# RELAY STATION 14 — GROUND FLOOR',
        '**DRAWN 1978, REV. 4** · SHEET A-1 OF 3',
        BLUEPRINT_SVG,
        'N. wall, equipment room: exterior. 300 mm reinforced concrete. Grade beyond. No openings.',
        'Hall: 9 light fixtures, circuit C.',
        'Basement (sheet B-2): generator room, plant, antenna control. No other structures.',
      ].join('\n\n'),
    },

    doc_personnel: {
      title: 'Personnel file', style: 'typed',
      body: [
        '# PERSONNEL — NIGHT OPERATIONS',
        '**EMERGENCY COMMUNICATIONS RELAY NETWORK · REGION 4 · SITE 14**',
        'CONFIDENTIAL. NOT TO BE REMOVED FROM THE RECORDS ROOM.',
        '**HOLLIS, Thomas J.** — Appointed 21 AUG 1998 (probationary). Status: ACTIVE. Leave approved from 27 OCT 1999, indefinite.',
        '> Pencil: same signature in the register since 1963. Do not raise it with him.',
        '**MARSH, Edwin R.** — Appointed 12 JUN 1978. Resigned 30 NOV 1979. Status: SEPARATED.',
        '> Pencil: signed the register 1978–1994. Paid through 1994. Nobody at Region can say who authorised it.',
        '**OKAFOR, Delia A.** — Appointed 5 MAR 1984. Status: MISSING, 27 OCT 1986. File closed 1987.',
        '> Pencil: her car was in the lot. Her tapes are on shelf C.',
        '**VANCE, Robert L.** — No record of employment at this site.',
        '> Pencil: drove out 3/91. His car was in the lot the next morning. Engine running, tank full.',
        '**{NAME_UP}** — File opened 27 OCT 1961. Source: LONGWAVE session 9, reel 14. Date of birth: see attached (the file predates it).',
        'Placement: ARRANGED. 1983 — school transfer arranged. 1987 — scholarship arranged. 1994 — position arranged. OCT 1999 — cover shift arranged.',
        'Assigned: 26 OCT 1999, nights, relieving T. HOLLIS.',
        '> Typed at the foot of the card: Subject answers. Subject always answers. Do not intervene.',
      ].join('\n\n'),
    },

    doc_report: {
      title: 'Project LONGWAVE — final report', style: 'typed',
      body: [
        '# PROJECT LONGWAVE — FINAL REPORT',
        '**JOINT PROPAGATION RESEARCH GROUP · SITE 14 · 30 NOVEMBER 1963**',
        'CLASSIFICATION: CONTINUITY. COPY 3 OF 3.',
        '**1. SUMMARY**',
        "Project LONGWAVE was established in 1954 to investigate an anomalous propagation effect observed during a seismic survey beneath the ridge now designated Site 14. This report records the project's findings, the incidents that led to its termination, and the conditions under which the site must now be maintained. The conclusion in section 7 was not anticipated by any member of the research staff.",
        '**2. THE EFFECT**',
        'In March 1954 a survey team transmitting low-frequency test pulses through the granite beneath the ridge recorded those pulses at the receiving station before they had been sent. The lead was 4.1 milliseconds. It was repeatable. It was not an instrument fault: leads were exchanged, clocks were replaced, and the measurement was repeated by a second team who had not been told what to expect.',
        'Initial opinion held that we had found an unusual propagation phenomenon — a quirk of the geology, perhaps a mineral lens acting as a waveguide. Funding was granted on that basis.',
        '**3. THE ARRAY**',
        'Between 1956 and 1958 a receiving array was constructed in the rock beneath the site. The lead increased with every extension. Seconds by 1957. Minutes by the winter of that year. By 1959 the array was receiving transmissions whose origin stamps lay hours, then days, then years ahead of the moment of reception.',
        'It was eventually understood that the signal was not literally travelling backward in time. Transmissions bearing the same origin stamp frequently contradicted one another. A message describing a fire at the site office would be followed by a message from the same hour describing no fire, and a third describing the fire put out. All three were correct.',
        'The array was receiving signals from possible versions of the future. Not one future. Thousands. Every decision taken at the site, and we came to believe anywhere within its reach, branches them. In the plainest language available, the station functions as a radio between realities.',
        '**4. INCIDENTS**',
        'From 1960 staff began receiving transmissions from themselves. These were at first treated as an opportunity. Staff were briefed by their own voices on the outcomes of experiments not yet run.',
        'In 1961 staff began receiving transmissions from members of the project who had died. In two cases the transmissions preceded the deaths. In one case they continued after the funeral.',
        'In 1962 staff began receiving transmissions from versions of themselves who stated that their timelines had been destroyed. They could not say by what. Several asked that the array be switched off. Several asked that it never be switched off.',
        'From August 1962 the array received one repeating transmission, on every channel. The speaker has never been identified. The voice matched no member of staff, living or dead. It said, and continues to say:',
        '> KEEP THE CHANNEL OPEN.',
        '**5. TERMINATION**',
        'The project was terminated by order on 4 November 1963. Power to the array was cut at 03:00 on 9 November.',
        'Within eleven minutes, two members of the survey crew disappeared from a lit vehicle in the site lot. Several thousand birds fell dead within a mile of the site. Livestock on the Harlan property was found dead in the fields. Residents of Pine Hollow later reported between forty minutes and six hours missing from the night.',
        'Power was restored at 03:11. The effects ceased.',
        '**6. CONTINUITY**',
        'The array cannot be switched off. It cannot be left unattended. The effects are held off only while the receiver is occupied: while a person is present at the site, listening.',
        'The site is therefore to be maintained indefinitely under civil cover as an emergency relay station. One operator is to be present every night. Operators are not to be told the purpose of the station. Their duties are to be ordinary. Their actual job is simply to keep the receiver occupied.',
        'Operators are not to respond on the long channel, routed to the civil receiver as 148.32 MHz.',
        '**7. SOURCE**',
        'A final survey of the rock beneath the array was completed in October 1963. It shows nothing beneath the site but solid bedrock, to the limit of measurement.',
        'The effect was not generated by the array. Recordings made during construction, and older recordings obtained from private owners in the valley, including wax cylinders and a surveyor\'s disc of 1932, show the same signal present before any equipment was installed.',
        'The array did not create the effect. It amplified something that was already there.',
        'Something beneath the site has been broadcasting long before humanity invented radio.',
      ].join('\n\n'),
    },

    doc_newspaper_2049: {
      title: 'The Pine Hollow Courier', style: 'newspaper',
      body: [
        '# THE PINE HOLLOW COURIER',
        '**WEDNESDAY 27 OCTOBER 2049** · Serving the Hollow and the high country since 1911 · $4.00',
        '**ROUTE 9 RESURFACING PUSHED TO SPRING**',
        'County commissioners voted 3–2 on Tuesday to delay the resurfacing of County Route 9 until April, citing the wettest autumn on record. "We\'d be paving a river," one commissioner said. The Harlan Creek bridge deck will be inspected in November as scheduled.',
        '**HARVEST SUPPER MOVES INDOORS**',
        'Rain has moved Saturday\'s harvest supper into the Grange hall. The pie table will run as usual. Bring a chair.',
        '**RELAY STATION DEMOLITION DELAYED AGAIN**',
        'Demolition of the former emergency relay station off Tower Road, closed since October 1999, has been postponed for a sixth time. Contractors cited "equipment still under power." The county has no record of a utility account at the site.',
        'The station\'s last night operator was never located. A car registered to the operator remains in the lot.',
        '**WEATHER:** Rain, heavy at times. Lows near forty. Sunrise 6:42 a.m.',
      ].join('\n\n'),
    },

    doc_shift_form: {
      title: 'Night shift report', style: 'form',
      body: [
        '# NIGHT SHIFT REPORT',
        '**RELAY STATION 14 · FORM NS-2** · Complete before relief. Print clearly.',
        'Operator: {NAME} · Date: {DATE} · Relieved: T. HOLLIS',
        'By signing, the operator confirms that no traffic on the reserved frequency was answered.',
      ].join('\n\n'),
      signLabel: 'Operator signature',
      fields: [
        { id: 'operator', label: 'Operator', kind: 'text', value: '{NAME}', readonly: true },
        { id: 'date', label: 'Date', kind: 'text', value: '{DATE}', readonly: true },
        { id: 'relieved', label: 'Relieved', kind: 'text', value: 'T. HOLLIS', readonly: true },
        { id: 'weather', label: 'Weather at start of shift', kind: 'select', options: ['Clear', 'Overcast', 'Fog', 'Rain — light', 'Rain — heavy', 'Snow'], answer: 'Rain — heavy' },
        { id: 'wind', label: 'Wind', kind: 'select', options: ['Calm', 'Light', 'Moderate', 'Strong / gusting'], answer: 'Strong / gusting' },
        { id: 'radio_check', label: 'Radio check with County', kind: 'select', options: ['Not performed', 'Performed — weak', 'Performed — loud and clear'], answer: 'Performed — loud and clear' },
        { id: 'traffic', label: 'Traffic logged', kind: 'select', options: ['None', '1–2', '3–5', '6 or more'] },
        { id: 'breakers', label: 'Breakers reset', kind: 'select', options: ['None', 'A', 'B', 'C', 'D', 'E', 'F'], answer: 'C' },
        { id: 'generator', label: 'Backup generator', kind: 'select', options: ['Standby', 'Running', 'Fault'], answer: 'Standby' },
        { id: 'reserved', label: 'Activity on reserved frequency (148.32)', kind: 'select', options: ['None', 'Logged only', 'Responded (explain in remarks)'], answer: 'None' },
        { id: 'remarks', label: 'Remarks', kind: 'text', placeholder: 'Coffee machine leaks. Hall light 4 flickers.' },
      ],
    },
  };

  docs.doc_signin.body = signinBody();

  /* ============================================================ dialogue */
  const HOLLIS_148 = "Frequency 148.32 is reserved. If you hear anything on it, just log it. Don't respond.";
  const HOLLIS_WHY = 'Old military frequency or something.';
  // The tour, stop by stop. The replacement tour (Maintain ending) is these words in the player's mouth.
  const TOUR = {
    lobby: ['Sign-in sheet. Sign out too, when your relief shows. They check.', "Hall runs the length of the place. Everything's off it."],
    stairs: ["Generator's downstairs. Kicks in by itself if the main goes.", "You shouldn't need to go down there."],
    equipment: ['Equipment room. The racks run themselves. If a fan starts screaming, leave it. It stops.', "Tape backup's the grey terminal. It archives on its own. You can run one yourself, if you want."],
    kitchen: ["Kitchen. Coffee machine's the only thing in the building that works right.", 'Filters in the cupboard.'],
    bath: ["Bathroom. Mirror's cracked in the corner. Don't bother putting in a ticket."],
    workshop: ['Workshop. Breaker panel. C trips when it rains, which out here is always.', 'Ladder goes up to the roof. Weather instruments are on the mast. They want readings on the hour.', "Flashlight's on the bench, if the power goes."],
    records: ["Records. Locked. Don't have the key, don't want it."],
    radio: ['And this is you. All night.', "Emergency transmitter's the red panel. Backup antenna's on the rotor, that knob. Point it where the signal is.", "Channels are in the notebook. County's one-five-five three-four. Do a radio check when you're settled.", "Procedures binder's on the shelf, if you forget which way to point it."],
  };
  const says = (s, lines) => lines.map((t) => ({ s, t }));
  const think = (...lines) => lines.map((t) => ({ s: 'you', t }));

  const dialogue = {
    // --- ACT 1: Hollis
    hollis_greet: [
      { s: 'hollis', t: 'You the relief?' },
      { s: 'you', t: "That's me. Sorry. I took the wrong fork at the quarry." },
      { s: 'hollis', t: 'Everybody does. Hollis.' },
      { s: 'hollis', t: "Come in out of that. I'll show you around, then I'm gone." },
    ],
    hollis_lobby: says('hollis', TOUR.lobby),
    hollis_stairs: says('hollis', TOUR.stairs),
    hollis_equipment: says('hollis', TOUR.equipment),
    hollis_kitchen: says('hollis', TOUR.kitchen),
    hollis_bath: says('hollis', TOUR.bath),
    hollis_workshop: says('hollis', TOUR.workshop),
    hollis_records: says('hollis', TOUR.records),
    hollis_radio: says('hollis', TOUR.radio),
    hollis_148: [{ s: 'hollis', t: HOLLIS_148 }],
    hollis_why: [{ s: 'hollis', t: HOLLIS_WHY }],
    // README: he says it either way — a shrug, an afterthought
    hollis_ok: [{ s: 'hollis', t: 'Good.', gap: 1.2 }, { s: 'hollis', t: HOLLIS_WHY }],
    hollis_bye: [
      { s: 'hollis', t: "Right. That's me." },
      { s: 'hollis', t: "Phone's in the office if you need County. You won't." },
      { s: 'hollis', t: "Shift report's on the office desk. Fill it in before the day man gets here." },
      { s: 'hollis', t: "Day man comes at sunup. Don't sit in the dark.", alt: "Day man's here at sunup. Don't sit in the dark." },
      { s: 'hollis', t: '...And just log it. Okay?', d: 2.4 },
    ],

    // --- ACT 3: the phone
    phone_echo: [
      { s: 'you', t: 'Hello?' },
      { s: 'phone', t: 'Hello?' },
      { s: 'you', t: 'Who is this?' },
      { s: 'phone', t: 'Who is this?' },
      { s: 'you', t: 'This is Relay Station Fourteen.' },
      { s: 'phone', t: 'This is Relay Station Fourteen.' },
    ],
    phone_dont_turn: [{ s: 'phone', t: "Don't turn around." }],

    // --- Maintain ending: you are the one giving the tour
    replacement_arrive: [
      { s: 'replacement', t: 'Hi. Sorry. Are you the night operator?' },
      { s: 'you', t: 'You the relief?' },
      { s: 'replacement', t: 'Yeah. I took the wrong fork at the quarry.' },
      { s: 'you', t: 'Everybody does.' },
      { s: 'you', t: "Come in out of that. I'll show you around, then I'm gone." },
    ],
    replacement_tour_1: says('you', TOUR.lobby),
    replacement_tour_2: says('you', TOUR.stairs),
    replacement_tour_3: says('you', TOUR.equipment),
    replacement_tour_4: says('you', TOUR.kitchen),
    replacement_tour_bath: says('you', TOUR.bath),
    replacement_tour_5: says('you', TOUR.workshop.concat(TOUR.records)),
    replacement_tour_6: says('you', TOUR.radio),
    // the relief comes looking for a night operator who never came to the door
    replacement_hello: [{ s: 'replacement', t: 'Hello? Night operator? The door was open.' }],
    replacement_hello_shut: [{ s: 'replacement', t: 'Hello? Night operator? I let myself in.' }],
    replacement_go_home: [{ s: 'replacement', t: "Go home. I've got it." }],
    replacement_hello_2: [{ s: 'replacement', t: "Hello? Anybody here? I'm the day relief." }],
    replacement_148: [{ s: 'you', t: HOLLIS_148 }],
    replacement_why: [
      { s: 'replacement', t: 'Why?' },
      { s: 'you', t: HOLLIS_WHY },
    ],
    maintain_realize: think("That's what he told me.", 'Word for word.', "He wasn't brushing me off.", 'He was trying to stop me.'),

    // --- Secret ending: nothing happened
    secret_handover: [
      { s: 'replacement', t: 'Morning. You the night operator?' },
      { s: 'you', t: "Yeah. Radio's yours." },
      { s: 'replacement', t: 'Anything happen?' },
      { s: 'you', t: 'No. Quiet night.' },
      { s: 'replacement', t: 'Anything on the reserved channel?' },
      { s: 'you', t: 'Nothing I answered.' },
      { s: 'replacement', t: 'Good. Drive safe.' },
    ],
    // …when nothing ever came in on 148.32 at all (it was never even tuned)
    secret_handover_quiet: [
      { s: 'replacement', t: 'Morning. You the night operator?' },
      { s: 'you', t: "Yeah. Radio's yours." },
      { s: 'replacement', t: 'Anything happen?' },
      { s: 'you', t: 'No. Quiet night.' },
      { s: 'replacement', t: 'Anything on the reserved channel?' },
      { s: 'you', t: 'Not a thing.' },
      { s: 'replacement', t: 'Good. Drive safe.' },
    ],
    // Calm You, when the antenna is on 270° at the minute he named
    calm_good: [{ s: 'you_calm', t: 'Good.' }],

    // --- thoughts (internal, never voiced aloud)
    thoughts_hollis_gone: think('Just me, then.'),
    thoughts_coffee: think("It's terrible. It's hot."),
    thoughts_breaker: think('Breaker C. Like he said.'),
    thoughts_roof: think('Still pouring. The mast is singing in the wind.'),
    // ACT 1: the office's remote display read while "Check the weather instruments on the roof." is open
    thoughts_weather_panel: think("That's only the display. He said check the mast itself. Ladder's in the workshop."),
    thoughts_calendar: think('Twenty-seventh.'),
    thoughts_log_stamp: think('Twenty-eighth of October?'),
    thoughts_check_date: think('Twenty-seventh. It says the twenty-seventh.'),
    thoughts_nothing_there: think('Nothing there. She told me exactly where she was.'),
    thoughts_first_148: think('One-four-eight point three-two.'),
    thoughts_sunrise: think('Six forty-two.', 'It should be getting light.'),
    // …said while a call held it back, more than a couple of minutes late
    thoughts_sunrise_late: think('Past six forty-two.', 'It should be light by now.'),
    thoughts_predawn: think('Nearly morning.'),
    thoughts_relief_late: think('The day man should be here.'),
    thoughts_mug: think('I left that by the radio.'),
    thoughts_door_open: think('I shut that. I know I shut that.'),
    thoughts_photo: think("There were three of them. I'm sure there were three."),
    thoughts_photo_four: think("I don't know the fourth one.", '...Do I?'),
    thoughts_upstairs: think('There is no upstairs.'),
    thoughts_generator: think("That's not how it sounded before."),
    thoughts_window: think("Something's out there. In the rain."),
    thoughts_drive_loop: think("That's the station. I drove away from the station."),
    thoughts_woods: think('I should be able to see the lot lights from here.'),
    thoughts_woods_pure: think('Just trees. The trail has to come out somewhere.'),
    thoughts_woods_out: think('The road. It just goes round in a loop.'),
    thoughts_cupboard: think('Shelves. I was in the trees. I was just in the trees.'),
    thoughts_blueprint: think("There's nothing behind the equipment room. It's an outside wall."),
    thoughts_steel_door: think("That door isn't on the drawings."),
    thoughts_voice: think("That's my voice."),
    thoughts_girl: think('She said my name.'),
    thoughts_records_key: think('Nineteen seventy-eight. The year on the plaque.'),
    thoughts_tape_name: think('That tape has my name on it.', 'Nineteen sixty-one.'),
    thoughts_cctv_empty: think("There's nobody there."),
    thoughts_turn_around: think('Nothing.'),
    thoughts_knock: think('Three knocks.'),
    thoughts_key: think('A key. He was right.'),
    thoughts_dark: think('Emergency lamps. Just the red.'),
    thoughts_hide: think('Twelve seconds.'),
    thoughts_mirror: think('It was late. My reflection was late.'),
    thoughts_mirror3: think("It's not moving. I am.", "There's someone in the door behind me."),
    thoughts_hall_long: think("The hall's longer. It's longer than it was."),
    thoughts_office_door: think('This is the supply room. I opened the office door.'),
    thoughts_hallway: think("This wasn't here."),
    thoughts_leave: think("I'm not leaving."),
    // decision 3 — the reward loop: it hasn't happened yet
    thoughts_warn_bridge: think("It hasn't happened yet. Twenty minutes.", 'Somebody could warn them. The trucks on nineteen would hear it.'),
    thoughts_warn_fire: think("Tomorrow night. Fourteen Alder Lane.", "Somebody could send a car. County would listen."),
    thoughts_saved_cost: think('Something in the building moved when he said that.'),
    thoughts_stronger: think("It's faster than it should be."),
    thoughts_breath: think("It's breathing when I breathe."),
    thoughts_back_to_radio: think('The radio. I should get back to the radio.'),
    thoughts_keypad_year: think('Four digits. A year, maybe.'),
    // ACT 3
    thoughts_time_right: think('To the minute.'),
    thoughts_need_light: think("I'll want a light first."),
    thoughts_gen_dead: think("It won't turn over. Not now."),
    thoughts_knock_up: think('Three knocks. Upstairs.', 'The radio room door locks from the inside.'),
    thoughts_control_wait: think("The key turns. The bolt doesn't. Something's still holding it."),
    thoughts_hatch_wait: think("The hatch won't lift. Not yet."),
    thoughts_log_changed: think('Something in the log just changed.'),
    thoughts_hall_sound: think('That came from the far end of the hall.', 'Further than the hall goes.'),
    thoughts_newhall_knock: think('That came from the hall.'),
    thoughts_offset_past: think('Minus four.', "That already happened. I didn't hear it happen."),
    thoughts_door_unheard: think("I didn't hear that door."),
    thoughts_door_closed: think('I left that open.'),
    thoughts_array_look: think("It's closer.", 'It only moves when I look away.'),
    thoughts_console_done: think("Not now. It's already started."),
    thoughts_dawn_fail: think('No.', 'It was getting light. It was.'),
    thoughts_relief_gone: think('She was right here.'),
    thoughts_her_radio: think("It's her radio now."),
    // a story call hailing just off the dial
    thoughts_fine_tune: think("It's close. Just off the frequency."),
    // the receiver left switched off
    thoughts_receiver_off: think("The receiver's off.", "It's supposed to stay on."),
    // a log stamp the clock has since passed (the pure-path reveal, late)
    thoughts_stamp_passed: think('It came in before it happened.'),
    // 2049: the station has been dead for fifty years
    thoughts_2049_console: think('Dead. Nothing down here has run in years.'),
    thoughts_2049_generator: think('Seized solid. Nobody has run it in years.'),
    thoughts_2049_hatch: think('The hatch is rusted shut.'),
    thoughts_shift_not_over: think("My shift isn't over."),
    thoughts_array: think("This can't fit under the building."),
    // device idle lines (DA.devices reads these; it has built-in fallbacks)
    thoughts_phone: think('No one to call at this hour.'),
    thoughts_coffee_enough: think('One cup is enough.'),
    thoughts_vent_empty: think('Empty.'),
    thoughts_vent_dust: think('Nothing in there but dust.'),
    thoughts_keypad_done: think("It's open. Nothing else in there."),
    thoughts_antenna_down: think("It's pointing down."),
    thoughts_timeline: think('Not a save. A timeline.'),
    thoughts_car_rusted: think("That's my car."),
    thoughts_newspaper: think('Twenty forty-nine.'),
    thoughts_dawn: think('Sunrise.'),
  };

  /* ============================================================= maplocs */
  // County map in 0..1 space (x east, y south). Bearings from station_14 match the transmissions:
  // Kestrel MM 14 ≈ 300°, Harlan bridge ≈ 128°, Pine Hollow ≈ 170°, Route 9 MM 20 ≈ 82°.
  const maplocs = {
    county_line:   { name: 'County line', label: 'COUNTY LINE', kind: 'border', pts: [[0.03, 1.0], [0.02, 0.72], [0.04, 0.46], [0.03, 0.22], [0.08, 0.06], [0.40, 0.04], [0.70, 0.02], [1.0, 0.03]] },
    harlan_creek:  { name: 'Harlan Creek', label: 'Harlan Cr.', kind: 'water', pts: [[1.0, 0.58], [0.90, 0.61], [0.80, 0.65], [0.69, 0.68], [0.60, 0.72], [0.53, 0.77], [0.47, 0.83], [0.42, 0.91], [0.38, 1.0]] },
    sawmill_creek: { name: 'Sawmill Creek', label: 'Sawmill Cr.', kind: 'water', pts: [[0.40, 0.0], [0.43, 0.09], [0.47, 0.17], [0.51, 0.24], [0.56, 0.31], [0.62, 0.37], [0.70, 0.45], [0.80, 0.52], [0.90, 0.61]] },
    cold_creek:    { name: 'Cold Creek', label: 'Cold Cr.', kind: 'water', pts: [[0.0, 0.52], [0.10, 0.50], [0.18, 0.47], [0.26, 0.46], [0.32, 0.50], [0.36, 0.56], [0.40, 0.63], [0.44, 0.71], [0.47, 0.83]] },
    route_9:       { name: 'County Route 9', label: 'RT 9', kind: 'road', pts: [[0.74, 0.0], [0.71, 0.07], [0.74, 0.14], [0.70, 0.21], [0.66, 0.28], [0.68, 0.35], [0.65, 0.42], [0.66, 0.49], [0.70, 0.56], [0.71, 0.62], [0.69, 0.68], [0.65, 0.75], [0.61, 0.83], [0.60, 0.91], [0.63, 1.0]] },
    tower_road:    { name: 'Tower Road', label: 'Tower Rd.', kind: 'road', pts: [[0.66, 0.49], [0.60, 0.51], [0.54, 0.49], [0.47, 0.50]] },
    quarry_road:   { name: 'Quarry Road', label: 'Quarry Rd.', kind: 'road', pts: [[0.65, 0.42], [0.72, 0.40], [0.79, 0.37]] },
    kestrel_road:  { name: 'Kestrel Road (old logging road)', label: 'Kestrel Rd.', kind: 'road', pts: [[0.66, 0.28], [0.60, 0.26], [0.53, 0.28], [0.46, 0.25], [0.39, 0.27], [0.33, 0.305], [0.27, 0.345], [0.21, 0.365], [0.15, 0.395], [0.08, 0.42], [0.0, 0.44]] },
    sawmill_road:  { name: 'Sawmill Road', label: 'Sawmill Rd.', kind: 'road', pts: [[0.53, 0.28], [0.52, 0.20], [0.49, 0.12], [0.47, 0.06]] },
    pass_road:     { name: 'Pass Road', label: 'Pass Rd.', kind: 'road', pts: [[0.70, 0.56], [0.62, 0.60], [0.52, 0.63], [0.42, 0.66], [0.32, 0.66], [0.22, 0.64], [0.12, 0.62], [0.0, 0.61]] },
    alder_lane:    { name: 'Alder Lane', label: 'Alder Ln.', kind: 'road', pts: [[0.56, 0.85], [0.53, 0.875], [0.50, 0.895]] },
    harlan_bridge: { name: 'Harlan Creek bridge', label: 'Harlan Cr. Br.', kind: 'bridge', pts: [[0.69, 0.664], [0.69, 0.696]] },
    quarry_turnoff:{ name: 'Quarry turnoff', label: 'Quarry turnoff', kind: 'marker', road: 'route_9', pts: [[0.65, 0.42]] },
    kestrel_mm12:  { name: 'Kestrel Road — mile marker 12', label: 'MM 12', kind: 'marker', road: 'kestrel_road', pts: [[0.27, 0.345]] },
    kestrel_mm14:  { name: 'Kestrel Road — mile marker 14', label: 'MM 14', kind: 'marker', road: 'kestrel_road', pts: [[0.21, 0.365]] },
    kestrel_mm16:  { name: 'Kestrel Road — mile marker 16', label: 'MM 16', kind: 'marker', road: 'kestrel_road', pts: [[0.15, 0.395]] },
    r9_mm14:       { name: 'Route 9 — mile marker 14', label: 'MM 14', kind: 'marker', road: 'route_9', pts: [[0.705, 0.60]] },
    r9_mm20:       { name: 'Route 9 — mile marker 20', label: 'MM 20', kind: 'marker', road: 'route_9', pts: [[0.658, 0.465]] },
    station_14:    { name: 'Relay Station 14', label: 'RELAY STN 14', kind: 'place', pts: [[0.46, 0.50]] },
    pine_hollow:   { name: 'Pine Hollow', label: 'PINE HOLLOW', kind: 'place', pts: [[0.53, 0.87]] },
    quarry:        { name: 'Quarry (disused)', label: 'Quarry', kind: 'place', pts: [[0.80, 0.365]] },
    kestrel_ridge: { name: 'Kestrel Ridge', label: 'KESTREL RIDGE', kind: 'place', pts: [[0.24, 0.20]] },
  };

  /* =========================================================== fragments */
  // ACT 5: the spectrum floods. Your voice on every frequency, from every night that went wrong.
  const F = (s, t) => ({ s, t });
  const fragments = [
    F('you', 'Station Fourteen, is anybody—'),
    F('you', "It's two-thirteen. It's always two-thirteen."),
    F('you_panic', "I opened it. I shouldn't have opened it."),
    F('you_calm', "I didn't open it. It didn't matter."),
    F('you', "The mug's in the kitchen again."),
    F('you_panic', "Don't answer her."),
    F('you_injured', 'Answer her. Please, just answer her.'),
    F('you', "Kestrel Road. Mile marker fourteen. There's nothing there."),
    F('you', 'I drove for an hour and the lights were the station.'),
    F('you_old', 'The fourth one in the photo is me.'),
    F('you', 'I can see myself on camera four.'),
    F('you_injured', "The generator stopped. I didn't stop it."),
    F('you_panic', "It's standing where the chair was."),
    F('you', "I'm under the desk. Twelve seconds. Eleven."),
    F('you_injured', 'I left. I left and it was waiting.'),
    F('you', "Don't look at the window."),
    F('you_panic', 'I looked at the window.'),
    F('you', 'Sunrise at six forty-two. Sunrise at six forty-two. Sunrise at—'),
    F('you_panic', "I destroyed it. I destroyed it and it's still talking."),
    F('you_old', 'I kept it open for forty years.'),
    F('you_old', 'My hands shake on the dial now.'),
    F('you_injured', "It's wearing my face."),
    F('you', 'Why does it point down?'),
    F('you', "I'm reading the log and it's reading me."),
    F('you', 'Radio check. Radio check. Is anybody—'),
    F('you_panic', 'County? County, come in. County?'),
    F('you', 'The relief never came.'),
    F('you_calm', 'Breaker C. It is always breaker C.'),
    F('you', "I can hear you breathing. I'm breathing."),
    F('you', 'She knew my name.'),
    F('you_injured', 'I saved them. I saved all of them, and it came in through the gaps.'),
    F('you_calm', 'There are forty of me on this frequency.'),
    F('you', "Whoever you are, you're me."),
    F('you_calm', "Don't trust the one who knows too much. I know too much."),
    F('you_old', "It's still raining. It's always raining here."),
    F('you_panic', "I'm in the new hallway. It keeps going."),
    F('you', 'Copy. Copy. Say again. Say again.'),
    F('you_calm', 'Zero-two-one-three.'),
    F('you_panic', 'Keep the— no. Don\'t.'),
    F('you', "It's been the twenty-seventh for so long."),
    F('you_calm', "I can see daylight. There's dust on everything."),
    F('you_old', "My car's rusted to the frame."),
    F('you', 'Hollis? Hollis, is that you?'),
    F('you_old', "I'm the previous operator now."),
    F('you', "Log it. Don't respond. Log it. Don't—"),
    F('you_injured', "Somebody's sitting in my chair."),
    F('you_calm', 'I loaded the archive. They kept going without me.'),
    F('you', 'This is Station Fourteen. Go ahead.'),
    // other operators, bleeding through
    F('operator_marsh', 'Marsh. Relay Fourteen. Still here. Still here.'),
    F('operator_okafor', "If you're hearing this, you're one of us."),
    F('operator_vance', "I'm leaving. I'm leaving tonight. I left."),
    F('hollis', "Don't sit in the dark."),
    F('keep_open', 'KEEP THE CHANNEL OPEN.'),
  ];

  /* ============================================================= endings */
  const endings = {
    destroy: {
      title: 'ONLY YOURS', sub: 'ENDING — DESTROY THE ANTENNA',
      card: 'FOUR MONTHS LATER',
      lines: [
        'The county called it a transformer fire.',
        'Nothing on the drawings went deeper than the basement, so nobody asked what did.',
        'In January the night shift was cut from the budget.',
        "You don't listen to the radio much anymore.",
      ],
      radioSpeaker: 'unknown',
      radio: 'You only destroyed yours.',
    },
    maintain: {
      title: 'RELIEF', sub: 'ENDING — KEEP THE CHANNEL OPEN',
      realize: [
        'You suddenly realize:',
        "That's exactly what the previous operator told you.",
        "Maybe he wasn't being dismissive.",
        'Maybe he was desperately trying to stop you.',
      ],
      lines: [
        'You drive home in the rain.',
        'In the mirror, the radio room light stays on.',
      ],
    },
    open: {
      title: 'OPEN CHANNEL', sub: 'ENDING — OPEN THE CHANNEL',
      lines: [
        'Silence.',
        'Daylight.',
        'Dust on everything. The chair is where you left it.',
        'Your car has rusted to the frame.',
      ],
      newspaper: 'doc_newspaper_2049',
      radioSpeaker: 'you',
      radio: 'Station Fourteen, radio check.',
      respond: 'Station Fourteen. Loud and clear.',
    },
    secret: {
      title: 'NOTHING TO REPORT', sub: 'ENDING — ZERO INTERACTION',
      lines: ['06:42.', 'Sunrise.', 'Nothing happens.'],
    },
    // the researchers' recap follows the shift (the director files DA.state.director.recap:
    // full | unlogged | duties | idle; see the post_secret getter below)
    post_secret_recap: {
      full: 'Full shift. Coffee, weather, the breaker, the paperwork. Logged everything on the long channel.',
      unlogged: 'Did the job. Coffee, weather, the breaker. Heard the long channel and never even logged it.',
      duties: 'Skipped half the readings. But everything on the long channel went in the log.',
      idle: "Sat there. Didn't do the readings. Didn't log the long channel. Didn't touch it.",
    },
    post_secret_base: [
      { sfx: 'tape_play', cap: '[tape hiss]', d: 2 },
      { s: 'researcher_a', t: 'Relay Fourteen. Night of the twenty-sixth. Review.' },
      { s: 'researcher_a', t: 'Full shift?' },
      { s: 'researcher_b', t: '{RECAP}' },
      { s: 'researcher_a', t: 'Responses?' },
      { s: 'researcher_b', t: 'None.' },
      { s: 'researcher_b', t: 'Subject demonstrated zero interaction.' },
      { s: 'researcher_a', t: "So that's it?" },
      { s: 'researcher_b', t: 'Yes.' },
      { cap: '[a pause]', d: 3.5 },
      { s: 'researcher_b', t: 'Without observation, there was no event.' },
      { sfx: 'tape_stop', cap: '[click]', d: 1.5 },
    ],
    credits: {
      title: 'DEAD AIR',
      lines: [
        'DEAD AIR',
        '',
        'Based on a design document',
        '',
        'Relay Station 14',
        'Night operators, 1963 –',
        '',
        'Every voice, every sound and every texture',
        'was synthesised by the machine you are running it on.',
        '',
        'All places, frequencies and people are fictional.',
        'Please do not transmit on 148.32.',
        '',
        'Thank you for listening.',
      ],
    },
  };
  endings.credits.text = endings.credits.lines.join('\n');
  /** endings.post_secret — the tape after the secret ending's credits, its recap line chosen from the shift. */
  Object.defineProperty(endings, 'post_secret', {
    enumerable: true,
    get() {
      const d = DA.state && DA.state.director;
      const key = (d && d.recap) || 'full';
      const recap = endings.post_secret_recap[key] || endings.post_secret_recap.full;
      return endings.post_secret_base.map((st) => (st.t === '{RECAP}' ? Object.assign({}, st, { t: recap }) : st));
    },
  });

  /* =============================================================== death */
  const death = {
    call: 'Station Fourteen? Is anybody there?',
    answer: 'This is Station Fourteen. Go ahead.',
    callSpeaker: 'you',
    answerSpeaker: 'new_operator',
    static: '[static]',
    load: 'LOAD ARCHIVE',
  };

  /* ========================================================== objectives */
  const objectives = {
    obj_go_inside: 'Go inside.',
    obj_follow_hollis: 'Follow Hollis.',
    obj_coffee: 'Make coffee.',
    obj_radio_check: 'Perform a radio check with County (155.34).',
    obj_weather: 'Check the weather instruments on the roof.',
    obj_trucker: 'Answer the trucker on CB 19 (027.18).',
    obj_breaker: 'Reset the tripped breaker.',
    obj_police: "Monitor the sheriff's channel (155.47).",
    obj_calendar: 'Turn the desk calendar.',
    obj_paperwork: 'Fill out the shift report (office desk).',
    obj_isolate: 'Isolate the signal.',
    obj_find_kestrel: 'Find Kestrel Road on the wall map.',
    obj_call_dispatch: 'Radio County Dispatch.',
    obj_check_log: 'Check the transmission log.',
    obj_check_date: 'Check the date.',
    obj_standby: 'Stand by for County.',
    obj_monitor: 'Monitor the radio.',
    obj_weather_hourly: 'Take the hourly weather reading (roof mast or office panel).',
    obj_warn_bridge: 'Warn them: CB 19 (027.18) or County (155.34).',
    obj_warn_fire: 'Send someone to 14 Alder Lane: County (155.34).',
    obj_at_time: 'At {AT_TIME}: antenna to 270° (due west).',
    obj_flashlight: 'Take the flashlight from the workshop bench.',
    obj_check_hall: 'Check the far end of the corridor.',
    obj_check_newhall: 'Find the knocking.',
    obj_power_on: 'Switch the receiver back on.',
    obj_signout: 'Sign out on the lobby register.',
    obj_log_traffic: 'Log routine traffic.',
    obj_generator: 'Investigate backup generator.',
    obj_generator_dont: 'DO NOT INVESTIGATE BACKUP GENERATOR.',
    obj_generator_already: 'You already investigated it.',
    obj_listen: 'LISTEN.',
    obj_hide: 'Hide.',
    obj_vent: 'Open the basement ventilation duct.',
    obj_control: 'Get into antenna control.',
    obj_array: "See what's under the station.",
    obj_report: 'Find the research report.',
    obj_destroy: 'DESTROY THE ANTENNA',
    obj_limiters: 'Pull the three limiters.',
    obj_overload: 'Engage the overload.',
    obj_escape: 'Get to the car.',
    obj_maintain: 'KEEP THE CHANNEL OPEN',
    obj_hold_signal: 'Hold the carrier until sunrise.',
    obj_open: 'OPEN THE CHANNEL',
    obj_relay: 'Enter the relay chamber.',
    obj_amplify: 'Amplify.',
    obj_handover: 'Hand over the shift.',
    obj_leave: 'Go home.',
  };

  /* =============================================================== items */
  const items = {
    mug: { name: 'Mug', desc: 'Station mug, chipped at the handle. RELAY 14 in worn gold letters. The coffee is terrible.' },
    flashlight: { name: 'Flashlight', desc: "Steel, heavy, four D cells. Someone has scratched an H into the barrel." },
    key_records: { name: 'Records room key', desc: 'Brass, on a paper tag that says RECORDS. The tag has been re-tied many times.' },
    key_antenna: { name: 'Antenna control key', desc: 'Long, steel, cold from the duct. Stamped A.C. — DO NOT DUPLICATE.' },
  };
  for (const id in tapes) items[id] = { name: 'Tape: ' + tapes[id].label, desc: tapes[id].desc, tape: true };

  /* ========================================================= extras */
  const choices = {
    hollis_148: [{ id: 'why', text: 'Why?' }, { id: 'ok', text: 'Okay.' }],
    phone: [
      { id: 'hello', text: 'Hello?' },
      { id: 'who', text: 'Who is this?' },
      { id: 'station', text: 'This is Relay Station Fourteen.' },
      { id: 'silent', text: '[Say nothing.]' },
    ],
  };

  const looks = {
    radio_window: 'Rain on the glass. The lot light. My car, and the trees behind it.',
    fridge: 'Half a sandwich in a bag that says HOLLIS. Creamer, two weeks out of date.',
    racks: "Rows of amber lamps and fan noise. It's warmer back here than it should be.",
    sink: 'The tap drips twice, stops, drips twice.',
    fuel_tank: 'Diesel. The gauge sits at three-quarters.',
    antenna_look: "It hangs down into the dark. There's no bottom to see.",
    chair: 'The chair pulls a little to the left.',
    tower: 'The tower light blinks red through the rain. One, two. One, two.',
    player_car: "My car. Still ticking as it cools.",
    player_car_rusted: 'Rust has eaten the doors. The seats are moss.',
  };

  const notebook = {
    defaults: [
      { freq: 155.34, label: 'COUNTY DISPATCH / EMS', hand: 'hollis' },
      { freq: 155.47, label: 'SHERIFF — aim S', hand: 'hollis' },
      { freq: 27.18, label: 'CB 19 — truckers, aim E', hand: 'hollis' },
      { freq: 27.06, label: 'CB 9 — emergency', hand: 'hollis' },
      { freq: 162.55, label: 'NOAA WEATHER — aim N', hand: 'hollis' },
      { freq: 121.5, label: 'AIR GUARD', hand: 'hollis' },
      { freq: 148.32, label: 'RESERVED — LOG ONLY', hand: 'hollis' },
    ],
    room: { freq: 14.0, label: '014.00 — ???', hand: 'you' },
    breath: { freq: 0.0, label: '000.00', hand: 'you' },
  };

  const log = {
    operator: 'STATION 14 (OPERATOR)',
    noTransmission: 'NO TRANSMISSION',
    remember: 'YOU SHOULD NOT REMEMBER THIS',
    resolved: 'RESOLVED',
    tx41: { num: 41, sender: 'STATION 14', stamp: 'NULL', summary: 'I CAN HEAR YOU READING THIS.' },
  };

  const cards = {
    act1: { title: 'RELIEF', sub: '26 OCT 1999 — 23:40' },
    act2: { title: 'THE LONG NIGHT', sub: '' },
    act3: { title: 'INTERFERENCE', sub: '' },
    act4: { title: 'THE ARRAY', sub: '' },
    act5: { title: 'COLLAPSE', sub: '' },
  };

  const drive = {
    arrive: {
      captions: ['26 OCT 1999 — 23:31 — COUNTY ROUTE 9'],
      sign: 'RELAY STATION 14',
      radio: [
        { s: 'dj', t: "...that's the weather. Flash flood watch through Thursday, folks." },
        { s: 'dj', t: "If you're out on Route 9 tonight, take it slow. It's coming down sideways up there." },
        { s: 'dj', t: "Just gone half eleven. Here's one for the night shift." },
      ],
    },
    loop: { signs: ['PINE HOLLOW 6', 'RELAY STATION 14 — 1 MI', 'PINE HOLLOW 6', 'RELAY STATION 14 — 1 MI'] },
    escape: { captions: [] },
    dawn: {
      captions: ['27 OCT 1999 — {TIME} — COUNTY ROUTE 9'], // {TIME}: when you actually left
      radio: [{ s: 'dj', t: "Good morning, folks. And the rain's finally letting up." }],
    },
    months_later: { captions: ['FEBRUARY 2000'], radioSpeaker: 'unknown', radio: 'You only destroyed yours.' },
  };

  const hints = {
    tune: 'Wheel or ← → to tune. Shift for bigger steps.',
    fine: '← → to fine-tune. Watch the meter.',
    antenna: 'A / D to turn the antenna. Watch the meter.',
    mic: 'Hold SPACE to talk.',
    log: 'L logs the current transmission.',
    stand: 'ESC to stand up.',
    journal: 'TAB opens the journal.',
    logbook: 'TAB opens the journal. The LOG tab has every transmission.',
    logbook_desk: 'TAB, or the LOG BOOK on the desk: the transmission log.',
    watch: 'T checks your watch.',
    flashlight: 'F for the flashlight.',
    crouch: 'C to crouch. Running is loud.',
    hide: 'E to hide. E again to come out.',
  };

  /** What the empty mic panel says while a need is pending (DA.radio.setMicNote; the director picks). */
  const micNotes = {
    kestrel: '[find the location on the wall map first]', // on 155.34 until Kestrel Road is found on the wall map
  };

  /** Tour stops → dialogue ids (PLAN §7.2 points). The Maintain ending's tour at dawn is Hollis's, in
   *  your mouth: the same stops (the records line is said on the way past, at the workshop). */
  const tour = {
    hollis: [
      ['pt_tour_lobby', 'hollis_lobby'], ['pt_tour_stairs', 'hollis_stairs'], ['pt_tour_equipment', 'hollis_equipment'],
      ['pt_tour_kitchen', 'hollis_kitchen'], ['pt_tour_bath', 'hollis_bath'], ['pt_tour_workshop', 'hollis_workshop'],
      ['pt_tour_records', 'hollis_records'], ['pt_tour_radio', 'hollis_radio'],
    ],
    replacement: [
      ['pt_tour_lobby', 'replacement_tour_1'], ['pt_tour_stairs', 'replacement_tour_2'], ['pt_tour_equipment', 'replacement_tour_3'],
      ['pt_tour_kitchen', 'replacement_tour_4'], ['pt_tour_bath', 'replacement_tour_bath'], ['pt_tour_workshop', 'replacement_tour_5'],
      ['pt_tour_radio', 'replacement_tour_6'],
    ],
  };

  const terminal = {
    title: 'TAPE BACKUP TERMINAL',
    titleTimelines: 'TIMELINE STORE',
    archiving: 'ARCHIVING CURRENT STATE',
    busy: 'DEVICE BUSY',
    empty: '— EMPTY —',
  };

  /* ===================================================== ids + helpers */
  for (const k in tx) tx[k].id = k;
  for (const k in roomfeed) roomfeed[k].id = k;
  for (const k in outgoing) outgoing[k].id = k;

  DA.content = {
    speakers, tx, outgoing, roomfeed, notes, tapes, docs, dialogue, maplocs, fragments,
    endings, death, objectives, items,
    choices, looks, notebook, log, cards, drive, hints, micNotes, terminal, tour, register: REGISTER,

    /** Speaker record, falling back to `unknown` for an unrecognised id. */
    speaker(id) { return speakers[id] || speakers.unknown; },

    /**
     * Origin of a transmission for the log + OFFSET display.
     * → {min, text, offsetSec} where min is DA.clock minutes (null for stampText-only sources).
     * With nowMin given and the tx carrying offsetSec (and no fixed stampText), the stamp is
     * rebased so the OFFSET reads exactly as written no matter when the director plays it.
     */
    stampFor(txOrId, nowMin) {
      const t = typeof txOrId === 'string' ? tx[txOrId] : txOrId;
      if (!t) return null;
      const C = DA.clock;
      if (t.stampText) return { min: null, text: t.stampText, offsetSec: t.offsetSec == null ? null : t.offsetSec };
      let min = null;
      if (nowMin != null && (t.stampNow || t.offsetSec != null)) min = nowMin + (t.offsetSec || 0) / 60;
      else if (t.stamp && C) min = C.toMin(t.stamp.day, t.stamp.h, t.stamp.m);
      else if (nowMin != null) min = nowMin;
      if (min == null) return null;
      return { min, text: C ? C.stamp(min) : '', offsetSec: nowMin != null ? Math.round((min - nowMin) * 60) : (t.offsetSec == null ? null : t.offsetSec) };
    },

    /**
     * The NOAA loop's sunrise line for the night as it is (tx_weather_loop step flagged `sunrise`):
     * DA.state.sunrise pushed back by every interference, then garbled once sunrise_unknown is set.
     * → 'Sunrise at 7:17 a.m. Sunset at 5:58 p.m.' | 'Sunrise at— … at—' (with {cap} for a caption).
     */
    sunriseLine() {
      const st = DA.state || {};
      if (st.flags && st.flags.sunrise_unknown) return { t: 'Sunrise at— ...Sunrise at—', cap: '[the recording skips]' };
      const min = st.sunrise != null ? +st.sunrise : 1440 + 6 * 60 + 42;
      const tot = Math.round(((min % 1440) + 1440) % 1440);
      let h = Math.floor(tot / 60), m = tot % 60;
      const ampm = h >= 12 ? 'p.m.' : 'a.m.';
      h = h % 12 || 12;
      return { t: 'Sunrise at ' + h + ':' + String(m).padStart(2, '0') + ' ' + ampm + ' Sunset at 5:58 p.m.' };
    },

    /**
     * A clock time as a person says it on the radio: (6, 35) → 'six thirty-five', (6, 5) → 'six oh-five',
     * (7, 0) → "seven o'clock", (23, 31) → 'eleven thirty-one'.
     */
    spokenTime(h, m) {
      const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
        'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
      const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
      h = ((Math.floor(+h) % 24) + 24) % 24;
      m = ((Math.floor(+m) % 60) + 60) % 60;
      const hw = ONES[h % 12 || 12];
      if (m === 0) return hw + " o'clock";
      const mw = m < 10 ? 'oh-' + ONES[m] : m < 20 ? ONES[m] : TENS[Math.floor(m / 10)] + (m % 10 ? '-' + ONES[m % 10] : '');
      return hw + ' ' + mw;
    },

    /** Rough word count of everything spoken or shown (for the writer's report). */
    wordCount() {
      let n = 0;
      const walk = (o) => {
        if (typeof o === 'string') { if (!/^<svg/.test(o)) n += o.split(/\s+/).filter(Boolean).length; }
        else if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') for (const k in o) if (k !== 'voice' && k !== 'svg' && k !== 'pts' && k !== 'color') walk(o[k]);
      };
      walk({ tx, outgoing, roomfeed, notes, tapes, docs, dialogue, fragments, endings, death, objectives, items, looks, drive });
      return n;
    },
  };
})();
