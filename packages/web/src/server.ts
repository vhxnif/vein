#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { logger } from '@vein/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { projectMiddleware } from './middleware/project'

const log = logger.child({ module: 'web' })

const app = new Hono()

// ── Global error handler ───────────────────────────────────────
app.onError((err, c) => {
    log.error({ err: err.message }, 'Unhandled error')
    return c.json(
        {
            error:
                process.env.NODE_ENV === 'production'
                    ? 'Internal server error'
                    : err.message,
        },
        500
    )
})

// ── Global middleware ──────────────────────────────────────────
app.use('*', cors())
app.use('/api/projects/current/*', projectMiddleware)

import { docsRouter } from './routes/documents'
import { historyRouter } from './routes/history'
// ── API routes ─────────────────────────────────────────────────
import { modelsRouter, projectsRouter } from './routes/projects'
import { searchRouter } from './routes/search'

app.route('/api/projects', projectsRouter)
app.route('/api/models', modelsRouter)
app.route('/api/projects/current/documents', docsRouter)
app.route('/api/projects/current/search', searchRouter)
app.route('/api/projects/current/history', historyRouter)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// ── MIME types ─────────────────────────────────────────────────
const MIME: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
}

// ── Static files & SPA fallback ────────────────────────────────
const __dirname: string = path.dirname(fileURLToPath(import.meta.url))

// Resolve static client build relative to server location
// Dev (bun run src/server.ts):  static at ../../dist/client
// Prod (node dist/server.js): static at ../client
const staticRoot: string = (() => {
    const candidates = [
        path.resolve(__dirname, 'client'),
        path.resolve(__dirname, '../../dist/client'),
    ]
    for (const c of candidates) {
        if (existsSync(c)) return c
    }
    return candidates[0]!
})()

if (existsSync(staticRoot)) {
    // Serve built static assets
    app.get('/assets/*', (c) => {
        const filePath = path.join(staticRoot, c.req.path ?? '')
        if (!existsSync(filePath)) return c.notFound()
        const ext = path.extname(filePath)
        const mime = MIME[ext] || 'application/octet-stream'
        return c.body(readFileSync(filePath, 'utf-8'), {
            headers: { 'Content-Type': mime },
        })
    })

    // SPA fallback: serve index.html for all non-API GET routes
    app.get('/*', (c) => {
        const indexHtml = path.join(staticRoot, 'index.html')
        if (!existsSync(indexHtml)) return c.text('Not found', 404)
        return c.html(readFileSync(indexHtml, 'utf-8'))
    })
    log.info({ staticRoot }, 'Serving static files')
} else {
    log.info('Static files not found — use Vite dev server for frontend')
    // In dev, provide a friendly redirect for non-API routes
    app.get('/*', (c) =>
        c.text('Vein API server running. Frontend: http://localhost:5173')
    )
}

// ── Start ──────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3000

log.info({ port }, 'Server starting')
console.log(`Vein Web server running at http://localhost:${port}`)

// Start HTTP server (works in both Bun and Node.js)
import { createServer } from 'node:http'

const server = createServer(async (req, res) => {
    const url = new URL(
        req.url || '/',
        `http://${req.headers.host || 'localhost'}`
    )
    let body: ReadableStream | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = Readable.toWeb(req) as any
    }

    const webReq = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body,
        duplex: 'half',
    } as any)
    const webRes = await app.fetch(webReq)

    // Copy headers
    const headers: Record<string, string> = {}
    for (const [k, v] of webRes.headers.entries()) {
        headers[k] = v
    }
    res.writeHead(webRes.status, headers)

    if (webRes.body) {
        const reader = webRes.body.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
                // Flush each chunk for SSE streaming
                if (typeof (res as any).flush === 'function') {
                    ;(res as any).flush()
                }
            }
        } finally {
            reader.releaseLock()
        }
    }
    res.end()
})

server.listen(port, '0.0.0.0', () => {
    log.info({ port }, 'Server listening')
})
