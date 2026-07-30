import React from 'react'

import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { useGraphStore } from '@/hooks/useGraphStore'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import {
  beginFlowWidgetPointerDragSession,
  buildFlowWidgetDragPayload,
  clearActiveFlowWidgetPointerDragSession,
  dispatchFlowWidgetPointerDragDropFromSession,
  markFlowWidgetPointerDragNativeStart,
  setFlowWidgetDragDataTransfer,
} from '@/lib/storyboardWidget/widgetDrag'
import FloatingPropsPanelMenuButton from '@/features/toolbar/FloatingPropsPanelMenuButton'
import { uiToolbarColumnMenuListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { WidgetPaletteCardLayoutPreview } from '@/features/toolbar/WidgetPaletteCardLayoutPreview'
import { listWidgetPaletteLayoutVariants } from '@/features/toolbar/widgetPaletteLayoutVariants'
import {
  clearTextSelectionWidgetLinkSession,
  dispatchTextSelectionWidgetCreate,
  getTextSelectionWidgetLinkSnapshot,
  subscribeTextSelectionWidgetLink,
} from '@/lib/storyboardWidget/textSelectionWidgetLink'

export default function WidgetPalette(args: {
  entries: ReadonlyArray<WidgetRegistryEntry>
  dragEnabled: boolean
}) {
  const panelTypography = usePanelTypography()
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME)
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const aspectRatio = useGraphStore(s => s.strybldrStoryboardCardAspectMode === '9:16' ? '9:16' : '16:9')
  const entries = args.entries
  const dragEnabled = args.dragEnabled === true
  const layoutVariants = React.useMemo(
    () => listWidgetPaletteLayoutVariants(entries, aspectRatio),
    [aspectRatio, entries],
  )
  const selectionLinkSession = React.useSyncExternalStore(
    subscribeTextSelectionWidgetLink,
    getTextSelectionWidgetLinkSnapshot,
    getTextSelectionWidgetLinkSnapshot,
  )
  const selectionSummary = React.useMemo(() => {
    const selectedText = String(selectionLinkSession?.selectedText || '').trim()
    if (!selectedText) return ''
    return selectedText.length > 64 ? `${selectedText.slice(0, 61)}…` : selectedText
  }, [selectionLinkSession])

  return (
    <aside
      className="min-h-0 overflow-hidden"
      aria-label="Widget palette"
      data-main-panel-no-drag="true"
    >
      <header className={`px-3 py-2 border-b ${UI_THEME_TOKENS.panel.border}`} aria-label="Palette header">
        <h4 className={`font-semibold ${UI_THEME_TOKENS.text.primary} ${panelTypography.panelTextClass}`}>Widgets</h4>
        <p className={`${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>
          {selectionLinkSession
            ? <>Choose a target Widget to link to “{selectionSummary}”.</>
            : 'Drag a widget, card, or flow-editor layout into the canvas.'}
        </p>
        {selectionLinkSession ? (
          <button
            type="button"
            className={`mt-1 rounded px-2 py-1 ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}
            onClick={clearTextSelectionWidgetLinkSession}
          >
            Cancel link
          </button>
        ) : null}
      </header>
      <nav className="min-h-0 overflow-auto p-2" aria-label="Palette items">
        <menu className={uiToolbarColumnMenuListClassName} aria-label="Widget entries">
          {layoutVariants.length === 0 ? (
            <li className={`px-2 py-2 ${panelTypography.microLabelClass} ${UI_THEME_TOKENS.text.secondary}`}>No enabled entries.</li>
          ) : (
            layoutVariants.map(variant => {
              const { entry, label } = variant
              const linkMode = !!selectionLinkSession
              const disabled = !dragEnabled && !linkMode
              return (
                <li key={variant.id}>
                  <FloatingPropsPanelMenuButton
                    disabled={disabled}
                    draggable={dragEnabled && !linkMode}
                    className="rounded-md p-0"
                    uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
                    uiPanelTextFontClass={uiPanelTextFontClass}
                    ariaLabel={linkMode ? `Create linked ${label}` : `Drag ${label}`}
                    title={linkMode ? `Create and link: ${label}` : `Drag to canvas: ${label}`}
                    onClick={linkMode ? () => {
                      dispatchTextSelectionWidgetCreate({
                        registryEntryId: entry.id,
                        nodeTypeId: entry.nodeTypeId,
                        widgetTypeId: entry.widgetTypeId,
                        formId: entry.formId,
                        layoutVariantId: variant.id,
                      })
                    } : undefined}
                    onPointerDownCapture={(ev) => {
                      if (!dragEnabled || linkMode) return
                      beginFlowWidgetPointerDragSession({
                        registryEntryId: entry.id,
                        nodeTypeId: entry.nodeTypeId,
                        widgetTypeId: entry.widgetTypeId,
                        formId: entry.formId,
                        layoutVariantId: variant.id,
                        label,
                        pointerId: ev.pointerId,
                        clientX: ev.clientX,
                        clientY: ev.clientY,
                      })
                    }}
                    onDragStart={(ev) => {
                      if (!dragEnabled || linkMode) return
                      markFlowWidgetPointerDragNativeStart()
                      const payload = buildFlowWidgetDragPayload({
                        registryEntryId: entry.id,
                        nodeTypeId: entry.nodeTypeId,
                        widgetTypeId: entry.widgetTypeId,
                        formId: entry.formId,
                        layoutVariantId: variant.id,
                      })
                      if (!payload) return
                      setFlowWidgetDragDataTransfer({ dataTransfer: ev.dataTransfer, payload, label })
                    }}
                    onDragEnd={(ev) => {
                      if (dragEnabled && !linkMode) {
                        dispatchFlowWidgetPointerDragDropFromSession({
                          eventType: ev.type,
                          clientX: ev.clientX,
                          clientY: ev.clientY,
                        })
                      }
                      clearActiveFlowWidgetPointerDragSession()
                    }}
                  >
                    <WidgetPaletteCardLayoutPreview variant={variant} />
                  </FloatingPropsPanelMenuButton>
                </li>
              )
            })
          )}
        </menu>
      </nav>
    </aside>
  )
}
