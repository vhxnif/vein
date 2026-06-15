/** biome-ignore-all lint/suspicious/noExplicitAny: AgentTool type constraints */
import type {
    AgentMessage,
    AgentTool,
    AgentToolResult,
} from '@earendil-works/pi-agent-core'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, Type } from '@earendil-works/pi-ai'
import { logger } from '../config'
import type { ModelProvider } from '../config/type'
import { getFullTree, getNodeDetails } from '../store'
import type { BaseDocNode, TreeNode } from '../tree/type'
import { getModelProvider } from './base'
import type { ReviewResult, SourceRef } from './reviewer'
import { reviewer } from './reviewer'
import { searchDocsByKeyword } from './tools'

const log = logger.child({ module: 'librarian' })
const subLog = logger.child({ module: 'doc-analyzer' })

// ── Prompts ───────────────────────────────────────────────────

const PROMPT = `你是一个文档检索 Librarian。通过关键词搜索定位文档，然后将深度分析委托给文档分析子 Agent，最后汇总结果。

## 工具

| 步骤 | 工具 | 返回 |
|------|------|------|
| 1 | searchDocsByKeyword(query) | [{docId, metadata, rank}] |
| 2 | analyzeDocument(docId, userQuery) | 子 Agent 深度分析结果（Markdown 格式） |
| 3 | reviewResult(query, result, sources) | 审查结果 |

## 流程

1. 从用户查询提取 2-5 个核心关键词，调用 searchDocsByKeyword
2. **搜索广度检查**：如果搜索结果 ≤2 篇，换一组关键词再搜索一轮，确保覆盖足够文档
3. 对搜索结果中排名靠前的文档调用 analyzeDocument 委托子 Agent 深度分析
   - **一次性并发调用**：将所有 analyzeDocument 放在同一条 assistant 消息中，系统会并行执行（最多同时 10 个）
   - 不要分批：等待全部并发结果返回后再继续，避免额外 LLM 往返
   - 每个 analyzeDocument 传入 docId 和原始用户查询，多个调用放在同一条 assistant 消息中即可并行执行（系统限制最多同时 10 个）
   - 子 Agent 返回 Markdown 格式分析，包含：## 相关性、## 概述、## 关键发现、## 数据来源、## 详细分析
4. 整理所有文档的分析结果，形成最终答案
   - 按文档逐一列出，每篇包含：文档标题、相关性、子 Agent 的「详细分析」原文
   - 不要用自己的话重新概括子 Agent 的分析——直接引用子 Agent 返回的内容
   - 对 relevance 为 low 的可压缩，none 的忽略
5. 调用 reviewResult 自检
   - 调用前先自我审视：当前结果是否全面覆盖了用户问题的各个方面？
   - 如有明显遗漏，主动补搜/补分析后再审查，避免浪费审查重试次数

## 输出格式

最终答案必须直接输出内容，绝对禁止以下形式：
- 禁止任何标题前缀（如"XX相关文档检索结果"、"检索结果"、"检索总结"）
- 禁止任何过渡性语句（如"以下是..."、"根据检索结果..."、"自检通过"）
- 禁止开头打招呼（如"您好"、"你好"）
- 禁止结尾总结（如"综上所述"、"以上结果供您参考"）
- 直接输出正文内容，按文档逐一列出即可

## 约束

- 最终答案必须包含原文引用和出处（nodeId）
- 步骤预算：单次 ≤20，含重试 ≤40
- 已获取的信息不要重复获取
- **批量并发**：同类型工具调用（如多个 analyzeDocument）放在同一条消息中一次发出，不要分批
- 首次检索结果少于 3 篇时，务必换关键词重新搜索

## 自检

检索完成后调用 reviewResult(query, result, sources)，sources 为 JSON 字符串如 '[{"docId":"abc","nodeId":"0001"}]'。
- pass → 返回结果
- partial / fail → 增量调整：扩大搜索范围、分析更多文档或更换分析角度，最多重试 2 次`

