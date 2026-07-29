import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  readFlightGeoOverlay,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  flightGeoOverlayMapLibreFeatureCollection,
  FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre.js'
import {
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
  subscribeMapLibreFlightBootstrapSettled,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  captureNativeGeospatialMapLibreLease,
  claimMapLibreMapLease,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'
import {
  applyProviderStyleImmediately,
  flushMicrotasks,
  readyFlightOverlay,
} from './helpers/flightSimGeoMapLibreLeaseHarness'

test('native Geo lease ignores inline Markdown maps and fences stale releases', () => {
  const hostCanvas = {} as HTMLCanvasElement
  const inlineCanvas = {} as HTMLCanvasElement
  const replacementCanvas = {} as HTMLCanvasElement
  const hostMap = { getCanvas: () => hostCanvas }
  const inlineMap = { getCanvas: () => inlineCanvas }
  const replacementMap = { getCanvas: () => replacementCanvas }

  const releaseHost = claimMapLibreMapLease({
    map: hostMap,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    root: null,
  })
  const hostLease = captureNativeGeospatialMapLibreLease()
  assert.equal(hostLease?.map, hostMap)
  assert.equal(hostLease?.canvas, hostCanvas)
  assert.equal(hostLease?.isCurrent(), true)

  const releaseInline = claimMapLibreMapLease({
    map: inlineMap,
    ownerScope: 'embedded-preview',
    root: null,
  })
  assert.equal(captureNativeGeospatialMapLibreLease(), hostLease)
  releaseInline()
  assert.equal(captureNativeGeospatialMapLibreLease(), hostLease)

  const releaseReplacement = claimMapLibreMapLease({
    map: replacementMap,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    root: null,
  })
  const replacementLease = captureNativeGeospatialMapLibreLease()
  assert.equal(hostLease?.isCurrent(), false)
  assert.equal(replacementLease?.map, replacementMap)
  assert.equal(replacementLease?.canvas, replacementCanvas)

  releaseHost()
  assert.equal(captureNativeGeospatialMapLibreLease(), replacementLease)
  releaseReplacement()
  assert.equal(replacementLease?.isCurrent(), false)
  assert.equal(captureNativeGeospatialMapLibreLease(), null)
})

test('Flight activation swaps a mounted Geo map to local bootstrap then promotes in place', async context => {
  const readyOverlay = readyFlightOverlay('ready:local', 1)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const canvas = {} as HTMLCanvasElement
  const renderListeners = new Set<() => void>()
  const calls: string[] = []
  let overlayPresented = false
  const map = {
    getCanvas: () => canvas,
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: (
      style: string | Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    ) => {
      calls.push(
        typeof style === 'string'
          ? `style:${style}:${options?.transformStyle ? 'retained' : 'plain'}`
          : `style:${String(style.name || 'local')}:plain`,
      )
    },
    triggerRepaint: () => {
      calls.push('repaint')
    },
  }
  const mapIdentity = map
  const canvasIdentity = map.getCanvas()
  const reconcile = (
    bootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => {
    reconcileMapLibreFlightBootstrap({
      bootstrapStyle,
      hasExactFlightOverlay: () => overlayPresented,
      loadProviderStyle: async () => {
        calls.push('provider:resolve')
        return 'https://provider.test/style.json'
      },
      map,
      scheduleProviderStyleApply: applyProviderStyleImmediately,
      retainFlightOverlay: (_previous, next) => ({ ...next }),
    })
  }

  reconcile({ version: 8, name: 'local-flight-bootstrap' })
  assert.deepEqual(calls, [
    'style:local-flight-bootstrap:plain',
    'repaint',
  ])
  assert.equal(map, mapIdentity)
  assert.equal(map.getCanvas(), canvasIdentity)
  assert.equal(renderListeners.size, 1)
  markMapLibreFlightBootstrapApplied(map)

  overlayPresented = true
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()
  assert.deepEqual(calls, [
    'style:local-flight-bootstrap:plain',
    'repaint',
  ])
  assert.equal(renderListeners.size, 1)

  markMapLibreFlightReadyFramePresented(
    map,
    readyOverlay.revision,
    readyOverlay.readyFrameRequestId!,
  )
  markMapLibreFlightOverlayPresented(map, readyOverlay)
  assert.equal(calls.at(-1), 'repaint')
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()
  assert.deepEqual(calls, [
    'style:local-flight-bootstrap:plain',
    'repaint',
    'repaint',
    'provider:resolve',
    'style:https://provider.test/style.json:retained',
  ])
  assert.equal(renderListeners.size, 1)
  assert.equal(map, mapIdentity)
  assert.equal(map.getCanvas(), canvasIdentity)

  reconcile(null)
  await flushMicrotasks()
  assert.equal(calls.at(-1), 'style:https://provider.test/style.json:retained')
  disposeMapLibreFlightBootstrap(map)
})

test('only the bootstrap style can prepare a stopped Flight frame on a mounted provider map', async context => {
  const readyOverlay = readyFlightOverlay('ready:bootstrap-presenter', 21)
  const stoppedPresentation = {
    ...readyOverlay,
    phase: 'stopped' as const,
    readyFrameRequestId: null,
    revision: 'stopped:bootstrap-presenter',
    runId: 0,
  }
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const styleLoadListeners = new Set<() => void>()
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    layers: [{ id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' }],
  }
  const providerStyle = {
    version: 8,
    name: 'provider-style',
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = providerStyle
  let styleLoaded = true
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
      if (event === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
      if (event === 'style.load') styleLoadListeners.add(listener)
    },
    getStyle: () => currentStyle,
    isStyleLoaded: () => styleLoaded,
    setStyle: (style: string | Readonly<Record<string, unknown>>) => {
      if (typeof style === 'string') return
      currentStyle = style
      styleLoaded = false
    },
    triggerRepaint: () => void 0,
  }

  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedPresentation), false)
  assert.equal(canMapLibreFlightOverlayPresent(map, readyOverlay), false)

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => 'provider:bootstrap-presenter',
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.equal(
    canMapLibreFlightOverlayPresent(map, stoppedPresentation),
    false,
    'setStyle alone must not authorize stopped-stage presentation',
  )
  let settledReplays = 0
  const unsubscribeSettled = subscribeMapLibreFlightBootstrapSettled(map, () => {
    settledReplays += 1
  })
  currentStyle = providerStyle
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  assert.equal(
    canMapLibreFlightOverlayPresent(map, stoppedPresentation),
    false,
    'a stale provider style.load cannot settle the pending local bootstrap',
  )
  assert.equal(settledReplays, 0)

  currentStyle = bootstrapStyle
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedPresentation), true)
  assert.equal(canMapLibreFlightOverlayPresent(map, readyOverlay), true)
  assert.equal(settledReplays, 1)
  unsubscribeSettled()
  let lateSettledReplay = 0
  const unsubscribeLateSettled = subscribeMapLibreFlightBootstrapSettled(map, () => {
    lateSettledReplay += 1
  })
  await flushMicrotasks()
  assert.equal(
    lateSettledReplay,
    1,
    'a late presentation effect replays an already-settled bootstrap once',
  )
  unsubscribeLateSettled()

  markMapLibreFlightReadyFramePresented(
    map,
    readyOverlay.revision,
    readyOverlay.readyFrameRequestId!,
  )
  markMapLibreFlightOverlayPresented(map, readyOverlay)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.equal(
    canMapLibreFlightOverlayPresent(map, stoppedPresentation),
    false,
    'a promoted provider cannot prepare a later stopped run',
  )
  assert.equal(
    canMapLibreFlightOverlayPresent(map, readyOverlay),
    true,
    'the same map may re-present an already-earned ready frame after promotion',
  )
  assert.equal(
    canMapLibreFlightOverlayPresent(map, {
      ...readyOverlay,
      readyFrameRequestId: null,
    }),
    true,
    'the consumed form of that exact ready frame may re-present after promotion',
  )
  assert.equal(
    canMapLibreFlightOverlayPresent(map, {
      ...readyOverlay,
      readyFrameRequestId: readyOverlay.readyFrameRequestId! + 1,
    }),
    false,
    'a later ready request cannot borrow a prior provider presentation',
  )
  assert.equal(
    canMapLibreFlightOverlayPresent(map, {
      ...readyOverlay,
      revision: 'ready:bootstrap-presenter:stale',
    }),
    false,
    'a later ready revision cannot borrow a prior provider presentation',
  )
  disposeMapLibreFlightBootstrap(map)
})

