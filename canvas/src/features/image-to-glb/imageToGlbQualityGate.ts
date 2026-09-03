import * as THREE from 'three'
import { hashStringToHex } from '@/lib/hash/stringHash'
import type { ImageToGlbPartManifestEntry, ImageToGlbProceduralJob } from './imageToGlbContract'
import type { ImageToGlbReferenceAnalysis } from './imageToGlbSceneFactory'
import {
  IMAGE_TO_GLB_MATERIAL_TEXTURE_SLOTS,
  inspectImageToGlbScene,
} from './imageToGlbSceneEvidence'

export const IMAGE_TO_GLB_QUALITY_POLICY = Object.freeze({
  maximumMaterials: 24,
  maximumMeshes: 96,
  maximumProgramCharacters: 32_000,
  maximumTriangles: 120_000,
  minimumDepthRatio: 0.035,
  minimumFrontProjectionScore: 0.72,
  minimumReferenceColorScore: 0.82,
})

export type ImageToGlbActionGateEvidence = {
  clipCount: number
  fingerprint: string
  pivotCount: number
  socketCount: number
  valid: boolean
  violations: readonly string[]
}

export type ImageToGlbReconstructionGateEvidence = {
  acceptedSpanCount: number
  inferredSurfaceConfidence: number
  rawSpanCount: number
  retainedAreaRatio: number
  withinBudgets: boolean
}

export type ImageToGlbQualityViolationCode =
  | 'animation-readiness'
  | 'flat-geometry'
  | 'geometry-budget'
  | 'invalid-geometry'
  | 'invalid-pbr-material'
  | 'material-budget'
  | 'material-reference-mismatch'
  | 'part-manifest-mismatch'
  | 'program-budget'
  | 'reference-fidelity'

export type ImageToGlbQualityViolation = {
  code: ImageToGlbQualityViolationCode
  message: string
}

export type ImageToGlbQualityReport = {
  schema: 'agentic-graph-image-to-glb-quality/v1'
  passed: boolean
  fingerprint: string
  programDigest: string
  referenceDigest: string
  sceneDigest: string
  metrics: {
    action: Omit<ImageToGlbActionGateEvidence, 'violations'>
    compactness: {
      componentCount: number
      programCharacters: number
      referenceSamples: number
      spanCompressionRatio: number
    }
    geometry: {
      depthRatio: number
      hiddenMeshCount: number
      invalidAttributeValues: number
      meshCount: number
      nondegenerateMeshCount: number
      triangleCount: number
      vertexCount: number
    }
    material: {
      invalidPbrMaterialCount: number
      materialCount: number
      referenceColorScore: number
    }
    reference: {
      analysisConfidence: number
      frontProjectionScore: number
      hiddenSurfaceEvidence: 'procedurally-inferred'
      inferredSurfaceConfidence: number
      observedSurfaceEvidence: 'reference-front'
      retainedAreaRatio: number
      spanRetentionRatio: number
    }
  }
  violations: readonly ImageToGlbQualityViolation[]
}

type GeometryMetrics = ImageToGlbQualityReport['metrics']['geometry']

const rounded = (value: number) => Number(value.toFixed(6))
const FRONT_PROJECTION_GRID_SIZE = 64

function objectIsEffectivelyVisible(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    if (current === root) return true
    current = current.parent
  }
  return false
}

function referenceFrontMask(analysis: ImageToGlbReferenceAnalysis): Uint8Array {
  const mask = new Uint8Array(FRONT_PROJECTION_GRID_SIZE ** 2)
  for (let row = 0; row < FRONT_PROJECTION_GRID_SIZE; row += 1) {
    const y = 0.5 - (row + 0.5) / FRONT_PROJECTION_GRID_SIZE
    for (let column = 0; column < FRONT_PROJECTION_GRID_SIZE; column += 1) {
      const x = (column + 0.5) / FRONT_PROJECTION_GRID_SIZE - 0.5
      const occupied = analysis.spans.some(span => (
        Math.abs(x - span.x) <= span.width / 2
        && Math.abs(y - span.y) <= span.height / 2
      ))
      if (occupied) mask[row * FRONT_PROJECTION_GRID_SIZE + column] = 1
    }
  }
  return mask
}

