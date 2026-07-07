/** biome-ignore-all lint/suspicious/noExplicitAny: AgentTool type constraints */

import { logger } from '../config/index.ts'
import type { ModelProvider } from '../config/type.ts'
import * as store from '../store/index.ts'
import type { AgentMessage } from './base.ts'
import { Agent, getBuiltinModel, getModelProvider, Type } from './base.ts'
import type { ReviewResult } from './sub-agents/reviewer.ts'
import { createReviewResultTool } from './sub-agents/reviewer.ts'
import {
    ellipsis,
    extractResultText,
    formatSize,
    makeGetDocNodeDetails,
    makeGetNodeSummary,
} from './sub-agents/utils.ts'
import type { ToolCtx, ToolMeta } from './types.ts'

const log = logger.child({ module: 'librarian' })

const MAX_MAIN_TOOL_CALLS = 30

// ── Prompt ────────────────────────────────────────────────────

const PROMPT = `你是一个文档检索 Librarian。直接使用工具搜索、定位、阅读文档，然后汇总回答用户的问题。

## 工具

| 工具 | 用途 | 返回 |
|------|------|------|
| searchDocs(query, limit?, offset?) | 关键词搜索文档库 | Markdown 编号列表：docId + rank + snippet + outline |
| getNodeSummary(docId, nodeId) | 获取节点摘要，快速判断相关性 | Markdown：> title\\nsummary |
| getDocNodeDetails(docId, nodeId) | 读取节点完整原文 | Markdown：# 标题\\n\\n正文 |
| reviewResult(query, result, sources) | 验证结果准确性（可选） | 审查 verdict |

## 流程

1. 分析用户问题，提取核心关键词（空格分隔），调用 searchDocs 搜索
   - 如果返回空结果，直接输出"文档库中未找到相关内容"并停止
2. 浏览搜索结果中的 snippet + outline，判断哪些文档值得深入阅读
3. 对值得阅读的文档：
   - 先用 getNodeSummary 判断具体节点是否相关
   - 确认相关后用 getDocNodeDetails 精确读取原文
   - **按需阅读**：只读真正需要的节点，2-3 个节点通常足够
4. 整理答案，引用原文
   - 按文档逐一列出，标注相关性
   - 直接引用原文，不要自己概括
   - **时序排序**：涉及时序关系时按时序排列
5. （可选）调用 reviewResult 验证结果准确性

## 搜索策略

- **自行分词**：将复合词拆分为最小语义单元，空格分隔传入 searchDocs（如"周期监测"→"周期 监测"）
- **宁细勿粗**：宁可拆分过细，不可整词硬匹配
- **关键词聚焦**：只传最具区分度的概念词，剔除"如何""迭代""历史"等通用意图词
- 前 10 条不相关时，用 offset=10 翻页获取更多
- 首轮结果 ≤2 篇时，换一组同义词/上位词重新搜索

## 输出格式

最终答案必须直接输出内容，绝对禁止：
- 禁止标题前缀、过渡语句、开头打招呼、结尾总结
- **禁止暴露内部流程细节**（搜索次数、重试、工具调用等）
- 直接输出正文，按文档逐一列出
- 未找到相关内容时，只输出"文档库中未找到相关内容"

## 引用规范

### 格式
- 引用整个文档时使用 **[完整docId]**（无 nodeId）
- 引用文档中具体段落/节点时使用 **[完整docId:nodeId]**
- **docId 必须原样完整复制**：searchDocs / getNodeSummary 返回的 docId 是完整 32 位字符串，直接复制到引用中，**绝对禁止截断、缩写**
- **nodeId 即节点编号**：searchDocs outline / getNodeSummary 中每行开头的数字（如 0001、0002）即为 nodeId，直接使用
- **方括号必须**

### 示例
  正确（文档引用）：**[738882f060b7967304763be70d666084]**
  正确（节点引用）：**[738882f060b7967304763be70d666084:0001]**
  错误：[738882f0:0001]（截断 docId）、[a1b2c3d4:0001]（截断 docId）
  错误：738882f060b7967304763be70d666084:0001（缺少方括号）

### 准确性
- 每条引用必须精确对应：仅当实际读取了对应文档/节点原文，才能引用
- 不要将多个文档的信息合并后统一标注在一个引用下
- 同一观点来自多处时，分别标注各自的引用
- **输出前自检**：核对每条 [docId] 和 [docId:nodeId] 能否在已获取的原文中找到，找不到则删除该引用

## 约束

- 已获取的信息不要重复获取
- **批量并发**：同类型的多个 getNodeSummary / getDocNodeDetails 放在同一条消息中发出
- 不要编造文档中不存在的内容`

