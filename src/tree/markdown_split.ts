import { logger } from '../config'
import type { BaseDocNode, DocNode } from './type'

const log = logger.child({ module: 'markdown_split' })

// ── Types ──────────────────────────────────────────────────────
type RawHeaderNode = {
    nodeTitle: string
    lineNum: number
}

type FlatNode = BaseDocNode & {
    level: number
    summary?: string
    prefixSummary?: string
    textTokenCount?: number
}

type Thinning = {
    minTokenThreshold: number
}

type AsyncFun<T> = (s: T) => Promise<T>

type Summarizer = AsyncFun<string>

type Summary = {
    summaryTokenThreshold?: number
    summarizer: Summarizer
}

type TokenCalculator = (s: string) => Promise<number>

type MdToTreeOptions = {
    thinning?: Thinning
    summary?: Summary
    tokenCalculator?: TokenCalculator
}

async function countTokens(
    text: string,
    tokenCalcultor?: TokenCalculator
): Promise<number> {
    if (!text) return 0
    return tokenCalcultor
        ? await tokenCalcultor(text)
        : Math.ceil(text.length / 4)
}

// ── Shared utilities ───────────────────────────────────────────

function findAllChildren(
    nodeList: FlatNode[],
    parentIndex: number,
    parentLevel: number
): number[] {
    const children: number[] = []
    for (let i = parentIndex + 1; i < nodeList.length; i++) {
        if (nodeList[i]!.level <= parentLevel) break
        children.push(i)
    }
    return children
}

// function reorderDict<T extends Record<string, unknown>>(
//     data: T,
//     keyOrder: string[]
// ): Partial<T> {
//     const result: Record<string, unknown> = {}
//     for (const key of keyOrder) {
//         if (key in data) {
//             result[key] = data[key]
//         }
//     }
//     return result as Partial<T>
// }

function createRootNode(
    docId: string,
    docName: string,
    lineCount: number,
    children: DocNode[],
    summary?: string
): DocNode {
    const value: BaseDocNode = {
        title: docName,
        lineNum: lineCount,
        text: '',
    }
    if (summary !== undefined) {
        value.summary = summary
    }
    return {
        nodeId: `0000_${docId}`,
        value,
        nodes: children,
    }
}

// ── Markdown parsing ───────────────────────────────────────────

