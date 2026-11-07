import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createSourceGeospatialLayerController, validateSourceGeospatialSnapshot, SOURCE_GEOSPATIAL_SOURCE_ID, SOURCE_GEOSPATIAL_LAYER_IDS } from '../../../gympgrph/src/useSourceGeospatialLayers'
import { acquireMapLibreMapDisposalPreparation } from '../../../gympgrph/src/features/geospatial/mapLibreHostLease'

const time = '2026-10-04T02:26:00.000Z'
const properties = (role: string) => ({ role, label: 'Source observation', color: '#28b8ff', sourceId: 'permitted-source', sourceHash: 'a'.repeat(64), sourcePointer: '/observations/0' })
const point = (id = 'observed-position-1') => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [3, 2] }, properties: { ...properties('point'), observedAtUtc: time, altitudeLabel: '6000 ft pressure altitude; horizontal display' } })
const polygon = (id = 'surface-1') => ({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: properties('surface') })
const snapshot = (features: any[] = [polygon(), point()]) => ({ schema: 'source-geospatial/v1', sourceKey: 'authored-source:revision:hash', atUtc: time, collection: { type: 'FeatureCollection', features } })

function harness(dom?: JSDOM) {
  const sources = new Map<string, any>(), layers = new Map<string, any>([['base-labels', { id: 'base-labels', type: 'symbol' }]])
  const events = new Map<string, Set<() => void>>(), writes: string[] = [], errors: string[] = []
  const container = dom?.window.document.createElement('section') || { dataset: {} as Record<string, string> }
  if (dom) { Object.defineProperties(container, { clientWidth: { value: 600 }, clientHeight: { value: 400 } }); dom.window.document.body.append(container as HTMLElement) }
  let ready = true, sourceLoaded = true, failLayer = false
  const map = {
    getContainer: () => container,
    project: (coordinate: number[]) => ({ x: coordinate[0] * 10, y: coordinate[1] * 10 }),
    isStyleLoaded: () => ready,
    isSourceLoaded: () => sourceLoaded,
    getStyle: () => ({ layers: [...layers.values()] }),
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    addSource(id: string, source: any) {
      writes.push(`addSource:${id}`)
      const owner = { ...source, setData(data: any) { writes.push(`setData:${id}`); owner.data = data } }
      sources.set(id, owner)
    },
    removeSource(id: string) { writes.push(`removeSource:${id}`); sources.delete(id) },
    addLayer(layer: any, before?: string) {
      if (failLayer) throw new Error('style rejected layer')
      assert.equal(before, 'base-labels')
      writes.push(`addLayer:${layer.id}`); layers.set(layer.id, layer)
    },
    removeLayer(id: string) { writes.push(`removeLayer:${id}`); layers.delete(id) },
    on(event: string, handler: () => void) { if (!events.has(event)) events.set(event, new Set()); events.get(event)!.add(handler) },
    off(event: string, handler: () => void) { events.get(event)?.delete(handler) },
    fitBounds() { assert.fail('Passive evidence must not own the camera') },
    jumpTo() { assert.fail('Passive evidence must not own the camera') },
  }
  const controller = createSourceGeospatialLayerController(map, message => errors.push(message))
  return { map, controller, writes, errors, sources, layers, container, events,
    emit: (event: string) => events.get(event)?.forEach(handler => handler()),
    ready: (value: boolean) => { ready = value }, loaded: (value: boolean) => { sourceLoaded = value },
    failLayer: () => { failLayer = true },
    resetStyle: () => { sources.clear(); layers.clear(); layers.set('base-labels', { id: 'base-labels', type: 'symbol' }) },
  }
}

test('bounded source snapshot keeps horizontal coordinates and detaches producer ownership', () => {
  const input = snapshot(), result = validateSourceGeospatialSnapshot(input)
  input.collection.features[1].geometry.coordinates[0] = 99
  assert.deepEqual(result.collection.features[1].geometry.coordinates, [3, 2])
  assert.match(result.collection.features[1].properties.altitudeLabel!, /pressure altitude/)
  assert.equal(result.collection.features[1].properties.heightMeters, undefined)
})

