/* DEAD AIR — textures.js
 * DA.textures: every wall, floor, ceiling, decal and sprite in the game, painted procedurally at
 * boot into Uint32Array pixel buffers (ImageData little-endian order: 0xAABBGGRR).
 * Contract: PLAN.md §6.1; names §7.5. Consumed mainly by js/raycaster.js (DA.render).
 *
 * ---------------------------------------------------------------- API (PLAN §6.1)
 *   build()                    paint everything (idempotent; runs on 'boot', ~0.2–0.5 s)
 *   id(name) → int             ≥1 (0 = none). Unknown → warns once, returns the 'missing' id.
 *                              'base+decal(+decal…)' composites are generated on demand.
 *   get(id|name, variant)      → record {w, h, px, frames?, flags, …}; variant 'normal'|'abandoned'
 *   name(id)                   → texture name
 *
 * ---------------------------------------------------------------- ADDITIONS
 *   Record fields: id, name, kind ('wall'|'floor'|'decal'|'sprite'), frames (Uint32Array[],
 *     frames[0] === px), em (Uint8Array per-pixel emissive strength 0..255, or null), ems
 *     (em per frame), mask (Uint8Array per pixel, or null: 1 = window glass — the renderer
 *     draws rain / outside light / lightning / the window figure there; 2 = live sky — the
 *     renderer draws the real sky there: parapet horizon, treeline gaps), fps (wall animation
 *     rate), scale (recommended sprite height in wall units — used when a sprite omits
 *     `scale`), hang (sprite hangs from the ceiling when a sprite omits `z`).
 *   flags: {window, emissive, alpha, anim, backed, sky, sprite}
 *     backed — a wall texture with fully transparent pixels (window surround, breaker panel,
 *       fridge…). The renderer fills them with the cell's base wall texture or the neighbouring
 *       wall, so the object sits naturally in any room. `'wall_paint+window'` also works.
 *     alpha on a *wall* texture (fence) — see-through: the ray continues behind it.
 *   Composite decals blend by alpha (255 overwrites, partial alpha tints: water stains).
 *   has(name), list() → base names, byId (id → normal record), variantOf(id, variant),
 *   toCanvas(name, variant, frame) → HTMLCanvasElement, text(pic, str, x, y, col, scale),
 *   textWidth(str, scale), rgb(r,g,b,a) colour packer, prewarm(variant) (derives every
 *   texture's variant in idle slices; runs automatically after 'booted'), buildMs, paintMs.
 *   Extra names: dec_duct (a bigger ventilation grille LOW on the wall, bottom-left screw stripped —
 *     the basement duct Calm You describes; dec_vent is the small grille high on the wall),
 *     dec_photo_four (staff photo with the fourth person). dec_photo / dec_photo_four
 *     match the close-up devices.js draws (same people, clothes and order; the fourth at the right
 *     edge, out of focus). relay_console + relay_console_b: the RELAY CHAMBER console tiles (RELAY
 *     plate, gain bar, guarded AMPLIFY switch, 148.32 / FWD-REF meters, knobs, patch field); each
 *     label fits inside its tile, use one or alternate them along a face (maps.js relay K cells).
 *   spec.noAge: the 'abandoned' variant is the normal record (spr_entity, spr_entity_face).
 *   Abandoned variant (2049): aged but readable in daylight; whatever glowed (LEDs, screens, lamps,
 *     ceiling panels — emissive texels) is dark dead glass.
 *   Person sprites (spr_hollis, spr_replacement, spr_figure): frames 0–3 walk toward the
 *   viewer, 4 idle, 5–8 walk away (back view), 9 idle back view.
 *   spr_entity frames: 0 arm down, 1 hand raised to head, 2 reaching forward, 3 head turned wrong.
 *     Near-black body with a baked pale RIM (entityRim: a dithered halo 1–3 px outside the
 *     silhouette + a lighter 2 px band inside, emissive up to 255 = shown at the rim colour) and an
 *     emissive face smear, so it reads against black at 8–12 u. spr_entity_face frames: 0 many
 *     faces smeared (the window figure), 1 her (long dark hair), 2 Hollis (cap brim, stubble), 3 you
 *     (the photo's jacket and collar, hollow eyes); its pale skin is emissive (≤ 190; hair, brim,
 *     collar and eyes are not). entity.js draws both with a sprite `emissive` (~0.9), so the rim
 *     and the faces glow whatever the station power while the body takes world light.
 *   Recommended sprite scales = rec.scale (texture height in wall units; people include headroom
 *   so scale 1 = a person ~0.73 walls tall): people/figure/operator/entity 1, spr_entity_face 0.45,
 *   spr_mug 0.06, spr_jar 0.08, spr_tape 0.05, spr_newspaper 0.1, spr_chair 0.42, spr_table 0.37,
 *   spr_boxes 0.42, spr_bucket 0.16, spr_cable_coil 0.16, spr_debris 0.2, spr_barrel 0.36,
 *   spr_lever/_down 0.34, spr_lectern 0.5, spr_light_fixture 0.5 (hang), spr_sign 0.72,
 *   spr_car/_car2/_car_rusted ~0.7 (spr_car_lit / spr_car2_lit: the same cars with the headlights
 *   on — lamps + a soft halo, emissive — for an arrival in the dark / at dawn), spr_mast 2.4, spr_lamp_post 2.2, spr_tree 4.5 (frames 0–2),
 *   spr_tree_dead 3.5, spr_tower 10, spr_downward_antenna 8 (hung from cables: an inverted dish
 *   opening DOWN, elements shortening to a glowing arrowhead tip, pale chevrons pointing down;
 *   works at any hang height: the catwalk cuts it at row 128·(1 + z/scale) — maps.js hangs it at
 *   scale 7, z −2.6 over the shaft, so the dish and most of the tapering mast show above the
 *   ring and the glowing tip hangs just below it). Standing sprites are bottom-anchored (feet on the texture's last row).
 *   Wall faces meant to sit on a room's wall ("backed"): window, window_small, radio_console,
 *   cctv_bank, breaker_panel, fuel_tank, fridge, filing_cabinet, corkboard, map_wall,
 *   mirror_wall, ladder_wall, vent_wall, sign_station, hatch. Glass: window, window_small,
 *   door_front. Live sky: parapet (above the coping), trees (gaps above the canopy).
 *   Animated walls (frames cycle at rec.fps, desynchronised per cell): rack_server LEDs,
 *   terminal_tape reels, door_blast interlock lamp.
 */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});

  /* ============================================================ colours */
  /** Pack r,g,b,a (0..255) into ImageData little-endian order 0xAABBGGRR. */
  const RGB = (r, g, b, a = 255) => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  /** 0xRRGGBB literal → packed pixel. */
  const HEX = (h, a = 255) => RGB((h >> 16) & 255, (h >> 8) & 255, h & 255, a);
  const cR = (c) => c & 255, cG = (c) => (c >>> 8) & 255, cB = (c) => (c >>> 16) & 255, cA = (c) => c >>> 24;
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  /** Multiply a colour's rgb by f (alpha kept). */
  const mul = (c, f) => RGB(cl(cR(c) * f), cl(cG(c) * f), cl(cB(c) * f), cA(c));
  /** Linear mix of two colours (rgb + alpha). */
  const mix = (a, b, t) =>
    RGB(cl(cR(a) + (cR(b) - cR(a)) * t), cl(cG(a) + (cG(b) - cG(a)) * t), cl(cB(a) + (cB(b) - cB(a)) * t), cl(cA(a) + (cA(b) - cA(a)) * t));
  const withA = (c, a) => ((c & 0x00ffffff) | ((a & 255) << 24)) >>> 0;
  const lum = (c) => cR(c) * 0.3 + cG(c) * 0.59 + cB(c) * 0.11;
  const CLEAR = 0;

  /* ============================================================== noise */
  function h2(x, y, s) {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x5bd1e995, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** Tileable smooth value noise with lattice period (px, py). Lattice values are cached. */
  const lattices = new Map();
  function lattice(px, py, s) {
    const key = px + '|' + py + '|' + s;
    let L = lattices.get(key);
    if (!L) {
      L = new Float32Array(px * py);
      for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) L[y * px + x] = h2(x, y, s);
      lattices.set(key, L);
    }
    return L;
  }
  function vnoise(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = x0 + 1 === px ? 0 : x0 + 1;
    const y0 = ((yi % py) + py) % py, y1 = y0 + 1 === py ? 0 : y0 + 1;
    const L = px * py <= 65536 ? lattice(px, py, s) : null;
    let a, b, c, d;
    if (L) { a = L[y0 * px + x0]; b = L[y0 * px + x1]; c = L[y1 * px + x0]; d = L[y1 * px + x1]; }
    else { a = h2(x0, y0, s); b = h2(x1, y0, s); c = h2(x0, y1, s); d = h2(x1, y1, s); }
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  /** Fractal noise tileable over a `size`-pixel texture; `cells` lattice cells across at octave 0. */
  function fbm(x, y, size, cells, oct, s, cellsY) {
    let sum = 0, amp = 0.5, norm = 0, cx = cells, cy = cellsY || cells;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise((x / size) * cx, (y / size) * cy, cx, cy, s + o * 131);
      norm += amp;
      amp *= 0.5;
      cx *= 2;
      cy *= 2;
    }
    return sum / norm;
  }
  const rng = (seed) => DA.util.mulberry32(seed >>> 0);
  const hashStr = (s) => DA.util.hash(s);

  /* ========================================================== pixel font */
  // 3×5 (M N W wider). Rows top→bottom. Crisp labels on 64-px textures.
  const GLYPHS = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['10001', '10001', '10101', '11011', '10001'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
    6: ['011', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '110'],
    '.': ['0', '0', '0', '0', '1'], ',': ['00', '00', '00', '01', '10'], ':': ['0', '1', '0', '1', '0'],
    '-': ['000', '000', '111', '000', '000'], '/': ['001', '001', '010', '100', '100'],
    "'": ['1', '1', '0', '0', '0'], '!': ['1', '1', '1', '0', '1'], '?': ['110', '001', '010', '000', '010'],
    '+': ['000', '010', '111', '010', '000'], '#': ['101', '111', '101', '111', '101'],
    '>': ['100', '010', '001', '010', '100'], '<': ['001', '010', '100', '010', '001'],
    '(': ['01', '10', '10', '10', '01'], ')': ['10', '01', '01', '01', '10'],
    '&': ['010', '101', '010', '101', '011'], '%': ['101', '001', '010', '100', '101'],
    ' ': ['00', '00', '00', '00', '00'],
  };
  function textWidth(str, s = 1, sp = 1) {
    let w = 0;
    for (const ch of String(str).toUpperCase()) {
      const g = GLYPHS[ch] || GLYPHS['?'];
      w += (g[0].length + sp) * s;
    }
    return Math.max(0, w - sp * s);
  }

  /* ============================================================ painter */
  /**
   * A tiny paint program over a Uint32Array. Colour arguments may be packed colours or
   * functions (x, y) → colour. wrapX/wrapY make drawing tile seamlessly (walls wrap in x,
   * floors in both).
   */
  class Pic {
    constructor(w, h, wrapX, wrapY) {
      this.w = w;
      this.h = h;
      this.px = new Uint32Array(w * h);
      this.wrapX = !!wrapX;
      this.wrapY = !!wrapY;
      this.em = null;
      this.mask = null;
    }
    i(x, y) {
      x = Math.floor(x);
      y = Math.floor(y);
      if (this.wrapX) x = ((x % this.w) + this.w) % this.w;
      else if (x < 0 || x >= this.w) return -1;
      if (this.wrapY) y = ((y % this.h) + this.h) % this.h;
      else if (y < 0 || y >= this.h) return -1;
      return y * this.w + x;
    }
    set(x, y, c) {
      const i = this.i(x, y);
      if (i >= 0) this.px[i] = typeof c === 'function' ? c(x, y) : c;
    }
    get(x, y) {
      const i = this.i(x, y);
      return i >= 0 ? this.px[i] : 0;
    }
    fill(c) { this.rect(0, 0, this.w, this.h, c); }
    rect(x, y, w, h, c) {
      const fn = typeof c === 'function';
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const i = this.i(xx, yy);
          if (i >= 0) this.px[i] = fn ? c(xx, yy) : c;
        }
    }
    /** Mix toward colour c by t (0..1). Transparent pixels become c with alpha t. */
    blend(x, y, c, t) {
      const i = this.i(x, y);
      if (i < 0 || t <= 0) return;
      const d = this.px[i];
      const da = cA(d);
      if (da === 0) this.px[i] = withA(c, cl(255 * Math.min(1, t) * (cA(c) / 255)));
      else {
        const m = mix(d, c, Math.min(1, t));
        this.px[i] = withA(m, Math.max(da, cl(255 * Math.min(1, t) * (cA(c) / 255))));
      }
    }
    blendRect(x, y, w, h, c, t) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.blend(xx, yy, c, t);
    }
    mul(x, y, f) {
      const i = this.i(x, y);
      if (i >= 0 && cA(this.px[i])) this.px[i] = mul(this.px[i], f);
    }
    mulRect(x, y, w, h, f) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.mul(xx, yy, typeof f === 'function' ? f(xx, yy) : f);
    }
    hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
    vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let n = 0; n < 1000; n++) {
        this.set(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    /** Thick line: stamps a disc of radius r along the segment. */
    thick(x0, y0, x1, y1, r, c) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let k = 0; k <= n; k++) this.circle(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, c);
    }
    ellipse(cx, cy, rx, ry, c) {
      const fn = typeof c === 'function';
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(x, y, fn ? c(x, y, dx, dy) : c);
        }
    }
    circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
    ring(cx, cy, r, c, t = 1) {
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d <= r && d > r - t) this.set(x, y, c);
        }
    }
    /** Scanline polygon fill. pts: [[x,y],…] */
    poly(pts, c) {
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const fn = typeof c === 'function';
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const yc = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, fn ? c(x, y) : c);
      }
    }
    clear(x, y, w, h) { this.rect(x, y, w, h, CLEAR); }
    /** Emissive strength (0..255) for the given rect / pixel. */
    emit(x, y, w, h, v = 255) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.emitPx(xx, yy, v); }
    emitPx(x, y, v = 255) {
      const i = this.i(x, y);
      if (i < 0) return;
      if (!this.em) this.em = new Uint8Array(this.w * this.h);
      this.em[i] = Math.max(this.em[i], v);
    }
    /** Mark mask pixels: 1 = window glass, 2 = live sky. */
    maskRect(x, y, w, h, v = 1) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.maskPx(xx, yy, v);
    }
    maskPx(x, y, v) {
      const i = this.i(x, y);
      if (i < 0) return;
      if (!this.mask) this.mask = new Uint8Array(this.w * this.h);
      this.mask[i] = v;
    }
    /** Pixel-font text; returns the drawn width. c may be a function. sh = optional shadow colour. */
    text(str, x, y, c, s = 1, sh, sp = 1) {
      let cx = x;
      for (const ch of String(str).toUpperCase()) {
        const g = GLYPHS[ch] || GLYPHS['?'];
        for (let r = 0; r < 5; r++)
          for (let k = 0; k < g[r].length; k++)
            if (g[r][k] === '1') {
              if (sh != null) this.rect(cx + k * s + 1, y + r * s + 1, s, s, sh);
              this.rect(cx + k * s, y + r * s, s, s, c);
            }
        cx += (g[0].length + sp) * s;
      }
      return cx - x - sp * s;
    }
    /** Text centred on x. */
    textC(str, x, y, c, s = 1, sh) { return this.text(str, Math.round(x - textWidth(str, s) / 2), y, c, s, sh); }
    /** Brighten top/left edge, darken bottom/right edge of a rect. */
    bevel(x, y, w, h, hi = 1.18, lo = 0.72) {
      for (let xx = x; xx < x + w; xx++) { this.mul(xx, y, hi); this.mul(xx, y + h - 1, lo); }
      for (let yy = y + 1; yy < y + h - 1; yy++) { this.mul(x, yy, hi); this.mul(x + w - 1, yy, lo); }
    }
    /** Per-pixel brightness jitter ±amp on opaque pixels. */
    noise(x, y, w, h, amp, rnd) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.mul(xx, yy, 1 + (rnd() * 2 - 1) * amp);
    }
    /** 1-px outline around opaque areas (sprites), drawn only on transparent pixels. */
    outline(c) {
      const src = new Uint32Array(this.px), w = this.w, h = this.h;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (cA(src[y * w + x]) > 40) continue;
          let near = false;
          if (x > 0 && cA(src[y * w + x - 1]) > 140) near = true;
          else if (x < w - 1 && cA(src[y * w + x + 1]) > 140) near = true;
          else if (y > 0 && cA(src[(y - 1) * w + x]) > 140) near = true;
          else if (y < h - 1 && cA(src[(y + 1) * w + x]) > 140) near = true;
          if (near) this.px[y * w + x] = c;
        }
    }
    /** Box-blur the alpha channel `n` times (soft-edged silhouettes). rgb kept. */
    softAlpha(n = 1, keepCore = true) {
      const w = this.w, h = this.h;
      for (let it = 0; it < n; it++) {
        const src = new Uint32Array(this.px);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let s = 0, k = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) { k++; continue; }
                s += cA(src[yy * w + xx]);
                k++;
              }
            const a0 = cA(src[y * w + x]);
            let a = s / k;
            if (keepCore) a = Math.min(a0 === 0 ? a : Math.max(a, a0 * 0.85), 255);
            if (a0 === 0 && a > 0) {
              // borrow colour from the darkest opaque neighbour
              let best = 0;
              for (let dy = -1; dy <= 1 && !best; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const xx = x + dx, yy = y + dy;
                  if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                  if (cA(src[yy * w + xx]) > 0) { best = src[yy * w + xx]; break; }
                }
              this.px[y * w + x] = withA(best, cl(a));
            } else this.px[y * w + x] = withA(src[y * w + x], cl(a));
          }
      }
    }
    /** Copy another pic (or px array) in at (x, y) with alpha-over. */
    stamp(src, sw, sh, x, y, flip) {
      for (let yy = 0; yy < sh; yy++)
        for (let xx = 0; xx < sw; xx++) {
          const c = src[yy * sw + (flip ? sw - 1 - xx : xx)];
          const a = cA(c);
          if (a === 0) continue;
          if (a === 255) this.set(x + xx, y + yy, c);
          else this.blend(x + xx, y + yy, withA(c, 255), a / 255);
        }
    }
  }

  /* ============================================================ registry */
  const DEFS = [];
  const DEFMAP = new Map();
  const SIZES = { wall: 64, floor: 64, decal: 64 };
  /**
   * Register a texture. spec: {kind, w, h, frames, fps, alpha (see-through wall), scale, hang,
   * peel (abandoned: peeling paint), abandon(p, rnd) (bespoke abandoned touches), noAge (the
   * 'abandoned' variant is the normal record: things that do not belong to the building)}.
   * paint(p, rnd, frame, frameRnd) draws into the Pic.
   */
  function T(name, spec, paint) {
    spec = Object.assign({ kind: 'wall' }, spec);
    spec.name = name;
    spec.paint = paint;
    spec.w = spec.w || SIZES[spec.kind] || 64;
    spec.h = spec.h || SIZES[spec.kind] || 64;
    DEFS.push(spec);
    DEFMAP.set(name, spec);
  }

  const recs = [null]; // id → normal record
  const abRecs = []; // id → abandoned record (lazy)
  const ids = new Map(); // name → id
  const warned = new Set();
  let built = false;

  function finishRecord(rec) {
    const px = rec.px, n = px.length;
    let transparent = false, partial = false;
    for (let i = 0; i < n; i++) {
      const a = px[i] >>> 24;
      if (a === 0) transparent = true;
      else if (a < 255) partial = true;
      if (transparent && partial) break;
    }
    let win = false, sky = false;
    if (rec.mask) for (let i = 0; i < n; i++) { if (rec.mask[i] === 1) win = true; else if (rec.mask[i] === 2) sky = true; }
    const emissive = !!(rec.ems && rec.ems.some((e) => e && e.some((v) => v > 0)));
    const sprite = rec.kind === 'sprite';
    rec.flags = {
      window: win,
      sky,
      emissive,
      alpha: sprite || rec.kind === 'decal' || !!rec.seeThrough,
      anim: rec.frames.length > 1,
      backed: rec.kind === 'wall' && !rec.seeThrough && (transparent || partial),
      sprite,
    };
    if (!emissive) { rec.em = null; rec.ems = null; }
    return rec;
  }

  function paintDef(d) {
    const nf = d.frames || 1;
    const frames = [], ems = [];
    let mask = null;
    const wrapX = d.kind === 'wall' || d.kind === 'floor';
    const wrapY = d.kind === 'floor';
    for (let f = 0; f < nf; f++) {
      const p = new Pic(d.w, d.h, wrapX, wrapY);
      d.paint(p, rng(hashStr(d.name)), f, rng(hashStr(d.name) + f * 7919 + 1));
      frames.push(p.px);
      ems.push(p.em);
      if (f === 0) mask = p.mask;
    }
    return finishRecord({
      name: d.name, kind: d.kind, w: d.w, h: d.h, px: frames[0], frames, em: ems[0], ems, mask,
      fps: d.fps || 2, scale: d.scale || 1, hang: !!d.hang, seeThrough: !!d.alpha, def: d,
    });
  }

  function register(rec) {
    const id = recs.length;
    rec.id = id;
    recs.push(rec);
    ids.set(rec.name, id);
    return id;
  }

  function build() {
    if (built) return;
    built = true;
    const t0 = performance.now();
    const paintMs = (DA.textures.paintMs = {});
    for (const d of DEFS) {
      const t1 = performance.now();
      try {
        register(paintDef(d));
        paintMs[d.name] = performance.now() - t1;
      } catch (e) {
        console.error('[textures] failed to paint', d.name, e);
        register(Object.assign(paintDef(DEFMAP.get('missing')), { name: d.name }));
      }
    }
    DA.textures.buildMs = performance.now() - t0;
  }

  /* --------------------------------------------------------- composites */
  /** 'base+decal+decal' → one 64×64 record. Decals alpha-blend over the base. */
  function makeComposite(name) {
    const parts = name.split('+').map((s) => s.trim()).filter(Boolean);
    const baseId = lookup(parts[0]);
    const base = recs[baseId];
    const decals = parts.slice(1).map((p) => recs[lookup(p)]);
    const rec = composeRecords(name, base, decals);
    rec.parts = [baseId].concat(decals.map((d) => d.id));
    return rec;
  }
  function composeRecords(name, base, decals) {
    const w = base.w, h = base.h, n = w * h;
    decals = decals.filter((d) => d && d.w === w && d.h === h);
    // frame count: the longest animation among the layers (e.g. 'wall_paint+rack_server')
    let nf = base.frames.length;
    for (const d of decals) nf = Math.max(nf, d.frames.length);
    const frames = [], ems = [];
    let mask = base.mask ? new Uint8Array(base.mask) : null;
    for (let f = 0; f < nf; f++) {
      const fpx = new Uint32Array(base.frames[f % base.frames.length]);
      const bem = base.ems ? base.ems[f % base.ems.length] : base.em;
      let em = bem ? new Uint8Array(bem) : null;
      for (const d of decals) {
        const dpx = d.frames[f % d.frames.length];
        const dem = d.ems ? d.ems[f % d.ems.length] : d.em;
        for (let i = 0; i < n; i++) {
          const c = dpx[i], a = c >>> 24;
          if (a === 0) continue;
          const b = fpx[i];
          if (a >= 250 || (b >>> 24) === 0) fpx[i] = withA(c, Math.max(a, b >>> 24));
          else fpx[i] = withA(mix(b, c, a / 255), Math.max(b >>> 24, a));
          if (a < 128) continue;
          // the covering layer owns emissive + mask at this pixel
          if (dem && dem[i]) { if (!em) em = new Uint8Array(n); em[i] = dem[i]; }
          else if (em) em[i] = 0;
          if (f === 0) {
            const mv = d.mask ? d.mask[i] : 0;
            if (mv) { if (!mask) mask = new Uint8Array(n); mask[i] = mv; }
            else if (mask) mask[i] = 0;
          }
        }
      }
      frames.push(fpx);
      ems.push(em);
    }
    let fps = base.fps;
    for (const d of decals) if (d.frames.length > base.frames.length) fps = d.fps;
    return finishRecord({
      name, kind: base.kind, w, h, px: frames[0], frames, em: ems[0], ems, mask,
      fps, scale: base.scale, hang: base.hang, seeThrough: base.seeThrough, def: base.def,
    });
  }

  /* ---------------------------------------------------------- abandoned */
  /**
   * Derive the 'abandoned' variant: darker, desaturated, grime, water stains, cracks, peeling
   * paint, dust; equipment goes dark (no emissive). Deterministic per texture name.
   */
  let AGE = null; // shared tileable 64×64 noise fields for ageing: grime, peel, mould, dust
  function ageFields() {
    if (AGE) return AGE;
    const f = (cells, oct, seed) => {
      const a = new Float32Array(64 * 64);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) a[y * 64 + x] = fbm(x, y, 64, cells, oct, seed);
      return a;
    };
    AGE = { grime: f(4, 3, 4711), peel: f(5, 3, 404), mould: f(8, 2, 99), wob: f(6, 2, 5150) };
    return AGE;
  }
  function deriveAbandoned(rec) {
    if (rec.parts) {
      const base = variantOf(rec.parts[0], 'abandoned');
      const decals = rec.parts.slice(1).map((i) => variantOf(i, 'abandoned'));
      const out = composeRecords(rec.name, base, decals);
      out.id = rec.id;
      out.variant = 'abandoned';
      return out;
    }
    const w = rec.w, h = rec.h, n = w * h;
    const r = rng(hashStr(rec.name + '#abandoned'));
    const seed = hashStr(rec.name) & 0xffff;
    const kind = rec.kind;
    const isCeil = /^ceil/.test(rec.name);
    // Per-pixel ageing map shared by every frame: multiply, stain tint, override colour.
    const F = ageFields();
    const ox = seed & 63, oy = (seed >> 6) & 63;
    const G = (x, y, a) => a[(((y + oy) & 63) << 6) | ((x + ox) & 63)];
    const mulF = new Float32Array(n).fill(1);
    const tintA = new Float32Array(n); // stain weight
    const over = new Uint32Array(n); // override colours (0 = none)
    const crack = new Uint8Array(n);
    const tile = kind === 'wall' || kind === 'floor';
    // grime: low-frequency blotches, heavier toward the floor on walls
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const g = G(x, y, F.grime);
        // (lighter than it used to be: the 2049 station is seen in daylight and must read)
        let f = 0.74 + 0.24 * g;
        if (kind === 'wall') f *= 1 - 0.16 * Math.pow(y / h, 2.2);
        if (kind === 'floor' && !isCeil) f *= 0.95;
        mulF[y * w + x] = f;
      }
    if (kind === 'wall' || isCeil) {
      // water stains from above: tide-marked brown runs
      const ns = kind === 'wall' ? 1 + Math.floor(r() * 3) : 2;
      for (let s = 0; s < ns; s++) {
        const sx = r() * w, sw = 5 + r() * 12, len = isCeil ? 12 + r() * 20 : 18 + r() * 40, sy = isCeil ? r() * h : 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            let dx = Math.abs(x - sx);
            if (dx > w / 2) dx = w - dx;
            let inside;
            if (isCeil) inside = Math.hypot(dx, y - sy) / (sw + len * 0.3);
            else {
              const wob = (G(s * 17, y, F.wob) - 0.5) * 6;
              const width = sw * (1 - (y / len) * 0.6) + wob;
              inside = y > len ? 2 : dx / Math.max(1, width);
            }
            const i = y * w + x;
            if (inside < 0.9) tintA[i] = Math.max(tintA[i], 0.3 * (1 - inside * 0.6));
            else if (inside < 1.05) tintA[i] = Math.max(tintA[i], 0.45);
          }
      }
    }
    if (kind !== 'sprite') {
      // cracks: random walks
      const nc = kind === 'decal' ? 0 : r() < 0.6 ? 1 : 2;
      for (let c = 0; c < nc; c++) {
        let x = r() * w, y = kind === 'wall' ? r() * h * 0.6 : r() * h, a = r() * Math.PI * 2;
        const len = 10 + r() * 22;
        for (let k = 0; k < len; k++) {
          a += (r() - 0.5) * 0.7;
          x += Math.cos(a);
          y += Math.abs(Math.sin(a)) * (kind === 'wall' ? 1 : Math.sign(Math.sin(a)) || 1);
          const xi = ((Math.floor(x) % w) + w) % w, yi = Math.floor(y);
          if (yi < 0 || yi >= h) break;
          const i = yi * w + xi;
          if ((rec.px[i] >>> 24) === 0) continue;
          mulF[i] *= 0.42;
          crack[i] = 1;
          const j = yi * w + ((xi + 1) % w);
          if (!crack[j] && (rec.px[j] >>> 24)) mulF[j] *= 1.12;
        }
      }
    }
    if (rec.def && rec.def.peel) {
      // peeling paint: organic patches of bare plaster; curled lit edge on top, shadow below
      const inP = (x, y) => G(x, y, F.peel) > 0.66;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!inP(x, y)) continue;
          over[i] = mix(RGB(168, 162, 146), RGB(138, 132, 118), h2(x, y, 9));
          if (!inP(x, y - 1)) over[i] = RGB(206, 200, 184);
          else if (!inP(x, y + 1) && y + 1 < h) over[(y + 1) * w + x] = over[(y + 1) * w + x] || 0;
        }
      for (let y = 1; y < h; y++)
        for (let x = 0; x < w; x++) if (!inP(x, y) && inP(x, y - 1)) mulF[y * w + x] *= 0.55;
    }
    const stainCol = RGB(86, 64, 38);
    const dust = RGB(118, 112, 102);
    const frames = rec.frames.map((src, fi) => {
      const o = new Uint32Array(n);
      const em = rec.ems ? rec.ems[fi] || rec.em : rec.em;
      for (let i = 0; i < n; i++) {
        let c = src[i];
        const a = c >>> 24;
        if (a === 0) { o[i] = 0; continue; }
        if (over[i]) c = withA(over[i], a);
        // dead equipment: what used to glow (LED digits, lamps, screens, light panels) is dark glass
        if (em && em[i] > 40) { const L0 = lum(c); c = withA(mix(c, RGB(L0, L0, L0), 0.6), a); c = mul(c, 0.42); }
        // desaturate
        const L = lum(c);
        const sat = kind === 'sprite' ? 0.55 : 0.68;
        let rr = L + (cR(c) - L) * sat, gg = L + (cG(c) - L) * sat, bb = L + (cB(c) - L) * sat;
        const f = mulF[i] * (kind === 'sprite' ? 0.9 : 0.88);
        rr *= f; gg *= f; bb *= f;
        const t = rec.mask && rec.mask[i] === 1 ? tintA[i] * 0.25 : tintA[i];
        if (t) { rr += (cR(stainCol) - rr) * t; gg += (cG(stainCol) - gg) * t; bb += (cB(stainCol) - bb) * t; }
        if (kind === 'floor' && !isCeil) {
          const dd = 0.18 + 0.2 * h2(i & 63, i >> 6, seed + 7);
          rr += (cR(dust) - rr) * dd; gg += (cG(dust) - gg) * dd; bb += (cB(dust) - bb) * dd;
        }
        o[i] = RGB(cl(rr), cl(gg), cl(bb), a);
      }
      if (kind === 'sprite') {
        // dust settles on upward-facing edges
        for (let y = 1; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if ((o[i] >>> 24) > 128 && (o[i - w] >>> 24) < 64 && h2(x, y, seed) < 0.7) o[i] = mix(o[i], withA(dust, o[i] >>> 24), 0.45);
          }
      }
      return o;
    });
    // mould along the base of walls
    if (kind === 'wall') {
      for (const o of frames)
        for (let y = h - 14; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!(o[i] >>> 24)) continue;
            const m = G(x, y, F.mould) * ((y - (h - 14)) / 14);
            if (m > 0.42) o[i] = mix(o[i], RGB(34, 40, 26), Math.min(0.7, (m - 0.42) * 2.5));
          }
    }
    let mask = rec.mask ? new Uint8Array(rec.mask) : null;
    if (mask) for (let i = 0; i < n; i++) if (crack[i]) mask[i] = 0; // cracks cut through glass
    const out = {
      id: rec.id, name: rec.name, kind, w, h, px: frames[0], frames, em: null, ems: null, mask,
      fps: rec.fps, scale: rec.scale, hang: rec.hang, seeThrough: rec.seeThrough, def: rec.def, variant: 'abandoned',
    };
    if (rec.def && rec.def.abandon) {
      for (const fpx of frames) {
        const p = new Pic(w, h, kind === 'wall' || kind === 'floor', kind === 'floor');
        p.px = fpx;
        p.mask = out.mask;
        rec.def.abandon(p, rng(hashStr(rec.name + '#b')));
        out.mask = p.mask;
      }
    }
    return finishRecord(out);
  }

  /* ================================================================ API */
  function lookup(name) {
    if (typeof name === 'number') return recs[name] ? name : lookup('missing');
    if (!name) return 0;
    let id = ids.get(name);
    if (id) return id;
    if (!built) build();
    id = ids.get(name);
    if (id) return id;
    if (String(name).includes('+')) {
      const parts = String(name).split('+');
      if (parts.every((p) => ids.has(p.trim()))) return register(makeComposite(String(name)));
    }
    if (!warned.has(name)) {
      warned.add(name);
      console.warn('[textures] unknown texture "' + name + '" → missing');
    }
    return ids.get('missing') || 1;
  }
  function variantOf(id, variant) {
    const rec = recs[id] || recs[lookup('missing')];
    // spec.noAge: the thing does not belong to the building (the entity) — no abandoned look
    if (variant !== 'abandoned' || (rec.def && rec.def.noAge)) return rec;
    let a = abRecs[rec.id];
    if (!a) a = abRecs[rec.id] = deriveAbandoned(rec);
    return a;
  }

  /**
   * Derive a variant for every texture in small idle slices (so the first CCTV look at the
   * abandoned station, or the collapse blend, never hitches).
   */
  let prewarmed = false;
  function prewarm(variant = 'abandoned', budgetMs = 5) {
    if (prewarmed) return;
    prewarmed = true;
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < DEFS.length && performance.now() - t0 < budgetMs) {
        const id = ids.get(DEFS[i++].name);
        if (id) variantOf(id, variant);
      }
      if (i < DEFS.length) setTimeout(step, 20);
    };
    setTimeout(step, 400);
  }

  DA.textures = {
    build,
    prewarm,
    id: lookup,
    get(idOrName, variant = 'normal') {
      if (!built) build();
      const id = typeof idOrName === 'number' ? idOrName : lookup(idOrName);
      return variantOf(id, variant);
    },
    name(id) { return recs[id] ? recs[id].name : null; },
    has(name) { if (!built) build(); return ids.has(name); },
    list() { return DEFS.map((d) => d.name); },
    get byId() { return recs; },
    variantOf,
    rgb: RGB,
    text(pic, str, x, y, col, s) { return Pic.prototype.text.call(pic, str, x, y, col, s); },
    textWidth,
    Pic,
    /** Draw a texture into a new canvas (atlas / UI thumbnails). */
    toCanvas(name, variant = 'normal', frame = 0) {
      const rec = this.get(name, variant);
      const cv = document.createElement('canvas');
      cv.width = rec.w;
      cv.height = rec.h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(rec.w, rec.h);
      new Uint32Array(img.data.buffer).set(rec.frames[Math.min(frame, rec.frames.length - 1)]);
      ctx.putImageData(img, 0, 0);
      return cv;
    },
    buildMs: 0,
  };

  // Paint on boot (textures.js loads before raycaster.js, so its handler runs first), then
  // derive the abandoned variants in the background.
  DA.bus.on('boot', () => build());
  DA.bus.on('booted', () => prewarm('abandoned'));

  /* ====================================================================
   * TEXTURE DEFINITIONS
   * ==================================================================== */
  const H = HEX;
  /* ------------------------------------------------------------ shared helpers */
  const METAL = H(0x6c6e6a), DARKM = H(0x1d1e1d), BEIGE = H(0xbdb49a), BRASS = H(0xb89548);
  /** Flat panel with noise + bevel. */
  function panel(p, x, y, w, h, c, rnd, amp = 0.025, hi, lo) {
    p.rect(x, y, w, h, c);
    if (rnd) p.noise(x, y, w, h, amp, rnd);
    p.bevel(x, y, w, h, hi, lo);
  }
  function screw(p, x, y) { p.set(x, y, H(0xa6a69e)); p.set(x + 1, y, H(0x3a3a36)); }
  function rivet(p, x, y) { p.set(x, y, H(0x9aa09a)); p.set(x + 1, y + 1, H(0x1e201e)); p.set(x + 1, y, H(0x5a605a)); }
  /** Round knob, lit from the top-left. */
  function knob(p, cx, cy, r, c = H(0xb4b4ac)) {
    p.circle(cx, cy, r, (x, y, dx, dy) => mul(c, 1.05 - 0.32 * (dx + dy)));
    p.set(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.4), mul(c, 1.35));
  }
  function led(p, x, y, col, on, lvl = 255) {
    p.set(x, y, on ? col : mul(col, 0.22));
    if (on) p.emitPx(x, y, lvl);
  }
  /** Backlit amber tuning dial with ticks and a red needle. */
  function amberDial(p, x, y, w, h, needle, lvl = 220) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const u = (xx - x) / (w - 1), v = (yy - y) / (h - 1);
        const glow = 1 - Math.abs(u - 0.5) * 0.7 - Math.abs(v - 0.45) * 0.5;
        p.set(xx, yy, mix(H(0x8a4a10), H(0xffc060), Math.max(0, glow)));
      }
    for (let xx = x + 1; xx < x + w - 1; xx += 2) p.set(xx, y + 1, H(0x4a2808));
    for (let xx = x + 1; xx < x + w - 1; xx += 6) p.set(xx, y + 2, H(0x4a2808));
    p.emit(x, y, w, h, lvl);
    p.vline(x + needle, y, y + h - 1, H(0xd02010));
    p.bevel(x - 1, y - 1, w + 2, h + 2, 0.6, 1.3);
  }
  /** Backlit cream VU meter with a black needle. */
  function vuMeter(p, x, y, w, h, t, lvl = 160) {
    p.rect(x, y, w, h, (xx, yy) => mix(H(0xd8c890), H(0xf4ecc8), 1 - (yy - y) / h));
    for (let k = 0; k < w - 2; k += 2) p.set(x + 1 + k, y + 1 + Math.round(Math.abs(k - (w - 3) / 2) / w * 2), H(0x3a3020));
    p.set(x + w - 3, y + 1, H(0xc02010));
    p.set(x + w - 2, y + 1, H(0xc02010));
    p.emit(x, y, w, h, lvl);
    const cx = x + w / 2, cy = y + h + 1, ang = -2.3 + t * 1.6;
    p.line(cx, cy - 1, cx + Math.cos(ang) * (h + 1), cy + Math.sin(ang) * (h + 1), H(0x141410));
    p.bevel(x - 1, y - 1, w + 2, h + 2, 0.6, 1.3);
  }
  /** Tileable vertical wood grain. */
  function woodGrain(p, x0, y0, w, h, base, s, contrast = 0.3) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const warp = (fbm(x, y, 64, 2, 2, s) - 0.5) * 8;
        const g = vnoise((x + warp) * 0.7, y * 0.05, 45, 4, s + 3);
        const f = 1 - contrast / 2 + contrast * g + (h2(x, y, s) - 0.5) * 0.05;
        p.set(x, y, mul(base, f));
      }
  }
  /** Cinder/concrete block courses. col(x,y) gives the paint colour at a pixel. */
  function blocks(p, col, bw = 16, bh = 8, joint = 0.84, seed = 5) {
    for (let y = 0; y < 64; y++) {
      const course = Math.floor(y / bh), by = y % bh;
      for (let x = 0; x < 64; x++) {
        const bxRaw = x + (course & 1 ? bw / 2 : 0);
        const bx = bxRaw % bw, blk = Math.floor(bxRaw / bw) % (64 / bw);
        let f = 1 + (h2(blk, course, seed) - 0.5) * 0.06;
        if (by === 0 || bx === 0) f *= joint;
        else if (by === 1 || bx === 1) f *= 1.05;
        else if (by === bh - 1) f *= 0.95;
        const pore = h2(x, y, seed + 11);
        if (pore < 0.05) f *= 0.9;
        else if (pore > 0.97) f *= 1.05;
        f *= 1 + (fbm(x, y, 64, 4, 2, seed + 21) - 0.5) * 0.08;
        p.set(x, y, mul(col(x, y), f));
      }
    }
  }
  /** Dark rubber cove base along the floor line. */
  function coveBase(p, y0 = 60, c = H(0x2e2a26)) {
    p.rect(0, y0, 64, 64 - y0, c);
    p.hline(0, 63, y0, mul(c, 1.5));
    p.hline(0, 63, 63, mul(c, 0.7));
  }
  function scuffs(p, rnd, y0, y1, n = 5, c = H(0x2a2824), t = 0.28) {
    for (let k = 0; k < n; k++) {
      const x = Math.floor(rnd() * 64), y = y0 + Math.floor(rnd() * (y1 - y0)), len = 3 + Math.floor(rnd() * 8);
      for (let i = 0; i < len; i++) p.blend(x + i, y + (rnd() < 0.2 ? 1 : 0), c, t * (0.5 + rnd() * 0.6));
    }
  }
  /** Stencilled text: slightly worn, with stencil bridges. */
  function stencil(p, str, x, y, c, s, rnd, wear = 0.14) {
    const tmp = new Pic(64, 64);
    tmp.text(str, x, y, c, s);
    for (let i = 0; i < 64 * 64; i++) {
      if (!tmp.px[i]) continue;
      const xx = i & 63, yy = i >> 6;
      if (rnd() < wear) continue;
      p.blend(xx, yy, c, 0.75 + rnd() * 0.25);
    }
  }
  /** Standard window: backed surround, painted steel frame, glass (mask 1), concrete sill. */
  function windowFrame(p, x0, y0, x1, y1, rnd, cross) {
    p.clear(0, 0, 64, 64);
    const fr = H(0x55574f);
    p.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, fr);
    p.noise(x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0.04, rnd);
    p.bevel(x0, y0, x1 - x0 + 1, y1 - y0 + 1, 1.25, 0.6);
    const gx0 = x0 + 2, gy0 = y0 + 2, gx1 = x1 - 2, gy1 = y1 - 2;
    for (let y = gy0; y <= gy1; y++)
      for (let x = gx0; x <= gx1; x++) {
        const v = (y - gy0) / (gy1 - gy0);
        let c = mix(H(0x1a2029), H(0x0b0e12), v);
        const d = (x - gx0) + (y - gy0) * 0.6;
        if (d % 23 > 17) c = mix(c, H(0x5a6672), 0.1); // soft reflection band
        p.set(x, y, c);
      }
    p.maskRect(gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1, 1);
    // recess shadow on the glass top/left
    for (let x = gx0; x <= gx1; x++) p.mul(x, gy0, 0.55);
    for (let y = gy0; y <= gy1; y++) p.mul(gx0, y, 0.7);
    const mx = Math.floor((x0 + x1) / 2);
    p.rect(mx - 1, y0, 2, y1 - y0 + 1, fr);
    p.set(mx - 1, y0 + 1, mul(fr, 1.3));
    p.vline(mx, y0 + 1, y1 - 1, mul(fr, 0.7));
    p.maskRect(mx - 1, y0, 2, y1 - y0 + 1, 0);
    if (cross) {
      const my = Math.floor((y0 + y1) / 2);
      p.rect(x0, my, x1 - x0 + 1, 2, fr);
      p.hline(x0 + 1, x1 - 1, my, mul(fr, 1.25));
      p.maskRect(x0, my, x1 - x0 + 1, 2, 0);
    } else {
      p.rect(mx - 2, Math.floor(y0 + (y1 - y0) * 0.62), 4, 2, H(0x8a8a80)); // latch
      p.maskRect(mx - 2, Math.floor(y0 + (y1 - y0) * 0.62), 4, 2, 0);
    }
    // sill
    const sy = y1 + 1;
    p.rect(x0 - 3, sy, x1 - x0 + 7, 3, H(0x9a968a));
    p.noise(x0 - 3, sy, x1 - x0 + 7, 3, 0.05, rnd);
    p.hline(x0 - 3, x1 + 3, sy, H(0xb8b4a8));
    p.hline(x0 - 3, x1 + 3, sy + 2, H(0x5a5850));
  }

  /* ------------------------------------------------------------ walls */
  T('missing', {}, (p) => {
    p.rect(0, 0, 64, 64, (x, y) => (((x >> 3) + (y >> 3)) & 1 ? H(0xff00ff) : H(0x101010)));
  });

  const CREAM = H(0xc6bd9e), MINT = H(0x839577), STRIPE = H(0x684830);
  T('wall_paint', { peel: true }, (p, r) => {
    blocks(p, (x, y) => (y >= 42 ? MINT : CREAM));
    // grime toward the floor
    p.mulRect(0, 44, 64, 20, (x, y) => 1 - ((y - 44) / 20) * 0.09);
    p.rect(0, 40, 64, 2, STRIPE);
    p.hline(0, 63, 40, mul(STRIPE, 1.2));
    p.hline(0, 63, 42, mul(MINT, 0.78));
    coveBase(p, 60);
    scuffs(p, r, 48, 59, 7);
    scuffs(p, r, 20, 36, 2, H(0x6a6252), 0.18);
  });

  T('wall_panel', {}, (p, r) => {
    const grooves = [0, 9, 21, 30, 41, 50, 57];
    const bases = [H(0x5e3d25), H(0x533620), H(0x684429), H(0x5a3a22), H(0x4f331e), H(0x61402a), H(0x573922)];
    for (let x = 0; x < 64; x++) {
      let b = 0;
      for (let k = 0; k < grooves.length; k++) if (x >= grooves[k]) b = k;
      woodGrain(p, x, 0, 1, 64, bases[b], 40 + b * 7, 0.36);
    }
    for (const g of grooves) {
      p.vline(g, 0, 63, H(0x1e140c));
      p.vline(g + 1, 0, 63, (x, y) => mul(p.get(x, y), 0.78));
    }
    for (let k = 0; k < 3; k++) {
      const kx = 4 + Math.floor(r() * 56), ky = 8 + Math.floor(r() * 40);
      p.ellipse(kx, ky, 1.6, 2.4, H(0x2e1d10));
      p.set(kx, ky - 3, mul(bases[1], 0.7));
    }
    // top moulding and baseboard
    p.rect(0, 0, 64, 3, H(0x3b2717));
    p.hline(0, 63, 2, H(0x6a4a30));
    p.rect(0, 57, 64, 7, H(0x3f2a19));
    p.hline(0, 63, 57, H(0x7a5638));
    p.hline(0, 63, 63, H(0x24170d));
    scuffs(p, r, 50, 56, 3, H(0x1a1008), 0.35);
  });

  T('wall_tile', {}, (p, r) => {
    p.rect(0, 0, 64, 14, H(0xb7b6a6));
    p.noise(0, 0, 64, 14, 0.03, r);
    p.rect(0, 14, 64, 2, H(0xdcdcd2));
    p.hline(0, 63, 14, H(0xecece4));
    p.hline(0, 63, 15, H(0x9a9a90));
    for (let y = 16; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const tx = x & 7, ty = (y - 16) & 7, row = (y - 16) >> 3, col = x >> 3;
        const accent = row === 3;
        let c = accent ? H(0x78958f) : H(0xd9d8cb);
        c = mul(c, 1 + (h2(col, row, 3) - 0.5) * 0.06);
        if (tx === 0 || ty === 0) c = mul(H(0xa3a298), 1 - Math.max(0, (y - 40) / 24) * 0.25);
        else if (tx === 1 && ty === 1) c = mul(c, 1.12);
        else if (tx === 7 || ty === 7) c = mul(c, 0.92);
        p.set(x, y, c);
      }
    p.noise(0, 16, 64, 48, 0.015, r);
    scuffs(p, r, 50, 63, 3, H(0x6a6a60), 0.2);
  });

  T('wall_kitchen', { peel: true }, (p, r) => {
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 64; x++) {
        let c = H(0xcfc39a);
        if (x % 8 === 3) c = mul(c, 0.94);
        if (x % 8 === 4 && (y >> 1) % 3 === 0) c = mul(H(0xb99e70), 1);
        p.set(x, y, c);
      }
    p.noise(0, 0, 64, 28, 0.025, r);
    p.rect(0, 28, 64, 3, H(0x6b4a2c));
    p.hline(0, 63, 28, H(0x8d6a45));
    p.hline(0, 63, 30, H(0x3e2a18));
    for (let y = 31; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const tx = x & 7, ty = (y - 31) & 7, row = (y - 31) >> 3, col = x >> 3;
        let c = row === 0 && (col & 1) ? H(0x8a5a32) : H(0xc8ab7c);
        c = mul(c, 1 + (h2(col, row, 8) - 0.5) * 0.07);
        if (tx === 0 || ty === 0) c = H(0x8f7d5e);
        else if (tx === 1 && ty === 1) c = mul(c, 1.1);
        else if (tx === 7 || ty === 7) c = mul(c, 0.9);
        p.set(x, y, c);
      }
    coveBase(p, 61, H(0x3a2e22));
    scuffs(p, r, 52, 60, 3);
  });

  T('wall_brick', {}, (p, r) => {
    const cols = [H(0x7a3a2a), H(0x6c3324), H(0x844230), H(0x70402c), H(0x763626)];
    for (let y = 0; y < 64; y++) {
      const course = y >> 3, by = y & 7;
      for (let x = 0; x < 64; x++) {
        const bxRaw = x + (course & 1 ? 8 : 0), bx = bxRaw & 15, blk = (bxRaw >> 4) & 3;
        let c;
        if (by === 7 || bx === 15) c = mul(H(0x57524b), 0.9 + h2(x, y, 4) * 0.2);
        else {
          c = cols[Math.floor(h2(blk, course, 2) * cols.length)];
          let f = 0.9 + h2(x, y, 7) * 0.16 + (fbm(x, y, 64, 8, 2, 12) - 0.5) * 0.25;
          if (by === 0) f *= 1.12;
          if (by === 6 || bx === 14) f *= 0.82;
          c = mul(c, f);
        }
        p.set(x, y, c);
      }
    }
    // efflorescence near the floor, soot near the ceiling
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = fbm(x, y, 64, 4, 3, 77);
        if (y > 40 && n > 0.5) p.blend(x, y, H(0xb0aa9c), Math.min(0.45, (n - 0.5) * 2 * ((y - 40) / 24)));
        if (y < 14) p.mul(x, y, 0.8 + (y / 14) * 0.2);
      }
  });

  T('wall_rock', {}, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const w = fbm(x, y, 64, 3, 2, 91) * 10;
        const n = fbm(x + w, y + w * 0.5, 64, 4, 4, 31);
        let c = mix(H(0x2a2622), H(0x6a6056), n);
        const ridge = Math.abs(fbm(x, y * 1.3, 64, 5, 3, 52) - 0.5);
        if (ridge < 0.025) c = mul(c, 0.45);
        const up = n - fbm(x + w, y + w * 0.5 - 1.5, 64, 4, 4, 31);
        if (up < -0.035) c = mix(c, H(0x7a8894), Math.min(0.32, -up * 5)); // wet glint on ledges
        p.set(x, y, c);
      }
    // seepage streaks
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(r() * 64), y0 = Math.floor(r() * 30), len = 14 + Math.floor(r() * 30);
      for (let y = y0; y < Math.min(64, y0 + len); y++) {
        p.mul(x, y, 0.78);
        if ((y + k) % 5 === 0) p.blend(x, y, H(0xa8b4bc), 0.35);
      }
    }
  });

  T('concrete_ext', {}, (p, r) => {
    blocks(p, () => H(0x7a7870), 16, 8, 0.8, 17);
    // metal fascia / drip edge
    p.rect(0, 0, 64, 4, H(0x45443f));
    p.hline(0, 63, 3, H(0x2a2926));
    p.hline(0, 63, 0, H(0x5e5c56));
    // rain streaks from the drip edge
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(r() * 64), w = r() < 0.4 ? 2 : 1, len = 10 + Math.floor(r() * 42);
      for (let y = 4; y < 4 + len && y < 64; y++) {
        const t = 1 - (y - 4) / len;
        for (let i = 0; i < w; i++) p.mul(x + i, y, 1 - 0.28 * t);
      }
    }
    // splash-back and moss along the ground
    for (let y = 50; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = fbm(x, y, 64, 8, 3, 61);
        const t = (y - 50) / 14;
        p.mul(x, y, 1 - 0.25 * t);
        if (n * t > 0.28) p.blend(x, y, H(0x34422a), Math.min(0.75, (n * t - 0.28) * 3));
      }
  });

  T('window', {}, (p, r) => windowFrame(p, 7, 6, 56, 40, r, false));
  T('window_small', {}, (p, r) => windowFrame(p, 19, 9, 44, 33, r, true));

  /* ------------------------------------------------------------ doors */
  function doorFrame(p, c = H(0x8a8676)) {
    p.rect(0, 0, 3, 64, c);
    p.rect(61, 0, 3, 64, c);
    p.rect(0, 0, 64, 3, c);
    p.vline(0, 0, 63, mul(c, 1.25));
    p.vline(2, 3, 63, mul(c, 0.6));
    p.vline(61, 3, 63, mul(c, 1.2));
    p.vline(63, 0, 63, mul(c, 0.7));
    p.hline(0, 63, 0, mul(c, 1.25));
    p.hline(3, 60, 2, mul(c, 0.6));
  }
  function hinge(p, x, y) { p.rect(x, y, 2, 5, H(0x3a3834)); p.set(x, y, H(0x8a8a80)); }

  T('door_wood', {}, (p, r) => {
    woodGrain(p, 3, 3, 58, 61, H(0x7a5232), 12, 0.34);
    const pan = (x, y, w, h) => {
      p.bevel(x, y, w, h, 0.62, 1.3);
      p.bevel(x + 2, y + 2, w - 4, h - 4, 1.2, 0.72);
    };
    pan(9, 8, 46, 21);
    pan(9, 34, 46, 22);
    doorFrame(p);
    hinge(p, 3, 10);
    hinge(p, 3, 48);
    // knob + escutcheon
    p.rect(51, 32, 5, 8, H(0x8a7040));
    knob(p, 53.5, 35.5, 2.2, BRASS);
    p.set(53, 38, H(0x201810));
    // kick plate
    for (let y = 57; y < 63; y++) for (let x = 4; x < 60; x++) p.set(x, y, mul(H(0x9a9a92), 0.92 + h2(0, y, 3) * 0.12 + h2(x, y, 1) * 0.05));
    p.hline(4, 59, 57, H(0xc0c0b8));
    scuffs(p, r, 58, 62, 4, H(0x303028), 0.4);
  });

  T('door_metal', {}, (p, r) => {
    for (let y = 3; y < 64; y++) for (let x = 3; x < 61; x++) p.set(x, y, mul(H(0x6e7478), 0.95 + fbm(x, y, 64, 2, 2, 5) * 0.1 + h2(x, y, 2) * 0.03));
    p.vline(31, 3, 63, H(0x565c60));
    doorFrame(p, H(0x7a7a72));
    // wired glass vision panel
    p.rect(38, 8, 16, 16, H(0x2a2e30));
    for (let y = 9; y < 23; y++)
      for (let x = 39; x < 53; x++) {
        let c = mix(H(0x222a30), H(0x10141a), (y - 9) / 14);
        if ((x + y) % 5 === 0 || (x - y + 40) % 5 === 0) c = H(0x4a5256);
        p.set(x, y, c);
      }
    p.bevel(38, 8, 16, 16, 0.7, 1.3);
    // push bar
    p.rect(8, 33, 46, 4, H(0xb0b4b4));
    p.hline(8, 53, 33, H(0xdadede));
    p.hline(8, 53, 36, H(0x6a6e70));
    p.rect(6, 32, 3, 6, H(0x2a2c2e));
    p.rect(53, 32, 3, 6, H(0x2a2c2e));
    hinge(p, 3, 9);
    hinge(p, 3, 50);
    scuffs(p, r, 54, 63, 8, H(0x1e1e1c), 0.4);
  });

  T('door_front', {}, (p, r) => {
    const al = H(0x9ca2a4);
    p.rect(3, 3, 58, 61, al);
    p.noise(3, 3, 58, 61, 0.02, r);
    for (let y = 8; y < 45; y++)
      for (let x = 9; x < 55; x++) {
        const v = (y - 8) / 37;
        let c = mix(H(0x1c232b), H(0x0c1015), v);
        if ((x - 9 + (y - 8) * 0.7) % 29 > 23) c = mix(c, H(0x6a7682), 0.12);
        p.set(x, y, c);
      }
    p.maskRect(9, 8, 46, 37, 1);
    p.bevel(8, 7, 48, 39, 0.6, 1.3);
    // vinyl lettering on the glass
    p.textC('STATION 14', 32, 11, H(0xd8d8d0));
    p.maskRect(9, 11, 46, 5, 0);
    p.textC('STAFF ONLY', 30, 38, H(0xb8b8b0));
    p.maskRect(9, 38, 46, 5, 0);
    // pull handle
    p.rect(50, 22, 2, 18, H(0xcfd4d4));
    p.vline(51, 22, 39, H(0x7a8080));
    p.maskRect(50, 22, 2, 18, 0);
    // kick panel
    p.bevel(8, 47, 48, 14, 1.2, 0.7);
    p.hline(9, 54, 54, mul(al, 0.9));
    doorFrame(p, H(0x6a6e70));
    scuffs(p, r, 55, 62, 4, H(0x404040), 0.3);
  });

  T('door_steel', {}, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = fbm(x, y, 64, 4, 3, 33);
        p.set(x, y, mul(H(0x4d534f), 0.85 + n * 0.3 + h2(x, y, 3) * 0.04));
      }
    // heavy border + bands
    p.bevel(0, 0, 64, 64, 1.3, 0.5);
    p.bevel(3, 3, 58, 58, 0.7, 1.25);
    for (const by of [13, 47]) {
      p.mulRect(3, by, 58, 4, 1.12);
      p.hline(3, 60, by, mul(H(0x6a706c), 1.2));
      p.hline(3, 60, by + 3, H(0x262a28));
    }
    for (let k = 6; k < 60; k += 6) { rivet(p, k, 5); rivet(p, k, 57); rivet(p, 5, k); rivet(p, 57, k); rivet(p, k, 14); rivet(p, k, 48); }
    // rust bleeding from rivets
    for (let k = 0; k < 16; k++) {
      const x = 5 + Math.floor(r() * 54), y0 = [6, 15, 49, 58][Math.floor(r() * 4)], len = 3 + Math.floor(r() * 10);
      for (let y = y0; y < Math.min(63, y0 + len); y++) p.blend(x, y, H(0x7a3e1c), 0.4 * (1 - (y - y0) / len));
    }
    stencil(p, 'RELAY', 32 - textWidth('RELAY', 2) / 2, 20, H(0xc9b77a), 2, r, 0.08);
    stencil(p, 'CHAMBER', 32 - textWidth('CHAMBER', 1) / 2, 34, H(0xc9b77a), 1, r, 0.03);
    // lever latch
    p.rect(49, 28, 3, 9, H(0x2a2e2c));
    p.rect(50, 30, 9, 3, H(0x8a908c));
    p.hline(50, 58, 30, H(0xb0b6b2));
    p.set(50, 31, H(0x1a1c1a));
  });

  T('door_records', {}, (p, r) => {
    woodGrain(p, 3, 3, 58, 61, H(0x5a3a24), 71, 0.3);
    p.bevel(8, 30, 48, 26, 0.65, 1.25);
    doorFrame(p, H(0x6a665c));
    // brass plaque
    p.rect(16, 15, 32, 10, BRASS);
    p.noise(16, 15, 32, 10, 0.05, r);
    p.bevel(16, 15, 32, 10, 1.3, 0.6);
    p.textC('RECORDS', 32, 18, H(0x2a1e0c));
    screw(p, 17, 16);
    screw(p, 45, 16);
    // deadbolt + knob
    p.circle(53.5, 29.5, 2.2, BRASS);
    p.set(53, 29, H(0x201810));
    p.rect(51, 33, 5, 8, H(0x7a6034));
    knob(p, 53.5, 36.5, 2.2, BRASS);
    hinge(p, 3, 10);
    hinge(p, 3, 48);
    scuffs(p, r, 56, 62, 5, H(0x1a1008), 0.35);
  });

  T('door_blast', { frames: 2, fps: 1.2 }, (p, r, f) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) p.set(x, y, mul(H(0x686c68), 0.86 + fbm(x, y, 64, 4, 3, 44) * 0.25 + h2(x, y, 1) * 0.04));
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const e = Math.min(x, y, 63 - x, 63 - y);
        if (e < 5) p.set(x, y, mul(((x + y) >> 2) & 1 ? H(0xc9a227) : H(0x1c1c18), 0.9 + h2(x, y, 5) * 0.15));
      }
    p.bevel(5, 5, 54, 54, 0.6, 1.3);
    for (let k = 8; k < 58; k += 7) { rivet(p, k, 7); rivet(p, k, 55); rivet(p, 7, k); rivet(p, 55, k); }
    // locking wheel
    p.ring(32, 35, 10, H(0x2e302e), 3);
    p.ring(32, 35, 9, H(0x8a8e8a), 1);
    for (let a = 0; a < 3; a++) {
      const ang = a * 2.094 + 0.4;
      p.line(32, 35, 32 + Math.cos(ang) * 8, 35 + Math.sin(ang) * 8, H(0x3a3c3a));
    }
    p.circle(32, 35, 2.5, H(0x9a9e9a));
    p.textC('INTERLOCK', 30, 10, H(0xd0d0c8));
    // interlock lamp (blinks)
    p.rect(47, 16, 7, 6, H(0x1a1a18));
    const on = f === 0;
    p.rect(48, 17, 5, 4, on ? H(0xff3020) : H(0x5a1410));
    if (on) { p.emit(48, 17, 5, 4, 255); p.set(49, 17, H(0xffb0a0)); }
    p.text('A', 58, 17, H(0x1c1c18));
  });

  T('door_jamb', {}, (p, r) => {
    // the reveal of a door opening: painted steel frame channel with a door stop down the middle
    const F = H(0x6f6a60);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(F, 0.94 + h2(x, y, 9) * 0.08 + (fbm(x, y, 64, 2, 2, 4) - 0.5) * 0.08);
        if (x >= 28 && x < 36) c = mul(c, 1.12);
        p.set(x, y, c);
      }
    p.vline(27, 0, 63, mul(F, 0.62));
    p.vline(28, 0, 63, mul(F, 1.3));
    p.vline(35, 0, 63, mul(F, 0.7));
    p.vline(0, 0, 63, mul(F, 0.55));
    p.vline(63, 0, 63, mul(F, 0.55));
    for (const hy of [12, 46]) { p.rect(31, hy, 3, 5, H(0x8a8678)); p.set(31, hy, H(0xb0ac9e)); }
    p.rect(31, 30, 3, 6, H(0x9a968a));
    p.set(32, 32, H(0x2a2824));
    p.set(32, 33, H(0x2a2824));
    coveBase(p, 61, H(0x2e2a26));
    scuffs(p, r, 48, 60, 4, H(0x2a2824), 0.3);
  });

  /* ------------------------------------------------------------ equipment & furniture */
  const LED_G = H(0x40ff60), LED_A = H(0xffb030), LED_R = H(0xff3020);
  /** A horizontal cylinder (pipe) with round shading. */
  function pipeH(p, y, d, c, x0 = 0, x1 = 63) {
    for (let k = 0; k < d; k++) {
      const t = (k + 0.5) / d, f = 0.55 + 0.75 * Math.sin(t * Math.PI) - (t > 0.5 ? (t - 0.5) * 0.4 : 0);
      p.hline(x0, x1, y + k, mul(c, f));
    }
  }
  function pipeV(p, x, d, c, y0 = 0, y1 = 63) {
    for (let k = 0; k < d; k++) {
      const t = (k + 0.5) / d, f = 0.55 + 0.75 * Math.sin(t * Math.PI) - (t > 0.5 ? (t - 0.5) * 0.4 : 0);
      p.vline(x + k, y0, y1, mul(c, f));
    }
  }
  /** Steel shelving uprights + shelf boards; returns the shelf y positions. */
  function shelving(p, ys, posts = [0, 62], c = H(0x6e726e)) {
    for (const x of posts) {
      p.rect(x, 0, 2, 64, c);
      p.vline(x, 0, 63, mul(c, 1.25));
      for (let y = 2; y < 64; y += 4) p.set(x + 1, y, H(0x1a1a1a));
    }
    for (const y of ys) {
      p.rect(0, y, 64, 2, c);
      p.hline(0, 63, y, mul(c, 1.3));
      p.hline(0, 63, y + 2, H(0x0e0e0e));
    }
  }

  T('rack_server', { frames: 4, fps: 2.2 }, (p, r, f, fr) => {
    p.fill(H(0x111213));
    const unit = (rx, y, type, hgt) => {
      const x = rx + 3, w = 26;
      switch (type) {
        case 'patch':
          panel(p, x, y, w, hgt, H(0x3a3c3e), r);
          for (let k = 0; k < 11; k++) { p.set(x + 2 + k * 2, y + 1, H(0x0a0a0a)); p.set(x + 2 + k * 2, y + 3, H(0x0a0a0a)); }
          for (let k = 0; k < 4; k++) { const cx = x + 3 + Math.floor(r() * 20); p.vline(cx, y + hgt - 1, y + hgt + 2, [H(0x3a5a9a), H(0xb8a038), H(0x8a8a8a)][k % 3]); }
          break;
        case 'switch':
          panel(p, x, y, w, hgt, H(0x26282a), r);
          for (let k = 0; k < 12; k++) led(p, x + 2 + k * 2, y + 1, LED_G, fr() < 0.55);
          for (let k = 0; k < 12; k++) p.set(x + 2 + k * 2, y + 2, H(0x0a0a0a));
          break;
        case 'server':
          panel(p, x, y, w, hgt, H(0xb0a890), r, 0.03);
          for (let yy = y + 1; yy < y + hgt - 1; yy += 2) p.hline(x + 2, x + 11, yy, H(0x5a5648));
          p.rect(x + 14, y + 1, 7, hgt - 2, H(0x8a846e));
          p.bevel(x + 14, y + 1, 7, hgt - 2, 0.7, 1.2);
          led(p, x + 23, y + 1, LED_G, true, 200);
          led(p, x + 23, y + 3, LED_A, fr() < 0.45);
          break;
        case 'tape':
          panel(p, x, y, w, hgt, H(0x1c1c1e), r);
          p.rect(x + 4, y + 2, 12, 1, H(0x000000));
          p.text('DLT', x + 18, y, H(0x8a8a8a));
          led(p, x + 2, y + 2, LED_G, fr() < 0.3);
          break;
        case 'ups':
          panel(p, x, y, w, hgt, H(0x1a1b1c), r);
          p.rect(x + 3, y + 2, 10, 3, H(0x3a2006));
          p.hline(x + 4, x + 11, y + 3, LED_A);
          p.emit(x + 3, y + 2, 10, 3, 180);
          led(p, x + 20, y + 3, LED_G, true, 220);
          break;
        default:
          panel(p, x, y, w, hgt, H(0x242628), r);
          screw(p, x + 1, y + 1);
          screw(p, x + w - 3, y + 1);
      }
    };
    const layouts = [
      [['patch', 5], ['switch', 4], ['server', 8], ['server', 8], ['tape', 5], ['blank', 3], ['server', 14], ['ups', 7], ['blank', 4]],
      [['patch', 5], ['patch', 4], ['server', 4], ['server', 4], ['server', 4], ['blank', 3], ['server', 8], ['server', 8], ['server', 8], ['blank', 9]],
    ];
    [0, 32].forEach((rx, k) => {
      p.rect(rx, 0, 3, 64, H(0x2a2b2d));
      p.rect(rx + 29, 0, 3, 64, H(0x2a2b2d));
      p.vline(rx, 0, 63, H(0x3e4042));
      for (let y = 4; y < 62; y += 3) { p.set(rx + 1, y, H(0x5a5a5a)); p.set(rx + 30, y, H(0x5a5a5a)); }
      p.rect(rx, 0, 32, 3, H(0x202123));
      for (let x = rx + 4; x < rx + 28; x += 2) p.set(x, 1, H(0x080808));
      let y = 4;
      for (const [type, hgt] of layouts[k]) { unit(rx, y, type, hgt); y += hgt; }
      p.rect(rx, 61, 32, 3, H(0x19191a));
    });
  });

  // the rack as seen across the room; 'radio_console_off' is the same rack with the receiver switched
  // off (world swaps the faces on radio:power) — dark LED window, dead lamps, needles at rest
  T('radio_console', {}, (p, r) => radioConsole(p, r, true));
  T('radio_console_off', {}, (p, r) => radioConsole(p, r, false));
  function radioConsole(p, r, on) {
    p.clear(0, 0, 64, 64);
    panel(p, 1, 3, 62, 36, H(0x3b403c), r, 0.02);
    // row A — left receiver with the big amber dial, right: twin VU meters
    panel(p, 3, 5, 29, 12, H(0x565a56), r);
    amberDial(p, 5, 7, 19, 5, 12);
    knob(p, 28, 9.5, 2.6);
    for (let k = 0; k < 4; k++) knob(p, 7 + k * 5, 14.5, 1.3, H(0x9a9a92));
    panel(p, 33, 5, 28, 12, H(0x2c2e2c), r);
    vuMeter(p, 35, 7, 9, 5, on ? 0.3 : 0);
    vuMeter(p, 46, 7, 9, 5, on ? 0.62 : 0);
    for (const x of [57, 59]) { p.vline(x, 7, 9, H(0xb8b8b0)); p.set(x, 10, H(0x4a4a46)); }
    led(p, 58, 14, LED_R, on);
    led(p, 36, 14, LED_A, on, 200);
    // row B — silver main receiver: LED frequency readout, big tuning knob
    panel(p, 3, 18, 59, 12, H(0x8e8e88), r, 0.02, 1.3, 0.55);
    p.rect(5, 20, 25, 8, H(0x1a0604));
    if (on) {
      p.text('155.34', 7, 21, H(0xff5a28));
      p.emit(5, 20, 25, 8, 70);
      for (let y = 21; y < 26; y++) for (let x = 7; x < 29; x++) if (p.get(x, y) === H(0xff5a28)) p.emitPx(x, y, 255);
    } else {
      p.text('888.88', 7, 21, H(0x2a0c07)); // unlit segment ghosts
    }
    p.bevel(4, 19, 27, 10, 0.55, 1.3);
    for (let k = 0; k < 3; k++) knob(p, 34 + k * 5, 24, 1.6, H(0x3a3a38));
    p.circle(52, 24, 5, H(0x2a2a28));
    knob(p, 52, 24, 4, H(0x3e3e3a));
    p.set(50, 22, H(0x9a9a92));
    p.hline(34, 44, 20, H(0x5a5a54));
    // row C — speaker grille, cassette deck, LED signal bar
    p.rect(3, 31, 15, 7, H(0x1c1e1c));
    for (let y = 32; y < 37; y += 2) for (let x = 4; x < 17; x += 2) p.set(x, y, H(0x3a3e3a));
    panel(p, 19, 31, 25, 7, H(0x1e1f1e), r);
    p.rect(24, 32, 14, 3, H(0x3a3024));
    p.set(27, 33, H(0xd0d0c8)); p.set(34, 33, H(0xd0d0c8));
    for (let k = 0; k < 5; k++) p.set(21 + k * 5, 36, H(0xa0a098));
    led(p, 42, 32, LED_R, false);
    panel(p, 45, 31, 17, 7, H(0x161716), r);
    for (let k = 0; k < 7; k++) led(p, 47 + k * 2, 34, k < 4 ? LED_G : k < 6 ? LED_A : LED_R, on && k < 5);
    // desk microphone standing in front of the hutch
    p.rect(12, 36, 6, 2, H(0x2a2a28));
    p.vline(14, 30, 35, H(0x8a8a86));
    p.ellipse(14.5, 29, 2.4, 2.8, H(0x5a5a56));
    for (let y = 27; y < 31; y++) p.set(14, y, H(0x2a2a28));
    p.set(13, 27, H(0xb0b0a8));
    // desk top + steel desk with drawer pedestals
    p.rect(0, 39, 64, 3, H(0xa8a290));
    p.hline(0, 63, 39, H(0xd2ccb8));
    p.hline(0, 63, 41, H(0x4e4a40));
    panel(p, 0, 42, 64, 22, H(0x66706a), r, 0.02);
    p.rect(20, 43, 24, 21, (x, y) => mix(H(0x0e0f0e), H(0x1e201e), (y - 43) / 21));
    for (const x0 of [2, 45]) {
      for (const [y0, hh] of [[44, 6], [51, 12]]) {
        p.bevel(x0, y0, 17, hh, 1.2, 0.65);
        p.rect(x0 + 6, y0 + 2, 5, 1, H(0xb8bcb8));
        p.set(x0 + 6, y0 + 3, H(0x2a2c2a));
      }
    }
  }

  T('cctv_bank', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    panel(p, 0, 3, 64, 42, H(0x333534), r, 0.02);
    const screen = (x, y, n) => {
      panel(p, x, y, 28, 18, H(0x252625), r, 0.02, 1.3, 0.55);
      for (let yy = y + 2; yy < y + 15; yy++)
        for (let xx = x + 3; xx < x + 25; xx++) {
          const u = (xx - x - 3) / 21, v = (yy - y - 2) / 12;
          const vig = 1 - ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 1.6;
          let base = 0.35 + 0.2 * h2(xx, yy, n);
          // crude scene: floor/wall perspective lines
          const hz = 0.45;
          if (Math.abs(v - hz - Math.abs(u - 0.5) * 0.7) < 0.06 && v > hz) base += 0.25;
          if (Math.abs(u - 0.5) < 0.12 && v < hz && v > 0.1) base -= 0.2;
          if ((yy & 1) === 0) base *= 0.8;
          p.set(xx, yy, mix(H(0x0c1214), H(0x9ab0b4), Math.max(0, base * vig)));
        }
      p.emit(x + 3, y + 2, 22, 13, 110);
      p.text(String(n), x + 4, y + 3, H(0xe0e8e8));
      p.emit(x + 4, y + 3, 3, 5, 200);
      led(p, x + 25, y + 16, LED_G, true, 180);
    };
    screen(3, 5, 1);
    screen(33, 5, 2);
    screen(3, 25, 3);
    screen(33, 25, 4);
    // desk shelf: VCR + switcher
    p.rect(0, 45, 64, 3, H(0x9a9482));
    p.hline(0, 63, 45, H(0xc4beaa));
    panel(p, 0, 48, 64, 16, H(0x585e5a), r, 0.02);
    panel(p, 4, 50, 26, 6, H(0x1a1a1a), r);
    p.rect(6, 51, 11, 3, H(0x06140a));
    p.text('0:13', 7, 50, LED_G);
    p.rect(6, 50, 12, 1, H(0x1a1a1a));
    p.emit(6, 51, 11, 4, 180);
    p.hline(19, 28, 52, H(0x000000));
    panel(p, 33, 50, 27, 6, H(0x2a2a2a), r);
    for (let k = 0; k < 4; k++) {
      p.rect(35 + k * 6, 52, 4, 2, k === 1 ? H(0xff4a30) : H(0x8a8a86));
      if (k === 1) p.emit(35 + k * 6, 52, 4, 2, 220);
    }
  });

  T('antenna_console', {}, (p, r) => {
    panel(p, 0, 0, 64, 22, H(0x4a5048), r, 0.02);
    p.rect(6, 2, 52, 7, H(0x121412));
    p.textC('ARRAY CONTROL', 32, 3, H(0xe6e6dc));
    for (let k = 0; k < 3; k++) {
      const cx = 14 + k * 18, cy = 15;
      p.circle(cx, cy, 5, H(0x1a1c1a));
      p.circle(cx, cy, 4, H(0xe8e2c8));
      p.emit(cx - 4, cy - 4, 9, 9, 110);
      p.line(cx, cy + 2, cx - 3 + k * 2.5, cy - 3, H(0x101010));
      p.set(cx, cy + 2, H(0x101010));
    }
    // slanted desk surface
    panel(p, 0, 22, 64, 18, H(0x6a7266), r, 0.02, 1.35, 0.6);
    p.circle(15, 31, 8, H(0x1e201e));
    p.circle(15, 31, 7, H(0x2a2e2a));
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      p.set(Math.round(15 + Math.cos(ang) * 6), Math.round(31 + Math.sin(ang) * 6), a % 4 ? H(0x8a8e8a) : H(0xe0e0d8));
    }
    p.line(15, 31, 10, 27, LED_A);
    p.emitPx(10, 27, 255); p.emitPx(11, 28, 255); p.emitPx(12, 29, 255); p.emitPx(13, 29, 255); p.emitPx(14, 30, 255);
    p.circle(15, 31, 1.2, H(0xb0b0a8));
    const cols = [LED_G, LED_R, LED_A, H(0xe8e8e0)];
    for (let row = 0; row < 2; row++)
      for (let k = 0; k < 7; k++) {
        const x = 29 + k * 5, y = 25 + row * 6, on = r() < 0.55, c = cols[(k + row * 2) % 4];
        p.rect(x, y, 4, 4, on ? c : mul(c, 0.25));
        if (on) p.emit(x, y, 4, 4, 230);
        p.bevel(x, y, 4, 4, 1.3, 0.6);
      }
    for (let k = 0; k < 8; k++) { p.vline(30 + k * 4, 35, 37, H(0xc8c8c0)); p.set(30 + k * 4, 38, H(0x2a2a28)); }
    // lower cabinet
    panel(p, 0, 40, 64, 24, H(0x565c54), r, 0.02);
    for (let y = 44; y < 58; y += 2) p.hline(6, 30, y, H(0x2a2e2a));
    p.rect(40, 46, 16, 9, H(0xd8b030));
    p.textC('DANGER', 48, 48, H(0x1a1a14));
    p.rect(0, 61, 64, 3, H(0x1c1e1c));
  });

  /*
   * The console in the RELAY CHAMBER (a room that cannot exist): older and stranger than the
   * array's. Two tiles that pair side by side — 'relay_console' (RELAY plate, gain bar, the guarded
   * red AMPLIFY switch, the carrier frequency) and 'relay_console_b' (FWD / REF power meters,
   * knobs, a lamp row). Every label sits inside its own tile (nothing is cut at a seam). Use
   * either alone or alternate them along a face.
   */
  const RELAY_STEEL = H(0x3c4446);
  function relayShell(p, r) {
    panel(p, 0, 0, 64, 22, RELAY_STEEL, r, 0.03);
    panel(p, 0, 22, 64, 18, mul(RELAY_STEEL, 1.28), r, 0.02, 1.35, 0.6); // slanted desk
    panel(p, 0, 40, 64, 24, mul(RELAY_STEEL, 0.9), r, 0.02);
    for (const [x, y] of [[2, 2], [60, 2], [2, 18], [60, 18], [2, 43], [60, 43]]) rivet(p, x, y);
    p.rect(0, 61, 64, 3, H(0x161a1a));
    // the cabinet breathes cold: vents
    for (let y = 46; y < 58; y += 2) p.hline(5, 26, y, H(0x1e2424));
  }
  T('relay_console', {}, (p, r) => {
    relayShell(p, r);
    // name plate
    p.rect(14, 2, 36, 8, H(0x101312));
    p.bevel(14, 2, 36, 8, 0.6, 1.3);
    p.textC('RELAY', 32, 4, H(0xd8e0dc));
    // gain: a bar meter pinned near the top, amber into red
    p.text('GAIN', 5, 13, H(0x9aa4a0));
    p.rect(21, 12, 38, 7, H(0x0c0e0e));
    for (let k = 0; k < 9; k++) {
      const x = 23 + k * 4, c = k < 6 ? LED_A : LED_R;
      p.rect(x, 13, 3, 5, k < 8 ? c : mul(c, 0.25));
      if (k < 8) p.emit(x, 13, 3, 5, 200);
    }
    // AMPLIFY: a big red switch under a hinged guard
    p.textC('AMPLIFY', 32, 24, H(0xe8e2d0));
    p.rect(22, 30, 20, 9, H(0x141616));
    p.bevel(22, 30, 20, 9, 0.6, 1.3);
    p.rect(26, 31, 12, 6, H(0xb0201a));
    p.hline(26, 37, 31, H(0xff6a5a));
    p.emit(26, 31, 12, 6, 90);
    p.blendRect(23, 29, 18, 2, H(0xc8d4d0), 0.55); // the raised guard's edge
    led(p, 45, 34, LED_R, true, 255);
    led(p, 46, 34, LED_R, true, 255);
    // the only frequency it knows
    p.rect(33, 45, 26, 9, H(0x0c0e0e));
    p.textC('148.32', 46, 47, H(0x60d8a0));
    p.emit(34, 46, 24, 7, 150);
  });
  T('relay_console_b', {}, (p, r) => {
    relayShell(p, r);
    // forward / reflected power meters
    for (const [x, lab, t] of [[6, 'FWD', 0.86], [36, 'REF', 0.28]]) {
      vuMeter(p, x, 4, 22, 11, t, 170);
      p.textC(lab, x + 11, 16, H(0x9aa4a0));
    }
    // knobs + a lamp row on the desk
    knob(p, 12, 31, 4, H(0x9a9e9a));
    knob(p, 26, 31, 4, H(0x9a9e9a));
    for (let k = 0; k < 5; k++) led(p, 38 + k * 4, 29, [LED_G, LED_G, LED_A, LED_R, LED_R][k], k !== 4, 240), led(p, 38 + k * 4, 30, [LED_G, LED_G, LED_A, LED_R, LED_R][k], k !== 4, 240);
    p.text('MODE', 38, 33, H(0x9aa4a0));
    // patch field
    p.rect(33, 44, 26, 12, H(0x121515));
    for (let y = 46; y < 55; y += 3) for (let x = 35; x < 58; x += 3) p.set(x, y, H(0x6a7270));
    p.line(38, 46, 44, 52, H(0xb02a1a));
    p.line(50, 46, 47, 52, H(0x2a60b0));
  });

  T('terminal_tape', { frames: 2, fps: 3 }, (p, r, f) => {
    p.fill(H(0x34332f));
    const drive = (x, label) => {
      panel(p, x, 2, 20, 62, H(0xa8aaa2), r, 0.02);
      p.rect(x, 3, 20, 2, H(0x2a4a7a));
      p.rect(x + 2, 6, 16, 24, H(0x15181a));
      p.bevel(x + 2, 6, 16, 24, 0.6, 1.3);
      for (const cy of [12, 23]) {
        const cx = x + 9.5;
        p.circle(cx, cy, 5.2, H(0x8a8c88));
        p.circle(cx, cy, 4.4, H(0x3a2c20));
        p.circle(cx, cy, 1.8, H(0xc0c0b8));
        for (let s = 0; s < 3; s++) {
          const ang = s * 2.094 + f * 0.9 + cy;
          p.line(cx, cy, cx + Math.cos(ang) * 3.8, cy + Math.sin(ang) * 3.8, H(0x9a9c98));
        }
      }
      p.text(label, x + 3, 32, H(0x2a2a28));
      for (let k = 0; k < 4; k++) led(p, x + 3 + k * 4, 39, [LED_G, LED_A, LED_G, LED_R][k], k === 0 || (k === 1 && f === 1), 230);
      for (let y = 46; y < 60; y += 2) p.hline(x + 3, x + 16, y, H(0x6a6c66));
    };
    drive(1, 'TP1');
    drive(22, 'TP2');
    // terminal desk + green CRT
    p.rect(43, 38, 21, 3, H(0x8a8472));
    p.hline(43, 63, 38, H(0xb4ae9a));
    panel(p, 43, 41, 21, 23, H(0x4a4e4a), r);
    panel(p, 44, 17, 19, 20, H(0xb8b09a), r, 0.02);
    p.rect(46, 19, 15, 13, H(0x051208));
    for (let k = 0; k < 5; k++) {
      const len = 3 + Math.floor(r() * 10);
      p.hline(47, 47 + len, 20 + k * 2, H(0x3cf070));
    }
    if (f === 0) p.rect(47, 30, 2, 1, H(0x3cf070));
    p.emit(46, 19, 15, 13, 60);
    for (let y = 19; y < 32; y++) for (let x = 46; x < 61; x++) if (p.get(x, y) === H(0x3cf070)) p.emitPx(x, y, 240);
    p.rect(44, 36, 19, 2, H(0xa8a08a));
    p.rect(45, 34, 3, 2, H(0x7a7462));
  });

  T('breaker_panel', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    pipeV(p, 29, 5, H(0x8a8c88), 0, 9);
    p.rect(28, 5, 7, 2, H(0x6a6c68));
    panel(p, 13, 9, 38, 48, H(0x8c8e88), r, 0.02, 1.3, 0.55);
    p.rect(16, 12, 32, 42, H(0x3a3c3a));
    p.bevel(16, 12, 32, 42, 0.55, 1.3);
    const lab = 'ABCDEF';
    for (let k = 0; k < 6; k++) {
      const col = k < 3 ? 0 : 1, row = k % 3;
      const x = 18 + col * 15, y = 15 + row * 10;
      p.text(lab[k], x, y + 1, H(0xe0e0d8));
      p.rect(x + 4, y, 9, 7, H(0x1a1a1a));
      p.bevel(x + 4, y, 9, 7, 1.4, 0.6);
      p.rect(x + 7, y + 1, 3, 3, H(0xd8d8d0));
      p.hline(x + 7, x + 9, y + 3, H(0x8a8a84));
    }
    p.rect(21, 43, 22, 10, H(0x1a1a1a));
    p.bevel(21, 43, 22, 10, 1.4, 0.6);
    p.rect(25, 44, 14, 3, H(0xb02a1a));
    p.hline(25, 38, 44, H(0xe05a3a));
    p.textC('MAIN', 32, 47, H(0xe0e0d8));
    // hazard sticker
    p.rect(40, 10, 9, 2, H(0xe0b020));
    screw(p, 14, 10); screw(p, 48, 10); screw(p, 14, 54); screw(p, 48, 54);
  });

  T('generator', {}, (p, r) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, mul(H(0x57554f), 0.85 + fbm(x, y, 64, 4, 3, 71) * 0.3));
    // exhaust stack
    pipeV(p, 7, 5, H(0x2a2622), 0, 22);
    for (let y = 8; y < 16; y += 2) p.hline(7, 11, y, H(0x4a4038));
    p.blendRect(7, 0, 5, 10, H(0x6a3a1a), 0.35);
    // housing
    const GEN = H(0x3c5a3e);
    panel(p, 1, 20, 62, 37, GEN, r, 0.03, 1.3, 0.6);
    for (let x = 4; x < 21; x += 2) p.vline(x, 23, 53, H(0x1c2a1e));
    p.bevel(3, 22, 19, 33, 0.6, 1.3);
    // engine block
    p.rect(23, 26, 20, 26, H(0x3a3c3a));
    p.noise(23, 26, 20, 26, 0.06, r);
    p.bevel(23, 26, 20, 26);
    for (let k = 0; k < 4; k++) p.rect(25 + k * 4, 22, 3, 5, H(0x5a5c58));
    pipeH(p, 30, 3, H(0x8a7a5a), 23, 42);
    p.circle(38, 44, 3, H(0xb05a1a));
    p.circle(38, 44, 1.5, H(0x6a2a0a));
    // alternator + control box
    p.rect(45, 30, 16, 22, H(0x2e4a30));
    p.bevel(45, 30, 16, 22, 1.2, 0.6);
    panel(p, 45, 12, 16, 16, H(0x252825), r, 0.02);
    for (let k = 0; k < 2; k++) {
      p.circle(49.5 + k * 7, 16.5, 2.6, H(0xe8e2cc));
      p.emit(47 + k * 7, 14, 5, 5, 70);
      p.line(49 + k * 7, 17, 50 + k * 7, 15, H(0x101010));
    }
    p.text('GEN', 47, 21, H(0x9a9a92));
    p.circle(58, 23, 1.6, H(0xc02a1a));
    p.rect(8, 40, 7, 6, H(0xd8b020));
    p.text('!', 11, 40, H(0x1a1a14));
    // skid
    p.rect(0, 57, 64, 4, H(0x1c1c1a));
    p.hline(0, 63, 57, H(0x3a3a36));
    for (let x = 4; x < 64; x += 12) p.set(x, 59, H(0x6a6a62));
    p.rect(0, 61, 64, 3, H(0x2a2926));
  });

  T('fuel_tank', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    pipeV(p, 11, 3, H(0x6a6a64), 0, 20);
    const TANK = H(0x7a2c22);
    for (let y = 18; y <= 46; y++) {
      const v = (y - 18) / 28, shade = 0.55 + 0.75 * Math.sin(v * Math.PI * 0.9 + 0.25);
      const hw = 29;
      const cap = Math.sqrt(Math.max(0, 1 - ((v - 0.5) * 2) ** 2)) * 4;
      for (let x = Math.round(32 - hw - cap); x <= Math.round(32 + hw + cap - 1); x++) {
        let c = mul(TANK, shade * (0.94 + h2(x, y, 3) * 0.1));
        const n = fbm(x, y, 64, 6, 3, 13);
        if (n > 0.6) c = mix(c, H(0x5a3018), (n - 0.6) * 2);
        p.set(x, y, c);
      }
    }
    stencil(p, 'DIESEL', 32 - textWidth('DIESEL') / 2, 29, H(0xe0dcd0), 1, r, 0.02);
    p.textC('NO SMOKING', 32, 37, H(0xc8c0b0));
    p.circle(46, 16, 3, H(0x2a2a28));
    p.circle(46, 16, 2.2, H(0xe0dccc));
    p.set(47, 15, H(0x101010));
    p.rect(22, 15, 5, 3, H(0x3a3a38));
    for (const lx of [10, 49]) { p.rect(lx, 44, 5, 15, H(0x2a2a28)); p.vline(lx, 44, 58, H(0x4a4a46)); }
    p.rect(2, 58, 60, 5, H(0x5a5a54));
    p.hline(2, 61, 58, H(0x8a8a82));
    p.blendRect(4, 59, 30, 3, H(0x0a0a08), 0.5);
  });

  T('pipes', {}, (p, r) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, mul(H(0x5c5a54), 0.8 + fbm(x, y, 64, 4, 3, 5) * 0.35));
    const sh = (y, d) => { for (let x = 0; x < 64; x++) for (let k = 0; k < 2; k++) p.mul(x, y + d + k, 0.72); };
    sh(5, 7); pipeH(p, 5, 7, H(0xc8c4b8));
    for (let x = 8; x < 64; x += 16) { p.vline(x, 5, 11, H(0x8a867a)); p.vline(x + 1, 5, 11, H(0x9a968a)); }
    sh(17, 4); pipeH(p, 17, 4, H(0x3e6a44));
    p.rect(20, 17, 9, 4, H(0xe0d8c0));
    p.text('HW', 21, 17 - 0, H(0x1a1a14));
    p.rect(21, 17, 0, 0, 0);
    sh(25, 3); pipeH(p, 25, 3, H(0xa86a3a));
    sh(43, 7); pipeH(p, 43, 7, H(0x7a7c78));
    pipeV(p, 52, 4, H(0x6e706c));
    // valve
    p.rect(38, 40, 5, 12, H(0x3a3a38));
    p.ring(40, 37, 4.5, H(0xb0281a), 1.5);
    p.line(36, 37, 44, 37, H(0x8a1a10));
    p.line(40, 33, 40, 41, H(0x8a1a10));
    // brackets + drips
    for (const x of [14, 35, 58]) { p.rect(x, 3, 2, 30, H(0x2a2a28)); p.set(x, 3, H(0x5a5a56)); }
    for (let k = 0; k < 7; k++) { const x = Math.floor(r() * 64), y = [12, 21, 28, 50][k % 4] + 1; p.set(x, y, H(0x9ab0c0)); p.set(x, y + 3, H(0x7a90a0)); }
  });

  T('cables', {}, (p, r) => {
    p.fill(H(0x0b0b0b));
    const pal = [H(0x1e1e1e), H(0x2a2a28), H(0x161616), H(0x333331), H(0x5a2a22), H(0x6a5a2a), H(0x2a3a4a), H(0x242424), H(0x3a3a36)];
    let x = 0;
    while (x < 64) {
      const w = 2 + Math.floor(r() * 3), c = pal[Math.floor(r() * pal.length)], ph = r() * 6.28;
      for (let y = 0; y < 64; y++) {
        const off = Math.round(Math.sin((y / 64) * Math.PI * 2 + ph) * 0.8);
        for (let k = 0; k < w; k++) {
          const t = (k + 0.5) / w;
          p.set(x + k + off, y, mul(c, 0.55 + 0.8 * Math.sin(t * Math.PI) * (0.9 + h2(x + k, y, 1) * 0.2)));
        }
      }
      if (r() < 0.5) for (let y = Math.floor(r() * 12); y < 64; y += 12 + Math.floor(r() * 8)) p.hline(x, x + w - 1, y, H(0x8a8a82));
      x += w;
    }
    // ladder cable tray
    p.rect(0, 8, 64, 2, H(0x6a6c68));
    p.hline(0, 63, 8, H(0x9a9c98));
    p.rect(0, 14, 64, 2, H(0x5a5c58));
    for (let xx = 2; xx < 64; xx += 8) p.rect(xx, 10, 2, 4, H(0x4a4c48));
    for (let xx = 0; xx < 64; xx++) p.mul(xx, 16, 0.5);
  });

  T('reels', {}, (p, r) => {
    p.fill(H(0x1e1a16));
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.mul(x, y, 0.85 + h2(x, y, 3) * 0.2);
    for (const sy of [0, 21, 42]) {
      for (const cx of [10, 32, 54]) {
        const cy = sy + 10;
        const tape = r() < 0.8;
        p.circle(cx, cy, 9, H(0x8a8e8e));
        p.circle(cx, cy, 8, tape ? H(0x3a2a1c) : H(0x2a2c2c));
        if (tape) p.ring(cx, cy, 7, H(0x4a3624));
        p.circle(cx, cy, 2.5, H(0xb8bcbc));
        for (let s = 0; s < 3; s++) { const a = s * 2.094 + r(); p.set(Math.round(cx + Math.cos(a) * 4.5), Math.round(cy + Math.sin(a) * 4.5), H(0x6a6e6e)); }
        p.set(cx, cy, H(0x1a1a1a));
        p.set(cx - 5, cy - 6, H(0xd0d4d4));
        if (r() < 0.5) { p.rect(cx - 3, cy + 5, 7, 2, H(0xe0dccc)); p.hline(cx - 2, cx + 2, cy + 5, H(0x6a6a60)); }
      }
      p.rect(0, sy + 19, 64, 2, H(0x4a4038));
      p.hline(0, 63, sy + 19, H(0x7a6a58));
    }
  });

  T('shelf_supplies', {}, (p, r) => {
    p.fill(H(0x1c1b19));
    const items = (x0, x1, yb, hmax) => {
      let x = x0;
      while (x < x1 - 3) {
        const kind = Math.floor(r() * 6);
        const w = Math.min(x1 - x, [9, 7, 5, 4, 6, 8][kind] + Math.floor(r() * 3)), h = Math.min(hmax, [9, 6, 10, 5, 8, 7][kind] + Math.floor(r() * 3));
        const y = yb - h;
        switch (kind) {
          case 0: // cardboard box
            panel(p, x, y, w, h, mul(H(0x9a7a4e), 0.85 + r() * 0.3), r, 0.04);
            p.hline(x, x + w - 1, y + 2, H(0xc8b890));
            if (w > 6) p.rect(x + 2, y + 4, 4, 2, H(0xe0dccc));
            break;
          case 1: // paper reams
            for (let k = 0; k < h; k += 2) { p.hline(x, x + w - 1, y + k, H(0xe6e2d6)); p.hline(x, x + w - 1, y + k + 1, k % 4 ? H(0xc8c4b8) : H(0x6a8ab0)); }
            break;
          case 2: // jug
            p.rect(x, y + 2, w, h - 2, H(0xd8d8d0));
            p.rect(x + 1, y, 2, 2, H(0x2a5aa0));
            p.rect(x, y + 5, w, 2, H(0x2a5aa0));
            p.bevel(x, y + 2, w, h - 2);
            break;
          case 3: // cans
            for (let k = 0; k + 2 <= w; k += 3) { p.rect(x + k, y, 2, h, k % 2 ? H(0xa02a1a) : H(0xa8aaa6)); p.set(x + k, y, H(0xd0d0c8)); }
            break;
          case 4: // toilet paper pack
            for (let k = 0; k + 3 <= w; k += 3) for (let j = 0; j + 3 <= h; j += 3) { p.circle(x + k + 1.5, y + j + 1.5, 1.5, H(0xecece4)); p.set(x + k + 1, y + j + 1, H(0x9a9a92)); }
            break;
          default: // binders
            for (let k = 0; k < w; k += 2) p.rect(x + k, y, 2, h, [H(0x2a3a5a), H(0x5a1e1a), H(0x2a2a2a), H(0x3a4a2a)][Math.floor(r() * 4)]);
        }
        x += w + 1 + Math.floor(r() * 2);
      }
    };
    shelving(p, [14, 31, 48, 62]);
    for (const [yb, hm] of [[14, 12], [31, 15], [48, 15], [62, 12]]) items(3, 61, yb, hm);
    shelving(p, [14, 31, 48, 62]);
  });

  T('shelf_tapes', {}, (p, r) => {
    p.fill(H(0x191816));
    const years = ['1954', '1961', '1932', '1978', '1983', '1901', '1969', '1947', '1990', '1887', '1972', '1958'];
    let yi = Math.floor(r() * years.length);
    shelving(p, [20, 41, 62]);
    for (const yb of [20, 41, 62]) {
      for (let k = 0; k < 3; k++) {
        const x = 3 + k * 20, w = 18, h = 16 - Math.floor(r() * 3), y = yb - h;
        const base = [H(0xb8a882), H(0x9a9486), H(0x6a5a44), H(0xa89a78)][Math.floor(r() * 4)];
        panel(p, x, y, w, h, base, r, 0.05);
        p.rect(x + 1, y + 3, w - 2, 7, H(0xe8e4d4));
        p.textC(years[yi++ % years.length], x + w / 2, y + 4, H(0x1e1a14));
        p.hline(x + 2, x + w - 3, y + 12, mul(base, 0.7));
      }
    }
    shelving(p, [20, 41, 62]);
  });

  T('kitchen_counter', {}, (p, r) => {
    const WOOD = H(0x7a5230);
    woodGrain(p, 0, 0, 64, 15, WOOD, 90, 0.25);
    for (const x0 of [0, 32]) { p.bevel(x0 + 1, 1, 30, 13, 1.25, 0.65); p.rect(x0 + (x0 ? 3 : 27), 10, 2, 2, H(0xc8b890)); }
    p.hline(0, 63, 15, H(0x1a1410));
    for (let y = 16; y < 34; y++)
      for (let x = 0; x < 64; x++) {
        const tx = x & 7, ty = (y - 16) & 7;
        let c = mul(H(0xc8ab7c), 1 + (h2(x >> 3, (y - 16) >> 3, 8) - 0.5) * 0.07);
        if (tx === 0 || ty === 0) c = H(0x8f7d5e);
        p.set(x, y, mul(c, y < 19 ? 0.75 : 1));
      }
    // toaster
    p.rect(12, 27, 12, 7, H(0xb8bab8));
    p.bevel(12, 27, 12, 7, 1.4, 0.6);
    p.hline(14, 21, 27, H(0x2a2a2a));
    p.set(23, 30, H(0x1a1a1a));
    // coffee machine
    panel(p, 34, 16, 16, 5, H(0x1e1e1e), r);
    p.rect(34, 21, 3, 13, H(0x1e1e1e));
    p.rect(47, 21, 3, 13, H(0x1e1e1e));
    p.rect(37, 21, 10, 3, H(0x2a2a2a));
    for (let y = 25; y < 33; y++)
      for (let x = 38; x < 47; x++) {
        const edge = x === 38 || x === 46;
        p.set(x, y, y > 28 ? H(0x2a160a) : edge ? H(0x9aa0a4) : H(0x3a4044));
      }
    p.hline(38, 46, 25, H(0xc0c6ca));
    p.set(39, 26, H(0xe0e6ea));
    p.rect(34, 33, 16, 1, H(0x101010));
    led(p, 48, 30, LED_R, true);
    // counter top + base cabinets
    p.rect(0, 34, 64, 3, H(0xd4ccb8));
    p.hline(0, 63, 34, H(0xece6d4));
    p.rect(0, 37, 64, 1, H(0x9a9a96));
    woodGrain(p, 0, 38, 64, 22, WOOD, 91, 0.25);
    for (const x0 of [0, 32]) { p.bevel(x0 + 1, 39, 30, 20, 1.25, 0.65); p.rect(x0 + (x0 ? 3 : 27), 42, 2, 3, H(0xc8b890)); }
    p.rect(0, 60, 64, 4, H(0x1c1612));
  });

  T('fridge', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    const AL = H(0xd6ccb0);
    for (let y = 3; y < 64; y++)
      for (let x = 12; x < 52; x++) {
        const u = (x - 12) / 40;
        p.set(x, y, mul(AL, 1.04 - u * 0.16 + (h2(x, y, 2) - 0.5) * 0.03));
      }
    p.bevel(12, 3, 40, 61, 1.1, 0.6);
    p.hline(13, 50, 21, H(0x3a3630));
    p.hline(13, 50, 22, H(0x8a8472));
    p.bevel(13, 4, 38, 17, 1.12, 0.8);
    p.bevel(13, 23, 38, 37, 1.12, 0.8);
    p.rect(46, 11, 2, 8, H(0xd0d2d2));
    p.vline(47, 11, 18, H(0x7a7c7c));
    p.rect(46, 26, 2, 14, H(0xd0d2d2));
    p.vline(47, 26, 39, H(0x7a7c7c));
    p.rect(13, 60, 38, 3, H(0x2a2824));
    for (let x = 15; x < 50; x += 2) p.set(x, 61, H(0x5a5650));
    // magnets, note, photo
    p.rect(20, 28, 9, 11, H(0xf0ecd8));
    for (let k = 0; k < 4; k++) p.hline(21, 21 + 3 + Math.floor(r() * 4), 30 + k * 2, H(0x3a3a6a));
    p.rect(23, 27, 3, 2, H(0xc02a1a));
    p.rect(32, 30, 7, 6, H(0xe8e8e0));
    p.rect(33, 31, 5, 4, H(0x5a6a4a));
    p.set(35, 31, H(0xc8a88a));
    p.rect(34, 29, 2, 2, H(0x2a6aa0));
    p.rect(22, 10, 3, 3, H(0xe0b020));
    p.rect(28, 12, 3, 2, H(0x3a8a3a));
    p.textC('KELVAIR', 32, 5, mul(AL, 0.72));
    p.blendRect(12, 57, 40, 3, H(0x6a4a2a), 0.25);
  });

  T('filing_cabinet', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    const C = H(0x6f7a6c);
    for (const x0 of [4, 34]) {
      panel(p, x0, 12, 26, 49, C, r, 0.02, 1.2, 0.6);
      for (let k = 0; k < 4; k++) {
        const y = 13 + k * 12;
        p.bevel(x0 + 1, y, 24, 11, 1.18, 0.62);
        p.rect(x0 + 9, y + 2, 8, 3, H(0xa8aea4));
        p.rect(x0 + 10, y + 3, 6, 1, H(0xe8e4d8));
        p.rect(x0 + 8, y + 6, 10, 2, H(0xc4c8c4));
        p.hline(x0 + 8, x0 + 17, y + 8, H(0x2a2e2a));
      }
      p.rect(x0, 61, 26, 3, H(0x1e201e));
    }
    // stuff on top
    p.rect(6, 7, 14, 5, H(0xe8e4d6));
    for (let y = 7; y < 12; y += 2) p.hline(6, 19, y, H(0xb8b4a6));
    p.rect(8, 5, 10, 2, H(0x2a3a5a));
    panel(p, 38, 4, 16, 8, H(0x9a7a4e), r);
    p.hline(38, 53, 6, H(0xc8b890));
  });

  T('bookcase', {}, (p, r) => {
    const WOOD = H(0x553a24);
    woodGrain(p, 0, 0, 64, 64, WOOD, 55, 0.25);
    const pal = [H(0x6a2420), H(0x223458), H(0x2e4a2a), H(0x8a7a58), H(0x1e1e1e), H(0x5a5a56), H(0x7a5a2a), H(0x3a2a4a), H(0x9a3a22)];
    for (const [y0, y1] of [[3, 20], [23, 41], [44, 60]]) {
      p.rect(3, y0, 58, y1 - y0, H(0x140e0a));
      let x = 3;
      while (x < 60) {
        const w = 2 + Math.floor(r() * 4), h = Math.min(y1 - y0, 10 + Math.floor(r() * 8));
        if (r() < 0.08) { x += 2; continue; }
        const c = pal[Math.floor(r() * pal.length)];
        for (let k = 0; k < w && x + k < 61; k++) p.vline(x + k, y1 - h, y1 - 1, mul(c, k === 0 ? 1.25 : k === w - 1 ? 0.7 : 1));
        if (h > 12) { p.hline(x, Math.min(60, x + w - 1), y1 - h + 2, mul(c, 1.5)); p.hline(x, Math.min(60, x + w - 1), y1 - 3, mul(c, 1.5)); }
        x += w;
      }
      p.rect(0, y1, 64, 3, WOOD);
      p.hline(0, 63, y1, mul(WOOD, 1.4));
      for (let xx = 3; xx < 61; xx++) p.mul(xx, y0, 0.5);
    }
    for (const x of [0, 61]) { p.rect(x, 0, 3, 64, mul(WOOD, 0.9)); p.vline(x, 0, 63, mul(WOOD, 1.3)); }
    p.rect(0, 0, 64, 3, mul(WOOD, 0.85));
    p.rect(0, 60, 64, 4, mul(WOOD, 0.7));
  });

  T('corkboard', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    woodGrain(p, 6, 8, 52, 38, H(0x6a4a2a), 5, 0.2);
    for (let y = 10; y < 44; y++) for (let x = 8; x < 56; x++) p.set(x, y, mul(H(0xa87a4a), 0.8 + h2(x, y, 7) * 0.35));
    p.bevel(6, 8, 52, 38, 1.25, 0.6);
    p.bevel(8, 10, 48, 34, 0.7, 1.2);
    const pin = (x, y) => { const c = [H(0xd02a1a), H(0x2a6ad0), H(0x2aa04a), H(0xe0c020)][Math.floor(r() * 4)]; p.set(x, y, c); p.set(x + 1, y, mul(c, 0.6)); p.set(x, y - 1, mul(c, 1.4)); };
    const sheet = (x, y, w, h, c, lines) => {
      p.rect(x + 1, y + 1, w, h, H(0x5a3a1a));
      p.rect(x, y, w, h, c);
      for (let k = 0; k < lines; k++) p.hline(x + 2, x + 2 + Math.floor(r() * (w - 4)), y + 3 + k * 2, H(0x6a6a70));
      pin(x + Math.floor(w / 2), y + 1);
    };
    sheet(11, 13, 13, 16, H(0xece8d8), 6);
    sheet(27, 12, 11, 9, H(0xe8d890), 3);
    sheet(41, 14, 12, 14, H(0xe6e6e0), 5);
    p.rect(28, 24, 10, 8, H(0xf0f0e8));
    p.rect(29, 25, 8, 6, H(0x4a5a6a));
    p.rect(31, 27, 2, 2, H(0xc8a88a));
    pin(32, 25);
    sheet(14, 32, 16, 9, H(0xf0ece0), 3);
    for (let k = 0; k < 4; k++) p.vline(17 + k * 3, 34, 39, H(0x9a9aa0));
    sheet(40, 31, 12, 10, H(0xd8e0f0), 4);
  });

  T('map_wall', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    const x0 = 3, y0 = 4, w = 58, h = 47;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const e = fbm(x, y, 64, 3, 4, 808);
        let c = H(0xd9d2b4);
        if (fbm(x, y, 64, 5, 2, 12) > 0.55) c = H(0xc4ceaa);
        if (e < 0.34) c = H(0xa4bcc4);
        else if (((e * 14) % 1) < 0.12) c = mix(c, H(0x9a7650), 0.7);
        if ((x - x0) % 12 === 0 || (y - y0) % 12 === 0) c = mul(c, 0.93);
        p.set(x, y, c);
      }
    // river + roads
    let rx = x0 + 6, ry = y0;
    for (let k = 0; k < 60; k++) { p.set(rx, ry, H(0x4a7aa0)); ry += 0.8; rx += Math.sin(k * 0.3) * 0.9 + 0.3; if (ry > y0 + h - 1) break; }
    const road = (pts, c) => { for (let k = 0; k + 1 < pts.length; k++) p.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], c); };
    road([[3, 40], [18, 34], [30, 36], [44, 28], [60, 24]], H(0xb03a26));
    road([[24, 5], [26, 18], [30, 36], [34, 50]], H(0x2a2a2a));
    road([[44, 28], [50, 40], [58, 50]], H(0x8a5a2a));
    p.rect(x0, y0, w, 6, H(0xe8e2cc));
    p.textC('COUNTY SURVEY', 32, y0 + 1, H(0x2a2418));
    p.circle(30, 22, 1.5, H(0xd02010));
    p.set(30, 20, H(0x101010));
    p.rect(x0 + w - 13, y0 + h - 9, 12, 8, H(0xf0ecdc));
    p.hline(x0 + w - 12, x0 + w - 4, y0 + h - 7, H(0x2a2a2a));
    p.hline(x0 + w - 12, x0 + w - 6, y0 + h - 5, H(0x2a2a2a));
    for (let x = x0; x < x0 + w; x++) { p.mul(x, y0, 0.6); p.mul(x, y0 + h - 1, 0.6); }
    for (let y = y0; y < y0 + h; y++) { p.mul(x0, y, 0.6); p.mul(x0 + w - 1, y, 0.6); }
    for (const [tx, ty] of [[x0, y0], [x0 + w - 4, y0], [x0, y0 + h - 3], [x0 + w - 4, y0 + h - 3]]) p.blendRect(tx, ty, 4, 3, H(0xe8e0b0), 0.6);
  });

  T('mirror_wall', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    p.rect(19, 4, 26, 29, H(0xb8bcbc));
    for (let y = 5; y < 32; y++)
      for (let x = 20; x < 44; x++) {
        let c = mix(H(0x2c3238), H(0x161a1e), (y - 5) / 27);
        const d = x - 20 + (y - 5) * 0.8;
        if (d > 8 && d < 11) c = mix(c, H(0x8a9aa4), 0.25);
        if (d > 13 && d < 14) c = mix(c, H(0x8a9aa4), 0.15);
        const edge = Math.min(x - 20, 43 - x, y - 5, 31 - y);
        if (edge < 2 && h2(x, y, 4) < 0.4) c = mix(c, H(0x5a5448), 0.4);
        p.set(x, y, c);
      }
    p.bevel(19, 4, 26, 29, 1.3, 0.6);
    // soap dispenser
    panel(p, 49, 16, 6, 10, H(0xe0e0d8), r);
    p.rect(51, 26, 2, 2, H(0x8a8a86));
    // sink
    for (let y = 36; y < 46; y++) {
      const inset = y > 38 ? Math.floor((y - 38) * 0.45) : 0;
      for (let x = 16 + inset; x < 48 - inset; x++) p.set(x, y, mul(H(0xdad8d0), y < 38 ? 1.12 : 1 - (y - 38) * 0.035 - Math.abs(x - 32) * 0.004));
    }
    p.hline(16, 47, 36, H(0xf4f2ea));
    p.rect(30, 32, 4, 4, H(0xb8bcbc));
    p.rect(31, 33, 5, 1, H(0xd8dcdc));
    p.rect(24, 34, 3, 2, H(0xc8cccc));
    p.rect(37, 34, 3, 2, H(0xc8cccc));
    pipeV(p, 30, 3, H(0xb0b4b4), 46, 55);
    pipeH(p, 54, 3, H(0xb0b4b4), 30, 40);
    p.blendRect(20, 46, 24, 2, H(0x000000), 0.35);
  });

  T('stall', {}, (p, r) => {
    const LAM = H(0x979784);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, mul(LAM, 0.95 + h2(x, y, 2) * 0.06 + (fbm(x, y, 64, 2, 2, 3) - 0.5) * 0.08));
    p.rect(0, 0, 64, 2, H(0xb8bcbc));
    p.hline(0, 63, 0, H(0xe0e4e4));
    p.rect(0, 2, 6, 62, mul(LAM, 0.88));
    p.vline(5, 2, 63, H(0x3a3a34));
    p.rect(58, 2, 6, 62, mul(LAM, 0.88));
    p.vline(58, 2, 63, H(0x3a3a34));
    p.rect(0, 57, 6, 7, H(0xb8bcbc));
    p.rect(58, 57, 6, 7, H(0xb8bcbc));
    p.bevel(7, 3, 50, 54, 1.15, 0.6);
    p.rect(7, 57, 50, 7, H(0x0e0e0c));
    for (const hy of [8, 47]) p.rect(6, hy, 2, 5, H(0xc0c4c4));
    p.rect(51, 29, 5, 4, H(0xc0c4c4));
    p.rect(52, 30, 3, 2, H(0x2aa04a));
    p.rect(30, 8, 3, 2, H(0x8a8a86));
    for (let k = 0; k < 6; k++) { const x = 12 + Math.floor(r() * 36), y = 14 + Math.floor(r() * 36); p.line(x, y, x + 2 + Math.floor(r() * 4), y + Math.floor(r() * 3) - 1, mul(LAM, 0.7)); }
    p.text('#', 20, 22, mul(LAM, 0.72));
  });

  T('workbench', {}, (p, r) => {
    for (let y = 0; y < 36; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(H(0x8a6a44), 0.92 + h2(x, y, 2) * 0.12);
        if (x % 4 === 2 && y % 4 === 2) c = H(0x2a1e12);
        p.set(x, y, c);
      }
    // tools on the pegboard
    p.rect(6, 5, 2, 14, H(0x9a6a3a));
    p.rect(3, 3, 8, 3, H(0x5a5c5e));
    p.hline(3, 10, 3, H(0x9a9c9e));
    p.line(15, 4, 19, 20, H(0x8a8e92));
    p.line(16, 4, 20, 20, H(0x6a6e72));
    p.ring(15, 4, 2, H(0x8a8e92));
    p.poly([[23, 7], [37, 7], [37, 12], [25, 15]], H(0xa8acb0));
    p.rect(35, 5, 5, 7, H(0x7a3a1a));
    for (let x = 25; x < 37; x += 2) p.set(x, 14 - (x - 25) / 5, H(0x5a5e62));
    const sd = [H(0xc02a1a), H(0xe0b020), H(0x2a5ab0), H(0x2a2a2a)];
    for (let k = 0; k < 4; k++) { p.rect(42 + k * 3, 4, 2, 5, sd[k]); p.vline(42 + k * 3, 9, 16, H(0xa8acb0)); }
    p.line(55, 4, 52, 16, H(0x8a8e92));
    p.line(57, 4, 60, 16, H(0x8a8e92));
    p.rect(54, 3, 4, 2, H(0xb02a1a));
    p.ring(12, 27, 5, H(0xb06a2a), 2);
    panel(p, 24, 20, 12, 14, H(0x6a5030), r);
    p.rect(26, 23, 8, 9, H(0xece8d8));
    for (let k = 0; k < 4; k++) p.hline(27, 32, 24 + k * 2, H(0x6a6a70));
    // vise + bench top
    p.rect(3, 31, 9, 5, H(0x3a3e40));
    p.rect(5, 29, 5, 2, H(0x5a5e60));
    p.rect(0, 36, 64, 5, H(0x9a7a50));
    p.hline(0, 63, 36, H(0xc4a478));
    p.hline(0, 63, 40, H(0x4a3a22));
    for (let k = 0; k < 5; k++) p.blend(Math.floor(r() * 64), 37 + Math.floor(r() * 3), H(0x2a1a0a), 0.5);
    p.rect(0, 41, 64, 23, H(0x2a2018));
    panel(p, 20, 42, 24, 7, H(0x6a4a2a), r);
    p.rect(30, 44, 4, 2, H(0xb8b8b0));
    for (let k = 0; k < 3; k++) panel(p, 4 + k * 5, 52 + (k % 2), 4, 11 - (k % 2), [H(0x7a2a1a), H(0x5a5c58), H(0x2a4a7a)][k], r);
    panel(p, 44, 50, 16, 13, H(0x9a7a4e), r);
    p.rect(0, 62, 64, 2, H(0x140e0a));
  });

  T('ladder_wall', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    p.rect(17, 0, 30, 7, H(0x2a2c2a));
    p.rect(19, 0, 26, 5, H(0x4a4e4a));
    p.hline(19, 44, 4, H(0x1a1c1a));
    p.rect(40, 1, 3, 2, H(0x8a8e8a));
    for (let y = 8; y < 62; y += 7) {
      p.blendRect(24, y + 2, 18, 1, H(0x000000), 0.3);
      p.rect(23, y, 18, 2, H(0x9a9c98));
      p.hline(23, 40, y, H(0xc8cac6));
    }
    for (const x of [21, 41]) {
      p.blendRect(x + 2, 7, 1, 57, H(0x000000), 0.3);
      p.rect(x, 5, 2, 59, H(0x9a9c98));
      p.vline(x, 5, 63, H(0xc8cac6));
    }
    for (const y of [16, 50]) { p.rect(19, y, 2, 2, H(0x3a3c3a)); p.rect(43, y, 2, 2, H(0x3a3c3a)); }
    p.rect(46, 24, 15, 8, H(0xe8e4d8));
    p.bevel(46, 24, 15, 8, 1.1, 0.7);
    p.textC('ROOF', 53, 26, H(0xb02a1a));
  });

  T('stairs_down', {}, (p, r) => {
    p.rect(0, 0, 64, 64, H(0xc0b798));
    p.noise(0, 0, 64, 64, 0.03, r);
    const vy = 30;
    for (let y = 4; y < 64; y++) {
      const t = (y - vy) / (63 - vy);
      const lx = Math.round(5 + Math.max(0, (1 - Math.max(t, 0))) * 10), rx = Math.round(58 - Math.max(0, (1 - Math.max(t, 0))) * 10);
      for (let x = 5; x < 59; x++) {
        let c;
        if (y < vy) c = mix(H(0x0a0a0a), H(0x1e1d1a), (y - 4) / (vy - 4) * 0.4);
        else if (x < lx || x > rx) c = mix(H(0x1a1916), H(0x5a5650), t * t);
        else {
          const depth = 1 / Math.max(0.05, t);
          const step = Math.floor(depth * 1.2);
          const frac = depth * 1.2 - step;
          const lit = t * t;
          c = frac < 0.35 ? mix(H(0x080808), H(0x8a867a), lit) : mix(H(0x050505), H(0x5a564e), lit * 0.8);
        }
        p.set(x, y, c);
      }
    }
    // handrail
    p.line(52, 34, 60, 58, H(0x8a7a5a));
    p.line(52, 35, 60, 59, H(0x3a3024));
    for (const [x, y] of [[55, 42], [58, 52]]) p.vline(x, y, y + 6, H(0x5a5048));
    // frame + sign
    p.rect(3, 3, 2, 61, H(0x6a665c));
    p.rect(59, 3, 2, 61, H(0x6a665c));
    p.rect(3, 2, 58, 2, H(0x6a665c));
    p.hline(3, 60, 2, H(0x9a968a));
    p.rect(26, 10, 12, 8, H(0xe0dcc8));
    p.textC('B1', 32, 12, H(0x1a1a14));
  });

  T('vent_wall', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    p.blendRect(18, 30, 28, 8, H(0x3a3a36), 0.25);
    panel(p, 16, 38, 32, 18, H(0x9a9a92), r, 0.03);
    for (let y = 40; y < 54; y += 3) {
      p.hline(18, 45, y, H(0xc8c8c0));
      p.hline(18, 45, y + 1, H(0x7a7a72));
      p.hline(18, 45, y + 2, H(0x101010));
    }
    for (const [x, y] of [[17, 39], [45, 39], [17, 54], [45, 54]]) screw(p, x, y);
    for (let k = 0; k < 3; k++) { const x = 20 + Math.floor(r() * 24); for (let y = 56; y < 56 + 3 + Math.floor(r() * 5); y++) p.blend(x, y, H(0x6a3a1a), 0.35); }
  });

  T('trees', {}, (p, r) => {
    const trees = [];
    for (let k = 0; k < 9; k++) trees.push({ x: r() * 64, y: 2 + r() * 16, s: 1.6 + r() * 1.4 });
    const top = new Float32Array(64);
    for (let x = 0; x < 64; x++) {
      let t = 64;
      for (const tr of trees) {
        let dx = Math.abs(x - tr.x);
        if (dx > 32) dx = 64 - dx;
        t = Math.min(t, tr.y + dx * tr.s + (h2(x, Math.floor(tr.y), 3) - 0.5) * 3);
      }
      top[x] = t;
    }
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        if (y < top[x]) {
          p.set(x, y, mix(H(0x0e1014), H(0x151a1e), y / 30));
          p.maskPx(x, y, 2);
          continue;
        }
        const n = fbm(x, y * 1.8, 64, 8, 3, 404);
        let c = mix(H(0x0a120c), H(0x22301f), n);
        if (h2(x, y, 5) < 0.03) c = mix(c, H(0x2e3c34), 0.5);
        if (y > 46) c = mul(c, 1 - (y - 46) / 40);
        p.set(x, y, c);
      }
    for (const tr of trees) {
      const x = Math.round(tr.x);
      for (let y = Math.round(tr.y + 18); y < 64; y++) {
        if (fbm(x, y * 2, 64, 8, 2, 77) < 0.5) { p.set(x, y, H(0x18120c)); p.set(x + 1, y, H(0x0e0a08)); }
      }
    }
  });

  T('fence', { alpha: true }, (p, r) => {
    p.clear(0, 0, 64, 64);
    for (let y = 7; y < 62; y++)
      for (let x = 0; x < 64; x++) if (((x + y) & 7) === 0 || ((x - y + 256) & 7) === 0) p.set(x, y, mul(H(0x8a8e8a), 0.8 + h2(x, y, 3) * 0.3));
    p.rect(0, 5, 64, 2, H(0x9aa09a));
    p.hline(0, 63, 5, H(0xc8ccc8));
    p.hline(0, 63, 61, H(0x6a6e6a));
    p.rect(0, 0, 3, 64, H(0x7a807a));
    p.vline(0, 0, 63, H(0xa8aea8));
    for (const y of [1, 3]) for (let x = 0; x < 64; x++) { p.set(x, y + (x % 8 < 4 ? 0 : 0), H(0x6a6e6a)); if (x % 8 === 3) { p.set(x, y - 1, H(0x8a8e8a)); p.set(x + 1, y + 1, H(0x8a8e8a)); } }
  });

  T('parapet', {}, (p, r) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { p.set(x, y, mix(H(0x14171c), H(0x0b0d10), y / 40)); if (y < 40) p.maskPx(x, y, 2); }
    // everything above the coping is live sky (the renderer draws the storm and the distant ridge)
    blocks({ set: (x, y, c) => { if (y >= 42) p.set(x, y, c); } }, () => H(0x6e6c66), 16, 8, 0.8, 23);
    p.rect(0, 38, 64, 4, H(0x55554f));
    p.hline(0, 63, 38, H(0x8a8a82));
    p.hline(0, 63, 41, H(0x2a2a28));
    for (let x = 0; x < 64; x++) for (let y = 42; y < 47; y++) p.mul(x, y, 0.75 + (y - 42) * 0.05);
    for (let k = 0; k < 8; k++) { const x = Math.floor(r() * 64); for (let y = 42; y < 50 + Math.floor(r() * 10); y++) p.mul(x, y, 0.8); }
  });

  T('sign_station', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    panel(p, 2, 14, 60, 26, H(0x2a4a3a), r, 0.02);
    panel(p, 4, 16, 56, 22, H(0xdcdcd0), r, 0.02, 1.08, 0.85);
    p.textC('RELAY STATION', 32, 19, H(0x1e3a2c));
    p.textC('14', 32, 26, H(0x1e3a2c), 2);
    for (const [x, y] of [[5, 17], [58, 17], [5, 36], [58, 36]]) {
      p.set(x, y, H(0x6a6a62));
      for (let k = 1; k < 6; k++) p.blend(x, y + k + 1, H(0x7a3e1c), 0.35 - k * 0.05);
    }
    for (let x = 3; x < 61; x++) p.blend(x, 40, H(0x000000), 0.35);
  });

  T('hatch', {}, (p, r) => {
    p.clear(0, 0, 64, 64);
    for (let y = 9; y < 58; y++)
      for (let x = 9; x < 55; x++) {
        const e = Math.min(x - 9, y - 9, 54 - x, 57 - y);
        p.set(x, y, e < 3 ? (((x + y) >> 2) & 1 ? H(0xc9a227) : H(0x1c1c18)) : mul(H(0x5a5e5a), 0.85 + fbm(x, y, 64, 4, 2, 9) * 0.3));
      }
    p.bevel(12, 12, 40, 43, 1.25, 0.55);
    for (let k = 15; k < 52; k += 6) { rivet(p, k, 14); rivet(p, k, 52); }
    p.ring(32, 36, 8, H(0x2a2c2a), 2);
    p.ring(32, 36, 7, H(0x8a8e8a), 1);
    p.line(24, 36, 40, 36, H(0x3a3c3a));
    p.line(32, 28, 32, 44, H(0x3a3c3a));
    p.circle(32, 36, 2, H(0x9a9e9a));
    stencil(p, 'ARRAY', 32 - textWidth('ARRAY') / 2, 19, H(0xd8d0b0), 1, r, 0.02);
    for (const y of [20, 46]) p.rect(12, y, 3, 5, H(0x2a2c2a));
  });

  /* ------------------------------------------------------------ floors & ceilings */
  T('floor_lino', { kind: 'floor' }, (p, r) => {
    const chips = [H(0x6a6252), H(0xb8b2a0), H(0x7c7466), H(0xd0cab8), H(0x5a5448)];
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const tx = x >> 4, ty = y >> 4;
        let c = (tx + ty) & 1 ? H(0x9a9482) : H(0x8e897a);
        c = mul(c, 1 + (h2(tx, ty, 5) - 0.5) * 0.06 + (fbm(x, y, 64, 4, 2, 8) - 0.5) * 0.1);
        const ch = h2(x, y, 13);
        if (ch < 0.12) c = mix(c, chips[Math.floor(h2(x, y, 14) * chips.length)], 0.6);
        if ((x & 15) === 0 || (y & 15) === 0) c = mul(c, 0.84);
        p.set(x, y, c);
      }
    for (let k = 0; k < 4; k++) {
      const x = r() * 64, y = r() * 64, a = r() * 6.28;
      for (let i = 0; i < 5; i++) p.blend(x + Math.cos(a) * i, y + Math.sin(a) * i + Math.sin(i) * 0.6, H(0x2a2620), 0.45);
    }
  });

  T('floor_tile', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const tx = x >> 3, ty = y >> 3;
        let c = (tx + ty) & 1 ? H(0xd2d0c6) : H(0xbcbab0);
        if ((tx % 4 === 0 && ty % 4 === 0)) c = H(0x6a8a8a);
        c = mul(c, 1 + (h2(tx, ty, 4) - 0.5) * 0.05);
        if ((x & 7) === 0 || (y & 7) === 0) c = mul(H(0x8a887e), 0.85 + fbm(x, y, 64, 4, 2, 3) * 0.3);
        else if ((x & 7) === 1 && (y & 7) === 1) c = mul(c, 1.08);
        p.set(x, y, c);
      }
  });

  T('floor_concrete', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = fbm(x, y, 64, 4, 4, 17);
        let c = mul(H(0x6c6a64), 0.82 + n * 0.32 + (h2(x, y, 2) - 0.5) * 0.08);
        if (h2(x, y, 6) < 0.04) c = mul(c, 1.2);
        if (x === 0 || y === 0) c = mul(c, 0.7);
        p.set(x, y, c);
      }
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const o = fbm(x, y, 64, 3, 3, 71);
        if (o > 0.64) p.mul(x, y, 1 - (o - 0.64) * 1.6);
      }
    let x = r() * 64, y = r() * 64, a = r() * 6.28;
    for (let k = 0; k < 30; k++) { a += (r() - 0.5) * 0.8; x += Math.cos(a); y += Math.sin(a); p.mul(x, y, 0.55); }
  });

  T('floor_carpet', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let f = 0.84 + h2(x, y, 3) * 0.26 + (fbm(x, y, 64, 4, 2, 5) - 0.5) * 0.12;
        if ((x + (y >> 1)) % 4 === 0 && (y & 1) === 0) f *= 0.9;
        p.set(x, y, mul(H(0x5a4636), f));
      }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (Math.abs(fbm(x, y, 64, 2, 2, 40) - 0.5) < 0.05) p.mul(x, y, 1.1);
  });

  T('floor_grate', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c;
        const bar = x % 4 < 2, cross = y % 8 === 0;
        if (bar || cross) {
          c = mul(H(0x5c605c), 0.82 + h2(x, y, 5) * 0.3);
          if (bar && x % 4 === 0) c = mul(c, 1.25);
          if (cross && !bar) c = mul(c, 0.85);
          const rust = fbm(x, y, 64, 8, 2, 12);
          if (rust > 0.62) c = mix(c, H(0x6a3a1c), (rust - 0.62) * 2.5);
        } else c = mix(H(0x020203), H(0x0c0e12), h2(x >> 2, y >> 3, 3) * 0.6);
        p.set(x, y, c);
      }
    for (let x = 0; x < 64; x++) { p.set(x, 0, H(0x3a3e3a)); p.set(x, 1, H(0x7a7e7a)); }
  });

  T('ground_gravel', { kind: 'floor' }, (p, r) => {
    p.fill((x, y) => mul(H(0x3c3935), 0.8 + h2(x, y, 1) * 0.3));
    for (let k = 0; k < 420; k++) {
      const x = r() * 64, y = r() * 64, rr = 0.7 + r() * 1.4;
      const c = mix(H(0x5e5a52), H(0x8e887a), r());
      p.ellipse(x, y, rr * (0.8 + r() * 0.6), rr, (xx, yy, dx, dy) => mul(c, 1.1 - (dx + dy) * 0.25));
      if (r() < 0.2) p.set(x - 0.5, y - 0.5, H(0xb8bcc0));
    }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const w = fbm(x, y, 64, 3, 2, 55); if (w > 0.6) p.mul(x, y, 1 - (w - 0.6) * 1.2); }
  });

  T('ground_mud', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = fbm(x, y, 64, 4, 4, 23);
        let c = mul(H(0x3a2e22), 0.75 + n * 0.45 + (h2(x, y, 3) - 0.5) * 0.08);
        const pud = fbm(x, y, 64, 3, 3, 90);
        if (pud > 0.6) {
          c = mix(H(0x14161a), H(0x262a30), (pud - 0.6) * 2);
          if (pud < 0.62) c = mix(c, H(0x5a5a58), 0.35);
        }
        p.set(x, y, c);
      }
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(r() * 64), y = Math.floor(r() * 64);
      if (fbm(x, y, 64, 3, 3, 90) > 0.55) continue;
      for (let i = 0; i < 3; i++) p.set(x + i - 1, y - (i === 1 ? 2 : 1), H(0x2a3a1e));
    }
  });

  T('ground_asphalt', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(H(0x2c2c2d), 0.85 + h2(x, y, 2) * 0.25);
        if (h2(x, y, 9) < 0.08) c = mix(c, H(0x6a6a68), 0.5);
        const wet = fbm(x, y, 64, 3, 3, 14);
        if (wet > 0.55) c = mix(c, H(0x3a4048), Math.min(0.6, (wet - 0.55) * 3));
        if (wet > 0.66) c = mix(c, H(0x16181c), 0.6);
        p.set(x, y, c);
      }
    let x = r() * 64, y = r() * 64, a = r() * 6.28;
    for (let k = 0; k < 40; k++) { a += (r() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a); p.set(x, y, H(0x141414)); }
  });

  T('roof_tar', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(H(0x2a2826), 0.8 + fbm(x, y, 64, 4, 3, 5) * 0.4);
        if (h2(x, y, 7) < 0.1) c = mix(c, H(0x6a6660), 0.5);
        if (y % 32 === 0) c = mul(c, 1.35);
        if (y % 32 === 1) c = mul(c, 0.7);
        const pud = fbm(x, y, 64, 3, 2, 31);
        if (pud > 0.64) c = mix(c, H(0x1a1e24), 0.7);
        p.set(x, y, c);
      }
  });

  T('ceil_tile', {
    kind: 'floor',
    abandon(p, r) {
      // one sagging, water-logged tile per panel: dark tide rings and a dropped edge
      const tx = Math.floor(r() * 2) * 32, ty = Math.floor(r() * 2) * 32;
      for (let y = ty + 2; y < ty + 32; y++)
        for (let x = tx + 2; x < tx + 32; x++) {
          const d = Math.hypot(x - tx - 16, y - ty - 16) / 16 + (h2(x, y, 5) - 0.5) * 0.2;
          if (d < 0.9) p.set(x, y, mix(p.get(x, y), H(0x5a4a34), 0.35 * (1 - d)));
          if (Math.abs(d - 0.8) < 0.05) p.mul(x, y, 0.7);
        }
      p.rect(tx + 2, ty + 30, 30, 2, H(0x0c0b09));
      p.hline(tx + 2, tx + 31, ty + 29, H(0x3a3630));
    },
  }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(H(0xb8b4a6), 0.93 + fbm(x, y, 64, 4, 2, 3) * 0.1);
        if (h2(x, y, 5) < 0.12) c = mul(c, 0.78);
        const f = h2(x >> 1, y, 8);
        if (f < 0.04) c = mul(c, 0.7);
        p.set(x, y, c);
      }
    for (const k of [0, 32]) {
      p.hline(0, 63, k, H(0xdad8d0));
      p.hline(0, 63, k + 1, H(0x8a867a));
      p.vline(k, 0, 63, H(0xdad8d0));
      p.vline(k + 1, 0, 63, H(0x8a867a));
    }
  });

  T('ceil_light', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, mul(H(0xb8b4a6), 0.93 + h2(x, y, 5) * 0.08));
    for (const k of [0]) { p.hline(0, 63, k, H(0xdad8d0)); p.vline(k, 0, 63, H(0xdad8d0)); p.hline(0, 63, k + 1, H(0x8a867a)); p.vline(k + 1, 0, 63, H(0x8a867a)); }
    p.rect(15, 6, 34, 52, H(0xd4d4cc));
    p.bevel(15, 6, 34, 52, 1.1, 0.7);
    for (let y = 8; y < 56; y++)
      for (let x = 17; x < 47; x++) {
        const tube = Math.abs(((x - 17) % 10) - 5) < 2 ? 1 : 0.9;
        let c = mix(H(0xe4eeee), H(0xfafffe), tube - 0.9 + 0.5);
        if ((x + y) % 3 === 0) c = mul(c, 0.94);
        p.set(x, y, c);
      }
    p.emit(17, 8, 30, 48, 255);
    for (let x = 17; x < 47; x++) { p.set(x, 8, H(0xb8c0c0)); p.set(x, 55, H(0xb8c0c0)); }
  });

  T('ceil_concrete', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        let c = mul(H(0x68665f), 0.84 + fbm(x, y, 64, 4, 3, 7) * 0.26);
        const plank = y >> 3;
        c = mul(c, 1 + (h2(plank, x >> 5, 1) - 0.5) * 0.08);
        if ((y & 7) === 0) c = mul(c, 0.85);
        if (x % 32 === 16 && y % 32 === 16) c = H(0x2a2a28);
        p.set(x, y, c);
      }
  });

  T('ceil_rock', { kind: 'floor' }, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const w = fbm(x, y, 64, 3, 2, 17) * 8;
        const n = fbm(x + w, y + w, 64, 4, 4, 58);
        let c = mix(H(0x16140f), H(0x46403a), n);
        if (Math.abs(fbm(x, y, 64, 5, 3, 61) - 0.5) < 0.02) c = mul(c, 0.5);
        if (h2(x, y, 4) < 0.02) c = mix(c, H(0x8a98a4), 0.4);
        p.set(x, y, c);
      }
  });

  /* ------------------------------------------------------------ decals */
  const D = { kind: 'decal' };
  T('dec_calendar', D, (p, r) => {
    p.rect(15, 7, 36, 40, H(0x2a2420));
    p.rect(14, 6, 36, 40, H(0xece8dc));
    for (let y = 8; y < 21; y++)
      for (let x = 16; x < 48; x++) {
        const ridge = 14 + Math.sin((x - 16) * 0.35) * 2 + Math.sin((x - 16) * 0.9) * 1;
        p.set(x, y, y < ridge ? mix(H(0x8aa0b8), H(0xc8d4dc), (y - 8) / 8) : mix(H(0x3a5a3a), H(0x5a7a4a), h2(x, y, 3)));
      }
    p.rect(30, 4, 4, 3, H(0x6a6a66));
    p.textC('OCT 1999', 32, 23, H(0x9a1a14));
    p.hline(16, 47, 29, H(0xb8b4a8));
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 7; col++) {
        const x = 16 + col * 5 - (col > 3 ? 0 : 0), y = 31 + row * 3, day = row * 7 + col - 4;
        if (day < 1 || day > 31) continue;
        p.hline(x + 1, x + 2, y, H(0x6a6a66));
        if (day < 27) { p.set(x, y + 1, H(0xc02a1a)); p.set(x + 1, y, H(0xc02a1a)); p.set(x + 2, y - 1, H(0xc02a1a)); }
        if (day === 27) p.ring(x + 1.5, y + 0.5, 2.3, H(0x2a4ab0));
      }
  });

  /**
   * The staff photo on the kitchen wall — the same June 1986 print devices.js shows close up
   * (photoScene): sky and firs, the cream station wall with its green door, gravel; left to right
   * a grey-haired man in a white short-sleeved shirt and red tie, a woman in a blue blouse and
   * brown skirt with big brown hair, a moustached man in a red plaid shirt and blue trousers.
   * With `four` a fourth figure stands at the right edge, nearer the lens and out of focus: dark
   * green jacket, tan collar, no face.
   */
  function groupPhoto(p, four) {
    p.rect(19, 13, 27, 21, H(0x1a120c));
    p.rect(18, 12, 27, 21, H(0x5a3a1e));
    p.bevel(18, 12, 27, 21, 1.3, 0.6);
    p.rect(20, 14, 23, 17, H(0xd8d4c4));
    const X0 = 21, Y0 = 15, IW = 21, IH = 15; // the print area inside the white border
    for (let y = 0; y < IH; y++)
      for (let x = 0; x < IW; x++) {
        const v = (y + 0.5) / IH, u = (x + 0.5) / IW;
        let c;
        if (v < 0.27) c = mix(H(0x8fb0c8), H(0xdde3da), v / 0.27); // sky
        else if (v < 0.36) c = h2(x, y, 11) < 0.5 ? H(0x4b5e52) : H(0x344632); // firs
        else if (v < 0.4) c = H(0x6b665c); // roof edge
        else if (v < 0.66) {
          c = H(0xc3bba9); // the station wall
          if (u > 0.47 && u < 0.54) c = H(0x35503f); // green door
          else if ((u > 0.08 && u < 0.18) || (u > 0.22 && u < 0.32) || (u > 0.7 && u < 0.8)) c = v < 0.56 ? H(0x39444a) : c; // windows
        } else c = mix(H(0x958c7b), H(0x7d7565), h2(x, y, 5) * 0.6); // gravel
        p.set(X0 + x, Y0 + y, c);
      }
    // three staff, feet near the bottom, heads level with the roof
    const person = (cx, o) => {
      const top = Y0 + 5;
      p.set(cx, top, o.hair); p.set(cx + 1, top, o.hair);
      if (o.bigHair) { p.set(cx - 1, top + 1, o.hair); p.set(cx + 2, top + 1, o.hair); p.set(cx - 1, top + 2, o.hair); p.set(cx + 2, top + 2, o.hair); }
      p.set(cx, top + 1, o.skin); p.set(cx + 1, top + 1, o.skin);
      p.set(cx, top + 2, mul(o.skin, 0.9)); p.set(cx + 1, top + 2, mul(o.skin, 0.9));
      for (let y = top + 3; y <= top + 5; y++) for (let x = cx - 1; x <= cx + 2; x++) p.set(x, y, (x === cx - 1 || x === cx + 2) && o.shortSleeves && y > top + 3 ? o.skin : o.shirt);
      if (o.tie) { p.set(cx, top + 3, o.tie); p.set(cx, top + 4, o.tie); }
      if (o.plaid) { p.set(cx - 1, top + 4, mul(o.shirt, 0.7)); p.set(cx + 1, top + 3, mul(o.shirt, 0.7)); p.set(cx + 2, top + 5, mul(o.shirt, 0.7)); }
      for (let y = top + 6; y <= top + 8; y++) {
        if (o.skirt && y === top + 6) { for (let x = cx - 1; x <= cx + 2; x++) p.set(x, y, o.pants); continue; }
        p.set(cx, y, o.skirt ? o.skin : o.pants); p.set(cx + 1, y, o.skirt ? o.skin : o.pants);
      }
      p.set(cx, top + 9, H(0x2a2420)); p.set(cx + 1, top + 9, H(0x2a2420));
    };
    person(X0 + 5, { hair: H(0xa19c93), skin: H(0xd7a98a), shirt: H(0xebe7dc), shortSleeves: true, tie: H(0x6d2b22), pants: H(0x3e3c38) });
    person(X0 + 10, { hair: H(0x5a3a24), bigHair: true, skin: H(0xe2b597), shirt: H(0x7394b6), pants: H(0x57493d), skirt: true });
    person(X0 + 14, { hair: H(0x2f2419), skin: H(0xc9967a), shirt: H(0x8d3b2c), plaid: true, pants: H(0x4b5a78) });
    if (four) {
      // at the right edge, nearer the lens, out of focus: a jacket like yours, no face
      const fx = X0 + IW - 3;
      for (let y = Y0 + 4; y < Y0 + IH; y++)
        for (let x = fx - 1; x < X0 + IW; x++) {
          const head = y < Y0 + 7;
          if (head && (x < fx || x > fx + 1)) continue;
          const c = head ? H(0xc7a28e) : y === Y0 + 7 ? H(0x9c7a4c) : H(0x2c3a35);
          p.blend(x, y, c, head ? 0.55 : 0.8);
        }
      p.blend(fx - 2, Y0 + 9, H(0x2c3a35), 0.35); // blur spilling over the edge of the figure
    }
    p.blendRect(20, 14, 23, 17, H(0xd8c890), 0.12); // faded print
  }
  T('dec_photo', D, (p) => groupPhoto(p, false));
  T('dec_photo_four', D, (p) => groupPhoto(p, true));

  T('dec_clock', D, (p) => {
    p.circle(32.5, 14.5, 9, H(0x1e1e1c));
    p.circle(32.5, 14.5, 7.6, H(0xf0ece0));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      p.set(Math.round(32 + Math.cos(a) * 6.3), Math.round(14 + Math.sin(a) * 6.3), H(0x1e1e1c));
    }
    const hA = ((2 + 13 / 60) / 12) * Math.PI * 2 - Math.PI / 2, mA = (13 / 60) * Math.PI * 2 - Math.PI / 2;
    p.line(32, 14, 32 + Math.cos(hA) * 3.6, 14 + Math.sin(hA) * 3.6, H(0x101010));
    p.line(32, 14, 32 + Math.cos(mA) * 5.6, 14 + Math.sin(mA) * 5.6, H(0x101010));
    p.line(32, 14, 32 + Math.cos(2.1) * 5, 14 + Math.sin(2.1) * 5, H(0xc02a1a));
    p.set(29, 10, H(0xffffff));
  });

  T('dec_notice', D, (p, r) => {
    p.rect(20, 13, 26, 28, H(0x2a2420));
    p.rect(19, 12, 26, 28, H(0xeeeae0));
    p.rect(19, 12, 26, 7, H(0xb02a1a));
    p.textC('NOTICE', 32, 13, H(0xf8f4ec));
    for (let k = 0; k < 9; k++) p.hline(21, 21 + 10 + Math.floor(r() * 10), 21 + k * 2, H(0x6a6a70));
    p.blendRect(21, 11, 4, 2, H(0xe8e0b0), 0.7);
    p.blendRect(39, 11, 4, 2, H(0xe8e0b0), 0.7);
  });

  T('dec_blueprint', D, (p, r) => {
    p.rect(9, 7, 46, 34, H(0x182848));
    p.rect(8, 6, 46, 34, H(0x28508c));
    for (let y = 6; y < 40; y++) for (let x = 8; x < 54; x++) if ((x - 8) % 4 === 0 || (y - 6) % 4 === 0) p.mul(x, y, 1.08);
    const W = H(0xdce8f4);
    p.rect(11, 9, 32, 26, 0);
    const box = (x, y, w, h) => { p.hline(x, x + w, y, W); p.hline(x, x + w, y + h, W); p.vline(x, y, y + h, W); p.vline(x + w, y, y + h, W); };
    for (let y = 9; y < 36; y++) for (let x = 11; x < 44; x++) p.set(x, y, H(0x28508c));
    box(11, 9, 32, 26);
    p.hline(11, 43, 20, W);
    p.hline(11, 43, 24, W);
    for (const x of [19, 27, 35]) { p.vline(x, 9, 20, W); p.vline(x, 24, 35, W); }
    p.set(15, 20, H(0x28508c)); p.set(16, 20, H(0x28508c)); p.set(23, 24, H(0x28508c)); p.set(24, 24, H(0x28508c));
    p.rect(45, 30, 8, 8, H(0x28508c));
    box(45, 30, 8, 8);
    p.hline(46, 51, 33, W);
    p.hline(46, 49, 35, W);
    p.text('14', 46, 9, W);
  });

  T('dec_vent', D, (p, r) => {
    panel(p, 24, 4, 16, 10, H(0xa8a8a0), r);
    for (let y = 6; y < 13; y += 2) { p.hline(26, 37, y, H(0x1a1a1a)); p.hline(26, 37, y + 1, H(0xd0d0c8)); }
    screw(p, 25, 5); screw(p, 37, 5); screw(p, 25, 12); screw(p, 37, 12);
    for (let x = 26; x < 38; x++) if (h2(x, 1, 3) < 0.4) p.blend(x, 14, H(0x3a3a36), 0.3);
  });

  // the basement's ventilation duct (Calm You: "low on the wall. Four screws. The bottom left
  // one's stripped."): a bigger grille down by the floor, one screw chewed and rust-streaked
  T('dec_duct', D, (p, r) => {
    p.blendRect(14, 33, 36, 3, H(0x1a1a18), 0.35); // grime above the frame
    panel(p, 14, 36, 36, 20, H(0x9a9a92), r, 0.03);
    p.rect(17, 39, 30, 14, H(0x121212));
    for (let y = 39; y < 53; y += 2) { p.hline(17, 46, y, H(0x7a7a72)); p.hline(17, 46, y + 1, H(0x0e0e0e)); }
    for (let x = 17; x < 47; x++) if (h2(x, 3, 9) < 0.5) p.blend(x, 39, H(0xc8c8c0), 0.5);
    screw(p, 15, 37); screw(p, 47, 37); screw(p, 47, 54);
    // bottom left: stripped — a bright scratched ring, the slot chewed round
    p.set(15, 54, H(0xd8d4c4)); p.set(16, 54, H(0xd8d4c4)); p.set(15, 55, H(0x6a4a2a)); p.set(14, 54, H(0x8a8a82));
    for (let y = 56; y < 60; y++) p.blend(15, y, H(0x6a3a1a), 0.45 - (y - 56) * 0.08);
    for (let k = 0; k < 3; k++) { const x = 20 + Math.floor(r() * 24); for (let y = 56; y < 58 + Math.floor(r() * 4); y++) p.blend(x, y, H(0x6a3a1a), 0.3); }
  });

  T('dec_plaque', D, (p, r) => {
    p.rect(9, 21, 48, 17, H(0x1e1a12));
    p.rect(8, 20, 48, 17, BRASS);
    for (let y = 20; y < 37; y++) for (let x = 8; x < 56; x++) p.mul(x, y, 0.9 + h2(x, y, 4) * 0.15 + (x - 8) / 400);
    p.bevel(8, 20, 48, 17, 1.35, 0.55);
    p.bevel(11, 22, 42, 13, 0.7, 1.2);
    p.textC('STATION 14', 32, 23, H(0x2a1e0a));
    p.textC('EST. 1978', 32, 29, H(0x2a1e0a));
    screw(p, 9, 21); screw(p, 53, 21); screw(p, 9, 34); screw(p, 53, 34);
  });

  T('dec_sign_radio', D, (p, r) => {
    p.rect(10, 15, 45, 10, H(0x1a1a18));
    p.rect(9, 14, 45, 10, H(0x2a3a4a));
    p.bevel(9, 14, 45, 10, 1.3, 0.6);
    p.textC('RADIO ROOM', 32, 17, H(0xe8ecf0));
  });

  T('dec_sign_exit', D, (p, r) => {
    p.rect(17, 2, 30, 13, H(0x1c1e1c));
    p.bevel(17, 2, 30, 13, 1.3, 0.6);
    p.rect(19, 4, 26, 9, H(0x0c3a18));
    // chunky lettering: the 3×5 font stretched to 5/3 width and 1.4 height
    const tmp = new Pic(64, 16);
    tmp.text('EXIT', 0, 0, H(0xffffff));
    const tw = textWidth('EXIT');
    const ox = Math.round(32 - (tw * 5) / 3 / 2);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < tw; x++)
        if (tmp.get(x, y)) p.rect(ox + Math.floor((x * 5) / 3), 5 + Math.floor(y * 1.4), 2, 2, H(0x8affa4));
    p.emit(19, 4, 26, 9, 150);
    for (let y = 4; y < 13; y++) for (let x = 19; x < 45; x++) if (p.get(x, y) === H(0x8affa4)) p.emitPx(x, y, 255);
    p.hline(31, 33, 15, H(0x3a3a38));
  });

  T('dec_graffiti_code', D, (p, r) => {
    const PAINT = H(0xb01e16);
    const tmp = new Pic(64, 64);
    tmp.text('0213', 0, 0, 1);
    const tw = textWidth('0213');
    const s = 3, ox = Math.round(32 - (tw * s) / 2), oy = 12;
    // crude, slightly wandering strokes: each font pixel becomes a jittered 3×3 dab
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < tw; x++)
        if (tmp.get(x, y)) {
          const jx = Math.round((h2(x, y, 5) - 0.5) * 1.2), jy = Math.round(x * 0.12 + (h2(x, y, 6) - 0.5));
          p.rect(ox + x * s + jx, oy + y * s + jy, s, s, PAINT);
        }
    // light overspray halo
    for (let y = 6; y < 36; y++)
      for (let x = 4; x < 60; x++) {
        if (cA(p.get(x, y))) continue;
        const near = cA(p.get(x + 1, y)) || cA(p.get(x - 1, y)) || cA(p.get(x, y + 1)) || cA(p.get(x, y - 1));
        if (near && h2(x, y, 7) < 0.45) p.set(x, y, withA(PAINT, 110));
      }
    // drips
    for (let k = 0; k < 9; k++) {
      const x = ox + Math.floor(r() * tw * s);
      let y0 = oy + 16;
      while (y0 > oy && !cA(p.get(x, y0 - 1))) y0--;
      if (y0 <= oy + 2 || cA(p.get(x, y0 - 1)) < 255) continue;
      const len = 2 + Math.floor(r() * 9);
      for (let y = y0; y < y0 + len; y++) p.set(x, y, withA(PAINT, 240 - (y - y0) * 12));
    }
    // arrow → toward the steel door
    p.thick(14, 42, 46, 40, 1.1, PAINT);
    p.thick(46, 40, 40, 35, 1.1, PAINT);
    p.thick(46, 40, 41, 46, 1.1, PAINT);
    for (let i = 0; i < 64 * 64; i++) { const c = p.px[i]; if (cA(c) === 255) p.px[i] = mul(c, 0.82 + h2(i & 63, i >> 6, 2) * 0.3); }
  });

  T('dec_keycabinet', D, (p, r) => {
    p.rect(21, 17, 23, 26, H(0x1a1a18));
    panel(p, 20, 16, 23, 26, H(0x7a7e78), r, 0.03, 1.3, 0.55);
    p.rect(22, 18, 19, 5, H(0x2a2c2a));
    p.textC('KEYS', 31.5, 18, H(0xe0e0d8));
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) { p.rect(24 + col * 5, 25 + row * 4, 3, 3, H(0x2a2a28)); p.set(24 + col * 5, 25 + row * 4, H(0x8a8a86)); }
    led(p, 39, 26, LED_R, true);
    p.rect(39, 30, 2, 6, H(0xb0b4b0));
  });

  T('dec_phone', D, (p, r) => {
    const BG = H(0xcfc4a8);
    panel(p, 26, 20, 12, 22, BG, r, 0.02);
    p.rect(27, 16, 10, 7, mul(BG, 0.95));
    p.bevel(27, 16, 10, 7, 1.2, 0.7);
    p.rect(28, 15, 8, 2, mul(BG, 1.05));
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) p.set(28 + col * 3, 25 + row * 3, H(0x5a5448));
    for (let y = 42; y < 58; y++) p.set(32 + Math.round(Math.sin(y * 1.3) * 1.5), y, mul(BG, 0.7));
    led(p, 35, 38, LED_R, false);
  });

  T('dec_switch', D, (p) => {
    p.rect(51, 29, 6, 10, H(0x2a2620));
    p.rect(50, 28, 6, 10, H(0xe0d8c0));
    p.bevel(50, 28, 6, 10, 1.1, 0.75);
    p.rect(52, 31, 2, 3, H(0xf4f0e0));
    p.set(52, 34, H(0x8a8472));
    p.set(52, 29, H(0x9a9482));
    p.set(52, 36, H(0x9a9482));
  });

  T('dec_keypad', D, (p, r) => {
    p.rect(45, 23, 12, 18, H(0x1a1a18));
    panel(p, 44, 22, 12, 18, H(0x9ca09c), r, 0.03, 1.3, 0.5);
    p.rect(46, 24, 8, 3, H(0x0a1a0e));
    p.hline(47, 51, 25, H(0x3cf070));
    p.emit(46, 24, 8, 3, 200);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) { p.rect(46 + col * 3, 28 + row * 3, 2, 2, H(0x3a3c3a)); p.set(46 + col * 3, 28 + row * 3, H(0x8a8c8a)); }
    led(p, 54, 28, LED_R, true);
  });

  T('dec_weather_panel', D, (p, r) => {
    p.rect(5, 11, 55, 31, H(0x1a1a18));
    panel(p, 4, 10, 55, 31, H(0x3e4440), r, 0.02, 1.3, 0.55);
    p.textC('WEATHER', 31.5, 12, H(0xd8d8d0));
    const dial = (cx, cy, a) => {
      p.circle(cx, cy, 5.5, H(0x1a1a18));
      p.circle(cx, cy, 4.6, H(0xe8e2cc));
      p.emit(cx - 5, cy - 5, 10, 10, 90);
      for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; p.set(Math.round(cx + Math.cos(t) * 3.8), Math.round(cy + Math.sin(t) * 3.8), H(0x5a5448)); }
      p.line(cx, cy, cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5, H(0xb01a10));
    };
    const xs = [12, 26, 40];
    dial(xs[0], 25, -0.6);
    dial(xs[1], 25, 2.3);
    dial(xs[2], 25, -2.2);
    ['WND', 'DIR', 'BAR'].forEach((t, k) => p.textC(t, xs[k] + 0.5, 33, H(0x9a9a92)));
    p.rect(49, 19, 7, 15, H(0x0a1a0e));
    for (let k = 0; k < 6; k++) led(p, 52, 21 + k * 2, LED_G, k > 1, 220);
    p.bevel(49, 19, 7, 15, 0.6, 1.3);
  });

  T('dec_stencil_relay', D, (p, r) => {
    const Y = H(0xd0c080);
    stencil(p, 'RELAY', 32 - textWidth('RELAY', 2) / 2, 12, withA(Y, 255), 2, r, 0.06);
    stencil(p, 'CHAMBER', 32 - textWidth('CHAMBER') / 2, 24, withA(Y, 255), 1, r, 0.03);
    p.thick(20, 34, 40, 34, 0.9, Y);
    p.thick(40, 34, 36, 31, 0.9, Y);
    p.thick(40, 34, 36, 37, 0.9, Y);
    for (let i = 0; i < 64 * 64; i++) if (p.px[i]) p.px[i] = withA(p.px[i], 200);
  });

  T('dec_water_stain', D, (p, r) => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot((x - 30) / 16, y / 34) + (fbm(x, y, 64, 5, 3, 21) - 0.5) * 0.5;
        if (d < 0.95) p.set(x, y, withA(mix(H(0x6a5030), H(0x8a6a40), fbm(x, y, 64, 8, 2, 3)), Math.floor(120 * (1 - d * 0.7))));
        else if (d < 1.03) p.set(x, y, withA(H(0x4a3420), 150));
      }
  });

  T('dec_crack', D, (p, r) => {
    const walk = (x, y, a, len, depth) => {
      for (let k = 0; k < len; k++) {
        a += (r() - 0.5) * 0.8;
        x += Math.cos(a);
        y += Math.sin(a);
        p.set(x, y, withA(H(0x141210), 230));
        p.set(x + 1, y, withA(H(0xd8d4c8), 60));
        if (depth < 2 && r() < 0.06) walk(x, y, a + (r() - 0.5) * 2, len / 3, depth + 1);
      }
    };
    walk(10, 8, 0.7, 40, 0);
    walk(40, 30, 1.9, 22, 1);
  });

  /* ------------------------------------------------------------ sprites */
  // Light comes from the upper left: parts are shaded by a left→right gradient.
  const OUTLINE = H(0x0a0a0c);
  /** Fill a quad-ish body part with a left-lit gradient. */
  function part(p, pts, c, amt = 0.34) {
    let x0 = Infinity, x1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); }
    p.poly(pts, (x) => mul(c, 1.12 - amt * ((x - x0) / Math.max(1, x1 - x0))));
  }
  /**
   * Person sprite (48×96, feet at y=95, ~70 px tall → 0.73 walls at scale 1).
   * frame 0–3 walk toward viewer, 4 idle, 5–8 walk away (back), 9 idle back.
   */
  function person(p, o, frame) {
    const back = frame >= 5;
    const f = frame % 5;
    const bob = f === 1 || f === 3 ? -1 : 0;
    const cx = 24;
    const top = 26 + bob + (o.stoop || 0);
    const shoulderY = top + 13;
    const hem = o.hem + bob;
    // legs
    const leg = (side, lift, dx) => {
      const x = cx + (side < 0 ? -6 : 1) + dx;
      const footY = 95 - lift;
      part(p, [[x, hem - 2], [x + 5, hem - 2], [x + 5, footY - 3], [x, footY - 3]], o.pants, 0.3);
      const sx = side < 0 ? x - 1 : x;
      p.rect(sx, footY - 3, 6, 3, o.shoe);
      p.hline(sx, sx + 5, footY - 3, mul(o.shoe, 1.4));
      if (lift) p.hline(x, x + 4, footY - 7, mul(o.pants, 0.7));
    };
    const walk = f === 0 ? [0, 3, -1, 1] : f === 2 ? [3, 0, 1, -1] : [0, 0, 0, 0];
    leg(-1, walk[0], f === 4 ? -1 : walk[2] * 0);
    leg(1, walk[1], f === 4 ? 1 : 0);
    // coat / torso
    const hw = 7, hwB = o.flare;
    part(p, [[cx - hw, shoulderY], [cx + hw, shoulderY], [cx + hwB, hem], [cx - hwB, hem]], o.coat, 0.36);
    p.hline(cx - hw + 1, cx + hw - 2, shoulderY, mul(o.coat, 1.35)); // wet shoulders catch the light
    if (!back) {
      if (o.parka) {
        p.vline(cx, shoulderY + 3, hem - 1, H(0x9a9a92));
        for (const py of [shoulderY + 12, shoulderY + 20]) { p.rect(cx - 6, py, 4, 3, mul(o.coat, 0.8)); p.rect(cx + 3, py, 4, 3, mul(o.coat, 0.8)); }
      } else {
        p.poly([[cx - 3, shoulderY], [cx + 3, shoulderY], [cx, shoulderY + 7]], o.shirt);
        p.vline(cx, shoulderY + 7, hem - 1, mul(o.coat, 0.65));
        for (let k = 0; k < 3; k++) p.set(cx + 2, shoulderY + 11 + k * 7, mul(o.coat, 1.5));
        p.hline(cx - hw + 1, cx + hw - 1, shoulderY + 18, mul(o.coat, 0.75));
      }
    } else {
      p.vline(cx, shoulderY + 12, hem - 1, mul(o.coat, 0.7));
      if (!o.parka) p.hline(cx - 5, cx + 4, shoulderY + 18, mul(o.coat, 0.8));
    }
    // arms: sleeves hang outside the torso so the silhouette reads
    const swingL = f === 0 ? -2 : f === 2 ? 2 : 0, swingR = -swingL;
    const arm = (side, swing) => {
      const sx = side < 0 ? cx - hw - 4 : cx + hw;
      const sw = back ? -swing : swing;
      const hx = sx + (side < 0 ? -1 : 1) + sw * 0.5;
      const handY = shoulderY + 25 + (sw < 0 ? -2 : 0);
      const sleeve = mul(o.coat, 0.86);
      if (o.pockets && f === 4) {
        part(p, [[sx + 1, shoulderY], [sx + 4, shoulderY], [sx + 4 + side * 0.5, shoulderY + 21], [sx + side, shoulderY + 21]], sleeve);
        p.vline(side < 0 ? sx + 4 : sx, shoulderY + 2, shoulderY + 20, mul(o.coat, 0.55));
        return;
      }
      part(p, [[sx + (side < 0 ? 1 : 0), shoulderY], [sx + 4 - (side < 0 ? 0 : 1), shoulderY], [hx + 4, handY - 2], [hx, handY - 2]], sleeve);
      p.line(side < 0 ? sx + 4 : sx, shoulderY + 3, side < 0 ? hx + 4 : hx, handY - 3, mul(o.coat, 0.55));
      p.hline(Math.round(hx), Math.round(hx) + 3, handY - 2, mul(o.coat, 0.6));
      p.rect(Math.round(hx), handY - 1, 4, 3, back ? mul(o.skin, 0.8) : o.skin);
      p.set(Math.round(hx) + (side < 0 ? 3 : 0), handY + 1, mul(o.skin, 0.7));
      p.set(Math.round(hx) + (side < 0 ? 0 : 3), handY + 1, CLEAR);
    };
    arm(-1, swingL);
    arm(1, swingR);
    // collar / hood
    if (o.parka) {
      p.ellipse(cx, shoulderY + 1, 7, 3, (x) => mul(o.fur, 0.95 + h2(x, shoulderY, 3) * 0.2));
      if (back) p.ellipse(cx, shoulderY + 4, 6, 5, mul(o.coat, 0.85));
    } else p.rect(cx - 5, shoulderY - 1, 10, 3, mul(o.coat, 1.1));
    // head
    p.rect(cx - 2, top + 10, 4, 3, mul(o.skin, 0.8));
    p.ellipse(cx, top + 5.5, 4.5, 6, (x, y) => mul(back ? o.hair : o.skin, 1.1 - 0.35 * ((x - (cx - 4)) / 9)));
    if (!back) {
      p.set(cx - 5, top + 5, mul(o.skin, 0.85));
      p.set(cx + 4, top + 5, mul(o.skin, 0.75));
      p.set(cx - 2, top + 5, H(0x1e1814));
      p.set(cx + 1, top + 5, H(0x1e1814));
      p.set(cx, top + 7, mul(o.skin, 0.78));
      p.hline(cx - 1, cx + 1, top + 9, mul(o.skin, 0.62));
      if (o.stubble) for (let y = top + 7; y < top + 11; y++) for (let x = cx - 3; x <= cx + 3; x++) if (h2(x, y, 3) < 0.35) p.mul(x, y, 0.82);
    } else if (!o.hat) p.ellipse(cx, top + 4.5, 4.5, 5, (x) => mul(o.hair, 1.1 - 0.3 * ((x - cx + 4) / 9)));
    if (o.hat === 'cap') {
      p.ellipse(cx, top + 2, 5, 3.4, (x) => mul(o.capC, 1.15 - 0.35 * ((x - cx + 5) / 10)));
      p.rect(cx - 5, top + 2, 10, 2, o.capC);
      if (!back) {
        p.hline(cx - 6, cx + 5, top + 4, mul(o.capC, 0.7));
        p.hline(cx - 4, cx + 3, top + 5, mul(o.skin, 0.55));
      } else p.hline(cx - 2, cx + 1, top + 4, mul(o.capC, 1.4));
    } else {
      p.ellipse(cx, top + 1.5, 4.8, 2.6, (x) => mul(o.hair, 1.15 - 0.3 * ((x - cx + 5) / 10)));
      if (!back) { p.set(cx - 4, top + 3, o.hair); p.set(cx + 4, top + 3, o.hair); }
    }
    p.outline(OUTLINE);
  }
  const HOLLIS = {
    coat: H(0x31363c), shirt: H(0x8a8a7e), pants: H(0x2a2a2c), shoe: H(0x1a1612), skin: H(0xb88e72),
    hair: H(0x5a5550), hat: 'cap', capC: H(0x28303e), stubble: true, hem: 76, flare: 10, stoop: 1, pockets: true,
  };
  const REPLACEMENT = {
    coat: H(0x4a5a3a), fur: H(0x9a8a6a), parka: true, pants: H(0x3a4a6a), shoe: H(0x9a9a92), skin: H(0xc49a7a),
    hair: H(0x3e2a1c), hat: null, hem: 70, flare: 10,
  };
  T('spr_hollis', { kind: 'sprite', w: 48, h: 96, frames: 10, scale: 1 }, (p, r, f) => person(p, HOLLIS, f));
  T('spr_replacement', { kind: 'sprite', w: 48, h: 96, frames: 10, scale: 1 }, (p, r, f) => person(p, REPLACEMENT, f));
  T('spr_figure', { kind: 'sprite', w: 48, h: 96, frames: 10, scale: 1 }, (p, r, f) => {
    const K = H(0x0b0b0d);
    person(p, { coat: K, shirt: K, pants: K, shoe: K, skin: H(0x141416), hair: K, hat: null, hem: 72, flare: 9 }, f);
    for (let i = 0; i < p.px.length; i++) if (cA(p.px[i])) p.px[i] = mul(H(0x0e0e10), 0.8 + h2(i, 1, 2) * 0.4);
    p.softAlpha(1);
  });

  T('spr_operator', { kind: 'sprite', w: 48, h: 96, scale: 1 }, (p, r) => {
    const CH = H(0x26282c), SH = H(0x4a4c5a), HAIR = H(0x3a2c22);
    // casters + star base
    for (const [x, y] of [[8, 92], [39, 92], [18, 93], [29, 93]]) p.ellipse(x, y, 2, 1.6, H(0x101010));
    p.line(10, 91, 24, 87, H(0x1a1a1a)); p.line(38, 91, 24, 87, H(0x1a1a1a));
    p.line(19, 92, 24, 87, H(0x1a1a1a)); p.line(29, 92, 24, 87, H(0x1a1a1a));
    p.rect(22, 75, 4, 13, H(0x8a8e92));
    p.vline(22, 75, 87, H(0xc0c4c8));
    // seat
    part(p, [[9, 70], [39, 70], [37, 76], [11, 76]], mul(CH, 0.9));
    // arms on armrests
    part(p, [[8, 51], [13, 51], [13, 66], [8, 66]], SH);
    part(p, [[35, 51], [40, 51], [40, 66], [35, 66]], SH);
    p.rect(6, 64, 8, 3, H(0x141414));
    p.rect(34, 64, 8, 3, H(0x141414));
    // shoulders above the chair back
    p.ellipse(24, 51, 14, 6, (x) => mul(SH, 1.1 - 0.3 * ((x - 10) / 28)));
    p.rect(21, 42, 6, 6, H(0x9a7a62));
    p.ellipse(24, 38, 5.5, 7, (x) => mul(HAIR, 1.15 - 0.35 * ((x - 18) / 11)));
    p.set(18, 38, H(0xa08068)); p.set(29, 38, H(0x8a6a56));
    // chair back (in front of the torso, we see it from behind)
    p.poly([[13, 50], [35, 50], [36, 71], [12, 71]], (x, y) => mul(CH, 1.08 - 0.3 * ((x - 12) / 24) + (h2(x, y, 3) - 0.5) * 0.05));
    p.ellipse(24, 50.5, 11.5, 2.5, mul(CH, 1.15));
    for (let y = 54; y < 70; y += 4) p.hline(15, 33, y, mul(CH, 0.85));
    p.outline(OUTLINE);
  });

  /**
   * The entity: a dark, soft, too-thin figure. So it still reads against black (the array void,
   * a blacked-out hall, the lot at night) it carries a faint pale RIM — a dithered halo just
   * outside the silhouette plus a lighter band just inside it — and a pale smear where the face
   * should be. Rim and face are emissive (they glow faintly with no light at all, attenuated by
   * fog); the body itself stays near black and takes world light / the flashlight normally.
   */
  T('spr_entity', { kind: 'sprite', w: 64, h: 128, frames: 4, scale: 1, noAge: true }, (p, r, f) => {
    const K = H(0x141419);
    const limb = (x0, y0, x1, y1, w0, w1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        p.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (w0 + (w1 - w0) * t) / 2, K);
      }
    };
    const fingers = (x, y, ang, len, spread = 0.18) => {
      for (let k = -2; k <= 2; k++) {
        const a = ang + k * spread;
        limb(x, y, x + Math.cos(a) * len * (1 - Math.abs(k) * 0.12), y + Math.sin(a) * len * (1 - Math.abs(k) * 0.12), 1.3, 0.8);
      }
    };
    // legs (too long, very thin)
    limb(28, 66, 27, 123, 4.5, 2.2);
    limb(36, 66, 38, 124, 4.5, 2.2);
    p.rect(24, 123, 5, 2, K);
    p.rect(37, 124, 5, 2, K);
    // torso
    p.poly([[23, 27], [41, 26], [37, 62], [38, 68], [26, 68], [27, 62]], K);
    // shoulders / neck
    const turned = f === 3;
    limb(32, 16, 32, 27, 3, 3.6);
    limb(23, 28, 41, turned ? 24 : 27, 4, 4);
    // arms per frame
    if (f === 0 || f === 3) {
      limb(23, 29, 20, 58, 3.4, 2.6);
      limb(20, 58, 19, 86, 2.6, 2);
      fingers(19, 86, Math.PI / 2 + 0.1, 9, 0.12);
      limb(41, turned ? 25 : 29, 44, 57, 3.4, 2.6);
      limb(44, 57, 45, 80, 2.6, 2);
      fingers(45, 80, Math.PI / 2 - 0.05, 8, 0.12);
    } else if (f === 1) {
      limb(23, 29, 21, 58, 3.4, 2.6);
      limb(21, 58, 20, 84, 2.6, 2);
      fingers(20, 84, Math.PI / 2, 9, 0.12);
      limb(41, 28, 51, 30, 3.4, 2.8);
      limb(51, 30, 44, 11, 2.8, 2.2);
      fingers(44, 11, -Math.PI / 2 - 0.35, 10, 0.2);
    } else if (f === 2) {
      limb(23, 29, 21, 58, 3.4, 2.6);
      limb(21, 58, 20, 84, 2.6, 2);
      fingers(20, 84, Math.PI / 2, 9, 0.12);
      limb(41, 29, 39, 38, 4.4, 5.5);
      const K2 = H(0x2a2a30);
      p.ellipse(35, 42, 7, 6, K2);
      for (let k = -2; k <= 2; k++) {
        const a = -Math.PI / 2 + k * 0.42;
        p.thick(35, 42, 35 + Math.cos(a) * 13, 42 + Math.sin(a) * 13 + Math.abs(k), 1, K2);
      }
      p.thick(35, 44, 27, 49, 1.1, K2);
    }
    // head + face smear
    const hx = turned ? 39 : 32, hy = turned ? 16 : 11;
    if (turned) p.ellipse(hx, hy, 6.5, 4.2, K);
    else p.ellipse(hx, hy, 4.2, 6.5, K);
    const face = (fx, fy, rx, ry, a) => {
      for (let y = Math.floor(fy - ry - 1); y <= fy + ry + 12; y++)
        for (let x = Math.floor(fx - rx - 1); x <= fx + rx + 1; x++) {
          const dx = (x + 0.5 - fx) / rx, dy = (y + 0.5 - fy) / ry;
          let v = 1 - Math.sqrt(dx * dx + Math.max(0, dy) * Math.max(0, dy) * (dy > 0 ? 0.12 : 1) + Math.min(0, dy) ** 2);
          if (v <= 0) continue;
          if (dy > 1) v *= Math.max(0, 1 - (dy - 1) * 0.35);
          p.blend(x, y, H(0x9c978c), Math.min(1, v * a * 1.6));
        }
    };
    if (turned) face(hx + 1, hy + 1, 3.2, 2.2, 0.55);
    else face(hx, hy + 1, 2.8, 3.6, 0.6);
    const eyes = turned ? [[hx + 2, hy - 1], [hx + 2, hy + 2]] : [[hx - 1.2, hy], [hx + 1.4, hy]];
    for (const [ex, ey] of eyes) p.ellipse(ex, ey, 0.9, 1.1, H(0x141416));
    if (turned) p.set(hx - 1, hy + 1, H(0x1a1a1c));
    else { p.set(hx, hy + 4, H(0x1c1c1e)); p.set(hx, hy + 5, H(0x242426)); }
    // body texture
    for (let i = 0; i < p.px.length; i++) if (cA(p.px[i]) && lum(p.px[i]) < 30) p.px[i] = mul(p.px[i], 0.8 + h2(i, f, 5) * 0.5);
    // the face smear glows faintly (it is the part of it you notice first)
    for (let i = 0; i < p.px.length; i++) {
      const c = p.px[i];
      if (cA(c) && lum(c) > 60) p.emitPx(i % 64, (i / 64) | 0, Math.min(170, 40 + lum(c) * 0.9));
    }
    p.softAlpha(1);
    entityRim(p, f);
    // row tearing (it does not hold still) — pixels and their glow together
    for (let k = 0; k < 5; k++) {
      const y = 20 + Math.floor(h2(k, f, 9) * 90), sh = h2(k, f, 10) < 0.5 ? -2 : 2;
      const row = p.px.slice(y * 64, y * 64 + 64);
      const erow = p.em ? p.em.slice(y * 64, y * 64 + 64) : null;
      for (let x = 0; x < 64; x++) {
        p.px[y * 64 + x] = row[(x - sh + 64) % 64];
        if (erow) p.em[y * 64 + x] = erow[(x - sh + 64) % 64];
      }
    }
  });
  /**
   * Pale rim around a sprite silhouette: `band` px inside the edge get lighter, a halo up to
   * `halo` px outside gets pale, partially transparent (so the renderer dithers it) pixels.
   * Both are emissive, strongest at the edge (em 255 = shown at the rim colour itself, so the
   * glow reads the same drawn emissive or fullbright). Uses a small chamfer distance field.
   */
  function entityRim(p, f, opts) {
    const o = Object.assign({ band: 2, halo: 3, col: H(0x6e727e), inK: [0.46, 0.2], inEm: [230, 160], outA: [160, 106, 52], outEm: [255, 225, 165] }, opts || {});
    const w = p.w, h = p.h, n = w * h, BIG = 99;
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = cA(p.px[i]) > 110 ? 1 : 0;
    // distance (in px, 8-neighbour) to the other side of the silhouette edge
    const dist = (inside) => {
      const d = new Uint8Array(n).fill(BIG);
      const q = [];
      for (let i = 0; i < n; i++) {
        if (!!solid[i] !== inside) continue;
        const x = i % w, y = (i / w) | 0;
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) { if (inside) edge = true; continue; }
          if (!!solid[yy * w + xx] !== inside) { edge = true; break; }
        }
        if (edge) { d[i] = 1; q.push(i); }
      }
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % w, y = (i / w) | 0, dv = d[i];
        if (dv >= 4) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!!solid[j] !== inside || d[j] <= dv + 1) continue;
          d[j] = dv + 1;
          q.push(j);
        }
      }
      return d;
    };
    const dIn = dist(true), dOut = dist(false);
    // light comes from behind it, a little from above: the top edge catches more
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      const flick = 0.85 + h2(x, y + f * 131, 77) * 0.3;
      if (solid[i]) {
        const k = dIn[i] - 1;
        if (k < o.band) {
          p.px[i] = withA(mix(p.px[i], o.col, o.inK[k] * flick), cA(p.px[i]));
          p.emitPx(x, y, Math.min(255, Math.round(o.inEm[k] * flick))); // (em is a Uint8Array: >255 would wrap)
        }
      } else {
        const k = dOut[i] - 1;
        if (k < o.halo) {
          const a = Math.round(o.outA[k] * flick);
          if (a > cA(p.px[i])) p.px[i] = withA(mul(o.col, 0.92 - k * 0.12), a);
          p.emitPx(x, y, Math.min(255, Math.round(o.outEm[k] * flick)));
        }
      }
    }
  }

  /**
   * The face that surfaces on it. frame 0: several faces overlapping, smeared (the window figure
   * uses this one). 1–3: README "its face might resemble people you've heard on the radio.
   * Sometimes your own." — 1 her (long dark hair: the woman / the girl on the radio), 2 Hollis
   * (cap-brim shadow, stubble), 3 you (the staff photo's fourth figure: tan collar, no eyes).
   */
  function paleFace(p, fx, fy, rx, ry, a, tilt, hollow) {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const ux = x + 0.5 - fx, uy = y + 0.5 - fy;
        const qx = ux * Math.cos(tilt) + uy * Math.sin(tilt), qy = -ux * Math.sin(tilt) + uy * Math.cos(tilt);
        const dx = qx / rx, dy = qy / ry;
        let v = 1 - Math.sqrt(dx * dx + dy * dy);
        if (dy > 0.7) v = Math.max(v, (1 - Math.abs(dx) * 1.3) * Math.max(0, 1 - (dy - 0.7) * 1.2) * 0.6); // smeared downward
        if (v <= 0) continue;
        let c = mix(H(0x8a857a), H(0xd0ccc0), Math.min(1, v * 1.6));
        const eye = Math.hypot(dx + 0.36, (dy + 0.12) * 1.4) < (hollow ? 0.24 : 0.2) || Math.hypot(dx - 0.36, (dy + 0.12) * 1.4) < (hollow ? 0.24 : 0.2);
        const mouth = Math.hypot(dx * 1.6, (dy - 0.45) * 2.4) < 0.3;
        const nose = Math.abs(dx) < 0.08 && dy > 0 && dy < 0.25;
        if (eye) c = mix(c, H(0x141414), hollow ? 0.97 : 0.85);
        else if (mouth) c = mix(c, H(0x1e1614), 0.8);
        else if (nose) c = mul(c, 0.78);
        p.blend(x, y, c, Math.min(1, v * 2.2) * a);
      }
  }
  T('spr_entity_face', { kind: 'sprite', w: 64, h: 64, frames: 4, scale: 0.45, noAge: true }, (p, r, f) => {
    if (f === 0) {
      const faces = [[32, 30, 17, 23, 0.6, 0], [25, 34, 13, 18, 0.35, -0.2], [39, 27, 12, 17, 0.35, 0.25], [33, 38, 10, 14, 0.25, 0.1]];
      for (const [fx, fy, rx, ry, a, tilt] of faces) paleFace(p, fx, fy, rx, ry, a, tilt);
      // fingertips pressed to the glass
      for (const [x, y] of [[8, 50], [11, 47], [14, 46], [17, 47], [52, 49], [49, 46], [46, 45], [55, 47]]) p.blend(x, y, H(0xc8c2b4), 0.5), p.blend(x, y + 1, H(0xc8c2b4), 0.4);
    } else if (f === 1) {
      // her: long dark hair hanging past the jaw, a narrower face
      for (let y = 6; y < 64; y++)
        for (let x = 10; x < 54; x++) {
          const dx = (x + 0.5 - 32) / 19, dy = (y + 0.5 - 26) / 22;
          const inHair = dx * dx + Math.min(0, dy) * Math.min(0, dy) < 1 && y < 58 - Math.abs(x - 32) * 0.25;
          if (inHair) p.blend(x, y, mul(H(0x2a221e), 0.9 + h2(x, y, 41) * 0.25), 0.55 * (1 - Math.max(0, y - 44) / 16));
        }
      paleFace(p, 32, 30, 13, 19, 0.75, 0.04);
      paleFace(p, 35, 33, 11, 16, 0.25, 0.2);
    } else if (f === 2) {
      // Hollis: a cap's brim throws the eyes into shadow; grey stubble
      paleFace(p, 32, 32, 15, 20, 0.72, -0.03);
      for (let y = 9; y < 20; y++) for (let x = 14; x < 52; x++) { const dx = (x - 32) / 19; if (y < 20 - dx * dx * 5) p.blend(x, y, H(0x28303e), 0.8); }
      p.blendRect(12, 19, 40, 3, H(0x1a1e26), 0.85);
      for (let y = 20; y < 27; y++) for (let x = 20; x < 45; x++) p.mul(x, y, 0.72);
      for (let k = 0; k < 60; k++) { const x = 21 + ((h2(k, 3, 9) * 22) | 0), y = 38 + ((h2(k, 5, 9) * 12) | 0); p.mul(x, y, 0.8); }
      paleFace(p, 29, 36, 10, 14, 0.2, -0.25);
    } else {
      // you: the jacket from the staff photo (dark green, tan collar), no eyes to speak of
      for (let y = 46; y < 64; y++) for (let x = 12; x < 52; x++) {
        const dx = Math.abs(x + 0.5 - 32);
        if (dx > 8 + (y - 46) * 0.9) continue;
        const collar = dx > (y - 46) * 0.55 && dx < (y - 46) * 0.55 + 4;
        p.blend(x, y, collar ? H(0x9c7a4c) : H(0x2c3a35), collar ? 0.75 : 0.6);
      }
      paleFace(p, 32, 28, 14, 19, 0.72, 0, true);
      paleFace(p, 30, 31, 12, 17, 0.3, -0.15, true);
    }
    p.softAlpha(1, false);
    // only the pale skin glows (entity.js draws it with a sprite `emissive`): in the dark the face
    // surfaces out of black — hair, cap brim, collar and the hollow eyes stay unlit
    for (let i = 0; i < p.px.length; i++) {
      const c = p.px[i];
      if (cA(c) < 24) continue;
      const sat = Math.max(cR(c), cG(c), cB(c)) - Math.min(cR(c), cG(c), cB(c));
      const e = Math.round((lum(c) - 50) * 1.25 * (sat < 40 ? 1 : 0.3));
      if (e > 0) p.emitPx(i & 63, i >> 6, Math.min(190, e));
    }
  });

  T('spr_mug', { kind: 'sprite', w: 16, h: 16, scale: 0.06 }, (p) => {
    part(p, [[4, 5], [11, 5], [11, 15], [4, 15]], H(0xe6e2d6), 0.4);
    p.ellipse(7.5, 5.5, 3.5, 1.2, H(0x3a200e));
    p.hline(4, 11, 4, H(0xf4f0e6));
    p.ring(12.5, 9.5, 2.6, H(0xd6d2c6), 1.3);
    p.rect(6, 9, 3, 3, H(0x2a4a8a));
    p.outline(OUTLINE);
  });

  T('spr_chair', { kind: 'sprite', w: 32, h: 48, frames: 2, scale: 0.42 }, (p, r, f) => {
    const CH = H(0x2a2c30);
    for (const [x, y] of [[4, 45], [27, 45], [11, 46], [21, 46]]) p.ellipse(x, y, 1.8, 1.4, H(0x0c0c0c));
    p.line(5, 44, 16, 40, H(0x1a1a1a)); p.line(27, 44, 16, 40, H(0x1a1a1a)); p.line(11, 45, 16, 40, H(0x1a1a1a)); p.line(21, 45, 16, 40, H(0x1a1a1a));
    p.rect(15, 30, 3, 11, H(0x8a8e92));
    if (f === 0) {
      part(p, [[9, 5], [23, 5], [24, 24], [8, 24]], CH, 0.3);
      p.ellipse(16, 5.5, 7, 2, mul(CH, 1.2));
      for (let y = 9; y < 23; y += 4) p.hline(10, 22, y, mul(CH, 0.8));
      part(p, [[6, 24], [26, 24], [25, 30], [7, 30]], mul(CH, 1.1), 0.3);
      p.hline(6, 25, 24, mul(CH, 1.5));
      p.rect(4, 19, 3, 9, H(0x141414)); p.rect(25, 19, 3, 9, H(0x141414));
      p.hline(3, 7, 19, H(0x3a3a3a)); p.hline(25, 29, 19, H(0x3a3a3a));
    } else {
      part(p, [[19, 4], [24, 5], [23, 25], [18, 24]], CH, 0.3);
      part(p, [[6, 24], [24, 23], [24, 29], [7, 30]], mul(CH, 1.1), 0.2);
      p.hline(6, 23, 24, mul(CH, 1.5));
      p.rect(9, 19, 11, 2, H(0x141414));
      p.vline(11, 21, 25, H(0x141414));
      p.line(22, 25, 17, 30, H(0x3a3a3a));
    }
    p.outline(OUTLINE);
  });

  T('spr_table', { kind: 'sprite', w: 64, h: 40, scale: 0.37 }, (p) => {
    for (const x of [5, 56]) { p.rect(x, 12, 3, 28, H(0x9a9ea0)); p.vline(x, 12, 39, H(0xd0d4d6)); }
    for (const x of [14, 47]) { p.rect(x, 10, 2, 26, H(0x6a6e70)); }
    p.poly([[6, 5], [58, 5], [62, 11], [2, 11]], (x, y) => mul(H(0xd4ccb4), 0.92 + (y - 5) * 0.02));
    p.rect(2, 11, 61, 3, H(0xa8aaa6));
    p.hline(2, 62, 11, H(0xdadedc));
    p.rect(40, 7, 8, 2, H(0xe8e4d8));
    p.rect(14, 7, 5, 2, H(0x6a6a66));
    p.outline(OUTLINE);
  });

  T('spr_jar', { kind: 'sprite', w: 16, h: 24, scale: 0.08 }, (p) => {
    p.rect(4, 6, 8, 2, H(0x8a8a86));
    p.hline(4, 11, 6, H(0xc0c0bc));
    for (let y = 8; y < 23; y++)
      for (let x = 3; x < 13; x++) {
        let c = y > 13 ? mix(H(0x5a3a1e), H(0x3a2412), h2(x, y, 2)) : H(0x8a9aa0);
        if (x === 4) c = mix(c, H(0xe0f0f4), 0.6);
        p.set(x, y, withA(c, y > 13 ? 255 : 150));
      }
    p.hline(3, 12, 22, H(0x6a7a80));
    p.outline(withA(H(0x1a1e20), 200));
  });

  T('spr_boxes', { kind: 'sprite', w: 48, h: 48, scale: 0.42 }, (p, r) => {
    const box = (x, y, w, h, c) => {
      part(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c, 0.25);
      p.rect(x, y, w, 2, mul(c, 1.25));
      p.vline(x + Math.floor(w / 2), y, y + h, mul(H(0xc8b890), 0.9));
      p.noise(x, y, w, h, 0.05, r);
    };
    box(3, 26, 40, 21, H(0x8e6e44));
    box(6, 11, 22, 15, H(0x9a7a4e));
    box(27, 15, 17, 11, H(0x84683e));
    p.rect(9, 30, 12, 6, H(0xe8e4d8));
    p.text('REC', 10, 30, H(0x2a2a2a));
    p.text('FRAGILE', 8, 18, H(0x8a1a10));
    p.outline(OUTLINE);
  });

  T('spr_bucket', { kind: 'sprite', w: 24, h: 24, scale: 0.16 }, (p) => {
    p.poly([[4, 8], [20, 8], [18, 23], [6, 23]], (x) => mul(H(0x9aa0a4), 1.15 - 0.4 * ((x - 4) / 16)));
    p.ellipse(12, 8, 8, 1.8, H(0x2a2c2e));
    p.hline(4, 20, 7, H(0xc8ccd0));
    for (const y of [13, 19]) p.hline(5, 19, y, H(0x6a6e72));
    p.ring(12, 8, 7.5, H(0x5a5e62), 1);
    p.outline(OUTLINE);
  });

  /** 3/4 view sedan / wagon / rusted wreck (128×64). */
  function car(p, r, o) {
    const BODY = o.body;
    const g = 60 - (o.sag || 0);
    // shadow
    p.ellipse(64, 61, 60, 3, withA(H(0x000000), 150));
    // lower body (side)
    part(p, [[16, 42], [118, 40], [123, 50], [118, g - 2], [22, g], [12, g - 3]], BODY, 0.3);
    // front fascia (3/4)
    part(p, [[3, 45], [16, 42], [22, g], [7, g - 3]], mul(BODY, 0.8), 0.2);
    // hood + windshield base
    p.poly([[16, 42], [5, 44], [24, 37], [40, 36]], mul(BODY, 1.25));
    // greenhouse
    const roofBack = o.wagon ? 116 : 96;
    p.poly([[36, 41], [50, 26], [roofBack - 6, 25], [roofBack + 4, 40]], H(0x0c1014));
    p.poly([[36, 41], [26, 38], [44, 27], [50, 26]], H(0x121820));
    p.rect(50, 23, roofBack - 56, 3, mul(BODY, 1.2));
    p.hline(50, roofBack - 7, 23, mul(BODY, 1.5));
    // pillars
    p.line(70, 26, 72, 41, BODY);
    p.line(71, 26, 73, 41, mul(BODY, 0.8));
    if (o.wagon) { p.line(96, 25, 100, 40, BODY); p.line(97, 25, 101, 40, mul(BODY, 0.8)); }
    // glass reflections / broken glass
    for (let k = 0; k < 3; k++) p.line(52 + k * 16, 38, 60 + k * 16, 28, o.broken ? H(0x8a9098) : H(0x3a4a5a));
    if (o.broken) for (let k = 0; k < 30; k++) p.set(40 + r() * 60, 27 + r() * 13, H(0x6a7078));
    // wood panel (wagon)
    if (o.wagon) for (let y = 45; y < 52; y++) for (let x = 24; x < 116; x++) p.set(x, y, mul(H(0x6a4424), 0.85 + vnoise(x * 0.3, y * 0.9, 64, 64, 4) * 0.3));
    // chrome strip, door seams, handles, mirror
    p.hline(18, 119, 44, o.rust ? H(0x5a4030) : H(0x9aa0a6));
    p.line(46, 41, 44, g - 1, mul(BODY, 0.6));
    p.line(74, 41, 74, g - 1, mul(BODY, 0.6));
    p.rect(50, 46, 4, 1, H(0xb0b4b8));
    p.rect(78, 46, 4, 1, H(0xb0b4b8));
    p.rect(30, 34, 4, 3, mul(BODY, 0.8));
    // grille + headlights + bumper
    p.rect(6, 47, 10, 5, H(0x16181a));
    for (let x = 7; x < 16; x += 2) p.vline(x, 47, 51, H(0x3a3c3e));
    p.rect(4, 46, 3, 3, o.lights ? H(0xfff0c0) : H(0xb8b8a8));
    p.rect(15, 45, 4, 3, o.lights ? H(0xfff0c0) : H(0xb8b8a8));
    if (o.lights) {
      p.emit(4, 46, 3, 3, 255); p.emit(15, 45, 4, 3, 255);
      // headlights on: a soft halo round each lamp (emissive, so it reads across a dark lot)
      for (const [hx, hy] of [[5.5, 47.5], [17, 46.5]])
        for (let y = Math.floor(hy - 6); y <= hy + 6; y++)
          for (let x = Math.floor(hx - 7); x <= hx + 7; x++) {
            const d = Math.hypot((x + 0.5 - hx) / 1.25, y + 0.5 - hy);
            if (d > 6 || d < 1.6) continue;
            const a = Math.pow(1 - d / 6, 1.6);
            p.blend(x, y, H(0xfff0c8), a * 0.8);
            p.emitPx(x, y, Math.max(0, Math.round(a * 220)));
          }
    }
    p.rect(3, 53, 16, 3, H(0x8a8e92));
    p.hline(3, 18, 53, H(0xc8ccd0));
    p.rect(119, 42, 4, 5, H(0x8a1a12));
    // wheels
    const wheel = (x, y, rx, ry) => {
      p.ellipse(x, y - 1, rx + 1.5, ry + 1.5, H(0x0a0a0a));
      p.ellipse(x, y, rx, ry, H(0x151515));
      if (!o.rust) { p.ellipse(x, y, rx * 0.55, ry * 0.55, H(0x8a8e92)); p.ellipse(x - 0.5, y - 0.5, rx * 0.25, ry * 0.25, H(0xc8ccd0)); }
      else p.ellipse(x, y, rx * 0.4, ry * 0.4, H(0x4a2a1a));
    };
    wheel(30, g - 3, 7, o.sag ? 5 : 7);
    wheel(102, g - 4, 6, o.sag ? 4.5 : 6);
    // wet sheen on hood and roof
    for (let k = 0; k < 14; k++) p.blend(20 + r() * 20, 38 + r() * 3, H(0x8aa0c0), 0.25);
    for (let k = 0; k < 12; k++) p.blend(52 + r() * 40, 23 + r() * 2, H(0x8aa0c0), 0.3);
    if (o.rust) {
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 128; x++) {
          const c = p.get(x, y);
          if (!cA(c)) continue;
          const n = vnoise(x * 0.12, y * 0.2, 64, 64, 77) * 0.6 + vnoise(x * 0.4, y * 0.5, 64, 64, 78) * 0.4;
          if (n > 0.58) p.set(x, y, mix(c, n > 0.66 ? H(0x4a2410) : H(0x6a3a1c), 0.6));
        }
    }
    p.outline(OUTLINE);
  }
  T('spr_car', { kind: 'sprite', w: 128, h: 64, scale: 0.7 }, (p, r) => car(p, r, { body: H(0x1e2c4a) }));
  T('spr_car2', { kind: 'sprite', w: 128, h: 64, scale: 0.72 }, (p, r) => car(p, r, { body: H(0x4a3222), wagon: true }));
  T('spr_car_rusted', { kind: 'sprite', w: 128, h: 64, scale: 0.68 }, (p, r) => car(p, r, { body: H(0x2a3240), rust: true, broken: true, sag: 3 }));
  // headlights on (arriving / leaving in the dark or at dawn): same cars, lamps lit + a soft halo
  T('spr_car_lit', { kind: 'sprite', w: 128, h: 64, scale: 0.7 }, (p, r) => car(p, r, { body: H(0x1e2c4a), lights: true }));
  T('spr_car2_lit', { kind: 'sprite', w: 128, h: 64, scale: 0.72 }, (p, r) => car(p, r, { body: H(0x4a3222), wagon: true, lights: true }));

  T('spr_tree', { kind: 'sprite', w: 64, h: 128, frames: 3, scale: 4.5 }, (p, r, f, fr) => {
    const rr = rng(hashStr('tree' + f));
    const cx = 32 + (rr() - 0.5) * 4;
    p.rect(Math.round(cx) - 2, 96, 4, 32, H(0x1e1610));
    p.vline(Math.round(cx) - 2, 96, 127, H(0x2e2218));
    const tiers = 11 + Math.floor(rr() * 4);
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1);
      const y = 4 + t * 96 + (rr() - 0.5) * 3;
      const w = 3 + t * (24 + rr() * 6);
      const droop = 5 + t * 8;
      for (let x = -w; x <= w; x++) {
        const edge = Math.abs(x) / w;
        const yy = y + edge * edge * droop;
        const th = 4 + (1 - edge) * (6 + t * 5) + rr() * 3;
        for (let j = 0; j < th; j++) {
          const n = h2(Math.round(cx + x), Math.round(yy - j), f + 3);
          if (edge > 0.85 && n < 0.4) continue;
          const c = mix(H(0x0a140e), H(0x1e2e1e), (1 - j / th) * 0.5 + n * 0.35 + (x < 0 ? 0.12 : 0));
          p.set(cx + x, yy - th + j + 4, c);
        }
      }
    }
    p.set(Math.round(cx), 2, H(0x16241a));
    p.set(Math.round(cx), 3, H(0x16241a));
  });

  T('spr_tree_dead', { kind: 'sprite', w: 64, h: 128, scale: 3.5 }, (p, r) => {
    const B = H(0x2a241e);
    const branch = (x, y, a, len, w, d) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      p.thick(x, y, x1, y1, w / 2, (xx) => mul(B, xx < x ? 1.2 : 0.85));
      if (d > 0) {
        const n = 2 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) branch(x1, y1, a + (r() - 0.5) * 1.3, len * (0.55 + r() * 0.2), Math.max(1, w * 0.6), d - 1);
      }
    };
    branch(32, 127, -Math.PI / 2, 44, 5, 0);
    branch(32, 86, -Math.PI / 2 + 0.1, 30, 3.5, 3);
    branch(32, 100, -Math.PI / 2 - 0.9, 22, 2.5, 2);
    branch(32, 92, -Math.PI / 2 + 0.8, 20, 2.5, 2);
  });

  T('spr_tower', { kind: 'sprite', w: 64, h: 128, scale: 10 }, (p) => {
    const M = H(0x4a4e54);
    const half = (y) => 3 + ((y - 12) / 115) * 22;
    for (let y = 12; y < 128; y++) { p.set(32 - half(y), y, M); p.set(32 + half(y), y, mul(M, 0.8)); }
    for (let y = 12; y < 124; y += 10) {
      const y2 = Math.min(127, y + 10);
      p.line(32 - half(y), y, 32 + half(y), y, M);
      p.line(32 - half(y), y, 32 + half(y2), y2, mul(M, 0.75));
      p.line(32 + half(y), y, 32 - half(y2), y2, mul(M, 0.75));
    }
    p.vline(32, 0, 12, M);
    p.vline(33, 2, 12, mul(M, 0.7));
    p.rect(26, 20, 4, 8, mul(M, 1.1));
    p.ellipse(38, 30, 3, 4, H(0x5a5e64));
    p.rect(31, 0, 3, 2, H(0xff2a1a));
    p.emit(31, 0, 3, 2, 255);
  });

  T('spr_mast', { kind: 'sprite', w: 32, h: 128, scale: 2.4 }, (p) => {
    const M = H(0x8a8e92);
    p.rect(15, 20, 2, 108, M);
    p.vline(15, 20, 127, H(0xc0c4c8));
    p.vline(16, 20, 127, H(0x5a5e62));
    p.rect(15, 8, 2, 12, M);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094 + 0.5, x = 16 + Math.cos(a) * 7, y = 9 + Math.sin(a) * 1.5;
      p.line(16, 9, x, y, M);
      p.ellipse(x, y, 2, 1.5, H(0xd0d4d8));
    }
    p.line(16, 20, 27, 20, M);
    p.poly([[25, 17], [30, 20], [25, 23]], H(0xb0b4b8));
    p.line(16, 20, 8, 20, M);
    p.rect(5, 18, 4, 4, H(0xc03a2a));
    for (let y = 42; y < 56; y += 2) { p.hline(11, 20, y, H(0xe8e8e0)); p.hline(12, 19, y + 1, H(0x9a9a92)); }
    p.rect(9, 66, 6, 8, H(0x6a6e6a));
    p.bevel(9, 66, 6, 8);
    p.outline(OUTLINE);
  });

  T('spr_lamp_post', { kind: 'sprite', w: 32, h: 128, scale: 2.2 }, (p) => {
    const M = H(0x3e4246);
    p.rect(13, 22, 3, 106, M);
    p.vline(13, 22, 127, H(0x6a6e72));
    p.rect(11, 116, 7, 12, mul(M, 0.9));
    p.vline(11, 116, 127, H(0x6a6e72));
    for (let k = 0; k <= 10; k++) { const t = k / 10; p.rect(Math.round(14 + t * 9), Math.round(22 - Math.sin(t * 1.6) * 7), 2, 2, M); }
    p.poly([[18, 13], [30, 14], [29, 19], [19, 18]], H(0x4a4e52));
    p.hline(18, 29, 13, H(0x7a7e82));
    for (let x = 20; x < 29; x++) { p.set(x, 19, H(0xffc860)); p.set(x, 20, H(0xffa030)); }
    p.emit(20, 19, 9, 2, 255);
    p.outline(OUTLINE);
  });

  T('spr_sign', { kind: 'sprite', w: 64, h: 48, scale: 0.72 }, (p, r) => {
    for (const x of [11, 51]) { p.rect(x, 36, 3, 12, H(0x6a6e6a)); p.vline(x, 36, 47, H(0x9a9e9a)); }
    panel(p, 2, 4, 60, 34, H(0x1e3a2c), r, 0.02);
    p.rect(4, 6, 56, 18, H(0xdcdcd0));
    p.textC('RELAY STATION', 32, 7, H(0x1e3a2c));
    p.textC('14', 32, 13, H(0x1e3a2c), 2);
    p.rect(4, 25, 56, 11, H(0xa82a1e));
    p.textC('AUTHORIZED', 32, 25, H(0xf0ece0));
    p.textC('PERSONNEL ONLY', 32, 31, H(0xf0ece0));
    for (let k = 0; k < 8; k++) p.blend(4 + r() * 56, 6 + r() * 30, H(0x6a4a2a), 0.3);
    p.outline(OUTLINE);
  });

  T('spr_cable_coil', { kind: 'sprite', w: 32, h: 24, scale: 0.16 }, (p) => {
    for (let k = 0; k < 5; k++) p.ring(16, 15 - k * 1.6, 12 - k * 0.4, (x, y) => mul(H(0x1c1c1e), 1 + (y < 12 ? 0.8 : 0)), 2.2);
    p.ellipse(16, 16, 12, 5, H(0x141416));
    for (let k = 0; k < 4; k++) p.ring(16, 16 - k * 1.5, 11 - k * 0.3, H(0x2e2e30), 1);
    p.ellipse(16, 14, 6, 2.2, H(0x050505));
    p.outline(OUTLINE);
  });

  /**
   * The thing at the centre of the array: hung from the dark on cables, an inverted dish (opening
   * DOWN) and below it a mast whose elements shorten toward a glowing tip — an arrowhead aimed
   * into the pit. Pale chevrons along the mast point the same way. Placement: the catwalk level
   * falls at texture row 128·(1 + z/scale) (sprites are bottom-anchored): with maps.js's scale 7,
   * z −2.6 that is row ~80 — the cables, the dish and most of the shortening elements with their
   * chevrons show above the ring, and the glowing tip hangs just below it in the shaft (seen when
   * you look down over the edge). The cables fade out upward.
   */
  T('spr_downward_antenna', { kind: 'sprite', w: 64, h: 128, scale: 8 }, (p) => {
    const M = H(0x3a3e44), HI = H(0x6a6e76), DK = H(0x1e2024), CAB = H(0x2a2c30), PALE = H(0xb8d0ff);
    // cables up into the dark (fading out toward the top)
    for (const x0 of [3, 16, 32, 48, 61]) {
      const n = 40;
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x0 + (32 - x0) * t, y = t * 8;
        p.blend(Math.round(x), Math.round(y), CAB, Math.min(1, 0.2 + y / 5));
      }
    }
    // hub
    p.rect(29, 7, 7, 4, M);
    p.vline(29, 7, 10, HI);
    // the dish, opening downward: shell (top) + the concave underside you see from the catwalk
    const yTop = (x) => 10 + 12 * Math.pow((x - 32) / 30, 2);
    for (let x = 2; x <= 62; x++) {
      const yt = yTop(x);
      for (let y = Math.floor(yt); y <= yt + 2.6; y++) p.set(x, y, mul(M, 1.1 - 0.3 * ((x - 2) / 60)));
      p.set(x, Math.floor(yt), mul(HI, 1.1 - 0.35 * ((x - 2) / 60)));
      p.emitPx(x, Math.floor(yt), 70); // the edges catch a glow from below: it reads in the dark
    }
    for (let y = 14; y <= 27; y++)
      for (let x = 2; x <= 62; x++) {
        const dx = (x + 0.5 - 32) / 30, dy = (y + 0.5 - 22) / 3.8;
        if (dx * dx + dy * dy > 1 || y < yTop(x) + 2) continue;
        const inner = dx * dx + dy * dy;
        p.set(x, y, mix(H(0x14161a), H(0x2e3238), inner));
      }
    for (let x = 2; x <= 62; x++) { const dx = (x + 0.5 - 32) / 30; const y = Math.round(22 + 3.8 * Math.sqrt(Math.max(0, 1 - dx * dx))); p.set(x, y, HI); p.set(x, y - 1, M); p.emitPx(x, y, 110); }
    for (const x1 of [6, 14, 23, 41, 50, 58]) p.line(32, 11, x1, Math.round(yTop(x1)) + 1, DK); // ribs
    // the feed glows faintly in the dish
    for (let y = 17; y < 26; y++) for (let x = 27; x < 38; x++) { const d = Math.hypot(x - 32, (y - 22) * 1.6); if (d < 5.5) { p.blend(x, y, PALE, (1 - d / 5.5) * 0.45); p.emitPx(x, y, Math.round((1 - d / 5.5) * 120)); } }
    // mast: thick under the dish, thinner toward the tip
    for (let y = 22; y < 116; y++) {
      const w = y < 60 ? 4 : y < 92 ? 3 : 2, x0 = 32 - (w >> 1);
      p.rect(x0, y, w, 1, M);
      p.set(x0, y, HI);
    }
    // elements: widest just under the dish, shortening toward the tip (an arrowhead aimed down)
    for (let k = 0; k < 15; k++) {
      const y = 29 + k * 5.7, half = Math.round(25 - k * 1.5), yy = Math.round(y);
      p.hline(32 - half, 32 + half, yy, mul(M, 0.95));
      p.hline(32 - half, 32 + half, yy - 1, mul(HI, 0.8));
      for (let x = 32 - half; x <= 32 + half; x++) p.emitPx(x, yy - 1, 64 + k * 6);
      // the ends droop: every element bends down
      p.set(32 - half, yy + 1, M); p.set(32 - half, yy + 2, M);
      p.set(32 + half, yy + 1, M); p.set(32 + half, yy + 2, M);
    }
    // pale chevrons down the lower mast (V's, pointing down)
    for (const cy of [36, 54, 72, 89, 104]) {
      for (let k = -4; k <= 4; k++) {
        const x = 32 + k, y = cy + (4 - Math.abs(k)) * 0.75;
        p.blend(x, Math.round(y), PALE, 0.55);
        p.emitPx(x, Math.round(y), 150);
      }
    }
    // the tip: an arrowhead, lit from inside, light falling on down into the pit
    p.poly([[25, 111], [39, 111], [32, 125]], M);
    p.line(25, 111, 32, 125, HI);
    p.hline(25, 39, 111, HI);
    for (let y = 106; y < 128; y++)
      for (let x = 22; x < 43; x++) {
        const d = Math.hypot(x - 32, (y - 121) * (y > 121 ? 0.55 : 1));
        if (d < 8) { p.blend(x, y, PALE, (1 - d / 8) * 0.85); p.emitPx(x, y, Math.round((1 - d / 8) * 230)); }
      }
  });

  function lever(p, down) {
    panel(p, 9, 14, 14, 18, H(0x5a5e5a), null);
    p.rect(14, 16, 4, 14, H(0x1a1a1a));
    const ang = down ? Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5;
    const x1 = 16 + Math.cos(ang) * 13, y1 = 23 + Math.sin(ang) * 13;
    p.thick(16, 23, x1, y1, 1.2, H(0x9a9e9a));
    p.circle(x1, y1, 2.6, H(0xc02a1a));
    p.set(Math.round(x1) - 1, Math.round(y1) - 1, H(0xff8a7a));
    p.text(down ? 'OFF' : 'ON', down ? 10 : 11, 9, H(0xe0e0d8));
    p.outline(OUTLINE);
  }
  T('spr_lever', { kind: 'sprite', w: 32, h: 40, scale: 0.34 }, (p) => lever(p, false));
  T('spr_lever_down', { kind: 'sprite', w: 32, h: 40, scale: 0.34 }, (p) => lever(p, true));

  T('spr_lectern', { kind: 'sprite', w: 32, h: 48, scale: 0.5 }, (p, r) => {
    const W = H(0x5a3e28);
    p.rect(6, 44, 20, 4, mul(W, 0.8));
    part(p, [[12, 16], [20, 16], [20, 44], [12, 44]], W);
    p.poly([[3, 14], [29, 10], [29, 15], [3, 18]], mul(W, 1.2));
    p.poly([[6, 12], [16, 10], [16, 13], [6, 15]], H(0xece8dc));
    p.poly([[16, 10], [26, 9], [26, 12], [16, 13]], H(0xdcd8cc));
    p.hline(15, 16, 11, H(0x1a1a1a));
    for (let k = 0; k < 3; k++) p.set(8 + k * 3, 13 - k * 0.5, H(0x6a6a70));
    p.poly([[5, 14], [27, 11], [27, 12], [5, 15]], H(0x1e1e22));
    p.outline(OUTLINE);
  });

  T('spr_newspaper', { kind: 'sprite', w: 32, h: 16, scale: 0.1 }, (p) => {
    p.poly([[3, 9], [26, 6], [30, 13], [5, 15]], H(0xd8d2c0));
    p.poly([[4, 9], [26, 6], [27, 8], [5, 11]], H(0x2a2a2a));
    for (let k = 0; k < 3; k++) p.line(6 + k * 7, 12, 11 + k * 7, 11.5, H(0x8a8a86));
    p.outline(withA(H(0x1a1a1a), 200));
  });

  T('spr_tape', { kind: 'sprite', w: 16, h: 12, scale: 0.05 }, (p) => {
    p.rect(1, 2, 14, 9, H(0x1e1e20));
    p.rect(3, 3, 10, 4, H(0xe8e4d8));
    p.hline(4, 11, 4, H(0x6a2a1a));
    p.set(5, 8, H(0x8a8a86)); p.set(10, 8, H(0x8a8a86));
    p.outline(OUTLINE);
  });

  T('spr_debris', { kind: 'sprite', w: 48, h: 24, scale: 0.2 }, (p, r) => {
    for (let k = 0; k < 18; k++) {
      const x = 4 + r() * 40, y = 12 + r() * 10, w = 3 + r() * 8, h = 2 + r() * 3;
      const c = [H(0xb8b4a6), H(0x7a7870), H(0x5a4a3a), H(0xd8d2c0), H(0x3a3a38)][Math.floor(r() * 5)];
      p.poly([[x, y], [x + w, y - r() * 2], [x + w + 1, y + h], [x - 1, y + h]], mul(c, 0.8 + r() * 0.3));
    }
    p.ellipse(24, 22, 22, 2, withA(H(0x000000), 140));
    p.outline(OUTLINE);
  });

  T('spr_light_fixture', { kind: 'sprite', w: 32, h: 64, scale: 0.5, hang: true }, (p) => {
    p.vline(15, 0, 44, H(0x1a1a1a));
    p.rect(13, 42, 5, 3, H(0x2a2a2a));
    p.poly([[11, 45], [20, 45], [26, 54], [5, 54]], (x) => mul(H(0x2e4232), 1.2 - 0.4 * ((x - 5) / 21)));
    p.hline(5, 26, 54, H(0x5a6a5a));
    p.ellipse(15.5, 56, 4, 2.5, H(0xfff4d0));
    p.emit(11, 54, 10, 5, 255);
    p.outline(OUTLINE);
  });

  T('spr_barrel', { kind: 'sprite', w: 32, h: 48, scale: 0.36 }, (p, r) => {
    part(p, [[5, 6], [27, 6], [27, 47], [5, 47]], H(0x2a4a6a), 0.5);
    p.ellipse(16, 6, 11, 2, H(0x3a5a7a));
    p.ellipse(16, 6, 9, 1.4, H(0x1a2a3a));
    for (const y of [18, 34]) { p.hline(5, 26, y, H(0x4a6a8a)); p.hline(5, 26, y + 1, H(0x162636)); }
    for (let y = 6; y < 48; y++) for (let x = 5; x < 27; x++) { const n = vnoise(x * 0.3, y * 0.2, 64, 64, 5); if (n > 0.62) p.set(x, y, mix(p.get(x, y), H(0x6a3a1a), (n - 0.62) * 2.5)); }
    p.rect(10, 22, 12, 9, H(0xd8b020));
    p.textC('!', 16, 24, H(0x1a1a14));
    p.outline(OUTLINE);
  });

  /* @@DEFS@@ */
})();
