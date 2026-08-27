import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { hashRecordSignature32 } from '@/lib/hash/signature'
import {
  createPersistedCollectionDb,
  type PersistedCollectionDb,
  type PersistedCollectionMap,
} from '@/lib/storage/persistedCollectionStore'

export type GraphRecordTableId = 'nodes' | 'edges'

export type GraphRecordColumnKind = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'geodata'

export type GraphRecordTableDoc = {
  id: GraphRecordTableId
  name: string
  order: number
  createdAtMs: number
  updatedAtMs: number
}

export type GraphRecordColumnDoc = {
  pk: string
  tableId: GraphRecordTableId
  columnId: string
  name: string
  kind: GraphRecordColumnKind
  order: number
  hidden: boolean
  createdAtMs: number
  updatedAtMs: number
}

export type GraphRecordRowDoc = {
  pk: string
  tableId: GraphRecordTableId
  rowId: string
  order: number
  data: Record<string, JSONValue>
  createdAtMs: number
  updatedAtMs: number
}

export type GraphRecordViewDoc = {
  id: string
  tableId: GraphRecordTableId
  name: string
  sort: unknown
  filters: unknown
  createdAtMs: number
  updatedAtMs: number
}

export type GraphRecordMetaDoc = {
  key: string
  value: unknown
  updatedAtMs: number
}

type GraphRecordMap = {
  tables: GraphRecordTableDoc
  columns: GraphRecordColumnDoc
  rows: GraphRecordRowDoc
  views: GraphRecordViewDoc
  meta: GraphRecordMetaDoc
}

export type GraphRecordCollections = {
  tables: PersistedCollectionMap<GraphRecordMap>['tables']
  columns: PersistedCollectionMap<GraphRecordMap>['columns']
  rows: PersistedCollectionMap<GraphRecordMap>['rows']
  views: PersistedCollectionMap<GraphRecordMap>['views']
  meta: PersistedCollectionMap<GraphRecordMap>['meta']
}

export type GraphRecordDb = PersistedCollectionDb<GraphRecordMap>

export const GRAPH_RECORD_DB_NAME = 'kg:graph-table'

const GRAPH_RECORD_COLUMN_ORDER_STEP = 1024
const normalizeNonNegativeInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Math.max(0, Math.floor(fallback))
}

let graphRecordDbWriteQueue: Promise<void> = Promise.resolve()
let graphRecordNumericRepairDone = false

const withGraphRecordDbWrite = async <T>(fn: () => Promise<T>): Promise<T> => {
  const prev = graphRecordDbWriteQueue
  let release: (() => void) | null = null
  graphRecordDbWriteQueue = new Promise<void>(resolve => {
    release = resolve
  })
  await prev.catch(() => void 0)
  try {
    return await fn()
  } finally {
    try {
      release?.()
    } catch {
      void 0
    }
  }
}

let graphRecordDbSingleton: Promise<GraphRecordDb> | null = null
let graphRecordWarmupInFlight: Promise<void> | null = null

const isGraphRecordDbTestMode = (): boolean => {
  try {
    const env = typeof process !== 'undefined' ? process.env : undefined
    if (!env) return false
    if (env.NODE_ENV === 'test') return true
    if (env.AG_TEST_QUIET === '1') return true
    return false
  } catch {
    return false
  }
}

export const getGraphRecordDb = async (): Promise<GraphRecordDb> => {
  if (graphRecordDbSingleton) return graphRecordDbSingleton
  graphRecordDbSingleton = (async () => {
    const testMode = isGraphRecordDbTestMode() || typeof window === 'undefined'
    return createPersistedCollectionDb<GraphRecordMap>({
      storageKey: GRAPH_RECORD_DB_NAME,
      persistent: !testMode,
      collectionNames: ['tables', 'columns', 'rows', 'views', 'meta'],
      recordKeyByCollection: {
        columns: row => String(row.pk || '').trim(),
        meta: row => String(row.key || '').trim(),
        rows: row => String(row.pk || '').trim(),
      },
    })
  })()
  return graphRecordDbSingleton.catch(err => {
    graphRecordDbSingleton = null
    throw err
  })
}

