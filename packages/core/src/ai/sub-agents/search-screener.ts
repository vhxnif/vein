/** biome-ignore-all lint/suspicious/noExplicitAny: tools use dynamic args */
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, Type } from '@earendil-works/pi-ai'
import { logger } from '../../config/index.ts'
import type { ModelProvider } from '../../config/type.ts'
import {
    getDocOutlines,
    getNodeDetails,
    searchDocsByKeyword,
} from '../../store/index.ts'
import { getModelProvider } from '../base.ts'
import { SEARCH_DOCS_BY_KEYWORD_META } from '../tools.ts'
import type { ToolCtx, ToolMeta } from '../types.ts'
import { ellipsis, extractResultText } from './utils.ts'

const slog = logger.child({ module: 'search-screener' })

// ── Tool metadata ──────────────────────────────────────────────

export const SEARCH_DOCUMENTS_META: ToolMeta = {
    stepLabel: () => 'Searching document library...',
    resultLabel: (text) => {
        try {
            const parsed = JSON.parse(text) as Array<{
                docId?: string
                relevance?: string
            }>
            if (Array.isArray(parsed)) {
                if (parsed.length === 0) return 'No relevant documents found'
                const counts: Record<string, number> = {}
                for (const d of parsed) {
                    const r = d.relevance ?? 'unknown'
                    counts[r] = (counts[r] ?? 0) + 1
                }
                const parts = Object.entries(counts).map(
                    ([k, v]) => `${k}:${v}`
                )
                return `Screened ${parsed.length} doc(s): ${parts.join(', ')}`
            }
        } catch {
            // ignore
        }
        return undefined
    },
    resultSummary: (raw) => {
        try {
            const parsed = JSON.parse(raw) as Array<{
                docId?: string
                relevance?: string
            }>
            if (Array.isArray(parsed)) {
                const samples = parsed
                    .slice(0, 3)
                    .map(
                        (d) =>
                            `${d.docId?.slice(0, 8) ?? '?'}:${d.relevance ?? '?'}`
                    )
                    .join(', ')
                return `${parsed.length} docs: ${samples}${parsed.length > 3 ? '…' : ''}`
            }
        } catch {
            // ignore
        }
        return raw.slice(0, 120)
    },
    logDetail: (a) => `"${ellipsis(String(a.userQuery ?? ''), 60)}"`,
}

// ── Prompt ─────────────────────────────────────────────────────

export const SEARCH_SCREENER_PROMPT = `你是一个文档搜索筛选员。根据用户查询搜索文档库，只返回可能包含相关信息的文档。

## 工具

| 工具 | 返回 |
|------|------|
| searchDocsByKeyword(query, limit?, offset?) | [{docId, snippet, rank, outline}] |

其中 outline 是文档标题大纲（仅章节标题，无摘要正文），snippet 是文档核心摘要。
两者结合判断：snippet 模糊但 outline 中有相关章节标题 → 可能相关。

## 流程

1. 分析用户查询，识别核心主题（剔除意图词如"如何迭代"/"发展历史"等，聚焦主体概念）
2. 提取核心关键词并自行分词：将复合词拆分为最小语义单元（如「周期监测」→「周期 监测」，「文本纠错功能」→「文本 纠错」，「双写一致性」→「双写 一致性」），以空格分隔传入 searchDocsByKeyword。分词粒度宁细勿粗——宁可拆分过细，不可整词硬匹配
3. 结合 snippet + outline 筛选相关性：
   - snippet 或 outline 与核心主题明显相关 → 保留
   - outline 中有专门章节（如"XXX优化"/"XXX功能"）匹配查询 → high
   - snippet 与 outline 均描述无关模块/系统 → 跳过
   - snippet 很短（<20 字符）且 outline 简单 → 降低优先级
4. 返回 ≤2 篇时，换一组关键词重新搜索（同义词/上位词/拆分重组）
5. 止损：连续 2 轮搜索返回 0 条相关结果时，返回空列表

## 输出格式

只返回纯 JSON 数组（不要 Markdown 包裹，不要解释）：
[{"docId":"<id>","relevance":"high|medium|low","reason":"<基于 snippet+outline 的一句话概述>"}]

## 约束

- 最多 3 次搜索
- 最多返回 10 篇文档
- 传入 searchDocsByKeyword 的关键词必须自行分词（空格分隔），不得传入未经拆分的复合词
- 只返回 snippet/outline 表明与查询相关的文档
- 相关性标注：high=大纲中有专门章节，medium=部分涉及，low=仅边缘提及
- 空结果时返回 []
`

