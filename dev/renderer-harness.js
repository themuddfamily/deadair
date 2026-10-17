/* DEAD AIR — dev/renderer-harness.js
 * Renderer harness: stubs DA.world with the hand-made test map (renderer-map.js), fly controls,
 * presets for screenshots, a CCTV renderView preview, and a perf probe.
 *   dev/renderer.html          interactive (WASD/arrows move, mouse drag / pointer lock to look,
 *                              Q/E up/down, F flashlight, 1–9 0 presets, B blend, V abandoned,
 *                              N daylight, P power, M window figure, J lightning, G glitch,
 *                              K shake, H flash, C CCTV view, I instability +2, R rain)
 *   dev/renderer.html?atlas    labelled atlas of every texture and sprite
 *   dev/renderer.html?preset=NAME   start at a preset
 * Presets: corridor console doorway outdoor lot window windowOut flashlight abandoned blend
 *   daylight treeline pit entity npc npcBack roof lookUp lookDown kitchen workshop lobby
 *   equipment office bathroom.
 * Test API (window): preset(name, stateOverrides), perf(frames) → {avg, median, min, p90, max}
 *   (ms per DA.render.frame), cctvShot(variant) → dataURL of a renderView CCTV frame,
 *   harness.{state, map}. Test scripts live in the session scratchpad (renderer/*.js).
 */
