# AGENTS

## 项目概述

Vein 是一个基于 AI Agent 的文档管理与智能检索系统。核心理念是通过关键词分词搜索直接定位到具体文档，然后深入文档节点查找原文。

项目采用 **monorepo** 组织，包含以下包：

| 包 | 路径 | 说明 |
|---|---|---|
| `@vein/core` | `packages/core/` | 核心能力：AI Agent、数据库、文档树、配置、工具函数、导入服务 |
| `@vein/cli` | `packages/cli/` | CLI 层：命令注册、交互式 UI、全局项目注册表 |
| `@vein/web` | `packages/web/` | Web 端：基于 Hono + React + TanStack Router 的文档检索 Web 界面 |

CLI 和 Web 通过 workspace 依赖 `@vein/core`，core 不依赖 CLI 和 Web。

## 技术栈

- **运行时**: Node.js（开发用 Bun 运行 TS 源码，构建产物 `packages/cli/dist/vein.js` 运行于 Node.js）
- **数据库**: SQLite (better-sqlite3, WAL 模式), ORM 用 Drizzle (`drizzle-orm/better-sqlite3`)
- **全文搜索**: FTS5 (BM25 排序)，文档内容中文分词后建立索引
- **中文分词**: LLM 切词 + FTS5 unicode61 空格分词（写入侧，文档统一）
- **AI 模型**: 通过 @earendil-works/pi-ai 调用，可在 .vein/config.json 中配置
- **批量导入**: 两阶段并行：LLM 阶段 4 文件并发（Promise.all），DB 阶段串行（WAL 模式优化写入）
- **代码风格**: Biome (lint + format)
- **包管理**: Bun workspaces (`workspaces: ["packages/*"]`)
- **Web 前端**: Hono (后端) + React + TanStack Router + TanStack Query + Tailwind CSS
- **Web 流式响应**: ndjson（`fetch` + `ReadableStreamReader`），search 路由实时推送 Agent 执行步骤
- **Web 项目切换**: TanStack Query 查询键包含项目名（`['documents', project, page]`），切换项目自动刷新数据；API 通过 `X-Vein-Project` 头 + `?project=` 查询参数双通道传递项目标识
- **Markdown 渲染**: `react-markdown` + `remark-gfm`，风格统一使用 Kami Design Tokens

## 核心数据模型

```
library (逻辑概念，无实体表，对应 nodes 子树)
  └── docs (文档)
        ├── nodes (文档内节点，树形结构)
        └── docs_fts (FTS5 unicode61，索引各节点摘要合并后的分词文本)
```

### 实体关系

```
nodes ──(tree_closure)──→ nodes (树形层级)
  │
  └──(doc_id)──→ docs ── docs_fts (FTS5 unicode61)
```

### 表说明

| 表 | 用途 |
|---|---|
| `nodes` + `tree_closure` | 树形层级（文档内节点），闭包表存储祖先-后代关系 |
| `docs` | 文档实体 |
| `model_cache` | 模型响应缓存（`(md5, model)` 有复合唯一约束，命中时 hit_count + 1） |
| `docs_fts` | **FTS5 虚拟表（unicode61 tokenizer）**，索引文档所有节点的 summary/prefixSummary 合并文本，写入时经 `segmentText()` 分词后用空格连接，查询时同样分词后搜索。**查询优先 AND，0 结果时回退 OR：LLM 分词与索引对齐时 AND 精确匹配，不对齐时 OR 兜底。BM25 排序，k=10。FTS5 不支持 `INSERT OR REPLACE` 按业务键去重，统一用 `DELETE` → `INSERT` 防止 doc_id 重复 |

## 目录结构

