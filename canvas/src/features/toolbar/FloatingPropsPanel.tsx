import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { isPropsPanelWidgetPaletteEntry } from '@/features/storyboard-widget-manager/registryTemplates'
import WidgetPalette from '@/features/toolbar/WidgetPalette'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { GroupPanelPaletteAction } from '@/features/toolbar/GroupPanelPaletteAction'

import { useAgentRunWorkspace } from '@/features/agent-ready/agentRunInspectionStore'
const DashboardPropsPanel = React.lazy(() => import('@/components/DashboardCanvas/DashboardPropsPanel'))

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
  const storyboardRendererActive = canvasRenderMode === '2d' && canvas2dRenderer === 'storyboard'
  const widgetDragEnabled = storyboardRendererActive && widgetPaletteEntries.length > 0

  if (inspection || (canvasRenderMode === '2d' && canvas2dRenderer === 'dashboard')) return <section aria-label="Props Panel"><React.Suspense fallback={<p>Loading widgets…</p>}><DashboardPropsPanel /></React.Suspense></section>

  return (
    <section
      className={`${UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME} ${UI_THEME_TOKENS.panel.bg}`}
      aria-label="Props Panel"
      data-kg-props-panel-surface="widget-palette"
    >
      {!storyboardRendererActive ? (
        <p className={`px-3 py-2 text-xs ${UI_THEME_TOKENS.text.secondary}`} role="status">
          Switch 2D Mode to 2D Renderer: Storyboard to drag widgets onto the canvas.
        </p>
      ) : null}
      <GroupPanelPaletteAction active={storyboardRendererActive} />
      <WidgetPalette entries={widgetPaletteEntries} dragEnabled={widgetDragEnabled} />
    </section>
  )
}
