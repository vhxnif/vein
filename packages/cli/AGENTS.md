# @vein/cli

## Build And Test

- `bun run build` — bundles to `dist/vein.js`. Must `--external better-sqlite3` (native addon).

## Architecture Boundaries

- Import only from `@vein/core` single entry (root contract)
- Commands in `command/` each export `register(program: Command)` — new subcommands follow this pattern

## Coding Conventions

- **Output mode**: interactive → `note()` / `outro()`; non-interactive (`-n`) → JSON to stdout
- `spinner()` for any operation > 1 second

## Safety Rails

### NEVER

- Log to console — all logs go to file via core's logger
