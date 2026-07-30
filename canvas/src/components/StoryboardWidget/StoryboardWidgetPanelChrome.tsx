import React from 'react'

import IconButton from '@/components/IconButton'
import { PinToggleIconButton } from '@/components/PinToggleIconButton'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { getIconSizeClass } from '@/lib/ui'
import { UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { shouldStoryboardWidgetHeaderYieldToInteractiveTarget } from '@/components/StoryboardWidget/storyboardWidgetHeaderInteractiveTarget'
import { CheckCircle, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'

export const STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME =
  'min-w-0 flex-1 truncate text-[12px] font-semibold leading-4 text-[color:var(--kg-text-primary)]'

export function StoryboardWidgetPanelChromeHeader(props: {
  active: boolean
  title: React.ReactNode
  titleContent?: React.ReactNode
  minimized?: boolean
  hideFields?: boolean
  showFieldToggle?: boolean
  showPinToggle?: boolean
  showValidate?: boolean
  showMinimizeToggle?: boolean
  actionsAriaLabel?: string
  pinned?: boolean
  headerClassName?: string
  microLabelClass?: string
  uiIconScale?: 'compact' | 'default'
  uiIconStrokeWidth?: number
  richMediaHeader?: boolean
  dragHandle?: boolean
  onHeaderPointerDown?: (event: React.PointerEvent<HTMLElement>) => void
  onHeaderMouseDown?: (event: React.MouseEvent<HTMLElement>) => void
  onValidate?: () => void
  onToggleHideFields?: () => void
  onToggleMinimized?: () => void
  onTogglePinned?: (event: React.MouseEvent) => void
  onPinnedPointerDown?: (event: React.PointerEvent) => void
}) {
  const {
    active,
    title,
    titleContent,
    minimized = false,
    hideFields = false,
    showFieldToggle = true,
    showPinToggle = true,
    showValidate = true,
    showMinimizeToggle = true,
    actionsAriaLabel,
    pinned = false,
    headerClassName = '',
    microLabelClass = '',
    uiIconScale,
    uiIconStrokeWidth = 1.8,
    richMediaHeader = false,
    dragHandle = true,
    onHeaderPointerDown,
    onHeaderMouseDown,
    onValidate,
    onToggleHideFields,
    onToggleMinimized,
    onTogglePinned,
    onPinnedPointerDown,
  } = props
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const richMediaHeaderStyle: React.CSSProperties | undefined = richMediaHeader ? {
    height: 'var(--kg-media-panel-header-h, 28px)',
    minHeight: 'var(--kg-media-panel-header-h, 28px)',
    maxHeight: 'var(--kg-media-panel-header-h, 28px)',
    flex: '0 0 var(--kg-media-panel-header-h, 28px)',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--kg-media-panel-padding, 6px)',
    background: 'var(--kg-media-panel-header-bg, var(--kg-media-panel-bg, var(--kg-panel-bg, rgba(255,255,255,0.96))))',
    overflow: 'hidden',
  } : undefined
  const richMediaHeaderInnerStyle: React.CSSProperties | undefined = richMediaHeader ? {
    width: '100%',
    minWidth: 0,
    height: '100%',
  } : undefined
  const richMediaNavStyle: React.CSSProperties | undefined = richMediaHeader ? {
    flex: '0 0 auto',
    gap: 'max(1px, calc(var(--kg-media-panel-padding, 6px) * 0.35))',
  } : undefined
  const richMediaActionStyle: React.CSSProperties | undefined = richMediaHeader ? {
    width: 'max(12px, calc(var(--kg-media-panel-header-h, 28px) - 4px))',
    minWidth: 'max(12px, calc(var(--kg-media-panel-header-h, 28px) - 4px))',
    height: 'max(12px, calc(var(--kg-media-panel-header-h, 28px) - 4px))',
    minHeight: 'max(12px, calc(var(--kg-media-panel-header-h, 28px) - 4px))',
    padding: 0,
    borderRadius: 'calc(var(--kg-media-panel-radius, 10px) * 0.42)',
  } : undefined
  const richMediaIconStyle: React.CSSProperties | undefined = richMediaHeader ? {
    width: 'max(8px, calc(var(--kg-media-panel-header-h, 28px) * 0.46))',
    height: 'max(8px, calc(var(--kg-media-panel-header-h, 28px) * 0.46))',
  } : undefined
  const hasValidateAction = showValidate && typeof onValidate === 'function'
  const hasFieldToggleAction = showFieldToggle && typeof onToggleHideFields === 'function'
  const hasMinimizeAction = showMinimizeToggle && typeof onToggleMinimized === 'function'
  const hasPinAction = showPinToggle && typeof onTogglePinned === 'function'
  const hasHeaderActions = hasValidateAction || hasFieldToggleAction || hasMinimizeAction || hasPinAction
  const stopHeaderControlPointerDown = React.useCallback((event: React.PointerEvent) => {
    try {
      event.stopPropagation()
    } catch {
      void 0
    }
  }, [])
  const handleHeaderPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (shouldStoryboardWidgetHeaderYieldToInteractiveTarget(event.target)) return
    onHeaderPointerDown?.(event)
  }, [onHeaderPointerDown])
  const handleHeaderMouseDown = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (shouldStoryboardWidgetHeaderYieldToInteractiveTarget(event.target)) return
    onHeaderMouseDown?.(event)
  }, [onHeaderMouseDown])

  return (
    <header
      className={cn(
        'relative z-10 flex-none',
        'border-b',
        UI_THEME_TOKENS.panel.border,
        dragHandle ? 'cursor-move' : 'cursor-default',
        'select-none',
        minimized ? `px-2 py-0 ${UI_RESPONSIVE_PANEL_HEADER_ROW_CLASSNAME}` : 'px-3 py-2',
        headerClassName,
      )}
      style={richMediaHeaderStyle}
      data-kg-flow-node-drag-handle={dragHandle ? 'true' : undefined}
      data-kg-canvas-overlay-drag-handle={dragHandle ? 'true' : undefined}
      data-kg-rich-media-storyboard-widget-header={richMediaHeader ? '1' : undefined}
      onPointerDown={handleHeaderPointerDown}
      onMouseDown={handleHeaderMouseDown}
    >
      <section
        className={cn('flex items-center justify-between gap-2', minimized ? 'h-full' : '')}
        style={richMediaHeaderInnerStyle}
        aria-label="Node editor header"
      >
        <section className="min-w-0 flex-1" aria-label="Node title">
          {titleContent || <h3
              className={cn(STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME, minimized ? microLabelClass : '')}
            >{title}</h3>}
        </section>

        {hasHeaderActions ? (
        <nav className="flex items-center gap-1" style={richMediaNavStyle} aria-label={actionsAriaLabel || UI_LABELS.flowWidget}>
          {hasValidateAction ? <IconButton
            title={UI_LABELS.flowWidgetValidate}
            tooltipContent={UI_LABELS.flowWidgetValidate}
            showTooltip
            disabled={!active}
            onPointerDown={stopHeaderControlPointerDown}
            onClick={onValidate}
            className="App-toolbar__btn"
            style={richMediaActionStyle}
          >
            <CheckCircle className={iconSizeClass} style={richMediaIconStyle} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          </IconButton> : null}

          {hasFieldToggleAction ? (
            <IconButton
              title={hideFields ? UI_LABELS.showFields : UI_LABELS.hideFields}
              tooltipContent={hideFields ? UI_COPY.flowWidgetShowFields : UI_COPY.flowWidgetHideFields}
              showTooltip
              disabled={!active}
              onPointerDown={stopHeaderControlPointerDown}
              onClick={onToggleHideFields}
              className={cn('App-toolbar__btn', hideFields ? UI_THEME_TOKENS.icon.active : '')}
              style={richMediaActionStyle}
            >
              {hideFields ? (
                <ChevronDown className={iconSizeClass} style={richMediaIconStyle} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              ) : (
                <ChevronUp className={iconSizeClass} style={richMediaIconStyle} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
              )}
            </IconButton>
          ) : null}

          {hasMinimizeAction ? <IconButton
            title={minimized ? UI_LABELS.restorePanel : UI_LABELS.minimizePanel}
            tooltipContent={minimized ? UI_COPY.flowWidgetRestore : UI_COPY.flowWidgetMinimize}
            showTooltip
            disabled={!active}
            onPointerDown={stopHeaderControlPointerDown}
            onClick={onToggleMinimized}
            className="App-toolbar__btn"
            style={richMediaActionStyle}
          >
            {minimized ? (
              <Maximize2 className={iconSizeClass} style={richMediaIconStyle} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            ) : (
              <Minimize2 className={iconSizeClass} style={richMediaIconStyle} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            )}
          </IconButton> : null}

          {hasPinAction ? (
            <PinToggleIconButton
              title={pinned ? UI_LABELS.unpinPanel : UI_LABELS.pinPanel}
              tooltipContent={pinned ? UI_COPY.flowWidgetUnpin : UI_COPY.flowWidgetPin}
              pinned={pinned}
              showTooltip
              disabled={!active}
              onPointerDown={onPinnedPointerDown}
              onClick={onTogglePinned}
              style={richMediaActionStyle}
              iconClassName={iconSizeClass}
              activeIconClassName={UI_THEME_TOKENS.icon.active}
              iconStyle={richMediaIconStyle}
              strokeWidth={uiIconStrokeWidth}
            />
          ) : null}
        </nav>
        ) : null}
      </section>
    </header>
  )
}
