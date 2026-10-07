import type { SourceFile } from '@/hooks/store/types'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { areSourceFileRecordsEqual, buildSourceFileRecord, readSourceFileParsedState } from '@/features/source-files/sourceFileParsedState'
import {
  defaultEnabledForWorkspaceSourcePath,
  isCanonicalWorkspaceSeedSourcePath,
  resolveWorkspaceSeedSourcePath,
} from '@/features/source-files/workspaceSeedSourceFiles'
import {
  isWorkspaceRuntimeOnlyReferencePath,
  isWorkspacePathUnderSourceRoots,
  normalizeWorkspaceSourceRootPaths,
} from '@/features/workspace-fs/workspaceSourceRoots'
import { isPersistedWorkspaceBinaryFileName } from '@/features/workspace-fs/workspaceSourceMirrorFormats'

function readYamlQuotedString(raw: string, key: string): string {
  const match = String(raw || '').match(new RegExp(`^${key}:\\s*['"]([^'"]+)['"]\\s*$`, 'm'))
  return match ? String(match[1] || '').trim() : ''
}

function resolveInternalSpatialCapturePayloadPaths(entries: WorkspaceEntry[]): Set<string> {
  const out = new Set<string>()
  for (const entry of entries) {
    if (!entry || entry.kind !== 'file') continue
    if (!String(entry.path || '').toLowerCase().endsWith('.spatial-capture.md')) continue
    const text = String(entry.text || '')
    if (!/^kgSpatialCaptureFileset:\s*true\s*$/m.test(text)) continue
    const pendingPath = readYamlQuotedString(text, 'kgAssetPendingLocalPath')
    if (pendingPath) out.add(pendingPath)
  }
  return out
}

export function workspaceSourcePathKey(path: string): string {
  const p = String(path || '').trim()
  return p ? `workspace:${p}` : 'workspace:'
}

export function resolveWorkspaceSourcePathKey(path: string): string {
  const raw = String(path || '').trim()
  const seedSourcePath = resolveWorkspaceSeedSourcePath(raw)
  if (seedSourcePath) return seedSourcePath
  const withoutWorkspacePrefix = raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw
  return workspaceSourcePathKey(withoutWorkspacePrefix)
}

