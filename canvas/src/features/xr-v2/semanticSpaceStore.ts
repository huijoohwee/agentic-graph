import { preflightXrV2IndexedDbArtifactStore, XR_V2_CAPTURE_DATABASE_NAME, XR_V2_CAPTURE_DATABASE_VERSION } from './xrV2CaptureArtifactStore'
import { applySpaceAction, newSpaceDocument, SpaceError, validateSpaceDocument, verifySpaceEvidence,
  type SpaceAction, type SpaceDocument } from './semanticSpaceRuntime'

const ACTIVE_REF = 'semantic-space:active'
const CHANGE_EVENT = 'agentic-graph:semantic-space-change'
const PACKAGE_SCHEMA = 'agentic-graph/semantic-space-package/v2'
const SOURCE_SCHEMA = 'agentic-graph/semantic-space-source/v1'
type SpaceRecord = { ref: string; document: SpaceDocument }
type SourceMirrorStatus = { revision: number; path: string | null; error: string | null }
let sourceMirrorStatus: SourceMirrorStatus | null = null
let sourceMirrorQueue: Promise<void> = Promise.resolve()
export const readSemanticSpaceSourceMirrorStatus = () => sourceMirrorStatus

async function contentDigest(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function exportSemanticSpacePackage(document: SpaceDocument): Promise<string> {
  await verifySpaceEvidence(validateSpaceDocument(document))
  const json = JSON.stringify(document)
  return JSON.stringify({ schema: PACKAGE_SCHEMA, sha256: await contentDigest(json), document })
}

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
async function mirrorCurrentSpaceToSourceFiles(): Promise<void> {
  if (typeof window === 'undefined') return
  const task = sourceMirrorQueue.catch(() => undefined).then(async () => {
    const current = await store().read()
    if (!current) return
    try {
      const [{ getWorkspaceFs }, { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH },
        { ensureWorkspaceFolderTreeIfMissing }, { notifyWorkspaceFsChanged }] = await Promise.all([
        import('@/features/workspace-fs/workspaceFs'),
        import('@/features/workspace-fs/workspaceSourceRoots'),
        import('@/features/workspace-fs/ensureFolderTreeIfMissing'),
        import('@/features/workspace-fs/workspaceFsEvents'),
      ])
      const fs = await getWorkspaceFs()
      await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH })
      const name = `semantic-space-${(await contentDigest(current.id)).slice(0, 16)}.json`
      const path = `${WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH}/${name}`
      const existing = await fs.readFileText(path)
      if (existing !== null) {
        let parsed: { schema?: string; spaceId?: string }
        try { parsed = JSON.parse(existing) } catch { throw Error('Source Files path belongs to another document') }
        if (parsed.schema !== SOURCE_SCHEMA || parsed.spaceId !== current.id) {
          throw Error('Source Files path belongs to another document')
        }
      }
      const text = JSON.stringify({ schema: SOURCE_SCHEMA, sourceOfTruth: 'browser-local-semantic-space',
        spaceId: current.id, revision: current.revision,
        observations: current.observations.map(({ imageDataUrl: _pixels, ...metadata }) => metadata),
        entities: current.entities, selectedEntityId: current.selectedEntityId,
        twin: current.twin || null }, null, 2) + '\n'
      if (text.length > 2_000_000) throw Error('Source Files projection exceeds its size budget')
      if (existing === null) await fs.createFile({ parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH, name, text })
      else if (existing !== text) await fs.writeFileText(path, text)
      notifyWorkspaceFsChanged({ op: existing === null ? 'createFile' : 'writeFileText', path })
      sourceMirrorStatus = { revision: current.revision, path, error: null }
    } catch (error) {
      sourceMirrorStatus = { revision: current.revision, path: null,
        error: String((error as Error).message || error) }
    }
  })
  sourceMirrorQueue = task
  await task
}
export async function runSemanticSpaceAction(action: SpaceAction): Promise<SpaceDocument> {
  const current = await store().read()
  const base = current || newSpaceDocument(`space:${crypto.randomUUID()}`)
  const next = applySpaceAction(base, action)
  if (next === base) return base
  if (action.operation === 'capture' || action.operation === 'confirm-image-regions') await verifySpaceEvidence(next, true)
  if (action.operation === 'confirm-image-regions' || action.operation === 'build' || action.operation === 'control-twin'
    || action.operation === 'resize-twin' || action.operation === 'edit-twin') {
    const bindings = next.twin?.objects || []
    if (!bindings.length) throw new SpaceError('invalid-input', 'Twin binding is missing')
    const { buildTwinScene, disposeTwinScene } = await import('./semanticTwinScene')
    const built = buildTwinScene(bindings)
    try { if (built.error) throw new SpaceError('invalid-geometry', built.error) }
    finally { disposeTwinScene(built) }
  }
  const saved = await store().save(next, current?.revision ?? null)
  await mirrorCurrentSpaceToSourceFiles()
  changed()
  return saved
}
export async function importSemanticSpace(text: string,
  target?: ReturnType<typeof createSemanticSpaceStore>): Promise<SpaceDocument> {
  if (text.length > 32 * 1024 * 1024) throw new SpaceError('package-too-large', 'Space package exceeds 32 MiB')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new SpaceError('invalid-package', 'Space package is not valid JSON') }
  let document: unknown = parsed
  if (parsed && typeof parsed === 'object' && 'schema' in parsed && parsed.schema === PACKAGE_SCHEMA) {
    const wrapped = parsed as Record<string, unknown>
    if (Object.keys(wrapped).some(key => !['schema', 'sha256', 'document'].includes(key))
      || typeof wrapped.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(wrapped.sha256)
      || !wrapped.document || typeof wrapped.document !== 'object'
      || await contentDigest(JSON.stringify(wrapped.document)) !== wrapped.sha256) {
      throw new SpaceError('invalid-package', 'Space package integrity check failed')
    }
    document = wrapped.document
  } else if (parsed && typeof parsed === 'object' && 'twin' in parsed) {
    throw new SpaceError('invalid-package', 'Twin packages require an integrity manifest')
  }
  const saved = await (target || store()).replace(await verifySpaceEvidence(validateSpaceDocument(document), true))
  if (!target) await mirrorCurrentSpaceToSourceFiles()
  changed()
  return saved
}
