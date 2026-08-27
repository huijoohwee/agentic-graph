import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { captureLiveRichMediaOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { captureLiveMarkdownDesignOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { captureLiveOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const readRuntimeJsonArray = (html: string, varName: string): unknown[] => {
  const scriptMatch = html.match(/<script>\n([\s\S]*?)\n\s*<\/script>/)
  const js = scriptMatch && scriptMatch[1] ? scriptMatch[1] : ''
  if (!js.trim()) return []
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = js.match(new RegExp(`var\\s+${escapedVar}\\s*=\\s*(\\[[\\s\\S]*?\\]);`))
  const payload = m && m[1] ? m[1] : '[]'
  try {
    const parsed = JSON.parse(payload)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const stripOpaqueHtmlBlocks = (html: string): string => {
  return String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
}

export async function testExportHtmlViewerIsSvgOnlyAndBlocksBrowserZoomAndSelection() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg })
  if (!html) throw new Error('expected html')
  if (!html.includes('maximum-scale=1') || !html.includes('user-scalable=no')) {
    throw new Error('expected viewport to block browser zoom')
  }
  if (!html.includes('user-select:none') && !html.includes('user-select: none')) {
    throw new Error('expected selection disabled')
  }
  if (!html.includes('.kg-mediaBody iframe,.kg-mediaBody img,.kg-mediaBody video') || !html.includes('data-kg-rich-media-render-surface')) {
    throw new Error('expected exported viewer to use the widget rich media render surface contract')
  }
  if (html.includes('[data-kg-rich-media-floating-toolbar="1"]') || html.includes('[data-kg-rich-media-open-source="1"]')) {
    throw new Error('expected exported viewer CSS to avoid the legacy Rich Media floating toolbar variant')
  }
  if (!html.includes('kg-media-toggle') || !html.includes('Toggle media interaction')) {
    throw new Error('expected media interaction toggle control')
  }
  if (!html.includes('setPanHeld') || !html.includes('Spacebar')) {
    throw new Error('expected space-to-pan support for interactive media mode')
  }
  if (!html.includes("addEventListener('wheel', onWheel, { passive: false, capture: true })")) {
    throw new Error('expected wheel listener to capture and prevent browser zoom')
  }
  if (html.includes('kg-imgWrap') || html.includes('kg-img') || html.includes('<img')) {
    throw new Error('expected svg-only viewer (no png/img fallback)')
  }
  if (!html.includes('rebuildNodePosFromSvg')) {
    throw new Error('expected exported viewer to derive node positions from svg for fidelity')
  }
  if (!html.includes('translate\\(\\s*')) {
    throw new Error('expected exported viewer embedded regex literals to preserve backslashes')
  }
  if (!html.includes('scheduleOverlayUpdate')) {
    throw new Error('expected exported viewer to coalesce overlay updates (avoid churn)')
  }
  if (!html.includes("pointerMode !== 'pan'") || !html.includes('applyMediaPointerEvents')) {
    throw new Error('expected pan mode to disable media pointer events so overlay drag pans instead')
  }
  if (html.includes('mediaOffsetById') || html.includes('startMediaHeaderDrag')) {
    throw new Error('expected exported viewer media header drag to move node (not detach panel)')
  }
}

export async function testExportHtmlViewerSemanticHtmlAvoidsGenericDivContainers() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="a"><circle cx="0" cy="0" r="5"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'Semantic HTML',
    svgMarkup: svg,
    overlayHtml: '<section data-md-id="a" data-kg-anchor-node-id="a" data-kg-world-x="0" data-kg-world-y="0" data-kg-world-w="120" data-kg-world-h="80">Overlay</section>',
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'a', label: 'A', type: 'Entity', properties: {} }],
      edges: [],
    },
  })
  if (!html) throw new Error('expected html')
  const visibleHtml = stripOpaqueHtmlBlocks(html)
  if (/<section\b|<\/div>/i.test(visibleHtml)) {
    throw new Error(`expected exported Graph HTML viewer markup to avoid visible generic HTML division element containers, got: ${visibleHtml}`)
  }
  for (const snippet of ['<main id="kg-root"', '<section id="kg-stage"', '<figure id="kg-svgWrap"', '<section id="kg-overlay"', '<nav id="kg-hud"', '<output id="kg-tooltip"']) {
    if (!html.includes(snippet)) throw new Error(`expected semantic Graph HTML viewer container: ${snippet}`)
  }
}

export async function testExportHtmlViewerIncludesRichMediaNodesWithDefaultPoolMax() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'm1', label: 'Media', type: 'Entity', properties: { media_url: 'https://example.com/test.png' } }],
      edges: [],
    },
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('example.com/test.png')) {
    throw new Error('expected rich media node to be embedded in exported html viewer')
  }
}

export async function testExportHtmlViewerMediaPanelHasNonZeroLayout() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle data-role="node-circle" cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'm1', label: 'Media', type: 'Entity', properties: { media_url: 'https://example.com/test.png' } }],
      edges: [],
    },
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('.kg-media{') || !html.includes('display:flex') || !html.includes('flex-direction:column')) {
    throw new Error('expected exported viewer media panel to be flex column')
  }
  if (!html.includes('.kg-mediaBody{') || !html.includes('flex:1')) {
    throw new Error('expected exported viewer media body to fill panel height')
  }
  if (!html.includes('.kg-mediaBody iframe,.kg-mediaBody img,.kg-mediaBody video') || !html.includes('height:100%')) {
    throw new Error('expected exported viewer media content to size to container')
  }
}

