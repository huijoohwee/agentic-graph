import { getCanvas2dSurfaceId, type Canvas2dRendererId } from '@/lib/config.render'

export type CanvasDisplayControlContext = {
  canvasRenderMode: '2d' | '3d'
  canvas2dRenderer: Canvas2dRendererId
  geospatialEnabled?: boolean
}

/** Presentation capabilities supplement the existing surface and Minimap policies. */
export function resolveCanvasDisplayControlDisabledReason(
  id: string,
  state: CanvasDisplayControlContext,
): string | undefined {
  if (state.canvasRenderMode !== '2d' || state.geospatialEnabled
    || getCanvas2dSurfaceId(state.canvas2dRenderer) !== 'sequence') return undefined
  switch (id) {
    case 'control:richMedia': return 'Sequence notation does not define media panels.'
    case 'control:clusterShape': return 'Cluster shapes are unavailable for sequence branches.'
    case 'control:boardLayout': return 'Board layout is unavailable for sequence participants.'
    case 'control:card': return 'Card presentation is unavailable for sequence participants.'
    case 'control:widget': return 'Widget presentation is unavailable for sequence participants.'
    case 'control:nodeShape':
      return state.canvas2dRenderer === 'sequenceMermaid' ? 'Node shapes are defined by Mermaid sequence notation.' : undefined
    case 'control:portHandles':
      return state.canvas2dRenderer === 'sequenceMermaid' ? 'Port handles are unavailable in Mermaid sequence notation.' : undefined
    default: return undefined
  }
}
