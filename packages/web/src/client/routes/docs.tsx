import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query'
import {
    createFileRoute,
    Link,
    Outlet,
    useLocation,
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { deleteDocument, fetchDocuments } from '../lib/api.ts'
import { useImport } from '../lib/import-context.tsx'
import { useProject } from '../lib/project.tsx'

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
    const queryClient = useQueryClient()
    const sentinelRef = useRef<HTMLDivElement>(null)
    const [isMobile, setIsMobile] = useState(false)
    const [desktopPage, setDesktopPage] = useState(1)

    // Dynamic page size: fill ~1.5 viewports so pagination is visible without scrolling
    const [pageSize] = useState(() => {
        if (typeof window === 'undefined') return 20
        if (window.innerWidth < 768) return 20
        // Header ~200px, pagination bar ~60px; doc row ≈ 62px
        const availH = window.innerHeight - 200 - 60
        const rowH = 62
        return Math.min(50, Math.max(8, Math.floor(availH / rowH)))
    })

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const {
        data,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['documents', project, pageSize],
        queryFn: ({ pageParam }) => fetchDocuments(pageParam, pageSize),
        initialPageParam: 1,
        getNextPageParam: (lastPage, allPages) => {
            const totalPages = Math.ceil(lastPage.total / pageSize)
            const nextPage = allPages.length + 1
            return nextPage <= totalPages ? nextPage : undefined
        },
        staleTime: 30_000,
    })

    // Ensure requested desktop page is loaded
    useEffect(() => {
        if (
            !isMobile &&
            data &&
            desktopPage > data.pages.length &&
            hasNextPage
        ) {
            fetchNextPage()
        }
    }, [isMobile, desktopPage, data, hasNextPage, fetchNextPage])

    const loadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    // Intersection Observer for mobile infinite scroll
    useEffect(() => {
        if (!isMobile) return
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore()
            },
            { rootMargin: '200px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [isMobile, loadMore])

    const [deleteTarget, setDeleteTarget] = useState<{
        id: string
        title: string
    } | null>(null)

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteDocument(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['documents'] })
            setDeleteTarget(null)
        },
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

    const allDocs = data?.pages.flatMap((p) => p.docs) ?? []
    const total = data?.pages[0]?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    // Desktop: show one page at a time; Mobile: show all loaded
    const desktopPageData = data?.pages[desktopPage - 1]
    const docs = isMobile ? allDocs : (desktopPageData?.docs ?? [])

    return (
        <>
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="font-serif text-[20pt] font-medium leading-tight text-ink">
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
                        <div
                            key={doc.id}
                            className="flex items-center gap-2 px-3 py-3 -mx-3 rounded-[6pt]
                                       hover:bg-sand/60 transition-colors group"
                        >
                            <Link
                                to="/docs/$docId"
                                params={{ docId: doc.id }}
                                className="flex-1 min-w-0 no-underline"
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
                                    <span>
                                        {doc.createdAt?.slice(0, 10) ?? ''}
                                    </span>
                                </div>
                            </Link>
                            <button
                                type="button"
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-[4pt]
                                           text-ink/40 hover:text-error hover:bg-error/10
                                           opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all
                                           focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ink"
                                aria-label={`Delete ${doc.title}`}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setDeleteTarget({
                                        id: doc.id,
                                        title: doc.title,
                                    })
                                }}
                                disabled={deleteMutation.isPending}
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Mobile: infinite scroll sentinel + indicator */}
            {isMobile && (
                <div
                    ref={sentinelRef}
                    className="mt-8 pt-5 border-t border-cream"
                >
                    {isFetchingNextPage ? (
                        <p className="font-sans text-[9pt] text-olive text-center">
                            Loading more...
                        </p>
                    ) : hasNextPage ? (
                        <p className="font-sans text-[9pt] text-stone text-center">
                            Scroll for more
                        </p>
                    ) : docs.length > 0 ? (
                        <p className="font-sans text-[9pt] text-stone text-center">
                            All {total} documents loaded
                        </p>
                    ) : null}
                </div>
            )}

            {/* Desktop: pagination controls */}
            {!isMobile && totalPages > 1 && (
                <div className="mt-8 pt-5 border-t border-cream flex items-center justify-between font-sans text-[9pt] text-olive">
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={desktopPage <= 1}
                        onClick={() =>
                            setDesktopPage((p) => Math.max(1, p - 1))
                        }
                    >
                        ← Prev
                    </button>
                    <span>
                        {desktopPage} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn-ghost"
                        disabled={desktopPage >= totalPages}
                        onClick={() =>
                            setDesktopPage((p) => Math.min(totalPages, p + 1))
                        }
                    >
                        Next →
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Delete Document"
                message={`Are you sure you want to delete "${deleteTarget?.title ?? ''}"? This action cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={() => {
                    if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
                }}
                onCancel={() => setDeleteTarget(null)}
                loading={deleteMutation.isPending}
            />
        </>
    )
}
