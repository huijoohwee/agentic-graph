import assert from 'node:assert/strict'
import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { loadWorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import {
  buildWorkspaceDocsMirrorDesiredEntries,
  resetWorkspaceDocsMirrorSyncForPersistedFs as resetPreparation,
  syncWorkspaceDocsMirrorEntries as syncMirror,
} from '@/features/workspace-fs/workspaceFsPersistedReconciliation'

type Docs = NonNullable<Parameters<typeof syncMirror>[1]>
type Options = NonNullable<Parameters<typeof syncMirror>[2]>
const createDb = () => createPersistedCollectionDb<{ entries: WorkspaceEntry }>({
  storageKey: 'workspace-reconciliation-cache-tests', collectionNames: ['entries'],
  persistent: false, recordKeyByCollection: { entries: entry => entry.path },
})
type Db = ReturnType<typeof createDb>
const doc = (relPath = 'reconciliation-cache.md', text = ' \r\n exact 🧭\u0000 text \n ', updatedAtMs = 71) => ({
  relPath, text, updatedAtMs,
})
const file = (path: string, text: string): WorkspaceEntry => ({
  path, parentPath: path.slice(0, path.lastIndexOf('/')) || '/', kind: 'file',
  name: path.split('/').at(-1)!, text, updatedAtMs: 1,
})
const textAt = async (db: Db, path = '/docs/reconciliation-cache.md') => (
  (await db.collections.entries.findOne(path).exec())?.get('text')
)
const withDbs = async (run: (a: Db, b: Db) => Promise<void>): Promise<void> => {
  const a = createDb(), b = createDb()
  resetPreparation()
  try { await run(a, b) }
  finally {
    await a.db.close()
    await b.db.close()
    resetPreparation()
  }
}
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

// The real memory store remains active. Only the first destination read waits on
// an explicit barrier; every admitted call is drained before restoring that hook.
const withPausedRead = async (
  db: Db,
  run: (control: {
    entered: Promise<void>; release: () => void; reads: () => number
    start: (docs: Docs, options?: Options, collections?: Db['collections']) => Promise<boolean>
  }) => Promise<void>,
  firstError?: Error,
): Promise<void> => {
  const entered = deferred(), released = deferred(), entries = db.collections.entries
  const originalFind = entries.find
  const jobs: Array<Promise<PromiseSettledResult<boolean>>> = []
  let reads = 0
  entries.find = query => {
    const request = originalFind(query), originalExec = request.exec
    request.exec = async () => {
      reads += 1
      if (reads === 1) {
        entered.resolve()
        await released.promise
        if (firstError) throw firstError
      }
      return originalExec()
    }
    return request
  }
  try {
    await run({
      entered: entered.promise, release: released.resolve, reads: () => reads,
      start: (docs, options, collections = db.collections) => {
        const pending = syncMirror(collections, docs, options)
        jobs.push(pending.then(
          value => ({ status: 'fulfilled' as const, value }),
          reason => ({ status: 'rejected' as const, reason }),
        ))
        return pending
      },
    })
  } finally {
    released.resolve()
    await Promise.all(jobs)
    entries.find = originalFind
  }
}

export async function testWorkspaceReconciliationIndependentDestinations() {
  await withDbs(async (a, b) => {
    const docs = [doc()]
    assert.equal(await syncMirror(a.collections, docs), true)
    assert.equal(await syncMirror(b.collections, docs), true, 'a completed destination cannot suppress another store')
    assert.equal(await textAt(a), docs[0].text)
    assert.equal(await textAt(b), docs[0].text)
  })
}

export async function testWorkspaceReconciliationRestoresRemovedDatabase() {
  await withDbs(async db => {
    const docs = [doc()]
    await syncMirror(db.collections, docs)
    await db.db.remove()
    assert.equal(await textAt(db), undefined)
    assert.equal(await syncMirror(db.collections, docs), true, 'native removal must be observed on the same collection object')
    assert.equal(await textAt(db), docs[0].text)
  })
}

export async function testWorkspaceReconciliationObservesExternalMutation() {
  await withDbs(async db => {
    const docs = [doc()]
    await syncMirror(db.collections, docs)
    let writes = 0
    const subscription = db.collections.entries.$.subscribe(() => { writes += 1 })
    try {
      assert.equal(await syncMirror(db.collections, docs), false)
      assert.equal(writes, 0, 'an unchanged destination must not receive redundant writes')
      const row = await db.collections.entries.findOne('/docs/reconciliation-cache.md').exec()
      assert.ok(row)
      await row.incrementalPatch({ text: '# externally changed' })
      assert.equal(await syncMirror(db.collections, docs), true)
      assert.equal(await textAt(db), docs[0].text)
      await row.remove()
      assert.equal(await syncMirror(db.collections, docs), true)
      assert.equal(await textAt(db), docs[0].text)
    } finally { subscription.unsubscribe() }
  })
}

export async function testWorkspaceReconciliationObservesSourceOwnershipChanges() {
  await withDbs(async db => {
    const path = '/docs/reconciliation-cache-owned.md', docs = [doc('reconciliation-cache-owned.md', '# mirror')]
    const index = loadWorkspaceSourceIndex(), previous = Object.getOwnPropertyDescriptor(index, path)
    try {
      // The exported in-memory snapshot is deliberately changed without scheduling
      // global persistence work. Only this fixture path is restored below.
      index[path] = { kind: 'local', originalName: 'reconciliation-cache-owned.md' }
      await db.collections.entries.incrementalUpsert(file(path, '# authored'))
      await syncMirror(db.collections, docs)
      assert.equal(await textAt(db, path), '# authored')
      delete index[path]
      assert.equal(await syncMirror(db.collections, docs), true)
      assert.equal(await textAt(db, path), '# mirror', 'revoked ownership must not remain cached')
      index[path] = { kind: 'local', originalName: 'reconciliation-cache-owned.md' }
      await db.collections.entries.incrementalUpsert(file(path, '# newly authored'))
      await syncMirror(db.collections, docs)
      assert.equal(await textAt(db, path), '# newly authored', 'new ownership must protect current bytes')
    } finally {
      if (previous) Object.defineProperty(index, path, previous)
      else delete index[path]
    }
  })
}

export async function testWorkspaceReconciliationScopeDoesNotSuppressLaterAll() {
  await withDbs(async db => {
    const path = '/docs/reconciliation-cache.md'
    await db.collections.entries.incrementalUpsert(file(path, '# unrelated existing document'))
    const docs = [doc(), doc('workspace-seeds/reconciliation-cache-seed.md', '# fixture seed')]
    await syncMirror(db.collections, docs, { scope: 'canonical-workspace-seeds' })
    assert.equal(await textAt(db), '# unrelated existing document')
    assert.equal(await syncMirror(db.collections, docs, { scope: 'all' }), true)
    assert.equal(await textAt(db), docs[0].text)
  })
}

export async function testWorkspaceReconciliationDuplicateOrderIsSignificant() {
  await withDbs(async db => {
    const first = doc('reconciliation-cache.md', '# first'), second = doc('reconciliation-cache.md', '# second')
    await syncMirror(db.collections, [first, second])
    assert.equal(await textAt(db), second.text)
    assert.equal(await syncMirror(db.collections, [second, first]), true)
    assert.equal(await textAt(db), first.text, 'the last ordered document retains precedence')
  })
}

export async function testWorkspaceReconciliationKeepsMountedPathIdentity() {
  await withDbs(async db => {
    const visible = doc(), runtime = { ...visible, relPath: `agentic-canvas-os/docs/${visible.relPath}` }
    await syncMirror(db.collections, [visible])
    assert.equal(await syncMirror(db.collections, [runtime]), true)
    assert.equal(await textAt(db, `/agentic-canvas-os/docs/${visible.relPath}`), visible.text)
    assert.equal(await textAt(db), undefined, 'a runtime mount replaces its stale flattened mirror')
  })
}

export async function testWorkspaceReconciliationSerializesSharedEntriesOwner() {
  await withDbs(async db => withPausedRead(db, async gate => {
    const first = gate.start([doc('reconciliation-cache.md', '# first')])
    await gate.entered
    const second = gate.start([doc('reconciliation-cache.md', '# second')], undefined, { entries: db.collections.entries })
    assert.equal(gate.reads(), 1, 'wrapping the same entries collection must not create another writer lane')
    gate.release()
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(gate.reads(), 2)
    assert.equal(await textAt(db), '# second')
  }))
}

export async function testWorkspaceReconciliationFailureReleasesQueuedOwner() {
  await withDbs(async db => {
    const failure = new Error('owned destination read failed')
    await withPausedRead(db, async gate => {
      const first = gate.start([doc('reconciliation-cache.md', '# failed')])
      await gate.entered
      const second = gate.start([doc('reconciliation-cache.md', '# recovered')])
      gate.release()
      const results = await Promise.allSettled([first, second])
      assert.equal(results[0].status, 'rejected')
      if (results[0].status === 'rejected') assert.equal(results[0].reason, failure)
      assert.deepEqual(results[1], { status: 'fulfilled', value: true })
      assert.equal(await textAt(db), '# recovered')
      assert.equal(await syncMirror(db.collections, [doc('reconciliation-cache.md', '# recovered')]), false)
    }, failure)
  })
}

export async function testWorkspaceReconciliationResetKeepsActiveQueue() {
  await withDbs(async db => withPausedRead(db, async gate => {
    const first = gate.start([doc('reconciliation-cache.md', '# first')])
    await gate.entered
    resetPreparation()
    const second = gate.start([doc('reconciliation-cache.md', '# after reset')])
    assert.equal(gate.reads(), 1, 'reset may retire preparation but must retain active ownership')
    gate.release()
    await Promise.all([first, second])
    assert.equal(await textAt(db), '# after reset')
  }))
}

export async function testWorkspaceReconciliationSnapshotsQueuedArguments() {
  await withDbs(async db => withPausedRead(db, async gate => {
    const first = gate.start([doc('reconciliation-cache.md', '# first')])
    await gate.entered
    const queued = doc(), expected = { ...queued }, docs = [queued], options: Options = { scope: 'all' }
    const second = gate.start(docs, options)
    queued.relPath = 'reconciliation-poisoned.md'
    queued.text = '# changed after invocation'
    queued.updatedAtMs = 999
    docs.push(doc('reconciliation-injected.md', '# later array insertion'))
    options.scope = 'canonical-workspace-seeds'
    gate.release()
    await Promise.all([first, second])
    const row = await db.collections.entries.findOne(`/docs/${expected.relPath}`).exec()
    assert.equal(row?.get('text'), expected.text)
    assert.equal(row?.get('updatedAtMs'), expected.updatedAtMs)
    assert.equal(await textAt(db, '/docs/reconciliation-poisoned.md'), undefined)
    assert.equal(await textAt(db, '/docs/reconciliation-injected.md'), undefined)
  }))
}

export async function testWorkspaceReconciliationBoundsPendingWriters() {
  await withDbs(async db => withPausedRead(db, async gate => {
    const admitted = [gate.start([doc('reconciliation-cache.md', '# writer 0')])]
    await gate.entered
    for (let index = 1; index < 32; index += 1) {
      admitted.push(gate.start([doc('reconciliation-cache.md', `# writer ${index}`)]))
    }
    const rejected = await Promise.allSettled([gate.start([doc('reconciliation-cache.md', '# overflow')])])
    assert.equal(rejected[0].status, 'rejected', '32 admitted writers includes the active destination owner')
    if (rejected[0].status === 'rejected') {
      assert.ok(rejected[0].reason instanceof Error)
      assert.match(rejected[0].reason.message, /capacity|queue|limit/i)
    }
    assert.equal(gate.reads(), 1, 'overflow cannot start another destination read')
    gate.release()
    const outcomes = await Promise.all(admitted)
    assert.equal(outcomes.length, 32)
    assert.ok(outcomes.every(Boolean))
    assert.equal(await textAt(db), '# writer 31')
    assert.equal(await syncMirror(db.collections, [doc('reconciliation-cache.md', '# after drain')]), true)
    assert.equal(await textAt(db), '# after drain')
  }))
}

export async function testWorkspaceReconciliationPreparedEntriesCannotBePoisoned() {
  await withDbs(async db => {
    const docs = [doc()], path = `/docs/${docs[0].relPath}`
    buildWorkspaceDocsMirrorDesiredEntries(docs)
    assert.equal(buildWorkspaceDocsMirrorDesiredEntries(new Array(1)).size, 0, 'an empty array slot cannot reuse a populated observation')
    const callerOwned = buildWorkspaceDocsMirrorDesiredEntries(docs)
    const entry = callerOwned.get(path)
    assert.ok(entry)
    entry.text = '# caller changed returned entry'
    callerOwned.delete('/docs')
    callerOwned.set('/docs/reconciliation-injected.md', file('/docs/reconciliation-injected.md', '# caller insertion'))
    await syncMirror(db.collections, docs)
    assert.equal(await textAt(db), docs[0].text)
    assert.equal(await textAt(db, '/docs/reconciliation-injected.md'), undefined)
    assert.equal((await db.collections.entries.findOne('/docs').exec())?.get('kind'), 'folder')
    const oversized = [doc('reconciliation-cache.md', '🧭'.repeat(65_000))]
    await syncMirror(db.collections, oversized)
    assert.equal(await textAt(db), oversized[0].text, 'retention limits must not truncate valid source content')
    await db.db.remove()
    await syncMirror(db.collections, oversized)
    assert.equal(await textAt(db), oversized[0].text)
  })
}
