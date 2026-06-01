/** biome-ignore-all lint/suspicious/noExplicitAny: pi-ai getModel type is strict */
import { complete, getModel } from '@earendil-works/pi-ai'
import { call, getModelKey } from '../ai/base'
import { logger } from '../config'
import type { ModelProvider } from '../config/type'
import * as store from '../store'
import { md5 } from './common'

const log = logger.child({ module: 'segment' })

/**
 * Use LLM to segment Chinese text into words separated by spaces.
 * E.g. "人工智能发展迅速" → "人工智能 发展 迅速".
 * English text passes through mostly unchanged.
 * Results are cached in model_cache by md5(systemPrompt + text).
 *
 * @param segmenter - Optional faster/cheaper model for segmentation.
 *   Falls back to the global model if not set.
 */
async function segmentText(
    text: string,
    segmenter?: ModelProvider
): Promise<string> {
    if (!text) return ''

    const systemPrompt = `你是一个中文分词工具。将输入文本按语义切分为词语，用空格分隔后输出。不要添加任何解释、标点或其他内容，只输出分词后的结果。对于英文/数字部分保持原样，仅对中文部分进行分词。

示例输入：人工智能技术正在迅速发展
示例输出：人工智能 技术 正在 迅速 发展`

    const cacheMd5 = md5(systemPrompt + text)
    const cacheModel = segmenter
        ? `${segmenter.provider}/${segmenter.model}`
        : getModelKey()
    const cached = await store.getCachedResponse(cacheMd5, cacheModel)
    if (cached) {
        return cached
    }

    let result: string
    if (segmenter) {
        const model = getModel(
            segmenter.provider as any,
            segmenter.model as any
        )
        const msg = await complete(model, {
            systemPrompt,
            messages: [{ role: 'user', content: text, timestamp: Date.now() }],
        })
        result =
            msg.content.findLast((it) => it.type === 'text')?.text?.trim() ??
            text
    } else {
        const { content } = await call({
            systemPrompt,
            messages: [{ role: 'user', content: text, timestamp: Date.now() }],
        })
        result =
            content.findLast((it) => it.type === 'text')?.text?.trim() ?? text
    }

    await store.setCachedResponse(cacheMd5, cacheModel, result)
    log.info({ textLen: text.length, content: 'Segmentation cached' })

    return result
}

export { segmentText }