function projectedVertex(args: {
  bounds: THREE.Box3
  index: number
  matrixWorld: THREE.Matrix4
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
}): readonly [number, number] {
  const point = new THREE.Vector3(
    args.position.getX(args.index),
    args.position.getY(args.index),
    args.position.getZ(args.index),
  ).applyMatrix4(args.matrixWorld)
  const width = Math.max(args.bounds.max.x - args.bounds.min.x, 0.000001)
  const height = Math.max(args.bounds.max.y - args.bounds.min.y, 0.000001)
  return [
    ((point.x - args.bounds.min.x) / width) * FRONT_PROJECTION_GRID_SIZE,
    ((args.bounds.max.y - point.y) / height) * FRONT_PROJECTION_GRID_SIZE,
  ]
}

function edgeFunction(first: readonly [number, number], second: readonly [number, number], x: number, y: number): number {
  return (x - first[0]) * (second[1] - first[1]) - (y - first[1]) * (second[0] - first[0])
}

function rasterizeProjectedTriangle(mask: Uint8Array, points: readonly (readonly [number, number])[]): void {
  const [first, second, third] = points
  if (!first || !second || !third || points.some(point => !point.every(Number.isFinite))) return
  const area = edgeFunction(first, second, third[0], third[1])
  if (Math.abs(area) <= 1e-9) return
  const minimumColumn = Math.max(0, Math.floor(Math.min(first[0], second[0], third[0])))
  const maximumColumn = Math.min(FRONT_PROJECTION_GRID_SIZE - 1, Math.ceil(Math.max(first[0], second[0], third[0])))
  const minimumRow = Math.max(0, Math.floor(Math.min(first[1], second[1], third[1])))
  const maximumRow = Math.min(FRONT_PROJECTION_GRID_SIZE - 1, Math.ceil(Math.max(first[1], second[1], third[1])))
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const x = column + 0.5
      const y = row + 0.5
      const edges = [
        edgeFunction(first, second, x, y),
        edgeFunction(second, third, x, y),
        edgeFunction(third, first, x, y),
      ]
      if (edges.every(value => value >= -1e-7) || edges.every(value => value <= 1e-7)) {
        mask[row * FRONT_PROJECTION_GRID_SIZE + column] = 1
      }
    }
  }
}

function sceneFrontMask(scene: THREE.Object3D): Uint8Array {
  scene.updateMatrixWorld(true)
  const mask = new Uint8Array(FRONT_PROJECTION_GRID_SIZE ** 2)
  const bounds = new THREE.Box3()
  const meshes: THREE.Mesh[] = []
  scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !objectIsEffectivelyVisible(mesh, scene)) return
    meshes.push(mesh)
    bounds.union(new THREE.Box3().setFromObject(mesh))
  })
  if (meshes.length === 0 || bounds.isEmpty()) return mask
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue
    const index = mesh.geometry.getIndex()
    const vertexCount = index?.count || position.count
    for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
      const indexes = index
        ? [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
        : [offset, offset + 1, offset + 2]
      rasterizeProjectedTriangle(mask, indexes.map(vertexIndex => projectedVertex({
        bounds,
        index: vertexIndex,
        matrixWorld: mesh.matrixWorld,
        position,
      })))
    }
  }
  return mask
}

function maskIntersectionOverUnion(first: Uint8Array, second: Uint8Array): number {
  let intersection = 0
  let union = 0
  for (let index = 0; index < first.length; index += 1) {
    const firstOccupied = first[index] === 1
    const secondOccupied = second[index] === 1
    if (firstOccupied && secondOccupied) intersection += 1
    if (firstOccupied || secondOccupied) union += 1
  }
  return union > 0 ? intersection / union : 0
}

