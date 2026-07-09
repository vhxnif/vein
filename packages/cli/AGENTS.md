# @vein/cli

## Build And Test

- `bun run build` — bundles to `dist/vein.js`. Must `--external better-sqlite3` (native addon).

## Architecture Boundaries

- Import only from `@vein/core` single entry (root contract)
- Commands in `command/` each export `register(program: Command)` — new subcommands follow this pattern
- `--project` flag is resolved centrally in `vein.ts` via `preAction` hook. Commands must not parse or handle it themselves; `resolveProjectRoot()` and `setupProjectModel()` are already configured before the command action runs

## Coding Conventions

- **Output mode**: interactive → `note()` / `outro()`; non-interactive (`-n`) → JSON to stdout
- **Streaming rendering**: three-phase state machine (`tools` → `thinking` → `text`):
  - **Tools phase**: `ora` spinner on default stream (stderr), label shows tool name + running count. On tool end: stop spinner → write `✓ result` to stdout → restart spinner.
  - **Thinking/text phase**: spinner stopped. Idle spinner via debounce (200ms) — `stopSpinner()` before each delta write, `scheduleIdle()` after. Spinner only appears during gaps, not during rapid streaming.
  - Never put ora spinner on stdout alongside streaming text — `\r` cursor conflicts. Use default stderr.
- **Tool result context**: capture `onToolCallStart` label in `toolLabels` Map keyed by `toolCallId`, combine with `onToolCallEnd` summary for rich display (`Reading node 0001... → 1.5k chars`).
- `thinkingLevel` must be passed from config → `searchDocuments()` or AI reasoning leaks into text output as normal text instead of dimmed thinking deltas.
- TypeScript narrows closure-captured primitives across `await` boundaries — use mutable objects (`{ phase: ... }`) to defeat incorrect narrowing in async callbacks.

## Safety Rails

### NEVER

- Log to console — all logs go to file via core's logger

## Verification

- Build: `bun run --filter @vein/cli build`
- Type-check: `bun run --filter @vein/cli check`
