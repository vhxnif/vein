// biome-ignore-all lint/a11y/noStaticElementInteractions: inline hover tooltip triggers
// biome-ignore-all lint/a11y/useSemanticElements: inline text elements
import { useCallback, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { NodeTooltip } from './NodeTooltip'

/**
 * Annotate node references in markdown content so they become hoverable.
 *
 * Two patterns, both strict:
 *   `[XXXXXXXX:YYYY]` — bracketed (per prompt constraint), always matched
 *   `XXXXXXXX:YYYY`   — bare fallback, only matched when XXXXXXXX is a
 *                        known short doc ID from `docIdMap`
 *
 * Using `docIdMap` as a whitelist for bare-form matching eliminates false
 * positives (e.g. commit hashes, timestamps that happen to match the pattern).
 */
export function annotateNodeRefs(
    content: string,
    docIdMap?: Map<string, string>
): string {
    // Build a set of known valid short doc IDs (first 8 hex chars)
    const validIds = new Set(docIdMap?.keys())

    // Pass 1: bracketed form [XXXXXXXX:YYYY] — always safe, no false positives
    content = content.replace(
        /\[([a-f0-9]{8}):(\d{2,5})\]/g,
        '[$1:$2](node://$1/$2)'
    )

    // Pass 2: bare form XXXXXXXXX:YYYY — only when docId is in the whitelist,
    // not inside brackets (avoids re-processing pass 1 output),
    // and not inside an existing link URL (negative lookbehind for '(')
    if (validIds.size > 0) {
        const idPattern = [...validIds].join('|')
        const bareRe = new RegExp(
            `(?<!\\(|\\[)\\b(${idPattern}):(\\d{2,5})\\b(?!\\])`,
            'g'
        )
        content = content.replace(bareRe, '[$1:$2](node://$1/$2)')
    }

    return content
}

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
                        // Detect node:// protocol links (from annotateNodeRefs)
                        if (href?.startsWith('node://')) {
                            const parts = href.slice(7).split('/')
                            const shortDocId = parts[0] ?? ''
                            const nodeId = parts[1] ?? ''
                            const fullDocId =
                                docIdMap?.get(shortDocId) ?? shortDocId
                            return (
                                <NodeRefSpan
                                    fullDocId={fullDocId}
                                    nodeId={nodeId}
                                >
                                    {children}
                                </NodeRefSpan>
                            )
                        }
                        // ReactMarkdown auto-links bare XX:YYYY as <a href="">.
                        // Treat empty-href links matching the node ref pattern as citations.
                        if (!href || href === '') {
                            const text = extractTextContent(children)
                            const m = text?.match(/^([a-f0-9]{8}):(\d{2,5})$/)
                            if (m?.[1] && m?.[2]) {
                                const shortDocId = m[1]
                                const nodeId = m[2]
                                const fullDocId =
                                    docIdMap?.get(shortDocId) ?? shortDocId
                                return (
                                    <NodeRefSpan
                                        fullDocId={fullDocId}
                                        nodeId={nodeId}
                                    >
                                        {children}
                                    </NodeRefSpan>
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
