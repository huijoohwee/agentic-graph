import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  fitMapToCityPresentation,
} from '../../../gympgrph/src/cityGeoOverlayMapLibreController.js'
import {
  createSyntheticCityGeoOverlaySnapshot,
} from './helpers/cityGeoOverlayMapLibreHarness.js'

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

export function testCityGeoOverlayPreservesTheVisiblePanelAperture(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const viewport = dom.window.document.createElement('main')
  const workspace = dom.window.document.createElement('aside')
  const floatingPanel = dom.window.document.createElement('aside')
  workspace.setAttribute('aria-label', 'Markdown Workspace')
  floatingPanel.setAttribute('aria-label', 'Floating panel')
  bindRect(viewport, { height: 800, left: 0, top: 0, width: 1_000 })
  bindRect(workspace, { height: 800, left: 0, top: 0, width: 500 })
  bindRect(floatingPanel, { height: 800, left: 750, top: 0, width: 250 })
  dom.window.document.body.append(viewport, workspace, floatingPanel)

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
    fitMapToCityPresentation(
      map,
      createSyntheticCityGeoOverlaySnapshot(),
      '3d',
    ),
    true,
  )
  assert.ok(fitOptions)
  const padding = fitOptions.padding as Record<string, number>
  const visibleApertureWidth = 1_000 - (500 + 16) - (250 + 16)
  const responsiveClearance = visibleApertureWidth * 0.1
  assert.equal(padding.left, 500 + 16 + responsiveClearance)
  assert.equal(padding.right, 250 + 16 + responsiveClearance)
  assert.ok(
    Math.abs(
      1_000 - padding.left - padding.right
      - visibleApertureWidth * 0.8,
    ) < Number.EPSILON * 1_000,
  )
  dom.window.close()
}