```
vein/
├── packages/
│   ├── core/                          # @vein/core
│   │   ├── src/
│   │   │   ├── ai/                    # AI 模型调用与 Agent 工具
│   │   │   │   ├── base.ts               # 模型调用基础设施（call 函数 + ToolDef 类型 + onToolCall 进度回调）
│   │   │   │   ├── librarian.ts          # 文档检索 Librarian Agent（主 Agent：搜索 + 委托子 Agent 分析 + 汇总 + 自检审查）
│   │   │   │   ├── reviewer.ts           # 检索结果审查 Agent（带工具验证 + onStep 进度回调）
│   │   │   │   ├── tools.ts              # 共享业务逻辑（searchDocsByKeyword）
│   │   │   │   └── index.ts              # 统一导出
│   │   │   ├── config/                # 配置（logger、项目配置读写、root override）
│   │   │   │   ├── index.ts              # 项目配置读写 + resolveProjectRoot / setProjectOverride + APP_NAME
│   │   │   │   └── type.ts               # ProjectConfig / ModelProvider 类型
│   │   │   ├── service/               # 业务逻辑层（与 CLI I/O 分离）
│   │   │   │   └── import.service.ts     # markdown 导入管道（并行 LLM + 串行 DB）
│   │   │   ├── store/                 # 数据库层
│   │   │   │   ├── schema.ts             # Drizzle schema 定义
│   │   │   │   ├── client.ts             # 数据库连接（better-sqlite3）
│   │   │   │   ├── index.ts              # 树形结构 CRUD + doc/FTS5 操作
│   │   │   │   ├── migrate.ts            # 迁移执行
│   │   │   │   └── migrations/           # SQL 迁移文件 + config.schema.json
│   │   │   ├── tree/                  # 树形数据结构与 Markdown 拆分
│   │   │   │   ├── type.ts               # TreeNode / BaseDocNode / DocNode 类型
│   │   │   │   └── markdown_split.ts     # markdown → 文档树 解析管道
│   │   │   ├── utils/                 # 通用工具（core 共享）
│   │   │   │   ├── common.ts             # uuid, md5, hash, getErrorMessage
│   │   │   │   └── segment.ts            # LLM 中文分词
│   │   │   └── index.ts               # 核心统一导出
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── drizzle.config.ts
│   ├── cli/                           # @vein/cli
│   │   ├── src/
│   │   │   ├── command/               # CLI 命令（每个命令独立文件，导出 register(program)）
│   │   │   │   ├── vein.ts                # 入口：Command 创建 + 各命令注册 + --project 全局选项
│   │   │   │   ├── command-utils.ts       # 共享工具：setupProjectModel、createCachedSummarizer
│   │   │   │   ├── new.command.ts         # vein new
│   │   │   │   ├── markdown.command.ts    # vein markdown
│   │   │   │   ├── ask.command.ts         # vein ask
│   │   │   │   ├── history.command.ts     # vein history
│   │   │   │   ├── config.command.ts      # vein config
│   │   │   │   ├── browse.command.ts      # vein browse
│   │   │   │   └── projects.command.ts    # vein projects
│   │   │   ├── config/
│   │   │   │   └── global.ts             # 全局项目注册表（~/.config/vein/projects.json）
│   │   │   └── utils/
│   │   │       └── cli-helpers.ts         # CLI 专用 helper（formatDuration, colorize, VERDICT_ICON 等）
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                           # @vein/web
│       ├── src/
│       │   ├── client/               # 前端（React + TanStack Router）
│       │   │   ├── components/          # 共享组件（Layout、Markdown、RunCat）
│       │   │   ├── lib/                 # API 客户端 + 项目上下文
│       │   │   ├── routes/              # 路由页面（ask、docs、history、settings）
│       │   │   ├── main.tsx             # 入口
│       │   │   ├── styles.css           # Kami Design Tokens
│       │   │   └── assets.d.ts          # 图片资源类型声明
│       │   ├── routes/               # 后端 Hono API 路由
│       │   │   ├── search.ts            # 流式 ndjson 搜索路由
│       │   │   ├── documents.ts         # 文档 CRUD
│       │   │   ├── history.ts           # 历史记录
│       │   │   ├── projects.ts          # 项目列表
│       │   │   └── models.ts            # 模型配置
│       │   ├── server.ts             # Hono 服务器入口
│       │   └── middleware/           # 中间件
│       │       └── project.ts           # 项目上下文注入
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── package.json                       # workspace 根
├── tsconfig.json                      # base tsconfig（各包 extend）
├── biome.json                         # 共享 lint/format 配置
└── .gitignore
```

### 包间依赖

```
@vein/cli (thin client)  ──→  @vein/core (业务层)
  │                               │
  │  commander                    │  @earendil-works/pi-ai
  │  @clack/prompts               │  @earendil-works/pi-agent-core
  │                               │  better-sqlite3
  │                               │  drizzle-orm
  │                               │  pino

@vein/web (thin client)  ──→  @vein/core (业务层)
  │                               │
  │  hono + react                 │  @earendil-works/pi-ai
  │  tanstack router              │  @earendil-works/pi-agent-core
  │                               │  better-sqlite3
  │                               │  drizzle-orm
  │                               │  pino
```

