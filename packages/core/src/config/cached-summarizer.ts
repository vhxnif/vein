import { createSummarizer } from '../ai/base'
import * as store from '../store'
import { md5 } from '../utils/common'
import { logger } from './index'
import type { ModelProvider, ProjectConfig } from './type'

const log = logger.child({ module: 'summarizer' })

function modelKey(provider: ModelProvider): string {
    return `${provider.provider}/${provider.model}`
}

/**
 * Create a summarizer with built-in model_cache caching and 60s timeout.
 * Uses config.summarizer if set, otherwise falls back to config.model.
 */
export function createCachedSummarizer(config: ProjectConfig) {
    const summaryProvider = config.summarizer ?? config.model
    const key = modelKey(summaryProvider)
    const raw = createSummarizer(config.summarizer)

    return async (prompt: string): Promise<string> => {
        const hash = md5(prompt)
        const cached = await store.getCachedResponse(hash, key)
        if (cached) {
            log.debug({ hash, modelKey: key, content: 'Summary cache hit' })
            return cached
        }
        let timer: ReturnType<typeof setTimeout>
        const response = await Promise.race([
            raw(prompt),
            new Promise<never>(
                (_, reject) =>
                    (timer = setTimeout(
                        () => reject(new Error('Summarizer timeout after 60s')),
                        60_000
                    ))
            ),
        ])
        clearTimeout(timer!)
        await store.setCachedResponse(hash, key, response)
        log.debug({ hash, modelKey: key, content: 'Summary cached' })
        return response
    }
}
