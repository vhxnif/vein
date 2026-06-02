import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { intro, note, outro, spinner, text } from '@clack/prompts'
import type { Command } from 'commander'
import type { LibrarianResult } from '../ai/index'
import { librarian } from '../ai/index'
import { logger, resolveProjectRoot, veinDir } from '../config'
import {
    colorize,
    formatDuration,
    getErrorMessage,
    VERDICT_COLOR,
    VERDICT_ICON,
} from '../utils/cli-helpers'
import { setupProjectModel } from './command-utils'

const log = logger.child({ module: 'ask' })

type HistoryEntry = {
    id: string
    query: string
    answer: string
    verdict?: string
    score?: number
    elapsedMs: number
    steps: number
    trace?: unknown[]
}

function historyDir(root: string): string {
    return path.join(root, veinDir, 'ask-history')
}

async function saveHistory(
    root: string,
    query: string,
    result: LibrarianResult,
    elapsedMs: number
): Promise<string> {
    const now = new Date()
    const id = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const dir = historyDir(root)
    await mkdir(dir, { recursive: true })

    const entry: HistoryEntry = {
        id,
        query,
        answer: result.content || '',
        verdict: result.review?.verdict,
        score: result.review?.score,
        elapsedMs,
        steps: result.trace.length,
        trace: result.trace,
    }

    await writeFile(
        path.join(dir, `${id}.json`),
        JSON.stringify(entry, null, 2)
    )
    return id
}

function formatTrace(result: LibrarianResult): string {
    if (result.trace.length === 0) return ''
    const traceLines = result.trace
        .map((s, i) => {
            const num = String(i + 1).padStart(2, ' ')
            const tool = s.tool
            let detail = s.resultSummary
            if (tool === 'getDocStructure') {
                const docId = (s.args as { docId?: string })?.docId
                detail = docId
                    ? `${docId.slice(0, 8)} → ${s.resultSummary}`
                    : s.resultSummary
            } else if (tool === 'getDocNodeDetails') {
                const a = s.args as { docId?: string; nodeId?: string }
                detail =
                    a.docId && a.nodeId
                        ? `${a.docId.slice(0, 8)}/${a.nodeId} → ${s.resultSummary}`
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
        .action(
            async (
                queryArg?: string,
                options?: {
                    noInteractive?: boolean
                    interactive?: boolean
                    trace?: boolean
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

                const startedAt = performance.now()
                let result: LibrarianResult
                try {
                    result = await librarian(
                        query,
                        searchSpinner
                            ? (label) => searchSpinner.message(label)
                            : undefined
                    )
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
                if (projectRoot) {
                    saveHistory(projectRoot, query, result, elapsedMs).catch(
                        (err) =>
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
                    note(formatTrace(result))
                }

                log.info({
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
