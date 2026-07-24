import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installServiceWorkerRevisionUpdateOwner,
  SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS,
} from '../lib/pwa/serviceWorkerRevisionUpdateOwner'
import { registerCanonicalServiceWorker } from '../lib/pwa/serviceWorkerRegistrationOwner'

const flushPromises = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0))
}

test('service worker revision owner updates on registration and bounded recovery events', async () => {
  const windowTarget = new EventTarget()
  const documentTarget = Object.assign(new EventTarget(), {
    visibilityState: 'hidden' as DocumentVisibilityState,
  })
  let now = 0
  let updateCount = 0
  let settledCount = 0
  const dispose = installServiceWorkerRevisionUpdateOwner({
    registration: {
      async update() {
        updateCount += 1
      },
    },
    documentTarget,
    windowTarget,
    now: () => now,
    onUpdateSettled() {
      settledCount += 1
    },
  })

  await flushPromises()
  assert.equal(updateCount, 1, 'registration must check the canonical worker immediately')

  windowTarget.dispatchEvent(new Event('online'))
  await flushPromises()
  assert.equal(updateCount, 1, 'online events inside the bounded interval must not duplicate checks')

  now = SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS
  windowTarget.dispatchEvent(new Event('online'))
  await flushPromises()
  assert.equal(updateCount, 2, 'online recovery must recheck after the bounded interval')

  now += SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS
  documentTarget.visibilityState = 'visible'
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  assert.equal(updateCount, 3, 'foreground recovery must recheck after the bounded interval')

  dispose()
  now += SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS
  windowTarget.dispatchEvent(new Event('online'))
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  assert.equal(updateCount, 3, 'disposed owners must release all update triggers')
  assert.equal(settledCount, 3, 'each completed update check must release revision cleanup')
})

test('service worker revision owner retries promptly after an offline registration failure', async () => {
  const windowTarget = new EventTarget()
  const documentTarget = Object.assign(new EventTarget(), {
    visibilityState: 'hidden' as DocumentVisibilityState,
  })
  let updateCount = 0
  let errorCount = 0
  let settledCount = 0
  installServiceWorkerRevisionUpdateOwner({
    registration: {
      async update() {
        updateCount += 1
        if (updateCount === 1) throw new Error('offline')
      },
    },
    documentTarget,
    windowTarget,
    now: () => 0,
    onError() {
      errorCount += 1
    },
    onUpdateSettled() {
      settledCount += 1
    },
  })

  await flushPromises()
  assert.equal(updateCount, 1)
  assert.equal(errorCount, 1)

  windowTarget.dispatchEvent(new Event('online'))
  await flushPromises()
  assert.equal(updateCount, 2, 'online recovery must not inherit the throttle from a failed update')
  assert.equal(settledCount, 2, 'failed and successful checks must both release stable active-worker cleanup')
})

test('service worker revision owner retries until the running build revision is active', async () => {
  const windowTarget = new EventTarget()
  const documentTarget = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  })
  let updateCount = 0
  let activeRevisionMatches = false
  let settledCount = 0
  const dispose = installServiceWorkerRevisionUpdateOwner({
    registration: {
      async update() {
        updateCount += 1
        if (updateCount === 2) activeRevisionMatches = true
      },
    },
    documentTarget,
    windowTarget,
    convergenceRetryDelaysMs: [0],
    async isExpectedRevisionActive() {
      return activeRevisionMatches
    },
    onUpdateSettled() {
      settledCount += 1
    },
  })

  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(updateCount, 2, 'a stale active worker must receive a bounded forced recheck')
  assert.equal(settledCount, 2)

  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(updateCount, 2, 'attested convergence must stop the retry sequence')
  dispose()
})

test('canonical service worker registration bypasses caches for rapid release convergence', async () => {
  const previousController = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage() {},
  })
  const nextController = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage() {},
  })
  const serviceWorkerTarget = Object.assign(new EventTarget(), {
    controller: previousController,
    registerCalls: [] as Array<{ scriptUrl: string; options: RegistrationOptions }>,
    async register(scriptUrl: string, options: RegistrationOptions) {
      this.registerCalls.push({ scriptUrl, options })
      return {
        active: previousController,
        installing: null,
        waiting: null,
        async update() {},
      }
    },
  })
  let reloadCount = 0
  let registeredCount = 0
  const owner = await registerCanonicalServiceWorker({
    serviceWorkerTarget,
    reload() {
      reloadCount += 1
    },
    onRegistered() {
      registeredCount += 1
    },
  })

  assert.deepEqual(serviceWorkerTarget.registerCalls, [{
    scriptUrl: '/knowgrph/sw.js',
    options: {
      scope: '/knowgrph/',
      type: 'classic',
      updateViaCache: 'none',
    },
  }], 'registration must bypass the HTTP cache for the worker and revision-bound imports')
  assert.equal(registeredCount, 1)

  serviceWorkerTarget.controller = nextController
  serviceWorkerTarget.dispatchEvent(new Event('controllerchange'))
  serviceWorkerTarget.dispatchEvent(new Event('controllerchange'))
  assert.equal(reloadCount, 1, 'a replacement controller must reload the returning-user document once')

  owner.dispose()
  serviceWorkerTarget.controller = previousController
  serviceWorkerTarget.dispatchEvent(new Event('controllerchange'))
  assert.equal(reloadCount, 1, 'disposed registration owners must release controller listeners')
})

test('canonical service worker registration reports a first install without reloading', async () => {
  const installingWorker = Object.assign(new EventTarget(), {
    state: 'installing',
    postMessage() {},
  })
  const serviceWorkerTarget = Object.assign(new EventTarget(), {
    controller: null as (EventTarget & {
      state: string
      postMessage(message: unknown, transfer: Transferable[]): void
    }) | null,
    async register() {
      return {
        active: null,
        installing: installingWorker,
        waiting: null,
        async update() {},
      }
    },
  })
  let offlineReadyCount = 0
  let reloadCount = 0
  await registerCanonicalServiceWorker({
    serviceWorkerTarget,
    onOfflineReady() {
      offlineReadyCount += 1
    },
    reload() {
      reloadCount += 1
    },
  })

  installingWorker.state = 'installed'
  installingWorker.dispatchEvent(new Event('statechange'))
  serviceWorkerTarget.controller = Object.assign(new EventTarget(), {
    state: 'activated',
    postMessage() {},
  })
  serviceWorkerTarget.dispatchEvent(new Event('controllerchange'))

  assert.equal(offlineReadyCount, 1)
  assert.equal(reloadCount, 0, 'the first controller claim must not reload a newly installed app')
})