export const __resetGraphRecordDbForTests = async (): Promise<void> => {
  const current = graphRecordDbSingleton
  graphRecordDbSingleton = null
  graphRecordWarmupInFlight = null
  graphRecordDbWriteQueue = Promise.resolve()
  graphRecordNumericRepairDone = false
  let dbState: GraphRecordDb | null = null
  if (current) {
    try {
      dbState = await current
    } catch {
      dbState = null
    }
  }
  if (dbState) {
    try {
      await dbState.db.remove()
    } catch {
      try {
        await dbState.db.close()
      } catch {
        void 0
      }
    }
  }
}

export const warmGraphRecordDb = async (): Promise<void> => {
  if (graphRecordWarmupInFlight) return graphRecordWarmupInFlight
  graphRecordWarmupInFlight = (async () => {
    await getGraphRecordDb()
    await ensureGraphRecordSeed()
  })().finally(() => {
    graphRecordWarmupInFlight = null
  })
  return graphRecordWarmupInFlight
}

const pkOfColumn = (tableId: GraphRecordTableId, columnId: string): string => `${tableId}:${columnId}`
const pkOfRow = (tableId: GraphRecordTableId, rowId: string): string => `${tableId}:${rowId}`

const ensureGraphRecordSeedUnlocked = async (): Promise<void> => {
  const { collections } = await getGraphRecordDb()
  if (!graphRecordNumericRepairDone) {
    const now = Date.now()
    const tableRows = await collections.tables.find().exec()
    for (let i = 0; i < tableRows.length; i += 1) {
      const doc = tableRows[i]!
      const nextOrder = normalizeNonNegativeInt(doc.get('order'), 0)
      const nextCreatedAtMs = normalizeNonNegativeInt(doc.get('createdAtMs'), now)
      const nextUpdatedAtMs = normalizeNonNegativeInt(doc.get('updatedAtMs'), nextCreatedAtMs)
      const patch: Partial<GraphRecordTableDoc> = {}
      if (Number(doc.get('order')) !== nextOrder) patch.order = nextOrder
      if (Number(doc.get('createdAtMs')) !== nextCreatedAtMs) patch.createdAtMs = nextCreatedAtMs
      if (Number(doc.get('updatedAtMs')) !== nextUpdatedAtMs) patch.updatedAtMs = nextUpdatedAtMs
      if (Object.keys(patch).length > 0) await doc.incrementalPatch(patch)
    }
    const columnRows = await collections.columns.find().exec()
    for (let i = 0; i < columnRows.length; i += 1) {
      const doc = columnRows[i]!
      const nextOrder = normalizeNonNegativeInt(doc.get('order'), 0)
      const nextCreatedAtMs = normalizeNonNegativeInt(doc.get('createdAtMs'), now)
      const nextUpdatedAtMs = normalizeNonNegativeInt(doc.get('updatedAtMs'), nextCreatedAtMs)
      const patch: Partial<GraphRecordColumnDoc> = {}
      if (Number(doc.get('order')) !== nextOrder) patch.order = nextOrder
      if (Number(doc.get('createdAtMs')) !== nextCreatedAtMs) patch.createdAtMs = nextCreatedAtMs
      if (Number(doc.get('updatedAtMs')) !== nextUpdatedAtMs) patch.updatedAtMs = nextUpdatedAtMs
      if (Object.keys(patch).length > 0) await doc.incrementalPatch(patch)
    }
    const graphRows = await collections.rows.find().exec()
    for (let i = 0; i < graphRows.length; i += 1) {
      const doc = graphRows[i]!
      const nextOrder = normalizeNonNegativeInt(doc.get('order'), 0)
      const nextCreatedAtMs = normalizeNonNegativeInt(doc.get('createdAtMs'), now)
      const nextUpdatedAtMs = normalizeNonNegativeInt(doc.get('updatedAtMs'), nextCreatedAtMs)
      const patch: Partial<GraphRecordRowDoc> = {}
      if (Number(doc.get('order')) !== nextOrder) patch.order = nextOrder
      if (Number(doc.get('createdAtMs')) !== nextCreatedAtMs) patch.createdAtMs = nextCreatedAtMs
      if (Number(doc.get('updatedAtMs')) !== nextUpdatedAtMs) patch.updatedAtMs = nextUpdatedAtMs
      if (Object.keys(patch).length > 0) await doc.incrementalPatch(patch)
    }
    const viewRows = await collections.views.find().exec()
    for (let i = 0; i < viewRows.length; i += 1) {
      const doc = viewRows[i]!
      const nextCreatedAtMs = normalizeNonNegativeInt(doc.get('createdAtMs'), now)
      const nextUpdatedAtMs = normalizeNonNegativeInt(doc.get('updatedAtMs'), nextCreatedAtMs)
      const patch: Partial<GraphRecordViewDoc> = {}
      if (Number(doc.get('createdAtMs')) !== nextCreatedAtMs) patch.createdAtMs = nextCreatedAtMs
      if (Number(doc.get('updatedAtMs')) !== nextUpdatedAtMs) patch.updatedAtMs = nextUpdatedAtMs
      if (Object.keys(patch).length > 0) await doc.incrementalPatch(patch)
    }
    const metaRows = await collections.meta.find().exec()
    for (let i = 0; i < metaRows.length; i += 1) {
      const doc = metaRows[i]!
      const nextUpdatedAtMs = normalizeNonNegativeInt(doc.get('updatedAtMs'), now)
      if (Number(doc.get('updatedAtMs')) !== nextUpdatedAtMs) {
        await doc.incrementalPatch({ updatedAtMs: nextUpdatedAtMs })
      }
    }
    graphRecordNumericRepairDone = true
  }
  const now = Date.now()
  const seeds: GraphRecordTableDoc[] = [
    { id: 'nodes', name: 'Nodes', order: 1, createdAtMs: now, updatedAtMs: now },
    { id: 'edges', name: 'Edges', order: 2, createdAtMs: now, updatedAtMs: now },
  ]
  for (const t of seeds) {
    const exists = await collections.tables.findOne(t.id).exec()
    if (exists) continue
    await collections.tables.incrementalUpsert(t)
  }

  const baseColumns: Array<{ tableId: GraphRecordTableId; columnId: string; name: string; kind: GraphRecordColumnKind; order: number; hidden?: boolean }> = [
    { tableId: 'nodes', columnId: 'id', name: 'id', kind: 'text', order: 1 },
    { tableId: 'nodes', columnId: 'label', name: 'label', kind: 'text', order: 2 },
    { tableId: 'nodes', columnId: 'type', name: 'type', kind: 'text', order: 3 },
    { tableId: 'edges', columnId: 'id', name: 'id', kind: 'text', order: 1 },
    { tableId: 'edges', columnId: 'label', name: 'label', kind: 'text', order: 2 },
    { tableId: 'edges', columnId: 'source', name: 'source', kind: 'text', order: 3 },
    { tableId: 'edges', columnId: 'target', name: 'target', kind: 'text', order: 4 },
  ]

  for (const c of baseColumns) {
    const pk = pkOfColumn(c.tableId, c.columnId)
    const exists = await collections.columns.findOne(pk).exec()
    if (exists) continue
    await collections.columns.incrementalUpsert({
      pk,
      tableId: c.tableId,
      columnId: c.columnId,
      name: c.name,
      kind: c.kind,
      order: c.order,
      hidden: !!c.hidden,
      createdAtMs: now,
      updatedAtMs: now,
    })
  }
}