export async function testExportHtmlViewerRendersProxiedImageAndVideoInline() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"></svg>`
  const imageUrl = '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.webp'
  const videoUrl = '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4'
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [
        { id: 'img1', label: 'Image', type: 'Entity', properties: { media_url: imageUrl } },
        { id: 'vid1', label: 'Video', type: 'Entity', properties: { media_url: videoUrl } },
      ],
      edges: [],
    },
    mediaOverlayPoolMax: 4,
  })
  if (!html.includes(`"url":"${imageUrl}","openUrl":"${imageUrl}"`)) {
    throw new Error('expected proxied image URL to stay in exported media payload, not become a download-only link')
  }
  if (!html.includes(`"url":"${videoUrl}","openUrl":"${videoUrl}"`)) {
    throw new Error('expected proxied video URL to stay in exported media payload, not become a download-only link')
  }
  if (!html.includes(`"kind":"image"`)) throw new Error('expected proxied image to export as inline image')
  if (!html.includes(`"kind":"video"`)) throw new Error('expected proxied video to export as inline video')
  if (!html.includes('document.createElement(\'img\')')) throw new Error('expected standalone viewer to create inline image media elements')
  if (!html.includes('document.createElement(\'video\')')) throw new Error('expected standalone viewer to create inline video media elements')
  if (!html.includes('decodedProxyUrl')) throw new Error('expected standalone runtime to infer media kind from proxy url parameter')
  if (!html.includes('var kgGetProxyOrigin = function(){') || !html.includes('var kgMaybeProbeProxyOrigin = function(){') || !html.includes('var kgBuildWebpageMetaProxyUrl = function(absUrl){')) {
    throw new Error('expected standalone runtime to include the canonical proxy helper subsystem from the template')
  }
}

export async function testExportHtmlViewerTreatsIFrameKindWithImageUrlAsImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [
        {
          id: 'm1',
          label: 'Media',
          type: 'Entity',
          properties: { media_kind: 'iframe', media_url: 'https://example.com/a.png' },
        },
      ],
      edges: [],
    },
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('kgInferMediaKindFromUrl')) {
    throw new Error('expected exported html viewer to include url-based media kind inference')
  }
  if (!html.includes('kgInferMediaKindFromUrl2')) {
    throw new Error('expected exported html viewer to include extended media kind inference')
  }
  if (!html.includes("key.slice(-4) === '_fmt'") || !html.includes("key === 'format'")) {
    throw new Error('expected exported html viewer to treat neutral image format query hints as images')
  }
  if (!html.includes("inferredKind && (kind === 'iframe'")) {
    throw new Error('expected iframe kind to be overridden by inferred image kind')
  }
}

export async function testExportHtmlViewerHudIncludesModeToggles() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg })
  if (!html) throw new Error('expected html')
  if (!html.includes('kg-3d-toggle') || !html.includes('kg-rich-toggle') || !html.includes('kg-frontmatter-toggle')) {
    throw new Error('expected exported html viewer to include 3d/rich/frontmatter toggle controls')
  }
}

export async function testExportHtmlViewerMarkdownSnippetFormatHintImageAppearsInOverlayPoolAndHtml() {
  const snippet =
    '![remote image](https://assets.example/media_png/gdEn3pxzatSHAib7vomhHSibH0icqO2xD72VBSBEgWDypepymkibpnpmW9iczvnTShtBHPyGRN7MttLwmWbFCIz9MtLKtVxml3cXeO1icZ0DicibLew/640?asset_fmt=png&from=fixture)'
  const parsed = await loadGraphDataFromTextViaParser('inline/snippet-format-hint-image.md', snippet, { applyToStore: false })
  if (!parsed || !parsed.graphData) throw new Error('expected graphData from markdown snippet parser')
  const graphData = parsed.graphData
  const overlayNodes = listMediaOverlayNodes({
    enabled: true,
    nodes: graphData.nodes || [],
    poolMax: 24,
  })
  const expectedHost = 'assets.example/media_png/'
  const expectedQuery = 'asset_fmt=png'
  const inOverlayPool = overlayNodes.some(n => n.kind === 'image' && n.url.includes(expectedHost) && n.url.includes(expectedQuery))
  if (!inOverlayPool) {
    throw new Error('expected markdown snippet image format hint to appear in media overlay node pool')
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="n"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'snippet-format-hint-image',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes(expectedHost) || !html.includes(expectedQuery)) {
    throw new Error('expected markdown snippet image format hint to be embedded in html viewer runtime payload')
  }
}

