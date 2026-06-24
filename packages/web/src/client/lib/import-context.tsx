import { useQueryClient } from '@tanstack/react-query'
import {
    createContext,
    type DragEvent,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { type ImportResultEvent, importDocuments } from './api.ts'

// ── Types ──────────────────────────────────────────────────────

type ModalPhase = 'ready' | 'uploading' | 'done' | 'error' | 'minimized'

interface ImportState {
    phase: ModalPhase
    progress?: {
        phase: 'parse' | 'write'
        message: string
        completed?: number
        total?: number
    }
    result?: ImportResultEvent
    error?: string
}

interface ImportContextType {
    /** Open the import dialog. Returns false if an import is already in progress. */
    open: () => boolean
}

const ImportContext = createContext<ImportContextType>({
    open: () => false,
})

// ── Provider ───────────────────────────────────────────────────

export function ImportProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const abortRef = useRef<AbortController | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [state, setState] = useState<ImportState>({ phase: 'ready' })
    const [isDragging, setIsDragging] = useState(false)
    const [excludedCount, setExcludedCount] = useState(0)
    const [toast, setToast] = useState<string | null>(null)
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort()
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        }
    }, [])

    /** Dismiss and optionally invalidate queries */
    const closeModal = useCallback(() => {
        // Always invalidate on close: either we have a result, or progress
        // reached 100% (import completed server-side but result event may
        // have been dropped). Invalidate is cheap and ensures fresh data.
        const s = stateRef.current
        const progressComplete =
            s.progress?.phase === 'write' &&
            s.progress.total != null &&
            s.progress.total > 0 &&
            s.progress.completed != null &&
            s.progress.completed >= s.progress.total
        if (s.phase === 'done' || s.result || progressComplete) {
            queryClient.invalidateQueries({ queryKey: ['documents'] })
        }
        setIsOpen(false)
    }, [queryClient])

    // Close on Escape (not when uploading, expand from minimized)
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (
                e.key === 'Escape' &&
                state.phase !== 'uploading' &&
                state.phase !== 'minimized'
            ) {
                closeModal()
            } else if (e.key === 'Escape' && state.phase === 'minimized') {
                setState((s) => ({ ...s, phase: 'uploading' }))
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen, state.phase, closeModal])

    /** Filter files to accepted markdown extensions */
    const filterMarkdown = useCallback((files: FileList | File[]): File[] => {
        const accepted = ['.md', '.mdx', '.markdown']
        const all = Array.from(files)
        const valid = all.filter((f) => {
            const ext = `.${f.name.split('.').pop()?.toLowerCase()}`
            return accepted.includes(ext)
        })
        const excluded = all.length - valid.length
        if (excluded > 0) {
            setExcludedCount((c) => c + excluded)
        }
        return valid
    }, [])

    /** Show a toast and auto-dismiss */
    const showToast = useCallback((message: string) => {
        setToast(message)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => setToast(null), 5000)
    }, [])

    /** Kick off the import pipeline */
    const startImport = useCallback(
        async (files: File[]) => {
            const filtered = filterMarkdown(files)
            if (filtered.length === 0) return

            setState({
                phase: 'uploading',
                progress: {
                    phase: 'parse',
                    message:
                        filtered.length > 1
                            ? `Importing ${filtered.length} files...`
                            : 'Importing file...',
                    completed: 0,
                    total: filtered.length,
                },
            })

            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller

            try {
                for await (const event of importDocuments(
                    filtered,
                    controller.signal
                )) {
                    switch (event.type) {
                        case 'progress':
                            setState((s) => ({
                                ...s,
                                progress: {
                                    phase: event.phase,
                                    message: event.message,
                                    completed: event.completed,
                                    total: event.total ?? s.progress?.total,
                                },
                            }))
                            break
                        case 'result':
                            if (stateRef.current.phase === 'minimized') {
                                const parts: string[] = []
                                if (event.imported > 0)
                                    parts.push(`${event.imported} imported`)
                                if (event.failed > 0)
                                    parts.push(`${event.failed} failed`)
                                showToast(
                                    `Import complete: ${parts.join(', ')}`
                                )
                                queryClient.invalidateQueries({
                                    queryKey: ['documents'],
                                })
                                setState((s) => ({
                                    ...s,
                                    phase: 'minimized',
                                    result: event,
                                }))
                                return
                            }
                            setState({ phase: 'done', result: event })
                            break
                        case 'error':
                            if (stateRef.current.phase === 'minimized') {
                                showToast(`Import failed: ${event.error}`)
                                setState((s) => ({
                                    ...s,
                                    phase: 'minimized',
                                    error: event.error,
                                }))
                                return
                            }
                            setState({ phase: 'error', error: event.error })
                            break
                        case 'done':
                            break
                    }
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError')
                    return
                const msg = err instanceof Error ? err.message : 'Import failed'
                if (stateRef.current.phase === 'minimized') {
                    showToast(`Import failed: ${msg}`)
                    setState((s) => ({ ...s, phase: 'minimized', error: msg }))
                    return
                }
                setState({ phase: 'error', error: msg })
            }
        },
        [queryClient, showToast, filterMarkdown]
    )

    /** Open the import dialog */
    const open = useCallback((): boolean => {
        if (
            stateRef.current.phase === 'uploading' ||
            stateRef.current.phase === 'minimized'
        ) {
            // Already importing — expand to full modal if minimized
            if (stateRef.current.phase === 'minimized') {
                setState((s) => ({ ...s, phase: 'uploading' }))
            }
            return false
        }
        setState({ phase: 'ready' })
        setIsDragging(false)
        setExcludedCount(0)
        setToast(null)
        setIsOpen(true)
        return true
    }, [])

    // ── Drag-and-drop ──────────────────────────────────────
    const dragCounter = useRef(0)

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current++
        if (state.phase === 'ready') setIsDragging(true)
    }
    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current === 0) setIsDragging(false)
    }
    const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }
    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        dragCounter.current = 0
        if (state.phase === 'ready' && e.dataTransfer.files.length > 0) {
            startImport(Array.from(e.dataTransfer.files))
        }
    }

    const handleFilesSelected = () => {
        const input = fileInputRef.current
        if (input?.files && input.files.length > 0) {
            startImport(Array.from(input.files))
            input.value = ''
        }
    }

    const minimize = () => setState((s) => ({ ...s, phase: 'minimized' }))
    const expand = () => {
        if (state.result) {
            setState((s) => ({ ...s, phase: 'done' }))
        } else if (state.error) {
            setState((s) => ({ ...s, phase: 'error' }))
        } else {
            setState((s) => ({ ...s, phase: 'uploading' }))
        }
    }

    // ── Render ─────────────────────────────────────────────

    return (
        <ImportContext.Provider value={{ open }}>
            {children}

            {/* Hidden file input (shared) */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".md,.mdx,.markdown"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
            />

            {isOpen && state.phase === 'minimized' && (
                <MinimizedBar
                    progress={state.progress}
                    result={state.result}
                    error={state.error}
                    toast={toast}
                    pct={
                        state.progress?.total &&
                        state.progress.total > 0 &&
                        state.progress?.completed !== undefined
                            ? Math.round(
                                  (state.progress.completed /
                                      state.progress.total) *
                                      100
                              )
                            : undefined
                    }
                    onExpand={expand}
                    onClose={closeModal}
                />
            )}

            {isOpen && state.phase !== 'minimized' && (
                // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for modal dismissal
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="presentation"
                    onClick={
                        state.phase !== 'uploading' ? closeModal : undefined
                    }
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' && state.phase !== 'uploading')
                            closeModal()
                    }}
                >
                    <div className="absolute inset-0 bg-near-black/30" />

                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div
                        className="relative max-w-md w-full bg-ivory ring-warm rounded-[12pt] shadow-lg p-6 animate-[fadeIn_250ms_ease]"
                        style={{ boxShadow: '0 4pt 24pt rgba(0,0,0,0.08)' }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Import documents"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        {state.phase === 'ready' && (
                            <ReadyView
                                isDragging={isDragging}
                                excludedCount={excludedCount}
                                onDragEnter={handleDragEnter}
                                onDragLeave={handleDragLeave}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onBrowse={() => fileInputRef.current?.click()}
                                onCancel={closeModal}
                            />
                        )}

                        {state.phase === 'uploading' && state.progress && (
                            <UploadingView
                                progress={state.progress}
                                onMinimize={minimize}
                                onAbort={() => {
                                    abortRef.current?.abort()
                                    closeModal()
                                }}
                            />
                        )}

                        {state.phase === 'done' && state.result && (
                            <DoneView
                                result={state.result}
                                onClose={closeModal}
                            />
                        )}

                        {state.phase === 'error' && (
                            <ErrorView
                                error={state.error ?? 'Unknown error'}
                                onClose={closeModal}
                            />
                        )}
                    </div>
                </div>
            )}
        </ImportContext.Provider>
    )
}

