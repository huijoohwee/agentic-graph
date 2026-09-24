import type {
  MarkdownWorkspaceActionBridge,
  WorkspaceBridgeImportResult,
  WorkspaceFileSelection,
  WorkspaceAgentGraphImportResult,
  WorkspaceAgentGraphInvocation,
  WorkspaceImportUrlOpts,
} from '@/features/markdown-explorer/workspaceActionBridge'
import {
  applyAgentGraphCanvasProjection,
  createAgentGraphCanvasPreviewSession,
} from '@/features/agent-graph/agentGraphCanvasProjection'
import {
  normalizeAgentGraphRepositoryRemoteUrl,
  parseAgentGraphRepositoryUrl,
} from '@/features/agent-graph/agentGraphRepositoryUrl'
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs'
import { isRemoteRateLimitFailureMessage } from '@/lib/net/fetchRemoteTextFailure'

export const LAUNCH_FOLDER_PREVIEW_MAX_FILES = 100
export const LAUNCH_FOLDER_PREVIEW_MAX_BYTES = 25 * 1024 * 1024

export type LaunchAgentGraphImportProgressStage = 'resolving' | 'ingesting' | 'projecting'

const repositoryImporterIds = new WeakMap<object, number>()
const inFlightRepositoryImports = new Map<string, Promise<WorkspaceAgentGraphImportResult>>()
let nextRepositoryImporterId = 1

function repositoryImporterId(importer: object): number {
  const existing = repositoryImporterIds.get(importer)
  if (existing) return existing
  const next = nextRepositoryImporterId
  nextRepositoryImporterId += 1
  repositoryImporterIds.set(importer, next)
  return next
}

function repositoryImportOperationKey(args: {
  repositoryUrl: string
  opts?: WorkspaceImportUrlOpts
  invocation: WorkspaceAgentGraphInvocation
  importer: object
}): string {
  return JSON.stringify([
    args.repositoryUrl,
    String(args.opts?.canvas2dRenderer || ''),
    String(args.opts?.documentSemanticMode || ''),
    repositoryImporterId(args.importer),
    args.invocation.schema,
    args.invocation.tool,
    args.invocation.action,
    args.invocation.semantics,
    args.invocation.bindings,
    args.invocation.sourceRevision,
    args.invocation.catalogDigest,
    args.invocation.routingSchema,
    args.invocation.routingDigest,
  ])
}

function reportAgentGraphImportProgress(
  callback: ((stage: LaunchAgentGraphImportProgressStage) => void) | undefined,
  stage: LaunchAgentGraphImportProgressStage,
): void {
  try {
    callback?.(stage)
  } catch {
    void 0
  }
}

export function canonicalLaunchRepositoryUrl(
  value: string,
  options: { forceRepository?: boolean } = {},
): string | null {
  if (!options.forceRepository && !isLaunchAgentGraphRepositoryUrl(value)) return null
  return normalizeAgentGraphRepositoryRemoteUrl(value)
}

export function isLaunchAgentGraphRepositoryUrl(value: string): boolean {
  try {
    const parsed = parseAgentGraphRepositoryUrl(value)
    return parsed.explicitGitSuffix || parsed.hostname === 'github.com' && parsed.repositoryPath.split('/').length === 2
  } catch {
    return false
  }
}

function launchImportErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('error' in value)) return null
  const message = String((value as { error?: unknown }).error || '').trim()
  return message || null
}

/**
 * Only a source-classified repository import may offer this recovery. A raw
 * rate-limit message from an arbitrary document URL is not enough to change
 * its import semantics.
 */
export function isLaunchImportRepositoryRateLimitFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const recovery = (value as { recovery?: unknown }).recovery
  if (!recovery || typeof recovery !== 'object' || (recovery as { kind?: unknown }).kind !== 'repository-graph') {
    return false
  }
  const message = launchImportErrorMessage(value)
  return !!message && isRemoteRateLimitFailureMessage(message)
}

export function canRecoverLaunchImportAsAgentGraphRepository(value: string): boolean {
  return canonicalLaunchRepositoryUrl(value, { forceRepository: true }) !== null
}

function isAgentGraphImportResult(value: unknown): value is WorkspaceAgentGraphImportResult {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'agent-graph'
}

function isHandledWorkspaceImport(result: void | WorkspaceBridgeImportResult): boolean {
  return !!result && (
    result.handled === true
    || (Array.isArray(result.createdPaths) && result.createdPaths.length > 0)
  )
}