export async function testExportHtmlViewerRuntimeSupportsCentroidFitAndTouchDrag() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="n"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    graphData: { nodes: [{ id: 'n', label: 'n', x: 0, y: 0 }], edges: [] } as any,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('getContentCentroid') || !html.includes('moveNodeDrag(-1')) {
    throw new Error('expected exported html viewer runtime to support centroid fit and touch node dragging')
  }
  if (!html.includes('startGroupDrag(gid, -1') || !html.includes('moveGroupDrag(-1') || !html.includes('moveHeaderDrag(-1')) {
    throw new Error('expected exported html viewer runtime to support touch group and header dragging from the canonical template')
  }
  if (!html.includes("if (!touches || touches.length === 0) {\n          try { endDrag(); } catch (e0) {}\n          touchDrag = null;\n        }")) {
    throw new Error('expected exported html viewer runtime to end active drag state when touch interaction fully ends')
  }
  if (!html.includes('function __kgUpdateGroupRectsForNodeId(nodeId){') || !html.includes('try { __kgUpdateGroupRectsForNodeId(nodeDrag.id); } catch (err0) {}')) {
    throw new Error('expected exported html viewer runtime to include canonical group-rect upkeep for node drags')
  }
  if (!html.includes("var linksRoot = svg.querySelector('[data-kg-layer=\"links\"]');") || !html.includes("if (linksRoot && !linksRoot.querySelector('[data-edge-id]')) {")) {
    throw new Error('expected exported html viewer runtime to include canonical late edge bootstrap when svg edge elements are missing')
  }
  if (!html.includes('state.k * baseSx0') || !html.includes('state.k * baseSy0')) {
    throw new Error('expected markdown drag conversion to account for base svg scaling to keep edges connected')
  }
  if (!html.includes('if (!hasMdBlocks0 && mdBoxById)')) {
    throw new Error('expected markdown overlay fallback offset sync when markdownBlocks payload is empty')
  }
  if (!html.includes('function __kgResolveNodeId(raw)')) {
    throw new Error('expected runtime node-id resolver for overlay/edge parity')
  }
  if (!html.includes("__kgResolveNodeId(String(ex.getAttribute('data-node-id') || '').trim())")) {
    throw new Error('expected runtime to normalize existing overlay node ids before edge sync')
  }
  if (!html.includes("__kgResolveNodeId(String(edgeEl.getAttribute('data-source-id') || edgeEl.getAttribute('data-source') || '').trim())")) {
    throw new Error('expected runtime to normalize edge endpoint ids before geometry sync')
  }
  if (!html.includes('if (overlayFollowAnimation && svg && svg.__kgNodeOffsetById) {') || !html.includes('if (oa && isFinite(oa.x) && isFinite(oa.y)) { x1 += Number(oa.x); y1 += Number(oa.y); }')) {
    throw new Error('expected runtime to apply overlay-follow endpoint offsets inside canonical edge geometry updates')
  }
  if (!html.includes("__kgResolveNodeId(String(ee.getAttribute('data-source-id') || ee.getAttribute('data-source') || '').trim())")) {
    throw new Error('expected runtime to normalize edge index ids for edgeRefsByNodeId')
  }
  if (html.includes("el.setAttribute('data-kg-canvas-wheel-ignore', 'true');")) {
    throw new Error('expected exported runtime overlays to not block wheel pan/zoom interactions')
  }
  if (html.includes("rootEl.addEventListener('wheel'")) {
    throw new Error('expected markdown panel runtime to not stop wheel propagation from canvas')
  }
  if (!html.includes('setMediaInteractive(false);')) {
    throw new Error('expected exported runtime to default media interactivity to pan/zoom-friendly mode')
  }
  if (!html.includes("var pointerMode = 'pan';")) {
    throw new Error('expected exported runtime to default to pan mode for viewer parity')
  }
}

export async function testExportHtmlViewerRuntimeRespectsInitialFrontmatterMode() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="n"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    initialFrontmatterEnabled: true,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('setFrontmatterEnabled(true);')) {
    throw new Error('expected exported html viewer runtime to honor initial frontmatter mode from workspace')
  }
}

export async function testExportHtmlViewerRuntimeFallsBackToRawMediaWhenProxyFails() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="n"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'm1', label: 'Media', type: 'Image', properties: { media_kind: 'image', media_url: 'https://assets.example/media/640?asset_fmt=png' } }],
      edges: [],
    },
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('imgEl.onerror = function()') || !html.includes('vid.onerror = function()')) {
    throw new Error('expected html viewer runtime to attach media proxy fallback handlers')
  }
  if (!html.includes("cur !== raw")) {
    throw new Error('expected html viewer runtime fallback to switch source from proxy to raw url')
  }
}

export async function testExportHtmlViewerEmbedsProvidedOverlayHtml() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const overlayHtml = '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1"><section>Overlay</section></article>'
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg, overlayHtml })
  if (!html) throw new Error('expected html')
  const normalizedOverlayHtml = '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1"><section>Overlay</section></article>'
  if (!html.includes(normalizedOverlayHtml)) {
    throw new Error('expected provided overlayHtml to be semantically embedded in exported viewer')
  }
}

