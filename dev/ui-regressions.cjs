/* Run against the local HTTP server; see dev/regressions.md for setup. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/dev/scenes.html');
    await page.waitForFunction(() => window.DA && DA.modes.defs.drive);
    await page.evaluate(() => { DA.newGame('REGRESSION'); DA.scenes.drive({ kind: 'loop' }); });
    const target = () => page.evaluate(() => { DA.step(1 / 30); return DA.scenes.scene().road.target; });
    for (const key of ['w', 'ArrowUp']) {
      await page.keyboard.down(key);
      assert.equal(await target(), 34, key + ' accelerates');
      await page.keyboard.press('Escape');
      await page.keyboard.up(key);
      await page.keyboard.press('Enter');
      assert.equal(await target(), 20, key + ' released while paused');
      await page.keyboard.down(key);
      assert.equal(await target(), 34);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await target(), 20, key + ' focus loss');
      await page.keyboard.up(key);
    }
    await page.keyboard.down('w');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.up('w');
    assert.equal(await target(), 34, 'second acceleration key remains held');
    await page.keyboard.up('ArrowUp');
    assert.equal(await target(), 20);

    // The actual stairs fade, interrupted through the actual pause/quit menu.
    for (const elapsed of [0, 0.15]) {
      await page.evaluate(async elapsed => {
        DA.newGame('REGRESSION');
        DA.modes.push('explore');
        DA.world.load('basement', 'pt_b_arrive');
        await H.ff(elapsed);
      }, elapsed);
      for (const key of ['Escape', 'ArrowDown', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
      await page.evaluate(() => H.ff(3));
      assert.deepEqual(await page.evaluate(() => ({ running: DA.running, mode: DA.modes.top().name, fade: DA.ui.fadeLevel(), visibility: document.getElementById('fade').style.visibility })),
        { running: false, mode: 'title', fade: 0, visibility: 'hidden' });
    }
    for (const restart of ['new', 'load']) {
      assert.equal(await page.evaluate(async restart => {
        DA.newGame('REGRESSION');
        const state = DA.util.clone(DA.state);
        window.staleFadeFinished = false;
        DA.ui.fade(1, 1).then(() => { window.staleFadeFinished = true; });
        await H.ff(0.25);
        if (restart === 'new') DA.newGame('NEW'); else DA.startFromState(state);
        await H.ff(2);
        return DA.ui.fadeLevel() === 0 && !window.staleFadeFinished;
      }, restart), true, restart + ' cancels previous session fade');
    }
    assert.equal(await page.evaluate(async () => {
      let finished = false;
      DA.ui.fade(1, 0.4).then(() => { finished = true; });
      await H.ff(0.2);
      if (!(DA.ui.fadeLevel() > 0 && DA.ui.fadeLevel() < 1) || finished) return false;
      await H.ff(0.3);
      if (DA.ui.fadeLevel() !== 1 || !finished) return false;
      DA.ui.fade(0, 0.4); await H.ff(0.5);
      return DA.ui.fadeLevel() === 0;
    }), true, 'ordinary fade timing and completion');
    assert.equal(await page.evaluate(async () => {
      window.sceneDone = false;
      DA.scenes.play([{ fade: { to: 1, secs: 0.2 } }, { fade: { to: 0, secs: 0.2 } }]).then(() => { window.sceneDone = true; });
      await H.ff(2);
      return window.sceneDone;
    }), true, 'scene fades still complete');

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/dev/scenes.html');
    await page.waitForFunction(() => window.DA && DA.modes.defs.settings);
    await page.evaluate(() => {
      DA.modes.clear(); DA.modes.push('settings');
      window.lastMouse = null;
      window.addEventListener('mousemove', e => { window.lastMouse = { x: e.clientX, y: e.clientY }; });
    });
    // Optional native drag check for an otherwise idle browser environment.
    if (process.env.NATIVE_UI_INPUT === '1') {
      const nativeTrack = await page.locator('.ui-s-track').first().boundingBox();
      const nativeMove = async fraction => {
        const x = nativeTrack.x + nativeTrack.width * fraction, y = nativeTrack.y + nativeTrack.height / 2;
        await page.evaluate(() => { window.lastMouse = null; });
        await page.mouse.move(x, y);
        await page.waitForFunction(({ x, y }) => window.lastMouse && Math.abs(lastMouse.x - x) <= 1 && Math.abs(lastMouse.y - y) <= 1,
          { x, y }, { polling: 10 });
      };
      await nativeMove(0.5); await page.mouse.down(); await nativeMove(0.8);
      assert.equal(await page.evaluate(() => DA.settings.volume), 0.8, 'native settings drag in isolated context');
      await page.mouse.up(); await nativeMove(0.2);
      assert.equal(await page.evaluate(() => DA.settings.volume), 0.8, 'native released hover');
    }
    await page.waitForFunction(() => !document.pointerLockElement, null, { polling: 10 });
    // Keep each drag's event sequence in one task. Concurrent headless Chromium can
    // inject an unrelated trusted buttons:0 hover between CDP down/move commands;
    // that correctly cancels dragging, but does not model an uninterrupted drag.
    assert.equal(await page.evaluate(() => {
      const slider = document.querySelector('.ui-s-slider');
      const track = slider.querySelector('.ui-s-track').getBoundingClientRect();
      const fire = (target, type, fraction, buttons, button = 0) => target.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: track.x + track.width * fraction,
        clientY: track.y + track.height / 2, buttons, button,
      }));
      const expect = (value, label) => {
        if (Math.abs(DA.settings.volume - value) > 1e-9) throw new Error(label + ': ' + DA.settings.volume);
      };
      fire(slider, 'mousedown', 0.5, 1);
      fire(window, 'mousemove', 0.8, 1); expect(0.8, 'normal drag');
      fire(window, 'mouseup', 0.8, 0);
      fire(window, 'mousemove', 0.2, 0); expect(0.8, 'released hover');
      for (const blur of [false, true]) {
        fire(slider, 'mousedown', 0.5, 1); expect(0.5, 'new drag');
        if (blur) window.dispatchEvent(new Event('blur'));
        fire(window, 'mousemove', 1, blur ? 1 : 0);
        expect(0.5, blur ? 'blur cancellation' : 'lost release cancellation');
        fire(window, 'mouseup', 1, 0);
      }
      fire(slider, 'mousedown', 0.1, 2, 2);
      fire(window, 'mousemove', 0.1, 2); expect(0.5, 'secondary button ignored');
      fire(window, 'mouseup', 0.1, 0, 2);
      return true;
    }), true, 'settings drag and cancellation handlers');
    assert.deepEqual(errors, []);
    console.log('UI regressions passed: drive pause/blur and simultaneous keys; interrupted travel quit/new/load; ordinary and scene fades; settings drag/release/blur/buttons.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
