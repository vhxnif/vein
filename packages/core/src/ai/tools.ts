import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'
import type { LibrarianResult, TraceStep } from './librarian'

/**
 * Shared business logic: segment + FTS search + enrich metadata.
 * FTS5 OR semantics (handled in store layer) make the LLM segmentation
 * robust against non-deterministic tokenization.
 */
async function searchDocsByKeyword(
    query: string,
    segmenter?: ModelProvider
): Promise<string> {
    const segmented = await segmentText(query, segmenter)
    const results = await store.searchDocsByKeyword(segmented, 10)

    const enriched = await Promise.all(
        results.map(async (r) => {
            const doc = await store.getDoc(r.docId)
            return {
                docId: r.docId,
                metadata: doc ? JSON.parse(doc.metadata) : {},
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
    onStep?: (label: string) => void
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
    })
    const docNames = await resolveDocNames(result.trace)
    return { ...result, docNames }
}

export type { SearchOptions, SearchResult }
export { resolveDocNames, searchDocsByKeyword, searchDocuments }
