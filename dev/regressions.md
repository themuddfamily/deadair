# Browser regression checks

These checks exercise the fixes from the September 2026 bug audit. They use the
game and its shipped development harnesses in Chrome through Playwright. Each
suite opens an isolated browser; archives/settings written by tests do not affect
your normal browser profile. No production build step is required.

Start a server from the repository root:

```sh
python3 -m http.server 8765
```

In another terminal, install the test dependency outside the repository and run:

```sh
npm install --prefix /tmp/deadair-test-deps playwright
PLAYWRIGHT_PATH=/tmp/deadair-test-deps/node_modules/playwright node dev/regressions.cjs
```

The default browser executable is `/usr/bin/google-chrome`. Set `CHROME_PATH` to
your Chrome/Chromium executable when needed. `DEADAIR_URL` overrides the default
`http://localhost:8765`. If Playwright is already resolvable by Node, omit
`PLAYWRIGHT_PATH`. Individual suites run with the same environment, for example
`node dev/world-regressions.cjs`.

| Suite | Regression coverage |
| --- | --- |
| `devices-regressions.cjs` | Successful/cancelled keypad dismissal and archived-key recovery; note sequences across session/archive changes; terminal save/load guards at selection, confirmation and I/O; map input after blur/cover. |
| `world-regressions.cjs` | NPC locked paths, locking during movement and unlock recovery; complete replacement-operator route; hiding through map mutation/reversion, ordinary exit and invalidated shelters. |
| `radio-regressions.cjs` | Delayed cassette insertion cancellation, replacement and manual/normal playback; four radio controls across normal dragging and cancellation conditions. |
| `ui-regressions.cjs` | Driving input through pause/blur and simultaneous keys; interrupted travel fades through quit/new/load; ordinary/cinematic fades; settings drag cleanup. |
| `director-regressions.cjs` | Limiter prerequisites after reversal and archive restoration; overload progression and ending objective isolation. |
| `story-regressions.cjs` | All four endings complete and return to a visible title without runtime errors. |

The runner executes suites sequentially to avoid browser-focus contention. Tests
use accelerated simulation and debug interaction/positioning where appropriate;
the ending checks also automate carrier tracking and following the replacement
operator. They check integration, not normal-play route difficulty. Focus and
capture lifecycle tests explicitly dispatch those events where headless browser
focus behavior is unreliable, and test released-button movement separately.
Settings pointer sequences also use controlled DOM events: concurrent headless
browsers can emit unsolicited released-button cursor movements during a native
test drag. The checks still exercise the actual settings elements and handlers.
For a supplemental native settings drag check in an otherwise idle browser
environment, set `NATIVE_UI_INPUT=1` when running `dev/ui-regressions.cjs`.
