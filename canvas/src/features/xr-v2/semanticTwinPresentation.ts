import * as THREE from 'three'
import type { TwinBinding } from './semanticTwinRuntime'

/** Presentation only: saved geometry, evidence, selection and camera remain with their existing owners. */
export function buildTwinPresentation(bindings: readonly TwinBinding[], lightTheme: boolean) {
  if (!bindings.length) return null
  const bounds = new THREE.Box3()
  for (const { position: p, size: s } of bindings) {
    bounds.expandByPoint(new THREE.Vector3(p[0] - s[0] / 2, p[1], p[2] - s[2] / 2))
    bounds.expandByPoint(new THREE.Vector3(p[0] + s[0] / 2, p[1] + s[1], p[2] + s[2] / 2))
  }
  bounds.min.y = Math.min(0, bounds.min.y)
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z, 0.1), padding = span * 0.12, thickness = span * 0.012
  const root = new THREE.Group(); root.name = 'SemanticTwinPresentation'
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size.x + padding * 2, thickness, size.z + padding * 2),
    new THREE.MeshStandardMaterial({ color: lightTheme ? '#c7d2da' : '#293747', roughness: 0.95 }))
  floor.name = 'SemanticTwinFloor'; floor.position.set(center.x, bounds.min.y - thickness / 2, center.z)
  floor.receiveShadow = true; floor.raycast = () => {}
  const grid = new THREE.GridHelper(1, 20, lightTheme ? '#91a8bd' : '#48617b', lightTheme ? '#a8bac9' : '#354c63')
  grid.name = 'SemanticTwinGrid'; grid.scale.set(size.x + padding * 2, 1, size.z + padding * 2)
  grid.position.set(center.x, bounds.min.y + span * 0.0002, center.z); grid.raycast = () => {}
  const fill = new THREE.HemisphereLight('#d7e9ff', '#647084', 1.1)
  const key = new THREE.DirectionalLight('#fff0db', 2.5)
  key.name = 'SemanticTwinKey'; key.castShadow = true; key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.00015
  const rim = new THREE.DirectionalLight('#bddcff', 0.8)
  root.add(floor, grid, fill, key, key.target, rim, rim.target)
  // Include the receiving floor in the fit; keep hidden objects in bounds so hiding never reframes the scene.
  root.updateMatrixWorld(true)
  bounds.union(new THREE.Box3().setFromObject(floor))
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius
  bounds.getCenter(center)
  key.position.copy(center).add(new THREE.Vector3(-0.8, 1.4, 0.9).normalize().multiplyScalar(radius * 2.5))
  key.target.position.copy(center)
  rim.position.copy(center).add(new THREE.Vector3(radius, radius * 0.7, -radius))
  rim.target.position.copy(center)
  const scale = new THREE.Vector3(), lightPosition = new THREE.Vector3(), targetPosition = new THREE.Vector3()
  let lastRadius = 0, lastDistance = 0, disposed = false
  const update = () => {
    // Display fitting and AR placement scale the group, but not orthographic shadow-camera extents.
    root.updateWorldMatrix(true, true); root.getWorldScale(scale)
    const worldRadius = radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))
    const distance = key.getWorldPosition(lightPosition).distanceTo(key.target.getWorldPosition(targetPosition))
    if (worldRadius === lastRadius && distance === lastDistance) return
    lastRadius = worldRadius; lastDistance = distance
    const camera = key.shadow.camera, extent = Math.max(worldRadius * 1.05, 0.001)
    camera.left = camera.bottom = -extent; camera.right = camera.top = extent
    camera.near = Math.max(0.0001, distance - extent); camera.far = Math.max(camera.near + 0.001, distance + extent)
    key.shadow.normalBias = worldRadius * 0.0006
    camera.updateProjectionMatrix(); key.shadow.needsUpdate = true
  }
  update()
  return { root, floor, grid, key, update, dispose: () => {
    if (disposed) return
    disposed = true
    floor.geometry.dispose(); floor.material.dispose(); grid.dispose(); key.shadow.dispose()
    root.clear()
  } }
}
