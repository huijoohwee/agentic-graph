import { LS_KEYS } from '@/lib/config'
import { lsJson, lsSetJson, lsSetJsonCoalesced } from '@/lib/persistence'
import type { WorkspacePath } from './types'
import { normalizeWorkspacePath } from './path'

export async function importContentDigest(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export type WorkspaceImportState = {
  identity: string
  inputDigest?: string
  outputDigest: string
  checkedAt: number
  status: 'imported' | 'unchanged'
  etag?: string
  lastModified?: string
}

export type WorkspaceEntrySource = (
  | { kind: 'local'; originalName?: string | null }
  | { kind: 'url'; url: string }
) & { importState?: WorkspaceImportState }

export type WorkspaceSourceIndex = Record<string, WorkspaceEntrySource>
export type WorkspaceSourceIndexWriteOptions = {
  persist?: 'coalesced' | 'sync'
}

let cachedSourceIndex: WorkspaceSourceIndex | null = null
let cachedSourceIndexRev = 0

const persistSourceIndex = (
  next: WorkspaceSourceIndex,
  options?: WorkspaceSourceIndexWriteOptions,
): WorkspaceSourceIndex => {
  if (options?.persist === 'sync') {
    lsSetJson(LS_KEYS.markdownWorkspaceSourcesByPath, next)
    lsSetJsonCoalesced(LS_KEYS.markdownWorkspaceSourcesByPath, next, { delayMs: 0 })
    return next
  }
  cachedSourceIndex = next
  // Let the shared runtime+persistence scheduler coalesce bursts naturally (last-write-wins).
  // Avoid rev-based signatures that defeat cross-cycle suppression/dedupe.
  lsSetJsonCoalesced(LS_KEYS.markdownWorkspaceSourcesByPath, next)
  return next
}

const noteNextSourceIndex = (
  next: WorkspaceSourceIndex,
  options?: WorkspaceSourceIndexWriteOptions,
): WorkspaceSourceIndex => {
  cachedSourceIndex = next
  cachedSourceIndexRev += 1
  return persistSourceIndex(next, options)
}

const areEntrySourcesEqual = (a: WorkspaceEntrySource | null, b: WorkspaceEntrySource | null): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind || JSON.stringify(a.importState) !== JSON.stringify(b.importState)) return false
  if (a.kind === 'url') return String(a.url || '') === String((b as { url?: unknown }).url || '')
  if (a.kind === 'local') return String(a.originalName || '') === String((b as { originalName?: unknown }).originalName || '')
  return false
}

function readImportState(value: unknown): { importState?: WorkspaceImportState } {
  if (!value || typeof value !== 'object') return {}
  const v = value as WorkspaceImportState
  if (typeof v.identity !== 'string' || v.identity.length > 8192 || !/^[a-f0-9]{64}$/.test(v.outputDigest)
    || (v.inputDigest !== undefined && !/^[a-f0-9]{64}$/.test(v.inputDigest)) || !Number.isFinite(v.checkedAt)
    || !['imported', 'unchanged'].includes(v.status)) return {}
  return { importState: { identity: v.identity, inputDigest: v.inputDigest, outputDigest: v.outputDigest, checkedAt: v.checkedAt, status: v.status,
    ...(typeof v.etag === 'string' && v.etag.length < 4096 ? { etag: v.etag } : {}),
    ...(typeof v.lastModified === 'string' && v.lastModified.length < 256 ? { lastModified: v.lastModified } : {}) } }
}

