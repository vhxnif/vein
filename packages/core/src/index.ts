// ── AI ──────────────────────────────────────────────────────────
export type { ContextDef, ToolDef } from './ai/base'
export {
    call,
    createSummarizer,
    getModelKey,
    getModelProvider,
    listModels,
    listProviders,
    setModelProvider,
} from './ai/base'
export type { LibrarianResult, Mode, TraceStep } from './ai/librarian'
export { librarian } from './ai/librarian'
export type { ReviewResult, SourceRef } from './ai/sub-agents/reviewer'
export { reviewer } from './ai/sub-agents/reviewer'
export type { SearchOptions, SearchResult } from './ai/tools'
export {
    resolveDocNames,
    searchDocsByKeyword,
    searchDocuments,
} from './ai/tools'
export { createCachedSummarizer } from './config/cached-summarizer'
// ── Global registry ─────────────────────────────────────────────
export type { GlobalProjects } from './config/global'
export {
    getProjectPath,
    loadGlobalProjects,
    registerProject,
    unregisterProject,
} from './config/global'
// ── Config ──────────────────────────────────────────────────────
export {
    APP_NAME,
    getProjectRoot,
    initProject,
    loadProjectConfig,
    logger,
    resolveProjectRoot,
    saveProjectConfig,
    setProjectOverride,
    setupProjectModel,
    veinDir,
} from './config/index'
export type { ModelProvider, ProjectConfig } from './config/type'
export type { HistoryEntry } from './service/history.service'
export {
    getSearchHistoryEntry,
    listSearchHistory,
    saveSearchHistory,
} from './service/history.service'
// ── Service ─────────────────────────────────────────────────────
export type {
    FailedResult,
    ImportedResult,
    ImportResult,
    ResegmentResult,
    SkippedResult,
} from './service/import.service'
export {
    collectAllSummaries,
    importBatch,
    resegmentAllDocuments,
} from './service/import.service'

// ── Store ───────────────────────────────────────────────────────
export {
    deleteDoc,
    deleteTree,
    getAllDocs,
    getAncestors,
    getCachedResponse,
    getDoc,
    getDocCount,
    getDocFtsSummary,
    getDocsPaginated,
    getDocumentDetail,
    getFullTree,
    getNodeDetails,
    getSiblings,
    getSubTree,
    insertDoc,
    insertTree,
    listDocuments,
    purgeModelCache,
    setCachedResponse,
    updateDocFts,
    updateDocMetadata,
} from './store/index'
export { runMigrations } from './store/migrate'

// ── Tree ────────────────────────────────────────────────────────
export { mdToTree, renderDocOutline } from './tree/markdown_split'
export type { BaseDocNode, DocNode, TreeNode } from './tree/type'

// ── Utils ───────────────────────────────────────────────────────
export { getErrorMessage, hash, md5, uuid } from './utils/common'
export { segmentText } from './utils/segment'
