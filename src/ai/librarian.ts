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
import {
    getCategories,
    getDocsByTag,
    getFullTree,
    getNodeDetails,
    getTagsByCategory,
} from '../store'
import type { BaseDocNode, TreeNode } from '../tree/type'
import { getModelProvider } from './base'
import type { ReviewResult, SourceRef } from './reviewer'
import { reviewer } from './reviewer'
import { searchDocsByKeyword } from './tools'

const log = logger.child({ module: 'librarian' })

const BASE_PROMPT = `你是一个文档检索 Librarian。按 categories → tags → docs → tree → node 逐层缩小范围，返回最相关的文档原文。

## 步骤

| 步骤 | 工具 | 返回 |
|------|------|------|
| 1 | getCategories | [{id, content}] |
| 2 | getTagsByCategory(categoryId) | [{id, tag}] |
| 3 | getDocsByTag(tagId) | [{id, metadata}] |
| 4 | getDocStructure(docId) | 缩进树：每行 nodeId + title，叶子尾随 summary，非叶子尾随 (目录) + prefixSummary |
| 5 | getDocNodeDetails(docId, nodeId) | 节点完整原文 |

## 约束

- 严格按顺序，不可跳步；无匹配时回溯到上一层换候选
- 每层只选 1-3 个最相关候选；文档结构最多看 5 个
- 优先纵深：先看完一个文档的全部相关节点，再看下一个
- 最终返回 getDocNodeDetails 的原文，不是 summary
- 步骤预算：单次 ≤10，含重试 ≤25；已获取的信息不要重复

## 自检

检索完成后调用 reviewResult(query, result, sources)，sources 为 JSON 字符串如 '[{"docId":"abc","nodeId":"0001"}]'。
- pass → 返回结果
- partial / fail → 增量调整（换标签 / 换节点 / 补节点），不重查 categories，最多重试 2 次`

const QUICK_PROMPT = `你是一个文档检索 Librarian（快速模式）。通过关键词直达文档，跳过分类/标签。

## 步骤

| 步骤 | 工具 | 返回 |
|------|------|------|
| 1 | searchDocsByKeyword(query) | [{docId, metadata, rank}] |
| 2 | getDocStructure(docId) | 缩进树：每行 nodeId + title，叶子尾随 summary，非叶子尾随 (目录) + prefixSummary |
| 3 | getDocNodeDetails(docId, nodeId) | 节点完整原文 |

## 约束

- 从用户查询提取 2-5 个核心关键词，优先专业术语
- 文档结构最多看 5 个；优先纵深看完一个再看下一个
- 最终返回 getDocNodeDetails 的原文，不是 summary
- 步骤预算：单次 ≤8，含重试 ≤20；已获取的信息不要重复

## 自检

检索完成后调用 reviewResult(query, result, sources)，sources 为 JSON 字符串如 '[{"docId":"abc","nodeId":"0001"}]'。
- pass → 返回结果
- partial / fail → 增量调整（换文档 / 换节点 / 补节点），最多重试 2 次`

function buildPrompt(quick?: boolean): string {
    if (quick) {
        return QUICK_PROMPT
    }
    return BASE_PROMPT
}

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

// ── Tool factories (shared helpers) ──────────────────────────

type ToolCtx = {
    cached: (key: string, fn: () => Promise<string>) => Promise<string>
    ok: (s: string) => AgentToolResult<any>
    tool: (fn: AgentTool['execute']) => AgentTool['execute']
}

