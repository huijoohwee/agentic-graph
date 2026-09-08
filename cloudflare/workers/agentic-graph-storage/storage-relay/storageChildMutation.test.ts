import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixture, migrations, syncMigrations, WORKSPACE, type Fixture } from '../../../../canvas/src/__tests__/helpers/native-agentic-graph-storage-fixture'
import { AGENTIC_OS_STORAGE_API_VERSION, AGENTIC_OS_STORAGE_SYNC_API_VERSION, AGENTIC_OS_STORAGE_ROUTE_PATHS, AGENTIC_OS_STORAGE_SYNC_LIMITS,
  hashAgenticGraphStorageContent, type AgenticGraphStorageMutation, type AgenticGraphStoragePushResponse,
  type AgenticGraphStoragePullResponse } from '../contract'
import type { D1DatabaseLike } from '../db'
import { processAgenticGraphStorageChildMutation as processChild, type StorageChildMutationResult } from '../storageChildMutation'
import { validateAgenticGraphStorageMutation } from '../mutationProcessor'
import { readAgenticGraphStoragePullPage } from '../storageSyncReadRuntime'
import { readAgenticGraphStorageSyncPageRows } from '../storageSyncPageRows'

type ChildMutation = Extract<AgenticGraphStorageMutation, { entity: 'documentChunk' | 'graphSnapshot' }>
const create = async () => {
  const fixture = await createFixture(syncMigrations)
  fixture.document('parent')
  return fixture
}
const mutation = (entity: ChildMutation['entity'], content = 'original', id = 'child', documentId = 'parent'): ChildMutation => {
  const common = { mutationId: `${entity}:${id}:${content}`, workspaceId: WORKSPACE,
    op: 'upsert' as const, recordId: id, baseRevision: null }
  return entity === 'documentChunk'
    ? { ...common, entity, record: { id, documentId, workspaceId: WORKSPACE, chunkKey: 'section', chunkOrder: 0,
        heading: null, markdown: content, tokenEstimate: 1, contentHash: hashAgenticGraphStorageContent(content), updatedAtMs: 1 } }
    : { ...common, entity, record: { id, documentId, workspaceId: WORKSPACE, graphRevision: 1,
        graphHash: hashAgenticGraphStorageContent(content), graphJson: { content }, layoutJson: null,
        derivedFromDocumentRevision: 1, updatedAtMs: 1 } }
}
const run = (fixture: Fixture, value: ChildMutation, db = fixture.d1, aliases = new Map<string, string>()) => {
  assert.equal(validateAgenticGraphStorageMutation(WORKSPACE, value), null)
  return processChild({ db, workspaceId: WORKSPACE, documentIdAliases: aliases }, value)
}
const revision = (result: StorageChildMutationResult) => {
  assert.ok(result.state && Number.isSafeInteger(result.state.sync_revision))
  assert.equal(result.acknowledgement.serverRevision, result.state.sync_revision)
  return result.state.sync_revision
}
const data = (fixture: Fixture) => JSON.stringify(['documents', 'document_chunks', 'graph_snapshots',
  'storage_child_state', 'document_publications'].map(table => fixture.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
const table = (entity: ChildMutation['entity']) => entity === 'documentChunk' ? 'document_chunks' : 'graph_snapshots'
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
const pauseWrite = (fixture: Fixture) => {
  const entered = deferred(), release = deferred()
  let batches = 0
  const db: D1DatabaseLike = {
    prepare: query => fixture.d1.prepare(query),
    async batch(statements) {
      batches += 1
      if (batches === 2) { entered.resolve(); await release.promise }
      return fixture.d1.batch!(statements)
    },
  }
  return { db, entered: entered.promise, release: release.resolve }
}

for (const entity of ['documentChunk', 'graphSnapshot'] as const) {
  test(`${entity}: create, canonical alias and exact replay retain the current revision`, async () => {
    const fixture = await create()
    try {
      const original = mutation(entity)
      const created = await run(fixture, original)
      assert.equal(created.acknowledgement.status, 'applied')
      assert.equal(created.state!.record_id, original.recordId)
      assert.equal(created.state!.deleted, 0)
      original.baseRevision = revision(created)
      const before = data(fixture)
      fixture.sql.exec(`CREATE TEMP TRIGGER refuse_child_update BEFORE UPDATE ON ${table(entity)}
        BEGIN SELECT RAISE(ABORT, 'unexpected replay update'); END`)
      const replay = await run(fixture, original)
      assert.deepEqual(replay.state, created.state)
      const alias = mutation(entity, 'original', 'device-local-alias')
      alias.baseRevision = original.baseRevision
      const aliased = await run(fixture, alias)
      assert.equal(aliased.acknowledgement.recordId, 'device-local-alias', 'acknowledge the sent outbox identity')
      assert.equal(aliased.state!.record_id, 'child', 'return the canonical cache identity')
      assert.equal(data(fixture), before)
      assert.equal((await run(fixture, { ...original, baseRevision: null })).acknowledgement.status, 'conflict')
    } finally { await fixture.close() }
  })

  test(`${entity}: deletion fences stale offline edits and restoration advances identity`, async () => {
    const fixture = await create()
    try {
      const original = mutation(entity)
      const created = await run(fixture, original)
      const edit = { ...mutation(entity, 'offline authored bytes'), baseRevision: revision(created) }
      const preservedEdit = structuredClone(edit)
      const deletion = { ...original, op: 'delete' as const, baseRevision: revision(created) }
      const removed = await run(fixture, deletion)
      assert.equal(removed.acknowledgement.status, 'applied')
      assert.equal(removed.state!.deleted, 1)
      assert.ok(revision(removed) > revision(created))
      assert.equal(fixture.sql.prepare(`SELECT COUNT(*) AS count FROM ${table(entity)}`).get()!.count, 0)
      const deletedData = data(fixture)
      for (const baseRevision of [edit.baseRevision, null]) {
        const stale = await run(fixture, { ...edit, baseRevision })
        assert.equal(stale.acknowledgement.status, 'conflict')
        assert.deepEqual(stale.state, removed.state)
        assert.equal(data(fixture), deletedData, 'a stale or unobserved edit cannot resurrect the child')
      }
      assert.deepEqual(edit, preservedEdit, 'caller-owned authored payload remains intact')
      const repeated = await run(fixture, { ...deletion, baseRevision: revision(removed) })
      assert.equal(repeated.acknowledgement.status, 'applied')
      assert.deepEqual(repeated.state, removed.state)
      assert.equal(data(fixture), deletedData, 'repeated observed deletion allocates no revision')
      const restored = await run(fixture, { ...mutation(entity, 'restored', 'replacement'), baseRevision: revision(removed) })
      assert.equal(restored.acknowledgement.status, 'applied')
      assert.equal(restored.state!.record_id, 'replacement')
      assert.equal(restored.state!.deleted, 0)
      assert.ok(revision(restored) > revision(removed))
      const restoredData = data(fixture)
      assert.equal((await run(fixture, deletion)).acknowledgement.status, 'conflict')
      assert.equal(data(fixture), restoredData, 'a delayed delete cannot erase the restored incarnation')
      assert.deepEqual({ ...fixture.sql.prepare('SELECT * FROM storage_child_state WHERE record_id = ?').get('child') }, removed.state)
    } finally { await fixture.close() }
  })

  for (const operation of ['upsert', 'delete'] as const) {
    test(`${entity}: concurrent ${operation} cannot overwrite a newer database state`, async () => {
      const fixture = await create()
      const pause = pauseWrite(fixture)
      let pending: Promise<StorageChildMutationResult> | undefined
      try {
        const created = await run(fixture, mutation(entity))
        const baseRevision = revision(created)
        pending = run(fixture, { ...mutation(entity, 'delayed'), op: operation, baseRevision }, pause.db)
        await Promise.race([pause.entered, pending.then(() => { throw new Error('writer did not reach its guarded write') })])
        const winner = await run(fixture, { ...mutation(entity, 'winner'),
          op: operation === 'upsert' ? 'delete' : 'upsert', baseRevision })
        assert.equal(winner.acknowledgement.status, 'applied')
        const won = data(fixture)
        pause.release()
        const result = await pending
        assert.equal(result.acknowledgement.status, 'conflict')
        assert.deepEqual(result.state, winner.state)
        assert.equal(data(fixture), won, 'the SQL fence prevents the stale write, including parent and publication effects')
      } finally { pause.release(); await pending; await fixture.close() }
    })
  }

  test(`${entity}: state-write failure rolls back child and parent atomically`, async () => {
    const fixture = await create()
    try {
      const created = await run(fixture, mutation(entity))
      const current = fixture.identity('parent')
      const published = await fixture.publication('parent', 'publish', {
        expectedRevision: current.revision, expectedContentHash: current.contentHash,
      })
      assert.equal(published.status, 200, await published.clone().text())
      assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM document_publications').get()!.count, 1)
      const before = data(fixture)
      fixture.sql.exec("CREATE TEMP TRIGGER reject_child_state BEFORE INSERT ON storage_child_state BEGIN SELECT RAISE(ABORT, 'state-write-failure'); END")
      for (const op of ['upsert', 'delete'] as const) {
        await assert.rejects(run(fixture, { ...mutation(entity, 'changed'), op, baseRevision: revision(created) }), /state-write-failure/)
        assert.equal(data(fixture), before)
      }
    } finally { await fixture.close() }
  })

  test(`${entity}: parent availability is checked again inside the write`, async () => {
    const fixture = await create()
    const pause = pauseWrite(fixture)
    let pending: Promise<StorageChildMutationResult> | undefined
    try {
      const created = await run(fixture, mutation(entity))
      pending = run(fixture, { ...mutation(entity, 'pending'), baseRevision: revision(created) }, pause.db)
      await Promise.race([pause.entered, pending.then(() => { throw new Error('writer did not reach its guarded write') })])
      fixture.sql.exec("UPDATE documents SET deleted = 1, revision = revision + 1 WHERE id = 'parent'")
      const hidden = data(fixture)
      pause.release()
      assert.equal((await pending).acknowledgement.status, 'conflict')
      assert.equal(data(fixture), hidden)
    } finally { pause.release(); await pending; await fixture.close() }
  })

  test(`${entity}: conflicting live IDs and natural keys are retained`, async () => {
    const fixture = await create()
    try {
      fixture.document('other-parent')
      await run(fixture, mutation(entity))
      const other = await run(fixture, mutation(entity, 'other', 'other-child', 'other-parent'))
      const before = data(fixture)
      const result = await run(fixture, { ...mutation(entity, 'collision', 'child', 'other-parent'), baseRevision: revision(other) })
      assert.equal(result.acknowledgement.status, 'conflict')
      assert.equal(data(fixture), before)
    } finally { await fixture.close() }
  })

  test(`${entity}: identity moves fence delayed edits to the old binding`, async () => {
    const fixture = await create()
    try {
      fixture.document('moved-parent')
      const original = mutation(entity)
      const created = await run(fixture, original)
      const moved = await run(fixture, { ...mutation(entity, 'moved', 'child', 'moved-parent'), baseRevision: revision(created) })
      assert.equal(moved.acknowledgement.status, 'applied')
      assert.equal(moved.state!.document_id, 'moved-parent')
      const oldBinding = fixture.sql.prepare("SELECT * FROM storage_child_state WHERE record_id = 'child' AND document_id = 'parent'").get()!
      assert.equal(oldBinding.deleted, 1)
      assert.ok(Number(oldBinding.sync_revision) < revision(moved))
      const before = data(fixture)
      assert.equal((await run(fixture, { ...original, baseRevision: revision(created) })).acknowledgement.status, 'conflict')
      assert.equal(data(fixture), before)
    } finally { await fixture.close() }
  })

  test(`${entity}: competing first writes return a conflict without replacing the winning identity`, async () => {
    const fixture = await create()
    const pause = pauseWrite(fixture)
    let pending: Promise<StorageChildMutationResult> | undefined
    try {
      pending = run(fixture, mutation(entity, 'delayed', 'loser'), pause.db)
      await Promise.race([pause.entered, pending.then(() => { throw new Error('writer did not reach its guarded write') })])
      const winner = await run(fixture, mutation(entity, 'winning content', 'winner'))
      const before = data(fixture)
      pause.release()
      const result = await pending
      assert.equal(result.acknowledgement.status, 'conflict')
      assert.deepEqual(result.state, winner.state)
      assert.equal(data(fixture), before)
    } finally { pause.release(); await pending; await fixture.close() }
  })

  test(`${entity}: missing rows without deletion evidence fail visibly`, async () => {
    const fixture = await create()
    try {
      const original = mutation(entity)
      const created = await run(fixture, original)
      fixture.sql.exec(`DROP TRIGGER ${table(entity)}_sync_delete`)
      fixture.sql.exec(`DELETE FROM ${table(entity)} WHERE id = 'child'`)
      const before = data(fixture)
      for (const baseRevision of [null, revision(created), revision(created) + 1]) {
        await assert.rejects(run(fixture, { ...original, baseRevision }), /Live child sync state has no record/)
      }
      await assert.rejects(readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, null), /Live child sync state has no matching record/)
      assert.equal(data(fixture), before, 'missing deletion metadata is not permission to restore content')
    } finally { await fixture.close() }
  })
}

test('child writer rejects unsafe bases and requires real transaction support before database effects', async () => {
  const fixture = await create()
  try {
    const before = data(fixture)
    const db: D1DatabaseLike = { prepare() { throw new Error('unexpected database access') } }
    for (const baseRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      const result = await run(fixture, { ...mutation('documentChunk'), baseRevision }, db)
      assert.equal(result.acknowledgement.status, 'rejected')
    }
    for (const entity of ['documentChunk', 'graphSnapshot'] as const) {
      const invalid = mutation(entity)
      if (invalid.entity === 'documentChunk') invalid.record.tokenEstimate = Number.MAX_SAFE_INTEGER + 1
      else invalid.record.derivedFromDocumentRevision = Number.MAX_SAFE_INTEGER + 1
      assert.equal((await run(fixture, invalid, db)).acknowledgement.status, 'rejected')
    }
    await assert.rejects(run(fixture, mutation('documentChunk'), db), /transactional database batch support/)
    assert.equal(data(fixture), before)
  } finally { await fixture.close() }
})

test('legacy sync protocol rejects before workspace, device or content effects', async () => {
  const fixture = await create()
  const snapshot = () => JSON.stringify(['workspaces', 'sync_devices', 'sync_events', 'documents',
    'document_chunks', 'graph_snapshots', 'storage_child_state'].map(name => fixture.sql.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()))
  try {
    const before = snapshot()
    for (const route of ['push', 'pull'] as const) {
      const response = await fixture.request(AGENTIC_OS_STORAGE_ROUTE_PATHS[route], {
        method: 'POST', headers: { authorization: `Bearer ${fixture.auth.sessionToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_API_VERSION, workspaceId: WORKSPACE,
          deviceId: 'legacy-device', mutations: [mutation('documentChunk')], since: null, knownChunks: [] }),
      })
      assert.equal(response.status, 400, `legacy ${route} must fail before sync effects`)
      assert.equal(snapshot(), before)
    }
  } finally { await fixture.close() }
})

const requestSync = (fixture: Fixture, route: 'push' | 'pull', body: object) => fixture.request(
  AGENTIC_OS_STORAGE_ROUTE_PATHS[route], {
    method: 'POST', headers: { authorization: `Bearer ${fixture.auth.sessionToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId: WORKSPACE,
      deviceId: 'revisioned-device', ...body }),
  },
)
const pushSync = async (fixture: Fixture, value: ChildMutation) => {
  const response = await requestSync(fixture, 'push', { mutations: [value] })
  assert.equal(response.status, 200, await response.clone().text())
  const body = await response.json() as AgenticGraphStoragePushResponse
  assert.equal(body.apiVersion, AGENTIC_OS_STORAGE_SYNC_API_VERSION)
  assert.equal(body.acknowledgements.length, 1)
  return body.acknowledgements[0]!
}

for (const entity of ['documentChunk', 'graphSnapshot'] as const) {
  test(`${entity}: authenticated sync carries deletion and restoration revisions without reusing payload revisions`, async () => {
    const fixture = await create()
    try {
      const original = mutation(entity)
      const created = await pushSync(fixture, original)
      assert.equal(created.status, 'applied')
      assert.equal(created.childState!.recordId, original.recordId)
      const deleted = await pushSync(fixture, { ...original, op: 'delete', baseRevision: created.serverRevision })
      assert.equal(deleted.status, 'applied')
      assert.equal(deleted.childState!.deleted, true)
      assert.ok(deleted.serverRevision! > created.serverRevision!)
      const stale = await pushSync(fixture, { ...mutation(entity, 'offline edit'), baseRevision: created.serverRevision })
      assert.equal(stale.status, 'conflict')
      assert.deepEqual(stale.childState, deleted.childState)
      const since = new Date(deleted.childState!.updatedAtMs).toISOString()
      const response = await requestSync(fixture, 'pull', { since, knownChunks: [] })
      assert.equal(response.status, 200, await response.clone().text())
      const pulled = await response.json() as AgenticGraphStoragePullResponse
      assert.equal(pulled.apiVersion, AGENTIC_OS_STORAGE_SYNC_API_VERSION)
      assert.deepEqual(pulled.changes.deletions, [deleted.childState], 'inclusive state-time pull delivers the exact deletion')
      assert.equal(pulled.changes.documentChunks.length + pulled.changes.graphSnapshots.length, 0)
      const restored = await pushSync(fixture, { ...mutation(entity, 'restored', 'replacement'), baseRevision: deleted.serverRevision })
      assert.equal(restored.status, 'applied')
      assert.ok(restored.serverRevision! > deleted.serverRevision!)
      assert.equal(restored.childState!.recordId, 'replacement')
      const page = await readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, since)
      assert.deepEqual(page.changes.deletions, [deleted.childState])
      const rows = entity === 'documentChunk' ? page.changes.documentChunks : page.changes.graphSnapshots
      assert.equal(rows.length, 1)
      assert.equal(rows[0].id, 'replacement')
      assert.equal(rows[0].syncRevision, restored.serverRevision)
      if (entity === 'graphSnapshot') assert.equal(page.changes.graphSnapshots[0].graphRevision, 1)
      const current = data(fixture)
      assert.equal((await pushSync(fixture, { ...original, op: 'delete', baseRevision: deleted.serverRevision })).status, 'conflict')
      assert.equal(data(fixture), current)
    } finally { await fixture.close() }
  })
}

test('revisioned sync rejects an unprepared database before device or content writes', async () => {
  const fixture = await createFixture(migrations)
  const snapshot = () => JSON.stringify(['workspaces', 'sync_devices', 'sync_events', 'documents', 'document_chunks']
    .map(name => fixture.sql.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()))
  try {
    fixture.document('parent')
    const before = snapshot()
    const response = await requestSync(fixture, 'push', { mutations: [mutation('documentChunk')] })
    assert.equal(response.status, 500)
    assert.equal(snapshot(), before)
  } finally { await fixture.close() }
})

test('mixed equal-time pages deliver every live child and deletion once with bounded rows', async () => {
  const fixture = await create()
  let pageReads = 0
  try {
    for (let index = 0; index < 225; index += 1) fixture.chunk(`paged:${index}`, 'parent', `body:${index}`, index)
    fixture.sql.exec('DELETE FROM document_chunks WHERE chunk_order % 3 = 0')
    fixture.sql.exec("UPDATE storage_child_state SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    const expected = fixture.sql.prepare('SELECT sync_revision FROM storage_child_state ORDER BY sync_revision').all().map(row => Number(row.sync_revision))
    fixture.beforeRead(query => { if (query.startsWith('WITH candidates')) pageReads += 1 })
    const seen: number[] = []
    let cursor: string | null = null, firstCursor: string | null = null, pages = 0, snapshot: string | null = null
    do {
      const page = await readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, null, [], cursor)
      pages += 1
      assert.ok(pages <= 3, 'bounded input must terminate in three pages')
      const stateRows = [...page.changes.documentChunks, ...page.changes.graphSnapshots, ...page.changes.deletions]
      assert.ok(stateRows.length + page.changes.documents.length <= 100)
      seen.push(...stateRows.map(row => row.syncRevision))
      if (snapshot) assert.equal(page.snapshotAt, snapshot)
      snapshot = page.snapshotAt
      cursor = page.nextPageCursor
      if (!firstCursor) firstCursor = cursor
      assert.equal(page.pageComplete, cursor === null)
    } while (cursor)
    assert.equal(pages, 3)
    assert.equal(pageReads, pages, 'one database statement owns each page selection and payload')
    assert.deepEqual([...seen].sort((a, b) => a - b), expected)
    assert.equal(new Set(seen).size, seen.length)
    const cursorData = JSON.parse(Buffer.from(firstCursor!, 'base64url').toString())
    for (const patch of [
      { lastEntityRank: String(cursorData.lastEntityRank) },
      { lastUpdatedAt: '2026-01-01' },
      { snapshotAt: '2026-02-30T00:00:00.000Z' },
      { since: '' },
    ]) {
      const token = Buffer.from(JSON.stringify({ ...cursorData, ...patch })).toString('base64url')
      await assert.rejects(readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, null, [], token), /cursor/)
    }
    await assert.rejects(readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, null, [], firstCursor, undefined, 'export'), /cursor does not match/)
    const exported = await readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, null, [], null, undefined, 'export')
    assert.deepEqual(exported.changes.deletions, [], 'full exports do not spend their page allowance on historical deletions')
    const bounded = await readAgenticGraphStorageSyncPageRows({ db: fixture.d1, workspaceId: WORKSPACE,
      since: null, snapshotAt: snapshot!, cursor: null, maxRows: 3, maxStoredResultBytes: 2_000 })
    assert.ok(bounded.documents.length + bounded.documentChunks.length + bounded.graphSnapshots.length + bounded.deletions.length <= 3)
    assert.equal(bounded.hasMore, true)
  } finally { await fixture.close() }
})

test('sync rejects ambiguous timestamp boundaries before registering a device', async () => {
  const fixture = await create()
  try {
    const before = data(fixture)
    for (const since of ['', '2026-01-01', '2026-02-30T00:00:00.000Z',
      '2026-01-01T00:00:00Z', '2026-01-01T08:00:00.000+08:00']) {
      const response = await requestSync(fixture, 'pull', { since, knownChunks: [] })
      assert.equal(response.status, 400, since)
      assert.equal(data(fixture), before)
      assert.equal(fixture.sql.prepare('SELECT count(*) AS n FROM sync_devices').get()!.n, 0)
    }
  } finally { await fixture.close() }
})

test('page byte limits reject an oversized first record without returning its content', async () => {
  const fixture = await create()
  try {
    fixture.document('large', 'x'.repeat(5_000))
    await assert.rejects(readAgenticGraphStorageSyncPageRows({ db: fixture.d1, workspaceId: WORKSPACE,
      since: null, snapshotAt: '2099-01-01T00:00:00.000Z', cursor: null, maxRows: 100, maxStoredResultBytes: 1_000 }), /one storage sync row exceeds/)
  } finally { await fixture.close() }
})

test('repeated authorized writes produce bounded crawler pages without truncation', async () => {
  const fixture = await createFixture(syncMigrations)
  const headers = { authorization: `Bearer ${fixture.auth.sessionToken}` }
  try {
    assert.equal(fixture.env.AGENTIC_OS_STORAGE_LOCAL_RUNTIME, 'false')
    for (const start of [0, 50, 100]) {
      const mutations = Array.from({ length: start === 100 ? 1 : 50 }, (_, offset) => {
        const index = start + offset, id = `crawler-document:${index}`, contentMd = `# Crawler document ${index}`
        return { mutationId: `crawler-mutation:${index}`, workspaceId: WORKSPACE, entity: 'document', op: 'upsert',
          recordId: id, baseRevision: null, record: { id, workspaceId: WORKSPACE, canonicalPath: `crawler/${index}.md`,
            title: `Crawler document ${index}`, docType: 'note', lang: 'en-US', graphId: null, sourceKind: 'markdown',
            contentMd, contentHash: hashAgenticGraphStorageContent(contentMd), parserVersion: '1.0.0', revision: 1,
            updatedAtMs: 1_787_200_000_000 + index, deleted: false } }
      })
      assert.equal((await requestSync(fixture, 'push', { mutations, deviceId: 'device:crawler-growth' })).status, 200)
    }
    const crawler = await fixture.request(`/api/storage/source-files/${encodeURIComponent(WORKSPACE)}`, { headers })
    assert.equal(crawler.status, 200)
    assert.match(await crawler.text(), /Crawler document/)
    const nextUrl = /<([^>]+)>; rel="next"/.exec(crawler.headers.get('link') || '')?.[1]
    assert.ok(nextUrl)
    const second = await fixture.request(nextUrl!, { headers })
    assert.equal(second.status, 200)
    assert.equal(/rel="next"/.test(second.headers.get('link') || ''), false)
    assert.match(await second.text(), /Crawler document/)
  } finally { await fixture.close() }
})

test('production push rejects the fifty-first mutation before any write', async () => {
  const fixture = await createFixture(syncMigrations)
  try {
    const tables = ['workspaces', 'sync_devices', 'sync_events', 'documents', 'document_chunks', 'graph_snapshots', 'storage_child_state']
    const snapshot = () => JSON.stringify(tables.map(name => fixture.sql.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()))
    const before = snapshot()
    for (const name of tables) for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
      fixture.sql.exec(`CREATE TEMP TRIGGER reject_${name}_${op} BEFORE ${op} ON ${name}
        BEGIN SELECT RAISE(ABORT, 'unexpected rejected-batch write'); END`)
    }
    const mutations = Array.from({ length: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxPushMutations + 1 }, (_, index) =>
      mutation('graphSnapshot', `graph:${index}`, `graph:${index}`, `document:${index}`))
    const response = await requestSync(fixture, 'push', { mutations, deviceId: 'device:batch-limit' })
    assert.equal(response.status, 413)
    assert.equal(snapshot(), before, 'the authenticated workspace and every sync/content table remain unchanged')
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM sync_devices').get()!.count, 0)
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM graph_snapshots').get()!.count, 0)
  } finally { await fixture.close() }
})

