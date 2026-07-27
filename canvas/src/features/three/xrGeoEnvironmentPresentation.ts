import { FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT } from '@/features/game-flight-sim/flightSimSpatialScale'
import type { GeospatialViewMode } from 'grph-shared/geospatial/events'

export const GEO_XR_ENVIRONMENT_PRESENTATION_IDS = [
  '2d-classic',
  '2d-modern',
  '3d-classic',
  '3d-modern',
] as const

export type GeoXrEnvironmentPresentationId =
  (typeof GEO_XR_ENVIRONMENT_PRESENTATION_IDS)[number]

export type GeoXrEnvironmentPresentation = Readonly<{
  id: GeoXrEnvironmentPresentationId
  dimension: 'planar' | 'volumetric'
  theme: 'classic' | 'modern'
  surfaceColor: string
  surfaceOpacity: number
  gridCenterColor: string
  gridColor: string
  gridDivisionsPerMeter: number
  ambientIntensity: number
  hemisphereSkyColor: string
  hemisphereGroundColor: string
  hemisphereIntensity: number
  directionalColor: string
  directionalIntensity: number
}>

export type GeoXrPlanCameraFraming = Readonly<{
  position: readonly [number, number, number]
  target: readonly [number, number, number]
  fovDegrees: number
}>

const NORTH_UP_DEPTH_BIAS_RATIO = 0.000_001

const PRESENTATIONS: Readonly<Record<
  GeoXrEnvironmentPresentationId,
  GeoXrEnvironmentPresentation
>> = Object.freeze({
  '2d-classic': Object.freeze({
    id: '2d-classic',
    dimension: 'planar',
    theme: 'classic',
    surfaceColor: '#d8cdb2',
    surfaceOpacity: 0.1,
    gridCenterColor: '#7c6544',
    gridColor: '#a89470',
    gridDivisionsPerMeter: 1,
    ambientIntensity: 0.52,
    hemisphereSkyColor: '#e8dcc4',
    hemisphereGroundColor: '#897354',
    hemisphereIntensity: 0.48,
    directionalColor: '#fff0cd',
    directionalIntensity: 1.45,
  }),
  '2d-modern': Object.freeze({
    id: '2d-modern',
    dimension: 'planar',
    theme: 'modern',
    surfaceColor: '#67e8f9',
    surfaceOpacity: 0.07,
    gridCenterColor: '#22d3ee',
    gridColor: '#60a5fa',
    gridDivisionsPerMeter: 2,
    ambientIntensity: 0.44,
    hemisphereSkyColor: '#dff7ff',
    hemisphereGroundColor: '#5797a8',
    hemisphereIntensity: 0.62,
    directionalColor: '#e0f7ff',
    directionalIntensity: 1.9,
  }),
  '3d-classic': Object.freeze({
    id: '3d-classic',
    dimension: 'volumetric',
    theme: 'classic',
    surfaceColor: '#c7b48b',
    surfaceOpacity: 0.055,
    gridCenterColor: '#8a714c',
    gridColor: '#b9a37b',
    gridDivisionsPerMeter: 1,
    ambientIntensity: 0.42,
    hemisphereSkyColor: '#e8dcc4',
    hemisphereGroundColor: '#897354',
    hemisphereIntensity: 0.5,
    directionalColor: '#fff0cd',
    directionalIntensity: 1.55,
  }),
  '3d-modern': Object.freeze({
    id: '3d-modern',
    dimension: 'volumetric',
    theme: 'modern',
    surfaceColor: '#38bdf8',
    surfaceOpacity: 0.035,
    gridCenterColor: '#22d3ee',
    gridColor: '#3b82f6',
    gridDivisionsPerMeter: 2,
    ambientIntensity: 0.38,
    hemisphereSkyColor: '#dff7ff',
    hemisphereGroundColor: '#5797a8',
    hemisphereIntensity: 0.66,
    directionalColor: '#e0f7ff',
    directionalIntensity: 2.05,
  }),
})

export function resolveGeoXrEnvironmentPresentation(
  viewMode: GeospatialViewMode | null | undefined,
): GeoXrEnvironmentPresentation {
  const id: GeoXrEnvironmentPresentationId = viewMode === '3d-modern'
    ? '3d-modern'
    : viewMode === '3d'
      ? '3d-classic'
      : viewMode === '2d-modern'
        ? '2d-modern'
        : '2d-classic'
  return PRESENTATIONS[id]
}

export function resolveGeoXrPlanCameraFraming({
  aircraftPosition,
  aspect,
  coordinateScale,
  stageSizeMeters,
}: {
  aircraftPosition: readonly [number, number, number]
  aspect: number
  coordinateScale: number
  stageSizeMeters: readonly [number, number]
}): GeoXrPlanCameraFraming {
  const safeCoordinateScale = Number.isFinite(coordinateScale) && coordinateScale > 0
    ? coordinateScale
    : 1
  const worldScale = safeCoordinateScale * FLIGHT_SIM_METERS_PER_AUTHORED_WORLD_UNIT
  const stageSpan = Math.max(stageSizeMeters[0], stageSizeMeters[1], 1) * worldScale
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const verticalSpan = safeAspect < 1 ? stageSpan / safeAspect : stageSpan
  const fovDegrees = 50
  const cameraDistance = Math.max(
    stageSpan,
    verticalSpan / (2 * Math.tan((fovDegrees * Math.PI) / 360)),
  )
  // The slight +Z bias makes north (-Z) screen-up without changing OrbitControls' cached Y-up axis.
  const northUpDepthBias = cameraDistance * NORTH_UP_DEPTH_BIAS_RATIO
  const target = Object.freeze([
    aircraftPosition[0] * safeCoordinateScale,
    aircraftPosition[1] * safeCoordinateScale,
    aircraftPosition[2] * safeCoordinateScale,
  ] as const)
  return Object.freeze({
    position: Object.freeze([
      target[0],
      target[1] + cameraDistance,
      target[2] + northUpDepthBias,
    ] as const),
    target,
    fovDegrees,
  })
}
