import { createSummarizer, setModelProvider } from '@vein/core/ai'
import {
    loadProjectConfig,
    logger,
    resolveProjectRoot,
} from '@vein/core/config'
import type { ProjectConfig } from '@vein/core/config/type'
import * as store from '@vein/core/store'
import { md5 } from '@vein/core/utils/common'
import { modelKey } from '../utils/cli-helpers'

const log = logger.child({ module: 'command-utils' })

async function setupProjectModel(): Promise<ProjectConfig | undefined> {
    const root = resolveProjectRoot()
    if (!root) return
    const config = await loadProjectConfig(root)
    if (config?.model) {
        setModelProvider(config.model)
    }
    return config
}

function createCachedSummarizer(config: ProjectConfig) {
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

export { createCachedSummarizer, setupProjectModel }
