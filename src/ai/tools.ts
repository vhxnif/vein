import { Type } from '@earendil-works/pi-ai'
import type { ModelProvider } from '../config'
import * as store from '../store'
import type { ToolDef } from './base'
import { generateEmbedding } from './embedding'

function makeSearchSimilarTagsTool(embeddingProvider: ModelProvider): ToolDef {
    return {
        name: 'searchSimilarTags',
        description:
            '将查询文本转为语义向量，在标签库中搜索最相似的标签。返回 [{tagId, tag, similarity}]，按相似度降序。' +
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
            const emb = await generateEmbedding(query, embeddingProvider)
            const similar = categoryId
                ? await store.searchSimilarTags(emb, categoryId, 10, 0.6)
                : await store.searchAllSimilarTags(emb, 10, 0.6)
            return JSON.stringify(similar)
        },
    }
}

export { makeSearchSimilarTagsTool }
