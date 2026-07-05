import process from 'node:process'
import { intro, note, outro, text } from '@clack/prompts'
import type { LibrarianResult, LibrarianSession } from '@vein/core'
import {
    createSession,
    logger,
    persistSession,
    resolveDocNames,
    resolveProjectRoot,
    resumeLatestSession,
    resumeSession,
    setupProjectModel,
} from '@vein/core'
import type { Command } from 'commander'
import ora, { type Ora } from 'ora'
import {
    colorize,
    colorizeDocRefs,
    formatDuration,
    getErrorMessage,
    VERDICT_COLOR,
    VERDICT_ICON,
} from '../utils/cli-helpers.ts'

const log = logger.child({ module: 'ask' })

function formatTrace(
    result: LibrarianResult,
    docNames: Map<string, string>
): string {
    if (result.trace.length === 0) return ''
    const traceLines = result.trace
        .map((s, i) => {
            const num = String(i + 1).padStart(2, ' ')
            const tool = s.tool
            let detail = s.resultSummary
            if (tool === 'getDocStructure' || tool === 'getDocNodeDetails') {
                const a = s.args as { docId?: string; nodeId?: string }
                const name =
                    (a.docId && docNames.get(a.docId)) ||
                    a.docId?.slice(0, 8) ||
                    '?'
                const nodeId = a.nodeId ? `/${a.nodeId}` : ''
                detail = `${name}${nodeId} → ${s.resultSummary}`
            }
            return `  ${num}. ${tool}  ${detail}`
        })
        .join('\n')
    return colorizeDocRefs(
        `Retrieval trace (${result.trace.length} step${result.trace.length > 1 ? 's' : ''}):\n${traceLines}`
    )
}

