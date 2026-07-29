import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
  type FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  captureNativeGeospatialMapLibreLease,
  claimMapLibreMapLease,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'

const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))
const applyProviderStyleImmediately = (apply: () => void) => {
  apply(); return () => void 0
}

function readyFlightOverlay(
  revision: string,
  readyFrameRequestId: number | null,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: {
        forwardMeters: 2,
        verticalMeters: 1,
      },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: null,
    night: false,
    objective: {
      bearingDegrees: 45,
      coordinate: [103.83, 1.36],
      distanceMeters: 120,
      headingErrorDegrees: 45,
      id: 'landing',
      kind: 'landing',
      label: 'LAND',
    },
    phase: 'ready',
    profileId: 'singapore',
    readyFrameRequestId,
    revision,
    route: [
      {
        id: 'spawn',
        coordinate: [103.82, 1.35],
        altitudeMeters: 400,
        kind: 'spawn',
        state: 'visited',
      },
      {
        id: 'landing',
        coordinate: [103.83, 1.36],
        altitudeMeters: 0,
        kind: 'landing',
        state: 'active',
      },
    ],
    runId: 1,
    tick: 0,
  }
}

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
  assert.equal(renderListeners.size, 0)
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
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: () => void 0,
    triggerRepaint: () => void 0,
  }

  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedPresentation), false)
  assert.equal(canMapLibreFlightOverlayPresent(map, readyOverlay), false)

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => 'provider:bootstrap-presenter',
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.equal(canMapLibreFlightOverlayPresent(map, stoppedPresentation), true)
  assert.equal(canMapLibreFlightOverlayPresent(map, readyOverlay), true)

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

test('provider promotion yields to an idle opportunity and fences stale scheduled style work', async context => {
  const readyOverlay = readyFlightOverlay('ready:idle-promotion', 32)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const pendingStyleApplies = new Set<() => void>()
  const applied: string[] = []
  let cancelledStyleApplies = 0
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
  const scheduleProviderStyleApply = (apply: () => void) => {
    pendingStyleApplies.add(apply)
    let cancelled = false
    return () => {
      if (cancelled) return
      cancelled = true
      if (pendingStyleApplies.delete(apply)) cancelledStyleApplies += 1
    }
  }
  const reconcile = (providerStyle: string) => {
    reconcileMapLibreFlightBootstrap({
      bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
      hasExactFlightOverlay: () => true,
      loadProviderStyle: async () => providerStyle,
      map,
      scheduleProviderStyleApply,
      retainFlightOverlay: (_previous, next) => ({ ...next }),
    })
  }
  const emitRender = () => {
    for (const listener of [...renderListeners]) listener()
  }

  reconcile('provider:stale')
  markMapLibreFlightReadyFramePresented(
    map,
    readyOverlay.revision,
    readyOverlay.readyFrameRequestId!,
  )
  markMapLibreFlightOverlayPresented(map, readyOverlay)
  emitRender()
  await flushMicrotasks()
  assert.deepEqual(applied, ['local-flight-bootstrap'])
  assert.equal(pendingStyleApplies.size, 1)

  reconcile('provider:current')
  emitRender()
  await flushMicrotasks()
  assert.equal(cancelledStyleApplies, 1)
  assert.equal(pendingStyleApplies.size, 1)

  const [applyCurrentStyle] = [...pendingStyleApplies]
  pendingStyleApplies.delete(applyCurrentStyle!)
  applyCurrentStyle?.()
  await flushMicrotasks()
  assert.deepEqual(applied, [
    'local-flight-bootstrap',
    'provider:current',
  ])
  disposeMapLibreFlightBootstrap(map)
})

