import type * as d3 from 'd3'

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
  collectiveFitToViewport?: boolean
  clampToViewport?: { margin: number } | null
}): MarkdownOverlayPanelLoop {
  if (!args.enabled) return { schedule: () => void 0, stop: () => void 0 }

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
      zoomK: k,
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
      hasWorldSize: boolean
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
      const scale = hasWorldSize ? k : 1
      const screenW = layoutW * scale
      const screenH = layoutH * scale
      const rect = computePanelRect({
        cx: sx,
        cy: sy,
        w: screenW,
        h: screenH,
        clamp: args.collectiveFitToViewport === true ? undefined : clamp,
      })
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
        hasWorldSize,
      })
    }

    if (prepared.length === 0) return

    const collectiveFit = (() => {
      if (args.collectiveFitToViewport !== true || !clamp || prepared.length <= 1) return null
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (let i = 0; i < prepared.length; i += 1) {
        const item = prepared[i]!
        minX = Math.min(minX, item.left)
        minY = Math.min(minY, item.top)
        maxX = Math.max(maxX, item.left + item.screenW)
        maxY = Math.max(maxY, item.top + item.screenH)
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
      const boundsW = Math.max(1, maxX - minX)
      const boundsH = Math.max(1, maxY - minY)
      const margin = Math.max(0, Number(args.clampToViewport?.margin) || 0)
      const targetW = Math.max(1, vw - margin * 2)
      const targetH = Math.max(1, vh - margin * 2)
      const fitScale = Math.min(1, targetW / boundsW, targetH / boundsH)
      const sourceCenterX = minX + boundsW / 2
      const sourceCenterY = minY + boundsH / 2
      const targetCenterX = viewportLeft + vw / 2
      const targetCenterY = viewportTop + vh / 2
      return { fitScale, sourceCenterX, sourceCenterY, targetCenterX, targetCenterY }
    })()

    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i]!
      const rect = (() => {
        if (!collectiveFit) return { left: item.left, top: item.top, w: item.screenW, h: item.screenH }
        const cx = item.left + item.screenW / 2
        const cy = item.top + item.screenH / 2
        return computePanelRect({
          cx: collectiveFit.targetCenterX + (cx - collectiveFit.sourceCenterX) * collectiveFit.fitScale,
          cy: collectiveFit.targetCenterY + (cy - collectiveFit.sourceCenterY) * collectiveFit.fitScale,
          w: item.screenW,
          h: item.screenH,
          clamp,
        })
      })()
      applyMediaPanelCssVars(item.el, item.hasWorldSize ? unscaledPanelVars : useSizing.vars)
      applyPanelBox(item.el, { left: rect.left, top: rect.top, w: item.layoutW, h: item.layoutH, display: 'block', scale: item.scale })
      try {
        ;(item.el as unknown as { dataset?: Record<string, string> }).dataset!.kgOverlayHasPos = '1'
      } catch {
        void 0
      }
    }
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
    schedule,
    stop: () => {
      if (rafOnce != null) cancelAnimationFrame(rafOnce)
      if (rafLoop != null) cancelAnimationFrame(rafLoop)
      rafOnce = null
      rafLoop = null
    },
  }
}
