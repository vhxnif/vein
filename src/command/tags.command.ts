import { intro, note, outro, spinner } from '@clack/prompts'
import { Command } from 'commander'
import { generateEmbedding } from '../ai/embedding'
import { logger } from '../config'
import * as store from '../store'
import { segmentText } from '../utils/segment'
import { setupProjectModel } from './command-utils'

const log = logger.child({ module: 'tags' })

export function register(program: Command) {
    program
        .command('tags')
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

                    backfillSpinner.stop(
                        `Done: ${done} embedded, ${failed} failed`
                    )
                    outro(
                        failed > 0
                            ? `Backfilled ${done} tag(s), ${failed} failed (see log for details)`
                            : `Backfilled ${done} tag(s)`
                    )
                })
        )
        .addCommand(
            new Command('backfill-fts')
                .description('re-segment all tags and rebuild tags_fts index')
                .action(async () => {
                    const config = await setupProjectModel()
                    if (!config) {
                        outro('Not in a vein project. Run "vein new" first.')
                        return
                    }

                    intro('Backfilling tags FTS index')

                    const { getRawClient: getRaw } = await import(
                        '../store/client'
                    )
                    const client = getRaw()

                    // Drop and recreate tags_fts
                    client.execute('DROP TABLE IF EXISTS tags_fts')
                    client.execute(
                        'CREATE VIRTUAL TABLE IF NOT EXISTS tags_fts USING fts5(tag_id, tag)'
                    )

                    // Get all tags
                    const allTags = await store.getTagsWithDocCount()
                    if (allTags.length === 0) {
                        outro('No tags to backfill.')
                        return
                    }

                    note(`Found ${allTags.length} tag(s) to backfill`)

                    const segmenter = config.segmenter ?? config.model
                    let done = 0
                    let failed = 0
                    const ftsSpinner = spinner()
                    ftsSpinner.start('Segmenting & indexing...')

                    for (const t of allTags) {
                        ftsSpinner.message(
                            `[${done + 1}/${allTags.length}] Indexing: ${t.tag}`
                        )
                        try {
                            const segmented = await segmentText(
                                t.tag,
                                segmenter
                            )
                            client.execute({
                                sql: 'INSERT INTO tags_fts (tag_id, tag) VALUES (?1, ?2)',
                                args: [t.id, segmented],
                            })
                            done++
                        } catch (err) {
                            failed++
                            log.warn({
                                err,
                                tagId: t.id,
                                tag: t.tag,
                                content: 'FTS backfill failed',
                            })
                        }
                    }

                    ftsSpinner.stop(`Done: ${done} indexed, ${failed} failed`)
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

                    const { getRawClient: getRaw } = await import(
                        '../store/client'
                    )
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
}
