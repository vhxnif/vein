import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'

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

export { searchDocsByKeyword }
