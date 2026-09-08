import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

export async function testUiSlicesReuseSharedStartupStorageSnapshot() {
  const { createUiStorageReaders } = await import('@/hooks/store/uiSliceStorage')
  const { getSessionStorage, resolveBrowserStorageKey } = await import('@/lib/persistence')
  const { MemoryStorage } = await import('@/tests/lib/memoryStorage')
  const { initWindowHarness } = await import('@/tests/lib/windowHarness')
  for (const file of ['uiSlice.ts', 'uiSettingsSlice.ts']) {
    if (!readUtf8(`src/hooks/store/${file}`).includes('const readers = createUiStorageReaders()')) {
      throw new Error(`expected ${file} to use the shared startup reader owner`)
    }
  }
  const first = new MemoryStorage(), second = new MemoryStorage()
  const key = (name: string) => `hydration-fixture:${name}`
  for (const [name, value] of Object.entries({ bool: '1', num: '12.5', int: '42', float: '2.5', json: '{"count":7}', text: ' initial ', mode: 'eager' })) {
    first.setItem(resolveBrowserStorageKey(key(name)), value)
  }
  second.setItem(resolveBrowserStorageKey(key('text')), 'replacement')
  const harness = initWindowHarness({ storage: first })
  const target = window
  const properties = ['localStorage', 'sessionStorage'] as const
  const previous = properties.map(name => Object.getOwnPropertyDescriptor(target, name))
  let active: Storage = first, localReads = 0, sessionReads = 0, denied = false
  try {
    Object.defineProperty(target, 'localStorage', { configurable: true, get() {
      localReads += 1
      if (denied) throw new Error('fixture storage access denied')
      return active
    } })
    Object.defineProperty(target, 'sessionStorage', { configurable: true, get() {
      sessionReads += 1
      if (denied) throw new Error('fixture storage access denied')
      return active
    } })
    const readers = createUiStorageReaders()
    if (Number(localReads) !== 1) throw new Error(`expected one storage getter observation, got ${localReads}`)
    active = second
    const parseCount = (raw: unknown) => raw && typeof raw === 'object' && 'count' in raw && typeof raw.count === 'number' ? { count: raw.count } : null
    for (let repeat = 0; repeat < 3; repeat += 1) {
      if (!readers.lsBool(key('bool'), false) || readers.lsNum(key('num'), 0) !== 1
        || readers.lsInt(key('int'), 0) !== 42 || readers.lsFloat(key('float'), 0) !== 2.5
        || readers.lsJson(key('json'), { count: 0 }, parseCount).count !== 7
        || readers.readLsString(key('text'), '') !== 'initial' || readers.readMonacoLoadMode(key('mode')) !== 'eager') {
        throw new Error('expected all startup readers to reuse their captured storage backend')
      }
    }
    if (Number(localReads) !== 1) throw new Error('expected repeated startup reads to avoid storage reacquisition')
    readers.writeLsString(key('write'), ' updated ')
    if (Number(localReads) !== 2 || second.getItem(resolveBrowserStorageKey(key('write'))) !== 'updated'
      || first.getItem(resolveBrowserStorageKey(key('write'))) !== null) {
      throw new Error('expected writes to acquire the current backend once instead of writing the captured backend')
    }
    if (getSessionStorage()?.getItem(resolveBrowserStorageKey(key('text'))) !== 'replacement' || Number(sessionReads) !== 1) {
      throw new Error('expected session storage to be captured once per accessor call')
    }
    active = first
    if (getSessionStorage()?.getItem(resolveBrowserStorageKey(key('text'))) !== ' initial ' || Number(sessionReads) !== 2) {
      throw new Error('expected later session access to observe a replacement backend')
    }
    denied = true
    const unavailable = createUiStorageReaders()
    if (unavailable.storage !== null || unavailable.lsBool(key('bool'), true) !== true
      || unavailable.lsJson(key('json'), { count: 9 }, parseCount).count !== 9
      || getSessionStorage() !== null) throw new Error('expected inaccessible storage to retain declared fallbacks')
  } finally {
    try {
      properties.forEach((name, index) => {
        const descriptor = previous[index]
        if (descriptor) Object.defineProperty(target, name, descriptor)
        else Reflect.deleteProperty(target, name)
      })
    } finally { harness.restore() }
  }
}

export function testGraphDataPersistenceUsesCoalescedLocalStorageWrites() {
  const text = readUtf8('src/hooks/store/graphDataPersistence.ts')

  if (!text.includes('const GRAPH_DATA_LS_PERSIST_DELAY_MS = 160')) {
    throw new Error('expected graph data localStorage persistence to define one shared coalescing delay')
  }
  if (!text.includes('lsSetJsonCoalesced(LS_KEYS.graphData, graphData, { delayMs: GRAPH_DATA_LS_PERSIST_DELAY_MS })')) {
    throw new Error('expected graph data localStorage persistence to use the shared coalesced json writer')
  }
  if (text.includes('lsSetJson(LS_KEYS.graphData, graphData)')) {
    throw new Error('expected graph data localStorage persistence to avoid direct full-snapshot localStorage writes on every mutation')
  }
}

