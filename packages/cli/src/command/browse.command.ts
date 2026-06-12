import { confirm, intro, note, outro, select } from '@clack/prompts'
import {
    type BaseDocNode,
    type DocNode,
    deleteDoc,
    getDocFtsSummary,
    getDocumentDetail,
    getFullTree,
    getNodeDetails,
    listDocuments,
    renderDocOutline,
    setupProjectModel,
} from '@vein/core'
import type { Command } from 'commander'

const PER_PAGE = 20

// ── Stdin drain ────────────────────────────────────────────────────
// After a @clack/prompts prompt ends (especially via Esc), stdin may
// retain buffered data that prevents the next prompt from entering raw
// mode. Draining stdin between prompts fixes arrow-key lockup.
function drainStdin(): Promise<void> {
    return new Promise((r) => {
        // The previous prompt's readline.close() may have paused stdin.
        // Resume and drain any buffered data before the next prompt.
        if (process.stdin.isTTY) {
            process.stdin.resume()
            process.stdin.read()
        }
        // Event-loop tick so the previous prompt's cleanup fully settles
        setTimeout(r, 0)
    })
}

/** select with stdin drain before opening. */
async function safeSelect(
    opts: Parameters<typeof select>[0]
): ReturnType<typeof select> {
    await drainStdin()
    return select(opts)
}

// ── Helpers ────────────────────────────────────────────────────────

/** Format a rich detail summary for a document. */
async function formatDocDetail(docId: string): Promise<string> {
    const doc = await getDocumentDetail(docId)
    if (!doc) return `Doc ${docId.slice(0, 8)} not found`

    const idShort = doc.id.slice(0, 8)
    const lines: string[] = [
        `Title:    ${doc.title}`,
        `ID:       ${doc.id}`,
        `ShortID:  ${idShort}...`,
        `Source:   ${doc.sourcePath || '(unknown)'}`,
        `Created:  ${doc.createdAt}`,
        `Nodes:    ${doc.nodeCount}`,
    ]

    try {
        const fts = await getDocFtsSummary(docId)
        if (fts && fts.length > 0) {
            const preview = fts.length > 200 ? `${fts.slice(0, 200)}...` : fts
            lines.push(`FTS:      ${preview}`)
        }
    } catch {
        // FTS may not be available
    }

    try {
        const meta = JSON.parse(doc.metadata) as Record<string, unknown>
        const knownKeys = ['title', 'sourcePath']
        const extra = Object.entries(meta).filter(
            ([k]) => !knownKeys.includes(k)
        )
        if (extra.length > 0) {
            lines.push('')
            lines.push('Metadata fields:')
            for (const [k, v] of extra) {
                const val =
                    typeof v === 'string'
                        ? v.length > 100
                            ? `${v.slice(0, 100)}...`
                            : v
                        : JSON.stringify(v)
                lines.push(`  ${k}: ${val}`)
            }
        }
    } catch {
        // ignore parse errors
    }

    return lines.join('\n')
}

/** Build a virtual root DocNode and render the indented outline. */
async function formatDocOutline(docId: string): Promise<string> {
    const rootNodes = await getFullTree<BaseDocNode>(docId)

    if (rootNodes.length === 0) {
        return '(no headings found — flat document)'
    }

    const virtualRoot: DocNode = {
        nodeId: '__root__',
        value: { title: 'ROOT', lineNum: 0, text: '' },
        nodes: rootNodes,
    }
    return renderDocOutline(virtualRoot)
}

// ── Flat node for selection ────────────────────────────────────────

type FlatSelectNode = {
    nodeId: string
    title: string
    depth: number
}

function flattenTreeForSelect(tree: DocNode[], depth = 0): FlatSelectNode[] {
    const result: FlatSelectNode[] = []
    for (const node of tree) {
        result.push({
            nodeId: node.nodeId,
            title: node.value.title,
            depth,
        })
        if (node.nodes.length > 0) {
            result.push(...flattenTreeForSelect(node.nodes, depth + 1))
        }
    }
    return result
}

// ── Document detail sub-menu ───────────────────────────────────────

