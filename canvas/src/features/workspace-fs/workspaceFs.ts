import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from './types'
import { WORKSPACE_ROOT_PATH, ancestorPathsForWorkspacePath, normalizeWorkspacePath, workspaceBasename } from './path'
import { readEnvString } from '@/lib/config.env'
import { readWorkspaceInitializationDocsMirrorEntries, readWorkspaceInitializationSeedText } from './workspaceSeedProvider'
import {
  WORKSPACE_RUN_READY_DEMO_ENV,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
  XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
  isWorkspaceRepoLocalRunReadyBootstrap,
  resolveWorkspaceRunReadyDemoSeed,
  resolveWorkspaceValidationSeedRelPath,
} from './workspaceRunReadyDemos'
import {
  CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED,
  loadXrPhysicsDemoSeedSource,
} from './xrPhysicsDemoSeedSource'
export { CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED, mergeCanonicalXrPhysicsWorkspaceSeedIntoDocsMirror } from './xrPhysicsDemoSeedSource'
import { notifyWorkspaceFsChanged } from './workspaceFsEvents'
import {
  buildShadowFileEntry,
  deleteShadowEntry,
  mergeEntriesWithShadow,
  readShadowFileText,
  SHADOW_MAX_FILE_TEXT_CHARS,
  snapshotShadowEntries,
  upsertShadowEntry,
} from './workspaceFsShadow'

const notifyWorkspaceFsDegraded = async (err: unknown) => {
  try {
    if (typeof window === 'undefined') return
    const mod = (await import('@/hooks/useGraphStore')) as typeof import('@/hooks/useGraphStore')
    const msg =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message || '').trim()
        : ''
    mod.useGraphStore.getState().pushUiToast({
      id: 'workspace-fs-persistence-disabled',
      kind: 'warning',
      message: `Workspace persistence is unavailable. Changes may not survive reload.${msg ? ` ${msg}` : ''}`,
    })
  } catch {
    void 0
  }
}

let fsSingleton: WorkspaceFs | null = null
let warnedDegraded = false

const isRxConflictError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false
  const rec = err as Record<string, unknown>
  if (rec.code === 'CONFLICT') return true
  const name = typeof rec.name === 'string' ? rec.name : ''
  if (name === 'RxError' && typeof rec.message === 'string' && rec.message.includes('CONFLICT')) return true
  return false
}

const waitConflictRetryTick = async (attemptIndex: number): Promise<void> => {
  const delayMs = Math.min(40, 8 * Math.max(1, attemptIndex))
  await new Promise<void>(resolve => {
    setTimeout(resolve, delayMs)
  })
}

const MAX_RX_CONFLICT_RETRIES = 3