function extractNodesFromMarkdown(markdownContent: string): {
    nodeList: RawHeaderNode[]
    lines: string[]
} {
    const headerPattern = /^(#{1,6})\s+(.+)$/
    const codeBlockPattern = /^```/

    const lines = markdownContent.split('\n')
    const nodeList: RawHeaderNode[] = []
    let inCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1
        const stripped = lines[i]!.trim()

        if (codeBlockPattern.test(stripped)) {
            inCodeBlock = !inCodeBlock
            continue
        }

        if (!stripped) continue

        if (!inCodeBlock) {
            const match = stripped.match(headerPattern)
            if (match) {
                const title = match[2]!.trim()
                nodeList.push({ nodeTitle: title, lineNum })
            }
        }
    }

    return { nodeList, lines }
}

function extractNodeTextContent(
    nodeList: RawHeaderNode[],
    markdownLines: string[]
): FlatNode[] {
    const allNodes: FlatNode[] = []

    for (const { nodeTitle, lineNum } of nodeList) {
        const lineContent = markdownLines[lineNum - 1]!
        const headerMatch = lineContent.match(/^(#{1,6})/)

        if (!headerMatch) {
            log.warn(
                `Warning: Line ${lineNum} does not contain a valid header: '${lineContent}'`
            )
            continue
        }

        allNodes.push({
            title: nodeTitle,
            lineNum,
            level: headerMatch[1]!.length,
            text: '',
        })
    }

    for (let i = 0; i < allNodes.length; i++) {
        const n = allNodes[i]!
        const startLine = n.lineNum - 1
        const endLine =
            i + 1 < allNodes.length
                ? allNodes[i + 1]!.lineNum - 1
                : markdownLines.length
        n.text = markdownLines.slice(startLine, endLine).join('\n').trim()
    }

    return allNodes
}

// ── Token counting & thinning ──────────────────────────────────

async function updateNodeListWithTextTokenCount(
    nodeList: FlatNode[],
    tokenCalculator?: TokenCalculator
): Promise<FlatNode[]> {
    const result = nodeList.slice()

    for (let i = result.length - 1; i >= 0; i--) {
        const currentLevel = result[i]!.level
        const childrenIndices = findAllChildren(result, i, currentLevel)

        let totalText = result[i]!.text
        for (const childIdx of childrenIndices) {
            const childText = result[childIdx]!.text
            if (childText) {
                totalText += `\n${childText}`
            }
        }

        result[i]!.textTokenCount = await countTokens(
            totalText,
            tokenCalculator
        )
    }

    return result
}

async function treeThinningForIndex(
    nodeList: FlatNode[],
    minNodeToken: number | undefined,
    tokenCalculator?: TokenCalculator
): Promise<FlatNode[]> {
    if (minNodeToken === undefined) return nodeList

    const result = nodeList.slice()
    const nodesToRemove = new Set<number>()

    for (let i = result.length - 1; i >= 0; i--) {
        if (nodesToRemove.has(i)) continue

        const currentNode = result[i]!
        const totalTokens = currentNode.textTokenCount ?? 0

        if (totalTokens < minNodeToken) {
            const childrenIndices = findAllChildren(
                result,
                i,
                currentNode.level
            )

            const childrenTexts: string[] = []
            for (const childIdx of childrenIndices.sort((a, b) => a - b)) {
                if (!nodesToRemove.has(childIdx)) {
                    const childText = result[childIdx]!.text
                    if (childText.trim()) {
                        childrenTexts.push(childText)
                    }
                    nodesToRemove.add(childIdx)
                }
            }

            if (childrenTexts.length > 0) {
                let mergedText = currentNode.text
                for (const childText of childrenTexts) {
                    if (mergedText && !mergedText.endsWith('\n')) {
                        mergedText += '\n\n'
                    }
                    mergedText += childText
                }
                result[i]!.text = mergedText
                result[i]!.textTokenCount = await countTokens(
                    mergedText,
                    tokenCalculator
                )
            }
        }
    }

    const sortedToRemove = [...nodesToRemove].sort((a, b) => b - a)
    for (const idx of sortedToRemove) {
        result.splice(idx, 1)
    }

    return result
}

// ── Tree building & formatting ─────────────────────────────────

function buildTreeFromNodes(nodeList: FlatNode[], docId: string): DocNode[] {
    if (nodeList.length === 0) return []

    const stack: { node: DocNode; level: number }[] = []
    const rootNodes: DocNode[] = []
    let nodeCounter = 1

    for (const { title, text, lineNum, level } of nodeList) {
        const treeNode: DocNode = {
            nodeId: `${String(nodeCounter).padStart(4, '0')}_${docId}`,
            value: { title, text, lineNum },
            nodes: [],
        }
        nodeCounter++

        while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
            stack.pop()
        }

        if (stack.length === 0) {
            rootNodes.push(treeNode)
        } else {
            stack[stack.length - 1]!.node.nodes.push(treeNode)
        }

        stack.push({ node: treeNode, level })
    }

    return rootNodes
}

// function assignNodeIds(
//     docId: string,
//     data: DocNode[],
//     startId: number = 1
// ): void {
//     let counter = startId

//     function traverse(nodes: DocNode[]): void {
//         for (const node of nodes) {
//             node.nodeId = `${String(counter).padStart(4, '0')}_${docId}`
//             counter++
//             if (node.nodes.length > 0) {
//                 traverse(node.nodes)
//             }
//         }
//     }

//     traverse(data)
// }

// function formatStructure(
//     structure: DocNode[],
//     valueKeyOrder: string[]
// ): DocNode[] {
//     return structure.map((node) => {
//         const formatted: Record<string, unknown> = {}
//         formatted.nodeId = node.nodeId
//         formatted.value = reorderDict(
//             node.value as unknown as Record<string, unknown>,
//             valueKeyOrder
//         )
//         if (node.nodes.length > 0) {
//             formatted.nodes = formatStructure(node.nodes, valueKeyOrder)
//         }
//         return formatted as unknown as DocNode
//     })
// }

// ── LLM helpers ────────────────────────────────────────────────

async function getNodeSummary(
    node: DocNode,
    summary: Summary,
    tokenCalculator?: TokenCalculator
): Promise<string> {
    const { summaryTokenThreshold = 200, summarizer } = summary

    const nodeText = node.value.text ?? ''
    const numTokens = await countTokens(nodeText, tokenCalculator)
    if (numTokens < summaryTokenThreshold) {
        return nodeText
    }
    return await generateNodeSummary(node, summarizer)
}

async function generateNodeSummary(
    node: DocNode,
    summarizer: Summarizer
): Promise<string> {
    const prompt = `You are given a part of a document, your task is to generate a description of the partial document about what are main points covered in the partial document.

    Partial Document Text: ${node.value.text}

    Directly return the description, do not include any other text.
    `
    return await summarizer(prompt)
}

function structureToList(structure: DocNode[]): DocNode[] {
    const result: DocNode[] = []
    for (const node of structure) {
        result.push(node)
        if (node.nodes.length > 0) {
            result.push(...structureToList(node.nodes))
        }
    }
    return result
}

async function enrichStructureWithSummaries(
    structure: DocNode[],
    summary: Summary,
    tokenCalculator?: TokenCalculator
): Promise<DocNode[]> {
    const nodes = structureToList(structure)
    const summaries = await Promise.all(
        nodes.map((node) => getNodeSummary(node, summary, tokenCalculator))
    )
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]!.nodes.length === 0) {
            nodes[i]!.value.summary = summaries[i]!
        } else {
            nodes[i]!.value.prefixSummary = summaries[i]!
        }
    }
    return structure
}

function createCleanStructureForDescription(structure: DocNode[]): unknown[] {
    return structure.map((node) => {
        const clean: Record<string, unknown> = {}
        clean.nodeId = node.nodeId
        const value = node.value as unknown as Record<string, unknown>
        for (const key of ['title', 'summary', 'prefixSummary']) {
            if (key in value) {
                clean[key] = value[key]
            }
        }
        if (node.nodes.length > 0) {
            clean.nodes = createCleanStructureForDescription(node.nodes)
        }
        return clean
    })
}

async function generateDocDescription(
    structure: DocNode[],
    summarizer: Summarizer
): Promise<string> {
    const prompt = `Your are an expert in generating descriptions for a document.
    You are given a structure of a document. Your task is to generate a one-sentence description for the document, which makes it easy to distinguish the document from other documents.

    Document Structure: ${JSON.stringify(structure)}

    Directly return the description, do not include any other text.
    `
    return await summarizer(prompt)
}

async function doThinning(
    nodesWithContent: FlatNode[],
    minTokenThreshold: number,
    tokenCalculator?: TokenCalculator
): Promise<FlatNode[]> {
    return treeThinningForIndex(
        await updateNodeListWithTextTokenCount(
            nodesWithContent,
            tokenCalculator
        ),
        minTokenThreshold
    )
}

async function doSummary(
    docId: string,
    treeStructure: DocNode[],
    summary: Summary,
    tokenCalculator?: TokenCalculator
) {
    log.info({
        docId,
        content: 'Generating summaries for each node...',
    })
    const tree = await enrichStructureWithSummaries(
        treeStructure,
        summary,
        tokenCalculator
    )
    log.info({
        docId,
        content: 'Generating document description...',
    })
    const docDescription = await generateDocDescription(
        createCleanStructureForDescription(tree) as DocNode[],
        summary.summarizer
    )
    return {
        tree,
        docDescription,
    }
}

// ── Structure outline for tagger ──────────────────────────────

function renderDocOutline(tree: DocNode, indent = 0): string {
    const pad = '  '.repeat(indent)
    const lines: string[] = []
    for (const node of tree.nodes) {
        lines.push(`${pad}- ${node.value.title}`)
        if (node.nodes.length > 0) {
            lines.push(renderDocOutline(node, indent + 1))
        }
    }
    return lines.join('\n')
}

// ── Main pipeline ──────────────────────────────────────────────

async function mdToTree(
    docId: string,
    docName: string,
    content: string,
    options: MdToTreeOptions = {}
): Promise<DocNode> {
    const { thinning, summary } = options

    // const markdownContent = await fs.readFile(mdPath, "utf-8");
    const lineCount = content.split('\n').length

    // Phase 1: Parse
    log.debug({ docId, content: 'Extracting nodes from markdown...' })
    const { nodeList, lines } = extractNodesFromMarkdown(content)

    if (nodeList.length === 0) {
        log.warn({
            docId,
            docName,
            content:
                'No headings found in markdown — no structure extracted. Skipping summary & tagging.',
        })
        return createRootNode(docId, docName, lineCount, [])
    }

    log.debug({ docId, content: 'Extracting text content from nodes...' })
    let nodesWithContent = extractNodeTextContent(nodeList, lines)

    // Phase 2: Thinning (optional)
    if (thinning?.minTokenThreshold) {
        log.debug({ docId, content: 'Thinning nodes...' })
        nodesWithContent = await doThinning(
            nodesWithContent,
            thinning.minTokenThreshold
        )
    }

    // Phase 3: Build tree
    log.debug({ docId, content: 'Building tree from nodes...' })
    const treeStructure = buildTreeFromNodes(nodesWithContent, docId)

    // Phase 4: Post-processing (formatting, summaries, description)
    log.debug({ docId, content: 'Formatting tree structure...' })

    if (!summary) {
        log.debug({ docId, content: 'Tree structure built' })
        return createRootNode(docId, docName, lineCount, treeStructure)
    }
    log.debug({ docId, content: 'Summary structure...' })
    const { tree, docDescription } = await doSummary(
        docId,
        treeStructure,
        summary
    )
    log.debug({ docId, content: 'Tree structure built' })
    return createRootNode(docId, docName, lineCount, tree, docDescription)
}

export { mdToTree, renderDocOutline }
