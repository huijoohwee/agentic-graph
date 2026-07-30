import { listGitHubRepoTreeFiles, parseGitHubRepoUrl, resolveGitHubDefaultBranch } from '@/features/markdown-workspace/githubRepoApi'
import { mapLimit } from '@/lib/async/mapLimit'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProvider'
import { readCanonicalWorkspaceSeedBundleEntries } from './workspaceCanonicalSeedBundle'
import {
  WORKSPACE_SOURCE_MIRROR_EXTENSIONS,
  isWorkspaceSourceMirrorFileName,
  shouldEncodeWorkspaceSourceMirrorAsBase64,
} from './workspaceSourceMirrorFormats'

const GITHUB_DOCS_MIRROR_FETCH_CONCURRENCY = 8
const CANONICAL_GITHUB_DOCS_MIRROR_CACHE_TTL_MS = 60_000

export const CANONICAL_HUIJOOHWEE_DEMO_DOCS_GITHUB_URL =
  'https://github.com/huijoohwee/huijoohwee/tree/main/docs'
export const CANONICAL_HUIJOOHWEE_OUTPUT_DOCS_GITHUB_URL =
  'https://github.com/huijoohwee/huijoohwee/tree/main/docs_'

let canonicalDemoDatasetCache: { entries: WorkspaceDocsMirrorEntry[]; expiresAtMs: number } | null = null
let canonicalDemoDatasetInFlight: Promise<WorkspaceDocsMirrorEntry[]> | null = null
let canonicalOutputDatasetCache: { entries: WorkspaceDocsMirrorEntry[]; expiresAtMs: number } | null = null
let canonicalOutputDatasetInFlight: Promise<WorkspaceDocsMirrorEntry[]> | null = null

export const resetCanonicalPublishedDocsMirrorCacheForTests = (): void => {
  canonicalDemoDatasetCache = null
  canonicalDemoDatasetInFlight = null
  canonicalOutputDatasetCache = null
  canonicalOutputDatasetInFlight = null
}

const normalizeRepoRelPath = (value: string): string => {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

const stripRepoSubdirPrefix = (relPathRaw: string, subdirRaw: string): string => {
  const relPath = normalizeRepoRelPath(relPathRaw)
  const subdir = normalizeRepoRelPath(subdirRaw)
  if (!relPath || !subdir) return relPath
  if (relPath === subdir) return ''
  const prefix = `${subdir}/`
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : relPath
}

const encodeArrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  if (typeof btoa === 'function') return btoa(chunks.join(''))
  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: { from(buffer: ArrayBuffer): { toString(encoding: 'base64'): string } } }).Buffer
  return bufferCtor ? bufferCtor.from(buffer).toString('base64') : ''
}

const readStableUpdatedAtMs = (relPath: string, text: string): number => {
  const digest = hashStringToHex(`${relPath}\n${text}`).slice(0, 12)
  const parsed = Number.parseInt(digest, 16)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

const readGitHubMirrorFileText = async (args: {
  rawUrl: string
  relPath: string
  maxFileBytes: number
}): Promise<string | null> => {
  if (shouldEncodeWorkspaceSourceMirrorAsBase64(args.relPath)) {
    if (typeof fetch !== 'function') return null
    const response = await fetch(args.rawUrl)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > args.maxFileBytes) return null
    return encodeArrayBufferToBase64(buffer)
  }
  const fetched = await fetchRemoteTextDetailed(args.rawUrl, {
    preferProxy: true,
    preflightHead: false,
    maxBytes: args.maxFileBytes,
  })
  return fetched.ok ? fetched.text : null
}

export const isWorkspaceDocsMirrorGitHubSourceUrl = (url: string): boolean => {
  return !!parseGitHubRepoUrl(String(url || '').trim())
}

