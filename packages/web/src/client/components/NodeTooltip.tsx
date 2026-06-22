import { useEffect, useRef, useState } from 'react'
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
                       bg-ivory ring-warm rounded-[8pt] shadow-lg p-4"
            style={{ top: `${top}px`, left: `${left}px` }}
        >
            {loading && (
                <div className="flex items-center gap-2 font-sans text-[8.5pt] text-stone">
                    <span className="inline-block w-3 h-3 border-2 border-stone/30 border-t-stone rounded-full animate-spin" />
                    Loading source...
                </div>
            )}

            {error && (
                <div className="font-sans text-[8.5pt] text-error">{error}</div>
            )}

            {node && !loading && (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cream">
                        <span className="font-mono text-[7pt] bg-cream px-1.5 py-0.5 rounded text-stone shrink-0">
                            {nodeId}
                        </span>
                        <span className="font-serif text-[10pt] font-medium text-near-black leading-snug">
                            {node.title}
                        </span>
                    </div>
                    {/* Body */}
                    <div className="font-serif text-[9pt] leading-relaxed text-near-black whitespace-pre-line">
                        {truncate(node.text, 800)}
                    </div>
                </>
            )}
        </div>
    )
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return `${text.slice(0, maxLen)}...`
}
