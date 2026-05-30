import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

const tags = sqliteTable('tags', {
    id: text('id').primaryKey(),
    tag: text('tag').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const doc_tags = sqliteTable('doc_tags', {
    id: text('id').primaryKey(),
    tagId: text('tag_id')
        .notNull()
        .references(() => tags.id, { onDelete: 'cascade' }),
    docId: text('doc_id')
        .notNull()
        .references(() => docs.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const categories = sqliteTable('categories', {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const categorie_tags = sqliteTable('categorie_tags', {
    id: text('id').primaryKey(),
    categorieId: text('categorie_id').notNull(),
    tagId: text('tag_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

const modelCache = sqliteTable('model_cache', {
    id: text('id').primaryKey(),
    md5: text('md5').notNull(),
    model: text('model').notNull(),
    response: text('response').notNull(),
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export {
    categorie_tags,
    categories,
    doc_tags,
    docs,
    modelCache,
    nodes,
    tags,
    treeClosure,
}
