import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchDocuments } from '../lib/api'

export const Route = createFileRoute('/docs')({
    component: DocsPage,
})

function DocsPage() {
    const [page, setPage] = useState(1)
    const pageSize = 20

    const { data, isLoading } = useQuery({
        queryKey: ['documents', page],
        queryFn: () => fetchDocuments(page, pageSize),
        staleTime: 30_000,
    })

    const docs = data?.docs ?? []
    const total = data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <div className="max-w-[780px] mx-auto px-8 py-16">
            <div className="flex items-center justify-between mb-8">
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-[#141413]">
                    文档
                </h1>
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                        // Import will be implemented with file upload
                        alert('Import: Click to select .md files (coming soon)')
                    }}
                >
                    Import
                </button>
            </div>

            {isLoading ? (
                <p className="font-sans text-[9pt] text-[#504e49]">
                    Loading...
                </p>
            ) : docs.length === 0 ? (
                <p className="font-sans text-[9pt] text-[#504e49]">
                    暂无文档。点击 Import 导入 Markdown 文件。
                </p>
            ) : (
                <div className="space-y-0">
                    {docs.map((doc) => (
                        <Link
                            key={doc.id}
                            to="/docs/$docId"
                            params={{ docId: doc.id }}
                            className="block no-underline py-3 border-b border-[#d4d0c4]/50
                                       hover:border-[#1B365D]/30 transition-colors group"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-serif text-[10pt] font-medium text-[#141413] leading-relaxed">
                                    {doc.title}
                                </span>
                                <span className="font-sans text-[8pt] text-[#504e49] opacity-0 group-hover:opacity-100 transition-opacity">
                                    →
                                </span>
                            </div>
                            <span className="font-sans text-[8.5pt] text-[#504e49] leading-snug">
                                {doc.nodeCount} 章节 ·{' '}
                                {doc.sourcePath || 'unknown'} ·{' '}
                                {doc.createdAt?.slice(0, 10) ?? 'unknown'}
                            </span>
                        </Link>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mt-8 pt-5 border-t border-[#d4d0c4] flex items-center justify-between font-sans text-[9pt] text-[#504e49]">
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        ← Prev
                    </button>
                    <span>
                        {page} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={page >= totalPages}
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    )
}
