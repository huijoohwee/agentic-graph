import * as THREE from 'three'
import { parseCityParcelId } from './citySimModel'

export const CITY_SIM_PARCEL_DEPTH = 0.18
export const CITY_SIM_PARCEL_GAP = 0.08
export const CITY_SIM_MAX_BUILDING_HEIGHT = 3.9

const CITY_SIM_MIN_VIEW_SPAN = 8
const CITY_SIM_CAMERA_HEIGHT_RATIO = 1.35
const CITY_SIM_CAMERA_FIT_PADDING = 1.08

export type CitySimCameraFraming = Readonly<{
  aspect: number
  bottom: number
  far: number
  left: number
  near: number
  position: readonly [number, number, number]
  right: number
  target: readonly [number, number, number]
  top: number
}>

function requireGridDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function resolveViewportAspect(width: number, height: number): number {
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return 1
  }
  return width / height
}

export function resolveCitySimCameraFraming(input: Readonly<{
  columns: number
  rows: number
  selectedParcelId?: string | null
  viewportHeight: number
  viewportWidth: number
}>): CitySimCameraFraming {
  const columns = requireGridDimension(input.columns, 'City columns')
  const rows = requireGridDimension(input.rows, 'City rows')
  const aspect = resolveViewportAspect(input.viewportWidth, input.viewportHeight)
  const gridSpan = Math.max(CITY_SIM_MIN_VIEW_SPAN, columns, rows)
  const selectedCoordinates = input.selectedParcelId
    ? parseCityParcelId(input.selectedParcelId)
    : null
  if (
    selectedCoordinates
    && (
      selectedCoordinates.row >= rows
      || selectedCoordinates.column >= columns
    )
  ) {
    throw new Error(`City camera focus parcel ${input.selectedParcelId} is outside the grid.`)
  }
  const target = new THREE.Vector3(
    selectedCoordinates
      ? selectedCoordinates.column - ((columns - 1) / 2)
      : 0,
    0,
    selectedCoordinates
      ? selectedCoordinates.row - ((rows - 1) / 2)
      : 0,
  )
  const position = new THREE.Vector3(
    target.x + gridSpan,
    gridSpan * CITY_SIM_CAMERA_HEIGHT_RATIO,
    target.z + gridSpan,
  )
  const cameraWorldMatrix = new THREE.Matrix4()
    .lookAt(position, target, new THREE.Vector3(0, 1, 0))
    .setPosition(position)
  const viewMatrix = cameraWorldMatrix.clone().invert()
  const halfGridWidth = columns / 2
  const halfGridDepth = rows / 2
  const maximumStageY = CITY_SIM_PARCEL_DEPTH + CITY_SIM_MAX_BUILDING_HEIGHT
  let contentHalfWidth = 0
  let contentHalfHeight = 0

  for (const x of [-halfGridWidth, halfGridWidth]) {
    for (const y of [0, maximumStageY]) {
      for (const z of [-halfGridDepth, halfGridDepth]) {
        const viewPoint = new THREE.Vector3(x, y, z).applyMatrix4(viewMatrix)
        contentHalfWidth = Math.max(contentHalfWidth, Math.abs(viewPoint.x))
        contentHalfHeight = Math.max(contentHalfHeight, Math.abs(viewPoint.y))
      }
    }
  }

  const minimumHalfHeight = CITY_SIM_MIN_VIEW_SPAN / 2
  const halfViewHeight = Math.max(
    minimumHalfHeight,
    contentHalfHeight,
    contentHalfWidth / aspect,
  ) * CITY_SIM_CAMERA_FIT_PADDING
  const halfViewWidth = halfViewHeight * aspect

  return Object.freeze({
    aspect,
    bottom: -halfViewHeight,
    far: gridSpan * 10,
    left: -halfViewWidth,
    near: 0.1,
    position: Object.freeze([
      position.x,
      position.y,
      position.z,
    ]) as readonly [number, number, number],
    right: halfViewWidth,
    target: Object.freeze([
      target.x,
      target.y,
      target.z,
    ]) as readonly [number, number, number],
    top: halfViewHeight,
  })
}
