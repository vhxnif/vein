# @vein/cli

Thin client — command parsing + interactive I/O + result display. All business logic delegated to `@vein/core`.

## Build And Test

`bun run packages/cli/src/command/vein.ts ask "test query"`

## Architecture Boundaries

Each command file does three things: register flags via `commander`, handle I/O via `@clack/prompts`, call high-level functions from `@vein/core`.

## Safety Rails

### NEVER

- Read/write `~/.config/vein/` files directly — use core's `loadGlobalProjects()` etc.
- Inline business pipeline logic (chunking, segmentation, FTS, Agent orchestration)
- Log to console — all logs go to file via core's logger

### ALWAYS

- `getErrorMessage(err)` for user-facing error display
- `spinner()` for any operation > 1 second
- `colorize()` for terminal colors — check `process.stdout.isTTY` before colorizing

## Coding Conventions

- **Output mode**: interactive → `note()` / `outro()`; non-interactive (`-n`) → JSON to stdout
- **Colors**: `colorize()` + `VERDICT_COLOR`; respect `process.stdout.isTTY`

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep intact
2. Thin-client boundary — CLI must stay thin
3. Interaction conventions (spinner, colors, output format)
