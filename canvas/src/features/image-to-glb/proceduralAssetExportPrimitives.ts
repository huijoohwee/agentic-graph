import * as THREE from 'three'
import type { GLTFExporterOptions } from 'three/examples/jsm/exporters/GLTFExporter.js'
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function requireBrowserExporterRuntime(): void {
  if (typeof Blob !== 'function' || typeof FileReader !== 'function') {
    throw new Error('Procedural asset export requires the browser Blob and FileReader runtime used by Three.js GLTFExporter.')
  }
}

export function buildProceduralExporterOptions(scene: THREE.Object3D, binary: boolean): GLTFExporterOptions {
  return {
    animations: Array.isArray(scene.animations) ? scene.animations : [],
    binary,
    includeCustomExtensions: false,
    maxTextureSize: Infinity,
    onlyVisible: true,
    trs: false,
  }
}

export async function exportWithGltfExporter(scene: THREE.Object3D, binary: boolean): Promise<ArrayBuffer | Record<string, unknown>> {
  requireBrowserExporterRuntime()
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()
  const output = await exporter.parseAsync(scene, buildProceduralExporterOptions(scene, binary))
  if (output instanceof ArrayBuffer) return output
  if (asRecord(output)) return output
  throw new Error('Three.js GLTFExporter returned an unsupported artifact.')
}

function clonePlainValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function cloneProceduralExportScene(scene: THREE.Object3D): THREE.Object3D {
  const snapshot = scene.clone(true)
  const originals: THREE.Object3D[] = []
  const clones: THREE.Object3D[] = []
  scene.traverse(object => originals.push(object))
  snapshot.traverse(object => clones.push(object))
  if (originals.length !== clones.length) throw new Error('Procedural asset could not create an exact owned export snapshot.')
  const geometryClones = new Map<THREE.BufferGeometry, THREE.BufferGeometry>()
  const materialClones = new Map<THREE.Material, THREE.Material>()
  const cloneGeometry = (geometry: THREE.BufferGeometry) => {
    const existing = geometryClones.get(geometry)
    if (existing) return existing
    const clone = geometry.clone()
    geometryClones.set(geometry, clone)
    return clone
  }
  const cloneMaterial = (material: THREE.Material) => {
    const existing = materialClones.get(material)
    if (existing) return existing
    const clone = material.clone()
    materialClones.set(material, clone)
    return clone
  }
  originals.forEach((original, index) => {
    const clone = clones[index]
    if (!clone) throw new Error('Procedural asset export snapshot traversal drifted from the reviewed scene.')
    clone.userData = clonePlainValue(original.userData)
    const originalMesh = original as THREE.Mesh
    const cloneMesh = clone as THREE.Mesh
    if (!originalMesh.isMesh || !cloneMesh.isMesh) return
    cloneMesh.geometry = cloneGeometry(originalMesh.geometry)
    cloneMesh.material = Array.isArray(originalMesh.material)
      ? originalMesh.material.map(cloneMaterial)
      : cloneMaterial(originalMesh.material)
  })
  snapshot.animations = scene.animations.map(clip => clip.clone())
  snapshot.updateMatrixWorld(true)
  return snapshot
}

export function disposeProceduralExportScene(scene: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  scene.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    const candidates = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    candidates.forEach(material => materials.add(material))
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
}

