/** biome-ignore-all lint/suspicious/noExplicitAny: AgentTool type constraints */
import type {
    AgentMessage,
    AgentTool,
    AgentToolResult,
} from '@earendil-works/pi-agent-core'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, Type } from '@earendil-works/pi-ai'
import { logger } from '../config'
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

const log = logger.child({ module: 'librarian' })

const BASE_PROMPT = `你是一个文档检索 Librarian。你的任务是根据用户的查询，按可用的查找链路逐步缩小范围，最终返回最相关的文档片段原文。

## 可用查找链路

### 链路 1：分类渐进式查找

路径: categories → tags → docs → tree → node

每一步必须严格按顺序执行，不可跳步：

| 步骤 | 工具 | 何时调用 | 返回内容 |
|------|------|----------|----------|
| 1 | getCategories | 用户有检索需求时，先了解有哪些分类 | [{id, content}] 所有分类 |
| 2 | getTagsByCategory | 根据用户意图选择相关分类后，查看该分类下的标签 | [{id, tag}] 标签列表 |
| 3 | getDocsByTag | 选择相关标签后，查找关联的文档 | [{id, metadata}] 文档列表 |
| 4 | getDocStructure | 锁定候选文档后，查看文档结构（标题+摘要树） | 树形结构，每个节点含 title、summary 或 prefixSummary |
| 5 | getDocNodeDetails | 根据 summary/prefixSummary 确定相关节点后，获取该节点完整文本 | 节点的完整 text |

## 数据结构说明

### getDocStructure 返回的格式
每个节点占一行，包含 nodeId 和 title。子节点缩进 2 空格。
- **叶子节点**：紧跟一行 summary（缩进 2 空格）
- **非叶子节点**：紧跟 (目录) 标记和 prefixSummary（缩进 2 空格），然后缩进显示子节点

示例：
0000 文档根标题
  根摘要内容...
  0001 (目录) 章节标题
    ## 章节标题
    0002 叶子节点
      该叶子节点的摘要...

### getDocNodeDetails 返回
- 节点的完整原始文本（text 字段）

## 查找原则

1. 严格按链路顺序逐层下钻，不要跳步
2. 每一步根据返回数据快速判断，每层只选最相关的 1-3 个候选，不要贪多
3. 如果某层没有匹配结果，回溯到上一层尝试其他选项
4. 最终返回给用户的应该是 getDocNodeDetails 取得的完整文本，而非 summary
5. 如果多个节点都相关，可以多次调用 getDocNodeDetails 获取所有相关内容

## 效率约束（必须遵守）

| 规则 | 说明 |
|------|------|
| 分类只查一次 | getCategories 返回的分类列表不会变化，整个检索过程中只调用一次 |
| 标签按需查 | 只查与查询主题明显相关的分类下的标签，无需浏览所有分类 |
| 文档结构限量 | getDocStructure 只在锁定候选后调用，单次检索不超过 5 个文档 |
| 优先纵深 | 找到一个有希望的文档后，先把它看完（getDocNodeDetails），再考虑其他 |
| 总步骤预算 | 单次检索（不含重试）控制在 10 步以内；含重试总共不超过 25 步 |
| 记住已有信息 | 已经获取过的分类、标签、文档结构不要重复获取 |

## 自检流程

完成检索后，在返回给用户之前，必须执行自检：

1. 调用 reviewResult 工具，传入：用户原始查询(query)、检索结果(result)、以及所有引用节点的地址(sources) —— 注意 sources 必须是 **JSON 字符串**，例如：'[{"docId":"abc","nodeId":"0001"}]'（不是 JSON 对象/数组，是字符串）
2. 根据审查结果 verdict 字段决定下一步：
   - "pass"：直接将检索结果返回给用户
   - "partial" 或 "fail"：根据 suggestion **增量调整**检索策略，不要从头开始：
     - 文档选错了 → 回到标签层，换一个候选标签
     - 节点选错了 → 回到 getDocStructure，换节点
     - 信息不够 → 补充调用 getDocNodeDetails 获取更多节点
     - 只有在标签层没有更多候选时，才回到分类层
3. 重试时不要再调用 getCategories（分类不会变）
4. 最多重试 2 次；如果仍不通过，将最后一次结果和审查意见一并返回给用户`

