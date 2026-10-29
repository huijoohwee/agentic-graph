import type { FeatureCollection } from 'geojson'

type GraphPointFeature = FeatureCollection['features'][number]

type ProjectedMap = {
  getContainer: () => HTMLElement
  on: (event: string, listener: () => void) => void
  off?: (event: string, listener: () => void) => void
  project: (coordinate: [number, number]) => { x: number; y: number }
}

export type GraphFeatureAffordanceOptions = {
  features: readonly GraphPointFeature[]
  map: ProjectedMap
  onActivate: (feature: GraphPointFeature) => void
  selectedFeatureIds: ReadonlySet<string>
}

function readFeatureId(feature: GraphPointFeature): string {
  const rawId = feature.id ?? feature.properties?.id
  return typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId).trim() : ''
}

function readFeatureLabel(feature: GraphPointFeature): string {
  const properties = feature.properties && typeof feature.properties === 'object'
    ? feature.properties as Record<string, unknown>
    : {}
  const label = String(properties.label ?? properties.name ?? properties.title ?? readFeatureId(feature)).trim()
  const category = String(properties.category ?? properties.kgCategory ?? properties.type ?? 'place').trim()
  return `${label || 'Map feature'} · ${category || 'place'}`
}

/** Adds real, keyboard-operable map feature buttons over the existing renderer points. */
export function bindGraphFeatureAffordances({
  features,
  map,
  onActivate,
  selectedFeatureIds,
}: GraphFeatureAffordanceOptions): () => void {
  const host = map.getContainer()
  const doc = host.ownerDocument
  const viewport = doc.defaultView
  const surface = doc.createElement('section')
  surface.setAttribute('role', 'group')
  surface.setAttribute('aria-label', 'Interactive map features')
  surface.dataset.kgGraphFeatureControls = '1'
  Object.assign(surface.style, {
    position: 'fixed',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '61',
  })

  const entries = new Map<string, { button: HTMLButtonElement; feature: GraphPointFeature }>()
  const nearestFeatureForClick = (event: MouseEvent, fallback: GraphPointFeature): GraphPointFeature => {
    if (event.detail < 1) return fallback
    const bounds = host.getBoundingClientRect()
    const scaleX = bounds.width / Math.max(1, host.clientWidth)
    const scaleY = bounds.height / Math.max(1, host.clientHeight)
    const x = (event.clientX - bounds.left) / (Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1)
    const y = (event.clientY - bounds.top) / (Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1)
    let nearest = fallback
    let nearestDistanceSquared = 22 * 22
    for (const { feature } of entries.values()) {
      if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue
      const point = map.project(feature.geometry.coordinates as [number, number])
      const dx = point.x - x
      const dy = point.y - y
      const distanceSquared = dx * dx + dy * dy
      if (Number.isFinite(distanceSquared) && distanceSquared < nearestDistanceSquared) {
        nearest = feature
        nearestDistanceSquared = distanceSquared
      }
    }
    return nearest
  }
  for (const feature of features) {
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue
    const id = readFeatureId(feature)
    if (!id) continue
    const [lng, lat] = feature.geometry.coordinates
    if (typeof lng !== 'number' || !Number.isFinite(lng) || typeof lat !== 'number' || !Number.isFinite(lat)) continue

    const label = readFeatureLabel(feature)
    const properties = feature.properties && typeof feature.properties === 'object'
      ? feature.properties as Record<string, unknown>
      : {}
    const sourceFeatureId = String(properties.kgSourceFeatureId ?? properties.id ?? id).trim() || id
    const button = doc.createElement('button')
    button.type = 'button'
    button.dataset.kgSourceFeature = id
    button.dataset.kgSourceFeatureId = sourceFeatureId
    button.dataset.kgGraphFeature = id
    button.setAttribute('aria-label', `Select ${label} on the map`)
    button.setAttribute('aria-pressed', String(selectedFeatureIds.has(id)))
    button.title = label
    Object.assign(button.style, {
      position: 'absolute',
      width: '44px',
      height: '44px',
      padding: '0',
      border: '0',
      borderRadius: '50%',
      background: 'transparent',
      color: 'transparent',
      cursor: 'pointer',
      // Keep each feature a real hit-testable button. Its click selects the
      // same feature that receives the focus ring and accessible name.
      pointerEvents: 'auto',
      touchAction: 'manipulation',
      transform: 'translate(-50%, -50%)',
    })
    button.addEventListener('focus', () => {
      button.style.outline = '3px solid #2563eb'
      button.style.outlineOffset = '2px'
    })
    button.addEventListener('blur', () => {
      button.style.outline = 'none'
    })
    button.addEventListener('pointerdown', event => event.stopPropagation())
    button.addEventListener('pointerup', event => event.stopPropagation())
    button.addEventListener('mousedown', event => event.stopPropagation())
    button.addEventListener('mouseup', event => event.stopPropagation())
    button.addEventListener('touchstart', event => event.stopPropagation())
    button.addEventListener('touchend', event => event.stopPropagation())
    button.addEventListener('dblclick', event => event.stopPropagation())
    button.addEventListener('click', event => {
      event.stopPropagation()
      onActivate(nearestFeatureForClick(event, feature))
    })
    entries.set(id, { button, feature })
    surface.append(button)
  }

  const position = () => {
    const width = host.clientWidth
    const height = host.clientHeight
    const bounds = host.getBoundingClientRect()
    for (const { button, feature } of entries.values()) {
      if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue
      const [lng, lat] = feature.geometry.coordinates
      const point = map.project([lng as number, lat as number])
      const visible = Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height
      button.hidden = !visible
      if (!visible) continue
      button.style.left = `${bounds.left + point.x * (bounds.width / Math.max(1, width))}px`
      button.style.top = `${bounds.top + point.y * (bounds.height / Math.max(1, height))}px`
      const centerX = bounds.left + point.x * (bounds.width / Math.max(1, width))
      const centerY = bounds.top + point.y * (bounds.height / Math.max(1, height))
      const hitTarget = doc.elementFromPoint(centerX, centerY)
      if (hitTarget && hitTarget !== button && !surface.contains(hitTarget) && !host.contains(hitTarget)) button.hidden = true
    }
  }

  doc.body.append(surface)
  map.on('move', position)
  map.on('resize', position)
  viewport?.addEventListener('resize', position)
  viewport?.addEventListener('scroll', position, true)
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(position)
    : null
  resizeObserver?.observe(host)
  position()
  return () => {
    map.off?.('move', position)
    map.off?.('resize', position)
    viewport?.removeEventListener('resize', position)
    viewport?.removeEventListener('scroll', position, true)
    resizeObserver?.disconnect()
    surface.remove()
  }
}
