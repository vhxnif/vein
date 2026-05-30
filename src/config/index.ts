import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pino from 'pino'
import { name } from '../../package.json'
import { configSchema } from '../store/migrations/config_schema'
import type { ModelProvider, ProjectConfig } from './type'

const logs = `${process.env.HOME}/.config/${name}/logs`

await mkdir(logs, { recursive: true })

const today = new Date().toISOString().slice(0, 10)
const logger = pino(
    {
        level: 'debug',
    },
    pino.destination({ dest: `${logs}/vein-${today}.log`, sync: true })
)

const veinDir = '.vein'

function getProjectRoot(cwd: string): string | undefined {
    let dir = cwd
    while (true) {
        const veinPath = path.join(dir, veinDir)
        try {
            require('node:fs').accessSync(veinPath, constants.F_OK)
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
    model: ModelProvider,
    embedding?: ModelProvider
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
        embedding,
    }

    await writeFile(configPath, JSON.stringify(config, null, 2))

    return config
}

export type { ModelProvider, ProjectConfig }
export { getProjectRoot, initProject, loadProjectConfig, logger, veinDir }
