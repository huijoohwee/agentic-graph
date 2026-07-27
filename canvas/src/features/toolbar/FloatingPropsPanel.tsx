import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { isPropsPanelWidgetPaletteEntry } from '@/features/storyboard-widget-manager/registryTemplates'
import WidgetPalette from '@/features/toolbar/WidgetPalette'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { GroupPanelPaletteAction } from '@/features/toolbar/GroupPanelPaletteAction'

const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []

export function FloatingPropsPanel() {
  const effectiveWidgetRegistry = useGraphStore(s => s.effectiveWidgetRegistry ?? EMPTY_WIDGET_REGISTRY)
  const canvasRenderMode = useGraphStore(s => s.canvasRenderMode)
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const widgetPaletteEntries = React.useMemo(
    () => (Array.isArray(effectiveWidgetRegistry) ? effectiveWidgetRegistry : []).filter(isPropsPanelWidgetPaletteEntry),
    [effectiveWidgetRegistry],
  )
  const storyboardRendererActive = canvasRenderMode === '2d' && canvas2dRenderer === 'storyboard'
  const widgetDragEnabled = storyboardRendererActive && widgetPaletteEntries.length > 0

  return (
    <section
      className={`${UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME} ${UI_THEME_TOKENS.panel.bg}`}
      aria-label="Props Panel"
      data-kg-props-panel-surface="widget-palette"
    >
      {!storyboardRendererActive ? (
        <p className={`px-3 py-2 text-xs ${UI_THEME_TOKENS.text.secondary}`} role="status">
          Switch Canvas View Mode to 2D Renderer: Storyboard to drag widgets onto the canvas.
        </p>
      ) : null}
      <GroupPanelPaletteAction active={storyboardRendererActive} />
      <WidgetPalette entries={widgetPaletteEntries} dragEnabled={widgetDragEnabled} />
    </section>
  )
}
