import { createHash } from 'node:crypto'

function getErrorMessage(err: unknown): string {
    return err instanceof Error
        ? err.message || 'Unknown error'
        : 'Unknown error'
}

function uuid() {
    return crypto.randomUUID().replaceAll('-', '')
}

function md5(content: string) {
    return createHash('md5').update(content).digest('hex')
}

function hash(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

export { getErrorMessage, hash, md5, uuid }
