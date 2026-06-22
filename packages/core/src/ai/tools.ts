import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'
import type { LibrarianResult, TraceStep } from './librarian'
import { ellipsis } from './sub-agents/utils'
import type { ToolMeta } from './types'

// ── Tool metadata ─────────────────────────────────────────────

export const SEARCH_DOCS_BY_KEYWORD_META: ToolMeta = {
    stepLabel: (a) => `Searching: "${ellipsis(String(a.query ?? ''), 36)}"...`,
    resultLabel: (text) => {
        try {
            const parsed = JSON.parse(text) as Array<{ snippet?: string }>
            if (Array.isArray(parsed) && parsed.length > 0) {
                const snippets = parsed
                    .map((d) => d.snippet ?? '')
                    .filter(Boolean)
                if (snippets.length > 0) {
                    const preview = snippets
                        .slice(0, 3)
                        .map((s) => ellipsis(s, 40))
                        .join(', ')
                    return `Found ${parsed.length} result${parsed.length > 1 ? 's' : ''}: ${preview}${snippets.length > 3 ? '...' : ''}`
                }
                return `Found ${parsed.length} results`
            }
        } catch {
            // ignore
        }
        return undefined
    },
    resultSummary: (raw) => {
        try {
            const parsed = JSON.parse(raw) as Array<{ snippet?: string }>
            if (Array.isArray(parsed)) {
                const snippets = parsed
                    .map((d) => d.snippet ?? '')
                    .filter(Boolean)
                const head = snippets
                    .slice(0, 3)
                    .map((s) => ellipsis(s, 40))
                    .join(', ')
                return `${parsed.length} docs: ${head}${snippets.length > 3 ? '…' : ''}`
            }
        } catch {
            // ignore
        }
        return raw.slice(0, 200)
    },
    logDetail: (a) => `"${String(a.query ?? '')}"`,
}

// ── Functions ─────────────────────────────────────────────────

/**
 * Shared business logic: segment + FTS search (OR semantics) + enrich metadata.
 */
async function searchDocsByKeyword(
    query: string,
    segmenter?: ModelProvider,
    limit = 10,
    offset = 0
): Promise<string> {
    const segmented = await segmentText(query, segmenter)
    const results = await store.searchDocsByKeyword(segmented, limit, offset)

    const enriched = await Promise.all(
        results.map(async (r) => {
            let snippet = ''
            try {
                const rootNode = await store.getNodeDetails<{
                    summary?: string
                    prefixSummary?: string
                }>(`0000_${r.docId}`)
                snippet = rootNode?.summary ?? rootNode?.prefixSummary ?? ''
            } catch {
                // best-effort, snippet is optional for filtering
            }
            return {
                docId: r.docId,
                snippet,
                rank: r.rank,
            }
        })
    )
    return JSON.stringify(enriched)
}

/**
 * Resolve doc IDs in a trace to human-readable document names.
 * Returns a map of docId → doc name (or short ID fallback).
 */
async function resolveDocNames(
    trace: TraceStep[]
): Promise<Map<string, string>> {
    const docIds = new Set<string>()
    for (const s of trace) {
        const docId = (s.args as { docId?: string })?.docId
        if (docId) docIds.add(docId)
    }
    const map = new Map<string, string>()
    await Promise.all(
        [...docIds].map(async (id) => {
            const doc = await store.getDoc(id)
            if (doc) {
                try {
                    const meta = JSON.parse(doc.metadata) as {
                        title?: string
                    }
                    map.set(id, meta.title ?? id.slice(0, 8))
                } catch {
                    map.set(id, id.slice(0, 8))
                }
            } else {
                map.set(id, id.slice(0, 8))
            }
        })
    )
    return map
}

type SearchOptions = {
    segmenter?: ModelProvider
    subagentModel?: ModelProvider
    reviewerModel?: ModelProvider
    searchAgentModel?: ModelProvider
    onStep?: (label: string) => void
    signal?: AbortSignal
    /** Thinking/reasoning level for the main agent. */
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    /** Streaming callbacks for real-time LLM output (web UI). */
    onThinkingDelta?: (delta: string) => void
    onTextDelta?: (delta: string) => void
    onToolCallStart?: (
        toolCallId: string,
        toolName: string,
        label: string
    ) => void
    onToolCallEnd?: (
        toolCallId: string,
        toolName: string,
        summary: string
    ) => void
    /** Retrieval mode: 'default' uses analyze+review pipeline, 'raw' extracts raw fragments for the main agent to summarize. */
    mode?: 'default' | 'raw'
}

type SearchResult = LibrarianResult & {
    docNames: Map<string, string>
}

/**
 * Full search pipeline: librarian query + automatic doc name resolution.
 * CLI/web modules should use this instead of calling librarian directly.
 */
async function searchDocuments(
    query: string,
    opts?: SearchOptions
): Promise<SearchResult> {
    const { librarian } = await import('./librarian')
    const result = await librarian(query, opts?.onStep, {
        segmenter: opts?.segmenter,
        subagentModel: opts?.subagentModel,
        reviewerModel: opts?.reviewerModel,
        searchAgentModel: opts?.searchAgentModel,
        signal: opts?.signal,
        thinkingLevel: opts?.thinkingLevel,
        onThinkingDelta: opts?.onThinkingDelta,
        onTextDelta: opts?.onTextDelta,
        onToolCallStart: opts?.onToolCallStart,
        onToolCallEnd: opts?.onToolCallEnd,
        mode: opts?.mode,
    })
    const docNames = await resolveDocNames(result.trace)
    return { ...result, docNames }
}

export type { SearchOptions, SearchResult }
export { resolveDocNames, searchDocsByKeyword, searchDocuments }
