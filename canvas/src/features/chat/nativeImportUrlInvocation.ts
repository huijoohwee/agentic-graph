import {
  getMarkdownWorkspaceActionBridge,
  type WorkspaceBridgeImportResult,
  type WorkspaceImportUrlOpts,
  type WorkspaceAgentGraphCounts,
  type WorkspaceAgentGraphImportResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import {
  isWorkspaceUrlImportCanvasRendererId,
  isWorkspaceUrlImportDocumentModeId,
  normalizeWorkspaceUrlImportDocumentMode,
  type WorkspaceUrlImportCanvasRendererId,
  type WorkspaceUrlImportDocumentModeId,
} from '@/features/markdown-workspace/workspaceImport/canvasPresets'
import { useGraphStore } from '@/hooks/useGraphStore'
import { runLaunchImportUrl } from '@/lib/toolbar/launchImportDispatch'
import { normalizeWorkspaceImportUrlInput } from '@/lib/url'
import type { ChatMessage } from './FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChat/floatingPanelChatSubmitTypes'

export const NATIVE_IMPORT_URL_COMMAND = '/ingest-url' as const
export const NATIVE_IMPORT_URL_SEMANTIC = '#canvas' as const
export const NATIVE_IMPORT_URL_POLICY = '@reference-policy' as const
export const NATIVE_IMPORT_URL_BINDING = '@url:' as const
export const NATIVE_IMPORT_URL_INVOCATION_TEMPLATE =
  `${NATIVE_IMPORT_URL_COMMAND} ${NATIVE_IMPORT_URL_BINDING}https://example.com ${NATIVE_IMPORT_URL_POLICY} ${NATIVE_IMPORT_URL_SEMANTIC}` as const
export const NATIVE_IMPORT_URL_INVOCATION_ERROR =
  `Import URL invocation must match: ${NATIVE_IMPORT_URL_INVOCATION_TEMPLATE}` as const

export type NativeImportUrlInvocation = {
  command: typeof NATIVE_IMPORT_URL_COMMAND
  semantic: typeof NATIVE_IMPORT_URL_SEMANTIC
  policy: typeof NATIVE_IMPORT_URL_POLICY
  url: string
  canvas2dRenderer: WorkspaceUrlImportCanvasRendererId | null
  documentSemanticMode: WorkspaceUrlImportDocumentModeId | null
}

type NativeImportUrlRunResultCommon = {
  source: string
  invocation: string
  renderer: WorkspaceUrlImportCanvasRendererId | null
  documentSemanticMode: WorkspaceUrlImportDocumentModeId | null
  outputText: string
}

export type NativeImportUrlWorkspaceFilesRunResult = NativeImportUrlRunResultCommon & {
  createdPaths: string[]
  removedPaths: string[]
}

export type NativeImportUrlAgentGraphRunResult = NativeImportUrlRunResultCommon & {
  kind: 'agent-graph'
  graphId: string
  snapshotDigest: string
  complete: true
  counts: WorkspaceAgentGraphCounts
  projectionToken: string
  projectionComplete: boolean
  projectionTruncated: boolean
  projectionLimit: number
  projectionReason?: string
  projectionCounts: {
    nodes: number
    edges: number
  }
}

export type NativeImportUrlRunResult =
  | NativeImportUrlWorkspaceFilesRunResult
  | NativeImportUrlAgentGraphRunResult

export const isNativeImportUrlAgentGraphRunResult = (
  result: NativeImportUrlRunResult,
): result is NativeImportUrlAgentGraphRunResult => (
  'kind' in result && result.kind === 'agent-graph'
)

export type NativeImportUrlMutationFailure = {
  status: 'error'
  source: string
  invocation: string
  createdPaths: string[]
  removedPaths: string[]
  renderer: WorkspaceUrlImportCanvasRendererId | null
  documentSemanticMode: WorkspaceUrlImportDocumentModeId | null
  mutationState: 'partial' | 'unknown'
  error: string
  outputText: string
}

export class NativeImportUrlMutationError extends Error {
  readonly failure: NativeImportUrlMutationFailure

  constructor(failure: NativeImportUrlMutationFailure) {
    super(failure.outputText)
    this.name = 'NativeImportUrlMutationError'
    this.failure = failure
  }
}

type NativeImportUrlExecutionOptions = {
  onToast?: (toast: Parameters<ReturnType<typeof useGraphStore.getState>['pushUiToast']>[0]) => void
}

const normalizeHttpImportUrl = (value: unknown): string => {
  const normalized = normalizeWorkspaceImportUrlInput(value)
  if (!/^https?:\/\//i.test(normalized)) return ''
  try {
    const url = new URL(normalized)
    if (url.username || url.password) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const normalizePaths = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(path => String(path || '').trim())
    .filter((path, index, paths) => Boolean(path) && paths.indexOf(path) === index)
}

const isAgentGraphImportResult = (
  value: unknown,
): value is WorkspaceAgentGraphImportResult => (
  !!value
  && typeof value === 'object'
  && (value as { kind?: unknown }).kind === 'agent-graph'
)

const buildInvocationText = (invocation: NativeImportUrlInvocation): string =>
  `${invocation.command} ${NATIVE_IMPORT_URL_BINDING}${invocation.url} ${invocation.policy} ${invocation.semantic}`

const redactHttpUrlCredentials = (value: string): string =>
  value.replace(/https?:\/\/\S+/gi, rawValue => {
    const trailingMatch = /[),.;]+$/.exec(rawValue)
    const trailing = trailingMatch?.[0] || ''
    const candidate = trailing ? rawValue.slice(0, -trailing.length) : rawValue
    try {
      const url = new URL(candidate)
      if (!url.username && !url.password) return rawValue
      return `${url.protocol}//[credentials-redacted]@${url.host}${url.pathname}${url.search}${url.hash}${trailing}`
    } catch {
      return `${candidate.replace(/^(https?:\/\/)[^/\s@]+@/i, '$1[credentials-redacted]@')}${trailing}`
    }
  })

export const redactNativeImportUrlInvocationForPersistence = (input: unknown): string =>
  redactHttpUrlCredentials(String(input || '').trim())

const buildInvocation = (args: {
  url: unknown
  canvas2dRenderer?: unknown
  documentSemanticMode?: unknown
}): NativeImportUrlInvocation => {
  const url = normalizeHttpImportUrl(args.url)
  if (!url) {
    throw new Error('Import URL requires an HTTP(S) URL without embedded credentials.')
  }
  if (args.canvas2dRenderer != null && !isWorkspaceUrlImportCanvasRendererId(args.canvas2dRenderer)) {
    throw new Error('Import URL canvas2dRenderer must be d3, design, or storyboard.')
  }
  const canvas2dRenderer = isWorkspaceUrlImportCanvasRendererId(args.canvas2dRenderer)
    ? args.canvas2dRenderer
    : null
  if (args.documentSemanticMode != null && !canvas2dRenderer) {
    throw new Error('Import URL documentSemanticMode requires a canvas2dRenderer.')
  }
  if (args.documentSemanticMode != null && !isWorkspaceUrlImportDocumentModeId(args.documentSemanticMode)) {
    throw new Error('Import URL documentSemanticMode must be document or keyword.')
  }
  const documentSemanticMode = canvas2dRenderer
    ? normalizeWorkspaceUrlImportDocumentMode(args.documentSemanticMode)
    : null
  return {
    command: NATIVE_IMPORT_URL_COMMAND,
    semantic: NATIVE_IMPORT_URL_SEMANTIC,
    policy: NATIVE_IMPORT_URL_POLICY,
    url,
    canvas2dRenderer,
    documentSemanticMode,
  }
}

export const parseNativeImportUrlInvocation = (input: unknown): NativeImportUrlInvocation | null => {
  const text = String(input || '').trim()
  if (!text) return null
  const match = /^\/ingest-url\s+@url\s*:\s*(https?:\/\/\S+)\s+@reference-policy\s+#canvas$/i.exec(text)
  const rawUrl = match?.[1] || ''
  try {
    return buildInvocation({ url: rawUrl })
  } catch {
    return null
  }
}

export const isNativeImportUrlInvocationAttempt = (input: unknown): boolean =>
  /^\/ingest-url(?:\s|$)/i.test(String(input || '').trim())

const readStructuredImportUrlInput = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Import URL input must be an object.')
  }
  const record = input as Record<string, unknown>
  const allowedKeys = new Set(['invocation', 'url', 'canvas2dRenderer', 'documentSemanticMode'])
  if (Object.keys(record).some(key => !allowedKeys.has(key))) {
    throw new Error('Import URL input includes unsupported fields.')
  }
  const hasInvocation = Object.prototype.hasOwnProperty.call(record, 'invocation')
  const hasUrl = Object.prototype.hasOwnProperty.call(record, 'url')
  const hasRenderer = Object.prototype.hasOwnProperty.call(record, 'canvas2dRenderer')
  const hasDocumentMode = Object.prototype.hasOwnProperty.call(record, 'documentSemanticMode')
  if (hasInvocation) {
    if (typeof record.invocation !== 'string' || !record.invocation.trim() || record.invocation.length > 8192) {
      throw new Error('Import URL invocation must be a non-empty string of at most 8192 characters.')
    }
    if (hasUrl || hasRenderer || hasDocumentMode) {
      throw new Error('Import URL accepts either invocation or structured URL fields, not both.')
    }
    return record
  }
  if (!hasUrl || typeof record.url !== 'string' || !record.url.trim() || record.url.length > 4096) {
    throw new Error('Import URL requires a non-empty url string of at most 4096 characters.')
  }
  if (hasRenderer && typeof record.canvas2dRenderer !== 'string') {
    throw new Error('Import URL canvas2dRenderer must be d3, design, or storyboard.')
  }
  if (hasDocumentMode && typeof record.documentSemanticMode !== 'string') {
    throw new Error('Import URL documentSemanticMode must be document or keyword.')
  }
  return record
}