采用 **client-server 模式**：
- **Core** 作为"服务端"提供完整业务能力，通过 `@vein/core` **单一入口**导出高层函数
- **CLI** 作为 thin client，只做命令解析 + 交互式 I/O + 结果展示，**不直接访问 store / pi-ai / 文件系统**
- **Web** 作为 thin client，提供基于浏览器的文档检索界面，通过流式 API 实时展示 Agent 执行步骤

CLI 和 Web 全部从 `@vein/core` 导入（无子路径）：
```typescript
import {
    setupProjectModel, listProviders, listModels,
    importBatch, resegmentAllDocuments,
    searchDocuments,
    listDocuments, getDocumentDetail,
    saveSearchHistory, listSearchHistory, getSearchHistoryEntry,
    loadGlobalProjects, registerProject, unregisterProject, getProjectPath,
    createCachedSummarizer, resolveProjectRoot, setProjectOverride,
    logger, APP_NAME,
} from '@vein/core'
```

## 查询路径（Librarian 检索）

采用 **主 Agent + 子 Agent 委托** 架构，三层子 Agent：

| 层级 | Agent | 作用 |
|------|-------|------|
| 1 | SearchScreener | 关键词搜索 + snippet+大纲初筛，返回精简 docId 列表 |
| 2 | Document Analyzer | 逐文档深度分析原文 |
| 3 | Reviewer | 自检审查 |

### 主 Agent（Librarian）

| 步骤 | 工具 | 作用 |
|------|------|------|
| 1 | `searchDocuments(userQuery)` | 委托 SearchScreener 子 Agent 搜索+初筛，返回 [{docId, relevance, reason}] |
| 2 | `analyzeDocument(docId, userQuery)` | 委托 Document Analyzer 子 Agent 深度分析单篇文档 |
| 3 | `reviewResult` | 自检审查 |

- 步骤 1 的 SearchScreener 子 Agent 内部处理关键词提取、≤2 结果时换词重搜、snippet+大纲联合筛选，主 Agent 只看到精简后的列表
- 步骤 2 并发控制：通过 `Semaphore` 限制最多 10 个 Document Analyzer 同时运行
- 步骤 3 输出要求：按文档逐一列出，直接引用子 Agent 的「详细分析」内容
- 自检后若 verdict 为 partial/fail，会根据 suggestion 回溯重试（最多 2 次）

### SearchScreener 子 Agent

独立的 `Agent` 实例，≤6 步预算，使用 `searchDocsByKeyword` 工具（返回结果已嵌入紧凑大纲 `outline` 字段）：

| 工具 | 返回 |
|------|------|
| `searchDocsByKeyword(query)` | [{docId, snippet, rank, outline}] — outline 为 compactDocText 产物（仅标题骨架，无摘要） |

### Document Analyzer 子 Agent

独立的 `Agent` 实例，拥有自己的工具集和 ≤10 步预算（`beforeToolCall` 强制约束）：

| 工具 | 作用 |
|------|------|
| `getDocStructure(docId)` | 获取文档树结构（title + summary/prefixSummary） |
| `getDocNodeDetails(docId, nodeId)` | 获取节点完整原文 |

子 Agent 输出 Markdown 格式（`## 相关性` / `## 概述` / `## 关键发现` / `## 数据来源` / `## 详细分析`），主 Agent 直接读取并汇总。

### 数据流

```
User Query
  │
  ▼
Main Librarian Agent
  ├─ searchDocuments(userQuery)       → spawns SearchScreener subagent ─┐
  │                                                │                     │
  │                                                ▼                     │
  │                                    SearchScreener Subagent
  │                                    └─ searchDocsByKeyword(query)
  │                                          returns [{docId, snippet, outline}]
  │                                                │                     │
  │                                                └──────────────────────┘
  │                                          returns [{docId, relevance, reason}]
  ├─ analyzeDocument(docId, userQuery)  → spawns Doc Analyzer (max 10)  ─┐
  │                                                │                     │
  │                                    Document Analyzer Subagent         │
  │                                    ├─ getDocStructure(docId)          │
  │                                    └─ getDocNodeDetails(docId, nodeId)│
  │                                                │                     │
  │                                                └──────────────────────┘
  │                                          returns Markdown analysis
  └─ reviewResult(query, finalAnswer, sources)
```

