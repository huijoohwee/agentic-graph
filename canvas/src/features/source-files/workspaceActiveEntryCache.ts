import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'

const ACTIVE_ENTRY_CACHE_MAX_PATHS = 12
const ACTIVE_ENTRY_CACHE_MAX_TOTAL_CHARS = 1_500_000
const ACTIVE_ENTRY_CACHE_MAX_ENTRY_CHARS = 500_000

type ActiveEntrySlot = {
  owner: object
  activePath: WorkspacePath
  entry?: WorkspaceEntry
  textChars: number
  updatedAtMs: number
}

// One bounded LRU across owners, including pending reads. Tokens removed by a
// newer read, invalidation or eviction can never install a late response.
const activeEntrySlots = new Map<object, ActiveEntrySlot>()
const ownerIds = new WeakMap<WorkspaceFs, object>()
const timestamp = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

function findSlot(fs: WorkspaceFs, activePath: WorkspacePath) {
  const owner = ownerIds.get(fs)
  return [...activeEntrySlots].find(([, slot]) => slot.owner === owner && slot.activePath === activePath)
}

function pruneActiveEntryCache(): void {
  let totalChars = 0
  for (const slot of activeEntrySlots.values()) totalChars += slot.textChars
  while (activeEntrySlots.size > ACTIVE_ENTRY_CACHE_MAX_PATHS || totalChars > ACTIVE_ENTRY_CACHE_MAX_TOTAL_CHARS) {
    const oldest = activeEntrySlots.entries().next().value
    if (!oldest) break
    activeEntrySlots.delete(oldest[0])
    totalChars -= oldest[1].textChars
  }
}

export function beginWorkspaceActiveEntrySnapshotRead(args: {
  fs: WorkspaceFs
  activePath: WorkspacePath
}): object | null {
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath || activePath === '/' || activePath.length > ACTIVE_ENTRY_CACHE_MAX_ENTRY_CHARS) return null
  let owner = ownerIds.get(args.fs)
  if (!owner) { owner = {}; ownerIds.set(args.fs, owner) }
  const previous = findSlot(args.fs, activePath)
  if (previous) activeEntrySlots.delete(previous[0])
  const token = {}
  activeEntrySlots.set(token, { owner, activePath, textChars: activePath.length, updatedAtMs: 0 })
  pruneActiveEntryCache()
  return token
}

export function readCachedWorkspaceActiveEntrySnapshot(args: {
  fs: WorkspaceFs
  activePath: WorkspacePath
  minUpdatedAtMs?: number
}): WorkspaceEntry[] | undefined {
  const activePath = normalizeWorkspacePath(args.activePath)
  const found = findSlot(args.fs, activePath)
  if (!found) return undefined
  const [token, cached] = found
  if (!cached.entry) return undefined
  if (cached.updatedAtMs < timestamp(args.minUpdatedAtMs)) {
    activeEntrySlots.delete(token)
    return undefined
  }
  activeEntrySlots.delete(token)
  activeEntrySlots.set(token, cached)
  return [{ ...cached.entry }]
}

export function rememberWorkspaceActiveEntrySnapshot(args: {
  fs: WorkspaceFs
  activePath: WorkspacePath
  entries: WorkspaceEntry[]
  token: object | null
}): WorkspaceEntry[] | undefined {
  const activePath = normalizeWorkspacePath(args.activePath)
  const slot = args.token && activeEntrySlots.get(args.token)
  if (!slot || slot.owner !== ownerIds.get(args.fs) || slot.activePath !== activePath) return undefined
  const entry = args.entries.find(value => value?.kind === 'file' && normalizeWorkspacePath(value.path) === activePath)
  if (!entry || typeof entry.text !== 'string') {
    activeEntrySlots.delete(args.token!)
    return undefined
  }
  const textChars = entry.text.length + entry.path.length + entry.name.length + (entry.parentPath?.length || 0)
  if (textChars > ACTIVE_ENTRY_CACHE_MAX_ENTRY_CHARS) {
    activeEntrySlots.delete(args.token!)
    return undefined
  }
  slot.entry = { ...entry }
  slot.textChars = textChars
  slot.updatedAtMs = timestamp(entry.updatedAtMs)
  pruneActiveEntryCache()
  return [{ ...entry }]
}

export function invalidateCachedWorkspaceActiveEntrySnapshot(path?: WorkspacePath | null): void {
  const normalizedPath = normalizeWorkspacePath(String(path || '').trim())
  if (!normalizedPath || normalizedPath === '/') {
    activeEntrySlots.clear()
    return
  }
  for (const [token, slot] of activeEntrySlots) {
    if (slot.activePath === normalizedPath) activeEntrySlots.delete(token)
  }
}
