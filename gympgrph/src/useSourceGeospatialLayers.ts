import React from 'react'
import type { SourceGeospatialSnapshot, SourceGeospatialFeature } from 'grph-shared/geospatial/enhancedLayerContract'
import { isMapLibreStyleReady } from './maplibreLayers.js'
import {
  isMapLibreMapPreparingForDisposal,
  subscribeMapLibreMapDisposalPreparation,
} from './features/geospatial/mapLibreHostLease.js'

export const SOURCE_GEOSPATIAL_SOURCE_ID = 'kg-source-geospatial'
export const SOURCE_GEOSPATIAL_LAYER_IDS = ['surface', 'volume', 'outline', 'path', 'point'].map(role => `${SOURCE_GEOSPATIAL_SOURCE_ID}:${role}`)
const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const keys = (value: Record<string, any>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const utc = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const fail = (message: string): never => { throw new Error(`SOURCE_GEOMETRY: ${message}`) }

/** Validate and detach an input before touching the native map. Third-coordinate heights are forbidden. */
export function validateSourceGeospatialSnapshot(input: unknown): SourceGeospatialSnapshot {
  if (!record(input) || !keys(input, ['schema', 'sourceKey', 'atUtc', 'collection']) || input.schema !== 'source-geospatial/v1' || !boundedText(input.sourceKey, 4096) || !utc(input.atUtc)
    || !record(input.collection) || input.collection.type !== 'FeatureCollection' || !Array.isArray(input.collection.features)
    || !keys(input.collection, ['type', 'features']) || input.collection.features.length > 1024) fail('Invalid bounded source snapshot.')
  const value = input as Record<string, any>
  const ids = new Set<string>()
  let coordinates = 0
  const coordinate = (point: unknown) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(v => typeof v === 'number' && Number.isFinite(v))
      || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90 || ++coordinates > 16384) fail('Coordinates must be bounded finite WGS84 longitude/latitude pairs.')
  }
  for (const feature of value.collection.features) {
    if (!record(feature) || !keys(feature, ['type', 'id', 'geometry', 'properties']) || feature.type !== 'Feature' || !boundedText(feature.id, 256) || ids.has(feature.id)
      || !record(feature.geometry) || !keys(feature.geometry, ['type', 'coordinates']) || !record(feature.properties)) fail('Invalid or duplicate feature identity.')
    ids.add(feature.id)
    const p = feature.properties, g = feature.geometry
    if (!keys(p, ['role', 'label', 'color', 'sourceId', 'sourceHash', 'sourcePointer', 'observedAtUtc', 'lastObservedAtUtc', 'altitudeLabel', 'gapSeconds', 'status', 'baseMeters', 'heightMeters', 'heightReference'])
      || !['surface', 'volume', 'path', 'point'].includes(p.role) || !boundedText(p.label, 2048)
      || typeof p.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p.color)
      || !boundedText(p.sourceId, 256) || typeof p.sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(p.sourceHash)
      || !boundedText(p.sourcePointer, 2048)) fail('Feature styling and provenance must be explicit.')
    if ((p.observedAtUtc !== undefined && !utc(p.observedAtUtc)) || (p.lastObservedAtUtc !== undefined && !utc(p.lastObservedAtUtc))
      || (p.altitudeLabel !== undefined && !boundedText(p.altitudeLabel, 512)) || (p.status !== undefined && !boundedText(p.status, 256))
      || (p.gapSeconds !== undefined && (typeof p.gapSeconds !== 'number' || !Number.isFinite(p.gapSeconds) || p.gapSeconds < 0))
      || (p.observedAtUtc !== undefined && p.observedAtUtc > value.atUtc)
      || (p.lastObservedAtUtc !== undefined && p.lastObservedAtUtc > value.atUtc)) fail('Invalid observation metadata.')
    if (p.baseMeters !== undefined || p.heightMeters !== undefined || p.heightReference !== undefined) {
      if (p.role !== 'volume' || p.heightReference !== 'map-ground-geometric'
        || typeof p.baseMeters !== 'number' || typeof p.heightMeters !== 'number'
        || !Number.isFinite(p.baseMeters) || !Number.isFinite(p.heightMeters)
        || p.baseMeters < 0 || p.heightMeters <= p.baseMeters || p.heightMeters > 100000) fail('Extrusion requires an explicit finite geometric height interval; pressure heights are not accepted.')
    }
    if (p.role === 'point') {
      if (g.type !== 'Point') fail('A point role requires Point geometry.')
      coordinate(g.coordinates)
    } else if (p.role === 'path') {
      if (g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) fail('A path requires at least two coordinates.')
      g.coordinates.forEach(coordinate)
    } else {
      if (g.type !== 'Polygon' || !Array.isArray(g.coordinates) || !g.coordinates.length || g.coordinates.length > 8) fail('A surface or volume requires bounded Polygon rings.')
      for (const ring of g.coordinates) {
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 1024) fail('Invalid polygon ring bound.')
        ring.forEach(coordinate)
        const first = ring[0], last = ring[ring.length - 1]
        if (first[0] !== last[0] || first[1] !== last[1]) fail('Polygon rings must be explicitly closed.')
        if (new Set(ring.map((point: readonly number[]) => `${point[0]},${point[1]}`)).size < 3) fail('A ring requires at least three distinct coordinates.')
      }
    }
  }
  const json = JSON.stringify(input)
  if (new TextEncoder().encode(json).byteLength > 2000000) fail('Source snapshot exceeds 2,000,000 bytes.')
  return JSON.parse(json) as SourceGeospatialSnapshot
}

