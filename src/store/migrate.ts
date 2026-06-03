import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'
import { logger } from '../config'
import { schema } from './migrations/sql'
import './sqlite_setup'

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

async function runMigrations(
    dbPath: string,
    opts?: { requireExtension?: boolean }
) {
    const db = new Database(dbPath)
    db.run('PRAGMA journal_mode=WAL')
    db.run('PRAGMA foreign_keys = ON')

    // Load sqlite-vec extension
    try {
        sqliteVec.load(db)
    } catch (err) {
        if (opts?.requireExtension) {
            db.close()
            const hint = process.env.VEIN_SQLITE_LIB_PATH
                ? `VEIN_SQLITE_LIB_PATH=${process.env.VEIN_SQLITE_LIB_PATH} is set but the file doesn't exist or can't be loaded.`
                : 'Install a SQLite build with extension support. On macOS: brew install sqlite. Then set VEIN_SQLITE_LIB_PATH, or vein will auto-detect Homebrew paths.'
            throw new Error(
                `sqlite-vec extension is required for embedding-based tag deduplication, but it failed to load.
${hint}

After installing, re-run: vein new --migrate`,
                { cause: err }
            )
        }
        log.warn({
            content:
                'sqlite-vec extension not available — vector similarity search disabled. Keyword search (FTS5) still works.',
        })
    }

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
