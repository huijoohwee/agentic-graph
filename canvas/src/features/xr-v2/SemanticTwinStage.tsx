import { selectSemanticObject } from './semanticSpaceCanvas'
import { readCameraFramingRuntime, publishCameraFramingRuntime, subscribeCameraFramingRuntime } from '@/features/strybldr/cameraFramingRuntime'
import React from 'react'
import { useThemeDetector } from '@/hooks/useThemeDetector'
import { buildTwinPresentation } from './semanticTwinPresentation'
import { XrSelectionBounds } from '@/features/three/XrSelectionBounds'
import { readSemanticObjectViewMarkdown, semanticObjectBindings, semanticObjectCameraFit, semanticPhotoCameraFit } from './semanticObjectView'
import { readImmersiveMediaSnapshot, subscribeImmersiveMediaSnapshot } from '@/features/immersive-media/immersiveMediaRuntime'
import { photoOverlayBindings } from './semanticTwinPhotoProjection'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GlbFit } from '@/lib/three/GlbAssetModel'
import { useFrame, useThree } from '@react-three/fiber'
import { SpatialPhysicsEngine } from '@/features/physics/spatialPhysicsEngine'
import { prepareTwinScene, disposeTwinScene, type BuiltTwinScene } from './semanticTwinScene'
import { readSemanticSpace, subscribeSemanticSpace } from './semanticSpaceStore'
import { resolveSpaceObservation, type SpaceDocument } from './semanticSpaceRuntime'
import { SEMANTIC_TWIN_PREVIEW_EVENT } from './semanticTwinRuntime'

