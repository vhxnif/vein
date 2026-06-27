// biome-ignore-all lint/a11y/noStaticElementInteractions: inline hover tooltip triggers
// biome-ignore-all lint/a11y/useSemanticElements: inline text elements
import { useCallback, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DocTooltip } from './DocTooltip.tsx'
import { NodeTooltip } from './NodeTooltip.tsx'

/**
 * Resolve a docId (which may be 8, 10, or 32+ hex chars) to a full
 * document hash via docIdMap. Tries exact match first, then first-8-chars
 * fallback (handles LLM output like "f57894882e" where the model truncated
 * the hash to an arbitrary length).
 *
 * Used by annotateRefs, the Markdown component's link handler, and
 * extractRefs in exportHtml — this is the SINGLE shared resolution.
 */
export function resolveDocId(
    raw: string,
    docIdMap?: Map<string, string>
): string {
    if (!docIdMap || docIdMap.size === 0) return raw
    // Exact match (handles 8-char short IDs and full 32-char hashes that
    // happen to be in the map)
    const exact = docIdMap.get(raw)
    if (exact) return exact
    // Fallback: try the first 8 hex chars
    const short = raw.slice(0, 8)
    return docIdMap.get(short) ?? raw
}

/**
 * Annotate node and document references in markdown content so they become hoverable.
 *
 * Node ref patterns (→ node:// links):
 *   `[docId:nodeId]` — bracketed (per prompt constraint), always matched
 *   `docId:nodeId`   — bare fallback, only when docId is in `docIdMap`
 *
 * Doc ref patterns (→ doc:// links):
 *   `[docId]` — bracketed (full or short hex, no :nodeId), always matched
 *   `**docId**` — bold-wrapped 32+ char hex, always matched
 *
 * Using `docIdMap` as a whitelist for bare-form matching eliminates false
 * positives (e.g. commit hashes, timestamps that happen to match the pattern).
 */
