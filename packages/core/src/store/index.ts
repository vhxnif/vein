import { count, eq, sql } from 'drizzle-orm'
import { logger } from '../config'
import type { TreeNode } from '../tree/type'
import { db, getRawClient } from './client'
import { docs, modelCache, nodes } from './schema'

const log = logger.child({ module: 'store' })

type FlatNode<T> = {
    node: TreeNode<T>
    parentIndex: number
    depth: number
    index: number
}

function flattenTree<T>(
    tree: TreeNode<T>[],
    parentIndex: number,
    depth: number,
    startIndex: number
): FlatNode<T>[] {
    const result: FlatNode<T>[] = []
    let idx = startIndex

    for (const node of tree) {
        const currentIndex = idx
        result.push({
            node,
            parentIndex,
            depth,
            index: currentIndex,
        })
        idx++

        if (node.nodes && node.nodes.length > 0) {
            const children = flattenTree<T>(
                node.nodes,
                currentIndex,
                depth + 1,
                idx
            )
            result.push(...children)
            idx += children.length
        }
    }

    return result
}

function nodeToJson<T>(node: TreeNode<T>): string {
    return JSON.stringify(node.value)
}

function jsonToTreeNode<T>(row: NodeRow): TreeNode<T> {
    const d = JSON.parse(row.data) as T
    return {
        nodeId: String(row.id),
        value: d,
        nodes: [],
    }
}

type NodeRow = {
    id: string
    data: string
}

async function insertTree<T>(
    tree: TreeNode<T>[],
    docId?: string
): Promise<number> {
    const flatNodes = flattenTree(tree, -1, 0, 0)
    if (flatNodes.length === 0) return 0

    const client = getRawClient()
    const indexToId = new Map<number, string>()

    try {
        await client.execute('BEGIN')

        for (const fn of flatNodes) {
            const nodeId = fn.node.nodeId
            await client.execute({
                sql: 'INSERT INTO nodes (id, doc_id, data) VALUES (?, ?, ?)',
                args: [nodeId, docId ?? null, nodeToJson(fn.node)],
            })
            indexToId.set(fn.index, nodeId)

            await client.execute({
                sql: 'INSERT INTO tree_closure (ancestor_id, descendant_id, depth) VALUES (?, ?, 0)',
                args: [nodeId, nodeId],
            })
        }

        for (const fn of flatNodes) {
            if (fn.parentIndex < 0) continue

            const nodeId = indexToId.get(fn.index)!
            const parentId = indexToId.get(fn.parentIndex)!

            await client.execute({
                sql: 'INSERT INTO tree_closure (ancestor_id, descendant_id, depth) VALUES (?, ?, 1)',
                args: [parentId, nodeId],
            })

            await client.execute({
                sql: `INSERT INTO tree_closure (ancestor_id, descendant_id, depth)
                      SELECT ancestor_id, ?, depth + 1
                      FROM tree_closure WHERE descendant_id = ? AND depth > 0`,
                args: [nodeId, parentId],
            })
        }

        await client.execute('COMMIT')
    } catch (e) {
        await client.execute('ROLLBACK')
        throw e
    }

    return flatNodes.length
}

async function deleteTree(docId?: string): Promise<void> {
    const client = getRawClient()

    try {
        await client.execute('BEGIN')

        if (docId !== undefined) {
            await client.execute({
                sql: `DELETE FROM tree_closure
                      WHERE descendant_id IN (SELECT id FROM nodes WHERE doc_id = ?)`,
                args: [docId],
            })
            await client.execute({
                sql: 'DELETE FROM nodes WHERE doc_id = ?',
                args: [docId],
            })
        } else {
            await client.execute('DELETE FROM tree_closure')
            await client.execute('DELETE FROM nodes')
        }

        await client.execute('COMMIT')
    } catch (e) {
        await client.execute('ROLLBACK')
        throw e
    }
}

