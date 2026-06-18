import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useRef,
    useState,
} from 'react'
import type { SearchResult } from './api'
import { searchQuery } from './api'

interface ToolCallState {
    id: string
    name: string
    label: string
    status: 'running' | 'done'
    summary?: string
}

export interface SearchState {
    query: string
    searching: boolean
    result: SearchResult | null
    error: string | null
    elapsed: number
    /** Accumulated streaming text from the main agent. */
    streamingText: string
    /** Accumulated thinking deltas from the main agent. */
    thinkingText: string
    /** Active and completed tool calls. */
    toolCalls: ToolCallState[]
}

interface SearchContextType extends SearchState {
    runSearch: (q: string) => void
    /** Clear current search state */
    clearSearch: () => void
}

const initialState: SearchState = {
    query: '',
    searching: false,
    result: null,
    error: null,
    elapsed: 0,
    streamingText: '',
    thinkingText: '',
    toolCalls: [],
}

const SearchContext = createContext<SearchContextType>({
    ...initialState,
    runSearch: () => {
        /* no-op */
    },
    clearSearch: () => {
        /* no-op */
    },
})

export function SearchProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SearchState>(initialState)
    const abortRef = useRef<AbortController | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const clearSearch = useCallback(() => {
        // Abort inflight request
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

    const runSearch = useCallback(async (q: string) => {
        // Abort previous inflight request
        if (abortRef.current) {
            abortRef.current.abort()
        }
        abortRef.current = new AbortController()
        const signal = abortRef.current.signal

        if (timerRef.current) clearInterval(timerRef.current)

        setState((prev) => ({
            ...prev,
            query: q,
            searching: true,
            result: null,
            error: null,
            elapsed: 0,
            streamingText: '',
            thinkingText: '',
            toolCalls: [],
        }))

        const startTime = Date.now()
        timerRef.current = setInterval(() => {
            setState((prev) => {
                if (!prev.searching) return prev
                return {
                    ...prev,
                    elapsed: Math.round((Date.now() - startTime) / 100) / 10,
                }
            })
        }, 100)

        try {
            const res = await searchQuery(
                q,
                {
                    onThinkingDelta: (delta) => {
                        setState((prev) => {
                            if (!prev.searching) return prev
                            return {
                                ...prev,
                                thinkingText: prev.thinkingText + delta,
                            }
                        })
                    },
                    onTextDelta: (delta) => {
                        setState((prev) => {
                            if (!prev.searching) return prev
                            return {
                                ...prev,
                                streamingText: prev.streamingText + delta,
                            }
                        })
                    },
                    onToolCallStart: (toolCallId, toolName, label) => {
                        setState((prev) => {
                            if (!prev.searching) return prev
                            return {
                                ...prev,
                                toolCalls: [
                                    ...prev.toolCalls,
                                    {
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
                                toolCalls: prev.toolCalls.map((tc) =>
                                    tc.id === toolCallId
                                        ? {
                                              ...tc,
                                              status: 'done' as const,
                                              summary,
                                          }
                                        : tc
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
            // Ignore aborted requests
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
    }, [])

    return (
        <SearchContext.Provider value={{ ...state, runSearch, clearSearch }}>
            {children}
        </SearchContext.Provider>
    )
}

export function useSearch() {
    return useContext(SearchContext)
}
