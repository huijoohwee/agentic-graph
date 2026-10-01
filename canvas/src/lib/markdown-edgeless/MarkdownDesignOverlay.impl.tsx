import React from 'react'
import * as d3 from 'd3'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { lexMarkdown, buildMarkdownTokensKey } from '@/features/markdown/ui/markdownPreviewLex'
import { patchById } from 'grph-shared/array/patchArrayItem'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import RichMediaPanel from '@/components/RichMediaPanel'
import { buildStaticRichMediaPanelOverlayState } from '@/lib/render/richMediaSsot'
import { buildCardMarkdownPreviewText } from '@/lib/cards/cardMarkdownPreviewUtils'
import { deriveMarkdownDesignLayout, patchMarkdownDesignLayoutPositions, patchMarkdownDesignLayoutRects, MARKDOWN_DESIGN_LAYOUT, type MarkdownDesignBlock, type MarkdownDesignLayout } from '@/features/markdown-edgeless/markdownDesignLayout'
import { resolveMarkdownPanelBlockAspectSize, resolveMarkdownPanelProjection } from '@/features/markdown-edgeless/markdownPanelProjection'
import { readVectorPaintedOverlayScale } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { startMarkdownPanelOverlayLoop2d } from '@/features/markdown-edgeless/markdownPanelOverlayLoop2d'
import { readOverlaySizingConfigForDensity, readOverlaySizingInputFromStoreState } from '@/lib/render/overlaySizing2d'
import {
  computePanelFrameResizeFromDrag16x9,
  readRichMediaPanelFrameMetrics,
  type MediaPanelCssMetrics,
} from '@/lib/render/mediaPanelLayout'
import { resolveWorkspaceVisibleViewport } from '@/lib/zoom/workspaceVisibleViewport'
import { PANEL_FRAME_EMBEDDED_SURFACE_STYLE } from '@/lib/ui/panelFrame'

type MarkdownDesignOverlayProps = {
  enabled: boolean
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  markdownDocumentName: string | null
  markdownDocumentText: string | null
  onPreviewClick?: (line: number) => void
  allowedKinds?: ReadonlyArray<'table' | 'code' | 'blockquote' | 'callout' | 'html'> | null
  layoutOverride?: MarkdownDesignLayout | null
  anchorNodeIdByBlockId?: Record<string, string> | null
  getNodeWorldCenterForId?: (id: string) => { x: number; y: number } | null
  stopEvent?: (e: React.SyntheticEvent) => void
  requestOverlayScheduleRef?: React.MutableRefObject<(() => void) | null>
  onOverlayPanStart?: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onOverlayPan?: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  onOverlayPanEnd?: (args: { pointerId: number }) => void
  onHeaderDragStart?: (args: { id: string; clientX: number; clientY: number }) => void
  onHeaderDrag?: (args: { dx: number; dy: number }) => void
  onHeaderDragEnd?: () => void
  onVisibleNodeIdsChange?: (nodeIds: string[]) => void
}

type MarkdownPanelResizeState = {
  pointerId: number
  blockId: string
  index: number
  startW: number
  startH: number
  startK: number
  frameMetrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
  lastW: number
  lastH: number
}

