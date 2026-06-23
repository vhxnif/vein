# @vein/cli

Thin client — command parsing + interactive I/O + result display. All business logic delegated to `@vein/core`.

## Architecture Boundaries

Each command file does exactly three things: register flags via `commander`, handle I/O via `@clack/prompts` (spinner, prompts, outro), call high-level functions from `@vein/core`.

## Safety Rails

### NEVER

- Read/write `~/.config/vein/` files directly — use `loadGlobalProjects()` etc. from core
- Inline business pipeline logic (chunking, segmentation, FTS, Agent orchestration)
- Log to console — all logs go to file via core's logger

### ALWAYS

- Use `getErrorMessage(err)` for user-facing error display
- Use `spinner()` for any operation > 1 second
- Use `colorize()` for terminal colors; check `process.stdout.isTTY` before colorizing

## Interaction Conventions

- **Output mode**: Interactive → `note()` / `outro()`; non-interactive (`-n`) → JSON to stdout
- **Colors**: `colorize()` + `VERDICT_COLOR`; respect `process.stdout.isTTY`

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep list intact
2. Thin-client boundary — CLI must stay thin
3. Interaction conventions (spinner, colors, output format)
