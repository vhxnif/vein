/** biome-ignore-all lint/suspicious/noExplicitAny: tools use dynamic args */
import {
    complete,
    getModel,
    type Message,
    type Tool,
} from '@earendil-works/pi-ai'
import { logger } from '../config'
import type { ModelProvider } from '../config/type'

export type ToolDef = Tool & {
    run: (args: any) => Promise<string>
}

export type ContextDef = {
    messages: Message[]
    tools?: ToolDef[]
    systemPrompt?: string
    onToolCall?: (name: string, args: Record<string, unknown>) => void
}

const log = logger.child({ module: 'ai' })

let modelProvider: ModelProvider = {
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
}
let _model: ReturnType<typeof getModel> | null = null

function getCurrentModel() {
    if (!_model) {
        _model = getModel(
            modelProvider.provider as any,
            modelProvider.model as any
        )
    }
    return _model
}

export function setModelProvider(provider: ModelProvider) {
    modelProvider = provider
    _model = null
}

export function getModelKey(): string {
    return `${modelProvider.provider}/${modelProvider.model}`
}

async function call(context: ContextDef) {
    log.info({ sysPrompt: context.systemPrompt })
    log.info({ tools: context.tools })
    while (true) {
        log.info({ messages: context.messages })
        const msg = await complete(getCurrentModel(), context)
        log.info({ result: msg })
        context.messages.push(msg)
        const toolCalls = msg.content.filter((it) => it.type === 'toolCall')
        if (toolCalls.length <= 0) {
            return msg
        }
        for (const tool of toolCalls) {
            context.onToolCall?.(
                tool.name,
                tool.arguments as Record<string, unknown>
            )
            const result = await context.tools
                ?.find((it) => it.name === tool.name)
                ?.run(tool.arguments)
            log.info({ toolCall: tool, toolCallResult: result })
            if (result) {
                context.messages.push({
                    role: 'toolResult',
                    toolCallId: tool.id,
                    toolName: tool.name,
                    content: [{ text: result, type: 'text' }],
                    isError: false,
                    timestamp: Date.now(),
                })
            }
        }
    }
}

function createSummarizer(provider?: ModelProvider) {
    return async (prompt: string): Promise<string> => {
        const model = provider
            ? getModel(provider.provider as any, provider.model as any)
            : getCurrentModel()
        const msg = await complete(model, {
            messages: [
                { role: 'user', content: prompt, timestamp: Date.now() },
            ],
        })
        return msg.content.findLast((it) => it.type === 'text')?.text ?? ''
    }
}

export { call, createSummarizer }
