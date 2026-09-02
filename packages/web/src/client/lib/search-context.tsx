import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import type { SearchResult, SessionInfo } from './api.ts'
import {
    fetchLatestSession,
    fetchSession,
    fetchSessions,
    searchQuery,
} from './api.ts'
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

export interface TurnRecord {
    query: string
    result: SearchResult
    timeline: TimelineBlock[]
}

export interface SearchState {
    query: string
    mode: 'default' | 'quick'
    searching: boolean
    result: SearchResult | null
    error: string | null
    elapsed: number
    /** Chronological timeline of streaming events (thinking, tools, text). */
    timeline: TimelineBlock[]
    /** Session ID for multi-turn conversation. */
    sessionId: string | null
    /** Previous turns in this session. */
    previousTurns: TurnRecord[]
    /** Available sessions for switching. */
    sessionList: SessionInfo[]
}

interface SearchContextType extends SearchState {
    runSearch: (q: string, mode?: 'default' | 'quick') => void
    setMode: (mode: 'default' | 'quick') => void
    clearSearch: () => void
    newSession: () => void
    switchSession: (id: string) => Promise<void>
}

const initialState: SearchState = {
    query: '',
    mode: 'quick',
    searching: false,
    result: null,
    error: null,
    elapsed: 0,
    timeline: [],
    sessionId: null,
    previousTurns: [],
    sessionList: [],
}

const SearchContext = createContext<SearchContextType>({
    ...initialState,
    runSearch: () => {
        /* noop */
    },
    setMode: () => {
        /* noop */
    },
    clearSearch: () => {
        /* noop */
    },
    newSession: () => {
        /* noop */
    },
    switchSession: async () => {
        /* noop */
    },
})

// ── Session loading from API ───────────────────────────────

