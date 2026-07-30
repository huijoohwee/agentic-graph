import assert from 'node:assert/strict'
import test from 'node:test'

import { listUploadedMediaFromKnowgrphStorage } from '@/lib/storage/uploadedMediaStorage'

test('uploaded media listing stays local while runtime storage sync is disabled', async t => {
  const previousRuntimeSync = process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED
  delete process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED
  t.after(() => {
    if (typeof previousRuntimeSync === 'string') {
      process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    } else {
      delete process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED
    }
  })

  let fetchCount = 0
  const items = await listUploadedMediaFromKnowgrphStorage({
    workspaceId: 'kgws:flight-offline',
    fetchImpl: async () => {
      fetchCount += 1
      return new Response(null, { status: 500 })
    },
  })

  assert.deepEqual(items, [])
  assert.equal(fetchCount, 0)
})

test('uploaded media listing uses the media-assets route when runtime storage sync is enabled', async t => {
  const previousRuntimeSync = process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED
  process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
  t.after(() => {
    if (typeof previousRuntimeSync === 'string') {
      process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    } else {
      delete process.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED
    }
  })

  const requests: Array<{ method: string; url: string }> = []
  const items = await listUploadedMediaFromKnowgrphStorage({
    workspaceId: 'kgws:flight storage',
    limit: 7,
    fetchImpl: async (input, init) => {
      requests.push({
        method: String(init?.method || 'GET'),
        url: String(input),
      })
      return new Response(JSON.stringify({
        ok: true,
        artifacts: [],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(items, [])
  assert.deepEqual(requests, [{
    method: 'GET',
    url: 'https://example.invalid/api/storage/media/assets?workspaceId=kgws%3Aflight%20storage&limit=7',
  }])
})
