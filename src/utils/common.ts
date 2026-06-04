import { createHash } from 'node:crypto'

function uuid() {
    return crypto.randomUUID().replaceAll('-', '')
}

function md5(content: string) {
    return createHash('md5').update(content).digest('hex')
}

function hash(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

export { hash, md5, uuid }
