import type { KnownProvider } from '@earendil-works/pi-ai'

export type ModelProvider = {
    provider: KnownProvider
    model: string
}

export type ProjectConfig = {
    $schema?: string
    name: string
    db: string
    model: ModelProvider
    summarizer?: ModelProvider
    /** Optional faster/cheaper model for Chinese word segmentation. Falls back to 'model' if not set. */
    segmenter?: ModelProvider
}
