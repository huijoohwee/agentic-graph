import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createFixture as createStorageFixture, createSqliteD1, migrations, syncMigrations, NOW, WORKSPACE, type Fixture } from '../../../../canvas/src/__tests__/helpers/native-agentic-graph-storage-fixture'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS, AGENTIC_OS_STORAGE_SYNC_API_VERSION, hashAgenticGraphStorageContent,
  type AgenticGraphStorageMutation, type AgenticGraphStoragePushResponse, type AgenticGraphStoragePullResponse,
  type KgDocumentRecord } from '../contract'
import { readBoundedPullChangeRows } from '../storageSyncReadRows'
import { readAgenticGraphStoragePullPage } from '../storageSyncReadRuntime'
import { AGENTIC_OS_STORAGE_BROWSER_SESSION_COOKIE_NAME } from '../chatAuth'

const SEGMENT_BYTES = 16_384
const encoder = new TextEncoder()
const createFixture = (migrationNames = syncMigrations) => createStorageFixture(migrationNames)
test('child sync state preserves deletion identity, aliases and atomic revision limits', async () => {
  const fixture = await createFixture(migrations)
  const { sql } = fixture
  const rows = (table: string) => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  const states = (id: string) => sql.prepare('SELECT * FROM storage_child_state WHERE record_id = ? ORDER BY sync_revision').all(id)
  const durable = () => JSON.stringify(['documents', 'document_chunks', 'storage_child_state'].map(rows))
  try {
    fixture.document('state-source'); fixture.document('state-target')
    fixture.chunk('old', 'state-source', 'body')
    sql.prepare('INSERT INTO graph_snapshots VALUES (?, ?, ?, 1, ?, ?, NULL, 1, ?)')
      .run('graph', 'state-source', WORKSPACE, 'hash:graph', '{}', NOW)
    const original = JSON.stringify(['documents', 'document_chunks', 'graph_snapshots'].map(rows))
    sql.exec(readFileSync(new URL('../../../d1/migrations/0020_storage_child_sync_state.sql', import.meta.url), 'utf8'))
    assert.equal(JSON.stringify(['documents', 'document_chunks', 'graph_snapshots'].map(rows)), original)
    assert.equal(rows('storage_child_state').length, 2, 'populated upgrade seeds both live child kinds')
    const unchanged = JSON.stringify(rows('storage_child_state'))
    sql.exec("UPDATE document_chunks SET markdown=markdown WHERE id='old'")
    assert.equal(JSON.stringify(rows('storage_child_state')), unchanged, 'identical updates allocate no revision')
    const originalRevision = Number(states('old')[0]!.sync_revision)
    sql.exec("DELETE FROM document_chunks WHERE id='old'")
    assert.equal(rows('document_chunks').length, 0)
    assert.equal(states('old')[0]!.deleted, 1)
    assert.ok(Number(states('old')[0]!.sync_revision) > originalRevision)
    sql.exec("DELETE FROM graph_snapshots WHERE id='graph'")
    assert.equal(rows('graph_snapshots').length, 0)
    assert.equal(states('graph')[0]!.deleted, 1)
    const retired = states('old')[0]
    sql.prepare('INSERT INTO document_chunks VALUES (?, ?, ?, ?, 0, NULL, ?, 1, ?, ?)')
      .run('new', 'state-source', WORKSPACE, 'old', 'restored', 'hash:new', NOW)
    assert.deepEqual(states('old')[0], retired, 'changed-ID restoration retains the retired binding')
    assert.ok(Number(states('new')[0]!.sync_revision) > Number(retired!.sync_revision))
    sql.exec("UPDATE document_chunks SET document_id='state-target',chunk_key='moved' WHERE id='new'")
    const moved = states('new')
    assert.equal(moved.length, 2)
    assert.equal(moved[0]!.deleted, 1); assert.equal(moved[0]!.document_id, 'state-source')
    assert.equal(moved[1]!.deleted, 0); assert.equal(moved[1]!.document_id, 'state-target')
    assert.ok(Number(moved[1]!.sync_revision) > Number(moved[0]!.sync_revision))
    const beforeFailure = durable()
    sql.exec("CREATE TRIGGER fail_state BEFORE INSERT ON storage_child_state WHEN NEW.record_id='new' BEGIN SELECT RAISE(ABORT,'state-write-failed'); END")
    assert.throws(() => sql.exec("DELETE FROM document_chunks WHERE id='new'"), /state-write-failed/)
    assert.equal(durable(), beforeFailure, 'failed state allocation rolls back child and parent mutations')
    sql.exec('DROP TRIGGER fail_state')
    sql.prepare("UPDATE sqlite_sequence SET seq=? WHERE name='storage_child_state'").run(Number.MAX_SAFE_INTEGER - 1)
    sql.exec("UPDATE document_chunks SET markdown='last-safe' WHERE id='new'")
    assert.equal(Number(states('new').at(-1)!.sync_revision), Number.MAX_SAFE_INTEGER)
    const exhausted = durable()
    assert.throws(() => sql.exec("DELETE FROM document_chunks WHERE id='new'"), /CHECK constraint/)
    assert.equal(durable(), exhausted, 'exhausted revisions cannot partially delete a child')
  } finally { await fixture.close() }
})
test('native D1 batches commit together and reject foreign statements before effects', async () => {
  const database = createSqliteD1([]), foreign = createSqliteD1([])
  try {
    database.sql.exec('CREATE TABLE batch_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    const insert = (id: number, value: string) => database.d1.prepare('INSERT INTO batch_probe VALUES (?, ?)').bind!(id, value)
    await database.d1.batch!([insert(1, 'kept'), insert(2, 'also kept')])
    assert.equal(database.sql.prepare('SELECT count(*) AS n FROM batch_probe').get()?.n, 2)
    await assert.rejects(database.d1.batch!([insert(3, 'rolled back'), insert(1, 'duplicate')]), /UNIQUE/)
    assert.equal(database.sql.prepare('SELECT count(*) AS n FROM batch_probe WHERE id = 3').get()?.n, 0)
    await assert.rejects(database.d1.batch!([insert(4, 'must not start'), foreign.d1.prepare('SELECT 1')]), /from this database/)
    assert.equal(database.sql.prepare('SELECT count(*) AS n FROM batch_probe WHERE id = 4').get()?.n, 0)
    const selected = await database.d1.batch!([database.d1.prepare('SELECT value FROM batch_probe ORDER BY id')])
    assert.deepEqual(selected[0]?.results, [{ value: 'kept' }, { value: 'also kept' }])
  } finally { await database.close(); await foreign.close() }
})
const publishCurrent = async (fixture: Fixture, id: string) => {
  const current = fixture.identity(id)
  const response = await fixture.publication(id, 'publish', {
    expectedRevision: current.revision, expectedContentHash: current.contentHash,
  })
  assert.equal(response.status, 200, await response.clone().text())
  const result = await response.json() as { revision: number; contentHash: string; status: string }
  assert.equal(result.revision, current.revision)
  assert.equal(result.contentHash, current.contentHash)
  assert.equal(result.status, 'published')
}
const withDocumentReader = async <T>(
  response: Response,
  run: (read: () => Promise<ReadableStreamReadResult<Uint8Array>>) => Promise<T>,
): Promise<T> => {
  assert.equal(response.status, 200)
  const reader = response.body!.getReader()
  const failures: unknown[] = []
  let terminal = false
  let value!: T
  try {
    value = await run(async () => {
      try {
        const result = await reader.read()
        if (result.done) terminal = true
        return result
      } catch (error) { terminal = true; throw error }
    })
  } catch (error) { failures.push(error) }
  finally {
    if (!terminal) {
      try { await reader.cancel() } catch (error) { failures.push(error) }
    }
    try { reader.releaseLock() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, failures.map(error => String(error)).join('; '))
  return value
}
const readBytes = (response: Response) => withDocumentReader(response, async read => {
  const parts: Uint8Array[] = []
  for (;;) {
    const part = await read()
    if (part.done) break
    assert.ok(part.value.byteLength > 0 && part.value.byteLength <= SEGMENT_BYTES)
    parts.push(part.value)
  }
  return Buffer.concat(parts)
})

test('explicit cookie publication exposes exact anonymous bytes and real revocation closes reads', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('private', '# Only explicitly published\n\nPaid work, private until approval.')
    assert.equal((await fixture.read('private')).status, 404)
    const privateRead = await fixture.read('private', { authorization: `Bearer ${fixture.auth.sessionToken}` })
    assert.equal(await privateRead.text(), '# Only explicitly published\n\nPaid work, private until approval.')
    await publishCurrent(fixture, 'private')
    assert.equal((await readBytes(await fixture.read('private'))).toString(), '# Only explicitly published\n\nPaid work, private until approval.')
    assert.equal((await fixture.publication('private', 'revoke')).status, 200)
    assert.equal((await fixture.read('private')).status, 404)
    assert.equal(fixture.sql.prepare('select status from document_publications').get()!.status, 'revoked')
  } finally { await fixture.close() }
})

