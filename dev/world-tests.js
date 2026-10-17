/* DEAD AIR — dev/world-tests.js
 * Test helpers for the world harness (window.WT): deterministic stepping, key simulation,
 * a path-following walker that opens doors with the real E/focus pipeline, and an audit that
 * proves every interactable can be focused from a reachable standing spot.
 */
(function () {
  'use strict';
  const DA = window.DA;
  const DEG = Math.PI / 180;
  const SPAWN = { station: 'pt_arrive', basement: 'pt_b_arrive', array: 'pt_array_arrive', relay: 'pt_relay_arrive', roof: 'pt_roof_arrive' };

  const WT = (window.WT = {});
  WT.step = (n, dt) => { for (let i = 0; i < (n || 1); i++) { DA.step(dt || 1 / 60); DA.input.endFrame(); } };
  WT.key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  WT.tap = (code, holdFrames) => { WT.key(code, true); WT.step(holdFrames || 2); WT.key(code, false); WT.step(2); };
  WT.hold = (code, secs) => { WT.key(code, true); WT.step(Math.round((secs || 0.5) * 60)); WT.key(code, false); WT.step(2); };
  WT.release = () => { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) DA.input.keys[k] = false; };
  WT.face = (x, y) => { const P = DA.world.player; P.angle = Math.atan2(y - P.y, x - P.x); P.pitch = 0; };
  WT.events = [];
  WT.watch = (names) => { for (const n of names) DA.bus.on(n, (d) => WT.events.push([n, d && JSON.parse(JSON.stringify(d))])); };

  /**
   * Walk to (x, y) on the current map with WASD, following DA.world.path. Closed doors on the
   * route are opened by facing them and pressing E (real focus + interact). Reports stalls.
   */
  WT.walkTo = (x, y, opts) => {
    opts = opts || {};
    const W = DA.world, P = W.player;
    const mapId = W.mapId;
    let path = W.path(P.x, P.y, x, y);
    if (!path) return { ok: false, reason: 'no path', from: [P.x, P.y], to: [x, y] };
    let k = 0, t = 0, best = Infinity, bestT = 0, doorTries = 0;
    const run = !!opts.run;
    while (t < (opts.timeout || 90)) {
      if (W.mapId !== mapId) { WT.release(); return { ok: false, reason: 'map changed', t }; }
      const wp = path[k];
      if (!wp) break;
      // door ahead on the route?
      let doorBlock = null;
      for (let j = k; j < Math.min(path.length, k + 2); j++) {
        const c = W.cellAt(path[j].x, path[j].y);
        if (c && c.door) {
          const d = W.door(c.door);
          if (d.open < 0.8 && Math.hypot(path[j].x - P.x, path[j].y - P.y) < 1.45) doorBlock = d;
          break;
        }
      }
      if (doorBlock) {
        WT.release();
        WT.step(10);
        if (doorBlock.target === 0) {
          if (++doorTries > 4) return { ok: false, reason: 'door will not open: ' + doorBlock.id, at: [P.x, P.y] };
          WT.face(doorBlock.x + 0.5, doorBlock.y + 0.5);
          WT.step(2);
          const f = W.focus();
          WT.tap('KeyE');
          if (!f || f.id !== doorBlock.id) WT.lastDoorFocus = f && f.id;
        }
        WT.step(40);
        t += 0.9;
        continue;
      }
      WT.face(wp.x, wp.y);
      DA.input.keys.KeyW = true;
      DA.input.keys.ShiftLeft = run;
      WT.step(1);
      t += 1 / 60;
      const d = Math.hypot(wp.x - P.x, wp.y - P.y);
      if (d < (k === path.length - 1 ? 0.12 : 0.22)) { k++; best = Infinity; bestT = t; continue; }
      if (d < best - 0.03) { best = d; bestT = t; }
      if (t - bestT > 2) {
        // re-plan once from here (a door swung, an NPC was in the way)
        if (opts._replanned) { WT.release(); return { ok: false, reason: 'stuck', at: [+P.x.toFixed(2), +P.y.toFixed(2)], wp, t }; }
        const again = WT.walkTo(x, y, Object.assign({}, opts, { _replanned: true, timeout: (opts.timeout || 90) - t }));
        return again;
      }
    }
    WT.release();
    WT.step(20);
    const d = Math.hypot(x - P.x, y - P.y);
    return { ok: d < 0.35, reason: d < 0.35 ? 'arrived' : 'timeout', t: +t.toFixed(1), at: [+P.x.toFixed(2), +P.y.toFixed(2)], dist: +d.toFixed(2) };
  };
  WT.walkToPoint = (name, opts) => { const p = DA.world.point(name); return WT.walkTo(p.x, p.y, opts); };
  /** Face something and press E; returns the focus id that was used. */
  WT.useAt = (x, y) => { WT.face(x, y); WT.step(2); const f = DA.world.focus(); WT.tap('KeyE'); return f && f.id; };

  /** Standing spots from which an interactable could be used. */
  function candidates(m, it) {
    const out = [];
    const NB = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
    const cellIsDoor = (x, y) => m.door[y * m.w + x] >= 0;
    if (it.side && !cellIsDoor(Math.floor(it.x), Math.floor(it.y))) {
      const cells = [[it.x, it.y, it.side]].concat((it.cells || []).map((c) => [c[0], c[1], c[2] || it.side]));
      for (const [x, y, s] of cells) {
        const [dx, dy] = NB[s];
        const fx = x + 0.5 + dx * 0.5, fy = y + 0.5 + dy * 0.5;
        for (const dist of [0.7, 0.9, 0.5, 1.1, 1.3, 0.4]) {
          for (const lat of [0, -0.25, 0.25, -0.4, 0.4]) {
            out.push({ x: fx + dx * dist - dy * lat, y: fy + dy * dist + dx * lat, deg: Math.atan2(-dy, -dx) / DEG });
          }
        }
      }
    } else if (cellIsDoor(Math.floor(it.x), Math.floor(it.y))) {
      const d = m.doors[m.door[Math.floor(it.y) * m.w + Math.floor(it.x)]];
      const cx = d.x + 0.5, cy = d.y + 0.5;
      for (const sgn of [-1, 1]) for (const dist of [0.9, 1.1, 1.3, 0.75]) for (const lat of [0, -0.2, 0.2]) {
        if (d.axis === 'h') out.push({ x: cx + lat, y: cy + sgn * dist, deg: sgn > 0 ? 270 : 90 });
        else out.push({ x: cx + sgn * dist, y: cy + lat, deg: sgn > 0 ? 180 : 0 });
      }
    } else {
      const r = it.radius == null ? 0.4 : it.radius;
      for (const extra of [0.55, 0.8, 1.05, 0.35]) for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        out.push({ x: it.x + Math.cos(ang) * (r + extra), y: it.y + Math.sin(ang) * (r + extra), deg: ang / DEG + 180 });
      }
    }
    return out;
  }
  /** For every interactable on a map: a reachable standing spot where focus resolves to it. */
  WT.audit = (mapId) => {
    const W = DA.world, m = W.maps[mapId];
    const sp = W.point(SPAWN[mapId]);
    const res = [];
    for (const it of m.interact) {
      let hit = null, reason = 'no spot';
      for (const c of candidates(m, it)) {
        if (!W.canStand(c.x, c.y, mapId)) continue;
        const path = W.path(sp.x, sp.y, c.x, c.y, mapId, { locked: true });
        if (!path) { reason = 'unreachable'; continue; }
        const f = W.focusAt(c.x, c.y, c.deg, mapId);
        if (f && f.id === it.id) { hit = c; break; }
        reason = 'focus→' + (f ? f.id : 'none');
      }
      res.push({ id: it.id, kind: it.kind, ok: !!hit, at: hit && [+hit.x.toFixed(2), +hit.y.toFixed(2), Math.round(hit.deg)], reason: hit ? '' : reason });
    }
    return res;
  };
  /** Same, but through the live pipeline: teleport there, step a frame, read DA.world.focus(). */
  WT.liveFocus = (mapId, id) => {
    const r = WT.audit(mapId).find((q) => q.id === id);
    if (!r || !r.ok) return { id, ok: false, reason: r && r.reason };
    DA.world.teleport(r.at[0], r.at[1], r.at[2], mapId);
    WT.step(3);
    const f = DA.world.focus();
    return { id, ok: !!(f && f.id === id), got: f && f.id, at: r.at };
  };
})();
