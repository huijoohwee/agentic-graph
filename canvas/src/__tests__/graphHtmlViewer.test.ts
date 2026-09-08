import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { captureLiveRichMediaOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { captureLiveMarkdownDesignOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { captureLiveOverlayHtmlForHtmlViewerExport } from '@/lib/graph/htmlViewer/liveOverlayExport'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

import { readRuntimeJsonArray } from './helpers/htmlViewerRuntimeHarness'

const stripOpaqueHtmlBlocks = (html: string): string => {
  return String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
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
  if (/<div\b|<\/div>/i.test(visibleHtml)) {
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

export {
  testExportHtmlViewerIsSvgOnlyAndBlocksBrowserZoomAndSelection,
  testExportHtmlViewerRendersProxiedImageAndVideoInline,
  testExportHtmlViewerTreatsIFrameKindWithImageUrlAsImage,
  testExportHtmlViewerHudIncludesModeToggles,
  testExportHtmlViewerRuntimeSupportsCentroidFitAndTouchDrag,
  testExportHtmlViewerRuntimeRespectsInitialFrontmatterMode,
  testExportHtmlViewerRuntimeFallsBackToRawMediaWhenProxyFails,
  testExportHtmlViewerRuntimeScriptParsesWithOverlayHtml,
  testExportHtmlViewerMediaInteractivityDefaultsOn,
  testExportHtmlViewerMediaPointerEventsRespectsNodeInteractivity,
  testExportHtmlViewerDoesNotInferLocalhostProxyOrigin,
  testExportHtmlViewerExplicitRuntimeNetworkKeepsProxyOrigin,
  testExportHtmlViewerMarkdownOverlaySupportsAnchorNodeIds,
} from './graphHtmlViewerRuntimeBehavior.test'
