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
    /**
     * Path to a custom libsqlite3 shared library (for loading sqlite-vec on macOS).
     * Set via env var VEIN_SQLITE_LIB_PATH, or configure here for reference.
     * Example: /opt/homebrew/opt/sqlite/lib/libsqlite3.dylib
     */
    sqliteLibPath?: string
}
