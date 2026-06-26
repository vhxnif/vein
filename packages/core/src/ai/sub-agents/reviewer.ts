/** biome-ignore-all lint/suspicious/noExplicitAny: tools use dynamic args */

import { logger } from '../../config/index.ts'
import type { ModelProvider } from '../../config/type.ts'
import { getNodeDetails } from '../../store/index.ts'
import type { BaseDocNode } from '../../tree/type.ts'
import {
    call,
    getModel,
    getModelProvider,
    type ToolDef,
    Type,
} from '../base.ts'
import type { ToolCtx, ToolMeta } from '../types.ts'

const prompt = `你是一个文档检索结果审查员。你的任务是审查 Librarian 返回的检索结果，判断其是否满足用户的需求。

## 输入

你会收到：
1. 用户的原始查询
2. Librarian 引用的数据源地址列表（docId + nodeId）
3. Librarian 整理后的检索结果

## 数据源地址规范

每个 source 的 nodeId 应为纯节点 ID（如 0001），系统会自动清洗。如果你看到的 nodeId 带有章节标题（如 "0001: 背景"），系统已提取出 "0001"。

## 验证流程

1. 一次性调用多次 getReviewSource 工具并行获取所有数据源的原文
2. 将原文与 Librarian 的检索结果进行核对
3. 完成所有核对后给出评判

## 评估维度

### 1. 相关性
返回的文档内容是否直接回应用户查询的主题？

### 2. 完整性
返回的内容是否覆盖了用户问题的主要方面？是否有明显的遗漏？
- 如果仅检查了单一数据源，需特别审视：是否有重要信息可能存在于其他未检查的文档中？
- 当数据源内容不足以全面回答查询时，应判为 partial 或 fail
- 如果 Librarian 的结果引用了具体数据但未提供对应 source，应判为 partial 并建议补充 source

### 3. 准确性
Librarian 的结果是否忠实于数据源的原文？是否存在虚构、曲解或遗漏关键信息？

## 输出格式

按以下 Markdown 结构输出评判结果，不需要任何前置说明：

\`\`\`
## 评判

pass (4/5)   ← pass/partial/fail，及 1-5 评分

## 理由

简要评判理由（1-2句）

## 建议

如果不通过，说明 Librarian 应如何改进；如通过则填\`无\`
\`\`\`

### verdict 定义
- pass（4-5分）：内容直接回答用户问题，信息充分且与原文一致
- partial（2-3分）：内容部分相关，但不够完整或存在小偏差
- fail（1分）：内容无关，或存在明显虚构/曲解原文，或完全无法回答

### 重要原则
- 不要引入外部知识，只基于 getReviewSource 返回的原文进行评判
- 如果 Librarian 未提供数据源，verdict 应为 fail，suggestion 必须要求："从子 Agent 输出的 ## 数据来源 中收集 docId 和纯 nodeId（仅冒号前数字前缀），以 JSON 数组传入 sources 参数"
- 如果 getReviewSource 返回 (node not found)，说明 Librarian 引用的节点地址有误，verdict 应为 fail，suggestion 要求检查 nodeId 格式
- 如果 getReviewSource 返回 (empty)，说明节点存在但内容为空；若该节点对回答问题非必要，可判 partial/pass；若关键内容缺失，判 fail
- 如果数据源原文与查询主题无关，说明 Librarian 选错了文档，verdict 应为 fail
- **严格按输出格式填写，不要添加任何额外内容**`

export type ReviewResult = {
    verdict: 'pass' | 'partial' | 'fail'
    score: number
    reason: string
    suggestion: string
}

export type SourceRef = {
    docId: string
    nodeId: string
}

// ── Tool metadata ──────────────────────────────────────────────

export const GET_REVIEW_SOURCE_META: ToolMeta = {
    stepLabel: (a) => {
        const nid = normalizeNodeId(String(a.nodeId ?? ''))
        return `Verifying: ${a.docId ?? '?'}/${nid}...`
    },
    resultLabel: (text) => `${text.length} chars`,
    resultSummary: (raw) => `${raw.length} chars`,
    logDetail: (a) => {
        const nid = normalizeNodeId(String(a.nodeId ?? ''))
        return `${a.docId ?? '?'}/${nid}`
    },
}