// ── Hook ───────────────────────────────────────────────────────

export function useImport() {
    return useContext(ImportContext)
}

// ── Sub-views ──────────────────────────────────────────────────

function MinimizedBar({
    progress,
    result,
    error,
    toast,
    pct,
    onExpand,
    onClose,
}: {
    progress?: {
        phase: 'parse' | 'write'
        message: string
        completed?: number
        total?: number
    }
    result?: ImportResultEvent
    error?: string
    toast: string | null
    pct: number | undefined
    onExpand: () => void
    onClose: () => void
}) {
    const isDone = result != null
    const isFailed = error != null
    const isProgressComplete =
        progress?.phase === 'write' &&
        progress.total &&
        progress.total > 0 &&
        progress.completed !== undefined &&
        progress.completed >= progress.total
    const isTerminal = isDone || isFailed || isProgressComplete
    const isParse = progress?.phase === 'parse'

    return (
        <>
            {toast && (
                <div className="fixed bottom-36 md:bottom-20 right-4 z-[60] max-w-xs w-full bg-ivory ring-warm rounded-[8pt] shadow-lg p-3 animate-[fadeIn_250ms_ease]">
                    <p className="font-sans text-[9pt] text-near-black leading-relaxed">
                        {toast}
                    </p>
                </div>
            )}

            <div className="fixed bottom-20 md:bottom-4 right-4 z-[55] max-w-xs w-full bg-ivory ring-warm rounded-[10pt] shadow-lg p-3 animate-[fadeIn_250ms_ease]">
                {/* Header row */}
                <div className="flex items-center gap-2 mb-2">
                    {/* Status icon */}
                    {isDone && (
                        <span className="flex-shrink-0">
                            {StatusIcon({ status: 'imported' })}
                        </span>
                    )}
                    {isFailed && (
                        <span className="flex-shrink-0">
                            {StatusIcon({ status: 'failed' })}
                        </span>
                    )}
                    {!isTerminal && (
                        <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${isParse ? 'bg-ink animate-pulse' : 'bg-cream'}`}
                        />
                    )}

                    <p className="font-sans text-[8.5pt] text-near-black truncate flex-1">
                        {isDone
                            ? `Done: ${result.imported} imported${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                            : isFailed
                              ? `Failed: ${error}`
                              : isProgressComplete
                                ? 'Complete — awaiting confirmation...'
                                : (progress?.message ?? 'Importing...')}
                    </p>

                    {!isTerminal && !isParse && pct !== undefined && (
                        <span className="font-sans text-[8pt] text-stone flex-shrink-0 tabular-nums">
                            {pct}%
                        </span>
                    )}

                    {/* Expand button */}
                    <button
                        type="button"
                        className="flex-shrink-0 p-1 text-stone hover:text-ink transition-colors"
                        onClick={onExpand}
                        aria-label="Expand details"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        >
                            <polyline points="15,3 21,3 21,9" />
                            <polyline points="9,21 3,21 3,15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    </button>

                    {/* Close button (only when done/failed) */}
                    {isTerminal && (
                        <button
                            type="button"
                            className="flex-shrink-0 p-1 text-stone hover:text-ink transition-colors"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Progress bar (only while uploading): indeterminate shimmer for parse, determinate for write */}
                {!isTerminal && isParse && (
                    <div className="w-full h-1 bg-cream/60 rounded-full overflow-hidden">
                        <div className="h-full w-2/5 bg-ink/40 rounded-full animate-[shimmer_1.8s_ease-in-out_infinite]" />
                    </div>
                )}
                {!isTerminal && !isParse && (
                    <div className="w-full h-1 bg-cream/60 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-ink rounded-full transition-[width] duration-300 ease-out"
                            style={{
                                width: pct !== undefined ? `${pct}%` : '0%',
                            }}
                        />
                    </div>
                )}
            </div>
        </>
    )
}

function ReadyView({
    isDragging,
    excludedCount,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    onBrowse,
    onCancel,
}: {
    isDragging: boolean
    excludedCount: number
    onDragEnter: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onBrowse: () => void
    onCancel: () => void
}) {
    return (
        <>
            <h2 className="font-serif text-[14pt] font-medium text-near-black mb-4">
                Import Documents
            </h2>
            {/* biome-ignore lint/a11y/useSemanticElements: drop zone with complex drag handlers */}
            <div
                className={`border-2 border-dashed rounded-[8pt] p-8 text-center cursor-pointer transition-colors ${
                    isDragging
                        ? 'border-ink-light bg-tint'
                        : 'border-cream hover:border-ink-light/50 hover:bg-ivory'
                }`}
                role="button"
                tabIndex={0}
                aria-label="Drop markdown files here or click to browse"
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={onBrowse}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onBrowse()
                }}
            >
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    className="mx-auto mb-3 text-stone"
                >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="font-sans text-[9pt] text-olive leading-relaxed">
                    {isDragging
                        ? 'Release to import files'
                        : 'Drop markdown files here or click to browse'}
                </p>
                <p className="font-sans text-[7.5pt] text-stone mt-2">
                    .md / .mdx / .markdown
                </p>
            </div>
            {excludedCount > 0 && (
                <p className="font-sans text-[8pt] text-stone mt-3">
                    {excludedCount} non-markdown file
                    {excludedCount !== 1 ? 's' : ''} excluded
                </p>
            )}
            <div className="flex items-center justify-between mt-5">
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={onBrowse}
                >
                    Browse files
                </button>
                <button type="button" className="btn-ghost" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </>
    )
}

function UploadingView({
    progress,
    onMinimize,
    onAbort,
}: {
    progress: {
        phase: 'parse' | 'write'
        message: string
        completed?: number
        total?: number
    }
    onMinimize: () => void
    onAbort: () => void
}) {
    const isParse = progress.phase === 'parse'
    const isDone =
        !isParse &&
        progress.total &&
        progress.total > 0 &&
        progress.completed !== undefined &&
        progress.completed >= progress.total
    const pct =
        !isParse &&
        progress.total &&
        progress.total > 0 &&
        progress.completed !== undefined
            ? Math.round((progress.completed / progress.total) * 100)
            : undefined

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-[14pt] font-medium text-near-black">
                    Importing...
                </h2>
                <div className="flex items-center gap-2">
                    {isDone && (
                        <button
                            type="button"
                            className="btn-ghost text-[8.5pt]"
                            onClick={onAbort}
                            aria-label="Close import"
                        >
                            Close
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn-ghost text-[8.5pt]"
                        onClick={onMinimize}
                        aria-label="Minimize to background"
                    >
                        Minimize
                    </button>
                </div>
            </div>
            <p className="font-sans text-[9pt] text-olive mb-4">
                {isDone
                    ? 'Import complete — waiting for server confirmation...'
                    : progress.message}
            </p>

            {/* Progress bar: indeterminate shimmer for parse, determinate for write */}
            {isParse ? (
                <div className="w-full h-1.5 bg-cream/60 rounded-full overflow-hidden mb-3">
                    <div className="h-full w-2/5 bg-ink/40 rounded-full animate-[shimmer_1.8s_ease-in-out_infinite]" />
                </div>
            ) : (
                <>
                    <div className="w-full h-1.5 bg-cream/60 rounded-full overflow-hidden mb-3">
                        <div
                            className="h-full bg-ink rounded-full transition-[width] duration-300 ease-out"
                            style={{
                                width: pct !== undefined ? `${pct}%` : '0%',
                            }}
                        />
                    </div>
                    {pct !== undefined && (
                        <p className="font-sans text-[8pt] text-stone text-right">
                            {pct}%
                            {progress.completed !== undefined &&
                                progress.total !== undefined && (
                                    <span className="ml-2">
                                        ({progress.completed}/{progress.total})
                                    </span>
                                )}
                        </p>
                    )}
                </>
            )}

            <div className="flex items-center gap-2 mt-4">
                <span
                    className={`w-2 h-2 rounded-full ${isParse ? 'bg-ink animate-pulse' : isDone ? 'bg-ink' : 'bg-cream'}`}
                />
                <span className="font-sans text-[8pt] text-stone">
                    {isParse
                        ? 'Parsing & summarizing'
                        : isDone
                          ? 'Awaiting confirmation...'
                          : 'Writing to database'}
                </span>
            </div>
        </>
    )
}

function DoneView({
    result,
    onClose,
}: {
    result: ImportResultEvent
    onClose: () => void
}) {
    const importedDocs = result.details.filter((d) => d.status === 'imported')
    const skippedDocs = result.details.filter((d) => d.status === 'skipped')
    const failedDocs = result.details.filter((d) => d.status === 'failed')

    return (
        <>
            <h2 className="font-serif text-[14pt] font-medium text-near-black mb-4">
                Import Complete
            </h2>
            <div className="space-y-3 mb-5 max-h-[320px] overflow-y-auto">
                {result.imported > 0 && (
                    <Section
                        label={`${result.imported} imported`}
                        status="imported"
                    >
                        {importedDocs.map((d) => (
                            <li
                                key={d.docId ?? d.docName}
                                className="font-sans text-[8pt] text-olive"
                            >
                                {d.docName}
                            </li>
                        ))}
                    </Section>
                )}
                {result.skipped > 0 && (
                    <Section
                        label={`${result.skipped} skipped`}
                        status="skipped"
                    >
                        {skippedDocs.map((d) => (
                            <li
                                key={d.docId ?? d.docName}
                                className="font-sans text-[8pt] text-stone"
                            >
                                {d.docName}
                            </li>
                        ))}
                    </Section>
                )}
                {result.failed > 0 && (
                    <Section label={`${result.failed} failed`} status="failed">
                        {failedDocs.map((d) => (
                            <li
                                key={d.docId ?? d.filePath ?? d.docName}
                                className="font-sans text-[8pt] text-error"
                            >
                                {d.filePath
                                    ? d.filePath.split('/').pop()
                                    : d.docName}
                                {d.error && (
                                    <span className="ml-2 text-stone">
                                        — {d.error}
                                    </span>
                                )}
                            </li>
                        ))}
                    </Section>
                )}
            </div>
            <button
                type="button"
                className="btn-primary w-full"
                onClick={onClose}
            >
                Done
            </button>
        </>
    )
}

function Section({
    label,
    status,
    children,
}: {
    label: string
    status: 'imported' | 'skipped' | 'failed'
    children: ReactNode
}) {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">
                {StatusIcon({ status })}
            </span>
            <div className="flex-1 min-w-0">
                <p className="font-sans text-[9pt] font-medium text-near-black mb-1">
                    {label}
                </p>
                <ul className="dash-list space-y-0.5">{children}</ul>
            </div>
        </div>
    )
}

/** Status icon matching Kami design language */
function StatusIcon({ status }: { status: 'imported' | 'skipped' | 'failed' }) {
    const base = 'inline-block w-4 h-4'
    switch (status) {
        case 'imported':
            return (
                <svg
                    className={`${base} text-ink`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                >
                    <circle cx="8" cy="8" r="6.5" />
                    <path
                        d="M5 8l2 2 4-4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )
        case 'skipped':
            return (
                <svg
                    className={`${base} text-stone`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                >
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M5.5 8h5" strokeLinecap="round" />
                </svg>
            )
        case 'failed':
            return (
                <svg
                    className={`${base} text-error`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                >
                    <circle cx="8" cy="8" r="6.5" />
                    <path
                        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )
    }
}

function ErrorView({ error, onClose }: { error: string; onClose: () => void }) {
    return (
        <>
            <h2 className="font-serif text-[14pt] font-medium text-near-black mb-3">
                Import Failed
            </h2>
            <p className="font-sans text-[9pt] text-error bg-tint/50 rounded-[6pt] p-3 mb-5 leading-relaxed">
                {error}
            </p>
            <div className="flex items-center gap-3">
                <button type="button" className="btn-primary" onClick={onClose}>
                    Close
                </button>
            </div>
        </>
    )
}
