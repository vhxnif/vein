import { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as sqliteVec from 'sqlite-vec'
import { getProjectRoot } from '../config'
import * as schema from './schema'
import './sqlite_setup'

export type { BunSQLiteDatabase }

type RawClient = {
    execute(sqlOrParams: string | { sql: string; args?: unknown[] }): Promise<{
        rows: unknown[]
    }>
}

function createRawWrapper(db: Database): RawClient {
    return {
        async execute(sqlOrParams) {
            if (typeof sqlOrParams === 'string') {
                db.run(sqlOrParams)
                return { rows: [] }
            }
            const isSelect = /^\s*SELECT\b/i.test(sqlOrParams.sql)
            const stmt = db.prepare(sqlOrParams.sql)
            const args = (sqlOrParams.args ?? []) as Parameters<typeof stmt.all>
            if (isSelect) {
                return { rows: stmt.all(...args) }
            }
            stmt.run(...args)
            return { rows: [] }
        },
    }
}

function createDb(dbPath: string) {
    const db = new Database(dbPath)
    db.run('PRAGMA foreign_keys = ON')

    // Load sqlite-vec extension
    try {
        sqliteVec.load(db)
    } catch (_err) {
        // sqlite-vec not supported — vector similarity will be unavailable
    }

    const raw = createRawWrapper(db)
    const drizzleDb = drizzle(db, { schema })

    return { db: drizzleDb, raw, native: db }
}

function resolveDbPath(): string {
    const root = getProjectRoot(process.cwd())
    if (!root) {
        console.error(
            'No vein project found. Run "vein new <name>" to initialize one.'
        )
        process.exit(1)
    }
    return `${root}/.vein/data.db`
}

let _instance: ReturnType<typeof createDb> | null = null

function getInstance() {
    if (!_instance) {
        _instance = createDb(resolveDbPath())
    }
    return _instance
}

const db = new Proxy({} as ReturnType<typeof createDb>['db'], {
    get(_, prop) {
        return Reflect.get(getInstance().db, prop)
    },
})

function getRawClient(): RawClient {
    return getInstance().raw
}

function getNativeDb(): Database {
    return getInstance().native
}

export { createDb, db, getNativeDb, getRawClient }
