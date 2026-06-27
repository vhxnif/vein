import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { BaseDocNode } from '@vein/core'
import {
    createCachedSummarizer,
    deleteDoc,
    getDoc,
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
    const keyword = c.req.query('keyword') || undefined

    const { docs, total } = await listDocuments(page, pageSize, keyword)
    return c.json({ docs, total, page, pageSize, keyword: keyword ?? null })
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

    // Resolve document filename from doc metadata
    let docName = docId.slice(0, 8)
    const doc = await getDoc(docId)
    if (doc) {
        try {
            const meta = JSON.parse(doc.metadata) as { title?: string }
            docName = meta.title ?? docId.slice(0, 8)
        } catch {
            // fallback to short ID
        }
    }

    return c.json({ nodeId: fullNodeId, docName, ...nodeData })
})

// ── DELETE /api/projects/current/documents/:id ───────────────────
docsRouter.delete('/:id', async (c) => {
    const docId = c.req.param('id')
    const doc = await getDocumentDetail(docId)
    if (!doc) return c.json({ error: 'Document not found' }, 404)

    await deleteDoc(docId)
    return c.json({ success: true })
})

// ── Helpers ─────────────────────────────────────────────────────

/** Resolve a unique file path in the project root, avoiding name conflicts. */
async function resolveWritePath(
    root: string,
    filename: string
): Promise<string> {
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)
    let candidate = path.join(root, filename)
    let counter = 1
    while (true) {
        try {
            await access(candidate)
            // File exists — try next suffix
            candidate = path.join(root, `${base}_${counter}${ext}`)
            counter++
        } catch {
            // File does not exist — use this path
            return candidate
        }
    }
}

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

    // Save uploaded files directly to project root (mirrors CLI behaviour)
    await mkdir(root, { recursive: true })

    const filePaths: string[] = []
    for (const file of files) {
        const destPath = await resolveWritePath(root, file.name)
        const buffer = Buffer.from(await file.arrayBuffer())
        await writeFile(destPath, buffer)
        filePaths.push(destPath)
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
                async (progress) => {
                    await stream.writeSSE({
                        event: 'progress',
                        data: JSON.stringify(progress),
                    })
                }
            )

            const imported = results.filter((r) => r.status === 'imported')
            const skipped = results.filter((r) => r.status === 'skipped')
            const failed = results.filter((r) => r.status === 'failed')

            await stream.writeSSE({
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
                await stream.writeSSE({
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
            await stream.writeSSE({ event: 'done', data: '' })
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
