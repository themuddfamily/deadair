// Run with a local server on port 8765 and Playwright installed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    // Exercise production document lifecycle with the device harness's deterministic world.
    await page.route('**/dev/devices.html', async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace('<script src="../js/devices.js">', '<script src="../js/ui.js"></script><script src="../js/devices.js">');
      await route.fulfill({response, body:html});
    });
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/dev/devices.html');
    await page.waitForFunction(() => window.__ready);
    const result = await page.evaluate(async () => {
      const checks = [];
      function check(ok, name) { if (!ok) throw Error(name); checks.push(name); }
      function key(code, key = '') { DA.modes.top().def.onKey({code, key, repeat:false}, true); }
      function advance(s) { for(let i=0;i<s*20;i++) DA.step(.05); }
      function cabinet(id='key_cabinet', item='key_records') { DA.interact.fire({id, kind:'keypad', code:1978, item}); }
      function unlock() { for(const n of '1978') key('Digit'+n,n); key('Enter'); }
      cabinet(); unlock();
      document.querySelector('[data-device="keypad"]').click();
      check(DA.devices.isOpen('keypad'), 'successful keypad ignores backdrop');
      advance(1); await Promise.resolve();
      check(DA.hasItem('key_records'), 'keypad grants successful key');
      cabinet('cancelled','test_cancel'); key('Escape'); await Promise.resolve();
      check(!DA.hasItem('test_cancel'), 'cancelled keypad grants nothing');
      cabinet('forced','test_forced'); unlock(); DA.devices.close('keypad'); await Promise.resolve();
      check(DA.hasItem('test_forced'), 'successful forced close grants key');
      cabinet('stale','test_stale'); unlock(); DA.resetRuntime(); DA.devices.close('keypad'); await Promise.resolve();
      check(!DA.hasItem('test_stale'), 'old session keypad continuation cancelled');
      cabinet('stale','test_stale');
      check(DA.hasItem('test_stale'), 'archived successful cabinet remains collectible');
      // Notes use real vent interaction and document modes, including ordinary continuation.
      DA.interact.fire({id:'test_vent',kind:'vent',notes:['reg_note_a','reg_note_b']});
      advance(1.6);
      check(DA.ui.isDocOpen(), 'first vent note opens');
      DA.ui.closeDoc(); await Promise.resolve();
      check(DA.ui.isDocOpen(), 'second vent note opens normally');
      DA.ui.closeDoc(); await Promise.resolve();
      DA.interact.fire({id:'stale_vent',kind:'vent',notes:['reg_note_a','reg_note_b']}); advance(1.6);
      DA.resetRuntime(); DA.ui.closeDoc(); await Promise.resolve();
      check(!DA.ui.isDocOpen(), 'reset cancels remaining vent notes');
      DA.archive.save(4, 'BEFORE VENT');
      DA.interact.fire({id:'load_vent',kind:'vent',notes:['load_note_a','load_note_b']}); advance(1.6);
      check(DA.ui.isDocOpen(), 'note open before archive load');
      DA.archive.load(4); await Promise.resolve();
      check(!DA.ui.isDocOpen() && !DA.state.notes.includes('load_note_a') && !DA.state.notes.includes('load_note_b'), 'archive load cancels discarded notes and restores inventory');
      // Observe map drawing instead of exposing private input state.
      DA.devices.map.open();
      const cv=document.querySelector('.dv-map-ov');
      key('ArrowRight'); advance(.2); window.dispatchEvent(new Event('blur')); advance(.05);
      const stopped=cv.toDataURL(); advance(1);
      check(cv.toDataURL()===stopped, 'blur stops map pencil');
      key('ArrowRight'); advance(.2);
      check(cv.toDataURL()!==stopped, 'map pencil still responds after blur');
      DA.ui.doc({title:'cover',body:'cover'}); const covered=cv.toDataURL(); advance(1);
      check(cv.toDataURL()===covered, 'cover stops map pencil'); DA.ui.closeDoc(); DA.devices.close('maplocate');
      // Wrap storage API only to count writes/reads; each successful call still executes it.
      let saves=0,loads=0;
      const save=DA.archive.save,load=DA.archive.load;
      DA.archive.save=(...a)=>{saves++;return save.apply(DA.archive,a)};
      DA.archive.load=(...a)=>{loads++;return load.apply(DA.archive,a)};
      const busy=v=>DA.setFlag('no_archive',v);
      const terminal=()=>{DA.devices.close('terminal');busy(false); DA.devices.terminal.open();};
      terminal(); key('Digit1','1');busy(true);key('Digit5','5');advance(5);
      check(saves===0,'busy slot selection cannot save');
      busy(false);key('Digit5','5');advance(5);
      check(saves===1,'ordinary empty slot save works');
      terminal();key('Digit1','1');key('Digit5','5');busy(true);key('KeyY','y');advance(5);
      check(saves===1,'busy overwrite confirmation cannot save');
      busy(false);key('KeyY','y');advance(1);busy(true);advance(5);busy(false);advance(5);
      check(saves===1,'busy during write cancels pending save permanently');
      terminal();key('Digit2','2');busy(true);key('Digit5','5');key('KeyY','y');advance(3);
      check(loads===0,'busy restore slot cannot load');
      busy(false);key('Digit5','5');busy(true);key('KeyY','y');advance(3);
      check(loads===0,'busy restore confirmation cannot load');
      busy(false);key('KeyY','y');advance(.5);busy(true);advance(3);
      check(loads===0,'busy during read cancels restore');
      terminal();key('Digit2','2');key('Digit5','5');key('KeyY','y');advance(3);
      check(loads===1,'ordinary restore works');
      return checks;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({passed:result.length,checks:result},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