export function annotateRefs(
    content: string,
    docIdMap?: Map<string, string>
): string {
    // Build a set of known valid short doc IDs (first 8 hex chars)
    const validIds = new Set(docIdMap?.keys())

    // Pass 1: bracketed node ref [XXXXX...:YYYY] → node:// link
    content = content.replace(
        /\[([a-f0-9]{8,}):(\d{2,5})\]/g,
        (_, docId: string, nodeId: string) => {
            const fullDocId = resolveDocId(docId)
            return `[${fullDocId.slice(0, 8)}:${nodeId}](node://${fullDocId}/${nodeId})`
        }
    )

    // Pass 2: bare node ref XXXXXXXX:YYYY (whitelist, not in brackets/links)
    if (validIds.size > 0) {
        const idPattern = [...validIds].join('|')
        const bareRe = new RegExp(
            `(?<!\\(|\\[)\\b(${idPattern}):(\\d{2,5})\\b(?!\\])`,
            'g'
        )
        content = content.replace(
            bareRe,
            (_, docId: string, nodeId: string) => {
                const fullDocId = resolveDocId(docId)
                return `[${fullDocId.slice(0, 8)}:${nodeId}](node://${fullDocId}/${nodeId})`
            }
        )
    }

    // Pass 3: bracketed doc ref [XXXXX...] → doc:// link (no :nodeId after hex)
    // [a-f0-9] doesn't match ':', so [docId:nodeId] won't match — hex stops at ':'
    content = content.replace(
        /\[([a-f0-9]{8,})\](?!\()/g,
        (_, docId: string) => {
            const fullDocId = resolveDocId(docId)
            return `[${fullDocId.slice(0, 8)}](doc://${fullDocId})`
        }
    )

    // Pass 3b: bold-wrapped doc ref **XXXXX...** → doc:// link (no brackets)
    // LLMs may output **fullHex** without [] around it
    content = content.replace(
        /\*\*([a-f0-9]{32,})\*\*(?!\()/g,
        (_, docId: string) => {
            const fullDocId = resolveDocId(docId)
            return `**[${fullDocId.slice(0, 8)}](doc://${fullDocId})**`
        }
    )

    return content
}

/** @deprecated Use annotateRefs instead */
export const annotateNodeRefs = annotateRefs

interface MarkdownProps {
    children: string
    /** Maps short docId (first 8 chars) → full docId for node reference lookup */
    docIdMap?: Map<string, string>
}

export function Markdown({ children, docIdMap }: MarkdownProps) {
    return (
        <div className="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="font-serif text-[16pt] font-medium text-near-black mt-8 mb-3 border-b border-cream pb-1">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="font-serif text-[13pt] font-medium text-near-black mt-6 mb-2">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="font-serif text-[11pt] font-medium text-near-black mt-5 mb-2">
                            {children}
                        </h3>
                    ),
                    h4: ({ children }) => (
                        <h4 className="font-serif text-[10pt] font-semibold text-near-black mt-4 mb-1">
                            {children}
                        </h4>
                    ),
                    p: ({ children }) => (
                        <p className="font-serif text-[10pt] leading-relaxed text-near-black mb-3">
                            {children}
                        </p>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc pl-5 mb-3 space-y-1">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal pl-5 mb-3 space-y-1">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="font-serif text-[10pt] leading-relaxed text-near-black">
                            {children}
                        </li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-ink pl-4 italic text-olive my-3">
                            {children}
                        </blockquote>
                    ),
                    code: ({ children, className, ...rest }) => {
                        const inline = (rest as { inline?: boolean }).inline
                        if (!inline) {
                            return <code className={className}>{children}</code>
                        }
                        return (
                            <code className="font-mono text-[9pt] bg-ivory px-1 py-0.5 rounded text-ink">
                                {children}
                            </code>
                        )
                    },
                    pre: ({ children }) => (
                        <pre className="code-block my-3 overflow-x-auto">
                            {children}
                        </pre>
                    ),
                    a: ({ children, href }) => {
                        // ReactMarkdown strips custom URL protocols (node://, doc://)
                        // to empty string. We detect refs from the link TEXT + empty href.
                        if (!href || href === '') {
                            const text = extractTextContent(children)
                            // Node ref: docId:nodeId pattern (e.g. "738882f0:0002")
                            const nodeMatch = text?.match(
                                /^([a-f0-9]{8,}):(\d{2,5})$/
                            )
                            if (nodeMatch?.[1] && nodeMatch?.[2]) {
                                const fullDocId = resolveDocId(
                                    nodeMatch[1],
                                    docIdMap
                                )
                                return (
                                    <NodeRefSpan
                                        fullDocId={fullDocId}
                                        nodeId={nodeMatch[2]}
                                    >
                                        {children}
                                    </NodeRefSpan>
                                )
                            }
                            // Doc ref: bare hex-only text (e.g. "738882f0")
                            // Only match when docIdMap is available to avoid false positives.
                            if (
                                text &&
                                docIdMap &&
                                docIdMap.size > 0 &&
                                /^[a-f0-9]{8,}$/.test(text)
                            ) {
                                const fullDocId = resolveDocId(text, docIdMap)
                                return (
                                    <DocRefSpan fullDocId={fullDocId}>
                                        {children}
                                    </DocRefSpan>
                                )
                            }
                        }
                        return (
                            <a
                                href={href}
                                className="text-ink hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        )
                    },
                    strong: ({ children }) => (
                        <strong className="font-semibold text-near-black">
                            {children}
                        </strong>
                    ),
                    hr: () => <hr className="border-cream my-4" />,
                    img: ({ src, alt }) => (
                        <img
                            src={src}
                            alt={alt ?? ''}
                            className="max-w-full h-auto rounded my-3"
                        />
                    ),
                    table: ({ children }) => (
                        <table className="w-full text-left border-collapse my-3">
                            {children}
                        </table>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    th: ({ children }) => (
                        <th className="font-sans text-[8pt] font-semibold text-stone border-b border-cream py-1.5 px-2">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="font-serif text-[9pt] text-near-black border-b border-cream/50 py-1.5 px-2">
                            {children}
                        </td>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    )
}

// ── Helpers ──────────────────────────────────────────────────

/** Extract plain text from React children for pattern matching. */
function extractTextContent(children: React.ReactNode): string | undefined {
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (Array.isArray(children)) {
        return children.map((c) => extractTextContent(c) ?? '').join('')
    }
    if (children && typeof children === 'object' && 'props' in children) {
        const props = children.props as { children?: React.ReactNode }
        return extractTextContent(props.children)
    }
    return undefined
}

// ── NodeRefSpan ──────────────────────────────────────────────

function NodeRefSpan({
    fullDocId,
    nodeId,
    children,
}: {
    fullDocId: string
    nodeId: string
    children: React.ReactNode
}) {
    const [showTooltip, setShowTooltip] = useState(false)
    const containerRef = useRef<HTMLSpanElement>(null)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

    const handleMouseEnter = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
        setShowTooltip(true)
    }, [])

    const handleMouseLeave = useCallback(() => {
        // Small delay to allow mouse to reach the tooltip
        hideTimerRef.current = setTimeout(() => {
            setShowTooltip(false)
        }, 150)
    }, [])

    // Keep tooltip visible when hovering over it
    const handleTooltipEnter = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
    }, [])

    const handleTooltipLeave = useCallback(() => {
        setShowTooltip(false)
    }, [])

    return (
        <span
            ref={containerRef}
            className="inline relative"
            data-doc-id={fullDocId}
            data-node-id={nodeId}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <span className="cursor-pointer border-b border-dashed border-ink/30 text-ink rounded-sm px-0.5 hover:bg-ink/8 hover:border-ink transition-colors">
                {children}
            </span>
            {showTooltip && (
                <span
                    onMouseEnter={handleTooltipEnter}
                    onMouseLeave={handleTooltipLeave}
                >
                    <NodeTooltip
                        fullDocId={fullDocId}
                        nodeId={nodeId}
                        anchorEl={containerRef.current}
                    />
                </span>
            )}
        </span>
    )
}

// ── DocRefSpan ──────────────────────────────────────────────

function DocRefSpan({
    fullDocId,
    children,
}: {
    fullDocId: string
    children: React.ReactNode
}) {
    const [showTooltip, setShowTooltip] = useState(false)
    const containerRef = useRef<HTMLSpanElement>(null)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

    const handleMouseEnter = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
        setShowTooltip(true)
    }, [])

    const handleMouseLeave = useCallback(() => {
        hideTimerRef.current = setTimeout(() => {
            setShowTooltip(false)
        }, 150)
    }, [])

    const handleTooltipEnter = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
    }, [])

    const handleTooltipLeave = useCallback(() => {
        setShowTooltip(false)
    }, [])

    return (
        <span
            ref={containerRef}
            className="inline relative"
            data-doc-id={fullDocId}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <span className="cursor-pointer border-b border-dashed border-ink/30 text-ink rounded-sm px-0.5 hover:bg-ink/8 hover:border-ink transition-colors">
                {children}
            </span>
            {showTooltip && (
                <span
                    onMouseEnter={handleTooltipEnter}
                    onMouseLeave={handleTooltipLeave}
                >
                    <DocTooltip
                        fullDocId={fullDocId}
                        anchorEl={containerRef.current}
                    />
                </span>
            )}
        </span>
    )
}
