import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installServiceWorkerCacheRevisionOwner,
  pruneStaleServiceWorkerCacheEntries,
  readActiveServiceWorkerSourceRevision,
} from '../lib/pwa/serviceWorkerCacheRevisionOwner'

const CURRENT_REVISION = 'b'.repeat(40)
const PREVIOUS_REVISION = 'a'.repeat(40)
const NEXT_REVISION = 'c'.repeat(40)
const ORIGIN = 'https://airvio.co'

type CacheEntry = string | { path: string; contentType: string | null }

const createCacheStorage = (entriesByCache: Record<string, CacheEntry[]>) => {
  const entries = new Map(
    Object.entries(entriesByCache).map(([cacheName, cacheEntries]) => [
      cacheName,
      cacheEntries.map(entry => {
        const normalized = typeof entry === 'string'
          ? { path: entry, contentType: 'text/javascript' }
          : entry
        return {
          request: new Request(`${ORIGIN}${normalized.path}`),
          response: normalized.contentType === null
            ? undefined
            : new Response('', { headers: { 'Content-Type': normalized.contentType } }),
        }
      }),
    ]),
  )
  return {
    async keys() {
      return [...entries.keys()]
    },
    async open(cacheName: string) {
      const cacheEntries = entries.get(cacheName) ?? []
      return {
        async keys() {
          return cacheEntries.map(entry => entry.request)
        },
        async match(request: RequestInfo | URL) {
          const requestUrl = request instanceof Request ? request.url : new Request(request).url
          return cacheEntries.find(entry => entry.request.url === requestUrl)?.response
        },
        async delete(request: RequestInfo | URL) {
          const requestUrl = request instanceof Request ? request.url : new Request(request).url
          const index = cacheEntries.findIndex(entry => entry.request.url === requestUrl)
          if (index < 0) return false
          cacheEntries.splice(index, 1)
          return true
        },
      }
    },
    readPaths(cacheName: string) {
      return (entries.get(cacheName) ?? []).map(entry => {
        const url = new URL(entry.request.url)
        return `${url.pathname}${url.search}`
      })
    },
  }
}

const workerRevisions = new WeakMap<object, string>()
const createWorker = (revision: string) => {
  const worker = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage() {
      throw new Error('test worker postMessage should be replaced by readActiveRevision')
    },
  })
  workerRevisions.set(worker, revision)
  return worker
}

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0))
}

test('cache revision owner removes stale assets and every scoped HTML variant', async () => {
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [
      `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
      {
        path: `/knowgrph/assets/${CURRENT_REVISION}/poisoned-module.js`,
        contentType: 'text/html; charset=utf-8',
      },
      `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
      { path: '/knowgrph/index.html', contentType: 'text/html' },
      '/knowgrph/manifest.webmanifest',
    ],
    'kg-assets': [
      `/knowgrph/assets/${CURRENT_REVISION}/current-lazy.js`,
      `/knowgrph/assets/${PREVIOUS_REVISION}/old-lazy.js`,
      { path: '/knowgrph?stale=root', contentType: 'TEXT/HTML; charset=utf-8' },
      { path: '/knowgrph/deep-link?stale=nested', contentType: 'application/xhtml+xml; charset=utf-8' },
      { path: '/knowgrph/data', contentType: 'application/json' },
      '/unrelated/app.js',
    ],
  })

  const result = await pruneStaleServiceWorkerCacheEntries({
    cacheStorage,
    origin: ORIGIN,
    sourceRevision: CURRENT_REVISION,
  })

  assert.equal(result.ready, true)
  assert.deepEqual(result.deletedPaths, [
    '/knowgrph',
    `/knowgrph/assets/${PREVIOUS_REVISION}/old-lazy.js`,
    `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
    `/knowgrph/assets/${CURRENT_REVISION}/poisoned-module.js`,
    '/knowgrph/deep-link',
    '/knowgrph/index.html',
  ])
  assert.deepEqual(cacheStorage.readPaths('workbox-precache-v2'), [
    `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
    '/knowgrph/manifest.webmanifest',
  ])
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [
    `/knowgrph/assets/${CURRENT_REVISION}/current-lazy.js`,
    '/knowgrph/data',
    '/unrelated/app.js',
  ])
})

