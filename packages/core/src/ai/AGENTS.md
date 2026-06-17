# AI Agent 模块

## DeepSeek 模型行为

- **结构化模板抑制推理输出**：子 Agent 的成功在于 prompt 给出了显式 Markdown section 标题（`## 相关性`、`## 概述`...），模型直接逐节填空，不会输出前导解释。换用「返回 JSON」这种纯负面约束时，模型会输出 6600+ 字的推理链再给 JSON。解决方式：给 reviewer 也改用 `## 评判` / `## 理由` / `## 建议` 的 Markdown 结构。
- **纯 prompt 无法完全消除 DeepSeek 的推理输出**：即使加了「第一个字符必须是 `{`」约束，模型仍会输出 ~1600 字前导文本。彻底消除需要用 `complete()` 的 `reasoning: 'low'` 或 `response_format: json_object`（pi-ai 目前不暴露后者给 `call()`）。
- **Agent API 与 `call()` 底层无区别**：两者都通过 `complete()` 调用模型，Agent 的 `defaultConvertToLlm` 只按 role 过滤消息，不剥离 thinking 块。输出格式差异纯由 prompt 结构决定。

## 竞态与边界

- **主 Agent 预算必须用代码兜底**：prompt 里写「最多 40 步/3 次 review」只能起提示作用，模型可能忽略。必须通过 Agent 的 `beforeToolCall` hook 硬 block（`{ block: true, reason: '...' }`）。
- **`analyzeDocument` 必须做 memoization**：子 Agent 调用通过 `cached(key, fn)` 按 `(docId, userQuery)` 缓存。prompt 层面说「已分析过的不要重复」不可靠。
- **`analyzeDocument` 必须 try/catch**：子 Agent 失败若不兜底，错误会冒泡中断整个 librarian 会话。应 catch 后返回 `## 相关性\n\nnone` 的占位输出。
- **`reviewResult` 的 `sources` 参数要从 `## 数据来源` 提取纯 nodeId**：子 Agent 返回 `0001: 章节标题`，reviewer 的 `getReviewSource` 需要的是 `0001`。通过 `normalizeNodeId()` 取 `:` 或 `_` 前第一个 token，避免 `(node not found)` 误判。
- **上下文裁剪时保留 `## 数据来源`**：`pruneContext` 压缩旧 analyzeDocument 结果时若只保留 relevance + summary，会丢失 nodeId 出处，导致最终答案缺 citation、reviewer 缺 sources。`compactAnalyzeResult` 需额外提取 `## 数据来源` 节点列表。

## 过渡状态

- **`turn_start` 事件可填补 LLM 静默空档**：主 Agent 在分析完成→review 之间、review→最终输出之间有 12-52s 的纯 LLM 思考时间。通过 Agent 的 `turn_start` 事件 + 阶段标记（`lastPhase`），可显示 "Synthesizing results..." / "Composing final answer..." 过渡提示。

## Prompt 撰写原则

- **内部约束描述不要可被模型照抄**：如 prompt 里写了「连续 3 轮搜索返回 0 篇结果，触发搜索止损条件」，模型会把这句话原封不动输出到最终答案。改用抽象描述（「连续多次搜索均未命中」）并在代码层加 `sanitizeAnswer()` 后置清洗。
- **「建议 ≤5 篇」会导致模型分批**：prompt 的软建议会被模型严格执行，10 篇文档会被拆成 5+5 两个 batch，凭空多一次 LLM 往返。改为「一次性选择所有可能相关的文档，不要分批」。
- **搜索关键词示例应与整体原则一致**：「ref reactive 区别」中「区别」是低区分度意图词，与同一 prompt 里「禁止将问题意图词作为关键词」矛盾。统一改为「ref reactive」。

## 代码细节

- **`compactDocText` 的正则不要硬编码 4 位 nodeId**：用 `/^\s*\d+\s+\S/` 替代 `/^\s*\d{4}\s/`，避免 nodeId 格式变化后裁剪逻辑完全失效。
- **`makeReviewResult` 里 `Array.isArray(raw)` 是死代码**：`sources` 参数类型为 `string?`，永远不会是数组。
- **`searchDocsByKeyword` 需要 LIMIT + OFFSET**：原固定 LIMIT 10 且无 offset 参数，相关文档排在 10 名开外时完全无法被检索到。已改造为支持翻页（limit 默认 10，最大 20，offset 默认 0）。
