<h1 align="center">Vein</h1>

<p align="center">
  <strong>AI Agent 驱动的本地文档管理与智能检索系统</strong><br/>
  分词搜索直达文档，AI 代理深入原文——把个人知识库变成可对话的第二大脑。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" />
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
</p>

<p align="center">
  <img src="public/vein_cli.png" height="550" alt="Vein CLI" />
  <img src="public/vein_web.png" height="550" alt="Vein Web" />
</p>

---

## 📑 目录

- [⚡ 快速开始](#-快速开始)
- [✨ 核心理念](#-核心理念)
- [🎯 功能特性](#-功能特性)
- [🌐 Web UI](#-web-ui)
- [📖 CLI 补充](#-cli-补充)
- [🏗️ 架构设计](#-架构设计)
- [🔧 配置](#-配置)
- [🛠️ 技术栈](#-技术栈)
- [📄 许可](#-许可)

---

## ⚡ 快速开始

### 前置要求

- **Node.js** ≥ 18（生产运行）
- **Bun** ≥ 1.0（开发 / 从源码构建）
- 一个可用的 AI 模型 API Key（由 **pi** 驱动）

### 安装

```bash
# 克隆仓库
git clone https://github.com/vhxnif/vein.git
cd vein

# 安装依赖（Bun workspaces）
bun install

# 构建并全局 link
bun run link
```

### 初始化项目

```bash
# 创建 Vein 项目（交互式配置名称、模型、Provider）
vein new my-knowledge-base
```

初始化完成后自动写入 `~/.config/vein/projects.json` 全局注册表。

### 导入文档

```bash
# 导入 Markdown（自动生成 AI 摘要 + 中文分词索引）
vein markdown docs/*.md
```

### 启动 Web UI（推荐）

```bash
# 一键启动
vein web

# 指定端口
vein web --port 8080

# 开发模式（后端 + 前端分离）
bun run dev:web      # 后端 http://localhost:3000
bun run dev:frontend # 前端 http://localhost:5173
```

浏览器打开后，你将获得一个完整的交互界面：**Ask**（AI 检索）、**Docs**（文档浏览与管理）、**History**（查询历史）、**Settings**（模型配置）。

> 💡 Web UI 是 Vein 的**主要交互方式**，承载了更完善的可视化体验。CLI 适合脚本化批量操作和无头环境。

---

## ✨ 核心理念

传统全文搜索只能按关键词匹配，你得到一堆零散片段。**Vein** 的工作方式不同：

```
你的问题
   │
   ▼
Librarian Agent 自主规划检索路径
   ├─ searchDocs       → 关键词搜索，获取候选文档 + snippet + 大纲
   ├─ getDocStructure  → 浏览文档目录树，定位相关章节
   ├─ getDocNodeDetails → 按需阅读节点原文，精确引用
   └─ reviewResult      → 自检答案准确性（可选）
   │
   ▼
汇总分析 + 来源引用 ──→ 结构化答案（附 [docId:nodeId] 引用）
```

**不是搜文档，是让 AI 替你读文档。**

> 单 Agent 直接操作工具，自行规划搜索策略：自行分词、判读 snippet、按需深读、翻页重试——全程自主决策，避免固定流水线的僵化和上下文浪费。

---

## 🎯 功能特性

| 特性 | 说明 |
|------|------|
| 🔍 **中文分词搜索** | LLM 驱动的中文分词 + SQLite FTS5 BM25 排序，精准匹配中文语义 |
| 🧠 **自主检索 Agent** | 单一 Librarian Agent 直接操作 searchDocs / getDocStructure / getDocNodeDetails 工具，自行规划搜索→判读→深读→引用全流程 |
| 🌲 **文档树形结构** | Markdown 自动拆分为节点树，支持层级浏览和精准定位 |
| 💾 **项目级配置** | 每个项目独立 `.vein/config.json`，可为分词/摘要/检索/审查配置不同模型 |
| 🌐 **全局项目注册表** | `vein -p <name>` 从任意目录操作已注册项目 |
| 📝 **查询历史** | 每次 `ask` 自动保存到 `.vein/ask-history/`，可回溯浏览 |
| 🗃️ **LLM 缓存** | `model_cache` 表缓存分词和摘要结果，避免重复调用 |
| 🚀 **批量导入并发** | Phase 1 4 文件并行 LLM 处理 + Phase 2 串行 DB 写入（WAL 优化） |
| 🖥️ **Web UI** | 浏览器端全功能界面：实时 SSE 检索进度、文档树浏览、会话管理、项目配置 |
| ⌨️ **CLI** | 基于 `@clack/prompts` 的交互界面，支持非交互 JSON 模式，适合脚本和服务器环境 |

---

## 🌐 Web UI

Web UI 是 Vein 的**主要使用方式**，提供比 CLI 更完整的可视化体验。

### 页面一览

| 页面 | 路由 | 功能 |
|------|------|------|
| **Ask** | `/` | 多轮对话式 AI 检索，ndjson 流式输出（思考过程 → 工具调用 → Markdown 正文 → Review 自检） |
| **Docs** | `/docs` `/docs/:id` | 文档列表（响应式分页/无限滚动）、文档详情（大纲树 + 节点原文）、导入弹窗（拖放上传 + 进度流）、删除 |
| **History** | `/history` | 查询历史（按日期分组）、展开查看完整问答与审查结果 |
| **Projects** | `/projects` | 全局注册项目列表、切换/取消当前项目 |
| **Settings** | `/settings` | 项目配置（名称、主模型、摘要、分词、审查 4 个独立模型槽位 + 推理深度） |

### 设计

Web UI 采用 Kami 设计语言：暖色羊皮纸底、墨水蓝单色强调、Serif 排版层级，界面如印刷品般克制优雅。

### 技术栈

| 层 | 技术 |
|---|------|
| **API 服务** | Hono（ndjson 流式检索 + SSE 导入进度） |
| **前端框架** | React 19 + Vite |
| **数据管理** | TanStack Query（服务端状态缓存）+ TanStack Router（类型安全路由） |
| **样式** | Tailwind CSS v4 + Kami 设计令牌（CSS 变量） |
| **AI 后端** | 复用 `@vein/core` 全部业务能力 |

---

## 📖 CLI 补充

CLI 是 Web UI 的**补充**，适合：
- 服务器/无头环境运行
- 脚本化批量导入文档
- 快速命令行查询

### 常用命令

```bash
# 交互式问答
vein ask "这个项目里关于部署的文档有哪些？"

# 查看历史
vein history --last

# 重新分词索引
vein markdown resegment

# 交互式浏览文档库
vein browse

# 管理项目注册表
vein projects --remove my-old-project

# 跨目录操作已注册项目
vein -p my-knowledge-base ask "检索 API 设计文档"
```

| 命令 | 别名 | 功能 |
|------|------|------|
| `vein new [name]` | — | 初始化新项目 |
| `vein markdown <files...>` | — | 导入 Markdown 文档 |
| `vein markdown resegment` | `rs` | 重新分词 FTS 索引 |
| `vein ask [query]` | — | AI Agent 检索 |
| `vein history` | `hs` | 浏览历史问答 |
| `vein browse` | `br` | 交互式浏览文档库 |
| `vein projects` | `pr` | 管理全局项目注册表 |
| `vein web` | — | 启动 Web UI 服务 |
| `vein config` | — | 修改项目配置 |

**常用选项：**

```bash
-p, --project <name>   指定目标项目
-n, --no-interactive   输出 JSON（脚本用）
-t, --trace            展示检索步骤追踪
-f, --force            强制重新导入
```

---

## 🏗️ 架构设计

### 包结构（Monorepo）

```
vein/
├── packages/
│   ├── core/          # @vein/core — 业务层（AI / DB / 文档树 / 配置）
│   ├── cli/           # @vein/cli — 命令解析 + I/O（薄层）
│   └── web/           # @vein/web — Hono API + React SPA（薄层）
├── package.json       # workspace 根
└── biome.json         # 代码规范
```

- **Core**：提供完整业务能力（`@vein/core` 单一入口），CLI / Web 只调用高层 API
- **CLI / Web**：不直接访问 store / pi-ai / 文件系统，所有逻辑委托给 core

### 数据模型

```
library（逻辑概念，对应 nodes 子树）
  └── docs（文档）
        ├── nodes（文档节点，树形结构 + 闭包表）
        └── docs_fts（FTS5 unicode61 全文索引）
```

### 检索流程：单 Agent 直接工具调用

```
User Query
  │
  ▼
Librarian Agent（单一 Agent，自主规划检索路径）
  │
  ├─ searchDocs(query, limit, offset)
  │     → 对用户问题进行自行分词，FTS5 BM25 搜索
  │     → 返回 [{docId, snippet, rank, outline}]，含文档摘要和大纲
  │     → Agent 根据 snippet + outline 判读相关性
  │     → 结果不足时自动换同义词或翻页（offset）重试
  │
  ├─ getDocStructure(docId)
  │     → 获取单个文档的完整大纲树（缩进格式：nodeId + title + summary）
  │     → Agent 根据大纲定位需要深读的章节
  │
  ├─ getDocNodeDetails(docId, nodeId)
  │     → 按需读取节点原文，支持批量并发请求
  │     → Agent 直接引用原文，标注 [docId:nodeId] 来源
  │
  └─ reviewResult(query, answer, sources)  [可选]
        → Reviewer 子 Agent 验证答案覆盖度和准确性
```

### 批量导入管道

```
Phase 1 — 并行 LLM（4 文件并发）
  readFile → mdToTree（解析 + LLM 摘要）→ segmentText（LLM 分词）
         ↓
Phase 2 — 串行 DB（WAL 模式）
  insertTree → insertDoc（含 docs_fts）
```

---

## 🔧 配置

项目配置文件 `.vein/config.json`：

```json
{
  "$schema": "./config.schema.json",
  "name": "my-knowledge-base",
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
  "reviewer": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "thinkingLevel": "high"
}
```

| 字段 | 说明 |
|------|------|
| `model` | 主 Librarian Agent 使用的模型 |
| `summarizer` | 文档摘要专用模型（可选，回退到 `model`） |
| `segmenter` | 中文分词专用模型（可选，回退到 `model`） |
| `reviewer` | 结果审查专用模型（可选，回退到 `model`） |
| `thinkingLevel` | 主 Agent 推理深度（`off` / `minimal` / `low` / `medium` / `high` / `xhigh`），默认 `off` |
| `db` | SQLite 数据库文件路径 |

AI Provider 通过 `@earendil-works/pi-ai` 统一适配，支持 OpenAI / DeepSeek 及兼容接口。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **运行时** | Node.js（开发用 Bun 运行 TS 源码） |
| **包管理** | Bun workspaces（monorepo） |
| **数据库** | SQLite (better-sqlite3, WAL 模式) |
| **ORM** | Drizzle ORM |
| **全文搜索** | FTS5 unicode61 + BM25 排序 |
| **AI 框架** | `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core` |
| **Web API** | Hono |
| **Web 前端** | React 19 + TanStack Router + TanStack Query + Tailwind CSS v4 |
| **CLI** | Commander + @clack/prompts |
| **日志** | Pino（结构化 JSON，按日滚动） |
| **代码规范** | Biome (lint + format) |
| **构建** | Bun build → Node.js 单文件 |

---

## 🙏 致谢

- [Kami](https://github.com/tw93/Kami) — Web UI 设计语言：暖色羊皮纸底、墨水蓝单色强调、Serif 排版层级

---

## 📄 许可

MIT License © 2025 [vhxnif](https://github.com/vhxnif)

---

<p align="center">
  <sub>Built with ❤️ using Bun, SQLite, and LLMs</sub>
</p>
