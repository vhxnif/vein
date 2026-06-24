/** biome-ignore-all lint/suspicious/noExplicitAny: tools use dynamic args */
import {
    complete,
    getModel,
    getModels,
    getProviders,
    type Message,
    type Tool,
} from '@earendil-works/pi-ai'
import { logger } from '../config/index.ts'
import type { ModelProvider } from '../config/type.ts'

export type ToolDef = Tool & {
    run: (args: any) => Promise<string>
}

export type ContextDef = {
    messages: Message[]
    tools?: ToolDef[]
    systemPrompt?: string
    onToolCall?: (name: string, args: Record<string, unknown>) => void
    /** Optional model override. Uses the global model provider if not set. */
    model?: ReturnType<typeof getModel>
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

export function getModelProvider(): ModelProvider {
    return { ...modelProvider }
}

export function getModelKey(): string {
    return `${modelProvider.provider}/${modelProvider.model}`
}

async function call(context: ContextDef) {
    log.debug({
        sysPromptLen: context.systemPrompt?.length ?? 0,
        toolCount: context.tools?.length ?? 0,
        content: 'AI call start',
    })
    while (true) {
        log.debug({
            msgCount: context.messages.length,
            content: 'Sending messages',
        })
        const msg = await complete(context.model ?? getCurrentModel(), context)
        log.debug({
            role: msg.role,
            textLen: msg.content
                .filter((it) => it.type === 'text')
                .map((it) => it.text)
                .join('').length,
            toolCallCount: msg.content.filter((it) => it.type === 'toolCall')
                .length,
            content: 'AI response',
        })
        context.messages.push(msg)
        const toolCalls = msg.content.filter((it) => it.type === 'toolCall')
        if (toolCalls.length <= 0) {
            return msg
        }
        // Execute tool calls in parallel when multiple are present
        const results = await Promise.all(
            toolCalls.map(async (tool) => {
                context.onToolCall?.(
                    tool.name,
                    tool.arguments as Record<string, unknown>
                )
                const result = await context.tools
                    ?.find((it) => it.name === tool.name)
                    ?.run(tool.arguments)
                log.debug({
                    toolName: tool.name,
                    resultLen: result?.length ?? 0,
                    content: 'Tool executed',
                })
                return { tool, result }
            })
        )
        for (const { tool, result } of results) {
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

/** List available AI providers. */
export function listProviders(): string[] {
    return getProviders() as string[]
}

/** List available models for a given provider. */
export function listModels(provider: string): { id: string; name: string }[] {
    return getModels(provider as never).map((m) => ({
        id: m.id,
        name: m.name,
    }))
}

export { call, createSummarizer }