export function measureImageToGlbFrontProjectionScore(args: {
  analysis: ImageToGlbReferenceAnalysis
  scene: THREE.Object3D
}): number {
  return rounded(maskIntersectionOverUnion(referenceFrontMask(args.analysis), sceneFrontMask(args.scene)))
}

function countInvalidValues(value: ArrayLike<number>): number {
  let invalid = 0
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(Number(value[index]))) invalid += 1
  }
  return invalid
}

function readAttributeArray(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): ArrayLike<number> {
  return attribute.array
}

function inspectGeometry(scene: THREE.Object3D): GeometryMetrics {
  const sceneBounds = new THREE.Box3().setFromObject(scene)
  const sceneSize = sceneBounds.getSize(new THREE.Vector3())
  let hiddenMeshCount = 0
  let invalidAttributeValues = 0
  let meshCount = 0
  let nondegenerateMeshCount = 0
  let triangleCount = 0
  let vertexCount = 0
  scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    meshCount += 1
    if (!objectIsEffectivelyVisible(mesh, scene)) hiddenMeshCount += 1
    const position = mesh.geometry.getAttribute('position')
    if (position) {
      vertexCount += position.count
      triangleCount += Math.floor((mesh.geometry.getIndex()?.count || position.count) / 3)
    }
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      invalidAttributeValues += countInvalidValues(readAttributeArray(attribute))
    }
    const index = mesh.geometry.getIndex()
    if (index) invalidAttributeValues += countInvalidValues(index.array)
    const bounds = new THREE.Box3().setFromObject(mesh)
    const size = bounds.getSize(new THREE.Vector3())
    if ([size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0.000001)) {
      nondegenerateMeshCount += 1
    }
  })
  const dominantDimension = Math.max(sceneSize.x, sceneSize.y, 0.000001)
  return {
    depthRatio: rounded(sceneSize.z / dominantDimension),
    hiddenMeshCount,
    invalidAttributeValues,
    meshCount,
    nondegenerateMeshCount,
    triangleCount,
    vertexCount,
  }
}

function pbrMaterialIsInvalid(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshStandardMaterial) || material.type !== 'MeshStandardMaterial') return true
  const record = material as unknown as Record<string, unknown>
  const colorValues = [...material.color.toArray(), ...material.emissive.toArray()]
  return colorValues.some(value => !Number.isFinite(value) || value < 0)
    || !Number.isFinite(material.roughness)
    || material.roughness < 0
    || material.roughness > 1
    || !Number.isFinite(material.metalness)
    || material.metalness < 0
    || material.metalness > 1
    || !Number.isFinite(material.opacity)
    || material.opacity < 0
    || material.opacity > 1
    || !Number.isFinite(material.alphaTest)
    || material.alphaTest < 0
    || material.alphaTest > 1
    || !Number.isFinite(material.emissiveIntensity)
    || material.emissiveIntensity < 0
    || !material.visible
    || IMAGE_TO_GLB_MATERIAL_TEXTURE_SLOTS.some(slot => Boolean(record[slot]))
}

function materialRgb(material: THREE.MeshStandardMaterial): readonly [number, number, number] {
  const hex = material.color.getHex()
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function referenceColorScore(
  materials: readonly THREE.MeshStandardMaterial[],
  analysis: ImageToGlbReferenceAnalysis,
): number {
  if (materials.length === 0 || analysis.spans.length === 0) return 0
  const materialColors = materials.map(materialRgb)
  let weightedScore = 0
  let totalWeight = 0
  const maximumDistance = Math.sqrt(3 * 255 ** 2)
  for (const span of analysis.spans) {
    const weight = Math.max(0, span.width * span.height)
    const distance = Math.min(...materialColors.map(color => Math.sqrt(
      (span.color.r - color[0]) ** 2
      + (span.color.g - color[1]) ** 2
      + (span.color.b - color[2]) ** 2,
    )))
    weightedScore += Math.max(0, 1 - distance / maximumDistance) * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? rounded(weightedScore / totalWeight) : 0
}

function inspectMaterials(
  scene: THREE.Object3D,
  analysis: ImageToGlbReferenceAnalysis,
): ImageToGlbQualityReport['metrics']['material'] {
  const materials = new Map<string, THREE.Material>()
  scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const candidates = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of candidates) if (material) materials.set(material.uuid, material)
  })
  return {
    invalidPbrMaterialCount: [...materials.values()].filter(pbrMaterialIsInvalid).length,
    materialCount: materials.size,
    referenceColorScore: referenceColorScore(
      [...materials.values()].filter((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial),
      analysis,
    ),
  }
}

