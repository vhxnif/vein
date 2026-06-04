import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'

/** Shared business logic: segment + FTS search + enrich metadata */
async function searchDocsByKeyword(
    query: string,
    segmenter?: ModelProvider
): Promise<string> {
    const segmented = segmenter ? await segmentText(query, segmenter) : query
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
