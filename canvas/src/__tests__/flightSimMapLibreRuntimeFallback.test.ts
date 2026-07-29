import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMapLibreFlightRuntimeFallbackRequester,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightRuntimeFallback'

const flush = () => new Promise<void>(resolve => setImmediate(resolve))

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => void 0
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

test('active Flight deduplicates fallback errors and never passes their raw URL to MapLibre', async context => {
  const resolution = deferred<Readonly<Record<string, unknown>>>()
  const styleCalls: unknown[] = []
  let loadCalls = 0
  let applied = 0
  let unsafeRecoveryApplied = 0
  let rejected = 0
  let revisionResets = 0
  const map = {
    getStyle: () => ({
      version: 8,
      sources: { flight: { type: 'geojson' } },
      layers: [{ id: 'flight-route', type: 'line' }],
    }),
    setStyle: (style: unknown) => {
      styleCalls.push(style)
    },
  }
  const requester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => true,
    hasExactFlightPresentation: () => true,
    isDisposed: () => false,
    loadResolvedStyle: async () => {
      loadCalls += 1
      return resolution.promise
    },
    readMap: () => map,
    // Models the React-ref publication gap: bootstrap is false while the live
    // Flight overlay has already become active.
    requiresFlightRetention: () => true,
    resetNonFlightStyleRevision: () => {
      revisionResets += 1
    },
    retainFlightOverlay: (previous, next) => ({
      ...next,
      layers: [...(next.layers || []), ...(previous?.layers || [])],
      sources: { ...(next.sources || {}), ...(previous?.sources || {}) },
    }),
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
  })
  context.after(requester.dispose)

  const callbacks = {
    key: 'provider-error',
    onApplied: () => {
      applied += 1
    },
    onRejected: () => {
      rejected += 1
    },
  }
  assert.equal(requester.request('https://provider.test/fallback.json', callbacks), true)
  assert.equal(requester.request('https://provider.test/fallback.json', {
    key: 'unsafe-runtime-error',
    onApplied: () => {
      unsafeRecoveryApplied += 1
    },
    onRejected: () => {
      rejected += 1
    },
  }), true)
  assert.equal(requester.request('https://provider.test/fallback.json', callbacks), true)
  assert.equal(loadCalls, 1)
  assert.deepEqual(styleCalls, [])

  resolution.resolve({
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  })
  await flush()

  assert.equal(loadCalls, 1)
  assert.equal(styleCalls.length, 1)
  assert.equal(typeof styleCalls[0], 'object')
  assert.equal(applied, 1)
  assert.equal(unsafeRecoveryApplied, 1)
  assert.equal(rejected, 0)
  assert.equal(revisionResets, 0)
})

test('delayed Flight fallback cannot commit or reject after Flight deactivation', async context => {
  const resolution = deferred<Readonly<Record<string, unknown>>>()
  const styleCalls: unknown[] = []
  let retentionRequired = true
  let callbacks = 0
  const map = {
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    setStyle: (style: unknown) => styleCalls.push(style),
  }
  const requester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => true,
    hasExactFlightPresentation: () => true,
    isDisposed: () => false,
    loadResolvedStyle: async () => resolution.promise,
    readMap: () => map,
    requiresFlightRetention: () => retentionRequired,
    resetNonFlightStyleRevision: () => void 0,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
  })
  context.after(requester.dispose)

  requester.request('https://provider.test/fallback.json', {
    key: 'delayed-provider-error',
    onApplied: () => {
      callbacks += 1
    },
    onRejected: () => {
      callbacks += 1
    },
  })
  retentionRequired = false
  resolution.resolve({ version: 8, sources: {}, layers: [] })
  await flush()

  assert.deepEqual(styleCalls, [])
  assert.equal(callbacks, 0)
})

test('Flight fallback requires canonical provider presentation before an object swap', async context => {
  const styleCalls: unknown[] = []
  let rejected = 0
  const map = {
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    setStyle: (style: unknown) => styleCalls.push(style),
  }
  const requester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => false,
    hasExactFlightPresentation: () => true,
    isDisposed: () => false,
    loadResolvedStyle: async () => ({
      version: 8,
      sources: {},
      layers: [],
    }),
    readMap: () => map,
    requiresFlightRetention: () => true,
    resetNonFlightStyleRevision: () => void 0,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
  })
  context.after(requester.dispose)

  requester.request('https://provider.test/fallback.json', {
    key: 'unpresented-provider-error',
    onApplied: () => assert.fail('unpresented Flight cannot promote'),
    onRejected: () => {
      rejected += 1
    },
  })
  await flush()

  assert.deepEqual(styleCalls, [])
  assert.equal(rejected, 1)
})

test('retained object fallback preserves a synchronous style.load revision', async context => {
  let revision = 1
  let appliedRevision = 0
  let resets = 0
  const map = {
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    setStyle: () => {
      // Installed MapLibre may emit style.load before object setStyle returns.
      revision += 1
    },
  }
  const requester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => true,
    hasExactFlightPresentation: () => true,
    isDisposed: () => false,
    loadResolvedStyle: async () => ({
      version: 8,
      sources: {},
      layers: [],
    }),
    readMap: () => map,
    requiresFlightRetention: () => true,
    resetNonFlightStyleRevision: () => {
      resets += 1
      revision = 0
    },
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
  })
  context.after(requester.dispose)

  requester.request('https://provider.test/fallback.json', {
    key: 'synchronous-style-load',
    onApplied: () => {
      appliedRevision = revision
    },
    onRejected: () => assert.fail('exact retained style should apply'),
  })
  await flush()

  assert.equal(resets, 0)
  assert.equal(revision, 2)
  assert.equal(appliedRevision, 2)
})

test('ordinary non-Flight fallback resets revision before its URL swap', context => {
  const order: string[] = []
  const map = {
    setStyle: (style: unknown) => {
      order.push(`set:${typeof style}`)
    },
  }
  const requester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => false,
    hasExactFlightPresentation: () => false,
    isDisposed: () => false,
    loadResolvedStyle: async style => style,
    readMap: () => map,
    requiresFlightRetention: () => false,
    resetNonFlightStyleRevision: () => {
      order.push('reset')
    },
    retainFlightOverlay: () => null,
  })
  context.after(requester.dispose)

  assert.equal(requester.request('https://provider.test/fallback.json', {
    key: 'ordinary-provider-error',
    onApplied: () => {
      order.push('applied')
    },
    onRejected: () => assert.fail('ordinary fallback should apply'),
  }), true)
  assert.deepEqual(order, ['reset', 'set:string', 'applied'])
})
