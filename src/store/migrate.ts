import { Database } from 'bun:sqlite'
import { logger } from '../config'
import { schema } from './migrations/sql'

const log = logger.child({ module: 'migrate' })

/** Split a multi-statement SQL string and run each statement separately. */
function execMulti(db: Database, sql: string): void {
    const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    for (const stmt of statements) {
        db.run(stmt)
    }
}

async function runMigrations(dbPath: string) {
    const db = new Database(dbPath)
    db.run('PRAGMA journal_mode=WAL')
    db.run('PRAGMA foreign_keys = ON')

    // Ensure migration tracking table exists before the loop
    db.run(`CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)

    // Query already-applied migrations
    const applied = new Set<string>()
    const rows = db.query('SELECT name FROM _migrations').all() as Array<{
        name: string
    }>
    for (const row of rows) {
        applied.add(row.name)
    }

    for (const { name, sql } of schema) {
        if (applied.has(name)) {
            log.debug({ sql: name, content: 'Migration already applied.' })
            continue
        }
        execMulti(db, sql)
        db.run('INSERT INTO _migrations (name) VALUES (?)', [name])
        log.info({ sql: name, content: 'Migration applied successfully.' })
    }
    db.close()
}

export { runMigrations }