test('invalid geometry, metadata, pressure extrusion and bounds fail before any map write', () => {
  const rejected = [
    snapshot([point(), point()]),
    snapshot([{ ...point(), geometry: { type: 'Point', coordinates: [3, 2, 1800] } }]),
    snapshot([{ ...point(), geometry: { type: 'Point', coordinates: [181, 2] } }]),
    snapshot([{ ...polygon(), geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] } }]),
    snapshot([{ ...polygon(), properties: { ...properties('volume'), baseMeters: 0, heightMeters: 1800, heightReference: 'pressure' } }]),
    snapshot([{ ...polygon(), properties: { ...properties('volume'), baseMeters: 0, heightMeters: Infinity, heightReference: 'map-ground-geometric' } }]),
    snapshot([{ ...point(), properties: { ...properties('point'), observedAtUtc: '2026-10-04T02:27:00.000Z' } }]),
    snapshot([{ ...point(), properties: { ...properties('point'), sourceHash: 'unverified' } }]),
    snapshot(Array.from({ length: 1025 }, (_, index) => point(`position-${index}`))),
    snapshot([{ type: 'Feature', id: 'too-many', geometry: { type: 'LineString', coordinates: Array.from({ length: 16385 }, () => [3, 2]) }, properties: properties('path') }]),
    snapshot(Array.from({ length: 600 }, (_, index) => ({ ...polygon(`large-${index}`), properties: { ...properties('surface'), label: 'x'.repeat(2048), sourcePointer: 'p'.repeat(2048) } }))),
    { ...snapshot(), atUtc: '2026-02-30T02:26:00.000Z' },
  ]
  for (const input of rejected) {
    const h = harness(); h.controller.update(input)
    assert.equal(h.errors.length, 1); assert.deepEqual(h.writes, []); h.controller.dispose()
  }
})

test('multiple paths and positions retain source identity; explicit geometric volume alone has extrusion fields', () => {
  const h = harness()
  const features = [polygon(), point('aircraft-a'), point('aircraft-b'), {
    type: 'Feature', id: 'track-a', geometry: { type: 'LineString', coordinates: [[3, 2], [4, 3]] }, properties: properties('path'),
  }, { ...polygon('geometric-volume'), properties: { ...properties('volume'), baseMeters: 25, heightMeters: 75, heightReference: 'map-ground-geometric' } }]
  h.controller.update(snapshot(features))
  assert.deepEqual(h.sources.get(SOURCE_GEOSPATIAL_SOURCE_ID).data.features, features)
  assert.equal(h.container.dataset.kgSourceGeospatialFeatureCount, '5')
  assert.deepEqual(h.layers.get(SOURCE_GEOSPATIAL_LAYER_IDS[1]).paint['fill-extrusion-height'], ['get', 'heightMeters'])
  assert.equal(h.layers.size, SOURCE_GEOSPATIAL_LAYER_IDS.length + 1)
  h.controller.dispose(); assert.equal(h.layers.size, 1); assert.equal(h.sources.size, 0)
})

test('readiness waits for the style and source, then resets and reapplies the current source on style replacement', () => {
  const h = harness(); h.ready(false); h.loaded(false); h.controller.update(snapshot())
  assert.deepEqual(h.writes, []); assert.deepEqual(h.container.dataset, {})
  h.ready(true); h.emit('load')
  assert.equal(h.sources.size, 1); assert.deepEqual(h.container.dataset, {})
  h.loaded(true); h.emit('idle'); assert.equal(h.container.dataset.kgSourceGeospatialAtUtc, time)
  h.resetStyle(); h.emit('style.load')
  assert.equal(h.sources.size, 1); assert.equal(h.layers.size, 6)
  h.controller.update(null); assert.equal(h.sources.size, 0); assert.deepEqual(h.container.dataset, {})
  h.controller.dispose()
})

test('source replacement removes old data, invalid replacement fails closed, and late disposed updates cannot write', () => {
  const h = harness(); h.controller.update(snapshot([point('old')]))
  h.controller.update({ ...snapshot([point('current')]), sourceKey: 'new-source' })
  assert.equal(h.sources.get(SOURCE_GEOSPATIAL_SOURCE_ID).data.features[0].id, 'current')
  h.controller.update({ ...snapshot(), schema: 'invalid' })
  assert.equal(h.sources.size, 0); assert.equal(h.errors.length, 1)
  h.controller.dispose(); const writes = h.writes.length
  h.controller.update(snapshot()); h.emit('idle')
  assert.equal(h.writes.length, writes); assert.ok([...h.events.values()].every(set => set.size === 0))
})