export async function testExportHtmlViewerKeepsOnlyGraphLinkedOverlaySeedsInRuntimePayload() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g><g data-node-id="md-a"><circle cx="6" cy="0" r="5" fill="blue"/></g></svg>`
  const overlayHtml = [
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" data-kg-kind="image" data-kg-url="https://example.com/linked.png"></article>',
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="ghost" data-kg-kind="image" data-kg-url="https://example.com/disconnected.png"></article>',
    '<article data-md-id="md-1" data-kg-world-x="0" data-kg-world-y="0" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="md-a"></article>',
    '<article data-md-id="md-ghost" data-kg-world-x="10" data-kg-world-y="10" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="ghost"></article>',
  ].join('')
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    overlayHtml,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [
        { id: 'm1', label: 'Media 1', type: 'Entity', properties: { media_url: 'https://example.com/linked.png' } },
        { id: 'md-a', label: 'MD anchor', type: 'Entity', properties: {} },
      ],
      edges: [{ id: 'e1', source: 'm1', target: 'md-a', label: 'e1', properties: {} }],
    },
  })
  if (!html) throw new Error('expected html')
  const mediaNodes = readRuntimeJsonArray(html, 'mediaNodes') as Array<{ id?: string; url?: string }>
  const markdownBlocks = readRuntimeJsonArray(html, 'markdownBlocks') as Array<{ id?: string; anchorNodeId?: string }>
  if (!mediaNodes.some(n => String(n.id || '') === 'm1')) {
    throw new Error('expected runtime media payload to keep edge-linked media overlay')
  }
  if (mediaNodes.some(n => String(n.id || '') === 'ghost')) {
    throw new Error('expected runtime media payload to drop disconnected overlay node ids')
  }
  if (markdownBlocks.some(b => String(b.id || '') === 'md-ghost')) {
    throw new Error('expected runtime markdown payload to drop disconnected markdown overlays')
  }
  if (!markdownBlocks.some(b => String(b.anchorNodeId || '') === 'md-a')) {
    throw new Error('expected runtime markdown payload to keep graph-linked markdown overlays')
  }
}

export async function testExportHtmlViewerKeepsOnlyGraphLinkedOverlaySeedsWhenEdgesUseSourceIdTargetId() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g><g data-node-id="md-a"><circle cx="6" cy="0" r="5" fill="blue"/></g></svg>`
  const overlayHtml = [
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" data-kg-kind="image" data-kg-url="https://example.com/linked.png"></article>',
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="ghost" data-kg-kind="image" data-kg-url="https://example.com/disconnected.png"></article>',
    '<article data-md-id="md-1" data-kg-world-x="0" data-kg-world-y="0" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="md-a"></article>',
    '<article data-md-id="md-ghost" data-kg-world-x="10" data-kg-world-y="10" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="ghost"></article>',
  ].join('')
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    overlayHtml,
    includeRichMediaOverlays: true,
    graphData: {
      type: 'Graph',
      nodes: [
        { id: 'm1', label: 'Media 1', type: 'Entity', properties: { media_url: 'https://example.com/linked.png' } },
        { id: 'md-a', label: 'MD anchor', type: 'Entity', properties: {} },
      ],
      edges: [{ id: 'e1', sourceId: 'm1', targetId: 'md-a', label: 'e1', properties: {} }],
    } as any,
  })
  if (!html) throw new Error('expected html')
  const mediaNodes = readRuntimeJsonArray(html, 'mediaNodes') as Array<{ id?: string }>
  const markdownBlocks = readRuntimeJsonArray(html, 'markdownBlocks') as Array<{ id?: string }>
  if (!mediaNodes.some(n => String(n.id || '') === 'm1')) {
    throw new Error('expected runtime media payload to keep edge-linked media overlay (sourceId/targetId edge)')
  }
  if (mediaNodes.some(n => String(n.id || '') === 'ghost')) {
    throw new Error('expected runtime media payload to drop disconnected overlay node ids (sourceId/targetId edge)')
  }
  if (markdownBlocks.some(b => String(b.id || '') === 'md-ghost')) {
    throw new Error('expected runtime markdown payload to drop disconnected markdown overlays (sourceId/targetId edge)')
  }
}

