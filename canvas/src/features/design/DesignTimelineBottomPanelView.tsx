import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildDesignAgentVideoArtifact } from '@/features/design/designAgentVideoSpec'
import { useActiveGraphData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'

export function DesignTimelineBottomPanelView({ compact = false }: { compact?: boolean }) {
  const graphData = useActiveGraphData()
  const { graphDataRevision, selectedNodeIds } = useGraphStore(
    useShallow(state => ({
      graphDataRevision: state.graphDataRevision || 0,
      selectedNodeIds: Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [],
    })),
  )
  const artifact = React.useMemo(() => buildDesignAgentVideoArtifact({
    graphData, graphRevision: graphDataRevision, selectedNodeIds, title: 'Design HTML Video Render',
  }), [graphData, graphDataRevision, selectedNodeIds])
  const code = React.useMemo(() => [
    'gantt', '  title Video Sequence', '  dateFormat HH:mm', '  axisFormat %M:%S', '  section Video',
    ...artifact.manifest.timelineTracks.map((track, index) =>
      `  ${track.label.replace(/[\r\n:]/g, ' ')} : design_${index}, kgpos_${track.startMs / 60000}, ${track.durationMs / 60000}m`),
  ].join('\n'), [artifact])
  return <section aria-label="Design video timeline bottom panel" data-kg-design-timeline-bottom-panel="1">
    <GanttTimelineTransportPanel code={code} compact={compact} mode="media" editable={false}
      commandAdapter={READ_ONLY_GANTT_TIMELINE_COMMAND_ADAPTER} clockActive publishPlaybackRequest={false} runtimeDocumentKey={`design:${artifact.semanticKey}`}
      runtimeDurationSeconds={artifact.renderSpec.durationMs / 1000} runtimeFrameRate={artifact.renderSpec.fps} />
  </section>
}
