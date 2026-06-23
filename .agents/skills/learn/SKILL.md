---
name: learn
description: Extract non-obvious learnings from session to AGENTS.md files to build codebase understanding
---

Analyze this session and extract non-obvious learnings to add to AGENTS.md files.

AGENTS.md is a **collaboration contract** between you and the project — not a knowledge base, not team documentation. It should only contain things that must hold true for every session. The best heuristic: start empty, and only add something when you find yourself repeating it across sessions.

## Where to place learnings

AGENTS.md files can exist at any directory level. When an agent reads a file, any AGENTS.md in parent directories are automatically loaded into context. Place learnings as close to the relevant code as possible:

- Project-wide learnings → root AGENTS.md
- Package/module-specific → `packages/foo/AGENTS.md`
- Feature-specific → `src/auth/AGENTS.md`

## What to capture

Only non-obvious discoveries — things agent cannot infer by reading the codebase:

- **Build, test, run commands** not in README or package.json scripts
- **Key directory structure & module boundaries** — which packages import from which, where certain logic must live
- **Non-obvious configuration, env vars, flags** — undocumented settings, environment pitfalls
- **Execution paths that differ from how code appears** — hidden relationships between files or modules
- **Debugging breakthroughs** when error messages were misleading
- **API/tool quirks and workarounds**
- **Architectural decisions and constraints**
- **Files that must change together** (co-modification rules)
- **NEVER/ALWAYS rules** — safety rails that must be followed every session

## What NOT to include

- Obvious facts from documentation or things agent can infer by reading the repo
- Standard language/framework behavior
- Vague principles like "write high-quality code"
- Full API docs or large background introductions → put these in Skills instead
- Low-frequency task knowledge → put these in Skills instead
- Things already documented in an AGENTS.md at the same or parent level
- Session-specific details or verbose explanations

## Format

Keep each entry to 1-3 lines. Prefer direct, imperative statements over prose. Use the project's existing AGENTS.md structure as a template. For new files, follow this structure:

```markdown
# Project Contract

## Build And Test
(commands)

## Architecture Boundaries
(import rules, module boundaries)

## Coding Conventions
(style, naming, patterns)

## Safety Rails
### NEVER
### ALWAYS

## Verification
(how to verify changes)
```

## Process

1. Review the session for discoveries, errors that took multiple attempts, unexpected connections
2. Determine scope — what directory does each learning apply to?
3. Read existing AGENTS.md files at relevant levels
4. Create or update AGENTS.md at the appropriate level
5. Keep entries minimal — if unsure whether something belongs, leave it out

After updating, summarize which AGENTS.md files were created/updated and how many learnings per file.
