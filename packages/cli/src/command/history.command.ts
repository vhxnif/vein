import { intro, note, outro, select } from '@clack/prompts'
import type { HistoryEntry } from '@vein/core'
import {
    getSearchHistoryEntry,
    listSearchHistory,
    resolveProjectRoot,
} from '@vein/core'
import type { Command } from 'commander'
import { formatDuration } from '../utils/cli-helpers.ts'

function formatHistoryDetail(entry: HistoryEntry): string {
    const lines = [
        `Query:   ${entry.query}`,
        `Time:    ${entry.id}  (${formatDuration(entry.elapsedMs)}, ${entry.steps} steps)`,
    ]
    if (entry.verdict) {
        lines.push(`Review:  ${entry.verdict} (${entry.score}/5)`)
    }
    lines.push('', entry.answer || '(no answer)')
    return lines.join('\n')
}

export function register(program: Command) {
    program
        .command('history')
        .alias('hs')
        .description('review past ask sessions')
        .option('-l, --last', 'show the most recent session')
        .option('-L, --list', 'list sessions without interactive picker')
        .option(
            '-p, --page <n>',
            'page number for --list (20 per page)',
            (v) => Math.max(1, Number.parseInt(v, 10) || 1),
            1
        )
        .action(
            async (options?: {
                last?: boolean
                list?: boolean
                page?: number
            }) => {
                const root = resolveProjectRoot()
                if (!root) {
                    outro('Not in a vein project. Run "vein new" first.')
                    return
                }

                const entries = await listSearchHistory(root)

                if (entries.length === 0) {
                    outro('No ask history found.')
                    return
                }

                if (options?.last) {
                    const entry = entries[0]!
                    note(formatHistoryDetail(entry))
                    return
                }

                const PER_PAGE = 20
                const page = options?.page ?? 1
                const totalPages = Math.ceil(entries.length / PER_PAGE)
                const paged = entries.slice(
                    (page - 1) * PER_PAGE,
                    page * PER_PAGE
                )

                if (options?.list) {
                    intro(`Ask History (${entries.length} total)`)
                    for (const entry of paged) {
                        const verdictStr = entry.verdict
                            ? `${entry.verdict} ${entry.score ?? '?'}/5`
                            : '—'
                        const queryPreview =
                            entry.query.length > 60
                                ? `${entry.query.slice(0, 60)}...`
                                : entry.query
                        note(
                            `${entry.id}  ${formatDuration(entry.elapsedMs).padEnd(6)}  ${verdictStr.padEnd(14)}  ${queryPreview}`
                        )
                    }
                    if (totalPages > 1) {
                        outro(
                            `Page ${page}/${totalPages} · use -p <n> to navigate`
                        )
                    } else {
                        outro(`${entries.length} session(s)`)
                    }
                    return
                }

                // Interactive picker (loop until user cancels)
                const buildChoices = () => {
                    const items = paged.map((entry) => {
                        const verdictStr = entry.verdict
                            ? `${entry.verdict} ${entry.score ?? '?'}/5`
                            : '—'
                        const queryPreview =
                            entry.query.length > 50
                                ? `${entry.query.slice(0, 50)}...`
                                : entry.query
                        return {
                            value: entry.id,
                            label: `${entry.id} │ ${verdictStr.padEnd(12)} │ ${queryPreview}`,
                            hint: formatDuration(entry.elapsedMs),
                        }
                    })
                    if (totalPages > 1) {
                        items.push({
                            value: '__next__',
                            label: `─── Page ${page}/${totalPages} · next page ───`,
                            hint: `use -p ${page + 1} to jump`,
                        })
                    }
                    return items
                }

                intro(`Ask History (${entries.length} total)`)

                while (true) {
                    const choices = buildChoices()
                    const selected = await select({
                        message: 'Select a session (Esc to exit)',
                        options: choices,
                    })

                    if (!selected || typeof selected !== 'string') {
                        outro('Done')
                        return
                    }

                    if (selected === '__next__') {
                        outro(`Run: vein history -p ${page + 1}`)
                        return
                    }

                    const entry = await getSearchHistoryEntry(root, selected)
                    if (entry) {
                        note(formatHistoryDetail(entry))
                    }
                }
            }
        )
}
