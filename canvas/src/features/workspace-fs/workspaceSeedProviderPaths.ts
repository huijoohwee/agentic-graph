import { readEnvString } from '@/lib/config.env'
import { readWorkspaceDocsMirrorRootPathSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readAgenticGraphWorkspaceSeedsReadAbsRoot } from './workspaceSeedLocalMirrorAuthority'
import type { WorkspaceDocsMirrorAuthority } from './workspaceSeedInventoryAuthority'
export const CANONICAL_STORAGE_DOCS_ROOT = 'agentic-canvas-os/docs'

export const normalizeRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}
export const normalizeBasename = (value: string): string => {
  const normalized = normalizeRelPath(value)
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return ''
  return parts[parts.length - 1] || ''
}
export const isWorkspaceBackedSourcePath = (value: unknown): boolean => {
  return String(value || '').trim().startsWith('workspace:')
}
export const normalizeAbsRoot = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
}

export const splitSafeMirrorSegments = (value: string): string[] => {
  const parts = normalizeRelPath(value).split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..')) return []
  return parts
}
export const readWorkspaceInitializationDocsAbsRoot = (): string => {
  return normalizeAbsRoot(readWorkspaceDocsMirrorRootPathSetting())
}

export const AGENTIC_CANVAS_OS_DOCS_REPOSITORY_FOLDER_NAME = 'docs'

export const readAbsParentRoot = (absRoot: string): string => {
  const normalized = normalizeAbsRoot(absRoot)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return `/${parts.slice(0, -1).join('/')}`
}

export const readWorkspaceInitializationAgenticOsDocsAbsRoot = (): string => {
  const explicit = normalizeAbsRoot(readEnvString('VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT', ''))
  if (explicit) return explicit
  const docsMirrorBaseRoot = readWorkspaceMirrorBaseAbsRoot()
  const repositoryParentRoot = readAbsParentRoot(docsMirrorBaseRoot)
  return repositoryParentRoot ? `${repositoryParentRoot}/agentic-canvas-os/${AGENTIC_CANVAS_OS_DOCS_REPOSITORY_FOLDER_NAME}` : ''
}

export const readWorkspaceInitializationOutputDocsAbsRoot = (): string => {
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  const parentRoot = readAbsParentRoot(docsRoot)
  return parentRoot ? `${parentRoot}/docs_` : ''
}

export const readWorkspaceInitializationChatLogAbsRoot = (): string => {
  const explicit = normalizeAbsRoot(readEnvString('VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT', ''))
  if (explicit) return explicit
  const baseRoot = readWorkspaceMirrorBaseAbsRoot()
  return baseRoot ? `${baseRoot}/chat-log` : ''
}

export const readWorkspaceMirrorBaseAbsRoot = (): string => {
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  if (!docsRoot) return ''
  const parts = docsRoot.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return `/${parts.slice(0, -1).join('/')}`
}

