import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { SelectField } from '../components/SelectField.tsx'
import type { ModelInfo } from '../lib/api.ts'
import {
    fetchConfig,
    fetchModels,
    fetchProviders,
    fetchThinkingLevels,
    saveConfig,
} from '../lib/api.ts'
import { useProject } from '../lib/project.tsx'

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

    const { data: levels = [] } = useQuery({
        queryKey: ['thinking-levels'],
        queryFn: fetchThinkingLevels,
        staleTime: Number.POSITIVE_INFINITY,
    })

    const thinkingOptions = useMemo(
        () => [
            { value: '', label: 'off (default)' },
            ...levels
                .filter((l) => l !== 'off')
                .map((l) => ({ value: l, label: l })),
        ],
        [levels]
    )

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
                        className="w-full bg-transparent border-b border-cream px-0 py-[8pt]
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
                    <SelectField
                        id="thinkingLevel"
                        value={thinkingLevel}
                        onChange={setThinkingLevel}
                        options={thinkingOptions}
                    />
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

    const providerOptions = useMemo(
        () => [
            { value: '', label: optional ? '(use main)' : 'Select...' },
            ...providerList.map((p) => ({ value: p, label: p })),
        ],
        [providerList, optional]
    )

    const modelOptions = useMemo(
        () => [
            { value: '', label: 'Select...' },
            ...modelList.map((m) => ({
                value: m.id,
                label: m.name,
            })),
        ],
        [modelList]
    )

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
                <SelectField
                    value={provider}
                    onChange={onProviderChange}
                    options={providerOptions}
                    className="flex-1"
                />
                <SelectField
                    value={model}
                    onChange={onModelChange}
                    options={modelOptions}
                    disabled={!provider}
                    className="flex-1"
                />
            </div>
        </div>
    )
}
