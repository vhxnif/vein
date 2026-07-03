import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { annotateRefs, Markdown } from '../components/Markdown.tsx'
import { RunCat } from '../components/RunCat.tsx'
import { TimelineBlockView } from '../components/TimelineBlockView.tsx'
import type { SearchResult } from '../lib/api.ts'
import { exportResultAsHtml } from '../lib/exportHtml.ts'
import { useProject } from '../lib/project.tsx'
import { type TimelineBlock, useSearch } from '../lib/search-context.tsx'

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
        timeline,
        previousTurns,
        sessionId,
        sessionList,
        runSearch,
        newSession,
        switchSession,
    } = useSearch()

    const [input, setInput] = useState('')
    const contentEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [stickyQuery, setStickyQuery] = useState('')

    // ── Scroll-aware sticky query header ─────────────────────
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current
        if (!container) return
        const containerRect = container.getBoundingClientRect()
        const threshold = containerRect.top + 60

        let found = ''
        for (const el of container.querySelectorAll('[data-turn-query]')) {
            const rect = (el as HTMLElement).getBoundingClientRect()
            if (rect.top <= threshold) {
                found =
                    (el as HTMLElement).getAttribute('data-turn-query') ?? ''
            }
        }
        setStickyQuery(found)
    }, [])

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return
        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [handleScroll])

    const scrollToBottom = useCallback(() => {
        contentEndRef.current?.scrollIntoView({
            behavior: 'instant',
            block: 'end',
        })
    }, [])
    // biome-ignore lint/correctness/useExhaustiveDependencies: timeline drives re-scroll during streaming
    useEffect(() => {
        if (searching) scrollToBottom()
    }, [searching, timeline, scrollToBottom])

    useEffect(() => {
        if (result) {
            contentEndRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
            })
        }
    }, [result])

    const handleSearch = () => {
        const q = input.trim()
        if (!q || searching) return
        runSearch(q)
        setInput('')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSearch()
        }
    }

    useEffect(() => {
        inputRef.current?.focus()
    }, [])
    useEffect(() => {
        if (!searching && result) inputRef.current?.focus()
    }, [searching, result])

    const hasAnyContent = previousTurns.length > 0 || query

    return (
        <div className="flex h-dvh md:h-screen">
            {/* ── Desktop: Session sidebar ────────── */}
            <SessionSidebar
                project={project}
                sessions={sessionList}
                currentId={sessionId}
                onSwitch={switchSession}
                onNew={newSession}
            />

            {/* ── Main: conversation ──────────────── */}
            <div className="flex flex-1 min-w-0 md:px-4">
                <div className="flex flex-col w-full max-w-[780px] mx-auto h-dvh md:h-screen">
                    {/* Mobile top bar */}
                    <MobileTopBar
                        project={project}
                        sessions={sessionList}
                        currentId={sessionId}
                        onSwitch={switchSession}
                        onNew={newSession}
                    />

                    {/* Conversation */}
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 min-h-0 overflow-y-auto kami-scrollbar relative flex flex-col"
                    >
                        {/* Sticky query header — shows the turn whose query has scrolled out of view */}
                        <div
                            className={`sticky top-0 z-10 bg-parchment/95 backdrop-blur-sm border-b border-cream/50 transition-opacity duration-150 ${stickyQuery ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        >
                            <div className="px-4 py-2 max-w-[780px] mx-auto">
                                <p className="font-serif text-[13pt] font-semibold text-ink leading-snug truncate">
                                    {stickyQuery}
                                </p>
                            </div>
                        </div>

                        <div
                            className={`flex flex-col px-4 pb-4 ${hasAnyContent || searching ? 'pt-6 md:pt-16' : ''}`}
                        >
                            {!hasAnyContent && !searching && (
                                <div className="flex-1 flex flex-col">
                                    {/* Top 50% — input sits at bottom of this, touching midline */}
                                    <div className="h-1/2 flex flex-col justify-end">
                                        <div className="w-full max-w-[600px] mx-auto px-4">
                                            <p className="font-serif text-[11pt] text-stone italic text-center mb-6">
                                                Ask anything about your
                                                documents
                                            </p>
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={input}
                                                onChange={(e) =>
                                                    setInput(
                                                        e.currentTarget.value
                                                    )
                                                }
                                                onKeyDown={handleKeyDown}
                                                placeholder="Type your question..."
                                                className="w-full bg-ivory ring-warm rounded-[8pt] px-[24pt] py-[16pt]
                                                           font-serif text-[11pt] leading-relaxed text-near-black
                                                           placeholder:text-stone outline-none
                                                           ring-ink-focus transition-shadow"
                                                disabled={searching}
                                            />
                                        </div>
                                    </div>
                                    {/* Bottom 50% — empty */}
                                    <div className="h-1/2" />
                                </div>
                            )}
                            {previousTurns.map((turn) => (
                                <div
                                    key={turn.query}
                                    data-turn-query={turn.query}
                                >
                                    <TurnBlock
                                        query={turn.query}
                                        result={turn.result}
                                        timeline={turn.timeline}
                                        variant="previous"
                                    />
                                </div>
                            ))}
                            {query && (
                                <div data-turn-query={query}>
                                    <TurnBlock
                                        query={query}
                                        result={result}
                                        timeline={timeline}
                                        searching={searching}
                                        error={error}
                                        elapsed={elapsed}
                                        variant="current"
                                    />
                                </div>
                            )}
                            <div ref={contentEndRef} />
                        </div>
                    </div>

                    {/* Input (bottom, only when content exists) */}
                    {hasAnyContent && (
                        <div className="flex-shrink-0 px-4 pb-6 pt-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) =>
                                    setInput(e.currentTarget.value)
                                }
                                onKeyDown={handleKeyDown}
                                placeholder="Type your question..."
                                className="w-full bg-ivory ring-warm rounded-[8pt] px-[24pt] py-[16pt]
                                           font-serif text-[11pt] leading-relaxed text-near-black
                                           placeholder:text-stone outline-none
                                           ring-ink-focus transition-shadow"
                                disabled={searching}
                            />
                        </div>
                    )}
                </div>

                {/* Desktop outline (right) */}
                <OutlinePanel
                    previousTurns={previousTurns}
                    currentResult={result}
                    currentQuery={query}
                />
            </div>
        </div>
    )
}

// ── Session sidebar (desktop) ────────────────────────────────

/** Format timestamp as relative time or short date. */
function _formatSessionTime(ts: number): string {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(ts).toLocaleDateString()
}

// ── Outline (desktop right panel) ─────────────────────────────

type OutlineItem = { level: number; text: string; id: string }

/** Generate consistent heading ID from plain text. Must match _headingId in Markdown.tsx. */
function _headingSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
}

/** Strip inline markdown formatting for plain-text display. */
function _stripMarkdown(text: string): string {
    return text
        .replace(/`([^`]+)`/g, '$1') // inline code
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/\*([^*]+)\*/g, '$1') // italic
        .replace(/__([^_]+)__/g, '$1') // bold (alt)
        .replace(/_([^_]+)_/g, '$1') // italic (alt)
        .replace(/~~([^~]+)~~/g, '$1') // strikethrough
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text only
        .trim()
}

function parseOutline(markdown: string): OutlineItem[] {
    const items: OutlineItem[] = []
    const re = /^(#{1,3})\s+(.+)$/gm
    for (const m of markdown.matchAll(re)) {
        const level = m[1]!.length
        const text = m[2]!.trim()
        items.push({
            level,
            text: _stripMarkdown(text),
            id: _headingSlug(text),
        })
    }
    return items
}

type OutlineGroup = { query: string; items: OutlineItem[] }

function OutlinePanel({
    previousTurns,
    currentResult,
    currentQuery,
}: {
    previousTurns: Array<{ query: string; result: { content: string } }>
    currentResult: { content: string } | null
    currentQuery: string
}) {
    const groups = useMemo(() => {
        const result: OutlineGroup[] = []
        for (const turn of previousTurns) {
            const items = parseOutline(turn.result.content)
            if (items.length > 0) result.push({ query: turn.query, items })
        }
        if (currentResult) {
            const items = parseOutline(currentResult.content)
            if (items.length > 0) result.push({ query: currentQuery, items })
        }
        return result
    }, [previousTurns, currentResult, currentQuery])

    const [activeId, setActiveId] = useState<string | null>(null)

    // Observe all heading elements across all turns
    useEffect(() => {
        const allItems = groups.flatMap((g) => g.items)
        if (allItems.length === 0) return
        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) setActiveId(e.target.id)
                }
            },
            { rootMargin: '-80px 0px -60% 0px' }
        )
        for (const item of allItems) {
            const el = document.getElementById(item.id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [groups])

    if (groups.length === 0) return null

    return (
        <nav className="hidden md:block w-[170px] flex-shrink-0 h-dvh md:h-screen overflow-y-auto pt-10 pl-5 pr-3 kami-scrollbar">
            <div className="sticky top-0">
                <p className="font-sans text-[7pt] font-semibold text-stone/60 uppercase tracking-wide mb-3">
                    Outline
                </p>
                {groups.map((group) => (
                    <div key={group.query} className="mb-4">
                        <p className="font-sans text-[6.5pt] font-medium text-stone/40 uppercase tracking-wide mb-1.5 truncate">
                            {group.query.slice(0, 40)}
                        </p>
                        {group.items.map((item) => (
                            <a
                                key={item.id}
                                href={`#${item.id}`}
                                onClick={(e) => {
                                    e.preventDefault()
                                    document
                                        .getElementById(item.id)
                                        ?.scrollIntoView({ behavior: 'smooth' })
                                }}
                                className={`block font-sans text-[7pt] leading-relaxed py-0.5 truncate transition-colors hover:text-ink
                                    ${item.id === activeId ? 'text-ink font-medium' : 'text-stone/60'}`}
                                style={{
                                    paddingLeft: `${8 + (item.level - 1) * 8}pt`,
                                }}
                            >
                                {item.text}
                            </a>
                        ))}
                    </div>
                ))}
            </div>
        </nav>
    )
}

function SessionSidebar({
    project,
    sessions,
    currentId,
    onSwitch,
    onNew,
}: {
    project: string | null
    sessions: Array<{
        sessionId: string
        summary: string
        queryCount: number
        updatedAt: number
    }>
    currentId: string | null
    onSwitch: (id: string) => Promise<void>
    onNew: () => void
}) {
    return (
        <aside className="hidden md:flex flex-col w-[200px] flex-shrink-0 border-r border-cream/40 bg-parchment h-screen overflow-y-auto kami-scrollbar">
            {/* Project name */}
            <div className="px-4 pt-6 pb-3">
                {project ? (
                    <h2 className="font-sans text-[8pt] font-medium text-stone leading-snug truncate">
                        {project}
                    </h2>
                ) : (
                    <p className="font-sans text-[7pt] text-stone/60">
                        No project
                    </p>
                )}
            </div>

            {/* Session list */}
            <div className="flex-1 px-2">
                {sessions.length === 0 ? (
                    <p className="px-2 font-sans text-[7pt] text-stone/50">
                        No sessions yet
                    </p>
                ) : (
                    sessions.map((s) => (
                        <button
                            key={s.sessionId}
                            type="button"
                            onClick={() => onSwitch(s.sessionId)}
                            className={`w-full text-left px-2 py-1.5 rounded-[4pt] mb-0.5 transition-colors hover:bg-sand/50
                                ${s.sessionId === currentId ? 'bg-sand/40' : ''}`}
                        >
                            <div
                                className={`font-sans text-[7.5pt] leading-snug truncate ${
                                    s.sessionId === currentId
                                        ? 'text-ink font-medium'
                                        : 'text-stone/80'
                                }`}
                            >
                                {s.summary.slice(0, 45)}
                            </div>
                            <div className="font-sans text-[6.5pt] text-stone/50 mt-0.5">
                                {s.queryCount} quer
                                {s.queryCount === 1 ? 'y' : 'ies'}
                                {' · '}
                                {_formatSessionTime(s.updatedAt)}
                            </div>
                        </button>
                    ))
                )}
            </div>

            {/* New session button */}
            <div className="px-2 pb-4 pt-2 border-t border-cream/30 mt-2">
                <button
                    type="button"
                    onClick={onNew}
                    className="w-full text-left px-2 py-1.5 rounded-[4pt] font-sans text-[7pt] text-stone/70 hover:text-ink hover:bg-sand/50 transition-colors"
                >
                    + New Session
                </button>
            </div>
        </aside>
    )
}

// ── Mobile top bar ───────────────────────────────────────────

function MobileTopBar({
    project,
    sessions,
    currentId,
    onSwitch,
    onNew,
}: {
    project: string | null
    sessions: Array<{
        sessionId: string
        summary: string
        queryCount: number
        updatedAt: number
    }>
    currentId: string | null
    onSwitch: (id: string) => Promise<void>
    onNew: () => void
}) {
    const current = sessions.find((s) => s.sessionId === currentId)
    const label = current ? current.summary.slice(0, 30) : (project ?? 'Vein')

    return (
        <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-cream/50 bg-parchment">
            <span className="font-serif text-[11pt] font-medium text-ink truncate max-w-[70%]">
                {label}
            </span>
            <SessionSwitcher
                sessions={sessions}
                currentId={currentId}
                onSwitch={onSwitch}
                onNew={onNew}
            />
        </div>
    )
}

// ── Session switcher dropdown ──────────────────────────────

function SessionSwitcher({
    sessions,
    currentId,
    onSwitch,
    onNew,
}: {
    sessions: Array<{
        sessionId: string
        summary: string
        queryCount: number
        updatedAt: number
    }>
    currentId: string | null
    onSwitch: (id: string) => Promise<void>
    onNew: () => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const current = sessions.find((s) => s.sessionId === currentId)
    const label = current
        ? current.summary.slice(0, 30)
        : sessions.length > 0
          ? `${sessions.length} session${sessions.length > 1 ? 's' : ''}`
          : 'Sessions'

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 font-sans text-[8pt] text-stone hover:text-ink transition-colors cursor-pointer"
            >
                <span className="max-w-[160px] truncate">{label}</span>
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                >
                    <polyline points="6,9 12,15 18,9" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-ivory ring-warm rounded-[8pt] py-1 px-1 z-50 shadow-sm max-h-[300px] overflow-y-auto">
                    {sessions.length === 0 ? (
                        <div className="px-3 py-3 font-sans text-[8pt] text-stone text-center">
                            No sessions yet
                        </div>
                    ) : (
                        sessions.map((s) => (
                            <button
                                key={s.sessionId}
                                type="button"
                                onClick={() => {
                                    onSwitch(s.sessionId)
                                    setOpen(false)
                                }}
                                className={`w-full text-left px-3 py-2 rounded-[4pt] transition-colors hover:bg-sand
                                    ${s.sessionId === currentId ? 'text-ink' : 'text-stone'}`}
                            >
                                <div className="font-serif text-[9pt] leading-snug truncate">
                                    {s.summary.slice(0, 60)}
                                </div>
                                <div className="font-sans text-[7pt] text-stone/70 mt-0.5">
                                    {s.queryCount} quer
                                    {s.queryCount === 1 ? 'y' : 'ies'}
                                    {' · '}
                                    {_formatSessionTime(s.updatedAt)}
                                </div>
                            </button>
                        ))
                    )}
                    <div className="border-t border-cream/50 mt-1 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                onNew()
                                setOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 rounded-[4pt] font-sans text-[8pt] text-ink hover:bg-sand transition-colors"
                        >
                            + New Session
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Turn block (Q + streaming/result) ───────────────────────

function TurnBlock({
    query,
    result,
    timeline,
    searching,
    error,
    elapsed,
    variant,
}: {
    query: string
    result: SearchResult | null
    timeline: TimelineBlock[]
    searching?: boolean
    error?: string | null
    elapsed?: number
    variant: 'previous' | 'current'
}) {
    const { project } = useProject()
    const [exporting, setExporting] = useState(false)

    const docIdMap = useMemo(() => {
        const m = new Map<string, string>()
        if (result?.docNames) {
            for (const fullId of Object.keys(result.docNames)) {
                m.set(fullId.slice(0, 8), fullId)
            }
        }
        return m
    }, [result?.docNames])

    const annotatedContent = useMemo(() => {
        if (!result?.content) return ''
        return annotateRefs(result.content, docIdMap)
    }, [result?.content, docIdMap])

    const lastBlock = timeline.at(-1)
    const lastIsText = lastBlock?.type === 'text'
    const processBlocks = lastIsText ? timeline.slice(0, -1) : timeline
    const hasProcessContent = processBlocks.length > 0
    const runningCount = timeline.filter(
        (b) => b.type === 'tool' && b.status === 'running'
    ).length
    const isPrevious = variant === 'previous'

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
                mode: result.review ? 'review' : 'quick',
                project,
            })
        } finally {
            setExporting(false)
        }
    }, [result, exporting, query, docIdMap, processBlocks, project])

    return (
        <div className={`pt-6 ${isPrevious ? 'opacity-75' : ''}`}>
            {isPrevious && <div className="mb-6 border-t border-ink/15" />}
            <div className="mb-4">
                <p className="font-serif text-[13pt] font-semibold text-ink leading-snug">
                    {query}
                </p>
            </div>

            {searching && timeline.length > 0 && (
                <div className="mb-4">
                    <div className="space-y-1">
                        {timeline.map((block) => (
                            <TimelineBlockView key={block.id} block={block} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <RunCat size={16} />
                        <span className="font-sans text-[8pt] text-olive">
                            {runningCount > 0
                                ? `${runningCount} tool${runningCount > 1 ? 's' : ''} running`
                                : lastBlock?.type === 'thinking'
                                  ? 'Thinking...'
                                  : 'Streaming...'}
                        </span>
                        {elapsed !== undefined && (
                            <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                                {elapsed.toFixed(1)}s
                            </span>
                        )}
                    </div>
                </div>
            )}

            {searching && timeline.length === 0 && (
                <div className="flex items-center gap-3 mb-4">
                    <RunCat size={24} />
                    <span className="font-sans text-[9pt] text-olive">
                        Searching...
                    </span>
                </div>
            )}

            {error && (
                <div className="mb-4 p-4 bg-ivory ring-warm rounded-[8pt]">
                    <p className="font-sans text-[9pt] text-error">{error}</p>
                </div>
            )}

            {result && (
                <div>
                    {hasProcessContent && (
                        <details className="mb-4">
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
                    <div style={{ animation: 'fadeIn 300ms ease' }}>
                        <Markdown docIdMap={docIdMap}>
                            {annotatedContent}
                        </Markdown>
                    </div>
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
                    <div className="mt-4 flex items-center gap-3 font-sans text-[8pt] text-stone">
                        {result.elapsedMs > 0 && (
                            <span>{(result.elapsedMs / 1000).toFixed(1)}s</span>
                        )}
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 py-[6pt] bg-transparent text-stone hover:text-ink rounded-[8pt] font-sans text-[9pt] font-medium cursor-pointer transition-colors"
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7,10 12,15 17,10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {exporting ? 'Exporting…' : 'Export'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
