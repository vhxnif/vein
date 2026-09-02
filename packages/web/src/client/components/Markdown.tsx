// biome-ignore-all lint/a11y/noStaticElementInteractions: inline hover tooltip triggers
// biome-ignore-all lint/a11y/useSemanticElements: inline text elements
import { useCallback, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { refsPlugin } from '../lib/remark-refs.ts'
import { DocTooltip } from './DocTooltip.tsx'
import { NodeTooltip } from './NodeTooltip.tsx'

/**
 * Resolve a docId (which may be 8, 10, or 32+ hex chars) to a full
 * document hash via docIdMap. Tries exact match first, then first-8-chars
 * fallback (handles LLM output like "f57894882e" where the model truncated
 * the hash to an arbitrary length).
 */
export function resolveDocId(
    raw: string,
    docIdMap?: Map<string, string>
): string {
    if (!docIdMap || docIdMap.size === 0) return raw
    const exact = docIdMap.get(raw)
    if (exact) return exact
    const short = raw.slice(0, 8)
    return docIdMap.get(short) ?? raw
}

/** Generate consistent heading ID from React children. Must match _headingSlug in index.tsx. */
// biome-ignore lint/suspicious/noExplicitAny: recursive ReactNode flatten
function _headingId(children: any, prefix?: string): string {
    // biome-ignore lint/suspicious/noExplicitAny: recursive
    const flatten = (node: any): string => {
        if (typeof node === 'string') return node
        if (Array.isArray(node)) return node.map(flatten).join('')
        if (node && typeof node === 'object' && 'props' in node) {
            return flatten(node.props.children)
        }
        return ''
    }
    const slug = flatten(children)
        .toLowerCase()
        .trim()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
    return prefix ? `${prefix}-${slug}` : slug
}

interface MarkdownProps {
    children: string
    /** Maps short docId (first 8 chars) → full docId for node reference lookup */
    docIdMap?: Map<string, string>
    /** Prefix for heading IDs to ensure uniqueness across turns */
    headingPrefix?: string
}

export function Markdown({ children, docIdMap, headingPrefix }: MarkdownProps) {
    const seen = new Map<string, number>()
    // biome-ignore lint/suspicious/noExplicitAny: matches _headingId signature
    const makeId = (nodeChildren: any) => {
        const base = _headingId(nodeChildren, headingPrefix)
        const count = (seen.get(base) ?? 0) + 1
        seen.set(base, count)
        return count > 1 ? `${base}-${count}` : base
    }

    const remarkPlugins = useMemo(
        () => [remarkGfm, [refsPlugin, { docIdMap }]],
        [docIdMap]
    )

    return (
        <div className="markdown-body">
            <ReactMarkdown
                // biome-ignore lint/suspicious/noExplicitAny: ReactMarkdown plugin tuple typing
                remarkPlugins={remarkPlugins as any}
                rehypePlugins={[rehypeRaw]}
                components={{
                    h1: ({ children }) => (
                        <h1
                            id={makeId(children)}
                            className="font-serif text-[16pt] font-medium text-near-black mt-8 mb-3 border-b border-cream pb-1"
                        >
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2
                            id={makeId(children)}
                            className="font-serif text-[13pt] font-medium text-near-black mt-6 mb-2"
                        >
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3
                            id={makeId(children)}
                            className="font-serif text-[11pt] font-medium text-near-black mt-5 mb-2"
                        >
                            {children}
                        </h3>
                    ),
                    h4: ({ children }) => (
                        <h4
                            id={makeId(children)}
                            className="font-serif text-[10pt] font-semibold text-near-black mt-4 mb-1"
                        >
                            {children}
                        </h4>
                    ),
                    p: ({ children }) => (
                        <p className="font-serif text-[10pt] leading-relaxed text-near-black mb-3 break-words">
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
                        <li className="font-serif text-[10pt] leading-relaxed text-near-black break-words">
                            {children}
                        </li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-ink pl-4 italic text-olive my-3 break-words">
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
                    pre: ({ children }) => <PreBlock>{children}</PreBlock>,
                    a: ({ children, href, title }) => {
                        // Ref links have empty href + title="node:..." or "doc:..."
                        if ((!href || href === '') && title) {
                            const parts = title.split(':')
                            const type = parts[0]
                            const fullDocId = parts[1] ?? ''
                            if (type === 'node' && parts[2]) {
                                return (
                                    <NodeRefSpan
                                        fullDocId={fullDocId}
                                        nodeId={parts[2]}
                                    >
                                        {children}
                                    </NodeRefSpan>
                                )
                            }
                            if (type === 'doc') {
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
                        <div className="md-scroll-x overflow-x-auto max-w-full my-3">
                            <table className="w-full text-left border-collapse">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => <tr>{children}</tr>,
                    th: ({ children }) => (
                        <th className="font-sans text-[8pt] font-semibold text-stone border-b border-cream py-1.5 px-2">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="font-serif text-[9pt] text-near-black border-b border-cream/50 py-1.5 px-2 break-words">
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

/** Extract plain text from React children for copy functionality. */
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

// ── PreBlock ───────────────────────────────────────────────

function PreBlock({ children }: { children: React.ReactNode }) {
    const [copied, setCopied] = useState(false)
    const text = extractTextContent(children) ?? ''
    const onCopy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }, [text])
    return (
        <pre className="code-block group relative my-3 overflow-x-auto">
            <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? '已复制' : '复制代码'}
                className="absolute top-1.5 right-1.5 text-stone hover:text-ink p-1 rounded bg-ivory/80 border border-cream opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
                {copied ? (
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                        />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                )}
            </button>
            {children}
        </pre>
    )
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
