import { useEffect, useMemo, useState } from 'react'
import { annotateNodeRefs, Markdown } from './Markdown.tsx'

// ── Braille spinner (classic single-char) ────────────────────

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function BrailleSpinner({
    className = 'text-[10pt]',
}: {
    className?: string
}) {
    const [frame, setFrame] = useState(0)

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame((f) => (f + 1) % BRAILLE_FRAMES.length)
        }, 120)
        return () => clearInterval(timer)
    }, [])

    return (
        <span
            className={`inline-flex flex-shrink-0 leading-none ${className}`}
            aria-hidden="true"
        >
            {BRAILLE_FRAMES[frame]}
        </span>
    )
}

// ── Shared block type (compatible with both live & history) ──

export interface TimelineToolBlock {
    type: 'tool'
    label?: string
    name?: string
    summary?: string
    status?: 'running' | 'done'
}

export interface TimelineTextBlock {
    type: 'text'
    text?: string
}

export interface TimelineThinkingBlock {
    type: 'thinking'
    text?: string
}

export type SharedTimelineBlock =
    | TimelineToolBlock
    | TimelineThinkingBlock
    | TimelineTextBlock

// ── Component ────────────────────────────────────────────────

export function TimelineBlockView({
    block,
    docIdMap,
}: {
    block: SharedTimelineBlock
    docIdMap?: Map<string, string>
}) {
    const annotatedText = useMemo(() => {
        const raw =
            block.type === 'text' || block.type === 'thinking'
                ? (block.text ?? '')
                : ''
        if (!raw || !docIdMap) return raw
        return annotateNodeRefs(raw, docIdMap)
    }, [block, docIdMap])

    if (block.type === 'thinking') {
        return (
            <div className="my-2 italic text-stone/70">
                <Markdown docIdMap={docIdMap}>{annotatedText}</Markdown>
            </div>
        )
    }

    if (block.type === 'tool') {
        const isRunning = block.status === 'running'
        return (
            <div
                className={`my-1.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[8pt] font-mono max-w-full bg-ivory text-stone ${
                    isRunning ? 'border-cream' : 'border-ink/30'
                }`}
            >
                {isRunning && <BrailleSpinner />}
                <span className="truncate">
                    {block.label ?? block.name ?? ''}
                </span>
                {!isRunning && block.summary && (
                    <span className="text-stone/60 truncate">
                        → {block.summary}
                    </span>
                )}
            </div>
        )
    }

    if (block.type === 'text') {
        return <Markdown docIdMap={docIdMap}>{annotatedText}</Markdown>
    }

    return null
}