/** Parse raw AgentMessage[] from session snapshot into TurnRecord[] for UI. */
// biome-ignore lint/suspicious/noExplicitAny: raw JSON from API
function rebuildTurnsFromMessages(messages: any[]): TurnRecord[] {
    const turns: TurnRecord[] = []

    // Extract text from user message content (string or content array)
    // biome-ignore lint/suspicious/noExplicitAny: raw JSON from API, inner helpers
    const userText = (msg: any): string => {
        if (typeof msg.content === 'string') return msg.content
        const blocks = msg.content as
            | Array<{ type: string; text?: string }>
            | undefined
        return (
            blocks
                ?.filter((c) => c.type === 'text')
                .map((c) => c.text ?? '')
                .join(' ') ?? ''
        )
    }

    // Collect assistant text blocks from a range of messages
    const collectAssistantText = (
        msgs: Array<Record<string, unknown>>,
        from: number,
        to: number
    ): string => {
        const parts: string[] = []
        for (let i = from; i <= to; i++) {
            const msg = msgs[i]
            if (msg?.role !== 'assistant') continue
            const content = msg.content as
                | Array<{ type: string; text?: string }>
                | undefined
            if (!content) continue
            for (const block of content) {
                if (block.type === 'text') parts.push(block.text ?? '')
            }
        }
        return parts.join('\n')
    }

    // Collect timeline blocks from a range of messages
    const collectTimeline = (
        msgs: Array<Record<string, unknown>>,
        from: number,
        to: number
    ): TimelineBlock[] => {
        // First pass: collect tool results by toolCallId
        // Mirrors extractResultText() in core/ai/sub-agents/utils.ts
        const toolResults = new Map<string, string>()
        for (let i = from; i <= to; i++) {
            const msg = msgs[i]
            if (msg?.role !== 'toolResult') continue
            const content = msg.content as
                | Array<{ type: string; text?: string }>
                | undefined
            const text =
                content
                    ?.filter((c) => c.type === 'text')
                    .map((c) => c.text ?? '')
                    .join('') ?? ''
            toolResults.set((msg.toolCallId as string) ?? '', text)
        }

        const tl: TimelineBlock[] = []
        for (let i = from; i <= to; i++) {
            const msg = msgs[i]
            if (msg?.role !== 'assistant') continue
            const content = msg.content as
                | Array<{
                      type: string
                      text?: string
                      thinking?: string
                      name?: string
                      id?: string
                      arguments?: Record<string, unknown>
                  }>
                | undefined
            if (!content) continue
            for (const block of content) {
                if (block.type === 'thinking') {
                    tl.push({
                        type: 'thinking',
                        id: randomUUID(),
                        text: block.thinking ?? '',
                    })
                } else if (block.type === 'toolCall') {
                    const resultText = toolResults.get(block.id ?? '') ?? ''
                    // Mirrors formatSize() in core/ai/sub-agents/utils.ts
                    const summary =
                        resultText.length > 0
                            ? resultText.length >= 1000
                                ? `${(resultText.length / 1000).toFixed(1)}k chars`
                                : `${resultText.length} chars`
                            : undefined
                    tl.push({
                        type: 'tool',
                        id: block.id ?? randomUUID(),
                        name: block.name ?? '?',
                        label: _formatToolLabel(
                            block.name ?? '?',
                            block.arguments
                        ),
                        status: 'done',
                        summary,
                    })
                }
            }
        }
        return tl
    }

    /** Generate a human-readable tool label from name + arguments.
     *  Mirrors the backend toolMeta stepLabel() logic for each tool. */
    function _formatToolLabel(
        name: string,
        args?: Record<string, unknown>
    ): string {
        if (!args) return name
        if (name === 'searchDocs') {
            const q = String(args.query ?? '')
            return `Searching: "${q.slice(0, 36)}${q.length > 36 ? '...' : ''}"...`
        }
        if (name === 'getNodeSummary') {
            return 'Checking node relevance...'
        }
        if (name === 'getDocNodeDetails') {
            return `Reading node ${args.nodeId ?? '?'}...`
        }
        if (name === 'getReviewSource') {
            const nid = String(args.nodeId ?? '').replace(/^0+/, '') || '?'
            return `Verifying: ${args.docId ?? '?'}:${nid}...`
        }
        if (name === 'reviewResult') {
            return 'Reviewing results...'
        }
        return name
    }

    // Collect doc ID map from tool call arguments (for hover tooltips)
    const collectDocNames = (
        msgs: Array<Record<string, unknown>>,
        from: number,
        to: number
    ): Record<string, string> => {
        const docNames: Record<string, string> = {}
        for (let i = from; i <= to; i++) {
            const msg = msgs[i]
            if (msg?.role !== 'assistant') continue
            const content = msg.content as
                | Array<{ type: string; arguments?: Record<string, unknown> }>
                | undefined
            if (!content) continue
            for (const block of content) {
                if (block.type !== 'toolCall') continue
                const docId = block.arguments?.docId as string | undefined
                if (docId && docId.length > 8)
                    docNames[docId] = docId.slice(0, 8)
            }
        }
        return docNames
    }

    // Find all user message indices
    const userIndices: number[] = []
    for (let i = 0; i < messages.length; i++) {
        if (messages[i]?.role === 'user') userIndices.push(i)
    }

    // Build turns: each user message starts a turn, spans to the next user (or end)
    for (let t = 0; t < userIndices.length; t++) {
        const start = userIndices[t]!
        const end =
            t + 1 < userIndices.length
                ? userIndices[t + 1]! - 1
                : messages.length - 1
        const startTs = (messages[start]?.timestamp as number | undefined) ?? 0
        // Use the last assistant or toolResult message's timestamp for accurate turn duration
        let endTs = startTs
        for (let i = end; i >= start; i--) {
            const role = messages[i]?.role as string | undefined
            if (role === 'assistant' || role === 'toolResult') {
                endTs =
                    (messages[i]?.timestamp as number | undefined) ?? startTs
                break
            }
        }

        turns.push({
            query: userText(messages[start]),
            result: {
                content: collectAssistantText(messages, start, end),
                elapsedMs: startTs > 0 ? endTs - startTs : 0,
                docNames: collectDocNames(messages, start, end),
                sessionId: undefined,
            },
            timeline: collectTimeline(messages, start, end),
        })
    }

    return turns
}

// ── Provider ────────────────────────────────────────────────

