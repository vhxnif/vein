import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { logger, resolveProjectRoot } from '../config'
import type { ModelProvider, ProjectConfig } from '../config/type'
import * as store from '../store'
import { mdToTree } from '../tree/markdown_split'
import type { DocNode } from '../tree/type'
import { getErrorMessage, md5 } from '../utils/common'
import { segmentText } from '../utils/segment'

const log = logger.child({ module: 'import' })

export const IMPORT_PARALLEL = 4

export type ImportResult =
    | { status: 'imported'; docName: string; docId: string; nodeCount: number }
    | { status: 'skipped'; docName: string; docId: string }
    | { status: 'failed'; filePath: string; error: string }

export type ImportedResult = ImportResult & { status: 'imported' }
export type SkippedResult = ImportResult & { status: 'skipped' }
export type FailedResult = ImportResult & { status: 'failed' }

type ParsedFile = {
    docId: string
    docName: string
    filePath: string
    absolutePath: string
    relativePath: string
    tree: Awaited<ReturnType<typeof mdToTree>>
    combinedSummary: string | undefined
    bodySummary: string | undefined
    needsCleanup: boolean
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
        const allSummaries = collectAllSummaries(tree)
        const combinedSummary = allSummaries.filter(Boolean).join('\n')
        const bodySummary = combinedSummary
            ? await segmentText(combinedSummary, segmenter)
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
                combinedSummary: combinedSummary || undefined,
                bodySummary,
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
            summaryHash: parsed.combinedSummary
                ? md5(parsed.combinedSummary)
                : undefined,
        },
        parsed.bodySummary
    )
    return nodeCount
}

type BatchProgress = {
    phase: 'parse' | 'write'
    message: string
    completed?: number
    total?: number
}

/**
 * Full import pipeline: parallel Phase 1 (parse+summarize) → serial DB write.
 * Returns structured results; progress callbacks enable CLI spinner updates.
 */
export async function importBatch(
    files: string[],
    config: ProjectConfig,
    summarizer: Summarizer,
    force: boolean,
    onProgress?: (p: BatchProgress) => void
): Promise<ImportResult[]> {
    log.info({
        fileCount: files.length,
        force,
        content: 'Import batch start',
    })
    const results: ImportResult[] = []
    const filesWithIndex = files.map((fp, i) => ({ fp, i }))
    const total = files.length
    let completed = 0

    // Phase 1: parallel LLM → serial DB
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

    const imported = results.filter((r) => r.status === 'imported').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const failed = results.filter((r) => r.status === 'failed').length
    log.info({
        imported,
        skipped,
        failed,
        content: 'Import batch complete',
    })

    return results
}

function collectAllSummaries(tree: DocNode): string[] {
    const summaries: string[] = []
    function walk(node: DocNode) {
        if (node.value.summary) summaries.push(node.value.summary)
        if (node.value.prefixSummary) summaries.push(node.value.prefixSummary)
        for (const child of node.nodes) walk(child)
    }
    walk(tree)
    return summaries
}

type ResegmentResult = {
    written: number
    skipped: number
    failed: number
}

/**
 * Resegment all documents: collect summaries → LLM segment → update FTS index.
 * Skips documents whose summaryHash hasn't changed (unless force=true).
 */
async function resegmentAllDocuments(
    config: ProjectConfig,
    force = false
): Promise<ResegmentResult> {
    const segmenter = config.segmenter ?? config.model

    const allDocs = await store.getAllDocs()
    if (allDocs.length === 0) {
        return { written: 0, skipped: 0, failed: 0 }
    }

    // Phase 1: identify documents needing resegment
    const toResegment: Array<{
        docId: string
        docName: string
        combinedSummary: string
        meta: Record<string, unknown>
    }> = []

    for (const d of allDocs) {
        let meta: Record<string, unknown> = {}
        try {
            meta = JSON.parse(d.metadata) as Record<string, unknown>
        } catch {
            log.warn({
                docId: d.id,
                content: 'Invalid metadata JSON, skipping',
            })
            continue
        }

        const tree = await store.getFullTree<{
            summary?: string
            prefixSummary?: string
        }>(d.id)
        const rootNode = tree[0]
        const allSummaries = rootNode
            ? collectAllSummaries(rootNode as DocNode)
            : []
        const combinedSummary = allSummaries.filter(Boolean).join('\n')

        if (!combinedSummary) continue

        if (!force) {
            const newHash = md5(combinedSummary)
            const oldHash = meta.summaryHash as string | undefined
            if (oldHash && newHash === oldHash) continue
        }

        toResegment.push({
            docId: d.id,
            docName: (meta.title as string) || d.title || d.id,
            combinedSummary,
            meta,
        })
    }

    const skipped = allDocs.length - toResegment.length

    if (toResegment.length === 0) {
        return { written: 0, skipped, failed: 0 }
    }

    // Phase 2: parallel LLM segmentation
    let failed = 0
    const PARALLEL = 4
    const segmented: Array<{
        docId: string
        docName: string
        combinedSummary: string
        meta: Record<string, unknown>
        text: string
    }> = []

    for (let i = 0; i < toResegment.length; i += PARALLEL) {
        const chunk = toResegment.slice(i, i + PARALLEL)
        const chunkResults = await Promise.all(
            chunk.map(async (item) => {
                try {
                    const text = await segmentText(
                        item.combinedSummary,
                        segmenter
                    )
                    return { ...item, text }
                } catch (err) {
                    log.error({
                        err,
                        docId: item.docId,
                        content: 'Re-segment failed',
                    })
                    return { ...item, text: '' }
                }
            })
        )
        for (const r of chunkResults) {
            if (r.text) {
                segmented.push(r)
            } else {
                failed++
            }
        }
    }

    // Phase 3: serial DB writes
    let written = 0
    for (const item of segmented) {
        await store.updateDocFts(item.docId, item.text)
        await store.updateDocMetadata(item.docId, {
            ...item.meta,
            summaryHash: md5(item.combinedSummary),
        })
        written++
    }

    log.info({
        written,
        skipped,
        failed,
        content: 'Resegment complete',
    })

    return { written, skipped, failed }
}

export type { ResegmentResult }
export { collectAllSummaries, resegmentAllDocuments }
