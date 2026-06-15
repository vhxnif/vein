import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { deleteDocument, fetchDocument, fetchNode } from '../lib/api'

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

// ── Skeleton for loading / pending states ──────────────────────

function DocSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="h-8 bg-[#e8e6dc] rounded w-2/5 mb-3" />
            <div className="h-4 bg-[#e8e6dc] rounded w-1/4 mb-10" />
            <div className="flex gap-8">
                <div className="w-64 flex-shrink-0 space-y-2.5">
                    <div className="h-3 bg-[#e8e6dc] rounded w-10 mb-3" />
                    {[80, 60, 75, 50, 70, 55].map((w, i) => (
                        <div
                            key={i}
                            className="h-3 bg-[#e8e6dc] rounded"
                            style={{ width: `${w}%` }}
                        />
                    ))}
                </div>
                <div className="flex-1 space-y-3">
                    <div className="h-6 bg-[#e8e6dc] rounded w-1/3" />
                    <div className="h-3 bg-[#e8e6dc] rounded w-full" />
                    <div className="h-3 bg-[#e8e6dc] rounded w-full" />
                    <div className="h-3 bg-[#e8e6dc] rounded w-3/4" />
                    <div className="h-3 bg-[#e8e6dc] rounded w-1/2" />
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
    const queryClient = useQueryClient()
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [showDetail, setShowDetail] = useState(false)

    const { data: doc, isLoading } = useQuery({
        queryKey: ['document', docId],
        queryFn: () => fetchDocument(docId),
    })

    const deleteMutation = useMutation({
        mutationFn: () => deleteDocument(docId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['documents'] })
            window.history.back()
        },
    })

    if (isLoading) return <DocSkeleton />

    if (!doc) {
        return (
            <p className="font-sans text-[9pt] text-[#504e49]">
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
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="font-serif text-[20pt] font-medium leading-tight text-[#141413]">
                        {doc.title}
                    </h1>
                    <p className="font-sans text-[8.5pt] text-[#504e49] mt-2 leading-relaxed">
                        {doc.nodeCount} 章节 · {doc.sourcePath || 'unknown'} ·{' '}
                        {doc.createdAt?.slice(0, 10) ?? 'unknown'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowDetail((s) => !s)}
                    >
                        {showDetail ? 'Hide Detail' : 'Detail'}
                    </button>
                    <button
                        type="button"
                        className="btn-ghost text-[#b53333]"
                        onClick={() => {
                            if (confirm(`Delete "${doc.title}"?`))
                                deleteMutation.mutate()
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Document metadata detail — mirrors CLI formatDocDetail */}
            {showDetail && (
                <div className="mb-8 p-4 bg-[#faf9f5] ring-warm rounded-[8pt] space-y-1">
                    <p className="font-sans text-[8.5pt] text-[#504e49]">
                        <span className="font-medium text-[#141413]">ID:</span>{' '}
                        {doc.id}
                    </p>
                    <p className="font-sans text-[8.5pt] text-[#504e49]">
                        <span className="font-medium text-[#141413]">ShortID:</span>{' '}
                        {doc.id.slice(0, 8)}...
                    </p>
                    <p className="font-sans text-[8.5pt] text-[#504e49]">
                        <span className="font-medium text-[#141413]">Created:</span>{' '}
                        {doc.createdAt}
                    </p>
                    <p className="font-sans text-[8.5pt] text-[#504e49]">
                        <span className="font-medium text-[#141413]">Nodes:</span>{' '}
                        {doc.nodeCount}
                    </p>
                    {doc.ftsSummary && (
                        <p className="font-sans text-[8.5pt] text-[#504e49]">
                            <span className="font-medium text-[#141413]">FTS:</span>{' '}
                            {doc.ftsSummary.length > 200
                                ? `${doc.ftsSummary.slice(0, 200)}...`
                                : doc.ftsSummary}
                        </p>
                    )}
                    {Object.keys(extraMeta).length > 0 && (
                        <div className="pt-2 mt-2 border-t border-[#d4d0c4]/50">
                            <p className="font-sans text-[8pt] font-semibold text-[#504e49] uppercase tracking-wide mb-2">
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
                                        className="font-sans text-[8.5pt] text-[#504e49]"
                                    >
                                        <span className="font-medium text-[#141413]">
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

            <div className="flex gap-8">
                {/* Tree outline */}
                <div className="w-64 flex-shrink-0">
                    <h3 className="font-serif text-[12pt] font-medium text-[#141413] mb-4">
                        大纲
                    </h3>
                    {tree && tree.length > 0 ? (
                        <TreeView
                            nodes={tree}
                            selectedNodeId={selectedNodeId}
                            onSelect={setSelectedNodeId}
                            docId={docId}
                        />
                    ) : (
                        <p className="font-sans text-[8.5pt] text-[#504e49]">
                            (flat document — no headings)
                        </p>
                    )}
                </div>

                {/* Node content */}
                <div className="flex-1 min-w-0">
                    {selectedNodeId ? (
                        <NodeContent docId={docId} nodeId={selectedNodeId} />
                    ) : (
                        <p className="font-serif text-[10pt] text-[#6b6a64] italic">
                            — 点击左侧章节查看原文
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-12 pt-4 border-t border-[#d4d0c4]">
                <Link
                    to="/docs"
                    className="font-sans text-[9pt] text-[#504e49] hover:text-[#1B365D] transition-colors no-underline"
                >
                    ← Back to documents
                </Link>
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
                                ${isSelected ? 'text-[#1B365D] font-medium' : 'text-[#504e49] hover:text-[#141413]'}`}
                            style={{ paddingLeft: `${d * 12}pt` }}
                            onClick={() => onSelect(node.nodeId)}
                        >
                            {node.value.title || shortId}
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
    const { data: node, isLoading } = useQuery({
        queryKey: ['node', docId, nodeId],
        queryFn: () => fetchNode(docId, nodeId),
    })

    if (isLoading) {
        return <p className="font-sans text-[9pt] text-[#504e49]">Loading...</p>
    }

    if (!node) {
        return (
            <p className="font-sans text-[9pt] text-[#504e49]">
                Node not found.
            </p>
        )
    }

    return (
        <div>
            <h2 className="font-serif text-[14pt] font-medium text-[#141413] mb-1">
                {node.title}
            </h2>
            <p className="font-sans text-[8pt] text-[#6b6a64] mb-4">
                Line: {node.lineNum}
            </p>

            {node.summary && (
                <div className="mb-6">
                    <h4 className="font-sans text-[8pt] font-semibold text-[#504e49] uppercase tracking-wide mb-2">
                        Summary
                    </h4>
                    <p className="font-serif text-[9.5pt] text-[#141413] leading-relaxed">
                        {node.summary}
                    </p>
                </div>
            )}

            {node.text && (
                <div>
                    <h4 className="font-sans text-[8pt] font-semibold text-[#504e49] uppercase tracking-wide mb-2">
                        Content
                    </h4>
                    <div className="font-serif text-[9.5pt] text-[#141413] leading-relaxed whitespace-pre-wrap">
                        {node.text}
                    </div>
                </div>
            )}
        </div>
    )
}