export const REVIEW_RESULT_META: ToolMeta = {
    stepLabel: () => 'Reviewing results...',
    resultLabel: (text) => {
        try {
            const parsed = JSON.parse(text) as {
                verdict?: string
                score?: number
            }
            if (parsed.verdict) {
                return `Review: ${parsed.verdict} (${parsed.score ?? '?'}/5)`
            }
        } catch {
            // ignore
        }
        return undefined
    },
    resultSummary: (raw) => {
        try {
            const parsed = JSON.parse(raw) as {
                verdict?: string
                score?: number
                reason?: string
            }
            if (typeof parsed === 'object' && parsed !== null) {
                return `${parsed.verdict ?? '?'} (${parsed.score ?? '?'}/5): ${(parsed.reason ?? '').slice(0, 80)}`
            }
            return JSON.stringify(parsed).slice(0, 200)
        } catch {
            return raw.slice(0, 200)
        }
    },
    logDetail: (a) => `"${String(a.query ?? '').slice(0, 60)}"`,
}

// ── Internals ─────────────────────────────────────────────────

function parseReviewResult(text: string): ReviewResult {
    const verdictMatch = text.match(
        /##\s*评判\s*\n+([^\n(]+)\s*\((\d)\s*\/\s*5\s*\)/i
    )
    const verdict = (verdictMatch?.[1]?.trim().toLowerCase() ??
        'fail') as ReviewResult['verdict']
    const score = Number.parseInt(verdictMatch?.[2] ?? '1', 10)

    const reasonMatch = text.match(
        /##\s*理由\s*\n+([^\n][\s\S]*?)(?=\n##\s*建议|\n*$)/i
    )
    const reason = reasonMatch?.[1]?.trim() ?? ''

    const suggestionMatch = text.match(
        /##\s*建议\s*\n+([\s\S]*?)(?=\n##|\n*$)/i
    )
    const suggestion = suggestionMatch?.[1]?.trim() ?? ''
    const cleanSuggestion =
        suggestion === '无' || suggestion === '`无`' || !suggestion
            ? ''
            : suggestion

    return { verdict, score, reason, suggestion: cleanSuggestion }
}

function normalizeNodeId(nodeId: string): string {
    const trimmed = nodeId.trim()
    // Handle "0001: background" or "0001_xxx" by taking the first segment.
    const first = trimmed.split(/[:_\s]+/)[0]
    return first ?? trimmed
}

function buildReviewTools(): ToolDef[] {
    return [
        {
            name: 'getReviewSource',
            description:
                '根据 docId 和 nodeId 获取文档节点的原始文本，用于验证 Librarian 结果是否准确。' +
                'nodeId 会被自动清洗（取冒号/下划线/空格前的第一个 token）。',
            parameters: Type.Object({
                docId: Type.String({ description: '文档 ID' }),
                nodeId: Type.String({ description: '节点 ID' }),
            }),
            run: async ({
                docId,
                nodeId,
            }: {
                docId: string
                nodeId: string
            }) => {
                const normalized = normalizeNodeId(nodeId)
                const d = await getNodeDetails<BaseDocNode>(
                    `${normalized}_${docId}`
                )
                if (!d) return '(node not found)'
                return d.text ?? '(empty)'
            },
        },
    ]
}

export const MAX_REVIEW_CALLS = 3

/**
 * Creates the main agent's "reviewResult" tool that wraps the
 * Reviewer sub-agent with call budget enforcement.
 */