function manifestMatchesScene(scene: THREE.Object3D, manifest: readonly ImageToGlbPartManifestEntry[]): boolean {
  const evidence = inspectImageToGlbScene(scene)
  const expected = [...manifest].map(part => `${part.name}:${part.primitive}`).sort()
  const actual = evidence.parts.map(part => `${part.name}:${part.primitive}`).sort()
  return JSON.stringify(expected) === JSON.stringify(actual)
}

function reportFingerprint(report: Omit<ImageToGlbQualityReport, 'fingerprint'>): string {
  return hashStringToHex(JSON.stringify(report))
}

export function evaluateImageToGlbQuality(args: {
  action: ImageToGlbActionGateEvidence
  analysis: ImageToGlbReferenceAnalysis
  componentCount: number
  job: Pick<ImageToGlbProceduralJob, 'partManifest' | 'programDigest' | 'referenceDigest'>
  programSource: string
  reconstruction: ImageToGlbReconstructionGateEvidence
  scene: THREE.Object3D
}): ImageToGlbQualityReport {
  const geometry = inspectGeometry(args.scene)
  const material = inspectMaterials(args.scene, args.analysis)
  const frontProjectionScore = measureImageToGlbFrontProjectionScore({ analysis: args.analysis, scene: args.scene })
  const sceneDigest = inspectImageToGlbScene(args.scene).projectionDigest
  const violations: ImageToGlbQualityViolation[] = []
  if (!args.action.valid || args.action.pivotCount !== geometry.meshCount || args.action.socketCount !== geometry.meshCount || args.action.clipCount !== 1) {
    violations.push({ code: 'animation-readiness', message: `Action hierarchy failed: ${args.action.violations.join('; ') || 'missing pivots, sockets, or clips'}.` })
  }
  if (geometry.hiddenMeshCount > 0 || geometry.invalidAttributeValues > 0 || geometry.meshCount === 0 || geometry.nondegenerateMeshCount !== geometry.meshCount) {
    violations.push({ code: 'invalid-geometry', message: 'Every procedural mesh must remain visible with finite attributes and nondegenerate three-dimensional bounds.' })
  }
  if (geometry.depthRatio < IMAGE_TO_GLB_QUALITY_POLICY.minimumDepthRatio) {
    violations.push({ code: 'flat-geometry', message: 'The result is too shallow to qualify as a reconstructed 3D object.' })
  }
  if (geometry.meshCount > IMAGE_TO_GLB_QUALITY_POLICY.maximumMeshes || geometry.triangleCount > IMAGE_TO_GLB_QUALITY_POLICY.maximumTriangles) {
    violations.push({ code: 'geometry-budget', message: 'Procedural geometry exceeds the bounded browser mesh or triangle budget.' })
  }
  if (material.invalidPbrMaterialCount > 0) {
    violations.push({ code: 'invalid-pbr-material', message: 'Generated meshes require bounded native Three.js PBR materials.' })
  }
  if (material.materialCount > IMAGE_TO_GLB_QUALITY_POLICY.maximumMaterials) {
    violations.push({ code: 'material-budget', message: 'Generated materials exceed the bounded browser material budget.' })
  }
  if (material.referenceColorScore < IMAGE_TO_GLB_QUALITY_POLICY.minimumReferenceColorScore) {
    violations.push({ code: 'material-reference-mismatch', message: 'Procedural PBR colors do not retain enough measured reference-front color evidence.' })
  }
  if (!manifestMatchesScene(args.scene, args.job.partManifest)) {
    violations.push({ code: 'part-manifest-mismatch', message: 'The semantic part manifest must match the exact generated mesh graph.' })
  }
  if (args.programSource.length > IMAGE_TO_GLB_QUALITY_POLICY.maximumProgramCharacters) {
    violations.push({ code: 'program-budget', message: 'Reviewable procedural source exceeds the compact source budget.' })
  }
  const spanRetentionRatio = args.reconstruction.acceptedSpanCount / Math.max(1, args.reconstruction.rawSpanCount)
  if (
    !args.reconstruction.withinBudgets
    || frontProjectionScore < IMAGE_TO_GLB_QUALITY_POLICY.minimumFrontProjectionScore
    || args.reconstruction.retainedAreaRatio < 0.9
    || spanRetentionRatio < 0.75
  ) {
    violations.push({ code: 'reference-fidelity', message: 'Reference-front admission requires adequate projection score, retained contour area, span coverage, and reconstruction budgets.' })
  }
  const reportWithoutFingerprint: Omit<ImageToGlbQualityReport, 'fingerprint'> = {
    schema: 'agentic-graph-image-to-glb-quality/v1',
    passed: violations.length === 0,
    programDigest: args.job.programDigest,
    referenceDigest: args.job.referenceDigest,
    sceneDigest,
    metrics: {
      action: {
        clipCount: args.action.clipCount,
        fingerprint: args.action.fingerprint,
        pivotCount: args.action.pivotCount,
        socketCount: args.action.socketCount,
        valid: args.action.valid,
      },
      compactness: {
        componentCount: args.componentCount,
        programCharacters: args.programSource.length,
        referenceSamples: args.analysis.spans.length,
        spanCompressionRatio: rounded(args.componentCount / Math.max(1, args.analysis.spans.length)),
      },
      geometry,
      material,
      reference: {
        analysisConfidence: rounded(args.analysis.analysisConfidence),
        frontProjectionScore,
        hiddenSurfaceEvidence: 'procedurally-inferred',
        inferredSurfaceConfidence: rounded(args.reconstruction.inferredSurfaceConfidence),
        observedSurfaceEvidence: 'reference-front',
        retainedAreaRatio: rounded(args.reconstruction.retainedAreaRatio),
        spanRetentionRatio: rounded(spanRetentionRatio),
      },
    },
    violations,
  }
  return Object.freeze({ ...reportWithoutFingerprint, fingerprint: reportFingerprint(reportWithoutFingerprint) })
}

export function attachImageToGlbQualityReport(scene: THREE.Object3D, report: ImageToGlbQualityReport): void {
  const provenance = scene.userData.imageToGlb && typeof scene.userData.imageToGlb === 'object'
    ? scene.userData.imageToGlb as Record<string, unknown>
    : {}
  scene.userData.imageToGlb = { ...provenance, qualityReport: report }
}

export function assertImageToGlbQualityForExport(scene: THREE.Object3D, job: ImageToGlbProceduralJob): void {
  const report = (scene.userData.imageToGlb as { qualityReport?: ImageToGlbQualityReport } | undefined)?.qualityReport
  const sceneDigest = inspectImageToGlbScene(scene).projectionDigest
  const { fingerprint: recordedFingerprint, ...reportWithoutFingerprint } = report || {} as ImageToGlbQualityReport
  if (
    !report?.passed
    || report.programDigest !== job.programDigest
    || report.referenceDigest !== job.referenceDigest
    || report.sceneDigest !== sceneDigest
    || recordedFingerprint !== reportFingerprint(reportWithoutFingerprint)
  ) {
    throw new Error('Image to GLB refused export because its quality-gate evidence is missing, failed, or stale.')
  }
}
