import React from 'react'
import { DESIGN_ICONS } from '@agentic-base/views-react/controls'
import { FloatingPanelTab, FloatingPanelTabs } from '@agentic-base/views-react/panels'
import { FLOATING_PANEL_TYPE_ICON_BY_VIEW } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import type { FloatingPanelView } from '@/hooks/store/store-types/graph-state-chat-import'
import { UI_LABELS } from '@/lib/config'

type FloatingPanelViewTab = Readonly<{
  view: FloatingPanelView
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}>

// Tab availability and order belong to the shell; documents supply only view content.
export const FLOATING_PANEL_VIEW_TABS: readonly FloatingPanelViewTab[] = [
  { view: 'sequence', title: 'Sequence Diagram', icon: DESIGN_ICONS.ListChecks },
  { view: 'propsPanel', title: UI_LABELS.propsPanel, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.propsPanel },
  { view: 'skillsCommands', title: UI_LABELS.skillsCommands, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.skillsCommands },
  { view: 'blockLibrary', title: UI_LABELS.blockLibrary, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.blockLibrary },
  { view: 'promptPresets', title: UI_LABELS.promptPresets, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.promptPresets },
  { view: 'view', title: UI_LABELS.view, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.view },
  { view: 'preview', title: UI_LABELS.previewPanel, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.preview },
  { view: 'media', title: 'Media', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.media },
  { view: 'animation', title: 'Animation', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.animation },
  { view: 'motionControl', title: UI_LABELS.motionControl, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.motionControl },
  { view: 'gameMode', title: UI_LABELS.gameMode, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gameMode },
  { view: 'flightSim', title: UI_LABELS.flightSim, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.flightSim },
  { view: 'cityBuilder', title: UI_LABELS.cityBuilder, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.cityBuilder },
  { view: 'camera', title: 'Camera', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.camera },
  { view: 'design', title: 'Design', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.design },
  { view: 'chat', title: UI_LABELS.chat, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.chat },
  { view: 'console', title: 'Console', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.console },
  { view: 'geo', title: UI_LABELS.geo, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.geo },
  { view: 'renderer', title: UI_LABELS.renderer, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.renderer },
  { view: 'storyboardWidget', title: 'Storyboard Widget', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.storyboardWidget },
  { view: 'flowchart', title: 'Flowchart', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.flowchart },
  { view: 'gitGraph', title: UI_LABELS.gitGraph, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gitGraph },
  { view: 'gantt', title: UI_LABELS.gantt, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.gantt },
  { view: 'timeline', title: UI_LABELS.timeline, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.timeline },
  { view: 'architecture', title: 'Architecture', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.architecture },
  { view: 'eventModeling', title: 'Event Model', icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.eventModeling },
  { view: 'graphTraversal', title: UI_LABELS.graphTraversal, icon: FLOATING_PANEL_TYPE_ICON_BY_VIEW.graphTraversal },
]

export function FloatingPanelViewTabs({ view, onSelect, children, minimized = false }: {
  view: FloatingPanelView
  onSelect: (view: FloatingPanelView) => void
  children?: React.ReactNode
  minimized?: boolean
}) {
  const selectView = (key: string) => {
    const selected = FLOATING_PANEL_VIEW_TABS.find(tab => tab.view === key)?.view
    if (selected) onSelect(selected)
  }

  return (
    <FloatingPanelTabs label="Floating panel views" activeKey={view} onSelect={selectView}>
      {FLOATING_PANEL_VIEW_TABS.filter(spec => !minimized || spec.view === view).map(spec => {
        return (
          <FloatingPanelTab
            key={spec.view}
            tabKey={spec.view}
            label={spec.title}
            icon={spec.icon}
            iconOnly={!minimized}
            dataAttributes={{ 'data-kg-floating-panel-view-trigger': spec.view }}
          />
        )
      })}
      {!minimized && children}
    </FloatingPanelTabs>
  )
}