async function showDocDetailMenu(docId: string): Promise<'back' | 'deleted'> {
    const doc = await getDocumentDetail(docId)
    if (!doc) {
        note(`Doc ${docId.slice(0, 8)} no longer exists.`)
        return 'deleted'
    }

    const sourceLabel = doc.sourcePath
        ? doc.sourcePath.length > 40
            ? `...${doc.sourcePath.slice(-37)}`
            : doc.sourcePath
        : 'unknown'

    const action = await safeSelect({
        message: `Document: ${doc.title} · ${doc.nodeCount} nodes · ${sourceLabel}`,
        options: [
            {
                value: 'detail',
                label: '📋  View Details',
                hint: 'id, created, FTS preview, extra metadata',
            },
            {
                value: 'outline',
                label: '🌳  Outline',
                hint: 'heading tree',
            },
            {
                value: 'fts',
                label: '🔍  FTS Summary',
                hint: 'search index text',
            },
            {
                value: 'nodes',
                label: '📖  Browse Nodes',
                hint: `select a section to read (${doc.nodeCount} nodes)`,
            },
            {
                value: 'delete',
                label: '🗑   Delete',
                hint: 'remove this document',
            },
            {
                value: 'back',
                label: '←  Back to list',
                hint: '',
            },
        ],
    })

    if (typeof action !== 'string' || action === 'back') {
        return 'back'
    }

    switch (action) {
        case 'detail': {
            const detail = await formatDocDetail(docId)
            note(detail)
            break
        }
        case 'outline': {
            const outline = await formatDocOutline(docId)
            note(outline)
            break
        }
        case 'fts': {
            const fts = await getDocFtsSummary(docId)
            note(fts || '(no FTS summary available)')
            break
        }
        case 'nodes': {
            await browseDocNodes(docId)
            break
        }
        case 'delete': {
            const ok = await confirm({
                message: `Delete "${doc.title}"? This cannot be undone.`,
            })
            if (ok === true) {
                await deleteDoc(docId)
                note(`Deleted "${doc.title}".`)
                return 'deleted'
            }
            note('Delete cancelled.')
            break
        }
    }

    return showDocDetailMenu(docId)
}

// ── Node browsing sub-menu ────────────────────────────────────────

const NODES_PER_PAGE = 20

async function browseDocNodes(docId: string, nodePage = 1): Promise<void> {
    await drainStdin()
    const rootNodes = await getFullTree<BaseDocNode>(docId)

    if (rootNodes.length === 0) {
        note('This document has no tree nodes (no headings found).')
        return
    }

    const flatNodes = flattenTreeForSelect(rootNodes)
    const totalNodePages = Math.ceil(flatNodes.length / NODES_PER_PAGE)
    const start = (nodePage - 1) * NODES_PER_PAGE
    const pageNodes = flatNodes.slice(start, start + NODES_PER_PAGE)

    const choices = pageNodes.map((n) => {
        const indent = '  '.repeat(n.depth)
        const title =
            n.title.length > 60 ? `${n.title.slice(0, 60)}...` : n.title
        return {
            value: n.nodeId,
            label: `${indent}${title}`,
            hint: n.depth > 0 ? `L${n.depth + 1}` : '',
        }
    })

    if (totalNodePages > 1) {
        choices.push({
            value: '__np_prev__',
            label: `─── Page ${nodePage}/${totalNodePages} · prev ───`,
            hint: nodePage > 1 ? `page ${nodePage - 1}` : 'first page',
        })
        choices.push({
            value: '__np_next__',
            label: `─── Page ${nodePage}/${totalNodePages} · next ───`,
            hint:
                nodePage < totalNodePages
                    ? `page ${nodePage + 1}`
                    : 'last page',
        })
    }

    choices.push({
        value: '__back_nodes__',
        label: '←  Back to document menu',
        hint: '',
    })

    const selected = await safeSelect({
        message: `Browse nodes (${flatNodes.length} sections, page ${nodePage}/${totalNodePages})`,
        options: choices,
    })

    if (!selected || typeof selected !== 'string') return
    if (selected === '__back_nodes__') return
    if (selected === '__np_prev__') {
        if (nodePage > 1) {
            await browseDocNodes(docId, nodePage - 1)
        }
        return
    }
    if (selected === '__np_next__') {
        if (nodePage < totalNodePages) {
            await browseDocNodes(docId, nodePage + 1)
        }
        return
    }

    await showNodeDetail(docId, selected, nodePage)
}

