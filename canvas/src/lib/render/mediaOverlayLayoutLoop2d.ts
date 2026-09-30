import type * as d3 from 'd3'
import type { MediaPanelDensity } from '@/lib/render/mediaPanelSpec'
import type { GraphSchema } from '@/lib/graph/schema'
import { applyMediaPanelCssVars, applyPanelBox, computeMediaPanelCssVars3d, computePanelRect } from '@/lib/render/mediaPanelLayout'
import { applyMediaEagerLoadingOnce } from '@/lib/render/mediaEagerLoading'
import { computeMediaOverlaySizing, type MediaOverlaySizingConfig, type MediaOverlaySizing } from '@/lib/render/mediaOverlaySizing'
import { relaxOverlayPanelsWithCollision } from '@/lib/ui/relaxOverlayPanelsWithCollision'
import { computeOverlayMaxAnchorShiftPx } from '@/lib/ui/overlayAnchorShift'
import {
  computeBalancedSpreadLayout,
  computeBalancedSpreadSpacingPx,
  computeBalancedSpreadViewportMargins,
  isHorizontalOverlayStrip,
  isVerticalOverlayCluster,
} from '@/lib/ui/overlayBalancedSpread'
import { projectCollectiveScreenLayoutForZoom } from '@/lib/canvas/overlayWidgetZoom'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import { resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
export type MediaOverlayLayoutItem = { id: string }

export type MediaOverlayLayoutLoop = {
  flush: () => void
  schedule: () => void
  stop: () => void
}

export type MediaOverlayLayoutViewport = {
  left?: number
  top?: number
  width: number
  height: number
}

export function initializeMediaOverlayShell(element: HTMLElement, _left: number, _top: number): void {
  if (element.dataset.kgOverlayHasPos === '1') return
  element.style.display = 'none'
  element.style.transform = 'none'
  ;(element.style as CSSStyleDeclaration & { zoom: string }).zoom = '1'
  element.style.width = '1px'
  element.style.height = '1px'
}

function resolveMediaOverlayLayoutViewport(args: {
  viewportW: number
  viewportH: number
  readLayoutViewport?: (() => MediaOverlayLayoutViewport | null) | null
}): Required<MediaOverlayLayoutViewport> {
  const raw = typeof args.readLayoutViewport === 'function' ? args.readLayoutViewport() : null
  const width = Number.isFinite(raw?.width) && Number(raw?.width) > 0
    ? Number(raw?.width)
    : Math.max(1, Number(args.viewportW) || 1)
  const height = Number.isFinite(raw?.height) && Number(raw?.height) > 0
    ? Number(raw?.height)
    : Math.max(1, Number(args.viewportH) || 1)
  return {
    left: Number.isFinite(raw?.left) ? Number(raw?.left) : 0,
    top: Number.isFinite(raw?.top) ? Number(raw?.top) : 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
  }
}

export function startMediaOverlayLayoutLoop2d(args: {
  enabled: boolean
  loop: 'always' | 'onDemand'
  items: readonly MediaOverlayLayoutItem[]
  manualPlacement?: boolean
  anchorToNode?: boolean
  density: MediaPanelDensity
  viewportW: number
  viewportH: number
  readLayoutViewport?: (() => MediaOverlayLayoutViewport | null) | null
  schema?: GraphSchema | null
  collision?: {
    enabled?: boolean
    gapPx?: number
    strength?: number
    iterations?: number
    steps?: number
    anchorStrength?: number
    maxAnchorShiftPx?: number
    maxSpeedPxPerStep?: number
  } | null
  readTransform: () => d3.ZoomTransform | null
  computeSizingZoomK?: (zoomK: number) => number
  aspectRatioMode?: unknown
  panelDisplay?: 'block' | 'flex'
  scaleLayoutOnZoom?: boolean
  projectWithWorldTransformScale?: boolean
  getPanelSizeForId?: (id: string) => { w: number; h: number } | null
  getElementForId: (id: string) => HTMLElement | null
  getScreenAnchorForId?: (id: string) => { clientX: number; clientY: number } | null
  getNodeWorldCenterForId: (id: string) => { x: number; y: number } | null
  getNodeWorldTopLeftForId?: (id: string) => { x: number; y: number } | null
  onResolvedWorldTopLeftForId?: (id: string, point: { x: number; y: number }) => void
  getCollisionObstacles?: () => Array<{ id: string; left: number; top: number; width: number; height: number }>
  sizingConfig: MediaOverlaySizingConfig
  clampToViewport?: { margin: number; marginLeft?: number; marginRight?: number; marginTop?: number; marginBottom?: number } | null
}): MediaOverlayLayoutLoop {
  if (!args.enabled || args.items.length === 0) {
    return { flush: () => void 0, schedule: () => void 0, stop: () => void 0 }
  }

  let rafOnce: number | null = null
  let rafLoop: number | null = null
  let lastSizingKey = ''
  let lastSizing: MediaOverlaySizing | null = null
  let lastTransform: { k: number; x: number; y: number } | null = null
  let collectiveCenterWarmupStartedAtMs: number | null = null
  let collectiveCenterWarmupAttempts = 0
  const lastWorldCenterById = new Map<string, { x: number; y: number }>()
  const lastAppliedBoxById = new Map<string, { left: number; top: number; w: number; h: number; scale?: number }>()
  const zoomLayoutBaseBoxById = new Map<string, { left: number; top: number; w: number; h: number; scale: number; layoutScale: number }>()
  let scheduleCollectiveLayoutUpdate: () => void = () => void 0

  const quantizePanelPos = (v: number) => {
    if (!Number.isFinite(v)) return 0
    return args.anchorToNode ? v : Math.round(v)
  }

  const update = () => {
    const t = args.readTransform()
    if (!t) return
    const rawK = typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : 1
    const rawX = typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 0
    const rawY = typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 0
    const previousTransform = lastTransform
    const scaleChanged = !!previousTransform && Math.abs(previousTransform.k - rawK) > 1e-6
    lastTransform = { k: rawK, x: rawX, y: rawY }
    const k = typeof args.computeSizingZoomK === 'function' ? args.computeSizingZoomK(rawK) : rawK
    const layoutViewport = resolveMediaOverlayLayoutViewport({
      viewportW: args.viewportW,
      viewportH: args.viewportH,
      readLayoutViewport: args.readLayoutViewport,
    })

    const density = args.density === 'compact' ? 'compact' : 'default'
    const sizing = computeMediaOverlaySizing({
      density,
      viewportW: layoutViewport.width,
      viewportH: layoutViewport.height,
      zoomK: k,
      itemCount: args.items.length,
      config: args.sizingConfig,
    })
    if (sizing.key !== lastSizingKey) {
      lastSizingKey = sizing.key
      lastSizing = sizing
    }
    const useSizing = lastSizing || sizing
    const frameCssVars = args.projectWithWorldTransformScale === true
      ? computeMediaPanelCssVars3d({ density, sizeScale: 1 }).vars
      : useSizing.vars
    const viewportClampEnabled = !!args.clampToViewport
    const clampMargin = args.clampToViewport ? Math.max(0, Number(args.clampToViewport.margin) || 0) : 0
    const clampMarginLeft = args.clampToViewport && Number.isFinite(args.clampToViewport.marginLeft)
      ? Math.max(0, Number(args.clampToViewport.marginLeft))
      : clampMargin
    const clampMarginRight = args.clampToViewport && Number.isFinite(args.clampToViewport.marginRight)
      ? Math.max(0, Number(args.clampToViewport.marginRight))
      : clampMargin
    const clampMarginTop = args.clampToViewport && Number.isFinite(args.clampToViewport.marginTop)
      ? Math.max(0, Number(args.clampToViewport.marginTop))
      : clampMargin
    const clampMarginBottom = args.clampToViewport && Number.isFinite(args.clampToViewport.marginBottom)
      ? Math.max(0, Number(args.clampToViewport.marginBottom))
      : clampMargin
    const clampMargins = {
      left: clampMarginLeft,
      right: clampMarginRight,
      top: clampMarginTop,
      bottom: clampMarginBottom,
    }
    const spreadMargins = computeBalancedSpreadViewportMargins({
      viewportW: layoutViewport.width,
      viewportH: layoutViewport.height,
      preset: 'richMedia',
      minLeftPx: clampMarginLeft,
      minRightPx: clampMarginRight,
      minTopPx: clampMarginTop,
      minBottomPx: clampMarginBottom,
    })
    const clamp = args.clampToViewport
      ? {
          left: layoutViewport.left,
          top: layoutViewport.top,
          viewportW: layoutViewport.width,
          viewportH: layoutViewport.height,
          margin: 0,
          marginLeft: clampMargins.left,
          marginRight: clampMargins.right,
          marginTop: clampMargins.top,
          marginBottom: clampMargins.bottom,
        }
      : undefined

    const keepIds = new Set<string>()
    const missingCenterIds: string[] = []

    const preferred: Array<{ id: string; left: number; top: number; w: number; h: number; scale?: number; el: HTMLElement; preserveWorldTopLeft?: boolean }> = []
    const manualPlacement = args.manualPlacement === true
    let fallbackPreferredCount = 0

    for (let i = 0; i < args.items.length; i += 1) {
      const id = String(args.items[i]?.id || '').trim()
      if (!id) continue
      keepIds.add(id)
      const el = args.getElementForId(id)
      if (!el) continue
      const overrideSize = typeof args.getPanelSizeForId === 'function' ? args.getPanelSizeForId(id) : null
      const w = overrideSize && Number.isFinite(overrideSize.w) ? Math.max(1, overrideSize.w) : useSizing.panelW
      const fallbackSize = overrideSize ? null : resolveCanvasAspectRatioSize({ defaultWidth: useSizing.panelW, mode: args.aspectRatioMode, width: useSizing.panelW })
      const h = overrideSize && Number.isFinite(overrideSize.h) ? Math.max(1, overrideSize.h) : Math.max(1, fallbackSize?.height || useSizing.panelH)

      const topLeftNow = args.getNodeWorldTopLeftForId?.(id) || null
      const centerNow = topLeftNow
        ? { x: topLeftNow.x + w / 2, y: topLeftNow.y + h / 2 }
        : args.getNodeWorldCenterForId(id)
      if (centerNow && Number.isFinite(centerNow.x) && Number.isFinite(centerNow.y)) {
        lastWorldCenterById.set(id, centerNow)
      }
      const center = centerNow || lastWorldCenterById.get(id) || null
      if (!center) {
        missingCenterIds.push(id)
        if (manualPlacement && viewportClampEnabled && args.items.length > 1) {
          preferred.push({ id, left: layoutViewport.left, top: layoutViewport.top, w, h, scale: 1, el, preserveWorldTopLeft: false })
          fallbackPreferredCount += 1
        }
        continue
      }
      const cx = t.applyX(center.x)
      const cy = t.applyY(center.y)
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue

      const previousBox = lastAppliedBoxById.get(id) || null
      const projectedZoomBox = scaleChanged && args.scaleLayoutOnZoom === true && previousBox
        ? (() => {
            const existingBase = zoomLayoutBaseBoxById.get(id) || null
            const base = existingBase || {
              left: previousBox.left,
              top: previousBox.top,
              w: previousBox.w,
              h: previousBox.h,
              scale: 1,
              layoutScale: 1,
            }
            if (!existingBase) zoomLayoutBaseBoxById.set(id, base)
            const panelLayoutScale = w / Math.max(1, base.w)
            return projectCollectiveScreenLayoutForZoom({
              base: { left: base.left, top: base.top, scale: base.scale },
              scale: w / Math.max(1, base.w),
              baseLayoutScale: base.layoutScale,
              layoutScale: panelLayoutScale,
              anchorX: layoutViewport.left + layoutViewport.width / 2,
              anchorY: layoutViewport.top + layoutViewport.height / 2,
              baseWidth: base.w,
              baseHeight: base.h,
            })
          })()
        : null
      const projectedWorldBox = args.projectWithWorldTransformScale === true
        ? {
            left: cx - (w * k) / 2,
            top: cy - (h * k) / 2,
            scale: k,
          }
        : null
      const screenAnchor = args.getScreenAnchorForId?.(id) || null
      const anchoredWorldBox = screenAnchor && Number.isFinite(screenAnchor.clientX) && Number.isFinite(screenAnchor.clientY)
        ? {
            left: Number(screenAnchor.clientX) - (w * k) / 2,
            top: Number(screenAnchor.clientY) - (h * k) / 2,
            scale: k,
          }
        : null
      if (anchoredWorldBox && rawK > 0) {
        const worldTopLeft = {
          x: (Number(screenAnchor?.clientX) - t.x) / rawK - w / 2,
          y: (Number(screenAnchor?.clientY) - t.y) / rawK - h / 2,
        }
        if (Number.isFinite(worldTopLeft.x) && Number.isFinite(worldTopLeft.y)) {
          args.onResolvedWorldTopLeftForId?.(id, worldTopLeft)
        }
      }
      const preferredCenter = anchoredWorldBox
        ? { cx: anchoredWorldBox.left + (w * anchoredWorldBox.scale) / 2, cy: anchoredWorldBox.top + (h * anchoredWorldBox.scale) / 2 }
        : projectedWorldBox
        ? { cx: projectedWorldBox.left + (w * projectedWorldBox.scale) / 2, cy: projectedWorldBox.top + (h * projectedWorldBox.scale) / 2 }
        : projectedZoomBox
        ? { cx: projectedZoomBox.left + w / 2, cy: projectedZoomBox.top + h / 2 }
        : scaleChanged && previousBox && !args.anchorToNode
          ? {
              cx: previousBox.left + previousBox.w / 2,
              cy: previousBox.top + previousBox.h / 2,
            }
          : { cx, cy }
      const rect = computePanelRect({ cx: preferredCenter.cx, cy: preferredCenter.cy, w, h, clamp })
      preferred.push({
        id,
        left: anchoredWorldBox ? quantizePanelPos(anchoredWorldBox.left) : projectedWorldBox ? quantizePanelPos(projectedWorldBox.left) : quantizePanelPos(rect.left),
        top: anchoredWorldBox ? quantizePanelPos(anchoredWorldBox.top) : projectedWorldBox ? quantizePanelPos(projectedWorldBox.top) : quantizePanelPos(rect.top),
        w,
        h,
        scale: anchoredWorldBox ? anchoredWorldBox.scale : projectedWorldBox ? projectedWorldBox.scale : 1,
        el,
        preserveWorldTopLeft: args.anchorToNode || !!anchoredWorldBox || (!!projectedWorldBox && !!topLeftNow),
      })
    }

    const canDeferUntilCollectiveCentersStabilize =
      args.items.length > 1
      && missingCenterIds.length > 0
      && preferred.length > 0
      && fallbackPreferredCount < preferred.length
      && !(manualPlacement && viewportClampEnabled && fallbackPreferredCount > 0)
    if (canDeferUntilCollectiveCentersStabilize) {
      collectiveCenterWarmupAttempts += 1
      if (collectiveCenterWarmupStartedAtMs == null) collectiveCenterWarmupStartedAtMs = Date.now()
      const elapsed = Date.now() - (collectiveCenterWarmupStartedAtMs || Date.now())
      if (collectiveCenterWarmupAttempts < 60 && elapsed < 1600) {
        scheduleCollectiveLayoutUpdate()
        return
      }
    } else {
      collectiveCenterWarmupStartedAtMs = null
      collectiveCenterWarmupAttempts = 0
    }

    const hasOverlaps = (items: Array<{ left: number; top: number; w: number; h: number }>, gapPx: number): boolean => {
      const gap = Number.isFinite(gapPx) ? Math.max(0, gapPx) : 0
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i]
        if (!a) continue
        const ax2 = a.left + a.w + gap
        const ay2 = a.top + a.h + gap
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j]
          if (!b) continue
          const bx2 = b.left + b.w + gap
          const by2 = b.top + b.h + gap
          if (a.left < bx2 && b.left < ax2 && a.top < by2 && b.top < ay2) return true
        }
      }
      return false
    }

    const clampWithMargin = (pos: { left: number; top: number }, size: { w: number; h: number }) => {
      if (!viewportClampEnabled) return pos
      const w = Math.max(1, Number(size.w) || 1)
      const h = Math.max(1, Number(size.h) || 1)
      const leftMin = layoutViewport.left + clampMargins.left
      const leftMax = Math.max(leftMin, layoutViewport.left + layoutViewport.width - clampMargins.right - w)
      const topMin = layoutViewport.top + clampMargins.top
      const topMax = Math.max(topMin, layoutViewport.top + layoutViewport.height - clampMargins.bottom - h)
      const left = Math.max(leftMin, Math.min(leftMax, pos.left))
      const top = Math.max(topMin, Math.min(topMax, pos.top))
      return { left, top }
    }

    const collisionEnabled = args.collision?.enabled !== false
    const schema = args.schema || null
    const snapGrid = readSnapGridConfigFromSchema(schema)
    const snapPanelTopLeftToGrid = (pos: { left: number; top: number }) => {
      if (!snapGrid.enabled) return pos
      const worldTopLeft = {
        x: t.invertX(pos.left),
        y: t.invertY(pos.top),
      }
      const snappedWorldTopLeft = snapPointToGrid(worldTopLeft, snapGrid)
      return {
        left: t.applyX(snappedWorldTopLeft.x),
        top: t.applyY(snappedWorldTopLeft.y),
      }
    }
    const preferredById = new Map<string, { id: string; left: number; top: number; w: number; h: number; scale?: number; el: HTMLElement; preserveWorldTopLeft?: boolean }>()
    for (let i = 0; i < preferred.length; i += 1) {
      const p = preferred[i]!
      preferredById.set(p.id, p)
    }

    const nextById = new Map<string, { left: number; top: number }>()
    if (preferred.length > 0) {
      for (let i = 0; i < preferred.length; i += 1) {
        const p = preferred[i]!
        nextById.set(p.id, { left: p.left, top: p.top })
      }
    }

    const collisionPreferred = preferred.filter(item => !item.preserveWorldTopLeft)
    if (collisionEnabled && schema && collisionPreferred.length > 1) {
      const derivedGap = Math.max(
        0,
        Math.round(
          computeBalancedSpreadSpacingPx({
            baseGapPx: Math.max(6, useSizing.metrics.padding + useSizing.metrics.borderW),
            zoomK: rawK,
            count: collisionPreferred.length,
          }),
        ),
      )
      const gapPx = typeof args.collision?.gapPx === 'number' && Number.isFinite(args.collision.gapPx) ? Math.max(0, Math.floor(args.collision.gapPx)) : derivedGap
      const externalObstacles = [
        ...(typeof args.getCollisionObstacles === 'function' ? args.getCollisionObstacles() : []),
        ...preferred
          .filter(item => item.preserveWorldTopLeft)
          .map(item => ({ id: item.id, left: item.left, top: item.top, width: item.w, height: item.h })),
      ]
      const boxes = collisionPreferred.map(p => ({ left: p.left, top: p.top, w: p.w, h: p.h }))
      const clusterItems = collisionPreferred.map(p => ({ left: p.left, top: p.top, width: p.w, height: p.h }))
      const hasVerticalCluster = isVerticalOverlayCluster({ items: clusterItems, gapPx })
      const hasHorizontalStrip = isHorizontalOverlayStrip({ items: clusterItems, gapPx })
      const hasOverlappingBoxes = hasOverlaps(boxes, gapPx)
      const shouldReseedBalancedCluster = viewportClampEnabled && (
        hasVerticalCluster
        || hasHorizontalStrip
        || (manualPlacement && hasOverlappingBoxes)
      )
      const needsBalancedReseed = hasOverlappingBoxes || shouldReseedBalancedCluster
      if (needsBalancedReseed) {
        const verticalSeed = (() => {
          if (!shouldReseedBalancedCluster) {
            return null
          }
          let sumW = 0
          let sumH = 0
          for (let i = 0; i < collisionPreferred.length; i += 1) {
            const p = collisionPreferred[i]!
            sumW += p.w
            sumH += p.h
          }
          const avgW = Math.max(1, sumW / Math.max(1, collisionPreferred.length))
          const avgH = Math.max(1, sumH / Math.max(1, collisionPreferred.length))
          const layout = computeBalancedSpreadLayout({
            count: collisionPreferred.length,
            viewportW: layoutViewport.width,
            viewportH: layoutViewport.height,
            cellW: Math.max(1, avgW + gapPx),
            cellH: Math.max(1, avgH + gapPx),
            gapPx,
            zoomK: rawK,
            marginLeftPx: spreadMargins.left,
            marginRightPx: spreadMargins.right,
            marginTopPx: spreadMargins.top,
            marginBottomPx: spreadMargins.bottom,
            snapPx: 1,
          })
          const ordered = [...collisionPreferred].sort((a, b) => a.id.localeCompare(b.id))
          return ordered.map((item, index) => {
            const cell = layout.cells[index]
            return cell
              ? { id: item.id, left: layoutViewport.left + cell.left, top: layoutViewport.top + cell.top, w: item.w, h: item.h }
              : { id: item.id, left: item.left, top: item.top, w: item.w, h: item.h }
          })
        })()
        const seedItems = verticalSeed || collisionPreferred.map(p => ({ id: p.id, left: p.left, top: p.top, w: p.w, h: p.h }))
        const strength = typeof args.collision?.strength === 'number' && Number.isFinite(args.collision.strength) ? Math.max(0, args.collision.strength) : 0.82
        const iterations = typeof args.collision?.iterations === 'number' && Number.isFinite(args.collision.iterations) ? Math.max(1, Math.floor(args.collision.iterations)) : 10
        const steps = typeof args.collision?.steps === 'number' && Number.isFinite(args.collision.steps) ? Math.max(1, Math.floor(args.collision.steps)) : 12
        const anchorStrength = (() => {
          if (typeof args.collision?.anchorStrength === 'number' && Number.isFinite(args.collision.anchorStrength)) {
            return Math.max(0, args.collision.anchorStrength)
          }
          return manualPlacement ? 0.12 : 0.075
        })()
        const maxAnchorShiftPx = (() => {
          if (typeof args.collision?.maxAnchorShiftPx === 'number' && Number.isFinite(args.collision.maxAnchorShiftPx)) {
            return Math.max(40, args.collision.maxAnchorShiftPx)
          }
          const fallback = computeOverlayMaxAnchorShiftPx(layoutViewport.width, layoutViewport.height)
          if (!manualPlacement) return fallback
          const manualCap = Math.max(80, Math.round(Math.min(layoutViewport.width, layoutViewport.height) * 0.22))
          return Math.min(fallback, manualCap)
        })()
        const maxSpeedPxPerStep =
          typeof args.collision?.maxSpeedPxPerStep === 'number' && Number.isFinite(args.collision.maxSpeedPxPerStep)
            ? Math.max(0, args.collision.maxSpeedPxPerStep)
            : 200
        const resolved = relaxOverlayPanelsWithCollision({
          schema,
          items: seedItems.map(p => ({ id: p.id, left: p.left, top: p.top, width: p.w, height: p.h, movable: true })),
          obstacles: externalObstacles,
          gapPx,
          strength,
          iterations,
          steps,
          anchorStrength,
          maxAnchorShiftPx,
          maxSpeedPxPerStep,
        })
        for (let i = 0; i < resolved.length; i += 1) {
          const r = resolved[i]!
          const src = preferredById.get(r.id) || null
          if (!src) continue
          const clamped = clampWithMargin({ left: r.left, top: r.top }, { w: src.w, h: src.h })
          nextById.set(r.id, { left: quantizePanelPos(clamped.left), top: quantizePanelPos(clamped.top) })
        }
      }
    }

    for (let i = 0; i < preferred.length; i += 1) {
      const p = preferred[i]!
      const pos = nextById.get(p.id) || { left: p.left, top: p.top }
      applyMediaPanelCssVars(p.el, frameCssVars)
      applyMediaEagerLoadingOnce(p.el)
      const snappedPos = p.preserveWorldTopLeft ? pos : snapPanelTopLeftToGrid(pos)
      const nextBox = { left: quantizePanelPos(snappedPos.left), top: quantizePanelPos(snappedPos.top), w: p.w, h: p.h, scale: Math.max(0.001, Number(p.scale) || 1) }
      const prevBox = lastAppliedBoxById.get(p.id) || null
      const boxChanged = !prevBox
        || Math.abs(prevBox.left - nextBox.left) >= (args.anchorToNode ? 0.001 : 1)
        || Math.abs(prevBox.top - nextBox.top) >= (args.anchorToNode ? 0.001 : 1)
        || Math.abs(prevBox.w - nextBox.w) >= 0.5
        || Math.abs(prevBox.h - nextBox.h) >= 0.5
        || Math.abs((prevBox.scale || 1) - nextBox.scale) >= 0.001
      if (boxChanged) {
        applyPanelBox(p.el, { left: nextBox.left, top: nextBox.top, w: nextBox.w, h: nextBox.h, display: args.panelDisplay || 'block', scale: nextBox.scale, positionMode: args.anchorToNode ? 'matrix' : undefined })
        lastAppliedBoxById.set(p.id, nextBox)
      }
      if (args.scaleLayoutOnZoom === true && !scaleChanged) {
        zoomLayoutBaseBoxById.set(p.id, {
          left: nextBox.left,
          top: nextBox.top,
          w: nextBox.w,
          h: nextBox.h,
          scale: 1,
          layoutScale: 1,
        })
      }
      try {
        if (p.el.dataset.kgOverlayHasPos !== '1') p.el.dataset.kgOverlayHasPos = '1'
      } catch {
        void 0
      }
    }

    for (const id of Array.from(lastWorldCenterById.keys())) {
      if (!keepIds.has(id)) lastWorldCenterById.delete(id)
    }
    for (const id of Array.from(lastAppliedBoxById.keys())) {
      if (!keepIds.has(id)) lastAppliedBoxById.delete(id)
    }
    for (const id of Array.from(zoomLayoutBaseBoxById.keys())) {
      if (!keepIds.has(id)) zoomLayoutBaseBoxById.delete(id)
    }
  }

  const schedule = () => {
    if (rafOnce != null) return
    rafOnce = requestAnimationFrame(() => {
      rafOnce = null
      update()
    })
  }
  const flush = () => {
    if (rafOnce != null) cancelAnimationFrame(rafOnce)
    rafOnce = null
    update()
  }
  scheduleCollectiveLayoutUpdate = schedule

  const loop = () => {
    rafLoop = requestAnimationFrame(loop)
    update()
  }

  if (args.loop === 'always') {
    rafLoop = requestAnimationFrame(loop)
  }

  return {
    flush,
    schedule,
    stop: () => {
      if (rafOnce != null) {
        try {
          cancelAnimationFrame(rafOnce)
        } catch {
          void 0
        }
      }
      if (rafLoop != null) {
        try {
          cancelAnimationFrame(rafLoop)
        } catch {
          void 0
        }
      }
      rafOnce = null
      rafLoop = null
    },
  }
}
