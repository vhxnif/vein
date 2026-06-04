export const schema = [
    {
        name: 'v0.1.0_create_closure_tables.sql',
        sql: `
CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    metadata TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    doc_id TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tree_closure (
    ancestor_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    descendant_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    depth INTEGER NOT NULL CHECK (depth >= 0),
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_closure_ancestor ON tree_closure(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_closure_descendant ON tree_closure(descendant_id);
CREATE INDEX IF NOT EXISTS idx_nodes_doc_id ON nodes(doc_id);

`.trim(),
    },
    {
        name: 'v0.1.0_create_model_cache.sql',
        sql: `
CREATE TABLE IF NOT EXISTS model_cache (
    id TEXT PRIMARY KEY,
    md5 TEXT NOT NULL,
    model TEXT NOT NULL,
    response TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_model_cache_md5_model ON model_cache(md5, model);
        `.trim(),
    },
    {
        name: 'v0.1.0_create_fts_tables.sql',
        sql: `
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
    doc_id,
    summary
);
        `.trim(),
    },
    {
        name: 'v0.1.0_strengthen_constraints.sql',
        sql: `
CREATE INDEX IF NOT EXISTS idx_docs_created_at ON docs(created_at);
DROP INDEX IF EXISTS idx_model_cache_md5_model;
CREATE UNIQUE INDEX idx_model_cache_md5_model ON model_cache(md5, model);
CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
        `.trim(),
    },
]
