import { existsSync } from 'node:fs'
import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pino from 'pino'
import { configSchema } from '../store/migrations/config_schema'

// ── app identity ──────────────────────────────────────────────

/** Application name used for config/log directories under ~/.config/. */
export const APP_NAME = 'vein'

import type { ModelProvider, ProjectConfig } from './type'

// ── project root override (set by --project flag) ──

let _projectOverridePath: string | undefined

/** Set a global project root override (used by --project flag). */
export function setProjectOverride(p: string | undefined): void {
    _projectOverridePath = p
}

/**
 * Resolve the project root directory.
 * If a global override was set (via --project), returns that.
 * Otherwise walks up from cwd looking for a .vein directory.
 */
export function resolveProjectRoot(): string | undefined {
    if (_projectOverridePath) return _projectOverridePath
    return getProjectRoot(process.cwd())
}

// ── logger (file-only JSON output to ~/.config/vein/logs/) ──────

const logsDir = `${process.env.HOME}/.config/${APP_NAME}/logs`
await mkdir(logsDir, { recursive: true })

const today = new Date().toISOString().slice(0, 10)

const logger = pino(
    {
        level: 'debug',
    },
    pino.destination({ dest: `${logsDir}/vein-${today}.log`, sync: true })
)

const veinDir = '.vein'

function getProjectRoot(cwd: string): string | undefined {
    let dir = cwd
    while (true) {
        const veinPath = path.join(dir, veinDir)
        try {
            existsSync(veinPath)
            return dir
        } catch {
            const parent = path.dirname(dir)
            if (parent === dir) {
                return void 0
            }
            dir = parent
        }
    }
}

async function loadProjectConfig(
    root: string
): Promise<ProjectConfig | undefined> {
    const configPath = path.join(root, veinDir, 'config.json')
    try {
        const rawConfig = await readFile(configPath, 'utf-8')
        return JSON.parse(rawConfig) as ProjectConfig
    } catch {
        return void 0
    }
}

async function initProject(
    cwd: string,
    projectName: string,
    model: ModelProvider
): Promise<ProjectConfig> {
    const veinPath = path.join(cwd, veinDir)
    const configPath = path.join(veinPath, 'config.json')

    try {
        await access(configPath, constants.F_OK)
        throw new Error(`already initialized at ${veinPath}`)
    } catch (err) {
        if (
            err instanceof Error &&
            err.message.startsWith('already initialized')
        ) {
            throw err
        }
    }

    await mkdir(veinPath, { recursive: true })

    const schemaPath = path.join(veinPath, 'config.schema.json')
    await writeFile(schemaPath, JSON.stringify(configSchema, null, 2))

    const dbPath = '.vein/data.db'
    const fullDbPath = path.join(veinPath, 'data.db')
    const { runMigrations } = await import('../store/migrate')
    await runMigrations(fullDbPath)

    const config: ProjectConfig = {
        $schema: './config.schema.json',
        name: projectName,
        db: dbPath,
        model,
    }

    await writeFile(configPath, JSON.stringify(config, null, 2))

    return config
}

async function saveProjectConfig(
    root: string,
    config: ProjectConfig
): Promise<void> {
    const configPath = path.join(root, veinDir, 'config.json')
    await writeFile(configPath, JSON.stringify(config, null, 2))
}

export type { ModelProvider, ProjectConfig }
export {
    getProjectRoot,
    initProject,
    loadProjectConfig,
    logger,
    saveProjectConfig,
    veinDir,
}
