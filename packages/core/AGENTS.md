# @vein/core

## Build And Test

- No dedicated build or tests — consumed as TypeScript source via `workspace:*`; smoke-tested through CLI and Web packages.

## Architecture Boundaries

- SQL lives in `store/` only.

## Coding Conventions

### New Model Config Field — Checklist

6 locations (paths repo-root-relative):

1. `packages/core/src/config/type.ts` — add `fieldName?: ModelProvider` to `ProjectConfig`
2. `packages/core/src/store/migrations/config_schema.ts` — add property to `configSchema`
3. `packages/cli/src/command/config.command.ts` — display row + menu option + switch case
4. `packages/cli/src/command/ask.command.ts` — pass `fieldName: config.fieldName` to `searchDocuments()`
5. `packages/web/src/routes/search.ts` — same as above
6. `packages/core/src/ai/librarian.ts` — `buildTools()` and `librarian()` opts, thread to target tool

### ToolMeta

`ToolMeta` consts live alongside their tool assembly in the same file (`SEARCH_DOCS_META`, `GET_REVIEW_SOURCE_META`). No registry module; `buildTools()` collects them.

### Store / DB

Two database clients coexist; wrong choice breaks transactions or raw SQL:

- **`db`** — Drizzle ORM proxy over `bun:sqlite` (lazy singleton, resolves project root at call time). Use for ORM queries, `onConflictDoUpdate`/`DoNothing`, Drizzle `sql` templates.
- **`getRawClient()`** — raw SQL wrapper over `bun:sqlite`. Use for transactions (`BEGIN`/`COMMIT`/`ROLLBACK`), `json_extract`, manual `?` placeholders.

**`db` cannot run raw `BEGIN`/`COMMIT`** — it's a Drizzle proxy. Multi-statement transactions require `getRawClient()`; ORM ops require `db`. Never feed Drizzle `sql` templates into `getRawClient().execute()` (expects `?` placeholders).

## Traps & Non-Obvious Behaviors

### Agent instrumentation

- `beforeToolCall` is async — `tool_execution_start` may log before it resolves; first tool-start log shows `stepCount: 0`. Budget enforcement (synchronous inside the hook) is unaffected.
- **Budget must live in the `beforeToolCall` hook** with `{ block: true, reason }` — prompt-level limits are unreliable.
- Reviewer sub-agent ids are `0001: section title` — use `normalizeNodeId()` for the numeric prefix.

### DeepSeek prompting

- Explicit Markdown section headers make the model fill sections directly; pure negative constraints ("return JSON") cause long reasoning chains.
- `Agent` API and `call()` share `complete()` underneath — output differences come from prompt structure alone.
- Don't echo internal constraints in prompts (model may repeat them verbatim) — abstract descriptions + `sanitizeAnswer()`.
- Soft limits become hard limits ("suggest ≤5 docs" → rigid batching). Use "select all possibly-relevant docs in one batch".

### Template literals

Backtick template literals containing raw backticks close the template early — escape them (`\``) inside prompt strings, as in the reviewer prompt.

## Safety Rails

### NEVER

- Use `db` for raw `BEGIN`/`COMMIT`/`ROLLBACK` transactions
- Use Drizzle `sql` tagged templates inside `getRawClient().execute()`

### ALWAYS

- `getRawClient()` for multi-statement transactions (see root contract)
- `db` for Drizzle ORM operations (`insert`, `update`, `delete`, `select`)
