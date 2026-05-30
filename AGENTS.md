# AGENTS

## 项目概述

Vein 是一个基于 AI Agent 的文档管理与智能检索系统。核心理念是模拟人类在图书馆中查找资料的过程：先锁定分类区域（categories），再浏览标签卡片（tags），最后定位到具体文档（docs）。

## 技术栈

- **运行时**: Bun
- **数据库**: SQLite (bun:sqlite), ORM 用 Drizzle (`drizzle-orm/bun-sqlite`)
- **向量搜索**: sqlite-vec (vec0 虚拟表, 通过 bun:sqlite 的 `loadExtension` 加载)
- **AI 模型**: 通过 @earendil-works/pi-ai 调用，可在 .vein/config.json 中配置
- **Embedding**: OpenRouter embeddings API (`POST /api/v1/embeddings`)
- **代码风格**: Biome (lint + format)

## 核心数据模型

```
library (逻辑概念，无实体表，对应 nodes 子树)
  └── categories (分类)
        └── tags (标签，通过 categorie_tags 关联)
              ├── docs (文档，通过 doc_tags 关联)
              │     └── nodes (文档内节点，树形结构)
              └── tag_embeddings (vec0 虚拟表，向量搜索)
```

### 实体关系

```
nodes ──(tree_closure)──→ nodes (树形层级)
  │
  └──(doc_id)──→ docs ──(doc_tags)──→ tags ──(categorie_tags)──→ categories
                                          │
                                          └──(tag_id)──→ tag_embeddings (vec0)
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
| `tag_embeddings` | **vec0 虚拟表**，存储标签的向量 embedding，支持 KNN 语义搜索。首次 `upsertTagEmbedding` 时懒创建，维度自动匹配当前 embedding 模型 |

### 预设分类体系

12 个宏观分类，仿真实图书馆分类法设计，见 `src/store/migrations/0000_seed_categories.sql`。

## 目录结构

```
src/
├── ai/           # AI 模型调用与 Agent 工具
│   ├── base.ts       # 模型调用基础设施（call 函数 + ToolDef 类型 + onToolCall 进度回调）
│   ├── embedding.ts  # Embedding 生成（OpenRouter API）
│   ├── librarian.ts  # 文档检索 Librarian Agent（渐进式查找 + 自检审查）
│   ├── reviewer.ts   # 检索结果审查 Agent（无工具纯评估）
│   ├── tagger.ts     # 标签提取与分类 Agent（支持 tool-calling 模式的向量搜索）
│   └── index.ts      # 统一导出
├── command/      # CLI 命令
│   └── vein.ts       # 主命令 (new / markdown / ask / hs / tags)
├── config/       # 配置（logger、项目初始化和配置读写）
├── store/        # 数据库层
│   ├── schema.ts     # Drizzle schema 定义
│   ├── client.ts     # 数据库连接（bun:sqlite + sqlite-vec 扩展加载）
│   ├── index.ts      # 树形结构 CRUD + doc/tag/category/embedding 操作
│   ├── migrate.ts    # 迁移执行
│   └── migrations/   # SQL 迁移文件 + config.schema.json
├── tree/         # 树形数据结构与 Markdown 拆分
└── utils/        # 通用工具
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
2. 工具生成 query tag 的 embedding（OpenRouter API）→ 查询 `tag_embeddings` vec0 表
3. 返回 cosine similarity > 0.8 的已有 tag
4. LLM 判断是否复用已有 tag

未配置 `embedding` 时退化为纯 prompt 模式（仅 A1+A2）。

### Embedding 持久化

`extractAndSaveTags` 在 upsert 新 tag 后，异步生成并存储其 embedding（fire-and-forget）。已有 tag 可通过 `vein tags backfill-embeddings` 回填。

### 缓存策略

- Tagger 结果写入 `model_cache`，key = `md5(prompt + summary + tools标记)`
- **仅缓存有效结果**（`categories.length > 0`），空结果不污染缓存
- 读取时校验有效性，无效缓存走 re-tag

## 查询路径（Librarian 渐进式检索）