Librarian 返回结构化 `LibrarianResult`：
```typescript
{ content: string, trace: TraceStep[], review?: ReviewResult }
```

Reviewer 是独立的评估 Agent，评估维度：相关性、完整性、准确性。通过 `getReviewSource` 工具逐条验证数据源原文，支持 `onStep` 回调透传审查进度。

## 项目配置

所有配置均为项目级别，存放在 `.vein/config.json`。初始化时自动生成 `.vein/config.schema.json` 提供编辑器补全。`.vein/ask-history/` 存放每次 `ask` 的查询结果（JSON 文件）。

```json
{
    "$schema": "./config.schema.json",
    "name": "my-project",
    "db": ".vein/data.db",
    "model": {
        "provider": "deepseek",
        "model": "deepseek-v4-pro"
    },
    "summarizer": {
        "provider": "openai",
        "model": "gpt-4o-mini"
    },
    "segmenter": {
        "provider": "openai",
        "model": "gpt-4o-mini"
    },
    "subagent": {
        "provider": "openai",
        "model": "gpt-4o-mini"
    },
    "reviewer": {
        "provider": "deepseek",
        "model": "deepseek-v4-pro"
    },
    "searchAgent": {
        "provider": "openai",
        "model": "gpt-4o-mini"
    }
}
```

| 字段 | 说明 |
|---|---|
| `$schema` | JSON Schema 引用，用于编辑器自动补全和校验 |
| `name` | 项目名称 |
| `db` | SQLite 数据库文件路径 |
| `model.provider` | AI provider，如 `deepseek`、`openai` |
| `model.model` | 模型名称，如 `deepseek-v4-pro`、`gpt-4o-mini` |
| `summarizer.provider` | 文档摘要专用 AI provider（可选，未配置时回退到 `model`） |
| `summarizer.model` | 摘要专用模型名称 |
| `segmenter.provider` | 中文分词专用 AI provider（可选，未配置时回退到 `model`） |
| `segmenter.model` | 分词专用模型名称 |
| `subagent.provider` | Document Analyzer 子 Agent 专用模型（可选，回退到 `model`） |
| `subagent.model` | 分析子 Agent 模型名称 |
| `reviewer.provider` | Reviewer 审查专用模型（可选，回退到 `model`） |
| `reviewer.model` | 审查模型名称 |
| `searchAgent.provider` | SearchScreener 搜索筛选专用模型（可选，回退到 `model`） |
| `searchAgent.model` | 搜索筛选模型名称 |

## 全局项目注册表

`vein new` 初始化项目时自动将项目名和绝对路径写入 `~/.config/vein/projects.json`。之后可在任意目录通过 `vein -p <name> <command>` 直接操作该项目，无需 cd 到项目目录。

```json
// ~/.config/vein/projects.json
{
  "projects": {
    "my-docs": "/Users/alice/my-docs",
    "work-notes": "/Users/alice/work/notes"
  }
}
```

**项目根目录解析优先级**：
1. 如果传了 `-p/--project`，从全局注册表查找路径 → 设置 `_projectOverridePath`
2. 如果没传 `-p`，从当前工作目录向上查找 `.vein` 目录（原有逻辑）

`resolveProjectRoot()` 封装了上述逻辑，所有需要定位项目的地方（DB 连接、配置加载、历史保存等）统一使用该函数。`setProjectOverride(path)` 由 `vein.ts` 的 `preAction` hook 调用。

**相关文件**：
- `packages/core/src/config/global.ts` — 全局注册表 CRUD（`registerProject`、`unregisterProject`、`getProjectPath`、`loadGlobalProjects`）
- `packages/core/src/config/index.ts` — `resolveProjectRoot()`、`setProjectOverride()`、`APP_NAME`、logger、`setupProjectModel()`
- `packages/core/src/store/client.ts` — `resolveDbPath()` 使用 `resolveProjectRoot()` 而非直接的 `getProjectRoot(cwd)`
- `packages/cli/src/command/vein.ts` — `-p/--project` 全局选项 + `preAction` hook 解析并设置 override（导入 `getProjectPath`、`setProjectOverride` 从 `@vein/core`）
- 使用 `await vein.parseAsync()` 确保异步 hook 在 action 之前完成

