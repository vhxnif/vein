import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { logger, resolveProjectRoot } from '../config'
import type { ModelProvider, ProjectConfig } from '../config/type'
import * as store from '../store'
import { mdToTree } from '../tree/markdown_split'
import type { DocNode } from '../tree/type'
import { getErrorMessage } from '../utils/cli-helpers'
import { md5 } from '../utils/common'
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

export { collectAllSummaries }
