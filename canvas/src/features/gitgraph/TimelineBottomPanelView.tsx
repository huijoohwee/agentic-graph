import React from 'react'
import { GanttTimelineTransportPanel } from './GanttTimelineTransportPanel'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { XrCameraMotionSection } from '@/features/three/XrCameraMotionSection'

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

  if (xrTimelineContext) return <XrCameraMotionSection />

  return <MediaTimelineBottomPanelView compact={compact} />
}
