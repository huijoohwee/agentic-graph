import React from 'react'

import { buildFlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'
import { StoryboardWidgetPanelChromeHeader } from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'
import { getStoryboardWidgetPanelSurfaceChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { startRichMediaPanelHeaderDrag } from '@/components/RichMediaPanelOverlayDrag'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  findStoryboardWidgetOverlaySurfaceRoot,
  queryStoryboardWidgetOverlayRootsForSurface,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { applyVectorPaintedOverlayBox } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { activateMultiNodeSelectModeForShift, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'
import { collectSelectedGroupIds, collectSelectedNodeIds } from '@/lib/canvas/selectionGrouping'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readSubgraphs, subgraphGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { isFlowWidgetHeaderDragAllowedByPin } from '@/lib/storyboardWidget/flowWidgetPinMovement'
import type { FlowWidgetPinnedById } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { computeStoryboardWidgetOverlayScreenBox } from '@/lib/storyboardWidget/overlayWorldDrag'
import {
  collectStoryboardGroupPanelMemberNodeIds,
  computeStoryboardGroupPanelRenderedBox,
} from '@/lib/storyboardWidget/renderedGroupPanelBounds'

const GROUP_PANEL_MEMBER_OVERLAY_SELECTOR = [
  '[data-kg-storyboard-fixed-card="1"][data-node-id]',
  STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
].join(', ')

const readGroupDepth = (group: UserSubgraph, byId: ReadonlyMap<string, UserSubgraph>): number => {
  let depth = 0
  let parentId = group.parentId || null
  const visited = new Set<string>()
  while (parentId && depth < 200 && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = byId.get(parentId)?.parentId || null
  }
  return depth
}

export function StoryboardGroupPanelLayer2d(props: {
  active: boolean
  flowWidgetPinnedByNodeId: FlowWidgetPinnedById
  flowWidgetStateGraphKey: string | null
  fallbackNodePositions: ReadonlyMap<string, { x: number; y: number }>
  graphData: GraphData | null
  getRuntime: () => FlowNativeRuntime | null
  onNodeChange: (nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => void
  storyboardWidgetSurfaceId: string
}) {
  const { fallbackNodePositions, graphData, onNodeChange } = props
  const getRuntimeRef = React.useRef(props.getRuntime)
  getRuntimeRef.current = props.getRuntime
  const selectedGroupId = useGraphStore(state => state.selectedGroupId)
  const selectedGroupIds = useGraphStore(state => state.selectedGroupIds)
  const groups = React.useMemo(() => readSubgraphs(props.graphData), [props.graphData])
  const groupById = React.useMemo(() => new Map(groups.map(group => [group.id, group] as const)), [groups])
  const memberNodeIdsByGroupId = React.useMemo(() => new Map(groups.map(group => [
    group.id,
    collectStoryboardGroupPanelMemberNodeIds({
      graphData: props.graphData,
      groupId: group.id,
      groups,
    }),
  ] as const)), [groups, props.graphData])
  const selectedIds = React.useMemo(
    () => new Set(collectSelectedGroupIds(selectedGroupId, selectedGroupIds)),
    [selectedGroupId, selectedGroupIds],
  )
  const panelElementsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const projectedGroupIdsRef = React.useRef<Set<string>>(new Set())
  const [, setProjectionRevision] = React.useState(0)

  const registerPanelElement = React.useCallback((groupId: string, element: HTMLElement | null) => {
    if (element) panelElementsRef.current.set(groupId, element)
    else panelElementsRef.current.delete(groupId)
  }, [])

  React.useEffect(() => {
    if (!props.active || groups.length === 0) {
      if (projectedGroupIdsRef.current.size > 0) {
        projectedGroupIdsRef.current = new Set()
        setProjectionRevision(value => value + 1)
      }
      return
    }
    let frame = 0
    const project = () => {
      const runtime = getRuntimeRef.current()
      const transform = runtime?.transform
      if (runtime && transform && Number.isFinite(transform.k) && transform.k > 0) {
        const devicePixelRatio = Number.isFinite(window.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1
        const nextProjectedGroupIds = new Set<string>()
        const surfaceRoot = findStoryboardWidgetOverlaySurfaceRoot(props.storyboardWidgetSurfaceId)
        const surfaceRect = surfaceRoot?.getBoundingClientRect() || null
        const renderedRectByNodeId = new Map(
          collectCanonicalStoryboardWidgetOverlayRectEntries(
            queryStoryboardWidgetOverlayRootsForSurface({
              surfaceId: props.storyboardWidgetSurfaceId,
              selector: GROUP_PANEL_MEMBER_OVERLAY_SELECTOR,
            }),
          ).map(entry => [entry.id, entry.rect] as const),
        )
        groups.forEach(group => {
          const groupId = subgraphGroupId(group.id)
          const element = panelElementsRef.current.get(groupId)
          if (!element) return
          const renderedBox = group.autoBounds === true && surfaceRect
            ? computeStoryboardGroupPanelRenderedBox({
                surfaceRect,
                memberRects: (memberNodeIdsByGroupId.get(group.id) || [])
                  .map(nodeId => renderedRectByNodeId.get(nodeId))
                  .filter((rect): rect is DOMRect => !!rect),
              })
            : null
          if (renderedBox) {
            applyVectorPaintedOverlayBox(element, {
              ...renderedBox,
              scale: 1,
              zIndex: String(1 + readGroupDepth(group, groupById)),
            })
            nextProjectedGroupIds.add(groupId)
            return
          }
          const aabb = runtime.groupAabbByIdCache.get(groupId)
          if (!aabb) return
          const width = Math.max(1, aabb.maxX - aabb.minX)
          const height = Math.max(1, aabb.maxY - aabb.minY)
          const box = computeStoryboardWidgetOverlayScreenBox({
            transform,
            centerWorld: { x: aabb.minX + width / 2, y: aabb.minY + height / 2 },
            devicePixelRatio,
            snapToDevicePixels: true,
            width,
            height,
          })
          applyVectorPaintedOverlayBox(element, {
            ...box,
            width,
            height,
            zIndex: String(1 + readGroupDepth(group, groupById)),
          })
          nextProjectedGroupIds.add(groupId)
        })
        const previousProjectedGroupIds = projectedGroupIdsRef.current
        const projectionChanged = previousProjectedGroupIds.size !== nextProjectedGroupIds.size
          || Array.from(nextProjectedGroupIds).some(groupId => !previousProjectedGroupIds.has(groupId))
        if (projectionChanged) {
          projectedGroupIdsRef.current = nextProjectedGroupIds
          setProjectionRevision(value => value + 1)
        }
      }
      frame = window.requestAnimationFrame(project)
    }
    frame = window.requestAnimationFrame(project)
    return () => window.cancelAnimationFrame(frame)
  }, [groupById, groups, memberNodeIdsByGroupId, props.active, props.storyboardWidgetSurfaceId])

  const selectGroupPanel = React.useCallback((
    groupId: string,
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) => {
    const state = useGraphStore.getState()
    const mode = activateMultiNodeSelectModeForShift({
      mode: state.schema?.behavior?.selectMode || 'single',
      shiftKey: modifiers.shiftKey,
      setSelectMode: state.setSelectMode,
    })
    state.setSelectionSource('canvas')
    if (resolveNodeSelectionGesture({ mode, ...modifiers }) !== 'toggle') {
      state.selectGroup(groupId)
      return
    }
    const nodeIds = collectSelectedNodeIds(state.selectedNodeId, state.selectedNodeIds)
    const currentGroupIds = collectSelectedGroupIds(state.selectedGroupId, state.selectedGroupIds)
    const groupIds = currentGroupIds.includes(groupId)
      ? currentGroupIds.filter(id => id !== groupId)
      : [...currentGroupIds, groupId]
    state.selectNodesExpanded({ nodeIds, groupIds, activeNodeId: state.selectedNodeId })
  }, [])

  const collectNestedMemberNodeIds = React.useCallback((groupId: string): string[] => {
    return memberNodeIdsByGroupId.get(groupId) || []
  }, [memberNodeIdsByGroupId])

  const beginGroupPanelHeaderDrag = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    group: UserSubgraph,
  ) => {
    if (event.button !== 0) return
    const memberNodeIds = collectNestedMemberNodeIds(group.id)
    if (memberNodeIds.length === 0) return
    const state = useGraphStore.getState()
    disableAutoZoomModesForUserGesture(state)
    const graphNodes = new Map(
      (state.graphData?.nodes || []).map(node => [String(node.id || '').trim(), node] as const),
    )
    const runtimeNodes = getRuntimeRef.current()?.scene?.nodeById
    const startByNodeId = new Map<string, Pick<GraphNode, 'x' | 'y'>>()
    memberNodeIds.forEach(nodeId => {
      const graphNode = graphNodes.get(nodeId)
      const runtimeNode = runtimeNodes?.get(nodeId)
      const fallbackPosition = fallbackNodePositions.get(nodeId)
      const x = Number.isFinite(graphNode?.x)
        ? Number(graphNode?.x)
        : Number.isFinite(runtimeNode?.x)
          ? Number(runtimeNode?.x)
          : Number(fallbackPosition?.x)
      const y = Number.isFinite(graphNode?.y)
        ? Number(graphNode?.y)
        : Number.isFinite(runtimeNode?.y)
          ? Number(runtimeNode?.y)
          : Number(fallbackPosition?.y)
      if (Number.isFinite(x) && Number.isFinite(y)) startByNodeId.set(nodeId, { x, y })
    })
    if (startByNodeId.size === 0) return
    let moved = false
    const moveScheduler = createRafValueScheduler((delta: { worldDx: number; worldDy: number }) => {
      startByNodeId.forEach((start, nodeId) => {
        onNodeChange(nodeId, {
          x: Number(start.x) + delta.worldDx,
          y: Number(start.y) + delta.worldDy,
        }, graphData)
      })
    })
    const started = startRichMediaPanelHeaderDrag(event.nativeEvent, {
      shouldStartHeaderDrag: native => native.button === 0,
      onHeaderDrag: ({ dx, dy }) => {
        const zoomK = getRuntimeRef.current()?.transform?.k
        const scale = typeof zoomK === 'number' && Number.isFinite(zoomK) && zoomK > 0 ? zoomK : 1
        const worldDx = dx / scale
        const worldDy = dy / scale
        moved = moved || Math.abs(worldDx) >= 0.25 || Math.abs(worldDy) >= 0.25
        moveScheduler.schedule({ worldDx, worldDy })
      },
      onHeaderDragEnd: () => {
        moveScheduler.flush()
        if (moved) useGraphStore.getState().addHistory('Group panel move')
      },
    }, event.currentTarget)
    if (!started) return
    selectGroupPanel(subgraphGroupId(group.id), event)
    event.preventDefault()
    event.stopPropagation()
  }, [collectNestedMemberNodeIds, fallbackNodePositions, graphData, onNodeChange, selectGroupPanel])

  if (!props.active || groups.length === 0) return null
  return (
    <section className="pointer-events-none absolute inset-0 z-[58]" aria-label="Group Panels">
      {groups.map(group => {
        const groupId = subgraphGroupId(group.id)
        const selected = selectedIds.has(groupId)
        const headerPinProps = buildFlowCanvasHeaderPinProps({
          enabled: props.active,
          flowWidgetPinnedByNodeId: props.flowWidgetPinnedByNodeId,
          flowWidgetStateGraphKey: props.flowWidgetStateGraphKey,
          nodeId: groupId,
          stopEvent: event => event.stopPropagation(),
        })
        const groupMoveEnabled = isFlowWidgetHeaderDragAllowedByPin({
          pinnedInCanvas: headerPinProps.headerPinned === true,
        })
        return (
          <FloatingPanel
            key={group.id}
            ref={element => registerPanelElement(groupId, element)}
            as="article"
            role="group"
            ariaLabel={`Group Panel: ${group.label}`}
            className={getStoryboardWidgetPanelSurfaceChromeClassName({
              selected,
              className: 'pointer-events-auto absolute overflow-hidden bg-[color:color-mix(in_srgb,var(--kg-media-panel-bg)_42%,transparent)] shadow-sm',
            })}
            data-kg-group-panel="1"
            data-kg-group-panel-id={group.id}
            data-kg-group-panel-group-id={groupId}
            data-kg-group-panel-pinned={headerPinProps.headerPinned === true ? '1' : '0'}
            data-kg-canvas-selectable-surface="group-panel"
            data-kg-overlay-pan-owner="canvas"
            data-kg-storyboard-widget-surface={props.storyboardWidgetSurfaceId}
            data-node-id={groupId}
            data-selected={selected ? 'true' : 'false'}
            style={{
              zIndex: 1 + readGroupDepth(group, groupById),
              visibility: projectedGroupIdsRef.current.has(groupId) ? 'visible' : 'hidden',
            }}
            onPointerDown={event => {
              selectGroupPanel(groupId, event)
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                event.stopPropagation()
              }
            }}
          >
            <StoryboardWidgetPanelChromeHeader
              active
              title={group.label}
              actionsAriaLabel="Group Panel"
              dragHandle={groupMoveEnabled}
              onHeaderPointerDown={groupMoveEnabled ? event => beginGroupPanelHeaderDrag(event, group) : undefined}
              pinned={headerPinProps.headerPinned === true}
              showFieldToggle={false}
              showMinimizeToggle={false}
              showPinToggle={selected && typeof headerPinProps.onHeaderTogglePinned === 'function'}
              showValidate={false}
              onPinnedPointerDown={headerPinProps.onHeaderPinnedPointerDown}
              onTogglePinned={headerPinProps.onHeaderTogglePinned}
            />
            <section className="min-h-0 flex-1" aria-label={`${group.label} grouped content`} />
          </FloatingPanel>
        )
      })}
    </section>
  )
}