const DOC_ANALYZER_PROMPT = `你是一个文档深度分析员。分析单个文档中与用户查询相关的内容。

## 工具

| 工具 | 返回 |
|------|------|
| getDocStructure(docId) | 缩进树：nodeId + title，叶子尾随 summary，非叶子尾随 (目录) + prefixSummary |
| getDocNodeDetails(docId, nodeId) | 节点完整原文 |

## 流程

1. 调用 getDocStructure 获取文档结构，了解全貌
2. 识别与用户查询最相关的章节节点
3. 深入阅读相关节点的完整原文（getDocNodeDetails）
4. 综合分析后按以下格式输出

## 输出格式

按以下 Markdown 结构输出分析结果：

\`\`\`
## 相关性

high / medium / low / none

## 概述

文档中与查询相关的核心内容概述（2-3句）

## 关键发现

- 发现点1
- 发现点2

## 数据来源

- nodeId: 章节标题
- nodeId: 章节标题

## 详细分析

详细的原文分析和引用（必须包含 nodeId 出处）
\`\`\`


## 约束

- 步骤预算 ≤10
- 优先阅读最相关的章节
- 详细分析中必须包含原文引用和 nodeId 出处
- 如果文档与查询完全无关，相关性设为 "none"，概述说明原因
- 不要编造文档中不存在的内容`

function renderDocStructure(
    nodes: TreeNode<BaseDocNode>[],
    indent = 0
): string {
    const pad = '  '.repeat(indent)
    const lines: string[] = []
    for (const node of nodes) {
        const id = node.nodeId.split('_')[0]
        const v = node.value
        const isLeaf = node.nodes.length === 0
        lines.push(`${pad}${id} ${v.title}`)
        if (isLeaf && v.summary) {
            lines.push(`${pad}  ${v.summary}`)
        } else if (!isLeaf) {
            lines.push(`${pad}  (目录)`)
            if (v.prefixSummary) {
                lines.push(`${pad}  ${v.prefixSummary}`)
            }
            lines.push(
                renderDocStructure(
                    node.nodes as TreeNode<BaseDocNode>[],
                    indent + 1
                )
            )
        }
    }
    return lines.join('\n')
}

// ── Tool factories (shared by main agent and subagent) ────────

type ToolCtx = {
    cached: (key: string, fn: () => Promise<string>) => Promise<string>
    ok: (s: string) => AgentToolResult<any>
    tool: (fn: AgentTool['execute']) => AgentTool['execute']
    /** Progress callback for surfacing subagent steps to the user. */
    onStep?: (label: string) => void
}

function makeGetDocStructure({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocStructure',
        description: '获取文档结构（含标题和摘要），返回缩进树形文本。',
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
        }),
        execute: tool(async (_, p) => {
            const { docId } = p as { docId: string }
            const result = await cached(
                `getDocStructure:${docId}`,
                async () => {
                    const tree = await getFullTree<BaseDocNode>(`${docId}`)
                    return renderDocStructure(tree)
                }
            )
            return ok(result)
        }),
    }
}

function makeGetDocNodeDetails({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocNodeDetails',
        description: '获取文章节点详细原文',
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
            nodeId: Type.String({ description: '文章节点Id' }),
        }),
        execute: tool(async (_, p) => {
            const { docId, nodeId } = p as { docId: string; nodeId: string }
            const result = await cached(
                `getDocNodeDetails:${docId}:${nodeId}`,
                async () => {
                    const d = await getNodeDetails<BaseDocNode>(
                        `${nodeId}_${docId}`
                    )
                    return d?.text ?? ''
                }
            )
            return ok(result)
        }),
    }
}

