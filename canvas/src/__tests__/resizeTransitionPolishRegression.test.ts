import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readUtf8 = (filePath: string): string => readFileSync(filePath, 'utf8')

export function testResizeTransitionPolishKeepsSharedShapeAndLabelTransitions() {
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  const cssText = readUtf8(resolve(process.cwd(), 'src/index.css'))
  if (!cssText.includes('--kg-motion-fast: 140ms;')) {
    throw new Error('expected root CSS to define a shared fast motion token')
  }
  if (!cssText.includes('--kg-motion-ease: ease;')) {
    throw new Error('expected root CSS to define a shared motion easing token')
  }
  if (!cssText.includes('--kg-transition-action: transform var(--kg-motion-fast) var(--kg-motion-ease), box-shadow var(--kg-motion-fast) var(--kg-motion-ease), background var(--kg-motion-fast) var(--kg-motion-ease);')) {
    throw new Error('expected root CSS to define a shared action-button transition token')
  }
  if (!cssText.includes('--kg-transition-group-shape: stroke-width var(--kg-motion-fast) var(--kg-motion-ease), fill-opacity var(--kg-motion-fast) var(--kg-motion-ease);')) {
    throw new Error('expected root CSS to define a shared group-shape transition token')
  }
  if (!cssText.includes('--kg-transition-group-label: opacity var(--kg-motion-fast) var(--kg-motion-ease);')) {
    throw new Error('expected root CSS to define a shared group-label transition token')
  }
  if (!cssText.includes('@media (prefers-reduced-motion: reduce)')) {
    throw new Error('expected root CSS to override motion tokens for reduced-motion users')
  }
  if (!cssText.includes('--kg-motion-fast: 0ms;')) {
    throw new Error('expected reduced-motion CSS to zero fast motion durations')
  }
  if (!groupsText.includes("const groupShapeTransition = 'var(--kg-transition-group-shape)'")) {
    throw new Error('expected group resize polish to source shape transitions from the shared transition token SSOT')
  }
  if (!groupsText.includes("const groupLabelTransition = 'var(--kg-transition-group-label)'")) {
    throw new Error('expected group resize polish to source label transitions from the shared transition token SSOT')
  }
  if (!groupsText.includes(".style('transition', groupShapeTransition)")) {
    throw new Error('expected rect and geo groups to reuse the shared shape transition')
  }
  if (!groupsText.includes(".style('transition', groupLabelTransition)")) {
    throw new Error('expected group labels to reuse the shared label transition')
  }
  if (!cssText.includes('transition: var(--kg-transition-action);')) {
    throw new Error('expected app CSS action buttons to reuse the shared transition token SSOT')
  }
}

