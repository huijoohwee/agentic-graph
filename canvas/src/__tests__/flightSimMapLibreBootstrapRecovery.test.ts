import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  readFlightGeoOverlay,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  beginMapLibreFlightBootstrap,
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  reconcileMapLibreFlightBootstrap,
  requestMapLibreFlightPresentationBootstrap,
  resumeMapLibreFlightBootstrapAfterDisposal,
  suspendMapLibreFlightBootstrapForDisposal,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  readMapLibreFlightBootstrapState,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrapState.js'
import {
  hasExpectedMapLibreFlightBootstrapStyleIdentity,
  readMapLibreFlightBootstrapStyleIdentity,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrapStyleIdentity.js'
import {
  createMapLibreFlightRuntimeFallbackRequester,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightRuntimeFallback.js'
import {
  deferFlightGeoPresentationForBootstrapRecovery,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.js'
import {
  applyProviderStyleImmediately,
  flushMicrotasks,
  readyFlightOverlay,
} from './helpers/flightSimGeoMapLibreLeaseHarness'

test('stopped presentation recovery reissues a bootstrap stranded by stale provider style.load', context => {
  const readyOverlay = readyFlightOverlay('ready:stale-bootstrap-load', 22)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:stale-bootstrap-load',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)

  const styleLoadListeners = new Set<() => void>()
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: {},
    layers: [{
      id: 'provider-background',
      type: 'background',
    }],
  }
  const styleCalls: Array<{
    options: Readonly<Record<string, unknown>> | undefined
    style: Readonly<Record<string, unknown>>
  }> = []
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.add(listener)
    },
    setStyle: (
      style: Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    ) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push({ options, style })
    },
    triggerRepaint: () => void 0,
  }
  const mapIdentity = map
  context.after(() => disposeMapLibreFlightBootstrap(map))

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => providerStyle,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.equal(map, mapIdentity)
  assert.deepEqual(styleCalls, [{
    options: { diff: true },
    style: bootstrapStyle,
  }])
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, true)
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), false)
  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      map,
      stoppedOverlay,
      false,
    ),
    true,
  )
  assert.equal(
    styleCalls.length,
    1,
    'an unloaded bootstrap must remain deferred without restarting setStyle',
  )
  assert.equal(styleLoadListeners.size, 1)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, true)

  currentStyle = providerStyle
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  assert.equal(
    readMapLibreFlightBootstrapState(map)?.bootstrapPending,
    true,
    'a stale provider style.load must leave the exact bootstrap pending',
  )
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), false)

  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      map,
      stoppedOverlay,
      false,
    ),
    true,
  )
  assert.equal(map, mapIdentity)
  assert.deepEqual(
    styleCalls,
    [
      { options: { diff: true }, style: bootstrapStyle },
      { options: { diff: true }, style: bootstrapStyle },
    ],
    'presentation recovery must reissue the exact bootstrap on the same map',
  )
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, true)
  assert.equal(styleLoadListeners.size, 1)

  currentStyle = bootstrapStyle
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, false)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapApplied, true)
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), true)
  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      map,
      stoppedOverlay,
      false,
    ),
    false,
    'the exact bootstrap style.load must release stopped presentation',
  )
  assert.equal(styleCalls.length, 2)
})

test('exact bootstrap settles after unrelated host source work without another style load', context => {
  const readyOverlay = readyFlightOverlay('ready:host-source-settlement', 24)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:host-source-settlement',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)

  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const emit = (event: string) => {
    for (const listener of [...listenersFor(event)]) listener()
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: {},
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      listenersFor(event).add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => providerStyle,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.deepEqual(styleCalls, [bootstrapStyle])
  currentStyle = {
    ...bootstrapStyle,
    sources: {
      'kg-host-graph:nodes:plain': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
    },
    layers: [
      ...bootstrapStyle.layers,
      {
        id: 'kg-host-graph:nodes:plain',
        source: 'kg-host-graph:nodes:plain',
        type: 'circle',
      },
    ],
  }
  const pendingState = readMapLibreFlightBootstrapState(map)
  const bootstrapGeneration = pendingState?.bootstrapGeneration
  assert.equal(
    requestMapLibreFlightPresentationBootstrap(map, stoppedOverlay),
    true,
    'the production recovery request must retain an installed bootstrap identity',
  )
  assert.equal(pendingState?.bootstrapGeneration, bootstrapGeneration)
  assert.deepEqual(styleCalls, [bootstrapStyle])
  assert.equal(listenersFor('style.load').size, 1)
  assert.equal(listenersFor('sourcedata').size, 1)
  assert.equal(listenersFor('idle').size, 1)

  emit('sourcedata')
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, true)
  assert.deepEqual(
    styleCalls,
    [bootstrapStyle],
    'an exact bootstrap identity must not restart setStyle while host data settles',
  )

  styleLoaded = true
  emit('sourcedata')
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, false)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapApplied, true)
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), true)
  assert.equal(listenersFor('style.load').size, 0)
  assert.equal(listenersFor('sourcedata').size, 0)
  assert.equal(listenersFor('idle').size, 0)
  assert.deepEqual(styleCalls, [bootstrapStyle])
})

