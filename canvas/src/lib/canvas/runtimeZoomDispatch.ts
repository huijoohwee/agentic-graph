import { readGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { ZoomRequestOptions } from '@/lib/zoom/requests'

type RuntimeZoomAction = 'in' | 'out' | 'reset' | 'selection'
type RuntimeFitIntent = 'fitToView' | 'fitToScreen'

export async function dispatchRuntimeZoomAction(type: RuntimeZoomAction, options?: Pick<ZoomRequestOptions, 'origin'>): Promise<void> {
  const store = useGraphStore.getState()
  const automaticSelection = options?.origin === 'selectionMode'
  if (automaticSelection && (type !== 'selection' || store.viewPinned || !store.zoomToSelectionMode)) return
  if (store.canvasRenderMode === '2d') {
    store.requestZoom(type, options)
    return
  }
  const geospatialEnabled = await readGeospatialModeEnabled().catch(() => false)
  const current = useGraphStore.getState()
  if (automaticSelection && (current.viewPinned || !current.zoomToSelectionMode)) return
  if (geospatialEnabled) {
    store.requestZoom(type, options)
    return
  }
  store.requestThreeCamera(type)
}

export async function dispatchRuntimeFitToView(): Promise<void> {
  return dispatchRuntimeFitIntent('fitToView')
}

export async function dispatchRuntimeFitIntent(intent: RuntimeFitIntent): Promise<void> {
  const store = useGraphStore.getState()
  if (store.canvasRenderMode === '2d') {
    store.requestZoom('fit', { intent })
    return
  }
  const geospatialEnabled = await readGeospatialModeEnabled().catch(() => false)
  if (geospatialEnabled) {
    store.requestZoom('fit', { intent })
    return
  }
  if (store.canvasRenderMode === '3d') {
    store.requestThreeCamera('fit')
    return
  }
  store.requestZoom('fit', { intent })
}

export function dispatchRuntimeZoomActionSoon(type: RuntimeZoomAction, options?: Pick<ZoomRequestOptions, 'origin'>): void {
  void dispatchRuntimeZoomAction(type, options)
}

export function dispatchRuntimeFitToViewSoon(): void {
  void dispatchRuntimeFitToView()
}

export function dispatchRuntimeFitIntentSoon(intent: RuntimeFitIntent): void {
  void dispatchRuntimeFitIntent(intent)
}
