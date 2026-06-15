declare const Bun: {
    mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void>
    write: (path: string, data: unknown) => Promise<void>
    file: (path: string) => {
        text: () => Promise<string>
        delete: () => Promise<void>
    }
}

import type { BaseDocNode } from '@vein/core'
import {
    createCachedSummarizer,
    deleteDoc,
    getDocFtsSummary,
    getDocumentDetail,
    getFullTree,
    getNodeDetails,
    importBatch,
    listDocuments,
    loadProjectConfig,
    resegmentAllDocuments,
    resolveProjectRoot,
} from '@vein/core'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

const docsRouter = new Hono()

// ── GET /api/projects/current/documents ─────────────────────────
docsRouter.get('/', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const page = Number(c.req.query('page')) || 1
    const pageSize = Number(c.req.query('pageSize')) || 20

    const { docs, total } = await listDocuments(page, pageSize)
    return c.json({ docs, total, page, pageSize })
})

// ── GET /api/projects/current/documents/:id ─────────────────────
docsRouter.get('/:id', async (c) => {
    const docId = c.req.param('id')
    const doc = await getDocumentDetail(docId)
    if (!doc) return c.json({ error: 'Document not found' }, 404)

    // Get the document tree
    const tree = await getFullTree<BaseDocNode>(docId)
    const ftsSummary = await getDocFtsSummary(docId).catch(() => undefined)

    return c.json({
        ...doc,
        tree,
        ftsSummary,
    })
})

// ── GET /api/projects/current/documents/:id/nodes/:nodeId ───────
docsRouter.get('/:id/nodes/:nodeId', async (c) => {
    const { id: docId, nodeId } = c.req.param()
    const fullNodeId = `${nodeId}_${docId}`
    const nodeData = await getNodeDetails<BaseDocNode>(fullNodeId)
    if (!nodeData) return c.json({ error: 'Node not found' }, 404)

    return c.json({ nodeId: fullNodeId, ...nodeData })
})

// ── DELETE /api/projects/current/documents/:id ───────────────────
docsRouter.delete('/:id', async (c) => {
    const docId = c.req.param('id')
    const doc = await getDocumentDetail(docId)
    if (!doc) return c.json({ error: 'Document not found' }, 404)

    await deleteDoc(docId)
    return c.json({ success: true })
})

// ── POST /api/projects/current/documents/import ──────────────────
// Multipart upload → importBatch with SSE progress
docsRouter.post('/import', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const config = await loadProjectConfig(root)
    if (!config) return c.json({ error: 'No config found' }, 404)

    const formData = await c.req.formData()
    const files = formData.getAll('files') as File[]
    const force = formData.get('force') === 'true'

    if (files.length === 0) {
        return c.json({ error: 'No files provided' }, 400)
    }

    // Save uploaded files to temp directory
    const tmpDir = `${root}/.vein/tmp-uploads`
    await Bun.mkdir(tmpDir, { recursive: true })

    const filePaths: string[] = []
    for (const file of files) {
        const filePath = `${tmpDir}/${file.name}`
        await Bun.write(filePath, file)
        filePaths.push(filePath)
    }

    const summarize = createCachedSummarizer(config)

    // Stream progress via SSE
    return streamSSE(c, async (stream) => {
        let sentResult = false

        try {
            const results = await importBatch(
                filePaths,
                config,
                summarize,
                force,
                (progress) => {
                    stream.writeSSE({
                        event: 'progress',
                        data: JSON.stringify(progress),
                    })
                }
            )

            const imported = results.filter((r) => r.status === 'imported')
            const skipped = results.filter((r) => r.status === 'skipped')
            const failed = results.filter((r) => r.status === 'failed')

            stream.writeSSE({
                event: 'result',
                data: JSON.stringify({
                    imported: imported.length,
                    skipped: skipped.length,
                    failed: failed.length,
                    details: results,
                }),
            })
            sentResult = true
        } catch (err) {
            if (!sentResult) {
                stream.writeSSE({
                    event: 'error',
                    data: JSON.stringify({
                        error:
                            err instanceof Error
                                ? err.message
                                : 'Import failed',
                    }),
                })
            }
        } finally {
            // Cleanup temp files
            for (const fp of filePaths) {
                try {
                    await Bun.file(fp).delete()
                } catch {
                    // ignore cleanup errors
                }
            }
            stream.writeSSE({ event: 'done', data: '' })
        }
    })
})

// ── POST /api/projects/current/documents/resegment ──────────────
docsRouter.post('/resegment', async (c) => {
    const root = resolveProjectRoot()
    if (!root) return c.json({ error: 'No project selected' }, 400)

    const config = await loadProjectConfig(root)
    if (!config) return c.json({ error: 'No config found' }, 404)

    const body = await c.req.json().catch(() => ({}))
    const force = (body as { force?: boolean }).force ?? false

    const result = await resegmentAllDocuments(config, force)
    return c.json(result)
})

export { docsRouter }
