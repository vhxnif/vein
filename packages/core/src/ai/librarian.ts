/** biome-ignore-all lint/suspicious/noExplicitAny: AgentTool type constraints */

import { logger } from '../config/index.ts'
import type { ModelProvider } from '../config/type.ts'
import type { AgentMessage } from './base.ts'
import { Agent, getModel, getModelProvider } from './base.ts'
import {
    createAnalyzeDocumentTool,
    GET_DOC_NODE_DETAILS_META,
} from './sub-agents/doc-analyzer.ts'
import type { ReviewResult } from './sub-agents/reviewer.ts'
import { createReviewResultTool } from './sub-agents/reviewer.ts'
import { createSearchDocumentsTool } from './sub-agents/search-screener.ts'
import {
    compactAnalyzeResult,
    compactDocText,
    extractResultText,
    makeGetDocNodeDetails,
} from './sub-agents/utils.ts'
import type { ToolCtx, ToolMeta } from './types.ts'

const log = logger.child({ module: 'librarian' })

const MAX_MAIN_TOOL_CALLS = 40
const DEFAULT_MAX_FULL = 15

// ── Prompt ────────────────────────────────────────────────────

const PROMPT = `你是一个文档检索 Librarian。通过搜索子 Agent 定位文档，将深度分析委托给文档分析子 Agent，最后汇总并自检。

## 工具

| 步骤 | 工具 | 返回 |
|------|------|------|
| 1 | searchDocuments(userQuery) | [{docId, relevance, reason}] — 子 Agent 已筛选的文档列表 |
| 2 | analyzeDocument(docId, userQuery) | 子 Agent 深度分析结果（Markdown 格式） |
| 3 | reviewResult(query, result, sources) | 审查结果 |
| * | getDocNodeDetails(docId, nodeId) | 节点完整原文 — 仅用于补全已被压缩的分析结果中的具体引用 |

## 流程

1. 调用 searchDocuments(userQuery) 搜索相关文档（子 Agent 内部处理关键词提取和重搜）
   - 如果返回空列表 []，直接输出"文档库中未找到相关内容"并停止，不要继续搜索或调用 reviewResult
2. 对返回的文档调用 analyzeDocument，同一条消息中一次性批量并发调用（系统最多同时 {maxParallel} 个）
   - 返回的文档已经过初筛，应全部分析
   - **去重**：已分析过的文档不要重复分析，即使新搜索又命中了同一篇
3. 整理所有文档的分析结果，形成最终答案
   - 按文档逐一列出，每篇包含：文档标题、相关性、子 Agent 的「详细分析」原文
   - 不要用自己的话重新概括子 Agent 的分析——直接引用子 Agent 返回的内容
   - 对 relevance 为 low 的可压缩，none 的忽略
   - 所有文档相关性均为 "none" 时，直接输出"文档库中未找到相关内容"并停止，不要调用 reviewResult
   - **时序排序**：如果文档/分析结果之间存在时序关系（如版本演进、日期先后、事件因果），必须按时序排列；无法判断时序时按相关性 rank 降序排列
4. 调用 reviewResult 自检
   - 仅在找到至少 1 篇相关性非 "none" 的文档时才调用 reviewResult
   - **必须填充 sources 参数**：从各文档分析的「## 数据来源」中收集全部 nodeId，以 JSON 字符串形式传入 sources，格式：'[{"docId":"abc","nodeId":"0001"}]'。**提取 nodeId 时只取冒号前的纯数字前缀（如 "0001: 背景" 取 "0001"），不要带章节标题**。sources 为空或缺省时审查员会直接判 fail
   - 调用前先自我审视：当前结果是否全面覆盖了用户问题的各个方面？
   - 如有明显遗漏，可再次调用 searchDocuments 补搜（传入调整后的 userQuery），然后补分析遗漏文档后再审查
   - reviewResult 不通过时（partial/fail），增量调整（扩大搜索、补分析遗漏文档），最多重试 2 次
   - 系统硬性约束：reviewResult 最多调用 3 次（含首次），主 Agent 工具调用总数上限 40 次，超限将被强制终止并基于现有结果输出

## 输出格式

最终答案必须直接输出内容，绝对禁止以下形式：
- 禁止任何标题前缀（如"XX相关文档检索结果"、"检索结果"、"检索总结"）
- 禁止任何过渡性语句（如"以下是..."、"根据检索结果..."、"自检通过"）
- 禁止开头打招呼（如"您好"、"你好"）
- 禁止结尾总结（如"综上所述"、"以上结果供您参考"）
- **禁止暴露内部流程细节**（如"搜索了X轮""重试了X次""分析了X篇""经过审查...""自检结果...""连续X轮搜索...""触发止损条件"等），用户不需要感知检索过程
- 直接输出正文内容，按文档逐一列出即可
- 未找到相关内容时，只输出"文档库中未找到相关内容"，不要附加任何解释、原因或过程描述

## 约束

- 最终答案必须使用 **[docId:nodeId]** 格式（**方括号是必须的，否则引用不会被识别**）标注所有原文引用。docId 为子 Agent 返回的「## 数据来源」中的完整文档ID
  正确示例：详见 **[a1b2c3d4e5f6a1b2:0001]** 和 **[a1b2c3d4e5f6a1b2:0003]** 的原文
  错误示例：a1b2c3d4e5f6a1b2:0001（缺少方括号，不会被识别为引用）
- 已获取的信息不要重复获取
- **严格去重**：每个 docId 只调用一次 analyzeDocument。如果上下文中某篇文档的分析结果篇幅较短（如只有「## 相关性」「## 概述」「## 数据来源」三个章节），这是系统正常的上下文压缩行为，所有关键信息均已保留，**不需要重新调用 analyzeDocument**。如需补充某节点的原文做引用，使用 getDocNodeDetails 精确获取该节点即可。
- **批量并发**：同类型工具调用（如多个 analyzeDocument）放在同一条消息中一次发出，不要分批

`

