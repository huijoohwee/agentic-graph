import {
  SINGAPORE_CANONICAL_CENTER,
  SINGAPORE_PRESENTATION_BOUNDS,
  type GeospatialCoordinate,
  type GeospatialPresentationBounds,
} from 'grph-shared/geospatial/singaporeFlightGeo'

export type SingaporeMapViewMode =
  | '2d'
  | '2d-modern'
  | '3d'
  | '3d-modern'

export type SingaporeMapCameraPolicy = Readonly<{
  bearing: number
  center: GeospatialCoordinate
  maxPitch: number
  pitch: number
  presentationBounds: GeospatialPresentationBounds
  zoom: number
}>

export type SingaporeMapInitialCameraOptions = Readonly<{
  bounds: GeospatialPresentationBounds
  fitBoundsOptions: Readonly<{
    bearing: number
    duration: 0
    maxZoom: number
    padding: number
    pitch: number
  }>
  maxPitch: number
}>

const NORTH_UP_CAMERA: SingaporeMapCameraPolicy = Object.freeze({
  bearing: 0,
  center: SINGAPORE_CANONICAL_CENTER,
  maxPitch: 60,
  pitch: 0,
  presentationBounds: SINGAPORE_PRESENTATION_BOUNDS,
  zoom: 12,
})

const OBLIQUE_CITY_CAMERA: SingaporeMapCameraPolicy = Object.freeze({
  bearing: -18,
  center: SINGAPORE_CANONICAL_CENTER,
  maxPitch: 85,
  pitch: 55,
  presentationBounds: SINGAPORE_PRESENTATION_BOUNDS,
  zoom: 12.8,
})

const CAMERA_BY_VIEW_MODE: Readonly<
  Record<SingaporeMapViewMode, SingaporeMapCameraPolicy>
> = Object.freeze({
  '2d': NORTH_UP_CAMERA,
  '2d-modern': NORTH_UP_CAMERA,
  '3d': OBLIQUE_CITY_CAMERA,
  '3d-modern': OBLIQUE_CITY_CAMERA,
})

export function readSingaporeMapCameraPolicy(
  viewMode: SingaporeMapViewMode,
): SingaporeMapCameraPolicy {
  return CAMERA_BY_VIEW_MODE[viewMode]
}

export function readSingaporeCanvasCameraPolicy(
  canvasRenderMode: '2d' | '3d',
): SingaporeMapCameraPolicy {
  return canvasRenderMode === '3d'
    ? OBLIQUE_CITY_CAMERA
    : NORTH_UP_CAMERA
}

export function createSingaporeMapInitialCameraOptions(
  camera: SingaporeMapCameraPolicy,
): SingaporeMapInitialCameraOptions {
  return Object.freeze({
    bounds: camera.presentationBounds,
    fitBoundsOptions: Object.freeze({
      bearing: camera.bearing,
      duration: 0,
      maxZoom: camera.zoom,
      padding: 32,
      pitch: camera.pitch,
    }),
    maxPitch: camera.maxPitch,
  })
}

export function alignMapToSingaporePresentation(
  map: any,
  camera: SingaporeMapCameraPolicy,
): boolean {
  try {
    if (typeof map?.fitBounds === 'function') {
      map.fitBounds(
        camera.presentationBounds.map(coordinate => [...coordinate]),
        createSingaporeMapInitialCameraOptions(camera).fitBoundsOptions,
      )
      return true
    }
    if (typeof map?.jumpTo !== 'function') return false
    map.jumpTo({
      bearing: camera.bearing,
      center: [...camera.center],
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      pitch: camera.pitch,
      zoom: camera.zoom,
    })
    return true
  } catch {
    return false
  }
}
