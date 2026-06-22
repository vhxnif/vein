import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ModelInfo } from '../lib/api'
import {
    fetchConfig,
    fetchModels,
    fetchProviders,
    saveConfig,
} from '../lib/api'
import { useProject } from '../lib/project'

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
})

function SettingsPage() {
    const { project, projects } = useProject()
    const queryClient = useQueryClient()
    const [saved, setSaved] = useState(false)

    const {
        data: configData,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['config', project],
        queryFn: () => fetchConfig(),
    })

    const config = configData?.config
    const [name, setName] = useState(config?.name ?? '')
    const [mainProvider, setMainProvider] = useState(
        config?.model?.provider ?? ''
    )
    const [mainModel, setMainModel] = useState(config?.model?.model ?? '')
    const [summarizerProvider, setSummarizerProvider] = useState(
        config?.summarizer?.provider ?? ''
    )
    const [summarizerModel, setSummarizerModel] = useState(
        config?.summarizer?.model ?? ''
    )
    const [segmenterProvider, setSegmenterProvider] = useState(
        config?.segmenter?.provider ?? ''
    )
    const [segmenterModel, setSegmenterModel] = useState(
        config?.segmenter?.model ?? ''
    )
    const [subagentProvider, setSubagentProvider] = useState(
        config?.subagent?.provider ?? ''
    )
    const [subagentModel, setSubagentModel] = useState(
        config?.subagent?.model ?? ''
    )
    const [reviewerProvider, setReviewerProvider] = useState(
        config?.reviewer?.provider ?? ''
    )
    const [reviewerModel, setReviewerModel] = useState(
        config?.reviewer?.model ?? ''
    )
    const [thinkingLevel, setThinkingLevel] = useState(
        config?.thinkingLevel ?? ''
    )

    // Sync state when config loads
    if (config && name !== config.name && config.name) {
        setName(config.name)
        setMainProvider(config.model?.provider ?? '')
        setMainModel(config.model?.model ?? '')
        setSummarizerProvider(config.summarizer?.provider ?? '')
        setSummarizerModel(config.summarizer?.model ?? '')
        setSegmenterProvider(config.segmenter?.provider ?? '')
        setSegmenterModel(config.segmenter?.model ?? '')
        setSubagentProvider(config.subagent?.provider ?? '')
        setSubagentModel(config.subagent?.model ?? '')
        setReviewerProvider(config.reviewer?.provider ?? '')
        setReviewerModel(config.reviewer?.model ?? '')
        setThinkingLevel(config.thinkingLevel ?? '')
    }

    const saveMutation = useMutation({
        mutationFn: () =>
            saveConfig({
                name,
                model: { provider: mainProvider, model: mainModel },
                summarizer: summarizerProvider
                    ? { provider: summarizerProvider, model: summarizerModel }
                    : undefined,
                segmenter: segmenterProvider
                    ? { provider: segmenterProvider, model: segmenterModel }
                    : undefined,
                subagent: subagentProvider
                    ? { provider: subagentProvider, model: subagentModel }
                    : undefined,
                reviewer: reviewerProvider
                    ? { provider: reviewerProvider, model: reviewerModel }
                    : undefined,
                thinkingLevel: thinkingLevel || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config'] })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        },
    })

    if (!project) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-10">
                    Settings
                </h1>
                <p className="font-sans text-[9pt] text-stone">
                    No project selected — select one from the sidebar
                </p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <p className="font-sans text-[9pt] text-olive">Loading...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-10">
                    Settings
                </h1>
                <p className="font-sans text-[9pt] text-error">
                    Failed to load config:{' '}
                    {error instanceof Error ? error.message : String(error)}
                </p>
            </div>
        )
    }

    if (!config) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <h1 className="font-serif text-[20pt] font-medium leading-tight text-near-black mb-10">
                    Settings
                </h1>
                <p className="font-sans text-[9pt] text-olive">
                    No config found for this project.
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-[560px] mx-auto px-8 py-16">
            <h1 className="font-serif text-[20pt] font-medium leading-tight text-ink mb-10">
                Settings
            </h1>

            {/* Project */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-olive mb-4">
                    Project
                </h3>
                <div className="space-y-1">
                    <label
                        htmlFor="name"
                        className="block font-sans text-[8.5pt] text-stone"
                    >
                        Name
                    </label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        className="w-full bg-transparent border-b border-cream px-0 py-2
                                   font-serif text-[10pt] text-near-black outline-none
                                   focus:border-ink transition-colors"
                    />
                </div>
            </section>

            {/* Models */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-olive mb-4">
                    Models
                </h3>

                <ModelRow
                    label="Main Model"
                    provider={mainProvider}
                    model={mainModel}
                    onProviderChange={(p) => {
                        setMainProvider(p)
                        setMainModel('')
                    }}
                    onModelChange={setMainModel}
                />
                <ModelRow
                    label="Summary Model"
                    provider={summarizerProvider}
                    model={summarizerModel}
                    onProviderChange={(p) => {
                        setSummarizerProvider(p)
                        setSummarizerModel('')
                    }}
                    onModelChange={setSummarizerModel}
                    optional
                />
                <ModelRow
                    label="Segmentation Model"
                    provider={segmenterProvider}
                    model={segmenterModel}
                    onProviderChange={(p) => {
                        setSegmenterProvider(p)
                        setSegmenterModel('')
                    }}
                    onModelChange={setSegmenterModel}
                    optional
                />
                <ModelRow
                    label="Sub-Agent Model"
                    provider={subagentProvider}
                    model={subagentModel}
                    onProviderChange={(p) => {
                        setSubagentProvider(p)
                        setSubagentModel('')
                    }}
                    onModelChange={setSubagentModel}
                    optional
                />
                <ModelRow
                    label="Review Model"
                    provider={reviewerProvider}
                    model={reviewerModel}
                    onProviderChange={(p) => {
                        setReviewerProvider(p)
                        setReviewerModel('')
                    }}
                    onModelChange={setReviewerModel}
                    optional
                />
            </section>

            {/* Thinking */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-olive mb-4">
                    Thinking
                </h3>
                <div className="space-y-1">
                    <label
                        htmlFor="thinkingLevel"
                        className="block font-sans text-[8.5pt] text-stone"
                    >
                        Reasoning level
                    </label>
                    <select
                        id="thinkingLevel"
                        value={thinkingLevel}
                        onChange={(e) =>
                            setThinkingLevel(e.currentTarget.value)
                        }
                        className="w-full bg-ivory border border-cream rounded-[6pt]
                                   px-3 py-2 font-sans text-[9pt] text-near-black
                                   outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-ink transition-colors"
                    >
                        <option value="">off (default)</option>
                        <option value="minimal">minimal</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="xhigh">xhigh</option>
                    </select>
                    <p className="font-sans text-[7.5pt] text-stone mt-1">
                        Enables the model to show its reasoning process. Higher
                        levels use more tokens.
                    </p>
                </div>
            </section>

            {/* Database */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-olive mb-4">
                    Database
                </h3>
                <p className="font-sans text-[9pt] text-olive">
                    {(() => {
                        const dbRel = (config.db || '.vein/data.db').replace(
                            /^\.\//,
                            ''
                        )
                        const root = projects.find(
                            (p) => p.name === project
                        )?.path
                        const raw = root ? `${root}/${dbRel}` : dbRel
                        return raw.replaceAll('\\', '/')
                    })()}
                </p>
            </section>

            {/* Save */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                >
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                {saved && (
                    <span className="font-sans text-[8.5pt] text-ink">
                        ✓ Saved
                    </span>
                )}
            </div>
        </div>
    )
}

function ModelRow({
    label,
    provider,
    model,
    onProviderChange,
    onModelChange,
    optional,
}: {
    label: string
    provider: string
    model: string
    onProviderChange: (p: string) => void
    onModelChange: (m: string) => void
    optional?: boolean
}) {
    const { data: providers } = useQuery({
        queryKey: ['providers'],
        queryFn: fetchProviders,
        staleTime: 300_000,
    })

    const { data: models } = useQuery({
        queryKey: ['models', provider],
        queryFn: () => fetchModels(provider),
        enabled: !!provider,
        staleTime: 300_000,
    })

    const providerList = providers ?? []
    const modelList: ModelInfo[] = models ?? []

    return (
        <div className="mb-5">
            <div className="flex items-center gap-3 mb-1">
                <span className="font-sans text-[8.5pt] text-stone whitespace-nowrap">
                    {label}
                </span>
                {optional && !provider && (
                    <span className="font-sans text-[7.5pt] text-stone italic">
                        (use main)
                    </span>
                )}
            </div>
            <div className="flex gap-3">
                <select
                    value={provider}
                    onChange={(e) => onProviderChange(e.currentTarget.value)}
                    className="flex-1 bg-ivory border border-cream rounded-[6pt]
                               px-3 py-2 font-sans text-[9pt] text-near-black
                               outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-ink transition-colors"
                >
                    <option value="">
                        {optional ? '(use main)' : 'Select...'}
                    </option>
                    {providerList.map((p) => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
                <select
                    value={model}
                    onChange={(e) => onModelChange(e.currentTarget.value)}
                    disabled={!provider}
                    className="flex-1 bg-ivory border border-cream rounded-[6pt]
                               px-3 py-2 font-sans text-[9pt] text-near-black
                               outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-ink transition-colors
                               disabled:opacity-50"
                >
                    <option value="">Select...</option>
                    {modelList.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.id} ({m.name})
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}