test('bootstrap style.load proves installation without waiting on unrelated host sources', context => {
  const readyOverlay = readyFlightOverlay('ready:host-source-style-load', 26)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:host-source-style-load',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)
  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = bootstrapStyle
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => false,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      listenersFor(event).add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => ({
      version: 8,
      sources: {},
      layers: [],
    }),
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  currentStyle = {
    ...bootstrapStyle,
    sources: {
      'kg-host-graph:nodes:plain': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
    },
    layers: [
      ...bootstrapStyle.layers,
      { id: 'kg-host-graph:nodes:plain', type: 'circle' },
    ],
  }
  for (const listener of [...listenersFor('style.load')]) listener()

  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, false)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapApplied, true)
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), true)
  assert.equal(listenersFor('style.load').size, 0)
  assert.equal(listenersFor('sourcedata').size, 0)
  assert.equal(listenersFor('idle').size, 0)
})

test('bootstrap identity rejects owned layer mutations while allowing host layers', () => {
  const expectedStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
      paint: { 'background-color': '#7dd3fc' },
    }],
  }
  const expected = readMapLibreFlightBootstrapStyleIdentity(expectedStyle)
  let currentStyle: Readonly<Record<string, unknown>> = {
    ...expectedStyle,
    sources: { host: { type: 'geojson' } },
    layers: [
      ...expectedStyle.layers,
      { id: 'host', type: 'circle', source: 'host' },
    ],
  }
  const map = { getStyle: () => currentStyle }

  assert.equal(
    hasExpectedMapLibreFlightBootstrapStyleIdentity(map, expected),
    true,
  )
  currentStyle = {
    ...currentStyle,
    layers: [{
      ...expectedStyle.layers[0],
      type: 'fill',
    }],
  }
  assert.equal(
    hasExpectedMapLibreFlightBootstrapStyleIdentity(map, expected),
    false,
  )
  currentStyle = {
    ...currentStyle,
    layers: [{
      ...expectedStyle.layers[0],
      paint: { 'background-color': '#000000' },
    }],
  }
  assert.equal(
    hasExpectedMapLibreFlightBootstrapStyleIdentity(map, expected),
    false,
  )
})

test('partial bootstrap listener registration rolls back every prior binding', () => {
  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const map = {
    getStyle: () => bootstrapStyle,
    isStyleLoaded: () => false,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'sourcedata') throw new Error('binding rejected')
      listenersFor(event).add(listener)
    },
  }

  beginMapLibreFlightBootstrap(map, bootstrapStyle)
  assert.equal(listenersFor('style.load').size, 0)
  assert.equal(listenersFor('sourcedata').size, 0)
  assert.equal(listenersFor('idle').size, 0)
  disposeMapLibreFlightBootstrap(map)
})

