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

export { getErrorMessage, md5, uuid }
