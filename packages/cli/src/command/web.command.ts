import { spawn } from 'node:child_process'
import process from 'node:process'
import type { Command } from 'commander'

export function register(program: Command) {
    program
        .command('web')
        .description('Start the web UI server')
        .option('--port <port>', 'port to listen on (default: 3000)')
        .action(async (opts: { port?: string }) => {
            const args: string[] = []
            const env: Record<string, string | undefined> = {
                ...process.env,
            }
            if (opts.port) env.PORT = opts.port

            const child = spawn('vein-web', args, {
                stdio: 'inherit',
                env,
                shell: true,
            })

            child.on('exit', (code) => {
                process.exit(code ?? 0)
            })

            // Forward Ctrl+C
            process.on('SIGINT', () => {
                child.kill('SIGINT')
            })
            process.on('SIGTERM', () => {
                child.kill('SIGTERM')
            })
        })
}
