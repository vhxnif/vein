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
// opts: { segmenter?, subagentModel?, reviewerModel?, searchAgentModel?, onStep? }
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

### 三层子 Agent

| 层级 | Agent | 步骤预算 | 工具 | 日志模块 |
|------|-------|---------|------|---------|
| 1 | SearchScreener | ≤6 | `searchDocsByKeyword`（含嵌入 outline） | `search-screener` |
| 2 | Document Analyzer | ≤10 | `getDocStructure`, `getDocNodeDetails` | `doc-analyzer` |
| 3 | Reviewer | — | `getReviewSource` | `ai` |

### Librarian（主 Agent）

```
PROMPT + tools [ searchDocuments, analyzeDocument, reviewResult ]
  → Agent.run()
  → 返回 LibrarianResult { content, trace: TraceStep[], review?: ReviewResult }
```

- `searchDocuments` 内部 spawn SearchScreener 子 Agent，步骤以 `[Search]` 前缀透传 `onStep`
- `searchDocsByKeyword` 工具现在返回结果嵌入 `outline` 字段（compactDocText 产物），子 Agent 可同时查看 snippet + 大纲
- `analyzeDocument` 内并发控制：`Semaphore(MAX_PARALLEL_ANALYZE=10)`
- 步骤以 `[${shortDocId}]` 前缀透传 `onStep`

### Adding a new model config field — checklist

当一个场景需要独立模型配置时，必须同步修改 6 个位置：

1. `config/type.ts` — `ProjectConfig` 新增 `fieldName?: ModelProvider`
2. `store/migrations/config_schema.ts` — JSON Schema 新增对应属性
3. `cli/command/config.command.ts` — `display()` 新增显示行 + 菜单新增选项 + switch 新增 case
4. `cli/command/ask.command.ts` — `searchDocuments()` 调用处传入 `fieldName: config.fieldName`
5. `web/routes/search.ts` — 同上
6. `librarian.ts` — `buildMainTools()` 和 `librarian()` opts 新增参数，透传到对应工具

### Agent event ordering quirk

`beforeToolCall` 是 async hook，Agent 框架可能在其 resolve 前就派发 `tool_execution_start` 事件。这导致首次 tool start 日志中 `stepCount: 0` 而非 `1`。预算拦截（在 `beforeToolCall` 内同步执行）不受影响。这是框架行为，所有子 Agent 一致。

## 导入管道

`importBatch(files, config, summarizer, force)`：
1. **Phase 1 — 并行 LLM** (`IMPORT_PARALLEL=4`)：`readFile → mdToTree → segmentText`
2. **Phase 2 — 串行 DB**：`deleteTree → insertTree → insertDoc`

## 日志

- **输出**：仅文件 `~/.config/vein/logs/vein-YYYY-MM-DD.log`，JSON 每行一条
- **创建**：`import { logger } from '@vein/core'` → `logger.child({ module: 'xxx' })`
- **约束**：禁止记录完整 LLM prompt/response/文档树

## 陷阱

- **Prompt 模板字符串中的反引号**：`librarian.ts` 的 `PROMPT` 常量使用反引号模板字符串。在 prompt 文本中嵌入代码示例时，反引号（如 `` `ref reactive 区别` ``）会提前闭合模板字符串，导致 TS 解析错误。改用书名号（「」）或其他符号包裹代码示例。

## 开发

```bash
# 类型检查（从根目录）
bun run check

# core 不需要单独构建（被 CLI 打包时卷入）
```
