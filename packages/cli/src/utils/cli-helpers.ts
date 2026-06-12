import type { ModelProvider } from '@vein/core/config/type'
import { getErrorMessage } from '@vein/core/utils/common'

function modelKey(provider: ModelProvider): string {
    return `${provider.provider}/${provider.model}`
}

function pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    const mins = Math.floor(ms / 60_000)
    const secs = Math.round((ms % 60_000) / 1000)
    return `${mins}m ${secs}s`
}

const VERDICT_ICON: Record<string, string> = {
    pass: '✓',
    partial: '!',
    fail: '✗',
}

const VERDICT_COLOR: Record<string, string> = {
    pass: '\x1b[32m',
    partial: '\x1b[33m',
    fail: '\x1b[31m',
}

function colorize(text: string, code: string): string {
    return process.stdout.isTTY ? `${code}${text}\x1b[0m` : text
}

export {
    colorize,
    formatDuration,
    getErrorMessage,
    modelKey,
    pluralize,
    VERDICT_COLOR,
    VERDICT_ICON,
}
