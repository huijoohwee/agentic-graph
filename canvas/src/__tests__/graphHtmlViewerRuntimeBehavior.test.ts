import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { readRuntimeInput, runHtmlViewer, viewerNode, viewerSvg } from './helpers/htmlViewerRuntimeHarness'

type BuildArgs = Parameters<typeof buildGraphHtmlViewerMarkup>[0]
type Viewer = ReturnType<typeof runHtmlViewer>
const ensure: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message) }
const near = (actual: number, expected: number, message: string) => ensure(Math.abs(actual - expected) < 0.01, `${message}: ${actual} != ${expected}`)
const markup = async (args: BuildArgs = {}) => {
  const html = await buildGraphHtmlViewerMarkup({ title: 'Runtime behavior', svgMarkup: viewerSvg(viewerNode('m1')), initialView: { k: 1, x: 0, y: 0 }, ...args })
  ensure(html, 'Expected standalone HTML'); return html
}
const mediaNode = (id: string, url: string, properties: Record<string, unknown> = {}) => ({ id, label: id, type: 'Entity', properties: { media_url: url, ...properties } })
const mediaArgs = (nodes = [mediaNode('m1', 'https://example.com/movie.mp4')]): BuildArgs => ({
  svgMarkup: viewerSvg(nodes.map((n, i) => viewerNode(n.id, 100 + i * 180, 100)).join('')),
  includeRichMediaOverlays: true, graphData: { type: 'Graph', nodes, edges: [] }, mediaOverlayPoolMax: 12,
})
const panel = (v: Viewer, id = 'm1') => {
  const el = v.doc.querySelector<HTMLElement>(`#kg-overlay [data-node-id="${id}"][data-kg-rich-media-panel="1"]`)
  ensure(el, `Expected media panel ${id}`); return el
}
const mediaSurface = (v: Viewer, id = 'm1') => {
  const el = panel(v, id).querySelector<HTMLElement>('iframe,img,video,audio')
  ensure(el, `Expected media content ${id}`); return el
}
const wheel = (v: Viewer, target: Element = v.root) => {
  const event = new v.win.WheelEvent('wheel', { deltaY: -100, clientX: 320, clientY: 240, ctrlKey: true, bubbles: true, cancelable: true })
  target.dispatchEvent(event); return event
}
const pointerDrag = (v: Viewer, target: Element) => {
  v.pointer(target, 'pointerdown', 100, 100)
  v.pointer(v.root, 'pointermove', 140, 120)
  v.pointer(v.root, 'pointerup', 140, 120)
  v.flush()
}
const touchDrag = (v: Viewer, target: Element) => {
  const event = v.touch(target, 'touchstart', [[100, 100]])
  ensure(event.defaultPrevented, `Touch drag must consume the initiating event for ${target.outerHTML.slice(0,160)}`)
  v.touch(v.root, 'touchmove', [[120, 110]])
  v.touch(v.root, 'touchmove', [[140, 120]])
  v.touch(v.root, 'touchend', [])
  v.flush()
}
const nodeTransform = (v: Viewer, id: string) => v.svg.querySelector(`[data-node-id="${id}"]`)?.getAttribute('transform')