// ── Quick-mode Prompt ──────────────────────────────────────────

const QUICK_MODE_PROMPT = `你是一个文档检索 Librarian。通过搜索子 Agent 定位文档，将深度分析委托给文档分析子 Agent，最后汇总整理。

## 工具

| 步骤 | 工具 | 返回 |
|------|------|------|
| 1 | searchDocuments(userQuery) | [{docId, relevance, reason}] — 子 Agent 已筛选的文档列表 |
| 2 | analyzeDocument(docId, userQuery) | 子 Agent 深度分析结果（Markdown 格式） |
| * | getDocNodeDetails(docId, nodeId) | 节点完整原文 — 仅用于补全已被压缩的分析结果中的具体引用 |

## 流程

1. 调用 searchDocuments(userQuery) 搜索相关文档（子 Agent 内部处理关键词提取和重搜）
   - 如果返回空列表 []，直接输出"文档库中未找到相关内容"并停止，不要继续搜索
2. 对返回的文档调用 analyzeDocument，同一条消息中一次性批量并发调用（系统最多同时 {maxParallel} 个）
   - 返回的文档已经过初筛，应全部分析
   - **去重**：已分析过的文档不要重复分析，即使新搜索又命中了同一篇
3. 整理所有文档的分析结果，形成最终答案
   - 按文档逐一列出，每篇包含：文档标题、相关性、子 Agent 的「详细分析」原文
   - 不要用自己的话重新概括子 Agent 的分析——直接引用子 Agent 返回的内容
   - 对 relevance 为 low 的可压缩，none 的忽略
   - 所有文档相关性均为 "none" 时，直接输出"文档库中未找到相关内容"并停止
   - **时序排序**：如果文档/分析结果之间存在时序关系（如版本演进、日期先后、事件因果），必须按时序排列；无法判断时序时按相关性 rank 降序排列
   - 如有明显遗漏，可再次调用 searchDocuments 补搜（传入调整后的 userQuery），然后补分析遗漏文档
   - 系统硬性约束：主 Agent 工具调用总数上限 40 次，超限将被强制终止并基于现有结果输出

## 输出格式

最终答案必须直接输出内容，绝对禁止以下形式：
- 禁止任何标题前缀（如"XX相关文档检索结果"、"检索结果"、"检索总结"）
- 禁止任何过渡性语句（如"以下是..."、"根据检索结果..."）
- 禁止开头打招呼（如"您好"、"你好"）
- 禁止结尾总结（如"综上所述"、"以上结果供您参考"）
- **禁止暴露内部流程细节**（如"搜索了X轮""重试了X次""分析了X篇"等），用户不需要感知检索过程
- 直接输出正文内容，按文档逐一列出即可
- 未找到相关内容时，只输出"文档库中未找到相关内容"，不要附加任何解释、原因或过程描述

## 约束

- 最终答案必须使用 **[docId:nodeId]** 格式（**方括号是必须的，否则引用不会被识别**）标注所有原文引用。docId 为子 Agent 返回的「## 数据来源」中的完整文档ID
  正确示例：详见 **[a1b2c3d4e5f6a1b2:0001]** 和 **[a1b2c3d4e5f6a1b2:0003]** 的原文
  错误示例：a1b2c3d4e5f6a1b2:0001（缺少方括号，不会被识别为引用）
- 已获取的信息不要重复获取
- **严格去重**：每个 docId 只调用一次 analyzeDocument。如果上下文中某篇文档的分析结果篇幅较短（如只有「## 相关性」「## 概述」「## 数据来源」三个章节），这是系统正常的上下文压缩行为，所有关键信息均已保留，**不需要重新调用 analyzeDocument**。如需补充某节点的原文做引用，使用 getDocNodeDetails 精确获取该节点即可。
- **批量并发**：同类型工具调用（如多个 analyzeDocument）放在同一条消息中一次发出，不要分批

`