async function retainImportedLocalImages(files: readonly File[], result: void | WorkspaceBridgeImportResult): Promise<void> {
  const paths = result && Array.isArray(result.createdPaths) ? result.createdPaths : []
  if (paths.length === 0) return
  const images = files.filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type))
  if (images.length === 0) return
  const [{ buildCorpusSourceUnit }, { registerStrybldrImageFiles }] = await Promise.all([
    import('@/features/queryable-corpus/sourceFilesCorpusManifest'),
    import('@/features/strybldr/strybldrImageFileRegistry'),
  ])
  const sourceUnits = images.flatMap(file => {
    const stem = file.name.replace(/\.[^.]+$/, '')
    const exact = paths.find(path => path.toLowerCase().endsWith(`/${file.name.toLowerCase()}.source.md`))
    const stemMatches = paths.filter(path => path.toLowerCase().endsWith(`/${stem.toLowerCase()}.source.md`))
    const path = exact || (stemMatches.length === 1 ? stemMatches[0] : null)
    return path ? [buildCorpusSourceUnit({ workspacePath: path, relativePath: file.name,
      originalName: file.name, text: '', mimeHint: file.type, byteSize: file.size,
      status: 'parsed', importMode: 'file' })] : []
  })
  if (sourceUnits.length === 0) return
  const mediaUrls = registerStrybldrImageFiles({ sourceUnits, files: images })
  if (files.length !== 1 || sourceUnits.length !== 1) return
  const imageUrl = mediaUrls[sourceUnits[0]!.id]
  if (!imageUrl) return
  const [{ useGraphStore }, media] = await Promise.all([
    import('@/hooks/useGraphStore'),
    import('@/features/immersive-media/immersiveMediaRuntime'),
  ])
  const prepared = media.setImmersiveMediaSource({ kind: 'image', url: imageUrl })
  if (prepared.error) throw Error(prepared.message)
  useGraphStore.getState().setFloatingPanelView('media')
  const opened = media.openImmersiveMedia()
  if (opened.error) throw Error(opened.message)
}

function finishAgentGraphImport(
  result: WorkspaceAgentGraphImportResult,
): WorkspaceAgentGraphImportResult {
  applyAgentGraphCanvasProjection(result)
  return result
}

async function materializeAgentGraphArtifact(args: {
  bridge: MarkdownWorkspaceActionBridge
  source: { kind: 'repository-url'; url: string } | { kind: 'folder' }
  invocation: WorkspaceAgentGraphInvocation
  result: WorkspaceAgentGraphImportResult
}): Promise<void> {
  const materialize = args.bridge.materializeAgentGraphImport
  if (typeof materialize !== 'function') return
  await materialize({
    source: args.source,
    ...(args.source.kind === 'repository-url' ? { repositoryUrl: args.source.url } : {}),
    invocation: args.invocation,
    result: args.result,
  })
}

export async function runLaunchImportLocalFiles(args: {
  files: WorkspaceFileSelection
  bridge: MarkdownWorkspaceActionBridge
  fallback: (files: ReadonlyArray<File>) => Promise<void | WorkspaceBridgeImportResult>
}): Promise<void | WorkspaceBridgeImportResult> {
  const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []
  if (snapshot.length === 0) return
  if (snapshot.length === 1 && snapshot[0]!.name.toLowerCase().endsWith('.json')) {
    const { importAgentRunFile } = await import('@/features/agent-ready/agentRunImport')
    if (await importAgentRunFile(snapshot[0]!)) return { handled: true }
  }
  const bridgeImport = args.bridge.importLocalFiles
  if (typeof bridgeImport === 'function') {
    let result: void | WorkspaceBridgeImportResult = undefined
    try {
      result = await bridgeImport(snapshot)
    } catch {
      void 0
    }
    if (isHandledWorkspaceImport(result)) {
      await retainImportedLocalImages(snapshot, result)
      return result
    }
  }
  const result = await args.fallback(snapshot)
  await retainImportedLocalImages(snapshot, result)
  return result
}

export async function runLaunchImportLocalFolderPreview(args: {
  files: WorkspaceFileSelection
  bridge: MarkdownWorkspaceActionBridge
  fallback: (files: ReadonlyArray<File>) => Promise<void | WorkspaceBridgeImportResult>
}): Promise<void | WorkspaceBridgeImportResult> {
  const snapshot = args.files ? Array.from(args.files as ArrayLike<File>) : []
  if (snapshot.length === 0) return
  const totalBytes = snapshot.reduce((sum, file) => sum + Math.max(0, Number(file?.size || 0)), 0)
  if (snapshot.length > LAUNCH_FOLDER_PREVIEW_MAX_FILES || totalBytes > LAUNCH_FOLDER_PREVIEW_MAX_BYTES) {
    throw new Error(
      `Browser folder preview is limited to ${LAUNCH_FOLDER_PREVIEW_MAX_FILES} files and ${Math.floor(LAUNCH_FOLDER_PREVIEW_MAX_BYTES / (1024 * 1024))} MiB.`,
    )
  }
  const bridgeImport = args.bridge.importLocalFolder
  if (typeof bridgeImport === 'function') {
    try {
      const result = await bridgeImport(snapshot)
      if (isHandledWorkspaceImport(result)) return result
    } catch {
      void 0
    }
  }
  return args.fallback(snapshot)
}

