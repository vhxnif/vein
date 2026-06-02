# AGENTS

## 项目概述

Vein 是一个基于 AI Agent 的文档管理与智能检索系统。核心理念是模拟人类在图书馆中查找资料的过程：先锁定分类区域（categories），再浏览标签卡片（tags），最后定位到具体文档（docs）。

## 技术栈

- **运行时**: Bun
- **数据库**: SQLite (bun:sqlite, WAL 模式), ORM 用 Drizzle (`drizzle-orm/bun-sqlite`)
- **全文搜索**: FTS5 (BM25 排序)，作为向量查询的补充和兜底
- **向量搜索**: sqlite-vec (vec0 虚拟表, 通过 Homebrew SQLite 加载，macOS 上 Bun 内置 SQLite 不支持扩展)
- **中文分词**: LLM 切词 + FTS5 空格分词（写入侧），trigram（标签侧）
- **AI 模型**: 通过 @earendil-works/pi-ai 调用，可在 .vein/config.json 中配置
- **Embedding**: OpenRouter embeddings API (`POST /api/v1/embeddings`)
- **批量导入**: 两阶段并行：LLM 阶段 4 文件并发（Promise.all），DB 阶段串行（WAL 模式优化写入）
- **代码风格**: Biome (lint + format)

## 核心数据模型

```
library (逻辑概念，无实体表，对应 nodes 子树)
  └── categories (分类)
        └── tags (标签，通过 categorie_tags 关联)
              ├── docs (文档，通过 doc_tags 关联)
              │     ├── nodes (文档内节点，树形结构)
              │     └── docs_fts (FTS5，索引文档摘要，LLM 分词后空格分隔)
              └── tag_embeddings (vec0 虚拟表，向量搜索)
              │   tags_fts (FTS5 trigram，索引标签名)
```

### 实体关系

```
nodes ──(tree_closure)──→ nodes (树形层级)
  │
  └──(doc_id)──→ docs ──(doc_tags)──→ tags ──(categorie_tags)──→ categories
                      │                    │
                      ├── docs_fts (FTS5)  └── tags_fts (FTS5)
                      │                    └── tag_embeddings (vec0)
```

### 表说明

| 表 | 用途 |
|---|---|
| `nodes` + `tree_closure` | 树形层级（文档内节点），闭包表存储祖先-后代关系 |
| `docs` | 文档实体 |
| `tags` | 标签（tag name 经 NFC 规范化 + 全角转半角 + ASCII 小写后存储） |
| `doc_tags` | 文档-标签多对多 |
| `categories` | 宏观分类（仿图书馆分类法） |
| `categorie_tags` | 分类-标签多对多 |
| `model_cache` | 模型响应缓存（按输入 MD5 + 模型名索引，含命中次数） |
| `docs_fts` | **FTS5 虚拟表**，索引文档根摘要（rootSummary），写入时经 LLM 分词后用空格连接，查询时同样分词后搜索。支持 BM25 排序 |
| `tags_fts` | **FTS5 虚拟表（trigram tokenizer）**，索引标签名，查询时用原生中文 n-gram 匹配。作为 vec0 向量搜索的并行兜底 |
| `tag_embeddings` | **vec0 虚拟表**，存储标签的向量 embedding，支持 KNN 语义搜索。首次 `upsertTagEmbedding` 时懒创建，维度自动匹配当前 embedding 模型 |

### 预设分类体系

12 个宏观分类，仿真实图书馆分类法设计，见 `src/store/migrations/sql.ts` 中的 seed 条目。

## 目录结构

