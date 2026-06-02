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
                const results = await importBatch(
                    files,
                    config,
                    summarize,
                    force
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
                .argument(
                    '[docIds...]',
                    'specific document id(s) (if omitted, process all candidates)'
                )
                .action(async (docIds?: string[]) => {
                    const config = await setupProjectModel()
                    if (!config) {
                        outro('Not in a vein project. Run "vein new" first.')
                        return
                    }

                    const segmenter = config.segmenter ?? config.model

                    // Resolve target docs
                    docIds ??= []
                    if (docIds.length === 0) {
                        const allDocs = await store.getAllDocs()
                        docIds = allDocs.map((d) => d.id)

                        if (docIds.length === 0) {
                            outro('No documents found.')
                            return
                        }
                    }

                    intro(`Re-segmenting ${docIds.length} document(s)`)

                    let done = 0
                    let skipped = 0
                    let failed = 0
                    const segSpinner = spinner()
                    segSpinner.start(`[0/${docIds.length}] Starting...`)

                    for (const docId of docIds) {
                        const doc = await store.getDoc(docId)
                        if (!doc) {
                            log.warn({
                                docId,
                                content: 'Doc not found',
                            })
                            failed++
                            continue
                        }
                        const meta = JSON.parse(doc.metadata) as Record<
                            string,
                            unknown
                        >
                        const docName = (meta.title as string) ?? docId
                        segSpinner.message(
                            `[${done + skipped + failed + 1}/${docIds.length}] ${docName}`
                        )

                        // Rebuild summaries from tree
                        const tree = await store.getFullTree<{
                            summary?: string
                            prefixSummary?: string
                        }>(docId)
                        const rootNode = tree[0]
                        const allSummaries = rootNode
                            ? collectAllSummaries(rootNode as DocNode)
                            : []
                        const combinedSummary = allSummaries
                            .filter(Boolean)
                            .join('\n')

                        if (!combinedSummary) {
                            log.debug({
                                docId,
                                docName,
                                content: 'No summaries to segment, skipping',
                            })
                            skipped++
                            continue
                        }

                        // Check if content changed
                        const newHash = md5(combinedSummary)
                        const oldHash = meta.summaryHash as string | undefined
                        if (oldHash && newHash === oldHash) {
                            log.debug({
                                docId,
                                docName,
                                content: 'Summary unchanged, skipping',
                            })
                            skipped++
                            continue
                        }

                        // Re-segment and update
                        let segmented: string
                        try {
                            segmented = await segmentText(
                                combinedSummary,
                                segmenter
                            )
                        } catch (err) {
                            log.error({
                                err,
                                docId,
                                content: 'Re-segment failed',
                            })
                            failed++
                            continue
                        }

                        await store.updateDocFts(docId, segmented)
                        await store.updateDocMetadata(docId, {
                            ...meta,
                            summaryHash: newHash,
                        })
                        done++
                    }

                    const parts: string[] = []
                    if (done > 0) parts.push(`${done} re-segmented`)
                    if (skipped > 0) parts.push(`${skipped} skipped`)
                    if (failed > 0) parts.push(`${failed} failed`)
                    segSpinner.stop(parts.join(', ') || 'Nothing done')
                    outro()
                })
        )
}
