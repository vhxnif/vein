import { useEffect, useRef, useState } from 'react'
import type { DocInfo } from '../lib/api.ts'
import { fetchDocument } from '../lib/api.ts'
import { DocTooltipContent } from './DocTooltipContent.tsx'

// ── Module-level cache ─────────────────────────────────────────

const docCache = new Map<string, DocInfo>()

// ── DocTooltip ────────────────────────────────────────────────

interface DocTooltipProps {
    fullDocId: string
    /** The anchor element to position the tooltip near */
    anchorEl: HTMLElement | null
}

export function DocTooltip({ fullDocId, anchorEl }: DocTooltipProps) {
    const cached = docCache.get(fullDocId)
    const [doc, setDoc] = useState<DocInfo | null>(cached ?? null)
    const [loading, setLoading] = useState(!cached)
    const [error, setError] = useState<string | null>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (cached) return

        let cancelled = false
        fetchDocument(fullDocId)
            .then((data) => {
                if (cancelled) return
                docCache.set(fullDocId, data)
                setDoc(data)
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
    }, [fullDocId, cached])

    // Position relative to anchor, clamped to viewport
    const rect = anchorEl?.getBoundingClientRect()
    const tooltipWidth = Math.min(420, window.innerWidth - 16)
    const margin = 8

    let left: number
    if (rect) {
        left = Math.min(
            Math.max(rect.left, margin),
            window.innerWidth - tooltipWidth - margin
        )
    } else {
        left = margin
    }

    let top: number
    if (rect) {
        const belowTop = rect.bottom + 4
        const maxHeight = 280
        if (belowTop + maxHeight > window.innerHeight - margin) {
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
                       bg-parchment border border-ink/20 rounded-[8pt] shadow-lg p-4"
            style={{
                top: `${top}px`,
                left: `${left}px`,
                width: `${tooltipWidth}px`,
            }}
        >
            {loading && (
                <div className="flex items-center gap-2 font-sans text-[8.5pt] text-ink">
                    <span className="inline-block w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                    Loading document...
                </div>
            )}

            {error && (
                <div className="font-sans text-[8.5pt] text-error">{error}</div>
            )}

            {doc && !loading && (
                <DocTooltipContent fullDocId={fullDocId} doc={doc} />
            )}
        </div>
    )
}
