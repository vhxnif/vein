import { count, eq, sql } from 'drizzle-orm'
import { logger } from '../config/index.ts'
import type { TreeNode } from '../tree/type.ts'
import { db, getRawClient } from './client.ts'
import { docs, modelCache, nodes } from './schema.ts'

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

/**
 * Batch version of getFullTree: fetches full tree structures for multiple
 * docIds in 3 SQL queries (roots, all subtree nodes, parent relationships)
 * and reconstructs trees per docId in memory.
 */
async function getFullTrees<T>(
    docIds: string[]
): Promise<Map<string, TreeNode<T>[]>> {
    const result = new Map<string, TreeNode<T>[]>()
    if (docIds.length === 0) return result

    const client = getRawClient()
    const docPlaceholders = docIds.map(() => '?').join(', ')

    // 1. Find root nodes for all docIds
    const rootResult = await client.execute({
        sql: `SELECT n.id, n.doc_id FROM nodes n
              WHERE n.doc_id IN (${docPlaceholders})
              AND NOT EXISTS (
                  SELECT 1 FROM tree_closure tc
                  WHERE tc.descendant_id = n.id AND tc.depth = 1
              )`,
        args: docIds,
    })

    const rootRows = rootResult.rows as unknown as {
        id: string
        doc_id: string
    }[]

    // Map docId → root node IDs; seed empty arrays for all requested docIds
    const docRoots = new Map<string, string[]>()
    for (const docId of docIds) {
        docRoots.set(docId, [])
        result.set(docId, [])
    }
    const allRootIds: string[] = []
    for (const row of rootRows) {
        docRoots.get(row.doc_id)?.push(row.id)
        allRootIds.push(row.id)
    }

    if (allRootIds.length === 0) return result

    // 2. Get all subtree nodes for all roots (depth≥0 includes roots themselves)
    const rootPlaceholders = allRootIds.map(() => '?').join(', ')
    const nodeResult = await client.execute({
        sql: `SELECT n.id, n.data, n.doc_id FROM nodes n
              JOIN tree_closure tc ON n.id = tc.descendant_id
              WHERE tc.ancestor_id IN (${rootPlaceholders})
              ORDER BY n.id`,
        args: allRootIds,
    })

    const nodeRows = nodeResult.rows as unknown as {
        id: string
        data: string
        doc_id: string
    }[]

    if (nodeRows.length === 0) return result

    // 3. Get direct parent relationships (depth=1) for all subtree nodes
    const allNodeIds = nodeRows.map((r) => r.id)
    const parentMap = new Map<string, string>()
    if (allNodeIds.length > 1) {
        const nodePlaceholders = allNodeIds.map(() => '?').join(', ')
        const parentResult = await client.execute({
            sql: `SELECT descendant_id, ancestor_id FROM tree_closure
                  WHERE depth = 1 AND descendant_id IN (${nodePlaceholders})`,
            args: allNodeIds,
        })
        for (const row of parentResult.rows as unknown as {
            descendant_id: string
            ancestor_id: string
        }[]) {
            parentMap.set(row.descendant_id, row.ancestor_id)
        }
    }

    // 4. Reconstruct trees per docId
    for (const [docId] of docRoots) {
        const nodeMap = new Map<string, TreeNode<T>>()
        for (const row of nodeRows) {
            if (row.doc_id === docId) {
                nodeMap.set(row.id, jsonToTreeNode<T>(row))
            }
        }
        if (nodeMap.size === 0) continue

        const roots: TreeNode<T>[] = []
        for (const [id, node] of nodeMap) {
            const parentId = parentMap.get(id)
            if (parentId === undefined || !nodeMap.has(parentId)) {
                roots.push(node)
            } else {
                const parent = nodeMap.get(parentId)!
                parent.nodes.push(node)
            }
        }
        result.set(docId, roots)
    }

    return result
}

/**
 * Lightweight batch outline: returns compacted text outlines for multiple
 * docIds using json_extract to avoid transferring the bulky `text` field.
 * Still uses tree_closure for correct hierarchy, but skips summary data.
 */
