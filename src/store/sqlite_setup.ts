import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'

// On macOS, Bun's built-in SQLite doesn't support extension loading.
// Use a custom SQLite library (via VEIN_SQLITE_LIB_PATH env var or Homebrew).
function setupCustomSQLite() {
    // 1. Env var override
    const envPath = process.env.VEIN_SQLITE_LIB_PATH
    if (envPath && existsSync(envPath)) {
        Database.setCustomSQLite(envPath)
        return
    }
    // 2. Homebrew (Apple Silicon / Intel)
    const candidates = [
        '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',
        '/usr/local/opt/sqlite/lib/libsqlite3.dylib',
    ]
    for (const p of candidates) {
        if (existsSync(p)) {
            Database.setCustomSQLite(p)
            return
        }
    }
}

setupCustomSQLite()
