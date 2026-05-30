import { Type } from '@earendil-works/pi-ai'
import type { ModelProvider } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'
import type { ToolDef } from './base'
import { generateEmbedding } from './embedding'

function makeSearchSimilarTagsTool(embeddingProvider: ModelProvider): ToolDef {
    return {
        name: 'searchSimilarTags',
        description:
            '将查询文本转为语义向量并结合关键词匹配，在标签库中搜索最相似的标签。返回 [{tagId, tag, similarity}]，按相似度降序。' +
            '可用于：1) 快速定位与查询语义相关的标签，跳过分类浏览（不传 categoryId）；2) 在指定分类下检查是否有等价已有标签（传 categoryId）。',
        parameters: Type.Object({
            query: Type.String({ description: '要搜索的查询文本或标签名' }),
            categoryId: Type.Optional(
                Type.String({
                    description: '限定搜索的分类 ID，不传则全库搜索',
                })
            ),
        }),
        run: async ({
            query,
            categoryId,
        }: {
            query: string
            categoryId?: string
        }) => {
            // Run vec0 embedding search and FTS5 keyword search in parallel
            // Note: tags_fts uses trigram tokenizer, so we pass raw query (not segmented)
            const [vecResults, keywordResults] = await Promise.all([
                (async () => {
                    try {
                        const emb = await generateEmbedding(
                            query,
                            embeddingProvider
                        )
                        return categoryId
                            ? await store.searchSimilarTags(
                                  emb,
                                  categoryId,
                                  10,
                                  0.6
                              )
                            : await store.searchAllSimilarTags(emb, 10, 0.6)
                    } catch {
                        return []
                    }
                })(),
                store.searchTagsByKeyword(query, 10),
            ])

            // Merge: union by tagId, keep max similarity
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

            const sorted = [...merged.values()].sort(
                (a, b) => b.similarity - a.similarity
            )
            return JSON.stringify(sorted)
        },
    }
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
