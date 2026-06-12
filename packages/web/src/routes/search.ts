import { Hono } from 'hono'
import {
    searchDocuments,
    saveSearchHistory,
    resolveProjectRoot,
    loadProjectConfig,
} from '@vein/core'

const searchRouter = new Hono()

// ── POST /api/projects/current/search ───────────────────────────
// Runs the librarian agent and returns the result as JSON.
// Uses POST to support longer queries.
searchRouter.post('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const config = await loadProjectConfig(root)
    if (!config) return c.json({ error: 'No config found' }, 404)

    const body = await c.req.json()
    const query = body.q as string
    if (!query) return c.json({ error: 'Missing query' }, 400)

    const showTrace = body.trace === true

    const startedAt = performance.now()

    try {
        const result = await searchDocuments(query, {
            segmenter: config.segmenter,
        })

        const elapsedMs = Math.round(performance.now() - startedAt)

        // Save to history (best-effort)
        if (root) {
            saveSearchHistory(root, query, result, elapsedMs).catch(() => {})
        }

        return c.json({
            content: result.content,
            review: result.review,
            reviewElapsedMs: result.reviewElapsedMs,
            elapsedMs,
            trace: showTrace ? result.trace : undefined,
            docNames: result.docNames
                ? Object.fromEntries(result.docNames)
                : undefined,
        })
    } catch (err) {
        return c.json(
            {
                error:
                    err instanceof Error ? err.message : 'Search failed',
            },
            500
        )
    }
})

export { searchRouter }
