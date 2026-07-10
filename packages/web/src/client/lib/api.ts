// Typed API client for Vein backend.
// Uses native fetch; TanStack Query wraps these in useQuery/useMutation.
// All project-scoped requests auto-inject X-Vein-Project from localStorage
// as both an HTTP header AND a query parameter (for visibility in DevTools).

const BASE = '/api'

// ── Helpers ────────────────────────────────────────────────────

function projectParam(): string {
    if (typeof window !== 'undefined') {
        const p = localStorage.getItem('vein-project')
        if (p) return `project=${encodeURIComponent(p)}`
    }
    return ''
}

function h(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    if (typeof window !== 'undefined') {
        const p = localStorage.getItem('vein-project')
        if (p) headers['X-Vein-Project'] = p
    }
    return headers
}

/** Append project query param to a URL path. */
function u(path: string): string {
    const p = projectParam()
    if (!p) return `${BASE}${path}`
    const sep = path.includes('?') ? '&' : '?'
    return `${BASE}${path}${sep}${p}`
}

// ── Types ──────────────────────────────────────────────────────

export interface Project {
    name: string
    path: string
}

export interface ModelInfo {
    id: string
    name: string
}

export interface DocInfo {
    id: string
    title: string
    sourcePath: string
    nodeCount: number
    createdAt: string
    metadata: string
    tree?: unknown
    ftsSummary?: string
}

export interface HistoryTimelineBlock {
    type: 'thinking' | 'tool' | 'text'
    text?: string
    name?: string
    label?: string
    summary?: string
}

export interface HistoryEntry {
    id: string
    query: string
    answer: string
    mode: string
    verdict?: string
    score?: number
    elapsedMs: number
    steps: number
    trace?: unknown[]
    timeline?: HistoryTimelineBlock[]
}

export interface NodeInfo {
    nodeId: string
    docName: string
    title: string
    lineNum: number
    text: string
    summary?: string
    prefixSummary?: string
}

export interface SearchResult {
    content: string
    review?: { verdict: string; score: number; reason: string }
    reviewElapsedMs?: number
    elapsedMs: number
    trace?: unknown[]
    docNames?: Record<string, string>
    sessionId?: string
}

// ── Sessions ──────────────────────────────────────────────────

export interface SessionInfo {
    sessionId: string
    summary: string
    queryCount: number
    updatedAt: number
}

export async function fetchSessions(): Promise<SessionInfo[]> {
    const res = await fetch(u('/projects/current/sessions'), { headers: h() })
    if (!res.ok) throw new Error('Failed to fetch sessions')
    const data = (await res.json()) as { sessions: SessionInfo[] }
    return data.sessions
}

export async function fetchSession(
    id: string
): Promise<Record<string, unknown> | null> {
    const res = await fetch(u(`/projects/current/sessions/${id}`), {
        headers: h(),
    })
    if (!res.ok) throw new Error('Session not found')
    const data = (await res.json()) as { session?: Record<string, unknown> }
    return (data as unknown as Record<string, unknown>) ?? null
}

export async function fetchLatestSession(): Promise<Record<
    string,
    unknown
> | null> {
    const res = await fetch(u('/projects/current/sessions/latest'), {
        headers: h(),
    })
    if (!res.ok) throw new Error('Failed to fetch latest session')
    const data = (await res.json()) as {
        session: Record<string, unknown> | null
    }
    return data.session ?? null
}

// ── Projects ──────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
    const res = await fetch(`${BASE}/projects`)
    if (!res.ok) throw new Error('Failed to fetch projects')
    const data = await res.json()
    return data.projects
}

