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
  if (!options.forceRepository) {
    try {
      if (!/\.git\/?$/i.test(new URL(value).pathname)) return null
    } catch {
      return null
    }
  }
  return normalizeAgentGraphRepositoryRemoteUrl(value)
}

export function isLaunchAgentGraphRepositoryUrl(value: string): boolean {
  try {
    return parseAgentGraphRepositoryUrl(value).explicitGitSuffix
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

function finishAgentGraphImport(
  result: WorkspaceAgentGraphImportResult,
): WorkspaceAgentGraphImportResult {
  applyAgentGraphCanvasProjection(result)
  return result
}

async function materializeRepositoryAgentGraphArtifact(args: {
  bridge: MarkdownWorkspaceActionBridge
  repositoryUrl: string
  invocation: WorkspaceAgentGraphInvocation
  result: WorkspaceAgentGraphImportResult
}): Promise<void> {
  const materialize = args.bridge.materializeAgentGraphImport
  if (typeof materialize !== 'function') return
  await materialize({
    repositoryUrl: args.repositoryUrl,
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
  const bridgeImport = args.bridge.importLocalFiles
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
}): Promise<WorkspaceAgentGraphImportResult> {
  const importFolder = args.bridge.agentGraph?.importFolder
  if (typeof importFolder !== 'function') {
    throw new Error('Canonical knowledge graph folder import is unavailable.')
  }
  return finishAgentGraphImport(await importFolder())
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
          await materializeRepositoryAgentGraphArtifact({
            bridge: args.bridge,
            repositoryUrl,
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
