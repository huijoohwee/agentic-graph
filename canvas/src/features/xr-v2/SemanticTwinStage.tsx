import { selectSemanticObject } from './semanticSpaceCanvas'
import React from 'react'
import { XrSelectionBounds } from '@/features/three/XrSelectionBounds'
import { readSemanticObjectViewMarkdown, semanticObjectBindings } from './semanticObjectView'
import { readImmersiveMediaSnapshot, subscribeImmersiveMediaSnapshot } from '@/features/immersive-media/immersiveMediaRuntime'
import { photoOverlayBindings, projectTwinOnPhoto } from './semanticTwinPhotoProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GlbFit } from '@/lib/three/GlbAssetModel'
import { useFrame, useThree } from '@react-three/fiber'
import { SpatialPhysicsEngine } from '@/features/physics/spatialPhysicsEngine'
import { buildTwinScene, disposeTwinScene } from './semanticTwinScene'
import { applyTwinImageAppearance } from './semanticTwinImageAppearance'
import { readSemanticSpace, subscribeSemanticSpace } from './semanticSpaceStore'
import type { SpaceDocument } from './semanticSpaceRuntime'
import { SEMANTIC_TWIN_PREVIEW_EVENT } from './semanticTwinRuntime'

type PreviewRequest = { spaceId: string; entityId: string; operation: 'drop' | 'reset'; handled?: boolean }
export function SemanticTwinStage({ paused = false, onFitChange }: { paused?: boolean; onFitChange?: (fit: GlbFit | null) => void }) {
  const media = React.useSyncExternalStore(subscribeImmersiveMediaSnapshot, readImmersiveMediaSnapshot, readImmersiveMediaSnapshot)
  const sourceText = useGraphStore(state => state.markdownDocumentText)
  const objectView = React.useMemo(() => readSemanticObjectViewMarkdown(sourceText), [sourceText])
  const photo = media.active ? media.source.photo : undefined
  const [ready, setReady] = React.useState(false)
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
  const linked = useGraphStore(state => state.graphData?.nodes.some(node => node.properties?.spaceId === document?.id
    && node.properties?.twinSchema === document?.twin?.schema) === true)
  const bindings = (!linked && objectView?.spaceId !== document?.id) || !document ? [] : media.active
    ? photo ? photoOverlayBindings(document, photo) : [] : objectView ? semanticObjectBindings(document, objectView) : document.twin?.objects || []
  const sceneKey = `${linked}:${document?.id || ''}:${JSON.stringify(document?.twin)}:${media.active}:${JSON.stringify(photo)}:${JSON.stringify(objectView)}`
  const built = React.useMemo(() => {
    const result = buildTwinScene(bindings)
    if (photo) result.objects.forEach(item => { item.wrapper.visible = false })
    return result
  }, [sceneKey])
  const invalidate = useThree(state => state.invalidate)
  React.useEffect(() => {
    setReady(false)
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000)
    if (document && built.objects.length) void (objectView && !photo ? Promise.resolve() : applyTwinImageAppearance(built.objects, document, controller.signal, built.textures, !!photo))
      .then(() => { if (!controller.signal.aborted) {
        if (photo) for (const item of built.objects) { projectTwinOnPhoto(item, document, photo); item.wrapper.visible = true }
        setReady(true); invalidate()
      } })
      .catch(error => { if (!controller.signal.aborted) window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error',
        { detail: `Photo appearance unavailable: ${String(error.message)} Solid geometry remains available.` })) })
    return () => { clearTimeout(timer); controller.abort(); disposeTwinScene(built) }
  }, [built, invalidate])
  React.useEffect(() => {
    if (built.error) window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error', { detail: built.error }))
  }, [built.error])
  React.useEffect(() => {
    const room = document?.twin?.room
    if (media.active || !room || !built.objects.length || built.error) { onFitChange?.(null); return }
    const height = Math.max(...built.objects.map(item => item.binding.size[1]))
    const size: [number, number, number] = [room.width, height + room.depth * 0.35, room.depth + height * 0.35]
    onFitChange?.({ cameraProfile: 'spatial-capture', cameraTarget: [0, height * 10, 0],
      position: [0, 0, 0], scale: 20, floorY: 0, stageSpan: Math.max(...size) * 20,
      preserveFlatFacing: false, flatAxis: null, size, scaledSize: size.map(n => n * 20) as [number, number, number] })
    return () => onFitChange?.(null)
  }, [built, onFitChange, media.active])
  const preview = React.useRef<{ engine: SpatialPhysicsEngine; entityId: string; elapsed: number } | null>(null)
  React.useEffect(() => {
    preview.current = null
    const handle = (event: Event) => {
      const request = (event as CustomEvent<PreviewRequest>).detail
      if (!request || request.spaceId !== document?.id) return
      if (media.active) {
        window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error', { detail: 'Open the 3D layout to preview gravity; the photo overlay keeps evidence aligned.' }))
        return
      }
      const selected = built.objects.find(item => item.binding.entityId === request.entityId)
      if (!selected) return
      request.handled = true
      for (const item of built.objects) item.wrapper.position.y = item.binding.position[1]
      preview.current = null
      if (request.operation !== 'drop') return
      const bodies = built.objects.map(item => ({ id: item.binding.entityId,
        motion: item === selected ? 'dynamic' as const : 'static' as const,
        position: [item.binding.position[0], item.binding.position[1] + item.binding.size[1] / 2 + (item === selected ? 1 : 0),
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
  }, [built, document?.id, media.active])
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
    if (!document) return
    void selectSemanticObject(document.id, entityId).catch(error => useGraphStore.getState().pushUiToast({
      id: 'semantic-object-selection', kind: 'error', message: String(error.message),
    }))
  }
  if (!document?.twin || built.objects.length === 0) return null
  return <group name="SemanticSpaceTwin" visible={!photo || ready} scale={photo ? 1 : 20} rotation={photo || objectView ? [0, 0, 0] : [-0.35, 0, 0]}>
    <ambientLight intensity={0.7} />
    <directionalLight position={[3, 7, 5]} intensity={1.2} />
    {!photo && <mesh position={[0, -0.04, 0]} receiveShadow>
      <boxGeometry args={[document.twin.room.width, 0.08, document.twin.room.depth]} />
      <meshStandardMaterial color="#69747c" roughness={0.9} />
    </mesh>}
    {built.objects.map(item => <XrSelectionBounds key={item.binding.entityId} targetId={item.binding.entityId} selected={item.binding.entityId === document.selectedEntityId}>
      <primitive object={item.wrapper} dispose={null}
      onClick={(event: { stopPropagation: () => void; nativeEvent: Event }) => {
        if (!(event.nativeEvent.target instanceof HTMLCanvasElement)) return
        event.stopPropagation(); select(item.binding.entityId)
      }} /></XrSelectionBounds>)}
  </group>
}
