import { resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'

const escapeHtml = (s: string): string => {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
const tryReadCssVar = (name: string, fallback: string): string => {
  try {
    if (typeof document === 'undefined') return fallback
    const raw = String(getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim()
    return raw || fallback
  } catch {
    return fallback
  }
}

export function readHtmlViewerDocumentAppearance(density: 'default' | 'compact') {
  const canvasBg = resolveCssVarWithKgFallback('--kg-canvas-bg') || '#ffffff'
  const panelBg = resolveCssVarWithKgFallback('--kg-panel-bg') || 'rgba(255,255,255,0.92)'
  const border = resolveCssVarWithKgFallback('--kg-border') || 'rgba(0,0,0,0.12)'
  const text = resolveCssVarWithKgFallback('--kg-text-primary') || 'rgba(0,0,0,0.86)'
  const textSecondary = resolveCssVarWithKgFallback('--kg-text-secondary') || 'rgba(0,0,0,0.7)'
  const textTertiary = resolveCssVarWithKgFallback('--kg-text-tertiary') || 'rgba(0,0,0,0.55)'
  const panelActionBg = resolveCssVarWithKgFallback('--kg-panel-action-bg') || 'rgba(0,0,0,0.04)'
  const panelActionBgHover = resolveCssVarWithKgFallback('--kg-panel-action-bg-hover') || 'rgba(0,0,0,0.06)'

  const canvasEdgeStroke = resolveCssVarWithKgFallback('--kg-canvas-edge-stroke') || '#9ca3af'
  const canvasNodeStroke = resolveCssVarWithKgFallback('--kg-canvas-node-stroke') || '#ffffff'
  const canvasAccent = resolveCssVarWithKgFallback('--kg-canvas-accent') || '#3b82f6'
  const canvasLabelFill = resolveCssVarWithKgFallback('--kg-canvas-label-fill') || text
  const canvasLabelHalo = resolveCssVarWithKgFallback('--kg-canvas-label-halo') || canvasBg
  const markdownHeaderBg = resolveCssVarWithKgFallback('--kg-media-panel-header-bg') || 'rgba(0,0,0,0.04)'


  const markdownPanelHeaderH = density === 'compact' ? 22 : 28
  const mediaPanelRadius = density === 'compact' ? 9 : 10
  const mediaPanelPadding = density === 'compact' ? 6 : 8
  const mediaPanelTitleSize = density === 'compact' ? 11 : 12
  return { canvasBg, panelBg, border, text, textSecondary, textTertiary, panelActionBg, panelActionBgHover, canvasEdgeStroke, canvasNodeStroke, canvasAccent, canvasLabelFill, canvasLabelHalo, markdownHeaderBg, markdownPanelHeaderH, mediaPanelRadius, mediaPanelPadding, mediaPanelTitleSize }
}

export function buildHtmlViewerDocumentShell(args: {
  title: string
  svgMarkup: string
  overlayHtml: string
  runtimeScript: string
  has3dPayload: boolean
  appearance: ReturnType<typeof readHtmlViewerDocumentAppearance>
}): string {
  const { title, svgMarkup: svgPlaceholder, overlayHtml: overlayHtmlFiltered, runtimeScript } = args
  const { canvasBg, panelBg, border, text, textSecondary, textTertiary, panelActionBg, panelActionBgHover, canvasEdgeStroke, canvasNodeStroke, canvasAccent, canvasLabelFill, canvasLabelHalo, markdownHeaderBg, markdownPanelHeaderH, mediaPanelRadius, mediaPanelPadding, mediaPanelTitleSize } = args.appearance
  const fontFamily = tryReadCssVar('--kg-font-family', 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      --kg-canvas-bg:${escapeHtml(canvasBg)};
      --kg-panel-bg:${escapeHtml(panelBg)};
      --kg-media-panel-bg:${escapeHtml(panelBg)};
      --kg-border:${escapeHtml(border)};
      --kg-text:${escapeHtml(text)};
      --kg-text-primary:${escapeHtml(text)};
      --kg-text-secondary:${escapeHtml(textSecondary)};
      --kg-text-tertiary:${escapeHtml(textTertiary)};
      --kg-panel-action-bg:${escapeHtml(panelActionBg)};
      --kg-panel-action-bg-hover:${escapeHtml(panelActionBgHover)};
      --kg-canvas-edge-stroke:${escapeHtml(canvasEdgeStroke)};
      --kg-canvas-node-stroke:${escapeHtml(canvasNodeStroke)};
      --kg-canvas-accent:${escapeHtml(canvasAccent)};
      --kg-canvas-label-fill:${escapeHtml(canvasLabelFill)};
      --kg-canvas-label-halo:${escapeHtml(canvasLabelHalo)};
      --kg-md-panel-header-bg:${escapeHtml(markdownHeaderBg)};
      --kg-md-panel-header-h:${markdownPanelHeaderH}px;
      --kg-media-panel-border-w:1px;
      --kg-media-panel-radius:${mediaPanelRadius}px;
      --kg-media-panel-padding:${mediaPanelPadding}px;
      --kg-media-panel-title-size:${mediaPanelTitleSize}px;
      --kg-media-pointer-events:auto;
    }
    html,body{height:100%;width:100%;margin:0;background:var(--kg-canvas-bg);color:var(--kg-text);font-family:${escapeHtml(fontFamily)};-webkit-user-select:none;user-select:none;-webkit-text-size-adjust:100%;text-size-adjust:100%;overscroll-behavior:none}
    #kg-root{position:fixed;inset:0;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;cursor:grab;overscroll-behavior:none}
    #kg-root.kg-dragging{cursor:grabbing}
    #kg-root.kg-fixedViewport{inset:auto;left:50%;top:50%;width:var(--kg-fixed-w,1920px);height:var(--kg-fixed-h,1080px);transform:translate(-50%,-50%) scale(var(--kg-fixed-scale,1));transform-origin:center}
    #kg-root *{-webkit-user-select:none;user-select:none}
    #kg-stage{position:absolute;inset:0}
    #kg-webgl{position:absolute;inset:0;width:100%;height:100%;display:none;touch-action:none;outline:none}
    #kg-root.kg-canvas3d #kg-webgl{display:block}
    #kg-root.kg-canvas3d #kg-svgWrap{display:none}
    #kg-svgWrap{position:absolute;inset:0}
    #kg-svgWrap svg{display:block;width:100%;height:100%;overflow:visible;shape-rendering:geometricPrecision;text-rendering:geometricPrecision}
    #kg-svgWrap text{user-select:none;-webkit-user-select:none}
    #kg-svgWrap [data-kg-layer="markdown-design-blocks"]{display:block}
    #kg-overlay{position:fixed;inset:0;pointer-events:none}
    .kg-media{position:absolute;left:0;top:0;box-sizing:border-box;overflow:hidden;contain:layout paint;isolation:isolate;border-radius:var(--kg-media-panel-radius, 10px);border:var(--kg-media-panel-border-w, 1px) solid var(--kg-border);background:var(--kg-media-panel-bg, var(--kg-panel-bg, rgba(255,255,255,0.92)));box-shadow:0 10px 30px rgba(0,0,0,0.18);will-change:left, top, width, height;display:flex;flex-direction:column;pointer-events:auto}
    .kg-mediaBody{flex:1;padding:var(--kg-media-panel-padding, 6px);box-sizing:border-box;min-height:0;position:relative}
    .kg-mediaBody iframe,.kg-mediaBody img,.kg-mediaBody video,.kg-mediaBody audio{display:block;width:100%;height:100%;border:0;border-radius:calc(var(--kg-media-panel-radius) * 0.8);background:rgba(0,0,0,0.02);pointer-events:var(--kg-media-pointer-events);box-sizing:border-box}
    .kg-mediaSnap{position:absolute;inset:var(--kg-media-panel-padding, 6px);border-radius:calc(var(--kg-media-panel-radius) * 0.8);overflow:hidden;background:linear-gradient(135deg, rgba(15,23,42,0.06), rgba(148,163,184,0.10));border:1px solid rgba(0,0,0,0.06);display:flex;align-items:stretch;justify-content:stretch;pointer-events:none}
    .kg-mediaSnapImg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.02);opacity:0;transition:opacity 220ms ease}
    .kg-mediaSnapMeta{position:absolute;left:0;right:0;bottom:0;padding:10px 10px 9px;background:linear-gradient(180deg, rgba(15,23,42,0), rgba(15,23,42,0.66));color:#fff;display:flex;flex-direction:column;gap:2px}
    .kg-mediaSnapTitle{font-size:12px;line-height:1.25;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .kg-mediaSnapHost{font-size:11px;line-height:1.25;opacity:0.84;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .kg-md{position:absolute;left:0;top:0;display:flex;flex-direction:column;pointer-events:none;background:var(--kg-panel-bg);border:var(--kg-media-panel-border-w) solid var(--kg-border);border-radius:var(--kg-media-panel-radius);box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden;box-sizing:border-box}
    .kg-mdHeader{height:var(--kg-md-panel-header-h);display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--kg-md-panel-header-bg, rgba(0,0,0,0.04));border-bottom:var(--kg-media-panel-border-w) solid var(--kg-border)}
    .kg-mdTitle{font-size:var(--kg-media-panel-title-size);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--kg-text-tertiary)}
    .kg-mdBody{position:relative;flex:1;padding:var(--kg-media-panel-padding);box-sizing:border-box}
    .kg-mdTable{width:100%;border-collapse:collapse;font-size:11px;line-height:1.25;color:var(--kg-text)}
    .kg-mdTable th{ text-align:left; border:1px solid var(--kg-border); padding:2px 4px; background:rgba(0,0,0,0.04); font-weight:600 }
    .kg-mdTable td{ border:1px solid var(--kg-border); padding:2px 4px; vertical-align:top }
    .kg-mdCode{margin:0;padding:6px;border-radius:8px;background:rgba(0,0,0,0.06);font-size:11px;line-height:1.35;overflow:hidden;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;white-space:pre;color:var(--kg-text)}
    .kg-mdQuote{border-left:3px solid var(--kg-border);padding-left:8px;color:var(--kg-text);font-size:12px;line-height:1.35;white-space:pre-wrap}
    .kg-mdText{font-size:12px;line-height:1.35;color:var(--kg-text);white-space:pre-wrap}
    .kg-mdCallout{border-left:3px solid var(--kg-canvas-accent);padding-left:8px;color:var(--kg-text);font-size:12px;line-height:1.35}
    .kg-mdCalloutTitle{font-weight:700;margin-bottom:4px}
    #kg-hud{position:absolute;left:max(12px, env(safe-area-inset-left));top:max(12px, env(safe-area-inset-top));display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:1000;max-width:calc(100vw - 24px)}
    .kg-btn{border:1px solid var(--kg-border);background:var(--kg-panel-bg);color:var(--kg-text);border-radius:10px;padding:8px 10px;font-size:12px;cursor:pointer;min-width:32px;min-height:32px;line-height:1.2}
    .kg-btn:disabled{opacity:0.5;cursor:not-allowed}
    .kg-btn.kg-active{outline:2px solid rgba(59,130,246,0.6);outline-offset:0}
    .kg-tip{display:block;position:absolute;left:0;top:0;transform:translate3d(-99999px,-99999px,0);max-width:min(420px,calc(100vw - 24px));padding:8px 10px;border-radius:12px;background:rgba(17,24,39,.9);color:#fff;font-size:12px;line-height:1.25;pointer-events:none;z-index:9999;backdrop-filter: blur(10px);-webkit-backdrop-filter: blur(10px);border:1px solid rgba(255,255,255,0.08)}
    .kg-tip strong{font-weight:600}
    @media (max-width:520px){.kg-btn{padding:10px 12px;font-size:14px;border-radius:12px;min-width:40px;min-height:40px}}
    @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
    @keyframes kgNodeBob{0%{transform:translateY(0)}50%{transform:translateY(calc(var(--kg-bob-amp,2px) * -1))}100%{transform:translateY(0)}}
  </style>
</head>
<body>
  <main id="kg-root">
    <section id="kg-stage" aria-label="Graph canvas stage">
      <canvas id="kg-webgl" aria-label="3D canvas" tabindex="-1"></canvas>
      <figure id="kg-svgWrap">${svgPlaceholder}</figure>
    </section>
    <section id="kg-overlay" aria-label="Graph overlay">${overlayHtmlFiltered}</section>
    <nav id="kg-hud" aria-label="Canvas controls" data-kg-canvas-wheel-ignore="true" data-kg-canvas-pointer-ignore="true">
      <button class="kg-btn" id="kg-fit" type="button">Fit</button>
      <button class="kg-btn" id="kg-reset" type="button">Reset</button>
      <button class="kg-btn" id="kg-3d-toggle" type="button"${args.has3dPayload ? ' title="Switch between 2D and 3D"' : ' disabled title="No 3D data in this snapshot"'}>2D/3D</button>
      <button class="kg-btn" id="kg-rich-toggle" type="button">Rich</button>
      <button class="kg-btn" id="kg-media-toggle" type="button">Media</button>
      <button class="kg-btn" id="kg-frontmatter-toggle" type="button">Frontmatter</button>
    </nav>
  </main>
  <output id="kg-tooltip" class="kg-tip" aria-hidden="true"></output>
  <script>
${runtimeScript}
  </script>
</body>
</html>`

  return html
}
