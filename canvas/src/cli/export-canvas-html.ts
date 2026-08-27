import fs from 'node:fs/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { defaultSchema } from '@/lib/graph/schema'
import { exportGraphAsCentered3dSvgMarkup } from '@/lib/graph/graphCenteredSvg3d'
import { renderGraphCanvasSvgForHtmlExport } from '@/lib/graph/htmlCanvasSvgExport'
import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { ensureKgTokensInstalled } from '@/lib/ui/tokens-ssot'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { readPanSpeed, readWheelBehavior, readZoomSpeed } from '@/lib/canvas/camera-options-2d'
import { readSnapGridScalarSize } from '@/lib/canvas/snapGridSize'
import { buildMarkdownTokensKey, lexMarkdown } from '@/features/markdown/ui/markdownPreviewLex'
import { deriveMarkdownDesignLayout } from '@/features/markdown-edgeless/markdownDesignLayout'
import {
  FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT,
  FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS,
  FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS,
  FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT,
} from '@/lib/canvas/flow-zoom-tuning'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { normalizeInteractiveSvgForHtmlViewer } from '@/features/markdown-workspace/main/exports/normalizeInteractiveSvg'

type Point = { x: number; y: number }
type HtmlViewerBehaviorFlags = {
  allowEdgeDrag?: unknown
  allowGroupDrag?: unknown
}

function readArg(name: string): string {
  const ix = process.argv.indexOf(name)
  const v = ix >= 0 ? process.argv[ix + 1] : ''
  const out = String(v || '').trim()
  if (!out) throw new Error(`Missing ${name}`)
  return out
}

function readOptionalArg(name: string): string {
  const ix = process.argv.indexOf(name)
  const v = ix >= 0 ? process.argv[ix + 1] : ''
  return String(v || '').trim()
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function inlineMissingEdgeGeometry(args: { dom: JSDOM; svgMarkup: string; graphData: any }): string {
  const src = String(args.svgMarkup || '').trim()
  if (!src) return src

  try {
    const doc = args.dom.window.DOMParser
      ? new args.dom.window.DOMParser().parseFromString(src, 'image/svg+xml')
      : null
    const svg = doc?.documentElement as unknown as SVGSVGElement | null
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return src

    const linksRoot = svg.querySelector('[data-kg-layer="links"]')
    if (!linksRoot) return src
    if (linksRoot.querySelector('line[data-edge-id],path[data-edge-id],polyline[data-edge-id]')) return src

    const nodes = Array.isArray(args.graphData?.nodes) ? args.graphData.nodes : []
    const edges = Array.isArray(args.graphData?.edges) ? args.graphData.edges : []

    const posById: Record<string, Point> = {}
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n?.id || '').trim()
      if (!id) continue
      const x = n?.x
      const y = n?.y
      if (isFiniteNum(x) && isFiniteNum(y)) posById[id] = { x, y }
    }

    if (Object.keys(posById).length === 0) {
      const nodeEls = svg.querySelectorAll('[data-node-id]')
      for (let i = 0; i < nodeEls.length; i += 1) {
        const el = nodeEls[i] as any
        const id = String(el?.getAttribute?.('data-node-id') || '').trim()
        if (!id) continue
        const tag = String(el?.tagName || '').toLowerCase()
        if (tag === 'circle') {
          const cx = Number.parseFloat(String(el.getAttribute('cx') || 'NaN'))
          const cy = Number.parseFloat(String(el.getAttribute('cy') || 'NaN'))
          if (Number.isFinite(cx) && Number.isFinite(cy)) posById[id] = { x: cx, y: cy }
        } else {
          const x = Number.parseFloat(String(el.getAttribute('x') || 'NaN'))
          const y = Number.parseFloat(String(el.getAttribute('y') || 'NaN'))
          const w = Number.parseFloat(String(el.getAttribute('width') || 'NaN'))
          const h = Number.parseFloat(String(el.getAttribute('height') || 'NaN'))
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            posById[id] = { x: x + w / 2, y: y + h / 2 }
          }
        }
      }
    }

    const ns = svg.namespaceURI || 'http://www.w3.org/2000/svg'
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]
      const edgeId = String(e?.id || `e${i}`).trim()
      const sourceId = String(e?.sourceId || e?.source || '').trim()
      const targetId = String(e?.targetId || e?.target || '').trim()
      if (!edgeId || !sourceId || !targetId) continue
      const ps = posById[sourceId]
      const pt = posById[targetId]
      if (!ps || !pt) continue

      const line = doc!.createElementNS(ns, 'line')
      line.setAttribute('data-edge-id', edgeId)
      line.setAttribute('data-source-id', sourceId)
      line.setAttribute('data-target-id', targetId)
      line.setAttribute('x1', String(ps.x))
      line.setAttribute('y1', String(ps.y))
      line.setAttribute('x2', String(pt.x))
      line.setAttribute('y2', String(pt.y))
      line.setAttribute('stroke', 'var(--kg-canvas-edge-stroke)')
      line.setAttribute('stroke-opacity', '1')
      line.setAttribute('stroke-width', '2')
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('fill', 'none')
      ;(linksRoot as any).appendChild(line)
    }

    const serialized = args.dom.window.XMLSerializer ? new args.dom.window.XMLSerializer().serializeToString(svg) : ''
    return String(serialized || '').trim() || src
  } catch {
    return src
  }
}