function layerSpecs() {
  const source = SOURCE_GEOSPATIAL_SOURCE_ID, color = ['get', 'color']
  const polygon = ['in', ['get', 'role'], ['literal', ['surface', 'volume']]]
  return [
    { id: SOURCE_GEOSPATIAL_LAYER_IDS[0], source, type: 'fill', filter: polygon, paint: { 'fill-color': color, 'fill-opacity': 0.3 } },
    { id: SOURCE_GEOSPATIAL_LAYER_IDS[1], source, type: 'fill-extrusion', filter: ['all', ['==', ['get', 'role'], 'volume'], ['==', ['get', 'heightReference'], 'map-ground-geometric']], paint: { 'fill-extrusion-color': color, 'fill-extrusion-base': ['get', 'baseMeters'], 'fill-extrusion-height': ['get', 'heightMeters'], 'fill-extrusion-opacity': 0.3 } },
    { id: SOURCE_GEOSPATIAL_LAYER_IDS[2], source, type: 'line', filter: polygon, paint: { 'line-color': color, 'line-width': 2.5 } },
    { id: SOURCE_GEOSPATIAL_LAYER_IDS[3], source, type: 'line', filter: ['==', ['get', 'role'], 'path'], paint: { 'line-color': color, 'line-width': 3 }, layout: { 'line-join': 'round', 'line-cap': 'round' } },
    { id: SOURCE_GEOSPATIAL_LAYER_IDS[4], source, type: 'circle', filter: ['==', ['get', 'role'], 'point'], paint: { 'circle-color': color, 'circle-radius': 6, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
  ]
}

/** Semantic hit targets project the accepted MapLibre geometry; they own no data, clock or camera. */
export function createSourceGeospatialAffordances(map: any) {
  const host: HTMLElement = map.getContainer()
  const doc = host.ownerDocument
  // Headless map adapters have no DOM surface.
  if (!doc) return { update: (_snapshot: SourceGeospatialSnapshot | null) => {}, setVisible: (_visible: boolean) => {}, dispose: () => {} }
  const surface = doc.createElement('section')
  surface.setAttribute('aria-label', 'Source map feature controls')
  surface.dataset.kgSourceAffordances = '1'
  Object.assign(surface.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3', overflow: 'hidden' })
  // Source controls must not also select the underlying Canvas or start a map gesture.
  for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']) {
    surface.addEventListener(event, event => event.stopPropagation())
  }
  const ns = 'http://www.w3.org/2000/svg'
  const shapes = doc.createElementNS(ns, 'svg')
  shapes.setAttribute('role', 'group'); shapes.setAttribute('aria-label', 'Source geographic shapes')
  Object.assign(shapes.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' })
  const style = doc.createElement('style')
  style.textContent = `[data-kg-source-feature] { cursor:pointer; }
    [data-kg-source-feature]:focus-visible { outline:3px solid #0f172a; outline-offset:3px; }
    path[data-kg-source-feature]:hover, path[data-kg-source-feature]:focus, path[data-kg-source-feature][aria-pressed="true"] { stroke-opacity:.5; }
    button[data-kg-source-feature][aria-pressed="true"] { outline:3px solid #0f172a; }`
  const detail = doc.createElement('article')
  detail.setAttribute('aria-label', 'Selected source map feature'); detail.hidden = true
  detail.addEventListener('wheel', event => event.stopPropagation())
  Object.assign(detail.style, { position: 'absolute', top: '64px', left: '12px', maxWidth: 'min(360px, calc(100% - 24px))', maxHeight: '45%', overflow: 'auto', pointerEvents: 'auto', background: '#fff', color: '#0f172a', border: '1px solid #64748b', borderRadius: '8px', padding: '12px', fontSize: '12px', boxShadow: '0 3px 12px #0003' })
  surface.append(style, shapes, detail); host.append(surface)
  let snapshot: SourceGeospatialSnapshot | null = null, selected: string | null = null
  const entries = new Map<string, { feature: SourceGeospatialFeature; element: HTMLButtonElement | SVGPathElement }>()
  const inspect = () => {
    const entry = selected ? entries.get(selected) : undefined
    detail.hidden = !entry
    if (!entry || !snapshot) { detail.replaceChildren(); return }
    const p = entry.feature.properties
    const heading = doc.createElement('h3'); heading.textContent = p.label; heading.style.fontWeight = '700'
    const list = doc.createElement('dl')
    for (const [name, value] of [['Geometry', p.role], ['Status', p.status || 'Source geometry'], ['View UTC', snapshot.atUtc], ['Observed UTC', p.observedAtUtc], ['Last observed UTC', p.lastObservedAtUtc], ['Altitude', p.altitudeLabel], ['Gap seconds', p.gapSeconds?.toString()], ['Source', p.sourceId], ['SHA-256', p.sourceHash], ['Source pointer', p.sourcePointer]]) {
      if (!value) continue
      const term = doc.createElement('dt'); term.textContent = name || '';  term.style.fontWeight = '600'
      const description = doc.createElement('dd'); description.textContent = value; description.style.overflowWrap = 'anywhere'
      list.append(term, description)
    }
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'Close feature details'
    Object.assign(close.style, { minHeight: '44px', padding: '8px', border: '1px solid #64748b', borderRadius: '4px', marginTop: '8px' })
    close.onclick = event => { event.stopPropagation(); const previous = selected; selected = null; inspect(); syncPressed(); if (previous) entries.get(previous)?.element.focus() }
    detail.replaceChildren(heading, list, close)
  }
  const syncPressed = () => entries.forEach(({ element }, id) => element.setAttribute('aria-pressed', String(id === selected)))
  const project = () => {
    if (!snapshot) return
    const width = host.clientWidth, height = host.clientHeight
    shapes.setAttribute('viewBox', `0 0 ${width} ${height}`)
    const point = (coordinate: readonly number[]) => map.project(coordinate) as { x: number; y: number }
    const path = (coordinates: readonly (readonly number[])[]) => coordinates.map((c, i) => { const p = point(c); return `${i ? 'L' : 'M'}${p.x},${p.y}` }).join(' ')
    entries.forEach(({ feature, element }) => {
      const g = feature.geometry
      if (g.type === 'Point') {
        const p = point(g.coordinates)
        element.style.display = p.x < 0 || p.y < 0 || p.x > width || p.y > height ? 'none' : ''
        element.style.left = `${p.x}px`; element.style.top = `${p.y}px`
      } else element.setAttribute('d', g.type === 'Polygon' ? g.coordinates.map(ring => `${path(ring)} Z`).join(' ') : path(g.coordinates))
    })
  }
  const update = (next: SourceGeospatialSnapshot | null) => {
    if (snapshot?.sourceKey !== next?.sourceKey) selected = null
    snapshot = next
    const features = next?.collection.features || [], ids = new Set(features.map(feature => feature.id))
    for (const [id, entry] of entries) if (!ids.has(id)) { entry.element.remove(); entries.delete(id) }
    if (selected && !ids.has(selected)) selected = null
    for (const feature of features) {
      let entry = entries.get(feature.id)
      if (entry && entry.feature.geometry.type !== feature.geometry.type) { entry.element.remove(); entries.delete(feature.id); entry = undefined }
      if (!entry) {
        const element = feature.geometry.type === 'Point' ? doc.createElement('button') : doc.createElementNS(ns, 'path')
        element.dataset.kgSourceFeature = feature.id
        element.setAttribute('aria-controls', 'source-map-feature-details')
        if (element instanceof doc.defaultView!.HTMLButtonElement) {
          element.type = 'button'
          Object.assign(element.style, { position: 'absolute', transform: 'translate(-50%, -50%)', minWidth: '44px', minHeight: '44px', maxWidth: '190px', border: '2px solid', borderRadius: '22px', padding: '4px 10px', background: '#fff', color: '#0f172a', pointerEvents: 'auto', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })
          surface.insertBefore(element, detail)
        } else {
          element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0')
          element.setAttribute('fill', 'none'); element.setAttribute('stroke-width', '18'); element.setAttribute('stroke-opacity', '.12')
          element.setAttribute('stroke-linecap', 'round'); element.setAttribute('stroke-linejoin', 'round')
          element.style.pointerEvents = 'stroke'; shapes.append(element)
        }
        const activate = (event: Event) => { event.preventDefault(); event.stopPropagation(); selected = feature.id; inspect(); syncPressed() }
        element.addEventListener('click', activate)
        element.addEventListener('keydown', event => {
          if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') activate(event)
          else if ((event as KeyboardEvent).key === 'Escape') { event.stopPropagation(); selected = null; inspect(); syncPressed() }
        })
        entry = { feature, element }; entries.set(feature.id, entry)
      }
      entry.feature = feature
      const p = feature.properties, element = entry.element
      element.setAttribute('aria-label', `Inspect ${p.label} · ${p.role} · ${p.observedAtUtc || p.status || 'source geometry'}`)
      element.dataset.sourceId = p.sourceId; element.dataset.sourcePointer = p.sourcePointer
      if (feature.geometry.type === 'Point') {
        element.textContent = `${p.status === 'gap' ? 'Gap' : '●'} ${p.label.split(' · ').slice(0, 2).join(' · ')} · ${p.status || p.role}`
        element.style.borderColor = p.color; element.setAttribute('title', p.label)
      } else {
        element.setAttribute('stroke', p.color)
        let title = element.querySelector<SVGTitleElement>('title')
        if (!title) { title = doc.createElementNS(ns, 'title'); element.append(title) }
        title.textContent = p.label
      }
    }
    detail.id = 'source-map-feature-details'
    inspect(); syncPressed(); project()
  }
  for (const event of ['move', 'resize']) map.on?.(event, project)
  return { update, setVisible: (visible: boolean) => { surface.hidden = !visible }, dispose() { for (const event of ['move', 'resize']) map.off?.(event, project); entries.clear(); surface.remove(); snapshot = null } }
}

/** One style-scoped owner; it never fits the camera or mutates controlled simulation state. */
export function createSourceGeospatialLayerController(map: any, onError: (message: string) => void = () => {}) {
  let disposed = false, current: SourceGeospatialSnapshot | null = null, applied: SourceGeospatialSnapshot | null = null
  let failed = false
  const affordances = createSourceGeospatialAffordances(map)
  let semanticSnapshot: SourceGeospatialSnapshot | null = null
  const root = (): HTMLElement | undefined => { try { return map?.getContainer?.() } catch { return undefined } }
  const mark = (snapshot: SourceGeospatialSnapshot | null) => {
    affordances.setVisible(Boolean(snapshot))
    if (snapshot && semanticSnapshot !== snapshot) { semanticSnapshot = snapshot; affordances.update(snapshot) }
    else if (!snapshot && (!current || failed || disposed)) { semanticSnapshot = null; affordances.update(null) }
    const element = root()
    if (!element) return
    if (snapshot) {
      element.dataset.kgSourceGeospatialKey = snapshot.sourceKey
      element.dataset.kgSourceGeospatialAtUtc = snapshot.atUtc
      element.dataset.kgSourceGeospatialFeatureCount = String(snapshot.collection.features.length)
    } else {
      delete element.dataset.kgSourceGeospatialKey; delete element.dataset.kgSourceGeospatialAtUtc; delete element.dataset.kgSourceGeospatialFeatureCount
    }
  }
  const clear = () => {
    applied = null; mark(null)
    if (!isMapLibreStyleReady(map) || isMapLibreMapPreparingForDisposal(map)) return
    for (const id of [...SOURCE_GEOSPATIAL_LAYER_IDS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE_GEOSPATIAL_SOURCE_ID)) map.removeSource(SOURCE_GEOSPATIAL_SOURCE_ID)
  }
  const apply = () => {
    if (disposed || failed || isMapLibreMapPreparingForDisposal(map) || !isMapLibreStyleReady(map)) { mark(null); return }
    try {
      if (!current) { clear(); return }
      const source = map.getSource(SOURCE_GEOSPATIAL_SOURCE_ID)
      if (source && applied === current && SOURCE_GEOSPATIAL_LAYER_IDS.every(id => map.getLayer(id))) {
        mark(map.isSourceLoaded?.(SOURCE_GEOSPATIAL_SOURCE_ID) === false ? null : current); return
      }
      if (!source) map.addSource(SOURCE_GEOSPATIAL_SOURCE_ID, { type: 'geojson', data: current.collection })
      else source.setData(current.collection)
      const beforeId = map.getStyle()?.layers?.find((layer: any) => layer.type === 'symbol' && !SOURCE_GEOSPATIAL_LAYER_IDS.includes(layer.id))?.id
      for (const layer of layerSpecs()) if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId)
      if (!map.getSource(SOURCE_GEOSPATIAL_SOURCE_ID) || SOURCE_GEOSPATIAL_LAYER_IDS.some(id => !map.getLayer(id))) throw new Error('The map did not retain the source layers.')
      applied = current; mark(map.isSourceLoaded?.(SOURCE_GEOSPATIAL_SOURCE_ID) === false ? null : current)
    } catch (error) {
      failed = true
      try { clear() } catch { mark(null) }
      onError(`Source geometry could not be displayed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const reset = () => { applied = null; failed = false; apply() }
  for (const event of ['style.load', 'load']) map.on?.(event, reset)
  map.on?.('idle', apply)
  const unsubscribe = subscribeMapLibreMapDisposalPreparation(map, () => { applied = null; mark(null); apply() })
  return {
    update(input: unknown) {
      if (disposed) return
      try { current = input == null ? null : validateSourceGeospatialSnapshot(input) }
      catch (error) { current = null; try { clear() } catch { mark(null) }; onError(error instanceof Error ? error.message : String(error)); return }
      applied = null; failed = false; apply()
    },
    refresh: reset,
    dispose() {
      if (disposed) return
      disposed = true; current = null; unsubscribe()
      for (const event of ['style.load', 'load']) map.off?.(event, reset)
      map.off?.('idle', apply)
      try { clear() } catch { mark(null) }
      affordances.dispose()
    },
  }
}

export function useSourceGeospatialLayers(args: { enabled: boolean; map: any; styleRevision: number; snapshot: unknown; onError: (message: string) => void }) {
  const controller = React.useRef<ReturnType<typeof createSourceGeospatialLayerController> | null>(null)
  const error = React.useRef(args.onError); error.current = args.onError
  React.useEffect(() => {
    if (!args.enabled || !args.map) return
    const owner = createSourceGeospatialLayerController(args.map, message => error.current(message))
    controller.current = owner
    return () => { owner.dispose(); if (controller.current === owner) controller.current = null }
  }, [args.enabled, args.map])
  React.useEffect(() => { controller.current?.update(args.snapshot) }, [args.enabled, args.map, args.snapshot, args.styleRevision])
}
