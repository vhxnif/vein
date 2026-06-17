import {
    initProject,
    listModels,
    listProviders,
    loadGlobalProjects,
    loadProjectConfig,
    registerProject,
    resolveProjectRoot,
    saveProjectConfig,
    setModelProvider,
    unregisterProject,
} from '@vein/core'
import { Hono } from 'hono'

const projectsRouter = new Hono()
const modelsRouter = new Hono()

// ── GET /api/projects ───────────────────────────────────────────
// List all registered projects from the global registry
projectsRouter.get('/', async (c) => {
    const data = await loadGlobalProjects()
    const entries = Object.entries(data.projects).map(
        ([name, projectPath]) => ({
            name,
            path: projectPath,
        })
    )
    return c.json({ projects: entries })
})

// ── POST /api/projects ──────────────────────────────────────────
// Create a new vein project
projectsRouter.post('/', async (c) => {
    const body = await c.req.json()
    const {
        name,
        provider,
        model,
        path: targetPath,
    } = body as {
        name?: string
        provider?: string
        model?: string
        path?: string
    }

    if (!name || !provider || !model) {
        return c.json(
            { error: 'Missing required fields: name, provider, model' },
            400
        )
    }

    const cwd = targetPath || process.cwd()

    try {
        const config = await initProject(cwd, name, {
            provider: provider as 'openai' | 'deepseek',
            model,
        })
        setModelProvider(config.model)
        await registerProject(config.name, cwd)
        return c.json(
            { project: { name: config.name, path: cwd, config } },
            201
        )
    } catch (err) {
        return c.json(
            {
                error:
                    err instanceof Error
                        ? err.message
                        : 'Failed to create project',
            },
            500
        )
    }
})

// ── GET /api/projects/current/config ────────────────────────────
projectsRouter.get('/current/config', async (c) => {
    const root = resolveProjectRoot()
    if (!root) {
        return c.json({ error: 'No project selected' }, 400)
    }
    const config = await loadProjectConfig(root)
    if (!config) {
        return c.json({ error: 'No config found' }, 404)
    }
    return c.json({ config })
})

// ── PUT /api/projects/current/config ────────────────────────────
projectsRouter.put('/current/config', async (c) => {
    const root = resolveProjectRoot()
    if (!root) {
        return c.json({ error: 'No project selected' }, 400)
    }
    const body = await c.req.json()
    const existing = await loadProjectConfig(root)
    if (!existing) {
        return c.json({ error: 'No config found' }, 404)
    }

    const updated = { ...existing, ...body }
    await saveProjectConfig(root, updated)

    // Refresh model provider if model config changed
    if (body.model && updated.model) {
        setModelProvider(updated.model)
    }

    return c.json({ config: updated })
})

// ── DELETE /api/projects/:name ───────────────────────────────────
projectsRouter.delete('/:name', async (c) => {
    const name = c.req.param('name')
    const data = await loadGlobalProjects()
    if (!data.projects[name]) {
        return c.json({ error: `Project "${name}" not found` }, 404)
    }
    await unregisterProject(name)
    return c.json({ success: true })
})

// ── GET /api/models/providers ────────────────────────────────────
modelsRouter.get('/providers', (c) => {
    const providers = listProviders()
    return c.json({ providers })
})

// ── GET /api/models/:provider ────────────────────────────────────
modelsRouter.get('/:provider', (c) => {
    const provider = c.req.param('provider')
    const models = listModels(provider)
    return c.json({ models })
})

export { modelsRouter, projectsRouter }
