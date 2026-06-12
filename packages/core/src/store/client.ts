import Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolveProjectRoot } from '../config'
import * as schema from './schema'

export type { BetterSQLite3Database }

type RawClient = {
    execute(sqlOrParams: string | { sql: string; args?: unknown[] }): Promise<{
        rows: unknown[]
    }>
}

function createRawWrapper(db: Database.Database): RawClient {
    return {
        async execute(sqlOrParams) {
            if (typeof sqlOrParams === 'string') {
                db.exec(sqlOrParams)
                return { rows: [] }
            }
            const isSelect = /^\s*SELECT\b/i.test(sqlOrParams.sql)
            const stmt = db.prepare(sqlOrParams.sql)
            const args = sqlOrParams.args ?? []
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
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const raw = createRawWrapper(db)
    const drizzleDb = drizzle(db, { schema })

    return { db: drizzleDb, raw, native: db }
}

function resolveDbPath(): string {
    const root = resolveProjectRoot()
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

function getNativeDb(): Database.Database {
    return getInstance().native
}

export { createDb, db, getNativeDb, getRawClient }