async function main() {
  const input = readArg('--input')
  const output = readArg('--output')
  const modeRaw = readOptionalArg('--mode')
  const mode = modeRaw === '3d' ? '3d' : '2d'

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'file:///agenticgraph-export-builder.html' })
  ;(globalThis as unknown as { window?: unknown }).window = dom.window
  ;(globalThis as unknown as { document?: unknown }).document = dom.window.document
  ;(globalThis as unknown as { DOMParser?: unknown }).DOMParser = dom.window.DOMParser
  ;(globalThis as unknown as { XMLSerializer?: unknown }).XMLSerializer = dom.window.XMLSerializer
  ;(globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle = dom.window.getComputedStyle
  ;(globalThis as unknown as { Element?: unknown }).Element = dom.window.Element
  ;(globalThis as unknown as { HTMLElement?: unknown }).HTMLElement = dom.window.HTMLElement
  ;(globalThis as unknown as { CSS?: unknown }).CSS = (dom.window as unknown as { CSS?: unknown }).CSS
  try {
    const css = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS
    if (!css || typeof css.escape !== 'function') {
      ;(globalThis as unknown as { CSS?: { escape: (s: string) => string } }).CSS = {
        escape: (s: string) => String(s || '').replace(/[^a-zA-Z0-9_\-]/g, ch => `\\${ch}`),
      }
    }
  } catch {
    void 0
  }
  ;(globalThis as unknown as { SVGElement?: unknown }).SVGElement = (dom.window as unknown as { SVGElement?: unknown }).SVGElement
  ;(globalThis as unknown as { SVGSVGElement?: unknown }).SVGSVGElement = (dom.window as unknown as { SVGSVGElement?: unknown }).SVGSVGElement
  ;(globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame = dom.window.requestAnimationFrame
  ;(globalThis as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = dom.window.cancelAnimationFrame

  ensureKgTokensInstalled('light')

  const text = await fs.readFile(input, 'utf8')
  const name = path.basename(input)

  const markdownDesignBlocks = (() => {
    try {
      const lexed = lexMarkdown(text)
      const markdownTokensKey = buildMarkdownTokensKey(text)
      const layout = deriveMarkdownDesignLayout({ activeDocumentPath: name, markdownTokensKey, tokens: lexed.tokens })
      return Array.isArray(layout.blocks) ? layout.blocks : []
    } catch {
      return []
    }
  })()

  const loaded = await loadGraphDataFromTextViaParser(name, text, { applyToStore: false, syncMarkdownDocument: false })
  const graphData = loaded?.graphData || null
  if (!graphData) throw new Error('No graphData produced from input')

  const documentSemanticMode = (() => {
    const meta = (graphData.metadata || {}) as Record<string, unknown>
    return meta.kind === 'keyword' ? 'keyword' : 'document'
  })()
  const frontmatterModeEnabled = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode,
    graphData,
  })

  const widthPx = 1920
  const heightPx = 1080

  const fitInitialView2d = (() => {
    try {
      const mode = readLayoutMode(defaultSchema)
      const baseOpts = readFitAllOptions({ schema: defaultSchema, mode, intent: 'fitToScreen' })
      const opts = {
        ...baseOpts,
        centerMode: 'centroid',
        schema: defaultSchema,
        graphData,
        deriveGroupsOptions: { forceDocumentStructure: documentSemanticMode === 'document' },
      }
      const t = fitAllTransform((graphData.nodes ?? []) as any, widthPx, heightPx, opts as any)
      if (!t || !(typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0)) return null
      return { k: t.k, x: t.x, y: t.y }
    } catch {
      return null
    }
  })()

  const exportView = await (async (): Promise<{ svgMarkup: string; initialView: { k: number; x: number; y: number } | null }> => {
    if (mode === '3d') {
      const svgMarkup = exportGraphAsCentered3dSvgMarkup({
        graphData,
        schema: defaultSchema,
        widthPx,
        heightPx,
        paddingPx: 96,
        includeXmlDeclaration: false,
        animated: true,
        exportAutoRotate: true,
        exportAutoRotateSpeed: 1.2,
        exportMotionIntensityMultiplier: 2.2,
        exportTiltXRad: 0.45,
        exportCameraZ: 200,
      })
      return { svgMarkup: String(svgMarkup || '').trim(), initialView: null }
    }

    const rendered = await renderGraphCanvasSvgForHtmlExport({
      graphData,
      schema: defaultSchema,
      widthPx,
      heightPx,
      viewportControlsPreset: 'map',
      renderMediaAsNodes: false,
      mediaPanelDensity: 'default',
      documentSemanticMode,
      frontmatterModeEnabled,
      markdownDesignBlocks,
    })
    const normalized = normalizeInteractiveSvgForHtmlViewer(String(rendered || '').trim())
    const svgMarkup = inlineMissingEdgeGeometry({ dom, svgMarkup: normalized.svgMarkup, graphData })
    return { svgMarkup, initialView: normalized.initialView }
  })()
  if (!exportView.svgMarkup || !exportView.svgMarkup.trim()) throw new Error('Failed to build SVG')
  if (mode === '2d' && !exportView.svgMarkup.includes('data-kg-layer')) {
    throw new Error('2d SVG build did not include GraphCanvas layers (data-kg-layer); sandbox export is not aligned')
  }

  const htmlViewerBehavior = (defaultSchema.behavior || {}) as unknown as HtmlViewerBehaviorFlags

  const html = await buildGraphHtmlViewerMarkup({
    title: `${name} (Canvas)`,
    svgMarkup: exportView.svgMarkup,
    graphData,
    includeRichMediaOverlays: true,
    inlineRemoteMediaAssets: true,
    mediaPanelDensity: 'default',
    preferWebgl3d: mode === '3d',
    viewportWidthPx: 1920,
    viewportHeightPx: 1080,
    viewportScaleToFit: true,
    enableDecorativeAnimation: true,
    initialFrontmatterEnabled: frontmatterModeEnabled,
    initialView: mode === '3d' ? undefined : exportView.initialView || fitInitialView2d || undefined,
    zoomMinK: readZoomScaleExtent(defaultSchema)[0],
    zoomMaxK: readZoomScaleExtent(defaultSchema)[1],
    wheelBehavior: readWheelBehavior(defaultSchema),
    viewportControlsPreset: 'map',
    panSpeed: readPanSpeed(defaultSchema),
    zoomSpeed: readZoomSpeed(defaultSchema),
    flowWheelZoomSpeedMultiplier: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT,
    flowWheelZoomIncrementMultiplier: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT,
    flowWheelZoomSmoothMinDurationMs: FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS,
    flowWheelZoomSmoothMaxDurationMs: FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS,
    wheelZoomCtrlMetaBoostMultiplier: 120,
    canvasInteractionSpeedMultiplier: 1,
    canvasPanSpeedMultiplier: 1,
    snapGridEnabled: !!defaultSchema.behavior?.snapGrid?.enabled,
    snapGridSize: readSnapGridScalarSize(defaultSchema.behavior?.snapGrid?.size),
    dragConstraint: (defaultSchema.behavior?.dragConstraint as any) || 'free',
    hideLabelsBelowScale: Number(defaultSchema.performance?.lod?.hideLabelsBelowScale ?? 0),
    allowNodeDrag: defaultSchema.behavior?.allowNodeDrag !== false,
    allowEdgeDrag: htmlViewerBehavior.allowEdgeDrag !== false,
    allowGroupDrag: htmlViewerBehavior.allowGroupDrag !== false,
  })
  if (!html || !html.trim()) throw new Error('Failed to build HTML')

  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, html, 'utf8')
  process.stdout.write(output + '\n')
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + '\n')
  process.exit(1)
})
