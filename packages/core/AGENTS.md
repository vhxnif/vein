# @vein/core

## Architecture Boundaries

SQL lives in `store/` only.

## Coding Conventions

### New Model Config Field — Checklist

6 locations:

1. `config/type.ts` — add `fieldName?: ModelProvider` to `ProjectConfig`
2. `store/migrations/config_schema.ts` — add property to JSON Schema
3. `cli/command/config.command.ts` — display row + menu option + switch case
4. `cli/command/ask.command.ts` — pass `fieldName: config.fieldName` to `searchDocuments()`
5. `web/routes/search.ts` — same as above
6. `librarian.ts` — `buildTools()` and `librarian()` opts, thread to target tool

### ToolMeta

Meta lives alongside `create*Tool()` in the same file. No separate registry. If a tool moves files, its meta moves with it.

### Agent Event Ordering

`beforeToolCall` is async — `tool_execution_start` may fire before it resolves. First tool start log shows `stepCount: 0`. Budget enforcement (synchronous inside `beforeToolCall`) is unaffected.

### Store / DB

Two database clients coexist; using the wrong one breaks transactions or raw SQL:

- **`db`** — Drizzle ORM proxy (lazy singleton, resolves project root at call time). Use for ORM queries, `onConflictDoUpdate`, `onConflictDoNothing`, Drizzle `sql` templates.
- **`getRawClient()`** — Raw SQL wrapper around better-sqlite3. Use for transactions (`BEGIN`/`COMMIT`/`ROLLBACK`), `json_extract`, manual `?` placeholders.

**Transactions must use `getRawClient()`** — `db` is a Proxy over Drizzle and cannot execute raw `BEGIN`/`COMMIT`.

## Traps & Non-Obvious Behaviors

### DeepSeek

- **Structured templates suppress reasoning**: Explicit Markdown section headers make the model fill sections directly. Pure negative constraints ("return JSON") cause long reasoning chains.
- **Agent API vs `call()`**: Both use `complete()` underneath. Output differences come solely from prompt structure.

### Agent Hardening

- **Budget MUST be in `beforeToolCall` hook** with `{ block: true, reason: '...' }` — prompt-level limits are unreliable.
- **`reviewResult` sources**: sub-agent returns `0001: section title`. Use `normalizeNodeId()` to extract numeric prefix.

### Prompt Authoring

- **Don't leak internal constraints**: Model may verbatim repeat prompt text. Use abstract descriptions + `sanitizeAnswer()`.
- **Soft limits become hard limits**: "Suggest ≤5 docs" causes rigid batching. Use "select all possibly-relevant docs in one batch".

### Template Literal Trap

Backtick template literals containing backticks (`` `ref reactive` ``) prematurely close the template. Use guillemets (「」) for code examples inside prompt strings.

## Safety Rails

### NEVER

- Use `db` for raw `BEGIN`/`COMMIT`/`ROLLBACK` transactions
- Use Drizzle `sql` tagged templates inside `getRawClient().execute()` — raw wrapper expects `?` placeholders, not Drizzle SQL fragments

### ALWAYS

- Use `getRawClient()` for multi-statement transactions (see root contract for `BEGIN/COMMIT` rule)
- Use `db` for Drizzle ORM operations (`insert`, `update`, `delete`, `select`)
