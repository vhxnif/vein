import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'

function expandTilde(path: string): string {
    if (path.startsWith('~/')) return join(homedir(), path.slice(2))
    return path
}

const authCtx = {
    env: async (name: string) => process.env[name],
    fileExists: async (path: string) => existsSync(expandTilde(path)),
}

/**
 * Check whether a provider has detectable credentials in the environment.
 * Uses the provider's own auth resolution, so it stays in sync with pi-ai.
 */
export async function isProviderConfigured(provider: string): Promise<boolean> {
    const p = builtinProviders().find((p) => p.id === provider)
    if (!p?.auth.apiKey?.resolve) return false
    try {
        const result = await p.auth.apiKey.resolve({
            ctx: authCtx,
            credential: undefined,
        })
        return result !== undefined
    } catch {
        return false
    }
}
