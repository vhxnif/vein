import process from 'node:process'
import { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolveProjectRoot } from '../config/index.ts'
import * as schema from './schema.ts'

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
                db.exec(sqlOrParams)
                return { rows: [] }
            }
            // SELECT, or any statement with RETURNING (e.g. UPDATE ... RETURNING)
            const returnsRows =
                /^\s*SELECT\b/i.test(sqlOrParams.sql) ||
                /\bRETURNING\b/i.test(sqlOrParams.sql)
            const stmt = db.prepare(sqlOrParams.sql)
            // ponytail: cast args to any[] — bun:sqlite's SQLQueryBindings union is narrower than unknown[]
            // the actual validation happens at SQLite level, so this is safe
            const args = (sqlOrParams.args ?? []) as any[]
            if (returnsRows) {
                return { rows: stmt.all(...args) }
            }
            stmt.run(...args)
            return { rows: [] }
        },
    }
}

function createDb(dbPath: string) {
    const db = new Database(dbPath)
    db.run('PRAGMA journal_mode = WAL')
    db.run('PRAGMA foreign_keys = ON')

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

const _instances = new Map<string, ReturnType<typeof createDb>>()

function getInstance() {
    const dbPath = resolveDbPath()
    let instance = _instances.get(dbPath)
    if (!instance) {
        instance = createDb(dbPath)
        _instances.set(dbPath, instance)
    }
    return instance
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
