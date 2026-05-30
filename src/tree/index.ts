import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as store from '../store'
import { md5 } from '../utils/common'

const docPath = 'd:/tmp/tmp_doc/java_gc.md'
const _docName = path.basename(docPath)
const content = await readFile(docPath, 'utf-8')
const docId = md5(content)

// const st: DocNode = await mdToTree(docId, docName, content, {
//     summary: {
//         summarizer: call,
//     },
// })

// await writeFile('d:/tmp/tmp_doc/java_st.json', JSON.stringify(st), 'utf-8')

// store.insertTree([st], docId)

// const test = await store.getSiblings(`0000_${docId}`)
const test = await store.getFullTree(`${docId}`)
// const test = await store.getSubTree(`0000_${docId}`)
await writeFile('d:/tmp/tmp_doc/java_st.json', JSON.stringify(test), 'utf-8')
