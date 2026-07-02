// ponytail: session persistence — linear, no branches, single JSON file per session.

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SessionSnapshot } from '../ai/session.ts'
import { logger, veinDir } from '../config/index.ts'

const log = logger.child({ module: 'session' })

// ── Paths ─────────────────────────────────────────────────────

function sessionsDir(root: string): string {
    return path.join(root, veinDir, 'sessions')
}

// ── CRUD ──────────────────────────────────────────────────────

/** Save (overwrite) a session snapshot to disk. */
export async function saveSession(
    root: string,
    snapshot: SessionSnapshot
): Promise<void> {
    const dir = sessionsDir(root)
    await mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${snapshot.sessionId}.json`)
    await writeFile(filePath, JSON.stringify(snapshot, null, 2))
    log.debug({ sessionId: snapshot.sessionId, content: 'Session saved' })
}

/** Load a session snapshot from disk. Returns undefined if not found. */
export async function loadSession(
    root: string,
    sessionId: string
): Promise<SessionSnapshot | undefined> {
    const filePath = path.join(sessionsDir(root), `${sessionId}.json`)
    try {
        const raw = await readFile(filePath, 'utf-8')
        return JSON.parse(raw) as SessionSnapshot
    } catch {
        return undefined
    }
}

/** Load the most recent session. Returns undefined if no sessions exist. */
export async function loadLatestSession(
    root: string
): Promise<SessionSnapshot | undefined> {
    const ids = await listSessionIds(root)
    if (ids.length === 0) return undefined
    const latestId = ids[0]!
    return loadSession(root, latestId)
}

/** Delete a session file. Returns true if deleted, false if not found. */
export async function deleteSession(
    root: string,
    sessionId: string
): Promise<boolean> {
    const filePath = path.join(sessionsDir(root), `${sessionId}.json`)
    try {
        await unlink(filePath)
        log.debug({ sessionId, content: 'Session deleted' })
        return true
    } catch {
        return false
    }
}

/** List all session IDs, sorted newest first (by filename desc). */
export async function listSessionIds(root: string): Promise<string[]> {
    const dir = sessionsDir(root)
    try {
        const files = (await readdir(dir))
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace(/\.json$/, ''))
            .sort()
            .reverse()
        return files
    } catch {
        return []
    }
}
