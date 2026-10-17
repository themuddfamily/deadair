/* DEAD AIR — dev/renderer-atlas.js
 * dev/renderer.html?atlas — labelled atlas of every texture and sprite (normal + abandoned).
 * Options: &only=<substring> filter, &z=<zoom> (default 2), &ab=0 hides abandoned.
 */
(function () {
  'use strict';
  const DA = window.DA;
  const q = new URLSearchParams(location.search);
  window.DA_ATLAS = function () {
    document.body.classList.add('atlas');
    const only = q.get('only');
    const zoom = +(q.get('z') || 2);
    const showAb = q.get('ab') !== '0';
    const root = document.createElement('div');
    root.id = 'atlas';
    document.body.appendChild(root);
    const names = DA.textures.list().filter((n) => !only || n.includes(only));
    const extra = (q.get('comp') || 'wall_paint+dec_calendar,wall_paint+dec_sign_exit,concrete_ext+window').split(',').filter(Boolean);
    for (const name of names.concat(only ? [] : extra)) {
      const rec = DA.textures.get(name);
      const cell = document.createElement('div');
      cell.className = 'cell';
      const row = document.createElement('div');
      row.className = 'imgs';
      const variants = showAb ? ['normal', 'abandoned'] : ['normal'];
      for (const v of variants) {
        const r2 = DA.textures.get(name, v);
        for (let f = 0; f < r2.frames.length; f++) {
          const cv = DA.textures.toCanvas(name, v, f);
          cv.style.width = r2.w * zoom + 'px';
          cv.style.height = r2.h * zoom + 'px';
          cv.title = name + ' ' + v + ' f' + f;
          if (v === 'abandoned') cv.classList.add('ab');
          row.appendChild(cv);
        }
      }
      const lab = document.createElement('div');
      lab.className = 'lab';
      const fl = Object.keys(rec.flags).filter((k) => rec.flags[k]).join(' ');
      lab.textContent = name + '  [' + rec.w + '×' + rec.h + (rec.frames.length > 1 ? ' ×' + rec.frames.length : '') + ']  ' + fl + (rec.kind === 'sprite' ? '  s=' + rec.scale : '');
      cell.appendChild(row);
      cell.appendChild(lab);
      root.appendChild(cell);
    }
    const info = document.createElement('div');
    info.className = 'info';
    info.textContent = 'textures: ' + names.length + ' · build ' + DA.textures.buildMs.toFixed(0) + ' ms';
    root.prepend(info);
  };
})();
