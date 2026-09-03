# Timer tick loop

Read this when: touching timer ticking, background-throttling behavior, or `packages/core/js/logic/Timer.js` / `IntervalTimer.js`.

Both `packages/core/js/logic/Timer.js` and `packages/core/js/logic/IntervalTimer.js` use `setInterval(..., 200)`, not `requestAnimationFrame`. rAF stops firing when the window is backgrounded/minimized, which froze the timer. This is paired with:
- `app.commandLine.appendSwitch("disable-background-timer-throttling")` / `"disable-renderer-backgrounding"` in `packages/electron/main.js`
- `backgroundThrottling: false` on every `BrowserWindow`'s `webPreferences`
- `powerSaveBlocker.start("prevent-app-suspension")` while the app is running

Each `logic/*.js` class is pure timer state machine (elapsed-time based, not tick-count based, so it self-corrects after throttling); the matching `packages/core/js/timer.js` / `packages/core/js/intervalTimer.js` is the DOM-facing controller that wires it to buttons and views.
