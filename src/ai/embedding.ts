import { logger } from '../config'
import type { ModelProvider } from '../config/type'

const log = logger.child({ module: 'embedding' })

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'

/**
 * Generate an embedding vector for a given text using OpenRouter's embeddings API.
 *
 * Requires OPENROUTER_API_KEY environment variable.
 */
async function generateEmbedding(
    text: string,
    embeddingProvider: ModelProvider
): Promise<number[]> {
    const results = await generateEmbeddings([text], embeddingProvider)
    return results[0]!
}

/**
 * Batch generate embeddings for multiple texts in a single API call.
 */
async function generateEmbeddings(
    texts: string[],
    embeddingProvider: ModelProvider
): Promise<number[][]> {
    if (texts.length === 0) return []

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
        throw new Error(
            'OPENROUTER_API_KEY environment variable is not set. ' +
                'Set it to use tag embedding features.'
        )
    }

    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: embeddingProvider.model,
            input: texts,
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        log.error({
            status: response.status,
            error,
            model: embeddingProvider.model,
            content: 'Embedding API request failed',
        })
        throw new Error(`Embedding API error ${response.status}: ${error}`)
    }

    const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>
    }

    const embeddings = data.data?.map((d) => d.embedding) ?? []
    if (embeddings.length === 0 || embeddings.some((e) => e.length === 0)) {
        throw new Error('Empty embedding returned from API')
    }

    log.info({
        model: embeddingProvider.model,
        count: embeddings.length,
        dims: embeddings[0]?.length,
        content: 'Batch embeddings generated',
    })
    return embeddings
}

export { generateEmbedding, generateEmbeddings }
