#!/usr/bin/env bun
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
    autocomplete,
    confirm,
    intro,
    note,
    outro,
    select,
    spinner,
    text,
} from '@clack/prompts'
import { getModels, getProviders } from '@earendil-works/pi-ai'
import { Command } from 'commander'
import { generateEmbedding } from '../ai/embedding'
import type { LibrarianResult } from '../ai/index'
import {
    createSummarizer,
    extractAndSaveTags,
    librarian,
    setModelProvider,
} from '../ai/index'
import {
    getProjectRoot,
    initProject,
    loadProjectConfig,
    logger,
    veinDir,
} from '../config'
import type { ModelProvider, ProjectConfig } from '../config/type'
import * as store from '../store'
import { mdToTree } from '../tree/markdown_split'
import { md5 } from '../utils/common'

const log = logger.child({ module: 'vein' })

// ── helpers ────────────────────────────────────────────────────────

type HistoryEntry = {
    id: string
    query: string
    answer: string
    verdict?: string
    score?: number
    elapsedMs: number
    steps: number
    trace?: unknown[]
}

function historyDir(root: string): string {
    return path.join(root, veinDir, 'ask-history')
}

async function saveHistory(
    root: string,
    query: string,
    result: LibrarianResult,
    elapsedMs: number
): Promise<string> {
    const now = new Date()
    const id = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const dir = historyDir(root)
    await mkdir(dir, { recursive: true })

    const entry: HistoryEntry = {
        id,
        query,
        answer: result.content || '',
        verdict: result.review?.verdict,
        score: result.review?.score,
        elapsedMs,
        steps: result.trace.length,
        trace: result.trace,
    }

    await writeFile(
        path.join(dir, `${id}.json`),
        JSON.stringify(entry, null, 2)
    )

    return id
}

function getErrorMessage(err: unknown): string {
    return err instanceof Error
        ? err.message || 'Unknown error'
        : 'Unknown error'
}

function modelKey(provider: ModelProvider): string {
    return `${provider.provider}/${provider.model}`
}

function pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    const mins = Math.floor(ms / 60_000)
    const secs = Math.round((ms % 60_000) / 1000)
    return `${mins}m ${secs}s`
}

const VERDICT_ICON: Record<string, string> = {
    pass: '✓',
    partial: '!',
    fail: '✗',
}

function createCachedSummarizer(config: ProjectConfig) {
    const summaryProvider = config.summarizer ?? config.model
    const key = modelKey(summaryProvider)
    const raw = createSummarizer(config.summarizer)

    return async (prompt: string): Promise<string> => {
        const hash = md5(prompt)
        const cached = await store.getCachedResponse(hash, key)
        if (cached) {
            log.info({ hash, modelKey: key, content: 'Summary cache hit' })
            return cached
        }
        let timer: ReturnType<typeof setTimeout>
        const response = await Promise.race([
            raw(prompt),
            new Promise<never>(
                (_, reject) =>
                    (timer = setTimeout(
                        () => reject(new Error('Summarizer timeout after 60s')),
                        60_000
                    ))
            ),
        ])
        clearTimeout(timer!)
        await store.setCachedResponse(hash, key, response)
        log.info({ hash, modelKey: key, content: 'Summary cached' })
        return response
    }
}

// ── project setup ──────────────────────────────────────────────────

async function setupProjectModel(): Promise<ProjectConfig | undefined> {
    const root = getProjectRoot(process.cwd())
    if (!root) {
        return
    }
    const config = await loadProjectConfig(root)
    if (config?.model) {
        setModelProvider(config.model)
    }
    return config
}

// ── CLI ────────────────────────────────────────────────────────────

const vein = new Command()
    .name('vein')
    .description('AI-powered document management')

// ── new ────────────────────────────────────────────────────────────

