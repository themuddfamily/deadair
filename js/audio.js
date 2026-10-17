/* DEAD AIR — audio.js
 * DA.audio: every sound in the game, 100% synthesized at runtime with the Web Audio API
 * (noise buffers, oscillators, filters, envelopes, a few JS-rendered grain buffers and
 * generated reverb impulses). No samples, no network. Contract: PLAN.md §6.3, names §7.6.
 *
 * VOICES (voice(); subtitles carry the words, the voice carries a person)
 *   Three styles — DA.settings.voiceStyle, the settings screen's VOICES row; the legacy
 *   DA.settings.tts === true still means 'system'; voice opts.style overrides per call:
 *   'natural' (default) daNaturalVoice(): a Klatt-style source–filter talker (LF glottal pulses
 *            with jitter/shimmer/flutter, aspiration, creak and breaths; cascade F1–F9 with a
 *            nasal pole/zero; frication and bursts; rough English phonemes with Klatt duration
 *            rules and Fujisaki pitch — declination, pitch accents, boundary tones) heard through
 *            a model of its 1999 device: two-way VHF (dispatch, callers, your future selves), CB
 *            (truckers), NOAA weather radio, the car radio (speaker 'dj', or any radio voice while
 *            a drive scene's car radio is on: AM/FM broadcast chain, late-night music bed, AM static
 *            and lightning crashes, door speaker), telephone, cassette, or the room (in person).
 *            Babble — it says no real words — but it talks like a person. Every "you_*" id and
 *            'phone' share one vocal tract, so the future selves are one man. 'weather' stays a
 *            tasteful 1999 machine voice; 'keep_open' (synthetic + rasp) is deliberately wrong.
 *            Rendered in a Blob worker on realtime contexts (voice() costs < 1 ms on the main
 *            thread); synchronously on an OfflineAudioContext, with opts.sync, or without a worker.
 *   'classic' the original formant babble (planSpeech + synthSpeech + the node radio/phone/tape
 *            chains), unchanged.
 *   'system' speechSynthesis reads the real words (the most natural installed voice per gender:
 *            Natural/Neural/Online/Google/Premium/Enhanced names first; one stable voice per
 *            speaker; modest pitch/rate mapping); Web Audio plays only a quiet channel bed
 *            (static + squelch for radio, line hiss for phone, tape hiss). Without any installed
 *            voice it falls back to 'natural'.
 *
 * SIGNAL FLOW
 *   sources → per-sound chain (vol → [radio|phone|tape colouring] → [muffle] → distance LP →
 *   distance gain → pan) → bus → … and a send → room reverb (generated impulse responses in
 *   A/B crossfaded convolvers; the array adds a feedback-comb tail for its huge, long decay)
 *   buses: ambience, sfx (both through the duck stage), radio, voice, stingers
 *   → master (settings.volume) → silence gate → gentle compressor → limiter → soft safety
 *   clip → destination
 *   natural voices: the device (radio, phone, tape, room) is rendered into the line itself, so
 *   their chain is rendered line → clarity level (+ live drop-out gate) → vol → LP → pan → bus
 *
 * PUBLIC API (PLAN §6.3)
 *   init()                          create the AudioContext (call from a user gesture; idempotent)
 *   setVolume(v)                    master volume 0..1 (also follows the 'settings' event)
 *   play(name, opts) → handle       one-shot; opts {vol, x, y, map, pan, rate, delay, radio,
 *                                   phone, surface, …}; handle {stop(fade), setVol, setPos, dur}
 *   loop(name, opts) → handle       {stop(fade), setVol(v), setPos(x, y, map), set(params)}
 *   listener(x, y, angle, mapId)    world calls it every frame
 *   ambience(params)                merge {rain, indoor, hum, generator, genDist, wind, thunder,
 *                                   drone, birds, daylight, heartbeat, room}. genDist is read as
 *                                   PROXIMITY 0..1 to the generator (1 = beside it, ~0.15 upstairs
 *                                   through the floor, 0 = inaudible) — the convention world.js uses
 *   radioStatic(level, {tone, vol}) desk receiver hiss (continuous; 0 = silent)
 *   voice(text, speakerId, opts) → {dur, stop()}   a voice (see VOICES); dur === DA.util.lineDur(text)
 *   breath(x)                       player breathing: x 0..1 = exertion (sets level and rate
 *                                   together: calm and silent at 0, gasping at 1); x > 1 = a rate
 *   playerBreath()                  current breath-cycle phase 0..1 (alias of breathPhase)
 *   duck(amount, secs), silence(secs), stinger(kind)
 *
 * ADDITIONS (backwards-compatible; documented here per PLAN §0)
 *   ready, ctx                      true / the AudioContext once init() succeeded
 *   autoInit                        (default true) init on the first pointer/key gesture anywhere
 *   setPlayerBreath({level, rate})  level 0..1 loudness, rate in Hz (≤3) or breaths/min (>3);
 *                                   also accepts the positional form setPlayerBreath(rate, level)
 *   sfxBus / master / out           raw GainNodes (null before init) for modules that build
 *                                   their own Web Audio graphs; has(name) checks aliases too
 *   breathPhase()                   0..1 phase of the current player breath (0 = start of inhale,
 *                                   inhale ≈ 0..0.4, exhale ≈ 0.4..0.85); breathState() → details
 *   unsilence(fade)                 end a silence() early; silence(secs, {fade}) restore fade
 *   stopAll(fade)                   stop every one-shot, loop and voice (ambience untouched)
 *   ambience() with no argument     returns a copy of the current ambience params
 *   resetAmbience(over?) → params   every ambience param back to its default (silent neutral bed,
 *                                   room 'small'), then `over` merged — the title calls it on
 *                                   quit-to-title (world.js resets on 'game:quit' as well)
 *   SFX 'scream_distant' / 'shout_distant' (new)   the natural engine's cry (o.speaker, default
 *                                   'you'; shout = short chest-voiced cry); variants
 *                                   prefetched in the voice worker ~6 s after init; 'classic'
 *                                   voice style keeps the old formant scream. renderNatural's
 *                                   engine also exposes scream(vp, {seed, dur, shout, sr}) (dry)
 *   natural pacing                  a line with time to spare never gabbles: its syllable rate is
 *                                   capped at ~5.2/s (up to ~5.8/s agitated) as far as its lineDur
 *                                   budget allows (short lines like "Anybody?" were 7 syl/s)
 *   old voices (age > 58)           breath noise reduced, pulsed with the glottal cycle and rolled
 *                                   off above ~1.5 kHz; top end 10 dB duller — breathy, not hissy
 *   ambience extra params           settle 0..1 (occasional building creaks/pipe ticks indoors,
 *                                   default 0.35), window 0..1 (rain-on-glass level indoors)
 *   radioStatic opts                tone: Hz (>20) or 0..1 whistle amount; vol; muffle 0..1
 *   voice opts                      radio, clarity, phone, tape (cassette colouring), vol, x, y,
 *                                   map, pan, delay, squelch (key-up click + squelch tail),
 *                                   voice {pitch, rate, …} per-call override; natural style also:
 *                                   style ('natural'|'classic'|'system'), carRadio (car radio
 *                                   even outside a drive scene), band ('AM'|'FM'), channel
 *                                   ('vhf'|'cb'|'noaa'|'broadcast'|'phone'|'tape'|'room'),
 *                                   bed:false (no music under the DJ), seed, sync.
 *                                   handle: {dur, stop(fade), setClarity(c), setVol(v), set(p),
 *                                   ended, playing, speaker, style}. The speech lies inside
 *                                   [t0, t0 + dur]; a squelch tail / the car radio's music may
 *                                   ring on up to 0.75 s after it.
 *   play/loop opts                  muffle 0..1 (through walls), send (reverb amount), bus,
 *                                   tape, count (knocks), dur (length for sustained sounds),
 *                                   dist 0..1 (thunder distance), bpm (heartbeat), speed (car),
 *                                   run/crouch/weight (footsteps), interval (loop spacing),
 *                                   text (whisper), mirror (breath_other loop phase-locks to the
 *                                   player's breathing; default true for loop('breath_other'))
 *   handle.set(params)              live params for continuous loops (car_drive {speed},
 *                                   car_idle {rev}, heartbeat {bpm}, radio sounds {clarity})
 *   extra sound names               cough door_handle rain_car wipers keys rustle running
 *                                   generator (positional running-generator loop) + fuzzy
 *                                   aliases (anything containing 'door', 'step', 'knock', …)
 *   names()                         every synthesizable name
 *   renderSound(name, opts, secs)   → Promise<{buffer, peak, rms, activeRms, firstSound, lastSound,
 *                                   dur}> — one builder rendered raw on an OfflineAudioContext
 *   renderEngine(secs, setup, cfg)  full engine on an OfflineAudioContext (setup(E) schedules;
 *                                   cfg.bare skips the compressor) → stats + renderSec
 *   renderVoice(text, speakerId, opts) / renderAmbience(params, secs)   (tests & dev harness)
 *   voicePlan(text, speakerId, over?, style?) / voiceParams(speakerId)   what voice() will do
 *                                   (dev harness; plan in the classic shape for both engines)
 *   voiceStyle(), voiceStyles       current style / ['natural', 'classic', 'system']
 *   renderNatural(text, speakerId, opts) → {sr, sig, bed, bedGain, channel, band, lead, end, ms}
 *                                   the natural engine without Web Audio (tests, dev/voices.html)
 *   systemVoices(), systemVoiceFor(speakerId)   the speechSynthesis voices as ranked / chosen
 *   systemVoicesAvailable() → bool  the 'system' style can speak (speechSynthesis + ≥ 1 English
 *                                   voice); false → it plays 'natural'. Event 'audio:voices'
 *                                   {available, count} when the browser's voice list changes
 *   createEngine(ctx, cfg)          build a full engine on any BaseAudioContext (tests)
 *   bufStats(buffer), PLAN_NAMES    helpers for tests
 *   event 'audio:ready'             emitted once the AudioContext exists
 *   automatic breathing             if nobody calls breath()/setPlayerBreath() for 5 s, the
 *                                   player's breath rate/level follow DA.world.player (running,
 *                                   walking noise, hidden), so 000.00 mirrors real exertion
 *
 * Robustness: every call is a no-op before init() (ambience/listener/breath/static settings are
 * remembered and applied on init); nothing ever throws; one-shots, loops and voices are capped;
 * finished nodes are disconnected; 'pause'/'resume' suspend/resume the context; 'runtime:reset'
 * (death, load, new game) stops loops and voices but keeps the ambience bed.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});

  /* ============================================================ small utils */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const EPS = 0.0001;
  const warned = new Set();
  function warnOnce(key, e) {
    if (warned.has(key)) return;
    warned.add(key);
    try { console.warn('[audio] ' + key, e || ''); } catch (_) { /* ignore */ }
  }
  /** Same formula as DA.util.lineDur (core.js) — used only if core is missing. */
  function lineDur(text) {
    if (DA.util && DA.util.lineDur) return DA.util.lineDur(text);
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1.4, 0.6 + words * 0.32);
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================================================== per-context "kit" ==
   * Everything that depends on a (Base)AudioContext lives in a kit: noise buffers, periodic
   * waves, shaper curves, JS-rendered grain buffers. Builders take a kit, so every sound can be
   * rendered on a realtime AudioContext or an OfflineAudioContext alike.
   * While a sound is being built, every node created through the helpers is collected into
   * k.bag so its handle can stop and disconnect it later.
   */
  const KITS = new WeakMap();
  function kit(ctx) {
    let k = KITS.get(ctx);
    if (!k) {
      k = { ctx, sr: ctx.sampleRate, bag: null, bufs: {}, waves: {}, curves: {}, grains: {} };
      KITS.set(ctx, k);
    }
    return k;
  }
  const track = (k, n) => { if (k.bag) k.bag.push(n); return n; };

  /* ---------------------------------------------------------- noise buffers */
  /** Make a loop-seamless stereo buffer: render len+fade seconds, crossfade the tail into the head. */
  function loopBuffer(k, secs, chans, gen, arg) {
    const sr = k.sr;
    const n = Math.floor(secs * sr), f = Math.floor(0.25 * sr);
    const b = k.ctx.createBuffer(chans, n, sr);
    for (let c = 0; c < chans; c++) {
      const tmp = new Float32Array(n + f);
      gen(tmp, sr, c, arg);
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = tmp[i];
      for (let i = 0; i < f; i++) {
        const w = i / f;
        d[i] = tmp[i] * w + tmp[n + i] * (1 - w);
      }
      // RMS-normalise so colours are interchangeable at the same gain
      let s = 0;
      for (let i = 0; i < n; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / n) || 1;
      const target = gen.rms || 0.3;
      for (let i = 0; i < n; i++) {
        // RMS-normalise, then soft-limit rare peaks above 0.8 so no buffer exceeds ±1
        let v = d[i] * (target / rms);
        const a = Math.abs(v);
        if (a > 0.8) v = Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
        d[i] = v;
      }
    }
    return b;
  }
  const GEN = {
    white(d) { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; },
    pink(d) {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
    },
    brown(d) {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last;
      }
      // remove DC drift
      let m = 0; for (let i = 0; i < d.length; i++) m += d[i]; m /= d.length;
      for (let i = 0; i < d.length; i++) d[i] -= m;
    },
    /** Sparse droplets/crackle: mostly tiny ticks, a few big pops. */
    crackle(d, sr) {
      d.fill(0);
      const put = (rate, ampPow, decMin, decMax, lp) => {
        let t = 0;
        while (true) {
          t += -Math.log(1 - Math.random()) / rate;
          const i0 = Math.floor(t * sr);
          if (i0 >= d.length) break;
          const a = Math.pow(Math.random(), ampPow) * (Math.random() < 0.5 ? -1 : 1);
          const dec = rnd(decMin, decMax) * sr;
          let y = 0;
          const n = Math.min(d.length - i0, Math.floor(dec * 5));
          for (let j = 0; j < n; j++) {
            y += lp * ((Math.random() * 2 - 1) - y);
            d[i0 + j] += a * y * Math.exp(-j / dec) * (j === 0 ? 2 : 1);
          }
        }
      };
      put(90, 3, 0.0002, 0.0012, 0.9);   // fine ticks
      put(14, 2, 0.0008, 0.003, 0.55);   // drops
      put(2.2, 1.2, 0.002, 0.006, 0.25); // pops
    },
    /** Smooth random control signal, ±1-ish, bandwidth `bw` Hz (rendered at the context rate). */
    ctrl(d, sr, c, bw) {
      let y1 = 0, y2 = 0;
      const a = 1 - Math.exp((-2 * Math.PI * (bw || 6)) / sr);
      for (let i = 0; i < d.length; i++) {
        y1 += a * ((Math.random() * 2 - 1) - y1);
        y2 += a * (y1 - y2);
        d[i] = y2;
      }
    },
  };
  GEN.crackle.rms = 0.08;
  GEN.ctrl.rms = 0.33;
  /**
   * Noise buffers are mono for one-shots (cheaper downstream filtering); the *2 variants are
   * stereo for wide ambience beds. Control signals come in bandwidth classes so they always
   * play at playbackRate 1 (resampling a buffer costs ~30× more than a plain loop).
   */
  const BUF_SPEC = {
    white: [3, 1, 'white'], pink: [4, 1, 'pink'], brown: [4, 1, 'brown'], crackle: [5, 1, 'crackle'],
    white2: [3, 2, 'white'], pink2: [4, 2, 'pink'], brown2: [4, 2, 'brown'], crackle2: [5, 2, 'crackle'],
    ctrl3: [8, 1, 'ctrl', 3], ctrl8: [8, 1, 'ctrl', 8], ctrl20: [4, 1, 'ctrl', 20], ctrl60: [3, 1, 'ctrl', 60], ctrl150: [2, 1, 'ctrl', 150],
  };
  const CTRL_BW = [3, 8, 20, 60, 150];
  function buf(k, name) {
    let b = k.bufs[name];
    if (b) return b;
    if (name === 'fireD' || name === 'fireG') b = fireBuffer(k, name === 'fireD');
    else {
      const s = BUF_SPEC[name] || BUF_SPEC.white;
      b = loopBuffer(k, s[0], s[1], GEN[s[2]], s[3]);
    }
    k.bufs[name] = b;
    return b;
  }
  /**
   * Engine firing modulator: 8 combustion pulses per loop at a nominal 30 Hz firing rate
   * (playbackRate = fire/30). Unequal amplitudes and tiny timing jitter give the rough
   * "rrrrr" of a real engine instead of a clean buzz. Values 0..1.
   */
  function fireBuffer(k, diesel) {
    const sr = k.sr, per = 1 / 30, n = Math.round(8 * per * sr);
    const b = k.ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const tau = (diesel ? 0.0045 : 0.007) * sr;
    const amps = [1, 0.82, 0.93, 0.76, 0.97, 0.85, 0.9, 0.72];
    for (let p = 0; p < 8; p++) {
      const start = Math.round((p + (p % 2 ? 0.035 : -0.02)) * per * sr + sr * 0.001);
      for (let j = 0; j < n; j++) {
        const i = (start + j) % n;
        const att = Math.min(1, j / (0.0007 * sr));
        const v = amps[p] * att * Math.exp(-j / tau);
        if (v < 1e-4 && j > tau) break;
        d[i] = Math.max(d[i], v);
      }
    }
    return b;
  }

  /* ---------------------------------------------------------- periodic waves */
  /** Fourier series of an arbitrary periodic function fn(phase 0..1) → PeriodicWave. */
  function waveFrom(k, fn, harmonics) {
    const N = 4096, H = harmonics || 64;
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) x[i] = fn(i / N);
    const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let h = 1; h <= H; h++) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) {
        const w = (2 * Math.PI * h * i) / N;
        a += x[i] * Math.cos(w);
        b += x[i] * Math.sin(w);
      }
      re[h] = (2 * a) / N;
      im[h] = (2 * b) / N;
    }
    return k.ctx.createPeriodicWave(re, im);
  }
  function waveHarm(k, amps) {
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => { im[i + 1] = a; });
    return k.ctx.createPeriodicWave(re, im);
  }
  /** Rosenberg glottal pulse (flow derivative): open phase op, closing phase cl (fractions). */
  function glottal(op, cl) {
    return (p) => {
      if (p < op) return (Math.PI / op) * Math.sin((Math.PI * p) / op) * 0.5;
      if (p < op + cl) return -(Math.PI / (2 * cl)) * Math.sin((Math.PI * (p - op)) / (2 * cl));
      return 0;
    };
  }
  const WAVES = {
    glottal: (k) => waveFrom(k, glottal(0.42, 0.14), 90),
    glottalSoft: (k) => waveFrom(k, glottal(0.5, 0.3), 60),
    pulse: (k) => waveFrom(k, (p) => (p < 0.06 ? 1 : 0), 64),
    engine: (k) => waveFrom(k, (p) => Math.exp(-p * 7) - 0.14, 40),
    hum: (k) => waveHarm(k, [0.22, 1, 0.3, 0.42, 0.08, 0.2, 0.03, 0.09, 0.02, 0.05]),
    horn: (k) => waveFrom(k, (p) => (p < 0.32 ? 1 : -0.47), 48),
  };
  function wave(k, name) {
    return k.waves[name] || (k.waves[name] = WAVES[name](k));
  }

  /* ---------------------------------------------------------- shaper curves */
  const CURVES = {
    soft: (x) => Math.tanh(1.6 * x) / Math.tanh(1.6),
    hard: (x) => clamp(x * 2.2, -0.9, 0.9),
    carbon: (x) => Math.tanh(2.2 * x + 0.25 * x * x) / Math.tanh(2.2),
    tape: (x) => Math.tanh(1.15 * x) / Math.tanh(1.15),
    /** radio drop-out gate: open below 0.2, closed above 0.34 (input range −1..1) */
    gate: (x) => (x < 0.2 ? 1 : x > 0.34 ? 0.02 : 1 - ((x - 0.2) / 0.14) * 0.98),
    crush: (x) => Math.round(x * 6) / 6,
    /** output safety: transparent below 0.85, soft ceiling at 0.98 (catches limiter overshoot) */
    safety: (x) => { const a = Math.abs(x); return a < 0.85 ? x : Math.sign(x) * (0.85 + 0.13 * Math.tanh((a - 0.85) / 0.13)); },
  };
  function curve(k, name) {
    if (k.curves[name]) return k.curves[name];
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = CURVES[name]((i / (n - 1)) * 2 - 1);
    return (k.curves[name] = c);
  }

  /* ---------------------------------------------------------- node helpers */
  function gain(k, v) {
    const g = k.ctx.createGain();
    g.gain.value = v == null ? 1 : v;
    return track(k, g);
  }
  function filt(k, type, f, q, g) {
    const b = k.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (g != null) b.gain.value = g;
    return track(k, b);
  }
  function osc(k, type, f, t, dur) {
    const o = k.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = clamp(f, -k.sr * 0.45, k.sr * 0.45); // stay under Nyquist even at extreme rates
    t = Math.max(0, t);
    o.start(t);
    if (dur != null) o.stop(t + Math.max(0.001, dur));
    return track(k, o);
  }
  /** Looping noise source from a random offset (decorrelates simultaneous instances). */
  function noise(k, name, t, dur, rate) {
    const s = k.ctx.createBufferSource();
    s.buffer = buf(k, name);
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    t = Math.max(0, t);
    s.start(t, Math.random() * s.buffer.duration * 0.95);
    if (dur != null) s.stop(t + Math.max(0.001, dur));
    return track(k, s);
  }
  /**
   * Smooth random modulation source (±1-ish) with bandwidth ≈ 6×rate Hz. Slow drifts use three
   * incommensurate sine LFOs; faster ones a pre-rendered noise class at rate 1.
   */
  function ctrl(k, t, dur, rate) {
    const bw = 6 * (rate || 1);
    if (bw < 1.5) {
      const sum = gain(k, 1);
      const fr = [0.37, 0.61, 1], am = [0.36, 0.27, 0.2];
      for (let i = 0; i < 3; i++) chain(osc(k, 'sine', bw * fr[i] * rnd(0.8, 1.25), t, dur), gain(k, am[i] * (Math.random() < 0.5 ? -1 : 1)), sum);
      return sum;
    }
    let best = CTRL_BW[0];
    for (const b of CTRL_BW) if (Math.abs(Math.log(b / bw)) < Math.abs(Math.log(best / bw))) best = b;
    return noise(k, 'ctrl' + best, t, dur);
  }
  function bufSrc(k, b, t, rate, loop, dur) {
    const s = k.ctx.createBufferSource();
    s.buffer = b;
    s.loop = !!loop;
    if (rate) s.playbackRate.value = rate;
    t = Math.max(0, t);
    s.start(t);
    if (dur != null) s.stop(t + Math.max(0.001, dur));
    return track(k, s);
  }
  function konst(k, v, t, dur) {
    const c = k.ctx.createConstantSource();
    c.offset.value = v;
    t = Math.max(0, t);
    c.start(t);
    if (dur != null) c.stop(t + Math.max(0.001, dur));
    return track(k, c);
  }
  function shaper(k, name, over) {
    const w = k.ctx.createWaveShaper();
    w.curve = curve(k, name);
    if (over) w.oversample = over;
    return track(k, w);
  }
  function panner(k, p) {
    const s = k.ctx.createStereoPanner();
    s.pan.value = clamp(p || 0, -1, 1);
    return track(k, s);
  }
  function delayN(k, secs, max) {
    const d = k.ctx.createDelay(max || Math.max(1, secs * 2));
    d.delayTime.value = secs;
    return track(k, d);
  }
  /** Connect a → b → c …; returns the last node. */
  function chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  /* ---------------------------------------------------------- envelopes */
  /** Percussive: 0 → peak in `a` s, exponential decay reaching −60 dB after t60 s. */
  function perc(p, t, peak, a, t60, base) {
    base = base || 0;
    t = Math.max(0, t);
    p.setValueAtTime(base, t);
    p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
    p.setTargetAtTime(base, t + Math.max(0.0005, a), Math.max(0.001, t60 / 6.9));
  }
  /** Piecewise-linear envelope: pts = [[dt, value], …] relative to t (first point is a set). */
  function env(p, t, pts) {
    p.setValueAtTime(pts[0][1], Math.max(0, t + pts[0][0]));
    for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1], Math.max(0, t + pts[i][0]));
  }
  /** Exponential glide (values must be > 0). */
  function glide(p, t, from, to, dur) {
    t = Math.max(0, t);
    if (p.maxValue < 1e6) { from = Math.min(from, p.maxValue); to = Math.min(to, p.maxValue); }
    p.setValueAtTime(Math.max(EPS, from), t);
    p.exponentialRampToValueAtTime(Math.max(EPS, to), t + Math.max(0.001, dur));
  }
  /** Smoothly move an AudioParam to v from now (safe to call every frame). */
  function approach(p, v, now, tc) {
    if (!isFinite(v)) return;
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
      else { const cur = p.value; p.cancelScheduledValues(now); p.setValueAtTime(cur, now); }
      p.setTargetAtTime(v, now, Math.max(0.005, tc));
    } catch (e) { p.value = v; }
  }
  /** Freeze an AudioParam at its current value at `now`, dropping later automation. */
  function hold(p, now) {
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
      else { const cur = p.value; p.cancelScheduledValues(now); p.setValueAtTime(cur, now); }
    } catch (e) { /* ignore */ }
  }
  /** Linear ramp from the current value to v over dur seconds (cancels later automation). */
  function rampTo(p, v, now, dur) {
    hold(p, now);
    try { p.linearRampToValueAtTime(v, now + Math.max(0.005, dur)); } catch (e) { p.value = v; }
  }
  /** Fade an AudioParam to 0 over `fade` seconds starting now. */
  function fadeOut(p, now, fade) {
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
      else { const cur = p.value; p.cancelScheduledValues(now); p.setValueAtTime(cur, now); }
      p.linearRampToValueAtTime(0, now + Math.max(0.005, fade));
    } catch (e) { p.value = 0; }
  }

  /* ---------------------------------------------------------- grain buffers
   * A few textures are far better (and cheaper) rendered sample-by-sample in JS than wired
   * from hundreds of nodes: glass shards, gravel, paper, leaves, debris, the telephone bell.
   * Each key keeps up to `variants` renders per context and picks one at random.
   */
  function grain(k, key, variants, secs, render) {
    const list = k.grains[key] || (k.grains[key] = []);
    if (list.length >= variants) return pick(list);
    const n = Math.max(1, Math.ceil(secs * k.sr));
    const b = k.ctx.createBuffer(2, n, k.sr);
    const L = b.getChannelData(0), R = b.getChannelData(1);
    render(L, R, k.sr);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    if (peak > 0) { const s = 0.85 / peak; for (let i = 0; i < n; i++) { L[i] *= s; R[i] *= s; } }
    list.push(b);
    return b;
  }
  const G = {
    /** decaying sine (mode) */
    mode(L, R, sr, t, f, t60, amp, pan, ph) {
      const i0 = Math.floor(t * sr), n = Math.min(L.length - i0, Math.floor(t60 * sr));
      if (n <= 0) return;
      const w = (2 * Math.PI * f) / sr, dec = Math.exp(-6.9 / (t60 * sr));
      const gl = Math.sqrt(0.5 * (1 - (pan || 0))), gr = Math.sqrt(0.5 * (1 + (pan || 0)));
      let a = amp, p = ph || 0;
      for (let j = 0; j < n; j++) {
        const att = j < 24 ? j / 24 : 1;
        const v = a * att * Math.sin(p);
        L[i0 + j] += v * gl; R[i0 + j] += v * gr;
        p += w; a *= dec;
      }
    },
    /** one-pole coloured noise burst: lp 0..1 (1 = white), exponential decay */
    burst(L, R, sr, t, dur, amp, t60, lp, pan, hp) {
      const i0 = Math.floor(t * sr), n = Math.min(L.length - i0, Math.floor(dur * sr));
      if (n <= 0 || i0 < 0) return;
      const dec = Math.exp(-6.9 / (t60 * sr));
      const gl = Math.sqrt(0.5 * (1 - (pan || 0))), gr = Math.sqrt(0.5 * (1 + (pan || 0)));
      let a = amp, y = 0, prev = 0;
      for (let j = 0; j < n; j++) {
        y += lp * ((Math.random() * 2 - 1) - y);
        let v = y;
        if (hp) { v = y - prev; prev = y; v *= 2; }
        const att = j < 8 ? j / 8 : 1;
        L[i0 + j] += v * a * att * gl; R[i0 + j] += v * a * att * gr;
        a *= dec;
      }
    },
    /** 2-pole resonator bank driven by an excitation array (for bells). */
    resonate(x, sr, modes) {
      const y = new Float32Array(x.length);
      for (const [f, t60, g] of modes) {
        const r = Math.exp(-6.9 / (t60 * sr)), w = (2 * Math.PI * f) / sr;
        const c1 = 2 * r * Math.cos(w), c2 = -r * r;
        let y1 = 0, y2 = 0;
        for (let i = 0; i < x.length; i++) {
          const v = c1 * y1 + c2 * y2 + x[i];
          y2 = y1; y1 = v;
          y[i] += v * g * (1 - r);
        }
      }
      return y;
    },
  };

  /* ---------------------------------------------------------- reverb impulses */
  const ROOMS = {
    small: { decay: 0.55, pre: 0.004, lp0: 9000, lp1: 2600, wet: 0.2, er: [[0.007, 0.5], [0.013, 0.35], [0.021, 0.25]] },
    hall: { decay: 1.3, pre: 0.012, lp0: 8000, lp1: 1800, wet: 0.26, er: [[0.011, 0.45], [0.023, 0.4], [0.041, 0.3], [0.062, 0.22]] },
    basement: { decay: 1.9, pre: 0.016, lp0: 6000, lp1: 900, wet: 0.34, er: [[0.014, 0.5], [0.029, 0.42], [0.047, 0.3]] },
    // the array: a dense 2.6 s impulse plus a feedback-comb tail (≈6 s) with long discrete echoes
    array: { decay: 2.6, pre: 0.06, lp0: 4200, lp1: 450, wet: 0.55, er: [[0.08, 0.3], [0.19, 0.25]], echoes: [[0.43, 0.32], [0.97, 0.22], [1.71, 0.14]], tail: 6.5 },
    outside: { decay: 0.95, pre: 0.025, lp0: 4800, lp1: 1400, wet: 0.13, er: [[0.035, 0.3], [0.07, 0.22], [0.12, 0.16], [0.19, 0.1]], sparse: true },
    bathroom: { decay: 1.1, pre: 0.003, lp0: 12000, lp1: 5200, wet: 0.36, er: [[0.004, 0.6], [0.009, 0.5], [0.015, 0.4], [0.022, 0.3]] },
  };
  function impulse(k, room) {
    const key = 'ir_' + room;
    if (k.bufs[key]) return k.bufs[key];
    const p = ROOMS[room] || ROOMS.small, sr = k.sr;
    const len = Math.floor((p.pre + p.decay * 1.05) * sr);
    const b = k.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const pre = Math.floor(p.pre * sr);
      let y = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const fc = p.lp0 * Math.pow(p.lp1 / p.lp0, Math.min(1, t / p.decay));
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        let x = (Math.random() * 2 - 1) * Math.exp((-6.9 * t) / p.decay);
        if (p.sparse) x *= Math.random() < 0.3 ? 2.2 : 0.35; // forest: grainy, not dense
        y += a * (x - y);
        d[i] = y;
      }
      const ers = (p.er || []).concat(p.echoes || []);
      for (const [et, ea] of ers) {
        const i = Math.floor((et * (c ? 1.07 : 0.94)) * sr);
        if (i < len) {
          for (let j = 0; j < 40 && i + j < len; j++) d[i + j] += ea * (Math.random() * 2 - 1) * Math.exp(-j / 8);
        }
      }
    }
    return (k.bufs[key] = b);
  }

  /* =================================================================== VOICE
   * Formant "babble": a glottal pulse (Rosenberg wave, jitter, shimmer, tremor, optional
   * sub-harmonic rasp) and aspiration noise run through three parallel formant band-passes
   * that glide between vowel targets; a separate noise channel makes fricatives and plosive
   * bursts. Syllables, stress and phrasing come from the actual subtitle text, so the rhythm
   * of the babble follows the words on screen. The whole utterance fits exactly inside
   * DA.util.lineDur(text) (callers time subtitles by it).
   */
  const VOW = {
    a: [730, 1090, 2440], ae: [660, 1720, 2410], e: [530, 1840, 2480], i: [400, 1920, 2560],
    ii: [290, 2230, 2950], o: [570, 850, 2410], oo: [320, 900, 2250], u: [620, 1190, 2390],
    er: [480, 1330, 1680], sch: [500, 1480, 2480], aw: [610, 900, 2500],
  };
  const CONS = {
    s: { k: 'fric', f: 6300, q: 2.4, a: 0.32, d: 0.085, v: 0 },
    z: { k: 'fric', f: 6000, q: 2.2, a: 0.2, d: 0.075, v: 0.45 },
    sh: { k: 'fric', f: 3100, q: 1.9, a: 0.3, d: 0.095, v: 0 },
    zh: { k: 'fric', f: 3000, q: 1.9, a: 0.18, d: 0.08, v: 0.45 },
    f: { k: 'fric', f: 5200, q: 0.6, a: 0.1, d: 0.08, v: 0 },
    v: { k: 'fric', f: 4500, q: 0.6, a: 0.06, d: 0.06, v: 0.55 },
    th: { k: 'fric', f: 5800, q: 0.5, a: 0.08, d: 0.065, v: 0.25 },
    h: { k: 'asp', a: 0.5, d: 0.06, v: 0 },
    p: { k: 'stop', f: 900, q: 0.9, a: 0.34, d: 0.07, v: 0 },
    b: { k: 'stop', f: 700, q: 0.9, a: 0.2, d: 0.06, v: 0.35 },
    t: { k: 'stop', f: 4300, q: 1.1, a: 0.3, d: 0.065, v: 0 },
    d: { k: 'stop', f: 3600, q: 1.1, a: 0.2, d: 0.06, v: 0.35 },
    k: { k: 'stop', f: 1900, q: 1.5, a: 0.34, d: 0.075, v: 0 },
    g: { k: 'stop', f: 1700, q: 1.5, a: 0.22, d: 0.065, v: 0.35 },
    ch: { k: 'affr', f: 3200, q: 1.8, a: 0.32, d: 0.1, v: 0 },
    j: { k: 'affr', f: 3000, q: 1.8, a: 0.2, d: 0.09, v: 0.4 },
    m: { k: 'nas', F: [260, 1100, 2300], d: 0.07, v: 0.6 },
    n: { k: 'nas', F: [280, 1500, 2500], d: 0.065, v: 0.6 },
    ng: { k: 'nas', F: [290, 1900, 2600], d: 0.07, v: 0.55 },
    l: { k: 'app', F: [380, 1050, 2650], d: 0.055, v: 0.75 },
    r: { k: 'app', F: [420, 1250, 1650], d: 0.06, v: 0.75 },
    w: { k: 'app', F: [310, 720, 2200], d: 0.05, v: 0.7 },
    y: { k: 'app', F: [290, 2200, 2900], d: 0.05, v: 0.7 },
  };
  const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const FUNCTION_WORDS = new Set(('a an the of to in on at is it its and or but you i he she we they me my your our his ' +
    'her be was were are am do does did not no so if as by for with from that this than then there them what when ' +
    'who how can will just up out all any im its dont ive youre thats theres').split(' '));
  const WH = new Set(['what', 'where', 'who', 'why', 'how', 'when', 'which', 'whose']);
  const PAUSE = { ',': 0.2, ';': 0.26, ':': 0.24, '-': 0.22, '.': 0.34, '?': 0.34, '!': 0.3, '…': 0.5 };

  /** Words and punctuation. Stage directions ([…], *…*) become pauses; digits are spoken. */
  function tokenize(text) {
    let s = String(text || '');
    s = s.replace(/\[[^\]]*\]/g, ' , ').replace(/\*[^*]*\*/g, ' , ').replace(/\([^)]*\)/g, ' , ');
    s = s.replace(/\{[A-Z_0-9+-]+\}/g, ' someone ');
    s = s.replace(/(\d)\.(\d)/g, '$1 point $2').replace(/\d/g, (d) => ' ' + DIGIT_WORDS[+d] + ' ');
    s = s.replace(/\.{2,}|…/g, ' … ').replace(/[—–]/g, ' - ');
    const out = [];
    const re = /([A-Za-z']+)|(…)|([.,!?;:-])/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) out.push({ w: m[1] });
      else out.push({ p: m[2] || m[3] });
    }
    return out;
  }
  function consList(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const two = s.substr(i, 2);
      if (two === 'sh' || two === 'ch' || two === 'th' || two === 'zh' || two === 'ng') { out.push(two); i++; continue; }
      const c = s[i];
      if (c === s[i + 1]) continue;
      if (c === 'Y') { out.push('y'); continue; }
      if (CONS[c]) out.push(c);
    }
    return out;
  }
  /** Split a word into syllables {on:[cons], v:'group', coda:[cons], magic, open}. */
  function syllabify(word) {
    let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return [];
    w = w.replace(/tion/g, 'shun').replace(/sion/g, 'zhun').replace(/ph/g, 'f').replace(/wh/g, 'w')
      .replace(/ck/g, 'k').replace(/gh(?![aeiou])/g, '').replace(/qu/g, 'kw').replace(/x/g, 'ks')
      .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k');
    if (/^y[aeiou]/.test(w)) w = 'Y' + w.slice(1);
    const re = /[aeiouy]+(?:w(?![aeiouy]))?/g;
    const groups = [];
    let m;
    while ((m = re.exec(w))) groups.push({ v: m[0], i: m.index, e: m.index + m[0].length });
    let magic = false;
    if (groups.length > 1) {
      const g = groups[groups.length - 1];
      const prevIsVowel = /[aeiouy]/.test(w[g.i - 1] || '');
      if (g.v === 'e' && g.e === w.length && !prevIsVowel && !/[^aeiou]le$/.test(w)) { groups.pop(); magic = true; }
      else if (g.v === 'e' && g.e === w.length - 1 && /[sd]$/.test(w) && !/[td]ed$/.test(w) && !/(s|z|sh|ch|ks)es$/.test(w)) groups.pop();
    }
    if (!groups.length) return [{ on: consList(w), v: 'sch', coda: [], open: false }];
    const out = [];
    let cursor = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi], next = groups[gi + 1];
      const onset = w.slice(cursor, g.i);
      const between = w.slice(g.e, next ? next.i : w.length);
      let coda = between;
      if (next) {
        let keep = between.length ? 1 : 0;
        if (/(sh|th|ch|zh)$/.test(between)) keep = 2;
        if (/ng$/.test(between)) keep = 0;
        coda = between.slice(0, Math.max(0, between.length - keep));
        cursor = g.e + coda.length;
      }
      out.push({ on: consList(onset), v: g.v, coda: consList(coda), open: !coda.length && !!next, magic: magic && gi === groups.length - 1, codaR: coda[0] === 'r' });
    }
    return out;
  }
  /** Vowel group → [target, optional glide target]. */
  function vowelOf(s, stressed, single, last) {
    const g = s.v.replace(/w$/, 'W');
    if (!/[aeiouy]/.test(g)) return ['sch']; // vowel-less words ("hmm", "shh", "CB")
    const r = s.codaR;
    switch (g) {
      case 'a': return s.magic ? ['e', 'ii'] : r ? ['a'] : s.open ? (stressed ? ['e', 'ii'] : ['sch']) : stressed || single ? ['ae'] : ['sch'];
      case 'e': return s.magic ? ['ii'] : r ? ['er'] : s.open || (single && last && !s.coda.length) ? (stressed || single ? ['ii'] : ['sch']) : stressed || single ? ['e'] : ['sch'];
      case 'i': return s.magic ? ['a', 'ii'] : r ? ['er'] : s.open && stressed ? ['a', 'ii'] : ['i'];
      case 'o': return s.magic ? ['o', 'oo'] : r ? ['aw'] : s.open || (single && !s.coda.length) ? ['o', 'oo'] : stressed || single ? ['a'] : ['sch'];
      case 'u': return s.magic ? ['ii', 'oo'] : r ? ['er'] : s.open ? ['oo'] : ['u'];
      case 'y': return single ? ['a', 'ii'] : last ? ['ii'] : ['i'];
      case 'ee': case 'ea': case 'ie': case 'ei': return ['ii'];
      case 'oo': case 'ue': case 'ui': case 'eW': case 'eu': return ['oo'];
      case 'ou': case 'aW': return ['a', 'oo'];
      case 'oW': return single ? ['a', 'oo'] : ['o', 'oo'];
      case 'oa': case 'oe': return ['o', 'oo'];
      case 'ai': case 'ay': case 'ey': return ['e', 'ii'];
      case 'oi': case 'oy': return ['o', 'ii'];
      case 'au': case 'aw': return ['aw'];
      case 'io': case 'ia': case 'iu': return ['ii', 'sch'];
      default: {
        // unknown cluster: glide from its first vowel letter to its last
        const base = g.replace(/W/g, '');
        const first = base[0] || 'a', lastL = base[base.length - 1] || first;
        const a = vowelOf({ v: first, coda: s.coda, open: s.open }, stressed, single, last);
        if (lastL === first) return a;
        const b = vowelOf({ v: lastL, coda: s.coda, open: true }, false, false, last);
        return [a[0], b[b.length - 1]];
      }
    }
  }

  /* ---------------------------------------------------------- speaker params */
  const VDEF = {
    m: { pitch: 112, rate: 1, formant: 1, breathy: 0.18, age: 40, rasp: 0.06, range: 0.2 },
    f: { pitch: 208, rate: 1.04, formant: 1.16, breathy: 0.3, age: 34, rasp: 0.02, range: 0.28 },
    c: { pitch: 272, rate: 1.06, formant: 1.3, breathy: 0.26, age: 8, rasp: 0, range: 0.32 },
    n: { pitch: 146, rate: 0.95, formant: 1.07, breathy: 0.24, age: 45, rasp: 0.08, range: 0.13 },
  };
  function guessGender(id) {
    id = String(id || '');
    if (/girl|child|kid|boy/.test(id)) return 'c';
    if (/woman|female|mother|wife|she\b/.test(id)) return 'f';
    if (/entity|keep_open|first_contact|unknown|null/.test(id)) return 'n';
    return 'm';
  }
  /**
   * Speaker voice params from DA.content.speakers[id].voice (all optional):
   *   pitch  Hz (>30) or a multiplier of the adult-male baseline 112 Hz (woman ≈1.85,
   *          child ≈2.5); on f/c voices a multiplier < 1.3 is read as gender-relative
   *   rate   speed multiplier (1 = normal)
   *   formant vocal-tract scale vs an adult male (≈1 m, 1.16 f, 1.3 c); on f/c voices a value
   *          < 1 is read as relative to that gender's default
   *   breathy, rasp 0..1; age in years (or 0..1 → ×90); gender 'f'|'m'|'c'|'n'
   *   synthetic (bool) machine voice; range (pitch-range multiplier); panic 0..1 (extra range)
   */
  function voiceParams(id, over) {
    const sp = DA.content && DA.content.speakers && DA.content.speakers[id];
    const src = Object.assign({}, (sp && sp.voice) || {}, over || {});
    const g = VDEF[src.gender] ? src.gender : guessGender(id);
    const d = VDEF[g];
    const vp = { gender: g, id };
    const p = num(src.pitch, 0);
    // Hz above 30; otherwise a multiplier of the adult-male baseline (content convention:
    // woman 1.85, child 2.5) — small multipliers on f/c voices are read as gender-relative
    const fc = g === 'f' || g === 'c';
    vp.pitch = p > 30 ? p : p > 0 ? (fc && p < 1.3 ? d.pitch * p : VDEF.m.pitch * p) : d.pitch;
    const r = num(src.rate, 0);
    vp.rate = clamp(r > 4 ? r / 150 : r > 0 ? r : d.rate, 0.55, 1.8);
    const f = num(src.formant, 0);
    vp.formant = f > 0.5 && f < 2 ? (fc && f < 1 ? d.formant * f : f) : d.formant;
    vp.breathy = clamp(num(src.breathy, d.breathy), 0, 1);
    vp.rasp = clamp(num(src.rasp, d.rasp), 0, 1);
    let age = num(src.age, d.age);
    if (age > 0 && age <= 1) age *= 90;
    vp.age = age;
    const old = Math.max(0, age - 58);
    vp.jitter = 0.007 + vp.rasp * 0.03 + old * 0.0007;
    vp.tremor = 0.003 + old * 0.0009;
    vp.tremorHz = old > 0 ? 5.1 : 5.7;
    vp.range = d.range * num(src.range, 1) * (old > 8 ? 0.8 : 1);
    vp.shimmer = 0.05 + vp.rasp * 0.25 + old * 0.002;
    if (old > 0) { vp.breathy = clamp(vp.breathy + old * 0.004, 0, 1); vp.rate *= 1 - Math.min(0.12, old * 0.004); }
    vp.panic = num(src.panic, 0);
    if (src.synthetic) {
      // machine voice (NOAA weather synthesiser, the thing on the long channel): flat and exact
      vp.synthetic = true;
      vp.jitter = 0.0015; vp.shimmer = 0.01; vp.tremor = 0; vp.range *= 0.3;
      vp.breathy = Math.min(vp.breathy, 0.08);
    }
    return vp;
  }

  /**
   * Plan an utterance: returns timed automation for pitch, voicing, breath, formants,
   * nasality and consonant noise, all in seconds from the start. Pure (seeded) function.
   */
  function planSpeech(text, vp, dur, seed) {
    const rng = seeded(seed || hashStr(text + vp.id));
    const rr = (a, b) => a + rng() * (b - a);
    const toks = tokenize(text);
    const units = [];
    for (const tk of toks) {
      if (tk.w) {
        const lower = tk.w.toLowerCase().replace(/[^a-z]/g, '');
        const syl = syllabify(tk.w);
        if (!syl.length) continue;
        const fn = FUNCTION_WORDS.has(lower);
        let si = 0;
        if (syl.length >= 2 && /^(a|be|re|de|con|com|ex|un|per|pro|to)/.test(lower) && !/^(after|any|every|area|able|real|radio|record|pro[bgs])/.test(lower)) si = 1;
        if (fn) si = -1;
        syl.forEach((s, i) => {
          units.push({ kind: 'syl', s, stressed: i === si || (syl.length === 1 && !fn), word: lower, wi: i, wn: syl.length, fn });
        });
      } else if (tk.p) {
        const last = units[units.length - 1];
        if (last && last.kind === 'pause') { last.len = Math.max(last.len, PAUSE[tk.p] || 0.2); last.ch = tk.p === ',' ? last.ch : tk.p; }
        else units.push({ kind: 'pause', ch: tk.p, len: PAUSE[tk.p] || 0.2 });
      }
    }
    while (units.length && units[0].kind === 'pause') units.shift();
    while (units.length && units[units.length - 1].kind === 'pause') units.pop();
    const sylls = units.filter((u) => u.kind === 'syl');
    const plan = { end: 0, f0: [], voice: [], breath: [], F: [], nas: [], cons: [], syl: [], dur };
    if (!sylls.length) { plan.end = 0.05; return plan; }

    // phrase + sentence structure
    {
      let pStart = 0, sStart = 0;
      const closePhrase = (endIdx) => { for (let j = pStart; j <= endIdx; j++) { units[j].pStart = pStart; units[j].pEnd = endIdx; } };
      const closeSentence = (endIdx, term) => {
        let fw = null;
        for (let j = sStart; j <= endIdx; j++) {
          const q = units[j];
          if (q.kind !== 'syl') continue;
          if (fw == null) fw = q.word;
          q.sent = term; q.wh = WH.has(fw);
        }
      };
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.kind === 'pause') {
          closePhrase(i - 1); pStart = i + 1;
          if (/[.?!…]/.test(u.ch)) { closeSentence(i - 1, u.ch); sStart = i + 1; }
          continue;
        }
        const nextU = units[i + 1];
        u.wordEnd = u.wi === u.wn - 1;
        u.phraseEnd = !nextU || nextU.kind === 'pause';
        u.term = !nextU ? '.' : nextU.kind === 'pause' ? nextU.ch : null;
      }
      closePhrase(units.length - 1);
      closeSentence(units.length - 1, '.');
    }

    // time budget
    const words = sylls.filter((u) => u.wi === 0).length;
    const preBreath = words >= 5 && dur >= 2.4;
    const lead = preBreath ? 0.2 : 0.05;
    const tailMin = Math.min(0.3, 0.1 + dur * 0.03);
    const nat = 0.19 / vp.rate;
    for (const u of sylls) {
      let w = u.stressed ? 1.28 : 0.8;
      if (u.wordEnd) w *= 1.08;
      if (u.phraseEnd) w *= 1.45;
      const vv = vowelOf(u.s, u.stressed, u.wn === 1, u.wordEnd);
      u.vv = vv;
      if (vv[1]) w *= 1.1;
      w *= 1 + 0.1 * (u.s.on.length + u.s.coda.length);
      u.w = w * rr(0.92, 1.08);
    }
    const inner = units.filter((u) => u.kind === 'pause');
    let gapN = 0;
    for (let i = 1; i < units.length; i++) if (units[i].kind === 'syl' && units[i].wi === 0 && units[i - 1].kind === 'syl') gapN++;
    const GAP = 0.035;
    const sumW = sylls.reduce((a, u) => a + u.w, 0);
    let pauseT = inner.reduce((a, u) => a + u.len, 0) + gapN * GAP;
    const avail = dur - lead - tailMin;
    let scale = (avail - pauseT) / (sumW * nat);
    let pauseScale = 1;
    if (scale < 0.62) {
      // too much to say: squeeze the pauses first, then speak faster
      pauseScale = clamp((avail - sumW * nat * 0.62) / Math.max(0.001, pauseT), 0.3, 1);
      pauseT *= pauseScale;
      scale = clamp((avail - pauseT) / (sumW * nat), 0.35, 0.62);
    } else if (scale > 1.3) {
      // leisurely: stretch pauses up to ×2.2 with half the leftover; the rest is trailing silence
      scale = 1.3;
      const left = avail - pauseT - sumW * nat * scale;
      const innerP = inner.reduce((a, u) => a + u.len, 0);
      if (innerP > 0) pauseScale = 1 + Math.min(1.2, (left * 0.5) / innerP);
    }
    const fs = vp.formant;
    const scaleF = (F, jit) => [F[0] * fs * jit, F[1] * fs * jit, F[2] * fs * (1 + (jit - 1) * 0.5)];

    const P = plan;
    const V = P.voice, B = P.breath, FF = P.F, N = P.nas, F0 = P.f0;
    V.push([0, 0]); B.push([0, 0]); N.push([0, 1]); FF.push([0, ...scaleF(VOW.sch, 1)]);
    if (preBreath) {
      B.push([0.02, 0], [0.09, 0.2 + vp.breathy * 0.2], [0.17, 0.02]);
      FF.push([0.02, ...scaleF(VOW.a, 1)]);
    }
    const base = vp.pitch;
    const range = vp.range * (1 + vp.panic * 0.6);
    let t = lead;
    const total = sylls.length;
    let idx = 0;
    let lastF = scaleF(VOW.sch, 1);
    const setF = (tt, F) => { FF.push([tt, F[0], F[1], F[2]]); lastF = F; };
    F0.push([0, base * (1 + range * 0.3)]);
    for (let ui = 0; ui < units.length; ui++) {
      const u = units[ui];
      if (u.kind === 'pause') {
        V.push([t + 0.03, 0]);
        B.push([t + 0.05, 0]);
        t += u.len * pauseScale * rr(0.9, 1.1);
        continue;
      }
      const prevU = units[ui - 1];
      if (prevU && prevU.kind === 'syl' && u.wi === 0) {
        // word boundary inside a phrase: brief dip, not silence (connected speech)
        V.push([t + 0.012, 0.12]);
        t += GAP * pauseScale;
      }
      const d = u.w * nat * scale;
      const t0 = t, t1 = t + d;
      const x = idx / Math.max(1, total - 1); // position in utterance
      const px = clamp((ui - u.pStart) / Math.max(1, u.pEnd - u.pStart), 0, 1);
      let amp = (u.stressed ? 1 : 0.72) * (1 - 0.14 * x) * rr(0.92, 1.06);
      if (u.sent === '!') amp *= 1.12;
      if (u.phraseEnd && u.term === '…') amp *= 0.62;
      const jit = rr(0.96, 1.04);
      const v1 = scaleF(VOW[u.vv[0]] || VOW.sch, jit);
      const v2 = u.vv[1] ? scaleF(VOW[u.vv[1]] || VOW.sch, jit) : null;
      // unstressed vowels drift towards schwa
      if (!u.stressed) for (let q = 0; q < 3; q++) v1[q] = lerp(v1[q], VOW.sch[q] * fs, 0.3);

      // time split: onset | nucleus | coda
      const on = u.s.on.map((c) => CONS[c]).filter(Boolean);
      const co = u.s.coda.map((c) => CONS[c]).filter(Boolean);
      const onD = Math.min(d * 0.42, on.reduce((a, c) => a + c.d, 0) * clamp(scale, 0.6, 1.1));
      const coD = Math.min(d * 0.32, co.reduce((a, c) => a + c.d, 0) * clamp(scale, 0.6, 1.1));
      const tn0 = t0 + onD, tn1 = t1 - coD;
      const dn = tn1 - tn0;

      // consonant segments
      const doCons = (list, ts, te, nextVowelF) => {
        if (!list.length) return;
        const tot = list.reduce((a, c) => a + c.d, 0) || 1;
        let tc = ts;
        for (const c of list) {
          const cd = ((te - ts) * c.d) / tot;
          const a = amp;
          if (c.k === 'fric') {
            P.cons.push({ t: tc, f: c.f * (0.9 + fs * 0.1), q: c.q, pts: [[tc, 0], [tc + Math.min(0.018, cd * 0.3), c.a * a], [tc + cd * 0.8, c.a * a * 0.85], [tc + cd, 0]] });
            V.push([tc + 0.012, c.v * a * 0.55]);
            B.push([tc + 0.01, 0.05 * a]);
          } else if (c.k === 'stop' || c.k === 'affr') {
            const tb = tc + cd * (c.k === 'affr' ? 0.35 : 0.55);
            V.push([tc + 0.01, c.v * a * 0.25], [tb, c.v * a * 0.25]);
            B.push([tc + 0.01, 0]);
            if (c.k === 'affr') P.cons.push({ t: tb, f: c.f, q: c.q, pts: [[tb, 0], [tb + 0.004, c.a * a], [tc + cd * 0.9, c.a * a * 0.6], [tc + cd, 0]] });
            else P.cons.push({ t: tb, f: c.f, q: c.q, pts: [[tb, 0], [tb + 0.003, c.a * a], [tb + 0.022, c.a * a * 0.15], [tb + 0.03, 0]] });
            if (!c.v) B.push([tb + 0.006, 0.42 * a], [tc + cd, 0.18 * a]);
            if (nextVowelF) setF(tb, nextVowelF);
          } else if (c.k === 'asp') {
            V.push([tc + 0.012, 0]);
            B.push([tc + 0.015, c.a * a]);
            if (nextVowelF) setF(tc + 0.01, nextVowelF);
          } else if (c.k === 'nas') {
            V.push([tc + 0.015, c.v * a]);
            B.push([tc + 0.015, 0.02]);
            setF(tc + 0.02, scaleF(c.F, 1));
            N.push([tc + 0.015, 0.22]);
          } else if (c.k === 'app') {
            V.push([tc + 0.02, c.v * a]);
            setF(tc + cd * 0.55, scaleF(c.F, 1));
          }
          tc += cd;
        }
      };
      doCons(on, t0, tn0, v1);
      // nucleus
      const micro = rr(-0.035, 0.035);
      const fStart = base * (1 + micro + range * (0.32 - 0.5 * px) + (u.stressed ? range * 0.1 : -range * 0.08));
      let fPeak = base * (1 + micro + range * (0.32 - 0.5 * px) + (u.stressed ? range * rr(0.6, 0.95) : range * rr(-0.12, 0.06)));
      let fEnd = base * (1 + micro * 0.5 + range * (0.22 - 0.5 * px) - (u.stressed ? 0 : range * 0.1));
      if (u.phraseEnd) {
        if (u.term === '?' || (u.sent === '?' && !u.term)) { fEnd = u.wh ? base * (1 + range * 0.2) : base * (1 + range * 1.5); if (!u.wh) fPeak = Math.min(fPeak, fStart); }
        else if (u.term === ',' || u.term === '-' || u.term === ';' || u.term === ':') fEnd = base * (1 + range * 0.35);
        else if (u.term === '!') { fPeak *= 1 + range * 0.8; fEnd = base * (1 - range * 0.6); }
        else if (u.term === '…') fEnd = base * (1 - range * 0.9);
        else fEnd = base * (1 - range * 0.85);
      }
      F0.push([tn0, fStart], [tn0 + dn * 0.4, fPeak], [tn1, fEnd]);
      N.push([tn0 + 0.012, 1]);
      if (!on.length && u.wi > 0) V.push([tn0 - 0.01, amp * 0.3]); // vowel after vowel: a small dip
      V.push([tn0 + Math.min(0.03, dn * 0.3), amp]);
      B.push([tn0 + 0.02, vp.breathy * 0.42 * amp + (u.phraseEnd && u.term === '…' ? 0.12 : 0)]);
      setF(tn0 + Math.min(0.05, dn * 0.35), v1);
      if (v2) { FF.push([tn0 + dn * 0.45, ...v1]); setF(tn1 - 0.005, v2); }
      else FF.push([tn1 - 0.005, ...v1]);
      V.push([tn0 + dn * 0.55, amp * 0.9]);
      V.push([tn1 - 0.01, amp * (u.phraseEnd ? 0.55 : co.length ? 0.72 : 0.62)]);
      doCons(co, tn1, t1, null);
      if (u.phraseEnd) {
        // release: voicing dies away with a breathy tail
        V.push([t1 + 0.045, 0]);
        B.push([t1 + 0.02, 0.1 * amp + vp.breathy * 0.1], [t1 + 0.12, 0]);
      }
      P.syl.push({ t0, t1, v: u.vv.join('>'), stressed: u.stressed, word: u.word, f0: Math.round(fPeak) });
      t = t1;
      idx++;
    }
    V.push([t + 0.05, 0]);
    B.push([t + 0.14, 0]);
    plan.end = Math.min(t + 0.15, dur - 0.02);
    // never let automation run past the line's duration
    const cap = (arr) => { for (const p of arr) p[0] = Math.min(p[0], dur - 0.02); };
    [V, B, FF, N, F0].forEach(cap);
    for (const c of P.cons) { c.t = Math.min(c.t, dur - 0.02); cap(c.pts); }
    return plan;
  }

  /** Apply sorted [t, v] points to an AudioParam (first = set, rest = linear ramps). */
  function applyPts(p, pts, t0, col, mul) {
    col = col || 1; mul = mul || 1;
    const s = pts.slice().sort((a, b) => a[0] - b[0]);
    if (!s.length) return;
    p.setValueAtTime(s[0][col] * mul, Math.max(0, t0 + s[0][0]));
    for (let i = 1; i < s.length; i++) p.linearRampToValueAtTime(s[i][col] * mul, Math.max(0, t0 + s[i][0]));
  }

  /**
   * Build the synth graph for a plan into `out`, starting at t0. opts.whisper → unvoiced.
   * Returns {level: GainNode} (the output stage, for fades).
   */
  function synthSpeech(k, out, t0, plan, vp, o) {
    o = o || {};
    const T = plan.end + 0.25;
    const fs = vp.formant;
    const whisper = !!o.whisper;
    const sum = gain(k, 1);
    const mix = gain(k, 1);
    if (!whisper) {
      const src = osc(k, wave(k, vp.breathy > 0.6 ? 'glottalSoft' : 'glottal'), 0, t0, T);
      const f0 = konst(k, vp.pitch, t0, T);
      applyPts(f0.offset, plan.f0.length ? plan.f0 : [[0, vp.pitch]], t0);
      f0.connect(src.frequency);
      const jit = ctrl(k, t0, T, 11);
      const jg = gain(k, vp.pitch * vp.jitter * 2.2);
      jit.connect(jg); jg.connect(src.frequency);
      const trem = osc(k, 'sine', vp.tremorHz * rnd(0.95, 1.05), t0, T);
      const tg = gain(k, vp.pitch * vp.tremor);
      trem.connect(tg); tg.connect(src.frequency);
      const rough = gain(k, 1);
      const shim = ctrl(k, t0, T, 18);
      chain(shim, gain(k, vp.shimmer * 2.5), rough.gain);
      const vG = gain(k, 0);
      applyPts(vG.gain, plan.voice, t0);
      // glottal spectral tilt: real voices fall ~12 dB/oct above the first formant region
      const tilt = filt(k, 'lowpass', 1100 * Math.min(1.3, fs), 0.55);
      chain(src, rough, tilt, vG, gain(k, 1.25), mix);
      if (vp.rasp > 0.04) {
        // period-doubling (vocal fry / rasp): a sub-harmonic source following f0/2
        const sub = osc(k, wave(k, 'glottal'), 0, t0, T);
        const half = gain(k, 0.5);
        f0.connect(half); half.connect(sub.frequency);
        const jh = gain(k, 0.5); jg.connect(jh); jh.connect(sub.frequency);
        chain(sub, gain(k, vp.rasp * 0.55), vG);
        const rn = ctrl(k, t0, T, 70);
        chain(rn, gain(k, vp.rasp * 0.9), rough.gain);
      }
    }
    // aspiration / whisper noise through the formants
    const bn = noise(k, 'white', t0, T);
    const bG = gain(k, 0);
    if (whisper) applyPts(bG.gain, plan.voice.map(([tt, v]) => [tt, v * 0.9]), t0);
    else applyPts(bG.gain, plan.breath, t0);
    chain(bn, filt(k, 'highpass', 500, 0.7), bG, mix);
    // formant bank
    const fq = [7, 11, 14];
    const fg = [1, 0.78, 0.5];
    const nasG = [];
    for (let i = 0; i < 3; i++) {
      const bp = filt(k, 'bandpass', 500, fq[i]);
      applyPts(bp.frequency, plan.F, t0, i + 1);
      const g = gain(k, fg[i]);
      chain(mix, bp, g, sum);
      if (i > 0) nasG.push(g);
    }
    nasG.forEach((g, i) => applyPts(g.gain, plan.nas, t0, 1, fg[i + 1]));
    chain(mix, filt(k, 'lowpass', 300, 0.7), gain(k, 0.1), sum); // chest warmth
    // consonant noise channel
    if (plan.cons.length) {
      const cn = noise(k, 'white', t0, T);
      const cf = filt(k, 'bandpass', 4000, 1.5);
      const cg = gain(k, 0);
      for (const c of plan.cons) { cf.frequency.setValueAtTime(c.f, Math.max(0, t0 + c.t)); cf.Q.setValueAtTime(c.q, Math.max(0, t0 + c.t)); }
      const pts = [];
      for (const c of plan.cons) pts.push(...c.pts);
      applyPts(cg.gain, [[0, 0]].concat(pts), t0);
      chain(cn, cf, cg, gain(k, 0.9), sum);
    }
    const level = gain(k, o.whisper ? 3.2 : 2.4);
    chain(sum, filt(k, 'peaking', 3300 * fs, 1.5, 3), filt(k, 'lowpass', 5200 * Math.min(1.25, fs), 0.6), level, out); // F4 presence + top roll-off
    return { level, end: t0 + plan.end };
  }

  /* ---------------------------------------------------------- speaker colourings */
  /** Desk-speaker / transceiver colouring with live clarity: band-limit, soft clip, drop-outs, static bed. */
  function radioChain(k, input, out, t0, T, clarity, o) {
    o = o || {};
    // speaker band: 2nd-order HP/LP with a little resonance, presence bump, soft clip
    const hp = filt(k, 'highpass', 330, 1.1);
    const lp = filt(k, 'lowpass', 2800, 1.2);
    const pk = filt(k, 'peaking', 1700, 1, 4);
    const drive = gain(k, 2.1);
    const sh = shaper(k, 'soft');
    const drop = gain(k, 0);
    const vLevel = gain(k, 0.55);
    chain(input, hp, lp, pk, drive, sh, drop, vLevel, out);
    // drop-out gate: slow random signal + clarity bias → threshold shaper → gain
    const gn = ctrl(k, t0, T, 2.6);
    const bias = konst(k, -0.6, t0, T);
    const gIn = gain(k, 1);
    chain(gn, gain(k, 0.5), gIn);
    bias.connect(gIn);
    chain(gIn, shaper(k, 'gate'), drop.gain);
    // fading (QSB)
    const q = ctrl(k, t0, T, 0.35);
    const qd = gain(k, 0);
    chain(q, qd, vLevel.gain);
    // static bed + crackle
    const sn = noise(k, 'white', t0, T);
    const bed = gain(k, 0);
    chain(sn, filt(k, 'bandpass', 1200, 0.45), bed, out);
    const cr = noise(k, 'crackle', t0, T);
    const crg = gain(k, 0);
    chain(cr, filt(k, 'bandpass', 2200, 0.6), crg, out);
    const set = (c, now, tc) => {
      c = clamp(c, 0, 1);
      now = Math.max(0, now);
      const b = lerp(0.32, -0.62, Math.pow(c, 0.85));
      const vl = lerp(0.28, 0.62, Math.pow(c, 0.7));
      const bd = 0.012 + Math.pow(1 - c, 1.3) * 0.16;
      const qq = (1 - c) * 0.22;
      if (tc == null) {
        bias.offset.setValueAtTime(b, now); vLevel.gain.setValueAtTime(vl, now);
        bed.gain.setValueAtTime(bd, now); crg.gain.setValueAtTime(bd * 2.2, now); qd.gain.setValueAtTime(qq, now);
      } else {
        approach(bias.offset, b, now, tc); approach(vLevel.gain, vl, now, tc);
        approach(bed.gain, bd, now, tc); approach(crg.gain, bd * 2.2, now, tc); approach(qd.gain, qq, now, tc);
      }
    };
    set(clarity == null ? 1 : clarity, t0);
    // bed fades in/out with the transmission
    return { set, bed };
  }
  /** Telephone earpiece: narrow band, carbon-mic grit, faint line hiss and hum. */
  function phoneChain(k, input, out, t0, T) {
    chain(input, filt(k, 'highpass', 430, 0.8), filt(k, 'highpass', 430, 0.8), filt(k, 'lowpass', 2650, 1.1),
      filt(k, 'lowpass', 2650, 0.7), filt(k, 'peaking', 1150, 1.2, 6), gain(k, 1.3), shaper(k, 'carbon'),
      filt(k, 'highpass', 300, 0.7), gain(k, 0.42), out); // HP after the shaper: no DC/envelope thump
    if (T) {
      chain(noise(k, 'white', t0, T), filt(k, 'bandpass', 1800, 0.5), gain(k, 0.012), out);
      chain(osc(k, 'sine', 60, t0, T), gain(k, 0.003), out);
    }
  }
  /** Cassette: wow & flutter (modulated delay), band-limit, gentle saturation, hiss. */
  function tapeChain(k, input, out, t0, T) {
    const dl = delayN(k, 0.012, 0.05);
    const fl = osc(k, 'sine', 5.3, t0, T);
    chain(fl, gain(k, 0.00022), dl.delayTime);
    const wow = ctrl(k, t0, T, 0.2);
    chain(wow, gain(k, 0.0011), dl.delayTime);
    chain(input, dl, filt(k, 'highpass', 95, 0.7), filt(k, 'lowpass', 6200, 0.7), gain(k, 1.3), shaper(k, 'tape'), gain(k, 0.8), out);
    chain(noise(k, 'pink', t0, T), filt(k, 'highpass', 2600, 0.7), gain(k, 0.018), out);
    chain(osc(k, 'sine', 60, t0, T), gain(k, 0.003), out);
  }

  /* =====================================================================================
   * NATURAL VOICE ENGINE — daNaturalVoice(root, inWorker) → {render, voiceOnly, planInfo, …}
   * Self-contained (no closure over audio.js): the same source runs on the main thread and, via
   * Function.prototype.toString, in a Blob worker. Two halves:
   *   1. the talker — a Klatt-style source–filter synthesiser: LF glottal pulses with jitter,
   *      shimmer, flutter, aspiration, creak and breath; cascade F1–F9 + nasal pole/zero; a
   *      parallel frication branch; rough English phonemes (lexicon + spelling rules) with
   *      Klatt duration rules; Fujisaki pitch (phrase declination + accents + boundary tones).
   *   2. the device — 1999 hardware as plain DSP: two-way VHF, CB, NOAA weather radio, the car
   *      radio (AM/FM broadcast chain, music bed, receiver, door speaker), telephone, cassette,
   *      and the room for in-person speech.
   * ===================================================================================== */
  function daNaturalVoice(root, inWorker) {
    'use strict';
    let SR = 22050; // device DSP rate for the current render (11.025 kHz narrowband, 22.05 kHz wide)
    const TWO_PI = Math.PI * 2;
    /* ================================================================ utils */
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const dB = (x) => Math.pow(10, x / 20);
    const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    function hashStr(s) {
      let h = 2166136261 >>> 0;
      s = String(s);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    }
    function seeded(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function gaussFn(rng) {
      let spare = null;
      return () => {
        if (spare != null) { const s = spare; spare = null; return s; }
        let u = 0, v = 0;
        while (u < 1e-12) u = rng();
        v = rng();
        const m = Math.sqrt(-2 * Math.log(u));
        spare = m * Math.sin(2 * Math.PI * v);
        return m * Math.cos(2 * Math.PI * v);
      };
    }
    function lineDurFallback(text) {
      const DA = root && root.DA;
      if (DA && DA.util && DA.util.lineDur) return DA.util.lineDur(text);
      const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
      return Math.max(1.4, 0.6 + words * 0.32);
    }

    /* ================================================================ phones
     * c: V vowel · S stop · A affricate · F fricative · H aspirate · N nasal · L liquid ·
     *    G glide · X flap · Q glottal stop.   d: [inherent, minimum] ms (Klatt 1979-ish).
     * F / F2: male formant targets (Hillenbrand-style), F2 = diphthong offglide.
     * av: intrinsic level dB.  pl: place.  v: voiced.
     */
    const PH = {
      IY: { c: 'V', F: [320, 2250, 2950], d: [155, 55], av: -2, hi: 1 },
      IH: { c: 'V', F: [420, 1960, 2620], d: [135, 40], av: -1, hi: 1 },
      IX: { c: 'V', F: [430, 1750, 2550], d: [90, 40], av: -3, red: 1 },
      EY: { c: 'V', F: [480, 1920, 2620], F2: [360, 2150, 2750], d: [190, 100], av: -1 },
      EH: { c: 'V', F: [570, 1780, 2560], d: [150, 70], av: 0 },
      AE: { c: 'V', F: [660, 1740, 2460], d: [230, 80], av: 0, lo: 1 },
      AA: { c: 'V', F: [740, 1190, 2520], d: [240, 100], av: 0, lo: 1 },
      AO: { c: 'V', F: [630, 970, 2520], d: [240, 100], av: 0, lo: 1 },
      OW: { c: 'V', F: [540, 1020, 2450], F2: [440, 870, 2400], d: [220, 80], av: -1 },
      UH: { c: 'V', F: [460, 1160, 2420], d: [160, 60], av: -2 },
      UW: { c: 'V', F: [350, 1060, 2300], d: [210, 70], av: -3, hi: 1 },
      AH: { c: 'V', F: [630, 1220, 2560], d: [140, 60], av: 0 },
      AX: { c: 'V', F: [510, 1440, 2460], d: [110, 45], av: -3, red: 1 },
      ER: { c: 'V', F: [480, 1360, 1700], d: [180, 80], av: -1 },
      AXR: { c: 'V', F: [490, 1400, 1760], d: [120, 50], av: -3, red: 1 },
      AY: { c: 'V', F: [730, 1220, 2500], F2: [420, 1960, 2560], d: [250, 150], av: 0, lo: 1 },
      AW: { c: 'V', F: [730, 1260, 2500], F2: [460, 960, 2400], d: [260, 100], av: 0, lo: 1 },
      OY: { c: 'V', F: [540, 870, 2450], F2: [420, 1900, 2560], d: [280, 150], av: -1 },
      P: { c: 'S', v: 0, pl: 'lab', d: [90, 50] }, B: { c: 'S', v: 1, pl: 'lab', d: [85, 60] },
      T: { c: 'S', v: 0, pl: 'alv', d: [75, 50] }, D: { c: 'S', v: 1, pl: 'alv', d: [75, 50] },
      K: { c: 'S', v: 0, pl: 'vel', d: [80, 60] }, G: { c: 'S', v: 1, pl: 'vel', d: [80, 60] },
      CH: { c: 'A', v: 0, pl: 'pal', d: [70, 50] }, JH: { c: 'A', v: 1, pl: 'pal', d: [70, 50] },
      F: { c: 'F', v: 0, pl: 'lab', d: [100, 80] }, V: { c: 'F', v: 1, pl: 'lab', d: [60, 40] },
      TH: { c: 'F', v: 0, pl: 'den', d: [90, 60] }, DH: { c: 'F', v: 1, pl: 'den', d: [50, 30] },
      S: { c: 'F', v: 0, pl: 'alv', d: [105, 60] }, Z: { c: 'F', v: 1, pl: 'alv', d: [75, 40] },
      SH: { c: 'F', v: 0, pl: 'pal', d: [105, 80] }, ZH: { c: 'F', v: 1, pl: 'pal', d: [70, 40] },
      HH: { c: 'H', v: 0, pl: 'glo', d: [80, 20] },
      M: { c: 'N', v: 1, pl: 'lab', d: [70, 60] }, N: { c: 'N', v: 1, pl: 'alv', d: [60, 50] }, NG: { c: 'N', v: 1, pl: 'vel', d: [95, 60] },
      L: { c: 'L', v: 1, F: [340, 1060, 2850], d: [80, 40] }, R: { c: 'L', v: 1, F: [330, 1100, 1480], d: [80, 30] },
      W: { c: 'G', v: 1, F: [300, 720, 2200], d: [80, 60] }, Y: { c: 'G', v: 1, F: [270, 2150, 2950], d: [80, 40] },
      DX: { c: 'X', v: 1, pl: 'alv', d: [25, 20] },
      Q: { c: 'Q', v: 0, pl: 'glo', d: [45, 30] },
    };
    const isV = (p) => PH[p] && PH[p].c === 'V';
    // consonant formant loci (male): [F1, F2, F3]; velars depend on the vowel (computed)
    const LOCUS = { lab: [220, 850, 2250], den: [280, 1400, 2600], alv: [250, 1700, 2650], pal: [260, 1950, 2600], glo: null, vel: null };
    const COART = { S: 0.4, A: 0.35, F: 0.45, N: 0.45, X: 0.7, L: 0.18, G: 0.15 };
    // frication / burst spectra: parallel band-passes [f Hz, bw Hz, dB] + bypass dB, overall dB
    const FRIC = {
      lab: { r: [[1400, 900, -16], [3200, 1600, -12], [6500, 2600, -8]], ab: -8, lvl: -19 },
      den: { r: [[1700, 900, -18], [4200, 1500, -10], [7000, 2200, -5]], ab: -12, lvl: -19 },
      alv: { r: [[2700, 500, -24], [4400, 800, -9], [5900, 1000, 0], [7800, 1600, -5]], ab: -30, lvl: -5 },
      pal: { r: [[2000, 350, -12], [2750, 450, 0], [3700, 700, -3], [5200, 1300, -12]], ab: -30, lvl: -5 },
      glo: { r: [[1500, 800, -10], [2500, 900, -10]], ab: -10, lvl: -20 },
    };
    const BURST = { P: -12, B: -17, T: -3, D: -9, K: -5, G: -11, CH: -4, JH: -9 };

    /* ================================================================ lexicon
     * Common words in ARPAbet with stress digits (0 unstressed, 1 primary, 2 secondary).
     * Function words are given their weak forms, as connected speech has them.
     */
    const LEX_SRC = `
  the:DH AX0|a:AX0|an:AX0 N|and:AX0 N D|of:AX0 V|to:T AX0|in:IH0 N|on:AA1 N|at:AE0 T|is:IH0 Z|it:IH0 T|its:IH0 T S|
  i:AY1|im:AY1 M|ive:AY1 V|ill:AY1 L|id:AY1 D|you:Y UW0|your:Y ER0|youre:Y ER0|youll:Y UW0 L|youve:Y UW0 V|he:HH IY0|she:SH IY0|we:W IY0|they:DH EY0|
  them:DH AX0 M|him:HH IH0 M|his:HH IH0 Z|her:HH ER0|me:M IY0|my:M AY0|our:AW1 ER0|us:AH0 S|be:B IY0|been:B IH0 N|
  was:W AX0 Z|were:W ER0|are:ER0|am:AE0 M|do:D UW0|does:D AH0 Z|did:D IH0 D|not:N AA1 T|no:N OW1|so:S OW1|if:IH0 F|
  as:AE0 Z|by:B AY0|for:F ER0|with:W IH0 DH|from:F R AX0 M|that:DH AE0 T|this:DH IH0 S|than:DH AX0 N|then:DH EH1 N|
  there:DH EH1 R|their:DH EH1 R|theyre:DH EH1 R|these:DH IY1 Z|those:DH OW1 Z|what:W AH1 T|when:W EH1 N|where:W EH1 R|
  who:HH UW1|whose:HH UW1 Z|why:W AY1|how:HH AW1|can:K AX0 N|will:W IH0 L|just:JH AH1 S T|up:AH1 P|out:AW1 T|all:AO1 L|
  any:EH1 N IY0|or:ER0|but:B AH0 T|dont:D OW1 N T|wont:W OW1 N T|cant:K AE1 N T|isnt:IH1 Z AX0 N T|doesnt:D AH1 Z AX0 N T|
  didnt:D IH1 D AX0 N T|wasnt:W AA1 Z AX0 N T|arent:AA1 R AX0 N T|couldnt:K UH1 D AX0 N T|wouldnt:W UH1 D AX0 N T|
  shouldnt:SH UH1 D AX0 N T|havent:HH AE1 V AX0 N T|thats:DH AE1 T S|theres:DH EH1 R Z|heres:HH IH1 R Z|whats:W AH1 T S|
  lets:L EH1 T S|hes:HH IY1 Z|shes:SH IY1 Z|weve:W IY1 V|were:W ER0|well:W EH1 L|its:IH1 T S|
  one:W AH1 N|two:T UW1|three:TH R IY1|four:F AO1 R|five:F AY1 V|six:S IH1 K S|seven:S EH1 V AX0 N|eight:EY1 T|
  nine:N AY1 N|zero:Z IH1 R OW0|ten:T EH1 N|eleven:IH0 L EH1 V AX0 N|twelve:T W EH1 L V|thirteen:TH ER1 T IY1 N|
  fourteen:F AO1 R T IY1 N|fifteen:F IH1 F T IY1 N|twenty:T W EH1 N T IY0|thirty:TH ER1 DX IY0|forty:F AO1 R DX IY0|
  fifty:F IH1 F T IY0|sixty:S IH1 K S T IY0|seventy:S EH1 V AX0 N T IY0|eighty:EY1 DX IY0|ninety:N AY1 N T IY0|sixteen:S IH0 K S T IY1 N|seventeen:S EH2 V AX0 N T IY1 N|eighteen:EY0 T IY1 N|nineteen:N AY2 N T IY1 N|hundred:HH AH1 N D R AX0 D|thousand:TH AW1 Z AX0 N D|point:P OY1 N T|
  people:P IY1 P AX0 L|somebody:S AH1 M B AA2 D IY0|someone:S AH1 M W AH2 N|something:S AH1 M TH IH0 NG|
  nothing:N AH1 TH IH0 NG|anything:EH1 N IY0 TH IH2 NG|anyone:EH1 N IY0 W AH2 N|anymore:EH2 N IY0 M AO1 R|
  everything:EH1 V R IY0 TH IH2 NG|every:EH1 V R IY0|everyone:EH1 V R IY0 W AH2 N|always:AO1 L W EY0 Z|again:AX0 G EH1 N|
  said:S EH1 D|says:S EH1 Z|come:K AH1 M|coming:K AH1 M IH0 NG|some:S AH1 M|done:D AH1 N|gone:G AO1 N|love:L AH1 V|
  move:M UW1 V|know:N OW1|knew:N UW1|known:N OW1 N|own:OW1 N|would:W UH1 D|could:K UH1 D|should:SH UH1 D|have:HH AE1 V|
  has:HH AE1 Z|had:HH AE1 D|give:G IH1 V|live:L IH1 V|get:G EH1 T|got:G AA1 T|here:HH IH1 R|hear:HH IH1 R|heard:HH ER1 D|
  listen:L IH1 S AX0 N|listening:L IH1 S AX0 N IH0 NG|station:S T EY1 SH AX0 N|county:K AW1 N T IY0|radio:R EY1 D IY0 OW2|
  please:P L IY1 Z|weather:W EH1 DH ER0|tonight:T AX0 N AY1 T|night:N AY1 T|sure:SH UH1 R|make:M EY1 K|take:T EY1 K|
  eye:AY1|great:G R EY1 T|break:B R EY1 K|busy:B IH1 Z IY0|woman:W UH1 M AX0 N|women:W IH1 M AX0 N|water:W AO1 DX ER0|
  answer:AE1 N S ER0|door:D AO1 R|floor:F L AO1 R|through:TH R UW1|though:DH OW1|enough:IH0 N AH1 F|thought:TH AO1 T|
  very:V EH1 R IY0|only:OW1 N L IY0|also:AO1 L S OW0|before:B IH0 F AO1 R|because:B IH0 K AH1 Z|about:AX0 B AW1 T|
  around:AX0 R AW1 N D|away:AX0 W EY1|area:EH1 R IY0 AX0|frequency:F R IY1 K W AX0 N S IY0|reserved:R IH0 Z ER1 V D|
  respond:R IH0 S P AA1 N D|route:R UW1 T|carefully:K EH1 R F AX0 L IY0|careful:K EH1 R F AX0 L|sideways:S AY1 D W EY2 Z|
  upside:AH1 P S AY2 D|down:D AW1 N|arrive:AX0 R AY1 V|sunrise:S AH1 N R AY2 Z|clear:K L IH1 R|loud:L AW1 D|
  slow:S L OW1|log:L AO1 G|flash:F L AE1 SH|flood:F L AH1 D|thursday:TH ER1 Z D EY0|folks:F OW1 K S|good:G UH1 D|
  morning:M AO1 R N IH0 NG|finally:F AY1 N AX0 L IY0|letting:L EH1 DX IH0 NG|operator:AA1 P ER0 EY2 DX ER0|
  emergency:IH0 M ER1 JH AX0 N S IY0|channel:CH AE1 N AX0 L|signal:S IH1 G N AX0 L|antenna:AE0 N T EH1 N AX0|
  relay:R IY1 L EY0|hello:HH AX0 L OW1|okay:OW2 K EY1|ok:OW2 K EY1|yeah:Y AE1|yes:Y EH1 S|oh:OW1|uh:AH1|um:AH1 M|
  mister:M IH1 S T ER0|sir:S ER1|maam:M AE1 M|mom:M AA1 M|mother:M AH1 DH ER0|father:F AA1 DH ER0|house:HH AW1 S|
  home:HH OW1 M|road:R OW1 D|truck:T R AH1 K|tire:T AY1 ER0|help:HH EH1 L P|hurt:HH ER1 T|blood:B L AH1 D|cold:K OW1 L D|
  dark:D AA1 R K|light:L AY1 T|open:OW1 P AX0 N|keep:K IY1 P|voice:V OY1 S|wrong:R AO1 NG|right:R AY1 T|want:W AA1 N T|
  still:S T IH1 L|tapes:T EY1 P S|tape:T EY1 P|anymore:EH2 N IY0 M AO1 R|isn:IH1 Z AX0 N|child:CH AY1 L D|
  ahead:AX0 HH EH1 D|hollis:HH AA1 L IH0 S|coldwater:K OW1 L D W AO2 DX ER0|copy:K AA1 P IY0|over:OW1 V ER0|
  roger:R AA1 JH ER0|affirmative:AX0 F ER1 M AX0 T IH0 V|negative:N EH1 G AX0 T IH0 V|minutes:M IH1 N AX0 T S|
  minute:M IH1 N AX0 T|hour:AW1 ER0|hours:AW1 ER0 Z|tomorrow:T AX0 M AA1 R OW0|today:T AX0 D EY1|yesterday:Y EH1 S T ER0 D EY2|
  little:L IH1 DX AX0 L|pretty:P R IH1 DX IY0|better:B EH1 DX ER0|matter:M AE1 DX ER0|getting:G EH1 DX IH0 NG|
  sorry:S AA1 R IY0|really:R IH1 L IY0|already:AO0 L R EH1 D IY0|another:AX0 N AH1 DH ER0|other:AH1 DH ER0|
  together:T AX0 G EH1 DH ER0|family:F AE1 M AX0 L IY0|daddy:D AE1 D IY0|dad:D AE1 D|told:T OW1 L D|deer:D IH1 R|
  rolled:R OW1 L D|ditch:D IH1 CH|car:K AA1 R|hit:HH IH1 T|someone:S AH1 M W AH2 N|arrive:AX0 R AY1 V|make:M EY1 K|
  people:P IY1 P AX0 L|then:DH EH1 N|them:DH AX0 M|anything:EH1 N IY0 TH IH2 NG|noaa:N OW1 AX0|both:B OW1 TH|none:N AH1 N|going:G OW1 IH0 NG|whoever:HH UW0 EH1 V ER0|whatever:W AH0 T EH1 V ER0|bye:B AY1|goodbye:G UH0 D B AY1|nowhere:N OW1 W EH2 R|downstairs:D AW1 N S T EH1 R Z|upstairs:AH1 P S T EH1 R Z|office:AO1 F AX0 S|window:W IH1 N D OW0|remember:R IH0 M EH1 M B ER0|quiet:K W AY1 AX0 T|am:AE0 M|pm:P IY1 EH1 M|
  `;
    const LEX = Object.create(null);
    LEX_SRC.replace(/\s+/g, ' ').split('|').forEach((e) => {
      const i = e.indexOf(':');
      if (i > 0) LEX[e.slice(0, i).trim()] = e.slice(i + 1).trim();
    });
    const FUNC = new Set(('the a an and of to in on at is it its i im ive ill id you your youre youll youve he she we they them him his ' +
      'her me my our us be been was were are am do does did so if as by for with from that this than or but can will ' +
      'just up out there their then what when who how thats theres its whats hes shes weve well').split(' '));
    const LETTER = {
      a: 'EY1', b: 'B IY1', c: 'S IY1', d: 'D IY1', e: 'IY1', f: 'EH1 F', g: 'JH IY1', h: 'EY1 CH', i: 'AY1', j: 'JH EY1', k: 'K EY1',
      l: 'EH1 L', m: 'EH1 M', n: 'EH1 N', o: 'OW1', p: 'P IY1', q: 'K Y UW1', r: 'AA1 R', s: 'EH1 S', t: 'T IY1', u: 'Y UW1',
      v: 'V IY1', w: 'D AH1 B AX0 L Y UW0', x: 'EH1 K S', y: 'W AY1', z: 'Z IY1',
    };

    /* ---------------------------------------------------------------- spelling rules
     * [match, leftRe (tested on '#'+text before, anchored $), rightRe (on text after, anchored ^), phones]
     * First matching rule wins. '#' = word edge. A '1' digit in phones forces primary stress.
     */
    const C_ = '[^aeiouy#]';
    const re = (s) => (s == null ? null : new RegExp(s));
    const RULES_SRC = {
      a: [['ation', null, null, 'EY1 SH AX N'], ['arr', null, null, 'EH R'], ['anger', null, '^#', 'EY N JH ER'], ['air', null, null, 'EH R'], ['are', null, '^#', 'EH R'],
        ['ar', null, '^[aeiouy]', 'EH R'], ['ar', null, null, 'AA R'], ['ai', null, null, 'EY'], ['ay', null, null, 'EY'],
        ['au', null, null, 'AO'], ['aw', null, null, 'AO'], ['all', null, null, 'AO L'], ['alk', null, null, 'AO K'],
        ['alt', null, null, 'AO L T'], ['al', null, '^#', 'AX L'], ['ange', null, null, 'EY N JH'],
        ['a', 'w$', '^r', 'AO'], ['a', 'w$', '^(?!ck|g|x|y|ve|nk)', 'AA'], ['a', 'qu$', null, 'AA'],
        ['a', '^#$', '^[bcdglmnpstvw][aeiou][a-z]', 'AX'],
        ['a', null, '^' + C_ + 'le#', 'EY'], ['a', null, '^' + C_ + 'e#', 'EY'], ['a', null, '^' + C_ + 'e[sdr]#', 'EY'],
        ['a', null, '^' + C_ + '(ing|ed|er|es)#', 'EY'], ['a', null, '^' + C_ + 'e(ways|ly|ful|less|ness|ment)#', 'EY'],
        ['a', '[a-z]$', '^#', 'AX'], ['a', null, null, 'AE']],
      e: [['eigh', null, null, 'EY'], ['ear', null, '^(th|n|l)', 'ER'], ['ear', null, null, 'IH R'], ['eer', null, null, 'IH R'],
        ['ead', null, null, 'EH D'], ['eath', null, null, 'EH TH'], ['ea', null, null, 'IY'], ['ee', null, null, 'IY'],
        ['ei', null, null, 'EY'], ['ey', '^#[^aeiouy]+$', '^#', 'EY'], ['ey', null, '^#', 'IY'], ['ey', null, null, 'EY'], ['ew', null, null, 'UW'], ['eu', null, null, 'UW'],
        ['ere', null, '^#', 'IH R'], ['err', null, null, 'EH R'], ['er', null, '^[aeiouy]', 'EH R'], ['er', null, null, 'ER'],
        ['es', '(s|z|x|ch|sh|c|g)$', '^#', 'IH Z'], ['es', '[aeiouy][a-z]*[ptkf]$', '^#', 'S'], ['es', '[aeiouy][a-z]*[a-z]$', '^#', 'Z'],
        ['ed', '[aeiouy][a-z]*(t|d)$', '^#', 'IH D'], ['ed', '[aeiouy][a-z]*(p|k|s|x|sh|ch|f|c)$', '^#', 'T'],
        ['ed', '[aeiouy][a-z]*[a-z]$', '^#', 'D'],
        ['e', '[aeiouy][^aeiouy#]*[^aeiouy#]$', '^#', ''], ['e', '[aeiouy][^aeiouy#]*[^aeiouy#]$', '^(ways|ly|ful|less|ness|ment|s)#', ''],
        ['e', null, '^' + C_ + 'e#', 'IY'], ['e', '^#' + C_ + '*$', '^#', 'IY'], ['e', null, null, 'EH']],
      i: [['igh', null, null, 'AY'], ['ind', null, '^#', 'AY N D'], ['ild', null, '^#', 'AY L D'], ['ire', null, null, 'AY ER'],
        ['ir', null, '^[aeiouy]', 'IH R'], ['ir', null, null, 'ER'], ['ie', '^#[a-z]{1,2}$', '^[sd]?#', 'AY'], ['ie', null, null, 'IY'],
        ['i', null, '^' + C_ + 'e#', 'AY'], ['i', null, '^' + C_ + 'e[sdr]#', 'AY'], ['i', null, '^' + C_ + '(ing|ed|er|es)#', 'AY'],
        ['i', null, '^' + C_ + 'e(ways|ly|ful|less|ness|ment)#', 'AY'], ['i', null, '^(gn|ld|nd)#', 'AY'],
        ['i', null, '^[aou]', 'IY'], ['i', '[a-z]$', '^#', 'IY'], ['i', null, null, 'IH']],
      o: [['ough', null, '^t', 'AO'], ['ough', null, null, 'OW'], ['ould', null, null, 'UH D'], ['oor', null, null, 'AO R'],
        ['ook', null, null, 'UH K'], ['ood', null, null, 'UH D'], ['oo', null, null, 'UW'], ['our', null, '^#', 'AW ER'],
        ['our', null, null, 'AO R'], ['ous', null, '^#', 'AX S'], ['ouble', null, null, 'AH B AX L'], ['oung', null, null, 'AH NG'],
        ['ou', null, null, 'AW'], ['ow', '^#[nhcw]$', '^#', 'AW'], ['ow', null, '^(n#|d|l|er)', 'AW'], ['ow', null, null, 'OW'],
        ['oa', null, null, 'OW'], ['oing', null, null, 'OW IH NG'], ['oe', null, '^s?#', 'OW'], ['oi', null, null, 'OY'], ['oy', null, null, 'OY'],
        ['or', 'w$', '^' + C_, 'ER'], ['ore', null, '^#', 'AO R'], ['or', null, null, 'AO R'], ['old', null, null, 'OW L D'],
        ['oll', null, null, 'OW L'], ['ost', '[^lc]$', '^#', 'OW S T'], ['o', null, '^ther', 'AH'], ['o', null, '^ng', 'AO'],
        ['o', null, '^' + C_ + 'e#', 'OW'], ['o', null, '^' + C_ + 'e[sdr]#', 'OW'], ['o', null, '^' + C_ + '(ing|ed|er|es)#', 'OW'],
        ['o', null, '^' + C_ + 'e(ly|ful|less|ness|ment)#', 'OW'], ['o', '[^aeiouy]$', '^#', 'OW'],
        ['o', '^#' + C_ + '*$', '^' + C_ + '[aeiou][a-z]', 'OW'], ['o', null, null, 'AA']],
      u: [['ure', '[st]$', null, 'ER'], ['ure', null, null, 'Y UH R'], ['ur', null, null, 'ER'], ['ue', null, '^#', 'UW'],
        ['ui', null, null, 'UW'], ['ull', '[fpb]$', null, 'UH L'], ['ush', '[pb]$', null, 'UH SH'],
        ['u', '[rljsdtnz]$', '^' + C_ + 'e[sd]?#', 'UW'], ['u', null, '^' + C_ + 'e[sd]?#', 'Y UW'],
        ['u', '^#' + C_ + '*[rljsdtnz]$', '^' + C_ + '[aeiou][a-z]', 'UW'], ['u', '^#' + C_ + '*$', '^' + C_ + '[aeiou][a-z]', 'Y UW'],
        ['u', null, null, 'AH']],
      y: [['ye', '^#[^aeiouy]+$', '^#', 'AY'], ['y', '^#[^aeiouy]+$', '^ing#', 'AY'], ['y', '#$', '^[aeiou]', 'Y'], ['y', '[aeiou]$', '^[aeiou]', 'Y'], ['y', '^#[^aeiouy]+$', '^#', 'AY'], ['y', null, '^#', 'IY'],
        ['y', null, '^' + C_ + 'e#', 'AY'], ['y', null, null, 'IH']],
      b: [['bb', null, null, 'B'], ['b', 'm$', '^#', ''], ['b', null, null, 'B']],
      c: [['ch', null, '^r', 'K'], ['ch', null, null, 'CH'], ['ck', null, null, 'K'], ['cc', null, '^[eiy]', 'K S'],
        ['ci', null, '^[aou]', 'SH'], ['c', null, '^[eiy]', 'S'], ['c', null, null, 'K']],
      d: [['dge', null, null, 'JH'], ['dd', null, null, 'D'], ['d', null, null, 'D']],
      f: [['ff', null, null, 'F'], ['f', null, null, 'F']],
      g: [['gh', '#$', null, 'G'], ['gh', null, null, ''], ['gn', null, '^#', 'N'], ['gn', '#$', null, 'N'], ['gg', null, null, 'G'],
        ['ge', null, '^#', 'JH'], ['g', '#$', '^i', 'G'], ['g', null, '^[eiy]', 'JH'], ['g', null, null, 'G']],
      h: [['h', '#$', null, 'HH'], ['h', '[aeiouy]$', '^#', ''], ['h', null, '^[aeiouy]', 'HH'], ['h', null, null, '']],
      j: [['j', null, null, 'JH']],
      k: [['kn', '#$', null, 'N'], ['k', null, null, 'K']],
      l: [['le', '[^aeiouy#l]$', '^[sd]?#', 'AX L'], ['ll', null, null, 'L'], ['l', null, null, 'L']],
      m: [['mm', null, null, 'M'], ['m', null, null, 'M']],
      n: [['ng', null, '^e', 'N JH'], ['ng', null, null, 'NG'], ['nk', null, null, 'NG K'], ['nn', null, null, 'N'], ['n', null, null, 'N']],
      p: [['ph', null, null, 'F'], ['ps', '#$', null, 'S'], ['pp', null, null, 'P'], ['p', null, null, 'P']],
      q: [['qu', null, null, 'K W'], ['q', null, null, 'K']],
      r: [['rh', null, null, 'R'], ['rr', null, null, 'R'], ['r', null, null, 'R']],
      s: [['sh', null, null, 'SH'], ['ssion', null, null, 'SH AX N'], ['sion', '[aeiouy]$', null, 'ZH AX N'], ['sion', null, null, 'SH AX N'],
        ['sure', '[aeiouy]$', null, 'ZH ER'], ['sch', null, null, 'S K'], ['ss', null, null, 'S'], ['s', '[^#][aeiouy]$', '^[aeiouy]', 'Z'],
        ['s', '[^aeiouy][aiu]$', '^#', 'S'], ['s', '[bdgvlmnrwaeiouy]$', '^#', 'Z'], ['s', null, null, 'S']],
      t: [['tch', null, null, 'CH'], ['tion', null, null, 'SH AX N'], ['tial', null, null, 'SH AX L'], ['ture', null, null, 'CH ER'],
        ['th', null, '^er', 'DH'], ['th', null, null, 'TH'], ['tt', null, null, 'T'], ['t', null, null, 'T']],
      v: [['v', null, null, 'V']],
      w: [['wr', '#$', null, 'R'], ['wh', null, null, 'W'], ['w', null, null, 'W']],
      x: [['x', '#$', null, 'Z'], ['x', null, null, 'K S']],
      z: [['zz', null, null, 'Z'], ['z', null, null, 'Z']],
    };
    const RULES = {};
    for (const ch in RULES_SRC) RULES[ch] = RULES_SRC[ch].map(([m, l, r, p]) => ({ m, l: re(l), r: re(r), p }));

    function spellWord(word) {
      const w = '#' + word + '#';
      const out = [];
      let i = 1;
      while (i < w.length - 1) {
        const ch = w[i];
        const rs = RULES[ch];
        if (!rs) { i++; continue; }
        let done = false;
        for (const r of rs) {
          if (!w.startsWith(r.m, i)) continue;
          const left = w.slice(0, i), right = w.slice(i + r.m.length);
          if (r.l && !r.l.test(left)) continue;
          if (r.r && !r.r.test(right)) continue;
          if (r.p) out.push(...r.p.split(' '));
          i += r.m.length;
          done = true;
          break;
        }
        if (!done) i++;
      }
      return out;
    }
    const PREFIX = /^(a|be|de|re|con|com|ex|un|per|pro|sup|sub|pre|dis|mis|en|em|for|to)(?=[a-z]{3})/;
    const NOPREFIX = /^(after|any|every|area|able|real|radio|record|pro[bgs]|comp[au]|con[cs]|under|enter|even|ever|expert|end|ent|emp|emb|forest|form|tom|tor|tot|tow|dest|des[ik]|deb|dec[ae]|dem|den|dep|der|dev|ref|reg|rel[ae]|rep|res[cit]|ret|rev|pres[ei]|prev|per[ms]|sub[ju]|sup[pe]r)/;
    /** Letters → phones with stress digits. */
    function wordPhones(raw) {
      const w0 = String(raw).toLowerCase();
      const w = w0.replace(/[^a-z]/g, '');
      if (!w) return [];
      if (LEX[w]) return LEX[w].split(' ');
      // possessives / plurals / contractions of lexicon words
      if (/'s$/.test(w0) && LEX[w.slice(0, -1)]) return LEX[w.slice(0, -1)].split(' ').concat(/[PTKF]$|TH$/.test(LEX[w.slice(0, -1)]) ? ['S'] : ['Z']);
      if (/s$/.test(w) && LEX[w.slice(0, -1)]) { const b = LEX[w.slice(0, -1)]; return b.split(' ').concat(/(S|Z|SH|CH|JH)$/.test(b) ? ['IH0', 'Z'] : /[PTKF]$|TH$/.test(b) ? ['S'] : ['Z']); }
      if (/ing$/.test(w) && LEX[w.slice(0, -3)]) return LEX[w.slice(0, -3)].split(' ').concat(['IH0', 'NG']);
      if (/ly$/.test(w) && LEX[w.slice(0, -2)]) return LEX[w.slice(0, -2)].split(' ').concat(['L', 'IY0']);
      if (/nt$/.test(w) && /n't$/.test(w0) && LEX[w.slice(0, -2)]) return LEX[w.slice(0, -2)].split(' ').concat(['AX0', 'N', 'T']);
      let ph = spellWord(w);
      // stress: explicit '1' from a rule, else prefix / suffix heuristics, else first syllable
      const vi = [];
      ph.forEach((p, i) => { if (isV(p.replace(/\d/, ''))) vi.push(i); });
      if (!vi.length) return ph.length ? LETTERS(w) : [];
      const forced = ph.findIndex((p) => /1$/.test(p));
      ph = ph.map((p) => p.replace(/\d/, ''));
      let si = 0;
      if (forced >= 0) si = vi.indexOf(forced) >= 0 ? vi.indexOf(forced) : 0;
      else if (vi.length > 1) {
        if (ph[vi[0]] === 'AX' || (PREFIX.test(w) && !NOPREFIX.test(w))) si = 1;
        if (/(ic|ical|ity|ian|ial|ious|eous)$/.test(w)) si = Math.max(0, vi.length - (/(ical|ity|ian|ial)$/.test(w) ? 3 : 2));
        if (/(ee|eer|ese|oon|ique)$/.test(w)) si = vi.length - 1;
      }
      vi.forEach((idx, k) => {
        let p = ph[idx];
        let st = k === si ? 1 : 0;
        if (!st && /^(AY|EY|OW|AW|OY)$/.test(p) && k > si) st = 2;
        // unstressed full vowels reduce (schwa / r-coloured schwa); tense vowels and diphthongs keep quality
        if (!st && vi.length > 1) p = /^(AE|EH|AA|AO|AH|UH)$/.test(p) ? 'AX' : p === 'ER' ? 'AXR' : p;
        ph[idx] = p + st;
      });
      return ph;
    }
    function LETTERS(w) {
      const out = [];
      for (const ch of w) if (LETTER[ch]) out.push(...LETTER[ch].split(' '));
      return out;
    }

    /* ---------------------------------------------------------------- tokens */
    const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    /** 0..99 as words. */
    function num2(n) {
      if (n < 10) return DIGITS[n];
      if (n < 20) return TEENS[n - 10];
      return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + DIGITS[n % 10] : '');
    }
    /** Digits the way people say them: 9 → nine, 148 → one forty-eight, 1999 → nineteen ninety-nine. */
    function numWords(s) {
      s = String(s);
      if (s.length <= 2) return num2(+s);
      if (s.length === 3) return DIGITS[+s[0]] + ' ' + (s.slice(1) === '00' ? 'hundred' : s[1] === '0' ? 'oh ' + DIGITS[+s[2]] : num2(+s.slice(1)));
      if (s.length === 4 && s[0] !== '0') return num2(+s.slice(0, 2)) + ' ' + (s.slice(2) === '00' ? 'hundred' : s[2] === '0' ? 'oh ' + DIGITS[+s[3]] : num2(+s.slice(2)));
      return s.split('').map((d) => DIGITS[+d]).join(' ');
    }
    const PAUSE_CH = /[.,!?;:…-]/;
    function tokenize(text) {
      let s = String(text || '');
      s = s.replace(/\[[^\]]*\]/g, ' , ').replace(/\*[^*]*\*/g, ' , ').replace(/\([^)]*\)/g, ' , ');
      s = s.replace(/\{[A-Z_0-9+-]+\}/g, ' someone ');
      s = s.replace(/\b([aApP])\.\s?([mM])\./g, (m, a, b) => ' _' + a.toLowerCase() + ' _' + b.toLowerCase() + ' ');
      s = s.replace(/(\d+):(\d\d)/g, (m, h, mm) => ' ' + numWords(String(+h)) + ' ' + (mm === '00' ? "o'clock" : mm[0] === '0' ? 'oh ' + DIGITS[+mm[1]] : num2(+mm)) + ' ');
      s = s.replace(/(\d+)\.(\d+)/g, (m, a, b) => ' ' + numWords(a) + ' point ' + b.split('').map((d) => DIGITS[+d]).join(' ') + ' ');
      s = s.replace(/\d+/g, (m) => ' ' + numWords(m) + ' ');
      s = s.replace(/\.{2,}|…/g, ' … ').replace(/[—–]/g, ' - ').replace(/([A-Za-z])-(?=[A-Za-z])/g, '$1 ');
      const out = [];
      const rx = /(_?[A-Za-z']+)|(…)|([.,!?;:-])/g;
      let m;
      while ((m = rx.exec(s))) {
        if (m[1]) {
          let w = m[1];
          const spell = w[0] === '_' || (/^[A-Z]{2,4}$/.test(w) && !/[AEIOU]/.test(w)) || /^(CB|MM|FM|AM|PM|OK)$/.test(w);
          w = w.replace(/^_/, '');
          out.push({ w, spell });
        } else out.push({ p: m[2] || m[3] });
      }
      return out;
    }
    /** Text → words with phones, syllables and stress; punctuation → breaks. */
    function phonemize(text) {
      const toks = tokenize(text);
      const items = [];
      for (const tk of toks) {
        if (tk.p) { items.push({ brk: tk.p }); continue; }
        let lower = tk.w.toLowerCase().replace(/[^a-z']/g, '');
        const key = lower.replace(/'/g, '');
        let ph = tk.spell ? LETTERS(key).map((p) => (isV(p.replace(/\d/, '')) ? p : p)) : wordPhones(lower);
        if (!ph.length) continue;
        if (!ph.some((p) => /\d$/.test(p))) ph = ph.map((p) => (isV(p) ? p + '1' : p));
        const fn = FUNC.has(key) && !tk.spell;
        items.push({ word: key, ph, fn });
      }
      // "the" before a vowel → DH IY
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i], b = items[i + 1];
        if (a.word === 'the' && b.ph && isV(b.ph[0].replace(/\d/, ''))) a.ph = ['DH', 'IY0'];
      }
      return items;
    }

    /* ---------------------------------------------------------------- syllables */
    const ONSET2 = new Set(('P L|P R|B L|B R|F L|F R|K L|K R|G L|G R|T R|D R|TH R|T W|D W|K W|G W|S P|S T|S K|S M|S N|S L|S W|S F|' +
      'SH R|P Y|B Y|F Y|K Y|M Y|HH Y|V Y|TH W').split('|'));
    const ONSET3 = new Set('S P L|S P R|S T R|S K R|S K W|S K L|S P Y|S K Y'.split('|'));
    function syllabify(ph) {
      const base = ph.map((p) => p.replace(/\d/, ''));
      const vi = [];
      base.forEach((p, i) => { if (isV(p)) vi.push(i); });
      const syl = [];
      if (!vi.length) return [{ ph: base.slice(), st: 0, nuc: -1 }];
      let start = 0;
      for (let k = 0; k < vi.length; k++) {
        const v = vi[k];
        let end;
        if (k === vi.length - 1) end = base.length;
        else {
          const nv = vi[k + 1];
          const cons = base.slice(v + 1, nv);
          // maximal legal onset for the next syllable
          let on = 0;
          if (cons.length >= 3 && ONSET3.has(cons.slice(-3).join(' '))) on = 3;
          else if (cons.length >= 2 && ONSET2.has(cons.slice(-2).join(' '))) on = 2;
          else if (cons.length >= 1 && cons[cons.length - 1] !== 'NG') on = 1;
          end = nv - on;
        }
        const st = +((ph[v].match(/\d/) || ['0'])[0]);
        syl.push({ ph: base.slice(start, end), st, nuc: v - start });
        start = end;
      }
      return syl;
    }

    /* ================================================================ LF source table
     * Fant (1995) Rd parameterisation, normalised to T0 = 1 and Ee = 1:
     *   Ra = (−1 + 4.8 Rd)/100, Rk = (22.4 + 11.8 Rd)/100, Rg = Rk / (4 (0.11 Rd/(0.5 + 1.2 Rk) − Ra))
     *   tp = 1/(2 Rg), te = tp (1 + Rk), ta = Ra;  ε from ε ta = 1 − e^{−ε(1−te)};
     *   α from zero net flow over the period;  E0 = −1 / (e^{α te} sin(π te/tp)).
     */
    const LF_N = 256, LF_RD0 = 0.3, LF_RD1 = 2.7;
    const LF = (function () {
      const tab = [];
      for (let i = 0; i < LF_N; i++) {
        const Rd = LF_RD0 + ((LF_RD1 - LF_RD0) * i) / (LF_N - 1);
        const Ra = (-1 + 4.8 * Rd) / 100, Rk = (22.4 + 11.8 * Rd) / 100;
        const Rg = Rk / (4 * ((0.11 * Rd) / (0.5 + 1.2 * Rk) - Ra));
        const tp = 1 / (2 * Rg);
        let te = tp * (1 + Rk);
        const ta = Math.max(0.002, Ra);
        te = Math.min(te, 0.98 - ta);
        const tb = 1 - te;
        let eps = 1 / ta;
        for (let k = 0; k < 40; k++) {
          const f = eps * ta - 1 + Math.exp(-eps * tb);
          const fp = ta - tb * Math.exp(-eps * tb);
          const n2 = eps - f / fp;
          if (!isFinite(n2) || n2 <= 0) break;
          if (Math.abs(n2 - eps) < 1e-10) { eps = n2; break; }
          eps = n2;
        }
        const wg = Math.PI / tp;
        const ecl = Math.exp(-eps * tb);
        const A2 = -(1 / (eps * ta)) * ((1 - ecl) / eps - tb * ecl);
        const area = (al) => {
          const s = Math.sin(wg * te), c = Math.cos(wg * te), ea = Math.exp(al * te);
          const E0 = -1 / (ea * s);
          return (E0 * (ea * (al * s - wg * c) + wg)) / (al * al + wg * wg) + A2;
        };
        let lo = -40, hi = 80;
        let flo = area(lo);
        for (let k = 0; k < 90; k++) {
          const mid = 0.5 * (lo + hi), fm = area(mid);
          if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        const alpha = 0.5 * (lo + hi);
        const E0 = -1 / (Math.exp(alpha * te) * Math.sin(wg * te));
        tab.push({ Rd, te, tp, ta, eps, alpha, E0, wg, ecl });
      }
      return tab;
    })();
    function lfAt(rd) {
      const x = clamp((rd - LF_RD0) / (LF_RD1 - LF_RD0), 0, 1) * (LF_N - 1);
      return LF[Math.round(x)];
    }

    /* ================================================================ speaker model */
    const GDEF = {
      m: { pitch: 112, range: 0.2, fs: 1, rng: 1.0, creak: 0.45, bw: 1 },
      f: { pitch: 208, range: 0.28, fs: 1.16, rng: 1.15, creak: 0.2, bw: 1.2 },
      c: { pitch: 272, range: 0.32, fs: 1.3, rng: 1.3, creak: 0.08, bw: 1.35 },
      n: { pitch: 146, range: 0.13, fs: 1.07, rng: 0.9, creak: 0.35, bw: 1.1 },
    };
    /** A vp from a raw content.js voice def when audio.js is not around (mirrors voiceParams). */
    function params(src, id) {
      src = src || {};
      const g = GDEF[src.gender] ? src.gender : 'm';
      const d = GDEF[g];
      const fc = g === 'f' || g === 'c';
      const p = num(src.pitch, 0);
      const f = num(src.formant, 0);
      let age = num(src.age, 40);
      if (age > 0 && age <= 1) age *= 90;
      const old = Math.max(0, age - 58);
      const r = num(src.rate, 0);
      return {
        id: id || 'unknown', gender: g, pitch: p > 30 ? p : p > 0 ? (fc && p < 1.3 ? d.pitch * p : 112 * p) : d.pitch,
        rate: clamp((r > 4 ? r / 150 : r > 0 ? r : 1) * (old > 0 ? 1 - Math.min(0.12, old * 0.004) : 1), 0.55, 1.8),
        formant: f > 0.5 && f < 2 ? (fc && f < 1 ? d.fs * f : f) : d.fs,
        breathy: clamp(num(src.breathy, 0.2) + old * 0.004, 0, 1), rasp: clamp(num(src.rasp, 0.05), 0, 1), age,
        range: d.range * num(src.range, 1) * (old > 8 ? 0.8 : 1) * (src.synthetic ? 0.3 : 1), panic: num(src.panic, 0), synthetic: !!src.synthetic,
      };
    }
    /** Everything the renderer needs about a talker, derived from vp. */
    function speaker(vp) {
      const g = GDEF[vp.gender] ? vp.gender : 'm';
      const G = GDEF[g];
      const id = String(vp.id || '');
      const family = /^you|^phone$/.test(id) ? 'you' : id;
      const irng = seeded(hashStr('identity:' + family));
      const iq = () => irng() * 2 - 1;
      const age = num(vp.age, 40);
      const old = Math.max(0, age - 58);
      const breathy = clamp(num(vp.breathy, 0.2), 0, 1);
      const rasp = clamp(num(vp.rasp, 0.05), 0, 1);
      const synthetic = !!vp.synthetic;
      const wrong = synthetic && (rasp >= 0.3 || !!vp.wrong);
      let arousal = clamp(num(vp.panic, 0) + Math.max(0, num(vp.rate, 1) - 1.1) * 3 * (breathy > 0.25 ? 1 : 0.3), 0, 1);
      if (/panic/.test(id)) arousal = Math.max(arousal, 0.7);
      const S = {
        g, id, family, synthetic, wrong, arousal, old, breathy, rasp,
        pitch: num(vp.pitch, G.pitch) * (1 + arousal * 0.25),
        rate: clamp(num(vp.rate, 1), 0.5, 1.9),
        fs: clamp(num(vp.formant, G.fs), 0.7, 1.5),
        // × 0.8: lands phrase F0 movement on conversational norms (≈ 2.4 st SD, 6–9 st range); the
        // late-night DJ keeps a little more announcer lilt
        rangeMul: clamp(num(vp.range, G.range) / G.range, 0.15, 3) * G.rng * (1 + arousal * 0.35) * (id === 'dj' ? 0.92 : 0.8),
        // vocal-tract identity quirks (shared by a family): per-formant scale, F4/F5, bandwidths
        fq: [1 + 0.025 * iq(), 1 + 0.03 * iq(), 1 + 0.03 * iq()],
        F4: 3380 * (1 + 0.04 * iq()), F5: 3950 * (1 + 0.04 * iq()), F6: 4950, F7: 5900, F8: 7100, F9: 8200,
        bq: 1 + 0.12 * iq(),
        rdq: 0.08 * iq(),
        nasal: 0.08 + 0.06 * (irng()),
        bwMul: G.bw,
      };
      // source: Rd (voice quality), noise, perturbations (fractions)
      if (synthetic && !wrong) S.rangeMul = Math.max(S.rangeMul, 0.65);
      S.rd = clamp(0.9 + breathy * 1.25 + S.rdq + old * 0.006 - arousal * 0.12, 0.45, 2.4);
      S.aspN = synthetic ? (wrong ? 0.05 : 0.004) : 0.016 + breathy * 0.085 + old * 0.0012;
      // An old voice is breathy, not hissy: less of its breath noise, pulsed with the glottal
      // cycle (so it fuses with the voice instead of sitting on top as a flat hiss), rolled off
      // above ~1.7 kHz, and a duller top end overall (presbyphonia) — oldK 0..1 from age 58 to 75.
      S.oldK = synthetic ? 0 : clamp(old / 17, 0, 1);
      if (S.oldK > 0) {
        S.aspN *= 1 - 0.5 * S.oldK;
        S.aspClosed = 0.25 * (1 - 0.8 * S.oldK);
        S.aspFc = lerp(7000, 1450, S.oldK);
        S.hpcOld = 10 * S.oldK;
      }
      S.jit = synthetic ? 0.0003 : 0.0065 + rasp * 0.012 + old * 0.00025 + arousal * 0.003;
      S.shim = synthetic ? 0.004 : 0.011 + rasp * 0.04 + old * 0.001 + arousal * 0.008;
      S.flutter = synthetic ? 0.0005 : 0.008 + arousal * 0.006 + old * 0.0003;
      S.tremor = synthetic ? 0 : old * 0.0016;
      S.tremorHz = 4.8 + irng() * 0.8;
      S.shake = synthetic ? 0 : arousal * 0.012;
      S.creakP = synthetic ? 0 : clamp(G.creak + rasp * 0.35 + old * 0.008, 0, 0.9) * (S.pitch < 170 ? 1 : 0.4);
      S.dip = wrong ? 0.55 : rasp * 0.07 + old * 0.0015;      // diplophonia (alternate pulse depth)
      S.subP = wrong ? 0 : rasp * 0.25 + old * 0.004;          // chance of a rough (sub-harmonic) pulse pair
      S.dB1 = synthetic ? 10 : 25 + breathy * 130;               // open-phase F1 bandwidth increase
      S.breaths = !synthetic;
      S.bwMul *= synthetic && !wrong ? 0.8 : 1;
      return S;
    }

    /* ================================================================ planning */
    const PAUSE = { ',': 0.2, ';': 0.28, ':': 0.26, '-': 0.16, '.': 0.42, '?': 0.42, '!': 0.38, '…': 0.62 };
    const MAJOR = /[.?!…]/;

    /**
     * Plan an utterance: phones with times, prosody commands, events. Pure (seeded).
     * Returns {segs:[{p, c, t0, t1, ...}], phrases, accents, pcmds, end, S, …}
     */
    function plan(text, vp, dur, opts) {
      opts = opts || {};
      // emotional cues in the line itself: exclamations, self-interruptions, shouting
      const txt = String(text || '');
      const cue = Math.min(0.4, 0.2 * (txt.match(/!/g) || []).length) + Math.min(0.3, 0.15 * (txt.match(/[—–]|\s-\s|\w-(\s|$)/g) || []).length) +
        (/[A-Z]{3,}.*[A-Z]{3,}/.test(txt) && txt === txt.toUpperCase() ? 0.3 : 0);
      const S = speaker(vp.synthetic || !cue ? vp : Object.assign({}, vp, { panic: Math.min(1, num(vp.panic, 0) + cue) }));
      const seed = opts.seed != null ? opts.seed >>> 0 : hashStr(String(text) + '|' + S.id);
      const rng = seeded(seed);
      const gauss = gaussFn(rng);
      const rr = (a, b) => a + rng() * (b - a);
      dur = num(dur, lineDurFallback(text));
      const items = phonemize(text);
      // ---- words and phrases
      const words = [];
      const phrases = [];
      let ph = null;
      const newPhrase = () => { ph = { words: [], brk: null }; phrases.push(ph); };
      for (const it of items) {
        if (it.brk) {
          if (ph && ph.words.length) { ph.brk = it.brk; ph = null; }
          else if (phrases.length && !ph) { const last = phrases[phrases.length - 1]; if (MAJOR.test(it.brk) || !last.brk) last.brk = it.brk; }
          continue;
        }
        if (!ph) newPhrase();
        const w = { word: it.word, fn: it.fn, syl: syllabify(it.ph), phrase: phrases.length - 1 };
        if (!w.syl.length) continue;
        if (w.fn) w.syl.forEach((s) => { if (s.st === 1) s.st = 0; });
        ph.words.push(w);
        words.push(w);
      }
      if (!words.length) return { segs: [], phrases: [], end: 0.05, S, dur, accents: [], pcmds: [], events: [], seed };
      // split long phrases before conjunctions (breath groups)
      for (let i = 0; i < phrases.length; i++) {
        const P = phrases[i];
        if (P.words.length < 8) continue;
        for (let j = 4; j < P.words.length - 2; j++) {
          if (/^(and|but|then|so|because|if|when|or|until|while|before|after)$/.test(P.words[j].word)) {
            const rest = { words: P.words.slice(j), brk: P.brk };
            P.words = P.words.slice(0, j); P.brk = ',';
            P.soft = true;
            phrases.splice(i + 1, 0, rest);
            break;
          }
        }
      }
      phrases.forEach((P, pi) => { P.words.forEach((w) => { w.phrase = pi; }); if (!P.brk) P.brk = pi === phrases.length - 1 ? '.' : ','; });
      // sentence type per phrase (look ahead to the sentence-final mark), wh-questions fall
      {
        let start = 0;
        for (let i = 0; i < phrases.length; i++) {
          if (MAJOR.test(phrases[i].brk) || i === phrases.length - 1) {
            const term = MAJOR.test(phrases[i].brk) ? phrases[i].brk : '.';
            const first = phrases[start].words[0] ? phrases[start].words[0].word : '';
            for (let j = start; j <= i; j++) { phrases[j].sent = term; phrases[j].wh = /^(what|where|who|why|how|when|which|whose)$/.test(first); phrases[j].sStart = j === start; }
            start = i + 1;
          }
        }
      }
      // ---- prominence: content words carry accents; the last content word of a phrase is nuclear
      for (const P of phrases) {
        const cw = P.words.filter((w) => !w.fn);
        if (!cw.length && P.words.length) cw.push(P.words[P.words.length - 1]);
        cw.forEach((w, i) => {
          const nuclear = i === cw.length - 1;
          w.accent = nuclear || i === 0 || rng() < 0.62;
          w.nuclear = nuclear;
        });
        if (S.wrong) P.words.forEach((w) => { w.accent = w.fn || rng() < 0.3; w.nuclear = false; });
      }
      // ---- segments with Klatt-style duration rules
      const segs = [];
      let sylIndex = 0;
      const allSyl = [];
      for (const P of phrases) {
        P.words.forEach((w, wi) => {
          const lastWordInPhrase = wi === P.words.length - 1;
          w.syl.forEach((s, si) => {
            const finalSyl = lastWordInPhrase && si === w.syl.length - 1;
            const stressed = s.st > 0;
            const accented = w.accent && s.st === 1 || (w.accent && !w.syl.some((q) => q.st === 1) && si === 0);
            const sy = { w, P, si, idx: sylIndex++, stressed: stressed || (accented && S.wrong), accented, finalSyl, segs: [], wordFinal: si === w.syl.length - 1 };
            if (S.wrong) { sy.stressed = !stressed; }
            allSyl.push(sy);
            const nucP = s.ph[s.nuc];
            const coda = s.nuc >= 0 ? s.ph.slice(s.nuc + 1) : [];
            s.ph.forEach((p, k) => {
              const d = PH[p];
              if (!d) return;
              let pr = 1;
              let dmin = d.d[1], dinh = d.d[0];
              const isNuc = k === s.nuc;
              if (d.c === 'V') {
                if (!finalSyl) pr *= 0.62;
                if (si < w.syl.length - 1) pr *= 0.85;
                if (w.syl.length > 1) pr *= 0.85;
                if (!sy.stressed) { pr *= 0.72; dmin *= 0.5; }
                if (d.red) pr *= 0.8;
                const c0 = coda[0] && PH[coda[0]];
                if (c0) {
                  if (c0.c === 'N') pr *= 0.88;
                  else if ((c0.c === 'S' || c0.c === 'F' || c0.c === 'A') && !c0.v) pr *= finalSyl ? 0.72 : 0.86;
                  else if (c0.v && (c0.c === 'S' || c0.c === 'F')) pr *= finalSyl ? 1.15 : 1.02;
                }
                if (w.nuclear && sy.accented) pr *= 1.12;
                else if (sy.accented) pr *= 1.06;
                if (S.wrong) pr = finalSyl ? pr * 0.5 : pr * 1.2;
              } else {
                const inCluster = (k > 0 && !isV(s.ph[k - 1])) || (k < s.ph.length - 1 && !isV(s.ph[k + 1]));
                if (inCluster) pr *= 0.72;
                if (!(si === 0 && k < s.nuc)) pr *= 0.88;
                if (!sy.stressed) pr *= 0.75;
                if (finalSyl && k > s.nuc) pr *= 1.3;
              }
              segs.push({ p, d, c: d.c, dinh, dmin, pr, sy, isNuc, onset: k < s.nuc, coda: k > s.nuc, wordStart: si === 0 && k === 0, wordEnd: si === w.syl.length - 1 && k === s.ph.length - 1 });
              sy.segs.push(segs[segs.length - 1]);
            });
            if (s.nuc < 0 && nucP == null) { /* vowel-less word: keep consonants */ }
          });
        });
        segs.push({ pause: true, brk: P.brk, P, soft: !!P.soft });
      }
      while (segs.length && segs[segs.length - 1].pause) segs.pop();
      // flaps: T/D between a vowel (or R) and an unstressed vowel inside a word
      for (let i = 1; i < segs.length - 1; i++) {
        const s = segs[i];
        if (s.pause || (s.p !== 'T' && s.p !== 'D')) continue;
        const a = segs[i - 1], b = segs[i + 1];
        if (a.pause || b.pause || !b.isNuc || b.sy.stressed || b.sy.w !== s.sy.w) continue;
        if (a.c === 'V' || a.p === 'R') { s.p = 'DX'; s.d = PH.DX; s.c = 'X'; s.dinh = 28; s.dmin = 20; s.pr = 1; }
      }
      // ---- timing
      const tempoPhrase = phrases.map(() => Math.exp(gauss() * (S.synthetic ? 0.0 : 0.07)));
      const natDur = (s, speed) => {
        if (s.pause) return 0;
        const base = (s.dmin + (s.dinh - s.dmin) * s.pr) / 1000;
        return base / speed;
      };
      for (const s of segs) {
        if (s.pause) continue;
        const sd = S.synthetic ? 0 : s.c === 'V' ? (s.sy.stressed ? 0.1 : 0.13) : 0.09;
        s.jit = Math.exp(gauss() * sd);
      }
      // per-syllable tempo wobble shared by all its segments (rhythm, not white noise)
      for (const sy of allSyl) sy.tw = S.synthetic ? 1 : Math.exp(gauss() * 0.08);
      const pauseLen = (s) => {
        let L = PAUSE[s.brk] || 0.2;
        if (s.soft) L = 0.07;
        if (S.wrong) L *= 1.4;
        if (S.arousal > 0.3 && !MAJOR.test(s.brk)) L *= 0.7;
        return L * (S.synthetic ? 1 : rr(0.85, 1.2));
      };
      const lead0 = clamp(num(opts.lead, 0.05), 0.02, 0.3); // keyed radios: room for the key-up
      const tail0 = clamp(0.12 + dur * 0.02, 0.12, 0.25);
      const avail = dur - lead0 - tail0;
      const sumSpeech = (speed) => segs.reduce((a, s) => a + (s.pause ? 0 : natDur(s, speed) * s.jit * s.sy.tw * tempoPhrase[s.sy.w.phrase]), 0);
      let pauses = segs.filter((s) => s.pause).map(pauseLen);
      let pauseT = pauses.reduce((a, b) => a + b, 0);
      let speed = S.rate * (S.synthetic ? 0.95 : 1.0);
      let natural = sumSpeech(speed);
      let pauseScale = 1;
      if (natural + pauseT > avail) {
        // squeeze: pauses to ≥ 45 %, then speak faster (durations compress toward the minimum first)
        pauseScale = clamp((avail - natural) / Math.max(1e-3, pauseT), 0.45, 1);
        const pt = pauseT * pauseScale;
        let lo = speed, hi = speed * 3;
        for (let k = 0; k < 30; k++) {
          const mid = 0.5 * (lo + hi);
          if (sumSpeech(mid) + pt > avail) lo = mid; else hi = mid;
        }
        speed = hi;
      } else {
        // leisurely: slow down up to 10 %, stretch pauses up to ×1.8, rest becomes trailing silence
        const slack = avail - natural - pauseT;
        const slow = Math.min(0.1, slack / Math.max(0.5, natural) * 0.5);
        speed /= 1 + slow;
        natural = sumSpeech(speed);
        // a short line with time to spare must not gabble ("Anybody?" came out at 7 syl/s): cap the
        // syllable rate (~5.2/s calm, up to ~5.8/s agitated) as far as the budget allows
        const nSyl = allSyl.length, maxRate = S.synthetic ? 6 : 5.2 + 0.6 * Math.min(1, Math.max(0, S.arousal || 0));
        if (nSyl >= 3 && natural > 0 && nSyl / natural > maxRate) {
          const want = Math.min(nSyl / maxRate, avail - pauseT);
          if (want > natural) { speed *= natural / want; natural = sumSpeech(speed); }
        }
        const left = avail - natural - pauseT;
        if (pauseT > 0 && left > 0) pauseScale = 1 + Math.min(0.8, (left * 0.45) / pauseT);
      }
      // a breath before long lines when there is room
      const wordsN = words.length;
      let t = lead0;
      const events = [];
      const leftover = avail - sumSpeech(speed) - pauseT * pauseScale;
      if (S.breaths && wordsN >= 4 && leftover > 0.18) {
        const bd = Math.min(0.32 + S.arousal * 0.1, leftover * 0.8);
        events.push({ k: 'breath', t0: 0.02, t1: 0.02 + bd, a: 0.5 + S.arousal * 0.5 + S.old * 0.01 });
        t = 0.02 + bd + 0.04;
      }
      let pi = 0;
      for (const s of segs) {
        if (s.pause) {
          const L = pauses[pi++] * pauseScale;
          s.t0 = t; s.t1 = t + L;
          if (S.breaths && L >= 0.3 && !s.soft) events.push({ k: 'breath', t0: t + L * 0.25, t1: t + L * 0.92, a: (0.25 + S.arousal * 0.6 + S.old * 0.01) * (MAJOR.test(s.brk) ? 1 : 0.6) });
          t += L;
          continue;
        }
        const D = natDur(s, speed) * s.jit * s.sy.tw * tempoPhrase[s.sy.w.phrase];
        s.t0 = t; s.t1 = t + Math.max(0.012, D);
        t = s.t1;
      }
      const end = Math.min(t, dur - 0.1);
      // ---- syllable timing summary
      for (const sy of allSyl) {
        sy.t0 = sy.segs[0].t0; sy.t1 = sy.segs[sy.segs.length - 1].t1;
        const n = sy.segs.find((q) => q.isNuc);
        sy.v0 = n ? n.t0 : sy.t0; sy.v1 = n ? n.t1 : sy.t1; sy.nuc = n || null;
      }
      // ---- Fujisaki commands (ln F0)
      const pcmds = [], accents = [];
      const R = S.rangeMul;
      const mach = S.synthetic && !S.wrong;
      for (let i = 0; i < phrases.length; i++) {
        const P = phrases[i];
        const syls = allSyl.filter((sy) => sy.P === P);
        if (!syls.length) continue;
        P.t0 = syls[0].t0; P.t1 = syls[syls.length - 1].t1;
        const Ap = (P.sStart ? 0.3 : 0.16) * R * (mach ? 0.8 : rr(0.85, 1.15));
        pcmds.push({ T0: P.t0 - 0.18, Ap });
        const acc = syls.filter((sy) => sy.accented && sy.nuc);
        let down = 1;
        acc.forEach((sy, j) => {
          const nuclear = sy.w.nuclear && j === acc.length - 1;
          let Aa = (j === 0 ? 0.36 : 0.3) * down * R * (mach ? 0.6 : rr(0.75, 1.25));
          if (P.sent === '!') Aa *= 1.35;
          // H* peak lands near the end of the stressed vowel; the bump then decays over what follows
          let T1 = sy.t0 - 0.03 + (mach ? 0 : rr(-0.02, 0.02));
          let T2 = Math.max(T1 + 0.1, Math.min(sy.v1 + 0.02, T1 + 0.24)) + (mach ? 0 : rr(-0.015, 0.03));
          if (nuclear) {
            if (P.brk === '?' && !P.wh) { Aa *= 0.5; T2 = sy.v0 + (sy.v1 - sy.v0) * 0.4; }
            else if (MAJOR.test(P.brk)) { Aa *= 1.15; T2 = Math.min(T2, sy.v0 + (sy.v1 - sy.v0) * 0.55); T1 -= 0.03; }
          }
          // some accents are scooped (L+H*): a small dip just before the rise
          if (!mach && j > 0 && rng() < 0.35) accents.push({ T1: T1 - 0.1, T2: T1 - 0.01, Aa: -0.07 * R, sy: sy.idx });
          accents.push({ T1, T2, Aa, sy: sy.idx });
          down *= mach ? 0.95 : rr(0.72, 0.9);
        });
        // boundary tones
        const last = syls[syls.length - 1];
        const lv0 = last.v0, lv1 = last.v1;
        if (P.brk === '?' && !P.wh) accents.push({ T1: lv0 + (lv1 - lv0) * 0.2, T2: lv1 + 0.15, Aa: 0.5 * R * (S.wrong ? -1 : 1), bt: 1 });
        else if (MAJOR.test(P.brk)) accents.push({ T1: lv0 - 0.02, T2: P.t1 + 0.3, Aa: -0.2 * R * (P.brk === '…' ? 1.3 : 1) * (S.wrong ? -1.2 : 1), bt: 1 });
        else if (P.brk === '-') P.cut = true; // self-interruption: the word just stops (see tracks)
        else accents.push({ T1: lv0 + (lv1 - lv0) * 0.35, T2: lv1 + 0.06, Aa: (P.soft ? 0.08 : 0.16) * R * (S.wrong ? -1 : 1), bt: 1 });
        P.last = last;
      }
      if (opts.sustain) {
        // dev: one steady vowel (measuring the source like a clinician's sustained /a/)
        const v = segs.find((q) => !q.pause && q.c === 'V');
        if (v) {
          segs.length = 0; segs.push(v); v.t0 = 0.1; v.t1 = dur - 0.15;
          v.sy.t0 = v.sy.v0 = v.t0; v.sy.t1 = v.sy.v1 = v.t1; v.sy.finalSyl = false; v.sy.accented = false; v.sy.stressed = true;
          phrases.length = 1; phrases[0].t0 = v.t0; phrases[0].t1 = v.t1; phrases[0].brk = ','; phrases[0].last = null;
          pcmds.length = 0; accents.length = 0; events.length = 0;
          return { segs, phrases, allSyl: [v.sy], pcmds, accents, events, end: v.t1, S, dur, seed, speed, lnFb: Math.log(S.pitch), sustain: true };
        }
      }
      return { segs, phrases, allSyl, pcmds, accents, events, end, S, dur, seed, speed, lnFb: Math.log(S.pitch * (mach ? 0.84 : 0.74)) };
    }

    /* ================================================================ parameter tracks */
    const HOP = 32; // samples per control frame (≈1.45 ms at 22.05 kHz)
    function smoothTV(x, tauArr, frameSec) {
      // zero-phase (forward + backward) one-pole smoothing with a per-frame time constant
      const n = x.length;
      let y = x[0];
      for (let i = 0; i < n; i++) { const a = frameSec / (Math.max(1e-4, tauArr[i]) + 0.5 * frameSec); y += a * (x[i] - y); x[i] = y; }
      y = x[n - 1];
      for (let i = n - 1; i >= 0; i--) { const a = frameSec / (Math.max(1e-4, tauArr[i]) + 0.5 * frameSec); y += a * (x[i] - y); x[i] = y; }
    }
    function smoothC(x, tau, frameSec) {
      const n = x.length, a = 1 - Math.exp(-frameSec / tau);
      let y = x[0];
      for (let i = 0; i < n; i++) { y += a * (x[i] - y); x[i] = y; }
      y = x[n - 1];
      for (let i = n - 1; i >= 0; i--) { y += a * (x[i] - y); x[i] = y; }
    }

    function tracks(P, sr, nSamp) {
      const S = P.S;
      const NF = Math.ceil(nSamp / HOP) + 2;
      const fsec = HOP / sr;
      const rng = seeded(P.seed ^ 0x9e3779b9);
      const gauss = gaussFn(rng);
      const T = {
        NF, fsec,
        F: [new Float32Array(NF), new Float32Array(NF), new Float32Array(NF)],
        B: [new Float32Array(NF), new Float32Array(NF), new Float32Array(NF)],
        AV: new Float32Array(NF), AH: new Float32Array(NF), AF: new Float32Array(NF), AB: new Float32Array(NF),
        FNZ: new Float32Array(NF), BNZ: new Float32Array(NF), NAS: new Float32Array(NF),
        lnF0: new Float32Array(NF), RD: new Float32Array(NF), CR: new Float32Array(NF), VF: new Float32Array(NF),
        shape: new Int16Array(NF), shapes: [], BR: new Float32Array(NF),
      };
      const tauF = [new Float32Array(NF), new Float32Array(NF), new Float32Array(NF)];
      const tauA = new Float32Array(NF);
      const fr = (t) => clamp(Math.round(t / fsec), 0, NF - 1);
      const fs = S.fs;
      const scaleF = (F, k) => F * fs * S.fq[k];
      const SCH = PH.AX.F;
      // defaults (silence): schwa-ish formants
      for (let k = 0; k < 3; k++) { T.F[k].fill(scaleF(SCH[k], k)); tauF[k].fill(0.03); }
      tauA.fill(0.008);
      T.RD.fill(S.rd);
      T.FNZ.fill(0); T.shape.fill(-1);
      const shapeOf = (key, place, vowelF) => {
        const src = FRIC[place] || FRIC.alv;
        let r = src.r;
        if (place === 'vel' && vowelF) r = [[vowelF[1] * 1.08, 350, 0], [vowelF[2] * 1.02, 500, -6], [4100 * fs, 1100, -16]];
        const sc = Math.sqrt(fs);
        const sh = { key, r: r.map(([f, bw, g]) => [Math.min(f * (place === 'vel' ? 1 : sc), sr * 0.45), bw * sc, dB(g)]), ab: dB(src.ab) };
        T.shapes.push(sh);
        return T.shapes.length - 1;
      };
      const segs = P.segs;
      // neighbour vowel targets for consonant loci
      const vowelTarget = (s) => {
        const d = s.d;
        let F = d.F.slice();
        if (!s.sy.stressed) { const k = d.red ? 0 : 0.32; for (let q = 0; q < 3; q++) F[q] = lerp(F[q], SCH[q], k); }
        return F;
      };
      const nearV = (i, dir) => {
        for (let j = i + dir; j >= 0 && j < segs.length; j += dir) { const q = segs[j]; if (q.pause) return null; if (q.c === 'V') return vowelTarget(q); }
        return null;
      };
      const paint = (arr, a, b, v) => { for (let i = fr(a); i < fr(b); i++) arr[i] = v; };
      const paintMax = (arr, a, b, v) => { for (let i = fr(a); i < fr(b); i++) arr[i] = Math.max(arr[i], v); };
      // ---- amplitude baseline per syllable: stress, declination, phrase-final
      const phraseDecl = (s) => {
        const Pp = s.sy.P;
        const x = clamp((s.t0 - Pp.t0) / Math.max(0.2, Pp.t1 - Pp.t0), 0, 1);
        return -3.5 * x;
      };
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.pause) continue;
        const d = s.d, a = s.t0, b = s.t1, sy = s.sy;
        let lvl = (sy.stressed ? 0 : -3) + (sy.accented ? 1.5 : 0) + phraseDecl(s) + (sy.finalSyl && MAJOR.test(sy.P.brk) ? -2.5 : 0);
        if (S.wrong) lvl = -3 + 5 * ((s.t0 - sy.t0) / Math.max(0.05, sy.t1 - sy.t0)); // words swell
        const prevV = nearV(i, -1), nextV = nearV(i, 1);
        const neigh = s.onset ? nextV || prevV : prevV || nextV;
        let F;
        const tau = [0.02, 0.026, 0.028];
        if (d.c === 'V') {
          F = vowelTarget(s);
          const avL = dB(lvl + d.av);
          {
            const nx = segs[i + 1];
            const endsVoiceless = !nx || nx.pause || ((nx.c === 'S' || nx.c === 'F' || nx.c === 'A' || nx.c === 'H') && !nx.d.v);
            const dec = 1 - dB(-(endsVoiceless ? 5 : 2.5) - (sy.finalSyl ? 2 : 0));
            const i0 = fr(a), i1 = Math.max(i0 + 1, fr(b));
            const pk = S.wrong ? 0.95 : 0.3 + rng() * 0.15;
            for (let fi = i0; fi < i1; fi++) {
              const x = (fi - i0) / (i1 - i0);
              const e = x < pk ? 0.72 + 0.28 * Math.sin((Math.PI / 2) * (x / pk)) : 1 - dec * ((x - pk) / (1 - pk));
              T.AV[fi] = avL * e;
            }
          }
          let F2 = d.F2 ? d.F2.slice() : null;
          if (F2 && !sy.stressed) for (let q = 0; q < 3; q++) F2[q] = lerp(F2[q], SCH[q], 0.25);
          // per-syllable articulatory drift
          const drift = S.synthetic ? 1 : 1 + gauss() * 0.025;
          const vd = S.synthetic ? [0, 0, 0] : [gauss() * 0.05, gauss() * 0.05, gauss() * 0.025];
          if (F2) {
            const m = a + (b - a) * 0.35;
            for (let q = 0; q < 3; q++) { paint(T.F[q], a, m, scaleF(F[q] * drift, q)); }
            const n0 = fr(m), n1 = fr(a + (b - a) * 0.9);
            for (let fi = n0; fi < fr(b); fi++) {
              const x = clamp((fi - n0) / Math.max(1, n1 - n0), 0, 1);
              for (let q = 0; q < 3; q++) T.F[q][fi] = scaleF(lerp(F[q], F2[q], x) * drift, q);
            }
          } else {
            const i0 = fr(a), i1 = Math.max(i0 + 1, fr(b));
            for (let fi = i0; fi < i1; fi++) { const x = (fi - i0) / (i1 - i0) - 0.3; for (let q = 0; q < 3; q++) T.F[q][fi] = scaleF(F[q] * drift * (1 + vd[q] * x), q); }
          }
          for (let q = 0; q < 3; q++) paint(tauF[q], a, b, (S.synthetic ? 0.8 : 1) * [0.02, 0.028, 0.03][q]);
          paint(T.B[0], a, b, 70 + (d.lo ? 15 : 0)); paint(T.B[1], a, b, 90); paint(T.B[2], a, b, 150);
          paint(tauA, a, b, 0.008);
          // phrase-final vowels of statements: breathier offset; stressed: more effort
          const rdv = S.rd + (sy.accented ? -0.18 : sy.stressed ? -0.06 : 0.12) + (sy.finalSyl ? 0.25 : 0) + (S.synthetic ? 0 : gauss() * 0.06);
          paint(T.RD, a, b, rdv);
          continue;
        }
        // consonants: locus + coarticulation toward the neighbouring vowel
        const V0 = neigh || SCH;
        if (d.F) F = d.F.map((f, q) => lerp(f, V0[q], COART[d.c] || 0.2));
        else if (d.pl === 'glo') F = V0.slice();
        else {
          let L = LOCUS[d.pl];
          if (!L) L = [240, clamp(V0[1] + (V0[1] > 1500 ? 250 : 350), 1500, 2400), clamp(V0[1] + 700, 2300, 3000)]; // velar pinch
          F = L.map((f, q) => lerp(f, V0[q], (COART[d.c] || 0.4) * (q === 0 ? 0.3 : 1)));
        }
        for (let q = 0; q < 3; q++) paint(T.F[q], a, b, scaleF(F[q], q));
        const cB = d.c === 'N' ? [110, 170, 220] : d.c === 'L' || d.c === 'G' ? [80, 110, 170] : [160, 200, 260];
        for (let q = 0; q < 3; q++) paint(T.B[q], a, b, cB[q]);
        const fast = d.c === 'S' || d.c === 'A' || d.c === 'N' || d.c === 'X' || d.c === 'Q';
        paint(tauF[0], a, b, fast ? 0.006 : d.c === 'F' ? 0.01 : 0.02);
        paint(tauF[1], a, b, fast ? 0.013 : d.c === 'F' ? 0.015 : 0.03);
        paint(tauF[2], a, b, fast ? 0.014 : 0.03);
        const base = dB(lvl);
        switch (d.c) {
          case 'L': case 'G':
            paint(T.AV, a, b, base * dB(d.c === 'G' ? -4 : -3));
            paint(tauA, a, b, 0.012);
            break;
          case 'N': {
            paint(T.AV, a, b, base * dB(-7));
            paint(T.F[0], a, b, 260 * Math.sqrt(fs));
            paint(T.FNZ, a, b, (d.pl === 'lab' ? 1050 : d.pl === 'alv' ? 1650 : 2600) * fs);
            paint(T.NAS, a, b, 1);
            paint(tauA, a, b, 0.006);
            // nasalise the neighbouring vowels a little (anticipatory more than carry-over)
            const pv = segs[i - 1], nv = segs[i + 1];
            if (pv && !pv.pause && pv.c === 'V') paintMax(T.NAS, pv.t0 + (pv.t1 - pv.t0) * 0.45, pv.t1, 0.55);
            if (nv && !nv.pause && nv.c === 'V') paintMax(T.NAS, nv.t0, nv.t0 + (nv.t1 - nv.t0) * 0.25, 0.4);
            break;
          }
          case 'F': {
            const sid = shapeOf(s.p, d.pl);
            const fl = FRIC[d.pl].lvl + (d.v ? -5 : 0) + (sy.stressed ? 0 : -2);
            const ta = a + Math.min(0.015, (b - a) * 0.25), tb = b - Math.min(0.012, (b - a) * 0.2);
            paint(T.AF, ta, tb, dB(fl));
            paint(T.shape, a - 0.01, b + 0.02, sid);
            paint(T.AV, a, b, d.v ? base * dB(-12) : 0);
            if (d.v) paint(T.VF, a, b, 1);
            paint(tauA, a, b, 0.006);
            paint(tauA, a - 0.01, a + 0.02, d.v ? 0.008 : 0.013);
            break;
          }
          case 'H': {
            paint(T.AH, a, b, base * dB(-5));
            const between = segs[i - 1] && !segs[i - 1].pause && segs[i - 1].c === 'V';
            paint(T.AV, a, b, between ? base * dB(-14) : 0);
            for (let q = 0; q < 3; q++) paint(T.B[q], a, b, [180, 200, 260][q]);
            paint(tauA, a, b, 0.01);
            break;
          }
          case 'S': case 'A': {
            const next = segs[i + 1];
            const nextIsV = next && !next.pause && (next.c === 'V' || next.c === 'L' || next.c === 'G');
            const beforePause = !next || next.pause;
            const unreleased = next && !next.pause && (next.c === 'S' || next.c === 'N' || next.c === 'A');
            const closEnd = d.c === 'A' ? a + (b - a) * 0.5 : b;
            paint(T.AV, a, closEnd, d.v ? base * dB(-20) : 0);
            paint(T.F[0], a, closEnd, 200 * Math.sqrt(fs));
            paint(tauA, a - 0.004, a + 0.02, 0.011);
            paint(tauA, closEnd - 0.006, closEnd + 0.006, 0.002);
            if (d.v) paint(T.VF, a, closEnd, 0.6);
            const vel = d.pl === 'vel' ? nearV(i, 1) || nearV(i, -1) || SCH : null;
            const sid = shapeOf(s.p, d.c === 'A' ? 'pal' : d.pl, vel && vel.map((f, q) => f * fs * S.fq[q]));
            if (!unreleased) {
              const bl = BURST[s.p] + (beforePause ? -7 : 0) + (sy.stressed ? 0 : -3);
              T.shapes[sid].burst = true;
              P.events.push({ k: 'burst', t: closEnd, a: dB(bl), dec: d.pl === 'vel' ? 0.011 : d.pl === 'alv' ? 0.007 : 0.004, shape: sid });
              paint(T.shape, closEnd - 0.003, closEnd + 0.03, sid);
              if (d.c === 'A') {
                paint(T.AF, closEnd, b, dB(FRIC.pal.lvl + (d.v ? -6 : 0)));
                paint(T.shape, closEnd, b + 0.02, sid);
                paint(T.AV, closEnd, b, d.v ? base * dB(-12) : 0);
              }
              // aspiration (VOT) into the next vowel
              if (!d.v && nextIsV && d.c === 'S') {
                const afterS = segs[i - 1] && segs[i - 1].p === 'S' && segs[i - 1].sy === sy;
                const vot = afterS ? 0.012 : next.sy.stressed ? 0.05 + (d.pl === 'vel' ? 0.015 : 0) : 0.028;
                const n1 = Math.min(next.t1 - 0.02, b + vot);
                paint(T.AH, b, n1, base * dB(-7));
                paint(T.AV, b, n1, 0);
                next.votEnd = n1;
              } else if (d.v && nextIsV) {
                next.votEnd = b + 0.008;
              }
            }
            break;
          }
          case 'X':
            paint(T.AV, a, b, base * dB(-7));
            paint(T.F[0], a, b, 320 * Math.sqrt(fs));
            paint(tauA, a, b, 0.004);
            break;
          case 'Q':
            paint(T.AV, a, b, 0);
            paint(T.CR, a - 0.04, b + 0.03, 1);
            break;
        }
        if (d.c !== 'V') paint(T.RD, a, b, S.rd + 0.1);
      }
      // vowels after a voiceless stop: voicing starts at votEnd
      for (const s of segs) if (!s.pause && s.c === 'V' && s.votEnd && s.votEnd > s.t0) { if (T.AH[fr(s.t0)] > 0) paint(T.AV, s.t0, s.votEnd, 0); }
      // ---- phrase edges: breathy onsets / hard attacks, breathy offsets
      for (const Pp of P.phrases) {
        if (Pp.t0 == null) continue;
        const first = P.segs.find((s) => !s.pause && s.sy.P === Pp);
        if (first && first.c === 'V' && !S.synthetic) {
          if (rng() < (S.pitch < 150 ? 0.4 : 0.15)) paint(T.CR, first.t0 - 0.01, first.t0 + 0.035, 0.8);
          else paint(T.AH, first.t0 - 0.03, first.t0 + 0.02, dB(-16));
        }
        if (Pp.cut) {
          // cut-off: voicing stops dead on a glottal stop (a creaky pulse or two), no breathy tail
          paint(tauA, Pp.t1 - 0.02, Pp.t1 + 0.02, 0.002);
          paintMax(T.CR, Pp.t1 - 0.03, Pp.t1, 0.9);
          continue;
        }
        if (!S.synthetic) {
          // offset: aspiration tail after the last voiced frame
          paint(T.AH, Pp.t1, Pp.t1 + 0.06 + S.breathy * 0.05, dB(-24 + S.breathy * 8));
          paint(tauA, Pp.t1 - 0.03, Pp.t1 + 0.1, 0.018);
        }
        // creak at the end of declaratives (low voices; probability by speaker)
        if (MAJOR.test(Pp.brk) && Pp.brk !== '?' && rng() < S.creakP && Pp.last && Pp.last.nuc) {
          const v = Pp.last.nuc;
          const c0 = Math.max(v.t0 + (v.t1 - v.t0) * 0.6, v.t1 - 0.11);
          paintMax(T.CR, c0, Pp.t1 + 0.02, 0.75 + 0.25 * rng());
        } else if (!MAJOR.test(Pp.brk) && S.pitch < 150 && rng() < S.creakP * 0.25 && Pp.last && Pp.last.nuc) {
          const v = Pp.last.nuc;
          paintMax(T.CR, v.t0 + (v.t1 - v.t0) * 0.7, v.t1, 0.7);
        }
      }
      // ---- F4..F6 fixed per speaker; bandwidth scaling
      for (let q = 0; q < 3; q++) { for (let i = 0; i < NF; i++) { if (!T.B[q][i]) T.B[q][i] = [80, 100, 160][q]; T.B[q][i] *= S.bwMul * S.bq; } }
      // ---- smoothing (coarticulation / undershoot)
      for (let q = 0; q < 3; q++) smoothTV(T.F[q], tauF[q], fsec);
      for (let q = 0; q < 3; q++) smoothC(T.B[q], 0.01, fsec);
      smoothTV(T.AV, tauA, fsec);
      smoothTV(T.AH, tauA, fsec);
      smoothC(T.AF, 0.005, fsec);
      smoothC(T.NAS, 0.012, fsec);
      smoothC(T.RD, 0.03, fsec);
      smoothC(T.CR, 0.012, fsec);
      smoothC(T.VF, 0.008, fsec);
      // nasal zero: pole-zero pair cancels outside nasal segments (FNZ = FNP)
      const FNP = 270 * Math.sqrt(fs);
      T.FNP = FNP;
      for (let i = 0; i < NF; i++) {
        const n = T.NAS[i];
        const murmur = T.FNZ[i];
        // vowels: zero moves from the pole (cancel) to ≈ 450 Hz with nasal coupling
        const vz = FNP + (450 * Math.sqrt(fs) - FNP) * Math.max(0, n * 0.9 + S.nasal * 0.5);
        T.FNZ[i] = murmur > 0 ? murmur : vz;
        T.BNZ[i] = murmur > 0 ? 300 : 100;
      }
      smoothC(T.FNZ, 0.008, fsec);
      // ---- bursts and breath events
      for (const e of P.events) {
        if (e.k === 'burst') {
          const f0i = fr(e.t);
          for (let i = f0i; i < NF && i < f0i + 40; i++) {
            const tt = (i - f0i) * fsec;
            T.AB[i] = Math.max(T.AB[i], e.a * Math.exp(-tt / e.dec));
          }
        } else if (e.k === 'breath') {
          const i0 = fr(e.t0), i1 = fr(e.t1);
          for (let i = i0; i < i1; i++) {
            const x = (i - i0) / Math.max(1, i1 - i0);
            T.BR[i] = Math.max(T.BR[i], e.a * Math.sin(Math.PI * Math.pow(x, 0.7)) ** 1.5);
          }
        }
      }
      // ---- F0: Fujisaki phrase + accent components, micro-prosody
      const aP = S.g === 'm' || S.g === 'n' ? 2.2 : 2.8, bA = 28, gam = 0.9;
      const Gp = (t) => (t <= 0 ? 0 : aP * aP * t * Math.exp(-aP * t));
      const Ga = (t) => (t <= 0 ? 0 : Math.min(1 - (1 + bA * t) * Math.exp(-bA * t), gam));
      const lnFb = P.lnFb;
      for (let i = 0; i < NF; i++) {
        const t = i * fsec;
        let v = lnFb;
        for (let k = 0; k < P.pcmds.length; k++) { const c = P.pcmds[k]; v += c.Ap * Gp(t - c.T0); }
        T.lnF0[i] = v;
      }
      for (let k = 0; k < P.accents.length; k++) {
        const c = P.accents[k];
        const i1 = Math.min(NF, Math.ceil((c.T2 + 0.35) / fsec));
        for (let i = Math.max(0, Math.floor(c.T1 / fsec)); i < i1; i++) { const t = i * fsec; T.lnF0[i] += c.Aa * (Ga(t - c.T1) - Ga(t - c.T2)); }
      }
      // micro-prosody: onset perturbation after obstruents, intrinsic vowel F0, per-syllable jitter
      if (!S.synthetic || S.wrong) {
        for (let i = 1; i < segs.length; i++) {
          const s = segs[i], p = segs[i - 1];
          if (s.pause || p.pause || s.c !== 'V') continue;
          let dv = 0;
          if (p.c === 'S' || p.c === 'F' || p.c === 'A' || p.c === 'H') dv = p.d.v ? -0.035 : 0.055;
          const i0 = fr(s.votEnd || s.t0);
          for (let k = i0; k < fr(s.t1); k++) T.lnF0[k] += dv * Math.exp(-(k - i0) * fsec / 0.04);
        }
        for (const s of segs) {
          if (s.pause || s.c !== 'V') continue;
          const intr = s.d.hi ? 0.03 : s.d.lo ? -0.02 : 0;
          const sj = gauss() * 0.02;
          for (let k = fr(s.t0); k < fr(s.t1); k++) T.lnF0[k] += intr + sj;
        }
        smoothC(T.lnF0, 0.012, fsec);
      }
      // voiced consonants pull F0 down slightly (lower transglottal pressure)
      return T;
    }

    /* ================================================================ DSP */
    function Reso() { return { a: 0, b: 0, c: 0, y1: 0, y2: 0 }; }
    function setReso(r, f, bw, sr) {
      const R = Math.exp((-Math.PI * bw) / sr);
      r.c = -R * R;
      r.b = 2 * R * Math.cos((2 * Math.PI * f) / sr);
      r.a = 1 - r.b - r.c;
    }
    function Bp() { return { b0: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0, g: 0 }; }
    function setBp(q, f, bw, sr) {
      const w0 = (2 * Math.PI * f) / sr;
      const Q = f / Math.max(10, bw);
      const al = Math.sin(w0) / (2 * Q);
      const a0 = 1 + al;
      q.b0 = al / a0; q.b2 = -al / a0; q.a1 = (-2 * Math.cos(w0)) / a0; q.a2 = (1 - al) / a0;
    }

    /**
     * Render an utterance into a Float32Array at opts.sampleRate (22050).
     */

    /* ================================================================ line jobs
     * prepare() plans a line, builds its control tracks, picks silent chunk boundaries and
     * looks up the speaker's loudness calibration; synthRange() renders any chunk; post()
     * applies gain, the mic/channel compressor and a soft limiter.
     */
    const TARGET = 0.14;        // active RMS of a typical line (matches the old engine's level)
    const VOWEL_TO_LINE = 1.26; // sustained-vowel RMS / typical line active RMS (measured over all 538 game lines)
    const RADIO_TRIM = 1.0;     // compressed (radio/phone) lines: same median loudness as the old engine
    function prepare(text, vp, dur, opts) {
      opts = opts || {};
      const radio = !!opts.compress; // mic ALC (the device models bring their own processing)
      const sr = opts.sampleRate || 22050;
      dur = num(dur, lineDurFallback(text));
      const P = plan(text, vp, dur, opts);
      const total = Math.min(dur, P.end + 0.18);
      const N = Math.max(HOP, Math.floor((total * sr) / HOP) * HOP);
      const job = { P, S: P.S, sr, N, opts, dur, radio };
      if (!P.segs.length) { job.empty = true; return job; }
      job.T = tracks(P, sr, N);
      job.cal = opts.sustain ? { g1: 1, g2: 1 } : calibrate(vp, sr, radio);
      const S = P.S;
      job.gain = job.cal.g1 * dB(S.arousal * 3 - (S.breathy > 0.5 ? 2 : 0) - S.old * 0.05 + (opts.whisper ? -6 : 0));
      return job;
    }
    /** Silent split points: mid-pause (before any breath) or 35 ms into a voiceless stop closure. */

    const CAL = new Map();
    /** Per-speaker loudness: a sustained /a/ measured once (≈1 ms), so chunks share one gain. */
    function calibrate(vp, sr, radio) {
      const key = [vp.id, vp.gender, vp.pitch, vp.rate, vp.formant, vp.breathy, vp.rasp, vp.age, vp.range, vp.panic, vp.synthetic, sr, radio].join('|');
      let c = CAL.get(key);
      if (c) return c;
      const job = prepare('Ah', vp, 0.62, { sustain: true, sampleRate: sr });
      const x = new Float32Array(job.N);
      synthRange(job, x, 0, job.N, 0);
      const r1 = actRms(x.subarray(Math.floor(0.15 * sr)), sr);
      const g1 = (TARGET * VOWEL_TO_LINE) / Math.max(1e-9, r1);
      let g2 = 1;
      if (radio) {
        for (let i = 0; i < x.length; i++) x[i] *= g1;
        compressAbs(x, 0, x.length, sr);
        g2 = (RADIO_TRIM * TARGET * VOWEL_TO_LINE) / Math.max(1e-9, actRms(x.subarray(Math.floor(0.15 * sr)), sr));
      }
      c = { g1, g2 };
      CAL.set(key, c);
      if (CAL.size > 64) CAL.delete(CAL.keys().next().value);
      return c;
    }
    function actRms(x, sr) {
      const w = Math.max(1, Math.round(sr * 0.02));
      const rms = [];
      let mx = 0;
      for (let i = 0; i + w <= x.length; i += w) {
        let s = 0;
        for (let k = i; k < i + w; k++) s += x[k] * x[k];
        const r = Math.sqrt(s / w);
        rms.push(r);
        if (r > mx) mx = r;
      }
      let s = 0, c = 0;
      for (const r of rms) if (r > mx * 0.1) { s += r * r; c++; }
      return Math.sqrt(s / Math.max(1, c));
    }
    /** Mic/transmitter ALC for radio and phone talkers: 3:1 above an absolute threshold. */
    function compressAbs(x, n0, n1, sr) {
      const thr = TARGET * 0.35, ratio = 3;
      const aA = 1 - Math.exp(-1 / (0.004 * sr)), aR = 1 - Math.exp(-1 / (0.08 * sr));
      let env = 0;
      for (let i = n0; i < n1; i++) {
        const a = Math.abs(x[i]);
        env += (a > env ? aA : aR) * (a - env);
        if (env > thr) x[i] *= Math.pow(env / thr, 1 / ratio - 1);
      }
    }
    /** Gain, channel compression, soft ceiling; a 10 ms fade at the very end. */
    function post(job, x, n0, n1) {
      const g = job.gain;
      for (let i = n0; i < n1; i++) x[i] *= g;
      if (job.radio) {
        compressAbs(x, n0, n1, job.sr);
        const g2 = job.cal.g2;
        for (let i = n0; i < n1; i++) x[i] *= g2;
      }
      for (let i = n0; i < n1; i++) {
        const v = x[i], a = v < 0 ? -v : v;
        if (a > 0.7) x[i] = (v < 0 ? -1 : 1) * (0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
      }
      if (n1 === job.N) {
        const f = Math.min(n1 - n0, Math.round(job.sr * 0.01));
        for (let i = 0; i < f; i++) x[n1 - 1 - i] *= i / f;
      }
    }
    /** Render a whole line synchronously → {data, sr, end, plan, ms, chunks}. */

    /**
     * Synthesise samples [n0, n1) of a prepared line into out (raw, before gain/compression).
     */
    function synthRange(job, out, n0, n1, ci) {
      const { P, S, T, sr, opts } = job;
      const rng = seeded(P.seed ^ 0x51ed270b ^ Math.imul(ci + 1, 0x9e3779b1));
      const gauss = gaussFn(rng);
      const whisper = !!opts.whisper;
      let ns = (P.seed ^ 0x2545f491 ^ Math.imul(ci + 7, 0x85ebca6b)) >>> 0 || 1; // xorshift noise state (inlined below)
      // cascade resonator coefficients/state (flat locals for speed)
      let a0 = 0, b0 = 0, c0 = 0, a0o = 0, b0o = 0, c0o = 0, y01 = 0, y02 = 0; // F1 closed / open
      let a1 = 0, b1 = 0, c1 = 0, y11 = 0, y12 = 0;
      let a2 = 0, b2 = 0, c2 = 0, y21 = 0, y22 = 0;
      let a3, b3, c3, y31 = 0, y32 = 0, a4, b4, c4, y41 = 0, y42 = 0, a5, b5, c5, y51 = 0, y52 = 0;
      let a6, b6, c6, y61 = 0, y62 = 0, a7, b7, c7, y71 = 0, y72 = 0, a8, b8, c8, y81 = 0, y82 = 0;
      let ap = 0, bp = 0, cp = 0, yp1 = 0, yp2 = 0; // nasal pole
      let az = 1, bz = 0, cz = 0, xz1 = 0, xz2 = 0; // nasal zero
      const co = (f, bw) => { const R = Math.exp((-Math.PI * bw) / sr); const c = -R * R, b = 2 * R * Math.cos((2 * Math.PI * f) / sr); return [1 - b - c, b, c]; };
      // fixed upper formants; any that would sit above 0.42·sr are left out (a pass-through), never
      // clamped — stacking clamped resonators near Nyquist makes a huge spurious peak
      const Fhi = [S.F4, S.F5, S.F6, S.F7, S.F8, S.F9].map((f) => f * S.fs);
      const Bhi = [250, 330, 450, 600, 800, 1000].map((b) => b * S.bwMul);
      const coHi = (i) => (Fhi[i] < sr * 0.42 ? co(Fhi[i], Bhi[i]) : [1, 0, 0]);
      [a3, b3, c3] = coHi(0); [a4, b4, c4] = coHi(1); [a5, b5, c5] = coHi(2);
      [a6, b6, c6] = coHi(3); [a7, b7, c7] = coHi(4); [a8, b8, c8] = coHi(5);
      // higher-pole correction: the poles above F9 (and above Nyquist) are missing from the cascade;
      // an RBJ high shelf restores the upper-spectrum level a lossy vocal tract really has
      let hs0, hs1, hs2, hsa1, hsa2, hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
      {
        const fc = 4600 * S.fs, hpc = ((opts.hpc == null ? 18 : opts.hpc) - (S.hpcOld || 0)) * clamp((sr * 0.36 - fc) / (sr * 0.1), 0, 1);
        const A = Math.pow(10, hpc / 40), w0 = (2 * Math.PI * Math.min(fc, sr * 0.36)) / sr;
        const cw = Math.cos(w0), al = (Math.sin(w0) / 2) * Math.SQRT1_2 * 1.2, sA = 2 * Math.sqrt(A) * al;
        const a0 = (A + 1) - (A - 1) * cw + sA;
        hs0 = (A * ((A + 1) + (A - 1) * cw + sA)) / a0; hs1 = (-2 * A * ((A - 1) + (A + 1) * cw)) / a0; hs2 = (A * ((A + 1) + (A - 1) * cw - sA)) / a0;
        hsa1 = (2 * ((A - 1) - (A + 1) * cw)) / a0; hsa2 = ((A + 1) - (A - 1) * cw - sA) / a0;
      }
      [ap, bp, cp] = co(T.FNP, 100);
      const par = [Bp(), Bp(), Bp(), Bp()];
      let curShape = -2, parN = 0, abG = 0, parLive = false;
      // glottal state: period length Tp (samples), phase position tau (0..1), recurrences
      let Tp = sr / Math.exp(T.lnF0[0]), tau = 1, dtau = 1 / Tp;
      let lf = lfAt(S.rd), amp = 1, pulseOdd = false;
      let sK = 0, sK1 = 0, rc1 = 0, rc2 = 0;   // open phase: s = e^{αt} sin(ωt) via 2nd-order recursion
      let dK = 0, dMul = 1, inRet = false;      // return phase: e^{−ε(t−te)}
      let flut = 0, roughLeft = 0;
      let aspLP = 0, aspLP2 = 0, brLP = 0, brLP2 = 0;
      // old voices: breath noise through a second pole (≈12 dB/oct above aspFc) and pulsed deeper
      const oldAsp = (S.oldK || 0) > 0;
      const aspA2 = oldAsp ? 1 - Math.exp((-2 * Math.PI * Math.min(S.aspFc, sr * 0.45)) / sr) : 1;
      const aspClosed = oldAsp ? S.aspClosed : 0.25;
      const tremPh = rng() * 6.283, shakePh = rng() * 6.283;
      let dcx = 0, dcy = 0;
      const dcR = Math.exp(-2 * Math.PI * 60 / sr);
      const dB1 = S.dB1, aspN = S.aspN * 2.2, srInv = 1 / sr;
      const NF = T.NF;
      for (let fi = Math.floor(n0 / HOP); fi * HOP < n1; fi++) {
        const j = Math.min(fi, NF - 2);
        {
          const f1 = T.F[0][j], bb1 = T.B[0][j];
          let q = co(f1, bb1); a0 = q[0]; b0 = q[1]; c0 = q[2];
          q = co(f1, bb1 + dB1 * (0.6 + 0.4 * clamp(T.RD[j] - 0.6, 0, 1.5))); a0o = q[0]; b0o = q[1]; c0o = q[2];
          q = co(T.F[1][j], T.B[1][j]); a1 = q[0]; b1 = q[1]; c1 = q[2];
          q = co(T.F[2][j], T.B[2][j]); a2 = q[0]; b2 = q[1]; c2 = q[2];
          q = co(T.FNZ[j], T.BNZ[j]); az = 1 / q[0]; bz = -q[1] / q[0]; cz = -q[2] / q[0];
        }
        let av = T.AV[j], ah = T.AH[j], af = T.AF[j], ab = T.AB[j], br = T.BR[j];
        const dav = (T.AV[j + 1] - av) / HOP, dah = (T.AH[j + 1] - ah) / HOP, daf = (T.AF[j + 1] - af) / HOP;
        const dab = (T.AB[j + 1] - ab) / HOP, dbr = (T.BR[j + 1] - br) / HOP;
        if (whisper) { ah += av * 0.6; av = 0; }
        const vfr = T.VF[j] > 0.3;
        const sh = T.shape[j];
        if (sh !== curShape && sh >= 0) {
          curShape = sh;
          const shp = T.shapes[sh];
          parN = shp.r.length;
          for (let k = 0; k < parN; k++) { setBp(par[k], shp.r[k][0], shp.r[k][1], sr); par[k].g = shp.r[k][2]; }
          abG = shp.ab;
        }
        const fricOn = parN > 0 && (af > 1e-5 || T.AF[j + 1] > 1e-5 || ab > 1e-5 || T.AB[j + 1] > 1e-5);
        if (!fricOn && parLive) { for (let k = 0; k < parN; k++) { const q = par[k]; q.x1 = q.x2 = q.y1 = q.y2 = 0; } parLive = false; }
        const brOn = br > 1e-4 || T.BR[j + 1] > 1e-4;
        const nEnd = Math.min(n1, (fi + 1) * HOP);
        for (let n = fi * HOP; n < nEnd; n++) {
          // ---- glottal period boundary
          if (tau >= 1) {
            const tsec = n * srInv;
            const cr = T.CR[j];
            let lnf = T.lnF0[j];
            flut = flut * 0.93 + gauss() * S.flutter * 0.37;
            lnf += flut;
            if (S.tremor) lnf += S.tremor * Math.sin(6.2832 * S.tremorHz * tsec + tremPh);
            if (S.shake) lnf += S.shake * (Math.sin(6.2832 * 8.3 * tsec + shakePh) * 0.6 + gauss() * 0.4);
            let jit = S.jit, rd = T.RD[j];
            let a = 1 + gauss() * S.shim;
            pulseOdd = !pulseOdd;
            if (cr > 0.3) {
              lnf += Math.log(0.62 + 0.1 * rng()) * cr;
              jit += 0.035 * cr;
              rd = lerp(rd, 0.55, cr * 0.8);
              a *= pulseOdd ? 1 : 1 - 0.3 * cr;
            }
            if (S.dip) { a *= pulseOdd ? 1 : 1 - S.dip; if (S.wrong) lnf += pulseOdd ? 0.04 : -0.04; }
            if (roughLeft > 0) { roughLeft--; a *= pulseOdd ? 1.15 : 0.6; lnf += pulseOdd ? -0.05 : 0.05; }
            else if (S.subP && rng() < S.subP * 0.04) roughLeft = 4 + ((rng() * 10) | 0);
            const f0 = clamp(Math.exp(lnf), 38, 900);
            const frac = (tau - 1) * Tp; // samples already into the new period
            Tp = (sr / f0) * clamp(1 + gauss() * jit, 0.75, 1.3);
            dtau = 1 / Tp;
            tau = frac * dtau;
            lf = lfAt(rd + (S.synthetic ? 0 : gauss() * 0.012));
            amp = clamp(a, 0.3, 1.7);
            // open-phase recursion for s(τ) = e^{ατ} sin(ωτ), sampled every dτ from τ
            const er = Math.exp(lf.alpha * dtau), wc = Math.cos(lf.wg * dtau);
            rc1 = 2 * er * wc; rc2 = -er * er;
            sK = Math.exp(lf.alpha * tau) * Math.sin(lf.wg * tau);
            sK1 = Math.exp(lf.alpha * (tau - dtau)) * Math.sin(lf.wg * (tau - dtau));
            dMul = Math.exp(-lf.eps * dtau);
            inRet = false;
          }
          let g, open;
          if (tau < lf.te) {
            g = lf.E0 * sK;
            const s2 = rc1 * sK + rc2 * sK1; sK1 = sK; sK = s2;
            open = true;
          } else {
            if (!inRet) { inRet = true; dK = Math.exp(-lf.eps * (tau - lf.te)); }
            g = -(dK - lf.ecl) / (lf.eps * lf.ta);
            dK *= dMul;
            open = false;
          }
          tau += dtau;
          // ---- noise
          ns ^= ns << 13; ns >>>= 0; ns ^= ns >>> 17; ns ^= ns << 5; ns >>>= 0;
          const w1 = ns / 2147483648 - 1;
          aspLP += 0.25 * (w1 - aspLP);
          let aspV = aspLP;
          if (oldAsp) { aspLP2 += aspA2 * (aspLP - aspLP2); aspV = aspLP2 * 1.6; }
          const gmod = open ? 0.35 + 0.65 * (tau / lf.te) : aspClosed;
          const voiced = av * amp;
          let x = g * voiced * 0.5 + aspLP * ah * 0.3 + aspV * voiced * aspN * gmod;
          // ---- cascade: nasal zero → nasal pole → F1 (pitch-synchronous B1) → F2 … F6
          let y = az * x + bz * xz1 + cz * xz2; xz2 = xz1; xz1 = x; x = y;
          y = ap * x + bp * yp1 + cp * yp2; yp2 = yp1; yp1 = y; x = y;
          y = open ? a0o * x + b0o * y01 + c0o * y02 : a0 * x + b0 * y01 + c0 * y02; y02 = y01; y01 = y; x = y;
          y = a1 * x + b1 * y11 + c1 * y12; y12 = y11; y11 = y; x = y;
          y = a2 * x + b2 * y21 + c2 * y22; y22 = y21; y21 = y; x = y;
          y = a3 * x + b3 * y31 + c3 * y32; y32 = y31; y31 = y; x = y;
          y = a4 * x + b4 * y41 + c4 * y42; y42 = y41; y41 = y; x = y;
          y = a5 * x + b5 * y51 + c5 * y52; y52 = y51; y51 = y; x = y;
          y = a6 * x + b6 * y61 + c6 * y62; y62 = y61; y61 = y; x = y;
          y = a7 * x + b7 * y71 + c7 * y72; y72 = y71; y71 = y; x = y;
          y = a8 * x + b8 * y81 + c8 * y82; y82 = y81; y81 = y; x = y;
          y = hs0 * x + hs1 * hx1 + hs2 * hx2 - hsa1 * hy1 - hsa2 * hy2; hx2 = hx1; hx1 = x; hy2 = hy1; hy1 = y;
          let o = y;
          // ---- parallel branch: frication and bursts
          if (fricOn) {
            ns ^= ns << 13; ns >>>= 0; ns ^= ns >>> 17; ns ^= ns << 5; ns >>>= 0;
            const w2 = ns / 2147483648 - 1;
            let yf = w2 * abG;
            for (let k = 0; k < parN; k++) {
              const q = par[k];
              const v = q.b0 * w2 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
              q.x2 = q.x1; q.x1 = w2; q.y2 = q.y1; q.y1 = v;
              yf += (k & 1 ? -v : v) * q.g;
            }
            o += yf * ((vfr ? (open ? af * 0.45 : af) : af) + ab) * 0.9;
            parLive = true;
          }
          if (brOn) {
            ns ^= ns << 13; ns >>>= 0; ns ^= ns >>> 17; ns ^= ns << 5; ns >>>= 0;
            const w3 = ns / 2147483648 - 1;
            brLP += 0.35 * (w3 - brLP);
            brLP2 += 0.08 * (brLP - brLP2);
            o += (brLP - brLP2 * 0.8) * br * 0.022;
          }
          const yv = o - dcx + dcR * dcy;
          dcx = o; dcy = yv;
          out[n] = yv;
          av += dav; ah += dah; af += daf; ab += dab; br += dbr;
        }
      }
    }

    /** Seeded PRNG with uniform / gaussian helpers. */
    function makeRng(seed) {
      let a = seed >>> 0;
      const u = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let spare = null;
      const g = () => {
        if (spare !== null) { const s = spare; spare = null; return s; }
        let x, y, r;
        do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
        const m = Math.sqrt((-2 * Math.log(r)) / r);
        spare = y * m;
        return x * m;
      };
      return { u, g, r: (lo, hi) => lo + u() * (hi - lo), chance: (p) => u() < p };
    }
    /** Fast xorshift white noise in [-1, 1). */
    function noiseGen(seed) {
      let s = (seed >>> 0) || 0x9e3779b9;
      return () => {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        return s / 2147483648 - 1;
      };
    }

    /* ============================================================== DSP LIB */
    function biq(type, f, q, gainDb, sr) {
      sr = sr || SR;
      f = clamp(f, 5, sr * 0.49);
      const A = Math.pow(10, (gainDb || 0) / 40), w0 = TWO_PI * f / sr, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
      let b0, b1, b2, a0, a1, a2;
      switch (type) {
        case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
        case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
        case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
        case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
        case 'ls': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s); a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break; }
        case 'hs': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s); a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
        default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
      }
      return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
    }
    /** In-place biquad (TDF-II) over x[a..b). Returns x. */
    function F(x, type, f, q, g, sr, a, b) {
      const c = biq(type, f, q == null ? 0.707 : q, g, sr);
      const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
      let z1 = 0, z2 = 0;
      const e = b == null ? x.length : b;
      for (let i = a || 0; i < e; i++) {
        const v = x[i];
        const y = b0 * v + z1;
        z1 = b1 * v - a1 * y + z2;
        z2 = b2 * v - a2 * y;
        x[i] = y;
      }
      return x;
    }
    /** Cascade of biquads: specs = [[type, f, q, gainDb], …] (sequential passes: V8 keeps each in registers). */
    function FF(x, specs, sr) {
      for (const sp of specs) F(x, sp[0], sp[1], sp[2] == null ? 0.707 : sp[2], sp[3], sr);
      return x;
    }
    const BW4 = (type, f) => [[type, f, 0.541], [type, f, 1.307]]; // 4th-order Butterworth sections
    const F4 = (x, type, f, sr) => FF(x, BW4(type, f), sr);
    function onepole(x, type, f, sr) {
      const c = Math.exp(-TWO_PI * f / (sr || SR));
      let y = 0;
      if (type === 'lp') { for (let i = 0; i < x.length; i++) { y = x[i] + (y - x[i]) * c; x[i] = y; } }
      else { let px = 0; for (let i = 0; i < x.length; i++) { const v = x[i]; y = c * (y + v - px); px = v; x[i] = y; } }
      return x;
    }
    /** Envelope follower (peak, attack/release in s) → Float32Array. */
    function envelope(x, att, rel, sr) {
      sr = sr || SR;
      const ca = Math.exp(-1 / (att * sr)), cr = Math.exp(-1 / (rel * sr));
      const e = new Float32Array(x.length);
      let y = 0;
      for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); y = v > y ? v + (y - v) * ca : v + (y - v) * cr; e[i] = y; }
      return e;
    }
    /**
     * Feed-forward compressor in place (gain computed per 16 samples, interpolated); returns the
     * gain trace. thr linear, ratio, knee dB, makeup linear, optional side-chain.
     */
    function compress(x, o) {
      const sr = o.sr || SR;
      const side = o.side || x;
      const ca = Math.exp(-1 / ((o.att || 0.005) * sr)), cr = Math.exp(-1 / ((o.rel || 0.15) * sr));
      const g = new Float32Array(x.length);
      const thrDb = 20 * Math.log10(o.thr), ratio = o.ratio || 4, knee = o.knee || 6, mk = o.makeup || 1, sl = 1 - 1 / ratio;
      let e = 0, gPrev = mk;
      const K = 16;
      for (let i0 = 0; i0 < x.length; i0 += K) {
        const i1 = Math.min(x.length, i0 + K);
        for (let i = i0; i < i1; i++) { const v = Math.abs(side[i]); e = v > e ? v + (e - v) * ca : v + (e - v) * cr; }
        const over = 20 * Math.log10(e + 1e-9) - thrDb;
        let red = 0;
        if (over > knee / 2) red = over * sl;
        else if (over > -knee / 2) { const q = over + knee / 2; red = (q * q) / (2 * knee) * sl; }
        const gg = Math.pow(10, -red / 20) * mk;
        const d = (gg - gPrev) / (i1 - i0);
        for (let i = i0; i < i1; i++) { gPrev += d; g[i] = gPrev; x[i] *= gPrev; }
      }
      return g;
    }
    /** Slow AGC towards a target level with a gain ceiling. */
    function agc(x, target, att, rel, maxGain, sr) {
      sr = sr || SR;
      const ca = Math.exp(-1 / (att * sr)), cr = Math.exp(-1 / (rel * sr));
      let e = target;
      for (let i = 0; i < x.length; i++) {
        const v = Math.abs(x[i]);
        e = v > e ? v + (e - v) * ca : v + (e - v) * cr;
        const gg = target / Math.max(e, target / maxGain);
        x[i] *= gg;
      }
      return x;
    }
    /** tanh soft clip normalised so small signals keep unity gain. */
    function softclip(x, drive) { const k = 1 / drive; for (let i = 0; i < x.length; i++) { const v = x[i] * drive; x[i] = (v > 3 ? 1 : v < -3 ? -1 : v * (27 + v * v) / (27 + 9 * v * v)) * k; } return x; }
    const hardclip = (x, lvl) => { for (let i = 0; i < x.length; i++) x[i] = x[i] > lvl ? lvl : x[i] < -lvl ? -lvl : x[i]; return x; };
    const scale = (x, g) => { for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
    const addInto = (dst, src, g, off) => { off = off || 0; g = g == null ? 1 : g; const a = Math.max(0, -off), b = Math.min(src.length, dst.length - off); for (let i = a; i < b; i++) dst[i + off] += src[i] * g; return dst; };
    const copy = (x) => new Float32Array(x);

    /* ---- cached noise loops (generated + filtered once; each line reads a random window) */
    const LOOPS = {};
    function loopOf(key, make) {
      const k = key + '@' + SR;
      let a = LOOPS[k];
      if (!a) {
        const R = makeRng(hashStr('loop-' + key));
        a = LOOPS[k] = make(R);
        // unit RMS so gains are interchangeable
        let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] * a[i];
        const r = Math.sqrt(s / (a.length / 4)) || 1;
        scale(a, 1 / r);
      }
      return a;
    }
    function slice(key, n, R, make) {
      const a = loopOf(key, make), L = a.length;
      const out = new Float32Array(n);
      let p = Math.floor(R.u() * L);
      for (let i = 0; i < n; i++) { out[i] = a[p]; if (++p >= L) p = 0; }
      return out;
    }
    const whiteLoop = (R) => { const g = noiseGen(R.u() * 4294967296), x = new Float32Array(Math.round(6 * SR)); for (let i = 0; i < x.length; i++) x[i] = g(); return x; };
    function pinkLoop(R) {
      const g = noiseGen(R.u() * 4294967296), x = new Float32Array(Math.round(6 * SR));
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < x.length; i++) {
        const w = g();
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
      return x;
    }
    /** Smooth random control loop, bandwidth bw Hz, normalised to ±1 peak-ish (unit RMS → scaled). */
    const ctrlLoop = (bw) => (R) => {
      const x = new Float32Array(Math.round(6 * SR)), c = Math.exp(-TWO_PI * bw / SR);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < x.length; i++) { y1 = y1 * c + R.g() * (1 - c); y2 = y2 * c + y1 * (1 - c); x[i] = y2; }
      return x;
    };
    const ctrl = (n, bw, R) => scale(slice('ctrl' + bw, n, R, ctrlLoop(bw)), 0.45); // ≈ ±1 at 2.2 σ
    /** Sparse ticks/crackle added into dst: rate per s, each tick band-limited by a short filter. */
    function addCrackle(dst, rate, amp, R, a0, a1, lo, hi, decay) {
      a0 = a0 || 0; a1 = a1 == null ? dst.length : a1;
      const g = noiseGen(R.u() * 4294967296);
      let t = a0 / SR;
      const tick = new Float32Array(Math.round(0.012 * SR));
      const spec = [BW4('hp', lo || 300)[0], BW4('lp', hi || 3000)[0]];
      while (rate > 0) {
        t += -Math.log(1 - R.u()) / rate;
        const i0 = Math.floor(t * SR);
        if (i0 >= a1) break;
        const a = Math.pow(R.u(), 2.2) * (R.u() < 0.5 ? -1 : 1) * amp;
        const dec = (decay || 0.0012) * SR * R.r(0.5, 1.6);
        for (let j = 0; j < tick.length; j++) tick[j] = g() * Math.exp(-j / dec);
        FF(tick, spec);
        addInto(dst, tick, a, i0);
      }
      return dst;
    }
    /** Multi-tap early reflections (taps: [[ms, gain], …]), low-passed wet path. */
    function reflections(x, taps, lpHz, sr) {
      sr = sr || SR;
      const wet = new Float32Array(x.length);
      for (const [ms, g] of taps) addInto(wet, x, g, Math.round((ms / 1000) * sr));
      if (lpHz) onepole(wet, 'lp', lpHz, sr);
      for (let i = 0; i < x.length; i++) x[i] += wet[i];
      return x;
    }
    /** Time-varying fractional delay (dArr in samples), linear interpolation. */
    function varDelay(x, dArr) {
      const y = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const p = i - dArr[i];
        const i0 = Math.floor(p), fr = p - i0;
        const a = i0 >= 0 && i0 < x.length ? x[i0] : 0, b = i0 + 1 >= 0 && i0 + 1 < x.length ? x[i0 + 1] : 0;
        y[i] = a + (b - a) * fr;
      }
      return y;
    }
    /** µ-law 8-bit companding with 8 kHz sample-and-hold (a digital trunk). */
    function mulaw8k(x, sr) {
      sr = sr || SR;
      const mu = 255, step = sr / 8000, lm = Math.log(1 + mu);
      let acc = 0, hold = 0;
      for (let i = 0; i < x.length; i++) {
        acc += 1;
        if (acc >= step) {
          acc -= step;
          const v = clamp(x[i], -1, 1);
          const c = Math.sign(v) * Math.log(1 + mu * Math.abs(v)) / lm;
          const q = Math.round(c * 127) / 127;
          hold = Math.sign(q) * (Math.pow(1 + mu, Math.abs(q)) - 1) / mu;
        }
        x[i] = hold;
      }
      return x;
    }

    /* ================================================================ MUSIC BED */
    /** A soft late-night station bed (electric-piano chords, bass, a hint of hat), cached loop. */
    const BEDS = {};
    function musicBed() {
      if (BEDS[SR]) return BEDS[SR];
      const sr = SR, bar = 3.2, bars = 4, n = Math.round(bar * bars * sr);
      const x = new Float32Array(n);
      const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
      const bass = [41, 40, 38, 36];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const note = (t0, f, len, amp, bright) => {
        const i0 = Math.round(t0 * sr), L = Math.round(len * sr);
        const parts = [[1, 1], [2, 0.35 * bright], [3, 0.12 * bright], [7.1, 0.05 * bright]];
        for (const [h, a] of parts) {
          const w = TWO_PI * f * h / sr;
          let c = 1, s = 0;
          const cw = Math.cos(w), sw = Math.sin(w);
          const dec = Math.exp(-1 / ((h > 2 ? 0.25 : 1.6) * sr));
          let e = amp * a;
          for (let j = 0; j < L; j++) {
            const i = (i0 + j) % n;
            x[i] += s * e * (j < 200 ? j / 200 : 1);
            const nc = c * cw - s * sw; s = c * sw + s * cw; c = nc;
            e *= dec;
          }
        }
      };
      for (let b = 0; b < bars; b++) {
        const t0 = b * bar;
        chords[b].forEach((m, i) => note(t0 + i * 0.018, mtof(m), bar * 1.1, 0.05, 1));
        chords[b].forEach((m, i) => { if (i % 2) note(t0 + bar * 0.5 + 0.12 + i * 0.02, mtof(m + 12), bar * 0.5, 0.018, 0.6); });
        note(t0, mtof(bass[b]), bar * 0.48, 0.11, 0.25);
        note(t0 + bar * 0.5, mtof(bass[b] + 7), bar * 0.45, 0.08, 0.25);
      }
      const g = noiseGen(77);
      for (let b = 0; b < bars * 4; b++) {
        const i0 = Math.round((b + 0.5) * (bar / 4) * sr);
        for (let j = 0; j < 1400; j++) x[(i0 + j) % n] += g() * 0.012 * Math.exp(-j / 260);
      }
      F(x, 'hp', 60, 0.7);
      return (BEDS[SR] = { x, sr, n });
    }

    /* ============================================================== CHANNELS */
    const TAIL = 0.35; // seconds of buffer after the line (squelch tails, echoes)
    // the car radio keeps playing between lines (music bed + static): its tail bridges the 0.5 s gap
    // scenes.js leaves between DJ lines and crossfades into the next line's 0.25 s fade-in
    const TAIL_BROADCAST = 0.75;
    const tailOf = (ch) => (ch === 'broadcast' ? TAIL_BROADCAST : TAIL);

    function channelFor(speakerId, o, vp) {
      o = o || {};
      if (o.channel) return o.channel;
      const id = String(speakerId || (vp && vp.id) || '');
      if (o.phone) return 'phone';
      if (o.radio) {
        if (o.carRadio || o.car || o.band || id === 'dj') return 'broadcast';
        if (/trucker|^cb\b|^cb_/.test(id)) return 'cb';
        if (id === 'weather' || /noaa/.test(id)) return 'noaa';
        return 'vhf';
      }
      if (o.tape) return 'tape';
      return 'room';
    }

    /**
     * Clarity → voice level (relative to clarity 1) and noise-bed gain. The bed gain is derived
     * from a signal-to-noise ratio curve per device and the device's typical pre-trim speech RMS
     * (VREF0), so "clarity 0.8" means the same SNR whatever the speaker.
     */
    // output speech level per device (dBFS, 50 ms frames within 20 dB of the loudest) at clarity 1,
    // matched to the old engine's loudness at the same opts so the mix keeps its balance; and the
    // peak ceiling above it (radio audio is dense, a voice in the room is not)
    const LEVEL = { broadcast: -7.8, vhf: -8.8, noaa: -10.3, cb: -8.3, phone: -11.2, tape: -13.8, room: -16.3 };
    const CREST = { broadcast: 7, vhf: 8, noaa: 8, cb: 7, phone: 8, tape: 12, room: 14 };
    function snrOf(kind, c, band) {
      switch (kind) {
        case 'broadcast': return band === 'FM' ? 10 + 35 * Math.pow(c, 1.5) : 8 + 30 * Math.pow(c, 1.5);
        case 'cb': return 3 + 24 * Math.pow(c, 1.3);
        case 'noaa': case 'vhf': return 3 + 31 * Math.pow(c, 1.6);
        case 'phone': return 40;
        case 'tape': return 32;
        default: return 80;
      }
    }
    /** Clarity → voice gain (relative to clarity 1) and absolute noise-bed gain (bed is unit RMS). */
    function clarityLevels(kind, c, band) {
      c = clamp(c, 0, 1);
      let v = 1;
      if (kind === 'broadcast') v = lerp(0.6, 1, Math.pow(c, 0.6));
      else if (kind === 'cb') v = lerp(0.45, 1, Math.pow(c, 0.7));
      else if (kind === 'vhf' || kind === 'noaa') v = lerp(0.4, 1, Math.pow(c, 0.7));
      const n = kind === 'room' ? 0 : v * Math.pow(10, (num(LEVEL[kind], -15) - snrOf(kind, c, band)) / 20);
      return { v, n };
    }
    /** Speech level (dB): mean power of 50 ms frames within 20 dB of the loudest frame. */
    function speechLevel(x) {
      const w = Math.round(0.05 * SR), n = Math.floor(x.length / w);
      if (!n) return -100;
      const f = new Float64Array(n);
      let mx = 0;
      for (let k = 0; k < n; k++) { let s = 0; for (let i = k * w; i < (k + 1) * w; i++) s += x[i] * x[i]; f[k] = s / w; if (f[k] > mx) mx = f[k]; }
      let sum = 0, cnt = 0;
      for (let k = 0; k < n; k++) if (f[k] > mx * 0.01) { sum += f[k]; cnt++; }
      return 10 * Math.log10(sum / Math.max(1, cnt) + 1e-12);
    }
    /** Look-ahead-ish peak limiter: backward peak hold (2 ms) → gain, forward release (60 ms). */
    function limit(x, thr) {
      const n = x.length, pk = new Float32Array(n);
      const ca = Math.exp(-1 / (0.002 * SR)), cr = Math.exp(-1 / (0.06 * SR));
      let e = 0;
      for (let i = n - 1; i >= 0; i--) { const v = Math.abs(x[i]); e = v > e ? v : e * ca; pk[i] = e; }
      let g = 1;
      for (let i = 0; i < n; i++) { const t = pk[i] > thr ? thr / pk[i] : 1; g = t < g ? t : t + (g - t) * cr; x[i] *= g; }
      return x;
    }
    /** Normalise a bed to unit RMS over its non-silent part. */
    function unitRms(x) {
      let s = 0, c = 0;
      for (let i = 0; i < x.length; i += 2) { const v = x[i]; if (v !== 0) { s += v * v; c++; } }
      const r = Math.sqrt(s / Math.max(1, c));
      return r > 0 ? scale(x, 1 / r) : x;
    }

    /** Output length: the line plus TAIL (squelch tails, echoes), never shorter than the dry voice. */
    const outLen = (dry, plan, tail) => Math.max(dry.length, Math.round((plan.dur + (tail || TAIL)) * SR));
    /** Transmitter keyed window [tx0, tx1) in samples: key-up ~0.1 s before the first breath/word. */
    function txWindow(plan, n, tail) {
      const first = plan.breaths.length ? Math.min(plan.breaths[0], plan.lead) : plan.lead;
      const tx0 = Math.max(0, Math.round((first - 0.1) * SR));
      const tx1 = Math.min(n, Math.round((plan.end + tail) * SR));
      return [tx0, tx1];
    }
    /** Nothing reaches the air before the key-up (6 ms ramp). */
    function gateBefore(x, i0) {
      const r = Math.round(0.006 * SR);
      for (let i = 0; i < Math.min(x.length, i0 + r); i++) x[i] *= i < i0 ? 0 : (i - i0) / r;
      return x;
    }
    /** Close-talked dynamic mic: proximity bass, presence peak, plosive pops on the diaphragm. */
    function palmMic(x, plan, R, strength) {
      FF(x, [['ls', 180, 0.7, 5], ['peak', 2400, 1.2, 3]]);
      const L = Math.round(0.06 * SR);
      for (const p of plan.pops) {
        if (R.u() > 0.8 * strength) continue;
        const i0 = Math.round(p.t * SR);
        const a = 0.4 * p.a * strength * R.r(0.6, 1.3), f = R.r(30, 48);
        for (let j = 0; j < L && i0 + j < x.length; j++) { const tt = j / SR; x[i0 + j] += a * Math.sin(TWO_PI * f * tt) * Math.exp(-tt / 0.018) * (1 - Math.exp(-tt / 0.002)); }
      }
      return x;
    }

    /** Two-way narrowband FM (VHF public safety). */
    function chanVHF(dry, plan, S, o, R, c, opt) {
      opt = opt || {};
      const n = outLen(dry, plan);
      const x = new Float32Array(n); x.set(dry);
      const [tx0, tx1] = txWindow(plan, n, o.squelch ? 0.08 : 0.12);
      gateBefore(x, tx0);
      if (!S.synthetic) palmMic(x, plan, R, 1);
      // TX: 300 Hz HP, pre-emphasis, deviation limiter (compressor + hard clip), splatter filter
      FF(x, BW4('hp', 280).concat([['hs', 1500, 0.7, 9]]));
      compress(x, { thr: 0.12, ratio: 6, att: 0.002, rel: 0.12, knee: 6 });
      scale(x, opt.drive || 2.6);
      hardclip(x, 0.42);
      // ---- path: fades, picket fencing and FM threshold grit, scaled by clarity
      const lost = new Float32Array(n); // 0 = full signal, 1 = gone
      const lam = 14 * Math.pow(1 - c, 2.2);
      let t = tx0 / SR;
      while (lam > 0.02) {
        t += -Math.log(1 - R.u()) / lam;
        if (t * SR >= tx1) break;
        const len = R.r(0.012, 0.07) * (c < 0.4 ? 1.8 : 1), dep = clamp(R.r(0.5, 1) * (1.15 - c), 0, 1);
        const i0 = Math.round(t * SR), L = Math.round(len * SR);
        for (let j = 0; j < L && i0 + j < n; j++) { const e = Math.sin(Math.PI * j / L); lost[i0 + j] = Math.max(lost[i0 + j], dep * Math.min(1, e * 3)); }
      }
      if (c < 0.85 && !S.synthetic) {
        const fl = ctrl(n, 9, R), d = (0.85 - c) * 0.7;
        for (let i = tx0; i < tx1; i++) { const v = -fl[i] - 0.3; if (v > 0) lost[i] = Math.max(lost[i], Math.min(1, v) * d); }
      }
      const gnz = noiseGen(R.u() * 4294967296);
      for (let i = tx0; i < tx1; i++) { const f = lost[i]; if (f > 0) x[i] = x[i] * (1 - f) + (f > 0.4 ? x[i] * gnz() * f * 0.8 : 0); }
      // RX: de-emphasis, 300-3000 Hz, small desk speaker (cabinet resonance + cone peak), soft clip
      FF(x, [['hs', 1500, 0.7, -9]].concat(BW4('hp', 300), BW4('lp', 3000), [['peak', 230, 1.4, 3], ['peak', 1800, 1.2, 2.5]]));
      softclip(x, 1.3);
      // ---- noise bed: carrier-quieted FM hiss (dips a little under speech, rises in fades) + clicks
      const bed = new Float32Array(n);
      const hiss = slice('vhfHiss', n, R, (Rr) => FF(whiteLoop(Rr), BW4('hp', 300).concat(BW4('lp', 3100), [['peak', 2400, 0.8, 4]])));
      const ev = envelope(dry, 0.01, 0.25);
      let evMax = 1e-6; for (let i = 0; i < ev.length; i += 16) evMax = Math.max(evMax, ev[i]);
      for (let i = tx0; i < tx1; i++) {
        const sp = i < dry.length ? ev[i] / evMax : 0;
        bed[i] = hiss[i] * (1 - 0.45 * Math.min(1, sp * 1.6)) * (1 + lost[i] * 4);
      }
      addCrackle(bed, 1 + 30 * Math.pow(1 - c, 2), 2.5, R, tx0, tx1, 300, 3000, 0.0006);
      // key-up + squelch tail
      if (o.squelch) {
        const k0 = tx0, kl = Math.round(0.03 * SR);
        const kn = slice('vhfHiss', kl, R, null);
        for (let j = 0; j < kl && k0 + j < n; j++) x[k0 + j] += kn[j] * 0.12 * (1 - j / kl);
        for (let j = 0; j < 90 && k0 + j < n; j++) x[k0 + j] += 0.22 * Math.exp(-j / 18) * (j % 2 ? -1 : 1);
        const L = Math.round(R.r(0.15, 0.24) * SR);
        const tail = slice('sqTail', L, R, (Rr) => FF(whiteLoop(Rr), BW4('hp', 300).concat(BW4('lp', 3200), [['peak', 2000, 0.7, 3]])));
        for (let j = 0; j < L && tx1 + j < n; j++) { const e = Math.min(1, j / 40) * (j > L - 200 ? (L - j) / 200 : 1); x[tx1 + j] += tail[j] * 0.1 * e; }
      }
      return { sig: x, bed };
    }

    /** 27 MHz AM citizens band. */
    function chanCB(dry, plan, S, o, R, c) {
      const n = outLen(dry, plan);
      const x = new Float32Array(n); x.set(dry);
      const [tx0, tx1] = txWindow(plan, n, 0.1);
      gateBefore(x, tx0);
      // cheap ceramic power mic: thin, peaky, squashed and overdriven
      palmMic(x, plan, R, 0.8);
      FF(x, BW4('hp', 380).concat([['peak', 1900, 1.6, 6]]));
      compress(x, { thr: 0.05, ratio: 10, att: 0.003, rel: 0.2, knee: 4 });
      softclip(scale(x, 5.5), 2.2);
      for (let i = 0; i < n; i++) if (x[i] < -0.75) x[i] = -0.75 - (x[i] + 0.75) * 0.1; // AM over-modulation
      // slow QSB fading
      const qsb = ctrl(n, 0.6, R), qd = 0.15 + (1 - c) * 0.35;
      for (let i = 0; i < n; i++) x[i] *= 1 - qd * (0.5 + 0.5 * qsb[i]);
      // band noise, pumped by the receiver AGC: loud in gaps, swallowed under speech
      const bed = new Float32Array(n);
      const hiss = slice('cbHiss', n, R, (Rr) => FF(pinkLoop(Rr), BW4('hp', 350).concat(BW4('lp', 2800))));
      const env = envelope(x, 0.004, 0.35);
      let emax = 1e-6; for (let i = 0; i < n; i += 16) emax = Math.max(emax, env[i]);
      const het = R.r(900, 1700), hetA = 0.04 + 0.08 * (1 - c), hetDrift = R.r(-40, 40);
      for (let i = 0; i < n; i++) {
        const inTx = i >= tx0 && i < tx1;
        const agcG = inTx ? 1 / (1 + 5 * env[i] / emax) : 1;
        const tt = i / SR;
        bed[i] = hiss[i] * agcG * (inTx ? 0.45 : 1) + (inTx ? Math.sin(TWO_PI * (het + hetDrift * tt) * tt) * hetA * agcG : 0);
      }
      addCrackle(bed, 14 + 25 * (1 - c), 3, R, 0, n, 300, 2600, 0.0015);
      // ignition ticks from a truck nearby (noise blanker does not catch them all)
      { const rate = R.r(38, 52); let ph = 0; const tk = new Float32Array(24); for (let i = tx0; i < tx1; i++) { ph += rate / SR; if (ph >= 1) { ph -= 1; if (R.u() < 0.7) { for (let j = 0; j < 24; j++) tk[j] = (j % 2 ? -1 : 1) * Math.exp(-j / 4); addInto(bed, tk, 0.25, i); } } } }
      // carrier drop: the AGC recovers → a whoosh of band noise
      for (let j = 0; j < Math.round(0.3 * SR) && tx1 + j < n; j++) x[tx1 + j] += hiss[tx1 + j] * 0.12 * Math.min(1, j / (0.12 * SR)) * (o.squelch ? Math.max(0, 1 - j / (0.3 * SR)) : 0.5);
      for (let j = 0; j < 60 && tx0 + j < n; j++) x[tx0 + j] += 0.2 * Math.exp(-j / 12) * (j % 2 ? -1 : 1);
      // rig: AM detector bandwidth + speaker
      const rig = BW4('hp', 320).concat(BW4('lp', 2700), [['peak', 1500, 1.4, 3]]);
      FF(x, rig); FF(bed, rig);
      return { sig: x, bed };
    }

    /** Car radio (AM or FM broadcast) with a music bed, broadcast processing, receiver, door speaker + cabin. */
    function chanBroadcast(dry, plan, S, o, R, c) {
      const band = String(o.band || 'AM').toUpperCase() === 'FM' ? 'FM' : 'AM';
      const n = outLen(dry, plan, TAIL_BROADCAST);
      const x = new Float32Array(n); x.set(dry);
      // studio: broadcast dynamic worked close (proximity), a touch of presence
      FF(x, [['ls', 160, 0.7, 4], ['peak', 3500, 1, 2]]);
      // music bed from the absolute clock (successive lines continue the same music)
      if (o.bed !== false && !S.synthetic) {
        const B = musicBed();
        let p = ((Math.round(num(o.clock, 0) * SR) % B.n) + B.n) % B.n;
        const fadeIn = Math.round(0.25 * SR), fadeOut = Math.round(0.28 * SR), bl = 0.02;
        for (let i = 0; i < n; i++) {
          const e = i < fadeIn ? i / fadeIn : n - i < fadeOut ? (n - i) / fadeOut : 1;
          x[i] += B.x[p] * bl * e;
          if (++p >= B.n) p = 0;
        }
      }
      // Optimod-style: slow AGC, 3-band compression, final clipper
      agc(x, 0.12, 0.3, 2.5, 1.8);
      const lo = copy(x), hi = copy(x);
      F4(lo, 'lp', 220); F4(hi, 'hp', 2200);
      const mid = new Float32Array(n);
      for (let i = 0; i < n; i++) mid[i] = x[i] - lo[i] - hi[i];
      compress(lo, { thr: 0.05, ratio: 4, att: 0.02, rel: 0.25, makeup: 2 });
      compress(mid, { thr: 0.06, ratio: 4, att: 0.005, rel: 0.12, makeup: 2.2 });
      compress(hi, { thr: 0.03, ratio: 5, att: 0.002, rel: 0.08, makeup: band === 'AM' ? 4.5 : 3 });
      for (let i = 0; i < n; i++) x[i] = lo[i] + mid[i] + hi[i];
      if (band === 'FM') F(x, 'hs', 2100, 0.7, 10); // 75 µs pre-emphasis, clipped with the rest
      softclip(x, 2.2);
      hardclip(x, 0.9);
      const bed = new Float32Array(n);
      if (band === 'AM') {
        // car AM receiver: narrow IF (audio ≈ 120-2900 Hz), a little envelope-detector distortion
        FF(x, BW4('lp', 2900).concat([['lp', 3300, 0.6], ['hp', 120, 0.7]]));
        const fad = ctrl(n, 0.35, R), fd = 0.1 + (1 - c) * 0.45;
        for (let i = 0; i < n; i++) { const f = fd * (0.5 + 0.5 * fad[i]); const v = x[i] * (1 - f); x[i] = v + 0.18 * f * v * Math.abs(v); }
        // atmospheric static: hiss + crackle + the odd lightning crash, rising as the carrier fades
        const hiss = slice('amHiss', n, R, (Rr) => FF(pinkLoop(Rr), BW4('lp', 3000).concat([['hp', 150, 0.7]])));
        for (let i = 0; i < n; i++) bed[i] = hiss[i] * (1 + 2.5 * fd * (0.5 + 0.5 * fad[i]));
        addCrackle(bed, 22 + 40 * (1 - c), 5, R, 0, n, 150, 3000, 0.0018);
        const crashes = R.u() < 0.3 + (1 - c) ? 1 + Math.floor(R.u() * 2) : 0;
        for (let q = 0; q < crashes; q++) {
          const i0 = Math.round(R.r(0.2, Math.max(0.3, plan.dur - 0.3)) * SR), L = Math.round(R.r(0.08, 0.25) * SR);
          addCrackle(bed, 700, 9, R, i0, i0 + L, 150, 3000, 0.0008);
        }
        // co-channel heterodyne (very faint, drifting) + ignition buzz from our own engine
        const hf = R.r(300, 900), ha = 0.05 + 0.15 * (1 - c), ig = R.r(58, 72) / SR;
        let hc = ha, hs = 0, igp = 0;
        for (let i = 0; i < n; i++) {
          if ((i & 255) === 0) { const w = TWO_PI * (hf + 3 * Math.sin(i / SR * 0.7)) / SR; var hcw = Math.cos(w), hsw = Math.sin(w); }
          const nc = hc * hcw - hs * hsw; hs = hc * hsw + hs * hcw; hc = nc;
          igp += ig; if (igp >= 1) igp -= 1;
          bed[i] += hs + (igp < 0.02 ? 0.3 : 0);
        }
      } else {
        // FM: multipath swishes / picket fencing as the car moves, stereo-blend hiss, de-emphasis
        const fl = ctrl(n, 6, R), md = (1 - c) * 0.6;
        const g = noiseGen(R.u() * 4294967296);
        for (let i = 0; i < n; i++) { const d = clamp(-fl[i] - 0.45, 0, 1) * md; if (d > 0) x[i] = x[i] * (1 - d) + x[i] * g() * d * 0.6; }
        FF(x, [['hs', 2100, 0.7, -10]].concat(BW4('lp', 9000)));
        const hiss = slice('fmHiss', n, R, (Rr) => FF(whiteLoop(Rr), [['hs', 2100, 0.7, -10], ['hp', 200, 0.7]]));
        for (let i = 0; i < n; i++) bed[i] = hiss[i] * (1 + 3 * clamp(-fl[i] - 0.45, 0, 1) * md);
      }
      // car door speaker (cheap 6.5" paper cone) + cabin (glass/dash reflections), panel buzz
      const spk = [['hp', 110, 1.3], ['peak', 160, 1.5, 3], ['peak', 420, 1.2, -3], ['peak', 2600, 1.6, 3.5], ['lp', band === 'AM' ? 4200 : 6500, 0.8]];
      FF(x, spk); FF(bed, spk);
      reflections(x, [[1.4, 0.3], [2.9, -0.2], [4.3, 0.16], [6.7, 0.1], [9.8, 0.06]], 3500);
      for (let i = 0; i < n; i++) { const v = x[i]; if (v > 0.5) x[i] = 0.5 + (v - 0.5) * 0.6; }
      const fi = Math.round(0.25 * SR), fo = Math.round(0.28 * SR);
      for (let i = 0; i < fi && i < n; i++) bed[i] *= i / fi;
      for (let i = Math.max(0, n - fo); i < n; i++) { const e = (n - i) / fo; x[i] *= e; bed[i] *= e; }
      return { sig: x, bed };
    }

    /** NOAA Weather Radio: a 10 kHz DECtalk-era synthesiser into a transmitter, heard on a receiver. */
    function chanNOAA(dry, plan, S, o, R, c) {
      const x = copy(dry);
      F4(x, 'lp', 4600);
      { const step = SR / 10000; let acc = 0, hold = 0; for (let i = 0; i < x.length; i++) { acc += 1; if (acc >= step) { acc -= step; hold = Math.round(x[i] * 2048) / 2048; } x[i] = hold * 0.7 + x[i] * 0.3; } }
      return chanVHF(x, Object.assign({}, plan, { pops: [] }), S, Object.assign({}, o, { squelch: false }), R, Math.max(c, 0.6), { drive: 1.6 });
    }

    /** Landline telephone. */
    function chanPhone(dry, plan, S, o, R) {
      const n = dry.length + Math.round(0.1 * SR);
      const x = new Float32Array(n); x.set(dry);
      // carbon microphone: weak at low level (granule threshold), compressive, peaky around 1.3 kHz
      for (let i = 0; i < n; i++) { const v = x[i]; const a = Math.abs(v); x[i] = Math.sign(v) * (a < 0.01 ? a * 0.5 : 0.005 + (a - 0.01)); }
      F(x, 'peak', 1300, 1.2, 6);
      softclip(scale(x, 3), 1.6);
      F4(x, 'hp', 300); F4(x, 'lp', 3400);
      mulaw8k(scale(x, 0.5));
      FF(x, BW4('lp', 3500).concat([['hp', 280, 0.7], ['peak', 1000, 1, 2.5]]));
      const bed = slice('phHiss', n, R, (Rr) => FF(whiteLoop(Rr), BW4('hp', 300).concat(BW4('lp', 3400))));
      for (let i = 0; i < n; i++) { const t = i / SR; bed[i] = bed[i] * 0.5 + 0.35 * Math.sin(TWO_PI * 60 * t) + 0.25 * Math.sin(TWO_PI * 180 * t + 0.4) + 0.12 * Math.sin(TWO_PI * 300 * t); }
      return { sig: x, bed };
    }

    /** Cassette: [room mic + ALC] → print-through, saturation, head bump, HF loss, dropouts, wow & flutter. */
    function tapeProcess(x, plan, S, o, R, fromRadio) {
      const n = x.length;
      if (!fromRadio) {
        reflections(x, [[3.2, 0.35], [7.5, 0.22], [13, 0.15], [21, 0.1]], 3000);
        const room = slice('roomTone', n, R, (Rr) => FF(pinkLoop(Rr), [['lp', 900, 0.7]]));
        for (let i = 0; i < n; i++) x[i] += room[i] * 0.004;
        agc(x, 0.12, 0.02, 1.2, 8);
      }
      const off = Math.round(1.7 * SR);
      const echo = new Float32Array(n);
      for (let i = 0; i < n; i++) { if (i + off < n) echo[i] += x[i + off] * 0.006; if (i - off >= 0) echo[i] += x[i - off] * 0.004; }
      F(echo, 'lp', 2500, 0.7);
      F(x, 'hs', 3000, 0.7, 6); softclip(scale(x, 1.6), 1.2); F(x, 'hs', 3000, 0.7, -6);
      for (let i = 0; i < n; i++) x[i] += echo[i];
      FF(x, [['peak', 90, 1.1, 2], ['hp', 45, 0.7], ['lp', 7200, 0.8], ['lp', 9000, 0.6]]);
      const drops = 1 + Math.floor(R.u() * 3);
      for (let q = 0; q < drops; q++) {
        const i0 = Math.round(R.r(0.1, 0.9) * n), L = Math.round(R.r(0.01, 0.04) * SR), dep = R.r(0.3, 0.7);
        let y = 0;
        for (let j = 0; j < L && i0 + j < n; j++) { const e = Math.sin(Math.PI * j / L) * dep; y += 0.2 * (x[i0 + j] - y); x[i0 + j] = x[i0 + j] * (1 - e) + y * e; }
      }
      const wow = ctrl(n, 0.8, R), dly = new Float32Array(n);
      const wd = 0.0016 * SR * R.r(0.8, 1.2), ph = R.u() * 6;
      for (let i = 0; i < n; i++) { const t = i / SR; dly[i] = 40 + wd * wow[i] + 0.00018 * SR * Math.sin(TWO_PI * 7.1 * t + ph) + 0.00004 * SR * Math.sin(TWO_PI * 41 * t); }
      const y = varDelay(x, dly);
      const bed = slice('tapeHiss', n, R, (Rr) => FF(whiteLoop(Rr), [['hp', 2500, 0.6], ['lp', 9000, 0.7]]));
      return { x: y, bed };
    }

    function chanTape(dry, plan, S, o, R) {
      const n = dry.length + Math.round(0.2 * SR);
      const x = new Float32Array(n); x.set(dry);
      const t = tapeProcess(x, plan, S, o, R, false);
      FF(t.x, [['hp', 140, 0.9], ['peak', 2200, 1.2, 2], ['lp', 6500, 0.7]]); // portable player speaker
      return { sig: t.x, bed: t.bed };
    }

    function chanRoom(dry, plan, S, o, R) {
      const n = dry.length + Math.round(0.08 * SR);
      const x = new Float32Array(n); x.set(dry);
      FF(x, [['ls', 200, 0.7, 1.5], ['hs', 6000, 0.7, -2]]);
      reflections(x, [[2.6, 0.28], [5.9, 0.16], [9.7, 0.1], [14.3, 0.07]], 4500);
      return { sig: x, bed: null };
    }

    /**
     * Pure render: text + voiceParams + opts → dry voice, channel signal and noise bed (22.05 kHz).
     */

    /* ============================================================== NATURAL: line render
     * text + vp + opts → the line as heard through its device: {sig, bed} at the device rate.
     * Everything below runs on the main thread (OfflineAudioContext, fallback) or in the worker.
     */
    const SR_HI = 22050, SR_LO = 11025;
    // in-person speech keeps the talker's own dynamics (klatt's per-speaker calibration); this trim
    // puts the median line at the classic engine's level through the same voice bus
    const ROOM_TRIM = 0.84;
    const bandOf = (o) => (String((o && o.band) || 'AM').toUpperCase() === 'FM' ? 'FM' : 'AM');
    /** What the device models need from a klatt plan: speech start, breath and plosive times. */
    function devicePlan(P, dur) {
      const segs = P.segs || [];
      let lead = 0.05;
      for (const s of segs) if (!s.pause) { lead = s.t0; break; }
      const breaths = [], pops = [];
      for (const e of P.events || []) if (e.k === 'breath') breaths.push(e.t0);
      for (const s of segs) {
        if (!s.pause && (s.p === 'P' || s.p === 'B') && s.onset && s.sy && s.sy.stressed) pops.push({ t: s.t1, a: s.p === 'P' ? 1 : 0.6 });
      }
      return { dur, end: P.end || 0.05, lead, breaths, pops };
    }
    /**
     * Render one line. o: {dur (seconds; = lineDur(text)), speaker, radio, phone, tape, squelch,
     * clarity, band 'AM'|'FM', carRadio, channel, bed (false: no music under the DJ), clock (context
     * time, aligns the DJ's music bed across lines), seed, whisper, sr}.
     */
    function render(text, vp, o) {
      o = o || {};
      if (o.scream) {
        // a wordless cry (dry; the caller's chain places it): same message shape as a line
        const q = scream(vp, o);
        return { sr: q.sr, dur: q.dur, tail: 0, sig: q.sig, bed: null, bedGain: 0, channel: 'room', band: 'AM', clarity: 1, lead: q.lead, end: q.end, ms: q.ms, msSynth: q.ms };
      }
      const ms0 = nowMs();
      text = String(text == null ? '' : text);
      vp = vp || params({}, 'unknown');
      const dur = num(o.dur, lineDurFallback(text));
      const ch = channelFor(o.speaker || vp.id, o, vp);
      const band = bandOf(o);
      const wide = ch === 'room' || ch === 'tape' || (ch === 'broadcast' && band === 'FM');
      SR = num(o.sr, wide ? SR_HI : SR_LO);
      const c = clamp(num(o.clarity, 1), 0, 1);
      const keyed = ch === 'vhf' || ch === 'cb';
      // lead-in: keyed radios leave room for the key-up; the car radio's music is already playing
      const lead = keyed ? (o.squelch ? 0.15 : 0.1) : ch === 'broadcast' ? 0.16 : 0.05;
      const job = prepare(text, vp, dur, { sampleRate: SR, seed: o.seed, whisper: !!o.whisper, lead });
      const dry = new Float32Array(Math.max(job.N, 32));
      if (!job.empty) { synthRange(job, dry, 0, job.N, 0); post(job, dry, 0, job.N); }
      const ms1 = nowMs();
      const plan = devicePlan(job.P, dur);
      const S = { synthetic: !!vp.synthetic };
      const R = makeRng(hashStr(text + '|' + ch + '|' + (vp.id || '')) ^ (num(o.seed, 0) >>> 0) ^ 0x5bd1e995);
      let src = dry;
      if (o.tape && o.radio && ch !== 'tape') {
        // a cassette played into a transmitter: the tape (and its hiss) goes on the air
        const tp = tapeProcess(copy(dry), plan, S, o, R, false);
        for (let i = 0; i < tp.x.length; i++) tp.x[i] += tp.bed[i] * 0.012;
        src = tp.x;
      }
      let res;
      switch (ch) {
        case 'broadcast': res = chanBroadcast(src, plan, S, o, R, c); break;
        case 'cb': res = chanCB(src, plan, S, o, R, c); break;
        case 'noaa': res = chanNOAA(src, plan, S, o, R, c); break;
        case 'phone': res = chanPhone(src, plan, S, o, R); break;
        case 'tape': res = chanTape(src, plan, S, o, R); break;
        case 'room': res = chanRoom(src, plan, S, o, R); break;
        default: res = chanVHF(src, plan, S, o, R, c);
      }
      const lv = clarityLevels(ch, c, band);
      if (ch === 'room') {
        scale(res.sig, ROOM_TRIM);
        limit(res.sig, 0.9);
      } else {
        // devices: every line lands at the device's speech level (transmitter ALC / AGC), peaks limited
        const L = num(LEVEL[ch], -15);
        for (let it = 0; it < 2; it++) {
          scale(res.sig, Math.pow(10, (L - speechLevel(res.sig)) / 20));
          limit(res.sig, Math.pow(10, (L + (CREST[ch] || 10)) / 20));
        }
        scale(res.sig, lv.v);
      }
      if (res.bed) unitRms(res.bed);
      return {
        sr: SR, dur, tail: tailOf(ch), sig: res.sig, bed: res.bed || null, bedGain: res.bed ? lv.n : 0,
        channel: ch, band, clarity: c, lead: plan.lead, end: plan.end, ms: nowMs() - ms0, msSynth: ms1 - ms0,
      };
    }
    /**
     * A wordless cry on the same talker ("you" screams with your own throat): a sharp gasp, then a
     * pressed, high /a/ (open jaw, raised F1) that rises, holds shaking, breaks (sub-harmonic /
     * creak / a yodel flip), and falls away to /ɔ/, with a breathy attack and a ragged aspirated
     * offset. o: {sr, seed, dur, shout (a short shouted cry)}. Dry (no device) →
     * {sr, sig, dur, lead, end, ms}. Pure (seeded); worker-safe.
     */
    function scream(vp, o) {
      o = o || {};
      const ms0 = nowMs();
      const sr = num(o.sr, SR_HI);
      vp = vp || params({}, 'unknown');
      const seed = ((num(o.seed, 1) >>> 0) ^ hashStr('scream|' + (vp.id || ''))) >>> 0;
      const rng = seeded(seed), gauss = gaussFn(rng), rr = (a, b) => a + rng() * (b - a);
      const shout = !!o.shout;
      const S = speaker(Object.assign({}, vp, { panic: 1, synthetic: false }));
      // vocal effort: pressed and unsteady — jitter, shimmer, a fast shake, rough pulse pairs
      S.jit += 0.008; S.shim += 0.045; S.flutter = 0.016; S.tremor = shout ? 0.015 : 0.03; S.tremorHz = rr(5.4, 6.8);
      S.shake = shout ? 0.012 : 0.022; S.subP = shout ? 0.15 : 0.45; S.dip = 0.04; S.dB1 = 40; S.aspN = 0.03; S.wrong = false;
      const male = S.g === 'm' || S.g === 'n';
      const f0s = S.pitch * (male ? rr(2.55, 2.95) : rr(2.35, 2.65)) * (shout ? 0.8 : 1);
      const dur = clamp(num(o.dur, shout ? rr(0.65, 0.95) : rr(1.35, 1.9)), 0.4, 4);
      const t0 = shout ? rr(0.06, 0.1) : rr(0.2, 0.3); // voice onset (a gasp first)
      const t1 = t0 + dur;
      const total = t1 + 0.28;
      const N = Math.max(HOP, Math.floor((total * sr) / HOP) * HOP);
      const NF = Math.ceil(N / HOP) + 2, fsec = HOP / sr;
      const fr = (t) => clamp(Math.round(t / fsec), 0, NF - 1);
      const T = {
        NF, fsec,
        F: [new Float32Array(NF), new Float32Array(NF), new Float32Array(NF)],
        B: [new Float32Array(NF), new Float32Array(NF), new Float32Array(NF)],
        AV: new Float32Array(NF), AH: new Float32Array(NF), AF: new Float32Array(NF), AB: new Float32Array(NF),
        FNZ: new Float32Array(NF), BNZ: new Float32Array(NF), NAS: new Float32Array(NF),
        lnF0: new Float32Array(NF), RD: new Float32Array(NF), CR: new Float32Array(NF), VF: new Float32Array(NF),
        shape: new Int16Array(NF).fill(-1), shapes: [], BR: new Float32Array(NF),
      };
      // vowel: open-jaw /a/ (F1 up) sliding to /ɔ/ as it dies
      const fA = [rr(930, 1020), rr(1300, 1420), rr(2600, 2800)], fO = [rr(680, 740), rr(1000, 1100), 2550];
      const sF = (f, k) => f * S.fs * S.fq[k];
      const kF0 = shout ? [[0, 0.86], [0.18, 1.04], [0.45, 1.0], [0.8, 0.9], [1, 0.74]] : [[0, 0.7], [0.1, 1.0], [0.26, 1.16], [0.55, 1.1], [0.78, 0.96], [0.92, 0.8], [1, 0.6]];
      const at = (keys, x) => { for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return lerp(a[1], b[1], (x - a[0]) / Math.max(1e-6, b[0] - a[0])); } return keys[keys.length - 1][1]; };
      const wob = new Float32Array(NF), amw = new Float32Array(NF);
      for (let i = 0; i < NF; i++) { wob[i] = gauss() * 0.05; amw[i] = gauss() * 0.14; }
      smoothC(wob, 0.06, fsec); smoothC(amw, 0.05, fsec);
      for (let i = 0; i < NF; i++) {
        const t = i * fsec, x = clamp((t - t0) / dur, 0, 1);
        const m = clamp((x - 0.55) / 0.45, 0, 1);
        for (let k = 0; k < 3; k++) { T.F[k][i] = sF(lerp(fA[k], fO[k], m * m), k); T.B[k][i] = [95, 115, 175][k] * S.bwMul * S.bq; }
        T.lnF0[i] = Math.log(f0s * at(kF0, x)) + wob[i];
        // pressed in the body of the cry, breathier at its edges
        T.RD[i] = x < 0.08 ? lerp(1.1, 0.5, x / 0.08) : x > 0.85 ? lerp(0.5, 1.2, (x - 0.85) / 0.15) : 0.5 + 0.05 * Math.sin(t * 9);
        let a = 0;
        if (t >= t0 && t <= t1) {
          const up = shout ? 0.035 : 0.07;
          a = t - t0 < up ? (t - t0) / up : 1;
          if (x > 0.72) a *= lerp(1, 0.35, (x - 0.72) / 0.28);
          a *= Math.exp(amw[i]);
        }
        T.AV[i] = a;
        T.FNZ[i] = 270 * Math.sqrt(S.fs);
        T.BNZ[i] = 100;
      }
      T.FNP = 270 * Math.sqrt(S.fs);
      // aspiration: a breathy attack, a little turbulence under the cry, a ragged aspirated tail
      for (let i = fr(t0 - 0.04); i < fr(t0 + 0.03); i++) T.AH[i] = dB(-12);
      for (let i = fr(t0 + 0.03); i < fr(t1); i++) T.AH[i] = dB(-30);
      for (let i = fr(t1 - 0.05); i < fr(t1 + 0.16); i++) T.AH[i] = dB(-15) * (1 - (i - fr(t1 - 0.05)) / Math.max(1, fr(t1 + 0.16) - fr(t1 - 0.05)));
      // the gasp before it
      if (!shout) {
        const g0 = fr(0.015), g1 = fr(t0 - 0.03);
        for (let i = g0; i < g1; i++) { const u = (i - g0) / Math.max(1, g1 - g0); T.BR[i] = 1.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 1.4); }
      }
      // voice breaks: a sub-harmonic crack or two, and (screams only) a flip up for a moment
      const nb = shout ? 1 : 1 + (rng() < 0.6 ? 1 : 0);
      for (let b = 0; b < nb; b++) {
        const tb = t0 + dur * rr(0.3, 0.75), lb = rr(0.04, 0.09);
        for (let i = fr(tb); i < fr(tb + lb); i++) { T.CR[i] = Math.max(T.CR[i], 0.65); T.AV[i] *= 0.75; }
      }
      if (!shout && rng() < 0.7) { const tf = t0 + dur * rr(0.2, 0.45); for (let i = fr(tf); i < fr(tf + rr(0.05, 0.09)); i++) T.lnF0[i] += 0.14; }
      smoothC(T.AV, 0.006, fsec); smoothC(T.AH, 0.008, fsec); smoothC(T.RD, 0.02, fsec); smoothC(T.CR, 0.01, fsec);
      smoothC(T.lnF0, 0.01, fsec); smoothC(T.BR, 0.01, fsec);
      for (let k = 0; k < 3; k++) smoothC(T.F[k], 0.02, fsec);
      const job = { P: { seed }, S, T, sr, N, opts: {} };
      const sig = new Float32Array(N);
      synthRange(job, sig, 0, N, 0);
      // loud, but a scream is not louder than the mix: a fixed speech level, peaks soft-limited
      const r = actRms(sig, sr);
      scale(sig, (TARGET * 1.45) / Math.max(1e-9, r));
      for (let i = 0; i < N; i++) { const v = sig[i], a2 = v < 0 ? -v : v; if (a2 > 0.72) sig[i] = (v < 0 ? -1 : 1) * (0.72 + 0.26 * Math.tanh((a2 - 0.72) / 0.26)); }
      const f = Math.min(N, Math.round(sr * 0.02));
      for (let i = 0; i < f; i++) sig[N - 1 - i] *= i / f;
      return { sr, sig, dur: total, lead: t0, end: t1, ms: nowMs() - ms0 };
    }
    /** The dry voice alone (no device): {data, sr, end, plan}. Dev tools, whispers. */
    function voiceOnly(text, vp, dur, o) {
      o = o || {};
      text = String(text == null ? '' : text);
      vp = vp || params({}, 'unknown');
      dur = num(dur, lineDurFallback(text));
      const sr = num(o.sr, SR_HI);
      const job = prepare(text, vp, dur, { sampleRate: sr, seed: o.seed, whisper: !!o.whisper, lead: o.lead });
      const data = new Float32Array(Math.max(job.N, 32));
      if (!job.empty) { synthRange(job, data, 0, job.N, 0); post(job, data, 0, job.N); }
      return { data, sr, end: job.empty ? 0.05 : job.P.end, plan: job.P };
    }
    /**
     * The plan in the classic voicePlan() shape (dev harness): syl [{t0, t1, v, stressed, word,
     * f0}], f0 [[t, Hz]], voice [[t, 0..1]], end, plus phones [{p, t0, t1}] and the Fujisaki
     * commands.
     */
    function planInfo(text, vp, dur) {
      text = String(text == null ? '' : text);
      vp = vp || params({}, 'unknown');
      dur = num(dur, lineDurFallback(text));
      const P = plan(text, vp, dur, {});
      const out = { engine: 'natural', end: P.end || 0.05, dur, f0: [], voice: [], breath: [], F: [], nas: [], cons: [], syl: [], phones: [], accents: P.accents || [], phraseCmds: P.pcmds || [] };
      if (!P.segs.length) return out;
      const sr = 11025, N = Math.max(HOP, Math.floor((Math.min(dur, P.end + 0.18) * sr) / HOP) * HOP);
      const T = tracks(P, sr, N);
      let avMax = 1e-9;
      for (let i = 0; i < T.NF; i++) if (T.AV[i] > avMax) avMax = T.AV[i];
      const step = Math.max(1, Math.round(0.01 / T.fsec));
      for (let i = 0; i < T.NF; i += step) {
        const t = i * T.fsec;
        out.voice.push([t, T.AV[i] / avMax]);
        out.breath.push([t, T.AH[i] + T.BR[i] * 0.3]);
        if (T.AV[i] > avMax * 0.05) out.f0.push([t, Math.exp(T.lnF0[i])]);
        out.F.push([t, T.F[0][i], T.F[1][i], T.F[2][i]]);
      }
      const fAt = (t) => Math.exp(T.lnF0[clamp(Math.round(t / T.fsec), 0, T.NF - 1)]);
      for (const sy of P.allSyl || []) {
        const nuc = sy.nuc;
        out.syl.push({ t0: sy.t0, t1: sy.t1, v: nuc ? nuc.p.toLowerCase() : '·', stressed: !!sy.stressed, accented: !!sy.accented, word: sy.w ? sy.w.word : '', f0: Math.round(fAt(nuc ? (nuc.t0 + nuc.t1) / 2 : (sy.t0 + sy.t1) / 2)) });
      }
      for (const s of P.segs) if (!s.pause) out.phones.push({ p: s.p, t0: s.t0, t1: s.t1 });
      return out;
    }
    /**
     * JIT warm-up: short lines through the common devices, a few rounds so the DSP loops reach
     * V8's optimising tier before the first real line (≈ 0.1–0.3 s once; in the worker it costs
     * the main thread nothing).
     */
    let warmed = false;
    function warm(rounds) {
      if (warmed) return 0;
      warmed = true;
      const a = nowMs();
      try {
        const m = params({ pitch: 1, gender: 'm', breathy: 0.2, rasp: 0.2 }, 'warm');
        const f = params({ pitch: 1.8, gender: 'f', breathy: 0.3 }, 'warm2');
        for (let i = 0; i < num(rounds, 3); i++) {
          render('Station fourteen, this is the ditch. Should she check?', m, { dur: 2.2, radio: true, squelch: true, clarity: 0.8, seed: i });
          render('Hello, who is it? I think somebody was there.', f, { dur: 2.2, seed: i });
          render('Flash flood watch through Thursday, folks.', m, { dur: 1.9, radio: true, speaker: 'dj', clarity: 0.8, seed: i });
        }
      } catch (e) { /* ignore */ }
      return nowMs() - a;
    }

    /**
     * Any mono signal (at 11.025 kHz for the narrowband devices, 22.05 kHz for room/tape/FM)
     * through a device: → {sig, bed, sr}. Dev pages and tests (hear a recording on the radio).
     */
    function device(x, o) {
      o = o || {};
      const ch = channelFor(o.speaker, o, { synthetic: !!o.synthetic });
      SR = num(o.sr, SR_LO);
      const dur = num(o.dur, x.length / SR);
      const plan = { dur, end: num(o.end, dur), lead: num(o.lead, 0.05), breaths: [], pops: [] };
      const R = makeRng(num(o.seed, 1) >>> 0);
      const S = { synthetic: !!o.synthetic };
      const c = clamp(num(o.clarity, 1), 0, 1);
      const f = { broadcast: chanBroadcast, cb: chanCB, noaa: chanNOAA, phone: chanPhone, tape: chanTape, room: chanRoom }[ch] || chanVHF;
      const res = f(Float32Array.from(x), plan, S, o, R, c);
      const lv = clarityLevels(ch, c, bandOf(o));
      if (ch !== 'room') {
        const L = num(LEVEL[ch], -15);
        for (let it = 0; it < 2; it++) { scale(res.sig, Math.pow(10, (L - speechLevel(res.sig)) / 20)); limit(res.sig, Math.pow(10, (L + (CREST[ch] || 10)) / 20)); }
        scale(res.sig, lv.v);
      }
      if (res.bed) { unitRms(res.bed); scale(res.bed, lv.n); }
      return { sig: res.sig, bed: res.bed || null, sr: SR, channel: ch };
    }

    return {
      render, voiceOnly, planInfo, warm, channelFor, clarityLevels, params, speaker, device, scream,
      phonemes(text) { return phonemize(text).map((it) => (it.brk ? it.brk : [it.word, it.ph.join(' ')])); },
      _internal: { plan, tracks, prepare, synthRange, post, calibrate, tokenize, wordPhones, LEX, LEVEL, CREST, TAIL, TAIL_BROADCAST, devicePlan },
    };
  }

  /* ------------------------------------------------ natural voice: main-thread side
   * Realtime contexts render in a Blob worker (the same daNaturalVoice source), so voice() costs
   * well under a millisecond on the main thread; the finished line is scheduled sample-exactly
   * against t0 (a late render first eats the line's silent lead-in, then plays up to 150 ms late,
   * and beyond that skips its head so it still ends in time). OfflineAudioContext, opts.sync,
   * a cold or missing worker → rendered synchronously here instead.
   */
  const VOICE_STYLES = ['natural', 'classic', 'system'];
  /** 'natural' | 'classic' | 'system' — per call (o.style), else DA.settings (tts:true = 'system'). */
  function voiceStyle(o) {
    const pick = (v) => { v = String(v || '').toLowerCase(); return VOICE_STYLES.indexOf(v) >= 0 ? v : null; };
    const own = o && pick(o.style);
    if (own) return own;
    const s = DA.settings || {};
    if (s.tts === true) return 'system';
    return pick(s.voiceStyle) || 'natural';
  }
  let NVM = null;
  /** The main-thread engine instance (built on first use: ≈ 2 ms for its tables). */
  function nvMain() {
    if (!NVM) NVM = daNaturalVoice(typeof window !== 'undefined' ? window : globalThis, false);
    return NVM;
  }
  const NVW = { w: null, fail: false, ready: false, seq: 0, jobs: new Map() };
  function nvWorker() {
    if (NVW.w || NVW.fail) return NVW.w;
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) throw new Error('no Worker');
      const src = 'var NV = (' + daNaturalVoice.toString() + ')(self, true);\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data;\n' +
        '  if (d.warm) { var ms = 0; try { ms = NV.warm(); } catch (err) { /* ignore */ } self.postMessage({ warm: true, ms: ms }); return; }\n' +
        '  try {\n' +
        '    var r = NV.render(d.text, d.vp, d.o), tr = [r.sig.buffer];\n' +
        '    if (r.bed) tr.push(r.bed.buffer);\n' +
        '    self.postMessage({ id: d.id, r: r }, tr);\n' +
        '  } catch (err) { self.postMessage({ id: d.id, err: String((err && err.message) || err) }); }\n' +
        '};\n';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.warm) { NVW.ready = true; return; }
        const j = NVW.jobs.get(d.id);
        if (!j) return;
        NVW.jobs.delete(d.id);
        clearTimeout(j.timer);
        if (d.err) j.reject(new Error(d.err)); else j.resolve(d.r);
      };
      w.onerror = (e) => {
        warnOnce('voice worker', e && e.message);
        NVW.fail = true; NVW.ready = false;
        for (const j of NVW.jobs.values()) { clearTimeout(j.timer); j.reject(new Error('worker failed')); }
        NVW.jobs.clear();
        try { w.terminate(); } catch (_) { /* ignore */ }
        NVW.w = null;
      };
      NVW.w = w;
      w.postMessage({ warm: true });
    } catch (e) { NVW.fail = true; NVW.w = null; }
    return NVW.w;
  }
  function nvAsync(text, vp, o) {
    const w = nvWorker();
    if (!w) return Promise.reject(new Error('no worker'));
    const id = ++NVW.seq;
    return new Promise((resolve, reject) => {
      // a render never takes this long; if the worker hangs, fall back to the main thread
      const timer = setTimeout(() => { if (NVW.jobs.delete(id)) reject(new Error('worker timeout')); }, 2500);
      NVW.jobs.set(id, { resolve, reject, timer });
      try { w.postMessage({ id, text: String(text), vp, o }); } catch (e) { NVW.jobs.delete(id); clearTimeout(timer); reject(e); }
    });
  }
  /** Plain-data copy of voiceParams (worker messages carry numbers, strings and booleans only). */
  function nvPlainVp(vp) {
    const out = {};
    for (const key in vp || {}) { const v = vp[key]; if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[key] = v; }
    return out;
  }
  /** The car radio of the drive scenes: {band} while a drive is on screen with its radio on. */
  function carRadioBand() {
    try {
      const S = DA.scenes;
      if (!S || typeof S.current !== 'function' || S.current() !== 'drive' || typeof S.scene !== 'function') return null;
      const sc = S.scene();
      const rr = sc && sc.road && sc.road.radio;
      if (!rr || rr.on === false) return null;
      return /FM/i.test(String(rr.band || '')) ? 'FM' : 'AM';
    } catch (e) { return null; }
  }
  /** voice() opts → the plain render opts the engine (and its worker) understand. */
  function nvOpts(text, speakerId, dur, o, t0) {
    const ro = {
      dur, speaker: String(speakerId == null ? '' : speakerId), radio: !!o.radio, phone: !!o.phone, tape: !!o.tape,
      squelch: !!o.squelch, clarity: clamp(num(o.clarity, 1), 0, 1), clock: num(t0, 0),
    };
    if (typeof o.channel === 'string') ro.channel = o.channel;
    if (o.band != null) ro.band = /FM/i.test(String(o.band)) ? 'FM' : 'AM';
    if (o.carRadio) ro.carRadio = true;
    if (o.bed === false) ro.bed = false;
    if (o.seed != null && isFinite(o.seed)) ro.seed = o.seed >>> 0;
    if (o.radio && !o.phone && !ro.channel && !ro.carRadio && ro.band == null) {
      const b = carRadioBand();
      if (b) { ro.carRadio = true; ro.band = b; }
    }
    return ro;
  }
  /* screams (SFX 'scream_distant'): a few rendered variants per speaker, plain data shared by
   * every context; the worker prefetches them, a first use before that renders one here */
  const SCREAMS = new Map(); // speakerId → {items: [{sr, sig, seed}], seeds: Set, pending}
  const SCREAM_VARIANTS = 3;
  function screamList(id, shout) {
    const key = id + (shout ? ':shout' : '');
    let L = SCREAMS.get(key);
    if (!L) SCREAMS.set(key, (L = { items: [], seeds: new Set(), pending: false }));
    return L;
  }
  function screamPrefetch(speakerId, shout) {
    const id = speakerId || 'you', L = screamList(id, shout);
    if (L.pending || L.items.length >= SCREAM_VARIANTS || !nvWorker() || !NVW.ready) return;
    L.pending = true;
    const vp = nvPlainVp(voiceParams(id));
    const jobs = [];
    for (let seed = 1; seed <= SCREAM_VARIANTS; seed++) {
      if (L.seeds.has(seed)) continue;
      L.seeds.add(seed);
      jobs.push(nvAsync('', vp, { scream: true, shout: !!shout, seed, sr: 22050 }).then((r) => { L.items.push({ sr: r.sr, sig: r.sig, seed }); }, () => { L.seeds.delete(seed); }));
    }
    Promise.all(jobs).then(() => { L.pending = false; });
  }
  function screamData(speakerId, u, shout) {
    const id = speakerId || 'you', L = screamList(id, shout);
    if (!L.items.length) {
      const seed = 1;
      const r = nvMain().scream(nvPlainVp(voiceParams(id)), { seed, shout: !!shout, sr: 22050 });
      L.seeds.add(seed);
      L.items.push({ sr: r.sr, sig: r.sig, seed });
    }
    screamPrefetch(id, shout);
    return L.items[Math.floor(clamp(u, 0, 0.9999) * L.items.length)];
  }
  const NV_CACHE = [];
  const NV_CACHE_MAX = 12;
  function nvKey(text, vp, ro, ch) {
    return JSON.stringify([text, vp.id, vp.gender, vp.pitch, vp.rate, vp.formant, vp.breathy, vp.rasp, vp.age, vp.range, vp.panic, vp.synthetic,
      ch, ro.radio, ro.phone, ro.tape, ro.squelch, ro.band, ro.bed, ro.seed, Math.round(ro.clarity * 20),
      ch === 'broadcast' && ro.bed !== false ? Math.round(ro.clock * 4) : 0]);
  }
  function nvCacheGet(key) {
    for (let i = 0; i < NV_CACHE.length; i++) if (NV_CACHE[i].key === key) { const e = NV_CACHE.splice(i, 1)[0]; NV_CACHE.push(e); return e.r; }
    return null;
  }
  function nvCachePut(key, r) {
    NV_CACHE.push({ key, r });
    while (NV_CACHE.length > NV_CACHE_MAX) NV_CACHE.shift();
    return r;
  }
  const isOfflineCtx = (ctx) => (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) ||
    (typeof webkitOfflineAudioContext !== 'undefined' && ctx instanceof webkitOfflineAudioContext); // eslint-disable-line no-undef
  /** Extra drop-outs only when the live signal is worse than the clarity the line was rendered at. */
  const gateBias = (c, c0) => -0.9 + 1.15 * Math.max(0, Math.pow(c0, 0.85) - Math.pow(c, 0.85));
  /**
   * Schedule a natural line on engine E into `inG` (the voice's volume stage) at t0.
   * Graph: rendered speech → vG (clarity level) ┐
   *        rendered noise bed → nG (clarity)   ┴→ devOut → [live drop-out gate] → inG
   * Sets h.radio (live clarity), h.nv (state), h.nvTail (seconds the device rings on after dur).
   */
  function naturalVoice(E, h, inG, t0, text, speakerId, vp, dur, o) {
    const k = E.k, ctx = E.ctx, NV = nvMain();
    const pvp = nvPlainVp(vp);
    const ro = nvOpts(text, speakerId, dur, o, t0);
    const ch = NV.channelFor(ro.speaker || pvp.id, ro, pvp);
    const band = ro.band || 'AM';
    const devOut = gain(k, 1);
    const vG = gain(k, 1), nG = gain(k, 0);
    vG.connect(devOut); nG.connect(devOut);
    const st = { r: null, c0: ro.clarity, cLive: null, bias: null, ch, srcs: [], ms: 0, sync: false };
    h.nv = st;
    let node = devOut;
    if (o.radio && (ch === 'vhf' || ch === 'cb' || ch === 'noaa')) {
      const T = dur + 1.2;
      const drop = gain(k, 0);
      const gIn = gain(k, 1);
      chain(ctrl(k, t0, T, 2.6), gain(k, 0.5), gIn);
      st.bias = konst(k, gateBias(ro.clarity, ro.clarity), t0, T);
      st.bias.connect(gIn);
      chain(gIn, shaper(k, 'gate'), drop.gain);
      node = chain(devOut, drop);
    }
    node.connect(inG);
    const lvl = (c) => NV.clarityLevels(ch, c, band);
    const set = (c, when, tc) => {
      c = clamp(num(c, 1), 0, 1);
      st.cLive = c;
      when = Math.max(0, num(when, ctx.currentTime));
      tc = num(tc, 0.08);
      const L = lvl(c), L0 = lvl(st.c0);
      approach(vG.gain, L.v / Math.max(1e-6, L0.v), when, tc);
      if (st.r && st.r.bed) approach(nG.gain, L.n, when, tc);
      if (st.bias) approach(st.bias.offset, gateBias(c, st.c0), when, tc);
    };
    if (o.radio) h.radio = { set };
    h.nvTail = ch === 'broadcast' ? 0.75 : 0.35;
    const offline = isOfflineCtx(ctx);
    const attach = (r) => {
      st.r = r;
      if (h.stopped || h.done || ctx.state === 'closed') return;
      const nowT = ctx.currentTime, eps = offline ? 0 : 0.006;
      const late = Math.max(t0, nowT + eps) - t0;
      if (late > dur) return; // far too late to be of any use
      const free = Math.max(0, num(r.lead, 0) - 0.03);
      const skip = Math.max(0, Math.min(late, free), late - 0.15);
      const when = Math.max(t0 + late - Math.min(late, free), nowT + eps);
      const startAt = when - skip;
      const mk = (arr, dest) => {
        const b = ctx.createBuffer(1, arr.length, r.sr);
        if (b.copyToChannel) b.copyToChannel(arr, 0); else b.getChannelData(0).set(arr);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(dest);
        s.start(when, Math.min(skip, Math.max(0, arr.length / r.sr - 0.01)));
        s.stop(startAt + arr.length / r.sr + 0.02);
        h.nodes.push(s); st.srcs.push(s);
      };
      mk(r.sig, vG);
      if (r.bed && r.bedGain > 0) {
        nG.gain.setValueAtTime(st.cLive != null ? lvl(st.cLive).n : r.bedGain, Math.max(0, nowT));
        mk(r.bed, nG);
      }
      if (st.cLive != null) set(st.cLive, nowT, 0.01);
      st.late = startAt - t0;
      if (!h.stopped) h.end = Math.max(isFinite(h.end) ? h.end : 0, startAt + r.sig.length / r.sr + 0.05);
    };
    const key = nvKey(text, pvp, ro, ch);
    const hit = nvCacheGet(key);
    const syncRender = () => { const a = nowSec(); const r = NV.render(text, pvp, ro); st.ms = (nowSec() - a) * 1000; st.sync = true; return nvCachePut(key, r); };
    if (hit) attach(hit);
    else if (offline || o.sync || !nvWorker() || !NVW.ready) attach(syncRender());
    else {
      nvAsync(text, pvp, ro).then((r) => attach(nvCachePut(key, r)), (e) => {
        warnOnce('voice worker render', e);
        try { attach(syncRender()); } catch (err) { warnOnce('natural voice', err); }
      });
    }
    return st;
  }

  /* ============================================================= PRIMITIVES */
  /** Pitch-dropping sine/triangle body hit. */
  function thump(k, out, t, f0, f1, t60, amp, type) {
    const o = osc(k, type || 'sine', f0, t, t60 + 0.06);
    glide(o.frequency, t, f0, f1, Math.min(0.09, t60 * 0.5));
    const g = gain(k, 0);
    perc(g.gain, t, amp, 0.002, t60);
    chain(o, g, out);
  }
  /** Filtered noise burst. s: {color, type, f, f1, q, a, t60, amp, dur, rate} */
  function burst(k, out, t, s) {
    const a = s.a || 0.002;
    const len = s.dur || a + s.t60 * 1.1 + 0.02;
    const src = noise(k, s.color || 'white', t, len, s.rate);
    const bq = filt(k, s.type || 'bandpass', s.f || 1000, s.q == null ? 1 : s.q);
    if (s.f1) glide(bq.frequency, t, s.f, s.f1, s.fdur || len);
    const g = gain(k, 0);
    perc(g.gain, t, s.amp == null ? 0.5 : s.amp, a, s.t60 || 0.1);
    chain(src, bq, g, out);
    return g;
  }
  /** Bank of decaying sines: modes = [[freq, t60, amp], …]. */
  function modal(k, out, t, modes, amp, P) {
    amp = amp == null ? 1 : amp;
    for (const [f, t60, a] of modes) {
      const o = osc(k, 'sine', f * (P || 1) * rnd(0.985, 1.015), t, t60 + 0.02);
      const g = gain(k, 0);
      perc(g.gain, t, a * amp, 0.0015, t60);
      chain(o, g, out);
    }
  }
  function click(k, out, t, f, amp, t60, q) {
    return burst(k, out, t, { f: f || 3000, q: q || 0.8, a: 0.0004, t60: t60 || 0.012, amp: amp == null ? 0.4 : amp });
  }
  /** Stick-slip friction source: narrow pulse train with a frequency contour and jitter. */
  function friction(k, t, dur, contour, jit, jitRate) {
    const o = osc(k, wave(k, 'pulse'), contour[0][1], t, dur + 0.05);
    env(o.frequency, t, contour);
    if (jit) chain(ctrl(k, t, dur + 0.05, jitRate || 9), gain(k, jit), o.frequency);
    return o;
  }
  /** Parallel resonances: res = [[f, Q, gain], …]. */
  function resBank(k, input, out, res) {
    for (const [f, q, g] of res) chain(input, filt(k, 'bandpass', f, q), gain(k, g), out);
  }
  /** Sustained noise swell: s {color, type, f, f1, q, pts:[[dt,v]…], rate} */
  function swell(k, out, t, s) {
    const len = s.pts[s.pts.length - 1][0] + 0.05;
    const src = noise(k, s.color || 'pink', t, len, s.rate);
    const bq = filt(k, s.type || 'bandpass', s.f, s.q == null ? 0.8 : s.q);
    if (s.f1) glide(bq.frequency, t, s.f, s.f1, s.fdur || len);
    const g = gain(k, 0);
    env(g.gain, t, s.pts);
    chain(src, bq, g, out);
    return { g, bq };
  }
  /** Play a grain buffer (optionally filtered) into out. */
  function grainPlay(k, out, t, b, amp, rate, f) {
    const s = bufSrc(k, b, t, rate || 1);
    const g = gain(k, amp);
    if (f) chain(s, f, g, out); else chain(s, g, out);
    return b.duration / (rate || 1);
  }

  /* ---------------------------------------------------------- grain renders */
  const GR = {
    glass(L, R, sr) {
      const B = G.burst, M = G.mode;
      B(L, R, sr, 0.02, 0.05, 0.9, 0.018, 1, 0, true);
      M(L, R, sr, 0.02, rnd(130, 170), 0.08, 0.5, 0);
      for (let i = 0; i < 46; i++) {
        const t = 0.022 + Math.min(1.1, -Math.log(1 - Math.random()) * 0.16);
        const a = rnd(0.05, 0.35) * Math.exp(-t * 2.2);
        const p = rnd(-0.8, 0.8);
        const f = rnd(2400, 9800);
        M(L, R, sr, t, f, rnd(0.03, 0.22), a, p, rnd(0, 6));
        M(L, R, sr, t, f * rnd(1.9, 2.7), rnd(0.02, 0.1), a * 0.5, p);
        if (Math.random() < 0.4) B(L, R, sr, t, 0.01, a * 0.8, 0.006, 1, p, true);
      }
      for (const bt of [rnd(0.2, 0.3), rnd(0.38, 0.5), rnd(0.62, 0.8)]) {
        const p = rnd(-0.5, 0.5);
        M(L, R, sr, bt, rnd(1100, 2000), 0.12, 0.2, p);
        B(L, R, sr, bt, 0.015, 0.3, 0.008, 1, p, true);
      }
    },
    gravel(L, R, sr) {
      const B = G.burst;
      for (const [start, n, len, amp] of [[0.0, 70, 0.07, 1], [rnd(0.07, 0.1), 50, 0.1, 0.6]]) {
        for (let i = 0; i < n; i++) {
          const t = start + Math.pow(Math.random(), 1.6) * len;
          B(L, R, sr, t, 0.004, amp * rnd(0.1, 0.8), rnd(0.0006, 0.0025), rnd(0.35, 1), rnd(-0.3, 0.3), Math.random() < 0.6);
        }
      }
    },
    paper(L, R, sr) {
      const B = G.burst;
      let t = 0.01;
      const gestures = 2 + Math.floor(Math.random() * 2);
      for (let g = 0; g < gestures; g++) {
        const gl = rnd(0.08, 0.2), amp = rnd(0.5, 1);
        B(L, R, sr, t, gl, amp * 0.25, gl * 1.5, 0.9, rnd(-0.2, 0.2), true);
        const n = Math.floor(gl * rnd(250, 420));
        for (let i = 0; i < n; i++) {
          const tt = t + Math.random() * gl;
          B(L, R, sr, tt, 0.004, amp * Math.pow(Math.random(), 2) * 0.9, rnd(0.0004, 0.0018), rnd(0.6, 1), rnd(-0.3, 0.3), true);
        }
        t += gl + rnd(0.03, 0.12);
      }
    },
    leaves(L, R, sr) {
      const B = G.burst;
      const n = 900;
      for (let i = 0; i < n; i++) {
        const t = 0.02 + Math.pow(Math.random(), 0.8) * 1.05;
        const env = Math.sin(Math.PI * clamp(t / 1.1, 0, 1));
        B(L, R, sr, t, 0.006, env * Math.pow(Math.random(), 2.2) * 0.8, rnd(0.0008, 0.003), rnd(0.25, 0.7), rnd(-0.6, 0.6), false);
      }
      B(L, R, sr, 0.05, 1.0, 0.08, 0.9, 0.3, 0, false);
    },
    debris(L, R, sr) {
      const M = G.mode, B = G.burst;
      for (let i = 0; i < 70; i++) {
        const t = 0.3 + Math.pow(Math.random(), 1.4) * 4.6;
        const a = rnd(0.1, 0.6) * (1 - t / 6);
        const p = rnd(-0.8, 0.8);
        M(L, R, sr, t, rnd(70, 260), rnd(0.06, 0.2), a, p);
        B(L, R, sr, t, 0.05, a * 0.7, rnd(0.01, 0.05), rnd(0.1, 0.5), p, false);
        if (Math.random() < 0.5) for (let j = 0; j < 6; j++) B(L, R, sr, t + rnd(0, 0.08), 0.004, a * 0.4, 0.002, 1, p, true);
      }
    },
    /** Electromechanical telephone bell: hammer at 20 Hz alternately striking two gongs. */
    bell(L, R, sr) {
      const n = L.length;
      const xa = new Float32Array(n), xb = new Float32Array(n);
      const rings = [[0.02, 0.92], [1.27, 0.92]];
      for (const [rs, rd] of rings) {
        for (let s = 0; ; s++) {
          const t = rs + s / 40 + rnd(-0.0015, 0.0015);
          if (t > rs + rd) break;
          const i = Math.floor(t * sr);
          const amp = rnd(0.8, 1) * Math.min(1, (t - rs) / 0.04 + 0.35);
          const x = s % 2 ? xb : xa;
          for (let j = 0; j < 12 && i + j < n; j++) x[i + j] += amp * (1 - j / 12) * (Math.random() * 0.3 + 0.7);
        }
      }
      const ya = G.resonate(xa, sr, [[1093, 1.1, 1], [1101, 1.0, 0.8], [2741, 0.6, 0.5], [4383, 0.35, 0.3], [6120, 0.2, 0.12]]);
      const yb = G.resonate(xb, sr, [[1312, 1.0, 1], [1319, 0.9, 0.8], [3087, 0.55, 0.45], [5016, 0.3, 0.25], [7010, 0.18, 0.1]]);
      for (let i = 0; i < n; i++) {
        const cl = (xa[i] + xb[i]) * 0.02 * (Math.random() * 2 - 1); // hammer clatter
        L[i] = ya[i] * 1.0 + yb[i] * 0.7 + cl;
        R[i] = ya[i] * 0.7 + yb[i] * 1.0 + cl;
      }
    },
    brew(L, R, sr) {
      const M = G.mode, B = G.burst;
      const T = L.length / sr;
      // bubbles: short rising sine chirps
      for (let i = 0; i < 160; i++) {
        const t = Math.random() * (T - 0.1);
        const f0 = rnd(280, 900), dur = rnd(0.02, 0.06), a = rnd(0.05, 0.3), p = rnd(-0.4, 0.4);
        const i0 = Math.floor(t * sr), nn = Math.floor(dur * sr);
        let ph = 0;
        for (let j = 0; j < nn && i0 + j < L.length; j++) {
          const x = j / nn;
          ph += (2 * Math.PI * f0 * (1 + x * 1.2)) / sr;
          const v = a * Math.sin(ph) * Math.sin(Math.PI * x) * (1 - x * 0.5);
          L[i0 + j] += v * (1 - p) * 0.7; R[i0 + j] += v * (1 + p) * 0.7;
        }
      }
      // steam hiss and trickle
      let y = 0;
      for (let i = 0; i < L.length; i++) {
        const t = i / sr;
        const sw = 0.5 + 0.5 * Math.sin(t * 1.3 + Math.sin(t * 0.37) * 2);
        const w = Math.random() * 2 - 1;
        const hiss = (w - y) * 0.06 * sw;
        y += 0.2 * (w - y);
        L[i] += hiss + y * 0.02; R[i] += hiss * 0.9 + y * 0.02;
      }
      for (let i = 0; i < 8; i++) B(L, R, sr, rnd(0, T - 0.3), 0.25, 0.12, 0.2, 0.5, rnd(-0.3, 0.3), true);
      M(L, R, sr, 0.01, 60, 0.1, 0);
    },
    keys(L, R, sr) {
      const M = G.mode;
      for (let i = 0; i < 14; i++) {
        const t = 0.01 + Math.pow(Math.random(), 1.5) * 0.4, p = rnd(-0.4, 0.4), a = rnd(0.1, 0.5);
        M(L, R, sr, t, rnd(2800, 7500), rnd(0.05, 0.25), a, p);
        M(L, R, sr, t, rnd(4000, 9500), rnd(0.03, 0.12), a * 0.6, p);
      }
    },
  };

  /* ============================================================= ONE-SHOTS
   * SFX[name](k, out, t, o) builds the sound into `out` starting at time t and returns its
   * length in seconds. o: normalised options (o.P = pitch factor from opts.rate, plus any
   * sound-specific fields). Levels: peaks ≈ 0.3–0.9 at vol 1.
   */
  const SURF_ALIAS = { grate: 'metal', catwalk: 'metal', steel: 'metal', asphalt: 'concrete', roof: 'concrete', tar: 'concrete',
    stone: 'concrete', rock: 'concrete', wood: 'lino', linoleum: 'lino', vinyl: 'lino', grass: 'mud', dirt: 'mud', forest: 'mud',
    leaves: 'mud', water: 'mud', snow: 'carpet', rug: 'carpet', ceramic: 'tile' };
  const SFX = {};

  SFX.footstep = (k, out, t, o) => {
    let s = String(o.surface || 'concrete').replace(/^(floor|ground)_/, '');
    s = SURF_ALIAS[s] || s;
    const w = (o.weight || 1) * (o.run ? 1.35 : o.crouch ? 0.45 : 1) * rnd(0.85, 1.08);
    const P = (o.P || 1) * rnd(0.94, 1.06);
    const side = o.side != null ? o.side : Math.random() < 0.5 ? -1 : 1;
    const pan = panner(k, side * 0.05);
    pan.connect(out);
    const d = pan;
    switch (s) {
      case 'lino':
        thump(k, d, t, 150 * P, 75 * P, 0.07, 0.4 * w);
        burst(k, d, t, { f: 2700 * P, q: 1.3, a: 0.001, t60: 0.028, amp: 0.42 * w });
        burst(k, d, t + 0.07 * (o.run ? 0.6 : 1), { f: 3400 * P, q: 1.4, a: 0.002, t60: 0.02, amp: 0.2 * w });
        if (!o.crouch && Math.random() < 0.18) {
          const sq = osc(k, 'triangle', 1800 * P, t + 0.05, 0.07);
          glide(sq.frequency, t + 0.05, 1800 * P, 2400 * P, 0.06);
          const g = gain(k, 0); env(g.gain, t + 0.05, [[0, 0], [0.015, 0.035 * w], [0.06, 0]]);
          chain(sq, filt(k, 'bandpass', 2200, 2), g, d);
        }
        return 0.35;
      case 'tile':
        thump(k, d, t, 170 * P, 90 * P, 0.06, 0.32 * w);
        burst(k, d, t, { f: 4300 * P, q: 1.7, a: 0.0006, t60: 0.02, amp: 0.55 * w });
        modal(k, d, t, [[3300, 0.06, 0.05], [5100, 0.04, 0.03]], w, P);
        burst(k, d, t + 0.075, { f: 5000 * P, q: 2, a: 0.001, t60: 0.015, amp: 0.25 * w });
        return 0.35;
      case 'carpet':
        thump(k, d, t, 95 * P, 50 * P, 0.1, 0.33 * w);
        burst(k, d, t, { color: 'pink', type: 'lowpass', f: 520, q: 0.7, a: 0.008, t60: 0.08, amp: 0.3 * w });
        burst(k, d, t + 0.02, { color: 'pink', f: 1300, q: 0.8, a: 0.02, t60: 0.07, amp: 0.05 * w });
        return 0.3;
      case 'gravel':
        thump(k, d, t, 95 * P, 50 * P, 0.08, 0.28 * w);
        grainPlay(k, d, t, grain(k, 'gravel', 6, 0.25, GR.gravel), 0.75 * w, P * rnd(0.9, 1.1), filt(k, 'bandpass', 2600 * P, 0.45));
        return 0.35;
      case 'metal':
        thump(k, d, t, 125 * P, 70 * P, 0.07, 0.38 * w);
        modal(k, d, t, [[380, 0.4, 0.1], [910, 0.28, 0.09], [1720, 0.2, 0.07], [2630, 0.13, 0.05], [3900, 0.09, 0.035]], w, P);
        burst(k, d, t + 0.008, { f: 3100, q: 2, a: 0.001, t60: 0.1, amp: 0.13 * w });
        modal(k, d, t + rnd(0.05, 0.08), [[380, 0.2, 0.04], [910, 0.15, 0.035], [2630, 0.08, 0.02]], w, P * 1.01);
        thump(k, d, t, 150 * P, 140 * P, 0.16, 0.08 * w, 'triangle');
        return 0.6;
      case 'mud':
        thump(k, d, t, 75 * P, 45 * P, 0.1, 0.28 * w);
        burst(k, d, t, { color: 'pink', f: 260, f1: 900, fdur: 0.14, q: 3, a: 0.01, t60: 0.12, amp: 0.45 * w, dur: 0.16 });
        burst(k, d, t + 0.12, { color: 'pink', f: 700, f1: 1500, fdur: 0.05, q: 4, a: 0.003, t60: 0.04, amp: 0.2 * w });
        chain(noise(k, 'crackle', t, 0.16), filt(k, 'lowpass', 2600, 0.7), (() => { const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.02, 0.25 * w], [0.15, 0]]); return g; })(), d);
        return 0.35;
      default: // concrete
        thump(k, d, t, 115 * P, 55 * P, 0.09, 0.5 * w);
        burst(k, d, t, { f: 1400 * P, q: 0.9, a: 0.001, t60: 0.06, amp: 0.3 * w });
        burst(k, d, t + 0.03, { color: 'pink', f: 2600 * P, q: 0.9, a: 0.01, t60: 0.05, amp: 0.1 * w });
        burst(k, d, t + 0.075 * (o.run ? 0.6 : 1), { f: 1900 * P, q: 1.1, a: 0.001, t60: 0.03, amp: 0.14 * w });
        chain(noise(k, 'crackle', t, 0.08), filt(k, 'bandpass', 3200, 0.8), (() => { const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.005, 0.3 * w], [0.07, 0]]); return g; })(), d);
        return 0.35;
    }
  };
  SFX.footstep_other = (k, out, t, o) => {
    const d = SFX.footstep(k, out, t, Object.assign({}, o, { weight: (o.weight || 1) * 1.25, P: (o.P || 1) * 0.9 }));
    // a faint scuff/drag after the step
    burst(k, out, t + 0.1, { color: 'pink', f: 1700, q: 0.9, a: 0.03, t60: 0.1, amp: 0.05 });
    return d + 0.1;
  };
  SFX.running = (k, out, t, o) => SFX.footstep(k, out, t, Object.assign({}, o, { run: true }));

  SFX.creak = (k, out, t, o) => {
    const d = rnd(0.45, 0.9), P = o.P || 1;
    const src = friction(k, t, d, [[0, rnd(60, 90) * P], [d * 0.4, rnd(120, 170) * P], [d, rnd(70, 100) * P]], 22 * P, 8);
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.06, 0.5], [d * 0.7, 0.4], [d, 0]]);
    const am = gain(k, 1);
    chain(ctrl(k, t, d, 16), gain(k, 0.35), am.gain);
    const bus = gain(k, 1.1);
    resBank(k, src, bus, [[420 * P, 6, 1], [1050 * P, 8, 0.7], [2300 * P, 10, 0.35]]);
    chain(bus, am, g, out);
    return d + 0.1;
  };

  SFX.door_open = (k, out, t, o) => {
    click(k, out, t, 2500, 0.35);
    click(k, out, t + 0.06, 1800, 0.3);
    modal(k, out, t + 0.06, [[2900, 0.05, 0.06]]);
    const src = friction(k, t + 0.12, 0.35, [[0, 380], [0.35, 520]], 30, 10);
    const g = gain(k, 0); env(g.gain, t + 0.12, [[0, 0], [0.05, 0.1], [0.3, 0.06], [0.35, 0]]);
    const b = gain(k, 1); resBank(k, src, b, [[1200, 5, 1], [2600, 7, 0.6]]); chain(b, g, out);
    swell(k, out, t + 0.1, { color: 'pink', type: 'lowpass', f: 400, f1: 900, q: 0.7, pts: [[0, 0], [0.18, 0.14], [0.6, 0]] });
    return 0.9;
  };
  SFX.door_close = (k, out, t, o) => {
    swell(k, out, t, { color: 'pink', type: 'lowpass', f: 700, q: 0.7, pts: [[0, 0], [0.15, 0.12], [0.24, 0]] });
    const s = t + 0.22;
    thump(k, out, s, 95, 60, 0.18, 0.7);
    modal(k, out, s, [[180, 0.12, 0.25], [310, 0.1, 0.18], [520, 0.08, 0.12], [870, 0.05, 0.08]]);
    burst(k, out, s, { type: 'lowpass', f: 900, q: 0.7, a: 0.001, t60: 0.09, amp: 0.5 });
    click(k, out, s + 0.006, 2200, 0.4);
    burst(k, out, s + 0.004, { f: 3000, q: 3, a: 0.001, t60: 0.12, amp: 0.08 });
    return 0.85;
  };
  SFX.door_locked = (k, out, t, o) => {
    const times = [0, rnd(0.08, 0.1), rnd(0.19, 0.22), rnd(0.28, 0.31)];
    times.forEach((dt, i) => {
      click(k, out, t + dt, rnd(2000, 2600), 0.33);
      thump(k, out, t + dt, 140, 90, 0.05, 0.22);
      modal(k, out, t + dt, [[2200, 0.06, 0.06], [3700, 0.04, 0.04]], 1 - i * 0.1);
    });
    thump(k, out, t + 0.42, 100, 70, 0.12, 0.45);
    burst(k, out, t + 0.42, { type: 'lowpass', f: 700, q: 0.7, a: 0.001, t60: 0.08, amp: 0.3 });
    click(k, out, t + 0.425, 1900, 0.3);
    return 0.75;
  };
  SFX.door_unlock = (k, out, t, o) => {
    burst(k, out, t, { f: 4000, f1: 5600, fdur: 0.18, q: 3, a: 0.03, t60: 0.15, amp: 0.12, dur: 0.2 });
    click(k, out, t + 0.2, 3500, 0.2);
    click(k, out, t + 0.26, 3300, 0.15);
    const fr = friction(k, t + 0.3, 0.15, [[0, 200], [0.15, 240]], 20);
    const g = gain(k, 0); env(g.gain, t + 0.3, [[0, 0], [0.03, 0.06], [0.15, 0]]);
    chain(fr, filt(k, 'bandpass', 1800, 4), g, out);
    click(k, out, t + 0.46, 1500, 0.45);
    thump(k, out, t + 0.46, 180, 110, 0.07, 0.4);
    modal(k, out, t + 0.46, [[1250, 0.08, 0.1], [2900, 0.05, 0.06]]);
    return 0.7;
  };
  SFX.door_creak = (k, out, t, o) => {
    const d = rnd(1.4, 2.3), P = o.P || 1;
    const c = [[0, 180 * P]];
    for (let i = 1; i <= 4; i++) c.push([(d * i) / 4, rnd(140, 280) * P]);
    const src = friction(k, t, d, c, 35 * P, 7);
    const b = gain(k, 1);
    resBank(k, src, b, [[700 * P, 8, 1], [1500 * P, 10, 0.8], [2900 * P, 12, 0.45], [4200 * P, 12, 0.2]]);
    const moan = osc(k, wave(k, 'pulse'), 90 * P, t, d);
    env(moan.frequency, t, c.map(([tt, f]) => [tt, f / 2]));
    chain(moan, filt(k, 'bandpass', 300, 5), gain(k, 0.5), b);
    const am = gain(k, 1);
    chain(ctrl(k, t, d, 5), gain(k, 0.4), am.gain);
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.15, 0.3], [d * 0.5, 0.36], [d * 0.8, 0.25], [d, 0]]);
    chain(b, am, g, out);
    return d + 0.2;
  };
  SFX.door_heavy = (k, out, t, o) => {
    click(k, out, t, 1500, 0.5);
    thump(k, out, t, 200, 140, 0.05, 0.25);
    const fr = friction(k, t + 0.12, 0.3, [[0, 140], [0.3, 110]], 18);
    const g = gain(k, 0); env(g.gain, t + 0.12, [[0, 0], [0.05, 0.08], [0.3, 0]]);
    chain(fr, filt(k, 'bandpass', 2400, 5), g, out);
    const s = t + 0.5;
    thump(k, out, s, 70, 40, 0.6, 0.85);
    modal(k, out, s, [[62, 1.2, 0.3], [117, 1.0, 0.25], [181, 0.8, 0.2], [293, 0.7, 0.14], [447, 0.5, 0.11], [733, 0.35, 0.07], [1180, 0.25, 0.045]]);
    burst(k, out, s, { type: 'lowpass', f: 1200, q: 0.7, a: 0.001, t60: 0.2, amp: 0.55 });
    burst(k, out, s + 0.01, { f: 3200, q: 2, a: 0.002, t60: 0.3, amp: 0.1 });
    return 2.2;
  };

  function knockOnce(k, out, t, amp, P) {
    P = (P || 1) * rnd(0.95, 1.05);
    thump(k, out, t, 175 * P, 120 * P, 0.07, 0.5 * amp);
    modal(k, out, t, [[210, 0.09, 0.35], [480, 0.07, 0.22], [820, 0.05, 0.12], [1350, 0.03, 0.06]], amp, P);
    click(k, out, t, 2400 * P, 0.32 * amp, 0.012, 0.9);
    burst(k, out, t, { type: 'lowpass', f: 1200, q: 0.7, a: 0.001, t60: 0.04, amp: 0.22 * amp });
  }
  SFX.knock = (k, out, t, o) => {
    const n = Math.max(1, Math.round(o.count || 1)), gap = o.gap || 0.55;
    for (let i = 0; i < n; i++) knockOnce(k, out, t + i * gap * rnd(0.96, 1.04), rnd(0.85, 1), o.P);
    return (n - 1) * gap + 0.3;
  };
  SFX.knock3 = (k, out, t, o) => {
    const gaps = [0, 0.63, 1.27];
    gaps.forEach((g, i) => knockOnce(k, out, t + g + rnd(-0.015, 0.015), i === 2 ? 1 : 0.9, o.P));
    return 1.6;
  };
  SFX.window_knock = (k, out, t, o) => {
    const n = Math.max(1, Math.round(o.count || 3)), gap = o.gap || 0.66;
    for (let i = 0; i < n; i++) {
      const s = t + i * gap + rnd(-0.02, 0.02), a = i === n - 1 ? 1 : 0.88;
      click(k, out, s, 3500, 0.38 * a, 0.01);
      modal(k, out, s, [[1380, 0.12, 0.2], [2950, 0.1, 0.16], [4710, 0.07, 0.12], [6200, 0.05, 0.06]], a);
      thump(k, out, s, 95, 80, 0.08, 0.25 * a);
      burst(k, out, s, { f: 180, q: 5, a: 0.002, t60: 0.08, amp: 0.2 * a });
    }
    return (n - 1) * gap + 0.4;
  };
  SFX.chair_scrape = (k, out, t, o) => {
    const d = rnd(0.55, 0.9) * (o.dur || 1), P = o.P || 1;
    const src = friction(k, t, d, [[0, 48 * P], [d * 0.3, 72 * P], [d * 0.7, 55 * P], [d, 40 * P]], 20 * P, 20);
    const b = gain(k, 1);
    resBank(k, src, b, [[650 * P, 4, 0.9], [1400 * P, 6, 0.6], [2600 * P, 5, 0.3]]);
    chain(noise(k, 'white', t, d), filt(k, 'bandpass', 1800, 1), gain(k, 0.1), b);
    const am = gain(k, 1);
    chain(ctrl(k, t, d, 30), gain(k, 0.5), am.gain);
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.04, 0.5], [d * 0.8, 0.45], [d, 0]]);
    chain(b, am, g, out);
    thump(k, out, t + d, 120, 80, 0.08, 0.35);
    click(k, out, t + d, 1600, 0.2);
    return d + 0.25;
  };
  SFX.glass_break = (k, out, t, o) => grainPlay(k, out, t, grain(k, 'glass', 4, 1.3, GR.glass), 0.8, o.P) + 0.05;
  SFX.shelf_fall = (k, out, t, o) => {
    // objects sliding off, a plank, a box, tins clattering and rolling
    burst(k, out, t, { f: 1400, q: 1.5, a: 0.03, t60: 0.12, amp: 0.1, dur: 0.12 });
    const s = t + 0.12;
    thump(k, out, s, 160, 90, 0.12, 0.55);
    modal(k, out, s, [[210, 0.12, 0.3], [470, 0.09, 0.2], [930, 0.06, 0.1]]);
    burst(k, out, s + 0.1, { type: 'lowpass', f: 500, q: 0.7, a: 0.002, t60: 0.12, amp: 0.5 });
    thump(k, out, s + 0.1, 90, 55, 0.15, 0.5);
    const tins = [0.22, 0.36, 0.49, 0.58, 0.7, 0.78, 0.9, 1.02];
    tins.forEach((dt, i) => {
      const a = 0.35 * Math.pow(0.8, i);
      modal(k, out, s + dt + rnd(-0.02, 0.02), [[rnd(900, 1300), 0.12, 0.3], [rnd(2100, 2900), 0.08, 0.2], [rnd(3500, 4600), 0.05, 0.12]], a / 0.35 * 0.6);
      click(k, out, s + dt, rnd(2500, 4000), a);
    });
    grainPlay(k, out, s + 0.18, grain(k, 'glass', 4, 1.3, GR.glass), 0.25, 1.2);
    return 1.7;
  };
  SFX.phone_ring = (k, out, t, o) => {
    const b = grain(k, 'bell', 2, 2.9, GR.bell);
    grainPlay(k, out, t, b, 0.7, o.P);
    return b.duration;
  };
  SFX.phone_pickup = (k, out, t, o) => {
    click(k, out, t, 1800, 0.45, 0.02, 1);
    thump(k, out, t, 320, 210, 0.04, 0.25);
    click(k, out, t + 0.05, 3200, 0.22);
    modal(k, out, t + 0.06, [[1093, 0.5, 0.05], [1312, 0.45, 0.035], [2741, 0.25, 0.02]]);
    burst(k, out, t + 0.12, { f: 1500, q: 0.5, a: 0.05, t60: 0.4, amp: 0.02 });
    return 0.8;
  };
  SFX.phone_hangup = (k, out, t, o) => {
    thump(k, out, t, 230, 140, 0.06, 0.6);
    click(k, out, t, 1400, 0.5, 0.02, 1);
    burst(k, out, t + 0.004, { f: 2600, q: 3, a: 0.001, t60: 0.08, amp: 0.15 });
    modal(k, out, t + 0.02, [[1093, 0.7, 0.08], [1312, 0.6, 0.06], [2741, 0.3, 0.03]]);
    click(k, out, t + 0.09, 2000, 0.2);
    return 1.0;
  };
  SFX.dial_tone = (k, out, t, o) => {
    const d = o.dur || 3;
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.02, 0.22], [d - 0.03, 0.22], [d, 0]]);
    osc(k, 'sine', 350, t, d).connect(g);
    osc(k, 'sine', 440, t, d).connect(g);
    phoneChain(k, g, out, t, d);
    return d;
  };
  SFX.breaker_trip = (k, out, t, o) => {
    burst(k, out, t, { f: 3500, q: 0.8, a: 0.001, t60: 0.05, amp: 0.35 });
    const bz = osc(k, 'sawtooth', 120, t, 0.08);
    const bg = gain(k, 0); env(bg.gain, t, [[0, 0], [0.005, 0.2], [0.07, 0]]);
    chain(bz, filt(k, 'bandpass', 2500, 2), bg, out);
    chain(noise(k, 'crackle', t, 0.08), filt(k, 'highpass', 1500, 0.7), gain(k, 0.9), out);
    const s = t + 0.03;
    click(k, out, s, 2000, 0.75, 0.02, 0.7);
    thump(k, out, s, 250, 120, 0.05, 0.45);
    modal(k, out, s + 0.02, [[1850, 0.12, 0.08], [4200, 0.08, 0.05]]);
    thump(k, out, s + 0.03, 60, 35, 0.35, 0.3);
    const h = osc(k, 'sawtooth', 120, t, 0.5);
    glide(h.frequency, t, 120, 70, 0.4);
    const hg = gain(k, 0); env(hg.gain, t, [[0, 0.06], [0.45, 0]]);
    chain(h, filt(k, 'lowpass', 600, 0.7), hg, out);
    return 0.8;
  };
  SFX.breaker_reset = (k, out, t, o) => {
    const fr = friction(k, t, 0.12, [[0, 150], [0.12, 170]], 20);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.03, 0.07], [0.12, 0]]);
    chain(fr, filt(k, 'bandpass', 1500, 4), g, out);
    click(k, out, t + 0.12, 1800, 0.7, 0.02, 0.7);
    thump(k, out, t + 0.12, 200, 120, 0.05, 0.42);
    modal(k, out, t + 0.13, [[1850, 0.1, 0.07], [4200, 0.07, 0.04]]);
    thump(k, out, t + 0.37, 90, 60, 0.1, 0.3);
    click(k, out, t + 0.37, 900, 0.28);
    const h = osc(k, 'sawtooth', 120, t + 0.37, 0.7);
    const hg = gain(k, 0); env(hg.gain, t + 0.37, [[0, 0], [0.3, 0.05], [0.7, 0]]);
    chain(h, filt(k, 'lowpass', 700, 0.7), hg, out);
    return 1.1;
  };
  SFX.switch = (k, out, t, o) => {
    click(k, out, t, 3000, 0.45, 0.008);
    click(k, out, t + 0.012, 2200, 0.3, 0.008);
    thump(k, out, t, 600, 400, 0.02, 0.15);
    return 0.2;
  };
  SFX.flicker = (k, out, t, o) => {
    const d = rnd(0.5, 1.2);
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const s = t + (i / n) * d + rnd(0, 0.05);
      const bd = rnd(0.03, 0.15);
      click(k, out, s, 4000, 0.18, 0.006);
      const bz = osc(k, 'sawtooth', 120, s, bd + 0.02);
      const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.004, 0.16], [bd, 0.12], [bd + 0.01, 0]]);
      chain(bz, filt(k, 'highpass', 1500, 0.7), filt(k, 'bandpass', 3000, 1.2), g, out);
      const hm = osc(k, 'sine', 120, s, bd + 0.02);
      const hg = gain(k, 0); env(hg.gain, s, [[0, 0], [0.004, 0.08], [bd, 0.06], [bd + 0.01, 0]]);
      chain(hm, hg, out);
    }
    modal(k, out, t + d, [[5200, 0.05, 0.03]]);
    return d + 0.1;
  };
  SFX.coffee_brew = (k, out, t, o) => {
    const b = grain(k, 'brew', 2, 5.2, GR.brew);
    const d = Math.min(o.dur || 5, b.duration);
    const s = bufSrc(k, b, t, 1, false, d);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.3, 0.45], [d - 0.3, 0.45], [d, 0]]);
    chain(s, filt(k, 'lowpass', 5000, 0.7), g, out);
    return d;
  };
  SFX.mug_set = (k, out, t, o) => {
    const P = o.P || 1;
    modal(k, out, t, [[1650, 0.18, 0.22], [3960, 0.12, 0.13], [6200, 0.07, 0.07], [2480, 0.14, 0.1]], 1, P * rnd(0.97, 1.03));
    click(k, out, t, 3500, 0.28, 0.006);
    thump(k, out, t, 180, 120, 0.05, 0.35);
    modal(k, out, t, [[240, 0.06, 0.1]]);
    burst(k, out, t + 0.03, { color: 'pink', f: 600, f1: 400, q: 2, a: 0.03, t60: 0.25, amp: 0.06 });
    return 0.5;
  };
  SFX.thunder = (k, out, t, o) => {
    // distance: explicit, else from the lightning→thunder delay the world passes, else random
    const dist = clamp(o.dist != null ? o.dist : o.delay != null ? 0.08 + o.delay / 5 : rnd(0.3, 0.8), 0, 1);
    const near = 1 - dist;
    const indoor = !!o.indoor;
    const d = 4 + dist * 3 + rnd(0, 1.5);
    const bus = gain(k, lerp(0.95, 0.45, dist));
    if (indoor) chain(bus, filt(k, 'lowpass', 520, 0.6), gain(k, 1.25), out);
    else bus.connect(out);
    if (near > 0.45) {
      burst(k, bus, t, { type: 'highpass', f: 1400, q: 0.5, a: 0.003, t60: 0.3, amp: 0.45 * near });
      burst(k, bus, t + rnd(0.05, 0.12), { type: 'highpass', f: 900, q: 0.5, a: 0.004, t60: 0.4, amp: 0.3 * near });
      thump(k, bus, t, 70, 32, 0.9, 0.5 * near);
    }
    // rumble: overlapping swells of low noise
    const rb = noise(k, 'brown2', t, d);
    const lp1 = filt(k, 'lowpass', 150 + near * 220, 0.6), lp2 = filt(k, 'lowpass', 190 + near * 150, 0.5);
    const rg = gain(k, 0);
    let tt = t + (near > 0.45 ? 0.05 : rnd(0.1, 0.4));
    rg.gain.setValueAtTime(0, t);
    const swells = 4 + Math.floor(Math.random() * 4);
    let a = 1;
    for (let i = 0; i < swells && tt < t + d - 0.8; i++) {
      const up = rnd(0.12, 0.45);
      rg.gain.linearRampToValueAtTime(a * rnd(0.7, 1) * 2.2, tt + up);
      tt += up + rnd(0.25, 0.8);
      rg.gain.linearRampToValueAtTime(a * rnd(0.25, 0.45) * 2.2, tt);
      a *= rnd(0.7, 0.9);
    }
    rg.gain.setTargetAtTime(0, tt, Math.max(0.15, (t + d - tt) / 4));
    chain(rb, lp1, lp2, rg, bus);
    swell(k, bus, t, { color: 'pink', f: 420, q: 0.8, pts: [[0, 0], [0.15, 0.22 * (0.4 + near)], [d * 0.5, 0.05], [d, 0]] });
    if (indoor) {
      // windows rattle in their frames at the peak
      const rt = gain(k, 0); env(rt.gain, t + 0.1, [[0, 0], [0.3, 0.05], [1.5, 0]]);
      const am = gain(k, 0);
      chain(osc(k, 'square', rnd(16, 22), t, 2), gain(k, 0.5), am.gain);
      chain(noise(k, 'white', t, 2), filt(k, 'bandpass', 2800, 4), am, rt, out);
    }
    return d;
  };
  SFX.static_burst = (k, out, t, o) => {
    const d = o.dur || rnd(0.25, 0.7);
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.005, 0.45], [d * 0.7, 0.35], [d, 0]]);
    const am = gain(k, 1);
    chain(ctrl(k, t, d, 28), gain(k, 0.55), am.gain);
    chain(noise(k, 'white', t, d), filt(k, 'highpass', 450, 0.7), filt(k, 'lowpass', 3800, 0.7), am, g, out);
    const cg = gain(k, 0); env(cg.gain, t, [[0, 0], [0.005, 1.4], [d, 0]]);
    chain(noise(k, 'crackle', t, d), filt(k, 'bandpass', 2500, 0.7), cg, out);
    const h = osc(k, 'sine', rnd(900, 1500), t, d);
    glide(h.frequency, t, h.frequency.value, rnd(400, 800), d);
    const hg = gain(k, 0); env(hg.gain, t, [[0, 0], [0.02, 0.04], [d, 0]]);
    chain(h, hg, out);
    return d;
  };
  SFX.radio_click = (k, out, t, o) => {
    click(k, out, t, 2400, 0.55, 0.01, 0.7);
    thump(k, out, t, 420, 260, 0.03, 0.25);
    modal(k, out, t + 0.004, [[3100, 0.04, 0.04]]);
    const g = gain(k, 0); perc(g.gain, t + 0.01, 0.12, 0.002, 0.12);
    chain(noise(k, 'white', t, 0.16), filt(k, 'highpass', 400, 0.7), filt(k, 'lowpass', 3500, 0.7), g, out);
    return 0.25;
  };
  SFX.tuning = (k, out, t, o) => {
    const d = o.dur || 1.3;
    for (let i = 0; i < 2; i++) {
      const h = osc(k, 'sine', rnd(1500, 2600), t, d);
      env(h.frequency, t, [[0, rnd(1500, 2600)], [d * 0.35, rnd(150, 400)], [d * 0.7, rnd(900, 1800)], [d, rnd(300, 700)]]);
      const hg = gain(k, 0); env(hg.gain, t, [[0, 0], [0.05, 0.05], [d * 0.8, 0.04], [d, 0]]);
      chain(h, hg, out);
    }
    const sg = gain(k, 0); env(sg.gain, t, [[0, 0], [0.04, 0.28], [d - 0.08, 0.25], [d, 0]]);
    const am = gain(k, 1); chain(ctrl(k, t, d, 14), gain(k, 0.5), am.gain);
    chain(noise(k, 'white', t, d), filt(k, 'highpass', 400, 0.7), filt(k, 'lowpass', 3500, 0.7), am, sg, out);
    // a snatch of distant voice/music as the dial passes a station
    const cs = t + d * rnd(0.3, 0.6);
    const cg = gain(k, 0); env(cg.gain, cs, [[0, 0], [0.04, 0.1], [0.2, 0.08], [0.26, 0]]);
    const cam = gain(k, 0.5); chain(ctrl(k, cs, 0.3, 24), gain(k, 0.6), cam.gain);
    chain(osc(k, wave(k, 'glottal'), rnd(110, 200), cs, 0.3), filt(k, 'bandpass', rnd(600, 1200), 3), cam, cg, out);
    const cr = gain(k, 0.9); chain(noise(k, 'crackle', t, d), filt(k, 'bandpass', 2400, 0.7), cr, sg);
    return d;
  };
  function mechKey(k, out, t, amp) {
    thump(k, out, t, 140, 90, 0.08, 0.5 * amp);
    click(k, out, t, 1200, 0.48 * amp, 0.015, 0.8);
    modal(k, out, t, [[900, 0.05, 0.08], [2300, 0.04, 0.05]], amp);
  }
  SFX.tape_insert = (k, out, t, o) => {
    burst(k, out, t, { f: 2500, q: 1, a: 0.02, t60: 0.08, amp: 0.12, dur: 0.12 });
    click(k, out, t + 0.12, 1500, 0.35);
    thump(k, out, t + 0.12, 260, 180, 0.04, 0.3);
    click(k, out, t + 0.35, 2000, 0.5);
    thump(k, out, t + 0.35, 200, 140, 0.05, 0.4);
    burst(k, out, t + 0.352, { f: 3500, q: 3, a: 0.001, t60: 0.06, amp: 0.08 });
    return 0.6;
  };
  SFX.tape_play = (k, out, t, o) => {
    mechKey(k, out, t, 1);
    const m = osc(k, 'sawtooth', 60, t + 0.05, 0.95);
    glide(m.frequency, t + 0.05, 60, 180, 0.3);
    const mg = gain(k, 0); env(mg.gain, t + 0.05, [[0, 0], [0.15, 0.035], [0.7, 0.03], [0.95, 0]]);
    chain(m, filt(k, 'lowpass', 600, 0.7), mg, out);
    swell(k, out, t + 0.15, { color: 'pink', type: 'highpass', f: 3000, q: 0.7, pts: [[0, 0], [0.1, 0.035], [0.75, 0.03], [0.85, 0]] });
    return 1.0;
  };
  SFX.tape_stop = (k, out, t, o) => {
    mechKey(k, out, t, 0.85);
    const m = osc(k, 'sawtooth', 180, t, 0.4);
    glide(m.frequency, t, 180, 55, 0.35);
    const mg = gain(k, 0); env(mg.gain, t, [[0, 0.03], [0.38, 0]]);
    chain(m, filt(k, 'lowpass', 600, 0.7), mg, out);
    return 0.6;
  };
  SFX.tape_eject = (k, out, t, o) => {
    mechKey(k, out, t, 0.8);
    click(k, out, t + 0.07, 900, 0.4);
    thump(k, out, t + 0.07, 160, 100, 0.06, 0.4);
    burst(k, out, t + 0.08, { f: 2800, q: 2, a: 0.002, t60: 0.15, amp: 0.15 });
    modal(k, out, t + 0.08, [[1100, 0.06, 0.08], [2600, 0.05, 0.05]]);
    click(k, out, t + 0.2, 3000, 0.12);
    click(k, out, t + 0.26, 2600, 0.08);
    return 0.7;
  };
  SFX.beep = (k, out, t, o) => {
    const n = Math.max(1, Math.round(o.count || 2)), P = o.P || 1;
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.2;
      const b = osc(k, 'square', 2000 * P, s, 0.12);
      const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.003, 0.14], [0.105, 0.14], [0.11, 0]]);
      chain(b, filt(k, 'lowpass', 5000, 0.7), filt(k, 'peaking', 2000, 1, 4), g, out);
    }
    return (n - 1) * 0.2 + 0.15;
  };
  SFX.alarm = (k, out, t, o) => {
    const d = 1.4, on = 0.9;
    const g = gain(k, 0);
    env(g.gain, t, [[0, 0], [0.04, 0.3], [on - 0.05, 0.3], [on, 0]]);
    const am = gain(k, 0.6);
    chain(osc(k, 'square', 70, t, on), gain(k, 0.4), am.gain);
    const mix = gain(k, 1);
    osc(k, wave(k, 'horn'), 470 * (o.P || 1), t, on).connect(mix);
    osc(k, wave(k, 'horn'), 474 * (o.P || 1), t, on).connect(mix);
    const b = gain(k, 1);
    resBank(k, mix, b, [[1400, 1.5, 1.4], [2600, 2, 0.8], [700, 1.2, 0.5]]);
    chain(b, gain(k, 1.4), shaper(k, 'hard'), am, g, out);
    return d;
  };
  SFX.scan = (k, out, t, o) => {
    const d = o.dur || 1.6, step = 1 / 14;
    for (let s = t; s < t + d - 0.03; s += step) {
      click(k, out, s, 3200, 0.16, 0.006);
      burst(k, out, s + 0.005, { f: rnd(800, 2600), q: 1.5, a: 0.002, t60: 0.05, amp: 0.13 });
      if (Math.random() < 0.18) {
        const h = osc(k, 'sine', rnd(600, 2000), s, 0.05);
        const hg = gain(k, 0); env(hg.gain, s, [[0, 0], [0.005, 0.035], [0.045, 0]]);
        chain(h, hg, out);
      }
    }
    return d;
  };
  SFX.impact = (k, out, t, o) => {
    thump(k, out, t, 80, 45, 0.25, 0.85);
    thump(k, out, t, 42, 36, 0.3, 0.35);
    modal(k, out, t, [[95, 0.25, 0.32], [160, 0.2, 0.24], [270, 0.15, 0.17], [450, 0.1, 0.1]]);
    burst(k, out, t, { type: 'lowpass', f: 800, q: 0.7, a: 0.001, t60: 0.12, amp: 0.55 });
    burst(k, out, t + 0.004, { f: 2500, q: 2.5, a: 0.002, t60: 0.25, amp: 0.13 });
    click(k, out, t + 0.03, 1800, 0.2);
    click(k, out, t + 0.07, 3000, 0.15);
    return 1.0;
  };
  /** The original formant scream (voiceStyle 'classic', or when the natural engine fails). */
  function screamClassic(k, out, t, o) {
    const d = rnd(1.3, 2.0);
    const vp = voiceParams(o.speaker || 'woman', { gender: o.gender || 'f' });
    vp.breathy = 0.45; vp.rasp = 0.3; vp.jitter = 0.045; vp.tremor = 0.035; vp.tremorHz = 6.4; vp.shimmer = 0.2;
    const f0 = (o.P || 1) * rnd(480, 560);
    const A = VOW.a.map((f) => f * vp.formant), O = VOW.aw.map((f) => f * vp.formant);
    A[0] = 950 * vp.formant;
    const plan = {
      end: d, cons: [],
      f0: [[0, f0], [d * 0.22, f0 * 1.45], [d * 0.6, f0 * 1.32], [d, f0 * 0.75]],
      voice: [[0, 0], [0.06, 1], [d * 0.7, 0.85], [d, 0]],
      breath: [[0, 0.3], [0.05, 0.5], [d, 0]],
      F: [[0, ...A], [d * 0.6, ...A], [d, ...O]],
      nas: [[0, 1]],
    };
    const sum = gain(k, 1);
    synthSpeech(k, sum, t, plan, vp, {});
    const dry = gain(k, 0.35);
    chain(sum, filt(k, 'lowpass', 1300, 0.7), filt(k, 'highpass', 260, 0.7), dry, out);
    const echo = delayN(k, 0.28, 1);
    chain(dry, echo, filt(k, 'lowpass', 900, 0.7), gain(k, 0.3), out);
    return d + 0.7;
  }
  /**
   * A distant scream: the natural engine's cry (nvMain().scream) on the speaker's own throat —
   * o.speaker, default 'you' (rf_leaving: it is your scream) — through air and walls, a room
   * answering. Variants are rendered once (worker prefetch, else synchronously on first use) and
   * replayed from AudioBuffers. 'classic' voice style keeps the old formant scream.
   */
  SFX.scream_distant = (k, out, t, o) => {
    if (voiceStyle({}) === 'classic') return screamClassic(k, out, t, o);
    const spk = o.speaker || 'you', shout = !!o.shout;
    let d = null;
    try { d = screamData(spk, Math.random(), shout); } catch (e) { warnOnce('scream', e); d = null; }
    if (!d) return screamClassic(k, out, t, o);
    const cache = k.screams || (k.screams = new Map());
    const key = spk + (shout ? ':shout:' : ':') + d.seed;
    let b = cache.get(key);
    if (!b) {
      b = k.ctx.createBuffer(1, d.sig.length, d.sr);
      if (b.copyToChannel) b.copyToChannel(d.sig, 0); else b.getChannelData(0).set(d.sig);
      cache.set(key, b);
    }
    const src = bufSrc(k, b, t, (o.P || 1) * rnd(0.97, 1.03));
    const dry = gain(k, 0.38);
    chain(src, filt(k, 'lowpass', 1900, 0.7), filt(k, 'highpass', 240, 0.7), filt(k, 'peaking', 1200, 1, 3), dry, out);
    const echo = delayN(k, 0.28, 1);
    chain(dry, echo, filt(k, 'lowpass', 900, 0.7), gain(k, 0.3), out);
    return b.duration + 0.7;
  };
  /** A distant shout (the same cry engine, short and chest-voiced): o.speaker as above. */
  SFX.shout_distant = (k, out, t, o) => SFX.scream_distant(k, out, t, Object.assign({}, o, { shout: true }));
  /** One breath cycle; o.cycle seconds (default from the player's current rate), o.intensity 0..1. */
  function breathCycle(k, out, t, o, other) {
    const cyc = clamp(o.cycle || 3.4, 0.9, 6);
    const I = clamp(o.intensity == null ? 0.3 : o.intensity, 0, 1);
    const ti = cyc * 0.38, te = cyc * 0.47, ts = t + cyc * 0.4;
    const fIn = other ? 1050 : 1500, fEx = other ? 560 : 760;
    const ai = (0.1 + 0.25 * I) * (other ? 1.1 : 1), ae = (0.13 + 0.3 * I) * (other ? 1.2 : 1);
    const ig = gain(k, 0); env(ig.gain, t, [[0, 0], [ti * 0.7, ai], [ti, 0]]);
    chain(noise(k, 'pink', t, ti + 0.05), filt(k, 'bandpass', fIn, 1.2), filt(k, 'peaking', 2600, 3, 6), ig, out);
    const ng = gain(k, 0); env(ng.gain, t, [[0, 0], [ti * 0.7, ai * 0.25], [ti, 0]]);
    chain(noise(k, 'white', t, ti + 0.05), filt(k, 'bandpass', 4000, 2), ng, out);
    const eg = gain(k, 0); env(eg.gain, ts, [[0, 0], [te * 0.18, ae], [te, 0]]);
    chain(noise(k, 'pink', ts, te + 0.05), filt(k, 'bandpass', fEx, 1), filt(k, 'peaking', 1500, 2, 4), eg, out);
    if (other) {
      // ragged, wet, frightened: shuddering inhale, crackle in the throat
      const am = gain(k, 1);
      chain(osc(k, 'sine', rnd(6, 8), t, ti), gain(k, 0.35), am.gain);
      ig.disconnect(); chain(ig, am, out);
      const wg = gain(k, 0); env(wg.gain, ts, [[0, 0], [te * 0.2, 0.5 * ae], [te, 0]]);
      chain(noise(k, 'crackle', ts, te + 0.05), filt(k, 'lowpass', 1500, 0.7), wg, out);
    }
    if (I > 0.6) {
      const v = osc(k, wave(k, 'glottalSoft'), other ? 90 : 105, ts, te);
      const vg = gain(k, 0); env(vg.gain, ts, [[0, 0], [te * 0.2, (I - 0.6) * 0.12], [te * 0.8, 0]]);
      chain(v, filt(k, 'bandpass', 520, 3), vg, out);
    }
    return cyc;
  }
  SFX.breath = (k, out, t, o) => breathCycle(k, out, t, o, false);
  SFX.breath_other = (k, out, t, o) => breathCycle(k, out, t, o, true);
  SFX.heartbeat = (k, out, t, o) => {
    const bpm = clamp(o.bpm || 70, 40, 180), per = 60 / bpm;
    const a = o.amp || 1;
    thump(k, out, t, 62, 38, 0.14, 0.7 * a);
    burst(k, out, t, { color: 'brown', type: 'lowpass', f: 150, q: 0.7, a: 0.004, t60: 0.1, amp: 0.4 * a });
    const s = t + Math.min(0.32, per * 0.36);
    thump(k, out, s, 55, 35, 0.12, 0.45 * a);
    burst(k, out, s, { color: 'brown', type: 'lowpass', f: 140, q: 0.7, a: 0.004, t60: 0.08, amp: 0.25 * a });
    return per;
  };
  SFX.car_door = (k, out, t, o) => {
    click(k, out, t, 2000, 0.3);
    const s = t + 0.05;
    thump(k, out, s, 75, 45, 0.2, 0.8);
    modal(k, out, s, [[140, 0.25, 0.25], [235, 0.2, 0.2], [410, 0.15, 0.12], [690, 0.1, 0.07], [1150, 0.07, 0.04]]);
    burst(k, out, s, { type: 'lowpass', f: 600, q: 0.7, a: 0.001, t60: 0.1, amp: 0.5 });
    burst(k, out, s, { color: 'brown', type: 'lowpass', f: 200, q: 0.7, a: 0.005, t60: 0.12, amp: 0.3 });
    click(k, out, s + 0.01, 2600, 0.4);
    burst(k, out, s + 0.01, { f: 3600, q: 4, a: 0.001, t60: 0.1, amp: 0.05 });
    return 0.9;
  };

  /* ---------------------------------------------------------- engines */
  /**
   * Combustion engine voice: firing-pulse modulator (looped buffer, rate = fire/30) gating
   * brown-noise body, pink exhaust and white clatter, plus a tonal firing partial and a half-
   * order sub. Returns {out, setFire(f, t, tc), fire}.
   */
  function engineGraph(k, t, s, T) {
    const out = gain(k, 1);
    const fire = bufSrc(k, buf(k, s.diesel ? 'fireD' : 'fireG'), t, s.fire / 30, true, T);
    const body = gain(k, 0.12);
    chain(noise(k, 'brown', t, T), body);
    chain(fire, gain(k, 0.9), body.gain);
    chain(body, filt(k, 'lowpass', s.diesel ? 420 : 560, 0.8), filt(k, 'peaking', 95, 1, 6), gain(k, 1.7), out);
    const to = osc(k, wave(k, 'engine'), s.fire, t, T);
    chain(to, filt(k, 'lowpass', s.diesel ? 240 : 300, 0.7), gain(k, s.diesel ? 0.2 : 0.14), out);
    const sub = osc(k, 'sine', s.fire / 2, t, T);
    chain(sub, gain(k, 0.1), out);
    const cl = gain(k, 0);
    chain(noise(k, 'white', t, T), cl);
    chain(fire, gain(k, s.diesel ? 0.3 : 0.08), cl.gain);
    chain(cl, filt(k, 'bandpass', 2300, 1.3), out);
    const ex = gain(k, 0.05);
    chain(noise(k, 'pink', t, T), ex);
    chain(fire, gain(k, 0.5), ex.gain);
    chain(ex, filt(k, 'bandpass', 700, 0.9), gain(k, 0.5), out);
    const fp = [to.frequency];
    const ps = [[fire.playbackRate, 1 / 30], [to.frequency, 1], [sub.frequency, 0.5]];
    const base = s.fire;
    return {
      out, fire, ps,
      /** rate multipliers relative to the nominal firing frequency */
      setRate(r, at) { for (const [p, m] of ps) p.setValueAtTime(Math.max(EPS, base * r * m), at); },
      rampRate(r, now, dur, exp) {
        for (const [p, m] of ps) {
          hold(p, now);
          if (exp) p.exponentialRampToValueAtTime(Math.max(EPS, base * r * m), now + dur);
          else p.linearRampToValueAtTime(base * r * m, now + dur);
        }
      },
      expFire(f, at) { for (const [p, m] of ps) p.exponentialRampToValueAtTime(Math.max(EPS, f * m), at); },
      /** misfire: rpm sags during the gap, catches with a small overshoot */
      sag(t, gap) {
        for (const [p, m] of ps) {
          p.setValueAtTime(base * m, t); p.linearRampToValueAtTime(base * 0.72 * m, t + gap);
          p.linearRampToValueAtTime(base * 1.05 * m, t + gap + 0.12); p.linearRampToValueAtTime(base * m, t + gap + 0.38);
        }
      },
      setFire(f, at, tc) {
        f = Math.max(0.5, f);
        if (tc == null) {
          fire.playbackRate.setValueAtTime(f / 30, at); to.frequency.setValueAtTime(f, at); sub.frequency.setValueAtTime(f / 2, at);
        } else {
          fire.playbackRate.setTargetAtTime(f / 30, at, tc); to.frequency.setTargetAtTime(f, at, tc); sub.frequency.setTargetAtTime(f / 2, at, tc);
        }
      },
      rampFire(f, at) {
        f = Math.max(0.5, f);
        fire.playbackRate.linearRampToValueAtTime(f / 30, at); to.frequency.linearRampToValueAtTime(f, at); sub.frequency.linearRampToValueAtTime(f / 2, at);
      },
      fp,
    };
  }
  /** Starter motor cranking: whine + compression chuffs at `rate` Hz. */
  function crank(k, out, t, d, rate, whine, amp) {
    const am = gain(k, 0.35);
    chain(osc(k, 'square', rate, t, d), gain(k, 0.35), am.gain);
    const w = osc(k, 'sawtooth', whine, t, d);
    glide(w.frequency, t, whine * 0.8, whine * 1.15, d);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.08, amp], [d - 0.05, amp], [d, 0]]);
    chain(w, filt(k, 'bandpass', whine * 3, 2), am, g, out);
    const cg = gain(k, 0);
    chain(osc(k, 'sine', rate, t, d), gain(k, amp * 2), cg.gain);
    chain(noise(k, 'brown', t, d), filt(k, 'lowpass', 320, 0.7), cg, out);
  }
  SFX.car_start = (k, out, t, o) => {
    crank(k, out, t, 1.1, 5.5, 300, 0.1);
    click(k, out, t, 1500, 0.3);
    const s = t + 1.05;
    const e = engineGraph(k, s, { fire: 14 }, 2);
    e.setFire(14, s); e.rampFire(55, s + 0.3); e.rampFire(34, s + 0.8); e.rampFire(27, s + 1.4);
    const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.1, 0.55], [0.4, 0.7], [1.5, 0.45], [2, 0]]);
    chain(e.out, g, out);
    click(k, out, t + 1.15, 1800, 0.2);
    return 3.1;
  };
  SFX.car_idle = (k, out, t, o) => {
    const d = o.dur || 3;
    const e = engineGraph(k, t, { fire: 27 }, d);
    e.setFire(27, t);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.1, 0.45], [d - 0.1, 0.45], [d, 0]]);
    chain(e.out, g, out);
    return d;
  };
  SFX.car_drive = (k, out, t, o) => {
    const d = o.dur || 4, sp = clamp(o.speed == null ? 0.6 : o.speed, 0, 1);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.2, 1], [d - 0.2, 1], [d, 0]]);
    driveGraph(k, g, t, d, sp);
    g.connect(out);
    return d;
  };
  /** Car interior at speed: engine, wet tyres, road rumble, wind. Returns setter for speed. */
  function driveGraph(k, out, t, T, sp) {
    const e = engineGraph(k, t, { fire: 40 + 45 * sp }, T);
    const eg = gain(k, 0.4);
    chain(e.out, filt(k, 'lowpass', 900, 0.7), eg, out);
    const tyre = gain(k, 0);
    chain(noise(k, 'pink', t, T), filt(k, 'bandpass', 700, 0.5), tyre, out);
    const hiss = gain(k, 0);
    chain(noise(k, 'white', t, T), filt(k, 'highpass', 1500, 0.7), filt(k, 'lowpass', 5000, 0.7), hiss, out);
    const spm = gain(k, 1);
    chain(ctrl(k, t, T, 0.6), gain(k, 0.35), spm.gain);
    hiss.disconnect(); chain(hiss, spm, out);
    const road = gain(k, 0);
    chain(noise(k, 'brown', t, T), filt(k, 'lowpass', 120, 0.7), road, out);
    const wind = gain(k, 0);
    chain(noise(k, 'pink', t, T), filt(k, 'bandpass', 1200, 0.6), wind, out);
    const set = (s, at, tc) => {
      s = clamp(s, 0, 1);
      const f = 40 + 45 * s;
      if (tc) { e.setFire(f, at, tc); approach(tyre.gain, 0.05 + 0.2 * s, at, tc); approach(hiss.gain, 0.02 + 0.08 * s, at, tc); approach(road.gain, 0.1 + 0.3 * s, at, tc); approach(wind.gain, 0.02 + 0.1 * s * s, at, tc); }
      else { e.setFire(f, at); tyre.gain.setValueAtTime(0.05 + 0.2 * s, at); hiss.gain.setValueAtTime(0.02 + 0.08 * s, at); road.gain.setValueAtTime(0.1 + 0.3 * s, at); wind.gain.setValueAtTime(0.02 + 0.1 * s * s, at); }
    };
    set(sp, t);
    return set;
  }
  SFX.car_away = (k, out, t, o) => {
    const d = 7;
    const pan = panner(k, 0);
    env(pan.pan, t, [[0, o.pan0 != null ? o.pan0 : 0], [d, o.pan1 != null ? o.pan1 : -0.6]]);
    const lp = filt(k, 'lowpass', 4000, 0.6);
    glide(lp.frequency, t, 4000, 280, d);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.2, 0.6], [1.5, 0.55], [d * 0.6, 0.18], [d, 0]]);
    chain(lp, g, pan, out);
    const e = engineGraph(k, t, { fire: 27 }, d);
    e.setFire(27, t); e.rampFire(60, t + 1.5); e.rampFire(40, t + 2.5); e.rampFire(62, t + 3.6); e.rampFire(58, t + d);
    e.out.connect(lp);
    grainPlay(k, lp, t + 0.1, grain(k, 'gravel', 6, 0.25, GR.gravel), 0.4, 0.7);
    grainPlay(k, lp, t + 0.35, grain(k, 'gravel', 6, 0.25, GR.gravel), 0.35, 0.8);
    swell(k, lp, t + 0.5, { color: 'white', type: 'highpass', f: 1500, q: 0.7, pts: [[0, 0], [1, 0.08], [d - 0.5, 0]] });
    return d;
  };
  SFX.engine_fail = (k, out, t, o) => {
    crank(k, out, t, 1.0, 5.5, 300, 0.1);
    const s = t + 1.05;
    [0, 0.19, 0.25, 0.52].forEach((dt, i) => {
      burst(k, out, s + dt, { color: 'brown', type: 'lowpass', f: 400, q: 0.7, a: 0.004, t60: 0.2, amp: 0.55 - i * 0.08 });
      thump(k, out, s + dt, 60, 40, 0.15, 0.35);
    });
    const e = engineGraph(k, s, { fire: 18 }, 0.8);
    e.setFire(18, s); e.rampFire(6, s + 0.75);
    const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.08, 0.35], [0.75, 0]]);
    chain(e.out, g, out);
    crank(k, out, t + 2.2, 0.7, 4, 240, 0.07);
    click(k, out, t + 3.2, 1400, 0.35);
    click(k, out, t + 3.45, 1400, 0.3);
    return 3.7;
  };
  SFX.lever = (k, out, t, o) => {
    for (let i = 0; i < 5; i++) {
      click(k, out, t + i * 0.075, 3000, 0.24, 0.01);
      modal(k, out, t + i * 0.075, [[2400, 0.04, 0.04]]);
    }
    const s = t + 0.45;
    thump(k, out, s, 90, 55, 0.2, 0.75);
    modal(k, out, s, [[110, 0.5, 0.25], [260, 0.4, 0.18], [520, 0.3, 0.12], [1030, 0.2, 0.07], [1750, 0.12, 0.05]]);
    burst(k, out, s, { type: 'lowpass', f: 1500, q: 0.7, a: 0.001, t60: 0.08, amp: 0.4 });
    const h = osc(k, 'sawtooth', 60, s + 0.05, 0.5);
    const hg = gain(k, 0); env(hg.gain, s + 0.05, [[0, 0], [0.1, 0.05], [0.5, 0]]);
    chain(h, filt(k, 'lowpass', 300, 0.7), hg, out);
    return 1.4;
  };
  function piezo(k, out, t, f, d, amp) {
    const b = osc(k, 'square', f, t, d + 0.01);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.003, amp], [d - 0.004, amp], [d, 0]]);
    chain(b, filt(k, 'lowpass', 4000, 0.7), g, out);
  }
  SFX.keypad = (k, out, t, o) => {
    thump(k, out, t, 900, 700, 0.015, 0.08);
    click(k, out, t, 2500, 0.12, 0.005);
    piezo(k, out, t + 0.005, 1400, 0.07, 0.1);
    return 0.12;
  };
  SFX.keypad_ok = (k, out, t, o) => {
    piezo(k, out, t, 1400, 0.08, 0.1);
    piezo(k, out, t + 0.1, 2100, 0.12, 0.1);
    thump(k, out, t + 0.3, 160, 100, 0.06, 0.45);
    click(k, out, t + 0.3, 1300, 0.45);
    modal(k, out, t + 0.3, [[1900, 0.08, 0.06]]);
    return 0.6;
  };
  SFX.keypad_bad = (k, out, t, o) => {
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.005, 0.1], [0.5, 0.1], [0.52, 0]]);
    osc(k, 'square', 196, t, 0.53).connect(g);
    osc(k, 'square', 207, t, 0.53).connect(g);
    chain(g, filt(k, 'lowpass', 1800, 0.7), out);
    return 0.6;
  };
  SFX.paper = (k, out, t, o) => grainPlay(k, out, t, grain(k, 'paper', 5, 0.75, GR.paper), 0.45, o.P, filt(k, 'highpass', 500, 0.7));
  SFX.pen = (k, out, t, o) => {
    const n = 3 + Math.floor(Math.random() * 4);
    let s = t;
    for (let i = 0; i < n; i++) {
      const d = rnd(0.08, 0.2);
      const src = friction(k, s, d, [[0, rnd(300, 600)], [d, rnd(300, 600)]], 120, 40);
      const b = gain(k, 0); env(b.gain, s, [[0, 0], [0.01, rnd(0.05, 0.09)], [d - 0.01, 0.05], [d, 0]]);
      chain(src, filt(k, 'bandpass', rnd(3200, 4400), 1.5), b, out);
      chain(noise(k, 'white', s, d), filt(k, 'bandpass', 4000, 2), (() => { const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.01, 0.03], [d, 0]]); return g; })(), out);
      s += d + rnd(0.03, 0.1);
    }
    click(k, out, s + 0.05, 2800, 0.15);
    return s - t + 0.15;
  };
  SFX.generator_start = (k, out, t, o) => {
    crank(k, out, t, 1.0, 4, 200, 0.12);
    const s = t + 0.95;
    const e = engineGraph(k, s, { fire: 8, diesel: true }, 2.4);
    e.setFire(8, s); e.rampFire(20, s + 0.35); e.rampFire(36, s + 0.9); e.rampFire(28, s + 1.7); e.rampFire(28, s + 2.3);
    const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.15, 0.45], [1, 0.6], [2, 0.5], [2.35, 0]]);
    chain(e.out, g, out);
    burst(k, out, s + 0.05, { color: 'pink', type: 'lowpass', f: 600, q: 0.7, a: 0.01, t60: 0.5, amp: 0.3 });
    return 3.3;
  };
  SFX.generator_stop = (k, out, t, o) => {
    const e = engineGraph(k, t, { fire: 28, diesel: true }, 3.2);
    e.setFire(28, t); e.expFire(3, t + 2.9);
    const g = gain(k, 0); env(g.gain, t, [[0, 0.5], [1.5, 0.4], [2.9, 0.08], [3.1, 0]]);
    chain(e.out, g, out);
    thump(k, out, t + 2.95, 45, 30, 0.4, 0.4);
    modal(k, out, t + 3.0, [[180, 0.3, 0.06], [420, 0.2, 0.04]]);
    click(k, out, t + 3.3, 4000, 0.05);
    click(k, out, t + 3.9, 3700, 0.04);
    return 4.2;
  };
  SFX.power_down = (k, out, t, o) => {
    thump(k, out, t, 80, 50, 0.15, 0.5);
    click(k, out, t, 900, 0.4);
    const w = osc(k, 'sine', 1250, t, 2.3);
    glide(w.frequency, t, 1250, 70, 2.2);
    const wg = gain(k, 0); env(wg.gain, t, [[0, 0], [0.05, 0.08], [2.2, 0]]);
    chain(w, wg, out);
    const w2 = osc(k, 'sine', 2500, t, 2.3);
    glide(w2.frequency, t, 2500, 140, 2.2);
    const w2g = gain(k, 0); env(w2g.gain, t, [[0, 0], [0.05, 0.03], [1.6, 0]]);
    chain(w2, w2g, out);
    const h = osc(k, 'sawtooth', 120, t, 1.6);
    glide(h.frequency, t, 120, 55, 1.5);
    const hg = gain(k, 0); env(hg.gain, t, [[0, 0.1], [1.5, 0]]);
    chain(h, filt(k, 'lowpass', 800, 0.7), hg, out);
    thump(k, out, t + 0.05, 55, 30, 0.8, 0.4);
    return 2.6;
  };
  SFX.power_up = (k, out, t, o) => {
    thump(k, out, t, 90, 60, 0.12, 0.45);
    click(k, out, t, 1100, 0.4);
    const w = osc(k, 'sine', 60, t, 1.9);
    glide(w.frequency, t, 60, 1400, 1.6);
    const wg = gain(k, 0); env(wg.gain, t, [[0, 0], [0.3, 0.05], [1.4, 0.08], [1.9, 0]]);
    chain(w, wg, out);
    const h = osc(k, 'sawtooth', 60, t, 2.2);
    glide(h.frequency, t, 60, 120, 0.8);
    const hg = gain(k, 0); env(hg.gain, t, [[0, 0], [0.8, 0.09], [1.6, 0.05], [2.2, 0]]);
    chain(h, filt(k, 'lowpass', 900, 0.7), hg, out);
    [1.0, 1.28, 1.45].forEach((dt) => { click(k, out, t + dt, 4000, 0.16, 0.008); modal(k, out, t + dt, [[5200, 0.04, 0.02]]); });
    return 2.2;
  };
  SFX.drip = (k, out, t, o) => {
    const f0 = rnd(1100, 1900) * (o.P || 1);
    const s = osc(k, 'sine', f0, t, 0.12);
    glide(s.frequency, t, f0, f0 * 1.6, 0.025);
    const g = gain(k, 0); perc(g.gain, t, 0.28, 0.001, 0.07);
    chain(s, g, out);
    burst(k, out, t, { f: 4000, q: 2, a: 0.001, t60: 0.02, amp: 0.06 });
    return 0.3;
  };
  SFX.pipe_groan = (k, out, t, o) => {
    const d = rnd(1.8, 3), P = o.P || 1;
    const src = friction(k, t, d, [[0, 38 * P], [d * 0.4, 55 * P], [d * 0.75, 44 * P], [d, 32 * P]], 5 * P, 3);
    const b = gain(k, 1.6);
    resBank(k, src, b, [[180 * P, 8, 1], [330 * P, 10, 0.8], [610 * P, 12, 0.5], [1150 * P, 12, 0.25]]);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [d * 0.3, 0.32], [d * 0.7, 0.28], [d, 0]]);
    chain(b, g, out);
    const ticks = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < ticks; i++) {
      const s = t + rnd(0.1, d);
      modal(k, out, s, [[2300, 0.08, 0.08], [4100, 0.05, 0.04]], 1, rnd(0.9, 1.1));
      click(k, out, s, 3000, 0.08);
    }
    return d + 0.3;
  };
  SFX.footsteps_upstairs = (k, out, t, o) => {
    const n = Math.round(o.count || rnd(5, 8)), sp = rnd(0.62, 0.72);
    const lp = filt(k, 'lowpass', 260, 0.7);
    const pan = panner(k, 0);
    env(pan.pan, t, [[0, rnd(-0.4, 0)], [n * sp, rnd(0, 0.4)]]);
    chain(lp, gain(k, 1.3), pan, out);
    for (let i = 0; i < n; i++) {
      const s = t + i * sp + rnd(-0.02, 0.02), a = Math.min(1, 0.6 + i * 0.1);
      thump(k, lp, s, 65, 40, 0.18, 0.55 * a);
      burst(k, lp, s, { color: 'brown', type: 'lowpass', f: 180, q: 0.7, a: 0.004, t60: 0.15, amp: 0.35 * a });
      burst(k, out, s, { f: 2200, q: 3, a: 0.002, t60: 0.06, amp: 0.02 * a });
      if (Math.random() < 0.3) {
        const c = friction(k, s + 0.05, 0.3, [[0, 70], [0.3, 110]], 15);
        const cg = gain(k, 0); env(cg.gain, s + 0.05, [[0, 0], [0.05, 0.12], [0.3, 0]]);
        chain(c, filt(k, 'bandpass', 500, 5), filt(k, 'lowpass', 900, 0.7), cg, out);
      }
    }
    return n * sp + 0.5;
  };
  SFX.bird_strike = (k, out, t, o) => {
    thump(k, out, t, 240, 120, 0.05, 0.55);
    burst(k, out, t, { type: 'lowpass', f: 1500, q: 0.7, a: 0.001, t60: 0.03, amp: 0.45 });
    modal(k, out, t, [[1380, 0.2, 0.15], [2950, 0.15, 0.1], [4700, 0.1, 0.06]]);
    thump(k, out, t, 110, 90, 0.1, 0.25);
    const am = gain(k, 0);
    chain(osc(k, 'square', 22, t + 0.03, 0.25), gain(k, 0.5), am.gain);
    const fg = gain(k, 0); env(fg.gain, t + 0.03, [[0, 0], [0.02, 0.07], [0.25, 0]]);
    chain(noise(k, 'pink', t + 0.03, 0.26), filt(k, 'bandpass', 2000, 1), am, fg, out);
    return 0.7;
  };
  SFX.collapse_rumble = (k, out, t, o) => {
    const d = 6;
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [1.5, 1.6], [4, 1.3], [d, 0]]);
    chain(noise(k, 'brown2', t, d), filt(k, 'lowpass', 90, 0.7), filt(k, 'lowpass', 120, 0.5), g, out);
    swell(k, out, t, { color: 'pink', f: 250, q: 0.7, pts: [[0, 0], [1.2, 0.25], [4, 0.2], [d, 0]] });
    for (let i = 0; i < 8; i++) burst(k, out, t + rnd(0.3, 4.5), { type: 'highpass', f: 1200, q: 0.5, a: 0.002, t60: 0.08, amp: rnd(0.15, 0.4) });
    grainPlay(k, out, t, grain(k, 'debris', 1, d, GR.debris), 0.6);
    const m = friction(k, t + 1.5, 2.5, [[0, 30], [1.2, 45], [2.5, 34]], 4, 3);
    const mg = gain(k, 0); env(mg.gain, t + 1.5, [[0, 0], [0.8, 0.18], [2.5, 0]]);
    const mb = gain(k, 1); resBank(k, m, mb, [[250, 8, 1], [520, 10, 0.6], [1100, 12, 0.3]]);
    chain(mb, mg, out);
    return d;
  };
  const WHISPERS = ['keep the channel open', 'it can hear you', 'do not turn around', 'you were always here',
    'we heard you before you were born', 'station fourteen', 'listen', 'it knows', "don't answer it", 'open the door'];
  SFX.whisper = (k, out, t, o) => {
    const text = o.text || pick(WHISPERS);
    const vp = voiceParams(o.speaker || 'unknown', { gender: 'n', formant: 1.1 });
    const d = o.text ? lineDur(text) : Math.min(lineDur(text), 0.5 + text.split(' ').length * 0.26);
    const sum = gain(k, 1);
    let natural = false;
    if (voiceStyle({}) !== 'classic') {
      // the natural engine whispers too: unvoiced source through the same moving vocal tract
      natural = !!safe('whisper', () => {
        const r = nvMain().voiceOnly(text, nvPlainVp(vp), d, { whisper: true, seed: (Math.random() * 4294967296) >>> 0 });
        const b = k.ctx.createBuffer(1, r.data.length, r.sr);
        if (b.copyToChannel) b.copyToChannel(r.data, 0); else b.getChannelData(0).set(r.data);
        chain(bufSrc(k, b, t), gain(k, 3), sum);
        return true;
      }, false);
    }
    if (!natural) {
      const plan = planSpeech(text, vp, d, hashStr(text) ^ ((Math.random() * 1e9) | 0));
      synthSpeech(k, sum, t, plan, vp, { whisper: true });
    }
    const pan = panner(k, o.pan != null ? o.pan : rnd(-0.7, 0.7));
    chain(sum, filt(k, 'highpass', 700, 0.7), filt(k, 'lowpass', 7500, 0.7), gain(k, 0.6), pan, out);
    return d;
  };
  SFX.ringing = (k, out, t, o) => {
    const d = o.dur || 5, f = 7200 * (o.P || 1);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.35, 0.06], [d * 0.5, 0.05], [d, 0]]);
    osc(k, 'sine', f, t, d).connect(g);
    osc(k, 'sine', f + 3, t, d).connect(g);
    const g2 = gain(k, 0); env(g2.gain, t, [[0, 0], [0.5, 0.008], [d, 0]]);
    chain(osc(k, 'sine', f / 2, t, d), g2, out);
    g.connect(out);
    return d;
  };
  SFX.branches = (k, out, t, o) => {
    grainPlay(k, out, t, grain(k, 'leaves', 4, 1.2, GR.leaves), 0.5, o.P, filt(k, 'lowpass', 5000, 0.7));
    const snaps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < snaps; i++) {
      const s = t + rnd(0.1, 1.0);
      click(k, out, s, rnd(2500, 4000), rnd(0.2, 0.35), 0.015, 1.2);
      modal(k, out, s, [[rnd(1000, 1500), 0.03, 0.05]]);
    }
    swell(k, out, t, { color: 'pink', f: 900, f1: 1800, q: 0.8, pts: [[0, 0], [0.15, 0.1], [0.5, 0.03], [1.1, 0]] });
    return 1.2;
  };
  SFX.vent_open = (k, out, t, o) => {
    [0, 0.35].forEach((dt) => {
      const src = friction(k, t + dt, 0.15, [[0, 700], [0.15, 760]], 60, 30);
      const g = gain(k, 0); env(g.gain, t + dt, [[0, 0], [0.02, 0.06], [0.15, 0]]);
      chain(src, filt(k, 'bandpass', 2500, 4), g, out);
    });
    burst(k, out, t + 0.7, { f: 3000, q: 1.5, a: 0.02, t60: 0.12, amp: 0.1, dur: 0.15 });
    const s = t + 0.85;
    click(k, out, s, 2000, 0.45);
    modal(k, out, s, [[870, 0.3, 0.12], [1930, 0.2, 0.08], [3300, 0.12, 0.05]]);
    // sheet-metal wobble
    for (const [f, a] of [[140, 0.25], [310, 0.14], [620, 0.07]]) {
      const w = osc(k, 'sine', f, s, 1);
      chain(osc(k, 'sine', 7, s, 1), gain(k, f * 0.06), w.frequency);
      const g = gain(k, 0); perc(g.gain, s, a, 0.002, 0.9);
      chain(w, g, out);
    }
    thump(k, out, t + 1.3, 150, 100, 0.06, 0.3);
    modal(k, out, t + 1.3, [[1200, 0.2, 0.05]]);
    return 1.8;
  };
  SFX.ladder = (k, out, t, o) => {
    const n = Math.round(o.count || 4), sp = 0.42;
    for (let i = 0; i < n; i++) {
      const s = t + i * sp + rnd(-0.02, 0.02);
      click(k, out, s - 0.08, 2500, 0.1);
      thump(k, out, s, 180, 130, 0.05, 0.38);
      modal(k, out, s, [[640, 0.25, 0.1], [1480, 0.18, 0.07], [2710, 0.1, 0.05], [3900, 0.07, 0.03]], rnd(0.8, 1), rnd(0.97, 1.03));
    }
    return n * sp + 0.4;
  };
  SFX.hatch = (k, out, t, o) => {
    click(k, out, t, 1800, 0.4);
    click(k, out, t + 0.12, 1700, 0.35);
    const c = friction(k, t + 0.2, 0.7, [[0, 110], [0.35, 150], [0.7, 95]], 12, 6);
    const cg = gain(k, 0); env(cg.gain, t + 0.2, [[0, 0], [0.1, 0.15], [0.6, 0.12], [0.7, 0]]);
    const cb = gain(k, 1); resBank(k, c, cb, [[600, 6, 1], [1300, 8, 0.6]]);
    chain(cb, cg, out);
    const s = t + 1.0;
    thump(k, out, s, 70, 45, 0.35, 0.75);
    modal(k, out, s, [[85, 0.9, 0.25], [170, 0.8, 0.2], [330, 0.6, 0.14], [560, 0.45, 0.1], [910, 0.3, 0.06]]);
    burst(k, out, s, { type: 'lowpass', f: 1400, q: 0.7, a: 0.001, t60: 0.1, amp: 0.45 });
    return 2.4;
  };
  SFX.wind_gust = (k, out, t, o) => {
    const d = rnd(2.5, 4);
    const lp = o.indoor ? filt(k, 'lowpass', 700, 0.7) : gain(k, 1);
    lp.connect(out);
    const s1 = swell(k, lp, t, { color: 'pink', f: 400, q: 0.8, pts: [[0, 0], [d * 0.4, 0.4], [d, 0]] });
    env(s1.bq.frequency, t, [[0, 400], [d * 0.4, 900], [d, 500]]);
    const s2 = swell(k, lp, t, { color: 'pink', f: 900, q: 20, pts: [[0, 0], [d * 0.45, 0.25], [d, 0]] });
    env(s2.bq.frequency, t, [[0, 900], [d * 0.45, 1250], [d, 1000]]);
    return d;
  };
  SFX.cough = (k, out, t, o) => {
    const n = Math.round(o.count || rnd(2, 4));
    let s = t;
    const vp = voiceParams(o.speaker || 'you_injured');
    for (let i = 0; i < n; i++) {
      const d = rnd(0.12, 0.2);
      const src = gain(k, 1);
      const g = gain(k, 0); env(g.gain, s, [[0, 0], [0.004, 0.9], [d * 0.3, 0.5], [d, 0]]);
      chain(noise(k, 'white', s, d + 0.02), g, src);
      const v = osc(k, wave(k, 'glottal'), vp.pitch * rnd(0.9, 1.2), s, d);
      const vg = gain(k, 0); env(vg.gain, s, [[0, 0], [0.01, 0.35], [d, 0]]);
      chain(v, vg, src);
      const b = gain(k, 1.4);
      resBank(k, src, b, [[700 * vp.formant, 3, 1], [1500 * vp.formant, 5, 0.6], [2600 * vp.formant, 6, 0.3]]);
      b.connect(out);
      s += d + rnd(0.12, 0.2);
    }
    return s - t + 0.1;
  };
  SFX.door_handle = (k, out, t, o) => {
    const src = friction(k, t, 0.45, [[0, 250], [0.45, 320]], 25, 12);
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.05, 0.08], [0.45, 0]]);
    const b = gain(k, 1); resBank(k, src, b, [[1600, 5, 1], [3000, 7, 0.5]]);
    chain(b, g, out);
    click(k, out, t + 0.5, 2300, 0.35);
    modal(k, out, t + 0.5, [[2600, 0.05, 0.05]]);
    click(k, out, t + 0.82, 2600, 0.25);
    return 1.0;
  };
  SFX.rain_car = (k, out, t, o) => {
    const d = o.dur || 4;
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.3, 1], [d - 0.3, 1], [d, 0]]);
    chain(noise(k, 'crackle', t, d), filt(k, 'bandpass', 1800, 0.6), gain(k, 0.9), g);
    chain(noise(k, 'crackle', t, d), filt(k, 'bandpass', 520, 6), gain(k, 0.5), g);
    chain(noise(k, 'pink', t, d), filt(k, 'lowpass', 400, 0.7), gain(k, 0.35), g);
    g.connect(out);
    return d;
  };
  SFX.wipers = (k, out, t, o) => {
    thump(k, out, t, 120, 80, 0.06, 0.25);
    swell(k, out, t, { color: 'pink', f: 1500, f1: 2400, q: 1.2, pts: [[0, 0], [0.2, 0.12], [0.5, 0]] });
    const sq = friction(k, t + 0.35, 0.15, [[0, 900], [0.15, 1000]], 80, 20);
    const sg = gain(k, 0); env(sg.gain, t + 0.35, [[0, 0], [0.03, 0.03], [0.15, 0]]);
    chain(sq, filt(k, 'bandpass', 3000, 3), sg, out);
    thump(k, out, t + 0.55, 110, 75, 0.06, 0.2);
    swell(k, out, t + 0.55, { color: 'pink', f: 2400, f1: 1500, q: 1.2, pts: [[0, 0], [0.2, 0.1], [0.5, 0]] });
    return 1.1;
  };
  SFX.keys = (k, out, t, o) => grainPlay(k, out, t, grain(k, 'keys', 3, 0.7, GR.keys), 0.35, o.P);
  SFX.rustle = (k, out, t, o) => {
    swell(k, out, t, { color: 'pink', f: 2200, q: 0.7, pts: [[0, 0], [0.08, 0.1], [0.3, 0.02], [0.4, 0]] });
    return 0.45;
  };

  /* ---------------------------------------------------------- stingers */
  SFX.stinger_low = (k, out, t, o) => {
    const d = 5;
    const sub = osc(k, 'sine', 40, t, d);
    glide(sub.frequency, t, 44, 29, 3);
    const sg = gain(k, 0); perc(sg.gain, t, 0.7, 0.01, 4);
    chain(sub, sg, out);
    const cl = gain(k, 0); env(cl.gain, t, [[0, 0], [0.05, 0.16], [1.5, 0.1], [d, 0]]);
    const lp = filt(k, 'lowpass', 300, 1.5);
    env(lp.frequency, t, [[0, 300], [0.6, 900], [d, 180]]);
    for (const f of [41.2, 43.65, 58.27, 61.9]) osc(k, 'sawtooth', f, t, d).connect(lp);
    chain(lp, cl, out);
    burst(k, out, t, { color: 'brown', type: 'lowpass', f: 200, q: 0.7, a: 0.003, t60: 1.5, amp: 0.6 });
    modal(k, out, t, [[173, 4, 0.05], [317, 3.2, 0.04], [499, 2.5, 0.03], [743, 2, 0.02]]);
    return d;
  };
  SFX.stinger_high = (k, out, t, o) => {
    const d = 2.2;
    const b = gain(k, 1);
    const vib = osc(k, 'sine', 6.6, t, d);
    for (const f of [1480, 1568, 2093, 2217]) {
      const s = osc(k, 'sawtooth', f, t, d);
      chain(vib, gain(k, f * 0.012), s.frequency);
      s.connect(b);
    }
    const g = gain(k, 0); env(g.gain, t, [[0, 0], [0.03, 0.09], [0.4, 0.07], [d, 0]]);
    chain(b, filt(k, 'bandpass', 2500, 1), g, out);
    const n = swell(k, out, t, { color: 'white', f: 4500, q: 1, pts: [[0, 0], [0.02, 0.18], [0.5, 0.06], [d, 0]] });
    const am = gain(k, 1); chain(ctrl(k, t, d, 25), gain(k, 0.5), am.gain);
    n.g.disconnect(); chain(n.g, am, out);
    const sh = osc(k, 'sine', 3520, t, d);
    const shg = gain(k, 0); env(shg.gain, t, [[0, 0], [0.02, 0.04], [d, 0]]);
    chain(sh, shg, out);
    return d;
  };
  SFX.stinger_glitch = (k, out, t, o) => {
    let s = t;
    const end = t + rnd(0.9, 1.3);
    while (s < end) {
      const d = rnd(0.03, 0.09);
      const r = Math.random();
      if (r < 0.45) burst(k, out, s, { f: rnd(500, 5000), q: rnd(0.5, 3), a: 0.001, t60: d * 2, amp: rnd(0.25, 0.5), dur: d });
      else if (r < 0.8) piezo(k, out, s, rnd(200, 3000), d, rnd(0.06, 0.12));
      else {
        // buzzy repeat: a tiny noise loop at audio rate
        const bz = osc(k, 'square', rnd(50, 90), s, d);
        const bg = gain(k, 0); env(bg.gain, s, [[0, 0], [0.002, 0.15], [d - 0.002, 0.15], [d, 0]]);
        chain(bz, filt(k, 'lowpass', 3000, 1), bg, out);
      }
      s += d + (Math.random() < 0.3 ? rnd(0.02, 0.06) : 0);
    }
    const ts = osc(k, 'sawtooth', 120, s, 0.45);
    glide(ts.frequency, s, 120, 25, 0.4);
    const tg = gain(k, 0); env(tg.gain, s, [[0, 0.12], [0.4, 0]]);
    chain(ts, filt(k, 'lowpass', 1200, 0.7), tg, out);
    return s - t + 0.5;
  };

  /**
   * Level trims (measured offline: peak at vol 1) so every sound sits at a sensible loudness
   * without retuning each builder: big impacts ≈0.85, mid ≈0.6, soft sounds stay soft.
   */
  const TRIM = {
    door_heavy: 0.6, breaker_trip: 0.5, impact: 0.62, lever: 0.74, hatch: 0.77, collapse_rumble: 0.55, stinger_low: 0.64,
    door_creak: 3, pipe_groan: 2.4, wind_gust: 2.2, scan: 5, pen: 4.5, door_handle: 2.7, rustle: 4.5, flicker: 3.2,
    stinger_glitch: 2.7, heartbeat: 0.85, stinger_high: 1.6, breath: 1.5, breath_other: 1.5, ringing: 1.2, dial_tone: 0.45, alarm: 2,
    switch: 1.8, phone_pickup: 1.4, chair_scrape: 1.4, cough: 1.5, keypad: 2, static_burst: 0.7, thunder: 0.5,
    car_door: 0.85, rain_car: 0.65, car_drive: 0.85, car_idle: 0.8, generator: 0.85, car_start: 0.66, car_away: 0.75,
    generator_start: 0.66, footsteps_upstairs: 0.72, door_open: 2.8, creak: 1.9,
  };
  function trimmed(fn, g) {
    return function (k, out, t, o, T) {
      const tg = gain(k, g);
      tg.connect(out);
      return fn(k, tg, t, o, T);
    };
  }
  /** Names of every synthesizable one-shot. */
  const NAME_LIST = Object.keys(SFX);

  /* ============================================================ LOOP SPECS
   * Native continuous loops: LOOPB[name](k, out, t, o, T) → {set(params, now)}.
   * Everything else loops by re-triggering its one-shot (REPEAT gives the period).
   */
  const LOOPB = {
    car_idle(k, out, t, o, T) {
      const e = engineGraph(k, t, { fire: 27 }, T);
      const hunt = gain(k, 1);
      chain(ctrl(k, t, T, 0.5), gain(k, 0.04), hunt.gain);
      chain(e.out, hunt, gain(k, 0.45), out);
      e.setFire(27, t);
      return { set(p, now) { if (p.rev != null) e.setFire(27 + 45 * clamp(p.rev, 0, 1), now, 0.25); } };
    },
    car_drive(k, out, t, o, T) {
      const set = driveGraph(k, out, t, T, clamp(o.speed == null ? 0.6 : o.speed, 0, 1));
      return { set(p, now) { if (p.speed != null) set(p.speed, now, 0.6); } };
    },
    generator(k, out, t, o, T) {
      const e = engineGraph(k, t, { fire: 28, diesel: true }, T);
      e.setFire(28, t);
      chain(e.out, gain(k, 0.5), out);
      return { set(p, now) { if (p.rpm != null) e.setFire(28 * clamp(p.rpm, 0.1, 2), now, 0.3); } };
    },
    dial_tone(k, out, t, o, T) {
      const g = gain(k, 0.22);
      osc(k, 'sine', 350, t, T).connect(g);
      osc(k, 'sine', 440, t, T).connect(g);
      phoneChain(k, g, out, t, T);
      return {};
    },
    ringing(k, out, t, o, T) {
      const f = 7200 * (o.P || 1);
      const g = gain(k, 0);
      env(g.gain, t, [[0, 0], [0.5, 0.055]]);
      osc(k, 'sine', f, t, T).connect(g);
      osc(k, 'sine', f + 3, t, T).connect(g);
      g.connect(out);
      return {};
    },
    coffee_brew(k, out, t, o, T) {
      const s = bufSrc(k, grain(k, 'brew', 2, 5.2, GR.brew), t, 1, true, T);
      chain(s, filt(k, 'lowpass', 5000, 0.7), gain(k, 0.45), out);
      return {};
    },
    rain_car(k, out, t, o, T) {
      chain(noise(k, 'crackle', t, T), filt(k, 'bandpass', 1800, 0.6), gain(k, 0.9), out);
      chain(noise(k, 'crackle', t, T), filt(k, 'bandpass', 520, 6), gain(k, 0.5), out);
      chain(noise(k, 'pink', t, T), filt(k, 'lowpass', 400, 0.7), gain(k, 0.35), out);
      return {};
    },
  };
  for (const n in TRIM) {
    if (SFX[n]) SFX[n] = trimmed(SFX[n], TRIM[n]);
    if (LOOPB[n]) LOOPB[n] = trimmed(LOOPB[n], TRIM[n]);
  }
  const REPEAT = {
    phone_ring: () => 4.4,
    heartbeat: (o, h) => 60 / clamp((h.params && h.params.bpm) || o.bpm || 70, 40, 180),
    drip: (o) => o.interval || rnd(0.8, 3.5),
    alarm: () => 1.4,
    wipers: () => 1.1,
    scan: (o, h, d) => d,
    tuning: (o, h, d) => Math.max(0.3, d - 0.08),
    static_burst: (o, h, d) => o.interval || d + rnd(0.05, 1.2),
    footsteps_upstairs: (o, h, d) => o.interval || d + rnd(1.5, 5),
    whisper: (o, h, d) => o.interval || d + rnd(0.6, 2.5),
    breath: (o, h, d) => d,
    breath_other: (o, h, d) => d,
    creak: (o) => o.interval || rnd(2, 7),
  };

  /* --------------------------------------------------------- name resolving */
  const ALIAS = {
    scream: 'scream_distant', static: 'static_burst', thud: 'impact', bang: 'impact', slam: 'door_close',
    door: 'door_close', step: 'footstep', footsteps: 'footstep', steps: 'footstep', run: 'running',
    engine: 'car_idle', rain: 'rain_car', gust: 'wind_gust', wind: 'wind_gust', squelch: 'static_burst',
    generator_loop: 'generator', generator_run: 'generator', hum: 'flicker', stinger: 'stinger_low',
    glitch: 'stinger_glitch', tinnitus: 'ringing', clunk: 'lever', key: 'door_unlock', keys_jingle: 'keys',
    wiper: 'wipers', thunder_far: 'thunder', phone: 'phone_ring', ring: 'phone_ring', steps_upstairs: 'footsteps_upstairs',
  };
  const FUZZY = [
    [/ringing|tinnitus/, 'ringing'], [/window/, 'window_knock'], [/knock/, 'knock'], [/glass|shatter|jar/, 'glass_break'],
    [/shout/, 'shout_distant'], [/scream|shriek|yell/, 'scream_distant'], [/static|hiss|crackle|squelch|interference/, 'static_burst'],
    [/dial/, 'dial_tone'], [/hang/, 'phone_hangup'], [/pick/, 'phone_pickup'], [/phone|ring/, 'phone_ring'],
    [/unlock/, 'door_unlock'], [/locked|rattle/, 'door_locked'], [/handle|latch/, 'door_handle'],
    [/door.*open|open.*door/, 'door_open'], [/steel|heavy|blast/, 'door_heavy'], [/door|slam/, 'door_close'],
    [/run/, 'running'], [/step|walk|foot/, 'footstep'], [/car|engine|drive|motor/, 'car_idle'],
    [/breath|pant|gasp|sigh/, 'breath_other'], [/cough/, 'cough'], [/thunder|storm|lightning/, 'thunder'],
    [/rain/, 'rain_car'], [/wind|gust/, 'wind_gust'], [/bird/, 'bird_strike'], [/keypad/, 'keypad'],
    [/switch|click|button/, 'switch'], [/beep|alert|tone|chime/, 'beep'], [/buzz|flicker|light|fluor/, 'flicker'],
    [/crash|fall|clatter|topple/, 'shelf_fall'], [/thud|thump|bang|impact|hit|body/, 'impact'],
    [/creak|floor|board/, 'creak'], [/drip|water|leak/, 'drip'], [/pipe|groan/, 'pipe_groan'],
    [/whisper|murmur/, 'whisper'], [/heart|pulse/, 'heartbeat'], [/eject/, 'tape_eject'], [/tape|cassette/, 'tape_play'],
    [/paper|page|rustle|doc/, 'paper'], [/key/, 'door_unlock'], [/chair|scrape|drag/, 'chair_scrape'],
    [/alarm|siren|klaxon/, 'alarm'], [/rumble|collapse|quake/, 'collapse_rumble'], [/branch|leaves|bush|forest/, 'branches'],
    [/vent|duct/, 'vent_open'], [/ladder|climb/, 'ladder'], [/hatch/, 'hatch'], [/lever|limiter/, 'lever'],
    [/generator/, 'generator_start'], [/power/, 'power_down'], [/glitch/, 'stinger_glitch'], [/sting|shock|reveal/, 'stinger_low'],
    [/scan/, 'scan'], [/tun/, 'tuning'], [/pen|writ|scratch/, 'pen'], [/mug|cup/, 'mug_set'], [/coffee|brew/, 'coffee_brew'],
    [/wiper/, 'wipers'], [/radio/, 'radio_click'],
  ];
  const resolved = {};
  function resolveName(name) {
    name = String(name || '');
    if (resolved[name] !== undefined) return resolved[name];
    let r = null;
    if (SFX[name] || LOOPB[name]) r = name;
    else if (ALIAS[name]) r = ALIAS[name];
    else {
      const low = name.toLowerCase();
      if (SFX[low] || LOOPB[low]) r = low;
      else for (const [re, n] of FUZZY) if (re.test(low)) { r = n; break; }
    }
    if (!r) warnOnce('unknown sound "' + name + '"');
    resolved[name] = r;
    return r;
  }
  /** Normalise user opts for builders. */
  function norm(o, E) {
    const n = Object.assign({}, o);
    n.P = clamp(num(o.rate, 1), 0.25, 4);
    if (E && n.indoor == null && E.amb) n.indoor = !!E.amb.P.indoor;
    return n;
  }
  function isSrc(n) { return typeof n.start === 'function' && typeof n.stop === 'function'; }
  /** Wrap every function on a handle so callers can never get an exception from it. */
  function guardApi(api) {
    for (const key of Object.keys(api)) {
      const d = Object.getOwnPropertyDescriptor(api, key);
      if (d && typeof d.value === 'function') {
        const fn = d.value;
        api[key] = function () { try { return fn.apply(this, arguments); } catch (e) { warnOnce('handle.' + key, e); return undefined; } };
      }
    }
    return api;
  }
  function dispose(nodes) {
    if (!nodes) return;
    for (const n of nodes) {
      if (isSrc(n)) { try { n.stop(); } catch (e) { /* already stopped */ } }
      try { n.disconnect(); } catch (e) { /* ignore */ }
    }
    nodes.length = 0;
  }

  /* ================================================================ ENGINE */
  const LOOKAHEAD = 0.3;
  const MAX_SHOTS = 48, MAX_VOICES = 6, MAX_LOOPS = 24;
  const SEND = { sfx: 0.3, radio: 0.1, voice: 0.18, stingers: 0.4, amb: 0.12 };
  const LONG = 86400;

  function createEngine(ctx, cfg) {
    cfg = cfg || {};
    const k = kit(ctx);
    k.bag = null;
    const E = { ctx, k, realtime: !!cfg.realtime, shots: [], loops: [], voices: [], spawned: [], later: [], lastPlay: {} };
    E.now = () => ctx.currentTime;

    /* ---- master chain */
    E.master = gain(k, clamp(num(cfg.volume, 0.8), 0, 1));
    E.silenceG = gain(k, 1);
    E.comp = ctx.createDynamicsCompressor();
    // gentle glue only: Chrome's compressor adds automatic make-up gain, so a low threshold would
    // lift every quiet bed and flatten the dynamics horror depends on (measured: +1.8 dB at -40)
    E.comp.threshold.value = -8; E.comp.knee.value = 8; E.comp.ratio.value = 2;
    E.comp.attack.value = 0.005; E.comp.release.value = 0.3;
    E.limiter = ctx.createDynamicsCompressor();
    E.limiter.threshold.value = -1; E.limiter.knee.value = 0; E.limiter.ratio.value = 20;
    E.limiter.attack.value = 0.001; E.limiter.release.value = 0.08;
    E.safety = shaper(k, 'safety');
    if (cfg.bare) chain(E.master, E.silenceG, ctx.destination);
    else chain(E.master, E.silenceG, E.comp, E.limiter, E.safety, ctx.destination);
    if (E.realtime && ctx.createAnalyser) {
      E.analyser = ctx.createAnalyser();
      E.analyser.fftSize = 2048;
      E.safety.connect(E.analyser);
    }
    E.duckG = gain(k, 1);
    E.duckG.connect(E.master);
    E.bus = { amb: gain(k, 0.9), sfx: gain(k, 1), radio: gain(k, 1), voice: gain(k, 1.6), stingers: gain(k, 0.85) };
    E.bus.amb.connect(E.duckG); E.bus.sfx.connect(E.duckG);
    E.bus.radio.connect(E.master); E.bus.voice.connect(E.master); E.bus.stingers.connect(E.master);
    E.selfG = gain(k, 0); // the player's own breathing: centred, dry
    E.selfG.connect(E.bus.sfx);

    /* ---- room reverb: A/B crossfaded convolvers */
    E.revIn = gain(k, 1);
    E.revOut = gain(k, 1);
    E.revOut.connect(E.duckG);
    E.room = null;
    E.revs = {};
    /** One reverb per room type, built once: convolver (+ comb tail for the array) → wet gain. */
    function buildRev(room) {
      const cv = ctx.createConvolver();
      cv.buffer = impulse(k, room);
      const g = ctx.createGain();
      g.gain.value = 0;
      cv.connect(g);
      g.connect(E.revOut);
      const rev = { cv, g, tin: null, connected: false };
      if (ROOMS[room].tail) {
        // cheap long tail: parallel feedback combs (delay → lowpass → feedback), panned L/R
        rev.tin = ctx.createGain();
        rev.tin.gain.value = 0.2;
        [0.297, 0.371, 0.433, 0.529, 0.613].forEach((d, i) => {
          const dl = ctx.createDelay(1), lp = ctx.createBiquadFilter(), fb = ctx.createGain(), pn = ctx.createStereoPanner();
          dl.delayTime.value = d;
          lp.type = 'lowpass'; lp.frequency.value = 1500;
          fb.gain.value = Math.pow(10, (-3 * d) / ROOMS[room].tail);
          pn.pan.value = i % 2 ? 0.7 : -0.7;
          rev.tin.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(pn); pn.connect(g);
        });
      }
      return rev;
    }
    E.setRoom = (room, now) => {
      if (!ROOMS[room]) room = 'small';
      if (room === E.room) return;
      E.room = room;
      const prev = E.rev;
      const rev = E.revs[room] || (E.revs[room] = buildRev(room));
      if (!rev.connected) {
        E.revIn.connect(rev.cv);
        if (rev.tin) E.revIn.connect(rev.tin);
        rev.connected = true;
      }
      approach(rev.g.gain, ROOMS[room].wet, now, 0.2);
      E.rev = rev;
      if (prev && prev !== rev) {
        fadeOut(prev.g.gain, now, 0.7);
        // stop feeding the old room once its tail has died (an idle convolver costs nothing)
        E.later.push({ t: now + (prev.tin ? 8 : 1.6), fn: () => {
          if (E.rev === prev || !prev.connected) return;
          try { E.revIn.disconnect(prev.cv); } catch (e) { /* */ }
          if (prev.tin) try { E.revIn.disconnect(prev.tin); } catch (e) { /* */ }
          prev.connected = false;
        } });
      }
    };
    E.setRoom(cfg.room || 'small', 0);

    /* ---- listener + positional sources */
    E.L = { x: 0, y: 0, angle: 0, map: null };
    E.lastPos = 0;
    E.updatePos = (h, now, instant) => {
      const L = E.L, p = h.pos;
      let g = 1, f = 20000, pan = 0, wet = h.sendBase;
      if (p.map != null && L.map != null && p.map !== L.map) g = 0;
      else {
        const dx = p.x - L.x, dy = p.y - L.y, d = Math.hypot(dx, dy);
        g = 1 / (1 + 0.08 * d * d);
        f = 18000 / (1 + 0.035 * d * d);
        const rel = Math.atan2(dy, dx) - L.angle;
        pan = Math.sin(rel) * 0.85 * clamp(d / 1.5, 0, 1);
        if (Math.cos(rel) < -0.2) f *= 0.7; // behind the head
        const W = DA.world;
        if (W && typeof W.lineOfSight === 'function' && d > 0.8 && (instant || now - (h.losT || -9) > 0.2)) {
          h.losT = now;
          try { h.occluded = !W.lineOfSight(L.x, L.y, p.x, p.y, L.map); } catch (e) { h.occluded = false; }
        }
        if (h.occluded) { f = Math.min(f * 0.25, 900); g *= 0.55; }
        wet = h.sendBase * (0.6 + 0.4 * Math.min(1, d / 8));
      }
      f = clamp(f, 180, 20000);
      if (instant) {
        h.pg.gain.value = g; h.lp.frequency.value = f; h.pn.pan.value = clamp(pan, -1, 1); h.send.gain.value = wet;
      } else {
        approach(h.pg.gain, g, now, 0.05); approach(h.lp.frequency, f, now, 0.05);
        approach(h.pn.pan, clamp(pan, -1, 1), now, 0.05); approach(h.send.gain, wet, now, 0.1);
      }
    };

    /**
     * Output chain for a handle: vol → [radio|phone|tape] → [muffle] → distance LP → gain → pan → bus
     * (+ reverb send). `pre` is where the sound is built.
     */
    function route(h, o, busName, t0, T) {
      const pre = gain(k, 1);
      const inG = gain(k, clamp(num(o.vol, 1), 0, 4));
      pre.connect(inG);
      let node = inG;
      if (o.radio) {
        const r = gain(k, 1);
        chain(node, filt(k, 'highpass', 300, 0.7), filt(k, 'lowpass', 3000, 0.8), filt(k, 'peaking', 1600, 1, 4), gain(k, 1.8), shaper(k, 'soft'), gain(k, 0.6), r);
        node = r;
      } else if (o.phone) {
        const r = gain(k, 1);
        phoneChain(k, node, r, t0, 0);
        node = r;
      } else if (o.tape) {
        const r = gain(k, 1);
        tapeChain(k, node, r, t0, T);
        node = r;
      }
      if (o.muffle > 0) node = chain(node, filt(k, 'lowpass', lerp(6000, 350, clamp(o.muffle, 0, 1)), 0.7), gain(k, lerp(1, 0.6, clamp(o.muffle, 0, 1))));
      const lp = filt(k, 'lowpass', 20000, 0.5);
      const pg = gain(k, 1);
      const pn = panner(k, num(o.pan, 0));
      chain(node, lp, pg, pn, E.bus[busName] || E.bus.sfx);
      h.sendBase = num(o.send, SEND[busName] || 0.2);
      const send = gain(k, h.sendBase);
      pn.connect(send);
      send.connect(E.revIn);
      Object.assign(h, { pre, inG, lp, pg, pn, send, bus: busName });
      if (o.x != null && o.y != null && isFinite(o.x) && isFinite(o.y)) {
        h.pos = { x: +o.x, y: +o.y, map: o.map != null ? o.map : E.L.map };
        E.updatePos(h, t0, true);
      }
      return pre;
    }

    /* ---- handles */
    function makeHandle(kind, name) {
      const h = { kind, name, nodes: [], t0: 0, end: Infinity, stopped: false, dur: 0, params: {} };
      h.api = {
        name, kind,
        // (every method below is wrapped by guardApi so a handle can never throw)
        get dur() { return h.dur; },
        get playing() { return !h.stopped && E.now() < h.end; },
        stop(fade) {
          if (h.stopped) return;
          h.stopped = true;
          const now = E.now();
          const f = Math.max(0.01, num(fade, kind === 'loop' ? 0.25 : 0.05));
          if (h.inG) fadeOut(h.inG.gain, now, f);
          h.end = Math.min(h.end, now + f + 0.05);
          if (h.tts) ttsCancel(h);
        },
        setVol(v) { if (h.inG && !h.stopped) approach(h.inG.gain, clamp(num(v, 1), 0, 4), E.now(), 0.04); },
        setPos(x, y, map) {
          if (!h.pg || !isFinite(x) || !isFinite(y)) return;
          h.pos = { x: +x, y: +y, map: map != null ? map : h.pos ? h.pos.map : E.L.map };
          E.updatePos(h, E.now(), false);
        },
        set(p) {
          if (!p || h.stopped) return;
          Object.assign(h.params, p);
          if (h.ctl && h.ctl.set) h.ctl.set(p, E.now());
          if (h.radio && p.clarity != null) h.radio.set(p.clarity, E.now(), 0.08);
          if (p.vol != null) h.api.setVol(p.vol);
        },
        setClarity(c) { if (h.radio && !h.stopped) h.radio.set(num(c, 1), E.now(), 0.08); },
      };
      guardApi(h.api);
      return h;
    }
    const liveCount = (arr) => arr.reduce((a, h) => a + (h.stopped ? 0 : 1), 0);
    function capList(arr, max) {
      while (liveCount(arr) >= max) {
        const h = arr.find((q) => !q.stopped);
        if (!h) break;
        h.api.stop(0.04);
      }
    }
    function busFor(name, o) {
      if (o.bus && E.bus[o.bus]) return o.bus;
      if (/^stinger_/.test(name)) return 'stingers';
      if (o.radio) return 'radio';
      return 'sfx';
    }

    /* ---- one-shots */
    E.play = (name, o) => {
      const r = resolveName(name);
      if (!r) return null;
      const now = E.now();
      if (!o.force && now - (E.lastPlay[r + (o.x || '')] || -1) < 0.012) return null; // double-trigger guard
      E.lastPlay[r + (o.x || '')] = now;
      if (!SFX[r]) return E.loop(r, Object.assign({ dur: o.dur || 3 }, o), true);
      capList(E.shots, MAX_SHOTS);
      const h = makeHandle('shot', r);
      const t0 = now + 0.01 + Math.max(0, num(o.delay, 0));
      h.t0 = t0;
      const n = norm(o, E);
      if ((r === 'breath' || r === 'breath_other') && !n.cycle) {
        n.cycle = 1 / E.br.rate;
        if (n.intensity == null) n.intensity = r === 'breath' ? E.br.level : Math.max(0.35, E.br.level);
      }
      k.bag = h.nodes;
      try {
        const pre = route(h, o, busFor(r, o), t0, 12);
        h.dur = num(SFX[r](k, pre, t0, n), 1);
      } finally { k.bag = null; }
      h.end = t0 + h.dur + 0.3;
      E.shots.push(h);
      if (r === 'ringing' && o.duck !== false) E.duck(0.55, h.dur * 0.7);
      return h.api;
    };

    /* ---- loops */
    E.loop = (name, o, fromPlay) => {
      const r = resolveName(name);
      if (!r) return null;
      capList(E.loops, MAX_LOOPS);
      const h = makeHandle('loop', r);
      const now = E.now();
      const t0 = now + 0.01 + Math.max(0, num(o.delay, 0));
      h.t0 = t0;
      h.o = norm(o, E);
      k.bag = h.nodes;
      try {
        const pre = route(h, o, busFor(r, o), t0, LONG);
        const fade = num(o.fadeIn, 0);
        if (fade > 0) env(h.inG.gain, t0, [[0, 0], [fade, clamp(num(o.vol, 1), 0, 4)]]);
        if (LOOPB[r] && !(r === 'breath_other' && o.mirror !== false)) {
          h.ctl = LOOPB[r](k, pre, t0, h.o, LONG) || {};
        } else if (r === 'breath_other' && o.mirror !== false) {
          h.mirror = true; // phase-locked to the player's breathing (scheduled by breathPump)
        } else {
          h.rep = { next: t0, insts: [] };
        }
      } finally { k.bag = null; }
      if (fromPlay) {
        // a sustained sound requested via play(): stop it after opts.dur
        const d = Math.max(0.2, num(o.dur, 3));
        h.dur = d;
        E.later.push({ t: t0 + d, fn: () => h.api.stop(0.2) });
      }
      E.loops.push(h);
      return h.api;
    };
    function pumpRepeater(h, now, until) {
      const R = h.rep;
      if (R.next < now - 1) R.next = now + 0.02; // resync after a suspend
      let guard = 0;
      while (R.next < until && guard++ < 8) {
        const inst = { nodes: [], end: 0 };
        k.bag = inst.nodes;
        let d = 1;
        try {
          const o = Object.assign({}, h.o, h.params);
          if (h.name === 'heartbeat') o.bpm = (h.params.bpm || h.o.bpm || 70);
          if ((h.name === 'breath' || h.name === 'breath_other') && !o.cycle) {
            o.cycle = 1 / E.br.rate;
            if (o.intensity == null) o.intensity = Math.max(h.name === 'breath' ? 0.2 : 0.35, E.br.level);
          }
          d = num(SFX[h.name](k, h.pre, R.next, o), 1);
        } finally { k.bag = null; }
        inst.end = R.next + d + 0.3;
        R.insts.push(inst);
        const per = (REPEAT[h.name] || ((o, hh, dd) => o.interval || dd + rnd(0.4, 1.4)))(h.o, h, d);
        R.next += Math.max(0.05, num(per, d + 0.5));
      }
      for (let i = R.insts.length - 1; i >= 0; i--) if (R.insts[i].end < now) { dispose(R.insts[i].nodes); R.insts.splice(i, 1); }
    }

    /* ---- transient scheduled sounds (ambience events): built straight into a destination */
    E.spawn = (t, dest, build) => {
      const inst = { nodes: [], end: 0 };
      k.bag = inst.nodes;
      let d = 1;
      try { d = num(build(k, dest, t), 1); } catch (e) { warnOnce('spawn', e); } finally { k.bag = null; }
      inst.end = t + d + 0.4;
      E.spawned.push(inst);
      return inst;
    };

    /* ---- player breathing (phase source for 000.00) */
    E.br = { level: 0, rate: 0.25, next: 0, cycles: [] };
    E.breathPump = (now, until) => {
      const B = E.br;
      if (B.next < now - 0.5) B.next = now + 0.02;
      let guard = 0;
      while (B.next < until && guard++ < 6) {
        const len = clamp(1 / B.rate, 0.9, 6);
        const t = B.next;
        B.cycles.push({ start: t, len });
        if (B.cycles.length > 6) B.cycles.shift();
        if (B.level > 0.02) {
          E.selfG.gain.setValueAtTime(Math.min(1, B.level * 2.5), t);
          E.spawn(t, E.selfG, (kk, out, tt) => SFX.breath(kk, out, tt, { cycle: len, intensity: B.level }));
        }
        for (const h of E.loops) {
          if (!h.mirror || h.stopped) continue;
          const inten = h.params.intensity != null ? h.params.intensity : Math.max(0.35, B.level);
          E.spawn(t, h.pre, (kk, out, tt) => SFX.breath_other(kk, out, tt, { cycle: len, intensity: inten }));
        }
        B.next = t + len;
      }
    };
    E.breathPhase = (now) => {
      now = now == null ? E.now() : now;
      const cs = E.br.cycles;
      for (let i = cs.length - 1; i >= 0; i--) {
        const c = cs[i];
        if (now >= c.start && now < c.start + c.len) return (now - c.start) / c.len;
      }
      return 0;
    };

    /* ---- radio static bed */
    E.stat = { level: 0, last: -1 };
    E.radioStatic = (level, o) => {
      o = o || {};
      const now = E.now();
      const S = E.stat;
      level = clamp(num(level, 0), 0, 1);
      const vol = clamp(num(o.vol, 1), 0, 2);
      const lv = Math.pow(level, 1.2) * vol;
      S.level = lv;
      if (lv > 0) S.last = now;
      if (!S.nodes && lv <= 0.0005) return;
      if (!S.nodes) {
        S.nodes = [];
        k.bag = S.nodes;
        try {
          const out = gain(k, 1);
          S.mlp = filt(k, 'lowpass', 3600, 0.7);
          chain(S.mlp, out, E.bus.radio);
          const fl = gain(k, 1);
          chain(ctrl(k, now, LONG, 2.5), gain(k, 0.3), fl.gain);
          S.hiss = gain(k, 0);
          chain(noise(k, 'white', now, LONG), filt(k, 'highpass', 420, 0.7), filt(k, 'lowpass', 3600, 0.7), filt(k, 'peaking', 1800, 1, 3), fl, S.hiss, S.mlp);
          S.crk = gain(k, 0);
          chain(noise(k, 'crackle', now, LONG), filt(k, 'highpass', 900, 0.7), S.crk, S.mlp);
          S.pop = gain(k, 0);
          chain(noise(k, 'crackle', now, LONG), filt(k, 'lowpass', 700, 0.7), S.pop, S.mlp);
          S.wh = osc(k, 'sine', 1100, now, LONG);
          chain(ctrl(k, now, LONG, 0.2), gain(k, 90), S.wh.frequency);
          S.whg = gain(k, 0);
          chain(S.wh, S.whg, S.mlp);
          S.v = {};
        } finally { k.bag = null; }
      }
      const tone = num(o.tone, 0);
      let wa = 0, wf = 0;
      if (tone > 20) { wa = 0.035; wf = tone; } else if (tone > 0) { wa = 0.045 * clamp(tone, 0, 1); }
      const want = { hiss: lv * 0.3, crk: lv * 0.8, pop: lv * 0.5, whg: wa * Math.max(lv, tone > 0 ? 0.25 : 0), mlp: lerp(3600, 650, clamp(num(o.muffle, 0), 0, 1)), wf };
      for (const key of ['hiss', 'crk', 'pop', 'whg']) {
        if (Math.abs((S.v[key] == null ? -1 : S.v[key]) - want[key]) > 0.0015) { approach(S[key].gain, want[key], now, 0.035); S.v[key] = want[key]; }
      }
      if (Math.abs((S.v.mlp || 0) - want.mlp) > 20) { approach(S.mlp.frequency, want.mlp, now, 0.05); S.v.mlp = want.mlp; }
      if (wf && Math.abs((S.v.wf || 0) - wf) > 2) { approach(S.wh.frequency, wf, now, 0.03); S.v.wf = wf; }
    };

    /* ---- voices
     * Three styles (voiceStyle(): o.style, else DA.settings.voiceStyle; settings.tts = 'system'):
     *   natural  daNaturalVoice — a person through the 1999 device (rendered in a worker)
     *   classic  the original formant babble (planSpeech + synthSpeech) through the node chains
     *   system   speechSynthesis reads the real words; Web Audio plays only a quiet channel bed
     */
    E.voice = (text, speakerId, o) => {
      text = String(text == null ? '' : text);
      if (/\{[A-Z]/.test(text) && DA.fmt) { try { text = DA.fmt(text); } catch (e) { /* keep raw */ } }
      const dur = lineDur(text);
      capList(E.voices, MAX_VOICES);
      const h = makeHandle('voice', speakerId);
      h.dur = dur;
      const now = E.now();
      const t0 = now + 0.02 + Math.max(0, num(o.delay, 0));
      h.t0 = t0;
      const vp = voiceParams(speakerId, o.voice);
      let style = voiceStyle(o);
      if (style === 'system' && !ttsAvailable()) style = 'natural';
      h.style = style;
      let tail = 0.35;
      k.bag = h.nodes;
      try {
        const busName = o.radio ? 'radio' : 'voice';
        const T = dur + 0.6;
        const inG = gain(k, clamp(num(o.vol, 1), 0, 4));
        let node = inG;
        if (style === 'natural') {
          naturalVoice(E, h, inG, t0, text, speakerId, vp, dur, o);
          tail = Math.max(tail, h.nvTail || 0);
        } else if (style === 'system') {
          // the words come from speechSynthesis; here only the channel's own sound, quietly
          const silent = gain(k, 0);
          const bedG = gain(k, 0.6);
          const envG = gain(k, 0);
          env(envG.gain, t0 - 0.04, [[0, 0], [0.04, 1], [dur + 0.04, 1], [dur + 0.25, 0]]);
          if (o.radio) {
            const r = gain(k, 1);
            h.radio = radioChain(k, silent, r, t0 - 0.04, T, num(o.clarity, 1));
            if (o.squelch) {
              SFX.radio_click(k, r, t0 - 0.1, {});
              const te = Math.max(0.2, dur - 0.12);
              const sg = gain(k, 0); perc(sg.gain, t0 + te + 0.02, 0.28, 0.003, 0.25);
              chain(noise(k, 'white', t0 + te, 0.4), filt(k, 'highpass', 400, 0.7), filt(k, 'lowpass', 3600, 0.7), sg, r);
            }
            chain(r, envG, bedG, inG);
          } else if (o.phone) {
            const r = gain(k, 1);
            phoneChain(k, silent, r, t0 - 0.04, T);
            chain(r, envG, bedG, inG);
          } else if (o.tape) {
            const r = gain(k, 1);
            tapeChain(k, silent, r, t0 - 0.04, T);
            chain(r, envG, bedG, inG);
          }
        } else {
          const plan = planSpeech(text, vp, dur);
          const syn = gain(k, 1);
          synthSpeech(k, syn, t0, plan, vp, {});
          if (!o.radio && !o.phone && Math.random() < 0.35) click(k, syn, t0 + 0.01, 2200, 0.03, 0.01); // lip smack
          // envelope for colouring beds so they open and close with the line
          const envG = gain(k, 0);
          env(envG.gain, t0 - 0.04, [[0, 0], [0.04, 1], [dur + 0.04, 1], [dur + 0.25, 0]]);
          syn.connect(inG);
          if (o.radio) {
            const r = gain(k, 1);
            h.radio = radioChain(k, inG, r, t0 - 0.04, T, num(o.clarity, 1));
            node = r;
            if (o.squelch) {
              SFX.radio_click(k, r, t0 - 0.1, {});
              const sg = gain(k, 0); perc(sg.gain, t0 + plan.end + 0.02, 0.28, 0.003, 0.25);
              chain(noise(k, 'white', t0 + plan.end, 0.4), filt(k, 'highpass', 400, 0.7), filt(k, 'lowpass', 3600, 0.7), sg, r);
            }
          } else if (o.phone) {
            const r = gain(k, 1);
            phoneChain(k, inG, r, t0 - 0.04, T);
            node = r;
          } else if (o.tape) {
            const r = gain(k, 1);
            tapeChain(k, inG, r, t0 - 0.04, T);
            node = r;
          }
          node = chain(node, envG);
        }
        const lp = filt(k, 'lowpass', 20000, 0.5), pg = gain(k, 1), pn = panner(k, num(o.pan, 0));
        chain(node, lp, pg, pn, E.bus[busName]);
        h.sendBase = num(o.send, o.radio || o.phone ? 0.08 : SEND.voice);
        const send = gain(k, h.sendBase);
        pn.connect(send); send.connect(E.revIn);
        Object.assign(h, { inG, lp, pg, pn, send, bus: busName });
        if (o.x != null && o.y != null && isFinite(o.x) && isFinite(o.y)) {
          h.pos = { x: +o.x, y: +o.y, map: o.map != null ? o.map : E.L.map };
          E.updatePos(h, t0, true);
        }
      } finally { k.bag = null; }
      h.end = Math.max(isFinite(h.end) ? h.end : 0, t0 + dur + tail);
      h.ended = new Promise((res) => { h.resolve = res; });
      E.voices.push(h);
      if (style === 'system') h.tts = ttsSpeak(text, vp, o, dur, speakerId, h);
      const api = h.api;
      return { dur, stop: api.stop, setClarity: api.setClarity, setVol: api.setVol, set: api.set, ended: h.ended, get playing() { return api.playing; }, speaker: speakerId, style };
    };

    /* ---- mix controls */
    E.setVolume = (v) => approach(E.master.gain, clamp(num(v, 0.8), 0, 1), E.now(), 0.05);
    E.duckAmt = 0; E.duckUntil = 0;
    E.duck = (amount, secs) => {
      const now = E.now();
      amount = clamp(num(amount, 0.5), 0, 1);
      secs = Math.max(0.05, num(secs, 1));
      if (E.duckUntil > now) amount = Math.max(amount, E.duckAmt);
      E.duckAmt = amount;
      E.duckUntil = Math.max(now + secs, E.duckUntil > now ? E.duckUntil : 0);
      approach(E.duckG.gain, 1 - amount, now, 0.04);
      E.duckG.gain.setTargetAtTime(1, E.duckUntil, 0.3);
    };
    E.silence = (secs, o) => {
      o = o || {};
      const now = E.now();
      const p = E.silenceG.gain;
      try {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
        p.linearRampToValueAtTime(0, now + 0.004);
        if (secs != null && isFinite(secs) && secs > 0) {
          p.setValueAtTime(0, now + secs);
          p.linearRampToValueAtTime(1, now + secs + Math.max(0.01, num(o.fade, 1.5)));
        }
      } catch (e) { p.value = 0; }
      for (const h of E.voices) if (h.tts) ttsCancel(h);
    };
    E.unsilence = (fade) => {
      const now = E.now(), p = E.silenceG.gain;
      try {
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
        p.linearRampToValueAtTime(1, now + Math.max(0.01, num(fade, 1)));
      } catch (e) { p.value = 1; }
    };
    E.stopAll = (fade) => {
      for (const arr of [E.shots, E.loops, E.voices]) for (const h of arr) h.api.stop(fade);
    };

    /* ---- the scheduler: call often (every frame) */
    E.pump = (now, until) => {
      now = now == null ? ctx.currentTime : now;
      until = until == null ? now + LOOKAHEAD : until;
      E.amb.pump(now, until);
      E.breathPump(now, until);
      for (const h of E.loops) if (h.rep && !h.stopped) pumpRepeater(h, now, until);
      if (now - E.lastPos > 0.03) {
        E.lastPos = now;
        for (const arr of [E.shots, E.loops, E.voices]) for (const h of arr) if (h.pos && !h.stopped && h.end > now) E.updatePos(h, now, false);
      }
      // cleanup
      for (const arr of [E.shots, E.loops, E.voices]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const h = arr[i];
          if (h.end < now) {
            if (h.rep) for (const inst of h.rep.insts) dispose(inst.nodes);
            dispose(h.nodes);
            h.done = true;
            arr.splice(i, 1);
            if (h.resolve) h.resolve(true);
          }
        }
      }
      for (let i = E.spawned.length - 1; i >= 0; i--) if (E.spawned[i].end < now) { dispose(E.spawned[i].nodes); E.spawned.splice(i, 1); }
      for (let i = E.later.length - 1; i >= 0; i--) if (E.later[i].t <= now) { const l = E.later.splice(i, 1)[0]; try { l.fn(); } catch (e) { warnOnce('later', e); } }
      const S = E.stat;
      if (S.nodes && S.level <= 0 && now - S.last > 4) { dispose(S.nodes); S.nodes = null; }
    };

    E.amb = makeAmbience(E);
    return E;
  }

  /* ================================================================ TTS
   * The 'system' voice style: the browser's speechSynthesis reads the real words. Voices are
   * ranked (Natural / Neural / Online / Google / Premium / Enhanced first, English, then gender by
   * name), and each speaker keeps one stable voice ("you_*" and "phone" share one). Pitch and rate
   * follow the speaker modestly and the rate is nudged so the line fits its subtitle time.
   */
  let ttsVoices = null;
  const TTS_GOOD = /natural|neural|online|google|premium|enhanced|wavenet|siri/i;
  const TTS_FEM = /female|woman|\b(aria|jenny|michelle|ana|emma|sonia|libby|natasha|clara|zira|susan|samantha|karen|victoria|fiona|moira|tessa|hazel|serena|allison|ava|kate|joanna|salli|kimberly|ivy|kendra|nicole|amy|olivia|ruth|emily|elizabeth|linda|heather|catherine|nora|zoe|ashley|cora|elsa|kathy|monica|paulina|veena|jenna|nancy|sara|jane|amber|maisie|mia|ellie|abbi|bella|hollie|google us english)\b/i;
  const TTS_MAL = /\bmale\b|\bman\b|\b(guy|davis|tony|jason|christopher|eric|roger|steffan|ryan|thomas|william|brian|andrew|david|mark|daniel|alex|fred|george|james|tom|matthew|joey|justin|kevin|russell|aaron|arthur|evan|nathan|oliver|gordon|lee|rishi|reed|ralph|bruce|junior|albert|brandon|jacob|liam|noah|ethan|alfie|elliot)\b/i;
  function ttsList() {
    try {
      const ss = typeof window !== 'undefined' && window.speechSynthesis;
      if (!ss) return [];
      if (!ttsVoices || !ttsVoices.length) {
        ttsVoices = ss.getVoices().filter((v) => /^en/i.test(v.lang)).map((v) => {
          const n = v.name || '';
          const g = TTS_FEM.test(n) && !/\bmale\b/i.test(n.replace(/female/ig, '')) ? 'f' : TTS_MAL.test(n) ? 'm' : '?';
          const score = (TTS_GOOD.test(n) ? 10 : 0) + (/natural|neural/i.test(n) ? 4 : 0) + (/^en[-_]us/i.test(v.lang) ? 2 : /^en[-_](gb|au|ca|ie)/i.test(v.lang) ? 1 : 0) +
            (v.localService === false ? 1 : 0) + (/compact|espeak|robot|zarvox|trinoids|whisper|bad news|bells|boing|bubbles|cellos|pipe|jester|organ|superstar|wobble|albert|novelty/i.test(n) ? -20 : 0);
          return { v, name: n, g, score };
        });
      }
      return ttsVoices;
    } catch (e) { return []; }
  }
  function ttsAvailable() {
    try { return typeof window !== 'undefined' && !!window.speechSynthesis && !!window.SpeechSynthesisUtterance && ttsList().length > 0; } catch (e) { return false; }
  }
  /** The most natural voice of the speaker's gender; stable per speaker (family). */
  function ttsPick(g, speakerId) {
    const all = ttsList();
    if (!all.length) return null;
    const want = g === 'f' || g === 'c' ? 'f' : 'm';
    let pool = all.filter((x) => x.g === want);
    if (!pool.length) pool = all.filter((x) => x.g === '?');
    if (!pool.length) pool = all;
    const best = Math.max(...pool.map((x) => x.score));
    const tier = pool.filter((x) => x.score >= best - 1).sort((a, b) => (a.name < b.name ? -1 : 1));
    const fam = /^you|^phone$/.test(String(speakerId || '')) ? 'you' : String(speakerId || '');
    return tier[hashStr('tts:' + fam) % tier.length].v;
  }
  const ttsQueue = [];
  function ttsSpeak(text, vp, o, dur, speakerId, h) {
    try {
      const ss = window.speechSynthesis;
      if (!ss || !window.SpeechSynthesisUtterance) return null;
      const clean = String(text).replace(/\[[^\]]*\]|\*[^*]*\*/g, ' ').replace(/[—–]/g, ', ').replace(/\s+/g, ' ').trim();
      if (!clean || !/[a-z0-9]/i.test(clean)) return null;
      const u = new SpeechSynthesisUtterance(clean);
      const d = VDEF[vp.gender] || VDEF.m;
      const rel = vp.pitch / d.pitch;
      let pitch = 1 + (rel - 1) * 0.8;
      if (vp.gender === 'c') pitch *= 1.25;
      if (vp.gender === 'n') pitch *= 0.85;
      if (vp.age > 60) pitch *= 0.95;
      if (vp.synthetic) pitch = vp.rasp >= 0.3 ? 0.5 : 0.9;
      u.pitch = clamp(pitch, 0.4, 1.6);
      // modest rate from the speaker, nudged up only as far as the subtitle's time needs
      const words = clean.split(/\s+/).length;
      const need = words / (2.7 * Math.max(0.6, dur * 0.92));
      u.rate = clamp(Math.max(clamp(0.92 + (vp.rate - 1) * 0.6, 0.75, 1.2), need), 0.6, 1.7);
      const vol = settingsVolume(); // volume 0 must stay silent
      u.volume = clamp(num(o.vol, 1) * vol * (o.radio ? 0.45 + 0.55 * num(o.clarity, 1) : 1), 0, 1);
      const v = ttsPick(vp.gender, speakerId);
      if (v) { u.voice = v; u.lang = v.lang; }
      const q = { u, h, started: false, done: false };
      u.onstart = () => { q.started = true; };
      u.onend = u.onerror = () => { q.done = true; const i = ttsQueue.indexOf(q); if (i >= 0) ttsQueue.splice(i, 1); };
      ttsQueue.push(q);
      ss.speak(u);
      return u;
    } catch (e) { warnOnce('tts', e); return null; }
  }
  /** Stop one handle's speech; utterances of other handles still waiting are queued again. */
  function ttsCancel(h) {
    try {
      const ss = window.speechSynthesis;
      if (ss && h && h.tts) {
        const mine = ttsQueue.filter((q) => q.h === h);
        const others = ttsQueue.filter((q) => q.h !== h && !q.done);
        if (mine.some((q) => !q.done)) {
          ttsQueue.length = 0;
          ss.cancel();
          for (const q of others) if (!q.started && q.h && !q.h.stopped) { ttsQueue.push(q); try { ss.speak(q.u); } catch (e) { /* ignore */ } }
        }
      }
    } catch (e) { /* ignore */ }
    if (h) h.tts = null;
  }
  function ttsCancelAll() {
    ttsQueue.length = 0;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        ttsVoices = null;
        try { if (DA.bus && DA.bus.emit) DA.bus.emit('audio:voices', { available: ttsAvailable(), count: ttsList().length }); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  /* ============================================================== AMBIENCE
   * Layers are built lazily the first time their level rises above zero and torn down after
   * ~6 s of silence, so an unused generator or drone costs nothing. Level changes glide with
   * setTargetAtTime (crossfades); stochastic events (gusts, drips, thunder, birds, heartbeat,
   * generator misfires, building settling) are scheduled ahead by pump().
   */
  const BIRD_SPECIES = ['warbler', 'whistle', 'trill', 'robin', 'warbler', 'trill'];
  function birdPhrase(k, out, t, sp, pan, dist) {
    const pn = panner(k, pan);
    const lp = filt(k, 'lowpass', lerp(12000, 3200, dist), 0.7);
    const g = gain(k, lerp(0.45, 0.09, dist));
    chain(lp, g, pn, out);
    const o = osc(k, 'sine', 3000, t, 3);
    const eg = gain(k, 0);
    chain(o, eg, lp);
    const fm = osc(k, 'sine', rnd(28, 60), t, 3);
    const fmg = gain(k, 0);
    chain(fm, fmg, o.frequency);
    const F = o.frequency, A = eg.gain;
    A.setValueAtTime(0, t);
    let tt = t;
    const note = (f0, f1, nd, amp) => {
      F.setValueAtTime(f0, tt); F.linearRampToValueAtTime(f1, tt + nd);
      A.setValueAtTime(0, tt); A.linearRampToValueAtTime(amp, tt + Math.min(0.012, nd * 0.3));
      A.linearRampToValueAtTime(amp * 0.7, tt + nd * 0.7); A.linearRampToValueAtTime(0, tt + nd);
      tt += nd;
    };
    if (sp === 'whistle') {
      const b = rnd(0.9, 1.1);
      note(3950 * b, 3880 * b, 0.34, 0.8); tt += 0.07; note(3350 * b, 3300 * b, 0.3, 0.7);
    } else if (sp === 'trill') {
      const n = 10 + Math.floor(Math.random() * 9), f = rnd(4600, 5600);
      for (let i = 0; i < n; i++) { note(f, f * 0.72, 0.032, 0.6 * (1 - i / n * 0.4)); tt += 0.03; }
    } else if (sp === 'robin') {
      fmg.gain.setValueAtTime(150, t);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { const f = rnd(2200, 3000); note(f, f * rnd(0.85, 1.2), rnd(0.15, 0.24), 0.7); tt += rnd(0.08, 0.14); }
    } else {
      fmg.gain.setValueAtTime(rnd(0, 60), t);
      const n = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) { const f = rnd(2800, 4800); note(f, f * rnd(0.75, 1.3), rnd(0.05, 0.11), rnd(0.5, 0.9)); tt += rnd(0.02, 0.06); }
    }
    return tt - t + 0.1;
  }

  function makeAmbience(E) {
    const k = E.k;
    const P = { rain: 0, indoor: false, hum: 0, generator: 'off', genDist: 0.15, wind: 0, thunder: 0, drone: 0,
      birds: false, daylight: false, heartbeat: 0, room: 'small', settle: 0.35, window: 0.5 };
    const L = {};
    const next = { drip: 0, gust: 0, bird: 0, thunder: 0, heart: 0, settle: 0, gen: 0 };
    const A = { P, L, touched: false };

    function build(name, now) {
      if (L[name]) return L[name];
      const ly = { nodes: [], target: 0, idle: null };
      k.bag = ly.nodes;
      try { BUILD[name](ly, now); } finally { k.bag = null; }
      L[name] = ly;
      return ly;
    }
    function kill(name) {
      const ly = L[name];
      if (!ly) return;
      if (ly.subs) for (const w in ly.subs) dispose(ly.subs[w].nodes);
      dispose(ly.nodes);
      delete L[name];
    }
    /** Rain submixes: outdoors (hiss, ground body, droplets) or indoors (roof drumming, glass). */
    const RAIN_SUB = {
      outdoor(sub, t) {
        chain(noise(k, 'pink2', t, LONG), filt(k, 'highpass', 380, 0.6), filt(k, 'peaking', 4200, 0.8, 4), gain(k, 0.95), sub.g);
        chain(noise(k, 'brown2', t, LONG), filt(k, 'lowpass', 260, 0.6), gain(k, 0.55), sub.g);
        chain(noise(k, 'crackle2', t, LONG), filt(k, 'highpass', 1800, 0.7), gain(k, 1.5), sub.g);
        chain(noise(k, 'crackle', t, LONG), filt(k, 'bandpass', 900, 0.8), gain(k, 1.1), sub.g);
      },
      indoor(sub, t) {
        const pk = noise(k, 'pink2', t, LONG);
        chain(pk, filt(k, 'lowpass', 620, 0.7), filt(k, 'lowpass', 620, 0.7), gain(k, 1.3), sub.g);
        sub.win = gain(k, 0);
        chain(pk, filt(k, 'bandpass', 2400, 0.9), sub.win, sub.g);
        const cr = noise(k, 'crackle', t, LONG);
        chain(cr, filt(k, 'lowpass', 1100, 0.7), gain(k, 1.3), sub.g);
        chain(cr, filt(k, 'bandpass', 3000, 0.9), gain(k, 0.7), sub.win);
      },
    };
    function rainSub(ly, which, now) {
      if (ly.subs[which]) return ly.subs[which];
      const sub = { nodes: [], idle: null };
      k.bag = sub.nodes;
      try { sub.g = gain(k, 0); sub.g.connect(ly.mod); RAIN_SUB[which](sub, now); } finally { k.bag = null; }
      return (ly.subs[which] = sub);
    }
    const sendTo = (node, amt) => { const s = gain(k, amt); node.connect(s); s.connect(E.revIn); };

    const BUILD = {
      rain(ly, t) {
        // common output; the outdoor/indoor submixes are built on demand (see rainSub)
        ly.out = gain(k, 0);
        ly.mod = gain(k, 1);
        chain(ctrl(k, t, LONG, 0.07), gain(k, 0.16), ly.mod.gain);
        chain(ly.mod, ly.out, E.bus.amb);
        sendTo(ly.out, 0.08);
        ly.subs = {};
        ly.drips = gain(k, 1);
        chain(ly.drips, filt(k, 'lowpass', 5000, 0.7), ly.out);
      },
      wind(ly, t) {
        ly.out = gain(k, 0); ly.gust = gain(k, 0.6);
        // body: two fixed band-passes crossfaded by a slow random signal — a wandering resonance
        // without per-sample filter maths
        const pk = noise(k, 'pink2', t, LONG);
        const m = ctrl(k, t, LONG, 0.04);
        const a = gain(k, 0.5), b = gain(k, 0.5);
        chain(m, gain(k, 0.55), a.gain); chain(m, gain(k, -0.55), b.gain);
        const body = gain(k, 1.3);
        chain(pk, filt(k, 'bandpass', 330, 0.7), a, body);
        chain(pk, filt(k, 'bandpass', 640, 0.7), b, body);
        ly.bodyLP = filt(k, 'lowpass', 6000, 0.6);
        chain(body, ly.bodyLP, ly.gust);
        // the guy-wires of the antenna mast singing: two narrow bands, crossfaded
        const pm = noise(k, 'pink', t, LONG);
        const m2 = ctrl(k, t, LONG, 0.03);
        const w1 = gain(k, 0.5), w2 = gain(k, 0.5);
        chain(m2, gain(k, 0.6), w1.gain); chain(m2, gain(k, -0.6), w2.gain);
        ly.whG = gain(k, 0);
        chain(pm, filt(k, 'bandpass', 880, 22), w1, ly.whG);
        chain(pm, filt(k, 'bandpass', 1070, 22), w2, ly.whG);
        chain(ly.whG, gain(k, 3.5), ly.gust);
        // indoors: a low moan through the building
        ly.moanG = gain(k, 0);
        const mo = gain(k, 1);
        chain(ctrl(k, t, LONG, 0.05), gain(k, 0.4), mo.gain);
        chain(noise(k, 'brown', t, LONG), filt(k, 'bandpass', 240, 5), gain(k, 2.2), mo, ly.moanG, ly.gust);
        chain(ly.gust, ly.out, E.bus.amb);
      },
      hum(ly, t) {
        ly.out = gain(k, 0);
        chain(osc(k, wave(k, 'hum'), 60, t, LONG), gain(k, 0.5), ly.out);
        const bz = gain(k, 0.1);
        chain(ctrl(k, t, LONG, 3), gain(k, 0.07), bz.gain);
        chain(osc(k, 'sawtooth', 120, t, LONG), filt(k, 'highpass', 1600, 0.7), filt(k, 'bandpass', 3100, 1.1), bz, ly.out);
        chain(noise(k, 'white', t, LONG), filt(k, 'bandpass', 7200, 1.5), gain(k, 0.03), ly.out);
        ly.out.connect(E.bus.amb);
      },
      gen(ly, t) {
        ly.e = engineGraph(k, t, { fire: 28, diesel: true }, LONG);
        ly.stut = gain(k, 1);
        ly.lp = filt(k, 'lowpass', 2400, 0.7);
        ly.out = gain(k, 0);
        chain(ly.e.out, ly.stut, ly.lp, ly.out, E.bus.amb);
        chain(osc(k, 'sine', 380, t, LONG), gain(k, 0.012), ly.stut);
        sendTo(ly.out, 0.22);
        ly.mode = 'off';
        ly.e.setRate(0.3, t);
      },
      drone(ly, t) {
        ly.out = gain(k, 0);
        const mix = gain(k, 1);
        for (const [f, type, a] of [[41.2, 'sine', 0.5], [41.55, 'sine', 0.45], [61.7, 'triangle', 0.3], [62.3, 'triangle', 0.28], [87.3, 'sine', 0.22], [88.05, 'sine', 0.2], [123.2, 'triangle', 0.06]]) {
          chain(osc(k, type, f, t, LONG), gain(k, a), mix);
        }
        const sw = gain(k, 0.75);
        chain(ctrl(k, t, LONG, 0.05), gain(k, 0.3), sw.gain);
        chain(mix, filt(k, 'lowpass', 380, 0.7), sw, ly.out, E.bus.amb);
        ly.hi = gain(k, 0);
        const pk = noise(k, 'pink', t, LONG), hm = ctrl(k, t, LONG, 0.02);
        const h1 = gain(k, 0.5), h2 = gain(k, 0.5);
        chain(hm, gain(k, 0.6), h1.gain); chain(hm, gain(k, -0.6), h2.gain);
        const hx = gain(k, 2);
        chain(pk, filt(k, 'bandpass', 900, 6), h1, hx);
        chain(pk, filt(k, 'bandpass', 1900, 6), h2, hx);
        chain(hx, ly.hi, ly.out);
        sendTo(ly.out, 0.3);
      },
      birds(ly) {
        ly.out = gain(k, 0);
        ly.lp = filt(k, 'lowpass', 14000, 0.7);
        chain(ly.out, ly.lp, E.bus.amb);
        sendTo(ly.out, 0.25);
      },
      heart(ly) { ly.out = gain(k, 0); ly.out.connect(E.bus.amb); },
      air(ly, t) {
        ly.out = gain(k, 0);
        chain(noise(k, 'pink', t, LONG), filt(k, 'lowpass', 700, 0.7), filt(k, 'highpass', 60, 0.7), ly.out, E.bus.amb);
      },
      events(ly) { ly.out = gain(k, 1); ly.out.connect(E.bus.amb); sendTo(ly.out, 0.3); },
    };

    function setLayer(name, target, now, tc) {
      if (target <= 0.0001 && !L[name]) return null;
      const ly = build(name, now);
      ly.target = target;
      if (ly.out) approach(ly.out.gain, target, now, tc == null ? 0.6 : tc);
      return ly;
    }

    function apply(now) {
      A.touched = true;
      E.setRoom(P.room, now);
      const ind = !!P.indoor;
      // rain
      const rl = P.rain > 0.001 ? Math.pow(P.rain, 0.8) : 0;
      const r = setLayer('rain', rl, now, 0.8);
      if (r) {
        const cur = rainSub(r, ind ? 'indoor' : 'outdoor', now);
        cur.idle = null;
        approach(cur.g.gain, ind ? 0.22 : 0.32, now, 0.35);
        if (cur.win) approach(cur.win.gain, 0.25 * clamp(P.window, 0, 1), now, 0.35);
        const old = r.subs[ind ? 'outdoor' : 'indoor'];
        if (old) { approach(old.g.gain, 0, now, 0.35); if (old.idle == null) old.idle = now; }
      }
      // wind
      const wl = P.wind > 0.001 ? Math.pow(P.wind, 0.9) * (ind ? 0.28 : 0.76) : 0;
      const w = setLayer('wind', wl, now, 0.7);
      if (w) {
        approach(w.bodyLP.frequency, ind ? 700 : 6000, now, 0.35);
        approach(w.whG.gain, ind ? 0.08 : 1, now, 0.35);
        approach(w.moanG.gain, ind ? 1 : 0.3, now, 0.35);
      }
      // fluorescent / mains hum
      setLayer('hum', clamp(P.hum, 0, 1) * 0.075, now, 0.25);
      // generator — genDist is PROXIMITY (1 = standing next to it, ~0.15 upstairs through the
      // floor, 0 = out of earshot), the convention world.js uses
      const gd = 1 - clamp(P.genDist, 0, 1);
      const mode = P.generator === 'on' || P.generator === 'stutter' ? P.generator : 'off';
      const gl = mode === 'off' ? 0 : lerp(0.7, 0.012, Math.pow(gd, 0.8));
      if (mode !== 'off' || L.gen) {
        const g = build('gen', now);
        approach(g.lp.frequency, lerp(2400, 160, Math.pow(gd, 0.7)), now, 0.3);
        if (mode !== g.mode) {
          if (mode === 'off') {
            // spin down
            g.e.rampRate(0.12, now, 2.6, true);
            fadeOut(g.out.gain, now, 2.6);
            approach(g.stut.gain, 1, now, 0.05);
            g.target = 0;
          } else {
            if (g.mode === 'off') { g.e.rampRate(1, now, 1.6, false); rampTo(g.out.gain, gl, now, 1.2); }
            else { g.e.rampRate(1, now, 0.15, false); approach(g.out.gain, gl, now, 0.3); }
            approach(g.stut.gain, 1, now, 0.05);
            next.gen = now + rnd(0.6, 1.4);
            g.target = gl;
          }
          g.mode = mode;
        } else if (mode !== 'off') { approach(g.out.gain, gl, now, 0.4); g.target = gl; }
      }
      // unease drone
      const d = setLayer('drone', P.drone > 0.001 ? Math.pow(P.drone, 1.2) * 0.165 : 0, now, 1.2);
      if (d) approach(d.hi.gain, lerp(0, 0.25, clamp((P.drone - 0.4) / 0.6, 0, 1)), now, 1);
      // birds
      const b = setLayer('birds', P.birds ? (P.daylight ? 1 : 0.7) : 0, now, 1.5);
      if (b) approach(b.lp.frequency, ind ? 1700 : 14000, now, 0.3);
      // heartbeat (bus level; beats are scheduled)
      setLayer('heart', P.heartbeat > 0.01 ? 0.3 + 0.7 * clamp(P.heartbeat, 0, 1) : 0, now, 0.4);
      // room tone
      setLayer('air', ind ? 0.015 : 0.008, now, 0.5);
      build('events', now).target = 1;
    }

    A.set = (p, now) => {
      if (!p || typeof p !== 'object') return;
      for (const key in p) {
        const v = p[key];
        if (v === undefined) continue;
        if (key === 'generator') P.generator = v === true ? 'on' : v === false || v == null ? 'off' : String(v);
        else if (key === 'indoor' || key === 'birds' || key === 'daylight') P[key] = !!v;
        else if (key === 'room') P.room = ROOMS[v] ? v : P.room;
        else if (typeof v === 'number' && isFinite(v)) P[key] = clamp(v, 0, key === 'thunder' ? 1 : 2);
        else P[key] = v;
      }
      apply(now);
    };

    A.pump = (now, until) => {
      if (!A.touched) return;
      const ind = !!P.indoor;
      // window drips while it rains (indoors)
      const r = L.rain;
      if (r && ind && P.rain > 0.15) {
        if (next.drip < now) next.drip = now + rnd(0.2, 1.5);
        while (next.drip < until) {
          const t = next.drip, v = rnd(0.12, 0.35), pn = rnd(-0.8, 0.8);
          E.spawn(t, r.drips, (kk, out, tt) => { const p = panner(kk, pn); const g = gain(kk, v); chain(g, p, out); return SFX.drip(kk, g, tt, { P: rnd(0.8, 1.3) }); });
          next.drip += rnd(0.8, 4) / P.rain;
        }
      }
      // wind gusts
      const w = L.wind;
      if (w && P.wind > 0.05) {
        if (next.gust < now) next.gust = now + rnd(1, 5);
        while (next.gust < until) {
          const t = next.gust, up = rnd(1, 2), down = rnd(2, 4), peak = 0.6 + rnd(0.4, 0.9) * P.wind;
          const g = w.gust.gain;
          g.setValueAtTime(0.6, t); g.linearRampToValueAtTime(peak, t + up); g.linearRampToValueAtTime(0.6, t + up + down);
          next.gust = t + up + down + rnd(2, 12);
        }
      }
      // distant thunder
      if (P.thunder > 0.01) {
        if (next.thunder < now) next.thunder = now + rnd(4, 14);
        while (next.thunder < until) {
          const t = next.thunder, dist = rnd(0.55, 1);
          // background rumbles sit well under lightning-triggered thunder (play('thunder'))
          E.spawn(t, L.events.out, (kk, out, tt) => { const g = gain(kk, 0.4); g.connect(out); return SFX.thunder(kk, g, tt, { dist, indoor: ind }); });
          next.thunder += rnd(15, 45) / (0.25 + P.thunder);
        }
      }
      // birds
      const b = L.birds;
      if (b && P.birds) {
        if (next.bird < now) next.bird = now + rnd(0.2, 1.5);
        while (next.bird < until) {
          const t = next.bird, sp = pick(BIRD_SPECIES), pan = rnd(-0.9, 0.9), dist = rnd(0.1, 1);
          E.spawn(t, b.out, (kk, out, tt) => birdPhrase(kk, out, tt, sp, pan, dist));
          next.bird += rnd(0.4, 3.2) / (P.daylight ? 1.6 : 1);
        }
      }
      // heartbeat
      const h = L.heart;
      if (h && P.heartbeat > 0.01) {
        if (next.heart < now) next.heart = now + 0.05;
        const bpm = lerp(62, 128, clamp(P.heartbeat, 0, 1));
        while (next.heart < until) {
          const t = next.heart;
          E.spawn(t, h.out, (kk, out, tt) => SFX.heartbeat(kk, out, tt, { bpm }));
          next.heart += 60 / bpm;
        }
      }
      // generator misfires: rrrrrr—rr—rrrr
      const g = L.gen;
      if (g && g.mode === 'stutter') {
        if (next.gen < now) next.gen = now + 0.3;
        while (next.gen < until) {
          const t = next.gen, gap = rnd(0.12, 0.34);
          const S = g.stut.gain;
          S.setValueAtTime(1, t); S.linearRampToValueAtTime(0.1, t + 0.04);
          S.setValueAtTime(0.1, t + gap); S.linearRampToValueAtTime(1.12, t + gap + 0.05); S.linearRampToValueAtTime(1, t + gap + 0.3);
          g.e.sag(t, gap);
          const dbl = Math.random() < 0.32;
          next.gen = t + gap + (dbl ? rnd(0.42, 0.6) : rnd(0.6, 2.2));
        }
      }
      // the building settling: distant creaks, pipe ticks
      if (ind && P.settle > 0.01) {
        if (next.settle < now) next.settle = now + rnd(6, 20);
        while (next.settle < until) {
          const t = next.settle, kind = Math.random(), pn = rnd(-0.8, 0.8), v = rnd(0.1, 0.22);
          E.spawn(t, L.events.out, (kk, out, tt) => {
            const p = panner(kk, pn), lp = filt(kk, 'lowpass', 1400, 0.7), gg = gain(kk, v);
            chain(gg, lp, p, out);
            if (kind < 0.45) return SFX.creak(kk, gg, tt, { P: rnd(0.7, 1) });
            if (kind < 0.8) { modal(kk, gg, tt, [[rnd(1800, 2600), 0.1, 0.25], [rnd(3800, 4600), 0.06, 0.12]]); click(kk, gg, tt, 3000, 0.1); return 0.3; }
            return SFX.pipe_groan(kk, gg, tt, { P: rnd(0.8, 1.2) });
          });
          next.settle += rnd(12, 40) / P.settle;
        }
      }
      // retire the inactive rain submix once it has faded out
      if (r) for (const w in r.subs) { const sub = r.subs[w]; if (sub.idle != null && now - sub.idle > 3) { dispose(sub.nodes); delete r.subs[w]; } }
      // retire silent layers
      for (const name in L) {
        const ly = L[name];
        if (name === 'events') continue;
        if (ly.target <= 0.0001 && !(name === 'gen' && ly.mode !== 'off')) {
          if (ly.idle == null) ly.idle = now;
          else if (now - ly.idle > 6) kill(name);
        } else ly.idle = null;
      }
    };
    return A;
  }

  /* ============================================================ PUBLIC API */
  /** PLAN §7.6 — the names other modules may rely on. */
  const PLAN_NAMES = ('footstep footstep_other creak door_open door_close door_locked door_unlock door_creak door_heavy knock ' +
    'knock3 window_knock chair_scrape glass_break shelf_fall phone_ring phone_pickup phone_hangup dial_tone breaker_trip ' +
    'breaker_reset switch flicker coffee_brew mug_set thunder static_burst radio_click tuning tape_insert tape_play tape_stop ' +
    'tape_eject beep alarm scan impact scream_distant breath breath_other heartbeat car_door car_start car_idle car_drive ' +
    'car_away engine_fail lever keypad keypad_ok keypad_bad paper pen generator_start generator_stop power_down power_up ' +
    'drip pipe_groan footsteps_upstairs bird_strike collapse_rumble whisper ringing branches vent_open ladder hatch wind_gust ' +
    'stinger_low stinger_high stinger_glitch').split(' ');

  let E = null;
  let pumpTimer = null;
  /** Settings remembered before init() and applied when the context exists. */
  const pend = { amb: {}, L: null, br: { level: 0, rate: 0.25 }, stat: null, volume: null };
  let prePhase = 0, preLast = null;
  /**
   * Automatic breathing from the player's movement (world.js does not drive it): exertion rises
   * while running, settles while walking, decays at rest; hiding makes it audible. Explicit
   * breath()/setPlayerBreath() calls take precedence for 5 s.
   */
  let explicitBreathAt = -1e9, exertion = 0;
  function autoBreath(dt) {
    if (!DA.running || DA.paused || !(dt > 0) || nowSec() - explicitBreathAt < 5) return;
    const pl = DA.world && DA.world.player;
    if (!pl) return;
    const moving = pl.running ? 1 : Math.min(0.4, (pl.noise || 0) * 0.8);
    const target = moving;
    const k = target > exertion ? 0.16 : 0.035; // quick to get winded, slow to recover
    exertion = clamp(exertion + (target - exertion) * Math.min(1, dt * k * 3), 0, 1);
    pend.br.rate = lerp(0.22, 0.75, exertion);
    pend.br.level = pl.hidden ? Math.max(0.14, exertion * 0.8) : Math.max(0, exertion - 0.3) * 0.9;
    if (E) { E.br.rate = pend.br.rate; E.br.level = pend.br.level; }
  }
  const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  function dummy(dur) {
    return { dur: dur || 0, playing: false, stop() {}, setVol() {}, setPos() {}, set() {}, setClarity() {} };
  }
  function safe(label, fn, fallback) {
    try { return fn(); } catch (e) { warnOnce(label, e); return typeof fallback === 'function' ? fallback() : fallback; }
  }
  const settingsVolume = () => clamp(num(DA.settings && DA.settings.volume, 0.8), 0, 1);
  function pumpNow() {
    if (!E) return;
    try { E.pump(); } catch (e) { warnOnce('pump', e); }
  }
  /**
   * Generate impulse responses and noise buffers in small idle slices after init, so the first
   * visit to a room (or the first rain) never stalls the main thread.
   */
  function prewarm(eng) {
    const jobs = [() => nvMain()] // the natural voice's tables (device lookups, fallback render, planInfo)
      .concat(['white', 'pink', 'brown', 'crackle', 'pink2', 'brown2', 'crackle2', 'white2',
        'ctrl3', 'ctrl8', 'ctrl20', 'ctrl60', 'ctrl150'].map((n) => () => buf(eng.k, n)))
      .concat(Object.keys(ROOMS).map((r) => () => impulse(eng.k, r)));
    const step = () => {
      if (E !== eng || !jobs.length) return;
      safe('prewarm', jobs.shift());
      setTimeout(step, 120);
    };
    setTimeout(step, 400);
  }
  /** Parse breath rate: ≤3 → Hz, >3 → breaths per minute. */
  const parseRate = (r) => (r > 3 ? r / 60 : r);

  const A = (DA.audio = {
    ready: false,
    ctx: null,
    engine: null,
    autoInit: true,
    PLAN_NAMES,

    /** Create the AudioContext. Call from a user gesture; safe to call repeatedly. */
    init() {
      if (E) {
        if (E.ctx.state === 'suspended' && !DA.paused) E.ctx.resume().catch(() => {});
        return true;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { warnOnce('Web Audio is not available'); return false; }
        let ctx;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
        const eng = createEngine(ctx, { realtime: true, volume: pend.volume != null ? pend.volume : settingsVolume() });
        E = eng;
        A.engine = eng; A.ctx = ctx; A.ready = true;
        const now = ctx.currentTime;
        if (Object.keys(pend.amb).length) E.amb.set(pend.amb, now);
        if (pend.L) Object.assign(E.L, pend.L);
        E.br.level = pend.br.level; E.br.rate = pend.br.rate;
        if (pend.stat) E.radioStatic(pend.stat[0], pend.stat[1]);
        if (DA.paused) ctx.suspend().catch(() => {});
        else if (ctx.state !== 'running') ctx.resume().catch(() => {});
        if (!pumpTimer) pumpTimer = setInterval(pumpNow, 80);
        prewarm(eng);
        if (voiceStyle({}) === 'natural' || voiceStyle({}) === 'system') {
          safe('voice worker', () => nvWorker());
          // your own scream, rendered off the main thread long before the drift act needs it
          setTimeout(() => safe('scream prefetch', () => screamPrefetch('you')), 6000);
        }
        pumpNow();
        if (DA.bus) DA.bus.emit('audio:ready', { sampleRate: ctx.sampleRate });
        return true;
      } catch (e) {
        warnOnce('init failed', e);
        E = null; A.ready = false; A.engine = null; A.ctx = null;
        return false;
      }
    },
    setVolume(v) {
      pend.volume = clamp(num(v, 0.8), 0, 1);
      safe('setVolume', () => E && E.setVolume(pend.volume));
    },
    play(name, opts) {
      return safe('play ' + name, () => (E && E.play(name, opts || {})) || dummy(), dummy);
    },
    loop(name, opts) {
      return safe('loop ' + name, () => (E && E.loop(name, opts || {})) || dummy(), dummy);
    },
    /** Is `name` (or an alias/fuzzy match of it) synthesizable? */
    has(name) {
      return safe('has', () => {
        name = String(name || '');
        if (SFX[name] || LOOPB[name] || ALIAS[name]) return true;
        const low = name.toLowerCase();
        return FUZZY.some(([re]) => re.test(low));
      }, false);
    },
    /** Raw nodes for modules that build their own Web Audio graphs (null before init). */
    get sfxBus() { return E ? E.bus.sfx : null; },
    get master() { return E ? E.master : null; },
    get out() { return E ? E.bus.sfx : null; },
    names() { return NAME_LIST.concat(Object.keys(LOOPB).filter((n) => !SFX[n])); },
    listener(x, y, angle, mapId) {
      if (!isFinite(x) || !isFinite(y)) return;
      const L = { x: +x, y: +y, angle: num(angle, 0), map: mapId != null ? mapId : null };
      pend.L = L;
      if (E) Object.assign(E.L, L);
    },
    ambience(params) {
      if (params === undefined) return safe('ambience', () => Object.assign({}, E ? E.amb.P : pend.amb), {});
      if (!params || typeof params !== 'object') return undefined;
      safe('ambience', () => {
        if (!E) Object.assign(pend.amb, params);
        else E.amb.set(params, E.now());
      });
      return undefined;
    },
    /**
     * Back to a neutral bed: every ambience parameter to its default (no rain, wind, hum,
     * generator, drone, thunder, heartbeat, birds; small dry room), then `over` merged on top —
     * e.g. resetAmbience({rain: 0.6, indoor: true, wind: 0.3}) for the title. Quit-to-title uses it
     * so nothing of the last scene (array drone, generator, thunder) survives under the menu.
     */
    resetAmbience(over) {
      const base = { rain: 0, indoor: false, hum: 0, generator: 'off', genDist: 0, wind: 0, thunder: 0, drone: 0,
        birds: false, daylight: false, heartbeat: 0, room: 'small', settle: 0.35, window: 0.5 };
      const p = Object.assign(base, over && typeof over === 'object' ? over : {});
      if (!E) { for (const k in pend.amb) delete pend.amb[k]; }
      A.ambience(p);
      return p;
    },
    radioStatic(level, opts) {
      if (!E) { pend.stat = [level, opts]; return; }
      safe('radioStatic', () => E.radioStatic(level, opts));
    },
    voice(text, speakerId, opts) {
      let t = String(text == null ? '' : text);
      if (/\{[A-Z]/.test(t) && DA.fmt) t = safe('fmt', () => DA.fmt(t), t);
      const dur = lineDur(t);
      const fallback = () => Object.assign(dummy(dur), { ended: Promise.resolve(false), speaker: speakerId });
      if (!E) return fallback();
      return safe('voice', () => E.voice(t, speakerId, opts || {}), fallback);
    },
    /** Player breathing: level 0..1 (loudness/heaviness), rate Hz (≤3) or breaths/min (>3). */
    setPlayerBreath(p, level) {
      if (typeof p === 'number') p = { rate: p, level: typeof level === 'number' ? level : undefined };
      if (!p) return;
      explicitBreathAt = nowSec();
      if (p.level != null && isFinite(p.level)) pend.br.level = clamp(+p.level, 0, 1);
      if (p.rate != null && isFinite(p.rate) && p.rate > 0) pend.br.rate = clamp(parseRate(+p.rate), 0.15, 1.2);
      if (E) { E.br.level = pend.br.level; E.br.rate = pend.br.rate; }
    },
    /**
     * Convenience: breath(x) with x in 0..1 = exertion (sets level and rate together: calm and
     * nearly silent at 0, gasping at 1); x > 1 = a rate (Hz up to 3, else breaths per minute).
     */
    breath(rate) {
      const r = num(rate, 0);
      if (r <= 1) A.setPlayerBreath({ level: clamp(r, 0, 1), rate: lerp(0.24, 0.8, clamp(r, 0, 1)) });
      else A.setPlayerBreath({ rate: r });
    },
    breathPhase() {
      return safe('breathPhase', () => {
        if (E) return E.breathPhase();
        const now = nowSec();
        if (preLast == null) preLast = now;
        prePhase = (prePhase + (now - preLast) * pend.br.rate) % 1;
        preLast = now;
        return prePhase;
      }, 0);
    },
    playerBreath() { return A.breathPhase(); },
    breathState() {
      const phase = A.breathPhase();
      return { phase, level: pend.br.level, rate: pend.br.rate, inhaling: phase < 0.4, exhaling: phase >= 0.4 && phase < 0.87 };
    },
    duck(amount, secs) { safe('duck', () => E && E.duck(amount, secs)); },
    silence(secs, opts) { safe('silence', () => E && E.silence(secs, opts)); },
    unsilence(fade) { safe('unsilence', () => E && E.unsilence(fade)); },
    stinger(kind) {
      const k = String(kind || 'low');
      return A.play(SFX['stinger_' + k] ? 'stinger_' + k : 'stinger_low', {});
    },
    stopAll(fade) { safe('stopAll', () => E && E.stopAll(fade)); },

    /* ------------------------------------------------ dev / test helpers */
    createEngine(ctx, cfg) { return createEngine(ctx, cfg); },
    /**
     * What voice() will do: {params, plan, dur, style}. plan has the classic shape (end, syl
     * [{t0, t1, v, stressed, word, f0}], f0 [[t, Hz]], voice [[t, 0..1]] …) for either engine;
     * the natural plan adds phones and the Fujisaki commands. style defaults to the setting.
     */
    voicePlan(text, speakerId, over, style) {
      const vp = voiceParams(speakerId, over);
      const d = lineDur(text);
      const st = voiceStyle({ style });
      if (st === 'classic') return { params: vp, plan: planSpeech(String(text || ''), vp, d), dur: d, style: 'classic' };
      return safe('voicePlan', () => ({ params: vp, plan: nvMain().planInfo(String(text || ''), nvPlainVp(vp), d), dur: d, style: 'natural' }),
        () => ({ params: vp, plan: planSpeech(String(text || ''), vp, d), dur: d, style: 'classic' }));
    },
    /** Current voice style: 'natural' (default), 'classic' (the old babble) or 'system' (speechSynthesis). */
    voiceStyle() { return voiceStyle({}); },
    voiceStyles: VOICE_STYLES.slice(),
    /** English speechSynthesis voices as ranked for the 'system' style: [{name, lang, gender, score}]. */
    systemVoices() { return ttsList().map((x) => ({ name: x.name, lang: x.v.lang, gender: x.g, score: x.score, local: x.v.localService })); },
    /**
     * true when the 'system' style can really speak: speechSynthesis exists and at least one English
     * voice is installed (headless / many Linux browsers have none — 'system' then falls back to
     * 'natural'). Voices load late in some browsers: listen for 'audio:voices' {available, count}.
     */
    systemVoicesAvailable() { return ttsAvailable(); },
    /** The voice the 'system' style gives a speaker (null when none is installed). */
    systemVoiceFor(speakerId) { const vp = voiceParams(speakerId); const v = ttsPick(vp.gender, speakerId); return v ? v.name : null; },
    /**
     * Natural engine, synchronous and without Web Audio (tests / dev pages):
     * → {sr, dur, sig, bed, bedGain, channel, band, clarity, lead, end, ms}. opts as voice().
     */
    renderNatural(text, speakerId, opts) {
      opts = opts || {};
      const t = String(text == null ? '' : text);
      const vp = voiceParams(speakerId, opts.voice);
      return nvMain().render(t, nvPlainVp(vp), nvOpts(t, speakerId, lineDur(t), opts, num(opts.clock, 0)));
    },
    voiceParams(speakerId, over) { return voiceParams(speakerId, over); },
    /** Render one sound offline. opts.loop renders a continuous loop builder for `secs`. */
    async renderSound(name, opts, secs) {
      try {
        opts = opts || {};
        secs = secs || 10;
        const sr = opts.sampleRate || 44100;
        const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sr * secs), sr);
        const k = kit(ctx);
        const r = resolveName(name);
        if (!r) return null;
        const out = ctx.createGain();
        out.gain.value = num(opts.vol, 1);
        out.connect(ctx.destination);
        k.bag = [];
        let dur;
        try {
          const n = norm(opts, null);
          if ((r === 'breath' || r === 'breath_other') && !n.cycle) n.cycle = 3.4;
          if (SFX[r] && !(opts.loop && LOOPB[r])) dur = SFX[r](k, out, 0.01, n);
          else { LOOPB[r](k, out, 0.01, n, secs); dur = secs - 0.02; }
        } finally { k.bag = null; }
        const buffer = await ctx.startRendering();
        return Object.assign({ name, resolved: r, buffer, dur }, bufStats(buffer));
      } catch (e) { warnOnce('renderSound ' + name, e); return null; }
    },
    /**
     * Render through a complete engine on an OfflineAudioContext. setup(E) may call E.play,
     * E.voice, E.amb.set … at time 0; everything is scheduled with pump() before rendering.
     * cfg.bare skips the compressor/limiter (raw levels).
     */
    async renderEngine(secs, setup, cfg) {
      try {
        cfg = cfg || {};
        const sr = cfg.sampleRate || 44100;
        const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sr * secs), sr);
        const eng = createEngine(ctx, { volume: num(cfg.volume, 1), bare: !!cfg.bare, room: cfg.room });
        const res = setup ? setup(eng) : null;
        eng.pump(0, secs);
        const t0 = nowSec();
        const buffer = await ctx.startRendering();
        return Object.assign({ buffer, renderSec: nowSec() - t0, result: res }, bufStats(buffer));
      } catch (e) { warnOnce('renderEngine', e); return null; }
    },
    renderAmbience(params, secs, cfg) {
      return A.renderEngine(secs || 8, (eng) => eng.amb.set(params || {}, 0), cfg);
    },
    renderVoice(text, speakerId, opts, cfg) {
      const dur = lineDur(text);
      return A.renderEngine(dur + 0.6, (eng) => eng.voice(String(text), speakerId, Object.assign({ delay: 0 }, opts || {})), Object.assign({ bare: true }, cfg || {}));
    },
    _internal: { SFX, LOOPB, REPEAT, planSpeech, voiceParams, syllabify, tokenize, resolveName, kit, VDEF, nvMain, voiceStyle, daNaturalVoice, nvWorkerState: () => ({ ready: NVW.ready, fail: NVW.fail, pending: NVW.jobs.size }) },
  });

  /** Peak / RMS / first & last audible sample of a rendered buffer. */
  function bufStats(b) {
    let peak = 0, sum = 0, first = -1, last = -1, n = b.length;
    const chs = [];
    for (let c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (const d of chs) { const v = Math.abs(d[i]); if (v > m) m = v; sum += d[i] * d[i]; }
      if (m > peak) peak = m;
      if (m > 0.003) { if (first < 0) first = i; last = i; }
    }
    const active = last > first ? last - first + 1 : n;
    let asum = 0;
    if (first >= 0) for (let i = first; i <= last; i++) for (const d of chs) asum += d[i] * d[i];
    return {
      peak, rms: Math.sqrt(sum / (n * chs.length)), activeRms: first >= 0 ? Math.sqrt(asum / (active * chs.length)) : 0,
      firstSound: first >= 0 ? first / b.sampleRate : null, lastSound: last >= 0 ? last / b.sampleRate : null,
      sampleRate: b.sampleRate, length: n / b.sampleRate,
    };
  }
  A.bufStats = bufStats;

  /* ============================================================ lifecycle */
  function onBoot() {
    const bus = DA.bus;
    bus.on('frame', (dt) => { safe('autoBreath', () => autoBreath(dt)); pumpNow(); });
    bus.on('pause', () => {
      if (E) E.ctx.suspend().catch(() => {});
      try { if (window.speechSynthesis) window.speechSynthesis.pause(); } catch (e) { /* ignore */ }
    });
    bus.on('resume', () => {
      if (E) E.ctx.resume().catch(() => {});
      try { if (window.speechSynthesis) window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
    });
    bus.on('settings', (s) => {
      A.setVolume(num(s && s.volume, settingsVolume()));
      if (E && voiceStyle({}) !== 'classic') safe('voice worker', () => nvWorker());
    });
    bus.on('runtime:reset', () => {
      // death / load / new game: the scripts that owned loops and voices are gone
      safe('reset', () => {
        if (!E) return;
        E.stopAll(0.3);
        E.radioStatic(0);
        E.unsilence(0.5);
        approach(E.duckG.gain, 1, E.now(), 0.2);
        E.duckUntil = 0;
      });
    });
    if (A.autoInit && typeof document !== 'undefined') {
      const evs = ['pointerdown', 'keydown', 'touchstart'];
      const onGesture = () => {
        if (!A.autoInit) return;
        if (A.init() && E && E.ctx.state !== 'suspended') evs.forEach((ev) => document.removeEventListener(ev, onGesture, true));
      };
      evs.forEach((ev) => document.addEventListener(ev, onGesture, true));
    }
  }
  if (DA.bus) DA.bus.on('boot', onBoot);
})();