async function getSubTree<T>(nodeId: string): Promise<TreeNode<T>[]> {
    const client = getRawClient()

    const result = await client.execute({
        sql: `SELECT n.id, n.data FROM nodes n
              JOIN tree_closure tc ON n.id = tc.descendant_id
              WHERE tc.ancestor_id = ?
              ORDER BY n.id`,
        args: [nodeId],
    })

    const rows = result.rows as unknown as NodeRow[]
    if (rows.length === 0) return []

    const nodeMap = new Map<string, TreeNode<T>>()
    for (const row of rows) {
        nodeMap.set(row.id, jsonToTreeNode(row))
    }

    const ids = [...nodeMap.keys()]
    if (ids.length > 1) {
        const placeholders = ids.map(() => '?').join(', ')
        const parentResult = await client.execute({
            sql: `SELECT descendant_id, ancestor_id FROM tree_closure
                  WHERE depth = 1 AND descendant_id IN (${placeholders})`,
            args: ids,
        })

        const parentMap = new Map<string, string>()
        for (const row of parentResult.rows as unknown as {
            descendant_id: string
            ancestor_id: string
        }[]) {
            parentMap.set(row.descendant_id, row.ancestor_id)
        }

        const roots: TreeNode<T>[] = []
        for (const id of ids) {
            const node = nodeMap.get(id)!
            const parentId = parentMap.get(id)
            if (parentId === undefined || !nodeMap.has(parentId)) {
                roots.push(node)
            } else {
                const parent = nodeMap.get(parentId)!
                parent.nodes.push(node)
            }
        }
        return roots
    }

    return [nodeMap.get(ids[0]!)!]
}

async function getAncestors<T>(nodeId: string): Promise<TreeNode<T>[]> {
    const client = getRawClient()

    const result = await client.execute({
        sql: `SELECT n.id, n.data FROM nodes n
              JOIN tree_closure tc ON n.id = tc.ancestor_id
              WHERE tc.descendant_id = ? AND tc.depth > 0
              ORDER BY tc.depth DESC`,
        args: [nodeId],
    })

    return (result.rows as unknown as NodeRow[]).map((row) =>
        jsonToTreeNode<T>(row)
    )
}

async function getSiblings<T>(nodeId: string): Promise<TreeNode<T>[]> {
    const client = getRawClient()

    const parentResult = await client.execute({
        sql: `SELECT ancestor_id FROM tree_closure
              WHERE descendant_id = ? AND depth = 1`,
        args: [nodeId],
    })

    const parentRow = parentResult.rows[0] as
        | { ancestor_id: string }
        | undefined
    if (!parentRow) return []

    const result = await client.execute({
        sql: `SELECT n.id, n.data FROM nodes n
              JOIN tree_closure tc ON n.id = tc.descendant_id
              WHERE tc.ancestor_id = ? AND tc.depth = 1 AND tc.descendant_id != ?
              ORDER BY n.id`,
        args: [parentRow.ancestor_id, nodeId],
    })
    return (result.rows as unknown as NodeRow[]).map((row) =>
        jsonToTreeNode(row)
    )
}

async function getFullTree<T>(docId?: string): Promise<TreeNode<T>[]> {
    const client = getRawClient()

    const rootResult =
        docId !== undefined
            ? await client.execute({
                  sql: `SELECT n.id FROM nodes n
                  WHERE n.doc_id = ?
                  AND NOT EXISTS (
                      SELECT 1 FROM tree_closure tc
                      WHERE tc.descendant_id = n.id AND tc.depth = 1
                  )`,
                  args: [docId],
              })
            : await client.execute({
                  sql: `SELECT n.id FROM nodes n
                  WHERE NOT EXISTS (
                      SELECT 1 FROM tree_closure tc
                      WHERE tc.descendant_id = n.id AND tc.depth = 1
                  )`,
                  args: [],
              })

    const rootIds = (rootResult.rows as unknown as { id: string }[]).map(
        (r) => r.id
    )

    const allRoots: TreeNode<T>[] = []
    const subtrees = await Promise.all(rootIds.map((id) => getSubTree<T>(id)))
    for (const subtree of subtrees) {
        allRoots.push(...subtree)
    }

    return allRoots
}

async function getNodeDetails<T>(nodeId: string): Promise<T | undefined> {
    const row = await db
        .select()
        .from(nodes)
        .where(eq(nodes.id, sql.placeholder('id')))
        .prepare()
        .get({ id: nodeId })
    if (!row) {
        return void 0
    }
    return JSON.parse(row.data)
}

async function getCachedResponse(
    md5: string,
    model: string
): Promise<string | undefined> {
    const client = getRawClient()
    // Use SELECT first because raw wrapper doesn't handle UPDATE...RETURNING
    const selectResult = await client.execute({
        sql: `SELECT response FROM model_cache WHERE md5 = ? AND model = ?`,
        args: [md5, model],
    })

    const row = selectResult.rows[0] as { response: string } | undefined
    if (!row) {
        log.debug({ md5: md5.slice(0, 16), model, content: 'Cache miss' })
        return void 0
    }

    // Fire-and-forget hit count increment (best-effort, don't block cache read)
    void client.execute({
        sql: `UPDATE model_cache SET hit_count = hit_count + 1 WHERE md5 = ? AND model = ?`,
        args: [md5, model],
    })

    return row.response
}

