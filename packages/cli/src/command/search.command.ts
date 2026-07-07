import process from 'node:process'
import {
    type BaseDocNode,
    getDocOutlines,
    getErrorMessage,
    getNodeDetails,
    searchDocsByKeyword,
    setupProjectModel,
} from '@vein/core'
import type { Command } from 'commander'

/**
 * Enrich search results with snippet + outline, format as markdown
 * (identical format to the librarian's searchDocs tool).
 */
async function searchAndFormat(
    query: string,
    limit: number,
    offset: number
): Promise<string> {
    const results = await searchDocsByKeyword(query, limit, offset)
    if (results.length === 0) return '(no results)'

    // Enrich with snippets
    const withSnippets = await Promise.all(
        results.map(async (r) => {
            let snippet = ''
            try {
                const rootNode = await getNodeDetails<{
                    summary?: string
                    prefixSummary?: string
                }>(`0000_${r.docId}`)
                snippet = rootNode?.summary ?? rootNode?.prefixSummary ?? ''
            } catch {
                // best-effort
            }
            return { docId: r.docId, snippet, rank: r.rank }
        })
    )

    // Batch-fetch outlines for all result docs
    const docIds = withSnippets.map((d) => d.docId)
    const outlineMap = await getDocOutlines(docIds)

    // Markdown formatting
    const lines: string[] = []
    const enriched = withSnippets.map((doc) => ({
        ...doc,
        outline: outlineMap.get(doc.docId) ?? '',
    }))
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
}

/**
 * Get node details or summary as markdown.
 */
async function nodeDetailsAndFormat(
    docId: string,
    nodeId: string,
    summaryOnly: boolean
): Promise<string> {
    const d = await getNodeDetails<BaseDocNode>(`${nodeId}_${docId}`)
    if (!d) return '(node not found)'
    const title = d.title || 'Untitled'
    const text = d.text || ''
    if (summaryOnly) {
        const raw =
            (d.summary && d.summary.length < text.length * 0.7
                ? d.summary
                : (d.prefixSummary &&
                      d.prefixSummary.length < text.length * 0.7
                  ? d.prefixSummary
                  : '')) ||
            text.slice(0, 200) + (text.length > 200 ? '...' : '')
        const cleaned = raw
            .replace(/^#{1,2}\s+[^\n]+\n+/s, '')
            .replace(/\n+/g, ' ')
            .trim()
        return `> **${title}** — ${cleaned}`
    }
    // Strip leading heading if it duplicates title
    let content = text
    const m = content.match(/^#{1,2}\s+([^\n]+)/)
    if (m && m[1]?.trim() === title) {
        content = content.slice(m[0].length).replace(/^\n+/, '')
    }
    return `# ${title}\n\n${content}`
}

export function register(program: Command) {
    program
        .command('search')
        .description(
            'search documents via keyword, get doc structure, or read node details'
        )
        .argument('[query]', 'keyword search query (optional if --doc-id and --node-id are provided)')
        .option('--doc-id <id>', 'document ID for node lookup (requires --node-id)')
        .option('--node-id <id>', 'node ID for detail or summary lookup (requires --doc-id)')
        .option('--summary', 'get node summary only (used with --doc-id --node-id)')
        .option(
            '--limit <n>',
            'max results for keyword search (default 10, max 20)',
            '10'
        )
        .option('--offset <n>', 'offset for keyword search pagination', '0')
        .action(async (queryArg, options) => {
            try {
                const config = await setupProjectModel()
                if (!config) {
                    console.error('Not in a vein project')
                    process.exit(1)
                }

                const { docId, nodeId, summary, limit, offset } = options as {
                    docId?: string
                    nodeId?: string
                    summary?: boolean
                    limit: string
                    offset: string
                }

                let output: string

                if (docId && nodeId) {
                    // Mode: node details or summary
                    output = await nodeDetailsAndFormat(
                        docId,
                        nodeId,
                        summary ?? false
                    )
                } else if (queryArg) {
                    // Mode: keyword search
                    const maxLimit = Math.min(parseInt(limit, 10) || 10, 20)
                    const pageOffset = parseInt(offset, 10) || 0
                    output = await searchAndFormat(
                        queryArg,
                        maxLimit,
                        pageOffset
                    )
                } else {
                    console.error(
                        'Provide a search query, or both --doc-id and --node-id'
                    )
                    process.exit(1)
                }

                process.stdout.write(output + '\n')
            } catch (err) {
                console.error(getErrorMessage(err))
                process.exit(1)
            }
        })
}
