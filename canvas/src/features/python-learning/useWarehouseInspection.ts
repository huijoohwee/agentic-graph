import { useCallback, useMemo } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWarehouseInspectionMode } from './useWarehouseInspectionMode'
import {
  sampleWarehouseInspection,
  WAREHOUSE_INSPECTION_DURATION_SECONDS,
  WAREHOUSE_INSPECTION_FPS,
} from './warehouseCoverageRoutes'

/** Document-bound presentation selection; the existing Timeline owns every tick. */
export function useWarehouseInspection() {
  const { available, canEnable, active, documentKey, update } = useWarehouseInspectionMode()
  const duration = WAREHOUSE_INSPECTION_DURATION_SECONDS
  // Quantize this presentation subscription, not the native transport, to 12 fps.
  const frame = useGraphStore(state => {
    if (!active || state.timelineTransportDocumentKey !== documentKey) return 0
    const time = Math.max(0, state.timelineTransportPosition) * 60
    // The scenario endpoint need not fall on a frame boundary; preserve completion.
    return time >= duration - 1e-7 ? Math.ceil(duration * WAREHOUSE_INSPECTION_FPS)
      : Math.floor(time * WAREHOUSE_INSPECTION_FPS + 1e-7)
  })
  const seconds = Math.min(duration, frame / WAREHOUSE_INSPECTION_FPS)
  const sample = useMemo(() => sampleWarehouseInspection(seconds), [seconds])
  const enable = useCallback(() => {
    if (!canEnable || !documentKey) return
    const state = useGraphStore.getState()
    update({ inspection: true })
    state.setTimelineTransportState({ documentKey, position: 0, playing: false, playbackRate: 1 })
    state.setBottomSurfaceTab('timeline')
    state.setBottomSurfaceCollapsed(false)
  }, [canEnable, documentKey, update])
  const disable = useCallback(() => {
    const state = useGraphStore.getState()
    if (state.timelineTransportDocumentKey === documentKey) state.setTimelineTransportState({ playing: false })
    update({ inspection: false })
  }, [documentKey, update])
  return { active, available, canEnable, seconds, duration, sample, documentKey, enable, disable }
}
