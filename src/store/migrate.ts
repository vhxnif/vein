import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'
import { logger } from '../config'
import { schema } from './migrations/sql'

const log = logger.child({ module: 'migrate' })

async function runMigrations(dbPath: string) {
    const db = new Database(dbPath)
    db.exec('PRAGMA foreign_keys = ON')

    // Load sqlite-vec extension before running migrations that depend on it
    sqliteVec.load(db)

    for (const { name, sql } of schema) {
        db.exec(sql)
        log.info({ sql: name, content: 'Migration applied successfully.' })
    }
    db.close()
}

export { runMigrations }
