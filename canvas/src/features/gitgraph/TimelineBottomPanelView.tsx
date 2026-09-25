import React from 'react'
import { GanttTimelineTransportPanel } from './GanttTimelineTransportPanel'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { resolveXrStageObjects } from '@/features/three/xrSceneLibrary'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'

const SemanticObjectInspector = React.lazy(() => import('@/features/xr-v2/SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))

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
  const xrTimelineContext = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const semanticSelection = useGraphStore(state => state.canvasRenderMode === '3d' && state.graphData?.nodes.some(node => node.id === state.selectedNodeId && node.type === 'semantic-space-entity'))
  if (semanticSelection) return <XrObjectInspector />
  if (xrTimelineContext) return <><XrObjectInspector /><XrCameraMotionSection /></>
  return <MediaTimelineBottomPanelView compact={compact} />
}
