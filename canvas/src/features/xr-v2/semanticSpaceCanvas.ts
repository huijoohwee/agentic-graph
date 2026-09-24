import { publishCameraFramingRuntime } from '@/features/strybldr/cameraFramingRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { closeWorkspaceView, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import type { SpaceDocument, SpaceEntity } from './semanticSpaceRuntime'

export const linkedCanvasNode = (space: SpaceDocument, entityId: string) =>
  useGraphStore.getState().graphData?.nodes.find(node =>
    node.type === 'semantic-space-entity'
    && node.properties?.spaceId === space.id && node.properties?.entityId === entityId)

export async function addSemanticEntityToCanvas(space: SpaceDocument, entity: SpaceEntity): Promise<string> {
  let state = useGraphStore.getState()
  if (state.workspaceViewMode === 'editor') {
    closeWorkspaceView(state)
    for (let attempt = 0; attempt < 20 && isWorkspaceGraphMutationBlocked(useGraphStore.getState()); attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 100))
    }
    state = useGraphStore.getState()
  }
  if (isWorkspaceGraphMutationBlocked(state)) {
    throw Error('The canvas is still preparing or read-only. Open an editable canvas and retry.')
  }
  const id = entity.id
  const existing = linkedCanvasNode(space, id)
  if (!existing && state.graphData?.nodes.some(node =>
    (node.id === id || node.id.endsWith(`::${id}`)) && node.properties?.spaceId !== space.id)) {
    throw Error('The active canvas already uses this entity ID. Open another canvas document.')
  }
  const twin = space.twin?.objects.find(item => item.entityId === entity.id)
  const properties = { spaceId: space.id, entityId: entity.id,
    observationId: entity.observationId, category: entity.category, region: entity.region,
    evidenceSha256: space.observations.find(item => item.id === entity.observationId)?.sha256 || '',
    twinSchema: space.twin?.schema || '', twinTemplate: twin?.template || '', twinUnits: space.twin?.room.unit || 'arbitrary' }
  if (!existing) {
    state.addNode({ id, label: entity.label, type: 'semantic-space-entity', properties })
  } else if (existing.label !== entity.label || Object.entries(properties).some(([key, value]) =>
    JSON.stringify(existing.properties?.[key]) !== JSON.stringify(value))) {
    state.updateNode(existing.id, { label: entity.label, properties: { ...existing.properties, ...properties } })
  }
  const linked = linkedCanvasNode(space, id)
  if (!linked) {
    throw Error('The active canvas did not accept this entity. Check its edit permissions.')
  }
  useGraphStore.getState().selectNode(linked.id)
  if (twin) {
    useGraphStore.getState().setCanvas3dMode('3d')
    useGraphStore.getState().setCanvasRenderMode('3d')
    publishCameraFramingRuntime({ anchorId: 'canvas-camera', source: 'panel',
      settings: { angle: 'front', level: 'high-angle', shot: 'medium', orbitX: 0.22, orbitY: -0.42 } })
  }
  return twin && useGraphStore.getState().canvasRenderMode === '3d'
    ? 'Entity and editable geometry linked to the active 3D canvas.' : 'Entity linked to the active canvas.'
}

/** Open exact saved evidence with its meshes in the existing image presentation owner. */
export async function overlaySemanticObservation(space: SpaceDocument, observationId: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const observation = space.observations.find(item => item.id === observationId)
  if (!observation) throw Error('Choose saved image evidence first.')
  const { readSemanticSpace } = await import('./semanticSpaceStore')
  const current = await readSemanticSpace()
  if (current?.id !== space.id || current.revision !== space.revision) throw Error('Space changed before opening the overlay.')
  const entity = space.entities.find(item => item.observationId === observationId && space.twin?.objects.some(binding => binding.entityId === item.id))
  if (entity) await addSemanticEntityToCanvas(space, entity)
  const media = await import('@/features/immersive-media/immersiveMediaRuntime')
  const rechecked = await readSemanticSpace()
  signal?.throwIfAborted()
  if (rechecked?.id !== space.id || rechecked.revision !== space.revision) throw Error('Space changed while opening the overlay.')
  const next = media.setImmersiveMediaSource({ kind: 'image', url: observation.imageDataUrl,
    photo: { width: observation.width, height: observation.height, evidenceSha256: observation.sha256 } })
  if (next.error) throw Error(next.message)
  media.resetImmersiveMediaView()
  const opened = media.openImmersiveMedia()
  if (opened.error) throw Error(opened.message)
  return 'Objects aligned with their source image. Depth is authored relief; use 3D layout for placement and physics.'
}

/** Reuse the same bounded evidence preparation to match a fresh local/URL import by content. */
export async function showSemanticImageOnCanvas(sourceUrl: string, signal: AbortSignal) {
  const [{ readSemanticSpace }, { perceiveImportedImage }, media] = await Promise.all([
    import('./semanticSpaceStore'), import('./semanticImagePerceptionClient'),
    import('@/features/immersive-media/immersiveMediaRuntime'),
  ])
  let space = await readSemanticSpace()
  let observation = space?.observations.find(item => item.imageDataUrl === sourceUrl)
  if (!observation) {
    const draft = await perceiveImportedImage(sourceUrl, signal, { useWholeRegion: true })
    space = await readSemanticSpace()
    observation = space?.observations.find(item => item.sha256 === draft.observation.sha256) || draft.observation
  }
  signal.throwIfAborted()
  if (space?.observations.some(item => item.id === observation.id)) return overlaySemanticObservation(space, observation.id, signal)
  const next = media.setImmersiveMediaSource({ kind: 'image', url: sourceUrl,
    photo: { width: observation.width, height: observation.height } })
  if (next.error) throw Error(next.message)
  media.resetImmersiveMediaView()
  const opened = media.openImmersiveMedia()
  if (opened.error) throw Error(opened.message)
  return 'Image shown. Analyze and review regions to add aligned 3D objects.'
}
