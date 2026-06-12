import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'
import { searchQuery } from '../lib/api'
import type { SearchResult } from '../lib/api'

export const Route = createFileRoute('/')({
    component: HomePage,
})

function HomePage() {
    const [query, setQuery] = useState('')
    const [searching, setSearching] = useState(false)
    const [result, setResult] = useState<SearchResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const [showTrace, setShowTrace] = useState(false)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const handleSearch = useCallback(async () => {
        if (!query.trim() || searching) return
        if (timerRef.current) clearInterval(timerRef.current)

        setSearching(true)
        setResult(null)
        setError(null)
        setElapsed(0)

        const startTime = Date.now()
        timerRef.current = setInterval(() => {
            setElapsed(Math.round((Date.now() - startTime) / 100) / 10)
        }, 100)

        try {
            const res = await searchQuery(query.trim(), showTrace)
            setResult(res)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed')
        } finally {
            setSearching(false)
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [query, searching, showTrace])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            {/* Hero title */}
            <h1 className="font-serif text-[42pt] font-medium leading-tight text-center text-[#141413]">
                my-docs
            </h1>

            {/* Search bar */}
            <div className="mt-12 mb-4 flex gap-3">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask your knowledge base..."
                    className="flex-1 bg-[#faf9f5] ring-warm rounded-[8pt] px-6 py-4
                               font-serif text-[11pt] leading-relaxed text-[#141413]
                               placeholder:text-[#6b6a64] outline-none
                               focus:ring-[#1B365D] transition-shadow"
                    disabled={searching}
                />
                <button
                    className="btn-primary"
                    onClick={handleSearch}
                    disabled={searching || !query.trim()}
                >
                    {searching ? 'Searching...' : 'Search'}
                </button>
                <label className="flex items-center gap-1.5 font-sans text-[8pt] text-[#504e49] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={showTrace}
                        onChange={(e) => setShowTrace(e.target.checked)}
                        className="accent-[#1B365D]"
                    />
                    Trace
                </label>
            </div>

            {/* Searching indicator */}
            {searching && (
                <div className="flex items-center gap-3 mb-8">
                    <span className="w-2 h-2 rounded-full bg-[#1B365D] animate-pulse" />
                    <span className="font-sans text-[9pt] text-[#504e49]">
                        Searching your knowledge base...
                    </span>
                    <span className="font-mono text-[8pt] text-[#6b6a64] tabular-nums">
                        {elapsed}s
                    </span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-8 p-4 bg-[#faf9f5] ring-warm rounded-[8pt]">
                    <p className="font-sans text-[9pt] text-[#b53333]">{error}</p>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="mt-10 mb-16" style={{ animation: 'fadeIn 300ms ease' }}>
                    <div className="font-serif text-[10pt] leading-relaxed text-[#141413] whitespace-pre-wrap">
                        {result.content}
                    </div>

                    {/* Review */}
                    {result.review && (
                        <div className="mt-10 pt-5 border-t border-[#d4d0c4] flex items-start gap-8">
                            <div>
                                <p className="font-sans text-[7.5pt] font-semibold text-[#6b6a64] uppercase tracking-wide mb-1">
                                    Review
                                </p>
                                <p className={`font-sans text-[8.5pt] font-medium ${
                                    result.review.verdict === 'pass' ? 'text-[#1B365D]'
                                    : result.review.verdict === 'partial' ? 'text-[#b53333]'
                                    : 'text-[#6b6a64]'}`}>
                                    {result.review.verdict} ({result.review.score}/5)
                                    {result.reviewElapsedMs !== undefined &&
                                        ` · ${(result.reviewElapsedMs / 1000).toFixed(1)}s`}
                                </p>
                            </div>
                            <p className="font-sans text-[8.5pt] text-[#6b6a64] leading-relaxed flex-1">
                                {result.review.reason}
                            </p>
                        </div>
                    )}

                    {/* Footer + Trace */}
                    <div className="mt-6 flex items-center gap-4 font-sans text-[8pt] text-[#6b6a64]">
                        <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
                        {result.trace && result.trace.length > 0 && (
                            <button
                                className="text-[#1B365D] hover:underline bg-transparent border-none cursor-pointer"
                                onClick={() => setShowTrace(!showTrace)}
                            >
                                {showTrace ? 'Hide trace' : 'Trace'}
                            </button>
                        )}
                    </div>

                    {showTrace && result.trace && result.trace.length > 0 && (
                        <div className="mt-3 code-block max-h-[200px] overflow-y-auto">
                            {result.trace.map((step: any, i: number) => (
                                <div key={i} className="font-mono text-[7.5pt] leading-relaxed text-[#504e49]">
                                    <span className="text-[#1B365D]">{i + 1}. {step.tool}</span>{' '}
                                    {step.resultSummary}
                                    {step.elapsedMs > 0 && <span className="text-[#6b6a64]"> · {step.elapsedMs}ms</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {!searching && !result && !error && (
                <p className="mt-16 font-serif text-[10pt] text-[#6b6a64] italic text-center">
                    Enter a query and press Enter to search your knowledge base.
                </p>
            )}
        </div>
    )
}
