import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import type { HistoryEntry } from '../lib/api'
import { fetchHistory, fetchHistoryEntry } from '../lib/api'
import { useProject } from '../lib/project'

export const Route = createFileRoute('/history')({
    component: HistoryPage,
})

function HistoryPage() {
    const { project } = useProject()
    const [page, setPage] = useState(1)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const pageSize = 20

    const { data, isLoading, error } = useQuery({
        queryKey: ['history', project, page],
        queryFn: () => fetchHistory(page, pageSize),
        staleTime: 30_000,
    })

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

    const entries = data?.entries ?? []
    const total = data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    // Group entries by date
    const groups: Record<string, HistoryEntry[]> = {}
    for (const entry of entries) {
        const date = entry.id.slice(0, 10)
        if (!groups[date]) groups[date] = []
        groups[date].push(entry)
    }

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-8">
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
            ) : (
                <div>
                    {Object.entries(groups).map(([date, items]) => (
                        <div key={date} className="mb-8">
                            <h3 className="font-serif text-[11pt] font-medium text-olive mb-3">
                                {date}
                            </h3>
                            {items.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="border-b border-cream/30"
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-3 -mx-3 rounded-[6pt] flex items-center justify-between
                                                   bg-transparent border-none cursor-pointer
                                                   hover:bg-sand/60 transition-colors"
                                        onClick={() =>
                                            setExpandedId(
                                                expandedId === entry.id
                                                    ? null
                                                    : entry.id
                                            )
                                        }
                                    >
                                        <span className="font-serif text-[10pt] text-near-black leading-relaxed">
                                            {entry.query}
                                        </span>
                                        <span className="font-sans text-[8pt] text-olive flex items-center gap-3">
                                            {entry.verdict && (
                                                <span
                                                    className={
                                                        entry.verdict === 'pass'
                                                            ? 'text-ink'
                                                            : entry.verdict ===
                                                                'partial'
                                                              ? 'text-error'
                                                              : 'text-stone'
                                                    }
                                                >
                                                    {entry.verdict}{' '}
                                                    {entry.score}/5
                                                </span>
                                            )}
                                            <span>
                                                {(
                                                    entry.elapsedMs / 1000
                                                ).toFixed(1)}
                                                s
                                            </span>
                                            <span className="text-[10pt]">
                                                {expandedId === entry.id
                                                    ? '▾'
                                                    : '▸'}
                                            </span>
                                        </span>
                                    </button>
                                    {expandedId === entry.id && (
                                        <ExpandedEntry id={entry.id} />
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mt-8 pt-5 border-t border-cream flex items-center justify-between font-sans text-[9pt] text-olive">
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        ← Prev
                    </button>
                    <span>
                        {page} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={page >= totalPages}
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    )
}

function ExpandedEntry({ id }: { id: string }) {
    const { data: entry, isLoading } = useQuery({
        queryKey: ['historyEntry', id],
        queryFn: () => fetchHistoryEntry(id),
        staleTime: 60_000,
    })

    if (isLoading) {
        return (
            <div className="px-3 pb-4 font-sans text-[8.5pt] text-olive">
                Loading...
            </div>
        )
    }

    if (!entry) return null

    return (
        <div className="px-3 pb-4">
            <div className="mt-2">
                <Markdown>{entry.answer || '(no answer)'}</Markdown>
            </div>

            {entry.verdict && (
                <div className="mt-3 pt-3 border-t border-cream/50">
                    <p className="font-sans text-[8pt] text-olive">
                        Review: {entry.verdict} ({entry.score}/5) ·{' '}
                        {(entry.elapsedMs / 1000).toFixed(1)}s · {entry.steps}{' '}
                        steps
                    </p>
                </div>
            )}

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
