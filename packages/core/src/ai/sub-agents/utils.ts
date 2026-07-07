import { getNodeDetails } from '../../store/index.ts'
import type { BaseDocNode } from '../../tree/type.ts'
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
 * Creates a `getNodeSummary` tool for document sub-agents.
 * Strips redundant heading from summary and truncates if same as full text.
 */
// biome-ignore lint/suspicious/noExplicitAny: AgentTool type constraints
export function makeGetNodeSummary({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getNodeSummary',
        description:
            '获取节点摘要用于快速判断相关性。',
        parameters: Type.Object({
            docId: Type.String({ description: '文章Id' }),
            nodeId: Type.String({ description: '文章节点Id' }),
        }),
        execute: tool(async (_: unknown, p: unknown) => {
            const { docId, nodeId } = p as { docId: string; nodeId: string }
            const result = await cached(
                `getNodeSummary:${docId}:${nodeId}`,
                async () => {
                    const d = await getNodeDetails<BaseDocNode>(
                        `${nodeId}_${docId}`
                    )
                    if (!d) return '(node not found)'
                    const title = d.title || 'Untitled'
                    const text = d.text || ''
                    // Use summary if it's meaningfully shorter than full text,
                    // otherwise take first ~200 chars of text.
                    const raw =
                        (d.summary && d.summary.length < text.length * 0.7
                            ? d.summary
                            : (d.prefixSummary &&
                                  d.prefixSummary.length < text.length * 0.7
                              ? d.prefixSummary
                              : '')) ||
                        text.slice(0, 200) +
                            (text.length > 200 ? '...' : '')
                    // Strip redundant ## Title heading
                    const cleaned = raw
                        .replace(/^#{1,2}\s+[^\n]+\n+/s, '')
                        .replace(/\n+/g, ' ')
                        .trim()
                    return `> **${title}** — ${cleaned}`
                }
            )
            return ok(result)
        }),
    }
}

/**
 * Creates a `getDocNodeDetails` tool for document sub-agents.
 * Returns the node content as markdown. Strips duplicate heading from text.
 */
// biome-ignore lint/suspicious/noExplicitAny: AgentTool type constraints
export function makeGetDocNodeDetails({ cached, ok, tool }: ToolCtx): any {
    return {
        name: 'getDocNodeDetails',
        description: '获取文章节点详细原文，返回 Markdown 格式。',
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
                    if (!d) return '(node not found)'
                    const title = d.title || 'Untitled'
                    let text = d.text || ''
                    // Strip leading heading if it duplicates title
                    const m = text.match(/^#{1,2}\s+([^\n]+)/)
                    if (m && m[1]?.trim() === title) {
                        text = text.slice(m[0].length).replace(/^\n+/, '')
                    }
                    return `# ${title}\n\n${text}`
                }
            )
            return ok(result)
        }),
    }
}
