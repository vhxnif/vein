// ── AI ──────────────────────────────────────────────────────────
export type { ContextDef, ToolDef } from './ai/base.ts'
export {
    call,
    createSummarizer,
    getModelKey,
    getModelProvider,
    listModels,
    listProviders,
    setModelProvider,
} from './ai/base.ts'
export type { LibrarianResult, TraceStep } from './ai/librarian.ts'
export { librarian } from './ai/librarian.ts'
export type { ReviewResult, SourceRef } from './ai/sub-agents/reviewer.ts'
export { reviewer } from './ai/sub-agents/reviewer.ts'
export type { SearchOptions, SearchResult } from './ai/tools.ts'
export {
    resolveDocNames,
    searchDocuments,
} from './ai/tools.ts'
export { createCachedSummarizer } from './config/cached-summarizer.ts'
// ── Global registry ─────────────────────────────────────────────
export type { GlobalProjects } from './config/global.ts'
export {
    getProjectPath,
    loadGlobalProjects,
    registerProject,
    unregisterProject,
} from './config/global.ts'
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
} from './config/index.ts'
export type { ModelProvider, ProjectConfig } from './config/type.ts'
export type {
    HistoryEntry,
    HistoryTimelineBlock,
} from './service/history.service.ts'
export {
    getSearchHistoryEntry,
    listSearchHistory,
    saveSearchHistory,
} from './service/history.service.ts'
// ── Service ─────────────────────────────────────────────────────
export type {
    FailedResult,
    ImportedResult,
    ImportResult,
    ResegmentResult,
    SkippedResult,
} from './service/import.service.ts'
export {
    collectAllSummaries,
    importBatch,
    resegmentAllDocuments,
} from './service/import.service.ts'

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
} from './store/index.ts'
export { runMigrations } from './store/migrate.ts'

// ── Tree ────────────────────────────────────────────────────────
export { mdToTree, renderDocOutline } from './tree/markdown_split.ts'
export type { BaseDocNode, DocNode, TreeNode } from './tree/type.ts'

// ── Utils ───────────────────────────────────────────────────────
export { getErrorMessage, hash, md5, uuid } from './utils/common.ts'
export { segmentText } from './utils/segment.ts'