test('stale ready identity and a prior run cannot authorize provider promotion', async context => {
  const readyOverlay = readyFlightOverlay('ready:current', 31)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const applied: string[] = []
  let resolveFirstProvider!: (style: string) => void
  const firstProvider = new Promise<string>(resolve => {
    resolveFirstProvider = resolve
  })
  let providerLoads = 0
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: (style: string | Readonly<Record<string, unknown>>) => {
      applied.push(typeof style === 'string' ? style : String(style.name))
    },
    triggerRepaint: () => void 0,
  }
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
    hasExactFlightOverlay: () => true,
    loadProviderStyle: () => {
      providerLoads += 1
      return providerLoads === 1
        ? firstProvider
        : Promise.resolve('provider:stale')
    },
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  markMapLibreFlightBootstrapApplied(map)
  markMapLibreFlightOverlayPresented(map, {
    ...readyOverlay,
    readyFrameRequestId: 30,
    revision: 'ready:stale',
  })
  markMapLibreFlightOverlayPresented(map, {
    ...readyOverlay,
    profileId: 'stale-profile',
  })
  markMapLibreFlightOverlayPresented(map, {
    ...readyOverlay,
    runId: readyOverlay.runId + 1,
  })
  markMapLibreFlightReadyFramePresented(map, 'ready:stale', 30)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.deepEqual(applied, ['local-flight-bootstrap'])

  markMapLibreFlightOverlayPresented(map, readyOverlay)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()
  assert.equal(providerLoads, 1)
  const nextRun = {
    ...readyOverlay,
    readyFrameRequestId: 32,
    revision: 'ready:next-run',
    runId: readyOverlay.runId + 1,
  }
  setFlightGeoOverlay(nextRun)
  resolveFirstProvider('provider:stale')
  await flushMicrotasks()
  assert.deepEqual(applied, ['local-flight-bootstrap'])
  assert.equal(renderListeners.size, 1)

  markMapLibreFlightOverlayPresented(map, nextRun)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()
  assert.deepEqual(applied, [
    'local-flight-bootstrap',
    'provider:stale',
  ])
  assert.equal(providerLoads, 2)
  disposeMapLibreFlightBootstrap(map)
})