function makeGetDocStructure({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocStructure',
        description:
            '获取文档结构（含标题和摘要），返回缩进树形文本。只对最有把握的少量文档调用（≤5个），先纵深看完一个再考虑下一个。',
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
        description: '获取文章节点详细信息',
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

function makeReviewResult({ ok, tool }: ToolCtx): any {
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
            const review = await reviewer(query, result, parsed)
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

function makeGetCategories({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getCategories',
        description:
            '获取所有分类列表，返回 [{id, content}]。分类列表不变，整个检索只需调用一次！',
        parameters: Type.Object({}),
        execute: tool(async () => {
            const result = await cached('getCategories', async () => {
                const categories = await getCategories()
                return JSON.stringify(categories)
            })
            return ok(result)
        }),
    }
}

function makeGetTagsByCategory({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getTagsByCategory',
        description:
            '根据分类 ID 获取该分类下的所有标签，返回 [{id, tag}]。只查与查询主题明显相关的分类，无需遍历所有分类。',
        parameters: Type.Object({
            categoryId: Type.String({ description: '分类 ID' }),
        }),
        execute: tool(async (_, p) => {
            const { categoryId } = p as { categoryId: string }
            const result = await cached(
                `getTagsByCategory:${categoryId}`,
                async () => {
                    const tags = await getTagsByCategory(categoryId)
                    return JSON.stringify(tags)
                }
            )
            return ok(result)
        }),
    }
}

function makeGetDocsByTag({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocsByTag',
        description: '根据标签 ID 获取关联的所有文档，返回 [{id, metadata}]',
        parameters: Type.Object({
            tagId: Type.String({ description: '标签 ID' }),
        }),
        execute: tool(async (_, p) => {
            const { tagId } = p as { tagId: string }
            const result = await cached(`getDocsByTag:${tagId}`, async () => {
                const docs = await getDocsByTag(tagId)
                return JSON.stringify(docs)
            })
            return ok(result)
        }),
    }
}

// ── Builder ───────────────────────────────────────────────────

function buildTools(segmenter?: ModelProvider, quick?: boolean): any[] {
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

    const shared = [
        makeGetDocStructure(ctx),
        makeGetDocNodeDetails(ctx),
        makeReviewResult(ctx),
    ]

    if (quick) {
        return [makeSearchDocsByKeyword(ctx, segmenter), ...shared]
    }

    return [
        makeGetCategories(ctx),
        makeGetTagsByCategory(ctx),
        makeGetDocsByTag(ctx),
        ...shared,
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
        const nodeCount = raw.split('\n').filter((l) => l.trim()).length
        return `${nodeCount} nodes`
    }
    try {
        const parsed = JSON.parse(raw) as unknown
        if (tool === 'getCategories') {
            if (Array.isArray(parsed)) {
                const names = (parsed as Array<{ content?: string }>)
                    .map((c) => c.content ?? '')
                    .filter(Boolean)
                const head = names.slice(0, 5).join(', ')
                return `${parsed.length} categories: ${head}${names.length > 5 ? '…' : ''}`
            }
        }
        if (tool === 'getTagsByCategory') {
            if (Array.isArray(parsed)) {
                const names = (parsed as Array<{ tag?: string }>)
                    .map((t) => t.tag ?? '')
                    .filter(Boolean)
                const head = names.slice(0, 6).join(', ')
                return `${parsed.length} tags: ${head}${names.length > 6 ? '…' : ''}`
            }
        }
        if (tool === 'getDocsByTag') {
            if (Array.isArray(parsed)) {
                const titles = (parsed as Array<{ metadata?: string }>)
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

function pruneContext(messages: AgentMessage[]): AgentMessage[] {
    const MAX_FULL = 5

    // Scan from the end to find doc structure positions
    const structIndices: number[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (
            msg &&
            msg.role === 'toolResult' &&
            'toolName' in msg &&
            msg.toolName === 'getDocStructure'
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
        return {
            ...msg,
            content: [
                {
                    type: 'text' as const,
                    text: compactDocText(c.text),
                },
            ],
        }
    })
}

const CATEGORY_LABELS: Record<string, string> = {
    cat_000: '计算机与信息技术',
    cat_100: '哲学与心理学',
    cat_200: '社会科学',
    cat_300: '经济与管理',
    cat_400: '语言与教育',
    cat_500: '数学与自然科学',
    cat_600: '工程与技术',
    cat_700: '医学与健康',
    cat_800: '艺术与设计',
    cat_900: '文学与写作',
    cat_A00: '历史与地理',
    cat_B00: '法律与政治',
}

function buildStepLabel(
    toolName: string,
    args: Record<string, unknown>
): string {
    switch (toolName) {
        case 'getCategories':
            return 'Browsing categories...'
        case 'getTagsByCategory': {
            const cid = args.categoryId as string | undefined
            const name = cid ? CATEGORY_LABELS[cid] : undefined
            return name ? `Browsing tags in "${name}"...` : 'Browsing tags...'
        }
        case 'getDocsByTag':
            return 'Finding documents by tag...'
        case 'searchDocsByKeyword':
            return `Searching: "${ellipsis(String(args.query ?? ''), 36)}"...`
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
            case 'getDocStructure': {
                const lines = resultText.split('\n')
                const firstTitle = lines
                    .find((l) => /^\s*\d{4}\s/.test(l))
                    ?.replace(/^\s*\d{4}\s/, '')
                    .trim()
                const nodeCount = lines.filter((l) => l.trim()).length
                if (firstTitle && firstTitle.length > 0) {
                    return `Loaded "${ellipsis(firstTitle, 40)}" · ${nodeCount} nodes`
                }
                return `Loaded structure · ${nodeCount} nodes`
            }
            case 'getTagsByCategory': {
                const parsed = JSON.parse(resultText) as Array<{
                    tag?: string
                }>
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const names = parsed.map((t) => t.tag ?? '').filter(Boolean)
                    if (names.length > 0) {
                        const preview = names.slice(0, 5).join(', ')
                        return `Found ${parsed.length} tag${parsed.length > 1 ? 's' : ''}: ${preview}${names.length > 5 ? '...' : ''}`
                    }
                    return `Found ${parsed.length} tags`
                }
                return undefined
            }
            case 'getDocsByTag': {
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
                        return `Found ${parsed.length} doc${parsed.length > 1 ? 's' : ''}: ${preview}${titles.length > 3 ? '...' : ''}`
                    }
                    return `Found ${parsed.length} docs`
                }
                return undefined
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

async function librarian(
    msg: string,
    onStep?: (label: string) => void,
    opts?: { quick?: boolean; segmenter?: ModelProvider }
): Promise<LibrarianResult> {
    const provider = getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    const agent = new Agent({
        initialState: {
            systemPrompt: buildPrompt(opts?.quick),
            model,
            tools: buildTools(opts?.segmenter, opts?.quick),
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
                args: event.args,
                content: 'Tool start',
            })
        }
        if (event.type === 'tool_execution_end') {
            const start = toolStartTimes.get(event.toolCallId)
            if (start !== undefined) {
                toolTimings.set(
                    event.toolCallId,
                    Math.round(performance.now() - start)
                )
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
