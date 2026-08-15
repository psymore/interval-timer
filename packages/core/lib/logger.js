// Minimal structured logger — no dependency, just a thin console wrapper.
//
// Works from both the main process (Node ESM, `process.env` available) and
// renderer code loaded as `<script type="module">` (sandboxed browser
// context, no `process` global) — see CLAUDE.md's process-split notes for
// why the renderer can't rely on Node globals. `typeof process` is guarded
// so the same file works unmodified in either environment.
//
// Level defaults to "info" (debug suppressed) which is the sane default for
// a packaged build; set LOG_LEVEL=debug in the main process environment to
// see debug output.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const DEFAULT_LEVEL = "info";

function resolveConfiguredLevel() {
  const envLevel =
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.LOG_LEVEL === "string"
      ? process.env.LOG_LEVEL.toLowerCase()
      : null;

  return envLevel && LEVELS[envLevel] !== undefined ? envLevel : DEFAULT_LEVEL;
}

const CONFIGURED_LEVEL_VALUE = LEVELS[resolveConfiguredLevel()];

function noop() {}

/**
 * @param {string} namespace - short tag prefixed to every log line, e.g. "windows", "AlarmManager"
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
export function createLogger(namespace) {
  const prefix = namespace ? `[${namespace}]` : "";

  function make(level, method) {
    if (LEVELS[level] < CONFIGURED_LEVEL_VALUE) return noop;
    if (!prefix) return (...args) => method(...args);
    return (...args) => method(prefix, ...args);
  }

  return {
    debug: make(
      "debug",
      typeof console.debug === "function"
        ? console.debug.bind(console)
        : console.log.bind(console),
    ),
    info: make("info", console.log.bind(console)),
    warn: make("warn", console.warn.bind(console)),
    error: make("error", console.error.bind(console)),
  };
}
