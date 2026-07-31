export function hasViewportScopedRegionalPoiRendering(view) {
  const sourcePoiIds = view?.environmentPoiIds
  const renderedPoiIds = view?.renderedEnvironmentPoiIds
  if (!Array.isArray(sourcePoiIds) || !Array.isArray(renderedPoiIds)) {
    return false
  }
  const sourceSet = new Set(sourcePoiIds)
  const renderedSet = new Set(renderedPoiIds)
  return sourceSet.size === sourcePoiIds.length
    && renderedSet.size === renderedPoiIds.length
    && sourceSet.size > 0
    && sourcePoiIds.every(id => typeof id === 'string' && id.length > 0)
    && renderedPoiIds.every(id => (
      typeof id === 'string' && id.length > 0 && sourceSet.has(id)
    ))
}
