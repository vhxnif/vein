# @vein/core

## Architecture Boundaries

SQL lives in `store/` only.

## Coding Conventions

### New Model Config Field — Checklist

Must touch 6 locations:

1. `config/type.ts` — add `fieldName?: ModelProvider` to `ProjectConfig`
2. `store/migrations/config_schema.ts` — add property to JSON Schema
3. `cli/command/config.command.ts` — display row + menu option + switch case
4. `cli/command/ask.command.ts` — pass `fieldName: config.fieldName` to `searchDocuments()`
5. `web/routes/search.ts` — same as above
6. `librarian.ts` — `buildMainTools()` and `librarian()` opts, thread to target tool

### Budget & Concurrency

| Tier | Agent | Budget |
|------|-------|:---:|
| 1 | SearchScreener | ≤6 |
| 2 | Document Analyzer | ≤10 |
| 3 | Reviewer | — |

- `analyzeDocument` concurrency: `Semaphore(MAX_PARALLEL_ANALYZE=10)`
- Review retries up to 2× on partial/fail verdict
- Budget enforced via `beforeToolCall` hook with `{ block: true }` — prompt-level limits are unreliable

### ToolMeta Pattern

Each `create*Tool()` returns `{ tool, meta }` where `meta: ToolMeta` bundles per-tool formatting (step label, result summary, log detail). No separate registry — meta lives alongside the `create*Tool()` in the same file. **Ownership**: `tools.ts` owns meta for `searchDocsByKeyword`; sub-agent files own meta for their tools. If a tool moves files, its meta moves with it.

### Agent Event Ordering Quirk

`beforeToolCall` is async — the Agent framework may dispatch `tool_execution_start` before it resolves. First tool start log shows `stepCount: 0`. Budget enforcement (synchronous inside `beforeToolCall`) is unaffected.

## Traps & Non-Obvious Behaviors

### DeepSeek Model

- **Structured templates suppress reasoning**: Explicit Markdown section headers (`## 相关性`, `## 概述`...) make the model fill sections directly. Pure negative constraints ("return JSON") cause 6600+ char reasoning chains. Full elimination needs `complete()` with `reasoning: 'low'` or `response_format: json_object`.
- **Agent API vs `call()`**: Both use `complete()` underneath. Output format differences come solely from prompt structure.

### Agent Hardening

- **Budget MUST be in `beforeToolCall` hook** with `{ block: true, reason: '...' }` — prompt-level limits are unreliable.
- **`analyzeDocument` MUST be memoized**: cache by `(docId, userQuery)` via `cached(key, fn)`.
- **`analyzeDocument` MUST be try/catch'd**: failure without fallback kills the session. Catch and return `## 相关性\n\nnone`.
- **`reviewResult` sources**: sub-agent returns `0001: section title`. Use `normalizeNodeId()` to extract numeric prefix before `:` or `_`.
- **`compactAnalyzeResult` must preserve `## 数据来源`**: pruning relevance + summary drops citations.

### Prompt Authoring

- **Don't leak internal constraints**: Model may verbatim repeat prompt text. Use abstract descriptions + `sanitizeAnswer()`.
- **Soft limits become hard limits**: "Suggest ≤5 docs" causes rigid batching. Use "select all possibly-relevant docs in one batch".
- **Example keywords must be self-consistent**: Contradictory examples confuse the model.

### Code Patterns

- **`compactDocText` regex**: `/^\s*\d+\s\S/` (not hardcoded `/^\s*\d{4}\s/`) — nodeId format may change.
- **Cross-cutting types**: `ToolCtx`, `ToolMeta` in `ai/types.ts` — used by librarian, tools, and all sub-agents.

### Template Literal Trap

Backtick template literals with code examples containing backticks (`` `ref reactive` ``) prematurely close the template. Use guillemets (「」) for code examples inside prompt strings.

## Safety Rails

### NEVER

- Export sub-paths from `@vein/core` (only `"."` in exports)
- Put SQL outside `store/`

### ALWAYS

- `cached()` for sub-agent memoization
- Extend `config/type.ts` when adding new model config fields

## Logging

- Output: `~/.config/vein/logs/vein-YYYY-MM-DD.log` (JSON per line, file only)
- `sessionId` = `crypto.randomUUID().slice(0, 8)` ties all logs for one session
