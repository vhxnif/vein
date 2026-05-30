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
    embedding?: ModelProvider
}
