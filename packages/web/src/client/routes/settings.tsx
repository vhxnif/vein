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

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
})

function SettingsPage() {
    const queryClient = useQueryClient()
    const [saved, setSaved] = useState(false)

    const { data: configData, isLoading } = useQuery({
        queryKey: ['config'],
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

    // Sync state when config loads
    if (config && name !== config.name && config.name) {
        setName(config.name)
        setMainProvider(config.model?.provider ?? '')
        setMainModel(config.model?.model ?? '')
        setSummarizerProvider(config.summarizer?.provider ?? '')
        setSummarizerModel(config.summarizer?.model ?? '')
    }

    const saveMutation = useMutation({
        mutationFn: () =>
            saveConfig({
                name,
                model: { provider: mainProvider, model: mainModel },
                summarizer: summarizerProvider
                    ? { provider: summarizerProvider, model: summarizerModel }
                    : undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config'] })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        },
    })

    if (isLoading) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <p className="font-sans text-[9pt] text-[#504e49]">
                    Loading...
                </p>
            </div>
        )
    }

    if (!config) {
        return (
            <div className="max-w-[560px] mx-auto px-8 py-16">
                <p className="font-sans text-[9pt] text-[#504e49]">
                    No project selected. Select a project first.
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-[560px] mx-auto px-8 py-16">
            <h1 className="font-serif text-[20pt] font-medium leading-tight text-[#141413] mb-10">
                设置
            </h1>

            {/* Project */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-[#504e49] mb-4">
                    项目
                </h3>
                <div className="space-y-1">
                    <label
                        htmlFor="name"
                        className="block font-sans text-[8.5pt] text-[#6b6a64]"
                    >
                        Name
                    </label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        className="w-full bg-transparent border-b border-[#d4d0c4] px-0 py-2
                                   font-serif text-[10pt] text-[#141413] outline-none
                                   focus:border-[#1B365D] transition-colors"
                    />
                </div>
            </section>

            {/* Models */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-[#504e49] mb-4">
                    模型
                </h3>

                <ModelRow
                    label="主模型"
                    provider={mainProvider}
                    model={mainModel}
                    onProviderChange={(p) => {
                        setMainProvider(p)
                        setMainModel('')
                    }}
                    onModelChange={setMainModel}
                />
                <ModelRow
                    label="摘要模型"
                    provider={summarizerProvider}
                    model={summarizerModel}
                    onProviderChange={(p) => {
                        setSummarizerProvider(p)
                        setSummarizerModel('')
                    }}
                    onModelChange={setSummarizerModel}
                    optional
                />
            </section>

            {/* Database */}
            <section className="mb-10">
                <h3 className="font-serif text-[12pt] font-medium text-[#504e49] mb-4">
                    数据库
                </h3>
                <p className="font-sans text-[9pt] text-[#504e49]">
                    {config.db || '.vein/data.db'}
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
                    <span className="font-sans text-[8.5pt] text-[#1B365D]">
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
                <span className="font-sans text-[8.5pt] text-[#6b6a64] w-16">
                    {label}
                </span>
                {optional && !provider && (
                    <span className="font-sans text-[7.5pt] text-[#6b6a64] italic">
                        (use main)
                    </span>
                )}
            </div>
            <div className="flex gap-3">
                <select
                    value={provider}
                    onChange={(e) => onProviderChange(e.currentTarget.value)}
                    className="flex-1 bg-[#faf9f5] border border-[#d4d0c4] rounded-[6pt]
                               px-3 py-2 font-sans text-[9pt] text-[#141413]
                               outline-none focus:border-[#1B365D] transition-colors"
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
                    className="flex-1 bg-[#faf9f5] border border-[#d4d0c4] rounded-[6pt]
                               px-3 py-2 font-sans text-[9pt] text-[#141413]
                               outline-none focus:border-[#1B365D] transition-colors
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
