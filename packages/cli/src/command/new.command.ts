import path from 'node:path'
import process from 'node:process'
import {
    autocomplete,
    note,
    outro,
    select,
    spinner,
    text,
} from '@clack/prompts'
import type { ModelProvider } from '@vein/core'
import {
    getProjectRoot,
    initProject,
    listModels,
    listProviders,
    loadProjectConfig,
    logger,
    registerProject,
    setModelProvider,
} from '@vein/core'
import type { Command } from 'commander'

const log = logger.child({ module: 'new' })

export function register(program: Command) {
    program
        .command('new')
        .description('initialize a vein project in the current directory')
        .argument('[name]', 'project name')
        .option('--migrate', 're-run migrations on an existing project')
        .action(async (name?: string, options?: { migrate?: boolean }) => {
            const cwd = process.cwd()
            const root = getProjectRoot(cwd)

            if (options?.migrate && root) {
                const config = await loadProjectConfig(root)
                const dbPath = path.join(root, config?.db ?? '.vein/data.db')
                const { runMigrations } = await import('@vein/core')
                await runMigrations(dbPath)
                log.info({ dbPath, content: 'Migrations re-run' })
                outro('Migrations applied')
                return
            }

            let projectName = name
            if (!projectName) {
                const defaultName = path.basename(cwd)
                const raw = await text({
                    message: 'Project name:',
                    placeholder: defaultName,
                    defaultValue: defaultName,
                })
                if (typeof raw !== 'string') {
                    outro('Cancelled')
                    return
                }
                projectName = raw
            }

            const providers = await listProviders()
            const rawProvider = await select({
                message: 'Default AI provider:',
                options: providers.map((p) => ({
                    value: p as string,
                    label: p,
                })),
            })
            if (typeof rawProvider !== 'string') {
                outro('Cancelled')
                return
            }
            const provider = rawProvider as ModelProvider['provider']

            const providerModels = listModels(provider)
            const modelOptions = providerModels.map((m) => ({
                value: m.id,
                label: `${m.id} (${m.name})`,
            }))
            const defaultModel = providerModels[0]?.id

            const rawModel = await autocomplete({
                message: 'Default model:',
                placeholder: defaultModel ?? 'model-name',
                options: modelOptions,
                initialValue: defaultModel,
            })
            if (typeof rawModel !== 'string') {
                outro('Cancelled')
                return
            }

            const initSpinner = spinner()
            initSpinner.start('Initializing project...')
            try {
                const config = await initProject(cwd, projectName, {
                    provider,
                    model: rawModel,
                })
                setModelProvider(config.model)
                await registerProject(config.name, cwd)
                initSpinner.stop('Initialized')
                log.info({
                    name: projectName,
                    cwd,
                    content: 'Project initialized',
                })
                note('Created .vein/')
                outro(`Project "${config.name}" initialized`)
            } catch (err) {
                initSpinner.stop('Failed')
                if (
                    err instanceof Error &&
                    err.message.startsWith('already initialized')
                ) {
                    outro(err.message)
                    process.exit(1)
                }
                throw err
            }
        })
}
