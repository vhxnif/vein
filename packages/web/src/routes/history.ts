import {
    getSearchHistoryEntry,
    listSearchHistory,
    resolveProjectRoot,
} from '@vein/core'
import { Hono } from 'hono'

const historyRouter = new Hono()

// ── GET /api/projects/current/history ────────────────────────────
historyRouter.get('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const page = Number(c.req.query('page')) || 1
    const pageSize = Number(c.req.query('pageSize')) || 20

    const entries = await listSearchHistory(root)
    const total = entries.length

    const start = (page - 1) * pageSize
    const paged = entries.slice(start, start + pageSize)

    return c.json({
        entries: paged,
        total,
        page,
        pageSize,
    })
})

// ── GET /api/projects/current/history/:id ────────────────────────
historyRouter.get('/:id', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const id = c.req.param('id')
    const entry = await getSearchHistoryEntry(root, id)
    if (!entry) return c.json({ error: 'History entry not found' }, 404)

    return c.json(entry)
})

export { historyRouter }