function makeReviewResult(
    { ok, tool, onStep }: ToolCtx,
    modelOverride?: ModelProvider
): any {
    let reviewCount = 0
    return {
        name: 'reviewResult',
        description:
            '审查检索结果是否满足用户需求。完成检索后、回复用户前必须调用。' +
            '不通过时增量调整，不要从头搜索！',
        parameters: Type.Object({
            query: Type.String({ description: '用户原始查询' }),
            result: Type.String({ description: '准备返回给用户的检索结果' }),
            sources: Type.Optional(
                Type.String({
                    description:
                        '引用的数据源地址 JSON 字符串，格式：\'[{"docId":"abc","nodeId":"0001"}]\'',
                })
            ),
        }),
        execute: tool(async (_, p) => {
            const { query, result, sources } = p as {
                query: string
                result: string
                sources?: string
            }
            let parsed: SourceRef[] | undefined
            if (sources) {
                try {
                    const raw: unknown = sources
                    parsed = Array.isArray(raw)
                        ? (raw as SourceRef[])
                        : (JSON.parse(sources) as SourceRef[])
                } catch {
                    // ignore invalid sources
                }
            }
            reviewCount++
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
}

function makeSearchDocsByKeyword(ctx: ToolCtx, segmenter?: ModelProvider): any {
    const { cached, ok, tool } = ctx
    return {
        name: 'searchDocsByKeyword',
        description:
            '通过关键词在文档摘要中搜索相关文档。从用户查询中提取 2-5 个核心关键词传入。' +
            '返回 [{docId, metadata, rank}]，按匹配度降序。',
        parameters: Type.Object({
            query: Type.String({ description: '搜索关键词' }),
        }),
        execute: tool(async (_, p) => {
            const { query } = p as { query: string }
            const result = await cached(`searchDocsByKeyword:${query}`, () =>
                searchDocsByKeyword(query, segmenter)
            )
            return ok(result)
        }),
    }
}

// ── Document Analyzer Subagent ─────────────────────────────────

/**
 * Runs a subagent that deeply analyzes a single document against the user's
 * query. The subagent has its own tool set (getDocStructure,
 * getDocNodeDetails) and returns a structured Markdown analysis.
 */
async function analyzeDocument(
    docId: string,
    userQuery: string,
    onStep?: (label: string) => void,
    modelOverride?: ModelProvider
): Promise<string> {
    const provider = modelOverride ?? getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    subLog.info({
        docId: docId.slice(0, 8),
        model: `${provider.provider}/${provider.model}`,
        content: 'Subagent start',
    })

    const cache = new Map<string, string>()
    const subCtx: ToolCtx = {
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

    const MAX_STEPS = 10
    let stepCount = 0

    const subAgent = new Agent({
        initialState: {
            systemPrompt: DOC_ANALYZER_PROMPT,
            model,
            tools: [makeGetDocStructure(subCtx), makeGetDocNodeDetails(subCtx)],
        },
        beforeToolCall: async () => {
            stepCount++
            if (stepCount > MAX_STEPS) {
                subLog.warn({
                    docId: docId.slice(0, 8),
                    stepCount,
                    content: 'Subagent step budget exceeded, blocking tool',
                })
                return {
                    block: true,
                    reason: '已达到步骤预算上限，请基于已有信息输出最终分析结果',
                }
            }
        },
    })

    const toolStartTimes = new Map<string, number>()
    subAgent.subscribe((event) => {
        if (event.type === 'tool_execution_start') {
            toolStartTimes.set(event.toolCallId, performance.now())
            const label = buildStepLabel(
                event.toolName,
                (event.args as Record<string, unknown>) ?? {}
            )
            // Surface subagent progress to the user via the main onStep
            const shortDocId = docId.slice(0, 6)
            onStep?.(`[${shortDocId}] ${label}`)
            subLog.debug({
                docId: docId.slice(0, 8),
                toolName: event.toolName,
                stepCount,
                content: 'Subagent tool start',
            })
        }
        if (event.type === 'tool_execution_end') {
            const start = toolStartTimes.get(event.toolCallId)
            const elapsedMs =
                start !== undefined
                    ? Math.round(performance.now() - start)
                    : undefined
            const resultText =
                event.result?.content
                    ?.filter(
                        (it: { type: string; text?: string }) =>
                            it.type === 'text'
                    )
                    .map((it: { text?: string }) => it.text)
                    .join('') ?? ''
            const label = buildResultLabel(event.toolName, resultText)
            if (label) {
                onStep?.(`  ${label}`)
            }
            subLog.debug({
                docId: docId.slice(0, 8),
                toolName: event.toolName,
                resultLen: resultText.length,
                elapsedMs,
                content: 'Subagent tool end',
            })
        }
    })

    subLog.info({
        docId: docId.slice(0, 8),
        queryLen: userQuery.length,
        content: 'Subagent start',
    })

    await subAgent.prompt(
        `文档 ID: ${docId}\n用户查询: ${userQuery}\n\n请分析此文档中与查询相关的内容。`
    )

    const messages = subAgent.state.messages
    subLog.info({
        docId: docId.slice(0, 8),
        msgCount: messages.length,
        content: 'Subagent complete',
    })

    const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')

    const raw =
        lastAssistant?.content
            .filter((it) => it.type === 'text')
            .map((it) => it.text)
            .join('\n') ?? ''

    return (
        raw ||
        ['## 相关性', '', 'none', '', '## 概述', '', '子 Agent 无输出'].join(
            '\n'
        )
    )
}

/** Extract relevance and summary from the subagent's markdown output. */
function parseAnalyzeResult(raw: string): {
    relevance: string
    summary: string
} {
    const relMatch = raw.match(/##\s*相关性\s*\n+([^\n#]+)/i)
    const relevance = relMatch?.[1]?.trim().toLowerCase() || 'unknown'
    const sumMatch = raw.match(/##\s*概述\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i)
    const summary = sumMatch?.[1]?.trim() || raw.slice(0, 120)
    return { relevance, summary }
}

// ── Concurrency limiter ────────────────────────────────────────

const MAX_PARALLEL_ANALYZE = 10

class Semaphore {
    private waiters: (() => void)[] = []
    private running = 0
    constructor(private max: number) {}

    async acquire(): Promise<void> {
        if (this.running < this.max) {
            this.running++
            return
        }
        return new Promise<void>((resolve) => {
            this.waiters.push(resolve)
        })
    }

    release(): void {
        this.running--
        const next = this.waiters.shift()
        if (next) {
            this.running++
            next()
        }
    }
}

// ── Main Agent Tools ───────────────────────────────────────────

function makeAnalyzeDocument(
    { ok, tool, onStep }: ToolCtx,
    sem: Semaphore,
    modelOverride?: ModelProvider
): any {
    return {
        name: 'analyzeDocument',
        description:
            '委托子 Agent 深度分析单篇文档中与用户查询相关的内容。' +
            '返回 Markdown 格式分析（## 相关性 / ## 概述 / ## 关键发现 / ## 数据来源 / ## 详细分析）。' +
            `最多同时运行 ${MAX_PARALLEL_ANALYZE} 个，超出排队等待。`,
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
            userQuery: Type.String({
                description: '用户原始查询，透传给子 Agent',
            }),
        }),
        execute: tool(async (_, p) => {
            const { docId, userQuery } = p as {
                docId: string
                userQuery: string
            }
            await sem.acquire()
            try {
                const result = await analyzeDocument(
                    docId,
                    userQuery,
                    onStep,
                    modelOverride
                )
                return ok(result)
            } finally {
                sem.release()
            }
        }),
    }
}

function buildMainTools(
    segmenter?: ModelProvider,
    onStep?: (label: string) => void,
    subagentModel?: ModelProvider,
    reviewerModel?: ModelProvider
): any[] {
    const sem = new Semaphore(MAX_PARALLEL_ANALYZE)
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

    return [
        makeSearchDocsByKeyword(ctx, segmenter),
        makeAnalyzeDocument(ctx, sem, subagentModel),
        makeReviewResult(ctx, reviewerModel),
    ]
}

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

function summarizeResult(tool: string, raw: string): string {
    if (tool === 'getDocNodeDetails') {
        return `${raw.length} chars`
    }
    if (tool === 'getDocStructure') {
        const lines = raw.split('\n')
        const docTitle = lines
            .find((l) => /^\s*\d{4}\s/.test(l))
            ?.replace(/^\s*\d{4}\s/, '')
            .trim()
        if (docTitle) {
            return `"${ellipsis(docTitle, 40)}" · ${raw.length} chars`
        }
        return `${raw.length} chars`
    }
    if (tool === 'analyzeDocument') {
        const { relevance, summary } = parseAnalyzeResult(raw)
        return `${relevance}: ${ellipsis(summary, 80)}`
    }
    try {
        const parsed = JSON.parse(raw) as unknown
        if (tool === 'searchDocsByKeyword') {
            if (Array.isArray(parsed)) {
                const titles = (
                    parsed as Array<{ metadata?: Record<string, unknown> }>
                )
                    .map((d) => {
                        const meta = d.metadata
                        return meta &&
                            typeof meta === 'object' &&
                            'title' in meta
                            ? String(meta.title)
                            : ''
                    })
                    .filter(Boolean)
                const head = titles.slice(0, 3).join(', ')
                return `${parsed.length} docs: ${head}${titles.length > 3 ? '…' : ''}`
            }
        }
        if (tool === 'reviewResult') {
            if (typeof parsed === 'object' && parsed !== null) {
                const r = parsed as {
                    verdict?: string
                    score?: number
                    reason?: string
                }
                return `${r.verdict ?? '?'} (${r.score ?? '?'}/5): ${(r.reason ?? '').slice(0, 80)}`
            }
            return JSON.stringify(parsed).slice(0, 200)
        }
        if (Array.isArray(parsed)) {
            return `${parsed.length} records`
        }
        return JSON.stringify(parsed).slice(0, 200)
    } catch {
        return raw.slice(0, 200)
    }
}

function extractTrace(
    messages: AgentMessage[],
    toolTimings: Map<string, number>
): TraceStep[] {
    const trace: TraceStep[] = []
    const toolResultMap = new Map<string, string>()

    for (const msg of messages) {
        if (msg.role === 'toolResult') {
            const text = msg.content
                .filter((it) => it.type === 'text')
                .map((it) => it.text)
                .join('')
            toolResultMap.set(msg.toolCallId, text)
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
                resultSummary: summarizeResult(block.name, result),
                rawResult: result,
                elapsedMs: toolTimings.get(block.id) ?? 0,
            })
        }
    }

    return trace
}

// ── Context pruning: compact old doc structures instead of deleting ──
// Full text for the most recent N docs; older ones keep only nodeId + title
// lines (drop summary/prefixSummary content).

function compactDocText(text: string): string {
    return text
        .split('\n')
        .filter((line) => /^\s*\d{4} /.test(line) || line.includes('(目录)'))
        .join('\n')
}

/**
 * Compact older analyzeDocument results to save context.
 * Keep the N most recent full; compact the rest to just relevance + summary.
 */
function compactAnalyzeResult(text: string): string {
    const { relevance, summary } = parseAnalyzeResult(text)
    return `[compacted] relevance=${relevance} summary=${ellipsis(summary, 100)}`
}

function pruneContext(messages: AgentMessage[]): AgentMessage[] {
    const MAX_FULL = 5

    // Scan from the end to find analyzeDocument result positions
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

    // Indices from the end: structIndices[0] is the most recent
    // Keep MAX_FULL most recent as-is, compact the rest
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
            content: [
                {
                    type: 'text' as const,
                    text: compacted,
                },
            ],
        }
    })
}

