import path from 'node:path'
import { intro, note, outro, spinner } from '@clack/prompts'
import type { Command } from 'commander'
import {
    type FailedResult,
    type ImportedResult,
    importBatch,
    type SkippedResult,
} from '../service/import.service'
import { createCachedSummarizer, setupProjectModel } from './command-utils'

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
}