const parseSourceIndex = (raw: unknown): WorkspaceSourceIndex => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const rec = raw as Record<string, unknown>
  const out: WorkspaceSourceIndex = {}
  for (const [k, v] of Object.entries(rec)) {
    const path = String(k || '').trim()
    if (!path) continue
    const normalizedPath = normalizeWorkspacePath(path)
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const src = v as Record<string, unknown>
    const kind = String(src.kind || '').trim()
    if (kind === 'url') {
      const url = String(src.url || '').trim()
      if (!url) continue
      const next = { kind: 'url', url, ...readImportState(src.importState) } satisfies WorkspaceEntrySource
      const existing = out[normalizedPath]
      if (!existing || existing.kind !== 'url') out[normalizedPath] = next
      continue
    }
    if (kind === 'local') {
      const originalName = typeof src.originalName === 'string' ? src.originalName : null
      if (!out[normalizedPath]) out[normalizedPath] = { kind: 'local', originalName, ...readImportState(src.importState) }
    }
  }
  return out
}

export function loadWorkspaceSourceIndex(): WorkspaceSourceIndex {
  if (cachedSourceIndex) return cachedSourceIndex
  const loaded = lsJson<WorkspaceSourceIndex>(LS_KEYS.markdownWorkspaceSourcesByPath, {}, parseSourceIndex)
  cachedSourceIndex = loaded
  return loaded
}

export function readReusableWorkspaceSourceIndexSnapshot(
  sourcesByPath: WorkspaceSourceIndex | null | undefined,
): WorkspaceSourceIndex | undefined {
  return sourcesByPath && typeof sourcesByPath === 'object' ? sourcesByPath : undefined
}

export function resolveWorkspaceSourceIndexSnapshot(
  sourcesByPath: WorkspaceSourceIndex | null | undefined,
): WorkspaceSourceIndex {
  return readReusableWorkspaceSourceIndexSnapshot(sourcesByPath) || loadWorkspaceSourceIndex()
}

export function setWorkspaceEntrySource(
  path: WorkspacePath,
  source: WorkspaceEntrySource | null,
  options?: WorkspaceSourceIndexWriteOptions,
): WorkspaceSourceIndex {
  const key = normalizeWorkspacePath(path)
  if (!key) return loadWorkspaceSourceIndex()
  const existing = loadWorkspaceSourceIndex()
  if (!source) {
    if (!(key in existing)) return existing
    const next: WorkspaceSourceIndex = { ...existing }
    delete next[key]
    return noteNextSourceIndex(next, options)
  }
  const prev = existing[key] || null
  if (!source.importState && prev?.importState && areEntrySourcesEqual({ ...prev, importState: undefined }, source)) source = { ...source, importState: prev.importState }
  if (areEntrySourcesEqual(prev, source)) {
    if (options?.persist === 'sync') persistSourceIndex(existing, options)
    return existing
  }
  const next: WorkspaceSourceIndex = { ...existing, [key]: source }
  return noteNextSourceIndex(next, options)
}

export function bulkSetWorkspaceEntrySources(items: Array<{ path: WorkspacePath; source: WorkspaceEntrySource }>): WorkspaceSourceIndex {
  const existing = loadWorkspaceSourceIndex()
  const next: WorkspaceSourceIndex = { ...existing }
  let changed = false
  for (const item of items) {
    const key = normalizeWorkspacePath(item?.path)
    if (!key) continue
    let source = item?.source
    if (!source) continue
    const prev = existing[key] || null
    if (!source.importState && prev?.importState && areEntrySourcesEqual({ ...prev, importState: undefined }, source)) source = { ...source, importState: prev.importState }
    if (areEntrySourcesEqual(prev, source)) continue
    next[key] = source
    changed = true
  }
  if (!changed) return existing
  return noteNextSourceIndex(next)
}

export function removeWorkspaceEntrySourcesForPrefix(path: WorkspacePath): WorkspaceSourceIndex {
  const key = normalizeWorkspacePath(path)
  if (!key) return loadWorkspaceSourceIndex()
  const existing = loadWorkspaceSourceIndex()
  const next: WorkspaceSourceIndex = { ...existing }
  const prefix = key.endsWith('/') ? key : `${key}/`
  let changed = false
  for (const k of Object.keys(next)) {
    if (k === key || k.startsWith(prefix)) {
      delete next[k]
      changed = true
    }
  }
  if (!changed) return existing
  return noteNextSourceIndex(next)
}