test('cache revision owner removes owned HTML poison without erasing sibling app caches', async () => {
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [
      `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
    ],
    'kg-static': [
      { path: '/favicon.ico', contentType: 'text/html; charset=utf-8' },
      { path: '/favicon.svg', contentType: 'image/svg+xml' },
    ],
    'singabldr-pwa:static:20260504-2': [
      { path: '/singabldr/', contentType: 'text/html; charset=utf-8' },
      { path: '/singabldr/index.html', contentType: 'text/html; charset=utf-8' },
    ],
  })

  const result = await pruneStaleServiceWorkerCacheEntries({
    cacheStorage,
    origin: ORIGIN,
    sourceRevision: CURRENT_REVISION,
  })

  assert.deepEqual(result, { ready: true, deletedPaths: ['/favicon.ico'] })
  assert.deepEqual(cacheStorage.readPaths('kg-static'), ['/favicon.svg'])
  assert.deepEqual(cacheStorage.readPaths('singabldr-pwa:static:20260504-2'), [
    '/singabldr/',
    '/singabldr/index.html',
  ])
})

test('cache revision owner does not prune while the active revision precache is unavailable', async () => {
  const stalePath = `/knowgrph/assets/${PREVIOUS_REVISION}/old-lazy.js`
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [`/knowgrph/assets/${PREVIOUS_REVISION}/old.js`],
    'kg-assets': [stalePath],
  })

  const result = await pruneStaleServiceWorkerCacheEntries({
    cacheStorage,
    origin: ORIGIN,
    sourceRevision: CURRENT_REVISION,
  })

  assert.deepEqual(result, { ready: false, deletedPaths: [] })
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [stalePath])
})

test('cache revision owner does not treat a missing current precache response as admission', async () => {
  const stalePath = `/knowgrph/assets/${PREVIOUS_REVISION}/old-lazy.js`
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [{
      path: `/knowgrph/assets/${CURRENT_REVISION}/missing.js`,
      contentType: null,
    }],
    'kg-assets': [stalePath],
  })

  const result = await pruneStaleServiceWorkerCacheEntries({
    cacheStorage,
    origin: ORIGIN,
    sourceRevision: CURRENT_REVISION,
  })

  assert.deepEqual(result, { ready: false, deletedPaths: [] })
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [stalePath])
})

test('cache revision owner waits for the attested worker to activate before pruning', async () => {
  const currentWorker = createWorker(CURRENT_REVISION)
  const previousWorker = createWorker(PREVIOUS_REVISION)
  const controllerTarget = Object.assign(new EventTarget(), { controller: previousWorker })
  const registration = {
    active: previousWorker,
    installing: currentWorker,
    waiting: null,
  }
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [
      `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
      `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
    ],
  })
  const owner = installServiceWorkerCacheRevisionOwner({
    cacheStorage,
    controllerTarget,
    registration,
    origin: ORIGIN,
    readActiveRevision: async worker => workerRevisions.get(worker) ?? '',
  })

  await flushPromises()
  assert.deepEqual(cacheStorage.readPaths('workbox-precache-v2'), [
    `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
    `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
  ])

  registration.installing = null
  registration.active = currentWorker
  controllerTarget.controller = currentWorker
  controllerTarget.dispatchEvent(new Event('controllerchange'))
  await flushPromises()
  assert.deepEqual(cacheStorage.readPaths('workbox-precache-v2'), [
    `/knowgrph/assets/${CURRENT_REVISION}/index.js`,
  ])
  owner.dispose()
})

test('cache revision owner retries when worker activation outlives a missed controller change', async () => {
  const previousWorker = createWorker(PREVIOUS_REVISION)
  const currentWorker = createWorker(CURRENT_REVISION)
  currentWorker.state = 'installing'
  const controllerTarget = Object.assign(new EventTarget(), { controller: previousWorker })
  const registration = {
    active: previousWorker,
    installing: currentWorker,
    waiting: null,
  }
  const stalePath = `/knowgrph/assets/${PREVIOUS_REVISION}/old-lazy.js`
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [
      `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
      `/knowgrph/assets/${CURRENT_REVISION}/current.js`,
    ],
    'kg-assets': [stalePath],
  })
  const owner = installServiceWorkerCacheRevisionOwner({
    cacheStorage,
    controllerTarget,
    registration,
    origin: ORIGIN,
    readActiveRevision: async worker => workerRevisions.get(worker) ?? '',
  })

  await flushPromises()
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [stalePath])

  registration.installing = null
  registration.active = currentWorker
  controllerTarget.controller = currentWorker
  currentWorker.state = 'activated'
  currentWorker.dispatchEvent(new Event('statechange'))
  await flushPromises()

  assert.deepEqual(cacheStorage.readPaths('workbox-precache-v2'), [
    `/knowgrph/assets/${CURRENT_REVISION}/current.js`,
  ])
  assert.deepEqual(cacheStorage.readPaths('kg-assets'), [])
  owner.dispose()
})

