import type { PersistedCollectionMap } from '@/lib/storage/persistedCollectionStore'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import { isKnowgrphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'

import {
  CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED,
  expandWorkspaceSeedFileEntries,
  XR_PHYSICS_WORKSPACE_SEED_PATH,
} from './workspaceFs'
import { buildWorkspaceDocsMirrorSourceOwnedPathSet } from './workspaceDocsMirrorSourceOwnership'
import { normalizeWorkspacePath, workspaceBasename } from './path'
import { readWorkspaceInitializationDocsMirrorEntries } from './workspaceSeedProvider'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from './sourceIndex'
import type { WorkspaceEntry, WorkspacePath } from './types'
import { isLegacyWorkspaceSourcePath } from './workspaceLegacySourceRoots'
import {
  isLegacyAuthoredMarkdownNotePath,
  isMigratedAuthoredMarkdownNoteMirrorPath,
  preserveAuthoredMarkdownNoteSource,
  resolveAuthoredMarkdownNotePath,
} from './workspaceAuthoredNotes'
import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from './workspaceSourceRoots'
import {
  isCanonicalWorkspaceSeedAuthority,
  type WorkspaceDocsMirrorAuthority,
} from './workspaceSeedInventoryAuthority'

type WorkspaceRecordMap = { entries: WorkspaceEntry }
type WorkspaceCollections = PersistedCollectionMap<WorkspaceRecordMap>
type WorkspaceDocsMirrorEntry = {
  relPath: string
  text: string
  updatedAtMs: number
  authority?: WorkspaceDocsMirrorAuthority
}

const WORKSPACE_DOCS_MIRROR_ROOT_PATH = normalizeWorkspacePath('/docs')
const WORKSPACE_AGENTIC_DOCS_MIRROR_ROOT_PATH = normalizeWorkspacePath('/agentic-canvas-os/docs')
const WORKSPACE_OUTPUT_DOCS_MIRROR_ROOT_PATH = normalizeWorkspacePath('/docs_')
let lastDocsMirrorSyncSignature = ''

const normalizeUpdatedAtMs = (value: unknown, fallback = Date.now()): number => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return Math.max(0, Math.floor(fallback))
  return Math.floor(n)
}

const normalizeDocsMirrorRelPath = (value: string): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()
  const docsRootMarker = 'agentic-canvas-os/docs/'
  if (lowered.startsWith(docsRootMarker)) return normalized.slice(docsRootMarker.length)
  if (lowered.startsWith(`docs/${docsRootMarker}`)) {
    return normalized.slice(`docs/${docsRootMarker}`.length)
  }
  const docsRootIndex = lowered.indexOf(`/${docsRootMarker}`)
  if (docsRootIndex >= 0) return normalized.slice(docsRootIndex + docsRootMarker.length + 1)
  return normalized
}

export const toWorkspaceDocsMirrorPath = (relPath: string): WorkspacePath => {
  const mountedRelPath = String(relPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (mountedRelPath.toLowerCase().startsWith('agentic-canvas-os/docs/')) {
    return normalizeWorkspacePath(`/${mountedRelPath}`)
  }
  if (mountedRelPath.toLowerCase().startsWith('docs_/')) {
    return normalizeWorkspacePath(`/${mountedRelPath}`)
  }
  const normalizedRelPath = normalizeDocsMirrorRelPath(mountedRelPath)
  return normalizeWorkspacePath(`${WORKSPACE_DOCS_MIRROR_ROOT_PATH}/${normalizedRelPath}`)
}

export const buildDocsMirrorBasenameSet = (
  docsEntries: ReadonlyArray<{ relPath: string }>,
): Set<string> => {
  const out = new Set<string>()
  for (let i = 0; i < docsEntries.length; i += 1) {
    const relPath = normalizeDocsMirrorRelPath(String(docsEntries[i]?.relPath || ''))
    const basename = workspaceBasename(`/${relPath}`).toLowerCase()
    if (basename) out.add(basename)
  }
  return out
}

export const isStaleRootMarkdownAliasCoveredByDocsMirror = (args: {
  path: WorkspacePath
  docsMirrorBasenames: ReadonlySet<string>
  rootSeedPaths: ReadonlySet<WorkspacePath>
}): boolean => {
  const path = normalizeWorkspacePath(args.path)
  if (!path || path.startsWith('/docs/')) return false
  if (args.rootSeedPaths.has(path)) return false
  const segments = path.split('/').filter(Boolean)
  if (segments.length !== 1) return false
  const basename = workspaceBasename(path)
  if (!basename || !/\.md$/i.test(basename)) return false
  return args.docsMirrorBasenames.has(basename.toLowerCase())
}

const clearWorkspaceEntrySource = (path: WorkspacePath): boolean => {
  const normalizedPath = normalizeWorkspacePath(path)
  if (!loadWorkspaceSourceIndex()[normalizedPath]) return false
  setWorkspaceEntrySource(normalizedPath, null, { persist: 'sync' })
  return true
}

const clearCanonicalWorkspaceSeedSources = (): boolean => {
  const sourceIndex = loadWorkspaceSourceIndex()
  let changed = false
  for (const path of Object.keys(sourceIndex)) {
    if (!isKnowgrphWorkspaceSeedsPath(path)) continue
    if (clearWorkspaceEntrySource(normalizeWorkspacePath(path))) changed = true
  }
  return changed
}

export const removeLegacyWorkspaceSourceEntries = async (
  collections: WorkspaceCollections,
): Promise<boolean> => {
  const rows = await collections.entries.find().exec()
  let changed = false
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) continue
    const path = normalizeWorkspacePath(String(row.get('path') || ''))
    if (!isLegacyWorkspaceSourcePath(path)) continue
    await row.remove()
    clearWorkspaceEntrySource(path)
    changed = true
  }
  return changed
}

