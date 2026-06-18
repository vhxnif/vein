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
//   { "type": "thinking_delta", "delta": "..." }
//   { "type": "text_delta", "delta": "..." }
//   { "type": "tool_call_start", "toolCallId": "...", "toolName": "...", "label": "..." }
//   { "type": "tool_call_end", "toolCallId": "...", "toolName": "...", "summary": "..." }
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

            try {
                const result = await searchDocuments(query, {
                    segmenter: config.segmenter,
                    subagentModel: config.subagent,
                    reviewerModel: config.reviewer,
                    searchAgentModel: config.searchAgent,
                    thinkingLevel: config.thinkingLevel,
                    signal,
                    onThinkingDelta: (delta) => {
                        if (!aborted) send({ type: 'thinking_delta', delta })
                    },
                    onTextDelta: (delta) => {
                        if (!aborted) send({ type: 'text_delta', delta })
                    },
                    onToolCallStart: (toolCallId, toolName, label) => {
                        if (!aborted)
                            send({
                                type: 'tool_call_start',
                                toolCallId,
                                toolName,
                                label,
                            })
                    },
                    onToolCallEnd: (toolCallId, toolName, summary) => {
                        if (!aborted)
                            send({
                                type: 'tool_call_end',
                                toolCallId,
                                toolName,
                                summary,
                            })
                    },
                })

                if (aborted) return

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
                if (aborted) return
                send({
                    type: 'error',
                    message:
                        err instanceof Error ? err.message : 'Search failed',
                })
            } finally {
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
