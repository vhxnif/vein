import { createElement, type ReactNode, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { DocTooltipContent } from '../components/DocTooltipContent.tsx'
import {
    annotateRefs,
    Markdown,
    resolveDocId,
} from '../components/Markdown.tsx'
import { NodeTooltipContent } from '../components/NodeTooltipContent.tsx'
import type { SharedTimelineBlock } from '../components/TimelineBlockView.tsx'
import { TimelineBlockView } from '../components/TimelineBlockView.tsx'
import type { DocInfo, NodeInfo } from './api.ts'
import { fetchDocument, fetchNode } from './api.ts'

// ── Types ──────────────────────────────────────────────────────

export interface ExportOptions {
    query: string
    /** Raw markdown content (before annotateNodeRefs) */
    content: string
    /** Maps short docId (first 8 chars) → full docId for node reference lookup */
    docIdMap?: Map<string, string>
    review?: {
        verdict: string
        score: number
        reason: string
    }
    reviewElapsedMs?: number
    timeline?: SharedTimelineBlock[]
    elapsedMs: number
    mode: string
    project?: string | null
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Generate a self-contained HTML file by rendering the actual React components
 * (Markdown, TimelineBlockView) into a hidden DOM node, capturing the HTML + all
 * page CSS, and embedding both. This guarantees visual fidelity with the web app.
 */
export async function exportResultAsHtml(
    options: ExportOptions
): Promise<void> {
    const {
        query,
        content,
        docIdMap,
        review,
        reviewElapsedMs,
        timeline,
        elapsedMs,
        mode,
        project,
    } = options

    // 1. Build the list of process blocks (exclude last text block for ask results)
    const processBlocks = buildProcessBlocks(timeline)

    // 2. Render content to a hidden DOM node via React
    const capturedHtml = renderToHtml(
        createElement(ExportPreview, {
            query,
            content,
            docIdMap,
            review,
            reviewElapsedMs,
            processBlocks,
            elapsedMs,
            mode,
            project,
        })
    )

    // 3. Collect all CSS from the current page (Tailwind + Kami component styles)
    const css = await collectAllCss()

    // 4. Extract node and doc references from the ANNOTATED content for tooltip data.
    //    Must use annotated content because the raw markdown may contain bare
    //    (unbracketed) references that extractRefs doesn't handle directly.
    const annotatedContent = annotateRefs(content, docIdMap)
    const { nodeRefs, docRefs } = extractRefs(annotatedContent, docIdMap)
    const [nodeDataMap, docDataMap] = await Promise.all([
        fetchNodeData(nodeRefs),
        fetchDocData(docRefs),
    ])

    // 5. Build the full HTML document
    const fullHtml = buildHtmlDocument({
        query,
        capturedHtml,
        css,
        nodeDataMap,
        docDataMap,
        review,
        reviewElapsedMs,
        elapsedMs,
        mode,
        project,
    })

    // 6. Trigger download
    downloadHtml(fullHtml, project ?? 'vein')
}

// ── Process blocks helper ──────────────────────────────────────

function buildProcessBlocks(
    timeline?: SharedTimelineBlock[]
): SharedTimelineBlock[] {
    if (!timeline || timeline.length === 0) return []
    const last = timeline.at(-1)
    if (last?.type === 'text') return timeline.slice(0, -1)
    return timeline
}

// ── React → HTML rendering ─────────────────────────────────────

/**
 * Render a React element into a hidden DOM node, capture its innerHTML,
 * then clean up. Uses flushSync for synchronous rendering.
 */
function renderToHtml(element: ReactNode): string {
    const container = document.createElement('div')
    container.style.cssText =
        'position:fixed;left:-9999px;top:0;width:780px;visibility:hidden;'
    document.body.appendChild(container)

    const root = createRoot(container)
    try {
        flushSync(() => {
            root.render(element)
        })
        // Allow CSS animations/transitions to be skipped (they're hidden anyway)
        const html = container.innerHTML
        return html
    } finally {
        root.unmount()
        document.body.removeChild(container)
    }
}

// ── CSS collection ─────────────────────────────────────────────

/**
 * Collect all CSS from the current page: inline <style> tags + linked stylesheets.
 * This captures the compiled Tailwind output + Kami component styles.
 */
async function collectAllCss(): Promise<string> {
    const parts: string[] = []

    // Inline <style> tags
    for (const style of document.querySelectorAll('style')) {
        const text = style.textContent
        if (text) parts.push(text)
    }

    // Linked stylesheets
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const href = link.getAttribute('href')
        if (!href) continue
        try {
            const res = await fetch(href)
            if (res.ok) {
                parts.push(await res.text())
            }
        } catch {
            // Ignore fetch errors (CORS, etc.)
        }
    }

    return parts.join('\n')
}

// ── Export preview component ───────────────────────────────────

interface ExportPreviewProps {
    query: string
    content: string
    docIdMap?: Map<string, string>
    review?: { verdict: string; score: number; reason: string }
    reviewElapsedMs?: number
    processBlocks: SharedTimelineBlock[]
    elapsedMs: number
    mode: string
    project?: string | null
}

function ExportPreview({
    query,
    content,
    docIdMap,
    review,
    reviewElapsedMs,
    processBlocks,
    elapsedMs,
    mode,
    project,
}: ExportPreviewProps) {
    const annotatedContent = useMemo(
        () => annotateRefs(content, docIdMap),
        [content, docIdMap]
    )

    const hasProcessContent = processBlocks.length > 0
    const toolCount = processBlocks.filter((b) => b.type === 'tool').length
    const hasThinking = processBlocks.some((b) => b.type === 'thinking')

    let reasoningLabel = `Reasoning process (${toolCount} tool${toolCount !== 1 ? 's' : ''}`
    if (hasThinking) reasoningLabel += ', thinking'
    reasoningLabel += ')'

    return createElement(
        'div',
        {
            style: {
                maxWidth: '780px',
                margin: '0 auto',
                padding: '64px 32px',
                fontFamily: 'var(--serif)',
                backgroundColor: 'var(--parchment)',
                color: 'var(--near-black)',
            },
        },
        project &&
            createElement(
                'div',
                {
                    className:
                        'font-sans text-[8pt] text-stone text-center mb-6',
                },
                project
            ),
        createElement(
            'div',
            {
                className:
                    'font-serif text-[11pt] italic text-olive text-center mb-10 leading-snug',
            },
            '\u201C',
            query,
            '\u201D'
        ),
        // Reasoning process
        hasProcessContent &&
            createElement(
                'details',
                { className: 'mb-6' },
                createElement(
                    'summary',
                    {
                        className:
                            'font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide cursor-pointer select-none hover:text-ink transition-colors',
                    },
                    reasoningLabel
                ),
                createElement(
                    'div',
                    {
                        className:
                            'mt-3 pl-4 border-l-2 border-cream space-y-1',
                    },
                    ...processBlocks.map((block, i) =>
                        createElement(TimelineBlockView, {
                            key: i,
                            block,
                            docIdMap,
                        })
                    )
                )
            ),
        // Final answer
        createElement(Markdown, {
            docIdMap,
            // biome-ignore lint/correctness/noChildrenProp: canonical 3rd-arg conflicts with TS overload
            children: annotatedContent,
        }),
        // Review
        review &&
            createElement(
                'div',
                {
                    className:
                        'mt-10 pt-5 border-t border-cream flex items-start gap-8',
                },
                createElement(
                    'div',
                    null,
                    createElement(
                        'p',
                        {
                            className:
                                'font-sans text-[7.5pt] font-semibold text-stone uppercase tracking-wide mb-1',
                        },
                        'Review'
                    ),
                    createElement(
                        'p',
                        {
                            className: `font-sans text-[8.5pt] font-medium ${
                                review.verdict === 'pass'
                                    ? 'text-ink'
                                    : review.verdict === 'partial'
                                      ? 'text-error'
                                      : 'text-stone'
                            }`,
                        },
                        `${review.verdict} (${review.score}/5)${
                            reviewElapsedMs !== undefined
                                ? ` \u00B7 ${(reviewElapsedMs / 1000).toFixed(1)}s`
                                : ''
                        }`
                    )
                ),
                createElement(
                    'p',
                    {
                        className:
                            'font-sans text-[8.5pt] text-stone leading-relaxed flex-1',
                    },
                    review.reason
                )
            ),
        // Meta line
        createElement(
            'div',
            {
                className:
                    'mt-6 flex items-center gap-4 font-sans text-[8pt] text-stone',
            },
            createElement('span', null, `${(elapsedMs / 1000).toFixed(1)}s`),
            mode === 'review' &&
                createElement(
                    'span',
                    {
                        className: `inline-block px-[12pt] py-[2pt] rounded-full font-sans text-[7.5pt] font-medium bg-ink/10 text-ink`,
                    },
                    'Review'
                )
        )
    )
}

// ── Reference extraction ───────────────────────────────────────

interface NodeRef {
    fullDocId: string
    nodeId: string
}

interface DocRef {
    fullDocId: string
}

/**
 * Find all node:// and doc:// references in annotated markdown content.
 */
function extractRefs(
    content: string,
    docIdMap?: Map<string, string>
): { nodeRefs: NodeRef[]; docRefs: DocRef[] } {
    const seenNodes = new Set<string>()
    const seenDocs = new Set<string>()
    const nodeRefs: NodeRef[] = []
    const docRefs: DocRef[] = []

    // Match markdown links with node:// protocol.
    const nodeRe = /\[.*?\]\(node:\/\/([a-f0-9]+)\/(\d+)\)/g
    let m: RegExpExecArray | null
    m = nodeRe.exec(content)
    while (m !== null) {
        const rawDocId = m[1] ?? ''
        const fullDocId = resolveDocId(rawDocId, docIdMap)
        const nodeId = m[2] ?? ''
        const key = `${fullDocId}:${nodeId}`
        if (!seenNodes.has(key)) {
            seenNodes.add(key)
            nodeRefs.push({ fullDocId, nodeId })
        }
        m = nodeRe.exec(content)
    }

    // Also match bare `[XXXXXXXX:YYYY]` patterns (safety net for node refs).
    const bareNodeRe = /\[([a-f0-9]{8,}):(\d{2,5})\](?!\()/g
    m = bareNodeRe.exec(content)
    while (m !== null) {
        const rawDocId = m[1] ?? ''
        const nodeId = m[2] ?? ''
        const fullDocId = resolveDocId(rawDocId, docIdMap)
        const key = `${fullDocId}:${nodeId}`
        if (!seenNodes.has(key)) {
            seenNodes.add(key)
            nodeRefs.push({ fullDocId, nodeId })
        }
        m = bareNodeRe.exec(content)
    }

    // Match markdown links with doc:// protocol.
    const docRe = /\[.*?\]\(doc:\/\/([a-f0-9]+)\)/g
    m = docRe.exec(content)
    while (m !== null) {
        const rawDocId = m[1] ?? ''
        const fullDocId = resolveDocId(rawDocId, docIdMap)
        if (!seenDocs.has(fullDocId)) {
            seenDocs.add(fullDocId)
            docRefs.push({ fullDocId })
        }
        m = docRe.exec(content)
    }

    // Also match bare `[XXXXXXXX]` patterns (safety net for doc refs).
    const bareDocRe = /\[([a-f0-9]{8,})\](?!\()/g
    m = bareDocRe.exec(content)
    while (m !== null) {
        const rawDocId = m[1] ?? ''
        const fullDocId = resolveDocId(rawDocId, docIdMap)
        if (!seenDocs.has(fullDocId)) {
            seenDocs.add(fullDocId)
            docRefs.push({ fullDocId })
        }
        m = bareDocRe.exec(content)
    }

    return { nodeRefs, docRefs }
}

// ── Node data fetching ─────────────────────────────────────────

async function fetchNodeData(refs: NodeRef[]): Promise<
    Map<
        string,
        NodeInfo & {
            /** Pre-rendered HTML of the complete tooltip content (header + body) */
            tooltipHtml: string
            shortNodeId: string
        }
    >
> {
    const map = new Map<
        string,
        NodeInfo & {
            tooltipHtml: string
            shortNodeId: string
        }
    >()

    if (refs.length === 0) return map

    // 1. Fetch all nodes from API in parallel
    const apiResults = await Promise.allSettled(
        refs.map(async (ref) => {
            const key = `${ref.fullDocId}:${ref.nodeId}`
            const data = await fetchNode(ref.fullDocId, ref.nodeId)
            return { key, ref, data }
        })
    )

    // 2. Store fetched data (without tooltipHtml yet)
    const toRender: { key: string; nodeId: string; data: NodeInfo }[] = []
    for (const result of apiResults) {
        if (result.status === 'fulfilled') {
            const { key, ref, data } = result.value
            map.set(key, {
                ...data,
                shortNodeId: ref.nodeId,
                tooltipHtml: '',
            })
            toRender.push({ key, nodeId: ref.nodeId, data })
        }
    }

    // 3. Pre-render tooltip content using the EXACT same NodeTooltipContent
    //    component used by the web hover tooltip — guaranteeing visual fidelity
    if (toRender.length > 0) {
        const container = document.createElement('div')
        container.style.cssText =
            'position:fixed;left:-9999px;top:0;width:420px;visibility:hidden;'
        document.body.appendChild(container)
        const root = createRoot(container)

        for (const { key, nodeId, data } of toRender) {
            try {
                flushSync(() => {
                    root.render(
                        createElement(NodeTooltipContent, {
                            nodeId,
                            node: data,
                        })
                    )
                })
                const entry = map.get(key)
                if (entry) {
                    map.set(key, { ...entry, tooltipHtml: container.innerHTML })
                }
            } catch {
                // Fallback: plain escaped text summary
                const entry = map.get(key)
                if (entry) {
                    const fallback = `<p>${escapeHtml(data.summary || data.text || '').slice(0, 500)}</p>`
                    map.set(key, { ...entry, tooltipHtml: fallback })
                }
            }
        }

        root.unmount()
        document.body.removeChild(container)
    }

    return map
}

// ── Doc data fetching ─────────────────────────────────────────

async function fetchDocData(refs: DocRef[]): Promise<
    Map<
        string,
        DocInfo & {
            tooltipHtml: string
        }
    >
> {
    const map = new Map<
        string,
        DocInfo & {
            tooltipHtml: string
        }
    >()

    if (refs.length === 0) return map

    const apiResults = await Promise.allSettled(
        refs.map(async (ref) => {
            const data = await fetchDocument(ref.fullDocId)
            return { ref, data }
        })
    )

    const toRender: { key: string; data: DocInfo }[] = []
    for (const result of apiResults) {
        if (result.status === 'fulfilled') {
            const { ref, data } = result.value
            map.set(ref.fullDocId, { ...data, tooltipHtml: '' })
            toRender.push({ key: ref.fullDocId, data })
        }
    }

    if (toRender.length > 0) {
        const container = document.createElement('div')
        container.style.cssText =
            'position:fixed;left:-9999px;top:0;width:420px;visibility:hidden;'
        document.body.appendChild(container)
        const root = createRoot(container)

        for (const { key, data } of toRender) {
            try {
                flushSync(() => {
                    root.render(
                        createElement(DocTooltipContent, {
                            fullDocId: key,
                            doc: data,
                        })
                    )
                })
                const entry = map.get(key)
                if (entry) {
                    map.set(key, {
                        ...entry,
                        tooltipHtml: container.innerHTML,
                    })
                }
            } catch {
                const entry = map.get(key)
                if (entry) {
                    const fallback = `<p>${escapeHtml(data.ftsSummary || data.title || '').slice(0, 500)}</p>`
                    map.set(key, { ...entry, tooltipHtml: fallback })
                }
            }
        }

        root.unmount()
        document.body.removeChild(container)
    }

    return map
}

// ── HTML document builder ──────────────────────────────────────

function buildHtmlDocument(opts: {
    query: string
    capturedHtml: string
    css: string
    nodeDataMap: Map<
        string,
        NodeInfo & {
            tooltipHtml: string
            shortNodeId: string
        }
    >
    docDataMap: Map<
        string,
        DocInfo & {
            tooltipHtml: string
        }
    >
    review?: { verdict: string; score: number; reason: string }
    reviewElapsedMs?: number
    elapsedMs: number
    mode: string
    project?: string | null
}): string {
    const { query, capturedHtml, css, nodeDataMap, docDataMap } = opts

    const title = `Vein: ${query.slice(0, 60)}${query.length > 60 ? '\u2026' : ''}`

    // Serialize node data: keyed by "fullDocId:shortNodeId" for tooltip lookup.
    const nodeDataJson = JSON.stringify(
        Object.fromEntries(
            [...nodeDataMap].map(([key, node]) => [
                key,
                {
                    nodeId: node.shortNodeId,
                    tooltipHtml: node.tooltipHtml,
                },
            ])
        )
    )

    // Serialize doc data: keyed by fullDocId.
    const docDataJson = JSON.stringify(
        Object.fromEntries(
            [...docDataMap].map(([key, doc]) => [
                key,
                { tooltipHtml: doc.tooltipHtml },
            ])
        )
    )

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
/* ── Collected page CSS ─────────────────────────────── */
${css}

/* ── Override: dim paper texture for export readability ── */
body::before { opacity: 0.015 !important; }

/* ── Reference citations (for tooltip JS) ─────────── */
[data-doc-id] {
  cursor: pointer;
  border-bottom: 1px dashed rgba(27,54,93,0.3);
  color: var(--color-ink, #1b365d);
  border-radius: 2px;
  padding: 0 1px;
  transition: background-color 0.15s ease;
}
[data-doc-id]:hover {
  background-color: rgba(27,54,93,0.08);
  border-bottom-color: var(--color-ink, #1b365d);
}

/* ── Hide interactive-only elements ────────────────── */
[data-doc-id] + span { display: none !important; }
</style>
</head>
<body>
<script type="application/json" id="node-data">${nodeDataJson}</script>
<script type="application/json" id="doc-data">${docDataJson}</script>

${capturedHtml}

<div id="ref-tooltip" class="fixed z-50 max-h-[280px] overflow-y-auto kami-scrollbar bg-parchment border border-ink/20 rounded-[8pt] shadow-lg p-4" style="display:none"></div>

<script>
(function() {
  var nodeData = JSON.parse(document.getElementById('node-data').textContent);
  var docData = JSON.parse(document.getElementById('doc-data').textContent);
  var tooltip = document.getElementById('ref-tooltip');
  var hideTimer = null;
  var activeRef = null;

  function positionTooltip(ref) {
    var rect = ref.getBoundingClientRect();
    var w = Math.min(420, window.innerWidth - 16);
    var left = Math.min(Math.max(rect.left, 8), window.innerWidth - w - 8);
    var top = rect.bottom + 4;
    if (top + 280 > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 280 - 4);
    }
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.width = w + 'px';
  }

  document.addEventListener('mouseover', function(e) {
    var ref = e.target.closest ? e.target.closest('[data-doc-id]') : null;
    if (!ref || ref === activeRef) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    activeRef = ref;
    var docId = ref.getAttribute('data-doc-id') || '';
    var nodeId = ref.getAttribute('data-node-id') || '';
    // Try node ref first (key: docId:nodeId), then doc ref (key: docId)
    var entry = nodeId ? nodeData[docId + ':' + nodeId] : null;
    if (!entry) entry = docData[docId];
    if (!entry || !entry.tooltipHtml) { tooltip.style.display = 'none'; return; }
    tooltip.innerHTML = entry.tooltipHtml;
    positionTooltip(ref);
    tooltip.style.display = 'block';
  });

  function tryHide() {
    hideTimer = setTimeout(function() {
      tooltip.style.display = 'none';
      activeRef = null;
    }, 150);
  }

  document.addEventListener('mouseout', function(e) {
    if (!activeRef) return;
    if (e.target === activeRef || activeRef.contains(e.target)) {
      tryHide();
    }
  });

  tooltip.addEventListener('mouseenter', function() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });

  tooltip.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
    activeRef = null;
  });

  var scrollTimer;
  window.addEventListener('scroll', function() {
    if (!activeRef || tooltip.style.display !== 'block') return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() { positionTooltip(activeRef); }, 50);
  }, { passive: true });

  window.addEventListener('resize', function() {
    if (!activeRef || tooltip.style.display !== 'block') return;
    positionTooltip(activeRef);
  });
})();
</script>
</body>
</html>`
}

// ── Download helper ────────────────────────────────────────────

function downloadHtml(html: string, project: string): void {
    const now = new Date()
    const ts = now.toISOString().replace(/[:.]/g, '').slice(0, 15)
    const filename = `vein-${sanitizeFilename(project)}-${ts}.html`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'vein'
}

// ── HTML escaping utilities ────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
