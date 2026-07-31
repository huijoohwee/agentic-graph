import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  fitMapToCityGeoOverlay,
} from '../../../gympgrph/src/cityGeoOverlayMapLibreController.js'
import {
  REGIONAL_POI_LABEL_OCCLUSION_CLEARANCE_PIXELS,
} from '../../../gympgrph/src/regionalPoiMapLibre.js'
import { createSyntheticSnapshot } from './cityGeoOverlayMapLibre.test.js'

type Rect = Readonly<{
  height: number
  left: number
  top: number
  width: number
}>

function bindRect(element: HTMLElement, rect: Rect): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: rect.height },
    clientWidth: { configurable: true, value: rect.width },
  })
  element.getBoundingClientRect = () => ({
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })
}

export function testCityGeoOverlayReservesPoiLabelsOutsideOccludingPanel(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const viewport = dom.window.document.createElement('main')
  const panel = dom.window.document.createElement('aside')
  panel.setAttribute('aria-label', 'Floating panel')
  bindRect(viewport, { height: 800, left: 0, top: 0, width: 1_000 })
  bindRect(panel, { height: 800, left: 700, top: 0, width: 300 })
  dom.window.document.body.append(viewport, panel)

  let fitOptions: Record<string, unknown> | null = null
  const map = {
    fitBounds: (_bounds: unknown, options: Record<string, unknown>) => {
      fitOptions = options
    },
    getContainer: () => viewport,
    getPadding: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
    setPadding: () => void 0,
  }
  assert.equal(
    fitMapToCityGeoOverlay(map, createSyntheticSnapshot(), '3d'),
    true,
  )
  assert.ok(fitOptions)
  const padding = fitOptions.padding as Record<string, number>
  const occludedWidthWithBaseClearance = 300 + 16
  assert.equal(
    padding.right,
    occludedWidthWithBaseClearance
      + REGIONAL_POI_LABEL_OCCLUSION_CLEARANCE_PIXELS,
  )
  assert.equal(padding.left, 108)
  assert.ok(padding.right > padding.left)
  dom.window.close()
}
