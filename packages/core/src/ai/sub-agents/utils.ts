import { Type } from '@earendil-works/pi-ai'
import { getFullTree, getNodeDetails } from '../../store/index.ts'
import type { BaseDocNode, TreeNode } from '../../tree/type.ts'
import type { ToolCtx } from '../types.ts'

export class Semaphore {
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

export function ellipsis(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}...` : s
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

export function compactDocText(text: string): string {
    return text
        .split('\n')
        .filter((line) => /^\s*\d+\s+\S/.test(line) || line.includes('(目录)'))
        .join('\n')
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

/** Extract relevance and summary from the subagent's markdown output. */
export function parseAnalyzeResult(raw: string): {
    relevance: string
    summary: string
} {
    const relMatch = raw.match(/##\s*相关性\s*\n+([^\n#]+)/i)
    const relevance = relMatch?.[1]?.trim().toLowerCase() || 'unknown'
    const sumMatch = raw.match(/##\s*概述\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i)
    const summary = sumMatch?.[1]?.trim() || raw.slice(0, 120)
    return { relevance, summary }
}

/**
 * Extract the sources section from subagent output so we can keep nodeId
 * citations even after compacting the full detailed analysis.
 */
export function extractAnalyzeSources(text: string): string {
    const match = text.match(/##\s*数据来源\s*\n+([\s\S]*?)(?=\n##\s|\n*$)/i)
    const raw = match?.[1]?.trim() ?? ''
    if (!raw) return ''
    // Strip markdown list markers to produce a compact node list.
    return raw
        .split('\n')
        .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean)
        .join('; ')
}

/**
 * Compact older analyzeDocument results to save context.
 * Keep the N most recent full; compact the rest to relevance + summary +
 * sources (nodeIds must remain available for citations and reviewer).
 */
export function compactAnalyzeResult(text: string): string {
    const { relevance, summary } = parseAnalyzeResult(text)
    const sources = extractAnalyzeSources(text)
    return `[compacted] relevance=${relevance} summary=${ellipsis(summary, 100)} sources=${sources ? ellipsis(sources, 200) : 'none'}`
}

// ── Shared tool factories for doc-analyzer & fragment-extractor ──

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
