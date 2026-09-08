import { readEnvString } from '@/lib/config.env'
import {
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  readCachedWorkspaceDocsMirrorEntries,
  readFirstAgenticGraphStorageDocText,
} from './workspaceSeedProviderStorageCache'
import {
  WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES,
} from './workspaceDocsMirrorNodeReader'
import { isWorkspaceRepoLocalRunReadyBootstrap } from './workspaceRunReadyDemos'
import { isWorkspaceSourceMirrorFileName } from './workspaceSourceMirrorFormats'
import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProviderPaths'
import { readPaginatedWorkspaceStorageMirror, reportWorkspaceStorageMirrorFailure } from './workspaceSeedProviderStorage'

export const PUBLISHED_AGENTIC_DOCS_ROOT = 'agentic-canvas-os/docs'

type PublishedAgenticDocSource =
  | { authority: 'repo-local' }
  | { authority: 'canonical-storage'; text: string }

const normalizeCanonicalPath = (value: string): string => (
  String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
)

const isPublishedAgenticDocPath = (value: string): boolean => {
  const canonicalPath = normalizeCanonicalPath(value)
  return canonicalPath.startsWith(`${PUBLISHED_AGENTIC_DOCS_ROOT}/`)
}

const readStorageBaseUrl = (): string => (
  String(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', '') || '').trim()
)

const readUtf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength

const readPublishedAgenticDocsMirrorUncached = (baseUrl: string): Promise<WorkspaceDocsMirrorEntry[]> =>
  readPaginatedWorkspaceStorageMirror({
    baseUrl, workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    selectDocument: document => {
      const relPath = normalizeCanonicalPath(document.canonicalPath)
      if (!isPublishedAgenticDocPath(relPath) || !isWorkspaceSourceMirrorFileName(relPath)) return null
      return { relPath, updatedAtMs: Number.isFinite(document.updatedAtMs) ? Math.floor(document.updatedAtMs) : 0,
        authority: 'agentic-canvas-os-storage' }
    },
  })

export const readPublishedAgenticDocsMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
  const baseUrl = readStorageBaseUrl()
  if (!baseUrl) return []
  try {
    return await readCachedWorkspaceDocsMirrorEntries({
      policy: 'reuse-settled',
    cacheKey: `published-agentic-docs|${baseUrl}|${AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID}`,
      load: () => readPublishedAgenticDocsMirrorUncached(baseUrl),
    })
  } catch (error) {
    reportWorkspaceStorageMirrorFailure(error)
    return []
  }
}

export const readPublishedAgenticDocSource = async (
  canonicalPathRaw: string,
): Promise<PublishedAgenticDocSource> => {
  if (isWorkspaceRepoLocalRunReadyBootstrap()) return { authority: 'repo-local' }
  const canonicalPath = normalizeCanonicalPath(canonicalPathRaw)
  const baseUrl = readStorageBaseUrl()
  const storedText = (baseUrl && isPublishedAgenticDocPath(canonicalPath)
    ? await readFirstAgenticGraphStorageDocText({
        baseUrl,
        workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
        canonicalPathCandidates: [canonicalPath],
      })
    : '') ?? ''
  const text = readUtf8ByteLength(storedText) <= WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES
    ? storedText
    : ''
  return { authority: 'canonical-storage', text }
}