```
src/
├── ai/           # AI 模型调用与 Agent 工具
│   ├── base.ts       # 模型调用基础设施（call 函数 + ToolDef 类型 + onToolCall 进度回调）
│   ├── embedding.ts  # Embedding 生成（OpenRouter API）
│   ├── librarian.ts  # 文档检索 Librarian Agent（渐进式查找 + 自检审查，三条检索链路）
│   ├── reviewer.ts   # 检索结果审查 Agent（无工具纯评估）
│   ├── tagger.ts     # 标签提取与分类 Agent（支持 tool-calling 模式的向量搜索）
│   ├── tools.ts      # Agent 工具工厂（searchSimilarTags、searchDocsByKeyword）
│   └── index.ts      # 统一导出
├── command/      # CLI 命令（每个命令独立文件，导出 register(program)）
│   ├── vein.ts           # 入口：Command 创建 + 各命令注册 + --project 全局选项
│   ├── command-utils.ts  # 共享工具：setupProjectModel、createCachedSummarizer
│   ├── new.command.ts    # vein new（项目初始化，自动注册到全局）
│   ├── markdown.command.ts # vein markdown（markdown 导入，调用 service 层）
│   ├── ask.command.ts    # vein ask（文档检索）
│   ├── history.command.ts # vein history（历史回顾，含 formatHistoryDetail）
│   ├── tags.command.ts   # vein tags（标签管理）
│   ├── config.command.ts # vein config（交互式配置修改）
│   ├── browse.command.ts # vein browse（按 doc/category/tag 维度浏览）
│   └── projects.command.ts # vein projects（全局项目注册表管理）
├── config/       # 配置（logger、项目初始化、全局项目注册表、root override）
│   ├── index.ts      # 项目配置读写 + resolveProjectRoot / setProjectOverride
│   ├── global.ts     # 全局项目注册表（~/.config/vein/projects.json）
│   └── type.ts       # ProjectConfig / ModelProvider 类型
├── service/      # 业务逻辑层（与 CLI I/O 分离）
│   └── import.service.ts # markdown 导入管道（Phase 1 并行 LLM + Phase 2 串行 DB）
├── store/        # 数据库层
│   ├── schema.ts     # Drizzle schema 定义
│   ├── client.ts     # 数据库连接（bun:sqlite + 自动检测 Homebrew SQLite + sqlite-vec）
│   ├── index.ts      # 树形结构 CRUD + doc/tag/category/embedding/FTS5 操作
│   ├── migrate.ts    # 迁移执行
│   └── migrations/   # SQL 迁移文件 + config.schema.json
├── tree/         # 树形数据结构与 Markdown 拆分
└── utils/        # 通用工具
    ├── cli-helpers.ts # CLI 公共 helper：pluralize、formatDuration、colorize、VERDICT_ICON 等
    ├── common.ts     # uuid, md5
    └── segment.ts    # LLM 中文分词（将中文切词后用空格连接，适配 FTS5 unicode61 tokenizer）
```

## Tagger：标签提取与向量去重

Tagger 负责从文档摘要中提取标签并归类。**核心优化**：三管齐下防止 tag 膨胀。

### 写入侧防御

| 策略 | 实现位置 | 说明 |
|------|----------|------|
| **A1 归一化** | `store/index.ts → normalizeTag()` | NFC 规范化 + trim + 全角转半角 + ASCII 小写，在 `upsertTag` 入库前统一 |
| **A2 首选词汇表** | `tagger.ts → buildPrompt()` | 每个分类注入已有 tag（按使用次数降序 top 20），prompt 引导 LLM 优先复用 |
| **A3 软限制** | prompt | 每分类最多 5 个 tag（LLM 自我约束，不做硬截断，不丢召回） |

### 向量搜索工具

当 `.vein/config.json` 中配置了 `embedding` 时，Tagger 启用 **tool-calling 模式**：

1. LLM 在生成 tag 前调用 `searchSimilarTags(name, categoryId)` 工具
2. 工具并行执行两路查询：
   - **vec0 向量搜索**：生成 query tag 的 embedding（OpenRouter API）→ 查询 `tag_embeddings` vec0 表
   - **FTS5 关键词搜索**：用 trigram n-gram 匹配 `tags_fts` 表
3. 两路结果合并去重（按 tagId），取最高相似度，降序返回
4. LLM 判断是否复用已有 tag

未配置 `embedding` 时退化为纯 prompt 模式（仅 A1+A2）。

### Embedding 持久化

`extractAndSaveTags` 在 upsert 新 tag 后，异步生成并存储其 embedding（fire-and-forget）。已有 tag 可通过 `vein tags backfill-embeddings` 回填。

### 缓存策略

- Tagger 结果写入 `model_cache`，key = `md5(prompt + summary + tools标记)`
- **仅缓存有效结果**（`categories.length > 0`），空结果不污染缓存
- 读取时校验有效性，无效缓存走 re-tag

## 查询路径（Librarian 渐进式检索）

Librarian Agent 按以下三条链路检索，按优先级回退：

### 链路优先级

```
有 embedding → 链路 2（语义标签）→ 链路 3（关键词）→ 链路 1（分类浏览）
无 embedding → 链路 3（关键词）→ 链路 1（分类浏览）
```

### 链路 1：分类渐进式查找

```
categories → tags → docs → tree (结构+摘要) → node (全文) → review (自检)
```