async function getDocOutlines(docIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (docIds.length === 0) return result

    const client = getRawClient()
    const docPlaceholders = docIds.map(() => '?').join(', ')

    // 1. Find root nodes for all docIds
    const rootResult = await client.execute({
        sql: `SELECT n.id, n.doc_id FROM nodes n
              WHERE n.doc_id IN (${docPlaceholders})
              AND NOT EXISTS (
                  SELECT 1 FROM tree_closure tc
                  WHERE tc.descendant_id = n.id AND tc.depth = 1
              )`,
        args: docIds,
    })

    const rootRows = rootResult.rows as unknown as {
        id: string
        doc_id: string
    }[]

    const allRootIds: string[] = []
    const docRootMap = new Map<string, string[]>()
    for (const docId of docIds) {
        docRootMap.set(docId, [])
        result.set(docId, '')
    }
    for (const row of rootRows) {
        allRootIds.push(row.id)
        docRootMap.get(row.doc_id)?.push(row.id)
    }

    if (allRootIds.length === 0) return result

    // 2. Get subtree nodes with only title/prefixSummary (json_extract avoids
    //    pulling the large `text` field from the data JSON blob).
    const rootPlaceholders = allRootIds.map(() => '?').join(', ')
    const nodeResult = await client.execute({
        sql: `SELECT n.id,
                     json_extract(n.data, '$.title') AS title,
                     json_extract(n.data, '$.prefixSummary') AS pref_summary,
                     n.doc_id
              FROM nodes n
              JOIN tree_closure tc ON n.id = tc.descendant_id
              WHERE tc.ancestor_id IN (${rootPlaceholders})
              ORDER BY n.id`,
        args: allRootIds,
    })

    const nodeRows = nodeResult.rows as unknown as {
        id: string
        title: string | null
        pref_summary: string | null
        doc_id: string
    }[]

    if (nodeRows.length === 0) return result

    // 3. Get direct parent relationships (depth=1)
    const allNodeIds = nodeRows.map((r) => r.id)
    const parentMap = new Map<string, string>()
    if (allNodeIds.length > 1) {
        const nodePlaceholders = allNodeIds.map(() => '?').join(', ')
        const parentResult = await client.execute({
            sql: `SELECT descendant_id, ancestor_id FROM tree_closure
                  WHERE depth = 1 AND descendant_id IN (${nodePlaceholders})`,
            args: allNodeIds,
        })
        for (const row of parentResult.rows as unknown as {
            descendant_id: string
            ancestor_id: string
        }[]) {
            parentMap.set(row.descendant_id, row.ancestor_id)
        }
    }

    // 4. Build indented outline text per docId
    for (const [docId] of docRootMap) {
        // Group nodes for this docId
        const docNodes = new Map<
            string,
            { id: string; title: string; prefSummary: string | null }
        >()
        for (const row of nodeRows) {
            if (row.doc_id === docId) {
                docNodes.set(row.id, {
                    id: row.id,
                    title: row.title ?? '',
                    prefSummary: row.pref_summary,
                })
            }
        }
        if (docNodes.size === 0) continue

        // Reconstruct tree shape (same logic as getFullTrees)
        const childrenMap = new Map<string, string[]>()
        const roots: string[] = []
        for (const [nid] of docNodes) {
            const parentId = parentMap.get(nid)
            if (parentId === undefined || !docNodes.has(parentId)) {
                roots.push(nid)
            } else {
                const siblings = childrenMap.get(parentId) ?? []
                siblings.push(nid)
                childrenMap.set(parentId, siblings)
            }
        }

        // Render indented outline
        const lines: string[] = []
        const render = (nodeId: string, depth: number) => {
            const node = docNodes.get(nodeId)
            if (!node) return
            const pad = '  '.repeat(depth)
            const idNum = nodeId.split('_')[0]
            const children = childrenMap.get(nodeId)
            if (children && children.length > 0) {
                lines.push(`${pad}${idNum} ${node.title}`)
                if (node.prefSummary) {
                    lines.push(`${pad}  ${node.prefSummary}`)
                }
                for (const childId of children) {
                    render(childId, depth + 1)
                }
            } else {
                lines.push(`${pad}${idNum} ${node.title}`)
                // Note: we intentionally skip leaf summaries to keep it compact
            }
        }
        for (const rootId of roots) {
            render(rootId, 0)
        }

        // Keep only node-id + title lines (drop summaries for compactness)
        const compacted = lines
            .filter((line) => /^\s*\d+\s+\S/.test(line))
            .join('\n')
        result.set(docId, compacted)
    }

    return result
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
    limit: number,
    offset = 0
): Promise<KeywordDocResult[]> {
    const raw = getRawClient()

    // OR semantics: LLM segmentation is non-deterministic and may not align
    // with the indexed tokens. OR + BM25 ranking gives robust recall while
    // keeping the most relevant docs at the top via rank ordering.
    const tokens = segmentedQuery.trim().split(/\s+/)
    const ftsQuery =
        tokens.length === 1
            ? `"${tokens[0]}"`
            : tokens.map((t) => `"${t}"`).join(' OR ')

    try {
        const result = await raw.execute({
            sql: `
                SELECT doc_id, rank
                FROM docs_fts
                WHERE docs_fts MATCH ?
                ORDER BY rank
                LIMIT ? OFFSET ?
            `,
            args: [ftsQuery, limit, offset],
        })
        const rows = result.rows as Array<{
            doc_id: string
            rank: number
        }>
        return rows.map((r) => ({
            docId: r.doc_id,
            rank: r.rank,
        }))
    } catch {
        return []
    }
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

/** Paginated document listing. Returns documents + total count. */
async function listDocuments(
    page: number,
    pageSize: number,
    keyword?: string
): Promise<{ docs: BrowseDoc[]; total: number }> {
    if (keyword?.trim()) {
        return listDocumentsByKeyword(page, pageSize, keyword.trim())
    }
    const [docs, total] = await Promise.all([
        getDocsPaginated((page - 1) * pageSize, pageSize),
        getDocCount(),
    ])
    return { docs, total }
}

/** Paginated document listing filtered by FTS5 keyword search. */
async function listDocumentsByKeyword(
    page: number,
    pageSize: number,
    keyword: string
): Promise<{ docs: BrowseDoc[]; total: number }> {
    const raw = getRawClient()
    const offset = (page - 1) * pageSize

    // Sanitize: strip double quotes to prevent FTS5 query syntax issues
    const safeKeyword = keyword.replace(/"/g, '')
    if (!safeKeyword.trim()) {
        // After stripping quotes, keyword is empty — fall back to full listing
        return listDocuments(page, pageSize)
    }

    const tokens = safeKeyword.split(/\s+/).filter(Boolean)
    const ftsQuery =
        tokens.length === 1
            ? `"${tokens[0]}"`
            : tokens.map((t) => `"${t}"`).join(' OR ')

    // Step 1: FTS5 search to get matching docIds with ranks
    let matchedIds: string[]
    let total = 0
    try {
        const countResult = await raw.execute({
            sql: `SELECT COUNT(*) AS count FROM docs_fts WHERE docs_fts MATCH ?`,
            args: [ftsQuery],
        })
        total = (countResult.rows[0] as { count: number })?.count ?? 0

        if (total === 0) return { docs: [], total: 0 }

        const result = await raw.execute({
            sql: `
                SELECT doc_id, rank
                FROM docs_fts
                WHERE docs_fts MATCH ?
                ORDER BY rank
                LIMIT ? OFFSET ?
            `,
            args: [ftsQuery, pageSize, offset],
        })
        const rows = result.rows as Array<{
            doc_id: string
            rank: number
        }>
        matchedIds = rows.map((r) => r.doc_id)
    } catch {
        return { docs: [], total: 0 }
    }

    if (matchedIds.length === 0) return { docs: [], total: 0 }

    // Step 2: Query docs metadata + node counts for the matched docIds
    const placeholders = matchedIds.map(() => '?').join(', ')
    try {
        const result = await raw.execute({
            sql: `
                SELECT d.id, d.metadata, d.created_at,
                       COUNT(n.id) AS node_count
                FROM docs d
                LEFT JOIN nodes n ON n.doc_id = d.id
                WHERE d.id IN (${placeholders})
                GROUP BY d.id
                ORDER BY d.created_at DESC
            `,
            args: matchedIds,
        })
        const rows = result.rows as Array<{
            id: string
            metadata: string
            created_at: string
            node_count: number
        }>

        // Preserve FTS rank order
        const docMap = new Map(rows.map((r) => [r.id, r]))
        const docs = matchedIds
            .map((id) => docMap.get(id))
            .filter((r): r is NonNullable<typeof r> => r !== undefined)
            .map((r) => {
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

        return { docs, total }
    } catch {
        return { docs: [], total: 0 }
    }
}

/** Get a single document's info by ID. */
async function getDocumentDetail(
    docId: string
): Promise<BrowseDoc | undefined> {
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
    getDocOutlines,
    getDocsPaginated,
    getDocumentDetail,
    getFullTree,
    getFullTrees,
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
