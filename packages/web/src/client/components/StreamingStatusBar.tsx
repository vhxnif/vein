import { useSearch } from '../lib/search-context.tsx'
import { RunCat } from './RunCat.tsx'

/**
 * Streaming status bar — rendered in Layout between <main> and <nav>
 * so it's always visible above the tab bar without sticky tricks.
 */
export function StreamingStatusBar() {
    const { searching, elapsed, timeline } = useSearch()

    if (!searching) return null

    const runningCount = timeline.filter(
        (b) => b.type === 'tool' && b.status === 'running'
    ).length

    const lastBlock = timeline.at(-1)
    const statusText =
        timeline.length === 0
            ? 'Searching...'
            : runningCount > 0
              ? `${runningCount} tool${runningCount > 1 ? 's' : ''} running`
              : lastBlock?.type === 'thinking'
                ? 'Thinking...'
                : 'Streaming...'

    const catSize = timeline.length === 0 ? 24 : 16

    return (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-parchment border-t border-cream/30 md:hidden">
            <RunCat size={catSize} />
            <span className="font-sans text-[8pt] text-olive">
                {statusText}
            </span>
            <span className="font-mono text-[8pt] text-stone tabular-nums ml-auto">
                {elapsed.toFixed(1)}s
            </span>
        </div>
    )
}
