import { readSemanticSpace, runSemanticSpaceAction } from './semanticSpaceStore'
import { findSourceFileForMarkdownDocument } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { SEMANTIC_OBJECT_VIEW_KEY, semanticObjectBindings } from './semanticObjectView'
import { publishCameraFramingRuntime } from '@/features/strybldr/cameraFramingRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { closeWorkspaceView, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import type { SpaceDocument, SpaceEntity } from './semanticSpaceRuntime'

export const linkedCanvasNode = (space: SpaceDocument, entityId: string) =>
  useGraphStore.getState().graphData?.nodes.find(node =>
    node.type === 'semantic-space-entity'
    && node.properties?.spaceId === space.id && node.properties?.entityId === entityId)

export async function addSemanticEntityToCanvas(space: SpaceDocument, entity: SpaceEntity, options: { frame?: boolean } = {}): Promise<string> {
  let state = useGraphStore.getState()
  const documentName = state.markdownDocumentName
  if (state.workspaceViewMode === 'editor') closeWorkspaceView(state)
  for (let attempt = 0; attempt < 50 && isWorkspaceGraphMutationBlocked(useGraphStore.getState()); attempt += 1) {
    await new Promise(resolve => window.setTimeout(resolve, 100))
    if (useGraphStore.getState().markdownDocumentName !== documentName) throw Error('Canvas document changed before linking this entity.')
  }
  state = useGraphStore.getState()
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
  if (twin && options.frame !== false) {
    if (useGraphStore.getState().canvas3dMode !== 'xr') useGraphStore.getState().setCanvas3dMode('3d')
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
  const { photoOverlayBindings } = await import('./semanticTwinPhotoProjection')
  const count = photoOverlayBindings(space, { evidenceSha256: observation.sha256 }).length
  return `Image shown with ${count} saved 3D region${count === 1 ? '' : 's'}. Generate whole-image relief for complete surface coverage, or review more object regions.`
}

/** Reuse the same bounded evidence preparation to match a fresh local/URL import by content. */
async function resolveSemanticImage(sourceUrl: string, signal: AbortSignal) {
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
  return { space, observation, media }
}
export async function showSemanticImageOnCanvas(sourceUrl: string, signal: AbortSignal) {
  const { space, observation, media } = await resolveSemanticImage(sourceUrl, signal)
  if (space?.observations.some(item => item.id === observation.id)) return overlaySemanticObservation(space, observation.id, signal)
  const next = media.setImmersiveMediaSource({ kind: 'image', url: sourceUrl,
    photo: { width: observation.width, height: observation.height } })
  if (next.error) throw Error(next.message)
  media.resetImmersiveMediaView()
  const opened = media.openImmersiveMedia()
  if (opened.error) throw Error(opened.message)
  return 'Image shown. Analyze and review regions to add aligned 3D objects.'
}


export async function openSemanticObjects(space: SpaceDocument, observationId: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const current = await readSemanticSpace()
  if (current?.id !== space.id || current.revision !== space.revision) throw Error('Space changed before opening objects.')
  const observation = space.observations.find(item => item.id === observationId)
  if (!observation) throw Error('Choose saved image evidence first.')
  const target = { spaceId: space.id, evidenceSha256: observation.sha256 }
  const bindings = semanticObjectBindings(space, target)
  if (!bindings.length) throw Error('No separate object models yet. Create 3D objects, mark a region, and choose its shape. Image relief is a separate surface.')
  const { closeImmersiveMedia } = await import('@/features/immersive-media/immersiveMediaRuntime')
  const entity = space.entities.find(item => item.id === bindings[0].entityId)!
  await addSemanticEntityToCanvas(space, entity, { frame: false })
  signal?.throwIfAborted()
  const rechecked = await readSemanticSpace()
  if (rechecked?.id !== space.id || rechecked.revision !== space.revision) throw Error('Space changed while opening objects.')
  closeImmersiveMedia()
  const { activateXrSceneSurface } = await import('@/features/three/xrSceneSurfaceRuntime')
  if (!activateXrSceneSurface({ panelView: 'media', openPanel: true, timeline: true })) throw Error('XR view is unavailable for this document.')
  const state = useGraphStore.getState()
  const settings = { kgCanvasSurfaceMode: 'xr', kgCanvasRenderMode: '3d', kgCanvas3dMode: 'xr',
    kgBottomPanelOpen: true, kgBottomPanelTab: 'timeline', [SEMANTIC_OBJECT_VIEW_KEY]: target }
  const [{ upsertTopLevelFrontmatterSectionMarkdownText }, { writeActiveMarkdownDocumentTextIfPresent }] = await Promise.all([
    import('@/hooks/store/graph-data-slice/graphDataFrontmatterSections'),
    import('@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'),
  ])
  if (!state.markdownDocumentName || !state.markdownDocumentText) throw Error('Open an editable Markdown source for these objects.')
  const text = Object.entries(settings).reduce((rawText, [sectionKey, sectionValue]) =>
    upsertTopLevelFrontmatterSectionMarkdownText({ rawText, sectionKey, sectionValue }), state.markdownDocumentText)
  const sourceFile = findSourceFileForMarkdownDocument(state, state.markdownDocumentName)
  if (sourceFile) state.updateSourceFile(sourceFile.id, { text, parsedTextHash: '', parsedGraphData: undefined, status: 'idle' })
  const applied = await state.setActiveMarkdownDocument({ name: state.markdownDocumentName, text,
    expectedCurrentDocumentName: state.markdownDocumentName, expectedCurrentDocumentText: state.markdownDocumentText,
    applyToGraph: false })
  if (!applied) throw Error('Canvas source changed before XR settings could be saved.')
  const active = useGraphStore.getState()
  if (active.markdownDocumentName !== state.markdownDocumentName || active.markdownDocumentText !== text) throw Error('Canvas source changed while opening objects.')
  if (!await writeActiveMarkdownDocumentTextIfPresent({ state: active, sourceFiles: active.sourceFiles, text, label: 'Open photo objects in XR' })) {
    throw Error('XR settings could not be saved locally.')
  }
  // Parsed Markdown metadata owns the presentation target on reopen as well as this activation.
  publishCameraFramingRuntime({ anchorId: 'canvas-camera', source: 'panel',
    settings: { angle: 'front', level: 'high-angle', shot: 'medium', orbitX: 0.22, orbitY: -0.42 } })
  await selectSemanticObject(space.id, entity.id)
  return `${bindings.length} separate 3D object(s). Click a model to select it and edit its transform in Timeline.`
}
export async function showSemanticObjectsOnCanvas(sourceUrl: string, signal: AbortSignal) {
  const { space, observation } = await resolveSemanticImage(sourceUrl, signal)
  if (!space) throw Error('Create and review object models first.')
  signal.throwIfAborted()
  return openSemanticObjects(space, observation.id, signal)
}

/** Select through the saved-entity owner, then expose its existing graph and Timeline controls. */
export async function selectSemanticObject(spaceId: string, entityId: string) {
  const document = await readSemanticSpace()
  if (!document || document.id !== spaceId) throw Error('The selected space changed.')
  const next = document.selectedEntityId === entityId ? document : await runSemanticSpaceAction({
    operation: 'select', requestId: `request:${crypto.randomUUID()}`, expectedRevision: document.revision, entityId,
  })
  await inspectSemanticObject(next)
  return next
}
export async function inspectSemanticObject(document: SpaceDocument) {
  const entity = document.entities.find(item => item.id === document.selectedEntityId)
  if (!entity) return
  const current = await readSemanticSpace()
  if (current?.id !== document.id || current.selectedEntityId !== entity.id) return
  await addSemanticEntityToCanvas(document, entity, { frame: false })
  const rechecked = await readSemanticSpace()
  if (rechecked?.id !== document.id || rechecked.selectedEntityId !== entity.id) return
  const state = useGraphStore.getState()
  state.setBottomSurfaceTab('timeline'); state.setBottomSurfaceCollapsed(false)
}
