import type { SourceFile } from '@/hooks/store/types'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { workspaceBasename } from '@/features/workspace-fs/path'
import { buildSourceFileRecord } from '@/features/source-files/sourceFileParsedState'
import {
  CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE,
  GEOSPATIAL_WORKSPACE_SEED_REL_PATH,
  GEOSPATIAL_WORKSPACE_SEED_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
  TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  TEST_VALIDATION_WORKSPACE_SEED_PATH,
  WORKSPACE_README_SEED_REL_PATH,
  WORKSPACE_README_SEED_BASENAME,
  WORKSPACE_README_SEED_PATH,
} from '@/features/workspace-fs/workspaceFs'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'

export const WORKSPACE_README_SOURCE_PATH = `workspace:${WORKSPACE_README_SEED_PATH}`
export const WORKSPACE_README_SOURCE_ID = `ws:${hashStringToHex(WORKSPACE_README_SOURCE_PATH)}`
export const WORKSPACE_README_PUBLIC_SOURCE_PATH = '/docs/workspace-readme.md'
export const TEST_VALIDATION_SOURCE_PATH = `workspace:${TEST_VALIDATION_WORKSPACE_SEED_PATH}`
export const TEST_VALIDATION_SOURCE_ID = `ws:${hashStringToHex(TEST_VALIDATION_SOURCE_PATH)}`
export const GEOSPATIAL_WORKSPACE_SOURCE_PATH = `workspace:${GEOSPATIAL_WORKSPACE_SEED_PATH}`
export const GEOSPATIAL_WORKSPACE_SOURCE_ID = `ws:${hashStringToHex(GEOSPATIAL_WORKSPACE_SOURCE_PATH)}`

const DEFAULT_WORKSPACE_SEED_SOURCE_PATHS = new Set<string>([
  WORKSPACE_README_SOURCE_PATH,
  TEST_VALIDATION_SOURCE_PATH,
  GEOSPATIAL_WORKSPACE_SOURCE_PATH,
])

const buildSeedWorkspacePathVariants = (...paths: Array<unknown>): string[] => {
  const out = new Set<string>()
  for (let i = 0; i < paths.length; i += 1) {
    const normalized = normalizeWorkspacePath(paths[i] as string)
    if (!normalized || normalized === '/') continue
    out.add(String(normalized))
  }
  return [...out]
}

const canonicalizeWorkspaceDocsPath = (path: string): string => {
  const normalized = normalizeWorkspacePath(path)
  const collapseNestedDocsMirrorPrefix = (value: string): string => {
    let next = normalizeWorkspacePath(value)
    if (!next || next === '/') return next
    const lower = next.toLowerCase()
    const nestedDocsMirrorPrefix = '/docs/huijoohwee/docs/'
    if (lower.startsWith(nestedDocsMirrorPrefix)) {
      next = `/docs/${next.slice(nestedDocsMirrorPrefix.length)}`
    }
    const docsMarker = '/huijoohwee/docs/'
    const markerIndex = next.toLowerCase().indexOf(docsMarker)
    if (markerIndex >= 0) {
      next = `/docs/${next.slice(markerIndex + docsMarker.length)}`
    }
    return normalizeWorkspacePath(next)
  }
  const collapsed = collapseNestedDocsMirrorPrefix(normalized)
  const docsSegment = '/docs/'
  if (collapsed.startsWith(docsSegment)) return collapsed
  const docsIndex = collapsed.lastIndexOf(docsSegment)
  if (docsIndex < 0) return collapsed
  return normalizeWorkspacePath(collapsed.slice(docsIndex))
}

const WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH = new Map<string, string>([
  ...buildSeedWorkspacePathVariants(
    WORKSPACE_README_SEED_PATH,
    WORKSPACE_README_SEED_REL_PATH,
    `/docs/${WORKSPACE_README_SEED_BASENAME}`,
  ).map(path => [path, WORKSPACE_README_SOURCE_PATH] as const),
  ...buildSeedWorkspacePathVariants(
    TEST_VALIDATION_WORKSPACE_SEED_PATH,
    TEST_VALIDATION_WORKSPACE_SEED_REL_PATH,
  ).map(path => [path, TEST_VALIDATION_SOURCE_PATH] as const),
  ...buildSeedWorkspacePathVariants(
    GEOSPATIAL_WORKSPACE_SEED_PATH,
    GEOSPATIAL_WORKSPACE_SEED_REL_PATH,
  ).map(path => [path, GEOSPATIAL_WORKSPACE_SOURCE_PATH] as const),
])

export function isDefaultWorkspaceSeedSourcePath(path: unknown): boolean {
  const normalized = String(path || '').trim()
  const canonical = resolveWorkspaceSeedSourcePath(normalized)
  return DEFAULT_WORKSPACE_SEED_SOURCE_PATHS.has(canonical || normalized)
}

export function isCanonicalWorkspaceSeedSourcePath(path: unknown): boolean {
  const normalized = String(path || '').trim()
  const canonical = resolveWorkspaceSeedSourcePath(normalized) || normalized
  return (
    canonical === WORKSPACE_README_SOURCE_PATH
    || canonical === TEST_VALIDATION_SOURCE_PATH
    || canonical === GEOSPATIAL_WORKSPACE_SOURCE_PATH
  )
}

