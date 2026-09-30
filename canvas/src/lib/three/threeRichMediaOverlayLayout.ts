import { Vector3, type Camera, type WebGLRenderer } from 'three'
import type { GraphSchema } from '@/lib/graph/schema'
import { applyMediaPanelCssVars, applyPanelBox, computeMediaPanelCssVars3d, computePanelRect, computePanelSizeFromContent16x9 } from '@/lib/render/mediaPanelLayout'
import { compareCanvasSurfaceArea } from '@/lib/canvas/layerOrder2d'
import { applyMediaEagerLoadingOnce } from '@/lib/render/mediaEagerLoading'
import { normalizeRichMediaPanelDensity } from '@/lib/render/richMediaSsot'

type OverlayNodeLike = { id: string }

type LayoutCandidate = {
  id: string
  sx: number
  sy: number
  dist: number
  sizeScale: number
  order: number
}

type OverlayPanelLayout = {
  id: string
  el: HTMLElement
  rect: { left: number; top: number; w: number; h: number }
  width: number
  height: number
  scale: number
  cssVars: ReturnType<typeof computeMediaPanelCssVars3d>['vars']
  layer: number
}

export type ThreeMediaOverlayLayoutScratch = {
  world: Vector3
  v3: Vector3
  camSpace: Vector3
  candidates: LayoutCandidate[]
  selectedIds: Set<string>
  candidateById: Map<string, LayoutCandidate>
}

export const createThreeMediaOverlayLayoutScratch = (): ThreeMediaOverlayLayoutScratch => ({
  world: new Vector3(),
  v3: new Vector3(),
  camSpace: new Vector3(),
  candidates: [],
  selectedIds: new Set<string>(),
  candidateById: new Map<string, LayoutCandidate>(),
})

const finiteNumberOrNull = (value: unknown): number | null => {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? next : null
}

const assignOverlayZIndexes = (layouts: OverlayPanelLayout[]): Map<string, number> => {
  const ordered = [...layouts].sort((a, b) => a.layer - b.layer
    || compareCanvasSurfaceArea({ id: a.id, ...a.rect }, { id: b.id, ...b.rect }))
  return new Map(ordered.map((layout, index) => [layout.id, 2000 + index]))
}

const resolveViewportAnchorSlot = (args: {
  index: number
  total: number
  viewportW: number
  viewportH: number
  baseW: number
  margin: number
}): { sx: number; sy: number } => {
  const total = Math.max(1, Math.floor(args.total))
  const slotW = Math.max(1, args.baseW + args.margin * 2)
  const cols = Math.max(1, Math.min(total, Math.floor(Math.max(1, args.viewportW - args.margin * 2) / slotW) || 1))
  const rows = Math.max(1, Math.ceil(total / cols))
  const col = Math.max(0, Math.min(cols - 1, args.index % cols))
  const row = Math.max(0, Math.min(rows - 1, Math.floor(args.index / cols)))
  const usableW = Math.max(1, args.viewportW - args.margin * 2)
  const usableH = Math.max(1, args.viewportH - args.margin * 2)
  return {
    sx: args.margin + (usableW / cols) * (col + 0.5),
    sy: args.margin + (usableH / rows) * (row + 0.5),
  }
}