vein.command('new')
    .description('initialize a vein project in the current directory')
    .argument('[name]', 'project name')
    .option('--migrate', 're-run migrations on an existing project')
    .action(async (name?: string, options?: { migrate?: boolean }) => {
        const cwd = process.cwd()
        const root = getProjectRoot(cwd)

        if (options?.migrate && root) {
            const config = await loadProjectConfig(root)
            const dbPath = path.join(root, config?.db ?? '.vein/data.db')
            const { runMigrations } = await import('../store/migrate')
            await runMigrations(dbPath)
            log.info({ dbPath, content: 'Migrations re-run' })
            outro('Migrations applied')
            return
        }

        let projectName = name
        if (!projectName) {
            const raw = await text({
                message: 'Project name:',
                placeholder: path.basename(cwd),
            })
            if (typeof raw !== 'string') {
                outro('Cancelled')
                return
            }
            projectName = raw
        }

        const rawProvider = await select({
            message: 'Default AI provider:',
            options: getProviders().map((p) => ({
                value: p as string,
                label: p,
            })),
        })
        if (typeof rawProvider !== 'string') {
            outro('Cancelled')
            return
        }
        const provider = rawProvider as ModelProvider['provider']

        const providerModels = getModels(provider)
        const modelOptions = providerModels.map((m) => ({
            value: m.id,
            label: `${m.id} (${m.name})`,
        }))
        const defaultModel = providerModels[0]?.id

        const rawModel = await autocomplete({
            message: 'Default model:',
            placeholder: defaultModel ?? 'model-name',
            options: modelOptions,
            initialValue: defaultModel,
        })
        if (typeof rawModel !== 'string') {
            outro('Cancelled')
            return
        }

        // Optional embedding config for tag deduplication
        let embedding: ModelProvider | undefined
        const useEmbedding = await confirm({
            message: 'Configure embedding for tag deduplication?',
            initialValue: false,
        })
        if (useEmbedding === true) {
            const rawEmbed = await text({
                message: 'Embedding model (OpenRouter model ID):',
                placeholder: 'openai/text-embedding-3-small',
                defaultValue: 'openai/text-embedding-3-small',
            })
            if (typeof rawEmbed === 'string' && rawEmbed.trim()) {
                embedding = {
                    provider: 'openrouter' as ModelProvider['provider'],
                    model: rawEmbed.trim(),
                }
            }
        }

        const initSpinner = spinner()
        initSpinner.start('Initializing project...')
        try {
            const config = await initProject(
                cwd,
                projectName,
                {
                    provider,
                    model: rawModel,
                },
                embedding
            )
            setModelProvider(config.model)
            initSpinner.stop('Initialized')
            log.info({ name: projectName, cwd, content: 'Project initialized' })
            note('Created .vein/')
            outro(`Project "${config.name}" initialized`)
        } catch (err) {
            initSpinner.stop('Failed')
            if (
                err instanceof Error &&
                err.message.startsWith('already initialized')
            ) {
                outro(err.message)
                process.exit(1)
            }
            throw err
        }
    })

// ── markdown ───────────────────────────────────────────────────────

type ImportResult =
    | { status: 'imported'; docName: string; docId: string; nodeCount: number }
    | { status: 'skipped'; docName: string; docId: string }
    | { status: 'failed'; filePath: string; error: string }

type ImportFileOptions = {
    config: ProjectConfig
    force: boolean
    summarizer: ReturnType<typeof createCachedSummarizer>
    prefix: string
    batch: boolean
}

