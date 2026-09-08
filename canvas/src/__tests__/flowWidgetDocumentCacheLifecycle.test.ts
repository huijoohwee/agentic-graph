import { useGraphStore } from '@/hooks/useGraphStore'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import type { GraphData } from '@/lib/graph/types'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'

const graph = (document = 'a', x = 100, type = 'CustomWidget'): GraphData => ({
  type: 'Graph', context: 'frontmatter-flow',
  metadata: { kind: 'frontmatter-flow', source: `workspace:/widget-cache-${document}.md`, sourceLayerHash: 'revision' },
  nodes: [{ id: 'n', label: 'Widget', type, x, y: 80, properties: {} }], edges: [],
})
const seed = (value: GraphData) => {
  const s = useGraphStore.getState()
  s.setGraphData(value)
  s.setFlowWidgetPinnedByNodeId({ n: true })
  s.setFlowWidgetPosByNodeId({ n: { top: 10, left: 20 } })
  s.setFlowWidgetWorldPosByNodeId({ n: { x: 1, y: 2 } })
}
const checkPlacement = (present: boolean, label: string) => {
  const s = useGraphStore.getState()
  const maps = [s.flowWidgetPinnedByNodeId, s.flowWidgetPosByNodeId, s.flowWidgetWorldPosByNodeId]
  if (!present && maps.some(map => Object.keys(map).length !== 0)) throw new Error(`${label}: expected no active placement`)
  if (present && (s.flowWidgetPinnedByNodeId.n !== true || s.flowWidgetPosByNodeId.n?.left !== 20 || s.flowWidgetWorldPosByNodeId.n?.y !== 2)) {
    throw new Error(`${label}: expected exact retained pin, screen, and world placement`)
  }
}
async function withStoreFixture(run: (storage: MemoryStorage) => void | Promise<void>) {
  const previous = useGraphStore.getState()
  const storage = new MemoryStorage()
  const harness = initWindowHarness({ storage })
  const errors: unknown[] = []
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ workspaceViewMode: 'canvas', workspaceGraphMutationLayoutLockActive: false,
      markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationBlockKey: '' })
    await run(storage)
  } catch (error) { errors.push(error) } finally {
    for (const cleanup of [() => useGraphStore.getState().resetAll(), () => useGraphStore.setState(previous), () => harness.restore()]) {
      try { cleanup() } catch (error) { errors.push(error) }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, errors.map(error => error instanceof Error ? error.message : String(error)).join('; '))
}

export async function testWidgetReadyEmptyClearsPlacement() {
  await withStoreFixture(() => {
    for (const method of ['setGraphData', 'setGraphDataPreservingLayout'] as const) {
      const a = graph()
      seed(a)
      useGraphStore.getState()[method]({ ...a, nodes: [], edges: [] })
      checkPlacement(false, `${method} ready-empty`)
      const s = useGraphStore.getState(), key = buildGraphDocumentMetaKey(a)
      if ([s.flowWidgetPinnedByNodeIdByGraphMetaKey, s.flowWidgetPosByNodeIdByGraphMetaKey, s.flowWidgetWorldPosByNodeIdByGraphMetaKey]
        .some(cache => Object.keys(cache[key] || {}).length)) throw new Error('Ready-empty must clear all target document caches')
    }
  })
}

export async function testWidgetAnonymousGraphClearsOnlyActivePlacement() {
  await withStoreFixture(() => {
    const a = graph(), key = buildGraphDocumentMetaKey(a)
    seed(a)
    const saved = useGraphStore.getState().flowWidgetPinnedByNodeIdByGraphMetaKey[key]
    useGraphStore.getState().setGraphData({ type: 'Graph', nodes: a.nodes, edges: [] })
    checkPlacement(false, 'anonymous graph')
    if (useGraphStore.getState().flowWidgetPinnedByNodeIdByGraphMetaKey[key] !== saved) throw new Error('Anonymous graph must preserve inactive document cache')
    useGraphStore.getState().setGraphData(a)
    checkPlacement(true, 'return from anonymous graph')
  })
}

