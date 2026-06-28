# Project Contract

## Build And Test

- CLI smoke: `bun run packages/cli/src/command/vein.ts ask "test query"`
- Web smoke: `bun run dev:web` → verify search + docs + history pages

## Architecture Boundaries

| Package | Path | Role |
|---------|------|------|
| `@vein/core` | `packages/core/` | All business logic: AI, DB, config, import, history |
| `@vein/cli` | `packages/cli/` | Command parsing + I/O + result display |
| `@vein/web` | `packages/web/` | Hono REST API + React SPA |

- Import only from `@vein/core` single entry, no sub-paths
- `resolveProjectRoot()` for all project path resolution (supports `--project` flag)
- Web UI tokens: `DESIGN.md`

## Coding Conventions

- **FTS5**: OR semantics + BM25 ranking. `INSERT OR REPLACE` unsupported → `DELETE` then `INSERT`.
- **New model config field**: 6 coordinated edits across core/cli/web — checklist in `packages/core/AGENTS.md`

## Safety Rails

### NEVER

- Import from `@vein/core` sub-paths
- Log full LLM prompts, messages, responses, or complete document trees

### ALWAYS

- `BEGIN/COMMIT` transactions for multi-table mutations (docs + docs_fts, insertTree + deleteTree)
