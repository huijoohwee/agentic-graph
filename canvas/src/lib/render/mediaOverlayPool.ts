import type { GraphNode } from '@/lib/graph/types'
import { canonicalNodeIdSetHas } from '@/lib/graph/canonicalNodeIds'
import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { coerceMarkdownParenUrl } from '@/features/parsers/markdownJsonLdUtils'
import { fixBrokenMarkdownImageSyntax } from '@/lib/markdown/sanitizeImportedMarkdown'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import {
  FLOW_IMAGE_GENERATION_NODE_LABEL,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_LABEL,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  getStoryboardWidgetSmartWidgetLabel,
} from '@/lib/config.storyboard-widget'
import { getWidgetRegistryEntryLabel } from '@/features/storyboard-widget-manager/registryTemplates'
import { applyConnectedValuesToNodeForRender, hasConnectedValuesBySchemaPath } from '@/lib/render/effectiveMediaNode'
import {
  buildRichMediaPanelOverlayState,
  isMarkerOwnedAssetOutputPanel,
  type RichMediaPanelOverlayState,
} from '@/lib/render/richMediaPanelState'
import { shouldUseWebpageAssetPathProxyUrl } from '@/lib/url'
import {
  IMAGE_TO_THREEJS_RENDER_MODE,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL,
  isImageToThreeJsOutputPanel,
  type ImageToThreeJsRenderMode,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import {
  IMAGE_TO_GLB_OUTPUT_PANEL_LABEL,
  isImageToGlbOutputPanel,
} from '@/features/image-to-glb/imageToGlbContract'
import type { NodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { isProceduralAssetOutputPanel } from '@/features/image-to-glb/proceduralAssetWorkflowContract'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export type MediaOverlayKind = 'iframe' | 'image' | 'svg' | 'video' | 'audio' | 'model'

export type { RichMediaPanelOverlayState } from '@/lib/render/richMediaPanelState'

export type MediaOverlayNode = {
  id: string
  title: string
  url: string
  srcDoc?: string
  openUrl: string
  interactive: boolean
  kind: MediaOverlayKind
  renderMode?: ImageToThreeJsRenderMode
  panel?: RichMediaPanelOverlayState
  x?: number
  y?: number
  fx?: number
  fy?: number
  width?: number
  height?: number
}

const EMPTY_NODE_BY_ID = new Map<string, GraphNode>()

type Candidate = {
  id: string
  title: string
  url: string
  srcDoc?: string
  openUrl: string
  interactive: boolean
  kind: MediaOverlayKind
  renderMode?: ImageToThreeJsRenderMode
  panel?: RichMediaPanelOverlayState
  x?: number
  y?: number
  fx?: number
  fy?: number
  width?: number
  height?: number
  rank: number
  idx: number
  preferred: boolean
  workflowOutputKey?: string
}

function buildRichMediaPanelDedupKey(candidate: Candidate): string {
  if (candidate.workflowOutputKey) return `${candidate.kind}\nworkflow-output\n${candidate.id}\n${candidate.workflowOutputKey}`
  const canonicalUrl = canonicalMediaDedupUrl(candidate.url || candidate.openUrl)
  if (canonicalUrl) return `${candidate.kind}\n${canonicalUrl}`
  const srcDoc = String(candidate.srcDoc || '').trim()
  if (srcDoc) return `${candidate.kind}\nrich-media-panel\nsrcdoc:${srcDoc}`
  return `${candidate.kind}\nrich-media-panel\nempty:${candidate.id}`
}

function decodeRemoteFetchProxyUrl(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  const fromPrefixedPath = (() => {
    const prefix = '/__fetch_remote?url='
    if (!trimmed.startsWith(prefix)) return ''
    try {
      return decodeURIComponent(trimmed.slice(prefix.length))
    } catch {
      return trimmed.slice(prefix.length)
    }
  })()
  if (fromPrefixedPath) return fromPrefixedPath
  try {
    const parsed = new URL(trimmed, 'http://localhost')
    if (parsed.pathname !== '/__fetch_remote') return ''
    const encoded = parsed.searchParams.get('url') || ''
    if (!encoded) return ''
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  } catch {
    return ''
  }
}

export function canonicalMediaDedupUrl(raw: string): string {
  let current = String(raw || '').trim()
  if (!current) return ''
  for (let i = 0; i < 3; i += 1) {
    const unwrapped = decodeRemoteFetchProxyUrl(current)
    if (!unwrapped || unwrapped === current) break
    current = unwrapped
  }
  return current
}

function extractStandaloneMarkdownLinkUrlFromText(rawText: unknown): string {
  if (typeof rawText !== 'string') return ''
  const normalized = fixBrokenMarkdownImageSyntax(rawText).text
  const m = normalized.match(/^\s*\[[^\]]+\]\(([^)]+)\)\s*$/)
  if (!m || !m[1]) return ''
  return coerceMarkdownParenUrl(String(m[1]))
}

