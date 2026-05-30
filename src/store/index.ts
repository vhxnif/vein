import { and, count, eq, sql } from 'drizzle-orm'
import { logger } from '../config'
import type { TreeNode } from '../tree/type'
import { uuid } from '../utils/common'
import { db, getRawClient } from './client'
import {
    categorie_tags,
    categories,
    doc_tags,
    docs,
    modelCache,
    nodes,
    tags,
} from './schema'

// ── tag normalization ───────────────────────────────────────────────

/**
 * Normalize a raw tag string before persisting:
 * - Unicode NFC normalization
 * - Trim & collapse whitespace
 * - Full-width ASCII → half-width
 * - ASCII uppercase → lowercase
 */
function normalizeTag(raw: string): string {
    return raw
        .normalize('NFC')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[\uFF01-\uFF5E]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
        )
        .replace(/[A-Z]+/g, (m) => m.toLowerCase())
}

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
                sql: 'INSERT INTO nodes (id, doc_id, data) VALUES (?1, ?2, ?3)',
                args: [nodeId, docId ?? null, nodeToJson(fn.node)],
            })
            indexToId.set(fn.index, nodeId)

            await client.execute({
                sql: 'INSERT INTO tree_closure (ancestor_id, descendant_id, depth) VALUES (?1, ?2, 0)',
                args: [nodeId, nodeId],
            })
        }

        for (const fn of flatNodes) {
            if (fn.parentIndex < 0) continue

            const nodeId = indexToId.get(fn.index)!
            const parentId = indexToId.get(fn.parentIndex)!

            await client.execute({
                sql: 'INSERT INTO tree_closure (ancestor_id, descendant_id, depth) VALUES (?1, ?2, 1)',
                args: [parentId, nodeId],
            })

            await client.execute({
                sql: `INSERT INTO tree_closure (ancestor_id, descendant_id, depth)
                      SELECT ancestor_id, ?1, depth + 1
                      FROM tree_closure WHERE descendant_id = ?2 AND depth > 0`,
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
                      WHERE descendant_id IN (SELECT id FROM nodes WHERE doc_id = ?1)`,
                args: [docId],
            })
            await client.execute({
                sql: 'DELETE FROM nodes WHERE doc_id = ?1',
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
              WHERE tc.ancestor_id = ?1
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
              WHERE tc.descendant_id = ?1 AND tc.depth > 0
              ORDER BY tc.depth DESC`,
        args: [nodeId],
    })

    return (result.rows as unknown as NodeRow[]).map((row) =>
        jsonToTreeNode<T>(row)
    )
}

async function getSiblings<T>(nodeId: string): Promise<TreeNode<T>[]> {
    const traceId = Bun.randomUUIDv7()
    const client = getRawClient()

    const parentResult = await client.execute({
        sql: `SELECT ancestor_id FROM tree_closure
              WHERE descendant_id = ?1 AND depth = 1`,
        args: [nodeId],
    })

    logger.info({ traceId, nodeId, parent: parentResult })

    const parentRow = parentResult.rows[0] as
        | { ancestor_id: string }
        | undefined
    if (!parentRow) return []

    const result = await client.execute({
        sql: `SELECT n.id, n.data FROM nodes n
              JOIN tree_closure tc ON n.id = tc.descendant_id
              WHERE tc.ancestor_id = ?1 AND tc.depth = 1 AND tc.descendant_id != ?2
              ORDER BY n.id`,
        args: [parentRow.ancestor_id, nodeId],
    })
    logger.info({ traceId, nodeId, result })
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
                  WHERE n.doc_id = ?1
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
    const row = await db
        .select()
        .from(modelCache)
        .where(and(eq(modelCache.md5, md5), eq(modelCache.model, model)))
        .get()

    if (!row) {
        log.info({ md5: md5.slice(0, 16), model, content: 'Cache miss' })
        return void 0
    }

    await db
        .update(modelCache)
        .set({ hitCount: row.hitCount + 1 })
        .where(eq(modelCache.id, row.id))

    return row.response
}

