import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  readMapLibreFlightBootstrapState,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrapState.js'
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
