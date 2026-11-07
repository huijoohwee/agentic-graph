import * as THREE from 'three'
import type { SpatialCapturePointCloudLoad } from '@/lib/assets/spatialCaptureAssetRuntime'
import type { PlyPointCloud } from '@/lib/assets/plyPointCloud'

export function projectRelativeDepthPointCloud(input: Readonly<{
  width: number; height: number; rgba: Uint8ClampedArray; depth: Float32Array
  fovDegrees?: number; nearWhite?: boolean; mirrorX?: boolean; pointBudget?: number
}>): Readonly<{ pointCloud: PlyPointCloud; units: 'relative'; scale: 'unknown';
  intrinsics: Readonly<{ fx: number; fy: number; cx: number; cy: number; source: 'assumed-fov' }> }> {
  const { width, height, rgba, depth } = input
  const fov = input.fovDegrees ?? 60
  const budget = input.pointBudget ?? 20_000
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > 1024 || height > 1024 || !(rgba instanceof Uint8ClampedArray)
    || rgba.length !== width * height * 4 || !(depth instanceof Float32Array)
    || depth.length !== width * height || !Number.isFinite(fov) || fov < 20 || fov > 120
    || !Number.isSafeInteger(budget) || budget < 1 || budget > 20_000) {
    throw new Error('Relative depth projection input is malformed or exceeds its bound')
  }
  const fx = width / (2 * Math.tan(fov * Math.PI / 360))
  const fy = fx // Square pixels are an explicit assumption, not device calibration.
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const stride = Math.ceil(Math.sqrt(width * height / budget))
  const positions = new Float32Array(budget * 3)
  const colors = new Float32Array(budget * 3)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let count = 0
  for (let y = 0; y < height && count < budget; y += stride) {
    for (let x = 0; x < width && count < budget; x += stride) {
      const pixel = y * width + x
      const value = depth[pixel]
      if (!Number.isFinite(value) || value < 0 || value > 1 || rgba[pixel * 4 + 3] === 0) continue
      const z = 0.2 + (input.nearWhite ? 1 - value : value) // Relative display depth, never metres.
      const sourceX = input.mirrorX ? width - 1 - x : x
      const point: [number, number, number] = [(sourceX - cx) * z / fx, -(y - cy) * z / fy, -z]
      const offset = count * 3
      for (let axis = 0; axis < 3; axis += 1) {
        positions[offset + axis] = point[axis]
        min[axis] = Math.min(min[axis], point[axis])
        max[axis] = Math.max(max[axis], point[axis])
        colors[offset + axis] = rgba[pixel * 4 + axis] / 255
      }
      count += 1
    }
  }
  if (!count) throw new Error('Relative depth contains no valid visible points')
  const center: [number, number, number] = min.map((value, axis) => (value + max[axis]) / 2) as [number, number, number]
  const pointCloud: PlyPointCloud = { kind: 'point-cloud', positions: positions.slice(0, count * 3),
    colors: colors.slice(0, count * 3), opacities: null, splatScales: null, splatRotations: null,
    sourcePointCount: width * height, pointCount: count,
    bounds: { min, max, center, maxExtent: Math.max(...max.map((value, axis) => value - min[axis])) } }
  return { pointCloud, units: 'relative', scale: 'unknown',
    intrinsics: { fx, fy, cx, cy, source: 'assumed-fov' } }
}

export const SPATIAL_CAPTURE_SORT_BUCKETS = 32768
export const SPATIAL_CAPTURE_SORT_DIRECTION_DOT_MIN = 0.985
export const SPATIAL_CAPTURE_SORT_INTERVAL_MS = 960
export const SPATIAL_CAPTURE_SORT_SETTLE_MS = 180
export const SPATIAL_CAPTURE_PROGRESSIVE_INTERVAL_MS = 160
export const SPATIAL_CAPTURE_PROGRESSIVE_MIN_STEP = 120_000
export const SPATIAL_CAPTURE_PROGRESSIVE_STEP_FACTOR = 1.45
export const SPATIAL_CAPTURE_INITIAL_VIEW_DIRECTION = [-0.95, -0.28, -0.12] as const

type GaussianSortScratch = {
  bucketCount: number
  count: number
  histogram: Uint32Array
  offsets: Uint32Array
  order: Uint16Array | Uint32Array
  writes: Uint32Array
}

const gaussianSortScratchByGeometry = new WeakMap<THREE.InstancedBufferGeometry, GaussianSortScratch>()
const gaussianActiveSortOrderByGeometry = new WeakMap<
  THREE.InstancedBufferGeometry,
  Uint16Array | Uint32Array | null