function makeSearchDocsByKeyword(
    ctx: ToolCtx,
    _segmenter?: ModelProvider
): any {
    const { cached, ok, tool } = ctx
    // Cache compacted outlines by docId across search rounds within the
    // same sub-agent invocation (avoids re-fetching the same doc tree).
    const outlineCache = new Map<string, string>()
    return {
        name: 'searchDocsByKeyword',
        description:
            '通过关键词在文档摘要中搜索相关文档。传入 1-3 个空格分隔的核心关键词。' +
            '关键词应是用户问题中最具区分度的概念词和专有名词，避免泛化词（功能/系统/模块）和问题意图词（迭代/演进/历史/如何）。' +
            '示例：「周期监测功能是如何迭代的」→ 自行分词为「周期 监测」传入（空格分隔，非「周期监测」整词）。' +
            '默认返回前 10 条，可通过 offset 翻页；如果前 10 条均不相关，可用 offset=10 获取更多结果。' +
            '返回 [{docId, snippet, rank, outline}]，按匹配度降序。' +
            'snippet 为文档核心摘要，outline 为文档标题大纲（仅章节标题，无摘要正文），二者结合用于判断相关性。',
        parameters: Type.Object({
            query: Type.String({ description: '搜索关键词' }),
            limit: Type.Optional(
                Type.Number({
                    description: '返回条数，默认 10，最大 20',
                    default: 10,
                })
            ),
            offset: Type.Optional(
                Type.Number({
                    description: '跳过条数，用于翻页，默认 0',
                    default: 0,
                })
            ),
        }),
        execute: tool(async (_, p) => {
            const { query, limit, offset } = p as {
                query: string
                limit?: number
                offset?: number
            }
            const key = `searchDocsByKeyword:${query}:${limit ?? 10}:${offset ?? 0}`
            const result = await cached(key, async () => {
                // Direct FTS5 search — no LLM segmentation (sub-agent already
                // provides space-separated keywords; unicode61 bigram tokenizer
                // handles Chinese matching natively via OR semantics).
                const maxLimit = Math.min(limit ?? 10, 20)
                const results = await searchDocsByKeyword(
                    query,
                    maxLimit,
                    offset ?? 0
                )
                if (results.length === 0) {
                    return '[]'
                }
                // Enrich with snippet from root node (summary / prefixSummary)
                const withSnippets = await Promise.all(
                    results.map(async (r) => {
                        let snippet = ''
                        try {
                            const rootNode = await getNodeDetails<{
                                summary?: string
                                prefixSummary?: string
                            }>(`0000_${r.docId}`)
                            snippet =
                                rootNode?.summary ??
                                rootNode?.prefixSummary ??
                                ''
                        } catch {
                            // best-effort: snippet is optional for filtering
                        }
                        return {
                            docId: r.docId,
                            snippet,
                            rank: r.rank,
                        }
                    })
                )
                // Lightweight batch outline: uses json_extract to skip heavy
                // `text` fields; fetches only titles + hierarchy from tree_closure.
                const uncachedIds = withSnippets
                    .map((d) => d.docId)
                    .filter((id) => !outlineCache.has(id))
                if (uncachedIds.length > 0) {
                    const outlines = await getDocOutlines(uncachedIds)
                    for (const [docId, outline] of outlines) {
                        outlineCache.set(docId, outline)
                    }
                }
                const enriched = withSnippets.map((doc) => ({
                    ...doc,
                    outline: outlineCache.get(doc.docId) ?? '',
                }))
                return JSON.stringify(enriched)
            })
            return ok(result)
        }),
    }
}

