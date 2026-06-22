import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NodeInfo } from '../lib/api'
import { fetchNode } from '../lib/api'

// ── Module-level cache ─────────────────────────────────────────

const nodeCache = new Map<string, NodeInfo>()

// ── NodeTooltip ────────────────────────────────────────────────

interface NodeTooltipProps {
    fullDocId: string
    nodeId: string
    /** The anchor element to position the tooltip near */
    anchorEl: HTMLElement | null
}

export function NodeTooltip({ fullDocId, nodeId, anchorEl }: NodeTooltipProps) {
    const cacheKey = `${fullDocId}:${nodeId}`
    const cached = nodeCache.get(cacheKey)
    const [node, setNode] = useState<NodeInfo | null>(cached ?? null)
    const [loading, setLoading] = useState(!cached)
    const [error, setError] = useState<string | null>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (cached) return

        let cancelled = false
        fetchNode(fullDocId, nodeId)
            .then((data) => {
                if (cancelled) return
                nodeCache.set(cacheKey, data)
                setNode(data)
                setLoading(false)
            })
            .catch((err) => {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Failed to load')
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [fullDocId, nodeId, cacheKey, cached])

    // Position relative to anchor, clamped to viewport
    const rect = anchorEl?.getBoundingClientRect()
    const top = rect ? rect.bottom + 4 : 0
    const left = rect
        ? Math.max(8, Math.min(rect.left, window.innerWidth - 436))
        : 0

    return (
        <div
            ref={tooltipRef}
            className="fixed z-50 w-[420px] max-h-[280px] overflow-y-auto kami-scrollbar
                       bg-parchment border border-ink/20 rounded-[8pt] shadow-lg p-4"
            style={{ top: `${top}px`, left: `${left}px` }}
        >
            {loading && (
                <div className="flex items-center gap-2 font-sans text-[8.5pt] text-ink">
                    <span className="inline-block w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                    Loading source...
                </div>
            )}

            {error && (
                <div className="font-sans text-[8.5pt] text-error">{error}</div>
            )}

            {node && !loading && (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-ink/15">
                        <span className="font-mono text-[7pt] bg-ink/10 px-1.5 py-0.5 rounded text-ink shrink-0">
                            {nodeId}
                        </span>
                        <span className="font-serif text-[10pt] font-medium text-near-black leading-snug">
                            {node.title}
                        </span>
                    </div>
                    {/* Body */}
                    <div className="text-[9pt] leading-relaxed text-near-black">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({ children }) => (
                                    <h1 className="font-serif text-[10pt] font-medium text-near-black mt-2 mb-1">
                                        {children}
                                    </h1>
                                ),
                                h2: ({ children }) => (
                                    <h2 className="font-serif text-[9.5pt] font-medium text-near-black mt-2 mb-1">
                                        {children}
                                    </h2>
                                ),
                                h3: ({ children }) => (
                                    <h3 className="font-serif text-[9pt] font-medium text-near-black mt-1.5 mb-0.5">
                                        {children}
                                    </h3>
                                ),
                                p: ({ children }) => (
                                    <p className="font-serif text-[9pt] leading-relaxed text-near-black mb-1.5">
                                        {children}
                                    </p>
                                ),
                                ul: ({ children }) => (
                                    <ul className="list-disc pl-4 mb-1.5 space-y-0.5">
                                        {children}
                                    </ul>
                                ),
                                ol: ({ children }) => (
                                    <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">
                                        {children}
                                    </ol>
                                ),
                                li: ({ children }) => (
                                    <li className="font-serif text-[9pt] leading-relaxed text-near-black">
                                        {children}
                                    </li>
                                ),
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-ink/20 pl-3 italic text-stone my-1.5">
                                        {children}
                                    </blockquote>
                                ),
                                code: ({ children, className, ...rest }) => {
                                    const inline = (rest as { inline?: boolean }).inline
                                    if (!inline) {
                                        return <code className={className}>{children}</code>
                                    }
                                    return (
                                        <code className="font-mono text-[8pt] bg-ivory px-1 py-0.5 rounded text-ink">
                                            {children}
                                        </code>
                                    )
                                },
                                pre: ({ children }) => (
                                    <pre className="bg-ivory border border-cream/50 rounded-[4pt] p-2 my-1.5 overflow-x-auto font-mono text-[8pt] leading-relaxed">
                                        {children}
                                    </pre>
                                ),
                                a: ({ children, href }) => (
                                    <a
                                        href={href}
                                        className="text-ink underline decoration-ink/30 hover:decoration-ink"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {children}
                                    </a>
                                ),
                                strong: ({ children }) => (
                                    <strong className="font-semibold text-near-black">
                                        {children}
                                    </strong>
                                ),
                                em: ({ children }) => (
                                    <em className="italic">{children}</em>
                                ),
                                hr: () => <hr className="border-cream/30 my-2" />,
                            }}
                        >
                            {node.text}
                        </ReactMarkdown>
                    </div>
                </>
            )}
        </div>
    )
}