export const executeNativeImportUrlInvocation = async (
  invocation: NativeImportUrlInvocation,
  options: NativeImportUrlExecutionOptions = {},
): Promise<NativeImportUrlRunResult> => {
  const normalizedInvocation = buildInvocation(invocation)
  const importOptions: WorkspaceImportUrlOpts = {
    canvas2dRenderer: normalizedInvocation.canvas2dRenderer,
    documentSemanticMode: normalizedInvocation.documentSemanticMode,
  }
  const pushUiToast = options.onToast || (toast => useGraphStore.getState().pushUiToast(toast))
  const result = await runLaunchImportUrl({
    urlRaw: normalizedInvocation.url,
    opts: importOptions,
    bridge: getMarkdownWorkspaceActionBridge(),
    fallback: async (urlRaw, opts) => {
      const { importUrlFallback } = await import('@/features/toolbar/launchDropdownFallbacks')
      const canvas2dRenderer = isWorkspaceUrlImportCanvasRendererId(opts?.canvas2dRenderer)
        ? opts.canvas2dRenderer
        : null
      return importUrlFallback({
        urlRaw,
        canvas2dRenderer,
        documentSemanticMode: canvas2dRenderer ? opts?.documentSemanticMode : null,
        pushUiToast,
      })
    },
  })
  const invocationText = buildInvocationText(normalizedInvocation)
  if (isAgentGraphImportResult(result)) {
    const projectionCounts = {
      nodes: result.projection.graphData.nodes.length,
      edges: result.projection.graphData.edges.length,
    }
    const outputText = [
      '# Knowledge graph imported',
      '',
      `- Source URL: ${normalizedInvocation.url}`,
      `- Graph ID: ${result.graphId}`,
      `- Snapshot digest: ${result.snapshotDigest}`,
      `- Complete canonical snapshot: ${result.complete ? 'yes' : 'no'}`,
      `- Canonical records: ${result.counts.sources} sources, ${result.counts.nodes} nodes, ${result.counts.edges} edges`,
      `- Canvas projection: ${projectionCounts.nodes} nodes, ${projectionCounts.edges} edges`,
      `- Projection status: ${result.projection.complete ? 'complete' : 'partial'}${result.projection.truncated ? ' (truncated)' : ''}`,
      `- Projection token: ${result.projection.token}`,
      `- Projection limit: ${result.projection.limit}`,
      ...(result.projection.reason ? [`- Projection reason: ${result.projection.reason}`] : []),
    ].join('\n')
    return {
      kind: 'agent-graph',
      source: normalizedInvocation.url,
      invocation: invocationText,
      renderer: normalizedInvocation.canvas2dRenderer,
      documentSemanticMode: normalizedInvocation.documentSemanticMode,
      graphId: result.graphId,
      snapshotDigest: result.snapshotDigest,
      complete: true,
      counts: {
        sources: result.counts.sources,
        nodes: result.counts.nodes,
        edges: result.counts.edges,
      },
      projectionToken: result.projection.token,
      projectionComplete: result.projection.complete,
      projectionTruncated: result.projection.truncated,
      projectionLimit: result.projection.limit,
      ...(result.projection.reason ? { projectionReason: result.projection.reason } : {}),
      projectionCounts,
      outputText,
    }
  }
  const bridgeResult = result as WorkspaceBridgeImportResult | undefined
  const createdPaths = normalizePaths(bridgeResult?.createdPaths)
  const removedPaths = normalizePaths(bridgeResult?.removedPaths)
  if (bridgeResult?.error) {
    const error = String(bridgeResult.error).trim() || 'Native URL import failed.'
    const mutationState = createdPaths.length > 0 || removedPaths.length > 0 ? 'partial' : 'unknown'
    const outputText = [
      '# URL import failed',
      '',
      `- Error: ${error}`,
      `- Source URL: ${normalizedInvocation.url}`,
      `- Workspace mutation state: ${mutationState}`,
      `- Created workspace files before failure: ${createdPaths.length}`,
      `- Removed workspace files before failure: ${removedPaths.length}`,
      '',
      ...createdPaths.map(path => `- Created: ${path}`),
      ...removedPaths.map(path => `- Removed: ${path}`),
      '',
      '- Inspect the workspace before retrying this non-idempotent import.',
    ].join('\n')
    throw new NativeImportUrlMutationError({
      status: 'error',
      source: normalizedInvocation.url,
      invocation: invocationText,
      createdPaths,
      removedPaths,
      renderer: normalizedInvocation.canvas2dRenderer,
      documentSemanticMode: normalizedInvocation.documentSemanticMode,
      mutationState,
      error,
      outputText,
    })
  }
  if (createdPaths.length === 0) {
    throw new Error('Import URL completed without creating a workspace file.')
  }
  const outputText = [
    '# URL imported',
    '',
    `- Source URL: ${normalizedInvocation.url}`,
    `- Created workspace files: ${createdPaths.length}`,
    ...(removedPaths.length > 0 ? [`- Removed workspace files: ${removedPaths.length}`] : []),
    ...(normalizedInvocation.canvas2dRenderer ? [`- Canvas renderer: ${normalizedInvocation.canvas2dRenderer}`] : []),
    ...(normalizedInvocation.documentSemanticMode ? [`- Document semantic mode: ${normalizedInvocation.documentSemanticMode}`] : []),
    '',
    ...createdPaths.map(path => `- ${path}`),
  ].join('\n')
  return {
    source: normalizedInvocation.url,
    invocation: invocationText,
    createdPaths,
    removedPaths,
    renderer: normalizedInvocation.canvas2dRenderer,
    documentSemanticMode: normalizedInvocation.documentSemanticMode,
    outputText,
  }
}

