import type React from 'react'
import { CardMediaEmptyPlaceholder, CardMediaLoadingSkeleton } from '@/lib/cards/CardMediaPreview'
import { CardMediaDropZoneFrame } from '@/lib/cards/CardMediaDropZone'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { CARD_TEXT_SURFACE_COLUMN_CLASS_NAME, CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_SCROLL_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME, CARD_TEXT_SURFACE_VIEW_CLASS_NAME } from '@/lib/cards/cardTextSurfaceFrame'
import { commitRichMediaInlineEditVersion } from '@/features/history/richMediaInlineEditHistory'
import { RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID } from '@/lib/render/richMediaOutputVersions'
import { UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME, UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES } from '@/lib/ui/surfaceClasses'
import { cn } from '@/lib/utils'
import { RichMediaOutputVersionSelector } from './RichMediaOutputVersionSelector'
import { RichMediaPanelWorkspaceViewerSurface } from './RichMediaPanelWorkspaceViewerSurface'
import type { RichMediaPanelProps } from './RichMediaPanel.types'
import type { RichMediaPanelModel } from './useRichMediaPanelModel'

export function RichMediaPanelTextSurface(args: {
  model: RichMediaPanelModel
  props: RichMediaPanelProps
}) {
  const { model, props } = args
  const wrapWithMediaDropZone = (children: React.ReactNode) => (
    props.onMediaDrop ? (
      <CardMediaDropZoneFrame
        ariaLabel={`Media drop zone for ${model.title}`}
        className={UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME}
        dataAttributes={{
          'data-kg-rich-media-media-drop-zone': '1',
          'data-kg-rich-media-panel-id': String(props.overlayId || ''),
        }}
        onDropMedia={props.onMediaDrop}
      >
        {children}
      </CardMediaDropZoneFrame>
    ) : children
  )
  if (model.showPanelTextSurface) {
    const textSurface = (
      <section
        aria-label="Rich media text surface"
        data-kg-rich-media-markdown-preview="1"
        data-kg-rich-media-inline-edit={model.panelTextEditable ? '1' : undefined}
        data-kg-rich-media-card-text-frame="1"
        data-kg-canvas-wheel-ignore="true"
        data-kg-media-scroll-surface="1"
        className={CARD_TEXT_SURFACE_COLUMN_CLASS_NAME}
        style={{
          borderColor: 'var(--kg-border)',
          overscrollBehaviorX: 'none',
          overscrollBehaviorY: 'contain',
          pointerEvents: 'auto',
          touchAction: 'pan-y',
        }}
        {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}
        onPointerDownCapture={model.panelTextEditable ? event => event.stopPropagation() : undefined}
        onWheelCapture={model.panelTextEditable ? event => event.stopPropagation() : undefined}
      >
        {!model.showStoryboardWidgetChrome ? (
          <RichMediaOutputVersionSelector
            panel={props.panel}
            onPanelChange={props.onPanelChange}
            placement="body"
          />
        ) : null}
        <section
          className={props.panel?.markdownWorkspaceViewerSurface === true ? 'flex min-h-0 flex-1 overflow-hidden' : CARD_TEXT_SURFACE_SCROLL_CLASS_NAME}
          data-kg-canvas-pointer-ignore="true"
          data-kg-canvas-wheel-ignore="true"
          data-kg-media-scroll-surface="1"
          data-kg-rich-media-card-text-scroll="1"
        >
          {props.panel?.markdownWorkspaceViewerSurface === true ? (
            <RichMediaPanelWorkspaceViewerSurface model={model} props={props} />
          ) : (
            <CardInlineTextEditor
              value={model.panelDisplayText}
              ariaLabel={`${model.title} text`}
              placeholder="Add text"
              canEdit={model.panelTextEditable}
              editActivation="click"
              multiline
              displayLineClamp="none"
              rows={8}
              markdownPreview={props.panel?.markdownPresentationMode === true ? true : 'auto'}
              markdownPresentationMode={props.panel?.markdownPresentationMode === true}
              markdownDocumentPath={model.panelMarkdownDocumentPath}
              markdownCommandMenus={model.panelTextEditable}
              editorSurface="viewer"
              inlineChipDensity="compact"
              openOnPointerDown
              showCommandLaunchers={false}
              markdownCommandContextText={model.panelMarkdownCommandContextText}
              onCommit={model.panelTextEditable ? nextValue => {
                const nextText = String(nextValue || '')
                commitRichMediaInlineEditVersion({
                  currentText: model.panelDisplayText,
                  nextText,
                  commit: () => {
                    model.setPanelDraftText(nextText)
                    props.onPanelChange?.({
                      activeTab: 'text',
                      freezeConnectedOutput: true,
                      text: nextText,
                      ...((props.panel?.outputVersions?.length || 0) > 0
                        ? { selectedOutputVersionId: RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID }
                        : {}),
                    })
                  },
                })
              } : undefined}
              displayClassName={cn(CARD_TEXT_SURFACE_VIEW_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
              editorClassName={cn(CARD_TEXT_SURFACE_EDIT_CLASS_NAME, CARD_TEXT_SURFACE_TEXT_CLASS_NAME)}
            />
          )}
        </section>
      </section>
    )
    return model.panelTextEditable ? wrapWithMediaDropZone(textSurface) : textSurface
  }
  if (model.panelIsLoading) {
    return (
      <CardMediaLoadingSkeleton
        label={model.panelLoadingLabel}
        variant={model.loadingSkeletonVariant}
        richMediaDataAttrs
      />
    )
  }
  if (model.isEmptyPanel) {
    return wrapWithMediaDropZone(
      <CardMediaEmptyPlaceholder
        variant={model.expectedEmptyPlaceholderVariant}
        richMediaDataAttrs
      />,
    )
  }
  return null
}
