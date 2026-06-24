# Project Contract

## Build And Test

- Before commit: `bun run check && bun run lint && bun run format`
- CLI changes: `bun run packages/cli/src/command/vein.ts ask "test query"`
- Web changes: `bun run dev:web`, verify search + docs + history pages

## Architecture Boundaries

| Package | Path | Role |
|---------|------|------|
| `@vein/core` | `packages/core/` | All business logic: AI Agents, DB, config, import, history |
| `@vein/cli` | `packages/cli/` | Thin client: command parsing + I/O + result display |
| `@vein/web` | `packages/web/` | Thin web layer: Hono REST API + React SPA |

- CLI and Web import only from `@vein/core` single entry, no sub-paths (enforced by exports map)
- CLI never touches DB / filesystem / AI directly (enforced by package.json dependency graph)
- Per-package rules in child AGENTS.md files

### Design System

Web UI governed by `DESIGN.md` (tokens, components) and `packages/web/AGENTS.md` (rules). Never invent colors, spacing, or type outside those docs.

## Coding Conventions

- **FTS5**: AND-first, fallback to OR on zero results. `INSERT OR REPLACE` unsupported → `DELETE` then `INSERT`. BM25 ranking, k=10.
- **New model config field**: requires 6 coordinated changes across packages — see `packages/core/AGENTS.md`
- `resolveProjectRoot()` for all project path resolution (supports `--project` flag)

## Safety Rails

### NEVER

- Put SQL or persistence logic in CLI or Web code
- Import from `@vein/core` sub-paths
- Call `better-sqlite3`, `drizzle-orm`, or `@earendil-works/pi-ai` from CLI or Web
- Log full LLM prompts, messages, responses, or complete document trees

### ALWAYS

- `logger.child({ module: 'xxx' })` for module-scoped logging
- `BEGIN/COMMIT` transactions for multi-table mutations (docs + docs_fts, insertTree + deleteTree)

## Compact Instructions

Preserve when compressing:

1. Architecture boundaries (monorepo table, import rules) — do not summarize away
2. Modified files and their package ownership
3. Current verification status (pass/fail for check + lint)
4. Open risks, TODOs, rollback notes
5. NEVER/ALWAYS rules — keep the list intact
