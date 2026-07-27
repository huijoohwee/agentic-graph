import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ByteBoundedResourceCache,
  ENHANCED_RESOURCE_CACHE_BYTE_BUDGET,
} from '../../gympgrph/src/enhancedResourceCache.ts'
import {
  clearEnhancedResourceCache,
  loadBoundedResource,
  MAX_ENHANCED_LAYER_READINESS_MS,
  resolveEffectiveResourceTimeoutMs,
} from '../../gympgrph/src/enhancedLayerLoad.ts'
import { formatEnhancedLayerFailure } from '../../gympgrph/src/useEnhancedGeospatialLayers.ts'

test('byte-bounded cache evicts the least-recently-read entry', () => {
  const cache = new ByteBoundedResourceCache(8, 3)
  assert.equal(cache.write('first', new Uint8Array(4).fill(1)), true)
  assert.equal(cache.write('second', new Uint8Array(4).fill(2)), true)
  assert.equal(cache.read('first', 4).kind, 'hit')
  assert.equal(cache.write('third', new Uint8Array(4).fill(3)), true)

  assert.equal(cache.read('second', 4).kind, 'miss')
  assert.equal(cache.read('first', 4).kind, 'hit')
  assert.equal(cache.read('third', 4).kind, 'hit')
  assert.deepEqual(cache.stats(), { entryCount: 2, totalBytes: 8, byteBudget: 8 })
})

test('byte-bounded cache refuses entries larger than its total budget', () => {
  const cache = new ByteBoundedResourceCache(8)
  assert.equal(cache.write('oversized', new Uint8Array(9)), false)
  assert.deepEqual(cache.stats(), { entryCount: 0, totalBytes: 0, byteBudget: 8 })
  assert.ok(ENHANCED_RESOURCE_CACHE_BYTE_BUDGET >= 8)
})

test('every cache read enforces the caller current maxBytes without refetching', async () => {
  clearEnhancedResourceCache()
  const previousFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    return new Response(new Uint8Array(8))
  }
  try {
    const initial = await loadBoundedResource({
      target: 'cached-layer',
      url: 'memory:cached-layer',
      bound: { timeoutMs: 1_000, maxBytes: 8 },
    })
    assert.equal(initial.ok, true)

    const constrained = await loadBoundedResource({
      target: 'cached-layer',
      url: 'memory:cached-layer',
      bound: { timeoutMs: 1_000, maxBytes: 4 },
    })
    assert.equal(constrained.ok, false)
    if (!constrained.ok) {
      assert.equal(constrained.failure.code, 'max-bytes-exceeded')
      assert.equal(constrained.failure.maxBytes, 4)
    }
    assert.equal(fetchCalls, 1)
  } finally {
    globalThis.fetch = previousFetch
    clearEnhancedResourceCache()
  }
})

test('effective resource deadline preserves shorter configured timeouts and caps longer ones', () => {
  assert.equal(resolveEffectiveResourceTimeoutMs(250), 250)
  assert.equal(resolveEffectiveResourceTimeoutMs(20_000), MAX_ENHANCED_LAYER_READINESS_MS)
  assert.equal(MAX_ENHANCED_LAYER_READINESS_MS, 10_000)
})

test('missing fetch bounds abort before any network request', async () => {
  const previousFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    return new Response(new Uint8Array())
  }
  try {
    const result = await loadBoundedResource({
      target: 'unbounded-layer',
      url: 'memory:unbounded-layer',
      bound: { timeoutMs: 1_000 } as { timeoutMs: number; maxBytes: number },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.failure.code, 'missing-fetch-bound')
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('bounded loading returns at the configured deadline when it is below readiness cap', async () => {
  clearEnhancedResourceCache()
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  try {
    const startedAt = Date.now()
    const result = await loadBoundedResource({
      target: 'slow-layer',
      url: 'memory:slow-layer',
      bound: { timeoutMs: 20, maxBytes: 8 },
    })
    const elapsedMs = Date.now() - startedAt
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.failure.code, 'timeout')
      assert.equal(result.failure.timeoutMs, 20)
    }
    assert.ok(elapsedMs < 1_000, `expected bounded return, received ${elapsedMs} ms`)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('loading progress is monotonic and explicitly indeterminate without content length', async () => {
  clearEnhancedResourceCache()
  const previousFetch = globalThis.fetch
  let includeLength = true
  globalThis.fetch = async () => new Response(
    new Uint8Array(4),
    includeLength ? { headers: { 'content-length': '4' } } : undefined,
  )
  try {
    const determinate: number[] = []
    const known = await loadBoundedResource({
      target: 'known-length',
      url: 'memory:known-length',
      bound: { timeoutMs: 1_000, maxBytes: 8 },
      onProgress: progress => {
        if (progress.kind === 'determinate') determinate.push(progress.percent)
      },
    })
    assert.equal(known.ok, true)
    assert.equal(determinate[0], 0)
    assert.equal(determinate.at(-1), 100)
    assert.ok(determinate.every((value, index) => index === 0 || value >= determinate[index - 1]))

    includeLength = false
    const kinds: string[] = []
    const unknown = await loadBoundedResource({
      target: 'unknown-length',
      url: 'memory:unknown-length',
      bound: { timeoutMs: 1_000, maxBytes: 8 },
      onProgress: progress => kinds.push(progress.kind),
    })
    assert.equal(unknown.ok, true)
    assert.ok(kinds.includes('indeterminate'))
  } finally {
    globalThis.fetch = previousFetch
    clearEnhancedResourceCache()
  }
})

test('network failures expose the literal bounded status reason', () => {
  const message = formatEnhancedLayerFailure({
    code: 'network-unavailable',
    target: 'roads',
  })
  assert.match(message, /network-unavailable/)
  assert.ok(message.length <= 140)
})