>()

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveGaussianSortScratch(geometry: THREE.InstancedBufferGeometry, count: number, bucketCount: number): GaussianSortScratch {
  const existing = gaussianSortScratchByGeometry.get(geometry)
  if (existing && existing.count === count && existing.bucketCount === bucketCount) return existing
  const next: GaussianSortScratch = {
    bucketCount,
    count,
    histogram: new Uint32Array(bucketCount),
    offsets: new Uint32Array(bucketCount),
    order: count > 65535 ? new Uint32Array(count) : new Uint16Array(count),
    writes: new Uint32Array(bucketCount),
  }
  gaussianSortScratchByGeometry.set(geometry, next)
  return next
}

function buildDepthSortedIndex(
  positions: Float32Array,
  direction: readonly [number, number, number],
  scratch: GaussianSortScratch,
): Uint16Array | Uint32Array | null {
  const count = scratch.count
  if (count <= 1 || positions.length < count * 3) return null
  const [dx, dy, dz] = direction
  let minDepth = Number.POSITIVE_INFINITY
  let maxDepth = Number.NEGATIVE_INFINITY
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    const depth = positions[offset] * dx + positions[offset + 1] * dy + positions[offset + 2] * dz
    if (depth < minDepth) minDepth = depth
    if (depth > maxDepth) maxDepth = depth
  }
  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth) || maxDepth <= minDepth) return null
  const bucketCount = scratch.bucketCount
  const histogram = scratch.histogram
  histogram.fill(0)
  const scale = (bucketCount - 1) / Math.max(1e-6, maxDepth - minDepth)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    const bucket = clamp(Math.floor((positions[offset] * dx + positions[offset + 1] * dy + positions[offset + 2] * dz - minDepth) * scale), 0, bucketCount - 1)
    histogram[bucket] += 1
  }
  const offsets = scratch.offsets
  const writes = scratch.writes
  let cursor = 0
  for (let bucket = bucketCount - 1; bucket >= 0; bucket -= 1) {
    offsets[bucket] = cursor
    writes[bucket] = cursor
    cursor += histogram[bucket]
  }
  const out = scratch.order
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    const bucket = clamp(Math.floor((positions[offset] * dx + positions[offset + 1] * dy + positions[offset + 2] * dz - minDepth) * scale), 0, bucketCount - 1)
    out[writes[bucket]] = index
    writes[bucket] += 1
  }
  return out
}

export function dotSortDirection(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalizeSortDirection(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z)
  if (!(length > 1e-6)) return SPATIAL_CAPTURE_INITIAL_VIEW_DIRECTION
  return [x / length, y / length, z / length]
}

export function resolveCameraSortDirection(camera: THREE.Camera): readonly [number, number, number] {
  const elements = camera.matrixWorld.elements
  return normalizeSortDirection(-elements[8], -elements[9], -elements[10])
}

export function resolveSpatialCaptureInitialInstanceCount(load: SpatialCapturePointCloudLoad): number {
  return Math.min(load.pointCloud.pointCount, Math.max(1, Math.floor(load.pointBudget || load.pointCloud.pointCount)))
}

function sliceSpatialCaptureFloatAttribute(values: Float32Array, itemSize: number, count: number): Float32Array {
  const attributeCount = Math.floor(values.length / itemSize)
  const boundedCount = Math.min(attributeCount, Math.max(1, Math.floor(count)))
  return boundedCount >= attributeCount ? values : values.subarray(0, boundedCount * itemSize)
}

function readSpatialCaptureAttributeCount(geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry): number {
  const raw = Number(geometry.userData.kgSpatialCaptureAttributeCount)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

function writeSpatialCaptureAttributeCount(geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry, count: number): void {
  geometry.userData.kgSpatialCaptureAttributeCount = Math.max(1, Math.floor(count))
}

function syncPointCloudGeometryAttributeViews(
  geometry: THREE.BufferGeometry,
  load: SpatialCapturePointCloudLoad,
  count: number,
): void {
  if (readSpatialCaptureAttributeCount(geometry) >= count) return
  geometry.setAttribute('position', new THREE.BufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.positions, 3, count), 3))
  if (load.pointCloud.colors) {
    geometry.setAttribute('pointColor', new THREE.BufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.colors, 3, count), 3))
  }
  writeSpatialCaptureAttributeCount(geometry, count)
}

