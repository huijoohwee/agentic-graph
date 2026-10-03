import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  observeGeoMapOcclusionChanges,
  readGeoMapViewportPadding,
} from 'gympgrph/testkit/geoMapViewport'

async function flushMutations(window: Window): Promise<void> {
  await new Promise<void>(resolve => window.setTimeout(resolve, 0))
}

test('Geo map viewport remeasures late-mounted workspace occlusion', async () => {
  const dom = new JSDOM('<main><section id="map"></section></main>')
  const mapContainer = dom.window.document.querySelector('#map') as HTMLElement
  const observed = new Set<Element>()
  let resized = () => {}
  class ResizeObserverStub {
    constructor(notify: () => void) { resized = notify }
    observe(element: Element) {
      observed.add(element)
    }

    unobserve(element: Element) {
      observed.delete(element)
    }

    disconnect() {
      observed.clear()
    }
  }
  Object.defineProperty(dom.window, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverStub,
  })
  Object.defineProperties(mapContainer, {
    clientHeight: { configurable: true, value: 962 },
    clientWidth: { configurable: true, value: 550 },
  })
  mapContainer.getBoundingClientRect = () => ({
    bottom: 962,
    height: 962,
    left: 550,
    right: 1100,
    top: 0,
    width: 550,
  } as DOMRect)
  const map = { getContainer: () => mapContainer }
  let changes = 0
  const stopObserving = observeGeoMapOcclusionChanges(
    mapContainer,
    () => {
      changes += 1
    },
  )

  try {
    assert.deepEqual(
      readGeoMapViewportPadding(map),
      { bottom: 112, left: 44, right: 44, top: 88 },
    )
    const panel = dom.window.document.createElement('aside')
    const panelWrapper = dom.window.document.createElement('div')
    panel.setAttribute('aria-label', 'Floating panel')
    let panelLeft = 747
    let panelRight = 1091
    panel.getBoundingClientRect = () => ({
      bottom: 953,
      height: 944,
      left: panelLeft,
      right: panelRight,
      top: 9,
      width: 344,
    } as DOMRect)
    panelWrapper.append(panel)
    dom.window.document.body.append(panelWrapper)
    await flushMutations(dom.window)

    assert.equal(changes, 1)
    assert.equal(observed.has(panel), true)
    assert.deepEqual(
      readGeoMapViewportPadding(map),
      { bottom: 112, left: 44, right: 369, top: 88 },
    )

    panelLeft = 700
    panelRight = 1044
    panelWrapper.style.transform = 'translateX(-47px)'
    await flushMutations(dom.window)

    assert.equal(changes, 2)
    assert.deepEqual(
      readGeoMapViewportPadding(map),
      { bottom: 112, left: 44, right: 416, top: 88 },
    )

    panelWrapper.remove()
    await flushMutations(dom.window)

    assert.equal(changes, 3)
    assert.equal(observed.has(panel), false)
    assert.deepEqual(
      readGeoMapViewportPadding(map),
      { bottom: 112, left: 44, right: 44, top: 88 },
    )
    const control = dom.window.document.createElement('aside')
    let top = 144
    control.getBoundingClientRect = () => ({ left: 747, right: 847, top, bottom: top + 200, width: 100, height: 200 } as DOMRect)
    dom.window.document.body.append(control)
    await flushMutations(dom.window)
    const before = changes
    control.setAttribute('data-kg-workspace-visible-viewport-occluder', 'vertical')
    await flushMutations(dom.window)
    assert.equal(changes, before + 1)
    assert.ok(observed.has(control))
    assert.equal(readGeoMapViewportPadding(map).top, 360)
    top = 650; resized()
    assert.equal(readGeoMapViewportPadding(map).bottom, 328)
    control.removeAttribute('data-kg-workspace-visible-viewport-occluder')
    await flushMutations(dom.window)
    assert.ok(!observed.has(control))
    assert.equal(readGeoMapViewportPadding(map).bottom, 112)
    control.className = 'kg-canvas-bottom-panel'
    await flushMutations(dom.window)
    assert.ok(observed.has(control))
    control.className = ''
    await flushMutations(dom.window)
    assert.ok(!observed.has(control), 'removing the recognized class releases the observer')
    control.className = 'kg-canvas-bottom-panel'
    await flushMutations(dom.window)
    control.remove()
    await flushMutations(dom.window)
    assert.ok(!observed.has(control))
    assert.equal(readGeoMapViewportPadding(map).bottom, 112)

  } finally {
    stopObserving()
    dom.window.close()
  }
})

test('generic vertical occlusion handles mobile placement and ignores unusable rectangles', () => {
  const dom = new JSDOM('<main></main><aside data-kg-workspace-visible-viewport-occluder="vertical"></aside>')
  try {
    const [viewport, control] = Array.from(dom.window.document.body.children) as HTMLElement[]
    Object.defineProperties(viewport, { clientWidth: { value: 375 }, clientHeight: { value: 812 } })
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: 375, bottom: 812, width: 375, height: 812 } as DOMRect)
    const map = { getContainer: () => viewport }
    const baseline = { left: 30, right: 30, top: 81.2, bottom: 112 }
    for (const [left, top, width, height, bottom] of [
      [120, 500, 135, 200, 328], [300, 500, 50, 200, 112], [120, 900, 135, 200, 112],
      [120, 500, 0, 200, 112], [0, 0, 375, 812, 112],
    ]) {
      control.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)
      assert.deepEqual(readGeoMapViewportPadding(map), { ...baseline, bottom })
    }
  } finally { dom.window.close() }
})
