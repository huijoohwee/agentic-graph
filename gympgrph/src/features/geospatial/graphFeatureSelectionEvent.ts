const GRAPH_FEATURE_SELECTED_EVENT = 'kg:graphMapFeatureSelected'

export type GraphMapFeatureSelected = {
  sourceFeatureId: string
  graphFeatureId: string
}

export function emitGraphMapFeatureSelected(detail: GraphMapFeatureSelected): void {
  if (typeof window === 'undefined') return
  const sourceFeatureId = String(detail.sourceFeatureId || '').trim()
  const graphFeatureId = String(detail.graphFeatureId || '').trim()
  if (!sourceFeatureId || !graphFeatureId) return
  window.dispatchEvent(new CustomEvent<GraphMapFeatureSelected>(GRAPH_FEATURE_SELECTED_EVENT, {
    detail: { sourceFeatureId, graphFeatureId },
  }))
}

export function onGraphMapFeatureSelected(handler: (detail: GraphMapFeatureSelected) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<GraphMapFeatureSelected>).detail
    if (detail?.sourceFeatureId && detail.graphFeatureId) handler(detail)
  }
  window.addEventListener(GRAPH_FEATURE_SELECTED_EVENT, listener as EventListener)
  return () => window.removeEventListener(GRAPH_FEATURE_SELECTED_EVENT, listener as EventListener)
}