// ── Tool metadata ─────────────────────────────────────────────

const SEARCH_DOCS_META: ToolMeta = {
    stepLabel: (a) => `Searching: "${ellipsis(String(a.query ?? ''), 36)}"...`,
    resultLabel: (text) => {
        if (!text || text === '(no results)') return 'No results found'
        const count = (text.match(/^\d+\.\s\*\*/gm) ?? []).length
        return count > 0 ? `Found ${count} doc(s)` : undefined
    },
    resultSummary: (raw) => {
        if (!raw || raw === '(no results)') return '0 docs'
        const ids = [...(raw ?? '').matchAll(/^\d+\.\s\*\*([a-f0-9]+)\*\*/gm)]
            .slice(0, 3)
            .map((m) => m[1]?.slice(0, 8) ?? '?')
        return `${ids.length} docs: ${ids.join(', ') || '...'}`
    },
    logDetail: (a) => `"${ellipsis(String(a.query ?? ''), 60)}"`,
}

// ── Tool assembly ─────────────────────────────────────────────

export function buildTools(
    onStep?: (label: string) => void,
    reviewerModel?: ModelProvider
): { tools: any[]; toolMeta: Record<string, ToolMeta> } {
    const cache = new Map<string, string>()
    const outlineCache = new Map<string, string>()

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
        onStep,
    }

    // 1. searchDocs — direct FTS5 + enrichment, no sub-agent
    const searchDocsTool = {
        name: 'searchDocs',
        description:
            '通过空格分隔的关键词搜索文档库。自行分词后传入，如"周期 监测"而非"周期监测"。' +
            '返回 Markdown 编号列表：docId + rank + snippet + outline，默认 10 条，最多 20 条。',
        parameters: Type.Object({
            query: Type.String({
                description: '空格分隔的搜索关键词，1-3 个核心概念词',
            }),
            limit: Type.Optional(
                Type.Number({
                    description: '返回条数，默认 10，最大 20',
                    default: 10,
                })
            ),
            offset: Type.Optional(
                Type.Number({
                    description: '跳过条数，用于翻页',
                    default: 0,
                })
            ),
        }),
        execute: ctx.tool(async (_: unknown, p: unknown) => {
            const { query, limit, offset } = p as {
                query: string
                limit?: number
                offset?: number
            }
            const key = `searchDocs:${query}:${limit ?? 10}:${offset ?? 0}`
            return ctx.ok(
                await ctx.cached(key, async () => {
                    const maxLimit = Math.min(limit ?? 10, 20)
                    const results = await store.searchDocsByKeyword(
                        query,
                        maxLimit,
                        offset ?? 0
                    )
                    if (results.length === 0) return '(no results)'

                    // Enrich with snippet
                    const withSnippets = await Promise.all(
                        results.map(async (r) => {
                            let snippet = ''
                            try {
                                const rootNode = await store.getNodeDetails<{
                                    summary?: string
                                    prefixSummary?: string
                                }>(`0000_${r.docId}`)
                                snippet =
                                    rootNode?.summary ??
                                    rootNode?.prefixSummary ??
                                    ''
                            } catch {
                                // best-effort
                            }
                            return {
                                docId: r.docId,
                                snippet,
                                rank: r.rank,
                            }
                        })
                    )

                    // Enrich with outlines (batch fetch uncached)
                    const uncachedIds = withSnippets
                        .map((d) => d.docId)
                        .filter((id) => !outlineCache.has(id))
                    if (uncachedIds.length > 0) {
                        const outlines = await store.getDocOutlines(uncachedIds)
                        for (const [docId, outline] of outlines) {
                            outlineCache.set(docId, outline)
                        }
                    }

                    const enriched = withSnippets.map((doc) => ({
                        ...doc,
                        outline: outlineCache.get(doc.docId) ?? '',
                    }))

                    // Format as markdown numbered list
                    const lines: string[] = []
                    for (const [i, doc] of enriched.entries()) {
                        lines.push(
                            `${i + 1}. **${doc.docId}** (rank: ${doc.rank.toFixed(2)})`
                        )
                        if (doc.snippet) {
                            lines.push(`   > ${doc.snippet}`)
                        }
                        if (doc.outline) {
                            lines.push('')
                            for (const ol of doc.outline.split('\n')) {
                                lines.push(`   ${ol}`)
                            }
                        }
                        if (i < enriched.length - 1) lines.push('')
                    }
                    return lines.join('\n')
                })
            )
        }),
    }

    // 2. getNodeSummary — lightweight node summary check
    const getNodeSummaryTool = makeGetNodeSummary(ctx)

    // 3. getDocNodeDetails — direct node fetch
    const getDocNodeDetailsTool = makeGetDocNodeDetails(ctx)

    // 4. reviewResult — optional, wraps Reviewer sub-agent
    const reviewEntry = createReviewResultTool(ctx, reviewerModel)

    const entries = [
        { tool: searchDocsTool, meta: SEARCH_DOCS_META },
        {
            tool: getNodeSummaryTool,
            meta: {
                stepLabel: (a: Record<string, unknown>) =>
                    `Checking node ${a.nodeId ?? '?'}...`,
                resultLabel: (text: string) => `${formatSize(text.length)}`,
                resultSummary: (raw: string) => `${formatSize(raw.length)}`,
                logDetail: (a: Record<string, unknown>) =>
                    `doc=${String(a.docId ?? '').slice(0, 8)}/${a.nodeId ?? '?'}`,
            } as ToolMeta,
        },
        {
            tool: getDocNodeDetailsTool,
            meta: {
                stepLabel: (a: Record<string, unknown>) =>
                    `Reading node ${a.nodeId ?? '?'}...`,
                resultLabel: (text: string) => `${formatSize(text.length)}`,
                resultSummary: (raw: string) => `${formatSize(raw.length)}`,
                logDetail: (a: Record<string, unknown>) =>
                    `doc=${String(a.docId ?? '').slice(0, 8)}/${a.nodeId ?? '?'}`,
            } as ToolMeta,
        },
        reviewEntry,
    ]

    const toolMeta: Record<string, ToolMeta> = {}
    const tools: any[] = []
    for (const { tool, meta } of entries) {
        tools.push(tool)
        toolMeta[tool.name] = meta
    }

    return { tools, toolMeta }
}

