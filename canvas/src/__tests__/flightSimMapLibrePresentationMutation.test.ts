import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

import {
  clearFlightGeoOverlay,
  markFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
  type FlightGeoOverlaySnapshot,
} from 'gympgrph/testkit/flightGeoOverlay'
import {
  FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT,
  FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
  useFlightGeoOverlayMapLibrePresentation,
} from 'gympgrph/testkit/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from 'gympgrph/testkit/flightGeoOverlayMapLibre'
import {
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from 'gympgrph/testkit/flightGeoEnvironmentMapLibre'
import {
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from 'gympgrph/testkit/features/geospatial/flightGeoPresentationDebug'
import {
  flightOverlay,
  presentationHarness,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'

test('a style reload invalidates a stopped frame before Ready can reuse it', () => {
  const stopped = flightOverlay('stopped', 'stopped:style-reload', null)
  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 9,
    revision: 'ready:style-reload',
    runId: 1,
  }
  const harness = presentationHarness(stopped)
  harness.setWidth(100)
  harness.gate.request(stopped)
  harness.emitRender()
  harness.emitStyleLoad()
  harness.setCurrent(ready)

  assert.equal(harness.gate.canReuseCommittedStoppedFrame(ready), false)
  harness.gate.request(ready)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 9)
})

test('mutated Ready visuals fall back to a new native MapLibre render', () => {
  const exerciseFallback = (args: Readonly<{
    label: string
    prepare: (harness: ReturnType<typeof presentationHarness>) => void
    ready: FlightGeoOverlaySnapshot
    restore?: (harness: ReturnType<typeof presentationHarness>) => void
    settlementSourceId?: string
    stopped: FlightGeoOverlaySnapshot
  }>) => {
    const harness = presentationHarness(args.stopped)
    harness.setWidth(100)
    harness.gate.request(args.stopped)
    harness.emitRender()
    const repaintsBeforeReady = harness.repaintCount()
    harness.setCurrent(args.ready)
    args.prepare(harness)

    assert.equal(
      harness.gate.canReuseCommittedStoppedFrame(args.ready),
      false,
      `${args.label} must fail the private stopped-frame proof`,
    )
    harness.gate.request(args.ready)
    assert.equal(
      harness.listenerCount(),
      1,
      `${args.label} must not reuse the stopped painter frame`,
    )
    if (args.settlementSourceId) {
      assert.equal(
        harness.repaintCount(),
        repaintsBeforeReady,
        `${args.label} must wait for worker settlement without repaint churn`,
      )
    } else {
      assert.ok(harness.repaintCount() > repaintsBeforeReady)
    }
    args.restore?.(harness)
    if (args.settlementSourceId) {
      harness.emitSourceData(args.settlementSourceId)
      assert.ok(harness.repaintCount() > repaintsBeforeReady)
    }
    harness.emitRender()
    assert.equal(harness.presentations.length, 2)
    assert.equal(harness.presentations.at(-1)?.revision, args.ready.revision)
  }

  const stopped = flightOverlay('stopped', 'stopped:mutations', null)
  exerciseFallback({
    label: 'aircraft coordinate mutation',
    stopped,
    ready: {
      ...stopped,
      aircraft: {
        ...stopped.aircraft,
        coordinate: [103.821, 1.351],
      },
      camera: {
        ...stopped.camera,
        centerCoordinate: [103.821, 1.351],
      },
      phase: 'ready',
      readyFrameRequestId: 1,
      revision: 'ready:coordinate-mutation',
      runId: 1,
    },
    prepare: () => undefined,
  })

  const stoppedWithEnvironment = withEnvironment({
    ...stopped,
    revision: 'stopped:environment-mutation',
  })
  exerciseFallback({
    label: 'environment extrusion-height mutation',
    stopped: stoppedWithEnvironment,
    ready: {
      ...stoppedWithEnvironment,
      environment: {
        ...stoppedWithEnvironment.environment!,
        surfaces: stoppedWithEnvironment.environment!.surfaces.map(surface => ({
          ...surface,
          heightMeters: 12,
        })),
      },
      phase: 'ready',
      readyFrameRequestId: 2,
      revision: 'ready:environment-height-mutation',
      runId: 1,
    },
    prepare: () => undefined,
  })

  const ready = {
    ...stopped,
    phase: 'ready' as const,
    readyFrameRequestId: 3,
    revision: 'ready:layer-mutation',
    runId: 1,
  }
  exerciseFallback({
    label: 'missing aircraft layer',
    stopped,
    ready,
    prepare: harness => {
      harness.setLayerPresent(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft, false)
    },
    restore: harness => {
      harness.setLayerPresent(FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft, true)
    },
  })
  exerciseFallback({
    label: 'unsettled overlay source',
    stopped,
    ready: { ...ready, readyFrameRequestId: 4, revision: 'ready:overlay-pending' },
    prepare: harness => harness.setOverlaySourceLoaded(false),
    restore: harness => harness.setOverlaySourceLoaded(true),
    settlementSourceId: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  })
  exerciseFallback({
    label: 'unsettled environment source',
    stopped: stoppedWithEnvironment,
    ready: {
      ...stoppedWithEnvironment,
      phase: 'ready',
      readyFrameRequestId: 5,
      revision: 'ready:environment-pending',
      runId: 1,
    },
    prepare: harness => harness.setEnvironmentSourceLoaded(false),
    restore: harness => harness.setEnvironmentSourceLoaded(true),
    settlementSourceId: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
  })
  exerciseFallback({
    label: 'camera mutation',
    stopped,
    ready: { ...ready, readyFrameRequestId: 6, revision: 'ready:camera-mutation' },
    prepare: harness => harness.setCameraExact(false),
    restore: harness => harness.setCameraExact(true),
  })
  exerciseFallback({
    label: 'style fingerprint mutation without a style-load event',
    stopped,
    ready: {
      ...ready,
      readyFrameRequestId: 7,
      revision: 'ready:style-fingerprint-mutation',
    },
    prepare: harness => harness.setStyleFingerprint('style:mutated'),
    restore: harness => harness.setStyleFingerprint('style:bootstrap'),
  })
  exerciseFallback({
    label: 'canvas dimension mutation',
    stopped,
    ready: {
      ...ready,
      readyFrameRequestId: 8,
      revision: 'ready:canvas-dimension-mutation',
    },
    prepare: harness => harness.setWidth(101),
    restore: harness => harness.setWidth(100),
  })
  exerciseFallback({
    label: 'resize event after stopped commit',
    stopped,
    ready: {
      ...ready,
      readyFrameRequestId: 9,
      revision: 'ready:resize-event',
    },
    prepare: harness => harness.emitResize(),
  })
  exerciseFallback({
    label: 'environment layer-order mutation',
    stopped: stoppedWithEnvironment,
    ready: {
      ...stoppedWithEnvironment,
      phase: 'ready',
      readyFrameRequestId: 10,
      revision: 'ready:environment-layer-order',
      runId: 1,
    },
    prepare: harness => {
      harness.setEnvironmentLayerOrder([
        FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline,
        FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d,
        FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d,
      ])
    },
    restore: harness => {
      assert.equal(
        applyFlightGeoOverlayToMap(harness.map, stoppedWithEnvironment),
        true,
        'normal Flight application must repair the complete layer stack',
      )
    },
  })
  exerciseFallback({
    label: 'material camera coordinate mutation',
    stopped,
    ready: {
      ...ready,
      camera: {
        ...ready.camera,
        centerCoordinate: [103.82, 1.35000002],
      },
      readyFrameRequestId: 11,
      revision: 'ready:camera-coordinate-mutation',
    },
    prepare: () => undefined,
  })
})

test('a new stopped Flight request clears prior settlement proof before recording its own', () => {
  const root = { dataset: {} as DOMStringMap } as HTMLElement
  const priorStopped = flightOverlay('stopped', 'stopped:prior')
  recordFlightGeoStoppedPresentation(root, priorStopped, 'prior-camera')

  const currentStopped = {
    ...priorStopped,
    revision: 'stopped:current',
  }
  writeFlightGeoPresentationDebug(root, currentStopped, 0)
  assert.equal(root.dataset.kgFlightGeospatialStoppedRevision, undefined)
  assert.equal(root.dataset.kgFlightGeospatialStoppedProfileId, undefined)

  recordFlightGeoStoppedPresentation(root, currentStopped)
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedRevision,
    'stopped:current',
  )
  assert.equal(root.dataset.kgFlightGeospatialStoppedRunId, '0')
  assert.equal(root.dataset.kgFlightGeospatialStoppedCameraSignature, undefined)
})

