import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildInlineMediaCommandContextFromRecord } from '@/lib/command-menu/inlineMediaCommandContext'
import { resolveMediaPreviewSurfaceCardProps, resolveMediaPreviewSurfaceSelectionProps } from '@/lib/cards/mediaPreviewSurfaceSelection'
import type { GraphNode, JSONValue } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { readSchemaFieldSpecs } from '@/lib/graph/flowPorts'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  FLOW_WIDGET_FORM_ID_KEY,
  FLOW_WIDGET_TYPE_ID_KEY,
  listScopedWidgetRegistryEntries,
  resolveFrontmatterWidgetRegistrySectionState,
} from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import {
  buildFrontmatterWidgetContractModel,
  buildFrontmatterWidgetContractRowSpecs,
} from '@/features/storyboard-widget-manager/frontmatterWidgetContract'
import {
  applyWidgetCompactPreviewTextUpdate,
  buildWidgetCompactPreviewViewModel,
  resolveWidgetCompactPreview,
} from '@/features/storyboard-widget-manager/widgetCompactPreview'
import { readPortHandleUiMetrics } from '@/components/StoryboardWidget/portHandleUi'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import type { GraphEdge } from '@/lib/graph/types'
import { emitStoryboardWidgetInteractionFrame } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import type { RichMediaWidgetPreviewState } from '@/components/StoryboardWidget/useRichMediaWidgetPreview'
import { hashRecordSignature32, hashSignatureParts } from '@/lib/hash/signature'
import {
  buildRichMediaPanelOverlayState,
  buildRichMediaPanelPreviewSpec,
  getRichMediaPanelNodeLabel,
} from '@/lib/render/richMediaSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveChatModelCredentialProjection } from '@/features/chat/floatingPanelChat/floatingPanelChatCredentialContext'
import {
  buildConnectedValuesSemanticSignature,
  buildGraphEdgesSemanticSignature,
  buildWidgetRegistryEntriesSemanticSignature,
  buildWidgetRegistryEntrySemanticSignature,
  cleanDomIdPart,
  pickString,
} from '@/components/StoryboardWidget/widgetEditorFormSemantics'
import { useWidgetEditorCompactPreviewTimelineSync } from '@/components/StoryboardWidget/useWidgetEditorCompactPreviewTimelineSync'
import { WidgetEditorFormContent } from '@/components/StoryboardWidget/WidgetEditorFormContent'
import { useWidgetEditorFrontmatterRows } from '@/components/StoryboardWidget/useWidgetEditorFrontmatterRows'

const EMPTY_GRAPH_EDGES: ReadonlyArray<GraphEdge> = []

