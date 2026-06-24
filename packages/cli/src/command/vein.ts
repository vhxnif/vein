#!/usr/bin/env node
import process from 'node:process'
import { getProjectPath, setProjectOverride } from '@vein/core'
import { Command } from 'commander'
import { register as registerAsk } from './ask.command.ts'
import { register as registerBrowse } from './browse.command.ts'
import { register as registerConfig } from './config.command.ts'
import { register as registerHistory } from './history.command.ts'
import { register as registerMarkdown } from './markdown.command.ts'
import { register as registerNew } from './new.command.ts'
import { register as registerProjects } from './projects.command.ts'
import { register as registerWeb } from './web.command.ts'

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
registerWeb(vein)
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
