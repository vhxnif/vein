# @vein/core

Core 能力包：AI Agent、数据库、文档树、配置、导入管道、工具函数。不依赖任何 UI/CLI 层。

## 目录

```
src/
├── ai/                    # AI Agent
│   ├── base.ts                # call + ToolDef + createSummarizer + setModelProvider
│   ├── librarian.ts           # 主 Agent：search → analyzeDocument → reviewResult
│   ├── reviewer.ts            # 审查 Agent：getReviewSource → 评判 pass/partial/fail
│   ├── tools.ts               # searchDocsByKeyword（FTS 搜索 + 分词）
│   └── index.ts               # 统一导出
├── config/                # 配置（不含 CLI 专属）
│   ├── index.ts               # logger、APP_NAME、resolveProjectRoot、project config 读写、initProject
│   └── type.ts                # ModelProvider、ProjectConfig 类型
├── service/               # 业务逻辑（与 I/O 分离）
│   └── import.service.ts      # importBatch：并行 LLM 摘要/分词 + 串行 DB 写入
├── store/                 # 数据库层
│   ├── schema.ts              # Drizzle schema（docs, nodes, tree_closure, model_cache, docs_fts）
│   ├── client.ts              # better-sqlite3 连接 + drizzle wrapper + Singleton
│   ├── index.ts               # 树 CRUD + doc/FTS5/search/分页/cache 操作
│   ├── migrate.ts             # runMigrations（幂等，_migrations 表追踪）
│   └── migrations/            # SQL 迁移文件 + config.schema.json + config_schema.ts
├── tree/                  # 文档树
│   ├── type.ts                # TreeNode<T>、BaseDocNode、DocNode
│   └── markdown_split.ts      # mdToTree：markdown → 扁平节点 → 瘦身 → 树形 → LLM 摘要
├── utils/                 # 通用工具
│   ├── common.ts              # uuid, md5, hash, getErrorMessage
│   └── segment.ts             # LLM 中文分词（FTS5 unicode61 适配，含 chunk 拆分 + 缓存）
└── index.ts               # 包统一导出
```

## 公开 API

通过 `package.json` 的 `exports` 提供子路径：

| 导入路径 | 导出内容 |
|---|---|
| `@vein/core` | 所有公开 API |
| `@vein/core/ai` | `call`, `createSummarizer`, `setModelProvider`, `getModelProvider`, `librarian`, `reviewer`, `searchDocsByKeyword`, 相关类型 |
| `@vein/core/config` | `logger`, `APP_NAME`, `resolveProjectRoot`, `setProjectOverride`, `loadProjectConfig`, `saveProjectConfig`, `initProject`, `veinDir` |
| `@vein/core/config/type` | `ModelProvider`, `ProjectConfig` |
| `@vein/core/store` | 全部 DB 操作函数（`getFullTree`, `insertDoc`, `searchDocsByKeyword` 等） |
| `@vein/core/tree` | `TreeNode`, `BaseDocNode`, `DocNode` |
| `@vein/core/tree/markdown_split` | `mdToTree`, `renderDocOutline` |
| `@vein/core/service/import` | `importBatch`, `collectAllSummaries`, 相关类型 |
| `@vein/core/utils/common` | `uuid`, `md5`, `hash`, `getErrorMessage` |
| `@vein/core/utils/segment` | `segmentText` |

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

### 写路径

```
insertTree(tree, docId)
  → BEGIN
  → FLATTEN → INSERT nodes (逐条)
  → INSERT tree_closure (self + ancestors)
  → COMMIT

insertDoc(id, metadata, summary)
  → BEGIN
  → INSERT OR IGNORE docs
  → DELETE docs_fts WHERE doc_id = ?  (FTS5 不支持 upsert)
  → INSERT docs_fts
  → COMMIT
```

## AI Agent 架构

### Librarian（主 Agent）

```
PROMPT + tools [ searchDocsByKeyword, analyzeDocument, reviewResult ]
  → Agent.run()
  → 返回 LibrarianResult { content, trace: TraceStep[], review?: ReviewResult }
```

- 使用 `@earendil-works/pi-agent-core` 的 `Agent` 类
- `analyzeDocument` 内并发控制：`Semaphore(MAX_PARALLEL_ANALYZE=5)`
- Context pruning：老文档结构/分析结果压缩（compactDocText / compactAnalyzeResult）

### Document Analyzer（子 Agent）

```
DOC_ANALYZER_PROMPT + tools [ getDocStructure, getDocNodeDetails ]
  → 独立 Agent 实例，≤10 步预算
  → beforeToolCall hook 强制约束
  → 输出 Markdown：## 相关性 / ## 概述 / ## 关键发现 / ## 数据来源 / ## 详细分析
```

### Reviewer（审查 Agent）

```
纯评估，无工具 → call(basePrompt + getReviewSource)
  → 返回 { verdict: "pass"|"partial"|"fail", score: 1-5, reason, suggestion }
```

## 导入管道

`importBatch(files, config, summarizer, force)`：
1. **Phase 1 — 并行 LLM** (`IMPORT_PARALLEL=4`)：`readFile → mdToTree → segmentText`
2. **Phase 2 — 串行 DB**：`deleteTree → insertTree → insertDoc`

缓存：summarizer 走 `model_cache(md5(prompt), model)`，segmentText 走 `model_cache(md5(systemPrompt+text), model)`。

## 配置

### 项目配置 (`packages/core/src/config/index.ts`)

```typescript
APP_NAME = 'vein'           // 用于 ~/.config/vein/ 日志/配置目录
logger                      // pino 实例，仅写文件，sync: true
veinDir = '.vein'           // 项目标志目录

resolveProjectRoot()        // 优先 _projectOverridePath，其次 cwd 上探
setProjectOverride(path)    // 由 CLI --project 设置
loadProjectConfig(root)     // 读取 .vein/config.json
saveProjectConfig(root, c)  // 写入 .vein/config.json
initProject(cwd, name, md)  // 创建 .vein/ + config + schema + 迁移
```

### 类型 (`packages/core/src/config/type.ts`)

```typescript
type ModelProvider = { provider: KnownProvider; model: string }
type ProjectConfig = {
    name: string; db: string; model: ModelProvider;
    summarizer?: ModelProvider; segmenter?: ModelProvider
}
```

## 日志

- **输出**：仅文件 `~/.config/vein/logs/vein-YYYY-MM-DD.log`，JSON 每行一条
- **创建**：`import { logger } from '@vein/core/config'`
- **子模块**：`logger.child({ module: 'xxx' })`
- **级别**：`debug`（默认），生产可调 `info`
- **约束**：禁止记录完整 LLM prompt/response/文档树；Agent 结果仅记摘要（resultSummary + resultLen）

## 开发

```bash
# 类型检查（从根目录）
bun run check

# 仅构建 core 不需要单独构建（被 CLI 打包时卷入）
```