export const migrateLegacyAuthoredMarkdownNotes = async (
  collections: WorkspaceCollections,
): Promise<boolean> => {
  const sourceIndex = loadWorkspaceSourceIndex()
  const rows = await collections.entries.find().exec()
  const occupiedPaths = new Set(rows.map(row => normalizeWorkspacePath(String(row.get('path') || ''))))
  const legacyRows = rows
    .filter(row => row.get('kind') === 'file' && isLegacyAuthoredMarkdownNotePath(
      normalizeWorkspacePath(String(row.get('path') || '')),
      sourceIndex,
    ))
    .sort((left, right) => String(left.get('path') || '').localeCompare(String(right.get('path') || '')))
  if (legacyRows.length === 0) return false
  if (!occupiedPaths.has(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH)) {
    await collections.entries.incrementalUpsert({
      path: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
      parentPath: '/',
      kind: 'folder',
      name: workspaceBasename(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH),
      updatedAtMs: Date.now(),
    })
    occupiedPaths.add(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH)
  }
  for (const row of legacyRows) {
    const legacyPath = normalizeWorkspacePath(String(row.get('path') || ''))
    const destinationPath = resolveAuthoredMarkdownNotePath({ legacyPath, occupiedPaths })
    await collections.entries.incrementalUpsert({
      path: destinationPath,
      parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
      kind: 'file',
      name: workspaceBasename(destinationPath),
      text: String(row.get('text') ?? ''),
      updatedAtMs: normalizeUpdatedAtMs(row.get('updatedAtMs')),
    })
    await row.remove()
    occupiedPaths.delete(legacyPath)
    occupiedPaths.add(destinationPath)
    const source = sourceIndex[legacyPath]
    setWorkspaceEntrySource(legacyPath, null, { persist: 'sync' })
    if (source) {
      setWorkspaceEntrySource(destinationPath, preserveAuthoredMarkdownNoteSource(source), { persist: 'sync' })
    }
  }
  return true
}

export const removeNoncanonicalXrPhysicsFiles = async (
  collections: WorkspaceCollections,
): Promise<boolean> => {
  const targetBasename = workspaceBasename(XR_PHYSICS_WORKSPACE_SEED_PATH).toLowerCase()
  const rows = await collections.entries.find({ selector: { kind: 'file' } }).exec()
  let changed = false
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) continue
    const path = normalizeWorkspacePath(String(row.get('path') || ''))
    if (!path || path === XR_PHYSICS_WORKSPACE_SEED_PATH) continue
    if (workspaceBasename(path).toLowerCase() !== targetBasename) continue
    await row.remove()
    clearWorkspaceEntrySource(path)
    changed = true
  }
  return changed
}

export const clearStaleXrPhysicsSourcesIfCanonicalMaterialized = async (
  collections: WorkspaceCollections,
): Promise<boolean> => {
  const canonical = await collections.entries.findOne(XR_PHYSICS_WORKSPACE_SEED_PATH).exec()
  if (canonical?.get('kind') !== 'file') return false
  const targetBasename = workspaceBasename(XR_PHYSICS_WORKSPACE_SEED_PATH).toLowerCase()
  const sourceIndex = loadWorkspaceSourceIndex()
  let changed = false
  for (const rawPath of Object.keys(sourceIndex)) {
    const path = normalizeWorkspacePath(rawPath)
    if (workspaceBasename(path).toLowerCase() !== targetBasename) continue
    if (path !== XR_PHYSICS_WORKSPACE_SEED_PATH) {
      const row = await collections.entries.findOne(path).exec()
      if (row?.get('kind') === 'folder') continue
    }
    if (clearWorkspaceEntrySource(path)) changed = true
  }
  return changed
}