export async function testSchemaAndHistoryUseSharedDedupeAtPersistenceFunnels() {
  const schemaText = readUtf8('src/hooks/store/schemaSlice.ts')
  const historyText = readUtf8('src/hooks/store/historySlice.ts')
  const schemaTabText = readUtf8('src/features/schema-editor/useSchemaTab.ts')

  if (!schemaText.includes('const SCHEMA_LS_PERSIST_DELAY_MS = 180')) {
    throw new Error('expected schema persistence to define one shared coalescing delay')
  }
  if (!schemaText.includes('lsSetJsonCoalesced(LS_KEYS.graphSchema, canonical, { delayMs: SCHEMA_LS_PERSIST_DELAY_MS })')) {
    throw new Error('expected schema persistence to use the shared coalesced json writer with canonicalized schema payloads')
  }
  if (!schemaText.includes('const getSchemaStorageSignature = (schema: GraphSchema | null): string =>')) {
    throw new Error('expected schema persistence to compute a shared semantic signature before writing')
  }
  if (!schemaText.includes('canonicalizeSchemaForPersistence(schema)')) {
    throw new Error('expected schema persistence to canonicalize schema semantics before storage writes')
  }
  if (!schemaTabText.includes('return stringifyCanonicalSchema(schema)')) {
    throw new Error('expected schema editor dirty-state detection to use the shared canonical schema serializer')
  }
  if (!historyText.includes('const getHistorySnapshotSignature = (')) {
    throw new Error('expected history slice to compute one shared semantic signature for snapshot commits')
  }
  await assertHistoryRetainsUnsampledEdits()
}