function chooseOpenUrl(node: GraphNode, specUrl: string): string {
  const props = (node.properties || {}) as Record<string, unknown>
  if (isImageToGlbOutputPanel(props) || isProceduralAssetOutputPanel(props)) return String(specUrl || '').trim()
  const fromOutputSourceUrl = typeof props.outputSourceUrl === 'string' ? String(props.outputSourceUrl || '').trim() : ''
  if (fromOutputSourceUrl) return fromOutputSourceUrl
  const fromUrl = typeof props.url === 'string' ? String(props.url || '').trim() : ''
  if (fromUrl) return fromUrl

  const fromText = extractStandaloneMarkdownLinkUrlFromText(props.text)
  if (fromText) return fromText

  const fromMarkdown = extractStandaloneMarkdownLinkUrlFromText(props.markdown)
  if (fromMarkdown) return fromMarkdown

  return String(specUrl || '').trim()
}

function deriveOverlayNodeLabel(node: GraphNode): string {
  const properties = (node.properties || {}) as Record<string, unknown>
  const nodeTypeId = String(node.type || '').trim()
  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    return getWidgetRegistryEntryLabel({
      nodeTypeId,
      widgetTypeId: properties['flow:widgetTypeId'],
      formId: properties['flow:widgetFormId'],
    })
  }
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    return getStoryboardWidgetSmartWidgetLabel({
      mode: 'image',
      model: properties.model,
    })
  }
  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    return getStoryboardWidgetSmartWidgetLabel({
      mode: 'video',
      model: properties.model,
    })
  }
  if (isRichMediaPanelNode(node)) {
    if (isImageToGlbOutputPanel(properties)) return IMAGE_TO_GLB_OUTPUT_PANEL_LABEL
    if (isImageToThreeJsOutputPanel(properties)) return IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL
    return String(unwrapGraphCellValue(node.label) || '').trim() || FLOW_RICH_MEDIA_PANEL_NODE_LABEL
  }
  return String(node.label || node.id || '').trim() || nodeTypeId || 'Media node'
}

