import React from 'react'
import { useSourceGeospatialContext } from '@/features/evidence-analysis/geospatialSource'

const SourceGeospatialTimelinePanel = React.lazy(() => import('@/features/evidence-analysis/SourceGeospatialTimelinePanel').then(module => ({ default: module.SourceGeospatialTimelinePanel })))
import { GanttTimelineTransportPanel } from './GanttTimelineTransportPanel'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { resolveXrStageObjects } from '@/features/three/xrSceneLibrary'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'
import { resolveXrDocumentStageAuthority } from '@/features/three/xrSceneDocumentReadiness'
import { useWarehouseInspectionMode } from '@/features/python-learning/useWarehouseInspectionMode'

const SemanticObjectInspector = React.lazy(() => import('@/features/xr-v2/SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))
const SequenceTimeline = React.lazy(() => import('@/features/sequence/SequenceTimeline').then(module => ({ default: module.SequenceTimeline })))
const WarehouseTimelinePanel = React.lazy(() => import('@/features/python-learning/WarehouseTimelinePanel').then(module => ({ default: module.WarehouseTimelinePanel })))

function MediaTimelineBottomPanelView({ compact }: { compact: boolean }) {
  const { code: mediaGanttCode, ganttModel, graphData } = useMermaidGanttDocument({ purpose: 'media' })
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({ graphData, diagramModel: ganttModel, kind: 'gantt' })
  return <GanttTimelineTransportPanel code={mediaGanttCode} compact={compact} mode="media" onSelectedRowKeyChange={handleDiagramSelectedRowKeyChange} />
}

/** One object inspector shared by Media and Timeline, including the same stale-draft fences. */
export function XrObjectInspector({ emptyMessage = '' }: { emptyMessage?: string }) {
  const semanticSelection = useGraphStore(state => state.canvasRenderMode === '3d' ? state.graphData?.nodes.find(node => node.id === state.selectedNodeId && node.type === 'semantic-space-entity') : null)
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const hasTarget = runtime.plan.subjects.some(subject => subject.id === runtime.selectedShotTargetId)
    || resolveXrStageObjects(runtime.plan.stageId).some(object => object.id === runtime.selectedShotTargetId)
  if (semanticSelection) return <React.Suspense fallback={<span>Opening object inspector…</span>}><SemanticObjectInspector key={semanticSelection.id} inspectorOnly entityId={String(semanticSelection.properties?.entityId || '')} spaceId={String(semanticSelection.properties?.spaceId || '')} /></React.Suspense>
  return hasTarget ? <XrSubjectTransformEditor /> : emptyMessage ? <p role="status" className="p-2 text-xs opacity-70">{emptyMessage}</p> : null
}

export function TimelineBottomPanelView({ compact = false }: { compact?: boolean }) {
  const sourceContext = useSourceGeospatialContext()
  const sequenceContext = useGraphStore(state => state.canvasRenderMode === '2d' && ['sequence', 'sequenceMermaid'].includes(state.canvas2dRenderer))
  const { available: warehouseTimelineAvailable } = useWarehouseInspectionMode()
  const xrTimelineContext = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const stageAuthority = useGraphStore(state => resolveXrDocumentStageAuthority(state))
  if (sourceContext) return <React.Suspense fallback={<p>Opening source Timeline…</p>}><SourceGeospatialTimelinePanel compact={compact} /></React.Suspense>
  if (warehouseTimelineAvailable) return <React.Suspense fallback={<p>Opening warehouse timeline…</p>}><WarehouseTimelinePanel compact={compact} /></React.Suspense>
  if (xrTimelineContext && !stageAuthority) return <p role="status" className="p-3 text-xs">No authored XR timeline in this document. Add an object from Media or open an XR scene.</p>
  if (xrTimelineContext) return <XrCameraMotionSection />
  if (sequenceContext) return <React.Suspense fallback={<p>Opening sequence timeline…</p>}><SequenceTimeline /></React.Suspense>
  return <MediaTimelineBottomPanelView compact={compact} />
}
