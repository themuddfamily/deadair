/* Accelerated story integration checks, using debug positioning and carrier tracking. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    for (const ending of ['destroy', 'open', 'maintain', 'secret']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/net::|404|pointer lock/i.test(m.text())) errors.push(m.text());
      });
      await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/index.html?debug&jump=' + ending);
      await page.evaluate(async () => {
        await DA.debug.ready;
        window.requestAnimationFrame = () => 0;
        DA.input.requestLock = () => {};
      });
      const advance = (seconds) => page.evaluate((n) => DA.debug.fast(n, 0.2), seconds);
      const fire = (id) => page.evaluate((key) => DA.debug.fire(key), id);
      const choose = async () => {
        await advance(0.6);
        assert.equal(await page.evaluate(() => DA.modes.is('choice')), true, 'expected story choice');
        await page.keyboard.press('Enter');
        await advance(0.6);
      };
      if (ending === 'destroy') {
        await fire('generator');
        await choose();
        await advance(3);
        for (const id of ['limiter_1', 'limiter_2', 'limiter_3']) await fire(id);
        await fire('control_console');
        await choose();
        await page.evaluate(() => { DA.debug.teleport('pt_car'); DA.debug.fire('car'); });
        await advance(220);
      } else if (ending === 'open') {
        await fire('relay_console');
        await choose();
        await advance(170);
        await page.evaluate(() => { DA.radio.sit(); DA.radio.send('out_respond_2049'); });
        await advance(180);
      } else if (ending === 'secret') {
        await advance(300);
        assert.equal(await page.evaluate(() => DA.director.done('handover')), true, 'relief arrives and completes handover');
        await fire('car');
        await advance(220);
      } else {
        await page.evaluate(async () => {
          DA.world.closeDoor('radio_door', true);
          DA.radio.sit();
          DA.radio.tune(148.32);
          DA.radio.send('out_keep_channel_open');
          for (let i = 0; i < 4000 && DA.running; i++) {
            const src = DA.radio._rt.active.get('tx_keep_channel')?.src;
            if (src) {
              const d = src.drift, w = 2 * Math.PI / d.period, t = DA.simTime;
              DA.radio.tune(src.freq + d.amp * (0.72 * Math.sin(w * t + d.ph) + 0.28 * Math.sin(w * 2.71 * t + d.ph2)));
            }
            if (DA.director.done('m_done')) {
              const n = DA.world.npc('replacement');
              if (n) DA.world.teleport(n.x + 0.6, n.y, 0, n.map);
            }
            if (DA.modes.is('choice')) {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter' }));
            }
            await DA.debug.fast(0.2, 0.1);
          }
        });
      }
      const result = await page.evaluate(() => ({ ending: DA.flag('ending'), mode: DA.modes.top()?.name, fade: DA.ui.fadeLevel() }));
      assert.equal(result.ending, ending, ending + ' reaches its ending');
      assert.equal(result.mode, 'title', ending + ' returns to title');
      assert.equal(result.fade, 0, ending + ' leaves title visible');
      assert.deepEqual(errors, [], ending + ' has no game errors');
      console.log('PASS story: ' + ending);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
