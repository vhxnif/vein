import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Markdown } from '../components/Markdown.tsx'
import { fetchDocument, fetchNode } from '../lib/api.ts'
import { useProject } from '../lib/project.tsx'

interface TreeNode {
    nodeId: string
    value: {
        title: string
        summary?: string
        text?: string
        lineNum?: number
    }
    nodes: TreeNode[]
}

// ── Helpers ────────────────────────────────────────────────────

/** Recursively find a node's title in the tree by nodeId */
function findNodeTitle(nodes: TreeNode[], targetId: string): string | null {
    for (const node of nodes) {
        if (node.nodeId === targetId) return node.value.title
        if (node.nodes && node.nodes.length > 0) {
            const found = findNodeTitle(node.nodes, targetId)
            if (found) return found
        }
    }
    return null
}

// ── Skeleton for loading / pending states ──────────────────────

function DocSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="h-4 bg-sand rounded w-16 mb-5" />
            <div className="h-8 bg-sand rounded w-2/5 mb-3" />
            <div className="h-4 bg-sand rounded w-1/4 mb-8" />
            {/* Responsive skeleton: side-by-side on md+, stacked on mobile */}
            <div className="md:flex md:gap-8">
                <div className="md:w-64 md:flex-shrink-0 space-y-2.5 mb-6 md:mb-0">
                    <div className="h-3 bg-sand rounded w-12 mb-2" />
                    {[80, 60, 75, 50, 70, 55].map((w) => (
                        <div
                            key={w}
                            className="h-3 bg-sand rounded"
                            style={{ width: `${w}%` }}
                        />
                    ))}
                </div>
                <div className="flex-1 space-y-3">
                    <div className="h-6 bg-sand rounded w-1/3" />
                    <div className="h-3 bg-sand rounded w-full" />
                    <div className="h-3 bg-sand rounded w-full" />
                    <div className="h-3 bg-sand rounded w-3/4" />
                    <div className="h-3 bg-sand rounded w-1/2" />
                </div>
            </div>
        </div>
    )
}

export const Route = createFileRoute('/docs/$docId')({
    component: DocDetailPage,
    pendingComponent: DocSkeleton,
})

