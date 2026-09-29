import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_LABELS } from '@/lib/config'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { cn } from '@/lib/utils'
import GraphFieldsView from '@/features/panels/views/GraphFieldsView'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { MultiDimTableSurface } from '@/features/markdown-workspace/main/viewer/MultiDimTableSurface'
import {
  UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME,
  UI_RESPONSIVE_FLOW_MANAGER_TABLE_FRAME_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  GRAPH_FIELDS_COMMAND_ENTRY_LABELS,
  WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS,
} from '@/features/panels/views/graph-fields/graphFieldsEntryCommands'

export default function StoryboardWidgetGraphTab({
  searchQuery,
  workflowMode = false,
  requestedEntryLabel,
  requestedEntryToken,
}: {
  searchQuery: string
  workflowMode?: boolean
  requestedEntryLabel?: string
  requestedEntryToken?: number
}) {
  const panelTypography = usePanelTypography()
  const graphData = useGraphStore(s => s.graphData)
  const graphFieldsStatusNoop = React.useCallback((_msg: string) => {
    void _msg
  }, [])
  const workspaceEditorMode = React.useSyncExternalStore(
    workspaceTablePreferencesStore.subscribe,
    () => workspaceTablePreferencesStore.getSnapshot().workspaceEditorMode,
    () => workspaceTablePreferencesStore.getServerSnapshot().workspaceEditorMode,
  )
  const multiDimTableView = workspaceEditorMode === 'multiDimTable'

  const nodeCount = Array.isArray(graphData?.nodes) ? graphData!.nodes.length : 0
  const edgeCount = Array.isArray(graphData?.edges) ? graphData!.edges.length : 0
  const clusterCount = React.useMemo(() => (graphData ? deriveGraphGroups(graphData).length : 0), [graphData])

  const [entryOpenRequest, setEntryOpenRequest] = React.useState<{ token: number; entryLabel: string } | null>(null)
  const entryOpenTokenRef = React.useRef(0)
  const openEntryInFieldSettings = React.useCallback((entryLabel: string) => {
    entryOpenTokenRef.current += 1
    setEntryOpenRequest({ token: entryOpenTokenRef.current, entryLabel })
  }, [])
  React.useEffect(() => {
    const nextEntryLabel = String(requestedEntryLabel || '').trim()
    if (!nextEntryLabel || !requestedEntryToken) return
    setEntryOpenRequest({
      token: requestedEntryToken,
      entryLabel: nextEntryLabel,
    })
  }, [requestedEntryLabel, requestedEntryToken])

  if (workflowMode) {
    return (
      <section className="h-full min-h-0 flex flex-col" aria-label={UI_LABELS.storyboardWidgetGraph}>
        <main className="flex-1 min-h-0 overflow-hidden" aria-label="Workflow manager">
          <section className={`${UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME} min-h-0 h-full overflow-hidden`}>
            {multiDimTableView ? (
              <section className={cn(UI_RESPONSIVE_FLOW_MANAGER_TABLE_FRAME_CLASSNAME, UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME, 'overflow-hidden')}>
                <MultiDimTableSurface active ariaLabel="Workflow Multi-dimensional Table" />
              </section>
            ) : (
              <section className={cn(UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME, 'h-full min-h-0 overflow-hidden border-0 p-0')}>
                <GraphFieldsView
                  onStatusChange={graphFieldsStatusNoop}
                  searchQuery={searchQuery}
                  embedded={true}
                  entryOpenRequest={entryOpenRequest}
                  entryShortcutLabels={WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS}
                  onEntryShortcutClick={openEntryInFieldSettings}
                />
              </section>
            )}
          </section>
        </main>
      </section>
    )
  }

  return (
    <section className="h-full min-h-0 flex flex-col" aria-label={UI_LABELS.storyboardWidgetGraph}>
      <header className={cn(UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_CLASSNAME, UI_RESPONSIVE_FLOW_MANAGER_PANEL_HEADER_ROW_CLASSNAME, UI_THEME_TOKENS.panel.border)}>
        <section className="min-w-0" aria-label="Summary">
          <output className={cn(panelTypography.panelTextClass, 'block truncate', UI_THEME_TOKENS.text.secondary)}>
            {UI_LABELS.nodesLabel} {nodeCount} · {UI_LABELS.edgesLabel} {edgeCount} · {UI_LABELS.graphLayersMode} {clusterCount}
          </output>
        </section>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden" aria-label="Graph content">
        <section className={`${UI_RESPONSIVE_FLOW_MANAGER_PANEL_BODY_CLASSNAME} h-full min-h-0`} aria-label="Graph manager">
          <section className={cn(UI_RESPONSIVE_FLOW_MANAGER_PANEL_FRAME_CLASSNAME, 'min-h-0 h-full overflow-hidden border-0 p-0')} aria-label="Graph Fields and Field Settings">
            <section className="h-full min-h-0 overflow-hidden">
              {multiDimTableView ? (
                <MultiDimTableSurface active ariaLabel="Workflow Multi-dimensional Table" />
              ) : (
                <GraphFieldsView
                  onStatusChange={graphFieldsStatusNoop}
                  searchQuery={searchQuery}
                  embedded={true}
                  entryOpenRequest={entryOpenRequest}
                  entryShortcutLabels={GRAPH_FIELDS_COMMAND_ENTRY_LABELS}
                  onEntryShortcutClick={openEntryInFieldSettings}
                />
              )}
            </section>
          </section>
        </section>
      </main>
    </section>
  )
}
