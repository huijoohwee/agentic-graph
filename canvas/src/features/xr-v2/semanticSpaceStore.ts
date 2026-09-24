import { preflightXrV2IndexedDbArtifactStore, XR_V2_CAPTURE_DATABASE_NAME, XR_V2_CAPTURE_DATABASE_VERSION } from './xrV2CaptureArtifactStore'
import { applySpaceAction, newSpaceDocument, SpaceError, validateSpaceDocument, verifySpaceEvidence,
  type SpaceAction, type SpaceDocument } from './semanticSpaceRuntime'

const ACTIVE_REF = 'semantic-space:active'
const CHANGE_EVENT = 'agentic-graph:semantic-space-change'
type SpaceRecord = { ref: string; document: SpaceDocument }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Space storage request failed'))
  })
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Space storage transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('Space storage transaction aborted'))
  })
}

export function createSemanticSpaceStore(options: Readonly<{ indexedDB?: IDBFactory; databaseName?: string }> = {}) {
  const factory = options.indexedDB || globalThis.indexedDB
  if (!factory) throw new SpaceError('storage-unavailable', 'Local evidence storage is unavailable')
  const databaseName = options.databaseName || XR_V2_CAPTURE_DATABASE_NAME
  let initialized: Promise<void> | null = null
  const open = async (): Promise<IDBDatabase> => {
    initialized ||= preflightXrV2IndexedDbArtifactStore({ indexedDB: factory, databaseName })
      .then(() => undefined, error => { initialized = null; throw error })
    await initialized
    return new Promise((resolve, reject) => {
      const request = factory.open(databaseName, XR_V2_CAPTURE_DATABASE_VERSION)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Space storage open failed'))
      request.onblocked = () => reject(new SpaceError('storage-blocked', 'Close another tab using this space, then retry'))
    })
  }
  const read = async (): Promise<SpaceDocument | null> => {
    const database = await open()
    try {
      const transaction = database.transaction('bundles', 'readonly')
      const done = transactionDone(transaction)
      const record = await requestResult(transaction.objectStore('bundles').get(ACTIVE_REF)) as SpaceRecord | undefined
      await done
      return record ? await verifySpaceEvidence(validateSpaceDocument(record.document)) : null
    } finally { database.close() }
  }
  const save = async (document: SpaceDocument, expectedRevision: number | null): Promise<SpaceDocument> => {
    await verifySpaceEvidence(document)
    const database = await open()
    try {
      const transaction = database.transaction('bundles', 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore('bundles')
      const current = await requestResult(store.get(ACTIVE_REF)) as SpaceRecord | undefined
      if ((current?.document.revision ?? null) !== expectedRevision
        || (current && current.document.id !== document.id)
        || document.revision !== (expectedRevision ?? 0) + 1) {
        transaction.abort()
        await done.catch(() => undefined)
        throw new SpaceError('stale-revision', 'Space changed; reload before editing')
      }
      store.put({ ref: ACTIVE_REF, document } satisfies SpaceRecord)
      await done
    } finally { database.close() }
    const persisted = await read()
    if (!persisted || persisted.id !== document.id || persisted.revision !== document.revision) {
      throw new SpaceError('readback-failed', 'Space write could not be verified')
    }
    return persisted
  }
  const replace = async (document: SpaceDocument): Promise<SpaceDocument> => {
    await verifySpaceEvidence(document)
    const database = await open()
    try {
      const transaction = database.transaction('bundles', 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore('bundles')
      const current = await requestResult(store.get(ACTIVE_REF)) as SpaceRecord | undefined
      if (current) store.put({ ...current, ref: `semantic-space:backup:${current.document.id}` })
      store.put({ ref: ACTIVE_REF, document } satisfies SpaceRecord)
      await done
    } finally { database.close() }
    const persisted = await read()
    if (!persisted || persisted.id !== document.id || persisted.revision !== document.revision) {
      throw new SpaceError('readback-failed', 'Imported space could not be verified')
    }
    return persisted
  }
  return { read, save, replace }
}

let defaultStore: ReturnType<typeof createSemanticSpaceStore> | null = null
const store = () => defaultStore ||= createSemanticSpaceStore()
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT)) }
export const subscribeSemanticSpace = (callback: () => void) => {
  window.addEventListener(CHANGE_EVENT, callback)
  return () => window.removeEventListener(CHANGE_EVENT, callback)
}
export const readSemanticSpace = () => store().read()
export async function runSemanticSpaceAction(action: SpaceAction): Promise<SpaceDocument> {
  const current = await store().read()
  const base = current || newSpaceDocument(`space:${crypto.randomUUID()}`)
  if (action.operation === 'capture') await verifySpaceEvidence({ ...base, observations: [...base.observations, action.observation] })
  const next = applySpaceAction(base, action)
  if (next === base) return base
  const saved = await store().save(next, current?.revision ?? null)
  changed()
  return saved
}
export async function importSemanticSpace(text: string): Promise<SpaceDocument> {
  if (text.length > 32 * 1024 * 1024) throw new SpaceError('package-too-large', 'Space package exceeds 32 MiB')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new SpaceError('invalid-package', 'Space package is not valid JSON') }
  const saved = await store().replace(await verifySpaceEvidence(validateSpaceDocument(parsed)))
  changed()
  return saved
}
