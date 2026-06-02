import { logger } from '../config'
import type { ModelProvider } from '../config/type'
import * as store from '../store'
import { md5 } from '../utils/common'
import { call } from './base'
import { generateEmbedding } from './embedding'
import { makeSearchSimilarTagsTool } from './tools'

const log = logger.child({ module: 'tagger' })

type CategoryDef = {
    id: string
    name: string
}

type CategoryTags = {
    id: string
    tags: string[]
}

type TaggerResult = {
    categories: CategoryTags[]
}

type TagStats = {
    tagCount: number
    categoryCount: number
}

type TagProgress = {
    phase: 'loading' | 'analyzing' | 'saving'
    saved?: number
    total?: number
}

const MAX_TAGS_PER_CATEGORY = 5

function buildPrompt(
    categories: CategoryDef[],
    existingTags: Map<string, string[]>,
    hasTools: boolean
) {
    const categoryLines = categories.map((c) => {
        const preferred = existingTags.get(c.id)
        const tagHint =
            preferred && preferred.length > 0
                ? `\n  已有标签（优先使用）：${preferred.slice(0, 20).join('、')}`
                : ''
        return `- ${c.id}: ${c.name}${tagHint}`
    })

    const toolInstructions = hasTools
        ? `\n你可以使用 searchSimilarTags 工具来批量检查候选标签是否已存在：\n- 传入 queries（候选标签名数组）可一次性检查多个标签\n- 返回所有匹配的已有标签，按相似度降序\n建议：先列出所有候选标签，然后一次性调用 searchSimilarTags 批量检查。\n如果返回的相似度 > 0.8，直接复用已有标签，不要创建新标签。\n`
        : ''

    return `你是一个标签提取与分类助手。根据用户提供的文章概要，完成两项任务：
1. 提取出最相关的标签（关键词），每个标签1-5字
2. 将每个标签归属到最匹配的分类下

可选分类如下：
${categoryLines.join('\n')}
${toolInstructions}
要求：
- 优先使用分类下已有的标签；仅在概念确实全新时才创建新标签
- 一个标签只能归属一个分类，一个分类下最多 ${MAX_TAGS_PER_CATEGORY} 个标签
- 如果某个分类没有匹配的标签，不要出现在结果中
- 返回JSON对象，格式如下：
  {"categories": [{"id": "cat_000", "tags": ["标签1", "标签2"]}, {"id": "cat_500", "tags": ["标签3"]}]}
- 只返回JSON，不要有其他内容`
}

// ── Core tagger (with optional cache) ─────────────────────────

