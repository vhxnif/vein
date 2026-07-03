// ponytail: minimal sessions list command.

import {
    listSessionIds,
    loadSession,
    logger,
    resolveProjectRoot,
    setupProjectModel,
} from '@vein/core'
import type { Command } from 'commander'

const _log = logger.child({ module: 'sessions' })

export function register(program: Command) {
    program
        .command('sessions')
        .description('list saved conversation sessions')
        .option('-l, --list', 'list all sessions')
        .action(async (_options?: { list?: boolean }) => {
            const config = await setupProjectModel()
            if (!config) {
                console.error('Not in a vein project. Run "vein new" first.')
                return
            }

            const root = resolveProjectRoot()
            if (!root) {
                console.error('Cannot resolve project root.')
                return
            }

            const ids = await listSessionIds(root)
            if (ids.length === 0) {
                console.log('No sessions yet. Run "vein ask" to start one.')
                return
            }

            console.log(`${ids.length} session(s):\n`)
            for (const id of ids) {
                const snap = await loadSession(root, id)
                const summary = snap?.summary ?? '?'
                const queries = snap?.queryCount ?? 0
                const updated = snap
                    ? new Date(snap.updatedAt).toLocaleString()
                    : '?'
                console.log(
                    `  ${id}  ${summary.slice(0, 50).padEnd(52)} ${queries} quer${queries === 1 ? 'y' : 'ies'}  ${updated}`
                )
            }
        })
}
