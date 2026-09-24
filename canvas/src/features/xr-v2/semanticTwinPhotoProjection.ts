import * as THREE from 'three'
import { PHOTO_DISTANCE, photoDimensions, type ImmersivePhoto } from '@/features/immersive-media/immersivePhotoProjection'
import type { BuiltTwinObject } from './semanticTwinScene'
import type { SpaceDocument } from './semanticSpaceRuntime'

/** Exact evidence match; the newest authored version of an identical region wins only in the overlay. */
export function photoOverlayBindings(document: SpaceDocument, photo: ImmersivePhoto) {
  const regions = new Map<string, NonNullable<SpaceDocument['twin']>['objects'][number]>()
  for (const binding of document.twin?.objects || []) {
    const entity = document.entities.find(item => item.id === binding.entityId)
    const observation = document.observations.find(item => item.id === binding.observationId)
    if (!entity || !photo.evidenceSha256 || binding.evidenceSha256 !== photo.evidenceSha256
      || observation?.sha256 !== photo.evidenceSha256) continue
    const r = entity.region
    regions.set([r.x, r.y, r.width, r.height].join(':'), binding)
  }
  return [...regions.values()]
}

/** Reproject the existing triangles into image rays. Authored recipes and exports stay unchanged. */
export function projectTwinOnPhoto(item: BuiltTwinObject, document: SpaceDocument, photo: ImmersivePhoto) {
  const entity = document.entities.find(value => value.id === item.binding.entityId)
  if (!entity || item.binding.evidenceSha256 !== photo.evidenceSha256) throw Error('Overlay evidence does not match the image.')
  const size = photoDimensions(photo), region = entity.region
  item.wrapper.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(item.wrapper), extent = bounds.getSize(new THREE.Vector3())
  const meshes: THREE.Mesh[] = []
  item.source.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh) })
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position'), point = new THREE.Vector3()
    const frame = item.source.userData.contourRebuildPlan
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i)
      const contourX = frame ? point.x / frame.worldWidth + 0.5 + 0.5 / item.binding.silhouette!.width : 0
      const contourY = frame ? 0.5 - point.y / frame.worldHeight + 0.5 / item.binding.silhouette!.height : 0
      point.applyMatrix4(mesh.matrixWorld)
      const localX = Math.max(0, Math.min(1, frame ? contourX : (point.x - bounds.min.x) / extent.x))
      const localY = Math.max(0, Math.min(1, frame ? contourY : 1 - (point.y - bounds.min.y) / extent.y))
      const u = region.x + localX * region.width, v = region.y + localY * region.height
      const atlas = (mesh.material as THREE.MeshBasicMaterial).map?.image
      const uv = mesh.geometry.getAttribute('uv')
      if (atlas?.height && uv) uv.setXY(i, Math.max(0, Math.min(1, localX)),
        (8 + (1 - Math.max(0, Math.min(1, localY))) * (atlas.height - 8)) / atlas.height)
      const depth = (item.binding.template === 'relief' ? 0.02 : 0.25) + Math.max(0, Math.min(1, (point.z - bounds.min.z) / extent.z)) * (item.binding.template === 'relief' ? 0.12 : 0.5)
      const distance = PHOTO_DISTANCE - depth
      // Scaling along the viewing ray prevents nearer faces expanding beyond their evidence region.
      positions.setXYZ(i, (u - 0.5) * size.width * distance / PHOTO_DISTANCE,
        (0.5 - v) * size.height * distance / PHOTO_DISTANCE, -distance)
    }
    positions.needsUpdate = true
    if (mesh.geometry.getAttribute('uv')) mesh.geometry.getAttribute('uv').needsUpdate = true
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere()
  }
  item.wrapper.traverse(object => {
    object.position.set(0, 0, 0); object.rotation.set(0, 0, 0); object.scale.set(1, 1, 1); object.updateMatrix()
  })
  item.wrapper.updateMatrixWorld(true)
  item.wrapper.userData.photoOverlay = { evidenceSha256: photo.evidenceSha256, region, depth: 'authored-relief' }
}
