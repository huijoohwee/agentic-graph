import type { ImageRegionProposal } from './semanticImagePerception'
import type { SpaceDocument, SpaceEntity, SpaceObservation } from './semanticSpaceRuntime'
import { buildSemanticTwinBinding, editSemanticTwinControl, emptySemanticTwin } from './semanticTwinRuntime'

export type ConfirmImageRegions = Readonly<{
  operation: 'confirm-image-regions'; requestId: string; expectedRevision: number
  observation: SpaceObservation; proposals: readonly ImageRegionProposal[]
}>

/** Image axes create an editable layout, never a recovered camera/depth coordinate frame. */
export function compileImageRegions(doc: SpaceDocument, action: ConfirmImageRegions): SpaceDocument {
  if (!Array.isArray(action.proposals) || action.proposals.length < 1 || action.proposals.length > 12) {
    throw Error('Confirm between 1 and 12 visible regions.')
  }
  const twin = doc.twin || emptySemanticTwin()
  if (twin.room.unit !== 'arbitrary') throw Error('Image layout needs arbitrary units. Change the floor units before building proposals.')
  const entities: SpaceEntity[] = action.proposals.map((proposal, index) => ({
    id: `entity:${action.requestId}:${index}`, observationId: action.observation.id,
    label: proposal.label, category: proposal.template && !['contour', 'box'].includes(proposal.template) ? proposal.template : 'visual-region', region: proposal.region,
    confirmedAtMs: action.observation.capturedAtMs, provenance: 'user-confirmed',
    proposalMethod: 'local-foreground-components-v1',
  }))
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
  const objects = entities.map((entity, index) => {
    const region = entity.region, proposal = action.proposals[index]
    if (!/^#[0-9a-f]{6}$/i.test(proposal.color) || !Number.isFinite(proposal.coverage)
      || proposal.coverage <= 0 || proposal.coverage > 1) throw Error('Invalid region appearance evidence.')
    const aspect = (region.width * action.observation.width) / (region.height * action.observation.height)
    const width = clamp(region.width * twin.room.width, 0.1, Math.min(5, twin.room.width, 5 * aspect))
    const height = clamp(width / aspect, 0.1, 5)
    const shape = proposal.template || (proposal.silhouette ? 'contour' : 'box')
    const depth = ['contour', 'box'].includes(shape) ? 0.4
      : clamp(width * (shape === 'chair' || shape === 'table' ? 0.72 : 1), 0.1, Math.min(5, twin.room.depth)) // Authored template proportions, not inferred depth.
    const x = clamp((region.x + region.width / 2 - 0.5) * twin.room.width,
      -(twin.room.width - width) / 2, (twin.room.width - width) / 2)
    const z = clamp((region.y + region.height / 2 - 0.5) * twin.room.depth,
      -(twin.room.depth - depth) / 2, (twin.room.depth - depth) / 2)
    const binding = buildSemanticTwinBinding({ entity, observation: action.observation, room: twin.room,
      template: shape, silhouette: proposal.silhouette, size: [width, height, depth], position: [x, 0, z] })
    return editSemanticTwinControl(binding, 'color', proposal.color)
  })
  return { ...doc, observations: [...doc.observations, action.observation],
    entities: [...doc.entities, ...entities], twin: { ...twin, objects: [...twin.objects, ...objects] },
    selectedEntityId: entities[0].id }
}