export const createResilientWorkspaceFs = (inner: WorkspaceFs): WorkspaceFs => {
  const run = async <T>(op: keyof WorkspaceFs, fn: (fs: WorkspaceFs) => Promise<T>): Promise<T> => {
    try {
      return await fn(inner)
    } catch (e: unknown) {
      if (isRxConflictError(e)) {
        let conflictError: unknown = e
        for (let attempt = 0; attempt < MAX_RX_CONFLICT_RETRIES; attempt += 1) {
          try {
            await waitConflictRetryTick(attempt + 1)
            return await fn(inner)
          } catch (retryError) {
            if (!isRxConflictError(retryError)) throw retryError
            conflictError = retryError
          }
        }
        // Persistent conflict: fall back to in-memory shadow for continuity, but avoid degraded toast noise.
        console.warn(`[workspace-fs] persisted cache conflict persisted on ${String(op)} after retries — falling back to shadow memory fs`)
        const { createMemoryWorkspaceFs } = (await import('./workspaceFsMemory.ts')) as typeof import('./workspaceFsMemory.ts')
        const memory = createMemoryWorkspaceFs({ initialEntries: snapshotShadowEntries() })
        fsSingleton = memory
        try {
          await memory.ensureSeed()
        } catch {
          void 0
        }
        void conflictError
        return await fn(memory)
      }
      const { createMemoryWorkspaceFs } = (await import('./workspaceFsMemory.ts')) as typeof import('./workspaceFsMemory.ts')
      const memory = createMemoryWorkspaceFs({ initialEntries: snapshotShadowEntries() })
      fsSingleton = memory
      try {
        await memory.ensureSeed()
      } catch {
        void 0
      }
      if (!warnedDegraded) {
        warnedDegraded = true
        await notifyWorkspaceFsDegraded(e)
      }
      return await fn(memory)
    }
  }

  return {
    ensureSeed: () =>
      run('ensureSeed', async fs => {
        const changed = await fs.ensureSeed()
        if (changed) notifyWorkspaceFsChanged({ op: 'ensureSeed' })
        return changed
      }),
    listEntries: () =>
      run('listEntries', async fs => {
        const list = await fs.listEntries()
        for (const entry of list) upsertShadowEntry(entry)
        return mergeEntriesWithShadow(list)
      }),
    readFileText: (path: WorkspacePath) =>
      run('readFileText', async fs => {
        const text = await fs.readFileText(path)
        const p = normalizeWorkspacePath(path)
        if (typeof text === 'string') {
          upsertShadowEntry(buildShadowFileEntry(p, text))
          return text
        }
        return readShadowFileText(p)
      }),
    writeFileText: (path: WorkspacePath, text: string, options) =>
      run('writeFileText', async fs => {
        await fs.writeFileText(path, text, options)
        const p = normalizeWorkspacePath(path)
        upsertShadowEntry({
          path: p,
          parentPath: p === WORKSPACE_ROOT_PATH ? null : normalizeWorkspacePath(p.slice(0, p.lastIndexOf('/')) || WORKSPACE_ROOT_PATH),
          kind: 'file',
          name: workspaceBasename(p),
          text: String(text ?? '').slice(0, SHADOW_MAX_FILE_TEXT_CHARS),
          updatedAtMs: Date.now(),
        })
      }),
    createFile: args =>
      run('createFile', async fs => {
        const path = await fs.createFile(args)
        const p = normalizeWorkspacePath(path)
        upsertShadowEntry({
          path: p,
          parentPath: normalizeWorkspacePath(args.parentPath),
          kind: 'file',
          name: workspaceBasename(p) || String(args.name ?? ''),
          text: String(args.text ?? '').slice(0, SHADOW_MAX_FILE_TEXT_CHARS),
          updatedAtMs: Date.now(),
        })
        return path
      }),
    createFolder: args =>
      run('createFolder', async fs => {
        const path = await fs.createFolder(args)
        const p = normalizeWorkspacePath(path)
        upsertShadowEntry({
          path: p,
          parentPath: normalizeWorkspacePath(args.parentPath),
          kind: 'folder',
          name: workspaceBasename(p) || String(args.name ?? ''),
          updatedAtMs: Date.now(),
        })
        return path
      }),
    deleteEntry: (path: WorkspacePath, options) =>
      run('deleteEntry', async fs => {
        await fs.deleteEntry(path, options)
        deleteShadowEntry(path)
      }),
  }
}

export async function getWorkspaceFs(): Promise<WorkspaceFs> {
  if (fsSingleton) return fsSingleton

  const { createMemoryWorkspaceFs } = await import('./workspaceFsMemory.ts')
  const memory = createMemoryWorkspaceFs({ initialEntries: snapshotShadowEntries() })

  try {
    const { createWorkspacePersistedFs } = await import('./workspaceFsPersisted.ts')
    const persistentFs = createResilientWorkspaceFs(createWorkspacePersistedFs())
    await persistentFs.ensureSeed()
    fsSingleton = persistentFs
    return fsSingleton
  } catch (e: unknown) {
    fsSingleton = createResilientWorkspaceFs(memory)
    try {
      await fsSingleton.ensureSeed()
    } catch {
      void 0
    }
    if (!warnedDegraded) {
      warnedDegraded = true
      await notifyWorkspaceFsDegraded(e)
    }
    return fsSingleton
  }
}

export async function ensureSeedWorkspaceFs(): Promise<void> {
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
}

export function resetWorkspaceFsForTests(): void {
  fsSingleton = null
  warnedDegraded = false
}

const normalizeInitializationSeedRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}
const DEFAULT_WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS = ['docs/workspace-seeds', 'docs'] as const
const WORKSPACE_RUN_READY_DEMO_ID = readEnvString(WORKSPACE_RUN_READY_DEMO_ENV, '')
const WORKSPACE_RUN_READY_DEMO = resolveWorkspaceRunReadyDemoSeed(WORKSPACE_RUN_READY_DEMO_ID)
const REPO_LOCAL_RUN_READY_SOURCE_EXCLUSIVE = WORKSPACE_RUN_READY_DEMO?.sourceRoot === 'knowgrph/docs'
export const WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH = readEnvString(
  'VITE_WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH',
  '',
)
const WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS = (() => {
  const explicitRoot = normalizeInitializationSeedRelPath(WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH)
  if (explicitRoot) return [explicitRoot]
  return [...DEFAULT_WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS]
})()
const buildInitializationSeedRelPathCandidates = (basename: string): string[] => {
  const name = normalizeInitializationSeedRelPath(basename)
  if (!name) return []
  const out = new Set<string>()
  for (let i = 0; i < WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS.length; i += 1) {
    const root = normalizeInitializationSeedRelPath(WORKSPACE_INITIALIZATION_SEED_ROOT_REL_PATHS[i] || '')
    if (!root) continue
    out.add(`${root}/${name}`)
  }
  out.add(name)
  return [...out]
}
export const WORKSPACE_README_SEED_BASENAME = 'workspace-readme.md'
export const DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_BASENAME = 'knowgrph-agentic-video-canvas-demo.md'
export const GEOSPATIAL_WORKSPACE_SEED_BASENAME = 'knowgrph-maps-places.md'
const WORKSPACE_README_SEED_REL_PATH_CANDIDATES = buildInitializationSeedRelPathCandidates(WORKSPACE_README_SEED_BASENAME)
export const WORKSPACE_README_SEED_REL_PATH = WORKSPACE_README_SEED_REL_PATH_CANDIDATES[0] || WORKSPACE_README_SEED_BASENAME
export const WORKSPACE_README_SEED_PATH = normalizeWorkspacePath(WORKSPACE_README_SEED_BASENAME)
export const DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH =
  buildInitializationSeedRelPathCandidates(DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_BASENAME)[0] || DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_BASENAME
const TEST_VALIDATION_WORKSPACE_SEED_EXPLICIT_REL_PATH = readEnvString(
  'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
  '',
)
export const TEST_VALIDATION_WORKSPACE_SEED_REL_PATH = readEnvString(
  'VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH',
  resolveWorkspaceValidationSeedRelPath({
    explicitRelPath: TEST_VALIDATION_WORKSPACE_SEED_EXPLICIT_REL_PATH,
    runReadyDemoId: WORKSPACE_RUN_READY_DEMO_ID,
    defaultRelPath: DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  }),
)
const TEST_VALIDATION_WORKSPACE_REQUESTED_BASENAME =
  workspaceBasename(normalizeWorkspacePath(TEST_VALIDATION_WORKSPACE_SEED_REL_PATH)) || DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_BASENAME
const TEST_VALIDATION_WORKSPACE_SEED_REL_PATH_CANDIDATES = (() => {
  const explicit = normalizeInitializationSeedRelPath(TEST_VALIDATION_WORKSPACE_SEED_REL_PATH)
  const defaults = buildInitializationSeedRelPathCandidates(TEST_VALIDATION_WORKSPACE_REQUESTED_BASENAME)
  if (!explicit) return defaults
  return Array.from(new Set([explicit, ...defaults]))
})()
export const CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE =
  TEST_VALIDATION_WORKSPACE_SEED_REL_PATH !== DEFAULT_TEST_VALIDATION_WORKSPACE_SEED_REL_PATH
const REPO_LOCAL_VALIDATION_SOURCE_EXCLUSIVE = REPO_LOCAL_RUN_READY_SOURCE_EXCLUSIVE || (
  isWorkspaceRepoLocalRunReadyBootstrap() && CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE
)
const normalizedValidationSeedSourcePath = normalizeWorkspacePath(TEST_VALIDATION_WORKSPACE_SEED_REL_PATH)
export const TEST_VALIDATION_WORKSPACE_SEED_PATH =
  CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE
    ? (
        normalizedValidationSeedSourcePath && normalizedValidationSeedSourcePath !== WORKSPACE_ROOT_PATH
          ? normalizedValidationSeedSourcePath
          : normalizeWorkspacePath(TEST_VALIDATION_WORKSPACE_REQUESTED_BASENAME)
      )
    : normalizeWorkspacePath(TEST_VALIDATION_WORKSPACE_REQUESTED_BASENAME)
