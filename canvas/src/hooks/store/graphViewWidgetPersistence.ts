import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage } from '@/lib/persistence'
import { scheduleWorkspaceSyncTask, cancelWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { WORKSPACE_SYNC_TASK_FLOW_WIDGET_VIEW_STATE } from '@/lib/async/workspaceSyncKeys'
import type { WidgetLayoutEvidence } from './graph-data-slice/graphDataRetainedPlacementContinuity'

export type FlowWidgetDocumentSnapshot = {
  version: 1
  documentKey: string
  layout: WidgetLayoutEvidence
  pinned: Record<string, boolean>
  pos: Record<string, { top: number; left: number }>
  world: Record<string, { x: number; y: number }>
}
type ReadResult = { status: 'ready'; snapshot: FlowWidgetDocumentSnapshot } | { status: 'missing' | 'withheld'; snapshot: null }
type Schedule = (key: string, callback: () => void, delayMs: number) => unknown
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const coordinate = (value: unknown): boolean => value === null || (finite(value) && Number.isInteger(value))
let nextPersistenceOwner = 0

export const flowWidgetDocumentStorageKey = (documentKey: string): string =>
  `${LS_KEYS.flowWidgetStateByDocument}:${encodeURIComponent(documentKey)}`

export function parseFlowWidgetDocumentSnapshot(raw: string, documentKey: string): FlowWidgetDocumentSnapshot {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || value.documentKey !== documentKey || !record(value.layout)) {
    throw new Error('Invalid widget document envelope')
  }
  const layout = value.layout
  if (typeof layout.kind !== 'string' || !Array.isArray(layout.nodes) || !Array.isArray(layout.edges)
    || !layout.nodes.every((node, i, nodes) => Array.isArray(node) && node.length === 4
      && typeof node[0] === 'string' && !!node[0].trim() && node[0] === node[0].trim()
      && typeof node[1] === 'string' && coordinate(node[2]) && coordinate(node[3])
      && (i === 0 || nodes[i - 1][0] < node[0]))
    || !layout.edges.every((edge, i, edges) => typeof edge === 'string' && (i === 0 || edges[i - 1] <= edge))) {
    throw new Error('Invalid widget layout evidence')
  }
  if (!record(value.pinned) || !Object.entries(value.pinned).every(([id, pinned]) => !!id.trim() && typeof pinned === 'boolean')
    || !record(value.pos) || !Object.entries(value.pos).every(([id, pos]) => !!id.trim() && record(pos) && finite(pos.top) && finite(pos.left))
    || !record(value.world) || !Object.entries(value.world).every(([id, pos]) => !!id.trim() && record(pos) && finite(pos.x) && finite(pos.y))) {
    throw new Error('Invalid widget placement')
  }
  return value as FlowWidgetDocumentSnapshot
}

export function createFlowWidgetPersistence(options: {
  report: (documentKey: string, message: string) => void
  storage?: () => Storage | null
  schedule?: Schedule
  cancel?: (key: string) => void
}) {
  const getStorage = options.storage || getLocalStorage
  const schedule = options.schedule || scheduleWorkspaceSyncTask
  const cancel = options.cancel || cancelWorkspaceSyncTask
  const taskKey = `${WORKSPACE_SYNC_TASK_FLOW_WIDGET_VIEW_STATE}:${++nextPersistenceOwner}`
  const pending = new Map<Storage, Map<string, string>>()
  let reported = new WeakMap<Storage, Set<string>>()
  const warn = (storage: Storage, documentKey: string, message: string) => {
    const messages = reported.get(storage) || new Set<string>()
    const token = `${documentKey}\n${message}`
    if (messages.has(token)) return
    messages.add(token)
    reported.set(storage, messages)
    options.report(documentKey, message)
  }
  const readOccupied = (storage: Storage, documentKey: string): string | null => {
    const raw = storage.getItem(flowWidgetDocumentStorageKey(documentKey))
    // An occupied but unreadable or invalid shard is recovery data, never an empty cache.
    if (raw !== null) parseFlowWidgetDocumentSnapshot(raw, documentKey)
    return raw
  }
  const readResult = (documentKey: string): ReadResult => {
    const storage = getStorage()
    if (!storage || !documentKey) return { status: 'withheld', snapshot: null }
    const queued = pending.get(storage)?.get(documentKey)
    try {
      const raw = queued ?? storage.getItem(flowWidgetDocumentStorageKey(documentKey))
      if (raw !== null) return { status: 'ready', snapshot: parseFlowWidgetDocumentSnapshot(raw, documentKey) }
      const legacyKeys = [LS_KEYS.flowWidgetPinnedByGraphMetaKey, LS_KEYS.flowWidgetPosByGraphMetaKey, LS_KEYS.flowWidgetWorldPosByGraphMetaKey]
      const legacyPresent = legacyKeys.some(base => {
        if (storage.getItem(`${base}:${encodeURIComponent(documentKey)}`) !== null) return true
        const legacy = storage.getItem(base)
        return legacy !== null && Object.prototype.hasOwnProperty.call(JSON.parse(legacy), documentKey)
      })
      if (legacyPresent) warn(storage, documentKey, 'Saved widget placement has no verifiable layout baseline and was not applied. The original saved data is retained.')
      return { status: 'missing', snapshot: null }
    } catch {
      warn(storage, documentKey, 'Saved widget placement could not be verified and was not applied. The original saved data is retained.')
      return { status: 'withheld', snapshot: null }
    }
  }
  const flush = () => {
    for (const [storage, documents] of [...pending]) {
      for (const [documentKey, bytes] of [...documents]) {
        try {
          if (readOccupied(storage, documentKey) !== bytes) {
            storage.setItem(flowWidgetDocumentStorageKey(documentKey), bytes)
          }
          if (documents.get(documentKey) === bytes) documents.delete(documentKey)
        } catch {
          warn(storage, documentKey, 'Widget placement could not be saved. It remains available in this session; the previous saved placement is unchanged.')
        }
      }
      if (documents.size === 0) pending.delete(storage)
    }
  }
  return {
    storage: getStorage,
    readResult,
    read: (documentKey: string): FlowWidgetDocumentSnapshot | null => readResult(documentKey).snapshot,
    enqueue(snapshot: FlowWidgetDocumentSnapshot): boolean {
      const storage = getStorage()
      if (!storage) {
        options.report(snapshot.documentKey, 'Widget placement could not be saved because local storage is unavailable. It remains available in this session.')
        return false
      }
      try {
        const bytes = JSON.stringify(snapshot)
        parseFlowWidgetDocumentSnapshot(bytes, snapshot.documentKey)
        readOccupied(storage, snapshot.documentKey)
        const documents = pending.get(storage) || new Map<string, string>()
        documents.set(snapshot.documentKey, bytes)
        pending.set(storage, documents)
        // No sampled signature: coordinate-only edits and failed identical writes must run.
        schedule(taskKey, flush, 90)
        return true
      } catch {
        warn(storage, snapshot.documentKey, 'Widget placement could not be saved. The original saved data is retained.')
        return false
      }
    },
    reset() {
      cancel(taskKey)
      pending.clear()
      reported = new WeakMap()
    },
  }
}