test('a transient null host override cannot release an active Flight style', async context => {
  const readyOverlay = readyFlightOverlay('ready:transient-null-owner', 23)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:transient-null-owner',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)

  const styleLoadListeners = new Set<() => void>()
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const retainedFlightStyle = {
    ...providerStyle,
    sources: {
      ...providerStyle.sources,
      'kg-flight-geo-environment': { type: 'geojson' },
      'kg-flight-sim:geo-overlay': { type: 'geojson' },
    },
    layers: [
      ...providerStyle.layers,
      { id: 'kg-flight-geo-environment:fill-2d', type: 'fill' },
      { id: 'kg-flight-sim:geo-overlay:route', type: 'line' },
      { id: 'kg-flight-sim:geo-overlay:aircraft', type: 'symbol' },
    ],
  }
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  const reconcile = (
    nextBootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => reconcileMapLibreFlightBootstrap({
    bootstrapStyle: nextBootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => providerStyle,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })

  reconcile(bootstrapStyle)
  currentStyle = bootstrapStyle
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  const activeState = readMapLibreFlightBootstrapState(map)
  assert.equal(activeState?.bootstrapApplied, true)
  currentStyle = retainedFlightStyle
  const generationBeforeTransientNull = activeState?.generation

  reconcile(null)
  await flushMicrotasks()
  assert.equal(readMapLibreFlightBootstrapState(map), activeState)
  assert.equal(activeState?.bootstrapStyle, bootstrapStyle)
  assert.equal(activeState?.generation, generationBeforeTransientNull)
  assert.deepEqual(styleCalls, [bootstrapStyle])
  assert.deepEqual(
    Object.keys(currentStyle.sources as Record<string, unknown>).sort(),
    [
      'kg-flight-geo-environment',
      'kg-flight-sim:geo-overlay',
      'provider',
    ],
    'the active environment and route/aircraft source stacks stay intact',
  )

  clearFlightGeoOverlay()
  reconcile(null)
  await flushMicrotasks()
  assert.deepEqual(styleCalls, [bootstrapStyle, providerStyle])
  assert.equal(
    readMapLibreFlightBootstrapState(map)?.bootstrapStyle,
    null,
    'only confirmed Flight inactivity may restore the plain provider style',
  )
})

test('confirmed Flight exit removes a promoted provider Flight stack', async context => {
  const readyOverlay = readyFlightOverlay('ready:promoted-provider-exit', 27)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:promoted-provider-exit',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)
  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const emit = (event: string) => {
    for (const listener of [...listenersFor(event)]) listener()
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const retainedProviderStyle = {
    ...providerStyle,
    sources: {
      ...providerStyle.sources,
      'kg-flight-geo-environment': { type: 'geojson' },
      'kg-flight-sim:geo-overlay': { type: 'geojson' },
    },
    layers: [
      ...providerStyle.layers,
      { id: 'kg-flight-geo-environment:fill-2d', type: 'fill' },
      { id: 'kg-flight-sim:geo-overlay:route', type: 'line' },
      { id: 'kg-flight-sim:geo-overlay:aircraft', type: 'symbol' },
    ],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      listenersFor(event).add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  const reconcile = (
    nextBootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => reconcileMapLibreFlightBootstrap({
    bootstrapStyle: nextBootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: async () => providerStyle,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: () => retainedProviderStyle,
  })

  reconcile(bootstrapStyle)
  styleLoaded = true
  emit('style.load')
  markMapLibreFlightOverlayPresented(map, stoppedOverlay)
  await flushMicrotasks()
  await flushMicrotasks()

  assert.equal(
    readMapLibreFlightBootstrapState(map)?.bootstrapApplied,
    false,
  )
  assert.ok(readMapLibreFlightBootstrapState(map)?.providerPresentation)
  assert.equal(currentStyle, retainedProviderStyle)

  clearFlightGeoOverlay()
  reconcile(null)
  await flushMicrotasks()
  await flushMicrotasks()

  assert.equal(currentStyle, providerStyle)
  assert.deepEqual(styleCalls, [
    bootstrapStyle,
    retainedProviderStyle,
    providerStyle,
  ])
  assert.deepEqual(Object.keys(currentStyle.sources).sort(), ['provider'])
  assert.deepEqual(
    (currentStyle.layers as Array<{ id: string }>).map(layer => layer.id),
    ['provider-background'],
  )
})

test('reactivated Flight cancels a deferred plain-provider restore without rewriting bootstrap', async context => {
  const readyOverlay = readyFlightOverlay('ready:deferred-provider-restore', 25)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:deferred-provider-restore',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)

  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const emit = (event: string) => {
    for (const listener of [...listenersFor(event)]) listener()
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      listenersFor(event).add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  let resolvePlainProvider: (
    style: Readonly<Record<string, unknown>>,
  ) => void = () => void 0
  const plainProvider = new Promise<Readonly<Record<string, unknown>>>(
    resolve => {
      resolvePlainProvider = resolve
    },
  )
  let plainProviderLoads = 0
  const reconcile = (
    nextBootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => reconcileMapLibreFlightBootstrap({
    bootstrapStyle: nextBootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: () => {
      if (nextBootstrapStyle) return Promise.resolve(providerStyle)
      plainProviderLoads += 1
      return plainProvider
    },
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })

  reconcile(bootstrapStyle)
  currentStyle = bootstrapStyle
  styleLoaded = true
  emit('style.load')
  const activeState = readMapLibreFlightBootstrapState(map)
  assert.equal(activeState?.bootstrapApplied, true)
  assert.deepEqual(styleCalls, [bootstrapStyle])

  clearFlightGeoOverlay()
  reconcile(null)
  await flushMicrotasks()
  assert.equal(plainProviderLoads, 1)
  assert.equal(typeof activeState?.cancelProviderStyleLoad, 'function')
  assert.equal(
    activeState?.bootstrapStyle,
    bootstrapStyle,
    'bootstrap ownership must remain intact until the plain provider commits',
  )
  assert.equal(activeState?.bootstrapApplied, true)

  setFlightGeoOverlay(stoppedOverlay)
  resolvePlainProvider(providerStyle)
  await flushMicrotasks()
  await flushMicrotasks()

  assert.deepEqual(
    styleCalls,
    [bootstrapStyle],
    'a returning Flight owner must cancel the stale plain swap without another bootstrap setStyle',
  )
  assert.equal(activeState?.bootstrapStyle, bootstrapStyle)
  assert.equal(activeState?.bootstrapApplied, true)
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedOverlay), true)
})

test('failed disposal resumes an inactive provider release instead of Flight', async context => {
  const readyOverlay = readyFlightOverlay('ready:release-resume', 28)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:release-resume',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)
  const listeners = new Map<string, Set<() => void>>()
  const listenersFor = (event: string) => {
    let eventListeners = listeners.get(event)
    if (!eventListeners) {
      eventListeners = new Set()
      listeners.set(event, eventListeners)
    }
    return eventListeners
  }
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      listenersFor(event).delete(listener)
    },
    on: (event: string, listener: () => void) => {
      listenersFor(event).add(listener)
    },
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  let providerLoads = 0
  const neverSettledProvider = new Promise<Readonly<Record<string, unknown>>>(
    () => void 0,
  )
  const reconcile = (
    nextBootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => reconcileMapLibreFlightBootstrap({
    bootstrapStyle: nextBootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: () => {
      providerLoads += 1
      return providerLoads === 1
        ? neverSettledProvider
        : Promise.resolve(providerStyle)
    },
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })

  reconcile(bootstrapStyle)
  styleLoaded = true
  for (const listener of [...listenersFor('style.load')]) listener()
  clearFlightGeoOverlay()
  reconcile(null)
  await flushMicrotasks()
  assert.equal(providerLoads, 1)

  suspendMapLibreFlightBootstrapForDisposal(map)
  resumeMapLibreFlightBootstrapAfterDisposal(map)
  await flushMicrotasks()
  await flushMicrotasks()

  assert.equal(providerLoads, 2)
  assert.deepEqual(styleCalls, [bootstrapStyle, providerStyle])
  assert.equal(currentStyle, providerStyle)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapStyle, null)
})

test('a newer non-Flight fallback fences a stale provider release', async context => {
  const readyOverlay = readyFlightOverlay('ready:external-provider-fence', 29)
  const stoppedOverlay = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:external-provider-fence',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(stoppedOverlay)
  context.after(clearFlightGeoOverlay)
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    sources: {},
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const fallbackStyle = {
    version: 8,
    name: 'fallback-style',
    sources: {},
    layers: [{ id: 'fallback-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const styleCalls: Array<Readonly<Record<string, unknown>>> = []
  const map = {
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    off: () => void 0,
    on: () => void 0,
    setStyle: (style: Readonly<Record<string, unknown>>) => {
      currentStyle = style
      styleLoaded = false
      styleCalls.push(style)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  let resolveProvider: (
    style: Readonly<Record<string, unknown>>,
  ) => void = () => void 0
  const deferredProvider = new Promise<Readonly<Record<string, unknown>>>(
    resolve => {
      resolveProvider = resolve
    },
  )
  const reconcile = (
    nextBootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => reconcileMapLibreFlightBootstrap({
    bootstrapStyle: nextBootstrapStyle,
    hasExactFlightOverlay: () => true,
    hasLiveFlightStyleOwner: () => readFlightGeoOverlay().active,
    loadProviderStyle: () => deferredProvider,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })

  reconcile(bootstrapStyle)
  const state = readMapLibreFlightBootstrapState(map)
  styleLoaded = true
  markMapLibreFlightBootstrapApplied(map)
  clearFlightGeoOverlay()
  reconcile(null)
  await flushMicrotasks()
  assert.equal(typeof state?.cancelProviderStyleLoad, 'function')

  let fallbackApplied = 0
  let fallbackRejected = 0
  const fallbackRequester = createMapLibreFlightRuntimeFallbackRequester({
    hasCurrentProviderPresentation: () => false,
    hasExactFlightPresentation: () => false,
    isDisposed: () => false,
    loadResolvedStyle: async style => style,
    readMap: () => map,
    requiresFlightRetention: () => readFlightGeoOverlay().active,
    resetNonFlightStyleRevision: () => void 0,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  context.after(fallbackRequester.dispose)
  assert.equal(
    fallbackRequester.request(fallbackStyle, {
      key: 'fallback',
      onApplied: () => {
        fallbackApplied += 1
      },
      onRejected: () => {
        fallbackRejected += 1
      },
    }),
    true,
  )
  assert.equal(currentStyle, fallbackStyle)
  assert.equal(fallbackApplied, 1)
  assert.equal(fallbackRejected, 0)

  resolveProvider(providerStyle)
  await flushMicrotasks()
  await flushMicrotasks()

  assert.deepEqual(styleCalls, [bootstrapStyle, fallbackStyle])
  assert.equal(currentStyle, fallbackStyle)
  assert.equal(state?.bootstrapStyle, null)
})
