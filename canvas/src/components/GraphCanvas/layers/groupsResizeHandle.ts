import * as d3 from 'd3'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { computeGroupResizeBottomRight, computeMinGroupResizeSize } from '@/lib/canvas/groupResizeMath2d'
import { applyGroupResizeDragSensitivity } from '@/lib/canvas/groupResizeHandleConfig'

export const bindGroupsResizeHandle = <T extends GraphGroup>(args: {
  resizeHandleHitSel: d3.Selection<SVGCircleElement, T, SVGGElement, unknown> | null
  allowResize: boolean
  minBoundsSizePx?: number
  dragSensitivity?: number
  dragDeadzonePx?: number
  snapGrid?: { enabled: boolean; size: number } | null
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void
  selectGroup: (id: string | null) => void
  readExplicitBounds: (d: T) => GraphGroup['bounds'] | null
  computeBoundsAndLabel: (d: T) => { x: number; y: number; w: number; h: number }
  applyComputedToGroup: (d: T, computed: any, selectedGroupId: string, activeResizeGroupId: string) => void
  commitBounds: (id: string, bounds: { x: number; y: number; width: number; height: number; labelX?: number; labelY?: number }) => void
  onResizeActiveGroupIdChange?: (id: string | null) => void
}) => {
  const { resizeHandleHitSel } = args
  if (!resizeHandleHitSel || !args.allowResize) return
  const minBoundsSizePx = typeof args.minBoundsSizePx === 'number' && Number.isFinite(args.minBoundsSizePx) ? Math.max(1, args.minBoundsSizePx) : 24
  const dragSensitivity = typeof args.dragSensitivity === 'number' && Number.isFinite(args.dragSensitivity) ? Math.max(0.35, Math.min(1, args.dragSensitivity)) : 0.72
  const dragDeadzonePx = typeof args.dragDeadzonePx === 'number' && Number.isFinite(args.dragDeadzonePx) ? Math.max(0, Math.min(24, args.dragDeadzonePx)) : 3

  let active: T | null = null
  let start: { x: number; y: number; w: number; h: number; labelX?: number; labelY?: number } | null = null
  let startWorld: { x: number; y: number } | null = null
  let minSize: { w: number; h: number } | null = null

  const readWorldPoint = (event: unknown): { x: number; y: number } | null => {
    const src = (event as any)?.sourceEvent as { target?: unknown; clientX?: unknown; clientY?: unknown } | undefined
    const clientX = typeof src?.clientX === 'number' ? src.clientX : Number.NaN
    const clientY = typeof src?.clientY === 'number' ? src.clientY : Number.NaN
    const target = (src?.target || null) as SVGElement | null
    const svgEl = (target?.ownerSVGElement || null) as SVGSVGElement | null
    if (!svgEl || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
    const rect = svgEl.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    const t0 = d3.zoomTransform(svgEl)
    const k = typeof t0.k === 'number' && Number.isFinite(t0.k) && t0.k > 0 ? t0.k : 1
    const wx = (sx - t0.x) / k
    const wy = (sy - t0.y) / k
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null
    return { x: wx, y: wy }
  }

  const dragResize = d3
    .drag<SVGCircleElement, T>()
    .on('start', (event, d) => {
      if (d.autoBounds === true) return
      const srcEv = (event as unknown as { sourceEvent?: { stopPropagation?: () => void; preventDefault?: () => void } }).sourceEvent
      if (srcEv && typeof srcEv.stopPropagation === 'function') srcEv.stopPropagation()
      if (srcEv && typeof srcEv.preventDefault === 'function') srcEv.preventDefault()
      args.setSelectionSource('canvas')
      args.selectGroup(d.id)

      const explicit0 = args.readExplicitBounds(d)
      const fallback = args.computeBoundsAndLabel(d)
      const explicit: GraphGroup['bounds'] | null =
        explicit0 ||
        (fallback.w > 0 && fallback.h > 0
          ? { x: fallback.x, y: fallback.y, width: fallback.w, height: fallback.h }
          : null)
      if (!explicit) { active = null; start = null; startWorld = null; return }
      startWorld = readWorldPoint(event)
      active = d
      start = { x: explicit.x, y: explicit.y, w: explicit.width, h: explicit.height, labelX: explicit.labelX, labelY: explicit.labelY }
      ;(d as unknown as { bounds?: unknown }).bounds = { ...(explicit as any) } as any
      try {
        args.onResizeActiveGroupIdChange?.(String(d.id || '').trim() || null)
      } catch {
        void 0
      }

      const auto = (() => {
        if (!explicit0) return fallback
        const clone = { ...(d as unknown as Record<string, unknown>), bounds: undefined } as unknown as T
        return args.computeBoundsAndLabel(clone)
      })()
      const min = computeMinGroupResizeSize({
        minBoundsSizePx,
        explicitBounds: { x: explicit.x, y: explicit.y, w: explicit.width, h: explicit.height },
        autoBounds: { x: auto.x, y: auto.y, w: auto.w, h: auto.h },
      })
      minSize = { w: min.minW, h: min.minH }
    })
    .on('drag', (event) => {
      if (!active || !start || !startWorld) return
      const explicit = (active as unknown as { bounds?: unknown }).bounds
      if (!explicit || typeof explicit !== 'object' || Array.isArray(explicit)) return
      const w1 = readWorldPoint(event)
      if (!w1) return
      const dx = w1.x - startWorld.x
      const dy = w1.y - startWorld.y
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return

      const sourceEvent = (event as any)?.sourceEvent as { altKey?: unknown; target?: unknown } | undefined
      const altDown = !!(sourceEvent && sourceEvent.altKey === true)
      const minW = minSize ? minSize.w : minBoundsSizePx
      const minH = minSize ? minSize.h : minBoundsSizePx
      const target = (sourceEvent?.target || null) as SVGElement | null
      const svgEl = (target?.ownerSVGElement || null) as SVGSVGElement | null
      const k = svgEl ? d3.zoomTransform(svgEl).k : 1
      const adjustedWorld = applyGroupResizeDragSensitivity({
        startWorld,
        world: w1,
        zoomK: k,
        dragSensitivity,
        dragDeadzonePx,
      })
      const next = computeGroupResizeBottomRight({
        startBounds: { x: start.x, y: start.y, w: start.w, h: start.h },
        startWorld,
        world: adjustedWorld,
        minW,
        minH,
        snapGrid: args.snapGrid || null,
        altDown,
      })
      ;(explicit as any).width = next.w
      ;(explicit as any).height = next.h
      const computed = args.computeBoundsAndLabel(active)
      const activeId = String(active.id || '').trim()
      args.applyComputedToGroup(active, computed, activeId, activeId)
    })
    .on('end', () => {
      if (!active) return
      const id = String(active.id || '').trim()
      const explicit = (active as unknown as { bounds?: unknown }).bounds
      if (id && explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
        const bx = typeof (explicit as any).x === 'number' ? (explicit as any).x : Number.NaN
        const by = typeof (explicit as any).y === 'number' ? (explicit as any).y : Number.NaN
        const bw = typeof (explicit as any).width === 'number' ? (explicit as any).width : Number.NaN
        const bh = typeof (explicit as any).height === 'number' ? (explicit as any).height : Number.NaN
        if (Number.isFinite(bx) && Number.isFinite(by) && Number.isFinite(bw) && Number.isFinite(bh) && bw > 0 && bh > 0) {
          args.commitBounds(id, { x: bx, y: by, width: bw, height: bh, labelX: (explicit as any).labelX, labelY: (explicit as any).labelY })
        }
      }
      try {
        args.onResizeActiveGroupIdChange?.(null)
      } catch {
        void 0
      }
      active = null
      start = null
      startWorld = null
      minSize = null
    })

  resizeHandleHitSel
    .on('mousedown', (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
    })
    .on('touchstart', (event: TouchEvent) => {
      event.stopPropagation()
      event.preventDefault()
    })
    .call(dragResize as unknown as d3.DragBehavior<SVGCircleElement, T, unknown>)
}