export function createReviewResultTool(
    ctx: ToolCtx,
    modelOverride?: ModelProvider
): { tool: any; meta: ToolMeta } {
    let reviewCount = 0
    const { ok, tool, onStep } = ctx
    const toolDef = {
        name: 'reviewResult',
        description:
            '审查检索结果是否满足用户需求。完成检索后、回复用户前必须调用。' +
            '不通过时增量调整，不要从头搜索！' +
            `最多调用 ${MAX_REVIEW_CALLS} 次（含首次），超限会被系统拒绝。`,
        parameters: Type.Object({
            query: Type.String({ description: '用户原始查询' }),
            result: Type.String({ description: '准备返回给用户的检索结果' }),
            sources: Type.String({
                description:
                    '引用的数据源地址 JSON 字符串，必填，格式：\'[{"docId":"abc","nodeId":"0001"}]\'。' +
                    '必须从各文档子 Agent 分析的「## 数据来源」中收集全部 nodeId。空或缺省会导致审查失败。',
            }),
        }),
        execute: tool(async (_, p) => {
            const { query, result, sources } = p as {
                query: string
                result: string
                sources?: string
            }
            reviewCount++
            if (reviewCount > MAX_REVIEW_CALLS) {
                const reason = `reviewResult 已达最大调用次数 ${MAX_REVIEW_CALLS}，请直接输出最终答案`
                logger.warn({
                    reviewCount,
                    content: 'Review call budget exceeded, blocking',
                })
                return ok(
                    JSON.stringify({
                        verdict: 'fail',
                        score: 1,
                        reason,
                        suggestion: '',
                    })
                )
            }
            let parsed: SourceRef[] | undefined
            if (sources) {
                try {
                    parsed = JSON.parse(sources) as SourceRef[]
                } catch {
                    // ignore invalid sources
                }
            }
            const review = await reviewer(
                query,
                result,
                parsed,
                onStep,
                modelOverride,
                reviewCount
            )
            return ok(JSON.stringify(review))
        }),
    }
    return { tool: toolDef, meta: REVIEW_RESULT_META }
}

export async function reviewer(
    query: string,
    librarianResponse: string,
    sources?: SourceRef[],
    onStep?: (label: string) => void,
    modelOverride?: ModelProvider,
    reviewCount?: number
): Promise<ReviewResult> {
    // Deduplicate by (docId, normalized nodeId) to avoid redundant fetches.
    const uniqueSources = sources?.length
        ? [
              ...new Map(
                  sources.map((s) => [
                      `${s.docId}:${normalizeNodeId(s.nodeId)}`,
                      { ...s, nodeId: normalizeNodeId(s.nodeId) },
                  ])
              ).values(),
          ]
        : []

    const sourcesText = uniqueSources.length
        ? uniqueSources
              .map((s) => `- docId: ${s.docId}, nodeId: ${s.nodeId}`)
              .join('\n')
        : '(无数据源)'

    onStep?.(
        reviewCount && reviewCount > 1
            ? `Reviewing results... (retry ${reviewCount - 1})`
            : 'Reviewing results...'
    )

    const model = modelOverride
        ? getModel(modelOverride.provider as never, modelOverride.model)
        : undefined

    const usedModel = modelOverride
        ? `${modelOverride.provider}/${modelOverride.model}`
        : `${getModelProvider().provider}/${getModelProvider().model}`
    logger.info({ model: usedModel, content: 'Reviewer start' })

    const { content } = await call({
        systemPrompt: prompt,
        tools: buildReviewTools(),
        model,
        onToolCall: (name, args) => {
            if (name === 'getReviewSource') {
                const a = args as { docId?: string; nodeId?: string }
                const nid = normalizeNodeId(a.nodeId ?? '')
                onStep?.(`Verifying: ${a.docId ?? '?'}/${nid}...`)
            }
        },
        messages: [
            {
                role: 'user',
                content: [
                    `用户查询：${query}`,
                    `数据源地址：\n${sourcesText}`,
                    `Librarian 返回结果：${librarianResponse}`,
                ].join('\n\n'),
                timestamp: Date.now(),
            },
        ],
    })

    const text = content.findLast((it) => it.type === 'text')?.text ?? ''

    const result = parseReviewResult(text)

    onStep?.(`Review: ${result.verdict} (${result.score}/5)`)
    return result
}
