import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import type { FlightGeoOverlaySnapshot } from '../../../gympgrph/src/flightGeoOverlay'
import {
  applyFlightGeoOverlayCameraToMap,
  fitMapToFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import { readGeoMapViewportPadding } from '../../../gympgrph/src/geoMapViewport'
import { flightOverlay } from './helpers/flightSimMapLibreFixtures'

test('Flight camera preserves 2D north-up and 3D oblique mode ownership', () => {
  const calls: Record<string, unknown>[] = []
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const map = {
    jumpTo: (camera: Record<string, unknown>) => calls.push(camera),
  }
  const overlay = flightOverlay(72)

  for (const mode of ['2d', '2d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode, padding),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 0)
    assert.equal(calls.at(-1)?.bearing, 0)
    assert.deepEqual(calls.at(-1)?.padding, padding)
  }
  for (const mode of ['3d', '3d-modern']) {
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, overlay, mode, padding),
      true,
    )
    assert.equal(calls.at(-1)?.pitch, 48)
    assert.equal(calls.at(-1)?.bearing, 72)
    assert.deepEqual(calls.at(-1)?.padding, padding)
  }
  assert.equal(
    applyFlightGeoOverlayCameraToMap(
      map,
      { ...overlay, phase: 'stopped' },
      '3d',
      padding,
    ),
    false,
  )
  assert.equal(calls.length, 4)
})

test('stopped preparation stages each tick-zero camera so Ready does not jump again', () => {
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const calls: Record<string, unknown>[] = []
  let camera = {
    bearing: 0,
    center: [0, 0] as [number, number],
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    pitch: 0,
    zoom: 0,
  }
  const map = {
    getBearing: () => camera.bearing,
    getCenter: () => ({ lng: camera.center[0], lat: camera.center[1] }),
    getPadding: () => camera.padding,
    getPitch: () => camera.pitch,
    getZoom: () => camera.zoom,
    jumpTo: (next: Record<string, unknown>) => {
      calls.push(next)
      const center = next.center as [number, number]
      camera = {
        bearing: Number(next.bearing),
        center: [Number(center[0]), Number(center[1])],
        padding: next.padding as typeof camera.padding,
        pitch: Number(next.pitch),
        zoom: Number(next.zoom),
      }
    },
  }
  for (const mode of ['2d', '2d-modern', '3d', '3d-modern']) {
    const ready = flightOverlay(72)
    const stopped = {
      ...ready,
      phase: 'stopped' as const,
      readyFrameRequestId: null,
      revision: `stopped:aircraft:${mode}`,
      runId: 0,
    }
    const callsBeforeStage = calls.length
    assert.equal(
      applyFlightGeoOverlayCameraToMap(
        map,
        stopped,
        mode,
        padding,
        { stageStopped: true },
      ),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 1)
    assert.deepEqual(calls.at(-1), {
      bearing: mode.startsWith('3d') ? 72 : 0,
      center: [103.82, 1.35],
      padding,
      pitch: mode.startsWith('3d') ? 48 : 0,
      zoom: 15.5,
    })

    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, ready, mode, padding),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 1)

    const moved = {
      ...ready,
      aircraft: { ...ready.aircraft, headingDegrees: 18 },
      camera: {
        ...ready.camera,
        centerCoordinate: [103.821, 1.351] as const,
      },
    }
    assert.equal(
      applyFlightGeoOverlayCameraToMap(map, moved, mode, padding),
      true,
    )
    assert.equal(calls.length, callsBeforeStage + 2)
  }
})

test('Flight camera reserves a panel that crosses the compact map centre', () => {
  const dom = new JSDOM('<main><section id="map"></section><aside aria-label="Floating panel"></aside></main>')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  try {
    const mapContainer = dom.window.document.querySelector('#map') as HTMLElement
    const panel = dom.window.document.querySelector('[aria-label="Floating panel"]') as HTMLElement
    Object.defineProperties(mapContainer, {
      clientHeight: { configurable: true, value: 962 },
      clientWidth: { configurable: true, value: 550 },
    })
    mapContainer.getBoundingClientRect = () => ({
      bottom: 962, height: 962, left: 550, right: 1100, top: 0, width: 550,
    } as DOMRect)
    panel.getBoundingClientRect = () => ({
      bottom: 953, height: 944, left: 747, right: 1091, top: 9, width: 344,
    } as DOMRect)

    assert.deepEqual(
      readGeoMapViewportPadding({ getContainer: () => mapContainer }),
      { bottom: 112, left: 44, right: 369, top: 88 },
    )
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete (globalThis as { window?: Window }).window
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete (globalThis as { document?: Document }).document
    dom.window.close()
  }
})

test('Flight fit includes XR surfaces and the visual map aperture', () => {
  const calls: unknown[][] = []
  const padding = { top: 24, right: 412, bottom: 48, left: 652 }
  const overlay: FlightGeoOverlaySnapshot = {
    ...flightOverlay(),
    environment: {
      anchor: [103.851959, 1.29027],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.605, 1.158], [104.09, 1.48]],
      revision: 'stage:exact',
      stageFootprint: [
        [103.8, 1.2], [103.9, 1.2], [103.9, 1.3], [103.8, 1.3], [103.8, 1.2],
      ],
      surfaces: [{
        baseHeightMeters: 0,
        color: '#0f766e',
        heightMeters: 1.6,
        id: 'stage-footprint',
        kind: 'stage-footprint',
        label: 'Singapore stage footprint',
        poiId: null,
        ring: [
          [103.8, 1.2], [103.9, 1.2], [103.9, 1.3], [103.8, 1.3], [103.8, 1.2],
        ],
      }],
    },
  }
  const map = {
    fitBounds: (...args: unknown[]) => calls.push(args),
  }

  assert.equal(fitMapToFlightGeoOverlay(map, overlay, padding), true)
  assert.deepEqual(calls[0]?.[0], [[103.8, 1.2], [103.9, 1.36]])
  assert.deepEqual(
    (calls[0]?.[1] as { padding?: unknown })?.padding,
    padding,
  )
})
