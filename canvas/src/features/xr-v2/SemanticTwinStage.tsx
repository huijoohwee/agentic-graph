import React from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SpatialPhysicsEngine } from '@/features/physics/spatialPhysicsEngine'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { readSemanticSpace, runSemanticSpaceAction, subscribeSemanticSpace } from './semanticSpaceStore'
import type { SpaceDocument } from './semanticSpaceRuntime'
import type { TwinBinding } from './semanticTwinRuntime'
import { SEMANTIC_TWIN_PREVIEW_EVENT } from './semanticTwinRuntime'

type PreviewRequest = { spaceId: string; entityId: string; operation: 'drop' | 'reset'; handled?: boolean }
type BuiltObject = { binding: TwinBinding; wrapper: THREE.Group; source: THREE.Group }
type BuiltScene = { objects: readonly BuiltObject[]; error: string | null }

function buildScene(bindings: readonly TwinBinding[]): BuiltScene {
  const objects: BuiltObject[] = []
  let triangles = 0
  try {
    for (const binding of bindings) {
      const built = buildProceduralAsset(binding.recipe)
      const source = built.scene
      objects.push({ binding, wrapper: new THREE.Group(), source })
      const bounds = new THREE.Box3().setFromObject(source)
      const extent = bounds.getSize(new THREE.Vector3())
      triangles += built.evidence.triangles
      if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray(),
        ...extent.toArray()].every(Number.isFinite) || Math.min(...extent.toArray()) <= 0
        || triangles > 30_000) throw Error('Twin geometry exceeds its finite bounds or mobile triangle budget')
      source.scale.set(binding.size[0] / extent.x, binding.size[1] / extent.y, binding.size[2] / extent.z)
      source.position.set(-bounds.getCenter(new THREE.Vector3()).x * source.scale.x,
        -bounds.min.y * source.scale.y, -bounds.getCenter(new THREE.Vector3()).z * source.scale.z)
      const wrapper = objects.at(-1)!.wrapper
      wrapper.name = `SemanticTwin-${binding.entityId}`
      wrapper.position.set(...binding.position)
      wrapper.add(source)
    }
    return { objects, error: null }
  } catch (error) {
    for (const object of objects) disposeProceduralAsset(object.source)
    return { objects: [], error: String((error as Error).message || error) }
  }
}

export function SemanticTwinStage({ paused = false }: { paused?: boolean }) {
  const [document, setDocument] = React.useState<SpaceDocument | null>(null)
  React.useEffect(() => {
    let active = true
    const refresh = () => { void readSemanticSpace().then(value => { if (active) setDocument(value) }, () => {
      if (active) setDocument(null)
    }) }
    refresh()
    const unsubscribe = subscribeSemanticSpace(refresh)
    return () => { active = false; unsubscribe() }
  }, [])
  const bindings = document?.twin?.objects || []
  const sceneKey = `${document?.id || ''}:${JSON.stringify(document?.twin)}`
  const built = React.useMemo(() => buildScene(bindings), [sceneKey])
  React.useEffect(() => () => { for (const item of built.objects) disposeProceduralAsset(item.source) }, [built])
  React.useEffect(() => {
    if (built.error) window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error', { detail: built.error }))
  }, [built.error])
  const preview = React.useRef<{ engine: SpatialPhysicsEngine; entityId: string; elapsed: number } | null>(null)
  React.useEffect(() => {
    preview.current = null
    const handle = (event: Event) => {
      const request = (event as CustomEvent<PreviewRequest>).detail
      if (!request || request.spaceId !== document?.id) return
      const selected = built.objects.find(item => item.binding.entityId === request.entityId)
      if (!selected) return
      request.handled = true
      for (const item of built.objects) item.wrapper.position.y = item.binding.position[1]
      preview.current = null
      if (request.operation !== 'drop') return
      const bodies = built.objects.map(item => ({ id: item.binding.entityId,
        motion: item === selected ? 'dynamic' as const : 'static' as const,
        position: [item.binding.position[0], item.binding.size[1] / 2 + (item === selected ? 1 : 0),
          item.binding.position[2]] as const }))
      const colliders = built.objects.map(item => ({ id: `collider:${item.binding.entityId}`,
        bodyId: item.binding.entityId, shape: { kind: 'cuboid' as const,
          halfSize: [item.binding.size[0] / 2, item.binding.size[1] / 2, item.binding.size[2] / 2] as const } }))
      const engine = new SpatialPhysicsEngine({ fixedStepSeconds: 1 / 60, maxSubSteps: 4,
        gravity: [0, -9.81, 0], ground: { enabled: true, height: 0 }, bodies, colliders })
      selected.wrapper.position.y = 1
      preview.current = { engine, entityId: request.entityId, elapsed: 0 }
    }
    window.addEventListener(SEMANTIC_TWIN_PREVIEW_EVENT, handle)
    return () => window.removeEventListener(SEMANTIC_TWIN_PREVIEW_EVENT, handle)
  }, [built, document?.id])
  useFrame((_state, delta) => {
    const run = preview.current
    if (!run || paused || globalThis.document?.hidden) return
    if (run.elapsed >= 10) { preview.current = null; return }
    run.engine.advance(Math.min(delta, 1 / 15))
    run.elapsed += Math.min(delta, 1 / 15)
    const selected = built.objects.find(item => item.binding.entityId === run.entityId)
    const state = run.engine.readBody(run.entityId)
    if (selected && state) selected.wrapper.position.y = state.position[1] - selected.binding.size[1] / 2
  })
  const select = (entityId: string) => {
    void readSemanticSpace().then(doc => {
      if (!doc || doc.id !== document?.id) return
      return runSemanticSpaceAction({ operation: 'select', requestId: `request:${crypto.randomUUID()}`,
        expectedRevision: doc.revision, entityId })
    })
  }
  if (!document?.twin || built.objects.length === 0) return null
  return <group name="SemanticSpaceTwin" scale={20} rotation={[-0.35, 0, 0]}>
    <ambientLight intensity={0.7} />
    <directionalLight position={[3, 7, 5]} intensity={1.2} />
    <mesh position={[0, -0.04, 0]} receiveShadow>
      <boxGeometry args={[document.twin.room.width, 0.08, document.twin.room.depth]} />
      <meshStandardMaterial color="#69747c" roughness={0.9} />
    </mesh>
    {built.objects.map(item => <primitive key={item.binding.entityId} object={item.wrapper} dispose={null}
      onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); select(item.binding.entityId) }} />)}
  </group>
}