// ── Types ─────────────────────────────────────────────────────

type TraceStep = {
    tool: string
    args: Record<string, unknown>
    resultSummary: string
    rawResult: string
    elapsedMs: number
}

type LibrarianResult = {
    content: string
    trace: TraceStep[]
    review?: ReviewResult
    reviewElapsedMs?: number
}

// ── Trace extraction ──────────────────────────────────────────

function extractTrace(
    messages: AgentMessage[],
    toolTimings: Map<string, number>,
    toolMeta: Record<string, ToolMeta>
): TraceStep[] {
    const trace: TraceStep[] = []
    const toolResultMap = new Map<string, string>()

    for (const msg of messages) {
        if (msg.role === 'toolResult') {
            toolResultMap.set(msg.toolCallId, extractResultText(msg))
        }
    }

    for (const msg of messages) {
        if (msg.role !== 'assistant') continue
        for (const block of msg.content) {
            if (block.type !== 'toolCall') continue
            const result = toolResultMap.get(block.id) ?? ''
            trace.push({
                tool: block.name,
                args: block.arguments as Record<string, unknown>,
                resultSummary:
                    toolMeta[block.name]?.resultSummary(result) ??
                    result.slice(0, 200),
                rawResult: result,
                elapsedMs: toolTimings.get(block.id) ?? 0,
            })
        }
    }

    return trace
}

