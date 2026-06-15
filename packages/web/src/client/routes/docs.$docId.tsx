import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { deleteDocument, fetchDocument } from '../lib/api'

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

export const Route = createFileRoute('/docs/$docId')({
    component: DocDetailPage,
})

function DocDetailPage() {
    const { docId } = Route.useParams()
    const queryClient = useQueryClient()
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

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

    if (isLoading) {
        return (
            <div className="max-w-[780px] mx-auto px-8 py-16">
                <p className="font-sans text-[9pt] text-[#504e49]">
                    Loading...
                </p>
            </div>
        )
    }

    if (!doc) {
        return (
            <div className="max-w-[780px] mx-auto px-8 py-16">
                <p className="font-sans text-[9pt] text-[#504e49]">
                    Document not found.
                </p>
            </div>
        )
    }

    const tree = doc.tree as TreeNode[] | undefined

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
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

            {doc.ftsSummary && (
                <div className="mb-8">
                    <h3 className="font-serif text-[12pt] font-medium text-[#141413] mb-2">
                        FTS Summary
                    </h3>
                    <p className="font-sans text-[9pt] text-[#504e49] leading-relaxed">
                        {doc.ftsSummary.length > 500
                            ? `${doc.ftsSummary.slice(0, 500)}...`
                            : doc.ftsSummary}
                    </p>
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
        </div>
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
        queryFn: async () => {
            const shortNodeId = nodeId.split('_')[0]
            const res = await fetch(
                `/api/projects/current/documents/${docId}/nodes/${shortNodeId}`
            )
            if (!res.ok) throw new Error('Node not found')
            return res.json()
        },
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
