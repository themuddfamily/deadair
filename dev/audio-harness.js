/* DEAD AIR — dev/audio-harness.js
 * Bench for js/audio.js: every sound on a button, ambience/static/breath controls, a voice
 * tester with the syllable/prosody plan drawn, a positional pad, a live scope, and an offline
 * bench (OfflineAudioContext renders of every sound → peak/RMS table + spectrograms).
 * Exposes window.AU for headless tests.
 */
(function () {
  'use strict';
  const DA = window.DA;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props, ...kids) => DA.util.el(tag, props, ...kids);

  /* --------------------------------------------------------------- stubs */
  // Speaker voices when js/content.js is not present (harness-only stand-in for DA.content).
  const STUB_SPEAKERS = {
    woman: { name: 'Woman', voice: { gender: 'f', pitch: 218, rate: 1.08, breathy: 0.4, panic: 0.5 } },
    dispatch: { name: 'County Dispatch', voice: { gender: 'f', pitch: 192, rate: 1.1, breathy: 0.2 } },
    trucker: { name: 'Trucker', voice: { gender: 'm', pitch: 96, rate: 0.95, rasp: 0.35, age: 52 } },
    police: { name: 'Sheriff', voice: { gender: 'm', pitch: 118, rate: 1.12 } },
    weather: { name: 'NOAA', voice: { gender: 'm', pitch: 104, rate: 0.9, range: 0.25, breathy: 0.05 } },
    child: { name: 'Child', voice: { gender: 'c', pitch: 290, rate: 1.1 } },
    girl: { name: 'Girl', voice: { gender: 'c', pitch: 305, rate: 0.9, breathy: 0.35 } },
    you: { name: 'You', voice: { gender: 'm', pitch: 118 } },
    you_calm: { name: 'Calm You', voice: { gender: 'm', pitch: 110, rate: 0.9, range: 0.7 } },
    you_panic: { name: 'Panicked You', voice: { gender: 'm', pitch: 134, rate: 1.25, panic: 0.7, breathy: 0.3 } },
    you_injured: { name: 'Injured You', voice: { gender: 'm', pitch: 106, rate: 0.85, rasp: 0.45, breathy: 0.5 } },
    you_old: { name: 'Old You', voice: { gender: 'm', pitch: 124, rate: 0.82, age: 79, rasp: 0.3 } },
    you_now: { name: 'You', voice: { gender: 'm', pitch: 118 } },
    you_recorded: { name: 'You (tape)', voice: { gender: 'm', pitch: 118 } },
    hollis: { name: 'Hollis', voice: { gender: 'm', pitch: 100, rate: 0.95, age: 58, rasp: 0.22 } },
    replacement: { name: 'Replacement', voice: { gender: 'f', pitch: 200 } },
    researcher_a: { name: 'Researcher A', voice: { gender: 'm', pitch: 122, rate: 1.0 } },
    researcher_b: { name: 'Researcher B', voice: { gender: 'm', pitch: 98, rate: 0.9, age: 60 } },
    operator_marsh: { name: 'Marsh', voice: { gender: 'm', pitch: 108, age: 62, rasp: 0.2 } },
    operator_okafor: { name: 'Okafor', voice: { gender: 'm', pitch: 96, rate: 0.95 } },
    operator_vance: { name: 'Vance', voice: { gender: 'f', pitch: 196, rate: 1.05 } },
    first_contact: { name: '???', voice: { gender: 'n', pitch: 88, rate: 0.8, rasp: 0.6, range: 0.4 } },
    keep_open: { name: '???', voice: { gender: 'n', pitch: 72, rate: 0.75, rasp: 0.5, range: 0.3 } },
    new_operator: { name: 'Operator', voice: { gender: 'f', pitch: 204 } },
    pilot: { name: 'Pilot', voice: { gender: 'm', pitch: 116, rate: 1.12 } },
    unknown: { name: 'Unknown', voice: { gender: 'n' } },
    default_m: { name: 'default m', voice: { gender: 'm' } },
    default_f: { name: 'default f', voice: { gender: 'f' } },
    default_c: { name: 'default c', voice: { gender: 'c' } },
    default_n: { name: 'default n', voice: { gender: 'n' } },
  };
  const usingStub = !(DA.content && DA.content.speakers);
  if (usingStub) DA.content = Object.assign(DA.content || {}, { speakers: STUB_SPEAKERS });
  else for (const g of ['m', 'f', 'c', 'n']) DA.content.speakers['default_' + g] = DA.content.speakers['default_' + g] || STUB_SPEAKERS['default_' + g];

  const LINES = [
    ['woman', 'Hello? Is anybody there?'],
    ['woman', "Please... I hit a deer, and the car rolled into the ditch. I can't feel my legs."],
    ['hollis', "Frequency 148.32 is reserved. If you hear anything on it, just log it. Don't respond."],
    ['hollis', 'Old military frequency or something.'],
    ['dispatch', "Station Fourteen, County. Unit's on scene at Kestrel Road. There's nothing there."],
    ['you_panic', 'Station Fourteen, listen carefully. Do not answer transmission 19.'],
    ['you', "And whatever happens, don't unlock the records room."],
    ['girl', 'My dad told me somebody would be listening.'],
    ['girl', "He said you're supposed to open the records room."],
    ['you_calm', 'At 04:47, disconnect antenna three.'],
    ['you_panic', "Don't listen to him. He isn't you anymore."],
    ['you_injured', "It's inside the station... don't let the lights go out."],
    ['you', "Okay. I'm leaving the station."],
    ['you', "Why didn't you leave?"],
    ['you', "Don't look at the window."],
    ['keep_open', 'KEEP THE CHANNEL OPEN.'],
    ['unknown', "Don't turn around."],
    ['unknown', 'You only destroyed yours.'],
    ['you_recorded', 'Station Fourteen, radio check.'],
    ['researcher_a', 'Subject demonstrated zero interaction.'],
    ['researcher_b', 'Without observation, there was no event.'],
    ['trucker', 'Whoever put out that warning... thank you.'],
    ['weather', 'NOAA weather radio, station WXK-31. Heavy rain continuing through the overnight hours. Flash flood watch in effect.'],
    ['you_old', 'The fourth one is you. Go down. See what is under us.'],
  ];

  /* ---------------------------------------------------- pre-init API check */
  // Must run before anything creates the AudioContext: every public call has to be a silent no-op.
  function preInitCheck() {
    const A = DA.audio;
    const calls = [
      ['setVolume', [0.5]], ['play', ['footstep', { surface: 'gravel', x: 3, y: 4 }]], ['play', ['nope_not_a_sound']],
      ['play', []], ['play', [null, null]], ['loop', ['phone_ring', { x: 1, y: 1 }]], ['loop', ['car_drive']],
      ['listener', [1, 2, 0.5, 'station']], ['listener', [NaN, undefined]], ['ambience', [{ rain: 0.8, indoor: true, room: 'hall' }]],
      ['ambience', []], ['ambience', [null]], ['radioStatic', [0.4, { tone: 0.5 }]], ['radioStatic', []],
      ['voice', ['Hello? Is anybody there?', 'woman', { radio: true, clarity: 0.4 }]], ['voice', [undefined, undefined]],
      ['breath', [0.5]], ['breath', ['x']], ['setPlayerBreath', [{ level: 0.3, rate: 14 }]], ['setPlayerBreath', []],
      ['breathPhase', []], ['playerBreath', []], ['breathState', []], ['duck', [0.5, 1]], ['silence', [2]], ['unsilence', []],
      ['stinger', ['low']], ['stinger', ['nope']], ['stopAll', []], ['has', ['knock']], ['names', []],
    ];
    const out = { ok: true, ready: A.ready, results: [] };
    for (const [fn, args] of calls) {
      try {
        const r = A[fn](...args);
        if ((fn === 'play' || fn === 'loop') && r) { r.stop(); r.setVol(0.5); r.setPos(1, 2); r.set && r.set({ speed: 1 }); }
        if (fn === 'voice' && r) { if (!(typeof r.dur === 'number' && r.dur > 0)) throw new Error('voice dur missing'); r.stop(); }
        out.results.push([fn, 'ok']);
      } catch (e) {
        out.ok = false;
        out.results.push([fn, 'THREW ' + e.message]);
      }
    }
    out.readyAfter = A.ready;
    return out;
  }
  const PRE = (window.AU_PREINIT = preInitCheck());

  DA.boot();

  /* --------------------------------------------------------------- UI utils */
  function slider(parent, label, min, max, step, value, onInput, fmt) {
    const input = el('input', { type: 'range', min, max, step, value });
    const o = el('output', {}, (fmt || ((v) => (+v).toFixed(2)))(value));
    input.addEventListener('input', () => { o.textContent = (fmt || ((v) => (+v).toFixed(2)))(input.value); onInput(+input.value); });
    const row = el('div', { class: 'au-slider' }, el('span', {}, label), input, o);
    parent.appendChild(row);
    return input;
  }
  const A = DA.audio;
  const loops = new Map(); // shift-clicked sound loops by name
  const amb = { rain: 0.8, indoor: true, hum: 0.6, generator: 'off', genDist: 0.15, wind: 0.4, thunder: 0.3, drone: 0, birds: false, daylight: false, heartbeat: 0, room: 'small', settle: 0.35, window: 0.5 };
  const ambSliders = {};
  function pushAmb() { A.ambience(Object.assign({}, amb)); }

  /* --------------------------------------------------------------- top bar */
  $('au-init').onclick = () => { A.init(); pushAmb(); };
  const vol = $('au-vol');
  vol.oninput = () => { $('au-vol-o').textContent = (+vol.value).toFixed(2); A.setVolume(+vol.value); };
  let paused = false;
  $('au-pause').onclick = () => { paused = !paused; DA.setPaused(paused); $('au-pause').textContent = paused ? 'RESUME' : 'PAUSE'; };
  $('au-duck').onclick = () => A.duck(0.7, 2);
  $('au-silence').onclick = () => A.silence(3);
  $('au-stopall').onclick = () => { A.stopAll(0.2); loops.forEach((h) => h.stop(0.2)); loops.clear(); document.querySelectorAll('.au-btn.looping').forEach((b) => b.classList.remove('looping')); };

  /* --------------------------------------------------------------- ambience */
  const PRESETS = {
    'Title': { rain: 0.9, indoor: false, hum: 0, generator: 'off', wind: 0.5, thunder: 0.4, drone: 0, birds: false, daylight: false, heartbeat: 0, room: 'outside' },
    'Lot': { rain: 1, indoor: false, hum: 0.15, generator: 'off', wind: 0.6, thunder: 0.5, drone: 0, birds: false, room: 'outside', genDist: 0.05 },
    'Radio room': { rain: 0.36, indoor: true, hum: 0.75, generator: 'off', wind: 0.2, thunder: 0.4, drone: 0, room: 'small', genDist: 0.14 },
    'Hall': { rain: 0.36, indoor: true, hum: 0.75, generator: 'off', wind: 0.2, thunder: 0.4, drone: 0, room: 'hall', genDist: 0.14 },
    'Basement': { rain: 0.07, indoor: true, hum: 0.75, generator: 'on', genDist: 0.85, wind: 0, thunder: 0.06, drone: 0, room: 'basement' },
    'Stutter': { rain: 0.36, indoor: true, hum: 0.75, generator: 'stutter', genDist: 0.5, wind: 0.2, thunder: 0.4, drone: 0.3, room: 'hall' },
    'Array': { rain: 0, indoor: true, hum: 0, generator: 'off', wind: 0.15, thunder: 0, drone: 0.9, heartbeat: 0.3, room: 'array' },
    'Blackout': { rain: 0.8, indoor: true, hum: 0, generator: 'off', wind: 0.4, thunder: 0.5, drone: 0.5, heartbeat: 0.6, room: 'small' },
    'Dawn 2049': { rain: 0, indoor: true, hum: 0, generator: 'off', wind: 0.2, thunder: 0, drone: 0, birds: true, daylight: true, heartbeat: 0, room: 'small' },
  };
  for (const name in PRESETS) {
    $('au-presets').appendChild(el('button', { class: 'au-btn', onclick: () => { applyPreset(PRESETS[name]); } }, name));
  }
  function applyPreset(p) {
    Object.assign(amb, { heartbeat: 0, birds: false, daylight: false, drone: 0 }, p);
    for (const k in ambSliders) { ambSliders[k].value = amb[k]; ambSliders[k].dispatchEvent(new Event('input')); }
    $('au-indoor').checked = amb.indoor; $('au-birds').checked = amb.birds; $('au-daylight').checked = amb.daylight;
    $('au-gen').value = amb.generator; $('au-room').value = amb.room;
    pushAmb();
  }
  for (const key of ['rain', 'wind', 'thunder', 'hum', 'drone', 'genDist', 'heartbeat', 'settle', 'window']) {
    ambSliders[key] = slider($('au-amb-sliders'), key, 0, 1, 0.01, amb[key], (v) => { amb[key] = v; pushAmb(); });
  }
  for (const key of ['indoor', 'birds', 'daylight']) {
    $('au-' + key).checked = amb[key];
    $('au-' + key).onchange = () => { amb[key] = $('au-' + key).checked; pushAmb(); };
  }
  $('au-gen').onchange = () => { amb.generator = $('au-gen').value; pushAmb(); };
  $('au-room').onchange = () => { amb.room = $('au-room').value; pushAmb(); };
  pushAmb();

  /* --------------------------------------------------------------- static */
  const stat = { level: 0, tone: 0, vol: 1, muffle: 0 };
  const pushStatic = () => A.radioStatic(stat.level, { tone: stat.tone, vol: stat.vol, muffle: stat.muffle });
  for (const key of ['level', 'tone', 'vol', 'muffle']) slider($('au-static-sliders'), key, 0, 1, 0.01, stat[key], (v) => { stat[key] = v; });
  // the radio module sets the level every frame; emulate that
  DA.bus.on('frame', pushStatic);

  /* --------------------------------------------------------------- breath */
  const br = { level: 0.3, rate: 15 };
  const pushBreath = () => A.setPlayerBreath({ level: br.level, rate: br.rate });
  slider($('au-breath-sliders'), 'level', 0, 1, 0.01, br.level, (v) => { br.level = v; pushBreath(); });
  slider($('au-breath-sliders'), 'rate/min', 6, 45, 1, br.rate, (v) => { br.rate = v; pushBreath(); }, (v) => String(v));
  pushBreath();
  let mirror = null;
  $('au-mirror').onchange = () => {
    if ($('au-mirror').checked) mirror = A.loop('breath_other', { radio: true, vol: 0.9 });
    else if (mirror) { mirror.stop(0.3); mirror = null; }
  };

  /* --------------------------------------------------------------- positional pad */
  const pad = $('au-pad'), pctx = pad.getContext('2d');
  const pos = { x: 3, y: -4, angle: -Math.PI / 2 };
  const SCALE = 180 / 12; // canvas px per cell (canvas is 2× css)
  function padToWorld(ev) {
    const r = pad.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * pad.width - pad.width / 2;
    const py = ((ev.clientY - r.top) / r.height) * pad.height - pad.height / 2;
    return { x: px / SCALE, y: py / SCALE };
  }
  let turning = false;
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.addEventListener('mousedown', (e) => {
    if (e.button === 2) { turning = true; return; }
    const w = padToWorld(e); pos.x = w.x; pos.y = w.y; updatePos();
  });
  window.addEventListener('mouseup', () => { turning = false; });
  pad.addEventListener('mousemove', (e) => {
    if (!turning) return;
    const w = padToWorld(e); pos.angle = Math.atan2(w.y, w.x); updatePos();
  });
  function updatePos() {
    A.listener(0, 0, pos.angle, 'station');
    for (const [, h] of loops) h.setPos && $('au-pos').checked && h.setPos(pos.x, pos.y, 'station');
    drawPad();
  }
  function drawPad() {
    const W = pad.width, H = pad.height, c = pctx;
    c.fillStyle = '#070807'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#1a1e1a'; c.lineWidth = 1;
    for (let i = -12; i <= 12; i += 2) {
      c.beginPath(); c.moveTo(W / 2 + i * SCALE, 0); c.lineTo(W / 2 + i * SCALE, H); c.stroke();
      c.beginPath(); c.moveTo(0, H / 2 + i * SCALE); c.lineTo(W, H / 2 + i * SCALE); c.stroke();
    }
    c.strokeStyle = 'rgba(255,179,71,0.18)';
    for (const r of [2, 5, 10]) { c.beginPath(); c.arc(W / 2, H / 2, r * SCALE, 0, Math.PI * 2); c.stroke(); }
    // listener
    c.save(); c.translate(W / 2, H / 2); c.rotate(pos.angle);
    c.fillStyle = '#7dff9a'; c.beginPath(); c.moveTo(16, 0); c.lineTo(-9, 9); c.lineTo(-9, -9); c.closePath(); c.fill();
    c.restore();
    // source
    const sx = W / 2 + pos.x * SCALE, sy = H / 2 + pos.y * SCALE;
    c.fillStyle = '#ffb347'; c.shadowColor = '#ffb347'; c.shadowBlur = 12;
    c.beginPath(); c.arc(sx, sy, 7, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    const d = Math.hypot(pos.x, pos.y), rel = Math.atan2(pos.y, pos.x) - pos.angle;
    const g = 1 / (1 + 0.08 * d * d);
    $('au-poskv').innerHTML = '';
    for (const [k, v] of [['dist', d.toFixed(1) + ' cells'], ['gain', g.toFixed(3)], ['pan', (Math.sin(rel) * 0.85 * Math.min(1, d / 1.5)).toFixed(2)], ['lowpass', Math.round(18000 / (1 + 0.035 * d * d)) + ' Hz']]) {
      $('au-poskv').appendChild(el('span', {}, k)); $('au-poskv').appendChild(el('span', {}, v));
    }
  }
  updatePos();

  /* --------------------------------------------------------------- SFX grid */
  const GROUPS = {
    'Movement': ['footstep', 'footstep_other', 'running', 'creak', 'footsteps_upstairs', 'ladder', 'branches'],
    'Doors': ['door_open', 'door_close', 'door_locked', 'door_unlock', 'door_creak', 'door_heavy', 'door_handle', 'hatch', 'vent_open'],
    'Knocks & impacts': ['knock', 'knock3', 'window_knock', 'impact', 'bird_strike', 'glass_break', 'shelf_fall', 'chair_scrape'],
    'Station': ['breaker_trip', 'breaker_reset', 'switch', 'flicker', 'power_down', 'power_up', 'generator_start', 'generator_stop', 'generator', 'lever', 'drip', 'pipe_groan', 'collapse_rumble', 'alarm'],
    'Desk & radio': ['radio_click', 'tuning', 'scan', 'static_burst', 'beep', 'tape_insert', 'tape_play', 'tape_stop', 'tape_eject', 'paper', 'pen', 'keys', 'mug_set', 'coffee_brew'],
    'Telephone & keypad': ['phone_ring', 'phone_pickup', 'phone_hangup', 'dial_tone', 'keypad', 'keypad_ok', 'keypad_bad'],
    'Vehicles & weather': ['car_door', 'car_start', 'car_idle', 'car_drive', 'car_away', 'engine_fail', 'rain_car', 'wipers', 'thunder', 'wind_gust'],
    'Body & presence': ['breath', 'breath_other', 'heartbeat', 'cough', 'rustle', 'whisper', 'scream_distant', 'ringing'],
    'Stingers': ['stinger_low', 'stinger_high', 'stinger_glitch'],
  };
  function sfxOpts() {
    const o = { surface: $('au-surface').value, run: $('au-run').checked, crouch: $('au-crouch').checked, radio: $('au-sradio').checked,
      phone: $('au-sphone').checked, muffle: $('au-muffle').checked ? 0.7 : 0, vol: +$('au-svol').value, rate: +$('au-srate').value };
    if ($('au-pos').checked) { o.x = pos.x; o.y = pos.y; o.map = 'station'; }
    return o;
  }
  for (const g in GROUPS) {
    const box = el('div', { class: 'au-btns' });
    for (const n of GROUPS[g]) {
      const b = el('button', { class: 'au-btn', title: n, dataset: { sound: n } }, n);
      b.addEventListener('click', (e) => {
        A.init();
        if (e.shiftKey) {
          if (loops.has(n)) { loops.get(n).stop(0.3); loops.delete(n); b.classList.remove('looping'); }
          else { loops.set(n, A.loop(n, sfxOpts())); b.classList.add('looping'); }
        } else {
          A.play(n, sfxOpts());
          b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 180);
        }
      });
      box.appendChild(b);
    }
    $('au-groups').appendChild(el('div', { class: 'au-group' }, el('h3', {}, g), box));
  }

  /* --------------------------------------------------------------- voice */
  const spSel = $('au-speaker');
  for (const id of Object.keys(DA.content.speakers)) spSel.appendChild(el('option', { value: id }, id));
  spSel.value = 'woman';
  const lineSel = $('au-lines');
  lineSel.appendChild(el('option', { value: '' }, '— sample lines —'));
  LINES.forEach(([sp, t], i) => lineSel.appendChild(el('option', { value: i }, sp + ': ' + t.slice(0, 40))));
  lineSel.onchange = () => {
    const l = LINES[+lineSel.value];
    if (!l) return;
    $('au-text').value = l[1];
    if (DA.content.speakers[l[0]]) spSel.value = l[0];
    drawPlan();
  };
  const clar = $('au-clarity');
  clar.oninput = () => { $('au-clarity-o').textContent = (+clar.value).toFixed(2); if (curVoice) curVoice.setClarity(+clar.value); };
  let curVoice = null;
  function voiceOpts() {
    return { radio: $('au-vradio').checked, phone: $('au-vphone').checked, tape: $('au-vtape').checked, squelch: $('au-vsquelch').checked,
      clarity: +clar.value, x: $('au-pos').checked ? pos.x : undefined, y: $('au-pos').checked ? pos.y : undefined, map: 'station' };
  }
  $('au-speak').onclick = () => {
    A.init();
    if (curVoice) curVoice.stop();
    curVoice = A.voice($('au-text').value, spSel.value, voiceOpts());
    drawPlan(true);
  };
  $('au-vstop').onclick = () => { if (curVoice) curVoice.stop(0.1); };
  $('au-tts').checked = !!DA.settings.tts;
  $('au-tts').onchange = () => { DA.settings.tts = $('au-tts').checked; };
  $('au-text').oninput = () => drawPlan();
  spSel.onchange = () => drawPlan();
  $('au-vrender').onclick = async () => {
    const r = await A.renderVoice($('au-text').value, spSel.value, voiceOpts());
    if (r) showSpec(r.buffer, 'voice · ' + spSel.value + ' · peak ' + r.peak.toFixed(2) + ' · last sound ' + (r.lastSound || 0).toFixed(2) + 's of ' + DA.util.lineDur($('au-text').value).toFixed(2) + 's');
  };
  let planT0 = 0, planDur = 0;
  function drawPlan(start) {
    const text = $('au-text').value, sp = spSel.value;
    const P = A.voicePlan(text, sp);
    if (start) { planT0 = performance.now() / 1000; planDur = P.dur; }
    const vp = P.params, plan = P.plan;
    const kv = $('au-vinfo');
    kv.innerHTML = '';
    const rows = [['lineDur', DA.util.lineDur(text).toFixed(2) + ' s'], ['voice().dur', (() => { const v = A.voice(text, sp, { vol: 0 }); v.stop(0.01); return v.dur; })().toFixed(2) + ' s'],
      ['speech ends', plan.end.toFixed(2) + ' s'], ['syllables', plan.syl.length], ['gender', vp.gender], ['pitch', Math.round(vp.pitch) + ' Hz'],
      ['rate', vp.rate.toFixed(2)], ['formant', vp.formant.toFixed(2)], ['breathy', vp.breathy.toFixed(2)], ['rasp', vp.rasp.toFixed(2)], ['age', Math.round(vp.age)]];
    for (const [k, v] of rows) { kv.appendChild(el('span', {}, k)); kv.appendChild(el('span', {}, String(v))); }
    const c = $('au-plan'), g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#070807'; g.fillRect(0, 0, W, H);
    const dur = P.dur, sx = (t) => (t / dur) * W;
    g.strokeStyle = '#1d211d';
    for (let t = 0; t < dur; t += 0.5) { g.beginPath(); g.moveTo(sx(t), 0); g.lineTo(sx(t), H); g.stroke(); }
    // voicing envelope
    g.fillStyle = 'rgba(255,179,71,0.18)';
    g.beginPath(); g.moveTo(0, H);
    for (const [t, v] of plan.voice.slice().sort((a, b) => a[0] - b[0])) g.lineTo(sx(t), H - v * H * 0.55);
    g.lineTo(W, H); g.closePath(); g.fill();
    // syllables
    g.font = '20px monospace';
    for (const s of plan.syl) {
      g.fillStyle = s.stressed ? 'rgba(255,179,71,0.5)' : 'rgba(255,179,71,0.22)';
      g.fillRect(sx(s.t0), H - 26, Math.max(2, sx(s.t1) - sx(s.t0) - 2), 20);
      g.fillStyle = '#d8dccf';
      g.fillText(s.v, sx(s.t0) + 3, H - 30);
    }
    // pitch contour
    const f0 = plan.f0.slice().sort((a, b) => a[0] - b[0]);
    const fmin = vp.pitch * 0.5, fmax = vp.pitch * 1.9;
    g.strokeStyle = '#7dff9a'; g.lineWidth = 2; g.beginPath();
    f0.forEach(([t, f], i) => { const y = H - 34 - ((f - fmin) / (fmax - fmin)) * (H - 50); if (i) g.lineTo(sx(t), y); else g.moveTo(sx(t), y); });
    g.stroke(); g.lineWidth = 1;
    // consonant bursts
    g.fillStyle = 'rgba(200,220,255,0.5)';
    for (const cns of plan.cons) g.fillRect(sx(cns.t), 4, 3, 10);
    // end of line
    g.strokeStyle = '#ff5a4a'; g.beginPath(); g.moveTo(sx(dur) - 1, 0); g.lineTo(sx(dur) - 1, H); g.stroke();
  }
  drawPlan();

  /* --------------------------------------------------------------- scope + phase */
  const scope = $('au-scope'), sctx = scope.getContext('2d');
  let tbuf = null, fbuf = null;
  function frame() {
    requestAnimationFrame(frame);
    const E = A.engine;
    $('au-lamp').className = 'au-lamp' + (E ? (E.ctx.state === 'running' ? ' on' : ' sus') : '');
    if (E) {
      const n = (E.shots.length + E.loops.length + E.voices.length + E.spawned.length);
      $('au-status').textContent = E.ctx.state.toUpperCase() + ' · ' + E.ctx.sampleRate + ' Hz · ' + E.ctx.currentTime.toFixed(1) + ' s · ' + n + ' active · layers: ' + Object.keys(E.amb.L).join(' ');
    }
    const W = scope.width, H = scope.height;
    sctx.fillStyle = '#070807'; sctx.fillRect(0, 0, W, H);
    if (E && E.analyser) {
      const an = E.analyser;
      if (!tbuf) { tbuf = new Float32Array(an.fftSize); fbuf = new Float32Array(an.frequencyBinCount); }
      an.getFloatFrequencyData(fbuf);
      sctx.fillStyle = 'rgba(255,179,71,0.35)';
      const sr = E.ctx.sampleRate;
      for (let x = 0; x < W; x++) {
        const f = 30 * Math.pow(16000 / 30, x / W), bin = Math.min(fbuf.length - 1, Math.round((f / (sr / 2)) * fbuf.length));
        const v = Math.max(0, (fbuf[bin] + 100) / 80);
        sctx.fillRect(x, H - v * H, 1, v * H);
      }
      an.getFloatTimeDomainData(tbuf);
      sctx.strokeStyle = '#7dff9a'; sctx.beginPath();
      for (let x = 0; x < W; x++) { const v = tbuf[Math.floor((x / W) * tbuf.length)]; const y = H / 2 - v * H * 0.9; if (x) sctx.lineTo(x, y); else sctx.moveTo(x, y); }
      sctx.stroke();
    }
    $('au-needle').style.left = (A.breathPhase() * 100).toFixed(2) + '%';
  }
  requestAnimationFrame(frame);

  /* --------------------------------------------------------------- spectrograms */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < h; j++) {
          const a = i + j, b = a + h;
          const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const CMAP = (v) => {
    // black → oxblood → amber → pale
    const stops = [[0, 5, 6, 5], [0.35, 70, 18, 10], [0.6, 190, 90, 30], [0.85, 255, 180, 71], [1, 255, 240, 200]];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], t = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      }
    }
    return [255, 240, 200];
  };
  /** Log-frequency spectrogram (40 Hz – 16 kHz) with a waveform strip on top. */
  function drawSpectrogram(canvas, buffer, t1) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const sr = buffer.sampleRate;
    const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const n = Math.min(L.length, Math.floor((t1 || buffer.duration) * sr));
    const waveH = Math.round(H * 0.18), specH = H - waveH;
    const img = g.createImageData(W, H);
    const N = 2048, re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const fmin = 40, fmax = Math.min(16000, sr / 2);
    for (let x = 0; x < W; x++) {
      const c = Math.floor((x / W) * n) - N / 2;
      for (let i = 0; i < N; i++) { const j = c + i; re[i] = j >= 0 && j < n ? (L[j] + R[j]) * 0.5 * win[i] : 0; im[i] = 0; }
      fft(re, im);
      for (let y = 0; y < specH; y++) {
        const f = fmin * Math.pow(fmax / fmin, 1 - y / specH);
        const bin = Math.min(N / 2 - 1, Math.round((f / sr) * N));
        const mag = Math.hypot(re[bin], im[bin]) / (N / 4);
        const db = 20 * Math.log10(mag + 1e-9);
        const v = Math.max(0, Math.min(1, (db + 95) / 85));
        const [r, gg, b] = CMAP(v);
        const o = ((y + waveH) * W + x) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
      // waveform column
      const s0 = Math.floor((x / W) * n), s1 = Math.floor(((x + 1) / W) * n);
      let mx = 0;
      for (let j = s0; j < s1; j++) mx = Math.max(mx, Math.abs(L[j]), Math.abs(R[j]));
      const hh = Math.min(1, mx) * (waveH - 2);
      for (let y = 0; y < waveH; y++) {
        const o = (y * W + x) * 4, on = Math.abs(y - waveH / 2) <= hh / 2;
        img.data[o] = on ? (mx > 0.99 ? 255 : 125) : 8; img.data[o + 1] = on ? (mx > 0.99 ? 60 : 255) : 9; img.data[o + 2] = on ? (mx > 0.99 ? 50 : 154) : 8; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // frequency guides
    g.fillStyle = 'rgba(216,220,207,0.55)'; g.font = Math.max(10, Math.round(H / 30)) + 'px monospace';
    for (const f of [100, 300, 1000, 3000, 10000]) {
      if (f > fmax) continue;
      const y = waveH + (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * specH;
      g.fillRect(0, y, 6, 1);
      if (H > 100) g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 8, y + 4);
    }
    if (H > 100) {
      const dur = n / sr;
      for (let t = 0; t <= dur; t += dur > 6 ? 1 : 0.5) { const x = (t / dur) * W; g.fillRect(x, H - 6, 1, 6); g.fillText(t.toFixed(1) + 's', x + 3, H - 8); }
    }
  }
  function showSpec(buffer, label, t1) {
    drawSpectrogram($('au-spec'), buffer, t1);
    $('au-speclabel').textContent = label;
  }

  /* --------------------------------------------------------------- offline bench */
  const bench = { rows: [], done: false };
  async function renderAll(names) {
    names = names || A.names();
    const tbody = $('au-table').querySelector('tbody');
    tbody.innerHTML = '';
    bench.rows = [];
    let bad = 0;
    const t0 = performance.now();
    for (const n of names) {
      const r = await A.renderSound(n, { surface: 'concrete' }, n === 'thunder' || n === 'collapse_rumble' || n === 'car_away' ? 9 : 6);
      const row = { name: n, ok: false };
      if (r) {
        const silent = r.peak < 0.02 || r.activeRms < 0.002;
        const clip = r.peak >= 0.99;
        Object.assign(row, { dur: r.dur, peak: r.peak, rms: r.activeRms, tail: r.lastSound, ok: !silent && !clip, silent, clip });
        const thumb = el('canvas', { class: 'au-thumb', width: 360, height: 60 });
        drawSpectrogram(thumb, r.buffer, Math.min(r.buffer.duration, (r.lastSound || r.dur) + 0.2));
        thumb.onclick = () => showSpec(r.buffer, n + ' · peak ' + r.peak.toFixed(3) + ' · RMS ' + r.activeRms.toFixed(4), Math.min(r.buffer.duration, (r.lastSound || r.dur) + 0.3));
        const meter = el('div', { class: 'au-meter' }, el('i', { style: { width: Math.min(100, r.peak * 100) + '%' } }));
        tbody.appendChild(el('tr', {},
          el('td', {}, n), el('td', { class: 'num' }, r.dur.toFixed(2)), el('td', { class: 'num' }, r.peak.toFixed(3)), el('td', {}, meter),
          el('td', { class: 'num' }, (20 * Math.log10(r.activeRms + 1e-9)).toFixed(1) + ' dB'), el('td', { class: 'num' }, (r.lastSound || 0).toFixed(2)),
          el('td', {}, thumb), el('td', { class: row.ok ? 'au-ok' : 'au-bad' }, row.ok ? 'OK' : silent ? 'SILENT' : 'CLIP')));
      } else {
        tbody.appendChild(el('tr', {}, el('td', {}, n), el('td', { class: 'au-bad', colspan: 7 }, 'RENDER FAILED')));
      }
      if (!row.ok) bad++;
      bench.rows.push(row);
    }
    const first = $('au-table').querySelector('.au-thumb');
    if (first) first.click();
    bench.done = true;
    bench.bad = bad;
    bench.ms = performance.now() - t0;
    $('au-benchsum').textContent = names.length + ' sounds rendered in ' + (bench.ms / 1000).toFixed(1) + ' s · ' + (bad ? bad + ' problems' : 'all non-silent, none clipping');
    $('au-benchsum').className = 'au-hint ' + (bad ? 'au-bad' : 'au-ok');
    return bench;
  }
  $('au-renderall').onclick = () => renderAll();
  $('au-rendamb').onclick = async () => {
    const r = await A.renderAmbience(Object.assign({}, amb), 8);
    if (r) showSpec(r.buffer, 'ambience mix · 8 s · peak ' + r.peak.toFixed(3) + ' · RMS ' + (20 * Math.log10(r.rms)).toFixed(1) + ' dB · rendered in ' + r.renderSec.toFixed(2) + ' s');
  };

  /* --------------------------------------------------------------- checks */
  function showPre() {
    const p = PRE;
    $('au-preinit').innerHTML = '';
    $('au-preinit').appendChild(el('div', { class: p.ok && !p.readyAfter ? 'au-ok' : 'au-bad' },
      (p.ok ? 'all ' + p.results.length + ' calls returned without throwing' : 'FAILURES') + (p.readyAfter ? ' — but audio became ready!' : ' · still not initialised')));
    for (const [fn, r] of p.results) if (r !== 'ok') $('au-preinit').appendChild(el('div', { class: 'au-bad' }, fn + ': ' + r));
  }
  showPre();
  function durCheck() {
    const lines = LINES.map((l) => l[1]).concat(['', 'Hi.', 'KEEP THE CHANNEL OPEN KEEP THE CHANNEL OPEN KEEP THE CHANNEL OPEN',
      '[chair scraping]', '148.32 — 155.34 — 027.18', 'Is it still raining where you are?', "{NAME}? {NAME}, is that you?"]);
    if (DA.content && DA.content.tx) {
      for (const id in DA.content.tx) {
        const tx = DA.content.tx[id];
        const walk = (steps) => { for (const s of steps || []) if (s && s.t) lines.push(s.t); };
        walk(tx.hail); walk(tx.waitLines);
        for (const node in tx.script || {}) walk(tx.script[node]);
      }
    }
    let bad = 0;
    for (const t of lines) {
      const want = DA.util.lineDur(DA.fmt(t));
      const v = A.voice(t, 'woman', { vol: 0 });
      v.stop(0.01);
      const got = v.dur;
      if (Math.abs(got - want) > 1e-9) bad++;
      const plan = A.voicePlan(DA.fmt(t), 'woman');
      if (plan.plan.end > want + 1e-6) bad++;
    }
    return { lines: lines.length, bad };
  }
  function showDur() {
    const r = durCheck();
    $('au-durcheck').innerHTML = '';
    $('au-durcheck').appendChild(el('div', { class: r.bad ? 'au-bad' : 'au-ok' }, r.lines + ' lines checked (' + (A.ready ? 'initialised' : 'pre-init') + ') · ' + (r.bad ? r.bad + ' mismatches' : 'dur === lineDur, speech ends inside the line')));
    return r;
  }
  showDur();

  window.AU = { renderAll, durCheck, showDur, bench, drawSpectrogram, showSpec, applyPreset, PRESETS, LINES, amb, loops, usingStub };
})();
