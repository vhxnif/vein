# @vein/cli

## Build And Test

- `bun run --filter @vein/cli build` → bundles to `dist/vein.js`

## Architecture Boundaries

- Import only from `@vein/core` single entry (root contract)
- Commands in `command/` each export `register(program: Command)` — new subcommands follow this pattern
- `--project` is handled centrally: `vein.ts` `preAction` hook calls `setProjectOverride()`. Commands must not parse `--project` themselves — `resolveProjectRoot()` and `setupProjectModel()` respect the override

## Coding Conventions

- **Output mode**: interactive → `note()` / `outro()` (@clack); non-interactive (`-n`) → JSON to stdout
- **Streaming rendering** (three-phase: tools → thinking → text):
  - Tools phase: `ora` spinner on stderr (never stdout — `\r` cursor conflicts with streamed text). On tool end: stop spinner → write `✓ result` to stdout → restart
  - Thinking/text: stop spinner before each delta write; idle spinner re-appears after 200ms debounce (gaps only, not during rapid streaming)
  - Rich tool display via `toolLabels` Map keyed by `toolCallId` (`onToolCallStart` label + `onToolCallEnd` summary)
- `thinkingLevel` must be passed from config → `searchDocuments()`, or reasoning leaks into output as normal text instead of dimmed deltas
- TypeScript narrows closure-captured primitives across `await` — hold state in a mutable object (`{ phase: ... }`) to defeat incorrect narrowing

## Safety Rails

### NEVER

- Use console for logging — diagnostics go to file via core's `logger`