export function SearchProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SearchState>(initialState)
    const abortRef = useRef<AbortController | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const sessionIdRef = useRef<string | null>(null)

    // Keep ref in sync with state
    sessionIdRef.current = state.sessionId

    const clearSearch = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
        setState((prev) => ({
            ...initialState,
            mode: prev.mode,
        }))
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

    // Load latest session + session list on mount / project switch
    useEffect(() => {
        if (!project) return
        let cancelled = false

        // Load session list
        fetchSessions()
            .then((sessions) => {
                if (!cancelled)
                    setState((prev) => ({ ...prev, sessionList: sessions }))
            })
            .catch(() => {
                /* ignore */
            })

        // Load latest session content
        fetchLatestSession()
            .then((session) => {
                if (cancelled) return
                if (!session) {
                    setState((prev) => ({
                        ...prev,
                        sessionId: null,
                        previousTurns: [],
                    }))
                    return
                }
                const messages = session.messages as
                    | Array<Record<string, unknown>>
                    | undefined
                const turns =
                    messages && messages.length > 0
                        ? rebuildTurnsFromMessages(messages)
                        : []
                setState((prev) => ({
                    ...prev,
                    sessionId: (session.sessionId as string) ?? null,
                    previousTurns: turns,
                }))
            })
            .catch(() => {
                /* best-effort */
            })
        return () => {
            cancelled = true
        }
    }, [project])

    const runSearch = useCallback(
        async (q: string, mode?: 'default' | 'quick') => {
            if (abortRef.current) {
                abortRef.current.abort()
            }
            abortRef.current = new AbortController()
            const signal = abortRef.current.signal

            if (timerRef.current) clearInterval(timerRef.current)

            // Save current result to previousTurns before starting new search
            setState((prev) => {
                // If there's a current result, push it to previousTurns
                const newPrevious = prev.result
                    ? [
                          ...prev.previousTurns,
                          {
                              query: prev.query,
                              result: prev.result,
                              timeline: prev.timeline,
                          },
                      ]
                    : prev.previousTurns

                return {
                    ...prev,
                    query: q,
                    mode: mode ?? prev.mode,
                    searching: true,
                    result: null,
                    error: null,
                    elapsed: 0,
                    timeline: [],
                    previousTurns: newPrevious,
                }
            })

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
                // Use ref for reliable sessionId read (setState trick is unreliable in callbacks)
                const currentSessionId = sessionIdRef.current

                const res = await searchQuery(
                    q,
                    {
                        mode,
                        sessionId: currentSessionId ?? undefined,
                        newSession: !currentSessionId,
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
                    sessionId: res.sessionId ?? prev.sessionId,
                }))
                // Refresh session list (new session may have been created)
                fetchSessions()
                    .then((sessions) => {
                        setState((prev) => ({ ...prev, sessionList: sessions }))
                    })
                    .catch(() => {
                        /* ignore */
                    })
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

    const newSession = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        setState((prev) => ({
            ...initialState,
            mode: prev.mode,
            sessionList: prev.sessionList,
        }))
        // Refresh session list asynchronously
        fetchSessions()
            .then((sessions) => {
                setState((prev) => ({ ...prev, sessionList: sessions }))
            })
            .catch(() => {
                /* ignore */
            })
    }, [])

    const switchSession = useCallback(async (id: string) => {
        if (abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        try {
            const session = await fetchSession(id)
            if (!session) return
            const messages = session.messages as
                | Array<Record<string, unknown>>
                | undefined
            const turns = messages ? rebuildTurnsFromMessages(messages) : []
            setState((prev) => ({
                ...initialState,
                mode: prev.mode,
                sessionId: id,
                previousTurns: turns,
                sessionList: prev.sessionList,
            }))
        } catch {
            // session not found, ignore
        }
    }, [])

    return (
        <SearchContext.Provider
            value={{
                ...state,
                runSearch,
                setMode,
                clearSearch,
                newSession,
                switchSession,
            }}
        >
            {children}
        </SearchContext.Provider>
    )
}

export function useSearch() {
    return useContext(SearchContext)
}