export async function testWidgetPendingLayoutChangeUsesStoredEvidence() {
  await withStoreFixture(() => {
    const a = graph()
    seed(a)
    useGraphStore.getState().setGraphData({ ...a, nodes: [], metadata: { ...a.metadata, pending: true } })
    useGraphStore.getState().setGraphData(graph('a', 500))
    checkPlacement(false, 'authored coordinates changed while pending')
    seed(a)
    useGraphStore.getState().setGraphData({ ...a, nodes: [], metadata: { ...a.metadata, pending: true } })
    useGraphStore.getState().setGraphData(a)
    checkPlacement(true, 'unchanged pending-to-ready control')
  })
}

export async function testWidgetInactiveLayoutChangeUsesStoredEvidence() {
  await withStoreFixture(() => {
    const a = graph()
    seed(a)
    useGraphStore.getState().setGraphData(graph('b'))
    useGraphStore.getState().setGraphData(graph('a', 100, 'ChangedWidget'))
    checkPlacement(false, 'inactive authored type changed without revision marker change')
    seed(a)
    useGraphStore.getState().setGraphData(graph('b'))
    useGraphStore.getState().setGraphData(a)
    checkPlacement(true, 'unchanged inactive-document control')
  })
}

const snapshot = (documentKey: string, left = 20) => ({
  version: 1 as const, documentKey,
  layout: { kind: 'frontmatter-flow', nodes: [['n', 'CustomWidget', 100, 80] as [string, string, number, number]], edges: [] as string[] },
  pinned: { n: true }, pos: { n: { top: 10, left } }, world: { n: { x: 1, y: 2 } },
})
function manualScheduler() {
  const pending = new Map<string, () => void>()
  return {
    schedule(key: string, callback: () => void, delay: number) {
      if (delay !== 90) throw new Error('Expected the existing bounded persistence delay')
      pending.set(key, callback)
    },
    cancel(key: string) { pending.delete(key) },
    flush() { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback() },
    count: () => pending.size,
  }
}

