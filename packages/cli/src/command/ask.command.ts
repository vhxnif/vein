import { intro, note, outro, spinner, text } from '@clack/prompts'
import type {
    HistoryTimelineBlock,
    LibrarianResult,
    SearchResult,
} from '@vein/core'
import {
    logger,
    resolveProjectRoot,
    saveSearchHistory,
    searchDocuments,
    setupProjectModel,
} from '@vein/core'
import type { Command } from 'commander'
import {
    colorize,
    formatDuration,
    getErrorMessage,
    VERDICT_COLOR,
    VERDICT_ICON,
} from '../utils/cli-helpers'

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
            if (tool === 'analyzeDocument') {
                const a = s.args as { docId?: string; userQuery?: string }
                const name =
                    (a.docId && docNames.get(a.docId)) ||
                    a.docId?.slice(0, 8) ||
                    '?'
                detail = `${name} → ${s.resultSummary}`
            }
            if (tool === 'getDocNodeDetails') {
                const a = s.args as { docId?: string; nodeId?: string }
                const name =
                    (a.docId && docNames.get(a.docId)) ||
                    a.docId?.slice(0, 8) ||
                    '?'
                detail =
                    a.docId && a.nodeId
                        ? `${name}/${a.nodeId} → ${s.resultSummary}`
                        : s.resultSummary
            }
            return `  ${num}. ${tool}  ${detail}`
        })
        .join('\n')
    return `Retrieval trace (${result.trace.length} step${result.trace.length > 1 ? 's' : ''}):\n${traceLines}`
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
            '-m, --mode <mode>',
            'retrieval mode: default (analyze+review) or raw (extract raw fragments, main agent summarizes)',
            'default'
        )
        .action(
            async (
                queryArg?: string,
                options?: {
                    noInteractive?: boolean
                    interactive?: boolean
                    trace?: boolean
                    mode?: string
                }
            ) => {
                const interactive = options?.interactive ?? true
                const showTrace = options?.trace ?? false

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

                const searchSpinner = interactive ? spinner() : undefined
                searchSpinner?.start('Searching...')

                const sessionId = crypto.randomUUID().slice(0, 8)
                log.info({ sessionId, query, content: 'Ask session start' })

                const startedAt = performance.now()
                let result: SearchResult
                try {
                    result = await searchDocuments(query, {
                        segmenter: config.segmenter,
                        subagentModel: config.subagent,
                        reviewerModel: config.reviewer,
                        searchAgentModel: config.searchAgent,
                        mode: (options?.mode as 'default' | 'raw') ?? 'default',
                        onStep: searchSpinner
                            ? (label) => searchSpinner.message(label)
                            : undefined,
                    })
                } catch (err) {
                    searchSpinner?.stop('Search failed')
                    if (!interactive) {
                        console.error(
                            JSON.stringify({ error: getErrorMessage(err) })
                        )
                        process.exit(1)
                    }
                    log.error({ err, content: 'Librarian search failed' })
                    outro('Search failed')
                    return
                }
                const elapsedMs = Math.round(performance.now() - startedAt)
                const elapsed = formatDuration(elapsedMs)

                const projectRoot = resolveProjectRoot()
                const mode = (options?.mode as 'default' | 'raw') ?? 'default'
                if (projectRoot) {
                    const timeline: HistoryTimelineBlock[] = result.trace.map(
                        (s) => ({
                            type: 'tool' as const,
                            name: s.tool,
                            label: s.tool,
                            summary: s.resultSummary,
                        })
                    )
                    saveSearchHistory(
                        projectRoot,
                        query,
                        result,
                        elapsedMs,
                        mode,
                        timeline
                    ).catch((err) =>
                        log.warn({
                            err,
                            content: 'Failed to save ask history',
                        })
                    )
                }

                searchSpinner?.stop(
                    result.review
                        ? `${result.review.verdict} (${result.review.score}/5) · ${elapsed}`
                        : `Done · ${elapsed}`
                )

                if (!interactive) {
                    console.log(
                        JSON.stringify({
                            ...result,
                            elapsedMs,
                            reviewElapsedMs: result.reviewElapsedMs,
                        })
                    )
                    return
                }

                note(result.content || '(no results found)')

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
                    note(formatTrace(result, result.docNames))
                }

                log.info({
                    sessionId,
                    query,
                    elapsedMs,
                    verdict: result.review?.verdict,
                    score: result.review?.score,
                    steps: result.trace.length,
                    content: 'Librarian query complete',
                })

                outro('Done')
            }
        )
}
