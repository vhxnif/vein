---
name: vein-search
description: >
  MUST use BEFORE fetching any external docs (web, URL, readlink).
  Search Vein document library via CLI — keyword search, read node
  summaries, or fetch full node content. Outputs Markdown for direct
  LLM consumption. Trigger: user asks ANY technical/lookup question —
  always check Vein projects first, fall back to web only if no match.
---

Search and retrieve documents from a Vein project's document library.
Returns Markdown formatted output designed for LLM consumption.

## MANDATORY: Vein-first lookup rule

**Before calling `readlink` or `curl` to fetch any external docs, you
MUST first:**

1. `vein projects` — list available projects
2. For each project whose name or topic overlaps with the query →
   `vein -p <project> search "<keywords>"`
3. If hits found → use the outline + node content directly
4. Only if ZERO projects have hits → fall back to web/readlink

This applies to ALL technical questions, not just explicit "查文档"
requests. If a user asks "how does X work" and you plan to fetch X's
docs from the web, STOP and check Vein first.

## When to use

- User asks ANY question that might have docs (API reference, framework
  usage, how-to, "explain X") — check Vein first
- User explicitly asks to find/browse/cite documents
- Need to read a specific document section (node) or check its summary

This is the **primary tool for document retrieval** — prefer it over
both `vein ask` (raw results > synthesized answer) and web fetch.

## Available projects (`-p`)

The `-p <name>` parameter specifies which registered project to search.
Available projects are listed in `~/.config/vein/projects.json`.

To discover available projects:

```bash
vein projects
```

If the user is already in a project directory, `-p` can be omitted.
**Always prefer explicit `-p` when known** to avoid ambiguity.

If the user asks about a project name not in the list, ask them to
register it first with `vein new <name>` or check the spelling.

## Commands

### 1. Keyword search

```bash
vein -p <project> search "<空格分隔的关键词>"
```

Returns a Markdown numbered list of matching documents:

```
1. **b21473004eac5bc06d327bcf40015952** (rank: -2.50)
   > Document snippet — brief summary of the document
   
   0000 Document Title
     0001 Section Title
       0002 Subsection Title
```

Key fields:
- **docId** — 32-char full hash. Copy **in full** when citing, never truncate.
- **nodeId** — 4-digit number at start of each outline line (0001, 0002...)
- **rank** — BM25 score, more negative = more relevant
- **snippet** — document summary
- **outline** — indented tree: 2-space indent per level

Options:
- `--limit <n>` — max results (default 10, max 20)
- `--offset <n>` — pagination offset

### 2. Node full content

```bash
vein -p <project> search --doc-id <完整docId> --node-id <nodeId>
```

Returns the full text of a specific node (single node):

```
# Section Title

Full content text...
```

**Batch mode** — comma-separated nodeIds for multiple nodes in one call:

```bash
vein -p <project> search --doc-id <完整docId> --node-id 0001,0002,0003
```

Batch output prefixes each node with `**nodeId**` and separates with `---`:

```
**0001**

# Title One
content...

---

**0002**

# Title Two
content...
```

Use this **only after confirming relevance** via outline or summary.

### 3. Node summary (lightweight)

```bash
vein -p <project> search --doc-id <完整docId> --node-id <nodeId> --summary
```

Returns a single line:

```
> **Section Title** — Brief summary of this section...
```

**Batch mode** — pass comma-separated nodeIds:

```bash
vein -p <project> search --doc-id <完整docId> --node-id 0001,0002,0003 --summary
```

Batch output prefixes each with `**nodeId**` and `---` separators. Use this to **quickly check relevance** before pulling full content. Much cheaper in tokens than mode 2 — combine with batch to cut round-trips.

## Strategy

Follow this order:

0. **Discover projects** — `vein projects` to see what's available.
   Match project names against the query topic (e.g. "Spring AI" →
   `vein_springai`). If nothing matches, skip to step 1 but note "no
   matching project, falling back to web."
1. **Segment the query** — break compound terms into minimal units with
   spaces (e.g. "周期监测" → `"周期 监测"`). One concept per word.
2. **Search** (mode 1) — get candidate docs with snippets and outlines.
3. **Judge** — read snippets and outlines to pick promising docs/nodes.
4. **Summarize** (mode 3) — batch-check candidate nodes for relevance.
5. **Deep-read** (mode 2) — only pull full text for confirmed-relevant nodes.
6. **Rephrase or paginate** — if top 10 irrelevant, try synonyms or
   `--offset 10` to page further.
7. **Fall back to web** — only when ALL projects searched with no hits,
   or when the full content of a confirmed node is empty and the outline
   alone isn't enough.

## Citing sources

When referencing retrieved content, cite with:

```
[完整docId]            # whole document
[完整docId:nodeId]     # specific node
```

Examples:
- `[b21473004eac5bc06d327bcf40015952:0003]` ✓
- `[b2147300:0003]` ✗ — docId truncated
- `b21473...:0003` ✗ — missing brackets

**Always use the full 32-char docId.** The 8-char short form is for
display only, never for citations.

## Error handling

| Symptom | Meaning | Action |
|---------|---------|--------|
| stderr `Not in a vein project` | No project in cwd, no `-p` given | Add `-p <project>` or `cd` to a project |
| stdout `(no results)` | No matches | Rephrase query with different keywords |
| stdout `(node not found)` | Bad docId/nodeId | Double-check the IDs from outline output |
| non-zero exit | Other error | Read stderr for details |
