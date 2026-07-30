import type {
  MarkdownWorkspaceActionBridge,
  WorkspaceBridgeImportResult,
  WorkspaceFileSelection,
  WorkspaceImportUrlOpts,
} from '@/features/markdown-explorer/workspaceActionBridge'

function hasCreatedWorkspacePaths(result: void | WorkspaceBridgeImportResult): boolean {
  return !!result && Array.isArray(result.createdPaths) && result.createdPaths.length > 0
}

function hasHandledWorkspaceUrlImport(result: void | WorkspaceBridgeImportResult): boolean {
  return !!result && (result.handled === true || hasCreatedWorkspacePaths(result))
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
      if (hasCreatedWorkspacePaths(result)) return result
    } catch {
      void 0
    }
  }
  return args.fallback(snapshot)
}

export async function runLaunchImportUrl(args: {
  urlRaw: string
  opts?: WorkspaceImportUrlOpts
  bridge: MarkdownWorkspaceActionBridge
  fallback: (urlRaw: string, opts?: WorkspaceImportUrlOpts) => Promise<void | WorkspaceBridgeImportResult>
}): Promise<void | WorkspaceBridgeImportResult> {
  const url = String(args.urlRaw || '').trim()
  if (!url) return
  const bridgeImport = args.bridge.importUrl
  if (typeof bridgeImport === 'function') {
    try {
      const result = await bridgeImport(url, args.opts)
      if (hasHandledWorkspaceUrlImport(result)) return result
    } catch {
      void 0
    }
  }
  return args.fallback(url, args.opts)
}
