import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { ensureMarkdownFileName, upsertWorkspaceTextDocument } from '@/features/workspace-fs/upsertWorkspaceTextDocument'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { setWorkspaceEntrySource, type WorkspaceEntrySource, type WorkspaceSourceIndexWriteOptions } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'

export type UpsertWorkspaceMarkdownSourceFileArgs = {
  parentPath: WorkspacePath
  name: string
  text: string
  fs?: WorkspaceFs
  source?: WorkspaceEntrySource | null
  sourcePersistence?: WorkspaceSourceIndexWriteOptions['persist']
}

/**
 * Writes a Markdown source document without changing the active editor or
 * canvas. Interactive wrappers such as New .md can layer selection behavior
 * on top of this shared workspace persistence primitive.
 */
export async function upsertWorkspaceMarkdownSourceFile(
  args: UpsertWorkspaceMarkdownSourceFileArgs,
): Promise<WorkspacePath> {
  const fs = args.fs || await getWorkspaceFs()
  const parentPath = normalizeWorkspacePath(args.parentPath)
  const name = ensureMarkdownFileName(args.name)

  await fs.ensureSeed()
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parentPath })
  const path = await upsertWorkspaceTextDocument({
    fs,
    parentPath,
    name,
    text: String(args.text ?? ''),
  })

  if (typeof args.source !== 'undefined') {
    setWorkspaceEntrySource(path, args.source, {
      persist: args.sourcePersistence,
    })
  }
  return normalizeWorkspacePath(path)
}
