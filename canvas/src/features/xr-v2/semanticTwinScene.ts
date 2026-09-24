import * as THREE from 'three'
import { analyzeImageToGlbReference } from '@/features/image-to-glb/imageToGlbReferenceAnalysis'
import { deriveContourRebuildPlan, buildContourRebuildScene } from '@/features/image-to-glb/imageToGlbContourRebuild'
import { silhouettePixels } from './semanticTwinSilhouette'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import type { TwinBinding } from './semanticTwinRuntime'
import type { SpaceDocument } from './semanticSpaceRuntime'
import { applyTwinImageAppearance } from './semanticTwinImageAppearance'

export type BuiltTwinObject = { binding: TwinBinding; wrapper: THREE.Group; source: THREE.Group }
export type BuiltTwinScene = { objects: readonly BuiltTwinObject[]; error: string | null; textures: Set<THREE.Texture> }
export function disposeTwinScene(scene: BuiltTwinScene) {
  for (const item of scene.objects) disposeProceduralAsset(item.source)
  scene.textures.forEach(texture => texture.dispose()); scene.textures.clear()
}
/** One geometry/placement owner for the existing Canvas and selected model export. */
export function buildTwinScene(bindings: readonly TwinBinding[]): BuiltTwinScene {
  const objects: BuiltTwinObject[] = [], textures = new Set<THREE.Texture>()
  let triangles = 0
  try {
    for (const binding of bindings) {
      const built = binding.template === 'contour' ? buildContourObject(binding) : buildProceduralAsset(binding.recipe)
      const source = built.scene
      objects.push({ binding, wrapper: new THREE.Group(), source })
      const bounds = new THREE.Box3().setFromObject(source), extent = bounds.getSize(new THREE.Vector3())
      triangles += built.evidence.triangles
      if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray(), ...extent.toArray()].every(Number.isFinite)
        || Math.min(...extent.toArray()) <= 0 || triangles > 30_000) throw Error('Twin geometry exceeds its finite bounds or mobile triangle budget')
      source.scale.set(binding.size[0] / extent.x, binding.size[1] / extent.y, binding.size[2] / extent.z)
      source.position.set(-bounds.getCenter(new THREE.Vector3()).x * source.scale.x,
        -bounds.min.y * source.scale.y, -bounds.getCenter(new THREE.Vector3()).z * source.scale.z)
      const wrapper = objects.at(-1)!.wrapper
      wrapper.name = `SemanticTwin-${binding.entityId}`; wrapper.position.set(...binding.position); wrapper.add(source)
    }
    return { objects, textures, error: null }
  } catch (error) {
    disposeTwinScene({ objects, textures, error: null })
    return { objects: [], textures, error: String((error as Error).message || error) }
  }
}

export async function exportTwinModel(document: SpaceDocument, entityId: string, isCurrent: () => boolean) {
  const binding = document.twin?.objects.find(item => item.entityId === entityId)
  if (!binding) throw Error('Select a built entity before exporting.')
  const built = buildTwinScene([binding])
  if (built.error) throw Error(built.error)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000)
  try {
    await applyTwinImageAppearance(built.objects, document, controller.signal, built.textures)
    if (!isCurrent()) throw Error('Space changed during model export.')
    const [{ exportWithGltfExporter }, { inspectGlbBytes }] = await Promise.all([
      import('@/features/image-to-glb/proceduralAssetExportPrimitives'), import('@/lib/assets/gltfFormat'),
    ])
    const bytes = await exportWithGltfExporter(built.objects[0].source, true)
    if (!isCurrent() || controller.signal.aborted) throw Error('Model export cancelled or space changed.')
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > 8_000_000) throw Error('Model export exceeds its size budget.')
    const result = inspectGlbBytes(bytes)
    if (!result.validContainer || !result.validGltfAsset || !result.validBinReference) throw Error('Model export is invalid.')
    return new Blob([bytes], { type: 'model/gltf-binary' })
  } finally { clearTimeout(timer); controller.abort(); disposeTwinScene(built) }
}

/** Uses the existing image-to-GLB contour generator; no second mesh-generation algorithm. */
function buildContourObject(binding: TwinBinding) {
  const pixels = silhouettePixels(binding.silhouette!, String(binding.recipe.values.color))
  let plan
  try {
    plan = deriveContourRebuildPlan(analyzeImageToGlbReference(pixels, { detail: 'fine' }), { detail: 'fine' })
  } catch { /* A detailed source may exceed the existing source/triangle budget; retain the bounded path. */ }
  if (!plan?.quality.withinBudgets || plan.quality.retainedAreaRatio < 0.9) {
    plan = deriveContourRebuildPlan(analyzeImageToGlbReference(pixels))
  }
  if (!plan.quality.withinBudgets || plan.quality.retainedAreaRatio < 0.9) throw Error('Visible shape is too complex. Choose a simpler crop or a procedural shape.')
  // A region owns one material; all visible component volumes share its authored colour.
  plan.materials = plan.materials.slice(0, 1)
  plan.components = plan.components.map(component => ({ ...component, materialIndex: 0 }))
  const scene = buildContourRebuildScene({ plan, partManifest: [] })
  scene.visible = binding.recipe.values.visible !== false
  scene.userData.geometryEvidence = { method: 'visible-contour-extrusion', depth: 'authored', hiddenSurfaces: 'approximate' }
  return { scene, evidence: { triangles: plan.quality.estimatedTriangleCount } }
}
