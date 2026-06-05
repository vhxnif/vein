import type { ModelProvider } from '../config'
import { logger } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'

const log = logger.child({ module: 'tools' })

/**
 * Fallback: split CJK text into individual characters separated by spaces,
 * keeping ASCII/numbers intact. This matches FTS5 unicode61's per-character
 * tokenization of unsegmented CJK runs.
 */
function charSplit(text: string): string {
    return text
        .replace(/([\u4e00-\u9fff])/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim()
}

/** Shared business logic: segment + FTS search + enrich metadata */
async function searchDocsByKeyword(
    query: string,
    segmenter?: ModelProvider
): Promise<string> {
    const segmented = await segmentText(query, segmenter)
    let results = await store.searchDocsByKeyword(segmented, 10)

    // If LLM segmentation produced 0 results, fall back to character-level
    // split. FTS5 unicode61 treats unsegmented CJK as individual chars, so
    // char-split tokens always have a chance to match the indexed word tokens.
    if (results.length === 0) {
        const fallback = charSplit(query)
        if (fallback !== segmented) {
            log.warn({
                query,
                segmented,
                fallback,
                content:
                    'Segmented search returned 0 results, retrying char-split',
            })
            results = await store.searchDocsByKeyword(fallback, 10)
        }
    }

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
