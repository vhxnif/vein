import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel: () => void
    loading?: boolean
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Delete',
    onConfirm,
    onCancel,
    loading = false,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null)
    const confirmRef = useRef<HTMLButtonElement>(null)

    // Focus cancel on open
    useEffect(() => {
        if (open) {
            // Small delay so the element is rendered
            const id = setTimeout(() => cancelRef.current?.focus(), 50)
            return () => clearTimeout(id)
        }
    }, [open])

    // Close on Escape
    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) {
                onCancel()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, loading, onCancel])

    if (!open) return null

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for modal dismissal
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="presentation"
            onClick={loading ? undefined : onCancel}
        >
            <div className="absolute inset-0 bg-near-black/30" />

            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
                className="relative max-w-sm w-full bg-ivory ring-warm rounded-[12pt] shadow-lg p-6 animate-[fadeIn_250ms_ease]"
                style={{ boxShadow: '0 4pt 24pt rgba(0,0,0,0.08)' }}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && !loading) onCancel()
                }}
            >
                <h3 className="font-serif text-[16pt] font-medium text-near-black mb-2">
                    {title}
                </h3>
                <p className="font-sans text-[9pt] text-olive leading-relaxed mb-6">
                    {message}
                </p>
                <div className="flex justify-end gap-3">
                    <button
                        ref={cancelRef}
                        type="button"
                        className="btn-secondary"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        className="btn-danger"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? 'Deleting...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
