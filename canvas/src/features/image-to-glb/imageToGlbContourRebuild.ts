import * as THREE from 'three'
import type { ImageToGlbPartManifestEntry } from './imageToGlbContract'
import type { ImageToGlbReferenceAnalysis, ImageToGlbSilhouetteSpan } from './imageToGlbSceneFactory'
import {
  IMAGE_TO_GLB_INSPECTION_CLIP_NAME,
  IMAGE_TO_GLB_INSPECTION_DURATION_SECONDS,
  IMAGE_TO_GLB_INSPECTION_MAXIMUM_YAW_RADIANS,
  IMAGE_TO_GLB_MODEL_ROOT_NAME,
} from './imageToGlbActionReadiness'

type RgbColor = { b: number; g: number; r: number }
type Point2 = readonly [number, number]

export type ImageToGlbContourComponentPlan = {
  areaRatio: number
  color: RgbColor
  depth: number
  inferredSurfaceConfidence: number
  materialIndex: number
  name: string
  outline: readonly Point2[]
  sourceSpanCount: number
}

export type ImageToGlbContourQualitySummary = {
  acceptedSpanCount: number
  componentCount: number
  estimatedTriangleCount: number
  inferredSurfaceConfidence: number
  materialCount: number
  outlinePointCount: number
  preservedRunTrackCount: number
  proceduralSourceBytes: number
  rawSpanCount: number
  retainedAreaRatio: number
  withinBudgets: boolean
}

export type ImageToGlbContourRebuildPlan = {
  budgets: {
    maxComponents: number
    maxMaterials: number
    maxOutlinePointsPerComponent: number
    maxSourceBytes: number
    maxTriangles: number
  }
  components: readonly ImageToGlbContourComponentPlan[]
  depthEvidence: {
    baseDepth: number
    foregroundCoverage: number
    inferredSurfaceConfidence: number
    method: 'front-silhouette-symmetry-inference'
    symmetryScore: number
  }
  materials: readonly RgbColor[]
  quality: ImageToGlbContourQualitySummary
  schema: 'agenticgraph-contour-rebuild/v1'
  worldHeight: number
  worldWidth: number
}

type NormalizedRun = {
  area: number
  bottom: number
  color: RgbColor
  height: number
  left: number
  right: number
  top: number
  y: number
}

type RunTrack = {
  area: number
  colorBlueArea: number
  colorGreenArea: number
  colorRedArea: number
  runs: NormalizedRun[]
}