export function testResizeTransitionPolishKeepsChevronAndHandleDotTransitions() {
  const groupsText = readUtf8(resolve(process.cwd(), 'src/components/GraphCanvas/layers/groups.ts'))
  const cssText = readUtf8(resolve(process.cwd(), 'src/index.css'))
  const htmlViewerText = readUtf8(resolve(process.cwd(), 'src/lib/graph/htmlViewer/buildGraphHtmlViewerMarkup.ts'))
  const htmlViewerRuntimeText = readUtf8(resolve(process.cwd(), 'src/lib/graph/htmlViewer/runtimeScript.ts'))
  const htmlViewerLiveExportText = readUtf8(resolve(process.cwd(), 'src/lib/graph/htmlViewer/liveOverlayExport.ts'))
  const kanbanGroupText = readUtf8(resolve(process.cwd(), 'src/features/markdown/ui/kanban/KanbanGroup.tsx'))
  const kanbanCardText = readUtf8(resolve(process.cwd(), 'src/features/markdown/ui/kanban/KanbanCard.tsx'))
  if (!cssText.includes('--kg-transition-group-chevron: stroke-width var(--kg-motion-fast) var(--kg-motion-ease), opacity var(--kg-motion-fast) var(--kg-motion-ease);')) {
    throw new Error('expected root CSS to define a shared group-chevron transition token')
  }
  if (!cssText.includes('--kg-transition-group-resize-dot: stroke-width var(--kg-motion-fast) var(--kg-motion-ease), fill-opacity var(--kg-motion-fast) var(--kg-motion-ease);')) {
    throw new Error('expected root CSS to define a shared group resize-dot transition token')
  }
  if (!groupsText.includes("const groupChevronTransition = 'var(--kg-transition-group-chevron)'")) {
    throw new Error('expected group resize polish to source chevron transitions from the shared transition token SSOT')
  }
  if (!groupsText.includes("const groupResizeDotTransition = 'var(--kg-transition-group-resize-dot)'")) {
    throw new Error('expected group resize polish to source resize-dot transitions from the shared transition token SSOT')
  }
  if (!groupsText.includes(".style('transition', groupChevronTransition)")) {
    throw new Error('expected group chevrons to reuse the shared transition definition')
  }
  if (!groupsText.includes(".style('transition', groupResizeDotTransition)")) {
    throw new Error('expected group resize dots to reuse the shared transition definition')
  }
  if (htmlViewerText.includes('data-kg-panel-action="1"') || htmlViewerText.includes('.kg-mediaActionBtn') || htmlViewerText.includes('.kg-mediaActions')) {
    throw new Error('expected html viewer Rich Media export to remove the legacy inline action-button variant after toolbar consolidation')
  }
  if (htmlViewerRuntimeText.includes('data-kg-markdown-design-block')) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead markdown overlay legacy alias branch after upstream canonicalization')
  }
  if (htmlViewerText.includes('data-kg-md-panel')) {
    throw new Error('expected html viewer markdown export cleanup to drop the dead data-kg-md-panel normalization branch after upstream canonicalization')
  }
  if (htmlViewerText.includes("data-kg-anchor-node-id') || readAttr(tag, 'data-node-id'") || htmlViewerText.includes("data-kg-anchor-node-id') || el.getAttribute('data-node-id'")) {
    throw new Error('expected html viewer markdown anchor handling to stop falling back to data-node-id after canonical producer cleanup')
  }
  if (htmlViewerLiveExportText.includes("data-kg-anchor-node-id') || el.getAttribute('data-node-id'")) {
    throw new Error('expected live overlay export markdown anchors to stop falling back to data-node-id after canonical producer cleanup')
  }
  if (htmlViewerText.includes("stripAttr(nextTag, 'data-node-id')")) {
    throw new Error('expected html viewer markdown canonicalization to stop carrying the dead data-node-id strip branch after producer cleanup')
  }
  if (htmlViewerRuntimeText.includes('n.open_url')) {
    throw new Error('expected html viewer media runtime payload handling to stop carrying the dead snake_case open_url fallback after canonical producer cleanup')
  }
  if (htmlViewerText.includes("el.getAttribute('data-kg-title')")) {
    throw new Error('expected html viewer rich-media parsing to stop carrying the dead data-kg-title metadata branch after producer cleanup')
  }
  if (htmlViewerRuntimeText.includes("var kind2 = '';") || htmlViewerRuntimeText.includes("mediaNodes.push({ id: xid2, kind: kind2 || 'iframe'")) {
    throw new Error('expected html viewer runtime to drop the dead rich-media DOM metadata merge branch while keeping the id-only fallback')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'header.appendChild(title);\\n        var body = document.createElement(\\'div\\');'")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead no-op media header/body rewrite branch')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'var mediaNodes = __AG_MEDIA_NODES__;\\n    var nodeMetaById = __AG_NODE_META__;")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead duplicate node-id helper injection branch before nodeMetaById')
  }
  if (htmlViewerRuntimeText.includes("out = replaceAllExact(\n    out,\n    \"var xid2 = String(ex2.getAttribute('data-node-id') || '').trim();\"")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead xid2 node-id rewrite branch once the upstream token is gone')
  }
  if (htmlViewerRuntimeText.split("\"var b = markdownBlocks[i];\\n        if (!b) continue;\\n        var id = String(b.id || '');\\n        if (!id) continue;\"").length - 1 !== 0) {
    throw new Error('expected html viewer runtime patching to fold the markdown block anchor-preload rewrite upstream and remove the downstream branch')
  }
  if (htmlViewerRuntimeText.split("\"el.setAttribute('data-md-id', id);\"").length - 1 !== 0) {
    throw new Error('expected html viewer runtime patching to fold the markdown data-md-id anchor rewrite upstream and remove the downstream branch')
  }
  if (htmlViewerRuntimeText.split("\"overlay.__kgMdById[id] = el;\"").length - 1 !== 0) {
    throw new Error('expected html viewer runtime patching to fold the markdown overlay map rewrite upstream and remove the downstream branch')
  }
  if (htmlViewerRuntimeText.split("\"var xanchor = String(ex.getAttribute('data-kg-anchor-node-id') || '').trim();\"").length - 1 !== 0) {
    throw new Error('expected html viewer runtime patching to remove the dead raw markdown anchor rewrite branch after upstream consolidation')
  }
  if (htmlViewerRuntimeText.includes("out = replaceAllExact(\n    out,\n    \"el.setAttribute('data-kg-canvas-wheel-ignore', 'true');\",\n    '',\n  )")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead wheel-ignore removal branch once the emitted runtime is already unchanged without it')
  }
  if (htmlViewerRuntimeText.split("var UI_IGNORE_SELECTOR = '#kg-hud, #kg-hud *';").length - 1 !== 1) {
    throw new Error('expected html viewer runtime patching to keep only one live HUD-only UI ignore selector rewrite after duplicate cleanup')
  }
  if (htmlViewerRuntimeText.split("\"var src = String(edgeEl.getAttribute('data-source-id') || edgeEl.getAttribute('data-source') || '').trim();\\n      var tgt = String(edgeEl.getAttribute('data-target-id') || edgeEl.getAttribute('data-target') || '').trim();\"").length - 1 !== 1) {
    throw new Error('expected html viewer runtime patching to keep only one live edge source-target resolver rewrite branch after duplicate cleanup')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"function updateEdgeGeometryByEl(edgeEl){\\n      if (!edgeEl || !edgeEl.getAttribute) return;\\n      var src = String(edgeEl.getAttribute('data-source-id') || edgeEl.getAttribute('data-source') || '').trim();")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead raw edgeEl geometry rewrite branch once earlier source-target canonicalization makes it unreachable')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"if (/(^|\\\\/\\\\/)twitframe\\\\.com\\\\//i.test(u)) return true;\\n        return false;\"")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead twitframe-to-bilibili allowlist rewrite branch once the upstream token is gone')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'var offMap = svg.__kgNodeOffsetById || (svg.__kgNodeOffsetById = {});'")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead foreignObject markdown offMap injection branch once the emitted runtime is unchanged without it')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"if (overlayFollowAnimation && svg && (svg.__kgNodeOffsetById || (svg.__kgNodeOffsetById = {}))) {\\n          var map = svg.__kgNodeOffsetById;")) {
    throw new Error('expected html viewer runtime patching to stop carrying the dead overlayFollowAnimation offset-map guard rewrite once the emitted runtime is unchanged without it')
  }
  if (htmlViewerRuntimeText.includes("out = replaceAllExact(\n    out,\n    \"lastBoxById[id] = { left: left, top: top, w: panelW, h: panelH, display: 'block' };\"")) {
    throw new Error('expected html viewer runtime patching to fold media panel edge-geometry scheduling upstream and remove the downstream lastBoxById rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceAllExact(\n    out,\n    \"if (bid) lastMdBoxById[bid] = boxVal;\\n              if (anchorId) lastMdBoxById[anchorId] = boxVal;\"")) {
    throw new Error('expected html viewer runtime patching to fold markdown world-box edge scheduling upstream and remove the downstream boxVal rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"var mdBoxById = overlay.__kgMdBoxById || {};\\n          if (markdownBlocks && markdownBlocks.length) {")) {
    throw new Error('expected html viewer runtime patching to fold markdown world-box mode gating upstream and remove the downstream hasMdBlocks rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"              if (!prev1 || Math.abs((Number(prev1.x) || 0) - dx1) > 0.5 || Math.abs((Number(prev1.y) || 0) - dy1) > 0.5) {\\n                offMap[key1] = { x: dx1, y: dy1 };")) {
    throw new Error('expected html viewer runtime patching to fold markdown offset-map fallback scheduling upstream and remove the downstream key1/key2 rewrite branch')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"var kind = String(n.kind || 'iframe');\"")) {
    throw new Error('expected html viewer runtime patching to fold media kind inference into the upstream url/kind payload injection and remove the separate kind rewrite branch')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"var url = String(n.url || '');\\n        var kind = String(n.kind || 'iframe');\"")) {
    throw new Error('expected html viewer runtime patching to fold media payload openUrl normalization and inferred kind setup into the canonical runtime template and remove the downstream payload rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'var inferred = kgInferMediaKindFromUrl(url0);'")) {
    throw new Error('expected html viewer runtime patching to fold media element rehydrate inference into the canonical runtime template and remove the downstream inferred-kind rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'imgEl.src = url;'")) {
    throw new Error('expected html viewer runtime patching to fold image element source setup into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'vid.src = url;'")) {
    throw new Error('expected html viewer runtime patching to fold video element source setup into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'iframe.src = url;'")) {
    throw new Error('expected html viewer runtime patching to fold iframe source setup, sandboxing, and srcdoc handling into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'var x1 = Number(a.x);\\n      var y1 = Number(a.y);\\n      var x2 = Number(b.x);\\n      var y2 = Number(b.y);'")) {
    throw new Error('expected html viewer runtime patching to fold overlay-follow edge endpoint offsets into the canonical edge geometry template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"el.className = 'kg-media';\"")) {
    throw new Error('expected html viewer runtime patching to fold media click-through handling into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"if (k === 'video' || k === 'image' || k === 'svg') return kgBuildRemoteFetchProxyUrl(u);\"")) {
    throw new Error('expected html viewer runtime patching to fold media proxy routing into the upstream kgResolveMediaSrc rewrite and remove the separate remote-fetch branch')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"if (u.startsWith('/__') || u.startsWith('/@')) return u;\"")) {
    throw new Error('expected html viewer runtime patching to fold local proxy-origin rewriting into the upstream kgResolveMediaSrc rewrite and remove the separate early-return branch')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'if (!touches || touches.length === 0) return;\\n\\n        var t0 = safeViewportTransform(state);'")) {
    throw new Error('expected html viewer runtime patching to fold touch start lifecycle handling into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"if (touchDrag.type === 'rotate') {\"")) {
    throw new Error('expected html viewer runtime patching to fold touch move lifecycle handling into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'if (!touches || touches.length === 0) touchDrag = null;'")) {
    throw new Error('expected html viewer runtime patching to fold touch end lifecycle handling into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"try { scheduleEdgeGeometryUpdateForNode(nodeId); } catch (e0) {}\\n    }\\n\\n    function translateGroupByDelta(groupId, dx, dy){\"")) {
    throw new Error('expected html viewer runtime patching to fold group-rect helper injection into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"p.x = targetX;\\n      p.y = targetY;\\n      translateNodeByDelta(nodeDrag.id, dx, dy);\"")) {
    throw new Error('expected html viewer runtime patching to fold node-drag group-rect upkeep into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"var edgeLs = svg.querySelectorAll('[data-edge-id]');\"")) {
    throw new Error('expected html viewer runtime patching to fold late edge bootstrap into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("if (!out.includes('var markdownBlocks =')) {")) {
    throw new Error('expected html viewer runtime patching to fold the markdownBlocks declaration into the canonical runtime template and remove the fallback insertion block')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'if (mediaBtn) mediaBtn.addEventListener(\\'click\\', function(){ setMediaInteractive(!mediaInteractive); });'")) {
    throw new Error('expected html viewer runtime patching to fold the HUD control/frontmatter/rich/3D state block into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("window.addEventListener('keydown', function(e){")) {
    throw new Error('expected html viewer runtime patching to fold the keyboard media-toggle shortcut into the canonical runtime template and remove the downstream rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    \"var mediaBtn = document.getElementById('kg-media-toggle');\"")) {
    throw new Error('expected html viewer runtime patching to fold the media/proxy helper subsystem into the canonical runtime template and remove the downstream mediaBtn rewrite')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    'var kgResolveMediaSrc = function(url, kind){'")) {
    throw new Error('expected html viewer runtime patching to fold the media/proxy helper prelude into the canonical runtime template and remove the downstream kgResolveMediaSrc rewrite')
  }
  if (htmlViewerRuntimeText.includes("const markdownBlockInteractionsSnippet = `var __kgMdDrag = null;")) {
    throw new Error('expected html viewer runtime patching to fold markdown block interaction helpers into the canonical runtime template and remove the downstream snippet injection')
  }
  if (htmlViewerRuntimeText.includes("out = replaceOnceExact(\n    out,\n    '      updateOverlays();'")) {
    throw new Error('expected html viewer runtime patching to fold markdown block interaction installation into the canonical runtime template and remove the downstream updateOverlays call rewrite')
  }
  if (htmlViewerRuntimeText.includes("el.setAttribute('data-kg-canvas-wheel-ignore', 'true');")) {
    throw new Error('expected html viewer runtime patching to stop emitting direct Rich Media wheel-ignore attrs once overlay pan/zoom stays canvas-driven')
  }
  if (!cssText.includes('.kg-panel-action-btn {') || !cssText.includes('.kg-panel-icon-btn {')) {
    throw new Error('expected app CSS to expose shared panel action button classes for consumers like Kanban')
  }
  if (cssText.includes('button[data-kg-panel-action="1"]') || cssText.includes('button[data-kg-kanban-icon-action="1"]')) {
    throw new Error('expected app CSS to remove the legacy data-attribute action-button selectors after class-based consolidation')
  }
  if (kanbanGroupText.includes('data-kg-panel-action="1"') || kanbanCardText.includes('data-kg-panel-action="1"')) {
    throw new Error('expected Kanban action buttons to stop depending on the legacy shared data-kg-panel-action hook')
  }
  if (!kanbanGroupText.includes('kg-panel-action-btn kg-panel-icon-btn') || !kanbanCardText.includes('kg-panel-action-btn kg-panel-icon-btn')) {
    throw new Error('expected Kanban icon actions to reuse the shared panel action button classes')
  }
  if (!kanbanGroupText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') || !kanbanCardText.includes('UI_RESPONSIVE_SMALL_ICON_ACTION_CLASSNAME') || [kanbanGroupText, kanbanCardText].some(text => text.includes('inline-flex items-center justify-center w-7 h-7'))) {
    throw new Error('expected Kanban icon action sizing to reuse the shared small icon action owner')
  }
}