test('a fresh ready-frame request re-arms the same deterministic revision', () => {
  const priorReady = flightOverlay('ready', 'same-ready-revision', 1)
  const harness = presentationHarness(priorReady)
  harness.setWidth(100)

  harness.gate.request(priorReady)
  harness.emitRender()
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 1)

  const stopped = flightOverlay('stopped', 'stopped-revision')
  harness.setCurrent(stopped)
  harness.gate.request(stopped)
  assert.equal(harness.listenerCount(), 1)

  const freshReady = flightOverlay('ready', 'same-ready-revision', 2)
  harness.setCurrent(freshReady)
  harness.gate.request(freshReady)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()

  assert.equal(harness.presentations.length, 2)
  assert.equal(harness.presentations.at(-1)?.readyFrameRequestId, 2)
})

test('transient invalid first render retries before exact MapLibre acknowledgement', () => {
  const ready = flightOverlay('ready', 'ready:1:0')
  const harness = presentationHarness(ready)

  harness.gate.request(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)
  assert.ok(harness.repaintCount() >= 2)

  harness.setWidth(100)
  harness.emitRender()
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrameSurface, 'maplibre')
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
})

test('previously presented ready overlay waits through provider-style source settlement', context => {
  const ready = flightOverlay(
    'ready',
    'ready:provider-settlement',
    44,
  )
  clearFlightGeoOverlay()
  setFlightGeoOverlay(ready)
  context.after(clearFlightGeoOverlay)
  assert.equal(
    markFlightGeoOverlayReadyFramePresented(
      ready.revision,
      ready.readyFrameRequestId!,
    ),
    true,
  )
  const harness = presentationHarness(ready)
  assert.ok(
    FLIGHT_GEO_PREPARATION_RENDER_ATTEMPT_LIMIT
      > FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT,
  )

  harness.setWidth(100)
  harness.replaceSourceData(null)
  harness.gate.request(ready)
  for (
    let attempt = 0;
    attempt <= FLIGHT_GEO_READY_RENDER_ATTEMPT_LIMIT;
    attempt += 1
  ) {
    harness.emitRender()
  }
  assert.equal(
    harness.listenerCount(),
    1,
    'a consumed request must survive beyond the one-shot first-frame budget',
  )

  harness.replaceSourceData(ready)
  harness.emitRender()
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.presentations[0]?.readyFrameRequestId, 44)
})

