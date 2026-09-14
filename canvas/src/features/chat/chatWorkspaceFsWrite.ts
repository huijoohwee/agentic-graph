import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { resolveInitializedWorkspaceFs } from '@/features/workspace-fs/workspaceFsInitialization'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

export const ensureWorkspaceFolderPathExists = async (folderPath: string): Promise<string> => {
  const normalized = normalizeWorkspacePath(folderPath)
  const fs = await resolveInitializedWorkspaceFs()
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: normalized })
  return normalized
}

export const writeWorkspaceFileTextEnsuringFile = async (args: {
  fs?: WorkspaceFs
  path: string
  text: string
}): Promise<void> => {
  const normalized = normalizeWorkspacePath(args.path)
  const fs = await resolveInitializedWorkspaceFs(args.fs)
  const existing = await fs.readFileText(normalized)
  const idx = normalized.lastIndexOf('/')
  const parentPath = normalizeWorkspacePath(idx > 0 ? normalized.slice(0, idx) : '/')
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  if (existing === null) {
    const name = normalized.split('/').filter(Boolean).slice(-1)[0] || ''
    if (name) {
      try {
        await fs.createFile({ parentPath, name, text: args.text })
      } catch {
        await fs.writeFileText(normalized, args.text)
      }
    }
  } else {
    await fs.writeFileText(normalized, args.text)
  }
  const persistedText = await fs.readFileText(normalized)
  if (persistedText !== args.text) {
    throw new Error(`Workspace text artifact persistence verification failed for ${normalized}`)
  }
}