test('a ready Flight activation follows native MapLibre view replacements and resets on Exit', async context => {
  const bootstrapStyle = { version: 8, name: 'local-flight-bootstrap' }
  const createMap = (providerStyle: string) => {
    const renderListeners = new Set<() => void>()
    const applied: string[] = []
    const map = {
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
        applied.push(
          typeof style === 'string'
            ? `${style}:${options?.transformStyle ? 'retained' : 'plain'}`
            : String(style.name || 'local'),
        )
      },
      triggerRepaint: () => void 0,
    }
    const reconcile = () => reconcileMapLibreFlightBootstrap({
      bootstrapStyle,
      hasExactFlightOverlay: () => true,
      loadProviderStyle: async () => providerStyle,
      map,
      scheduleProviderStyleApply: applyProviderStyleImmediately,
      retainFlightOverlay: (_previous, next) => ({ ...next }),
    })
    return {
      applied,
      emitRender: () => {
        for (const listener of [...renderListeners]) listener()
      },
      map,
      reconcile,
    }
  }
  context.after(() => {
    clearFlightGeoOverlay()
  })

  const firstReady = readyFlightOverlay('ready:activation-1', 41)
  setFlightGeoOverlay(firstReady)
  const firstView = createMap('provider:first')
  firstView.reconcile()
  firstView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(firstView.applied, ['local-flight-bootstrap'])

  markMapLibreFlightReadyFramePresented(
    firstView.map,
    firstReady.revision,
    firstReady.readyFrameRequestId!,
  )
  markMapLibreFlightOverlayPresented(firstView.map, firstReady)
  firstView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(firstView.applied, [
    'local-flight-bootstrap',
    'provider:first:retained',
  ])

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => 'provider:first-modern',
    map: firstView.map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  firstView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(firstView.applied, [
    'local-flight-bootstrap',
    'provider:first:retained',
    'provider:first-modern:retained',
  ])

  const replacementView = createMap('provider:replacement')
  markMapLibreFlightBootstrapApplied(replacementView.map)
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => 'provider:replacement',
    map: replacementView.map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  replacementView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(replacementView.applied, [])

  markMapLibreFlightOverlayPresented(replacementView.map, firstReady)
  replacementView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(replacementView.applied, ['provider:replacement:retained'])

  disposeMapLibreFlightBootstrap(firstView.map)
  disposeMapLibreFlightBootstrap(replacementView.map)
  clearFlightGeoOverlay()
  const secondReady = readyFlightOverlay('ready:activation-2', 42)
  setFlightGeoOverlay(secondReady)
  const freshActivationView = createMap('provider:fresh')
  freshActivationView.reconcile()
  freshActivationView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(freshActivationView.applied, ['local-flight-bootstrap'])

  markMapLibreFlightReadyFramePresented(
    freshActivationView.map,
    secondReady.revision,
    secondReady.readyFrameRequestId!,
  )
  markMapLibreFlightOverlayPresented(freshActivationView.map, secondReady)
  freshActivationView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(freshActivationView.applied, [
    'local-flight-bootstrap',
    'provider:fresh:retained',
  ])
  disposeMapLibreFlightBootstrap(freshActivationView.map)
})

test('a consumed ready request authorizes only the exact presenting map', async context => {
  const readyOverlay = readyFlightOverlay('ready:consumed', null)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const applied: string[] = []
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
    loadProviderStyle: async () => 'provider:consumed',
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.deepEqual(applied, ['local-flight-bootstrap'])
  assert.equal(readFlightGeoOverlayReadyFramePresented(), false)

  markMapLibreFlightOverlayPresented(map, readyOverlay)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.equal(readFlightGeoOverlayReadyFramePresented(), false)
  assert.deepEqual(applied, [
    'local-flight-bootstrap',
    'provider:consumed',
  ])
  disposeMapLibreFlightBootstrap(map)
})

test('Flight deactivation restores the provider without waiting for overlay presentation', async () => {
  const renderListeners = new Set<() => void>()
  const applied: Array<{
    style: string | Readonly<Record<string, unknown>>
    retained: boolean
  }> = []
  const map = {
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
      applied.push({
        style,
        retained: Boolean(options?.transformStyle),
      })
    },
    triggerRepaint: () => void 0,
  }
  const options = {
    hasExactFlightOverlay: () => false,
    loadProviderStyle: async () => 'https://provider.test/style.json',
    map,
    retainFlightOverlay: (
      _previous: Readonly<Record<string, any>> | undefined,
      next: Readonly<Record<string, any>>,
    ) => ({ ...next }),
  }

  reconcileMapLibreFlightBootstrap({
    ...options,
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
  })
  assert.equal(renderListeners.size, 1)

  reconcileMapLibreFlightBootstrap({
    ...options,
    bootstrapStyle: null,
  })
  await flushMicrotasks()

  assert.equal(renderListeners.size, 0)
  assert.equal(applied.length, 2)
  assert.equal(applied[1]?.style, 'https://provider.test/style.json')
  assert.equal(applied[1]?.retained, false)
  disposeMapLibreFlightBootstrap(map)
})
