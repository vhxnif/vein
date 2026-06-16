import { useQuery } from '@tanstack/react-query'
import {
    createFileRoute,
    Link,
    Outlet,
    useLocation,
} from '@tanstack/react-router'
import { useState } from 'react'
import { fetchDocuments } from '../lib/api'
import { useImport } from '../lib/import-context'
import { useProject } from '../lib/project'

export const Route = createFileRoute('/docs')({
    component: DocsLayout,
})

function DocsLayout() {
    const location = useLocation()
    const isDetail = location.pathname !== '/docs'

    return (
        <div
            className="max-w-[780px] mx-auto px-8 py-16"
            style={{ animation: isDetail ? 'fadeIn 250ms ease' : 'none' }}
        >
            {isDetail ? <Outlet /> : <DocsList />}
        </div>
    )
}

// ── Document List ──────────────────────────────────────────────

function DocsList() {
    const { project } = useProject()
    const { open: openImport } = useImport()
    const [page, setPage] = useState(1)
    const pageSize = 20

    const { data, isLoading, error } = useQuery({
        queryKey: ['documents', project, page],
        queryFn: () => fetchDocuments(page, pageSize),
        staleTime: 30_000,
    })

    if (!project) {
        return (
            <>
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-8">
                    Documents
                </h1>
                <p className="font-sans text-[9pt] text-stone">
                    No project selected — select one from the sidebar
                </p>
            </>
        )
    }

    const docs = data?.docs ?? []
    const total = data?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <>
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black">
                        Documents
                    </h1>
                    <p className="font-sans text-[9pt] text-stone mt-1">
                        {total} document{total !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={openImport}
                >
                    Import
                </button>
            </div>

            {isLoading ? (
                <p className="font-sans text-[9pt] text-olive">Loading...</p>
            ) : error ? (
                <p className="font-sans text-[9pt] text-error">
                    Failed to load documents:{' '}
                    {error instanceof Error ? error.message : String(error)}
                </p>
            ) : docs.length === 0 ? (
                <p className="font-sans text-[9pt] text-olive">
                    No documents yet. Import Markdown files to get started.
                </p>
            ) : (
                <div>
                    {docs.map((doc) => (
                        <Link
                            key={doc.id}
                            to="/docs/$docId"
                            params={{ docId: doc.id }}
                            className="block no-underline px-3 py-3 -mx-3 rounded-[6pt]
                                       hover:bg-sand/60 transition-colors"
                        >
                            <span className="font-serif text-[10pt] font-medium text-near-black leading-relaxed">
                                {doc.title}
                            </span>
                            <div className="flex items-center gap-4 mt-1 font-sans text-[8pt] text-stone">
                                <span>
                                    {doc.nodeCount} section
                                    {doc.nodeCount !== 1 ? 's' : ''}
                                </span>
                                {doc.sourcePath &&
                                    doc.sourcePath !== 'unknown' && (
                                        <span className="font-mono text-[7.5pt] truncate max-w-[240px]">
                                            {doc.sourcePath}
                                        </span>
                                    )}
                                <span>{doc.createdAt?.slice(0, 10) ?? ''}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mt-8 pt-5 border-t border-cream flex items-center justify-between font-sans text-[9pt] text-olive">
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
        </>
    )
}
