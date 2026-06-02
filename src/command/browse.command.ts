import { intro, note, outro, select } from '@clack/prompts'
import type { Command } from 'commander'
import * as store from '../store'
import { setupProjectModel } from './command-utils'

const PER_PAGE = 20

async function formatDocDetail(docId: string): Promise<string> {
    const doc = await store.getDoc(docId)
    if (!doc) return `Doc ${docId.slice(0, 8)} not found`
    const meta = JSON.parse(doc.metadata) as Record<string, unknown>
    const title = (meta.title as string) ?? 'Untitled'
    const source = (meta.sourcePath as string) ?? ''
    const idShort = doc.id.slice(0, 8)
    return [
        `Title:  ${title}`,
        `ID:     ${idShort}...`,
        `Source: ${source}`,
        `Created: ${doc.createdAt}`,
    ].join('\n')
}

// ── Browse by Doc ──────────────────────────────────────────────────

async function browseDocsPage(page: number): Promise<void> {
    const total = await store.getDocCount()
    const totalPages = Math.ceil(total / PER_PAGE)
    const offset = (page - 1) * PER_PAGE

    const docs = await store.getDocsPaginated(offset, PER_PAGE)

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
        label: '( back to dimension menu )',
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
        const docTags = await store.getDocTags(selected)
        const tagLines =
            docTags.length > 0
                ? docTags.map((t) => `  · ${t.tag}`).join('\n')
                : '  (no tags)'
        note(`${detail}\n\nTags (${docTags.length}):\n${tagLines}`)

        if (docTags.length > 0) {
            const tagChoices = docTags.map((t) => ({
                value: t.id,
                label: t.tag,
                hint: '',
            }))
            tagChoices.push({
                value: '__back__',
                label: '( back )',
                hint: '',
            })

            const tagSel = await select({
                message: 'Select a tag to see details',
                options: tagChoices,
            })

            if (!tagSel || typeof tagSel !== 'string' || tagSel === '__back__')
                continue

            await showTagDetail(tagSel)
        }
    }
}

// ── Browse by Category ─────────────────────────────────────────────

async function browseCategories(): Promise<void> {
    const cats = await store.getCategoriesWithTagCount()

    if (cats.length === 0) {
        note('No categories in the library.')
        return
    }

    const choices = cats.map((c) => ({
        value: c.id,
        label: c.content,
        hint: `${c.tagCount} tag${c.tagCount === 1 ? '' : 's'}`,
    }))
    choices.push({
        value: '__back__',
        label: '( back to dimension menu )',
        hint: '',
    })

    while (true) {
        const selected = await select({
            message: `Categories (${cats.length})`,
            options: choices,
        })

        if (!selected || typeof selected !== 'string') return
        if (selected === '__back__') return

        const cat = cats.find((c) => c.id === selected)
        const tags = await store.getTagsByCategory(selected)
        const allTagCounts = await store.getTagsWithDocCount()
        const countMap = new Map(allTagCounts.map((t) => [t.id, t.docCount]))
        const tagInfos = tags.map((t) => ({
            ...t,
            docCount: countMap.get(t.id) ?? 0,
        }))

        const tagLines =
            tagInfos.length > 0
                ? tagInfos
                      .map(
                          (t) =>
                              `  · ${t.tag} (${t.docCount} doc${t.docCount === 1 ? '' : 's'})`
                      )
                      .join('\n')
                : '  (no tags)'

        note(
            `Category: ${cat?.content ?? ''}\nID: ${selected}\n\nTags (${tagInfos.length}):\n${tagLines}`
        )

        if (tagInfos.length > 0) {
            const tagChoices = tagInfos.map((t) => ({
                value: t.id,
                label: t.tag,
                hint: `${t.docCount} doc${t.docCount === 1 ? '' : 's'}`,
            }))
            tagChoices.push({
                value: '__back__',
                label: '( back )',
                hint: '',
            })

            const tagSel = await select({
                message: 'Select a tag to see details',
                options: tagChoices,
            })

            if (!tagSel || typeof tagSel !== 'string' || tagSel === '__back__')
                continue

            await showTagDetail(tagSel)
        }
    }
}