export function resolveWorkspaceSeedSourcePath(path: unknown): string | null {
  const normalized = String(path || '').trim()
  if (!normalized) return null
  const direct = WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH.get(normalized)
  if (direct) return direct
  const normalizedWorkspacePath = (() => {
    if (normalized.startsWith('workspace:')) {
      return normalizeWorkspacePath(normalized.slice('workspace:'.length))
    }
    return normalizeWorkspacePath(normalized)
  })()
  const canonicalDocsWorkspacePath = canonicalizeWorkspaceDocsPath(normalizedWorkspacePath)
  const seededPath = WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH.get(normalizedWorkspacePath)
    || WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH.get(canonicalDocsWorkspacePath)
  if (seededPath) return seededPath
  if (canonicalDocsWorkspacePath.startsWith('/docs/')) {
    return `workspace:${canonicalDocsWorkspacePath}`
  }
  if (normalized.startsWith('workspace:')) {
    const workspacePath = normalizeWorkspacePath(normalized.slice('workspace:'.length))
    if (workspacePath) {
      return WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH.get(workspacePath)
        || WORKSPACE_SEED_SOURCE_PATH_BY_WORKSPACE_PATH.get(canonicalizeWorkspaceDocsPath(workspacePath))
        || null
    }
  }
  return null
}

export function defaultEnabledForWorkspaceSourcePath(path: unknown, forceEnabled = false): boolean {
  const normalized = String(path || '').trim()
  if (normalized === WORKSPACE_README_SOURCE_PATH) return true
  if (normalized === TEST_VALIDATION_SOURCE_PATH) return !!forceEnabled
  if (normalized === GEOSPATIAL_WORKSPACE_SOURCE_PATH) return !!forceEnabled
  return !!forceEnabled
}

function buildSeedSourceFile(args: {
  id: string
  path: string
  enabled: boolean
  name: string
}): SourceFile {
  return buildSourceFileRecord({
    id: args.id,
    name: args.name,
    text: '',
    enabled: args.enabled,
    source: { kind: 'local', path: args.path },
  })
}

export const WORKSPACE_README_SOURCE_FILE: SourceFile = buildSeedSourceFile({
  id: WORKSPACE_README_SOURCE_ID,
  path: WORKSPACE_README_SOURCE_PATH,
  enabled: true,
  name: workspaceBasename(WORKSPACE_README_SEED_PATH) || 'README.md',
})

export const TEST_VALIDATION_SOURCE_FILE: SourceFile = buildSeedSourceFile({
  id: TEST_VALIDATION_SOURCE_ID,
  path: TEST_VALIDATION_SOURCE_PATH,
  enabled: CUSTOM_TEST_VALIDATION_WORKSPACE_SEED_ACTIVE,
  name: workspaceBasename(TEST_VALIDATION_WORKSPACE_SEED_PATH) || TEST_VALIDATION_WORKSPACE_SEED_BASENAME,
})

export const GEOSPATIAL_WORKSPACE_SOURCE_FILE: SourceFile = buildSeedSourceFile({
  id: GEOSPATIAL_WORKSPACE_SOURCE_ID,
  path: GEOSPATIAL_WORKSPACE_SOURCE_PATH,
  enabled: false,
  name: workspaceBasename(GEOSPATIAL_WORKSPACE_SEED_PATH) || 'agentic-graph-maps-grabmap-multim-demo.md',
})

function mergeCanonicalSourceFile(base: SourceFile, existing: SourceFile | null): SourceFile {
  if (!existing) return base
  return {
    ...existing,
    id: base.id,
    name: base.name,
    enabled: base.enabled || !!existing.enabled,
    source: base.source,
  }
}

export function reconcileDefaultWorkspaceSeedSourceFiles(files: SourceFile[]): SourceFile[] {
  const list = Array.isArray(files) ? files : []
  const defaultFamily = list.filter(file => isDefaultWorkspaceSeedSourcePath(file?.source?.path))
  if (defaultFamily.length === 0) return list
  const hasCustomWorkspaceLocal = list.some(file => {
    const sourcePath = String(file?.source?.path || '')
    return sourcePath.startsWith('workspace:') && !isDefaultWorkspaceSeedSourcePath(sourcePath)
  })
  if (hasCustomWorkspaceLocal) return list
  const readmeExisting =
    list.find(file => String(file?.source?.path || '') === WORKSPACE_README_SOURCE_PATH) || null
  const validationExisting =
    list.find(file => String(file?.source?.path || '') === TEST_VALIDATION_SOURCE_PATH) || null
  const geospatialExisting =
    list.find(file => String(file?.source?.path || '') === GEOSPATIAL_WORKSPACE_SOURCE_PATH) || null
  const preserved = list.filter(file => !isDefaultWorkspaceSeedSourcePath(file?.source?.path))
  return [
    ...preserved,
    mergeCanonicalSourceFile(WORKSPACE_README_SOURCE_FILE, readmeExisting),
    mergeCanonicalSourceFile(TEST_VALIDATION_SOURCE_FILE, validationExisting),
    mergeCanonicalSourceFile(GEOSPATIAL_WORKSPACE_SOURCE_FILE, geospatialExisting),
  ]
}
