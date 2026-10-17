/* DEAD AIR — raycaster.js
 * DA.render: a Wolfenstein-style DDA raycaster at 480×270 (PLAN.md §6.2), drawing the world
 * module's runtime map (§6.4) with textures from DA.textures (§6.1).
 *
 * Per frame: light field (per-cell light, smoothed and bilinearly interpolated between cell
 * centres) → per-column DDA (walls with per-face overrides, alt/abandoned variants, thin sliding
 * doors with jambs, see-through fences, backed textures, animated/emissive faces, window glass
 * with rain/lightning/daylight/figure, live-sky masks) → floor & ceiling casting (sky, void) →
 * dithered-alpha billboard sprites against a per-pixel depth buffer → screen rain → post
 * (glitch, chroma, grain, vignette, tint) → flash/fade overlays.
 *
 * ---------------------------------------------------------------- API (PLAN §6.2)
 *   W, H, init(), frame(dt), renderView(canvas, cam, opts), addSpriteProvider(fn),
 *   shake(amount, secs), flash(color, secs), lightning(strength), glitch(amount, secs),
 *   setFade(opacity, color), fx {grain, vignette, chroma, tint}
 *
 * ---------------------------------------------------------------- ADDITIONS
 *   removeSpriteProvider(fn)
 *   lightAt(x, y) → smoothed light (0..~1.5) at a world point of the current map (last frame)
 *   stats {ms (last frame() cost), avg (EMA), sprites, frames, parts {scene, sprites, post, put}},
 *   initMs (procedural table build time)
 *   canvas, ctx (the #view canvas), time (renderer clock, seconds)
 *   Camera extras: cam.z = eye height in wall units (default 0.5; hiding lowers it), cam.bob is
 *     added to it (ignored when DA.settings.headBob === false). pitch > 0 looks UP (y-shearing).
 *   Runtime map extras (all optional): wallHeight (walls/ceiling height in units, default 1 —
 *     the array can use 3+ for scale), sky:false (ceil 0 renders a dark void instead of storm sky,
 *     e.g. the array cavern), fog {color:[r,g,b], density, att} override, altFace (Map
 *     idx*4+side → texId; collision-free alternative to face keys inside `alt`), rain (0..1).
 *   `alt` keys: with map.altFace present, `alt` holds cell keys only (the world's format). Without
 *     it, face keys (idx*4+side, side n0 e1 s2 w3) may share `alt`: a key ≥ w*h is a face key; a
 *     smaller key is a cell key when that cell is a wall, otherwise a face key.
 *   Sprite extras: scale omitted → the texture's recommended scale; z omitted on a `hang`
 *     texture (spr_light_fixture) → hangs from the ceiling; tex may be a composite name.
 *   Weather: rain density read from map.rain ?? DA.state.world.rain ?? DA.state.world.weather.rain
 *     (default 1). Blend: DA.state.world.blend > 0 applies unless the map/opts variant is abandoned.
 *   renderView opts extras: map (a runtime map object instead of mapId), time (override clock),
 *     tint [r,g,b], fov via cam.fov. Returns true when a map was rendered.
 *   Light model: map.light is taken as given (0..~1.5) and smoothed/bilinear-filtered; daylight
 *     raises outdoor cells to ≥0.9·daylight and indoor cells to ≥0.1·daylight (the world bakes
 *     window-reach daylight into map.light; these are only floors); lightning adds to
 *     outdoor cells, sky and window glass. map.tint multiplies world light (not emissive pixels,
 *     not the flashlight). Emissive texels glow at max(lit, emissive·map.emissive).
 *   Performance notes: typed arrays only, per-row/column tables, row-wise floor/ceiling casting
 *     in 16.16 fixed point, clamp LUTs (no branches on colour clamps), int32 pixel stores, a
 *     fast path for plain wall slices; grain/vignette/tint are canvas-composited (SIMD/GPU);
 *     sprite columns are clipped to their opaque texel run (cached per frame buffer).
 *
 * ---------------------------------------------------------------- WAVE 3 ADDITIONS
 *   Effect timers (shake, flash, glitch, invert, instability auto-glitch) and the renderer clock
 *     advance on the core 'frame' event, not inside frame(): they decay while the world is hidden
 *     (desk, devices, cards) or not rendered (DA.debug.fast).
 *   Emissive: map.cellEmis (per-cell level, -1 = map-wide) scales emissive floor/ceiling texels
 *     (ceiling panels follow their own light); map.emisTex (Map texId → level) overrides the
 *     map-wide level for wall/door faces (devices on their own supply). Variant 'abandoned' of a
 *     live map (CCTV future) ignores both and dims emissive ×0.1. Sprite `emissive` (0..1)
 *     overrides the map level for that sprite (and its ghosts): the entity's rim can glow in a
 *     blacked-out station.
 *   renderView opts: light (Float32Array w*h replacing map.light — see DA.world.lightAs),
 *     minLight (floor added to every open cell), emissive (0..1 map-wide emissive override; also
 *     disables per-cell/per-texture emissive), plus the existing lightScale/daylight/tint/variant.
 *   Doors with `slats` ('louver' | 'gap', world door record) are see-through layers: the ray goes
 *     on and the room behind shows through the slits (from inside the supply cupboard you watch
 *     the room in strips of light; the stall's partition is open at the floor).
 *   Window glass: looking IN from outside shows mostly the sky's reflection (a lit room still
 *     glows at night; an unlit interior reads dark against a daylit facade); looking OUT by day is
 *     bright grey, not clipped white; rain streaks on glass follow the weather's rain.
 *   Void haze (sky:false maps, pits): the mist is lit by the light field — lamps glow in the dark
 *     air of the array and the lit shaft silhouettes the antenna.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});
  const W = 480, H = 270;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ================================================================ tables */
  const SKYW = 512, SKYH = 64, SKYM = SKYW - 1;
  const NOISE_N = 1 << 18, NOISE_M = NOISE_N - 1;
  let NOISE = null; // Uint8 white noise (grain, CCTV)
  let MIST = null; // 256×256 smooth noise (void mist)
  let SKY1 = null, SKY2 = null; // cloud density panoramas
  let BOLT = null; // lightning bolt layer
  const RIDGEW = 2048;
  let RIDGE = null; // distant hills: silhouette elevation (radians) per fine azimuth column
  const TOWER_A = 1.71; // azimuth (radians) of a far-off radio mast light on the ridge
  let RAIN = null; // 64×128 streaks for window glass
  let BEADS = null; // 64×64 static droplets on glass
  const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 16 + 8));
  let tablesBuilt = false;

  function hh(x, y, s) {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x5bd1e995, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const lattices = new Map();
  function vnoise(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = x0 + 1 === px ? 0 : x0 + 1, y0 = ((yi % py) + py) % py, y1 = y0 + 1 === py ? 0 : y0 + 1;
    const key = px * 100003 + py * 131 + s;
    let L = lattices.get(key);
    if (!L) {
      L = new Float32Array(px * py);
      for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) L[j * px + i] = hh(i, j, s);
      lattices.set(key, L);
    }
    const a = L[y0 * px + x0], b = L[y0 * px + x1], c = L[y1 * px + x0], d = L[y1 * px + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, w, hgt, cx, cy, oct, s) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((x / w) * cx, (y / hgt) * cy, cx, cy, s + o * 97);
      norm += amp;
      amp *= 0.5;
      cx *= 2;
      cy *= 2;
    }
    return sum / norm;
  }

  function buildTables() {
    if (tablesBuilt) return;
    tablesBuilt = true;
    const t0 = performance.now();
    const rnd = DA.util.mulberry32(1999);
    NOISE = new Uint8Array(NOISE_N);
    for (let i = 0; i < NOISE_N; i++) NOISE[i] = (rnd() * 256) | 0;
    MIST = new Uint8Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) MIST[y * 256 + x] = (fbm(x, y, 256, 256, 8, 8, 3, 7) * 255) | 0;
    // storm clouds: two layers, stretched horizontally, denser toward the horizon
    SKY1 = new Uint8Array(SKYW * SKYH);
    SKY2 = new Uint8Array(SKYW * SKYH);
    for (let y = 0; y < SKYH; y++)
      for (let x = 0; x < SKYW; x++) {
        const v = y / SKYH;
        const a = fbm(x, y, SKYW, SKYH, 10, 3, 4, 11);
        const b = fbm(x, y, SKYW, SKYH, 18, 5, 3, 23);
        const k = 1.25 - v * 0.5;
        SKY1[y * SKYW + x] = clamp((a - 0.36) * 2.4 * k * 255, 0, 255) | 0;
        SKY2[y * SKYW + x] = clamp((b - 0.4) * 2.2 * k * 255, 0, 255) | 0;
      }
    BOLT = new Uint8Array(SKYW * SKYH);
    RIDGE = new Float32Array(RIDGEW);
    for (let u = 0; u < RIDGEW; u++) {
      const f = fbm(u, 0, RIDGEW, 1, 6, 1, 5, 31);
      RIDGE[u] = 0.012 + Math.pow(f, 1.6) * 0.13 + fbm(u, 0, RIDGEW, 1, 90, 1, 2, 77) * 0.006; // ~0.7°–8° hills, fine treeline roughness
    }
    // rain on glass: falling streaks with bright heads
    RAIN = new Uint8Array(64 * 128);
    for (let k = 0; k < 70; k++) {
      const x = (rnd() * 64) | 0, y = (rnd() * 128) | 0, len = 3 + ((rnd() * 10) | 0), lv = 60 + rnd() * 150;
      for (let i = 0; i < len; i++) {
        const yy = (y - i + 128) & 127, xx = (x + (rnd() < 0.15 ? 1 : 0)) & 63;
        RAIN[yy * 64 + xx] = Math.max(RAIN[yy * 64 + xx], (lv * (1 - i / len) * (i === 0 ? 1.4 : 1)) | 0);
      }
    }
    BEADS = new Uint8Array(64 * 64);
    for (let k = 0; k < 120; k++) BEADS[((rnd() * 64) | 0) * 64 + ((rnd() * 64) | 0)] = 40 + ((rnd() * 90) | 0);
    lattices.clear();
    tablesMs = performance.now() - t0;
  }
  let tablesMs = 0;

  /** Draw a jagged bolt into the sky layer at a random azimuth. */
  function makeBolt(strength) {
    BOLT.fill(0);
    const rnd = Math.random;
    const walk = (x, y, w, depth) => {
      while (y > 0) {
        const ny = y - 1 - ((rnd() * 3) | 0), nx = x + (rnd() - 0.5) * 6;
        const n = Math.max(1, Math.abs(ny - y));
        for (let k = 0; k <= n; k++) {
          const px = Math.round(x + ((nx - x) * k) / n), py = Math.round(y + ((ny - y) * k) / n);
          if (py < 0 || py >= SKYH) continue;
          for (let d = -1; d <= 1; d++) {
            const i = py * SKYW + ((px + d) & SKYM);
            BOLT[i] = Math.max(BOLT[i], d === 0 ? w : w * 0.3);
          }
        }
        x = nx;
        y = ny;
        if (depth < 2 && rnd() < 0.12) walk(x, y, w * 0.55, depth + 1);
      }
    };
    walk(rnd() * SKYW, SKYH - 2 - rnd() * 10, 255 * Math.min(1, strength), 0);
  }

  /* ============================================================ effects */
  const fx = { grain: 1, vignette: 1, chroma: 0, tint: null };
  const E = {
    time: 0,
    shakeAmt: 0, shakeT: 0, shakeDur: 0,
    flashCol: [255, 255, 255], flashT: 0, flashDur: 0,
    fadeOp: 0, fadeCol: 'rgb(0,0,0)',
    strike: -10, strikeStr: 0, boltVis: 0,
    glitchAmt: 0, glitchT: 0, autoIn: 6, autoAmt: 0, autoT: 0, invertT: 0,
  };
  function parseColor(c) {
    if (Array.isArray(c)) return c.slice(0, 3);
    if (typeof c === 'string') {
      const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (m) {
        let s = m[1];
        if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
      }
      const r = c.match(/rgba?\(([^)]+)\)/);
      if (r) return r[1].split(',').slice(0, 3).map((v) => +v);
    }
    return [255, 255, 255];
  }
  /** Lightning envelope: double flash, then decay (seconds since strike → 0..1). */
  function lightningLevel() {
    const t = E.time - E.strike;
    if (t < 0 || t > 1.4) return 0;
    let v;
    if (t < 0.07) v = 1;
    else if (t < 0.14) v = 0.25;
    else if (t < 0.24) v = 0.85;
    else v = 0.85 * Math.exp(-(t - 0.24) * 4.2);
    return v * E.strikeStr;
  }
  function updateEffects(dt) {
    E.time += dt;
    if (E.shakeT > 0) E.shakeT = Math.max(0, E.shakeT - dt);
    if (E.flashT > 0) E.flashT = Math.max(0, E.flashT - dt);
    if (E.glitchT > 0) E.glitchT = Math.max(0, E.glitchT - dt);
    if (E.autoT > 0) E.autoT = Math.max(0, E.autoT - dt);
    if (E.invertT > 0) E.invertT = Math.max(0, E.invertT - dt);
    // instability-driven glitches: rare and subtle below 4, frequent and strong at 10+
    const inst = DA.v ? DA.v('instability') : 0;
    if (inst > 0 && DA.running) {
      E.autoIn -= dt;
      if (E.autoIn <= 0) {
        const strength = clamp(inst / 12, 0.05, 1);
        E.autoAmt = strength * (0.4 + Math.random() * 0.6);
        E.autoT = 0.06 + Math.random() * (0.1 + strength * 0.35);
        if (inst >= 10 && Math.random() < 0.18) E.invertT = 0.05 + Math.random() * 0.06;
        const mean = inst < 4 ? 40 / inst : inst < 10 ? 12 / Math.sqrt(inst) : 2.2;
        E.autoIn = mean * (0.3 + Math.random() * 1.4);
      }
    }
  }

  /* ============================================================ targets */
  function makeTarget(w, h, withImage) {
    const T = { w, h };
    if (withImage) {
      T.img = new ImageData(w, h);
      T.buf = new Uint32Array(T.img.data.buffer);
    } else T.buf = new Uint32Array(w * h);
    T.b32 = new Int32Array(T.buf.buffer);
    T.depth = new Float32Array(w * h);
    T.colTop = new Int32Array(w);
    T.colBot = new Int32Array(w);
    T.colAb = new Uint8Array(w);
    T.layN = new Uint8Array(w);
    T.layD = new Float32Array(w * 4);
    T.layU = new Float32Array(w * 4);
    T.layL = new Float32Array(w * 4);
    T.layTid = new Int32Array(w * 4);
    T.laySide = new Int8Array(w * 4);
    T.laySty = new Uint8Array(w * 4); // slatted-door layers: 1 louver, 2 gap
    T.ghost = new Uint8Array(w);
    T.ghD = new Float32Array(w);
    T.ghU = new Float32Array(w);
    T.ghL = new Float32Array(w);
    T.ghA = new Float32Array(w);
    T.ghTid = new Int32Array(w);
    T.ghSide = new Int8Array(w);
    T.rowDist = new Float32Array(h);
    T.rowA = new Float32Array(h);
    T.rowFl = new Float32Array(h);
    T.rowK = new Float32Array(h); // 1 - fog
    T.rowFR = new Int32Array(h);
    T.rowFG = new Int32Array(h);
    T.rowFB = new Int32Array(h);
    T.skyV = new Int32Array(h);
    T.skyE = new Float32Array(h);
    T.colR = new Float32Array(w);
    T.colTower = new Uint8Array(w);
    T.skyBR = new Int32Array(h); T.skyBG = new Int32Array(h); T.skyBB = new Int32Array(h);
    T.skyCR = new Int32Array(h); T.skyCG = new Int32Array(h); T.skyCB = new Int32Array(h);
    T.voidRow = new Float32Array(h);
    T.colU = new Int32Array(w);
    T.cone = null;
    T.coneI = null;
    T.lf = new Float32Array(0);
    T.lfW = 0;
    T.floorFix = new Uint16Array(0);
    T.sprites = [];
    T.fog = null;
    T.drops = null;
    T.row = new Uint32Array(w);
    return T;
  }
  function coneTable(T) {
    if (T.cone) return T.cone;
    const w = T.w, h = T.h, c = new Float32Array(w * h), cx = w / 2, cy = h / 2, R = h * 0.62;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const r = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05) / R;
        const main = 1 - DA.util.smoothstep(0.32, 0.9, r);
        const hot = 0.45 * (1 - DA.util.smoothstep(0.04, 0.3, r));
        const ring = 0.08 * Math.exp(-((r - 0.62) ** 2) / 0.004);
        const spill = 0.05 * (1 - DA.util.smoothstep(0.9, 1.5, r));
        c[y * w + x] = main + hot + ring + spill;
      }
    T.coneI = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) T.coneI[i] = Math.round(c[i] * 256);
    return (T.cone = c);
  }
  /* ============================================================ textures */
  let TN = null; // DA.textures.byId
  const TA = []; // abandoned records cache by id
  let JAMB = 0, FALLBACK_WALL = 0, FACE_TEX = 0;
  function texA(id) { return TA[id] || (TA[id] = DA.textures.variantOf(id, 'abandoned')); }
  function ensureTextures() {
    if (TN) return true;
    if (!DA.textures) return false;
    DA.textures.build();
    TN = DA.textures.byId;
    JAMB = DA.textures.id('door_jamb');
    FALLBACK_WALL = DA.textures.id('wall_paint');
    FACE_TEX = DA.textures.id('spr_entity_face');
    return true;
  }
  const glassBoxes = new WeakMap();
  /** Bounding box of a texture's glass mask (for mapping the window figure). */
  function glassBox(rec) {
    let b = glassBoxes.get(rec);
    if (b) return b;
    let x0 = 64, y0 = 64, x1 = 0, y1 = 0;
    for (let i = 0; i < rec.mask.length; i++)
      if (rec.mask[i] === 1) {
        const x = i & 63, y = i >> 6;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    b = { x0, y0, sx: 64 / Math.max(1, x1 - x0 + 1), sy: 64 / Math.max(1, y1 - y0 + 1) };
    glassBoxes.set(rec, b);
    return b;
  }
  /**
   * See-through variant of a door texture for doors with `slats` (world door record): 'louver' cuts
   * thin horizontal slits through the panels (the supply cupboard: from inside you see the room in
   * strips of light), 'gap' opens the bottom and top edge (a toilet stall partition). The door is then
   * drawn as a see-through layer and the ray continues into the room behind it.
   */
  const slatCache = new WeakMap();
  function slatRec(rec, style) {
    if (!rec) return rec;
    let per = slatCache.get(rec);
    if (!per) { per = {}; slatCache.set(rec, per); }
    if (per[style]) return per[style];
    const open = (x, y) => {
      if (style === 'gap') return y >= 52 || y <= 2;
      // louvres: two panels (rows 8..28 and 34..55), slit every 4th row, stiles left/right
      if (x < 11 || x > 52) return false;
      if (!((y >= 9 && y <= 27) || (y >= 35 && y <= 54))) return false;
      return (y & 3) === 1;
    };
    const cut = (src) => {
      const px = new Uint32Array(src);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (open(x, y)) px[(y << 6) | x] = 0;
      return px;
    };
    const frames = (rec.frames && rec.frames.length ? rec.frames : [rec.px]).map(cut);
    const out = Object.assign({}, rec, {
      px: frames[0], frames, mask: null, seeThrough: true,
      flags: Object.assign({}, rec.flags, { backed: false, alpha: true, window: false }),
    });
    per[style] = out;
    return out;
  }
  const altCache = new WeakMap();
  /**
   * Split map.alt (+ optional map.altFace) into cell and face lookups (key rules in the header).
   * Re-split whenever the entries change (cheap signature over the few entries).
   */
  function altMaps(map) {
    const alt = map.alt, af = map.altFace;
    if ((!alt || !alt.size) && (!af || !af.size)) return null;
    let sig = 0;
    if (alt) for (const [k, v] of alt) sig = (Math.imul(sig, 31) + (+k) * 7 + (typeof v === 'number' ? v : v.length)) | 0;
    if (af) for (const [k, v] of af) sig = (Math.imul(sig, 37) + (+k) * 5 + (typeof v === 'number' ? v : v.length)) | 0;
    let c = altCache.get(map);
    if (c && c.sig === sig) return c;
    const cell = new Map(), face = new Map(), n = map.w * map.h;
    const tex = (v) => (typeof v === 'string' ? DA.textures.id(v) : v);
    if (alt)
      for (const [k0, v] of alt) {
        const k = +k0;
        if (af) cell.set(k, tex(v)); // altFace supplied: `alt` holds cell keys only
        else if (k >= n) face.set(k, tex(v));
        else if (map.wall[k] > 0) cell.set(k, tex(v));
        else face.set(k, tex(v));
      }
    if (af) for (const [k, v] of af) face.set(+k, tex(v));
    c = { cell, face, sig };
    altCache.set(map, c);
    return c;
  }

  /* ============================================================ light field */
  /**
   * Smoothed per-cell light with a 1-cell border: wall cells take the average of their open
   * neighbours so light never smears dark against walls; daylight and lightning feed outdoor
   * cells. Sampled bilinearly around cell centres (see sampleLF).
   */
  function buildLightField(T, map, V) {
    const mw = map.w, mh = map.h, LW = mw + 2, LH = mh + 2, n = mw * mh;
    if (T.lf.length !== LW * LH) T.lf = new Float32Array(LW * LH);
    if (!T.tmpL || T.tmpL.length !== n) { T.tmpL = new Float32Array(n); T.open = new Uint8Array(n); T.floorFix = new Uint16Array(n); }
    T.lfW = LW;
    const lf = T.lf, tmp = T.tmpL, open = T.open, ff = T.floorFix;
    const wall = map.wall, ceil = map.ceil, floor = map.floor, door = map.door, light = V.lightArr;
    const skyOn = V.skyOn, minL = V.minLight;
    for (let i = 0; i < n; i++) {
      const isWall = wall[i] > 0 && !(door && door[i] >= 0);
      let L = light ? light[i] : 1;
      if (!isWall) {
        if (skyOn && ceil[i] === 0) L = Math.max(L, V.dayOut) + V.lightningOut;
        else L = Math.max(L, V.dayIn);
        if (L < minL) L = minL;
      }
      tmp[i] = L * V.lightScale;
      open[i] = isWall ? 0 : 1;
      ff[i] = floor[i];
    }
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x;
        let L = tmp[i];
        if (!open[i]) {
          let s = 0, k = 0, fl = 0;
          if (x > 0 && open[i - 1]) { s += tmp[i - 1]; k++; fl = fl || floor[i - 1]; }
          if (x < mw - 1 && open[i + 1]) { s += tmp[i + 1]; k++; fl = fl || floor[i + 1]; }
          if (y > 0 && open[i - mw]) { s += tmp[i - mw]; k++; fl = fl || floor[i - mw]; }
          if (y < mh - 1 && open[i + mw]) { s += tmp[i + mw]; k++; fl = fl || floor[i + mw]; }
          if (k) L = s / k;
          if (!ff[i]) ff[i] = fl;
        }
        lf[(y + 1) * LW + x + 1] = L;
      }
    for (let x = 0; x < LW; x++) { lf[x] = lf[LW + x]; lf[(LH - 1) * LW + x] = lf[(LH - 2) * LW + x]; }
    for (let y = 0; y < LH; y++) { lf[y * LW] = lf[y * LW + 1]; lf[y * LW + LW - 1] = lf[y * LW + LW - 2]; }
  }
  function sampleLF(T, wx, wy) {
    const LW = T.lfW, lf = T.lf;
    const LH = lf.length / LW;
    let gx = wx + 0.5, gy = wy + 0.5;
    if (gx < 0) gx = 0; else if (gx > LW - 1.001) gx = LW - 1.001;
    if (gy < 0) gy = 0; else if (gy > LH - 1.001) gy = LH - 1.001;
    const ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i0 = iy * LW + ix;
    const a = lf[i0], b = lf[i0 + 1], c = lf[i0 + LW], d = lf[i0 + LW + 1];
    const t = a + (b - a) * fx;
    return t + (c + (d - c) * fx - t) * fy;
  }

  /* ============================================================ scene render */
  // Clamp LUT: CL[v + CLO] = clamp(v, 0, 255) — branch-free channel clamping in hot loops.
  const CLO = 2048;
  const CL = new Uint8Array(8192);
  for (let i = 0; i < 8192; i++) CL[i] = clamp(i - CLO, 0, 255);
  const OPAQUE = -16777216; // 0xff000000 as int32
  // Slice parameters (passed through an object to keep drawSlice's signature short).
  const S = {
    rec: null, frame: 0, u: 0, dist: 0, L: 0, back: null, ci: 0, side: 0, behindL: 0, fig: 0, layer: false, ghost: false, ghostA: 0.5, x: 0, emis: 1, lookIn: false,
  };
  /** Emissive level for a wall/door texture id: map.emisTex override (device on its own supply) or the map-wide level. */
  function emisFor(V, tid) {
    if (V.emisTex !== null) { const e = V.emisTex.get(tid); if (e !== undefined) return e; }
    return V.emis;
  }

  /** Fill the per-row distance, attenuation, fog, flashlight and sky tables. */
  function prepareRows(T, V) {
    const h = T.h, horizon = V.horizon, proj = V.proj;
    const fogR = V.fogR, fogG = V.fogG, fogB = V.fogB, den = V.fogDen, att = V.att, fl = V.flash;
    for (let y = 0; y < h; y++) {
      const dy = y + 0.5 - horizon;
      let d;
      if (dy > 0) d = (V.eye * proj) / dy;
      else if (dy < 0) d = ((V.wallH - V.eye) * proj) / -dy;
      else d = 1e6;
      if (d > 1e6) d = 1e6;
      T.rowDist[y] = d;
      const f = 1 - Math.exp(-d * den);
      const k = 1 - f;
      T.rowK[y] = k;
      T.rowA[y] = (256 * k) / (1 + att * d * d);
      T.rowFR[y] = (fogR * f) | 0;
      T.rowFG[y] = (fogG * f) | 0;
      T.rowFB[y] = (fogB * f) | 0;
      T.rowFl[y] = fl > 0 ? flashFall(d) * k * 256 * fl : 0;
      T.voidRow[y] = 0.07 + 0.42 * f;
      // sky: elevation → panorama row, per-row base/cloud colours
      const e = dy < 0 ? Math.atan(-dy / proj) : 0;
      const v = clamp(((e / 1.05) * SKYH) | 0, 0, SKYH - 1);
      T.skyV[y] = v;
      T.skyE[y] = dy < 0 ? e : -1;
      const t = v / (SKYH - 1);
      T.skyBR[y] = clamp(V.skyLoR + (V.skyHiR - V.skyLoR) * t, 0, 255) | 0;
      T.skyBG[y] = clamp(V.skyLoG + (V.skyHiG - V.skyLoG) * t, 0, 255) | 0;
      T.skyBB[y] = clamp(V.skyLoB + (V.skyHiB - V.skyLoB) * t, 0, 255) | 0;
      T.skyCR[y] = clamp(V.cloLoR + (V.cloHiR - V.cloLoR) * t, 0, 255) | 0;
      T.skyCG[y] = clamp(V.cloLoG + (V.cloHiG - V.cloLoG) * t, 0, 255) | 0;
      T.skyCB[y] = clamp(V.cloLoB + (V.cloHiB - V.cloLoB) * t, 0, 255) | 0;
    }
  }
  function flashFall(d) {
    return d >= 8 ? 0 : (1.7 / (1 + 0.1 * d * d)) * (1 - d / 8);
  }

  /** Sky colour for screen pixel (x, y) as an int32 pixel. */
  function skyPixel(T, V, x, y) {
    const v = T.skyV[y], u = T.colU[x];
    const e = T.skyE[y], re = T.colR[x];
    if (e < re) return T.colTower[x] && V.towerOn && e > re - 0.006 ? V.towerPx : V.ridgePx;
    const o = v * SKYW;
    const d = (SKY1[o + ((u + V.drift1) & SKYM)] + SKY2[o + ((u + V.drift2) & SKYM)]) >> 1;
    let r = T.skyBR[y] + (((T.skyCR[y] - T.skyBR[y]) * d) >> 8);
    let g = T.skyBG[y] + (((T.skyCG[y] - T.skyBG[y]) * d) >> 8);
    let b = T.skyBB[y] + (((T.skyCB[y] - T.skyBB[y]) * d) >> 8);
    if (V.boltVis > 0) {
      const bv = (BOLT[o + (u & SKYM)] * V.boltVis) | 0;
      if (bv > 0) { r += bv; g += bv; b += bv; }
    }
    return OPAQUE | (CL[b + CLO] << 16) | (CL[g + CLO] << 8) | CL[r + CLO];
  }

  /**
   * Draw one wall slice (opaque wall, door, see-through layer or ghost) into column S.x.
   * Plain textures take a tight fast path; the general path handles backed/transparent texels,
   * emissive, window glass, live-sky masks and ghost dithering.
   */
  function drawSlice(T, V, y0, y1, top, lineH) {
    const w = T.w, b32 = T.b32, depth = T.depth, x = S.x;
    const rec = S.rec;
    const px = rec.frames[S.frame] || rec.px;
    const em = (rec.ems ? rec.ems[S.frame] || rec.em : null) || null;
    const mask = rec.mask || null;
    const back = S.back ? S.back.px : null;
    const dist = S.dist;
    const f = 1 - Math.exp(-dist * V.fogDen), k = 1 - f;
    const A = ((256 * k) / (1 + V.att * dist * dist)) * S.L * (S.side ? 0.86 : 1);
    const lr0 = A * V.tr, lg0 = A * V.tg, lb0 = A * V.tb;
    const fr = ((V.fogR * f) | 0) + CLO, fg = ((V.fogG * f) | 0) + CLO, fb = ((V.fogB * f) | 0) + CLO;
    const flK = V.flash > 0 ? flashFall(dist) * k * 256 * V.flash * (S.side ? 0.9 : 1) : 0;
    const cone = flK > 0 ? T.cone : null;
    const tx = ((S.u * 64) | 0) & 63;
    const tStep = 64 / lineH;
    let tPos = (y0 + 0.5 - top) * tStep;
    const layer = S.layer, ghost = S.ghost, ghostA = S.ghostA * 255;
    if (!mask && !em && !back && !layer && !ghost && !rec.flags.backed) {
      // ---- fast path
      let p = y0 * w + x;
      if (!cone) {
        const lr = lr0 | 0, lg = lg0 | 0, lb = lb0 | 0;
        for (let y = y0; y < y1; y++, tPos += tStep, p += w) {
          const t = px[(((tPos | 0) & 63) << 6) | tx];
          b32[p] = OPAQUE | (CL[((((t >>> 16) & 255) * lb) >> 8) + fb] << 16) | (CL[((((t >>> 8) & 255) * lg) >> 8) + fg] << 8) | CL[(((t & 255) * lr) >> 8) + fr];
          depth[p] = dist;
        }
      } else {
        const coneI = T.coneI, fk = flK | 0, lr1 = lr0 | 0, lg1 = lg0 | 0, lb1 = lb0 | 0;
        for (let y = y0; y < y1; y++, tPos += tStep, p += w) {
          const t = px[(((tPos | 0) & 63) << 6) | tx];
          const F = (fk * coneI[p]) >> 8;
          const lr = lr1 + F, lg = lg1 + ((F * 240) >> 8), lb = lb1 + ((F * 205) >> 8);
          b32[p] = OPAQUE | (CL[((((t >>> 16) & 255) * lb) >> 8) + fb] << 16) | (CL[((((t >>> 8) & 255) * lg) >> 8) + fg] << 8) | CL[(((t & 255) * lr) >> 8) + fr];
          depth[p] = dist;
        }
      }
      return;
    }
    // ---- general path
    const emI = ((S.emis * k * 256 * 256) / 255) | 0;
    const ilr = lr0 | 0, ilg = lg0 | 0, ilb = lb0 | 0, fk = flK | 0;
    const coneI = cone !== null ? T.coneI : null;
    let gR = 0, gG = 0, gB = 0, rainK = 0, fig = null, fb0 = null;
    if (mask && rec.flags.window) {
      const out = V.glassOut, d = V.daylight;
      // looking OUT: the outside (sky light, the lot lamp) through the glass, never clipped white by
      // day. Looking IN from outside: mostly the sky's reflection; a lit room glows through at night,
      // an unlit interior reads dark against a daylit facade (2049).
      const refl = S.lookIn ? 0.5 : 1;
      const glow = S.behindL * 0.85 * (S.lookIn ? 1 - 0.8 * d : 1 - 0.75 * d), sheen = S.L * 26;
      gR = (out[0] * refl + glow * 255 + sheen) * k;
      gG = (out[1] * refl + glow * 214 + sheen * 1.05) * k;
      gB = (out[2] * refl + glow * 150 + sheen * 1.2) * k;
      rainK = (0.12 + 0.5 * S.L + V.lightning * 1.2 + V.daylight * 0.35) * k * V.glassRain;
      if (S.fig > 0) { fig = TN[FACE_TEX]; fb0 = glassBox(rec); }
    }
    const rainOff = V.rainOff;
    const figA = S.fig;
    for (let y = y0; y < y1; y++, tPos += tStep) {
      const p = y * w + x;
      if (layer && depth[p] <= dist) continue;
      const ty = (tPos | 0) & 63;
      const ti = (ty << 6) | tx;
      let t = px[ti];
      if (t >>> 24 < 128) {
        if (layer || ghost) continue;
        if (back) t = back[ti];
      }
      if (ghost && ghostA <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
      let lr = ilr, lg = ilg, lb = ilb;
      if (coneI !== null) { const F = (fk * coneI[p]) >> 8; lr += F; lg += (F * 240) >> 8; lb += (F * 205) >> 8; }
      if (mask !== null) {
        const m = mask[ti];
        if (m === 2) { b32[p] = skyPixel(T, V, x, y); depth[p] = dist; continue; }
        if (m === 1) {
          const rv = (RAIN[(((ty + rainOff) & 127) << 6) | tx] + BEADS[ti]) * rainK;
          let r = ((t & 255) * lr) / 700 + gR + rv;
          let g = (((t >>> 8) & 255) * lg) / 700 + gG + rv;
          let b = (((t >>> 16) & 255) * lb) / 700 + gB + rv * 1.1;
          if (fig) {
            const fxp = ((tx - fb0.x0) * fb0.sx) | 0, fyp = ((ty - fb0.y0) * fb0.sy) | 0;
            if (fxp >= 0 && fxp < 64 && fyp >= 0 && fyp < 64) {
              const c = fig.px[(fyp << 6) | fxp];
              const a = (c >>> 24) * figA;
              if (a > BAYER[((y & 3) << 2) | (x & 3)]) {
                const lit = (0.45 + S.L * 0.9 + V.lightning * 1.5) * k;
                r = (c & 255) * lit; g = ((c >>> 8) & 255) * lit; b = ((c >>> 16) & 255) * lit;
              }
            }
          }
          b32[p] = OPAQUE | (CL[(b | 0) + fb] << 16) | (CL[(g | 0) + fg] << 8) | CL[(r | 0) + fr];
          depth[p] = dist;
          continue;
        }
      }
      if (em !== null) {
        const e = em[ti];
        if (e !== 0) {
          const ev = (e * emI) >> 8;
          if (lr < ev) lr = ev;
          if (lg < ev) lg = ev;
          if (lb < ev) lb = ev;
        }
      }
      b32[p] = OPAQUE | (CL[((((t >>> 16) & 255) * lb) >> 8) + fb] << 16) | (CL[((((t >>> 8) & 255) * lg) >> 8) + fg] << 8) | CL[(((t & 255) * lr) >> 8) + fr];
      if (!ghost) depth[p] = dist;
    }
  }

  /**
   * Floor + ceiling casting, row by row (world position steps linearly across a row). A pixel
   * is drawn when it is above its column's wall top (ceiling) or below its wall bottom (floor).
   */
  function drawPlanes(T, V) {
    const w = T.w, h = T.h, b32 = T.b32, depth = T.depth;
    const map = V.map, mw = map.w, mh = map.h, ceilA = map.ceil;
    const ff = T.floorFix, lf = T.lf, LW = T.lfW;
    const colTop = T.colTop, colBot = T.colBot, colAb = T.colAb, colU = T.colU;
    const coneI = V.flash > 0 ? T.coneI : null;
    const emK = (V.emis * 256) / 255;
    const cellEm = V.cellEm; // per-cell panel emissive (-1 = map-wide level)
    const skyOn = V.skyOn;
    const hs = V.hstart;
    const tr = V.tr, tg = V.tg, tb = V.tb;
    const rdx0 = V.rdx0, rdy0 = V.rdy0, drx = V.drx, dry = V.dry;
    const mistR = V.mistR, mistG = V.mistG, mistB = V.mistB, mistT = V.mistT;
    const mR = mistR | 0, mG = mistG | 0, mB = mistB | 0;
    const d1 = V.drift1, d2 = V.drift2, bolt = V.boltVis > 0 ? V.boltVis : 0;
    const ridgePx = V.ridgePx, towerPx = V.towerPx, towerOn = V.towerOn, colR = T.colR, colTower = T.colTower;
    for (let y = 0; y < h; y++) {
      const ceilRow = y < hs;
      const plane = ceilRow ? ceilA : ff;
      const rd = T.rowDist[y];
      const A = T.rowA[y], Fr = T.rowFl[y];
      const Atr = A * tr, Atg = A * tg, Atb = A * tb;
      const fr = T.rowFR[y] + CLO, fg = T.rowFG[y] + CLO, fb = T.rowFB[y] + CLO;
      const rowK = T.rowK[y], vk = T.voidRow[y];
      // sky row constants
      const sv = T.skyV[y], so = sv * SKYW, se = T.skyE[y];
      const sbR = T.skyBR[y], sbG = T.skyBG[y], sbB = T.skyBB[y];
      const sdR = T.skyCR[y] - sbR, sdG = T.skyCG[y] - sbG, sdB = T.skyCB[y] - sbB;
      const sx = rd * drx, sy = rd * dry;
      let wx = V.px + rd * rdx0, wy = V.py + rd * rdy0;
      let lastId = -1, lastAb = -1, tpx = null, tem = null;
      let L = 0, lx = -9; // light is sampled every second pixel (it varies slowly)
      let vMul = 256, vx = -9; // void haze: lamps light the mist (the lit shaft under the array's antenna)
      let ilr = 0, ilg = 0, ilb = 0;
      const FrI = Fr | 0, emR = (emK * rowK * 256) | 0, emR1 = ((256 / 255) * rowK * 256) | 0;
      const vb = (vk * 0.35 * 256) | 0, vs = ((vk * 256 * 256) / 400) | 0;
      let p = y * w;
      if (rd < 1500) {
        // ---- fixed-point (16.16) stepping: no float→int conversions per pixel
        let fx = Math.round(wx * 65536), fy = Math.round(wy * 65536);
        const fsx = Math.round(sx * 65536), fsy = Math.round(sy * 65536);
        const mwF = mw * 65536, mhF = mh * 65536;
        for (let x = 0; x < w; x++, fx += fsx, fy += fsy, p++) {
          if (ceilRow ? y >= colTop[x] : y < colBot[x]) continue;
          let id = 0, ci = -1;
          if (fx >= 0 && fy >= 0 && fx < mwF && fy < mhF) {
            ci = (fy >> 16) * mw + (fx >> 16);
            id = plane[ci];
          }
          if (id === 0) {
            depth[p] = Infinity;
            if (ceilRow && skyOn && (ci < 0 || ceilA[ci] === 0)) {
              const u = colU[x];
              if (se < colR[x]) { b32[p] = colTower[x] && towerOn && se > colR[x] - 0.006 ? towerPx : ridgePx; continue; }
              const dn = (SKY1[so + ((u + d1) & SKYM)] + SKY2[so + ((u + d2) & SKYM)]) >> 1;
              let r = sbR + ((sdR * dn) >> 8), g = sbG + ((sdG * dn) >> 8), b = sbB + ((sdB * dn) >> 8);
              if (bolt) { const bv = (BOLT[so + u] * bolt) | 0; r = CL[r + bv + CLO]; g = CL[g + bv + CLO]; b = CL[b + bv + CLO]; }
              b32[p] = OPAQUE | (b << 16) | (g << 8) | r;
              continue;
            }
            let kI = vb + ((MIST[((((fy * 9) >> 16) + mistT) & 255) << 8 | (((fx * 9) >> 16) & 255)] * vs) >> 8);
            if (ci >= 0) {
              if (x - vx > 1) {
                const gx = fx + 32768, gy = fy + 32768, i0 = (gy >> 16) * LW + (gx >> 16);
                const ax = (gx & 65535) * (1 / 65536), ay = (gy & 65535) * (1 / 65536);
                const a0 = lf[i0], tp = a0 + (lf[i0 + 1] - a0) * ax, c0 = lf[i0 + LW];
                const vl = tp + (c0 + (lf[i0 + LW + 1] - c0) * ax - tp) * ay;
                vMul = (179 + 190 * (vl > 1.2 ? 1.2 : vl)) | 0; // 0.7 + 0.74·L
                vx = x;
              }
              kI = (kI * vMul) >> 8;
            }
            b32[p] = OPAQUE | (CL[((mB * kI) >> 8) + CLO] << 16) | (CL[((mG * kI) >> 8) + CLO] << 8) | CL[((mR * kI) >> 8) + CLO];
            continue;
          }
          const ab = colAb[x];
          if (id !== lastId || ab !== lastAb) {
            const rec = (ab ? TA[id] || texA(id) : TN[id]) || TN[1];
            tpx = rec.px;
            tem = rec.em;
            lastId = id;
            lastAb = ab;
          }
          const ti = (((fy >> 10) & 63) << 6) | ((fx >> 10) & 63);
          const t = tpx[ti];
          if (x - lx > 1) {
            const gx = fx + 32768, gy = fy + 32768;
            const i0 = (gy >> 16) * LW + (gx >> 16);
            const ax = (gx & 65535) * (1 / 65536), ay = (gy & 65535) * (1 / 65536);
            const a0 = lf[i0], top = a0 + (lf[i0 + 1] - a0) * ax;
            const c0 = lf[i0 + LW];
            L = top + (c0 + (lf[i0 + LW + 1] - c0) * ax - top) * ay;
            ilr = (L * Atr) | 0;
            ilg = (L * Atg) | 0;
            ilb = (L * Atb) | 0;
            lx = x;
          }
          let lr = ilr, lg = ilg, lb = ilb;
          if (coneI !== null) { const F = (FrI * coneI[p]) >> 8; lr += F; lg += (F * 240) >> 8; lb += (F * 205) >> 8; }
          if (tem !== null && tem[ti] !== 0) {
            let ev;
            if (cellEm !== null && cellEm[ci] >= 0) ev = (tem[ti] * ((cellEm[ci] * emR1) | 0)) >> 8;
            else ev = (tem[ti] * emR) >> 8;
            if (lr < ev) lr = ev;
            if (lg < ev) lg = ev;
            if (lb < ev) lb = ev;
          }
          b32[p] = OPAQUE | (CL[((((t >>> 16) & 255) * lb) >> 8) + fb] << 16) | (CL[((((t >>> 8) & 255) * lg) >> 8) + fg] << 8) | CL[(((t & 255) * lr) >> 8) + fr];
          depth[p] = rd;
        }
        continue;
      }
      // ---- far rows at the horizon (huge distances): float stepping, sky/void/fog only matter
      for (let x = 0; x < w; x++, wx += sx, wy += sy, p++) {
        if (ceilRow ? y >= colTop[x] : y < colBot[x]) continue;
        let id = 0, ci = -1;
        if (wx >= 0 && wy >= 0 && wx < mw && wy < mh) {
          ci = (wy | 0) * mw + (wx | 0);
          id = plane[ci];
        }
        depth[p] = id ? rd : Infinity;
        if (id === 0 && ceilRow && skyOn && (ci < 0 || ceilA[ci] === 0)) {
          const u = colU[x];
          if (se < colR[x]) { b32[p] = ridgePx; continue; }
          const dn = (SKY1[so + ((u + d1) & SKYM)] + SKY2[so + ((u + d2) & SKYM)]) >> 1;
          b32[p] = OPAQUE | ((sbB + ((sdB * dn) >> 8)) << 16) | ((sbG + ((sdG * dn) >> 8)) << 8) | (sbR + ((sdR * dn) >> 8));
        } else b32[p] = OPAQUE | ((fb - CLO) << 16) | ((fg - CLO) << 8) | (fr - CLO);
      }
    }
  }

  /**
   * Cast one ray. Fills HIT with the nearest opaque surface and (optionally) the see-through
   * layers in front of it into the target's per-column layer arrays. Returns true on a hit.
   */
  const HIT = { dist: Infinity, tid: 0, u: 0, side: 0, ci: -1, face: 0, mapX: 0, mapY: 0, stepX: 0, stepY: 0, door: false, nL: 0 };
  function castRay(V, T, col, ox, oy, rdx, rdy, ab) {
    const map = V.map, mw = map.w, mh = map.h, wall = map.wall, doorA = map.door, doors = map.doors;
    const faces = V.faces, alt = ab ? V.alt : null;
    let mapX = Math.floor(ox), mapY = Math.floor(oy);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX, stepY, sdx, sdy;
    if (rdx < 0) { stepX = -1; sdx = (ox - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - ox) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (oy - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - oy) * ddy; }
    HIT.dist = Infinity;
    HIT.nL = 0;
    HIT.door = false;
    HIT.stepX = stepX;
    HIT.stepY = stepY;
    let inside = mapX >= 0 && mapY >= 0 && mapX < mw && mapY < mh;
    let ci = inside ? mapY * mw + mapX : -1, prevCi = -1, enter = 0, side = 0;
    const maxSteps = mw + mh + 8, maxDist = V.maxDist;
    for (let n = 0; n < maxSteps; n++) {
      // thin sliding door in the current cell
      if (ci >= 0 && doorA && doorA[ci] >= 0) {
        const d = doors[doorA[ci]];
        if (d && d.open < 0.999) {
          const exit = sdx < sdy ? sdx : sdy;
          let t = -1, u = 0;
          if (d.axis === 'v') { if (rdx !== 0) { t = (mapX + 0.5 - ox) / rdx; u = oy + t * rdy - mapY; } }
          else if (rdy !== 0) { t = (mapY + 0.5 - oy) / rdy; u = ox + t * rdx - mapX; }
          const open = d.open > 0 ? d.open : 0;
          if (t >= enter && t < exit && u >= 0 && u < 1 - open) {
            let tu = u + open;
            if (d.axis === 'v' ? rdx < 0 : rdy > 0) tu = 1 - tu;
            if (d.slats) {
              // slatted door: a see-through layer (negative tid = slat variant), the ray goes on
              if (T && HIT.nL < LAYER_MAX) {
                const k = col * LAYER_MAX + HIT.nL++;
                T.layD[k] = t; T.layU[k] = tu; T.laySide[k] = d.axis === 'v' ? 0 : 1;
                T.layTid[k] = -(typeof d.tex === 'number' ? d.tex : DA.textures.id(d.tex || 'door_wood'));
                T.laySty[k] = d.slats === 'gap' ? 2 : 1;
                T.layL[k] = sampleLF(T, ox + t * rdx, oy + t * rdy);
              }
            } else {
            HIT.dist = t;
            HIT.tid = typeof d.tex === 'number' ? d.tex : DA.textures.id(d.tex || 'door_wood');
            HIT.u = tu;
            HIT.side = d.axis === 'v' ? 0 : 1;
            HIT.ci = ci;
            HIT.face = -1;
            HIT.mapX = mapX;
            HIT.mapY = mapY;
            HIT.door = true;
            return true;
            }
          }
        }
      }
      if (sdx < sdy) { enter = sdx; sdx += ddx; mapX += stepX; side = 0; }
      else { enter = sdy; sdy += ddy; mapY += stepY; side = 1; }
      if (enter > maxDist) return false;
      if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) {
        if (inside) return false;
        continue; // camera outside the map: keep marching toward it
      }
      inside = true;
      prevCi = ci;
      ci = mapY * mw + mapX;
      if (doorA && doorA[ci] >= 0) continue;
      const wv = wall[ci];
      if (!wv) continue;
      const face = side === 0 ? (stepX > 0 ? 3 : 1) : stepY > 0 ? 0 : 2;
      let tid = 0;
      if (alt) tid = alt.face.get(ci * 4 + face) || alt.cell.get(ci) || 0;
      if (!tid) { const fa = faces[face]; if (fa) tid = fa[ci]; }
      if (!tid && prevCi >= 0 && doorA && doorA[prevCi] >= 0) {
        const d = doors[doorA[prevCi]];
        if (d && (d.axis === 'v' ? side === 1 : side === 0)) tid = JAMB;
      }
      if (!tid) tid = wv;
      let u = side === 0 ? oy + enter * rdy : ox + enter * rdx;
      u -= Math.floor(u);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) u = 1 - u;
      const rec = TN[tid];
      if (rec && rec.seeThrough) {
        if (T && HIT.nL < LAYER_MAX) {
          const k = col * LAYER_MAX + HIT.nL++;
          T.layD[k] = enter; T.layU[k] = u; T.layTid[k] = tid; T.laySide[k] = side;
          T.layL[k] = sampleLF(T, ox + enter * rdx - (side === 0 ? stepX * 0.04 : 0), oy + enter * rdy - (side === 1 ? stepY * 0.04 : 0));
        }
        continue;
      }
      HIT.dist = enter;
      HIT.tid = tid;
      HIT.u = u;
      HIT.side = side;
      HIT.ci = ci;
      HIT.face = face;
      HIT.mapX = mapX;
      HIT.mapY = mapY;
      return true;
    }
    return false;
  }
  const LAYER_MAX = 4;

  /**
   * Backing texture for a backed wall texture: the neighbouring wall's face on the same side
   * (so a window or panel picks up the local surface: interior paint inside, concrete outside),
   * else the cell's base wall, else wall_paint.
   */
  function backingFor(V, ci, face, side, tid, ab) {
    const map = V.map, wall = map.wall, mw = map.w;
    const pick = (id) => {
      if (!id || id === tid) return null;
      const r = ab ? texA(id) : TN[id];
      return r && !r.flags.backed && !r.seeThrough ? r : null;
    };
    const fa = V.faces[face];
    const x = ci % mw, y = (ci / mw) | 0;
    let r;
    for (let k = 0; k < 4; k++) {
      const o = k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -2 : 2;
      const nx = side === 0 ? x : x + o, ny = side === 0 ? y + o : y;
      if (nx < 0 || ny < 0 || nx >= mw || ny >= map.h) continue;
      const n = ny * mw + nx;
      if (!wall[n]) continue;
      r = pick((fa && fa[n]) || wall[n]);
      if (r) return r;
    }
    r = pick(wall[ci]);
    if (r) return r;
    return ab ? texA(FALLBACK_WALL) : TN[FALLBACK_WALL];
  }

  /** Is this ray drawn from the abandoned timeline? (blend collapse: slowly drifting bands) */
  let BC_band = 0;
  function blendColumn(V, ang) {
    const a = ((ang % TAU) + TAU) % TAU;
    const f = a * 26; // ~26 bands per radian (≈15 px at 66° fov)
    const band = Math.floor(f + 0.45 * Math.sin(a * 17 + V.time * 0.05));
    const h1 = hh(band, 3, 11), h2v = hh(band, 5, 13);
    const thr = 0.5 + 0.5 * Math.sin(V.time * (0.04 + h1 * 0.09) + h2v * TAU);
    BC_band = band;
    return thr * 0.9 + h1 * 0.1 < V.blend;
  }

  function sliceGeom(V, dist) {
    const lineH = V.proj / dist;
    const top = V.horizon - (V.wallH - V.eye) * lineH, bot = V.horizon + V.eye * lineH;
    SG.lineH = lineH;
    SG.top = top;
    SG.y0 = clamp(Math.ceil(top - 0.5), 0, V.h);
    SG.y1 = clamp(Math.ceil(bot - 0.5), 0, V.h);
  }
  const SG = { lineH: 0, top: 0, y0: 0, y1: 0 };

  /**
   * Render map `map` from camera `cam` into target T. o: {variant, blend, daylight, flashlight,
   * lightScale, sprites, providers, mapId, fog…}
   */
  function renderScene(T, cam, map, o) {
    const w = T.w, h = T.h;
    const time = o.time != null ? o.time : E.time;
    const wallH = map.wallHeight || 1;
    const fovDeg = cam.fov || DA.settings.fov || 66;
    const planeLen = Math.tan((fovDeg * Math.PI) / 360);
    const ang = (cam.angle || 0) + (o.shakeA || 0);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const proj = w / 2 / planeLen;
    const pitch = clamp(cam.pitch || 0, -0.7, 0.7);
    const horizon = h / 2 + Math.tan(pitch) * proj + (o.shakeY || 0) * (h / 270);
    const bob = DA.settings.headBob === false ? 0 : cam.bob || 0;
    const eye = clamp((cam.z != null ? cam.z : 0.5) + bob, 0.03, wallH - 0.03);
    const variant = o.variant || 'normal';
    const daylight = clamp(o.daylight || 0, 0, 1);
    const lightningLvl = o.lightning != null ? o.lightning : lightningLevel();
    const skyOn = map.sky !== false;
    const camCell = cam.x >= 0 && cam.y >= 0 && cam.x < map.w && cam.y < map.h ? (cam.y | 0) * map.w + (cam.x | 0) : -1;
    const outdoor = skyOn && (camCell < 0 || map.ceil[camCell] === 0);
    const tint = o.tint || map.tint || null;
    // fog: indoor darkness vs outdoor night haze vs grey day; smoothed on the main target
    let fogC, fogDen, att;
    if (map.fog) {
      fogC = map.fog.color || [0, 0, 0];
      fogDen = map.fog.density != null ? map.fog.density : 0.04;
      att = map.fog.att != null ? map.fog.att : 0.02;
    } else if (outdoor) {
      fogC = [12 + 110 * daylight, 14 + 112 * daylight, 18 + 116 * daylight];
      fogDen = 0.055 - daylight * 0.015;
      att = 0.004;
    } else {
      fogC = [34 * daylight, 35 * daylight, 38 * daylight];
      fogDen = 0.03;
      att = 0.02;
    }
    if (o.smoothFog) {
      if (!T.fog) T.fog = { r: fogC[0], g: fogC[1], b: fogC[2], den: fogDen, att };
      const k = clamp(o.dt * 3, 0, 1);
      T.fog.r += (fogC[0] - T.fog.r) * k; T.fog.g += (fogC[1] - T.fog.g) * k; T.fog.b += (fogC[2] - T.fog.b) * k;
      T.fog.den += (fogDen - T.fog.den) * k; T.fog.att += (att - T.fog.att) * k;
      fogC = [T.fog.r, T.fog.g, T.fog.b]; fogDen = T.fog.den; att = T.fog.att;
    }
    const flash = o.flashlight ? (typeof o.flashlight === 'number' ? o.flashlight : 1) : 0;
    // sky palette: night storm → overcast dawn/day, lit by lightning
    const d = daylight, L = lightningLvl;
    const dawn = Math.max(0, 1 - Math.abs(d - 0.45) / 0.3);
    const V = {
      map, time, w, h, px: cam.x, py: cam.y, eye, wallH, horizon, proj,
      hstart: clamp(Math.ceil(horizon - 0.5), 0, h),
      rdx0: dirX + planeX * (1 / w - 1), rdy0: dirY + planeY * (1 / w - 1), drx: (planeX * 2) / w, dry: (planeY * 2) / w,
      tr: tint ? tint[0] : 1, tg: tint ? tint[1] : 1, tb: tint ? tint[2] : 1,
      emis: o.emissive != null ? clamp(+o.emissive, 0, 1) : clamp(map.emissive != null ? map.emissive : 1, 0, 1) * (variant === 'abandoned' && map.variant !== 'abandoned' ? 0.1 : 1),
      cellEm: o.emissive != null || variant === 'abandoned' || !map.cellEmis || map.cellEmis.length !== map.w * map.h ? null : map.cellEmis,
      emisTex: o.emissive != null || variant === 'abandoned' || !map.emisTex || !map.emisTex.size ? null : map.emisTex,
      faces: [map.wallN, map.wallE, map.wallS, map.wallW],
      alt: variant === 'normal' && !(o.blend > 0) ? null : altMaps(map),
      fogR: fogC[0], fogG: fogC[1], fogB: fogC[2], fogDen, att,
      flash, daylight, lightning: L, skyOn,
      dayOut: d * 0.9, dayIn: d * 0.1 + L * 0.12, lightningOut: L * 1.7,
      lightScale: o.lightScale != null ? o.lightScale : 1,
      lightArr: o.light && o.light.length === map.w * map.h ? o.light : map.light,
      minLight: o.minLight > 0 ? +o.minLight : 0,
      maxDist: o.maxDist || 48,
      blend: variant === 'blend' ? clamp(o.blend || 0, 0, 1) : 0,
      drift1: (time * 2.2) | 0, drift2: (time * 4.1) | 0,
      boltVis: L > 0.2 ? L : 0,
      rainOff: (time * 44) | 0,
      glassRain: 0.15 + 0.85 * clamp(weatherRain(map), 0, 1), // streaks on window glass follow the weather
      mistT: (time * 3) | 0,
      mistR: 70 + d * 80, mistG: 76 + d * 80, mistB: 88 + d * 80,
      skyLoR: 24 + 126 * d + 16 * dawn + 70 * L, skyLoG: 26 + 129 * d + 9 * dawn + 74 * L, skyLoB: 33 + 130 * d + 3 * dawn + 90 * L,
      skyHiR: 7 + 100 * d + 60 * L, skyHiG: 8 + 104 * d + 62 * L, skyHiB: 12 + 110 * d + 80 * L,
      cloLoR: 64 + 114 * d + 12 * dawn + 170 * L, cloLoG: 64 + 117 * d + 7 * dawn + 175 * L, cloLoB: 70 + 120 * d + 2 * dawn + 200 * L,
      cloHiR: 30 + 104 * d + 120 * L, cloHiG: 31 + 106 * d + 125 * L, cloHiB: 37 + 110 * d + 150 * L,
      glassOut: [10 + 120 * d + 150 * L, 13 + 124 * d + 160 * L, 18 + 130 * d + 190 * L],
      figure: map.windowFigure && map.windowFigure.amount > 0 ? map.windowFigure : null,
      ridgePx: OPAQUE | (((16 + 92 * d + 60 * L) | 0) << 16) | (((13 + 90 * d + 52 * L) | 0) << 8) | ((11 + 86 * d + 48 * L) | 0),
      towerPx: OPAQUE | (20 << 16) | (30 << 8) | 210,
      towerOn: d < 0.6 && time % 2.4 < 0.9,
    };
    if (flash > 0) coneTable(T);
    buildLightField(T, map, V);
    prepareRows(T, V);
    const abAll = variant === 'abandoned';
    const figCell = V.figure ? Math.floor(V.figure.y) * map.w + Math.floor(V.figure.x) : -1;
    const figAmt = V.figure ? clamp(V.figure.amount, 0, 1) : 0;
    const colTop = T.colTop, colBot = T.colBot, colAb = T.colAb, layN = T.layN, ghost = T.ghost;
    const hs = V.hstart;

    // ---- pass 1: columns — cast, draw the opaque wall slice, remember layers/ghosts
    for (let x = 0; x < w; x++) {
      const camX = (2 * (x + 0.5)) / w - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      const rayAng = Math.atan2(rdy, rdx);
      T.colU[x] = (((rayAng / TAU) * SKYW + SKYW * 4) | 0) & SKYM;
      const ra = rayAng < 0 ? rayAng + TAU : rayAng;
      T.colR[x] = RIDGE[((ra / TAU) * RIDGEW) & (RIDGEW - 1)];
      T.colTower[x] = Math.abs(ra - TOWER_A) < 0.0035 ? 1 : 0;
      let ab = abAll, band = 0;
      if (V.blend > 0) {
        ab = blendColumn(V, rayAng);
        band = BC_band;
      }
      colAb[x] = ab ? 1 : 0;
      const hit = castRay(V, T, x, cam.x, cam.y, rdx, rdy, ab);
      layN[x] = HIT.nL;
      if (hit) {
        const dist = Math.max(0.0005, HIT.dist);
        sliceGeom(V, dist);
        colTop[x] = SG.y0;
        colBot[x] = SG.y1;
        const rec = (ab ? texA(HIT.tid) : TN[HIT.tid]) || TN[1];
        // light at the face, pulled back into the open cell
        let hx = cam.x + dist * rdx, hy = cam.y + dist * rdy;
        if (!HIT.door) { if (HIT.side === 0) hx -= HIT.stepX * 0.04; else hy -= HIT.stepY * 0.04; }
        S.x = x;
        S.rec = rec;
        S.frame = rec.frames.length > 1 ? ((time * rec.fps + HIT.ci * 0.37) | 0) % rec.frames.length : 0;
        S.u = HIT.u;
        S.dist = dist;
        S.L = sampleLF(T, hx, hy);
        S.side = HIT.side;
        S.ci = HIT.ci;
        S.layer = false;
        S.ghost = false;
        S.back = rec.flags.backed ? backingFor(V, HIT.ci, HIT.face < 0 ? 0 : HIT.face, HIT.side, HIT.tid, ab) : null;
        S.emis = rec.em || rec.ems ? emisFor(V, HIT.tid) : V.emis;
        S.behindL = 0;
        S.fig = 0;
        S.lookIn = false;
        if (rec.flags.window) {
          const bx = HIT.side === 0 ? HIT.mapX + HIT.stepX : HIT.mapX, by = HIT.side === 1 ? HIT.mapY + HIT.stepY : HIT.mapY;
          S.behindL = sampleLF(T, bx + 0.5, by + 0.5);
          // is the far side of the glass indoors (a ceiling) while we stand outside?
          const bi = bx >= 0 && by >= 0 && bx < map.w && by < map.h ? by * map.w + bx : -1;
          S.lookIn = bi >= 0 && map.ceil[bi] !== 0 && outdoor;
          if (HIT.ci === figCell) S.fig = figAmt;
        }
        drawSlice(T, V, SG.y0, SG.y1, SG.top, SG.lineH);
      } else {
        colTop[x] = hs;
        colBot[x] = hs;
      }
      // blend collapse: a ghost duplicate wall slice from a room offset sideways
      ghost[x] = 0;
      if (V.blend > 0 && hh(band, Math.floor(time * 0.35 + hh(band, 1, 2) * 7), 17) < V.blend * 0.3) {
        const off = (hh(band, 9, 5) - 0.5) * 2.4;
        const gx = cam.x - dirY * off, gy = cam.y + dirX * off;
        if (castRay(V, null, x, gx, gy, rdx, rdy, !ab) && HIT.dist > 0.2) {
          ghost[x] = 1;
          T.ghD[x] = HIT.dist;
          T.ghU[x] = HIT.u;
          T.ghTid[x] = HIT.tid;
          T.ghSide[x] = HIT.side;
          T.ghL[x] = sampleLF(T, gx + HIT.dist * rdx, gy + HIT.dist * rdy);
          T.ghA[x] = 0.25 + 0.35 * hh(band, 4, 8);
        }
      }
    }
    // ---- pass 2: floors and ceilings, row by row
    drawPlanes(T, V);
    // ---- pass 3: see-through layers (far → near) and ghost slices
    for (let x = 0; x < w; x++) {
      const ab = colAb[x] === 1;
      for (let k = layN[x] - 1; k >= 0; k--) {
        const i = x * LAYER_MAX + k;
        const dist = Math.max(0.0005, T.layD[i]);
        sliceGeom(V, dist);
        S.x = x;
        const lt = T.layTid[i];
        if (lt < 0) S.rec = slatRec(ab ? texA(-lt) : TN[-lt], T.laySty[i] === 2 ? 'gap' : 'louver');
        else S.rec = ab ? texA(lt) : TN[lt];
        if (!S.rec) continue;
        S.frame = 0;
        S.u = T.layU[i];
        S.dist = dist;
        S.L = T.layL[i];
        S.side = T.laySide[i];
        S.layer = true;
        S.ghost = false;
        S.back = null;
        S.emis = V.emis;
        S.lookIn = false;
        S.fig = 0;
        drawSlice(T, V, SG.y0, SG.y1, SG.top, SG.lineH);
      }
      if (ghost[x]) {
        sliceGeom(V, T.ghD[x]);
        S.x = x;
        S.rec = (!ab ? texA(T.ghTid[x]) : TN[T.ghTid[x]]) || TN[1];
        S.frame = 0;
        S.u = T.ghU[x];
        S.dist = T.ghD[x];
        S.L = T.ghL[x];
        S.side = T.ghSide[x];
        S.layer = false;
        S.ghost = true;
        S.ghostA = T.ghA[x];
        S.back = null;
        S.emis = V.emis;
        S.fig = 0;
        drawSlice(T, V, SG.y0, SG.y1, SG.top, SG.lineH);
      }
    }
    const ts = performance.now();
    drawSprites(T, V, cam, o, dirX, dirY, planeX, planeY, abAll);
    tSpr = performance.now() - ts;
    return V;
  }

  /* ============================================================ sprites */
  const providers = [];
  const texIdCache = new Map();
  function spriteTexId(tex) {
    if (typeof tex === 'number') return tex;
    let id = texIdCache.get(tex);
    if (!id) { id = DA.textures.id(tex); texIdCache.set(tex, id); }
    return id;
  }
  function collectSprites(T, mapId, o) {
    const list = T.sprites;
    list.length = 0;
    const push = (s) => {
      if (!s || s.tex == null || s.hidden) return;
      list.push(s);
      if (s.ghosts) for (const g of s.ghosts) if (g) list.push({ x: g.x, y: g.y, tex: s.tex, scale: s.scale, z: g.z != null ? g.z : s.z, alpha: g.alpha != null ? g.alpha : 0.5, frame: g.frame != null ? g.frame : s.frame, flip: g.flip != null ? g.flip : s.flip, fullbright: s.fullbright, variant: s.variant, emissive: g.emissive != null ? g.emissive : s.emissive });
    };
    if (o.providers !== false)
      for (const fn of providers) {
        try {
          const arr = fn(mapId, o);
          if (arr) for (let i = 0; i < arr.length; i++) push(arr[i]);
        } catch (e) {
          if (!fn._warned) { fn._warned = true; console.error('[render] sprite provider failed', e); }
        }
      }
    if (o.sprites) for (const s of o.sprites) push(s);
    return list;
  }
  const sortBuf = [];
  /**
   * Opaque vertical span of every texel column of a sprite frame (first opaque row, last + 1; an
   * empty column has top >= bot), cached per frame buffer: the column loop skips the transparent
   * runs above and below (tree tops, the air around a lamp post) instead of testing them per pixel.
   */
  const spanCache = new WeakMap();
  function spansOf(px, tw, th) {
    let sp = spanCache.get(px);
    if (sp) return sp;
    const top = new Int16Array(tw), bot = new Int16Array(tw);
    for (let x = 0; x < tw; x++) {
      let a = th, b = 0;
      for (let y = 0; y < th; y++) if (px[y * tw + x] >>> 24) { if (y < a) a = y; b = y + 1; }
      top[x] = a; bot[x] = b;
    }
    sp = { top, bot };
    spanCache.set(px, sp);
    return sp;
  }
  function drawSprites(T, V, cam, o, dirX, dirY, planeX, planeY, abAll) {
    const list = T.spritesForFrame;
    if (!list || !list.length) return;
    const w = T.w, h = T.h, b32 = T.b32, depth = T.depth;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    sortBuf.length = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const sx = s.x - cam.x, sy = s.y - cam.y;
      const tz = invDet * (-planeY * sx + planeX * sy);
      if (tz < 0.06 || tz > V.maxDist) continue;
      const txf = invDet * (dirY * sx - dirX * sy);
      s._tz = tz;
      s._sx = (w / 2) * (1 + txf / tz);
      sortBuf.push(s);
    }
    sortBuf.sort((a, b) => b._tz - a._tz);
    const cone = V.flash > 0 ? T.cone : null;
    for (const s of sortBuf) {
      const id = spriteTexId(s.tex);
      const ab = s.variant ? s.variant === 'abandoned' : abAll;
      const rec = ab ? texA(id) : TN[id];
      if (!rec) continue;
      const tz = s._tz;
      const scale = s.scale != null ? s.scale : rec.scale || 1;
      const worldH = scale, worldW = (scale * rec.w) / rec.h;
      const zb = s.z != null ? s.z : rec.hang ? V.wallH - worldH : 0;
      const sh = (worldH * V.proj) / tz, sw = (worldW * V.proj) / tz;
      const bottom = V.horizon + ((V.eye - zb) * V.proj) / tz;
      const topY = bottom - sh;
      const left = s._sx - sw / 2;
      const x0 = Math.max(0, Math.ceil(left - 0.5)), x1 = Math.min(w, Math.ceil(left + sw - 0.5));
      const y0 = Math.max(0, Math.ceil(topY - 0.5)), y1 = Math.min(h, Math.ceil(bottom - 0.5));
      if (x0 >= x1 || y0 >= y1) continue;
      const frames = rec.frames, nf = frames.length;
      const fi = (((s.frame | 0) % nf) + nf) % nf;
      const px = frames[fi];
      const em = (rec.ems ? rec.ems[fi] || rec.em : null) || null;
      const alpha = s.alpha != null ? clamp(s.alpha, 0, 1) : 1;
      if (alpha <= 0) continue;
      const f = 1 - Math.exp(-tz * V.fogDen), k = 1 - f;
      let A;
      if (s.fullbright) A = 256 * k;
      else A = ((256 * k) / (1 + V.att * tz * tz)) * sampleLF(T, s.x, s.y);
      const lr0 = A * (s.fullbright ? 1 : V.tr), lg0 = A * (s.fullbright ? 1 : V.tg), lb0 = A * (s.fullbright ? 1 : V.tb);
      const fr = ((V.fogR * f) | 0) + CLO, fg = ((V.fogG * f) | 0) + CLO, fb = ((V.fogB * f) | 0) + CLO;
      const flK = cone && !s.fullbright ? flashFall(tz) * k * 256 * V.flash : 0;
      // per-sprite emissive level (s.emissive 0..1) overrides the map's power-driven level: the entity's
      // pale rim does not run on the station generator
      const emI = (((s.emissive != null ? clamp(+s.emissive || 0, 0, 1) : V.emis) * k * 256 * 256) / 255) | 0;
      const ilr = lr0 | 0, ilg = lg0 | 0, ilb = lb0 | 0, fk = flK | 0, coneI = fk ? T.coneI : null;
      const tw = rec.w, th = rec.h;
      const du = tw / sw, dv = th / sh;
      const aMul = alpha * 255;
      const spn = spansOf(px, tw, th), spT = spn.top, spB = spn.bot;
      for (let x = x0; x < x1; x++) {
        let tx = ((x + 0.5 - left) * du) | 0;
        if (tx < 0) tx = 0; else if (tx >= tw) tx = tw - 1;
        if (s.flip) tx = tw - 1 - tx;
        const ct = spT[tx], cb = spB[tx];
        if (ct >= cb) continue;
        // clip this column to its opaque texel run
        let ya = Math.ceil(topY + ct * sh / th - 0.5), yb = Math.ceil(topY + cb * sh / th - 0.5) + 1;
        if (ya < y0) ya = y0;
        if (yb > y1) yb = y1;
        let v = (ya + 0.5 - topY) * dv;
        for (let y = ya; y < yb; y++, v += dv) {
          const p = y * w + x;
          if (depth[p] <= tz) continue;
          let ty = v | 0;
          if (ty >= th) ty = th - 1;
          const ti = ty * tw + tx;
          const t = px[ti];
          const ta = t >>> 24;
          if (ta === 0) continue;
          if (ta < 255 || alpha < 1) {
            if ((ta * aMul) / 255 <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
          }
          let lr = ilr, lg = ilg, lb = ilb;
          if (coneI !== null) { const F = (fk * coneI[p]) >> 8; lr += F; lg += (F * 240) >> 8; lb += (F * 205) >> 8; }
          if (em !== null && em[ti] !== 0) {
            const ev = (em[ti] * emI) >> 8;
            if (lr < ev) lr = ev;
            if (lg < ev) lg = ev;
            if (lb < ev) lb = ev;
          }
          b32[p] = OPAQUE | (CL[((((t >>> 16) & 255) * lb) >> 8) + fb] << 16) | (CL[((((t >>> 8) & 255) * lg) >> 8) + fg] << 8) | CL[(((t & 255) * lr) >> 8) + fr];
        }
      }
    }
  }

  /* ============================================================ post */
  function weatherRain(map) {
    const sw = (DA.state && DA.state.world) || {};
    if (map && map.rain != null) return map.rain;
    if (typeof sw.rain === 'number') return sw.rain;
    if (sw.weather && typeof sw.weather.rain === 'number') return sw.weather.rain;
    return 1;
  }
  /** Screen-space rain streaks (camera outdoors). */
  function drawRain(T, dt, amount, bright) {
    const w = T.w, h = T.h, buf = T.buf;
    if (!T.drops) {
      T.drops = [];
      for (let i = 0; i < 360; i++) T.drops.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random() });
    }
    const n = Math.floor(T.drops.length * clamp(amount, 0, 1));
    const slant = 0.16;
    for (let i = 0; i < n; i++) {
      const d = T.drops[i];
      const speed = (380 + d.z * 520) * (h / 270);
      d.y += speed * dt;
      d.x += speed * dt * slant;
      if (d.y > h) { d.y -= h + 20; d.x = Math.random() * w * 1.2 - w * 0.1; d.z = Math.random(); }
      const len = (3 + d.z * 9) | 0;
      const lv = (bright * (0.35 + d.z * 0.65)) | 0;
      for (let k = 0; k < len; k++) {
        const yy = (d.y - k) | 0, xx = (d.x - k * slant) | 0;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const p = yy * w + xx, c = buf[p];
        const a = (lv * (len - k)) / len;
        let r = (c & 255) + a * 0.85, g = ((c >>> 8) & 255) + a * 0.9, b = ((c >>> 16) & 255) + a;
        buf[p] = (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
      }
    }
  }
  /** Row tearing, chroma split and inversion. amount 0..1. */
  function glitchPass(T, amount, chroma) {
    const w = T.w, h = T.h, buf = T.buf, row = T.row;
    if (amount > 0) {
      const tears = 1 + ((amount * 7 * Math.random()) | 0);
      for (let k = 0; k < tears; k++) {
        const y0 = (Math.random() * h) | 0, bh = 1 + ((Math.random() * (2 + amount * 22)) | 0);
        const dx = (((Math.random() - 0.5) * (4 + amount * 60)) | 0) || 1;
        for (let y = y0; y < Math.min(h, y0 + bh); y++) {
          const o = y * w;
          for (let x = 0; x < w; x++) row[x] = buf[o + ((x - dx + w * 4) % w)];
          buf.set(row, o);
        }
      }
    }
    const cs = Math.round(chroma);
    if (cs > 0) {
      for (let y = 0; y < h; y++) {
        const o = y * w;
        for (let x = 0; x < w; x++) row[x] = buf[o + x];
        for (let x = 0; x < w; x++) {
          const rs = row[x + cs < w ? x + cs : w - 1], bs = row[x - cs >= 0 ? x - cs : 0];
          buf[o + x] = ((row[x] & 0xff00ff00) | (rs & 0xff) | (bs & 0xff0000)) >>> 0;
        }
      }
    }
  }
  /** CCTV look: monochrome, noise, scanlines, a rolling bar. */
  function cctvPass(T, mono, noise, time) {
    const w = T.w, h = T.h, b32 = T.b32;
    const off = (Math.random() * NOISE_N) | 0;
    const barY = ((time * 0.18) % 1.3) * h;
    const na = Math.round(noise * 110);
    for (let y = 0; y < h; y++) {
      const scan = y & 1 ? 210 : 256;
      const bar = Math.abs(y - barY) < h * 0.08 ? 1.12 : 1;
      const k = (scan * bar) | 0;
      const lineN = NOISE[(y * 131 + off) & NOISE_M] < noise * 18 ? (60 * noise) | 0 : 0;
      const base = CLO + lineN - (na >> 1);
      for (let x = 0, p = y * w; x < w; x++, p++) {
        const c = b32[p];
        const nz = ((NOISE[(p * 7 + off) & NOISE_M] * na) >> 8) + base;
        if (mono) {
          const l = ((((c & 255) * 77 + ((c >> 8) & 255) * 150 + ((c >> 16) & 255) * 29) >> 8) * k) >> 8;
          b32[p] = OPAQUE | (CL[((l * 246) >> 8) + nz] << 16) | (CL[l + nz] << 8) | CL[((l * 236) >> 8) + nz];
        } else {
          b32[p] = OPAQUE | (CL[((((c >> 16) & 255) * k) >> 8) + nz] << 16) | (CL[((((c >> 8) & 255) * k) >> 8) + nz] << 8) | CL[(((c & 255) * k) >> 8) + nz];
        }
      }
    }
  }

  /* ============================================================ main view */
  let MAIN = null, canvas = null, ctx = null;
  let grainCv = null, vigCv = null, vigCvAmt = -1;
  /** Film grain: black/white specks of random alpha, drawn at a random offset each frame. */
  function grainCanvas() {
    if (grainCv) return grainCv;
    grainCv = document.createElement('canvas');
    grainCv.width = grainCv.height = 512;
    const g = grainCv.getContext('2d');
    const img = g.createImageData(512, 512);
    const d = new Uint32Array(img.data.buffer);
    const rnd = DA.util.mulberry32(77);
    for (let i = 0; i < d.length; i++) {
      const a = (Math.pow(rnd(), 2.2) * 72) | 0;
      d[i] = rnd() < 0.5 ? (a << 24) >>> 0 : ((a << 24) | 0xffffff) >>> 0;
    }
    g.putImageData(img, 0, 0);
    return grainCv;
  }
  /** Vignette: transparent centre darkening toward the corners. */
  function vignetteCanvas(amt) {
    if (vigCv && vigCvAmt === amt) return vigCv;
    if (!vigCv) { vigCv = document.createElement('canvas'); vigCv.width = W; vigCv.height = H; }
    vigCvAmt = amt;
    const g = vigCv.getContext('2d');
    const img = g.createImageData(W, H);
    const d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / H - 0.5;
        const k = Math.sqrt(dx * dx * 1.1 + dy * dy * 1.6);
        d[y * W + x] = ((Math.round(255 * amt * 0.62 * DA.util.smoothstep(0.28, 0.78, k)) << 24) >>> 0);
      }
    g.putImageData(img, 0, 0);
    return vigCv;
  }
  const stats = { ms: 0, avg: 0, sprites: 0, frames: 0, parts: { scene: 0, sprites: 0, post: 0, put: 0 } };
  let tSpr = 0;

  function init() {
    if (MAIN) return;
    buildTables();
    ensureTextures();
    canvas = document.getElementById('view');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
    }
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { alpha: false });
    MAIN = makeTarget(W, H, true);
    DA.render.canvas = canvas;
    DA.render.ctx = ctx;
  }

  function blackFrame(T) {
    T.b32.fill(OPAQUE);
  }

  function frame(dt) {
    if (!MAIN) init();
    const t0 = performance.now();
    dt = dt || 0;
    // effect timers (shake/flash/glitch/invert, renderer clock) advance on the core 'frame' event,
    // not here: they must decay while the world is hidden (desk, devices) or not rendered (debug fast)
    const world = DA.world;
    const map = world && world.map;
    const cam = map && world.camera ? world.camera() : null;
    const T = MAIN;
    let outdoor = false, camL = 0;
    if (map && cam && ensureTextures()) {
      const sw = (DA.state && DA.state.world) || {};
      const blend = sw.blend || 0;
      let variant = map.variant || 'normal';
      if (variant !== 'abandoned' && blend > 0) variant = 'blend';
      const shakeK = E.shakeT > 0 ? E.shakeAmt * (E.shakeDur > 0 ? E.shakeT / E.shakeDur : 1) : 0;
      const o = {
        variant, blend, daylight: sw.daylight || 0, dt, smoothFog: true,
        flashlight: world.player && world.player.flashlight,
        shakeA: shakeK ? (Math.random() - 0.5) * 0.03 * shakeK : 0,
        shakeY: shakeK ? (Math.random() - 0.5) * 8 * shakeK : 0,
        main: true,
      };
      T.spritesForFrame = collectSprites(T, world.mapId, o);
      stats.sprites = T.spritesForFrame.length;
      const V = renderScene(T, cam, map, o);
      stats.parts.sprites = tSpr;
      stats.parts.scene = performance.now() - t0 - tSpr;
      const ci = cam.x >= 0 && cam.y >= 0 && cam.x < map.w && cam.y < map.h ? (cam.y | 0) * map.w + (cam.x | 0) : -1;
      outdoor = V.skyOn && (ci < 0 || map.ceil[ci] === 0);
      camL = sampleLF(T, cam.x, cam.y);
      DA.render._last = { T, V };
      if (outdoor) {
        const rain = weatherRain(map);
        if (rain > 0) drawRain(T, dt, rain, 26 + 60 * Math.min(1.2, camL) + 140 * V.lightning);
      }
    } else blackFrame(T);
    // glitches
    const gAmt = Math.max(E.glitchT > 0 ? E.glitchAmt : 0, E.autoT > 0 ? E.autoAmt : 0);
    DA.render._glitching = gAmt > 0;
    const chroma = (fx.chroma || 0) + (gAmt > 0 ? gAmt * (2 + Math.random() * 4) : 0);
    if (gAmt > 0 || chroma > 0) glitchPass(T, gAmt, chroma);
    if (E.invertT > 0 || (E.glitchT > 0 && E.glitchAmt >= 0.9 && Math.random() < 0.08)) {
      const b = T.buf;
      for (let i = 0; i < b.length; i++) b[i] ^= 0x00ffffff;
    }
    const tp = performance.now();
    ctx.putImageData(T.img, 0, 0);
    const tq = performance.now();
    stats.parts.put = tq - tp;
    // grain, vignette, tint: canvas compositing (SIMD/GPU) instead of a per-pixel JS pass
    const grain = (DA.settings.grain === false ? 0 : fx.grain != null ? fx.grain : 1) * (gAmt > 0 ? 2.2 : 1);
    if (grain > 0) {
      ctx.globalAlpha = clamp(grain * 0.3, 0, 1);
      ctx.drawImage(grainCanvas(), -((Math.random() * 32) | 0), -((Math.random() * 200) | 0));
      ctx.globalAlpha = 1;
    }
    const vig = fx.vignette != null ? fx.vignette : 1;
    if (vig > 0) ctx.drawImage(vignetteCanvas(vig), 0, 0);
    if (fx.tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(' + fx.tint.map((v) => clamp(v * 255, 0, 255) | 0).join(',') + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    stats.parts.post = performance.now() - tq;
    // overlays
    if (E.flashT > 0 && E.flashDur > 0) {
      const a = E.flashT / E.flashDur;
      ctx.globalAlpha = a * a;
      ctx.fillStyle = 'rgb(' + E.flashCol.join(',') + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (E.fadeOp > 0) {
      ctx.globalAlpha = clamp(E.fadeOp, 0, 1);
      ctx.fillStyle = E.fadeCol;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    stats.ms = performance.now() - t0;
    stats.avg = stats.frames ? stats.avg * 0.95 + stats.ms * 0.05 : stats.ms;
    stats.frames++;
  }

  /* ============================================================ renderView */
  const views = new WeakMap();
  /**
   * Render any camera into any canvas at the canvas's size (CCTV, montage). Uses its own
   * buffers, so the main view is untouched.
   */
  function renderView(cv, cam, opts) {
    opts = opts || {};
    if (!cv || !cam) return false;
    buildTables();
    if (!ensureTextures()) return false;
    const w = cv.width | 0, h = cv.height | 0;
    if (w < 2 || h < 2) return false;
    let T = views.get(cv);
    if (!T || T.w !== w || T.h !== h) {
      T = makeTarget(w, h, true);
      T.ctx = cv.getContext('2d');
      views.set(cv, T);
    }
    const world = DA.world;
    const mapId = opts.mapId || (world && world.mapId);
    let map = opts.map || null;
    if (!map && world) {
      if (world.maps && world.maps[mapId]) map = world.maps[mapId];
      else if (world.mapId === mapId) map = world.map;
    }
    if (!map) {
      T.buf.fill(0xff000000);
      if (opts.noise) cctvPass(T, true, opts.noise, E.time);
      T.ctx.putImageData(T.img, 0, 0);
      return false;
    }
    const sw = (DA.state && DA.state.world) || {};
    const o = {
      variant: opts.variant || map.variant || 'normal',
      blend: opts.blend != null ? opts.blend : sw.blend || 0,
      daylight: opts.daylight != null ? opts.daylight : sw.daylight || 0,
      flashlight: opts.flashlight || 0,
      lightScale: opts.lightScale,
      light: opts.light,
      minLight: opts.minLight,
      emissive: opts.emissive,
      providers: opts.providers,
      sprites: opts.sprites,
      tint: opts.tint,
      time: opts.time,
      mapId,
      view: true,
    };
    if (o.variant === 'blend' && !(o.blend > 0)) o.variant = 'normal';
    T.spritesForFrame = collectSprites(T, mapId, o);
    renderScene(T, cam, map, o);
    if (opts.monochrome || opts.noise) cctvPass(T, !!opts.monochrome, opts.noise || 0, E.time);
    T.ctx.putImageData(T.img, 0, 0);
    return true;
  }

  /* ============================================================ API */
  DA.render = {
    W,
    H,
    fx,
    stats,
    canvas: null,
    ctx: null,
    get time() { return E.time; },
    get initMs() { return tablesMs; },
    init,
    frame,
    renderView,
    addSpriteProvider(fn) {
      if (typeof fn === 'function' && !providers.includes(fn)) providers.push(fn);
      return fn;
    },
    removeSpriteProvider(fn) {
      const i = providers.indexOf(fn);
      if (i >= 0) providers.splice(i, 1);
    },
    /** Camera shake: amount ~0.2 (bump) .. 1 (impact), decays over secs. */
    shake(amount = 0.5, secs = 0.4) {
      E.shakeAmt = Math.max(E.shakeT > 0 ? E.shakeAmt : 0, amount);
      E.shakeT = E.shakeDur = secs;
    },
    /** Full-screen colour flash fading out over secs. */
    flash(color = '#fff', secs = 0.3) {
      E.flashCol = parseColor(color);
      E.flashT = E.flashDur = Math.max(0.01, secs);
    },
    /** Lightning strike: sky, outdoor ground and window glass flash (double-flash envelope). */
    lightning(strength = 1) {
      buildTables();
      E.strike = E.time;
      E.strikeStr = clamp(strength, 0, 1.5);
      if (strength >= 0.5) makeBolt(strength);
      else BOLT.fill(0);
    },
    /** Explicit glitch burst: row tearing, chroma split, (≥0.9) brief inversion. */
    glitch(amount = 0.5, secs = 0.3) {
      E.glitchAmt = clamp(amount, 0, 1);
      E.glitchT = secs;
    },
    /** Persistent overlay (0 = none). */
    setFade(opacity = 0, color = '#000') {
      E.fadeOp = opacity;
      E.fadeCol = Array.isArray(color) ? 'rgb(' + color.join(',') + ')' : color;
    },
    lightAt(x, y) {
      const l = DA.render._last;
      return l ? sampleLF(l.T, x, y) : 0;
    },
    _last: null,
  };

  DA.bus.on('boot', () => init());
  // every DA.step emits 'frame' (rendered or not, paused or not): effects and the clock live here
  DA.bus.on('frame', (dt) => updateEffects(dt > 0 ? Math.min(+dt, 0.25) : 0));
  DA.bus.on('runtime:reset', () => {
    E.shakeT = 0;
    E.flashT = 0;
    E.glitchT = 0;
    E.autoT = 0;
    E.invertT = 0;
    E.strike = -10;
    E.fadeOp = 0;
    if (MAIN) MAIN.fog = null;
  });
})();
