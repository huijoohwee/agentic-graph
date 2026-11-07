import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { ancestorPathsForWorkspacePath, normalizeWorkspacePath, workspaceBasename } from '@/features/workspace-fs/path'

/** Publish only tree metadata. The document remains in WorkspaceFs until opened. */
export function addCompletedWebsiteFileToExplorer(entries: WorkspaceEntry[], rawPath: WorkspacePath): WorkspaceEntry[] {
  const path = normalizeWorkspacePath(rawPath)
  const known = new Set(entries.map(entry => entry.path))
  if (known.has(path)) return entries
  const now = Date.now()
  const additions: WorkspaceEntry[] = []
  for (const folderPath of ancestorPathsForWorkspacePath(path)) {
    if (known.has(folderPath)) continue
    const parentPath = ancestorPathsForWorkspacePath(folderPath).at(-1) || '/'
    additions.push({ path: folderPath, parentPath, kind: 'folder', name: workspaceBasename(folderPath), updatedAtMs: now })
    known.add(folderPath)
  }
  const parentPath = ancestorPathsForWorkspacePath(path).at(-1) || '/'
  additions.push({ path, parentPath, kind: 'file', name: workspaceBasename(path), updatedAtMs: now })
  return [...entries, ...additions]
}