test('browser session private document reads preserve exact bytes and configured membership', async () => {
  const fixture = await createFixture()
  const headers = { cookie: fixture.auth.cookie }
  try {
    const content = '\uFEFFprivate browser document\0with retained bytes'
    fixture.document('browser-private', content)
    assert.equal((await fixture.read('browser-private')).status, 404)
    const response = await fixture.read('browser-private', headers)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal((await readBytes(response)).toString(), content)
    const crawler = await fixture.request(`${AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix}${encodeURIComponent(WORKSPACE)}`, { headers })
    assert.equal(crawler.status, 401, 'crawler cookies do not widen its bearer-only contract')
    const issuer = fixture.env.AGENTIC_OS_STORAGE_ACCESS_ISSUER
    fixture.env.AGENTIC_OS_STORAGE_ACCESS_ISSUER = ''
    assert.equal((await fixture.read('browser-private', headers)).status, 503)
    fixture.env.AGENTIC_OS_STORAGE_ACCESS_ISSUER = issuer
    fixture.sql.prepare("update workspace_memberships set status = 'inactive'").run()
    assert.equal((await fixture.read('browser-private', headers)).status, 403)
    fixture.sql.prepare("update workspace_memberships set status = 'active'").run()
    assert.equal((await fixture.read('browser-private', { ...headers, authorization: 'Bearer invalid-session' })).status, 401)
    assert.equal((await fixture.request(`${AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix}workspace%3Aother/browser-private.md`, { headers })).status, 403)
  } finally { await fixture.close() }
})