(function () {
  'use strict';
  const DA = window.DA;
  const q = new URLSearchParams(location.search);

  const H = (window.harness = {
    state: { power: true, flashlight: false, blend: 0, daylight: 0, variant: 'normal', figure: 0, cctv: false, t: 0, freeze: false },
    map: null,
  });

  function setupWorld() {
    const m = window.DEV_MAP.compile();
    H.map = m;
    const player = { x: 4.5, y: 10.5, angle: 0, pitch: 0, flashlight: false, bob: 0, z: 0.5 };
    DA.world = {
      map: m,
      mapId: 'test',
      maps: { test: m },
      player,
      camera() { return { x: player.x, y: player.y, angle: player.angle, pitch: player.pitch, fov: DA.settings.fov || 66, bob: player.bob, z: player.z }; },
    };
    DA.state.world = { blend: 0, daylight: 0 };
    DA.render.addSpriteProvider((mapId) => (mapId === 'test' ? window.DEV_MAP.sprites(H.state.t, H.state) : []));
  }

  function applyState() {
    const s = H.state, m = H.map;
    m.variant = s.variant;
    DA.state.world.blend = s.blend;
    DA.state.world.daylight = s.daylight;
    DA.world.player.flashlight = s.flashlight;
    m.emissive = s.power ? 1 : 0.15;
    m.tint = s.power ? [1, 1, 1] : [0.85, 0.32, 0.28];
    m.windowFigure = s.figure > 0 ? { x: 2, y: 5, amount: s.figure } : null;
  }

  /** Movement with simple collision against solid cells and closed doors. */
  function blocked(x, y) {
    const m = H.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
    const i = Math.floor(y) * m.w + Math.floor(x);
    if (m.door[i] >= 0) return m.doors[m.door[i]].open < 0.7;
    return !!m.solid[i];
  }
  function tryMove(p, dx, dy) {
    const r = 0.22;
    if (!blocked(p.x + dx + Math.sign(dx) * r, p.y)) p.x += dx;
    if (!blocked(p.x, p.y + dy + Math.sign(dy) * r)) p.y += dy;
  }

  let bobPhase = 0;
  function update(dt) {
    const s = H.state;
    if (!s.freeze) s.t += dt;
    window.DEV_MAP.updateLights(H.map, s.t, s.power);
    const p = DA.world.player, I = DA.input;
    const m = I.consumeMouse();
    p.angle += m.dx * 0.0035;
    p.pitch = Math.max(-0.45, Math.min(0.45, p.pitch - m.dy * 0.0025));
    if (I.down('ArrowLeft')) p.angle -= dt * 2;
    if (I.down('ArrowRight')) p.angle += dt * 2;
    const sp = (I.down('ShiftLeft') ? 5 : 2.4) * dt;
    let fx = 0, fy = 0;
    if (I.down('KeyW') || I.down('ArrowUp')) fx += 1;
    if (I.down('KeyS') || I.down('ArrowDown')) fx -= 1;
    if (I.down('KeyD')) fy += 1;
    if (I.down('KeyA')) fy -= 1;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    if (fx || fy) {
      tryMove(p, (ca * fx - sa * fy) * sp, (sa * fx + ca * fy) * sp);
      bobPhase += dt * 9;
      p.bob = Math.sin(bobPhase) * 0.012;
    } else p.bob *= 0.9;
    if (I.down('KeyQ')) p.z = Math.min(0.95, p.z + dt * 0.5);
    if (I.down('KeyE')) p.z = Math.max(0.1, p.z - dt * 0.5);
    applyState();
    // HUD + CCTV
    if (s.cctv) {
      const cv = document.getElementById('dev-cctv');
      cv.style.display = 'block';
      if ((s.t * 4) % 1 < dt * 4 + 0.001) cctv(cv);
    }
    const hud = document.getElementById('dev-hud');
    if (hud) hud.textContent = `render ${DA.render.stats.ms.toFixed(2)} ms (avg ${DA.render.stats.avg.toFixed(2)})  fps ${DA.fps}  sprites ${DA.render.stats.sprites}
pos ${p.x.toFixed(2)},${p.y.toFixed(2)} ang ${((p.angle * 180) / Math.PI).toFixed(0)}°  ${s.variant} blend ${s.blend} day ${s.daylight} power ${s.power ? 'on' : 'OFF'}${s.flashlight ? ' torch' : ''}`;
  }

  function cctv(cv, variant) {
    const cam = { x: 3.4, y: 10.5, angle: 0.05, pitch: -0.08, fov: 80 };
    DA.render.renderView(cv, cam, {
      mapId: 'test', monochrome: true, noise: 0.35, lightScale: 0.9, variant: variant || 'normal',
      sprites: [{ x: 9.5, y: 10.4, tex: 'spr_figure', frame: 4 }],
    });
  }

  const PRESETS = {
    corridor: { pos: [3.3, 10.5, 0, 0] },
    console: { pos: [5.9, 6.6, -90, -0.05] },
    doorway: { pos: [6.5, 10.5, -90, 0] },
    outdoor: { pos: [14.5, 26.5, -100, 0.06] },
    lot: { pos: [30.5, 19.5, 200, 0.02] },
    window: { pos: [7.2, 5.6, 185, 0], state: { figure: 1 } },
    windowOut: { pos: [20.5, 1.4, 90, 0.05], state: { figure: 0 } },
    flashlight: { pos: [3.3, 10.5, 0, 0], state: { power: false, flashlight: true } },
    abandoned: { pos: [8.6, 7.8, -120, 0], state: { variant: 'abandoned', daylight: 0.8 } },
    blend: { pos: [3.3, 10.5, 0, 0], state: { blend: 0.5 } },
    daylight: { pos: [14.5, 26.5, -100, 0.06], state: { daylight: 1 } },
    treeline: { pos: [30.5, 24.5, 130, 0.12], state: { daylight: 0.7 } },
    pit: { pos: [28.4, 10.5, 0, -0.1] },
    entity: { pos: [34.5, 10.6, 90, -0.05] },
    roof: { pos: [31.5, 1.5, 70, 0.1] },
    lookUp: { pos: [3.3, 10.5, 0, 0.4] },
    lookDown: { pos: [3.3, 10.5, 0, -0.4] },
    npc: { pos: [7.5, 10.5, 0, 0], state: { hollisX: 10.2 } },
    npcBack: { pos: [7.5, 10.5, 0, 0], state: { hollisX: 10.2, hollisBack: true } },
    kitchen: { pos: [22.4, 7.8, -140, 0] },
    workshop: { pos: [20.5, 12.4, 90, 0] },
    lobby: { pos: [12.5, 12.2, 90, -0.05] },
    equipment: { pos: [24.6, 8.2, -60, 0] },
    office: { pos: [15.5, 8.2, -130, 0] },
    bathroom: { pos: [5, 12.5, 90, 0] },
  };
  window.preset = function (name, extra) {
    const P = PRESETS[name];
    if (!P) return false;
    Object.assign(H.state, { power: true, flashlight: false, blend: 0, daylight: 0, variant: 'normal', figure: 0, hollisX: null, hollisBack: false }, P.state || {}, extra || {});
    const p = DA.world.player;
    [p.x, p.y] = P.pos;
    p.angle = (P.pos[2] * Math.PI) / 180;
    p.pitch = P.pos[3] || 0;
    p.bob = 0;
    p.z = 0.5;
    applyState();
    return true;
  };
  window.perf = function (frames = 300) {
    const t0 = performance.now();
    const times = [];
    for (let i = 0; i < frames; i++) {
      H.state.t += 1 / 60;
      window.DEV_MAP.updateLights(H.map, H.state.t, H.state.power);
      const a = performance.now();
      DA.render.frame(1 / 60);
      times.push(performance.now() - a);
    }
    const sorted = times.slice().sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / frames;
    return { avg, median: sorted[frames >> 1], min: sorted[0], p90: sorted[Math.floor(frames * 0.9)], max: sorted[frames - 1], total: performance.now() - t0 };
  };
  window.cctvShot = function (variant) {
    const cv = document.getElementById('dev-cctv');
    cv.style.display = 'block';
    cctv(cv, variant);
    return cv.toDataURL();
  };

  function keys(e, down) {
    if (!down) return false;
    const s = H.state;
    const presetKeys = { Digit1: 'corridor', Digit2: 'console', Digit3: 'doorway', Digit4: 'outdoor', Digit5: 'window', Digit6: 'flashlight', Digit7: 'abandoned', Digit8: 'blend', Digit9: 'daylight', Digit0: 'pit' };
    if (presetKeys[e.code]) { window.preset(presetKeys[e.code]); return true; }
    switch (e.code) {
      case 'KeyF': s.flashlight = !s.flashlight; return true;
      case 'KeyB': s.blend = s.blend >= 1 ? 0 : Math.round((s.blend + 0.25) * 100) / 100; return true;
      case 'KeyV': s.variant = s.variant === 'abandoned' ? 'normal' : 'abandoned'; return true;
      case 'KeyN': s.daylight = s.daylight >= 1 ? 0 : Math.round((s.daylight + 0.25) * 100) / 100; return true;
      case 'KeyP': s.power = !s.power; return true;
      case 'KeyM': s.figure = s.figure ? 0 : 1; return true;
      case 'KeyJ': DA.render.lightning(1); return true;
      case 'KeyG': DA.render.glitch(0.8, 0.5); return true;
      case 'KeyK': DA.render.shake(0.8, 0.6); return true;
      case 'KeyH': DA.render.flash('#fff', 0.4); return true;
      case 'KeyC': s.cctv = !s.cctv; document.getElementById('dev-cctv').style.display = s.cctv ? 'block' : 'none'; return true;
      case 'KeyI': DA.addVar('instability', 2); return true;
      case 'KeyR': DA.state.world.rain = DA.state.world.rain === 0 ? 1 : 0; return true;
    }
    return false;
  }

  window.addEventListener('load', () => {
    if (q.has('atlas')) {
      DA.textures.build();
      window.DA_ATLAS();
      document.title = 'ATLAS READY';
      return;
    }
    // stage size (main.js is not loaded in the harness)
    const fit = () => {
      const w = window.innerWidth, h = window.innerHeight;
      let sw = w, sh = (w * 9) / 16;
      if (sh > h) { sh = h; sw = (h * 16) / 9; }
      document.documentElement.style.setProperty('--stage-w', Math.floor(sw) + 'px');
      document.documentElement.style.setProperty('--stage-h', Math.floor(sh) + 'px');
    };
    window.addEventListener('resize', fit);
    fit();
    DA.modes.register('dev', { lock: true, onKey: keys });
    DA.boot();
    setupWorld();
    DA.addSystem('dev', { update, order: 10 });
    DA.running = true;
    DA.modes.push('dev');
    window.preset(q.get('preset') || 'corridor');
    document.title = 'RENDERER READY';
  });
})();