/** Display a single node's detail content using note. */
async function showNodeDetail(
    docId: string,
    nodeId: string,
    nodePage: number
): Promise<void> {
    const nodeData = await getNodeDetails<BaseDocNode>(nodeId)
    if (!nodeData) {
        note(`Node ${nodeId.slice(0, 8)} not found.`)
        await browseDocNodes(docId, nodePage)
        return
    }

    const lines: string[] = [
        `Title: ${nodeData.title}`,
        `Line:  ${nodeData.lineNum}`,
    ]
    if (nodeData.summary) {
        const preview =
            nodeData.summary.length > 2000
                ? `${nodeData.summary.slice(0, 2000)}\n\n... (truncated, ${nodeData.summary.length} total chars)`
                : nodeData.summary
        lines.push('')
        lines.push('─── Summary ───')
        lines.push(preview)
    }
    if (nodeData.prefixSummary) {
        lines.push(`Prefix:  ${nodeData.prefixSummary}`)
    }
    if (nodeData.text) {
        const preview =
            nodeData.text.length > 2000
                ? `${nodeData.text.slice(0, 2000)}\n\n... (truncated, ${nodeData.text.length} total chars)`
                : nodeData.text
        lines.push('')
        lines.push('─── Content ───')
        lines.push(preview)
    }
    note(lines.join('\n'))

    // Pause so the user can read the content before the node list
    // select prompt pushes it up. Single-option select = just press Enter.
    await safeSelect({
        message: 'Reading the node content above ↑',
        options: [{ value: 'ok', label: '←  Back to node list' }],
    })

    await browseDocNodes(docId, nodePage)
}

// ── Browse by Doc (main list) ──────────────────────────────────────

async function browseDocsPage(page: number): Promise<void> {
    await drainStdin()
    const { docs, total } = await listDocuments(page, PER_PAGE)
    const totalPages = Math.ceil(total / PER_PAGE)

    if (docs.length === 0) {
        note('No documents in the library.')
        return
    }

    function buildChoices() {
        const choices = docs.map((d) => {
            const title =
                d.title.length > 55 ? `${d.title.slice(0, 55)}...` : d.title
            const nodeLabel =
                d.nodeCount > 0
                    ? `${d.nodeCount} node${d.nodeCount === 1 ? '' : 's'}`
                    : 'no nodes'
            return {
                value: d.id,
                label: `${title.padEnd(58)} │ ${nodeLabel}`,
                hint: d.createdAt?.slice(0, 10) ?? '',
            }
        })

        if (totalPages > 1) {
            choices.push({
                value: '__prev__',
                label: `─── Page ${page}/${totalPages} · prev ───`,
                hint: page > 1 ? `page ${page - 1}` : 'first page',
            })
            choices.push({
                value: '__next__',
                label: `─── Page ${page}/${totalPages} · next ───`,
                hint: page < totalPages ? `page ${page + 1}` : 'last page',
            })
        }

        choices.push({
            value: '__back__',
            label: '( back to main menu )',
            hint: '',
        })

        return choices
    }

    const selected = await safeSelect({
        message: `Documents (${total} total, page ${page}/${totalPages})`,
        options: buildChoices(),
    })

    if (!selected || typeof selected !== 'string') return

    if (selected === '__back__') return
    if (selected === '__prev__') {
        if (page > 1) {
            await browseDocsPage(page - 1)
        }
        return
    }
    if (selected === '__next__') {
        if (page < totalPages) {
            await browseDocsPage(page + 1)
        }
        return
    }

    const result = await showDocDetailMenu(selected)
    if (result === 'deleted') {
        const { docs: refetched } = await listDocuments(page, PER_PAGE)
        const targetPage = refetched.length === 0 && page > 1 ? page - 1 : page
        await browseDocsPage(targetPage)
        return
    }
    await browseDocsPage(page)
}

// ── Top-level browse command ───────────────────────────────────────

export function register(program: Command) {
    program
        .command('browse')
        .alias('br')
        .description('browse the library by document')
        .action(async () => {
            const config = await setupProjectModel()
            if (!config) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            intro('Browse Library')

            await browseDocsPage(1)

            outro('Done')
        })
}
