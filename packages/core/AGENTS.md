# @vein/core

All business logic, no UI/CLI dependency. CLI and Web import only from `@vein/core` single entry.

## Architecture Boundaries

```
src/
├── ai/          Agent orchestration: librarian, reviewer, tools
├── config/      Project config, logger, global registry
├── service/     importBatch, history
├── store/       DB schema, client, CRUD, migrations
├── tree/        Markdown → document tree parser
├── utils/       Common helpers, Chinese segmentation
└── index.ts     Single export entry
```

- **All DB operations in `store/`** — nowhere else
- **Single export** — `package.json` `"exports": { ".": "./src/index.ts" }` (no sub-paths)
- **No dependency on CLI or Web**

## AI Agent Architecture

| Tier | Agent | Budget | Tools | Log Module |
|------|-------|:---:|-------|------------|
| 1 | SearchScreener | ≤6 | `searchDocsByKeyword` (embeds `outline`) | `search-screener` |
| 2 | Document Analyzer | ≤10 | `getDocStructure`, `getDocNodeDetails` | `doc-analyzer` |
| 3 | Reviewer | — | `getReviewSource` | `ai` |

- Main Librarian returns `LibrarianResult { content, trace, review? }`
- `analyzeDocument` concurrency: `Semaphore(MAX_PARALLEL_ANALYZE=10)`
- Review retries up to 2x on partial/fail verdict

### Adding a New Model Config Field — Checklist

Must touch 6 locations:

1. `config/type.ts` — add `fieldName?: ModelProvider` to `ProjectConfig`
2. `store/migrations/config_schema.ts` — add property to JSON Schema
3. `cli/command/config.command.ts` — display row + menu option + switch case
4. `cli/command/ask.command.ts` — pass `fieldName: config.fieldName` to `searchDocuments()`
5. `web/routes/search.ts` — same as above
6. `librarian.ts` — `buildMainTools()` and `librarian()` opts, thread to target tool

### Agent Event Ordering Quirk

`beforeToolCall` is async — the Agent framework may dispatch `tool_execution_start` before it resolves. First tool start log shows `stepCount: 0` instead of `1`. Budget enforcement (synchronous inside `beforeToolCall`) is unaffected. This is framework behavior, consistent across all sub-agents.

## Traps & Non-Obvious Behaviors

### DeepSeek Model

- **Structured templates suppress reasoning**: Sub-agent success comes from explicit Markdown section headers (`## 相关性`, `## 概述`...). The model fills sections directly without preamble. Pure negative constraints ("return JSON") cause 6600+ char reasoning chains.
- **Pure prompt cannot fully eliminate DeepSeek reasoning**: Even with "first char must be `{`", ~1600 chars of preamble remain. Full elimination needs `complete()` with `reasoning: 'low'` or `response_format: json_object`.
- **Agent API vs `call()`**: Both use `complete()` underneath. Output format differences come solely from prompt structure.

### Agent Hardening

- **Main Agent budget MUST be enforced in code**: Prompt-level limits ("max 40 steps / 3 reviews") are unreliable. Use `beforeToolCall` hook with `{ block: true, reason: '...' }`.
- **`analyzeDocument` MUST use memoization**: Cache by `(docId, userQuery)` via `cached(key, fn)`. Prompt-level "don't re-analyze" is unreliable.
- **`analyzeDocument` MUST be try/catch**'d: Sub-agent failure without fallback kills the entire librarian session. Catch and return `## 相关性\n\nnone` placeholder.
- **`reviewResult` sources must extract pure nodeId**: Sub-agent returns `0001: section title`. Reviewer's `getReviewSource` needs `0001`. Use `normalizeNodeId()` to extract the first token before `:` or `_`.
- **Preserve `## 数据来源` during context pruning**: `pruneContext` that keeps only relevance + summary loses nodeId citations → final answer missing citations, reviewer missing sources. `compactAnalyzeResult` must also extract `## 数据来源` node list.

### Prompt Authoring

- **Don't leak internal constraints**: Model may verbatim repeat prompt text in output. Use abstract descriptions + `sanitizeAnswer()` post-processing.
- **Soft limits become hard limits**: "Suggest ≤5 docs" causes rigid 5+5 batching → extra LLM round-trip. Use "select all possibly-relevant docs in one batch, do not split".
- **Example keywords must be self-consistent**: "ref reactive 区别" contradicts "禁止将意图词作为关键词" in the same prompt. Use "ref reactive".

### Code Patterns

- **`compactDocText` regex**: Use `/^\s*\d+\s+\S/` instead of hardcoded `/^\s*\d{4}\s/` — nodeId format may change.

### Template Literal Trap

In `librarian.ts` `PROMPT` (backtick template literal), code examples with backticks (e.g. `` `ref reactive` ``) prematurely close the template. Use guillemets (「」) or other symbols for code examples inside prompt strings.

## Safety Rails

### NEVER

- Export sub-paths from `@vein/core` (only `"."` in exports)
- Put SQL outside `store/`
- Skip `BEGIN/COMMIT` for multi-table mutations (docs + docs_fts, insertTree + deleteTree)
- Log full LLM prompts, messages, responses, or complete document trees
- Use `INSERT OR REPLACE` on FTS5 tables — always `DELETE` then `INSERT`
- Rely on prompt-level constraints for Agent budget or deduplication — always enforce in code

### ALWAYS

- Use `logger.child({ module: 'xxx' })` for module-scoped logging
- Use `resolveProjectRoot()` for all project path resolution
- Wrap `analyzeDocument` in try/catch with placeholder fallback
- Use `cached()` for sub-agent memoization
- Run `beforeToolCall` hook for hard budget limits on Agents
- Extend `config/type.ts` when adding new model configuration fields

## Logging

- Output: file only `~/.config/vein/logs/vein-YYYY-MM-DD.log` (JSON per line, `sync: true`)
- Create: `logger.child({ module: 'xxx' })` from `import { logger } from '@vein/core'`
- Use structured objects — `log.info({ docId, content: 'description' })`; avoid variable interpolation in `msg`
- `sessionId` (`crypto.randomUUID().slice(0, 8)`) ties all logs for one ask session
- Never log full LLM prompt/messages/response; log summaries only (`resultSummary` + `resultLen`)

## Compact Instructions

Preserve:

1. 6-location checklist for new model config fields
2. NEVER/ALWAYS rules — keep list intact
3. Agent traps: memoization, try/catch, nodeId extraction, context pruning
4. DeepSeek behavior notes (structured templates, reasoning suppression)
5. Logging constraints (file-only, no full LLM content)
