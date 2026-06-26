import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LibrarianResult } from '../ai/librarian.ts'
import { logger, veinDir } from '../config/index.ts'

const log = logger.child({ module: 'history' })

export type HistoryTimelineBlock =
    | { type: 'thinking'; text: string }
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string; label: string; summary?: string }

export type HistoryEntry = {
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

function historyDir(root: string): string {
    return path.join(root, veinDir, 'ask-history')
}

/**
 * Save a search query and its result to the project history.
 * Returns the generated entry ID.
 */
export async function saveSearchHistory(
    root: string,
    query: string,
    result: LibrarianResult,
    elapsedMs: number,
    mode?: string,
    timeline?: HistoryTimelineBlock[]
): Promise<string> {
    const now = new Date()
    const id = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const dir = historyDir(root)
    await mkdir(dir, { recursive: true })

    const entry: HistoryEntry = {
        id,
        query,
        answer: result.content || '',
        mode: mode ?? 'default',
        verdict: result.review?.verdict,
        score: result.review?.score,
        elapsedMs,
        steps: result.trace.length,
        trace: result.trace,
        timeline,
    }

    await writeFile(
        path.join(dir, `${id}.json`),
        JSON.stringify(entry, null, 2)
    )
    log.debug({ id, query, content: 'Search history saved' })
    return id
}

/**
 * List all history entries, sorted newest first.
 */
export async function listSearchHistory(root: string): Promise<HistoryEntry[]> {
    const dir = historyDir(root)
    let files: string[]
    try {
        files = (await readdir(dir))
            .filter((f) => f.endsWith('.json'))
            .sort()
            .reverse()
    } catch {
        return []
    }

    const entries: HistoryEntry[] = []
    for (const f of files) {
        try {
            const raw = await readFile(path.join(dir, f), 'utf-8')
            entries.push(JSON.parse(raw) as HistoryEntry)
        } catch (err) {
            log.warn({ file: f, err, content: 'Failed to read history entry' })
        }
    }
    return entries
}

/**
 * Get a single history entry by ID.
 */
export async function getSearchHistoryEntry(
    root: string,
    id: string
): Promise<HistoryEntry | undefined> {
    const filePath = path.join(historyDir(root), `${id}.json`)
    try {
        const raw = await readFile(filePath, 'utf-8')
        return JSON.parse(raw) as HistoryEntry
    } catch {
        return undefined
    }
}
