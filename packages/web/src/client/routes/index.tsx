import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RunCat } from '../components/RunCat'
import { useProject } from '../lib/project'
import { useSearch } from '../lib/search-context'

export const Route = createFileRoute('/')({
    component: HomePage,
})

function HomePage() {
    const { project } = useProject()
    const { query, searching, result, error, elapsed, steps, runSearch } =
        useSearch()

    const [input, setInput] = useState(query)

    const handleSearch = () => {
        const q = input.trim()
        if (!q || searching) return
        runSearch(q)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            {/* Project indicator */}
            {project ? (
                <div className="text-center mb-12">
                    <h1 className="font-serif text-[22pt] font-medium leading-tight text-near-black">
                        {project}
                    </h1>
                    <p className="mt-1.5 font-sans text-[9pt] text-stone">
                        Search across documents in this project
                    </p>
                </div>
            ) : (
                <p className="font-sans text-[8.5pt] text-stone text-center mb-12">
                    No project selected — select one from the sidebar
                </p>
            )}

            {/* Search bar */}
            <div className="mb-4">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your question..."
                    className="w-full bg-ivory ring-warm rounded-[8pt] px-6 py-4
                               font-serif text-[11pt] leading-relaxed text-near-black
                               placeholder:text-stone outline-none
                               focus:ring-ink transition-shadow"
                    disabled={searching}
                />
            </div>

            {/* Searching indicator */}
            {searching && (
                <div className="mb-8">
                    <div className="flex items-center gap-3">
                        <RunCat size={24} />
                        <span className="font-sans text-[9pt] text-olive">
                            {steps.length > 0
                                ? steps[steps.length - 1]
                                : 'Searching...'}
                        </span>
                        <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                            {elapsed}s
                        </span>
                    </div>
                    {steps.length > 1 && (
                        <div className="mt-2 pl-7 space-y-1">
                            {steps
                                .slice(Math.max(0, steps.length - 6), -1)
                                .map((s) => (
                                    <div
                                        key={s}
                                        className="font-mono text-[7.5pt] text-stone"
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
                <div className="mb-8 p-4 bg-ivory ring-warm rounded-[8pt]">
                    <p className="font-sans text-[9pt] text-error">{error}</p>
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
                        <div className="mt-10 pt-5 border-t border-cream flex items-start gap-8">
                            <div>
                                <p className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide mb-1">
                                    Review
                                </p>
                                <p
                                    className={`font-sans text-[8.5pt] font-medium ${
                                        result.review.verdict === 'pass'
                                            ? 'text-ink'
                                            : result.review.verdict ===
                                                'partial'
                                              ? 'text-error'
                                              : 'text-stone'
                                    }`}
                                >
                                    {result.review.verdict} (
                                    {result.review.score}/5)
                                    {result.reviewElapsedMs !== undefined &&
                                        ` · ${(result.reviewElapsedMs / 1000).toFixed(1)}s`}
                                </p>
                            </div>
                            <p className="font-sans text-[8.5pt] text-stone leading-relaxed flex-1">
                                {result.review.reason}
                            </p>
                        </div>
                    )}

                    <div className="mt-6 flex items-center gap-4 font-sans text-[8pt] text-stone">
                        <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!searching && !result && !error && (
                <p className="mt-12 font-sans text-[9pt] text-stone text-center">
                    Press Enter to search
                </p>
            )}
        </div>
    )
}