export const MarkdownDesignOverlay = React.memo(function MarkdownDesignOverlay(props: MarkdownDesignOverlayProps) {
  const { enabled, svgRef, markdownDocumentName, markdownDocumentText, onPreviewClick } = props
  const infiniteCanvasInteractionMode = useGraphStore(s => s.infiniteCanvasInteractionMode)
  const allowEmbeddedContentInteraction = infiniteCanvasInteractionMode === 'interactive'

  const activeDocumentPath = String(markdownDocumentName || '').trim() || 'markdown'
  const markdownText = String(markdownDocumentText || '')

  const deferredMarkdownText = React.useDeferredValue(markdownText)
  const markdownTokensKey = React.useMemo(() => (deferredMarkdownText ? buildMarkdownTokensKey(deferredMarkdownText) : null), [deferredMarkdownText])
  const lexed = React.useMemo(() => (deferredMarkdownText ? lexMarkdown(deferredMarkdownText) : { tokens: [] as any[] }), [deferredMarkdownText])
  const layout = React.useMemo(() => {
    if (props.layoutOverride) return props.layoutOverride
    if (!deferredMarkdownText) return null
    return deriveMarkdownDesignLayout({ activeDocumentPath, markdownTokensKey, tokens: lexed.tokens as never })
  }, [activeDocumentPath, lexed.tokens, deferredMarkdownText, markdownTokensKey, props.layoutOverride])

  const lastLayoutRef = React.useRef<MarkdownDesignLayout | null>(layout)
  React.useEffect(() => {
    if (layout) lastLayoutRef.current = layout
  }, [layout])
  const layoutForRender = layout || lastLayoutRef.current

  const [blocks, setBlocks] = React.useState<MarkdownDesignBlock[]>(layoutForRender?.blocks || [])
  const lastStableBlocksRef = React.useRef<MarkdownDesignBlock[]>(layoutForRender?.blocks || [])
  React.useEffect(() => {
    const next = Array.isArray(layoutForRender?.blocks) ? layoutForRender!.blocks : []
    if (next.length > 0) {
      lastStableBlocksRef.current = next
      setBlocks(next)
      return
    }
    if (!enabled) {
      lastStableBlocksRef.current = []
      setBlocks([])
      return
    }
    if (lastStableBlocksRef.current.length > 0) {
      setBlocks(lastStableBlocksRef.current)
      return
    }
    setBlocks([])
  }, [enabled, layoutForRender?.blocks])

  const blocksRef = React.useRef<MarkdownDesignBlock[]>(blocks)
  React.useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  const anchorByBlockIdRef = React.useRef<Record<string, string> | null>(props.anchorNodeIdByBlockId || null)
  React.useEffect(() => {
    anchorByBlockIdRef.current = props.anchorNodeIdByBlockId || null
  }, [props.anchorNodeIdByBlockId])

  const overlayRefFnByIdRef = React.useRef<Map<string, (el: HTMLElement | null) => void>>(new Map())

  const getOverlayRefForId = React.useCallback(
    (id: string) => {
      const key = String(id || '').trim()
      const cached = overlayRefFnByIdRef.current.get(key)
      if (cached) return cached
      const fn = (el: HTMLElement | null) => {
        if (!el) {
          overlayElsRef.current.delete(key)
          return
        }

        overlayElsRef.current.set(key, el)
      }
      overlayRefFnByIdRef.current.set(key, fn)
      return fn
    },
    [],
  )

  const shouldStartHeaderDrag = React.useCallback((native: PointerEvent) => {
    if (isSpacePanHeld()) return false
    return true
  }, [])

  const markdownSnippetByBlockId = React.useMemo(() => {
    const out = new Map<string, string>()
    const blocks0 = Array.isArray(blocks) ? blocks : []
    for (const b of blocks0) {
      const snippet = buildCardMarkdownPreviewText({ block: b, markdownText: deferredMarkdownText })
      out.set(b.id, snippet)
    }
    return out
  }, [blocks, deferredMarkdownText])

  const overlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())

  const allowedKindsSet = React.useMemo(() => {
    const raw = Array.isArray(props.allowedKinds) ? props.allowedKinds : null
    if (!raw || raw.length === 0) return null
    return new Set(raw)
  }, [props.allowedKinds])

  const allowedKindsRef = React.useRef<Set<string> | null>(allowedKindsSet)
  React.useEffect(() => {
    allowedKindsRef.current = allowedKindsSet
  }, [allowedKindsSet])

  const visibleBlocks = React.useMemo(() => {
    if (!allowedKindsSet) return blocks
    return blocks.filter(b => {
      if (!allowedKindsSet.has(b.type as never)) return false
      if (b.preview.kind !== 'html') return true
      const raw = String(b.preview.html?.raw || '').trim()
      return /<\s*iframe\b/i.test(raw)
    })
  }, [allowedKindsSet, blocks])

  React.useEffect(() => {
    const out = new Set<string>()
    const anchor = anchorByBlockIdRef.current
    for (let i = 0; i < visibleBlocks.length; i += 1) {
      const b = visibleBlocks[i]!
      const id = String(b.id || '').trim()
      if (id) out.add(id)
      const anchorId = String(anchor?.[id] || '').trim()
      if (anchorId) out.add(anchorId)
    }
    try {
      props.onVisibleNodeIdsChange?.(Array.from(out))
    } catch {
      void 0
    }
  }, [props.onVisibleNodeIdsChange, visibleBlocks])

  const blockIdsKey = React.useMemo(() => visibleBlocks.map(b => b.id).join('|'), [visibleBlocks])
  React.useEffect(() => {
    const next = new Map<string, HTMLElement>()
    for (const b of visibleBlocks) {
      const existing = overlayElsRef.current.get(b.id)
      if (existing) next.set(b.id, existing)
    }
    overlayElsRef.current = next
  }, [blockIdsKey, visibleBlocks])

  const [drag, setDrag] = React.useState<null | { pointerId: number; blockId: string }>(null)
  const dragging = drag != null

  const overlayLayoutScheduleRef = React.useRef<null | (() => void)>(null)
  const blockDragLatestRef = React.useRef<null | { blockId: string; index: number; x: number; y: number }>(null)
  const blockDragStartRef = React.useRef<null | { blockId: string; index: number; x: number; y: number }>(null)
  const blockResizeRef = React.useRef<MarkdownPanelResizeState | null>(null)
  const blockDragSchedulerRef = React.useRef(
    createRafValueScheduler((latest: { blockId: string; index: number; x: number; y: number }) => {
      const next = patchById(
        blocksRef.current,
        latest.blockId,
        b => String(b?.id || ''),
        cur => (cur.x === latest.x && cur.y === latest.y ? cur : { ...cur, x: latest.x, y: latest.y }),
        latest.index,
      )
      blocksRef.current = next
      setBlocks(next)
      try {
        overlayLayoutScheduleRef.current?.()
      } catch {
        void 0
      }
    }),
  )
  const blockResizeSchedulerRef = React.useRef(
    createRafValueScheduler((latest: { blockId: string; index: number; w: number; h: number }) => {
      const next = patchById(
        blocksRef.current,
        latest.blockId,
        b => String(b?.id || ''),
        cur => (cur.w === latest.w && cur.h === latest.h ? cur : { ...cur, w: latest.w, h: latest.h }),
        latest.index,
      )
      blocksRef.current = next
      setBlocks(next)
      try {
        overlayLayoutScheduleRef.current?.()
      } catch {
        void 0
      }
    }),
  )

  const beginBlockResize = React.useCallback((blockId: string, pointerId: number) => {
    const index = blocksRef.current.findIndex(x => String(x?.id || '') === blockId)
    const b0 = index >= 0 ? blocksRef.current[index] : null
    if (!b0) return
    const svgNow = svgRef.current
    const t = svgNow ? d3.zoomTransform(svgNow) : null
    const el = overlayElsRef.current.get(blockId) || null
    const startK = el ? readVectorPaintedOverlayScale(el) : t?.k || 1
    const frameMetrics = readRichMediaPanelFrameMetrics(el)
    const startW = Math.max(24, Math.round(Number(b0.w) || 24))
    const density = useGraphStore.getState().mediaPanelDensity === 'compact' ? 'compact' : 'default'
    const startAspectSize = resolveMarkdownPanelBlockAspectSize({ ...b0, w: startW }, density)
    const startH = Math.max(24, Math.round(startAspectSize.h))
    blockResizeRef.current = { pointerId, blockId, index, startW, startH, startK, frameMetrics, lastW: startW, lastH: startH }
    if (el) {
      el.style.width = `${startW}px`
      el.style.height = `${startH}px`
    }
  }, [svgRef])

  const moveBlockResize = React.useCallback((blockId: string, args0: { pointerId: number; dx: number; dy: number }) => {
    const state = blockResizeRef.current
    if (!state || state.blockId !== blockId || state.pointerId !== args0.pointerId) return
    const nextFrame = computePanelFrameResizeFromDrag16x9({
      startW: state.startW,
      startH: state.startH,
      dxClientPx: args0.dx,
      dyClientPx: args0.dy,
      scale: state.startK,
      metrics: state.frameMetrics,
      minPanelW: 24,
      minPanelH: 24,
    })
    const w = Math.max(24, Math.round(nextFrame.panelW))
    const h = Math.max(24, Math.round(nextFrame.panelH))
    state.lastW = w
    state.lastH = h
    const el = overlayElsRef.current.get(blockId) || null
    if (el) {
      el.style.width = `${w}px`
      el.style.height = `${h}px`
    }
    blockResizeSchedulerRef.current.schedule({ blockId, index: state.index, w, h })
  }, [])

  const endBlockResize = React.useCallback((blockId: string, pointerId: number) => {
    const state = blockResizeRef.current
    if (!state || state.blockId !== blockId || state.pointerId !== pointerId) return
    try {
      blockResizeSchedulerRef.current.flush()
    } catch {
      void 0
    }
    blockResizeRef.current = null
    const anchorId = anchorByBlockIdRef.current?.[blockId] || blockId
    const store = useGraphStore.getState()
    const node = store.graphData?.nodes.find(node => node.id === anchorId)
    if (node) {
      store.updateNode(anchorId, { properties: { ...node.properties, 'visual:width': state.lastW, 'visual:height': state.lastH } })
    } else if (layoutForRender && !props.layoutOverride) {
      patchMarkdownDesignLayoutRects({
        layoutKey: layoutForRender.key,
        updates: [{ id: blockId, w: state.lastW, h: state.lastH }],
      })
    }
  }, [layoutForRender, props.layoutOverride])

  React.useEffect(() => {
    if (!dragging) return
    const end = () => {
      try {
        unlockGlobalUserSelect()
      } catch {
        void 0
      }
      blockDragLatestRef.current = null
      blockDragStartRef.current = null
      setDrag(null)
    }
    const onVisibility = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') end()
      } catch {
        void 0
      }
    }
    window.addEventListener('pointerup', end, { capture: true })
    window.addEventListener('pointercancel', end, { capture: true })
    window.addEventListener('blur', end)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerup', end, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('pointercancel', end, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('blur', end)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [dragging])

  const viewportRef = React.useRef<{ w: number; h: number }>({ w: 1, h: 1 })
  const readVisibleOverlayViewport = React.useCallback(() => {
    const viewport = viewportRef.current
    const visible = resolveWorkspaceVisibleViewport({
      viewportW: viewport.w,
      viewportH: viewport.h,
      workspaceEditorOverlayOpen: isWorkspaceEditorOverlayOpen(useGraphStore.getState()),
      surfaceElement: svgRef.current,
    })
    return {
      left: visible.left,
      top: visible.top,
      w: visible.width,
      h: visible.height,
    }
  }, [svgRef])
  React.useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const rect = svgEl.getBoundingClientRect()
      const w = Number.isFinite(rect.width) ? Math.max(1, Math.floor(rect.width)) : 1
      const h = Number.isFinite(rect.height) ? Math.max(1, Math.floor(rect.height)) : 1
      viewportRef.current = { w, h }
      overlayLayoutScheduleRef.current?.()
    })
    ro.observe(svgEl)
    return () => ro.disconnect()
  }, [svgRef])

  React.useEffect(() => {
    const selectWorkspaceOverlayKey = (state: ReturnType<typeof useGraphStore.getState>) =>
      `${state.workspaceViewMode}:${state.workspaceCanvasPaneOpen ? 1 : 0}`
    return useGraphStore.subscribe(
      selectWorkspaceOverlayKey,
      () => overlayLayoutScheduleRef.current?.(),
    )
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    if (!layout) return
    const svgEl = svgRef.current
    if (!svgEl) return

    const getDensity = () => {
      const st = useGraphStore.getState()
      return st.mediaPanelDensity === 'compact' ? 'compact' : 'default'
    }

    const getSizingConfig = () => {
      const st = useGraphStore.getState()
      const density = st.mediaPanelDensity === 'compact' ? 'compact' : 'default'
      return readOverlaySizingConfigForDensity({ density, sizing: readOverlaySizingInputFromStoreState(st) })
    }

    const loop = startMarkdownPanelOverlayLoop2d({
      enabled: true,
      loop: 'onDemand',
      getItems: () => {
        const src = blocksRef.current
        const allow = allowedKindsRef.current
        const anchor = anchorByBlockIdRef.current
        const getCenter = typeof props.getNodeWorldCenterForId === 'function' ? props.getNodeWorldCenterForId : null
        const pick = (b: MarkdownDesignBlock) => resolveMarkdownPanelProjection({
          block: b, density: getDensity(), anchorId: anchor?.[b.id], getCenter })
        if (!allow) return src.map(pick)
        return src.filter(b => allow.has(b.type as never)).map(pick)
      },
      getViewport: readVisibleOverlayViewport,
      readTransform: () => (svgRef.current ? d3.zoomTransform(svgRef.current) : null),
      getElementForId: id => overlayElsRef.current.get(id) || null,
      getDensity,
      getSizingConfig,
      clampToViewport: null,
    })

    overlayLayoutScheduleRef.current = loop.flush
    if (props.requestOverlayScheduleRef) props.requestOverlayScheduleRef.current = loop.flush
    loop.schedule()

    const pointerButtonsDownRef = { current: false }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        pointerButtonsDownRef.current = true
        loop.schedule()
        return
      }
      pointerButtonsDownRef.current = typeof e.buttons === 'number' ? e.buttons !== 0 : true
      loop.schedule()
    }
    const onPointerMove = () => {
      if (!pointerButtonsDownRef.current) return
      loop.schedule()
    }
    const onPointerEnd = () => {
      if (!pointerButtonsDownRef.current) return
      pointerButtonsDownRef.current = false
      loop.schedule()
    }
    const onWheel = () => {
      loop.schedule()
    }

    svgEl.addEventListener('pointerdown', onPointerDown, { passive: true })
    svgEl.addEventListener('pointermove', onPointerMove, { passive: true })
    svgEl.addEventListener('pointerup', onPointerEnd, { passive: true })
    svgEl.addEventListener('pointercancel', onPointerEnd, { passive: true })
    svgEl.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      loop.stop()
      svgEl.removeEventListener('pointerdown', onPointerDown)
      svgEl.removeEventListener('pointermove', onPointerMove)
      svgEl.removeEventListener('pointerup', onPointerEnd)
      svgEl.removeEventListener('pointercancel', onPointerEnd)
      svgEl.removeEventListener('wheel', onWheel)
      if (overlayLayoutScheduleRef.current === loop.flush) {
        overlayLayoutScheduleRef.current = null
      }
      if (props.requestOverlayScheduleRef && props.requestOverlayScheduleRef.current === loop.flush) {
        props.requestOverlayScheduleRef.current = null
      }
    }
  }, [enabled, layout, readVisibleOverlayViewport, svgRef, props.requestOverlayScheduleRef, props.getNodeWorldCenterForId])

  if (!enabled || !layoutForRender || visibleBlocks.length === 0) return null

  return (
    <section aria-label="Design markdown overlay" className="absolute inset-0 z-[70] pointer-events-none">
      {visibleBlocks.map(b => {
        const snippet = markdownSnippetByBlockId.get(b.id) || ''
        const explicitAnchorId = String(anchorByBlockIdRef.current?.[b.id] || '').trim()
        const blockId = String(b.id || '').trim()
        const anchorId = explicitAnchorId || blockId
        const delegateHeaderDrag = Boolean(
          props.getNodeWorldCenterForId?.(anchorId)
          && (props.onHeaderDragStart || props.onHeaderDrag || props.onHeaderDragEnd),
        )
        return (
          <section
            key={b.id}
            ref={getOverlayRefForId(b.id)}
            className={
              [
                'absolute left-0 top-0 pointer-events-auto',
                allowEmbeddedContentInteraction ? '' : 'select-none',
                UI_THEME_TOKENS.panel.border,
              ]
                .filter(Boolean)
                .join(' ')
            }
            role="group"
            data-kg-canvas-wheel-ignore="true"
            data-kg-canvas-pointer-ignore="true"
            data-md-id={b.id}
            data-kg-anchor-node-id={anchorId || undefined}
            data-kg-world-x={b.x}
            data-kg-world-y={b.y}
            data-kg-world-w={b.w}
            data-kg-world-h={b.h}
            aria-label={`Block ${b.title}`}
            style={{
              touchAction: allowEmbeddedContentInteraction ? 'auto' : 'none',
              transform: 'translate(-99999px, -99999px)',
              width: 1,
              height: 1,
            }}
            onClickCapture={props.stopEvent}
            onDoubleClickCapture={props.stopEvent}
            onContextMenuCapture={props.stopEvent}
          >
            <RichMediaPanel
              overlayId={anchorId}
              title={b.title}
              url=""
              kind="iframe"
              panelChrome="storyboardWidget"
              interactive={allowEmbeddedContentInteraction}
              resizable={true}
              onResizeStart={({ pointerId }) => beginBlockResize(b.id, pointerId)}
              onResize={({ pointerId, dx, dy }) => moveBlockResize(b.id, { pointerId, dx, dy })}
              onResizeEnd={({ pointerId }) => endBlockResize(b.id, pointerId)}
              forwardWheelTo={() => svgRef.current}
              forwardWheelBeforeScrollableTarget={true}
              forwardPointerTo={() => svgRef.current}
              shouldForwardPointerDown={() => true}
              shouldStartHeaderDrag={native => shouldStartHeaderDrag(native)}
              onHeaderDragStart={args0 => {
                if (!anchorId) return
                if (delegateHeaderDrag) {
                  props.onHeaderDragStart?.({ id: anchorId, clientX: args0.clientX, clientY: args0.clientY })
                  return
                }
                const b0 = blocksRef.current.find(x => String(x?.id || '') === b.id) || null
                if (!b0) return
                lockGlobalUserSelect()
                setDrag({ pointerId: args0.pointerId, blockId: b.id })
                const index = blocksRef.current.findIndex(x => String(x?.id || '') === b.id)
                const start = { blockId: b.id, index, x: b0.x, y: b0.y }
                blockDragStartRef.current = start
                blockDragLatestRef.current = start
              }}
              onHeaderDrag={args0 => {
                if (delegateHeaderDrag) {
                  props.onHeaderDrag?.({ dx: args0.dx, dy: args0.dy })
                  return
                }
                const start = blockDragStartRef.current
                if (!start || start.blockId !== b.id) return
                const svgNow = svgRef.current
                if (!svgNow) return
                const t = d3.zoomTransform(svgNow)
                const k = typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : 1
                const next = { ...start, x: start.x + args0.dx / k, y: start.y + args0.dy / k }
                blockDragLatestRef.current = next
                blockDragSchedulerRef.current.schedule(next)
              }}
              onHeaderDragEnd={() => {
                if (delegateHeaderDrag) {
                  props.onHeaderDragEnd?.()
                  return
                }
                try {
                  blockDragSchedulerRef.current.flush()
                } catch {
                  void 0
                }
                try {
                  const moved = blocksRef.current.find(x => String(x?.id || '') === b.id) || null
                  if (moved && layoutForRender && !props.layoutOverride) {
                    patchMarkdownDesignLayoutPositions({ layoutKey: layoutForRender.key, updates: [{ id: moved.id, x: moved.x, y: moved.y }] })
                  }
                } finally {
                  blockDragLatestRef.current = null
                  blockDragStartRef.current = null
                  unlockGlobalUserSelect()
                  setDrag(null)
                }
              }}
              onOverlayPanStart={args0 => {
                props.onOverlayPanStart?.(args0)
              }}
              onOverlayPan={props.onOverlayPan}
              onOverlayPanEnd={props.onOverlayPanEnd}
              onDoubleClickCapture={() => {
                onPreviewClick?.(b.startLine)
              }}
              panel={buildStaticRichMediaPanelOverlayState({ activeTab: 'text', text: snippet })}
              style={PANEL_FRAME_EMBEDDED_SURFACE_STYLE}
            />
          </section>
        )
      })}
    </section>
  )
})
