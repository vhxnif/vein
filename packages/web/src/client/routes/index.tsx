import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RunCat } from '../components/RunCat'
import { useProject } from '../lib/project'
import { useSearch } from '../lib/search-context'

export const Route = createFileRoute('/')({
    component: HomePage,
})

// ── Tool call list (shared by desktop sidebar & mobile drawer) ─

function ToolCallList({
    toolCalls,
    searching,
    doneCount,
}: {
    toolCalls: Array<{
        id: string
        name: string
        label: string
        status: 'running' | 'done'
        summary?: string
    }>
    searching: boolean
    doneCount: number
}) {
    return (
        <>
            <div className="flex items-center justify-between mb-2">
                <span className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide">
                    {searching
                        ? `Tools (${doneCount}/${toolCalls.length})`
                        : `Tools (${toolCalls.length})`}
                </span>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {toolCalls.map((tc) => (
                    <div
                        key={tc.id}
                        className={`px-2.5 py-1.5 rounded-[6pt] text-[7.5pt] font-mono leading-snug ${
                            tc.status === 'running'
                                ? 'bg-olive/8 text-olive'
                                : 'bg-ivory text-stone'
                        }`}
                    >
                        <div className="flex items-center gap-1.5">
                            {tc.status === 'running' && <RunCat size={12} />}
                            <span className="truncate font-medium">
                                {tc.label}
                            </span>
                        </div>
                        {tc.status === 'done' && tc.summary && (
                            <div className="mt-0.5 text-[7pt] text-stone/60 truncate">
                                {tc.summary}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}

// ── Page ──────────────────────────────────────────────────────

function HomePage() {
    const { project } = useProject()
    const {
        query,
        searching,
        result,
        error,
        elapsed,
        streamingText,
        thinkingText,
        toolCalls,
        runSearch,
    } = useSearch()

    const [input, setInput] = useState(query)
    const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
    const contentEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to latest content as streaming progresses
    useEffect(() => {
        if (searching || result) {
            // Dependencies used below to trigger scroll on content change
            void streamingText
            void thinkingText
            void toolCalls
            contentEndRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            })
        }
    }, [streamingText, thinkingText, toolCalls, searching, result])

    // Close mobile drawer when search completes
    useEffect(() => {
        if (!searching && result) {
            setMobileToolsOpen(false)
        }
    }, [searching, result])

    const handleSearch = () => {
        const q = input.trim()
        if (!q || searching) return
        runSearch(q)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }

    const hasStreamingContent =
        streamingText.length > 0 ||
        thinkingText.length > 0 ||
        toolCalls.length > 0

    const hasToolCalls = toolCalls.length > 0
    const runningCount = toolCalls.filter(
        (tc) => tc.status === 'running'
    ).length
    const doneCount = toolCalls.filter((tc) => tc.status === 'done').length

    return (
        <>
            {/* ── Desktop tool call sidebar ─────────────────── */}
            {hasToolCalls && (
                <aside
                    className={[
                        'hidden lg:block fixed z-30 right-0 top-0 h-screen',
                        'w-[220px] pt-20 pb-8 px-4',
                        'border-l border-cream/40 bg-parchment/95',
                        'overflow-y-auto',
                        searching ? 'animate-[fadeIn_200ms_ease]' : '',
                    ].join(' ')}
                >
                    <ToolCallList
                        toolCalls={toolCalls}
                        searching={searching}
                        doneCount={doneCount}
                    />
                </aside>
            )}

            {/* ── Mobile tool call drawer ───────────────────── */}
            {hasToolCalls && (
                <div className="lg:hidden fixed bottom-[52px] left-0 right-0 z-40">
                    {/* Collapsed bar */}
                    {!mobileToolsOpen && (
                        <button
                            type="button"
                            onClick={() => setMobileToolsOpen(true)}
                            className="w-full flex items-center gap-2 px-4 py-2.5
                                       bg-ivory border-t border-cream/50
                                       font-sans text-[8pt] text-stone
                                       active:bg-sand transition-colors"
                        >
                            {runningCount > 0 && <RunCat size={14} />}
                            <span className="truncate">
                                {runningCount > 0
                                    ? `${runningCount} tool${runningCount > 1 ? 's' : ''} running`
                                    : `${doneCount} tool${doneCount !== 1 ? 's' : ''} completed`}
                                {(() => {
                                    const last = toolCalls[toolCalls.length - 1]
                                    return last ? ` — ${last.label}` : ''
                                })()}
                            </span>
                        </button>
                    )}

                    {/* Expanded panel */}
                    {mobileToolsOpen && (
                        <div className="bg-ivory border-t border-cream shadow-lg max-h-[45vh] overflow-y-auto px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide">
                                    Tools
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setMobileToolsOpen(false)}
                                    className="font-sans text-[8pt] text-stone hover:text-ink"
                                >
                                    Hide
                                </button>
                            </div>
                            <ToolCallList
                                toolCalls={toolCalls}
                                searching={searching}
                                doneCount={doneCount}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ── Main content ──────────────────────────────── */}
            <div
                className={`max-w-[780px] mx-auto px-8 py-16 ${
                    hasToolCalls ? 'lg:pr-[244px]' : ''
                }`}
            >
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

                {/* Searching state with no content yet */}
                {searching && !hasStreamingContent && (
                    <div className="mb-8 flex items-center gap-3">
                        <RunCat size={24} />
                        <span className="font-sans text-[9pt] text-olive">
                            Searching...
                        </span>
                        <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                            {elapsed}s
                        </span>
                    </div>
                )}

                {/* ── Streaming: show thinking + text inline ─── */}
                {searching && hasStreamingContent && (
                    <div className="mb-8">
                        {/* Thinking section (rendered as Markdown) */}
                        {thinkingText.length > 0 && (
                            <details className="mb-4" open>
                                <summary className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide cursor-pointer select-none">
                                    Thinking
                                </summary>
                                <div className="mt-2 pl-3 border-l-2 border-cream">
                                    <Markdown>{thinkingText}</Markdown>
                                </div>
                            </details>
                        )}

                        {/* Streaming markdown */}
                        {streamingText.length > 0 && (
                            <div className="opacity-90">
                                <Markdown>{streamingText}</Markdown>
                            </div>
                        )}

                        {/* Status bar at bottom: RunCat + elapsed (main page) */}
                        <div className="flex items-center gap-2 mt-4">
                            {runningCount > 0 ? (
                                <>
                                    <RunCat size={16} />
                                    <span className="font-sans text-[8pt] text-olive">
                                        Working...
                                    </span>
                                </>
                            ) : (
                                <span className="inline-flex items-center animate-pulse">
                                    <RunCat size={14} />
                                </span>
                            )}
                            <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                                {elapsed}s
                            </span>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mb-8 p-4 bg-ivory ring-warm rounded-[8pt]">
                        <p className="font-sans text-[9pt] text-error">
                            {error}
                        </p>
                    </div>
                )}

                {/* ── Completed result ──────────────────────── */}
                {result && (
                    <div className="mb-16">
                        {/* Collapsed reasoning (thinking only; tool calls are in sidebar) */}
                        {thinkingText.length > 0 && (
                            <details className="mb-6">
                                <summary className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide cursor-pointer select-none hover:text-ink transition-colors">
                                    Reasoning process
                                </summary>
                                <div className="mt-3 pl-4 border-l-2 border-cream">
                                    <Markdown>{thinkingText}</Markdown>
                                </div>
                            </details>
                        )}

                        {/* Final answer */}
                        <div style={{ animation: 'fadeIn 300ms ease' }}>
                            <Markdown>{result.content}</Markdown>
                        </div>

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
                {!searching && !result && !error && !hasStreamingContent && (
                    <p className="mt-12 font-sans text-[9pt] text-stone text-center">
                        Press Enter to search
                    </p>
                )}

                {/* Scroll anchor */}
                <div ref={contentEndRef} />
            </div>
        </>
    )
}