async function setCachedResponse(
    md5: string,
    model: string,
    response: string
): Promise<void> {
    await db
        .insert(modelCache)
        .values({
            id: crypto.randomUUID().replaceAll('-', ''),
            md5,
            model,
            response,
        })
        .onConflictDoUpdate({
            target: [modelCache.md5, modelCache.model],
            set: {
                response,
                updatedAt: sql`(datetime('now'))`,
            },
        })
    log.debug({ md5: md5.slice(0, 16), model, content: 'Cache upserted' })
}

async function purgeModelCache(
    minHitCount?: number,
    olderThanDays?: number
): Promise<number> {
    const conditions = []

    if (minHitCount !== undefined) {
        conditions.push(sql`hit_count < ${minHitCount}`)
    }

    if (olderThanDays !== undefined) {
        conditions.push(
            sql`created_at < datetime('now', '-' || ${olderThanDays} || ' days')`
        )
    }

    if (conditions.length === 0) return 0

    const whereClause = sql.join(conditions, sql` AND `)
    await db.delete(modelCache).where(whereClause)
    log.info({
        minHitCount,
        olderThanDays,
        content: 'Cache purged',
    })
    return 0
}

async function insertDoc(
    id: string,
    metadata: Record<string, unknown>,
    summary?: string
) {
    const client = getRawClient()
    try {
        await client.execute('BEGIN')
        const result = db
            .insert(docs)
            .values({ id, metadata: JSON.stringify(metadata) })
            .onConflictDoNothing()
            .returning()

        if (summary) {
            await client.execute({
                sql: `DELETE FROM docs_fts WHERE doc_id = ?`,
                args: [id],
            })
            await client.execute({
                sql: `INSERT INTO docs_fts (doc_id, summary) VALUES (?, ?)`,
                args: [id, summary],
            })
        }
        await client.execute('COMMIT')
        return result
    } catch (e) {
        await client.execute('ROLLBACK')
        throw e
    }
}

async function getDoc(id: string) {
    return db.select().from(docs).where(eq(docs.id, id)).get()
}

