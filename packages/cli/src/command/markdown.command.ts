import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { intro, note, outro, spinner } from '@clack/prompts'
import {
    createCachedSummarizer,
    type FailedResult,
    type ImportedResult,
    importBatch,
    resegmentAllDocuments,
    type SkippedResult,
    setupProjectModel,
} from '@vein/core'
import { Command } from 'commander'

async function collectMarkdownFiles(inputs: string[]): Promise<string[]> {
    const result: string[] = []
    for (const input of inputs) {
        try {
            const s = await stat(input)
            if (s.isDirectory()) {
                const entries = await readdir(input, { recursive: true })
                for (const entry of entries) {
                    if (entry.endsWith('.md')) {
                        result.push(path.join(input, entry))
                    }
                }
            } else if (input.endsWith('.md')) {
                result.push(input)
            }
        } catch {
            // path doesn't exist, pass through to importBatch for error handling
            result.push(input)
        }
    }
    return result
}

export function register(program: Command) {
    program
        .command('markdown')
        .alias('md')
        .description(
            'import markdown file(s) into the library. Directories are scanned recursively for .md files'
        )
        .argument('<paths...>', 'path(s) to markdown file(s) or directories')
        .option('-f, --force', 'force re-import even if already exists')
        .action(async (files: string[], options: { force?: boolean }) => {
            const config = await setupProjectModel()
            if (!config) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            const expanded = await collectMarkdownFiles(files)
            const total = expanded.length
            const force = options.force ?? false
            const summarize = createCachedSummarizer(config)

            intro(
                total > 1
                    ? `Importing ${total} markdown documents`
                    : 'Importing markdown document'
            )

            if (total > 1) {
                // Batch mode: use shared pipeline with progress callbacks
                const s = spinner()
                s.start('Preparing...')

                const results = await importBatch(
                    expanded,
                    config,
                    summarize,
                    force,
                    (p) => {
                        s.message(p.message)
                    }
                )
                s.stop('Import complete.')

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
                // Single-file mode
                const s = spinner()
                s.start('Preparing...')
                const results = await importBatch(
                    expanded,
                    config,
                    summarize,
                    force,
                    (p) => {
                        s.message(p.message)
                    }
                )
                s.stop('Import complete.')
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
                .description('re-segment documents and update FTS index')
                .option(
                    '-F, --force',
                    'force re-segment even if summaries unchanged'
                )
                .action(async (options: { force?: boolean }) => {
                    const config = await setupProjectModel()
                    if (!config) {
                        outro('Not in a vein project. Run "vein new" first.')
                        return
                    }

                    const force = options.force ?? false
                    const segSpinner = spinner()
                    segSpinner.start('Re-segmenting...')

                    const { written, skipped, failed } =
                        await resegmentAllDocuments(config, force)

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
