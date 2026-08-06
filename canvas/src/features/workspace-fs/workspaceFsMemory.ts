import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from './types'
import { WORKSPACE_ROOT_PATH, joinWorkspacePath, normalizeWorkspacePath, workspaceBasename } from './path'
import {
  CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE,
  buildWorkspaceSeedFileEntry,
  expandWorkspaceSeedFileEntries,
  getWorkspaceSeedFiles,
  isInitializationWorkspacePath,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  shouldPreserveFallbackWorkspaceSeedText,
  XR_PHYSICS_WORKSPACE_SEED_PATH,
} from './workspaceFs'
import { notifyWorkspaceFsChanged } from './workspaceFsEvents'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from './sourceIndex'
import { LS_KEYS } from '@/lib/config'
import { lsBool, lsRemove, lsSetBool } from '@/lib/persistence'
import { isLegacyWorkspaceSourcePath } from './workspaceLegacySourceRoots'
import {
  isLegacyAuthoredMarkdownNotePath,
  preserveAuthoredMarkdownNoteSource,
  resolveAuthoredMarkdownNotePath,
} from './workspaceAuthoredNotes'
import { upgradeAuthoredMarkdownNoteInitialDocument } from './workspaceAuthoredNoteDocument'
import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from './workspaceSourceRoots'
import { readCanonicalWorkspaceSeedMirrorEntries } from './workspaceSeedProvider'
import { buildWorkspaceDocsMirrorDesiredEntries } from './workspaceFsPersistedReconciliation'
import {
  CANONICAL_WORKSPACE_SEED_BASENAMES,
  hasExactCanonicalWorkspaceSeedInventory,
} from './workspaceCanonicalSeedBundle'
import { isKnowgrphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'

export function createMemoryWorkspaceFs(args?: { initialEntries?: WorkspaceEntry[] }): WorkspaceFs {
  const entriesByPath = new Map<string, WorkspaceEntry>()

  const loadInitial = () => {
    const initial = Array.isArray(args?.initialEntries) ? args?.initialEntries : []
    for (const raw of initial) {
      if (!raw || typeof raw !== 'object') continue
      const kind = raw.kind === 'file' || raw.kind === 'folder' ? raw.kind : null
      if (!kind) continue
      const path = normalizeWorkspacePath(raw.path)
      if (!path) continue
      const next: WorkspaceEntry = {
        path,
        parentPath: raw.parentPath ? normalizeWorkspacePath(raw.parentPath) : null,
        kind,
        name: String(raw.name ?? ''),
        updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : Date.now(),
        ...(kind === 'file' ? { text: typeof raw.text === 'string' ? raw.text : '' } : {}),
      }
      entriesByPath.set(path, next)
    }
  }

  loadInitial()

  const ensureRoot = () => {
    if (entriesByPath.has(WORKSPACE_ROOT_PATH)) return
    entriesByPath.set(WORKSPACE_ROOT_PATH, {
      path: WORKSPACE_ROOT_PATH,
      parentPath: null,
      kind: 'folder',
      name: '',
      updatedAtMs: Date.now(),
    })
  }

  const clearWorkspaceEntrySource = (path: WorkspacePath): boolean => {
    const normalizedPath = normalizeWorkspacePath(path)
    if (!loadWorkspaceSourceIndex()[normalizedPath]) return false
    setWorkspaceEntrySource(normalizedPath, null, { persist: 'sync' })
    return true
  }

  const removeNoncanonicalXrPhysicsFiles = (): boolean => {
    const targetBasename = workspaceBasename(XR_PHYSICS_WORKSPACE_SEED_PATH).toLowerCase()
    let changed = false
    for (const [path, entry] of entriesByPath) {
      if (entry.kind !== 'file' || path === XR_PHYSICS_WORKSPACE_SEED_PATH) continue
      if (workspaceBasename(path).toLowerCase() !== targetBasename) continue
      entriesByPath.delete(path)
      clearWorkspaceEntrySource(path)
      changed = true
    }
    return changed
  }

  const clearStaleXrPhysicsSourcesIfCanonicalMaterialized = (): boolean => {
    const canonical = entriesByPath.get(XR_PHYSICS_WORKSPACE_SEED_PATH)
    if (canonical?.kind !== 'file') return false
    const targetBasename = workspaceBasename(XR_PHYSICS_WORKSPACE_SEED_PATH).toLowerCase()
    const sourceIndex = loadWorkspaceSourceIndex()
    let changed = false
    for (const rawPath of Object.keys(sourceIndex)) {
      const path = normalizeWorkspacePath(rawPath)
      if (workspaceBasename(path).toLowerCase() !== targetBasename) continue
      if (path !== XR_PHYSICS_WORKSPACE_SEED_PATH && entriesByPath.get(path)?.kind === 'folder') continue
      if (clearWorkspaceEntrySource(path)) changed = true
    }
    return changed
  }

  const hasOnlyCanonicalXrPhysicsFile = (): boolean => {
    const files = [...entriesByPath.values()].filter(entry => entry.kind === 'file')
    return files.length === 1 && files[0]?.path === XR_PHYSICS_WORKSPACE_SEED_PATH
  }

  const removeLegacyWorkspaceSourceEntries = (): boolean => {
    let changed = false
    for (const path of [...entriesByPath.keys()]) {
      if (!isLegacyWorkspaceSourcePath(path)) continue
      entriesByPath.delete(path)
      clearWorkspaceEntrySource(normalizeWorkspacePath(path))
      changed = true
    }
    return changed
  }

  const migrateLegacyAuthoredMarkdownNotes = (): boolean => {
    const sourceIndex = loadWorkspaceSourceIndex()
    const occupiedPaths = new Set(entriesByPath.keys())
    const legacyEntries = [...entriesByPath.values()]
      .filter(entry => entry.kind === 'file' && isLegacyAuthoredMarkdownNotePath(entry.path, sourceIndex))
      .sort((left, right) => left.path.localeCompare(right.path))
    if (legacyEntries.length === 0) return false
    if (!entriesByPath.has(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH)) {
      entriesByPath.set(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH, {
        path: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
        parentPath: WORKSPACE_ROOT_PATH,
        kind: 'folder',
        name: workspaceBasename(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH),
        updatedAtMs: Date.now(),
      })
      occupiedPaths.add(WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH)
    }
    for (const entry of legacyEntries) {
      const destinationPath = resolveAuthoredMarkdownNotePath({
        legacyPath: entry.path,
        occupiedPaths,
      })
      entriesByPath.set(destinationPath, {
        ...entry,
        path: destinationPath,
        parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
        name: workspaceBasename(destinationPath),
      })
      entriesByPath.delete(entry.path)
      occupiedPaths.delete(entry.path)
      occupiedPaths.add(destinationPath)
      const source = sourceIndex[entry.path]
      setWorkspaceEntrySource(entry.path, null, { persist: 'sync' })
      if (source) {
        setWorkspaceEntrySource(destinationPath, preserveAuthoredMarkdownNoteSource(source), { persist: 'sync' })
      }
    }
    return true
  }

  const upgradeAuthoredMarkdownNoteInitialDocuments = (): boolean => {
    let changed = false
    for (const [path, entry] of entriesByPath) {
      if (entry.kind !== 'file') continue
      const nextText = upgradeAuthoredMarkdownNoteInitialDocument({
        documentName: path,
        rawText: String(entry.text ?? ''),
      })
      if (nextText === entry.text) continue
      entriesByPath.set(path, { ...entry, text: nextText, updatedAtMs: Date.now() })
      changed = true
    }
    return changed
  }

  const syncCanonicalWorkspaceSeedEntries = async (): Promise<boolean> => {
    const userClearedAll = lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)
    const hasNoncanonicalFile = [...entriesByPath.values()].some(entry => (
      entry.kind === 'file' && !isKnowgrphWorkspaceSeedsPath(entry.path)
    ))
    if (userClearedAll && !hasNoncanonicalFile) return false
    const canonicalEntries = await readCanonicalWorkspaceSeedMirrorEntries()
    if (!hasExactCanonicalWorkspaceSeedInventory(canonicalEntries)) return false
    const desiredEntriesByPath = buildWorkspaceDocsMirrorDesiredEntries(canonicalEntries)
    if (![...desiredEntriesByPath.keys()].some(isKnowgrphWorkspaceSeedsPath)) return false
    let changed = false
    for (const [path, desired] of desiredEntriesByPath) {
      if (path !== '/docs' && !isKnowgrphWorkspaceSeedsPath(path)) continue
      const existing = entriesByPath.get(path)
      const existingText = existing?.kind === 'file' ? String(existing.text ?? '') : ''
      const desiredText = desired.kind === 'file' ? String(desired.text ?? '') : ''
      if (
        !existing
        || existing.kind !== desired.kind
        || existing.name !== desired.name
        || existing.parentPath !== desired.parentPath
        || existingText !== desiredText
      ) {
        entriesByPath.set(path, { ...desired })
        changed = true
      }
      if (isKnowgrphWorkspaceSeedsPath(path) && clearWorkspaceEntrySource(path)) changed = true
    }
    return changed
  }

  const ensureSeed = async (): Promise<boolean> => {
    ensureRoot()
    let changed = false
    if (removeLegacyWorkspaceSourceEntries()) changed = true
    if (migrateLegacyAuthoredMarkdownNotes()) changed = true
    if (upgradeAuthoredMarkdownNoteInitialDocuments()) changed = true
    if (await syncCanonicalWorkspaceSeedEntries()) changed = true

    const canonicalSeedInventoryMaterialized = CANONICAL_WORKSPACE_SEED_BASENAMES.every(basename => (
      entriesByPath.get(`/docs/workspace-seeds/${basename}`)?.kind === 'file'
    ))
    const activeValidationSeedMaterialized = !CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE
      || entriesByPath.get(TEST_VALIDATION_WORKSPACE_SEED_PATH)?.kind === 'file'
    if (canonicalSeedInventoryMaterialized && activeValidationSeedMaterialized) {
      if (removeNoncanonicalXrPhysicsFiles()) changed = true
      if (clearStaleXrPhysicsSourcesIfCanonicalMaterialized()) changed = true
      if (!lsBool(LS_KEYS.markdownWorkspaceSeeded, false)) {
        lsSetBool(LS_KEYS.markdownWorkspaceSeeded, true)
      }
      if (lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)) {
        lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
      }
      return changed
    }

    if (CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE) {
      const now = Date.now()
      const seeds = await getWorkspaceSeedFiles()
      const validationSeed = seeds.find(seed => normalizeWorkspacePath(seed.path) === TEST_VALIDATION_WORKSPACE_SEED_PATH) || null
      const existing = validationSeed ? entriesByPath.get(TEST_VALIDATION_WORKSPACE_SEED_PATH) : null
      if (validationSeed && (!existing || existing.kind !== 'file' || !String(existing.text ?? '').trim())) {
        const entries = expandWorkspaceSeedFileEntries(TEST_VALIDATION_WORKSPACE_SEED_PATH, validationSeed.text, now)
        for (const entry of entries) {
          entriesByPath.set(entry.path, entry)
          changed = true
        }
      }
    }

    const hasFiles = [...entriesByPath.values()].some(e => e.kind === 'file')
    const seeded = lsBool(LS_KEYS.markdownWorkspaceSeeded, false)
    const userClearedAll = lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)
    if (hasFiles) {
      const seeds = await getWorkspaceSeedFiles()
      let seededTextChanged = false
      const canonicalXrSeed = seeds.find(seed => (
        normalizeWorkspacePath(seed.path) === XR_PHYSICS_WORKSPACE_SEED_PATH
      )) || null
      if (canonicalXrSeed && removeNoncanonicalXrPhysicsFiles()) {
        seededTextChanged = true
      }
      for (const seed of seeds) {
        const path = normalizeWorkspacePath(seed.path)
        const existing = entriesByPath.get(path)
        if (CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE && path === TEST_VALIDATION_WORKSPACE_SEED_PATH && (!existing || existing.kind !== 'file')) {
          const entries = expandWorkspaceSeedFileEntries(path, seed.text, Date.now())
          for (const entry of entries) entriesByPath.set(entry.path, entry)
          seededTextChanged = true
          continue
        }
        if (!existing || existing.kind !== 'file') {
          if (path !== XR_PHYSICS_WORKSPACE_SEED_PATH) continue
          const entries = expandWorkspaceSeedFileEntries(path, seed.text, Date.now())
          for (const entry of entries) entriesByPath.set(entry.path, entry)
          seededTextChanged = true
          continue
        }
        const currentText = String(existing.text ?? '')
        if (seed.isFallback && shouldPreserveFallbackWorkspaceSeedText(currentText)) continue
        const nextText = String(seed.text ?? '')
        if (currentText === nextText) continue
        entriesByPath.set(path, buildWorkspaceSeedFileEntry(path, nextText, Date.now()))
        seededTextChanged = true
      }
      if (canonicalXrSeed && clearStaleXrPhysicsSourcesIfCanonicalMaterialized()) seededTextChanged = true
      if (seededTextChanged) changed = true
      if (!seeded) lsSetBool(LS_KEYS.markdownWorkspaceSeeded, true)
      if (userClearedAll && !hasOnlyCanonicalXrPhysicsFile()) {
        lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
      }
      return changed
    }
    const seeds = await getWorkspaceSeedFiles()
    const canonicalXrSeed = seeds.find(seed => (
      normalizeWorkspacePath(seed.path) === XR_PHYSICS_WORKSPACE_SEED_PATH
    )) || null
    const seedsToMaterialize = userClearedAll
      ? (canonicalXrSeed ? [canonicalXrSeed] : [])
      : seeds
    for (const seed of seedsToMaterialize) {
      const entries = expandWorkspaceSeedFileEntries(normalizeWorkspacePath(seed.path), seed.text, Date.now())
      for (const entry of entries) {
        entriesByPath.set(entry.path, entry)
        changed = true
      }
    }
    if (canonicalXrSeed && clearStaleXrPhysicsSourcesIfCanonicalMaterialized()) changed = true
    if (!userClearedAll) lsSetBool(LS_KEYS.markdownWorkspaceSeeded, true)
    return changed
  }

  const listEntries = async () => {
    ensureRoot()
    return [...entriesByPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  const readFileText = async (path: WorkspacePath) => {
    const p = normalizeWorkspacePath(path)
    const entry = entriesByPath.get(p)
    if (!entry || entry.kind !== 'file') return null
    return String(entry.text ?? '')
  }

  const writeFileText = async (path: WorkspacePath, text: string) => {
    ensureRoot()
    const p = normalizeWorkspacePath(path)
    const entry = entriesByPath.get(p)
    if (!entry || entry.kind !== 'file') return
    entriesByPath.set(p, { ...entry, text: String(text ?? ''), updatedAtMs: Date.now() })
    notifyWorkspaceFsChanged({ op: 'writeFileText', path: p })
  }

  const createFolder = async (args: { parentPath: WorkspacePath; name: string }) => {
    ensureRoot()
    const parent = normalizeWorkspacePath(args.parentPath)
    const desired = String(args.name ?? '').trim() || 'folder'
    let name = desired
    let path = joinWorkspacePath(parent, name)
    for (let i = 2; i <= 999 && entriesByPath.has(path); i += 1) {
      name = `${desired}-${i}`
      path = joinWorkspacePath(parent, name)
    }
    entriesByPath.set(path, {
      path,
      parentPath: parent,
      kind: 'folder',
      name,
      updatedAtMs: Date.now(),
    })
    notifyWorkspaceFsChanged({ op: 'createFolder', path })
    return path
  }

  const createFile = async (args: { parentPath: WorkspacePath; name: string; text: string }) => {
    ensureRoot()
    const parent = normalizeWorkspacePath(args.parentPath)
    const desired = String(args.name ?? '').trim() || 'file.md'
    let name = desired
    let path = joinWorkspacePath(parent, name)
    for (let i = 2; i <= 999 && entriesByPath.has(path); i += 1) {
      const extIndex = desired.lastIndexOf('.')
      const stem = extIndex > 0 ? desired.slice(0, extIndex) : desired
      const ext = extIndex > 0 ? desired.slice(extIndex) : ''
      name = `${stem}-${i}${ext}`
      path = joinWorkspacePath(parent, name)
    }
    entriesByPath.set(path, {
      path,
      parentPath: parent,
      kind: 'file',
      name,
      text: String(args.text ?? ''),
      updatedAtMs: Date.now(),
    })
    if (lsBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, false)) {
      lsRemove(LS_KEYS.markdownWorkspaceUserClearedAllFiles)
    }
    notifyWorkspaceFsChanged({ op: 'createFile', path })
    return path
  }

  const deleteEntry = async (path: WorkspacePath) => {
    ensureRoot()
    const p = normalizeWorkspacePath(path)
    if (p === WORKSPACE_ROOT_PATH || isInitializationWorkspacePath(p)) return
    const target = entriesByPath.get(p)
    if (!target) return
    if (target.kind === 'file') {
      entriesByPath.delete(p)
      const remainingHasFiles = [...entriesByPath.values()].some(e => e.kind === 'file')
      if (!remainingHasFiles) lsSetBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, true)
      notifyWorkspaceFsChanged({ op: 'deleteEntry', path: p })
      return
    }
    const prefix = p.endsWith('/') ? p : `${p}/`
    for (const key of [...entriesByPath.keys()]) {
      if (key === p || key.startsWith(prefix)) entriesByPath.delete(key)
    }
    const remainingHasFiles = [...entriesByPath.values()].some(e => e.kind === 'file')
    if (!remainingHasFiles) lsSetBool(LS_KEYS.markdownWorkspaceUserClearedAllFiles, true)
    notifyWorkspaceFsChanged({ op: 'deleteEntry', path: p })
  }

  return {
    ensureSeed,
    listEntries,
    readFileText,
    writeFileText,
    createFile,
    createFolder,
    deleteEntry,
  }
}
