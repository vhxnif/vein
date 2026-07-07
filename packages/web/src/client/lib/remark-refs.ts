// biome-ignore-all lint/suspicious/noExplicitAny: mdast-util-find-and-replace API uses any
/**
 * Remark plugin that finds document/node reference patterns in text nodes
 * and replaces them with link nodes. Handles:
 *
 *   [docId:nodeId]   bracketed node ref
 *   [docId]           bracketed doc ref
 *   docId:nodeId      bare node ref (whitelist, only known docIds)
 *   **docId**         bold-wrapped doc ref (strong > text)
 *   **docId:nodeId**  bold-wrapped node ref (strong > text)
 *   **`docId:nodeId`** bold + backtick (strong > inlineCode)
 *
 * Never matches inside code blocks, inline code, or existing links.
 *
 * Each link node has url='' and title='node:fullDocId:nodeId' or
 * 'doc:fullDocId'. The Markdown a renderer reads `title` for routing.
 */

import type { Parents, PhrasingContent, Root } from 'mdast'
import type { RegExpMatchObject } from 'mdast-util-find-and-replace'
import { findAndReplace } from 'mdast-util-find-and-replace'
import { visit } from 'unist-util-visit'

interface RefPluginOptions {
    docIdMap?: Map<string, string>
}

// ── Resolution (copied from Markdown.tsx — single source of truth) ──

function resolveDocId(raw: string, docIdMap?: Map<string, string>): string {
    if (!docIdMap || docIdMap.size === 0) return raw
    const exact = docIdMap.get(raw)
    if (exact) return exact
    const short = raw.slice(0, 8)
    return docIdMap.get(short) ?? raw
}

// ── Link node factory ─────────────────────────────────────────

function makeLink(
    _type: 'node' | 'doc',
    fullDocId: string,
    nodeId?: string,
    display?: string
): PhrasingContent {
    const title = nodeId ? `node:${fullDocId}:${nodeId}` : `doc:${fullDocId}`
    const text = display ?? fullDocId.slice(0, 8)
    return {
        type: 'link',
        url: '',
        title,
        children: [{ type: 'text', value: text }],
    }
}

// ── Plugin ────────────────────────────────────────────────────

export function refsPlugin({ docIdMap }: RefPluginOptions) {
    return (tree: Root) => {
        const validIds = new Set(docIdMap?.keys())

        /**
         * Replace bracketed node ref: [hex:nodeId]
         */
        function replaceBracketedNodeRef(
            _full: string,
            docId: string,
            nodeId: string
        ): PhrasingContent | false {
            const fullDocId = resolveDocId(docId, docIdMap)
            return makeLink(
                'node',
                fullDocId,
                nodeId,
                `${fullDocId.slice(0, 8)}:${nodeId}`
            )
        }

        /**
         * Replace bracketed doc ref: [hex]
         */
        function replaceBracketedDocRef(
            _full: string,
            docId: string
        ): PhrasingContent | false {
            const fullDocId = resolveDocId(docId, docIdMap)
            return makeLink('doc', fullDocId)
        }

        /**
         * Replace bare node ref: hex:nodeId (whitelist)
         */
        function replaceBareNodeRef(
            _full: string,
            docId: string,
            nodeId: string
        ): PhrasingContent | false {
            const fullDocId = resolveDocId(docId, docIdMap)
            return makeLink(
                'node',
                fullDocId,
                nodeId,
                `${fullDocId.slice(0, 8)}:${nodeId}`
            )
        }

        /**
         * Replace bare hex inside strong: **hex32+**
         * Also catches **docId:nodeId** which has already been matched
         * by replaceBareNodeRef above.
         */
        function replaceBoldDocRef(
            docId: string,
            ...rest: unknown[]
        ): PhrasingContent | false {
            // Last arg is the RegExpMatchObject
            const match = rest.at(-1) as RegExpMatchObject | undefined
            if (match?.stack?.some((n) => n.type === 'strong')) {
                const fullDocId = resolveDocId(docId, docIdMap)
                return makeLink('doc', fullDocId)
            }
            return false
        }

        // ── Assemble patterns ────────────────────────────────

        const pairs: Array<[RegExp, (...args: any[]) => any]> = [
            // 1. Bracketed node ref: [hex:nodeId]
            [/\[([a-f0-9]{8,}):(\d{2,5})\]/g, replaceBracketedNodeRef],
            // 2. Bracketed doc ref: [hex] (not followed by :nodeId)
            [/\[([a-f0-9]{8,})\]/g, replaceBracketedDocRef],
        ]

        // 3. Bare node ref: whitelist hex:nodeId (not in brackets)
        if (validIds.size > 0) {
            const idAlt = [...validIds].join('|')
            pairs.push([
                new RegExp(`\\b(${idAlt}):(\\d{2,5})\\b`, 'g'),
                replaceBareNodeRef,
            ])
        }

        // 4. Bold-wrapped doc ref: **hex32+** (hex inside <strong>)
        pairs.push([
            /\b([a-f0-9]{32,})\b/g,
            replaceBoldDocRef as (...args: any[]) => any,
        ])

        findAndReplace(tree, pairs as any, {
            ignore: ['code', 'inlineCode', 'link', 'linkReference'],
        })

        // 5. Handle refs inside inlineCode: **`hex:nodeId`** →
        //    strong > inlineCode. findAndReplace ignores inlineCode,
        //    so we visit them separately.
        visit(tree, 'inlineCode', (node, index, parent) => {
            if (index == null || !parent) return
            const value: string = (node as any).value ?? ''
            // Node ref: hex:nodeId
            const nodeMatch = value.match(/^([a-f0-9]{8,}):(\d{2,5})$/)
            if (nodeMatch) {
                const fullDocId = resolveDocId(nodeMatch[1]!, docIdMap)
                const link = makeLink(
                    'node',
                    fullDocId,
                    nodeMatch[2]!,
                    `${fullDocId.slice(0, 8)}:${nodeMatch[2]}`
                )
                ;(parent as Parents).children.splice(index, 1, link)
                return
            }
            // Doc ref: 32+ hex chars
            if (/^[a-f0-9]{32,}$/.test(value)) {
                const fullDocId = resolveDocId(value, docIdMap)
                const link = makeLink('doc', fullDocId)
                ;(parent as Parents).children.splice(index, 1, link)
            }
        })
    }
}