| 步骤 | 工具 | 作用 |
|------|------|------|
| 1 | `getCategories` | 列出所有分类 |
| 2 | `getTagsByCategory` | 查看分类下的标签 |
| 3 | `getDocsByTag` | 查找标签关联的文档 |
| 4 | `getDocStructure` | 获取文档树结构（title + summary/prefixSummary） |
| 5 | `getDocNodeDetails` | 获取节点完整文本 |
| 6 | `reviewResult` | 自检：审查检索结果是否满足用户需求 |

### 链路 2：语义标签直搜（有 embedding 时优先）

```
query → searchSimilarTags → docs → tree → node
```

1. `searchSimilarTags`：融合 vec0 向量相似度 + FTS5 关键词匹配，返回 [{tagId, tag, similarity}]
2. 选择相似度最高的 3-5 个标签，调用 `getDocsByTag`
3. 之后同链路 1 步骤 4-5

### 链路 3：分词关键词直搜（无 embedding 时优先）

```
query → searchDocsByKeyword → getDocStructure → getDocNodeDetails
```

1. `searchDocsByKeyword`：将查询经 LLM 分词后在 `docs_fts` 中搜索文档摘要，返回 [{docId, metadata, rank}]
2. 选择 rank 最高的 3-5 个文档，调用 `getDocStructure`
3. 之后同链路 1 步骤 5

> 此路径直达文档，跳过分类和标签中间层，适合关键词明确的查询。

自检后若 verdict 为 partial/fail，会根据 suggestion 回溯重试（最多 2 次）。

Librarian 返回结构化 `LibrarianResult`：
```typescript
{ content: string, trace: TraceStep[], review?: ReviewResult }
```

Reviewer 是独立的纯评估 Agent，评估维度：相关性、完整性、准确性。

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
    "embedding": {
        "provider": "openrouter",
        "model": "openai/text-embedding-3-small"
    },
    "sqliteLibPath": "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib"
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
| `summarizer.model` | 摘要专用模型名称（可选，未配置时回退到 `model`） |
| `segmenter.provider` | 中文分词专用 AI provider（可选，未配置时回退到 `model`） |
| `segmenter.model` | 分词专用模型名称（可选，未配置时回退到 `model`） |
| `embedding.provider` | Embedding provider（可选，目前仅 `openrouter`） |
| `embedding.model` | Embedding 模型 ID，如 `openai/text-embedding-3-small`、`nvidia/llama-nemotron-embed-vl-1b-v2:free` |
| `sqliteLibPath` | 自定义 SQLite 库路径（可选，用于加载 sqlite-vec。建议通过环境变量 `VEIN_SQLITE_LIB_PATH` 设置，Homebrew 路径会自动探测） |

> **切换 embedding 模型**：不同模型输出不同维度（OpenAI 1536、NVIDIA 2048、Google 768）。切换前需先 `vein tags clear-embeddings` 删除旧 vec0 表，再 `vein tags backfill-embeddings` 用新模型重建。

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
- `src/config/global.ts` — 全局注册表 CRUD（`registerProject`、`unregisterProject`、`getProjectPath`、`loadGlobalProjects`）
- `src/config/index.ts` — `resolveProjectRoot()`、`setProjectOverride()`、`_projectOverridePath`
- `src/store/client.ts` — `resolveDbPath()` 使用 `resolveProjectRoot()` 而非直接的 `getProjectRoot(cwd)`
- `src/command/vein.ts` — `-p/--project` 全局选项 + `preAction` hook 解析并设置 override
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
    交互步骤：项目名 → AI provider → 模型 → embedding 配置（可选）
    初始化成功后自动注册到全局项目表（~/.config/vein/projects.json）。

