import type { FloatingPanelChatContextItem, FloatingPanelChatQuickAction } from '../FloatingPanelChatSections'
import type { WorkspaceContextCacheStatus } from '../chatPromptHelpers'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import type { GraphData } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import { NATIVE_IMPORT_URL_INVOCATION_TEMPLATE } from '../nativeImportUrlInvocation'

type ChatSurfaceNode = {
  label?: unknown
  type?: unknown
} | null

export type FloatingPanelChatPipelineStage = {
  id: 'ingest' | 'parse' | 'render'
  label: string
  detail: string
  status: 'waiting' | 'active' | 'ready' | 'error'
  prompt: string
}

export const buildFloatingPanelChatSourceFilesSignature = (sourceFiles: unknown): string => {
  const files = Array.isArray(sourceFiles) ? sourceFiles as SourceFile[] : []
  const parts: Array<string | number | boolean> = ['chat:source-files', files.length]
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const id = String(file?.id || `source-${index}`)
    const text = typeof file?.text === 'string' ? file.text : ''
    parts.push(
      id,
      String(file?.name || ''),
      file?.enabled !== false,
      String(file?.status || ''),
      String(file?.parsedParserId || ''),
      String(file?.parsedTextHash || ''),
      hashStringToHexSharedContentCached(text, `floating-chat-source:${id}`),
    )
  }
  return hashSignatureParts(parts)
}

export const countEnabledChatSourceFiles = (sourceFiles: unknown): number => {
  if (!Array.isArray(sourceFiles)) return 0
  return sourceFiles.reduce((count, file) => {
    if (!file || typeof file !== 'object') return count
    return count + ((file as { enabled?: unknown }).enabled === false ? 0 : 1)
  }, 0)
}

export const resolveChatWorkspaceLabel = (args: {
  markdownDocumentName?: unknown
  chatAgenticGraphWorkspacePath?: unknown
  chatHistoryWorkspacePath?: unknown
}): string => {
  const name = String(args.markdownDocumentName || '').trim()
  if (name) return name
  const path = String(args.chatAgenticGraphWorkspacePath || args.chatHistoryWorkspacePath || '').trim()
  const tail = path.split('/').filter(Boolean).slice(-1)[0] || ''
  return tail || 'none'
}

export const buildFloatingPanelChatWorkspaceContextCacheKey = (args: {
  chatContextScope: string
  markdownDocumentName?: unknown
  docLocationRevision?: unknown
  markdownText?: unknown
  sourceFilesSignature?: unknown
}): string => {
  if (args.chatContextScope === 'selection') return ''
  const markdown = typeof args.markdownText === 'string' ? args.markdownText : ''
  return hashSignatureParts([
    'chat:workspace-context',
    args.chatContextScope === 'workspace' ? 'workspace' : 'hybrid',
    String(args.markdownDocumentName || ''),
    String(args.docLocationRevision || ''),
    hashStringToHexSharedContentCached(markdown, 'floating-chat-workspace-document'),
    String(args.sourceFilesSignature || ''),
  ])
}

export const createFloatingPanelChatPipelineStages = (args: {
  sourceFiles: unknown
  graphData: GraphData | null | undefined
  workspaceViewMode: 'canvas' | 'editor'
}): FloatingPanelChatPipelineStage[] => {
  const enabled = (Array.isArray(args.sourceFiles) ? args.sourceFiles as SourceFile[] : [])
    .filter(file => file && file.enabled !== false)
  const loadingCount = enabled.filter(file => file.status === 'loading').length
  const parsedCount = enabled.filter(file => file.status === 'parsed').length
  const errorCount = enabled.filter(file => file.status === 'error').length
  const graphItemCount = (args.graphData?.nodes?.length || 0) + (args.graphData?.edges?.length || 0)
  const parseStatus = errorCount > 0
    ? 'error'
    : loadingCount > 0
      ? 'active'
      : enabled.length > 0 && parsedCount === enabled.length
        ? 'ready'
        : 'waiting'
  const renderStatus = parseStatus === 'error'
    ? 'error'
    : parseStatus === 'active'
      ? 'active'
      : graphItemCount > 0
        ? 'ready'
        : 'waiting'

  return [
    {
      id: 'ingest',
      label: 'Ingest',
      detail: enabled.length > 0 ? `${enabled.length} source${enabled.length === 1 ? '' : 's'}` : 'No source',
      status: loadingCount > 0 ? 'active' : enabled.length > 0 ? 'ready' : 'waiting',
      prompt: 'Inspect current ingestion inputs, source provenance, loading state, and duplicate-fetch risk.',
    },
    {
      id: 'parse',
      label: 'Parse',
      detail: errorCount > 0 ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : `${parsedCount}/${enabled.length} parsed`,
      status: parseStatus,
      prompt: 'Inspect current parser lifecycle, stale-parse guards, parsed graph reuse, and duplicate-computation risk.',
    },
    {
      id: 'render',
      label: 'Render',
      detail: graphItemCount > 0 ? `${graphItemCount} graph items` : `${args.workspaceViewMode} waiting`,
      status: renderStatus,
      prompt: 'Inspect current canvas rendering state, graph revision, re-render pressure, and loading-to-ready transitions.',
    },
  ]
}

