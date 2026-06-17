import { sql } from 'drizzle-orm'
import {
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const docs = sqliteTable('docs', {
    id: text('id').primaryKey(),
    metadata: text('metadata').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const nodes = sqliteTable('nodes', {
    id: text('id').primaryKey(),
    docId: text('doc_id'),
    data: text('data').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const treeClosure = sqliteTable(
    'tree_closure',
    {
        ancestorId: text('ancestor_id')
            .notNull()
            .references(() => nodes.id, { onDelete: 'cascade' }),
        descendantId: text('descendant_id')
            .notNull()
            .references(() => nodes.id, { onDelete: 'cascade' }),
        depth: integer('depth').notNull(),
    },
    (table) => [primaryKey({ columns: [table.ancestorId, table.descendantId] })]
)

const modelCache = sqliteTable(
    'model_cache',
    {
        id: text('id').primaryKey(),
        md5: text('md5').notNull(),
        model: text('model').notNull(),
        response: text('response').notNull(),
        hitCount: integer('hit_count').notNull().default(0),
        createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
        updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
    },
    (table) => [
        uniqueIndex('idx_model_cache_md5_model').on(table.md5, table.model),
    ]
)

export { docs, modelCache, nodes, treeClosure }
