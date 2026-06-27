import { getFullTree, getNodeDetails } from '../../store/index.ts'
import type { BaseDocNode, TreeNode } from '../../tree/type.ts'
import { Type } from '../base.ts'
import type { ToolCtx } from '../types.ts'

export function ellipsis(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}...` : s
}

/** Format char count as human-readable: "500 chars" or "2.5k chars". */
export function formatSize(chars: number): string {
    if (chars >= 1000) return `${(chars / 1000).toFixed(1)}k chars`
    return `${chars} chars`
}

export function renderDocStructure(
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

/** Extract text content from a tool result, joining all text parts. */
export function extractResultText(
    result: { content?: Array<{ type: string; text?: string }> } | undefined
): string {
    if (!result?.content) return ''
    return result.content
        .filter((it) => it.type === 'text')
        .map((it) => it.text ?? '')
        .join('')
}

// ── Shared tool factories ─────────────────────────────────────

/**
 * Creates a `getDocStructure` tool for document sub-agents.
 * Returns the full document tree rendered as indented text.
 */
// biome-ignore lint/suspicious/noExplicitAny: AgentTool type constraints
export function makeGetDocStructure({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocStructure',
        description: '获取文档结构（含标题和摘要），返回缩进树形文本。',
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
        }),
        execute: tool(async (_: unknown, p: unknown) => {
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

/**
 * Creates a `getDocNodeDetails` tool for document sub-agents.
 * Returns the full text of a single document node.
 */
// biome-ignore lint/suspicious/noExplicitAny: AgentTool type constraints
export function makeGetDocNodeDetails({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocNodeDetails',
        description: '获取文章节点详细原文',
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
            nodeId: Type.String({ description: '文章节点Id' }),
        }),
        execute: tool(async (_: unknown, p: unknown) => {
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