export function updateThreeMediaOverlayLayout(args: {
  camera: Camera | null
  gl: WebGLRenderer | null
  overlayNodesPool: ReadonlyArray<OverlayNodeLike>
  positions: Record<string, [number, number, number]>
  dragOverrides: Record<string, [number, number, number]>
  screenDragOverrides?: Record<string, { sx: number; sy: number }>
  overlayEls: Map<string, HTMLElement>
  prevVisibleIds: Set<string>
  effectiveSchema: GraphSchema
  scratch: ThreeMediaOverlayLayoutScratch
  getPanelSizeForId?: (id: string) => { w: number; h: number } | null
  getPanelPinnedForId?: (id: string) => boolean
  getPanelScreenAnchorForId?: (id: string) => { sx: number; sy: number } | null
  getPanelZIndexForId?: (id: string) => number
  selectedNodeId?: unknown
  selectedNodeIds?: unknown
  mediaPanelDensity?: unknown
  threeIframeOverlayMaxVisibleDefault?: unknown
  threeIframeOverlayMaxVisibleCompact?: unknown
  threeIframeOverlayMaxDistanceDefault?: unknown
  threeIframeOverlayMaxDistanceCompact?: unknown
  threeIframeOverlayBaseWidthRatioDefault?: unknown
  threeIframeOverlayBaseWidthRatioCompact?: unknown
  threeIframeOverlayBaseWidthMinPxDefault?: unknown
  threeIframeOverlayBaseWidthMinPxCompact?: unknown
  threeIframeOverlayBaseWidthMaxPxDefault?: unknown
  threeIframeOverlayBaseWidthMaxPxCompact?: unknown
  threeIframeOverlaySizeScaleFactor?: unknown
}): Set<string> {
  const { camera, gl, scratch } = args
  if (!camera || !gl) return args.prevVisibleIds
  const w = Math.max(1, gl.domElement.clientWidth || 1)
  const h = Math.max(1, gl.domElement.clientHeight || 1)
  const density = normalizeRichMediaPanelDensity(args.mediaPanelDensity)
  const maxCountRaw = density === 'compact' ? args.threeIframeOverlayMaxVisibleCompact : args.threeIframeOverlayMaxVisibleDefault
  const maxCountFinite = finiteNumberOrNull(maxCountRaw)
  const maxCount = maxCountFinite == null ? 0 : Math.max(0, Math.floor(maxCountFinite))
  const maxDistanceRaw = density === 'compact' ? args.threeIframeOverlayMaxDistanceCompact : args.threeIframeOverlayMaxDistanceDefault
  const maxDistanceFinite = finiteNumberOrNull(maxDistanceRaw)
  const maxDistance = maxDistanceFinite == null ? 0 : Math.max(0, maxDistanceFinite)
  const labelBackfaceCullingEnabled = args.effectiveSchema.three?.globeLabelBackfaceCulling !== false
  if (maxCount === 0 || maxDistance <= 0) {
    for (const id of args.prevVisibleIds) {
      const el = args.overlayEls.get(id)
      if (el) applyPanelBox(el, { left: -99999, top: -99999, w: 1, h: 1, display: 'none', zIndex: 1 })
    }
    return new Set<string>()
  }

  const widthRatioRaw = density === 'compact' ? args.threeIframeOverlayBaseWidthRatioCompact : args.threeIframeOverlayBaseWidthRatioDefault
  const widthRatioFinite = finiteNumberOrNull(widthRatioRaw)
  const widthRatio = widthRatioFinite == null ? 0.2 : Math.max(0.001, widthRatioFinite)
  const widthMinRaw = density === 'compact' ? args.threeIframeOverlayBaseWidthMinPxCompact : args.threeIframeOverlayBaseWidthMinPxDefault
  const widthMinFinite = finiteNumberOrNull(widthMinRaw)
  const widthMin = widthMinFinite == null ? 200 : Math.max(1, Math.floor(widthMinFinite))
  const widthMaxRaw = density === 'compact' ? args.threeIframeOverlayBaseWidthMaxPxCompact : args.threeIframeOverlayBaseWidthMaxPxDefault
  const widthMaxFinite = finiteNumberOrNull(widthMaxRaw)
  const widthMax = widthMaxFinite == null ? 360 : Math.max(1, Math.floor(widthMaxFinite))
  const baseW = Math.min(widthMax, Math.max(widthMin, w * widthRatio))
  const margin = 12
  const { world, v3, camSpace, candidates, selectedIds, candidateById } = scratch
  selectedIds.clear()
  const selOne = String(args.selectedNodeId || '').trim()
  if (selOne) selectedIds.add(selOne)
  if (Array.isArray(args.selectedNodeIds)) {
    for (let i = 0; i < args.selectedNodeIds.length; i += 1) {
      const id = String(args.selectedNodeIds[i] || '').trim()
      if (id) selectedIds.add(id)
    }
  }
  candidates.length = 0
  const projectedCandidateIds = new Set<string>()
  const addViewportCandidate = (node: OverlayNodeLike, slotIndex: number, slotTotal: number, anchorOverride?: { sx: number; sy: number } | null) => {
    if (projectedCandidateIds.has(node.id)) return
    const anchor = anchorOverride && Number.isFinite(anchorOverride.sx) && Number.isFinite(anchorOverride.sy)
      ? { sx: anchorOverride.sx, sy: anchorOverride.sy }
      : resolveViewportAnchorSlot({
          index: slotIndex,
          total: slotTotal,
          viewportW: w,
          viewportH: h,
          baseW,
          margin,
        })
    candidates.push({
      id: node.id,
      sx: anchor.sx,
      sy: anchor.sy,
      dist: maxDistance + 1 + Math.max(0, slotIndex),
      sizeScale: 1,
      order: slotIndex,
    })
    projectedCandidateIds.add(node.id)
  }
  for (let i = 0; i < args.overlayNodesPool.length; i += 1) {
    const node = args.overlayNodesPool[i]
    const pinned = typeof args.getPanelPinnedForId === 'function' ? args.getPanelPinnedForId(node.id) : true
    if (!pinned) {
      const screenOverride = args.screenDragOverrides?.[node.id] || null
      const screenAnchor = screenOverride || (typeof args.getPanelScreenAnchorForId === 'function' ? args.getPanelScreenAnchorForId(node.id) : null)
      addViewportCandidate(node, i, args.overlayNodesPool.length, screenAnchor)
      continue
    }
    const pos3 = args.dragOverrides[node.id] || args.positions[node.id] || null
    if (!pos3) {
      addViewportCandidate(node, i, args.overlayNodesPool.length)
      continue
    }
    world.set(pos3[0], pos3[1], pos3[2])
    const dist = camera.position.distanceTo(world)
    if (!Number.isFinite(dist) || dist > maxDistance) continue
    if (labelBackfaceCullingEnabled) {
      const cameraDot = world.dot(camera.position)
      if (!Number.isFinite(cameraDot) || cameraDot < 0) continue
    }
    camSpace.copy(world).applyMatrix4(camera.matrixWorldInverse)
    v3.copy(world).project(camera)
    if (![v3.x, v3.y, v3.z].every(Number.isFinite) || camSpace.z >= 0 || v3.z < -1 || v3.z > 1) continue
    const ndcX = v3.x
    const ndcY = v3.y
    const sx = (ndcX * 0.5 + 0.5) * w
    const sy = (-ndcY * 0.5 + 0.5) * h
    const sizeFactor =
      typeof args.threeIframeOverlaySizeScaleFactor === 'number' &&
      Number.isFinite(args.threeIframeOverlaySizeScaleFactor) &&
      args.threeIframeOverlaySizeScaleFactor > 0
        ? args.threeIframeOverlaySizeScaleFactor
        : 260
    const depth = camera.projectionMatrix.elements[15] === 0 ? -camSpace.z : 1
    const sizeScale = Math.max(0.001, Math.min(256, sizeFactor * Math.abs(camera.projectionMatrix.elements[5]!) / depth))
    candidates.push({ id: node.id, sx, sy, dist, sizeScale, order: i })
    projectedCandidateIds.add(node.id)
  }

  candidates.sort((a, b) => a.dist - b.dist || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const nextVisibleIds = new Set<string>()
  candidateById.clear()
  for (let i = 0; i < candidates.length; i += 1) candidateById.set(candidates[i]!.id, candidates[i]!)
  const tryAdd = (id: string) => {
    if (nextVisibleIds.size >= maxCount) return
    if (!args.overlayEls.has(id) || !candidateById.has(id)) return
    nextVisibleIds.add(id)
  }
  for (const id of selectedIds) tryAdd(id)
  for (const id of args.prevVisibleIds) tryAdd(id)
  for (let i = 0; i < candidates.length && nextVisibleIds.size < maxCount; i += 1) {
    const c = candidates[i]!
    if (args.overlayEls.has(c.id) && !nextVisibleIds.has(c.id)) nextVisibleIds.add(c.id)
  }
  for (const id of args.prevVisibleIds) {
    if (nextVisibleIds.has(id)) continue
    const el = args.overlayEls.get(id)
    if (!el) continue
    applyPanelBox(el, { left: -99999, top: -99999, w: 1, h: 1, display: 'none', zIndex: 1 })
  }
  const panelLayouts: OverlayPanelLayout[] = []
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i]!
    if (!nextVisibleIds.has(c.id)) continue
    const el = args.overlayEls.get(c.id)
    if (!el) continue
    applyMediaEagerLoadingOnce(el)
    const overrideSize = typeof args.getPanelSizeForId === 'function' ? args.getPanelSizeForId(c.id) : null
    const computed = computeMediaPanelCssVars3d({ density, sizeScale: 1 })
    const fallback = computePanelSizeFromContent16x9({ contentW: baseW, metrics: computed.metrics })
    const panel = overrideSize && Number.isFinite(overrideSize.w) && Number.isFinite(overrideSize.h)
      && overrideSize.w > 1 && overrideSize.h > 1
      ? { panelW: overrideSize.w, panelH: overrideSize.h }
      : fallback
    const rect = computePanelRect({ cx: c.sx, cy: c.sy, w: panel.panelW * c.sizeScale, h: panel.panelH * c.sizeScale })
    panelLayouts.push({
      id: c.id,
      el,
      rect,
      width: panel.panelW,
      height: panel.panelH,
      scale: c.sizeScale,
      cssVars: computed.vars,
      layer: finiteNumberOrNull(args.getPanelZIndexForId?.(c.id)) ?? 0,
    })
  }
  const zById = assignOverlayZIndexes(panelLayouts)
  for (let i = 0; i < panelLayouts.length; i += 1) {
    const layout = panelLayouts[i]!
    applyMediaPanelCssVars(layout.el, layout.cssVars)
    applyPanelBox(layout.el, {
      left: layout.rect.left,
      top: layout.rect.top,
      w: layout.width,
      h: layout.height,
      scale: layout.scale,
      zIndex: zById.get(layout.id) || 2000,
      display: 'flex',
      positionMode: 'matrix',
    })
    try {
      const opacity = '1'
      if (layout.el.style.opacity !== opacity) layout.el.style.opacity = opacity
    } catch {
      void 0
    }
  }
  return nextVisibleIds
}
