import { getLocalStorage, resolveBrowserStorageKey } from '@/lib/persistence'
import { createPersistedCollectionDb, type PersistedCollectionDb, type PersistedCollectionRow } from '@/lib/storage/persistedCollectionStore'
import type { IndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import { normalizeWorkspacePath } from './path'
import type { WorkspaceEntry } from './types'

export const WORKSPACE_FS_LEGACY_KEY = 'kg:workspace-fs'
export const WORKSPACE_FS_INDEXED_DB = 'kg:workspace-fs:indexeddb:v1'
const MIGRATION_ID = 'local-storage-v1'
type WorkspaceRecords = { entries: WorkspaceEntry }
type IndexedRecords = WorkspaceRecords & { migrations: { id: string; importedCount: number } }
type IndexedStore = IndexedDbCollectionDb<IndexedRecords>

const entryKey = (entry: WorkspaceEntry): string => String(entry.path || '').trim()
const assertDurable = (db: IndexedStore): void => {
  const state = db.persistence.getState()
  if (state.mode !== 'indexeddb' || state.status !== 'active') {
    throw new Error(`Workspace IndexedDB is unavailable. Legacy data was retained. ${state.error || ''}`)
  }
}

const readLegacyEntries = (storage: Storage | null): WorkspaceEntry[] => {
  if (!storage) throw new Error('Cannot inspect legacy workspace storage; migration was not committed.')
  const text = storage.getItem(WORKSPACE_FS_LEGACY_KEY)
  if (text === null) return []
  const snapshot = JSON.parse(text)
  if (!snapshot || typeof snapshot.entries !== 'object' || !snapshot.entries || Array.isArray(snapshot.entries)) {
    throw new Error('Invalid legacy workspace snapshot; original bytes were retained.')
  }
  const entries = Object.values(snapshot.entries) as WorkspaceEntry[]
  const paths = new Set<string>()
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || !entry.path || normalizeWorkspacePath(entry.path) !== entry.path
      || paths.has(entry.path) || !['file', 'folder'].includes(entry.kind) || typeof entry.name !== 'string'
      || !(entry.parentPath === null || typeof entry.parentPath === 'string')
      || !Number.isFinite(entry.updatedAtMs) || entry.updatedAtMs < 0
      || !(entry.text === undefined || typeof entry.text === 'string')) {
      throw new Error('Invalid legacy workspace entry; original bytes were retained.')
    }
    paths.add(entry.path)
  }
  return entries
}

const migrateLegacyEntries = async (db: IndexedStore, storage: Storage | null): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const marker = await db.collections.migrations.findOne(MIGRATION_ID).exec()
    assertDurable(db)
    if (marker) return
    const legacy = readLegacyEntries(storage)
    const observed = (await db.collections.entries.find().exec()).map(row => row.toJSON())
    const occupied = new Set(observed.map(entryKey))
    const imported = legacy.filter(entry => !occupied.has(entry.path))
    const committed = await db.compareAndWrite([
      ...imported.map(record => ({ kind: 'upsert' as const, collectionName: 'entries' as const, record })),
      { kind: 'upsert', collectionName: 'migrations', record: { id: MIGRATION_ID, importedCount: imported.length } },
    ], [
      { collectionName: 'migrations', selector: { id: MIGRATION_ID }, records: [] },
      { collectionName: 'entries', selector: {}, records: observed },
    ])
    if (committed) return
  }
  throw new Error('Workspace changed during migration. Reload to retry; legacy data was retained.')
}

// Keep the WorkspaceFs contract while requiring durable writes and rejecting stale rows.
const workspaceCollections = (db: IndexedStore): PersistedCollectionDb<WorkspaceRecords>['collections'] => {
  const entries = db.collections.entries
  const commit = async (previous: WorkspaceEntry | null, next: WorkspaceEntry | null): Promise<void> => {
    const path = (previous || next)!.path
    if (next && next.path !== path) throw new Error('Workspace entry identity cannot change during a patch.')
    const committed = await db.compareAndWrite([
      next ? { kind: 'upsert', collectionName: 'entries', record: next }
        : { kind: 'remove', collectionName: 'entries', id: path },
    ], [{ collectionName: 'entries', selector: { path }, records: previous ? [previous] : [] }])
    if (!committed) throw new Error('Workspace changed in another tab. Reload before saving; stored data was retained.')
  }
  const wrapRow = (row: PersistedCollectionRow<WorkspaceEntry>): PersistedCollectionRow<WorkspaceEntry> => {
    let current = row.toJSON()
    return {
      get: key => current[key],
      toJSON: () => ({ ...current }),
      async incrementalPatch(patch) {
        const next = { ...current, ...patch }
        await commit(current, next)
        current = next
      },
      remove: () => commit(current, null),
    }
  }
  return { entries: {
    $: entries.$,
    find(query) {
      const pending = entries.find(query)
      return {
        sort(spec) { pending.sort(spec); return this },
        limit(count) { pending.limit(count); return this },
        async exec() { const rows = await pending.exec(); assertDurable(db); return rows.map(wrapRow) },
      }
    },
    findOne(path) {
      return { async exec() {
        const row = await entries.findOne(path).exec()
        assertDurable(db)
        return row ? wrapRow(row) : null
      } }
    },
    async incrementalUpsert(record) {
      const row = await entries.findOne(record.path).exec()
      assertDurable(db)
      await commit(row?.toJSON() ?? null, record)
    },
  } }
}

export async function createWorkspaceFsDb(options: {
  databaseName?: string
  legacyStorage?: Storage | null
  legacyRecordFilter?: (entry: WorkspaceEntry) => boolean
} = {}): Promise<PersistedCollectionDb<WorkspaceRecords>> {
  // Node and the existing non-browser test harness retain their lightweight adapter.
  const testWithoutIndexedDb = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
    && typeof indexedDB === 'undefined'
  if (typeof window === 'undefined' || testWithoutIndexedDb) return createPersistedCollectionDb<WorkspaceRecords>({
    storageKey: WORKSPACE_FS_LEGACY_KEY, collectionNames: ['entries'],
    recordKeyByCollection: { entries: entryKey },
    shouldPersistRecordByCollection: { entries: options.legacyRecordFilter },
  })
  const { createIndexedDbCollectionDb } = await import('@/lib/storage/indexedDbCollectionStore')
  const db = await createIndexedDbCollectionDb<IndexedRecords>({
    databaseName: options.databaseName ?? resolveBrowserStorageKey(WORKSPACE_FS_INDEXED_DB),
    collectionNames: ['entries', 'migrations'], recordKeyByCollection: { entries: entryKey },
  })
  try {
    assertDurable(db)
    await migrateLegacyEntries(db, options.legacyStorage === undefined ? getLocalStorage() : options.legacyStorage)
    return { ...db, collections: workspaceCollections(db), atomicWrite: mutations => db.atomicWriteWithRevisions(mutations, []) }
  } catch (error) {
    await db.db.close()
    throw error
  }
}
