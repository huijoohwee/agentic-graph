import type { GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { applyConnectedValuesToNodeForRender, hasConnectedValuesBySchemaPath } from '@/lib/render/effectiveMediaNode'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { isImageToThreeJsOutputPanel } from '@/features/image-to-threejs/imageToThreeJsContract'
import { isImageToGlbOutputPanel } from '@/features/image-to-glb/imageToGlbContract'
import { readNodeFieldBoolean, readNodeFieldString } from '@/lib/canvas/graph-elements/mediaSpecNodeFields'
import { normalizeXrSceneMediaDragProjection, type XrSceneMediaDragProjection } from '@/lib/ui/mediaDragPayload'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import {
  resolveRichMediaTextOutputVersionSelection,
  type RichMediaTextOutputVersion,
} from '@/lib/render/richMediaOutputVersions'

export type RichMediaPanelTab = 'auto' | 'text' | 'image' | 'video' | 'audio' | 'model' | 'poi'

export type RichMediaPanelOverlayState = {
  activeTab: RichMediaPanelTab
  freezeConnectedOutput: boolean
  markdownPresentationMode: boolean
  markdownWorkspaceViewerSurface?: boolean
  hasText: boolean
  hasImage: boolean
  hasVideo: boolean
  hasAudio: boolean
  hasModel: boolean
  hasPoi: boolean
  text: string
  connectedText: string
  outputVersions: RichMediaTextOutputVersion[]
  selectedOutputVersionId: string
  isLoading: boolean
  loadingLabel: string
  xrScene?: XrSceneMediaDragProjection
}

const RICH_MEDIA_CONNECTED_RENDER_PATHS = [
  'properties.output',
  'properties.outputSrcDoc',
  'properties.imageUrl',
  'properties.videoUrl',
  'properties.audioUrl',
  'properties.modelUrl',
] as const

function readLoadingStateFromNode(node: GraphNode | null | undefined): { loading: boolean; kind: 'text' | 'image' | 'video' | 'audio' | 'model' | '' } {
  if (!node) return { loading: false, kind: '' }
  const props = (node.properties || {}) as Record<string, unknown>
  const loading = readNodeFieldBoolean(node, props, 'outputLoading')
  if (!loading) return { loading: false, kind: '' }
  const runSignal = readNodeFieldString(node, props, 'lastRunAt')
  if (!runSignal) return { loading: false, kind: '' }
  const kindRaw = readNodeFieldString(node, props, 'outputLoadingKind').toLowerCase()
  const kind = kindRaw === 'text' || kindRaw === 'image' || kindRaw === 'video' || kindRaw === 'audio' || kindRaw === 'model' ? kindRaw : ''
  return { loading: true, kind }
}

function loadingLabelFromKind(kind: 'text' | 'image' | 'video' | 'audio' | 'model' | ''): string {
  if (kind === 'text') return 'Generating text...'
  if (kind === 'image') return 'Generating image...'
  if (kind === 'video') return 'Generating video...'
  if (kind === 'audio') return 'Generating audio...'
  if (kind === 'model') return 'Generating GLB...'
  return 'Generating output...'
}

export function normalizeConnectedTextValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const parts = value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    return parts.join('\n').trim()
  }
  return ''
}

export function resolveRichMediaPanelDisplayText(
  panel: (Pick<RichMediaPanelOverlayState, 'freezeConnectedOutput' | 'text' | 'connectedText'> & {
    outputVersions?: ReadonlyArray<Pick<RichMediaTextOutputVersion, 'id' | 'output'>>
    selectedOutputVersionId?: string
  }) | null | undefined,
  draftText = '',
): string {
  if (!panel) return ''
  const selectedVersion = panel.outputVersions?.find(version => version.id === panel.selectedOutputVersionId)
  if (selectedVersion) return selectedVersion.output
  return panel.freezeConnectedOutput
    ? draftText || panel.text || panel.connectedText || ''
    : panel.connectedText || panel.text || ''
}

export function buildStaticRichMediaPanelOverlayState(args: {
  renderKind?: unknown
  activeTab?: unknown
  text?: unknown
  connectedText?: unknown
  isLoading?: unknown
  loadingLabel?: unknown
}): RichMediaPanelOverlayState {
  const renderKind = String(args.renderKind || '').trim().toLowerCase()
  const requestedTab = String(args.activeTab || '').trim().toLowerCase()
  const activeTab: RichMediaPanelOverlayState['activeTab'] =
    requestedTab === 'text' || requestedTab === 'image' || requestedTab === 'video' || requestedTab === 'audio' || requestedTab === 'model' || requestedTab === 'poi' || requestedTab === 'auto'
      ? (requestedTab as RichMediaPanelOverlayState['activeTab'])
      : renderKind === 'image' || renderKind === 'svg'
        ? 'image'
        : renderKind === 'video'
          ? 'video'
          : renderKind === 'audio'
            ? 'audio'
            : renderKind === 'model'
              ? 'model'
            : 'auto'
  const text = normalizeConnectedTextValue(args.text)
  const connectedText = normalizeConnectedTextValue(args.connectedText)
  const loadingLabel = typeof args.loadingLabel === 'string' ? args.loadingLabel.trim() : ''
  return {
    activeTab,
    freezeConnectedOutput: false,
    markdownPresentationMode: false,
    hasText: Boolean(text || connectedText),
    hasImage: renderKind === 'image' || renderKind === 'svg',
    hasVideo: renderKind === 'video',
    hasAudio: renderKind === 'audio',
    hasModel: renderKind === 'model',
    hasPoi: activeTab === 'poi',
    text,
    connectedText,
    outputVersions: [],
    selectedOutputVersionId: '',
    isLoading: args.isLoading === true,
    loadingLabel,
  }
}

