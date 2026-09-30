import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { ancestorPathsForWorkspacePath, normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import {
  getDocumentLocationFromMetadata,
  resolveMarkdownNavigationMetadata,
} from '@/lib/graph/markdownMetadata'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { findMarkdownTextHighlightLineRange } from '@/lib/markdown/markdownTextHighlights'
import type { StatusHelpers } from './useWorkspaceFileActions/types'
import { resolveMarkdownWorkspaceDocsMirrorCanonicalPath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionCanonicalPath'
import { buildWorkspaceEntriesIndex, type WorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'

import { readWorkspaceImportMarkdownSourceUrl, workspaceImportSourceUrlsMatch } from './workspaceImport/sourceUrlIdentity'

const EMPTY_GRAPH_NODES: GraphNode[] = []
const EMPTY_GRAPH_EDGES: GraphEdge[] = []

const stripLineFragment = (raw: string) => {
  const text = String(raw || '').trim()
  if (!text) return ''
  const hashIndex = text.indexOf('#')
  if (hashIndex < 0) return text
  return text.slice(0, hashIndex).trim()
}

const normalizeDocumentPathKey = (raw: unknown) => {
  const key = stripLineFragment(String(raw || '')).replace(/^\/+/, '').trim()
  return key
}

const findWorkspacePathForDocumentKey = (entries: WorkspaceEntry[], docKey: string): WorkspacePath | null => {
  const normalizedKey = normalizeDocumentPathKey(docKey)
  if (!normalizedKey) return null

  let exact: WorkspacePath | null = null
  let suffix: WorkspacePath | null = null
  let suffixLen = Number.POSITIVE_INFINITY

  for (const e of entries) {
    if (e.kind !== 'file') continue
    const key = workspaceDocumentKey(e.path)
    if (!key) continue
    if (key === normalizedKey) {
      exact = e.path
      break
    }
    if (key.endsWith(`/${normalizedKey}`) || key.endsWith(normalizedKey)) {
      const len = key.length
      if (len < suffixLen) {
        suffixLen = len
        suffix = e.path
      }
    }
  }
  return exact || suffix
}

export const resolveCanvasMarkdownSyncTargetPath = (args: {
  entries: WorkspaceEntry[]
  entriesIndex?: WorkspaceEntriesIndex
  docKey: string
  activePath?: WorkspacePath | null
}): WorkspacePath | null => {
  const sourceUrl = /^https?:\/\//i.test(args.docKey)
  const captures = sourceUrl ? args.entries.filter(entry => entry.kind === 'file'
    && workspaceImportSourceUrlsMatch(readWorkspaceImportMarkdownSourceUrl(entry.text || ''), args.docKey)) : []
  const targetPath = sourceUrl
    ? captures.find(entry => entry.path === args.activePath)?.path || (captures.length === 1 ? captures[0]!.path : null)
    : findWorkspacePathForDocumentKey(args.entries, args.docKey)
  if (!targetPath) return null
  const entriesIndex = args.entriesIndex || buildWorkspaceEntriesIndex(args.entries)
  return resolveMarkdownWorkspaceDocsMirrorCanonicalPath(targetPath, entriesIndex) || targetPath
}

export function useCanvasMarkdownSync(args: {
  active: boolean
  entries: WorkspaceEntry[]
  activePath: WorkspacePath | null
  setActivePathSafe: (path: WorkspacePath) => void
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>
  revealLineInEditor: (line: number, endLine?: number) => void
  setStatusError: StatusHelpers['setStatusError']
}) {
  const {
    active,
    entries,
    activePath,
    setActivePathSafe,
    setExpandedPaths,
    revealLineInEditor,
    setStatusError,
  } = args

  const selectionSource = useGraphStore(s => s.selectionSource)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const graphNodes = useGraphStore(s => ((s.graphData as GraphData | null)?.nodes as GraphNode[] | undefined) || EMPTY_GRAPH_NODES)
  const graphEdges = useGraphStore(s => ((s.graphData as GraphData | null)?.edges as GraphEdge[] | undefined) || EMPTY_GRAPH_EDGES)
  const graphDataRevision = useGraphStore(s => (s.graphDataRevision || 0) as number)
  const docLocationRevision = useGraphStore(s => (s.docLocationRevision || 0) as number)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText || '')
  const renderGraphData = useActiveGraphRenderData(active)
  const entriesIndex = React.useMemo(() => buildWorkspaceEntriesIndex(entries), [entries])
  const syncGraphNodes = (Array.isArray(renderGraphData?.nodes) && renderGraphData.nodes.length > 0)
    ? (renderGraphData.nodes as GraphNode[])
    : graphNodes
  const syncGraphEdges = (Array.isArray(renderGraphData?.edges) && renderGraphData.edges.length > 0)
    ? (renderGraphData.edges as GraphEdge[])
    : graphEdges

  const graphLookupSemanticKey = React.useMemo(() => {
    return buildScopedGraphSemanticKey('canvas-markdown-sync-graph', {
      graphData: { type: 'Graph', nodes: syncGraphNodes, edges: syncGraphEdges } as GraphData,
      graphRevision: graphDataRevision,
      graphSemanticKey: [
        ...syncGraphNodes.map(node => String(node?.id || '').trim()).filter(Boolean).map(id => `node:${id}`),
        ...syncGraphEdges.map(edge => String(edge?.id || '').trim()).filter(Boolean).map(id => `edge:${id}`),
      ].join('\n'),
    })
  }, [graphDataRevision, syncGraphEdges, syncGraphNodes])

  const graphLookup = React.useMemo(() => {
    if (syncGraphNodes.length === 0 && syncGraphEdges.length === 0) return null
    return getCachedGraphLookup({
      cacheScope: 'canvas-markdown-sync-graph',
      graphData: {
        type: 'Graph',
        nodes: syncGraphNodes,
        edges: syncGraphEdges,
      } as GraphData,
      graphRevision: graphDataRevision,
      graphSemanticKey: graphLookupSemanticKey,
      preferCurrentGraphDataRefs: true,
    })
  }, [graphDataRevision, graphLookupSemanticKey, syncGraphEdges, syncGraphNodes])

  const graphLookupRef = React.useRef(graphLookup)
  React.useEffect(() => {
    graphLookupRef.current = graphLookup
  }, [graphLookup])

  const lastCanvasSyncSigRef = React.useRef<string>('')

  React.useEffect(() => {
    if (!active) return
    if (selectionSource !== 'canvas') return
    if (useGraphStore.getState().selectionSource !== 'canvas') return

    const nodeId = selectedNodeId ? String(selectedNodeId) : ''
    const edgeId = !nodeId && selectedEdgeId ? String(selectedEdgeId) : ''
    const documentTextKey = `${activePath || ''}:${markdownDocumentText.length}`
    const sig = nodeId ? `node:${nodeId}:${graphLookupSemanticKey}:${documentTextKey}` : edgeId ? `edge:${edgeId}:${graphLookupSemanticKey}:${documentTextKey}` : ''
    if (!sig) return
    if (lastCanvasSyncSigRef.current === sig) return

    const lookup = graphLookupRef.current
    const node = nodeId ? lookup?.nodeById.get(nodeId) || null : null
    const edge = !node && edgeId ? lookup?.edgeById.get(edgeId) || null : null
    const meta = resolveMarkdownNavigationMetadata({
      node,
      edge,
      graphLookup: lookup,
    })
    const location = getDocumentLocationFromMetadata(meta)
    const fallbackRange = !location && node
      ? findMarkdownTextHighlightLineRange(markdownDocumentText, ((node.properties || {}) as Record<string, unknown>)['keyword:key'] || node.label)
      : null
    if (!location && !fallbackRange) {
      return
    }

    const fallbackDocKey = activePath ? workspaceDocumentKey(activePath) : ''
    const docKey = location ? normalizeDocumentPathKey(location.documentPath) : normalizeDocumentPathKey(fallbackDocKey)
    if (docKey) {
      const targetPath = resolveCanvasMarkdownSyncTargetPath({
        entries,
        entriesIndex,
        docKey,
        activePath,
      })
      if (!targetPath) {
        setStatusError(/^https?:\/\//i.test(docKey) ? `No unique saved document for source: ${docKey}` : `Missing file: ${docKey}`, { ttlMs: 3500, dismissible: true })
        return
      }

      const normalizedTarget = normalizeWorkspacePath(targetPath)
      if (useGraphStore.getState().selectionSource !== 'canvas') return
      if (activePath !== normalizedTarget) {
        setExpandedPaths(prev => {
          const next = new Set(prev)
          for (const ancestor of ancestorPathsForWorkspacePath(normalizedTarget)) next.add(ancestor)
          return next
        })
        setActivePathSafe(normalizedTarget)
      }
    }
    if (useGraphStore.getState().selectionSource !== 'canvas') return
    lastCanvasSyncSigRef.current = sig
    revealLineInEditor(location?.lineStart ?? fallbackRange!.start, location?.lineEnd ?? fallbackRange!.end)
  }, [
    active,
    activePath,
    entries,
    entriesIndex,
    graphLookupSemanticKey,
    revealLineInEditor,
    selectedEdgeId,
    selectedNodeId,
    selectionSource,
    docLocationRevision,
    markdownDocumentText,
    setActivePathSafe,
    setExpandedPaths,
    setStatusError,
  ])
}
