import fs from 'node:fs/promises'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildGraphHtmlViewerMarkup } from '@/lib/graph/graphHtmlViewer'
import { ensureKgTokensInstalled } from '@/lib/ui/tokens-ssot'
import { defaultSchema } from '@/lib/graph/schema'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'

function readArg(name: string): string {
  const ix = process.argv.indexOf(name)
  const v = ix >= 0 ? process.argv[ix + 1] : ''
  const out = String(v || '').trim()
  if (!out) throw new Error(`Missing ${name}`)
  return out
}

function tryParseViewportFromSvg(svgMarkup: string): { w?: number; h?: number } {
  try {
    const mW = svgMarkup.match(/\bwidth=("|')([^"']+)(\1)/i)
    const mH = svgMarkup.match(/\bheight=("|')([^"']+)(\1)/i)
    const w = mW ? Number.parseFloat(String(mW[2] || '').trim()) : NaN
    const h = mH ? Number.parseFloat(String(mH[2] || '').trim()) : NaN
    return {
      w: Number.isFinite(w) && w > 0 ? Math.floor(w) : undefined,
      h: Number.isFinite(h) && h > 0 ? Math.floor(h) : undefined,
    }
  } catch {
    return {}
  }
}

function tryParseExportConfigFromHtml(html: string): {
  viewportWidthPx?: number
  viewportHeightPx?: number
  viewportScaleToFit?: boolean
  initialView?: { k: number; x: number; y: number } | null
  preferWebgl3d?: boolean
} {
  try {
    const m = String(html || '').match(/var\s+cfg\s*=\s*(\{[\s\S]*?\});/)
    if (!m || !m[1]) return {}
    const cfg = JSON.parse(m[1]) as any
    const fixed = cfg && typeof cfg.fixedViewport === 'object' ? cfg.fixedViewport : null
    const vw = fixed && Number.isFinite(Number(fixed.widthPx)) ? Math.max(1, Math.floor(Number(fixed.widthPx))) : undefined
    const vh = fixed && Number.isFinite(Number(fixed.heightPx)) ? Math.max(1, Math.floor(Number(fixed.heightPx))) : undefined
    const initial = cfg && typeof cfg.initialView === 'object' ? cfg.initialView : null
    const k = initial ? Number(initial.k) : NaN
    const x = initial ? Number(initial.x) : NaN
    const y = initial ? Number(initial.y) : NaN
    const initialView = Number.isFinite(k) && Number.isFinite(x) && Number.isFinite(y) && k > 0 ? { k, x, y } : null
    return {
      viewportWidthPx: vw,
      viewportHeightPx: vh,
      viewportScaleToFit: fixed ? fixed.scaleToFit === true : undefined,
      initialView,
      preferWebgl3d: cfg ? cfg.preferWebgl3d === true : undefined,
    }
  } catch {
    return {}
  }
}

async function main() {
  const inputMd = readArg('--inputMd')
  const inputHtml = readArg('--inputHtml')
  const outputHtml = readArg('--outputHtml')

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'file:///agentic-graph-export-builder.html' })
  ;(globalThis as unknown as { window?: unknown }).window = dom.window
  ;(globalThis as unknown as { document?: unknown }).document = dom.window.document
  ;(globalThis as unknown as { DOMParser?: unknown }).DOMParser = dom.window.DOMParser
  ;(globalThis as unknown as { XMLSerializer?: unknown }).XMLSerializer = dom.window.XMLSerializer
  ;(globalThis as unknown as { getComputedStyle?: unknown }).getComputedStyle = dom.window.getComputedStyle
  ;(globalThis as unknown as { Element?: unknown }).Element = dom.window.Element
  ;(globalThis as unknown as { HTMLElement?: unknown }).HTMLElement = dom.window.HTMLElement

  ensureKgTokensInstalled('light')

  const mdText = await fs.readFile(inputMd, 'utf8')
  const mdName = path.basename(inputMd)
  const loaded = await loadGraphDataFromTextViaParser(mdName, mdText, { applyToStore: false, syncMarkdownDocument: false })
  const graphData = loaded?.graphData || null
  if (!graphData) throw new Error('No graphData produced from input markdown')

  const htmlRaw = await fs.readFile(inputHtml, 'utf8')
  const title = (() => {
    const m = htmlRaw.match(/<title>([\s\S]*?)<\/title>/i)
    return m && m[1] ? String(m[1] || '').trim() : 'Graph viewer'
  })()

  const inputDoc = new JSDOM(htmlRaw).window.document
  const svgWrap = inputDoc.getElementById('kg-svgWrap')
  if (!svgWrap || svgWrap.tagName.toLowerCase() !== 'figure') throw new Error('Failed to locate semantic #kg-svgWrap in input html')
  const svgEl = svgWrap.querySelector('svg')
  if (!svgEl) throw new Error('Failed to extract <svg>...</svg> markup from input html')
  const svgMarkup = svgEl.outerHTML.trim()
  if (!svgMarkup) throw new Error('Empty svgMarkup extracted from input html')

  const overlayEl = inputDoc.getElementById('kg-overlay')
  if (!overlayEl || overlayEl.tagName.toLowerCase() !== 'section') throw new Error('Failed to locate semantic #kg-overlay in input html')
  const overlayHtml = String(overlayEl.innerHTML || '')

  const cfg = tryParseExportConfigFromHtml(htmlRaw)
  const vp = tryParseViewportFromSvg(svgMarkup)
  const viewportWidthPx = cfg.viewportWidthPx ?? vp.w
  const viewportHeightPx = cfg.viewportHeightPx ?? vp.h

  const fallbackInitialView = (() => {
    try {
      if (!(typeof viewportWidthPx === 'number' && Number.isFinite(viewportWidthPx))) return null
      if (!(typeof viewportHeightPx === 'number' && Number.isFinite(viewportHeightPx))) return null
      const meta = (graphData as any)?.metadata || {}
      const documentSemanticMode = meta && meta.kind === 'keyword' ? 'keyword' : 'document'
      const mode = readLayoutMode(defaultSchema)
      const baseOpts = readFitAllOptions({ schema: defaultSchema, mode, intent: 'fitToScreen' })
      const opts = {
        ...baseOpts,
        centerMode: 'centroid',
        schema: defaultSchema,
        graphData,
        deriveGroupsOptions: { forceDocumentStructure: documentSemanticMode === 'document' },
      }
      const t = fitAllTransform((graphData.nodes ?? []) as any, viewportWidthPx, viewportHeightPx, opts as any)
      if (!t || !(typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0)) return null
      return { k: t.k, x: t.x, y: t.y }
    } catch {
      return null
    }
  })()

  const htmlNext = await buildGraphHtmlViewerMarkup({
    title,
    svgMarkup,
    graphData,
    overlayHtml,
    viewportWidthPx,
    viewportHeightPx,
    viewportScaleToFit: cfg.viewportScaleToFit ?? true,
    includeRichMediaOverlays: true,
    inlineRemoteMediaAssets: true,
    preferWebgl3d: cfg.preferWebgl3d,
    initialView: (cfg.initialView ?? fallbackInitialView) || undefined,
  })
  if (!htmlNext || !htmlNext.trim()) throw new Error('Failed to rebuild html export')

  await fs.mkdir(path.dirname(outputHtml), { recursive: true })
  await fs.writeFile(outputHtml, htmlNext, 'utf8')
  process.stdout.write(outputHtml + '\n')
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + '\n')
  process.exit(1)
})
