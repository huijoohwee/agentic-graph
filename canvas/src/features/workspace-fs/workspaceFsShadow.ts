import type { WorkspaceEntry, WorkspacePath } from './types'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath, workspaceBasename } from './path'
import { isLegacyWorkspaceSourcePath } from './workspaceLegacySourceRoots'
import { isMigratedAuthoredMarkdownNoteMirrorPath } from './workspaceAuthoredNotes'
import { loadWorkspaceSourceIndex } from './sourceIndex'

export const SHADOW_MAX_FILE_TEXT_CHARS = 2_000_000

let shadowByPath: Map<string, WorkspaceEntry> | null = null

const ensureShadow = () => {
  if (shadowByPath) return shadowByPath
  shadowByPath = new Map<string, WorkspaceEntry>()
  shadowByPath.set(WORKSPACE_ROOT_PATH, {
    path: WORKSPACE_ROOT_PATH,
    parentPath: null,
    kind: 'folder',
    name: '',
    updatedAtMs: Date.now(),
  })
  return shadowByPath
}

export const upsertShadowEntry = (entry: WorkspaceEntry) => {
  const shadow = ensureShadow()
  const normalized = normalizeWorkspacePath(entry.path)
  if (!normalized) return
  const kind = entry.kind === 'file' || entry.kind === 'folder' ? entry.kind : null
  if (!kind) return
  const next: WorkspaceEntry = {
    path: normalized,
    parentPath: entry.parentPath ? normalizeWorkspacePath(entry.parentPath) : null,
    kind,
    name: String(entry.name ?? ''),
    previousPaths: entry.previousPaths,
    updatedAtMs: typeof entry.updatedAtMs === 'number' ? entry.updatedAtMs : Date.now(),
    ...(kind === 'file'
      ? { text: typeof entry.text === 'string' && entry.text.length <= SHADOW_MAX_FILE_TEXT_CHARS ? entry.text : '' }
      : {}),
  }
  shadow.set(normalized, next)
}

export const deleteShadowEntry = (path: WorkspacePath) => {
  const shadow = ensureShadow()
  const p = normalizeWorkspacePath(path)
  if (!p || p === WORKSPACE_ROOT_PATH) return false
  let changed = shadow.delete(p)
  const prefix = p.endsWith('/') ? p : `${p}/`
  for (const key of [...shadow.keys()]) {
    if (key.startsWith(prefix) && shadow.delete(key)) changed = true
  }
  return changed
}

export const snapshotShadowEntries = (): WorkspaceEntry[] => {
  const shadow = ensureShadow()
  const sourceIndex = loadWorkspaceSourceIndex()
  for (const path of [...shadow.keys()]) {
    if (
      isLegacyWorkspaceSourcePath(path)
      || isMigratedAuthoredMarkdownNoteMirrorPath(path, sourceIndex)
    ) deleteShadowEntry(path)
  }
  return [...shadow.values()]
}

export const mergeEntriesWithShadow = (entries: WorkspaceEntry[]): WorkspaceEntry[] => {
  const merged = new Map<string, WorkspaceEntry>()
  for (const entry of entries) for (const old of entry.previousPaths || []) deleteShadowEntry(old)
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const path = normalizeWorkspacePath(entry.path)
    if (!path) continue
    merged.set(path, {
      ...entry,
      path,
      parentPath: entry.parentPath ? normalizeWorkspacePath(entry.parentPath) : null,
    })
  }
  for (const entry of snapshotShadowEntries()) {
    const path = normalizeWorkspacePath(entry.path)
    if (!path || merged.has(path)) continue
    merged.set(path, entry)
  }
  return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path))
}

export const readShadowFileText = (path: WorkspacePath): string | null => {
  const shadow = ensureShadow()
  const normalized = normalizeWorkspacePath(path)
  if (isMigratedAuthoredMarkdownNoteMirrorPath(normalized, loadWorkspaceSourceIndex())) {
    deleteShadowEntry(normalized)
    return null
  }
  const entry = shadow.get(normalized)
  if (!entry || entry.kind !== 'file') return null
  return String(entry.text ?? '')
}

export const buildShadowFileEntry = (path: WorkspacePath, text: string): WorkspaceEntry => {
  const p = normalizeWorkspacePath(path)
  return {
    path: p,
    parentPath: p === WORKSPACE_ROOT_PATH ? null : normalizeWorkspacePath(p.slice(0, p.lastIndexOf('/')) || WORKSPACE_ROOT_PATH),
    kind: 'file',
    name: workspaceBasename(p),
    text: text.length <= SHADOW_MAX_FILE_TEXT_CHARS ? text : '',
    updatedAtMs: Date.now(),
  }
}
