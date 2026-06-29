import process from 'node:process'
import { getErrorMessage, modelKey } from '@vein/core'

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

/**
 * Colorize doc references ([docId] and [docId:nodeId]) with ANSI blue underline.
 * Matches the web's visual cue that these are clickable references.
 */
function colorizeDocRefs(text: string): string {
    if (!process.stdout.isTTY) return text
    let result = text
    // Node refs: [hex:digits]
    result = result.replace(
        /\[([a-f0-9]{8,}):(\d{2,5})\]/g,
        (match) => `\x1b[34m\x1b[4m${match}\x1b[0m`
    )
    // Doc refs: [hex] (not followed by '(' to avoid matching markdown links)
    result = result.replace(
        /\[([a-f0-9]{8,})\](?!\()/g,
        (match) => `\x1b[34m\x1b[4m${match}\x1b[0m`
    )
    return result
}

export {
    colorize,
    colorizeDocRefs,
    formatDuration,
    getErrorMessage,
    modelKey,
    pluralize,
    VERDICT_COLOR,
    VERDICT_ICON,
}
