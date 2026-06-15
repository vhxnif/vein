import {
    getProjectPath,
    resolveProjectRoot,
    setProjectOverride,
    setupProjectModel,
} from '@vein/core'
import { createMiddleware } from 'hono/factory'

/**
 * Middleware that resolves the current project from the
 * X-Vein-Project header or query param, mirroring the CLI's
 * -p/--project flag + preAction hook.
 *
 * Sets up the global model provider from the project config.
 */
export const projectMiddleware = createMiddleware(async (c, next) => {
    // Resolve project from header or query param
    const projectName = c.req.header('X-Vein-Project') || c.req.query('project')

    if (projectName) {
        const projectPath = await getProjectPath(projectName)
        if (!projectPath) {
            return c.json(
                {
                    error: `Project "${projectName}" not found in global registry`,
                },
                404
            )
        }
        setProjectOverride(projectPath)
    }

    // Setup model provider from project config
    const config = await setupProjectModel()
    if (!config && !projectName) {
        const root = resolveProjectRoot()
        if (!root) {
            return c.json(
                {
                    error: 'Not in a vein project. Select a project or create one first.',
                },
                400
            )
        }
    }

    // Store resolved project root for downstream handlers
    c.set('projectRoot', resolveProjectRoot())

    await next()
})