test('browser session credential failures cannot fall through to anonymous published reads', async () => {
  const fixture = await createFixture()
  const name = AGENTIC_OS_STORAGE_BROWSER_SESSION_COOKIE_NAME
  try {
    fixture.document('browser-published', 'explicit public document')
    await publishCurrent(fixture, 'browser-published')
    assert.equal((await readBytes(await fixture.read('browser-published'))).toString(), 'explicit public document')
    assert.equal((await readBytes(await fixture.read('browser-published', { cookie: 'theme=dark' }))).toString(), 'explicit public document')
    for (const cookie of [name, `${name}=`, `${name}=short`, `${name} =${'a'.repeat(32)}`, `${name}=${'a'.repeat(32)}!`,
      `${name}=${'a'.repeat(513)}`, `${name}=${'a'.repeat(32)}`, `${name}=bad; ${fixture.auth.cookie}`,
      `${fixture.auth.cookie}; other=${'x'.repeat(8_193)}`, `other=${'x'.repeat(8_193)}; ${fixture.auth.cookie}`]) {
      const response = await fixture.read('browser-published', { cookie })
      assert.equal(response.status, 401, 'a named invalid cookie must remain an authentication attempt')
      assert.doesNotMatch(await response.text(), /explicit public document/)
    }
    fixture.sql.prepare("update auth_sessions set revoked_at = ?").run(NOW)
    assert.equal((await fixture.read('browser-published', { cookie: fixture.auth.cookie })).status, 401)
    const crawler = await fixture.request(`${AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix}${encodeURIComponent(WORKSPACE)}`, { headers: { cookie: fixture.auth.cookie } })
    assert.equal(crawler.status, 401)
    assert.equal((await readBytes(await fixture.read('browser-published'))).toString(), 'explicit public document')
  } finally { await fixture.close() }
})

test('publication cookies require exact origin, active writer and the explicit expected identity pair', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('policy', 'body')
    const body = JSON.stringify({ workspaceId: WORKSPACE, documentId: 'policy', action: 'publish' })
    for (const origin of ['', 'https://foreign.example']) {
      assert.equal((await fixture.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.publications, {
        method: 'POST', headers: { cookie: fixture.auth.cookie, ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body,
      })).status, 403)
    }
    assert.equal((await fixture.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.publications, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    })).status, 401)
    fixture.sql.prepare("update workspace_memberships set role = 'viewer'").run()
    assert.equal((await fixture.publication('policy')).status, 403)
    fixture.sql.prepare("update workspace_memberships set role = 'owner'").run()
    assert.equal((await fixture.publication('policy', 'publish', { expectedRevision: 1 })).status, 400)
    for (const extra of [
      { expectedRevision: 2, expectedContentHash: 'hash:policy:1' },
      { expectedRevision: 1, expectedContentHash: 'wrong' },
      { canonicalPath: 'other.md' },
    ]) assert.equal((await fixture.publication('policy', 'publish', extra)).status, 409)
    assert.equal(fixture.sql.prepare('select count(*) as count from document_publications').get()!.count, 0)
    await publishCurrent(fixture, 'policy')
  } finally { await fixture.close() }
})

