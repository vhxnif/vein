<h1 align="center">Vein</h1>

<p align="center">
  <strong>让 AI 替你读文档。</strong><br/>
  把 Markdown 知识库变成可对话的第二大脑。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" />
</p>

<p align="center">
  <img src="public/vein_web.png" height="550" alt="Vein Web" />
</p>

---

## 快速开始

**前置**：Node.js ≥ 18、Bun ≥ 1.0、一个 AI API Key。

```bash
git clone https://github.com/vhxnif/vein.git && cd vein
bun install && bun run link
vein new my-kb
vein markdown docs/*.md
vein web          # 浏览器打开 → 完成
```

---

## 怎么工作

传统搜索给你一堆零散片段。Vein 放一个 **Librarian Agent** 自主检索：

```
你的问题
  → searchDocs       关键词搜索，获取候选文档 + 摘要 + 大纲
  → getNodeSummary   快速查看节点摘要，判读相关性
  → getDocNodeDetails  按需深读原文，精确引用 [docId:nodeId]
  → 汇总分析，输出结构化答案
```

Agent 自行分词、判读结果、翻页重试、批量并发请求——全程自主决策，不是固定流水线。

---

## CLI 速查

| 命令 | 说明 |
|------|------|
| `vein new <name>` | 创建项目 |
| `vein markdown <files...>` | 导入 Markdown（自动摘要 + 分词索引） |
| `vein ask "..."` | AI Agent 问答 |
| `vein search "..."` | 关键词搜索（Markdown 输出，供工具调用） |
| `vein search --doc-id <id> --node-id <n>` | 节点全文（多节点用逗号分隔）|
| `vein search --doc-id <id> --node-id <n1,n2,...> --summary` | 节点摘要（支持批量） |
| `vein web` | 启动 Web UI |
| `vein browse` | 交互式浏览文档库 |
| `vein history --last` | 最近问答历史 |

常用选项：`-p <project>` 指定项目、`-n` JSON 输出、`-t` 显示检索步骤。

---

## 技术栈

SQLite (FTS5 + BM25) · Drizzle ORM · `@earendil-works/pi-ai` Agent 框架 · Hono API · React 19 + Tailwind CSS v4 · Bun 构建

---

## 许可

MIT License © 2025 [vhxnif](https://github.com/vhxnif)