export async function testLargePayloadPersistenceUsesShardsInsteadOfWholeMapRewrites() {
  const perDocumentText = readUtf8('src/lib/persistence/perDocumentUiState.ts')
  const graphFieldSettingsText = readUtf8('src/hooks/store/graphFieldSettingsPersistence.ts')
  const panelLayoutSliceText = readUtf8('src/hooks/store/panelLayoutUiSlice.ts')

  if (!perDocumentText.includes("const getPerDocumentUiStateOrderKey = (): string => `${LS_KEYS.perDocumentUiStateMap}:order`")) {
    throw new Error('expected per-document UI persistence to separate the LRU order key from per-document state shards')
  }
  if (!perDocumentText.includes('const getPerDocumentUiStateEntryKey = (documentKey: string)')) {
    throw new Error('expected per-document UI persistence to derive one storage key per document shard')
  }
  if (!perDocumentText.includes('storage.removeItem(LS_KEYS.perDocumentUiStateMap)')) {
    throw new Error('expected per-document UI persistence to remove the legacy whole-map payload after sharded writes')
  }

  const { createFlowWidgetPersistence, flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
  const { MemoryStorage } = await import('@/tests/lib/memoryStorage')
  class ObservedStorage extends MemoryStorage {
    writes: string[] = []
    setItem(key: string, value: string) { this.writes.push(key); super.setItem(key, value) }
  }
  const storage = new ObservedStorage(), tasks = new Map<string, () => void>()
  const persistence = createFlowWidgetPersistence({ storage: () => storage,
    report: (_, message) => { throw new Error(message) },
    schedule: (key, callback) => { tasks.set(key, callback) }, cancel: key => { tasks.delete(key) },
  })
  const flush = () => { const pending = [...tasks.values()]; tasks.clear(); pending.forEach(run => run()) }
  const snapshot = (documentKey: string, left: number) => ({ version: 1 as const, documentKey,
    layout: { kind: 'Graph', nodes: [['n', 'Widget', 1, 2] as [string, string, number, number]], edges: [] as string[] },
    pinned: { n: true }, pos: { n: { top: 10, left } }, world: { n: { x: 1, y: 2 } },
  })
  try {
    persistence.enqueue(snapshot('Graph:a', 20)); persistence.enqueue(snapshot('Graph:b', 30)); flush()
    const keyA = flowWidgetDocumentStorageKey('Graph:a'), keyB = flowWidgetDocumentStorageKey('Graph:b')
    const savedB = storage.getItem(keyB)
    if (keyA === keyB || !storage.getItem(keyA) || !savedB || storage.length !== 2) {
      throw new Error('expected separate complete widget document shards without an auxiliary index')
    }
    storage.writes = []
    persistence.enqueue(snapshot('Graph:a', 40)); flush()
    if (storage.writes.length !== 1 || storage.writes[0] !== keyA || storage.getItem(keyB) !== savedB
      || JSON.parse(storage.getItem(keyA)!).pos.n.left !== 40) {
      throw new Error('expected editing one widget document to write only its shard and preserve every other document byte')
    }
  } finally { persistence.reset() }

  if (!graphFieldSettingsText.includes("const getGraphFieldSettingsIndexKey = (): string => `${LS_KEYS.graphFieldSettingsById}:index`")) {
    throw new Error('expected graph field settings persistence to separate the field index key from per-field shards')
  }
  if (!graphFieldSettingsText.includes('const getGraphFieldSettingsEntryKey = (fieldId: GraphFieldId)')) {
    throw new Error('expected graph field settings persistence to derive one storage key per field shard')
  }
  if (!panelLayoutSliceText.includes('patchGraphFieldSetting: (fieldId: GraphFieldId, patch: Partial<GraphFieldSettings>) =>')) {
    throw new Error('expected panel layout slice to expose a patch-based graph field settings API instead of requiring whole-map writes')
  }
  if (!panelLayoutSliceText.includes('removeGraphFieldSetting: (fieldId: GraphFieldId) =>')) {
    throw new Error('expected panel layout slice to expose a remove-based graph field settings API instead of whole-map deletes')
  }
}


async function assertHistoryRetainsUnsampledEdits() {
  const { createStore } = await import('zustand/vanilla')
  const { boundedJsonEqual } = await import('@/lib/data/boundedJsonEqual')
  const { createHistorySlice, cancelScheduledHistoryCommit } = await import('@/hooks/store/historySlice')
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  type GraphState = import('@/hooks/store/types').GraphState
  const browser = initJsdomHarness()
  const store = createStore<GraphState>((set, get) => ({
    ...createHistorySlice(set, get),
    graphData: { type: 'Graph', nodes: Array.from({ length: 81 }, (_, i) => ({ id: `n${i}`, type: 'Node', properties: { value: 'before' } })), edges: [], metadata: {} },
    graphFieldSettingsById: {}, sourceFiles: [], markdownDocumentName: null, markdownDocumentText: null,
  } as unknown as GraphState))
  const now = Date.now
  const expect = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  try {
    expect(boundedJsonEqual({ a: [1, { b: true }], c: null }, { c: null, a: [1, { b: true }] }), 'comparison must accept exact data independent of key insertion order')
    expect(!boundedJsonEqual(Array(9000).fill(1), Array(9000).fill(1)), 'exhausted work budget must retain a snapshot')
    expect(!boundedJsonEqual('x'.repeat(131073), 'x'.repeat(131073)), 'exhausted text budget must retain a snapshot')
    let deepA: object = {}, deepB: object = {}
    for (let i = 0; i < 65; i += 1) { deepA = { nested: deepA }; deepB = { nested: deepB } }
    expect(!boundedJsonEqual(deepA, deepB), 'exhausted depth budget must retain a snapshot')
    let reads = 0
    expect(!boundedJsonEqual({ get value() { reads += 1; return 1 } }, { value: 1 }) && reads === 0, 'comparison must not invoke accessors')
    Date.now = () => 123456789
    store.getState().addHistory('baseline')
    const initial = store.getState().history
    store.getState().addHistory('unchanged')
    expect(store.getState().history === initial, 'unchanged history must retain its entry array')
    for (const index of [0, 80]) {
      const current = store.getState().graphData!
      store.setState({ graphData: { ...current, nodes: current.nodes.map((node, i) => i === index ? { ...node, properties: { value: 'after' } } : node) } })
      const before = store.getState().history.length
      store.getState().addHistory(`nested edit ${index}`)
      expect(store.getState().history.length === before + 1, `history must preserve nested node ${index} edits beyond sampled hashing`)
    }
    const entries = store.getState().history
    expect(new Set(entries.map(entry => entry.id)).size === entries.length, 'same-clock snapshots must have distinct identities')
    expect(entries.every((entry, index) => index === 0 ? entry.parentId === null : entry.parentId === entries[index - 1].id), 'history parent links must reference the prior snapshot')
    expect(entries[0].graphData.nodes[0].properties?.value === 'before', 'saved snapshots must remain isolated from later edits')
    store.getState().undoHistory()
    expect(store.getState().graphData!.nodes[80].properties?.value === 'before', 'undo must restore the unsampled tail edit')
    store.getState().redoHistory()
    expect(store.getState().graphData!.nodes[80].properties?.value === 'after', 'redo must restore the retained tail edit')
    Date.now = now
  } finally {
    Date.now = now
    cancelScheduledHistoryCommit()
    browser.restore()
  }
}
