import type {
  MarkdownWorkspaceActionBridge,
  WorkspaceBridgeImportResult,
  WorkspaceFileSelection,
  WorkspaceKnowledgeGraphImportResult,
  WorkspaceKnowledgeGraphInvocation,
  WorkspaceImportUrlOpts,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { parseGitHubRepoUrl } from '@/features/markdown-workspace/githubRepoApi'
import { applyKnowledgeGraphCanvasProjection } from '@/features/knowledge-graph/knowledgeGraphCanvasProjection'
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from '@/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import { targetSkillsCommandsMcpInvocation } from '@/features/agentic-os/skillsCommandsMcpTarget'

export const LAUNCH_FOLDER_PREVIEW_MAX_FILES = 100
export const LAUNCH_FOLDER_PREVIEW_MAX_BYTES = 25 * 1024 * 1024

function canonicalGitHubRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'github.com'
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
    ) return null
    if (!parseGitHubRepoUrl(url.href)) return null
    return `https://github.com${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
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
  resolveMcpInvocation?: (mcpTool: string) => Promise<{ invocation: WorkspaceKnowledgeGraphInvocation }>
}): Promise<void | WorkspaceBridgeImportResult | WorkspaceKnowledgeGraphImportResult> {
  const url = String(args.urlRaw || '').trim()
  if (!url) return
  const repositoryUrl = canonicalGitHubRepositoryUrl(url)
  if (!repositoryUrl && parseGitHubRepoUrl(url)) {
    throw new Error('Repository URL must use canonical credential-free HTTPS without a port, query, or fragment.')
  }
  if (repositoryUrl) {
    const importRepositoryUrl = args.bridge.knowledgeGraph?.importRepositoryUrl
    if (typeof importRepositoryUrl !== 'function') {
      throw new Error('Canonical repository knowledge graph import is unavailable.')
    }
    const resolved = await (args.resolveMcpInvocation || targetSkillsCommandsMcpInvocation)(
      KNOWGRPH_LOCAL_MCP_TOOL_NAMES.knowledgeGraphIngest,
    )
    return finishKnowledgeGraphImport(await importRepositoryUrl(repositoryUrl, args.opts, resolved.invocation))
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
