import React from 'react'
import RichMediaPanel from '@/components/RichMediaPanel'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor'
import { ChatModelCredentialControls } from '@/features/chat/ChatModelCredentialControls'
import { WidgetEditorBeatByBeatSection } from '@/components/StoryboardWidget/WidgetEditorBeatByBeatSection'
import { WidgetEditorKvTable, type WidgetEditorKvRow } from '@/components/StoryboardWidget/WidgetEditorKvTable'
import { WidgetEditorParamsSection } from '@/components/StoryboardWidget/WidgetEditorParamsSection'
import { WidgetEditorRegistrySection } from '@/components/StoryboardWidget/WidgetEditorRegistrySection'
import { WidgetEditorSchemaTable } from '@/components/StoryboardWidget/WidgetEditorSchemaTable'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { RichMediaWidgetPreviewState } from '@/components/StoryboardWidget/useRichMediaWidgetPreview'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import { getRichMediaPanelNodeLabel } from '@/lib/render/richMediaSsot'
import { FLOW_SCHEMA_FIELDS_PROPERTY_KEY } from '@/lib/graph/flowPorts'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  handleWidgetInnerPanelScrollCapture,
  handleWidgetInnerPanelWheelCapture,
} from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { PANEL_FRAME_EMBEDDED_SURFACE_STYLE } from '@/lib/ui/panelFrame'
import type { SharedChatModelSelect } from '@/features/chat/chatModelCredentialResolver'
import type { WidgetCompactPreviewViewModel } from '@/features/storyboard-widget-manager/widgetCompactPreview'
import type { ImageToThreeJsRenderMode } from '@/features/image-to-threejs/imageToThreeJsContract'

type WidgetEditorFormContentProps = {
  active: boolean
  storyboardWidgetSurfaceId?: string
  pinnedInCanvas?: boolean
  node: GraphNode
  nodeHelperSnapshot: Pick<GraphNode, 'id' | 'type' | 'label' | 'properties'>
  graphMetaKind?: string | null
  edgesSnapshot: ReadonlyArray<GraphEdge>
  hideFields: boolean
  hideFrontmatterFlowContractRows: boolean
  labelInputRef: React.RefObject<HTMLInputElement>
  labelDraft: string
  setLabelDraft: React.Dispatch<React.SetStateAction<string>>
  labelEditInProgressRef: React.MutableRefObject<boolean>
  liveNodeLabel: string
  commitLabelDraft: (nextDraft?: string) => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onSchemaPortHandleClick?: (args: { dir: 'in' | 'out'; portKey: string }) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
  properties: Record<string, unknown>
  propertiesSnapshot: Record<string, unknown>
  propertiesInlineMediaCommandContext: string
  ids: {
    label: string
    registrySelect: string
    registryField: (fieldKey: string) => string
    paramsJson: string
    paramsJsonInput: string
  }
  idBase: string
  keyValueInputClass: string
  textSizeClass: string
  keyLabelClass: string
  panelTextClass: string
  microLabelClass: string
  monospaceTextClass: string
  dotSizePx: number
  dotHitPx: number
  emitInteractionFrame: () => void
  isRichMediaPanelWidget: boolean
  widgetApiKeyPrompt: {
    providerLabel: string
    credentialLabel: string
    value: string
    onChange: (value: string) => void
  } | null
  widgetModelSelect: SharedChatModelSelect
  showRichMediaPanelViewer: boolean
  richMediaPanelViewSize: { width: number; height: number }
  richMediaPreview: {
    url?: string
    srcDoc?: string
    openUrl?: string
    kind?: 'iframe' | 'image' | 'video' | 'audio' | 'svg' | 'model'
    interactive?: boolean
    renderMode?: ImageToThreeJsRenderMode
  } | null
  richMediaPanelState: RichMediaWidgetPreviewState['richMediaPanelState'] | null | undefined
  handleRichMediaResizeStart?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  handleRichMediaResize?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  handleRichMediaResizeEnd?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  handleRichMediaPanelChange?: (patch: Record<string, unknown>) => void
  handleRichMediaContentSize?: (next: { width: number; height: number }) => void
  handleFallbackRichMediaResize: (args?: { pointerId?: number; clientX?: number; clientY?: number; dx?: number; dy?: number }) => void
  compactPreview: unknown
  compactPreviewView: WidgetCompactPreviewViewModel | null
  compactMediaPreviewSelectionProps: Record<string, unknown>
  setCompactPreviewText: (nextText: string) => void
  compactPreviewEditorClass: string
  compactMediaPreviewCardProps: Record<string, unknown> & { interactive?: boolean }
  compactPreviewIsPlayableMedia: boolean
  compactPreviewMediaElementHandler: (element: HTMLMediaElement | null) => void
  frontmatterPortRows: WidgetEditorKvRow[]
  frontmatterEnvelopeRows: WidgetEditorKvRow[]
  isFrontmatterFlow: boolean
  registrySelectionId: string
  handleRegistrySelect: (event: React.ChangeEvent<HTMLSelectElement>) => void
  hasRegistryOptions: boolean
  registryOptions: ReadonlyArray<WidgetRegistryEntry>
  showRichMediaPanelKtvRows: boolean
  registryEntrySnapshot: WidgetRegistryEntry | null
  connectedValuesSnapshot?: FlowConnectedValuesBySchemaPath
  showFrontmatterWidgetRegistrySection: boolean
  frontmatterWidgetIdentityLabel: string
  portHandlesEnabled: boolean
  schemaFields: ReturnType<typeof import('@/lib/graph/flowPorts').readSchemaFieldSpecs>
}

