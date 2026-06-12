# @vein/cli

CLI 包：**thin client**。只做命令行解析 + 交互式 I/O + 结果展示。所有业务逻辑委托给 `@vein/core`。

## 目录

```
src/
├── command/               # CLI 命令（每个文件独立 register(program)）
│   ├── vein.ts                # 入口：Command 创建 + 子命令注册 + --project 全局选项 + preAction hook
│   ├── new.command.ts         # vein new [name] [--migrate]
│   ├── markdown.command.ts    # vein markdown <files...> [-f] + resegment 子命令
│   ├── ask.command.ts         # vein ask [query] [-n] [-t]
│   ├── history.command.ts     # vein history [-l|-L|-p]
│   ├── config.command.ts      # vein config（交互式）
│   ├── browse.command.ts      # vein browse / br（分页浏览）
│   └── projects.command.ts    # vein projects / pr [--remove]
└── utils/
    └── cli-helpers.ts         # CLI 专用：formatDuration, colorize, VERDICT_ICON, modelKey 等
```

> 注：`command-utils.ts` 已删除（`setupProjectModel`、`createCachedSummarizer` 移入 core）。全局注册表 (`config/global.ts`) 已移入 core。

## 架构模式

CLI 作为 thin client，每个命令只做三件事：

1. **注册参数**：用 `commander` 定义命令选项
2. **交互 I/O**：用 `@clack/prompts` 收集输入、显示 spinner、输出结果
3. **调用 core**：从 `@vein/core` 导入高层函数执行业务逻辑

CLI **绝不**：
- 直接访问数据库（store）
- 直接调用 `@earendil-works/pi-ai`
- 直接读写 `~/.config/vein/` 下的文件
- 内联任何业务管道逻辑

## 从 core 导入

全部通过 `import { ... } from '@vein/core'`：

```typescript
// 项目 & 模型
import {
    setupProjectModel,
    listProviders,
    listModels,
    setModelProvider,
    createCachedSummarizer,
    resolveProjectRoot,
    initProject,
    loadProjectConfig,
    saveProjectConfig,
    registerProject,
} from '@vein/core'

// 文档导入
import { importBatch, resegmentAllDocuments } from '@vein/core'

// 文档检索
import { searchDocuments } from '@vein/core'

// 文档浏览
import { listDocuments, getDocumentDetail } from '@vein/core'

// 历史
import { saveSearchHistory, listSearchHistory, getSearchHistoryEntry } from '@vein/core'

// 全局注册表
import { loadGlobalProjects, unregisterProject, getProjectPath } from '@vein/core'

// 类型
import type { ModelProvider, ProjectConfig, HistoryEntry, SearchResult } from '@vein/core'

// 基础
import { logger, APP_NAME } from '@vein/core'
```

## 命令速览

| 命令 | 别名 | 描述 |
|---|---|---|
| `vein new [name]` | — | 初始化项目（交互选 provider/model），自动注册到全局 |
| `vein markdown <files...>` | `md` | 导入 markdown（调用 `importBatch`） |
| `vein markdown resegment` | `rs` | 重新分词所有文档（调用 `resegmentAllDocuments`） |
| `vein ask [query]` | — | 文档检索（调用 `searchDocuments`），-n JSON 输出，-t 显示 trace |
| `vein history` | `hs` | 历史回顾（调用 `listSearchHistory` / `getSearchHistoryEntry`） |
| `vein browse` | `br` | 分页浏览文档库（调用 `listDocuments` / `getDocumentDetail`） |
| `vein projects` | `pr` | 全局注册表管理（调用 `loadGlobalProjects` / `unregisterProject`） |
| `vein config` | — | 交互式修改 model/summarizer/segmenter |

## 构建

```bash
# 从根目录
bun run build

# 从 CLI 包
cd packages/cli && bun run build

# 产物：packages/cli/dist/vein.js  (3.7 MB)
# better-sqlite3 标记为 external
```

## 全局 Link

```bash
# 从根目录（自动 build + link）
bun run link

# 取消
bun run unlink
```

## 交互约定

- **Spinner**：所有耗时操作通过 `@clack/prompts` 的 `spinner()` 反馈进度
- **错误处理**：`getErrorMessage(err)`（从 `@vein/core` 导入）
- **输出格式**：交互模式用 `note()` / `outro()`；非交互模式（`-n`）输出 JSON 到 stdout
- **颜色**：终端颜色通过 `colorize()` + `VERDICT_COLOR` 控制，`process.stdout.isTTY` 检测

## 日志

CLI 自身日志通过 `logger.child({ module: 'xxx' })` 创建（`logger` 从 `@vein/core` 导入）。日志仅写文件，不输出到控制台。
