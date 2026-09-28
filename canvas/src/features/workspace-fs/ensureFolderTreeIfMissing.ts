import { resolveInitializedWorkspaceFs } from './workspaceFsInitialization'
import { normalizeWorkspacePath } from './path'
import type { WorkspaceFs, WorkspacePath } from './types'

/** One operation may reuse its folder inventory without rereading document bodies. */
export async function createWorkspaceFolderTreeEnsurer(injected?: WorkspaceFs): Promise<(path: WorkspacePath) => Promise<void>> {
  const fs = await resolveInitializedWorkspaceFs(injected)
  const list = await fs.listEntries()
  const folders = new Set(
    list
      .filter(entry => entry.kind === 'folder')
      .map(entry => normalizeWorkspacePath(entry.path)),
  )
  let tail = Promise.resolve()
  return folderPath => {
    const ensure = async () => {
      let parent: WorkspacePath = '/'
      for (const name of normalizeWorkspacePath(folderPath).split('/').map(part => part.trim()).filter(Boolean)) {
        const next = normalizeWorkspacePath(`${parent === '/' ? '' : parent}/${name}`)
        if (!folders.has(next)) {
          const created = normalizeWorkspacePath(await fs.createFolder({ parentPath: parent, name }))
          if (created !== next) throw new Error(`Workspace folder changed while creating ${next}`)
          folders.add(next)
        }
        parent = next
      }
    }
    const pending = tail.then(ensure)
    tail = pending.catch(() => undefined)
    return pending
  }
}

export async function ensureWorkspaceFolderTreeIfMissing(args: {
  folderPath: WorkspacePath
  fs?: WorkspaceFs
}): Promise<void> {
  if (normalizeWorkspacePath(args.folderPath) === '/') return
  await (await createWorkspaceFolderTreeEnsurer(args.fs))(args.folderPath)
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