function deriveRichMediaPanelLoadingSourceLabels(args: {
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  nodeById?: ReadonlyMap<string, GraphNode>
}): { hasSources: boolean; loading: boolean; kind: 'text' | 'image' | 'video' | 'audio' | 'model' | ''; sourceLabels: string[] } {
  const connectedValuesBySchemaPath = args.connectedValuesBySchemaPath
  const nodeById = args.nodeById
  if (!connectedValuesBySchemaPath || !nodeById) return { hasSources: false, loading: false, kind: '', sourceLabels: [] }
  const seenSourceIds = new Set<string>()
  const sourceLabels: string[] = []
  let hasSources = false
  let kind: 'text' | 'image' | 'video' | 'audio' | 'model' | '' = ''
  let loading = false
  for (let idx = 0; idx < RICH_MEDIA_CONNECTED_RENDER_PATHS.length; idx += 1) {
    const path = RICH_MEDIA_CONNECTED_RENDER_PATHS[idx]
    const rec = connectedValuesBySchemaPath[path]
    const sources = Array.isArray(rec?.sources) ? rec.sources : []
    for (let i = 0; i < sources.length; i += 1) {
      const sourceId = String(sources[i]?.nodeId || '').trim()
      if (!sourceId || seenSourceIds.has(sourceId)) continue
      seenSourceIds.add(sourceId)
      const sourceNode = nodeById.get(sourceId) || null
      if (!sourceNode) continue
      hasSources = true
      const next = readLoadingStateFromNode(sourceNode)
      if (!next.loading) continue
      loading = true
      if (!kind && next.kind) kind = next.kind
      const label = String(sourceNode?.label || sourceNode?.id || '').trim()
      if (label) sourceLabels.push(label)
    }
  }
  return { hasSources, loading, kind, sourceLabels }
}