test('retained layers with stale empty data cannot acknowledge a ready frame', () => {
  const ready = flightOverlay('ready', 'ready:exact-source')
  const harness = presentationHarness(ready)
  harness.setWidth(100)
  harness.replaceSourceData(null)

  harness.gate.request(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(harness.listenerCount(), 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, undefined)

  harness.replaceSourceData(ready)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.canvas.dataset.kgFlightSimFirstFrame, '1')
})

test('the React presentation owner retains earned first-frame proof only on the same active canvas', async () => {
  const { dom, restore } = initJsdomHarness()
  const canvasConstructor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
  Object.defineProperty(globalThis, 'HTMLCanvasElement', {
    configurable: true, value: dom.window.HTMLCanvasElement,
  })
  const container = dom.window.document.createElement('main')
  const viewport = dom.window.document.createElement('section')
  dom.window.document.body.append(container, viewport)
  const root = createRoot(container)
  const rootRef = { current: viewport }
  const presentations: Array<{ readyFrameRequestId: number | null }> = []
  const onPresented = (presentation: { readyFrameRequestId: number | null; revision: string }) => {
    presentations.push(presentation)
    if (presentation.readyFrameRequestId !== null) {
      assert.equal(markFlightGeoOverlayReadyFramePresented(
        presentation.revision, presentation.readyFrameRequestId,
      ), true)
    }
  }
  const createMap = (overlay: FlightGeoOverlaySnapshot) => {
    const harness = presentationHarness(overlay)
    harness.gate.dispose()
    harness.setWidth(100)
    const canvas = dom.window.document.createElement('canvas')
    canvas.width = canvas.height = 100
    canvas.getBoundingClientRect = harness.canvas.getBoundingClientRect
    harness.map.getCanvas = () => canvas
    viewport.append(canvas)
    return { ...harness, canvas }
  }
  let ready = flightOverlay('ready', 'ready:hook-lifecycle', 91)
  const first = createMap(ready)
  let map = first.map
  let active = true
  let enabled = true
  let graphRevision = 1
  const Presentation = () => {
    useFlightGeoOverlayMapLibrePresentation({
      active, enhancedLayerBounds: null, graphRevision, map,
      mapLibreRuntimeEnabled: enabled, onPresented, rootRef,
      styleRevision: 1, viewMode: '3d',
    })
    return null
  }
  const render = async () => {
    await act(async () => { root.render(React.createElement(Presentation)) })
  }
  const publish = (harness: ReturnType<typeof createMap>, overlay: FlightGeoOverlaySnapshot) => {
    harness.setCurrent(overlay)
    setFlightGeoOverlay(overlay)
  }
  clearFlightGeoOverlay()
  publish(first, ready)
  try {
    await render()
    first.emitRender()
    assert.equal(first.canvas.dataset.kgFlightSimFirstFrame, '1')
    assert.equal(presentations.at(-1)?.readyFrameRequestId, 91)
    ready = { ...ready, readyFrameRequestId: null }
    publish(first, ready)
    first.emitRender()
    assert.equal(presentations.at(-1)?.readyFrameRequestId, null)

    graphRevision += 1
    await render()
    assert.equal(first.canvas.dataset.kgFlightSimFirstFrame, '1',
      'same-map effect restart must retain the actual previously committed frame')
    first.emitRender()
    assert.equal(first.canvas.dataset.kgFlightSimFirstFrameSurface, 'maplibre')

    const second = createMap(ready)
    map = second.map
    await render()
    assert.equal(first.canvas.dataset.kgFlightSimFirstFrame, undefined,
      'replacement must clear proof on the old map canvas')
    second.emitRender()
    assert.equal(second.canvas.dataset.kgFlightSimFirstFrame, undefined,
      'a consumed request cannot manufacture proof on a new map canvas')

    for (const boundary of ['inactive', 'disabled', 'overlay-inactive', 'stopped', 'unmounted'] as const) {
      ready = flightOverlay('ready', `ready:hook-${boundary}`, 92)
      publish(second, ready)
      second.emitRender()
      assert.equal(second.canvas.dataset.kgFlightSimFirstFrame, '1', boundary)
      if (boundary === 'inactive') active = false
      if (boundary === 'disabled') enabled = false
      if (boundary === 'overlay-inactive') publish(second, { ...ready, active: false })
      if (boundary === 'stopped') publish(second, flightOverlay('stopped', 'stopped:hook'))
      if (boundary === 'unmounted') {
        await act(async () => { root.render(null) })
      } else await render()
      assert.equal(second.canvas.dataset.kgFlightSimFirstFrame, undefined, boundary)
      assert.equal(second.canvas.dataset.kgFlightSimFirstFrameSurface, undefined, boundary)
      active = enabled = true
      await render()
    }
  } finally {
    await act(async () => { root.unmount() })
    clearFlightGeoOverlay()
    container.remove()
    viewport.remove()
    if (canvasConstructor) Object.defineProperty(globalThis, 'HTMLCanvasElement', canvasConstructor)
    else delete (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement
    restore()
  }
})
