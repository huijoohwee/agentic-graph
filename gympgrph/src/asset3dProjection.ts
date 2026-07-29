import type { CustomRenderMethodInput } from 'maplibre-gl'
import type { Asset3DConfig } from 'grph-shared/geospatial/enhancedLayerContract'

type AssetProjectionInput = Pick<
  Asset3DConfig,
  'lat' | 'lng' | 'altitudeMeters' | 'scale' | 'rotationDegrees'
>

export type AssetProjectionMap = object

type AssetFrameProjection = Pick<CustomRenderMethodInput, 'defaultProjectionData'>

const MATRIX_LENGTH = 16
const MAX_MERCATOR_LATITUDE = 85.051129
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * 6_371_008.8

const isFiniteMatrix = (matrix: ArrayLike<number> | null | undefined): matrix is ArrayLike<number> => {
  if (!matrix || matrix.length !== MATRIX_LENGTH) return false
  for (let index = 0; index < MATRIX_LENGTH; index += 1) {
    if (!Number.isFinite(Number(matrix[index]))) return false
  }
  return true
}

const multiplyMatrices = (left: ArrayLike<number>, right: ArrayLike<number>): Float64Array => {
  const result = new Float64Array(MATRIX_LENGTH)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        Number(left[row]) * Number(right[column * 4])
        + Number(left[4 + row]) * Number(right[column * 4 + 1])
        + Number(left[8 + row]) * Number(right[column * 4 + 2])
        + Number(left[12 + row]) * Number(right[column * 4 + 3])
    }
  }
  return result
}

const createMercatorModelMatrix = (
  asset: Pick<Asset3DConfig, 'lat' | 'lng' | 'altitudeMeters'>,
): Float64Array | null => {
  const latitudeRadians = asset.lat * Math.PI / 180
  const x = (180 + asset.lng) / 360
  const y = (
    180 - 180 / Math.PI
      * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
  ) / 360
  const meterScale = 1 / (
    EARTH_CIRCUMFERENCE_METERS * Math.cos(latitudeRadians)
  )
  const z = asset.altitudeMeters * meterScale
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(z)
    || !Number.isFinite(meterScale)
    || meterScale <= 0
  ) {
    return null
  }

  // Convert MapLibre's y-up model meters into normalized, z-up Mercator coordinates.
  return new Float64Array([
    meterScale, 0, 0, 0,
    0, 0, meterScale, 0,
    0, meterScale, 0, 0,
    x, y, z, 1,
  ])
}

export const isSafeAssetProjectionInput = (asset: AssetProjectionInput): boolean => {
  return Number.isFinite(asset.lng)
    && asset.lng >= -180
    && asset.lng <= 180
    && Number.isFinite(asset.lat)
    && asset.lat >= -MAX_MERCATOR_LATITUDE
    && asset.lat <= MAX_MERCATOR_LATITUDE
    && Number.isFinite(asset.altitudeMeters)
    && Number.isFinite(asset.scale)
    && asset.scale > 0
    && Number.isFinite(asset.rotationDegrees)
}

export function computeAssetZUpLocalMatrix(
  asset: Pick<Asset3DConfig, 'scale' | 'rotationDegrees'>,
): Float64Array {
  const radians = asset.rotationDegrees * Math.PI / 180
  const cosine = Math.cos(radians) * asset.scale
  const sine = Math.sin(radians) * asset.scale

  // MapLibre's model matrix is y-up; source-authored Knowgrph meshes are z-up.
  return new Float64Array([
    cosine, 0, sine, 0,
    -sine, 0, cosine, 0,
    0, asset.scale, 0, 0,
    0, 0, 0, 1,
  ])
}

export function computeAssetFrameMatrix(
  _map: AssetProjectionMap,
  frame: AssetFrameProjection,
  asset: AssetProjectionInput,
): Float32Array | null {
  if (!isSafeAssetProjectionInput(asset)) return null
  const projectionData = frame.defaultProjectionData
  const projectionTransition = projectionData?.projectionTransition ?? 0
  if (
    !Number.isFinite(projectionTransition)
    || projectionTransition !== 0
  ) {
    return null
  }
  const mainMatrix = projectionData?.mainMatrix
  if (!isFiniteMatrix(mainMatrix)) return null

  const mapModelMatrix = createMercatorModelMatrix(asset)
  if (!mapModelMatrix) return null
  const modelMatrix = multiplyMatrices(mapModelMatrix, computeAssetZUpLocalMatrix(asset))
  const frameMatrix = multiplyMatrices(mainMatrix, modelMatrix)
  if (!isFiniteMatrix(frameMatrix)) return null

  const webGlMatrix = new Float32Array(frameMatrix)
  return isFiniteMatrix(webGlMatrix) ? webGlMatrix : null
}