export const readWorkspaceDocsMirrorEntriesFromGitHubSourceUrl = async (args: {
  url: string
  maxFiles: number
  maxFileBytes: number
  requireCompleteDataset?: boolean
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (typeof fetch !== 'function') return []
  const repoRef = parseGitHubRepoUrl(String(args.url || '').trim())
  if (!repoRef) return []
  try {
    const ref = repoRef.ref || (await resolveGitHubDefaultBranch({ owner: repoRef.owner, repo: repoRef.repo }))
    const tree = await listGitHubRepoTreeFiles({
      owner: repoRef.owner,
      repo: repoRef.repo,
      ref,
      subdirPath: repoRef.subdirPath,
      maxFiles: args.maxFiles,
      allowedExtensions: WORKSPACE_SOURCE_MIRROR_EXTENSIONS,
    })
    const fetched = await mapLimit(
      tree.files,
      GITHUB_DOCS_MIRROR_FETCH_CONCURRENCY,
      async (file): Promise<WorkspaceDocsMirrorEntry | null> => {
        const relPath = stripRepoSubdirPrefix(file.relPath, repoRef.subdirPath)
        if (!relPath || !isWorkspaceSourceMirrorFileName(relPath)) return null
        const text = await readGitHubMirrorFileText({
          rawUrl: file.rawUrl,
          relPath,
          maxFileBytes: args.maxFileBytes,
        })
        if (text === null) return null
        return { relPath, text, updatedAtMs: readStableUpdatedAtMs(relPath, text) }
      },
    )
    if (args.requireCompleteDataset === true && fetched.some(entry => entry === null)) return []
    const byRelPath = new Map<string, WorkspaceDocsMirrorEntry>()
    for (const entry of fetched) {
      if (!entry) continue
      const existing = byRelPath.get(entry.relPath)
      if (!existing || entry.updatedAtMs >= existing.updatedAtMs) byRelPath.set(entry.relPath, entry)
    }
    return [...byRelPath.values()].sort((a, b) => a.relPath.localeCompare(b.relPath))
  } catch {
    return []
  }
}

export const readCanonicalHuijoohweeDemoDocsMirrorEntries = async (args: {
  maxFiles: number
  maxFileBytes: number
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (canonicalDemoDatasetCache && canonicalDemoDatasetCache.expiresAtMs > Date.now()) {
    return canonicalDemoDatasetCache.entries.map(entry => ({ ...entry }))
  }
  if (!canonicalDemoDatasetInFlight) {
    canonicalDemoDatasetInFlight = readWorkspaceDocsMirrorEntriesFromGitHubSourceUrl({
      url: CANONICAL_HUIJOOHWEE_DEMO_DOCS_GITHUB_URL,
      maxFiles: args.maxFiles,
      maxFileBytes: args.maxFileBytes,
      requireCompleteDataset: true,
    }).then(entries => entries.map(entry => ({ ...entry, authority: 'huijoohwee-demo-docs-github' })))
  }
  try {
    const entries = await canonicalDemoDatasetInFlight
    canonicalDemoDatasetCache = {
      entries: entries.map(entry => ({ ...entry })),
      expiresAtMs: Date.now() + CANONICAL_GITHUB_DOCS_MIRROR_CACHE_TTL_MS,
    }
    return entries.map(entry => ({ ...entry }))
  } finally {
    canonicalDemoDatasetInFlight = null
  }
}

export const readCanonicalHuijoohweeOutputDocsMirrorEntries = async (args: {
  maxFiles: number
  maxFileBytes: number
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (canonicalOutputDatasetCache && canonicalOutputDatasetCache.expiresAtMs > Date.now()) {
    return canonicalOutputDatasetCache.entries.map(entry => ({ ...entry }))
  }
  if (!canonicalOutputDatasetInFlight) {
    canonicalOutputDatasetInFlight = readWorkspaceDocsMirrorEntriesFromGitHubSourceUrl({
      url: CANONICAL_HUIJOOHWEE_OUTPUT_DOCS_GITHUB_URL,
      maxFiles: args.maxFiles,
      maxFileBytes: args.maxFileBytes,
      requireCompleteDataset: true,
    }).then(entries => entries.map(entry => ({ ...entry, authority: 'huijoohwee-output-docs-github' })))
  }
  try {
    const entries = await canonicalOutputDatasetInFlight
    canonicalOutputDatasetCache = {
      entries: entries.map(entry => ({ ...entry })),
      expiresAtMs: Date.now() + CANONICAL_GITHUB_DOCS_MIRROR_CACHE_TTL_MS,
    }
    return entries.map(entry => ({ ...entry }))
  } finally {
    canonicalOutputDatasetInFlight = null
  }
}

export const readCanonicalKnowgrphWorkspaceSeedsMirrorEntries = async (): Promise<
  WorkspaceDocsMirrorEntry[]
> => {
  const entries = await readCanonicalWorkspaceSeedBundleEntries()
  return entries.map(entry => ({
    ...entry,
    authority: 'knowgrph-workspace-seeds-bundled',
  }))
}

export const readCanonicalPublishedNonAgenticDocsMirrorEntries = async (args: {
  maxFiles: number
  maxFileBytes: number
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const [demoEntries, outputEntries, seedEntries] = await Promise.all([
    readCanonicalHuijoohweeDemoDocsMirrorEntries(args),
    readCanonicalHuijoohweeOutputDocsMirrorEntries(args),
    readCanonicalKnowgrphWorkspaceSeedsMirrorEntries(),
  ])
  const workspaceEntries = demoEntries.filter(entry => {
    const relPath = normalizeRepoRelPath(entry.relPath)
    return relPath !== 'workspace-seeds' && !relPath.startsWith('workspace-seeds/')
  })
  const namespace = (entries: WorkspaceDocsMirrorEntry[], root: string) => entries.map(entry => ({
    ...entry,
    relPath: `${root}/${normalizeRepoRelPath(entry.relPath)}`,
  }))
  return [
    ...workspaceEntries,
    ...seedEntries,
    ...namespace(outputEntries, 'docs_'),
  ]
}
