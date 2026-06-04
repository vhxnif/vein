#!/usr/bin/env node
import { Command } from 'commander'
import { setProjectOverride } from '../config'
import { getProjectPath } from '../config/global'
import { register as registerAsk } from './ask.command'
import { register as registerBrowse } from './browse.command'
import { register as registerConfig } from './config.command'
import { register as registerHistory } from './history.command'
import { register as registerMarkdown } from './markdown.command'
import { register as registerNew } from './new.command'
import { register as registerProjects } from './projects.command'

const vein = new Command()
    .name('vein')
    .description('AI-powered document management')
    .option(
        '-p, --project <name>',
        'target a registered project by name (optional, falls back to cwd discovery)'
    )

registerNew(vein)
registerMarkdown(vein)
registerAsk(vein)
registerHistory(vein)
registerConfig(vein)
registerBrowse(vein)
registerProjects(vein)

vein.hook('preAction', async () => {
    const projectName = vein.opts().project as string | undefined
    if (projectName) {
        const p = await getProjectPath(projectName)
        if (!p) {
            console.error(
                `Project "${projectName}" not found in global registry.`
            )
            console.error('Use "vein projects" to list registered projects.')
            process.exit(1)
        }
        setProjectOverride(p)
    }
})

await vein.parseAsync()
