import assert from 'node:assert/strict'
import test from 'node:test'
import { FLIGHT_GEO_BOOTSTRAP_STYLE } from 'gympgrph/testkit/features/geospatial/basemapStyle'
import { preflightMapLibreStyle, readMapLibreProviderOnline, resolveInitialMapLibreStyle, resolveMapLibreBootstrapStyle,
  resolveMapLibreFlightProviderStyle, subscribeMapLibreProviderOnline } from 'gympgrph/testkit/features/geospatial/mapLibreProviderStyle'
import { disposeMapLibreFlightBootstrap, markMapLibreFlightBootstrapApplied,
  reconcileMapLibreFlightBootstrap } from 'gympgrph/testkit/features/geospatial/mapLibreFlightBootstrap'

async function withConnectivity(run: (setOnline: (value: boolean) => void) => Promise<void>) {
  const previous = ['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const events = Object.assign(new EventTarget(), { location: { origin: 'https://studio.example' } }); let online = false
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online } } })
  try { await run(value => { online = value; events.dispatchEvent(new Event(value ? 'online' : 'offline')) }) }
  finally { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } }
}
const provider = 'https://tiles.openfreemap.org/styles/liberty'
const local = { version: 8, sources: {}, layers: [{ id: 'local-background', type: 'background' }] }
const response = () => new Response(JSON.stringify(local), { headers: { 'content-type': 'application/json' } })

test('offline initial provider admission keeps native inline styles without preflight', async () => withConnectivity(async setOnline => {
  let requests = 0
  for (const selectedStyle of [provider, 'https://maps.grab.com/style.json']) {
    const result = await resolveInitialMapLibreStyle({ selectedStyle, readActivationStyleOverride: () => null,
      preflight: async () => { requests++; return { style: selectedStyle, shouldFallback: false } } })
    assert.equal(result.style, FLIGHT_GEO_BOOTSTRAP_STYLE)
    assert.equal(result.activationStyleOverride, FLIGHT_GEO_BOOTSTRAP_STYLE)
    assert.equal(result.shouldFallback, false)
  }
  assert.equal(requests, 0)
  assert.equal(resolveMapLibreBootstrapStyle(local), local)
  setOnline(true)
  assert.equal(resolveMapLibreBootstrapStyle(null), null)
  assert.equal((await resolveInitialMapLibreStyle({ selectedStyle: provider, readActivationStyleOverride: () => null })).style, provider)
}))

test('disconnect cancels in-flight provider publication and online recovery retains the map', async () => withConnectivity(async setOnline => {
  let requests = 0, currentStyle: unknown = FLIGHT_GEO_BOOTSTRAP_STYLE
  let releaseResponse!: () => void, markStarted!: () => void
  const responseReady = new Promise<void>(resolve => { releaseResponse = resolve })
  const started = new Promise<void>(resolve => { markStarted = resolve })
  const applied: unknown[] = [], failures: unknown[] = [], signals: AbortSignal[] = []
  const map = { getStyle: () => currentStyle, isStyleLoaded: () => true,
    setStyle: (style: unknown) => { currentStyle = style; applied.push(style) }, on: () => {}, off: () => {} }
  const reconcile = () => reconcileMapLibreFlightBootstrap({ map,
    bootstrapStyle: resolveMapLibreBootstrapStyle(null), hasExactFlightOverlay: () => false,
    hasLiveFlightStyleOwner: () => Boolean(resolveMapLibreBootstrapStyle(null)),
    loadProviderStyle: async signal => (await resolveMapLibreFlightProviderStyle(provider, { signal,
      fetchStyle: async () => { requests++; signals.push(signal); markStarted(); if (requests === 1) await responseReady; return response() } })).style,
    onError: error => failures.push(error), retainFlightOverlay: (_previous, next) => ({ ...next }) })
  const cleanup = subscribeMapLibreProviderOnline(reconcile)
  try {
    reconcile(); markMapLibreFlightBootstrapApplied(map)
    assert.deepEqual(applied, [FLIGHT_GEO_BOOTSTRAP_STYLE]); assert.equal(requests, 0)
    setOnline(true); await started
    setOnline(false); assert.equal(signals[0].aborted, true)
    releaseResponse(); await new Promise<void>(resolve => setImmediate(resolve))
    assert.deepEqual(applied, [FLIGHT_GEO_BOOTSTRAP_STYLE]); assert.equal(requests, 1)
    setOnline(true); await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(requests, 2); assert.equal(map.getStyle(), applied[1])
    assert.deepEqual(applied, [FLIGHT_GEO_BOOTSTRAP_STYLE, local]); assert.deepEqual(failures, [])
    setOnline(false); cleanup(); disposeMapLibreFlightBootstrap(map); const before = applied.length
    setOnline(true); await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(requests, 2); assert.equal(applied.length, before); assert.deepEqual(failures, [])
  } finally { cleanup(); disposeMapLibreFlightBootstrap(map) }
}))

test('connectivity subscriptions observe both transitions and detach on cleanup', async () => withConnectivity(async setOnline => {
  const states: boolean[] = []
  const cleanup = subscribeMapLibreProviderOnline(() => states.push(readMapLibreProviderOnline()))
  setOnline(true); setOnline(false); cleanup(); setOnline(true)
  assert.deepEqual(states, [true, false])
}))


test('offline generic and GrabMaps preflights cancel without admitting any request', async () => withConnectivity(async () => {
  for (const url of [provider, 'https://maps.grab.com/api/maps/tiles/v1/style']) {
    let requests = 0
    const controller = new AbortController()
    const pending = preflightMapLibreStyle(url, { signal: controller.signal,
      fetchStyle: async () => { requests++; return response() } })
    await Promise.resolve(); assert.equal(requests, 0)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(requests, 0)
  }
}))