export async function testExportHtmlViewerFiltersEmbeddedOverlayHtmlByGraphConnectivity() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g><g data-node-id="md-a"><circle cx="6" cy="0" r="5" fill="blue"/></g></svg>`
  const overlayHtml = [
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1"><section>Connected media</section></article>',
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="ghost"><section>Disconnected media</section></article>',
    '<article data-md-id="md-1" data-kg-world-x="0" data-kg-world-y="0" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="md-a"><section>Connected md</section></article>',
    '<article data-md-id="md-ghost" data-kg-world-x="10" data-kg-world-y="10" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="ghost"><section>Disconnected md</section></article>',
  ].join('')
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    overlayHtml,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'm1', label: 'Media' }, { id: 'md-a', label: 'Markdown anchor' }],
      edges: [{ id: 'e1', source: 'm1', target: 'md-a' }],
    } as any,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('Connected media') || !html.includes('Connected md')) {
    throw new Error('expected connected overlays to remain embedded in exported html')
  }
  if (html.includes('Disconnected media') || html.includes('Disconnected md') || html.includes('data-node-id=\"ghost\"')) {
    throw new Error('expected disconnected overlays to be removed from embedded overlay html')
  }
}

export async function testExportHtmlViewerPrefersInteractiveOverlayOverFixedDuplicate() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const overlayHtml = [
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" style="position:fixed;left:0;top:0"><section>Static duplicate</section></article>',
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1"><section>Interactive connected</section></article>',
  ].join('')
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    overlayHtml,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'm1', label: 'Media' }],
      edges: [{ id: 'e1', source: 'm1', target: 'm1' }],
    } as any,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('Interactive connected')) {
    throw new Error('expected non-fixed connected overlay to be kept')
  }
  const overlayMatch = html.match(/<section id="kg-overlay"[^>]*>([\s\S]*?)<\/section>\s*<script>/)
  const overlaySection = overlayMatch && overlayMatch[1] ? overlayMatch[1] : ''
  if (overlaySection.includes('Static duplicate') || overlaySection.includes('position:fixed;left:0;top:0')) {
    throw new Error('expected fixed-style duplicate overlay to be removed')
  }
}

export async function testExportHtmlViewerDedupesMarkdownByAnchorNode() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="a1"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const overlayHtml = [
    '<article data-md-id="md-a" data-kg-world-x="0" data-kg-world-y="0" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="a1"><section>A</section></article>',
    '<article data-md-id="md-b" data-kg-world-x="1" data-kg-world-y="1" data-kg-world-w="180" data-kg-world-h="120" data-kg-anchor-node-id="a1"><section>B</section></article>',
  ].join('')
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    overlayHtml,
    graphData: {
      type: 'Graph',
      nodes: [{ id: 'a1', label: 'Anchor' }],
      edges: [{ id: 'e1', source: 'a1', target: 'a1' }],
    } as any,
  })
  if (!html) throw new Error('expected html')
  const blocks = readRuntimeJsonArray(html, 'markdownBlocks') as Array<{ anchorNodeId?: string }>
  const anchorCount = blocks.filter(b => String(b.anchorNodeId || '').trim() === 'a1').length
  if (anchorCount !== 1) {
    throw new Error('expected markdown blocks to dedupe by shared anchor node id')
  }
}

export async function testExportHtmlViewerRuntimeScriptParsesWithOverlayHtml() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const overlayHtml =
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" data-kg-title="Overlay Media"><iframe src="about:blank" title="Overlay Media"></iframe></article>'
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg, overlayHtml })
  if (!html) throw new Error('expected html')
  const match = html.match(/<script>\n([\s\S]*?)\n\s*<\/script>/)
  const js = match && match[1] ? match[1] : ''
  if (!js.trim()) throw new Error('expected runtime script')
  if (!js.includes('var markdownBlocks =')) {
    throw new Error('expected runtime script to declare markdownBlocks payload before overlay logic')
  }
  if (!js.includes('var mediaNodes =') || js.indexOf('var markdownBlocks =') < js.indexOf('var mediaNodes =')) {
    throw new Error('expected runtime script to declare markdownBlocks directly after mediaNodes from the canonical template')
  }
  if (!js.includes("var richBtn = document.getElementById('kg-rich-toggle');") || !js.includes("var frontmatterBtn = document.getElementById('kg-frontmatter-toggle');") || !js.includes("var mode3dBtn = document.getElementById('kg-3d-toggle');")) {
    throw new Error('expected runtime script to declare the HUD toggle button handles in the canonical template')
  }
  if (!js.includes("window.addEventListener('keydown', function(e){") || !js.includes("if (k !== 'i') return;")) {
    throw new Error('expected runtime to own the keyboard media-toggle shortcut in the canonical template')
  }
  if (!js.includes('__kgMediaBoxById') || !js.includes('__kgMdBoxById')) {
    throw new Error('expected runtime to track overlay boxes for edge-to-panel anchoring')
  }
  if (!js.includes('state.k * baseSx') || !js.includes('state.k * baseSy')) {
    throw new Error('expected runtime to map world→screen using svgBase scaling for pan/zoom parity')
  }
  if (!js.includes('if ((!mediaNodes || mediaNodes.length === 0) && overlay && overlay.__kgMediaById)')) {
    throw new Error('expected runtime to hydrate media nodes from existing overlay dom map when payload list is empty')
  }
  if (!js.includes("mediaNodes.push({ id: mid0, title: mid0, url: '', openUrl: '', interactive: true, kind: 'iframe' });")) {
    throw new Error('expected runtime to synthesize media node entries for overlay pan/zoom sync fallback')
  }
  if (!js.includes("var openUrl = String((n && n.openUrl) || '');") || !js.includes("el.setAttribute('data-kg-open-url', openUrl);")) {
    throw new Error('expected runtime to normalize openUrl into canonical media payload attributes from the template')
  }
  if (!js.includes("el.setAttribute('data-kg-rich-media-render-surface', '1');") || !js.includes("el.setAttribute('data-kg-canvas-overlay-drag-handle', 'true');")) {
    throw new Error('expected runtime to synthesize only the widget rich media render surface')
  }
  if (js.includes("toolbar.setAttribute('data-kg-rich-media-floating-toolbar', '1');")
    || js.includes("openBtn.setAttribute('data-kg-rich-media-open-source', '1');")
    || js.includes("var toolbar = document.createElement('section');")) {
    throw new Error('expected runtime template to avoid synthesizing a duplicate Rich Media floating toolbar variant')
  }
  if (js.includes('kg-mediaHeader') || js.includes('kg-mediaTitle') || js.includes('data-kg-media-panel-header')) {
    throw new Error('expected runtime template to remove legacy rich media header markers at the source')
  }
  if (js.includes('overlay.__kgMediaById[id] = el;') || !js.includes('overlay.appendChild(panel);') || !js.includes('overlay.__kgMediaById[id] = panel;')) {
    throw new Error('expected runtime template to use the canonical rich media panel tail')
  }
  if (!js.includes('var inferredKind = kgInferMediaKindFromUrl2(url) || kgInferMediaKindFromUrl(url);') || !js.includes('var inferred = (typeof kgInferMediaKindFromUrl2 === \"function\" ? kgInferMediaKindFromUrl2(url0) : \"\") || kgInferMediaKindFromUrl(url0);')) {
    throw new Error('expected runtime to use extended inferred-kind normalization for both media payload creation and media element rehydration')
  }
  if (!js.includes('imgEl.src = kgResolveMediaSrc(url, kind);') || !js.includes('vid.src = kgResolveMediaSrc(url, kind);') || !js.includes("iframe.setAttribute('sandbox', kgResolveIframeSandbox(url));")) {
    throw new Error('expected runtime to own canonical media element source setup and iframe sandboxing from the template')
  }
  if (!js.includes("el.addEventListener('click', function(ev){") || !js.includes("window.open(open, '_blank', 'noopener,noreferrer');")) {
    throw new Error('expected runtime to own canonical media click-through handling from the template')
  }
  if (!js.includes('overlay.__kgMdById[id] || (anchorId0 && overlay.__kgMdById[anchorId0])')) {
    throw new Error('expected runtime to avoid duplicate markdown panel dom when existing overlay panel is present')
  }
  if (!js.includes("if (anchorId0) overlay.__kgMdById[anchorId0] = el;")) {
    throw new Error('expected runtime to index generated markdown panel dom by anchor node id for edge sync')
  }
  if (!js.includes('var __kgMdDrag = null;') || !js.includes('function installMarkdownBlockInteractions(){') || !js.includes('try { installMarkdownBlockInteractions(); } catch (e0) {}')) {
    throw new Error('expected runtime to own markdown block interaction install logic in the canonical template')
  }
  try {
    new Function(js)
  } catch (e) {
    throw new Error(`expected runtime script to parse, got: ${String((e as Error)?.message || e)}`)
  }
}

export async function testExportHtmlViewerMediaInteractivityDefaultsOn() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg })
  if (!html) throw new Error('expected html')
  if (!html.includes('--kg-media-pointer-events:auto')) {
    throw new Error('expected exported viewer to default to media interactivity enabled')
  }
  if (!html.includes('var mediaInteractive = true;')) {
    throw new Error('expected runtime mediaInteractive default to be true')
  }
  if (!html.includes("var pe = (mediaInteractive && pointerMode !== 'pan'")) {
    throw new Error('expected exported viewer to compute media pointer-events from mode state')
  }
}

export async function testExportHtmlViewerMediaPointerEventsRespectsNodeInteractivity() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg })
  if (!html) throw new Error('expected html')
  if (!html.includes('var interactive0 = !!n.interactive;')) {
    throw new Error('expected runtime to apply media pointer-events per node interactive flag')
  }
  if (!html.includes("el.style.pointerEvents = perPe")) {
    throw new Error('expected runtime to set inline pointerEvents per media element')
  }
}

export async function testExportHtmlViewerDoesNotInferLocalhostProxyOrigin() {
  const bootstrap = typeof document === 'undefined' ? initJsdomHarness() : null
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
    const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg })
    if (!html) throw new Error('expected html')
    if (html.includes('var AG_PROXY_ORIGIN = "http://localhost')) {
      throw new Error('expected exported html viewer to avoid build-host localhost proxy origins')
    }
    if (!html.includes('var AG_PROXY_ORIGIN = "";') || !html.includes('var AG_ALLOW_RUNTIME_NETWORK = false;')) {
      throw new Error('expected exported html viewer to default to offline runtime mode')
    }
  } finally {
    bootstrap?.restore()
  }
}

export async function testExportHtmlViewerExplicitRuntimeNetworkKeepsProxyOrigin() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    proxyOrigin: 'http://localhost:5173',
    allowRuntimeNetwork: true,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('var AG_PROXY_ORIGIN = "http://localhost:5173";') || !html.includes('var AG_ALLOW_RUNTIME_NETWORK = true;')) {
    throw new Error('expected explicit runtime networking to preserve the requested local proxy origin')
  }
}

export async function testExportHtmlViewerInlinesRemoteMediaAtExportTime() {
  const g = globalThis as unknown as {
    fetch?: typeof fetch
    Response?: typeof Response
  }
  const prevFetch = g.fetch
  if (typeof g.Response !== 'function') throw new Error('Response constructor unavailable')
  g.fetch = (async () => new g.Response!(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g></svg>`
    const html = await buildGraphHtmlViewerMarkup({
      title: 'T',
      svgMarkup: svg,
      includeRichMediaOverlays: true,
      inlineRemoteMediaAssets: true,
      graphData: {
        type: 'Graph',
        nodes: [{ id: 'm1', label: 'Media', type: 'Entity', properties: { media_url: 'https://assets.example.test/a.png' } }],
        edges: [],
      },
    })
    if (!html) throw new Error('expected html')
    const mediaNodes = readRuntimeJsonArray(html, 'mediaNodes') as Array<{ url?: string; openUrl?: string }>
    const first = mediaNodes[0]
    if (!first || !String(first.url || '').startsWith('data:image/png;base64,AQID')) {
      throw new Error(`expected remote media to be inlined into the runtime payload, got ${String(first?.url || '')}`)
    }
    if (String(first.openUrl || '') !== 'https://assets.example.test/a.png') {
      throw new Error('expected inlined media to preserve the source URL as openUrl')
    }
  } finally {
    if (prevFetch) g.fetch = prevFetch
    else delete g.fetch
  }
}