function DocDetailPage() {
    const { docId } = Route.useParams()
    const { project } = useProject()
    const router = useRouter()
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [showDetail, setShowDetail] = useState(false)
    const [outlineOpen, setOutlineOpen] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const handleBack = useCallback(() => {
        if (window.history.length > 1) {
            router.history.back()
        } else {
            router.navigate({ to: '/docs' })
        }
    }, [router])

    // Close outline when a node is selected on mobile
    const handleNodeSelect = useCallback(
        (nodeId: string) => {
            setSelectedNodeId(nodeId)
            if (isMobile) setOutlineOpen(false)
        },
        [isMobile]
    )

    const {
        data: doc,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['document', project, docId],
        queryFn: () => fetchDocument(docId),
    })

    if (!project) {
        return (
            <p className="font-sans text-[9pt] text-stone">
                No project selected — select one from the sidebar
            </p>
        )
    }

    if (isLoading) return <DocSkeleton />

    if (error) {
        return (
            <p className="font-sans text-[9pt] text-error">
                Failed to load document:{' '}
                {error instanceof Error ? error.message : String(error)}
            </p>
        )
    }

    if (!doc) {
        return (
            <p className="font-sans text-[9pt] text-olive">
                Document not found.
            </p>
        )
    }

    const tree = doc.tree as TreeNode[] | undefined
    let extraMeta: Record<string, unknown> = {}
    try {
        const meta = JSON.parse(doc.metadata) as Record<string, unknown>
        const known = ['title', 'sourcePath']
        extraMeta = Object.fromEntries(
            Object.entries(meta).filter(([k]) => !known.includes(k))
        )
    } catch {
        // ignore
    }

    return (
        <>
            {/* ── Mobile sticky nav bar ── */}
            <div className="md:hidden sticky top-0 z-10 -mx-4 px-4 py-2.5 bg-parchment/95 backdrop-blur-sm border-b border-cream/50 flex items-center gap-2">
                <button
                    type="button"
                    className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 -ml-1 text-olive hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
                    onClick={handleBack}
                    aria-label="Back"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <path d="M19 12H5" />
                        <polyline points="12,19 5,12 12,5" />
                    </svg>
                </button>
                <span className="flex-1 font-sans text-[10pt] font-medium text-near-black truncate min-w-0">
                    {doc.title}
                </span>
                <button
                    type="button"
                    className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 -mr-1 text-olive hover:text-ink transition-colors bg-transparent border-none cursor-pointer"
                    onClick={() => setOutlineOpen((o) => !o)}
                    aria-label={outlineOpen ? 'Close outline' : 'Open outline'}
                    aria-expanded={outlineOpen}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>
            </div>

            {/* ── Desktop back link ── */}
            <div className="hidden md:block mb-8">
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-sans text-[9pt] text-olive hover:text-ink transition-colors bg-transparent border-none cursor-pointer p-0"
                    onClick={handleBack}
                >
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="flex-shrink-0"
                    >
                        <path d="M19 12H5" />
                        <polyline points="12,19 5,12 12,5" />
                    </svg>
                    Back to documents
                </button>
            </div>

            {/* ── Title + metadata ── */}
            <div className="mb-6 md:mb-8">
                <h1 className="font-serif text-[18pt] md:text-[20pt] font-medium leading-tight text-near-black">
                    {doc.title}
                </h1>
                <p className="font-sans text-[8.5pt] text-olive mt-2 leading-relaxed flex items-center gap-1.5 flex-wrap">
                    <span>
                        {doc.nodeCount} section{doc.nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.sourcePath || 'unknown'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.createdAt?.slice(0, 10) ?? 'unknown'}</span>
                    <button
                        type="button"
                        className={`inline-flex items-center gap-1 font-sans text-[8.5pt] bg-transparent border-none cursor-pointer transition-colors rounded-[3pt] focus-visible:outline-2 focus-visible:outline-ink ${
                            showDetail
                                ? 'text-ink font-medium'
                                : 'text-stone/50 hover:text-olive'
                        }`}
                        onClick={() => setShowDetail((s) => !s)}
                        aria-label={
                            showDetail ? 'Hide details' : 'Show details'
                        }
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span className="hidden md:inline">
                            {showDetail ? 'Hide detail' : 'Detail'}
                        </span>
                    </button>
                </p>
            </div>

            {/* Document metadata detail — mirrors CLI formatDocDetail */}
            {showDetail && (
                <div className="mb-6 md:mb-8 p-4 bg-ivory ring-warm rounded-[8pt] space-y-1">
                    <p className="font-sans text-[8.5pt] text-olive">
                        <span className="font-medium text-near-black">ID:</span>{' '}
                        {doc.id}
                    </p>
                    <p className="font-sans text-[8.5pt] text-olive">
                        <span className="font-medium text-near-black">
                            ShortID:
                        </span>{' '}
                        {doc.id.slice(0, 8)}...
                    </p>
                    <p className="font-sans text-[8.5pt] text-olive">
                        <span className="font-medium text-near-black">
                            Created:
                        </span>{' '}
                        {doc.createdAt}
                    </p>
                    <p className="font-sans text-[8.5pt] text-olive">
                        <span className="font-medium text-near-black">
                            Nodes:
                        </span>{' '}
                        {doc.nodeCount}
                    </p>
                    {doc.ftsSummary && (
                        <p className="font-sans text-[8.5pt] text-olive">
                            <span className="font-medium text-near-black">
                                FTS:
                            </span>{' '}
                            {doc.ftsSummary.length > 200
                                ? `${doc.ftsSummary.slice(0, 200)}...`
                                : doc.ftsSummary}
                        </p>
                    )}
                    {Object.keys(extraMeta).length > 0 && (
                        <div className="pt-2 mt-2 border-t border-cream/50">
                            <p className="font-sans text-[8pt] font-semibold text-olive uppercase tracking-wide mb-2">
                                Metadata
                            </p>
                            {Object.entries(extraMeta).map(([k, v]) => {
                                const val =
                                    typeof v === 'string'
                                        ? v.length > 100
                                            ? `${v.slice(0, 100)}...`
                                            : v
                                        : JSON.stringify(v)
                                return (
                                    <p
                                        key={k}
                                        className="font-sans text-[8.5pt] text-olive"
                                    >
                                        <span className="font-medium text-near-black">
                                            {k}:
                                        </span>{' '}
                                        {val}
                                    </p>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Responsive layout: side-by-side on desktop, stacked on mobile */}
            <div className="md:flex md:gap-8">
                {/* Tree outline */}
                <div className="md:w-64 md:flex-shrink-0 mb-6 md:mb-0 md:sticky md:top-8 md:self-start">
                    {/* Desktop: static outline heading */}
                    <h3 className="hidden md:block font-serif text-[12pt] font-medium text-near-black mb-4">
                        Outline
                    </h3>
                    {/* Outline content: always visible on desktop, toggle on mobile */}
                    <div
                        className={`${isMobile && !outlineOpen ? 'hidden' : ''}`}
                    >
                        {tree && tree.length > 0 ? (
                            <TreeView
                                nodes={tree}
                                selectedNodeId={selectedNodeId}
                                onSelect={handleNodeSelect}
                                docId={docId}
                            />
                        ) : (
                            <p className="font-sans text-[8.5pt] text-olive">
                                (flat document — no headings)
                            </p>
                        )}
                    </div>
                    {/* Selected indicator on mobile when outline collapsed */}
                    {isMobile && !outlineOpen && selectedNodeId && tree && (
                        <p className="font-sans text-[8.5pt] text-olive mt-1 truncate">
                            §{' '}
                            {findNodeTitle(tree, selectedNodeId) ||
                                selectedNodeId.split('_')[0]}
                        </p>
                    )}
                </div>

                {/* Node content — hidden on mobile when outline is open */}
                <div
                    className={`flex-1 min-w-0 ${isMobile && outlineOpen ? 'hidden' : ''}`}
                >
                    {selectedNodeId ? (
                        <NodeContent docId={docId} nodeId={selectedNodeId} />
                    ) : (
                        <p className="font-serif text-[10pt] text-stone italic">
                            — Select a section from the outline to view content
                        </p>
                    )}
                </div>
            </div>
        </>
    )
}

// ── Tree View ───────────────────────────────────────────────────

function TreeView({
    nodes,
    depth,
    selectedNodeId,
    onSelect,
    docId,
}: {
    nodes: TreeNode[]
    depth?: number
    selectedNodeId: string | null
    onSelect: (id: string) => void
    docId: string
}) {
    const d = depth ?? 0
    return (
        <ul className="dash-list space-y-1">
            {nodes.map((node) => {
                const shortId = node.nodeId.split('_')[0]
                const isSelected = selectedNodeId === node.nodeId
                return (
                    <li key={node.nodeId}>
                        <button
                            type="button"
                            className={`text-left font-sans text-[9pt] leading-snug py-0.5
                                transition-colors bg-transparent border-none cursor-pointer
                                focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 focus-visible:rounded-[3pt]
                                ${isSelected ? 'text-ink font-medium' : 'text-olive hover:text-near-black'}`}
                            style={{ paddingLeft: `${d * 12}pt` }}
                            onClick={() => onSelect(node.nodeId)}
                        >
                            {node.value.title || shortId}{' '}
                            <span className="text-[7.5pt] text-stone/60 font-normal">
                                ({shortId})
                            </span>
                        </button>
                        {node.nodes && node.nodes.length > 0 && (
                            <TreeView
                                nodes={node.nodes}
                                depth={d + 1}
                                selectedNodeId={selectedNodeId}
                                onSelect={onSelect}
                                docId={docId}
                            />
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

// ── Node Content ────────────────────────────────────────────────

function NodeContent({ docId, nodeId }: { docId: string; nodeId: string }) {
    const { project } = useProject()
    const {
        data: node,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['node', project, docId, nodeId],
        queryFn: () => fetchNode(docId, nodeId),
    })

    if (isLoading) {
        return <p className="font-sans text-[9pt] text-olive">Loading...</p>
    }

    if (error) {
        return (
            <p className="font-sans text-[9pt] text-error">
                Failed to load node:{' '}
                {error instanceof Error ? error.message : String(error)}
            </p>
        )
    }

    if (!node) {
        return (
            <p className="font-sans text-[9pt] text-olive">Node not found.</p>
        )
    }

    return (
        <div>
            <h2 className="font-serif text-[14pt] font-medium text-near-black mb-1">
                {node.title}
            </h2>
            <p className="font-sans text-[8pt] text-stone mb-4">
                Line: {node.lineNum}
            </p>

            {node.summary && (
                <div className="mb-6">
                    <h4 className="font-sans text-[8pt] font-semibold text-olive uppercase tracking-wide mb-2">
                        Summary
                    </h4>
                    <Markdown>{node.summary}</Markdown>
                </div>
            )}

            {node.text && (
                <div>
                    <h4 className="font-sans text-[8pt] font-semibold text-olive uppercase tracking-wide mb-2">
                        Content
                    </h4>
                    <Markdown>{node.text}</Markdown>
                </div>
            )}
        </div>
    )
}
