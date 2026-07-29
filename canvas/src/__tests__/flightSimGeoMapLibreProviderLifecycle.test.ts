import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  applyProviderStyleImmediately,
  flushMicrotasks,
  readyFlightOverlay,
} from './helpers/flightSimGeoMapLibreLeaseHarness'

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
  markMapLibreFlightBootstrapApplied(map)
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
  markMapLibreFlightBootstrapApplied(firstView.map)
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
  markMapLibreFlightBootstrapApplied(freshActivationView.map)
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
  markMapLibreFlightBootstrapApplied(map)

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
  const styleLoadListeners = new Set<() => void>()
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    layers: [{ id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' }],
  }
  let currentStyle: Readonly<Record<string, unknown>> = bootstrapStyle
  let styleLoaded = false
  const applied: Array<{
    style: string | Readonly<Record<string, unknown>>
    retained: boolean
  }> = []
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
    bootstrapStyle,
  })
  assert.equal(renderListeners.size, 1)
  const staleBootstrapLoads = [...styleLoadListeners]

  reconcileMapLibreFlightBootstrap({
    ...options,
    bootstrapStyle: null,
  })
  await flushMicrotasks()

  assert.equal(renderListeners.size, 0)
  assert.equal(applied.length, 2)
  assert.equal(applied[1]?.style, 'https://provider.test/style.json')
  assert.equal(applied[1]?.retained, false)
  currentStyle = bootstrapStyle
  styleLoaded = true
  for (const listener of staleBootstrapLoads) listener()
  assert.equal(
    applied.length,
    2,
    'a late bootstrap style.load after Exit cannot reclaim the restored provider',
  )
  disposeMapLibreFlightBootstrap(map)
})

