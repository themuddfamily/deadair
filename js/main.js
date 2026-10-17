/* DEAD AIR — main.js: stage sizing + boot. Loaded last. */
(function () {
  'use strict';
  const DA = window.DA;

  /** Fit a 16:9 stage into the window; publish --stage-w/--stage-h/--u for module CSS. */
  function fitStage() {
    const w = window.innerWidth, h = window.innerHeight;
    let sw = w, sh = (w * 9) / 16;
    if (sh > h) { sh = h; sw = (h * 16) / 9; }
    const root = document.documentElement.style;
    root.setProperty('--stage-w', Math.floor(sw) + 'px');
    root.setProperty('--stage-h', Math.floor(sh) + 'px');
    DA.bus.emit('resize', { w: Math.floor(sw), h: Math.floor(sh) });
  }
  window.addEventListener('resize', fitStage);

  window.addEventListener('load', () => {
    fitStage();
    DA.boot();
    if (DA.debug && DA.debug.autostart && DA.debug.autostart()) return;
    DA.modes.push('title');
  });
})();
