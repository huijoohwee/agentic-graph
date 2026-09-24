import React from 'react'
import { GanttTimelineTransportPanel } from './GanttTimelineTransportPanel'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'
import { XrSubjectTransformEditor } from '@/features/three/XrSubjectTransformEditor'

const SemanticObjectInspector = React.lazy(() => import('@/features/xr-v2/SemanticSpacePanel').then(module => ({ default: module.SemanticSpacePanel })))

function MediaTimelineBottomPanelView({ compact }: { compact: boolean }) {
  const { code: mediaGanttCode, ganttModel, graphData } = useMermaidGanttDocument({ purpose: 'media' })
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({ graphData, diagramModel: ganttModel, kind: 'gantt' })
  return <GanttTimelineTransportPanel code={mediaGanttCode} compact={compact} mode="media" onSelectedRowKeyChange={handleDiagramSelectedRowKeyChange} />
}

export function TimelineBottomPanelView({
  compact = false,
}: {
  compact?: boolean
}) {
  const xrTimelineContext = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')

  const semanticSelection = useGraphStore(state => state.canvasRenderMode === '3d' ? state.graphData?.nodes.find(node => node.id === state.selectedNodeId && node.type === 'semantic-space-entity') : null)
  if (semanticSelection) return <React.Suspense fallback={<span>Opening object inspector…</span>}><SemanticObjectInspector key={semanticSelection.id} inspectorOnly entityId={String(semanticSelection.properties?.entityId || '')} spaceId={String(semanticSelection.properties?.spaceId || '')} /></React.Suspense>

  if (xrTimelineContext) return <><XrSubjectTransformEditor /><XrCameraMotionSection /></>

  return <MediaTimelineBottomPanelView compact={compact} />
}