test('production export paginates accumulated workspaces without truncation', async () => {
  const fixture = await createFixture(syncMigrations)
  const headers = { authorization: `Bearer ${fixture.auth.sessionToken}` }
  try {
    for (let index = 0; index <= AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows; index += 1) {
      const value = { id: `document:${index}`, workspace_id: WORKSPACE, canonical_path: `documents/${index}.md`,
        title: `Document ${index}`, doc_type: 'note', lang: 'en-US', graph_id: null, source_kind: 'markdown',
        content_md: `# Document ${index}`, content_hash: `sha256:${index}`, parser_version: '1.0.0', revision: 1,
        deleted: 0, created_at: '2026-08-20T00:00:00.000Z', updated_at: `2026-08-20T00:00:${String(index % 60).padStart(2, '0')}.000Z` }
      const columns = Object.keys(value)
      fixture.sql.prepare(`INSERT INTO documents (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(value))
    }
    const url = `/api/storage/export/${encodeURIComponent(WORKSPACE)}`
    const response = await fixture.request(url, { headers })
    assert.equal(response.status, 200)
    const first = await response.json() as { pageComplete: boolean; nextPageCursor: string | null; documents: Array<{ id: string }> }
    assert.equal(first.pageComplete, false)
    assert.equal(first.documents.length, AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows)
    assert.ok(first.nextPageCursor)
    const next = await fixture.request(`${url}?cursor=${encodeURIComponent(first.nextPageCursor!)}`, { headers })
    assert.equal(next.status, 200)
    const second = await next.json() as typeof first
    assert.equal(second.pageComplete, true)
    assert.equal(second.nextPageCursor, null)
    assert.equal(second.documents.length, 1)
    const ids = [...first.documents, ...second.documents].map(document => document.id)
    assert.equal(new Set(ids).size, AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows + 1)
  } finally { await fixture.close() }
})

test('production export distinguishes generic D1 failures from stored-row overflow', async () => {
  const fixture = await createFixture(syncMigrations)
  const headers = { authorization: `Bearer ${fixture.auth.sessionToken}` }
  const url = `/api/storage/export/${encodeURIComponent(WORKSPACE)}`
  try {
    fixture.document('oversized', 'x'.repeat(AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes))
    fixture.beforeRead(query => { if (query.startsWith('WITH candidates')) throw new Error('D1_ERROR: no such table: documents') })
    const failed = await fixture.request(url, { headers })
    assert.equal(failed.status, 500)
    assert.equal((await failed.json() as { code: string }).code, 'server_error')
    fixture.beforeRead(null)
    const oversized = await fixture.request(url, { headers })
    assert.equal(oversized.status, 413)
    assert.equal((await oversized.json() as { code: string }).code, 'bad_request')
  } finally { await fixture.close() }
})
