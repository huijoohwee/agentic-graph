import type { GraphNode } from '@/lib/graph/types'
import { projectVideoAgentFrameAnalysisSrcDoc } from '@/features/video-agent/videoAgentFrameAnalysisProjection'
import { IFRAME_ALLOWED_HOSTS } from '@/lib/config'
import { coerceMediaUrl } from '@/lib/url'
import { inferMediaKindFromResourceUrl, prefersIframeFromLinkContext } from '@/lib/graph/mediaUrlKind'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { inferMediaKindFromUrl } from 'grph-shared/rich-media/mediaKind'
import { isSafeIframeUrl, normalizeIframeUrl, resolveIframeEmbed } from 'grph-shared/rich-media/iframe'
import { extractMarkdownInlineRefs } from '@/features/parsers/markdownJsonLdUtils'
import { fixBrokenMarkdownImageSyntax } from '@/lib/markdown/sanitizeImportedMarkdown'
import { buildTextWidgetOutputSrcDoc } from '@/lib/render/widgetOutputSrcDoc'
import { RICH_MEDIA_CONNECTED_RENDER_PATHS_KEY } from '@/lib/render/effectiveMediaNode'
import { normalizeRichMediaPanelInlineSrcDoc } from '@/lib/render/richMediaPanelSrcDoc'
import { buildWebpageHtmlSrcdoc } from '@/lib/websites/webpageIframeSrcdoc'
import { containsMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import type { NodeMediaKind } from '@/lib/canvas/graph-elements/mediaProperties'
import { extractMarkdownMediaUrl, normalizeExternalUrl } from '@/lib/canvas/graph-elements/mediaSpecMarkdown'
import { readNodeFieldBoolean, readNodeFieldString, readNodeFieldValue } from '@/lib/canvas/graph-elements/mediaSpecNodeFields'
import {
  IMAGE_TO_THREEJS_RENDER_MODE,
  isImageToThreeJsOutputPanel,
  readImageToThreeJsRenderMode,
  type ImageToThreeJsRenderMode,
} from '@/features/image-to-threejs/imageToThreeJsContract'
export { DEFAULT_NODE_MEDIA_KIND, NODE_MEDIA_KINDS, buildNodeMediaProperties, patchNodeMediaProperties } from '@/lib/canvas/graph-elements/mediaProperties'
export type { NodeMediaKind } from '@/lib/canvas/graph-elements/mediaProperties'
export type NodeMediaSpec = {
  kind: NodeMediaKind
  url: string
  srcDoc?: string
  interactive: boolean
  renderMode?: ImageToThreeJsRenderMode
}
export type NodeMediaInventoryRow = {
  id: string
  label: string
  type: string
  media: NodeMediaSpec
}
export type NodeMediaInventory = {
  rows: ReadonlyArray<NodeMediaInventoryRow>
  totalCount: number
  imageCount: number
  imageLikeCount: number
  videoCount: number
  audioCount: number
  iframeCount: number
  svgCount: number
}

const mediaSpecCache = new WeakMap<GraphNode, { cacheKey: string; spec: NodeMediaSpec | null }>()
const RICH_MEDIA_PANEL_TEXT_FALLBACK_TITLE = 'Rich Media Panel'

function isImagePreviewKind(kind: NodeMediaKind | null | undefined): boolean {
  return kind === 'image' || kind === 'svg'
}

function pushUniqueImagePreviewUrl(
  value: unknown,
  out: string[],
  seen: Set<string>,
): void {
  const url = coerceMediaUrl(value)
  if (!url) return
  if (seen.has(url)) return
  seen.add(url)
  out.push(url)
}

function appendMarkdownImagePreviewUrls(
  value: unknown,
  out: string[],
  seen: Set<string>,
  limit: number,
): void {
  const raw = typeof value === 'string' ? value : ''
  if (!raw.trim() || out.length >= limit) return
  const normalized = fixBrokenMarkdownImageSyntax(raw).text
  const refs = extractMarkdownInlineRefs(normalized)
  for (const ref of refs.images) {
    const altNorm = String(ref.alt || '').trim().toLowerCase()
    if (altNorm.startsWith('iframe') || altNorm.startsWith('video') || altNorm.startsWith('audio')) continue
    pushUniqueImagePreviewUrl(normalizeExternalUrl(ref.url), out, seen)
    if (out.length >= limit) return
  }
}

function appendRecordImagePreviewUrls(
  record: Record<string, unknown> | null | undefined,
  out: string[],
  seen: Set<string>,
  limit: number,
): void {
  if (!record || out.length >= limit) return

  pushUniqueImagePreviewUrl(record.image, out, seen)
  if (out.length >= limit) return
  pushUniqueImagePreviewUrl(record.imageUrl, out, seen)
  if (out.length >= limit) return

  const kindRaw =
    typeof record.media_kind === 'string'
      ? record.media_kind.trim().toLowerCase()
      : typeof record.mediaKind === 'string'
        ? record.mediaKind.trim().toLowerCase()
        : ''
  const genericCandidates = [record.media_url, record.mediaUrl, record.media]
  for (const candidate of genericCandidates) {
    const url = coerceMediaUrl(candidate)
    if (!url) continue
    const inferredKind = inferMediaKindFromResourceUrl(url) || inferMediaKindFromUrl(url)
    if (!isImagePreviewKind(kindRaw as NodeMediaKind) && !isImagePreviewKind(inferredKind as NodeMediaKind)) continue
    pushUniqueImagePreviewUrl(url, out, seen)
    if (out.length >= limit) return
  }

  const markdownCandidates = [
    record.text,
    record.markdown,
    record.output,
    record.description,
    record.summary,
    record.mdSectionMarkdown,
    record.sectionMarkdown,
  ]
  for (const candidate of markdownCandidates) {
    appendMarkdownImagePreviewUrls(candidate, out, seen, limit)
    if (out.length >= limit) return
  }
}

function isRichMediaPanelNode(node: GraphNode): boolean {
  return readNodeFieldString(node, node.properties || {}, 'type') === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
}

function readNodeTitle(node: GraphNode): string {
  const props = node.properties || {}
  return (
    readNodeFieldString(node, props, 'label')
    || readNodeFieldString(node, props, 'id')
    || RICH_MEDIA_PANEL_TEXT_FALLBACK_TITLE
  )
}

function buildRichMediaPanelTextualIframeSpec(args: {
  interactive?: boolean
  node: GraphNode
  outputText: string
  outputSrcDoc: string
}): NodeMediaSpec {
  const interactive = args.interactive === true
  if (args.outputSrcDoc) {
    return {
      kind: 'iframe',
      url: '',
      srcDoc: normalizeRichMediaPanelInlineSrcDoc({
        srcDoc: args.outputSrcDoc,
        title: readNodeTitle(args.node),
      }),
      interactive,
    }
  }
  const trimmed = args.outputText.trim()
  const properties = (args.node.properties || {}) as Record<string, unknown>
  const usesNativeMarkdownSurface = containsMarkdownPipeTable(trimmed) || readNodeFieldBoolean(args.node, properties, 'markdownPresentationMode')
  if (!trimmed || usesNativeMarkdownSurface) {
    return { kind: 'iframe', url: '', interactive }
  }
  return {
    kind: 'iframe',
    url: '',
    srcDoc: buildTextWidgetOutputSrcDoc({ title: readNodeTitle(args.node), text: args.outputText }),
    interactive,
  }
}

function getCacheKey(node: GraphNode, props: Record<string, unknown>): string {
  const read = (key: string) => readNodeFieldValue(node, props, key)
  return [
    node.id,
    node.type,
    node.label,
    read('media_kind'),
    read('mediaKind'),
    read('media_url'),
    read('mediaUrl'),
    read('iframe_url'),
    read('image'),
    read('imageUrl'),
    read('video'),
    read('videoUrl'),
    read('audio'),
    read('audioUrl'),
    read('audio_url'),
    read('model'),
    read('modelUrl'),
    read('glb'),
    read('glbUrl'),
    read('media'),
    read('url'),
    read('src'),
    read('label'),
    read('dom:tag'),
    read('dom:attrs:src'),
    read('dom:attrs:srcdoc'),
    read('srcDoc'),
    read('inputSrcDoc'),
    read('media_interactive'),
    read('mediaRenderMode'),
    read('outputSrcDoc'),
    read('output'),
    read(RICH_MEDIA_CONNECTED_RENDER_PATHS_KEY),
    read('frameBoundingBoxes'),
    read('text'),
    read('markdown'),
    read('richMediaActiveTab'),
    read('markdownPresentationMode'),
    read('freezeConnectedOutput'),
  ]
    .map(v => String(v ?? ''))
    .join('\n')
}

function computeNodeMediaSpec(node: GraphNode): NodeMediaSpec | null {
  const props = (node.properties || {}) as Record<string, unknown>
  const kindRaw = (
    readNodeFieldString(node, props, 'media_kind')
    || readNodeFieldString(node, props, 'mediaKind')
  ).toLowerCase()
  const kindForced: NodeMediaKind | null =
    kindRaw === 'iframe' || kindRaw === 'video' || kindRaw === 'audio' || kindRaw === 'image' || kindRaw === 'svg' || kindRaw === 'model'
      ? (kindRaw as NodeMediaKind)
      : null

  const iframeUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'iframe_url'))
  const mediaUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'media_url'))
  const mediaUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'mediaUrl'))
  const imageUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'image'))
  const imageUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'imageUrl'))
  const videoUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'video'))
  const videoUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'videoUrl'))
  const audioUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'audio'))
  const audioUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'audioUrl'))
  const audioUrlSnake = coerceMediaUrl(readNodeFieldValue(node, props, 'audio_url'))
  const modelUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'model'))
  const modelUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'modelUrl'))
  const glbUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'glb'))
  const glbUrlCamel = coerceMediaUrl(readNodeFieldValue(node, props, 'glbUrl'))
  const generic = coerceMediaUrl(readNodeFieldValue(node, props, 'media'))
  const srcUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'src'))
  const linkUrl = coerceMediaUrl(readNodeFieldValue(node, props, 'url'))
  // Only restore marker-owned Three.js output from its persisted source; ordinary outputSourceUrl values retain their routing.
  const imageToThreeJsOutputSourceUrl = isImageToThreeJsOutputPanel(props)
    ? coerceMediaUrl(readNodeFieldValue(node, props, 'outputSourceUrl'))
    : null
  const linkLabel = readNodeFieldString(node, props, 'label') || String(node.label || '').trim()

  const outputText = (() => {
    const s = readNodeFieldValue(node, props, 'output')
    return typeof s === 'string' ? s : ''
  })()

  const isRichMediaPanel = isRichMediaPanelNode(node)
  const connectedRenderPathSig = isRichMediaPanel
    ? readNodeFieldString(node, props, RICH_MEDIA_CONNECTED_RENDER_PATHS_KEY)
    : ''
  const connectedRenderPathSet = connectedRenderPathSig
    ? new Set(connectedRenderPathSig.split('|').map(path => path.trim()).filter(Boolean))
    : null
  const richMediaActiveTab = (() => {
    if (!isRichMediaPanel) return ''
    return readNodeFieldString(node, props, 'richMediaActiveTab').toLowerCase()
  })()
  let markdownMedia: { kind: NodeMediaKind; url: string } | null = null
  const getMarkdownMediaOnce = () => {
    if (markdownMedia !== null) return markdownMedia
    const t = readNodeFieldValue(node, props, 'text')
    const m = readNodeFieldValue(node, props, 'markdown')
    const rawText =
      typeof t === 'string'
        ? t
        : typeof m === 'string'
          ? m
          : outputText
    const extracted = extractMarkdownMediaUrl(rawText)
    if (!extracted) {
      markdownMedia = null
      return null
    }
    const coerced = coerceMediaUrl(extracted.url)
    if (!coerced) {
      markdownMedia = null
      return null
    }
    markdownMedia = { kind: extracted.kind, url: coerced }
    return markdownMedia
  }

  const inferredLinkKind = inferMediaKindFromResourceUrl(linkUrl || '')
  const inferLinkAsIframe = inferredLinkKind == null && prefersIframeFromLinkContext({ label: linkLabel, url: linkUrl || undefined })
  let url =
    iframeUrl
    || mediaUrl
    || mediaUrlCamel
    || imageUrl
    || imageUrlCamel
    || videoUrl
    || videoUrlCamel
    || audioUrl
    || audioUrlCamel
    || audioUrlSnake
    || modelUrl
    || modelUrlCamel
    || glbUrl
    || glbUrlCamel
    || generic
    || srcUrl
    || imageToThreeJsOutputSourceUrl
    || (inferredLinkKind || inferLinkAsIframe ? linkUrl : null)

  if (!url) url = getMarkdownMediaOnce()?.url || null

  const domTag = (() => {
    const t = readNodeFieldValue(node, props, 'dom:tag')
    return typeof t === 'string' ? t.trim().toUpperCase() : ''
  })()
  const domSrc = (() => {
    const s = readNodeFieldValue(node, props, 'dom:attrs:src')
    const raw = typeof s === 'string' ? s.trim() : ''
    if (!raw) return ''
    if (raw.startsWith('//')) return `https:${raw}`
    return raw
  })()
  const domSrcDoc = (() => {
    const s = readNodeFieldValue(node, props, 'dom:attrs:srcdoc')
    return typeof s === 'string' ? s.trim() : ''
  })()
  const outputSrcDoc = (() => {
    const s = readNodeFieldValue(node, props, 'outputSrcDoc')
    return typeof s === 'string' ? s.trim() : ''
  })()
  const sourceSrcDoc = (() => {
    const s = readNodeFieldValue(node, props, 'srcDoc') || readNodeFieldValue(node, props, 'inputSrcDoc')
    return typeof s === 'string' ? s.trim() : ''
  })()
  const frameBoundingBoxes = readNodeFieldValue(node, props, 'frameBoundingBoxes')
  const richMediaKind = isRichMediaPanel ? readNodeFieldString(node, props, 'kind').toLowerCase() : ''
  const preserveSourceSrcDoc =
    Boolean(sourceSrcDoc)
    && (
      !outputSrcDoc
      || readNodeFieldBoolean(node, props, 'freezeConnectedOutput')
      || richMediaKind === 'annotation'
      || richMediaKind === 'video-agent-frame-analysis'
    )
  const richMediaSrcDoc = projectVideoAgentFrameAnalysisSrcDoc({
    frameBoundingBoxes,
    srcDoc: preserveSourceSrcDoc ? sourceSrcDoc : (outputSrcDoc || sourceSrcDoc),
  })

  const rawInteractive = readNodeFieldValue(node, props, 'media_interactive')
  const explicitInteractive = rawInteractive === true ? true : rawInteractive === false ? false : null

  if (isRichMediaPanel) {
    const selected = richMediaActiveTab === 'video' || richMediaActiveTab === 'audio' || richMediaActiveTab === 'image' || richMediaActiveTab === 'model' || richMediaActiveTab === 'text' || richMediaActiveTab === 'poi'
      ? richMediaActiveTab
      : ''
    if (!selected && connectedRenderPathSet?.has('properties.modelUrl')) {
      const chosen = modelUrl || modelUrlCamel || glbUrl || glbUrlCamel
      if (chosen) return { kind: 'model', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (!selected && connectedRenderPathSet?.has('properties.videoUrl')) {
      const chosen = videoUrl || videoUrlCamel
      if (chosen) return { kind: 'video', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (!selected && connectedRenderPathSet?.has('properties.audioUrl')) {
      const chosen = audioUrl || audioUrlCamel || audioUrlSnake
      if (chosen) return { kind: 'audio', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (!selected && connectedRenderPathSet?.has('properties.imageUrl')) {
      const chosen = imageUrl || imageUrlCamel || imageToThreeJsOutputSourceUrl
      if (chosen) return { kind: 'image', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : false }
    }
    if (selected === 'video') {
      const chosen = videoUrl || videoUrlCamel
      if (chosen) return { kind: 'video', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (selected === 'audio') {
      const chosen = audioUrl || audioUrlCamel || audioUrlSnake
      if (chosen) return { kind: 'audio', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (selected === 'model') {
      const chosen = modelUrl || modelUrlCamel || glbUrl || glbUrlCamel
      if (chosen) return { kind: 'model', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : true }
    }
    if (selected === 'image') {
      const chosen = imageUrl || imageUrlCamel || imageToThreeJsOutputSourceUrl
      if (chosen) return { kind: 'image', url: chosen, interactive: explicitInteractive != null ? explicitInteractive : false }
    }
    if (selected === 'text' || selected === 'poi') {
      return buildRichMediaPanelTextualIframeSpec({ node, outputText, outputSrcDoc: richMediaSrcDoc, interactive: explicitInteractive === true })
    }
    if (
      !selected
      && connectedRenderPathSet?.has('properties.output')
      && !(connectedRenderPathSet.has('properties.videoUrl') || connectedRenderPathSet.has('properties.audioUrl') || connectedRenderPathSet.has('properties.imageUrl') || connectedRenderPathSet.has('properties.modelUrl'))
    ) {
      return buildRichMediaPanelTextualIframeSpec({ node, outputText, outputSrcDoc: richMediaSrcDoc, interactive: explicitInteractive === true })
    }
    if (
      !selected
      && (richMediaSrcDoc || outputText.trim())
      && !(videoUrl || videoUrlCamel || audioUrl || audioUrlCamel || audioUrlSnake || modelUrl || modelUrlCamel || glbUrl || glbUrlCamel || imageUrl || imageUrlCamel || getMarkdownMediaOnce()?.url)
    ) {
      return buildRichMediaPanelTextualIframeSpec({ node, outputText, outputSrcDoc: richMediaSrcDoc, interactive: explicitInteractive === true })
    }
    if (selected === 'video') return { kind: 'video', url: '', interactive: explicitInteractive != null ? explicitInteractive : false }
    if (selected === 'audio') return { kind: 'audio', url: '', interactive: explicitInteractive != null ? explicitInteractive : false }
    if (selected === 'model') return { kind: 'model', url: '', interactive: explicitInteractive != null ? explicitInteractive : false }
    if (selected === 'image') return { kind: 'image', url: '', interactive: explicitInteractive != null ? explicitInteractive : false }
  }
  const domMediaUrl = (() => {
    if (!domTag) return ''
    if (domTag === 'IMG' || domTag === 'VIDEO' || domTag === 'AUDIO' || domTag === 'IFRAME' || domTag === 'SVG') return domSrc
    return ''
  })()

  const domKindForced: NodeMediaKind | null =
    domTag === 'IFRAME'
      ? 'iframe'
      : domTag === 'VIDEO'
        ? 'video'
        : domTag === 'AUDIO'
          ? 'audio'
          : domTag === 'SVG'
            ? 'svg'
            : domTag === 'IMG'
              ? 'image'
              : null

  const resolvedUrl = url || (domMediaUrl ? coerceMediaUrl(domMediaUrl) : null)
  if (!resolvedUrl) {
    if (isRichMediaPanel) return buildRichMediaPanelTextualIframeSpec({ node, outputText, outputSrcDoc: richMediaSrcDoc, interactive: explicitInteractive === true })
    // Keep unavailable images in the shared empty-media surface without admitting rejected URLs.
    if (kindForced === 'image' || kindForced === 'svg' || domKindForced === 'image' || domKindForced === 'svg'
      || String(node.type || '').toLowerCase() === 'image') {
      return { kind: kindForced === 'svg' || domKindForced === 'svg' ? 'svg' : 'image', url: '', interactive: false }
    }
    if (domTag === 'IFRAME' && domSrcDoc) {
      if (/<\s*script\b/i.test(domSrcDoc)) return null
      if (/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(domSrcDoc)) return null
      if (/\bjavascript\s*:/i.test(domSrcDoc)) return null
      const baseHref = (() => {
        const meta = (node.metadata || {}) as Record<string, unknown>
        const raw = typeof meta.documentUrl === 'string' ? meta.documentUrl.trim() : ''
        if (/^https?:\/\//i.test(raw)) return raw
        return 'https://example.invalid/'
      })()
      const srcDoc = buildWebpageHtmlSrcdoc({ html: domSrcDoc, baseHref, scriptPolicy: 'strip' })
      return { kind: 'iframe', url: '', srcDoc, interactive: true }
    }
    return null
  }

  const kind: NodeMediaKind = kindForced
    ? kindForced
    : iframeUrl
      ? 'iframe'
    : (videoUrl || videoUrlCamel)
      ? 'video'
    : (audioUrl || audioUrlCamel || audioUrlSnake)
      ? 'audio'
      : (modelUrl || modelUrlCamel || glbUrl || glbUrlCamel)
        ? 'model'
        : domKindForced
          ? domKindForced
          : inferredLinkKind
            ? inferredLinkKind
            : inferLinkAsIframe
              ? 'iframe'
              : (getMarkdownMediaOnce()?.kind || ((inferMediaKindFromUrl(resolvedUrl) || 'image') as NodeMediaKind))

  const interactive = explicitInteractive != null ? explicitInteractive : kind === 'video' || kind === 'audio' || kind === 'iframe' || kind === 'model'

  if (kind === 'iframe') {
    const normalized = normalizeIframeUrl(resolvedUrl)
    const embed = resolveIframeEmbed({ url: normalized })
    const enforceAllowedHosts = embed.direct
    if (!isSafeIframeUrl(embed.iframeSrc, {
      allowedHostsCsv: enforceAllowedHosts ? IFRAME_ALLOWED_HOSTS : '',
      allowYouTube: true,
      allowInternalPaths: true,
    })) return null
    return { kind, url: normalized, interactive }
  }

  return { kind, url: resolvedUrl, interactive }
}
export function getNodeMediaSpec(node: GraphNode): NodeMediaSpec | null {
  const props = (node.properties || {}) as Record<string, unknown>
  const cacheKey = getCacheKey(node, props)
  const cached = mediaSpecCache.get(node)
  if (cached && cached.cacheKey === cacheKey) return cached.spec
  const computed = computeNodeMediaSpec(node)
  const renderMode = readImageToThreeJsRenderMode(props)
    || (isImageToThreeJsOutputPanel(props) ? IMAGE_TO_THREEJS_RENDER_MODE : undefined)
  const spec = computed && renderMode && (computed.kind === 'image' || computed.kind === 'svg')
    ? { ...computed, renderMode }
    : computed
  mediaSpecCache.set(node, { cacheKey, spec })
  return spec
}

export function hasNodeMedia(node: GraphNode): boolean {
  return getNodeMediaSpec(node) != null
}

export function getNodeImagePreviewUrls(node: GraphNode, limit = 8): string[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 8
  const out: string[] = []
  const seen = new Set<string>()
  const spec = getNodeMediaSpec(node)
  if (spec && isImagePreviewKind(spec.kind)) {
    pushUniqueImagePreviewUrl(spec.url, out, seen)
  }
  appendRecordImagePreviewUrls((node.properties || {}) as Record<string, unknown>, out, seen, safeLimit)
  if (out.length < safeLimit) {
    appendRecordImagePreviewUrls((node.metadata || {}) as Record<string, unknown>, out, seen, safeLimit)
  }
  return out.slice(0, safeLimit)
}

export function buildNodeMediaInventory(
  nodes: ReadonlyArray<GraphNode> | null | undefined,
  options?: { maxRows?: number; limitStatsToRows?: boolean },
): NodeMediaInventory {
  if (!Array.isArray(nodes) || nodes.length <= 0) {
    return { rows: [], totalCount: 0, imageCount: 0, imageLikeCount: 0, videoCount: 0, audioCount: 0, iframeCount: 0, svgCount: 0 }
  }

  const maxRowsRaw = options?.maxRows
  const maxRows =
    typeof maxRowsRaw === 'number' && Number.isFinite(maxRowsRaw)
      ? Math.max(0, Math.floor(maxRowsRaw))
      : Number.POSITIVE_INFINITY
  const limitStatsToRows = options?.limitStatsToRows === true
  const rows: NodeMediaInventoryRow[] = []
  let totalCount = 0
  let imageCount = 0
  let imageLikeCount = 0
  let videoCount = 0
  let audioCount = 0
  let iframeCount = 0
  let svgCount = 0

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (!node) continue
    const spec = getNodeMediaSpec(node)
    if (!spec) continue

    const shouldList = rows.length < maxRows
    if (shouldList) {
      rows.push({
        id: String(node.id),
        label: String(node.label || node.id || ''),
        type: String(node.type || ''),
        media: spec,
      })
    }
    if (limitStatsToRows && !shouldList) continue

    totalCount += 1
    if (spec.kind === 'iframe') {
      iframeCount += 1
      continue
    }
    if (spec.kind === 'video') {
      videoCount += 1
      continue
    }
    if (spec.kind === 'audio') {
      audioCount += 1
      continue
    }
    if (spec.kind === 'svg') {
      svgCount += 1
      imageLikeCount += 1
      continue
    }
    if (spec.kind === 'image') {
      imageCount += 1
      imageLikeCount += 1
    }
  }

  return { rows, totalCount, imageCount, imageLikeCount, videoCount, audioCount, iframeCount, svgCount }
}