test('publication SELECT to commit race cannot publish changed bytes or return a false success', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('race', 'before')
    await publishCurrent(fixture, 'race')
    const prior = fixture.identity('race')
    let raced = false
    fixture.beforeRead(query => {
      if (!/^\s*insert into document_publications/i.test(query)) return
      fixture.beforeRead(null)
      raced = true
      fixture.sql.prepare("update documents set content_md = 'after', content_hash = 'hash:race:2', revision = revision + 1 where id = 'race'").run()
    })
    const response = await fixture.publication('race', 'publish', {
      expectedRevision: prior.revision, expectedContentHash: prior.contentHash,
    })
    assert.equal(raced, true, 'Change occurs after the identity SELECT, immediately before atomic INSERT SELECT')
    assert.equal(response.status, 409)
    assert.equal(fixture.sql.prepare('select document_revision from document_publications').get()!.document_revision, prior.revision)
    assert.equal((await fixture.read('race')).status, 404)
    await publishCurrent(fixture, 'race')
    assert.equal((await readBytes(await fixture.read('race'))).toString(), 'after')
  } finally { await fixture.close() }
})

for (const kind of ['inline', 'chunks'] as const) {
  test(`${kind} publication revocation between metadata probe and first byte yields no content`, async () => {
    const fixture = await createFixture()
    try {
      fixture.document('first-byte', kind === 'inline' ? 'private first bytes' : '')
      if (kind === 'chunks') fixture.chunk('first-byte-part', 'first-byte', 'private first bytes')
      await publishCurrent(fixture, 'first-byte')
      let probed = false
      let revoked = false
      fixture.beforeRead(async query => {
        if (/select id, revision, content_hash, length\(cast\(content_md as blob\)\)/i.test(query)) probed = true
        if (!/substr\(cast\(/i.test(query)) return
        fixture.beforeRead(null)
        assert.equal(probed, true, 'The public document identity was selected before the first payload read')
        assert.equal((await fixture.publication('first-byte', 'revoke')).status, 200)
        revoked = true
      })
      await withDocumentReader(await fixture.read('first-byte'), async read => {
        await assert.rejects(read(), /document changed while it was streaming/)
      })
      assert.equal(revoked, true)
      assert.equal(fixture.segmentSizes.length, 0, 'Revoked first payload query never returns a BLOB cell')
      assert.equal((await fixture.read('first-byte')).status, 404)
    } finally { await fixture.close() }
  })

  test(`${kind} document streams fail at the next SQL segment after real publication revocation`, async () => {
    const fixture = await createFixture()
    try {
      const content = 'r'.repeat(SEGMENT_BYTES * 3)
      fixture.document('revoke', kind === 'inline' ? content : '')
      if (kind === 'chunks') fixture.chunk('revoke-part', 'revoke', content)
      await publishCurrent(fixture, 'revoke')
      let segments = 0
      fixture.beforeRead(async query => {
        if (!/substr\(cast\(/i.test(query) || ++segments !== 2) return
        fixture.beforeRead(null)
        assert.equal((await fixture.publication('revoke', 'revoke')).status, 200)
      })
      const response = await fixture.read('revoke')
      await withDocumentReader(response, async read => {
        const first = await read()
        assert.equal(first.done, false)
        assert.deepEqual(first.value, encoder.encode(content.slice(0, SEGMENT_BYTES)))
        await assert.rejects(read(), /document changed while it was streaming/)
      })
      assert.equal(segments, 2)
      assert.equal((await fixture.read('revoke')).status, 404)
    } finally { await fixture.close() }
  })

  test(`${kind} document streams cannot append later edited bytes to an earlier published identity`, async () => {
    const fixture = await createFixture()
    try {
      const content = 'e'.repeat(SEGMENT_BYTES * 3)
      fixture.document('edit', kind === 'inline' ? content : '')
      if (kind === 'chunks') fixture.chunk('edit-part', 'edit', content)
      await publishCurrent(fixture, 'edit')
      let segments = 0
      fixture.beforeRead(query => {
        if (!/substr\(cast\(/i.test(query) || ++segments !== 2) return
        fixture.beforeRead(null)
        if (kind === 'inline') {
          fixture.sql.prepare("update documents set content_md = ?, content_hash = 'edited', revision = revision + 1 where id = 'edit'").run('replacement')
        } else fixture.sql.prepare("update document_chunks set markdown = 'replacement' where id = 'edit-part'").run()
      })
      await withDocumentReader(await fixture.read('edit'), async read => {
        const first = await read()
        assert.equal(first.done, false)
        assert.deepEqual(first.value, encoder.encode(content.slice(0, SEGMENT_BYTES)))
        await assert.rejects(read(), /document changed while it was streaming/)
      })
      assert.equal(segments, 2)
      assert.equal((await fixture.read('edit')).status, 404)
      await publishCurrent(fixture, 'edit')
      assert.equal((await readBytes(await fixture.read('edit'))).toString(), 'replacement')
    } finally { await fixture.close() }
  })
}

test('chunk visible mutations and moves advance each affected parent once, while metadata and no-ops do not', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('parent-a'); fixture.document('parent-b'); fixture.document('inline-parent', 'authoritative inline')
    const revision = (id: string) => fixture.identity(id).revision
    fixture.chunk('moving', 'parent-a', 'first')
    assert.equal(revision('parent-a'), 2)
    await publishCurrent(fixture, 'parent-a')
    fixture.sql.prepare("update document_chunks set heading = 'metadata', token_estimate = 8, content_hash = 'new-metadata', updated_at = ? where id = 'moving'").run(NOW)
    fixture.sql.prepare("update document_chunks set id = id, document_id = document_id, workspace_id = workspace_id, markdown = markdown, chunk_order = chunk_order where id = 'moving'").run()
    assert.equal(revision('parent-a'), 2)
    assert.equal((await readBytes(await fixture.read('parent-a'))).toString(), 'first')
    fixture.sql.prepare("update document_chunks set markdown = 'second' where id = 'moving'").run()
    assert.equal(revision('parent-a'), 3)
    assert.equal((await fixture.read('parent-a')).status, 404)
    fixture.sql.prepare("update document_chunks set chunk_order = 2, id = 'renamed' where id = 'moving'").run()
    assert.equal(revision('parent-a'), 4, 'One UPDATE affecting both visible fields advances once')
    fixture.sql.prepare("update document_chunks set document_id = 'parent-b' where id = 'renamed'").run()
    assert.equal(revision('parent-a'), 5)
    assert.equal(revision('parent-b'), 2)
    fixture.sql.prepare("delete from document_chunks where id = 'renamed'").run()
    assert.equal(revision('parent-b'), 3)
    fixture.chunk('derived', 'inline-parent', 'derived')
    fixture.sql.prepare("update document_chunks set markdown = 'other derived' where id = 'derived'").run()
    fixture.sql.prepare("delete from document_chunks where id = 'derived'").run()
    assert.equal(revision('inline-parent'), 1, 'Derived chunks never invalidate authoritative inline bytes')
  } finally { await fixture.close() }
})

test('chunk identity rejects stale parent rewind and inline byte changes without advancing revision', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('rewind')
    fixture.chunk('rewind-part', 'rewind', 'original')
    await publishCurrent(fixture, 'rewind')
    const publishedRevision = fixture.identity('rewind').revision
    fixture.sql.prepare("update document_chunks set markdown = 'changed' where id = 'rewind-part'").run()
    assert.throws(() => fixture.sql.prepare("update documents set revision = ? where id = 'rewind'").run(publishedRevision), /document_revision_conflict/)
    assert.throws(() => fixture.sql.prepare("update documents set content_md = 'unversioned' where id = 'rewind'").run(), /document_revision_conflict/)
    assert.throws(() => fixture.sql.prepare("update documents set deleted = 1 where id = 'rewind'").run(), /document_revision_conflict/)
    assert.equal(fixture.identity('rewind').revision, publishedRevision + 1)
    assert.equal((await fixture.read('rewind')).status, 404)
    await publishCurrent(fixture, 'rewind')
    assert.equal((await readBytes(await fixture.read('rewind'))).toString(), 'changed')
  } finally { await fixture.close() }
})

for (const kind of ['inline', 'chunks'] as const) {
  test(`${kind} large Unicode and embedded NUL bytes survive bounded D1 BLOB segments`, async () => {
    const fixture = await createFixture()
    try {
      const large = 'a'.repeat(SEGMENT_BYTES - 1) + '😀\0é끝'.repeat(7000)
      const chunks = ['', large, '', 'tail\0😀']
      const expected = kind === 'inline' ? large : chunks.join('\n\n')
      fixture.document('unicode', kind === 'inline' ? large : '')
      // Equal order values require SQLite binary ID ordering, not localeCompare.
      if (kind === 'chunks') chunks.forEach((part, index) => fixture.chunk(['B', 'a', 'b', 'z'][index], 'unicode', part, 0))
      await publishCurrent(fixture, 'unicode')
      const bytes = await readBytes(await fixture.read('unicode'))
      assert.deepEqual(bytes, Buffer.from(encoder.encode(expected)))
      assert.equal(bytes.toString('utf8'), expected)
      assert.ok(fixture.segmentSizes.length > 4, 'Large input must cross several SQL BLOB reads')
      assert.ok(fixture.segmentSizes.some(size => size === SEGMENT_BYTES))
      assert.ok(fixture.segmentSizes.every(size => size <= SEGMENT_BYTES), 'Every SQL BLOB cell respects the byte bound')
    } finally { await fixture.close() }
  })
}

const syncRequest = async <T>(fixture: Fixture, route: 'push' | 'pull', body: object): Promise<T> => {
  const response = await fixture.request(AGENTIC_OS_STORAGE_ROUTE_PATHS[route], {
    method: 'POST', headers: { authorization: `Bearer ${fixture.auth.sessionToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId: WORKSPACE, deviceId: 'native:offline', ...body }),
  })
  assert.equal(response.status, 200, await response.clone().text())
  return response.json() as Promise<T>
}
const pushRecord = async (fixture: Fixture, entity: AgenticGraphStorageMutation['entity'],
  record: AgenticGraphStorageMutation['record'], baseRevision: number | null = null) =>
  (await syncRequest<AgenticGraphStoragePushResponse>(fixture, 'push', { mutations: [{
    mutationId: `offline:${entity}:${record.id}:${record.updatedAtMs}`, workspaceId: WORKSPACE,
    entity, op: 'upsert', recordId: record.id, baseRevision, record,
  }] })).acknowledgements[0]
const offlineDocument = (id: string, contentMd = ''): KgDocumentRecord => ({
  id, workspaceId: WORKSPACE, canonicalPath: `${id}.md`, title: null, docType: null, lang: null, graphId: null,
  sourceKind: 'markdown', contentMd, contentHash: hashAgenticGraphStorageContent(contentMd), parserVersion: 'fixture-v1',
  revision: 1, deleted: false, updatedAtMs: Date.parse(NOW),
})
const tableRows = (fixture: Fixture, tables = ['documents', 'document_chunks', 'graph_snapshots']) =>
  tables.map(table => fixture.sql.prepare(`select * from ${table} order by rowid`).all())
const sqlNow = (fixture: Fixture) => String(fixture.sql.prepare("select strftime('%Y-%m-%dT%H:%M:%fZ', 'now') as stamp").get()!.stamp)

test('populated source baseline survives publication and chunk-identity migration without rewriting authored rows', async () => {
  const fixture = await createFixture(migrations.slice(0, 2))
  try {
    // This tests the exact in-repo baseline; deployed-schema equality has separate readback evidence.
    fixture.document('upgrade-inline', 'old inline\0😀'); fixture.document('upgrade-chunks')
    fixture.chunk('upgrade-part', 'upgrade-chunks', 'old chunks\0😀')
    fixture.sql.prepare("insert into graph_snapshots values ('upgrade-graph','upgrade-chunks',?,4,'graph-hash','{}','{}',1,?)").run(WORKSPACE, NOW)
    const before = tableRows(fixture)
    for (const name of migrations.slice(2)) fixture.sql.exec(readFileSync(new URL(`../../../d1/migrations/${name}`, import.meta.url), 'utf8'))
    assert.deepEqual(tableRows(fixture), before)
    assert.equal((await fixture.read('upgrade-chunks')).status, 404)
    await publishCurrent(fixture, 'upgrade-inline'); await publishCurrent(fixture, 'upgrade-chunks')
    assert.equal((await readBytes(await fixture.read('upgrade-inline'))).toString(), 'old inline\0😀')
    assert.equal((await readBytes(await fixture.read('upgrade-chunks'))).toString(), 'old chunks\0😀')
    fixture.sql.prepare("update document_chunks set markdown = 'new chunks' where id = 'upgrade-part'").run()
    assert.equal(fixture.identity('upgrade-chunks').revision, 2)
    assert.equal(fixture.identity('upgrade-inline').revision, 1)
    assert.equal((await fixture.read('upgrade-chunks')).status, 404)
    await publishCurrent(fixture, 'upgrade-chunks')
    assert.equal((await readBytes(await fixture.read('upgrade-chunks'))).toString(), 'new chunks')
  } finally { await fixture.close() }
})

test('inclusive pull retains boundary changes that the preceding strict timestamp reader misses', async () => {
  const fixture = await createFixture()
  try {
    const boundary = '2099-01-01T00:00:00.000Z'
    fixture.document('boundary'); fixture.chunk('boundary-part', 'boundary', 'before')
    fixture.sql.prepare("update documents set updated_at = ? where id = 'boundary'").run(boundary)
    fixture.sql.prepare("update document_chunks set markdown = 'after', updated_at = ? where id = 'boundary-part'").run(boundary)
    // Exact prior predicate: migration0019 requires the inclusive reader in the same rollout.
    assert.deepEqual(fixture.sql.prepare('select id from documents where workspace_id = ? and updated_at > ?').all(WORKSPACE, boundary), [])
    const bounded = await readBoundedPullChangeRows(fixture.d1, WORKSPACE, boundary)
    const stateBoundary = String(fixture.sql.prepare("SELECT updated_at FROM storage_child_state WHERE record_id = 'boundary-part'").get()!.updated_at)
    const page = await readAgenticGraphStoragePullPage(fixture.d1, WORKSPACE, stateBoundary, [], null, '2099-01-01T00:00:01.000Z')
    assert.equal(bounded.documents[0].revision, 3)
    assert.equal(bounded.documentChunks[0].markdown, 'after')
    assert.equal(page.changes.documents[0].revision, 3)
    assert.equal(page.changes.documentChunks[0].markdown, 'after')
    assert.equal(page.pageComplete, true)
  } finally { await fixture.close() }
})

test('exhausted chunk revision rejects inserts, edits, deletes and both sides of a move atomically', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('limit'); fixture.document('source')
    fixture.chunk('limit-part', 'limit', 'limit bytes'); fixture.chunk('source-part', 'source', 'source bytes')
    fixture.sql.prepare("update documents set revision = ? where id = 'limit'").run(Number.MAX_SAFE_INTEGER - 1)
    fixture.sql.prepare("update document_chunks set markdown = 'last accepted' where id = 'limit-part'").run()
    assert.equal(fixture.identity('limit').revision, Number.MAX_SAFE_INTEGER)
    await publishCurrent(fixture, 'limit'); await publishCurrent(fixture, 'source')
    const tables = ['documents', 'document_chunks', 'graph_snapshots', 'document_publications']
    const before = tableRows(fixture, tables)
    for (const change of [
      () => fixture.chunk('new-limit-part', 'limit', 'rejected'),
      () => fixture.sql.prepare("update document_chunks set markdown = 'rejected' where id = 'limit-part'").run(),
      () => fixture.sql.prepare("delete from document_chunks where id = 'limit-part'").run(),
      () => fixture.sql.prepare("update document_chunks set document_id = 'limit' where id = 'source-part'").run(),
    ]) {
      assert.throws(change, /document_chunk_revision_exhausted/)
      assert.deepEqual(tableRows(fixture, tables), before)
    }
    assert.equal((await readBytes(await fixture.read('limit'))).toString(), 'last accepted')
    assert.equal((await readBytes(await fixture.read('source'))).toString(), 'source bytes')
  } finally { await fixture.close() }
})

for (const clientStamp of ['2001-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z']) {
  for (const entity of ['document', 'documentChunk', 'graphSnapshot'] as const) {
    test(`${entity} HTTP insert/update/pull uses statement time despite ${clientStamp}; no-op preserves identity`, async () => {
      const fixture = await createFixture()
      try {
        fixture.document('host', 'inline host')
        const id = `offline-${entity}`, updatedAtMs = Date.parse(clientStamp)
        let record: AgenticGraphStorageMutation['record'] = entity === 'document' ? { ...offlineDocument(id, 'one'), updatedAtMs }
          : entity === 'documentChunk' ? { id, documentId: 'host', workspaceId: WORKSPACE, chunkKey: 'chapter', chunkOrder: 0,
            heading: null, markdown: 'one', tokenEstimate: 1, contentHash: hashAgenticGraphStorageContent('one'), updatedAtMs }
            : { id, documentId: 'host', workspaceId: WORKSPACE, graphRevision: 1, graphHash: 'graph-one',
              graphJson: { nodes: ['one'] }, layoutJson: { x: 1 }, derivedFromDocumentRevision: 1, updatedAtMs }
        const table = entity === 'document' ? 'documents' : entity === 'documentChunk' ? 'document_chunks' : 'graph_snapshots'
        const failures: string[] = []
        let childBaseRevision: number | null = null
        for (const phase of ['insert', 'update'] as const) {
          if (phase === 'update') record = 'contentMd' in record ? { ...record, contentMd: 'two', contentHash: hashAgenticGraphStorageContent('two') }
            : 'markdown' in record ? { ...record, markdown: 'two', contentHash: hashAgenticGraphStorageContent('two') }
              : { ...record, graphRevision: 2, graphHash: 'graph-two', graphJson: { nodes: ['two'] }, layoutJson: { x: 2 } }
          const lower = sqlNow(fixture)
          const acknowledged = await pushRecord(fixture, entity, record, childBaseRevision)
          assert.equal(acknowledged.status, 'applied')
          if (entity !== 'document') childBaseRevision = acknowledged.serverRevision
          const stored = fixture.sql.prepare(`select * from ${table} where id = ?`).get(id)!
          const upper = sqlNow(fixture), stamp = String(stored.updated_at)
          if (!(stamp >= lower && stamp <= upper)) failures.push(`${phase}: timestamp must be sampled by the SQLite statement`)
          const pulled = await syncRequest<AgenticGraphStoragePullResponse>(fixture, 'pull', { since: lower, knownChunks: [] })
          const rows = entity === 'document' ? pulled.changes.documents : entity === 'documentChunk' ? pulled.changes.documentChunks : pulled.changes.graphSnapshots
          const delivered = rows.find(row => row.id === id)
          if (!delivered) failures.push(`${phase}: accepted offline content was omitted from HTTP pull`)
          else assert.deepEqual('contentMd' in delivered ? delivered.contentMd : 'markdown' in delivered ? delivered.markdown : delivered.graphJson,
            phase === 'insert' ? entity === 'graphSnapshot' ? { nodes: ['one'] } : 'one' : entity === 'graphSnapshot' ? { nodes: ['two'] } : 'two')
          const before = tableRows(fixture)
          const replay = { ...record, updatedAtMs: Date.parse(clientStamp.startsWith('2001') ? '2098-01-01T00:00:00.000Z' : '2002-01-01T00:00:00.000Z') }
          fixture.sql.exec(`create temp trigger reject_noop_write before update on ${table}
            begin select raise(abort, 'unexpected_noop_write'); end`)
          try {
            assert.equal((await pushRecord(fixture, entity, replay, childBaseRevision)).status, 'applied')
          } finally { fixture.sql.exec('drop trigger reject_noop_write') }
          if (JSON.stringify(tableRows(fixture)) !== JSON.stringify(before)) failures.push(`${phase}: no-op changed stored timestamp, ID or authored rows`)
        }
        assert.deepEqual(failures, [])
      } finally { await fixture.close() }
    })
  }
}

test('HTTP stale base revision conflicts without loss and legacy no-base replay retains the advanced parent', async () => {
  const fixture = await createFixture()
  try {
    const offline = offlineDocument('stale')
    assert.equal((await pushRecord(fixture, 'document', offline)).status, 'applied')
    fixture.chunk('stale-part', 'stale', 'new offline-independent chunk')
    const before = tableRows(fixture), revision = fixture.identity('stale').revision
    const conflict = await pushRecord(fixture, 'document', { ...offline, contentMd: 'unmerged edit', contentHash: hashAgenticGraphStorageContent('unmerged edit') }, 1)
    assert.equal(conflict.status, 'conflict'); assert.equal(conflict.serverRevision, revision)
    assert.deepEqual(tableRows(fixture), before)
    const replay = await pushRecord(fixture, 'document', offline)
    assert.equal(replay.status, 'applied'); assert.equal(replay.serverRevision, revision)
    assert.deepEqual(tableRows(fixture), before, 'No-base replay must retain the parent timestamp and newer chunk bytes')
  } finally { await fixture.close() }
})

test('HTTP valid new digest advances revision when a legacy stored digest matches but authored bytes differ', async () => {
  const fixture = await createFixture()
  try {
    fixture.document('legacy-digest', 'old bytes')
    const record = offlineDocument('legacy-digest', 'new bytes')
    fixture.sql.prepare("update documents set content_hash = ? where id = 'legacy-digest'").run(record.contentHash)
    await publishCurrent(fixture, 'legacy-digest')
    const applied = await pushRecord(fixture, 'document', record, 1)
    assert.equal(applied.status, 'applied'); assert.equal(applied.serverRevision, 2)
    assert.equal(fixture.identity('legacy-digest').revision, 2)
    assert.equal((await fixture.read('legacy-digest')).status, 404)
    assert.equal(await (await fixture.read('legacy-digest', { authorization: `Bearer ${fixture.auth.sessionToken}` })).text(), 'new bytes')
    await publishCurrent(fixture, 'legacy-digest')
    assert.equal((await readBytes(await fixture.read('legacy-digest'))).toString(), 'new bytes')
  } finally { await fixture.close() }
})
