import process from 'node:process'
import { intro, note, outro, select } from '@clack/prompts'
import type { AgentMessage, SessionSnapshot } from '@vein/core'
import { listSessionIds, loadSession, resolveProjectRoot } from '@vein/core'
import type { Command } from 'commander'

const isTTY = process.stdout.isTTY

/** Color a prefix without resetting clack's dim styling on the rest of the line. */
function prefix(label: string, code: string): string {
    return isTTY ? `${code}${label}\x1b[39m` : label
}

/** Narrow an AgentMessage union member by role to access role-specific fields. */
function asRole<T extends AgentMessage['role']>(
    msg: AgentMessage,
    role: T
): (AgentMessage & { role: T }) | undefined {
    return msg.role === role ? (msg as AgentMessage & { role: T }) : undefined
}

function extractText(msg: AgentMessage): string {
    const user = asRole(msg, 'user')
    if (user) {
        const c = user.content
        if (typeof c === 'string') return c
        if (Array.isArray(c)) {
            return c
                .filter((it) => it.type === 'text')
                .map((it) => it.text)
                .join('')
        }
        return ''
    }

    const assistant = asRole(msg, 'assistant')
    if (assistant) {
        return assistant.content
            .filter((it) => it.type === 'text')
            .map((it) => it.text)
            .join('\n')
    }

    const tool = asRole(msg, 'toolResult')
    if (tool) {
        return `[tool ${tool.toolName}]`
    }

    return ''
}

function formatSessionDetail(snap: SessionSnapshot): string {
    const lines = [
        `Session: ${snap.sessionId}`,
        `Summary: ${snap.summary || '(no summary)'}`,
        `Queries: ${snap.queryCount}`,
        `Updated: ${new Date(snap.updatedAt).toLocaleString()}`,
        '',
    ]

    let turn = 0
    let pendingAnswer = ''

    const flushAnswer = () => {
        const text = pendingAnswer.trim()
        if (!text) return
        const preview = text.slice(0, 500)
        lines.push(
            `${prefix(`A${turn}:`, '\x1b[33m')} ${preview}${text.length > 500 ? '...' : ''}`
        )
        pendingAnswer = ''
    }

    for (const msg of snap.messages) {
        if (msg.role === 'user') {
            flushAnswer()
            turn++
            const text = extractText(msg)
            lines.push(`${prefix(`Q${turn}:`, '\x1b[36m')} ${text}`)
        } else if (msg.role === 'assistant') {
            const text = extractText(msg)
            if (text) pendingAnswer += (pendingAnswer ? '\n' : '') + text
        }
        // toolResult ignored
    }

    flushAnswer()

    if (turn === 0) {
        lines.push('(no conversation)')
    }

    return lines.join('\n')
}

function formatSessionListItem(snap: SessionSnapshot): string {
    const summary = snap.summary || '(no summary)'
    const preview = summary.length > 50 ? `${summary.slice(0, 50)}...` : summary
    const updated = new Date(snap.updatedAt).toLocaleDateString()
    return `${snap.sessionId.slice(0, 8)} │ ${String(snap.queryCount).padStart(2)} queries │ ${updated} │ ${preview}`
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

                const ids = await listSessionIds(root)
                if (ids.length === 0) {
                    outro('No sessions found.')
                    return
                }

                // Load all sessions for sorting (listSessionIds is already newest-first)
                const snaps: SessionSnapshot[] = []
                for (const id of ids) {
                    const snap = await loadSession(root, id)
                    if (snap) snaps.push(snap)
                }

                if (snaps.length === 0) {
                    outro('No sessions found.')
                    return
                }

                if (options?.last) {
                    note(formatSessionDetail(snaps[0]!))
                    return
                }

                const PER_PAGE = 20
                const page = options?.page ?? 1
                const totalPages = Math.ceil(snaps.length / PER_PAGE)
                const paged = snaps.slice(
                    (page - 1) * PER_PAGE,
                    page * PER_PAGE
                )

                if (options?.list) {
                    intro(`Sessions (${snaps.length} total)`)
                    for (const snap of paged) {
                        note(formatSessionListItem(snap))
                    }
                    if (totalPages > 1) {
                        outro(
                            `Page ${page}/${totalPages} · use -p <n> to navigate`
                        )
                    } else {
                        outro(`${snaps.length} session(s)`)
                    }
                    return
                }

                const buildChoices = () => {
                    const items = paged.map((snap) => ({
                        value: snap.sessionId,
                        label: formatSessionListItem(snap),
                        hint: `${snap.queryCount} query${snap.queryCount !== 1 ? 's' : ''}`,
                    }))
                    if (totalPages > 1) {
                        items.push({
                            value: '__next__',
                            label: `─── Page ${page}/${totalPages} · next page ───`,
                            hint: `use -p ${page + 1} to jump`,
                        })
                    }
                    return items
                }

                intro(`Sessions (${snaps.length} total)`)

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

                    const snap = await loadSession(root, selected)
                    if (snap) {
                        note(formatSessionDetail(snap))
                    }
                }
            }
        )
}
