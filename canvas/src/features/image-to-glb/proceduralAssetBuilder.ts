import * as THREE from 'three'
import { parseProceduralAssetRecipe, PROCEDURAL_ASSET_LIMITS, type AssetPart, type ProceduralAssetRecipe } from './proceduralAssetContract'

export type ProceduralAssetBuild = {
  recipe: ProceduralAssetRecipe; scene: THREE.Group; source: string
  evidence: { kind: 'text-construction'; parts: number; triangles: number; materials: number; clips: number; providerCalls: 0 }
}
export function disposeProceduralAsset(scene: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
  scene.traverse(object => {
    if (!(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    geometries.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
  })
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
}
function resolvedPart(recipe: ProceduralAssetRecipe, part: AssetPart): AssetPart & { segments: number } {
  const result = { ...part, size: [...part.size] as AssetPart['size'], segments: 12 }
  for (const control of recipe.controls.filter(item => item.partId === part.id)) {
    const value = recipe.values[control.id]
    if (control.target === 'width') result.size[0] = value as number
    if (control.target === 'height') result.size[1] = value as number
    if (control.target === 'depth') result.size[2] = value as number
    if (control.target === 'color') result.color = value as string
    if (control.target === 'visible') result.visible = value as boolean
    if (control.target === 'detail') result.segments = value === 'high' ? 24 : value === 'medium' ? 16 : 8
  }
  return result
}
export function buildProceduralAsset(input: unknown): ProceduralAssetBuild {
  const deadline = performance.now() + 1000
  const recipe = parseProceduralAssetRecipe(input)
  const scene = new THREE.Group(); scene.name = 'ProceduralAssetRoot'
  const source = ["import * as THREE from 'three';", '// Generated from a validated recipe. The application never evaluates source text.', `export const recipe = ${JSON.stringify(recipe)};`, 'export function createScene() {', 'const scene = new THREE.Group(); scene.name = "ProceduralAssetRoot";', 'const pivots = new Map(), sockets = new Map();']
  const pivots = new Map<string, THREE.Group>(), sockets = new Map<string, THREE.Group>()
  let triangles = 0
  try {
    for (const original of recipe.parts) {
      if (performance.now() > deadline) throw new Error('Procedural construction exceeded its one-second budget')
      const part = resolvedPart(recipe, original)
      const [w, h, d] = part.size, segments = part.segments
      let geometry: THREE.BufferGeometry, expression: string
      if (part.primitive === 'box') { geometry = new THREE.BoxGeometry(w, h, d); expression = `new THREE.BoxGeometry(${w},${h},${d})` }
      else if (part.primitive === 'sphere') { geometry = new THREE.SphereGeometry(0.5, segments, segments / 2).scale(w, h, d); expression = `new THREE.SphereGeometry(0.5,${segments},${segments / 2}).scale(${w},${h},${d})` }
      else {
        const top = part.primitive === 'cone' ? 0 : 0.5
        geometry = new THREE.CylinderGeometry(top, 0.5, 1, segments).scale(w, h, d)
        expression = `new THREE.CylinderGeometry(${top},0.5,1,${segments}).scale(${w},${h},${d})`
      }
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
      const pivot = new THREE.Group(), socket = new THREE.Group()
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.65, metalness: 0 }))
      pivot.name = `Pivot-${part.id}`; socket.name = `Socket-${part.id}`; mesh.name = `Part-${part.id}`
      pivot.position.fromArray(part.position); pivot.rotation.set(...part.rotation)
      mesh.position.fromArray(part.pivot).negate()
      // Children use the same local modelling origin while the pivot remains independently editable.
      socket.position.copy(mesh.position); mesh.visible = part.visible
      mesh.userData = { partId: part.id, primitive: part.primitive, construction: 'native-text-recipe' }
      pivot.add(mesh, socket); scene.add(pivot); pivots.set(part.id, pivot); sockets.set(part.id, socket)
      const q = JSON.stringify
      source.push('{', `const pivot = new THREE.Group(), socket = new THREE.Group();`, `const mesh = new THREE.Mesh(${expression},new THREE.MeshStandardMaterial({color:${q(part.color)},roughness:0.65,metalness:0}));`, `pivot.name=${q(pivot.name)};socket.name=${q(socket.name)};mesh.name=${q(mesh.name)};`, `pivot.position.fromArray(${q(part.position)});pivot.rotation.set(...${q(part.rotation)});`, `mesh.position.fromArray(${q(part.pivot)}).negate();socket.position.copy(mesh.position);mesh.visible=${part.visible};`, `mesh.userData=${q(mesh.userData)};pivot.add(mesh,socket);scene.add(pivot);pivots.set(${q(part.id)},pivot);sockets.set(${q(part.id)},socket);`, '}')
    }
    if (triangles > PROCEDURAL_ASSET_LIMITS.triangles) throw new Error('Procedural asset exceeds triangle budget')
    for (const part of recipe.parts) {
      if (part.parentId === null) continue
      sockets.get(part.parentId)!.add(pivots.get(part.id)!)
      source.push(`sockets.get(${JSON.stringify(part.parentId)}).add(pivots.get(${JSON.stringify(part.id)}));`)
    }
    for (const clip of recipe.clips) {
      const tracks = clip.tracks.map(track => {
        const values = track.keys.flatMap(key => new THREE.Quaternion().setFromEuler(new THREE.Euler(...key.rotation)).toArray())
        return new THREE.QuaternionKeyframeTrack(`Pivot-${track.partId}.quaternion`, track.keys.map(key => key.time), values)
      })
      scene.animations.push(new THREE.AnimationClip(clip.id, clip.duration, tracks))
      source.push(`scene.animations.push(new THREE.AnimationClip(${JSON.stringify(clip.id)},${clip.duration},[${tracks.map(track => `new THREE.QuaternionKeyframeTrack(${JSON.stringify(track.name)},${JSON.stringify(Array.from(track.times))},${JSON.stringify(Array.from(track.values))})`).join(',')}]));`)
    }
    scene.userData = { proceduralAsset: { schema: recipe.schema, seed: recipe.seed, sourceKind: 'text' } }
    source.push(`scene.userData=${JSON.stringify(scene.userData)};scene.updateMatrixWorld(true);return scene;`, '}', '')
    if (new TextEncoder().encode(source.join('\n')).length > 262_144) throw new Error('Procedural source exceeds 256 kB')
    scene.updateMatrixWorld(true)
    return { recipe, scene, source: source.join('\n'), evidence: { kind: 'text-construction', parts: recipe.parts.length, triangles, materials: recipe.parts.length, clips: recipe.clips.length, providerCalls: 0 } }
  } catch (error) { disposeProceduralAsset(scene); throw error }
}
