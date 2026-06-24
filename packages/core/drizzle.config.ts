import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/store/schema.ts',
    out: './src/store/migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'file:./vein.db',
    },
})
