import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { readAgenticGraphStorageBrowserSession } from '@/lib/storage/agentic-graph-storage-browser-session'
import { readActiveAgenticGraphStorageWorkspaceId } from './sourceFileShareUrl'
import { readAgenticGraphStorageBaseUrl, readAgenticGraphStorageRuntimeSyncEnabled } from './source-files-agentic-graph-storage-settings'
import { SOURCE_FILE_CLOUD_TRANSFER_LIMITS, readCanonicalCloudDocumentSnapshot, resolveSourceFileCanonicalCloudTarget, syncWorkspaceEntriesToCloudWorkspaceSnapshot } from './sourceFileCanonicalCloudSync'

export type SourceFileCloudTransferResult = { transferred: number; unchanged: number; conflicts: string[]; skipped: number }

export const normalizeSourceFileTransferScope = (value: string): string => {
  const path = String(value || '/').trim().replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  if (/[\u0000-\u001f\u007f]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Choose a file or folder path without traversal segments.')
  }
  return path.startsWith('/') ? path : `/${path}`
}
const withinScope = (path: string, prefix: string): boolean => prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
const assertBounds = (texts: string[]): void => {
  const bytes = texts.reduce((sum, text) => sum + new TextEncoder().encode(text).byteLength, 0)
  if (texts.length > SOURCE_FILE_CLOUD_TRANSFER_LIMITS.files || bytes > SOURCE_FILE_CLOUD_TRANSFER_LIMITS.bytes) {
    throw new Error('Choose a smaller folder: each transfer allows 50 Markdown files and 5 MiB.')
  }
}

// Resolve known local aliases first; new documents retain their repository owner.
const cloudWorkspacePath = (canonicalPath: string, entries: WorkspaceEntry[]): string | null => {
  const safe = normalizeSourceFileTransferScope(canonicalPath)
  if (!resolveSourceFileCanonicalCloudTarget(safe)) return null
  const existing = entries.find(entry => entry.kind === 'file'
    && resolveSourceFileCanonicalCloudTarget(entry.path)?.canonicalPath === canonicalPath)
  if (existing) return existing.path
  if (safe.startsWith('/agentic-graph/docs/workspace-seeds/')) return safe.slice('/agentic-graph'.length)
  if (safe.startsWith('/huijoohwee/docs/')) return safe.slice('/huijoohwee'.length)
  return safe
}

export const importSourceFileCloudSnapshot = async (args: {
  fs: WorkspaceFs; snapshot: Map<string, string>; prefix: string
}): Promise<SourceFileCloudTransferResult> => {
  const prefix = normalizeSourceFileTransferScope(args.prefix)
  const entries = await args.fs.listEntries()
  const selected: Array<{ path: string; text: string }> = []
  let skipped = 0
  // Validate the entire selected batch before writing any local bytes.
  for (const [canonicalPath, text] of args.snapshot) {
    const path = cloudWorkspacePath(canonicalPath, entries)
    if (!path) { skipped += 1; continue }
    if (withinScope(path, prefix)) selected.push({ path, text })
  }
  assertBounds(selected.map(item => item.text))
  const result: SourceFileCloudTransferResult = { transferred: 0, unchanged: 0, conflicts: [], skipped }
  const folders = new Map(entries.filter(entry => entry.kind === 'folder').map(entry => [entry.path, entry.path]))
  folders.set('/', '/')
  const ensureFolder = async (path: string): Promise<string> => {
    const known = folders.get(path)
    if (known) return known
    const index = path.lastIndexOf('/')
    const parent = await ensureFolder(path.slice(0, index) || '/')
    const actual = await args.fs.createFolder({ parentPath: parent, name: path.slice(index + 1), mirrorToHost: false })
    folders.set(path, actual)
    return actual
  }
  for (const item of selected) {
    const local = await args.fs.readFileText(item.path)
    if (local === item.text) { result.unchanged += 1; continue }
    const index = item.path.lastIndexOf('/')
    const parentPath = await ensureFolder(item.path.slice(0, index) || '/')
    let name = item.path.slice(index + 1)
    const conflict = local !== null || entries.some(entry => entry.path === item.path)
    if (conflict) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.text))
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 12)
      const dot = name.lastIndexOf('.')
      name = `${name.slice(0, dot)}.cloud-${hash}${name.slice(dot)}`
      const retainedPath = `${parentPath === '/' ? '' : parentPath}/${name}`
      if (await args.fs.readFileText(retainedPath) === item.text) {
        result.unchanged += 1
        result.conflicts.push(retainedPath)
        continue
      }
    }
    // Atomic create reserves a fresh name even if another tab edits concurrently.
    // Cloud copies never write the Git-backed host mirror or overwrite local files.
    const savedPath = await args.fs.createFile({ parentPath, name, text: item.text, mirrorToHost: false })
    if (await args.fs.readFileText(savedPath) !== item.text) throw new Error(`Local read-back failed for ${savedPath}. Retry the download.`)
    result.transferred += 1
    if (conflict || savedPath !== item.path) result.conflicts.push(savedPath)
  }
  return result
}

let transferInFlight = false
export const transferSourceFilesCloud = async (args: {
  direction: 'upload' | 'download'; prefix: string
}): Promise<SourceFileCloudTransferResult> => {
  if (transferInFlight) throw new Error('A Source Files transfer is already running.')
  transferInFlight = true
  try {
    if (!readAgenticGraphStorageRuntimeSyncEnabled()) throw new Error('Enable Online storage before transferring files.')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Local files are retained; retry when connected.')
    const workspaceId = readActiveAgenticGraphStorageWorkspaceId(), baseUrl = readAgenticGraphStorageBaseUrl()
    const session = await readAgenticGraphStorageBrowserSession({ workspaceId, baseUrl })
    if (session.status !== 'authenticated') throw new Error(session.message || 'Sign in with an active workspace membership before transferring files.')
    const fs = await getWorkspaceFs()
    if (args.direction === 'download') return await importSourceFileCloudSnapshot({ fs, prefix: args.prefix,
      snapshot: await readCanonicalCloudDocumentSnapshot({ workspaceId, baseUrl }) })
    const prefix = normalizeSourceFileTransferScope(args.prefix)
    const scoped = (await fs.listEntries()).filter(entry => entry.kind === 'file' && withinScope(entry.path, prefix))
    const entries: WorkspaceEntry[] = []
    for (const entry of scoped) {
      if (!resolveSourceFileCanonicalCloudTarget(entry.path)) continue
      entries.push({ ...entry, text: (await fs.readFileText(entry.path)) ?? entry.text ?? '' })
    }
    assertBounds(entries.map(entry => entry.text || ''))
    const results = await syncWorkspaceEntriesToCloudWorkspaceSnapshot({ entries, workspaceId, baseUrl })
    return { transferred: results.length, unchanged: 0, conflicts: [], skipped: scoped.length - entries.length }
  } finally { transferInFlight = false }
}
