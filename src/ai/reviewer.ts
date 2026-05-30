import { Type } from '@earendil-works/pi-ai'
import { getNodeDetails } from '../store'
import type { BaseDocNode } from '../tree/type'
import { call, type ToolDef } from './base'

const prompt = `你是一个文档检索结果审查员。你的任务是审查 Librarian 返回的检索结果，判断其是否满足用户的需求。

## 输入

你会收到：
1. 用户的原始查询
2. Librarian 引用的数据源地址列表（docId + nodeId）
3. Librarian 整理后的检索结果

## 验证流程

1. 首先调用 getReviewSource 工具逐个获取数据源的原文
2. 将原文与 Librarian 的检索结果进行核对
3. 完成所有核对后给出评判

## 评估维度

### 1. 相关性
返回的文档内容是否直接回应用户查询的主题？

### 2. 完整性
返回的内容是否覆盖了用户问题的主要方面？是否有明显的遗漏？

### 3. 准确性
Librarian 的结果是否忠实于数据源的原文？是否存在虚构、曲解或遗漏关键信息？

## 输出格式

完成核对后，严格返回 JSON，不含其他文字：

{
  "verdict": "pass" | "partial" | "fail",
  "score": 1-5,
  "reason": "简要评判理由（1-2句）",
  "suggestion": "如果不通过，建议 Librarian 如何改进检索；如通过则为空字符串"
}

### verdict 定义
- pass（4-5分）：内容直接回答用户问题，信息充分且与原文一致
- partial（2-3分）：内容部分相关，但不够完整或存在小偏差
- fail（1分）：内容无关，或存在明显虚构/曲解原文，或完全无法回答

### 重要原则
- 不要引入外部知识，只基于 getReviewSource 返回的原文进行评判
- 如果 Librarian 未提供数据源或源内容为空，verdict 应为 fail
- 如果数据源原文与查询主题无关，说明 Librarian 选错了文档，verdict 应为 fail`

type ReviewResult = {
    verdict: 'pass' | 'partial' | 'fail'
    score: number
    reason: string
    suggestion: string
}

type SourceRef = {
    docId: string
    nodeId: string
}

function buildReviewTools(): ToolDef[] {
    return [
        {
            name: 'getReviewSource',
            description:
                '根据 docId 和 nodeId 获取文档节点的原始文本，用于验证 Librarian 结果是否准确',
            parameters: Type.Object({
                docId: Type.String({ description: '文档 ID' }),
                nodeId: Type.String({ description: '节点 ID' }),
            }),
            run: async ({
                docId,
                nodeId,
            }: {
                docId: string
                nodeId: string
            }) => {
                const d = await getNodeDetails<BaseDocNode>(
                    `${nodeId}_${docId}`
                )
                return d?.text ?? '(empty)'
            },
        },
    ]
}

async function reviewer(
    query: string,
    librarianResponse: string,
    sources?: SourceRef[]
): Promise<ReviewResult> {
    const sourcesText = sources?.length
        ? sources
              .map((s) => `- docId: ${s.docId}, nodeId: ${s.nodeId}`)
              .join('\n')
        : '(无数据源)'

    const { content } = await call({
        systemPrompt: prompt,
        tools: buildReviewTools(),
        messages: [
            {
                role: 'user',
                content: [
                    `用户查询：${query}`,
                    `数据源地址：\n${sourcesText}`,
                    `Librarian 返回结果：${librarianResponse}`,
                ].join('\n\n'),
                timestamp: Date.now(),
            },
        ],
    })

    const text = content.findLast((it) => it.type === 'text')?.text ?? '{}'

    // Strip markdown fences and extract first JSON object
    let json = text.trim()
    const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (fenceMatch) {
        json = fenceMatch[1]!.trim()
    } else {
        const objMatch = json.match(/\{[\s\S]*\}/)
        if (objMatch) {
            json = objMatch[0]!
        }
    }

    try {
        const result = JSON.parse(json) as ReviewResult
        return {
            verdict: result.verdict ?? 'fail',
            score: result.score ?? 1,
            reason: result.reason ?? '',
            suggestion: result.suggestion ?? '',
        }
    } catch {
        return {
            verdict: 'fail',
            score: 1,
            reason: 'Reviewer 返回格式异常，无法解析',
            suggestion: '',
        }
    }
}

export type { ReviewResult, SourceRef }
export { reviewer }
