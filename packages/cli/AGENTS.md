# @vein/cli

CLI 包：命令注册、交互式 UI、全局项目注册表。依赖 `@vein/core`。

## 目录

```
src/
├── command/               # CLI 命令（每个文件独立 register(program)）
│   ├── vein.ts                # 入口：Command 创建 + 子命令注册 + --project 全局选项 + preAction hook
│   ├── command-utils.ts       # 共享：setupProjectModel、createCachedSummarizer
│   ├── new.command.ts         # vein new [name] [--migrate]
│   ├── markdown.command.ts    # vein markdown <files...> [-f] + resegment 子命令
│   ├── ask.command.ts         # vein ask [query] [-n] [-t]
│   ├── history.command.ts     # vein history [-l|-L|-p]
│   ├── config.command.ts      # vein config（交互式）
│   ├── browse.command.ts      # vein browse / br（分页浏览）
│   └── projects.command.ts    # vein projects / pr [--remove]
├── config/
│   └── global.ts             # 全局项目注册表（~/.config/vein/projects.json 的 CRUD）
└── utils/
    └── cli-helpers.ts         # CLI 专用：formatDuration, colorize, VERDICT_ICON 等
```

## 入口文件

`src/command/vein.ts` — 唯一的构建入口：

```typescript
#!/usr/bin/env node
const vein = new Command()
    .name('vein')
    .option('-p, --project <name>', '...')

// 注册所有子命令
registerNew(vein)
registerMarkdown(vein)
registerAsk(vein)
// ...

// --project 全局选项解析
vein.hook('preAction', async () => {
    const name = vein.opts().project
    if (name) setProjectOverride(await getProjectPath(name))
})

await vein.parseAsync()
```

## 命令速览

| 命令 | 别名 | 描述 |
|---|---|---|
| `vein new [name]` | — | 初始化项目（交互选 provider/model），自动注册到全局 |
| `vein markdown <files...>` | `md` | 导入 markdown（并行 LLM + 串行 DB） |
| `vein markdown resegment` | `rs` | 重新分词所有文档 |
| `vein ask [query]` | — | 文档检索（Librarian Agent），-n JSON 输出，-t 显示 trace |
| `vein history` | `hs` | 历史回顾，-l 最近，-L 列表，-p 分页 |
| `vein browse` | `br` | 分页浏览文档库（20/页） |
| `vein projects` | `pr` | 全局注册表管理，--remove 删除 |
| `vein config` | — | 交互式修改 model/summarizer/segmenter |

## 从 core 导入

CLI 通过对 `@vein/core` 的子路径导入获取核心能力：

```typescript
// AI
import { librarian, setModelProvider, createSummarizer } from '@vein/core/ai'

// 配置
import { logger, resolveProjectRoot, veinDir, loadProjectConfig, initProject } from '@vein/core/config'
import type { ModelProvider, ProjectConfig } from '@vein/core/config/type'

// 数据库
import * as store from '@vein/core/store'
// 或具名导入
import { getDoc, getAllDocs, getFullTree, searchDocsByKeyword } from '@vein/core/store'

// 导入服务
import { importBatch, collectAllSummaries } from '@vein/core/service/import'

// 工具
import { md5 } from '@vein/core/utils/common'
import { segmentText } from '@vein/core/utils/segment'

// 树
import type { DocNode } from '@vein/core/tree'
import { mdToTree } from '@vein/core/tree/markdown_split'
```

## 全局项目注册表

`packages/cli/src/config/global.ts` 管理 `~/.config/vein/projects.json`：

```typescript
registerProject(name, path)     // 注册（new 时自动调用）
unregisterProject(name)         // 删除
getProjectPath(name)            // 查找路径（--project 使用）
loadGlobalProjects()            // 加载全部
```

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

# 从 CLI 包
cd packages/cli && bun run build && bun link

# 取消
bun run unlink
```

link 后在任意目录可直接使用 `vein` 命令。

## 交互约定

- **Spinner**：所有耗时操作通过 `@clack/prompts` 的 `spinner()` 反馈进度
- **错误处理**：`getErrorMessage(err)` 统一错误消息提取
- **输出格式**：交互模式用 `note()` / `outro()`；非交互模式（`-n`）输出 JSON 到 stdout
- **颜色**：终端颜色通过 `colorize()` + `VERDICT_COLOR` 控制，`process.stdout.isTTY` 检测

## 日志

CLI 自身日志通过 `logger.child({ module: 'xxx' })` 创建（`logger` 从 `@vein/core/config` 导入）。日志仅写文件，不输出到控制台（避免干扰 spinner 和 prompt）。
