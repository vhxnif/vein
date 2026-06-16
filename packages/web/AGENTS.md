# @vein/web

Web 包：**thin web layer**。提供 REST API + React SPA 前端。所有业务逻辑委托给 `@vein/core`，不直接操作数据库或 AI 调用。

## 目录

```
src/
├── server.ts               # Hono 入口 + Node.js HTTP adapter（路由挂载、CORS、静态文件 SPA fallback）
├── middleware/
│   └── project.ts          # 项目解析中间件（X-Vein-Project header / ?project query / localStorage）
├── routes/
│   ├── projects.ts         # /api/projects + /api/models
│   ├── documents.ts        # /api/projects/current/documents（CRUD + import SSE + resegment）
│   ├── search.ts           # /api/projects/current/search（POST JSON 检索）
│   └── history.ts          # /api/projects/current/history（列表 + 详情）
└── client/                 # React SPA（Vite 构建）
    ├── index.html
    ├── main.tsx            # 入口：createRoot + QueryClientProvider + RouterProvider
    ├── styles.css          # Kami 设计令牌（CSS 变量）+ Tailwind v4 + 组件样式 + keyframes
    ├── routeTree.gen.ts    # TanStack Router 自动生成的路由树
    ├── routes/             # 文件路由（TanStack Router）
    │   ├── __root.tsx          # 根布局（ProjectProvider + Layout wrapper）
    │   ├── index.tsx           # 首页 = 搜索框 + 检索结果（融合原 Home + Ask）
    │   ├── docs.tsx            # Docs 列表页（分页浏览）
    │   ├── docs.$docId.tsx     # Doc 详情页（大纲树 + 节点原文）
    │   ├── history.tsx         # History 页（日期分组 + 展开详情）
    │   └── settings.tsx        # Settings 页（provider/model 下拉联动）
    ├── components/
    │   └── Layout.tsx          # 桌面侧边栏（含项目选择器）+ 移动端底部 Tab Bar
    └── lib/
        ├── api.ts              # 类型化 API 客户端（fetch + h() header 注入）
        └── project.tsx         # ProjectContext + localStorage 持久化
```

## 架构模式

Web 层作为 thin client：

1. **后端路由**：Hono 定义 REST 端点，处理请求参数 / formData / JSON 响应
2. **前端页面**：React + TanStack Router + TanStack Query，直接调用 `lib/api.ts`
3. **调用 core**：所有业务逻辑委托 `@vein/core`

Web **绝不**：
- 直接访问数据库（store）
- 直接调用 `@earendil-works/pi-ai` 或 Agent
- 直接读写 `.vein/` 下的文件
- 内联任何业务管道逻辑

## API 路由表

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/projects` | 列出全局注册表 |
| `POST` | `/api/projects` | 创建新项目（name, provider, model） |
| `DELETE` | `/api/projects/:name` | 注销项目 |
| `GET` | `/api/projects/current/config` | 加载当前项目配置 |
| `PUT` | `/api/projects/current/config` | 保存当前项目配置 |
| `GET` | `/api/projects/current/documents` | 分页文档列表 |
| `GET` | `/api/projects/current/documents/:id` | 文档详情 + 树 + FTS 摘要 |
| `GET` | `/api/projects/current/documents/:id/nodes/:nodeId` | 节点原文 |
| `DELETE` | `/api/projects/current/documents/:id` | 删除文档 |
| `POST` | `/api/projects/current/documents/import` | multipart 上传 → SSE 进度 |
| `POST` | `/api/projects/current/documents/resegment` | 重新分词 |
| `POST` | `/api/projects/current/search` | **检索**（body: `{q, trace}`，返回 JSON 含 content/review/trace/elapsedMs） |
| `GET` | `/api/projects/current/history` | 分页历史列表 |
| `GET` | `/api/projects/current/history/:id` | 历史详情 |
| `GET` | `/api/models/providers` | 列出 AI providers |
| `GET` | `/api/models/:provider` | 列出 provider 的模型 |

## 项目上下文

用户通过以下方式指定目标项目：

1. **localStorage** `vein-project` → 所有 API 请求自动带 `X-Vein-Project` header（`h()` helper）
2. **侧边栏项目选择器**：hover 底部文件夹图标 → 下拉列出全局注册项目 → 点击选中/取消
3. **当前目录**：无 header 时自动上探 `.vein` 目录（与 CLI 行为一致）

中间件 `projectMiddleware` 调用 `getProjectPath()` + `setProjectOverride()` + `setupProjectModel()`。

## 检索流程

```
用户输入 query → 回车 / 点 Search
  → POST /api/projects/current/search  {q, trace}
  → 服务端 searchDocuments(query) → 返回 JSON { content, review, trace, elapsedMs }
  → 前端展示：content 正文 + Review 卡片 + 可折叠 Trace
```

搜索期间显示 `● Searching...  12.3s` 动画指示器（pulsing dot + 计时器）。结果通过 `fadeIn` 动画淡入。

## 前端技术栈

| 层 | 技术 | 用途 |
|---|------|------|
| **路由** | TanStack Router | 类型安全文件路由、代码分割 |
| **数据** | TanStack Query | 服务端状态缓存、mutation |
| **样式** | Tailwind CSS v4 | 原子化样式 |
| **设计** | Kami 设计令牌 | CSS 变量定义暖色羊皮纸画布、墨水蓝强调色、Serif 排版层级 |

### Kami 设计令牌

```css
--parchment: #f5f4ed;    /* 页面底色 */
--ink-blue:  #1B365D;    /* 唯一强调色 */
--ivory:     #faf9f5;    /* 卡片容器 */
--warm-sand: #e8e6dc;    /* 按钮默认背景 */
--near-black:#141413;    /* 正文（非纯黑，橄榄底色） */
--olive:     #504e49;    /* 辅助文字 */
--stone:     #6b6a64;    /* 次辅助 */
--serif: Charter, 'Noto Serif SC', serif;
--mono:  'JetBrains Mono', monospace;
```

组件样式：Ring shadow (`0 0 0 1pt`) 替代硬边框，Whisper shadow 用于浮起卡片，Quote 用 2pt ink-blue 左竖线。

## 构建与运行

```bash
# 从根目录
bun run dev:web           # Bun 开发（macOS/Linux）
bun run dev:web:node      # Node.js 开发（Windows / better-sqlite3 兼容问题）
bun run build:web         # 生产构建

