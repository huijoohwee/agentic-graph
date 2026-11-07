import { useSyncExternalStore } from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { pythonLearningRuntime } from './learningRuntime'
import {
  canInspectWarehouse, DEFAULT_SPATIAL_VIEW, learningSpatialDocumentKey,
  learningSpatialSelection as selection, warehouseInspectionTransportKey, type SpatialView,
} from './learningSpatialSelection'

// One lifetime subscription; no route generation, timer or second playback state.
const fenceInspection = () => {
  const revokedKey = selection.bind(pythonLearningRuntime.read())
  const transport = useGraphStore.getState()
  if (revokedKey && transport.timelineTransportDocumentKey === revokedKey)
    transport.setTimelineTransportState({ playing: false })
}
fenceInspection()
const releaseRuntime = pythonLearningRuntime.subscribe(fenceInspection)
const releaseTransport = useGraphStore.subscribe((state, previous) => {
  if (state.timelineTransportDocumentKey !== previous.timelineTransportDocumentKey)
    selection.releaseWhenTransportChanges(state.timelineTransportDocumentKey)
})
if (import.meta.hot) import.meta.hot.dispose(() => { releaseRuntime(); releaseTransport() })

export function useLearningSpatialView() {
  const runtime = useSyncExternalStore(pythonLearningRuntime.subscribe, pythonLearningRuntime.read, pythonLearningRuntime.read)
  const key = learningSpatialDocumentKey(runtime.document)
  const view = useSyncExternalStore(selection.subscribe, () => selection.read(key), () => DEFAULT_SPATIAL_VIEW)
  return { runtime, view, update: (patch: Partial<SpatialView>) => selection.update(key, patch) }
}

/** Lightweight ownership check for the shared BottomPanel clock. */
export function useWarehouseInspectionMode() {
  const { runtime, view, update } = useLearningSpatialView()
  const available = runtime.document?.lessonId === 'drone'
  const canEnable = canInspectWarehouse(runtime)
  const active = canEnable && view.inspection
  const documentKey = runtime.document ? warehouseInspectionTransportKey(learningSpatialDocumentKey(runtime.document)) : ''
  return { available, canEnable, active, documentKey, update }
}