export const ensureGraphRecordSeed = async (): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    await ensureGraphRecordSeedUnlocked()
  })
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const toJsonValueForDb = (v: unknown): JSONValue => {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (v instanceof Date) {
    const t = v.getTime()
    if (Number.isFinite(t)) return new Date(t).toISOString()
  }
  if (Array.isArray(v)) return v.map(item => toJsonValueForDb(item)) as JSONValue
  if (isPlainObject(v)) {
    const out: Record<string, JSONValue> = {}
    for (const k of Object.keys(v).sort((a, b) => a.localeCompare(b))) {
      out[k] = toJsonValueForDb(v[k])
    }
    return out as JSONValue
  }
  return String(v)
}

const isJsonValueEqual = (a: JSONValue, b: JSONValue): boolean => {
  if (Object.is(a, b)) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a === b
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!isJsonValueEqual(a[i] as JSONValue, b[i] as JSONValue)) return false
    }
    return true
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  const bSet = new Set(bk)
  for (const k of ak) {
    if (!bSet.has(k)) return false
    if (!isJsonValueEqual(a[k] as JSONValue, b[k] as JSONValue)) return false
  }
  return true
}

const isJsonRecordEqual = (a: Record<string, JSONValue>, b: Record<string, JSONValue>): boolean => {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  const bSet = new Set(bk)
  for (const k of ak) {
    if (!bSet.has(k)) return false
    if (!isJsonValueEqual(a[k], b[k])) return false
  }
  return true
}

