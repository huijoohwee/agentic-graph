import type * as d3 from 'd3'
import { compareCanvasSurfaceArea } from '@/lib/canvas/layerOrder2d'
import { computeVectorPaintedOverlayScreenBox } from '@/lib/canvas/vectorPaintedOverlayProjection'

import { applyMediaPanelCssVars, applyPanelBox, computeMediaPanelCssVars3d, computePanelRect } from '@/lib/render/mediaPanelLayout'
import { computeMediaOverlaySizing, type MediaOverlaySizingConfig, type MediaOverlaySizing } from '@/lib/render/mediaOverlaySizing'
import type { MediaPanelDensity } from '@/lib/render/mediaPanelSpec'

export type MarkdownOverlayPanelItem = {
  id: string
  cx: number
  cy: number
  w?: number
  h?: number
}

export type MarkdownOverlayPanelLoop = {
  flush: () => void
  schedule: () => void
  stop: () => void
}

export function startMarkdownPanelOverlayLoop2d(args: {
  enabled: boolean
  loop: 'always' | 'onDemand'
  getItems: () => readonly MarkdownOverlayPanelItem[]
  getViewport: () => { left?: number; top?: number; w: number; h: number }
  readTransform: () => d3.ZoomTransform | null
  getElementForId: (id: string) => HTMLElement | null
  getDensity: () => MediaPanelDensity
  getSizingConfig: () => MediaOverlaySizingConfig
  clampToViewport?: { margin: number } | null
}): MarkdownOverlayPanelLoop {
  if (!args.enabled) return { flush: () => void 0, schedule: () => void 0, stop: () => void 0 }

  let rafOnce: number | null = null
  let rafLoop: number | null = null
  let lastSizingKey = ''
  let lastSizing: MediaOverlaySizing | null = null

  const update = () => {
    const t = args.readTransform()
    if (!t) return

    const viewport = args.getViewport()
    const vw = Math.max(1, Math.floor(Number(viewport.w) || 1))
    const vh = Math.max(1, Math.floor(Number(viewport.h) || 1))
    const viewportLeft = Number.isFinite(viewport.left) ? Number(viewport.left) : 0
    const viewportTop = Number.isFinite(viewport.top) ? Number(viewport.top) : 0
    const density = args.getDensity() === 'compact' ? 'compact' : 'default'
    const k = typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : 1
    const items = args.getItems()
    if (!items || items.length === 0) return
    const sizing = computeMediaOverlaySizing({
      density,
      viewportW: vw,
      viewportH: vh,
      zoomK: 1,
      itemCount: Math.max(1, items.length),
      config: args.getSizingConfig(),
    })
    if (sizing.key !== lastSizingKey) {
      lastSizingKey = sizing.key
      lastSizing = sizing
    }
    const useSizing = lastSizing || sizing
    const unscaledPanelVars = computeMediaPanelCssVars3d({ density, sizeScale: 1 }).vars
    const clamp = args.clampToViewport
      ? {
          left: viewportLeft,
          top: viewportTop,
          viewportW: vw,
          viewportH: vh,
          margin: Math.max(0, Number(args.clampToViewport.margin) || 0),
        }
      : undefined

    const prepared: Array<{
      id: string
      el: HTMLElement
      left: number
      top: number
      screenW: number
      screenH: number
      layoutW: number
      layoutH: number
      scale: number
    }> = []

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i]
      const id = String(it?.id || '').trim()
      if (!id) continue
      const el = args.getElementForId(id)
      if (!el) continue

      const sx = t.applyX(it.cx)
      const sy = t.applyY(it.cy)
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue

      const worldW = Number(it.w)
      const worldH = Number(it.h)
      const hasWorldSize = Number.isFinite(worldW) && worldW > 1 && Number.isFinite(worldH) && worldH > 1
      const layoutW = hasWorldSize ? Math.max(2, worldW) : useSizing.panelW
      const layoutH = hasWorldSize ? Math.max(2, worldH) : useSizing.panelH
      const scale = k
      const screenW = layoutW * scale
      const screenH = layoutH * scale
      const projected = computeVectorPaintedOverlayScreenBox({ centerWorld: { x: it.cx, y: it.cy },
        transform: t, width: layoutW, height: layoutH })
      const rect = clamp ? computePanelRect({ cx: sx, cy: sy, w: screenW, h: screenH, clamp }) : projected
      prepared.push({
        id,
        el,
        left: rect.left,
        top: rect.top,
        screenW,
        screenH,
        layoutW,
        layoutH,
        scale,
      })
    }

    if (prepared.length === 0) return

    const order = new Map([...prepared].sort((a, b) => compareCanvasSurfaceArea(
      { id: a.id, w: a.screenW, h: a.screenH }, { id: b.id, w: b.screenW, h: b.screenH },
    )).map((item, index) => [item.id, index + 1]))
    for (const item of prepared) {
      applyMediaPanelCssVars(item.el, unscaledPanelVars)
      applyPanelBox(item.el, { left: item.left, top: item.top, w: item.layoutW, h: item.layoutH,
        display: 'block', scale: item.scale, positionMode: 'matrix', zIndex: order.get(item.id) })
      if (item.el.dataset.kgOverlayHasPos !== '1') item.el.dataset.kgOverlayHasPos = '1'
    }
  }

  const flush = () => {
    if (rafOnce != null) cancelAnimationFrame(rafOnce)
    rafOnce = null
    update()
  }

  const schedule = () => {
    if (rafOnce != null) return
    rafOnce = requestAnimationFrame(() => {
      rafOnce = null
      update()
    })
  }

  const loop = () => {
    rafLoop = requestAnimationFrame(loop)
    update()
  }

  if (args.loop === 'always') rafLoop = requestAnimationFrame(loop)

  return {
    flush,
    schedule,
    stop: () => {
      if (rafOnce != null) cancelAnimationFrame(rafOnce)
      if (rafLoop != null) cancelAnimationFrame(rafLoop)
      rafOnce = null
      rafLoop = null
    },
  }
}
