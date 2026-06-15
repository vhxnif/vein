// Typed API client for Vein backend.
// Uses native fetch; TanStack Query wraps these in useQuery/useMutation.
// All project-scoped requests auto-inject X-Vein-Project from localStorage.

const BASE = '/api'

// ── Helpers ────────────────────────────────────────────────────

function h(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    if (typeof window !== 'undefined') {
        const p = localStorage.getItem('vein-project')
        if (p) headers['X-Vein-Project'] = p
    }
    return headers
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

export interface HistoryEntry {
    id: string
    query: string
    answer: string
    verdict?: string
    score?: number
    elapsedMs: number
    steps: number
    trace?: unknown[]
}

export interface SearchResult {
    content: string
    review?: { verdict: string; score: number; reason: string }
    reviewElapsedMs?: number
    elapsedMs: number
    trace?: unknown[]
    docNames?: Record<string, string>
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

// ── Config ─────────────────────────────────────────────────────

export async function fetchConfig() {
    const res = await fetch(`${BASE}/projects/current/config`, { headers: h() })
    if (!res.ok) throw new Error('Failed to fetch config')
    return res.json()
}

export async function saveConfig(updates: Record<string, unknown>) {
    const res = await fetch(`${BASE}/projects/current/config`, {
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
    pageSize: number
): Promise<{ docs: DocInfo[]; total: number }> {
    const res = await fetch(
        `${BASE}/projects/current/documents?page=${page}&pageSize=${pageSize}`,
        { headers: h() }
    )
    if (!res.ok) throw new Error('Failed to fetch documents')
    return res.json()
}

export async function fetchDocument(id: string): Promise<DocInfo> {
    const res = await fetch(`${BASE}/projects/current/documents/${id}`, {
        headers: h(),
    })
    if (!res.ok) throw new Error('Document not found')
    return res.json()
}

export async function deleteDocument(id: string) {
    const res = await fetch(`${BASE}/projects/current/documents/${id}`, {
        method: 'DELETE',
        headers: h(),
    })
    if (!res.ok) throw new Error('Failed to delete document')
    return res.json()
}

// ── History ────────────────────────────────────────────────────

export async function fetchHistory(
    page: number,
    pageSize: number
): Promise<{ entries: HistoryEntry[]; total: number }> {
    const res = await fetch(
        `${BASE}/projects/current/history?page=${page}&pageSize=${pageSize}`,
        { headers: h() }
    )
    if (!res.ok) throw new Error('Failed to fetch history')
    return res.json()
}

export async function fetchHistoryEntry(id: string): Promise<HistoryEntry> {
    const res = await fetch(`${BASE}/projects/current/history/${id}`, {
        headers: h(),
    })
    if (!res.ok) throw new Error('History entry not found')
    return res.json()
}

// ── Search ─────────────────────────────────────────────────────

export async function searchQuery(
    q: string,
    onStep: (label: string) => void
): Promise<SearchResult> {
    const res = await fetch(`${BASE}/projects/current/search`, {
        method: 'POST',
        headers: h({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ q }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(err.error || 'Search failed')
    }
    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            if (!line.trim()) continue
            const data = JSON.parse(line) as Record<string, unknown>
            if (data.type === 'step') {
                onStep(String(data.label))
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
}