const isIsoDateLike = (raw: string): boolean => {
  const s = raw.trim()
  if (!s) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = Date.parse(s)
    return Number.isFinite(ms)
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) {
    const ms = Date.parse(s)
    return Number.isFinite(ms)
  }
  return false
}

const inferKind = (v: JSONValue): GraphRecordColumnKind => {
  if (typeof v === 'string') {
    return isIsoDateLike(v) ? 'date' : 'text'
  }
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v === null) return 'text'
  return 'json'
}

const normalizeColumnId = (key: string): string => {
  const k = String(key || '').trim()
  if (!k) return ''
  if (k === 'id' || k === 'label' || k === 'type' || k === 'source' || k === 'target') return `prop:${k}`
  return k
}

const toRowDataForNode = (n: GraphNode): Record<string, JSONValue> => {
  const data: Record<string, JSONValue> = {
    id: toJsonValueForDb(n.id),
    label: toJsonValueForDb(n.label),
    type: toJsonValueForDb(n.type),
  }
  const props = n.properties || {}
  const sortedKeys = Object.keys(props).sort((a, b) => a.localeCompare(b))
  for (const k of sortedKeys) {
    const key = normalizeColumnId(k)
    if (!key) continue
    data[key] = toJsonValueForDb((props as Record<string, unknown>)[k])
  }
  return data
}

const toRowDataForEdge = (e: GraphEdge): Record<string, JSONValue> => {
  const data: Record<string, JSONValue> = {
    id: toJsonValueForDb(e.id),
    label: toJsonValueForDb(e.label),
    source: toJsonValueForDb(e.source),
    target: toJsonValueForDb(e.target),
  }
  const props = e.properties || {}
  const sortedKeys = Object.keys(props).sort((a, b) => a.localeCompare(b))
  for (const k of sortedKeys) {
    const key = normalizeColumnId(k)
    if (!key) continue
    data[key] = toJsonValueForDb((props as Record<string, unknown>)[k])
  }
  return data
}

const ensureColumnsForRowData = async (tableId: GraphRecordTableId, rows: Array<Record<string, JSONValue>>): Promise<void> => {
  const { collections } = await getGraphRecordDb()
  const now = Date.now()
  const known = await collections.columns.find({ selector: { tableId } }).exec()
  const existing = new Map<string, GraphRecordColumnDoc>()
  for (const d of known) {
    const json = d.toJSON() as GraphRecordColumnDoc
    existing.set(json.columnId, json)
  }

  const stats = new Map<
    string,
    { date: number; text: number; number: number; boolean: number; json: number }
  >()
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id' || k === 'label' || k === 'type' || k === 'source' || k === 'target') continue
      if (v == null) continue
      if (typeof v === 'string' && !v.trim()) continue
      const kind = inferKind(v)
      const prev = stats.get(k) || { date: 0, text: 0, number: 0, boolean: 0, json: 0 }
      prev[kind] += 1
      stats.set(k, prev)
    }
  }

  const observed = new Map<string, GraphRecordColumnKind>()
  for (const [columnId, s] of stats.entries()) {
    const { date, text, number, boolean, json } = s
    if (json > 0) {
      observed.set(columnId, 'json')
      continue
    }
    if (date > 0 && text === 0 && number === 0 && boolean === 0) {
      observed.set(columnId, 'date')
      continue
    }
    if (number > 0 && text === 0 && date === 0 && boolean === 0) {
      observed.set(columnId, 'number')
      continue
    }
    if (boolean > 0 && text === 0 && date === 0 && number === 0) {
      observed.set(columnId, 'boolean')
      continue
    }
    observed.set(columnId, 'text')
  }

  for (const [columnId, nextKind] of observed.entries()) {
    const prev = existing.get(columnId)
    if (!prev) continue
    if (prev.kind !== 'text' || nextKind !== 'date') continue
    const doc = await collections.columns.findOne(pkOfColumn(tableId, columnId)).exec()
    if (!doc) continue
    await doc.incrementalPatch({ kind: 'date', updatedAtMs: now })
    existing.set(columnId, { ...prev, kind: 'date', updatedAtMs: now })
  }

  const maxOrder = Math.max(0, ...Array.from(existing.values()).map(c => c.order))
  let order = Math.ceil(maxOrder / GRAPH_RECORD_COLUMN_ORDER_STEP) * GRAPH_RECORD_COLUMN_ORDER_STEP
  const planned: GraphRecordColumnDoc[] = []
  for (const [columnId, kind] of observed.entries()) {
    if (existing.has(columnId)) continue
    order += GRAPH_RECORD_COLUMN_ORDER_STEP
    planned.push({
      pk: pkOfColumn(tableId, columnId),
      tableId,
      columnId,
      name: columnId,
      kind,
      order,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    })
  }
  if (planned.length === 0) return
  planned.sort((a, b) => a.order - b.order)
  for (const col of planned) {
    await collections.columns.incrementalUpsert(col)
  }
}