`vein projects` (别名 `pr`) 可查看所有已注册项目，`--remove <name>` 删除注册。

## 命令

```
vein [options] [command]
    -p, --project <name>  指定目标项目（从全局注册表查找路径）。
                          可选，不传时回退到 cwd 目录上探。

vein new [name] [--migrate]
    初始化项目。name 可选（不传时交互输入，默认取当前目录名）。
    --migrate 对已有项目重新执行迁移。
    交互步骤：项目名 → AI provider → 模型
    初始化成功后自动注册到全局项目表（~/.config/vein/projects.json）。

vein markdown <files...> [-f | --force]
    导入 markdown 文件为文档树（含 AI 摘要 + 中文分词索引）。
    支持批量：vein markdown docs/*.md
    同一文件（按内容 MD5）默认跳过。
    -f 强制重新导入。

vein markdown resegment
    对所有文档重新分词并更新 docs_fts 索引。
    通过 summaryHash 检测摘要是否变化，无变化则跳过。
    逻辑与导入一致：收集所有节点 summary → segmentText → updateDocsFts。
    别名 rs。

vein ask [query] [-n | --no-interactive] [-t | --trace]
    检索文档库。通过分词关键词搜索文档内容。
    -n 输出 JSON（供脚本使用，含 elapsedMs 耗时字段）。
    -t 展示检索步骤追踪（含 docId/nodeId 和内容摘要，不含完整文本）。
    每次查询结果自动保存到 .vein/ask-history/。

vein history [-l | --last] [-L | --list] [-p <n>]
    回顾历史问答记录。无参数时交互式选择会话查看详情（循环选择，Esc 退出）。
    -l 查看最近一次。-L 非交互列表模式。-p 指定分页（每页 20 条）。
    别名 hs。

vein browse
    交互式浏览文档库，分页列出所有文档（20/页），可查看详情。
    别名 br。

vein projects [--remove <name>]
    列出全局注册的所有 vein 项目（名称、路径、是否存在）。
    --remove <name> 从注册表中删除指定项目。
    别名 pr。

vein config
    交互式查看和修改项目配置（model / summarizer / segmenter / subagent / reviewer / searchAgent）。
    循环菜单选择要修改的字段，每次改动即时保存到 .vein/config.json。
```

## 批量导入管道

`vein markdown <files...>` 分两阶段处理，核心逻辑在 `packages/core/src/service/import.service.ts` 的 `importBatch()` 函数中：

**Phase 1 — 并行 LLM（`IMPORT_PARALLEL = 4` 文件并发）：**
```
readFile → mdToTree (解析 + LLM 摘要) → segmentText (LLM 分词)
```
- `Promise.all` 并发，最耗时的 LLM 调用并行处理
- 所有 LLM 结果自动走 `model_cache` 缓存（summarizer、segmentText）

**Phase 2 — 串行 DB（WAL 模式）：**
```
insertTree → insertDoc (含 docs_fts)
```
- SQLite WAL 模式优化写入性能，写事务不阻塞

**缓存层级：**

| 缓存 | key | 模型 | 场景 |
|------|-----|------|------|
| summarizer | md5(prompt) | summarizer/config.model | 相同节点摘要命中 |
| segmentText | md5(systemPrompt + text) | config.model | 相同文本分词命中 |

## 开发约定

### 架构

- **Monorepo + Client-Server**：Core 作为"服务端"提供完整业务能力（`@vein/core` 单一入口），CLI 作为 thin client 只做命令解析 + 交互 I/O + 结果展示。后续 web 模块可直接复用 core。
- **命令组织**：每个命令独立文件（`packages/cli/src/command/xxx.command.ts`），导出 `register(program: Command)` 函数；入口 `vein.ts` 负责创建 Command、注册子命令、全局 `--project` 选项和 `preAction` hook
- **CLI/Business 分离**：命令文件只处理 CLI I/O（spinner、prompt、outro），所有业务逻辑通过 `@vein/core` 的高层函数调用。CLI **不直接访问 store、不直调 pi-ai、不自行管理文件**
- **项目定位**：始终使用 `resolveProjectRoot()`（from `@vein/core`），以正确支持 `--project` 全局选项
- **构建**：入口为 CLI 包的 `src/command/vein.ts`。`bun build src/command/vein.ts --target node --external better-sqlite3 -outdir ./dist`
- **构建产物**：`packages/cli/dist/vein.js`
- **全局 link**：`bun run link`（根目录）或 `cd packages/cli && bun link`
- **导出**：core 包通过 `packages/core/src/index.ts` 统一导出，`package.json` 的 `"exports"` 仅包含 `"."`