export async function testExportHtmlViewerOverlayExportPreservesInteractionGuards() {
  const bootstrap = typeof document === 'undefined' ? initJsdomHarness() : null
  try {
  const root = document.createElement('section')
  const panel = document.createElement('article')
  panel.setAttribute('data-kg-rich-media-panel', '1')
  panel.setAttribute('data-kg-rich-media-render-surface', '1')
  panel.setAttribute('data-kg-canvas-overlay-drag-handle', 'true')
  panel.setAttribute('data-node-id', 'm1')
  panel.setAttribute('data-kg-canvas-pointer-ignore', 'true')
  panel.setAttribute('data-kg-canvas-wheel-ignore', 'true')
  panel.style.pointerEvents = 'auto'
  panel.style.touchAction = 'none'
  panel.style.userSelect = 'none'
  panel.innerHTML = '<a aria-label="Overlay Media" href="https://example.com/open"></a><section style="pointer-events:auto">B</section>'
  root.appendChild(panel)

  const html = captureLiveRichMediaOverlayHtmlForHtmlViewerExport({ overlayRootEl: root })
  if (!html) throw new Error('expected overlay html')
  if (!html.includes('data-kg-canvas-pointer-ignore') || !html.includes('data-kg-canvas-wheel-ignore')) {
    throw new Error('expected overlay export to preserve canvas ignore attributes')
  }
  if (!html.toLowerCase().includes('pointer-events')) {
    throw new Error('expected overlay export to preserve pointer-events inline styles')
  }
  } finally {
    bootstrap?.restore()
  }
}

