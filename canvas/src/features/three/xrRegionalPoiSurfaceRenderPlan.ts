import { Path, Shape } from 'three'
import type { XrRegionalPoiSurface } from './regionalPoiXrPresentation'

export type XrRegionalPoiSurfaceRenderer =
  | 'observation-wheel'
  | 'polygon-extrusion'
  | 'supertree'

export type XrRegionalPoiSurfaceRenderEntry = Readonly<{
  renderer: XrRegionalPoiSurfaceRenderer
  surface: XrRegionalPoiSurface
}>

export function createXrRegionalPoiSurfaceUserData(
  surface: XrRegionalPoiSurface,
) {
  return Object.freeze({
    accuracy: surface.accuracy,
    baseHeightMeters: surface.baseHeightMeters,
    category: surface.category,
    collidable: surface.collidable,
    heightMeters: surface.heightMeters,
    interactive: false,
    poiId: surface.poiId,
    poiLabel: surface.poiLabel,
    provenance: surface.provenance,
    selectable: false,
    surfaceId: surface.id,
    surfaceLabel: surface.label,
  })
}

function rendererForSurface(
  surface: XrRegionalPoiSurface,
): XrRegionalPoiSurfaceRenderer {
  if (surface.presentation === 'observation-wheel') return 'observation-wheel'
  if (surface.presentation === 'supertree') return 'supertree'
  return 'polygon-extrusion'
}

export function createXrRegionalPoiSurfaceRenderPlan(
  surfaces: readonly XrRegionalPoiSurface[],
): readonly XrRegionalPoiSurfaceRenderEntry[] {
  const ids = new Set<string>()
  return Object.freeze(surfaces.map(surface => {
    if (ids.has(surface.id)) {
      throw new TypeError(`Duplicate XR regional POI surface: ${surface.id}`)
    }
    ids.add(surface.id)
    return Object.freeze({
      renderer: rendererForSurface(surface),
      surface,
    })
  }))
}

function appendRing(path: Path, ring: XrRegionalPoiSurface['rings'][number]) {
  const first = ring[0]
  if (!first) throw new TypeError('XR regional POI ring must not be empty')
  path.moveTo(first[0], -first[1])
  for (const coordinate of ring.slice(1)) {
    path.lineTo(coordinate[0], -coordinate[1])
  }
}

export function createXrRegionalPoiExtrusionShape(
  surface: XrRegionalPoiSurface,
): Shape {
  const [outerRing, ...holeRings] = surface.rings
  if (!outerRing) {
    throw new TypeError(`XR regional POI surface ${surface.id} needs an outer ring`)
  }
  const shape = new Shape()
  appendRing(shape, outerRing)
  shape.holes = holeRings.map(ring => {
    const hole = new Path()
    appendRing(hole, ring)
    return hole
  })
  return shape
}
