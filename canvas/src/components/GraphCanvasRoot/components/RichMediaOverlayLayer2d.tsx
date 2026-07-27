import React, { type RefObject, type SyntheticEvent } from 'react'
import { buildFlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'
import { WidgetEditorActionsToolbar } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { buildSharedRichMediaOverlayControlProps, buildSharedRichMediaOverlayToolbarProps } from '@/components/StoryboardWidget/richMediaOverlayToolbarProps'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { Z_INDEX_GRAPH_MEDIA_LAYER } from '@/lib/ui/zIndex'
import RichMediaPanel from '@/components/RichMediaPanel'
import { RichMediaOutputVersionSelector } from '@/components/RichMediaOutputVersionSelector'
import type { MediaOverlayNode } from '@/lib/render/mediaOverlayPool'
import { createUniqueId } from '@/lib/ids'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { commitRichMediaPanelChange, resolveRichMediaPanelInteractive } from '@/lib/render/richMediaSsot'
import { resolveCanvasAspectRatioResizeSize, resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { readFlowWidgetPinnedInCanvas } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { isFlowWidgetHeaderDragAllowedByPin } from '@/lib/storyboardWidget/flowWidgetPinMovement'
import { resolveFlowWidgetStateGraphKey, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { lsSetBool } from '@/lib/persistence'
import { LS_KEYS } from '@/lib/config'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
type RichMediaResizeState = {
  id: string
  pointerId: number
  startW: number
  startH: number
  lastW: number
  lastH: number
}

function readGraphNodePropertiesFromStore(nodeId: string): Record<string, unknown> {
  const id = String(nodeId || '').trim()
  if (!id) return {}
  const graphData = (useGraphStore.getState() as { graphData?: { nodes?: GraphNode[] } | null }).graphData
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    if (String(n?.id || '').trim() !== id) continue
    const props = n?.properties
    return props && typeof props === 'object' && !Array.isArray(props) ? { ...(props as Record<string, unknown>) } : {}
  }
  return {}
}

export function RichMediaOverlayLayer2d(props: {
  active: boolean
  mediaOverlayNodes: MediaOverlayNode[]
  getOverlayRefForId: (id: string) => (el: HTMLElement | null) => void
  svgRef: RefObject<SVGSVGElement | null>
  renderMediaAsNodes: boolean
  stopEvent: (event: SyntheticEvent) => void
  onOverlayPanStart: (args: { pointerId: number; clientX: number; clientY: number }) => void
  onOverlayPan: (args: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => void
  onOverlayPanEnd: (args: { pointerId: number }) => void
  onHeaderDragStart: (args: { id: string; clientX: number; clientY: number }) => void
  onHeaderDrag: (args: { clientX: number; clientY: number; dx: number; dy: number }) => void
  onHeaderDragEnd: () => void
  requestMediaOverlaySchedule?: () => void
}) {
  const {
    active,
    mediaOverlayNodes,
    getOverlayRefForId,
    svgRef,
    renderMediaAsNodes,
    stopEvent,
    onOverlayPanStart,
    onOverlayPan,
    onOverlayPanEnd,
    onHeaderDragStart,
    onHeaderDrag,
    onHeaderDragEnd,
    requestMediaOverlaySchedule,
  } = props

  const overlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const overlayRefFnByIdRef = React.useRef<Map<string, (el: HTMLElement | null) => void>>(new Map())
  const resizeRef = React.useRef<RichMediaResizeState | null>(null)
  const infiniteCanvasInteractionMode = useGraphStore(s => s.infiniteCanvasInteractionMode)
  const addNode = useGraphStore(s => s.addNode)
  const addHistory = useGraphStore(s => s.addHistory)
  const removeNode = useGraphStore(s => s.removeNode)
  const selectNode = useGraphStore(s => s.selectNode)
  const graphData = useGraphStore(s => s.graphData)
  const flowWidgetPinnedByNodeId = useGraphStore(s => s.flowWidgetPinnedByNodeId)
  const flowWidgetPinnedByNodeIdByGraphMetaKey = useGraphStore(s => s.flowWidgetPinnedByNodeIdByGraphMetaKey)
  const selectedNodeId = useGraphStore(s => String(s.selectedNodeId || '').trim())
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds)
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const updateNode = useGraphStore(s => s.updateNode)
  const updateOpenWidgetNodeIds = useGraphStore(s => s.updateOpenWidgetNodeIds)
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const allowEmbeddedMediaInteraction = infiniteCanvasInteractionMode === 'interactive'
  const flowWidgetStateGraphKey = React.useMemo(() => resolveFlowWidgetStateGraphKey({ graphData }), [graphData])
  const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({
    graphMetaKey: flowWidgetStateGraphKey,
    keyedByGraphMetaKey: flowWidgetPinnedByNodeIdByGraphMetaKey,
    globalByNodeId: flowWidgetPinnedByNodeId,
  }), [flowWidgetPinnedByNodeId, flowWidgetPinnedByNodeIdByGraphMetaKey, flowWidgetStateGraphKey])
  const [activePanelId, setActivePanelId] = React.useState('')

  const selectPanel = React.useCallback((id: string, additive = false) => {
    const key = String(id || '').trim()
    if (!key) return
    setActivePanelId(key)
    setSelectionSource('canvas')
    if (additive) {
      useGraphStore.getState().toggleNodeSelectionAdditive(key)
      return
    }
    const state = useGraphStore.getState()
    const mode = state.schema?.behavior?.selectMode || 'single'
    if (mode === 'multi' || mode === 'lasso') {
      state.selectNodesExpanded({ nodeIds: [key], activeNodeId: key })
      return
    }
    selectNode(key)
  }, [selectNode, setSelectionSource])

  const openPanelInSidepane = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return
    selectPanel(key)
    updateOpenWidgetNodeIds(prev => (prev.includes(key) ? prev : [...prev, key]))
  }, [selectPanel, updateOpenWidgetNodeIds])

  const duplicatePanel = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return
    const graphData = (useGraphStore.getState() as { graphData?: GraphData | null }).graphData
    const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
    const node = nodes.find(item => String(item?.id || '').trim() === key)
    if (!node) return
    const usedIds = new Set(nodes.map(item => String(item?.id || '').trim()).filter(Boolean))
    const nextId = createUniqueId('n', usedIds)
    addNode({
      ...node,
      id: nextId,
      label: `${String(node.label || 'Rich Media Panel').trim()} Copy`,
      x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x + 32 : 32,
      y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y + 32 : 32,
      fx: undefined,
      fy: undefined,
      properties: { ...((node.properties || {}) as Record<string, unknown>) } as never,
    })
    addHistory('Rich Media duplicate')
  }, [addHistory, addNode])

  const removePanel = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return
    setActivePanelId(prev => (prev === key ? '' : prev))
    removeNode(key)
    updateOpenWidgetNodeIds(prev => prev.filter(nodeId => String(nodeId || '').trim() !== key))
    requestMediaOverlaySchedule?.()
    addHistory('Rich Media remove')
  }, [addHistory, removeNode, requestMediaOverlaySchedule, updateOpenWidgetNodeIds])

  const getPanelRefForId = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return () => void 0
    const cached = overlayRefFnByIdRef.current.get(key)
    if (cached) return cached
    const outerRef = getOverlayRefForId(key)
    const fn = (el: HTMLElement | null) => {
      if (el) overlayElsRef.current.set(key, el)
      else overlayElsRef.current.delete(key)
      outerRef(el as HTMLElement | null)
    }
    overlayRefFnByIdRef.current.set(key, fn)
    return fn
  }, [getOverlayRefForId])

  const beginResize = React.useCallback((id: string, pointerId: number) => {
    const el = overlayElsRef.current.get(id) || null
    const rect = el?.getBoundingClientRect()
    const measuredW = rect && Number.isFinite(rect.width) ? Math.max(24, Math.round(rect.width)) : 0
    const measuredH = rect && Number.isFinite(rect.height) ? Math.max(24, Math.round(rect.height)) : 0
    const baseProps = readGraphNodePropertiesFromStore(id)
    const storedW = Number(baseProps['visual:width'])
    const startW = Number.isFinite(storedW) && storedW > 0 ? Math.max(24, Math.round(storedW)) : Math.max(24, measuredW)
    const aspectSize = resolveCanvasAspectRatioSize({
      defaultWidth: Math.max(24, measuredW || startW),
      mode: strybldrStoryboardCardAspectMode,
      width: startW,
    })
    const startH = Math.max(24, Math.round(aspectSize.height || measuredH))
    resizeRef.current = { id, pointerId, startW, startH, lastW: startW, lastH: startH }
    if (el) {
      el.style.width = `${startW}px`
      el.style.height = `${startH}px`
    }
  }, [strybldrStoryboardCardAspectMode])

  const moveResize = React.useCallback((id: string, payload: { pointerId: number; dx: number; dy: number }) => {
    const drag = resizeRef.current
    if (!drag || drag.id !== id || drag.pointerId !== payload.pointerId) return
    const next = resolveCanvasAspectRatioResizeSize({
      startWidth: drag.startW,
      startHeight: drag.startH,
      deltaX: payload.dx,
      deltaY: payload.dy,
      minWidth: 24,
      mode: strybldrStoryboardCardAspectMode,
    })
    const nextW = Math.max(24, Math.round(next.width))
    const nextH = Math.max(24, Math.round(next.height))
    drag.lastW = nextW
    drag.lastH = nextH
    const el = overlayElsRef.current.get(id) || null
    if (el) {
      el.style.width = `${nextW}px`
      el.style.height = `${nextH}px`
    }
  }, [strybldrStoryboardCardAspectMode])

  const endResize = React.useCallback((id: string, pointerId: number) => {
    const drag = resizeRef.current
    if (!drag || drag.id !== id || drag.pointerId !== pointerId) return
    resizeRef.current = null
    const baseProps = readGraphNodePropertiesFromStore(id)
    updateNode(id, {
      properties: {
        ...baseProps,
        'visual:width': drag.lastW,
        'visual:height': drag.lastH,
      },
    } as Partial<GraphNode>)
    requestMediaOverlaySchedule?.()
  }, [requestMediaOverlaySchedule, updateNode])

  if (!active) return null
  if (mediaOverlayNodes.length === 0) return null

  return (
    <section
      aria-label="D3 rich media overlay"
      className={UI_RESPONSIVE_PASSIVE_FILL_SURFACE_CLASSNAME}
      style={{ zIndex: Z_INDEX_GRAPH_MEDIA_LAYER }}
    >
      {mediaOverlayNodes.map(n => {
        const kind = n.kind === 'iframe' || n.kind === 'image' || n.kind === 'svg' || n.kind === 'video' || n.kind === 'audio' || n.kind === 'model' ? n.kind : undefined
        const selected = isCanonicalNodeIdEqual(activePanelId, n.id)
          || isCanonicalNodeIdEqual(selectedNodeId, n.id)
          || (Array.isArray(selectedNodeIds) && selectedNodeIds.some(id => isCanonicalNodeIdEqual(id, n.id)))
        const richMediaPanelPinned = readFlowWidgetPinnedInCanvas(effectiveFlowWidgetPinnedByNodeId, n.id)
        const richMediaPanelPinAllowsMovement = isFlowWidgetHeaderDragAllowedByPin({
          pinnedInCanvas: richMediaPanelPinned,
        })
        const richMediaPanelMoveEnabled = richMediaPanelPinAllowsMovement
        const richMediaPanelOverlayPanEnabled = richMediaPanelPinAllowsMovement
        const headerPinProps = buildFlowCanvasHeaderPinProps({
          enabled: true,
          flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId,
          flowWidgetStateGraphKey,
          nodeId: n.id,
          onPinnedChange: () => requestMediaOverlaySchedule?.(),
          stopEvent,
        })
        const changePanel = (next: import('@/lib/render/richMediaSsot').RichMediaPanelChange) => commitRichMediaPanelChange({
          nodeId: n.id,
          next,
          updateNode: (id, patch) => updateNode(id, patch as Partial<GraphNode>),
        })
        const toolbarControlProps = buildSharedRichMediaOverlayControlProps({
          onSwitchToKtvRows: () => {
            lsSetBool(LS_KEYS.flowWidgetRichMediaKtvRows, true)
            openPanelInSidepane(n.id)
          },
        })
        return (
          <section
            key={n.id}
            ref={getPanelRefForId(n.id)}
            className="absolute left-0 top-0 pointer-events-none overflow-visible"
            data-kg-rich-media-overlay-shell="1"
            data-kg-rich-media-overlay-shell-id={n.id}
            data-kg-rich-media-overlay-pinned={richMediaPanelPinned ? '1' : '0'}
          >
            <WidgetEditorActionsToolbar
              visible={selected}
              {...buildSharedRichMediaOverlayToolbarProps()}
              {...toolbarControlProps}
              outputVersionControl={(
                <RichMediaOutputVersionSelector
                  panel={n.panel}
                  onPanelChange={n.panel ? changePanel : undefined}
                  placement="toolbar"
                />
              )}
              onRun={() => void 0}
              onOpenInSidepane={() => openPanelInSidepane(n.id)}
              onDuplicate={() => duplicatePanel(n.id)}
              onClearOutput={() => void 0}
              onHelp={() => void 0}
              onRemove={() => removePanel(n.id)}
              onConvertToLoopNode={() => void 0}
            />
            <RichMediaPanel
              overlayId={n.id}
              className="relative h-full w-full pointer-events-auto"
              title={n.title}
              url={n.url}
              srcDoc={n.srcDoc}
              openUrl={n.openUrl}
              kind={kind}
              renderMode={n.renderMode}
              selected={selected}
              panelChrome="storyboardWidget"
              outputVersionPlacement="bubble-toolbar"
              placementOwner="parent"
              canvasOverlayPinned={richMediaPanelPinned}
              {...headerPinProps}
              interactive={resolveRichMediaPanelInteractive({
                nodeInteractive: n.interactive,
                renderMediaAsNodes,
                infiniteCanvasInteractionMode,
                canvasRenderMode: '2d',
              })}
              panel={n.panel}
              onPanelChange={n.panel ? changePanel : undefined}
              forwardWheelTo={allowEmbeddedMediaInteraction ? undefined : (() => svgRef.current)}
              forwardWheelBeforeScrollableTarget={!allowEmbeddedMediaInteraction}
              forwardPointerTo={() => svgRef.current}
              shouldForwardPointerDown={() => !allowEmbeddedMediaInteraction}
              shouldStartHeaderDrag={() => {
                if (isSpacePanHeld()) return false
                return richMediaPanelMoveEnabled
              }}
              onOverlayPanStart={richMediaPanelOverlayPanEnabled ? ({ pointerId, clientX, clientY, buttons }) => {
                if ((buttons & 1) !== 1 && (buttons & 4) !== 4) return
                selectPanel(n.id)
                onOverlayPanStart({ pointerId, clientX, clientY })
              } : undefined}
              onOverlayPan={richMediaPanelOverlayPanEnabled ? ({ pointerId, clientX, clientY, dx, dy }) => onOverlayPan({ pointerId, clientX, clientY, dx, dy }) : undefined}
              onOverlayPanEnd={richMediaPanelOverlayPanEnabled ? ({ pointerId }) => onOverlayPanEnd({ pointerId }) : undefined}
              onHeaderDragStart={richMediaPanelMoveEnabled ? ({ clientX, clientY }) => {
                selectPanel(n.id)
                onHeaderDragStart({ id: n.id, clientX, clientY })
              } : undefined}
              onHeaderDrag={richMediaPanelMoveEnabled ? ({ clientX, clientY, dx, dy }) => onHeaderDrag({ clientX, clientY, dx, dy }) : undefined}
              onHeaderDragEnd={richMediaPanelMoveEnabled ? () => onHeaderDragEnd() : undefined}
              resizable={true}
              onResizeStart={({ pointerId }) => beginResize(n.id, pointerId)}
              onResize={({ pointerId, dx, dy }) => moveResize(n.id, { pointerId, dx, dy })}
              onResizeEnd={({ pointerId }) => endResize(n.id, pointerId)}
              onClickCapture={(event) => {
                selectPanel(n.id, event.shiftKey)
                stopEvent(event)
              }}
              onDoubleClickCapture={stopEvent}
              onContextMenuCapture={stopEvent}
            />
          </section>
        )
      })}
    </section>
  )
}