// ── Browse by Tag ──────────────────────────────────────────────────

async function showTagDetail(tagId: string): Promise<void> {
    const tagCategories = await store.getTagCategories(tagId)
    const docsForTag = await store.getDocsByTag(tagId)

    const catNames =
        tagCategories.length > 0
            ? tagCategories.map((c) => c.content).join(', ')
            : '(none)'

    const docLines =
        docsForTag.length > 0
            ? docsForTag
                  .map((d) => {
                      const meta = JSON.parse(d.metadata) as Record<
                          string,
                          unknown
                      >
                      const title = (meta.title as string) ?? d.id.slice(0, 8)
                      return `  · ${title}`
                  })
                  .join('\n')
            : '  (no docs)'

    note(`Categories: ${catNames}\n\nDocs (${docsForTag.length}):\n${docLines}`)

    if (docsForTag.length > 0) {
        const docChoices = docsForTag.map((d) => {
            const meta = JSON.parse(d.metadata) as Record<string, unknown>
            const title = (meta.title as string) ?? d.id.slice(0, 8)
            return {
                value: d.id,
                label: title.length > 50 ? `${title.slice(0, 50)}...` : title,
                hint: '',
            }
        })
        docChoices.push({
            value: '__back__',
            label: '( back )',
            hint: '',
        })

        const docSel = await select({
            message: 'Select a doc to see details',
            options: docChoices,
        })

        if (!docSel || typeof docSel !== 'string' || docSel === '__back__')
            return

        const detail = await formatDocDetail(docSel)
        note(detail)
    }
}

async function browseTagsPage(page: number): Promise<void> {
    const allTags = await store.getTagsWithDocCount()
    const total = allTags.length
    const totalPages = Math.ceil(total / PER_PAGE)
    const offset = (page - 1) * PER_PAGE
    const paged = allTags.slice(offset, offset + PER_PAGE)

    if (paged.length === 0) {
        note('No tags in the library.')
        return
    }

    const choices = paged.map((t) => ({
        value: t.id,
        label: t.tag.length > 48 ? `${t.tag.slice(0, 48)}...` : t.tag,
        hint: `${t.docCount} doc${t.docCount === 1 ? '' : 's'}`,
    }))

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
        label: '( back to dimension menu )',
        hint: '',
    })

    while (true) {
        const selected = await select({
            message: `Tags (${total} total, page ${page}/${totalPages})`,
            options: choices,
        })

        if (!selected || typeof selected !== 'string') return

        if (selected === '__back__') return
        if (selected === '__prev__') {
            if (page > 1) {
                await browseTagsPage(page - 1)
                return
            }
            continue
        }
        if (selected === '__next__') {
            if (page < totalPages) {
                await browseTagsPage(page + 1)
                return
            }
            continue
        }

        await showTagDetail(selected)
    }
}

// ── Top-level browse command ───────────────────────────────────────

export function register(program: Command) {
    program
        .command('browse')
        .alias('br')
        .description('browse the library by doc, category, or tag')
        .action(async () => {
            const config = await setupProjectModel()
            if (!config) {
                outro('Not in a vein project. Run "vein new" first.')
                return
            }

            intro('Browse Library')

            while (true) {
                const dim = await select({
                    message: 'Browse by which dimension?',
                    options: [
                        {
                            value: 'doc',
                            label: 'Documents',
                            hint: 'browse all documents',
                        },
                        {
                            value: 'category',
                            label: 'Categories',
                            hint: 'browse categories → tags → docs',
                        },
                        {
                            value: 'tag',
                            label: 'Tags',
                            hint: 'browse all tags → docs',
                        },
                        { value: 'exit', label: 'Exit', hint: '' },
                    ],
                })

                if (!dim || typeof dim !== 'string' || dim === 'exit') {
                    outro('Done')
                    return
                }

                if (dim === 'doc') {
                    await browseDocsPage(1)
                } else if (dim === 'category') {
                    await browseCategories()
                } else if (dim === 'tag') {
                    await browseTagsPage(1)
                }
            }
        })
}