// ── Final-answer sanitization ─────────────────────────────────

function sanitizeAnswer(content: string): string {
    const internalProcessPatterns = [
        /连续\s*\d+\s*轮搜索[\s\S]*?/gi,
        /触发[\s\S]*?止损[\s\S]*?/gi,
        /搜索了\s*\d+\s*轮[\s\S]*?/gi,
        /重试了\s*\d+\s*次[\s\S]*?/gi,
        /分析了\s*\d+\s*篇[\s\S]*?/gi,
        /经过审查[\s\S]*?/gi,
        /自检结果[\s\S]*?/gi,
    ]

    let cleaned = content
    for (const pattern of internalProcessPatterns) {
        cleaned = cleaned.replace(pattern, '')
    }
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()

    if (cleaned.includes('文档库中未找到相关内容') || cleaned.length === 0) {
        return '文档库中未找到相关内容'
    }
    return cleaned
}

// ── Agent construction ────────────────────────────────────────

export function createLibrarianAgent(
    systemPrompt: string,
    tools: any[],
    opts?: {
        thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    }
): Agent {
    const provider = getModelProvider()
    const model = getBuiltinModel(provider.provider as never, provider.model)

    log.info({
        model: `${provider.provider}/${provider.model}`,
        content: 'Librarian session start',
    })

    let mainToolCallCount = 0

    const agent = new Agent({
        initialState: {
            systemPrompt,
            model,
            thinkingLevel: opts?.thinkingLevel ?? 'off',
            tools,
        },
        beforeToolCall: async (context) => {
            mainToolCallCount++
            if (mainToolCallCount > MAX_MAIN_TOOL_CALLS) {
                log.warn({
                    mainToolCallCount,
                    toolName: context.toolCall.name,
                    content: 'Main agent tool budget exceeded, blocking',
                })
                return {
                    block: true,
                    reason: '已达到工具调用上限，请基于已收集信息直接输出最终答案',
                }
            }
            return undefined
        },
    })
    return agent
}

// ── Event instrumentation ─────────────────────────────────────

export function installAgentInstrumentation(
    agent: Agent,
    toolMeta: Record<string, ToolMeta>,
    onStep: ((label: string) => void) | undefined,
    opts?: {
        onThinkingDelta?: (delta: string) => void
        onTextDelta?: (delta: string) => void
        onToolCallStart?: (
            toolCallId: string,
            toolName: string,
            label: string
        ) => void
        onToolCallEnd?: (
            toolCallId: string,
            toolName: string,
            summary: string
        ) => void
    }
): Map<string, number> {
    const toolStartTimes = new Map<string, number>()
    const toolTimings = new Map<string, number>()

    const hasStream = !!(
        opts?.onThinkingDelta ||
        opts?.onTextDelta ||
        opts?.onToolCallStart ||
        opts?.onToolCallEnd
    )

    const sLabel = (name: string, args: Record<string, unknown>) =>
        toolMeta[name]?.stepLabel(args) ?? `Calling ${name}...`
    const rLabel = (name: string, text: string) =>
        toolMeta[name]?.resultLabel(text)
    const rSummary = (name: string, raw: string) =>
        toolMeta[name]?.resultSummary(raw) ?? raw.slice(0, 200)
    const lDetail = (name: string, args: Record<string, unknown>) =>
        toolMeta[name]?.logDetail(args) ?? ''

    agent.subscribe((event) => {
        if (event.type === 'message_update' && hasStream) {
            const ae = event.assistantMessageEvent
            if (ae.type === 'thinking_delta') {
                opts?.onThinkingDelta?.(ae.delta)
            } else if (ae.type === 'text_delta') {
                opts?.onTextDelta?.(ae.delta)
            }
            return
        }

        if (event.type === 'tool_execution_start') {
            toolStartTimes.set(event.toolCallId, performance.now())
            const args = (event.args as Record<string, unknown>) ?? {}
            const label = sLabel(event.toolName, args)

            if (onStep) onStep(label)
            if (hasStream) {
                opts?.onToolCallStart?.(event.toolCallId, event.toolName, label)
            }

            log.info({
                toolName: event.toolName,
                detail: lDetail(event.toolName, args),
                content: 'Tool start',
            })
            return
        }

        if (event.type === 'tool_execution_end') {
            const start = toolStartTimes.get(event.toolCallId)
            const elapsedMs =
                start !== undefined
                    ? Math.round(performance.now() - start)
                    : undefined
            if (elapsedMs !== undefined) {
                toolTimings.set(event.toolCallId, elapsedMs)
            }

            const resultText = extractResultText(event.result)
            const rl = rLabel(event.toolName, resultText)
            if (onStep && rl) onStep(rl)

            if (hasStream) {
                const summary = rl ?? `${resultText.length} chars`
                opts?.onToolCallEnd?.(event.toolCallId, event.toolName, summary)
            }

            log.info({
                toolName: event.toolName,
                resultLen: resultText.length,
                resultSummary: rSummary(event.toolName, resultText),
                elapsedMs,
                content: 'Tool end',
            })
        }
    })

    return toolTimings
}