function syncGaussianSplatGeometryAttributeViews(
  geometry: THREE.InstancedBufferGeometry,
  load: SpatialCapturePointCloudLoad,
  count: number,
): void {
  if (readSpatialCaptureAttributeCount(geometry) >= count) return
  geometry.setAttribute('splatCenter', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.positions, 3, count), 3))
  if (load.pointCloud.colors) geometry.setAttribute('splatColor', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.colors, 3, count), 3))
  if (load.pointCloud.opacities) geometry.setAttribute('splatOpacity', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.opacities, 1, count), 1))
  if (load.pointCloud.splatScales) geometry.setAttribute('splatScale', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.splatScales, 3, count), 3))
  if (load.pointCloud.splatRotations) geometry.setAttribute('splatRotation', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(load.pointCloud.splatRotations, 4, count), 4))
  const editorVisibility = geometry.userData.kgGaussianSplatEditorVisibility
  if (editorVisibility instanceof Float32Array) {
    geometry.setAttribute('splatEditorVisible', new THREE.InstancedBufferAttribute(sliceSpatialCaptureFloatAttribute(editorVisibility, 1, count), 1))
  }
  writeSpatialCaptureAttributeCount(geometry, count)
}

function syncSpatialCaptureGeometryAttributeViews(
  geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry,
  load: SpatialCapturePointCloudLoad,
  count: number,
): void {
  if (geometry instanceof THREE.InstancedBufferGeometry) {
    syncGaussianSplatGeometryAttributeViews(geometry, load, count)
    return
  }
  syncPointCloudGeometryAttributeViews(geometry, load, count)
}

export function readSpatialCaptureGeometryCount(geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry, load: SpatialCapturePointCloudLoad): number {
  if (geometry instanceof THREE.InstancedBufferGeometry) {
    return Math.min(load.pointCloud.pointCount, Math.max(0, Math.floor(geometry.instanceCount || 0)))
  }
  const drawCount = Number(geometry.drawRange.count)
  return Number.isFinite(drawCount) && drawCount >= 0
    ? Math.min(load.pointCloud.pointCount, Math.floor(drawCount))
    : load.pointCloud.pointCount
}

function writeSpatialCaptureGeometryCount(
  geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry,
  load: SpatialCapturePointCloudLoad,
  nextCount: number,
): void {
  const boundedCount = Math.min(load.pointCloud.pointCount, Math.max(1, Math.floor(nextCount)))
  syncSpatialCaptureGeometryAttributeViews(geometry, load, boundedCount)
  if (geometry instanceof THREE.InstancedBufferGeometry) {
    geometry.instanceCount = boundedCount
    return
  }
  geometry.setDrawRange(0, boundedCount)
}

export function advanceSpatialCaptureProgressiveCount(
  geometry: THREE.BufferGeometry | THREE.InstancedBufferGeometry,
  load: SpatialCapturePointCloudLoad,
): boolean {
  const targetCount = load.pointCloud.pointCount
  const currentCount = readSpatialCaptureGeometryCount(geometry, load)
  if (currentCount >= targetCount) return false
  const nextCount = Math.min(
    targetCount,
    Math.max(
      currentCount + SPATIAL_CAPTURE_PROGRESSIVE_MIN_STEP,
      Math.ceil(currentCount * SPATIAL_CAPTURE_PROGRESSIVE_STEP_FACTOR),
    ),
  )
  writeSpatialCaptureGeometryCount(geometry, load, nextCount)
  return nextCount >= targetCount
}

export function buildPointCloudGeometry(load: SpatialCapturePointCloudLoad): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const initialCount = resolveSpatialCaptureInitialInstanceCount(load)
  syncPointCloudGeometryAttributeViews(geometry, load, initialCount)
  geometry.setDrawRange(0, initialCount)
  geometry.computeBoundingSphere()
  return geometry
}

function writeReorderedFloatAttribute(
  target: Float32Array,
  values: Float32Array,
  itemSize: number,
  order: Uint16Array | Uint32Array | null,
): void {
  if (!order) {
    target.set(values)
    return
  }
  for (let nextIndex = 0; nextIndex < order.length; nextIndex += 1) {
    const sourceIndex = order[nextIndex]
    const sourceOffset = sourceIndex * itemSize
    const targetOffset = nextIndex * itemSize
    for (let component = 0; component < itemSize; component += 1) {
      target[targetOffset + component] = values[sourceOffset + component]
    }
  }
}

