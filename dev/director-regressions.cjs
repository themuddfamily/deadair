/* Run against a local server; see regressions.md. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/net::|404|pointer lock/i.test(m.text())) errors.push(m.text());
    });
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/index.html?debug&jump=destroy');
    await page.evaluate(async () => {
      await DA.debug.ready;
      window.requestAnimationFrame = () => 0;
      DA.input.requestLock = () => {};
    });
    const advance = (seconds) => page.evaluate((n) => DA.debug.fast(n, 0.1), seconds);
    const fire = (id) => page.evaluate((key) => DA.debug.fire(key), id);
    const objectives = () => page.evaluate(() => Object.fromEntries(DA.state.objectives.map((o) => [o.id, o.done])));

    // Reach the console through its normal generator prerequisite and choice handlers.
    await fire('generator');
    await advance(0.5);
    await page.keyboard.press('Enter');
    await advance(3);
    await fire('control_console');
    await advance(0.5);
    await page.keyboard.press('Enter');
    await advance(0.5);
    assert.equal((await objectives()).obj_limiters, false, 'console requests all three limiters');

    for (const id of ['limiter_1', 'limiter_2', 'limiter_3']) await fire(id);
    let state = await objectives();
    assert.equal(state.obj_limiters, true, 'three released limiters complete the prerequisite');
    assert.equal(state.obj_overload, false, 'overload becomes available');

    await fire('limiter_1');
    state = await objectives();
    assert.equal(state.obj_limiters, false, 'BUG-007: re-engaging a limiter reopens the prerequisite');
    assert.equal(Object.hasOwn(state, 'obj_overload'), false, 'unavailable overload is removed');

    await advance(1);
    await page.evaluate(() => { DA.archive.save(1, 'LIMITER REGRESSION'); DA.archive.load(1); });
    await advance(0.5);
    state = await objectives();
    assert.equal(state.obj_limiters, false, 'corrected prerequisite survives save/load');
    assert.equal(Object.hasOwn(state, 'obj_overload'), false);

    await fire('limiter_1');
    state = await objectives();
    assert.equal(state.obj_limiters, true, 'releasing the limiter completes the objective again');
    assert.equal(state.obj_overload, false);
    await fire('control_console');
    await advance(0.5);
    await page.keyboard.press('Enter');
    await advance(0.5);
    assert.equal(await page.evaluate(() => DA.director.done('ending_chosen')), true, 'overload still starts');
    await fire('limiter_1');
    state = await objectives();
    assert.equal(state.obj_limiters, true, 'an ongoing ending does not reopen its prerequisites');
    assert.equal(state.obj_escape, false, 'escape remains the active objective');
    assert.deepEqual(errors, [], 'no game runtime errors');
    console.log('PASS director: limiter reversals, archive restoration, and overload progression');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
