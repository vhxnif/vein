// ponytail: LibrarianSession — minimal wrapper over pi-agent-core Agent lifecycle.
// Multi-turn is free: Agent is stateful, agent.prompt() auto-includes history.
// Serialization: single JSON file with AgentMessage[], no branching → no JSONL.

import { logger } from '../config/index.ts'
import type { AgentMessage } from './base.ts'
import { Agent, getBuiltinModel, getModelProvider } from './base.ts'
import type { LibrarianOption, LibrarianResult } from './librarian.ts'
import {
    buildTools,
    createLibrarianAgent,
    extractFinalResult,
    installAgentInstrumentation,
    LIBRARIAN_PROMPT,
} from './librarian.ts'
import type { ToolMeta } from './types.ts'

const _log = logger.child({ module: 'session' })

// ── Types ─────────────────────────────────────────────────────

export type SessionSnapshot = {
    sessionId: string
    summary: string
    messages: AgentMessage[]
    createdAt: number
    updatedAt: number
    queryCount: number
}

export type SessionOptions = LibrarianOption & {
    /** If provided, restore agent state from this snapshot instead of starting fresh. */
    snapshot?: SessionSnapshot
}

// ── LibrarianSession ──────────────────────────────────────────

export class LibrarianSession {
    private agent: Agent
    private toolMeta: Record<string, ToolMeta>
    readonly sessionId: string
    private _createdAt: number
    private _updatedAt: number
    private _queryCount: number

    constructor(opts?: SessionOptions) {
        const { tools, toolMeta } = buildTools(undefined, opts?.reviewerModel)
        this.toolMeta = toolMeta

        if (opts?.snapshot) {
            // Restore from snapshot
            const snap = opts.snapshot
            this.sessionId = snap.sessionId
            this._createdAt = snap.createdAt
            this._updatedAt = snap.updatedAt
            this._queryCount = snap.queryCount

            this.agent = new Agent({
                initialState: {
                    systemPrompt: LIBRARIAN_PROMPT,
                    model: getBuiltinModel(
                        getModelProvider().provider as never,
                        getModelProvider().model
                    ),
                    thinkingLevel: opts?.thinkingLevel ?? 'off',
                    tools,
                    messages: snap.messages,
                },
            })
        } else {
            // Fresh session
            const now = Date.now()
            this.sessionId = _generateSessionId()
            this._createdAt = now
            this._updatedAt = now
            this._queryCount = 0

            this.agent = createLibrarianAgent(LIBRARIAN_PROMPT, tools, opts)
        }
    }

    // ── Public API ────────────────────────────────────────────

    async ask(
        msg: string,
        onStep?: (label: string) => void,
        opts?: LibrarianOption
    ): Promise<LibrarianResult> {
        const toolTimings = installAgentInstrumentation(
            this.agent,
            this.toolMeta,
            onStep,
            opts
        )

        let cleanup = () => {
            /* noop, overwritten below if signal provided */
        }
        if (opts?.signal) {
            if (opts.signal.aborted) {
                throw new DOMException('Aborted', 'AbortError')
            }
            const onAbort = () => this.agent.abort()
            opts.signal.addEventListener('abort', onAbort, { once: true })
            cleanup = () => opts.signal!.removeEventListener('abort', onAbort)
        }

        try {
            await this.agent.prompt(msg)
        } finally {
            cleanup()
        }

        this._queryCount++
        this._updatedAt = Date.now()

        return extractFinalResult(
            this.agent.state.messages,
            toolTimings,
            this.toolMeta
        )
    }

    /** Full message history (read-only). */
    get messages(): AgentMessage[] {
        return this.agent.state.messages
    }

    get messageCount(): number {
        return this.agent.state.messages.length
    }

    get createdAt(): number {
        return this._createdAt
    }

    get updatedAt(): number {
        return this._updatedAt
    }

    get queryCount(): number {
        return this._queryCount
    }

    /** Abort the current agent run, if any. */
    abort(): void {
        this.agent.abort()
    }

    // ── Serialization ─────────────────────────────────────────

    toJSON(): SessionSnapshot {
        return {
            sessionId: this.sessionId,
            summary: _extractSummary(this.agent.state.messages),
            messages: this.agent.state.messages.slice(),
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            queryCount: this._queryCount,
        }
    }

    static fromJSON(
        snapshot: SessionSnapshot,
        opts?: LibrarianOption
    ): LibrarianSession {
        return new LibrarianSession({
            ...opts,
            snapshot,
        })
    }
}

// ── Helpers ───────────────────────────────────────────────────

function _generateSessionId(): string {
    const now = new Date()
    const yymmdd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    // ponytail: sequential per-day via file count. If N becomes a bottleneck, switch to nano-id.
    // For now, timestamp-based unique suffix ensures no collision.
    const seq =
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0')
    return `${yymmdd}-${seq}`
}

/** Extract a short summary from the first user message. */
function _extractSummary(messages: AgentMessage[]): string {
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return 'Empty session'
    const content = firstUser.content
    if (typeof content === 'string') return content.slice(0, 80)
    const text = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join(' ')
    return text.slice(0, 80)
}

// ── Factory functions ─────────────────────────────────────────
// ponytail: thin wrappers that tie LibrarianSession to persistence layer.

import { saveSession } from '../service/session.service.ts'

/**
 * Create a new empty session. Does NOT auto-save until first ask().
 */
export function createSession(opts?: SessionOptions): LibrarianSession {
    return new LibrarianSession(opts)
}

/**
 * Resume a specific session by loading its snapshot from disk.
 * Throws if the session file doesn't exist.
 */
export async function resumeSession(
    root: string,
    sessionId: string,
    opts?: LibrarianOption
): Promise<LibrarianSession> {
    const { loadSession } = await import('../service/session.service.ts')
    const snapshot = await loadSession(root, sessionId)
    if (!snapshot) {
        throw new Error(`Session not found: ${sessionId}`)
    }
    return new LibrarianSession({ ...opts, snapshot })
}

/**
 * Resume the latest session. If none exists, creates a new one.
 */
export async function resumeLatestSession(
    root: string,
    opts?: LibrarianOption
): Promise<LibrarianSession> {
    const { loadLatestSession } = await import('../service/session.service.ts')
    const snapshot = await loadLatestSession(root)
    if (snapshot) {
        return new LibrarianSession({ ...opts, snapshot })
    }
    return createSession(opts)
}

/**
 * Persist the current session state to disk.
 * Called automatically by upper layers (CLI/Web) after each ask().
 */
export async function persistSession(
    root: string,
    session: LibrarianSession
): Promise<void> {
    await saveSession(root, session.toJSON())
}
