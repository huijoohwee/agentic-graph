import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  FlightGeoOverlayPresentation,
  FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  createFlightGeoOverlayPresentationGate,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'

function flightOverlay(
  phase: FlightGeoOverlaySnapshot['phase'],
  revision: string,
  readyFrameRequestId: number | null = phase === 'ready' ? 1 : null,
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
    phase,
    profileId: 'singapore',
    readyFrameRequestId,
    revision,
    route: [],
    runId: phase === 'stopped' ? 0 : 1,
    tick: 0,
  }
}

function presentationHarness(initial: FlightGeoOverlaySnapshot) {
  let current = initial
  let width = 0
  let repaintCount = 0
  const listeners = new Set<() => void>()
  const canvas = {
    dataset: {} as DOMStringMap,
    getBoundingClientRect: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }
  const map = {
    getCanvas: () => canvas,
    getLayer: (id: string) => (
      Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).some(layerId => layerId === id)
        ? { id }
        : undefined
    ),
    getSource: (id: string) => (
      id === FLIGHT_GEO_OVERLAY_SOURCE_ID ? { id } : undefined
    ),
    off: (type: string, listener: () => void) => {
      if (type === 'render') listeners.delete(listener)
    },
    on: (type: string, listener: () => void) => {
      if (type === 'render') listeners.add(listener)
    },
    triggerRepaint: () => {
      repaintCount += 1
    },
  }
  const presentations: FlightGeoOverlayPresentation[] = []
  const gate = createFlightGeoOverlayPresentationGate({
    active: () => true,
    isCanvasElement: (value): value is HTMLCanvasElement => value === canvas,
    map,
    onPresented: presentation => {
      presentations.push(presentation)
    },
    presented: {
      current: {
        map: null,
        readyFrameRequestId: null,
        revision: '',
      },
    },
    readOverlay: () => current,
    readRoot: () => null,
  })
  return {
    canvas,
    emitRender: () => {
      for (const listener of [...listeners]) listener()
    },
    gate,
    listenerCount: () => listeners.size,
    presentations,
    repaintCount: () => repaintCount,
    setCurrent: (next: FlightGeoOverlaySnapshot) => {
      current = next
    },
    setWidth: (next: number) => {
      width = next
    },
  }
}

test('same-revision stopped presentation can acknowledge a fresh preparation', () => {
  const stopped = flightOverlay('stopped', 'same-stopped-revision')
  const harness = presentationHarness(stopped)
  harness.setWidth(100)

  harness.gate.request(stopped)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)

  harness.gate.request(stopped)
  assert.equal(harness.listenerCount(), 1)
  harness.emitRender()
  assert.equal(harness.presentations.length, 2)
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
