import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { intro, note, outro, select } from '@clack/prompts'
import type { Command } from 'commander'
import { getProjectRoot, veinDir } from '../config'
import { formatDuration } from '../utils/cli-helpers'

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
            (v) => Math.max(1, parseInt(v, 10) || 1),
            1
        )
        .action(
            async (options?: {
                last?: boolean
                list?: boolean
                page?: number
            }) => {
                const root = getProjectRoot(process.cwd())
                if (!root) {
                    outro('Not in a vein project. Run "vein new" first.')
                    return
                }

                const dir = historyDir(root)
                let files: string[]
                try {
                    files = (await readdir(dir))
                        .filter((f) => f.endsWith('.json'))
                        .sort()
                        .reverse()
                } catch {
                    outro('No ask history found.')
                    return
                }

                if (files.length === 0) {
                    outro('No ask history found.')
                    return
                }

                const loadEntry = async (filename: string) => {
                    const raw = await readFile(
                        path.join(dir, filename),
                        'utf-8'
                    )
                    return JSON.parse(raw) as HistoryEntry
                }

                if (options?.last) {
                    const entry = await loadEntry(files[0]!)
                    note(formatHistoryDetail(entry))
                    return
                }

                const PER_PAGE = 20
                const page = options?.page ?? 1
                const totalPages = Math.ceil(files.length / PER_PAGE)
                const paged = files.slice(
                    (page - 1) * PER_PAGE,
                    page * PER_PAGE
                )

                if (options?.list) {
                    intro(`Ask History (${files.length} total)`)
                    for (const f of paged) {
                        const entry = await loadEntry(f)
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
                        outro(`${files.length} session(s)`)
                    }
                    return
                }

                // Interactive picker (loop until user cancels)
                const buildChoices = async () => {
                    const items = await Promise.all(
                        paged.map(async (f) => {
                            const entry = await loadEntry(f)
                            const verdictStr = entry.verdict
                                ? `${entry.verdict} ${entry.score ?? '?'}/5`
                                : '—'
                            const queryPreview =
                                entry.query.length > 50
                                    ? `${entry.query.slice(0, 50)}...`
                                    : entry.query
                            return {
                                value: f,
                                label: `${entry.id} │ ${verdictStr.padEnd(12)} │ ${queryPreview}`,
                                hint: formatDuration(entry.elapsedMs),
                            }
                        })
                    )
                    if (totalPages > 1) {
                        items.push({
                            value: '__next__',
                            label: `─── Page ${page}/${totalPages} · next page ───`,
                            hint: `use -p ${page + 1} to jump`,
                        })
                    }
                    return items
                }

                intro(`Ask History (${files.length} total)`)

                while (true) {
                    const choices = await buildChoices()
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

                    const entry = await loadEntry(selected)
                    note(formatHistoryDetail(entry))
                }
            }
        )
}