export const TEST_VALIDATION_WORKSPACE_SEED_BASENAME =
  workspaceBasename(TEST_VALIDATION_WORKSPACE_SEED_PATH) || TEST_VALIDATION_WORKSPACE_REQUESTED_BASENAME
const GEOSPATIAL_WORKSPACE_SEED_REL_PATH_CANDIDATES = buildInitializationSeedRelPathCandidates(GEOSPATIAL_WORKSPACE_SEED_BASENAME)
export const GEOSPATIAL_WORKSPACE_SEED_REL_PATH = GEOSPATIAL_WORKSPACE_SEED_REL_PATH_CANDIDATES[0] || GEOSPATIAL_WORKSPACE_SEED_BASENAME
export const GEOSPATIAL_WORKSPACE_SEED_PATH = normalizeWorkspacePath(GEOSPATIAL_WORKSPACE_SEED_BASENAME)
export const XR_PHYSICS_WORKSPACE_SEED_PATH = normalizeWorkspacePath(`/${XR_PHYSICS_DEMO_REPO_REL_PATH}`)
export const XR_PHYSICS_WORKSPACE_ROOT_ALIAS_PATH = normalizeWorkspacePath(XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME)
const DEFAULT_WORKSPACE_README_TEXT = [
  '---',
  'title: "Knowgrph - Write it. See it. Ship it."',
  'kgCanvasSurfaceMode: "2d"',
  'kgCanvasRenderMode: "2d"',
  'kgCanvas2dRenderer: "d3"',
  'kgDocumentSemanticMode: "document"',
  'kgFrontmatterModeEnabled: true',
  'kgMultiDimTableModeEnabled: false',
  'kgDocumentStructureBaselineLock: false',
  '---',
  '',
  '# Write it. See it. Ship it.',
  '',
  `Workspace seed fallback for \`${WORKSPACE_README_SEED_REL_PATH}\`.`,
].join('\n')
const DEFAULT_VALIDATION_WORKSPACE_SEED_TEXT = [
  '---',
  `title: "${workspaceBasename(TEST_VALIDATION_WORKSPACE_SEED_PATH) || TEST_VALIDATION_WORKSPACE_SEED_BASENAME}"`,
  'kgCanvasSurfaceMode: "2d"',
  'kgCanvas2dRenderer: "storyboard"',
  'kgDocumentSemanticMode: "document"',
  'kgFrontmatterModeEnabled: true',
  '---',
  '',
  `Validation seed fallback for \`${TEST_VALIDATION_WORKSPACE_SEED_REL_PATH}\`.`,
].join('\n')
const DEFAULT_GEOSPATIAL_WORKSPACE_SEED_TEXT = [
  '---',
  'title: "GrabMaps Place - New Cafe Site Selection v1.1 (Singapore)"',
  'kgCanvasSurfaceMode: "geospatial"',
  'kgCanvas2dRenderer: "storyboard"',
  'kgDocumentSemanticMode: "document"',
  'kgFrontmatterModeEnabled: true',
  'kgMultiDimTableModeEnabled: false',
  'kgDocumentStructureBaselineLock: false',
  '---',
  '',
  `Geospatial seed fallback for \`${GEOSPATIAL_WORKSPACE_SEED_REL_PATH}\`.`,
].join('\n')
export type WorkspaceSeedFile = {
  path: WorkspacePath
  text: string
  isFallback: boolean
}
type WorkspaceSeedSpec = {
  path: WorkspacePath
  basename: string
  sourceRelPaths: string[]
  fallbackText: string
  sourceLoader?: () => Promise<string>
}
const WORKSPACE_SEED_SPECS: readonly WorkspaceSeedSpec[] = [
  {
    path: WORKSPACE_README_SEED_PATH,
    basename: WORKSPACE_README_SEED_BASENAME,
    sourceRelPaths: WORKSPACE_README_SEED_REL_PATH_CANDIDATES,
    fallbackText: DEFAULT_WORKSPACE_README_TEXT,
  },
  {
    path: TEST_VALIDATION_WORKSPACE_SEED_PATH,
    basename: TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
    sourceRelPaths: TEST_VALIDATION_WORKSPACE_SEED_REL_PATH_CANDIDATES,
    fallbackText: DEFAULT_VALIDATION_WORKSPACE_SEED_TEXT,
  },
  {
    path: GEOSPATIAL_WORKSPACE_SEED_PATH,
    basename: GEOSPATIAL_WORKSPACE_SEED_BASENAME,
    sourceRelPaths: GEOSPATIAL_WORKSPACE_SEED_REL_PATH_CANDIDATES,
    fallbackText: DEFAULT_GEOSPATIAL_WORKSPACE_SEED_TEXT,
  },
  ...(CANONICAL_XR_PHYSICS_WORKSPACE_SEED_ENABLED ? [{
    path: XR_PHYSICS_WORKSPACE_SEED_PATH,
    basename: XR_PHYSICS_DEMO_WORKSPACE_SEED_BASENAME,
    sourceRelPaths: [XR_PHYSICS_DEMO_REPO_REL_PATH],
    fallbackText: '',
    sourceLoader: loadXrPhysicsDemoSeedSource,
  }] : []),
].filter(seed => !REPO_LOCAL_VALIDATION_SOURCE_EXCLUSIVE || seed.path === TEST_VALIDATION_WORKSPACE_SEED_PATH)
const WORKSPACE_SEED_PATH_SET = new Set<WorkspacePath>(WORKSPACE_SEED_SPECS.map(seed => seed.path))
const WORKSPACE_SEED_SOURCE_REL_PATH_SET = new Set<WorkspacePath>(
  WORKSPACE_SEED_SPECS
    .flatMap(seed => seed.sourceRelPaths.map(path => normalizeWorkspacePath(path)))
    .filter((path): path is WorkspacePath => Boolean(path && path !== WORKSPACE_ROOT_PATH)),
)
const WORKSPACE_INITIALIZATION_PATH_SET = new Set<WorkspacePath>([
  ...WORKSPACE_SEED_PATH_SET,
  ...WORKSPACE_SEED_SOURCE_REL_PATH_SET,
])
const DEFAULT_WORKSPACE_SEED_FAMILY_PATHS = new Set<WorkspacePath>([
  ...WORKSPACE_SEED_SPECS.map(seed => seed.path),
])