vein markdown <files...> [-f | --force]
    导入 markdown 文件为文档树（含 AI 摘要 + 标签提取）。
    支持批量：vein markdown docs/*.md
    同一文件（按内容 MD5）默认跳过。
    -f 强制重新导入。

vein ask [query] [-n | --no-interactive] [-t | --trace]
    检索文档库。默认交互输入 query。
    传入 query 参数时直接使用，不重复收集。
    -n 输出 JSON（供脚本使用，含 elapsedMs 耗时字段）。
    -t 展示检索步骤追踪（含 docId/nodeId 和内容摘要，不含完整文本）。
    每次查询结果自动保存到 .vein/ask-history/。

vein history [-l | --last] [-L | --list] [-p <n>]
    回顾历史问答记录。无参数时交互式选择会话查看详情（循环选择，Esc 退出）。
    -l 查看最近一次。-L 非交互列表模式。-p 指定分页（每页 20 条）。
    别名 hs。

vein browse
    交互式浏览文档库，支持三个维度：
      Documents — 分页列出所有文档（20/页），可查看详情和标签
      Categories — 列出分类 → 查看下辖标签（含文档数）→ 查看文档
      Tags — 分页列出所有标签（含文档数）→ 查看关联分类和文档
    别名 br。

vein projects [--remove <name>]
    列出全局注册的所有 vein 项目（名称、路径、是否存在）。
    --remove <name> 从注册表中删除指定项目。
    别名 pr。

vein tags backfill-embeddings
    为所有缺少 embedding 的 tag 生成向量并写入 tag_embeddings。
    首次使用 embedding 功能或切换模型后运行。

vein tags clear-embeddings
    删除 tag_embeddings vec0 表。
    切换 embedding 模型前必须执行，否则维度不匹配。

vein config
    交互式查看和修改项目配置（model / summarizer / segmenter / embedding / sqliteLibPath）。
    循环菜单选择要修改的字段，每次改动即时保存到 .vein/config.json。
```

## 批量导入管道

`vein markdown <files...>` 分两阶段处理，核心逻辑在 `src/service/import.service.ts` 的 `importBatch()` 函数中：

**Phase 1 — 并行 LLM（`IMPORT_PARALLEL = 4` 文件并发）：**
```
readFile → mdToTree (解析 + LLM 摘要) → segmentText (LLM 分词)
```
- `Promise.all` 并发，最耗时的 LLM 调用并行处理
- 所有 LLM 结果自动走 `model_cache` 缓存（summarizer、segmentText、tagger）

**Phase 2 — 串行 DB（WAL 模式）：**
```
insertTree → insertDoc (含 docs_fts) → tagger (并行 LLM, TAG_PARALLEL = 4) → saveTagResult (串行)
```
- SQLite WAL 模式优化写入性能，写事务不阻塞
- Tag 阶段 LLM 调用仍可并行（`TAG_PARALLEL = 4`），但 DB 写入必须串行
- 单文件模式同样走 `importBatch()`，输出详细的 per-phase spinner 进度

**缓存层级：**

| 缓存 | key | 模型 | 场景 |
|------|-----|------|------|
| summarizer | md5(prompt) | summarizer/config.model | 相同节点摘要命中 |
| segmentText | md5(systemPrompt + text) | config.model | 相同文本分词命中 |
| tagger | md5(systemPrompt + summary + toolsSuffix) | config.model | 相同摘要标签命中 |

## 开发约定

- **命令组织**：每个命令独立文件（`src/command/xxx.command.ts`），导出 `register(program: Command)` 函数；入口 `vein.ts` 负责创建 Command、注册子命令、全局 `--project` 选项和 `preAction` hook
- **CLI/Business 分离**：命令文件只处理 CLI I/O（spinner、prompt、outro），核心业务逻辑放 `src/service/`
- **共享工具**：`command-utils.ts` 中 `setupProjectModel`（使用 `resolveProjectRoot`）和 `createCachedSummarizer` 供所有命令复用
- **项目定位**：始终使用 `resolveProjectRoot()` 而非直接 `getProjectRoot(process.cwd())`，以正确支持 `--project` 全局选项
- **构建**：单一入口 `bun build ./src/command/vein.ts`，所有子命令通过 import 被卷入一个 `vein.js`（非 glob 多入口，避免共享代码重复打包）
- 迁移 SQL 内联在 `src/store/migrations/sql.ts`，按数组顺序执行，无外部 .sql 文件
- 迁移全部使用 `IF NOT EXISTS` / `INSERT OR IGNORE`，保证幂等，新增表后执行 `vein new --migrate` 即可
- 迁移命名以版本号为前缀（如 `v0.1.0_create_fts_tables`），后续版本新增迁移只需追加条目
- `tag_embeddings` vec0 表不在迁移中创建，由 `upsertTagEmbedding` 首次调用时懒创建（自动匹配维度）
- `docs_fts` 和 `tags_fts` FTS5 表在 `v0.1.0_create_fts_tables` 迁移中创建
- 种子数据放独立迁移条目（如 `v0.1.0_seed_categories`）
- AI Agent 工具遵循 `base.ts` 的 `ToolDef` 模式
- summarizer 调用自动走 `model_cache` 缓存，按 prompt MD5 + 模型名去重，命中时 hit_count + 1
- 每次 summarizer 调用有 60s 超时，超时后抛出错误并记录日志
- 不同 Agent 职责分离：tagger 只做标签提取和分类，librarian 只做渐进式文档检索，reviewer 只做结果审查
- Librarian 检索时展示实时进度（spinner 文字随步骤变化：Searching documents by keyword... → Browsing categories... → Checking tags... → ...）
- `searchSimilarTags` 融合 vec0 向量搜索 + FTS5 关键词搜索（tags_fts trigram），并行执行后合并去重
- Tagger 的 `searchSimilarTags` 工具在 vec0 表不存在时优雅降级（仅 FTS5），不抛错
- `getTagsWithoutEmbeddings` 在 vec0 表不存在时 fallback 为返回全部 tag
- 中文分词：`segmentText()` 通过 LLM 调用实现，文档摘要写入前分词，标签名不额外分词（tags_fts 用 trigram 天然支持）。分词结果写入 `model_cache` 缓存
- `upsertTag` 插入 `tags_fts` 需 `await`，FTS5 不支持 `OR REPLACE` 语法
- 生成 tag embedding 前先调用 `hasTagEmbedding()` 检查是否已存在，避免重复 API 调用
- 批量导入两阶段分离：LLM 阶段可并行（Phase 1），DB 写入必须串行（Phase 2），不可混用并发写入同一 SQLite 连接
- SQLite 使用 WAL 模式（`PRAGMA journal_mode=WAL`），在 `client.ts` 和 `migrate.ts` 中创建连接时统一设置
- 无注释代码风格（除非必要）
- SQL 不写在命令模块中，统一封装在 store 层

## 数据库连接

使用 `bun:sqlite` 内置模块。macOS 上 Bun 内置 SQLite 不支持扩展加载，需要用 Homebrew 的 SQLite 库：

```typescript
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import * as sqliteVec from 'sqlite-vec'

// 自动检测：VEIN_SQLITE_LIB_PATH 环境变量 > Homebrew 路径
function setupCustomSQLite() {
    const envPath = process.env.VEIN_SQLITE_LIB_PATH
    if (envPath && existsSync(envPath)) {
        Database.setCustomSQLite(envPath)
        return
    }
    const candidates = [
        '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib', // Apple Silicon
        '/usr/local/opt/sqlite/lib/libsqlite3.dylib',     // Intel
    ]
    for (const p of candidates) {
        if (existsSync(p)) {
            Database.setCustomSQLite(p)
            return
        }
    }
}
setupCustomSQLite()  // 必须在 new Database() 之前调用

const db = new Database(dbPath)
db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA foreign_keys = ON')
sqliteVec.load(db)  // 加载向量扩展
```

- `setupCustomSQLite()` 在 `client.ts` 和 `migrate.ts` 模块加载时自动调用
- 配置了 embedding 但 sqlite-vec 无法加载时，`vein new` 会报错提示安装 `brew install sqlite`
- 未配置 embedding 时，sqlite-vec 加载失败仅 warning，FTS5 正常工作
- `getRawClient()` 返回兼容包装器（`{ execute(sql | { sql, args }) → { rows } }`），保持与旧 libsql 代码兼容。`getNativeDb()` 返回原始 `Database` 实例

## 代码规范

- **格式化**: Biome, 4 空格缩进, 80 字符行宽, 单引号, 无分号, 尾逗号(ES5), 箭头函数参数必加括号
- **Lint**: Biome, 推荐规则 + 严格 correctness/suspicious 规则, 启用 organizeImports
- **TypeScript**: ESNext target, strict 模式, `verbatimModuleSyntax`（type 导入需显式 `import type`）
- **命名**: 文件 kebab-case, 函数 camelCase, 类型 PascalCase
- **日志**: 使用 `logger.child({ module: 'xxx' })` 创建模块级 logger
- **日志级别**:
  - `log.info` 仅记录关键流程节点（Agent 工具调用开始/结束、检索完成、迁移、错误恢复等）
  - `log.debug` 记录内部细节（缓存命中/未命中、markdown 解析流水线步骤、LLM 消息收发等）
  - `log.warn` 记录需关注但非致命的操作（如强制覆盖、降级行为）
  - `log.error` 记录异常（传入 `err` 字段，含 stack trace）
- **日志内容约束**: 禁止在日志中打印完整 LLM prompt/messages/response 或大型数据结构（如完整文档树）。Agent 工具结果仅记录摘要（resultSummary + resultLen），不记录完整 result 字段。
- **日志格式**: 结构化对象 `log.info({ docId, key: value, content: '描述' })`，`content` 字段用英文描述操作，避免在 msg 中拼接变量
- **导出**: 统一起名导出（避免 default export）
- **运行时**: `bun run src/command/vein.ts`, `bun run build` 构建（单入口 vein.ts）, `bun run check` 类型检查, `bun run lint` 检查代码, `bun run format` 格式化（含 import 排序）
