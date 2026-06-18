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
    /** Optional model for Chinese word segmentation. Falls back to 'model' if not set. */
    segmenter?: ModelProvider
    /** Optional model for the Document Analyzer subagent. Falls back to 'model' if not set. */
    subagent?: ModelProvider
    /** Optional model for the result reviewer. Falls back to 'model' if not set. */
    reviewer?: ModelProvider
    /** Optional model for the Search Screener subagent. Falls back to 'model' if not set. */
    searchAgent?: ModelProvider
    /** Optional thinking/reasoning level for the main agent. Defaults to 'off' (no thinking). Set to 'high' or 'xhigh' to enable. */
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}
