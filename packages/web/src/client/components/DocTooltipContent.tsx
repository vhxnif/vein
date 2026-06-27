import type { DocInfo } from '../lib/api.ts'

// ── DocTooltipContent ───────────────────────────────────────
//
// Shared tooltip content rendering used by both:
//   1. DocTooltip (web live hover — fetches data via API)
//   2. exportHtml.ts (export — pre-renders with pre-fetched data)
//
// Keep this the single source of truth for how doc data is displayed
// in hover tooltips. Any change here automatically applies everywhere.

interface DocTooltipContentProps {
    fullDocId: string
    doc: DocInfo
}

export function DocTooltipContent({ fullDocId, doc }: DocTooltipContentProps) {
    return (
        <>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-ink/15">
                <span className="font-mono text-[7pt] bg-ink/10 px-1.5 py-0.5 rounded text-ink shrink-0">
                    {fullDocId.slice(0, 8)}
                </span>
                <span className="font-serif text-[10pt] font-medium text-near-black leading-snug truncate">
                    {doc.title}
                </span>
            </div>
            {/* Body — mirrors doc detail page's "Detail" section */}
            <div className="space-y-1 font-sans text-[8.5pt] text-olive">
                <p>
                    <span className="font-medium text-near-black">ID:</span>{' '}
                    {doc.id}
                </p>
                <p>
                    <span className="font-medium text-near-black">Nodes:</span>{' '}
                    {doc.nodeCount}
                </p>
                <p>
                    <span className="font-medium text-near-black">
                        Created:
                    </span>{' '}
                    {doc.createdAt}
                </p>
                {doc.ftsSummary && (
                    <p>
                        <span className="font-medium text-near-black">
                            Summary:
                        </span>{' '}
                        {doc.ftsSummary.length > 200
                            ? `${doc.ftsSummary.slice(0, 200)}...`
                            : doc.ftsSummary}
                    </p>
                )}
            </div>
        </>
    )
}
