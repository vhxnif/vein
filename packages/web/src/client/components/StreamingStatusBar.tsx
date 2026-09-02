import { useSearch } from '../lib/search-context.tsx'
import { useLocation } from '@tanstack/react-router'
import { RunCat } from './RunCat.tsx'

/**
 * Streaming status bar — rendered in Layout below <main>.
 * The Ask page renders its own status row above the input, so this is
 * skipped there to avoid a duplicate RunCat + divider at the screen bottom.
 */
export function StreamingStatusBar() {
    const { searching, elapsed, timeline } = useSearch()
    const { pathname } = useLocation()

    if (!searching || pathname === '/') return null

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
