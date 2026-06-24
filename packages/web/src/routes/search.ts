import type { HistoryTimelineBlock } from '@vein/core'
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
    const mode = (body.mode as 'default' | 'quick') ?? 'default'

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

            // Capture timeline blocks for history
            const timeline: HistoryTimelineBlock[] = []

            try {
                const result = await searchDocuments(query, {
                    segmenter: config.segmenter,
                    subagentModel: config.subagent,
                    reviewerModel: config.reviewer,
                    searchAgentModel: config.searchAgent,
                    thinkingLevel: config.thinkingLevel,
                    mode,
                    signal,
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
                        if (!aborted) send({ type: 'text_delta', delta })
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
                            // Find the last matching tool block and add summary
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

                // Save to history (best-effort)
                if (root) {
                    saveSearchHistory(
                        root,
                        query,
                        result,
                        elapsedMs,
                        mode,
                        timeline
                    ).catch(() => {
                        /* ignore */
                    })
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
