/* Sequential execution keeps native-input browser tests from competing for focus. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = ['devices', 'world', 'radio', 'ui', 'director', 'story'];
const failures = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite + '-regressions.cjs')], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error || result.status !== 0) {
    failures.push(suite);
    if (result.error) console.error(result.error);
  }
}
if (failures.length) {
  console.error('Failed regression suites: ' + failures.join(', '));
  process.exitCode = 1;
} else console.log('All six regression suites passed.');