async function setCachedResponse(
    md5: string,
    model: string,
    response: string
): Promise<void> {
    const existing = await db
        .select({ id: modelCache.id })
        .from(modelCache)
        .where(and(eq(modelCache.md5, md5), eq(modelCache.model, model)))
        .get()

    if (existing) {
        await db
            .update(modelCache)
            .set({ response })
            .where(eq(modelCache.id, existing.id))
        log.info({ md5: md5.slice(0, 16), model, content: 'Cache updated' })
    } else {
        await db.insert(modelCache).values({
            id: Bun.randomUUIDv7(),
            md5,
            model,
            response,
        })
        log.info({ md5: md5.slice(0, 16), model, content: 'Cache inserted' })
    }
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

async function insertDoc(id: string, metadata: Record<string, unknown>) {
    return db
        .insert(docs)
        .values({ id, metadata: JSON.stringify(metadata) })
        .onConflictDoNothing()
        .returning()
}

async function getDoc(id: string) {
    return db.select().from(docs).where(eq(docs.id, id)).get()
}

async function deleteDoc(id: string) {
    log.info({ docId: id, content: 'Deleting doc' })
    return db.delete(docs).where(eq(docs.id, id))
}

async function getCategories(): Promise<{ id: string; content: string }[]> {
    const rows = await db.select().from(categories).all()
    return rows.map((r) => ({ id: r.id, content: r.content }))
}

/**
 * Returns existing tags grouped by category, ordered by usage count (desc).
 * Used to inject a "preferred vocabulary" into the tagger prompt.
 */
async function getAllTagsGrouped(): Promise<Map<string, string[]>> {
    const rows = await db
        .select({
            tag: tags.tag,
            categoryId: categorie_tags.categorieId,
            docCount: count(doc_tags.docId),
        })
        .from(tags)
        .innerJoin(categorie_tags, eq(tags.id, categorie_tags.tagId))
        .leftJoin(doc_tags, eq(tags.id, doc_tags.tagId))
        .groupBy(tags.id, categorie_tags.categorieId)
        .orderBy(sql`${count(doc_tags.docId)} DESC`)
        .all()

    const map = new Map<string, string[]>()
    for (const row of rows) {
        const list = map.get(row.categoryId) ?? []
        list.push(row.tag)
        map.set(row.categoryId, list)
    }
    return map
}

async function getTagsByCategory(
    categoryId: string
): Promise<{ id: string; tag: string }[]> {
    return db
        .select({ id: tags.id, tag: tags.tag })
        .from(tags)
        .innerJoin(categorie_tags, eq(tags.id, categorie_tags.tagId))
        .where(eq(categorie_tags.categorieId, categoryId))
        .all()
}

async function getDocsByTag(
    tagId: string
): Promise<{ id: string; metadata: string }[]> {
    return db
        .select({ id: docs.id, metadata: docs.metadata })
        .from(docs)
        .innerJoin(doc_tags, eq(docs.id, doc_tags.docId))
        .where(eq(doc_tags.tagId, tagId))
        .all()
}

async function upsertTag(
    tagName: string
): Promise<{ id: string; tag: string }> {
    const normalized = normalizeTag(tagName)
    if (!normalized) {
        throw new Error(`Tag name is empty after normalization: "${tagName}"`)
    }
    const existing = await db
        .select()
        .from(tags)
        .where(eq(tags.tag, normalized))
        .get()
    if (existing) {
        return { id: existing.id, tag: existing.tag }
    }
    const id = uuid()
    await db.insert(tags).values({ id, tag: normalized })
    return { id, tag: normalized }
}

async function insertDocTag(tagId: string, docId: string): Promise<void> {
    const id = uuid()
    await db.insert(doc_tags).values({ id, tagId, docId }).onConflictDoNothing()
}

async function insertCategorieTag(
    categorieId: string,
    tagId: string
): Promise<void> {
    const id = uuid()
    await db
        .insert(categorie_tags)
        .values({ id, categorieId, tagId })
        .onConflictDoNothing()
}

// ── embedding (sqlite-vec vec0) ─────────────────────────────────────

let _embeddingDim = 0

async function upsertTagEmbedding(
    tagId: string,
    embedding: number[]
): Promise<void> {
    const raw = getRawClient()

    // Lazily create vec0 table with actual embedding dimension on first use
    if (_embeddingDim === 0) {
        _embeddingDim = embedding.length
        raw.execute({
            sql: `CREATE VIRTUAL TABLE IF NOT EXISTS tag_embeddings USING vec0(
                tag_id TEXT PRIMARY KEY,
                embedding FLOAT[${embedding.length}]
            )`,
        })
    }

    raw.execute({
        sql: `INSERT OR REPLACE INTO tag_embeddings (tag_id, embedding) VALUES (?1, ?2)`,
        args: [tagId, JSON.stringify(embedding)],
    })
}

async function getTagsWithoutEmbeddings(): Promise<
    Array<{ id: string; tag: string }>
> {
    try {
        const result = await getRawClient().execute({
            sql: `
                SELECT t.id, t.tag
                FROM tags t
                LEFT JOIN tag_embeddings te ON te.tag_id = t.id
                WHERE te.tag_id IS NULL
            `,
        })
        return result.rows as Array<{ id: string; tag: string }>
    } catch {
        // tag_embeddings table doesn't exist yet — all tags need embeddings
        const result = await getRawClient().execute({
            sql: `SELECT t.id, t.tag FROM tags t`,
        })
        return result.rows as Array<{ id: string; tag: string }>
    }
}

type SimilarTag = {
    tagId: string
    tag: string
    similarity: number
}

async function searchSimilarTags(
    embedding: number[],
    categoryId: string,
    k: number,
    threshold: number
): Promise<SimilarTag[]> {
    // cosine distance = 1 - cosine similarity
    const maxDistance = 1 - threshold
    const raw = getRawClient()

    let rows: Array<{ id: string; tag: string; distance: number }> = []
    try {
        const result = await raw.execute({
            sql: `
                SELECT t.id, t.tag, te.distance
                FROM tag_embeddings te
                JOIN tags t ON t.id = te.tag_id
                JOIN categorie_tags ct ON ct.tag_id = t.id
                WHERE te.embedding MATCH ?1
                  AND ct.categorie_id = ?2
                  AND k = ?3
            `,
            args: [JSON.stringify(embedding), categoryId, k],
        })
        rows = result.rows as Array<{
            id: string
            tag: string
            distance: number
        }>
    } catch {
        // tag_embeddings table not created yet (no embeddings exist)
        return []
    }

    return rows
        .filter((r) => r.distance <= maxDistance)
        .map((r) => ({
            tagId: r.id,
            tag: r.tag,
            similarity: Math.round((1 - r.distance) * 10000) / 10000,
        }))
}

async function searchAllSimilarTags(
    embedding: number[],
    k: number,
    threshold: number
): Promise<SimilarTag[]> {
    const maxDistance = 1 - threshold
    const raw = getRawClient()

    let rows: Array<{ id: string; tag: string; distance: number }> = []
    try {
        const result = await raw.execute({
            sql: `
                SELECT t.id, t.tag, te.distance
                FROM tag_embeddings te
                JOIN tags t ON t.id = te.tag_id
                WHERE te.embedding MATCH ?1
                  AND k = ?2
            `,
            args: [JSON.stringify(embedding), k],
        })
        rows = result.rows as Array<{
            id: string
            tag: string
            distance: number
        }>
    } catch {
        return []
    }

    return rows
        .filter((r) => r.distance <= maxDistance)
        .map((r) => ({
            tagId: r.id,
            tag: r.tag,
            similarity: Math.round((1 - r.distance) * 10000) / 10000,
        }))
}

export {
    deleteDoc,
    deleteTree,
    getAllTagsGrouped,
    getAncestors,
    getCachedResponse,
    getCategories,
    getDoc,
    getDocsByTag,
    getFullTree,
    getNodeDetails,
    getSiblings,
    getSubTree,
    getTagsByCategory,
    getTagsWithoutEmbeddings,
    insertCategorieTag,
    insertDoc,
    insertDocTag,
    insertTree,
    purgeModelCache,
    searchAllSimilarTags,
    searchSimilarTags,
    setCachedResponse,
    upsertTag,
    upsertTagEmbedding,
}
