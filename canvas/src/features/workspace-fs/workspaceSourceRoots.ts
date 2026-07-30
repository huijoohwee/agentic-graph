import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT, normalizeChatLocalStorageRootPath } from '@/features/chat/chatStorageConfig'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { readWorkspaceImportShareExportRootPathSetting } from '@/lib/workspace/workspaceStoreSyncSettings'

export const WORKSPACE_DOCS_SOURCE_ROOT_PATH = '/docs' as WorkspacePath
export const WORKSPACE_OUTPUT_SOURCE_ROOT_PATH = '/docs_' as WorkspacePath
export const WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH = '/notes' as WorkspacePath
// Agentic Canvas OS documents remain available to the workspace runtime, but are
// reference material rather than operator-owned Source Files.
export const WORKSPACE_AGENTIC_OS_DOCS_SOURCE_ROOT_PATH = '/agentic-canvas-os/docs' as WorkspacePath
export const DEFAULT_WORKSPACE_SOURCE_ROOT_PATHS: WorkspacePath[] = [
  WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
  WORKSPACE_OUTPUT_SOURCE_ROOT_PATH,
  WORKSPACE_DOCS_SOURCE_ROOT_PATH,
  CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT,
]

export function isWorkspaceCanonicalDocsMirrorPath(path: string): boolean {
  const normalizedPath = normalizeWorkspacePath(path as WorkspacePath)
  return normalizedPath === WORKSPACE_DOCS_SOURCE_ROOT_PATH
    || normalizedPath.startsWith(`${WORKSPACE_DOCS_SOURCE_ROOT_PATH}/`)
    || normalizedPath === WORKSPACE_AGENTIC_OS_DOCS_SOURCE_ROOT_PATH
    || normalizedPath.startsWith(`${WORKSPACE_AGENTIC_OS_DOCS_SOURCE_ROOT_PATH}/`)
}

function readWorkspaceConfiguredDocsMirrorRootPath(): WorkspacePath {
  const configured = normalizeWorkspacePath(readWorkspaceImportShareExportRootPathSetting() as WorkspacePath)
  if (!configured || configured === '/') return WORKSPACE_DOCS_SOURCE_ROOT_PATH
  return configured
}

export function resolveWorkspaceSourceRootPaths(args?: {
  chatLocalStorageRootPath?: string | null | undefined
}): WorkspacePath[] {
  const chatRoot = normalizeWorkspacePath(
    normalizeChatLocalStorageRootPath(args?.chatLocalStorageRootPath || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT) as WorkspacePath,
  )
  const docsRoot = readWorkspaceConfiguredDocsMirrorRootPath()
  const unique = new Set<string>()
  const ordered: WorkspacePath[] = []
  for (const candidate of [
    WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
    docsRoot,
    WORKSPACE_OUTPUT_SOURCE_ROOT_PATH,
    WORKSPACE_DOCS_SOURCE_ROOT_PATH,
    chatRoot,
  ]) {
    const normalized = normalizeWorkspacePath(candidate as WorkspacePath)
    if (!normalized || normalized === '/') continue
    if (isWorkspaceRuntimeOnlyReferencePath(normalized)) continue
    if (unique.has(normalized)) continue
    unique.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

export function normalizeWorkspaceSourceRootPaths(rootPaths?: ReadonlyArray<string>): WorkspacePath[] {
  const unique = new Set<string>()
  const ordered: WorkspacePath[] = []
  const input = Array.isArray(rootPaths) && rootPaths.length > 0
    ? rootPaths
    : DEFAULT_WORKSPACE_SOURCE_ROOT_PATHS
  for (let i = 0; i < input.length; i += 1) {
    const raw = String(input[i] || '').trim()
    if (!raw) continue
    const normalized = normalizeWorkspacePath(raw as WorkspacePath)
    if (isWorkspaceRuntimeOnlyReferencePath(normalized)) continue
    if (unique.has(normalized)) continue
    unique.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

export function isWorkspaceRuntimeOnlyReferencePath(path: string): boolean {
  const normalizedPath = normalizeWorkspacePath(path as WorkspacePath)
  return normalizedPath === WORKSPACE_AGENTIC_OS_DOCS_SOURCE_ROOT_PATH
    || normalizedPath.startsWith(`${WORKSPACE_AGENTIC_OS_DOCS_SOURCE_ROOT_PATH}/`)
}

export function projectWorkspaceEntriesToSourceFilesExplorer(
  entries: ReadonlyArray<WorkspaceEntry>,
  rootPaths?: ReadonlyArray<string>,
): WorkspaceEntry[] {
  const roots = normalizeWorkspaceSourceRootPaths(rootPaths)
  return entries.filter(entry => {
    const path = normalizeWorkspacePath(entry?.path)
    if (!path || path === '/' || isWorkspaceRuntimeOnlyReferencePath(path)) return false
    for (const root of roots) {
      if (path === root || path.startsWith(`${root}/`)) return true
      if (entry.kind === 'folder' && root.startsWith(`${path}/`)) return true
    }
    return false
  })
}

export function isWorkspacePathUnderSourceRoots(path: string, rootPaths?: ReadonlyArray<string>): boolean {
  const normalizedPath = normalizeWorkspacePath(path as WorkspacePath)
  const roots = normalizeWorkspaceSourceRootPaths(rootPaths)
  for (let i = 0; i < roots.length; i += 1) {
    const root = normalizeWorkspacePath(String(roots[i] || '') as WorkspacePath)
    if (!root || root === '/') continue
    if (normalizedPath === root || normalizedPath.startsWith(`${root}/`)) return true
  }
  return false
}