export async function testExportHtmlViewerIsSvgOnlyAndBlocksBrowserZoomAndSelection() {
  const html = await markup({ svgMarkup: viewerSvg(viewerNode('m1', 130, 90)) })
  const v = runHtmlViewer(html)
  try {
    const viewport = v.doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
    ensure(viewport.includes('maximum-scale=1') && viewport.includes('user-scalable=no'), 'Viewport must block browser zoom')
    ensure(v.win.getComputedStyle(v.root).userSelect === 'none', 'Viewer selection must be disabled')
    ensure(!v.doc.querySelector('#kg-imgWrap, #kg-img, img'), 'SVG-only viewer must not contain image fallback')
    ensure(v.svg.querySelector('[data-node-id="m1"]'), 'Original SVG node must remain mounted')
    const before = v.matrix()
    for (let i = 0; i < 10; i += 1) ensure(wheel(v).defaultPrevented, 'Canvas wheel must prevent browser zoom')
    ensure(v.frames.size <= 3, `Burst wheel updates must coalesce, got ${v.frames.size} pending frames`)
    v.flush()
    ensure(v.matrix()[0] > before[0], 'Wheel must zoom the actual SVG')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
  const media = runHtmlViewer(await markup(mediaArgs()))
  try {
    const el = panel(media)
    ensure(el.getAttribute('data-kg-rich-media-render-surface') === '1', 'Expected canonical widget media surface')
    ensure(!media.doc.querySelector('[data-kg-rich-media-floating-toolbar], [data-kg-rich-media-open-source]'), 'No duplicate legacy rich-media toolbar')
    media.key('i')
    ensure(mediaSurface(media).style.pointerEvents === 'auto', 'Media shortcut must enable interaction')
    media.key(' ')
    ensure(mediaSurface(media).style.pointerEvents === 'none', 'Holding Space must disable media hit-testing for pan')
    media.key(' ', 'keyup')
    ensure(mediaSurface(media).style.pointerEvents === 'auto', 'Releasing Space must restore media interaction')
    const before = nodeTransform(media, 'm1')
    pointerDrag(media, el)
    ensure(nodeTransform(media, 'm1') !== before, 'Dragging media chrome must move its anchored SVG node')
    ensure(panel(media) === el, 'Dragging must retain the original media panel')
  } catch (error) { media.captureFailure(error); throw error } finally { media.close() }
}

export async function testExportHtmlViewerRendersProxiedImageAndVideoInline() {
  const raw = ['https://example.com/generated.webp', 'https://example.com/generated.mp4']
  const nodes = raw.map((url, i) => mediaNode(i ? 'vid1' : 'img1', '/__chat_asset_proxy?url=' + encodeURIComponent(url)))
  const html = await markup({ ...mediaArgs(nodes), allowRuntimeNetwork: true, proxyOrigin: 'http://localhost:5173' })
  const input = readRuntimeInput(html).mediaNodesJson as Array<Record<string, unknown>>
  // The browser builder may unwrap relative proxies; either representation must retain the exact resource.
  const resource = (url: unknown) => new URL(String(url), 'https://standalone.test/').searchParams.get('url') || String(url)
  for (const [i, id] of ['img1', 'vid1'].entries()) {
    const entry = input.find(n => n.id === id)
    ensure(resource(entry?.url) === raw[i] && resource(entry?.openUrl) === raw[i], 'Standalone payload must retain the decoded media resource')
    ensure(entry.kind === (i ? 'video' : 'image'), 'Proxy media must retain its inline media kind')
  }
  const v = runHtmlViewer(html)
  try {
    for (const [i, id] of ['img1', 'vid1'].entries()) {
      const el = panel(v, id).querySelector(i ? 'video' : 'img')
      ensure(el, `Expected inline ${i ? 'video' : 'image'}`)
      ensure(decodeURIComponent(el.getAttribute('src') || '').includes(raw[i]), 'Media source must resolve to the original resource')
    }
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerTreatsIFrameKindWithImageUrlAsImage() {
  const urls = ['https://example.com/a.png', 'https://example.com/asset?asset_fmt=png', 'https://example.com/asset?format=webp']
  const nodes = urls.map((url, i) => mediaNode(`m${i}`, url, { media_kind: 'iframe' }))
  const html = await markup({ ...mediaArgs(nodes), allowRuntimeNetwork: true })
  const input = readRuntimeInput(html).mediaNodesJson as Array<Record<string, unknown>>
  const v = runHtmlViewer(html, { mediaNodesJson: input.map(node => ({ ...node, kind: 'iframe' })) })
  try {
    for (let i = 0; i < urls.length; i += 1) {
      ensure(panel(v, `m${i}`).querySelector('img'), 'Image extension and neutral format hints must override iframe kind')
      ensure(!panel(v, `m${i}`).querySelector('iframe'), 'Inferred image must not become an iframe')
    }
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerHudIncludesModeToggles() {
  const v = runHtmlViewer(await markup(mediaArgs()))
  try {
    const ids = ['kg-3d-toggle', 'kg-rich-toggle', 'kg-media-toggle', 'kg-frontmatter-toggle']
    const missing = ids.filter(id => !v.doc.querySelector(`#kg-hud button#${id}`))
    ensure(!missing.length, `Documented exported HUD controls are missing: ${missing.join(', ')}`)
    const identity = v.svg.querySelector('[data-node-id="m1"]')
    const overlay = v.doc.getElementById('kg-overlay')!
    ;(v.doc.getElementById('kg-rich-toggle') as HTMLElement).click()
    ensure(overlay.style.display === 'none', 'Rich toggle must hide overlays')
    ;(v.doc.getElementById('kg-rich-toggle') as HTMLElement).click()
    ensure(overlay.style.display !== 'none', 'Rich toggle must restore overlays')
    ;(v.doc.getElementById('kg-media-toggle') as HTMLElement).click()
    ensure(mediaSurface(v).style.pointerEvents === 'auto', 'Media toggle must enable media interaction')
    ;(v.doc.getElementById('kg-frontmatter-toggle') as HTMLElement).click()
    ensure(v.root.classList.contains('kg-frontmatter'), 'FM toggle must enable the frontmatter view')
    ensure((v.doc.getElementById('kg-3d-toggle') as HTMLButtonElement).disabled, 'A viewer without 3D payload must disable the unavailable renderer')
    ensure(v.svg.querySelector('[data-node-id="m1"]') === identity, 'View-only toggles must preserve graph identity')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
  const payload = JSON.stringify({ nodes: [{ id: 'm1', x: 100, y: 100, z: 0 }], edges: [] }).replace(/"/g, '&quot;')
  const svg = viewerSvg(viewerNode('m1')).replace('<svg ', `<svg data-kg-3d-payload="${payload}" `)
  const spatial = runHtmlViewer(await markup({ svgMarkup: svg, preferWebgl3d: false }))
  try {
    const control = spatial.doc.getElementById('kg-3d-toggle') as HTMLButtonElement
    ensure(!control.disabled, 'A valid 3D payload must enable the renderer control')
    const identity = spatial.svg.querySelector('[data-node-id="m1"]')
    control.click(); ensure(spatial.root.classList.contains('kg-canvas3d'), '3D toggle must change renderer posture')
    control.click(); ensure(!spatial.root.classList.contains('kg-canvas3d'), '3D toggle must restore 2D posture')
    ensure(spatial.svg.querySelector('[data-node-id="m1"]') === identity, 'Renderer toggles must preserve source node identity')
  } catch (error) { spatial.captureFailure(error); throw error } finally { spatial.close() }
}

export async function testExportHtmlViewerRuntimeSupportsCentroidFitAndTouchDrag() {
  const svgMarkup = viewerSvg(viewerNode('n1', 100, 100) + viewerNode('n2', 300, 100) + '<g data-kg-layer="links"></g><g data-kg-group-id="g1"><rect data-kg-shape="group-rect" x="70" y="70" width="260" height="60"/></g>')
  const html = await markup({ svgMarkup, allowNodeDrag: true, allowGroupDrag: true, snapGridEnabled: false,
    graphData: { nodes: [{ id: 'n1', x: 900, y: 900 }, { id: 'n2', x: 800, y: 800 }], edges: [{ id: 'e1', source: 'n1', target: 'n2' }] } as any })
  const v = runHtmlViewer(html, { groupMembersByIdJson: { g1: ['n1', 'n2'] } })
  try {
    ;(v.doc.getElementById('kg-fit') as HTMLElement).click(); v.flush()
    const fit = v.matrix()
    near(200 * fit[0] + fit[4], 320, 'Fit must center SVG-derived node centroid horizontally')
    near(100 * fit[0] + fit[5], 240, 'Fit must center SVG-derived node centroid vertically')
    ;(v.doc.getElementById('kg-reset') as HTMLElement).click(); v.flush()
    const n1 = v.svg.querySelector('[data-node-id="n1"]')!
    const group = v.svg.querySelector('[data-kg-group-id="g1"]')!
    const edge = v.svg.querySelector('[data-edge-id="e1"]')!
    ensure(edge, 'Missing SVG edges must be bootstrapped from graph data')
    const edgeBefore = edge.outerHTML
    const groupBefore = group.outerHTML
    touchDrag(v, n1)
    ensure(nodeTransform(v, 'n1')?.includes('140,120'), 'Touch node drag must update SVG world geometry')
    ensure(edge.outerHTML !== edgeBefore, 'Touch node drag must update connected edge geometry')
    ensure(group.outerHTML !== groupBefore, 'Touch node drag must update its group bounds')
    const ended = nodeTransform(v, 'n1')
    v.touch(v.root, 'touchmove', [[180, 160]])
    ensure(nodeTransform(v, 'n1') === ended, 'Touch end must release node drag state')
    const n2Before = nodeTransform(v, 'n2')
    touchDrag(v, group)
    ensure(nodeTransform(v, 'n1') !== ended && nodeTransform(v, 'n2') !== n2Before, 'Touch group drag must move both members')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
  const media = runHtmlViewer(await markup({ ...mediaArgs(), allowNodeDrag: true, snapGridEnabled: false }))
  try {
    const before = nodeTransform(media, 'm1')
    touchDrag(media, panel(media))
    ensure(nodeTransform(media, 'm1') !== before, 'Touch media chrome drag must move the anchor node')
    ensure(wheel(media, panel(media)).defaultPrevented, 'Overlay wheel events must reach canvas zoom')
  } catch (error) { media.captureFailure(error); throw error } finally { media.close() }
}

export async function testExportHtmlViewerRuntimeRespectsInitialFrontmatterMode() {
  const html = await markup({ initialFrontmatterEnabled: true, svgMarkup: viewerSvg(viewerNode('visible') + viewerNode('hidden', 200)) })
  ensure(readRuntimeInput(html).initialFrontmatterEnabled === true, 'Export must transport initial frontmatter mode')
  const v = runHtmlViewer(html, { frontmatterVisibilityJson: { nodeIds: ['visible'], edgeIds: [] } })
  try {
    ensure(v.root.classList.contains('kg-frontmatter'), 'Initial frontmatter mode must activate the view')
    ensure((v.svg.querySelector('[data-node-id="hidden"]') as SVGElement).style.display === 'none', 'Initial mode must hide non-frontmatter nodes')
    ensure((v.svg.querySelector('[data-node-id="visible"]') as SVGElement).style.display !== 'none', 'Initial mode must retain allowed nodes')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerRuntimeFallsBackToRawMediaWhenProxyFails() {
  const urls = ['https://assets.example/media?asset_fmt=png', 'https://assets.example/movie.mp4']
  const html = await markup({ ...mediaArgs(urls.map((url, i) => mediaNode(`m${i}`, url))), allowRuntimeNetwork: true, proxyOrigin: 'http://localhost:5173' })
  const v = runHtmlViewer(html)
  try {
    for (const [i, selector] of ['img', 'video'].entries()) {
      const el = panel(v, `m${i}`).querySelector(selector)!
      ensure(el, `Expected ${selector} proxy fallback fixture`)
      ensure(el.getAttribute('src') !== urls[i], 'Enabled proxy must be tried first')
      el.dispatchEvent(new v.win.Event('error'))
      ensure(el.getAttribute('src') === urls[i], 'Failed proxy must fall back to the raw media URL')
      el.dispatchEvent(new v.win.Event('error'))
      ensure(el.getAttribute('src') === urls[i], 'Raw-source failure must not restart a proxy loop')
    }
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerRuntimeScriptParsesWithOverlayHtml() {
  const overlayHtml = '<article data-kg-rich-media-panel="1" data-kg-rich-media-render-surface="1" data-kg-canvas-overlay-drag-handle="true" data-node-id="m1" data-kg-title="Overlay Media"><iframe src="about:blank" title="Overlay Media"></iframe></article>'
  const html = await markup({ overlayHtml })
  const v = runHtmlViewer(html, { mediaNodesJson: [] })
  try {
    const el = panel(v)
    ensure(v.doc.querySelectorAll('#kg-overlay [data-node-id="m1"]').length === 1, 'Existing media DOM must hydrate without duplicate panels')
    ensure(el.querySelector('iframe')?.getAttribute('src') === 'about:blank', 'Hydration must retain existing inline media')
    ensure(Number.parseFloat(el.style.width) > 0 && Number.parseFloat(el.style.height) > 0, 'Empty-payload media fallback must receive positive overlay geometry')
    const before = el.style.cssText
    wheel(v, el); v.flush()
    ensure(el.style.cssText !== before, 'Hydrated overlays must follow actual viewport zoom')
    const overlay = v.doc.getElementById('kg-overlay') as any
    ensure(overlay.__kgMediaById.m1 === el && overlay.__kgMediaBoxById.m1, 'Hydrated overlay must be indexed for edge anchoring')
    ensure(!v.doc.querySelector('.kg-mediaHeader, .kg-mediaTitle, [data-kg-media-panel-header], [data-kg-rich-media-floating-toolbar]'), 'Runtime must not synthesize legacy media chrome')
    v.key('i'); ensure(mediaSurface(v).style.pointerEvents === 'auto', 'Keyboard media toggle must control hydrated DOM')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
  const srcDoc = '<!doctype html><html><body>Offline embedded page</body></html>'
  const live = runHtmlViewer(await markup(mediaArgs()), { mediaNodesJson: [{ id: 'm1', title: 'Page', kind: 'iframe', url: 'about:blank', srcDoc, openUrl: 'https://example.com/source', interactive: true }] })
  try {
    const el = panel(live)
    const frame = el.querySelector('iframe')
    ensure(frame?.getAttribute('srcdoc') === srcDoc, 'Compiled runtime must preserve explicit iframe document')
    ensure(frame?.hasAttribute('sandbox'), 'Runtime-created iframe must be sandboxed')
    ensure(el.getAttribute('data-kg-open-url') === 'https://example.com/source', 'Runtime must preserve canonical click-through resource')
    el.dispatchEvent(new live.win.MouseEvent('click', { bubbles: true, cancelable: true }))
    ensure(live.opened.some(args => args[0] === 'https://example.com/source' && args[1] === '_blank' && args[2] === 'noopener,noreferrer'), 'Media click-through must isolate the opener')
  } catch (error) { live.captureFailure(error); throw error } finally { live.close() }
}

export async function testExportHtmlViewerMediaInteractivityDefaultsOn() {
  const html = await markup(mediaArgs())
  ensure(html.includes('--kg-media-pointer-events:auto'), 'Media surfaces must retain the interactive CSS default')
  const input = readRuntimeInput(html).mediaNodesJson as Array<{ interactive: boolean }>
  ensure(input[0]?.interactive === true, 'Media payloads must default to interactive capability')
  const v = runHtmlViewer(html)
  try {
    // Startup retains the pan-friendly posture; the historical case ID is retained.
    ensure(mediaSurface(v).style.pointerEvents === 'none', 'Startup must remain pan-friendly')
    ensure(v.key('i').defaultPrevented, 'Media shortcut must be handled')
    ensure(mediaSurface(v).style.pointerEvents === 'auto', 'Default media capability must become interactive with one toggle')
    v.key('i'); ensure(mediaSurface(v).style.pointerEvents === 'none', 'Second toggle must disable media interaction')
    v.key('i', 'keydown', { altKey: true })
    ensure(mediaSurface(v).style.pointerEvents === 'none', 'Alt shortcut must not toggle media')
    const input = v.doc.createElement('input'); v.root.appendChild(input); input.focus()
    v.key('i', 'keydown', {}, input)
    ensure(mediaSurface(v).style.pointerEvents === 'none', 'Typing in an editor must not toggle media')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerMediaPointerEventsRespectsNodeInteractivity() {
  const html = await markup(mediaArgs([mediaNode('m1', 'data:image/png;base64,aA=='), mediaNode('m2', 'data:image/png;base64,Yg==')]))
  const nodes = readRuntimeInput(html).mediaNodesJson as Array<Record<string, unknown>>
  const v = runHtmlViewer(html, { mediaNodesJson: nodes.map(n => ({ ...n, interactive: n.id === 'm1' })) })
  try {
    v.key('i')
    ensure(mediaSurface(v, 'm1').style.pointerEvents === 'auto', 'Interactive media must receive pointer events')
    ensure(mediaSurface(v, 'm2').style.pointerEvents === 'none', 'Noninteractive media must retain disabled hit-testing')
    v.key(' ')
    ensure(mediaSurface(v, 'm1').style.pointerEvents === 'none' && mediaSurface(v, 'm2').style.pointerEvents === 'none', 'Space-pan must override both media capabilities')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}

export async function testExportHtmlViewerDoesNotInferLocalhostProxyOrigin() {
  const bootstrap = typeof document === 'undefined' ? initJsdomHarness() : null
  try {
    const html = await markup(mediaArgs([mediaNode('m1', 'https://example.com/test.png')]))
    const input = readRuntimeInput(html)
    ensure(input.proxyOrigin === '' && input.allowRuntimeNetwork === false, 'Default runtime must not inherit build-host networking')
    const v = runHtmlViewer(html)
    try {
      ensure(!v.requests.length, 'Offline runtime must not fetch remote metadata')
      ensure(!Array.from<Element>(v.doc.querySelectorAll('[src]')).some(el => /^https?:/i.test(el.getAttribute('src') || '')), 'Offline media must not load remote sources')
    } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
  } finally { bootstrap?.restore() }
}

export async function testExportHtmlViewerExplicitRuntimeNetworkKeepsProxyOrigin() {
  const html = await markup({ ...mediaArgs([mediaNode('m1', 'https://example.com/test.png')]), proxyOrigin: 'http://localhost:5173', allowRuntimeNetwork: true })
  const input = readRuntimeInput(html)
  ensure(input.proxyOrigin === 'http://localhost:5173' && input.allowRuntimeNetwork === true, 'Explicit runtime network settings must survive compilation')
  const v = runHtmlViewer(html)
  try { ensure(panel(v).querySelector('img')?.getAttribute('src')?.startsWith('http://localhost:5173/'), 'Explicit local proxy must serve the media resource') }
  catch (error) { v.captureFailure(error); throw error }
  finally { v.close() }
}

export async function testExportHtmlViewerMarkdownOverlaySupportsAnchorNodeIds() {
  const html = await markup({ svgMarkup: viewerSvg(viewerNode('n1') + '<g data-kg-layer="markdown-design-blocks"><foreignObject x="80" y="80" width="100" height="80" data-kg-markdown-block-id="b1" data-kg-anchor-node-id="n1"></foreignObject></g>'),
    overlayHtml: '<article data-md-id="b1" data-kg-anchor-node-id="n1" data-kg-world-x="80" data-kg-world-y="80" data-kg-world-w="100" data-kg-world-h="80"><section><table><tr><td>T</td></tr></table></section></article>' })
  const v = runHtmlViewer(html)
  try {
    const overlay = v.doc.getElementById('kg-overlay') as any
    const panels = v.doc.querySelectorAll<HTMLElement>('#kg-overlay [data-md-id="b1"]')
    ensure(panels.length === 1, 'Markdown anchor must preserve exactly one existing panel')
    const el = panels[0]
    ensure(overlay.__kgMdById.b1 === el && overlay.__kgMdById.n1 === el, 'Markdown must be indexed by block and canonical anchor IDs')
    ensure(!el.hasAttribute('data-kg-markdown-design-block'), 'Removed markdown identity alias must not reappear')
    ensure(el.getAttribute('data-kg-anchor-node-id') === 'n1', 'Canonical anchor identity must survive runtime hydration')
    ensure(Number.parseFloat(el.style.width) > 0 && Number.parseFloat(el.style.height) > 0, 'Markdown panel must have world-derived layout')
    const before = el.style.cssText
    wheel(v, el); v.flush()
    ensure(el.style.cssText !== before, 'Anchored markdown geometry must follow viewport zoom')
    ensure(overlay.__kgMdBoxById.n1, 'Markdown anchor must expose geometry for connected edges')
  } catch (error) { v.captureFailure(error); throw error } finally { v.close() }
}
