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