export const readWorkspaceInitializationAgenticGraphStorageBaseUrl = (): string => {
  return String(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', '') || '').trim()
}

export const readWorkspaceDocsMirrorStorageFallbackEnabled = (): boolean => {
  const raw = String(readEnvString('VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED', '') || '')
    .trim()
    .toLowerCase()
  if (!raw) return !!readWorkspaceInitializationAgenticGraphStorageBaseUrl()
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

export const normalizeSourceFileMirrorPath = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withoutWorkspacePrefix = raw.startsWith('workspace:') ? raw.slice('workspace:'.length) : raw
  const collapsePrefix = (path: string, prefix: string): string => {
    const normalizedPath = normalizeMirrorRelPath(path)
    const normalizedPrefix = normalizeMirrorRelPath(prefix)
    if (!normalizedPath || !normalizedPrefix) return normalizedPath
    const doubled = `${normalizedPrefix}/${normalizedPrefix}/`
    if (normalizedPath.startsWith(doubled)) {
      return `${normalizedPrefix}/${normalizedPath.slice(doubled.length)}`
    }
    return normalizedPath
  }
  let normalized = normalizeMirrorRelPath(withoutWorkspacePrefix)
  if (!normalized) return ''
  const docsRootMarker = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  const docsRootIndex = normalized.toLowerCase().indexOf(docsRootMarker)
  if (docsRootIndex > 0) {
    normalized = normalized.slice(docsRootIndex)
  }
  if (normalized.toLowerCase().startsWith(`docs/${docsRootMarker}`)) {
    normalized = `${CANONICAL_STORAGE_DOCS_ROOT}/${normalized.slice(`docs/${docsRootMarker}`.length)}`
  }
  normalized = collapsePrefix(normalized, 'docs')
  normalized = collapsePrefix(normalized, CANONICAL_STORAGE_DOCS_ROOT)
  return normalizeMirrorRelPath(normalized)
}

export const WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT = 'docs'

export const stripWorkspaceDocsMirrorRootPrefix = (path: string): string => {
  const normalized = normalizeMirrorRelPath(path)
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()
  const docsRootMarker = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  if (lowered.startsWith(docsRootMarker)) {
    return normalizeMirrorRelPath(normalized.slice(docsRootMarker.length))
  }
  if (lowered.startsWith(`docs/${docsRootMarker}`)) {
    return normalizeMirrorRelPath(normalized.slice(`docs/${docsRootMarker}`.length))
  }
  const docsRootIndex = lowered.indexOf(`/${docsRootMarker}`)
  if (docsRootIndex >= 0) {
    return normalizeMirrorRelPath(normalized.slice(docsRootIndex + docsRootMarker.length + 1))
  }
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part, index) => index > 0 && String(part || '').toLowerCase() === WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT)) return ''
  let start = 0; while (start < parts.length && String(parts[start] || '').toLowerCase() === WORKSPACE_DOCS_MIRROR_ROOT_SEGMENT) {
    start += 1
  }
  if (start === 0) return normalized
  return normalizeMirrorRelPath(parts.slice(start).join('/'))
}

export const resolveSelectedFolderRelativeMirrorPath = (fullPath: string, selectedFolderPath: string): string => {
  const normalizedFullPath = normalizeSourceFileMirrorPath(fullPath)
  const normalizedSelectedFolderPath = normalizeSelectedFolderMirrorPath(selectedFolderPath)
  if (!normalizedFullPath) return ''
  if (!normalizedSelectedFolderPath) {
    const docsAbsRoot = readWorkspaceInitializationDocsAbsRoot()
    const normalizedAbsoluteFullPath = normalizeAbsRoot(String(fullPath || '').replace(/^workspace:/, ''))
    if (docsAbsRoot && normalizedAbsoluteFullPath.startsWith(`${docsAbsRoot}/`)) {
      return normalizeMirrorRelPath(normalizedAbsoluteFullPath.slice(docsAbsRoot.length + 1))
    }
    const trimmed = stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath)
    return trimmed
  }
  if (normalizedFullPath === normalizedSelectedFolderPath) return ''
  const prefix = `${normalizedSelectedFolderPath}/`
  if (normalizedFullPath.startsWith(prefix)) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(prefix.length))
  }
  const nestedPrefix = `${normalizedSelectedFolderPath}/`
  const nestedIndex = normalizedFullPath.indexOf(nestedPrefix)
  if (nestedIndex >= 0) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(nestedIndex + nestedPrefix.length))
  }
  const selectedParts = normalizedSelectedFolderPath.split('/').filter(Boolean)
  const selectedLeaf = selectedParts.length > 0 ? String(selectedParts[selectedParts.length - 1] || '').toLowerCase() : ''
  if (selectedLeaf) {
    const fullLower = normalizedFullPath.toLowerCase()
    if (fullLower === selectedLeaf) return ''
    if (fullLower.startsWith(`${selectedLeaf}/`)) {
      return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath.slice(selectedLeaf.length + 1))
    }
  }
  if (!normalizedFullPath.includes('/')) {
    return stripWorkspaceDocsMirrorRootPrefix(normalizedFullPath)
  }
  if (normalizedFullPath.endsWith(`/${normalizedSelectedFolderPath}`)) return ''
  return ''
}

