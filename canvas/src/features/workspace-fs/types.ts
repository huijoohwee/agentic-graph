export type WorkspaceEntryKind = 'file' | 'folder'

export type WorkspacePath = string

export type WorkspaceEntry = {
  path: WorkspacePath
  parentPath: WorkspacePath | null
  kind: WorkspaceEntryKind
  name: string
  text?: string
  updatedAtMs: number
}

export type WorkspaceFsMutationOptions = {
  mirrorToHost?: boolean
}

export type WorkspaceFsWriteOptions = WorkspaceFsMutationOptions & { expectedText?: string | null }
export class WorkspaceSourceTextConflictError extends Error {
  constructor() { super('Workspace source changed in another tab. Reload before saving; stored data was retained.') }
}

export type WorkspaceFs = {
  ensureSeed: () => Promise<boolean>
  listEntries: () => Promise<WorkspaceEntry[]>
  readFileText: (path: WorkspacePath) => Promise<string | null>
  writeFileText: (path: WorkspacePath, text: string, options?: WorkspaceFsWriteOptions) => Promise<void>
  createFile: (args: { parentPath: WorkspacePath; name: string; text: string } & WorkspaceFsMutationOptions) => Promise<WorkspacePath>
  createFolder: (args: { parentPath: WorkspacePath; name: string } & WorkspaceFsMutationOptions) => Promise<WorkspacePath>
  deleteEntry: (path: WorkspacePath, options?: WorkspaceFsMutationOptions) => Promise<void>
}

export type WorkspaceOutlineItem = {
  id: string
  text: string
  level: number
  line: number
}

export type WorkspaceBacklink = {
  fromPath: WorkspacePath
  line: number
  lineText: string
}