### 数据库

- 迁移 SQL 内联在 `packages/core/src/store/migrations/sql.ts`，按数组顺序执行
- 迁移全部使用 `IF NOT EXISTS`，保证幂等
- `_migrations` 表追踪已执行的迁移名和时间戳，`runMigrations` 启动时先查表跳过已执行条目
- `docs_fts` 在迁移中创建，使用 unicode61 tokenizer
- SQLite 使用 WAL 模式（`PRAGMA journal_mode=WAL`），在 `client.ts` 和 `migrate.ts` 中连接时统一设置
- SQL 不写在命令模块中，统一封装在 store 层

### 数据一致性

- `model_cache` 有 `(md5, model)` 复合唯一约束；`setCachedResponse` 使用 `ON CONFLICT DO UPDATE` 原子 upsert
- `insertDoc` 和 `deleteDoc` 包裹在 `BEGIN/COMMIT` 事务中，docs + docs_fts 原子操作
- `insertTree` 和 `deleteTree` 同样包裹在事务中
- FTS5 虚拟表不支持按业务键 `INSERT OR REPLACE`，统一用 `DELETE` → `INSERT` 防止 doc_id 重复

### AI 调用

- Agent 工具遵循 `base.ts` 的 `ToolDef` 模式
- Agent 职责分离：
  - **librarian（主 Agent）**：搜索 + 委托子 Agent 分析 + 汇总结果 + 自检，使用 `pi-agent-core` 的 `Agent` 类。Prompt 已优化：结果少时自动换词重搜、一次性批量子 Agent 调用、审查前自查覆盖度
  - **Document Analyzer（子 Agent）**：独立的 `Agent` 实例，逐文档深度分析，通过 `analyzeDocument` tool 被主 Agent 调用。≤10 步预算（`beforeToolCall` hook 强制约束），输出 Markdown 格式
  - **reviewer（审查 Agent）**：独立的评估 Agent，使用 `call` 函数 + `getReviewSource` 工具，逐个验证数据源原文，支持 `onStep` 回调透传审查进度
- 子 Agent 并发控制：通过 `Semaphore(10)` 限制最多 10 个子 Agent 同时运行，超出排队。Prompt 已优化为一次性批量调用所有 analyzeDocument，避免分批 LLM 往返
- 工具调用并行化：`base.ts` 的 `call()` 中 LLM 返回的多个 tool call（如 `getReviewSource`）通过 `Promise.all` 并行执行，消除串行等待
- 子 Agent 进度同步：子 Agent 内部 tool 调用通过 `onStep` 回调透传到主 Agent 的 spinner 显示（如 `  Loading document structure...`）
- reviewer 进度同步：reviewer 内部 `getReviewSource` 调用通过 `onStep` 回调透传，如 `Verifying: doc1/0001...`、`Review: pass (5/5)`
- 模型配置灵活定制：主模型、摘要、分词、文档分析子 Agent、搜索筛选子 Agent、审查 6 个场景可独立指定模型，未配置时回退到主模型
- 中文分词：`segmentText()` 通过 LLM 调用实现，写入 FTS 前分词。长文本（>3000 字符）自动按行切分为多个 chunk 独立分词
- Librarian 检索进度：执行中显示通用提示，完成后自动更新为具体结果。子 Agent 输出结果的 spinner 显示格式为 `Analysis: high · 1.2KB`

### 数据库连接

使用 `better-sqlite3` 原生模块，按项目路径缓存连接（`Map<dbPath, connection>`）：

