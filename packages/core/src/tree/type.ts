export type TreeNode<T> = {
    nodeId: string
    nodes: TreeNode<T>[]
    value: T
}

export type BaseDocNode = {
    title: string
    lineNum: number
    text: string
    summary?: string
    prefixSummary?: string
}

export type DocNode = TreeNode<BaseDocNode>