async function importMarkdownFile(
    filePath: string,
    opts: ImportFileOptions
): Promise<ImportResult> {
    const { config, force, summarizer, prefix, batch } = opts

    const absolutePath = path.resolve(filePath)
    const docName = path.basename(absolutePath, '.md')
    const projectRoot = getProjectRoot(process.cwd())
    const relativePath = projectRoot
        ? path.relative(projectRoot, absolutePath)
        : absolutePath

    // ── batch mode: single spinner, message updates ──
    if (batch) {
        const s = spinner()
        s.start(`${prefix}Reading...`)
        const content = await readFile(absolutePath, 'utf-8')

        const docId = md5(content)
        const existing = await store.getDoc(docId)
        if (existing) {
            if (!force) {
                s.stop(`${prefix}Skipped: already imported`)
                return { status: 'skipped', docName, docId }
            }
            await store.deleteTree(docId)
            await store.deleteDoc(docId)
        }

        s.message(`${prefix}Parsing & summarizing...`)
        const tree = await mdToTree(docId, docName, content, {
            summary: { summarizer },
        })

        s.message(`${prefix}Writing to database...`)
        const nodeCount = await store.insertTree([tree], docId)
        await store.insertDoc(docId, {
            title: docName,
            sourcePath: relativePath,
            nodeCount,
        })

        if (nodeCount <= 1) {
            note(
                `${docName}: No headings found in markdown — no structure extracted.`
            )
        }

        const rootSummary = tree.value.summary
        if (rootSummary) {
            s.message(`${prefix}Extracting tags...`)
            let tagCount = 0
            let categoryCount = 0
            try {
                const result = await extractAndSaveTags(
                    docId,
                    rootSummary,
                    modelKey(config.model),
                    config.embedding,
                    (progress) => {
                        if (progress.phase === 'saving' && progress.total) {
                            s.message(
                                `${prefix}Tagging ${progress.saved}/${progress.total}...`
                            )
                        }
                    }
                )
                tagCount = result.tagCount
                categoryCount = result.categoryCount
            } catch (err) {
                log.warn({ err, docId, content: 'Tag extraction failed' })
            }

            const tagsPart =
                tagCount > 0
                    ? `${tagCount} tag(s) / ${categoryCount} ${pluralize(categoryCount, 'category', 'categories')}`
                    : 'no tags extracted'
            s.stop(`${prefix}${docName} → ${nodeCount} nodes, ${tagsPart}`)
        } else {
            s.stop(`${prefix}${docName} → ${nodeCount} nodes`)
        }

        return { status: 'imported', docName, docId, nodeCount }
    }

    // ── single-file mode: detailed per-phase spinners ──
    const readSpinner = spinner()
    readSpinner.start(`Reading ${docName}.md...`)
    const content = await readFile(absolutePath, 'utf-8')
    readSpinner.stop(`Read ${docName}.md`)

    const docId = md5(content)

    const existing = await store.getDoc(docId)
    if (existing) {
        if (!force) {
            log.info({ docId, docName, content: 'Already imported, skipping' })
            return { status: 'skipped', docName, docId }
        }
        log.warn({ docId, content: 'Force re-importing' })
        await store.deleteTree(docId)
        await store.deleteDoc(docId)
    }

    const parseSpinner = spinner()
    parseSpinner.start('Parsing and analyzing...')
    const tree = await mdToTree(docId, docName, content, {
        summary: { summarizer },
    })
    parseSpinner.stop('Document analyzed')

    const insertSpinner = spinner()
    insertSpinner.start('Saving to database...')
    const nodeCount = await store.insertTree([tree], docId)
    await store.insertDoc(docId, {
        title: docName,
        sourcePath: relativePath,
        nodeCount,
    })
    insertSpinner.stop('Saved to database')

    if (nodeCount <= 1) {
        note(
            `${docName}: No headings found in markdown — no structure extracted.`
        )
    }

    const rootSummary = tree.value.summary
    if (rootSummary) {
        const tagSpinner = spinner()
        tagSpinner.start('Tagging: fetching categories...')
        try {
            const { tagCount, categoryCount } = await extractAndSaveTags(
                docId,
                rootSummary,
                modelKey(config.model),
                config.embedding,
                (progress) => {
                    switch (progress.phase) {
                        case 'analyzing':
                            tagSpinner.message('Tagging: analyzing content...')
                            break
                        case 'saving':
                            tagSpinner.message(
                                `Tagging: saving ${progress.saved}/${progress.total} tags...`
                            )
                            break
                    }
                }
            )
            tagSpinner.stop(
                `Extracted ${tagCount} tag(s) across ${categoryCount} ${pluralize(categoryCount, 'category', 'categories')}`
            )
            log.info({
                docId,
                tagCount,
                categoryCount,
                content: 'Tags extracted',
            })
        } catch (err) {
            tagSpinner.stop('Tag extraction failed')
            log.warn({ err, docId, content: 'Tag extraction failed' })
        }
    }

    log.info({ docId, docName, nodeCount, content: 'Import complete' })
    return { status: 'imported', docName, docId, nodeCount }
}

type ImportedResult = ImportResult & { status: 'imported' }
type SkippedResult = ImportResult & { status: 'skipped' }
type FailedResult = ImportResult & { status: 'failed' }