export const loadWorkspaceSeedText = async (args: {
  basename: string
  relPaths: ReadonlyArray<string>
  fallbackText: string
  docsMirrorEntries?: Awaited<ReturnType<typeof readWorkspaceInitializationDocsMirrorEntries>>
  sourceExclusive?: boolean
}): Promise<{ text: string; isFallback: boolean }> => {
  const basename = normalizeInitializationSeedRelPath(args.basename)
  if (args.sourceExclusive) {
    const preferredText = await readWorkspaceInitializationSeedText({
      basename: args.basename,
      relPathCandidates: args.relPaths,
    })
    if (preferredText) return { text: preferredText, isFallback: false }
    return { text: args.fallbackText, isFallback: true }
  }
  const relPathSet = new Set(
    (args.relPaths || [])
      .map(path => normalizeInitializationSeedRelPath(path))
      .filter(Boolean),
  )
  const docsMirrorEntries = Array.isArray(args.docsMirrorEntries)
    ? args.docsMirrorEntries
    : await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
  if (docsMirrorEntries.length > 0) {
    const byUpdatedDesc = [...docsMirrorEntries].sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0))
    for (let i = 0; i < byUpdatedDesc.length; i += 1) {
      const entry = byUpdatedDesc[i]
      if (!entry) continue
      const relPath = normalizeInitializationSeedRelPath(entry.relPath)
      if (!relPath) continue
      if (relPathSet.has(relPath)) return { text: String(entry.text || ''), isFallback: false }
      if (basename && relPath.endsWith(`/${basename}`)) return { text: String(entry.text || ''), isFallback: false }
      if (basename && relPath === basename) return { text: String(entry.text || ''), isFallback: false }
    }
  }
  const text = await readWorkspaceInitializationSeedText({
    basename: args.basename,
    relPathCandidates: args.relPaths,
  })
  if (text) return { text, isFallback: false }
  return { text: args.fallbackText, isFallback: true }
}