Librarian Agent 按以下链路逐层下钻，每步缩小范围：

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
    "embedding": {
        "provider": "openrouter",
        "model": "openai/text-embedding-3-small"
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
| `summarizer.model` | 摘要专用模型名称（可选，未配置时回退到 `model`） |
| `embedding.provider` | Embedding provider（可选，目前仅 `openrouter`） |
| `embedding.model` | Embedding 模型 ID，如 `openai/text-embedding-3-small`、`nvidia/llama-nemotron-embed-vl-1b-v2:free` |

> **切换 embedding 模型**：不同模型输出不同维度（OpenAI 1536、NVIDIA 2048、Google 768）。切换前需先 `vein tags clear-embeddings` 删除旧 vec0 表，再 `vein tags backfill-embeddings` 用新模型重建。

## 命令

```
vein new [name] [--migrate]
    初始化项目。name 可选（不传时交互输入）。
    --migrate 对已有项目重新执行迁移。
    交互步骤：项目名 → AI provider → 模型 → embedding 配置（可选）

vein markdown <files...> [-f | --force]
    导入 markdown 文件为文档树（含 AI 摘要 + 标签提取）。
    支持批量：vein markdown docs/*.md
    同一文件（按内容 MD5）默认跳过。
    -f 强制重新导入。

vein ask [query] [-n | --no-interactive] [-t | --trace]
    检索文档库。默认交互输入 query。
    传入 query 参数时直接使用，不重复收集。
    -n 输出 JSON（供脚本使用，含 elapsedMs 耗时字段）。
    -t 展示检索步骤追踪。
    每次查询结果自动保存到 .vein/ask-history/。

vein history [-l | --last] [-L | --list] [-p <n>]
    回顾历史问答记录。无参数时交互式选择会话查看详情（循环选择，Esc 退出）。
    -l 查看最近一次。-L 非交互列表模式。-p 指定分页（每页 20 条）。
    别名 hs。

vein tags backfill-embeddings
    为所有缺少 embedding 的 tag 生成向量并写入 tag_embeddings。
    首次使用 embedding 功能或切换模型后运行。

vein tags clear-embeddings
    删除 tag_embeddings vec0 表。
    切换 embedding 模型前必须执行，否则维度不匹配。
```

## 开发约定

- 迁移 SQL 内联在 `src/store/migrations/sql.ts`，按数组顺序执行，无外部 .sql 文件
- 迁移全部使用 `IF NOT EXISTS` / `INSERT OR IGNORE`，保证幂等，新增表后执行 `vein new --migrate` 即可
- `tag_embeddings` vec0 表不在迁移中创建，由 `upsertTagEmbedding` 首次调用时懒创建（自动匹配维度）
- 种子数据放独立迁移条目（如 `0000_seed_categories`）
- AI Agent 工具遵循 `base.ts` 的 `ToolDef` 模式
- summarizer 调用自动走 `model_cache` 缓存，按 prompt MD5 + 模型名去重，命中时 hit_count + 1
- 每次 summarizer 调用有 60s 超时，超时后抛出错误并记录日志
- 不同 Agent 职责分离：tagger 只做标签提取和分类，librarian 只做渐进式文档检索，reviewer 只做结果审查
- Librarian 检索时展示实时进度（spinner 文字随步骤变化：Browsing categories... → Checking tags... → ...）
- Tagger 的 `searchSimilarTags` 工具在 vec0 表不存在时优雅降级（返回空数组），不抛错
- `getTagsWithoutEmbeddings` 在 vec0 表不存在时 fallback 为返回全部 tag
- 无注释代码风格（除非必要）
- SQL 不写在命令模块中，统一封装在 store 层

## 数据库连接

使用 `bun:sqlite` 内置模块（零外部依赖）：

```typescript
import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'

const db = new Database(dbPath)
db.exec('PRAGMA foreign_keys = ON')
sqliteVec.load(db)  // 加载向量扩展
```

`getRawClient()` 返回兼容包装器（`{ execute(sql | { sql, args }) → { rows } }`），保持与旧 libsql 代码兼容。`getNativeDb()` 返回原始 `Database` 实例。

## 代码规范

- **格式化**: Biome, 4 空格缩进, 80 字符行宽, 单引号, 无分号, 尾逗号(ES5), 箭头函数参数必加括号
- **Lint**: Biome, 推荐规则 + 严格 correctness/suspicious 规则, 启用 organizeImports
- **TypeScript**: ESNext target, strict 模式, `verbatimModuleSyntax`（type 导入需显式 `import type`）
- **命名**: 文件 kebab-case, 函数 camelCase, 类型 PascalCase
- **日志**: 使用 `logger.child({ module: 'xxx' })` 创建模块级 logger，关键操作节点（缓存命中/未命中、数据变更、错误）必须打日志
- **日志级别**: `log.info` 记录正常流程节点，`log.warn` 记录需关注但非致命的操作（如强制覆盖），`log.error` 记录异常（传入 `err` 字段）
- **日志格式**: 结构化对象 `log.info({ docId, key: value, content: '描述' })`，`content` 字段用英文描述操作，避免在 msg 中拼接变量
- **导出**: 统一起名导出（避免 default export）
- **运行时**: `bun run src/index.ts`, `bun run check` 类型检查, `bun run lint` 检查代码, `bun run format` 格式化（含 import 排序）
