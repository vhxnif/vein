import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownProps {
    children: string
}

export function Markdown({ children }: MarkdownProps) {
    return (
        <div className="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="font-serif text-[16pt] font-medium text-[#141413] mt-8 mb-3 border-b border-[#d4d0c4] pb-1">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="font-serif text-[13pt] font-medium text-[#141413] mt-6 mb-2">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="font-serif text-[11pt] font-medium text-[#141413] mt-5 mb-2">
                            {children}
                        </h3>
                    ),
                    h4: ({ children }) => (
                        <h4 className="font-serif text-[10pt] font-semibold text-[#141413] mt-4 mb-1">
                            {children}
                        </h4>
                    ),
                    p: ({ children }) => (
                        <p className="font-serif text-[10pt] leading-relaxed text-[#141413] mb-3">
                            {children}
                        </p>
                    ),
                    ul: ({ children }) => (
                        <ul className="list-disc pl-5 mb-3 space-y-1">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal pl-5 mb-3 space-y-1">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="font-serif text-[10pt] leading-relaxed text-[#141413]">
                            {children}
                        </li>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-[#1B365D] pl-4 italic text-[#504e49] my-3">
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
                            <code className="font-mono text-[9pt] bg-[#faf9f5] px-1 py-0.5 rounded text-[#1B365D]">
                                {children}
                            </code>
                        )
                    },
                    pre: ({ children }) => (
                        <pre className="code-block my-3 overflow-x-auto">
                            {children}
                        </pre>
                    ),
                    a: ({ children, href }) => (
                        <a
                            href={href}
                            className="text-[#1B365D] hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {children}
                        </a>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-[#141413]">
                            {children}
                        </strong>
                    ),
                    hr: () => <hr className="border-[#d4d0c4] my-4" />,
                    table: ({ children }) => (
                        <table className="w-full text-left border-collapse my-3">
                            {children}
                        </table>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    th: ({ children }) => (
                        <th className="font-sans text-[8pt] font-semibold text-[#6b6a64] border-b border-[#d4d0c4] py-1.5 px-2">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="font-serif text-[9pt] text-[#141413] border-b border-[#d4d0c4]/50 py-1.5 px-2">
                            {children}
                        </td>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    )
}
