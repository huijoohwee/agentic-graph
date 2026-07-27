import React from 'react'

import { StoryboardWidgetPanelChromeHeader } from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'
import { getStoryboardWidgetPanelSurfaceChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyVectorPaintedOverlayBox } from '@/lib/canvas/vectorPaintedOverlayProjection'
import { activateMultiNodeSelectModeForShift, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'
import { collectSelectedGroupIds, collectSelectedNodeIds } from '@/lib/canvas/selectionGrouping'
import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs, subgraphGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'
import { computeStoryboardWidgetOverlayScreenBox } from '@/lib/storyboardWidget/overlayWorldDrag'

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
  graphData: GraphData | null
  getRuntime: () => FlowNativeRuntime | null
  storyboardWidgetSurfaceId: string
}) {
  const getRuntimeRef = React.useRef(props.getRuntime)
  getRuntimeRef.current = props.getRuntime
  const selectedGroupId = useGraphStore(state => state.selectedGroupId)
  const selectedGroupIds = useGraphStore(state => state.selectedGroupIds)
  const groups = React.useMemo(() => readSubgraphs(props.graphData), [props.graphData])
  const groupById = React.useMemo(() => new Map(groups.map(group => [group.id, group] as const)), [groups])
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
        groups.forEach(group => {
          const groupId = subgraphGroupId(group.id)
          const element = panelElementsRef.current.get(groupId)
          const aabb = runtime.groupAabbByIdCache.get(groupId)
          if (!element || !aabb) return
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
  }, [groups, props.active])

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

  if (!props.active || groups.length === 0) return null
  return (
    <section className="pointer-events-none absolute inset-0 z-[58]" aria-label="Group Panels">
      {groups.map(group => {
        const groupId = subgraphGroupId(group.id)
        const selected = selectedIds.has(groupId)
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
              dragHandle={false}
              showFieldToggle={false}
              showMinimizeToggle={false}
              showPinToggle={false}
              showValidate={false}
            />
            <section className="min-h-0 flex-1" aria-label={`${group.label} grouped content`} />
          </FloatingPanel>
        )
      })}
    </section>
  )
}