async function searchAndScreen(
    userQuery: string,
    segmenter?: ModelProvider,
    modelOverride?: ModelProvider,
    onStep?: (label: string) => void
): Promise<string> {
    const provider = modelOverride ?? getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    slog.info({
        model: `${provider.provider}/${provider.model}`,
        queryLen: userQuery.length,
        content: 'SearchScreener start',
    })

    const cache = new Map<string, string>()
    const ctx: ToolCtx = {
        cached: async (key, fn) => {
            const hit = cache.get(key)
            if (hit !== undefined) return hit
            const val = await fn()
            cache.set(key, val)
            return val
        },
        ok: (s) => ({
            content: [{ type: 'text' as const, text: s }],
            details: {},
        }),
        tool: (fn) => fn,
    }

    const MAX_STEPS = 4
    let stepCount = 0

    const agent = new Agent({
        initialState: {
            systemPrompt: SEARCH_SCREENER_PROMPT,
            model,
            tools: [makeSearchDocsByKeyword(ctx, segmenter)],
        },
        beforeToolCall: async () => {
            stepCount++
            if (stepCount > MAX_STEPS) {
                slog.warn({
                    stepCount,
                    content: 'SearchScreener step budget exceeded, blocking',
                })
                return {
                    block: true,
                    reason: '已达到步骤预算上限，请基于已有搜索结果输出最终筛选列表',
                }
            }
        },
    })

    // Forward subagent steps to the user + log instrumentation
    const INTERNAL_META: Record<string, ToolMeta> = {
        searchDocsByKeyword: SEARCH_DOCS_BY_KEYWORD_META,
    }
    const toolStartTimes = new Map<string, number>()
    const toolQueries = new Map<string, string>()
    agent.subscribe((event) => {
        if (event.type === 'tool_execution_start') {
            toolStartTimes.set(event.toolCallId, performance.now())
            const args = (event.args as Record<string, unknown>) ?? {}
            const query = String(args.query ?? '')
            toolQueries.set(event.toolCallId, query)
            const meta = INTERNAL_META[event.toolName]
            const label = meta
                ? meta.stepLabel(args)
                : `Calling ${event.toolName}...`
            onStep?.(`[Search] ${label}`)
            slog.info({
                toolName: event.toolName,
                query,
                stepCount,
                content: 'SearchScreener tool start',
            })
        }
        if (event.type === 'tool_execution_end') {
            const start = toolStartTimes.get(event.toolCallId)
            const elapsedMs =
                start !== undefined
                    ? Math.round(performance.now() - start)
                    : undefined
            const resultText = extractResultText(event.result)
            const meta = INTERNAL_META[event.toolName]
            const label = meta?.resultLabel(resultText)
            if (label) {
                onStep?.(`  ${label}`)
            }
            slog.info({
                toolName: event.toolName,
                query: toolQueries.get(event.toolCallId) ?? '',
                resultLen: resultText.length,
                elapsedMs,
                content: 'SearchScreener tool end',
            })
        }
    })

    await agent.prompt(
        `用户查询: ${userQuery}\n\n请搜索相关文档并返回筛选后的列表。`
    )

    const messages = agent.state.messages
    slog.info({
        msgCount: messages.length,
        content: 'SearchScreener complete',
    })

    const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')

    const raw =
        lastAssistant?.content
            .filter((it) => it.type === 'text')
            .map((it) => it.text)
            .join('\n') ?? ''

    // Try to extract JSON array from the output (model may wrap in markdown)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    return jsonMatch ? jsonMatch[0] : raw || '[]'
}

/**
 * Spawns a lightweight subagent that searches the document library with
 * automatic keyword extraction, re-search fallback, and snippet-based
 * relevance screening. Returns a curated list of docIds so the main agent
 * does not have to process raw search results.
 */
/**
 * Creates the main agent's "searchDocuments" tool that wraps the
 * Search Screener sub-agent with caching.
 */
export function createSearchDocumentsTool(
    ctx: ToolCtx,
    segmenter?: ModelProvider,
    searchModel?: ModelProvider
): { tool: any; meta: ToolMeta } {
    const { cached, ok, tool } = ctx
    const toolDef = {
        name: 'searchDocuments',
        description:
            '搜索文档库中与用户查询相关的文档。' +
            '内部子 Agent 处理关键词提取、重搜和 snippet 相关性筛选。' +
            '返回已筛选的文档列表 [{docId, relevance, reason}]。' +
            '空列表 [] 表示未找到相关文档。',
        parameters: Type.Object({
            userQuery: Type.String({
                description: '用户原始查询，透传给搜索子 Agent',
            }),
        }),
        execute: tool(async (_, p) => {
            const { userQuery } = p as { userQuery: string }
            const key = `searchDocuments:${userQuery}`
            return ok(
                await cached(key, () =>
                    searchAndScreen(userQuery, segmenter, searchModel)
                )
            )
        }),
    }
    return { tool: toolDef, meta: SEARCH_DOCUMENTS_META }
}
