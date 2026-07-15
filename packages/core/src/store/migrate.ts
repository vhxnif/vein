import { Database } from 'bun:sqlite'
import { logger } from '../config/index.ts'
import { schema } from './migrations/sql.ts'

const log = logger.child({ module: 'migrate' })

async function runMigrations(dbPath: string) {
    const db = new Database(dbPath)
    db.run('PRAGMA journal_mode = WAL')
    db.run('PRAGMA foreign_keys = ON')

    // Ensure migration tracking table exists before the loop
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)

    // Query already-applied migrations
    const applied = new Set<string>()
    const rows = db.prepare('SELECT name FROM _migrations').all() as Array<{
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
        db.exec(sql)
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
        log.info({ sql: name, content: 'Migration applied successfully.' })
    }
    db.close()
}

export { runMigrations }