```typescript
import Database from 'better-sqlite3'

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

- `better-sqlite3` 为原生 C++ 模块，需要 `node-gyp` 编译。安装时自动预编译，若 Node 版本不匹配需 `npm rebuild better-sqlite3`
- **构建时**：`bun build` 必须加 `--external better-sqlite3`，否则打包后模块内部的路径解析会指向 `dist/` 目录，导致找不到 `better_sqlite3.node` 绑定文件
- `getRawClient()` 返回兼容包装器（`{ execute(sql | { sql, args }) → { rows } }`）。`getNativeDb()` 返回原始 `Database` 实例
- **多项目支持**：DB 连接按 `dbPath` 缓存（`_instances` Map），每个项目独立持有连接。Web 端切换项目时自动获取对应项目的 DB 连接，互不干扰
- Bun 开发模式下可直接 `bun run packages/cli/src/command/vein.ts`（Bun 兼容 better-sqlite3 的 API），无需经过构建步骤

### 代码风格

- **格式化**: Biome, 4 空格缩进, 80 字符行宽, 单引号, 无分号, 尾逗号(ES5), 箭头函数参数必加括号
- **Lint**: Biome, 推荐规则 + 严格 correctness/suspicious 规则, 启用 organizeImports。`routeTree.gen.ts` 和 `server.ts` 通过 `overrides` 关闭 `noExplicitAny` 规则
- **TypeScript**: ESNext target, strict 模式, `verbatimModuleSyntax`（type 导入需显式 `import type`）
- **命名**: 文件 kebab-case, 函数 camelCase, 类型 PascalCase
- **日志**: 使用 `logger.child({ module: 'xxx' })` 创建模块级 logger。子 Agent 使用独立模块 `doc-analyzer`（`subLog`）
- **日志输出**: 仅写文件 `~/.config/vein/logs/vein-YYYY-MM-DD.log`（JSON 每行一条），不输出到控制台（避免干扰 CLI spinner/交互）。logger 在 `packages/core/src/config/index.ts` 中通过 pino 创建，`sync: true` 保证崩溃不丢数据。用 `tail -f ~/.config/vein/logs/vein-$(date +%Y-%m-%d).log` 实时追踪。
- **日志级别**:
  - `log.info` 仅记录关键流程节点：Agent 工具调用开始/结束、检索会话开始/完成、批量导入开始/完成、迁移、项目注册/注销、错误恢复
  - `log.debug` 记录内部细节：缓存命中/未命中、分词流水线步骤、LLM 消息收发、DB 查询细节
  - `log.warn` 记录需关注但非致命的操作（如强制覆盖、降级行为）
  - `log.error` 记录异常（传入 `err` 字段，含 stack trace）
- **日志内容约束**: 禁止在日志中打印完整 LLM prompt/messages/response 或大型数据结构（如完整文档树）。Agent 工具结果仅记录摘要（resultSummary + resultLen），不记录完整 result 字段。`args` 字段不在日志中输出（改用 `detail` 可读摘要）。
- **日志格式**: 结构化对象 `log.info({ docId, key: value, content: '描述' })`，`content` 字段用英文描述操作，避免在 msg 中拼接变量
- **检索追踪字段**: ask 会话使用 `sessionId`（`crypto.randomUUID().slice(0, 8)`）关联同一次查询的所有日志。Librarian 工具调用使用 `detail`（可读上下文摘要）+ `elapsedMs`（执行耗时）辅助追踪。
- **导出**: 统一起名导出（避免 default export）
- **禁止**: 不得创建测试用空文件、临时文件（如 `nul`、`test.js`、`temp.md` 等）。测试逻辑写在 `__tests__/` 或使用 `bun test`，临时输出写入系统临时目录
- **运行时**: 
  - CLI 开发：`bun run packages/cli/src/command/vein.ts`
  - CLI 生产：`node packages/cli/dist/vein.js`
  - Web 开发：`bun run packages/web/src/server.ts`（`bun run dev` 或 `bun run dev:frontend`）
  - Web 生产：`bun run build`（`packages/web`，产出 `dist/client` + `dist/server.js`）
  - Web 导航：侧边栏使用 TanStack Router `<Link>` 组件（非 `<a>`），切换页面为客户端局部刷新，不触发整页重载
  - 全局 link：`bun run link`（构建 + link），`bun run unlink`（取消）
  - 构建：`bun run build`（从根目录，委托到 `packages/cli` 和 `packages/web`）
  - 类型检查：`bun run check`（根目录 `tsc --noEmit`）
  - Lint：`bun run lint`
  - 格式化：`bun run format`
