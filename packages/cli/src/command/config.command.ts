import { autocomplete, intro, note, outro, select } from '@clack/prompts'
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
        `Reviewer:   ${formatMd(c.reviewer)}`,
        `Thinking:  ${c.thinkingLevel ?? 'off'}`,
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

    const providers = await listProviders()
    const provider = (await select({
        message: 'Provider:',
        options: providers.map((p) => ({
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
            const config = await loadProjectConfig(root)
            if (!config) {
                outro('No config found. Run "vein new" first.')
                return
            }

            let current = { ...config }

            while (true) {
                intro('Vein Configuration')
                note(display(current))

                const choice = await select({
                    message: 'What would you like to change?',
                    options: [
                        {
                            value: 'model',
                            label: 'Model',
                            hint: formatMd(current.model),
                        },
                        {
                            value: 'summarizer',
                            label: 'Summarizer',
                            hint: formatMd(current.summarizer),
                        },
                        {
                            value: 'segmenter',
                            label: 'Segmenter',
                            hint: formatMd(current.segmenter),
                        },
                        {
                            value: 'reviewer',
                            label: 'Reviewer',
                            hint: formatMd(current.reviewer),
                        },
                        {
                            value: 'thinkingLevel',
                            label: 'Thinking Level',
                            hint: current.thinkingLevel ?? 'off',
                        },
                        { value: 'done', label: 'Done — save and exit' },
                    ],
                })

                if (choice === 'done' || typeof choice !== 'string') break

                switch (choice) {
                    case 'model': {
                        const md = await pickModel('Model', current.model)
                        if (md) current = { ...current, model: md }
                        break
                    }
                    case 'summarizer': {
                        const md = await pickModel(
                            'Summarizer',
                            current.summarizer,
                            'defaults to Model if unset'
                        )
                        current = { ...current, summarizer: md }
                        break
                    }
                    case 'segmenter': {
                        const md = await pickModel(
                            'Segmenter',
                            current.segmenter,
                            'defaults to Model if unset'
                        )
                        current = { ...current, segmenter: md }
                        break
                    }
                    case 'reviewer': {
                        const md = await pickModel(
                            'Reviewer',
                            current.reviewer,
                            'defaults to Model if unset'
                        )
                        current = { ...current, reviewer: md }
                        break
                    }
                    case 'thinkingLevel': {
                        const level: string | symbol = await select({
                            message: `Thinking level (current: ${current.thinkingLevel ?? 'off'})`,
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
                            current = {
                                ...current,
                                thinkingLevel:
                                    level === 'off'
                                        ? undefined
                                        : (level as ProjectConfig['thinkingLevel']),
                            }
                        }
                        break
                    }
                }

                // Save after each change so we don't lose progress
                await saveProjectConfig(root, current)

                if (choice === 'model' && current.model) {
                    setModelProvider(current.model)
                }
            }

            await saveProjectConfig(root, current)
            outro('Configuration saved')
        })
}
