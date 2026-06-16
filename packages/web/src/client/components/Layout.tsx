import { Link } from '@tanstack/react-router'
import { type ReactNode, useState, useRef, useEffect } from 'react'
import { useProject } from '../lib/project'

export function Layout({ children }: { children: ReactNode }) {
    const { project } = useProject()

    return (
        <div className="flex min-h-screen bg-[#f5f4ed]">
            {/* Desktop sidebar */}
            <aside
                className="hidden md:flex w-[48px] flex-shrink-0 flex-col items-center py-4 gap-3
                               border-r border-[#d4d0c4]/50"
            >
                {/* Project selector */}
                <ProjectSelector />

                <SidebarIcon href="/" label="Ask">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                </SidebarIcon>
                <SidebarIcon href="/docs" label="Docs">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                    </svg>
                </SidebarIcon>
                <SidebarIcon href="/history" label="History">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12,6 12,12 16,14" />
                    </svg>
                </SidebarIcon>
                <SidebarIcon href="/settings" label="Settings">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                </SidebarIcon>

                {/* Spacer */}
                <div className="flex-1" />
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0 pb-16 md:pb-0">
                {/* Mobile project indicator bar */}
                <div className="md:hidden">
                    <Link
                        to="/projects"
                        className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d4d0c4]/50
                                   bg-[#faf9f5] text-[#6b6a64] hover:text-[#1B365D]
                                   transition-colors no-underline"
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
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        </svg>
                        <span className="font-sans text-[9pt] truncate flex-1">
                            {project || 'Select a project'}
                        </span>
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="flex-shrink-0"
                        >
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </Link>
                </div>
                {children}
            </main>

            {/* Mobile bottom tab bar */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 bg-[#faf9f5] border-t border-[#d4d0c4]/50
                            flex items-center justify-around py-2 safe-area-bottom z-50"
            >
                <MobileTab href="/" label="Ask">
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                </MobileTab>
                <MobileTab href="/docs" label="Docs">
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                    </svg>
                </MobileTab>
                <MobileTab href="/history" label="History">
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12,6 12,12 16,14" />
                    </svg>
                </MobileTab>
                <MobileTab href="/projects" label="Projects">
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                </MobileTab>
            </nav>
        </div>
    )
}

// ── Project Selector ─────────────────────────────────────────

function ProjectSelector() {
    const { project, setProject, projects, loading } = useProject()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
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
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open])

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-[6pt]
                           text-[#6b6a64] hover:text-[#1B365D] hover:bg-[#EEF2F7]
                           transition-colors"
                title={project || 'Select project'}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <ProjectIcon />
            </button>

            {/* Dropdown on click */}
            {open && (
                <div
                    className="absolute top-full left-0 mt-1 w-52 bg-[#faf9f5]
                               ring-warm rounded-[8pt] py-1 z-50 shadow-sm
                               animate-[fadeIn_150ms_ease]"
                >
                    <div className="px-3 py-1.5 font-sans text-[7.5pt] font-semibold text-[#6b6a64] uppercase tracking-wide">
                        Projects
                    </div>
                    {loading ? (
                        <div className="px-3 py-2 font-sans text-[8pt] text-[#6b6a64]">
                            Loading...
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="px-3 py-2 font-sans text-[8pt] text-[#6b6a64]">
                            No projects found
                        </div>
                    ) : (
                        <>
                            {/* None option */}
                            <button
                                type="button"
                                className={`w-full text-left px-3 py-1.5 font-sans text-[8.5pt]
                                    transition-colors hover:bg-[#EEF2F7]
                                    ${!project ? 'text-[#1B365D] font-medium' : 'text-[#504e49]'}`}
                                onClick={() => {
                                    setProject(null)
                                    setOpen(false)
                                }}
                            >
                                {!project && '● '}
                                None
                            </button>
                            {projects.map((p) => (
                                <button
                                    type="button"
                                    key={p.name}
                                    className={`w-full text-left px-3 py-1.5 font-sans text-[8.5pt]
                                        transition-colors hover:bg-[#EEF2F7] truncate
                                        ${project === p.name ? 'text-[#1B365D] font-medium' : 'text-[#504e49]'}`}
                                    onClick={() => {
                                        setProject(project === p.name ? null : p.name)
                                        setOpen(false)
                                    }}
                                >
                                    {project === p.name && '● '}
                                    {p.name}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function ProjectIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
    )
}

// ── Sidebar Icon ──────────────────────────────────────────────

function SidebarIcon({
    href,
    label,
    children,
}: {
    href: string
    label: string
    children: ReactNode
}) {
    return (
        <Link
            to={href}
            className="flex items-center justify-center w-8 h-8 rounded-[6pt]
                       text-[#6b6a64] hover:text-[#1B365D] hover:bg-[#EEF2F7]
                       transition-colors"
            title={label}
            aria-label={label}
        >
            {children}
        </Link>
    )
}

// ── Mobile Tab ────────────────────────────────────────────────

function MobileTab({
    href,
    label,
    children,
}: {
    href: string
    label: string
    children: ReactNode
}) {
    return (
        <Link
            to={href}
            className="flex flex-col items-center gap-0.5 text-[#6b6a64] hover:text-[#1B365D]
                       transition-colors no-underline"
            aria-label={label}
        >
            {children}
            <span className="font-sans text-[9px] leading-none">{label}</span>
        </Link>
    )
}
