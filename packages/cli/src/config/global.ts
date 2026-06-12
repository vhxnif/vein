import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { APP_NAME, logger } from '@vein/core/config'

const configDir = path.join(process.env.HOME ?? '~', '.config', APP_NAME)
const projectsFile = path.join(configDir, 'projects.json')

const log = logger.child({ module: 'global-config' })

export type GlobalProjects = {
    projects: Record<string, string> // name → absolute path
}

async function ensureConfigDir(): Promise<void> {
    await mkdir(configDir, { recursive: true })
}

/** Load all registered projects from global config. */
export async function loadGlobalProjects(): Promise<GlobalProjects> {
    await ensureConfigDir()
    try {
        const raw = await readFile(projectsFile, 'utf-8')
        const data = JSON.parse(raw) as { projects?: Record<string, string> }
        return { projects: data.projects ?? {} }
    } catch {
        return { projects: {} }
    }
}

/** Save the global projects registry. */
export async function saveGlobalProjects(data: GlobalProjects): Promise<void> {
    await ensureConfigDir()
    await writeFile(projectsFile, JSON.stringify(data, null, 2))
}

/**
 * Register (or update) a project in the global config.
 * Stores name → absolutePath mapping.
 */
export async function registerProject(
    name: string,
    projectPath: string
): Promise<void> {
    const data = await loadGlobalProjects()
    const abs = path.resolve(projectPath)
    data.projects[name] = abs
    await saveGlobalProjects(data)
    log.info({ name, path: abs, content: 'Project registered globally' })
}

/** Remove a project from the global registry. */
export async function unregisterProject(name: string): Promise<void> {
    const data = await loadGlobalProjects()
    delete data.projects[name]
    await saveGlobalProjects(data)
    log.info({ name, content: 'Project unregistered globally' })
}

/**
 * Get the absolute path for a registered project.
 * Returns undefined if the name is not registered or the directory no longer exists.
 */
export async function getProjectPath(
    name: string
): Promise<string | undefined> {
    const data = await loadGlobalProjects()
    const p = data.projects[name]
    if (!p) return undefined

    // Verify the path still exists
    try {
        await access(p, constants.F_OK)
        return p
    } catch {
        return undefined
    }
}