// ── Tool assembly ─────────────────────────────────────────────

function buildMainTools(
    segmenter?: ModelProvider,
    onStep?: (label: string) => void,
    subagentModel?: ModelProvider,
    reviewerModel?: ModelProvider,
    searchAgentModel?: ModelProvider,
    maxParallelAnalyze?: number
): { tools: any[]; toolMeta: Record<string, ToolMeta> } {
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
        onStep,
    }

    const entries = [
        createSearchDocumentsTool(ctx, segmenter, searchAgentModel),
        createAnalyzeDocumentTool(ctx, subagentModel, maxParallelAnalyze),
        createReviewResultTool(ctx, reviewerModel),
        { tool: makeGetDocNodeDetails(ctx), meta: GET_DOC_NODE_DETAILS_META },
    ]

    const toolMeta: Record<string, ToolMeta> = {}
    const tools: any[] = []
    for (const { tool, meta } of entries) {
        tools.push(tool)
        toolMeta[tool.name] = meta
    }

    return { tools, toolMeta }
}

function buildQuickTools(
    segmenter?: ModelProvider,
    onStep?: (label: string) => void,
    searchAgentModel?: ModelProvider,
    subagentModel?: ModelProvider,
    maxParallelAnalyze?: number
): { tools: any[]; toolMeta: Record<string, ToolMeta> } {
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
        onStep,
    }

    const entries = [
        createSearchDocumentsTool(ctx, segmenter, searchAgentModel),
        createAnalyzeDocumentTool(ctx, subagentModel, maxParallelAnalyze),
        { tool: makeGetDocNodeDetails(ctx), meta: GET_DOC_NODE_DETAILS_META },
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

// ── Context pruning ───────────────────────────────────────────

function pruneContext(
    messages: AgentMessage[],
    maxFull?: number
): AgentMessage[] {
    const MAX_FULL = maxFull ?? DEFAULT_MAX_FULL

    const structIndices: number[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (
            msg &&
            msg.role === 'toolResult' &&
            'toolName' in msg &&
            (msg.toolName === 'analyzeDocument' ||
                msg.toolName === 'getDocStructure')
        ) {
            structIndices.push(i)
        }
    }

    if (structIndices.length <= MAX_FULL) return messages

    const compactSet = new Set(structIndices.slice(MAX_FULL))

    return messages.map((msg, i) => {
        if (!compactSet.has(i)) return msg
        if (!('content' in msg)) return msg
        const c = (msg as { content: Array<{ type: string; text?: string }> })
            .content[0]
        if (!c || !('text' in c) || !c.text) return msg
        const toolName =
            'toolName' in msg ? (msg as { toolName: string }).toolName : ''
        const compacted =
            toolName === 'analyzeDocument'
                ? compactAnalyzeResult(c.text)
                : compactDocText(c.text)
        return {
            ...msg,
            content: [{ type: 'text' as const, text: compacted }],
        }
    })
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

function createLibrarianAgent(
    systemPrompt: string,
    tools: any[],
    opts?: {
        segmenter?: ModelProvider
        subagentModel?: ModelProvider
        reviewerModel?: ModelProvider
        searchAgentModel?: ModelProvider
        thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
        maxAnalyzeResultFull?: number
    }
): Agent {
    const provider = getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    log.info({
        model: `${provider.provider}/${provider.model}`,
        content: 'Librarian session start',
    })

    let mainToolCallCount = 0
    const maxFull = opts?.maxAnalyzeResultFull

    const agent = new Agent({
        initialState: {
            systemPrompt,
            model,
            thinkingLevel: opts?.thinkingLevel ?? 'off',
            tools,
        },
        transformContext: async (messages) => pruneContext(messages, maxFull),
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
                    reason: '已达到主 Agent 工具调用上限，请基于已收集信息直接输出最终答案，不再调用任何工具',
                }
            }
            return undefined
        },
    })
    return agent
}

// ── Event instrumentation (merged subscriber) ─────────────────