const BUDGETS = Object.freeze({
  maxComponents: 24,
  maxMaterials: 6,
  maxOutlinePointsPerComponent: 48,
  maxSourceBytes: 28_000,
  maxTriangles: 16_000,
})

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const quantize = (value: number, places = 4) => Number(value.toFixed(places))

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Contour rebuild ${label} must be finite.`)
  return value
}

function normalizeColor(color: RgbColor): RgbColor {
  const channel = (value: number) => clamp(Math.round(finite(value, 'color channel') / 16) * 16, 0, 255)
  return { b: channel(color.b), g: channel(color.g), r: channel(color.r) }
}

function normalizeSpan(span: ImageToGlbSilhouetteSpan): NormalizedRun | null {
  const width = clamp(finite(span.width, 'span width'), 0, 1)
  const height = clamp(finite(span.height, 'span height'), 0, 1)
  if (width <= 0 || height <= 0) return null
  const centerX = clamp(finite(span.x, 'span x'), -0.5, 0.5)
  const centerY = clamp(finite(span.y, 'span y'), -0.5, 0.5)
  const left = clamp(centerX - width / 2, -0.5, 0.5)
  const right = clamp(centerX + width / 2, -0.5, 0.5)
  const bottom = clamp(centerY - height / 2, -0.5, 0.5)
  const top = clamp(centerY + height / 2, -0.5, 0.5)
  const area = (right - left) * (top - bottom)
  if (area <= 0) return null
  return {
    area,
    bottom,
    color: normalizeColor(span.color),
    height: top - bottom,
    left,
    right,
    top,
    y: centerY,
  }
}

function runsByBand(spans: readonly ImageToGlbSilhouetteSpan[]): NormalizedRun[][] {
  const bands = new Map<string, NormalizedRun[]>()
  for (const span of spans) {
    const run = normalizeSpan(span)
    if (!run) continue
    const key = run.y.toFixed(4)
    const band = bands.get(key)
    if (band) band.push(run)
    else bands.set(key, [run])
  }
  return [...bands.values()]
    .map(band => band.sort((first, second) => first.left - second.left))
    .sort((first, second) => (first[0]?.y || 0) - (second[0]?.y || 0))
}

function horizontalOverlap(first: NormalizedRun, second: NormalizedRun): number {
  return Math.min(first.right, second.right) - Math.max(first.left, second.left)
}

function canContinueTrack(previous: NormalizedRun, current: NormalizedRun): boolean {
  const verticalGap = current.bottom - previous.top
  const gapTolerance = Math.max(previous.height, current.height) * 0.7 + 0.006
  const sideTolerance = Math.min(previous.right - previous.left, current.right - current.left) * 0.08
  return verticalGap <= gapTolerance && horizontalOverlap(previous, current) >= -sideTolerance
}

function startTrack(run: NormalizedRun): RunTrack {
  return {
    area: run.area,
    colorBlueArea: run.color.b * run.area,
    colorGreenArea: run.color.g * run.area,
    colorRedArea: run.color.r * run.area,
    runs: [run],
  }
}

function appendRun(track: RunTrack, run: NormalizedRun): void {
  track.runs.push(run)
  track.area += run.area
  track.colorBlueArea += run.color.b * run.area
  track.colorGreenArea += run.color.g * run.area
  track.colorRedArea += run.color.r * run.area
}

function buildRunTracks(spans: readonly ImageToGlbSilhouetteSpan[]): RunTrack[] {
  const completed: RunTrack[] = []
  let active: Array<{ run: NormalizedRun; track: RunTrack }> = []
  for (const band of runsByBand(spans)) {
    const previousMatches = active.map(({ run }) => band.flatMap((current, index) => canContinueTrack(run, current) ? [index] : []))
    const currentMatches = band.map(current => active.flatMap(({ run }, index) => canContinueTrack(run, current) ? [index] : []))
    const next: Array<{ run: NormalizedRun; track: RunTrack }> = []
    const continued = new Set<RunTrack>()
    band.forEach((run, currentIndex) => {
      const previousIndexes = currentMatches[currentIndex] || []
      const previousIndex = previousIndexes[0]
      const isOneToOne = previousIndexes.length === 1
        && previousIndex !== undefined
        && previousMatches[previousIndex]?.length === 1
      const track = isOneToOne ? active[previousIndex]?.track : undefined
      if (track) {
        appendRun(track, run)
        continued.add(track)
        next.push({ run, track })
      } else {
        const created = startTrack(run)
        next.push({ run, track: created })
      }
    })
    for (const { track } of active) {
      if (!continued.has(track) && !completed.includes(track)) completed.push(track)
    }
    active = next
  }
  for (const { track } of active) if (!completed.includes(track)) completed.push(track)
  return completed
}

function deduplicatePoints(points: readonly Point2[]): Point2[] {
  const unique = points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || point[0] !== previous[0] || point[1] !== previous[1]
  })
  if (unique.length > 1) {
    const first = unique[0]
    const last = unique[unique.length - 1]
    if (first && last && first[0] === last[0] && first[1] === last[1]) unique.pop()
  }
  return unique
}

function boundedOutline(track: RunTrack, worldWidth: number, worldHeight: number): Point2[] {
  const runs = [...track.runs].sort((first, second) => first.y - second.y)
  const left: Point2[] = []
  const right: Point2[] = []
  runs.forEach((run, index) => {
    if (index === 0) {
      left.push([quantize(run.left * worldWidth), quantize(run.bottom * worldHeight)])
      right.push([quantize(run.right * worldWidth), quantize(run.bottom * worldHeight)])
    }
    left.push([quantize(run.left * worldWidth), quantize(run.y * worldHeight)])
    right.push([quantize(run.right * worldWidth), quantize(run.y * worldHeight)])
    if (index === runs.length - 1) {
      left.push([quantize(run.left * worldWidth), quantize(run.top * worldHeight)])
      right.push([quantize(run.right * worldWidth), quantize(run.top * worldHeight)])
    }
  })
  let outline = deduplicatePoints([...left, ...right.reverse()])
  if (outline.length > BUDGETS.maxOutlinePointsPerComponent) {
    const lastIndex = outline.length - 1
    outline = Array.from({ length: BUDGETS.maxOutlinePointsPerComponent }, (_, index) => (
      outline[Math.round(index * lastIndex / (BUDGETS.maxOutlinePointsPerComponent - 1))]!
    ))
    outline = deduplicatePoints(outline)
  }
  return outline
}

function weightedColor(track: RunTrack): RgbColor {
  return normalizeColor({
    b: track.colorBlueArea / track.area,
    g: track.colorGreenArea / track.area,
    r: track.colorRedArea / track.area,
  })
}

function semanticComponentName(track: RunTrack, index: number): string {
  const centerX = track.runs.reduce((sum, run) => sum + ((run.left + run.right) / 2) * run.area, 0) / track.area
  const region = centerX < -0.08 ? 'Left' : centerX > 0.08 ? 'Right' : 'Central'
  return `${region} connected contour volume ${String(index + 1).padStart(2, '0')}`
}

function colorDistance(first: RgbColor, second: RgbColor): number {
  return (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2
}

function selectMaterials(tracks: readonly RunTrack[]): RgbColor[] {
  const colors: RgbColor[] = []
  for (const track of tracks) {
    const color = weightedColor(track)
    if (!colors.some(candidate => colorDistance(candidate, color) === 0)) colors.push(color)
    if (colors.length === BUDGETS.maxMaterials) break
  }
  return colors.length > 0 ? colors : [{ b: 160, g: 160, r: 160 }]
}

function nearestMaterialIndex(materials: readonly RgbColor[], color: RgbColor): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  materials.forEach((candidate, index) => {
    const distance = colorDistance(candidate, color)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

function shapeFromOutline(outline: readonly Point2[]): THREE.Shape {
  const first = outline[0]
  if (!first || outline.length < 3) throw new Error('Contour rebuild component requires at least three outline points.')
  const shape = new THREE.Shape()
  shape.moveTo(first[0], first[1])
  for (const point of outline.slice(1)) shape.lineTo(point[0], point[1])
  shape.closePath()
  return shape
}

function geometryFromComponent(component: Pick<ImageToGlbContourComponentPlan, 'depth' | 'outline'>): THREE.ExtrudeGeometry {
  const bevel = Math.min(component.depth * 0.16, 0.045)
  const geometry = new THREE.ExtrudeGeometry(shapeFromOutline(component.outline), {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    depth: component.depth,
    steps: 1,
  })
  geometry.translate(0, 0, -component.depth / 2)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  return geometry
}

function triangleCount(component: ImageToGlbContourComponentPlan): number {
  const geometry = geometryFromComponent(component)
  const count = (geometry.getIndex()?.count || geometry.getAttribute('position').count) / 3
  geometry.dispose()
  return Math.ceil(count)
}

export function summarizeContourRebuildPlan(plan: ImageToGlbContourRebuildPlan): ImageToGlbContourQualitySummary {
  return plan.quality
}

export function deriveContourRebuildPlan(analysis: ImageToGlbReferenceAnalysis): ImageToGlbContourRebuildPlan {
  const aspectRatio = finite(analysis.aspectRatio, 'aspect ratio')
  if (aspectRatio <= 0) throw new Error('Contour rebuild aspect ratio must be positive.')
  const rawTracks = buildRunTracks(analysis.spans)
  if (rawTracks.length === 0) throw new Error('Contour rebuild requires at least one nondegenerate silhouette span.')
  const rawArea = rawTracks.reduce((sum, track) => sum + track.area, 0)
  const selectedTracks = [...rawTracks]
    .sort((first, second) => second.area - first.area || first.runs[0]!.left - second.runs[0]!.left)
    .slice(0, BUDGETS.maxComponents)
  const worldWidth = 2.8
  const worldHeight = quantize(clamp(worldWidth / aspectRatio, 1.5, 3.4))
  const foregroundCoverage = clamp(finite(analysis.foregroundCoverage, 'foreground coverage'), 0, 1)
  const symmetryScore = clamp(finite(analysis.symmetryScore, 'symmetry score'), 0, 1)
  const confidence = quantize(clamp(0.28 + symmetryScore * 0.4 + foregroundCoverage * 0.2, 0.28, 0.86), 3)
  const baseDepth = quantize(clamp(worldWidth * (0.055 + foregroundCoverage * 0.11 + symmetryScore * 0.045), 0.14, 0.58))
  const materials = selectMaterials(selectedTracks)
  let components = selectedTracks.map((track, index): ImageToGlbContourComponentPlan => {
    const color = weightedColor(track)
    const areaRatio = track.area / rawArea
    return {
      areaRatio: quantize(areaRatio, 5),
      color,
      depth: quantize(clamp(baseDepth * (0.82 + Math.sqrt(areaRatio) * 0.32), 0.12, 0.64)),
      inferredSurfaceConfidence: confidence,
      materialIndex: nearestMaterialIndex(materials, color),
      name: semanticComponentName(track, index),
      outline: boundedOutline(track, worldWidth, worldHeight),
      sourceSpanCount: track.runs.length,
    }
  })
  let estimatedTriangles = components.reduce((sum, component) => sum + triangleCount(component), 0)
  while (components.length > 1 && estimatedTriangles > BUDGETS.maxTriangles) {
    components = components.slice(0, -1)
    estimatedTriangles = components.reduce((sum, component) => sum + triangleCount(component), 0)
  }
  const acceptedSpanCount = components.reduce((sum, component) => sum + component.sourceSpanCount, 0)
  const retainedAreaRatio = components.reduce((sum, component) => sum + component.areaRatio, 0)
  const outlinePointCount = components.reduce((sum, component) => sum + component.outline.length, 0)
  const quality: ImageToGlbContourQualitySummary = {
    acceptedSpanCount,
    componentCount: components.length,
    estimatedTriangleCount: estimatedTriangles,
    inferredSurfaceConfidence: confidence,
    materialCount: materials.length,
    outlinePointCount,
    preservedRunTrackCount: rawTracks.length,
    proceduralSourceBytes: 0,
    rawSpanCount: analysis.spans.length,
    retainedAreaRatio: quantize(clamp(retainedAreaRatio, 0, 1), 5),
    withinBudgets: components.length <= BUDGETS.maxComponents
      && materials.length <= BUDGETS.maxMaterials
      && estimatedTriangles <= BUDGETS.maxTriangles
      && components.every(component => component.outline.length <= BUDGETS.maxOutlinePointsPerComponent),
  }
  const plan: ImageToGlbContourRebuildPlan = {
    budgets: { ...BUDGETS },
    components,
    depthEvidence: {
      baseDepth,
      foregroundCoverage: quantize(foregroundCoverage, 4),
      inferredSurfaceConfidence: confidence,
      method: 'front-silhouette-symmetry-inference',
      symmetryScore: quantize(symmetryScore, 4),
    },
    materials,
    quality,
    schema: 'agenticgraph-contour-rebuild/v1',
    worldHeight,
    worldWidth,
  }
  const proceduralSourceBytes = new TextEncoder().encode(createContourRebuildProgram(plan)).byteLength
  plan.quality.proceduralSourceBytes = proceduralSourceBytes
  plan.quality.withinBudgets = plan.quality.withinBudgets && proceduralSourceBytes <= BUDGETS.maxSourceBytes
  return plan
}

export function buildContourRebuildScene(args: {
  partManifest: ImageToGlbPartManifestEntry[]
  plan: ImageToGlbContourRebuildPlan
}): THREE.Group {
  const group = new THREE.Group()
  group.name = 'Reference contour rebuild'
  const materials = args.plan.materials.map(color => new THREE.MeshStandardMaterial({
    color: (color.r << 16) | (color.g << 8) | color.b,
    metalness: 0.06,
    roughness: 0.46,
  }))
  for (const component of args.plan.components) {
    const mesh = new THREE.Mesh(geometryFromComponent(component), materials[component.materialIndex]!)
    mesh.castShadow = true
    mesh.name = component.name
    mesh.receiveShadow = true
    mesh.userData.inferredSurfaceConfidence = component.inferredSurfaceConfidence
    group.add(mesh)
    args.partManifest.push({
      name: component.name,
      primitive: 'ExtrudeGeometry',
      role: `connected front-contour volume; rear depth inferred at confidence ${component.inferredSurfaceConfidence.toFixed(3)}`,
    })
  }
  group.userData.contourRebuildPlan = args.plan
  group.userData.contourRebuildQuality = args.plan.quality
  return group
}

export function createContourRebuildProgram(plan: ImageToGlbContourRebuildPlan): string {
  const programPlan = {
    components: plan.components.map(component => ({
      color: component.materialIndex,
      depth: component.depth,
      inferredSurfaceConfidence: component.inferredSurfaceConfidence,
      name: component.name,
      outline: component.outline,
    })),
    materials: plan.materials,
  }
  const source = `import * as THREE from 'three'