export const buildWorkspaceSeedAbsolutePathCandidates = (args: {
  basename: string
  relPathCandidates: ReadonlyArray<string>
}): string[] => {
  const root = readWorkspaceInitializationDocsAbsRoot()
  const basename = normalizeBasename(args.basename)
  const relPathCandidates = Array.from(
    new Set((args.relPathCandidates || []).map(path => normalizeRelPath(path)).filter(Boolean)),
  )
  const out = new Set<string>()
  for (let i = 0; i < relPathCandidates.length; i += 1) {
    const relPath = relPathCandidates[i]!
    if (isAgenticGraphWorkspaceSeedsPath(relPath)) {
      const seedsRoot = readAgenticGraphWorkspaceSeedsReadAbsRoot()
      const seedRelPath = normalizeRelPath(relPath).replace(/^docs\/workspace-seeds\/?/, '')
      if (seedsRoot && seedRelPath) out.add(`${seedsRoot}/${seedRelPath}`)
      continue
    }
    if (!root) continue
    out.add(`${root}/${relPath}`)
    if (relPath.startsWith('docs/')) {
      out.add(`${root}/${relPath.slice('docs/'.length)}`)
    }
  }
  if (basename && root) out.add(`${root}/${basename}`)
  return [...out]
}

export const resolveWorkspaceDocsMirrorAbsolutePath = (workspacePath: string): string | null => {
  const parts = splitSafeMirrorSegments(String(workspacePath || '').trim())
  if (parts.length === 0) return null
  if (isAgenticGraphWorkspaceSeedsPath(workspacePath)) return null
  const rootSegment = String(parts[0] || '').trim()
  if (!rootSegment) return null
  const docsRoot = readWorkspaceInitializationDocsAbsRoot()
  const chatLogRoot = readWorkspaceInitializationChatLogAbsRoot()
  const baseRoot = readWorkspaceMirrorBaseAbsRoot()
  const loweredRootSegment = rootSegment.toLowerCase()
  const root = loweredRootSegment === 'docs'
    ? docsRoot
    : loweredRootSegment === 'chat-log'
      ? chatLogRoot
      : baseRoot
        ? `${baseRoot}/${rootSegment}`
        : ''
  if (!root) return null
  const relPath = normalizeMirrorRelPath(parts.slice(1).join('/'))
  if (!relPath) return root
  return `${root}/${relPath}`
}

export const normalizeMirrorRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export const normalizeSelectedFolderMirrorPath = (value: string): string => {
  const normalized = normalizeMirrorRelPath(value)
  if (!normalized) return ''
  const asFolder = (() => {
    const markdownLikeExt = /\.(md|markdown|mdx|mmd)$/i
    if (!markdownLikeExt.test(normalized)) return normalized
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length <= 1) return ''
    return normalizeMirrorRelPath(parts.slice(0, -1).join('/'))
  })()
  const lower = asFolder.toLowerCase()
  const docsRootPrefix = `${CANONICAL_STORAGE_DOCS_ROOT}/`
  const docsRootIndex = lower.indexOf(docsRootPrefix)
  if (docsRootIndex >= 0) {
    return normalizeMirrorRelPath(asFolder.slice(docsRootIndex + docsRootPrefix.length))
  }
  if (lower === 'docs' || lower.endsWith('/docs')) return ''
  if (lower.startsWith('docs/')) return normalizeMirrorRelPath(asFolder.slice('docs/'.length))
  const parts = asFolder.split('/').filter(Boolean)
  let docsIndex = -1
  for (let i = 0; i < parts.length; i += 1) {
    if (String(parts[i] || '').toLowerCase() === 'docs') docsIndex = i
  }
  if (docsIndex >= 0) {
    return normalizeMirrorRelPath(parts.slice(docsIndex + 1).join('/'))
  }
  return asFolder
}

export type WorkspaceDocsMirrorEntry = {
  relPath: string
  text: string
  updatedAtMs: number
  authority?: WorkspaceDocsMirrorAuthority
}
