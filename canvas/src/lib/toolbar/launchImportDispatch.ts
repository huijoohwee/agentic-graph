import type {
  MarkdownWorkspaceActionBridge,
  WorkspaceBridgeImportResult,
  WorkspaceFileSelection,
  WorkspaceKnowledgeGraphImportResult,
  WorkspaceKnowledgeGraphInvocation,
  WorkspaceImportUrlOpts,
} from '@/features/markdown-explorer/workspaceActionBridge'
import {
  applyKnowledgeGraphCanvasProjection,
  createKnowledgeGraphCanvasPreviewSession,
} from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import {
  normalizeKnowledgeGraphRepositoryRemoteUrl,
  parseKnowledgeGraphRepositoryUrl,
} from '@/features/knowledge-graph/knowledgeGraphRepositoryUrl'
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs'
import { isRemoteRateLimitFailureMessage } from '@/lib/net/fetchRemoteTextFailure'

export const LAUNCH_FOLDER_PREVIEW_MAX_FILES = 100
export const LAUNCH_FOLDER_PREVIEW_MAX_BYTES = 25 * 1024 * 1024

export type LaunchKnowledgeGraphImportProgressStage = 'resolving' | 'ingesting' | 'projecting'

const repositoryImporterIds = new WeakMap<object, number>()
const inFlightRepositoryImports = new Map<string, Promise<WorkspaceKnowledgeGraphImportResult>>()
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
  invocation: WorkspaceKnowledgeGraphInvocation
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

function reportKnowledgeGraphImportProgress(
  callback: ((stage: LaunchKnowledgeGraphImportProgressStage) => void) | undefined,
  stage: LaunchKnowledgeGraphImportProgressStage,
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
  return normalizeKnowledgeGraphRepositoryRemoteUrl(value)
}

export function isLaunchKnowledgeGraphRepositoryUrl(value: string): boolean {
  try {
    return parseKnowledgeGraphRepositoryUrl(value).explicitGitSuffix
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

export function canRecoverLaunchImportAsKnowledgeGraphRepository(value: string): boolean {
  return canonicalLaunchRepositoryUrl(value, { forceRepository: true }) !== null
}

function isKnowledgeGraphImportResult(value: unknown): value is WorkspaceKnowledgeGraphImportResult {
  return !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'knowledge-graph'
}

function isHandledWorkspaceImport(result: void | WorkspaceBridgeImportResult): boolean {
  return !!result && (
    result.handled === true
    || (Array.isArray(result.createdPaths) && result.createdPaths.length > 0)
  )
}

function finishKnowledgeGraphImport(
  result: WorkspaceKnowledgeGraphImportResult,
): WorkspaceKnowledgeGraphImportResult {
  applyKnowledgeGraphCanvasProjection(result)
  return result
}

async function materializeRepositoryKnowledgeGraphArtifact(args: {
  bridge: MarkdownWorkspaceActionBridge
  repositoryUrl: string
  invocation: WorkspaceKnowledgeGraphInvocation
  result: WorkspaceKnowledgeGraphImportResult
}): Promise<void> {
  const materialize = args.bridge.materializeKnowledgeGraphImport
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

export function hasLaunchKnowledgeGraphFolderImporter(bridge: MarkdownWorkspaceActionBridge): boolean {
  return typeof bridge.knowledgeGraph?.importFolder === 'function'
}

export async function runLaunchImportKnowledgeGraphFolder(args: {
  bridge: MarkdownWorkspaceActionBridge
}): Promise<WorkspaceKnowledgeGraphImportResult> {
  const importFolder = args.bridge.knowledgeGraph?.importFolder
  if (typeof importFolder !== 'function') {
    throw new Error('Canonical knowledge graph folder import is unavailable.')
  }
  return finishKnowledgeGraphImport(await importFolder())
}

export async function runLaunchImportUrl(args: {
  urlRaw: string
  opts?: WorkspaceImportUrlOpts
  bridge: MarkdownWorkspaceActionBridge
  fallback: (urlRaw: string, opts?: WorkspaceImportUrlOpts) => Promise<void | WorkspaceBridgeImportResult>
  forceKnowledgeGraphRepository?: boolean
  resolveMcpInvocation?: (mcpTool: string) => Promise<{ invocation: WorkspaceKnowledgeGraphInvocation }>
  onKnowledgeGraphProgress?: (stage: LaunchKnowledgeGraphImportProgressStage) => void
}): Promise<void | WorkspaceBridgeImportResult | WorkspaceKnowledgeGraphImportResult> {
  const url = String(args.urlRaw || '').trim()
  if (!url) return
  const repositoryUrl = canonicalLaunchRepositoryUrl(url, {
    forceRepository: args.forceKnowledgeGraphRepository,
  })
  if (repositoryUrl) {
    const importRepositoryUrl = args.bridge.knowledgeGraph?.importRepositoryUrl
    if (typeof importRepositoryUrl !== 'function') {
      throw new Error('Canonical repository knowledge graph import is unavailable.')
    }
    reportKnowledgeGraphImportProgress(args.onKnowledgeGraphProgress, 'resolving')
    const resolved = args.resolveMcpInvocation
      ? await args.resolveMcpInvocation(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest)
      : await import('@/features/agentic-os/agenticOsMcpInvocationResolver').then(
        ({ resolveAgenticOsMcpInvocation }) => resolveAgenticOsMcpInvocation(
          AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
        ),
      )
    reportKnowledgeGraphImportProgress(args.onKnowledgeGraphProgress, 'ingesting')
    const operationKey = repositoryImportOperationKey({
      repositoryUrl,
      opts: args.opts,
      invocation: resolved.invocation,
      importer: importRepositoryUrl as unknown as object,
    })
    const existingOperation = inFlightRepositoryImports.get(operationKey)
    let result: WorkspaceKnowledgeGraphImportResult
    if (existingOperation) {
      result = await existingOperation
    } else {
      const preview = createKnowledgeGraphCanvasPreviewSession()
      const operation = Promise.resolve().then(() => importRepositoryUrl(
        repositoryUrl,
        args.opts,
        resolved.invocation,
        preview.apply,
      ))
      const completedOperation = operation
        .then(async importResult => {
          preview.commit(importResult)
          await materializeRepositoryKnowledgeGraphArtifact({
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
    reportKnowledgeGraphImportProgress(args.onKnowledgeGraphProgress, 'projecting')
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
    if (isKnowledgeGraphImportResult(result)) return finishKnowledgeGraphImport(result)
    if (isHandledWorkspaceImport(result)) return result
  }
  return args.fallback(url, args.opts)
}
