import { PanelTabHeader } from 'agentic-design-system/react/panels'
import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { isPropsPanelWidgetPaletteEntry } from '@/features/storyboard-widget-manager/registryTemplates'
import WidgetPalette from '@/features/toolbar/WidgetPalette'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { GroupPanelPaletteAction } from '@/features/toolbar/GroupPanelPaletteAction'

import { useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
const DashboardWidgetPalette = React.lazy(() => import('@/components/DashboardCanvas/DashboardWidgetPalette'))

const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []

export function FloatingPropsPanel() {
  const inspection = useAgentRunWorkspace()
  const effectiveWidgetRegistry = useGraphStore(s => s.effectiveWidgetRegistry ?? EMPTY_WIDGET_REGISTRY)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const widgetPaletteEntries = React.useMemo(
    () => (Array.isArray(effectiveWidgetRegistry) ? effectiveWidgetRegistry : []).filter(isPropsPanelWidgetPaletteEntry),
    [effectiveWidgetRegistry],
  )
  const storyboardRendererActive = !inspection && canvasRenderMode === '2d' && canvas2dRenderer === 'storyboard'
  const widgetDragEnabled = storyboardRendererActive && widgetPaletteEntries.length > 0

  const dashboardActive = !!inspection || (canvasRenderMode === '2d' && canvas2dRenderer === 'dashboard')

  return (
    <section
      className="agentic-panel-tab-layout"
      aria-label="Props Panel"
      data-kg-props-panel-surface="widget-palette"
    >
      <PanelTabHeader title="Props Panel" />
      <div className="agentic-panel-tab-body">
        {!storyboardRendererActive && !dashboardActive ? (
          <p className={UI_THEME_TOKENS.text.secondary} role="status">
            Switch 2D Mode to 2D Renderer: Storyboard to drag widgets onto the canvas.
          </p>
        ) : null}
        <section aria-label="Props sections">
          <GroupPanelPaletteAction active={storyboardRendererActive} />
          <WidgetPalette entries={widgetPaletteEntries} dragEnabled={widgetDragEnabled} dashboardActive={dashboardActive}>
            {dashboardActive && <React.Suspense fallback={<li>Loading widgets…</li>}><DashboardWidgetPalette /></React.Suspense>}
          </WidgetPalette>
        </section>
      </div>
    </section>
  )
}
