import { Type } from '@earendil-works/pi-ai'
import type { ModelProvider } from '../config'
import {
    getCategories,
    getDocsByTag,
    getFullTree,
    getNodeDetails,
    getTagsByCategory,
} from '../store'
import type { BaseDocNode, TreeNode } from '../tree/type'
import { type ContextDef, call, type ToolDef } from './base'
import type { ReviewResult, SourceRef } from './reviewer'
import { reviewer } from './reviewer'
import { makeSearchSimilarTagsTool } from './tools'

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

### getDocStructure 返回的节点
- 每个节点包含 nodeId、title
- **叶子节点**（无子节点）：有 summary 字段，是该节点内容的摘要
- **非叶子节点**（有子节点）：有 prefixSummary 字段，概括该子树覆盖的内容范围；同时有 nodes 数组包含子节点
- 叶子节点和非叶子节点不会同时有 summary 和 prefixSummary

### getDocNodeDetails 返回
- 节点的完整原始文本（text 字段）

## 查找原则

1. 严格按链路顺序逐层下钻，不要跳步
2. 每一步根据返回数据判断下一步选择哪个 id；如果有多个候选，优先选择与用户查询最相关的
3. 如果某层没有匹配结果，回溯到上一层尝试其他选项
4. 最终返回给用户的应该是 getDocNodeDetails 取得的完整文本，而非 summary
5. 如果多个节点都相关，可以多次调用 getDocNodeDetails 获取所有相关内容

> 后续新增查找链路时，在上方「可用查找链路」区域追加即可。

## 自检流程

完成检索后，在返回给用户之前，必须执行自检：

1. 调用 reviewResult 工具，传入：用户原始查询(query)、检索结果(result)、以及所有引用节点的地址(sources) —— JSON 数组格式 [{"docId":"...","nodeId":"..."}]。Reviewer 会根据地址自行获取原文验证
2. 根据审查结果 verdict 字段决定下一步：
   - "pass"：直接将检索结果返回给用户
   - "partial" 或 "fail"：根据 suggestion 调整检索策略，重新查找
     - 可能方向：切换其他分类/标签、选择同一文档的其他节点、回溯到上一层
3. 最多重试 2 次；如果仍不通过，将最后一次结果和审查意见一并返回给用户`

const LINK2_PROMPT = `
### 链路 2：语义标签直搜（快速路径，推荐优先尝试）

路径: query → searchSimilarTags → docs → tree → node

1. **searchSimilarTags**：将用户的查询转换为语义向量，在标签库中搜索最相似的标签。传入 query（查询文本），可选 categoryId 限定分类。返回 [{tagId, tag, similarity}]
2. 选择 similarity 最高的 3-5 个标签，调用 getDocsByTag 获取关联文档
3. 之后与链路 1 的步骤 4-5 相同：getDocStructure → getDocNodeDetails

