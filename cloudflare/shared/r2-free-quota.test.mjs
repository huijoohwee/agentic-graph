import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createZeroCostR2Binding } from './r2-cost-gate.mjs'
import { createR2FreeQuotaVerifier, R2_FREE_QUOTA_LIMITS } from './r2-free-quota.mjs'

const migration = readFileSync(new URL('../d1/migrations/0022_agentic_graph_r2_free_quota.sql', import.meta.url), 'utf8')

function databaseFixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(migration)
  return {
    prepare(sql) {
      return { bind(...args) { return { first: async () => sqlite.prepare(sql).get(...args) ?? null } } }
    },
    read() { return sqlite.prepare('SELECT * FROM agentic_graph_r2_free_quota').get() },
  }
}

function bucketFixture(calls = []) {
  return {
    head: async key => { calls.push(['head', key]); return { storageClass: 'Standard' } },
    get: async key => { calls.push(['get', key]); return null },
    put: async (key, body, options) => {
      if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) await new Response(body).arrayBuffer()
      calls.push(['put', key, body, options])
      return { key }
    },
  }
}

test('D1-backed R2 quota reservations permit bounded Free allocation usage', async () => {
  const database = databaseFixture()
  const calls = []
  const bucket = bucketFixture(calls)
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket', database,
  })

  await guarded.put('a', 'bytes')
  await guarded.get('a')

  assert.equal(database.read().class_a_used, 1)
  assert.equal(database.read().class_b_used, 3)
  assert.equal(database.read().uploaded_bytes_lifetime, 5)
  assert.equal(database.read().daily_reservations, 2)
  assert.deepEqual(calls.map(([method]) => method), ['head', 'put', 'head', 'get'])
})

test('R2 quota reservation denies class, byte, and daily limits before the provider call', async () => {
  const database = databaseFixture()
  const calls = []
  const verifier = createR2FreeQuotaVerifier(database, {
    limits: { ...R2_FREE_QUOTA_LIMITS, classA: 1, uploadedBytesLifetime: 5, reservationsPerDay: 2 },
  })
  const guarded = createZeroCostR2Binding(bucketFixture(calls), {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })

  await guarded.put('a', 'bytes')
  await assert.rejects(guarded.put('b', 'x'), /allocation is exhausted/u)
  await guarded.get('a')
  await assert.rejects(guarded.get('a'), /allocation is exhausted/u)

  assert.deepEqual(calls.map(([method]) => method), ['head', 'put', 'head', 'get'])
  assert.equal(database.read().class_a_used, 1)
  assert.equal(database.read().uploaded_bytes_lifetime, 5)
})

test('concurrent R2 calls cannot reserve the same remaining quota', async () => {
  const database = databaseFixture()
  const calls = []
  const verifier = createR2FreeQuotaVerifier(database, {
    limits: { ...R2_FREE_QUOTA_LIMITS, classA: 1, reservationsPerDay: 1 },
  })
  const guarded = createZeroCostR2Binding(bucketFixture(calls), {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })

  const results = await Promise.allSettled([guarded.put('a', 'x'), guarded.put('b', 'y')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  assert.equal(calls.length, 2)
  assert.equal(database.read().class_a_used, 1)
})

test('stream uploads reserve their maximum, enforce the stream bound, and release unused bytes', async () => {
  const database = databaseFixture()
  const calls = []
  const guarded = createZeroCostR2Binding(bucketFixture(calls), {
    bindingName: 'MEDIA', resourceName: 'media-bucket', database, maxStreamBytes: 4,
  })
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() } })
  await guarded.put('stream', body)
  assert.equal(database.read().uploaded_bytes_lifetime, 3)
  assert.equal(calls[1][3].storageClass, 'Standard')

  const tooLarge = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4, 5])); controller.close() } })
  await assert.rejects(guarded.put('too-large', tooLarge), /bounded Free quota stream size/u)
  assert.equal(database.read().uploaded_bytes_lifetime, 7)
})

test('same-scope concurrent streams release each reservation and month rollover preserves lifetime bytes', async () => {
  const database = databaseFixture()
  const calls = []
  const verifier = createR2FreeQuotaVerifier(database, { maxStreamBytes: 4 })
  const guarded = createZeroCostR2Binding(bucketFixture(calls), {
    bindingName: 'MEDIA', resourceName: 'media-bucket', verifyProviderCostEvidence: verifier,
  })
  const stream = size => new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(size)); controller.close() },
  })

  await Promise.all([guarded.put('same-key', stream(2)), guarded.put('same-key', stream(3))])
  assert.equal(database.read().uploaded_bytes_lifetime, 5)
  assert.equal(database.read().class_a_used, 2)
  assert.equal(database.read().class_b_used, 2)

  const rollover = createR2FreeQuotaVerifier(database, { now: () => Date.parse('2026-02-01T00:00:00Z') })
  await rollover.verify({ scopeDigest: 'scope', requestDigest: 'request' }, {
    method: 'get', args: ['same-key'], key: 'same-key',
  })
  assert.equal(database.read().month_key, '2026-02')
  assert.equal(database.read().class_a_used, 0)
  assert.equal(database.read().class_b_used, 2)
  assert.equal(database.read().uploaded_bytes_lifetime, 5)
})

test('Infrequent Access requests and objects are denied before data operations', async () => {
  const database = databaseFixture()
  const calls = []
  const bucket = bucketFixture(calls)
  bucket.head = async key => { calls.push(['head', key]); return { storageClass: 'InfrequentAccess' } }
  const guarded = createZeroCostR2Binding(bucket, {
    bindingName: 'MEDIA', resourceName: 'media-bucket', database,
  })

  await assert.rejects(guarded.put('new', 'x', { storageClass: 'InfrequentAccess' }), /Infrequent Access/u)
  await assert.rejects(guarded.get('old'), /not verified as Standard/u)
  assert.deepEqual(calls.map(([method]) => method), ['head'])
  assert.equal(database.read().class_a_used, 0)
  assert.equal(database.read().uploaded_bytes_lifetime, 0)
})
