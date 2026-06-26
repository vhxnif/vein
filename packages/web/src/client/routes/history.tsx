import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { annotateNodeRefs, Markdown } from '../components/Markdown.tsx'
import { TimelineBlockView } from '../components/TimelineBlockView.tsx'
import type { HistoryEntry } from '../lib/api.ts'
import { fetchHistory, fetchHistoryEntry } from '../lib/api.ts'
import { exportResultAsHtml } from '../lib/exportHtml.ts'
import { useProject } from '../lib/project.tsx'

export const Route = createFileRoute('/history')({
    component: HistoryPage,
})

function HistoryPage() {
    const { project } = useProject()
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const [isMobile, setIsMobile] = useState(false)
    const [desktopPage, setDesktopPage] = useState(1)

    const [pageSize] = useState(() => {
        if (typeof window === 'undefined') return 20
        if (window.innerWidth < 768) return 20
        // Header ~160px, pagination bar ~60px; row ≈ 52px
        const availH = window.innerHeight - 160 - 60
        const rowH = 52
        return Math.min(50, Math.max(8, Math.floor(availH / rowH)))
    })

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const {
        data,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['history', project, pageSize],
        queryFn: ({ pageParam }) => fetchHistory(pageParam, pageSize),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            const totalPages = Math.ceil(lastPage.total / pageSize)
            const nextPage = allPages.length + 1
            return nextPage <= totalPages ? nextPage : undefined
        },
        staleTime: 30_000,
    })

    useEffect(() => {
        if (
            !isMobile &&
            data &&
            desktopPage > data.pages.length &&
            hasNextPage
        ) {
            fetchNextPage()
        }
    }, [isMobile, desktopPage, data, hasNextPage, fetchNextPage])

    const loadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    useEffect(() => {
        if (!isMobile) return
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore()
            },
            { rootMargin: '200px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [isMobile, loadMore])

    if (!project) {
        return (
            <div className="max-w-[780px] mx-auto px-8 py-16">
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-8">
                    History
                </h1>
                <p className="font-sans text-[9pt] text-stone">
                    No project selected — select one from the sidebar
                </p>
            </div>
        )
    }

    const allEntries = data?.pages.flatMap((p) => p.entries) ?? []
    const total = data?.pages[0]?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const desktopPageData = data?.pages[desktopPage - 1]
    const entries = isMobile ? allEntries : (desktopPageData?.entries ?? [])

    // Group entries by date
    const groups: Record<string, HistoryEntry[]> = {}
    for (const entry of entries) {
        const date = entry.id.slice(0, 10)
        if (!groups[date]) groups[date] = []
        groups[date].push(entry)
    }

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            <h1 className="font-serif text-[20pt] font-medium leading-tight text-ink mb-8">
                History
            </h1>

            {isLoading ? (
                <p className="font-sans text-[9pt] text-olive">Loading...</p>
            ) : error ? (
                <p className="font-sans text-[9pt] text-error">
                    Failed to load history:{' '}
                    {error instanceof Error ? error.message : String(error)}
                </p>
            ) : entries.length === 0 ? (
                <p className="font-sans text-[9pt] text-olive">
                    No search history yet. Use Ask to start searching.
                </p>
            ) : isMobile ? (
                /* Mobile: date-grouped */
                <div>
                    {Object.entries(groups).map(([date, items]) => (
                        <div key={date} className="mb-8">
                            <h3 className="font-serif text-[11pt] font-medium text-olive mb-3">
                                {date}
                            </h3>
                            {items.map((entry) => (
                                <HistoryRow
                                    key={entry.id}
                                    entry={entry}
                                    expandedId={expandedId}
                                    setExpandedId={setExpandedId}
                                    showDate={false}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                /* Desktop: flat list with date in row */
                <div>
                    {entries.map((entry) => (
                        <HistoryRow
                            key={entry.id}
                            entry={entry}
                            expandedId={expandedId}
                            setExpandedId={setExpandedId}
                            showDate
                        />
                    ))}
                </div>
            )}

            {/* Mobile: infinite scroll sentinel + indicator */}
            {isMobile && (
                <div
                    ref={sentinelRef}
                    className="mt-8 pt-5 border-t border-cream"
                >
                    {isFetchingNextPage ? (
                        <p className="font-sans text-[9pt] text-olive text-center">
                            Loading more...
                        </p>
                    ) : hasNextPage ? (
                        <p className="font-sans text-[9pt] text-stone text-center">
                            Scroll for more
                        </p>
                    ) : entries.length > 0 ? (
                        <p className="font-sans text-[9pt] text-stone text-center">
                            All {total} entries loaded
                        </p>
                    ) : null}
                </div>
            )}

            {/* Desktop: pagination controls */}
            {!isMobile && totalPages > 1 && (
                <div className="mt-8 pt-5 border-t border-cream flex items-center justify-between font-sans text-[9pt] text-olive">
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={desktopPage <= 1}
                        onClick={() =>
                            setDesktopPage((p) => Math.max(1, p - 1))
                        }
                    >
                        ← Prev
                    </button>
                    <span>
                        {desktopPage} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={desktopPage >= totalPages}
                        onClick={() =>
                            setDesktopPage((p) => Math.min(totalPages, p + 1))
                        }
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    )
}

function HistoryRow({
    entry,
    expandedId,
    setExpandedId,
    showDate,
}: {
    entry: HistoryEntry
    expandedId: string | null
    setExpandedId: (id: string | null) => void
    showDate: boolean
}) {
    const date = entry.id.slice(0, 10)
    const rawTime = entry.id.slice(11, 19) ?? ''
    const time =
        rawTime.length === 6
            ? `${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}:${rawTime.slice(4, 6)}`
            : rawTime

    return (
        <div className="-mx-[12pt]">
            <button
                type="button"
                className="w-full text-left px-[12pt] py-[12pt] rounded-[6pt] flex items-center justify-between
                           bg-transparent border-none cursor-pointer
                           hover:bg-sand/60 transition-colors"
                onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                }
            >
                <span className="font-serif text-[10pt] text-near-black leading-relaxed truncate mr-2">
                    {entry.query}
                </span>
                <span className="font-sans text-[8pt] text-olive flex items-center gap-3 flex-shrink-0">
                    {entry.verdict && (
                        <span
                            className={
                                entry.verdict === 'pass'
                                    ? 'text-ink'
                                    : entry.verdict === 'partial'
                                      ? 'text-error'
                                      : 'text-stone'
                            }
                        >
                            {entry.verdict} {entry.score}/5
                        </span>
                    )}
                    <span
                        className={`px-2 py-0.5 rounded-full font-sans text-[7.5pt] font-medium ${
                            entry.mode === 'quick'
                                ? 'border border-ink/30 bg-transparent text-stone'
                                : 'bg-ink/10 text-ink'
                        }`}
                    >
                        {entry.mode === 'quick' ? 'Quick' : 'Review'}
                    </span>
                    {showDate && (
                        <span className="text-stone">
                            {date} {time}
                        </span>
                    )}
                    <span>{(entry.elapsedMs / 1000).toFixed(1)}s</span>
                    <span className="text-[10pt]">
                        {expandedId === entry.id ? '▾' : '▸'}
                    </span>
                </span>
            </button>
            {expandedId === entry.id && <ExpandedEntry id={entry.id} />}
        </div>
    )
}

function ExpandedEntry({ id }: { id: string }) {
    const { project } = useProject()
    const [exporting, setExporting] = useState(false)

    const { data: entry, isLoading } = useQuery({
        queryKey: ['historyEntry', id],
        queryFn: () => fetchHistoryEntry(id),
        staleTime: 60_000,
    })

    // Build docIdMap from trace args.docId
    const docIdMap = useMemo(() => {
        const m = new Map<string, string>()
        if (entry?.trace) {
            for (const step of entry.trace) {
                const args = (step as Record<string, unknown>).args as
                    | Record<string, unknown>
                    | undefined
                const docId = args?.docId as string | undefined
                if (docId) {
                    m.set(docId.slice(0, 8), docId)
                }
            }
        }
        return m
    }, [entry?.trace])

    const annotatedAnswer = useMemo(() => {
        const raw = entry?.answer || ''
        if (!raw) return ''
        return annotateNodeRefs(raw, docIdMap)
    }, [entry?.answer, docIdMap])

    const handleExport = useCallback(async () => {
        if (!entry || exporting) return
        setExporting(true)
        try {
            const reviewObj =
                entry.verdict && entry.score !== undefined
                    ? {
                          verdict: entry.verdict,
                          score: entry.score,
                          reason: '',
                      }
                    : undefined
            await exportResultAsHtml({
                query: entry.query,
                content: entry.answer,
                docIdMap,
                review: reviewObj,
                timeline: (entry.timeline as
                    | import('../components/TimelineBlockView.tsx').SharedTimelineBlock[]
                    | undefined),
                elapsedMs: entry.elapsedMs,
                mode: entry.mode,
                project,
            })
        } finally {
            setExporting(false)
        }
    }, [entry, exporting, docIdMap, project])

    if (isLoading) {
        return (
            <div className="px-3 pb-4 font-sans text-[8.5pt] text-olive">
                Loading...
            </div>
        )
    }

    if (!entry) return null

    // Split timeline: processBlocks = all except last text block (matches Ask page behavior)
    const lastTimelineBlock = entry.timeline?.at(-1)
    const lastIsText = lastTimelineBlock?.type === 'text'
    const processBlocks = lastIsText
        ? (entry.timeline ?? []).slice(0, -1)
        : (entry.timeline ?? [])

    const hasProcessContent = processBlocks.length > 0
    const toolBlocks = processBlocks.filter((b) => b.type === 'tool')
    const hasThinking = processBlocks.some((b) => b.type === 'thinking')

    return (
        <div className="px-3 pb-4">
            {/* Reasoning process (processBlocks: thinking + tool + intermediate text) */}
            {hasProcessContent && (
                <details className="mt-3 mb-2">
                    <summary className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide cursor-pointer select-none hover:text-ink transition-colors">
                        Reasoning process ({toolBlocks.length} tools
                        {hasThinking && ', thinking'})
                    </summary>
                    <div className="mt-3 pl-4 border-l-2 border-cream space-y-1">
                        {processBlocks.map((block, i) => (
                            <TimelineBlockView
                                // biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
                                key={i}
                                block={block}
                                docIdMap={docIdMap}
                            />
                        ))}
                    </div>
                </details>
            )}

            {/* Final answer */}
            <div className="mt-2">
                <Markdown docIdMap={docIdMap}>{annotatedAnswer}</Markdown>
            </div>

            {/* Review */}
            {entry.verdict && (
                <div className="mt-3 pt-3 border-t border-cream/50">
                    <p className="font-sans text-[8pt] text-olive">
                        Review: {entry.verdict} ({entry.score}/5) ·{' '}
                        {(entry.elapsedMs / 1000).toFixed(1)}s · {entry.steps}{' '}
                        steps
                    </p>
                </div>
            )}

            {/* Export */}
            <div className="mt-3">
                <button
                    type="button"
                    className="btn-ghost inline-flex items-center gap-1.5"
                    onClick={handleExport}
                    disabled={exporting}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7,10 12,15 17,10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {exporting ? 'Exporting…' : 'Export'}
                </button>
            </div>

            {/* Trace (fallback when no timeline, or as additional detail) */}
            {entry.trace && entry.trace.length > 0 && (
                <details className="mt-2">
                    <summary className="font-sans text-[8pt] text-ink cursor-pointer">
                        Trace ({entry.trace.length} steps)
                    </summary>
                    <div className="mt-2 code-block text-[7.5pt]">
                        {entry.trace.map((step, i) => (
                            <div
                                key={String(
                                    (step as Record<string, string>)
                                        .resultSummary
                                )}
                                className="text-olive leading-relaxed"
                            >
                                <span className="text-ink">
                                    {i + 1}.{' '}
                                    {(step as Record<string, string>).tool}
                                </span>{' '}
                                {(step as Record<string, string>).resultSummary}
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    )
}
