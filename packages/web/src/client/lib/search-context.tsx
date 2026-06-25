import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import type { SearchResult } from './api.ts'
import { searchQuery } from './api.ts'
import { useProject } from './project.tsx'

// ── Timeline types ──────────────────────────────────────────

export type TimelineBlock =
    | { type: 'thinking'; id: string; text: string }
    | {
          type: 'tool'
          id: string
          name: string
          label: string
          status: 'running' | 'done'
          summary?: string
      }
    | { type: 'text'; id: string; text: string }

// ── Helpers ──────────────────────────────────────────

/** Generate a UUID v4 that works in both secure and insecure contexts. */
function randomUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    // Fallback for insecure contexts (e.g. LAN HTTP access on mobile)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

// ── State ───────────────────────────────────────────────────

export interface SearchState {
    query: string
    mode: 'default' | 'quick'
    searching: boolean
    result: SearchResult | null
    error: string | null
    elapsed: number
    /** Chronological timeline of streaming events (thinking, tools, text). */
    timeline: TimelineBlock[]
}

interface SearchContextType extends SearchState {
    runSearch: (q: string, mode?: 'default' | 'quick') => void
    setMode: (mode: 'default' | 'quick') => void
    /** Clear current search state */
    clearSearch: () => void
}

const initialState: SearchState = {
    query: '',
    mode: 'quick',
    searching: false,
    result: null,
    error: null,
    elapsed: 0,
    timeline: [],
}

const SearchContext = createContext<SearchContextType>({
    ...initialState,
    runSearch: () => {
        /* no-op */
    },
    setMode: () => {
        /* no-op */
    },
    clearSearch: () => {
        /* no-op */
    },
})

// ── Provider ────────────────────────────────────────────────

export function SearchProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SearchState>(initialState)
    const abortRef = useRef<AbortController | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const clearSearch = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
        setState(initialState)
    }, [])

    // Clear search state when project changes
    const { project } = useProject()
    const prevProjectRef = useRef<string | null>(project)
    useEffect(() => {
        if (prevProjectRef.current !== project) {
            prevProjectRef.current = project
            clearSearch()
        }
    }, [project, clearSearch])

    const runSearch = useCallback(
        async (q: string, mode?: 'default' | 'quick') => {
            if (abortRef.current) {
                abortRef.current.abort()
            }
            abortRef.current = new AbortController()
            const signal = abortRef.current.signal

            if (timerRef.current) clearInterval(timerRef.current)

            setState((prev) => ({
                ...prev,
                query: q,
                mode: mode ?? prev.mode,
                searching: true,
                result: null,
                error: null,
                elapsed: 0,
                timeline: [],
            }))

            const startTime = Date.now()
            timerRef.current = setInterval(() => {
                setState((prev) => {
                    if (!prev.searching) return prev
                    return {
                        ...prev,
                        elapsed:
                            Math.round((Date.now() - startTime) / 100) / 10,
                    }
                })
            }, 100)

            try {
                const res = await searchQuery(
                    q,
                    {
                        mode,
                        onThinkingDelta: (delta) => {
                            setState((prev) => {
                                if (!prev.searching) return prev
                                const timeline = [...prev.timeline]
                                const last = timeline.at(-1)
                                if (last && last.type === 'thinking') {
                                    timeline[timeline.length - 1] = {
                                        ...last,
                                        text: last.text + delta,
                                    }
                                } else {
                                    timeline.push({
                                        type: 'thinking',
                                        id: randomUUID(),
                                        text: delta,
                                    })
                                }
                                return { ...prev, timeline }
                            })
                        },
                        onTextDelta: (delta) => {
                            setState((prev) => {
                                if (!prev.searching) return prev
                                const timeline = [...prev.timeline]
                                const last = timeline.at(-1)
                                if (last && last.type === 'text') {
                                    timeline[timeline.length - 1] = {
                                        ...last,
                                        text: last.text + delta,
                                    }
                                } else {
                                    timeline.push({
                                        type: 'text',
                                        id: randomUUID(),
                                        text: delta,
                                    })
                                }
                                return { ...prev, timeline }
                            })
                        },
                        onToolCallStart: (toolCallId, toolName, label) => {
                            setState((prev) => {
                                if (!prev.searching) return prev
                                return {
                                    ...prev,
                                    timeline: [
                                        ...prev.timeline,
                                        {
                                            type: 'tool' as const,
                                            id: toolCallId,
                                            name: toolName,
                                            label,
                                            status: 'running' as const,
                                        },
                                    ],
                                }
                            })
                        },
                        onToolCallEnd: (toolCallId, _toolName, summary) => {
                            setState((prev) => {
                                if (!prev.searching) return prev
                                return {
                                    ...prev,
                                    timeline: prev.timeline.map((block) =>
                                        block.type === 'tool' &&
                                        block.id === toolCallId
                                            ? {
                                                  ...block,
                                                  status: 'done' as const,
                                                  summary,
                                              }
                                            : block
                                    ),
                                }
                            })
                        },
                    },
                    signal
                )
                setState((prev) => ({
                    ...prev,
                    searching: false,
                    result: res,
                }))
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    return
                }
                setState((prev) => ({
                    ...prev,
                    searching: false,
                    error: err instanceof Error ? err.message : 'Search failed',
                }))
            } finally {
                if (timerRef.current) {
                    clearInterval(timerRef.current)
                    timerRef.current = null
                }
                abortRef.current = null
            }
        },
        []
    )

    const setMode = useCallback((mode: 'default' | 'quick') => {
        setState((prev) => ({ ...prev, mode }))
    }, [])

    return (
        <SearchContext.Provider
            value={{ ...state, runSearch, setMode, clearSearch }}
        >
            {children}
        </SearchContext.Provider>
    )
}

export function useSearch() {
    return useContext(SearchContext)
}
