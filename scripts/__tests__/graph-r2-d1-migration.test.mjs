import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { inventoryR2Bucket, requireEmptyR2Inventory } from '../graph-r2-d1-migration.mjs'

test('R2 migration inventory reads every page and returns only a deterministic aggregate receipt', async () => {
  const requested = []
  const pages = [
    { result: [{ key: 'z/file.png', size: 9, etag: 'z', last_modified: '2026-01-01T00:00:00Z' }],
      result_info: { is_truncated: true, cursor: 'next' } },
    { result: [{ key: 'a/file.png', size: 4, etag: 'a' }], result_info: { is_truncated: false } },
  ]
  const inventory = await inventoryR2Bucket({ accountId: 'account', bucketName: 'bucket', token: 'private',
    fetchImpl: async (url, init) => {
      requested.push({ url: String(url), authorization: init.headers.authorization })
      return Response.json({ success: true, ...pages.shift() })
    } })
  assert.equal(inventory.objectCount, 2)
  assert.equal(inventory.totalBytes, 13)
  assert.match(inventory.inventoryDigest, /^[a-f0-9]{64}$/)
  assert.equal(requested.length, 2)
  assert.equal(new URL(requested[1].url).searchParams.get('cursor'), 'next')
  assert.equal(requested.every(item => item.authorization === 'Bearer private'), true)
  assert.equal(JSON.stringify(inventory).includes('file.png'), false)
})

test('empty inventory receipt is accepted and any existing object blocks cutover', () => {
  const receipt = requireEmptyR2Inventory({ accountId: 'account', bucketName: 'bucket',
    objectCount: 0, totalBytes: 0, inventoryDigest: 'a'.repeat(64) }, { accountId: 'account', bucketName: 'bucket' })
  assert.equal(receipt.disposition, 'already-empty-no-copy-required')
  assert.throws(() => requireEmptyR2Inventory({ ...receipt, objectCount: 1, totalBytes: 9 }, { accountId: 'account', bucketName: 'bucket' }), /non-empty/)
  assert.throws(() => requireEmptyR2Inventory({ ...receipt }, { accountId: 'other', bucketName: 'bucket' }), /non-empty/)
})

test('R2 inventory fails closed when pagination or object metadata cannot be verified', async () => {
  await assert.rejects(inventoryR2Bucket({ accountId: 'account', bucketName: 'bucket', token: 'private',
    fetchImpl: async () => Response.json({ success: true, result: [], result_info: { is_truncated: true } }) }), /cursor/)
  await assert.rejects(inventoryR2Bucket({ accountId: 'account', bucketName: 'bucket', token: 'private',
    fetchImpl: async () => Response.json({ success: true, result: [{ key: 'missing-size', etag: 'x' }], result_info: { is_truncated: false } }) }), /metadata/)
})

test('D1 blob migration enforces the fixed quota and 1 MiB chunk ceiling in SQLite', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(new URL('../../cloudflare/d1/migrations/0023_graph_d1_blob_store.sql', import.meta.url), 'utf8'))
  const insert = db.prepare(`INSERT INTO agentic_graph_d1_blob_objects
    (object_key, content_type, content_hash, custom_metadata_json, size_bytes, etag, updated_at)
    VALUES (?, 'application/octet-stream', NULL, '{}', ?, ?, '2026-11-26T00:00:00.000Z')`)
  for (let index = 0; index < 4; index += 1) insert.run(`key-${index}`, 16777216, 'a'.repeat(64))
  assert.equal(db.prepare('SELECT used_bytes FROM agentic_graph_d1_blob_quota WHERE id = 1').get().used_bytes, 67108864)
  assert.throws(() => insert.run('over-quota', 1, 'b'.repeat(64)), /graph_d1_blob_quota_exceeded/)
  db.prepare('DELETE FROM agentic_graph_d1_blob_objects WHERE object_key = ?').run('key-0')
  assert.equal(db.prepare('SELECT used_bytes FROM agentic_graph_d1_blob_quota WHERE id = 1').get().used_bytes, 50331648)
  assert.throws(() => db.prepare(`INSERT INTO agentic_graph_d1_blob_chunks (object_key, chunk_index, body)
    VALUES ('key-1', 0, ?)`).run(new Uint8Array(1048577)), /CHECK constraint failed/)
  db.close()
})