async function updateDocMetadata(
    docId: string,
    metadata: Record<string, unknown>
): Promise<void> {
    await db
        .update(docs)
        .set({
            metadata: JSON.stringify(metadata),
            updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(docs.id, docId))
}

async function updateDocFts(docId: string, segmented: string): Promise<void> {
    const client = getRawClient()
    await client.execute({
        sql: `DELETE FROM docs_fts WHERE doc_id = ?`,
        args: [docId],
    })
    await client.execute({
        sql: `INSERT INTO docs_fts (doc_id, summary) VALUES (?, ?)`,
        args: [docId, segmented],
    })
}

async function getDocFtsSummary(docId: string): Promise<string | undefined> {
    try {
        const result = await getRawClient().execute({
            sql: `SELECT summary FROM docs_fts WHERE doc_id = ?`,
            args: [docId],
        })
        const row = result.rows[0] as { summary: string } | undefined
        return row?.summary
    } catch {
        return undefined
    }
}

async function deleteDoc(id: string) {
    log.info({ docId: id, content: 'Deleting doc' })
    const client = getRawClient()
    try {
        await client.execute('BEGIN')
        // Delete associated nodes and tree closure entries
        await client.execute({
            sql: `DELETE FROM tree_closure
                  WHERE descendant_id IN (SELECT id FROM nodes WHERE doc_id = ?)`,
            args: [id],
        })
        await client.execute({
            sql: 'DELETE FROM nodes WHERE doc_id = ?',
            args: [id],
        })
        // Delete FTS entry
        await client.execute({
            sql: `DELETE FROM docs_fts WHERE doc_id = ?`,
            args: [id],
        })
        // Delete the document itself
        await db.delete(docs).where(eq(docs.id, id))
        await client.execute('COMMIT')
    } catch (e) {
        await client.execute('ROLLBACK')
        throw e
    }
}

// ── FTS5 keyword search ────────────────────────────────────────────

type KeywordDocResult = {
    docId: string
    rank: number
}

async function searchDocsByKeyword(
    segmentedQuery: string,
    k: number
): Promise<KeywordDocResult[]> {
    const raw = getRawClient()

    // Try AND first (precise), fall back to OR (broad) if no results.
    // This handles LLM segmentation non-determinism: when the LLM produces
    // tokens that happen to align with the index, AND gives cleaner results;
    // when it doesn't, OR ensures we still find matching docs.
    const tokens = segmentedQuery.trim().split(/\s+/)
    const candidates = [
        segmentedQuery, // AND (default for space-separated tokens)
        tokens.length > 1 ? tokens.map((t) => `"${t}"`).join(' OR ') : null,
    ].filter(Boolean) as string[]

    for (const ftsQuery of candidates) {
        try {
            const result = await raw.execute({
                sql: `
                    SELECT doc_id, rank
                    FROM docs_fts
                    WHERE docs_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                `,
                args: [ftsQuery, k],
            })
            const rows = result.rows as Array<{
                doc_id: string
                rank: number
            }>
            if (rows.length > 0) {
                return rows.map((r) => ({
                    docId: r.doc_id,
                    rank: r.rank,
                }))
            }
        } catch {
            // FTS query syntax error (e.g., special chars), try next
        }
    }
    return []
}

// ── browse / overview helpers ──────────────────────────────────────

type BrowseDoc = {
    id: string
    title: string
    sourcePath: string
    nodeCount: number
    createdAt: string
    metadata: string
}

async function getAllDocs(): Promise<BrowseDoc[]> {
    const raw = getRawClient()
    const result = await raw.execute({
        sql: `
            SELECT d.id, d.metadata, d.created_at,
                   COUNT(n.id) AS node_count
            FROM docs d
            LEFT JOIN nodes n ON n.doc_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
        `,
    })
    const rows = result.rows as Array<{
        id: string
        metadata: string
        created_at: string
        node_count: number
    }>
    return rows.map((r) => {
        const meta = JSON.parse(r.metadata) as Record<string, unknown>
        return {
            id: r.id,
            title: (meta.title as string) ?? 'Untitled',
            sourcePath: (meta.sourcePath as string) ?? '',
            nodeCount: r.node_count,
            createdAt: r.created_at,
            metadata: r.metadata,
        }
    })
}

async function getDocsPaginated(
    offset: number,
    limit: number
): Promise<BrowseDoc[]> {
    const raw = getRawClient()
    const result = await raw.execute({
        sql: `
            SELECT d.id, d.metadata, d.created_at,
                   COUNT(n.id) AS node_count
            FROM docs d
            LEFT JOIN nodes n ON n.doc_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `,
        args: [limit, offset],
    })
    const rows = result.rows as Array<{
        id: string
        metadata: string
        created_at: string
        node_count: number
    }>
    return rows.map((r) => {
        const meta = JSON.parse(r.metadata) as Record<string, unknown>
        return {
            id: r.id,
            title: (meta.title as string) ?? 'Untitled',
            sourcePath: (meta.sourcePath as string) ?? '',
            nodeCount: r.node_count,
            createdAt: r.created_at,
            metadata: r.metadata,
        }
    })
}

async function getDocCount(): Promise<number> {
    const row = db.select({ count: count() }).from(docs).get()
    return row?.count ?? 0
}

// ── high-level document listing ───────────────────────────────────

type DocInfo = BrowseDoc

/** Paginated document listing. Returns documents + total count. */
async function listDocuments(
    page: number,
    pageSize: number
): Promise<{ docs: DocInfo[]; total: number }> {
    const [docs, total] = await Promise.all([
        getDocsPaginated((page - 1) * pageSize, pageSize),
        getDocCount(),
    ])
    return { docs, total }
}

/** Get a single document's info by ID. */
async function getDocumentDetail(docId: string): Promise<DocInfo | undefined> {
    const doc = await getDoc(docId)
    if (!doc) return undefined
    let meta: Record<string, unknown> = {}
    try {
        meta = JSON.parse(doc.metadata) as Record<string, unknown>
    } catch {
        // ignore parse error
    }
    // node count requires a separate query
    const raw = getRawClient()
    const countResult = await raw.execute({
        sql: `SELECT COUNT(*) AS node_count FROM nodes WHERE doc_id = ?`,
        args: [docId],
    })
    const nodeCount =
        (countResult.rows[0] as { node_count: number })?.node_count ?? 0
    return {
        id: doc.id,
        title: (meta.title as string) ?? 'Untitled',
        sourcePath: (meta.sourcePath as string) ?? '',
        nodeCount,
        createdAt: doc.createdAt,
        metadata: doc.metadata,
    }
}

export {
    deleteDoc,
    deleteTree,
    getAllDocs,
    getAncestors,
    getCachedResponse,
    getDoc,
    getDocCount,
    getDocFtsSummary,
    getDocsPaginated,
    getDocumentDetail,
    getFullTree,
    getNodeDetails,
    getSiblings,
    getSubTree,
    insertDoc,
    insertTree,
    listDocuments,
    purgeModelCache,
    searchDocsByKeyword,
    setCachedResponse,
    updateDocFts,
    updateDocMetadata,
}