async function tagger(
    summary: string,
    categories: CategoryDef[],
    opts?: {
        modelKey?: string
        existingTags?: Map<string, string[]>
        embeddingProvider?: ModelProvider
        structure?: string
    }
): Promise<TaggerResult> {
    const existing = opts?.existingTags ?? new Map()
    const tools = opts?.embeddingProvider
        ? [makeSearchSimilarTagsTool(opts.embeddingProvider)]
        : undefined
    const systemPrompt = buildPrompt(categories, existing, !!tools)

    const userContent = opts?.structure
        ? `## 文章概要\n${summary}\n\n## 文章结构\n${opts.structure}`
        : summary

    // Cache key from stable inputs only (excludes existingTags which
    // change over time — same summary+structure should hit cache
    // regardless of when imported).
    const toolsSuffix = tools ? '|tools' : ''
    const cacheKey = opts?.modelKey
        ? md5(
              JSON.stringify(categories) +
                  summary +
                  (opts.structure ?? '') +
                  toolsSuffix
          )
        : undefined

    // Cache read
    if (cacheKey && opts?.modelKey) {
        const cached = await store.getCachedResponse(cacheKey, opts.modelKey)
        if (cached) {
            log.info({
                cacheKey: cacheKey.slice(0, 16),
                content: 'Tag cache hit',
            })
            try {
                const parsed = JSON.parse(cached) as TaggerResult
                // Only use cache if result is valid (non-empty categories)
                if (parsed.categories && parsed.categories.length > 0) {
                    return parsed
                }
                log.warn({
                    cacheKey: cacheKey.slice(0, 16),
                    content: 'Tag cache result invalid (empty), will re-tag',
                })
            } catch {
                log.warn({
                    cacheKey: cacheKey.slice(0, 16),
                    content: 'Tag cache parse failed, will re-tag',
                })
            }
        }
    }

    const { content } = await call({
        systemPrompt,
        tools,
        messages: [
            {
                role: 'user',
                content: userContent,
                timestamp: Date.now(),
            },
        ],
    })
    const rawText = content.findLast((it) => it.type === 'text')?.text ?? '{}'
    // Extract JSON object from response (may contain markdown fences + explanation text)
    const jsonMatch = rawText.match(/\{[\s\S]*"categories"[\s\S]*\}/)
    const text = jsonMatch ? jsonMatch[0] : rawText
    let result: TaggerResult
    try {
        result = JSON.parse(text) as TaggerResult
    } catch {
        result = { categories: [] }
    }

    // Cache write — only cache valid (non-empty) results
    if (cacheKey && opts?.modelKey && result.categories.length > 0) {
        await store.setCachedResponse(
            cacheKey,
            opts.modelKey,
            JSON.stringify(result)
        )
        log.info({
            cacheKey: cacheKey.slice(0, 16),
            content: 'Tag result cached',
        })
    }

    return result
}

// ── Full pipeline: categories → tagger → persist ──────────────

async function extractAndSaveTags(
    docId: string,
    summary: string,
    modelKey: string,
    embeddingProvider?: ModelProvider,
    onProgress?: (progress: TagProgress) => void,
    structure?: string
): Promise<TagStats> {
    onProgress?.({ phase: 'loading' })

    const [categoryRows, existingTags] = await Promise.all([
        store.getCategories(),
        store.getAllTagsGrouped(),
    ])
    const categories: CategoryDef[] = categoryRows.map((c) => ({
        id: c.id,
        name: c.content,
    }))

    onProgress?.({ phase: 'analyzing' })

    const result = await tagger(summary, categories, {
        modelKey,
        existingTags,
        embeddingProvider,
        structure,
    })

    return saveTagResult(docId, result, embeddingProvider, onProgress)
}

// ── Save helper: persists tagger result, used by parallel batch ──

async function saveTagResult(
    docId: string,
    result: TaggerResult,
    embeddingProvider?: ModelProvider,
    onProgress?: (progress: TagProgress) => void
): Promise<TagStats> {
    const totalTags = result.categories.reduce(
        (sum, c) => sum + c.tags.length,
        0
    )
    let tagCount = 0

    onProgress?.({ phase: 'saving', saved: 0, total: totalTags })

    for (const cat of result.categories) {
        for (const tagName of cat.tags) {
            const tag = await store.upsertTag(tagName)
            await store.insertDocTag(tag.id, docId)
            await store.insertCategorieTag(cat.id, tag.id)

            if (embeddingProvider) {
                const alreadyEmbedded = await store.hasTagEmbedding(tag.id)
                if (!alreadyEmbedded) {
                    generateEmbedding(tag.tag, embeddingProvider)
                        .then((emb) => store.upsertTagEmbedding(tag.id, emb))
                        .catch((err) =>
                            log.warn({
                                err,
                                tagId: tag.id,
                                tag: tag.tag,
                                content: 'Failed to generate tag embedding',
                            })
                        )
                }
            }

            tagCount++
            if (totalTags > 1) {
                onProgress?.({
                    phase: 'saving',
                    saved: tagCount,
                    total: totalTags,
                })
            }
        }
    }

    return { tagCount, categoryCount: result.categories.length }
}

export type { CategoryDef, CategoryTags, TaggerResult, TagProgress, TagStats }
export { extractAndSaveTags, saveTagResult, tagger }