vein.command('markdown')
    .alias('md')
    .description('import markdown file(s) into the library')
    .argument('<files...>', 'path(s) to markdown file(s)')
    .option('-f, --force', 'force re-import even if already exists')
    .action(async (files: string[], options: { force?: boolean }) => {
        const config = await setupProjectModel()
        if (!config) {
            outro('Not in a vein project. Run "vein new" first.')
            return
        }

        const total = files.length
        const force = options.force ?? false
        const summarize = createCachedSummarizer(config)

        intro(
            total > 1
                ? `Importing ${total} markdown documents`
                : 'Importing markdown document'
        )

        const results: ImportResult[] = []
        const batch = total > 1
        for (const [i, fp] of files.entries()) {
            const prefix = batch ? `[${i + 1}/${total}] ` : ''
            try {
                results.push(
                    await importMarkdownFile(fp, {
                        config,
                        force,
                        summarizer: summarize,
                        prefix,
                        batch,
                    })
                )
            } catch (err) {
                log.error({
                    err,
                    filePath: fp,
                    content: 'Markdown import failed',
                })
                results.push({
                    status: 'failed',
                    filePath: fp,
                    error: getErrorMessage(err),
                })
            }
        }

        const imported = results.filter(
            (r): r is ImportedResult => r.status === 'imported'
        )
        const skipped = results.filter(
            (r): r is SkippedResult => r.status === 'skipped'
        )
        const failed = results.filter(
            (r): r is FailedResult => r.status === 'failed'
        )

        if (total > 1) {
            const lines: string[] = []
            if (imported.length > 0) {
                lines.push(
                    `Imported: ${imported.length} (${imported.map((r) => r.docName).join(', ')})`
                )
            }
            if (skipped.length > 0) {
                lines.push(
                    `Skipped: ${skipped.length} (${skipped.map((r) => r.docName).join(', ')})`
                )
            }
            if (failed.length > 0) {
                lines.push(
                    `Failed: ${failed.length} (${failed.map((r) => path.basename(r.filePath)).join(', ')})`
                )
            }
            note(lines.join('\n'))
        } else {
            const [result] = results
            if (result?.status === 'imported') {
                note(
                    `Title: ${result.docName}\nID: ${result.docId.slice(0, 8)}\nNodes: ${result.nodeCount}`
                )
            } else if (result?.status === 'skipped') {
                note(
                    `Skipped: "${result.docName}" already exists (id: ${result.docId.slice(0, 8)})`
                )
            }
        }

        if (failed.length > 0) {
            outro(
                `Done with ${failed.length} error(s) — ${imported.length} imported, ${skipped.length} skipped`
            )
        } else {
            outro(
                imported.length > 0
                    ? `${imported.length} imported`
                    : `${skipped.length} skipped`
            )
        }
    })

// ── ask ────────────────────────────────────────────────────────────

