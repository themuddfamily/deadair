/* DEAD AIR — dev/world-debug.js
 * Top-down 2D debug view for the world module: walls coloured by texture, rooms tinted, doors,
 * interactables (id + facing), points (arrows), lights, triggers, reserved blocks, props,
 * NPCs, the player and the current focus. Also the harness side panel (map / mutation / power
 * toggles, click-to-teleport). Exposes window.WD.
 */
(function () {
  'use strict';
  const DA = window.DA;
  const DEG = Math.PI / 180;

  // wall colours by base texture name (fallback: hashed hue)
  const WALL_COL = {
    trees: '#1d3a22', fence: '#50565a', concrete_ext: '#6f6d66', wall_paint: '#8c8f7c', wall_panel: '#7a6a4e', wall_tile: '#9fb0b3',
    wall_kitchen: '#a89a70', wall_brick: '#7a4a38', rack_server: '#3b4260', shelf_supplies: '#8a6a3a', shelf_tapes: '#6a5a8a',
    stall: '#8aa0a0', generator: '#5a6a3a', fuel_tank: '#6a5a2a', pipes: '#4a5a5a', antenna_console: '#3a5a6a', cables: '#3a2626',
    wall_rock: '#4a4038', reels: '#5a4a3a', radio_console: '#3a4a3a', parapet: '#6a6a6a', missing: '#ff00ff',
  };
  const FLOOR_COL = {
    ground_gravel: '#3b3b36', ground_mud: '#2a2a1c', ground_asphalt: '#1e1e20', floor_grate: '#2a3036', roof_tar: '#262626',
    hatch: '#555a40',
  };
  const ROOM_COL = {};
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const roomCol = (r) => ROOM_COL[r] || (ROOM_COL[r] = `hsl(${hue(r)}, 38%, 26%)`);
  const faceCol = (name) => {
    if (!name) return null;
    const base = name.split('+');
    if (/window/.test(name)) return '#5ab0e0';
    if (base.length > 1) return '#e0c060'; // decal composite
    return WALL_COL[name] || `hsl(${hue(name)}, 50%, 55%)`;
  };

  const WD = (window.WD = {
    mapId: 'station', cell: 22, labels: true, lightmap: false, decor: true, follow: false, logLines: [],
    canvas: null, ctx: null,
  });

  WD.log = (s) => {
    WD.logLines.push(s);
    if (WD.logLines.length > 80) WD.logLines.shift();
    const el = document.getElementById('wd-log');
    if (el) { el.textContent = WD.logLines.join('\n'); el.scrollTop = 1e6; }
  };

  /** Draw a map top-down into the harness canvas (or a given canvas). */
  WD.draw = (mapId, opts) => {
    opts = opts || {};
    const W = DA.world, m = W.maps[mapId || WD.mapId];
    if (!m) return;
    const C = opts.cell || WD.cell;
    const cv = opts.canvas || WD.canvas;
    const pad = 18;
    cv.width = m.w * C + pad * 2;
    cv.height = m.h * C + pad * 2;
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#050605';
    g.fillRect(0, 0, cv.width, cv.height);
    g.translate(pad, pad);
    const labels = opts.labels != null ? opts.labels : WD.labels;
    const tn = W.texName;
    // ---- cells
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x, px = x * C, py = y * C;
        if (m.wall[i]) {
          g.fillStyle = WALL_COL[tn(m.wall[i])] || faceCol(tn(m.wall[i]));
          g.fillRect(px, py, C, C);
          if (m.reserved[i]) {
            g.strokeStyle = 'rgba(255,60,200,0.7)';
            g.lineWidth = 1;
            g.beginPath();
            for (let k = -C; k < C; k += 5) { g.moveTo(px + k, py + C); g.lineTo(px + k + C, py); }
            g.save(); g.rect(px, py, C, C); g.clip(); g.stroke(); g.restore();
          }
          // face strips: resolved texture of each face that looks onto open space
          const faces = [m.wallN[i], m.wallE[i], m.wallS[i], m.wallW[i]];
          const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          for (let s = 0; s < 4; s++) {
            const nx = x + nb[s][0], ny = y + nb[s][1];
            if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || m.wall[ny * m.w + nx]) continue;
            const nm = tn(faces[s]);
            if (nm === tn(m.wall[i])) continue;
            g.fillStyle = faceCol(nm);
            const t = Math.max(2, C * 0.18);
            if (s === 0) g.fillRect(px, py, C, t);
            else if (s === 1) g.fillRect(px + C - t, py, t, C);
            else if (s === 2) g.fillRect(px, py + C - t, C, t);
            else g.fillRect(px, py, t, C);
          }
          continue;
        }
        if (m.pit[i]) {
          g.fillStyle = '#000';
          g.fillRect(px, py, C, C);
          g.fillStyle = '#141414';
          g.fillRect(px + C / 2 - 1, py + C / 2 - 1, 2, 2);
          continue;
        }
        const room = m.rooms[m.room[i]];
        const fl = tn(m.floor[i]);
        g.fillStyle = m.outdoor[i] ? FLOOR_COL[fl] || '#222' : roomCol(room || '?');
        if (!m.outdoor[i] && FLOOR_COL[fl]) g.fillStyle = FLOOR_COL[fl];
        g.fillRect(px, py, C, C);
        if (m.creak[i]) { g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(px + 2, py + C / 2 - 1, C - 4, 2); }
        if (m.ceil[i] && tn(m.ceil[i]) === 'ceil_light') { g.strokeStyle = 'rgba(255,255,200,0.35)'; g.strokeRect(px + C * 0.3, py + C * 0.2, C * 0.4, C * 0.6); }
      }
    }
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    g.lineWidth = 1;
    for (let x = 0; x <= m.w; x++) { g.beginPath(); g.moveTo(x * C, 0); g.lineTo(x * C, m.h * C); g.stroke(); }
    for (let y = 0; y <= m.h; y++) { g.beginPath(); g.moveTo(0, y * C); g.lineTo(m.w * C, y * C); g.stroke(); }
    g.fillStyle = '#888';
    g.font = `${Math.max(8, C * 0.42)}px monospace`;
    for (let x = 0; x < m.w; x += 5) g.fillText(String(x), x * C + 1, -5);
    for (let y = 0; y < m.h; y += 5) g.fillText(String(y), -pad + 1, y * C + C * 0.7);
    // light map overlay
    if (opts.lightmap != null ? opts.lightmap : WD.lightmap) {
      for (let i = 0; i < m.w * m.h; i++) {
        const v = Math.min(1, m.light[i]);
        g.fillStyle = `rgba(${Math.round(255 * m.tint[0])},${Math.round(240 * m.tint[1])},${Math.round(200 * m.tint[2])},${(v * 0.75).toFixed(3)})`;
        g.fillRect((i % m.w) * C, ((i / m.w) | 0) * C, C, C);
      }
    }
    // room names (once per room, at the centroid)
    if (labels) {
      const acc = {};
      for (let i = 0; i < m.w * m.h; i++) {
        const r = m.rooms[m.room[i]];
        if (!r || m.wall[i]) continue;
        const a = acc[r] || (acc[r] = [0, 0, 0]);
        a[0] += i % m.w; a[1] += (i / m.w) | 0; a[2]++;
      }
      g.font = `bold ${Math.max(9, C * 0.5)}px monospace`;
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.textAlign = 'center';
      for (const r in acc) { const a = acc[r]; if (a[2] < 3) continue; g.fillText(r.toUpperCase(), (a[0] / a[2] + 0.5) * C, (a[1] / a[2] + 0.5) * C); }
      g.textAlign = 'left';
    }
    // triggers
    g.setLineDash([4, 3]);
    for (const t of m.triggers) {
      g.strokeStyle = 'rgba(255,150,40,0.8)';
      g.strokeRect(t.x0 * C + 1, t.y0 * C + 1, (t.x1 - t.x0 + 1) * C - 2, (t.y1 - t.y0 + 1) * C - 2);
      if (labels) { g.fillStyle = 'rgba(255,170,60,0.9)'; g.font = `${Math.max(8, C * 0.36)}px monospace`; g.fillText(t.id, t.x0 * C + 3, (t.y1 + 1) * C - 3); }
    }
    for (const p of m.portals) {
      g.strokeStyle = '#ff40ff';
      g.strokeRect(p.x0 * C, p.y0 * C, (p.x1 - p.x0) * C, (p.y1 - p.y0) * C);
    }
    g.setLineDash([]);
    // lights
    for (const l of m.lights) {
      const on = l.cur > 0;
      const col = l.circuit === 'emergency' ? '255,60,50' : l.circuit === 'outdoor' ? '255,210,120' : l.circuit === 'corridor' ? '200,255,200' : '255,255,190';
      g.strokeStyle = `rgba(${col},${on ? 0.28 : 0.1})`;
      g.beginPath(); g.arc(l.x * C, l.y * C, l.radius * C, 0, Math.PI * 2); g.stroke();
      g.fillStyle = `rgba(${col},${on ? 1 : 0.35})`;
      g.beginPath(); g.arc(l.x * C, l.y * C, Math.max(2, C * 0.12), 0, Math.PI * 2); g.fill();
    }
    // decor + props
    if (opts.decor != null ? opts.decor : WD.decor) {
      for (const d of m.decor) {
        g.fillStyle = /tree/.test(d.tex) ? 'rgba(60,140,70,0.75)' : 'rgba(200,180,140,0.7)';
        g.beginPath(); g.arc(d.x * C, d.y * C, Math.max(1.5, (d.radius || 0.15) * C), 0, Math.PI * 2); g.fill();
      }
    }
    for (const p of W.propsOn(m.id)) {
      if (p.removed) continue;
      g.fillStyle = p.hidden ? 'rgba(160,160,255,0.3)' : 'rgba(170,170,255,0.95)';
      const r = Math.max(2, (p.radius || 0.12) * C);
      g.fillRect((p.x + (p.jx || 0)) * C - r, (p.y + (p.jy || 0)) * C - r, r * 2, r * 2);
      if (labels) { g.fillStyle = '#aab'; g.font = `${Math.max(7, C * 0.32)}px monospace`; g.fillText(p.id, p.x * C + r + 1, p.y * C - r); }
    }
    // doors
    for (const d of m.doors) {
      const cx = (d.x + 0.5) * C, cy = (d.y + 0.5) * C;
      g.lineWidth = Math.max(2, C * 0.16);
      g.strokeStyle = d.static ? '#8a8a8a' : d.locked ? '#ff4040' : d.open > 0.5 ? '#40ff70' : '#d09040';
      g.beginPath();
      const sl = (1 - d.open) * C; // slides into the jamb
      if (d.axis === 'h') { g.moveTo(d.x * C + d.open * C, cy); g.lineTo(d.x * C + d.open * C + sl, cy); }
      else { g.moveTo(cx, d.y * C + d.open * C); g.lineTo(cx, d.y * C + d.open * C + sl); }
      g.stroke();
      g.lineWidth = 1;
      if (labels) { g.fillStyle = '#fc8'; g.font = `${Math.max(7, C * 0.32)}px monospace`; g.fillText(d.id, cx + 3, cy - 3); }
    }
    // interactables
    const nb = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
    const focus = W.focus();
    for (const it of m.interact) {
      if (it.kind === 'door') continue;
      const enabled = DA.interact.enabled(it.id);
      const col = !enabled ? '#666' : focus && focus.id === it.id ? '#ffffff' : '#ff5ad0';
      g.fillStyle = col; g.strokeStyle = col;
      let lx, ly;
      if (it.side) {
        const cells = [[it.x, it.y, it.side]].concat((it.cells || []).map((c) => [c[0], c[1], c[2] || it.side]));
        for (const [x, y, s] of cells) {
          const [dx, dy] = nb[s];
          const fx = (x + 0.5 + dx * 0.5) * C, fy = (y + 0.5 + dy * 0.5) * C;
          g.beginPath(); g.arc(fx, fy, Math.max(2, C * 0.14), 0, Math.PI * 2); g.fill();
          g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + dx * C * 0.45, fy + dy * C * 0.45); g.stroke();
        }
        lx = (it.x + 0.5 + nb[it.side][0] * 0.9) * C; ly = (it.y + 0.5 + nb[it.side][1] * 0.9) * C;
      } else {
        const r = (it.radius == null ? 0.4 : it.radius) * C;
        g.beginPath(); g.arc(it.x * C, it.y * C, r, 0, Math.PI * 2); g.stroke();
        lx = it.x * C + 3; ly = it.y * C - 3;
      }
      if (it.pos) { g.fillStyle = 'rgba(255,90,208,0.5)'; g.beginPath(); g.arc(it.pos.x * C, it.pos.y * C, 3, 0, Math.PI * 2); g.fill(); }
      if (labels) { g.fillStyle = col; g.font = `${Math.max(7, C * 0.34)}px monospace`; g.fillText(it.id, lx, ly); }
    }
    // points
    for (const name in m.points) {
      const p = m.points[name], a = (p.angle || 0) * DEG;
      const cam = /^cam_/.test(name);
      const x = p.x * C, y = p.y * C;
      g.fillStyle = cam ? '#40e0ff' : '#ffe040';
      g.strokeStyle = g.fillStyle;
      if (cam) {
        const cams = W.cameras().find((c) => c.id === name);
        const f = ((cams && cams.fov) || 80) * DEG / 2;
        g.globalAlpha = 0.18;
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, C * 7, a - f, a + f); g.closePath(); g.fill();
        g.globalAlpha = 1;
      }
      g.beginPath();
      g.moveTo(x + Math.cos(a) * C * 0.45, y + Math.sin(a) * C * 0.45);
      g.lineTo(x + Math.cos(a + 2.5) * C * 0.25, y + Math.sin(a + 2.5) * C * 0.25);
      g.lineTo(x + Math.cos(a - 2.5) * C * 0.25, y + Math.sin(a - 2.5) * C * 0.25);
      g.closePath(); g.fill();
      if (labels) { g.font = `${Math.max(7, C * 0.3)}px monospace`; g.fillText(name.replace(/^pt_/, ''), x + 4, y + C * 0.55); }
    }
    // NPCs
    for (const n of W.npcs()) {
      if (n.map !== m.id) continue;
      g.fillStyle = '#4090ff';
      g.beginPath(); g.arc(n.x * C, n.y * C, 0.2 * C, 0, Math.PI * 2); g.fill();
      const a = (n.angle || 0) * DEG;
      g.strokeStyle = '#4090ff'; g.beginPath(); g.moveTo(n.x * C, n.y * C); g.lineTo((n.x + Math.cos(a) * 0.5) * C, (n.y + Math.sin(a) * 0.5) * C); g.stroke();
      if (labels) { g.fillStyle = '#8bf'; g.fillText(n.id, n.x * C + 5, n.y * C + 10); }
    }
    // player
    if (W.mapId === m.id) {
      const P = W.player, x = P.x * C, y = P.y * C;
      g.fillStyle = 'rgba(255,255,255,0.12)';
      const f = ((+DA.settings.fov || 66) * DEG) / 2;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, C * 1.6, P.angle - f, P.angle + f); g.closePath(); g.fill();
      g.fillStyle = P.hidden ? '#ff9040' : '#fff';
      g.beginPath(); g.arc(x, y, 0.22 * C, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(P.angle) * C * 0.7, y + Math.sin(P.angle) * C * 0.7); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  };

  function buildPanel() {
    const W = DA.world;
    const mk = (tag, props, text) => { const e = document.createElement(tag); Object.assign(e, props || {}); if (text) e.textContent = text; return e; };
    const maps = document.getElementById('wd-maps');
    for (const id of DA.maps.ids()) {
      const b = mk('button', { onclick: () => { WD.mapId = id; refreshPanel(); } }, id);
      b.dataset.map = id;
      maps.appendChild(b);
    }
    const muts = document.getElementById('wd-muts');
    const names = new Set();
    for (const id of DA.maps.ids()) for (const k in DA.maps.defs[id].mutations || {}) names.add(k);
    for (const k of names) {
      const b = mk('button', { onclick: () => { W.hasMutation(k) ? W.revertMutation(k) : W.applyMutation(k); refreshPanel(); } }, k);
      b.dataset.mut = k;
      muts.appendChild(b);
    }
    const pw = document.getElementById('wd-power');
    for (const c of ['main', 'corridor', 'outdoor', 'array', 'generator']) {
      const b = mk('button', { onclick: () => { W.setPower(c, !W.powerRaw()[c]); refreshPanel(); } }, c);
      b.dataset.power = c;
      pw.appendChild(b);
    }
    pw.appendChild(mk('button', { onclick: () => W.lightning(1) }, 'lightning'));
    pw.appendChild(mk('button', { onclick: () => W.setDaylight(W.maps.station.daylight > 0.5 ? 0 : 1) }, 'daylight'));
    const bind = (id, key) => { const el = document.getElementById(id); el.checked = WD[key]; el.onchange = () => { WD[key] = el.checked; }; };
    bind('wd-labels', 'labels'); bind('wd-lightmap', 'lightmap'); bind('wd-decor', 'decor'); bind('wd-follow', 'follow');
    WD.canvas.addEventListener('mousedown', (e) => {
      const r = WD.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left - 18) / WD.cell, y = (e.clientY - r.top - 18) / WD.cell;
      W.teleport(x, y, W.player.angle / DEG, WD.mapId);
      e.stopPropagation();
    });
    refreshPanel();
  }
  function refreshPanel() {
    const W = DA.world;
    document.querySelectorAll('[data-map]').forEach((b) => b.classList.toggle('on', b.dataset.map === WD.mapId));
    document.querySelectorAll('[data-mut]').forEach((b) => b.classList.toggle('on', W.hasMutation(b.dataset.mut)));
    const p = W.powerRaw();
    document.querySelectorAll('[data-power]').forEach((b) => b.classList.toggle('on', !!p[b.dataset.power]));
  }
  WD.refreshPanel = refreshPanel;

  WD.init = () => {
    WD.canvas = document.getElementById('wd-map');
    buildPanel();
    DA.bus.on('frame', () => {
      if (WD.follow) WD.mapId = DA.world.mapId;
      if (!WD.paused) WD.draw(WD.mapId);
      const info = document.getElementById('wd-info');
      if (info) info.textContent = JSON.stringify(DA.world.debugInfo(), null, 1);
    });
    for (const ev of ['interact', 'door:open', 'door:close', 'door:locked', 'door:unlock', 'room:enter', 'trigger:enter', 'trigger:exit',
      'map:change', 'hide:enter', 'hide:exit', 'power:change', 'mutation', 'portal', 'npc:arrive']) {
      DA.bus.on(ev, (d) => WD.log(ev + ' ' + JSON.stringify(d && (d.id || d.room || d.name || d.to || d.circuit || d))));
    }
    DA.input.dragLook = true;
  };
})();
