import { autocomplete, intro, note, outro, select, text } from '@clack/prompts'
import { getModels, getProviders } from '@earendil-works/pi-ai'
import type { Command } from 'commander'
import { setModelProvider } from '../ai/index'
import {
    loadProjectConfig,
    resolveProjectRoot,
    saveProjectConfig,
} from '../config'
import type { ModelProvider, ProjectConfig } from '../config/type'

const formatMd = (md?: ModelProvider) =>
    md ? `${md.provider}/${md.model}` : '(unset)'

function display(c: ProjectConfig): string {
    return [
        `Project:  ${c.name}`,
        `Model:    ${formatMd(c.model)}`,
        `Summarizer: ${formatMd(c.summarizer)}`,
        `Segmenter:  ${formatMd(c.segmenter)}`,
        `Embedding:  ${c.embedding ? `openrouter/${c.embedding.model}` : '(unset)'}`,
        `SQLite:   ${c.sqliteLibPath ?? '(auto)'}`,
    ].join('\n')
}

async function pickModel(
    label: string,
    current?: ModelProvider,
    hint?: string
): Promise<ModelProvider | undefined> {
    const action = await select({
        message: `${label} (current: ${formatMd(current)})`,
        options: [
            {
                value: 'change',
                label: 'Change',
                hint: hint ?? 'pick a new model',
            },
            { value: 'remove', label: 'Remove', hint: 'clear this setting' },
            { value: 'keep', label: 'Keep as-is' },
        ],
    })
    if (action === 'keep' || typeof action !== 'string') return current
    if (action === 'remove') return undefined

    const provider = (await select({
        message: 'Provider:',
        options: getProviders().map((p) => ({
            value: p as string,
            label: p,
        })),
    })) as ModelProvider['provider'] | symbol
    if (typeof provider !== 'string') return current

    const models = getModels(provider)
    const initialValue =
        current?.provider === provider ? current.model : models[0]?.id
    const model = await autocomplete({
        message: 'Model:',
        options: models.map((m) => ({
            value: m.id,
            label: `${m.id} (${m.name})`,
        })),
        initialValue,
    })
    if (typeof model !== 'string') return current

    return { provider, model } as ModelProvider
}

export function register(program: Command) {
    program
        .command('config')
        .description('interactively view and modify project configuration')
        .action(async () => {
            const root = resolveProjectRoot()
            if (!root) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }
            let config = await loadProjectConfig(root)
            if (!config) {
                outro('No config found. Run "vein new" first.')
                return
            }

            while (true) {
                intro('Vein Configuration')
                note(display(config))

                const choice = await select({
                    message: 'What would you like to change?',
                    options: [
                        {
                            value: 'model',
                            label: 'Model',
                            hint: formatMd(config.model),
                        },
                        {
                            value: 'summarizer',
                            label: 'Summarizer',
                            hint: formatMd(config.summarizer),
                        },
                        {
                            value: 'segmenter',
                            label: 'Segmenter',
                            hint: formatMd(config.segmenter),
                        },
                        {
                            value: 'embedding',
                            label: 'Embedding',
                            hint: config.embedding
                                ? config.embedding.model
                                : '(unset)',
                        },
                        {
                            value: 'sqlite',
                            label: 'SQLite lib path',
                            hint: config.sqliteLibPath ?? '(auto)',
                        },
                        { value: 'done', label: 'Done — save and exit' },
                    ],
                })

                if (choice === 'done' || typeof choice !== 'string') break

                switch (choice) {
                    case 'model': {
                        const md = await pickModel('Model', config.model)
                        if (md) config = { ...config, model: md }
                        break
                    }
                    case 'summarizer': {
                        const md = await pickModel(
                            'Summarizer',
                            config.summarizer,
                            'defaults to Model if unset'
                        )
                        config = { ...config, summarizer: md }
                        break
                    }
                    case 'segmenter': {
                        const md = await pickModel(
                            'Segmenter',
                            config.segmenter,
                            'defaults to Model if unset'
                        )
                        config = { ...config, segmenter: md }
                        break
                    }
                    case 'embedding': {
                        const embAction = await select({
                            message: `Embedding (current: ${config.embedding?.model ?? 'unset'})`,
                            options: [
                                {
                                    value: 'change',
                                    label: 'Change model',
                                    hint: 'enter OpenRouter model ID',
                                },
                                {
                                    value: 'remove',
                                    label: 'Remove',
                                    hint: 'disable embedding',
                                },
                                { value: 'keep', label: 'Keep as-is' },
                            ],
                        })
                        if (embAction === 'change') {
                            const embModel = await text({
                                message:
                                    'Embedding model (OpenRouter model ID):',
                                placeholder: 'openai/text-embedding-3-small',
                                defaultValue:
                                    config.embedding?.model ??
                                    'openai/text-embedding-3-small',
                            })
                            if (
                                typeof embModel === 'string' &&
                                embModel.trim()
                            ) {
                                config = {
                                    ...config,
                                    embedding: {
                                        provider: 'openrouter',
                                        model: embModel.trim(),
                                    },
                                }
                            }
                        } else if (embAction === 'remove') {
                            config = { ...config, embedding: undefined }
                        }
                        break
                    }
                    case 'sqlite': {
                        const libPath = await text({
                            message: 'SQLite library path:',
                            placeholder:
                                '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',
                            defaultValue: config.sqliteLibPath ?? '',
                        })
                        if (typeof libPath === 'string') {
                            config = {
                                ...config,
                                sqliteLibPath: libPath.trim() || undefined,
                            }
                        }
                        break
                    }
                }

                // Save after each change so we don't lose progress
                await saveProjectConfig(root, config)

                if (choice === 'model' && config.model) {
                    setModelProvider(config.model)
                }
            }

            await saveProjectConfig(root, config)
            outro('Configuration saved')
        })
}
