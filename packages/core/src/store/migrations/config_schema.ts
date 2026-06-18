export const configSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: './config.schema.json',
    title: 'Vein Project Config',
    description:
        'Configuration schema for a Vein AI document management project.',
    type: 'object',
    required: ['name', 'db', 'model'],
    properties: {
        $schema: {
            type: 'string',
            description: 'JSON Schema reference for editor support.',
        },
        name: {
            type: 'string',
            description: 'Project name.',
        },
        db: {
            type: 'string',
            description:
                'Path to the SQLite database file, relative to the project root.',
            default: '.vein/data.db',
        },
        model: {
            type: 'object',
            description: 'Default AI model for chat/librarian/summarizer.',
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    description: 'AI provider name.',
                    enum: [
                        'amazon-bedrock',
                        'anthropic',
                        'azure-openai-responses',
                        'cerebras',
                        'cloudflare-ai-gateway',
                        'cloudflare-workers-ai',
                        'deepseek',
                        'fireworks',
                        'github-copilot',
                        'google',
                        'google-vertex',
                        'groq',
                        'huggingface',
                        'kimi-coding',
                        'minimax',
                        'minimax-cn',
                        'mistral',
                        'moonshotai',
                        'moonshotai-cn',
                        'opencode',
                        'opencode-go',
                        'openai',
                        'openai-codex',
                        'openrouter',
                        'together',
                        'vercel-ai-gateway',
                        'xai',
                        'xiaomi',
                        'xiaomi-token-plan-ams',
                        'xiaomi-token-plan-cn',
                        'xiaomi-token-plan-sgp',
                        'zai',
                    ],
                },
                model: {
                    type: 'string',
                    description:
                        "Model identifier (e.g. 'gpt-4o', 'claude-sonnet-4-20250514').",
                },
            },
        },
        summarizer: {
            type: 'object',
            description:
                "Optional dedicated model for document summarization. Falls back to 'model' if not set.",
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    $ref: '#/properties/model/properties/provider',
                },
                model: {
                    type: 'string',
                    description: 'Model identifier.',
                },
            },
        },
        segmenter: {
            type: 'object',
            description:
                "Optional faster/cheaper model for Chinese text segmentation. Falls back to 'model' if not set. Use a small model (e.g. 'gpt-4o-mini') to speed up batch imports.",
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    $ref: '#/properties/model/properties/provider',
                },
                model: {
                    type: 'string',
                    description: 'Model identifier.',
                },
            },
        },
        subagent: {
            type: 'object',
            description:
                "Optional model for the Document Analyzer subagent. Falls back to 'model' if not set.",
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    $ref: '#/properties/model/properties/provider',
                },
                model: {
                    type: 'string',
                    description: 'Model identifier.',
                },
            },
        },
        reviewer: {
            type: 'object',
            description:
                "Optional model for the result reviewer. Falls back to 'model' if not set.",
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    $ref: '#/properties/model/properties/provider',
                },
                model: {
                    type: 'string',
                    description: 'Model identifier.',
                },
            },
        },
        searchAgent: {
            type: 'object',
            description:
                "Optional model for the Search Screener subagent (keyword extraction + snippet screening). Falls back to 'model' if not set.",
            required: ['provider', 'model'],
            properties: {
                provider: {
                    type: 'string',
                    $ref: '#/properties/model/properties/provider',
                },
                model: {
                    type: 'string',
                    description: 'Model identifier.',
                },
            },
        },
    },
}