function resolveWritableReorderAttribute(
  geometry: THREE.InstancedBufferGeometry,
  name: string,
  values: Float32Array,
  itemSize: number,
): THREE.InstancedBufferAttribute | null {
  const attribute = geometry.getAttribute(name)
  if (!(attribute instanceof THREE.InstancedBufferAttribute) || !(attribute.array instanceof Float32Array)) return null
  if (attribute.array !== values) return attribute
  const next = new THREE.InstancedBufferAttribute(new Float32Array(values.length), itemSize)
  geometry.setAttribute(name, next)
  return next
}

function updateReorderedFloatAttribute(
  geometry: THREE.InstancedBufferGeometry,
  name: string,
  values: Float32Array | null,
  itemSize: number,
  order: Uint16Array | Uint32Array | null,
): void {
  if (!values) return
  const attribute = resolveWritableReorderAttribute(geometry, name, values, itemSize)
  if (!attribute) return
  writeReorderedFloatAttribute(attribute.array as Float32Array, values, itemSize, order)
  attribute.needsUpdate = true
}

export function updateGaussianSplatGeometrySort(
  geometry: THREE.InstancedBufferGeometry,
  load: SpatialCapturePointCloudLoad,
  direction: readonly [number, number, number],
): void {
  const count = Math.min(load.pointCloud.pointCount, Math.floor(load.pointCloud.positions.length / 3))
  const bucketCount = Math.min(SPATIAL_CAPTURE_SORT_BUCKETS, Math.max(64, count))
  const order = buildDepthSortedIndex(load.pointCloud.positions, direction, resolveGaussianSortScratch(geometry, count, bucketCount))
  gaussianActiveSortOrderByGeometry.set(geometry, order)
  updateReorderedFloatAttribute(geometry, 'splatCenter', load.pointCloud.positions, 3, order)
  updateReorderedFloatAttribute(geometry, 'splatColor', load.pointCloud.colors, 3, order)
  updateReorderedFloatAttribute(geometry, 'splatOpacity', load.pointCloud.opacities, 1, order)
  updateReorderedFloatAttribute(geometry, 'splatScale', load.pointCloud.splatScales, 3, order)
  updateReorderedFloatAttribute(geometry, 'splatRotation', load.pointCloud.splatRotations, 4, order)
  const editorVisibility = geometry.userData.kgGaussianSplatEditorVisibility
  if (editorVisibility instanceof Float32Array) {
    updateReorderedFloatAttribute(geometry, 'splatEditorVisible', editorVisibility, 1, order)
  }
}

export function updateGaussianSplatEditorVisibility(
  geometry: THREE.InstancedBufferGeometry,
  visibility: Float32Array,
): void {
  geometry.userData.kgGaussianSplatEditorVisibility = visibility
  const order = gaussianActiveSortOrderByGeometry.get(geometry) || null
  const count = order?.length || Math.min(visibility.length, Math.max(1, readSpatialCaptureAttributeCount(geometry)))
  const values = count >= visibility.length ? visibility : visibility.subarray(0, count)
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
  writeReorderedFloatAttribute(attribute.array as Float32Array, values, 1, order)
  attribute.needsUpdate = true
  geometry.setAttribute('splatEditorVisible', attribute)
}

export function buildGaussianSplatGeometry(load: SpatialCapturePointCloudLoad): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry()
  const initialCount = resolveSpatialCaptureInitialInstanceCount(load)
  const editorVisibility = new Float32Array(load.pointCloud.pointCount)
  editorVisibility.fill(1)
  geometry.userData.kgGaussianSplatEditorVisibility = editorVisibility
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1))
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,
    1, -1, 0,
    1, 1, 0,
    -1, 1, 0,
  ]), 3))
  syncGaussianSplatGeometryAttributeViews(geometry, load, initialCount)
  geometry.instanceCount = initialCount
  const bounds = load.pointCloud.bounds
  const center = new THREE.Vector3(bounds.center[0], bounds.center[1], bounds.center[2])
  const radius = Math.max(
    center.distanceTo(new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2])),
    center.distanceTo(new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.max[2])),
    center.distanceTo(new THREE.Vector3(bounds.min[0], bounds.max[1], bounds.min[2])),
    center.distanceTo(new THREE.Vector3(bounds.min[0], bounds.max[1], bounds.max[2])),
    center.distanceTo(new THREE.Vector3(bounds.max[0], bounds.min[1], bounds.min[2])),
    center.distanceTo(new THREE.Vector3(bounds.max[0], bounds.min[1], bounds.max[2])),
    center.distanceTo(new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.min[2])),
    center.distanceTo(new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2])),
  )
  geometry.boundingSphere = new THREE.Sphere(center, Math.max(1, radius))
  return geometry
}
