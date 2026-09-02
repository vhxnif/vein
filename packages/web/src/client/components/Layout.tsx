import { Link, useLocation } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useProject } from '../lib/project.tsx'
import { StreamingStatusBar } from './StreamingStatusBar.tsx'

/** Mobile navigation destinations — Ask page menu + bottom tab bar. */
export const NAV_ITEMS = [
    {
        href: '/',
        label: 'Ask',
        icon: (
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
        ),
    },
    {
        href: '/docs',
        label: 'Docs',
        icon: (
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
        ),
    },
    {
        href: '/projects',
        label: 'Projects',
        icon: (
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
        ),
    },
    {
        href: '/settings',
        label: 'Settings',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
            >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
        ),
    },
]

export function Layout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation()
    const isAsk = pathname === '/'

    return (
        <div className="h-dvh md:h-auto md:min-h-screen bg-parchment flex flex-col md:block">
            {/* Desktop sidebar — fixed, independent of main scroll */}
            <aside
                className="hidden md:flex fixed z-30 left-0 top-0 h-screen
                           w-[48px] flex-shrink-0 flex-col items-center py-4 gap-3
                           border-r border-cream/50 bg-parchment"
            >
                {/* Project selector */}
                <ProjectSelector />

                {NAV_ITEMS.map((item) => (
                    <SidebarIcon key={item.href} href={item.href} label={item.label}>
                        {item.icon}
                    </SidebarIcon>
                ))}

                {/* Spacer */}
                <div className="flex-1" />
            </aside>

            {/* Main content — scrollable on mobile, normal flow on desktop */}
            <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden no-scrollbar md:overflow-visible md:pl-[48px]">
                {children}
            </main>

            {/* Streaming status bar — sits at bottom on mobile during a search */}
            <StreamingStatusBar />

            {/* Mobile bottom tab bar — Ask page has its own input bar, so tabs only on other pages */}
            {!isAsk && <MobileTabBar />}
        </div>
    )
}

// ── Mobile bottom tab bar ────────────────────────────────────

function MobileTabBar() {
    return (
        <nav
            className="md:hidden flex-shrink-0 bg-ivory border-t border-cream/50
                        flex items-center justify-around py-2 safe-area-bottom"
        >
            {NAV_ITEMS.map((item) => (
                <MobileTab key={item.href} href={item.href} label={item.label}>
                    {item.icon}
                </MobileTab>
            ))}
        </nav>
    )
}

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
            className="flex items-center justify-center w-10 h-10 text-stone hover:text-ink
                       transition-colors no-underline rounded-[8pt]"
            aria-label={label}
        >
            {children}
        </Link>
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
                           text-stone hover:text-ink hover:bg-sand
                           focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2
                           transition-colors"
                aria-label={project || 'Select project'}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <ProjectIcon />
            </button>

            {/* Dropdown on click */}
            {open && (
                <div
                    className="absolute top-full left-0 mt-1 min-w-32 w-max max-w-48 bg-ivory
                               ring-warm rounded-[8pt] py-1 px-1 z-50 shadow-sm overflow-hidden
                               animate-[fadeIn_150ms_ease]"
                >
                    <div className="px-3 py-1.5 font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide">
                        Projects
                    </div>
                    {loading ? (
                        <div className="px-3 py-2 font-sans text-[8pt] text-stone">
                            Loading...
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="px-3 py-2 font-sans text-[8pt] text-stone">
                            No projects found
                        </div>
                    ) : (
                        <>
                            {/* None option */}
                            <button
                                type="button"
                                className={`w-full text-left px-3 py-1.5 rounded-[4pt] font-sans text-[8.5pt]
                                    transition-colors hover:bg-sand
                                    ${!project ? 'text-ink font-medium' : 'text-olive'}`}
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
                                    className={`w-full text-left px-3 py-1.5 rounded-[4pt] font-sans text-[8.5pt]
                                        transition-colors hover:bg-sand truncate
                                        ${project === p.name ? 'text-ink font-medium' : 'text-olive'}`}
                                    onClick={() => {
                                        setProject(
                                            project === p.name ? null : p.name
                                        )
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
                       text-stone hover:text-ink hover:bg-sand
                       focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2
                       transition-colors"
            aria-label={label}
        >
            {children}
        </Link>
    )
}