type PreviewRequest = { spaceId: string; entityId: string; operation: 'drop' | 'reset'; handled?: boolean }
const EMPTY_SCENE: BuiltTwinScene = { objects: [], textures: new Set(), error: null }
export function SemanticTwinStage({ paused = false, onFitChange }: { paused?: boolean; onFitChange?: (fit: GlbFit | null) => void }) {
  const theme = useThemeDetector()
  const media = React.useSyncExternalStore(subscribeImmersiveMediaSnapshot, readImmersiveMediaSnapshot, readImmersiveMediaSnapshot)
  const sourceText = useGraphStore(state => state.markdownDocumentText)
  const objectView = React.useMemo(() => readSemanticObjectViewMarkdown(sourceText), [sourceText])
  const framing = React.useSyncExternalStore(subscribeCameraFramingRuntime, readCameraFramingRuntime, readCameraFramingRuntime)
  const [prepared, setPrepared] = React.useState<{ target: string; scene: BuiltTwinScene } | null>(null)
  const [document, setDocument] = React.useState<SpaceDocument | null>(null)
  React.useLayoutEffect(() => {
    // Source hydration can clear the old document's camera claim after XR opens.
    // Initialize this saved view through the shared owner, without replacing an operator's orbit.
    if (!objectView || objectView.spaceId !== document?.id || framing.claimed) return
    publishCameraFramingRuntime({ anchorId: 'canvas-camera', source: 'document',
      settings: objectView.presentation === 'photo'
        ? { angle: 'front', level: 'eye-level', shot: 'medium', orbitX: 0, orbitY: 0 }
        : { angle: 'front', level: 'high-angle', shot: 'medium', orbitX: 0.22, orbitY: -0.42 } })
  }, [objectView?.spaceId, objectView?.presentation, document?.id, framing.claimed])
  React.useEffect(() => {
    let active = true
    const refresh = () => { void readSemanticSpace().then(value => { if (active) setDocument(value) }, () => {
      if (active) setDocument(null)
    }) }
    refresh()
    const unsubscribe = subscribeSemanticSpace(refresh)
    return () => { active = false; unsubscribe() }
  }, [])
  const composition = !media.active && objectView?.presentation === 'photo'
  const observation = composition && document && objectView?.spaceId === document.id
    ? resolveSpaceObservation(document, objectView.evidenceSha256) : null
  const photo = media.active ? media.source.photo : observation
    ? { width: observation.width, height: observation.height, evidenceSha256: observation.sha256 } : undefined
  const linked = useGraphStore(state => state.graphData?.nodes.some(node => node.properties?.spaceId === document?.id
    && node.properties?.twinSchema === document?.twin?.schema) === true)
  const bindings = (!linked && objectView?.spaceId !== document?.id) || !document ? [] : media.active
    ? photo ? photoOverlayBindings(document, photo) : [] : objectView ? semanticObjectBindings(document, objectView) : document.twin?.objects || []
  const sceneKey = `${linked}:${document?.id || ''}:${JSON.stringify(document?.twin)}:${media.active}:${JSON.stringify(photo)}:${JSON.stringify(objectView)}`
  const target = `${document?.id || ''}:${media.active}:${photo?.evidenceSha256 || objectView?.evidenceSha256 || ''}:${objectView?.presentation}:${objectView?.context}`
  const built = prepared?.target === target ? prepared.scene : EMPTY_SCENE
  const [presentation, setPresentation] = React.useState<ReturnType<typeof buildTwinPresentation>>(null)
  React.useLayoutEffect(() => {
    const next = photo ? null : buildTwinPresentation(built.objects.map(item => item.binding), theme === 'light')
    setPresentation(next)
    return () => next?.dispose()
  }, [built, !!photo, theme])
  const objectFit = React.useMemo(() => composition && photo ? semanticPhotoCameraFit(photo) : objectView && !photo
    ? semanticObjectCameraFit(bindings) : null, [sceneKey])
  const invalidate = useThree(state => state.invalidate)
  React.useEffect(() => {
    if (!document) { setPrepared(null); return }
    let cancelled = false
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000)
    void prepareTwinScene(bindings, document, controller.signal, photo, { composition, context: objectView?.context !== false }).then(scene => {
      if (cancelled || controller.signal.aborted) { disposeTwinScene(scene); return }
      setPrepared({ target, scene }); invalidate()
    }).catch(error => {
      if (!cancelled) window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error', {
        detail: `3D appearance could not be prepared: ${String(error.message)} The previous model is unchanged.`,
      }))
    }).finally(() => clearTimeout(timer))
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [sceneKey, invalidate])
  // Keep the last complete model visible during edits; release it after its replacement commits.
  React.useEffect(() => () => { if (prepared) disposeTwinScene(prepared.scene) }, [prepared])
  React.useEffect(() => {
    const room = document?.twin?.room
    if (media.active || !room || built.error) { onFitChange?.(null); return }
    // Keep the shared camera/scene owner engaged while replacement textures decode.
    if (objectFit && bindings.length) { onFitChange?.(objectFit); return }
    if (!built.objects.length) { onFitChange?.(null); return }
    const height = Math.max(...built.objects.map(item => item.binding.size[1]))
    const size: [number, number, number] = [room.width, height + room.depth * 0.35, room.depth + height * 0.35]
    onFitChange?.({ cameraProfile: 'spatial-capture', cameraTarget: [0, height * 10, 0],
      position: [0, 0, 0], scale: 20, floorY: 0, stageSpan: Math.max(...size) * 20,
      preserveFlatFacing: false, flatAxis: null, size, scaledSize: size.map(n => n * 20) as [number, number, number] })
  }, [built, onFitChange, media.active, objectFit])
  React.useEffect(() => () => onFitChange?.(null), [onFitChange])
  const preview = React.useRef<{ engine: SpatialPhysicsEngine; entityId: string; elapsed: number } | null>(null)
  React.useEffect(() => {
    preview.current = null
    const handle = (event: Event) => {
      const request = (event as CustomEvent<PreviewRequest>).detail
      if (!request || request.spaceId !== document?.id) return
      if (media.active || composition) {
        window.dispatchEvent(new CustomEvent('agentic-graph:semantic-twin-error', { detail: 'Open the 3D layout to preview gravity; the photo overlay keeps evidence aligned.' }))
        return
      }
      const selected = built.objects.find(item => item.binding.entityId === request.entityId)
      if (!selected) return
      request.handled = true
      for (const item of built.objects) item.wrapper.position.y = item.binding.position[1]
      preview.current = null
      invalidate()
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
      invalidate()
    }
    window.addEventListener(SEMANTIC_TWIN_PREVIEW_EVENT, handle)
    return () => window.removeEventListener(SEMANTIC_TWIN_PREVIEW_EVENT, handle)
  }, [built, document?.id, media.active, composition, invalidate])
  useFrame((_state, delta) => {
    presentation?.update()
    const run = preview.current
    if (!run || paused || globalThis.document?.hidden) return
    if (run.elapsed >= 10) { preview.current = null; return }
    run.engine.advance(Math.min(delta, 1 / 15))
    run.elapsed += Math.min(delta, 1 / 15)
    const selected = built.objects.find(item => item.binding.entityId === run.entityId)
    const state = run.engine.readBody(run.entityId)
    if (selected && state) selected.wrapper.position.y = state.position[1] - selected.binding.size[1] / 2
    invalidate()
  })
  const select = (entityId: string) => {
    if (!document) return
    void selectSemanticObject(document.id, entityId).catch(error => useGraphStore.getState().pushUiToast({
      id: 'semantic-object-selection', kind: 'error', message: String(error.message),
    }))
  }
  if (!document?.twin || built.objects.length === 0) return null
  return <group name="SemanticSpaceTwin" scale={photo ? 1 : objectFit?.scale || 20} rotation={photo || objectView ? [0, 0, 0] : [-0.35, 0, 0]}>
    {presentation ? <primitive object={presentation.root} dispose={null} /> : <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 7, 5]} intensity={1.2} />
    </>}
    {built.context && <primitive object={built.context} dispose={null} />}
    {built.objects.map(item => <XrSelectionBounds key={item.binding.entityId} targetId={item.binding.entityId} outlined={!!photo} selected={item.binding.entityId === document.selectedEntityId}>
      <primitive object={item.wrapper} dispose={null}
      onClick={(event: { stopPropagation: () => void; nativeEvent: Event }) => {
        if (!(event.nativeEvent.target instanceof HTMLCanvasElement)) return
        event.stopPropagation(); select(item.binding.entityId)
      }} /></XrSelectionBounds>)}
  </group>
}
