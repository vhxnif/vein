# Project Contract

## Build And Test

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run check` | Typecheck (tsc --noEmit) |
| `bun run lint` | Lint (Biome) |
| `bun run format` | Format (Biome) |
| `bun run build` | Build CLI + Web |
| `bun run dev:web` | Dev server |

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

### Key Directories

```
packages/core/src/
  ai/          Agent orchestration (librarian, reviewer, tools)
  config/      Project config, logger, global registry
  service/     Import pipeline, history
  store/       DB schema, client, CRUD, migrations
  tree/        Markdown → document tree parser
  utils/       Common helpers, Chinese segmentation

packages/cli/src/command/   One file per command, exports register(program)
packages/web/src/routes/    Hono API routes (thin wrappers around core)
packages/web/src/client/    React SPA (TanStack Router + Query)
```

## Data Model

| Table | Purpose |
|-------|---------|
| `nodes` + `tree_closure` | Document tree (closure table for ancestor/descendant) |
| `docs` | Document entities (id = md5(content)) |
| `docs_fts` | FTS5 unicode61 virtual table; content segmented via `segmentText()` then space-joined |
| `model_cache` | LLM response cache; `(md5, model)` unique; `ON CONFLICT DO UPDATE` upsert |

**FTS5 query behavior**: AND-first, fallback to OR on zero results. BM25 ranking, k=10. FTS5 does not support `INSERT OR REPLACE` by business key → always `DELETE` then `INSERT`.

## Librarian Retrieval

Main Agent spawns sub-agents in 3 tiers:

| Step | Tool | Sub-Agent | Budget | Notes |
|------|------|-----------|:---:|-------|
| 1 | `searchDocuments(query)` | SearchScreener | ≤6 | Keyword search + snippet/outline filtering |
| 2 | `analyzeDocument(docId, query)` | Document Analyzer | ≤10 | Deep analysis per doc; max 10 concurrent via Semaphore |
| 3 | `reviewResult` | Reviewer | — | Verifies sources via `getReviewSource` |

- Return type: `LibrarianResult { content, trace: TraceStep[], review?: ReviewResult }`
- `reviewResult` retries up to 2x on partial/fail verdict

## Project Config

All per-project, stored in `.vein/config.json`. Fields:

| Field | Purpose |
|-------|---------|
| `model` | Primary AI model (fallback for all sub-roles) |
| `summarizer` | Document summarization model |
| `segmenter` | Chinese word segmentation model |
| `subagent` | Document Analyzer sub-agent model |
| `reviewer` | Reviewer verification model |
| `searchAgent` | SearchScreener filtering model |
| `db` | SQLite file path |
| `name` | Project name |

**Adding a new model config field** requires 6 changes (see `packages/core/AGENTS.md` for checklist).

## Global Project Registry

`~/.config/vein/projects.json` maps project names to absolute paths. `resolveProjectRoot()` checks `--project` flag first, then walks up the directory tree. All project-relative operations (DB, config, history) use `resolveProjectRoot()`.

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
- Schema changes: run affected migrations on a test project

## Compact Instructions

Preserve when compressing:

1. Architecture boundaries (monorepo table, import rules) — do not summarize away
2. Modified files and their package ownership
3. Current verification status (pass/fail for check + lint)
4. Open risks, TODOs, rollback notes
5. NEVER/ALWAYS rules — keep the list intact
