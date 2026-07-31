import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  observeGeoMapOcclusionChanges,
  readGeoMapViewportPadding,
} from '../../../gympgrph/src/geoMapViewport'

async function flushMutations(window: Window): Promise<void> {
  await new Promise<void>(resolve => window.setTimeout(resolve, 0))
}

test('Geo map viewport remeasures late-mounted workspace occlusion', async () => {
  const dom = new JSDOM('<main><section id="map"></section></main>')
  const mapContainer = dom.window.document.querySelector('#map') as HTMLElement
  const observed = new Set<Element>()
  class ResizeObserverStub {
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
  } finally {
    stopObserving()
    dom.window.close()
  }
})
