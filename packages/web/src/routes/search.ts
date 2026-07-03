import type { LibrarianResult, LibrarianSession } from '@vein/core'
import {
    createSession,
    loadProjectConfig,
    persistSession,
    resolveDocNames,
    resolveProjectRoot,
    resumeLatestSession,
    resumeSession,
} from '@vein/core'
import { Hono } from 'hono'

const searchRouter = new Hono()

// ── POST /api/projects/current/search ───────────────────────────
// Streams the librarian agent execution via ndjson.
// Each line is a JSON object:
//   { "type": "thinking_delta", "delta": "..." }
//   { "type": "text_delta", "delta": "..." }
//   { "type": "tool_call_start", "toolCallId": "...", "toolName": "...", "label": "..." }
//   { "type": "tool_call_end", "toolCallId": "...", "toolName": "...", "summary": "..." }
//   { "type": "done", "content": "...", "review": {...}, "sessionId": "..." }
//   { "type": "error", "message": "..." }
searchRouter.post('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const config = await loadProjectConfig(root)
    if (!config) return c.json({ error: 'No config found' }, 404)

    const body = await c.req.json()
    const query = body.q as string
    if (!query) return c.json({ error: 'Missing query' }, 400)

    const sessionId = body.sessionId as string | undefined
    const newSession = body.newSession as boolean | undefined

    const startedAt = performance.now()

    // Use the request's abort signal to detect client disconnection
    const signal = c.req.raw.signal

    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) => {
                try {
                    const line = `${JSON.stringify(obj)}\n`
                    controller.enqueue(new TextEncoder().encode(line))
                } catch {
                    // Controller closed (client disconnected) — ignore
                }
            }

            let aborted = false
            const onAbort = () => {
                aborted = true
            }
            signal.addEventListener('abort', onAbort, { once: true })

            // Track running tools for end-callback matching
            type StreamBlock = {
                type: 'thinking' | 'text' | 'tool'
                text?: string
                name?: string
                label?: string
                summary?: string
            }
            const timeline: StreamBlock[] = []

            // Resolve or create session
            let session: LibrarianSession
            if (sessionId) {
                try {
                    session = await resumeSession(root, sessionId, {
                        reviewerModel: config.reviewer,
                        thinkingLevel: config.thinkingLevel,
                    })
                } catch {
                    send({
                        type: 'error',
                        message: `Session not found: ${sessionId}`,
                    })
                    cleanup()
                    return
                }
            } else if (newSession) {
                session = createSession({
                    reviewerModel: config.reviewer,
                    thinkingLevel: config.thinkingLevel,
                })
            } else {
                session = await resumeLatestSession(root, {
                    reviewerModel: config.reviewer,
                    thinkingLevel: config.thinkingLevel,
                })
            }

            let result: LibrarianResult
            try {
                result = await session.ask(query, undefined, {
                    signal,
                    thinkingLevel: config.thinkingLevel,
                    reviewerModel: config.reviewer,
                    onThinkingDelta: (delta) => {
                        if (!aborted) {
                            send({ type: 'thinking_delta', delta })
                            const last = timeline.at(-1)
                            if (last && last.type === 'thinking') {
                                last.text += delta
                            } else {
                                timeline.push({
                                    type: 'thinking',
                                    text: delta,
                                })
                            }
                        }
                    },
                    onTextDelta: (delta) => {
                        if (!aborted) {
                            send({ type: 'text_delta', delta })
                            const last = timeline.at(-1)
                            if (last && last.type === 'text') {
                                last.text += delta
                            } else {
                                timeline.push({
                                    type: 'text',
                                    text: delta,
                                })
                            }
                        }
                    },
                    onToolCallStart: (toolCallId, toolName, label) => {
                        if (!aborted) {
                            send({
                                type: 'tool_call_start',
                                toolCallId,
                                toolName,
                                label,
                            })
                            timeline.push({
                                type: 'tool',
                                name: toolName,
                                label,
                            })
                        }
                    },
                    onToolCallEnd: (toolCallId, toolName, summary) => {
                        if (!aborted) {
                            send({
                                type: 'tool_call_end',
                                toolCallId,
                                toolName,
                                summary,
                            })
                            for (let i = timeline.length - 1; i >= 0; i--) {
                                const b = timeline[i]!
                                if (
                                    b.type === 'tool' &&
                                    b.name === toolName &&
                                    !b.summary
                                ) {
                                    b.summary = summary
                                    break
                                }
                            }
                        }
                    },
                })

                if (aborted) return

                const elapsedMs = Math.round(performance.now() - startedAt)

                // Resolve doc names for the client
                let docNames: Record<string, string> = {}
                try {
                    const map = await resolveDocNames(result.trace)
                    docNames = Object.fromEntries(map)
                } catch {
                    // best-effort
                }

                // Persist session for multi-turn
                persistSession(root, session).catch(() => {
                    /* best-effort */
                })

                send({
                    type: 'done',
                    content: result.content,
                    review: result.review,
                    reviewElapsedMs: result.reviewElapsedMs,
                    elapsedMs,
                    trace: result.trace,
                    sessionId: session.sessionId,
                    docNames,
                })
            } catch (err) {
                if (aborted) return
                send({
                    type: 'error',
                    message:
                        err instanceof Error ? err.message : 'Search failed',
                })
            } finally {
                cleanup()
            }

            function cleanup() {
                signal.removeEventListener('abort', onAbort)
                try {
                    controller.close()
                } catch {
                    // Already closed
                }
            }
        },
    })

    return c.body(stream, 200, {
        'Content-Type': 'application/x-ndjson',
    })
})

export { searchRouter }

// ── Session CRUD ───────────────────────────────────────────────
import { deleteSession, listSessionIds, loadSession } from '@vein/core'

const sessionCrudRouter = new Hono()

// GET /api/projects/current/sessions/latest — load latest session
sessionCrudRouter.get('/latest', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)
    const { loadLatestSession } = await import('@vein/core')
    const snap = await loadLatestSession(root)
    if (!snap) return c.json({ session: null })
    return c.json({ session: snap })
})

// GET /api/projects/current/sessions — list all sessions with metadata
sessionCrudRouter.get('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)
    const ids = await listSessionIds(root)
    const sessions = await Promise.all(
        ids.map(async (id) => {
            const snap = await loadSession(root, id)
            return snap
                ? {
                      sessionId: snap.sessionId,
                      summary: snap.summary,
                      queryCount: snap.queryCount,
                      updatedAt: snap.updatedAt,
                  }
                : null
        })
    )
    return c.json({ sessions: sessions.filter(Boolean) })
})

// GET /api/projects/current/sessions/:id — load a session
sessionCrudRouter.get('/:id', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)
    const id = c.req.param('id')
    const snap = await loadSession(root, id)
    if (!snap) return c.json({ error: 'Session not found' }, 404)
    return c.json(snap)
})

// DELETE /api/projects/current/sessions/:id — delete a session
sessionCrudRouter.delete('/:id', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)
    const id = c.req.param('id')
    const deleted = await deleteSession(root, id)
    if (!deleted) return c.json({ error: 'Session not found' }, 404)
    return c.json({ ok: true })
})

export { sessionCrudRouter }
