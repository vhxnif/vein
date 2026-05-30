import { call } from '../ai/base'

/**
 * Use LLM to segment Chinese text into words separated by spaces.
 * E.g. "人工智能发展迅速" → "人工智能 发展 迅速".
 * English text passes through mostly unchanged.
 */
async function segmentText(text: string): Promise<string> {
    if (!text) return ''

    const { content } = await call({
        systemPrompt: `你是一个中文分词工具。将输入文本按语义切分为词语，用空格分隔后输出。不要添加任何解释、标点或其他内容，只输出分词后的结果。对于英文/数字部分保持原样，仅对中文部分进行分词。

示例输入：人工智能技术正在迅速发展
示例输出：人工智能 技术 正在 迅速 发展`,
        messages: [
            {
                role: 'user',
                content: text,
                timestamp: Date.now(),
            },
        ],
    })

    const result =
        content.findLast((it) => it.type === 'text')?.text?.trim() ?? text
    return result
}

export { segmentText }
