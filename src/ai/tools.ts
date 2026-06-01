import { Type } from '@earendil-works/pi-ai'
import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'
import type { ToolDef } from './base'
import { generateEmbeddings } from './embedding'

function makeSearchSimilarTagsTool(embeddingProvider: ModelProvider): ToolDef {
    return {
        name: 'searchSimilarTags',
        description:
            '批量检查候选标签是否已在标签库中存在。传入 queries（候选标签名列表），一次性查询所有标签的相似已有标签。' +
            '返回 [{tagId, tag, similarity}]，按相似度降序。建议先确定所有候选标签，然后一次性调用此工具批量检查。',
        parameters: Type.Object({
            queries: Type.Array(Type.String({ description: '候选标签名' })),
        }),
        run: async ({ queries }: { queries: string[] }) => {
            if (queries.length === 0) return JSON.stringify([])

            // Batch generate embeddings for all queries (single API call)
            let allEmbeddings: number[][]
            try {
                allEmbeddings = await generateEmbeddings(
                    queries,
                    embeddingProvider
                )
            } catch {
                // Embedding failed — fall back to keyword search only
                const kwResults = await Promise.all(
                    queries.map((q) => store.searchTagsByKeyword(q, 10))
                )
                return mergeAndDedup(kwResults)
            }

            // For each query, run vec0 search and FTS5 keyword search in parallel
            const allResults = await Promise.all(
                queries.map(async (query, i) => {
                    const emb = allEmbeddings[i]!
                    const [vecResults, keywordResults] = await Promise.all([
                        store
                            .searchAllSimilarTags(emb, 10, 0.6)
                            .catch(() => []),
                        store.searchTagsByKeyword(query, 10),
                    ])

                    // Merge vec + keyword for this query
                    const merged = new Map<
                        string,
                        { tagId: string; tag: string; similarity: number }
                    >()
                    for (const r of vecResults) {
                        merged.set(r.tagId, r)
                    }
                    for (const r of keywordResults) {
                        const existing = merged.get(r.tagId)
                        if (!existing || r.similarity > existing.similarity) {
                            merged.set(r.tagId, r)
                        }
                    }
                    return [...merged.values()]
                })
            )

            return mergeAndDedup(allResults)
        },
    }
}

function mergeAndDedup(
    allResults: Array<Array<{ tagId: string; tag: string; similarity: number }>>
): string {
    const merged = new Map<
        string,
        { tagId: string; tag: string; similarity: number }
    >()
    for (const results of allResults) {
        for (const r of results) {
            const existing = merged.get(r.tagId)
            if (!existing || r.similarity > existing.similarity) {
                merged.set(r.tagId, r)
            }
        }
    }
    const sorted = [...merged.values()].sort(
        (a, b) => b.similarity - a.similarity
    )
    return JSON.stringify(sorted)
}

function makeSearchDocsByKeywordTool(): ToolDef {
    return {
        name: 'searchDocsByKeyword',
        description:
            '通过关键词在文档摘要中搜索相关文档。返回 [{docId, metadata, rank}]，按匹配度降序。' +
            '适用于：用户查询包含具体关键词时，快速定位相关文档，跳过分类→标签的逐层浏览。',
        parameters: Type.Object({
            query: Type.String({ description: '搜索关键词' }),
        }),
        run: async ({ query }: { query: string }) => {
            const segmented = await segmentText(query)
            const results = await store.searchDocsByKeyword(segmented, 10)

            // Enrich with doc metadata
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
        },
    }
}

export { makeSearchDocsByKeywordTool, makeSearchSimilarTagsTool }
