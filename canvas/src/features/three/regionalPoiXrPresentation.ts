import {
  createRegionalPoiProfile,
  deriveRegionalPoiLongitudeSpan,
  type RegionalPoiCoordinate,
  type RegionalPoiLongitudeSpan,
  type RegionalPoiProfile,
  type RegionalPoiSurface,
  unwrapRegionalPoiLongitude,
} from 'grph-shared/geospatial/regionalPoiGeo'
import type {
  RegionalPoiPresentationStyle,
} from '@/features/geospatial/regionalPoiPresentationStyle'

export type XrRegionalPoiSurfacePresentation = string

export type XrRegionalPoiSurfaceStyle = RegionalPoiPresentationStyle

export type XrRegionalPoiSurface = Readonly<{
  collidable: false
  color: string
  id: string
  kind: 'poi'
  label: string
  poiId: string
  position: readonly [number, number, number]
  presentation: XrRegionalPoiSurfacePresentation
  size: readonly [number, number, number]
  tone: 'light' | 'mid' | 'dark' | 'accent'
}>

export type XrRegionalPoi = Readonly<{
  id: string
  label: string
  surfaces: readonly XrRegionalPoiSurface[]
}>

export type RegionalPoiXrPresentation = Readonly<{
  pois: readonly XrRegionalPoi[]
  profileId: string
  profileRevision: string
  scale: number
  sizeMeters: readonly [width: number, depth: number]
  surfaces: readonly XrRegionalPoiSurface[]
}>

const METERS_PER_LATITUDE_DEGREE = 111_320
const DEFAULT_PADDING_RATIO = 0.08

type GeographicFrame = Readonly<{
  centerLatitude: number
  centerLongitude: number
  longitude: RegionalPoiLongitudeSpan
  metersPerLongitudeDegree: number
  north: number
  scale: number
  south: number
}>

function allCoordinates(profile: RegionalPoiProfile): RegionalPoiCoordinate[] {
  return profile.surfaces.flatMap(surface => (
    surface.geometry.coordinates.flatMap(ring => [...ring])
  ))
}

function geographicFrame(
  profile: RegionalPoiProfile,
  sizeMeters: readonly [number, number],
  paddingRatio: number,
): GeographicFrame {
  const coordinates = allCoordinates(profile)
  const longitude = deriveRegionalPoiLongitudeSpan(
    coordinates.map(([value]) => value),
  )
  const latitudes = coordinates.map(coordinate => coordinate[1])
  const south = Math.min(...latitudes)
  const north = Math.max(...latitudes)
  const centerLatitude = (south + north) / 2
  const centerLongitude = longitude.west + longitude.spanDegrees / 2
  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE
    * Math.cos(centerLatitude * Math.PI / 180)
  const sourceWidthMeters = Math.max(
    Number.EPSILON,
    longitude.spanDegrees * metersPerLongitudeDegree,
  )
  const sourceDepthMeters = Math.max(
    Number.EPSILON,
    (north - south) * METERS_PER_LATITUDE_DEGREE,
  )
  const usableWidthMeters = sizeMeters[0] * (1 - paddingRatio * 2)
  const usableDepthMeters = sizeMeters[1] * (1 - paddingRatio * 2)
  return Object.freeze({
    centerLatitude,
    centerLongitude,
    longitude,
    metersPerLongitudeDegree,
    north,
    scale: Math.min(
      usableWidthMeters / sourceWidthMeters,
      usableDepthMeters / sourceDepthMeters,
    ),
    south,
  })
}

function localCoordinate(
  coordinate: RegionalPoiCoordinate,
  frame: GeographicFrame,
): readonly [x: number, z: number] {
  return Object.freeze([
    (unwrapRegionalPoiLongitude(coordinate[0], frame.longitude)
      - frame.centerLongitude) * frame.metersPerLongitudeDegree * frame.scale,
    -(coordinate[1] - frame.centerLatitude)
      * METERS_PER_LATITUDE_DEGREE * frame.scale,
  ])
}

function presentationForSurface(
  surface: RegionalPoiSurface,
  styleByCategory: Readonly<Record<string, XrRegionalPoiSurfaceStyle>>,
): XrRegionalPoiSurfaceStyle {
  const presentation = styleByCategory[surface.category]
  if (!presentation) {
    throw new TypeError(
      `Regional POI surface ${surface.id} has unsupported XR category ${surface.category}`,
    )
  }
  return presentation
}

function projectSurface(
  surface: RegionalPoiSurface,
  frame: GeographicFrame,
  styleByCategory: Readonly<Record<string, XrRegionalPoiSurfaceStyle>>,
): XrRegionalPoiSurface {
  const coordinates = surface.geometry.coordinates.flatMap(ring => (
    ring.map(coordinate => localCoordinate(coordinate, frame))
  ))
  const west = Math.min(...coordinates.map(coordinate => coordinate[0]))
  const east = Math.max(...coordinates.map(coordinate => coordinate[0]))
  const north = Math.min(...coordinates.map(coordinate => coordinate[1]))
  const south = Math.max(...coordinates.map(coordinate => coordinate[1]))
  const baseHeight = surface.baseHeightMeters * frame.scale
  const topHeight = surface.heightMeters * frame.scale
  const presentation = presentationForSurface(surface, styleByCategory)
  return Object.freeze({
    collidable: false,
    color: presentation.color,
    id: surface.id,
    kind: 'poi',
    label: surface.label,
    poiId: surface.poiId,
    position: Object.freeze([
      (west + east) / 2,
      (baseHeight + topHeight) / 2,
      (north + south) / 2,
    ]) as readonly [number, number, number],
    presentation: presentation.presentation,
    size: Object.freeze([
      Math.max(Number.EPSILON, east - west),
      topHeight - baseHeight,
      Math.max(Number.EPSILON, south - north),
    ]) as readonly [number, number, number],
    tone: presentation.tone,
  })
}

export function createRegionalPoiXrPresentation(input: Readonly<{
  paddingRatio?: number
  profile: RegionalPoiProfile
  sizeMeters: readonly [width: number, depth: number]
  styleByCategory: Readonly<Record<string, XrRegionalPoiSurfaceStyle>>
}>): RegionalPoiXrPresentation {
  const profile = createRegionalPoiProfile(input.profile)
  const sizeMeters = input.sizeMeters
  if (
    sizeMeters.length !== 2
    || sizeMeters.some(value => !Number.isFinite(value) || value <= 0)
  ) {
    throw new RangeError('XR presentation size must contain two positive metres')
  }
  const paddingRatio = input.paddingRatio ?? DEFAULT_PADDING_RATIO
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0 || paddingRatio >= 0.5) {
    throw new RangeError('XR presentation paddingRatio must be within [0, 0.5)')
  }
  const frame = geographicFrame(profile, sizeMeters, paddingRatio)
  const surfaces = Object.freeze(
    profile.surfaces.map(surface => projectSurface(
      surface,
      frame,
      input.styleByCategory,
    )),
  )
  const pois = Object.freeze(profile.pois.map(poi => Object.freeze({
    id: poi.id,
    label: poi.label,
    surfaces: Object.freeze(
      surfaces.filter(surface => surface.poiId === poi.id),
    ),
  })))
  return Object.freeze({
    pois,
    profileId: profile.id,
    profileRevision: profile.revision,
    scale: frame.scale,
    sizeMeters: Object.freeze([...sizeMeters]) as readonly [number, number],
    surfaces,
  })
}