export const createFloatingPanelChatContextItems = (args: {
  chatContextScope: string
  enabledSourceFileCount: number
  activeWorkspaceLabel: string
  currentNode: ChatSurfaceNode
  messageCount: number
  workspaceContextCacheStatus: WorkspaceContextCacheStatus
}): FloatingPanelChatContextItem[] => {
  const contextScopeLabel = args.chatContextScope === 'selection'
    ? 'selection'
    : args.chatContextScope === 'workspace'
      ? 'workspace'
      : 'hybrid'
  const selectedNodeLabel = args.currentNode
    ? String(args.currentNode.label || 'selected node')
    : 'canvas'
  return [
    {
      id: 'scope',
      label: 'Scope',
      value: contextScopeLabel,
      tone: contextScopeLabel === 'hybrid' ? 'success' : 'info',
    },
    {
      id: 'sources',
      label: 'Sources',
      value: `${args.enabledSourceFileCount}`,
      tone: args.enabledSourceFileCount > 0 ? 'success' : 'neutral',
    },
    {
      id: 'workspace',
      label: 'Workspace',
      value: args.activeWorkspaceLabel,
      tone: args.activeWorkspaceLabel === 'none' ? 'neutral' : 'info',
    },
    {
      id: 'selection',
      label: 'Selection',
      value: selectedNodeLabel,
      tone: args.currentNode ? 'success' : 'neutral',
    },
    {
      id: 'memory',
      label: 'Memory',
      value: args.messageCount > 0 ? `${args.messageCount} cached` : 'ready',
      tone: args.messageCount > 0 ? 'info' : 'neutral',
    },
    {
      id: 'context-cache',
      label: 'Context',
      value: args.workspaceContextCacheStatus === 'disabled'
        ? 'selection-only'
        : `cache ${args.workspaceContextCacheStatus}`,
      tone: args.workspaceContextCacheStatus === 'hot'
        ? 'success'
        : args.workspaceContextCacheStatus === 'loading'
          ? 'info'
          : 'neutral',
    },
  ]
}

export const createFloatingPanelChatQuickActions = (args: {
  activeWorkspaceLabel: string
  currentNode: ChatSurfaceNode
  sourceFiles?: unknown
  graphData?: GraphData | null | undefined
  messageCount?: number
}): FloatingPanelChatQuickAction[] => {
  const enabled = (Array.isArray(args.sourceFiles) ? args.sourceFiles as SourceFile[] : [])
    .filter(file => file && file.enabled !== false)
  const loadingCount = enabled.filter(file => file.status === 'loading').length
  const parsedCount = enabled.filter(file => file.status === 'parsed').length
  const errorCount = enabled.filter(file => file.status === 'error').length
  const graphItemCount = (args.graphData?.nodes?.length || 0) + (args.graphData?.edges?.length || 0)
  const hasWorkspace = args.activeWorkspaceLabel !== 'none'
  const actions: FloatingPanelChatQuickAction[] = []
  const seen = new Set<string>()
  const addAction = (action: FloatingPanelChatQuickAction) => {
    if (seen.has(action.id) || actions.length >= 4) return
    seen.add(action.id)
    actions.push(action)
  }

  if (hasWorkspace) {
    addAction({
      id: 'workspace-review',
      label: '/workspace.review',
      prompt: '/workspace.review Review the active workspace file. Summarize ingestion, parsing, rendering, cache, and memory risks with the smallest high-ROI next action.',
    })
  }
  if (args.currentNode) {
    const label = String(args.currentNode.label || 'selected node')
    const type = String(args.currentNode.type || 'node')
    addAction({
      id: 'pipeline-trace',
      label: '/pipeline.trace',
      prompt: `/pipeline.trace Trace selected node "${label}" (${type}) through workspace context, source provenance, parser output, and adjacent graph evidence.`,
    })
  }
  if (loadingCount > 0 || enabled.length === 0) {
    addAction({
      id: 'source-ingest',
      label: '/source.ingest',
      prompt: '/source.ingest Inspect current ingestion inputs, source provenance, loading state, and duplicate-fetch risk.',
    })
  }
  if (errorCount > 0 || (enabled.length > 0 && parsedCount < enabled.length)) {
    addAction({
      id: 'source-parse',
      label: '/source.parse',
      prompt: '/source.parse Inspect current parser lifecycle, stale-parse guards, parsed graph reuse, and duplicate-computation risk.',
    })
  }
  if (enabled.length > 0 || graphItemCount > 0) {
    addAction({
      id: 'pipeline-trace',
      label: '/pipeline.trace',
      prompt: '/pipeline.trace Trace the current document from ingestion to parsing to canvas rendering. Identify stale data, duplicate computation, and re-render risks.',
    })
  }
  if (graphItemCount > 0) {
    addAction({
      id: 'canvas-render',
      label: '/canvas.render',
      prompt: '/canvas.render Inspect current canvas rendering state, graph revision, re-render pressure, and loading-to-ready transitions.',
    })
  }
  if ((args.messageCount || 0) > 0 && (hasWorkspace || enabled.length > 0 || graphItemCount > 0)) {
    addAction({
      id: 'memory-extract',
      label: '#memory.extract',
      prompt: '#memory.extract Promote the completed harness run into reusable procedural memory. Use the exact output_dir when known; otherwise ask for the output_dir and explicit app_id, user_id, agent_id, or run_id before execution.',
    })
  }
  if ((args.messageCount || 0) > 0 || enabled.length > 0 || graphItemCount > 0) {
    addAction({
      id: 'token-economics',
      label: '/cost.audit #token-economics',
      prompt: '/cost.audit #token-economics Estimate token/TCO impact for the current workflow and propose a cache-first, FOSS-friendly optimization plan.',
    })
  }
  addAction({
    id: 'ingest-url',
    label: '/ingest-url',
    prompt: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
  })
  return actions
}
