# @vein/core

Core 能力包：作为"服务端"提供完整业务能力。AI Agent、数据库、文档树、配置、导入管道、历史记录、全局注册表。不依赖任何 UI/CLI 层。

外部（CLI / Web）只需通过 `@vein/core` 单一入口导入高层函数，不接触内部模块。

## 目录

```
src/
├── ai/                    # AI Agent
│   ├── base.ts                # call + ToolDef + createSummarizer + setModelProvider + listProviders + listModels
│   ├── librarian.ts           # 主 Agent：search → analyzeDocument → reviewResult
│   ├── reviewer.ts            # 审查 Agent：getReviewSource → 评判 pass/partial/fail
│   ├── tools.ts               # searchDocsByKeyword + resolveDocNames + searchDocuments
│   └── index.ts
├── config/                # 配置
│   ├── index.ts               # logger、APP_NAME、resolveProjectRoot、project config 读写、initProject、setupProjectModel
│   ├── type.ts                # ModelProvider、ProjectConfig 类型
│   ├── global.ts              # 全局项目注册表（~/.config/vein/projects.json CRUD）
│   └── cached-summarizer.ts   # createCachedSummarizer（带缓存 + 超时）
├── service/               # 业务逻辑（与 I/O 分离）
│   ├── import.service.ts      # importBatch + resegmentAllDocuments
│   └── history.service.ts     # saveSearchHistory + listSearchHistory + getSearchHistoryEntry
├── store/                 # 数据库层
│   ├── schema.ts              # Drizzle schema
│   ├── client.ts              # better-sqlite3 连接 + Singleton
│   ├── index.ts               # 树 CRUD + doc/FTS5/search/分页/cache 操作 + listDocuments + getDocumentDetail
│   ├── migrate.ts             # runMigrations
│   └── migrations/            # SQL 迁移文件
├── tree/                  # 文档树
│   ├── type.ts                # TreeNode<T>、BaseDocNode、DocNode
│   └── markdown_split.ts      # mdToTree
├── utils/                 # 通用工具
│   ├── common.ts              # uuid, md5, hash, getErrorMessage
│   └── segment.ts             # LLM 中文分词
└── index.ts               # 统一导出（单一入口 @vein/core）
```

## 公开 API

全部通过 `import { ... } from '@vein/core'` 导出。不提供子路径。

### 项目生命周期

```typescript
initProject(cwd, name, model)          → ProjectConfig
loadProjectConfig(root)                → ProjectConfig | undefined
saveProjectConfig(root, config)        → void
resolveProjectRoot()                   → string | undefined
setProjectOverride(path | undefined)   → void
setupProjectModel()                    → ProjectConfig | undefined
```

### 模型配置

```typescript
setModelProvider(provider)  → void
getModelProvider()          → ModelProvider
listProviders()             → string[]
listModels(provider)        → {id, name}[]
createCachedSummarizer(cfg) → (prompt: string) => Promise<string>
```

### 文档导入

```typescript
importBatch(files, config, summarizer, force, onProgress?) → ImportResult[]
resegmentAllDocuments(config, force) → { written, skipped, failed }
```

### 文档检索

```typescript
searchDocuments(query, opts?) → SearchResult
// SearchResult = LibrarianResult & { docNames: Map<string, string> }
// opts: { segmenter?, onStep? }
```

### 文档浏览

```typescript
listDocuments(page, pageSize) → { docs: DocInfo[], total: number }
getDocumentDetail(docId)      → DocInfo | undefined
```

### 历史记录

```typescript
saveSearchHistory(root, query, result, elapsedMs)  → id
listSearchHistory(root)                             → HistoryEntry[]
getSearchHistoryEntry(root, id)                     → HistoryEntry | undefined
```

### 全局注册表

```typescript
registerProject(name, path)   → void
unregisterProject(name)       → void
getProjectPath(name)          → string | undefined
loadGlobalProjects()          → { projects: Record<string, string> }
```

### 基础

```typescript
APP_NAME: 'vein'
logger: pino.Logger
```

## 数据模型

### 树形结构

```
TreeNode<T> {
    nodeId: string      // "0001_docMd5"
    nodes: TreeNode<T>[] // 子节点
    value: T            // BaseDocNode { title, lineNum, text, summary?, prefixSummary? }
}
```

### 数据库表

| 表 | 用途 | 关键约束 |
|---|---|---|
| `docs` | 文档实体 | id = md5(content) |
| `nodes` | 树节点 | id = "XXXX_hash"，doc_id FK |
| `tree_closure` | 闭包表 | (ancestor_id, descendant_id) PK，depth ≥ 0 |
| `model_cache` | 响应缓存 | (md5, model) UNIQUE，hit_count 自增 |
| `docs_fts` | 全文索引 | FTS5 unicode61，写入前经 segmentText 分词 |

## AI Agent 架构

### Librarian（主 Agent）

```
PROMPT + tools [ searchDocsByKeyword, analyzeDocument, reviewResult ]
  → Agent.run()
  → 返回 LibrarianResult { content, trace: TraceStep[], review?: ReviewResult }
```

- 使用 `@earendil-works/pi-agent-core` 的 `Agent` 类
- `analyzeDocument` 内并发控制：`Semaphore(MAX_PARALLEL_ANALYZE=5)`

### Document Analyzer（子 Agent）

独立 Agent 实例，≤10 步预算，输出 Markdown 格式分析。

### Reviewer（审查 Agent）

纯评估 Agent，返回 `{ verdict, score, reason, suggestion }`。

## 导入管道

`importBatch(files, config, summarizer, force)`：
1. **Phase 1 — 并行 LLM** (`IMPORT_PARALLEL=4`)：`readFile → mdToTree → segmentText`
2. **Phase 2 — 串行 DB**：`deleteTree → insertTree → insertDoc`

## 日志

- **输出**：仅文件 `~/.config/vein/logs/vein-YYYY-MM-DD.log`，JSON 每行一条
- **创建**：`import { logger } from '@vein/core'` → `logger.child({ module: 'xxx' })`
- **约束**：禁止记录完整 LLM prompt/response/文档树

## 开发

```bash
# 类型检查（从根目录）
bun run check

# core 不需要单独构建（被 CLI 打包时卷入）
```