export function WidgetEditorFormContent(props: WidgetEditorFormContentProps) {
  const {
    active,
    storyboardWidgetSurfaceId,
    pinnedInCanvas,
    node,
    nodeHelperSnapshot,
    graphMetaKind,
    edgesSnapshot,
    hideFields,
    hideFrontmatterFlowContractRows,
    labelInputRef,
    labelDraft,
    setLabelDraft,
    labelEditInProgressRef,
    liveNodeLabel,
    commitLabelDraft,
    onPatchProperties,
    onSetProperties,
    onSchemaPortHandleClick,
    onRenameSchemaFieldId,
    properties,
    propertiesSnapshot,
    propertiesInlineMediaCommandContext,
    ids,
    idBase,
    keyValueInputClass,
    textSizeClass,
    keyLabelClass,
    panelTextClass,
    microLabelClass,
    monospaceTextClass,
    dotSizePx,
    dotHitPx,
    emitInteractionFrame,
    isRichMediaPanelWidget,
    widgetApiKeyPrompt,
    widgetModelSelect,
    showRichMediaPanelViewer,
    richMediaPanelViewSize,
    richMediaPreview,
    richMediaPanelState,
    handleRichMediaResizeStart,
    handleRichMediaResize,
    handleRichMediaResizeEnd,
    handleRichMediaPanelChange,
    handleRichMediaContentSize,
    handleFallbackRichMediaResize,
    compactPreview,
    compactPreviewView,
    compactMediaPreviewSelectionProps,
    setCompactPreviewText,
    compactPreviewEditorClass,
    compactMediaPreviewCardProps,
    compactPreviewIsPlayableMedia,
    compactPreviewMediaElementHandler,
    frontmatterPortRows,
    frontmatterEnvelopeRows,
    isFrontmatterFlow,
    registrySelectionId,
    handleRegistrySelect,
    hasRegistryOptions,
    registryOptions,
    showRichMediaPanelKtvRows,
    registryEntrySnapshot,
    connectedValuesSnapshot,
    showFrontmatterWidgetRegistrySection,
    frontmatterWidgetIdentityLabel,
    portHandlesEnabled,
    schemaFields,
  } = props

  return (
    <form
      data-kg-media-scroll-surface="1"
      className={cn(UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME, 'py-0', 'px-3', panelTextClass)}
      aria-label={UI_LABELS.flowWidgetForm}
      onSubmit={e => e.preventDefault()}
      onScrollCapture={() => handleWidgetInnerPanelScrollCapture(emitInteractionFrame)}
      onWheelCapture={e => handleWidgetInnerPanelWheelCapture(e, emitInteractionFrame)}
    >
      <section className="min-w-0" aria-label={UI_LABELS.flowWidgetNodeLegend}>
        <WidgetEditorKvTable
          ariaLabel={UI_LABELS.flowWidgetNodeLegend}
          microLabelClass={microLabelClass}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          forcePortDots
          rows={[{
            rowKey: 'node-label',
            labelId: `${idBase}-kv-node-label`,
            keyNode: <label className={cn(keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={ids.label}>label</label>,
            valueNode: (
              <input
                ref={labelInputRef}
                id={ids.label}
                className={cn(keyValueInputClass, textSizeClass, 'text-left', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                value={labelDraft}
                onFocus={() => { labelEditInProgressRef.current = true }}
                onChange={e => setLabelDraft(String(e.target.value || ''))}
                onBlur={e => {
                  labelEditInProgressRef.current = false
                  const nextLabel = String(e.currentTarget.value || '')
                  setLabelDraft(nextLabel)
                  commitLabelDraft(nextLabel)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const nextLabel = String(e.currentTarget.value || '')
                    labelEditInProgressRef.current = false
                    setLabelDraft(nextLabel)
                    commitLabelDraft(nextLabel)
                    e.currentTarget.blur()
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    labelEditInProgressRef.current = false
                    setLabelDraft(liveNodeLabel)
                    e.currentTarget.blur()
                  }
                }}
                disabled={!active}
              />
            ),
          }]}
        />
      </section>

      {!isRichMediaPanelWidget && (
        <section className="min-w-0 mt-4 space-y-1" aria-label={`Model for flow widget ${String(nodeHelperSnapshot.label || nodeHelperSnapshot.id || '')}`}>
          <p className={cn('m-0 text-[10px] font-semibold uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary)}>{UI_COPY.chatModelSelectLabel}</p>
          <ChatModelCredentialControls
            apiKeyPrompt={widgetApiKeyPrompt}
            modelId={widgetModelSelect.modelId}
            modelOptions={widgetModelSelect.options}
            onModelChanged={nextModel => onPatchProperties({ chatModel: nextModel })}
            disabled={!active}
            uiPanelMicroLabelTextSizeClass={microLabelClass}
          />
        </section>
      )}

      {showRichMediaPanelViewer && (
        <section
          data-kg-widget-body="1"
          data-kg-rich-media-render-surface="1"
          data-kg-rich-media-scroll-owner="panel"
          data-kg-media-scroll-surface="1"
          className="relative min-h-0 mt-4 overflow-y-auto overflow-x-hidden"
          style={{ width: `${richMediaPanelViewSize.width}px`, maxWidth: '100%', height: `${richMediaPanelViewSize.height}px`, overscrollBehaviorX: 'none', overscrollBehaviorY: 'contain', pointerEvents: 'auto', scrollbarGutter: 'stable' }}
        >
          <RichMediaPanel
            overlayId={String(nodeHelperSnapshot.id || '')}
            title={String(nodeHelperSnapshot.label || getRichMediaPanelNodeLabel())}
            url={richMediaPreview?.url || ''}
            srcDoc={richMediaPreview?.srcDoc}
            openUrl={richMediaPreview?.openUrl || richMediaPreview?.url || ''}
            kind={richMediaPreview?.kind || 'iframe'}
            renderMode={richMediaPreview?.renderMode}
            interactive={richMediaPreview?.interactive !== false}
            resizable={true}
            onResizeStart={handleRichMediaResizeStart || handleFallbackRichMediaResize}
            onResize={handleRichMediaResize || handleFallbackRichMediaResize}
            onResizeEnd={handleRichMediaResizeEnd || handleFallbackRichMediaResize}
            panel={richMediaPanelState || undefined}
            widgetToolbarActive={false}
            onPanelChange={handleRichMediaPanelChange}
            frameMode="surface"
            scrollOwner="panel"
            storyboardWidgetInteractionMode={true}
            storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
            headerPinned={pinnedInCanvas === true}
            storyboardWidgetFrontmatterDocumentMode={isFrontmatterFlow}
            onInlineContentSize={handleRichMediaContentSize}
            style={PANEL_FRAME_EMBEDDED_SURFACE_STYLE}
          />
        </section>
      )}

      {compactPreview && compactPreviewView && (
        <section className="min-w-0 mt-4" aria-label={compactPreviewView.sectionAriaLabel}>
          <section className={cn('w-full overflow-hidden rounded-lg border', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border)} data-kg-widget-preview-kind={compactPreviewView.kind} {...compactMediaPreviewSelectionProps}>
            {compactPreviewView.kind === 'text' ? (
              <CardInlineTextEditor
                value={compactPreviewView.textValue}
                ariaLabel={compactPreviewView.textAriaLabel}
                placeholder="Add preview text"
                canEdit={active && !compactPreviewView.readOnly}
                editActivation="click"
                multiline
                rows={6}
                markdownPreview="auto"
                markdownCommandContextText={propertiesInlineMediaCommandContext}
                editorSurface="viewer"
                inlineChipDensity="compact"
                openOnPointerDown
                onCommit={setCompactPreviewText}
                displayClassName={compactPreviewEditorClass}
                editorClassName={compactPreviewEditorClass}
              />
            ) : (
              <CardMediaPreview
                kind={compactPreviewView.kind}
                renderMode={compactPreviewView.kind === 'image' ? compactPreviewView.renderMode : undefined}
                url={compactPreviewView.mediaUrl}
                title={compactPreviewView.kind === 'image' ? compactPreviewView.mediaAlt : String(nodeHelperSnapshot.label || getRichMediaPanelNodeLabel())}
                {...compactMediaPreviewCardProps}
                fit="contain"
                className="block h-48 w-full"
                mediaClassName="block h-48 w-full"
                videoControls={compactMediaPreviewCardProps.interactive && compactPreviewView.kind === 'video'}
                onMediaElement={compactPreviewIsPlayableMedia ? compactPreviewMediaElementHandler : undefined}
              />
            )}
          </section>
        </section>
      )}

      {hideFields && isFrontmatterFlow && !hideFrontmatterFlowContractRows && frontmatterPortRows.length > 0 && (
        <section className="min-w-0 mt-4" aria-label="Flow Handles">
          <WidgetEditorKvTable ariaLabel="Flow Handles" microLabelClass={microLabelClass} dotSizePx={dotSizePx} dotHitPx={dotHitPx} forcePortDots rows={frontmatterPortRows} />
        </section>
      )}

      {!hideFields && isFrontmatterFlow && !hideFrontmatterFlowContractRows && (
        <section className="min-w-0 mt-4" aria-label="Flow Envelope">
          <WidgetEditorKvTable ariaLabel="Flow Envelope" microLabelClass={microLabelClass} dotSizePx={dotSizePx} dotHitPx={dotHitPx} forcePortDots rows={frontmatterEnvelopeRows} />
        </section>
      )}

      {!isFrontmatterFlow && !isRichMediaPanelWidget && (
        <section className="min-w-0 mt-4" aria-label={UI_LABELS.storyboardWidgetMapping}>
          <WidgetEditorKvTable
            ariaLabel={UI_LABELS.storyboardWidgetMapping}
            microLabelClass={microLabelClass}
            dotSizePx={dotSizePx}
            dotHitPx={dotHitPx}
            forcePortDots
            rows={[{
              rowKey: 'mapping-registry',
              labelId: `${idBase}-kv-mapping-registry`,
              keyNode: <label className={cn(keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={ids.registrySelect}>{UI_LABELS.flowWidget}</label>,
              valueNode: (
                <select
                  id={ids.registrySelect}
                  className={cn(keyValueInputClass, textSizeClass, 'text-left', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                  value={registrySelectionId}
                  onChange={handleRegistrySelect}
                  disabled={!active || !hasRegistryOptions}
                >
                  <option value="">{hasRegistryOptions ? UI_COPY.flowWidgetSelectPlaceholder : UI_LABELS.noneLabel}</option>
                  {registryOptions.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
                </select>
              ),
            }]}
          />
        </section>
      )}

      {!isRichMediaPanelWidget && (
        <WidgetEditorBeatByBeatSection node={node} graphMetaKind={graphMetaKind} edges={edgesSnapshot} microLabelClass={microLabelClass} monospaceTextClass={monospaceTextClass} compact={hideFields} />
      )}

      {showRichMediaPanelKtvRows && registryEntrySnapshot && (
        <WidgetEditorRegistrySection
          active={active}
          properties={propertiesSnapshot}
          registryEntry={registryEntrySnapshot}
          microLabelClass={microLabelClass}
          monospaceTextClass={monospaceTextClass}
          textSizeClass={textSizeClass}
          keyValueInputClass={keyValueInputClass}
          keyLabelClass={keyLabelClass}
          ids={{ registryField: ids.registryField }}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          portHandlesEnabled={portHandlesEnabled}
          portHandlesVisible={false}
          connectedValuesBySchemaPath={connectedValuesSnapshot}
          onSetProperties={onSetProperties}
          onSchemaPortHandleClick={onSchemaPortHandleClick}
          showFieldRows
          showPortRows
          showTableHeader
        />
      )}

      {showFrontmatterWidgetRegistrySection && registryEntrySnapshot && (
        <>
          <section className="min-w-0 mt-4" aria-label={UI_LABELS.flowWidget}>
            <WidgetEditorKvTable
              ariaLabel={UI_LABELS.flowWidget}
              microLabelClass={microLabelClass}
              dotSizePx={dotSizePx}
              dotHitPx={dotHitPx}
              forcePortDots
              rows={[{
                rowKey: 'frontmatter-widget-identity',
                labelId: `${idBase}-kv-frontmatter-widget-identity`,
                keyNode: <label className={cn(keyLabelClass, UI_THEME_TOKENS.text.secondary)} htmlFor={`${idBase}-frontmatter-widget-identity`}>{UI_LABELS.flowWidget}</label>,
                valueNode: (
                  <PlainTextInputEditor
                    id={`${idBase}-frontmatter-widget-identity`}
                    value={frontmatterWidgetIdentityLabel}
                    disabled
                    readOnly
                    className={cn(keyValueInputClass, textSizeClass, 'text-left', UI_THEME_TOKENS.input.bg, UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.text)}
                  />
                ),
              }]}
            />
          </section>
          <WidgetEditorRegistrySection
            active={active}
            properties={propertiesSnapshot}
            registryEntry={registryEntrySnapshot}
            microLabelClass={microLabelClass}
            monospaceTextClass={monospaceTextClass}
            textSizeClass={textSizeClass}
            keyValueInputClass={keyValueInputClass}
            keyLabelClass={keyLabelClass}
            ids={{ registryField: ids.registryField }}
            dotSizePx={dotSizePx}
            dotHitPx={dotHitPx}
            portHandlesEnabled={portHandlesEnabled}
            connectedValuesBySchemaPath={connectedValuesSnapshot}
            onSetProperties={onSetProperties}
            onSchemaPortHandleClick={onSchemaPortHandleClick}
            showFieldRows
            showPortRows
          />
        </>
      )}

      {!isRichMediaPanelWidget && !isFrontmatterFlow && hideFields && registryEntrySnapshot && (
        <WidgetEditorRegistrySection
          active={active}
          properties={propertiesSnapshot}
          registryEntry={registryEntrySnapshot}
          microLabelClass={microLabelClass}
          monospaceTextClass={monospaceTextClass}
          textSizeClass={textSizeClass}
          keyValueInputClass={keyValueInputClass}
          keyLabelClass={keyLabelClass}
          ids={{ registryField: ids.registryField }}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          portHandlesEnabled={portHandlesEnabled}
          connectedValuesBySchemaPath={connectedValuesSnapshot}
          onSetProperties={onSetProperties}
          onSchemaPortHandleClick={onSchemaPortHandleClick}
          showFieldRows={false}
          showPortRows
        />
      )}

      {!isRichMediaPanelWidget && !isFrontmatterFlow && !hideFields && registryEntrySnapshot && (
        <WidgetEditorRegistrySection
          active={active}
          properties={propertiesSnapshot}
          registryEntry={registryEntrySnapshot}
          microLabelClass={microLabelClass}
          monospaceTextClass={monospaceTextClass}
          textSizeClass={textSizeClass}
          keyValueInputClass={keyValueInputClass}
          keyLabelClass={keyLabelClass}
          ids={{ registryField: ids.registryField }}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          portHandlesEnabled={portHandlesEnabled}
          connectedValuesBySchemaPath={connectedValuesSnapshot}
          onSetProperties={onSetProperties}
          onSchemaPortHandleClick={onSchemaPortHandleClick}
          showPortRows={!isFrontmatterFlow}
        />
      )}

      {!isRichMediaPanelWidget && !isFrontmatterFlow && !hideFields && (
        <WidgetEditorParamsSection
          active={active}
          properties={properties}
          microLabelClass={microLabelClass}
          monospaceTextClass={monospaceTextClass}
          textSizeClass={textSizeClass}
          keyValueInputClass={keyValueInputClass}
          keyLabelClass={keyLabelClass}
          ids={{ paramsJson: ids.paramsJson, paramsJsonInput: ids.paramsJsonInput }}
          dotSizePx={dotSizePx}
          dotHitPx={dotHitPx}
          onPatchProperties={onPatchProperties}
        />
      )}

      {!isRichMediaPanelWidget && !isFrontmatterFlow && (schemaFields.length > 0 || (registryEntrySnapshot?.widgetTypeId || '').toLowerCase().includes('schema')) && (
        <section className="min-w-0 mt-4" aria-label={UI_LABELS.flowWidgetSchemaLegend}>
          <WidgetEditorSchemaTable
            active={active}
            schemaFields={schemaFields}
            portHandlesEnabled={portHandlesEnabled}
            dotSizePx={dotSizePx}
            dotHitPx={dotHitPx}
            microLabelClass={microLabelClass}
            textSizeClass={textSizeClass}
            keyValueInputClass={keyValueInputClass}
            onSchemaPortHandleClick={onSchemaPortHandleClick}
            onRenameSchemaFieldId={onRenameSchemaFieldId}
            onCommitSchemaFields={next => onPatchProperties({ [FLOW_SCHEMA_FIELDS_PROPERTY_KEY]: next })}
          />
        </section>
      )}
    </form>
  )
}