const plan = ${JSON.stringify(programPlan)} as const
const modelRootName = ${JSON.stringify(IMAGE_TO_GLB_MODEL_ROOT_NAME)}

export function buildImageToGlbReviewedScene() {
  const group = new THREE.Group()
  group.name = 'Image to GLB reviewed procedural scene'
  const materials = plan.materials.map(color => new THREE.MeshStandardMaterial({ color: (color.r << 16) | (color.g << 8) | color.b, metalness: 0.06, roughness: 0.46 }))
  for (const component of plan.components) {
    const shape = new THREE.Shape()
    component.outline.forEach((point, index) => index === 0 ? shape.moveTo(point[0], point[1]) : shape.lineTo(point[0], point[1]))
    shape.closePath()
    const bevel = Math.min(component.depth * 0.16, 0.045)
    const geometry = new THREE.ExtrudeGeometry(shape, { bevelEnabled: true, bevelSegments: 2, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1, depth: component.depth, steps: 1 })
    geometry.translate(0, 0, -component.depth / 2); geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, materials[component.color]); mesh.name = component.name; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.inferredSurfaceConfidence = component.inferredSurfaceConfidence; group.add(mesh)
  }
  group.updateMatrixWorld(true)
  const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
  const worldMatrices = new Map(meshes.map(mesh => [mesh, mesh.matrixWorld.clone()]))
  const modelRoot = new THREE.Group(); modelRoot.name = modelRootName; modelRoot.userData.imageToGlbActionNode = { kind: 'model-root' }; group.add(modelRoot); group.updateMatrixWorld(true)
  const parts: Array<{ classification: 'rigid'; meshName: string; partId: string; pivotName: string; socketName: string; surfaceProvenance: { front: 'observed'; hidden: 'inferred' } }> = []
  for (const mesh of meshes) {
    const token = mesh.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    const partId = 'part-' + token; const pivotName = 'ImageToGlbPivot-' + token; const socketName = 'ImageToGlbSocket-' + token
    const bounds = new THREE.Box3().setFromObject(mesh); const center = bounds.getCenter(new THREE.Vector3())
    const pivot = new THREE.Group(); pivot.name = pivotName; pivot.position.copy(modelRoot.worldToLocal(center.clone())); pivot.userData.imageToGlbActionNode = { kind: 'rigid-pivot', partId }; modelRoot.add(pivot); group.updateMatrixWorld(true)
    const world = worldMatrices.get(mesh)!; pivot.add(mesh); new THREE.Matrix4().copy(pivot.matrixWorld).invert().multiply(world).decompose(mesh.position, mesh.quaternion, mesh.scale); mesh.updateMatrix()
    mesh.userData.imageToGlbPartReadiness = { classification: 'rigid', partId, surfaceProvenance: { front: 'observed', hidden: 'inferred' } }
    const socket = new THREE.Object3D(); socket.name = socketName; socket.position.copy(pivot.worldToLocal(new THREE.Vector3(center.x, bounds.max.y, center.z))); socket.userData.imageToGlbActionNode = { kind: 'attachment-socket', partId }; pivot.add(socket)
    parts.push({ classification: 'rigid', meshName: mesh.name, partId, pivotName, socketName, surfaceProvenance: { front: 'observed', hidden: 'inferred' } })
  }
  const yaw = ${IMAGE_TO_GLB_INSPECTION_MAXIMUM_YAW_RADIANS}
  const quaternions = [0, yaw, 0, -yaw, 0].flatMap(angle => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle).toArray())
  const track = new THREE.QuaternionKeyframeTrack(modelRootName + '.quaternion', [0, 1, 2, 3, ${IMAGE_TO_GLB_INSPECTION_DURATION_SECONDS}], quaternions)
  const clip = new THREE.AnimationClip(${JSON.stringify(IMAGE_TO_GLB_INSPECTION_CLIP_NAME)}, ${IMAGE_TO_GLB_INSPECTION_DURATION_SECONDS}, [track])
  group.animations = [clip]
  group.userData.imageToGlbActionReadiness = { animation: { clipName: clip.name, durationSeconds: clip.duration, loop: 'repeat-continuous', maximumYawRadians: yaw, trackName: track.name }, modelRootName, parts, schemaVersion: 'image-to-glb-action-readiness/v1' }
  return group
}`
  if (new TextEncoder().encode(source).byteLength > plan.budgets.maxSourceBytes) {
    throw new Error('Contour rebuild procedural source exceeds its review budget.')
  }
  return source
}