export const syncGraphDataToGraphRecordDb = async (graph: GraphData | null): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    await ensureGraphRecordSeedUnlocked()
    if (!graph) return
    const { collections } = await getGraphRecordDb()
    const now = Date.now()

    const nodeRows = graph.nodes.map(toRowDataForNode)
    const edgeRows = graph.edges.map(toRowDataForEdge)

    await ensureColumnsForRowData('nodes', nodeRows)
    await ensureColumnsForRowData('edges', edgeRows)

    const existingNodes = await collections.rows.find({ selector: { tableId: 'nodes' } }).exec()
    const existingEdges = await collections.rows.find({ selector: { tableId: 'edges' } }).exec()
    const existingNodeIds = new Set(existingNodes.map(d => d.get('rowId')))
    const existingEdgeIds = new Set(existingEdges.map(d => d.get('rowId')))
    const existingNodeDocsById = new Map(existingNodes.map(d => [String(d.get('rowId')), d] as const))
    const existingEdgeDocsById = new Map(existingEdges.map(d => [String(d.get('rowId')), d] as const))
    const existingNodeOrderById = new Map(existingNodes.map(d => [String(d.get('rowId')), Number(d.get('order')) || 0] as const))
    const existingEdgeOrderById = new Map(existingEdges.map(d => [String(d.get('rowId')), Number(d.get('order')) || 0] as const))

    for (let i = 0; i < graph.nodes.length; i += 1) {
      const n = graph.nodes[i]
      const rowId = String(n.id)
      existingNodeIds.delete(rowId)
      const pk = pkOfRow('nodes', rowId)
      const doc = existingNodeDocsById.get(rowId) || null
      const nextData = nodeRows[i]
      if (!doc) {
        const nextOrder = existingNodes.length + i + 1
        await collections.rows.incrementalUpsert({
          pk,
          tableId: 'nodes',
          rowId,
          order: nextOrder,
          data: nextData,
          createdAtMs: now,
          updatedAtMs: now,
        })
        continue
      }
      const prevData = doc.get('data') as unknown
      const prevDataRec = isPlainObject(prevData) ? (prevData as Record<string, JSONValue>) : {}
      if (isJsonRecordEqual(prevDataRec, nextData)) continue
      await doc.incrementalPatch({ data: nextData, updatedAtMs: now })
    }

    for (let i = 0; i < graph.edges.length; i += 1) {
      const e = graph.edges[i]
      const rowId = String(e.id)
      existingEdgeIds.delete(rowId)
      const pk = pkOfRow('edges', rowId)
      const doc = existingEdgeDocsById.get(rowId) || null
      const nextData = edgeRows[i]
      if (!doc) {
        const nextOrder = existingEdges.length + i + 1
        await collections.rows.incrementalUpsert({
          pk,
          tableId: 'edges',
          rowId,
          order: nextOrder,
          data: nextData,
          createdAtMs: now,
          updatedAtMs: now,
        })
        continue
      }
      const prevData = doc.get('data') as unknown
      const prevDataRec = isPlainObject(prevData) ? (prevData as Record<string, JSONValue>) : {}
      if (isJsonRecordEqual(prevDataRec, nextData)) continue
      await doc.incrementalPatch({ data: nextData, updatedAtMs: now })
    }

    for (const rowId of existingNodeIds) {
      const doc = existingNodeDocsById.get(rowId) || null
      if (doc) await doc.remove()
    }
    for (const rowId of existingEdgeIds) {
      const doc = existingEdgeDocsById.get(rowId) || null
      if (doc) await doc.remove()
    }
  })
}

