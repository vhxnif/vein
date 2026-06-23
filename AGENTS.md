# Project Contract

## Architecture Boundaries

### Monorepo

| Package | Path | Role |
|---------|------|------|
| `@vein/core` | `packages/core/` | All business logic: AI Agents, DB, config, import service, history |
| `@vein/cli` | `packages/cli/` | Thin client: command parsing + interactive I/O + result display |
| `@vein/web` | `packages/web/` | Thin web layer: Hono REST API + React SPA |

### Import Rules

- **CLI and Web import only from `@vein/core`** — single entry, no sub-paths (enforced by `exports` map in core's `package.json`)
- **CLI never touches DB / filesystem / AI directly** — CLI lacks `better-sqlite3`, `drizzle-orm` dependencies (enforced by package.json dependency graph)
- **Core never depends on CLI or Web**
- **All DB operations live in `packages/core/src/store/`** — SQL never appears in command or route modules

### Per-Package Details

See child AGENTS.md files in each package directory.

## Key Behaviors

- **FTS5**: AND-first, fallback to OR on zero results. `INSERT OR REPLACE` not supported → always `DELETE` then `INSERT`. BM25 ranking, k=10.
- **Project config**: stored in `.vein/config.json`. Adding a new model config field requires 6 coordinated changes — see `packages/core/AGENTS.md` for checklist.
- **Project resolution**: `resolveProjectRoot()` checks `--project` flag first, then walks up directory tree. All project-relative operations use it. Global registry at `~/.config/vein/projects.json`.

## Safety Rails

### NEVER

- Put SQL or persistence logic in CLI command files or Web routes
- Import from `@vein/core` sub-paths (e.g., `@vein/core/ai`)
- Call `better-sqlite3`, `drizzle-orm`, or `@earendil-works/pi-ai` directly from CLI or Web
- Log full LLM prompts, messages, responses, or complete document trees
- Write to `node_modules/`, `.venv/`, or `.git/` programmatically
- Create temporary test files (e.g., `nul`, `test.js`, `temp.md`) outside `__tests__/`

### ALWAYS

- Use `resolveProjectRoot()` for all project path resolution (supports `--project` flag)
- Use `logger.child({ module: 'xxx' })` for module-scoped logging
- Use `BEGIN/COMMIT` transactions for multi-table mutations (docs + docs_fts, insertTree + deleteTree)
- Wrap `analyzeDocument` sub-agent calls in try/catch with fallback
- Use `beforeToolCall` hook for hard budget limits on Agents (prompt-level limits are unreliable)

## Verification

- Before commit: `bun run check && bun run lint`
- CLI changes: test with `bun run packages/cli/src/command/vein.ts ask "test query"`
- Web changes: `bun run dev:web`, verify search + docs + history pages

## Compact Instructions

Preserve when compressing:

1. Architecture boundaries (monorepo table, import rules) — do not summarize away
2. Modified files and their package ownership
3. Current verification status (pass/fail for check + lint)
4. Open risks, TODOs, rollback notes
5. NEVER/ALWAYS rules — keep the list intact