test('a delayed provider load admits the exact latest tick of its presented run', async context => {
  const readyOverlay = readyFlightOverlay('ready:delayed-provider', 41)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const applied: string[] = []
  let retainedFlightData: unknown = null
  let resolveProvider!: (style: string) => void
  const provider = new Promise<string>(resolve => {
    resolveProvider = resolve
  })
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: (
      style: string | Readonly<Record<string, unknown>>,
      options?: Readonly<{
        transformStyle?: (
          previousStyle: Readonly<Record<string, any>>,
          nextStyle: Readonly<Record<string, any>>,
        ) => Readonly<Record<string, any>>
      }>,
    ) => {
      applied.push(typeof style === 'string' ? style : String(style.name))
      if (options?.transformStyle) {
        const current = readFlightGeoOverlay()
        const transformed = options.transformStyle({
          version: 8,
          sources: {
            [FLIGHT_GEO_OVERLAY_SOURCE_ID]: {
              type: 'geojson',
              data: flightGeoOverlayMapLibreFeatureCollection(current),
            },
          },
          layers: FLIGHT_GEO_OVERLAY_LAYER_DEFINITIONS.map(layer => ({
            ...layer,
          })),
        }, {
          version: 8,
          sources: { provider: { type: 'vector' } },
          layers: [{ id: 'provider-background', type: 'background' }],
        })
        retainedFlightData =
          transformed.sources?.[FLIGHT_GEO_OVERLAY_SOURCE_ID]?.data
      }
    },
    triggerRepaint: () => void 0,
  }
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
    hasExactFlightOverlay: () => true,
    loadProviderStyle: () => provider,
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (previous, next) =>
      retainFlightGeoOverlayDuringStyleSwap(
        previous,
        next,
        readFlightGeoOverlay(),
        '3d',
      ),
  })
  markMapLibreFlightBootstrapApplied(map)
  markMapLibreFlightOverlayPresented(map, readyOverlay)
  markMapLibreFlightReadyFramePresented(
    map,
    readyOverlay.revision,
    readyOverlay.readyFrameRequestId!,
  )
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  const latestOverlay = {
    ...readyOverlay,
    aircraft: {
      ...readyOverlay.aircraft,
      coordinate: [103.821, 1.351] as const,
    },
    camera: {
      ...readyOverlay.camera,
      centerCoordinate: [103.821, 1.351] as const,
    },
    phase: 'flying',
    readyFrameRequestId: null,
    revision: 'flying:delayed-provider:tick-1',
    route: readyOverlay.route.map((point, index) => (
      index === 0
        ? { ...point, coordinate: [103.821, 1.351] as const }
        : point
    )),
    tick: 1,
  } as const
  setFlightGeoOverlay(latestOverlay)
  resolveProvider('provider:delayed')
  await flushMicrotasks()

  assert.deepEqual(applied, [
    'local-flight-bootstrap',
    'provider:delayed',
  ])
  assert.deepEqual(
    retainedFlightData,
    flightGeoOverlayMapLibreFeatureCollection(latestOverlay),
    'provider handoff must retain the latest admitted tick, not Ready tick zero',
  )
  disposeMapLibreFlightBootstrap(map)
})
