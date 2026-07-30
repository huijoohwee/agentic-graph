import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  readFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay.js'
import {
  beginMapLibreFlightBootstrap,
  canMapLibreFlightOverlayPresent,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  markMapLibreFlightReadyFramePresented,
  reconcileMapLibreFlightBootstrap,
  resumeMapLibreFlightBootstrapAfterDisposal,
  suspendMapLibreFlightBootstrapForDisposal,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  readMapLibreFlightBootstrapState,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrapState.js'
import {
  applyProviderStyleImmediately,
  flushMicrotasks,
  readyFlightOverlay,
} from './helpers/flightSimGeoMapLibreLeaseHarness'
import {
  deferFlightGeoPresentationForBootstrapRecovery,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.js'
import {
  promoteMapLibreFlightProviderStyle,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightProviderPromotion.js'
import {
  acquireMapLibreMapDisposalPreparation,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'

test('a cold bootstrap re-arms after a failed disposal fence releases', async context => {
  const styleLoadListeners = new Set<() => void>()
  let styleLoaded = false
  const map = {
    getStyle: () => ({
      version: 8,
      name: 'local-flight-bootstrap',
      sources: {},
      layers: [],
    }),
    isStyleLoaded: () => styleLoaded,
    off: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'style.load') styleLoadListeners.add(listener)
    },
    triggerRepaint: () => void 0,
  }
  context.after(() => disposeMapLibreFlightBootstrap(map))
  const bootstrapStyle = {
    version: 8 as const,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [],
  }

  beginMapLibreFlightBootstrap(map, bootstrapStyle)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, true)

  const releaseDisposal = acquireMapLibreMapDisposalPreparation(map)
  suspendMapLibreFlightBootstrapForDisposal(map)
  assert.equal(readMapLibreFlightBootstrapState(map)?.bootstrapPending, false)

  releaseDisposal()
  resumeMapLibreFlightBootstrapAfterDisposal(map)
  assert.equal(
    readMapLibreFlightBootstrapState(map)?.bootstrapPending,
    true,
    'the constructor-owned bootstrap must regain its settlement listener',
  )

  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  await flushMicrotasks()
  const restored = readMapLibreFlightBootstrapState(map)
  assert.equal(restored?.bootstrapPending, false)
  assert.equal(restored?.bootstrapApplied, true)
})

test('provider idle apply cannot write a style after disposal fencing begins', async () => {
  let scheduledApply: (() => void) | null = null
  const styleCalls: unknown[] = []
  const map = {
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    setStyle: (style: unknown) => styleCalls.push(style),
  }
  const state = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 1,
    map,
  }
  const promotion = promoteMapLibreFlightProviderStyle({
    generation: 1,
    hasCurrentProviderPresentation: () => true,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => ({
      version: 8,
      sources: {},
      layers: [],
    }),
    onApplied: () => assert.fail('fenced provider style must not apply'),
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    retainOverlay: true,
    scheduleProviderApply: apply => {
      scheduledApply = apply
      return () => {
        scheduledApply = null
      }
    },
    state,
  })
  await flushMicrotasks()
  assert.equal(typeof scheduledApply, 'function')

  const releaseDisposal = acquireMapLibreMapDisposalPreparation(map)
  scheduledApply?.()
  assert.equal(await promotion, 'terminated')
  assert.deepEqual(styleCalls, [])
  releaseDisposal()
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
  let currentStyle: Readonly<Record<string, unknown>> = {
    version: 8,
    name: 'initial',
    sources: {},
    layers: [],
  }
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    getStyle: () => currentStyle,
    setStyle: (style: string | Readonly<Record<string, unknown>>) => {
      if (typeof style !== 'string') currentStyle = style
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
      loadProviderStyle: async () => ({
        version: 8,
        name: providerStyle,
        sources: {},
        layers: [],
      }),
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
    let currentStyle: Readonly<Record<string, unknown>> = {
      version: 8,
      name: 'initial',
      sources: {},
      layers: [],
    }
    const map = {
      off: (event: string, listener: () => void) => {
        if (event === 'render') renderListeners.delete(listener)
      },
      on: (event: string, listener: () => void) => {
        if (event === 'render') renderListeners.add(listener)
      },
      getStyle: () => currentStyle,
      setStyle: (
        style: string | Readonly<Record<string, unknown>>,
        options?: Readonly<Record<string, unknown>>,
      ) => {
        if (typeof style !== 'string') currentStyle = style
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
      loadProviderStyle: async () => ({
        version: 8,
        name: providerStyle,
        sources: {},
        layers: [],
      }),
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
    'provider:first',
  ])

  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => ({
      version: 8,
      name: 'provider:first-modern',
      sources: {},
      layers: [],
    }),
    map: firstView.map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  firstView.emitRender()
  await flushMicrotasks()
  assert.deepEqual(firstView.applied, [
    'local-flight-bootstrap',
    'provider:first',
    'provider:first-modern',
  ])

  const replacementView = createMap('provider:replacement')
  markMapLibreFlightBootstrapApplied(replacementView.map)
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => ({
      version: 8,
      name: 'provider:replacement',
      sources: {},
      layers: [],
    }),
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
  assert.deepEqual(replacementView.applied, ['provider:replacement'])

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
    'provider:fresh',
  ])
  disposeMapLibreFlightBootstrap(freshActivationView.map)
})

test('a consumed ready request authorizes only the exact presenting map', async context => {
  const requestId = 41
  const readyOverlay = readyFlightOverlay('ready:consumed', requestId)
  clearFlightGeoOverlay()
  setFlightGeoOverlay(readyOverlay)
  context.after(clearFlightGeoOverlay)
  const renderListeners = new Set<() => void>()
  const styleLoadListeners = new Set<() => void>()
  const applied: string[] = []
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
      if (typeof style !== 'string') {
        currentStyle = style
        styleLoaded = false
      }
      applied.push(typeof style === 'string' ? style : String(style.name))
    },
    triggerRepaint: () => void 0,
  }
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => ({
      version: 8,
      name: 'provider:consumed',
      sources: {},
      layers: [],
    }),
    map,
    scheduleProviderStyleApply: applyProviderStyleImmediately,
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  assert.deepEqual(applied, ['local-flight-bootstrap'])
  markMapLibreFlightBootstrapApplied(map)
  markMapLibreFlightReadyFramePresented(
    map,
    readyOverlay.revision,
    requestId,
  )
  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)
  const consumedOverlay = {
    ...readyOverlay,
    readyFrameRequestId: null,
  }
  setFlightGeoOverlay(consumedOverlay)
  markMapLibreFlightOverlayPresented(map, consumedOverlay)
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)
  assert.deepEqual(applied, [
    'local-flight-bootstrap',
    'provider:consumed',
  ])
  beginMapLibreFlightBootstrap(map, bootstrapStyle)
  map.setStyle(bootstrapStyle)
  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      map,
      consumedOverlay,
      false,
    ),
    true,
    'the production presenter branch must repair consumed Ready visuals without reusing a deadline',
  )
  assert.equal(applied.at(-1), 'local-flight-bootstrap')
  styleLoaded = true
  for (const listener of [...styleLoadListeners]) listener()
  assert.equal(
    canMapLibreFlightOverlayPresent(map, consumedOverlay),
    true,
    'the consumed Ready bootstrap must settle before source restoration',
  )
  assert.equal(
    readFlightGeoOverlayReadyFramePresented(),
    true,
    'visual bootstrap recovery must preserve the already-consumed Ready deadline',
  )
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
