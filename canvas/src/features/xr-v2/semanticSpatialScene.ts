import type { SpaceDocument } from './semanticSpaceRuntime'
import { buildSemanticTwinBinding, SEMANTIC_TWIN_TEMPLATES, type TwinTemplate, type TwinVector } from './semanticTwinRuntime'

export type ComposeTwinScene = Readonly<{
  operation: 'compose-twin-scene'; requestId: string; expectedRevision: number
  evidenceSha256: string
  assignments: readonly Readonly<{ entityId: string; template: TwinTemplate }>[]
}>
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const palette: Partial<Record<TwinTemplate, string>> = {
  building: '#708da2', landscape: '#729267', sea: '#237f99', river: '#359db1', tree: '#508251',
  sky: '#8fbed6', cloud: '#dbe4e8', moon: '#f1edce', sun: '#ffda72', aircraft: '#cedae4', ship: '#a3b7be', car: '#c37157',
}

/** Explicit shape assignments, source X/ground-depth layout. No semantic/depth inference. */
export function composeTwinScene(document: SpaceDocument, action: ComposeTwinScene): SpaceDocument {
  const twin = document.twin
  if (!twin || twin.room.unit !== 'arbitrary') throw Error('Spatial composition needs an image space with arbitrary units.')
  if (!Array.isArray(action.assignments) || !action.assignments.length || action.assignments.length > 20
    || new Set(action.assignments.map(item => item.entityId)).size !== action.assignments.length) throw Error('Choose 1–20 distinct saved models.')
  const replacements = new Map(action.assignments.map(assignment => {
    const previous = twin.objects.find(item => item.entityId === assignment.entityId)
    const entity = document.entities.find(item => item.id === assignment.entityId)
    const observation = document.observations.find(item => item.id === entity?.observationId)
    if (!previous || !entity || !observation || previous.evidenceSha256 !== action.evidenceSha256
      || !SEMANTIC_TWIN_TEMPLATES.includes(assignment.template) || assignment.template === 'relief') throw Error('Choose a supported shape for a saved model from this image.')
    const shape = assignment.template, r = entity.region
    const width = clamp(r.width * twin.room.width, 0.18, Math.min(5, twin.room.width))
    const imageHeight = width * r.height * observation.height / (r.width * observation.width)
    let size: TwinVector = [width, clamp(imageHeight, 0.18, 5), clamp(width * 0.72, 0.1, Math.min(5, twin.room.depth))]
    if (shape === 'sea' || shape === 'river' || shape === 'landscape') size = [width,
      shape === 'landscape' ? clamp(width * 0.22, 0.2, 1.2) : 0.1,
      clamp(r.height * twin.room.depth, 0.2, Math.min(5, twin.room.depth))]
    if (shape === 'building') size = [width, clamp(imageHeight, Math.min(width * 1.2, 5), 5), clamp(width * 0.8, 0.18, Math.min(5, twin.room.depth))]
    if (shape === 'tree') size = [width, clamp(imageHeight, Math.min(width * 1.7, 5), 5), Math.min(width, twin.room.depth)]
    if (shape === 'ship' || shape === 'car') size = [width, clamp(width * 0.65, 0.15, 2), clamp(width * 2, 0.2, Math.min(5, twin.room.depth))]
    if (shape === 'aircraft') size = [width, clamp(width * 0.3, 0.1, 1), clamp(width * 0.85, 0.1, Math.min(5, twin.room.depth))]
    const position: TwinVector = [clamp((r.x + r.width / 2 - 0.5) * twin.room.width,
      -(twin.room.width - size[0]) / 2, (twin.room.width - size[0]) / 2),
      ['sky', 'cloud', 'moon', 'sun', 'aircraft'].includes(shape) ? 2 : 0,
      clamp((r.y + r.height - 0.5) * twin.room.depth,
        -(twin.room.depth - size[2]) / 2, (twin.room.depth - size[2]) / 2)]
    // Keeping a contour keeps its saved mask; changing shape is an explicit authored replacement.
    const binding = buildSemanticTwinBinding({ entity, observation, template: shape, room: twin.room, size, position,
      seed: previous.recipe.seed, silhouette: shape === 'contour' ? previous.silhouette : undefined,
      color: palette[shape] || String(previous.recipe.values.color) })
    binding.recipe.values.visible = previous.recipe.values.visible
    return [entity.id, binding] as const
  }))
  return { ...document, twin: { ...twin, objects: twin.objects.map(item => replacements.get(item.entityId) || item) } }
}
