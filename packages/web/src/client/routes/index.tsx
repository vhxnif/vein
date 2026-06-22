import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { RunCat } from '../components/RunCat'
import { useProject } from '../lib/project'
import { type TimelineBlock, useSearch } from '../lib/search-context'

export const Route = createFileRoute('/')({
    component: HomePage,
})

// ── Braille spinner (classic single-char) ────────────────────

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function BrailleSpinner({ size = 'text-[10pt]' }: { size?: string }) {
    const [frame, setFrame] = useState(0)

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame((f) => (f + 1) % BRAILLE_FRAMES.length)
        }, 120)
        return () => clearInterval(timer)
    }, [])

    return (
        <span
            className={`inline-flex flex-shrink-0 leading-none ${size}`}
            aria-hidden="true"
        >
            {BRAILLE_FRAMES[frame]}
        </span>
    )
}

// ── Single timeline block renderer ────────────────────────────

function TimelineBlockView({ block }: { block: TimelineBlock }) {
    if (block.type === 'thinking') {
        return (
            <div className="my-2 italic text-stone/70">
                <Markdown>{block.text}</Markdown>
            </div>
        )
    }

    if (block.type === 'tool') {
        return (
            <div
                className={`my-1.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[8pt] font-mono max-w-full ${
                    block.status === 'running'
                        ? 'border-olive/30 bg-olive/5 text-olive'
                        : 'border-cream bg-ivory text-stone'
                }`}
            >
                {block.status === 'running' && <BrailleSpinner />}
                <span className="truncate">{block.label}</span>
                {block.status === 'done' && block.summary && (
                    <span className="text-stone/60 truncate">
                        → {block.summary}
                    </span>
                )}
            </div>
        )
    }

    if (block.type === 'text') {
        return <Markdown>{block.text}</Markdown>
    }

    return null
}

// ── Home page ────────────────────────────────────────────────

function HomePage() {
    const { project } = useProject()
    const { query, searching, result, error, elapsed, timeline, runSearch } =
        useSearch()

    const [input, setInput] = useState(query)
    const [mode, setMode] = useState<'default' | 'raw'>('default')
    const contentEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to latest content as streaming progresses
    useEffect(() => {
        if (searching || result) {
            contentEndRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            })
        }
        // timeline is read via closure to trigger re-scroll on new blocks
        void timeline.length
    }, [timeline, searching, result])

    const handleSearch = () => {
        const q = input.trim()
        if (!q || searching) return
        runSearch(q, mode)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }

    const runningCount = timeline.filter(
        (b) => b.type === 'tool' && b.status === 'running'
    ).length

    // For the completed collapsed view: split timeline into
    // "process" (everything except the last text block) and
    // "finalText" (the last text block, if any).
    const lastBlock = timeline[timeline.length - 1]
    const lastIsText = lastBlock?.type === 'text'
    const processBlocks = lastIsText ? timeline.slice(0, -1) : timeline

    const hasProcessContent = processBlocks.length > 0

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
            <div className="mb-3">
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

            {/* Mode selector */}
            <div className="mb-6 flex items-center gap-2">
                <span className="font-sans text-[8pt] text-stone">Mode:</span>
                <button
                    type="button"
                    disabled={searching}
                    onClick={() => setMode('default')}
                    className={`px-3 py-1 rounded-full font-sans text-[8pt] font-medium transition-colors ${
                        mode === 'default'
                            ? 'bg-ink text-ivory'
                            : 'bg-cream text-stone hover:bg-warm'
                    }`}
                >
                    Analyze+Review
                </button>
                <button
                    type="button"
                    disabled={searching}
                    onClick={() => setMode('raw')}
                    className={`px-3 py-1 rounded-full font-sans text-[8pt] font-medium transition-colors ${
                        mode === 'raw'
                            ? 'bg-ink text-ivory'
                            : 'bg-cream text-stone hover:bg-warm'
                    }`}
                >
                    Raw Fragments
                </button>
            </div>

            {/* Searching state with no content yet */}
            {searching && timeline.length === 0 && (
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

            {/* ── Streaming: timeline + status bar ── */}
            {searching && timeline.length > 0 && (
                <div className="mb-8">
                    {/* Timeline blocks */}
                    <div className="space-y-1">
                        {timeline.map((block) => (
                            <TimelineBlockView key={block.id} block={block} />
                        ))}
                    </div>

                    {/* Status bar fixed at bottom of content */}
                    <div className="flex items-center gap-2 mt-3">
                        <RunCat size={16} />
                        <span className="font-sans text-[8pt] text-olive">
                            {runningCount > 0
                                ? `${runningCount} tool${runningCount > 1 ? 's' : ''} running`
                                : lastBlock?.type === 'thinking'
                                  ? 'Thinking...'
                                  : 'Streaming...'}
                        </span>
                        <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                            {elapsed}s
                        </span>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-8 p-4 bg-ivory ring-warm rounded-[8pt]">
                    <p className="font-sans text-[9pt] text-error">{error}</p>
                </div>
            )}

            {/* ── Completed result ──────────────────────────── */}
            {result && (
                <div className="mb-16">
                    {/* Collapsed reasoning process */}
                    {hasProcessContent && (
                        <details className="mb-6">
                            <summary className="font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide cursor-pointer select-none hover:text-ink transition-colors">
                                Reasoning process (
                                {
                                    processBlocks.filter(
                                        (b) => b.type === 'tool'
                                    ).length
                                }{' '}
                                tools
                                {processBlocks.some(
                                    (b) => b.type === 'thinking'
                                ) && ', thinking'}
                                )
                            </summary>
                            <div className="mt-3 pl-4 border-l-2 border-cream space-y-1">
                                {processBlocks.map((block) => (
                                    <TimelineBlockView
                                        key={block.id}
                                        block={block}
                                    />
                                ))}
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
            {!searching && !result && !error && timeline.length === 0 && (
                <p className="mt-12 font-sans text-[9pt] text-stone text-center">
                    Press Enter to search
                </p>
            )}

            {/* Scroll anchor */}
            <div ref={contentEndRef} />
        </div>
    )
}