export async function executeStructuredImportUrl(input: unknown): Promise<NativeImportUrlRunResult> {
  const structuredInput = readStructuredImportUrlInput(input)
  const invocationText = typeof structuredInput.invocation === 'string' ? structuredInput.invocation.trim() : ''
  if (invocationText) {
    const invocation = parseNativeImportUrlInvocation(invocationText)
    if (!invocation) {
      throw new Error(NATIVE_IMPORT_URL_INVOCATION_ERROR)
    }
    return executeNativeImportUrlInvocation(invocation)
  }
  return executeNativeImportUrlInvocation(buildInvocation({
    url: structuredInput.url,
    canvas2dRenderer: structuredInput.canvas2dRenderer,
    documentSemanticMode: structuredInput.documentSemanticMode,
  }))
}

export const tryActivateNativeImportUrlInvocation = async (args: {
  input: string
  submitArgs: FloatingPanelChatSubmitArgs
}): Promise<boolean> => {
  const invocation = parseNativeImportUrlInvocation(args.input)
  if (!isNativeImportUrlInvocationAttempt(args.input)) return false
  const { submitArgs } = args
  submitArgs.setErrorText(null)
  submitArgs.setInput('')
  submitArgs.setIsLoading(true)
  const timestampMs = Date.now()
  const persistedInput = redactNativeImportUrlInvocationForPersistence(args.input)
  let response = invocation
    ? `Importing ${invocation.url} through the native workspace importer.`
    : NATIVE_IMPORT_URL_INVOCATION_ERROR
  let status: 'ok' | 'error' = 'ok'
  if (!invocation) {
    status = 'error'
    submitArgs.setErrorText(response)
    submitArgs.pushUiLog?.({ kind: 'error', message: response, source: 'chat:nativeImportUrl' })
  } else {
    try {
      const result = await executeNativeImportUrlInvocation(invocation)
      response = result.outputText
      submitArgs.pushUiLog?.({
        kind: 'success',
        message: isNativeImportUrlAgentGraphRunResult(result)
          ? `Native knowledge graph import finished: ${result.graphId}`
          : `Native URL import finished: ${invocation.url}`,
        source: 'chat:nativeImportUrl',
      })
    } catch (error) {
      status = 'error'
      response = error instanceof Error ? error.message : 'Native URL import failed.'
      submitArgs.setErrorText(response)
      submitArgs.pushUiLog?.({ kind: 'error', message: response, source: 'chat:nativeImportUrl' })
    }
  }
  submitArgs.setIsLoading(false)
  const identity = timestampMs.toString(36)
  const exchange: ChatMessage[] = [
    { id: `native-import-url-user-${identity}`, role: 'user', content: persistedInput },
    { id: `native-import-url-assistant-${identity}`, role: 'assistant', content: response },
  ]
  submitArgs.setMessages(previous => [...previous, ...exchange])
  submitArgs.pushChatExchangeLog({
    request: persistedInput,
    response,
    status,
    model: 'native-import-url',
    tsMs: timestampMs,
  })
  await submitArgs.persistChatExchangeLog({
    request: persistedInput,
    response,
    status,
    model: 'native-import-url',
    timestampMs,
  }).catch(() => void 0)
  return true
}
