import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import type { NodeInfo } from '../lib/api.ts'

// ── NodeTooltipContent ───────────────────────────────────────
//
// Shared tooltip content rendering used by both:
//   1. NodeTooltip (web live hover — fetches data via API)
//   2. exportHtml.ts (export — pre-renders with pre-fetched data)
//
// Keep this the single source of truth for how node data is displayed
// in hover tooltips. Any change here automatically applies everywhere.

interface NodeTooltipContentProps {
    nodeId: string
    node: NodeInfo
}

function TooltipPreBlock({ children }: { children: React.ReactNode }) {
    const [copied, setCopied] = useState(false)
    const text = extractTooltipText(children)
    const onCopy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }, [text])
    return (
        <pre className="code-block group relative my-1.5 overflow-x-auto max-w-full bg-ivory border border-cream/50 rounded-[4pt] p-2 font-mono text-[8pt] leading-relaxed">
            <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? '已复制' : '复制代码'}
                className="absolute top-1 right-1 text-stone hover:text-ink p-0.5 rounded bg-ivory/80 border border-cream opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
                {copied ? (
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                        />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                )}
            </button>
            {children}
        </pre>
    )
}

function extractTooltipText(children: React.ReactNode): string {
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (Array.isArray(children))
        return children.map((c) => extractTooltipText(c) ?? '').join('')
    if (children && typeof children === 'object' && 'props' in children) {
        return extractTooltipText(
            (children as { props: { children?: React.ReactNode } }).props
                .children
        )
    }
    return ''
}

export function NodeTooltipContent({ nodeId, node }: NodeTooltipContentProps) {
    return (
        <>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-ink/15 min-w-0">
                <span className="font-mono text-[7pt] bg-ink/10 px-1.5 py-0.5 rounded text-ink shrink-0">
                    {nodeId}
                </span>
                <span className="font-serif text-[10pt] font-medium text-near-black leading-snug break-words min-w-0">
                    {node.docName}
                </span>
            </div>
            {/* Body */}
            <div className="text-[9pt] leading-relaxed text-near-black">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                        h1: ({ children }) => (
                            <h1 className="font-serif text-[10pt] font-medium text-near-black mt-2 mb-1">
                                {children}
                            </h1>
                        ),
                        h2: ({ children }) => (
                            <h2 className="font-serif text-[9.5pt] font-medium text-near-black mt-2 mb-1">
                                {children}
                            </h2>
                        ),
                        h3: ({ children }) => (
                            <h3 className="font-serif text-[9pt] font-medium text-near-black mt-1.5 mb-0.5">
                                {children}
                            </h3>
                        ),
                        p: ({ children }) => (
                            <p className="font-serif text-[9pt] leading-relaxed text-near-black mb-1.5 break-words">
                                {children}
                            </p>
                        ),
                        ul: ({ children }) => (
                            <ul className="list-disc pl-4 mb-1.5 space-y-0.5">
                                {children}
                            </ul>
                        ),
                        ol: ({ children }) => (
                            <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">
                                {children}
                            </ol>
                        ),
                        li: ({ children }) => (
                            <li className="font-serif text-[9pt] leading-relaxed text-near-black break-words">
                                {children}
                            </li>
                        ),
                        blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-ink/20 pl-3 italic text-stone my-1.5 break-words">
                                {children}
                            </blockquote>
                        ),
                        code: ({ children, className, ...rest }) => {
                            const inline = (rest as { inline?: boolean }).inline
                            if (!inline) {
                                return (
                                    <code className={className}>
                                        {children}
                                    </code>
                                )
                            }
                            return (
                                <code className="font-mono text-[8pt] bg-ivory px-1 py-0.5 rounded text-ink">
                                    {children}
                                </code>
                            )
                        },
                        pre: ({ children }) => (
                            <TooltipPreBlock>{children}</TooltipPreBlock>
                        ),
                        a: ({ children, href }) => (
                            <a
                                href={href}
                                className="text-ink underline decoration-ink/30 hover:decoration-ink"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        ),
                        strong: ({ children }) => (
                            <strong className="font-semibold text-near-black">
                                {children}
                            </strong>
                        ),
                        em: ({ children }) => (
                            <em className="italic">{children}</em>
                        ),
                        table: ({ children }) => (
                            <div className="overflow-x-auto max-w-full my-1.5">
                                <table className="w-full text-left border-collapse">
                                    {children}
                                </table>
                            </div>
                        ),
                        thead: ({ children }) => <thead>{children}</thead>,
                        tbody: ({ children }) => <tbody>{children}</tbody>,
                        tr: ({ children }) => <tr>{children}</tr>,
                        th: ({ children }) => (
                            <th className="font-sans text-[7pt] font-semibold text-stone border-b border-cream py-1 px-1.5">
                                {children}
                            </th>
                        ),
                        td: ({ children }) => (
                            <td className="font-serif text-[8pt] text-near-black border-b border-cream/50 py-1 px-1.5 break-words">
                                {children}
                            </td>
                        ),
                        hr: () => <hr className="border-cream/30 my-2" />,
                        img: ({ src, alt }) => (
                            <img
                                src={src}
                                alt={alt ?? ''}
                                className="max-w-full h-auto rounded my-1.5"
                            />
                        ),
                    }}
                >
                    {node.text}
                </ReactMarkdown>
            </div>
        </>
    )
}
