/* DEAD AIR — radio.js
 * The operator's receiver desk and the transmission engine that drives most of the story
 * (README "The radio system", "Future delay mechanic"; PLAN.md §6.5, §4, §6.8, §7.4).
 *
 *   • Signal model — every live source (story transmissions, the NOAA loop on 162.55,
 *     CB / sheriff murmur, faint ambient carriers, room feed 014.00, breathing 000.00,
 *     collapse jamming) has  clarity = strength × fFreq × fBearing × power.
 *     Lock = clarity ≥ 0.7 held for 1 s (weak transmissions: see DEVIATIONS).
 *   • Transmission engine — transmit() hails until lock, numbers + logs the reception,
 *     then interprets the content script (lines, sfx, waits, choices, goto, fx, emit, end).
 *     Spoken answers are recorded; answering a *future* transmission is interference.
 *   • Outgoing traffic, room feeds (OFFSET countdown), auto-scan, power, jamming, the
 *     000.00 breathing, the you_realtime echo and the cassette deck.
 *   • Desk UI — mode 'radio' (opaque, free cursor) + interact kind 'radio'. The panadapter
 *     is rendered as pixels (one putImageData per frame), the rest is DOM + CSS (radio.css).
 *
 * ── DEVIATIONS (documented, contract-compatible) ────────────────────────────────────────
 *   Weak signals: content uses strengths down to 0.45 for "weak signal" calls that must still be
 *   loggable, so tx/weather sources lock at min(0.7, 0.92 × strength) — i.e. when tuned and aimed
 *   as well as they can be. Their words then read clean; the voice keeps the raw (weak) clarity.
 *   LogEntry.offset is only written while state.radio.offsetUnit (the unit "starts displaying");
 *   setOffsetUnit(true) back-fills older entries and the LCD flickers on showing the most recent
 *   non-present offset (the woman's +24:00:00) the next time the operator looks at it.
 *
 * ── ADDITIONS beyond PLAN.md (all backwards compatible) ──────────────────────────────────
 * API
 *   DA.radio.freq / bearing / power      read-only getters
 *   tune(freq, {glide})                  set the dial (glide = short mechanical sweep, no scan tone)
 *   setBearing(deg, {instant})           point the antenna rotator (motor-driven unless instant)
 *   setVolume(v) / setSquelch(v)         knobs 0..1 (persisted; squelch 0 = open = PLAN static formula)
 *   setScanning(on)                      persistent idle self-sweep (state.radio.scanning): "the
 *                                        receiver starts sweeping by itself between story transmissions"
 *   isLocked(id)                         live lock on a transmission or special source ('weather'…)
 *   best()                               {id, kind, clarity, freq} strongest source heard, or null
 *   log(numOrTxId?)                      what the LOG button does (latest unlogged entry if no arg)
 *   pending()                            the choice waiting on the mic: {txId, node, prompt, options}
 *   pick(optionIdOrIndex)                answer the pending choice as if spoken on the mic
 *   outgoingList() / outgoingHere()      queued outgoing messages (all / sendable on this frequency)
 *   send(outId)                          send an outgoing message as if chosen on the mic
 *   stopFeed(feedId) / feedCountdown()   room feeds
 *   playTape(opts?) / stopTape() / ejectTape()   (PLAY on the station's own cassette = your
 *                                        recordings; refused while deckLocked() unless opts.force)
 *   addNote({freq,label,hand})           object form (e.g. DA.content.notebook.room); labels that
 *                                        repeat the frequency ('014.00 — ???') lose the prefix
 *   sit() / stand()                      push / pop mode 'radio'
 *   isBusy({feeds}?) → bool              a transmission is on the air (hailing, playing or suspended
 *                                        by the power switch), a tape is playing or the operator is
 *                                        talking on the mic ({feeds:true}: or a room feed) — the
 *                                        director waits for !isBusy() before the next story
 *                                        transmission / reward so nothing overlaps
 *   tapePlaying() → bool                 the cassette deck is playing (a found tape or the logger)
 *   setMicNote(text|null, {freq}?)       what the mic panel says when there is nothing to send here
 *                                        (e.g. '[find the location on the wall map first]' while the
 *                                        director waits for a need); {freq}: only on that frequency.
 *                                        null restores '[nothing to send on this frequency]';
 *                                        cleared by runtime:reset (death / load / new game)
 *   quiet(on?) → bool                    hush ambient traffic (state.radio.quiet, saved with the game):
 *                                        the NOAA loop holds (restarts from the top ≥ 12 s after),
 *                                        CB/dispatch murmur is cut off and stops keying up, the idle
 *                                        self-sweep stays put (a running one is cancelled). Story
 *                                        transmissions, room feeds, 000.00 and the static are never
 *                                        hushed. quiet() with no argument reads it. Event radio:quiet
 *                                        {on}. The director sets it for the dark and other tense beats
 *                                        and clears it after. A FORCED room feed hushes the same
 *                                        things by itself while it plays (isHushed() → either)
 *   deckLocked() → bool                  the cassette deck refuses to start: a story transmission is
 *                                        being received (locked, not suspended) or a room feed is
 *                                        heard / forced. PLAY / insertTape then click, the strip says
 *                                        '[deck locked — receiving]' and event tape:locked {id} fires;
 *                                        playTape({force:true}) and the director's playSelf() bypass it
 *   suspended() → [txId]                 transmissions waiting (suspended) for the power switch; while
 *                                        any wait with the receiver off the POWER rocker's standby
 *                                        neon pulses at the desk
 *   jolt(amount=1) → bool                the seated view jolts (the chair moves, something falls);
 *                                        no-op away from the desk. roomfeed:event chair_move /
 *                                        jar_fall jolt the desk (+ chair_scrape) by themselves when
 *                                        the director has not already done it within 0.12 s
 *   _rt, _draw                           debug/tests only
 * Desk behaviour (fix-d)
 *   STATION TIME shows HH:MM with a blinking colon (1 Hz) — never racing seconds (decision 2).
 *   2049: while DA.world.hasMutation('abandoned') (or the map variant is 'abandoned') the desk root
 *     gets .radio-abandoned — dust + cobwebs, grey daylight, yellowed/curled paper, a cracked VFD,
 *     dead room lamps (no fluorescent flicker / desk lamp / rain light / red mains-dead cast); the
 *     receiver itself is still, somehow, on. The logger cassette reads 'LOG 26/27 OCT 1999'.
 *   Choice wait lines never overlap the timeout: none starts unless it can finish ≥ 2 s before the
 *     timeout, and a timeout that falls inside one waits until it has been spoken. Keying the mic
 *     (an answer) cuts a wait line that is still playing.
 *   A reception relocking after a power cut, a forced room feed starting and any room feed line
 *     heard all click a playing cassette off (one voice at a time).
 * Desk behaviour (wave 3)
 *   Duty slip: the open objectives (DA.state.objectives, live on objective:set/done/remove) on a
 *     small slip pinned to the left wall — new ones flash, done ones are ticked, then drop off.
 *     The LOG BOOK pulses while obj_check_log is open; the Quick Reference lists TAB.
 *   Mic panel: outgoing traffic queued on OTHER frequencies is listed greyed with its frequency
 *     ("027.18 · CB 19 — …  TUNE ▸"); clicking it (or its number when nothing is pending here)
 *     tunes there and keeps the mic open. Pending choices show a draining timeout bar.
 *   Power switch: switching off never destroys a transmission — every live one (hailing or
 *     mid-script) is SUSPENDED (voices cut, pending choice withdrawn, hail timeout paused, entry
 *     shown INTERRUPTED) and on power-on hails again, relocks under the SAME number/entry and
 *     replays the node it was in. Only the transmission whose chosen option has action
 *     'power_off' ends. A transmission started while the power is off waits suspended.
 *     Events radio:suspended {txId, num} / radio:resumed {txId, num}.
 *   Self-scan (state.radio.scanning) never sweeps while a transmission / room feed / tape is live,
 *     while a breathing, room-feed or story carrier is near the dial, while the dial sits on
 *     000.00 or 014.00, while outgoing traffic is queued on this frequency or a choice waits,
 *     within 45 s of the player touching the dial/antenna (tune/nudge/drag/wheel/keys/setBearing)
 *     or within 20 s after a transmission, feed, tape or a director autoScan ends.
 *   Room feeds with a NEGATIVE offset (the event already happened): their events and
 *     roomfeed:zero fire at once; the OFFSET LCD holds '-00:00:04' (red) while the feed is heard.
 *     offsetOverride() changes flash the LCD (erratic offsets).
 *   Jam flood: bracketed captions from earlier deaths come back as captions + static, never as
 *     dialogue; fragments stay on screen; away-from-desk flood subtitles carry opts.frag = true.
 *   A transmission locking while a tape plays clicks the deck off. The you_realtime echo line is
 *     labelled 'YOU · +00:00:00'.
 * transmit(tx, opts) extra opts: freq, bearing, strength, width (overrides), vars (values or
 *   fn(T) → value), hailTimeout (s; unanswered hails end it → result.missed), drift {amp, period}
 *   (a wandering carrier, e.g. the keep-the-channel ending), loop / loopGap, node (start node),
 *   silent (no alert tone). transmit('tx_weather_loop') is a no-op: it is always on the air.
 * Content read (all optional): tx.noLock (hint, used unless opts.noLock is given), tx.loop +
 *   loopGap (repeat until stopped), tx.stampNow, tx.offsetSec (relative to reception), tx.stamp
 *   {day,h,m} | {min} | {y, mo(1-12), d, h, m}, templated stampText / offsetText / cap, tx.drift,
 *   tx.hailTimeout, tx.waitGap, tx.timeout; option.log (and option id 'log') also logs the entry;
 *   option.interfere:true forces interference even on present-time traffic; script step
 *   `sunrise: true` (tx_weather_loop) speaks DA.content.sunriseLine() → {t, cap?} instead of its
 *   literal words, re-read every time it airs (each NOAA loop pass: DA.state.sunrise as pushed back
 *   by interference; after flag sunrise_unknown the garbled line, its cap '[the recording skips]'
 *   + a crackle landing where the words break off). A story transmission on 162.55 itself
 *   (tx_filler_1, tx_18) cuts the NOAA loop while it is active — never two NOAA voices at once —
 *   and the loop restarts from the top ≥ 12 s after it ends; DA.content.notebook
 *   (array or {defaults:[…]}), DA.content.murmur [strings], DA.content.outgoing[id] (string or
 *   {text, freq, future, once, fx, label — optional short gist for the mic panel's "queued on
 *   other frequencies" rows, else the text minus its call-up}), DA.content.death.call,
 *   DA.content.deskNotice.
 * Templating: {NUM} {NUM+k} {NUM-k} = this transmission's log number; {N19} defaults to NUM+2 in
 *   words ('nineteen', as content expects) when opts.vars does not supply it.
 * Result: {txId, num, choices: {node: optionId, optionId: true, …}, path: [optionIds], choice,
 *   responded, completed, timedOut, stopped, missed}.
 * LogEntry extra fields: min (game minute received), originMin, offsetSec (raw, may be null),
 *   offsetText, responded. Status 'INTERRUPTED' when a received transmission is cut off.
 * State extra fields: squelch, outgoing[], jam, offsetOverride, tapeCounter, quiet.
 * Audio: voice handles get setClarity/setVol every frame (tuning away mid-line degrades it);
 *   radioStatic tone = heterodyne whistle near an unresolved carrier; 000.00 uses the engine's
 *   phase-locked loop('breath_other', {mirror}) when present (else one-shots on breathPhase()).
 * Events added: radio:sit, radio:stand, radio:choose {txId, node, options}, radio:offset-unit {on},
 *   radio:scan {freq, done}, radio:action {txId, action}, radio:missed {txId},
 *   radio:suspended {txId, num} / radio:resumed {txId, num} (power switch, see above),
 *   radio:breathing {mine} (000.00: '[breathing]' starts / becomes '[your breathing]'),
 *   radio:quiet {on} (quiet()), tape:locked {id} (the deck refused to start over a reception),
 *   roomfeed:zero {feed} (the OFFSET countdown reached zero).
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const U = DA.util;

  /* ================================================================ constants */
  const FMIN = 0, FMAX = 199.99;
  const LOCK_AT = 0.7;          // clarity needed for a lock…
  const LOCK_HOLD = 1.0;        // …held this long (s)
  const LOST_AT = 0.55;         // hysteresis: a live lock drops below this
  const HALF_SPAN = 0.5;        // spectrum shows ±0.5 MHz
  const DEG_PER_MHZ = 720;      // one full turn of the big dial = 0.50 MHz
  const BEARING_SPEED = 110;    // rotator motor, degrees / second
  const DEFAULT_TIMEOUT = 45;   // choose timeout (s)
  const F = { cb19: 27.18, air: 121.5, reserved: 148.32, dispatch: 155.34, sheriff: 155.47, noaa: 162.55, room: 14.0, breath: 0.0 };

  /** Hollis's page of the frequency notebook (PLAN §7.4). DA.content.notebook overrides. */
  const NOTEBOOK_DEFAULT = [
    { freq: 155.34, label: 'County Dispatch / EMS', hand: 'hollis' },
    { freq: 155.47, label: "Sheriff — aim S", hand: 'hollis' },
    { freq: 27.18, label: 'CB 19 truckers — aim E', hand: 'hollis' },
    { freq: 162.55, label: 'NOAA weather — N', hand: 'hollis' },
    { freq: 121.5, label: 'Aviation guard (quiet)', hand: 'hollis' },
    { freq: 148.32, label: 'RESERVED. LOG ONLY.', hand: 'hollis', mark: 'reserved' },
  ];
  /** Background chatter. Never shown above ~0.4 clarity, so it is always unintelligible. */
  const MURMUR_DEFAULT = [
    'copy that, ten four, we are clear on the county line',
    'breaker one nine, anybody got their ears on out by the quarry',
    'negative, unit twelve, hold at the junction for now',
    'yeah it is coming down pretty good out here, real slow going',
    'roger, show me en route, about ten out',
    'say again, you are breaking up on me',
    'mile marker thirty westbound, got a load shifting',
    'dispatch, unit four, back in service',
  ];
  const HAND_INK = { hollis: 'hollis', you: 'you' };

  /* ================================================================== helpers */
  const q2 = (f) => Math.round(f * 100) / 100;
  const fmtFreq = (f) => U.clamp(q2(f), FMIN, FMAX).toFixed(2).padStart(6, '0');
  const now = () => DA.simTime;
  const content = () => DA.content || {};
  const ihash = (n) => {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  };
  function sfx(name, opts) {
    const a = DA.audio;
    if (!a || !a.play) return null;
    try { return a.play(name, opts || {}); } catch (e) { console.error('[radio] sfx', name, e); return null; }
  }
  function voice(text, spk, opts) {
    const a = DA.audio;
    if (!a || !a.voice) return null;
    try { return a.voice(text, spk, opts || {}); } catch (e) { console.error('[radio] voice', e); return null; }
  }
  function stopHandle(h) { if (h && h.stop) try { h.stop(0.08); } catch (e) { /* already stopped */ } }
  function speakerInfo(id) {
    const s = (content().speakers || {})[id];
    return { name: (s && s.name) || String(id || '').toUpperCase(), color: (s && s.color) || null };
  }
  function atDesk() { return !!(DA.modes && DA.modes.has('radio')); }
  /** The station is the abandoned 2049 one (world mutation / map variant 'abandoned'). */
  function abandoned() {
    const w = DA.world;
    if (!w) return false;
    try { if (w.hasMutation && w.hasMutation('abandoned')) return true; } catch (e) { /* ignore */ }
    return !!(w.map && w.map.variant === 'abandoned');
  }
  /** How well the desk speaker is heard where the player is (1 at the desk). */
  function audibility() {
    if (atDesk()) return 1;
    const w = DA.world;
    if (w && w.radioAudibility) try { return U.clamp(+w.radioAudibility() || 0, 0, 1); } catch (e) { /* ignore */ }
    return 0;
  }
  /** Display/voice clarity from raw clarity: a proper lock reads clean, the edge of lock mostly clean. */
  const dispC = (c) => U.clamp((c - 0.05) / 0.66, 0, 1);

  /* ==================================================================== state */
  /** Hollis's page: DA.content.notebook (array or {defaults:[…]}) or the built-in list. */
  function notebookDefaults() {
    const cn = content().notebook;
    const list = Array.isArray(cn) ? cn : cn && Array.isArray(cn.defaults) ? cn.defaults : NOTEBOOK_DEFAULT;
    return list.map((n) => noteEntry(n.freq, n.label, n.hand || 'hollis', n.mark));
  }
  /** Normalise a notebook line: labels that repeat the frequency ('014.00 — ???') lose the prefix. */
  function noteEntry(freq, label, hand, mark) {
    const f = q2(+freq || 0);
    let l = String(label == null ? '' : label).trim();
    const fs = fmtFreq(f);
    if (l.startsWith(fs)) l = l.slice(fs.length).replace(/^\s*[—–-]\s*/, '').trim();
    const n = { freq: f, label: l, hand: hand || 'you' };
    if (mark || (Math.abs(f - F.reserved) < 0.001 && n.hand === 'hollis')) n.mark = mark || 'reserved';
    return n;
  }
  function defaults() {
    const nb = notebookDefaults();
    return {
      freq: F.dispatch, bearing: 0, power: true, volume: 0.8, squelch: 0, offsetUnit: false,
      log: [], nextNum: 1, notebook: nb, recordings: [], tape: null, scanning: false,
      outgoing: [], jam: 0, offsetOverride: null, tapeCounter: 0, quiet: false,
    };
  }
  function ensureState() {
    if (!DA.state.radio || typeof DA.state.radio !== 'object') DA.state.radio = {};
    const r = DA.state.radio, d = defaults();
    for (const k in d) if (!(k in r) || r[k] === undefined) r[k] = d[k];
    return r;
  }
  function R() {
    const r = DA.state.radio;
    return r && r.nextNum != null ? r : ensureState();
  }

  /* ================================================================== runtime */
  const rt = {
    sources: [],        // live sources this frame
    active: new Map(),  // txId → T (transmission runtime)
    feeds: [],          // active room feeds
    weather: null,      // NOAA loop playhead
    breath: { listen: 0, phase: 0, prevPhase: 0, exert: 0, caption: null },
    scan: null,         // autoScan animation {from, to, t, dur, resolve, h}
    glide: null,        // tune({glide}) animation
    selfScan: { idle: 0, dwell: 0, touch: 999, quiet: 999 },
    tapePlay: null,     // current tape playback
    tapeInsert: 0,      // invalidates delayed cassette starts
    controlDrag: null,  // cleanup for the current captured control gesture
    micNote: null,      // setMicNote(): {text, freq|null}
    joltT: -99,         // simTime of the last jolt()
    dutyDone: new Map(), // objective id → simTime it was ticked (stays on the slip a moment)
    dutyNew: new Map(),  // objective id → simTime it appeared (flashes)
    best: null, bestC: 0, presence: 0, presSrc: null,
    dialAcc: F.dispatch * 100, dialVel: 0, dragging: false,
    bearingTarget: 0,
    liveLock: false, carrierOn: false,
    mic: { open: false, keyed: false, latched: false, speaking: 0, items: [], kind: 'none' },
    strip: [],          // desk subtitle lines
    frags: [],          // jam fragments on screen
    fragT: 0,
    blipT: 0,
    logFlash: 0,
    lockFlash: 0,
  };

  /* ============================================================ signal model */
  /** fBearing: ≈1 within ±20°, ≈0.5 at ±60°, ≈0.15 beyond 100°; omni sources (null) = 1. */
  function fBearing(srcBearing) {
    if (srcBearing == null) return 1;
    const d = U.angleDiffDeg(R().bearing, srcBearing);
    if (d <= 20) return 1;
    if (d <= 60) return U.lerp(1, 0.5, U.smoothstep(20, 60, d));
    if (d <= 100) return U.lerp(0.5, 0.15, U.smoothstep(60, 100, d));
    return 0.15;
  }
  const fFreq = (df, width) => Math.pow(U.clamp(1 - Math.abs(df) / (width || 0.05), 0, 1), 0.7);
  /**
   * Lock threshold: clarity ≥ 0.7 (PLAN §6.5). Weak transmissions (content uses strengths down to
   * 0.45 for "weak signal" calls that must still be logged) lock at 92% of their best possible
   * clarity instead, i.e. when tuned and aimed as well as they can be.
   */
  function lockThr(s) {
    if (s.kind === 'tx' || s.kind === 'weather') return Math.min(LOCK_AT, 0.92 * (s.strength || 0));
    return LOCK_AT;
  }
  function srcFreq(s) {
    let f = s.freq;
    if (s.drift) {
      const w = (2 * Math.PI) / (s.drift.period || 20), t = now();
      f += s.drift.amp * (0.72 * Math.sin(w * t + (s.drift.ph || 0)) + 0.28 * Math.sin(w * 2.71 * t + (s.drift.ph2 || 1.3)));
    }
    return f;
  }
  /** Keying envelope 0..1 (pulsed beacons, murmur that only carries while someone talks). */
  function srcOn(s) {
    if (s.kind === 'murmur') return s.keyed;
    if (s.pulse) return ((now() / s.pulse.period + s.pulse.ph) % 1) < s.pulse.duty ? 1 : 0;
    if (s.kind === 'feed') return 1;
    return s.on == null ? 1 : s.on;
  }
  /** Raw clarity of one source right now (power included). */
  function clarityRaw(s) {
    if (!R().power) return 0;
    return s.strength * srcOn(s) * fFreq(R().freq - srcFreq(s), s.width) * fBearing(s.bearing);
  }
  /** Clarity ignoring the keying envelope (what a keyed carrier would give). */
  function clarityKeyed(s) {
    if (!R().power) return 0;
    return s.strength * fFreq(R().freq - srcFreq(s), s.width) * fBearing(s.bearing);
  }
  /** Procedural collapse jamming: carriers every 20 kHz bin, density ∝ level. */
  function jamAt(bin, t) {
    const lvl = R().jam;
    if (lvl <= 0) return 0;
    const h = ihash((bin * 2654435761) ^ (DA.state.seed | 0));
    if ((h % 1000) / 1000 > lvl * 0.72) return 0;
    const base = 0.25 + ((h >>> 10) % 1000) / 1000 * 0.6;
    const fl = 0.55 + 0.45 * Math.sin(t * (1.3 + ((h >>> 20) % 7)) + (h % 97));
    return base * fl * Math.min(1, lvl * 1.4);
  }

  /** Every source that is always on the air (rebuilt from state on game:new/load). */
  function buildSources() {
    const keepClear = [F.cb19, F.air, F.reserved, F.dispatch, F.sheriff, F.noaa, F.room, F.breath, 148.28];
    const rnd = U.mulberry32((DA.state.seed ^ U.hash('radio:carriers')) >>> 0);
    const list = [];
    const offsets = [7, -4, 12, 194, -120, 2460, 86400, 172800, 3 * 365 * 86400, 41 * 365 * 86400, 0, 0, 0, 38, 600, -2];
    // Faint unintelligible carriers scattered across the whole band: the spectrum is alive.
    for (let i = 0; i < 120; i++) {
      const f = q2(0.4 + rnd() * 199.2);
      if (keepClear.some((k) => Math.abs(k - f) < 0.18)) continue;
      list.push({
        id: 'amb' + i, kind: 'ambient', freq: f,
        bearing: rnd() < 0.35 ? null : Math.floor(rnd() * 360),
        width: 0.012 + rnd() * 0.028,
        strength: 0.07 + rnd() * rnd() * 0.4,
        pulse: rnd() < 0.3 ? { period: 1.2 + rnd() * 9, duty: 0.25 + rnd() * 0.55, ph: rnd() } : null,
        drift: rnd() < 0.25 ? { amp: 0.004 + rnd() * 0.012, period: 9 + rnd() * 40, ph: rnd() * 6.3, ph2: rnd() * 6.3 } : null,
        offsetSec: offsets[Math.floor(rnd() * offsets.length)] * (rnd() < 0.5 ? 1 : 1.0 + rnd()),
      });
    }
    // Busy bands: CB channels around 27 MHz and public-safety traffic around 155 MHz.
    const murmurs = [
      [26.98, 'trucker', 80], [27.05, 'unknown', 110], [27.12, 'trucker', 70], [27.25, 'trucker', 95], [27.33, 'unknown', null],
      [155.13, 'dispatch', null], [155.4, 'police', 175], [155.58, 'police', 200], [155.64, 'dispatch', null],
    ];
    murmurs.forEach(([f, spk, brg], i) => {
      list.push({
        id: 'mur' + i, kind: 'murmur', freq: f, bearing: brg, width: 0.02 + rnd() * 0.01,
        strength: 0.38 + rnd() * 0.2, speaker: spk, keyed: 0, talk: 0, idle: 1 + rnd() * 10, offsetSec: 0,
      });
    });
    // NOAA weather on 162.55 — always broadcasting the loop (parameters from tx_weather_loop).
    const wx = (content().tx || {}).tx_weather_loop || {};
    list.push({
      id: 'weather', kind: 'weather', freq: q2(wx.freq != null ? wx.freq : F.noaa), bearing: wx.bearing !== undefined ? wx.bearing : 0,
      width: wx.width || 0.05, strength: wx.strength != null ? wx.strength : 0.8, lockable: true, offsetSec: 0,
    });
    rt.sources = list;
    syncSpecialSources();
  }
  /** 014.00 room feed and 000.00 breathing exist only after the offset unit comes on. */
  function syncSpecialSources() {
    const on = !!R().offsetUnit;
    const has = (id) => rt.sources.some((s) => s.id === id);
    if (on && !has('roomfeed')) rt.sources.push({ id: 'roomfeed', kind: 'feed', freq: F.room, bearing: null, width: 0.04, strength: 0.5, lockable: true, offsetSec: 0 });
    if (on && !has('breathing')) rt.sources.push({ id: 'breathing', kind: 'breath', freq: F.breath, bearing: null, width: 0.03, strength: 0.93, lockable: true, offsetSec: 0 });
    if (!on) rt.sources = rt.sources.filter((s) => s.id !== 'roomfeed' && s.id !== 'breathing');
  }
  const findSrc = (id) => rt.sources.find((s) => s.id === id) || null;

  /** Per-frame: clarity of every source, best source, carrier presence, locks. */
  function computeSignals(dt) {
    const r = R(), f = r.freq, pw = r.power ? 1 : 0, t = now();
    let best = null, bestC = 0, presence = 0, presSrc = null;
    for (const s of rt.sources) {
      const sf = srcFreq(s);
      s.cur = sf;
      const on = srcOn(s), fb = fBearing(s.bearing), df = f - sf;
      s.ff = fFreq(df, s.width);
      s.fb = fb;
      s.c = s.strength * on * s.ff * fb * pw;
      if (s.c > bestC) { bestC = s.c; best = s; }
      if (Math.abs(df) < HALF_SPAN && pw) {
        const p = s.strength * on * fb * (1 - Math.abs(df) / HALF_SPAN);
        if (p > presence) { presence = p; presSrc = s; }
      }
      // Tuning blips: crossing into a carrier while the dial moves.
      const inside = s.ff > 0 && s.strength * on * fb > 0.12;
      if (inside && !s.inside && rt.freqMoved && pw && rt.blipT <= 0) {
        sfx('tuning', { radio: true, vol: 0.25 + 0.5 * s.strength * fb });
        rt.blipT = 0.07;
      }
      s.inside = inside;
    }
    // Jamming pseudo-source.
    if (r.jam > 0 && pw) {
      const b0 = Math.round(f * 50);
      let jc = 0;
      for (let b = b0 - 2; b <= b0 + 2; b++) jc = Math.max(jc, jamAt(b, t) * fFreq(f - b / 50, 0.03));
      if (jc > bestC) { bestC = jc; best = { id: 'jam', kind: 'jam', freq: f, c: jc, offsetSec: null }; }
      presence = Math.max(presence, r.jam);
    }
    rt.best = best && bestC > 0.02 ? best : null;
    rt.bestC = bestC;
    rt.presence = presence;
    rt.presSrc = presSrc;

    // Locks (tx, weather, room feed, breathing).
    let live = false;
    for (const s of rt.sources) {
      if (!s.lockable) continue;
      const thr = lockThr(s);
      if (thr > 0 && s.c >= thr) {
        s.lockT = (s.lockT || 0) + dt;
        if (!s.live && s.lockT >= LOCK_HOLD) {
          s.live = true;
          rt.lockFlash = 0.6;
          DA.bus.emit('radio:lock', { txId: s.T ? s.T.id : s.id, id: s.id, kind: s.kind, freq: q2(s.freq) });
          if (s.T && !s.T.locked) doLock(s.T);
        }
      } else {
        s.lockT = 0;
        if (s.live && s.c < thr - (LOCK_AT - LOST_AT)) {
          s.live = false;
          DA.bus.emit('radio:lost', { txId: s.T ? s.T.id : s.id, id: s.id, kind: s.kind, freq: q2(s.freq) });
        }
      }
      if (s.live) live = true;
    }
    rt.liveLock = live;
    const carrier = presence > 0.12;
    if (carrier !== rt.carrierOn) {
      rt.carrierOn = carrier;
      DA.bus.emit('radio:carrier', { on: carrier, freq: presSrc ? q2(presSrc.freq) : null, id: presSrc ? presSrc.id : null });
    }
  }

  /* =========================================================== audio routing */
  /** More garble with distance from the desk speaker. */
  const awayClarity = (c, aud) => c * (0.4 + 0.6 * U.smoothstep(0.12, 0.75, aud));
  /** Away-from-desk subtitles whose clarity follows the dial / the listener. */
  const awaySubs = [];
  function updateAwaySubs(dt) {
    if (!awaySubs.length) return;
    const ui = DA.ui, aud = audibility();
    for (let i = awaySubs.length - 1; i >= 0; i--) {
      const a = awaySubs[i];
      a.left -= dt;
      if (a.left <= 0 || !ui || !ui.updateSubtitle) { awaySubs.splice(i, 1); continue; }
      const ce = awayClarity(a.ch.clar(), aud);
      if (Math.abs(ce - a.last) > 0.04) {
        a.last = ce;
        try { ui.updateSubtitle(a.id, { clarity: ce }); } catch (e) { awaySubs.splice(i, 1); }
      }
    }
  }
  /** Voices on the air: their clarity and volume follow the dial and the listener live. */
  const liveVoices = [];
  function trackVoice(h, ch, dur) {
    if (h && (h.setClarity || h.setVol)) liveVoices.push({ h, ch, left: (h.dur || dur || 2) + 0.3 });
  }
  function updateVoices(dt) {
    const aud = audibility(), vol = R().volume;
    for (let i = liveVoices.length - 1; i >= 0; i--) {
      const v = liveVoices[i];
      v.left -= dt;
      if (v.left <= 0) { liveVoices.splice(i, 1); continue; }
      const c = v.ch.vclar ? Math.min(v.ch.clar(), v.ch.vclar()) : v.ch.clar();
      try {
        if (v.h.setClarity) v.h.setClarity(U.clamp(c, 0, 1));
        if (v.h.setVol) v.h.setVol(c <= 0.02 ? 0 : vol * aud);
      } catch (e) { liveVoices.splice(i, 1); }
    }
  }
  /**
   * Put one heard line on the air: desk strip + voice at the desk, or a 'radio' subtitle +
   * attenuated voice away from it. ch = {id, kind, clar() → text clarity 0..1, vclar()? → voice
   * clarity}. Returns the voice handle (or null).
   */
  function airLine(ch, spk, text, dur, opts) {
    opts = opts || {};
    const c = ch.clar();
    const vc = ch.vclar ? Math.min(c, ch.vclar()) : c;
    const seed = opts.seed != null ? opts.seed : U.hash(text) & 0xffff;
    let handle = null;
    if (atDesk()) {
      addStrip({ kind: opts.kind || 'line', speaker: spk, text, dur, seed, clar: ch.clar, ch });
      if (c > 0.05 && spk && !opts.noVoice) handle = voice(text, spk, { radio: true, clarity: vc, vol: R().volume, tape: !!opts.tape, squelch: !!opts.squelch });
    } else {
      const aud = audibility();
      if (aud > 0.02 && c > 0.05) {
        if (spk && !opts.noVoice) handle = voice(text, spk, { radio: true, clarity: vc, vol: R().volume * aud, tape: !!opts.tape, squelch: !!opts.squelch });
        if (aud > 0.12 && DA.ui && DA.ui.subtitle) {
          // The UI garbles 'radio' subtitles by clarity itself (and keeps the plain line in its
          // history), so we pass the words and a distance-scaled clarity, then keep it live.
          const ce = awayClarity(c, aud);
          try {
            const id = DA.ui.subtitle(text, { kind: opts.kind === 'cap' ? 'sfx' : 'radio', speaker: spk, clarity: opts.kind === 'cap' ? null : ce, dur, seed: seed + 1 });
            if (id != null && opts.kind !== 'cap') awaySubs.push({ id, ch, left: dur + 0.5, last: ce });
          } catch (e) { console.error(e); }
        }
      }
    }
    if (handle && !opts.tape) trackVoice(handle, ch, dur);
    return handle;
  }
  function radioSfx(name, ch, vol) {
    const c = ch ? ch.clar() : 1;
    const aud = audibility();
    if (!name || c < 0.05 || aud < 0.02) return null;
    return sfx(name, { radio: true, vol: (vol == null ? 1 : vol) * R().volume * aud * (0.35 + 0.65 * c) });
  }

  /* ============================================================ transmissions */
  function resolveTx(txOrId) {
    if (!txOrId) return null;
    if (typeof txOrId === 'string') {
      const tx = (content().tx || {})[txOrId];
      if (!tx) { console.warn('[radio] unknown transmission', txOrId); return null; }
      return Object.assign({ id: txOrId }, tx);
    }
    return Object.assign({ id: txOrId.id || 'tx_anon_' + Math.floor(Math.random() * 1e6) }, txOrId);
  }
  function scriptNode(tx, node) {
    const sc = tx.script;
    if (!sc) return node === 'start' ? tx.lines || [] : null;
    if (Array.isArray(sc)) return node === 'start' ? sc : null;
    return sc[node] || null;
  }
  /** Origin moment of a transmission in game minutes (null = present / unknown). */
  function originOf(tx, startMin) {
    if (tx.stampNow) return startMin;
    const st = tx.stamp;
    if (st && typeof st === 'object') {
      if (st.min != null) return st.min;
      if (st.y != null) {
        const ms = Date.UTC(st.y, (st.mo || 1) - 1, st.d || st.day || 1, st.h || 0, st.m || 0);
        return (ms - DA.START_UTC) / 60000;
      }
      if (st.day != null) return DA.clock.toMin(st.day, st.h || 0, st.m || 0);
    }
    if (tx.offsetSec != null) return startMin + tx.offsetSec / 60;
    return null;
  }
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  /** 19 → 'nineteen', 41 → 'forty-one' (spoken transmission numbers). */
  function numWords(n) {
    n = Math.floor(Math.abs(n));
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numWords(n % 100) : '');
    return String(n);
  }
  function fmtT(T, text) {
    if (text == null) return '';
    const s = String(text).replace(/\{NUM([+-]\d+)?\}/g, (m, k) => (T.num == null ? '??' : String(T.num + (k ? parseInt(k, 10) : 0))));
    const v = Object.assign({}, (T.opts && T.opts.vars) || {});
    if (!('N19' in v) && T.num != null) v.N19 = numWords(T.num + 2); // content: "in words ('nineteen')"
    const extra = {};
    for (const k in v) extra[k] = typeof v[k] === 'function' ? v[k](T) : v[k];
    return DA.fmt(s, extra);
  }

  /** Sleep that the transmission can cut short (wakeable) and that always ends on death. */
  function tsleep(T, sec, wakeable) {
    return new Promise((res) => {
      const rec = { wakeable: !!wakeable, done: false, fin: null };
      const fin = () => {
        if (rec.done) return;
        rec.done = true;
        T.sleepers.delete(rec);
        DA.timers.cancel(id);
        res();
      };
      rec.fin = fin;
      const id = DA.timers.after(Math.max(0, sec), fin);
      T.sleepers.add(rec);
    });
  }
  function wake(T, all) { for (const r of Array.from(T.sleepers)) if (all || r.wakeable) r.fin(); }

  /** Create the runtime for a transmission/tape/self-playback. */
  function makePlayer(kind, id, tx, opts) {
    return {
      kind, id, tx, opts: opts || {}, num: null, entry: null, src: null,
      locked: false, dead: false, sleepers: new Set(), handles: new Set(), pending: null,
      startMin: DA.clock.min, born: now(), node: 'start',
      result: { txId: id, num: null, choices: {}, path: [], choice: null, responded: false, completed: false, timedOut: false, stopped: false, missed: false },
      clar: null,
    };
  }

  /**
   * transmit(txOrId, opts) → Promise<result>. PLAN §6.5.
   * opts: force (auto-scan to it with the alert tone), noLock (plays regardless of tuning),
   * num, + ADDITIONS listed in the header.
   */
  function transmit(txOrId, opts) {
    opts = opts || {};
    const tx = resolveTx(txOrId);
    if (!tx) return Promise.resolve({ txId: String(txOrId), num: null, choices: {}, path: [], responded: false, completed: false, timedOut: false, error: 'unknown' });
    const existing = rt.active.get(tx.id);
    if (existing) return existing.promise;
    if (tx.id === 'tx_weather_loop' && rt.weather) {
      // Always on the air on 162.55 (see updateWeather); nothing to start.
      return Promise.resolve({ txId: tx.id, num: null, choices: {}, path: [], responded: false, completed: false, timedOut: false, alwaysOn: true });
    }
    const T = makePlayer('tx', tx.id, tx, opts);
    T.noLock = opts.noLock != null ? !!opts.noLock : !!tx.noLock;
    T.loop = opts.loop != null ? !!opts.loop : !!tx.loop;
    T.alert = !!(tx.alert || opts.force);
    T.src = {
      id: tx.id, kind: 'tx', T, lockable: true,
      freq: q2(opts.freq != null ? opts.freq : tx.freq != null ? tx.freq : R().freq),
      bearing: opts.bearing !== undefined ? opts.bearing : tx.bearing != null ? tx.bearing : null,
      width: opts.width || tx.width || 0.05,
      strength: opts.strength != null ? opts.strength : tx.strength != null ? tx.strength : 0.85,
      drift: opts.drift || tx.drift || null,
    };
    if (T.src.drift) T.src.drift = Object.assign({ amp: 0.03, period: 24, ph: Math.random() * 6.3, ph2: Math.random() * 6.3 }, T.src.drift);
    T.originMin = originOf(tx, T.startMin);
    // Words read clean once a (possibly weak) signal is tuned as well as it can be; the voice
    // keeps the raw clarity, so a weak transmission still sounds weak.
    T.clar = () => {
      if (!R().power) return 0;
      return T.noLock ? 1 : dispC(clarityRaw(T.src) * (LOCK_AT / Math.max(0.05, lockThr(T.src))));
    };
    T.vclar = () => {
      if (!R().power) return 0;
      const c = dispC(clarityRaw(T.src));
      return T.noLock ? Math.max(c, 0.9) : T.locked && T.src.live ? Math.max(c, 0.35) : c;
    };
    T.promise = new Promise((res) => (T.resolve = res));
    rt.active.set(tx.id, T);
    rt.sources.push(T.src);
    T.src.c = clarityRaw(T.src); // heard from the very first hail if already tuned
    rt.selfScan.idle = 0;
    if (rt.scan && rt.scan.self) cancelScan(); // the idle sweep yields to story traffic
    // Started while the receiver is off: it waits (suspended) and hails once the power is back.
    if (!R().power) suspendTx(T, true);
    else {
      if (T.alert && !opts.silent) alertTone();
      if (opts.force) autoScan(T.src.freq);
    }
    runTx(T).catch((e) => { console.error('[radio] transmission', tx.id, e); finishTx(T); });
    return T.promise;
  }
  /**
   * Power switch (design decision 10): a transmission is never destroyed by switching the receiver
   * off. It is suspended — voices cut, a pending choice withdrawn, the hail timeout paused, its log
   * entry shown INTERRUPTED — and resumeTx() makes it hail again; it relocks under the same number
   * and entry and replays the script node it was in.
   */
  function suspendTx(T, quiet) {
    if (!T || T.dead || T.finished || T.suspended) return;
    T.suspended = true;
    T.locked = false;
    T.resume = new Promise((res) => (T.resumeRes = res));
    const p = T.pending;
    if (p && p.resolve && !p.speaking) { p.speaking = true; p.resolve({ suspended: true }); }
    wake(T, true);
    for (const h of T.handles) stopHandle(h);
    T.handles.clear();
    if (T.entry && !T.entry.logged && T.entry.status === 'RECEIVED') {
      T.entry.status = 'INTERRUPTED';
      T.cutEntry = true;
      DA.bus.emit('radio:log-changed', { num: T.entry.num, entry: T.entry });
    }
    if (!quiet) DA.bus.emit('radio:suspended', { txId: T.id, num: T.num });
  }
  function resumeTx(T) {
    if (!T || !T.suspended || T.dead) return;
    T.suspended = false;
    if (T.src) { T.src.lockT = 0; T.src.live = false; }
    const r = T.resumeRes;
    T.resumeRes = null;
    if (r) r();
    if (T.alert && !T.opts.silent) alertTone();
    if (T.opts.force) autoScan(T.src.freq);
  }
  /** Transmissions waiting (suspended) for the receiver to be switched back on. */
  function suspendedIds() {
    const out = [];
    for (const T of rt.active.values()) if (T.suspended && !T.dead) out.push(T.id);
    return out;
  }
  function alertTone() {
    for (let i = 0; i < 3; i++) DA.timers.after(i * 0.28, () => { if (R().power) sfx('beep', { vol: 0.8 }); });
  }

  async function runTx(T) {
    let node = T.opts.node || 'start', skip = null;
    for (;;) {
      if (T.suspended) { await T.resume; if (T.dead) break; continue; }
      if (T.noLock) doLock(T);
      else await hailLoop(T);
      if (T.dead) break;
      if (T.suspended) continue;
      await tsleep(T, T.noLock ? 0.2 : 0.7);
      if (T.dead) break;
      if (T.suspended) continue;
      T.resumeNode = null;
      await runScript(T, node, skip);
      skip = null;
      // Looping carriers (tx.loop / opts.loop) repeat their script until stopped.
      while (T.loop && !T.dead && !T.suspended) {
        await tsleep(T, T.opts.loopGap != null ? +T.opts.loopGap : T.tx.loopGap != null ? +T.tx.loopGap : 4);
        if (T.dead || T.suspended) break;
        await runScript(T, 'start');
      }
      if (T.dead) break;
      // switched off mid-script: hail again after power-on, then replay the node it was in
      if (T.suspended) {
        if (T.resumeNode) { node = T.resumeNode; skip = T.resumeIdx >= 0 ? { node, i: T.resumeIdx } : null; }
        continue;
      }
      T.result.completed = true;
      break;
    }
    finishTx(T);
  }

  /** Hails loop (garbled by live clarity) until the player locks the signal. */
  async function hailLoop(T) {
    const hail = T.tx.hail || [];
    const gap = T.tx.hailGap != null ? T.tx.hailGap : 4;
    let i = 0;
    while (!T.dead && !T.locked && !T.suspended) {
      if (hail.length) {
        const st = hail[i % hail.length];
        i++;
        await playStep(T, st, 'hail', i - 1, { squelch: true });
        if (T.dead || T.locked || T.suspended) break;
        await tsleep(T, i % hail.length === 0 ? gap : st.gap != null ? st.gap : 0.9, true);
      } else {
        await tsleep(T, 0.5, true);
      }
    }
  }

  /** The reception moment: number, log entry, radio:received. */
  function doLock(T) {
    if (T.locked || T.suspended) return;
    T.locked = true;
    if (T.entry) {
      // relocked after a power cut: same number, same log entry
      if (T.cutEntry && T.entry.status === 'INTERRUPTED' && !T.entry.logged) {
        T.entry.status = 'RECEIVED';
        DA.bus.emit('radio:log-changed', { num: T.entry.num, entry: T.entry });
      }
      T.cutEntry = false;
      wake(T);
      DA.bus.emit('radio:resumed', { txId: T.id, num: T.num });
      if (atDesk()) sfx('radio_click', { vol: 0.5 });
      if (rt.tapePlay) stopTape(false);
      return;
    }
    const r = R();
    let num = T.opts.num;
    if (num == null) num = r.nextNum;
    r.nextNum = Math.max(r.nextNum, num + 1);
    DA.addVar('txCount');
    T.num = num;
    T.result.num = num;
    const tx = T.tx, nowMin = DA.clock.min;
    const originMin = (T.originMin = originOf(tx, nowMin)); // relative origins are measured from reception
    const stamp = tx.stampText != null ? fmtT(T, tx.stampText) : DA.clock.stamp(originMin != null ? originMin : nowMin);
    let offsetSec = null;
    if (tx.offsetSec != null) offsetSec = tx.offsetSec;
    else if (originMin != null) offsetSec = (originMin - nowMin) * 60;
    else if (tx.offsetText == null && tx.stampText == null) offsetSec = 0;
    const entry = {
      num, txId: tx.id, freq: T.src.freq, sender: fmtT(T, tx.sender || 'UNIDENTIFIED'), summary: fmtT(T, tx.summary || ''),
      stamp, received: DA.clock.stamp(nowMin), offset: null, status: 'RECEIVED', logged: false, glitch: !!tx.glitch,
      min: nowMin, originMin: originMin != null ? originMin : null, offsetSec: offsetSec != null ? Math.round(offsetSec) : null,
      offsetText: tx.offsetText != null ? fmtT(T, tx.offsetText) : null, responded: false,
    };
    if (r.offsetUnit) entry.offset = entryOffset(entry);
    r.log.push(entry);
    T.entry = entry;
    wake(T);
    DA.bus.emit('radio:received', { txId: tx.id, num, entry });
    DA.bus.emit('radio:log-changed', { num, entry, added: true });
    if (atDesk()) sfx('radio_click', { vol: 0.5 });
    // a reception never plays over a cassette: the deck clicks off
    if (rt.tapePlay) stopTape(false);
  }
  function entryOffset(e) {
    if (e.offsetText) return e.offsetText;
    if (e.offsetSec != null) return U.fmtOffset(e.offsetSec);
    return U.fmtOffset(null);
  }

  /** Script interpreter: every step form of PLAN §6.8. */
  async function runScript(T, startNode, skip) {
    let node = startNode, i = 0, guard = 0;
    while (!T.dead && !T.suspended) {
      const steps = scriptNode(T.tx, node);
      if (!steps || i >= steps.length) break;
      const st = steps[i];
      T.node = node;
      if (++guard > 2000) { console.warn('[radio] script guard tripped', T.id); break; }
      if (!st || typeof st !== 'object') { i++; continue; }
      if (st.goto) { node = st.goto; i = 0; continue; }
      if (st.end) { if (st.fx) DA.applyFx(st.fx); break; }
      if (st.choose) {
        const next = await doChoose(T, st, node, i);
        if (T.dead || T.suspended) { if (next) { node = next; i = -1; } break; }
        if (next) { node = next; i = 0; } else i++;
        continue;
      }
      // replaying a node after a power cut: fx / emit that already fired do not fire twice
      const replayed = skip && node === skip.node && i <= skip.i;
      if (skip && !replayed) skip = null;
      if (!replayed) {
        if (st.fx) DA.applyFx(st.fx);
        if (st.emit) emitStep(T, st.emit);
      }
      if (st.wait != null) { await tsleep(T, +st.wait || 0); if (!T.suspended) i++; continue; }
      if (st.t != null || st.s || st.sfx || st.cap) await playStep(T, st, node, i);
      if (!T.suspended) i++;
    }
    if (T.suspended && !T.dead) { T.resumeNode = node; T.resumeIdx = Math.max(i, skip && skip.node === node ? skip.i : -1); }
  }
  function emitStep(T, e) {
    [].concat(e).forEach((ev) => {
      if (typeof ev === 'string') DA.bus.emit(ev, { txId: T.id, num: T.num });
      else if (ev && ev.name) DA.bus.emit(ev.name, ev.data !== undefined ? ev.data : { txId: T.id, num: T.num });
    });
  }
  /** One line / sfx step: {s, t, d?, sfx?, cap?, gap?, alt?} or {sfx, cap, d}. */
  async function playStep(T, st, node, i, extra) {
    const r = R();
    st = liveStep(st);
    let text = st.t;
    if (text != null && st.alt && (DA.state.stats.loads || 0) > 0 && DA.variant('line:' + T.id + ':' + node + ':' + i) < 0.25) text = st.alt;
    text = text != null ? fmtT(T, text) : null;
    const seed = U.hash(T.id + ':' + node + ':' + i) & 0xffff;
    if (st.sfx) { const h = radioSfx(st.sfx, T, st.vol); if (h) T.handles.add(h); }
    if (st.cap) airLine(T, null, '[' + fmtT(T, st.cap).replace(/^\[|\]$/g, '') + ']', st.d || 2.2, { kind: 'cap', seed, noVoice: true });
    let dur = st.d != null ? +st.d : text ? U.lineDur(text) : st.cap || st.sfx ? 1.6 : 0;
    if (text) {
      const h = airLine(T, st.s, text, dur, { seed, tape: T.kind === 'tape' || T.kind === 'self', squelch: !!(extra && extra.squelch) });
      if (h) { T.handles.add(h); if (st.d == null && h.dur) dur = Math.max(dur, h.dur); }
      if (T.kind === 'tx') DA.bus.emit('radio:line', { txId: T.id, num: T.num, node, i, s: st.s, t: text, clarity: T.clar() });
    }
    if (dur > 0) await tsleep(T, dur);
    if (!T.dead && r.power) await tsleep(T, st.gap != null ? +st.gap : text ? 0.35 : 0);
  }

  /* ------------------------------------------------------------- choices */
  async function doChoose(T, st, node, idx) {
    const options = (st.choose || []).map((o, k) => Object.assign({}, o, { id: o.id || 'opt' + k, text: fmtT(T, o.t || '') }));
    const p = {
      T, node, idx, step: st, options,
      prompt: st.prompt ? fmtT(T, st.prompt) : null,
      t: 0, timeout: st.timeout != null ? +st.timeout : T.tx.timeout != null ? +T.tx.timeout : DEFAULT_TIMEOUT,
      waitT: T.tx.waitGap != null ? +T.tx.waitGap : 9, waitI: 0, speaking: false, resolve: null,
    };
    T.pending = p;
    const picked = new Promise((res) => (p.resolve = res));
    DA.bus.emit('radio:choose', { txId: T.id, node, options: options.map((o) => ({ id: o.id, t: o.text, silent: !!o.silent })), prompt: p.prompt });
    refreshMic();
    const pick = await picked;
    T.pending = null;
    refreshMic();
    if (T.dead && !pick) return null;
    if (pick && pick.suspended) return null; // the power went off: the choice comes back on replay
    if (!pick || pick.timeout) {
      T.result.timedOut = true;
      if (!(node in T.result.choices)) T.result.choices[node] = null;
      DA.bus.emit('radio:choice', { txId: T.id, node, optionId: null, timedOut: true });
      return st.onTimeout || null;
    }
    const o = pick.opt;
    T.result.choices[node] = o.id;
    T.result.choices[o.id] = true;
    T.result.path.push(o.id);
    T.result.choice = o.id;
    let dur = 0;
    if (!o.silent) {
      dur = speakPlayer(o.text, { txId: T.id, optionId: o.id, freq: T.src.freq });
      T.result.responded = true;
      if (T.entry) T.entry.responded = true;
    }
    // Interference rule (PLAN §6.5): a spoken answer to a future transmission.
    const forced = o.interfere === true || typeof o.interfere === 'string';
    if ((T.tx.future && !o.silent && o.interfere !== false) || forced) {
      DA.interfere(typeof o.interfere === 'string' ? o.interfere : 'respond:' + T.id);
    }
    if (o.fx) DA.applyFx(o.fx);
    DA.bus.emit('radio:choice', { txId: T.id, node, optionId: o.id });
    if ((o.log || o.id === 'log') && T.entry && !T.entry.logged) logEntry(T.entry);
    if (dur > 0) await tsleep(T, dur + 0.25);
    if (o.action) {
      DA.bus.emit('radio:action', { txId: T.id, action: o.action });
      // the one transmission a power cut does end: the one you answered by switching it off
      if (o.action === 'power_off') { T.powerCut = true; setPower(false); return null; }
    }
    return o.next || null;
  }
  /** The player says `text` into the desk microphone. Returns the line's duration. */
  function speakPlayer(text, ctx) {
    const r = R();
    const dur = U.lineDur(text);
    rt.mic.speaking = Math.max(rt.mic.speaking, dur);
    r.recordings.push({ text, stamp: DA.clock.stamp(), freq: q2(ctx.freq != null ? ctx.freq : r.freq), txId: ctx.txId || null });
    sfx('radio_click', { vol: 0.6 });
    voice(text, 'you', { vol: 0.9 * r.volume });
    addStrip({ kind: 'you', speaker: 'you', text, dur, seed: 1, clar: () => 1 });
    DA.bus.emit('radio:mic', { text, txId: ctx.txId || null, optionId: ctx.optionId || null, outId: ctx.outId || null, freq: q2(r.freq) });
    if (DA.flag('you_realtime')) {
      // "You" — no offset: every word you say comes out of the speaker at the same moment.
      voice(text, 'you_now', { radio: true, clarity: 0.9, vol: r.volume });
      addStrip({ kind: 'line', speaker: 'you_now', name: 'YOU · +00:00:00', text, dur, seed: 2, clar: () => 0.97 });
    }
    return dur;
  }
  /** Current pending choice the mic can answer (must be tuned near the transmission). */
  function micPending() {
    for (const T of rt.active.values()) {
      if (!T.pending || T.pending.speaking) continue;
      if (T.noLock || Math.abs(R().freq - T.src.cur) <= Math.max(T.src.width, 0.03) + 1e-6) return T;
    }
    return null;
  }
  function anyPending() { for (const T of rt.active.values()) if (T.pending) return T; return null; }
  function choosePending(T, opt) {
    const p = T && T.pending;
    if (!p || p.speaking || !p.resolve) return false;
    p.speaking = true;
    // keying the mic cuts the other side's wait line (half duplex): never two voices at once
    if (p.waitH) { stopHandle(p.waitH); for (const l of rt.strip) if (l.ch === T && l.text === p.waitText) l.life = Math.min(l.life, 0.3); p.waitH = null; }
    p.resolve({ opt });
    return true;
  }
  /** Per-frame choose bookkeeping: timeout and waitLines. */
  function updatePending(dt) {
    for (const T of rt.active.values()) {
      const p = T.pending;
      if (!p || p.speaking) continue;
      p.t += dt;
      // Silence is a valid answer and must sound clean: the timeout never cuts into a wait line
      // that is still being spoken — it resolves once that line (+0.3 s) is over.
      if (p.t >= p.timeout) {
        if (p.waitBusy && p.t < p.timeout + 8) continue;
        p.speaking = true;
        p.resolve({ timeout: true });
        continue;
      }
      const wl = T.tx.waitLines;
      if (wl && wl.length && !p.waitBusy) {
        p.waitT -= dt;
        if (p.waitT <= 0) {
          const st = wl[p.waitI % wl.length];
          const text = fmtT(T, st.t || '');
          const dur = st.d || U.lineDur(text);
          // …and no wait line starts when it could not finish well before the timeout line
          if (p.timeout - p.t < dur + 2) { p.waitT = 1e9; continue; }
          p.waitI++;
          p.waitBusy = true;
          if (st.sfx) radioSfx(st.sfx, T);
          const h = text ? airLine(T, st.s, text, dur, { seed: (U.hash(T.id + ':wait:' + p.waitI) & 0xffff) }) : null;
          if (h) { T.handles.add(h); p.waitH = h; p.waitText = text; }
          DA.timers.after(dur + 0.3, () => { p.waitBusy = false; p.waitH = null; p.waitT = (T.tx.waitGap != null ? +T.tx.waitGap : 9); });
        }
      }
    }
  }

  function finishTx(T) {
    if (T.finished) return;
    T.finished = true;
    T.dead = true;
    if (T.resumeRes) { const r = T.resumeRes; T.resumeRes = null; r(); }
    T.suspended = false;
    wake(T, true);
    if (T.pending && T.pending.resolve && !T.pending.speaking) { T.pending.speaking = true; T.pending.resolve(null); }
    T.pending = null;
    for (const h of T.handles) stopHandle(h);
    T.handles.clear();
    rt.sources = rt.sources.filter((s) => s !== T.src);
    if (T.src.live) DA.bus.emit('radio:lost', { txId: T.id, id: T.id, kind: 'tx', freq: T.src.freq });
    rt.active.delete(T.id);
    if (T.entry && !T.result.completed && T.entry.status === 'RECEIVED') T.entry.status = 'INTERRUPTED';
    rt.selfScan.quiet = 0; // the receiver stays where it was for a while after traffic
    refreshMic();
    if (T.missed) DA.bus.emit('radio:missed', { txId: T.id });
    DA.bus.emit('radio:ended', { txId: T.id, num: T.num, result: T.result });
    T.resolve(T.result);
  }
  function killTx(T, why) {
    if (!T || T.finished) return;
    T.result.stopped = why !== 'missed';
    if (why === 'missed') { T.missed = true; T.result.missed = true; }
    T.dead = true;
    finishTx(T);
  }
  function stop(txId) {
    if (txId == null) { for (const T of Array.from(rt.active.values())) killTx(T, 'stop'); return; }
    killTx(rt.active.get(txId), 'stop');
  }

  /* ================================================================ outgoing */
  function addOutgoing(o) {
    if (typeof o === 'string') o = { id: o };
    if (!o || !o.id) return null;
    const base = (content().outgoing || {})[o.id];
    const def = typeof base === 'string' ? { text: base } : base && typeof base === 'object' ? base : {};
    const rec = Object.assign({ freq: null, text: '', once: false, fx: null, future: false }, def, o);
    rec.freq = rec.freq != null ? q2(+rec.freq) : null;
    const r = R();
    r.outgoing = r.outgoing.filter((x) => x.id !== rec.id);
    r.outgoing.push(JSON.parse(JSON.stringify(rec)));
    refreshMic();
    return rec;
  }
  function removeOutgoing(id) {
    const r = R();
    r.outgoing = r.outgoing.filter((x) => x.id !== id);
    refreshMic();
  }
  function outgoingHere() {
    const f = R().freq;
    return R().outgoing.filter((o) => o.freq == null || Math.abs(o.freq - f) <= 0.02 + 1e-6);
  }
  function send(outId) {
    const o = R().outgoing.find((x) => x.id === outId);
    if (!o || !R().power) return false;
    const text = DA.fmt(o.text);
    const dur = speakPlayer(text, { outId: o.id, txId: o.id, freq: o.freq != null ? o.freq : R().freq });
    if (o.future) DA.interfere('outgoing:' + o.id);
    if (o.fx) DA.applyFx(o.fx);
    if (o.once) removeOutgoing(o.id);
    else o.sent = (o.sent || 0) + 1;
    DA.timers.after(dur + 0.2, () => DA.bus.emit('radio:sent', { id: o.id, freq: o.freq != null ? o.freq : q2(R().freq), text }));
    return true;
  }

  /* ============================================================== room feeds */
  function roomFeed(idOrObj, opts) {
    opts = opts || {};
    const feed = typeof idOrObj === 'string' ? Object.assign({ id: idOrObj }, (content().roomfeed || {})[idOrObj]) : Object.assign({}, idOrObj);
    if (!feed || !feed.steps) { console.warn('[radio] unknown room feed', idOrObj); return Promise.resolve(null); }
    const id = feed.id || 'rf_anon';
    stopFeed(id);
    const offset = opts.offset != null ? +opts.offset : +feed.offset || 0;
    const Fd = {
      id, feed, offset, force: !!(opts.force || feed.force), t: 0, heard: false, done: false, timers: [],
      handles: new Set(), sleepers: new Set(), result: { feed: id, heard: false, completed: false },
      clar: null, zero: false,
    };
    Fd.clar = () => {
      if (!R().power) return 0;
      if (Fd.force) return 0.95;
      const s = findSrc('roomfeed');
      return s ? dispC(clarityRaw(s)) : 0;
    };
    Fd.promise = new Promise((res) => (Fd.resolve = res));
    rt.feeds.push(Fd);
    if (rt.scan && rt.scan.self) cancelScan(); // the idle sweep yields to the feed
    if (Fd.force && rt.tapePlay) stopTape(false); // heard wherever the dial is: the deck clicks off
    const steps = feed.steps.slice();
    let last = 0;
    // A negative offset (README "OFFSET −00:00:04"): what the feed plays has ALREADY happened —
    // those events (and roomfeed:zero) are true from the start, emitted right after roomfeed:start.
    const already = [];
    const evOf = (st, i) => () => DA.bus.emit('roomfeed:event', { feed: id, event: st.event || null, step: i });
    steps.forEach((st, i) => {
      const at = +st.at || 0;
      Fd.timers.push(DA.timers.after(at, () => feedStep(Fd, st, i)));
      if (at + offset <= 0) already.push(evOf(st, i));
      else Fd.timers.push(DA.timers.after(at + offset, evOf(st, i)));
      last = Math.max(last, at + offset, at + (st.t ? U.lineDur(fmtFeed(st.t)) : 1.5));
    });
    const zero = () => { Fd.zero = true; DA.bus.emit('roomfeed:zero', { feed: id }); };
    if (offset <= 0) already.push(zero);
    else Fd.timers.push(DA.timers.after(offset, zero));
    Fd.timers.push(DA.timers.after(last + 0.4, () => endFeed(Fd, true)));
    DA.bus.emit('roomfeed:start', { feed: id, offset });
    for (const f of already) f();
    return Fd.promise;
  }
  const fmtFeed = (t) => DA.fmt(t);
  function feedStep(Fd, st, i) {
    if (Fd.done) return;
    const c = Fd.clar();
    const heardNow = c > 0.3 && audibility() > 0.02;
    if (heardNow) Fd.heard = Fd.result.heard = true;
    if (heardNow && rt.tapePlay && (st.t || st.cap)) stopTape(false); // never a cassette over the feed
    const seed = U.hash(Fd.id + ':' + i) & 0xffff;
    if (st.sfx) { const h = radioSfx(st.sfx, Fd, st.vol); if (h) Fd.handles.add(h); }
    if (st.cap) airLine(Fd, null, '[' + DA.fmt(st.cap).replace(/^\[|\]$/g, '') + ']', st.d || 2.4, { kind: 'cap', seed, noVoice: true });
    if (st.t) {
      const text = fmtFeed(st.t);
      const h = airLine(Fd, st.s || 'you', text, st.d || U.lineDur(text), { seed });
      if (h) Fd.handles.add(h);
    }
  }
  function endFeed(Fd, completed) {
    if (Fd.done) return;
    Fd.done = true;
    Fd.result.completed = !!completed;
    for (const id of Fd.timers) DA.timers.cancel(id);
    for (const h of Fd.handles) stopHandle(h);
    rt.feeds = rt.feeds.filter((x) => x !== Fd);
    rt.selfScan.quiet = 0;
    DA.bus.emit('roomfeed:end', { feed: Fd.id, heard: Fd.heard, completed: !!completed });
    Fd.resolve(Fd.result);
  }
  function stopFeed(id) { for (const Fd of rt.feeds.slice()) if (id == null || Fd.id === id) endFeed(Fd, false); }
  /** Seconds until the active feed's recorded moment becomes the present (≥ 0), or null. */
  function feedCountdown() {
    const Fd = rt.feeds[rt.feeds.length - 1];
    return Fd ? Math.max(0, Fd.offset - Fd.t) : null;
  }
  function updateFeeds(dt) {
    for (const Fd of rt.feeds) Fd.t += dt;
    const s = findSrc('roomfeed');
    if (s) s.strength = rt.feeds.length ? 0.92 : 0.5;
  }

  /* ======================================================== weather + murmur */
  function weatherLines() {
    const tx = (content().tx || {}).tx_weather_loop;
    if (!tx) return [];
    const steps = scriptNode(Object.assign({ id: 'tx_weather_loop' }, tx), 'start') || tx.hail || [];
    return steps.map((st, i) => Object.assign({ i }, st)).filter((s) => s && (s.t != null || s.wait != null));
  }
  /**
   * A script step as it airs now. `sunrise: true` (tx_weather_loop's 'Sunrise at 6:42 a.m.' step)
   * speaks DA.content.sunriseLine() → {t, cap?} instead of its literal words — DA.state.sunrise
   * pushed back by interference, garbled once flag sunrise_unknown is set. Evaluated every time the
   * step plays, so each pass of the NOAA loop says the night as it is. Other steps pass through.
   */
  function liveStep(st) {
    if (!st || !st.sunrise) return st;
    const fn = content().sunriseLine;
    if (typeof fn !== 'function') return st;
    let L = null;
    try { L = fn.call(content()); } catch (e) { console.error('[radio] sunriseLine', e); }
    if (!L || typeof L.t !== 'string' || !L.t) return st;
    const o = Object.assign({}, st, { t: L.t });
    delete o.alt; // an alt wording belongs to the literal line
    if (L.cap) o.cap = L.cap;
    return o;
  }
  /** A story transmission on the NOAA frequency itself (tx_filler_1, tx_18) is on the air. */
  function weatherPreempted(src) {
    for (const T of rt.active.values()) if (!T.dead && T.src && Math.abs(q2(T.src.freq) - src.freq) < 0.015) return true;
    return false;
  }
  function updateWeather(dt) {
    const w = rt.weather;
    if (!w) return;
    const src = findSrc('weather');
    if (!src) return;
    const ch = w.ch;
    // The station breaks into its own loop: while a transmission on 162.55 is up the loop is cut
    // (never two NOAA voices at once) and afterwards it starts again from the top. The same while
    // ambient traffic is hushed (quiet(true) / a forced room feed): one voice at a time.
    if (weatherPreempted(src) || hushed()) {
      if (!w.held) {
        w.held = true;
        if (w.cur) {
          stopHandle(w.cur.h);
          for (const l of rt.strip) if (l.ch === ch) l.life = Math.min(l.life, 0.6);
        }
        w.cur = null;
      }
      return;
    }
    if (w.held) {
      w.held = false;
      w.i = 0;
      const wx = (content().tx || {}).tx_weather_loop || {};
      w.t = Math.max(12, wx.loopGap != null ? +wx.loopGap : 4);
    }
    w.t -= dt;
    if (w.t <= 0) {
      if (!w.lines.length) { w.lines = weatherLines(); w.t = 5; if (!w.lines.length) return; }
      const st = liveStep(w.lines[w.i % w.lines.length]);
      w.i++;
      if (st.wait != null) { w.t = +st.wait || 1; w.cur = null; }
      else {
        let raw = st.t;
        if (st.alt && (DA.state.stats.loads || 0) > 0 && DA.variant('line:tx_weather_loop:start:' + st.i) < 0.25) raw = st.alt;
        const text = DA.fmt(raw);
        const dur = st.d || U.lineDur(text);
        w.cur = { text, s: st.s || 'weather', start: now(), dur, shown: false, seed: U.hash('wx:' + text) & 0xffff };
        if (st.cap) {
          // The recording skips: the caption (+ a crackle) lands where the words break off ('…').
          const k = text.indexOf('...');
          const frac = k > 0 ? U.clamp(k / text.length, 0.15, 0.85) : 0;
          w.cur.cap = { text: '[' + DA.fmt(st.cap).replace(/^\[|\]$/g, '') + ']', at: now() + dur * frac, done: false };
        }
        if (ch.clar() > 0.05 && audibility() > 0.02) { w.cur.h = airLine(ch, w.cur.s, text, dur, { seed: w.cur.seed }); w.cur.shown = true; }
        w.t = dur + (st.gap != null ? +st.gap : 0.7);
      }
      if (w.i % w.lines.length === 0) {
        const wx = (content().tx || {}).tx_weather_loop || {};
        w.t += wx.loopGap != null ? +wx.loopGap : 4;
      }
    } else if (w.cur && !w.cur.shown && atDesk() && ch.clar() > 0.1) {
      // Tuned in mid-sentence: show the rest of the line that is already on the air.
      const left = w.cur.start + w.cur.dur - now();
      if (left > 0.4) { addStrip({ kind: 'line', speaker: w.cur.s, text: w.cur.text, dur: left, seed: w.cur.seed, clar: ch.clar, ch }); w.cur.shown = true; }
    }
    const cap = w.cur && w.cur.cap;
    if (cap && !cap.done && now() >= cap.at) {
      cap.done = true;
      if (ch.clar() > 0.05 && audibility() > 0.02) {
        airLine(ch, null, cap.text, 2.2, { kind: 'cap', seed: w.cur.seed + 7, noVoice: true });
        radioSfx('static_burst', ch, 0.4);
      }
    }
  }
  function updateMurmur(dt) {
    const pool = Array.isArray(content().murmur) && content().murmur.length ? content().murmur : MURMUR_DEFAULT;
    const hush = hushed();
    for (const s of rt.sources) {
      if (s.kind !== 'murmur') continue;
      if (hush) {
        // hushed: whoever was talking is cut off and nobody keys up until it lifts
        if (s.talk > 0 || s.h) {
          stopHandle(s.h);
          s.h = null;
          for (const l of rt.strip) if (l.ch && l.ch.id === s.id) l.life = Math.min(l.life, 0.4);
          s.talk = 0;
        }
        s.idle = Math.max(s.idle, 3 + Math.random() * 8);
        s.keyed = Math.max(0, s.keyed - dt * 8);
        continue;
      }
      if (s.talk > 0) {
        s.talk -= dt;
        s.keyed = Math.min(1, s.keyed + dt * 12);
        if (s.talk <= 0) s.idle = 4 + Math.random() * 12;
        continue;
      }
      s.keyed = Math.max(0, s.keyed - dt * 8);
      s.idle -= dt;
      if (s.idle > 0) continue;
      const text = pool[Math.floor(Math.random() * pool.length)];
      const dur = U.lineDur(text);
      s.talk = dur;
      // Never intelligible: clarity is capped well below legibility.
      s.h = null;
      if (clarityKeyed(s) > 0.08) {
        s.h = airLine({ id: s.id, kind: 'murmur', clar: () => Math.min(dispC(clarityKeyed(s)), 0.27) }, s.speaker, text, dur, { kind: 'murmur', seed: U.hash(s.id + text) & 0xffff, squelch: true });
      }
    }
  }

  /* ============================================================ 000.00 breath */
  function breathPhase(dt) {
    const a = DA.audio;
    const b = rt.breath;
    let ph = null;
    if (a) {
      try {
        if (typeof a.breathPhase === 'function') ph = a.breathPhase();
        else if (typeof a.playerBreath === 'function') ph = a.playerBreath();
      } catch (e) { ph = null; }
    }
    if (typeof ph === 'number' && isFinite(ph)) return ((ph % 1) + 1) % 1;
    // Simulated from the player's movement: exertion decays while seated.
    const pl = DA.world && DA.world.player;
    const moving = !atDesk() && pl ? (pl.running ? 1 : pl.noise || 0) : 0;
    b.exert = U.clamp(b.exert + (moving > b.exert ? (moving - b.exert) * dt * 0.8 : -dt * 0.035), 0, 1);
    const rate = 0.21 + b.exert * 0.38; // breaths per second
    b.phase = (b.phase + dt * rate) % 1;
    return b.phase;
  }
  function updateBreath(dt) {
    const b = rt.breath;
    const ph = breathPhase(dt);
    const src = findSrc('breathing');
    const listening = !!(src && R().power && dispC(src.c || 0) > 0.55 && atDesk());
    if (!listening) {
      if (b.loop) { stopHandle(b.loop); b.loop = null; }
      b.listen = 0;
      if (b.caption) { b.caption.life = Math.min(b.caption.life, 0.6); b.caption = null; }
      b.prevPhase = ph;
      return;
    }
    b.listen += dt;
    if (b.listen > 3) {
      // Silence first (~3 s), then breathing on the player's own rhythm.
      const text = b.listen > 13 ? '[your breathing]' : '[breathing]';
      if (!b.caption || b.caption.text !== text || !rt.strip.includes(b.caption)) {
        if (b.caption) b.caption.life = 0.3;
        const fresh = !b.caption || b.caption.text !== text;
        b.caption = addStrip({ kind: 'cap', speaker: null, text, dur: 9999, seed: 3, clar: () => 1, sticky: true });
        if (fresh) DA.bus.emit('radio:breathing', { mine: b.listen > 13 });
      }
      b.caption.life = 9999;
      const a = DA.audio;
      if (a && typeof a.loop === 'function' && typeof a.breathPhase === 'function') {
        // The engine phase-locks loop('breath_other') to the player's own breathing.
        if (!b.loop) try { b.loop = a.loop('breath_other', { radio: true, mirror: true, vol: 0.6 * R().volume }); } catch (e) { b.loop = null; }
      } else if (ph < b.prevPhase) {
        sfx('breath_other', { radio: true, vol: 0.55 * R().volume });
      }
    }
    b.prevPhase = ph;
  }

  /* ================================================================== jamming */
  function jam(level) {
    const r = R();
    r.jam = U.clamp(+level || 0, 0, 1);
    rt.fragT = 0.4;
    if (!r.jam) clearFrags();
  }
  function fragPool() {
    const out = [];
    const fr = content().fragments;
    // bracketed lines ('[footsteps, closer]') are sounds, not words: they come back as captions
    const isCap = (t) => /^\s*\[.*\]\s*$/.test(String(t || ''));
    const push = (f) => {
      if (!f) return;
      if (typeof f === 'string') out.push(isCap(f) ? { t: f, cap: true } : { t: f });
      else if (f.t) out.push(isCap(f.t) && !f.cap ? Object.assign({}, f, { cap: true }) : f);
    };
    if (Array.isArray(fr)) fr.forEach(push);
    else if (fr && typeof fr === 'object') Object.values(fr).forEach((v) => (Array.isArray(v) ? v.forEach(push) : push(v)));
    // Every death is canon: the last words of earlier attempts come back on the flooded band.
    const call = (content().death && content().death.call) || 'Station Fourteen? Is anybody there?';
    for (const d of (DA.meta && DA.meta.deaths) || []) {
      (d.lines || []).forEach((l) => push({ t: typeof l === 'string' ? l : l && (l.text || l.t), s: 'you', death: true }));
      push({ t: call, s: (content().death && content().death.callSpeaker) || 'you', death: true });
    }
    if (!out.length) out.push({ t: 'Station Fourteen?', s: 'you' }, { t: 'Keep the channel open.', s: 'you_old' });
    return out;
  }
  const FRAG_VOICES = ['you', 'you_calm', 'you_panic', 'you_injured', 'you_old'];
  function updateJam(dt) {
    const lvl = R().jam;
    if (lvl <= 0 || !R().power) return;
    rt.fragT -= dt;
    if (rt.fragT > 0) return;
    rt.fragT = U.lerp(3.2, 0.55, lvl) * (0.6 + Math.random() * 0.8);
    const pool = fragPool();
    const f = pool[Math.floor(Math.random() * pool.length)];
    const text = DA.fmt(f.t);
    const c = 0.35 + Math.random() * 0.5;
    const aud = audibility();
    if (f.cap) {
      // a recorded sound, never spoken: a crackle of static and the caption
      if (aud > 0.02) sfx('static_burst', { radio: true, vol: R().volume * aud * (0.25 + 0.3 * lvl) });
      if (atDesk()) addFrag(text, 1, !!f.death, true);
      else if (aud > 0.12 && DA.ui && DA.ui.subtitle && Math.random() < 0.5) {
        try { DA.ui.subtitle(text, { kind: 'sfx', frag: true }); } catch (e) { /* ignore */ }
      }
      return;
    }
    const spk = f.s || FRAG_VOICES[Math.floor(Math.random() * FRAG_VOICES.length)];
    if (aud > 0.02) voice(text, spk, { radio: true, clarity: c, vol: R().volume * aud * (0.35 + 0.4 * lvl) });
    if (atDesk()) addFrag(text, c, !!f.death);
    else if (aud > 0.12 && DA.ui && DA.ui.subtitle && Math.random() < 0.5) {
      // frag: true — flood noise, not something that happened (deaths must not record it)
      try { DA.ui.subtitle(text, { kind: 'radio', speaker: spk, clarity: awayClarity(c, aud), frag: true }); } catch (e) { /* ignore */ }
    }
  }

  /* ============================================================ scan / tuning */
  function setFreq(f, manual) {
    f = U.clamp(q2(f), FMIN, FMAX);
    const r = R();
    if (f === r.freq) return;
    const prev = r.freq;
    r.freq = f;
    rt.freqMoved = true;
    if (!rt.dragging && !rt.dialVel) rt.dialAcc = f * 100;
    if (manual) touched();
    wfShift(f - prev);
    DA.bus.emit('radio:tuned', { freq: f, prev, manual: !!manual });
    refreshMic();
  }
  function tune(freq, opts) {
    opts = opts || {};
    cancelScan();
    rt.dialVel = 0;
    const to = U.clamp(q2(+freq), FMIN, FMAX);
    if (opts.glide && R().power) {
      rt.glide = { from: R().freq, to, t: 0, dur: U.clamp(0.25 + Math.abs(to - R().freq) * 0.01, 0.25, 0.9) };
    } else {
      rt.glide = null;
      setFreq(to, true);
      rt.dialAcc = to * 100;
    }
  }
  function nudge(dMHz) {
    cancelScan();
    rt.glide = null;
    rt.dialVel = 0;
    const f = U.clamp(q2(R().freq + dMHz), FMIN, FMAX);
    setFreq(f, true);
    rt.dialAcc = f * 100;
  }
  /** Auto-scan: the dial sweeps to `freq` by itself with the scan sound. */
  function autoScan(freq, opts) {
    opts = opts || {};
    cancelScan();
    rt.glide = null;
    rt.dialVel = 0;
    const to = U.clamp(q2(+freq), FMIN, FMAX);
    if (!R().power) return Promise.resolve(false);
    const from = R().freq;
    const dur = opts.dur || U.clamp(0.9 + Math.sqrt(Math.abs(to - from)) * 0.28, 0.9, 4.2);
    return new Promise((res) => {
      rt.scan = { from, to, t: 0, dur, resolve: res, h: sfx('scan', { radio: true, vol: 0.55 * R().volume }) };
      DA.bus.emit('radio:scan', { freq: to, done: false });
    });
  }
  function cancelScan() {
    if (!rt.scan) return;
    const s = rt.scan;
    rt.scan = null;
    stopHandle(s.h);
    s.resolve(false);
  }
  function updateScan(dt) {
    if (rt.glide) {
      const g = rt.glide;
      g.t += dt;
      const k = U.smoothstep(0, 1, Math.min(1, g.t / g.dur));
      setFreq(U.lerp(g.from, g.to, k), false);
      rt.dialAcc = U.lerp(g.from, g.to, k) * 100;
      if (g.t >= g.dur) { setFreq(g.to, true); rt.dialAcc = g.to * 100; rt.glide = null; }
    }
    const s = rt.scan;
    if (!s) return;
    if (!R().power || rt.dragging) { cancelScan(); return; }
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    const f = U.lerp(s.from, s.to, e);
    setFreq(f, false);
    rt.dialAcc = f * 100;
    if (k >= 1) {
      rt.scan = null;
      setFreq(s.to, false);
      rt.dialAcc = s.to * 100;
      stopHandle(s.h);
      sfx('radio_click', { vol: 0.5 });
      if (!s.self) rt.selfScan.quiet = 0; // where the station sent the dial, the dial stays a while
      DA.bus.emit('radio:scan', { freq: s.to, done: true });
      s.resolve(true);
    }
  }
  /**
   * Ambient traffic is hushed — the NOAA loop holds, CB/dispatch murmur stops keying up, the idle
   * self-sweep stays put — while quiet(true) is on (the director's tense beats: the dark…) or a
   * forced room feed (heard wherever the dial is) is on the air. Story transmissions, room feeds,
   * the breathing on 000.00 and the static are never hushed.
   */
  function hushed() {
    if (R().quiet) return true;
    for (const Fd of rt.feeds) if (Fd.force && !Fd.done) return true;
    return false;
  }
  function setQuiet(on) {
    on = !!on;
    const r = R();
    if (!!r.quiet === on) return on;
    r.quiet = on;
    if (on && rt.scan && rt.scan.self) cancelScan();
    if (!on) rt.selfScan.quiet = 0; // no sweep the moment it lifts
    DA.bus.emit('radio:quiet', { on });
    return on;
  }
  /** The player touched the dial or the antenna: the idle self-sweep leaves it alone for a while. */
  function touched() { rt.selfScan.touch = 0; rt.selfScan.idle = 0; }
  const SELF_SCAN = { touch: 45, quiet: 20, start: 5 };
  /** Why the receiver must not sweep by itself right now (design decision 2), or null. */
  function selfScanHold() {
    if (hushed()) return 'hushed';
    if (rt.active.size || rt.feeds.length || rt.tapePlay) return 'traffic';
    const f = R().freq;
    if (Math.abs(f - F.breath) < 0.05 || Math.abs(f - F.room) < 0.05) return 'special';
    if (rt.breath.listen > 0) return 'breath';
    for (const s of rt.sources) {
      if (s.kind !== 'breath' && s.kind !== 'feed' && s.kind !== 'tx') continue;
      if (s.live || (s.c || 0) > 0.12 || Math.abs((s.cur != null ? s.cur : s.freq) - f) < 0.1) return 'carrier';
    }
    if (R().outgoing.some((o) => o.freq != null && Math.abs(o.freq - f) <= 0.02 + 1e-6)) return 'outgoing';
    if (anyPending()) return 'pending';
    const ss = rt.selfScan;
    if (ss.touch < SELF_SCAN.touch) return 'touched';
    if (ss.quiet < SELF_SCAN.quiet) return 'quiet';
    if (ss.idle < SELF_SCAN.start) return 'start';
    return null;
  }
  /** Persistent self-sweep between story transmissions (state.radio.scanning). */
  function updateSelfScan(dt) {
    const ss = rt.selfScan;
    ss.idle += dt;
    ss.touch += dt;
    ss.quiet += dt;
    if (!R().scanning || !R().power || rt.scan || rt.glide || rt.dragging) return;
    if (selfScanHold()) { ss.dwell = Math.max(ss.dwell, 3); return; }
    ss.dwell -= dt;
    if (ss.dwell > 0) return;
    ss.dwell = 3 + Math.random() * 6;
    const f = R().freq;
    // wander between background carriers only — never onto 000.00 / 014.00 or a story carrier
    const near = rt.sources.filter((s) => (s.kind === 'ambient' || s.kind === 'murmur' || s.kind === 'weather') && Math.abs(s.freq - f) < 8 && Math.abs(s.freq - f) > 0.05);
    let to = near.length && Math.random() < 0.65 ? near[Math.floor(Math.random() * near.length)].freq : U.clamp(f + (Math.random() - 0.5) * 12, 0.5, 199.5);
    if (Math.abs(to - F.room) < 0.1) to += 0.37;
    autoScan(to).then(() => { ss.idle = 99; });
    if (rt.scan) rt.scan.self = true;
  }

  /* ============================================================= dial physics */
  function updateDial(dt) {
    if (rt.dragging) return;
    if (rt.dialVel) {
      rt.dialAcc += (rt.dialVel / DEG_PER_MHZ) * 100 * dt;
      rt.dialVel *= Math.exp(-3.4 * dt);
      if (rt.dialAcc <= 0 || rt.dialAcc >= FMAX * 100) { rt.dialAcc = U.clamp(rt.dialAcc, 0, FMAX * 100); rt.dialVel = 0; }
      if (Math.abs(rt.dialVel) < 14) rt.dialVel = 0;
      setFreq(Math.round(rt.dialAcc) / 100, true);
    }
  }
  function updateBearing(dt) {
    const r = R();
    const cur = r.bearing, tgt = ((rt.bearingTarget % 360) + 360) % 360;
    let d = tgt - cur;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) < 0.5) {
      if (cur !== Math.round(tgt) % 360) setBearingNow(Math.round(tgt) % 360);
      rt.rotating = false;
      return;
    }
    rt.rotating = true;
    const step = Math.sign(d) * Math.min(Math.abs(d), BEARING_SPEED * dt);
    setBearingNow(cur + step);
  }
  function setBearingNow(b) {
    const r = R();
    b = ((b % 360) + 360) % 360;
    const prevInt = Math.round(r.bearing) % 360;
    r.bearing = Math.round(b * 10) / 10;
    const nowInt = Math.round(r.bearing) % 360;
    if (nowInt !== prevInt) DA.bus.emit('radio:bearing', { bearing: nowInt });
  }
  function setBearing(deg, opts) {
    rt.bearingTarget = ((+deg % 360) + 360) % 360;
    touched();
    if (opts && opts.instant) setBearingNow(rt.bearingTarget);
  }

  /* ==================================================================== power */
  function setPower(on) {
    on = !!on;
    const r = R();
    if (r.power === on) return;
    r.power = on;
    sfx('switch', { vol: 0.7 });
    if (!on) {
      sfx('power_down', { vol: 0.6 });
      cancelScan();
      rt.glide = null;
      // Transmissions are suspended, not destroyed (decision 10) — except the one whose answer
      // was to switch the receiver off.
      for (const T of Array.from(rt.active.values())) {
        if (T.powerCut) killTx(T, 'stop');
        else suspendTx(T);
      }
      for (const Fd of rt.feeds) for (const h of Fd.handles) stopHandle(h);
      stopTape(true);
      closeMic();
      clearFrags();
      for (const l of rt.strip) l.life = Math.min(l.life, 0.15);
      if (rt.breath.caption) rt.breath.caption = null;
      if (DA.audio && DA.audio.radioStatic) try { DA.audio.radioStatic(0, {}); } catch (e) { /* ignore */ }
    } else {
      sfx('power_up', { vol: 0.5 });
      if (ui.root) {
        ui.root.classList.remove('radio-booting');
        void ui.root.offsetWidth;
        ui.root.classList.add('radio-booting');
        DA.timers.after(1.1, () => ui.root && ui.root.classList.remove('radio-booting'));
      }
      // suspended transmissions hail again (numbering unchanged)
      for (const T of Array.from(rt.active.values())) resumeTx(T);
    }
    DA.bus.emit('radio:power', { on });
  }

  /* ============================================================ offset unit */
  function setOffsetUnit(on) {
    on = !!on;
    const r = R();
    if (r.offsetUnit === on) return;
    r.offsetUnit = on;
    syncSpecialSources();
    if (on) {
      for (const e of r.log) if (!e.offset) e.offset = entryOffset(e);
      DA.bus.emit('radio:log-changed', { backfill: true });
      // The unit flickers on showing the last reception that did not come from now (PLAN §4: +24:00:00).
      let last = null;
      for (let i = r.log.length - 1; i >= 0; i--) { const e = r.log[i]; if (e.offset && !/^[+-]?00:00:00$/.test(e.offset) && e.offset !== '--:--:--') { last = e; break; } }
      rt.lcdBoot = last ? { text: last.offset, t: 4.5, shown: false } : null;
      if (ui.lcd) {
        ui.lcd.classList.remove('radio-lcd-boot');
        void ui.lcd.offsetWidth;
        ui.lcd.classList.add('radio-lcd-boot');
      }
    }
    DA.bus.emit('radio:offset-unit', { on });
  }
  function offsetOverride(text) { R().offsetOverride = text == null ? null : String(text); }

  /* ====================================================================== log */
  function entries() { return R().log; }
  function findEntry(key) {
    const log = R().log;
    if (typeof key === 'number') { for (let i = log.length - 1; i >= 0; i--) if (log[i].num === key) return log[i]; return null; }
    for (let i = log.length - 1; i >= 0; i--) if (log[i].txId === key) return log[i];
    return null;
  }
  function addEntry(entry) {
    const r = R();
    const e = Object.assign({ num: null, txId: null, freq: null, sender: '', summary: '', stamp: DA.clock.stamp(), received: DA.clock.stamp(), offset: null, status: 'RECEIVED', logged: false, glitch: false }, entry || {});
    if (e.num == null) { e.num = r.nextNum; DA.addVar('txCount'); }
    r.nextNum = Math.max(r.nextNum, e.num + 1);
    if (e.min == null) e.min = DA.clock.min;
    r.log.push(e);
    DA.bus.emit('radio:log-changed', { num: e.num, entry: e, added: true });
    return e;
  }
  function editEntry(numOrTxId, patch) {
    const e = findEntry(numOrTxId);
    if (!e) return null;
    Object.assign(e, patch || {});
    DA.bus.emit('radio:log-changed', { num: e.num, entry: e, patch });
    return e;
  }
  function logEntry(e) {
    if (!e || e.logged) return false;
    e.logged = true;
    if (['RECEIVED', 'INTERRUPTED'].includes(e.status)) e.status = 'LOGGED';
    DA.addVar('logged');
    sfx('pen', { vol: 0.8 });
    rt.logFlash = 1.4;
    DA.bus.emit('radio:logged', { num: e.num, txId: e.txId, entry: e });
    DA.bus.emit('radio:log-changed', { num: e.num, entry: e });
    if (atDesk()) addStrip({ kind: 'sys', speaker: null, text: 'ENTRY #' + U.pad(e.num) + ' LOGGED — ' + (e.sender || ''), dur: 2.4, seed: 4, clar: () => 1 });
    return true;
  }
  /** LOG button: the latest unlogged reception (or a specific one). */
  function log(numOrTxId) {
    let e = null;
    if (numOrTxId != null) e = findEntry(numOrTxId);
    else { const L = R().log; for (let i = L.length - 1; i >= 0; i--) if (!L[i].logged) { e = L[i]; break; } }
    if (!e || e.logged) {
      sfx('switch', { vol: 0.4 });
      rt.logFlash = -0.8;
      if (atDesk()) addStrip({ kind: 'sys', speaker: null, text: 'NOTHING NEW TO LOG', dur: 1.6, seed: 5, clar: () => 1 });
      return false;
    }
    return logEntry(e);
  }

  /* ================================================================= notebook */
  /** addNote(freq, label, hand='you') or addNote({freq, label, hand}) (e.g. DA.content.notebook.room). */
  function addNote(freq, label, hand) {
    if (freq && typeof freq === 'object') { label = freq.label; hand = freq.hand; freq = freq.freq; }
    const r = R();
    const n = noteEntry(freq, label, hand || 'you');
    if (r.notebook.some((x) => Math.abs(x.freq - n.freq) < 0.001 && x.label === n.label)) return null;
    n.fresh = true;
    r.notebook.push(n);
    sfx('pen', { vol: 0.6 });
    renderNotebook(n);
    delete n.fresh;
    return n;
  }

  /* =============================================================== tape deck */
  function insertTape(tapeId) {
    const tape = (content().tapes || {})[tapeId];
    if (!tape) console.warn('[radio] unknown tape', tapeId);
    stopTape(true);
    R().tape = tapeId || null;
    sfx('tape_insert', { vol: 0.8 });
    renderTapeLabel();
    const insertion = rt.tapeInsert;
    return DA.wait(0.8).then(() => {
      if (insertion !== rt.tapeInsert || R().tape !== tapeId) return false;
      return playTape();
    });
  }
  function ejectTape() {
    stopTape(true);
    if (R().tape) { sfx('tape_eject', { vol: 0.8 }); R().tape = null; renderTapeLabel(); return true; }
    return false;
  }
  function tapeSteps(id) {
    const tape = (content().tapes || {})[id];
    if (!tape) return [];
    return tape.lines || (tape.script && (tape.script.start || tape.script)) || [];
  }
  /**
   * The deck will not start while a story transmission is being received (locked, not suspended —
   * a hailing one is fine: its lock clicks the deck off) or a room feed is heard: one voice at a
   * time (design decision 6). The director's own playSelf() is not affected.
   */
  function deckLocked() {
    if (!R().power) return false;
    for (const T of rt.active.values()) if (T.locked && !T.dead && !T.suspended) return true;
    for (const Fd of rt.feeds) if (!Fd.done && (Fd.force || Fd.heard)) return true;
    return false;
  }
  function deckRefuse(id) {
    sfx('switch', { vol: 0.35 });
    sfx('tape_stop', { vol: 0.35 });
    if (atDesk()) addStrip({ kind: 'sys', speaker: null, text: '[deck locked — receiving]', dur: 2.2, seed: 6, clar: () => 1 });
    if (ui.deck) { ui.deck.classList.remove('radio-deck-refuse'); void ui.deck.offsetWidth; ui.deck.classList.add('radio-deck-refuse'); }
    DA.bus.emit('tape:locked', { id: id || null });
    return Promise.resolve(false);
  }
  /** PLAY: the inserted tape, or the station log cassette (everything said on air). opts.force skips the receive lock. */
  function playTape(opts) {
    rt.tapeInsert++;
    const r = R();
    if (!r.power) { sfx('switch', { vol: 0.3 }); return Promise.resolve(false); }
    if (deckLocked() && !(opts && opts.force)) return deckRefuse(r.tape);
    if (!r.tape) return playSelfAll();
    const id = r.tape;
    stopTape(true);
    const P = makePlayer('tape', id, { id, script: { start: tapeSteps(id) } });
    P.clar = () => (R().power ? 1 : 0);
    P.vclar = () => 0.8;
    rt.tapePlay = P;
    P.promise = new Promise((res) => (P.resolve = res));
    sfx('tape_play', { vol: 0.7 });
    DA.bus.emit('tape:play', { id });
    runScript(P, 'start').then(() => endTape(P, !P.dead));
    return P.promise;
  }
  function playSelf(i) {
    rt.tapeInsert++;
    const r = R();
    const rec = r.recordings[i || 0];
    if (!rec) return Promise.resolve(false);
    return playRecordings([rec], 'self', i || 0);
  }
  function playSelfAll() {
    const recs = R().recordings;
    if (!recs.length) {
      // Blank leader: only hiss.
      return playRecordings([], 'log', 0);
    }
    return playRecordings(recs.slice(), 'log', 0);
  }
  function playRecordings(recs, id, index) {
    stopTape(true);
    if (!R().power) return Promise.resolve(false);
    const steps = [];
    recs.forEach((rec) => { steps.push({ s: 'you_recorded', t: rec.text }); steps.push({ wait: 0.8 }); });
    if (!steps.length) steps.push({ cap: 'tape hiss', d: 3 });
    const P = makePlayer('self', 'tape:' + id, { id: 'tape_' + id, script: { start: steps } });
    P.clar = () => (R().power ? 1 : 0);
    P.vclar = () => 0.85;
    rt.tapePlay = P;
    P.promise = new Promise((res) => (P.resolve = res));
    P.tapeId = id;
    sfx('tape_play', { vol: 0.7 });
    DA.bus.emit('tape:play', { id, index });
    runScript(P, 'start').then(() => endTape(P, !P.dead));
    return P.promise;
  }
  function stopTape(quiet) {
    rt.tapeInsert++;
    const P = rt.tapePlay;
    if (!P) return false;
    P.dead = true;
    wake(P, true);
    for (const h of P.handles) stopHandle(h);
    if (!quiet) sfx('tape_stop', { vol: 0.7 });
    endTape(P, false);
    return true;
  }
  function endTape(P, completed) {
    if (P.ended) return;
    P.ended = true;
    if (rt.tapePlay === P) rt.tapePlay = null;
    rt.selfScan.quiet = 0;
    if (completed) sfx('tape_stop', { vol: 0.5 });
    DA.bus.emit('tape:end', { id: P.tapeId || P.id, completed: !!completed });
    P.resolve(!!completed);
  }

  /* ============================================================ static audio */
  function updateStatic() {
    const a = DA.audio;
    if (!a || !a.radioStatic) return;
    const r = R();
    let lvl = 0;
    if (r.power) {
      lvl = (1 - rt.bestC) * 0.8 + 0.1;
      if (r.squelch > 0 && rt.bestC < r.squelch) lvl *= 1 - r.squelch * 0.85;
      const b = rt.best;
      if (b && b.kind === 'breath' && rt.bestC > 0.5) lvl = rt.breath.listen > 0 ? 0.012 : lvl; // dead air
      if (r.jam > 0) lvl = U.lerp(lvl, 0.95, r.jam * 0.55);
      if (rt.scan) lvl = Math.max(lvl, 0.45);
    }
    if (!atDesk()) lvl *= audibility();
    const whistle = r.power ? U.clamp((rt.presence - rt.bestC) * 0.8, 0, 0.6) : 0;
    try { a.radioStatic(U.clamp(lvl, 0, 1), { vol: r.volume, tone: whistle }); } catch (e) { /* ignore */ }
  }

  /* ==================================================================== system */
  function update(dt) {
    if (!DA.running) return;
    R();
    rt.freqMoved = false;
    rt.blipT -= dt;
    updateDial(dt);
    updateScan(dt);
    updateBearing(dt);
    updateFeeds(dt);
    updateMurmur(dt);
    computeSignals(dt);
    for (const T of rt.active.values()) {
      if (T.suspended) { T.born += dt; continue; } // the hail timeout waits for the power
      if (T.locked || T.dead) continue;
      const ht = T.opts.hailTimeout != null ? T.opts.hailTimeout : T.tx.hailTimeout;
      if (ht != null && now() - T.born > ht) killTx(T, 'missed');
    }
    updatePending(dt);
    updateVoices(dt);
    updateAwaySubs(dt);
    updateWeather(dt);
    updateBreath(dt);
    updateJam(dt);
    updateSelfScan(dt);
    if (rt.mic.speaking > 0) rt.mic.speaking = Math.max(0, rt.mic.speaking - dt);
    if (rt.tapePlay) R().tapeCounter = (R().tapeCounter + dt * 1.7) % 1000;
    updateStatic();
  }

  /* ======================================================= runtime lifecycle */
  function resetRuntime() {
    rt.tapeInsert++;
    cancelControlDrag();
    for (const T of Array.from(rt.active.values())) { T.dead = true; for (const h of T.handles) stopHandle(h); }
    rt.active.clear();
    for (const Fd of rt.feeds) { Fd.done = true; for (const h of Fd.handles) stopHandle(h); }
    rt.feeds = [];
    if (rt.scan) stopHandle(rt.scan.h);
    rt.scan = null;
    rt.glide = null;
    if (rt.tapePlay) { rt.tapePlay.dead = true; for (const h of rt.tapePlay.handles) stopHandle(h); }
    rt.tapePlay = null;
    rt.strip = [];
    rt.frags = [];
    liveVoices.length = 0;
    awaySubs.length = 0;
    rt.dialVel = 0;
    rt.dragging = false;
    rt.mic = { open: false, keyed: false, latched: false, speaking: 0, items: [], kind: 'none' };
    if (rt.breath.loop) stopHandle(rt.breath.loop);
    rt.breath = { listen: 0, phase: 0, prevPhase: 0, exert: 0, caption: null, loop: null };
    rt.selfScan = { idle: 0, dwell: 0, touch: 999, quiet: 999 };
    rt.lcdBoot = null;
    rt.micNote = null;
    rt.dutyDone.clear();
    rt.dutyNew.clear();
    if (ui.root) { ui.strip.textContent = ''; ui.frags.textContent = ''; }
  }
  function rebuildFromState() {
    const r = ensureState();
    r.freq = U.clamp(q2(+r.freq || 0), FMIN, FMAX);
    rt.dialAcc = r.freq * 100;
    rt.bearingTarget = r.bearing;
    if (DA.flag('offset_unit') && !r.offsetUnit) r.offsetUnit = true;
    buildSources();
    rt.weather = { lines: weatherLines(), i: 0, t: 1.5 + Math.random() * 2, cur: null, ch: null };
    const wsrc = findSrc('weather');
    rt.weather.ch = { id: 'tx_weather_loop', kind: 'weather', clar: () => (wsrc && R().power ? dispC(wsrc.c || 0) : 0) };
    wfClear();
    renderAll();
  }

  /* ======================================================================= UI */
  const ui = {};
  const el = (tag, cls, props, ...kids) => U.el(tag, Object.assign({ class: cls }, props || {}), ...kids);
  const setText = (e, s) => { if (e && e._t !== s) { e._t = s; e.textContent = s; } };
  const setCls = (e, c, on) => {
    if (!e) return;
    const cache = e._c || (e._c = {});
    const cur = c in cache ? cache[c] : e.classList.contains(c);
    if (cur !== !!on) e.classList.toggle(c, !!on);
    cache[c] = !!on;
  };
  const setStyle = (e, k, v) => { if (e && (e._s || (e._s = {}))[k] !== v) { e._s[k] = v; e.style.setProperty(k, v); } };
  const cssVar = (e, k, v) => { e.style.setProperty(k, v); return e; };
  function screw(extra) { return cssVar(el('i', 'radio-screw' + (extra ? ' ' + extra : '')), '--rot', Math.floor(Math.random() * 180) + 'deg'); }
  function screws() { return [screw('tl'), screw('tr'), screw('bl'), screw('br')]; }

  function buildDesk() {
    const root = el('div', 'radio-desk hidden', { id: 'radio-desk' });
    ui.root = root;

    /* --- room: wall, fluorescent flicker, notes ------------------------------------ */
    root.appendChild(el('div', 'radio-wall'));
    root.appendChild(el('div', 'radio-rainlight'));
    root.appendChild(el('div', 'radio-lamp-glow'));
    root.appendChild(el('div', 'radio-notice', null,
      el('div', 'radio-notice-h', { text: 'NOTICE' }),
      el('div', 'radio-notice-b', { text: (content().deskNotice) || 'THE RECEIVER IS TO REMAIN ON AT ALL TIMES.' }),
      el('div', 'radio-notice-f', { text: '— STATION MANAGEMENT, 1978' })));
    ui.reserved = el('div', 'radio-card radio-card-reserved', null,
      el('div', 'radio-card-tape'),
      el('div', 'radio-card-hand', { html: '148.32<br>RESERVED.<br><span>If you hear anything on it, just log it.</span><br><b>Don\'t respond.</b><br><i>— H.</i>' }));
    root.appendChild(ui.reserved);
    // the duty slip: open objectives, pinned under Hollis's card (design decision 1)
    ui.duty = el('div', 'radio-duty radio-duty-empty', null,
      el('i', 'radio-duty-pin'),
      el('div', 'radio-duty-h', { html: 'DUTY<span>NIGHT OPERATOR · STN 14</span>' }),
      (ui.dutyList = el('div', 'radio-duty-list')),
      (ui.dutyMore = el('div', 'radio-duty-more')));
    root.appendChild(ui.duty);
    ui.cctvPanel = el('div', 'radio-cctvpanel hidden', null,
      el('div', 'radio-silk', { text: 'CCTV MONITOR' }),
      (ui.cctvBtn = el('button', 'radio-cctv-btn', { type: 'button', title: 'Security cameras', onclick: openCCTV }, el('i', 'radio-cctv-led'), el('span', null, { text: 'VIEW' }))),
      ...screws());
    root.appendChild(ui.cctvPanel);

    /* --- the rack -------------------------------------------------------------------- */
    const rack = el('div', 'radio-rack');
    rack.appendChild(el('div', 'radio-rail radio-rail-l'));
    rack.appendChild(el('div', 'radio-rail radio-rail-r'));

    // Unit A — receiver head: VFD, meter, OFFSET LCD, lamps, LOG, power.
    const ua = el('div', 'radio-unit radio-unit-a', null, ...screws());
    ua.appendChild(el('div', 'radio-brand', { html: '<b>R-1400</b> COMMUNICATIONS RECEIVER <span>· RELAY STN 14 ·</span>' }));
    ui.vfd = el('div', 'radio-vfd');
    ui.vfdGhost = el('div', 'radio-vfd-ghost', { text: '888.88' });
    ui.vfdFreq = el('div', 'radio-vfd-freq', { text: '155.34' });
    ui.vfdUnit = el('div', 'radio-vfd-unit', { text: 'MHz' });
    ui.vfdMode = el('div', 'radio-vfd-mode', { text: 'NFM' });
    ui.vfdBand = el('div', 'radio-vfd-band', { text: 'VHF' });
    ui.vfdScan = el('div', 'radio-vfd-scan', { text: 'SCAN' });
    ui.vfdBar = el('div', 'radio-vfd-bar');
    for (let i = 0; i < 16; i++) ui.vfdBar.appendChild(el('i'));
    ui.vfd.append(ui.vfdGhost, ui.vfdFreq, ui.vfdUnit, ui.vfdMode, ui.vfdBand, ui.vfdScan, ui.vfdBar, el('i', 'radio-vfd-crack'));
    ua.appendChild(ui.vfd);
    const meterBez = el('div', 'radio-meter');
    ui.meter = el('canvas', 'radio-meter-cv', { width: 290, height: 200 });
    meterBez.append(ui.meter, el('div', 'radio-meter-glass'));
    ua.appendChild(meterBez);
    ui.lcd = el('div', 'radio-lcd');
    ui.lcdLabel = el('div', 'radio-lcd-label', { text: 'OFFSET' });
    ui.lcdText = el('div', 'radio-lcd-text', { text: '--' });
    ui.lcdSub = el('div', 'radio-lcd-sub', { text: '' });
    ui.lcd.append(ui.lcdLabel, ui.lcdText, ui.lcdSub);
    ua.appendChild(ui.lcd);
    const lamps = el('div', 'radio-lamps');
    const lamp = (name, color) => {
      const l = el('div', 'radio-lamp radio-lamp-' + color, null, el('i'), el('span', null, { text: name }));
      lamps.appendChild(l);
      return l;
    };
    ui.lampCarrier = lamp('CARRIER', 'amber');
    ui.lampLock = lamp('LOCK', 'green');
    ui.lampAlert = lamp('ALERT', 'red');
    ua.appendChild(lamps);
    ui.logBtn = el('button', 'radio-pbtn radio-log-btn', { type: 'button', title: 'Log the latest transmission [L]', onclick: () => log() }, el('i', 'radio-pbtn-led'), el('span', null, { text: 'LOG' }));
    ua.appendChild(ui.logBtn);
    ui.power = el('button', 'radio-rocker', { type: 'button', title: 'Receiver power', onclick: () => setPower(!R().power) }, el('i', 'radio-rocker-i', { text: 'I' }), el('i', 'radio-rocker-o', { text: 'O' }));
    ua.appendChild(el('div', 'radio-power-wrap', null, el('div', 'radio-silk', { text: 'POWER' }), ui.power));
    rack.appendChild(ua);

    // Unit B — spectrum / waterfall, tuning dial, VOL / SQL.
    const ub = el('div', 'radio-unit radio-unit-b', null, ...screws());
    const crt = el('div', 'radio-crt');
    ui.spec = el('canvas', 'radio-spec-cv', { width: SPEC_W, height: SPEC_H });
    ui.specLabels = el('div', 'radio-spec-labels');
    for (let i = 0; i < 5; i++) { const l = el('span', 'radio-spec-lab'); spec.labels.push(l); ui.specLabels.appendChild(l); }
    spec.lock = el('span', 'radio-spec-lock', { text: 'LOCK' });
    ui.specLabels.append(spec.lock, el('i', 'radio-spec-centre'));
    crt.append(ui.spec, ui.specLabels, el('div', 'radio-crt-scan'), el('div', 'radio-crt-glass'));
    ub.append(crt, el('div', 'radio-silk radio-crt-silk', { text: 'PANADAPTER  ·  SPECTRUM / WATERFALL  ·  ±500 kHz' }), el('div', 'radio-silk radio-dial-silk', { text: 'MAIN TUNING' }));
    const dialWrap = el('div', 'radio-dialwrap');
    dialWrap.appendChild(el('div', 'radio-dial-ring'));
    ui.dial = el('div', 'radio-dial', null, el('div', 'radio-dial-knurl'), el('div', 'radio-dial-cap'), el('div', 'radio-dial-dimple'), el('div', 'radio-dial-index'));
    dialWrap.append(ui.dial, el('div', 'radio-dial-shine'));
    ub.appendChild(dialWrap);
    ui.volKnob = smallKnob('VOL', 'volume');
    ui.sqlKnob = smallKnob('SQL', 'squelch');
    ub.append(ui.volKnob.wrap, ui.sqlKnob.wrap);
    ub.appendChild(el('div', 'radio-silk radio-step-silk', { html: 'STEP 10 kHz<br><span>SHIFT ×10</span>' }));
    rack.appendChild(ub);

    // Unit C — cassette deck, antenna rotator, station clock.
    const uc = el('div', 'radio-unit radio-unit-c', null, ...screws());
    const deck = (ui.deck = el('div', 'radio-deck'));
    ui.cass = el('div', 'radio-cass');
    ui.reelL = el('div', 'radio-reel radio-reel-l');
    ui.reelR = el('div', 'radio-reel radio-reel-r');
    ui.tapeLabel = el('div', 'radio-cass-label', { text: 'STN 14 — LOG' });
    ui.cass.append(ui.tapeLabel, el('div', 'radio-cass-window', null, ui.reelL, ui.reelR, el('div', 'radio-cass-tape')));
    const deckWin = el('div', 'radio-deck-window', { onclick: () => toggleTapePicker() , title: 'Cassette' }, ui.cass, el('div', 'radio-deck-smoke'));
    ui.counter = el('div', 'radio-counter', { text: '000' });
    ui.recLamp = el('div', 'radio-rec', null, el('i'), el('span', null, { text: 'REC' }));
    const key = (label, title, fn) => el('button', 'radio-key', { type: 'button', title, onclick: fn }, el('span', null, { html: label }));
    ui.keyPlay = key('&#9654;', 'Play', () => { closeTapePicker(); playTape(); });
    ui.keyStop = key('&#9632;', 'Stop', () => { closeTapePicker(); if (!stopTape(false)) sfx('switch', { vol: 0.3 }); });
    ui.keyEject = key('&#9167;', 'Eject', () => { if (!ejectTape()) toggleTapePicker(); });
    deck.append(deckWin, el('div', 'radio-deck-side', null, ui.recLamp, ui.counter, el('div', 'radio-keys', null, ui.keyPlay, ui.keyStop, ui.keyEject)), el('div', 'radio-silk radio-deck-silk', { text: 'CASSETTE LOGGER' }));
    uc.appendChild(deck);
    const rot = el('div', 'radio-rotator');
    ui.compass = el('div', 'radio-compass');
    const rose = el('div', 'radio-rose');
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => rose.appendChild(cssVar(el('span', 'radio-rose-l' + (i % 2 ? ' radio-rose-minor' : ''), { text: n }), '--a', i * 45 + 'deg')));
    ui.needle = el('div', 'radio-compass-needle');
    ui.compass.append(el('div', 'radio-compass-ticks'), rose, ui.needle, el('div', 'radio-compass-hub'), el('div', 'radio-compass-glass'));
    ui.brg = el('div', 'radio-brg', { text: '000° N' });
    ui.rotKnob = el('div', 'radio-rotknob', { title: 'Antenna bearing [A / D]' }, el('div', 'radio-rotknob-cap'));
    ui.rotLamp = el('i', 'radio-rotlamp');
    rot.append(ui.compass, el('div', 'radio-rot-side', null, el('div', 'radio-silk', { text: 'ANTENNA ROTATOR' }), ui.brg, el('div', 'radio-rot-row', null, el('span', 'radio-silk radio-silk-sm', { text: 'CCW' }), ui.rotKnob, el('span', 'radio-silk radio-silk-sm', { text: 'CW' })), el('div', 'radio-rot-motor', null, ui.rotLamp, el('span', 'radio-silk radio-silk-sm', { text: 'MOTOR' }))));
    uc.appendChild(rot);
    ui.clock = el('div', 'radio-clock', null,
      el('div', 'radio-silk', { text: 'STATION TIME' }),
      (ui.clockTime = el('div', 'radio-clock-time', null,
        (ui.clockHH = el('span', 'radio-clock-hh', { text: '00' })),
        (ui.clockColon = el('span', 'radio-clock-colon', { text: ':' })),
        (ui.clockMM = el('span', 'radio-clock-mm', { text: '00' })))),
      (ui.clockDate = el('div', 'radio-clock-date', { text: '26 OCT 1999' })));
    uc.appendChild(ui.clock);
    rack.appendChild(uc);
    root.appendChild(rack);

    /* --- the desk surface -------------------------------------------------------- */
    const desk = el('div', 'radio-desktop');
    desk.appendChild(el('div', 'radio-desk-edge'));
    desk.appendChild(el('div', 'radio-ring'));
    desk.appendChild(el('div', 'radio-pen', null, el('i')));
    ui.notebook = el('div', 'radio-notebook', null,
      el('div', 'radio-nb-spiral'),
      el('div', 'radio-nb-head', { text: 'FREQS' }),
      (ui.nbList = el('div', 'radio-nb-list')));
    desk.appendChild(ui.notebook);
    ui.logbook = el('button', 'radio-logbook', { type: 'button', title: 'Open the log book', onclick: openLogBook },
      el('div', 'radio-logbook-label', { html: 'TRANSMISSION LOG<br><span>RELAY STATION 14</span>' }),
      el('div', 'radio-logbook-spine'));
    desk.appendChild(ui.logbook);
    ui.mic = el('div', 'radio-mic', { title: 'Push to talk [hold SPACE]' },
      el('div', 'radio-mic-head', null, el('div', 'radio-mic-grille'), el('div', 'radio-mic-badge', { text: 'D-104' })),
      el('div', 'radio-mic-stem'),
      el('div', 'radio-mic-base', null, (ui.micLamp = el('i', 'radio-mic-lamp')), el('div', 'radio-mic-ptt', { text: 'PTT' })));
    ui.mic.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (rt.mic.open) closeMic(); else openMic(true); });
    desk.appendChild(ui.mic);
    ui.mug = el('div', 'radio-mug hidden', null, el('div', 'radio-mug-steam', null, el('i'), el('i'), el('i')), el('div', 'radio-mug-body', null, el('span', null, { text: 'RS·14' })), el('div', 'radio-mug-handle'));
    desk.appendChild(ui.mug);
    desk.appendChild(el('div', 'radio-legend', null,
      el('div', 'radio-legend-h', { text: 'OPERATOR QUICK REFERENCE' }),
      el('div', 'radio-legend-grid', { html: [
        ['WHEEL · ← →', 'tune ±0.01'], ['SHIFT+WHEEL · ↑ ↓', 'tune ±0.10'], ['PGUP · PGDN', 'tune ±1.00'],
        ['DRAG DIAL', 'tune (spin it)'], ['A · D', 'antenna ∓5°'], ['HOLD SPACE', 'microphone'],
        ['1 – 9', 'say option'], ['L', 'log reception'], ['TAB', 'log book'], ['ESC · E', 'stand up'],
      ].map(([k, v]) => '<b>' + k + '</b><span>' + v + '</span>').join('') })));
    ui.stand = el('button', 'radio-stand', { type: 'button', onclick: () => stand() }, el('span', null, { text: 'STAND UP' }), el('kbd', null, { text: 'ESC' }));
    desk.appendChild(ui.stand);
    root.appendChild(desk);

    /* --- overlays: 2049 dust, subtitle strip, mic panel, fragments, tape picker --- */
    root.appendChild(el('div', 'radio-dust', null, el('i', 'radio-dust-sun')));
    ui.stripWrap = el('div', 'radio-strip', null,
      (ui.stripHead = el('div', 'radio-strip-head')),
      (ui.strip = el('div', 'radio-strip-lines')),
      (ui.stripHint = el('div', 'radio-strip-hint')),
      (ui.stripTimer = el('i', 'radio-strip-timer')));
    root.appendChild(ui.stripWrap);
    ui.micPanel = el('div', 'radio-micpanel hidden', null,
      (ui.micHead = el('div', 'radio-micpanel-head')),
      (ui.micList = el('div', 'radio-micpanel-list')),
      el('div', 'radio-micpanel-foot', { text: 'SAY [1–9] OR CLICK · RELEASE SPACE / ESC TO UNKEY' }));
    root.appendChild(ui.micPanel);
    ui.frags = el('div', 'radio-frags');
    root.appendChild(ui.frags);
    ui.tapePick = el('div', 'radio-tapepick hidden');
    root.appendChild(ui.tapePick);
    root.appendChild(el('div', 'radio-flicker'));
    ui.lightning = el('div', 'radio-lightning');
    root.appendChild(ui.lightning);
    root.appendChild(el('div', 'radio-vignette'));

    wireDial();
    wireRotator();
    root.addEventListener('wheel', onDeskWheel, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('pointerdown', (e) => {
      if (rt.mic.open && !ui.micPanel.contains(e.target) && !ui.mic.contains(e.target)) closeMic();
      if (!ui.tapePick.classList.contains('hidden') && !ui.tapePick.contains(e.target) && !e.target.closest('.radio-deck')) closeTapePicker();
    });

    const host = document.getElementById('screens') || document.body;
    host.appendChild(root);
    initMeterFace();
    renderNotebook();
  }

  function cancelControlDrag() {
    if (rt.controlDrag) rt.controlDrag();
  }
  function startControlDrag(node, down, move) {
    cancelControlDrag();
    const id = down.pointerId;
    const up = () => {
      node.removeEventListener('pointermove', mv);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      node.removeEventListener('lostpointercapture', end);
      rt.controlDrag = null;
      if (node.hasPointerCapture && node.hasPointerCapture(id)) node.releasePointerCapture(id);
    };
    const end = (event) => { if (event.pointerId === id) up(); };
    const mv = (event) => {
      if (event.pointerId !== id) return;
      if (!(event.buttons & 1)) { up(); return; }
      move(event);
    };
    rt.controlDrag = up;
    node.addEventListener('pointermove', mv);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('lostpointercapture', end);
    if (node.setPointerCapture) node.setPointerCapture(id);
  }

  function smallKnob(label, key) {
    const knob = el('div', 'radio-sknob', { title: label + ' (drag / wheel)' }, el('div', 'radio-sknob-cap'));
    const wrap = el('div', 'radio-sknob-wrap radio-sknob-' + key, null, el('div', 'radio-sknob-ring'), knob, el('div', 'radio-silk', { text: label }));
    const apply = (v) => {
      v = U.clamp(v, 0, 1);
      if (key === 'volume') setVolume(v); else setSquelch(v);
    };
    knob.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY, v0 = R()[key];
      const unit = ui.root.getBoundingClientRect().height / 100;
      const mv = (ev) => apply(v0 + (y0 - ev.clientY) / (unit * 18));
      startControlDrag(knob, e, mv);
    });
    wrap.addEventListener('wheel', (e) => { e._radio = true; e.preventDefault(); apply(R()[key] + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
    return { wrap, knob, key };
  }
  function setVolume(v) { R().volume = U.clamp(+v, 0, 1); }
  function setSquelch(v) { R().squelch = U.clamp(+v, 0, 1); }

  /* --- dial dragging with inertia -------------------------------------------------- */
  function wireDial() {
    const d = ui.dial;
    let a0 = 0, last = 0, vel = 0, cx = 0, cy = 0;
    const ang = (e) => (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = d.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      a0 = ang(e);
      last = performance.now();
      vel = 0;
      rt.dragging = true;
      rt.dialVel = 0;
      rt.dialAcc = R().freq * 100;
      cancelScan();
      rt.glide = null;
      d.setPointerCapture && d.setPointerCapture(e.pointerId);
      d.classList.add('radio-grab');
    });
    d.addEventListener('pointermove', (e) => {
      if (!rt.dragging) return;
      const a1 = ang(e);
      let da = a1 - a0;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      a0 = a1;
      const t = performance.now();
      const dts = Math.max(0.001, (t - last) / 1000);
      last = t;
      vel = U.lerp(vel, da / dts, 0.35);
      rt.dialAcc = U.clamp(rt.dialAcc + (da / DEG_PER_MHZ) * 100, 0, FMAX * 100);
      setFreq(Math.round(rt.dialAcc) / 100, true);
    });
    const up = () => {
      if (!rt.dragging) return;
      rt.dragging = false;
      d.classList.remove('radio-grab');
      if (performance.now() - last < 90 && Math.abs(vel) > 60) rt.dialVel = U.clamp(vel, -2400, 2400);
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
  }
  /* --- antenna rotator: grab the needle (absolute) or twist the knob (relative) ---- */
  function wireRotator() {
    const c = ui.compass;
    const abs = (e) => {
      const r = c.getBoundingClientRect();
      const a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
      rt.bearingTarget = Math.round(((a % 360) + 360) % 360);
      touched();
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      abs(e);
      const mv = (ev) => abs(ev);
      startControlDrag(c, e, mv);
    });
    const k = ui.rotKnob;
    k.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      let x0 = e.clientX;
      const unit = ui.root.getBoundingClientRect().height / 100;
      const mv = (ev) => {
        const d = (ev.clientX - x0) / unit;
        x0 = ev.clientX;
        rt.bearingTarget = Math.round((rt.bearingTarget + d * 6 + 360) % 360);
        touched();
      };
      startControlDrag(k, e, mv);
    });
    const wheelRot = (e) => { e._radio = true; e.preventDefault(); rt.bearingTarget = Math.round((rt.bearingTarget + (e.deltaY < 0 ? 5 : -5) + 360) % 360); touched(); };
    c.addEventListener('wheel', wheelRot, { passive: false });
    k.addEventListener('wheel', wheelRot, { passive: false });
  }
  function onDeskWheel(e) {
    if (e._radio) return;
    if (e.target.closest && (e.target.closest('.radio-micpanel') || e.target.closest('.radio-tapepick') || e.target.closest('.radio-nb-list'))) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.01;
    const dy = e.deltaY || e.deltaX;
    if (!dy) return;
    nudge(dy < 0 ? step : -step);
  }

  /* --- mic / push-to-talk ----------------------------------------------------------- */
  /** What the notebook calls a frequency, short ('027.18' → 'CB 19'), or ''. */
  function chanName(freq) {
    const n = R().notebook.find((x) => Math.abs(x.freq - freq) < 0.001 && x.label);
    return n ? n.label.split(/\s*[—–\/,.]\s*|\s+-\s+/)[0].trim() : '';
  }
  /** The gist of an outgoing message for the mic panel: content label, else the text without its call-up. */
  function outGist(o) {
    if (o.label) return DA.fmt(o.label);
    const t = DA.fmt(o.text || '');
    const parts = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
    if (parts.length > 1 && /fourteen|station|breaker|county/i.test(parts[0])) return parts.slice(1).join('').trim();
    return t;
  }
  /** The note the empty mic panel shows (setMicNote), if it applies on this frequency. */
  function micNoteHere() {
    const n = rt.micNote;
    if (!n) return null;
    return n.freq == null || Math.abs(n.freq - R().freq) <= 0.02 + 1e-6 ? n.text : null;
  }
  /**
   * The mic panel: the pending choice here, else the outgoing traffic sendable here; plus the
   * traffic queued on OTHER frequencies (design decision 3), which tunes there when picked.
   */
  function micItems() {
    const f = R().freq;
    const away = R().outgoing
      .filter((o) => o.freq != null && Math.abs(o.freq - f) > 0.02 + 1e-6)
      .map((o) => ({ id: o.id, tune: o.freq, text: outGist(o), chan: chanName(o.freq), out: o }));
    const T = micPending();
    if (T) return { kind: 'choose', T, prompt: T.pending.prompt, items: T.pending.options.map((o) => ({ id: o.id, text: o.text, silent: !!o.silent, opt: o })), away };
    const outs = outgoingHere();
    if (outs.length) return { kind: 'out', items: outs.map((o) => ({ id: o.id, text: DA.fmt(o.text), silent: false, out: o })), away };
    return { kind: 'none', items: [], away, note: micNoteHere() };
  }
  function openMic(latched) {
    if (!ui.root) return;
    if (!R().power) { sfx('switch', { vol: 0.3 }); addStrip({ kind: 'sys', speaker: null, text: 'THE MICROPHONE IS DEAD', dur: 1.6, seed: 6, clar: () => 1 }); return; }
    if (rt.mic.speaking > 0) return;
    rt.mic.open = true;
    rt.mic.latched = !!latched;
    rt.mic.keyed = !latched;
    sfx('radio_click', { vol: 0.35 });
    refreshMic(true);
  }
  function closeMic() {
    if (!rt.mic.open) return;
    rt.mic.open = false;
    rt.mic.keyed = false;
    rt.mic.latched = false;
    if (ui.micPanel) ui.micPanel.classList.add('hidden');
    sfx('radio_click', { vol: 0.25, rate: 0.8 });
  }
  function refreshMic(force) {
    if (!ui.root || (!rt.mic.open && !force)) return;
    if (!rt.mic.open) return;
    const m = micItems();
    // while a choice waits here, the other frequencies are listed but not numbered (click only)
    const numbered = m.kind === 'choose' ? m.items : m.items.concat(m.away);
    const sig = m.kind + '|' + (m.prompt || '') + '|' + m.items.map((i) => i.id + i.text).join('|') + '|' + m.away.map((i) => i.id + i.tune).join('|') + '|' + (m.note || '') + '|' + fmtFreq(R().freq);
    rt.mic.items = numbered;
    rt.mic.away = m.away;
    rt.mic.kind = m.kind;
    ui.micPanel.classList.remove('hidden');
    if (sig === ui.micSig) return;
    ui.micSig = sig;
    ui.micHead.innerHTML = '<span class="radio-micpanel-tx">TX</span> ' + U.esc(fmtFreq(R().freq)) + ' MHz' + (m.prompt ? '<em>' + U.esc(m.prompt) + '</em>' : '');
    ui.micList.textContent = '';
    if (!m.items.length) ui.micList.appendChild(el('div', 'radio-opt radio-opt-none' + (m.note ? ' radio-opt-note' : ''), { text: m.note || '[nothing to send on this frequency]' }));
    m.items.forEach((it, i) => {
      const row = el('button', 'radio-opt' + (it.silent ? ' radio-opt-silent' : ''), { type: 'button', onclick: (e) => { e.stopPropagation(); sayItem(i); } },
        el('kbd', null, { text: String(i + 1) }), el('span', null, { text: it.text }));
      ui.micList.appendChild(row);
    });
    if (m.away.length) {
      ui.micList.appendChild(el('div', 'radio-micpanel-sep', { text: m.items.length ? 'ALSO QUEUED ON OTHER FREQUENCIES' : 'QUEUED ON OTHER FREQUENCIES' }));
      m.away.forEach((it) => {
        const n = numbered.indexOf(it);
        const row = el('button', 'radio-opt radio-opt-away', { type: 'button', title: 'Tune ' + fmtFreq(it.tune), onclick: (e) => { e.stopPropagation(); tuneAway(it); } },
          el('kbd', null, { text: n >= 0 && n < 9 ? String(n + 1) : '·' }),
          el('span', 'radio-opt-f', { text: fmtFreq(it.tune) }),
          it.chan ? el('span', 'radio-opt-ch', { text: it.chan }) : null,
          el('span', 'radio-opt-t', { text: it.text }),
          el('em', null, { text: 'TUNE ▸' }));
        ui.micList.appendChild(row);
      });
    }
  }
  /** A message queued elsewhere was picked: glide there, keep the mic open to send it. */
  function tuneAway(it) {
    if (!it || it.tune == null) return false;
    sfx('radio_click', { vol: 0.3 });
    tune(it.tune, { glide: true });
    rt.mic.open = true;
    rt.mic.keyed = false;
    rt.mic.latched = true;
    ui.micSig = '';
    refreshMic();
    return true;
  }
  function sayItem(i) {
    const it = rt.mic.items[i];
    if (!it) return false;
    if (it.tune != null) return tuneAway(it);
    const kind = rt.mic.kind;
    rt.mic.open = false;
    rt.mic.keyed = false;
    rt.mic.latched = false;
    ui.micPanel.classList.add('hidden');
    ui.micSig = '';
    if (kind === 'choose') return choosePending(micPending() || anyPending(), it.opt);
    if (kind === 'out') return send(it.id);
    return false;
  }
  /** What the empty mic panel says (director: a need is pending). null = the generic line. */
  function setMicNote(text, opts) {
    const f = opts && opts.freq != null && isFinite(+opts.freq) ? q2(+opts.freq) : null;
    rt.micNote = text == null || text === '' ? null : { text: String(text), freq: f };
    ui.micSig = '';
    refreshMic();
  }
  /** Answer the pending choice programmatically (director / tests). */
  function pick(idOrIndex) {
    const T = anyPending();
    if (!T) return false;
    const opts = T.pending.options;
    const o = typeof idOrIndex === 'number' ? opts[idOrIndex] : opts.find((x) => x.id === idOrIndex);
    return o ? choosePending(T, o) : false;
  }
  function pending() {
    const T = anyPending();
    if (!T) return null;
    return { txId: T.id, node: T.pending.node, prompt: T.pending.prompt, options: T.pending.options.map((o) => ({ id: o.id, t: o.text, silent: !!o.silent })) };
  }

  /* --- tape picker (found tapes) ------------------------------------------------------ */
  function toggleTapePicker() {
    if (!ui.tapePick) return;
    if (!ui.tapePick.classList.contains('hidden')) return closeTapePicker();
    const tapes = (DA.state.tapes || []).filter((id) => (content().tapes || {})[id]);
    ui.tapePick.textContent = '';
    ui.tapePick.appendChild(el('div', 'radio-tapepick-h', { text: 'CASSETTES' }));
    const add = (id, label, sub) => ui.tapePick.appendChild(el('button', 'radio-tapepick-item' + (R().tape === id ? ' radio-on' : ''), { type: 'button', onclick: (e) => { e.stopPropagation(); closeTapePicker(); if (id) insertTape(id); else { ejectTape(); } } }, el('b', null, { text: label }), sub ? el('span', null, { text: sub }) : null));
    add(null, 'STN 14 — LOG', 'station logger (' + R().recordings.length + ' recorded)');
    tapes.forEach((id) => { const t = content().tapes[id]; add(id, DA.fmt(t.label || id), t.year ? String(t.year) : t.desc || ''); });
    if (!tapes.length) ui.tapePick.appendChild(el('div', 'radio-tapepick-none', { text: 'No other tapes.' }));
    ui.tapePick.classList.remove('hidden');
  }
  function closeTapePicker() { if (ui.tapePick) ui.tapePick.classList.add('hidden'); }

  /* --- desk buttons ------------------------------------------------------------------ */
  function openLogBook() {
    sfx('paper', { vol: 0.6 });
    if (DA.ui && DA.ui.journal) DA.ui.journal('log');
  }
  function openCCTV() {
    if (!DA.flag('cctv_on')) return;
    const dv = DA.devices;
    if (dv && dv.cctv && dv.cctv.open) dv.cctv.open();
    else if (DA.modes.defs.cctv) DA.modes.push('cctv');
  }
  /**
   * The seated view jolts: the chair shifts under you / something falls behind you. Web Animations
   * on the individual translate/rotate/scale properties, so it never fights the sit-down transform.
   */
  function jolt(amount) {
    const a = U.clamp(amount == null ? 1 : +amount || 0, 0, 2);
    rt.joltT = now();
    if (!ui.root || !atDesk() || a <= 0 || ui.root.classList.contains('hidden') || typeof ui.root.animate !== 'function') return false;
    const u = (ui.root.getBoundingClientRect().height || 720) / 100;
    const dx = 0.85 * u * a, dy = 0.4 * u * a, r = 0.42 * a, k = 1 + 0.024 * Math.min(1, a);
    const f = (x, y, rot, sc, off) => ({ offset: off, translate: x.toFixed(2) + 'px ' + y.toFixed(2) + 'px', rotate: rot.toFixed(3) + 'deg', scale: String(sc) });
    try {
      if (rt.joltAnim) rt.joltAnim.cancel();
      rt.joltAnim = ui.root.animate([
        f(0, 0, 0, 1, 0), f(dx, dy, -r, k, 0.07), f(-dx * 0.55, -dy * 0.3, r * 0.45, k, 0.26),
        f(dx * 0.22, dy * 0.1, -r * 0.15, 1 + (k - 1) * 0.6, 0.5), f(0, 0, 0, 1, 1),
      ], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' });
    } catch (e) { return false; }
    return true;
  }
  /** roomfeed:event chair_move / jar_fall while seated: jolt (+ the scrape) unless the director did. */
  function onFeedEvent(e) {
    if (!e || !atDesk()) return;
    const amt = e.event === 'chair_move' ? 1 : e.event === 'jar_fall' ? 0.45 : 0;
    if (!amt) return;
    const t0 = now();
    DA.timers.after(0.12, () => {
      if (!atDesk() || rt.joltT >= t0 - 0.05) return; // already felt (director.chairMove)
      jolt(amt);
      if (e.event !== 'chair_move') return;
      let c = null;
      try { c = DA.world && DA.world.prop ? DA.world.prop('chair') : null; } catch (err) { c = null; }
      sfx('chair_scrape', c && isFinite(c.x) ? { x: c.x, y: c.y, map: c.map || 'station', vol: 0.95 } : { vol: 0.9 });
    });
  }
  function sit() { if (!DA.modes.has('radio')) DA.modes.push('radio'); }
  function stand() {
    if (DA.modes.is('radio')) DA.modes.pop();
    else if (DA.modes.has('radio')) DA.modes.pop('radio');
  }

  /* --- subtitle strip ----------------------------------------------------------------- */
  let stripId = 0;
  function addStrip(line) {
    if (!ui.root) return line;
    line.id = ++stripId;
    line.life = (line.dur || 2) + (line.kind === 'sys' ? 0.4 : 3.5);
    line.age = 0;
    line.el = el('div', 'radio-sl radio-sl-' + line.kind);
    const info = line.speaker ? speakerInfo(line.speaker) : null;
    line.nameEl = el('span', 'radio-sl-name');
    line.textEl = el('span', 'radio-sl-text');
    if (info) {
      line.name = line.name || (line.speaker === 'you' ? 'YOU' : info.name);
      if (info.color) line.nameEl.style.color = info.color;
      line.el.appendChild(line.nameEl);
    }
    line.el.appendChild(line.textEl);
    ui.strip.appendChild(line.el);
    rt.strip.push(line);
    while (rt.strip.length > 4) { const old = rt.strip.shift(); old.el.remove(); }
    return line;
  }
  function renderStrip(dt) {
    let anyVisible = false;
    for (let i = rt.strip.length - 1; i >= 0; i--) {
      const l = rt.strip[i];
      l.age += dt;
      if (!l.sticky) l.life -= dt;
      if (l.sticky && l.life < 1000) l.life -= dt;
      if (l.life <= 0) { l.el.remove(); rt.strip.splice(i, 1); continue; }
      const c = l.clar ? l.clar() : 1;
      const cq = Math.round(c * 50) / 50;
      let text;
      if (l.kind === 'you' || l.kind === 'sys' || l.kind === 'cap') text = l.text;
      else text = U.garble(l.text, cq, l.seed);
      const visible = l.kind === 'you' || l.kind === 'sys' || c > 0.04;
      if (visible) anyVisible = true;
      setCls(l.el, 'radio-sl-hidden', !visible);
      setText(l.textEl, text);
      if (l.nameEl) setText(l.nameEl, c > 0.55 || l.kind === 'you' ? l.name : '· · ·');
      const fade = l.life < 1.2 ? l.life / 1.2 : 1;
      const older = rt.strip.length - 1 - i;
      setStyle(l.el, 'opacity', String(Math.round(fade * (older ? Math.max(0.35, 1 - older * 0.28) : 1) * 100) / 100));
    }
    // Whole lines only: an older line pushed up under the RX header is dropped, never shown
    // half-clipped (checked when lines change, else ~4× a second).
    rt.stripChk = (rt.stripChk || 0) - dt;
    const key = rt.strip.length ? rt.strip[rt.strip.length - 1].id + ':' + rt.strip.length : '';
    if (rt.strip.length > 1 && (key !== rt.stripKey || rt.stripChk <= 0)) {
      rt.stripKey = key;
      rt.stripChk = 0.25;
      const top = ui.strip.offsetTop - 1;
      for (let i = 0; i < rt.strip.length - 1; i++) {
        const l = rt.strip[i];
        if (l.el.offsetTop >= top) break;
        if (l.sticky) continue;
        l.el.remove();
        rt.strip.splice(i, 1);
        i--;
      }
    }
    setCls(ui.stripWrap, 'radio-empty', !anyVisible && !(ui.stripHint._c && ui.stripHint._c['radio-on']));
  }
  function renderStripHead() {
    // Header: what the receiver is locked on right now (never the stamp — that is for the log).
    // Priority: what the dial is locked on, then strong local traffic heard regardless of tuning.
    let head = '';
    const txHead = (T) => '#' + U.pad(T.num) + ' · ' + T.entry.sender;
    for (const T of rt.active.values()) if (T.src.live && T.entry) { head = txHead(T); break; }
    const feed = findSrc('roomfeed');
    if (!head && rt.feeds.length && feed && feed.live) head = 'ROOM · 014.00';
    const wsrc = findSrc('weather');
    if (!head && wsrc && wsrc.live) head = 'NOAA WEATHER RADIO · ' + fmtFreq(wsrc.freq);
    if (!head) for (const T of rt.active.values()) if (T.noLock && T.entry) { head = txHead(T); break; }
    if (!R().power) head = '';
    setText(ui.stripHead, head);
    setCls(ui.stripHead, 'radio-on', !!head);
    // Hint: a transmission is waiting for an answer.
    const T = micPending();
    let hint = '';
    if (T && !rt.mic.open && R().power) hint = (T.pending.prompt ? T.pending.prompt + '  ·  ' : '') + 'HOLD SPACE TO TALK';
    else if (!T && anyPending() && !rt.mic.open && R().power) hint = 'SOMEONE IS WAITING FOR AN ANSWER ON ' + fmtFreq(anyPending().src.freq);
    setText(ui.stripHint, hint);
    setCls(ui.stripHint, 'radio-on', !!hint);
    // the answer window drains away (a caller does not wait for ever)
    const PT = T || anyPending();
    const p = PT && PT.pending;
    const showT = !!(p && !p.speaking && R().power && p.timeout > 0 && p.timeout < 900);
    setCls(ui.stripTimer, 'radio-on', showT);
    if (showT) {
      setStyle(ui.stripTimer, 'transform', 'scaleX(' + U.clamp(1 - p.t / p.timeout, 0, 1).toFixed(3) + ')');
      setCls(ui.stripTimer, 'radio-low', p.timeout - p.t < 10);
    }
  }

  /* --- jam fragments ------------------------------------------------------------------ */
  function addFrag(text, c, death, cap) {
    if (!ui.frags) return;
    const e = el('div', 'radio-frag' + (death ? ' radio-frag-death' : '') + (cap ? ' radio-frag-cap' : ''), { text: cap ? text : U.garble(text, Math.min(1, c + 0.35), Math.random() * 1e4 | 0) });
    let x = 4 + Math.random() * 70;
    const y = 6 + Math.random() * 78;
    let fs = 2 + Math.random() * 2.6;
    e.style.left = x + '%';
    e.style.top = y + '%';
    e.style.setProperty('--dur', (3 + Math.random() * 3).toFixed(2) + 's');
    e.style.setProperty('--sk', ((Math.random() - 0.5) * 6).toFixed(1) + 'deg');
    e.style.fontSize = 'calc(var(--u) * ' + fs.toFixed(2) + ')';
    ui.frags.appendChild(e);
    // keep it on screen: shrink a line wider than ~90% of the desk, then pull it left so it ends
    // before the right edge (it also drifts 2u right as it fades)
    const W = ui.frags.clientWidth || 0;
    if (W > 0) {
      let w = e.scrollWidth;
      const max = W * 0.9;
      if (w > max) { fs *= max / w; e.style.fontSize = 'calc(var(--u) * ' + fs.toFixed(2) + ')'; w = e.scrollWidth; }
      const u = (ui.root.clientHeight || W * 0.5625) / 100;
      const room = W * 0.97 - w - 2.5 * u;
      if ((x / 100) * W > room) { x = Math.max(1, (room / W) * 100); e.style.left = x.toFixed(2) + '%'; }
    }
    rt.frags.push({ el: e, life: 6.5 });
    while (rt.frags.length > 14) rt.frags.shift().el.remove();
  }
  function clearFrags() { for (const f of rt.frags) f.el.remove(); rt.frags = []; }
  function renderFrags(dt) {
    for (let i = rt.frags.length - 1; i >= 0; i--) { const f = rt.frags[i]; f.life -= dt; if (f.life <= 0) { f.el.remove(); rt.frags.splice(i, 1); } }
  }

  /* --- notebook --------------------------------------------------------------------- */
  function renderNotebook(fresh) {
    if (!ui.nbList) return;
    ui.nbList.textContent = '';
    for (const n of R().notebook) {
      const ink = HAND_INK[n.hand] || 'other';
      const row = el('button', 'radio-nb-entry radio-ink-' + ink + (n.mark ? ' radio-nb-' + n.mark : '') + (n === fresh ? ' radio-nb-fresh' : ''), {
        type: 'button', title: 'Tune ' + fmtFreq(n.freq),
        onclick: (e) => { e.stopPropagation(); sfx('radio_click', { vol: 0.3 }); tune(n.freq, { glide: true }); },
      }, el('span', 'radio-nb-f', { text: fmtFreq(n.freq) }), n.label ? el('span', 'radio-nb-dash', { text: '—' }) : null, n.label ? el('span', 'radio-nb-l', { text: n.label }) : null);
      row.style.setProperty('--tilt', ((U.hash(n.freq + n.label) % 100) / 100 - 0.5).toFixed(2) + 'deg');
      ui.nbList.appendChild(row);
    }
    if (fresh) ui.nbList.scrollTop = ui.nbList.scrollHeight;
  }

  /* --- duty slip (open objectives, design decision 1) ------------------------------- */
  const DUTY_MAX = 5;
  const LOG_CUE = ['obj_check_log']; // open → the LOG BOOK pulses (decision 15)
  const dutyRows = new Map();        // objective id → {el, box, text}
  const objList = () => (DA.state && Array.isArray(DA.state.objectives) ? DA.state.objectives : []);
  function renderDuty() {
    if (!ui.duty) return;
    const t = now();
    for (const [id, at] of rt.dutyDone) if (t - at > 2.6 || t < at) rt.dutyDone.delete(id);
    for (const [id, at] of rt.dutyNew) if (t - at > 4 || t < at) rt.dutyNew.delete(id);
    const all = objList().filter((o) => o && o.id != null && (!o.done || rt.dutyDone.has(o.id)));
    const shown = all.slice(-DUTY_MAX);
    const keep = new Set(shown.map((o) => o.id));
    for (const [id, r] of dutyRows) if (!keep.has(id)) { r.el.remove(); dutyRows.delete(id); }
    let prev = null;
    for (const o of shown) {
      let r = dutyRows.get(o.id);
      if (!r) {
        r = { el: el('div', 'radio-duty-row'), box: el('i', 'radio-duty-box'), text: el('span', 'radio-duty-t') };
        r.el.append(r.box, r.text);
        dutyRows.set(o.id, r);
        if (rt.dutyNew.has(o.id)) r.el.classList.add('radio-duty-new');
      }
      const want = prev ? prev.nextSibling : ui.dutyList.firstChild;
      if (want !== r.el) ui.dutyList.insertBefore(r.el, want);
      prev = r.el;
      setText(r.text, DA.fmt(String(o.text || '')));
      setCls(r.el, 'radio-duty-done', !!o.done);
      setCls(r.el, 'radio-duty-glitch', !!o.glitch);
    }
    setCls(ui.duty, 'radio-duty-empty', !shown.length);
    // whole rows only: while the slip is on screen and a row would be cut off at its foot, the
    // oldest rows give way (counted in '+ N more')
    let hidden = 0;
    const els = shown.map((o) => dutyRows.get(o.id).el);
    for (const e of els) if (e.style.display) e.style.display = '';
    const moreText = (n) => (n > 0 ? '+ ' + n + ' more  ·  TAB' : '');
    setText(ui.dutyMore, moreText(all.length - shown.length));
    if (shown.length && ui.root && !ui.root.classList.contains('hidden') && ui.duty.clientHeight > 0) {
      while (hidden < els.length - 1 && ui.duty.scrollHeight > ui.duty.clientHeight + 1) {
        els[hidden].style.display = 'none';
        hidden++;
        setText(ui.dutyMore, moreText(all.length - shown.length + hidden));
      }
    }
    setCls(ui.logbook, 'radio-logbook-cue', objList().some((o) => o && !o.done && LOG_CUE.includes(o.id)));
  }
  function dutyReset() {
    for (const r of dutyRows.values()) r.el.remove();
    dutyRows.clear();
    rt.dutyDone.clear();
    rt.dutyNew.clear();
    renderDuty();
  }
  function onObjectiveSet(e) {
    if (!e || e.id == null) return;
    const r = dutyRows.get(e.id);
    const fresh = !r || r.el.classList.contains('radio-duty-done') || (e.text != null && r.text._t !== DA.fmt(String(e.text)));
    rt.dutyDone.delete(e.id);
    if (fresh) rt.dutyNew.set(e.id, now());
    if (fresh && r) { r.el.classList.remove('radio-duty-new'); void r.el.offsetWidth; r.el.classList.add('radio-duty-new'); }
    renderDuty();
    if (fresh && atDesk() && ui.duty) {
      // a seated operator notices a new duty: the slip twitches, paper rustles
      ui.duty.classList.remove('radio-duty-bump');
      void ui.duty.offsetWidth;
      ui.duty.classList.add('radio-duty-bump');
      sfx('paper', { vol: 0.3 });
    }
  }

  /* --- tape label ------------------------------------------------------------------- */
  function renderTapeLabel() {
    if (!ui.tapeLabel) return;
    const id = R().tape;
    const t = id && (content().tapes || {})[id];
    setText(ui.tapeLabel, t ? DA.fmt(t.label || id) : id ? String(id) : abandoned() ? 'STN 14 — LOG  26/27 OCT 1999' : 'STN 14 — LOG  26/27 OCT');
    setCls(ui.cass, 'radio-cass-found', !!t);
  }

  /* --- meter (canvas) --------------------------------------------------------------- */
  const meter = { v: 0, vel: 0, faceLit: null, faceDark: null };
  function initMeterFace() {
    const W = 290, H = 200;
    const mk = (lit) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const bg = g.createRadialGradient(W / 2, H * 0.95, 20, W / 2, H * 0.7, W * 0.75);
      if (lit) { bg.addColorStop(0, '#fff3c9'); bg.addColorStop(0.55, '#f0d88f'); bg.addColorStop(1, '#a0782e'); }
      else { bg.addColorStop(0, '#8a8272'); bg.addColorStop(1, '#3a342a'); }
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H * 1.02, R0 = H * 0.8;
      const a0 = -Math.PI / 2 - 0.82, a1 = -Math.PI / 2 + 0.82;
      const ink = lit ? '#1d160c' : '#16130e';
      g.lineCap = 'butt';
      // red "+dB" arc
      g.strokeStyle = lit ? '#b8261b' : '#4d1f1a';
      g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, R0, a0 + (a1 - a0) * 0.6, a1); g.stroke();
      g.strokeStyle = ink;
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, R0 - 5, a0, a1); g.stroke();
      const labels = ['1', '3', '5', '7', '9', '+20', '+40', '+60'];
      for (let i = 0; i <= 20; i++) {
        const k = i / 20, a = a0 + (a1 - a0) * k;
        const major = i % 3 === 0 && i <= 12 || i === 15 || i === 18 || i === 20;
        const r1 = R0 - 5, r2 = R0 - (major ? 20 : 12);
        g.strokeStyle = k > 0.6 ? (lit ? '#a01f16' : '#4d1f1a') : ink;
        g.lineWidth = major ? 2.4 : 1.4;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
      }
      g.font = 'bold 17px "IBM Plex Mono", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      labels.forEach((t, i) => {
        const k = i < 5 ? (i * 3) / 20 : [15, 18, 20][i - 5] / 20;
        const a = a0 + (a1 - a0) * k;
        g.fillStyle = k > 0.6 ? (lit ? '#a01f16' : '#4d1f1a') : ink;
        g.fillText(t, cx + Math.cos(a) * (R0 - 33), cy + Math.sin(a) * (R0 - 33));
      });
      g.fillStyle = ink;
      g.font = 'bold 15px "IBM Plex Mono", monospace';
      g.fillText('S', cx - R0 * 0.83, cy - R0 * 0.3);
      g.font = '600 13px "IBM Plex Mono", monospace';
      g.fillText('SIGNAL', cx, H * 0.56);
      g.font = '11px "IBM Plex Mono", monospace';
      g.globalAlpha = 0.7;
      g.fillText('dB', cx + R0 * 0.83, cy - R0 * 0.3);
      g.globalAlpha = 1;
      return c;
    };
    meter.faceLit = mk(true);
    meter.faceDark = mk(false);
    // Fonts may arrive late (Google Fonts): redraw once they are ready.
    if (document.fonts && document.fonts.ready && !meter.fontHooked) {
      meter.fontHooked = true;
      document.fonts.ready.then(() => initMeterFace());
    }
  }
  function drawMeter(dt) {
    const cv = ui.meter;
    if (!cv) return;
    const g = meter.g || (meter.g = cv.getContext('2d', { alpha: false }));
    const W = cv.width, H = cv.height, r = R();
    let target = 0;
    if (r.power) {
      target = Math.min(1.04, rt.bestC * 1.08 + 0.03 + Math.random() * 0.025 + (r.jam ? Math.random() * r.jam * 0.35 : 0));
      if (rt.scan) target = 0.08 + Math.random() * 0.3;
    }
    // A damped spring: the needle has mass.
    const k = 70, damp = 11;
    meter.vel += ((target - meter.v) * k - meter.vel * damp) * dt;
    meter.v += meter.vel * dt;
    if (meter.v < -0.02) { meter.v = -0.02; meter.vel = 0; }
    g.drawImage(r.power ? meter.faceLit : meter.faceDark, 0, 0);
    const cx = W / 2, cy = H * 1.02, R0 = H * 0.8;
    const a = -Math.PI / 2 - 0.82 + 1.64 * U.clamp(meter.v, -0.02, 1.05);
    g.save();
    // the needle's shadow on the face, then the needle
    g.strokeStyle = 'rgba(60,40,10,0.28)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + 3, cy + 2); g.lineTo(cx + 3 + Math.cos(a) * (R0 + 2), cy + 2 + Math.sin(a) * (R0 + 2)); g.stroke();
    g.strokeStyle = '#141008';
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R0 + 4), cy + Math.sin(a) * (R0 + 4)); g.stroke();
    g.strokeStyle = '#c0281c';
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (R0 - 26), cy + Math.sin(a) * (R0 - 26)); g.lineTo(cx + Math.cos(a) * (R0 + 4), cy + Math.sin(a) * (R0 + 4)); g.stroke();
    g.restore();
    g.fillStyle = '#1a1712';
    g.beginPath(); g.ellipse(cx, H - 2, 34, 22, 0, Math.PI, 0); g.fill();
  }

  /* --- spectrum + waterfall (canvas) -------------------------------------------------- */
  /*
   * The panadapter is rendered as pixels: a green-phosphor intensity buffer for the trace
   * (decays → persistence), a palette-coloured waterfall scrolled in place, and one
   * putImageData per frame into a CPU-backed canvas. Axis labels / LOCK tag are DOM.
   */
  const SPEC_W = 560, SPEC_H = 164, SPEC_TRACE_H = 78, SPEC_AXIS_H = 14;
  const SPEC_WF_Y = SPEC_TRACE_H + SPEC_AXIS_H, SPEC_WF_H = SPEC_H - SPEC_WF_Y;
  const spec = { img: null, px: null, ph: null, levels: null, shiftPx: 0, acc: 0, vis: [], g: null, dark: false, labels: [], lock: null };
  /** Logarithmic (dB-like) display scale: the noise floor lives, strong carriers do not clip. */
  const dbv = (v) => Math.log(1 + Math.max(0, v) * 30) / Math.log(31);
  const c8 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
  const abgr = (r, g, b) => ((0xff << 24) | (c8(b) << 16) | (c8(g) << 8) | c8(r)) >>> 0;
  /** Waterfall palette: black → phosphor green → white-hot. */
  const WF_PAL = (() => {
    const pal = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      pal[i] = abgr(Math.min(255, v * v * v * 170 + (v > 0.9 ? (v - 0.9) * 900 : 0)), Math.min(255, 5 + v * 250), Math.min(255, 3 + v * v * 110));
    }
    return pal;
  })();
  /** Trace phosphor palette (intensity → colour). */
  const PH_PAL = (() => {
    const pal = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      pal[i] = abgr(2 + Math.pow(v, 2.2) * 200, 7 + Math.pow(v, 0.8) * 250, 3 + Math.pow(v, 1.8) * 205);
    }
    return pal;
  })();
  const C_BG = abgr(1, 4, 1), C_AXIS = abgr(2, 9, 3), C_TICK = abgr(60, 140, 80), C_AMBER = abgr(255, 190, 90), C_AMBER_DIM = abgr(120, 86, 38), C_LOCK = abgr(255, 210, 122), C_SHADE = abgr(0, 1, 0);
  function wfInit() {
    const cv = ui.spec;
    if (!cv || spec.img) return;
    spec.g = cv.getContext('2d', { alpha: false, willReadFrequently: true });
    spec.img = spec.g.createImageData(SPEC_W, SPEC_H);
    spec.px = new Uint32Array(spec.img.data.buffer);
    spec.px.fill(C_BG);
    spec.ph = new Float32Array(SPEC_W * SPEC_TRACE_H);
    spec.levels = new Float32Array(SPEC_W);
  }
  function wfClear() {
    if (!spec.px) return;
    spec.px.fill(C_BG);
    spec.ph.fill(0);
  }
  /** Keep the waterfall history registered to frequency while the dial moves. */
  function wfShift(dMHz) { spec.shiftPx += (-dMHz / (HALF_SPAN * 2)) * SPEC_W; }
  function wfApplyShift() {
    const sp = Math.round(spec.shiftPx);
    if (!sp) return;
    spec.shiftPx -= sp;
    const W = SPEC_W, b = spec.px;
    for (let y = SPEC_WF_Y; y < SPEC_H; y++) {
      const o = y * W;
      if (Math.abs(sp) >= W) b.fill(C_BG, o, o + W);
      else if (sp > 0) { b.copyWithin(o + sp, o, o + W - sp); b.fill(C_BG, o, o + sp); }
      else { b.copyWithin(o, o - sp, o + W); b.fill(C_BG, o + W + sp, o + W); }
    }
  }
  /** Sources that can reach the visible window this frame. */
  function visibleSources(f0, f1) {
    const out = spec.vis;
    out.length = 0;
    for (const s of rt.sources) {
      const sf = s.cur != null ? s.cur : s.freq;
      const w = Math.max(0.01, s.width);
      if (sf + w * 4 < f0 || sf - w * 4 > f1) continue;
      const on = srcOn(s);
      if (on <= 0) continue;
      out.push({ sf, w, a: s.strength * on * (s.fb != null ? s.fb : fBearing(s.bearing)), s });
    }
    return out;
  }
  function levelAt(f, t, vis) {
    let v = 0;
    for (const q of vis) {
      const d = (f - q.sf) / q.w;
      if (d > 4 || d < -4) continue;
      v += q.a * Math.exp(-d * d * 2.2);
    }
    if (R().jam > 0) {
      const b0 = Math.round(f * 50);
      for (let b = b0 - 1; b <= b0 + 1; b++) {
        const j = jamAt(b, t);
        if (j) { const d = (f - b / 50) / 0.012; v += j * Math.exp(-d * d * 2); }
      }
    }
    return v;
  }
  const specY = (v) => Math.round(SPEC_TRACE_H - 3 - U.clamp(dbv(v), 0, 1.08) * (SPEC_TRACE_H - 12));
  function drawSpectrum(dt) {
    const cv = ui.spec;
    if (!cv) return;
    wfInit();
    const r = R(), t = now(), W = SPEC_W, TH = SPEC_TRACE_H;
    const px = spec.px, ph = spec.ph, L = spec.levels;
    if (!r.power) {
      if (!spec.dark) { px.fill(abgr(0, 2, 0)); ph.fill(0); spec.g.putImageData(spec.img, 0, 0); spec.dark = true; }
      specLabels(null);
      return;
    }
    spec.dark = false;
    const f0 = r.freq - HALF_SPAN, df = (HALF_SPAN * 2) / W;
    const vis = visibleSources(f0 - 0.05, f0 + HALF_SPAN * 2 + 0.05);
    for (let x = 0; x < W; x++) {
      const f = f0 + x * df;
      L[x] = f < 0 || f > FMAX ? 0 : 0.05 + Math.random() * Math.random() * 0.06 + levelAt(f, t, vis);
    }
    // --- trace: phosphor decay, fill under the curve, the curve with a glow ---
    const decay = Math.pow(0.5, (dt || 1 / 60) * 60);
    for (let i = 0; i < ph.length; i++) ph[i] *= decay;
    let prev = specY(L[0]);
    for (let x = 0; x < W; x++) {
      const y = specY(L[x]);
      const span = TH - y;
      for (let yy = y; yy < TH; yy++) ph[yy * W + x] += 0.16 * (1 - (yy - y) / (span + 1));
      const a = Math.min(prev, y), b = Math.max(prev, y);
      for (let yy = Math.max(0, a - 1); yy <= Math.min(TH - 1, b + 1); yy++) ph[yy * W + x] += yy < a || yy > b ? 0.28 : 0.8;
      prev = y;
    }
    // colourise + graticule (every 0.1 MHz, four rows)
    const gridX = new Uint8Array(W);
    for (let f = Math.ceil(f0 * 10) / 10; f < f0 + HALF_SPAN * 2; f += 0.1) { const x = Math.round((f - f0) / df); if (x >= 0 && x < W) gridX[x] = 1; }
    for (let y = 0; y < TH; y++) {
      const gy = y % Math.round(TH / 4) === 0, o = y * W;
      for (let x = 0; x < W; x++) {
        let v = ph[o + x];
        if (gy || gridX[x]) v += 0.1;
        px[o + x] = PH_PAL[v >= 1 ? 255 : (v * 255) | 0];
      }
    }
    // centre marker (tuned frequency), dashed amber
    const cx = W >> 1;
    for (let y = 0; y < TH; y++) if (((y >> 2) & 1) === 0) px[y * W + cx] = rt.scan ? C_LOCK : C_AMBER_DIM;
    // locked source bracket + tagged story carriers
    let lockAt = null;
    for (const q of vis) {
      const s = q.s;
      if (s.kind === 'ambient' || s.kind === 'murmur') continue;
      const x = Math.round((q.sf - f0) / df);
      if (x < 0 || x >= W) continue;
      const y = Math.max(2, specY(levelAt(q.sf, t, vis)) - 6);
      if (s.live) {
        const w = Math.max(10, Math.round((s.width / df) * 1.4));
        for (const bx of [x - w, x + w]) {
          if (bx < 0 || bx >= W) continue;
          for (let yy = y; yy < Math.min(TH, y + 9); yy++) px[yy * W + bx] = C_LOCK;
          for (let k = 0; k < 5; k++) { const hx = bx + (bx < x ? k : -k); if (hx >= 0 && hx < W) px[y * W + hx] = C_LOCK; }
        }
        lockAt = { x: x + w + 4, y: y + 4, right: x > W - 70, xl: x - w - 4 };
      } else if (s.kind === 'tx' && s.strength * (s.fb || 0) > 0.2) {
        for (let k = 0; k < 5; k++) for (let dx = -k; dx <= k; dx++) { const yy = y - 8 + k; if (yy >= 0 && x + dx >= 0 && x + dx < W) px[yy * W + x + dx] = abgr(182, 255, 198); }
      }
    }
    // axis strip: ticks every 0.05 MHz, centre pointer
    px.fill(C_AXIS, TH * W, SPEC_WF_Y * W);
    for (let f = Math.ceil(f0 * 20) / 20; f < f0 + HALF_SPAN * 2; f += 0.05) {
      const x = Math.round((f - f0) / df);
      if (x < 0 || x >= W) continue;
      const major = Math.abs(f * 4 - Math.round(f * 4)) < 1e-6;
      for (let yy = TH; yy < TH + (major ? 4 : 2); yy++) px[yy * W + x] = C_TICK;
    }
    for (let k = 0; k < 5; k++) for (let dx = -k; dx <= k; dx++) px[(TH + 1 + k) * W + cx + dx] = C_AMBER;
    // --- waterfall: registered to frequency, one new row at ~30 Hz ---
    wfApplyShift();
    spec.acc += dt;
    if (spec.acc >= 1 / 30) {
      spec.acc = 0;
      px.copyWithin((SPEC_WF_Y + 1) * W, SPEC_WF_Y * W, (SPEC_H - 1) * W);
      const o = SPEC_WF_Y * W;
      for (let x = 0; x < W; x++) px[o + x] = WF_PAL[(U.clamp((dbv(L[x]) - 0.24) / 0.72, 0, 1) * 255) | 0];
    }
    // below the bottom of the band (000.00): dead glass
    if (f0 < 0) {
      const xe = Math.min(W, Math.round(-f0 / df));
      for (let y = 0; y < SPEC_H; y++) px.fill(C_SHADE, y * W, y * W + xe);
    }
    spec.g.putImageData(spec.img, 0, 0);
    // centre line over the waterfall is drawn in CSS; labels are DOM
    specLabels(f0, df, lockAt);
  }
  /** Frequency labels under the trace and the LOCK tag, as crisp DOM text over the CRT. */
  function specLabels(f0, df, lockAt) {
    const box = ui.specLabels;
    if (!box) return;
    if (f0 == null) { setCls(box, 'radio-off-labels', true); return; }
    setCls(box, 'radio-off-labels', false);
    const first = Math.ceil(f0 * 4) / 4;
    let i = 0;
    for (let f = first; f <= f0 + HALF_SPAN * 2 + 1e-6 && i < spec.labels.length; f += 0.25) {
      const x = (f - f0) / df;
      if (x < 24 || x > SPEC_W - 24 || f < 0 || f > FMAX) continue;
      const e = spec.labels[i++];
      setText(e, f.toFixed(2));
      setStyle(e, 'left', ((x / SPEC_W) * 100).toFixed(2) + '%');
      setStyle(e, 'display', '');
    }
    for (; i < spec.labels.length; i++) setStyle(spec.labels[i], 'display', 'none');
    const lk = spec.lock;
    if (lockAt) {
      setStyle(lk, 'display', '');
      setStyle(lk, 'left', (((lockAt.right ? lockAt.xl : lockAt.x) / SPEC_W) * 100).toFixed(2) + '%');
      setStyle(lk, 'top', ((U.clamp(lockAt.y, 8, SPEC_TRACE_H - 8) / SPEC_H) * 100).toFixed(2) + '%');
      setCls(lk, 'radio-spec-lock-r', lockAt.right);
    } else setStyle(lk, 'display', 'none');
  }

  /* --- per-frame DOM refresh --------------------------------------------------------- */
  function bandOf(f) {
    if (f < 30) return f < 26.9 || f > 27.5 ? 'HF' : 'CB';
    if (f < 108) return 'VHF-L';
    if (f < 138) return 'AIR';
    if (f < 174) return 'VHF-H';
    return 'VHF';
  }
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  /** Live OFFSET of a transmission: offsetText, else offsetSec counted from reception, else stamp − now. */
  function txOffsetNow(T) {
    const tx = T.tx;
    if (tx.offsetText != null) return fmtT(T, tx.offsetText);
    if (tx.offsetSec != null) return U.fmtOffset(tx.offsetSec - (T.entry ? (DA.clock.min - T.entry.min) * 60 : 0));
    if (tx.stampNow) return U.fmtOffset(0);
    const o = T.originMin != null ? T.originMin : originOf(tx, DA.clock.min);
    if (o != null) return U.fmtOffset((o - DA.clock.min) * 60);
    if (tx.stampText != null) return '--:--:--';
    return U.fmtOffset(0);
  }
  function focusOffsetText() {
    const r = R();
    if (!r.offsetUnit) return { text: '--', mode: 'off' };
    if (r.offsetOverride) return { text: r.offsetOverride, mode: 'override' };
    if (rt.lcdBoot && r.power) return { text: rt.lcdBoot.text, mode: 'boot' };
    if (!r.power) return { text: '', mode: 'dead' };
    // an active room feed that is being heard (or forced) counts down
    const Fd = rt.feeds[rt.feeds.length - 1];
    if (Fd && (Fd.force || Fd.clar() > 0.3)) {
      // already happened: the unit holds the (negative) offset while the feed is heard
      if (Fd.offset < 0) return { text: U.fmtOffset(Fd.offset), mode: 'past', sub: 'ROOM' };
      const left = Math.max(0, Fd.offset - Fd.t);
      return { text: U.fmtOffset(left), mode: left <= 0 ? 'zero' : 'count', sub: 'ROOM' };
    }
    const b = rt.best;
    if (!b || rt.bestC < 0.2) return { text: '--:--:--', mode: 'idle' };
    if (b.kind === 'jam') return { text: U.fmtOffset((Math.random() - 0.4) * Math.pow(10, 1 + Math.random() * 7)), mode: 'jam' };
    if (b.kind === 'tx') return { text: txOffsetNow(b.T), mode: 'tx' };
    if (b.kind === 'breath') return { text: U.fmtOffset(0), mode: 'tx', sub: '' };
    return { text: U.fmtOffset(b.offsetSec || 0), mode: 'tx' };
  }
  function renderAll() { if (ui.root) { renderNotebook(); renderTapeLabel(); } }
  function renderDesk(dt) {
    if (!ui.root || ui.root.classList.contains('hidden')) return;
    const r = R(), t = now(), power = r.power;
    setCls(ui.root, 'radio-off', !power);
    setCls(ui.root, 'radio-jammed', r.jam > 0.05);
    const dark = !!(DA.world && DA.world.power && (() => { try { return DA.world.power('main') === false; } catch (e) { return false; } })());
    const ab = abandoned();
    setCls(ui.root, 'radio-mains-dead', dark && !ab);
    // 2049: the same desk, fifty years on — dust, yellowed paper, a cracked VFD, dead room lamps;
    // only the receiver is still (somehow) on (design decision 6)
    setCls(ui.root, 'radio-abandoned', ab);
    if (ab !== rt.abShown) { rt.abShown = ab; renderTapeLabel(); }

    // VFD
    let fs = fmtFreq(r.freq);
    if (r.jam > 0.3 && Math.random() < r.jam * 0.06) fs = fs.replace(/\d/g, (d) => (Math.random() < 0.3 ? String(Math.floor(Math.random() * 10)) : d));
    setText(ui.vfdFreq, power ? fs : '');
    setText(ui.vfdMode, r.freq >= 108 && r.freq < 137 ? 'AM' : 'NFM');
    setText(ui.vfdBand, bandOf(r.freq));
    setCls(ui.vfdScan, 'radio-on', !!rt.scan || (r.scanning && power));
    setCls(ui.vfdScan, 'radio-blink', !!rt.scan);
    const bars = ui.vfdBar.children, lit = power ? Math.round(U.clamp(meter.v, 0, 1) * bars.length) : 0;
    for (let i = 0; i < bars.length; i++) setCls(bars[i], 'radio-on', i < lit);

    // OFFSET LCD (a pending boot display waits until the operator is actually looking at it)
    if (rt.lcdBoot && power && r.offsetUnit) {
      if (!rt.lcdBoot.shown) {
        rt.lcdBoot.shown = true;
        ui.lcd.classList.remove('radio-lcd-boot');
        void ui.lcd.offsetWidth;
        ui.lcd.classList.add('radio-lcd-boot');
      }
      rt.lcdBoot.t -= dt;
      if (rt.lcdBoot.t <= 0) rt.lcdBoot = null;
    }
    const off = focusOffsetText();
    setCls(ui.lcd, 'radio-lcd-on', r.offsetUnit && power);
    setCls(ui.lcd, 'radio-lcd-count', off.mode === 'count');
    setCls(ui.lcd, 'radio-lcd-zero', off.mode === 'zero');
    setCls(ui.lcd, 'radio-lcd-neg', /^-/.test(off.text));
    setCls(ui.lcd, 'radio-lcd-past', off.mode === 'past');
    // an erratic unit (offsetOverride stepping through values) visibly jumps between readings
    if (off.mode === 'override' && rt.lcdPrev != null && off.text !== rt.lcdPrev) {
      ui.lcd.classList.remove('radio-lcd-jump');
      void ui.lcd.offsetWidth;
      ui.lcd.classList.add('radio-lcd-jump');
    }
    rt.lcdPrev = off.text;
    setText(ui.lcdText, off.text);
    setCls(ui.lcdText, 'radio-lcd-long', off.text.length > 10);
    setText(ui.lcdSub, off.sub || '');

    // lamps
    const blinkP = U.lerp(1.1, 0.14, U.clamp(rt.presence, 0, 1));
    setCls(ui.lampCarrier, 'radio-on', power && rt.presence > 0.12 && (rt.presence > 0.9 || (t % blinkP) < blinkP * 0.5));
    setCls(ui.lampLock, 'radio-on', power && (rt.liveLock || rt.lockFlash > 0 && (t * 10 | 0) % 2 === 0));
    rt.lockFlash = Math.max(0, rt.lockFlash - dt);
    let alert = false;
    for (const T of rt.active.values()) if (T.alert && (!T.locked || T.pending)) alert = true;
    if (!alert && anyPending() && !micPending()) alert = true;
    setCls(ui.lampAlert, 'radio-on', power && alert && (t % 0.5) < 0.28);
    // LOG button LED: green flash on success, red on nothing-to-log; steady amber when something unlogged
    rt.logFlash = rt.logFlash > 0 ? Math.max(0, rt.logFlash - dt) : Math.min(0, rt.logFlash + dt);
    const unlogged = r.log.some((e) => !e.logged);
    setCls(ui.logBtn, 'radio-ok', rt.logFlash > 0);
    setCls(ui.logBtn, 'radio-bad', rt.logFlash < 0);
    setCls(ui.logBtn, 'radio-pending', power && unlogged && rt.logFlash === 0);
    setCls(ui.power, 'radio-on', power);
    // switched off with a story transmission waiting on it: the rocker's standby neon pulses
    setCls(ui.power, 'radio-waiting', !power && suspendedIds().length > 0);

    // dial / knobs / rotator
    const ang = ((rt.dialAcc / 100) * DEG_PER_MHZ) % 360;
    setStyle(ui.dial, 'transform', 'rotate(' + ang.toFixed(1) + 'deg)');
    setStyle(ui.volKnob.knob, 'transform', 'rotate(' + (-135 + r.volume * 270).toFixed(0) + 'deg)');
    setStyle(ui.sqlKnob.knob, 'transform', 'rotate(' + (-135 + r.squelch * 270).toFixed(0) + 'deg)');
    setStyle(ui.needle, 'transform', 'rotate(' + r.bearing.toFixed(1) + 'deg)');
    setStyle(ui.rotKnob, 'transform', 'rotate(' + (rt.bearingTarget * 2).toFixed(0) + 'deg)');
    const bi = Math.round(r.bearing) % 360;
    setText(ui.brg, power ? U.pad(bi, 3) + '° ' + DIRS[Math.round(bi / 45) % 8] : '');
    setCls(ui.rotLamp, 'radio-on', !!rt.rotating);

    // tape deck
    const playing = !!rt.tapePlay;
    setCls(ui.cass, 'radio-playing', playing);
    setText(ui.counter, U.pad(Math.floor(r.tapeCounter), 3));
    const rec = power && (rt.mic.speaking > 0 || rt.mic.keyed);
    setCls(ui.recLamp, 'radio-on', rec);
    setCls(ui.micLamp, 'radio-on', rec || (rt.mic.open && power));
    setCls(ui.mic, 'radio-keyed', rt.mic.open);
    setCls(ui.keyPlay, 'radio-down', playing);
    setCls(ui.keyPlay, 'radio-key-locked', !playing && deckLocked());

    // clock: HH:MM with a blinking colon (design decision 2) — a wall clock, not a stopwatch, so
    // the night's fast game time never reads as racing seconds
    const cp = DA.clock.parts();
    setText(ui.clockHH, U.pad(cp.h));
    setText(ui.clockMM, U.pad(cp.m));
    setCls(ui.clockColon, 'radio-dim', (t % 1) >= 0.5);
    setText(ui.clockDate, DA.clock.date());

    // desk things
    rt.dutyT = (rt.dutyT || 0) - dt;
    if (rt.dutyT <= 0) { rt.dutyT = 0.5; renderDuty(); }
    setCls(ui.mug, 'hidden', !DA.flag('mug_on_desk'));
    setCls(ui.cctvPanel, 'hidden', !DA.flag('cctv_on'));
    renderStrip(dt);
    renderStripHead();
    renderFrags(dt);
    if (rt.mic.open) refreshMic();
  }

  /* ================================================================== the mode */
  const KEYS_TUNE = { ArrowLeft: -0.01, ArrowRight: 0.01, ArrowDown: -0.1, ArrowUp: 0.1, PageDown: -1, PageUp: 1 };
  const RADIO_MODE = {
    opaque: true,
    lock: false,
    enter() {
      R();
      ui.root.classList.remove('hidden', 'radio-covered');
      ui.root.classList.remove('radio-sitdown');
      void ui.root.offsetWidth;
      ui.root.classList.add('radio-sitdown');
      rt.bearingTarget = R().bearing;
      rt.dialAcc = R().freq * 100;
      rt.selfScan.idle = 0;
      renderAll();
      renderDuty();
      if (DA.ui && DA.ui.prompt) try { DA.ui.prompt(null); } catch (e) { /* ignore */ }
      sfx('chair_scrape', { vol: 0.35 });
      // The mug goes down beside the radio the first time you sit with it (PLAN §4 A2.1).
      if (DA.hasItem('mug') && !DA.flag('mug_on_desk')) {
        DA.setFlag('mug_on_desk', true);
        DA.takeItem('mug');
        sfx('mug_set', { vol: 0.7 });
        DA.bus.emit('mug:placed', {});
      }
      DA.bus.emit('radio:sit', {});
    },
    exit() {
      cancelControlDrag();
      closeMic();
      closeTapePicker();
      rt.dragging = false;
      ui.root.classList.add('hidden');
      for (const l of rt.strip) l.el.remove();
      rt.strip = [];
      if (rt.breath.caption) rt.breath.caption = null;
      clearFrags();
      DA.bus.emit('radio:stand', {});
    },
    cover(covered) {
      ui.root.classList.toggle('radio-covered', !!covered);
      if (covered) { cancelControlDrag(); closeMic(); closeTapePicker(); }
      // core calls cover(true) *before* the covering mode is on the stack (top() is still 'radio'),
      // so decide once it has been pushed: hide under opaque screens (CCTV…), stay visible (dimmed)
      // under translucent overlays (journal, doc, choice) instead of showing a stale 3D frame.
      const apply = () => {
        const top = DA.modes.top();
        const hide = !!covered && DA.modes.has('radio') && !!top && top.name !== 'radio' && !!(top.def && top.def.opaque);
        ui.root.classList.toggle('hidden', hide);
      };
      apply();
      if (covered) DA.bus.once('mode:enter', apply);
    },
    update(dt) {
      if (DA.paused) return;
      renderDesk(dt);
    },
    render() {
      if (!ui.root || ui.root.classList.contains('hidden')) return;
      const dt = Math.min(0.1, DA.dt || 1 / 60);
      drawMeter(dt || 1 / 60);
      drawSpectrum(dt || 1 / 60);
    },
    onKey(e, down) {
      const c = e.code;
      if (!down) {
        if (c === 'Space') {
          if (rt.mic.open && rt.mic.keyed) closeMic();
          return true;
        }
        return false;
      }
      if (c in KEYS_TUNE) { nudge(KEYS_TUNE[c]); return true; }
      if (c === 'KeyA' || c === 'KeyD') {
        rt.bearingTarget = Math.round((rt.bearingTarget + (c === 'KeyA' ? -5 : 5) + 360) % 360);
        touched();
        return true;
      }
      if (c === 'Space') { if (!e.repeat && !rt.mic.open) openMic(false); return true; }
      const dm = /^(Digit|Numpad)([1-9])$/.exec(c);
      if (dm) { if (rt.mic.open) sayItem(+dm[2] - 1); return true; }
      if (c === 'KeyL') { if (!e.repeat) log(); return true; }
      if (c === 'Escape' || c === 'Backspace' || c === 'KeyE') {
        if (e.repeat) return true;
        if (rt.mic.open) { closeMic(); return true; }
        if (ui.tapePick && !ui.tapePick.classList.contains('hidden')) { closeTapePicker(); return true; }
        stand();
        return true;
      }
      if (c === 'Tab') { openLogBook(); return true; }
      return false;
    },
  };

  /* ============================================================== public API */
  DA.radio = {
    get freq() { return R().freq; },
    get bearing() { return Math.round(R().bearing) % 360; },
    get power() { return !!R().power; },
    transmit, stop,
    isActive: (txId) => rt.active.has(txId),
    isLocked: (txId) => { const s = rt.active.get(txId); if (s) return !!s.src.live; const q = findSrc(txId); return !!(q && q.live); },
    clarityOf: (txId) => { const T = rt.active.get(txId); if (T) return T.src.c || 0; const s = findSrc(txId); return s ? s.c || 0 : 0; },
    best: () => (rt.best ? { id: rt.best.T ? rt.best.T.id : rt.best.id, kind: rt.best.kind, clarity: rt.bestC, freq: q2(rt.best.freq) } : null),
    addOutgoing, removeOutgoing, outgoingList: () => R().outgoing.slice(), outgoingHere, send,
    roomFeed, stopFeed, feedCountdown,
    autoScan, tune, setBearing, setPower, setOffsetUnit, offsetOverride, setVolume, setSquelch,
    setScanning: (on) => { R().scanning = !!on; rt.selfScan.idle = 0; },
    addEntry, editEntry, entries, find: (txId) => findEntry(String(txId)), log,
    addNote, insertTape, ejectTape, playTape, stopTape, playSelf, jam,
    atDesk, sit, stand, pick, pending,
    isBusy: (o) => rt.active.size > 0 || !!rt.tapePlay || rt.mic.speaking > 0 || !!(o && o.feeds && rt.feeds.length),
    tapePlaying: () => !!rt.tapePlay,
    deckLocked,
    quiet: (on) => (on === undefined ? !!R().quiet : setQuiet(on)),
    isHushed: () => hushed(),
    suspended: () => suspendedIds(),
    setMicNote, jolt,
    /** Debug / tests only: runtime internals (read-only use). */
    _rt: rt,
    _draw: { meter: (dt) => drawMeter(dt), spectrum: (dt) => drawSpectrum(dt), desk: (dt) => renderDesk(dt) },
  };

  /* =============================================================== lifecycle */
  DA.bus.on('boot', () => {
    buildDesk();
    DA.modes.register('radio', RADIO_MODE);
    DA.addSystem('radio', { order: 30, update });
    const hook = () => {
      if (DA.interact && DA.interact.on && !hook.done) {
        hook.done = true;
        DA.interact.on('radio', () => { sit(); return true; });
      }
    };
    hook();
    DA.bus.once('booted', hook);
  });
  DA.bus.on('runtime:reset', () => {
    resetRuntime();
    if (DA.audio && DA.audio.radioStatic) try { DA.audio.radioStatic(0, {}); } catch (e) { /* ignore */ }
  });
  DA.bus.on('input:blur', () => { cancelControlDrag(); if (rt.mic.open && rt.mic.keyed) closeMic(); rt.dragging = false; });
  DA.bus.on('game:new', () => { DA.state.radio = defaults(); rebuildFromState(); dutyReset(); });
  DA.bus.on('game:load', () => { rebuildFromState(); dutyReset(); });
  DA.bus.on('game:quit', () => { resetRuntime(); dutyReset(); });
  DA.bus.on('objective:set', onObjectiveSet);
  DA.bus.on('objective:done', (e) => { if (e && e.id != null) rt.dutyDone.set(e.id, now()); renderDuty(); });
  DA.bus.on('objective:remove', () => renderDuty());
  DA.bus.on('roomfeed:event', onFeedEvent);
  DA.bus.on('flag', (d) => {
    if (!d) return;
    if (d.key === 'offset_unit') setOffsetUnit(!!d.value);
  });
  DA.bus.on('lightning', () => {
    if (!ui.lightning || !atDesk()) return;
    ui.lightning.classList.remove('radio-on');
    void ui.lightning.offsetWidth;
    ui.lightning.classList.add('radio-on');
  });
  DA.bus.on('pause', () => { if (DA.audio && DA.audio.radioStatic) try { DA.audio.radioStatic(0, {}); } catch (e) { /* ignore */ } });
})();