export function resolveRichMediaPanelRenderNode(args: {
  node: GraphNode
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): GraphNode {
  const baseNode = args.node
  if (isMarkerOwnedImageDerivedOutputPanel(baseNode)) return baseNode
  const connectedValuesBySchemaPath = args.connectedValuesBySchemaPath
  if (!hasConnectedValuesBySchemaPath(connectedValuesBySchemaPath)) return baseNode
  return applyConnectedValuesToNodeForRender({ node: baseNode, connectedValuesBySchemaPath })
}

export function isMarkerOwnedImageDerivedOutputPanel(node: GraphNode): boolean {
  const properties = (node.properties || {}) as Record<string, unknown>
  return isImageToThreeJsOutputPanel(properties) || isImageToGlbOutputPanel(properties)
}

export function buildRichMediaPanelOverlayState(args: {
  node: GraphNode
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  nodeById?: ReadonlyMap<string, GraphNode>
  renderNode?: GraphNode
}): RichMediaPanelOverlayState | undefined {
  const baseNode = args.node
  if (String(baseNode.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return undefined
  const connectedValuesBySchemaPath = isMarkerOwnedImageDerivedOutputPanel(baseNode)
    ? undefined
    : args.connectedValuesBySchemaPath
  const nodeForState = args.renderNode || resolveRichMediaPanelRenderNode({ node: baseNode, connectedValuesBySchemaPath })
  const props = (nodeForState.properties || {}) as Record<string, unknown>
  const output = readNodeFieldString(nodeForState, props, 'output')
  const outputVersionSelection = resolveRichMediaTextOutputVersionSelection({
    properties: (baseNode.properties || {}) as Record<string, unknown>,
    fallbackOutput: output,
  })
  const outputSrcDoc = readNodeFieldString(nodeForState, props, 'outputSrcDoc')
  const hasOutputVersions = outputVersionSelection.versions.length > 0
  const text = outputSrcDoc.trim() && !hasOutputVersions ? '' : outputVersionSelection.selectedOutput
  const imageUrl = readNodeFieldString(nodeForState, props, 'imageUrl')
  const imageToThreeJsOutputSourceUrl = isImageToThreeJsOutputPanel(props)
    ? readNodeFieldString(nodeForState, props, 'outputSourceUrl')
    : ''
  const videoUrl = readNodeFieldString(nodeForState, props, 'videoUrl')
  const audioUrl = readNodeFieldString(nodeForState, props, 'audioUrl')
  const modelUrl = readNodeFieldString(nodeForState, props, 'modelUrl')
    || readNodeFieldString(nodeForState, props, 'model')
    || readNodeFieldString(nodeForState, props, 'glbUrl')
    || readNodeFieldString(nodeForState, props, 'glb')
  const genericMediaUrl = readNodeFieldString(nodeForState, props, 'mediaUrl')
    || readNodeFieldString(nodeForState, props, 'media_url')
  const genericMediaKind = (
    readNodeFieldString(nodeForState, props, 'mediaKind')
    || readNodeFieldString(nodeForState, props, 'media_kind')
  ).toLowerCase()
  const hasGenericImage = Boolean(genericMediaUrl.trim()) && (genericMediaKind === 'image' || genericMediaKind === 'svg')
  const hasGenericVideo = Boolean(genericMediaUrl.trim()) && genericMediaKind === 'video'
  const hasGenericAudio = Boolean(genericMediaUrl.trim()) && genericMediaKind === 'audio'
  const hasGenericModel = Boolean(genericMediaUrl.trim()) && genericMediaKind === 'model'
  const poiLabel = readNodeFieldString(nodeForState, props, 'richMediaPoiLabel')
  const poiAddress = readNodeFieldString(nodeForState, props, 'richMediaPoiAddress')
  const poiCategory = readNodeFieldString(nodeForState, props, 'richMediaPoiCategory')
  const poiCoordinates = readNodeFieldString(nodeForState, props, 'richMediaPoiCoordinates')
  const rawTab = readNodeFieldString(nodeForState, props, 'richMediaActiveTab').toLowerCase()
  const activeTab: RichMediaPanelOverlayState['activeTab'] =
    rawTab === 'text' || rawTab === 'image' || rawTab === 'video' || rawTab === 'audio' || rawTab === 'model' || rawTab === 'poi' || rawTab === 'auto'
      ? (rawTab as RichMediaPanelOverlayState['activeTab'])
      : 'auto'
  const freezeConnectedOutput = readNodeFieldBoolean(nodeForState, props, 'freezeConnectedOutput')
  const markdownPresentationMode = readNodeFieldBoolean(nodeForState, props, 'markdownPresentationMode')
  const markdownWorkspaceViewerSurface = readNodeFieldBoolean(nodeForState, props, 'markdownWorkspaceViewerSurface')
    || readNodeFieldBoolean(nodeForState, props, 'probeTreeThreadLedger')
  const localLoading = readLoadingStateFromNode(nodeForState)
  const connectedText = normalizeConnectedTextValue(connectedValuesBySchemaPath?.['properties.output']?.value)
  const connectedLoading = deriveRichMediaPanelLoadingSourceLabels({
    connectedValuesBySchemaPath,
    nodeById: args.nodeById,
  })
  // Connected producer state is authoritative. This also backfills panels left with a
  // stale local loading flag after the producer has already committed terminal output.
  const isLoading = connectedLoading.hasSources
    ? connectedLoading.loading
    : localLoading.loading && !connectedText
  const loadingKind = localLoading.kind || connectedLoading.kind
  const customLoadingLabel = typeof props.outputLoadingLabel === 'string' ? props.outputLoadingLabel.trim() : ''
  const loadingLabel = customLoadingLabel || (connectedLoading.sourceLabels.length > 0
    ? `${loadingLabelFromKind(loadingKind)} (${connectedLoading.sourceLabels.join(', ')})`
    : loadingLabelFromKind(loadingKind))
  const xrScene = normalizeXrSceneMediaDragProjection(unwrapGraphCellValue(props.kgXrSceneMedia))
  return {
    activeTab,
    freezeConnectedOutput,
    markdownPresentationMode,
    ...(markdownWorkspaceViewerSurface ? { markdownWorkspaceViewerSurface: true } : {}),
    hasText: Boolean(text.trim() || outputSrcDoc.trim() || connectedText.trim()),
    hasImage: Boolean(imageUrl.trim() || imageToThreeJsOutputSourceUrl.trim()) || hasGenericImage,
    hasVideo: Boolean(videoUrl.trim()) || hasGenericVideo,
    hasAudio: Boolean(audioUrl.trim()) || hasGenericAudio,
    hasModel: Boolean(modelUrl.trim()) || hasGenericModel,
    hasPoi: Boolean(
      poiLabel.trim()
      || poiAddress.trim()
      || poiCategory.trim()
      || poiCoordinates.trim()
      || (activeTab === 'poi' && outputSrcDoc.trim()),
    ),
    text,
    connectedText,
    outputVersions: outputVersionSelection.versions,
    selectedOutputVersionId: outputVersionSelection.selectedVersionId,
    isLoading,
    loadingLabel,
    ...(xrScene ? { xrScene } : {}),
  }
}
