import { cn } from '@/lib/utils'
import './widgetSelectionChrome.css'

export const WIDGET_SELECTION_SURFACE_CLASS_NAME = 'kg-widget-selection-surface'

export const getStoryboardWidgetPanelChromeClassName = (panelTextClass?: string): string => cn(
  'rounded-md border flex flex-col relative bg-[var(--kg-media-panel-bg)] border-[color:var(--kg-border)] text-[color:var(--kg-text-primary)]',
  WIDGET_SELECTION_SURFACE_CLASS_NAME,
  panelTextClass || '',
)

export const getStoryboardWidgetPanelSelectionChromeClassName = (selected: boolean): string => (
  selected ? 'kg-widget-selection-outline' : ''
)

export const getStoryboardWidgetPanelSurfaceChromeClassName = (args: {
  className?: string
  panelTextClass?: string
  selected: boolean
}): string => [
  cn(getStoryboardWidgetPanelChromeClassName(args.panelTextClass), args.className || ''),
  getStoryboardWidgetPanelSelectionChromeClassName(args.selected),
].filter(Boolean).join(' ')