export async function testWidgetAtomicPersistenceFailureRetryAndReload() {
  const { createFlowWidgetPersistence, flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
  const scheduler = manualScheduler(), warnings: string[] = []
  class FailingStorage extends MemoryStorage {
    fail = false
    writes: string[] = []
    setItem(key: string, value: string) { this.writes.push(key); if (this.fail) throw new Error('quota'); super.setItem(key, value) }
  }
  const storage = new FailingStorage(), key = 'document:a', old = snapshot(key), next = snapshot(key, 55)
  const owner = createFlowWidgetPersistence({ storage: () => storage, report: (_, message) => warnings.push(message), ...scheduler })
  owner.enqueue(old); scheduler.flush()
  const before = storage.getItem(flowWidgetDocumentStorageKey(key))
  storage.fail = true
  owner.enqueue(next); scheduler.flush()
  if (storage.getItem(flowWidgetDocumentStorageKey(key)) !== before || warnings.length !== 1) throw new Error('Failed atomic save must preserve previous complete bytes and report failure')
  storage.fail = false
  owner.enqueue(next); scheduler.flush()
  const restored = createFlowWidgetPersistence({ storage: () => storage, report: () => { throw new Error('Unexpected reload warning') }, ...scheduler }).read(key)
  if (JSON.stringify(restored) !== JSON.stringify(next)) throw new Error('Identical retry must persist the whole placement and baseline for reload')
  if (storage.writes.some(writtenKey => writtenKey !== flowWidgetDocumentStorageKey(key))) throw new Error('Atomic save must not depend on a second index or channel write')
  owner.reset()
}

export async function testWidgetPersistenceCoalescesDocumentsAndCoordinateChanges() {
  const { createFlowWidgetPersistence } = await import('@/hooks/store/graphViewWidgetPersistence')
  const scheduler = manualScheduler(), storage = new MemoryStorage()
  const owner = createFlowWidgetPersistence({ storage: () => storage, report: () => { throw new Error('Unexpected save warning') }, ...scheduler })
  owner.enqueue(snapshot('document:a')); owner.enqueue(snapshot('document:b')); owner.enqueue(snapshot('document:a', 30))
  if (scheduler.count() !== 1) throw new Error('Document batch should share one scheduled flush')
  scheduler.flush()
  if (owner.read('document:a')?.pos.n.left !== 30 || owner.read('document:b')?.pos.n.left !== 20) throw new Error('Coalescing must retain both documents and the latest same-document write')
  owner.enqueue(snapshot('document:a', 40)); scheduler.flush()
  if (owner.read('document:a')?.pos.n.left !== 40) throw new Error('Coordinate-only changes must persist across flushes')
  const other = createFlowWidgetPersistence({ storage: () => storage, report: () => {}, ...scheduler })
  other.enqueue(snapshot('document:a', 60)); scheduler.flush()
  owner.enqueue(snapshot('document:a', 40)); scheduler.flush()
  if (owner.read('document:a')?.pos.n.left !== 40) throw new Error('An old successful memo must not conceal another writer')
  owner.reset(); other.reset()
}

export async function testWidgetPersistenceStorageOwnersResetAndUnavailableStorage() {
  const { createFlowWidgetPersistence, flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
  const scheduler = manualScheduler(), a = new MemoryStorage(), b = new MemoryStorage(), warnings: string[] = []
  let storage: Storage | null = a
  const owner = createFlowWidgetPersistence({ storage: () => storage, report: (_, message) => warnings.push(message), ...scheduler })
  const input = snapshot('document:a', 11)
  owner.enqueue(input); input.pos.n.left = 999
  storage = b; owner.enqueue(snapshot('document:a', 22)); scheduler.flush()
  const key = flowWidgetDocumentStorageKey('document:a')
  if (JSON.parse(a.getItem(key)!).pos.n.left !== 11 || JSON.parse(b.getItem(key)!).pos.n.left !== 22) throw new Error('Queue must capture bytes and distinct Storage owners')
  owner.enqueue(snapshot('document:a', 33)); owner.reset(); scheduler.flush()
  if (JSON.parse(b.getItem(key)!).pos.n.left !== 22) throw new Error('Reset must cancel only pending writes without erasing saved bytes')
  b.setItem(key, JSON.stringify(snapshot('document:a', 44)))
  owner.enqueue(snapshot('document:a', 22)); scheduler.flush()
  if (JSON.parse(b.getItem(key)!).pos.n.left !== 22) throw new Error('Reset must discard successful-byte memo too')
  storage = null
  if (owner.enqueue(snapshot('document:a')) || warnings.length !== 1) throw new Error('Unavailable local storage must report a save failure')
  owner.reset()
}

export async function testWidgetLegacyPlacementIsWithheldWithoutDeletingBytes() {
  const { createFlowWidgetPersistence, flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
  const { LS_KEYS } = await import('@/lib/config.ls.keys')
  const storage = new MemoryStorage(), scheduler = manualScheduler(), warnings: string[] = [], documentKey = 'document:a'
  const legacyKey = `${LS_KEYS.flowWidgetPosByGraphMetaKey}:${encodeURIComponent(documentKey)}`
  storage.setItem(legacyKey, '{"n":{"top":10,"left":20}}')
  const owner = createFlowWidgetPersistence({ storage: () => storage, report: (_, message) => warnings.push(message), ...scheduler })
  if (owner.read(documentKey) !== null || owner.read(documentKey) !== null || warnings.length !== 1) throw new Error('Unverified legacy placement must be withheld with a deduplicated notice')
  if (storage.getItem(legacyKey) !== '{"n":{"top":10,"left":20}}') throw new Error('Legacy bytes must remain intact')
  storage.setItem(flowWidgetDocumentStorageKey(documentKey), '{"version":1}')
  if (owner.read(documentKey) !== null || storage.getItem(flowWidgetDocumentStorageKey(documentKey)) !== '{"version":1}') throw new Error('Malformed atomic data must remain preserved and withheld')
  owner.reset()
}

async function awaitNativePersistenceWindow() {
  const { scheduleWorkspaceSyncTask } = await import('@/lib/async/workspaceSyncScheduler')
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Native persistence window did not flush within 1s')), 1000)
    scheduleWorkspaceSyncTask('test:widget-cache:flush-barrier', () => { clearTimeout(deadline); resolve() }, 100)
  })
}

export async function testWidgetStoreOpenPreservesRejectedAndUnreadableRecords() {
  await withStoreFixture(async storage => {
    const { flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
    const value = graph(), documentKey = buildGraphDocumentMetaKey(value), key = flowWidgetDocumentStorageKey(documentKey)
    const corrupt = '{"version":1,"recover":"original bytes"}'
    storage.setItem(key, corrupt)
    useGraphStore.getState().setGraphData(value)
    await awaitNativePersistenceWindow()
    if (storage.getItem(key) !== corrupt) throw new Error('Opening a graph must not overwrite its rejected saved record')
    const original = JSON.stringify(snapshot(documentKey, 57))
    for (const failures of [1, 2]) {
      useGraphStore.getState().resetAll()
      storage.setItem(key, original)
      const read = storage.getItem.bind(storage)
      let remaining = failures
      storage.getItem = (name: string) => {
        if (name === key && remaining-- > 0) throw new Error('temporarily unreadable')
        return read(name)
      }
      try {
        useGraphStore.getState().setGraphData(graph())
      } finally { storage.getItem = read }
      await awaitNativePersistenceWindow()
      if (storage.getItem(key) !== original) throw new Error('A transient read failure must not turn a saved placement into an empty cache')
    }
  })
}

export async function testWidgetPersistFalseDoesNotLeakAcrossChannelsOrReload() {
  await withStoreFixture(async storage => {
    const { flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
    const a = graph(), key = flowWidgetDocumentStorageKey(buildGraphDocumentMetaKey(a))
    seed(a)
    useGraphStore.getState().setFlowWidgetPosByNodeId({ n: { top: 900, left: 999 } }, { persist: false })
    useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ n: { x: 800, y: 888 } }, { persist: false })
    useGraphStore.getState().setFlowWidgetPinnedByNodeId({ n: false })
    const deadline = Date.now() + 1000
    while (storage.getItem(key) === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    const raw = storage.getItem(key)
    if (!raw) throw new Error('Expected bounded native persistence flush')
    const saved = JSON.parse(raw)
    if (saved.pinned.n !== false || saved.pos.n.left !== 20 || saved.world.n.y !== 2) throw new Error('A persisted pin must not capture ephemeral screen/world placement')
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setGraphData(a)
    const reloaded = useGraphStore.getState()
    if (reloaded.flowWidgetPinnedByNodeId.n !== false || reloaded.flowWidgetPosByNodeId.n?.left !== 20 || reloaded.flowWidgetWorldPosByNodeId.n?.y !== 2) throw new Error('Reload must restore only durable channels with layout evidence')
  })
}

export async function testWidgetStoreKeepsQueuedStorageContextsSeparate() {
  await withStoreFixture(async a => {
    const { flowWidgetDocumentStorageKey } = await import('@/hooks/store/graphViewWidgetPersistence')
    const value = graph(), key = flowWidgetDocumentStorageKey(buildGraphDocumentMetaKey(value))
    seed(value)
    const b = new MemoryStorage(), inner = initWindowHarness({ storage: b })
    try {
      seed(graph())
      useGraphStore.getState().setFlowWidgetPosByNodeId({ n: { top: 10, left: 40 } })
      const deadline = Date.now() + 1000
      while ((!a.getItem(key) || !b.getItem(key)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
      if (!a.getItem(key) || !b.getItem(key)) throw new Error('Expected both owned storage contexts to flush')
      if (JSON.parse(a.getItem(key)!).pos.n.left !== 20 || JSON.parse(b.getItem(key)!).pos.n.left !== 40) {
        throw new Error('A later window must not receive or overwrite the earlier window placement batch')
      }
    } finally { inner.restore() }
  })
}
