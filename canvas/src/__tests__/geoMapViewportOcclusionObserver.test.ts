import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readGeoMapOcclusionPadding, readGeoMapViewportPadding } from 'gympgrph/testkit/geoMapViewport'
import { createCityGeoOverlayMapLibreController } from 'gympgrph/testkit/cityGeoOverlayMapLibreController'
import { createSyntheticCityGeoOverlaySnapshot, TestMapLibreMap } from './helpers/cityGeoOverlayMapLibreHarness'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)

test('camera padding follows actual viewport size in full, inset and embedded canvases', () => {
  const dom = new JSDOM('<main><section id="map"></section></main><aside data-kg-workspace-visible-viewport-occluder="left"></aside>')
  const doc = dom.window.document
  const frame = doc.querySelector('main')!
  const viewport = doc.querySelector<HTMLElement>('#map')!
  const editor = doc.querySelector<HTMLElement>('aside')!
  let width = 1106
  Object.defineProperties(viewport, { clientWidth: { get: () => width }, clientHeight: { value: 952 } })
  viewport.getBoundingClientRect = () => rect(0, 0, width, 952)
  const map = { getContainer: () => viewport }
  try {
    for (const mode of [null, 'full', 'inset']) {
      if (mode) frame.setAttribute('data-kg-canvas-view-container', mode)
      else frame.removeAttribute('data-kg-canvas-view-container')
      for (const editorWidth of [320, 400, 520]) {
        editor.getBoundingClientRect = () => rect(0, 0, editorWidth, 952)
        assert.deepEqual(readGeoMapViewportPadding(map), { bottom: 112, left: 72, right: 72, top: 88 })
        assert.equal(readGeoMapOcclusionPadding(viewport).left, editorWidth + 16,
          'control clearance remains independent from camera framing')
      }
    }
    width = 600
    assert.deepEqual(readGeoMapViewportPadding(map), { bottom: 112, left: 48, right: 48, top: 88 })
    editor.remove()
    assert.deepEqual(readGeoMapViewportPadding(map), { bottom: 112, left: 48, right: 48, top: 88 })
  } finally { dom.window.close() }
})

test('City camera centers gameplay inside the visible MapLibre aperture', () => {
  const dom = new JSDOM('<main id="map"></main><aside aria-label="Floating panel"></aside>')
  const [viewport, panel] = Array.from(dom.window.document.body.children) as HTMLElement[]
  Object.defineProperties(viewport, { clientWidth: { value: 1106 }, clientHeight: { value: 952 } })
  viewport.getBoundingClientRect = () => rect(0, 0, 1106, 952)
  panel.getBoundingClientRect = () => rect(760, 0, 346, 700)
  const map = new TestMapLibreMap({ container: viewport })
  const basePadding = readGeoMapViewportPadding(map)
  const controller = createCityGeoOverlayMapLibreController({
    map,
    readSnapshot: () => createSyntheticCityGeoOverlaySnapshot(),
    subscribe: () => () => {},
    viewMode: '3d',
  })
  try {
    assert.equal(map.fitBoundsCalls.length, 1)
    const fittedPadding = map.fitBoundsCalls[0].options.padding as { right: number }
    assert.ok(
      fittedPadding.right > basePadding.right,
      'the panel occlusion shifts City gameplay toward the visible side of the map',
    )
  } finally {
    controller.dispose()
    dom.window.close()
  }
})

test('City camera reframes when editor occlusion changes and on native map resize', async () => {
  const dom = new JSDOM('<main></main><aside aria-label="Markdown Workspace"></aside>')
  const [viewport, editor] = Array.from(dom.window.document.body.children) as HTMLElement[]
  let width = 1106, editorWidth = 400
  Object.defineProperties(viewport, { clientWidth: { get: () => width }, clientHeight: { value: 952 } })
  viewport.getBoundingClientRect = () => rect(0, 0, width, 952)
  editor.getBoundingClientRect = () => rect(0, 0, editorWidth, 952)
  const map = new TestMapLibreMap({ container: viewport })
  const snapshot = createSyntheticCityGeoOverlaySnapshot()
  const controller = createCityGeoOverlayMapLibreController({
    map, readSnapshot: () => snapshot, subscribe: () => () => {}, viewMode: '3d',
  })
  try {
    assert.equal(map.fitBoundsCalls.length, 1)
    const editorFraming = map.fitBoundsCalls[0].options.padding as { left: number }
    editor.style.display = 'none'
    await new Promise(resolve => dom.window.setTimeout(resolve, 150))
    assert.equal(map.fitBoundsCalls.length, 2, 'closing an occluding editor reapplies the camera')
    const openMapFraming = map.fitBoundsCalls[1].options.padding as { left: number }
    assert.ok(openMapFraming.left < editorFraming.left,
      'the camera uses the wider aperture after the editor closes')
    editor.style.removeProperty('display')
    await new Promise(resolve => dom.window.setTimeout(resolve, 150))
    assert.equal(map.fitBoundsCalls.length, 3, 'reopening the editor reapplies the camera')
    width = 600; map.emit('resize')
    assert.equal(map.fitBoundsCalls.length, 4, 'actual map viewport resize refits')
    map.emit('resize')
    assert.equal(map.fitBoundsCalls.length, 4, 'unchanged dimensions do not refit twice')
  } finally {
    controller.dispose()
    assert.equal(map.styleListeners.get('resize')?.size, 0)
    dom.window.close()
  }
})

test('control clearance handles compact placement and ignores unusable rectangles', () => {
  const dom = new JSDOM('<main></main><aside data-kg-workspace-visible-viewport-occluder="vertical"></aside>')
  try {
    const [viewport, control] = Array.from(dom.window.document.body.children) as HTMLElement[]
    viewport.getBoundingClientRect = () => rect(0, 0, 375, 812)
    for (const [left, top, width, height, bottom] of [
      [120, 500, 135, 200, 328], [300, 500, 50, 200, 0], [120, 900, 135, 200, 0],
      [120, 500, 0, 200, 0], [0, 0, 375, 812, 0],
    ]) {
      control.getBoundingClientRect = () => rect(left, top, width, height)
      assert.deepEqual(readGeoMapOcclusionPadding(viewport), { left: 0, right: 0, top: 0, bottom })
    }
  } finally { dom.window.close() }
})