function buildStepLabel(
    toolName: string,
    args: Record<string, unknown>
): string {
    switch (toolName) {
        case 'searchDocsByKeyword':
            return `Searching: "${ellipsis(String(args.query ?? ''), 36)}"...`
        case 'analyzeDocument':
            return `Analyzing document ${(String(args.docId ?? '')).slice(0, 8)}...`
        case 'getDocStructure':
            return 'Loading document structure...'
        case 'getDocNodeDetails':
            return `Reading section ${args.nodeId ?? '?'}...`
        case 'reviewResult':
            return 'Reviewing results...'
        default:
            return `Calling ${toolName}...`
    }
}

function buildResultLabel(
    toolName: string,
    resultText: string
): string | undefined {
    if (!resultText) return undefined
    try {
        switch (toolName) {
            case 'analyzeDocument': {
                const { relevance } = parseAnalyzeResult(resultText)
                const kb = (resultText.length / 1024).toFixed(1)
                return `Analysis: ${relevance} · ${kb}KB`
            }
            case 'getDocStructure': {
                const lines = resultText.split('\n')
                const firstTitle = lines
                    .find((l) => /^\s*\d{4}\s/.test(l))
                    ?.replace(/^\s*\d{4}\s/, '')
                    .trim()
                if (firstTitle && firstTitle.length > 0) {
                    return `Loaded "${ellipsis(firstTitle, 40)}" · ${resultText.length} chars`
                }
                return `Loaded structure · ${resultText.length} chars`
            }
            case 'searchDocsByKeyword': {
                const parsed = JSON.parse(resultText) as Array<{
                    metadata?: string
                }>
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const titles = parsed
                        .map((d) => {
                            try {
                                return (
                                    JSON.parse(d.metadata ?? '{}') as {
                                        title?: string
                                    }
                                ).title
                            } catch {
                                return ''
                            }
                        })
                        .filter(Boolean)
                    if (titles.length > 0) {
                        const preview = titles.slice(0, 3).join(', ')
                        return `Found ${parsed.length} result${parsed.length > 1 ? 's' : ''}: ${preview}${titles.length > 3 ? '...' : ''}`
                    }
                    return `Found ${parsed.length} results`
                }
                return undefined
            }
            default:
                return undefined
        }
    } catch {
        return undefined
    }
}

