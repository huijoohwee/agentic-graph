import type { CustomRenderMethodInput } from 'maplibre-gl'
import type { Asset3DConfig } from 'grph-shared/geospatial/enhancedLayerContract'

type AssetProjectionInput = Pick<
  Asset3DConfig,
  'lat' | 'lng' | 'altitudeMeters' | 'scale' | 'rotationDegrees'
>

export type AssetProjectionMap = {
  transform?: {
    getMatrixForModel?: (
      location: [lng: number, lat: number],
      altitudeMeters?: number,
    ) => ArrayLike<number>
  }
}

type AssetFrameProjection = Pick<CustomRenderMethodInput, 'defaultProjectionData'>

const MATRIX_LENGTH = 16

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

export const isSafeAssetProjectionInput = (asset: AssetProjectionInput): boolean => {
  return Number.isFinite(asset.lng)
    && asset.lng >= -180
    && asset.lng <= 180
    && Number.isFinite(asset.lat)
    && asset.lat >= -90
    && asset.lat <= 90
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
  map: AssetProjectionMap,
  frame: AssetFrameProjection,
  asset: AssetProjectionInput,
): Float32Array | null {
  if (!isSafeAssetProjectionInput(asset)) return null
  const mainMatrix = frame.defaultProjectionData?.mainMatrix
  const getMatrixForModel = map.transform?.getMatrixForModel
  if (!isFiniteMatrix(mainMatrix) || typeof getMatrixForModel !== 'function') return null

  let mapModelMatrix: ArrayLike<number>
  try {
    mapModelMatrix = getMatrixForModel.call(
      map.transform,
      [asset.lng, asset.lat],
      asset.altitudeMeters,
    )
  } catch {
    return null
  }
  if (!isFiniteMatrix(mapModelMatrix)) return null

  const modelMatrix = multiplyMatrices(mapModelMatrix, computeAssetZUpLocalMatrix(asset))
  const frameMatrix = multiplyMatrices(mainMatrix, modelMatrix)
  if (!isFiniteMatrix(frameMatrix)) return null

  const webGlMatrix = new Float32Array(frameMatrix)
  return isFiniteMatrix(webGlMatrix) ? webGlMatrix : null
}
