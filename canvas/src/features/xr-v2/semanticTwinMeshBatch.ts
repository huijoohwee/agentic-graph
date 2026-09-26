import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'

/** Static native recipe parts share one vertex-colour mesh per selectable object.
 * Recipe controls remain authoritative: edits rebuild the parts before this render-only batch.
 */
export function batchTwinRecipe(source: THREE.Group): THREE.Group {
  if (source.animations.length) throw Error('Twin batching only accepts static recipes.')
  source.updateMatrixWorld(true)
  const parts: THREE.BufferGeometry[] = []
  try {
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return
      const material = object.material as THREE.MeshStandardMaterial
      if (Array.isArray(material) || !material.color || material.map) throw Error('Twin batching needs native solid-colour parts.')
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
      parts.push(geometry); geometry.applyMatrix4(object.matrixWorld)
      const colors = new Float32Array(geometry.getAttribute('position').count * 3)
      for (let i = 0; i < colors.length; i += 3) material.color.toArray(colors, i)
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    })
    if (!parts.length) { disposeProceduralAsset(source); return new THREE.Group() }
    const geometry = mergeGeometries(parts, false)
    if (!geometry) throw Error('Native recipe parts could not be batched.')
    const result = new THREE.Group()
    result.name = source.name; result.visible = source.visible; result.userData = { ...source.userData }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }))
    mesh.name = 'SolidRecipe'; result.add(mesh)
    disposeProceduralAsset(source)
    return result
  } catch (error) { disposeProceduralAsset(source); throw error }
  finally { parts.forEach(part => part.dispose()) }
}
