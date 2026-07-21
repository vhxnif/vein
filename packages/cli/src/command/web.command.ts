import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { APP_NAME } from '@vein/core'
import { $ } from 'bun'
import type { Command } from 'commander'

const CONFIG_DIR = path.join(process.env.HOME ?? '~', '.config', APP_NAME)
const PID_FILE = path.join(CONFIG_DIR, 'vein-web.pid')

async function ensureConfigDir(): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true })
}

async function readPid(): Promise<number | null> {
    try {
        const raw = await readFile(PID_FILE, 'utf-8')
        const pid = Number.parseInt(raw.trim(), 10)
        if (Number.isNaN(pid)) return null
        return pid
    } catch {
        return null
    }
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

function killProcess(pid: number): void {
    if (process.platform === 'win32') {
        // ponytail: taskkill /T kills the process tree (shell PID + vein-web child)
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
        process.kill(pid, 'SIGTERM')
    }
}

export function register(program: Command) {
    program
        .command('web')
        .description('Start the web UI server')
        .option('--port <port>', 'port to listen on (default: 3000)')
        .option('--stop', 'stop a running web server')
        .option('--status', 'check if web server is running')
        .action(
            async (opts: {
                port?: string
                stop?: boolean
                status?: boolean
            }) => {
                // ── Stop ───────────────────────────────────────
                if (opts.stop) {
                    const pid = await readPid()
                    if (!pid) {
                        console.log('No running server found (no PID file)')
                        return
                    }
                    if (!isAlive(pid)) {
                        console.log(
                            `PID ${pid} is not alive — cleaning up stale PID file`
                        )
                        await unlink(PID_FILE).catch(() => {
                            /* stale — ignore */
                        })
                        return
                    }
                    killProcess(pid)
                    await unlink(PID_FILE).catch(() => {
                        /* stale — ignore */
                    })
                    console.log(`Stopped server (PID ${pid})`)
                    return
                }

                // ── Status ────────────────────────────────────
                if (opts.status) {
                    const pid = await readPid()
                    if (!pid) {
                        console.log('Server is not running')
                        process.exit(1)
                    }
                    if (isAlive(pid)) {
                        console.log(`Server is running (PID ${pid})`)
                    } else {
                        console.log(
                            `PID ${pid} is stale — server is not running`
                        )
                        await unlink(PID_FILE).catch(() => {
                            /* stale — ignore */
                        })
                        process.exit(1)
                    }
                    return
                }

                // ── Start (default) ───────────────────────────
                // Check already running
                const existing = await readPid()
                if (existing && isAlive(existing)) {
                    console.log(`Server is already running (PID ${existing})`)
                    console.log(`Use 'vein web --stop' to stop it first.`)
                    process.exit(1)
                }

                // Clean up stale PID file
                if (existing && !isAlive(existing)) {
                    await unlink(PID_FILE).catch(() => {
                        /* stale — ignore */
                    })
                }

                const args: string[] = []
                const env: Record<string, string | undefined> = {
                    ...process.env,
                }
                if (opts.port) env.PORT = opts.port

                let pid: number | string

                const isWin = process.platform === 'win32'
                let child: ChildProcess | undefined
                if (isWin) {
                    pid =
                        await $`powershell -c "(Start-Process vein-web -WindowStyle Hidden -PassThru).Id"`
                            .text()
                            .then((it) => it.trim())
                } else {
                    child = spawn('vein-web', args, {
                        stdio: 'ignore',
                        env,
                        detached: true,
                    })
                    pid = child.pid!
                }

                await ensureConfigDir()
                await writeFile(PID_FILE, String(pid))

                console.log(`Vein Web server started (PID ${pid})`)
                console.log(`  http://localhost:${opts.port || '3000'}`)
                console.log(`  Stop with: vein web --stop`)
                console.log(`  PID file: ${PID_FILE}`)

                // Brief wait so vein-web's startup log lands before shell prompt
                await new Promise((r) => setTimeout(r, 500))
                if (child) {
                    child.unref()
                }
            }
        )
}