test('disposal preparation fences writes and cancels readiness until the same map is resumed', () => {
  const h = harness(); h.controller.update(snapshot())
  const resume = acquireMapLibreMapDisposalPreparation(h.map), before = h.writes.length
  h.controller.update(snapshot([point('pending')]))
  h.emit('style.load'); assert.equal(h.writes.length, before); assert.deepEqual(h.container.dataset, {})
  resume(); assert.equal(h.sources.get(SOURCE_GEOSPATIAL_SOURCE_ID).data.features[0].id, 'pending')
  h.controller.dispose()
})

test('a rejected map mutation clears partial ownership and reports the failure', () => {
  const h = harness(); h.failLayer(); h.controller.update(snapshot())
  assert.equal(h.sources.size, 0); assert.equal(h.layers.size, 1)
  assert.deepEqual(h.container.dataset, {}); assert.match(h.errors[0], /style rejected layer/)
  h.emit('idle'); h.emit('idle'); assert.equal(h.errors.length, 1)
  h.controller.dispose()
})


test('semantic source targets inspect points and shapes with keyboard access and safe provenance text', () => {
  const dom = new JSDOM('<!doctype html><body></body>'), h = harness(dom)
  const observed = point(); observed.properties.label = '<img src=x> Observed asset'
  const path = { type: 'Feature', id: 'observed-path', geometry: { type: 'LineString', coordinates: [[3, 2], [4, 3]] }, properties: { ...properties('path'), lastObservedAtUtc: time, status: 'observed-path' } }
  h.controller.update(snapshot([polygon(), observed, path]))
  const container = h.container as HTMLElement
  const button = container.querySelector<HTMLButtonElement>('button[data-kg-source-feature]')!
  assert.equal(button.tagName, 'BUTTON'); assert.equal(button.style.minHeight, '44px')
  assert.equal(button.style.left, '30px'); assert.equal(button.style.top, '20px')
  assert.match(button.getAttribute('aria-label')!, /Observed asset/)
  assert.equal(container.querySelectorAll('img, div, [aria-hidden]').length, 0)
  let canvasSelections = 0
  container.addEventListener('pointerup', () => { canvasSelections += 1 })
  button.dispatchEvent(new dom.window.Event('pointerup', { bubbles: true }))
  assert.equal(canvasSelections, 0, 'source controls must not activate the underlying Canvas selection')
  button.click()
  const detail = container.querySelector<HTMLElement>('article')!
  assert.equal(detail.hidden, false); assert.match(detail.textContent!, /SHA-256/); assert.match(detail.textContent!, /6000 ft pressure altitude/)
  assert.equal(button.getAttribute('aria-pressed'), 'true')
  const target = container.querySelector<SVGElement>('[data-kg-source-feature="observed-path"]')!
  assert.equal(target.getAttribute('role'), 'button'); assert.equal(target.getAttribute('tabindex'), '0')
  target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  assert.match(detail.textContent!, /observed-path/); assert.match(detail.textContent!, /Last observed UTC/)
  assert.equal(target.getAttribute('aria-pressed'), 'true')
  h.map.project = coordinate => ({ x: coordinate[0] * 20, y: coordinate[1] * 20 }); h.emit('move')
  assert.equal(target.getAttribute('d'), 'M60,40 L80,60'); assert.equal(button.style.left, '60px')
  target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(detail.hidden, true)
  h.controller.update({ ...snapshot([point('next')]), sourceKey: 'replacement' })
  assert.equal(container.querySelector('[data-kg-source-feature="observed-path"]'), null)
  assert.equal(detail.hidden, true)
  h.controller.update(null); assert.equal(container.querySelectorAll('[data-kg-source-feature]').length, 0)
  h.controller.dispose(); assert.equal(container.querySelector('[data-kg-source-affordances]'), null)
  assert.ok([...h.events.values()].every(handlers => handlers.size === 0)); dom.window.close()
})