export const WidgetEditorForm = React.memo(function WidgetEditorForm({
  active,
  storyboardWidgetSurfaceId,
  pinnedInCanvas,
  node,
  graphMetaKind,
  edges,
  schema,
  hideFields,
  labelInputRef,
  onSetLabel,
  onSetType,
  onPatchProperties,
  onSetProperties,
  onValidate,
  onSchemaPortHandleClick,
  onRenameSchemaFieldId,
  onRegistrySelectionChange,
  connectedValuesBySchemaPath,
  richMediaWidgetPreview,
  registryEntry = null,
  registryEntries = [],
}: {
  active: boolean
  storyboardWidgetSurfaceId?: string
  pinnedInCanvas?: boolean
  node: GraphNode
  graphMetaKind?: string | null
  edges?: ReadonlyArray<GraphEdge>
  schema: GraphSchema | null
  hideFields: boolean
  labelInputRef: React.RefObject<HTMLInputElement>
  onSetLabel: (label: string) => void
  onSetType: (type: string) => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onValidate: () => void
  onSchemaPortHandleClick?: (args: { dir: 'in' | 'out'; portKey: string }) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
  onRegistrySelectionChange?: (args: { entry: WidgetRegistryEntry | null }) => void
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  richMediaWidgetPreview?: RichMediaWidgetPreviewState
  registryEntry?: WidgetRegistryEntry | null
  registryEntries?: ReadonlyArray<WidgetRegistryEntry>
}) {
  const { panelTextClass, microLabelClass, monospaceTextClass, textSizeClass, keyValueInputClass, keyLabelClass } = usePanelTypography()
  const {
    chatProvider,
    chatAuthMode,
    chatApiKey,
    setChatApiKey,
    chatEndpointUrl,
    chatModel,
    selectNode,
    setSelectionSource,
    timelineTransportDocumentKey,
    timelineTransportPosition,
    timelineTransportPlaying,
    timelineTransportPlaybackRate,
    markdownDocumentName,
    graphData,
    graphDataRevision,
  } = useGraphStore(
    useShallow(s => ({
      chatProvider: s.chatProvider,
      chatAuthMode: s.chatAuthMode,
      chatApiKey: s.chatApiKey,
      setChatApiKey: s.setChatApiKey,
      chatEndpointUrl: s.chatEndpointUrl,
      chatModel: s.chatModel,
      selectNode: s.selectNode,
      setSelectionSource: s.setSelectionSource,
      timelineTransportDocumentKey: s.timelineTransportDocumentKey || '',
      timelineTransportPosition: Number.isFinite(s.timelineTransportPosition) ? s.timelineTransportPosition : 0,
      timelineTransportPlaying: s.timelineTransportPlaying === true,
      timelineTransportPlaybackRate: s.timelineTransportPlaybackRate || 1,
      markdownDocumentName: s.markdownDocumentName || '',
      graphData: s.graphData,
      graphDataRevision: s.graphDataRevision || 0,
    })),
  )
  void onSetType
  void onValidate
  const properties = readNodeProperties(node)
  const propertiesSignature = React.useMemo(() => {
    return hashRecordSignature32(properties, { maxEntries: 80, maxDepth: 2 })
  }, [properties])
  const propertiesSnapshotRef = React.useRef<{ key: number; value: Record<string, unknown> } | null>(null)
  if (propertiesSnapshotRef.current?.key !== propertiesSignature) {
    propertiesSnapshotRef.current = {
      key: propertiesSignature,
      value: properties,
    }
  }
  const propertiesSnapshot = propertiesSnapshotRef.current.value
  const propertiesInlineMediaCommandContext = React.useMemo(
    () => buildInlineMediaCommandContextFromRecord(propertiesSnapshot),
    [propertiesSnapshot],
  )
  const nodeTypeId = pickString(node.type).trim()
  const nodeHelperSignature = React.useMemo(() => {
    return hashSignatureParts([
      'widget-editor-form-node',
      String(node.id || '').trim(),
      nodeTypeId,
      String(node.label || '').trim(),
      propertiesSignature,
    ])
  }, [node.id, node.label, nodeTypeId, propertiesSignature])
  const nodeHelperSnapshotRef = React.useRef<{
    key: string
    value: Pick<GraphNode, 'id' | 'type' | 'label' | 'properties'>
  } | null>(null)
  if (nodeHelperSnapshotRef.current?.key !== nodeHelperSignature) {
    nodeHelperSnapshotRef.current = {
      key: nodeHelperSignature,
      value: {
        id: node.id,
        type: node.type,
        label: node.label,
        properties: propertiesSnapshot as Record<string, JSONValue>,
      },
    }
  }
  const nodeHelperSnapshot = nodeHelperSnapshotRef.current.value
  const selectCompactMediaPreviewNode = React.useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const id = String(nodeHelperSnapshot.id || '').trim()
    if (!id) return
    setSelectionSource('editor')
    selectNode(id)
  }, [nodeHelperSnapshot.id, selectNode, setSelectionSource])
  const safeEdges = edges || EMPTY_GRAPH_EDGES
  const edgesSignature = React.useMemo(() => buildGraphEdgesSemanticSignature(safeEdges), [safeEdges])
  const edgesSnapshotRef = React.useRef<{ key: string; value: ReadonlyArray<GraphEdge> } | null>(null)
  if (edgesSnapshotRef.current?.key !== edgesSignature) {
    edgesSnapshotRef.current = {
      key: edgesSignature,
      value: safeEdges,
    }
  }
  const edgesSnapshot = edgesSnapshotRef.current.value
  const registryEntrySignature = React.useMemo(
    () => buildWidgetRegistryEntrySemanticSignature(registryEntry),
    [registryEntry],
  )
  const registryEntrySnapshotRef = React.useRef<{ key: string; value: WidgetRegistryEntry | null } | null>(null)
  if (registryEntrySnapshotRef.current?.key !== registryEntrySignature) {
    registryEntrySnapshotRef.current = {
      key: registryEntrySignature,
      value: registryEntry ?? null,
    }
  }
  const registryEntrySnapshot = registryEntrySnapshotRef.current.value
  const registryEntriesSignature = React.useMemo(
    () => buildWidgetRegistryEntriesSemanticSignature(registryEntries),
    [registryEntries],
  )
  const registryEntriesSnapshotRef = React.useRef<{ key: string; value: ReadonlyArray<WidgetRegistryEntry> } | null>(null)
  if (registryEntriesSnapshotRef.current?.key !== registryEntriesSignature) {
    registryEntriesSnapshotRef.current = {
      key: registryEntriesSignature,
      value: registryEntries,
    }
  }
  const registryEntriesSnapshot = registryEntriesSnapshotRef.current.value
  const connectedValuesSignature = React.useMemo(
    () => buildConnectedValuesSemanticSignature(connectedValuesBySchemaPath),
    [connectedValuesBySchemaPath],
  )
  const connectedValuesSnapshotRef = React.useRef<{
    key: string
    value: FlowConnectedValuesBySchemaPath | undefined
  } | null>(null)
  if (connectedValuesSnapshotRef.current?.key !== connectedValuesSignature) {
    connectedValuesSnapshotRef.current = {
      key: connectedValuesSignature,
      value: connectedValuesBySchemaPath,
    }
  }
  const connectedValuesSnapshot = connectedValuesSnapshotRef.current.value
  const isRichMediaPanelWidget = nodeTypeId === 'RichMediaPanel'
  const widgetCredentialProjection = React.useMemo(() => resolveChatModelCredentialProjection({
    currentNode: node,
    globalProvider: chatProvider,
    globalAuthMode: chatAuthMode,
    globalEndpointUrl: chatEndpointUrl,
    globalModel: chatModel,
    apiKey: chatApiKey || '',
    onApiKeyChange: setChatApiKey,
  }), [chatApiKey, chatAuthMode, chatEndpointUrl, chatModel, chatProvider, node, setChatApiKey])
  const widgetModelSelect = widgetCredentialProjection.modelSelect
  const widgetApiKeyPrompt = widgetCredentialProjection.apiKeyPrompt
  const idBase = React.useMemo(() => {
    const nodeId = cleanDomIdPart(nodeHelperSnapshot.id) || 'node'
    return `flow-node-quick-${nodeId}`
  }, [nodeHelperSnapshot.id])

  const ids = React.useMemo(() => {
    return {
      label: `${idBase}-label`,
      registrySelect: `${idBase}-registry-select`,
      registryField: (fieldKey: string) => `${idBase}-registry-field-${cleanDomIdPart(fieldKey) || 'field'}`,
      paramsJson: `${idBase}-params-json`,
      paramsJsonInput: `${idBase}-params-json-input`,
      portHandle: (portKey: string, dir: 'in' | 'out') => `${idBase}-port-${dir}-${cleanDomIdPart(portKey) || 'port'}`,
    }
  }, [idBase])
  const liveNodeLabel = String(nodeHelperSnapshot.label || '')
  const labelEditInProgressRef = React.useRef(false)
  const [labelDraft, setLabelDraft] = React.useState(liveNodeLabel)
  React.useEffect(() => {
    if (labelEditInProgressRef.current) return
    setLabelDraft(liveNodeLabel)
  }, [liveNodeLabel])
  const commitLabelDraft = React.useCallback((nextDraft?: string) => {
    const nextLabel = typeof nextDraft === 'string' ? nextDraft : labelDraft
    if (nextLabel === liveNodeLabel) return
    onSetLabel(nextLabel)
  }, [labelDraft, liveNodeLabel, onSetLabel])

  const schemaFields = React.useMemo(() => readSchemaFieldSpecs(nodeHelperSnapshot), [nodeHelperSnapshot])
  const isFrontmatterFlow = String(graphMetaKind || '').trim() === 'frontmatter-flow'
  const showRichMediaPanelViewer = isRichMediaPanelWidget && !hideFields
  const showRichMediaPanelKtvRows = isRichMediaPanelWidget && hideFields && !isFrontmatterFlow
  const portHandlesEnabled = Boolean(schema?.behavior?.portHandles?.enabled) || isFrontmatterFlow
  const fallbackRichMediaPanelState = React.useMemo(() => {
    if (!showRichMediaPanelViewer || richMediaWidgetPreview?.richMediaPanelState) return null
    return buildRichMediaPanelOverlayState({
      node: nodeHelperSnapshot as GraphNode,
      connectedValuesBySchemaPath: connectedValuesSnapshot,
    }) || null
  }, [connectedValuesSnapshot, nodeHelperSnapshot, richMediaWidgetPreview?.richMediaPanelState, showRichMediaPanelViewer])
  const richMediaPanelState = richMediaWidgetPreview?.richMediaPanelState || fallbackRichMediaPanelState
  const fallbackRichMediaPreview = React.useMemo(() => {
    if (!showRichMediaPanelViewer || richMediaWidgetPreview?.richMediaPreview || !richMediaPanelState) return null
    return buildRichMediaPanelPreviewSpec({
      node: nodeHelperSnapshot as GraphNode,
      connectedValuesBySchemaPath: connectedValuesSnapshot,
      panel: richMediaPanelState,
    })
  }, [connectedValuesSnapshot, nodeHelperSnapshot, richMediaPanelState, richMediaWidgetPreview?.richMediaPreview, showRichMediaPanelViewer])
  const richMediaPreview = richMediaWidgetPreview?.richMediaPreview || fallbackRichMediaPreview
  const richMediaPanelViewSize = richMediaWidgetPreview?.richMediaPanelViewSize || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE
  const handleRichMediaPanelChange = richMediaWidgetPreview?.handleRichMediaPanelChange
  const handleRichMediaResizeStart = richMediaWidgetPreview?.handleRichMediaResizeStart
  const handleRichMediaResize = richMediaWidgetPreview?.handleRichMediaResize
  const handleRichMediaResizeEnd = richMediaWidgetPreview?.handleRichMediaResizeEnd
  const handleRichMediaContentSize = richMediaWidgetPreview?.handleRichMediaContentSize
  const handleFallbackRichMediaResize = React.useCallback(() => {
    emitStoryboardWidgetInteractionFrame()
  }, [])

  const flowEnvelopeValueBoxClass = React.useMemo(() => {
    return cn(
      textSizeClass,
      'text-left',
      monospaceTextClass,
      UI_THEME_TOKENS.input.bg,
      UI_THEME_TOKENS.input.border,
      UI_THEME_TOKENS.input.text,
    )
  }, [monospaceTextClass, textSizeClass])
  const frontmatterWidgetRegistrySection = React.useMemo(
    () => resolveFrontmatterWidgetRegistrySectionState({
      node: nodeHelperSnapshot,
      registryEntry: registryEntrySnapshot,
      graphMetaKind,
    }),
    [graphMetaKind, nodeHelperSnapshot, registryEntrySnapshot],
  )
  const showFrontmatterWidgetRegistrySection = frontmatterWidgetRegistrySection.visible
  const hideFrontmatterFlowContractRows = frontmatterWidgetRegistrySection.hideFlowContractRows
  const frontmatterWidgetIdentityLabel = frontmatterWidgetRegistrySection.identityLabel
  const frontmatterContract = React.useMemo(() => {
    return buildFrontmatterWidgetContractModel({
      node: nodeHelperSnapshot,
      edges: edgesSnapshot,
      registryEntry: registryEntrySnapshot,
      suppressRegistryBackedDeclaredFields: showFrontmatterWidgetRegistrySection,
    })
  }, [edgesSnapshot, nodeHelperSnapshot, registryEntrySnapshot, showFrontmatterWidgetRegistrySection])
  const flowCompute = frontmatterContract.flowCompute
  const frontmatterContractRowSpecs = React.useMemo(() => {
    return buildFrontmatterWidgetContractRowSpecs(frontmatterContract)
  }, [frontmatterContract])
  const flowDataJson = frontmatterContract.flowDataJson
  const lastFlowDataJsonRef = React.useRef(flowDataJson)
  const [flowDataDraft, setFlowDataDraft] = React.useState(flowDataJson)
  React.useEffect(() => {
    const prev = lastFlowDataJsonRef.current
    lastFlowDataJsonRef.current = flowDataJson
    setFlowDataDraft(cur => (cur === prev ? flowDataJson : cur))
  }, [flowDataJson])
  const { sizePx: dotSizePx, hitSizePx: dotHitPx } = React.useMemo(() => {
    const m = readPortHandleUiMetrics(schema)
    return { sizePx: Math.max(10, m.sizePx), hitSizePx: Math.max(18, m.hitSizePx + 2) }
  }, [schema])
  const registryOptions = React.useMemo(
    () => {
      return listScopedWidgetRegistryEntries({
        node: nodeHelperSnapshot,
        registry: registryEntriesSnapshot,
        graphMetaKind,
      })
    },
    [graphMetaKind, nodeHelperSnapshot, registryEntriesSnapshot],
  )
  const registrySelectionId = registryEntry?.id || ''
  const hasRegistryOptions = registryOptions.length > 0

  const registryOptionIdsSig = React.useMemo(() => {
    return (registryOptions || []).map(e => String(e.id || '')).join('|')
  }, [registryOptions])

  const registryOptionIdSet = React.useMemo(() => {
    const parts = String(registryOptionIdsSig || '').split('|').map(s => s.trim()).filter(Boolean)
    return new Set(parts)
  }, [registryOptionIdsSig])

  React.useEffect(() => {
    if (!active) return
    if (!registrySelectionId) return
    if (registryOptionIdSet.has(registrySelectionId)) return
    onPatchProperties({
      [FLOW_WIDGET_TYPE_ID_KEY]: undefined,
      [FLOW_WIDGET_FORM_ID_KEY]: undefined,
    })
    onRegistrySelectionChange?.({ entry: null })
  }, [active, onPatchProperties, onRegistrySelectionChange, registryOptionIdSet, registrySelectionId])
  const handleRegistrySelect = React.useCallback(
    (nextValue: string) => {
      const nextId = String(nextValue || '').trim()
      if (nextId === registrySelectionId) return
      if (!nextId) {
        onPatchProperties({
          [FLOW_WIDGET_TYPE_ID_KEY]: undefined,
          [FLOW_WIDGET_FORM_ID_KEY]: undefined,
        })
        onRegistrySelectionChange?.({ entry: null })
        return
      }
      const nextEntry = registryOptions.find(entry => entry.id === nextId)
      if (!nextEntry) return
      onPatchProperties({
        [FLOW_WIDGET_TYPE_ID_KEY]: nextEntry.widgetTypeId,
        [FLOW_WIDGET_FORM_ID_KEY]: nextEntry.formId,
      })
      onRegistrySelectionChange?.({ entry: nextEntry })
    },
    [onPatchProperties, onRegistrySelectionChange, registryOptions, registrySelectionId],
  )
  const emitInteractionFrame = React.useCallback(() => {
    emitStoryboardWidgetInteractionFrame()
  }, [])

  const compactPreview = React.useMemo(() => {
    if (!hideFields) return null
    return resolveWidgetCompactPreview({
      node: nodeHelperSnapshot as GraphNode,
      registryEntry: registryEntrySnapshot,
      connectedValuesBySchemaPath: connectedValuesSnapshot,
    })
  }, [connectedValuesSnapshot, hideFields, nodeHelperSnapshot, registryEntrySnapshot])
  const compactPreviewView = React.useMemo(() => {
    return buildWidgetCompactPreviewViewModel({
      preview: compactPreview,
      node: nodeHelperSnapshot,
    })
  }, [compactPreview, nodeHelperSnapshot])
  const compactMediaPreviewSelectionProps = React.useMemo(
    () => resolveMediaPreviewSurfaceSelectionProps({
      enabled: !!compactPreviewView && compactPreviewView.kind !== 'text',
      ariaLabel: compactPreviewView && compactPreviewView.kind !== 'text'
        ? `${String(nodeHelperSnapshot.label || getRichMediaPanelNodeLabel())} media preview`
        : undefined,
      onSelect: selectCompactMediaPreviewNode,
    }),
    [compactPreviewView, nodeHelperSnapshot.label, selectCompactMediaPreviewNode],
  )
  const compactMediaPreviewCardProps = React.useMemo(
    () => resolveMediaPreviewSurfaceCardProps({
      enabled: !!compactPreviewView && compactPreviewView.kind !== 'text',
      interactive: compactPreviewView?.kind === 'video' || compactPreviewView?.kind === 'audio',
    }),
    [compactPreviewView],
  )
  const compactPreviewMediaElementRef = React.useRef<HTMLMediaElement | null>(null)
  const [compactPreviewMediaElement, setCompactPreviewMediaElement] = React.useState<HTMLMediaElement | null>(null)
  const compactPreviewKind = compactPreviewView?.kind || 'text'
  const compactPreviewMediaUrl = compactPreviewView && compactPreviewView.kind !== 'text'
    ? compactPreviewView.mediaUrl
    : ''
  const compactPreviewMediaElementHandler = React.useCallback((element: HTMLMediaElement | null) => {
    compactPreviewMediaElementRef.current = element
    setCompactPreviewMediaElement(prev => (prev === element ? prev : element))
  }, [])
  const { compactPreviewIsPlayableMedia } = useWidgetEditorCompactPreviewTimelineSync({
    compactPreviewKind,
    compactPreviewMediaUrl,
    compactPreviewMediaElementRef,
    compactPreviewMediaElement,
    timelineTransportDocumentKey,
    timelineTransportPosition,
    timelineTransportPlaying,
    timelineTransportPlaybackRate,
    markdownDocumentName,
    graphData,
    graphDataRevision,
  })

  const compactPreviewEditorClass = React.useMemo(() => {
    return cn(
      'w-full h-40 rounded-md border px-2 py-2 overflow-y-auto overflow-x-hidden',
      monospaceTextClass,
      UI_THEME_TOKENS.input.bg,
      UI_THEME_TOKENS.input.border,
      UI_THEME_TOKENS.input.text,
    )
  }, [monospaceTextClass])

  const setCompactPreviewText = React.useCallback((nextText: string) => {
    const nextProperties = applyWidgetCompactPreviewTextUpdate({
      preview: compactPreview,
      properties,
      nextText,
    })
    if (!nextProperties) return
    onSetProperties(nextProperties)
  }, [compactPreview, onSetProperties, properties])

  const { frontmatterPortRows, frontmatterEnvelopeRows } = useWidgetEditorFrontmatterRows({
    active,
    idBase,
    keyLabelClass,
    keyValueInputClass,
    textSizeClass,
    monospaceTextClass,
    dotSizePx,
    dotHitPx,
    portHandlesEnabled,
    onSchemaPortHandleClick,
    frontmatterContractRowSpecs,
    connectedValuesSnapshot,
    propertiesSnapshot,
    flowDataDraft,
    setFlowDataDraft,
    flowCompute,
    flowEnvelopeValueBoxClass,
    propertiesInlineMediaCommandContext,
    onPatchProperties,
    onSetProperties,
  })

  return (
    <WidgetEditorFormContent
      active={active}
      storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
      pinnedInCanvas={pinnedInCanvas}
      node={node}
      nodeHelperSnapshot={nodeHelperSnapshot}
      graphMetaKind={graphMetaKind}
      edgesSnapshot={edgesSnapshot}
      hideFields={hideFields}
      hideFrontmatterFlowContractRows={hideFrontmatterFlowContractRows}
      labelInputRef={labelInputRef}
      labelDraft={labelDraft}
      setLabelDraft={setLabelDraft}
      labelEditInProgressRef={labelEditInProgressRef}
      liveNodeLabel={liveNodeLabel}
      commitLabelDraft={commitLabelDraft}
      onPatchProperties={onPatchProperties}
      onSetProperties={onSetProperties}
      onSchemaPortHandleClick={onSchemaPortHandleClick}
      onRenameSchemaFieldId={onRenameSchemaFieldId}
      properties={properties}
      propertiesSnapshot={propertiesSnapshot}
      propertiesInlineMediaCommandContext={propertiesInlineMediaCommandContext}
      ids={ids}
      idBase={idBase}
      keyValueInputClass={keyValueInputClass}
      textSizeClass={textSizeClass}
      keyLabelClass={keyLabelClass}
      panelTextClass={panelTextClass}
      microLabelClass={microLabelClass}
      monospaceTextClass={monospaceTextClass}
      dotSizePx={dotSizePx}
      dotHitPx={dotHitPx}
      emitInteractionFrame={emitInteractionFrame}
      isRichMediaPanelWidget={isRichMediaPanelWidget}
      widgetApiKeyPrompt={widgetApiKeyPrompt}
      widgetModelSelect={widgetModelSelect}
      showRichMediaPanelViewer={showRichMediaPanelViewer}
      richMediaPanelViewSize={richMediaPanelViewSize}
      richMediaPreview={richMediaPreview}
      richMediaPanelState={richMediaPanelState}
      handleRichMediaResizeStart={handleRichMediaResizeStart}
      handleRichMediaResize={handleRichMediaResize}
      handleRichMediaResizeEnd={handleRichMediaResizeEnd}
      handleRichMediaPanelChange={handleRichMediaPanelChange}
      handleRichMediaContentSize={handleRichMediaContentSize}
      handleFallbackRichMediaResize={handleFallbackRichMediaResize}
      compactPreview={compactPreview}
      compactPreviewView={compactPreviewView}
      compactMediaPreviewSelectionProps={compactMediaPreviewSelectionProps}
      setCompactPreviewText={setCompactPreviewText}
      compactPreviewEditorClass={compactPreviewEditorClass}
      compactMediaPreviewCardProps={compactMediaPreviewCardProps}
      compactPreviewIsPlayableMedia={compactPreviewIsPlayableMedia}
      compactPreviewMediaElementHandler={compactPreviewMediaElementHandler}
      frontmatterPortRows={frontmatterPortRows}
      frontmatterEnvelopeRows={frontmatterEnvelopeRows}
      isFrontmatterFlow={isFrontmatterFlow}
      registrySelectionId={registrySelectionId}
      handleRegistrySelect={handleRegistrySelect}
      hasRegistryOptions={hasRegistryOptions}
      registryOptions={registryOptions}
      showRichMediaPanelKtvRows={showRichMediaPanelKtvRows}
      registryEntrySnapshot={registryEntrySnapshot}
      connectedValuesSnapshot={connectedValuesSnapshot}
      showFrontmatterWidgetRegistrySection={showFrontmatterWidgetRegistrySection}
      frontmatterWidgetIdentityLabel={frontmatterWidgetIdentityLabel}
      portHandlesEnabled={portHandlesEnabled}
      schemaFields={schemaFields}
    />
  )
})
