# Migrate from Bun to Node.js (bun:sqlite → better-sqlite3)

## Context

The project currently uses **Bun** as its runtime, pulling in Bun-specific APIs:

| Bun API | Files |
|---|---|
| `bun:sqlite` (`Database`) | `src/store/client.ts`, `src/store/migrate.ts` |
| `drizzle-orm/bun-sqlite` | `src/store/client.ts` (import + type) |
| `Bun.randomUUIDv7()` | `src/utils/common.ts` (`uuid()`), `src/store/index.ts` (line 322) |
| `Bun.CryptoHasher('md5')` | `src/utils/common.ts` (`md5()`) |
| `Bun.hash()` | `src/utils/common.ts` (`hash()`) |
| `#!/usr/bin/env bun` | `src/command/vein.ts` (shebang) |
| `bun build --target bun` | `package.json` (build script) |
| `"types": ["bun"]` | `tsconfig.json` |
| `"globals": ["Bun"]` | `biome.json` |
| `@types/bun` | `package.json` (devDependency) |

The goal is to replace the Bun runtime with **Node.js** and switch the SQLite driver from `bun:sqlite` to **better-sqlite3**.

`sqlite-vec` is present in dependencies but is **not imported or used** anywhere in the source code. It will be **removed**.

## Approach

Replace each Bun-specific API with its Node.js equivalent:

| Bun | Node.js |
|---|---|
| `bun:sqlite` → `Database` class | `better-sqlite3` → `Database` constructor |
| `drizzle-orm/bun-sqlite` | `drizzle-orm/better-sqlite3` |
| `Bun.randomUUIDv7()` | `crypto.randomUUID()` (globally available in Node 19+) |
| `new Bun.CryptoHasher('md5')` | `crypto.createHash('md5')` |
| `Bun.hash()` | `crypto.createHash('sha256')` (or another stable hash) |
| `bun build` | `tsc` + shebang (or `tsup`/`esbuild` if needed) |
| `#!/usr/bin/env bun` | `#!/usr/bin/env node` |
| `@types/bun` | `@types/better-sqlite3` |

## Files to modify

1. **`package.json`** — scripts, dependencies, devDependencies
2. **`tsconfig.json`** — remove `"types": ["bun"]`, adjust for Node
3. **`biome.json`** — remove `"globals": ["Bun"]`
4. **`src/store/client.ts`** — replace bun:sqlite + drizzle-orm/bun-sqlite with better-sqlite3 + drizzle-orm/better-sqlite3
5. **`src/store/migrate.ts`** — replace bun:sqlite with better-sqlite3
6. **`src/store/index.ts`** — replace `Bun.randomUUIDv7()` with `crypto.randomUUID()`
7. **`src/utils/common.ts`** — replace `Bun.randomUUIDv7()`, `Bun.CryptoHasher`, `Bun.hash`
8. **`src/command/vein.ts`** — update shebang to `#!/usr/bin/env node`
9. **`index.ts`** — replace `"Hello via Bun!"` log message
10. **`drizzle.config.ts`** — change dialect from `turso` to `sqlite`

## Reuse

- `better-sqlite3` has a synchronous API very similar to `bun:sqlite` — the migration is mostly mechanical.
- Drizzle ORM has a first-party `drizzle-orm/better-sqlite3` driver with identical usage patterns.
- Node.js built-in `crypto` module covers MD5 hashing and UUID generation.
- The existing `RawClient` wrapper pattern in `client.ts` can be adapted straightforwardly.

## Steps

- [x] **1. Update `package.json`** — change build script from `bun build` to `esbuild` with `--packages=external`, remove `@types/bun` + `sqlite-vec`, add `better-sqlite3@12` + `@types/better-sqlite3` + `esbuild`.
- [x] **2. Update `tsconfig.json`** — remove `"types": ["bun"]`.
- [x] **3. Update `biome.json`** — remove `"globals": ["Bun"]`.
- [x] **4. Rewrite `src/utils/common.ts`** — replace `Bun.randomUUIDv7()` with `crypto.randomUUID()`, `Bun.CryptoHasher` with `crypto.createHash('md5')`, `Bun.hash()` with `crypto.createHash('sha256')`.
- [x] **5. Rewrite `src/store/client.ts`** — switch imports from `bun:sqlite` / `drizzle-orm/bun-sqlite` to `better-sqlite3` / `drizzle-orm/better-sqlite3`, adapt the `createRawWrapper` and `createDb` functions.
- [x] **6. Rewrite `src/store/migrate.ts`** — switch from `bun:sqlite` `Database` to `better-sqlite3`, replace `execMulti` with `db.exec()`, adapt `runMigrations`.
- [x] **7. Update `src/store/index.ts`** — replace `Bun.randomUUIDv7()` on line 322 with `crypto.randomUUID()`.
- [x] **8. Update `src/command/vein.ts`** — change shebang to `#!/usr/bin/env node`.
- [x] **9. Update `index.ts`** — update `"Hello via Bun!"` to `"Hello via Node!"`.
- [x] **10. Update `drizzle.config.ts`** — change `dialect: 'turso'` to `dialect: 'sqlite'`.

## Verification

1. ✅ `npm install` — installed with `better-sqlite3@12.10.0` (prebuilt binaries for Node 24).
2. ✅ `npx tsc --noEmit` — no type errors.
3. ✅ `npm run build` — outputs `build/vein.js` (97KB).
4. ✅ `node build/vein.js --help` — all commands listed.
5. ✅ `node build/vein.js projects` — global registry works.
6. ✅ `node build/vein.js new test-project --migrate` — 4 migrations applied, all tables created.
7. ✅ better-sqlite3 CRUD + FTS5 — manual test passed.
8. ✅ `npx @biomejs/biome lint` — 31 files checked, no fixes needed.

### Bug fixes during migration

- **`require('node:fs')` in ESM**: `src/config/index.ts` used `require('node:fs').accessSync()` which fails in Node.js ESM. Changed to `existsSync()` from `node:fs` import.
- **Double shebang**: `esbuild --banner:js` added alongside source shebang. Removed `--banner:js` (esbuild preserves entry file shebang).
- **`better-sqlite3@11` no Node 24 prebuilds**: Upgraded to `better-sqlite3@12.10.0` which has prebuilt binaries for Node 24 on Windows.
