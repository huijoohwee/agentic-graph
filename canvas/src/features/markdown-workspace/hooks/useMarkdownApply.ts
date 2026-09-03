import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY } from '@/lib/config'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { getDocumentPathFromMetadata, toMetadataRecord } from '@/lib/graph/documentMetadata'
import { emitMarkdownPanelMetric } from '@/features/metrics/uiMetrics'
import { composeGraphFromSourceLayers, resolveSourceLayerKeyChange } from '@/lib/graph/sourceLayers'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import { buildSourceFileLifecycleState } from '@/features/source-files/sourceFileParsedState'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'

const FRONTMATTER_PARSE_WARNING_PREFIX = 'Markdown frontmatter YAML parse failed and frontmatter was ignored:'

export function filterTransientStreamingTraceFrontmatterWarnings(args: {
  warnings: string[]
  activeDocumentPath: string
  streamingWorkspacePath: string | null
}): string[] {
  const activePath = normalizeWorkspacePath(String(args.activeDocumentPath || '').trim())
  const streamingPath = normalizeWorkspacePath(String(args.streamingWorkspacePath || '').trim())
  if (!activePath || !streamingPath || activePath !== streamingPath) return Array.isArray(args.warnings) ? args.warnings : []
  const fileName = streamingPath.split('/').filter(Boolean).slice(-1)[0] || ''
  if (!/^agentic-os-trace_(?:\d{8}T\d{6}Z|\d{14})\.md$/i.test(fileName)) return Array.isArray(args.warnings) ? args.warnings : []
  return (Array.isArray(args.warnings) ? args.warnings : []).filter(
    warning => !String(warning || '').startsWith(FRONTMATTER_PARSE_WARNING_PREFIX),
  )
}

type UseMarkdownApplyProps = {
  markdownText: string
  isJsonBacked: boolean
  selectionDocumentPath: string
  markdownDocumentName: string | null
  activeDocumentPath: string
  hasSelection: boolean
}