export async function testExportHtmlViewerOverlayExportStripsTransformPositioning() {
  const bootstrap = typeof document === 'undefined' ? initJsdomHarness() : null
  try {
    const root = document.createElement('section')

    const panel = document.createElement('article')
    panel.setAttribute('data-kg-rich-media-panel', '1')
    panel.setAttribute('data-kg-rich-media-render-surface', '1')
    panel.setAttribute('data-kg-canvas-overlay-drag-handle', 'true')
    panel.setAttribute('data-node-id', 'm1')
    panel.style.position = 'absolute'
    panel.style.left = '123px'
    panel.style.top = '456px'
    panel.style.transform = 'translate3d(12px,34px,0)'
    panel.style.zIndex = '999'
    panel.innerHTML = '<a aria-label="Overlay Media" href="https://example.com/open"></a><section>B</section>'
    root.appendChild(panel)

    const html = captureLiveRichMediaOverlayHtmlForHtmlViewerExport({ overlayRootEl: root })
    if (!html) throw new Error('expected overlay html')
  const htmlLower = html.toLowerCase()
  if (htmlLower.includes('transform:') || htmlLower.includes('translate(') || htmlLower.includes('translate3d(')) {
      throw new Error('expected overlay export to strip transform positioning styles for edge connectivity')
    }
    if (
      htmlLower.includes('left:') ||
      htmlLower.includes('top:') ||
      htmlLower.includes('right:') ||
      htmlLower.includes('bottom:') ||
      htmlLower.includes('position:')
    ) {
      throw new Error('expected overlay export to strip absolute positioning styles for runtime pan/zoom fidelity')
    }
    if (htmlLower.includes('z-index:') || htmlLower.includes('width:') || htmlLower.includes('height:')) {
      throw new Error('expected overlay export to strip size/z-index styles for runtime layout fidelity')
    }
    if (!htmlLower.includes('display:none') && !htmlLower.includes('display: none')) {
      throw new Error('expected overlay export to hide panels until runtime positions them')
    }

    const mdRoot = document.createElement('section')
    const block = document.createElement('section')
    block.setAttribute('data-md-id', 'b1')
    block.style.position = 'absolute'
    block.style.left = '10px'
    block.style.top = '20px'
    block.style.transform = 'translate(1px,2px)'
    block.innerHTML = '<table><tr><td>t</td></tr></table>'
    mdRoot.appendChild(block)

    const mdHtml = captureLiveMarkdownDesignOverlayHtmlForHtmlViewerExport({ overlayRootEl: mdRoot })
    if (!mdHtml) throw new Error('expected markdown overlay html')
  const mdLower = mdHtml.toLowerCase()
  if (mdLower.includes('transform:') || mdLower.includes('translate(') || mdLower.includes('translate3d(')) {
      throw new Error('expected markdown overlay export to strip transform positioning styles for edge connectivity')
    }
    if (
      mdLower.includes('left:') ||
      mdLower.includes('top:') ||
      mdLower.includes('right:') ||
      mdLower.includes('bottom:') ||
      mdLower.includes('position:')
    ) {
      throw new Error('expected markdown overlay export to strip absolute positioning styles for runtime pan/zoom fidelity')
    }
    if (mdLower.includes('z-index:') || mdLower.includes('width:') || mdLower.includes('height:')) {
      throw new Error('expected markdown overlay export to strip size/z-index styles for runtime layout fidelity')
    }
    if (!mdLower.includes('display:none') && !mdLower.includes('display: none')) {
      throw new Error('expected markdown overlay export to hide blocks until runtime positions them')
    }
  } finally {
    bootstrap?.restore()
  }
}

export async function testExportHtmlViewerOverlayExportCollectsFlowAnd3dRoots() {
  const bootstrap = typeof document === 'undefined' ? initJsdomHarness() : null
  try {
    const flowRoot = document.createElement('section')
    flowRoot.setAttribute('aria-label', 'Flow media overlay')
    const flowPanel = document.createElement('article')
    flowPanel.setAttribute('data-kg-rich-media-panel', '1')
    flowPanel.setAttribute('data-kg-rich-media-render-surface', '1')
    flowPanel.setAttribute('data-kg-canvas-overlay-drag-handle', 'true')
    flowPanel.setAttribute('data-node-id', 'flow-media-1')
    flowPanel.textContent = 'Flow'
    flowRoot.appendChild(flowPanel)
    document.body.appendChild(flowRoot)

    const threeRoot = document.createElement('section')
    threeRoot.setAttribute('aria-label', '3D media overlay')
    const threePanel = document.createElement('article')
    threePanel.setAttribute('data-kg-rich-media-panel', '1')
    threePanel.setAttribute('data-kg-rich-media-render-surface', '1')
    threePanel.setAttribute('data-kg-canvas-overlay-drag-handle', 'true')
    threePanel.setAttribute('data-node-id', 'three-media-1')
    threePanel.textContent = 'Three'
    threeRoot.appendChild(threePanel)
    document.body.appendChild(threeRoot)

    const mdRoot = document.createElement('section')
    mdRoot.setAttribute('aria-label', 'Flow media overlay')
    const mdPanel = document.createElement('article')
    mdPanel.setAttribute('data-md-id', 'md-flow-1')
    mdPanel.textContent = 'Markdown'
    mdRoot.appendChild(mdPanel)
    document.body.appendChild(mdRoot)

    const html = captureLiveOverlayHtmlForHtmlViewerExport()
    if (!html) throw new Error('expected overlay html')
    if (!html.includes('flow-media-1') || !html.includes('three-media-1')) {
      throw new Error('expected overlay export to include flow and 3d media roots')
    }
    if (!html.includes('md-flow-1')) {
      throw new Error('expected overlay export to include markdown blocks from flow overlay root')
    }
  } finally {
    bootstrap?.restore()
  }
}

