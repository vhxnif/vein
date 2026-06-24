import { autocomplete, intro, note, outro, select, text } from '@clack/prompts'
import type { ModelProvider, ProjectConfig } from '@vein/core'
import {
    listModels,
    listProviders,
    loadProjectConfig,
    resolveProjectRoot,
    saveProjectConfig,
    setModelProvider,
} from '@vein/core'
import type { Command } from 'commander'

const formatMd = (md?: ModelProvider) =>
    md ? `${md.provider}/${md.model}` : '(unset)'

function display(c: ProjectConfig): string {
    return [
        `Project:  ${c.name}`,
        `Model:    ${formatMd(c.model)}`,
        `Summarizer: ${formatMd(c.summarizer)}`,
        `Segmenter:  ${formatMd(c.segmenter)}`,
        `Subagent:   ${formatMd(c.subagent)}`,
        `Reviewer:   ${formatMd(c.reviewer)}`,
        `Search:     ${formatMd(c.searchAgent)}`,
        `Thinking:  ${c.thinkingLevel ?? 'off'}`,
        `Max Full:  ${c.maxAnalyzeResultFull ?? 15} (docs)`,
        `Parallel:  ${c.maxParallelAnalyze ?? 10}`,
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
        options: listProviders().map((p) => ({
            value: p as string,
            label: p,
        })),
    })) as ModelProvider['provider'] | symbol
    if (typeof provider !== 'string') return current

    const models = listModels(provider)
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
                            value: 'subagent',
                            label: 'Subagent',
                            hint: formatMd(config.subagent),
                        },
                        {
                            value: 'reviewer',
                            label: 'Reviewer',
                            hint: formatMd(config.reviewer),
                        },
                        {
                            value: 'searchAgent',
                            label: 'Search Screener',
                            hint: formatMd(config.searchAgent),
                        },
                        {
                            value: 'thinkingLevel',
                            label: 'Thinking Level',
                            hint: config.thinkingLevel ?? 'off',
                        },
                        {
                            value: 'maxAnalyzeResultFull',
                            label: 'Max Full Results',
                            hint: `${config.maxAnalyzeResultFull ?? 15} docs kept uncompressed`,
                        },
                        {
                            value: 'maxParallelAnalyze',
                            label: 'Max Parallel Analyze',
                            hint: `${config.maxParallelAnalyze ?? 10} concurrent calls`,
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
                    case 'subagent': {
                        const md = await pickModel(
                            'Subagent',
                            config.subagent,
                            'defaults to Model if unset'
                        )
                        config = { ...config, subagent: md }
                        break
                    }
                    case 'reviewer': {
                        const md = await pickModel(
                            'Reviewer',
                            config.reviewer,
                            'defaults to Model if unset'
                        )
                        config = { ...config, reviewer: md }
                        break
                    }
                    case 'searchAgent': {
                        const md = await pickModel(
                            'Search Screener',
                            config.searchAgent,
                            'defaults to Model if unset'
                        )
                        config = { ...config, searchAgent: md }
                        break
                    }
                    case 'thinkingLevel': {
                        const level: string | symbol = await select({
                            message: `Thinking level (current: ${config.thinkingLevel ?? 'off'})`,
                            options: [
                                {
                                    value: 'off',
                                    label: 'off',
                                    hint: 'no reasoning',
                                },
                                { value: 'minimal', label: 'minimal' },
                                { value: 'low', label: 'low' },
                                { value: 'medium', label: 'medium' },
                                { value: 'high', label: 'high' },
                                { value: 'xhigh', label: 'xhigh' },
                            ],
                        })
                        if (typeof level === 'string') {
                            config = {
                                ...config,
                                thinkingLevel:
                                    level === 'off'
                                        ? undefined
                                        : (level as ProjectConfig['thinkingLevel']),
                            }
                        }
                        break
                    }
                    case 'maxAnalyzeResultFull': {
                        const raw = await text({
                            message: `Max full analyze results (current: ${config.maxAnalyzeResultFull ?? 15})`,
                            placeholder: '15',
                            validate: (v) => {
                                if (!v) return
                                const n = Number(v)
                                if (!Number.isInteger(n) || n < 1 || n > 50)
                                    return 'Must be an integer between 1 and 50'
                            },
                        })
                        if (typeof raw === 'string') {
                            const n = Number(raw)
                            config = {
                                ...config,
                                maxAnalyzeResultFull: n === 15 ? undefined : n,
                            }
                        }
                        break
                    }
                    case 'maxParallelAnalyze': {
                        const raw = await text({
                            message: `Max parallel analyze calls (current: ${config.maxParallelAnalyze ?? 10})`,
                            placeholder: '10',
                            validate: (v) => {
                                if (!v) return
                                const n = Number(v)
                                if (!Number.isInteger(n) || n < 1 || n > 30)
                                    return 'Must be an integer between 1 and 30'
                            },
                        })
                        if (typeof raw === 'string') {
                            const n = Number(raw)
                            config = {
                                ...config,
                                maxParallelAnalyze: n === 10 ? undefined : n,
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