export function register(program: Command) {
    program
        .command('ask')
        .description('query the document library using the librarian agent')
        .argument('[query]', 'search query (required if --no-interactive)')
        .option(
            '-n, --no-interactive',
            'disable interactive prompt, output JSON'
        )
        .option('-t, --trace', 'show retrieval trace in output')
        .option(
            '--new-session',
            'start a new session instead of using the latest'
        )
        .option('--session <id>', 'resume a specific session by ID')
        .action(
            async (
                queryArg?: string,
                options?: {
                    noInteractive?: boolean
                    interactive?: boolean
                    trace?: boolean
                    newSession?: boolean
                    session?: string
                }
            ) => {
                const interactive = options?.interactive ?? true
                const showTrace = options?.trace ?? false
                const useNewSession = options?.newSession ?? false
                const specificSessionId = options?.session

                const config = await setupProjectModel()
                if (!config) {
                    if (!interactive) {
                        console.error(
                            JSON.stringify({
                                error: 'Not in a vein project',
                            })
                        )
                        process.exit(1)
                    }
                    outro('Not in a vein project. Run "vein new" first.')
                    return
                }

                let query: string

                if (interactive) {
                    if (queryArg) {
                        query = queryArg
                    } else {
                        intro('Vein Librarian')
                        const raw = await text({
                            message: 'What would you like to find?',
                            placeholder: 'e.g. 查找关于 JVM GC 的文档',
                        })
                        if (typeof raw !== 'string') {
                            outro('Cancelled')
                            return
                        }
                        query = raw
                    }
                } else {
                    if (!queryArg) {
                        console.error(
                            JSON.stringify({
                                error: 'Query argument required when --no-interactive',
                            })
                        )
                        process.exit(1)
                    }
                    query = queryArg
                }

                // ── Session: use latest, specific, or new ─────────
                const projectRoot = resolveProjectRoot()
                let session: LibrarianSession
                if (specificSessionId && projectRoot) {
                    try {
                        session = await resumeSession(
                            projectRoot,
                            specificSessionId,
                            {
                                reviewerModel: config.reviewer,
                                thinkingLevel: config.thinkingLevel,
                            }
                        )
                        log.info({
                            sessionId: specificSessionId,
                            content: 'Resumed session',
                        })
                    } catch {
                        if (!interactive) {
                            console.error(
                                JSON.stringify({
                                    error: `Session not found: ${specificSessionId}`,
                                })
                            )
                            process.exit(1)
                        }
                        outro(`Session "${specificSessionId}" not found`)
                        return
                    }
                } else if (!useNewSession && projectRoot) {
                    session = await resumeLatestSession(projectRoot, {
                        reviewerModel: config.reviewer,
                        thinkingLevel: config.thinkingLevel,
                    })
                } else if (useNewSession) {
                    session = createSession({
                        reviewerModel: config.reviewer,
                        thinkingLevel: config.thinkingLevel,
                    })
                } else {
                    session = await resumeLatestSession(
                        projectRoot ?? process.cwd(),
                        {
                            reviewerModel: config.reviewer,
                            thinkingLevel: config.thinkingLevel,
                        }
                    )
                }

                log.info({
                    sessionId: session.sessionId,
                    query,
                    content: 'Ask session start',
                })

                // ── ora spinner (stderr, won't conflict with stdout text) ─
                const s: Ora | undefined = interactive
                    ? ora().start('Searching...')
                    : undefined

                let toolCount = 0
                let runningTools = 0
                const toolLabels = new Map<string, string>()
                let idleTimer: ReturnType<typeof setTimeout> | null = null
                const state = {
                    phase: 'tools' as 'tools' | 'thinking' | 'text',
                }

                // ── Idle-spinner: show during gaps in thinking/text streaming ─
                const stopSpinner = () => {
                    if (idleTimer) {
                        clearTimeout(idleTimer)
                        idleTimer = null
                    }
                    if (s?.isSpinning) s.stop()
                }
                const scheduleIdle = () => {
                    if (!interactive || state.phase === 'tools') return
                    if (idleTimer) clearTimeout(idleTimer)
                    idleTimer = setTimeout(() => {
                        idleTimer = null
                        if (!s?.isSpinning) {
                            // \n ensures spinner starts on its own line,
                            // not mid-text where it would overwrite on Windows.
                            process.stdout.write('\n')
                            s?.start('Working...')
                        }
                    }, 200)
                }

                const startedAt = performance.now()

                let result: LibrarianResult
                try {
                    result = await session.ask(query, undefined, {
                        signal: undefined,
                        thinkingLevel: config.thinkingLevel,
                        reviewerModel: config.reviewer,
                        onToolCallStart: (toolCallId, _toolName, label) => {
                            if (!interactive) return
                            toolCount++
                            runningTools++
                            toolLabels.set(toolCallId, label)
                            if (state.phase === 'tools') {
                                s!.text = `${label} (${runningTools} running)`
                            } else {
                                stopSpinner()
                                s?.start('Working...')
                            }
                        },
                        onToolCallEnd: (toolCallId, _toolName, summary) => {
                            if (!interactive) return
                            runningTools--
                            const label = toolLabels.get(toolCallId)
                            toolLabels.delete(toolCallId)
                            const display = label
                                ? `${label} → ${summary}`
                                : summary
                            if (state.phase === 'tools') {
                                process.stdout.write(
                                    `  ${colorize('✓', '\x1b[32m')} ${display}\n`
                                )
                                if (runningTools > 0) {
                                    s!.text = `${runningTools} tool${runningTools > 1 ? 's' : ''} running`
                                } else {
                                    s!.text = 'Generating answer...'
                                }
                            } else {
                                stopSpinner()
                                process.stdout.write(
                                    `\n  ${colorize('✓', '\x1b[32m')} ${display}\n`
                                )
                                scheduleIdle()
                            }
                        },
                        onThinkingDelta: (delta) => {
                            if (!interactive) return
                            if (state.phase === 'tools') {
                                s!.stop()
                                state.phase = 'thinking'
                                process.stdout.write('\n')
                            }
                            stopSpinner()
                            process.stdout.write(
                                colorize(delta, '\x1b[2m\x1b[37m')
                            )
                            scheduleIdle()
                        },
                        onTextDelta: (delta) => {
                            if (!interactive) return
                            if (state.phase !== 'text') {
                                s!.stop()
                                state.phase = 'text'
                                process.stdout.write('\n')
                            }
                            stopSpinner()
                            process.stdout.write(delta)
                            scheduleIdle()
                        },
                    })
                } catch (err) {
                    stopSpinner()
                    s?.stop()
                    if (interactive) {
                        process.stdout.write(
                            `${colorize('Search failed', '\x1b[31m')}\n`
                        )
                    }
                    if (!interactive) {
                        console.error(
                            JSON.stringify({ error: getErrorMessage(err) })
                        )
                        process.exit(1)
                    }
                    log.error({ err, content: 'Librarian search failed' })
                    return
                }

                // Resolve doc names for trace display
                let docNames = new Map<string, string>()
                try {
                    docNames = await resolveDocNames(result.trace)
                } catch {
                    // best-effort
                }

                // Final spacing after streaming
                stopSpinner()
                if (state.phase === 'text' || state.phase === 'thinking') {
                    process.stdout.write('\n')
                } else {
                    s?.stop()
                }

                const elapsedMs = Math.round(performance.now() - startedAt)
                const elapsed = formatDuration(elapsedMs)

                // Persist session state for multi-turn
                if (projectRoot) {
                    persistSession(projectRoot, session).catch((err) =>
                        log.warn({ err, content: 'Failed to persist session' })
                    )
                }

                if (!interactive) {
                    console.log(
                        JSON.stringify({
                            sessionId: session.sessionId,
                            content: result.content,
                            trace: result.trace,
                            review: result.review,
                            reviewElapsedMs: result.reviewElapsedMs,
                            elapsedMs,
                        })
                    )
                    return
                }

                // ── Post-search display ─────────────────────────────
                // Summary line (web's "Reasoning process" equivalent)
                const summary =
                    toolCount > 0
                        ? colorize(
                              `Retrieval: ${toolCount} tool${toolCount !== 1 ? 's' : ''} · ${elapsed} · session ${session.sessionId}`,
                              '\x1b[90m'
                          )
                        : `Done · ${elapsed} · session ${session.sessionId}`
                if (state.phase === 'text' || state.phase === 'thinking') {
                    console.log(`\n${summary}`)
                } else {
                    console.log(summary)
                }

                if (
                    !result.content ||
                    result.content === '文档库中未找到相关内容'
                ) {
                    note(result.content || '(no results found)')
                }

                if (result.review) {
                    const verdict = result.review.verdict
                    const icon = VERDICT_ICON[verdict] ?? verdict
                    const color = VERDICT_COLOR[verdict] ?? ''
                    const reviewTime =
                        result.reviewElapsedMs !== undefined
                            ? ` · review ${formatDuration(result.reviewElapsedMs)}`
                            : ''
                    note(
                        colorize(
                            `${icon} Review: ${verdict} (${result.review.score}/5)${reviewTime}\n${result.review.reason}`,
                            color
                        )
                    )
                }

                if (showTrace && result.trace.length > 0) {
                    note(formatTrace(result, docNames))
                }

                log.info({
                    sessionId: session.sessionId,
                    query,
                    elapsedMs,
                    verdict: result.review?.verdict,
                    score: result.review?.score,
                    steps: result.trace.length,
                    content: 'Librarian query complete',
                })
            }
        )
}
