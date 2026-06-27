import type { ModelProvider } from '../config/type.ts'
import * as store from '../store/index.ts'
import type { LibrarianResult, TraceStep } from './librarian.ts'

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
    /** Optional model override for the Reviewer sub-agent. */
    reviewerModel?: ModelProvider
    onStep?: (label: string) => void
    signal?: AbortSignal
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
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
    const { librarian } = await import('./librarian.ts')
    const result = await librarian(query, opts?.onStep, {
        reviewerModel: opts?.reviewerModel,
        signal: opts?.signal,
        thinkingLevel: opts?.thinkingLevel,
        onThinkingDelta: opts?.onThinkingDelta,
        onTextDelta: opts?.onTextDelta,
        onToolCallStart: opts?.onToolCallStart,
        onToolCallEnd: opts?.onToolCallEnd,
    })
    const docNames = await resolveDocNames(result.trace)
    return { ...result, docNames }
}

export type { SearchOptions, SearchResult }
export { resolveDocNames, searchDocuments }
