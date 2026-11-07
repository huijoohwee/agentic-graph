import type { SpaceAction, SpaceDocument } from './semanticSpaceRuntime'
import { SpaceError } from './semanticSpaceRuntime'
import { semanticTwinTemplateLabel } from './semanticTwinTemplates.mjs'

export type OutlineFilter = 'all' | 'visible' | 'hidden'

/** Read-only projection of the same saved bindings consumed by the Canvas. */
export function projectSemanticSceneOutline(document: SpaceDocument, evidenceSha256: string,
  query = '', visibility: OutlineFilter = 'all') {
  const entities = new Map(document.entities.map(entity => [entity.id, entity]))
  const objects = (document.twin?.objects || []).filter(model => model.evidenceSha256 === evidenceSha256)
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const rows = objects.map(model => {
    const entity = entities.get(model.entityId)
    return { id: model.entityId, label: entity?.label || model.entityId,
      shape: semanticTwinTemplateLabel(model.template), category: entity?.category || '',
      visible: model.recipe.values.visible !== false, selected: document.selectedEntityId === model.entityId,
      size: model.size, position: model.position }
  })
  return { total: rows.length, visible: rows.filter(row => row.visible).length,
    rows: rows.filter(row => (visibility === 'all' || row.visible === (visibility === 'visible'))
      && terms.every(term => `${row.label} ${row.shape} ${row.category} ${row.id}`.toLocaleLowerCase().includes(term))) }
}

/** Bind a UI draft to its exact space before handing it to the existing action owner. */
export function sceneOutlineVisibilityAction(snapshot: SpaceDocument, current: SpaceDocument | null,
  evidenceSha256: string, entityId: string, visible: boolean, requestId: string): SpaceAction {
  if (!current || current.id !== snapshot.id || current.revision !== snapshot.revision) {
    throw new SpaceError('stale-revision', 'Scene changed. Review the current outline and try again.')
  }
  const binding = current.twin?.objects.find(model => model.entityId === entityId && model.evidenceSha256 === evidenceSha256)
  if (!binding) throw new SpaceError('unknown-entity', 'This object is no longer in the displayed scene.')
  return { operation: 'control-twin', expectedRevision: snapshot.revision,
    requestId, entityId, controlId: 'visible', value: visible }
}
