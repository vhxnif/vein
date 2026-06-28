---
name: init
description: >
  Create or supplement AGENTS.md files by scanning project structure,
  config files, and code conventions. Fills the gap between learn
  (session experience) and cleanup (pruning): bootstraps the contract
  from what already exists in the codebase.
---

Analyze the project and create or supplement AGENTS.md files at appropriate
directory levels. This is the **proactive bootstrap** counterpart to the
reactive `learn` (extracts from session experience) and the maintenance
`cleanup` (removes obvious/stale entries).

## When to use

- New project or new package/module without AGENTS.md
- AGENTS.md exists but is missing standard sections (Build And Test,
  Architecture Boundaries, Safety Rails)
- After major refactor that changed build commands, package structure,
  or module boundaries
- User says "create AGENTS.md for this project" or "init AGENTS"

## What it does

1. **Scans** the directory tree for packages, build configs, and entry points
2. **Reads** key files: `package.json`, `tsconfig.json`, build scripts,
   linter config, exports maps, dependency graphs
3. **Infers** architecture boundaries, build/test commands, coding
   conventions from the actual code and config
4. **Writes** AGENTS.md at the appropriate level with only non-obvious
   entries — skips anything the agent can infer by reading the same files

## The filter — what NOT to write

Before writing any entry, ask: *"Can the agent discover this by reading
the codebase?"* If yes, skip it. The init skill reads the same files an
agent would — but it does the work once and records the non-obvious parts.

- ❌ "Uses TypeScript" — obvious from tsconfig.json
- ❌ "Tests with vitest" — obvious from package.json scripts
- ❌ "React SPA with TanStack Router" — obvious from imports
- ✅ "Import only from @vein/core single entry, no sub-paths" — enforced
  but not visible in any single file
- ✅ "6 coordinated changes needed when adding a model config field" —
  cross-cutting, file list not obvious

## Scan checklist

### 1. Project structure
```
find . -maxdepth 3 -type d (excluding node_modules, .git, dist, build)
```
Identify:
- Monorepo packages (workspaces in package.json)
- Entry points (main, exports in each package.json)
- Build output directories

### 2. Build & test commands
Read `package.json` scripts section. Note non-standard commands.
Standard scripts (`build`, `test`, `lint`, `dev`) don't need AGENTS
entries unless the invocation has project-specific quirks.

### 3. Architecture boundaries
- Exports map in `package.json` → import restrictions
- Dependency graph between packages → who imports whom
- Linter rules that enforce boundaries (`no-restricted-imports`, etc.)
- Read parent AGENTS.md first if it exists (don't duplicate)

### 4. Coding conventions
- Linter config (biome.json, .eslintrc) → enforced rules
- Formatter config → style conventions (only non-standard ones)
- Consistent patterns across files (error handling, logging, naming)

### 5. Safety rails
- Trust boundaries (CLI ↔ Core, API ↔ DB)
- Security constraints (never log X, always validate Y)
- Data integrity rules (transactions, migrations)

## Output

For each directory level that needs an AGENTS.md:

```markdown
# Project Contract

## Build And Test
(specific commands — omit standard npm/bun ones)

## Architecture Boundaries
(import rules, module boundaries, package roles)

## Coding Conventions
(non-obvious patterns, co-modification rules)

## Safety Rails
### NEVER
(hard constraints enforced by convention, not tooling)
### ALWAYS
(mandatory patterns)

## Verification
(how to verify changes at this level)
```

Skip sections that would be empty. If a section has only obvious entries,
skip the entire section.

## Coordination with learn and cleanup

```
              init ──→ AGENTS.md (bootstrapped)
                        │
              learn ──→ AGENTS.md (enriched from sessions)
                        │
              cleanup → AGENTS.md (pruned of obvious/stale)
```

- `init` creates the skeleton and seed entries
- `learn` adds entries from session experience
- `cleanup` removes entries that became obvious, stale, or verbose

If an AGENTS.md already exists, `init` supplements missing sections
rather than overwriting. It never removes existing entries — that's
`cleanup`'s job.

## After writing

Summarize:
- Files created or updated
- Sections added per file
- Entries intentionally skipped (obvious from code, deferred to learn)