export function mergeWorkspaceEntriesIntoSourceFiles(args: {
  existing: SourceFile[]
  workspaceEntries: WorkspaceEntry[]
  sourcesByPath: WorkspaceSourceIndex
  forceIncludePaths?: string[]
  forceIncludeOnly?: boolean
  preserveExistingWorkspaceEntries?: boolean
  workspaceDocsOnly?: boolean
  workspaceSourceRootPaths?: string[]
}): SourceFile[] {
  const existing = Array.isArray(args.existing) ? args.existing : []
  const entries = Array.isArray(args.workspaceEntries) ? args.workspaceEntries : []
  const sourcesByPath = args.sourcesByPath || {}
  const forceInclude = new Set((Array.isArray(args.forceIncludePaths) ? args.forceIncludePaths : []).map(path => String(path || '').trim()).filter(Boolean))
  const forceIncludeOnly = args.forceIncludeOnly === true && forceInclude.size > 0
  const preserveExistingWorkspaceEntries = args.preserveExistingWorkspaceEntries === true
  const workspaceDocsOnly = args.workspaceDocsOnly === true
  const workspaceSourceRootPaths = normalizeWorkspaceSourceRootPaths(args.workspaceSourceRootPaths)
  const internalSpatialCapturePayloadPaths = resolveInternalSpatialCapturePayloadPaths(entries)
  const canonicalMirrorBasenameSet = new Set<string>(
    entries
      .filter(entry => entry?.kind === 'file')
      .map(entry => String(entry.path || '').trim())
      .filter(path => isWorkspacePathUnderSourceRoots(path, args.workspaceSourceRootPaths || workspaceSourceRootPaths))
      .map(path => path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()?.toLowerCase() || '')
      .filter(Boolean),
  )
  const docsMirrorCanonicalSeedSourcePathSet = new Set<string>(
    entries
      .filter(entry => entry?.kind === 'file')
      .map(entry => String(entry.path || '').trim())
      .filter(path => !forceIncludeOnly || forceInclude.has(path))
      .filter(path => isWorkspacePathUnderSourceRoots(path, args.workspaceSourceRootPaths || workspaceSourceRootPaths))
      .map(path => {
        const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
        const basename = normalized.split('/').pop() || ''
        return resolveWorkspaceSeedSourcePath(`/${basename}`)
      })
      .filter(
        (seedSourcePath): seedSourcePath is string =>
          !!seedSourcePath && isCanonicalWorkspaceSeedSourcePath(seedSourcePath),
      ),
  )

  const nonWorkspace = existing.filter(f => {
    const path = String(f?.source?.path || '')
    if (workspaceDocsOnly) return false
    return !path.startsWith('workspace:')
  })

  const existingWorkspaceByPath = new Map<string, SourceFile>()
  for (const f of existing) {
    const srcPath = String(f?.source?.path || '')
    if (!srcPath.startsWith('workspace:')) continue
    if (internalSpatialCapturePayloadPaths.has(srcPath.slice('workspace:'.length))) continue
    existingWorkspaceByPath.set(srcPath, f)
  }

  const nextWorkspaceBySourcePath = new Map<string, SourceFile>()
  const nextWorkspaceRankBySourcePath = new Map<string, number>()
  const nextWorkspaceKeyBySourcePath = new Map<string, string>()
  for (const e of entries) {
    if (!e || e.kind !== 'file') continue
    const path = String(e.path || '').trim()
    if (!path) continue
    if (internalSpatialCapturePayloadPaths.has(path)) continue
    if (isWorkspaceRuntimeOnlyReferencePath(path)) continue
    if (forceIncludeOnly && !forceInclude.has(path)) continue
    const src = sourcesByPath[path]
    const explicitLocal = src?.kind === 'local'
    const underWorkspaceSourceRoot = isWorkspacePathUnderSourceRoots(path, args.workspaceSourceRootPaths || workspaceSourceRootPaths)
    if (workspaceDocsOnly && !underWorkspaceSourceRoot && !forceInclude.has(path) && !explicitLocal) continue

    const seedSourcePath = resolveWorkspaceSeedSourcePath(path)
    const basename = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || ''
    const isStaleRootDocsAliasCoveredByDocsMirror =
      workspaceDocsOnly
      && !explicitLocal
      && !isWorkspacePathUnderSourceRoots(path, args.workspaceSourceRootPaths || workspaceSourceRootPaths)
      && !forceInclude.has(path)
      && !seedSourcePath
      && path.split('/').filter(Boolean).length === 1
      && /\.md$/i.test(basename)
      && canonicalMirrorBasenameSet.has(basename.toLowerCase())
    if (isStaleRootDocsAliasCoveredByDocsMirror) continue
    const isLegacyRootSeedAliasCoveredByDocsMirror =
      !!seedSourcePath
      && !explicitLocal
      && isCanonicalWorkspaceSeedSourcePath(seedSourcePath)
      && !isWorkspacePathUnderSourceRoots(path, args.workspaceSourceRootPaths || workspaceSourceRootPaths)
      && docsMirrorCanonicalSeedSourcePathSet.has(seedSourcePath)
    if (isLegacyRootSeedAliasCoveredByDocsMirror) continue
    const srcPath = resolveWorkspaceSourcePathKey(path)
    const prev = existingWorkspaceByPath.get(srcPath) || null
    if (!prev && !src && !forceInclude.has(path) && !seedSourcePath && !(workspaceDocsOnly && underWorkspaceSourceRoot)) continue
    const inlineText = typeof e.text === 'string' ? e.text : null
    if (inlineText !== null && !inlineText.trim() && (src?.kind === 'url' || prev?.source?.kind === 'url')) continue
    const id = prev?.id || `ws:${hashStringToHex(srcPath)}`

    const source: NonNullable<SourceFile['source']> =
      src && src.kind === 'url'
        ? { kind: 'url', url: String(src.url || ''), path: srcPath }
        : { kind: 'local', path: srcPath }

    const text = inlineText !== null ? inlineText : (prev?.text ?? '')

    const enabled = forceInclude.has(path)
      ? true
      : (prev?.enabled ?? defaultEnabledForWorkspaceSourcePath(srcPath, false))
    const parsed = readSourceFileParsedState(prev)
    const candidate = buildSourceFileRecord({
      id,
      name: String(e.name || ''),
      text,
      enabled,
      geoLayerEnabled: prev?.geoLayerEnabled,
      status: prev?.status ?? 'idle',
      error: prev?.error,
      parserId: parsed.parsedParserId,
      textHash: parsed.parsedTextHash,
      graphData: parsed.parsedGraphData,
      previousState: prev,
      preserveExistingRevision: true,
      source,
    })

    const nextCandidate = prev && areSourceFileRecordsEqual(prev, candidate) ? prev : candidate
    const candidateRank =
      (forceInclude.has(path) ? 100 : 0)
      + (underWorkspaceSourceRoot ? 10 : 0)
      + (typeof e.text === 'string' ? 1 : 0)
    const candidateSortKey = `${String(path).length}:${String(path)}`
    const previousRank = nextWorkspaceRankBySourcePath.get(srcPath)
    const previousSortKey = nextWorkspaceKeyBySourcePath.get(srcPath)
    if (typeof previousRank === 'number') {
      if (previousRank > candidateRank) continue
      if (previousRank === candidateRank && typeof previousSortKey === 'string' && previousSortKey <= candidateSortKey) continue
    }
    nextWorkspaceBySourcePath.set(srcPath, nextCandidate)
    nextWorkspaceRankBySourcePath.set(srcPath, candidateRank)
    nextWorkspaceKeyBySourcePath.set(srcPath, candidateSortKey)
  }

  if (preserveExistingWorkspaceEntries && !forceIncludeOnly) {
    for (const file of existing) {
      if (!file) continue
      const sourcePath = String(file.source?.path || '')
      if (!sourcePath.startsWith('workspace:')) continue
      if (nextWorkspaceBySourcePath.has(sourcePath)) continue
      const workspacePath = sourcePath.slice('workspace:'.length)
      if (!workspacePath) continue
      if (isWorkspaceRuntimeOnlyReferencePath(workspacePath)) continue
      if (internalSpatialCapturePayloadPaths.has(workspacePath)) continue
      const explicitLocal = sourcesByPath[workspacePath]?.kind === 'local'
      const basename = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || ''
      const seedSourcePath = resolveWorkspaceSeedSourcePath(workspacePath)
      const isLegacyRootSeedAliasCoveredByDocsMirror =
        !!seedSourcePath
        && !explicitLocal
        && isCanonicalWorkspaceSeedSourcePath(seedSourcePath)
        && !isWorkspacePathUnderSourceRoots(workspacePath, args.workspaceSourceRootPaths || workspaceSourceRootPaths)
        && docsMirrorCanonicalSeedSourcePathSet.has(seedSourcePath)
      if (isLegacyRootSeedAliasCoveredByDocsMirror) continue
      const isStaleRootDocsAliasCoveredByDocsMirror =
        workspaceDocsOnly
        && !explicitLocal
        && !seedSourcePath
        && workspacePath.split('/').filter(Boolean).length === 1
        && /\.md$/i.test(basename)
        && canonicalMirrorBasenameSet.has(basename.toLowerCase())
      if (isStaleRootDocsAliasCoveredByDocsMirror) continue
      const hasInlineText = Boolean(String(file.text || '').trim())
      if (!hasInlineText && !isPersistedWorkspaceBinaryFileName(workspacePath)) continue
      if (
        workspaceDocsOnly
        && !explicitLocal
        && !isWorkspacePathUnderSourceRoots(workspacePath, args.workspaceSourceRootPaths || workspaceSourceRootPaths)
        && !forceInclude.has(workspacePath)
        && file.enabled !== true
      ) {
        continue
      }
      nextWorkspaceBySourcePath.set(sourcePath, file)
    }
  }

  const nextWorkspace = [...nextWorkspaceBySourcePath.values()]
  const next = [...nonWorkspace, ...nextWorkspace]
  if (existing.length === next.length) {
    let same = true
    for (let i = 0; i < next.length; i += 1) {
      if (existing[i] !== next[i]) {
        same = false
        break
      }
    }
    if (same) return existing
  }
  return next
}
