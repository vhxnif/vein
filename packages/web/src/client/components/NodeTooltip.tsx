import { useEffect, useRef, useState } from 'react'
import type { NodeInfo } from '../lib/api.ts'
import { fetchNode } from '../lib/api.ts'
import { NodeTooltipContent } from './NodeTooltipContent.tsx'

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
    // Mobile: narrower with more margin so borders are clearly visible
    const isMobile = window.innerWidth < 768
    const tooltipWidth = isMobile
        ? Math.min(360, window.innerWidth - 48)
        : Math.min(420, window.innerWidth - 16)
    const margin = isMobile ? 24 : 8

    // Horizontal: clamp left so tooltip doesn't overflow viewport edges
    let left: number
    if (rect) {
        left = Math.min(
            Math.max(rect.left, margin),
            window.innerWidth - tooltipWidth - margin
        )
    } else {
        left = margin
    }

    // Vertical: prefer below anchor, flip above if it would overflow bottom
    let top: number
    if (rect) {
        const belowTop = rect.bottom + 4
        const maxHeight = 280
        if (belowTop + maxHeight > window.innerHeight - margin) {
            // Not enough space below — position above the anchor
            top = Math.max(margin, rect.top - maxHeight - 4)
        } else {
            top = belowTop
        }
    } else {
        top = margin
    }

    return (
        <div
            ref={tooltipRef}
            className="fixed z-50 max-h-[280px] overflow-y-auto no-scrollbar
                       bg-ivory border border-ink/30 rounded-[8pt] shadow-lg p-4"
            style={{
                top: `${top}px`,
                left: `${left}px`,
                width: `${tooltipWidth}px`,
            }}
        >
            {loading && (
                <div className="flex items-center gap-2 font-sans text-[8.5pt] text-ink">
                    <span className="inline-block w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                    Loading source...
                </div>
            )}

            {error && (
                <div className="font-sans text-[8.5pt] text-error break-words">
                    {error}
                </div>
            )}

            {node && !loading && (
                <NodeTooltipContent nodeId={nodeId} node={node} />
            )}
        </div>
    )
}