test('cache revision owner queues controller changes that arrive during an attestation', async () => {
  const currentWorker = createWorker(CURRENT_REVISION)
  const nextWorker = createWorker(NEXT_REVISION)
  const controllerTarget = Object.assign(new EventTarget(), { controller: currentWorker })
  const registration = { active: currentWorker, installing: null, waiting: null }
  const cacheStorage = createCacheStorage({
    'workbox-precache-v2': [
      `/knowgrph/assets/${PREVIOUS_REVISION}/old.js`,
      `/knowgrph/assets/${CURRENT_REVISION}/current.js`,
      `/knowgrph/assets/${NEXT_REVISION}/next.js`,
    ],
  })
  let releaseFirstAttestation = () => undefined
  let attestationCount = 0
  const firstAttestation = new Promise<void>(resolve => {
    releaseFirstAttestation = resolve
  })
  const owner = installServiceWorkerCacheRevisionOwner({
    cacheStorage,
    controllerTarget,
    registration,
    origin: ORIGIN,
    readActiveRevision: async worker => {
      attestationCount += 1
      if (attestationCount === 1) await firstAttestation
      return workerRevisions.get(worker) ?? ''
    },
  })

  registration.active = nextWorker
  controllerTarget.controller = nextWorker
  controllerTarget.dispatchEvent(new Event('controllerchange'))
  releaseFirstAttestation()
  await flushPromises()
  await flushPromises()

  assert.equal(attestationCount, 2)
  assert.deepEqual(cacheStorage.readPaths('workbox-precache-v2'), [
    `/knowgrph/assets/${NEXT_REVISION}/next.js`,
  ])
  owner.dispose()
})

test('active service worker revision attestation validates the response and closes both ports', async () => {
  let requestType = ''
  let closedPortCount = 0
  const port1 = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    start() {},
    close() {
      closedPortCount += 1
    },
  }
  const port2 = {
    onmessage: null,
    onmessageerror: null,
    start() {},
    close() {
      closedPortCount += 1
    },
  }
  const revision = await readActiveServiceWorkerSourceRevision({
    state: 'activated',
    postMessage(message) {
      requestType = String((message as { type?: string }).type || '')
      queueMicrotask(() => port1.onmessage?.({
        data: {
          type: 'KG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE',
          sourceRevision: CURRENT_REVISION,
        },
      } as MessageEvent))
    },
  }, {
    createMessageChannel: () => ({ port1, port2 }) as never,
    timeoutMs: 50,
  })

  assert.equal(requestType, 'KG_SERVICE_WORKER_SOURCE_REVISION_REQUEST')
  assert.equal(revision, CURRENT_REVISION)
  assert.equal(closedPortCount, 2)
})

test('active service worker revision attestation rejects malformed and timed-out responses', async () => {
  const makeChannel = () => {
    const port1 = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onmessageerror: null as ((event: MessageEvent) => void) | null,
      start() {},
      close() {},
    }
    return {
      channel: {
        port1,
        port2: { onmessage: null, onmessageerror: null, start() {}, close() {} },
      },
      port1,
    }
  }

  const malformed = makeChannel()
  await assert.rejects(
    readActiveServiceWorkerSourceRevision({
      state: 'activated',
      postMessage() {
        queueMicrotask(() => malformed.port1.onmessage?.({
          data: { type: 'KG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE', sourceRevision: 'latest' },
        } as MessageEvent))
      },
    }, {
      createMessageChannel: () => malformed.channel as never,
      timeoutMs: 50,
    }),
    /invalid source revision/,
  )

  const timedOut = makeChannel()
  await assert.rejects(
    readActiveServiceWorkerSourceRevision({
      state: 'activated',
      postMessage() {},
    }, {
      createMessageChannel: () => timedOut.channel as never,
      timeoutMs: 1,
    }),
    /timed out/,
  )
})
