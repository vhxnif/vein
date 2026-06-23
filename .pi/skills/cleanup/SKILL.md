---
name: cleanup
description: Clean up and simplify AGENTS.md files — remove obvious, verbose, duplicated, or misplaced content
---

Review all AGENTS.md files in the project and simplify them to the essentials.

AGENTS.md is a **collaboration contract**, not a knowledge base. Every line must earn its place: the agent should not be able to infer it from reading the codebase, and it must hold true every session.

## What to remove

- **Obvious facts** the agent can infer by reading the codebase or standard documentation
- **Vague principles** like "write clean code", "follow best practices"
- **Verbose explanations** — condense to 1-3 direct lines per insight
- **Duplicates** already stated in a parent-level AGENTS.md (child inherits parent)
- **Low-frequency task knowledge** → flag for migration to Skills
- **Full API docs, background introductions, historical context** → flag for migration to Skills
- **Stale or outdated** rules that no longer apply

## What to keep

Only entries that:
- Cannot be discovered by reading the codebase
- Are true for every session (not situational)
- Are actionable (specific commands, constraints, rules)

## Restructuring

If an AGENTS.md lacks clear sections, restructure it to:

```markdown
# Project Contract

## Build And Test

## Architecture Boundaries

## Coding Conventions

## Safety Rails
### NEVER
### ALWAYS

## Verification
```

Merge related entries into the appropriate section. Remove sections that end up empty.

## Process

1. Find and read all AGENTS.md files in the project (`find . -name AGENTS.md`)
2. For each entry, apply the test: "Can the agent infer this from code? Must it hold every session?"
3. Remove entries that fail; condense verbose ones to 1-3 lines
4. Strip duplicates between parent and child AGENTS.md (child only states what differs from parent)
5. Flag entries that should move to Skills instead
6. Restructure remaining content into the standard sections

After cleanup, summarize:
- Files modified
- Entries removed (grouped by reason)
- Entries condensed
- Entries suggested for migration to Skills
