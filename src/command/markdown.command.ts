import path from 'node:path'
import { intro, note, outro, spinner } from '@clack/prompts'
import { Command } from 'commander'
import { logger } from '../config'
import {
    collectAllSummaries,
    type FailedResult,
    type ImportedResult,
    importBatch,
    type SkippedResult,
} from '../service/import.service'
import * as store from '../store'
import type { DocNode } from '../tree/type'
import { md5 } from '../utils/common'
import { segmentText } from '../utils/segment'
import { createCachedSummarizer, setupProjectModel } from './command-utils'

const log = logger.child({ module: 'markdown' })

export function register(program: Command) {
    program
        .command('markdown')
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

            if (total > 1) {
                // Batch mode: use shared pipeline with progress callbacks
                const sPhase1 = spinner()
                const sWrite = spinner()
                const sTagLLM = spinner()
                const sTagSave = spinner()

                const results = await importBatch(
                    files,
                    config,
                    summarize,
                    force,
                    (p) => {
                        switch (p.phase) {
                            case 'parse':
                                sPhase1.message(p.message)
                                break
                            case 'write':
                                sWrite.message(p.message)
                                break
                            case 'tag-llm':
                                sTagLLM.message(p.message)
                                break
                            case 'tag-save':
                                sTagSave.message(p.message)
                                break
                        }
                    }
                )

                const imported = results.filter(
                    (r): r is ImportedResult => r.status === 'imported'
                )
                const skipped = results.filter(
                    (r): r is SkippedResult => r.status === 'skipped'
                )
                const failed = results.filter(
                    (r): r is FailedResult => r.status === 'failed'
                )

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
            } else {
                // Single-file mode: importBatch handles single file too
                const s = spinner()
                const results = await importBatch(
                    files,
                    config,
                    summarize,
                    force,
                    (p) => {
                        s.message(p.message)
                    }
                )
                const [result] = results
                if (result?.status === 'imported') {
                    note(
                        `Title: ${result.docName}\nID: ${result.docId.slice(0, 8)}\nNodes: ${result.nodeCount}`
                    )
                    outro(`${results.length} imported`)
                } else if (result?.status === 'skipped') {
                    note(
                        `Skipped: "${result.docName}" already exists (id: ${result.docId.slice(0, 8)})`
                    )
                    outro(`${results.length} skipped`)
                } else if (result?.status === 'failed') {
                    outro(`Failed: ${result.error}`)
                }
            }
        })
        .addCommand(
            new Command('resegment')
                .alias('rs')
                .description(
                    're-segment documents whose summaries changed and update FTS index'
                )
                .action(async () => {
                    const config = await setupProjectModel()
                    if (!config) {
                        outro('Not in a vein project. Run "vein new" first.')
                        return
                    }

                    const segmenter = config.segmenter ?? config.model

                    const allDocs = await store.getAllDocs()
                    if (allDocs.length === 0) {
                        outro('No documents found.')
                        return
                    }

                    intro(`Re-segmenting ${allDocs.length} document(s)`)

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
                            meta = JSON.parse(d.metadata) as Record<
                                string,
                                unknown
                            >
                        } catch {
                            log.warn({
                                docId: d.id,
                                content: 'Invalid metadata JSON, skipping',
                            })
                            continue
                        }
                        const docName =
                            (meta.title as string) || d.title || d.id

                        const tree = await store.getFullTree<{
                            summary?: string
                            prefixSummary?: string
                        }>(d.id)
                        const rootNode = tree[0]
                        const allSummaries = rootNode
                            ? collectAllSummaries(rootNode as DocNode)
                            : []
                        const combinedSummary = allSummaries
                            .filter(Boolean)
                            .join('\n')

                        if (!combinedSummary) continue

                        const newHash = md5(combinedSummary)
                        const oldHash = meta.summaryHash as string | undefined
                        if (oldHash && newHash === oldHash) continue

                        toResegment.push({
                            docId: d.id,
                            docName,
                            combinedSummary,
                            meta,
                        })
                    }

                    const skipped = allDocs.length - toResegment.length

                    if (toResegment.length === 0) {
                        outro(
                            skipped > 0
                                ? `${skipped} document(s) unchanged, nothing to do`
                                : 'No summaries to segment'
                        )
                        return
                    }

                    // Phase 2: parallel LLM segmentation
                    let done = 0
                    let failed = 0
                    const PARALLEL = 4
                    const segSpinner = spinner()
                    segSpinner.start('Segmenting...')
                    const segmented: Array<{
                        docId: string
                        docName: string
                        combinedSummary: string
                        meta: Record<string, unknown>
                        text: string
                    }> = []

                    for (let i = 0; i < toResegment.length; i += PARALLEL) {
                        const chunk = toResegment.slice(i, i + PARALLEL)
                        segSpinner.message(
                            `Segmenting (${done}/${toResegment.length})...`
                        )
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
                                done++
                            } else {
                                failed++
                            }
                        }
                        segSpinner.message(
                            `Segmented (${done}/${toResegment.length})${failed > 0 ? `, ${failed} failed` : ''}`
                        )
                    }

                    // Phase 3: serial DB writes
                    let written = 0
                    for (const item of segmented) {
                        segSpinner.message(
                            `Writing (${written + 1}/${segmented.length})...`
                        )
                        await store.updateDocFts(item.docId, item.text)
                        await store.updateDocMetadata(item.docId, {
                            ...item.meta,
                            summaryHash: md5(item.combinedSummary),
                        })
                        written++
                    }

                    segSpinner.stop('Done.')
                    const parts: string[] = []
                    if (written > 0) parts.push(`${written} re-segmented`)
                    if (skipped > 0)
                        parts.push(`${skipped} skipped (unchanged)`)
                    if (failed > 0) parts.push(`${failed} failed`)
                    outro(parts.join(', ') || 'Nothing done')
                })
        )
}