function buildPrompt(): string {
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

function buildTools(): any {
    const cache = new Map<string, string>()
    const cached = async (
        key: string,
        fn: () => Promise<string>
    ): Promise<string> => {
        if (cache.has(key)) return Promise.resolve(cache.get(key)!)
        return fn().then((r) => {
            cache.set(key, r)
            return r
        })
    }

    const ok = (s: string): AgentToolResult<any> => ({
        content: [{ type: 'text' as const, text: s }],
        details: {},
    })

    // Narrow execute type so we can destructure params safely
    type Ex = AgentTool['execute']
    const tool = (fn: Ex): Ex => fn

    return [
        {
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
        },
        {
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
        },
        {
            name: 'getDocsByTag',
            description:
                '根据标签 ID 获取关联的所有文档，返回 [{id, metadata}]',
            parameters: Type.Object({
                tagId: Type.String({ description: '标签 ID' }),
            }),
            execute: tool(async (_, p) => {
                const { tagId } = p as { tagId: string }
                const result = await cached(
                    `getDocsByTag:${tagId}`,
                    async () => {
                        const docs = await getDocsByTag(tagId)
                        return JSON.stringify(docs)
                    }
                )
                return ok(result)
            }),
        },
        {
            name: 'getDocStructure',
            description:
                '获取文档结构（含标题和摘要），返回缩进树形文本，每行 nodeId + title。叶子节点跟 summary，非叶子节点跟 (目录) + prefixSummary。只对最有把握的少量文档调用（≤5个），先纵深看完一个再考虑下一个。',
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
        },
        {
            name: 'getDocNodeDetails',
            description: '获取文章节点详细信息',
            parameters: Type.Object({
                docId: Type.String({ description: '文章Id' }),
                nodeId: Type.String({ description: '文章节点Id' }),
            }),
            execute: tool(async (_, p) => {
                const { docId, nodeId } = p as {
                    docId: string
                    nodeId: string
                }
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
        },
        {
            name: 'reviewResult',
            description:
                '审查检索结果是否满足用户需求。完成检索后、回复用户前必须调用此工具。传入用户原始查询、准备返回的检索结果，以及引用数据源的地址列表（docId + nodeId）。Reviewer 会根据地址自行获取原文验证。' +
                '如果不通过需要重试：增量调整即可，不要重新浏览分类！',
            parameters: Type.Object({
                query: Type.String({ description: '用户原始查询' }),
                result: Type.String({
                    description: '准备返回给用户的检索结果',
                }),
                sources: Type.Optional(
                    Type.String({
                        description:
                            '引用的数据源地址，必须是 JSON 字符串（注意：是字符串不是数组）。' +
                            '格式：\'[{"docId":"abc123","nodeId":"0001"}]\'。从 getDocNodeDetails 获取的每个节点都应在列表中。',
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
        },
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

const stepLabels: Record<string, string> = {
    getCategories: 'Browsing categories...',
    getTagsByCategory: 'Checking tags...',
    getDocsByTag: 'Finding documents...',
    getDocStructure: 'Loading document structure...',
    getDocNodeDetails: 'Reading section...',
    reviewResult: 'Reviewing results...',
}

async function librarian(
    msg: string,
    onStep?: (label: string) => void
): Promise<LibrarianResult> {
    const provider = getModelProvider()
    const model = getModel(provider.provider as never, provider.model)

    const agent = new Agent({
        initialState: {
            systemPrompt: buildPrompt(),
            model,
            tools: buildTools(),
        },
        transformContext: async (messages) => pruneContext(messages),
    })

    if (onStep) {
        agent.subscribe((event) => {
            if (event.type === 'tool_execution_start') {
                onStep(
                    stepLabels[event.toolName] ?? `Calling ${event.toolName}...`
                )
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