# 从 web 包
cd packages/web

# 开发（macOS/Linux）
bun run dev                # bun run --watch src/server.ts

# 开发（Windows）
bun run build:backend && node dist/server.js
bun run dev:frontend       # Vite HMR（:5173，自动代理 /api → :3000）

# 构建
bun run build:frontend     # Vite → dist/client/
bun run build:backend      # Bun build --target node --external better-sqlite3 → dist/server.js
bun run build              # 串行构建

# 生产
bun run start              # node dist/server.js
```

> **注意**：`better-sqlite3` 是原生 C++ 模块。Bun macOS/Linux 可直接加载，Windows 需 Node.js。后端构建通过 `--external better-sqlite3` 保持外部依赖。

## 页面清单

| 页面 | 路由 | 功能 |
|------|------|------|
| **Home** | `/` | 搜索框 + 检索结果（content + Review + Trace） |
| **Docs** | `/docs` | 分页文档列表 |
| **Doc Detail** | `/docs/$docId` | 大纲树 + 节点原文、FTS 摘要、删除 |
| **History** | `/history` | 按日期分组、展开完整问答 |
| **Settings** | `/settings` | provider/model 下拉联动、保存 |

## 交互约定

- **加载状态**：TanStack Query `isLoading` → "Loading..."；搜索 → pulsing dot + 计时器
- **空状态**：无数据时显示引导文案
- **错误处理**：服务端 `app.onError()` 全局捕获；前端 TanStack Query 自动重试 + 错误展示
- **项目切换**：侧边栏底部文件夹图标 hover → 下拉选择 → localStorage 持久化
- **键盘导航**：首页搜索框 Enter 触发检索
- **响应式**：≥768px 侧边栏 + 780px 居中内容区，<768px 底部 Tab Bar + 全宽
- **暗色模式**：`prefers-color-scheme`，warm dark tokens（`#141413` / `#30302E`）

## 陷阱与约定

### Tailwind v4 @theme 桥接

CSS 变量定义在 `:root`（如 `--ink-blue: #1b365d`），但 Tailwind 不自动识别它们。需在 `styles.css` 中用 `@theme` 块桥接：

```css
@theme {
    --color-ink: #1b365d;
    --color-ivory: #faf9f5;
}
```

之后组件可用 `text-ink`、`bg-ivory` 替代 `text-[#1B365D]`、`bg-[#faf9f5]`。**不要混用**硬编码 hex 和主题令牌——统一用令牌。

### 批量替换色值的顺序陷阱

用 sed 将 `bg-[#hex]` 替换为主题类时，**必须先处理带透明度后缀的变体**（`bg-[#faf9f5]/50`），再处理不带后缀的（`bg-[#faf9f5]`）。否则 `/50` 会被遗留为孤立文本。

JS 模板字符串中的动态类（`` `${cond ? 'bg-[#hex]' : '...'}` ``）不会被 sed 匹配到，需手动编辑。

### Kami 冷暖色冲突

`--tint`（`#eef2f7`）是冷调蓝灰，原始用途是标签/徽章底色。**禁止**在暖色羊皮纸（`#f5f4ed`）上用它作 hover 高亮——冷暖冲突破坏 Kami 美学。行 hover 统一用暖沙色：

- 羊皮纸底色上的行：`hover:bg-sand/60`
- 象牙白（`#faf9f5`）表面上的元素：`hover:bg-sand`

### hover 风格一致性

同一底色上的所有可点击行必须使用相同的 hover 样式。当前约定：
| 底色 | hover | 场景 |
|------|-------|------|
| parchment `#f5f4ed` | `hover:bg-sand/60` | 文档列表行、历史记录行 |
| ivory `#faf9f5` | `hover:bg-sand` | 项目卡片、下拉菜单项、侧边栏图标 |

### 中文 UI 文本全面审计

中英文本地化不仅涉及页面标题（`历史`→`History`），还需检查：区块标题（`大纲`→`Outline`、`数据库`→`Database`）、元数据标签（`章节`→`sections`）、模型标签（`主模型`→`Main Model`）、空状态文案（`暂无文档`→`No documents yet`）、占位提示（`点击左侧章节查看原文`→`Select a section from the outline to view content`）。

### 标签防换行

不要用固定宽度（如 `w-16`）限制标签——长标签（如 "Sub-Agent Model"）会被折断。用 `whitespace-nowrap` 让标签按自然宽度渲染。

### 键盘无障碍

`focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2`：**仅键盘导航（Tab 键）时显示聚焦环**，鼠标点击时不显示。优于 `focus:`（后者鼠标点击也会触发）。需覆盖：侧边栏图标、大纲树按钮、设置页 `<select>`。

## 日志

Web 层日志通过 `logger.child({ module: 'web' })` 创建。仅写文件 `~/.config/vein/logs/vein-YYYY-MM-DD.log`，JSON 每行一条，不输出控制台。