> 此路径比链路 1 快，适合目标明确的查询。如果 searchSimilarTags 返回空结果或无高质量匹配（similarity < 0.7），回退到链路 1。`

function buildPrompt(hasEmbedding: boolean): string {
    if (!hasEmbedding) return BASE_PROMPT
    return BASE_PROMPT.replace(
        '> 后续新增查找链路时，在上方「可用查找链路」区域追加即可。',
        `> 后续新增查找链路时，在上方「可用查找链路」区域追加即可。${LINK2_PROMPT}`
    )
}

function reorderDict<T extends Record<string, unknown>>(
    data: T,
    keyOrder: string[]
): Partial<T> {
    const result: Record<string, unknown> = {}
    for (const key of keyOrder) {
        if (key in data) {
            result[key] = data[key]
        }
    }
    return result as Partial<T>
}

function formatStructure<T>(
    structure: TreeNode<T>[],
    valueKeyOrder: string[]
): TreeNode<T>[] {
    return structure.map((node) => {
        const formatted: Record<string, unknown> = {}
        formatted.nodeId = node.nodeId.split('_')[0]
        formatted.value = reorderDict(
            node.value as unknown as Record<string, unknown>,
            valueKeyOrder
        )
        if (node.nodes.length > 0) {
            formatted.nodes = formatStructure(node.nodes, valueKeyOrder)
        }
        return formatted as unknown as TreeNode<T>
    })
}

function cleanNode(tree: TreeNode<BaseDocNode>[]) {
    return formatStructure(tree, ['title', 'summary', 'prefixSummary'])
}

function buildTools(embeddingProvider?: ModelProvider): ToolDef[] {
    const base: ToolDef[] = [
        {
            name: 'getCategories',
            description: '获取所有分类列表，返回 [{id, content}]',
            parameters: Type.Object({}),
            run: async () => {
                const categories = await getCategories()
                return JSON.stringify(categories)
            },
        },
        {
            name: 'getTagsByCategory',
            description: '根据分类 ID 获取该分类下的所有标签，返回 [{id, tag}]',
            parameters: Type.Object({
                categoryId: Type.String({ description: '分类 ID' }),
            }),
            run: async ({ categoryId }: { categoryId: string }) => {
                const tags = await getTagsByCategory(categoryId)
                return JSON.stringify(tags)
            },
        },
        {
            name: 'getDocsByTag',
            description:
                '根据标签 ID 获取关联的所有文档，返回 [{id, metadata}]',
            parameters: Type.Object({
                tagId: Type.String({ description: '标签 ID' }),
            }),
            run: async ({ tagId }: { tagId: string }) => {
                const docs = await getDocsByTag(tagId)
                return JSON.stringify(docs)
            },
        },
        {
            name: 'getDocStructure',
            description:
                '获取文档结构（含标题和摘要），返回树形结构，每个节点含 title、summary（叶子）或 prefixSummary（非叶子）',
            parameters: Type.Object({
                docId: Type.String({ description: '文章Id' }),
            }),
            run: async ({ docId }: { docId: string }) => {
                const tree = await getFullTree<BaseDocNode>(`${docId}`)
                return JSON.stringify(cleanNode(tree))
            },
        },
        {
            name: 'getDocNodeDetails',
            description: '获取文章节点详细信息',
            parameters: Type.Object({
                docId: Type.String({ description: '文章Id' }),
                nodeId: Type.String({ description: '文章节点Id' }),
            }),
            run: async ({
                docId,
                nodeId,
            }: {
                docId: string
                nodeId: string
            }) => {
                const d = await getNodeDetails<BaseDocNode>(
                    `${nodeId}_${docId}`
                )
                return d?.text ?? ''
            },
        },
        {
            name: 'reviewResult',
            description:
                '审查检索结果是否满足用户需求。完成检索后、回复用户前必须调用此工具。传入用户原始查询、准备返回的检索结果，以及引用数据源的地址列表（docId + nodeId）。Reviewer 会根据地址自行获取原文验证。',
            parameters: Type.Object({
                query: Type.String({ description: '用户原始查询' }),
                result: Type.String({
                    description: '准备返回给用户的检索结果',
                }),
                sources: Type.Optional(
                    Type.String({
                        description:
                            '引用的数据源地址，JSON 数组格式：[{"docId":"...","nodeId":"..."}]。从 getDocNodeDetails 获取的每个节点都应在列表中。',
                    })
                ),
            }),
            run: async ({
                query,
                result,
                sources,
            }: {
                query: string
                result: string
                sources?: string
            }) => {
                let parsed: SourceRef[] | undefined
                if (sources) {
                    try {
                        parsed = JSON.parse(sources) as SourceRef[]
                    } catch {
                        // ignore invalid sources
                    }
                }
                const review = await reviewer(query, result, parsed)
                return JSON.stringify(review)
            },
        },
    ]

    if (embeddingProvider) {
        base.unshift(makeSearchSimilarTagsTool(embeddingProvider))
    }

    return base
}

type TraceStep = {
    tool: string
    args: Record<string, unknown>
    resultSummary: string
    rawResult: string
}

type LibrarianResult = {
    content: string
    trace: TraceStep[]
    review?: ReviewResult
}

function summarizeResult(tool: string, raw: string): string {
    if (tool === 'getDocNodeDetails') {
        const len = raw.length
        return len > 200
            ? `文本片段（${len} 字符）：${raw.slice(0, 200)}...`
            : raw
    }
    try {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
            return `返回 ${parsed.length} 条记录`
        }
        if (tool === 'reviewResult') {
            return JSON.stringify(parsed)
        }
        return JSON.stringify(parsed).slice(0, 200)
    } catch {
        return raw.slice(0, 200)
    }
}

function extractTrace(messages: ContextDef['messages']): TraceStep[] {
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
            })
        }
    }

    return trace
}

const stepLabels: Record<string, string> = {
    searchSimilarTags: 'Searching similar tags...',
    getCategories: 'Browsing categories...',
    getTagsByCategory: 'Checking tags...',
    getDocsByTag: 'Finding documents...',
    getDocStructure: 'Loading document structure...',
    getDocNodeDetails: 'Reading section...',
    reviewResult: 'Reviewing results...',
}

async function librarian(
    msg: string,
    onStep?: (label: string) => void,
    embeddingProvider?: ModelProvider
): Promise<LibrarianResult> {
    const context: ContextDef = {
        systemPrompt: buildPrompt(!!embeddingProvider),
        messages: [
            {
                role: 'user',
                content: msg,
                timestamp: Date.now(),
            },
        ],
        tools: buildTools(embeddingProvider),
        onToolCall: onStep
            ? (name) => onStep(stepLabels[name] ?? `Calling ${name}...`)
            : undefined,
    }

    const lastMsg = await call(context)

    const content = lastMsg.content
        .filter((it) => it.type === 'text')
        .map((it) => it.text)
        .join('\n')

    const trace = extractTrace(context.messages)

    // Extract last review from reviewResult tool calls
    let review: ReviewResult | undefined
    for (const step of [...trace].reverse()) {
        if (step.tool === 'reviewResult') {
            try {
                review = JSON.parse(step.rawResult) as ReviewResult
            } catch {
                // ignore parse error
            }
            break
        }
    }

    return { content, trace, review }
}

export type { LibrarianResult, TraceStep }
export { librarian }
