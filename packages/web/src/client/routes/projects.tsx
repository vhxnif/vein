import { createFileRoute } from '@tanstack/react-router'
import { useProject } from '../lib/project.tsx'

export const Route = createFileRoute('/projects')({
    component: ProjectsPage,
})

function ProjectsPage() {
    const { project, setProject, projects, loading } = useProject()

    return (
        <div className="max-w-[680px] mx-auto px-4 sm:px-8 py-8 sm:py-16">
            <h1 className="font-serif text-[16pt] sm:text-[22pt] font-medium leading-tight text-near-black mb-1">
                Projects
            </h1>
            <p className="font-sans text-[8.5pt] sm:text-[9pt] text-stone mb-8">
                Select a project to search and browse documents
            </p>

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-14 bg-ivory ring-warm rounded-[8pt] animate-pulse"
                        />
                    ))}
                </div>
            ) : projects.length === 0 ? (
                <div className="bg-ivory ring-warm rounded-[8pt] p-8 text-center">
                    <div className="mb-4 text-stone">
                        <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                            className="mx-auto"
                        >
                            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                        </svg>
                    </div>
                    <p className="font-serif text-[11pt] text-near-black mb-1">
                        No projects registered
                    </p>
                    <p className="font-sans text-[8.5pt] text-stone">
                        Use{' '}
                        <code className="font-mono text-[8pt] bg-sand px-1 rounded">
                            vein new
                        </code>{' '}
                        in your terminal to create a project
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {/* None option */}
                    <button
                        type="button"
                        onClick={() => setProject(null)}
                        className={`w-full text-left px-4 sm:px-5 py-3 sm:py-3.5 rounded-[8pt]
                            flex items-center gap-3 transition-colors
                            ${
                                !project
                                    ? 'bg-tint text-ink ring-warm'
                                    : 'bg-ivory text-olive hover:bg-sand'
                            }`}
                    >
                        <span
                            className={`flex-shrink-0 w-2.5 h-2.5 rounded-full border-2 transition-colors
                                ${
                                    !project
                                        ? 'border-ink bg-ink'
                                        : 'border-cream'
                                }`}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="font-sans text-[9pt] sm:text-[9.5pt] font-medium text-olive">
                                None
                            </p>
                            <p className="font-sans text-[7.5pt] text-stone truncate">
                                No project selected
                            </p>
                        </div>
                    </button>

                    {projects.map((p) => (
                        <button
                            type="button"
                            key={p.name}
                            onClick={() =>
                                setProject(project === p.name ? null : p.name)
                            }
                            className={`w-full text-left px-4 sm:px-5 py-3 sm:py-3.5 rounded-[8pt]
                                flex items-center gap-3 transition-colors
                                ${
                                    project === p.name
                                        ? 'bg-tint text-ink ring-warm'
                                        : 'bg-ivory text-olive hover:bg-sand'
                                }`}
                        >
                            <span
                                className={`flex-shrink-0 w-2.5 h-2.5 rounded-full border-2 transition-colors
                                    ${
                                        project === p.name
                                            ? 'border-ink bg-ink'
                                            : 'border-cream'
                                    }`}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="font-sans text-[9pt] sm:text-[9.5pt] font-medium">
                                    {p.name}
                                </p>
                                <p className="font-mono text-[7pt] sm:text-[7.5pt] text-stone truncate">
                                    {p.path}
                                </p>
                            </div>
                            {project === p.name && (
                                <span className="flex-shrink-0 tag-calm ml-auto">
                                    Active
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