export async function createProject(input: {
    name: string
    provider: string
    model: string
    path?: string
}) {
    const res = await fetch(`${BASE}/projects`, {
        method: 'POST',
        headers: h({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create project')
    }
    return res.json()
}

// ── Thinking Levels ────────────────────────────────────────────

export async function fetchThinkingLevels(): Promise<string[]> {
    const res = await fetch('/api/thinking-levels')
    if (!res.ok) throw new Error('Failed to fetch thinking levels')
    return res.json()
}

// ── Config ─────────────────────────────────────────────────────

export async function fetchConfig() {
    const res = await fetch(u('/projects/current/config'), { headers: h() })
    if (!res.ok) throw new Error('Failed to fetch config')
    return res.json()
}

export async function saveConfig(updates: Record<string, unknown>) {
    const res = await fetch(u('/projects/current/config'), {
        method: 'PUT',
        headers: h({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Failed to save config')
    return res.json()
}

// ── Models ─────────────────────────────────────────────────────

export async function fetchProviders(): Promise<string[]> {
    const res = await fetch(`${BASE}/models/providers`)
    if (!res.ok) throw new Error('Failed to fetch providers')
    const data = await res.json()
    return data.providers
}

export async function fetchModels(provider: string): Promise<ModelInfo[]> {
    const res = await fetch(`${BASE}/models/${provider}`)
    if (!res.ok) throw new Error('Failed to fetch models')
    const data = await res.json()
    return data.models
}

// ── Documents ──────────────────────────────────────────────────

export async function fetchDocuments(
    page: number,
    pageSize: number,
    keyword?: string
): Promise<{ docs: DocInfo[]; total: number; keyword: string | null }> {
    let url = `/projects/current/documents?page=${page}&pageSize=${pageSize}`
    if (keyword) {
        url += `&keyword=${encodeURIComponent(keyword)}`
    }
    const res = await fetch(u(url), { headers: h() })
    if (!res.ok) throw new Error('Failed to fetch documents')
    return res.json()
}

export async function fetchDocument(id: string): Promise<DocInfo> {
    const res = await fetch(u(`/projects/current/documents/${id}`), {
        headers: h(),
    })
    if (!res.ok) throw new Error('Document not found')
    return res.json()
}

export async function deleteDocument(id: string) {
    const res = await fetch(u(`/projects/current/documents/${id}`), {
        method: 'DELETE',
        headers: h(),
    })
    if (!res.ok) throw new Error('Failed to delete document')
    return res.json()
}

export async function fetchNode(
    docId: string,
    nodeId: string
): Promise<NodeInfo> {
    const shortNodeId = nodeId.split('_')[0]
    const res = await fetch(
        u(`/projects/current/documents/${docId}/nodes/${shortNodeId}`),
        { headers: h() }
    )
    if (!res.ok) throw new Error('Node not found')
    return res.json()
}

// ── History ────────────────────────────────────────────────────

export async function fetchHistory(
    page: number,
    pageSize: number
): Promise<{ entries: HistoryEntry[]; total: number }> {
    const res = await fetch(
        u(`/projects/current/history?page=${page}&pageSize=${pageSize}`),
        { headers: h() }
    )
    if (!res.ok) throw new Error('Failed to fetch history')
    return res.json()
}

export async function fetchHistoryEntry(id: string): Promise<HistoryEntry> {
    const res = await fetch(u(`/projects/current/history/${id}`), {
        headers: h(),
    })
    if (!res.ok) throw new Error('History entry not found')
    return res.json()
}

// ── Import ─────────────────────────────────────────────────────

export type ImportProgress = {
    type: 'progress'
    phase: 'parse' | 'write'
    message: string
    completed?: number
    total?: number
}

export type ImportResultEvent = {
    type: 'result'
    imported: number
    skipped: number
    failed: number
    details: Array<{
        status: 'imported' | 'skipped' | 'failed'
        docName?: string
        docId?: string
        nodeCount?: number
        filePath?: string
        error?: string
    }>
}

export type ImportErrorEvent = {
    type: 'error'
    error: string
}

export type ImportDoneEvent = {
    type: 'done'
}

export type ImportSSEEvent =
    | ImportProgress
    | ImportResultEvent
    | ImportErrorEvent
    | ImportDoneEvent

/**
 * Import markdown files via SSE streaming upload.
 * Yields typed events as they arrive from the server.
 */
export async function* importDocuments(
    files: File[],
    signal?: AbortSignal
): AsyncGenerator<ImportSSEEvent> {
    const formData = new FormData()
    for (const file of files) {
        formData.append('files', file)
    }

    const res = await fetch(u('/projects/current/documents/import'), {
        method: 'POST',
        headers: h(),
        body: formData,
        signal,
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(err.error || 'Import failed')
    }

    if (!res.body) {
        throw new Error('No response body')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            // SSE events are separated by double newlines
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''

            for (const part of parts) {
                if (!part.trim()) continue
                const event = parseSSEEvent(part)
                if (event) yield event
            }
        }

        // Process any remaining data in the buffer
        if (buffer.trim()) {
            const event = parseSSEEvent(buffer)
            if (event) yield event
        }
    } finally {
        reader.releaseLock()
    }
}

/** Parse a single SSE event block (event: ...\ndata: ...) */
function parseSSEEvent(raw: string): ImportSSEEvent | null {
    const lines = raw.split('\n')
    let eventType = ''
    let data = ''

    for (const line of lines) {
        if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
            data = line.slice(5).trim()
        }
    }

    if (!eventType || !data) return null

    const parsed = JSON.parse(data) as Record<string, unknown>

    switch (eventType) {
        case 'progress':
            return {
                type: 'progress',
                phase: parsed.phase as 'parse' | 'write',
                message: parsed.message as string,
                completed: parsed.completed as number | undefined,
                total: parsed.total as number | undefined,
            }
        case 'result':
            return {
                type: 'result',
                imported: parsed.imported as number,
                skipped: parsed.skipped as number,
                failed: parsed.failed as number,
                details: parsed.details as ImportResultEvent['details'],
            }
        case 'error':
            return {
                type: 'error',
                error: (parsed.error as string) || 'Unknown error',
            }
        case 'done':
            return { type: 'done' }
        default:
            return null
    }
}

// ── Search ─────────────────────────────────────────────────────

export interface SearchStreamCallbacks {
    onThinkingDelta?: (delta: string) => void
    onTextDelta?: (delta: string) => void
    onToolCallStart?: (
        toolCallId: string,
        toolName: string,
        label: string
    ) => void
    onToolCallEnd?: (
        toolCallId: string,
        toolName: string,
        summary: string
    ) => void
}

export async function searchQuery(
    q: string,
    options?: SearchStreamCallbacks & {
        mode?: 'default' | 'quick'
        sessionId?: string
        newSession?: boolean
    },
    signal?: AbortSignal
): Promise<SearchResult> {
    const res = await fetch(u('/projects/current/search'), {
        method: 'POST',
        headers: h({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            q,
            mode: options?.mode ?? 'default',
            sessionId: options?.sessionId,
            newSession: options?.newSession,
        }),
        signal,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(err.error || 'Search failed')
    }
    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Abort reader on external signal (page navigation / unmount)
    const onAbort = () => reader.cancel()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.trim()) continue
                const data = JSON.parse(line) as Record<string, unknown>
                if (data.type === 'thinking_delta') {
                    options?.onThinkingDelta?.(String(data.delta))
                } else if (data.type === 'text_delta') {
                    options?.onTextDelta?.(String(data.delta))
                } else if (data.type === 'tool_call_start') {
                    options?.onToolCallStart?.(
                        String(data.toolCallId),
                        String(data.toolName),
                        String(data.label)
                    )
                } else if (data.type === 'tool_call_end') {
                    options?.onToolCallEnd?.(
                        String(data.toolCallId),
                        String(data.toolName),
                        String(data.summary)
                    )
                } else if (data.type === 'done') {
                    return data as unknown as SearchResult
                } else if (data.type === 'error') {
                    throw new Error(String(data.message))
                }
            }
        }

        if (buffer.trim()) {
            const data = JSON.parse(buffer) as Record<string, unknown>
            if (data.type === 'done') return data as unknown as SearchResult
            if (data.type === 'error') throw new Error(String(data.message))
        }

        throw new Error('Search stream ended without result')
    } finally {
        signal?.removeEventListener('abort', onAbort)
    }
}
