import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import type { SearchResult } from '../lib/api'
import { searchQuery } from '../lib/api'

export const Route = createFileRoute('/')({
    component: HomePage,
})

function HomePage() {
    const [query, setQuery] = useState('')
    const [searching, setSearching] = useState(false)
    const [result, setResult] = useState<SearchResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const [steps, setSteps] = useState<string[]>([])
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const handleSearch = useCallback(async () => {
        if (!query.trim() || searching) return
        if (timerRef.current) clearInterval(timerRef.current)

        setSearching(true)
        setResult(null)
        setError(null)
        setElapsed(0)
        setSteps([])

        const startTime = Date.now()
        timerRef.current = setInterval(() => {
            setElapsed(Math.round((Date.now() - startTime) / 100) / 10)
        }, 100)

        try {
            const res = await searchQuery(query.trim(), (label) => {
                setSteps((prev) => [...prev, label])
            })
            setResult(res)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed')
        } finally {
            setSearching(false)
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [query, searching])

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
            <div className="mt-12 mb-4">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask your knowledge base..."
                    className="w-full bg-[#faf9f5] ring-warm rounded-[8pt] px-6 py-4
                               font-serif text-[11pt] leading-relaxed text-[#141413]
                               placeholder:text-[#6b6a64] outline-none
                               focus:ring-[#1B365D] transition-shadow"
                    disabled={searching}
                />
            </div>

            {/* Searching indicator */}
            {searching && (
                <div className="mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-[#1B365D] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <span className="font-sans text-[9pt] text-[#504e49]">
                            {steps.length > 0
                                ? steps[steps.length - 1]
                                : 'Searching your knowledge base...'}
                        </span>
                        <span className="font-mono text-[8pt] text-[#6b6a64] tabular-nums ml-auto">
                            {elapsed}s
                        </span>
                    </div>
                    {steps.length > 1 && (
                        <div className="mt-2 pl-7 space-y-1">
                            {steps
                                .slice(Math.max(0, steps.length - 11), -1)
                                .map((s, i) => (
                                    <div
                                        key={`${i}-${s}`}
                                        className="font-mono text-[7.5pt] text-[#6b6a64]"
                                    >
                                        ✓ {s}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-8 p-4 bg-[#faf9f5] ring-warm rounded-[8pt]">
                    <p className="font-sans text-[9pt] text-[#b53333]">
                        {error}
                    </p>
                </div>
            )}

            {/* Result */}
            {result && (
                <div
                    className="mt-10 mb-16"
                    style={{ animation: 'fadeIn 300ms ease' }}
                >
                    <Markdown>{result.content}</Markdown>

                    {/* Review */}
                    {result.review && (
                        <div className="mt-10 pt-5 border-t border-[#d4d0c4] flex items-start gap-8">
                            <div>
                                <p className="font-sans text-[7.5pt] font-semibold text-[#6b6a64] uppercase tracking-wide mb-1">
                                    Review
                                </p>
                                <p
                                    className={`font-sans text-[8.5pt] font-medium ${
                                        result.review.verdict === 'pass'
                                            ? 'text-[#1B365D]'
                                            : result.review.verdict ===
                                                'partial'
                                              ? 'text-[#b53333]'
                                              : 'text-[#6b6a64]'
                                    }`}
                                >
                                    {result.review.verdict} (
                                    {result.review.score}/5)
                                    {result.reviewElapsedMs !== undefined &&
                                        ` · ${(result.reviewElapsedMs / 1000).toFixed(1)}s`}
                                </p>
                            </div>
                            <p className="font-sans text-[8.5pt] text-[#6b6a64] leading-relaxed flex-1">
                                {result.review.reason}
                            </p>
                        </div>
                    )}

                    <div className="mt-6 flex items-center gap-4 font-sans text-[8pt] text-[#6b6a64]">
                        <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
                    </div>
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
