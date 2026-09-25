import type { ImageRegionProposal } from './semanticImagePerception'
import type { SpaceDocument, SpaceEntity, SpaceObservation } from './semanticSpaceRuntime'
import { buildSemanticTwinBinding, emptySemanticTwin, packTwinRow } from './semanticTwinRuntime'

export type ConfirmImageRegions = Readonly<{
  operation: 'confirm-image-regions'; requestId: string; expectedRevision: number
  observation: SpaceObservation; proposals: readonly ImageRegionProposal[]
  replaceEntityIds?: readonly string[]
  layout?: 'image' | 'contiguous-row'
}>

/** Only unrefined, automatically grouped image volumes may be replaced by reviewed object marks. */
export function replaceableImageRegionIds(doc: SpaceDocument, evidenceSha256: string): string[] {
  return (doc.twin?.objects || []).filter(binding => {
    const entity = doc.entities.find(item => item.id === binding.entityId)
    return binding.evidenceSha256 === evidenceSha256 && ['box', 'contour'].includes(binding.template)
      && entity?.proposalMethod === 'local-foreground-components-v1' && entity.category === 'visual-region'
  }).map(binding => binding.entityId)
}

/** Image axes create an editable layout, never a recovered camera/depth coordinate frame. */
export function compileImageRegions(doc: SpaceDocument, action: ConfirmImageRegions): SpaceDocument {
  if (!Array.isArray(action.proposals) || action.proposals.length < 1 || action.proposals.length > 12) {
    throw Error('Confirm between 1 and 12 visible regions.')
  }
  const twin = doc.twin || emptySemanticTwin()
  if (action.layout !== undefined && !['image', 'contiguous-row'].includes(action.layout)) throw Error('Unsupported image object layout.')
  if (twin.room.unit !== 'arbitrary') throw Error('Image layout needs arbitrary units. Change the floor units before building proposals.')
  const replacements = action.replaceEntityIds || []
  const eligible = replaceableImageRegionIds(doc, action.observation.sha256)
  if (!Array.isArray(replacements) || replacements.length > 20 || new Set(replacements).size !== replacements.length
    || replacements.some(id => !eligible.includes(id))
    || (replacements.length && action.proposals.some(item => item.source !== 'user-region'))) {
    throw Error('Only matching automatic image groups can be replaced with individually marked objects.')
  }
  const entities: SpaceEntity[] = action.proposals.map((proposal, index) => ({
    id: `entity:${action.requestId}:${index}`, observationId: action.observation.id,
    label: proposal.label, category: proposal.template && !['contour', 'box'].includes(proposal.template) ? proposal.template : 'visual-region', region: proposal.region,
    confirmedAtMs: action.observation.capturedAtMs, provenance: 'user-confirmed',
    proposalMethod: proposal.source === 'user-region' ? 'user-selected-region-v1' : 'local-foreground-components-v1',
  }))
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
  const objects = entities.map((entity, index) => {
    const region = entity.region, proposal = action.proposals[index]
    if (!/^#[0-9a-f]{6}$/i.test(proposal.color) || !Number.isFinite(proposal.coverage)
      || proposal.coverage <= 0 || proposal.coverage > 1) throw Error('Invalid region appearance evidence.')
    const aspect = (region.width * action.observation.width) / (region.height * action.observation.height)
    const width = clamp(region.width * twin.room.width, 0.1, Math.min(5, twin.room.width, 5 * aspect))
    let height = clamp(width / aspect, 0.1, 5)
    const shape = proposal.template || (proposal.silhouette ? 'contour' : 'box')
    let depth = ['contour', 'box', 'relief'].includes(shape) ? 0.4
      : clamp(width * (shape === 'chair' || shape === 'table' ? 0.72 : 1), 0.1, Math.min(5, twin.room.depth)) // Authored template proportions, not inferred depth.
    if (shape === 'box' && proposal.source === 'user-region') depth = Math.min(width, twin.room.depth)
    if (shape === 'sea' || shape === 'river') { depth = height; height = 0.12 }
    if (shape === 'sky') depth = 0.15
    const x = clamp((region.x + region.width / 2 - 0.5) * twin.room.width,
      -(twin.room.width - width) / 2, (twin.room.width - width) / 2)
    const z = clamp((region.y + region.height / 2 - 0.5) * twin.room.depth,
      -(twin.room.depth - depth) / 2, (twin.room.depth - depth) / 2)
    const binding = buildSemanticTwinBinding({ entity, observation: action.observation, room: twin.room,
      template: shape, color: proposal.color, silhouette: shape === 'contour' ? proposal.silhouette : undefined, relief: proposal.relief, size: [width, height, depth], position: [x, ['sky', 'cloud', 'moon', 'sun'].includes(shape) ? 2 : 0, z] })
    return binding
  })
  return { ...doc, observations: [...doc.observations, action.observation],
    entities: [...doc.entities, ...entities], twin: { ...twin, objects: [...twin.objects.filter(item => !replacements.includes(item.entityId)),
      ...(action.layout === 'contiguous-row' ? packTwinRow(objects, twin.room) : objects)] },
    selectedEntityId: entities[0].id }
}

/** Copy only this image's models into a new space; the storage owner retains the old package. */
export function copyImageModelsToSpace(doc: SpaceDocument, evidenceSha256: string, id: string): SpaceDocument {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(id) || id === doc.id) throw Error('Choose a new valid space identity.')
  const twin = doc.twin
  const bindings = twin?.objects.filter(item => item.evidenceSha256 === evidenceSha256) || []
  if (!twin || !bindings.length) throw Error('Build this image before copying its models.')
  const identities = new Map(bindings.map((item, index) => [item.entityId, `entity:${id}:${index}`]))
  return { ...doc, id, revision: 0, requestIds: [],
    entities: doc.entities.filter(item => identities.has(item.id)).map(item => ({ ...item, id: identities.get(item.id)! })),
    // Retain observation history, including the verified source-detail refresh chain.
    observations: [...doc.observations],
    twin: { ...twin, objects: bindings.map(item => ({ ...item, entityId: identities.get(item.entityId)! })) },
    selectedEntityId: identities.get(doc.selectedEntityId || '') || identities.values().next().value || null }
}