vein.command('ask')
    .description('query the document library using the librarian agent')
    .argument('[query]', 'search query (required if --no-interactive)')
    .option('-n, --no-interactive', 'disable interactive prompt, output JSON')
    .option('-t, --trace', 'show retrieval trace in output')
    .action(
        async (
            queryArg?: string,
            options?: {
                noInteractive?: boolean
                interactive?: boolean
                trace?: boolean
            }
        ) => {
            const interactive = options?.interactive ?? true
            const showTrace = options?.trace ?? false

            const config = await setupProjectModel()
            if (!config) {
                if (!interactive) {
                    console.error(
                        JSON.stringify({ error: 'Not in a vein project' })
                    )
                    process.exit(1)
                }
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            let query: string

            if (interactive) {
                if (queryArg) {
                    query = queryArg
                } else {
                    intro('Vein Librarian')
                    const raw = await text({
                        message: 'What would you like to find?',
                        placeholder: 'e.g. 查找关于 JVM GC 的文档',
                    })
                    if (typeof raw !== 'string') {
                        outro('Cancelled')
                        return
                    }
                    query = raw
                }
            } else {
                if (!queryArg) {
                    console.error(
                        JSON.stringify({
                            error: 'Query argument required when --no-interactive',
                        })
                    )
                    process.exit(1)
                }
                query = queryArg
            }

            const searchSpinner = interactive ? spinner() : undefined
            searchSpinner?.start('Searching...')

            const startedAt = performance.now()
            let result: LibrarianResult
            try {
                result = await librarian(
                    query,
                    searchSpinner
                        ? (label) => searchSpinner.message(label)
                        : undefined,
                    config.embedding
                )
            } catch (err) {
                searchSpinner?.stop('Search failed')
                if (!interactive) {
                    console.error(
                        JSON.stringify({ error: getErrorMessage(err) })
                    )
                    process.exit(1)
                }
                log.error({ err, content: 'Librarian search failed' })
                outro('Search failed')
                return
            }
            const elapsedMs = Math.round(performance.now() - startedAt)
            const elapsed = formatDuration(elapsedMs)

            const projectRoot = getProjectRoot(process.cwd())
            if (projectRoot) {
                saveHistory(projectRoot, query, result, elapsedMs).catch(
                    (err) =>
                        log.warn({ err, content: 'Failed to save ask history' })
                )
            }

            searchSpinner?.stop(
                result.review
                    ? `${result.review.verdict} (${result.review.score}/5) · ${elapsed}`
                    : `Done · ${elapsed}`
            )

            if (!interactive) {
                console.log(JSON.stringify({ ...result, elapsedMs }))
                return
            }

            note(result.content || '(no results found)')

            if (result.review) {
                const icon =
                    VERDICT_ICON[result.review.verdict] ?? result.review.verdict
                note(
                    `${icon} Review: ${result.review.verdict} (${result.review.score}/5)\n${result.review.reason}`
                )
            }

            if (showTrace && result.trace.length > 0) {
                const traceSummary = result.trace
                    .map((s) => `  ${s.tool} → ${s.resultSummary}`)
                    .join('\n')
                note(`Trace:\n${traceSummary}`)
            }

            log.info({
                query,
                elapsedMs,
                verdict: result.review?.verdict,
                score: result.review?.score,
                steps: result.trace.length,
                content: 'Librarian query complete',
            })

            outro('Done')
        }
    )

// ── history ───────────────────────────────────────────────────────

vein.command('history')
    .alias('hs')
    .description('review past ask sessions')
    .option('-l, --last', 'show the most recent session')
    .option('-L, --list', 'list sessions without interactive picker')
    .option(
        '-p, --page <n>',
        'page number for --list (20 per page)',
        (v) => Math.max(1, parseInt(v, 10) || 1),
        1
    )
    .action(
        async (options?: { last?: boolean; list?: boolean; page?: number }) => {
            const root = getProjectRoot(process.cwd())
            if (!root) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            const dir = historyDir(root)
            let files: string[]
            try {
                files = (await readdir(dir))
                    .filter((f) => f.endsWith('.json'))
                    .sort()
                    .reverse()
            } catch {
                outro('No ask history found.')
                return
            }

            if (files.length === 0) {
                outro('No ask history found.')
                return
            }

            const loadEntry = async (filename: string) => {
                const raw = await readFile(path.join(dir, filename), 'utf-8')
                return JSON.parse(raw) as HistoryEntry
            }

            if (options?.last) {
                const entry = await loadEntry(files[0]!)
                note(formatHistoryDetail(entry))
                return
            }

            const PER_PAGE = 20
            const page = options?.page ?? 1
            const totalPages = Math.ceil(files.length / PER_PAGE)
            const paged = files.slice((page - 1) * PER_PAGE, page * PER_PAGE)

            if (options?.list) {
                intro(`Ask History (${files.length} total)`)
                for (const f of paged) {
                    const entry = await loadEntry(f)
                    const verdictStr = entry.verdict
                        ? `${entry.verdict} ${entry.score ?? '?'}/5`
                        : '—'
                    const queryPreview =
                        entry.query.length > 60
                            ? `${entry.query.slice(0, 60)}...`
                            : entry.query
                    note(
                        `${entry.id}  ${formatDuration(entry.elapsedMs).padEnd(6)}  ${verdictStr.padEnd(14)}  ${queryPreview}`
                    )
                }
                if (totalPages > 1) {
                    outro(`Page ${page}/${totalPages} · use -p <n> to navigate`)
                } else {
                    outro(`${files.length} session(s)`)
                }
                return
            }

            // Interactive picker (loop until user cancels)
            const buildChoices = async () => {
                const items = await Promise.all(
                    paged.map(async (f) => {
                        const entry = await loadEntry(f)
                        const verdictStr = entry.verdict
                            ? `${entry.verdict} ${entry.score ?? '?'}/5`
                            : '—'
                        const queryPreview =
                            entry.query.length > 50
                                ? `${entry.query.slice(0, 50)}...`
                                : entry.query
                        return {
                            value: f,
                            label: `${entry.id} │ ${verdictStr.padEnd(12)} │ ${queryPreview}`,
                            hint: formatDuration(entry.elapsedMs),
                        }
                    })
                )
                if (totalPages > 1) {
                    items.push({
                        value: '__next__',
                        label: `─── Page ${page}/${totalPages} · next page ───`,
                        hint: `use -p ${page + 1} to jump`,
                    })
                }
                return items
            }

            intro(`Ask History (${files.length} total)`)

            while (true) {
                const choices = await buildChoices()
                const selected = await select({
                    message: 'Select a session (Esc to exit)',
                    options: choices,
                })

                if (!selected || typeof selected !== 'string') {
                    outro('Done')
                    return
                }

                if (selected === '__next__') {
                    outro(`Run: vein history -p ${page + 1}`)
                    return
                }

                const entry = await loadEntry(selected)
                note(formatHistoryDetail(entry))
            }
        }
    )

function formatHistoryDetail(entry: HistoryEntry): string {
    const lines = [
        `Query:   ${entry.query}`,
        `Time:    ${entry.id}  (${formatDuration(entry.elapsedMs)}, ${entry.steps} steps)`,
    ]
    if (entry.verdict) {
        lines.push(`Review:  ${entry.verdict} (${entry.score}/5)`)
    }
    lines.push('', entry.answer || '(no answer)')
    return lines.join('\n')
}

// ── tags ──────────────────────────────────────────────────────────

vein.command('tags')
    .description('manage tags')
    .addCommand(
        new Command('backfill-embeddings')
            .description('generate embeddings for all tags that lack them')
            .action(async () => {
                const config = await setupProjectModel()
                if (!config) {
                    outro('Not in a vein project. Run "vein new" first.')
                    return
                }
                if (!config.embedding) {
                    outro(
                        'No embedding configured. Run "vein new" again or add "embedding" to .vein/config.json.'
                    )
                    return
                }

                intro('Backfilling tag embeddings')

                const orphanTags = await store.getTagsWithoutEmbeddings()

                if (orphanTags.length === 0) {
                    outro('All tags already have embeddings.')
                    return
                }

                note(`Found ${orphanTags.length} tag(s) without embeddings`)

                let done = 0
                let failed = 0
                const backfillSpinner = spinner()
                backfillSpinner.start('Embedding...')

                for (const t of orphanTags) {
                    backfillSpinner.message(
                        `[${done + 1}/${orphanTags.length}] Embedding: ${t.tag}`
                    )
                    try {
                        const emb = await generateEmbedding(
                            t.tag,
                            config.embedding
                        )
                        await store.upsertTagEmbedding(t.id, emb)
                        done++
                    } catch (err) {
                        failed++
                        log.warn({
                            err,
                            tagId: t.id,
                            tag: t.tag,
                            content: 'Embedding backfill failed',
                        })
                    }
                }

                backfillSpinner.stop(`Done: ${done} embedded, ${failed} failed`)
                outro(
                    failed > 0
                        ? `Backfilled ${done} tag(s), ${failed} failed (see log for details)`
                        : `Backfilled ${done} tag(s)`
                )
            })
    )
    .addCommand(
        new Command('clear-embeddings')
            .description(
                'drop the tag_embeddings vec0 table (required before switching embedding model)'
            )
            .action(async () => {
                const config = await setupProjectModel()
                if (!config) {
                    outro('Not in a vein project. Run "vein new" first.')
                    return
                }

                const { getRawClient: getRaw } = await import('../store/client')
                try {
                    getRaw().execute('DROP TABLE IF EXISTS tag_embeddings')
                    outro(
                        'tag_embeddings table dropped. Run "vein tags backfill-embeddings" to regenerate.'
                    )
                } catch (err) {
                    log.error({
                        err,
                        content: 'Failed to drop tag_embeddings',
                    })
                    outro('Failed to drop tag_embeddings table.')
                }
            })
    )

vein.parse()
