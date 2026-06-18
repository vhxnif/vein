# @vein/cli

Thin client — command parsing + interactive I/O + result display. All business logic delegated to `@vein/core`.

## Architecture Boundaries

Each command file does exactly three things:

1. **Register flags** via `commander`
2. **Handle I/O** via `@clack/prompts` (spinner, prompts, outro)
3. **Call core** — import high-level functions from `@vein/core`

## Safety Rails

### NEVER

- Import `better-sqlite3`, `drizzle-orm`, or `@earendil-works/pi-ai` directly (CLI dependency graph prevents this)
- Import from `@vein/core` sub-paths (enforced by core's `exports` map)
- Read/write `~/.config/vein/` files directly — use `loadGlobalProjects()` etc. from core
- Inline business pipeline logic (chunking, segmentation, FTS, Agent orchestration)
- Log to console — all logs go to file via core's logger

### ALWAYS

- Use `resolveProjectRoot()` (from `@vein/core`) for project path resolution
- Use `getErrorMessage(err)` for user-facing error display
- Use `spinner()` for any operation > 1 second
- Use `colorize()` for terminal colors; check `process.stdout.isTTY` before colorizing

## Interaction Conventions

- **Spinner**: `@clack/prompts` `spinner()` for all time-consuming operations
- **Output mode**: Interactive → `note()` / `outro()`; non-interactive (`-n`) → JSON to stdout
- **Colors**: `colorize()` + `VERDICT_COLOR`; respect `process.stdout.isTTY`
- **Logging**: `logger.child({ module: 'xxx' })` — logs to file only, never to console

## Compact Instructions

Preserve:

1. NEVER/ALWAYS rules — keep list intact
2. Thin-client boundary — CLI must stay thin
3. Interaction conventions (spinner, colors, output format)
4. Modified command files and their core dependencies
