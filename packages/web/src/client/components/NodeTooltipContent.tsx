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
                            <pre className="bg-ivory border border-cream/50 rounded-[4pt] p-2 my-1.5 overflow-x-auto max-w-full font-mono text-[8pt] leading-relaxed">
                                {children}
                            </pre>
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
