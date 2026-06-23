import { useCallback, useEffect, useRef, useState } from 'react'

export interface SelectOption {
    value: string
    label: string
}

interface SelectFieldProps {
    id?: string
    value: string
    onChange: (value: string) => void
    options: SelectOption[]
    disabled?: boolean
    placeholder?: string
    className?: string
}

export function SelectField({
    id,
    value,
    onChange,
    options,
    disabled = false,
    placeholder,
    className = '',
}: SelectFieldProps) {
    const [open, setOpen] = useState(false)
    const [focusIdx, setFocusIdx] = useState(-1)
    const containerRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const selectedLabel =
        options.find((o) => o.value === value)?.label ?? placeholder ?? ''

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // Close on Escape
    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false)
                triggerRef.current?.focus()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open])

    // Scroll focused item into view
    useEffect(() => {
        if (!open || focusIdx < 0 || !listRef.current) return
        const items =
            listRef.current.querySelectorAll<HTMLElement>('[role="option"]')
        const el = items[focusIdx]
        if (el) {
            el.scrollIntoView({ block: 'nearest' })
        }
    }, [open, focusIdx])

    const handleTriggerKey = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setOpen(true)
                    setFocusIdx(0)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setOpen(true)
                    setFocusIdx(options.length - 1)
                    break
                case 'Enter':
                case ' ':
                    e.preventDefault()
                    setOpen((v) => !v)
                    if (!open) setFocusIdx(0)
                    break
            }
        },
        [disabled, open, options.length]
    )

    const handleItemKey = useCallback(
        (e: React.KeyboardEvent, idx: number) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setFocusIdx((i) => Math.min(i + 1, options.length - 1))
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setFocusIdx((i) => Math.max(i - 1, 0))
                    break
                case 'Enter':
                case ' ':
                    e.preventDefault()
                    if (options[idx]) {
                        onChange(options[idx].value)
                    }
                    setOpen(false)
                    triggerRef.current?.focus()
                    break
                case 'Escape':
                    e.preventDefault()
                    setOpen(false)
                    triggerRef.current?.focus()
                    break
            }
        },
        [onChange, options]
    )

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                disabled={disabled}
                className="select-trigger"
                onClick={() => {
                    if (disabled) return
                    setOpen((v) => !v)
                    if (!open) {
                        const idx = options.findIndex((o) => o.value === value)
                        setFocusIdx(idx >= 0 ? idx : 0)
                    }
                }}
                onKeyDown={handleTriggerKey}
                onBlur={() => {
                    // Delay close so click on item registers
                    setTimeout(() => {
                        if (
                            containerRef.current &&
                            !containerRef.current.contains(
                                document.activeElement
                            )
                        ) {
                            setOpen(false)
                        }
                    }, 150)
                }}
            >
                <span className={value ? 'text-near-black' : 'text-stone'}>
                    {selectedLabel}
                </span>
                <ChevronIcon />
            </button>

            {open && (
                <div
                    ref={listRef}
                    role="listbox"
                    className="select-dropdown"
                    onMouseDown={(e) => {
                        // Prevent blur from closing before click registers
                        e.preventDefault()
                    }}
                >
                    {options.map((opt, idx) => (
                        <button
                            key={opt.value}
                            type="button"
                            role="option"
                            aria-selected={opt.value === value}
                            className={`select-item ${
                                opt.value === '' && (!value || value === '')
                                    ? 'select-item-placeholder'
                                    : ''
                            }`}
                            tabIndex={focusIdx === idx ? 0 : -1}
                            onClick={() => {
                                onChange(opt.value)
                                setOpen(false)
                                triggerRef.current?.focus()
                            }}
                            onKeyDown={(e) => handleItemKey(e, idx)}
                        >
                            {opt.value === value && (
                                <span className="mr-1.5">●</span>
                            )}
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function ChevronIcon() {
    return (
        <span className="select-chevron" aria-hidden="true">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path
                    d="M1 1L5 5L9 1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    )
}
