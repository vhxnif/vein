function uuid() {
    return Bun.randomUUIDv7().replaceAll('-', '')
}

function md5(content: string) {
    const hasher = new Bun.CryptoHasher('md5')
    hasher.update(content)
    return hasher.digest('hex')
}

function hash(content: string) {
    return Bun.hash(content)
}

export { hash, md5, uuid }
