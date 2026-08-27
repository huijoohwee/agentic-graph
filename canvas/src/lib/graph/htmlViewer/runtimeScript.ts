import { getKgHtmlViewerRuntimeTemplate } from './runtimeTemplate'
import { LS_KEYS } from '../../config.ls'

const replaceAllExact = (s: string, token: string, replacement: string): string => {
  if (!token) return s
  if (!s.includes(token)) return s
  return s.split(token).join(replacement)
}

const replaceOnceExact = (s: string, token: string, replacement: string, replacement2?: string): string => {
  if (!token) return s
  const rep = typeof replacement2 === 'string' ? replacement2 : replacement
  const i = s.indexOf(token)
  if (i < 0) return s
  return s.slice(0, i) + rep + s.slice(i + token.length)
}

const cookTemplateLiteral = (raw: string): string => {
  const src = String(raw || '')
  if (!src) return ''
  const escaped = src.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  try {
    return Function('return `' + escaped + '`')() as string
  } catch {
    return src
  }
}

export function buildHtmlViewerRuntimeScript(args: {
  interactionCfgJson: string
  mediaNodesJson: string
  markdownBlocksJson: string
  nodeLabelByIdJson: string
  edgeMetaByIdJson: string
  frontmatterVisibilityJson: string
  initialFrontmatterEnabled?: boolean
  nodePosByIdJson: string
  groupMembersByIdJson: string
  density: 'default' | 'compact'
  widthRatioDefault: number
  widthRatioCompact: number
  widthMinDefault: number
  widthMinCompact: number
  widthMaxDefault: number
  widthMaxCompact: number
  proxyOrigin?: string
  allowRuntimeNetwork?: boolean
}): string {
  const safeMarkdownBlocksJson = (() => {
    const s = String(args.markdownBlocksJson || '').trim()
    if (!s) return '[]'
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? s : '[]'
    } catch {
      return '[]'
    }
  })()
  const template = cookTemplateLiteral(getKgHtmlViewerRuntimeTemplate())
  if (!template) return ''

  let out = template

  out = replaceAllExact(
    out,
    "var UI_IGNORE_SELECTOR = '[data-kg-canvas-wheel-ignore=\"true\"], [data-kg-canvas-pointer-ignore=\"true\"]';",
    "var UI_IGNORE_SELECTOR = '#kg-hud, #kg-hud *';",
  )

  out = replaceAllExact(
    out,
    "var pointerMode = 'select';",
    "var pointerMode = 'pan';",
  )

  out = replaceAllExact(
    out,
    "var src = String(edgeEl.getAttribute('data-source-id') || edgeEl.getAttribute('data-source') || '').trim();\n      var tgt = String(edgeEl.getAttribute('data-target-id') || edgeEl.getAttribute('data-target') || '').trim();",
    "var src = __kgResolveNodeId(String(edgeEl.getAttribute('data-source-id') || edgeEl.getAttribute('data-source') || '').trim());\n      var tgt = __kgResolveNodeId(String(edgeEl.getAttribute('data-target-id') || edgeEl.getAttribute('data-target') || '').trim());",
  )

  out = replaceAllExact(
    out,
    "var src = String(ee.getAttribute('data-source-id') || ee.getAttribute('data-source') || '').trim();",
    "var src = __kgResolveNodeId(String(ee.getAttribute('data-source-id') || ee.getAttribute('data-source') || '').trim());",
  )

  out = replaceAllExact(
    out,
    "var tgt = String(ee.getAttribute('data-target-id') || ee.getAttribute('data-target') || '').trim();",
    "var tgt = __kgResolveNodeId(String(ee.getAttribute('data-target-id') || ee.getAttribute('data-target') || '').trim());",
  )

  out = replaceAllExact(out, '__AG_CFG__', args.interactionCfgJson)
  out = replaceAllExact(out, '__AG_MEDIA_NODES__', args.mediaNodesJson)
  out = replaceAllExact(out, '__AG_MD_BLOCKS__', safeMarkdownBlocksJson)
  out = replaceAllExact(out, '__AG_NODE_META__', args.nodeLabelByIdJson)
  out = replaceAllExact(out, '__AG_EDGE_META__', args.edgeMetaByIdJson)
  out = replaceAllExact(out, '__AG_NODE_POS__', args.nodePosByIdJson)
  out = replaceAllExact(out, '__AG_GROUP_MEMBERS__', args.groupMembersByIdJson)
  out = replaceAllExact(out, '__AG_FRONTMATTER_VIS__', args.frontmatterVisibilityJson)
  out = replaceAllExact(out, '__AG_INITIAL_FRONTMATTER_ENABLED__', args.initialFrontmatterEnabled === true ? 'true' : 'false')
  out = replaceAllExact(out, '__AG_RICH_MEDIA_PANEL_MODE_LS_KEY__', JSON.stringify(LS_KEYS.renderRichMediaPanelMode))
  out = replaceAllExact(out, '__AG_DENSITY__', JSON.stringify(args.density))
  out = replaceAllExact(out, '__AG_WIDTH_RATIO_DEFAULT__', String(args.widthRatioDefault))
  out = replaceAllExact(out, '__AG_WIDTH_RATIO_COMPACT__', String(args.widthRatioCompact))
  out = replaceAllExact(out, '__AG_WIDTH_MIN_DEFAULT__', String(args.widthMinDefault))
  out = replaceAllExact(out, '__AG_WIDTH_MIN_COMPACT__', String(args.widthMinCompact))
  out = replaceAllExact(out, '__AG_WIDTH_MAX_DEFAULT__', String(args.widthMaxDefault))
  out = replaceAllExact(out, '__AG_WIDTH_MAX_COMPACT__', String(args.widthMaxCompact))

  out = replaceOnceExact(
    out,
    "var tip = document.getElementById('kg-tooltip');",
    "var tip = document.getElementById('kg-tooltip');\n\n    var __kgNodeIdBySuffix = Object.create(null);\n    var __kgNodeIdSet = Object.create(null);\n    var __kgNodeIdMapReady = false;\n    function __kgEnsureNodeIdMap(){\n      if (__kgNodeIdMapReady) return;\n      __kgNodeIdMapReady = true;\n      try {\n        if (!nodePosById) return;\n        for (var __kgNid in nodePosById) {\n          if (!Object.prototype.hasOwnProperty.call(nodePosById, __kgNid)) continue;\n          var __kgId = String(__kgNid || '').trim();\n          if (!__kgId) continue;\n          __kgNodeIdSet[__kgId] = 1;\n          var __kgSuffix = (__kgId.split('::').pop() || '').trim();\n          if (__kgSuffix && !__kgNodeIdBySuffix[__kgSuffix]) __kgNodeIdBySuffix[__kgSuffix] = __kgId;\n        }\n      } catch (e0) {\n        void 0;\n      }\n    }\n    function __kgResolveNodeId(raw){\n      try {\n        __kgEnsureNodeIdMap();\n        var id = String(raw || '').trim();\n        if (!id) return '';\n        if (__kgNodeIdSet[id] === 1) return id;\n        var suffix = (id.split('::').pop() || '').trim();\n        if (suffix && __kgNodeIdBySuffix[suffix]) return String(__kgNodeIdBySuffix[suffix] || '').trim();\n        return id;\n      } catch (e1) {\n        return String(raw || '').trim();\n      }\n    }",
  )

  out = replaceOnceExact(
    out,
    'if (fitBtn) fitBtn.addEventListener(\'click\', function(){ fitToCenter(); });\n    if (resetBtn) resetBtn.addEventListener(\'click\', function(){ resetView(); });\n    if (mediaBtn) mediaBtn.addEventListener(\'click\', function(){ setMediaInteractive(!mediaInteractive); });',
    "if (fitBtn) fitBtn.addEventListener('click', function(){ fitToCenter(); });\n    if (resetBtn) resetBtn.addEventListener('click', function(){ resetView(); });\n    if (mediaBtn) mediaBtn.addEventListener('click', function(){ setMediaInteractive(!mediaInteractive); });",
  )

  out = replaceOnceExact(
    out,
    "function applyMediaPointerEvents(){\n      var pe = (mediaInteractive && pointerMode !== 'pan' && !panHeld && !headerDrag) ? 'auto' : 'none';\n      try {\n        if (pe !== lastMediaPointerEvents) {\n          lastMediaPointerEvents = pe;\n          document.documentElement.style.setProperty('--kg-media-pointer-events', pe);\n        }\n      } catch (err) {}\n      try {\n        if (mediaBtn && mediaBtn.classList) {\n          if (lastMediaBtnActive !== mediaInteractive) {\n            lastMediaBtnActive = mediaInteractive;\n            if (mediaInteractive) mediaBtn.classList.add('kg-active');\n            else mediaBtn.classList.remove('kg-active');\n          }\n        }\n      } catch (err) {}\n    }",
    "function applyMediaPointerEvents(){\n      var pe = (mediaInteractive && pointerMode !== 'pan' && !panHeld && !headerDrag) ? 'auto' : 'none';\n      try {\n        if (pe !== lastMediaPointerEvents) {\n          lastMediaPointerEvents = pe;\n          document.documentElement.style.setProperty('--kg-media-pointer-events', pe);\n        }\n      } catch (err) {}\n      try {\n        if (mediaBtn && mediaBtn.classList) {\n          if (lastMediaBtnActive !== mediaInteractive) {\n            lastMediaBtnActive = mediaInteractive;\n            if (mediaInteractive) mediaBtn.classList.add('kg-active');\n            else mediaBtn.classList.remove('kg-active');\n          }\n        }\n      } catch (err) {}\n      try {\n        if (overlay && overlay.__kgMediaById && mediaNodes && mediaNodes.length) {\n          for (var i = 0; i < mediaNodes.length; i += 1) {\n            var n = mediaNodes[i];\n            if (!n) continue;\n            var id = String(n.id || '');\n            if (!id) continue;\n            var holder = overlay.__kgMediaById[id];\n            if (!holder || !holder.querySelectorAll) continue;\n            var interactive0 = !!n.interactive;\n            var perPe = interactive0 ? pe : 'none';\n            var els = holder.querySelectorAll('iframe,img,video,audio,source');\n            for (var j = 0; j < els.length; j += 1) {\n              var el = els[j];\n              if (!el || !el.style) continue;\n              try { el.style.pointerEvents = perPe; } catch (e0) {}\n            }\n          }\n        }\n      } catch (err) {}\n    }",
  )

  out = replaceOnceExact(out, 'var mediaInteractive = false;', 'var mediaInteractive = true;')

  out = replaceOnceExact(
    out,
    "overlay.__kgMediaById[id] = panel;\n      }\n    }\n\n    var overlayRaf = null;",
    "overlay.__kgMediaById[id] = panel;\n      }\n    }\n\n    function ensureMarkdownDom(){\n      if (!overlay) return;\n      if (!markdownBlocks || markdownBlocks.length === 0) return;\n      if (overlay.__kgMdBuilt) return;\n      overlay.__kgMdBuilt = true;\n      overlay.__kgMdById = {};\n\n      try {\n        var existing = overlay.querySelectorAll ? overlay.querySelectorAll('[data-md-id]') : null;\n        if (existing && existing.length) {\n          for (var ei = 0; ei < existing.length; ei += 1) {\n            var ex = existing[ei];\n            if (!ex || !ex.getAttribute) continue;\n            var xid = __kgResolveNodeId(String(ex.getAttribute('data-md-id') || '').trim());\n            var xanchor = __kgResolveNodeId(String(ex.getAttribute('data-kg-anchor-node-id') || '').trim());\n            if (!xid && !xanchor) continue;\n            try {\n              var curClass = String(ex.className || '');\n              if (curClass.indexOf('kg-md') < 0) ex.className = ('kg-md ' + curClass).trim();\n            } catch (e0) {\n              void 0;\n            }\n            if (xid) overlay.__kgMdById[xid] = ex;\n            if (xanchor) overlay.__kgMdById[xanchor] = ex;\n          }\n        }\n      } catch (e0) {\n        void 0;\n      }\n\n      for (var i = 0; i < markdownBlocks.length; i += 1) {\n        var b = markdownBlocks[i];\n        if (!b) continue;\n        var id = String(b.id || '');\n        if (!id) continue;\n        var anchorId0 = __kgResolveNodeId(String((b && (b.anchorNodeId || b.anchorId)) || '').trim());\n        if (overlay.__kgMdById[id] || (anchorId0 && overlay.__kgMdById[anchorId0])) continue;\n        try {\n          var pv = b.preview || null;\n          var kind = pv && pv.kind ? String(pv.kind) : '';\n          if (kind === 'html') {\n            var raw = pv && pv.html && pv.html.raw ? String(pv.html.raw || '') : '';\n            if (/<\\s*iframe\\b/i.test(raw)) continue;\n          }\n        } catch (e0) {}\n\n        var el = document.createElement('section');\n        el.className = 'kg-md';\n        el.setAttribute('data-md-id', id);\n        if (anchorId0) {\n          try { el.setAttribute('data-kg-anchor-node-id', anchorId0); } catch (e0a) {}\n        }\n\n        var header = document.createElement('header');\n        header.className = 'kg-mdHeader';\n        var title = document.createElement('h3');\n        title.className = 'kg-mdTitle';\n        title.textContent = String(b.title || b.id || 'Block');\n        header.appendChild(title);\n\n        var body = document.createElement('section');\n        body.className = 'kg-mdBody';\n\n        try {\n          var preview = b.preview || null;\n          var k = preview && preview.kind ? String(preview.kind) : '';\n          if (k === 'table' && preview.table) {\n            var tbl = document.createElement('table');\n            tbl.className = 'kg-mdTable';\n            var cols = Array.isArray(preview.table.columns) ? preview.table.columns : [];\n            var rows = Array.isArray(preview.table.rows) ? preview.table.rows : [];\n            if (cols.length) {\n              var thead = document.createElement('thead');\n              var trh = document.createElement('tr');\n              for (var ci = 0; ci < cols.length; ci += 1) {\n                var th = document.createElement('th');\n                th.textContent = String(cols[ci] || '');\n                trh.appendChild(th);\n              }\n              thead.appendChild(trh);\n              tbl.appendChild(thead);\n            }\n            var tbody = document.createElement('tbody');\n            var maxRows = Math.max(1, Math.min(12, rows.length));\n            for (var ri = 0; ri < maxRows; ri += 1) {\n              var tr = document.createElement('tr');\n              var row = Array.isArray(rows[ri]) ? rows[ri] : [];\n              var cells = cols.length ? cols.length : row.length;\n              for (var cj = 0; cj < cells; cj += 1) {\n                var td = document.createElement('td');\n                td.textContent = String(row[cj] != null ? row[cj] : '');\n                tr.appendChild(td);\n              }\n              tbody.appendChild(tr);\n            }\n            tbl.appendChild(tbody);\n            body.appendChild(tbl);\n          } else if (k === 'code' && preview.code) {\n            var pre = document.createElement('pre');\n            pre.className = 'kg-mdCode';\n            var lines = Array.isArray(preview.code.lines) ? preview.code.lines : [];\n            pre.textContent = String(lines.slice(0, 18).join('\\n'));\n            body.appendChild(pre);\n          } else if (k === 'blockquote' && preview.blockquote) {\n            var quote = document.createElement('blockquote');\n            quote.className = 'kg-mdQuote';\n            var qLines = Array.isArray(preview.blockquote.lines) ? preview.blockquote.lines : [];\n            quote.textContent = String(qLines.slice(0, 10).join('\\n'));\n            body.appendChild(quote);\n          } else if (k === 'callout' && preview.callout) {\n            var callout = document.createElement('aside');\n            callout.className = 'kg-mdCallout';\n            var cTitle = (preview.callout.title ? String(preview.callout.title || '').trim() : '');\n            var calloutTitle = document.createElement('h4');\n            calloutTitle.className = 'kg-mdCalloutTitle';\n            calloutTitle.textContent = cTitle || String(b.title || 'Callout');\n            callout.appendChild(calloutTitle);\n            body.appendChild(callout);\n          } else {\n            var paragraph = document.createElement('p');\n            paragraph.className = 'kg-mdText';\n            paragraph.textContent = String(b.summary || b.title || '');\n            body.appendChild(paragraph);\n          }\n        } catch (e4) {\n          void 0;\n        }\n\n        el.appendChild(header);\n        el.appendChild(body);\n        overlay.appendChild(el);\n        overlay.__kgMdById[id] = el;\n        if (anchorId0) overlay.__kgMdById[anchorId0] = el;\n      }\n    }\n\n    var overlayRaf = null;",
  )

  out = replaceOnceExact(
    out,
    'ensureMediaDom();\n      if (!mediaNodes || mediaNodes.length === 0) return;',
    "ensureMediaDom();\n      ensureMarkdownDom();\n      try {\n        if ((!mediaNodes || mediaNodes.length === 0) && overlay && overlay.__kgMediaById) {\n          mediaNodes = mediaNodes || [];\n          for (var mid in overlay.__kgMediaById) {\n            if (!Object.prototype.hasOwnProperty.call(overlay.__kgMediaById, mid)) continue;\n            var mid0 = __kgResolveNodeId(String(mid || '').trim());\n            if (!mid0) continue;\n            var seen0 = false;\n            for (var mi0 = 0; mi0 < mediaNodes.length; mi0 += 1) {\n              var mn0 = mediaNodes[mi0];\n              if (mn0 && String(mn0.id || '').trim() === mid0) { seen0 = true; break; }\n            }\n            if (!seen0) mediaNodes.push({ id: mid0, title: mid0, url: '', openUrl: '', interactive: true, kind: 'iframe' });\n          }\n        }\n      } catch (eHyd0) { void 0; }\n      if ((!mediaNodes || mediaNodes.length === 0) && (!markdownBlocks || markdownBlocks.length === 0)) return;",
  )

  out = replaceOnceExact(
    out,
    'if (!markdownBlocks || markdownBlocks.length === 0) return;',
    "if (!markdownBlocks || markdownBlocks.length === 0) return;\n      try {\n        var hasOverlayMd = false;\n        try {\n          hasOverlayMd = !!(overlay && overlay.querySelector && overlay.querySelector('[data-md-id]'));\n        } catch (e0) {\n          hasOverlayMd = false;\n        }\n        if (!hasOverlayMd && typeof svg !== 'undefined' && svg && svg.querySelector && svg.querySelector('[data-kg-layer=\\\"markdown-design-blocks\\\"] foreignObject')) return;\n      } catch (eSkip) {}",
  )

  out = replaceOnceExact(
    out,
    "lastBoxById[id] = { left: left, top: top, w: panelW, h: panelH, display: 'block' };\n        }\n      }\n    }\n\n    function onWheel(e){",
    "lastBoxById[id] = { left: left, top: top, w: panelW, h: panelH, display: 'block' };\n        }\n      }\n\n      try {\n        if (markdownBlocks && markdownBlocks.length) {\n          var mdById = overlay.__kgMdById || {};\n          var lastMdBoxById = overlay.__kgMdBoxById || (overlay.__kgMdBoxById = {});\n          var baseSx0 = (svgBase && isFinite(svgBase.sx) && svgBase.sx > 0) ? svgBase.sx : 1;\n          var baseSy0 = (svgBase && isFinite(svgBase.sy) && svgBase.sy > 0) ? svgBase.sy : 1;\n          var ox0 = (svgBase && isFinite(svgBase.ox)) ? svgBase.ox : 0;\n          var oy0 = (svgBase && isFinite(svgBase.oy)) ? svgBase.oy : 0;\n          for (var mi = 0; mi < markdownBlocks.length; mi += 1) {\n            var b = markdownBlocks[mi];\n            if (!b) continue;\n            var bid = String(b.id || '');\n            var anchorId = String((b && (b.anchorNodeId || b.anchorId)) || '').trim();\n            if (!bid && !anchorId) continue;\n            var el = mdById[bid] || mdById[anchorId] || null;\n            if (!el) continue;\n            var xw = Number(b.x);\n            var yw = Number(b.y);\n            var ww = Number(b.w);\n            var hh = Number(b.h);\n            if (!isFinite(xw) || !isFinite(yw) || !isFinite(ww) || !isFinite(hh) || !(ww > 0) || !(hh > 0)) continue;\n            var left = xw * state.k * baseSx0 + state.x + ox0;\n            var top = yw * state.k * baseSy0 + state.y + oy0;\n            var sw = ww * state.k * baseSx0;\n            var sh = hh * state.k * baseSy0;\n            var il = Math.round(left);\n            var it = Math.round(top);\n            var iw = Math.max(1, Math.round(sw));\n            var ih = Math.max(1, Math.round(sh));\n            var key0 = anchorId || bid;\n            var prev = lastMdBoxById[key0] || null;\n            if (!prev || prev.left !== il || prev.top !== it || prev.w !== iw || prev.h !== ih || prev.display !== 'block') {\n              applyPanelBox(el, { left: il, top: it, w: iw, h: ih, display: 'block', zIndex: 1 });\n              var boxVal = { left: il, top: it, w: iw, h: ih, display: 'block' };\n              if (bid) lastMdBoxById[bid] = boxVal;\n              if (anchorId) lastMdBoxById[anchorId] = boxVal;\n              try { scheduleEdgeGeometryUpdateForNode(anchorId || bid); } catch (e0) {}\n            }\n          }\n        }\n      } catch (mdErr) {}\n\n      try {\n        if (svg && overlay && nodePosById) {\n          var baseSx1 = (svgBase && isFinite(svgBase.sx) && svgBase.sx > 0) ? svgBase.sx : 1;\n          var baseSy1 = (svgBase && isFinite(svgBase.sy) && svgBase.sy > 0) ? svgBase.sy : 1;\n          var ox1 = (svgBase && isFinite(svgBase.ox)) ? svgBase.ox : 0;\n          var oy1 = (svgBase && isFinite(svgBase.oy)) ? svgBase.oy : 0;\n          var density1 = __AG_DENSITY__;\n          var headerH = density1 === 'compact' ? 22 : 28;\n          var offMap = svg.__kgNodeOffsetById || (svg.__kgNodeOffsetById = {});\n\n          var mediaBoxById = overlay.__kgMediaBoxById || {};\n          if (mediaNodes && mediaNodes.length) {\n            for (var mi2 = 0; mi2 < mediaNodes.length; mi2 += 1) {\n              var n0 = mediaNodes[mi2];\n              var id0 = String(n0 && n0.id ? n0.id : '');\n              if (!id0) continue;\n              var box0 = mediaBoxById[id0] || null;\n              var p0 = nodePosById && nodePosById[id0] ? nodePosById[id0] : null;\n              if (!p0 || !box0) continue;\n              var x0 = Number(p0.x);\n              var y0 = Number(p0.y);\n              if (!isFinite(x0) || !isFinite(y0)) continue;\n              var asx = x0 * state.k * baseSx1 + state.x + ox1;\n              var asy = y0 * state.k * baseSy1 + state.y + oy1;\n              var dx0 = (Number(box0.left) || 0) + (Number(box0.w) || 0) * 0.5 - asx;\n              var dy0 = (Number(box0.top) || 0) + Math.min(headerH, Number(box0.h) || 0) * 0.5 - asy;\n              var prev0 = offMap[id0] || null;\n              if (!prev0 || Math.abs((Number(prev0.x) || 0) - dx0) > 0.5 || Math.abs((Number(prev0.y) || 0) - dy0) > 0.5) {\n                offMap[id0] = { x: dx0, y: dy0 };\n                try { scheduleEdgeGeometryUpdateForNode(id0); } catch (e0) {}\n              }\n            }\n          }\n\n          var mdBoxById = overlay.__kgMdBoxById || {};\n          var hasMdBlocks0 = !!(markdownBlocks && markdownBlocks.length);\n          if (hasMdBlocks0) {\n            for (var mi3 = 0; mi3 < markdownBlocks.length; mi3 += 1) {\n              var b0 = markdownBlocks[mi3];\n              if (!b0) continue;\n              var bid0 = String(b0.id || '');\n              var anchorId0 = String((b0 && (b0.anchorNodeId || b0.anchorId)) || '').trim();\n              var key1 = anchorId0 || bid0;\n              if (!key1) continue;\n              var box1 = mdBoxById[key1] || mdBoxById[bid0] || null;\n              var p1 = nodePosById && nodePosById[key1] ? nodePosById[key1] : null;\n              if (!p1 || !box1) continue;\n              var x1 = Number(p1.x);\n              var y1 = Number(p1.y);\n              if (!isFinite(x1) || !isFinite(y1)) continue;\n              var bsx = x1 * state.k * baseSx1 + state.x + ox1;\n              var bsy = y1 * state.k * baseSy1 + state.y + oy1;\n              var dx1 = (Number(box1.left) || 0) + (Number(box1.w) || 0) * 0.5 - bsx;\n              var dy1 = (Number(box1.top) || 0) + (Number(box1.h) || 0) * 0.5 - bsy;\n              var prev1 = offMap[key1] || null;\n              if (!prev1 || Math.abs((Number(prev1.x) || 0) - dx1) > 0.5 || Math.abs((Number(prev1.y) || 0) - dy1) > 0.5) {\n                offMap[key1] = { x: dx1, y: dy1 };\n                try { scheduleEdgeGeometryUpdateForNode(key1); } catch (e1) {}\n              }\n            }\n          }\n          if (!hasMdBlocks0 && mdBoxById) {\n            for (var mid0 in mdBoxById) {\n              if (!Object.prototype.hasOwnProperty.call(mdBoxById, mid0)) continue;\n              var key2 = String(mid0 || '').trim();\n              if (!key2) continue;\n              var p2 = nodePosById && nodePosById[key2] ? nodePosById[key2] : null;\n              var box2 = mdBoxById[key2] || null;\n              if (!p2 || !box2) continue;\n              var x2 = Number(p2.x);\n              var y2 = Number(p2.y);\n              if (!isFinite(x2) || !isFinite(y2)) continue;\n              var csx = x2 * state.k * baseSx1 + state.x + ox1;\n              var csy = y2 * state.k * baseSy1 + state.y + oy1;\n              var dx2 = (Number(box2.left) || 0) + (Number(box2.w) || 0) * 0.5 - csx;\n              var dy2 = (Number(box2.top) || 0) + (Number(box2.h) || 0) * 0.5 - csy;\n              var prev2 = offMap[key2] || null;\n              if (!prev2 || Math.abs((Number(prev2.x) || 0) - dx2) > 0.5 || Math.abs((Number(prev2.y) || 0) - dy2) > 0.5) {\n                offMap[key2] = { x: dx2, y: dy2 };\n                try { scheduleEdgeGeometryUpdateForNode(key2); } catch (e2) {}\n              }\n            }\n          }\n        }\n      } catch (errOff) {}\n    }\n\n    function onWheel(e){",
  )
  out = replaceOnceExact(
    out,
    "} else {\n          var iframe = document.createElement('iframe');\n          iframe.loading = 'eager';\n          iframe.referrerPolicy = 'no-referrer';\n          iframe.src = url;\n          body.appendChild(iframe);\n        }",
    "} else if (kind === 'audio') {\n          var audio = document.createElement('audio');\n          audio.controls = true;\n          audio.preload = 'metadata';\n          audio.src = url;\n          body.appendChild(audio);\n        } else {\n          var useSnapshot = false;\n          try {\n            var srcDoc0 = String((n && (n.srcDoc || n.srcdoc)) || '');\n            if (srcDoc0 && String(srcDoc0).trim()) {\n              useSnapshot = false;\n            } else {\n              var direct = false;\n              try { direct = typeof kgIsDirectIframeEmbedUrl === 'function' ? kgIsDirectIframeEmbedUrl(url) : false; } catch (e0) { direct = false; }\n              var forceSnap = false;\n              try { forceSnap = (!direct) && (typeof kgShouldForceSnapshotUrl === 'function' ? kgShouldForceSnapshotUrl(url) : false); } catch (e1) { forceSnap = false; }\n              useSnapshot = (!mediaInteractive) || forceSnap;\n            }\n          } catch (e0) {\n            useSnapshot = (!mediaInteractive);\n          }\n\n          if (useSnapshot) {\n            try {\n              var snapUrl = '';\n              try { snapUrl = String((typeof openUrl !== 'undefined' && openUrl) ? openUrl : url); } catch (e1) { snapUrl = String(url || ''); }\n              var snap = kgCreateWebpageSnapshotPreview({ url: snapUrl, title: String(n && n.title ? n.title : '') });\n              if (snap) body.appendChild(snap);\n            } catch (e2) {\n              void 0;\n            }\n          } else {\n            var iframe = document.createElement('iframe');\n            iframe.loading = 'eager';\n            iframe.referrerPolicy = 'no-referrer';\n            iframe.src = url;\n            body.appendChild(iframe);\n          }\n        }",
  )
  out = replaceOnceExact(
    out,
    'function fitToCenter(){',
    "function getContentCentroid(){\n      try {\n        if (nodePosById) {\n          var sx = 0;\n          var sy = 0;\n          var c = 0;\n          for (var id in nodePosById) {\n            var p = nodePosById[id];\n            if (!p) continue;\n            var x = Number(p.x);\n            var y = Number(p.y);\n            if (!isFinite(x) || !isFinite(y)) continue;\n            sx += x;\n            sy += y;\n            c += 1;\n          }\n          if (c > 0) return { x: sx / c, y: sy / c };\n        }\n      } catch (e) {}\n      return null;\n    }\n\n    function fitToCenter(){",
  )

  out = replaceOnceExact(
    out,
    'var cx = bb.x + bb.width / 2;\n      var cy = bb.y + bb.height / 2;',
    'var c = getContentCentroid();\n      var cx = (c && isFinite(c.x)) ? c.x : (bb.x + bb.width / 2);\n      var cy = (c && isFinite(c.y)) ? c.y : (bb.y + bb.height / 2);',
  )

  out = replaceOnceExact(
    out,
    "if (t && t.closest && (t.closest('[data-node-id]') || t.closest('[data-edge-id]') || t.closest('[data-kg-group-id]') || t.closest('.kg-media'))) return;",
    "if (t && t.closest && t.closest('[data-edge-id]')) return;",
  )

  out = replaceOnceExact(
    out,
    "map[nodeId] = { x: ox + dx, y: oy + dy };\n          return;",
    "map[nodeId] = { x: ox + dx, y: oy + dy };\n          try { scheduleEdgeGeometryUpdateForNode(nodeId); } catch (e0) {}\n          return;",
  )

  out = replaceOnceExact(
    out,
    'map[id] = { x: ox + dx, y: oy + dy };',
    'map[id] = { x: ox + dx, y: oy + dy };\n              try { scheduleEdgeGeometryUpdateForNode(id); } catch (e0) {}',
  )

  out = replaceOnceExact(
    out,
    "var allEdgeEls = svg ? svg.querySelectorAll('line[data-edge-id],path[data-edge-id],polyline[data-edge-id]') : null;",
    "try {\n" +
      "        if (svg && edgeMetaById && nodePosById) {\n" +
      "          var existingEdges = svg.querySelectorAll('line[data-edge-id],path[data-edge-id],polyline[data-edge-id]');\n" +
      "          if (!existingEdges || existingEdges.length === 0) {\n" +
      "            var linksRoot = svg.querySelector('[data-kg-layer=\"links\"]');\n" +
      "            if (linksRoot) {\n" +
      "              for (var eid2 in edgeMetaById) {\n" +
      "                if (!Object.prototype.hasOwnProperty.call(edgeMetaById, eid2)) continue;\n" +
      "                var meta2 = edgeMetaById[eid2];\n" +
      "                if (!meta2) continue;\n" +
      "                var s2 = String(meta2.s || '').trim();\n" +
      "                var t2 = String(meta2.t || '').trim();\n" +
      "                if (!s2 || !t2) continue;\n" +
      "                var ps2 = nodePosById && nodePosById[s2] ? nodePosById[s2] : null;\n" +
      "                var pt2 = nodePosById && nodePosById[t2] ? nodePosById[t2] : null;\n" +
      "                if (!ps2 || !pt2) continue;\n" +
      "                var sx2 = Number(ps2.x);\n" +
      "                var sy2 = Number(ps2.y);\n" +
      "                var tx2 = Number(pt2.x);\n" +
      "                var ty2 = Number(pt2.y);\n" +
      "                if (!isFinite(sx2) || !isFinite(sy2) || !isFinite(tx2) || !isFinite(ty2)) continue;\n" +
      "                var line2 = svg.ownerDocument && svg.ownerDocument.createElementNS\n" +
      "                  ? svg.ownerDocument.createElementNS(svg.namespaceURI || 'http://www.w3.org/2000/svg', 'line')\n" +
      "                  : null;\n" +
      "                if (!line2) continue;\n" +
      "                line2.setAttribute('data-edge-id', eid2);\n" +
      "                line2.setAttribute('data-source-id', s2);\n" +
      "                line2.setAttribute('data-target-id', t2);\n" +
      "                line2.setAttribute('x1', String(sx2));\n" +
      "                line2.setAttribute('y1', String(sy2));\n" +
      "                line2.setAttribute('x2', String(tx2));\n" +
      "                line2.setAttribute('y2', String(ty2));\n" +
      "                line2.setAttribute('stroke', 'var(--kg-canvas-edge-stroke)');\n" +
      "                line2.setAttribute('stroke-opacity', '1');\n" +
      "                line2.setAttribute('stroke-width', '2');\n" +
      "                line2.setAttribute('stroke-linecap', 'round');\n" +
      "                line2.setAttribute('fill', 'none');\n" +
      "                try { line2.style.pointerEvents = 'none'; } catch (e0) {}\n" +
      "                linksRoot.appendChild(line2);\n" +
      "                try {\n" +
      "                  if (typeof edgeLineByEdgeId === 'object' && edgeLineByEdgeId) {\n" +
      "                    if (!edgeLineByEdgeId[eid2]) edgeLineByEdgeId[eid2] = line2;\n" +
      "                  }\n" +
      "                } catch (e1) {}\n" +
      "                try {\n" +
      "                  if (typeof edgeRefsByNodeId === 'object' && edgeRefsByNodeId) {\n" +
      "                    var r0 = edgeRefsByNodeId[s2] || (edgeRefsByNodeId[s2] = []);\n" +
      "                    r0.push({ el: line2, end: 's' });\n" +
      "                    var r1 = edgeRefsByNodeId[t2] || (edgeRefsByNodeId[t2] = []);\n" +
      "                    r1.push({ el: line2, end: 't' });\n" +
      "                  }\n" +
      "                } catch (e2) {}\n" +
      "              }\n" +
      "            }\n" +
      "          }\n" +
      "        }\n" +
      "      } catch (e) {}\n" +
      "      var allEdgeEls = svg ? svg.querySelectorAll('line[data-edge-id],path[data-edge-id],polyline[data-edge-id]') : null;",
  )
  out = replaceAllExact(out, '__AG_PROXY_ORIGIN__', JSON.stringify(String(args.proxyOrigin || '')))
  out = replaceAllExact(out, '__AG_ALLOW_RUNTIME_NETWORK__', args.allowRuntimeNetwork === true ? 'true' : 'false')
  return out
}
