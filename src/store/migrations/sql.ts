export const schema = [
    {
        name: '0000_create_closure_tables.sql',
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

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doc_tags (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doc_tags_tag_id ON doc_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_tags_doc_id ON doc_tags(doc_id);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorie_tags (
    id TEXT PRIMARY KEY,
    categorie_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_categorie_tags_categorie_id ON categorie_tags(categorie_id);
CREATE INDEX IF NOT EXISTS idx_categorie_tags_tag_id ON categorie_tags(tag_id);
`.trim(),
    },
    {
        name: '0000_seed_categories.sql',
        sql: `
INSERT OR IGNORE INTO categories (id, content) VALUES
('cat_000', '计算机与信息技术'),
('cat_100', '哲学与心理学'),
('cat_200', '社会科学'),
('cat_300', '经济与管理'),
('cat_400', '语言与教育'),
('cat_500', '数学与自然科学'),
('cat_600', '工程与技术'),
('cat_700', '医学与健康'),
('cat_800', '艺术与设计'),
('cat_900', '文学与写作'),
('cat_A00', '历史与地理'),
('cat_B00', '法律与政治');
`.trim(),
    },
    {
        name: '0000_create_model_cache.sql',
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
        name: '0001_unique_categorie_tags.sql',
        sql: `
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorie_tags_pair ON categorie_tags(categorie_id, tag_id);
        `.trim(),
    },
]
