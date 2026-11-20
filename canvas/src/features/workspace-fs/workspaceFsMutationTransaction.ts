import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from './types'
import { normalizeWorkspacePath } from './path'
import { LS_KEYS } from '@/lib/config'
import { lsBool, lsRemove, lsSetBool } from '@/lib/persistence'

type WorkspaceEntryBeforeMutation = WorkspaceEntry | null

const cloneEntry = (entry: WorkspaceEntry): WorkspaceEntry => ({ ...entry })

const sortShallowFirst = (left: WorkspacePath, right: WorkspacePath): number =>
  left.split('/').length - right.split('/').length || left.localeCompare(right)

const sortDeepFirst = (left: WorkspacePath, right: WorkspacePath): number =>
  right.split('/').length - left.split('/').length || right.localeCompare(left)

export type WorkspaceFsMutationTransaction = Readonly<{
  fs: WorkspaceFs
  rollback: () => Promise<void>
}>

/** Records only transaction-owned mutations so cancellation does not replace unrelated workspace state. */
export function createWorkspaceFsMutationTransaction(inner: WorkspaceFs): WorkspaceFsMutationTransaction {
  const beforeByPath = new Map<WorkspacePath, WorkspaceEntryBeforeMutation>()
  const userClearedAllFilesBeforeMutation = lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)

  const capturePath = async (path: WorkspacePath, includeDescendants = false): Promise<void> => {
    const targetPath = normalizeWorkspacePath(path)
    const prefix = targetPath === '/' ? '/' : `${targetPath}/`
    const entries = await inner.listEntries()
    const matches = entries.filter(entry => {
      const entryPath = normalizeWorkspacePath(entry.path)
      return entryPath === targetPath || (includeDescendants && entryPath.startsWith(prefix))
    })
    if (matches.length === 0 && !beforeByPath.has(targetPath)) beforeByPath.set(targetPath, null)
    for (const entry of matches) {
      const entryPath = normalizeWorkspacePath(entry.path)
      if (!beforeByPath.has(entryPath)) beforeByPath.set(entryPath, cloneEntry(entry))
    }
  }

  const fs: WorkspaceFs = {
    // The caller establishes the seed baseline before opening the transaction.
    ensureSeed: async () => false,
    listEntries: () => inner.listEntries(),
    readFileText: path => inner.readFileText(path),
    writeFileText: async (path, text) => {
      await capturePath(path)
      await inner.writeFileText(path, text, { mirrorToHost: false })
    },
    createFile: async args => {
      const path = normalizeWorkspacePath(await inner.createFile({ ...args, mirrorToHost: false }))
      if (!beforeByPath.has(path)) beforeByPath.set(path, null)
      return path
    },
    createFolder: async args => {
      const path = normalizeWorkspacePath(await inner.createFolder({ ...args, mirrorToHost: false }))
      if (!beforeByPath.has(path)) beforeByPath.set(path, null)
      return path
    },
    deleteEntry: async (path, options) => {
      await capturePath(path, true)
      await inner.deleteEntry(path, { ...options, mirrorToHost: false })
    },
  }

  const rollback = async (): Promise<void> => {
    const pathsToDelete = [...beforeByPath.entries()]
      .filter(([, entry]) => entry === null)
      .map(([path]) => path)
      .sort(sortDeepFirst)
    for (const path of pathsToDelete) await inner.deleteEntry(path, { mirrorToHost: false })

    const foldersToRestore = [...beforeByPath.values()]
      .filter((entry): entry is WorkspaceEntry => entry?.kind === 'folder')
      .sort((left, right) => sortShallowFirst(left.path, right.path))
    let currentPaths = new Set((await inner.listEntries()).map(entry => normalizeWorkspacePath(entry.path)))
    for (const entry of foldersToRestore) {
      const path = normalizeWorkspacePath(entry.path)
      if (currentPaths.has(path) || !entry.parentPath) continue
      const restoredPath = normalizeWorkspacePath(await inner.createFolder({
        parentPath: normalizeWorkspacePath(entry.parentPath),
        name: entry.name,
        mirrorToHost: false,
      }))
      if (restoredPath !== path) throw new Error(`Workspace rollback could not restore folder ${path}`)
      currentPaths.add(path)
    }

    const filesToRestore = [...beforeByPath.values()]
      .filter((entry): entry is WorkspaceEntry => entry?.kind === 'file')
      .sort((left, right) => sortShallowFirst(left.path, right.path))
    currentPaths = new Set((await inner.listEntries()).map(entry => normalizeWorkspacePath(entry.path)))
    for (const entry of filesToRestore) {
      const path = normalizeWorkspacePath(entry.path)
      const text = String(entry.text ?? '')
      if (currentPaths.has(path)) {
        await inner.writeFileText(path, text, { mirrorToHost: false })
        continue
      }
      const restoredPath = normalizeWorkspacePath(await inner.createFile({
        parentPath: normalizeWorkspacePath(entry.parentPath || '/'),
        name: entry.name,
        text,
        mirrorToHost: false,
      }))
      if (restoredPath !== path) throw new Error(`Workspace rollback could not restore file ${path}`)
      currentPaths.add(path)
    }

    const restoredEntries = new Map(
      (await inner.listEntries()).map(entry => [normalizeWorkspacePath(entry.path), entry] as const),
    )
    for (const [path, entryBeforeMutation] of beforeByPath) {
      const restoredEntry = restoredEntries.get(path) || null
      if (entryBeforeMutation === null) {
        if (restoredEntry) throw new Error(`Workspace rollback retained transaction-created entry ${path}`)
        continue
      }
      if (!restoredEntry || restoredEntry.kind !== entryBeforeMutation.kind) {
        throw new Error(`Workspace rollback did not restore ${path}`)
      }
      if (entryBeforeMutation.kind === 'file') {
        const restoredText = await inner.readFileText(path)
        if (restoredText !== String(entryBeforeMutation.text ?? '')) {
          throw new Error(`Workspace rollback did not restore bytes for ${path}`)
        }
      }
    }
    if (userClearedAllFilesBeforeMutation) lsSetBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, true)
    else lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
  }

  return Object.freeze({ fs, rollback })
}
