/** biome-ignore-all lint/suspicious/noExplicitAny: tools use dynamic args */
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'

export type ToolCtx = {
    cached: (key: string, fn: () => Promise<string>) => Promise<string>
    ok: (s: string) => AgentToolResult<any>
    tool: (fn: AgentTool['execute']) => AgentTool['execute']
    /** Progress callback for surfacing subagent steps to the user. */
    onStep?: (label: string) => void
}

/**
 * Per-tool metadata for progress display, logging, and tracing.
 * Each tool definition exports its own meta; the central registry
 * collects them so consumers can look up by tool name.
 */
export type ToolMeta = {
    /** Human-readable label when a tool call starts. */
    stepLabel: (args: Record<string, unknown>) => string
    /** Human-readable label when a tool call completes (undefined = no label). */
    resultLabel: (resultText: string) => string | undefined
    /** Compact one-line summary for trace entries. */
    resultSummary: (raw: string) => string
    /** Detail string (e.g. docId) for structured log entries. */
    logDetail: (args: Record<string, unknown>) => string
}
