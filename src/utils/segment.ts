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
 * Long text is split into chunks to avoid LLM truncation.
 * English text passes through mostly unchanged.
 * Results are cached in model_cache by md5(systemPrompt + text).
 */
async function segmentText(
    text: string,
    segmenter?: ModelProvider
): Promise<string> {
    if (!text) return ''

    if (!/[\u4e00-\u9fff]/.test(text)) {
        return text
    }

    const CHUNK_SIZE = 3000
    if (text.length > CHUNK_SIZE) {
        const chunks = splitText(text, CHUNK_SIZE)
        log.info({
            textLen: text.length,
            chunks: chunks.length,
            chunkSizes: chunks.map((c) => c.length),
            content: 'Segmenting in chunks',
        })
        const results = await Promise.all(
            chunks.map((chunk) => segmentChunk(chunk, segmenter))
        )
        const joined = results.join(' ')
        log.info({
            textLen: text.length,
            resultLen: joined.length,
            content: 'Chunk segmentation done',
        })
        return joined
    }

    return segmentChunk(text, segmenter)
}

function splitText(text: string, maxLen: number): string[] {
    const chunks: string[] = []
    const lines = text.split('\n')
    let current = ''

    for (const line of lines) {
        if (current && current.length + line.length + 1 > maxLen) {
            chunks.push(current)
            current = line
        } else {
            current = current ? `${current}\n${line}` : line
        }
    }
    if (current) chunks.push(current)

    return chunks
}

async function segmentChunk(
    text: string,
    segmenter?: ModelProvider
): Promise<string> {
    const systemPrompt = `你是一个中文分词工具。将输入文本按语义切分为词语，用空格分隔后输出。不要添加任何解释、标点或其他内容，只输出分词后的结果。对于英文/数字部分保持原样，仅对中文部分进行分词。

示例输入：人工智能技术正在迅速发展
示例输出：人工智能 技术 正在 迅速 发展`

    const cacheMd5 = md5(systemPrompt + text)
    const cacheModel = segmenter
        ? `${segmenter.provider}/${segmenter.model}`
        : getModelKey()
    const cached = await store.getCachedResponse(cacheMd5, cacheModel)
    if (cached) {
        log.info({
            textLen: text.length,
            resultLen: cached.length,
            cache: 'hit',
            content: 'Segmentation cache hit',
        })
        return cached
    }

    log.info({
        textLen: text.length,
        inputPreview: text.slice(0, 120),
        content: 'Segmenting chunk',
    })

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
    log.info({
        inputLen: text.length,
        resultLen: result.length,
        outputPreview: result.slice(0, 120),
        content: 'Segmentation chunk done',
    })

    return result
}

export { segmentText }