function ellipsis(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}...` : s
}

function buildToolDetail(
    toolName: string,
    args: Record<string, unknown>
): string {
    switch (toolName) {
        case 'searchDocsByKeyword':
            return `"${String(args.query ?? '')}"`
        case 'analyzeDocument':
            return `doc=${(String(args.docId ?? '')).slice(0, 8)}`
        case 'getDocStructure':
            return `doc=${(String(args.docId ?? '')).slice(0, 8)}`
        case 'getDocNodeDetails':
            return `doc=${(String(args.docId ?? '')).slice(0, 8)}/${args.nodeId ?? '?'}`
        case 'reviewResult':
            return `"${ellipsis(String(args.query ?? ''), 60)}"`
        default:
            return ''
    }
}

async function librarian(
    msg: string,
    onStep?: (label: string) => void,
    opts?: {
        segmenter?: ModelProvider
        subagentModel?: ModelProvider
        reviewerModel?: ModelProvider
    }
): Promise<LibrarianResult> {
    const provider = getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    log.info({
        model: `${provider.provider}/${provider.model}`,
        content: 'Librarian session start',
    })

    const agent = new Agent({
        initialState: {
            systemPrompt: PROMPT,
            model,
            tools: buildMainTools(
                opts?.segmenter,
                onStep,
                opts?.subagentModel,
                opts?.reviewerModel
            ),
        },
        transformContext: async (messages) => pruneContext(messages),
    })

    if (onStep) {
        agent.subscribe((event) => {
            if (event.type === 'tool_execution_start') {
                onStep(
                    buildStepLabel(
                        event.toolName,
                        (event.args as Record<string, unknown>) ?? {}
                    )
                )
            }
            if (event.type === 'tool_execution_end') {
                const resultText =
                    event.result?.content
                        ?.filter(
                            (it: { type: string; text?: string }) =>
                                it.type === 'text'
                        )
                        .map((it: { text?: string }) => it.text)
                        .join('') ?? ''
                const label = buildResultLabel(event.toolName, resultText)
                if (label) {
                    onStep(label)
                }
            }
        })
    }

    // Bridge Agent events to our logger for traceability
    const toolStartTimes = new Map<string, number>()
    const toolTimings = new Map<string, number>()

    agent.subscribe((event) => {
        if (event.type === 'tool_execution_start') {
            toolStartTimes.set(event.toolCallId, performance.now())
            log.info({
                toolName: event.toolName,
                detail: buildToolDetail(
                    event.toolName,
                    (event.args as Record<string, unknown>) ?? {}
                ),
                content: 'Tool start',
            })
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
            const resultText =
                event.result?.content
                    ?.filter(
                        (it: { type: string; text?: string }) =>
                            it.type === 'text'
                    )
                    .map((it: { text?: string }) => it.text)
                    .join('') ?? ''
            log.info({
                toolName: event.toolName,
                resultLen: resultText.length,
                resultSummary: summarizeResult(event.toolName, resultText),
                elapsedMs,
                content: 'Tool end',
            })
        }
    })

    await agent.prompt(msg)

    const messages = agent.state.messages
    log.info({
        msgCount: messages.length,
        content: 'Agent prompt complete',
    })

    const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant')

    const content =
        lastAssistant?.content
            .filter((it) => it.type === 'text')
            .map((it) => it.text)
            .join('\n') ?? ''

    const trace = extractTrace(messages, toolTimings)

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

export type { LibrarianResult, TraceStep }
export { librarian }