export const reorderGraphRecordRows = async (args: { tableId: GraphRecordTableId; orderedRowIds: readonly string[] }): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    const { collections } = await getGraphRecordDb()
    const docs = await collections.rows.find({ selector: { tableId: args.tableId } }).exec()
    const docsById = new Map(docs.map(doc => [String(doc.get('rowId')), doc] as const))
    const remainingIds = docs
      .map(doc => String(doc.get('rowId')))
      .filter(rowId => !args.orderedRowIds.includes(rowId))
    const nextIds = [...args.orderedRowIds, ...remainingIds]
    const now = Date.now()
    for (let i = 0; i < nextIds.length; i += 1) {
      const rowId = nextIds[i]
      const doc = docsById.get(rowId)
      if (!doc) continue
      const nextOrder = i + 1
      const prevOrder = Number(doc.get('order'))
      if (prevOrder === nextOrder) continue
      await doc.incrementalPatch({ order: nextOrder, updatedAtMs: now })
    }
  })
}

export const updateGraphRecordCell = async (
  tableId: GraphRecordTableId,
  rowId: string,
  columnId: string,
  value: unknown,
): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    const { collections } = await getGraphRecordDb()
    const pk = pkOfRow(tableId, rowId)
    const doc = await collections.rows.findOne(pk).exec()
    if (!doc) return
    const raw = doc.toJSON() as GraphRecordRowDoc
    const data = isPlainObject(raw.data) ? { ...(raw.data as Record<string, JSONValue>) } : {}
    const normalizedValue = typeof value === 'string' && !value.trim() ? null : value
    if (normalizedValue == null) delete data[columnId]
    else data[columnId] = toJsonValueForDb(normalizedValue)
    const prev = isPlainObject(raw.data) ? (raw.data as Record<string, JSONValue>) : {}
    if (isJsonRecordEqual(prev, data)) return
    await doc.incrementalPatch({ data, updatedAtMs: Date.now() })
  })
}

export const updateGraphRecordColumnKind = async (
  tableId: GraphRecordTableId,
  columnId: string,
  nextKind: GraphRecordColumnKind,
): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    const { collections } = await getGraphRecordDb()
    const pk = pkOfColumn(tableId, columnId)
    const doc = await collections.columns.findOne(pk).exec()
    if (!doc) return
    const prev = doc.get('kind') as unknown
    const prevKind = String(prev || '') as GraphRecordColumnKind
    if (prevKind === nextKind) return
    await doc.incrementalPatch({ kind: nextKind, updatedAtMs: Date.now() })
  })
}

export const allocateNewRowId = async (tableId: GraphRecordTableId): Promise<string> => {
  return withGraphRecordDbWrite(async () => {
    const { collections } = await getGraphRecordDb()
    const key = `counter:${tableId}`
    const now = Date.now()
    const doc = await collections.meta.findOne(key).exec()
    const prevValue = doc ? (doc.get('value') as unknown) : null
    const prev = typeof prevValue === 'number' && Number.isFinite(prevValue) ? Math.max(0, Math.floor(prevValue)) : 0
    const next = prev + 1
    if (!doc) {
      await collections.meta.incrementalUpsert({ key, value: next, updatedAtMs: now })
    } else {
      await doc.incrementalPatch({ value: next, updatedAtMs: now })
    }
    return tableId === 'nodes' ? `node-${next}` : `edge-${next}`
  })
}

export const createRowFromGraphEntity = async (tableId: GraphRecordTableId, rowId: string, graph: GraphNode | GraphEdge): Promise<void> => {
  await withGraphRecordDbWrite(async () => {
    const { collections } = await getGraphRecordDb()
    const now = Date.now()
    const count = await collections.rows.find({ selector: { tableId } }).exec()
    const order = count.length + 1
    const data = tableId === 'nodes' ? toRowDataForNode(graph as GraphNode) : toRowDataForEdge(graph as GraphEdge)
    await ensureColumnsForRowData(tableId, [data])
    await collections.rows.incrementalUpsert({
      pk: pkOfRow(tableId, rowId),
      tableId,
      rowId,
      order,
      data,
      createdAtMs: now,
      updatedAtMs: now,
    })
  })
}

export const __debugGraphRecordRowHash = (data: Record<string, JSONValue>): number => {
  try {
    return hashRecordSignature32(data || {}, { maxEntries: 120, maxDepth: 1 })
  } catch {
    return 0
  }
}
