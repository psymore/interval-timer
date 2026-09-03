# Architecture docs index

Domain-specific implementation detail, split out of `CLAUDE.md` so routine tasks don't have to load every subsystem. Read the one doc for the subsystem you're touching — not all of them.

| Doc | Read this when touching... |
|---|---|
| [`monorepo-and-sync.md`](monorepo-and-sync.md) | Package layout, the local HTTP server, sync scripts (`sync:demo`/`sync:pwa`/packaging), or platform detection |
| [`timer-engine.md`](timer-engine.md) | The timer tick loop or background-throttling behavior |
| [`alarm-providers.md`](alarm-providers.md) | Alarm sources (local/YouTube/Spotify), the provider factory, or alarm link health |
| [`mini-window.md`](mini-window.md) | The always-on-top mini window |
| [`presets.md`](presets.md) | Preset persistence, IPC, or the `last-session` auto-fork |

For everything else — commands, the `FOLLOWUP` protocol, top-level package summaries — see [`/CLAUDE.md`](../../CLAUDE.md).
