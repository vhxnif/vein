import { intro, note, outro, select } from '@clack/prompts'
import { getDocumentDetail, listDocuments, setupProjectModel } from '@vein/core'
import type { Command } from 'commander'

const PER_PAGE = 20

async function formatDocDetail(docId: string): Promise<string> {
    const doc = await getDocumentDetail(docId)
    if (!doc) return `Doc ${docId.slice(0, 8)} not found`
    const idShort = doc.id.slice(0, 8)
    return [
        `Title:  ${doc.title}`,
        `ID:     ${idShort}...`,
        `Source: ${doc.sourcePath}`,
        `Created: ${doc.createdAt}`,
    ].join('\n')
}

// ── Browse by Doc ──────────────────────────────────────────────────

async function browseDocsPage(page: number): Promise<void> {
    const { docs, total } = await listDocuments(page, PER_PAGE)
    const totalPages = Math.ceil(total / PER_PAGE)

    if (docs.length === 0) {
        note('No documents in the library.')
        return
    }

    const choices = docs.map((d) => {
        const title =
            d.title.length > 48 ? `${d.title.slice(0, 48)}...` : d.title
        return {
            value: d.id,
            label: `${title.padEnd(50)} │ ${d.nodeCount} node${d.nodeCount === 1 ? '' : 's'}`,
            hint: d.createdAt?.slice(0, 10) ?? '',
        }
    })

    if (totalPages > 1) {
        choices.push({
            value: '__prev__',
            label: `─── Page ${page}/${totalPages} · prev ───`,
            hint: page > 1 ? `page ${page - 1}` : 'first page',
        })
        choices.push({
            value: '__next__',
            label: `─── Page ${page}/${totalPages} · next ───`,
            hint: page < totalPages ? `page ${page + 1}` : 'last page',
        })
    }

    choices.push({
        value: '__back__',
        label: '( back to main menu )',
        hint: '',
    })

    while (true) {
        const selected = await select({
            message: `Documents (${total} total, page ${page}/${totalPages})`,
            options: choices,
        })

        if (!selected || typeof selected !== 'string') return

        if (selected === '__back__') return
        if (selected === '__prev__') {
            if (page > 1) {
                await browseDocsPage(page - 1)
                return
            }
            continue
        }
        if (selected === '__next__') {
            if (page < totalPages) {
                await browseDocsPage(page + 1)
                return
            }
            continue
        }

        // Show doc detail
        const detail = await formatDocDetail(selected)
        note(detail)
    }
}

// ── Top-level browse command ───────────────────────────────────────

export function register(program: Command) {
    program
        .command('browse')
        .alias('br')
        .description('browse the library by document')
        .action(async () => {
            const config = await setupProjectModel()
            if (!config) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            intro('Browse Library')

            await browseDocsPage(1)

            outro('Done')
        })
}