export function hasLaunchAgentGraphFolderImporter(bridge: MarkdownWorkspaceActionBridge): boolean {
  return typeof bridge.agentGraph?.importFolder === 'function'
}

export async function runLaunchImportAgentGraphFolder(args: {
  bridge: MarkdownWorkspaceActionBridge
  resolveMcpInvocation?: (mcpTool: string) => Promise<{ invocation: WorkspaceAgentGraphInvocation }>
}): Promise<WorkspaceAgentGraphImportResult> {
  const importFolder = args.bridge.agentGraph?.importFolder
  if (typeof importFolder !== 'function') {
    throw new Error('Canonical knowledge graph folder import is unavailable.')
  }
  const preview = createAgentGraphCanvasPreviewSession()
  try {
    const result = await importFolder()
    preview.commit(result)
    if (args.bridge.materializeAgentGraphImport) {
      const resolve = args.resolveMcpInvocation || (await import('@/features/agentic-os/agenticOsMcpInvocationResolver')).resolveAgenticOsMcpInvocation
      const { invocation } = await resolve(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphIngest)
      await materializeAgentGraphArtifact({ bridge: args.bridge, source: { kind: 'folder' }, invocation, result })
    }
    return result
  } catch (error) {
    preview.rollback()
    throw error
  }
}

export async function runLaunchImportUrl(args: {
  urlRaw: string
  opts?: WorkspaceImportUrlOpts
  bridge: MarkdownWorkspaceActionBridge
  fallback: (urlRaw: string, opts?: WorkspaceImportUrlOpts) => Promise<void | WorkspaceBridgeImportResult>
  forceAgentGraphRepository?: boolean
  resolveMcpInvocation?: (mcpTool: string) => Promise<{ invocation: WorkspaceAgentGraphInvocation }>
  onAgentGraphProgress?: (stage: LaunchAgentGraphImportProgressStage) => void
}): Promise<void | WorkspaceBridgeImportResult | WorkspaceAgentGraphImportResult> {
  const url = String(args.urlRaw || '').trim()
  if (!url) return
  const repositoryUrl = canonicalLaunchRepositoryUrl(url, {
    forceRepository: args.forceAgentGraphRepository,
  })
  if (repositoryUrl) {
    const importRepositoryUrl = args.bridge.agentGraph?.importRepositoryUrl
    if (typeof importRepositoryUrl !== 'function') {
      throw new Error('Canonical repository knowledge graph import is unavailable.')
    }
    reportAgentGraphImportProgress(args.onAgentGraphProgress, 'resolving')
    const resolved = args.resolveMcpInvocation
      ? await args.resolveMcpInvocation(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphIngest)
      : await import('@/features/agentic-os/agenticOsMcpInvocationResolver').then(
        ({ resolveAgenticOsMcpInvocation }) => resolveAgenticOsMcpInvocation(
          AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agentGraphIngest,
        ),
      )
    reportAgentGraphImportProgress(args.onAgentGraphProgress, 'ingesting')
    const operationKey = repositoryImportOperationKey({
      repositoryUrl,
      opts: args.opts,
      invocation: resolved.invocation,
      importer: importRepositoryUrl as unknown as object,
    })
    const existingOperation = inFlightRepositoryImports.get(operationKey)
    let result: WorkspaceAgentGraphImportResult
    if (existingOperation) {
      result = await existingOperation
    } else {
      const preview = createAgentGraphCanvasPreviewSession()
      const operation = Promise.resolve().then(() => importRepositoryUrl(
        repositoryUrl,
        args.opts,
        resolved.invocation,
        preview.apply,
      ))
      const completedOperation = operation
        .then(async importResult => {
          preview.commit(importResult)
          await materializeAgentGraphArtifact({
            bridge: args.bridge,
            source: { kind: 'repository-url', url: repositoryUrl },
            invocation: resolved.invocation,
            result: importResult,
          })
          return importResult
        })
        .catch(error => {
          preview.rollback()
          throw error
        })
      inFlightRepositoryImports.set(operationKey, completedOperation)
      try {
        result = await completedOperation
      } finally {
        if (inFlightRepositoryImports.get(operationKey) === completedOperation) {
          inFlightRepositoryImports.delete(operationKey)
        }
      }
    }
    reportAgentGraphImportProgress(args.onAgentGraphProgress, 'projecting')
    return result
  }
  const bridgeImport = args.bridge.importUrl
  if (typeof bridgeImport === 'function') {
    let result: void | WorkspaceBridgeImportResult
    try {
      result = await bridgeImport(url, args.opts)
    } catch {
      return args.fallback(url, args.opts)
    }
    if (isAgentGraphImportResult(result)) return finishAgentGraphImport(result)
    if (isHandledWorkspaceImport(result)) return result
  }
  return args.fallback(url, args.opts)
}
