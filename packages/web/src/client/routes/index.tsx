import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { annotateNodeRefs, Markdown } from '../components/Markdown.tsx'
import { RunCat } from '../components/RunCat.tsx'
import { TimelineBlockView } from '../components/TimelineBlockView.tsx'
import { exportResultAsHtml } from '../lib/exportHtml.ts'
import { useProject } from '../lib/project.tsx'
import { useSearch } from '../lib/search-context.tsx'

export const Route = createFileRoute('/')({
    component: HomePage,
})

// ── Home page ────────────────────────────────────────────────

function HomePage() {
    const { project } = useProject()
    const {
        query,
        searching,
        result,
        error,
        elapsed,
        mode,
        timeline,
        runSearch,
        setMode,
    } = useSearch()

    const [input, setInput] = useState(query)
    const [exporting, setExporting] = useState(false)
    const contentEndRef = useRef<HTMLDivElement>(null)
    const topAnchorRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom during streaming only
    useEffect(() => {
        if (searching) {
            contentEndRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            })
        }
        void timeline.length
    }, [timeline, searching])

    // Scroll to top when results arrive — defer so the Layout's
    // flex recalc (StreamingStatusBar removal on mobile) settles first.
    useEffect(() => {
        if (result) {
            const timer = setTimeout(() => {
                topAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 0)
            return () => clearTimeout(timer)
        }
    }, [result])

    // On mount: if there's existing search data, scroll to top
    const didMountRef = useRef(false)
    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true
            if (result || error) {
                topAnchorRef.current?.scrollIntoView()
            }
        }
    }, [result, error])

    const handleSearch = () => {
        const q = input.trim()
        if (!q || searching) return
        runSearch(q, mode)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }

    // For the completed collapsed view: split timeline into
    // "process" (everything except the last text block) and
    // "finalText" (the last text block, if any).
    const lastBlock = timeline.at(-1)
    const lastIsText = lastBlock?.type === 'text'
    const processBlocks = lastIsText ? timeline.slice(0, -1) : timeline

    const hasProcessContent = processBlocks.length > 0

    const runningCount = timeline.filter(
        (b) => b.type === 'tool' && b.status === 'running'
    ).length

    // Build shortId → fullDocId lookup from result.docNames
    const docIdMap = useMemo(() => {
        const m = new Map<string, string>()
        if (result?.docNames) {
            for (const fullId of Object.keys(result.docNames)) {
                m.set(fullId.slice(0, 8), fullId)
            }
        }
        return m
    }, [result?.docNames])

    const handleExport = useCallback(async () => {
        if (!result || exporting) return
        setExporting(true)
        try {
            await exportResultAsHtml({
                query,
                content: result.content,
                docIdMap,
                review: result.review,
                reviewElapsedMs: result.reviewElapsedMs,
                timeline: processBlocks,
                elapsedMs: result.elapsedMs,
                mode,
                project,
            })
        } finally {
            setExporting(false)
        }
    }, [result, exporting, query, docIdMap, processBlocks, mode, project])

    // Annotate node references in content for hover tooltips
    const annotatedContent = useMemo(() => {
        if (!result?.content) return ''
        return annotateNodeRefs(result.content, docIdMap)
    }, [result?.content, docIdMap])

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            {/* Scroll anchor for top-of-page navigation */}
            <div ref={topAnchorRef} />

            {/* Project indicator */}
            {project ? (
                <div className="text-center mb-12">
                    <h1 className="font-serif text-[22pt] font-medium leading-tight text-ink">
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
                    className="w-full bg-ivory ring-warm rounded-[8pt] px-[24pt] py-[16pt]
                               font-serif text-[11pt] leading-relaxed text-near-black
                               placeholder:text-stone outline-none
                               ring-ink-focus transition-shadow"
                    disabled={searching}
                />
            </div>

            {/* Mode selector */}
            <div className="mb-6 flex items-center gap-2">
                <span className="font-sans text-[8pt] text-stone">Mode:</span>
                <button
                    type="button"
                    disabled={searching}
                    onClick={() => setMode('quick')}
                    className={`px-[12pt] py-[4pt] rounded-full font-sans text-[8pt] font-medium transition-colors ${
                        mode === 'quick'
                            ? 'bg-ink text-ivory border border-ink'
                            : 'border border-cream bg-transparent text-stone hover:border-ink/30 hover:text-near-black'
                    }`}
                >
                    Quick
                </button>
                <button
                    type="button"
                    disabled={searching}
                    onClick={() => setMode('default')}
                    className={`px-[12pt] py-[4pt] rounded-full font-sans text-[8pt] font-medium transition-colors ${
                        mode === 'default'
                            ? 'bg-ink text-ivory border border-ink'
                            : 'border border-cream bg-transparent text-stone hover:border-ink/30 hover:text-near-black'
                    }`}
                >
                    Review
                </button>
            </div>

            {/* Desktop: initial searching state (mobile handled by Layout's StreamingStatusBar) */}
            {searching && timeline.length === 0 && (
                <div className="hidden md:flex items-center gap-3 mb-8">
                    <RunCat size={24} />
                    <span className="font-sans text-[9pt] text-olive">
                        Searching...
                    </span>
                    <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                        {elapsed.toFixed(1)}s
                    </span>
                </div>
            )}

            {/* ── Streaming: timeline ── */}
            {searching && timeline.length > 0 && (
                <div className="mb-8">
                    <div className="space-y-1">
                        {timeline.map((block) => (
                            <TimelineBlockView key={block.id} block={block} />
                        ))}
                    </div>

                    {/* Desktop status bar — inline, scrolls with content */}
                    <div className="hidden md:flex items-center gap-2 mt-3">
                        <RunCat size={16} />
                        <span className="font-sans text-[8pt] text-olive">
                            {runningCount > 0
                                ? `${runningCount} tool${runningCount > 1 ? 's' : ''} running`
                                : lastBlock?.type === 'thinking'
                                  ? 'Thinking...'
                                  : 'Streaming...'}
                        </span>
                        <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                            {elapsed.toFixed(1)}s
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
                                        docIdMap={docIdMap}
                                    />
                                ))}
                            </div>
                        </details>
                    )}

                    {/* Final answer */}
                    <div style={{ animation: 'fadeIn 300ms ease' }}>
                        <Markdown docIdMap={docIdMap}>
                            {annotatedContent}
                        </Markdown>
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
