/* Run with Playwright and Chromium; exercises the shipped radio harness. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/dev/radio.html?sit&clean');
    await page.waitForFunction(() => window.DA?.radio?.atDesk());
    const tapes = await page.evaluate(async () => {
      const results = {};
      const plays = () => __events.filter(e => e.n === 'tape:play');
      const reset = () => { DA.radio.stopTape(true); DA.radio.setPower(true); __events.length = 0; };
      for (const action of ['eject', 'stop', 'power', 'reset']) {
        reset(); DA.radio.insertTape('tape_1954');
        if (action === 'eject') DA.radio.ejectTape();
        if (action === 'stop') DA.radio.stopTape();
        if (action === 'power') DA.radio.setPower(false);
        if (action === 'reset') DA.bus.emit('runtime:reset');
        await stepFor(1.1); results[action] = plays().length;
      }
      reset(); DA.radio.insertTape('tape_1954'); await stepFor(0.4);
      DA.radio.insertTape('tape_1954'); await stepFor(0.5); results.replacementEarly = plays().length;
      await stepFor(0.4); results.replacement = plays().map(e => e.d.id);
      reset(); DA.radio.insertTape('tape_1954'); DA.radio.playTape();
      await stepFor(1.1); results.manual = plays().map(e => e.d.id);
      reset(); DA.radio.insertTape('tape_1954'); await stepFor(0.7); results.normalEarly = plays().length;
      await stepFor(0.2); results.normal = plays().map(e => e.d.id);
      DA.radio.stopTape(true);
      return results;
    });
    assert.deepEqual(tapes, { eject: 0, stop: 0, power: 0, reset: 0, replacementEarly: 0, replacement: ['tape_1954'], manual: ['tape_1954'], normalEarly: 0, normal: ['tape_1954'] });
    const cdp = await page.context().newCDPSession(page);
    const mouse = (type, x, y, buttons = 0) => cdp.send('Input.dispatchMouseEvent', { type, x, y, buttons, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    const controls = [
      ['.radio-sknob-volume .radio-sknob', 'volume'],
      ['.radio-sknob-squelch .radio-sknob', 'squelch'],
      ['.radio-compass', 'bearingTarget'],
      ['.radio-rotknob', 'bearingTarget'],
    ];
    const read = key => page.evaluate(key => key === 'bearingTarget' ? DA.radio._rt.bearingTarget : DA.state.radio[key], key);
    let checks = 0;
    for (const [selector, key] of controls) {
      for (const ending of ['up', 'blur', 'lostcapture', 'cancel', 'buttons', 'cover', 'exit', 'reset']) {
        await page.bringToFront();
        await page.evaluate(() => {
          if (!DA.radio.atDesk()) DA.radio.sit();
          DA.radio.setVolume(0.5); DA.radio.setSquelch(0.5); DA.radio.setBearing(180);
          DA.radio._draw.desk(0);
        });
        const box = await page.locator(selector).boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await mouse('mouseMoved', x, y);
        await mouse('mousePressed', x, y, 1);
        const initial = await read(key);
        await mouse('mouseMoved', x + 4, y - 4, 1);
        assert.notEqual(await read(key), initial, selector + ' normal held movement');
        if (ending === 'up') await mouse('mouseReleased', x + 4, y - 4);
        if (ending === 'blur') {
          // Headless Chromium does not consistently emit OS focus changes between tabs.
          // Dispatch the native window lifecycle event, then use trusted CDP hover input.
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        }
        if (ending === 'lostcapture' || ending === 'cancel') await page.locator(selector).evaluate((node, ending) => {
          if (ending === 'lostcapture') node.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
          else node.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
        }, ending);
        if (ending === 'cover') await page.evaluate(() => DA.modes.push('cctv'));
        if (ending === 'exit') await page.evaluate(() => DA.radio.stand());
        if (ending === 'reset') await page.evaluate(() => DA.bus.emit('runtime:reset'));
        const after = await read(key);
        await mouse('mouseMoved', x - 4, y + 4, 0);
        assert.equal(await read(key), after, selector + ' released movement after ' + ending);
        assert.equal(await page.evaluate(() => DA.radio._rt.controlDrag === null), true, selector + ' listener cleanup after ' + ending);
        await mouse('mouseReleased', x - 4, y + 4);
        if (ending === 'cover') await page.evaluate(() => DA.modes.pop());
        checks++;
      }
    }
    assert.deepEqual(errors, []);
    console.log('Radio regressions passed: cassette cancellation/replacement/manual/normal playback and ' + checks + ' control gesture cases.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