export async function testExportHtmlViewerSeedsOverlayPanelsIntoRuntimePayloads() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40"><g data-node-id="m1"><circle cx="0" cy="0" r="5" fill="red"/></g><g data-node-id="n1"><circle cx="10" cy="10" r="5" fill="blue"/></g><line data-edge-id="e1" data-source-id="m1" data-target-id="n1" x1="0" y1="0" x2="10" y2="10"/></svg>`
  const overlayHtml =
    '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" data-kg-title="Overlay Media" data-kg-kind="iframe" data-kg-url="https://example.com/media" data-kg-open-url="https://example.com/open"><iframe src="https://example.com/media" title="Overlay Media"></iframe></article>' +
    '<article data-md-id="b1" data-kg-anchor-node-id="n1" data-kg-world-x="-4" data-kg-world-y="-6" data-kg-world-w="12" data-kg-world-h="8"><header class="kg-mdHeader"><h3 class="kg-mdTitle">MD Block</h3></header></article>'
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    graphData: {
      nodes: [{ id: 'm1', label: 'm1', x: 0, y: 0 }, { id: 'n1', label: 'n1', x: 10, y: 10 }],
      edges: [{ id: 'e1', source: 'm1', target: 'n1' }],
    } as any,
    includeRichMediaOverlays: true,
    overlayHtml,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('"id":"m1"') || !html.includes('https://example.com/media')) {
    throw new Error('expected overlay media panel to seed runtime media payload')
  }
  if (!html.includes('data-md-id="b1"') || !html.includes('data-kg-anchor-node-id="n1"')) {
    throw new Error('expected overlay markdown panel canonical attributes to be preserved in exported html')
  }
  if (html.includes('data-kg-markdown-design-block="b1"')) {
    throw new Error('expected exported html to remove legacy markdown overlay identity aliases')
  }
  if (!html.includes('data-kg-world-x="-4"') || !html.includes('data-kg-world-w="12"')) {
    throw new Error('expected overlay markdown world geometry attributes to be preserved')
  }
}

export async function testExportHtmlViewerSeedsNodePositionsFromOverlayMarkdownWorldAttrs() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40"><g data-node-id="n2"><circle cx="10" cy="10" r="5" fill="blue"/></g><line data-edge-id="e1" data-source-id="n1" data-target-id="n2" x1="0" y1="0" x2="10" y2="10"/></svg>`
  const overlayHtml =
    '<article data-md-id="b1" data-kg-anchor-node-id="n1" data-kg-world-x="-4" data-kg-world-y="-6" data-kg-world-w="12" data-kg-world-h="8"><header class="kg-mdHeader"><h3 class="kg-mdTitle">MD Block</h3></header></article>'
  const html = await buildGraphHtmlViewerMarkup({
    title: 'T',
    svgMarkup: svg,
    graphData: {
      nodes: [{ id: 'n1', label: 'n1' }, { id: 'n2', label: 'n2', x: 10, y: 10 }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    } as any,
    includeRichMediaOverlays: true,
    overlayHtml,
  })
  if (!html) throw new Error('expected html')
  if (!html.includes('"n1":{"x":2,"y":-2}')) {
    throw new Error('expected missing node position to be seeded from overlay markdown world geometry')
  }
}

export async function testExportHtmlViewerMarkdownOverlaySupportsAnchorNodeIds() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20"><g data-node-id="n1"><circle cx="0" cy="0" r="5" fill="red"/></g><g data-kg-layer="markdown-design-blocks"><foreignObject x="-5" y="-5" width="10" height="10" data-kg-markdown-block-id="b1" data-kg-anchor-node-id="n1"></foreignObject></g></svg>`
  const overlayHtml =
    '<article data-md-id="b1" data-kg-anchor-node-id="n1"><section><table><tr><td>T</td></tr></table></section></article>'
  const html = await buildGraphHtmlViewerMarkup({ title: 'T', svgMarkup: svg, overlayHtml })
  if (!html) throw new Error('expected html')
  if (!html.includes('data-kg-anchor-node-id')) {
    throw new Error('expected runtime to map existing markdown overlays by anchor node id')
  }
  if (!html.includes('if (xanchor) overlay.__kgMdById[xanchor] = ex;')) {
    throw new Error('expected runtime to index markdown overlays by anchor node id')
  }
  if (!html.includes('data-md-id="b1"')) {
    throw new Error('expected exported html to preserve canonical markdown overlay identity on data-md-id')
  }
  if (html.includes('data-kg-markdown-design-block="b1"')) {
    throw new Error('expected exported html to avoid the removed legacy markdown overlay identity alias')
  }
  if (!html.includes('data-kg-anchor-node-id="n1"')) {
    throw new Error('expected provided overlay html to preserve markdown anchor node id')
  }
}
