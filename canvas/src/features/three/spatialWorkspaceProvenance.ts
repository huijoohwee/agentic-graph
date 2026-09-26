import type { SpaceDocument } from '../xr-v2/semanticSpaceRuntime'
import { SEMANTIC_OBJECT_VIEW_KEY, parseSemanticObjectView } from '../xr-v2/semanticObjectView'

/** Project existing document/evidence owners; never infer measurements or dereference a URL. */
export function spatialWorkspaceProvenance(metadata: Record<string, unknown>, space?: SpaceDocument | null) {
  const target = parseSemanticObjectView(metadata[SEMANTIC_OBJECT_VIEW_KEY])
  if (metadata[SEMANTIC_OBJECT_VIEW_KEY] !== undefined && (!target || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(target.spaceId))) throw new Error('Invalid saved observation reference.')
  const observation = space?.id === target?.spaceId
    ? space?.observations.find(item => item.sha256 === target?.evidenceSha256) : undefined
  return {
    kind: 'authored' as const, units: 'metres' as const, correspondence: 'unknown' as const,
    simulation: { kind: 'simulated' as const, method: 'static-catalog-bounds' as const, units: 'metres' as const, correspondence: 'unknown' as const },
    observation: target ? {
      kind: 'imported-observation' as const, spaceId: target.spaceId, evidenceSha256: target.evidenceSha256,
      availability: observation ? 'available' as const : 'unavailable' as const,
      units: observation ? 'source-pixels' as const : 'unknown' as const, scale: 'unknown' as const,
      correspondence: 'unknown' as const,
      ...(observation ? { capturedAtMs: observation.capturedAtMs, width: observation.width, height: observation.height } : {}),
    } : null,
  }
}