function installAgentInstrumentation(
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
    let analyzeCount = 0

    const hasStream = !!(
        opts?.onThinkingDelta ||
        opts?.onTextDelta ||
        opts?.onToolCallStart ||
        opts?.onToolCallEnd
    )

    // Thin lookup wrappers — all per-tool logic lives in toolMeta
    const sLabel = (name: string, args: Record<string, unknown>) =>
        toolMeta[name]?.stepLabel(args) ?? `Calling ${name}...`
    const rLabel = (name: string, text: string) =>
        toolMeta[name]?.resultLabel(text)
    const rSummary = (name: string, raw: string) =>
        toolMeta[name]?.resultSummary(raw) ?? raw.slice(0, 200)
    const lDetail = (name: string, args: Record<string, unknown>) =>
        toolMeta[name]?.logDetail(args) ?? ''

    agent.subscribe((event) => {
        // ── Streaming deltas ──────────────────────────────
        if (event.type === 'message_update' && hasStream) {
            const ae = event.assistantMessageEvent
            if (ae.type === 'thinking_delta') {
                opts?.onThinkingDelta?.(ae.delta)
            } else if (ae.type === 'text_delta') {
                opts?.onTextDelta?.(ae.delta)
            }
            return
        }

        // ── Tool start ────────────────────────────────────
        if (event.type === 'tool_execution_start') {
            toolStartTimes.set(event.toolCallId, performance.now())
            const args = (event.args as Record<string, unknown>) ?? {}
            const label = sLabel(event.toolName, args)

            if (onStep) {
                if (event.toolName === 'reviewResult') {
                    const prefix =
                        analyzeCount > 0
                            ? `${analyzeCount} doc(s) analyzed · `
                            : ''
                    onStep(`${prefix}Reviewing answer quality...`)
                } else {
                    onStep(label)
                }
            }

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

        // ── Tool end ──────────────────────────────────────
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

            if (onStep) {
                if (event.toolName === 'analyzeDocument') analyzeCount++
                const rl = rLabel(event.toolName, resultText)
                if (rl) onStep(rl)
                if (event.toolName === 'reviewResult') {
                    onStep('Compiling final answer...')
                }
            }

            if (hasStream) {
                const summary =
                    rLabel(event.toolName, resultText) ??
                    `${resultText.length} chars`
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

function wireAbort(agent: Agent, signal?: AbortSignal): () => void {
    if (!signal)
        return () => {
            /* no op */
        }

    if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
    }

    const onAbort = () => agent.abort()
    signal.addEventListener('abort', onAbort, { once: true })

    return () => signal.removeEventListener('abort', onAbort)
}

// ── Result extraction ─────────────────────────────────────────

function extractFinalResult(
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
// ── Mode ─────────────────────────────────────────────────────

type Mode = 'default' | 'quick'

function useMode(
    mode: Mode,
    onStep?: (label: string) => void,
    opts?: Option
): { systemPrompt: string; tools: any[]; toolMeta: Record<string, ToolMeta> } {
    const maxParallel = opts?.maxParallelAnalyze ?? 10
    const prompt = (mode === 'quick' ? QUICK_MODE_PROMPT : PROMPT).replace(
        /{maxParallel}/g,
        String(maxParallel)
    )
    if (mode === 'quick') {
        const toolsInfo = buildQuickTools(
            opts?.segmenter,
            onStep,
            opts?.searchAgentModel,
            opts?.subagentModel,
            maxParallel
        )
        return {
            systemPrompt: prompt,
            ...toolsInfo,
        }
    }
    // default mode
    const toolsInfo = buildMainTools(
        opts?.segmenter,
        onStep,
        opts?.subagentModel,
        opts?.reviewerModel,
        opts?.searchAgentModel,
        maxParallel
    )
    return {
        systemPrompt: prompt,
        ...toolsInfo,
    }
}

// ── Main entry ────────────────────────────────────────────────
//
type Option = {
    segmenter?: ModelProvider
    subagentModel?: ModelProvider
    reviewerModel?: ModelProvider
    searchAgentModel?: ModelProvider
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
    mode?: Mode
    /** Max number of full analyzeDocument results before compaction. Default: 15. */
    maxAnalyzeResultFull?: number
    /** Max concurrent analyzeDocument sub-agent calls. Default: 10. */
    maxParallelAnalyze?: number
}

async function librarian(
    msg: string,
    onStep?: (label: string) => void,
    opts?: Option
): Promise<LibrarianResult> {
    const mode = opts?.mode ?? 'default'
    const { systemPrompt, tools, toolMeta } = useMode(mode, onStep, opts)
    const agent = createLibrarianAgent(systemPrompt, tools, opts)
    const toolTimings = installAgentInstrumentation(
        agent,
        toolMeta,
        onStep,
        opts
    )
    const cleanup = wireAbort(agent, opts?.signal)

    try {
        await agent.prompt(msg)
    } finally {
        cleanup()
    }

    return extractFinalResult(agent.state.messages, toolTimings, toolMeta)
}

export type { LibrarianResult, Mode, TraceStep }
export { librarian }
