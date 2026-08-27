import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import { buildServiceWorkerRevisionAuthoritySource } from '../../canvas/viteServiceWorkerRevisionAuthority.mjs'

const SOURCE_REVISION = '0123456789abcdef0123456789abcdef01234567'
const PREVIOUS_REVISION = 'fedcba9876543210fedcba9876543210fedcba98'
const ORIGIN = 'https://airvio.co'

const evaluateImportedWorker = (source, cacheStorage = {}) => {
  const listeners = new Map()
  const context = {
    AbortController,
    Map,
    Request,
    Response,
    Set,
    TextDecoder,
    URL,
    caches: cacheStorage,
    fetch,
    self: {
      location: { origin: ORIGIN },
      registration: { scope: `${ORIGIN}/agenticgraph/` },
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
    },
  }
  vm.runInNewContext(source, context)
  return listeners
}

const requestAttestation = (listener, type) => {
  let response = null
  listener({
    data: { type },
    ports: [{
      postMessage(message) {
        response = message
      },
    }],
  })
  return response
}

const createCacheStorage = entriesByCache => {
  const entries = new Map(
    Object.entries(entriesByCache).map(([cacheName, cacheEntries]) => [
      cacheName,
      cacheEntries.map(entry => {
        const normalized = typeof entry === 'string'
          ? { path: entry, contentType: 'text/javascript' }
          : entry
        return {
          request: new Request(`${ORIGIN}${normalized.path}`),
          response: new Response('', {
            headers: { 'Content-Type': normalized.contentType },
          }),
        }
      }),
    ]),
  )
  return {
    async keys() {
      return [...entries.keys()]
    },
    async open(cacheName) {
      const cacheEntries = entries.get(cacheName) ?? []
      return {
        async keys() {
          return cacheEntries.map(entry => entry.request)
        },
        async match(request) {
          return cacheEntries.find(entry => entry.request.url === request.url)?.response
        },
        async delete(request) {
          const index = cacheEntries.findIndex(entry => entry.request.url === request.url)
          if (index < 0) return false
          cacheEntries.splice(index, 1)
          return true
        },
      }
    },
    readPaths(cacheName) {
      return (entries.get(cacheName) ?? []).map(entry => {
        const url = new URL(entry.request.url)
        return `${url.pathname}${url.search}`
      })
    },
  }
}

test('generated active-worker authority reports its exact build revision', () => {
  const listeners = evaluateImportedWorker(
    buildServiceWorkerRevisionAuthoritySource(SOURCE_REVISION),
  )
  const response = requestAttestation(
    listeners.get('message'),
    'AG_SERVICE_WORKER_SOURCE_REVISION_REQUEST',
  )
  assert.equal(response?.type, 'AG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE')
  assert.equal(response?.sourceRevision, SOURCE_REVISION)
  assert.deepEqual([...listeners.keys()], ['activate', 'message'])
})

test('generated active-worker authority converges owned caches during activation', async () => {
  const precacheName = `workbox-precache-v2-${ORIGIN}/agenticgraph/`
  const cacheStorage = createCacheStorage({
    [precacheName]: [
      `/agenticgraph/assets/${SOURCE_REVISION}/current.js`,
      `/agenticgraph/assets/${PREVIOUS_REVISION}/old.js`,
    ],
    'kg-assets': [
      `/agenticgraph/assets/${SOURCE_REVISION}/current-lazy.js`,
      `/agenticgraph/assets/${PREVIOUS_REVISION}/old-lazy.js`,
      { path: '/agenticgraph?stale=root', contentType: 'text/html; charset=utf-8' },
      { path: '/agenticgraph/deep-link?stale=nested', contentType: 'application/xhtml+xml' },
    ],
    'kg-static': [
      { path: '/favicon.ico?stale=html', contentType: 'text/html' },
      { path: '/favicon.svg', contentType: 'image/svg+xml' },
    ],
    'singabldr-pwa:static:20260504-2': [
      { path: '/singabldr/', contentType: 'text/html' },
    ],
  })
  const listeners = evaluateImportedWorker(
    buildServiceWorkerRevisionAuthoritySource(SOURCE_REVISION),
    cacheStorage,
  )
  let activationPromise
  listeners.get('activate')({
    waitUntil(promise) {
      activationPromise = promise
    },
  })
  await activationPromise

  assert.deepEqual(cacheStorage.readPaths(precacheName), [
    `/agenticgraph/assets/${SOURCE_REVISION}/current.js`,
  ])
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [
    `/agenticgraph/assets/${SOURCE_REVISION}/current-lazy.js`,
  ])
  assert.deepEqual(cacheStorage.readPaths('kg-static'), ['/favicon.svg'])
  assert.deepEqual(
    cacheStorage.readPaths('singabldr-pwa:static:20260504-2'),
    ['/singabldr/'],
  )
})

test('generated active-worker authority fails closed without its current precache', async () => {
  const stalePath = `/agenticgraph/assets/${PREVIOUS_REVISION}/old-lazy.js`
  const cacheStorage = createCacheStorage({
    [`workbox-precache-v2-${ORIGIN}/agenticgraph/`]: [
      `/agenticgraph/assets/${PREVIOUS_REVISION}/old.js`,
    ],
    'kg-assets': [stalePath],
  })
  const listeners = evaluateImportedWorker(
    buildServiceWorkerRevisionAuthoritySource(SOURCE_REVISION),
    cacheStorage,
  )
  let activationPromise
  listeners.get('activate')({
    waitUntil(promise) {
      activationPromise = promise
    },
  })

  await assert.rejects(activationPromise, /current precache is ready/)
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [stalePath])
})

test('chat worker reports the lifecycle-clean runtime schema without another lifecycle owner', () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../canvas/public/agenticgraph-chat-stream-sw.js'),
    'utf8',
  )
  const listeners = evaluateImportedWorker(source)
  const response = requestAttestation(
    listeners.get('message'),
    'AG_CHAT_STREAM_RUNTIME_ATTEST_REQUEST',
  )
  assert.equal(response?.type, 'AG_CHAT_STREAM_RUNTIME_ATTEST_RESPONSE')
  assert.equal(response?.schema, 'agenticgraph-chat-stream-worker/v2')
  assert.deepEqual([...listeners.keys()], ['message'])
})