export const hasOnlyCanonicalXrPhysicsFile = async (
  collections: WorkspaceCollections,
): Promise<boolean> => {
  const rows = await collections.entries.find({ selector: { kind: 'file' } }).exec()
  return rows.length === 1
    && normalizeWorkspacePath(String(rows[0]?.get('path') || '')) === XR_PHYSICS_WORKSPACE_SEED_PATH
}

const buildDocsMirrorSyncSignature = (
  docsEntries: ReadonlyArray<WorkspaceDocsMirrorEntry>,
): string => {
  const rows = (Array.isArray(docsEntries) ? docsEntries : [])
    .map(entry => {
      const relPath = normalizeDocsMirrorRelPath(String(entry?.relPath || ''))
      if (!relPath) return ''
      const text = String(entry?.text || '')
      const contentHash = hashStringToHexCached('workspace-docs-mirror-sync', text)
      return `${relPath}:${Number(entry?.updatedAtMs || 0)}:${contentHash}:${String(entry?.authority || '')}`
    })
    .filter(Boolean)
    .sort()
  return rows.join('|')
}

export const resetWorkspaceDocsMirrorSyncForPersistedFs = (): void => {
  lastDocsMirrorSyncSignature = ''
}

export const syncWorkspaceDocsMirrorEntries = async (
  collections: WorkspaceCollections,
  docsEntriesInput?: ReadonlyArray<WorkspaceDocsMirrorEntry>,
): Promise<boolean> => {
  const docsEntries = Array.isArray(docsEntriesInput)
    ? [...docsEntriesInput]
    : await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
  if (docsEntries.length === 0) return false
  const docsMirrorSignature = buildDocsMirrorSyncSignature(docsEntries)
  if (docsMirrorSignature && docsMirrorSignature === lastDocsMirrorSyncSignature) return false
  const desiredEntriesByPath = new Map<WorkspacePath, WorkspaceEntry>()
  for (let i = 0; i < docsEntries.length; i += 1) {
    const entry = docsEntries[i]
    if (!entry) continue
    const expanded = expandWorkspaceSeedFileEntries(
      toWorkspaceDocsMirrorPath(entry.relPath),
      String(entry.text || ''),
      Number.isFinite(entry.updatedAtMs) ? entry.updatedAtMs : Date.now(),
    )
    for (let j = 0; j < expanded.length; j += 1) {
      const next = expanded[j]
      if (next) desiredEntriesByPath.set(next.path, next)
    }
  }
  if (desiredEntriesByPath.size === 0) return false
  const workspaceSourceIndex = loadWorkspaceSourceIndex()
  for (const desiredPath of desiredEntriesByPath.keys()) {
    if (isMigratedAuthoredMarkdownNoteMirrorPath(desiredPath, workspaceSourceIndex)) {
      desiredEntriesByPath.delete(desiredPath)
    }
  }
  const canonicalXrSeedDesired = CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED
    && desiredEntriesByPath.get(XR_PHYSICS_WORKSPACE_SEED_PATH)?.kind === 'file'
  const canonicalWorkspaceSeedInventoryPresent = docsEntries.some(entry => (
    isCanonicalWorkspaceSeedAuthority(entry.authority)
  ))
  const agenticRuntimeDesiredPaths = new Set(
    [...desiredEntriesByPath.keys()].filter(path => (
      path === WORKSPACE_AGENTIC_DOCS_MIRROR_ROOT_PATH
      || path.startsWith(`${WORKSPACE_AGENTIC_DOCS_MIRROR_ROOT_PATH}/`)
    )),
  )
  const sourceOwnedDocsPaths = buildWorkspaceDocsMirrorSourceOwnedPathSet(workspaceSourceIndex)
  const existingRows = await collections.entries.find().exec()
  let changed = false
  for (let i = 0; i < existingRows.length; i += 1) {
    const row = existingRows[i]
    if (!row) continue
    const existingPath = normalizeWorkspacePath(String(row.get('path') || ''))
    const underVisibleDocs = existingPath.startsWith(`${WORKSPACE_DOCS_MIRROR_ROOT_PATH}/`)
    const underRuntimeDocs = existingPath.startsWith(`${WORKSPACE_AGENTIC_DOCS_MIRROR_ROOT_PATH}/`)
    const underOutputDocs = existingPath.startsWith(`${WORKSPACE_OUTPUT_DOCS_MIRROR_ROOT_PATH}/`)
    if (!underVisibleDocs && !underRuntimeDocs && !underOutputDocs) continue
    if (isMigratedAuthoredMarkdownNoteMirrorPath(existingPath, workspaceSourceIndex)) {
      await row.remove()
      changed = true
      continue
    }
    const desired = desiredEntriesByPath.get(existingPath) || null
    const protectedXrNamedFolder = CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED
      && row.get('kind') === 'folder'
      && existingPath !== XR_PHYSICS_WORKSPACE_SEED_PATH
      && workspaceBasename(existingPath).toLowerCase()
        === workspaceBasename(XR_PHYSICS_WORKSPACE_SEED_PATH).toLowerCase()
    if (protectedXrNamedFolder) {
      desiredEntriesByPath.delete(existingPath)
      continue
    }
    const canonicalXrSeedMustWin = canonicalXrSeedDesired
      && existingPath === XR_PHYSICS_WORKSPACE_SEED_PATH
    const canonicalWorkspaceSeedMustWin = canonicalWorkspaceSeedInventoryPresent
      && isKnowgrphWorkspaceSeedsPath(existingPath)
    const runtimeTwinPath = underVisibleDocs
      ? normalizeWorkspacePath(`${WORKSPACE_AGENTIC_DOCS_MIRROR_ROOT_PATH}/${existingPath.slice(`${WORKSPACE_DOCS_MIRROR_ROOT_PATH}/`.length)}`)
      : null
    const staleFlattenedRuntimeDoc = !!runtimeTwinPath && agenticRuntimeDesiredPaths.has(runtimeTwinPath)
    if (underOutputDocs && !desired) continue
    if (
      isKnowgrphWorkspaceSeedsPath(existingPath)
      && !canonicalWorkspaceSeedInventoryPresent
      && !desired
    ) {
      continue
    }
    if (
      !staleFlattenedRuntimeDoc
      && sourceOwnedDocsPaths.has(existingPath)
      && !canonicalXrSeedMustWin
      && !canonicalWorkspaceSeedMustWin
    ) {
      desiredEntriesByPath.delete(existingPath)
      continue
    }
    if (!desired) {
      await row.remove()
      if (underRuntimeDocs || staleFlattenedRuntimeDoc || canonicalWorkspaceSeedMustWin) {
        clearWorkspaceEntrySource(existingPath)
      }
      changed = true
      continue
    }
    desiredEntriesByPath.delete(existingPath)
    const existingKind = String(row.get('kind') || '')
    const existingName = String(row.get('name') || '')
    const existingParentPath = String(row.get('parentPath') || '')
    const existingText = String(row.get('text') ?? '')
    const nextParentPath = String(desired.parentPath || '')
    const nextText = desired.kind === 'file' ? String(desired.text || '') : ''
    if (
      existingKind !== desired.kind
      || existingName !== desired.name
      || existingParentPath !== nextParentPath
      || (desired.kind === 'file' && existingText !== nextText)
    ) {
      await row.incrementalPatch({
        parentPath: nextParentPath,
        kind: desired.kind,
        name: desired.name,
        text: nextText,
        updatedAtMs: normalizeUpdatedAtMs(desired.updatedAtMs),
      })
      changed = true
    }
    if (canonicalWorkspaceSeedMustWin && clearWorkspaceEntrySource(existingPath)) changed = true
  }
  const pendingEntries = [...desiredEntriesByPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  for (let i = 0; i < pendingEntries.length; i += 1) {
    const entry = pendingEntries[i]
    if (!entry) continue
    await collections.entries.incrementalUpsert({
      path: entry.path,
      parentPath: String(entry.parentPath || ''),
      kind: entry.kind,
      name: entry.name,
      text: entry.kind === 'file' ? String(entry.text || '') : '',
      updatedAtMs: normalizeUpdatedAtMs(entry.updatedAtMs),
    })
    changed = true
  }
  if (
    canonicalXrSeedDesired
    && await clearStaleXrPhysicsSourcesIfCanonicalMaterialized(collections)
  ) {
    changed = true
  }
  if (
    canonicalWorkspaceSeedInventoryPresent
    && clearCanonicalWorkspaceSeedSources()
  ) {
    changed = true
  }
  if (docsMirrorSignature) lastDocsMirrorSyncSignature = docsMirrorSignature
  return changed
}
