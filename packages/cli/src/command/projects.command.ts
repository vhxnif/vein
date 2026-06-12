import { access, constants } from 'node:fs/promises'
import { confirm, intro, note, outro } from '@clack/prompts'
import { loadGlobalProjects, unregisterProject } from '@vein/core'
import type { Command } from 'commander'

export function register(program: Command) {
    program
        .command('projects')
        .alias('pr')
        .description('list registered vein projects')
        .option(
            '--remove <name>',
            'unregister a project from the global registry'
        )
        .action(async (options?: { remove?: string }) => {
            if (options?.remove) {
                const name = options.remove
                const data = await loadGlobalProjects()
                if (!data.projects[name]) {
                    outro(`Project "${name}" is not registered.`)
                    return
                }
                const ok = await confirm({
                    message: `Remove "${name}" (${data.projects[name]}) from registry?`,
                })
                if (ok !== true) {
                    outro('Cancelled')
                    return
                }
                await unregisterProject(name)
                outro(`Unregistered "${name}".`)
                return
            }

            const data = await loadGlobalProjects()
            const entries = Object.entries(data.projects)

            if (entries.length === 0) {
                intro('Global Projects')
                note(
                    'No registered projects.\nRun "vein new" in a project directory to register it.'
                )
                outro('Done')
                return
            }

            intro(`Global Projects (${entries.length})`)

            // Sort by name
            entries.sort(([a], [b]) => a.localeCompare(b))

            // Check which paths still exist
            const existsMap = new Map<string, boolean>()
            await Promise.all(
                entries.map(async ([, p]) => {
                    try {
                        await access(p, constants.F_OK)
                        existsMap.set(p, true)
                    } catch {
                        existsMap.set(p, false)
                    }
                })
            )

            const maxNameLen = Math.max(...entries.map(([n]) => n.length))
            const lines = entries.map(([name, projectPath]) => {
                const ok = existsMap.get(projectPath)
                const mark = ok ? ' ' : '✗'
                const hint = ok ? '' : ' (path missing)'
                return `${mark} ${name.padEnd(maxNameLen + 2)}${projectPath}${hint}`
            })

            note(lines.join('\n\n'))

            const missing = entries.filter(([, p]) => !existsMap.get(p)).length
            outro(
                `${entries.length} project(s)` +
                    (missing > 0 ? `, ${missing} path(s) missing` : '')
            )
        })
}