// ── Abort wiring ──────────────────────────────────────────────

// ── Result extraction ─────────────────────────────────────────

export function extractFinalResult(
    messages: AgentMessage[],
    toolTimings: Map<string, number>,
    toolMeta: Record<string, ToolMeta>
): LibrarianResult {
    log.info({
        msgCount: messages.length,
        content: 'Agent prompt complete',
    })

    const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')

    let content =
        lastAssistant?.content
            .filter((it) => it.type === 'text')
            .map((it) => it.text)
            .join('\n') ?? ''
    content = sanitizeAnswer(content)

    const trace = extractTrace(messages, toolTimings, toolMeta)

    let review: ReviewResult | undefined
    let reviewElapsedMs: number | undefined
    for (const step of [...trace].reverse()) {
        if (step.tool === 'reviewResult') {
            reviewElapsedMs = step.elapsedMs
            try {
                review = JSON.parse(step.rawResult) as ReviewResult
            } catch {
                // ignore parse error
            }
            break
        }
    }

    return { content, trace, review, reviewElapsedMs }
}

export const LIBRARIAN_PROMPT = PROMPT

// ── Options ───────────────────────────────────────────────────

export type LibrarianOption = {
    reviewerModel?: ModelProvider
    signal?: AbortSignal
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    onThinkingDelta?: (delta: string) => void
    onTextDelta?: (delta: string) => void
    onToolCallStart?: (
        toolCallId: string,
        toolName: string,
        label: string
    ) => void
    onToolCallEnd?: (
        toolCallId: string,
        toolName: string,
        summary: string
    ) => void
}

// ── Main entry ────────────────────────────────────────────────

async function librarian(
    msg: string,
    onStep?: (label: string) => void,
    opts?: LibrarianOption
): Promise<LibrarianResult> {
    const { tools, toolMeta } = buildTools(onStep, opts?.reviewerModel)
    const agent = createLibrarianAgent(PROMPT, tools, opts)
    const toolTimings = installAgentInstrumentation(
        agent,
        toolMeta,
        onStep,
        opts
    )
    let cleanup = () => {
        // noop (no abort signal)
    }
    if (opts?.signal) {
        if (opts.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
        }
        const onAbort = () => agent.abort()
        opts.signal.addEventListener('abort', onAbort, { once: true })
        cleanup = () => opts.signal!.removeEventListener('abort', onAbort)
    }

    try {
        await agent.prompt(msg)
    } finally {
        cleanup()
    }

    return extractFinalResult(agent.state.messages, toolTimings, toolMeta)
}

export type { LibrarianResult, TraceStep }
export { librarian }
