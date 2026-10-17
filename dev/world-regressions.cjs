/* Run with PLAYWRIGHT_PATH pointing to playwright if it is not installed locally. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.DEADAIR_URL || 'http://localhost:8765') + '/dev/world.html');
    await page.waitForFunction(() => window.WT && DA.world.map);
    const result = await page.evaluate(async () => {
      const W = DA.world, checks = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
      W.closeDoor('radio_door', true); W.lockDoor('radio_door', true);
      const n = W.addNpc({ id: 'regression', at: 'pt_entity_radio_door' });
      const start = { x: n.x, y: n.y };
      let done = null;
      W.walkNpc(n.id, 'pt_tour_radio', 1.2).then(x => { done = x; });
      WT.step(600);
      await Promise.resolve();
      check('unreachable NPC waits outside locked door', n.x === start.x && n.y === start.y && done === null);
      W.lockDoor('radio_door', false);
      WT.step(1200);
      await Promise.resolve();
      const goal = W.point('pt_tour_radio');
      check('unlock resumes original route and resolves success', done === true && Math.hypot(n.x-goal.x,n.y-goal.y) < 0.01);
      W.removeNpc(n.id);
      // A route computed while open must also respect a door locked after planning.
      W.openDoor('radio_door', true);
      const n2 = W.addNpc({ id: 'regression2', at: 'pt_entity_radio_door' });
      W.walkNpc(n2.id, 'pt_tour_radio', 1.2);
      WT.step(1);
      W.closeDoor('radio_door', true); W.lockDoor('radio_door', true);
      WT.step(600);
      check('door locked during walk is not crossed', n2.y > 12 && !W.door('radio_door').open);
      W.lockDoor('radio_door', false); WT.step(1200);
      check('walk resumes after mid-route lock', Math.hypot(n2.x-goal.x,n2.y-goal.y) < 0.01);
      W.removeNpc(n2.id);
      for (const id of ['hide_stall', 'hide_cupboard']) {
        const it = DA.interact.find(id).it;
        W.teleport(it.x, it.y, 0, 'station');
        DA.interact.fire(id); WT.step(40);
        check(id + ' enters', W.isHidden());
        const pos = { x: W.player.x, y: W.player.y };
        for (const name of ['hall_long', 'photo_four']) {
          W.applyMutation(name); WT.step(120);
          check(id + ' preserved through ' + name, W.isHidden() && W.player.x === pos.x && W.player.y === pos.y && DA.interact.prompt(id) === 'Come out');
          W.revertMutation(name); WT.step(40);
          check(id + ' preserved through revert ' + name, W.isHidden() && W.player.x === pos.x && W.player.y === pos.y);
        }
        W.exitHide(); WT.step(40);
        check(id + ' exits normally', !W.isHidden() && DA.state.world.hidden === null);
      }
      const it = DA.interact.find('hide_stall').it;
      W.teleport(it.x, it.y, 0, 'station'); DA.interact.fire(it.id); WT.step(40);
      DA.interact.setEnabled(it.id, false); W.applyMutation('hall_long'); WT.step(40);
      check('invalidated shelter clears both hiding states', !W.isHidden() && DA.state.world.hidden === null && DA.state.world.hideFrom === null);
      DA.interact.setEnabled(it.id, true); W.revertMutation('hall_long');
      const relief = W.addNpc({ id: 'relief_regression', at: 'pt_front_inside' });
      let reliefDone = null;
      W.walkNpc(relief.id, ['pt_tour_lobby', 'pt_entity_radio_door', 'pt_tour_radio'], 1.2).then(x => { reliefDone = x; });
      WT.step(3600); await Promise.resolve();
      check('replacement operator multi-point route completes', reliefDone === true && Math.hypot(relief.x-goal.x,relief.y-goal.y) < 0.01);
      W.removeNpc(relief.id);
      return checks;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: result.length, checks: result }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