export function isInitializationWorkspacePath(path: WorkspacePath | null | undefined): boolean {
  const normalized = path ? normalizeWorkspacePath(path) : null
  if (!normalized) return false
  return WORKSPACE_INITIALIZATION_PATH_SET.has(normalized)
}

export function buildWorkspaceSeedFileEntry(path: WorkspacePath, text: string, updatedAtMs = Date.now()): WorkspaceEntry {
  const normalizedPath = normalizeWorkspacePath(path)
  const folderPaths = ancestorPathsForWorkspacePath(normalizedPath)
  return {
    path: normalizedPath,
    parentPath: folderPaths.length > 0 ? normalizeWorkspacePath(folderPaths[folderPaths.length - 1]!) : WORKSPACE_ROOT_PATH,
    kind: 'file',
    name: workspaceBasename(normalizedPath),
    text: String(text ?? ''),
    updatedAtMs,
  }
}

export function expandWorkspaceSeedFileEntries(path: WorkspacePath, text: string, updatedAtMs = Date.now()): WorkspaceEntry[] {
  const normalizedPath = normalizeWorkspacePath(path)
  const folderPaths = ancestorPathsForWorkspacePath(normalizedPath)
  const out: WorkspaceEntry[] = []
  for (let i = 0; i < folderPaths.length; i += 1) {
    const folderPath = normalizeWorkspacePath(folderPaths[i]!)
    const parentPath =
      i === 0 ? WORKSPACE_ROOT_PATH : normalizeWorkspacePath(folderPaths[i - 1] || WORKSPACE_ROOT_PATH)
    out.push({
      path: folderPath,
      parentPath,
      kind: 'folder',
      name: workspaceBasename(folderPath),
      updatedAtMs,
    })
  }
  out.push(buildWorkspaceSeedFileEntry(normalizedPath, text, updatedAtMs))
  return out
}

export async function getWorkspaceSeedFiles(): Promise<WorkspaceSeedFile[]> {
  const docsMirrorEntries = REPO_LOCAL_VALIDATION_SOURCE_EXCLUSIVE
    ? []
    : await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
  const loaded = await Promise.all(
    WORKSPACE_SEED_SPECS.map(async seed => {
      if (seed.sourceLoader) {
        const text = String(await seed.sourceLoader() || '')
        return text.trim() ? { path: seed.path, text, isFallback: false } : null
      }
      return {
        path: seed.path,
        ...(await loadWorkspaceSeedText({
          basename: seed.basename,
          relPaths: seed.sourceRelPaths,
          fallbackText: seed.fallbackText,
          docsMirrorEntries,
          sourceExclusive: REPO_LOCAL_VALIDATION_SOURCE_EXCLUSIVE,
        })),
      }
    }),
  )
  return loaded.filter((seed): seed is WorkspaceSeedFile => seed !== null)
}

export function shouldPreserveFallbackWorkspaceSeedText(text: string): boolean {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  return trimmed.startsWith('---') && (
    trimmed.includes('kgCanvasSurfaceMode:')
    || trimmed.includes('kgCanvasRenderMode:')
    || trimmed.includes('kgDocumentSemanticMode:')
  )
}

export function shouldReconcileDefaultWorkspaceSeedFamily(paths: ReadonlyArray<WorkspacePath>): boolean {
  const normalized = paths
    .map(path => normalizeWorkspacePath(path))
    .filter((path): path is WorkspacePath => Boolean(path))
  if (normalized.length === 0) return false
  for (let i = 0; i < normalized.length; i += 1) {
    if (!DEFAULT_WORKSPACE_SEED_FAMILY_PATHS.has(normalized[i]!)) return false
  }
  const nextSeedPaths = WORKSPACE_SEED_PATH_SET
  if (normalized.length !== nextSeedPaths.size) return true
  for (let i = 0; i < normalized.length; i += 1) {
    if (!nextSeedPaths.has(normalized[i]!)) return true
  }
  return false
}

