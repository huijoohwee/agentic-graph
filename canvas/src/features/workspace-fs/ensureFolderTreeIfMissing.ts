import { resolveInitializedWorkspaceFs } from './workspaceFsInitialization'
import { normalizeWorkspacePath } from './path'
import type { WorkspaceFs, WorkspacePath } from './types'

export async function ensureWorkspaceFolderTreeIfMissing(args: {
  folderPath: WorkspacePath
  fs?: WorkspaceFs
}): Promise<void> {
  const normalized = normalizeWorkspacePath(args.folderPath)
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return
  const fs = await resolveInitializedWorkspaceFs(args.fs)
  const list = await fs.listEntries()
  const folders = new Set(
    list
      .filter(entry => entry.kind === 'folder')
      .map(entry => normalizeWorkspacePath(entry.path)),
  )
  let parent: WorkspacePath = '/'
  for (const rawSegment of segments) {
    const name = String(rawSegment || '').trim()
    if (!name) continue
    const next = normalizeWorkspacePath(`${parent === '/' ? '' : parent}/${name}`)
    if (!folders.has(next)) {
      try {
        await fs.createFolder({ parentPath: parent, name })
        folders.add(next)
      } catch {
        void 0
      }
    }
    parent = next
  }
}

export async function ensureWorkspaceFolderPathIfMissing(args: {
  parentPath?: WorkspacePath
  relativeFolderPath: string
  fs?: WorkspaceFs
}): Promise<WorkspacePath> {
  const parentPath = normalizeWorkspacePath(args.parentPath || '/')
  const relativeFolderPath = String(args.relativeFolderPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!relativeFolderPath) return parentPath
  const folderPath = normalizeWorkspacePath(`${parentPath === '/' ? '' : parentPath}/${relativeFolderPath}`)
  await ensureWorkspaceFolderTreeIfMissing({ folderPath, fs: args.fs })
  return folderPath
}