export function useMarkdownApply(props: UseMarkdownApplyProps) {
  const {
    markdownText,
    isJsonBacked,
    selectionDocumentPath,
    markdownDocumentName,
    activeDocumentPath,
    hasSelection,
  } = props

  const updateSourceFile = useGraphStore(s => s.updateSourceFile)
  const setGraphData = useGraphStore(s => s.setGraphData)
  const setGraphDataPreservingLayout = useGraphStore(s => s.setGraphDataPreservingLayout)
  const chatWorkspaceStreamingPath = useGraphStore(s => s.chatWorkspaceStreamingPath || null)

  const [applyStatus, setApplyStatus] = React.useState<{
    ok: boolean | null
    msg: string
  } | null>(null)

  React.useEffect(() => {
    if (!applyStatus) return
    const timer = setTimeout(() => {
      setApplyStatus(null)
    }, 4000)
    return () => {
      clearTimeout(timer)
    }
  }, [applyStatus])

  const handleApplyMarkdown = React.useCallback(async () => {
    if (!markdownText || !markdownText.trim()) return
    if (isJsonBacked) {
      setApplyStatus({
        ok: false,
        msg: UI_COPY.markdownWorkspaceApplyJsonBackedUnsupportedStatus,
      })
      return
    }
    const rawName = (selectionDocumentPath || markdownDocumentName || '').trim()
    const targetDocumentPath = (() => {
      const fromSelection = selectionDocumentPath && selectionDocumentPath.trim()
      if (fromSelection) return fromSelection
      const fromActive = activeDocumentPath && activeDocumentPath.trim()
      if (fromActive) return fromActive
      return ''
    })()
    const baseName = (() => {
      if (!rawName) return 'graph.md'
      if (rawName.endsWith('.md') || rawName.endsWith('.markdown')) return rawName
      return `${rawName}.md`
    })()
    emitMarkdownPanelMetric('markdownApplyRequested', {
      hasSelection,
      name: baseName,
    })
    try {
      const beforeStore = useGraphStore.getState()
      const beforeGraph = beforeStore.graphData || null
      const storeSourceFiles = beforeStore.sourceFiles || []
      const exactSourceFile =
        storeSourceFiles.find(f => String(f.name || '').trim() === targetDocumentPath.trim()) ||
        storeSourceFiles.find(f => String(f.name || '').trim() === baseName.trim()) ||
        null

      if (exactSourceFile && typeof updateSourceFile === 'function') {
        updateSourceFile(exactSourceFile.id, {
          text: markdownText,
          ...buildSourceFileLifecycleState({ status: 'loading' }),
        })
        const res = await loadGraphDataFromTextViaParser(baseName, markdownText, { applyToStore: false })
        const parsedTextHash = buildSourceFileParseIdentityHash({
          cacheNamespace: `source-file:${exactSourceFile.id}`,
          name: String(exactSourceFile.name || baseName),
          text: markdownText,
        })
        if (!res || !res.graphData) {
          updateSourceFile(exactSourceFile.id, {
            ...buildSourceFileLifecycleState({
              status: 'error',
              error: UI_COPY.parserDataLoadFailed,
              parserId: res?.parserId,
              textHash: parsedTextHash,
              graphData: undefined,
            }),
          })
          setApplyStatus({ ok: false, msg: UI_COPY.parserDataLoadFailed })
          return
        }
        const warnings = filterTransientStreamingTraceFrontmatterWarnings({
          warnings: res.warnings || [],
          activeDocumentPath: targetDocumentPath,
          streamingWorkspacePath: chatWorkspaceStreamingPath,
        })
        const counts = res.counts
        const nodeCount = counts ? Number(counts.n || 0) : 0
        const edgeCount = counts ? Number(counts.e || 0) : 0
        const hasGraph = nodeCount > 0 || edgeCount > 0
        if (warnings.length > 0 && !hasGraph) {
          updateSourceFile(exactSourceFile.id, {
            ...buildSourceFileLifecycleState({
              status: 'error',
              error: warnings[0] || UI_COPY.parserDataLoadFailed,
              parserId: res.parserId,
              textHash: parsedTextHash,
              graphData: undefined,
            }),
          })
          setApplyStatus({
            ok: false,
            msg: UI_COPY.parserDataLoadSyntaxErrorStatus(warnings[0] || ''),
          })
          return
        }
        updateSourceFile(exactSourceFile.id, {
          ...buildSourceFileLifecycleState({
            status: 'parsed',
            parserId: res.parserId,
            textHash: parsedTextHash,
            graphData: res.graphData,
          }),
        })

        const afterStore = useGraphStore.getState()
        const layers = (afterStore.sourceFiles || []).map(f => ({
          id: f.id,
          name: f.name,
          enabled: Boolean(f.enabled),
          source: f.source,
          text: f.text,
          parsedTextHash: f.parsedTextHash,
          parsedGraphRevision: f.parsedGraphRevision,
          parsedGraphData: f.parsedGraphData,
        }))
        const { graphData, contentKey, orderKey } = composeGraphFromSourceLayers({ layers })
        const change = resolveSourceLayerKeyChange({
          previousGraphData: beforeGraph,
          contentKey,
          orderKey,
        })
        if (change === 'unchanged') {
          setApplyStatus({
            ok: true,
            msg: res.input && res.input.name ? res.input.name : UI_COPY.parserDataLoadSuccess,
          })
          return
        }
        if (change === 'order-only') {
          if (typeof setGraphDataPreservingLayout === 'function') setGraphDataPreservingLayout(graphData)
        } else {
          if (typeof setGraphData === 'function') setGraphData(graphData)
        }
        setApplyStatus({
          ok: true,
          msg: res.input && res.input.name ? res.input.name : UI_COPY.parserDataLoadSuccess,
        })
        return
      }

      const res = await loadGraphDataFromTextViaParser(baseName, markdownText)
      if (!res) {
        setApplyStatus({ ok: false, msg: UI_COPY.parserDataLoadFailed })
        return
      }
      const warnings = filterTransientStreamingTraceFrontmatterWarnings({
        warnings: res.warnings || [],
        activeDocumentPath: targetDocumentPath,
        streamingWorkspacePath: chatWorkspaceStreamingPath,
      })
      const counts = res.counts
      const nodeCount = counts ? Number(counts.n || 0) : 0
      const edgeCount = counts ? Number(counts.e || 0) : 0
      const hasGraph = nodeCount > 0 || edgeCount > 0
      if (warnings.length > 0 && !hasGraph) {
        if (beforeGraph) {
          try {
            const store = useGraphStore.getState()
            store.setGraphData(beforeGraph)
          } catch {
            void 0
          }
        }
        setApplyStatus({
          ok: false,
          msg: UI_COPY.parserDataLoadSyntaxErrorStatus(warnings[0] || ''),
        })
        return
      }
      const afterStore = useGraphStore.getState()
      const parsedGraph = afterStore.graphData || null
      if (beforeGraph && parsedGraph && targetDocumentPath.trim()) {
        const trimmedPath = targetDocumentPath.trim()
        const normalizeNode = (node: typeof parsedGraph.nodes[number]) => {
          const record = toMetadataRecord(node.metadata as unknown)
          const nextMeta = { ...record, documentPath: trimmedPath }
          return { ...node, metadata: nextMeta }
        }
        const normalizeEdge = (edge: typeof parsedGraph.edges[number]) => {
          const record = toMetadataRecord(edge.metadata as unknown)
          const nextMeta = { ...record, documentPath: trimmedPath }
          return { ...edge, metadata: nextMeta }
        }
        const prevNodes = beforeGraph.nodes || []
        const prevEdges = beforeGraph.edges || []
        const newNodesRaw = parsedGraph.nodes || []
        const newEdgesRaw = parsedGraph.edges || []
        const newNodes = newNodesRaw.map(normalizeNode)
        const newEdges = newEdgesRaw.map(normalizeEdge)
        const shouldRemoveByPath = (meta: unknown) => {
          return getDocumentPathFromMetadata(meta) === trimmedPath
        }
        const remainingNodes = prevNodes.filter(n => !shouldRemoveByPath(n.metadata))
        const remainingNodeIds = new Set(remainingNodes.map(n => String(n.id)))
        const newNodeIds = new Set(newNodes.map(n => String(n.id)))
        const keepNodeId = (id: string) => remainingNodeIds.has(id) || newNodeIds.has(id)
        const remainingEdges = prevEdges.filter(e => {
          if (shouldRemoveByPath(e.metadata)) return false
          const src = String(e.source || '')
          const tgt = String(e.target || '')
          if (!keepNodeId(src) || !keepNodeId(tgt)) return false
          return true
        })
        const mergedGraph = {
          context: beforeGraph.context,
          metadata: beforeGraph.metadata,
          type: beforeGraph.type || parsedGraph.type || 'Graph',
          nodes: [...remainingNodes, ...newNodes],
          edges: [...remainingEdges, ...newEdges],
        }
        try {
          afterStore.setGraphData(mergedGraph)
        } catch {
          void 0
        }
      }
      setApplyStatus({
        ok: true,
        msg: res.input && res.input.name ? res.input.name : UI_COPY.parserDataLoadSuccess,
      })
    } catch {
      setApplyStatus({ ok: false, msg: UI_COPY.parserDataLoadFailed })
    }
  }, [markdownText, selectionDocumentPath, markdownDocumentName, hasSelection, isJsonBacked, activeDocumentPath, chatWorkspaceStreamingPath])

  return { applyStatus, handleApplyMarkdown }
}