function buildOverlayTitle(args: {
  node: GraphNode
  nodeById: ReadonlyMap<string, GraphNode>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): string {
  const base = deriveOverlayNodeLabel(args.node)
  if (isRichMediaPanelNode(args.node)) {
    return base || FLOW_RICH_MEDIA_PANEL_NODE_LABEL
  }
  return base || 'Media node'
}

function computeMediaRank(node: GraphNode, spec: { kind: string; url: string }): number {
  const props = (node.properties || {}) as Record<string, unknown>
  let score = 0
  const nodeTypeId = String(node.type || '').trim()

  const hasExplicit =
    typeof props.media_url === 'string' ||
    typeof props.mediaUrl === 'string' ||
    typeof props.iframe_url === 'string' ||
    typeof props.image === 'string' ||
    typeof props.imageUrl === 'string' ||
    typeof props.video === 'string' ||
    typeof props.videoUrl === 'string' ||
    typeof props.audio === 'string' ||
    typeof props.audioUrl === 'string' ||
    typeof props.audio_url === 'string' ||
    typeof props.model === 'string' ||
    typeof props.modelUrl === 'string' ||
    typeof props.glb === 'string' ||
    typeof props.glbUrl === 'string' ||
    typeof props.media === 'string'
  if (hasExplicit) score += 100

  const typeRaw = nodeTypeId.toLowerCase()
  // Keep Rich Media Panel as canonical renderer when media URLs collide with source widgets.
  if (isRichMediaPanelNode(node) || typeRaw === 'richmediapanel' || typeRaw === 'rich media panel') {
    score += 1000
  }
  if (typeRaw === 'image' || typeRaw === 'video' || typeRaw === 'audio' || typeRaw === 'iframe' || typeRaw === 'webpageelement' || typeRaw === 'link') {
    score += 20
  }

  const domTag = typeof props['dom:tag'] === 'string' ? String(props['dom:tag']).trim().toUpperCase() : ''
  if (domTag === 'IMG' || domTag === 'VIDEO' || domTag === 'AUDIO' || domTag === 'IFRAME' || domTag === 'SVG') score += 20

  const url = String(spec.url || '')
  if (shouldUseWebpageAssetPathProxyUrl(url)) score += 220

  const kind = String(spec.kind || '').toLowerCase()
  if (kind === 'image' || kind === 'svg') score += 10
  else if (kind === 'video') score += 8
  else if (kind === 'audio') score += 7
  else if (kind === 'model') score += 9
  else if (kind === 'iframe') score += 6

  return score
}

function computeRichMediaPanelOverlayRankBonus(candidate: Candidate): number {
  if (!candidate.panel) return 0
  let score = 0
  if (candidate.panel.activeTab === 'video') score += 160
  else if (candidate.panel.activeTab === 'audio') score += 150
  else if (candidate.panel.activeTab === 'model') score += 145
  else if (candidate.panel.activeTab === 'image') score += 140
  else if (candidate.panel.activeTab === 'text') score += 120
  else if (candidate.panel.activeTab === 'poi') score += 80
  if (candidate.panel.hasVideo) score += 140
  if (candidate.panel.hasAudio) score += 130
  if (candidate.panel.hasModel) score += 135
  if (candidate.panel.hasImage) score += 120
  if (candidate.panel.hasText) score += 100
  if (candidate.panel.isLoading) score += 80
  if (String(candidate.srcDoc || '').trim()) score += 40
  if (String(candidate.title || '').includes(' for ')) score += 20
  return score
}

function buildRichMediaPanelFallbackSpec(args: {
  node?: GraphNode
  panel: RichMediaPanelOverlayState | undefined
}): {
  kind: MediaOverlayKind
  url: string
  interactive: boolean
  renderMode?: ImageToThreeJsRenderMode
} | null {
  const { node, panel } = args
  if (!panel) return null
  const renderMode = node && isImageToThreeJsOutputPanel(node.properties)
    ? IMAGE_TO_THREEJS_RENDER_MODE
    : undefined
  if (panel.activeTab === 'image') {
    return {
      kind: 'image',
      url: '',
      interactive: false,
      ...(renderMode ? { renderMode } : {}),
    }
  }
  if (panel.activeTab === 'video') return { kind: 'video', url: '', interactive: false }
  if (panel.activeTab === 'audio') return { kind: 'audio', url: '', interactive: false }
  if (panel.activeTab === 'model') return { kind: 'model', url: '', interactive: false }
  if (panel.activeTab === 'text' || panel.activeTab === 'poi') return { kind: 'iframe', url: '', interactive: false }
  if (panel.activeTab === 'auto') return { kind: 'iframe', url: '', interactive: false }
  return null
}

export function listMediaOverlayNodes(args: {
  enabled: boolean
  nodes: GraphNode[]
  poolMax: number
  kinds?: readonly MediaOverlayKind[]
  preferredNodeIds?: readonly string[]
  excludeNodeIdSet?: Set<string>
  connectedValuesByNodeId?: ReadonlyMap<string, FlowConnectedValuesBySchemaPath>
  nodeById?: ReadonlyMap<string, GraphNode>
}): MediaOverlayNode[] {
  if (!args.enabled) return []
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  const poolMax = Number.isFinite(args.poolMax) ? Math.max(0, Math.floor(args.poolMax)) : 0
  const kinds = new Set<MediaOverlayKind>((args.kinds || ['iframe', 'image', 'svg', 'video', 'audio', 'model']) as MediaOverlayKind[])
  if (poolMax <= 0) return []
  const preferred = (args.preferredNodeIds || []).map(v => String(v || '').trim()).filter(Boolean)
  const preferredSet = preferred.length ? new Set(preferred) : null
  const exclude = args.excludeNodeIdSet || null
  const connectedValuesByNodeId = args.connectedValuesByNodeId || null
  const externalNodeById = args.nodeById || null
  let nodeById: Map<string, GraphNode> | null = null
  const getNodeById = (): ReadonlyMap<string, GraphNode> => {
    if (externalNodeById) return externalNodeById
    if (nodeById) return nodeById
    nodeById = new Map<string, GraphNode>()
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const id = String(node?.id || '').trim()
      if (!id) continue
      nodeById.set(id, node)
    }
    return nodeById
  }

  const candidates: Candidate[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    const renderNode = nodes[i]
    const id = String(renderNode?.id || '').trim()
    if (!id) continue
    if (canonicalNodeIdSetHas(exclude, id)) continue

    // FlowCanvas may hand the pool a render projection whose connected-value
    // pass has already cleared the generated asset URL. Marker-owned image
    // outputs are authoritative publications, so recover their authored node
    // from the graph lookup before deriving the media spec.
    const authoredNode = externalNodeById?.get(id)
    const n0 = authoredNode && isMarkerOwnedAssetOutputPanel(authoredNode)
      ? authoredNode
      : renderNode

    const connectedValuesBySchemaPath = connectedValuesByNodeId?.get(id)
    const isRichMediaPanel = isRichMediaPanelNode(n0)
    const workflowOutputKey = String(unwrapGraphCellValue((n0.properties as Record<string, unknown> | undefined)?.workflowOutputKey) || '').trim()
    const panelNodeById = isRichMediaPanel ? getNodeById() : undefined
    const panel = buildRichMediaPanelOverlayState({
      node: n0,
      connectedValuesBySchemaPath,
      nodeById: panelNodeById,
    })
    const baseSpec = getNodeMediaSpec(n0) || buildRichMediaPanelFallbackSpec({ node: n0, panel })
    const nodeForSpec = (() => {
      if (!hasConnectedValuesBySchemaPath(connectedValuesBySchemaPath)) return n0
      if (isMarkerOwnedAssetOutputPanel(n0)) return n0
      if (!isRichMediaPanel && baseSpec) return n0
      const connectedNode = applyConnectedValuesToNodeForRender({ node: n0, connectedValuesBySchemaPath })
      const connectedPanel = isRichMediaPanel
        ? buildRichMediaPanelOverlayState({
            node: n0,
            connectedValuesBySchemaPath,
            nodeById: panelNodeById,
            renderNode: connectedNode,
          })
        : undefined
      const connectedSpec = getNodeMediaSpec(connectedNode) || buildRichMediaPanelFallbackSpec({ node: connectedNode, panel: connectedPanel })
      if (connectedSpec) return connectedNode
      return n0
    })()
    const resolvedPanel = isRichMediaPanel
      ? buildRichMediaPanelOverlayState({
          node: n0,
          connectedValuesBySchemaPath,
          nodeById: panelNodeById,
          renderNode: nodeForSpec,
        })
      : panel
    const spec: NodeMediaSpec | null = nodeForSpec === n0
      ? baseSpec
      : (getNodeMediaSpec(nodeForSpec) || buildRichMediaPanelFallbackSpec({ node: nodeForSpec, panel: resolvedPanel }))
    if (!spec) continue
    const kind = spec.kind as MediaOverlayKind
    if (!kinds.has(kind)) continue
    const title = buildOverlayTitle({
      node: n0,
      nodeById: panelNodeById || EMPTY_NODE_BY_ID,
      connectedValuesBySchemaPath,
    })
    const openUrl = chooseOpenUrl(nodeForSpec, spec.url)
    const preferredHit = preferredSet?.has(id) === true
    const rankBase = computeMediaRank(nodeForSpec, spec)
    const panelRankBonus = resolvedPanel
      ? computeRichMediaPanelOverlayRankBonus({
          id,
          title,
          url: spec.url,
          ...(typeof (spec as { srcDoc?: unknown }).srcDoc === 'string' && String((spec as { srcDoc?: string }).srcDoc || '').trim()
            ? { srcDoc: String((spec as { srcDoc?: string }).srcDoc || '') }
            : {}),
          openUrl,
          interactive: spec.interactive,
          kind,
          panel: resolvedPanel,
          rank: 0,
          idx: i,
          preferred: preferredHit,
      })
      : 0
    const rank = preferredHit ? rankBase + panelRankBonus + 1000 : rankBase + panelRankBonus
    const nodeSize = n0 as unknown as { width?: number; height?: number }
    candidates.push({
      id,
      title,
      url: spec.url,
      ...(typeof (spec as { srcDoc?: unknown }).srcDoc === 'string' && String((spec as { srcDoc?: string }).srcDoc || '').trim()
        ? { srcDoc: String((spec as { srcDoc?: string }).srcDoc || '') }
        : {}),
      openUrl,
      interactive: spec.interactive,
      kind,
      ...(spec.renderMode ? { renderMode: spec.renderMode } : {}),
      ...(resolvedPanel ? { panel: resolvedPanel } : {}),
      ...(typeof n0.x === 'number' && Number.isFinite(n0.x) ? { x: n0.x } : {}),
      ...(typeof n0.y === 'number' && Number.isFinite(n0.y) ? { y: n0.y } : {}),
      ...(typeof n0.fx === 'number' && Number.isFinite(n0.fx) ? { fx: n0.fx } : {}),
      ...(typeof n0.fy === 'number' && Number.isFinite(n0.fy) ? { fy: n0.fy } : {}),
      ...(typeof nodeSize.width === 'number' && Number.isFinite(nodeSize.width) ? { width: nodeSize.width } : {}),
      ...(typeof nodeSize.height === 'number' && Number.isFinite(nodeSize.height) ? { height: nodeSize.height } : {}),
      rank,
      idx: i,
      preferred: preferredHit,
      ...(workflowOutputKey ? { workflowOutputKey } : {}),
    })
  }

  const bestByKey = new Map<string, Candidate>()
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i]!
    const keyUrl = canonicalMediaDedupUrl(c.url || c.openUrl)
    const key = (() => {
      if (!c.panel) return `${c.kind}\n${keyUrl || c.id}`
      return buildRichMediaPanelDedupKey(c)
    })()
    const prev = bestByKey.get(key)
    if (!prev) {
      bestByKey.set(key, c)
      continue
    }
    if (c.rank > prev.rank) {
      bestByKey.set(key, c)
      continue
    }
    if (c.rank === prev.rank && c.idx < prev.idx) {
      bestByKey.set(key, c)
    }
  }

  const unique = Array.from(bestByKey.values())
  unique.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank
    return a.idx - b.idx
  })

  return unique
    .slice(0, poolMax)
    .map(n => ({
    id: n.id,
    title: n.title,
    url: n.url,
    ...(n.srcDoc ? { srcDoc: n.srcDoc } : {}),
    openUrl: n.openUrl,
    interactive: n.interactive,
    kind: n.kind,
    ...(n.renderMode ? { renderMode: n.renderMode } : {}),
    ...(n.panel ? { panel: n.panel } : {}),
    ...(typeof n.x === 'number' && Number.isFinite(n.x) ? { x: n.x } : {}),
    ...(typeof n.y === 'number' && Number.isFinite(n.y) ? { y: n.y } : {}),
    ...(typeof n.fx === 'number' && Number.isFinite(n.fx) ? { fx: n.fx } : {}),
    ...(typeof n.fy === 'number' && Number.isFinite(n.fy) ? { fy: n.fy } : {}),
    ...(typeof n.width === 'number' && Number.isFinite(n.width) ? { width: n.width } : {}),
    ...(typeof n.height === 'number' && Number.isFinite(n.height) ? { height: n.height } : {}),
    }))
}