export function isDefaultWorkspaceSeedFamilyOnly(paths: ReadonlyArray<WorkspacePath>): boolean {
  const normalized = paths
    .map(path => normalizeWorkspacePath(path))
    .filter((path): path is WorkspacePath => Boolean(path))
  if (normalized.length === 0) return false
  for (let i = 0; i < normalized.length; i += 1) {
    if (!DEFAULT_WORKSPACE_SEED_FAMILY_PATHS.has(normalized[i]!)) return false
  }
  return true
}

export function resolveWorkspaceStartupActivePath(args: {
  workspaceFilePaths: ReadonlyArray<WorkspacePath>
  activePath?: WorkspacePath | null
  preferDefaultStarter?: boolean
  forceValidationSeedIfPresent?: boolean
}): WorkspacePath | null {
  const workspaceFilePaths = args.workspaceFilePaths
    .map(path => normalizeWorkspacePath(path))
    .filter((path): path is WorkspacePath => Boolean(path))
  const workspaceFilePathSet = new Set(workspaceFilePaths)
  const activePath = args.activePath ? normalizeWorkspacePath(args.activePath) : null
  const activePathExists = !!(activePath && workspaceFilePathSet.has(activePath))
  const preferredStarterPath = CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE ? TEST_VALIDATION_WORKSPACE_SEED_PATH : XR_PHYSICS_WORKSPACE_SEED_PATH
  if (args.forceValidationSeedIfPresent === true && workspaceFilePathSet.has(TEST_VALIDATION_WORKSPACE_SEED_PATH)) {
    return TEST_VALIDATION_WORKSPACE_SEED_PATH
  }
  if (args.preferDefaultStarter === true && !activePath && workspaceFilePathSet.has(preferredStarterPath)) return preferredStarterPath
  if (isDefaultWorkspaceSeedFamilyOnly(workspaceFilePaths)) {
    if (
      activePathExists &&
      args.preferDefaultStarter === true &&
      activePath !== preferredStarterPath
    ) {
      return activePath
    }
    if (args.preferDefaultStarter === true && workspaceFilePathSet.has(preferredStarterPath)) {
      return preferredStarterPath
    }
    if (workspaceFilePathSet.has(WORKSPACE_README_SEED_PATH)) return WORKSPACE_README_SEED_PATH
    return workspaceFilePaths[0] || null
  }
  return activePathExists ? activePath : null
}
export function sortWorkspaceEntriesForExplorer(entries: ReadonlyArray<WorkspaceEntry>): WorkspaceEntry[] {
  const list = Array.isArray(entries) ? [...entries] : []
  const workspaceFilePaths = list
    .filter((entry): entry is WorkspaceEntry & { kind: 'file' } => entry?.kind === 'file')
    .map(entry => normalizeWorkspacePath(entry.path))
    .filter((path): path is WorkspacePath => Boolean(path))
  const isDefaultSeedOnly = isDefaultWorkspaceSeedFamilyOnly(workspaceFilePaths)
  const canonicalSeedRankByPath = new Map<WorkspacePath, number>(
    WORKSPACE_SEED_SPECS.map((seed, index) => [seed.path, index]),
  )
  const rank = (entry: WorkspaceEntry): number => {
    const path = normalizeWorkspacePath(entry.path)
    if (!isDefaultSeedOnly) return entry.kind === 'folder' ? 0 : 1
    const canonicalRank = canonicalSeedRankByPath.get(path)
    if (typeof canonicalRank === 'number') return canonicalRank
    return entry.kind === 'folder' ? WORKSPACE_SEED_SPECS.length : WORKSPACE_SEED_SPECS.length + 1
  }
  list.sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    const nameDiff = String(a.name || '').localeCompare(String(b.name || ''))
    if (nameDiff !== 0) return nameDiff
    return String(a.path || '').localeCompare(String(b.path || ''))
  })
  return list
}

export function defaultParentPath(): WorkspacePath {
  return WORKSPACE_ROOT_PATH
}
