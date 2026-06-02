import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { saveTagResult, tagger } from '../ai/index'
import { logger, resolveProjectRoot } from '../config'
import type { ModelProvider, ProjectConfig } from '../config/type'
import * as store from '../store'
import { mdToTree, renderDocOutline } from '../tree/markdown_split'
import { md5 } from '../utils/common'
import { segmentText } from '../utils/segment'

const log = logger.child({ module: 'import' })

export const IMPORT_PARALLEL = 4
export const TAG_PARALLEL = 4

export type ImportResult =
    | { status: 'imported'; docName: string; docId: string; nodeCount: number }
    | { status: 'skipped'; docName: string; docId: string }
    | { status: 'failed'; filePath: string; error: string }

export type ImportedResult = ImportResult & { status: 'imported' }
export type SkippedResult = ImportResult & { status: 'skipped' }
export type FailedResult = ImportResult & { status: 'failed' }

export type ImportProgress = {
    phase: 'parse' | 'write' | 'tag' | 'tag-save'
    message: string
    completed?: number
    total?: number
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

type ParsedFile = {
    docId: string
    docName: string
    filePath: string
    absolutePath: string
    relativePath: string
    tree: Awaited<ReturnType<typeof mdToTree>>
    rootSummary: string | undefined
    bodySummary: string | undefined
    needsCleanup: boolean
    structure: string
}

type ParseChunkResult =
    | { kind: 'ok'; parsed: ParsedFile }
    | { kind: 'skipped'; docName: string; docId: string }
    | { kind: 'error'; filePath: string; errMsg: string }

type Summarizer = (prompt: string) => Promise<string>

async function parseOneFile(
    fp: string,
    summarizer: Summarizer,
    segmenter: ModelProvider | undefined,
    force: boolean
): Promise<ParseChunkResult> {
    const absolutePath = path.resolve(fp)
    const docName = path.basename(absolutePath, '.md')
    const projectRoot = resolveProjectRoot()
    const relativePath = projectRoot
        ? path.relative(projectRoot, absolutePath)
        : absolutePath

    try {
        const content = await readFile(absolutePath, 'utf-8')
        const docId = md5(content)
        const existing = await store.getDoc(docId)
        if (existing && !force) {
            return { kind: 'skipped', docName, docId }
        }

        const tree = await mdToTree(docId, docName, content, {
            summary: { summarizer },
        })
        const rootSummary = tree.value.summary
        const structure = renderDocOutline(tree)
        const bodySummary = rootSummary
            ? await segmentText(rootSummary, segmenter)
            : undefined
        return {
            kind: 'ok',
            parsed: {
                docId,
                docName,
                filePath: fp,
                absolutePath,
                relativePath,
                tree,
                rootSummary,
                bodySummary,
                structure,
                needsCleanup: !!existing,
            },
        }
    } catch (err) {
        log.error({ err, filePath: fp, content: 'Markdown parse failed' })
        return { kind: 'error', filePath: fp, errMsg: getErrorMessage(err) }
    }
}

async function writeOneDocument(parsed: ParsedFile): Promise<number> {
    if (parsed.needsCleanup) {
        await store.deleteTree(parsed.docId)
        await store.deleteDoc(parsed.docId)
    }
    const nodeCount = await store.insertTree([parsed.tree], parsed.docId)
    await store.insertDoc(
        parsed.docId,
        {
            title: parsed.docName,
            sourcePath: parsed.relativePath,
            nodeCount,
        },
        parsed.bodySummary
    )
    return nodeCount
}

type TagEntry = {
    docId: string
    docName: string
    rootSummary: string
    structure: string
    nodeCount: number
}

async function tagOneDocument(
    entry: TagEntry,
    modelKeyStr: string,
    embeddingProvider: ModelProvider | undefined,
    categories: Array<{ id: string; name: string }>,
    existingTagsMap: Map<string, string[]>
): Promise<{ tagCount: number; categoryCount: number; error: boolean }> {
    try {
        const result = await tagger(entry.rootSummary, categories, {
            modelKey: modelKeyStr,
            existingTags: existingTagsMap,
            embeddingProvider,
            structure: entry.structure,
        })
        if (result.categories.length === 0) {
            return { tagCount: 0, categoryCount: 0, error: false }
        }
        const { tagCount, categoryCount } = await saveTagResult(
            entry.docId,
            result,
            embeddingProvider
        )
        return { tagCount, categoryCount, error: false }
    } catch (err) {
        log.warn({
            err,
            docId: entry.docId,
            content: 'Tag analysis failed',
        })
        return { tagCount: 0, categoryCount: 0, error: true }
    }
}

type BatchProgress = {
    phase: 'parse' | 'write' | 'tag-llm' | 'tag-save'
    message: string
    completed?: number
    total?: number
}

/**
 * Full import pipeline: parallel Phase 1 (parse+summarize) → serial DB write → parallel Phase 2 (tagger LLM) → serial tag save.
 * Returns structured results; progress callbacks enable CLI spinner updates.
 */
export async function importBatch(
    files: string[],
    config: ProjectConfig,
    summarizer: Summarizer,
    force: boolean,
    onProgress?: (p: BatchProgress) => void
): Promise<ImportResult[]> {
    const results: ImportResult[] = []
    const filesWithIndex = files.map((fp, i) => ({ fp, i }))
    const total = files.length
    let completed = 0

    const toTag: TagEntry[] = []

    // ── Phase 1: parallel LLM → serial DB ──
    for (let j = 0; j < files.length; j += IMPORT_PARALLEL) {
        const chunk = filesWithIndex.slice(j, j + IMPORT_PARALLEL)

        onProgress?.({
            phase: 'parse',
            message: `Parsing & summarizing (${completed}/${total})...`,
            completed,
            total,
        })

        const chunkResults = await Promise.all(
            chunk.map(({ fp }) =>
                parseOneFile(fp, summarizer, config.segmenter, force)
            )
        )

        completed += chunkResults.length
        onProgress?.({
            phase: 'parse',
            message: `Parsed & summarized (${completed}/${total})`,
            completed,
            total,
        })

        for (const r of chunkResults) {
            if (r.kind === 'error') {
                results.push({
                    status: 'failed',
                    filePath: r.filePath,
                    error: r.errMsg,
                })
                continue
            }
            if (r.kind === 'skipped') {
                results.push({
                    status: 'skipped',
                    docName: r.docName,
                    docId: r.docId,
                })
                continue
            }

            onProgress?.({
                phase: 'write',
                message: `Writing to database...`,
                completed: results.length + 1,
                total,
            })

            try {
                const nodeCount = await writeOneDocument(r.parsed)
                if (nodeCount <= 1) {
                    results.push({
                        status: 'imported',
                        docName: r.parsed.docName,
                        docId: r.parsed.docId,
                        nodeCount,
                    })
                    continue
                }
                if (r.parsed.rootSummary) {
                    toTag.push({
                        docId: r.parsed.docId,
                        docName: r.parsed.docName,
                        rootSummary: r.parsed.rootSummary,
                        structure: r.parsed.structure,
                        nodeCount,
                    })
                }
                results.push({
                    status: 'imported',
                    docName: r.parsed.docName,
                    docId: r.parsed.docId,
                    nodeCount,
                })
            } catch (err) {
                log.error({
                    err,
                    docId: r.parsed.docId,
                    content: 'DB write failed',
                })
                results.push({
                    status: 'failed',
                    filePath: r.parsed.filePath,
                    error: getErrorMessage(err),
                })
            }
        }
    }

    // ── Phase 2: parallel tagger → serial save ──
    if (toTag.length > 0) {
        const [categoryRows, existingTagsMap] = await Promise.all([
            store.getCategories(),
            store.getAllTagsGrouped(),
        ])
        const categories = categoryRows.map((c) => ({
            id: c.id,
            name: c.content,
        }))
        const mk = modelKey(config.model)

        // Parallel tagger LLM calls
        const taggerResults: Array<{
            entry: TagEntry
            tagCount: number
            categoryCount: number
            error: boolean
        }> = []
        let tagged = 0

        for (let j = 0; j < toTag.length; j += TAG_PARALLEL) {
            const chunk = toTag.slice(j, j + TAG_PARALLEL)
            onProgress?.({
                phase: 'tag-llm',
                message: `Analyzing tags (${tagged}/${toTag.length})...`,
                completed: tagged,
                total: toTag.length,
            })
            const chunkResults = await Promise.all(
                chunk.map((entry) =>
                    tagOneDocument(
                        entry,
                        mk,
                        config.embedding,
                        categories,
                        existingTagsMap
                    )
                )
            )
            tagged += chunk.length
            onProgress?.({
                phase: 'tag-llm',
                message: `Analyzed tags (${tagged}/${toTag.length})`,
                completed: tagged,
                total: toTag.length,
            })
            for (let k = 0; k < chunk.length; k++) {
                taggerResults.push({ entry: chunk[k]!, ...chunkResults[k]! })
            }
        }

        // Serial save notifications
        for (const { entry, tagCount, categoryCount, error } of taggerResults) {
            if (error) {
                onProgress?.({
                    phase: 'tag-save',
                    message: `${entry.docName}: Tag save failed`,
                })
                continue
            }
            if (tagCount === 0) {
                onProgress?.({
                    phase: 'tag-save',
                    message: `${entry.docName}: no tags extracted`,
                })
                continue
            }
            const tagsPart =
                tagCount > 0
                    ? `${tagCount} tag(s) / ${categoryCount} ${pluralize(categoryCount, 'category', 'categories')}`
                    : 'no tags extracted'
            onProgress?.({
                phase: 'tag-save',
                message: `${entry.docName} → ${entry.nodeCount} nodes, ${tagsPart}`,
            })
        }
    }

    return results
}

export { getErrorMessage, modelKey, pluralize }
