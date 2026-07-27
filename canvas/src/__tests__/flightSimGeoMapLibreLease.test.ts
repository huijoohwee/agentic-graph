import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  setFlightGeoOverlay,
  type FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  captureNativeGeospatialMapLibreLease,
  claimMapLibreMapLease,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'

const flushMicrotasks = async () => {
  await new Promise<void>(resolve => setImmediate(resolve))
}

const applyProviderStyleImmediately = (apply: () => void) => {
  apply()
  return () => void 0
}

function readyFlightOverlay(
  revision: string,
  readyFrameRequestId: number,
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
    night: false,
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

test('stale ready identity cannot authorize provider promotion', async context => {
  const readyOverlay = readyFlightOverlay('ready:current', 31)
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
    loadProviderStyle: async () => 'provider:stale',
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  markMapLibreFlightReadyFramePresented(map, 'ready:stale', 30)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.deepEqual(applied, ['local-flight-bootstrap'])
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
  assert.deepEqual(replacementView.applied, [
    'provider:replacement:retained',
  ])

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
  freshActivationView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(freshActivationView.applied, [
    'local-flight-bootstrap',
    'provider:fresh:retained',
  ])
  disposeMapLibreFlightBootstrap(freshActivationView.map)
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
