import {
    loadProjectConfig,
    resolveProjectRoot,
    saveSearchHistory,
    searchDocuments,
} from '@vein/core'
import { Hono } from 'hono'

const searchRouter = new Hono()

// ── POST /api/projects/current/search ───────────────────────────
// Streams the librarian agent execution via ndjson.
// Each line is a JSON object:
//   { "type": "step", "label": "Searching..." }
//   { "type": "done", "content": "...", "review": {...}, ... }
//   { "type": "error", "message": "..." }
searchRouter.post('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const config = await loadProjectConfig(root)
    if (!config) return c.json({ error: 'No config found' }, 404)

    const body = await c.req.json()
    const query = body.q as string
    if (!query) return c.json({ error: 'Missing query' }, 400)

    const startedAt = performance.now()

    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) => {
                const line = `${JSON.stringify(obj)}\n`
                controller.enqueue(new TextEncoder().encode(line))
            }

            try {
                const result = await searchDocuments(query, {
                    segmenter: config.segmenter,
                    subagentModel: config.subagent,
                    reviewerModel: config.reviewer,
                    onStep: (label) => {
                        send({ type: 'step', label })
                    },
                })

                const elapsedMs = Math.round(performance.now() - startedAt)

                // Save to history (best-effort)
                if (root) {
                    saveSearchHistory(root, query, result, elapsedMs).catch(
                        () => {
                            /* ignore */
                        }
                    )
                }

                send({
                    type: 'done',
                    content: result.content,
                    review: result.review,
                    reviewElapsedMs: result.reviewElapsedMs,
                    elapsedMs,
                    trace: result.trace,
                    docNames: result.docNames
                        ? Object.fromEntries(result.docNames)
                        : undefined,
                })
            } catch (err) {
                send({
                    type: 'error',
                    message:
                        err instanceof Error ? err.message : 'Search failed',
                })
            } finally {
                controller.close()
            }
        },
    })

    return c.body(stream, 200, {
        'Content-Type': 'application/x-ndjson',
    })
})

export { searchRouter }
