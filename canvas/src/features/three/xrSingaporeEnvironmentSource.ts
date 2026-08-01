import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  SINGAPORE_MAJOR_POI_IDENTITIES,
  type SingaporeMajorPoiId,
} from 'grph-shared/geospatial/singaporeMajorPoiIdentity'
import {
  createRegionalPoiXrPresentation,
  type XrRegionalPoiSurface,
} from './regionalPoiXrPresentation'
import {
  createRegionalPoiPresentationPolicy,
  type RegionalPoiPresentationStyle,
} from '@/features/geospatial/regionalPoiPresentationStyle'

export type XrSingaporePoiSurfacePresentation =
  | 'observation-wheel'
  | 'polygon-extrusion'
  | 'skypark'
  | 'supertree'
  | 'tower'

export type XrSingaporePoiSurface = XrRegionalPoiSurface & Readonly<{
  poiId: SingaporeMajorPoiId
  presentation: XrSingaporePoiSurfacePresentation
}>

export type XrSingaporeMajorPoiId = SingaporeMajorPoiId

export type XrSingaporeMajorPoi = Readonly<{
  id: XrSingaporeMajorPoiId
  label: string
  surfaces: readonly XrSingaporePoiSurface[]
}>

export const XR_SINGAPORE_STAGE_SIZE_METERS = Object.freeze([
  32,
  24,
] as const)

const XR_SINGAPORE_SPECIALIZED_POI_STYLES: Readonly<Record<
  string,
  RegionalPoiPresentationStyle
>> = Object.freeze({
  'observation-wheel': Object.freeze({
    color: '#eef7f7',
    presentation: 'observation-wheel',
    tone: 'light',
  }),
  skypark: Object.freeze({
    color: '#eef2e8',
    presentation: 'skypark',
    tone: 'light',
  }),
  supertree: Object.freeze({
    color: '#4ea86b',
    presentation: 'supertree',
    tone: 'accent',
  }),
  tower: Object.freeze({
    color: '#c8d5dd',
    presentation: 'tower',
    tone: 'light',
  }),
})

const XR_SINGAPORE_POLYGON_EXTRUSION_STYLE = Object.freeze({
  color: '#d6c7ac',
  presentation: 'polygon-extrusion',
  tone: 'mid',
} as const satisfies RegionalPoiPresentationStyle)

const XR_SINGAPORE_REGIONAL_POI_STYLES = Object.freeze(Object.fromEntries(
  [...new Set(SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.map(
    surface => surface.category,
  ))].map(category => [
    category,
    XR_SINGAPORE_SPECIALIZED_POI_STYLES[category]
      ?? XR_SINGAPORE_POLYGON_EXTRUSION_STYLE,
  ]),
))

export const XR_SINGAPORE_REGIONAL_POI_PRESENTATION_POLICY =
  createRegionalPoiPresentationPolicy({
    profile: SINGAPORE_MAJOR_POI_GEO_PROFILE,
    stylesByCategory: XR_SINGAPORE_REGIONAL_POI_STYLES,
  })

export const XR_SINGAPORE_REGIONAL_POI_PRESENTATION =
  createRegionalPoiXrPresentation({
    profile: SINGAPORE_MAJOR_POI_GEO_PROFILE,
    sizeMeters: XR_SINGAPORE_STAGE_SIZE_METERS,
    styleByCategory:
      XR_SINGAPORE_REGIONAL_POI_PRESENTATION_POLICY.stylesByCategory,
  })

export const XR_SINGAPORE_MAJOR_POI_SURFACES = (
  XR_SINGAPORE_REGIONAL_POI_PRESENTATION.surfaces
) as readonly XrSingaporePoiSurface[]

export const XR_SINGAPORE_MAJOR_POIS: readonly XrSingaporeMajorPoi[] =
  Object.freeze(SINGAPORE_MAJOR_POI_IDENTITIES.map(identity => Object.freeze({
    id: identity.id,
    label: identity.label,
    surfaces: Object.freeze(XR_SINGAPORE_MAJOR_POI_SURFACES.filter(
      surface => surface.poiId === identity.id,
    )),
  })))

export function resolveXrSingaporeMajorPoi(
  poiId: XrSingaporeMajorPoiId,
): XrSingaporeMajorPoi {
  const poi = XR_SINGAPORE_MAJOR_POIS.find(candidate => candidate.id === poiId)
  if (!poi) throw new Error(`Unknown Singapore major POI: ${poiId}`)
  return poi
}
